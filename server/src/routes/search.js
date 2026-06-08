const qqMusic = require('../services/qqMusic');
const xinghai = require('../services/xinghaiSource');
const sourceManager = require('../services/sourceManager');
const { getDb } = require('../db');

const router = require('express').Router();

/**
 * 统一搜索接口 - 支持多平台
 * GET /api/search?q=keyword&platforms=tx,kg,kw,mg,wy&limit=20
 * 
 * platforms 参数：
 *   tx = QQ音乐, kg = 酷狗, kw = 酷我, mg = 咪咕, wy = 网易云
 *   不传则搜索所有平台
 */
router.get('/', async (req, res) => {
  const { q, limit = 20, platforms } = req.query;
  if (!q) return res.status(400).json({ error: '请提供搜索关键词' });

  const db = getDb();
  const result = { local: [], platforms: {}, platforms_list: [] };

  // 1. 搜索本地曲库
  const localSongs = db.prepare(`
    SELECT * FROM songs
    WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
    ORDER BY title ASC LIMIT 50
  `).all(`%${q}%`, `%${q}%`, `%${q}%`);
  result.local = localSongs;

  // 2. 确定要搜索的平台列表
  let platformList;
  if (platforms) {
    platformList = platforms.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    platformList = xinghai.ALL_PLATFORMS;
  }

  // 3. 多平台并行搜索（星海源）
  try {
    const searchResults = await xinghai.search(q, platformList, parseInt(limit) || 20);
    result.platforms = searchResults;
    result.platforms_list = Object.entries(searchResults)
      .filter(([, songs]) => songs.length > 0)
      .map(([code, songs]) => ({
        code,
        name: xinghai.PLATFORM_NAME_MAP[code] || code,
        count: songs.length,
        songs,
      }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error('星海搜索异常:', err.message);
    result.platforms = {};
  }

  // 4. QQ音乐搜索（作为补充）
  try {
    const qqResults = await qqMusic.searchSongs(q, 1);
    result.qq_music = qqResults.songs;
  } catch {
    result.qq_music = [];
  }

  // 5. 自定义音源搜索
  try {
    const customResults = await sourceManager.searchCustomSources(q, parseInt(limit) || 15);
    if (Object.keys(customResults).length > 0) {
      result.custom_sources = customResults;
      // 合并到 platforms_list
      for (const [key, songs] of Object.entries(customResults)) {
        if (songs.length > 0) {
          const sourceName = songs[0]._customSourceName || key;
          result.platforms_list.push({
            code: key,
            name: `${sourceName}`,
            count: songs.length,
            songs,
          });
        }
      }
      // 重新排序
      result.platforms_list.sort((a, b) => b.count - a.count);
    }
  } catch (err) {
    console.error('自定义源搜索异常:', err.message);
  }

  res.json(result);
});

/**
 * 获取平台信息
 * GET /api/search/platforms
 */
router.get('/platforms', (req, res) => {
  res.json(xinghai.getPlatformInfo());
});

/**
 * 获取星海源状态
 * GET /api/search/status
 */
router.get('/status', (req, res) => {
  res.json(xinghai.getStatus());
});

module.exports = router;
