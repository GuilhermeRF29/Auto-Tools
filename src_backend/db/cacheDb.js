import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getRootDir } from '../config.js';

const CACHE_DEFAULT_TTL = 5 * 60 * 1000;

class CacheDatabase {
    constructor() {
        const dataDir = process.env.AUTOTOOLS_DATA_DIR || getRootDir();
        this.dbPath = path.join(dataDir, 'cache.db');
        this.db = null;
        this._ensureDb();
    }

    _ensureDb() {
        if (!this.db || !this.db.open) {
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.exec(`CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )`);
        }
        return this.db;
    }

    get(key) {
        const db = this._ensureDb();
        const row = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?').get(key);
        if (!row) return null;
        if (Date.now() > row.expires_at) {
            db.prepare('DELETE FROM cache WHERE key = ?').run(key);
            return null;
        }
        try {
            return JSON.parse(row.value);
        } catch {
            return row.value;
        }
    }

    set(key, value, ttlMs = CACHE_DEFAULT_TTL) {
        const db = this._ensureDb();
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        const expiresAt = Date.now() + ttlMs;
        db.prepare('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)').run(key, str, expiresAt);
    }

    cleanup() {
        const db = this._ensureDb();
        db.prepare('DELETE FROM cache WHERE expires_at < ?').run(Date.now());
    }
}

let _instance = null;
export const getCacheDb = () => {
    if (!_instance) _instance = new CacheDatabase();
    return _instance;
};

export default CacheDatabase;
