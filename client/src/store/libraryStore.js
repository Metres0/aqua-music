import { create } from 'zustand';
import { api } from '../utils/api';

export const useLibraryStore = create((set, get) => ({
  playlists: [],
  currentPlaylist: null,
  currentPlaylistSongs: [],
  loading: false,
  error: null,

  // UI state
  showImportModal: false,
  showSearchModal: false,
  showUploadModal: false,
  sidebarActive: 'library', // 'library' | 'playlist'

  // Fetch all playlists
  fetchPlaylists: async () => {
    try {
      const playlists = await api.getPlaylists();
      set({ playlists });
    } catch (err) {
      set({ error: err.message });
    }
  },

  // Load a specific playlist with songs
  loadPlaylist: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getPlaylist(id);
      set({
        currentPlaylist: data,
        currentPlaylistSongs: data.songs || [],
        loading: false,
        sidebarActive: 'playlist'
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // Import QQ Music playlist
  importQQPlaylist: async (url) => {
    set({ loading: true, error: null });
    try {
      const result = await api.importQQPlaylist(url);
      // Refresh playlists after import
      await get().fetchPlaylists();
      // Load the imported playlist
      await get().loadPlaylist(result.playlistId);
      set({ loading: false, showImportModal: false });
      return result;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  // Create new playlist
  createPlaylist: async (name, description) => {
    try {
      const playlist = await api.createPlaylist(name, description);
      set(s => ({ playlists: [playlist, ...s.playlists] }));
      return playlist;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  // Delete playlist
  deletePlaylist: async (id) => {
    try {
      await api.deletePlaylist(id);
      set(s => ({
        playlists: s.playlists.filter(p => p.id !== id),
        currentPlaylist: s.currentPlaylist?.id === id ? null : s.currentPlaylist,
        currentPlaylistSongs: s.currentPlaylist?.id === id ? [] : s.currentPlaylistSongs,
      }));
    } catch (err) {
      set({ error: err.message });
    }
  },

  // Upload files
  uploadFiles: async (files, playlistId) => {
    set({ loading: true });
    try {
      const result = await api.uploadFiles(files, playlistId);
      // Refresh current playlist if uploading to it
      if (playlistId) {
        await get().loadPlaylist(playlistId);
      }
      set({ loading: false, showUploadModal: false });
      return result;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  // Search (multi-platform)
  search: async (query, platforms = null) => {
    set({ loading: true });
    try {
      const results = await api.search(query, platforms);
      set({ loading: false });
      return results;
    } catch (err) {
      set({ error: err.message, loading: false });
      return { local: [], platforms: {}, platforms_list: [] };
    }
  },

  // UI toggles
  toggleImportModal: () => set(s => ({ showImportModal: !s.showImportModal })),
  toggleSearchModal: () => set(s => ({ showSearchModal: !s.showSearchModal })),
  toggleUploadModal: () => set(s => ({ showUploadModal: !s.showUploadModal })),
  setSidebarActive: (active) => set({ sidebarActive: active }),
  clearError: () => set({ error: null }),

  // Favorites — uses the first playlist ("我喜欢的音乐")
  favoriteSong: async (song) => {
    const { playlists } = get();
    if (!playlists.length) return;
    const favPlaylistId = playlists[0].id;
    try {
      await api.addSongsToPlaylist(favPlaylistId, [song.id]);
    } catch (err) {
      set({ error: err.message });
    }
  },

  unfavoriteSong: async (songId) => {
    const { playlists } = get();
    if (!playlists.length) return;
    const favPlaylistId = playlists[0].id;
    try {
      await api.removeSongFromPlaylist(favPlaylistId, songId);
    } catch (err) {
      set({ error: err.message });
    }
  },

  isFavorite: (songId) => {
    const { playlists } = get();
    if (!playlists.length) return false;
    // Check if the song is in the first playlist's songs
    const favPlaylist = playlists[0];
    if (favPlaylist.songs) {
      return favPlaylist.songs.some(s => s.id === songId);
    }
    return false;
  },
}));
