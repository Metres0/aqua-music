import { useState, useEffect, useRef, useMemo } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../utils/api';

// ─── LRC Parser ───
function parseLRC(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const parsed = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    const text = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    if (!text || (text.startsWith('[') && text.endsWith(']'))) continue;
    let match;
    const times = [];
    const regex = new RegExp(timeRegex.source, 'g');
    while ((match = regex.exec(line)) !== null) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3)) : 0;
      times.push(min * 60 + sec + ms / 1000);
    }
    times.forEach(time => parsed.push({ time, text }));
  }
  return parsed.sort((a, b) => a.time - b.time);
}

function mergeLyrics(lyric, tlyric) {
  const main = parseLRC(lyric);
  const trans = parseLRC(tlyric);
  if (!trans.length) return main;
  return main.map(line => {
    const nearest = trans.reduce((best, t) => {
      if (!best || Math.abs(t.time - line.time) < Math.abs(best.time - line.time)) return t;
      return best;
    }, null);
    if (nearest && Math.abs(nearest.time - line.time) < 1.5) {
      return { ...line, translation: nearest.text };
    }
    return line;
  });
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Lyric Line (QQ炫舞 style two-phase animation) ───
function LyricLine({ line, index, isActive, isPast, dist, activeLineRef, onSeek }) {
  const [settled, setSettled] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      setSettled(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSettled(true), 650);
    } else {
      setSettled(false);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive]);

  const cls = [
    'lp__line',
    isActive ? 'lp__line--active' : '',
    isActive && settled ? 'lp__line--pulse' : '',
    isPast ? 'lp__line--past' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={isActive ? activeLineRef : null}
      className={cls}
      data-dist={dist}
      onClick={() => onSeek(line.time)}
    >
      <span className="lp__line-text">{line.text}</span>
      {line.translation && <span className="lp__line-trans">{line.translation}</span>}
      {isActive && <div className="lp__line-glow" />}
    </div>
  );
}

// ─── LyricsPage Component ───
export default function LyricsPage({ onClose }) {
  const { currentSong, currentTime, duration, isPlaying, togglePlay, nextSong, prevSong } = usePlayerStore();
  const [lyricData, setLyricData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const activeLineRef = useRef(null);
  const lastSongRef = useRef(null);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!currentSong) { setLyricData(null); return; }
    const songKey = `${currentSong.source || ''}:${currentSong.songmid || currentSong.id}`;
    if (songKey === lastSongRef.current) return;
    lastSongRef.current = songKey;

    setLoading(true);
    setError(null);
    setLyricData(null);

    const source = currentSong.source || 'wy';
    const lyricId = currentSong._lyricId || currentSong.songmid || currentSong.id || '';
    const songName = currentSong.title || '';
    const singer = currentSong.singer || currentSong.artist || '';
    const customSourceId = currentSong._customSourceId || '';

    api.getLyric(source, lyricId, songName, singer, customSourceId)
      .then(data => setLyricData(mergeLyrics(data.lyric, data.tlyric)))
      .catch(err => setError(err.message || '歌词获取失败'))
      .finally(() => setLoading(false));
  }, [currentSong?.songmid, currentSong?.id]);

  // Active line index
  const activeIndex = useMemo(() => {
    if (!lyricData?.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyricData.length; i++) {
      if (lyricData[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyricData, currentTime]);

  // Auto-scroll
  useEffect(() => {
    if (activeLineRef.current && scrollRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  // Click lyric line to seek
  const handleLineClick = (time) => {
    const { seek, audio } = usePlayerStore.getState();
    if (audio) {
      audio.currentTime = time;
      seek(time);
    }
  };

  const coverUrl = currentSong?.cover_url || currentSong?.cover || '';
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="lp">
      {/* ─── Background: blurred album art + gradient ─── */}
      <div className="lp__bg">
        {coverUrl && (
          <img src={coverUrl} alt="" className="lp__bg-img" />
        )}
        <div className="lp__bg-gradient" />
      </div>

      {/* ─── Top bar ─── */}
      <div className="lp__topbar">
        <button className="lp__back" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>返回列表</span>
        </button>
        <div className="lp__song-badge">
          {currentSong?.source && (
            <span className="lp__source-tag" style={{
              background: { wy: '#ff3b30', tx: '#31c27c', kw: '#ff9500', kg: '#007aff', mg: '#af52de' }[currentSong.source] || '#888',
            }}>
              {({ wy: '网易', tx: 'QQ', kw: '酷我', kg: '酷狗', mg: '咪咕' })[currentSong.source] || '在线'}
            </span>
          )}
        </div>
      </div>

      {/* ─── Main content: album art + lyrics ─── */}
      <div className="lp__content">
        {/* Left: Album Art */}
        <div className="lp__left">
          <div className={`lp__cover-wrap ${isPlaying ? 'lp__cover-wrap--spinning' : ''}`}>
            <div className="lp__cover">
              {coverUrl ? (
                <img src={coverUrl} alt="" />
              ) : (
                <div className="lp__cover-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="64" height="64">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
            </div>
            <div className="lp__cover-ring" />
          </div>
          <div className="lp__song-info">
            <h2 className="lp__song-title">{currentSong?.title || '未在播放'}</h2>
            <p className="lp__song-artist">{currentSong?.artist || currentSong?.singer || ''}</p>
          </div>
        </div>

        {/* Right: Lyrics */}
        <div className="lp__right">
          <div className="lp__lyrics-scroll" ref={scrollRef}>
            {loading ? (
              <div className="lp__empty">
                <div className="lp__empty-icon lp__empty-icon--spin">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <p>正在获取歌词...</p>
              </div>
            ) : error ? (
              <div className="lp__empty">
                <div className="lp__empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p>{error}</p>
                <p className="lp__empty-sub">这首歌可能没有可用的歌词</p>
              </div>
            ) : !lyricData?.length ? (
              <div className="lp__empty">
                <div className="lp__empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <p>暂无歌词</p>
              </div>
            ) : (
              <div className="lp__lyrics-list">
                {/* Top spacer */}
                <div style={{ height: '38vh' }} />
                {lyricData.map((line, index) => (
                  <LyricLine
                    key={index}
                    line={line}
                    index={index}
                    isActive={index === activeIndex}
                    isPast={index < activeIndex}
                    dist={index - activeIndex}
                    activeLineRef={activeLineRef}
                    onSeek={handleLineClick}
                  />
                ))}
                {/* Bottom spacer */}
                <div style={{ height: '42vh' }} />
              </div>
            )}
          </div>

          {/* Fade masks */}
          <div className="lp__lyrics-fade lp__lyrics-fade--top" />
          <div className="lp__lyrics-fade lp__lyrics-fade--bottom" />
        </div>
      </div>

      {/* ─── Bottom mini controls ─── */}
      <div className="lp__controls">
        <div className="lp__progress" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percent = x / rect.width;
          const { seek, audio } = usePlayerStore.getState();
          if (audio) { audio.currentTime = percent * duration; seek(percent * duration); }
        }}>
          <div className="lp__progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="lp__controls-row">
          <span className="lp__time">{formatTime(currentTime)}</span>
          <div className="lp__btns">
            <button className="lp__btn" onClick={prevSong}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button className="lp__btn lp__btn--play" onClick={togglePlay}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button className="lp__btn" onClick={nextSong}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>
          <span className="lp__time">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
