'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageFirebaseListenerService = require('../services/zypage-firebase-listener-service');

function createFirebaseMock() {
    const listeners = new Map();
    const ref = {
        childPath: '',
        child(path) {
            this.childPath = path;
            return this;
        },
        on(type, handler) {
            listeners.set(type, handler);
        },
        off(type, handler) {
            if (!type || listeners.get(type) === handler) listeners.delete(type);
        }
    };
    return {
        firebase: {
            apps: [{ name: '[DEFAULT]' }],
            database: () => ({ ref: () => ref })
        },
        ref,
        listeners
    };
}

test('listener bỏ qua snapshot đầu và chỉ xử lý event mới', async () => {
    const mock = createFirebaseMock();
    const snapshots = [];
    const events = [];
    const service = new ZyPageFirebaseListenerService({ firebase: mock.firebase });

    service.subscribe({
        token: 'token-123',
        onSnapshot: (value, initial) => snapshots.push({ value, initial }),
        onEvent: value => events.push(value)
    });

    const handler = mock.listeners.get('value');
    await handler({ val: () => ({ type: 'old' }) });
    await handler({ val: () => ({ type: 'add' }) });

    assert.equal(mock.ref.childPath, 'Page/Donate/token-123');
    assert.deepEqual(snapshots.map(item => item.initial), [true, false]);
    assert.deepEqual(events, [{ type: 'add' }]);
});

test('đăng ký lại hủy đúng listener cũ và unsubscribe an toàn', () => {
    const mock = createFirebaseMock();
    const service = new ZyPageFirebaseListenerService({ firebase: mock.firebase });
    service.subscribe({ token: 'first' });
    const firstHandler = mock.listeners.get('value');
    service.subscribe({ token: 'second' });
    const secondHandler = mock.listeners.get('value');

    assert.notEqual(firstHandler, secondHandler);
    assert.equal(mock.listeners.size, 1);
    service.unsubscribe();
    assert.equal(mock.listeners.size, 0);
    assert.equal(service.activeRef, null);
});

test('listener khởi tạo Firebase một lần bằng cấu hình dùng chung', () => {
    const mock = createFirebaseMock();
    const initializedWith = [];
    mock.firebase.apps = [];
    mock.firebase.initializeApp = config => {
        initializedWith.push(config);
        mock.firebase.apps.push({ name: '[DEFAULT]' });
    };
    const config = { databaseURL: 'https://firebase.test' };
    const service = new ZyPageFirebaseListenerService({ firebase: mock.firebase, config });

    service.subscribe({ token: 'first' });
    service.subscribe({ token: 'second' });

    assert.deepEqual(initializedWith, [config]);
    assert.equal(mock.listeners.size, 1);
});

test('thiếu cấu hình mới không hủy listener đang hoạt động', () => {
    const mock = createFirebaseMock();
    const service = new ZyPageFirebaseListenerService({ firebase: mock.firebase });
    service.subscribe({ token: 'first' });
    const activeRef = service.activeRef;

    mock.firebase.apps = [];
    service.config = null;
    assert.throws(() => service.subscribe({ token: 'second' }), /Thiếu cấu hình Firebase/);
    assert.equal(service.activeRef, activeRef);
    assert.equal(mock.listeners.size, 1);
});
