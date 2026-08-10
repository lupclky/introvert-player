'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DashboardQueueService } = require('../services/dashboard-queue-service');

test('sort không tách playlist đang phát dù bài ngoài có số tiền cao hơn', () => {
  const current = { id: 'p1', playlistRequestId: 'playlist', amount: 100 };
  const result = DashboardQueueService.sort([
    current,
    { id: 'expensive', amount: 999 },
    { id: 'p2', playlistRequestId: 'playlist', amount: 100 },
    { id: 'p3', playlistRequestId: 'playlist', amount: 100 }
  ], { currentSong: current, sortConfig: 'amount', forceSort: true });
  assert.deepEqual(result.map(song => song.id), ['p1', 'p2', 'p3', 'expensive']);
});

test('insert đặt donate mới sau toàn bộ playlist đang phát', () => {
  const current = { id: 'p1', playlistRequestId: 'playlist', amount: 100 };
  const result = DashboardQueueService.insert([
    current,
    { id: 'p2', playlistRequestId: 'playlist', amount: 100 },
    { id: 'normal', amount: 50 }
  ], { id: 'expensive', amount: 999 }, { currentSong: current, sortConfig: 'amount' });
  assert.deepEqual(result.map(song => song.id), ['p1', 'p2', 'expensive', 'normal']);
});
