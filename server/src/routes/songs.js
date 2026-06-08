const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const router = require('express').Router();

// List all songs with pagination
router.get('/', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as cnt FROM songs').get().cnt;
  const songs = db.prepare(`
    SELECT * FROM songs ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ songs, total, page, pages: Math.ceil(total / limit) });
});

// Save an online song to the database (for favorites / playlists)
router.post('/save-online', (req, res) => {
  const db = getDb();
  const { title, artist, album, source, songmid, cover, duration, source_url } = req.body;

  if (!title || !source || !songmid || !source_url) {
    return res.status(400).json({ error: '缺少必填字段 (title, source, songmid, source_url)' });
  }

  // Check if this online song already exists by source_url
  const existing = db.prepare('SELECT * FROM songs WHERE source_url = ?').get(source_url);
  if (existing) {
    return res.json({ song: existing, created: false });
  }

  // Insert new online song record
  const id = uuidv4();
  db.prepare(`
    INSERT INTO songs (id, title, artist, album, duration, cover_url, source, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    artist || '',
    album || '',
    duration || 0,
    cover || '',
    source,
    source_url
  );

  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
  res.json({ song, created: true });
});

// Get single song
router.get('/:id', (req, res) => {
  const db = getDb();
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: '歌曲不存在' });
  res.json(song);
});

// Stream audio file with range request support
router.get('/:id/stream', (req, res) => {
  const db = getDb();
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song || !song.local_path) {
    return res.status(404).json({ error: '音频文件不存在' });
  }

  const filePath = path.resolve(song.local_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '音频文件丢失' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma'
  };
  const contentType = mimeTypes[ext] || 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Update song info
router.put('/:id', (req, res) => {
  const db = getDb();
  const { title, artist, album } = req.body;
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: '歌曲不存在' });

  db.prepare(`
    UPDATE songs SET title = COALESCE(?, title), artist = COALESCE(?, artist),
    album = COALESCE(?, album) WHERE id = ?
  `).run(title || null, artist || null, album || null, req.params.id);

  res.json({ success: true });
});

// Delete song
router.delete('/:id', (req, res) => {
  const db = getDb();
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: '歌曲不存在' });

  db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
