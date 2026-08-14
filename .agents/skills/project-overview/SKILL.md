---
name: project-overview
description: Tổng quan kiến trúc, tech stack, cấu trúc thư mục và các quy ước chung của Introvert Player — ứng dụng Electron phát nhạc donate cho streamer Việt Nam tích hợp ZyPage.
---

# Introvert Player — Project Overview

## Mô tả dự án

**Introvert Player** (tên nội bộ: `introvert-player`, brand: *Pineapple Studio / Dứa Corner Player*) là ứng dụng desktop Electron dành cho streamer Việt Nam. Ứng dụng tự động đồng bộ nhạc donate từ nền tảng **ZyPage** vào hàng đợi phát nhạc, hiển thị lên OBS Overlay, hỗ trợ SponsorBlock, tìm kiếm YouTube cá nhân hóa, và nhiều tính năng nâng cao khác.

## Tech Stack

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Framework | Electron 42.x | Main + Renderer process |
| Frontend | Vanilla JS, HTML, CSS | Không dùng React/Vue |
| Database | `node:sqlite` (DatabaseSync) | SQLite sync API, lưu donations + playlists + realtime channels |
| Lyrics | LRCLIB, Apple iTunes, Musixmatch, Unison, LyricsPlus, Bini | Multi-provider synced lyrics (LRC/TTML), chạy ở Main process |
| Romanization | kuroshiro, wanakana, pinyin-pro | Phiên âm Nhật/Trung/Hàn cho lyrics |
| Realtime sync | Firebase Realtime Database | Qua WebSocket của Firebase SDK (renderer-side) |
| Local sync | WebSocket (`ws` 8.x) | Main process tạo WS server cho Dashboard ↔ Overlay |
| Media | YouTube IFrame API | Renderer-side, phát nhạc qua iframe |
| Metadata | `@distube/ytdl-core`, `play-dl` | Main process, lấy metadata video |
| DirectStream | yt-dlp (child_process spawn) | Bypass YouTube iframe, phát audio trực tiếp qua `<audio>` |
| Build | `electron-builder` (NSIS) | Tạo installer Windows |

## Cấu trúc thư mục

```
v26.8.0/
├── main.js                 # Electron main process (~3100+ dòng)
│                           # Khởi tạo BrowserWindow, IPC handlers, WS server,
│                           # SQLite, YouTube search, auto-update
├── preload.js              # IPC bridge qua contextBridge.exposeInMainWorld
├── app.js                  # Renderer logic (Dashboard, ~364KB)
│                           # Quản lý queue, UI, Firebase listener, MQTT
├── index.html              # Streamer Dashboard (trang chính)
├── overlay.html            # OBS Browser Source overlay (trang phụ)
├── styles.css              # CSS chung cho Dashboard
├── services/               # 66 service files — business logic đã tách module
│   ├── zypage-*            # ZyPage integration (11 files)
│   ├── playlist-*          # Playlist management (8 files)
│   ├── dashboard-*         # Dashboard controllers & services (8 files)
│   ├── youtube-*           # YouTube duration, playlist, stream & fallback (4 files)
│   ├── synced-lyrics-*     # Lyrics đồng bộ: service, IPC, timeline (3 files)
│   ├── lyrics-*            # Romanization & timeline display (2 files)
│   ├── windows-media-*     # Windows Media Controls / headphone (1 file)
│   ├── dolby-spatial-*     # Dolby Spatial Audio effect chain (1 file)
│   ├── quick-add-*         # Quick Add service & UI controller (2 files)
│   ├── song-metadata-*     # Song metadata service
│   ├── sponsorblock-*      # SponsorBlock service
│   ├── overlay-*           # Overlay event & song payload (2 files)
│   ├── media-parser-*      # URL parsing (YouTube, Spotify, SoundCloud)
│   ├── action-code-*       # Mã khuyến mãi / bonus actions
│   ├── sensitive-video-*   # Cấu hình video nhạy cảm từ Gist
│   ├── browser-media-*     # Browser extension media state
│   └── ...                 # Favorites, vote-skip, notification, queue, etc.
├── tests/                  # 57 unit test files (node:test runner)
├── landing/                # Walkthrough HTML page
├── extension/              # Browser extension (YouTube/Music add-to-queue)
├── build/                  # Build assets (icon)
├── asset/                  # App assets (images, sounds)
├── package.json            # npm config
└── CHANGELOG.md            # Nhật ký thay đổi
```

## Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────┐
│                  MAIN PROCESS (main.js)              │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  SQLite   │  │ WS Server│  │ YouTube Metadata  │  │
│  │ Database  │  │ (ws:8765)│  │ (ytdl / play-dl)  │  │
│  └────┬─────┘  └────┬─────┘  └─────────┬─────────┘  │
│       │              │                  │             │
│  ┌────┴──────────────┴──────────────────┴──────────┐ │
│  │  SyncedLyrics │ DirectStream │ BrowserMediaState │ │
│  │  (LRCLIB+Apple)│ (yt-dlp)    │ (Extension)       │ │
│  └────┬──────────┴──────────────┴─────────────────┘  │
│       │                                              │
│  │           IPC Handlers (ipcMain)                 │ │
│  └──────────────────────┬───────────────────────────┘ │
└─────────────────────────┼───────────────────────────┘
                          │ contextBridge (preload.js)
┌─────────────────────────┼───────────────────────────┐
│              RENDERER (app.js + index.html)          │
│  ┌──────────┐  ┌────────┴────────┐  ┌────────────┐  │
│  │ Firebase  │  │  Queue Manager  │  │  YouTube   │  │
│  │           │  │                 │  │  + Direct  │  │
│  │ Listener  │  │  (state/queue)  │  │  IFrame    │  │
│  └─────┬────┘  └────────┬────────┘  └────────────┘  │
│        │                │                             │
│  ┌─────┴────────────────┴──────────────────────────┐ │
│  │         Services (services/*.js)                 │ │
│  │  EventProcessor → Ingestion → Queue → Playback  │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
                          │ WebSocket / localStorage
┌─────────────────────────┼───────────────────────────┐
│              OBS OVERLAY (overlay.html)              │
│  Nền trong suốt, hiển thị bài nhạc + synced lyrics   │
└──────────────────────────────────────────────────────┘
```

## Quy ước quan trọng

### Ngôn ngữ
- **Code**: tiếng Anh (tên biến, tên hàm, comments kỹ thuật)
- **UI text & Log messages**: tiếng Việt
- **Test names**: tiếng Việt (mô tả hành vi bằng tiếng Việt)

### File naming
- Service: `kebab-case.js` (VD: `zypage-queue-ingestion-service.js`)
- Test: `kebab-case.test.js` (tên khớp service)
- Mỗi file service chứa đúng 1 class

### State management
- Ứng dụng dùng 1 object `state` chia sẻ (passed by reference) chứa `queue`, `endedKeys`, `currentSong`, etc.
- Không dùng state management library — truyền `state` qua constructor options

### Versioning
- Semantic versioning trong `package.json` (hiện tại 26.8.12)
- CHANGELOG.md ghi bằng tiếng Việt

## Chạy ứng dụng

```bash
# Cài dependencies
npm install

# Chạy development
npm start          # hoặc: npm run dev

# Chạy tests
npm test           # hoặc: node --test tests/*.test.js

# Build installer
npm run build      # Tạo NSIS installer trong dist-v2/
```
