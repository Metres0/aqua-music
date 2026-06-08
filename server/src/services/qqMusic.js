const fetch = require('node-fetch');
const cheerio = require('cheerio');

const QQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://y.qq.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

/**
 * Extract playlist ID from various QQ Music URL formats
 */
function extractPlaylistId(url) {
  // Direct ID
  if (/^\d+$/.test(url.trim())) return url.trim();

  // https://y.qq.com/n/ryqq/playlist/xxxxxxxx
  let match = url.match(/playlist\/(\d+)/);
  if (match) return match[1];

  // https://y.qq.com/n/yqq/playsquare/xxxxxxxx.html
  match = url.match(/playsquare\/(\d+)/);
  if (match) return match[1];

  // id=xxxxxxxx in query params
  match = url.match(/[?&]id=(\d+)/);
  if (match) return match[1];

  // https://i.y.qq.com/n2/m/share/details/taoge.html?id=xxxxxxxx
  match = url.match(/[?&]id=(\d+)/);
  if (match) return match[1];

  return null;
}

/**
 * Fetch playlist details and songs from QQ Music API
 */
async function fetchPlaylist(playlistUrl) {
  const disstid = extractPlaylistId(playlistUrl);
  if (!disstid) {
    throw new Error('无法从链接中提取歌单ID，请检查链接格式');
  }

  // Try the c.y.qq.com API first (more reliable)
  const apiUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${disstid}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;

  try {
    const response = await fetch(apiUrl, { headers: QQ_HEADERS, timeout: 15000 });
    const data = await response.json();

    if (!data.cdlist || !data.cdlist[0]) {
      // Fallback: try the u.y.qq.com API
      return await fetchPlaylistV2(disstid);
    }

    const cd = data.cdlist[0];
    return {
      id: disstid,
      name: cd.dissname || '未命名歌单',
      description: cd.desc || '',
      cover: cd.logo || '',
      songCount: cd.songnum || 0,
      songs: (cd.songlist || []).map(normalizeSong),
      source: 'qq_music'
    };
  } catch (err) {
    // Fallback to V2 API
    return await fetchPlaylistV2(disstid);
  }
}

/**
 * V2 API fallback using u.y.qq.com
 */
async function fetchPlaylistV2(disstid) {
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify({
    playlist: {
      method: 'get_playlist_detail',
      module: 'playlist.PlaylistDetailServer',
      param: { disstid: parseInt(disstid), song_begin: 0, song_num: 200 }
    }
  }))}`;

  const response = await fetch(url, { headers: QQ_HEADERS, timeout: 15000 });
  const data = await response.json();

  const playlist = data?.playlist?.data;
  if (!playlist) {
    throw new Error('无法获取歌单信息，请检查链接是否正确');
  }

  const dirinfo = playlist.dirinfo || {};
  return {
    id: disstid,
    name: dirinfo.title || playlist.title || '未命名歌单',
    description: dirinfo.desc || '',
    cover: dirinfo.picurl || playlist.cover || '',
    songCount: dirinfo.songnum || 0,
    songs: (playlist.songlist || playlist.songList || []).map(normalizeSongV2),
    source: 'qq_music'
  };
}

/**
 * Normalize song data from V1 API (c.y.qq.com)
 * Handles both old format (songmid/songname) and new format (mid/name)
 */
function normalizeSong(song) {
  const mid = song.mid || song.songmid || '';
  const albumMid = song.album?.mid || song.albummid || '';
  return {
    sourceId: mid || song.songid?.toString() || song.id?.toString() || '',
    title: song.name || song.songname || song.title || '',
    artist: (song.singer || []).map(s => s.name || s.title).join(' / '),
    album: song.album?.name || song.albumname || '',
    duration: song.interval || 0,
    cover: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
    source: 'qq_music'
  };
}

/**
 * Normalize song data from V2 API
 */
function normalizeSongV2(song) {
  const info = song.info || song;
  return {
    sourceId: info.mid || song.mid || '',
    title: info.name || song.name || '',
    artist: (info.singer || song.singer || []).map(s => s.name || s.title).join(' / '),
    album: (info.album || song.album || {}).name || '',
    duration: info.interval || song.interval || 0,
    cover: (info.album || song.album || {}).mid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${(info.album || song.album).mid}.jpg`
      : '',
    source: 'qq_music'
  };
}

/**
 * Search songs on QQ Music
 */
async function searchSongs(keyword, page = 1, pageSize = 20) {
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify({
    search: {
      method: 'do_search',
      module: 'music.search.SearchCgiService',
      param: {
        num_per_page: pageSize,
        page_num: page,
        query: keyword,
        search_type: 0
      }
    }
  }))}`;

  const response = await fetch(url, { headers: QQ_HEADERS, timeout: 10000 });
  const data = await response.json();

  const body = data?.search?.data?.body || {};
  const songs = body.song?.list || body.item_song || [];

  return {
    total: body.song?.totalcount || 0,
    songs: songs.map(normalizeSongV2)
  };
}

module.exports = {
  extractPlaylistId,
  fetchPlaylist,
  searchSongs
};
