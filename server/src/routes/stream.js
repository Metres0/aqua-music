const xinghai = require('../services/xinghaiSource');
const sourceManager = require('../services/sourceManager');

const router = require('express').Router();

/**
 * 按需获取在线歌曲的播放URL
 * POST /api/stream/url
 * Body: { source, songId, songName, songIndex, quality, origin, singer }
 */
router.post('/url', async (req, res) => {
  const { source, songId, songName, songIndex, quality, origin, singer, _customSourceId } = req.body;

  if (!source || !songId) {
    return res.status(400).json({ error: '缺少必要参数: source, songId' });
  }

  // 自定义音源路径
  if (_customSourceId) {
    try {
      const musicInfo = { songmid: songId, name: songName, singer, id: songId };
      const result = await sourceManager.getMusicUrlFromCustom(
        _customSourceId, source, musicInfo, quality || '320k'
      );
      return res.json({
        success: true,
        url: result.url,
        method: 'custom',
        quality: result.quality || quality,
        platform: source,
        matchedSong: { name: songName, singer },
      });
    } catch (err) {
      console.error('[Stream URL Custom] 获取失败:', err.message);
      return res.status(502).json({ error: err.message, source, songId });
    }
  }

  try {
    const result = await xinghai.getMusicUrlWithFallback(
      source,
      songId,
      songName || '',
      singer || '',
      songIndex || 1,
      quality || '320k',
      origin || 'yaohu'
    );

    res.json({
      success: true,
      url: result.url,
      method: result.method,
      quality: result.quality,
      platform: result.platform || source,
      fallbackFrom: result.fallbackFrom,
      fallbackTo: result.fallbackTo,
      matchedSong: result.matchedSong,
    });
  } catch (err) {
    console.error('[Stream URL] 获取失败:', err.message);
    res.status(502).json({
      error: err.message,
      source,
      songId,
    });
  }
});

/**
 * GET 方式获取播放URL（方便 Audio 元素直接使用）
 * GET /api/stream/url?source=tx&songId=xxx&songName=xxx&quality=320k&origin=yaohu
 */
router.get('/url', async (req, res) => {
  const { source, songId, songName, songIndex, quality, origin, singer } = req.query;

  if (!source || !songId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  console.log('[Stream GET] params:', { source, songId, songName, songIndex, quality, origin, singer });

  try {
    const result = await xinghai.getMusicUrlWithFallback(
      source,
      songId,
      songName || '',
      singer || '',
      parseInt(songIndex) || 1,
      quality || '320k',
      origin || 'yaohu'
    );

    // 直接302重定向到音频URL，让浏览器/播放器直接播放
    res.redirect(302, result.url);
  } catch (err) {
    console.error('[Stream URL GET] 获取失败:', err.message);
    res.status(502).json({ error: err.message });
  }
});

/**
 * 获取歌词
 * GET /api/stream/lyric?source=wy&lyricId=123&songName=歌曲名
 */
router.get('/lyric', async (req, res) => {
  const { source, lyricId, songName, singer, _customSourceId } = req.query;
  if (!source || (!lyricId && !songName)) {
    return res.status(400).json({ error: '需要 source 和 lyricId/songName 参数' });
  }

  // 自定义音源歌词
  if (_customSourceId) {
    try {
      const musicInfo = { songmid: lyricId || '', name: songName, singer, id: lyricId || '' };
      const result = await sourceManager.getLyricFromCustom(_customSourceId, source, musicInfo);
      return res.json(result);
    } catch (err) {
      console.error('[Lyric Custom] 获取失败:', err.message);
      return res.status(404).json({ error: err.message });
    }
  }

  try {
    const result = await xinghai.getLyric(source, lyricId || '', songName || '', singer || '');
    res.json(result);
  } catch (err) {
    console.error('[Lyric] 获取失败:', err.message);
    res.status(404).json({ error: err.message });
  }
});

/**
 * 重置屏蔽状态（调试用）
 * POST /api/stream/reset
 */
router.post('/reset', (req, res) => {
  xinghai.resetBlocks();
  res.json({ success: true, message: '已重置所有屏蔽状态' });
});

module.exports = router;
