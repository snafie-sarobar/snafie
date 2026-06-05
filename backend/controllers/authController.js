const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { redisClient } = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh-secret-change-me';
const SALT_ROUNDS = 12;

const register = async (req, res) => {
  const { email, password, username } = req.body;

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existing.rows.length > 0) {
      const field = existing.rows[0].email === email ? 'email' : 'username';
      return res.status(409).json({ error: `A user with this ${field} already exists` });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
      [email, passwordHash, username]
    );

    const user = result.rows[0];
    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '30d' });

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
    );

    res.status(201).json({
      success: true,
      token: accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, username: user.username }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, username, password_hash, avatar, bio, role, is_online FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '30d' });

    await pool.query('UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1', [user.id]);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
    );

    const { password_hash, ...safeUser } = user;

    res.json({ success: true, token: accessToken, refreshToken, user: safeUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const stored = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
      [refreshToken, decoded.userId]
    );

    if (stored.rows.length === 0) {
      return res.status(403).json({ error: 'Refresh token expired' });
    }

    const newAccessToken = jwt.sign({ userId: decoded.userId }, JWT_SECRET, { expiresIn: '24h' });
    const newRefreshToken = jwt.sign({ userId: decoded.userId, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '30d' });

    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [decoded.userId, newRefreshToken, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
    );

    res.json({ success: true, token: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
};

const logout = async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1', [req.user.id]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, avatar, bio, location, role, is_online, last_seen, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

module.exports = { register, login, refreshToken, logout, getProfile };
