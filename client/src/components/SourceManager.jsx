import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const icons = {
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6" /><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23,4 23,10 17,10" /><path d="M20.49,15a9,9,0,1,1-2.12-9.36L23,10" />
    </svg>
  ),
  test: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7,6.3a1,1,0,0,0,0,1.4l1.6,1.6a1,1,0,0,0,1.4,0l3.77-3.77a6,6,0,0,1-7.94,7.94l-6.91,6.91a2.12,2.12,0,0,1-3-3l6.91-6.91a6,6,0,0,1,7.94-7.94L14.7,6.3Z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  code: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16,18 22,12 16,6" /><polyline points="8,6 2,12 8,18" />
    </svg>
  ),
};

// ─── 状态标签 ───
function StatusBadge({ ok, text }) {
  return (
    <span className={`sm-badge ${ok ? 'sm-badge--ok' : 'sm-badge--fail'}`}>
      <span className="sm-badge__dot" />
      {text}
    </span>
  );
}

// ─── 测试结果面板 ───
function TestResults({ results }) {
  if (!results) return null;
  const steps = [
    { key: 'load', label: '脚本加载' },
    { key: 'search', label: '搜索测试' },
    { key: 'musicUrl', label: '播放地址' },
    { key: 'lyric', label: '歌词获取' },
  ];
  return (
    <div className="sm-test-results">
      {steps.map(({ key, label }) => {
        const r = results[key];
        if (!r) return null;
        return (
          <div key={key} className={`sm-test-row ${r.success ? 'sm-test-row--ok' : 'sm-test-row--fail'}`}>
            <span className="sm-test-icon">{r.success ? icons.check : icons.error}</span>
            <span className="sm-test-label">{label}</span>
            <span className="sm-test-msg">{r.message}</span>
          </div>
        );
      })}
      {results.sourcesMeta && results.sourcesMeta.length > 0 && (
        <div className="sm-test-sources">
          <div className="sm-test-sources__title">支持的音源:</div>
          {results.sourcesMeta.map((s, i) => (
            <div key={i} className="sm-test-source-chip">
              {s.name} ({s.id})
              {s.qualitys?.length > 0 && <span className="sm-test-quality">{s.qualitys.join(', ')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 单个源卡片 ───
function SourceCard({ source, onToggle, onDelete, onRefresh, onTest }) {
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await api.testSource(source.id);
      setTestResults(res);
    } catch (err) {
      setTestResults({ load: { success: false, message: err.message } });
    }
    setTesting(false);
  };

  return (
    <div className={`sm-card ${source.enabled ? '' : 'sm-card--disabled'}`}>
      <div className="sm-card__header">
        <div className="sm-card__info">
          <h3 className="sm-card__name">{source.name}</h3>
          <div className="sm-card__meta">
            {source.version && <span>v{source.version}</span>}
            {source.author && <span>by {source.author}</span>}
            {source.sources_meta?.length > 0 && (
              <span>{source.sources_meta.length} 个音源</span>
            )}
          </div>
        </div>
        <div className="sm-card__actions">
          {/* Toggle */}
          <button
            className={`sm-toggle ${source.enabled ? 'sm-toggle--on' : ''}`}
            onClick={() => onToggle(source.id, !source.enabled)}
            title={source.enabled ? '禁用' : '启用'}
          />
          <button className="sm-icon-btn" onClick={onRefresh} title="刷新">
            {icons.refresh}
          </button>
          <button className="sm-icon-btn" onClick={handleTest} title="测试" disabled={testing}>
            {testing ? <span className="sm-spinner" /> : icons.test}
          </button>
          <button className="sm-icon-btn sm-icon-btn--danger" onClick={() => onDelete(source.id)} title="删除">
            {icons.trash}
          </button>
        </div>
      </div>
      {source.description && <p className="sm-card__desc">{source.description}</p>}
      {source.loaded ? (
        <StatusBadge ok text="已加载" />
      ) : (
        <StatusBadge ok={false} text="未加载" />
      )}
      {testResults && <TestResults results={testResults} />}
    </div>
  );
}

// ─── 添加源面板 ───
function AddSourcePanel({ onAdded }) {
  const [mode, setMode] = useState('url'); // 'url' | 'script'
  const [url, setUrl] = useState('');
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const handleTestUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setTestResult(null);
    try {
      const res = await api.testSourceUrl(url.trim());
      setTestResult(res);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'url') {
        await api.addSource({ url: url.trim() });
      } else {
        await api.addSource({ script });
      }
      setUrl('');
      setScript('');
      setTestResult(null);
      if (onAdded) onAdded();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="sm-add-panel">
      <div className="sm-add-tabs">
        <button
          className={`sm-add-tab ${mode === 'url' ? 'active' : ''}`}
          onClick={() => { setMode('url'); setTestResult(null); setError(''); }}
        >
          {icons.link} 从 URL 添加
        </button>
        <button
          className={`sm-add-tab ${mode === 'script' ? 'active' : ''}`}
          onClick={() => { setMode('script'); setTestResult(null); setError(''); }}
        >
          {icons.code} 粘贴脚本
        </button>
      </div>

      {mode === 'url' ? (
        <div className="sm-add-form">
          <input
            type="text"
            className="sm-input"
            placeholder="输入 LX 音源 URL，例如 https://...xxx.js"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <div className="sm-add-btns">
            <button className="glass-btn" onClick={handleTestUrl} disabled={loading || !url.trim()}>
              {loading ? <span className="sm-spinner" /> : icons.test} 测试
            </button>
            <button className="glass-btn glass-btn-primary" onClick={handleAdd} disabled={loading || !url.trim()}>
              {icons.plus} 添加
            </button>
          </div>
        </div>
      ) : (
        <div className="sm-add-form">
          <textarea
            className="sm-textarea"
            placeholder="粘贴 LX 音源脚本内容..."
            value={script}
            onChange={e => setScript(e.target.value)}
            rows={10}
          />
          <div className="sm-add-btns">
            <button className="glass-btn glass-btn-primary" onClick={handleAdd} disabled={loading || script.length < 100}>
              {icons.plus} 添加
            </button>
          </div>
        </div>
      )}

      {error && <div className="sm-error">{error}</div>}
      {testResult && (
        <div className="sm-test-preview">
          <h4>测试预览: {testResult.name}</h4>
          <TestResults results={testResult} />
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ───
export default function SourceManager({ onClose }) {
  const [sources, setSources] = useState([]);
  const [loaded, setLoaded] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSources = useCallback(async () => {
    try {
      const data = await api.getSources();
      setSources(data.sources || []);
      setLoaded(data.loaded || []);
    } catch (err) {
      console.error('获取源列表失败:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleToggle = async (id, enabled) => {
    try {
      await api.toggleSource(id, enabled);
      fetchSources();
    } catch (err) {
      console.error('切换源状态失败:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除此音源吗？')) return;
    try {
      await api.deleteSource(id);
      fetchSources();
    } catch (err) {
      console.error('删除源失败:', err);
    }
  };

  const handleRefresh = async (id) => {
    try {
      await api.refreshSource(id);
      fetchSources();
    } catch (err) {
      console.error('刷新源失败:', err);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal glass-panel-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sm-header">
          <div className="sm-header__left">
            <span className="sm-header__icon">{icons.layers}</span>
            <h2>音源管理</h2>
            <span className="sm-header__count">
              {loaded.length} / {sources.length} 已加载
            </span>
          </div>
          <button className="sm-close-btn" onClick={onClose}>{icons.close}</button>
        </div>

        {/* Add source panel */}
        <AddSourcePanel onAdded={fetchSources} />

        {/* Source list */}
        <div className="sm-list glass-scroll">
          {loading ? (
            <div className="sm-empty">
              <span className="sm-spinner sm-spinner--lg" />
              <span>加载中...</span>
            </div>
          ) : sources.length === 0 ? (
            <div className="sm-empty">
              {icons.layers}
              <span>暂无自定义音源，请通过上方添加</span>
            </div>
          ) : (
            sources.map(source => (
              <SourceCard
                key={source.id}
                source={source}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onRefresh={handleRefresh}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
