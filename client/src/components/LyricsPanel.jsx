import { useState, useEffect, useRef, useMemo } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { api } from '../utils/api';

// Parse LRC format: [mm:ss.xx] text
function parseLRC(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const parsed = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  
  for (const line of lines) {
    const text = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    if (!text || text.startsWith('[') && text.endsWith(']')) continue;
    
    let match;
    const times = [];
    const regex = new RegExp(timeRegex.source, 'g');
    while ((match = regex.exec(line)) !== null) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3)) : 0;
      times.push(min * 60 + sec + ms / 1000);
    }
    
    times.forEach(time => {
      parsed.push({ time, text });
    });
  }
  
  return parsed.sort((a, b) => a.time - b.time);
}

// Merge original + translation lyrics
function mergeLyrics(lyric, tlyric) {
  const main = parseLRC(lyric);
  const trans = parseLRC(tlyric);
  if (!trans.length) return main;
  
  // Attach translations to nearest main line
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

export default function LyricsPanel({ onClose }) {
  const { currentSong, currentTime } = usePlayerStore();
  const [lyricData, setLyricData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const activeLineRef = useRef(null);
  const lastSongRef = useRef(null);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!currentSong) {
      setLyricData(null);
      return;
    }

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

    api.getLyric(source, lyricId, songName, singer)
      .then(data => {
        const parsed = mergeLyrics(data.lyric, data.tlyric);
        setLyricData(parsed);
      })
      .catch(err => {
        setError(err.message || '歌词获取失败');
      })
      .finally(() => setLoading(false));
  }, [currentSong?.songmid, currentSong?.id]);

  // Find current active line
  const activeIndex = useMemo(() => {
    if (!lyricData?.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyricData.length; i++) {
      if (lyricData[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyricData, Math.floor(currentTime)]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineRef.current && scrollRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  return (
    <div className="lyrics-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Close button - floating top right */}
      <div className="lyrics-panel__close">
        <button className="glass-btn glass-btn-icon" onClick={onClose} style={{ width: 36, height: 36 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="lyrics-panel">
        {/* Header - minimal, floating song info */}
        <div className="lyrics-panel__header">
          <div>
            <h3 className="lyrics-panel__title">
              {currentSong?.title || '未在播放'}
            </h3>
            <p className="lyrics-panel__artist">
              {currentSong?.artist || currentSong?.singer || ''}
            </p>
          </div>
        </div>

        {/* Lyrics content - floating in 3D space */}
        <div className="lyrics-panel__body" ref={scrollRef}>
          {loading ? (
            <div className="lyrics-panel__empty">
              <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} />
              <p>正在获取歌词...</p>
            </div>
          ) : error ? (
            <div className="lyrics-panel__empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36" opacity="0.3" style={{ margin: '0 auto 12px', display: 'block' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" transform="rotate(180 12 14)" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
              <p>{error}</p>
              <p style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>这首歌可能没有可用的歌词</p>
            </div>
          ) : !lyricData?.length ? (
            <div className="lyrics-panel__empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36" opacity="0.3" style={{ margin: '0 auto 12px', display: 'block' }}>
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <p>暂无歌词</p>
            </div>
          ) : (
            <div className="lyrics-panel__lines">
              {lyricData.map((line, index) => (
                <div
                  key={index}
                  ref={index === activeIndex ? activeLineRef : null}
                  className={`lyrics-line ${index === activeIndex ? 'lyrics-line--active' : ''} ${index < activeIndex ? 'lyrics-line--past' : ''}`}
                >
                  <span className="lyrics-line__text">{line.text}</span>
                  {line.translation && (
                    <span className="lyrics-line__trans">{line.translation}</span>
                  )}
                </div>
              ))}
              {/* Padding at bottom so last lines can scroll to center */}
              <div style={{ height: '40vh' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
