const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');

module.exports = function({ pool, bcrypt, jwt, JWT_SECRET, SALT_ROUNDS, sendEmail, generateTokens, authenticateToken, upload, redisClient }) {

  router.post('/register', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
    body('username').isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, underscores'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => ({ field: e.path, message: e.msg })) });
    }

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
      const verificationToken = crypto.randomBytes(32).toString('hex');

      const result = await pool.query(
        `INSERT INTO users (email, password_hash, username, location)
         VALUES ($1, $2, $3, $4) RETURNING id, email, username, created_at`,
        [email, passwordHash, username, req.ip]
      );

      const user = result.rows[0];
      const tokens = generateTokens(user.id);

      const refreshToken = tokens.refreshToken;
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, refreshToken, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
      );

      await redisClient.setEx(`user:${user.id}:refresh`, 30 * 24 * 60 * 60, refreshToken);

      await sendEmail(
        email,
        'Welcome to FullStack App!',
        `<div style="font-family:Arial;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:10px">
          <h1 style="color:#4f46e5">Welcome ${username}!</h1>
          <p>Thank you for creating an account. You now have access to:</p>
          <ul>
            <li>Real-time chat with friends</li>
            <li>Video and voice calls</li>
            <li>Live streaming</li>
            <li>Music player and library</li>
            <li>Location sharing on maps</li>
            <li>AI assistant with multiple personalities</li>
          </ul>
          <p>Verify your email by clicking the link below:</p>
          <a href="${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}"
             style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:5px">
            Verify Email
          </a>
          <p style="margin-top:30px;color:#888;font-size:12px">If you didn't create this account, please ignore this email.</p>
        </div>`
      );

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: user.id, email: user.email, username: user.username }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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

      const tokens = generateTokens(user.id);

      await pool.query(
        'UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1',
        [user.id]
      );

      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokens.refreshToken, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
      );

      const { password_hash, ...safeUser } = user;

      res.json({
        success: true,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: safeUser
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET || JWT_SECRET);
      if (decoded.type !== 'refresh') {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }

      const stored = await pool.query(
        'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
        [refreshToken, decoded.userId]
      );

      if (stored.rows.length === 0) {
        return res.status(403).json({ error: 'Refresh token expired or invalid' });
      }

      const tokens = generateTokens(decoded.userId);

      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [decoded.userId, tokens.refreshToken, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
      );

      res.json({
        success: true,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken
      });
    } catch (error) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
  });

  router.post('/logout', authenticateToken, async (req, res) => {
    try {
      await pool.query(
        'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
        [req.user.id]
      );

      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
      await redisClient.del(`user:${req.user.id}:refresh`);

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  router.get('/me', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, email, username, avatar, bio, location, role, is_online, last_seen, email_verified, created_at FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  router.put('/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
      const { username, bio, location } = req.body;
      const updates = [];
      const values = [];
      let idx = 1;

      if (username) { updates.push(`username = $${idx++}`); values.push(username); }
      if (bio !== undefined) { updates.push(`bio = $${idx++}`); values.push(bio); }
      if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
      if (req.file) { updates.push(`avatar = $${idx++}`); values.push(`/uploads/${req.file.filename}`); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(req.user.id);

      const result = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, username, avatar, bio, location, role`,
        values
      );

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      res.status(500).json({ error: 'Profile update failed' });
    }
  });

  router.put('/password', authenticateToken, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);

      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);

      await sendEmail(req.user.email, 'Password Changed',
        `<div style="font-family:Arial;max-width:600px;margin:auto;padding:20px">
          <h2>Password Changed Successfully</h2>
          <p>Your password was changed at ${new Date().toLocaleString()}.</p>
          <p>If you did not make this change, please contact support immediately.</p>
        </div>`
      );

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Password change failed' });
    }
  });

  router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const user = await pool.query('SELECT id, username FROM users WHERE email = $1', [email]);
      if (user.rows.length === 0) {
        return res.json({ success: true, message: 'If the email exists, a reset link was sent' });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      await redisClient.setEx(`reset:${resetToken}`, 3600, user.rows[0].id.toString());

      await sendEmail(email, 'Password Reset Request',
        `<div style="font-family:Arial;max-width:600px;margin:auto;padding:20px">
          <h2>Password Reset</h2>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}"
             style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:5px">
            Reset Password
          </a>
        </div>`
      );

      res.json({ success: true, message: 'If the email exists, a reset link was sent' });
    } catch (error) {
      res.status(500).json({ error: 'Password reset request failed' });
    }
  });

  router.post('/reset-password', [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    try {
      const userId = await redisClient.get(`reset:${token}`);
      if (!userId) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, parseInt(userId)]);
      await redisClient.del(`reset:${token}`);

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Password reset failed' });
    }
  });

  router.delete('/account', authenticateToken, async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required for account deletion' });

    try {
      const user = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const valid = await bcrypt.compare(password, user.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Incorrect password' });

      await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
      await redisClient.del(`user:${req.user.id}:refresh`);

      res.json({ success: true, message: 'Account deleted permanently' });
    } catch (error) {
      res.status(500).json({ error: 'Account deletion failed' });
    }
  });

  router.get('/users', authenticateToken, async (req, res) => {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
      let query = 'SELECT id, username, avatar, bio, is_online, last_seen FROM users';
      let countQuery = 'SELECT COUNT(*) FROM users';
      const params = [];

      if (search) {
        const whereClause = ' WHERE username ILIKE $1 OR email ILIKE $1';
        query += whereClause;
        countQuery += whereClause;
        params.push(`%${search}%`);
      }

      query += ' ORDER BY is_online DESC, username ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const [usersResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, params.slice(0, search ? 1 : 0))
      ]);

      const total = parseInt(countResult.rows[0]?.count || 0);

      res.json({
        users: usersResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.get('/users/:id', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, email, username, avatar, bio, location, role, is_online, last_seen, created_at FROM users WHERE id = $1',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  return router;
};
