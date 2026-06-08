const sourceManager = require('../services/sourceManager');
const router = require('express').Router();

/**
 * GET /api/sources
 * 获取所有自定义音源列表
 */
router.get('/', (req, res) => {
  try {
    const sources = sourceManager.getAllSources();
    const loaded = sourceManager.getLoadedSourceList();
    res.json({
      sources: sources.map(s => ({
        ...s,
        script: undefined, // 不返回脚本内容
        loaded: loaded.some(l => l.id === s.id),
      })),
      loaded,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sources/:id
 * 获取单个音源详情（含脚本）
 */
router.get('/:id', (req, res) => {
  try {
    const source = sourceManager.getSourceById(req.params.id);
    if (!source) return res.status(404).json({ error: '音源不存在' });
    res.json(source);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sources
 * 添加新音源
 * Body: { url?: string, script?: string, name?: string, ... }
 */
router.post('/', async (req, res) => {
  try {
    const { url, script, name, description, author } = req.body;
    let result;
    if (url) {
      result = await sourceManager.addSourceFromUrl(url);
    } else if (script) {
      result = await sourceManager.addSourceFromScript(script, { name, description, author });
    } else {
      return res.status(400).json({ error: '请提供 url 或 script' });
    }
    res.json({ success: true, source: { ...result, script: undefined } });
  } catch (err) {
    console.error('[Sources] 添加音源失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sources/:id
 * 删除音源
 */
router.delete('/:id', async (req, res) => {
  try {
    await sourceManager.removeSource(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/sources/:id/toggle
 * 启用/禁用音源
 * Body: { enabled: boolean }
 */
router.put('/:id/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    await sourceManager.toggleSource(req.params.id, !!enabled);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sources/:id/refresh
 * 刷新音源（重新下载并加载）
 */
router.post('/:id/refresh', async (req, res) => {
  try {
    const result = await sourceManager.refreshSource(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sources/:id/test
 * 测试音源功能（加载、搜索、URL、歌词）
 */
router.post('/:id/test', async (req, res) => {
  try {
    const results = await sourceManager.testSource(req.params.id);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sources/test-url
 * 测试一个 URL 上的音源（不保存到数据库）
 * Body: { url: string }
 */
router.post('/test-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '请提供 url' });
    const results = await sourceManager.testSourceFromUrl(url);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sources/search
 * 搜索自定义音源（调试用）
 * Body: { keyword: string, limit?: number }
 */
router.post('/search', async (req, res) => {
  try {
    const { keyword, limit } = req.body;
    if (!keyword) return res.status(400).json({ error: '请提供关键词' });
    const results = await sourceManager.searchCustomSources(keyword, limit || 10);
    res.json({ results, count: Object.values(results).reduce((sum, arr) => sum + arr.length, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
