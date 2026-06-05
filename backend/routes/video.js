const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = function({ pool, authenticateToken, io }) {

  router.post('/call/start', authenticateToken, async (req, res) => {
    const { calleeId, isGroup, participantIds } = req.body;
    const roomId = 'call_' + crypto.randomBytes(16).toString('hex');

    try {
      const result = await pool.query(
        `INSERT INTO video_calls (room_id, caller_id, is_group, status, started_at)
         VALUES ($1, $2, $3, 'active', NOW()) RETURNING *`,
        [roomId, req.user.id, isGroup || false]
      );

      const call = result.rows[0];

      await pool.query(
        'INSERT INTO call_participants (call_id, user_id) VALUES ($1, $2)',
        [call.id, req.user.id]
      );

      if (isGroup && participantIds) {
        for (const pid of participantIds) {
          await pool.query(
            'INSERT INTO call_participants (call_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [call.id, pid]
          );
          io.to(`user:${pid}`).emit('video:incoming-call', {
            roomId,
            caller: { id: req.user.id, username: req.user.username, avatar: req.user.avatar },
            isGroup: true,
            timestamp: new Date()
          });
        }
      } else if (calleeId) {
        io.to(`user:${calleeId}`).emit('video:incoming-call', {
          roomId,
          caller: { id: req.user.id, username: req.user.username, avatar: req.user.avatar },
          isGroup: false,
          timestamp: new Date()
        });
      }

      res.json({ success: true, roomId, callId: call.id });
    } catch (error) {
      console.error('Start call error:', error);
      res.status(500).json({ error: 'Failed to start call' });
    }
  });

  router.post('/call/accept', authenticateToken, async (req, res) => {
    const { roomId } = req.body;

    try {
      const call = await pool.query(
        "UPDATE video_calls SET status = 'active', started_at = COALESCE(started_at, NOW()) WHERE room_id = $1 RETURNING *",
        [roomId]
      );

      if (call.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }

      await pool.query(
        'INSERT INTO call_participants (call_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [call.rows[0].id, req.user.id]
      );

      io.to(`call:${roomId}`).emit('video:call-accepted', {
        userId: req.user.id,
        username: req.user.username
      });

      res.json({ success: true, call: call.rows[0] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to accept call' });
    }
  });

  router.post('/call/reject', authenticateToken, async (req, res) => {
    const { roomId } = req.body;

    try {
      await pool.query(
        "UPDATE video_calls SET status = 'rejected', ended_at = NOW() WHERE room_id = $1",
        [roomId]
      );

      io.to(`call:${roomId}`).emit('video:call-rejected', {
        userId: req.user.id,
        username: req.user.username
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reject call' });
    }
  });

  router.post('/call/end', authenticateToken, async (req, res) => {
    const { roomId } = req.body;

    try {
      const result = await pool.query(
        `UPDATE video_calls SET status = 'ended', ended_at = NOW(),
         duration = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
         WHERE room_id = $1 RETURNING *`,
        [roomId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }

      await pool.query(
        'UPDATE call_participants SET left_at = NOW() WHERE call_id = $1 AND user_id = $2',
        [result.rows[0].id, req.user.id]
      );

      io.to(`call:${roomId}`).emit('video:call-ended', {
        userId: req.user.id,
        duration: result.rows[0].duration
      });

      res.json({ success: true, duration: result.rows[0].duration });
    } catch (error) {
      res.status(500).json({ error: 'Failed to end call' });
    }
  });

  router.get('/calls/history', authenticateToken, async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
      const result = await pool.query(
        `SELECT vc.*,
          u_caller.username as caller_name,
          u_caller.avatar as caller_avatar,
          (SELECT COUNT(*) FROM call_participants cp WHERE cp.call_id = vc.id) as participant_count
         FROM video_calls vc
         JOIN users u_caller ON u_caller.id = vc.caller_id
         WHERE vc.caller_id = $1 OR vc.id IN (SELECT call_id FROM call_participants WHERE user_id = $1)
         ORDER BY vc.created_at DESC LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch call history' });
    }
  });

  router.get('/calls/active', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT vc.*, u.username as caller_name, u.avatar as caller_avatar
         FROM video_calls vc
         JOIN users u ON u.id = vc.caller_id
         WHERE vc.status = 'active'
         AND (vc.caller_id = $1 OR vc.id IN (SELECT call_id FROM call_participants WHERE user_id = $1))`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch active calls' });
    }
  });

  router.get('/call/:roomId', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT vc.*,
          u.username as caller_name, u.avatar as caller_avatar,
          (SELECT json_agg(json_build_object('id', u2.id, 'username', u2.username, 'avatar', u2.avatar, 'joined_at', cp.joined_at))
           FROM call_participants cp JOIN users u2 ON u2.id = cp.user_id
           WHERE cp.call_id = vc.id) as participants
         FROM video_calls vc
         JOIN users u ON u.id = vc.caller_id
         WHERE vc.room_id = $1`,
        [req.params.roomId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch call' });
    }
  });

  router.put('/call/:roomId/record', authenticateToken, async (req, res) => {
    const { isRecording } = req.body;

    io.to(`call:${req.params.roomId}`).emit('video:recording-status', {
      userId: req.user.id,
      isRecording
    });

    res.json({ success: true, isRecording });
  });

  router.get('/contacts', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.username, u.avatar, u.is_online, u.last_seen
         FROM users u
         WHERE u.id != $1 AND u.is_online = true
         ORDER BY u.username ASC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch contacts' });
    }
  });

  return router;
};
