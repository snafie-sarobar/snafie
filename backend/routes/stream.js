const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = function({ pool, authenticateToken, upload, io }) {

  router.post('/create', authenticateToken, async (req, res) => {
    const { title, description, category, tags, scheduledFor } = req.body;
    const streamKey = crypto.randomBytes(32).toString('hex');

    try {
      const result = await pool.query(
        `INSERT INTO live_streams (user_id, stream_key, title, description, category, tags, scheduled_for)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, streamKey, title || 'Untitled Stream', description || '', category || 'Just Chatting', tags || [], scheduledFor || null]
      );

      const stream = result.rows[0];

      res.json({
        success: true,
        stream,
        rtmpUrl: `rtmp://${process.env.RTMP_HOST || req.hostname}/live/${streamKey}`,
        streamKey: stream.stream_key,
        streamId: stream.id
      });
    } catch (error) {
      console.error('Create stream error:', error);
      res.status(500).json({ error: 'Failed to create stream' });
    }
  });

  router.post('/go-live/:streamId', authenticateToken, async (req, res) => {
    try {
      const stream = await pool.query(
        'SELECT * FROM live_streams WHERE id = $1 AND user_id = $2',
        [req.params.streamId, req.user.id]
      );

      if (stream.rows.length === 0) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      if (stream.rows[0].is_live) {
        return res.status(400).json({ error: 'Stream is already live' });
      }

      await pool.query(
        'UPDATE live_streams SET is_live = true, started_at = NOW() WHERE id = $1',
        [req.params.streamId]
      );

      io.emit('stream:started', {
        streamId: parseInt(req.params.streamId),
        userId: req.user.id,
        username: req.user.username,
        title: stream.rows[0].title,
        category: stream.rows[0].category
      });

      res.json({ success: true, message: 'Stream is now live' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to go live' });
    }
  });

  router.post('/end/:streamId', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE live_streams SET is_live = false, ended_at = NOW(),
         total_views = viewer_count + total_views
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.streamId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      io.emit('stream:ended', {
        streamId: parseInt(req.params.streamId),
        userId: req.user.id,
        duration: Math.floor((Date.now() - new Date(result.rows[0].started_at).getTime()) / 1000)
      });

      res.json({ success: true, stream: result.rows[0] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to end stream' });
    }
  });

  router.put('/:streamId', authenticateToken, async (req, res) => {
    const { title, description, category, tags } = req.body;

    try {
      const updates = [];
      const values = [];
      let idx = 1;

      if (title) { updates.push(`title = $${idx++}`); values.push(title); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
      if (category) { updates.push(`category = $${idx++}`); values.push(category); }
      if (tags) { updates.push(`tags = $${idx++}`); values.push(tags); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.params.streamId, req.user.id);

      const result = await pool.query(
        `UPDATE live_streams SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update stream' });
    }
  });

  router.get('/live', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ls.id, ls.title, ls.description, ls.category, ls.tags, ls.viewer_count, ls.started_at,
                ls.thumbnail_url, u.id as user_id, u.username, u.avatar
         FROM live_streams ls
         JOIN users u ON ls.user_id = u.id
         WHERE ls.is_live = true
         ORDER BY ls.viewer_count DESC, ls.started_at DESC`
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch live streams' });
    }
  });

  router.get('/featured', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ls.id, ls.title, ls.description, ls.category, ls.tags, ls.viewer_count, ls.started_at,
                ls.thumbnail_url, ls.total_views, u.id as user_id, u.username, u.avatar
         FROM live_streams ls
         JOIN users u ON ls.user_id = u.id
         WHERE ls.is_live = true
         ORDER BY ls.viewer_count DESC, ls.total_views DESC
         LIMIT 10`
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch featured streams' });
    }
  });

  router.get('/my-streams', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM live_streams WHERE user_id = $1 ORDER BY created_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch your streams' });
    }
  });

  router.get('/:streamId', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ls.*, u.username, u.avatar, u.bio
         FROM live_streams ls
         JOIN users u ON ls.user_id = u.id
         WHERE ls.id = $1`,
        [req.params.streamId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      if (result.rows[0].is_live) {
        await pool.query(
          'UPDATE live_streams SET viewer_count = viewer_count + 1 WHERE id = $1',
          [req.params.streamId]
        );
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stream' });
    }
  });

  router.get('/:streamId/chat', authenticateToken, async (req, res) => {
    const { limit = 100 } = req.query;

    try {
      const result = await pool.query(
        `SELECT sc.*, u.username, u.avatar
         FROM stream_chat sc
         JOIN users u ON u.id = sc.user_id
         WHERE sc.stream_id = $1
         ORDER BY sc.created_at ASC LIMIT $2`,
        [req.params.streamId, limit]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stream chat' });
    }
  });

  router.get('/:streamId/tips', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT st.*, u.username, u.avatar
         FROM stream_tips st
         JOIN users u ON u.id = st.sender_id
         WHERE st.stream_id = $1
         ORDER BY st.created_at DESC`,
        [req.params.streamId]
      );

      const total = await pool.query(
        'SELECT COALESCE(SUM(amount), 0) as total FROM stream_tips WHERE stream_id = $1',
        [req.params.streamId]
      );

      res.json({ tips: result.rows, totalAmount: parseFloat(total.rows[0].total) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tips' });
    }
  });

  router.post('/:streamId/thumbnail', authenticateToken, upload.single('thumbnail'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No thumbnail uploaded' });
    }

    try {
      await pool.query(
        'UPDATE live_streams SET thumbnail_url = $1 WHERE id = $2 AND user_id = $3',
        [`/uploads/${req.file.filename}`, req.params.streamId, req.user.id]
      );

      res.json({ success: true, thumbnailUrl: `/uploads/${req.file.filename}` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload thumbnail' });
    }
  });

  router.get('/schedule', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM live_streams
         WHERE user_id = $1 AND scheduled_for IS NOT NULL AND scheduled_for > NOW()
         ORDER BY scheduled_for ASC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  });

  router.get('/categories', async (req, res) => {
    const categories = [
      'Just Chatting', 'Gaming', 'Music', 'Art', 'Sports', 'News', 'Education',
      'Technology', 'Cooking', 'Travel', 'Fitness', 'ASMR', 'IRL', 'Creative',
      'Talk Shows', 'Podcasts', 'Events'
    ];
    res.json(categories);
  });

  return router;
};
