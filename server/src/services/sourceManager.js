/**
 * Source Manager — LX Music 自定义音源管理器
 * 
 * 功能：
 * - 从 URL 或脚本内容添加音源
 * - 在 Node.js VM 沙箱中执行音源脚本
 * - 提供统一的 search / getMusicUrl / getLyric 接口
 * - 音源测试与健康管理
 */
const vm = require('vm');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const { getDb } = require('../db');

// ============================ 状态 ============================
const loadedSources = new Map(); // id -> { info, handler }

// ============================ 数据库操作 ============================
function getAllSources() {
  const db = getDb();
  return db.prepare('SELECT * FROM custom_sources ORDER BY created_at DESC').all()
    .map(row => ({ ...row, sources_meta: JSON.parse(row.sources_meta || '[]'), enabled: !!row.enabled }));
}

function getSourceById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM custom_sources WHERE id = ?').get(id);
  if (row) row.sources_meta = JSON.parse(row.sources_meta || '[]');
  if (row) row.enabled = !!row.enabled;
  return row || null;
}

function saveSource(data) {
  const db = getDb();
  const id = data.id || uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO custom_sources (id, name, description, version, author, homepage, url, script, enabled, sources_meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, description=excluded.description, version=excluded.version,
      author=excluded.author, homepage=excluded.homepage, url=excluded.url,
      script=excluded.script, enabled=excluded.enabled, sources_meta=excluded.sources_meta,
      updated_at=excluded.updated_at
  `).run(id, data.name, data.description || '', data.version || '1.0.0',
    data.author || '', data.homepage || '', data.url || '',
    data.script, data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    JSON.stringify(data.sources_meta || []),
    data.created_at || now, now);
  return getSourceById(id);
}

function deleteSourceFromDb(id) {
  const db = getDb();
  db.prepare('DELETE FROM custom_sources WHERE id = ?').run(id);
}

function toggleSourceInDb(id, enabled) {
  const db = getDb();
  db.prepare('UPDATE custom_sources SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, Date.now(), id);
}

// ============================ 脚本解析 ============================
function parseScriptHeader(script) {
  const headerMatch = script.match(/\/\*\*[\s\S]*?\*\//);
  if (!headerMatch) return {};
  const header = headerMatch[0];
  const fields = {};
  const patterns = [
    ['name', /@name\s+(.+)/],
    ['description', /@description\s+(.+)/],
    ['version', /@version\s+(.+)/],
    ['author', /@author\s+(.+)/],
    ['homepage', /@homepage\s+(.+)/],
  ];
  for (const [key, regex] of patterns) {
    const match = header.match(regex);
    if (match) fields[key] = match[1].trim();
  }
  return fields;
}

// ============================ HTTP 工具 ============================

// 将 raw.githubusercontent.com URL 转换为 GitHub API URL
// 格式1: raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
// 格式2: raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}/{path}
function toGitHubApiUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== 'raw.githubusercontent.com') return null;
    const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (parts.length < 4) return null;
    const owner = parts[0];
    const repo = parts[1];

    // 检测 refs/heads/{branch} 格式
    let branch, filePath;
    if (parts[2] === 'refs' && parts[3] === 'heads' && parts.length >= 6) {
      branch = parts[4];
      filePath = parts.slice(5).join('/');
    } else {
      branch = parts[2];
      filePath = parts.slice(3).join('/');
    }

    return `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${branch}`;
  } catch {
    return null;
  }
}

async function httpRequest(url, options = {}) {
  const timeoutMs = options.timeout || 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  async function tryGitHubApiFallback() {
    const ghApiUrl = toGitHubApiUrl(url);
    if (ghApiUrl) {
      console.log(`[SourceManager] raw URL 失败，尝试 GitHub API: ${ghApiUrl}`);
      try {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), timeoutMs);
        const resp2 = await fetch(ghApiUrl, {
          headers: { 'Accept': 'application/vnd.github.v3.raw', ...(options.headers || {}) },
          signal: controller2.signal,
        });
        clearTimeout(timeout2);
        if (resp2.status === 200) {
          const text = await resp2.text();
          return { statusCode: 200, body: text, headers: Object.fromEntries(resp2.headers.entries()) };
        }
      } catch (err2) {
        console.error(`[SourceManager] GitHub API 也失败:`, err2.message);
      }
    }
    return null;
  }

  try {
    const resp = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    // 如果 raw URL 返回非 200，尝试 GitHub API 回退
    if (resp.status !== 200 && toGitHubApiUrl(url)) {
      const fallback = await tryGitHubApiFallback();
      if (fallback) return fallback;
    }

    const text = await resp.text();
    return { statusCode: resp.status, body: text, headers: Object.fromEntries(resp.headers.entries()) };
  } catch (err) {
    clearTimeout(timeout);
    // 网络错误时也尝试 GitHub API 回退
    const fallback = await tryGitHubApiFallback();
    if (fallback) return fallback;
    throw err;
  }
}

// ============================ VM 沙箱 ============================
function createSourceSandbox(sourceId, scriptContent) {
  return new Promise((resolve, reject) => {
    // 大脚本给更多时间
    const sandboxTimeout = scriptContent.length > 100000 ? 30000 : 10000;
    const timeout = setTimeout(() => {
      reject(new Error(`音源脚本加载超时 (${sandboxTimeout / 1000}s)`));
    }, sandboxTimeout);

    const handlers = {};
    let initedData = null;

    // Base64 编解码 (浏览器兼容 API)
    function btoaFn(str) {
      return Buffer.from(str, 'binary').toString('base64');
    }
    function atobFn(str) {
      return Buffer.from(str, 'base64').toString('binary');
    }

    // lx API 实现
    const lx = {
      EVENT_NAMES: {
        inited: 'inited',
        request: 'request',
        updateAlert: 'updateAlert',
      },
      version: '2.0.0',
      // currentScriptInfo — 音源脚本元信息
      currentScriptInfo: {
        id: sourceId,
        name: '',
        version: '1.0.0',
        author: '',
        homepage: '',
        rawScript: scriptContent.length > 200 ? scriptContent.substring(0, 200) : scriptContent,
      },
      // utils — LX Music 提供的工具函数
      utils: {
        crypto: {
          md5(data) {
            return require('crypto').createHash('md5').update(String(data)).digest('hex');
          },
          sha1(data) {
            return require('crypto').createHash('sha1').update(String(data)).digest('hex');
          },
          sha256(data) {
            return require('crypto').createHash('sha256').update(String(data)).digest('hex');
          },
          createHash(algorithm) {
            return require('crypto').createHash(algorithm);
          },
          createHmac(algorithm, key) {
            return require('crypto').createHmac(algorithm, key);
          },
          randomBytes(size) {
            return require('crypto').randomBytes(size);
          },
        },
        buffer: {
          from: Buffer.from.bind(Buffer),
          alloc: Buffer.alloc.bind(Buffer),
          Buffer,
        },
        env: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      on(eventName, handler) {
        handlers[eventName] = handler;
      },
      off(eventName) {
        delete handlers[eventName];
      },
      send(eventName, data) {
        if (eventName === 'inited') {
          initedData = data;
          clearTimeout(timeout);
          resolve({ info: data, handler: handlers['request'] });
        }
      },
      request(url, options, callback) {
        // 支持 request(url, callback) 的简写形式
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        if (!options) options = {};

        const reqMethod = (options.method || 'GET').toUpperCase();
        const reqHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(options.headers || {}) };

        httpRequest(url, {
          method: reqMethod,
          headers: reqHeaders,
          body: options.body,
          timeout: 15000,
        }).then(result => {
          if (callback) callback(null, { body: result.body, statusCode: result.statusCode, headers: result.headers });
        }).catch(err => {
          if (callback) callback(err.message || String(err), null);
        });
      },
      env: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };

    // 创建 VM 上下文
    // 重要：先创建空 context（此时 globalThis 自动指向 sandbox），
    // 然后逐个赋值属性，这样脚本中 globalThis.lx 能正确解析
    const sandbox = {};
    const context = vm.createContext(sandbox);

    // lx API
    context.lx = lx;

    // 标准全局对象
    context.console = {
      log: (...args) => console.log(`[Source:${sourceId.slice(0, 6)}]`, ...args),
      warn: (...args) => console.warn(`[Source:${sourceId.slice(0, 6)}]`, ...args),
      error: (...args) => console.error(`[Source:${sourceId.slice(0, 6)}]`, ...args),
      info: (...args) => console.info(`[Source:${sourceId.slice(0, 6)}]`, ...args),
    };
    context.setTimeout = (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30000));
    context.clearTimeout = clearTimeout;
    context.setInterval = (fn, ms) => setInterval(fn, Math.max(ms || 1000, 1000));
    context.clearInterval = clearInterval;
    context.Promise = Promise;

    // 安全内置对象
    context.Object = Object;
    context.Array = Array;
    context.String = String;
    context.Number = Number;
    context.Boolean = Boolean;
    context.Date = Date;
    context.Math = Math;
    context.JSON = JSON;
    context.RegExp = RegExp;
    context.Error = Error;
    context.TypeError = TypeError;
    context.RangeError = RangeError;
    context.Map = Map;
    context.Set = Set;
    context.Symbol = Symbol;
    context.parseInt = parseInt;
    context.parseFloat = parseFloat;
    context.isNaN = isNaN;
    context.isFinite = isFinite;
    context.encodeURIComponent = encodeURIComponent;
    context.decodeURIComponent = decodeURIComponent;
    context.encodeURI = encodeURI;
    context.decodeURI = decodeURI;
    context.undefined = undefined;
    context.NaN = NaN;
    context.Infinity = Infinity;

    // Base64
    context.atob = atobFn;
    context.btoa = btoaFn;

    // URL 处理
    context.URL = URL;
    context.URLSearchParams = URLSearchParams;

    // Buffer & crypto（许多音源脚本需要）
    context.Buffer = Buffer;
    try { context.crypto = require('crypto'); } catch {}

    // global 引用
    context.global = context;
    context.self = context;

    try {
      const wrappedScript = `"use strict";\n${scriptContent}`;
      vm.runInContext(wrappedScript, context, {
        filename: `source-${sourceId}.js`,
        timeout: sandboxTimeout,
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(new Error(`脚本执行错误: ${err.message}`));
    }

    // 如果脚本是同步完成但没发 inited 事件，等待后超时
    setTimeout(() => {
      clearTimeout(timeout);
      if (!initedData && !handlers['request']) {
        reject(new Error('脚本未发送 inited 事件，请检查脚本格式'));
      }
    }, sandboxTimeout);
  });
}

// 调用音源 handler
async function callHandler(handler, action, data) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${action} 请求超时 (15s)`));
    }, 15000);

    try {
      const result = handler({ source: data.source, action, info: data.info });
      if (result && typeof result.then === 'function') {
        result.then(res => {
          clearTimeout(timer);
          resolve(res);
        }).catch(err => {
          clearTimeout(timer);
          reject(err);
        });
      } else {
        clearTimeout(timer);
        resolve(result);
      }
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

// ============================ 源管理 ============================
async function loadSource(sourceRecord) {
  try {
    const { info, handler } = await createSourceSandbox(sourceRecord.id, sourceRecord.script);
    loadedSources.set(sourceRecord.id, {
      info: info || {},
      handler,
      scriptName: sourceRecord.name,
      loadTime: Date.now(),
    });
    console.log(`[SourceManager] 已加载音源: ${sourceRecord.name} (${sourceRecord.id.slice(0, 8)})`);
    return { success: true, info };
  } catch (err) {
    console.error(`[SourceManager] 加载音源失败: ${sourceRecord.name}`, err.message);
    loadedSources.delete(sourceRecord.id);
    return { success: false, error: err.message };
  }
}

function unloadSource(id) {
  loadedSources.delete(id);
}

async function loadAllEnabledSources() {
  const sources = getAllSources().filter(s => s.enabled);
  const results = [];
  for (const source of sources) {
    const result = await loadSource(source);
    results.push({ ...source, loadResult: result });
  }
  return results;
}

// ============================ 对外接口 ============================
async function addSourceFromUrl(url) {
  const resp = await httpRequest(url, { timeout: 60000 });
  if (resp.statusCode !== 200) {
    throw new Error(`下载音源失败: HTTP ${resp.statusCode}`);
  }
  const script = resp.body;
  if (!script || script.length < 100) {
    throw new Error('音源脚本内容过短，可能不是有效的 LX 音源文件');
  }

  const header = parseScriptHeader(script);
  const name = header.name || decodeURIComponent(url.split('/').pop().replace('.js', '')) || 'Unknown Source';
  const sourceData = {
    name,
    description: header.description || '',
    version: header.version || '1.0.0',
    author: header.author || '',
    homepage: header.homepage || '',
    url,
    script,
    enabled: true,
    sources_meta: [],
  };

  // 先尝试加载以获取 sources 信息
  const tempId = uuidv4();
  try {
    const { info } = await createSourceSandbox(tempId, script);
    if (info && info.sources) {
      sourceData.sources_meta = Object.entries(info.sources).map(([key, val]) => ({
        id: key,
        name: val.name || key,
        type: val.type || 'music',
        actions: val.actions || [],
        qualitys: val.qualitys || [],
      }));
    }
  } catch (err) {
    console.warn('[SourceManager] 预加载测试失败，但仍保存音源:', err.message);
  }

  const saved = saveSource(sourceData);
  // 实际加载到内存
  if (saved.enabled) {
    await loadSource(saved);
  }
  return saved;
}

async function addSourceFromScript(script, meta = {}) {
  if (!script || script.length < 100) {
    throw new Error('音源脚本内容过短');
  }

  const header = parseScriptHeader(script);
  const sourceData = {
    name: meta.name || header.name || 'Custom Source',
    description: meta.description || header.description || '',
    version: meta.version || header.version || '1.0.0',
    author: meta.author || header.author || '',
    homepage: meta.homepage || header.homepage || '',
    url: meta.url || '',
    script,
    enabled: true,
    sources_meta: [],
  };

  const tempId = uuidv4();
  try {
    const { info } = await createSourceSandbox(tempId, script);
    if (info && info.sources) {
      sourceData.sources_meta = Object.entries(info.sources).map(([key, val]) => ({
        id: key,
        name: val.name || key,
        type: val.type || 'music',
        actions: val.actions || [],
        qualitys: val.qualitys || [],
      }));
    }
  } catch (err) {
    console.warn('[SourceManager] 预加载测试失败:', err.message);
  }

  const saved = saveSource(sourceData);
  if (saved.enabled) {
    await loadSource(saved);
  }
  return saved;
}

async function removeSource(id) {
  unloadSource(id);
  deleteSourceFromDb(id);
}

async function toggleSource(id, enabled) {
  toggleSourceInDb(id, enabled);
  if (enabled) {
    const source = getSourceById(id);
    if (source) await loadSource(source);
  } else {
    unloadSource(id);
  }
}

async function refreshSource(id) {
  const source = getSourceById(id);
  if (!source) throw new Error('音源不存在');
  
  // 如果源有 URL，重新下载
  if (source.url) {
    const resp = await httpRequest(source.url, { timeout: 30000 });
    if (resp.statusCode === 200 && resp.body && resp.body.length > 100) {
      source.script = resp.body;
      const header = parseScriptHeader(resp.body);
      source.version = header.version || source.version;
      saveSource(source);
    }
  }
  
  // 重新加载
  unloadSource(id);
  if (source.enabled) {
    return await loadSource(source);
  }
  return { success: true };
}

// ============================ 统一接口：搜索/URL/歌词 ============================
function getLoadedSourceList() {
  const result = [];
  for (const [id, loaded] of loadedSources.entries()) {
    const source = getSourceById(id);
    if (!source) continue;
    result.push({
      id,
      name: source.name,
      sources: loaded.info?.sources || {},
      loaded: true,
      loadTime: loaded.loadTime,
    });
  }
  return result;
}

// 搜索所有已加载的自定义源
async function searchCustomSources(keyword, limit = 15) {
  const results = {};
  const promises = [];

  for (const [id, loaded] of loadedSources.entries()) {
    if (!loaded.handler) continue;
    const sourcesMeta = loaded.info?.sources || {};
    
    for (const [sourceKey, sourceInfo] of Object.entries(sourcesMeta)) {
      if (!sourceInfo.actions || !sourceInfo.actions.includes('musicUrl')) {
        // Also try if actions not defined
      }
      promises.push(
        callHandler(loaded.handler, 'search', {
          source: sourceKey,
          info: { keyword, limit, page: 1 },
        }).then(songs => {
          if (Array.isArray(songs) && songs.length > 0) {
            const normalized = songs.map((s, i) => ({
              id: `custom_${id}_${sourceKey}_${s.songmid || s.id || i}`,
              title: s.name || s.title || '',
              singer: Array.isArray(s.singer) ? s.singer.join('/') : (s.singer || s.artist || ''),
              album: s.albumName || s.album || '',
              duration: s.interval || s.duration || 0,
              cover: s.pic || s.cover || s.albumImg || '',
              source: sourceKey,
              songmid: s.songmid || s.id || String(i),
              _origin: 'custom',
              _customSourceId: id,
              _customSourceName: loaded.scriptName,
              _lyricId: s.songmid || s.id || '',
              _type: s.type || sourceInfo.type || 'music',
            }));
            const key = `custom_${sourceKey}`;
            results[key] = (results[key] || []).concat(normalized);
          }
        }).catch(err => {
          console.warn(`[SourceManager] 搜索失败 [${loaded.scriptName}/${sourceKey}]:`, err.message);
        })
      );
    }
  }

  await Promise.allSettled(promises);
  return results;
}

// 通过自定义源获取音乐 URL
async function getMusicUrlFromCustom(customSourceId, sourceKey, musicInfo, quality = '320k') {
  const loaded = loadedSources.get(customSourceId);
  if (!loaded || !loaded.handler) {
    throw new Error('音源未加载');
  }

  // 映射质量
  const qualityMap = { '128k': '128k', '192k': '192k', '320k': '320k', 'flac': 'flac' };
  const type = qualityMap[quality] || quality;

  const result = await callHandler(loaded.handler, 'musicUrl', {
    source: sourceKey,
    info: { musicInfo, type },
  });

  if (typeof result === 'string') return { url: result };
  if (result && typeof result === 'object') {
    return { url: result.url || result, type: result.type, quality: result.quality };
  }
  throw new Error('未获取到播放地址');
}

// 通过自定义源获取歌词
async function getLyricFromCustom(customSourceId, sourceKey, musicInfo) {
  const loaded = loadedSources.get(customSourceId);
  if (!loaded || !loaded.handler) {
    throw new Error('音源未加载');
  }

  const result = await callHandler(loaded.handler, 'lyric', {
    source: sourceKey,
    info: { musicInfo },
  });

  if (typeof result === 'object') {
    return {
      lyric: result.lyric || result.lrc || '',
      tlyric: result.tlyric || '',
      rlyric: result.rlyric || '',
      lxlyric: result.lxlyric || '',
    };
  }
  if (typeof result === 'string') {
    return { lyric: result, tlyric: '' };
  }
  throw new Error('未获取到歌词');
}

// ============================ 测试功能 ============================
async function testSource(id) {
  const source = getSourceById(id);
  if (!source) throw new Error('音源不存在');

  const testResults = {
    load: { success: false, message: '' },
    search: { success: false, message: '', data: null },
    musicUrl: { success: false, message: '', data: null },
    lyric: { success: false, message: '', data: null },
    sourcesMeta: [],
  };

  // Test 1: Load
  try {
    const { info, handler } = await createSourceSandbox(id + '_test', source.script);
    testResults.load = { success: true, message: '脚本加载成功' };

    if (info && info.sources) {
      testResults.sourcesMeta = Object.entries(info.sources).map(([key, val]) => ({
        id: key,
        name: val.name || key,
        type: val.type || 'music',
        actions: val.actions || [],
        qualitys: val.qualitys || [],
      }));
    }

    // Test 2: Search (use first source)
    const firstSourceKey = Object.keys(info?.sources || {})[0];
    if (firstSourceKey && handler) {
      try {
        const songs = await callHandler(handler, 'search', {
          source: firstSourceKey,
          info: { keyword: '周杰伦', limit: 5, page: 1 },
        });
        if (Array.isArray(songs) && songs.length > 0) {
          testResults.search = {
            success: true,
            message: `搜索成功，返回 ${songs.length} 条结果`,
            data: songs.slice(0, 3).map(s => ({
              name: s.name || s.title,
              singer: s.singer || s.artist,
              album: s.albumName || s.album,
              songmid: s.songmid || s.id,
            })),
          };

          // Test 3: Music URL (use first search result)
          const testSong = songs[0];
          try {
            const urlResult = await callHandler(handler, 'musicUrl', {
              source: firstSourceKey,
              info: { musicInfo: testSong, type: '320k' },
            });
            const url = typeof urlResult === 'string' ? urlResult : (urlResult?.url || '');
            if (url && url.startsWith('http')) {
              // Check URL accessibility
              try {
                const headResp = await httpRequest(url, { method: 'HEAD', timeout: 8000 });
                testResults.musicUrl = {
                  success: headResp.statusCode >= 200 && headResp.statusCode < 400,
                  message: `URL 状态: HTTP ${headResp.statusCode}`,
                  data: { url: url.substring(0, 100) + '...', statusCode: headResp.statusCode },
                };
              } catch {
                testResults.musicUrl = {
                  success: true,
                  message: '获取到 URL (无法验证可访问性)',
                  data: { url: url.substring(0, 100) + '...' },
                };
              }
            } else {
              testResults.musicUrl = { success: false, message: '未返回有效 URL' };
            }
          } catch (err) {
            testResults.musicUrl = { success: false, message: `获取URL失败: ${err.message}` };
          }

          // Test 4: Lyric
          try {
            const lyricResult = await callHandler(handler, 'lyric', {
              source: firstSourceKey,
              info: { musicInfo: testSong },
            });
            const lyric = lyricResult?.lyric || lyricResult?.lrc || '';
            if (lyric && lyric.length > 10) {
              const lines = lyric.split('\n').filter(l => l.trim());
              testResults.lyric = {
                success: true,
                message: `歌词获取成功，${lines.length} 行`,
                data: { preview: lines.slice(0, 3).join('\n') },
              };
            } else {
              testResults.lyric = { success: false, message: '歌词内容为空或过短' };
            }
          } catch (err) {
            testResults.lyric = { success: false, message: `获取歌词失败: ${err.message}` };
          }
        } else {
          testResults.search = { success: false, message: '搜索返回空结果' };
        }
      } catch (err) {
        testResults.search = { success: false, message: `搜索失败: ${err.message}` };
      }
    }
  } catch (err) {
    testResults.load = { success: false, message: `加载失败: ${err.message}` };
  }

  return testResults;
}

// 测试 URL 上的音源（不保存到数据库）
async function testSourceFromUrl(url) {
  const resp = await httpRequest(url, { timeout: 30000 });
  if (resp.statusCode !== 200) {
    throw new Error(`下载音源失败: HTTP ${resp.statusCode}`);
  }
  const script = resp.body;
  const header = parseScriptHeader(script);
  const tempId = 'test_' + Date.now();

  const testResults = {
    name: header.name || url.split('/').pop().replace('.js', ''),
    version: header.version || 'unknown',
    author: header.author || 'unknown',
    load: { success: false, message: '' },
    search: { success: false, message: '', data: null },
    musicUrl: { success: false, message: '', data: null },
    lyric: { success: false, message: '', data: null },
    sourcesMeta: [],
  };

  try {
    const { info, handler } = await createSourceSandbox(tempId, script);
    testResults.load = { success: true, message: '脚本加载成功' };

    if (info && info.sources) {
      testResults.sourcesMeta = Object.entries(info.sources).map(([key, val]) => ({
        id: key,
        name: val.name || key,
        type: val.type || 'music',
        actions: val.actions || [],
        qualitys: val.qualitys || [],
      }));
    }

    // Quick search test
    const firstSourceKey = Object.keys(info?.sources || {})[0];
    if (firstSourceKey && handler) {
      try {
        const songs = await callHandler(handler, 'search', {
          source: firstSourceKey,
          info: { keyword: '测试', limit: 3, page: 1 },
        });
        testResults.search = {
          success: Array.isArray(songs) && songs.length > 0,
          message: `搜索${Array.isArray(songs) && songs.length > 0 ? '成功' : '无结果'} (${Array.isArray(songs) ? songs.length : 0} 条)`,
          data: Array.isArray(songs) ? songs.slice(0, 2).map(s => ({
            name: s.name || s.title,
            singer: s.singer || s.artist,
          })) : null,
        };
      } catch (err) {
        testResults.search = { success: false, message: err.message };
      }
    }
  } catch (err) {
    testResults.load = { success: false, message: err.message };
  }

  return testResults;
}

module.exports = {
  getAllSources,
  getSourceById,
  addSourceFromUrl,
  addSourceFromScript,
  removeSource,
  toggleSource,
  refreshSource,
  loadAllEnabledSources,
  getLoadedSourceList,
  searchCustomSources,
  getMusicUrlFromCustom,
  getLyricFromCustom,
  testSource,
  testSourceFromUrl,
  parseScriptHeader,
};
