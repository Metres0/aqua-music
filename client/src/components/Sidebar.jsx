import { useLibraryStore } from '../store/libraryStore';

const icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  import: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17,8 12,3 7,8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
};

export default function Sidebar() {
  const {
    playlists,
    currentPlaylist,
    loadPlaylist,
    createPlaylist,
    toggleImportModal,
    toggleSearchModal,
    toggleUploadModal,
    setSidebarActive,
    sidebarActive,
  } = useLibraryStore();

  const handleCreatePlaylist = async () => {
    const name = window.prompt('输入歌单名称');
    if (name && name.trim()) {
      await createPlaylist(name.trim());
    }
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar__logo">
        <div className="sidebar__logo-icon">
          {icons.music}
        </div>
        <span className="sidebar__logo-text">Aqua Music</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav glass-panel">
        <button
          className={`sidebar__nav-item ${sidebarActive === 'home' ? 'active' : ''}`}
          onClick={() => setSidebarActive('home')}
        >
          <span className="sidebar__nav-icon">{icons.home}</span>
          <span>首页</span>
        </button>
        <button
          className={`sidebar__nav-item ${sidebarActive === 'search' ? 'active' : ''}`}
          onClick={() => toggleSearchModal()}
        >
          <span className="sidebar__nav-icon">{icons.search}</span>
          <span>搜索</span>
        </button>
        <button
          className={`sidebar__nav-item ${sidebarActive === 'library' ? 'active' : ''}`}
          onClick={() => setSidebarActive('library')}
        >
          <span className="sidebar__nav-icon">{icons.library}</span>
          <span>音乐库</span>
        </button>
      </nav>

      {/* Actions */}
      <div className="sidebar__nav glass-panel" style={{ padding: '4px' }}>
        <button className="sidebar__nav-item" onClick={toggleImportModal}>
          <span className="sidebar__nav-icon">{icons.import}</span>
          <span>导入QQ歌单</span>
        </button>
        <button className="sidebar__nav-item" onClick={toggleUploadModal}>
          <span className="sidebar__nav-icon">{icons.upload}</span>
          <span>上传本地音乐</span>
        </button>
      </div>

      {/* Playlists */}
      <div className="sidebar__section-title">
        <span>我的歌单</span>
        <button
          className="glass-btn glass-btn-icon"
          onClick={handleCreatePlaylist}
          title="新建歌单"
          style={{ width: 24, height: 24, padding: 0, marginLeft: 'auto' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="sidebar__playlist-list glass-scroll">
        {playlists.map((pl) => (
          <button
            key={pl.id}
            className={`sidebar__playlist-item ${currentPlaylist?.id === pl.id ? 'active' : ''}`}
            onClick={() => loadPlaylist(pl.id)}
          >
            <div className="sidebar__playlist-cover">
              {pl.cover_url ? (
                <img src={pl.cover_url} alt={pl.name} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, rgba(100,180,255,0.3), rgba(160,120,255,0.3))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', opacity: 0.6
                }}>
                  {icons.music}
                </div>
              )}
            </div>
            <div className="sidebar__playlist-info">
              <div className="sidebar__playlist-name">{pl.name}</div>
              <div className="sidebar__playlist-count">{pl.actual_song_count || pl.song_count || 0} 首</div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
