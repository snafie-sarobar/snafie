const { pool } = require('../config/database');

class Message {
  static async create({ senderId, receiverId, roomId, message, fileUrl, fileType, fileSize, replyTo }) {
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, room_id, message, file_url, file_type, file_size, reply_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [senderId, receiverId || null, roomId, message || null, fileUrl || null, fileType || null, fileSize || 0, replyTo || null]
    );
    return result.rows[0];
  }

  static async findByRoom(roomId, limit = 50, before = null) {
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
    return result.rows.reverse();
  }

  static async markAsRead(roomId, userId) {
    await pool.query(
      'UPDATE messages SET is_read = true WHERE room_id = $1 AND receiver_id = $2 AND is_read = false',
      [roomId, userId]
    );
  }

  static async markAsReadById(messageId, userId) {
    await pool.query(
      'UPDATE messages SET is_read = true WHERE id = $1 AND receiver_id = $2',
      [messageId, userId]
    );
  }

  static async softDelete(messageId, userId) {
    const result = await pool.query(
      'UPDATE messages SET is_deleted = true WHERE id = $1 AND sender_id = $2 RETURNING room_id',
      [messageId, userId]
    );
    return result.rows[0];
  }

  static async update(messageId, userId, message) {
    const result = await pool.query(
      'UPDATE messages SET message = $1 WHERE id = $2 AND sender_id = $3 RETURNING *',
      [message, messageId, userId]
    );
    return result.rows[0];
  }

  static async getUnreadCount(userId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = false',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  static async getConversations(userId) {
    const result = await pool.query(
      `SELECT DISTINCT ON (m.room_id)
        m.room_id, m.message as last_message, m.created_at as last_message_at,
        m.sender_id as last_sender_id, ms.username as last_sender_name,
        CASE WHEN cr.is_group THEN cr.room_name
             WHEN m.sender_id = $1 THEN u2.username
             ELSE u1.username END as chat_name,
        CASE WHEN cr.is_group THEN cr.room_avatar
             WHEN m.sender_id = $1 THEN u2.avatar
             ELSE u1.avatar END as chat_avatar,
        cr.is_group,
        (SELECT COUNT(*) FROM messages WHERE room_id = m.room_id AND receiver_id = $1 AND is_read = false) as unread_count
       FROM messages m
       JOIN users u1 ON u1.id = m.sender_id
       JOIN users u2 ON u2.id = m.receiver_id
       LEFT JOIN chat_rooms cr ON cr.id::text = m.room_id
       LEFT JOIN users ms ON ms.id = m.sender_id
       WHERE m.sender_id = $1 OR m.receiver_id = $1
       ORDER BY m.room_id, m.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async search(userId, query, roomId = null) {
    let sql;
    let params;

    if (roomId) {
      sql = `SELECT m.*, u.username, u.avatar
             FROM messages m JOIN users u ON m.sender_id = u.id
             WHERE m.room_id = $1 AND m.message ILIKE $2 AND m.is_deleted = false
             ORDER BY m.created_at DESC LIMIT 50`;
      params = [roomId, `%${query}%`];
    } else {
      sql = `SELECT m.*, u.username, u.avatar
             FROM messages m JOIN users u ON m.sender_id = u.id
             WHERE (m.sender_id = $1 OR m.receiver_id = $1)
             AND m.message ILIKE $2 AND m.is_deleted = false
             ORDER BY m.created_at DESC LIMIT 50`;
      params = [userId, `%${query}%`];
    }

    const result = await pool.query(sql, params);
    return result.rows;
  }
}

module.exports = Message;
