'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PLAYLIST_PRICING,
  DEFAULT_PLAYLIST_SETTINGS,
  normalizePlaylistSettings,
  calculatePlaylistDurationLimitSec,
  validatePlaylistAmount,
  selectTracksWithinDuration
} = require('../services/playlist-policy');

const settings = { ...DEFAULT_PLAYLIST_SETTINGS, playlistMaximumDurationSec: 4200 };

test('cấu hình playlist mặc định là 500 nghìn và 30 phút', () => {
  assert.equal(PLAYLIST_PRICING.minimumDonationVnd, 500000);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistMinimumDonationVnd, 500000);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistBaseDurationSec, 30 * 60);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistMaximumDurationSec, 30 * 60);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistExtraDonationStepVnd, 50000);
  assert.equal(DEFAULT_PLAYLIST_SETTINGS.playlistExtraDurationStepSec, 5 * 60);
  assert.deepEqual(normalizePlaylistSettings({}), DEFAULT_PLAYLIST_SETTINGS);
});

test('amount validator kiểm tra đúng ranh giới', () => {
  assert.equal(validatePlaylistAmount(499999, settings).valid, false);
  assert.equal(validatePlaylistAmount(500000, settings).valid, true);
});

test('thời lượng playlist chỉ tăng khi tiền dư đủ từng mốc 50 nghìn', () => {
  assert.equal(calculatePlaylistDurationLimitSec(499999, settings), 0);
  assert.equal(calculatePlaylistDurationLimitSec(500000, settings), 30 * 60);
  assert.equal(calculatePlaylistDurationLimitSec(549999, settings), 30 * 60);
  assert.equal(calculatePlaylistDurationLimitSec(550000, settings), 35 * 60);
  assert.equal(calculatePlaylistDurationLimitSec(1000000, settings), 80 * 60);
});

test('công thức playlist dùng các mốc giá và thời lượng tùy chỉnh', () => {
  const customSettings = {
    ...settings,
    playlistMinimumDonationVnd: 300000,
    playlistBaseDurationSec: 20 * 60,
    playlistExtraDonationStepVnd: 100000,
    playlistExtraDurationStepSec: 10 * 60
  };
  assert.equal(calculatePlaylistDurationLimitSec(299999, customSettings), 0);
  assert.equal(calculatePlaylistDurationLimitSec(399999, customSettings), 20 * 60);
  assert.equal(calculatePlaylistDurationLimitSec(400000, customSettings), 30 * 60);
});

test('nhận toàn bộ khi tổng dưới giới hạn', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 1200 }, { videoId: 'b', durationSec: 1500 }
  ], settings);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.totalDurationSec, 2700);
});

test('bộ lọc nhận chính xác tổng bằng giới hạn được truyền vào', () => {
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

test('bài đầu dài hơn giới hạn làm playlist rỗng', () => {
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

test('playlist không loại video theo lượt xem hoặc khi thiếu lượt xem', () => {
  const result = selectTracksWithinDuration([
    { videoId: 'a', durationSec: 60, viewCount: 9999 },
    { videoId: 'b', durationSec: 60, viewCount: 10000 },
    { videoId: 'c', durationSec: 60 }
  ], { ...settings, minimumViewCount: 10000 });
  assert.deepEqual(result.accepted.map(track => track.videoId), ['a', 'b', 'c']);
  assert.equal(result.skipped.length, 0);
});
