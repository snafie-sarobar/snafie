const store = new Map();
const timers = new Map();

class MemCache {
  constructor() { this._real = null; this._mode = null; }

  async connect() {
    try {
      const redis = require('redis');
      this._real = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379', socket: { reconnectStrategy: () => 5000 } });
      this._real.on('error', () => {});
      await this._real.connect();
      this._mode = 'redis';
      console.log('Using Redis cache');
      return;
    } catch (err) {
      console.log('Redis unavailable, using in-memory cache:', err.message);
      this._mode = 'mem';
    }
  }

  async ping() {
    if (this._mode === 'redis') { try { await this._real.ping(); return true; } catch { return false; } }
    return true;
  }

  async get(key) {
    if (this._mode === 'redis') { try { return await this._real.get(key); } catch { return null; } }
    const val = store.get(key);
    if (!val) return null;
    if (val.expires && Date.now() > val.expires) { store.delete(key); return null; }
    return val.value;
  }

  async setEx(key, ttlSeconds, value) {
    if (this._mode === 'redis') {
      try { await this._real.setEx(key, ttlSeconds, value); return true; } catch { return false; }
    }
    store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    if (timers.has(key)) clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { store.delete(key); timers.delete(key); }, ttlSeconds * 1000));
    return true;
  }

  async del(key) {
    if (this._mode === 'redis') { try { await this._real.del(key); return true; } catch { return false; } }
    store.delete(key);
    if (timers.has(key)) { clearTimeout(timers.get(key)); timers.delete(key); }
    return true;
  }

  async quit() {
    if (this._mode === 'redis') try { await this._real.quit(); } catch {}
    store.clear();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }

  on(event, handler) {
    if (this._mode === 'redis' && this._real) this._real.on(event, handler);
  }
}

const cache = new MemCache();
cache.connect().catch(() => {});

const cacheGet = async (key) => {
  try { const d = await cache.get(key); return d ? JSON.parse(d) : null; } catch { return null; }
};
const cacheSet = async (key, value, ttlSeconds = 300) => {
  try { return await cache.setEx(key, ttlSeconds, JSON.stringify(value)); } catch { return false; }
};
const cacheDel = async (key) => {
  try { return await cache.del(key); } catch { return false; }
};

module.exports = { redisClient: cache, connectRedis: () => cache.connect(), cacheGet, cacheSet, cacheDel };
