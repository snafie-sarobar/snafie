const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_KEY || 'sk_test_placeholder');
const crypto = require('crypto');
const { pool } = require('./config/database');
const { redisClient } = require('./config/redis');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const videoRoutes = require('./routes/video');
const streamRoutes = require('./routes/stream');
const musicRoutes = require('./routes/music');
const mapsRoutes = require('./routes/maps');
const aiRoutes = require('./routes/ai');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-super-secret-key-2024';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh-secret-key-change-me-too';

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('combined'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

const reactBuildPath = path.join(__dirname, '..', 'frontend-web', 'build');
if (fs.existsSync(reactBuildPath)) {
  app.use(express.static(reactBuildPath));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later' },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const typeDir = path.join(uploadsDir, file.mimetype.split('/')[0] || 'other');
    if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true });
    cb(null, typeDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac',
    'application/pdf', 'application/zip', 'application/json',
    'text/plain', 'text/csv', 'text/html'
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed: ' + file.mimetype), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, email, username, avatar, bio, location, role, is_online, last_seen, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }

    req.user = result.rows[0];
    req.tokenDecoded = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, email, username, avatar, bio, location, role FROM users WHERE id = $1',
      [decoded.userId]
    );
    req.user = result.rows[0] || null;
  } catch {
    req.user = null;
  }
  next();
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.APP_NAME || 'FullStack App'}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

app.use('/api/auth', authRoutes({ pool, bcrypt, jwt, JWT_SECRET, SALT_ROUNDS: 12, sendEmail, generateTokens, authenticateToken, upload, redisClient }));
app.use('/api/chat', chatRoutes({ pool, authenticateToken, upload, io }));
app.use('/api/video', videoRoutes({ pool, authenticateToken, io }));
app.use('/api/stream', streamRoutes({ pool, authenticateToken, upload, io }));
app.use('/api/music', musicRoutes({ pool, authenticateToken, upload, redisClient }));
app.use('/api/maps', mapsRoutes({ pool, authenticateToken, redisClient }));
app.use('/api/ai', aiRoutes({ pool, authenticateToken }));

app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch { dbStatus = 'disconnected'; }
  try {
    await redisClient.ping();
    redisStatus = 'connected';
  } catch { redisStatus = 'disconnected'; }

  res.json({
    status: dbStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: dbStatus,
    redis: redisStatus,
    version: '2.0.0'
  });
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const [userCount, messageCount, streamCount, musicCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM messages'),
      pool.query('SELECT COUNT(*) FROM live_streams WHERE is_live = true'),
      pool.query('SELECT COUNT(*) FROM music_library')
    ]);

    res.json({
      totalUsers: parseInt(userCount.rows[0].count),
      totalMessages: parseInt(messageCount.rows[0].count),
      activeStreams: parseInt(streamCount.rows[0].count),
      totalSongs: parseInt(musicCount.rows[0].count),
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  console.log(`User connected: ${userId}`);

  socket.join(`user:${userId}`);
  socket.join(`global`);

  try {
    await pool.query('UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1', [userId]);
    io.emit('user:online', { userId });
  } catch (err) {
    console.error('Error updating user status:', err);
  }

  socket.on('chat:join', (roomId) => {
    socket.join(`room:${roomId}`);
    console.log(`User ${userId} joined room:${roomId}`);
  });

  socket.on('chat:leave', (roomId) => {
    socket.leave(`room:${roomId}`);
  });

  socket.on('chat:typing', (data) => {
    socket.to(`room:${data.roomId}`).emit('chat:typing', {
      userId,
      username: data.username,
      roomId: data.roomId,
      isTyping: data.isTyping
    });
  });

  socket.on('chat:message', async (data) => {
    try {
      const roomId = data.roomId;
      const result = await pool.query(
        `INSERT INTO messages (sender_id, receiver_id, room_id, message, file_url, file_type, reply_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [userId, data.receiverId || null, roomId, data.message, data.fileUrl || null, data.fileType || null, data.replyTo || null]
      );

      const messageWithUser = await pool.query(
        `SELECT m.*, u.username, u.avatar
         FROM messages m JOIN users u ON m.sender_id = u.id
         WHERE m.id = $1`,
        [result.rows[0].id]
      );

      io.to(`room:${roomId}`).emit('chat:message', messageWithUser.rows[0]);
    } catch (err) {
      console.error('Message error:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('chat:read', async (data) => {
    try {
      await pool.query(
        'UPDATE messages SET is_read = true WHERE room_id = $1 AND receiver_id = $2 AND is_read = false',
        [data.roomId, userId]
      );
      socket.to(`room:${data.roomId}`).emit('chat:read', { roomId: data.roomId, userId });
    } catch (err) {
      console.error('Read receipt error:', err);
    }
  });

  socket.on('video:join', (data) => {
    socket.join(`call:${data.roomId}`);
    socket.to(`call:${data.roomId}`).emit('video:user-joined', { userId, username: data.username });
  });

  socket.on('video:signal', (data) => {
    socket.to(`call:${data.roomId}`).emit('video:signal', {
      userId,
      signal: data.signal,
      type: data.type
    });
  });

  socket.on('video:leave', (data) => {
    socket.leave(`call:${data.roomId}`);
    socket.to(`call:${data.roomId}`).emit('video:user-left', { userId });
  });

  socket.on('video:raise-hand', (data) => {
    socket.to(`call:${data.roomId}`).emit('video:raise-hand', { userId, username: data.username });
  });

  socket.on('stream:join', (data) => {
    socket.join(`stream:${data.streamId}`);
    socket.to(`stream:${data.streamId}`).emit('stream:viewer-joined', { userId, username: data.username });
  });

  socket.on('stream:chat', async (data) => {
    try {
      await pool.query(
        'INSERT INTO stream_chat (stream_id, user_id, message) VALUES ($1, $2, $3)',
        [data.streamId, userId, data.message]
      );
      io.to(`stream:${data.streamId}`).emit('stream:chat', {
        userId,
        username: data.username,
        message: data.message,
        timestamp: new Date()
      });
    } catch (err) {
      console.error('Stream chat error:', err);
    }
  });

  socket.on('stream:tip', async (data) => {
    try {
      await pool.query(
        'INSERT INTO stream_tips (stream_id, sender_id, amount, message) VALUES ($1, $2, $3, $4)',
        [data.streamId, userId, data.amount, data.message || '']
      );
      io.to(`stream:${data.streamId}`).emit('stream:tip', {
        userId,
        username: data.username,
        amount: data.amount,
        message: data.message
      });
    } catch (err) {
      console.error('Stream tip error:', err);
    }
  });

  socket.on('stream:leave', (data) => {
    socket.leave(`stream:${data.streamId}`);
  });

  socket.on('location:update', async (data) => {
    try {
      await pool.query(
        `INSERT INTO locations (user_id, latitude, longitude, place_name, accuracy, altitude, speed, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           latitude = $2, longitude = $3, place_name = $4,
           accuracy = $5, altitude = $6, speed = $7, updated_at = NOW()`,
        [userId, data.latitude, data.longitude, data.placeName || null, data.accuracy || 0, data.altitude || 0, data.speed || 0]
      );

      await pool.query(
        'INSERT INTO location_history (user_id, latitude, longitude) VALUES ($1, $2, $3)',
        [userId, data.latitude, data.longitude]
      );

      io.emit('location:update', { userId, latitude: data.latitude, longitude: data.longitude, username: data.username });
    } catch (err) {
      console.error('Location update error:', err);
    }
  });

  socket.on('notification:send', (data) => {
    io.to(`user:${data.targetUserId}`).emit('notification:new', {
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data || {}
    });
  });

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${userId}`);
    try {
      await pool.query('UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1', [userId]);
      io.emit('user:offline', { userId });
      socket.leave('global');
      socket.leave(`user:${userId}`);
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 200MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const startServer = async () => {
  await pool.init();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket ready`);
  });
};
startServer().catch(err => { console.error('Failed to start server:', err); process.exit(1); });

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    await pool.end();
    await redisClient.quit();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(async () => {
    await pool.end();
    await redisClient.quit();
    process.exit(0);
  });
});

module.exports = { app, server, io, pool, redisClient };
