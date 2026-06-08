import { useState, useEffect, useRef } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';

const PLATFORM_LABELS = {
  wy: { name: '网易云', color: '#ff3b30' },
  tx: { name: 'QQ音乐', color: '#31c27c' },
  kw: { name: '酷我', color: '#ff9500' },
  kg: { name: '酷狗', color: '#007aff' },
  mg: { name: '咪咕', color: '#af52de' },
};

export default function SearchModal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searching, setSearching] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const { search, toggleSearchModal } = useLibraryStore();
  const { playSong, currentSong, isPlaying } = usePlayerStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await search(query);
        setResults(res);
        // 自动选中有结果最多的平台
        if (res.platforms_list && res.platforms_list.length > 0) {
          setActiveTab(res.platforms_list[0].code);
        }
      } catch (err) {
        console.error('搜索失败:', err);
      }
      setSearching(false);
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) toggleSearchModal();
  };

  const handlePlayOnline = (song, allSongs, index) => {
    // 标记为在线歌曲，播放时会通过 /api/stream/url 获取真实音频URL
    const onlineSong = { ...song, _online: true, index: index + 1 };
    // 确保传递 _origin（标识搜索来源，影响URL解析策略）
    if (!onlineSong._origin) onlineSong._origin = song._origin || 'yaohu';
    if (!onlineSong.singer) onlineSong.singer = song.singer || song.artist || '';
    const queue = allSongs.map((s, i) => ({
      ...s,
      _online: true,
      index: i + 1,
      _origin: s._origin || 'yaohu',
      singer: s.singer || s.artist || '',
    }));
    setPlayingId(`${song.source}:${song.songmid}`);
    playSong(onlineSong, queue);
  };

  const handlePlayLocal = (song, allSongs) => {
    playSong(song, allSongs);
  };

  // 获取当前tab显示的歌曲
  const getCurrentSongs = () => {
    if (!results) return [];
    if (activeTab === 'all') {
      // 合并所有平台结果
      const all = [];
      if (results.platforms_list) {
        results.platforms_list.forEach(pl => {
          pl.songs.forEach(s => all.push({ ...s, _platform: pl.code }));
        });
      }
      return all;
    }
    if (activeTab === 'local') return results.local || [];
    return results.platforms?.[activeTab] || [];
  };

  const songs = getCurrentSongs();
  const platformTabs = results?.platforms_list || [];

  return (
    <div className="glass-modal-overlay" onClick={handleOverlayClick}>
      <div className="glass-modal glass-panel" style={{ maxWidth: 640, maxHeight: '85vh' }}>
        <div className="search-modal__content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
              搜索音乐
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8, fontWeight: 400, fontFamily: 'var(--font-body)' }}>
                多平台聚合搜索
              </span>
            </h2>
            <button className="glass-btn glass-btn-icon" onClick={toggleSearchModal} style={{ width: 32, height: 32 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Search Input */}
          <div className="search-modal__input-wrap">
            <span className="search-modal__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              className="glass-input search-modal__input"
              placeholder="搜索歌曲、歌手、专辑..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && <div className="spinner" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }} />}
          </div>

          {/* Platform Tabs */}
          <div className="search-modal__tabs" style={{ flexWrap: 'wrap', gap: 4 }}>
            <button
              className={`search-modal__tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
              style={{ flex: 'none', padding: '6px 12px' }}
            >
              全部
            </button>
            {platformTabs.map(pl => (
              <button
                key={pl.code}
                className={`search-modal__tab ${activeTab === pl.code ? 'active' : ''}`}
                onClick={() => setActiveTab(pl.code)}
                style={{ flex: 'none', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: PLATFORM_LABELS[pl.code]?.color || '#888',
                  display: 'inline-block',
                }} />
                {PLATFORM_LABELS[pl.code]?.name || pl.code}
                <span style={{ fontSize: 11, opacity: 0.6 }}>({pl.count})</span>
              </button>
            ))}
            {results?.local?.length > 0 && (
              <button
                className={`search-modal__tab ${activeTab === 'local' ? 'active' : ''}`}
                onClick={() => setActiveTab('local')}
                style={{ flex: 'none', padding: '6px 12px' }}
              >
                本地 ({results.local.length})
              </button>
            )}
          </div>

          {/* Results */}
          <div className="search-modal__results glass-scroll" style={{ flex: 1, minHeight: 0 }}>
            {!query.trim() ? (
              <div className="search-modal__empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40" opacity="0.3" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                输入关键词，搜索五大平台海量音乐
              </div>
            ) : searching ? (
              <div className="search-modal__empty">
                <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} />
                <p>正在搜索多个平台...</p>
              </div>
            ) : songs.length === 0 ? (
              <div className="search-modal__empty">未找到相关结果</div>
            ) : (
              songs.map((song, index) => {
                const isOnline = song._online !== undefined || song.source;
                const songKey = `${song.source || 'local'}:${song.songmid || song.id}`;
                const isCurrentlyPlaying = currentSong && (
                  (currentSong.songmid && currentSong.songmid === song.songmid && currentSong.source === song.source) ||
                  (currentSong.id && currentSong.id === song.id)
                );
                const platformCode = song._platform || song.source;
                const platformInfo = PLATFORM_LABELS[platformCode];

                return (
                  <div
                    key={songKey + index}
                    className={`song-row ripple-container ${isCurrentlyPlaying ? 'active' : ''}`}
                    onDoubleClick={() => isOnline ? handlePlayOnline(song, songs, index) : handlePlayLocal(song, songs)}
                    style={{ gridTemplateColumns: '36px 1fr 1fr 50px' }}
                  >
                    {/* Cover */}
                    <div style={{ position: 'relative' }}>
                      <div className="song-row__cover">
                        {song.cover || song.cover_url ? (
                          <img src={song.cover || song.cover_url} alt="" />
                        ) : (
                          <div style={{
                            width: '100%', height: '100%',
                            background: platformInfo ? `linear-gradient(135deg, ${platformInfo.color}33, ${platformInfo.color}11)` : 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" opacity="0.4">
                              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* Platform badge */}
                      {platformInfo && (
                        <span style={{
                          position: 'absolute', bottom: -2, right: -2,
                          width: 14, height: 14, borderRadius: '50%',
                          background: platformInfo.color,
                          border: '2px solid rgba(0,0,0,0.4)',
                          fontSize: 0,
                        }} title={platformInfo.name} />
                      )}
                    </div>

                    {/* Title & Artist */}
                    <div className="song-row__title-cell" style={{ minWidth: 0 }}>
                      <div className="song-row__title-wrap">
                        <div className="song-row__title" style={{
                          color: isCurrentlyPlaying && isPlaying ? 'var(--drop-primary)' : undefined,
                        }}>{song.title}</div>
                        <div className="song-row__artist">{song.singer || song.artist}</div>
                      </div>
                    </div>

                    {/* Album */}
                    <span className="song-row__album" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {song.album || ''}
                    </span>

                    {/* Duration / Platform */}
                    <div style={{ textAlign: 'right' }}>
                      {song.duration ? (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {platformInfo?.name || '在线'}
                        </span>
                      )}
                      {isCurrentlyPlaying && isPlaying && (
                        <div className="playing-indicator" style={{ marginTop: 2 }}>
                          <span /><span /><span /><span />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
