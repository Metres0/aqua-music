const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'aqua-music.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');       // Write-Ahead Logging for high read performance
    db.pragma('synchronous = NORMAL');     // Balanced safety/performance
    db.pragma('cache_size = -64000');      // 64MB cache
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');      // Temp tables in memory
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      source TEXT DEFAULT 'local',
      source_id TEXT DEFAULT '',
      song_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      album TEXT DEFAULT '',
      duration REAL DEFAULT 0,
      cover_url TEXT DEFAULT '',
      source TEXT DEFAULT 'local',
      source_url TEXT DEFAULT '',
      local_path TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      format TEXT DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      added_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (playlist_id, song_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      query TEXT PRIMARY KEY,
      results TEXT NOT NULL,
      cached_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_songs_song ON playlist_songs(song_id);
  `);

  // Create default playlist if none exist
  const count = db.prepare('SELECT COUNT(*) as cnt FROM playlists').get();
  if (count.cnt === 0) {
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`
      INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)
    `).run(uuidv4(), '我喜欢的音乐', '默认播放列表');
  }
}

module.exports = { getDb };
