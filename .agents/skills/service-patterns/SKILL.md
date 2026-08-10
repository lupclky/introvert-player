---
name: service-patterns
description: Quy ước và pattern bắt buộc khi tạo hoặc sửa service trong thư mục services/ của Introvert Player — bao gồm IIFE module, constructor DI, dual-export, và naming convention.
---

# Service Patterns — Quy ước viết Service

## Tổng quan

Thư mục `services/` chứa 54 file, mỗi file là 1 class service độc lập. Có **2 loại module pattern** được sử dụng tùy theo context chạy của service:

| Pattern | Dùng khi | Ví dụ |
|---|---|---|
| **IIFE Dual-Export** | Service chạy được ở CẢ renderer (browser) lẫn Node.js (test/main) | `zypage-api-item-processor.js`, `zypage-donation-event-processor.js` |
| **CommonJS Standard** | Service CHỈ chạy ở main process (Node.js) | `playlist-service.js`, `local-realtime-database-service.js` |

## Pattern 1: IIFE Dual-Export (Browser + Node)

Đây là pattern phổ biến nhất. Service được bọc trong IIFE, gắn vào `globalScope` (window/globalThis) và đồng thời export qua `module.exports`:

```javascript
(function attachServiceName(globalScope) {
    'use strict';

    class MyService {
        constructor(options = {}) {
            // Tất cả dependencies được inject qua options
            this.someDep = options.someDep;
            this.log = options.log || (() => {});
            this.now = options.now || Date.now;
        }

        someMethod() {
            // business logic
        }
    }

    // Dual-export: gắn vào global scope VÀ module.exports
    globalScope.MyService = MyService;
    if (typeof module !== 'undefined' && module.exports) module.exports = MyService;
})(typeof window !== 'undefined' ? window : globalThis);
```

### Quy tắc quan trọng:
1. **Tên IIFE**: `attachClassName` (VD: `attachZyPageApiItemProcessor`)
2. **`'use strict'`**: Bắt buộc ở dòng đầu trong IIFE
3. **Dual-export cuối file**: Luôn có cả `globalScope.ClassName` VÀ `module.exports`
4. **Scope detection**: `typeof window !== 'undefined' ? window : globalThis`

## Pattern 2: CommonJS Standard (Node-only)

Dùng cho service chỉ chạy ở main process hoặc test:

```javascript
'use strict';

const crypto = require('crypto');
const { parsePlaylistDonationMessage } = require('./playlist-message-parser');

class PlaylistService {
    constructor(options = {}) {
        this.repository = options.repository;
        this.provider = options.provider;
        this.emit = typeof options.emit === 'function' ? options.emit : () => {};
        if (!this.repository || !this.provider) {
            throw new TypeError('repository and provider are required');
        }
    }
}

module.exports = { PlaylistService };
```

### Quy tắc:
1. **`'use strict'`** ở dòng đầu tiên
2. **require()** chỉ ở đầu file
3. **Export** dạng named object: `module.exports = { ClassName }` hoặc `module.exports = ClassName`

## Constructor Dependency Injection

**NGUYÊN TẮC CỐT LÕI**: Không bao giờ `require()` dependency bên trong class body. Tất cả dependencies được truyền qua `options` object:

```javascript
class ZyPageQueueIngestionService {
    constructor(options = {}) {
        // State chia sẻ
        this.state = options.state || { queue: [], endedKeys: [] };
        
        // Service dependencies
        this.eventProcessor = options.eventProcessor;
        
        // Utility functions (có default fallback)
        this.normalizeKey = options.normalizeKey || (value => String(value || '').trim());
        this.normalizeTimestamp = options.normalizeTimestamp || (value => Number(value) || 0);
        this.now = options.now || Date.now;
        
        // Async dependencies
        this.fetchMetadata = options.fetchMetadata || (() => Promise.resolve({}));
        
        // Callback hooks
        this.onInserted = options.onInserted || (() => {});
        this.onRejected = options.onRejected || (() => {});
        this.onMetadataUpdated = options.onMetadataUpdated || (() => {});
        
        // Predicate functions
        this.needsMetadata = options.needsMetadata || (() => false);
        this.hasBrokenTitle = options.hasBrokenTitle || (title => !title);
    }
}
```

### Phân loại options:

| Loại | Mô tả | Default |
|---|---|---|
| **State** | Object chia sẻ (pass by reference) | `{ queue: [], endedKeys: [] }` |
| **Service deps** | Các service khác | Không có default (bắt buộc hoặc optional) |
| **Utilities** | Hàm tiện ích nhỏ | Arrow function trả kết quả cơ bản |
| **Callbacks/Hooks** | Hàm gọi khi sự kiện xảy ra | No-op `() => {}` |
| **Predicates** | Hàm trả true/false | Trả giá trị mặc định an toàn |
| **Platform APIs** | `now`, `random`, `fetchImpl`, `storage` | `Date.now`, `Math.random`, `fetch`, `localStorage` |

## Naming Convention

### File naming
```
kebab-case-service.js       # Service
kebab-case-controller.js    # Controller (có DOM/UI logic)
kebab-case-policy.js        # Policy (pure validation rules)
kebab-case-repository.js    # Repository (database access)
kebab-case-provider.js      # Provider (external data fetch)
```

### Class naming
```javascript
ZyPageConnectionService      // ZyPage prefix cho ZyPage-related
DashboardBootstrapController // Dashboard prefix cho dashboard UI
PlaylistRepository           // Theo domain
ViewCountPolicy              // Policy suffix cho validation
YouTubePlaylistProvider      // Provider suffix cho data fetch
```

### Method naming
- `normalize*` — Biến đổi/chuẩn hóa dữ liệu
- `ingest*` — Nhận và xử lý dữ liệu đầu vào
- `handle*` — Xử lý sự kiện
- `resolve*` — Phân giải/tìm kiếm dữ liệu
- `persist*` — Lưu trữ
- `is*` / `has*` — Predicate

## Ví dụ tạo service mới

Giả sử cần tạo `services/chat-filter-service.js` (chạy cả browser + Node):

```javascript
(function attachChatFilterService(globalScope) {
    'use strict';

    class ChatFilterService {
        constructor(options = {}) {
            this.bannedWords = options.bannedWords || [];
            this.log = options.log || (() => {});
            this.normalize = options.normalize || (text => String(text || '').trim().toLowerCase());
        }

        isAllowed(message) {
            const normalized = this.normalize(message);
            return !this.bannedWords.some(word => normalized.includes(word));
        }

        filter(message) {
            if (!this.isAllowed(message)) {
                this.log(`Blocked message: ${message}`);
                return null;
            }
            return message;
        }
    }

    globalScope.ChatFilterService = ChatFilterService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ChatFilterService;
})(typeof window !== 'undefined' ? window : globalThis);
```

## Checklist khi tạo/sửa service

- [ ] Chọn đúng module pattern (IIFE dual-export hay CommonJS)
- [ ] Constructor nhận `options = {}` — không require dependency trong class
- [ ] Mọi dependency có default fallback hợp lý
- [ ] Tên file kebab-case, tên class PascalCase
- [ ] `'use strict'` ở đúng vị trí
- [ ] Có file test tương ứng trong `tests/`
