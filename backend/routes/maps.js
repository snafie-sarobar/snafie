const express = require('express');
const router = express.Router();

module.exports = function({ pool, authenticateToken, redisClient }) {

  router.post('/location', authenticateToken, async (req, res) => {
    const { latitude, longitude, placeName, accuracy, altitude, speed } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    try {
      await pool.query(
        `INSERT INTO locations (user_id, latitude, longitude, place_name, accuracy, altitude, speed, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           place_name = COALESCE(EXCLUDED.place_name, locations.place_name),
           accuracy = EXCLUDED.accuracy,
           altitude = EXCLUDED.altitude,
           speed = EXCLUDED.speed,
           updated_at = NOW()`,
        [req.user.id, latitude, longitude, placeName || null, accuracy || 0, altitude || 0, speed || 0]
      );

      await pool.query(
        'INSERT INTO location_history (user_id, latitude, longitude) VALUES ($1, $2, $3)',
        [req.user.id, latitude, longitude]
      );

      const cacheKey = `location:${req.user.id}`;
      await redisClient.setEx(cacheKey, 300, JSON.stringify({ latitude, longitude, placeName }));

      res.json({ success: true, message: 'Location updated' });
    } catch (error) {
      console.error('Location update error:', error);
      res.status(500).json({ error: 'Failed to update location' });
    }
  });

  router.get('/location/me', authenticateToken, async (req, res) => {
    try {
      const cacheKey = `location:${req.user.id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const result = await pool.query(
        'SELECT * FROM locations WHERE user_id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No location data found' });
      }

      const loc = result.rows[0];
      await redisClient.setEx(cacheKey, 300, JSON.stringify(loc));

      res.json(loc);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  });

  router.get('/nearby', authenticateToken, async (req, res) => {
    const { lat, lng, radius = 10, limit = 50 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const earthRadius = 6371;

    try {
      const result = await pool.query(
        `SELECT u.id, u.username, u.avatar, u.is_online,
                l.latitude, l.longitude, l.place_name, l.updated_at,
                ($1 * acos(
                  cos(radians($2)) * cos(radians(l.latitude)) *
                  cos(radians(l.longitude) - radians($3)) +
                  sin(radians($2)) * sin(radians(l.latitude))
                )) AS distance
         FROM locations l
         JOIN users u ON l.user_id = u.id AND u.is_online = true
         WHERE l.user_id != $4 AND l.is_sharing = true
         HAVING distance < $5
         ORDER BY distance ASC
         LIMIT $6`,
        [earthRadius, parseFloat(lat), parseFloat(lng), req.user.id, parseFloat(radius), parseInt(limit)]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Nearby query error:', error);
      res.status(500).json({ error: 'Failed to find nearby users' });
    }
  });

  router.get('/user/:userId', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM locations WHERE user_id = $1',
        [req.params.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Location not found for this user' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user location' });
    }
  });

  router.post('/places', authenticateToken, async (req, res) => {
    const { placeName, address, latitude, longitude, category, notes } = req.body;

    if (!placeName || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Place name, latitude, and longitude required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO saved_places (user_id, place_name, address, latitude, longitude, category, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, placeName, address || '', latitude, longitude, category || 'Other', notes || '']
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to save place' });
    }
  });

  router.get('/places', authenticateToken, async (req, res) => {
    const { category } = req.query;

    try {
      let query = 'SELECT * FROM saved_places WHERE user_id = $1';
      const params = [req.user.id];

      if (category) {
        query += ' AND category = $2';
        params.push(category);
      }

      query += ' ORDER BY created_at DESC';

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch saved places' });
    }
  });

  router.delete('/places/:id', authenticateToken, async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM saved_places WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete place' });
    }
  });

  router.get('/history', authenticateToken, async (req, res) => {
    const { limit = 100, from, to } = req.query;

    try {
      let query = 'SELECT * FROM location_history WHERE user_id = $1';
      const params = [req.user.id];
      let idx = 2;

      if (from) {
        query += ` AND recorded_at >= $${idx++}`;
        params.push(from);
      }
      if (to) {
        query += ` AND recorded_at <= $${idx++}`;
        params.push(to);
      }

      query += ' ORDER BY recorded_at DESC LIMIT $' + idx;
      params.push(parseInt(limit));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch location history' });
    }
  });

  router.post('/geofences', authenticateToken, async (req, res) => {
    const { name, latitude, longitude, radiusMeters, triggerOnEnter, triggerOnExit } = req.body;

    if (!name || latitude === undefined || longitude === undefined || !radiusMeters) {
      return res.status(400).json({ error: 'Name, latitude, longitude, and radius required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO geofences (user_id, name, latitude, longitude, radius_meters, trigger_on_enter, trigger_on_exit)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, name, latitude, longitude, radiusMeters, triggerOnEnter !== false, triggerOnExit !== false]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create geofence' });
    }
  });

  router.get('/geofences', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM geofences WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch geofences' });
    }
  });

  router.put('/geofences/:id', authenticateToken, async (req, res) => {
    const { name, radiusMeters, triggerOnEnter, triggerOnExit, enabled } = req.body;

    try {
      const updates = [];
      const values = [];
      let idx = 1;

      if (name) { updates.push(`name = $${idx++}`); values.push(name); }
      if (radiusMeters) { updates.push(`radius_meters = $${idx++}`); values.push(radiusMeters); }
      if (triggerOnEnter !== undefined) { updates.push(`trigger_on_enter = $${idx++}`); values.push(triggerOnEnter); }
      if (triggerOnExit !== undefined) { updates.push(`trigger_on_exit = $${idx++}`); values.push(triggerOnExit); }
      if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); values.push(enabled); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.params.id, req.user.id);

      const result = await pool.query(
        `UPDATE geofences SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Geofence not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update geofence' });
    }
  });

  router.delete('/geofences/:id', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM geofences WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete geofence' });
    }
  });

  router.put('/sharing', authenticateToken, async (req, res) => {
    const { isSharing } = req.body;

    try {
      await pool.query(
        'UPDATE locations SET is_sharing = $1 WHERE user_id = $2',
        [isSharing, req.user.id]
      );

      res.json({ success: true, isSharing });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update sharing preference' });
    }
  });

  router.get('/search', authenticateToken, async (req, res) => {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    try {
      const result = await pool.query(
        `SELECT * FROM saved_places
         WHERE user_id = $1
         AND (place_name ILIKE $2 OR address ILIKE $2 OR category ILIKE $2 OR notes ILIKE $2)
         ORDER BY created_at DESC`,
        [req.user.id, `%${q}%`]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
};
