'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardDonationHistoryService = require('../services/dashboard-donation-history-service');

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        values
    };
}

test('fallback local thêm mới, chống trùng và bổ sung songLink', async () => {
    const storage = createStorage();
    const service = new DashboardDonationHistoryService({ storage, now: () => 10000, retentionMs: 5000 });
    const donation = { id: 'd1', name: 'Mèo', amount: 50000, timestamp: 9000 };
    assert.equal((await service.add(donation)).inserted, true);
    assert.equal((await service.add(donation)).inserted, false);
    const update = await service.add({ ...donation, songLink: 'https://youtube.com/watch?v=x' });
    assert.equal(update.updated, true);
    const history = await service.list();
    assert.equal(history.length, 1);
    assert.equal(history[0].songLink, 'https://youtube.com/watch?v=x');
    assert.equal(history[0].isNew, true);
});

test('fallback local đánh dấu đọc và xóa lịch sử', async () => {
    const storage = createStorage({
        dua_donation_history: JSON.stringify([{ id: 'a', timestamp: 9000, isNew: true }, { id: 'b', timestamp: 9000, isNew: true }])
    });
    const service = new DashboardDonationHistoryService({ storage, now: () => 10000 });
    await service.markRead('a');
    let history = await service.list();
    assert.equal(history.find(item => item.id === 'a').isNew, false);
    await service.markAllRead();
    history = await service.list();
    assert.equal(history.every(item => !item.isNew), true);
    await service.clear();
    assert.deepEqual(await service.list(), []);
});

test('SQLite API được ưu tiên và migration chạy theo timestamp tăng dần', async () => {
    const storage = createStorage({
        dua_donation_history: JSON.stringify([{ id: 'new', timestamp: 2 }, { id: 'old', timestamp: 1 }])
    });
    const inserted = [];
    const api = {
        dbGetDonations: async () => [{ id: 'db' }],
        dbAddDonation: async item => { inserted.push(item.id); return { success: true, inserted: true }; },
        dbMarkRead: async id => id,
        dbMarkAllRead: async () => true,
        dbClearHistory: async () => true
    };
    const service = new DashboardDonationHistoryService({ api, storage });
    assert.deepEqual(await service.list(), [{ id: 'db' }]);
    const result = await service.migrate();
    assert.deepEqual(inserted, ['old', 'new']);
    assert.equal(result.count, 2);
    assert.equal(storage.getItem('dua_donation_history_migrated'), 'true');
});
