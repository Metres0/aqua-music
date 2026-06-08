const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { getDb } = require('./db');
const xinghai = require('./services/xinghaiSource');

// Ensure directories exist
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const DATA_DIR = path.join(__dirname, '..', 'data');
[UPLOAD_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize database
getDb();

const app = express();
const PORT = process.env.PORT || 3200;

// === High-Performance Middleware ===
app.use(compression({ level: 6, threshold: 1024 }));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// === API Routes ===
app.use('/api/songs', require('./routes/songs'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/import', require('./routes/import'));
app.use('/api/search', require('./routes/search'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/stream', require('./routes/stream'));

// Health check
app.get('/api/health', (req, res) => {
  const db = getDb();
  const stats = {
    songs: db.prepare('SELECT COUNT(*) as cnt FROM songs').get().cnt,
    playlists: db.prepare('SELECT COUNT(*) as cnt FROM playlists').get().cnt,
    uptime: process.uptime(),
    xinghai: xinghai.getStatus(),
  };
  res.json({ status: 'ok', ...stats });
});

// Serve frontend static files in production
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件过大，最大支持100MB' });
  }
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Aqua Music Server                   ║
  ║   Running on http://localhost:${PORT}   ║
  ║   API: http://localhost:${PORT}/api     ║
  ╚═══════════════════════════════════════╝
  `);

  // 异步初始化星海音乐源
  try {
    await xinghai.init();
    console.log('[Aqua] 星海音乐源就绪');
  } catch (err) {
    console.error('[Aqua] 星海音乐源初始化异常:', err.message);
  }
});
