---
name: zypage-integration
description: Kiến trúc đồng bộ nhạc donate từ ZyPage — luồng dữ liệu Firebase → EventProcessor → Ingestion → Queue, các service liên quan và cách chúng phối hợp.
---

# ZyPage Integration — Kiến trúc đồng bộ nhạc donate

## Tổng quan

ZyPage là nền tảng donate cho streamer Việt Nam. Introvert Player kết nối với Firebase Realtime Database của ZyPage để nhận sự kiện donate nhạc theo thời gian thực, xử lý và đưa vào hàng đợi phát.

## Luồng dữ liệu tổng thể

```
ZyPage Firebase DB
       │
       ▼
┌──────────────────────────┐
│ ZyPageFirebaseListenerService │  Lắng nghe sự kiện Firebase
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ ZyPageFirebaseEventController │  Phân loại & điều phối sự kiện
│  ├─ handleAdd()          │     (donateMusicLoad, add, donateMusicEnd)
│  ├─ handleEnd()          │
│  └─ logDebugKeys()       │
└──────────┬───────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌────────────────────────┐
│ Command │  │ ZyPageDonationEventProcessor │
│ Service │  │  normalize() → liveEvent     │
└─────────┘  └──────────┬─────────────────┘
                        ▼
           ┌────────────────────────┐
           │ ZyPageQueueIngestionService │
           │  ├─ ingestOfficial()   │  Nhạc chính thức từ ZyPage
           │  ├─ ingestMessage()    │  Link nhạc trong tin nhắn
           │  └─ findDuplicate()    │  Chống trùng lặp
           └──────────┬─────────────┘
                      ▼
                 Queue (state.queue)
                      ▼
              Dashboard & OBS Overlay
```

## Luồng bổ sung: API Snapshot Sync

Song song với Firebase realtime, có cơ chế polling API snapshot:

```
┌──────────────────────────┐
│ ZyPageSyncOrchestrator   │  Điều phối sync theo lịch
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ ZyPageApiSnapshotService │  Fetch API endpoint ZyPage
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ ZyPageApiItemProcessor   │  Chuẩn hóa items từ API
│  ├─ normalizeMusicItem() │  Xử lý music order
│  ├─ normalizePlainItem() │  Xử lý tin nhắn text
│  └─ isTimestampEligible()│  Lọc theo timestamp
└──────────┬───────────────┘
           ▼
     ZyPageQueueIngestionService (tái sử dụng)
```

## Chi tiết các Service

### 1. ZyPageConnectionService
**File**: `services/zypage-connection-service.js`
**Vai trò**: Quản lý kết nối ban đầu tới ZyPage

Luồng kết nối:
1. User nhập URL ZyPage (VD: `https://zypage.com/donate-music/<token>`)
2. `parseConnectionInput()` trích xuất domain, token, pathType
3. Resolve `shop_id` qua:
   - Main process resolver (IPC) → ưu tiên
   - Saved shop_id từ localStorage → fallback
   - Fetch page HTML qua CORS proxy → cuối cùng
4. `persistConnection()` lưu vào localStorage
5. `startListener()` khởi động Firebase listener

```javascript
// Cấu trúc kết quả parseConnectionInput
{
    domain: 'https://zypage.com',
    token: 'e3e3e17213e6c6a51b249949fac5f2732dfa2ebe',
    pathType: 'donate-music'  // hoặc 'donate-message'
}
```

### 2. ZyPageDonationEventProcessor
**File**: `services/zypage-donation-event-processor.js`
**Vai trò**: Chuẩn hóa dữ liệu raw từ Firebase thành format thống nhất

Phương thức chính:
- `normalize(value)` — Chuẩn hóa event thành `liveEvent` object
- `normalizeMusic(music)` — Chuẩn hóa object music (xử lý cả string lẫn object)
- `resolveMedia(text)` — Phân giải URL/text thành `{ type, videoId, soundcloudUrl }`

```javascript
// Cấu trúc liveEvent trả về từ normalize()
{
    raw: value,
    data: { /* raw data */ },
    order: { /* order details */ },
    amount: 50000,
    message: 'Xin bài này',
    donorName: 'Mèo Cam',
    donationKey: 'key-123',
    eventValue: 1719000000,
    isOfficialMusicOrder: true,
    music: { url, title, thumbnail, author, channelName, start, key },
    donation: {
        id: 'music-key-1',
        name: 'Mèo Cam',
        amount: 50000,
        message: 'Xin bài này',
        timestamp: 1719000000,
        isMusicOrder: true,
        songLink: 'https://youtube.com/watch?v=...'
    }
}
```

### 3. ZyPageQueueIngestionService
**File**: `services/zypage-queue-ingestion-service.js`
**Vai trò**: Xử lý logic thêm bài vào queue (dedupe, metadata, view count)

Hai luồng nhập bài:
1. **`ingestOfficial(liveEvent)`** — Nhạc chính thức ZyPage đặt
   - Kiểm tra `isOfficialMusicOrder` và `music.url`
   - Resolve media type (YouTube/SoundCloud)
   - Fetch metadata nếu cần
   - Chống trùng qua `findDuplicate()` (so sánh id, musicKey, videoId, donor, amount, timestamp)
   - Merge source keys nếu duplicate (Firebase key + API key)
   
2. **`ingestMessage(liveEvent, minimumAmount)`** — Link nhạc trong tin nhắn donate
   - Kiểm tra minimum amount
   - Resolve media từ message text
   - Kiểm tra view count policy
   - Tạo song object với `fromMessage: true`

### 4. ZyPageApiItemProcessor
**File**: `services/zypage-api-item-processor.js`
**Vai trò**: Chuẩn hóa items từ API snapshot

- `normalizeMusicItem(key, item)` — Xử lý music item với key reconciliation
- `normalizePlainItem(key, item)` — Xử lý text item
- `isTimestampEligible(timestamp, lastSyncedTimestamp, isManual)` — Lọc items cũ (>7 ngày)
- `hasMatchingMusicTransaction(musicList, timestamp)` — Kiểm tra cross-reference

### 5. ZyPageFirebaseEventController
**File**: `services/zypage-firebase-event-controller.js`
**Vai trò**: Điều phối xử lý sự kiện Firebase

Xử lý 3 loại event:
- `donateMusicLoad` / `add` → `handleAdd()` → ingestion pipeline
- `donateMusicPause` → toggle playback
- `donateMusicEnd` → `handleEnd()` → skip bài (với dedup logic)

### 6. ZyPageSongEndService
**File**: `services/zypage-song-end-service.js`
**Vai trò**: Gửi API `donate_music_end` lên ZyPage khi bài hát kết thúc

## Key concepts

### Source Keys & Reconciliation
Mỗi bài nhạc có thể đến từ 2 nguồn: Firebase realtime event VÀ API snapshot. Hai nguồn này có key khác nhau:
- Firebase key: `music.key` (từ event `add`)
- API key: outer key trong `music.list` object

`zypageSourceKeys` array lưu TẤT CẢ các key đã biết, giúp reconciliation và dedup.

### Dedup Logic
`findDuplicate()` so sánh theo thứ tự ưu tiên:
1. `id` hoặc `musicKey` trùng → chắc chắn trùng
2. Cùng media (type + videoId/soundcloudUrl) + cùng donor + cùng amount → kiểm tra timestamp
3. `zypageTransactionTime` khớp (sai lệch ≤ 2s) → trùng
4. `timestamp` khớp (sai lệch < 2 phút) → trùng

### Timestamp normalization
Hàm `normalizeTimestamp` chuyển mọi giá trị (string, number, null) thành số nguyên milliseconds. Được inject vào mọi service cần xử lý thời gian.
