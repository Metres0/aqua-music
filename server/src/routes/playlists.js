const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = require('express').Router();

// List all playlists
router.get('/', (req, res) => {
  const db = getDb();
  const playlists = db.prepare(`
    SELECT p.*, COUNT(ps.song_id) as actual_song_count
    FROM playlists p
    LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all();

  res.json(playlists);
});

// Get playlist with songs
router.get('/:id', (req, res) => {
  const db = getDb();
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: '歌单不存在' });

  const songs = db.prepare(`
    SELECT s.*, ps.sort_order, ps.added_at
    FROM songs s
    JOIN playlist_songs ps ON s.id = ps.song_id
    WHERE ps.playlist_id = ?
    ORDER BY ps.sort_order ASC
  `).all(req.params.id);

  res.json({ ...playlist, songs });
});

// Create playlist
router.post('/', (req, res) => {
  const db = getDb();
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: '请提供歌单名称' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)
  `).run(id, name, description);

  res.json({ id, name, description, song_count: 0 });
});

// Update playlist
router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, description, cover_url } = req.body;

  db.prepare(`
    UPDATE playlists SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      cover_url = COALESCE(?, cover_url),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(name || null, description || null, cover_url || null, req.params.id);

  res.json({ success: true });
});

// Delete playlist
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Add song to playlist
router.post('/:id/songs', (req, res) => {
  const db = getDb();
  const { songIds } = req.body;
  if (!songIds || !songIds.length) {
    return res.status(400).json({ error: '请提供要添加的歌曲' });
  }

  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) as max_order
    FROM playlist_songs WHERE playlist_id = ?
  `).get(req.params.id);

  const addSong = db.prepare(`
    INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, sort_order)
    VALUES (?, ?, ?)
  `);

  const updateCount = db.prepare(`
    UPDATE playlists SET song_count = (
      SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?
    ), updated_at = strftime('%s','now') WHERE id = ?
  `);

  const addAll = db.transaction(() => {
    songIds.forEach((songId, i) => {
      addSong.run(req.params.id, songId, maxOrder.max_order + 1 + i);
    });
    updateCount.run(req.params.id, req.params.id);
  });

  addAll();
  res.json({ success: true, added: songIds.length });
});

// Remove song from playlist
router.delete('/:id/songs/:songId', (req, res) => {
  const db = getDb();
  db.prepare(`
    DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?
  `).run(req.params.id, req.params.songId);

  db.prepare(`
    UPDATE playlists SET song_count = (
      SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?
    ), updated_at = strftime('%s','now') WHERE id = ?
  `).run(req.params.id, req.params.id);

  res.json({ success: true });
});

// Reorder songs in playlist
router.put('/:id/reorder', (req, res) => {
  const db = getDb();
  const { songIds } = req.body;
  if (!songIds) return res.status(400).json({ error: '请提供排序列表' });

  const updateOrder = db.prepare(`
    UPDATE playlist_songs SET sort_order = ? WHERE playlist_id = ? AND song_id = ?
  `);

  const reorder = db.transaction(() => {
    songIds.forEach((songId, i) => {
      updateOrder.run(i, req.params.id, songId);
    });
  });

  reorder();
  res.json({ success: true });
});

module.exports = router;
