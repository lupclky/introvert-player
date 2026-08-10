---
name: ipc-bridge
description: Hướng dẫn giao tiếp IPC giữa Main process và Renderer process trong Introvert Player — pattern preload, cách thêm IPC channel mới, và các channel hiện có.
---

# IPC Bridge — Giao tiếp Main ↔ Renderer

## Tổng quan

Introvert Player sử dụng Electron IPC với **contextBridge isolation** (`contextIsolation: true`). Renderer process KHÔNG truy cập trực tiếp Node.js APIs — mọi giao tiếp đều qua `window.electronAPI`.

## Kiến trúc 3 lớp

```
┌──────────────────────────────────┐
│         RENDERER (app.js)        │
│  window.electronAPI.searchYouTube('query')  │
└──────────────┬───────────────────┘
               │ contextBridge
┌──────────────┴───────────────────┐
│         PRELOAD (preload.js)     │
│  ipcRenderer.invoke('search-youtube', query) │
└──────────────┬───────────────────┘
               │ IPC channel
┌──────────────┴───────────────────┐
│       MAIN PROCESS (main.js)     │
│  ipcMain.handle('search-youtube', handler)   │
└──────────────────────────────────┘
```

## Hai loại IPC

### 1. Request-Response (`invoke` / `handle`)
Dùng khi cần trả kết quả về renderer:

```javascript
// preload.js
searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),

// main.js
ipcMain.handle('search-youtube', async (event, query) => {
    const results = await fetchYoutubeSearchResults(query);
    return results;
});

// app.js (renderer)
const results = await window.electronAPI.searchYouTube('bài hát');
```

### 2. Fire-and-Forget (`send` / `on`)
Dùng khi không cần kết quả:

```javascript
// preload.js
minimize: () => ipcRenderer.send('window-control', 'minimize'),

// main.js
ipcMain.on('window-control', (event, action) => {
    if (action === 'minimize') mainWindow.minimize();
});
```

### 3. Main → Renderer (Push events)
Dùng khi main process muốn đẩy dữ liệu xuống renderer:

```javascript
// main.js
mainWindow.webContents.send('playlist-event', eventPayload);

// preload.js
onPlaylistEvent: (callback) => ipcRenderer.on('playlist-event',
    (event, payload) => callback(payload)),

// app.js (renderer)
window.electronAPI.onPlaylistEvent((payload) => {
    console.log('Playlist event:', payload);
});
```

## Danh sách IPC Channels hiện có

### Window Controls
| Channel | Loại | Mô tả |
|---|---|---|
| `window-control` | send | minimize, maximize, close, focus, system-menu |
| `theme-change` | send | Đổi theme (dark/light) |
| `window-state-change` | push | Thông báo trạng thái cửa sổ |

### App & Updates
| Channel | Loại | Mô tả |
|---|---|---|
| `get-app-version` | invoke | Lấy version app |
| `check-for-updates` | invoke | Kiểm tra update mới |
| `start-update` | send | Bắt đầu tải update |
| `update-progress` | push | Tiến trình tải |
| `update-downloaded` | push | Tải xong |
| `update-error` | push | Lỗi update |

### YouTube
| Channel | Loại | Mô tả |
|---|---|---|
| `search-youtube` | invoke | Tìm kiếm YouTube |
| `get-youtube-metadata` | invoke | Lấy metadata video |
| `resolve-external-url` | invoke | Resolve URL ngoài (redirect follow) |
| `youtube-login` | invoke | Đăng nhập YouTube OAuth |
| `youtube-check-auth` | invoke | Kiểm tra trạng thái auth |
| `youtube-logout` | invoke | Đăng xuất |
| `youtube-get-playlists` | invoke | Lấy danh sách playlist cá nhân |
| `youtube-get-playlist-videos` | invoke | Lấy videos trong playlist |
| `youtube-get-recommendations` | invoke | Lấy video gợi ý |

### Playlist System
| Channel | Loại | Mô tả |
|---|---|---|
| `playlist-process-donation` | invoke | Xử lý donate có playlist |
| `playlist-add-manual` | invoke | Thêm playlist thủ công |
| `playlist-list-pending` | invoke | Danh sách playlist chờ |
| `playlist-list-active` | invoke | Danh sách playlist đang chạy |
| `playlist-accept` | invoke | Chấp nhận playlist |
| `playlist-reject` | invoke | Từ chối playlist |
| `playlist-convert-single` | invoke | Chuyển thành bài đơn |
| `playlist-mark-queued` | invoke | Đánh dấu đã xếp hàng |
| `playlist-track-started` | invoke | Track bắt đầu phát |
| `playlist-track-finished` | invoke | Track phát xong |
| `playlist-pause` | invoke | Tạm dừng playlist |
| `playlist-resume` | invoke | Tiếp tục playlist |
| `playlist-skip` | invoke | Bỏ qua playlist |
| `playlist-event` | push | Push sự kiện playlist |

### ZyPage
| Channel | Loại | Mô tả |
|---|---|---|
| `zypage-song-end` | invoke | Gửi API kết thúc bài hát |
| `zypage-resolve-shop-id` | invoke | Resolve shop ID |

### Database (Donations)
| Channel | Loại | Mô tả |
|---|---|---|
| `db-get-donations` | invoke | Lấy danh sách donations |
| `db-add-donation` | invoke | Thêm donation |
| `db-mark-read` | invoke | Đánh dấu đã đọc |
| `db-mark-all-read` | invoke | Đánh dấu tất cả đã đọc |
| `db-clear-history` | invoke | Xóa lịch sử |

### Misc
| Channel | Loại | Mô tả |
|---|---|---|
| `save-log-entry` | send | Lưu log ra file |
| `open-log-file` | invoke | Mở file log |
| `check-ytdlp-status` | invoke | Kiểm tra yt-dlp |
| `download-ytdlp` | invoke | Tải yt-dlp |
| `ytdlp-download-progress` | push | Tiến trình tải yt-dlp |
| `test-donate` | push | Test donate (dev) |
| `add-song-external` | push | Thêm bài từ extension |
| `show-taskbar-notification` | send | Hiển thị notification |
| `open-external-url` | send | Mở link ngoài |
| `show-favorite-context-menu` | send | Context menu favorites |
| `favorite-context-action` | push | Kết quả context menu |
| `show-queue-context-menu` | send | Context menu queue |
| `queue-context-action` | push | Kết quả context menu |
| `save-walkthrough-html` | invoke | Lưu walkthrough HTML |
| `save-walkthrough-image` | invoke | Lưu walkthrough image |

## Cách thêm IPC Channel mới

### Bước 1: Thêm vào `preload.js`

```javascript
// Trong contextBridge.exposeInMainWorld('electronAPI', { ... })

// Request-Response:
myNewFeature: (param1, param2) => ipcRenderer.invoke('my-new-feature', param1, param2),

// Fire-and-Forget:
doSomething: (data) => ipcRenderer.send('do-something', data),

// Push listener:
onSomethingHappened: (callback) => ipcRenderer.on('something-happened',
    (event, data) => callback(data)),
```

### Bước 2: Thêm handler trong `main.js`

```javascript
// Request-Response:
ipcMain.handle('my-new-feature', async (event, param1, param2) => {
    // Xử lý logic
    return result;
});

// Fire-and-Forget:
ipcMain.on('do-something', (event, data) => {
    // Xử lý, không cần return
});

// Push từ main:
mainWindow.webContents.send('something-happened', data);
```

### Bước 3: Sử dụng trong renderer (`app.js`)

```javascript
// Request-Response:
const result = await window.electronAPI.myNewFeature(param1, param2);

// Fire-and-Forget:
window.electronAPI.doSomething(data);

// Listen push:
window.electronAPI.onSomethingHappened((data) => {
    console.log('Received:', data);
});
```

## IPC Service Pattern (tách logic)

Với các feature phức tạp, logic IPC handler được tách ra file riêng trong `services/`:

```javascript
// services/my-feature-ipc-service.js
'use strict';

function registerMyFeatureIpcService({ ipcMain, getService }) {
    ipcMain.handle('my-feature-action', async (event, ...args) => {
        const service = getService();
        return service.doAction(...args);
    });
}

module.exports = { registerMyFeatureIpcService };
```

```javascript
// main.js
const { registerMyFeatureIpcService } = require('./services/my-feature-ipc-service');
registerMyFeatureIpcService({
    ipcMain,
    getService: () => myFeatureService
});
```

Ví dụ thực tế: `playlist-ipc-service.js`, `donation-ipc-service.js`, `zypage-song-end-ipc-service.js`

## Lưu ý quan trọng

1. **Không truyền Electron objects qua IPC** — chỉ truyền plain objects/primitives
2. **Không expose `ipcRenderer` trực tiếp** — luôn wrap trong function cụ thể
3. **Error handling**: `ipcMain.handle` tự động serialize Error về renderer
4. **Channel naming**: kebab-case, prefix theo domain (`playlist-*`, `zypage-*`, `db-*`)
