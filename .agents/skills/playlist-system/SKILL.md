---
name: playlist-system
description: Kiến trúc hệ thống Playlist trong Introvert Player — lifecycle của playlist request, Repository/Provider/Service pattern, và cách playlist được xử lý từ donate đến phát nhạc.
---

# Playlist System — Hệ thống quản lý Playlist

## Tổng quan

Hệ thống playlist cho phép viewer donate kèm link YouTube Playlist. Streamer có thể chấp nhận, từ chối, hoặc chuyển playlist thành bài đơn. Playlist được lưu trong SQLite và quản lý qua 3 lớp: **Repository → Provider → Service**.

## Kiến trúc 3 lớp

```
┌──────────────────────────────────────────────┐
│          PlaylistService (Orchestrator)        │
│  Điều phối toàn bộ business logic             │
│  ├─ processDonation()                         │
│  ├─ resolveAndAccept()                        │
│  ├─ reject() / pause() / resume()             │
│  └─ trackStarted() / trackFinished()          │
└───────────┬──────────────────┬────────────────┘
            │                  │
            ▼                  ▼
┌───────────────────┐  ┌──────────────────────┐
│ PlaylistRepository │  │ YouTubePlaylistProvider │
│ (SQLite CRUD)      │  │ (Fetch playlist data)   │
│ ├─ claim()         │  │ ├─ resolve()            │
│ ├─ saveResolved()  │  │ └─ fetchPlaylistData()  │
│ ├─ updateRequest() │  └──────────────────────────┘
│ ├─ updateTrack()   │
│ └─ getById()       │
└────────────────────┘
```

## Lifecycle của Playlist Request

```
received → validating → fetching_metadata → ready/pending_review/rejected
                                               │
                                               ▼ (streamer accept)
                                            queued → playing → completed
```

### Trạng thái chi tiết

| Status | Mô tả |
|---|---|
| `received` | Vừa nhận, chưa xử lý |
| `fetching_metadata` | Đang fetch metadata từ YouTube |
| `pending_review` | Chờ streamer kiểm tra (amount thấp, auto-accept tắt) |
| `ready` | Đã xác thực, sẵn sàng để đưa vào queue |
| `rejected` | Bị từ chối (bởi streamer hoặc tự động) |
| `queued` | Đã đưa vào hàng đợi phát nhạc |
| `playing` | Đang phát |
| `paused` | Tạm dừng |
| `completed` | Đã phát xong hoặc bị skip |
| `error` | Lỗi khi fetch metadata |

### Rejection Reasons

```javascript
const REASON_TEXT = {
    insufficient_amount: 'Số tiền donate chưa đạt mức tối thiểu để tự động nhận playlist.',
    manual_accept_required: 'Playlist đang chờ streamer kiểm tra và chấp nhận.',
    unknown_duration: 'Có video chưa xác định được thời lượng.',
    no_valid_tracks: 'Playlist không còn video hợp lệ sau khi kiểm tra.',
    rejected_by_streamer: 'Streamer đã từ chối playlist.',
    skipped_by_streamer: 'Streamer đã bỏ qua toàn bộ playlist.',
    converted_to_single: 'Playlist đã được chuyển thành một bài đơn.',
    playlist_disabled: 'Tính năng nhận playlist đang tắt.'
};
```

## PlaylistService — Business Logic

**File**: `services/playlist-service.js` (CommonJS, Node-only)

### Constructor
```javascript
class PlaylistService {
    constructor(options = {}) {
        this.repository = options.repository;   // PlaylistRepository (required)
        this.provider = options.provider;        // YouTubePlaylistProvider (required)
        this.emit = options.emit || (() => {});  // Event emitter callback
    }
}
```

### Phương thức chính

#### `processDonation(donation, settings, blacklistVideoIds)`
Luồng xử lý donate chứa playlist URL:
1. Parse message bằng `parsePlaylistDonationMessage()` → tìm playlist ID
2. Nếu message không chứa playlist, thử `donation.songLink`
3. Tạo placeholder request và `claim()` vào DB (idempotent)
4. Kiểm tra `playlistEnabled` → reject nếu tắt
5. Validate amount bằng `validatePlaylistAmount()`
6. Nếu `playlistAutoAccept` → gọi `resolveAndAccept()`
7. Ngược lại → `pending_review`

#### `resolveAndAccept(requestId, settings, blacklistVideoIds)`
1. Fetch playlist data từ YouTube qua `provider.resolve()`
2. Emit progress events (`playlist.validating`)
3. Filter tracks bằng `selectTracksWithinDuration()` (blacklist, duration limit)
4. Gán stable IDs cho mỗi track: `stableId('playlist_track', ...)`
5. Save resolved data vào DB
6. Emit `playlist.accepted` hoặc `playlist.rejected`

#### `trackStarted(trackId)` / `trackFinished(trackId, status, reason)`
Quản lý vòng đời phát của từng track trong playlist.

### Events emitted
| Event | Khi nào |
|---|---|
| `playlist.detected` | Vừa nhận playlist mới |
| `playlist.validating` | Đang xử lý (fetching_metadata, filtered) |
| `playlist.accepted` | Playlist được chấp nhận |
| `playlist.rejected` | Playlist bị từ chối |
| `playlist.queued` | Đã đưa vào queue |
| `playlist.started` | Track đầu tiên bắt đầu phát |
| `playlist.track_started` | Bất kỳ track nào bắt đầu |
| `playlist.track_progress` | Track phát xong |
| `playlist.track_skipped` | Track bị skip |
| `playlist.completed` | Toàn bộ playlist đã xong |
| `playlist.paused` | Playlist tạm dừng |
| `playlist.resumed` | Playlist tiếp tục |

## PlaylistRepository — Database Layer

**File**: `services/playlist-repository.js` (CommonJS)

SQLite tables:
```sql
-- Playlist requests
CREATE TABLE playlist_requests (
    id TEXT PRIMARY KEY,
    donation_id TEXT UNIQUE,
    donor_name TEXT,
    donation_amount REAL,
    original_message TEXT,
    source TEXT,
    external_playlist_id TEXT,
    title TEXT,
    owner_name TEXT,
    thumbnail_url TEXT,
    source_item_count INTEGER,
    accepted_item_count INTEGER,
    skipped_item_count INTEGER,
    total_duration_sec REAL,
    played_duration_sec REAL,
    status TEXT,
    rejection_reason TEXT,
    rejection_text TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

-- Playlist tracks
CREATE TABLE playlist_tracks (
    id TEXT PRIMARY KEY,
    playlist_request_id TEXT REFERENCES playlist_requests(id),
    position INTEGER,
    video_id TEXT,
    title TEXT,
    thumbnail_url TEXT,
    duration_sec REAL,
    channel_name TEXT,
    status TEXT,
    skip_reason TEXT,
    skip_reason_text TEXT
);
```

### Phương thức quan trọng
- `claim(placeholder)` — Idempotent create (chống race condition)
- `saveResolved(request, acceptedTracks, skippedTracks)` — Lưu kết quả resolve
- `updateRequest(id, fields)` — Cập nhật trạng thái
- `updateTrack(id, status, reason, reasonText)` — Cập nhật track
- `getById(id)` — Lấy request kèm tracks
- `getByDonationId(donationId)` — Tìm theo donation ID

## YouTubePlaylistProvider — Data Fetch

**File**: `services/youtube-playlist-provider.js` (CommonJS)

```javascript
class YouTubePlaylistProvider {
    constructor(options = {}) {
        this.fetchPlaylistData = options.fetchPlaylistData;  // Fetch YouTube HTML
        this.fetchVideoStats = options.fetchVideoStats;      // Fetch video duration/stats
    }

    async resolve(playlistId, { maxItems, onProgress }) {
        // 1. Fetch playlist page HTML
        // 2. Parse ytInitialData JSON
        // 3. Extract tracks, title, owner, thumbnail
        // 4. Fetch duration cho mỗi track (có progress callback)
        // 5. Return normalized result
    }
}
```

## PlaylistPolicy — Validation Rules

**File**: `services/playlist-policy.js` (CommonJS)

Pure functions không side effects:
- `normalizePlaylistSettings(raw)` — Chuẩn hóa settings với defaults
- `validatePlaylistAmount(amount, settings)` — Kiểm tra minimum amount
- `selectTracksWithinDuration(tracks, settings, blacklist)` — Lọc tracks

## Playlist Message Parser

**File**: `services/playlist-message-parser.js` (CommonJS)

- `parsePlaylistDonationMessage(message)` — Detect playlist URL trong message
- `parseYoutubeUrl(url)` — Trích xuất `playlistId` từ URL YouTube

## Stable ID Generation

```javascript
function stableId(prefix, value) {
    return `${prefix}_${crypto.createHash('sha1')
        .update(String(value))
        .digest('hex')
        .slice(0, 18)}`;
}
// VD: stableId('playlist', 'donate-123')
// → 'playlist_a1b2c3d4e5f6a1b2c3'
```

Đảm bảo cùng input → cùng ID (idempotent), tránh trùng lặp khi re-process.

## IPC Integration

Xem skill `ipc-bridge` cho chi tiết. Tóm tắt:
- `playlist-ipc-service.js` đăng ký tất cả IPC handlers
- Events push qua `mainWindow.webContents.send('playlist-event', envelope)`
- `RealtimeEventService` wrap event thành envelope chuẩn
