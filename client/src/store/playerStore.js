import { create } from 'zustand';

export const usePlayerStore = create((set, get) => ({
  // Current state
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.75,
  isMuted: false,
  playMode: 'sequence', // 'sequence' | 'shuffle' | 'repeat' | 'repeat-one'

  // Queue
  queue: [],
  queueIndex: -1,
  history: [],

  // Audio element (managed externally)
  audio: null,

  // Actions
  setAudio: (audio) => set({ audio }),

  playSong: (song, queue = null) => {
    const state = get();
    const newQueue = queue || state.queue;
    const index = newQueue.findIndex(s => s.id === song.id);

    if (state.currentSong && state.currentSong.id !== song.id) {
      set(s => ({
        history: [...s.history.slice(-50), s.currentSong]
      }));
    }

    set({
      currentSong: song,
      isPlaying: true,
      queue: newQueue,
      queueIndex: index >= 0 ? index : 0,
      currentTime: 0,
    });
  },

  togglePlay: () => {
    set(s => ({ isPlaying: !s.isPlaying }));
  },

  updateTime: (time) => set({ currentTime: time }),
  updateDuration: (dur) => set({ duration: dur }),

  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)), isMuted: vol === 0 }),
  toggleMute: () => set(s => ({ isMuted: !s.isMuted })),

  seek: (time) => set({ currentTime: time }),

  nextSong: () => {
    const { queue, queueIndex, playMode } = get();
    if (queue.length === 0) return;

    let nextIndex;
    if (playMode === 'shuffle') {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (playMode === 'repeat') nextIndex = 0;
        else return;
      }
    }

    const song = queue[nextIndex];
    if (song) {
      set(s => ({
        currentSong: song,
        queueIndex: nextIndex,
        isPlaying: true,
        currentTime: 0,
        history: s.currentSong ? [...s.history.slice(-50), s.currentSong] : s.history
      }));
    }
  },

  prevSong: () => {
    const { queue, queueIndex, currentTime } = get();

    // If more than 3 seconds in, restart current song
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0 && queue[prevIndex]) {
      set(s => ({
        currentSong: queue[prevIndex],
        queueIndex: prevIndex,
        isPlaying: true,
        currentTime: 0,
      }));
    }
  },

  cyclePlayMode: () => {
    const modes = ['sequence', 'shuffle', 'repeat', 'repeat-one'];
    set(s => {
      const idx = modes.indexOf(s.playMode);
      return { playMode: modes[(idx + 1) % modes.length] };
    });
  },

  onSongEnd: () => {
    const { playMode } = get();
    if (playMode === 'repeat-one') {
      set({ currentTime: 0, isPlaying: true });
    } else {
      get().nextSong();
    }
  },
}));
