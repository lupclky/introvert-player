---
name: testing-guide
description: Quy ước viết unit test cho Introvert Player — sử dụng node:test runner, mock pattern với createService helper, và cách chạy test.
---

# Testing Guide — Quy ước viết Test

## Tổng quan

Dự án sử dụng **Node.js built-in test runner** (`node:test`) với assertion module `node:assert/strict`. Hiện có **57 test files** trong thư mục `tests/`, mỗi file tương ứng 1 service.

## Chạy tests

```bash
# Chạy tất cả tests
npm test
# hoặc:
node --test tests/*.test.js

# Chạy 1 file cụ thể
node --test tests/zypage-queue-ingestion-service.test.js
```

## Cấu trúc test file

Mỗi file test tuân theo template sau:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ServiceClass = require('../services/service-name');

// Helper factory tạo service instance với mock dependencies
function createService(overrides = {}) {
    const state = overrides.state || { /* default state */ };
    const collected = [];  // Thu thập side effects để assert
    
    const service = new ServiceClass({
        // Mock tất cả dependencies
        someDep: { method: () => 'mocked' },
        log: () => {},
        now: () => 1000,  // Timestamp cố định cho deterministic test
        ...overrides.options  // Cho phép override từng mock
    });
    
    return { service, state, collected };
}

// Test cases — tên tiếng Việt mô tả hành vi
test('mô tả hành vi mong đợi bằng tiếng Việt', async () => {
    const { service } = createService();
    const result = await service.someMethod(input);
    assert.equal(result.field, expectedValue);
});
```

## Pattern: createService Helper

Đây là pattern **bắt buộc** — mọi test file đều có hàm `createService()`:

### Ví dụ thực tế từ `zypage-queue-ingestion-service.test.js`:

```javascript
function createService(overrides = {}) {
    const state = overrides.state || { queue: [], endedKeys: [] };
    const inserted = [];
    const notifications = [];
    
    const service = new ZyPageQueueIngestionService({
        state,
        eventProcessor: {
            resolveMedia: async text => text.includes('soundcloud')
                ? { type: 'soundcloud', videoId: null, soundcloudUrl: text }
                : { type: 'youtube', videoId: 'abcdefghijk', soundcloudUrl: null }
        },
        normalizeKey: value => value == null ? '' : String(value),
        normalizeTimestamp: value => Number(value) || 0,
        fetchMetadata: async () => ({
            title: 'Metadata title',
            thumbnail: 'thumb',
            author: 'Channel'
        }),
        hasBrokenTitle: title => !title || title.includes('broken'),
        needsMetadata: ({ title, author, type }) =>
            title.includes('broken') || (!author && type === 'youtube'),
        insertSong: song => {
            inserted.push(song);
            state.queue.push(song);
            return true;
        },
        onInserted: (song, source) => notifications.push({ song, source }),
        now: () => 1000,
        ...overrides.options
    });
    
    return { service, state, inserted, notifications };
}
```

### Nguyên tắc của createService:
1. **Nhận `overrides = {}`**: Cho phép test case override state hoặc options cụ thể
2. **State mặc định**: Tạo state object sạch cho mỗi test
3. **Collectors**: Mảng `inserted`, `notifications`, `rejected` etc. để thu side effects
4. **Deterministic time**: `now: () => 1000` — timestamp cố định
5. **Trả về destructured**: `{ service, state, ...collectors }`

## Quy tắc viết test case

### Tên test bằng tiếng Việt
```javascript
test('order chính thức được dựng và chèn queue đúng một lần', async () => { ... });
test('link trong chat lấy metadata và tuân thủ mốc donate', async () => { ... });
test('link trong chat dưới mốc view không được thêm vào queue', async () => { ... });
```

### Assert patterns thường dùng

```javascript
// So sánh bằng
assert.equal(result.inserted, true);
assert.equal(inserted.length, 1);

// So sánh sâu (deep equal)
assert.deepStrictEqual(result, { handled: true, inserted: false });

// Kiểm tra null/undefined
assert.equal(result, null);
assert.ok(result);

// Kiểm tra string match
assert.match(result.message, /expected pattern/);

// Kiểm tra throw
assert.throws(() => new Service({}), { message: /required/ });

// Async throw
await assert.rejects(
    async () => service.riskyMethod(),
    { message: /error text/ }
);
```

### Test idempotency (pattern lặp lại nhiều)
```javascript
test('ingest cùng event 2 lần chỉ chèn 1 lần', async () => {
    const { service, inserted } = createService();
    const event = { /* ... */ };
    
    const first = await service.ingestOfficial(event);
    const second = await service.ingestOfficial(event);
    
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(second.reason, 'duplicate');
    assert.equal(inserted.length, 1);
});
```

### Test với override cụ thể
```javascript
test('link trong chat dưới mốc view không được thêm vào queue', async () => {
    const rejected = [];
    const { service, inserted } = createService({
        options: {
            fetchMetadata: async () => ({
                title: 'Ít view', thumbnail: 'thumb',
                author: 'Channel', views: 9999
            }),
            getMinimumViewCount: () => 10000,
            onRejected: result => rejected.push(result)
        }
    });
    
    const result = await service.ingestMessage(event, 0);
    assert.equal(result.inserted, false);
    assert.equal(rejected.length, 1);
});
```

## Ví dụ tạo test mới

Cho service `chat-filter-service.js`:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ChatFilterService = require('../services/chat-filter-service');

function createService(overrides = {}) {
    const logged = [];
    const service = new ChatFilterService({
        bannedWords: ['spam', 'bad'],
        log: msg => logged.push(msg),
        ...overrides.options
    });
    return { service, logged };
}

test('tin nhắn sạch được cho phép', () => {
    const { service } = createService();
    assert.equal(service.isAllowed('hello world'), true);
});

test('tin nhắn chứa từ cấm bị chặn', () => {
    const { service, logged } = createService();
    const result = service.filter('this is spam');
    assert.equal(result, null);
    assert.equal(logged.length, 1);
});

test('danh sách từ cấm rỗng cho phép mọi tin nhắn', () => {
    const { service } = createService({ options: { bannedWords: [] } });
    assert.equal(service.isAllowed('anything goes'), true);
});
```

## Checklist khi viết test

- [ ] File đặt tên `<service-name>.test.js` trong `tests/`
- [ ] Import `node:test` và `node:assert/strict`
- [ ] Có `createService(overrides = {})` helper
- [ ] Mock tất cả external dependencies
- [ ] `now: () => 1000` cho deterministic time
- [ ] Tên test bằng tiếng Việt, mô tả hành vi
- [ ] Test cả happy path lẫn edge case
- [ ] Test idempotency nếu service có dedup logic
