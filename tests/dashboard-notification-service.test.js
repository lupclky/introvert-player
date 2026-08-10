const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardNotificationService = require('../services/dashboard-notification-service');

function storage(initial = {}) {
    const values = { ...initial };
    return { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, values };
}

test('notifications cap history and maintain unread state', () => {
    const service = new DashboardNotificationService({ storage: storage(), limit: 2 });
    service.add({ id: 1 }); service.add({ id: 2 }); service.add({ id: 3 });
    assert.deepEqual(service.items.map(item => item.id), [3, 2]);
    assert.equal(service.unreadCount, 3);
    service.markRead(service.items[0]);
    assert.equal(service.unreadCount, 2);
    service.markAllRead();
    assert.equal(service.unreadCount, 0);
    assert.equal(service.items.some(item => item.unread), false);
});

test('notifications load and clear persisted history', () => {
    const store = storage({ dua_notifications_history: JSON.stringify([{ id: 1, unread: true }]), dua_unread_notifications_count: '1' });
    const service = new DashboardNotificationService({ storage: store });
    assert.equal(service.load().unreadCount, 1);
    service.clear();
    assert.deepEqual(JSON.parse(store.values.dua_notifications_history), []);
});
