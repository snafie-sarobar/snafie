-- FullStack Application Database Schema
-- PostgreSQL 14+

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  avatar TEXT DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  location TEXT DEFAULT NULL,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_online BOOLEAN DEFAULT false,
  role VARCHAR(50) DEFAULT 'user',
  email_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  device VARCHAR(100),
  login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CHAT & MESSAGING
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  room_id VARCHAR(100),
  message TEXT,
  file_url TEXT,
  file_type VARCHAR(50),
  file_size BIGINT DEFAULT 0,
  is_read BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(255),
  room_avatar TEXT DEFAULT NULL,
  is_group BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_participants (
  room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id)
);

-- ============================================
-- VIDEO CALLING
-- ============================================
CREATE TABLE IF NOT EXISTS video_calls (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(255) UNIQUE NOT NULL,
  caller_id INTEGER REFERENCES users(id),
  is_group BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'waiting',
  started_at TIMESTAMP DEFAULT NULL,
  ended_at TIMESTAMP DEFAULT NULL,
  duration INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_participants (
  call_id INTEGER REFERENCES video_calls(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP DEFAULT NULL,
  PRIMARY KEY (call_id, user_id)
);

-- ============================================
-- LIVE STREAMING
-- ============================================
CREATE TABLE IF NOT EXISTS live_streams (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  stream_key VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) DEFAULT 'Untitled Stream',
  description TEXT DEFAULT '',
  category VARCHAR(100) DEFAULT 'Just Chatting',
  tags TEXT[] DEFAULT '{}',
  is_live BOOLEAN DEFAULT false,
  viewer_count INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  started_at TIMESTAMP DEFAULT NULL,
  ended_at TIMESTAMP DEFAULT NULL,
  thumbnail_url TEXT DEFAULT NULL,
  recording_url TEXT DEFAULT NULL,
  scheduled_for TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stream_tips (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  message TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stream_chat (
  id SERIAL PRIMARY KEY,
  stream_id INTEGER REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MUSIC PLAYER
-- ============================================
CREATE TABLE IF NOT EXISTS music_library (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) DEFAULT 'Unknown Artist',
  album VARCHAR(255) DEFAULT 'Unknown Album',
  genre VARCHAR(100) DEFAULT 'Other',
  file_url TEXT NOT NULL,
  cover_url TEXT DEFAULT NULL,
  duration INTEGER DEFAULT 0,
  bitrate INTEGER DEFAULT 0,
  file_size BIGINT DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT NULL,
  is_public BOOLEAN DEFAULT false,
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  added_by INTEGER REFERENCES users(id),
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS user_likes (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id)
);

CREATE TABLE IF NOT EXISTS recently_played (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER REFERENCES music_library(id) ON DELETE CASCADE,
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MAPS & LOCATION
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  place_name TEXT DEFAULT NULL,
  accuracy FLOAT DEFAULT 0,
  altitude FLOAT DEFAULT 0,
  speed FLOAT DEFAULT 0,
  is_sharing BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_places (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  place_name VARCHAR(255) NOT NULL,
  address TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  category VARCHAR(100) DEFAULT 'Other',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geofences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_meters FLOAT NOT NULL,
  trigger_on_enter BOOLEAN DEFAULT true,
  trigger_on_exit BOOLEAN DEFAULT true,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS location_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AI CHATBOT
-- ============================================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255) DEFAULT 'New Conversation',
  personality VARCHAR(100) DEFAULT 'default',
  mode VARCHAR(50) DEFAULT 'chat',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- FILE SHARING
-- ============================================
CREATE TABLE IF NOT EXISTS shared_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(100),
  is_public BOOLEAN DEFAULT false,
  downloads_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_video_calls_status ON video_calls(status);
CREATE INDEX IF NOT EXISTS idx_video_calls_room ON video_calls(room_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_active ON live_streams(is_live);
CREATE INDEX IF NOT EXISTS idx_live_streams_user ON live_streams(user_id);
CREATE INDEX IF NOT EXISTS idx_music_user ON music_library(user_id);
CREATE INDEX IF NOT EXISTS idx_music_public ON music_library(is_public);
CREATE INDEX IF NOT EXISTS idx_music_title ON music_library(title);
CREATE INDEX IF NOT EXISTS idx_music_artist ON music_library(artist);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_location_history_time ON location_history(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id);
CREATE INDEX IF NOT EXISTS idx_geofences_user ON geofences(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_shared_files_user ON shared_files(user_id);
CREATE INDEX IF NOT EXISTS idx_stream_tips_stream ON stream_tips(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_chat_stream ON stream_chat(stream_id);
CREATE INDEX IF NOT EXISTS idx_recently_played_user ON recently_played(user_id);

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_rooms_updated_at
  BEFORE UPDATE ON chat_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM refresh_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_location_history()
RETURNS void AS $$
BEGIN
  DELETE FROM location_history WHERE recorded_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (run via cron or pg_tle)
-- SELECT cron.schedule('cleanup-tokens', '0 3 * * *', 'SELECT cleanup_expired_tokens();');
-- SELECT cron.schedule('cleanup-locations', '0 4 * * *', 'SELECT cleanup_old_location_history();');

-- ============================================
-- SAMPLE DATA (OPTIONAL)
-- ============================================
-- INSERT INTO users (email, password_hash, username) VALUES
--   ('admin@example.com', '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1QhI9mCtKBUYx3x3x3x3x3x3x3x', 'admin'),
--   ('user@example.com', '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1QhI9mCtKBUYx3x3x3x3x3x3x3x', 'user');
