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
| Realtime sync | Firebase Realtime Database | Qua WebSocket của Firebase SDK (renderer-side) |
| Local sync | WebSocket (`ws` 8.x) | Main process tạo WS server cho Dashboard ↔ Overlay |
| Media | YouTube IFrame API | Renderer-side, phát nhạc qua iframe |
| Metadata | `@distube/ytdl-core`, `play-dl` | Main process, lấy metadata video |
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
├── services/               # 54 service files — business logic đã tách module
│   ├── zypage-*            # ZyPage integration (11 files)
│   ├── playlist-*          # Playlist management (7 files)
│   ├── dashboard-*         # Dashboard controllers & services (7 files)
│   ├── youtube-*           # YouTube duration & playlist provider (2 files)
│   ├── song-metadata-*     # Song metadata service
│   ├── sponsorblock-*      # SponsorBlock service
│   └── ...                 # Favorites, vote-skip, notification, etc.
├── tests/                  # 45 unit test files (node:test runner)
├── landing/                # Walkthrough HTML page
├── extension/              # Browser extension
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
│  │           IPC Handlers (ipcMain)                 │ │
│  └──────────────────────┬───────────────────────────┘ │
└─────────────────────────┼───────────────────────────┘
                          │ contextBridge (preload.js)
┌─────────────────────────┼───────────────────────────┐
│              RENDERER (app.js + index.html)          │
│  ┌──────────┐  ┌────────┴────────┐  ┌────────────┐  │
│  │ Firebase  │  │  Queue Manager  │  │  YouTube   │  │
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
│  Nền trong suốt, hiển thị bài nhạc đang phát         │
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
- Semantic versioning trong `package.json` (hiện tại 26.8.5)
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
