const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');
const qqMusic = require('../services/qqMusic');

const router = require('express').Router();

/**
 * Import a QQ Music playlist by URL
 * POST /api/import/qq-playlist
 * Body: { url: "https://y.qq.com/n/ryqq/playlist/xxxx" }
 */
router.post('/qq-playlist', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: '请提供QQ音乐歌单链接' });
  }

  try {
    const db = getDb();
    const playlistData = await qqMusic.fetchPlaylist(url);

    // Use a transaction for bulk inserts
    const importTransaction = db.transaction((data) => {
      const playlistId = uuidv4();

      // Create playlist
      db.prepare(`
        INSERT INTO playlists (id, name, description, cover_url, source, source_id, song_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        playlistId,
        data.name,
        data.description,
        data.cover,
        'qq_music',
        data.id,
        data.songs.length
      );

      // Insert songs and link to playlist
      const insertSong = db.prepare(`
        INSERT OR IGNORE INTO songs (id, title, artist, album, duration, cover_url, source, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertPlaylistSong = db.prepare(`
        INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, sort_order)
        VALUES (?, ?, ?)
      `);

      const findExistingSong = db.prepare(`
        SELECT id FROM songs WHERE source_url = ?
      `);

      data.songs.forEach((song, index) => {
        const songId = uuidv4();
        const sourceUrl = `qq_music:${song.sourceId}`;

        // Check if song already exists
        const existing = findExistingSong.get(sourceUrl);
        const actualSongId = existing ? existing.id : songId;

        if (!existing) {
          insertSong.run(
            songId,
            song.title,
            song.artist,
            song.album,
            song.duration,
            song.cover,
            'qq_music',
            sourceUrl
          );
        }

        insertPlaylistSong.run(playlistId, actualSongId, index);
      });

      return playlistId;
    });

    const playlistId = importTransaction(playlistData);

    res.json({
      success: true,
      playlistId,
      name: playlistData.name,
      songCount: playlistData.songs.length,
      cover: playlistData.cover
    });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
