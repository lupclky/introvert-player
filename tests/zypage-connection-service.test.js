'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageConnectionService = require('../services/zypage-connection-service');

test('parseConnectionInput nhận link donate music và donate message', () => {
    assert.deepEqual(
        ZyPageConnectionService.parseConnectionInput('https://example.com/donate-music/token-1234567890?x=1'),
        { domain: 'https://example.com', token: 'token-1234567890', pathType: 'donate-music' }
    );
    assert.deepEqual(
        ZyPageConnectionService.parseConnectionInput('https://zypage.com/donate-message/token-abcdefghij'),
        { domain: 'https://zypage.com', token: 'token-abcdefghij', pathType: 'donate-message' }
    );
});

test('connect dùng Shop ID có sẵn và khởi động listener đúng một lần', async () => {
    const writes = new Map();
    const calls = [];
    const state = {};
    const service = new ZyPageConnectionService({
        state,
        storage: { setItem: (key, value) => writes.set(key, value) },
        startListener: (shopId, token) => calls.push({ shopId, token }),
        saveConfig: () => {},
        alert: () => assert.fail('không được hiển thị cảnh báo')
    });

    const result = await service.connect({
        input: 'https://zypage.com/donate-music/token-1234567890',
        shopId: '321',
        autoReconnect: true
    });

    assert.equal(result.shopId, '321');
    assert.equal(state.zypageShopId, '321');
    assert.equal(writes.get('dua_zypage_token'), 'token-1234567890');
    assert.deepEqual(calls, [{ shopId: '321', token: 'token-1234567890' }]);
});

test('fetchPage chuyển sang proxy dự phòng khi proxy đầu lỗi', async () => {
    const urls = [];
    const service = new ZyPageConnectionService({
        fetchImpl: async url => {
            urls.push(url);
            if (urls.length === 1) throw new Error('proxy chính lỗi');
            return { ok: true, json: async () => ({ contents: 'shop_id: 42' }) };
        }
    });

    const result = await service.fetchPage('https://zypage.com/donate-music/token');
    assert.equal(result.contents, 'shop_id: 42');
    assert.equal(urls.length, 2);
    assert.match(urls[1], /allorigins/);
});

test('connect replaces a stale saved shop id with the id resolved from the link', async () => {
    const state = {};
    const calls = [];
    const service = new ZyPageConnectionService({
        state,
        storage: { setItem: () => {} },
        resolveShopId: async () => ({ success: true, shopId: '43' }),
        startListener: (shopId, token) => calls.push({ shopId, token }),
        saveConfig: () => {},
        alert: () => assert.fail('unexpected alert')
    });

    const result = await service.connect({
        input: 'https://zypage.com/donate-music/token-1234567890', shopId: '7006', autoReconnect: true
    });

    assert.equal(result.shopId, '43');
    assert.equal(state.zypageShopId, '43');
    assert.deepEqual(calls, [{ shopId: '43', token: 'token-1234567890' }]);
});

test('connect chờ lưu cấu hình xong mới khởi động listener', async () => {
    const order = [];
    let finishSave;
    const service = new ZyPageConnectionService({
        state: {},
        storage: { setItem: () => {} },
        saveConfig: () => new Promise(resolve => { finishSave = () => { order.push('saved'); resolve(); }; }),
        startListener: () => order.push('listener'),
        alert: () => assert.fail('unexpected alert')
    });

    const connecting = service.connect({
        input: 'https://zypage.com/donate-music/token-1234567890',
        shopId: '321',
        autoReconnect: true
    });
    await Promise.resolve();
    assert.deepEqual(order, []);
    finishSave();
    await connecting;
    assert.deepEqual(order, ['saved', 'listener']);
});
