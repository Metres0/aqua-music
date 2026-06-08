import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useLibraryStore } from '../store/libraryStore';
import { api } from '../utils/api';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Player({ onSeek, isResolving, onToggleLyrics, showLyricsPage }) {
  const {
    currentSong, isPlaying, currentTime, duration, volume, isMuted,
    playMode,
    togglePlay, setVolume, toggleMute, cyclePlayMode,
    nextSong, prevSong,
  } = usePlayerStore();

  const { isFavorite, favoriteSong, unfavoriteSong } = useLibraryStore();
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    if (currentSong?.id) {
      setIsFav(isFavorite(currentSong.id));
    } else {
      setIsFav(false);
    }
  }, [currentSong]);

  const handleFavorite = async () => {
    if (!currentSong) return;

    if (isFav) {
      // Unfavorite
      await unfavoriteSong(currentSong.id);
      setIsFav(false);
    } else {
      // Favorite
      if (currentSong._online) {
        // Online song: save to DB first, then favorite
        try {
          const saved = await api.saveOnlineSong(currentSong);
          const songToFavorite = { ...currentSong, ...saved, id: saved.id };
          await favoriteSong(songToFavorite);
          setIsFav(true);
        } catch (err) {
          console.error('Failed to save online song:', err);
        }
      } else {
        // Local song: favorite directly
        await favoriteSong(currentSong);
        setIsFav(true);
      }
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    onSeek(percent * duration);
  };

  return (
    <div className="player-bar glass-panel">
      {/* Song Info */}
      <div className="player-bar__song-info">
        <div className="player-bar__cover album-art">
          {currentSong?.cover_url || currentSong?.cover ? (
            <img src={currentSong.cover_url || currentSong.cover} alt="" />
          ) : (
            <div className="player-bar__cover-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          )}
        </div>
        <div className="player-bar__text" onClick={onToggleLyrics} style={{ cursor: currentSong ? 'pointer' : 'default' }}>
          <div className="player-bar__title">
            {currentSong?.title || '未播放'}
            {currentSong?._online && currentSong?.source && (
              <span style={{
                display: 'inline-block',
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 4,
                marginLeft: 6,
                background: { wy: '#ff3b30', tx: '#31c27c', kw: '#ff9500', kg: '#007aff', mg: '#af52de' }[currentSong.source] || '#888',
                color: 'white',
                fontWeight: 600,
                verticalAlign: 'middle',
              }}>
                {({ wy: '网易', tx: 'QQ', kw: '酷我', kg: '酷狗', mg: '咪咕' })[currentSong.source] || '在线'}
              </span>
            )}
          </div>
          <div className="player-bar__artist">
            {currentSong?.artist || '选择一首歌曲开始播放'}
          </div>
        </div>
        {isPlaying && currentSong && (
          <div className="playing-indicator">
            <span></span><span></span><span></span><span></span>
          </div>
        )}
      </div>

      {/* Center Controls */}
      <div className="player-bar__controls">
        <div className="player-bar__buttons">
          <button
            className={`glass-btn glass-btn-icon ${playMode !== 'sequence' ? 'glass-btn-primary' : ''}`}
            onClick={cyclePlayMode}
            title={
              playMode === 'sequence' ? '顺序播放' :
              playMode === 'shuffle' ? '随机播放' :
              playMode === 'repeat' ? '列表循环' : '单曲循环'
            }
          >
            {playMode === 'shuffle' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polyline points="16,3 21,3 21,8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21,16 21,21 16,21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="17,1 21,5 17,9" />
                  <path d="M3 11V9a4 4 0 014-4h14" />
                  <polyline points="7,23 3,19 7,15" />
                  <path d="M21 13v2a4 4 0 01-4 4H3" />
                </svg>
                {playMode === 'repeat-one' && (
                  <span style={{ position: 'absolute', fontSize: '8px', fontWeight: 'bold', bottom: '4px' }}>1</span>
                )}
              </>
            )}
          </button>

          <button className="glass-btn glass-btn-icon" onClick={prevSong} title="上一首">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button className="glass-btn glass-btn-play" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
            {isResolving ? (
              <div className="spinner" style={{ width: 20, height: 20 }} />
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button className="glass-btn glass-btn-icon" onClick={nextSong} title="下一首">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        <div className="player-bar__time-row">
          <span className="player-bar__time">{formatTime(currentTime)}</span>
          <div className="player-bar__progress glass-progress" onClick={handleProgressClick}>
            <div
              className="glass-progress__fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="player-bar__time">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Right - Volume */}
      <div className="player-bar__right">
        <div className="player-bar__volume">
          <button className="glass-btn glass-btn-icon" onClick={toggleMute} title={isMuted ? '取消静音' : '静音'}>
            {isMuted || volume === 0 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : volume < 0.5 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                <path d="M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            )}
          </button>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </div>
        <button className={`glass-btn glass-btn-icon ${showLyricsPage ? 'glass-btn-primary' : ''}`} onClick={onToggleLyrics} title="歌词">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M4 6h16M4 10h16M4 14h10M4 18h7" />
          </svg>
        </button>
        <button className="glass-btn glass-btn-icon" onClick={handleFavorite} title={isFav ? '取消收藏' : '收藏'}>
          {isFav ? (
            <svg viewBox="0 0 24 24" fill="#ff3b30" stroke="none" width="16" height="16">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
