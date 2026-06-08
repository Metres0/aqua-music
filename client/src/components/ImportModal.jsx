import { useState } from 'react';
import { useLibraryStore } from '../store/libraryStore';

export default function ImportModal() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const { importQQPlaylist, toggleImportModal } = useLibraryStore();

  const handleImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await importQQPlaylist(url.trim());
      setResult({ type: 'success', data: res });
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) toggleImportModal();
  };

  return (
    <div className="glass-modal-overlay" onClick={handleOverlayClick}>
      <div className="glass-modal glass-panel">
        <div className="import-modal__content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="import-modal__title">导入QQ音乐歌单</h2>
            <button
              className="glass-btn glass-btn-icon"
              onClick={toggleImportModal}
              style={{ width: 32, height: 32 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <p className="import-modal__desc">
            将QQ音乐的歌单链接粘贴到下方输入框，系统会自动解析并导入所有歌曲信息。
          </p>

          <div className="import-modal__steps">
            <div className="import-modal__step">
              <span className="import-modal__step-num">1</span>
              <span>打开QQ音乐 App 或网页版 (y.qq.com)</span>
            </div>
            <div className="import-modal__step">
              <span className="import-modal__step-num">2</span>
              <span>找到想要导入的歌单，点击"分享"按钮</span>
            </div>
            <div className="import-modal__step">
              <span className="import-modal__step-num">3</span>
              <span>复制歌单链接，粘贴到下方输入框</span>
            </div>
          </div>

          <div className="import-modal__input-row">
            <input
              className="glass-input"
              placeholder="粘贴QQ音乐歌单链接，如 https://y.qq.com/n/ryqq/playlist/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              disabled={importing}
            />
            <button
              className="glass-btn glass-btn-primary"
              onClick={handleImport}
              disabled={importing || !url.trim()}
              style={{ whiteSpace: 'nowrap', minWidth: 80 }}
            >
              {importing ? (
                <>
                  <div className="spinner" />
                  导入中
                </>
              ) : '导入'}
            </button>
          </div>

          {result && (
            <div className={`import-modal__result ${result.type}`}>
              {result.type === 'success' ? (
                <>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(80,200,120,0.2), rgba(80,200,120,0.1))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {result.data.cover ? (
                      <img src={result.data.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="rgba(80,200,120,0.8)" strokeWidth="2" width="20" height="20">
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>导入成功！</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {result.data.name} · {result.data.songCount} 首歌曲
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,100,100,0.8)" strokeWidth="2" width="20" height="20">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>导入失败</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {result.message}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Example links */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>支持的链接格式：</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.8 }}>
              <div>https://y.qq.com/n/ryqq/playlist/xxxxxx</div>
              <div>https://i.y.qq.com/n2/m/share/details/taoge.html?id=xxxxxx</div>
              <div>或直接输入歌单ID数字</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
