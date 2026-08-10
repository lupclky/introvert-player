'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerZyPageShopIdIpcService, parseShopId } = require('../services/zypage-shop-id-ipc-service');

test('shop id resolver reads the authoritative id from a donate page', async () => {
  let handler;
  registerZyPageShopIdIpcService({
    ipcMain: { handle: (name, callback) => { assert.equal(name, 'zypage-resolve-shop-id'); handler = callback; } },
    fetchImpl: async url => {
      assert.equal(url, 'https://zypage.com/donate-music/token-1234567890');
      return { ok: true, status: 200, text: async () => '<script>var data = {"shop_id": 43};</script>' };
    }
  });
  assert.deepEqual(await handler({}, {
    domain: 'https://zypage.com', token: 'token-1234567890', pathType: 'donate-music'
  }), { success: true, shopId: '43' });
});

test('shop id parser rejects pages without a numeric shop id', () => {
  assert.equal(parseShopId('<html>no shop</html>'), '');
});
