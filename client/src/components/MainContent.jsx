import { usePlayerStore } from '../store/playerStore';
import { useLibraryStore } from '../store/libraryStore';
import { api } from '../utils/api';

function formatDuration(seconds) {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MainContent() {
  const { currentPlaylist, currentPlaylistSongs, sidebarActive, loading, toggleImportModal, toggleUploadModal } = useLibraryStore();
  const { currentSong, playSong, isPlaying } = usePlayerStore();

  // Home / Library view
  if (sidebarActive === 'home' || sidebarActive === 'library') {
    if (!currentPlaylist) {
      return (
        <main className="main-content">
          <div className="main-content__panel glass-panel glass-scroll">
            <div className="empty-state">
              <div className="empty-state__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <h2 className="empty-state__title">欢迎使用 Aqua Music</h2>
              <p className="empty-state__desc">
                导入QQ音乐歌单或上传本地音乐文件，开始你的音乐之旅。水滴玻璃质感界面，让每一次聆听都成为视觉与听觉的双重享受。
              </p>
              <div className="empty-state__actions">
                <button className="glass-btn glass-btn-primary" onClick={toggleImportModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7,10 12,15 17,10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  导入QQ歌单
                </button>
                <button className="glass-btn" onClick={toggleUploadModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  上传本地音乐
                </button>
              </div>
            </div>
          </div>
        </main>
      );
    }
  }

  // Playlist view
  return (
    <main className="main-content">
      <div className="main-content__panel glass-panel">
        {/* Playlist Header */}
        <div className="playlist-header">
          <div className="playlist-header__cover album-art">
            {currentPlaylist?.cover_url ? (
              <img src={currentPlaylist.cover_url} alt={currentPlaylist.name} />
            ) : (
              <div className="playlist-header__cover-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="56" height="56" opacity="0.5">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
            )}
          </div>
          <div className="playlist-header__info">
            <div className="playlist-header__type">歌单</div>
            <h1 className="playlist-header__name">{currentPlaylist?.name}</h1>
            {currentPlaylist?.description && (
              <p className="playlist-header__desc">{currentPlaylist.description}</p>
            )}
            <div className="playlist-header__meta">
              <span>{currentPlaylist?.source === 'qq_music' ? 'QQ音乐' : '本地'} 歌单</span>
              <span className="playlist-header__meta-dot" />
              <span>{currentPlaylistSongs.length} 首歌曲</span>
            </div>
            <div className="playlist-header__play-row">
              <button
                className="glass-btn glass-btn-primary"
                onClick={() => {
                  if (currentPlaylistSongs.length > 0) {
                    playSong(currentPlaylistSongs[0], currentPlaylistSongs);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M8 5v14l11-7z" />
                </svg>
                播放全部
              </button>
              <button className="glass-btn glass-btn-icon" title="随机播放">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="16,3 21,3 21,8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21,16 21,21 16,21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Song List */}
        <div className="song-list glass-scroll">
          <div className="song-list__header">
            <span style={{ textAlign: 'center' }}>#</span>
            <span>标题</span>
            <span>专辑</span>
            <span style={{ textAlign: 'center' }}>时长</span>
            <span></span>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <p className="empty-state__desc">加载中...</p>
            </div>
          ) : currentPlaylistSongs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon" style={{ width: 60, height: 60 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </div>
              <p className="empty-state__desc">这个歌单还是空的，去导入一些歌曲吧</p>
            </div>
          ) : (
            <div className="stagger">
            {currentPlaylistSongs.map((song, index) => (
              <div
                key={song.id}
                className={`song-row ripple-container animate-slide-up ${currentSong?.id === song.id ? 'active' : ''}`}
                onDoubleClick={() => playSong(song, currentPlaylistSongs)}
              >
                <span className="song-row__index">
                  {currentSong?.id === song.id && isPlaying ? (
                    <div className="playing-indicator">
                      <span></span><span></span><span></span><span></span>
                    </div>
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="song-row__title-cell">
                  <div className="song-row__cover">
                    {song.cover_url ? (
                      <img src={song.cover_url} alt="" />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16" opacity="0.3">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="song-row__title-wrap">
                    <div className="song-row__title" style={{
                      color: currentSong?.id === song.id ? 'var(--drop-primary)' : undefined
                    }}>{song.title}</div>
                    <div className="song-row__artist">{song.artist}</div>
                  </div>
                </div>
                <span className="song-row__album">{song.album}</span>
                <span className="song-row__duration">{formatDuration(song.duration)}</span>
                <div className="song-row__actions">
                  <button className="song-row__more-btn" title="更多">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
