'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BrowserMediaStateService } = require('../services/browser-media-state-service');

test('chuẩn hóa media đang phát từ các nền tảng được hỗ trợ', () => {
  const service = new BrowserMediaStateService({ now: () => 1234 });
  const state = service.update({
    provider: 'youtube-music',
    playing: true,
    url: 'https://music.youtube.com/watch?v=abc',
    title: 'Bài hát',
    artist: 'Nghệ sĩ',
    currentTime: 12.5,
    duration: 180
  });

  assert.equal(state.active, true);
  assert.equal(state.provider, 'youtube-music');
  assert.equal(state.updatedAt, 1234);
});

test('từ chối URL lạ và tự tắt snapshot quá hạn', () => {
  let now = 1000;
  const service = new BrowserMediaStateService({ now: () => now, staleAfterMs: 5000 });
  assert.equal(service.update({ provider: 'youtube', playing: true, url: 'https://example.com/watch' }).active, false);

  service.update({ provider: 'soundcloud', playing: true, url: 'https://soundcloud.com/a/b' });
  now = 7000;
  assert.equal(service.getSnapshot().active, false);
});
