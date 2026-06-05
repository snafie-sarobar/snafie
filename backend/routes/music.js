const express = require('express');
const router = express.Router();

module.exports = function({ pool, authenticateToken, upload, redisClient }) {

  router.post('/upload', authenticateToken, upload.single('audio'), async (req, res) => {
    const { title, artist, album, genre } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO music_library (user_id, title, artist, album, genre, file_url, file_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, title || req.file.originalname, artist || 'Unknown Artist', album || 'Unknown Album', genre || 'Other', `/uploads/${req.file.filename}`, req.file.size]
      );

      await redisClient.del(`music:user:${req.user.id}`);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload song' });
    }
  });

  router.get('/library', authenticateToken, async (req, res) => {
    const { page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const cacheKey = `music:user:${req.user.id}:${page}:${limit}:${sort}:${order}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const allowedSorts = ['title', 'artist', 'album', 'created_at', 'play_count', 'likes_count'];
      const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
      const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

      const result = await pool.query(
        `SELECT ml.*, COALESCE(ul.user_id IS NOT NULL, false) as is_liked
         FROM music_library ml
         LEFT JOIN user_likes ul ON ul.song_id = ml.id AND ul.user_id = $1
         WHERE ml.user_id = $1 OR ml.is_public = true
         ORDER BY ml.${sortCol} ${sortOrder}
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      const countResult = await pool.query(
        'SELECT COUNT(*) FROM music_library WHERE user_id = $1 OR is_public = true',
        [req.user.id]
      );

      const response = {
        songs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count)
        }
      };

      await redisClient.setEx(cacheKey, 60, JSON.stringify(response));

      res.json(response);
    } catch (error) {
      console.error('Library fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch library' });
    }
  });

  router.get('/song/:id', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ml.*, u.username as uploaded_by,
         COALESCE((SELECT true FROM user_likes WHERE song_id = ml.id AND user_id = $1), false) as is_liked
         FROM music_library ml
         JOIN users u ON u.id = ml.user_id
         WHERE ml.id = $2 AND (ml.user_id = $1 OR ml.is_public = true)`,
        [req.user.id, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Song not found' });
      }

      await pool.query(
        'UPDATE music_library SET play_count = play_count + 1 WHERE id = $1',
        [req.params.id]
      );

      await pool.query(
        'INSERT INTO recently_played (user_id, song_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.id, req.params.id]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch song' });
    }
  });

  router.delete('/song/:id', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM music_library WHERE id = $1 AND user_id = $2 RETURNING *',
        [req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Song not found or unauthorized' });
      }

      await redisClient.del(`music:user:${req.user.id}`);

      res.json({ success: true, message: 'Song deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete song' });
    }
  });

  router.post('/song/:id/like', authenticateToken, async (req, res) => {
    try {
      const existing = await pool.query(
        'SELECT * FROM user_likes WHERE user_id = $1 AND song_id = $2',
        [req.user.id, req.params.id]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          'DELETE FROM user_likes WHERE user_id = $1 AND song_id = $2',
          [req.user.id, req.params.id]
        );
        await pool.query('UPDATE music_library SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1', [req.params.id]);
        return res.json({ success: true, liked: false });
      }

      await pool.query(
        'INSERT INTO user_likes (user_id, song_id) VALUES ($1, $2)',
        [req.user.id, req.params.id]
      );
      await pool.query('UPDATE music_library SET likes_count = likes_count + 1 WHERE id = $1', [req.params.id]);

      res.json({ success: true, liked: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  });

  router.post('/playlists', authenticateToken, async (req, res) => {
    const { name, description, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Playlist name required' });
    }

    try {
      const result = await pool.query(
        'INSERT INTO playlists (user_id, name, description, is_public) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.id, name, description || '', isPublic || false]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create playlist' });
    }
  });

  router.get('/playlists', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT p.*,
          (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as song_count,
          (SELECT ml.cover_url FROM playlist_songs ps
           JOIN music_library ml ON ml.id = ps.song_id
           WHERE ps.playlist_id = p.id ORDER BY ps.position LIMIT 1) as cover_url
         FROM playlists p
         WHERE p.user_id = $1 OR p.is_public = true
         ORDER BY p.updated_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch playlists' });
    }
  });

  router.get('/playlists/:id', authenticateToken, async (req, res) => {
    try {
      const playlist = await pool.query(
        'SELECT * FROM playlists WHERE id = $1 AND (user_id = $2 OR is_public = true)',
        [req.params.id, req.user.id]
      );

      if (playlist.rows.length === 0) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      const songs = await pool.query(
        `SELECT ml.*, ps.position, ps.added_at, ps.added_by,
         u.username as added_by_name,
         COALESCE((SELECT true FROM user_likes WHERE song_id = ml.id AND user_id = $1), false) as is_liked
         FROM playlist_songs ps
         JOIN music_library ml ON ml.id = ps.song_id
         LEFT JOIN users u ON u.id = ps.added_by
         WHERE ps.playlist_id = $2
         ORDER BY ps.position ASC`,
        [req.user.id, req.params.id]
      );

      res.json({ ...playlist.rows[0], songs: songs.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch playlist' });
    }
  });

  router.post('/playlists/:id/songs', authenticateToken, async (req, res) => {
    const { songId } = req.body;

    if (!songId) {
      return res.status(400).json({ error: 'Song ID required' });
    }

    try {
      const playlist = await pool.query(
        'SELECT * FROM playlists WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );

      if (playlist.rows.length === 0) {
        return res.status(404).json({ error: 'Playlist not found or unauthorized' });
      }

      const maxPos = await pool.query(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM playlist_songs WHERE playlist_id = $1',
        [req.params.id]
      );

      await pool.query(
        'INSERT INTO playlist_songs (playlist_id, song_id, position, added_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [req.params.id, songId, maxPos.rows[0].next_pos, req.user.id]
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add song to playlist' });
    }
  });

  router.delete('/playlists/:playlistId/songs/:songId', authenticateToken, async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2 AND playlist_id IN (SELECT id FROM playlists WHERE user_id = $3)',
        [req.params.playlistId, req.params.songId, req.user.id]
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove song from playlist' });
    }
  });

  router.delete('/playlists/:id', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM playlists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete playlist' });
    }
  });

  router.get('/search', authenticateToken, async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const offset = (page - 1) * limit;

    try {
      const result = await pool.query(
        `SELECT ml.*, u.username as uploaded_by,
         COALESCE((SELECT true FROM user_likes WHERE song_id = ml.id AND user_id = $1), false) as is_liked
         FROM music_library ml
         JOIN users u ON u.id = ml.user_id
         WHERE (ml.user_id = $1 OR ml.is_public = true)
         AND (ml.title ILIKE $4 OR ml.artist ILIKE $4 OR ml.album ILIKE $4)
         ORDER BY ml.play_count DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset, `%${q}%`]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM music_library
         WHERE (user_id = $1 OR is_public = true)
         AND (title ILIKE $2 OR artist ILIKE $2 OR album ILIKE $2)`,
        [req.user.id, `%${q}%`]
      );

      res.json({
        songs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Search failed' });
    }
  });

  router.get('/recently-played', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (rp.song_id) ml.*, rp.played_at
         FROM recently_played rp
         JOIN music_library ml ON ml.id = rp.song_id
         WHERE rp.user_id = $1
         ORDER BY rp.song_id, rp.played_at DESC
         LIMIT 50`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch recently played' });
    }
  });

  router.get('/genres', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT genre, COUNT(*) as count FROM music_library GROUP BY genre ORDER BY count DESC'
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch genres' });
    }
  });

  router.post('/play-count/:id', async (req, res) => {
    try {
      await pool.query('UPDATE music_library SET play_count = play_count + 1 WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update play count' });
    }
  });

  return router;
};
