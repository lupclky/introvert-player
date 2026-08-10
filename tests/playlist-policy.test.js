'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLAYLIST_SETTINGS, normalizePlaylistSettings, validatePlaylistAmount, selectTracksWithinDuration } = require('../services/playlist-policy');

const settings = { playlistMinimumDonationVnd: 1500000, playlistMaximumDurationSec: 4200, minimumViewCount: 0 };

test('cấu hình playlist mặc định là 1,5 triệu, 70 phút và không yêu cầu lượt xem', () => {
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistMinimumDonationVnd, 1500000);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistMaximumDurationSec, 70 * 60);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.minimumViewCount, 0);
  assert.deepEqual(normalizePlaylistSettings({}), DEFAULT_PLAYLIST_SETTINGS);
});

test('amount validator kiểm tra đúng ranh giới', () => {
  assert.equal(validatePlaylistAmount(1499999, settings).valid, false);
  assert.equal(validatePlaylistAmount(1500000, settings).valid, true);
});

test('nhận toàn bộ khi tổng dưới giới hạn', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 1200 }, { videoId: 'b', durationSec: 1500 }
  ], settings);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.totalDurationSec, 2700);
});

test('nhận chính xác tổng 70 phút', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 2100 }, { videoId: 'b', durationSec: 2100 }
  ], settings);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.totalDurationSec, 4200);
});

test('không cắt bài làm vượt giới hạn', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 1200 },
    { videoId: 'b', durationSec: 1500 },
    { videoId: 'c', durationSec: 1200 },
    { videoId: 'd', durationSec: 600 }
  ], settings);
  assert.deepEqual(result.accepted.map(track => track.videoId), ['a', 'b', 'c']);
  assert.equal(result.skipped.find(track => track.videoId === 'd').skipReason, 'duration_limit');
});

test('bài đầu dài hơn 70 phút làm playlist rỗng', () => {
  const result = selectTracksWithinDuration([{ videoId: 'a', durationSec: 4201 }], settings);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.status, 'rejected');
});

test('duration không xác định chuyển pending review', () => {
  const result = selectTracksWithinDuration([{ videoId: 'a', durationSec: 0 }], settings);
  assert.equal(result.status, 'pending_review');
  assert.equal(result.skipped[0].skipReason, 'unknown_duration');
});

test('lọc trùng, unavailable và blacklist', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 60 },
    { videoId: 'a', durationSec: 60 },
    { videoId: 'b', durationSec: 60, unavailableReason: 'private' },
    { videoId: 'c', durationSec: 60 }
  ], settings, ['c']);
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.skipped.map(track => track.skipReason), ['duplicate', 'private', 'blacklisted']);
});

test('lọc video playlist dưới mốc lượt xem', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 60, viewCount: 9999 },
    { videoId: 'b', durationSec: 60, viewCount: 10000 },
    { videoId: 'c', durationSec: 60, viewCount: 50000 }
  ], { ...settings, minimumViewCount: 10000 });
  assert.deepEqual(result.accepted.map(track => track.videoId), ['b', 'c']);
  assert.equal(result.skipped[0].skipReason, 'below_minimum_views');
});
