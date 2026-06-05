const { pool } = require('../config/database');

class User {
  static async findById(id) {
    const result = await pool.query(
      'SELECT id, email, username, avatar, bio, location, role, is_online, last_seen, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  static async findByUsername(username) {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  static async create({ email, passwordHash, username }) {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
      [email, passwordHash, username]
    );
    return result.rows[0];
  }

  static async update(id, fields) {
    const keys = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    values.unshift(id);

    const result = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING id, email, username, avatar, bio, location, role`,
      values
    );
    return result.rows[0];
  }

  static async setOnline(id, online) {
    await pool.query(
      'UPDATE users SET is_online = $1, last_seen = NOW() WHERE id = $2',
      [online, id]
    );
  }

  static async search(query, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT id, username, avatar, bio, is_online, last_seen
       FROM users
       WHERE username ILIKE $1 OR email ILIKE $1
       ORDER BY is_online DESC, username ASC
       LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
    return result.rows;
  }

  static async delete(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
}

module.exports = User;
