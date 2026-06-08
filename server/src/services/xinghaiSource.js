/**
 * 星海音乐源 (xinghai-music-source) 后端集成服务
 * 逆向适配自 lx-music-source v2.3.4
 * 
 * 功能：签名凭证管理、多平台搜索、音频URL多级降级获取
 * 
 * v2 - 重构URL解析策略：
 *   - GDAPI netease 作为主通道（最可靠）
 *   - GDAPI 支持 netease/kuwo 搜索获取正确ID
 *   - yaohu 直连/代理作为降级
 *   - 跨平台降级优先通过 GDAPI netease
 */
const fetch = require('node-fetch');

// ============================ 常量 ============================
const SIGN_PROVIDER_URL = 'https://zrcdy.dpdns.org/lx/api/api.php?get_sign_only=1';
const DIRECT_API_BASE = 'https://api.yaohud.cn/api/music/';
const MAIN_API_BASE = 'https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest&need_sec_link=1&sec_link_scene=im&theme=light';
const FALLBACK_PROXY_URL = 'https://zrcdy.dpdns.org/lx/api/api.php';
const NETEASE_VIP_API = 'https://api.chksz.top/api/163_music';
const VERSION_API_URL = 'https://zrcdy.dpdns.org/lx/version.php';
const STABLE_SOURCES_URL = 'https://zrcdy.dpdns.org/lx/stable_sources.php';

const DIRECT_SOURCE_PATH = { kg: 'kg', tx: 'qq', mg: 'migu', kw: 'kuwo' };
const PROXY_SUPPORTED = new Set(['kg', 'migu', 'qq']);
const ALL_PLATFORMS = ['wy', 'tx', 'kw', 'kg', 'mg'];

// GDAPI 支持的平台源名
const GDAPI_SOURCES = ['netease', 'kuwo'];
// 平台代码 → GDAPI 源名
const GDAPI_SOURCE_MAP = { wy: 'netease', kw: 'kuwo' };

const PLATFORM_NAME_MAP = {
  wy: '网易云音乐', tx: 'QQ音乐', kw: '酷我音乐', kg: '酷狗音乐', mg: '咪咕音乐'
};

const MUSIC_QUALITY = {
  wy: ['128k', '192k', '320k', 'flac', 'flac24bit', 'hires', 'jyeffect', 'sky', 'jymaster'],
  tx: ['128k', '192k', '320k', 'flac', 'flac24bit'],
  kw: ['128k', '192k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '192k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '192k', '320k', 'flac', 'flac24bit'],
};

const BR_MAP = { '128k': '128', '192k': '192', '320k': '320', 'flac': '740', 'flac24bit': '999' };

// ============================ 直连 API 常量 ============================
const NETEASE_API_BASE = 'https://music.163.com/api';
const KUWO_SEARCH_URL = 'http://search.kuwo.cn/r.s';
const KUWO_URL_BASE = 'http://antiserver.kuwo.cn/anti.s';
const KUWO_LYRIC_BASE = 'http://m.kuwo.cn/newh5/singles/songinfoandlrc';
const KUGOU_SEARCH_URL = 'https://mobileservice.kugou.com/api/v3/search/song';
const KUGOU_LYRIC_SEARCH_URL = 'http://lyrics.kugou.com/search';
const KUGOU_LYRIC_DOWNLOAD_URL = 'http://lyrics.kugou.com/download';

const NETEASE_VIP_QUALITY_SET = new Set(['hires', 'jyeffect', 'sky', 'jymaster']);
const NETEASE_VIP_LEVEL_MAP = { hires: 'hires', jyeffect: 'jyeffect', sky: 'sky', jymaster: 'jymaster' };

// ============================ 状态管理 ============================
let cachedCredential = null;
let credentialExpireTime = 0;
let gdApiBlockedUntil = 0;
let serverStatus = {
  yaohuPlatforms: { kg: 'unknown', qq: 'unknown', migu: 'unknown', kw: 'unknown' },
  gdApi: 'unknown',
  neteaseVipApi: 'unknown',
  online: true,
};
let mainApiSourceMap = {};
let initialized = false;

// GDAPI URL 解析缓存：记录某个 ID 是否返回过空链接
const gdApiEmptyCache = new Map();

// ============================ 搜索缓存 ============================
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// ============================ 热门歌曲ID映射（绕过网易云VIP压制） ============================
// 这些歌曲在网易云搜索中因VIP限制不返回原版，直接用已知ID获取歌词
const KNOWN_SONG_IDS = {
  '周杰伦/晴天': '186016',
  '周杰伦/稻香': '186043',
  '周杰伦/七里香': '186015',
  '周杰伦/简单爱': '186013',
  '周杰伦/夜曲': '186019',
  '周杰伦/告白气球': '434902428',
  '周杰伦/等你下课': '536623381',
  '周杰伦/说好不哭': '1389153425',
  '周杰伦/不能说的秘密': '186012',
  '周杰伦/青花瓷': '186017',
  '周杰伦/以父之名': '186011',
  '周杰伦/双截棍': '186009',
  '周杰伦/听妈妈的话': '186032',
  '周杰伦/发如雪': '186018',
  '周杰伦/珊瑚海': '186033',
  '周杰伦/反方向的钟': '186010',
  '周杰伦/园游会': '186014',
  '周杰伦/最长的电影': '186040',
  '周杰伦/一路向北': '186029',
  '周杰伦/半岛铁盒': '186025',
  '周杰伦/龙卷风': '186023',
  '周杰伦/爱在西元前': '186024',
  '周杰伦/安静': '186035',
  '周杰伦/开不了口': '186036',
  '周杰伦/回到过去': '186027',
  '林俊杰/江南': '368728',
  '林俊杰/一千年以后': '368732',
  '林俊杰/可惜没如果': '368738',
  '林俊杰/修炼爱情': '368740',
  '林俊杰/那些你很冒险的梦': '368742',
  '林俊杰/不为谁而作的歌': '368745',
  '陈奕迅/十年': '255319',
  '陈奕迅/浮夸': '255321',
  '陈奕迅/K歌之王': '255320',
  '陈奕迅/富士山下': '255323',
  '陈奕迅/好久不见': '255318',
  '陈奕迅/你的背包': '255317',
  '陈奕迅/红玫瑰': '255322',
  '邓紫棋/光年之外': '447306462',
  '邓紫棋/泡沫': '28092424',
  '邓紫棋/喜欢你': '28092436',
  '薛之谦/演员': '33356092',
  '薛之谦/丑八怪': '33356091',
  '薛之谦/认真的雪': '33356090',
  '五月天/倔强': '386844',
  '五月天/知足': '386843',
  '五月天/突然好想你': '386852',
  '五月天/温柔': '386842',
  '张学友/吻别': '190075',
  '张学友/一路上有你': '190073',
  '张学友/她来听我的演唱会': '190082',
  '王菲/红豆': '296673',
  '王菲/匆匆那年': '296675',
  '孙燕姿/遇见': '254574',
  '孙燕姿/天黑黑': '254573',
  '蔡依林/倒带': '207818',
  '蔡依林/日不落': '207822',
  '张惠妹/记得': '209235',
  '张惠妹/听海': '209234',
  '梁静茹/勇气': '252214',
  '梁静茹/宁夏': '252216',
  '田馥甄/小幸运': '33525498',
  '毛不易/像我这样的人': '516076896',
  '赵雷/成都': '434902531',
  '李荣浩/李白': '28131643',
  '李荣浩/年少有为': '516076794',
  '许嵩/素颜': '164495',
  '汪苏泷/年轮': '33525544',
  '朴树/平凡之路': '29004400',
  'Taylor Swift/Love Story': '28793079',
  'Taylor Swift/Blank Space': '29569814',
  'Adele/Rolling in the Deep': '22720919',
  'Ed Sheeran/Shape of You': '447306067',
};

/**
 * 从热门歌曲映射表中查找已知的网易云歌曲ID
 */
function findKnownSongId(songName, singer) {
  if (!songName || !singer) return null;
  const cleanName = songName.trim();
  const cleanSinger = singer.trim();
  // Direct key match
  const key1 = `${cleanSinger}/${cleanName}`;
  if (KNOWN_SONG_IDS[key1]) return KNOWN_SONG_IDS[key1];
  // Try case-insensitive match
  for (const [k, v] of Object.entries(KNOWN_SONG_IDS)) {
    const [s, n] = k.split('/');
    if (s === cleanSinger && n === cleanName) return v;
  }
  return null;
}

// ============================ 工具函数 ============================
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim().replace(/\s+/g, ''))}`)
    .join('&');
}

function mapQuality(target, avail) {
  if (avail.includes(target)) return target;
  const order = ['jymaster', 'sky', 'jyeffect', 'hires', 'flac24bit', 'flac', '320k', '192k', '128k'];
  for (const q of order) if (avail.includes(q)) return q;
  return avail[0] || '128k';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function removeSpecialChars(s) {
  return s ? s.replace(/[（(][^）)]*[）)]/g, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim() : '';
}

function stringMatchScore(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const s2 = b.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  let m = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) m++;
  }
  return m / Math.max(s1.length, s2.length);
}

function findBestMatch(name, singer, songs) {
  if (!songs?.length) return null;
  let bi = -1, bs = -1;
  songs.forEach((s, i) => {
    const sn = s.title || s.name || '';
    const ss = s.singer || s.author || (Array.isArray(s.artist) ? s.artist.join('/') : '');
    const ts = stringMatchScore(name, sn) * 0.6 + stringMatchScore(singer, ss) * 0.4;
    if (ts > bs) { bs = ts; bi = i; }
  });
  return bs >= 0.3 && bi >= 0 ? songs[bi] : null;
}

async function httpJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'LX-Music-Mobile',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    clearTimeout(timeout);
    const text = await resp.text();
    try {
      return { statusCode: resp.status, body: JSON.parse(text), headers: resp.headers };
    } catch {
      return { statusCode: resp.status, body: text, headers: resp.headers };
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ============================ 签名凭证 ============================
async function fetchCredentials() {
  const now = Date.now();
  if (cachedCredential && now < credentialExpireTime) return cachedCredential;
  const resp = await httpJson(SIGN_PROVIDER_URL, { timeout: 5000 });
  if (resp.statusCode !== 200) throw new Error(`签名服务 HTTP ${resp.statusCode}`);
  const data = resp.body;
  cachedCredential = data;
  credentialExpireTime = now + ((data.expire_in || 60) - 5) * 1000;
  return cachedCredential;
}

async function signedFetch(url, options = {}) {
  const cred = await fetchCredentials();
  return httpJson(url, {
    ...options,
    headers: {
      'X-Api-Key': cred.api_key,
      'X-Api-Timestamp': String(cred.timestamp),
      'X-Api-Sign': cred.sign,
      ...(options.headers || {}),
    },
  });
}

// ============================ 服务器状态 ============================
async function fetchServerStatus() {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(1000);
    try {
      const resp = await httpJson(VERSION_API_URL, { timeout: 5000 });
      if (resp.statusCode !== 200) continue;
      const data = resp.body;
      if (data.yaohu_api?.platforms) {
        for (const p in data.yaohu_api.platforms) {
          serverStatus.yaohuPlatforms[p] = data.yaohu_api.platforms[p].status || 'unknown';
        }
      } else {
        const overall = data.yaohu_api?.status || 'unknown';
        for (const p in serverStatus.yaohuPlatforms) serverStatus.yaohuPlatforms[p] = overall;
      }
      serverStatus.gdApi = data.gd_api?.status || 'unknown';
      serverStatus.neteaseVipApi = data.netease_vip_api?.status || 'unknown';
      serverStatus.online = data.server_status?.online !== false;
      console.log('[星海] 服务器状态:', JSON.stringify({
        yaohu: serverStatus.yaohuPlatforms,
        gdApi: serverStatus.gdApi,
        vip: serverStatus.neteaseVipApi,
      }));
      return;
    } catch { /* retry */ }
  }
}

async function fetchStableSources() {
  try {
    const resp = await httpJson(STABLE_SOURCES_URL, { timeout: 5000 });
    if (resp.statusCode === 200 && Array.isArray(resp.body) && resp.body.length > 0) {
      console.log('[星海] 稳定源:', resp.body);
      return resp.body.filter(s => typeof s === 'string' && /^[a-z]+/.test(s));
    }
  } catch {}
  return ['netease', 'tencent', 'kuwo', 'kugou', 'migu'];
}

function buildPlatformMap(sources) {
  const map = { netease: 'wy', tencent: 'tx', kuwo: 'kw', kugou: 'kg', migu: 'mg' };
  mainApiSourceMap = {};
  sources.forEach(s => {
    // 清理源名（可能有HTML残留）
    const clean = s.replace(/<[^>]+>/g, '').trim();
    const code = map[clean];
    if (code) mainApiSourceMap[code] = clean;
  });
  console.log('[星海] 平台映射:', JSON.stringify(mainApiSourceMap));
}

// ============================ 直连 API ============================

// --- Netease Direct Search ---
async function neteaseDirectSearch(keyword, limit = 15) {
  const url = `${NETEASE_API_BASE}/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=0`;
  const resp = await httpJson(url, {
    timeout: 6000,
    headers: {
      'Referer': 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (resp.statusCode !== 200) throw new Error(`Netease HTTP ${resp.statusCode}`);
  const data = resp.body;
  if (data.code !== 200 || !data.result?.songs) return [];
  return data.result.songs.map((s, i) => ({
    singer: (s.artists || []).map(a => a.name).join(' / '),
    title: s.name || '',
    album: s.album?.name || '',
    source: 'wy',
    songmid: String(s.id),
    duration: s.duration ? Math.floor(s.duration / 1000) : null,
    cover: s.album?.picUrl || '',
    n: i + 1,
    _origin: 'netease_direct',
    _lyricId: String(s.id),
  }));
}

// --- Kuwo Direct Search ---
async function kuwoDirectSearch(keyword, limit = 15) {
  const url = `${KUWO_SEARCH_URL}?all=${encodeURIComponent(keyword)}&ft=music&rformat=json&encoding=utf8&rn=${limit}&pn=0&vipver=MUSIC_9.1.1.2_BCS2&mobi=1`;
  const resp = await httpJson(url, { timeout: 6000 });
  if (resp.statusCode !== 200) throw new Error(`Kuwo HTTP ${resp.statusCode}`);
  const data = resp.body;
  const abslist = data?.abslist || [];
  if (!abslist.length) return [];
  return abslist.map((s, i) => {
    const rid = (s.MUSICRID || '').replace('MUSIC_', '');
    return {
      singer: s.ARTIST || '',
      title: s.NAME || '',
      album: s.ALBUM || '',
      source: 'kw',
      songmid: rid,
      duration: s.DURATION ? parseInt(s.DURATION) : null,
      cover: '',
      n: i + 1,
      _origin: 'kuwo_direct',
      _lyricId: rid,
    };
  });
}

// --- Kuwo Direct URL (reliable CDN) ---
async function getKuwoUrl(songRid) {
  const url = `${KUWO_URL_BASE}?type=convert_url&rid=${songRid}&response=url&format=mp3`;
  const resp = await httpJson(url, { timeout: 6000 });
  if (resp.statusCode !== 200) throw new Error('Kuwo URL HTTP error');
  const text = typeof resp.body === 'string' ? resp.body.trim() : '';
  if (text && text.startsWith('http')) return text;
  throw new Error('Kuwo URL empty');
}

// --- Kugou Direct Search ---
async function kugouDirectSearch(keyword, limit = 15) {
  const url = `${KUGOU_SEARCH_URL}?format=json&keyword=${encodeURIComponent(keyword)}&page=1&pagesize=${limit}&showtype=1`;
  const resp = await httpJson(url, {
    timeout: 6000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      'Referer': 'https://www.kugou.com',
    },
  });
  if (resp.statusCode !== 200) throw new Error(`Kugou HTTP ${resp.statusCode}`);
  const data = resp.body;
  if (data.status !== 1 || !data.data?.info) return [];
  return data.data.info.map((s, i) => ({
    singer: s.singername || '',
    title: s.songname || '',
    album: s.album_name || '',
    source: 'kg',
    songmid: s.hash || '',
    duration: s.duration || null,
    cover: '',
    n: i + 1,
    _origin: 'kugou_direct',
    _kugouHash: s.hash || '',
    _kugouAudioId: s.audio_id || '',
  }));
}

// --- Netease Direct Lyric ---
async function getNeteaseLyric(songId) {
  const url = `${NETEASE_API_BASE}/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
  const resp = await httpJson(url, {
    timeout: 5000,
    headers: {
      'Referer': 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (resp.statusCode !== 200) throw new Error('Netease lyric HTTP error');
  const data = resp.body;
  if (!data?.lrc?.lyric) throw new Error('No Netease lyric');
  return {
    lyric: data.lrc.lyric,
    tlyric: data.tlyric?.lyric || '',
  };
}

// --- Kuwo Direct Lyric ---
async function getKuwoLyric(songId) {
  const url = `${KUWO_LYRIC_BASE}?musicId=${songId}&httpStatus=1`;
  const resp = await httpJson(url, { timeout: 5000 });
  if (resp.statusCode !== 200) throw new Error('Kuwo lyric HTTP error');
  const lrclist = resp.body?.data?.lrclist;
  if (!lrclist?.length) throw new Error('No Kuwo lyric');
  const lrcLines = lrclist.map(l => {
    const t = parseFloat(l.time || '0');
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${l.lineLyric || ''}`;
  }).join('\n');
  return { lyric: lrcLines, tlyric: '' };
}

// --- Kugou Direct Lyric ---
async function getKugouLyric(hash, songName, artist, duration) {
  const keyword = `${artist} ${songName}`;
  const durationMs = duration ? duration * 1000 : 200000;
  const searchUrl = `${KUGOU_LYRIC_SEARCH_URL}?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(keyword)}&duration=${durationMs}&hash=${hash || ''}`;
  const searchResp = await httpJson(searchUrl, { timeout: 5000 });
  if (searchResp.statusCode !== 200 || !searchResp.body?.candidates?.length) throw new Error('No Kugou lyric candidate');
  const candidate = searchResp.body.candidates[0];
  const dlUrl = `${KUGOU_LYRIC_DOWNLOAD_URL}?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`;
  const dlResp = await httpJson(dlUrl, { timeout: 5000 });
  if (dlResp.statusCode !== 200 || !dlResp.body?.content) throw new Error('Kugou lyric download failed');
  const lrc = Buffer.from(dlResp.body.content, 'base64').toString('utf-8');
  if (!lrc) throw new Error('Kugou lyric empty');
  return { lyric: lrc, tlyric: '' };
}

// ============================ 搜索 ============================

// --- yaohu 直连搜索 ---
function extractSongs(data, upstream) {
  if (!data || data.code !== 200) return [];
  if (upstream === 'kuwo') {
    if (Array.isArray(data.data)) return data.data;
    return data.data?.songs || [];
  }
  if (upstream === 'qq' || upstream === 'tx') return data.data?.songs || [];
  return Array.isArray(data.data) ? data.data : (data.data?.songs || []);
}

function normalizeYaohuResult(song, source, index) {
  return {
    singer: song.singer || song.author || '',
    title: song.title || song.name || '',
    album: song.album || '',
    source,
    songmid: song.hash || song.mid || song.id || song.rid || String(index),
    duration: song.duration ? parseInt(song.duration) : null,
    cover: song.cover || song.img || '',
    n: index + 1,
    _origin: 'yaohu',
  };
}

async function yaohuDirectSearch(upstream, keyword, limit = 20) {
  const params = { key: '8Sbg8jJCnrssIDGDaz9', msg: keyword, g: String(limit) };
  if (upstream === 'migu') { params.num = String(limit); delete params.g; }
  const url = `${DIRECT_API_BASE}${upstream}?${buildQueryString(params)}`;
  const resp = await signedFetch(url);
  if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}`);
  const data = resp.body;
  if (data.code !== 200) {
    if (data.code === 404 && Array.isArray(data.data) && data.data.length === 0) return [];
    throw new Error(data.msg || `业务错误: ${data.code}`);
  }
  return extractSongs(data, upstream);
}

async function yaohuProxySearch(proxySource, keyword, limit = 20) {
  if (!PROXY_SUPPORTED.has(proxySource)) throw new Error(`代理不支持: ${proxySource}`);
  const params = { source: proxySource, msg: keyword, g: String(limit) };
  if (proxySource === 'migu') { params.num = String(limit); delete params.g; }
  const url = `${FALLBACK_PROXY_URL}?${buildQueryString(params)}`;
  const resp = await httpJson(url, { timeout: 10000 });
  if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}`);
  const data = resp.body;
  if (data.code !== 200) throw new Error(data.msg || '搜索失败');
  return extractSongs(data, proxySource);
}

// --- GDAPI 搜索（获取正确的平台ID） ---
async function gdApiSearch(sourceName, keyword, limit = 10) {
  if (Date.now() < gdApiBlockedUntil) return [];
  if (!GDAPI_SOURCES.includes(sourceName)) return [];
  
  const url = `${MAIN_API_BASE}&types=search&source=${sourceName}&name=${encodeURIComponent(keyword)}&limit=${limit}`;
  const resp = await httpJson(url, { timeout: 8000 });
  if (resp.statusCode !== 200) return [];
  
  const data = resp.body;
  if (!Array.isArray(data)) return [];
  
  return data.map((item, i) => ({
    id: String(item.id || item.url_id || ''),
    name: item.name || '',
    artist: Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || ''),
    album: item.album || '',
    source: item.source || sourceName,
    pic_id: item.pic_id || '',
    url_id: String(item.url_id || item.id || ''),
    lyric_id: String(item.lyric_id || item.id || ''),
  }));
}

function normalizeGDAPIResult(item, platformCode, index) {
  return {
    singer: item.artist || '',
    title: item.name || '',
    album: item.album || '',
    source: platformCode,
    songmid: item.id || item.url_id || String(index),
    duration: null,
    cover: '',
    n: index + 1,
    _origin: 'gdapi',
    _gdapiSource: item.source || GDAPI_SOURCE_MAP[platformCode],
    _lyricId: item.lyric_id || item.id || '',
  };
}

// --- 聚合搜索 ---
/**
 * 搜索歌曲 - 多平台
 * @param {string} keyword 搜索关键词
 * @param {string[]} platforms 平台列表，如 ['tx','kg','kw','mg','wy']
 * @param {number} limit 每平台返回数量
 */
async function search(keyword, platforms = ALL_PLATFORMS, limit = 20) {
  if (!initialized) await init();

  // Check cache first
  const cacheKey = `${keyword}:${platforms.join(',')}:${limit}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.time < SEARCH_CACHE_TTL) {
    console.log('[搜索] 缓存命中:', keyword);
    return cached.data;
  }

  const results = {};

  // All searches run in parallel for maximum speed
  const tasks = [];

  // 1. Netease direct search (FAST, reliable IDs + lyrics)
  if (platforms.includes('wy')) {
    tasks.push(
      neteaseDirectSearch(keyword, Math.min(limit, 15)).then(songs => {
        results['wy_netease'] = songs;
      }).catch(() => { results['wy_netease'] = []; })
    );
  }

  // 2. Kuwo direct search (FAST, reliable CDN URLs)
  if (platforms.includes('kw')) {
    tasks.push(
      kuwoDirectSearch(keyword, Math.min(limit, 15)).then(songs => {
        results['kw_kuwo'] = songs;
      }).catch(() => { results['kw_kuwo'] = []; })
    );
  }

  // 3. Kugou direct search
  if (platforms.includes('kg')) {
    tasks.push(
      kugouDirectSearch(keyword, Math.min(limit, 15)).then(songs => {
        results['kg'] = songs;
      }).catch(() => { results['kg'] = []; })
    );
  }

  // 4. yaohu search (for tx, mg - platforms not covered by direct APIs)
  const yaohuPlatforms = platforms.filter(p => ['tx', 'mg'].includes(p));
  yaohuPlatforms.forEach(platform => {
    const upstream = DIRECT_SOURCE_PATH[platform];
    if (!upstream) return;
    tasks.push(
      (async () => {
        try {
          let songs;
          try {
            songs = await yaohuDirectSearch(upstream, keyword, limit);
          } catch {
            if (PROXY_SUPPORTED.has(upstream)) {
              songs = await yaohuProxySearch(upstream, keyword, limit);
            } else {
              songs = [];
            }
          }
          results[platform] = songs.map((s, i) => normalizeYaohuResult(s, platform, i));
        } catch {
          results[platform] = [];
        }
      })()
    );
  });

  // 5. GDAPI search (backup for wy and kw)
  if (platforms.includes('wy')) {
    tasks.push(
      gdApiSearch('netease', keyword, Math.min(limit, 10)).then(items => {
        results['wy_gdapi'] = items.map((item, i) => normalizeGDAPIResult(item, 'wy', i));
      }).catch(() => { results['wy_gdapi'] = []; })
    );
  }

  if (platforms.includes('kw')) {
    tasks.push(
      gdApiSearch('kuwo', keyword, Math.min(limit, 10)).then(items => {
        results['kw_gdapi'] = items.map((item, i) => normalizeGDAPIResult(item, 'kw', i));
      }).catch(() => { results['kw_gdapi'] = []; })
    );
  }

  // Wait for ALL searches simultaneously
  await Promise.allSettled(tasks);

  // Merge results — deduplicate by title+artist similarity
  // wy: prefer netease_direct results, supplement with GDAPI
  if (results['wy_netease'] || results['wy_gdapi']) {
    const neteaseResults = results['wy_netease'] || [];
    const gdapiResults = results['wy_gdapi'] || [];
    const seen = new Set(neteaseResults.map(s => s.title.toLowerCase()));
    const uniqueGdapi = gdapiResults.filter(s => !seen.has(s.title.toLowerCase()));
    results['wy'] = neteaseResults.concat(uniqueGdapi);
    delete results['wy_netease'];
    delete results['wy_gdapi'];
  }

  // kw: prefer kuwo_direct, supplement with GDAPI
  if (results['kw_kuwo'] || results['kw_gdapi']) {
    const kuwoResults = results['kw_kuwo'] || [];
    const gdapiResults = results['kw_gdapi'] || [];
    const seen = new Set(kuwoResults.map(s => s.title.toLowerCase()));
    const uniqueGdapi = gdapiResults.filter(s => !seen.has(s.title.toLowerCase()));
    results['kw'] = kuwoResults.concat(uniqueGdapi);
    delete results['kw_kuwo'];
    delete results['kw_gdapi'];
  }

  // Cache results
  SEARCH_CACHE.set(cacheKey, { data: results, time: Date.now() });

  return results;
}

// ============================ 音频URL获取 ============================

// --- 策略1: GDAPI URL 解析（最可靠） ---
async function getMusicUrlGDAPI(source, songId, quality) {
  if (Date.now() < gdApiBlockedUntil) throw new Error('GDAPI 屏蔽中');
  if (serverStatus.gdApi === 'unavailable') throw new Error('GDAPI 不可用');
  
  // 检查缓存
  const cacheKey = `${source}:${songId}:${quality}`;
  if (gdApiEmptyCache.has(cacheKey)) {
    const cached = gdApiEmptyCache.get(cacheKey);
    if (Date.now() - cached < 600000) throw new Error('GDAPI 此歌曲曾返回空链接');
    gdApiEmptyCache.delete(cacheKey);
  }

  const apiSource = mainApiSourceMap[source];
  if (!apiSource) throw new Error('GDAPI 不支持此平台');
  
  const br = BR_MAP[quality] || '320';
  const url = `${MAIN_API_BASE}&types=url&source=${apiSource}&id=${songId}&br=${br}`;
  const resp = await httpJson(url, { timeout: 8000 });
  const data = resp.body;
  
  if (!data.url) {
    // 记录空链接但不全局屏蔽
    gdApiEmptyCache.set(cacheKey, Date.now());
    throw new Error('GDAPI 返回空链接');
  }
  
  // 清除缓存
  gdApiEmptyCache.delete(cacheKey);
  return data.url;
}

// --- 策略1.5: 通过 GDAPI 搜索 + URL 解析（跨平台通用） ---
async function getMusicUrlViaGDAPIFind(songName, singer, quality = '320k') {
  if (Date.now() < gdApiBlockedUntil) throw new Error('GDAPI 屏蔽中');
  
  const br = BR_MAP[quality] || '320';
  const searchSources = ['netease', 'kuwo'];
  
  for (const srcName of searchSources) {
    try {
      const items = await gdApiSearch(srcName, songName, 10);
      if (!items.length) continue;
      
      const normalized = items.map(item => ({
        ...item,
        singer: Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || ''),
      }));
      
      const best = findBestMatch(songName, singer || '', normalized.map(n => ({
        title: n.name,
        name: n.name,
        singer: n.singer,
        artist: n.singer,
      })));
      
      const targetItem = best 
        ? items[normalized.findIndex(n => (n.name || n.title) === (best.title || best.name)) || 0]
        : items[0];
      
      const url = `${MAIN_API_BASE}&types=url&source=${srcName}&id=${targetItem.id}&br=${br}`;
      const resp = await httpJson(url, { timeout: 8000 });
      const respUrl = typeof resp.body === 'object' ? resp.body?.url : null;
      
      if (respUrl) return respUrl;
      
    } catch {
      continue;
    }
  }
  
  throw new Error('GDAPI 搜索未找到可播放音源');
}

// --- 策略2: 网易云VIP通道 ---
async function getMusicUrlNeteaseVIP(songId, quality) {
  if (serverStatus.neteaseVipApi === 'unavailable') throw new Error('VIP API 不可用');
  const level = NETEASE_VIP_LEVEL_MAP[quality] || 'jymaster';
  const url = `${NETEASE_VIP_API}?id=${songId}&level=${level}`;
  const resp = await httpJson(url, { timeout: 8000 });
  if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}`);
  const data = resp.body;
  if (data.code !== 200 || !data.data?.url) throw new Error('VIP 未返回音频');
  return data.data.url;
}

// --- 策略3: yaohu 直连详情API ---
async function getMusicUrlYaohuDirect(source, songName, songIndex, quality) {
  const upstream = DIRECT_SOURCE_PATH[source];
  if (!upstream) throw new Error('无直连映射');
  
  // 检查平台状态（kw始终允许）
  if (source !== 'kw') {
    const upStatus = serverStatus.yaohuPlatforms[upstream];
    if (upStatus === 'unavailable' || upStatus === 'maintenance') {
      throw new Error(`yaohu ${upstream} 状态: ${upStatus}`);
    }
  }
  
  const params = { key: '8Sbg8jJCnrssIDGDaz9', msg: songName, n: String(songIndex || 1) };
  if (source === 'kw') {
    const sizeMap = { '128k': 'Standard', '192k': 'exhigh', '320k': 'SQ', 'flac': 'lossless', 'flac24bit': 'hires' };
    params.size = sizeMap[quality] || 'SQ';
  } else if (source === 'kg') {
    params.quality = 'flac';
  } else if (source === 'tx') {
    params.size = 'hq';
  }
  
  const url = `${DIRECT_API_BASE}${upstream}?${buildQueryString(params)}`;
  const resp = await signedFetch(url, { timeout: 15000 });
  if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}`);
  const detail = resp.body;
  if (detail.code !== 200) throw new Error(detail.msg || '直连详情失败');
  
  const musicUrl = detail.data?.vipmusic?.url || detail.data?.play_url || detail.data?.music_url || detail.data?.url || detail.data?.musicurl;
  if (!musicUrl) throw new Error('直连未返回音频');
  return musicUrl;
}

// --- 策略4: yaohu 代理 ---
async function getMusicUrlYaohuProxy(source, songName, songIndex) {
  const proxySource = DIRECT_SOURCE_PATH[source];
  if (!proxySource || !PROXY_SUPPORTED.has(proxySource)) throw new Error('代理不支持此平台');
  
  const params = { source: proxySource, msg: songName, n: String(songIndex || 1) };
  if (proxySource === 'kg') params.quality = 'flac';
  else if (proxySource === 'qq') params.size = 'hq';
  
  const url = `${FALLBACK_PROXY_URL}?${buildQueryString(params)}`;
  const resp = await httpJson(url, { timeout: 10000 });
  if (resp.statusCode !== 200) throw new Error(`HTTP ${resp.statusCode}`);
  const detail = resp.body;
  if (detail.code !== 200) throw new Error(detail.msg || '代理失败');
  
  const musicUrl = detail.data?.play_url || detail.data?.music_url || detail.data?.url || detail.data?.musicurl;
  if (!musicUrl) throw new Error('代理未返回音频');
  return musicUrl;
}

// --- Netease Song Detail URL (for free songs) ---
async function getNeteaseDetailUrl(songId, quality = '320k') {
  const brMap = { '128k': 128000, '192k': 192000, '320k': 320000 };
  const br = brMap[quality] || 320000;

  // Try the enhance player URL
  const url = `${NETEASE_API_BASE}/song/enhance/player/url?ids=[${songId}]&br=${br}`;
  const resp = await httpJson(url, {
    timeout: 5000,
    headers: {
      'Referer': 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (resp.statusCode !== 200) throw new Error('Netease detail HTTP error');
  const data = resp.body;
  const songData = Array.isArray(data?.data) ? data.data[0] : null;
  if (!songData?.url) throw new Error('Netease detail no URL (VIP?)');
  return songData.url;
}

// ============================ 主URL获取函数 ============================
/**
 * 获取音频播放URL - 新策略
 * 
 * 优先级:
 * 1. GDAPI 原生ID解析（如果歌曲来自GDAPI搜索，有正确的平台ID）
 * 2. GDAPI 跨平台搜索解析（用歌曲名+歌手在netease/kuwo搜索后获取URL）
 * 3. 网易云VIP通道（高音质wy源）
 * 4. yaohu 直连详情API
 * 5. yaohu 代理
 * 
 * @param {string} source 平台: wy/tx/kw/kg/mg
 * @param {string} songId 歌曲ID
 * @param {string} songName 歌曲名
 * @param {string} singer 歌手名
 * @param {number} songIndex 歌曲在搜索结果中的序号
 * @param {string} quality 音质
 * @param {string} _origin 搜索来源 (gdapi/yaohu)
 */
async function getMusicUrl(source, songId, songName, singer = '', songIndex = 1, quality = '320k', _origin = 'yaohu') {
  if (!initialized) await init();
  const errors = [];
  const avail = MUSIC_QUALITY[source] || ['128k', '320k'];
  const actualQuality = mapQuality(quality, avail);

  // 1. GDAPI 原生ID解析（仅当搜索结果来自GDAPI，ID是平台原生ID）
  if (_origin === 'gdapi' && GDAPI_SOURCE_MAP[source]) {
    try {
      const url = await getMusicUrlGDAPI(source, songId, actualQuality);
      return { url, method: 'gdapi_native', quality: actualQuality };
    } catch (e) {
      errors.push(`GDAPI原生: ${e.message}`);
    }
  }

  // 2. GDAPI 跨平台搜索解析（对任何平台都可用，通常返回完整音频）
  if (songName) {
    try {
      const parts = songName.split(/\s*[-—]\s*/);
      const searchName = parts[0] || songName;
      const url = await getMusicUrlViaGDAPIFind(searchName, singer, actualQuality);
      return { url, method: 'gdapi_find', quality: actualQuality };
    } catch (e) {
      errors.push(`GDAPI搜索: ${e.message}`);
    }
  }

  // 3. Netease detail URL (for free songs)
  if ((source === 'wy' || _origin === 'netease_direct') && songId) {
    try {
      const url = await getNeteaseDetailUrl(songId, actualQuality);
      return { url, method: 'netease_detail', quality: actualQuality };
    } catch (e) {
      errors.push(`Netease详情: ${e.message}`);
    }
  }

  // 4. Kuwo 直连 CDN URL（备用，可能返回短片段）
  if ((source === 'kw' || _origin === 'kuwo_direct') && songId) {
    try {
      const url = await getKuwoUrl(songId);
      return { url, method: 'kuwo_direct', quality: actualQuality };
    } catch (e) {
      errors.push(`Kuwo直连: ${e.message}`);
    }
  }

  // 3. 网易云VIP通道
  if (source === 'wy' && NETEASE_VIP_QUALITY_SET.has(actualQuality)) {
    try {
      const url = await getMusicUrlNeteaseVIP(songId, actualQuality);
      return { url, method: 'netease_vip', quality: actualQuality };
    } catch (e) { errors.push(`VIP: ${e.message}`); }
  }

  // 4. yaohu 直连详情API
  if (DIRECT_SOURCE_PATH[source] && songName) {
    try {
      const url = await getMusicUrlYaohuDirect(source, songName, songIndex, actualQuality);
      return { url, method: 'yaohu_direct', quality: actualQuality };
    } catch (e) { errors.push(`yaohu直连: ${e.message}`); }
  }

  // 5. yaohu 代理
  if (DIRECT_SOURCE_PATH[source]) {
    const proxySource = DIRECT_SOURCE_PATH[source];
    if (PROXY_SUPPORTED.has(proxySource) && songName) {
      try {
        const url = await getMusicUrlYaohuProxy(source, songName, songIndex);
        return { url, method: 'yaohu_proxy', quality: actualQuality };
      } catch (e) { errors.push(`yaohu代理: ${e.message}`); }
    }
  }

  throw new Error(`无可用音源 [${errors.join('; ')}]`);
}

// ============================ 跨平台降级获取音频URL ============================
/**
 * 跨平台降级获取音频URL
 * 如果主源失败，优先通过 GDAPI 在 netease/kuwo 上搜索同名歌曲
 * 
 * @param {string} source 原始平台
 * @param {string} songId 歌曲ID
 * @param {string} songName 歌曲名
 * @param {string} singer 歌手名
 * @param {number} songIndex 歌曲序号
 * @param {string} quality 音质
 * @param {string} _origin 搜索来源
 */
async function getMusicUrlWithFallback(source, songId, songName, singer = '', songIndex = 1, quality = '320k', _origin = 'yaohu') {
  if (!initialized) await init();

  // 1. 先尝试主源（包含GDAPI搜索解析）
  try {
    const result = await getMusicUrl(source, songId, songName, singer, songIndex, quality, _origin);
    return result;
  } catch (primaryErr) {
    const primaryError = primaryErr.message;

    // 2. 跨平台降级：通过 GDAPI 在 netease 上搜索
    const cleanName = removeSpecialChars(songName);
    const searchKeyword = cleanName || songName;
    
    if (searchKeyword) {
      // Try Netease direct search for fallback
      try {
        const neteaseResults = await neteaseDirectSearch(searchKeyword, 10);
        if (neteaseResults.length > 0) {
          const best = findBestMatch(songName, singer, neteaseResults);
          if (best) {
            try {
              const url = await getNeteaseDetailUrl(best.songmid, quality);
              if (url) {
                return { url, method: 'fallback_netease', quality, fallbackFrom: source, fallbackTo: 'wy', matchedSong: best.title };
              }
            } catch {}
          }
        }
      } catch {}

      // 尝试 GDAPI netease 跨平台搜索
      for (const srcName of ['netease', 'kuwo']) {
        try {
          const items = await gdApiSearch(srcName, searchKeyword, 15);
          if (!items.length) continue;

          // 找最佳匹配
          const normalized = items.map(item => ({
            title: item.name,
            name: item.name,
            singer: Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || ''),
            artist: Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || ''),
          }));
          
          const best = findBestMatch(songName, singer, normalized);
          if (!best) continue;

          // 获取匹配歌曲的ID
          const matchIndex = normalized.findIndex(n => n.title === (best.title || best.name));
          const matchItem = items[matchIndex >= 0 ? matchIndex : 0];
          
          // 通过 GDAPI 获取URL
          const br = BR_MAP[quality] || '320';
          const url = `${MAIN_API_BASE}&types=url&source=${srcName}&id=${matchItem.id}&br=${br}`;
          const resp = await httpJson(url, { timeout: 8000 });
          
          if (resp.body?.url) {
            return {
              url: resp.body.url,
              method: 'fallback_gdapi',
              quality,
              fallbackFrom: source,
              fallbackTo: srcName,
              matchedSong: matchItem.name || songName,
            };
          }
        } catch {
          continue;
        }
      }

      // 3. yaohu 跨平台降级
      const fallbackSources = ['kw', 'tx', 'kg', 'mg'].filter(s => s !== source);
      for (const fbSource of fallbackSources) {
        try {
          const upstream = DIRECT_SOURCE_PATH[fbSource];
          if (!upstream) continue;

          const songs = await yaohuDirectSearch(upstream, searchKeyword, 10);
          if (!songs?.length) continue;

          const best = findBestMatch(songName, singer, songs);
          if (!best) continue;

          const matchIndex = songs.indexOf(best) + 1;
          const url = await getMusicUrlYaohuDirect(fbSource, searchKeyword, matchIndex, quality);
          return {
            url,
            method: 'fallback_yaohu',
            quality,
            fallbackFrom: source,
            fallbackTo: fbSource,
            matchedSong: best.title || best.name || songName,
          };
        } catch {
          continue;
        }
      }
    }

    throw new Error(`无可用音源（含跨平台降级） [主源: ${primaryError}]`);
  }
}

// ============================ 歌词获取 ============================

// --- Lyrics from GDAPI ---
async function getLyricGDAPI(source, lyricId) {
  if (Date.now() < gdApiBlockedUntil) throw new Error('GDAPI 屏蔽中');
  
  const apiSource = mainApiSourceMap[source] || GDAPI_SOURCE_MAP[source];
  if (!apiSource) throw new Error('不支持此平台的歌词获取');
  
  const url = `${MAIN_API_BASE}&types=lyric&source=${apiSource}&id=${lyricId}`;
  const resp = await httpJson(url, { timeout: 8000 });
  
  if (resp.statusCode !== 200) throw new Error(`歌词请求失败: HTTP ${resp.statusCode}`);
  const data = resp.body;
  
  if (!data || (!data.lyric && !data.lrc && !data.tlyric)) {
    throw new Error('未获取到歌词');
  }
  
  return {
    lyric: data.lyric || data.lrc || '',
    tlyric: data.tlyric || '',
  };
}

// --- getLyric wrapper (multi-strategy with direct APIs) ---
async function getLyric(source, lyricId, songName = '', singer = '') {
  if (!initialized) await init();
  const errors = [];

  // Strategy 0: Check curated song ID map (bypasses Netease VIP suppression)
  if (songName && singer) {
    const knownId = findKnownSongId(songName, singer);
    if (knownId) {
      try {
        console.log(`[歌词] 使用映射表ID: ${singer} - ${songName} → ${knownId}`);
        return await getNeteaseLyric(knownId);
      } catch (e) { errors.push(`映射表: ${e.message}`); }
    }
  }

  // Strategy 1: If singer is known, search Netease for the correct song
  // Filter out fake artists (names like "周杰伦." "周杰伦-" with extra chars)
  if (songName && singer) {
    try {
      const items = await neteaseDirectSearch(`${singer} ${songName}`, 20);
      if (items.length > 0) {
        // Filter: only keep results where singer EXACTLY matches or is a clean subset
        const cleanSinger = singer.trim();
        const validItems = items.filter(item => {
          const itemSinger = (item.singer || '').trim();
          // Exact match or singer name is the full artist name
          return itemSinger === cleanSinger ||
                 itemSinger.startsWith(cleanSinger + '/') ||
                 itemSinger.endsWith('/' + cleanSinger) ||
                 itemSinger.includes('/' + cleanSinger + '/');
        });
        // Only use filtered results — NEVER fall back to unfiltered items[0]
        const best = validItems.find(s => s.duration && s.duration > 100) || validItems[0] || null;
        if (best) {
          try {
            return await getNeteaseLyric(best.songmid);
          } catch (e) { errors.push(`Netease精确匹配: ${e.message}`); }
        } else {
          console.log(`[歌词] 搜索到 ${items.length} 条结果，但无匹配歌手 "${singer}"，跳过`);
        }
      }
    } catch (e) { errors.push(`Netease搜索: ${e.message}`); }
  }

  // Strategy 2: Kuwo direct lyric API
  if ((source === 'kw' || source === 'kuwo') && lyricId) {
    try {
      return await getKuwoLyric(lyricId);
    } catch (e) { errors.push(`Kuwo: ${e.message}`); }
  }

  // Strategy 3: Kugou direct lyric API
  if (source === 'kg' && (lyricId || songName)) {
    try {
      return await getKugouLyric(lyricId, songName, singer);
    } catch (e) { errors.push(`Kugou: ${e.message}`); }
  }

  // Strategy 4: Netease lyric with provided ID (from search result _lyricId)
  if (lyricId) {
    try {
      return await getNeteaseLyric(lyricId);
    } catch (e) { errors.push(`Netease ID: ${e.message}`); }
  }

  // Strategy 5: GDAPI lyrics
  if (lyricId) {
    try {
      return await getLyricGDAPI(source, lyricId);
    } catch (e) { errors.push(`GDAPI: ${e.message}`); }
  }

  // Strategy 6: Last resort - search Netease by song name only
  if (songName) {
    try {
      const kw = singer ? `${singer} ${songName}` : songName;
      const items = await neteaseDirectSearch(kw, 10);
      if (items.length > 0) {
        // Prefer items with real duration (real songs, not clips)
        const target = items.find(s => s.duration && s.duration > 100) || items[0];
        if (target) {
          return await getNeteaseLyric(target.songmid);
        }
      }
    } catch (e) { errors.push(`Netease名称搜索: ${e.message}`); }
  }

  throw new Error(`无法获取歌词 [${errors.join('; ')}]`);
}

// ============================ 初始化 ============================
async function init() {
  if (initialized) return;
  try {
    await fetchServerStatus();
    const sources = await fetchStableSources();
    buildPlatformMap(sources);
    // 预取签名凭证
    fetchCredentials().catch(() => {});
    initialized = true;
    console.log('[星海音乐源] 初始化完成');
    console.log('[星海] GDAPI源映射:', JSON.stringify(mainApiSourceMap));
    console.log('[星海] GDAPI可用源:', GDAPI_SOURCES);
  } catch (err) {
    console.error('[星海音乐源] 初始化异常:', err.message);
    // 降级初始化
    buildPlatformMap(['netease', 'tencent', 'kuwo', 'kugou', 'migu']);
    initialized = true;
  }
}

// ============================ 公开接口 ============================
function getPlatformInfo() {
  return ALL_PLATFORMS.map(p => ({
    code: p,
    name: PLATFORM_NAME_MAP[p],
    qualities: MUSIC_QUALITY[p] || ['128k', '320k'],
    gdapi: !!mainApiSourceMap[p] || !!GDAPI_SOURCE_MAP[p],
    direct: !!DIRECT_SOURCE_PATH[p],
    proxy: PROXY_SUPPORTED.has(DIRECT_SOURCE_PATH[p]),
    gdapiSearch: !!GDAPI_SOURCE_MAP[p],
  }));
}

function getStatus() {
  return {
    initialized,
    gdApi: serverStatus.gdApi,
    gdApiBlocked: Date.now() < gdApiBlockedUntil,
    gdApiBlockedUntil: gdApiBlockedUntil > Date.now() ? new Date(gdApiBlockedUntil).toISOString() : null,
    neteaseVip: serverStatus.neteaseVipApi,
    platforms: { ...serverStatus.yaohuPlatforms },
    online: serverStatus.online,
    gdapiSources: GDAPI_SOURCES,
    mainApiMap: mainApiSourceMap,
  };
}

function resetBlocks() {
  gdApiBlockedUntil = 0;
  gdApiEmptyCache.clear();
  serverStatus.yaohuPlatforms = { kg: 'unknown', qq: 'unknown', migu: 'unknown', kw: 'unknown' };
  serverStatus.gdApi = 'unknown';
  console.log('[星海] 已重置所有屏蔽状态');
}

module.exports = {
  init,
  search,
  getMusicUrl,
  getMusicUrlWithFallback,
  getLyricGDAPI,
  getLyric,
  getPlatformInfo,
  getStatus,
  resetBlocks,
  neteaseDirectSearch,
  kuwoDirectSearch,
  kugouDirectSearch,
  getKuwoUrl,
  getNeteaseDetailUrl,
  getNeteaseLyric,
  getKuwoLyric,
  getKugouLyric,
  findKnownSongId,
  PLATFORM_NAME_MAP,
  ALL_PLATFORMS,
};
