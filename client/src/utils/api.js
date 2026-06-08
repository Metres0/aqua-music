const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };

    const response = await fetch(url, config);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // === Health ===
  health() {
    return this.request('/health');
  }

  // === Playlists ===
  getPlaylists() { return this.request('/playlists'); }
  getPlaylist(id) { return this.request(`/playlists/${id}`); }
  createPlaylist(name, description = '') {
    return this.request('/playlists', { method: 'POST', body: JSON.stringify({ name, description }) });
  }
  updatePlaylist(id, data) {
    return this.request(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  deletePlaylist(id) { return this.request(`/playlists/${id}`, { method: 'DELETE' }); }
  addSongsToPlaylist(playlistId, songIds) {
    return this.request(`/playlists/${playlistId}/songs`, { method: 'POST', body: JSON.stringify({ songIds }) });
  }
  removeSongFromPlaylist(playlistId, songId) {
    return this.request(`/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' });
  }

  // === Songs ===
  getSongs(page = 1, limit = 50) { return this.request(`/songs?page=${page}&limit=${limit}`); }
  getSong(id) { return this.request(`/songs/${id}`); }
  getStreamUrl(id) { return `${this.baseUrl}/songs/${id}/stream`; }
  deleteSong(id) { return this.request(`/songs/${id}`, { method: 'DELETE' }); }

  // === Import ===
  importQQPlaylist(url) {
    return this.request('/import/qq-playlist', { method: 'POST', body: JSON.stringify({ url }) });
  }

  // === 星海多平台搜索 ===
  search(query, platforms = null, limit = 20) {
    let url = `/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    if (platforms && platforms.length > 0) {
      url += `&platforms=${platforms.join(',')}`;
    }
    return this.request(url);
  }

  // === 搜索平台列表 ===
  getSearchPlatforms() { return this.request('/search/platforms'); }

  // === 获取在线音频URL（星海源） ===
  getOnlineMusicUrl(song) {
    return this.request('/stream/url', {
      method: 'POST',
      body: JSON.stringify({
        source: song.source,
        songId: song.songmid,
        songName: song.title,
        songIndex: song.n || song.index || 1,
        quality: '320k',
        origin: song._origin || 'yaohu',
        singer: song.singer || '',
      }),
    });
  }

  // === 获取在线音频重定向URL（直接用于 Audio src） ===
  getOnlineStreamRedirectUrl(song) {
    const params = new URLSearchParams({
      source: song.source,
      songId: song.songmid,
      songName: song.title,
      songIndex: String(song.n || song.index || 1),
      quality: '320k',
      origin: song._origin || 'yaohu',
      singer: song.singer || '',
    });
    return `${this.baseUrl}/stream/url?${params.toString()}`;
  }

  // === Save Online Song to DB ===
  saveOnlineSong(song) {
    return this.request('/songs/save-online', {
      method: 'POST',
      body: JSON.stringify({
        title: song.title,
        artist: song.singer || song.artist || '',
        album: song.album || '',
        source: song.source,
        songmid: song.songmid,
        cover: song.cover || song.cover_url || '',
        duration: song.duration || null,
        source_url: `online:${song.source}:${song.songmid}`,
      }),
    });
  }

  // === Lyrics ===
  getLyric(source, lyricId, songName = '', singer = '') {
    const params = new URLSearchParams({ source, lyricId: lyricId || '' });
    if (songName) params.set('songName', songName);
    if (singer) params.set('singer', singer);
    return this.request(`/stream/lyric?${params.toString()}`);
  }

  // === Upload ===
  uploadFiles(files, playlistId) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (playlistId) formData.append('playlistId', playlistId);
    return fetch(`${this.baseUrl}/upload/music`, { method: 'POST', body: formData }).then(res => res.json());
  }

  // === 自定义音源管理 ===
  getSources() { return this.request('/sources'); }
  getSourceDetail(id) { return this.request(`/sources/${id}`); }
  addSource(data) {
    return this.request('/sources', { method: 'POST', body: JSON.stringify(data) });
  }
  deleteSource(id) {
    return this.request(`/sources/${id}`, { method: 'DELETE' });
  }
  toggleSource(id, enabled) {
    return this.request(`/sources/${id}/toggle`, { method: 'PUT', body: JSON.stringify({ enabled }) });
  }
  refreshSource(id) {
    return this.request(`/sources/${id}/refresh`, { method: 'POST' });
  }
  testSource(id) {
    return this.request(`/sources/${id}/test`, { method: 'POST' });
  }
  testSourceUrl(url) {
    return this.request('/sources/test-url', { method: 'POST', body: JSON.stringify({ url }) });
  }
}

export const api = new ApiClient();
