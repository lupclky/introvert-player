'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RealtimeEventService } = require('../services/realtime-event-service');

test('progress bị giới hạn tần suất', () => {
  const sent = [];
  const client = { readyState: 1, send: value => sent.push(JSON.parse(value)) };
  const service = new RealtimeEventService({ clients: new Set([client]), getOpenState: () => 1 });
  service.publish('playlist.track_progress', { playlistRequestId: 'p1', currentTimeSec: 1 });
  service.publish('playlist.track_progress', { playlistRequestId: 'p1', currentTimeSec: 2 });
  assert.equal(sent.length, 1);
});

test('payload playlist không có request id bị từ chối', () => {
  const service = new RealtimeEventService();
  assert.throws(() => service.publish('playlist.track_started', { track: {} }), /invalid_realtime_payload/);
});

test('snapshot reconnect giữ tiến trình playlist mới nhất', () => {
  const sent = [];
  const client = { readyState: 1, send: value => sent.push(JSON.parse(value)) };
  const service = new RealtimeEventService({ clients: new Set(), getOpenState: () => 1 });
  service.publish('playlist.started', { playlistRequestId: 'p1', currentTrack: 1, remainingPlaylistSec: 300 });
  service.publish('playlist.track_progress', { playlistRequestId: 'p1', currentTimeSec: 20, remainingPlaylistSec: 280 });
  service.attachClient(client);
  assert.equal(sent[0].data.activePlaylist.remainingPlaylistSec, 280);
  assert.equal(sent[0].data.activePlaylist.currentTimeSec, 20);
});
