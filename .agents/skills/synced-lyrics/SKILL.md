---
name: synced-lyrics
description: Hệ thống Synced Lyrics trong Introvert Player — kiến trúc multi-provider, luồng resolve lyrics, romanization Nhật/Trung/Hàn, và timeline hiển thị trên Dashboard + OBS Overlay.
---

# Synced Lyrics — Hệ thống lời bài hát đồng bộ

## Tổng quan

Hệ thống Synced Lyrics tự động tìm kiếm lời bài hát đồng bộ theo thời gian (LRC/TTML timestamps) cho video YouTube đang phát. Lyrics hiển thị trên cả Dashboard (cuộn dọc đầy đủ) và OBS Overlay (3 câu quanh câu đang hát). Hỗ trợ phiên âm Latin cho tiếng Nhật, Trung Quốc và Hàn Quốc.

## Kiến trúc

```
┌──────────────────────────────────────────────────────┐
│                  MAIN PROCESS                         │
│  ┌────────────────────────────────────────────────┐   │
│  │            SyncedLyricsService                  │   │
│  │  ├─ resolve(song)     → lyrics + metadata       │   │
│  │  ├─ debug(song)       → detailed trace          │   │
│  │  ├─ fetchYouTubeIdentity(videoId)               │   │
│  │  ├─ resolveAppleMetadata(identity, sourceUrl)   │   │
│  │  ├─ resolveLrclib(identity, aliases, trace)     │   │
│  │  └─ resolveMusixmatch/Unison/LyricsPlus/Bini   │   │
│  └──────────────┬─────────────────────────────────┘   │
│                 │                                      │
│  ┌──────────────┴─────────────────────────────────┐   │
│  │       LyricsRomanizationService                 │   │
│  │  ├─ romanizeJapanese(text)  → kuroshiro/wanakana│   │
│  │  ├─ romanizeChinese(text)   → pinyin-pro        │   │
│  │  └─ romanizeLines(lines)    → batch             │   │
│  └────────────────────────────────────────────────┘   │
│                 │ IPC: get-synced-lyrics               │
│  ┌──────────────┴─────────────────────────────────┐   │
│  │       SyncedLyricsIpcService                    │   │
│  │  ├─ handle('get-synced-lyrics')                 │   │
│  │  └─ handle('debug-synced-lyrics')               │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────┬──────────────────────────────┘
                        │ contextBridge
┌───────────────────────┴──────────────────────────────┐
│              RENDERER (Dashboard + Overlay)            │
│  ┌────────────────────────────────────────────────┐   │
│  │       LyricsTimelineService (browser-side)      │   │
│  │  ├─ normalizeLines(lines) → sort, waiting dots  │   │
│  │  ├─ findActiveIndex(lines, currentTime)         │   │
│  │  └─ getWindow(lines, currentTime) → 3 lines    │   │
│  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

## Các Service liên quan

### 1. SyncedLyricsService (Main process)
**File**: `services/synced-lyrics-service.js` (CommonJS, ~1400 dòng)

Service lớn nhất của dự án. Chạy trên Main process, xử lý toàn bộ logic tìm kiếm và đối chiếu lyrics.

#### Constructor
```javascript
class SyncedLyricsService {
    constructor(options = {}) {
        this.fetchImpl = options.fetchImpl;          // HTTP fetch
        this.resolveYouTubeMetadata = options.resolveYouTubeMetadata; // YouTube API
        this.lyricsRomanizationService = options.lyricsRomanizationService;
        this.clientName = options.clientName;        // User-Agent
        this.clientVersion = options.clientVersion;
        this.timeoutMs = options.timeoutMs || 9000;
        this.cacheTtlMs = options.cacheTtlMs || 24h;
        this.failureCacheTtlMs = options.failureCacheTtlMs || 30min;
        this.durationToleranceSeconds = options.durationToleranceSeconds || 1.5;
        this.cache = options.cache || new Map();     // In-memory cache
    }
}
```

#### Luồng resolve chính
1. **Kiểm tra cache** — nếu có và chưa hết TTL → trả luôn
2. **fetchYouTubeIdentity(videoId)** — lấy title, artist từ oEmbed + credits từ page HTML
3. **resolveAppleMetadata(identity, sourceUrl)** — tìm trên iTunes để lấy metadata chuẩn (artist, album, duration)
4. **resolveLrclib(identity, aliases)** — tìm lyrics trên LRCLIB.net
   - Exact match trước (`/api/get` với track_name + artist_name + duration)
   - Fallback sang search (`/api/search`) với nhiều biến thể (core title, aliases)
   - Scoring system chấm điểm mỗi candidate
5. **resolveMusixmatch / resolveUnison / resolveLyricsPlus / resolveBini** — các provider phụ
6. **Romanization** — phiên âm Nhật/Trung/Hàn nếu lyrics chứa CJK
7. **Cache kết quả** (success: 24h, failure: 30min)

#### Static helpers quan trọng
| Method | Mô tả |
|---|---|
| `normalizeComparable(value)` | Chuẩn hóa text để so sánh (NFD, lowercase, remove diacritics) |
| `cleanTrackTitle(value)` | Bỏ hậu tố [Official Video], [MV], [Audio], etc. |
| `getCoreTrackTitle(value)` | Bỏ thêm (feat.), (Remix), (Live), etc. → tên lõi |
| `getTokenSimilarity(left, right)` | Token-based similarity score (0-1) |
| `hasRelatedArtist(left, right)` | So sánh artist linh hoạt (substring + token similarity ≥ 0.6) |
| `normalizeDuration(value)` | Làm tròn duration tới giây gần nhất |
| `hasExactDuration(candidate, identity)` | Duration khớp tuyệt đối (sau normalize) |
| `parseSyncedLyrics(value)` | Parse LRC format → `[{ time, text }]` |
| `parseTtmlLyrics(value)` | Parse TTML/XML format → `[{ time, text }]` |
| `containsHangul(value)` | Kiểm tra text có Hangul |
| `romanizeKoreanText(value)` | Phiên âm Hàn → Latin (built-in, không cần thư viện) |
| `getLyricsQuality(candidate)` | Đánh giá chất lượng lyrics (text coverage, time coverage) |
| `hasSufficientTimelineCoverage(lines, identity)` | Kiểm tra lyrics phủ ≥70% thời lượng |
| `isTopicChannel(value)` | Kiểm tra channel dạng "- Topic" |

#### Scoring system (scoreLyricsCandidate)
Chấm điểm mỗi lyrics candidate dựa trên:
- **Title match**: +12 (exact) → +10 (core) → +6 (substring) → +5 (token ≥ 0.75)
- **Artist match**: +8 (exact) → +4 (related)
- **Named version credits**: +12 nếu remix credit khớp
- **Duration match**: +16 (exact) → +12 (compatible) → -100 (không khớp)
- **Quality**: +8 (≥30 lines) / -30 (incomplete)
- **Text coverage**: +10 (≥ 0.65) → +4 (≥ 0.35)

### 2. LyricsRomanizationService (Main process)
**File**: `services/lyrics-romanization-service.js` (CommonJS)

Phiên âm lyrics CJK sang Latin:
- **Nhật**: kuroshiro (Kanji → romaji) + wanakana (Kana → romaji)
- **Trung**: pinyin-pro (Hán tự → pinyin)
- **Hàn**: Built-in trong SyncedLyricsService.romanizeKoreanText()

```javascript
class LyricsRomanizationService {
    constructor(options = {}) {
        this.toRomaji = options.toRomaji || wanakana.toRomaji;
        this.pinyin = options.pinyin || pinyin;
        this.createJapaneseConverter = options.createJapaneseConverter;
    }
    
    async romanizeLines(lines) → { lines, romanized: boolean, language: 'ja'|'zh'|'' }
}
```

Output: mỗi line có `text` (đã phiên âm) và `originalText` (text gốc CJK).

### 3. LyricsTimelineService (Browser + Node — IIFE dual-export)
**File**: `services/lyrics-timeline-service.js`

Chạy ở renderer, xác định câu đang hát và cửa sổ hiển thị:

```javascript
class LyricsTimelineService {
    constructor(options = {}) {
        this.beforeCount = options.beforeCount || 1;  // số câu trước
        this.afterCount = options.afterCount || 1;    // số câu sau
    }
    
    normalizeLines(lines)           // Sort, filter, thêm waiting dots (khoảng trống > 10s)
    findActiveIndex(lines, time)    // Binary search tìm câu hiện tại
    getWindow(lines, time)          // Trả cửa sổ { activeIndex, lines[] }
}
```

Mỗi line trong window có:
- `time`, `text`, `originalText?`, `isWaitingDots?`
- `index`, `active` (boolean), `upcoming` (boolean)

### 4. SyncedLyricsIpcService (Main process)
**File**: `services/synced-lyrics-ipc-service.js`

Register function pattern:
```javascript
function registerSyncedLyricsIpcService({ ipcMain, service }) {
    ipcMain.handle('get-synced-lyrics', async (_event, song) => service.resolve(song));
    ipcMain.handle('debug-synced-lyrics', async (_event, song) => service.debug(song));
}
```

## Lyrics Providers

| Provider | API | Ưu tiên | Ghi chú |
|---|---|---|---|
| **LRCLIB** | `lrclib.net/api/get` + `/api/search` | Chính | LRC synced lyrics, open-source |
| **Apple/iTunes** | `itunes.apple.com/search` + `/lookup` | Metadata | Lấy artist/album/duration chuẩn, không có lyrics |
| **Musixmatch** | `apic-desktop.musixmatch.com` | Phụ | Cần token, TTML format |
| **Unison** | `unison.boidu.dev/lyrics` | Phụ | Community lyrics |
| **LyricsPlus** | `lyricsplus.prjktla.my.id/v2/lyrics/get` | Phụ | Proxy/aggregator |
| **Bini** | `lyrics-api.binimum.org` | Phụ | Community lyrics |

## Cấu trúc dữ liệu Lyrics trong Song

```javascript
song.lyrics = {
    available: true,          // Có lyrics hay không
    resolved: true,           // Đã resolve xong chưa
    eligible: true,           // Video có đủ điều kiện tìm lyrics
    synced: true,             // Lyrics có timestamp hay plain-text
    source: 'LRCLIB',         // Provider nào
    romanized: false,         // Đã phiên âm CJK chưa
    trackName: 'Bài hát',     // Tên bài từ provider
    artistName: 'Ca sĩ',      // Nghệ sĩ từ provider
    lines: [                  // Mảng lyrics lines (tối đa 500)
        { time: 15.3, text: 'Câu lời...' },
        { time: 18.5, text: 'Phiên âm...', originalText: '日本語...' }
    ]
};
```

## Hiển thị trên UI

### Dashboard
- Cuộn dọc toàn bộ lyrics trong vùng chuyên dụng
- Auto-scroll bám theo câu đang hát
- Bấm vào câu bất kỳ → tua player tới timestamp đó
- Sau khi user cuộn thủ công → chờ rồi tự bám lại

### OBS Overlay
- Hiển thị tối đa 3 câu (before=1, current=1, after=1)
- Câu đang hát: font lớn hơn, đậm, sáng
- Câu dài tự xuống tối đa 3 dòng, tự giảm font
- Ba chấm nhấp nháy (...) khi khoảng trống > 10 giây
- Overlay tự tăng chiều cao 280px khi có lyrics, trở về 160px khi không có

## Lưu ý kỹ thuật

1. **Duration matching rất quan trọng**: Lyrics chỉ được chấp nhận khi duration khớp tuyệt đối (sau round về giây nguyên) hoặc sai lệch ≤ 1.5s
2. **Topic channel** ("Artist - Topic"): tự động lấy credits từ mô tả YouTube để xác nhận đúng nghệ sĩ
3. **YouTube Music**: Giữ sourceUrl xuyên suốt pipeline để nhận diện link music.youtube.com
4. **Cache**: Success cache 24h, failure cache 30 phút, in-memory Map
5. **Korean romanization**: Built-in, không cần thư viện ngoài (unicode decomposition + liaison rules)
6. **Concurrent resolve**: Nhiều provider race, kết quả tốt nhất được chọn qua scoring
