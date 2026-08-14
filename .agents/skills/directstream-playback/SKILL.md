---
name: directstream-playback
description: Hệ thống DirectStream & Audio Playback trong Introvert Player — yt-dlp bypass iframe, Dolby Spatial Audio, Windows Media Controls, YouTube Playback Fallback, và Browser Extension media state.
---

# DirectStream & Audio Playback — Phát nhạc nâng cao

## Tổng quan

Introvert Player hỗ trợ 2 chế độ phát nhạc:
1. **YouTube IFrame** (mặc định): Phát qua YouTube IFrame API, đơn giản nhưng bị hạn chế bởi embedding policies
2. **DirectStream** (bypass): Dùng yt-dlp để resolve URL audio trực tiếp, phát qua `<audio>` element, bypass embedding restrictions

Ngoài ra còn có hệ thống audio processing (Dolby Spatial Audio), tích hợp Windows Media Controls, và browser extension media state.

## Kiến trúc

```
┌─────────────────────────────────────────────────────┐
│                  MAIN PROCESS                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │         YouTubeStreamService                     │ │
│  │  ├─ resolve(videoId, options)                    │ │
│  │  │   └─ Chạy nhiều yt-dlp attempts song song    │ │
│  │  │       (Promise.any / race pattern)            │ │
│  │  ├─ runAttempt(path, videoId, attempt, signal)   │ │
│  │  ├─ classifyFailure(message, resolver)           │ │
│  │  └─ serializeNetscapeCookies(cookies)            │ │
│  └───────────────────┬─────────────────────────────┘ │
│                      │ IPC / WS                       │
└──────────────────────┼───────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────┐
│              RENDERER (Dashboard + Overlay)           │
│  ┌───────────────────┴─────────────────────────────┐ │
│  │  YouTubePlaybackFallbackPolicy                   │ │
│  │  ├─ evaluateInitialLoad(input)                   │ │
│  │  │   → { action: 'confirm'|'wait'|'fallback' }  │ │
│  │  └─ Quyết định khi nào chuyển iframe → DirectStream │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  DolbySpatialAudioService                        │ │
│  │  ├─ init(audioElement)  → Web Audio API chain    │ │
│  │  ├─ resume()            → Khôi phục AudioContext │ │
│  │  └─ setEnabled(bool)    → Toggle effect          │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  WindowsMediaService                             │ │
│  │  ├─ initialize()        → MediaSession setup     │ │
│  │  ├─ updateMetadata(song, isPlaying)              │ │
│  │  ├─ updatePosition(currentTime, duration)        │ │
│  │  └─ handleMediaAction(action)                    │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │  BrowserMediaStateService (Main process)         │ │
│  │  ├─ update(payload)     → From extension         │ │
│  │  ├─ removeTab(tabId)    → Tab closed             │ │
│  │  └─ getSnapshot()       → Current state          │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## YouTubeStreamService

**File**: `services/youtube-stream-service.js` (IIFE dual-export)

### Constructor
```javascript
class YouTubeStreamService {
    constructor(options = {}) {
        this.spawnImpl = options.spawnImpl;       // child_process.spawn
        this.fsImpl = options.fsImpl;             // fs module
        this.getYtDlpPath = options.getYtDlpPath; // () => path to yt-dlp.exe
        this.nodeRuntimePath = options.nodeRuntimePath; // process.execPath
        this.processEnv = options.processEnv;
        this.timeoutMs = options.timeoutMs || 25000;
        this.attempts = options.attempts || [     // Các client để thử
            { name: 'default-audio' },
            { name: 'tv-embedded-audio', extractorArgs: 'youtube:player_client=tv_embedded' },
            { name: 'web-creator-audio', extractorArgs: 'youtube:player_client=web_creator' },
            { name: 'web-music-audio', extractorArgs: 'youtube:player_client=web_music' },
            { name: 'web-safari-audio', extractorArgs: 'youtube:player_client=web_safari' },
            { name: 'tv-downgraded-audio', extractorArgs: 'youtube:player_client=tv_downgraded' }
        ];
    }
}
```

### Luồng resolve

1. Validate videoId (regex `^[A-Za-z0-9_-]{6,20}$`)
2. Kiểm tra yt-dlp.exe tồn tại
3. Chạy **tất cả attempts song song** (mỗi attempt = 1 yt-dlp child process)
4. `Promise.any()` — lấy kết quả đầu tiên thành công
5. Abort tất cả attempts còn lại
6. Nếu tất cả fail → phân loại lỗi theo priority:
   - `authentication_required` > `embedding_disabled` > `format_unavailable` > `drm_protected` > `resolver_timeout` > `yt_dlp_failed`

### yt-dlp arguments
```bash
yt-dlp --no-playlist --no-warnings --no-progress \
    --js-runtimes node:/path/to/electron.exe \
    --cookies /path/to/cookies.txt \
    --extractor-args youtube:player_client=tv_embedded \
    -g -f "bestaudio[protocol=https]/bestaudio*[protocol=https]" \
    "https://www.youtube.com/watch?v=VIDEO_ID"
```

Key flags:
- `--js-runtimes`: Sử dụng Electron runtime như Node.js để giải n/sig challenge (ELECTRON_RUN_AS_NODE=1)
- `--cookies`: Cookie file Netscape format từ session YouTube
- `-g`: Chỉ lấy URL, không tải file
- `-f bestaudio[protocol=https]`: Chỉ lấy audio-only HTTPS streams, tránh HLS manifest

### Error Classification
```javascript
static classifyFailure(message, resolver) {
    // DRM trên TV client → không phải thật sự DRM
    // 'sign in to confirm you're not a bot' → authentication_required
    // 'playback on other websites has been disabled' → embedding_disabled
    // 'requested format is not available' → format_unavailable
    // 'timed out' → resolver_timeout
}
```

### Cookie Serialization
```javascript
static serializeNetscapeCookies(cookies) → string
// Chuyển Electron cookies array → Netscape HTTP Cookie File format
// Dùng cho yt-dlp --cookies
```

### Custom Error Class
```javascript
class YouTubeStreamResolutionError extends Error {
    constructor(code, message, statusCode, details) {
        // code: 'invalid_video_id' | 'yt_dlp_not_ready' | 'drm_protected' | ...
        // statusCode: HTTP-like status (400, 422, 502, 503, 504)
        // details: Array of per-attempt failures
    }
}
```

## YouTubePlaybackFallbackPolicy

**File**: `services/youtube-playback-fallback-policy.js` (IIFE dual-export)

Quyết định khi nào chuyển từ YouTube IFrame sang DirectStream:

```javascript
class YouTubePlaybackFallbackPolicy {
    constructor(options = {}) {
        this.blockedStateGraceMs = options.blockedStateGraceMs || 8000;
        this.generalGraceMs = options.generalGraceMs || 12000;
        this.progressThresholdSec = options.progressThresholdSec || 0.5;
    }
    
    evaluateInitialLoad(input) → { action, reason }
    // action: 'confirm_playback' | 'wait' | 'fallback'
    // reason: 'playback_progress' | 'playback_suppressed' | 'blocked_zero_duration' |
    //         'initial_load_timeout' | 'blocked_grace' | 'loading_grace'
}
```

Logic:
1. Nếu đã bắt đầu phát (currentTime > 0.5 hoặc state PLAYING) → `confirm_playback`
2. Nếu playback bị suppressed (autoplay policy) → `wait`
3. Nếu player bị kẹt (UNSTARTED/PAUSED/CUED + duration=0) quá 8s → `fallback`
4. Nếu quá 12s tổng cộng → `fallback`

## DolbySpatialAudioService

**File**: `services/dolby-spatial-audio-service.js` (IIFE dual-export)

Web Audio API processing chain cho âm thanh sống động hơn:

```
sourceNode → subBassFilter (90Hz, +3.2dB)
           → vocalClarityFilter (2800Hz, +2.2dB, Q=1.2)
           → spatialAirFilter (11000Hz, +2.5dB)
           → spatialPanner (stereo)
           → earlyReflectionsDelay (14ms left, 28ms right, gain=0.18)
           → dynamicCompressor (-18dB threshold, ratio=3.5)
           → masterGain
           → destination
```

```javascript
class DolbySpatialAudioService {
    constructor(options = {}) {
        this.AudioContextClass = options.AudioContextClass;
    }
    
    init(audioElement)      // Tạo AudioContext + connect chain
    resume()                // Khôi phục suspended context
    setEnabled(enabled)     // Toggle tất cả filter gains về 0 hoặc giá trị gốc
}
```

**Lưu ý**: Chỉ hoạt động với DirectStream (`<audio>` element), KHÔNG áp dụng được cho YouTube IFrame.

## WindowsMediaService

**File**: `services/windows-media-service.js` (IIFE dual-export)

Tích hợp Windows System Media Controls (media keys trên bàn phím, headphone controls):

```javascript
class WindowsMediaService {
    constructor(options = {}) {
        this.mediaSession = options.mediaSession;   // navigator.mediaSession
        this.MediaMetadata = options.MediaMetadata;  // window.MediaMetadata
        this.onPlay = options.onPlay;
        this.onPause = options.onPause;
        this.onNext = options.onNext;
        this.onPrevious = options.onPrevious;
        this.onSeek = options.onSeek;
    }
    
    initialize()                          // Setup audio keeper + handlers
    updateMetadata(song, isPlaying)       // Cập nhật MediaSession metadata
    updatePosition(currentTime, duration) // Cập nhật position state
    handleMediaAction(action)             // Xử lý hardware media key
}
```

**Cơ chế Audio Keeper**: Tạo `<audio>` element ẩn phát WAV im lặng loop để giữ MediaSession active (vì YouTube IFrame không trigger MediaSession).

### IPC channel
- `media-control-action` (push): Main process push media key events xuống renderer

## BrowserMediaStateService

**File**: `services/browser-media-state-service.js` (CommonJS, Main process)

Nhận trạng thái phát nhạc từ browser extension (YouTube/YouTube Music/SoundCloud đang phát trong Chrome):

```javascript
class BrowserMediaStateService {
    constructor(options = {}) {
        this.staleAfterMs = options.staleAfterMs || 10000;
    }
    
    update(payload)       // Cập nhật từ extension
    removeTab(tabId)      // Tab đóng
    getSnapshot()         // Lấy snapshot hiện tại (auto-mark stale > 10s)
}
```

### IPC channel
- `browser-media-state` (push): Push extension state tới renderer
- `add-song-external` (push): Extension thêm bài vào queue

## Các Service hỗ trợ khác

### PlaybackController
**File**: `services/playback-controller.js` (IIFE, minified)

Controller đơn giản cho phát/dừng/skip/tua/âm lượng:
- `toggle(state)` → play/pause
- `skip(state, options)` → skip + playNext
- `seek(percent, duration)` → tua tới vị trí
- `volume(state, value)` → đổi âm lượng (0-100)

### DurationRetryService
**File**: `services/duration-retry-service.js` (IIFE dual-export)

Retry lấy duration khi metadata ban đầu thiếu:
- Delays: [1.5s, 3s, 5s, 10s, 15s]
- Max attempts: 3 (có thể override per-job)
- Callbacks: `onResult`, `onResolved`, `onExhausted`, `onError`
- Cancel support: `cancel(key)`

### OverlaySongPayloadService
**File**: `services/overlay-song-payload-service.js` (IIFE dual-export)

Build payload gửi tới OBS Overlay khi bài mới bắt đầu. Bao gồm:
- Song metadata (title, thumbnail, author, donor, amount)
- Playback config (volume, start, end, maxDuration, skipSegments)
- Playlist context (requestId, position, totalTracks)
- **Lyrics data** (lines, synced, romanized, source)
- Next song preview
- Vote skip state
- Extension code & timing

### OverlayEventService
**File**: `services/overlay-event-service.js` (IIFE dual-export)

Evaluate overlay events (ended, player_error) với dedup và stale detection:
- `evaluate(event, state)` → `{ action: 'ended'|'player_error'|'ignore', reason }`
- `progress(data, song, calculate)` → `{ isLive, limitDuration, elapsedTime, percent }`
