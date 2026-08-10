const test = require('node:test');
const assert = require('node:assert/strict');
const QueueNewBadgeService = require('../services/queue-new-badge-service');

function createService(overrides = {}) {
    return new QueueNewBadgeService({ durationMs: 5000, now: () => 1000, ...overrides });
}

test('giữ nhãn MỚI đúng 5 giây cho bài vừa thêm', () => {
    const service = createService();
    service.mark({ id: 'song-1' }, 1000);
    assert.equal(service.getRemainingMs({ id: 'song-1' }, 1000), 5000);
    assert.equal(service.getRemainingMs({ id: 'song-1' }, 5999), 1);
    assert.equal(service.getRemainingMs({ id: 'song-1' }, 6000), 0);
});

test('nhóm playlist dùng thời gian còn lại lớn nhất của các bài con', () => {
    const service = createService();
    service.mark({ id: 'old' }, 1000);
    service.mark({ id: 'new' }, 2500);
    assert.equal(service.getRemainingMs([{ id: 'old' }, { id: 'new' }], 3000), 4500);
});

test('bỏ qua item thiếu id và cho phép đánh dấu lại một bài', () => {
    const service = createService();
    service.mark([{ title: 'thiếu id' }, null], 1000);
    assert.equal(service.getRemainingMs([{ title: 'thiếu id' }, null], 1000), 0);

    service.mark({ id: 1 }, 1000);
    service.mark({ id: 1 }, 3000);
    assert.equal(service.getRemainingMs({ id: '1' }, 4000), 4000);
});
