const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'app.db');

function convertSql(sql) {
  let s = sql;
  s = s.replace(/\$(\d+)/g, '?');
  s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  s = s.replace(/::\w+/g, '');
  s = s.replace(/GREATEST\(([^,]+),\s*([^)]+)\)/gi, (m, a, b) => `CASE WHEN ${a} > ${b} THEN ${a} ELSE ${b} END`);
  s = s.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(([^)]+)\)\s*\)/gi, (m, expr) => `CAST((julianday('now') - julianday(${expr})) * 86400 AS INTEGER)`);
  s = s.replace(/json_agg\s*\(\s*json_build_object\s*\([^)]*\)\s*\)/gi, "'[]'");
  s = s.replace(/\bDISTINCT\s+ON\s*\([^)]+\)/gi, 'DISTINCT');
  s = s.replace(/\bEXCLUDED\./g, 'excluded.');
  return s;
}

const pSql = (strings, ...args) => {
  let sql = strings[0];
  for (let i = 0; i < args.length; i++) sql += `$${i + 1}` + strings[i + 1];
  return sql;
};

class DbPool {
  constructor() {
    this._pgPool = null;
    this._sqliteDb = null;
    this._mode = null;
    this._inited = false;
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._init();
    return this._initPromise;
  }

  async _init() {
    this._inited = true;

    try {
      const { Pool } = require('pg');
      const pgPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'fullstack_app',
        connectionTimeoutMillis: 3000,
        max: 10
      });
      await pgPool.query('SELECT 1');
      this._pgPool = pgPool;
      this._mode = 'pg';
      console.log('Using PostgreSQL database');
      await this._initPgSchema();
    } catch (err) {
      console.log('PostgreSQL unavailable, falling back to SQLite:', err.message);
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      try { fs.unlinkSync(DB_PATH); } catch {}
      this._sqliteDb = new DatabaseSync(DB_PATH);
      this._sqliteDb.exec('PRAGMA journal_mode=WAL');
      this._sqliteDb.exec('PRAGMA foreign_keys=ON');
      this._mode = 'sqlite';
      console.log('Using SQLite database at', DB_PATH);
      this._initSqliteSchema();
      this._applySqliteIndexes();
    }
  }

  query(sql, params = []) {
    if (!this._inited) throw new Error('Database not initialized');
    if (this._mode === 'pg') return this._pgQuery(sql, params);
    return this._sqliteQuery(sql, params);
  }

  async _pgQuery(sql, params) {
    try { return await this._pgPool.query(sql, params); }
    catch (err) { return Promise.reject(err); }
  }

  _sqliteQuery(sql, params) {
    try {
      const safeParams = (params || []).map((p, i) => {
        if (p === undefined) return null;
        if (typeof p === 'object' && p !== null && !Buffer.isBuffer(p)) return JSON.stringify(p);
        if (typeof p === 'boolean') return p ? 1 : 0;
        if (typeof p === 'bigint') return Number(p);
        return p;
      });
      const c = convertSql(sql);
      const t = c.trim();
      const ddl = /^(CREATE|DROP|ALTER|PRAGMA)\b/i.test(t);
      const select = !ddl && (/^\b(SELECT|WITH)\b/i.test(t) || c.includes(' FROM '));
      const insert = /^\bINSERT\b/i.test(t);
      const returning = sql.includes('RETURNING');
      const tbl = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);

      if (ddl) {
        this._sqliteDb.exec(c);
        return Promise.resolve({ rows: [] });
      }

      if (select) {
        const stmt = this._sqliteDb.prepare(c);
        const rows = stmt.all(...safeParams);
        const converted = rows.map(r => this._fixRowTypes(r, sql));
        return Promise.resolve({ rows: converted });
      }

      if (insert) {
        const stmt = this._sqliteDb.prepare(c);
        const info = stmt.run(...safeParams);
        if (returning && tbl) {
          const cols = sql.match(/RETURNING\s+(.+)/i);
          if (cols) {
            const colList = cols[1].trim();
            const sel = colList === '*' ? '*' : colList;
            const rid = Number(info.lastInsertRowid);
            const row = this._sqliteDb.prepare(`SELECT ${sel} FROM ${tbl[1]} WHERE rowid = ?`).get(rid);
            return Promise.resolve({ rows: row ? [this._fixRowTypes(row, sql)] : [] });
          }
        }
        return Promise.resolve({ rows: [], changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
      }

      const stmt = this._sqliteDb.prepare(c);
      const info = stmt.run(...safeParams);
      if (returning && tbl) {
        const cols = sql.match(/RETURNING\s+(.+)/i);
        if (cols) {
          const sel = cols[1].trim() === '*' ? '*' : cols[1].trim();
          const rid = Number(info.lastInsertRowid);
          const row = this._sqliteDb.prepare(`SELECT ${sel} FROM ${tbl[1]} WHERE rowid = ?`).get(rid);
          if (row) return Promise.resolve({ rows: [this._fixRowTypes(row, sql)] });
        }
      }
      return Promise.resolve({ rows: [], changes: info.changes });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  _fixRowTypes(row, sql) {
    if (!row || typeof row !== 'object') return row;
    const fixed = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'bigint') fixed[k] = Number(v);
      else fixed[k] = v;
    }
    return fixed;
  }

  async end() {
    if (this._mode === 'pg' && this._pgPool) await this._pgPool.end();
    if (this._mode === 'sqlite' && this._sqliteDb) this._sqliteDb.close();
  }

  async connect() {
    if (this._mode === 'pg') {
      const client = await this._pgPool.connect();
      return client;
    }
    return { query: (...args) => this.query(...args), release: () => {} };
  }

  _execMany(sqls) {
    for (const sql of sqls) {
      try { this._sqliteDb.exec(sql); } catch (err) { console.error('Schema init error:', err.message); }
    }
  }

  _initSqliteSchema() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, username TEXT UNIQUE NOT NULL, avatar TEXT DEFAULT NULL, bio TEXT DEFAULT NULL, location TEXT DEFAULT NULL, last_seen TEXT DEFAULT (datetime('now')), is_online INTEGER DEFAULT 0, role TEXT DEFAULT 'user', email_verified INTEGER DEFAULT 0, two_factor_enabled INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS refresh_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE, receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE, room_id TEXT, message TEXT, file_url TEXT, file_type TEXT, file_size INTEGER DEFAULT 0, is_read INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL, forwarded_from INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS chat_rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, room_name TEXT, room_avatar TEXT DEFAULT NULL, is_group INTEGER DEFAULT 0, created_by INTEGER REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS room_participants (room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'member', joined_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (room_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS video_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT UNIQUE NOT NULL, caller_id INTEGER REFERENCES users(id), is_group INTEGER DEFAULT 0, status TEXT DEFAULT 'waiting', started_at TEXT DEFAULT NULL, ended_at TEXT DEFAULT NULL, duration INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS call_participants (call_id INTEGER REFERENCES video_calls(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, joined_at TEXT DEFAULT (datetime('now')), left_at TEXT DEFAULT NULL, PRIMARY KEY (call_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS live_streams (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), stream_key TEXT UNIQUE NOT NULL, title TEXT DEFAULT 'Untitled Stream', description TEXT DEFAULT '', category TEXT DEFAULT 'Just Chatting', tags TEXT DEFAULT '[]', is_live INTEGER DEFAULT 0, viewer_count INTEGER DEFAULT 0, total_views INTEGER DEFAULT 0, started_at TEXT DEFAULT NULL, ended_at TEXT DEFAULT NULL, thumbnail_url TEXT DEFAULT NULL, recording_url TEXT DEFAULT NULL, scheduled_for TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS stream_tips (id INTEGER PRIMARY KEY AUTOINCREMENT, stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE, sender_id INTEGER REFERENCES users(id), amount REAL NOT NULL, message TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS stream_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), message TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS music_library (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL, artist TEXT DEFAULT 'Unknown Artist', album TEXT DEFAULT 'Unknown Album', genre TEXT DEFAULT 'Other', file_url TEXT NOT NULL, cover_url TEXT DEFAULT NULL, duration INTEGER DEFAULT 0, bitrate INTEGER DEFAULT 0, file_size INTEGER DEFAULT 0, play_count INTEGER DEFAULT 0, likes_count INTEGER DEFAULT 0, is_public INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT DEFAULT '', cover_url TEXT DEFAULT NULL, is_public INTEGER DEFAULT 0, play_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS playlist_songs (playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE, song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE, position INTEGER DEFAULT 0, added_by INTEGER REFERENCES users(id), added_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (playlist_id, song_id))`,
      `CREATE TABLE IF NOT EXISTS user_likes (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (user_id, song_id))`,
      `CREATE TABLE IF NOT EXISTS recently_played (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE, played_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE, latitude REAL NOT NULL, longitude REAL NOT NULL, place_name TEXT DEFAULT NULL, accuracy REAL DEFAULT 0, altitude REAL DEFAULT 0, speed REAL DEFAULT 0, is_sharing INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS saved_places (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, place_name TEXT NOT NULL, address TEXT, latitude REAL NOT NULL, longitude REAL NOT NULL, category TEXT DEFAULT 'Other', notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS geofences (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, radius_meters REAL NOT NULL, trigger_on_enter INTEGER DEFAULT 1, trigger_on_exit INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS location_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, latitude REAL NOT NULL, longitude REAL NOT NULL, recorded_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS ai_conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), title TEXT DEFAULT 'New Conversation', personality TEXT DEFAULT 'default', mode TEXT DEFAULT 'chat', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS ai_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, tokens_used INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, data TEXT DEFAULT '{}', is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`
    ];
    this._execMany(tables);
    console.log('SQLite tables created');
  }

  _applySqliteIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)',
      'CREATE INDEX IF NOT EXISTS idx_video_calls_status ON video_calls(status)',
      'CREATE INDEX IF NOT EXISTS idx_live_streams_active ON live_streams(is_live)',
      'CREATE INDEX IF NOT EXISTS idx_music_user ON music_library(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_music_public ON music_library(is_public)',
      'CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude)',
      'CREATE INDEX IF NOT EXISTS idx_location_history_time ON location_history(user_id, recorded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)',
      'CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id)'
    ];
    this._execMany(indexes);
    console.log('SQLite indexes created');
  }

  async _initPgSchema() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, username VARCHAR(100) UNIQUE NOT NULL, avatar TEXT DEFAULT NULL, bio TEXT DEFAULT NULL, location TEXT DEFAULT NULL, last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_online BOOLEAN DEFAULT false, role VARCHAR(50) DEFAULT 'user', email_verified BOOLEAN DEFAULT false, two_factor_enabled BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS refresh_tokens (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, token VARCHAR(500) NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE, receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE, room_id VARCHAR(100), message TEXT, file_url TEXT, file_type VARCHAR(50), file_size BIGINT DEFAULT 0, is_read BOOLEAN DEFAULT false, is_deleted BOOLEAN DEFAULT false, reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL, forwarded_from INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS chat_rooms (id SERIAL PRIMARY KEY, room_name VARCHAR(255), room_avatar TEXT DEFAULT NULL, is_group BOOLEAN DEFAULT false, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS room_participants (room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(50) DEFAULT 'member', joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (room_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS video_calls (id SERIAL PRIMARY KEY, room_id VARCHAR(255) UNIQUE NOT NULL, caller_id INTEGER REFERENCES users(id), is_group BOOLEAN DEFAULT false, status VARCHAR(50) DEFAULT 'waiting', started_at TIMESTAMP DEFAULT NULL, ended_at TIMESTAMP DEFAULT NULL, duration INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS call_participants (call_id INTEGER REFERENCES video_calls(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, left_at TIMESTAMP DEFAULT NULL, PRIMARY KEY (call_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS live_streams (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), stream_key VARCHAR(100) UNIQUE NOT NULL, title VARCHAR(255) DEFAULT 'Untitled Stream', description TEXT DEFAULT '', category VARCHAR(100) DEFAULT 'Just Chatting', tags TEXT[] DEFAULT '{}', is_live BOOLEAN DEFAULT false, viewer_count INTEGER DEFAULT 0, total_views INTEGER DEFAULT 0, started_at TIMESTAMP DEFAULT NULL, ended_at TIMESTAMP DEFAULT NULL, thumbnail_url TEXT DEFAULT NULL, recording_url TEXT DEFAULT NULL, scheduled_for TIMESTAMP DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS stream_tips (id SERIAL PRIMARY KEY, stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE, sender_id INTEGER REFERENCES users(id), amount DECIMAL(10, 2) NOT NULL, message TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS stream_chat (id SERIAL PRIMARY KEY, stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS music_library (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), title VARCHAR(255) NOT NULL, artist VARCHAR(255) DEFAULT 'Unknown Artist', album VARCHAR(255) DEFAULT 'Unknown Album', genre VARCHAR(100) DEFAULT 'Other', file_url TEXT NOT NULL, cover_url TEXT DEFAULT NULL, duration INTEGER DEFAULT 0, bitrate INTEGER DEFAULT 0, file_size BIGINT DEFAULT 0, play_count INTEGER DEFAULT 0, likes_count INTEGER DEFAULT 0, is_public BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS playlists (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, description TEXT DEFAULT '', cover_url TEXT DEFAULT NULL, is_public BOOLEAN DEFAULT false, play_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS playlist_songs (playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE, song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE, position INTEGER DEFAULT 0, added_by INTEGER REFERENCES users(id), added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (playlist_id, song_id))`,
      `CREATE TABLE IF NOT EXISTS user_likes (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, song_id))`,
      `CREATE TABLE IF NOT EXISTS recently_played (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE, played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS locations (id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE, latitude DECIMAL(10, 8) NOT NULL, longitude DECIMAL(11, 8) NOT NULL, place_name TEXT DEFAULT NULL, accuracy FLOAT DEFAULT 0, altitude FLOAT DEFAULT 0, speed FLOAT DEFAULT 0, is_sharing BOOLEAN DEFAULT true, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS saved_places (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, place_name VARCHAR(255) NOT NULL, address TEXT, latitude DECIMAL(10, 8) NOT NULL, longitude DECIMAL(11, 8) NOT NULL, category VARCHAR(100) DEFAULT 'Other', notes TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS geofences (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, latitude DECIMAL(10, 8) NOT NULL, longitude DECIMAL(11, 8) NOT NULL, radius_meters FLOAT NOT NULL, trigger_on_enter BOOLEAN DEFAULT true, trigger_on_exit BOOLEAN DEFAULT true, enabled BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS location_history (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, latitude DECIMAL(10, 8) NOT NULL, longitude DECIMAL(11, 8) NOT NULL, recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS ai_conversations (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), title VARCHAR(255) DEFAULT 'New Conversation', personality VARCHAR(100) DEFAULT 'default', mode VARCHAR(50) DEFAULT 'chat', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS ai_messages (id SERIAL PRIMARY KEY, conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE, role VARCHAR(50) NOT NULL, content TEXT NOT NULL, tokens_used INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, type VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, body TEXT, data JSONB DEFAULT '{}', is_read BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    ];
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)',
      'CREATE INDEX IF NOT EXISTS idx_video_calls_status ON video_calls(status)',
      'CREATE INDEX IF NOT EXISTS idx_live_streams_active ON live_streams(is_live)',
      'CREATE INDEX IF NOT EXISTS idx_music_user ON music_library(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_music_public ON music_library(is_public)',
      'CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude)',
      'CREATE INDEX IF NOT EXISTS idx_location_history_time ON location_history(user_id, recorded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)',
      'CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id)'
    ];
    for (const q of queries) { try { await this._pgPool.query(q); } catch (err) { console.error('PG schema error:', err.message); } }
    for (const q of indexes) { try { await this._pgPool.query(q); } catch {} }
    console.log('PostgreSQL tables initialized');
  }
}

const pool = new DbPool();
pool.init().catch(err => { console.error('Database init error:', err.message); });

module.exports = { pool };
