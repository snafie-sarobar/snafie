const express = require('express');
const router = express.Router();

module.exports = function({ pool, authenticateToken, upload, io }) {

  router.get('/conversations', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (m.room_id)
          m.room_id,
          m.message as last_message,
          m.file_url as last_file_url,
          m.file_type as last_file_type,
          m.created_at as last_message_at,
          m.sender_id as last_sender_id,
          ms.username as last_sender_name,
          CASE
            WHEN cr.is_group THEN cr.room_name
            WHEN m.sender_id = $1 THEN u2.username
            ELSE u1.username
          END as chat_name,
          CASE
            WHEN cr.is_group THEN cr.room_avatar
            WHEN m.sender_id = $1 THEN u2.avatar
            ELSE u1.avatar
          END as chat_avatar,
          cr.is_group,
          (SELECT COUNT(*) FROM messages WHERE room_id = m.room_id AND receiver_id = $1 AND is_read = false) as unread_count
         FROM messages m
         JOIN users u1 ON u1.id = m.sender_id
         JOIN users u2 ON u2.id = m.receiver_id
         LEFT JOIN chat_rooms cr ON cr.id::text = m.room_id
         LEFT JOIN users ms ON ms.id = m.sender_id
         WHERE m.sender_id = $1 OR m.receiver_id = $1
         ORDER BY m.room_id, m.created_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Conversations error:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  router.get('/rooms', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT cr.*,
          (SELECT json_agg(json_build_object('id', u.id, 'username', u.username, 'avatar', u.avatar))
           FROM room_participants rp JOIN users u ON u.id = rp.user_id
           WHERE rp.room_id = cr.id) as participants,
          (SELECT COUNT(*) FROM messages WHERE room_id = cr.id::text AND receiver_id = $1 AND is_read = false) as unread_count
         FROM chat_rooms cr
         JOIN room_participants rp ON rp.room_id = cr.id
         WHERE rp.user_id = $1
         ORDER BY cr.updated_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  router.post('/rooms', authenticateToken, async (req, res) => {
    const { roomName, participantIds, isGroup } = req.body;

    if (!participantIds || participantIds.length === 0) {
      return res.status(400).json({ error: 'At least one participant required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const roomResult = await client.query(
        'INSERT INTO chat_rooms (room_name, is_group, created_by) VALUES ($1, $2, $3) RETURNING *',
        [roomName || null, isGroup || false, req.user.id]
      );

      const room = roomResult.rows[0];

      await client.query(
        'INSERT INTO room_participants (room_id, user_id, role) VALUES ($1, $2, $3)',
        [room.id, req.user.id, 'admin']
      );

      for (const pid of participantIds) {
        await client.query(
          'INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [room.id, pid]
        );
      }

      await client.query('COMMIT');

      const participants = await pool.query(
        `SELECT u.id, u.username, u.avatar
         FROM room_participants rp JOIN users u ON u.id = rp.user_id
         WHERE rp.room_id = $1`,
        [room.id]
      );

      const fullRoom = { ...room, participants: participants.rows };

      for (const p of participants.rows) {
        io.to(`user:${p.id}`).emit('chat:new-room', fullRoom);
      }

      res.status(201).json(fullRoom);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create room error:', error);
      res.status(500).json({ error: 'Failed to create room' });
    } finally {
      client.release();
    }
  });

  router.get('/rooms/:roomId', authenticateToken, async (req, res) => {
    try {
      const room = await pool.query(
        `SELECT cr.*,
          (SELECT json_agg(json_build_object('id', u.id, 'username', u.username, 'avatar', u.avatar))
           FROM room_participants rp JOIN users u ON u.id = rp.user_id
           WHERE rp.room_id = cr.id) as participants
         FROM chat_rooms cr WHERE cr.id = $1`,
        [req.params.roomId]
      );

      if (room.rows.length === 0) {
        return res.status(404).json({ error: 'Room not found' });
      }

      res.json(room.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch room' });
    }
  });

  router.get('/messages/:roomId', authenticateToken, async (req, res) => {
    const { roomId } = req.params;
    const { limit = 50, before } = req.query;

    try {
      let query;
      let params;

      if (before) {
        query = `SELECT m.*, u.username, u.avatar
                 FROM messages m JOIN users u ON m.sender_id = u.id
                 WHERE m.room_id = $1 AND m.is_deleted = false AND m.created_at < $2
                 ORDER BY m.created_at DESC LIMIT $3`;
        params = [roomId, before, limit];
      } else {
        query = `SELECT m.*, u.username, u.avatar
                 FROM messages m JOIN users u ON m.sender_id = u.id
                 WHERE m.room_id = $1 AND m.is_deleted = false
                 ORDER BY m.created_at DESC LIMIT $2`;
        params = [roomId, limit];
      }

      const result = await pool.query(query, params);

      await pool.query(
        'UPDATE messages SET is_read = true WHERE room_id = $1 AND receiver_id = $2 AND is_read = false',
        [roomId, req.user.id]
      );

      res.json(result.rows.reverse());
    } catch (error) {
      console.error('Messages fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  router.post('/messages', authenticateToken, upload.single('file'), async (req, res) => {
    const { roomId, message, receiverId, replyTo } = req.body;

    if (!message && !req.file) {
      return res.status(400).json({ error: 'Message or file required' });
    }

    try {
      let fileUrl = null;
      let fileType = null;
      let fileSize = 0;

      if (req.file) {
        fileUrl = `/uploads/${req.file.filename}`;
        fileType = req.file.mimetype;
        fileSize = req.file.size;
      }

      const result = await pool.query(
        `INSERT INTO messages (sender_id, receiver_id, room_id, message, file_url, file_type, file_size, reply_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.user.id, receiverId || null, roomId, message || null, fileUrl, fileType, fileSize, replyTo || null]
      );

      const messageWithUser = await pool.query(
        `SELECT m.*, u.username, u.avatar
         FROM messages m JOIN users u ON m.sender_id = u.id
         WHERE m.id = $1`,
        [result.rows[0].id]
      );

      io.to(`room:${roomId}`).emit('chat:message', messageWithUser.rows[0]);

      if (receiverId) {
        io.to(`user:${receiverId}`).emit('chat:notification', {
          type: 'message',
          roomId,
          message: message || 'Sent a file',
          sender: { id: req.user.id, username: req.user.username, avatar: req.user.avatar }
        });
      }

      res.status(201).json(messageWithUser.rows[0]);
    } catch (error) {
      console.error('Message send error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'UPDATE messages SET is_deleted = true WHERE id = $1 AND sender_id = $2 RETURNING room_id',
        [req.params.messageId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found or unauthorized' });
      }

      io.to(`room:${result.rows[0].room_id}`).emit('chat:message-deleted', { messageId: parseInt(req.params.messageId) });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  router.put('/messages/:messageId', authenticateToken, async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message content required' });
    }

    try {
      const result = await pool.query(
        'UPDATE messages SET message = $1 WHERE id = $2 AND sender_id = $3 RETURNING *',
        [message, req.params.messageId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found or unauthorized' });
      }

      io.to(`room:${result.rows[0].room_id}`).emit('chat:message-edited', {
        messageId: parseInt(req.params.messageId),
        message
      });

      res.json({ success: true, message: result.rows[0] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to edit message' });
    }
  });

  router.get('/unread', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = false',
        [req.user.id]
      );
      res.json({ unreadCount: parseInt(result.rows[0].count) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  router.post('/forward', authenticateToken, async (req, res) => {
    const { messageId, targetRoomId } = req.body;

    try {
      const original = await pool.query(
        'SELECT message, file_url, file_type FROM messages WHERE id = $1',
        [messageId]
      );

      if (original.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const msg = original.rows[0];
      const result = await pool.query(
        `INSERT INTO messages (sender_id, room_id, message, file_url, file_type, forwarded_from)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.id, targetRoomId, msg.message, msg.file_url, msg.file_type, req.user.id]
      );

      const messageWithUser = await pool.query(
        `SELECT m.*, u.username, u.avatar
         FROM messages m JOIN users u ON m.sender_id = u.id
         WHERE m.id = $1`,
        [result.rows[0].id]
      );

      io.to(`room:${targetRoomId}`).emit('chat:message', messageWithUser.rows[0]);

      res.status(201).json(messageWithUser.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to forward message' });
    }
  });

  router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      success: true,
      fileUrl: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
  });

  router.get('/search', authenticateToken, async (req, res) => {
    const { query, roomId } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    try {
      let sqlQuery;
      let params;

      if (roomId) {
        sqlQuery = `SELECT m.*, u.username, u.avatar
                    FROM messages m JOIN users u ON m.sender_id = u.id
                    WHERE m.room_id = $1 AND m.message ILIKE $2 AND m.is_deleted = false
                    ORDER BY m.created_at DESC LIMIT 50`;
        params = [roomId, `%${query}%`];
      } else {
        sqlQuery = `SELECT m.*, u.username, u.avatar
                    FROM messages m JOIN users u ON m.sender_id = u.id
                    WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                    AND m.message ILIKE $2 AND m.is_deleted = false
                    ORDER BY m.created_at DESC LIMIT 50`;
        params = [req.user.id, `%${query}%`];
      }

      const result = await pool.query(sqlQuery, params);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
};
