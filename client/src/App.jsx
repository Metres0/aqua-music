import { useEffect, useRef, useCallback, useState } from 'react';
import './styles/glass.css';
import './styles/app.css';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Player from './components/Player';
import LyricsPage from './components/LyricsPage';
import ImportModal from './components/ImportModal';
import SearchModal from './components/SearchModal';
import { usePlayerStore } from './store/playerStore';
import { useLibraryStore } from './store/libraryStore';
import { api } from './utils/api';

function SvgFilters() {
  return (
    <svg className="svg-filters" aria-hidden="true">
      <defs>
        <filter id="water-distortion">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" seed="2" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

function App() {
  const audioRef = useRef(null);
  const [showLyricsPage, setShowLyricsPage] = useState(false);

  const {
    currentSong, isPlaying, volume, isMuted,
    seek, updateTime, updateDuration, setAudio,
    onSongEnd,
  } = usePlayerStore();

  const { showImportModal, showSearchModal, fetchPlaylists } = useLibraryStore();

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;
    setAudio(audio);

    const onTimeUpdate = () => updateTime(audio.currentTime);
    const onDurationChange = () => updateDuration(audio.duration || 0);
    const onEnded = () => onSongEnd();

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Handle song changes — resolve URL for online songs
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    const audio = audioRef.current;

    const resolveAndPlay = async () => {
      // 在线歌曲（来自星海源搜索结果）— 使用 GET 重定向端点，浏览器自动跟随 302
      if (currentSong._online && currentSong.songmid) {
        audio.src = api.getOnlineStreamRedirectUrl(currentSong);
        if (isPlaying) {
          await audio.play().catch(() => {});
        }
      }
      // 本地歌曲
      else if (currentSong.local_path || currentSong.source === 'local') {
        audio.src = api.getStreamUrl(currentSong.id);
        if (isPlaying) {
          await audio.play().catch(() => {});
        }
      }
      // QQ音乐导入的歌曲 — 用星海源tx通道，同样使用 GET 重定向端点
      else if (currentSong.source === 'qq_music' && currentSong.id) {
        const sourceUrl = currentSong.source_url || '';
        const qqMid = sourceUrl.replace('qq_music:', '');
        if (qqMid) {
          audio.src = api.getOnlineStreamRedirectUrl({
            source: 'tx',
            songmid: qqMid,
            title: currentSong.title,
            n: currentSong.n || 1,
            singer: currentSong.artist || currentSong.singer || '',
            _origin: 'yaohu',
          });
          if (isPlaying) {
            await audio.play().catch(() => {});
          }
        }
      }
    };

    resolveAndPlay();
  }, [currentSong?.id, currentSong?.songmid]);

  // Handle play/pause toggle
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    const audio = audioRef.current;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Handle volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleSeek = useCallback((time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    seek(time);
  }, [seek]);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  return (
    <div className="app">
      <SvgFilters />
      <div className="app-background">
        <div className="app-background__gradient" />
      </div>
      {showLyricsPage && currentSong ? (
        <LyricsPage onClose={() => setShowLyricsPage(false)} />
      ) : (
        <div className="app-layout">
          <Sidebar />
          <MainContent />
        </div>
      )}
      <Player
        onSeek={handleSeek}
        isResolving={false}
        onToggleLyrics={() => setShowLyricsPage(v => !v)}
        showLyricsPage={showLyricsPage}
      />
      {showImportModal && <ImportModal />}
      {showSearchModal && <SearchModal />}
    </div>
  );
}

export default App;
