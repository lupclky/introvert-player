const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageSongEndService = require('../services/zypage-song-end-service');

test('song-end service gửi đúng một lệnh IPC và chống gửi trùng sau thành công', async () => {
    const calls = [];
    const service = new ZyPageSongEndService({
        transport: async request => {
            calls.push(request);
            return { success: true, response: { status: 1 } };
        }
    });
    const config = { domain: 'https://zypage.test/', shopId: 12, token: 'secret', musicKey: 34 };
    const result = await service.send(config);
    assert.equal(result.success, true);
    assert.equal(result.method, 'ipc');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://zypage.test/assets/ajax/system.php');
    assert.equal(calls[0].body.get('music_key'), '34');
    assert.equal((await service.send(config)).reason, 'duplicate');
    assert.equal(calls.length, 1);
});

test('song-end service cho phép thử lại khi máy chủ từ chối', async () => {
    let calls = 0;
    const service = new ZyPageSongEndService({
        transport: async () => ({ success: ++calls > 1, reason: 'server_rejected' })
    });
    const config = { domain: 'https://zypage.test', shopId: 1, token: 't', musicKey: 'k' };
    assert.equal((await service.send(config)).reason, 'server_rejected');
    assert.equal((await service.send(config)).success, true);
    assert.equal(calls, 2);
});

test('song-end service giữ chi tiết phản hồi lỗi để ghi log F12', async () => {
    const service = new ZyPageSongEndService({
        transport: async () => ({ success: false, reason: 'server_rejected', status: 200, response: { status: 0 } })
    });
    const result = await service.send({ domain: 'https://zypage.test', shopId: 1, token: 't', musicKey: 'detail' });
    assert.equal(result.reason, 'server_rejected');
    assert.equal(result.status, 200);
    assert.deepEqual(result.response, { status: 0 });
});

test('song-end service từ chối cấu hình thiếu mà không gửi transport', async () => {
    let called = false;
    const service = new ZyPageSongEndService({ transport: async () => { called = true; return true; } });
    assert.equal((await service.send({ domain: '', shopId: 1, token: 't', musicKey: 'k' })).reason, 'invalid');
    assert.equal(called, false);
});
