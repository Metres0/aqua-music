# Aqua Music

一款基于液态玻璃（Liquid Glass）设计理念的全栈音乐播放器，采用 React + Express 构建，支持多平台音乐搜索、在线播放、歌词显示和本地音乐管理。

## 技术栈

前端：React 19 + Vite 5 + Zustand 状态管理，纯 CSS 实现液态玻璃设计系统。后端：Express 4 + Better-SQLite3 嵌入式数据库 + node-fetch HTTP 客户端。多源聚合：GDAPI、网易云直连、酷我直连、酷狗直连、Yaohu API 等。

## 快速开始

```bash
# 1. 安装后端依赖
cd server && npm install

# 2. 安装前端依赖
cd ../client && npm install

# 3. 启动后端 (端口 3200)
cd ../server && npm start

# 4. 启动前端 (端口 5173)
cd ../client && npm run dev
```

Windows 用户也可以直接双击 `start.bat` 一键启动。

启动后访问 `http://localhost:5173` 即可使用。

## 项目结构

```
my_music/
├── start.bat                  # Windows 一键启动脚本
├── server/                    # 后端服务
│   ├── src/
│   │   ├── index.js           # Express 入口，中间件配置，路由挂载
│   │   ├── db.js              # SQLite 数据库初始化与 Schema 定义
│   │   ├── services/
│   │   │   ├── xinghaiSource.js  # 核心：多平台搜索、URL解析、歌词获取
│   │   │   └── qqMusic.js        # QQ音乐 Cookie 认证服务
│   │   └── routes/
│   │       ├── search.js      # GET  /api/search — 多平台聚合搜索
│   │       ├── stream.js      # POST/GET /api/stream/url — 音频URL解析
│   │       │                  # GET  /api/stream/lyric — 歌词获取
│   │       ├── songs.js       # CRUD /api/songs — 歌曲管理
│   │       ├── playlists.js   # CRUD /api/playlists — 歌单管理
│   │       ├── import.js      # POST /api/import — QQ歌单导入
│   │       └── upload.js      # POST /api/upload — 文件上传
│   ├── data/                  # SQLite 数据库文件（运行时生成）
│   └── uploads/               # 上传的音频文件
├── client/                    # 前端应用
│   ├── index.html             # HTML 入口（Crystal Water 主题色）
│   ├── vite.config.js         # Vite 配置 + API 代理
│   └── src/
│       ├── App.jsx            # 根组件：音频管理、路由切换
│       ├── main.jsx           # React 挂载入口
│       ├── components/
│       │   ├── Player.jsx         # 底部播放控制栏
│       │   ├── LyricsPage.jsx     # 独立歌词页面（悬浮效果）
│       │   ├── SearchModal.jsx    # 搜索弹窗（多平台聚合）
│       │   ├── MainContent.jsx    # 主内容区（歌单+歌曲列表）
│       │   ├── Sidebar.jsx        # 侧边导航栏
│       │   ├── ImportModal.jsx    # QQ歌单导入弹窗
│       │   └── LyricsPanel.jsx    # 歌词面板组件（旧版，已停用）
│       ├── store/
│       │   ├── playerStore.js     # 播放状态：当前歌曲、队列、音量
│       │   └── libraryStore.js    # 库状态：歌单、搜索、UI开关
│       ├── styles/
│       │   ├── glass.css          # "Crystal Water" 设计系统
│       │   └── app.css            # 布局样式 + 歌词页面样式
│       └── utils/
│           └── api.js             # API 客户端封装
```

## 功能详解

### 1. 多平台聚合搜索

用户在搜索框输入关键词后，系统并行请求多个音乐平台，将结果去重合并后展示。

实现细节（`xinghaiSource.js` 中的 `search()` 函数）：搜索时同时发起 5 路并行请求——网易云直连搜索、酷我直连搜索、酷狗直连搜索、Yaohu API（QQ/咪咕）、GDAPI 备用搜索。使用 `Promise.allSettled` 保证单源失败不影响整体。结果按平台分组后，通过标题去重合并。内置 5 分钟 TTL 的 Map 缓存，相同关键词二次搜索直接返回缓存结果（从首次 2.9 秒降至 150ms）。

涉及 API：
- 网易云：`music.163.com/api/search/get/web`
- 酷我：`search.kuwo.cn/r.s`
- 酷狗：`mobileservice.kugou.com/api/v3/search/song`
- GDAPI：`music-api.gdstudio.xyz/api.php`

### 2. 音频 URL 多级解析

点击歌曲播放时，系统通过多级降级策略获取真实音频 URL，确保最大兼容性。

实现细节（`xinghaiSource.js` 中的 `getMusicUrl()` + `getMusicUrlWithFallback()`）：策略链按优先级依次为——GDAPI 原生 ID 解析（直接用平台 ID 换取 URL）、GDAPI 跨平台搜索（用歌名+歌手重新搜索，返回 320kbps/10MB+ 完整文件）、网易云详情 API（`/song/enhance/player/url`，免费歌曲可用）、酷我 CDN 直连（`antiserver.kuwo.cn`，仅返回预览片段）、网易云 VIP 解析、Yaohu 直连、Yaohu 代理。

关键设计：`getMusicUrl` 接收 `singer` 参数用于精确匹配。早期版本不传歌手导致搜索"晴天"匹配到翻唱版本。加入歌手参数后，`findBestMatch()` 函数通过标题×0.6 + 歌手×0.4 的加权评分精确匹配目标歌曲。

前端通过 `GET /api/stream/url` 获取 302 重定向，浏览器自动跟随跳转到真实音频地址，避免了二次请求。

### 3. 歌词获取与智能匹配

歌词采用 6 级降级策略获取，并通过热门歌曲 ID 映射表绕过网易云 VIP 压制。

实现细节（`xinghaiSource.js` 中的 `getLyric()` 函数）：

Strategy 0 — 热门歌曲 ID 映射表：内置 80+ 首被网易云 VIP 压制的热门歌曲的已知 Netease ID（如周杰伦/晴天 = 186016）。搜索"晴天"时网易云不返回原版而充斥翻唱和假歌手（"周杰伦-"、"周杰伦./Asasblue"），映射表直接用已知 ID 获取歌词，绕过搜索环节。

Strategy 1 — 网易云搜索 + 假歌手过滤：用"歌手+歌名"搜索网易云，过滤掉假艺人名称（仅保留歌手名完全匹配的结果）。早期版本的 bug 是在过滤结果为空时回退到 `items[0]`（返回完全不相关的歌曲），已修复为 `null`，让后续策略继续尝试。

Strategy 2~6：酷我歌词 API、酷狗歌词 API、网易云 ID 直取、GDAPI 歌词、仅歌名搜索兜底。

歌词解析：`parseLRC()` 支持标准 LRC 格式 `[mm:ss.xx]`，`mergeLyrics()` 将原词和翻译按时间戳对齐合并。

### 4. 独立歌词页面（YU7 天际屏风格）

点击底部播放栏的歌曲名称，整个主区域切换为独立的歌词页面，歌词以悬浮飘动的效果展示。

实现细节：

页面切换（`App.jsx`）：通过 `showLyricsPage` 状态控制，为 `true` 时渲染 `LyricsPage` 替代 `Sidebar + MainContent`，播放栏始终可见。

悬浮效果（`app.css` 中的 `.lp` 系列样式）：当前歌词行以半透明白色玻璃卡片承载（`background: rgba(255,255,255,0.45)` + `backdrop-filter: blur(12px)`），通过 `@keyframes lpLineFloat` 实现 5 秒周期的上下浮动动画（translateY 0 → -4px），模拟小米 YU7 天际屏的悬浮 3D 感。当前行字体 26px/700 加粗，带 teal 色文字阴影；非当前行模糊淡化处理（`filter: blur(0.4px); opacity: 0.42`），营造空间纵深。

背景效果：使用专辑封面的 80px 高斯模糊版本（`filter: blur(80px) saturate(1.6)`）作为动态背景，叠加多层渐变遮罩保持可读性。

唱片动画：左侧圆形专辑封面在播放时以 20 秒/圈匀速旋转（模拟黑胶唱片），外围彩色渐变光环（`conic-gradient`）持续色相旋转。

交互功能：点击歌词行跳转到对应时间点，底部迷你控制条含进度条和播放/前后切按钮。

### 5. Crystal Water 设计系统

前端采用"Crystal Water"液态玻璃设计语言，以明亮的浅天空蓝为底色，半透明白色玻璃面板为核心元素。

实现细节（`glass.css`）：

色彩体系：背景 `#e8f4f8`（浅天空蓝）→ `#fafbfc`（暖白）→ `#f0eef5`（淡薰衣草），多层径向渐变叠加形成通透感。主色调 teal `#0ea5b7`，辅以珊瑚粉 `#f472b6`、天蓝 `#38bdf8`、紫罗兰 `#a78bfa`。

玻璃面板（`.glass-panel`）：背景 `rgba(255,255,255,0.6)` + `backdrop-filter: blur(24px) saturate(1.8)`，四面不同透明度边框模拟光线折射效果，顶部 1px 高光线模拟镜面反射（specular highlight），`::before` 伪元素绘制 135° 棱镜渐变边框。整体附带 `gentleFloat` 8 秒缓动上下浮动动画。

字体：Outfit（展示字体，拉丁文）+ Noto Sans SC（正文，中文），Google Fonts 加载。

动效系统：所有交互使用 `cubic-bezier(0.16, 1, 0.3, 1)` 弹性缓出曲线，按钮 hover 上浮 + 阴影扩散，active 按下缩放。播放按钮使用 `ease-spring` 弹性曲线。

### 6. 本地音乐管理

支持上传本地音频文件（MP3/FLAC/WAV/OGG/AAC），自动提取元数据并入库。

实现细节：后端使用 multer 处理文件上传（限制 100MB/文件），存入 `server/uploads/` 目录。SQLite 数据库存储歌曲元信息（标题、艺术家、专辑、时长、文件路径），通过 `GET /api/songs/:id/stream` 以流式响应播放。前端歌单支持创建/编辑/删除，歌曲可添加到多个歌单。

### 7. QQ 音乐歌单导入

输入 QQ 音乐歌单链接，自动解析歌单内容并支持批量在线播放。

实现细节（`qqMusic.js` + `import.js`）：通过 cheerio 解析 QQ 音乐网页版歌单页面，提取歌曲列表（标题、艺术家、专辑、mid）。导入的歌曲通过星海源的 `tx`（QQ 音乐）通道获取播放 URL。

### 8. 状态管理

使用 Zustand 轻量状态管理，分为两个 store：

`playerStore.js`：管理播放核心状态——当前歌曲（currentSong）、播放队列（queue）、播放/暂停（isPlaying）、进度（currentTime/duration）、音量（volume）、播放模式（顺序/随机/列表循环/单曲循环）。对外暴露 Audio 元素引用，供 App.jsx 绑定事件。

`libraryStore.js`：管理音乐库状态——歌单列表、当前选中歌单、搜索结果、UI 开关（搜索弹窗、导入弹窗）。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search?q=关键词&platforms=wy,kw&limit=20` | 多平台聚合搜索 |
| POST | `/api/stream/url` | 获取在线歌曲播放 URL |
| GET | `/api/stream/url?source=wy&songId=xxx&singer=xxx` | 302 重定向到音频地址 |
| GET | `/api/stream/lyric?source=wy&songName=晴天&singer=周杰伦` | 获取歌词 |
| GET | `/api/songs` | 获取本地歌曲列表 |
| POST | `/api/upload/music` | 上传本地音频文件 |
| GET | `/api/playlists` | 获取歌单列表 |
| POST | `/api/playlists` | 创建歌单 |
| POST | `/api/import/qq-playlist` | 导入 QQ 音乐歌单 |
| GET | `/api/health` | 健康检查 |

## 许可证

MIT License
