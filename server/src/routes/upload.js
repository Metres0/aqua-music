const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的音频格式: ${ext}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

const router = require('express').Router();

/**
 * Upload local music files
 * POST /api/upload/music
 * Supports multiple files, auto-adds to specified playlist
 */
router.post('/music', upload.array('files', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '请选择要上传的音频文件' });
  }

  const db = getDb();
  const playlistId = req.body.playlistId;

  const insertSong = db.prepare(`
    INSERT INTO songs (id, title, artist, album, duration, source, local_path, file_size, format)
    VALUES (?, ?, ?, ?, ?, 'local', ?, ?, ?)
  `);

  const insertPlaylistSong = db.prepare(`
    INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, sort_order)
    VALUES (?, ?, ?)
  `);

  const getMaxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) as max_order
    FROM playlist_songs WHERE playlist_id = ?
  `);

  const addedSongs = [];

  const processUploads = db.transaction(() => {
    let sortOrder = playlistId ? getMaxOrder.get(playlistId).max_order : -1;

    req.files.forEach((file) => {
      const id = uuidv4();
      const nameWithoutExt = path.basename(file.originalname, path.extname(file.originalname));
      const ext = path.extname(file.originalname).toLowerCase();

      // Try to parse artist - title from filename
      let title = nameWithoutExt;
      let artist = '';
      if (nameWithoutExt.includes(' - ')) {
        const parts = nameWithoutExt.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      insertSong.run(
        id, title, artist, '', 0,
        file.path, file.size, ext.replace('.', '')
      );

      if (playlistId) {
        sortOrder++;
        insertPlaylistSong.run(playlistId, id, sortOrder);
      }

      addedSongs.push({ id, title, artist, filename: file.filename });
    });

    if (playlistId) {
      db.prepare(`
        UPDATE playlists SET song_count = (
          SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?
        ), updated_at = strftime('%s','now') WHERE id = ?
      `).run(playlistId, playlistId);
    }
  });

  try {
    processUploads();
    res.json({ success: true, songs: addedSongs, count: addedSongs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
