'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSyncedLyricsIpcService } = require('../services/synced-lyrics-ipc-service');

function createService(overrides = {}) {
  const handlers = new Map();
  const calls = [];
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const service = {
    resolve: async song => {
      calls.push(song);
      return { available: true, lines: [{ time: 1, text: 'Lời' }] };
    },
    debug: async song => ({ input: song, result: { available: false, reason: 'not_found' } }),
    ...overrides.service
  };
  registerSyncedLyricsIpcService({ ipcMain, service });
  return { handlers, calls };
}

test('IPC lyrics chuyển bài hát sang provider và trả dữ liệu thuần', async () => {
  const { handlers, calls } = createService();
  const result = await handlers.get('get-synced-lyrics')({}, { videoId: 'abcdefghijk' });
  assert.deepEqual(calls, [{ videoId: 'abcdefghijk' }]);
  assert.equal(result.lines[0].text, 'Lời');
});

test('IPC lyrics yêu cầu đủ main process và service', () => {
  assert.throws(() => registerSyncedLyricsIpcService({}), /required/);
});

test('IPC lyrics debug bo qua luong cache va tra bao cao', async () => {
  const { handlers } = createService();
  const result = await handlers.get('debug-synced-lyrics')({}, { videoId: '8edEK_ce4k4' });
  assert.equal(result.input.videoId, '8edEK_ce4k4');
  assert.equal(result.result.reason, 'not_found');
});
