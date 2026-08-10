'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerZyPageSongEndIpcService } = require('../services/zypage-song-end-ipc-service');

test('IPC kết thúc ZyPage gửi đúng một POST và xác nhận phản hồi', async () => {
  let handler;
  const calls = [];
  registerZyPageSongEndIpcService({
    ipcMain: { handle: (name, callback) => { assert.equal(name, 'zypage-song-end'); handler = callback; } },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 1 }) };
    }
  });
  const result = await handler({}, { domain: 'https://zypage.com', shopId: 43, token: 'token', musicKey: '123' });
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(new URLSearchParams(calls[0].options.body).get('music_key'), '123');
});

test('IPC coi status 2 là music_key không hợp lệ', async () => {
  let handler;
  registerZyPageSongEndIpcService({
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 2, message: 'system.message.error' })
    })
  });

  const result = await handler({}, {
    domain: 'https://zypage.test', shopId: '1', token: 'token', musicKey: 'old-key'
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'invalid_music_key');
});

test('IPC đối chiếu snapshot và retry khi Firebase lệch music key một giây', async () => {
  let handler;
  const calls = [];
  registerZyPageSongEndIpcService({
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).includes('/api/get_data_by_id')) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({ data: { donate: JSON.stringify({
            music: { list: { '1785941805': {
              music: { id: 'CFhEEPG-FiM', key: 1785941805 },
              order: { name: 'Tú Ba Đình', amount: 50000, time: 1785941805 }
            } } }
          }) } })
        };
      }
      const key = new URLSearchParams(options.body).get('music_key');
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ status: key === '1785941805' ? 1 : 2 })
      };
    }
  });

  const result = await handler({}, {
    domain: 'https://zypage.com', shopId: 43, token: 'token', musicKey: '1785941806',
    videoId: 'CFhEEPG-FiM', donorName: 'Tú Ba Đình', amount: 50000,
    transactionTime: 1785941806000
  });

  assert.equal(result.success, true);
  assert.equal(result.musicKey, '1785941805');
  assert.equal(calls.length, 4);
});

test('IPC repairs a stale shop id from the token page before resolving a Firebase key offset', async () => {
  let handler;
  const calls = [];
  registerZyPageSongEndIpcService({
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).includes('/donate-music/')) {
        return { ok: true, status: 200, text: async () => '<script>const config = {"shop_id": 43};</script>' };
      }
      if (String(url).includes('/api/get_data_by_id')) {
        assert.match(String(url), /id=43/);
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({ data: { donate: JSON.stringify({
            music: { list: { '1785942502': {
              music: { id: 'MjE3Yxrv5NY', key: 1785942502 },
              order: { name: 'Bruno Fernandes', amount: 50000, time: 1785942502 }
            } } }
          }) } })
        };
      }
      const body = new URLSearchParams(options.body);
      const actualShopId = body.get('shop_id');
      const key = body.get('music_key');
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ status: actualShopId === '43' && key === '1785942502' ? 1 : 2 })
      };
    }
  });

  const result = await handler({}, {
    domain: 'https://zypage.com', shopId: '7006', token: 'token', musicKey: '1785942503',
    videoId: 'MjE3Yxrv5NY', donorName: 'Bruno Fernandes', amount: 50000,
    transactionTime: 1785942503000, pathType: 'donate-music'
  });

  assert.equal(result.success, true);
  assert.equal(result.shopId, '43');
  assert.equal(result.musicKey, '1785942502');
  assert.equal(calls.length, 5);
});
