'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DashboardRealtimeService } = require('../services/dashboard-realtime-service');

test('outbox realtime chỉ giữ snapshot mới nhất của event thay thế được', () => {
  const WebSocketImpl = { OPEN: 1, CONNECTING: 0 };
  const service = new DashboardRealtimeService({
    WebSocketImpl,
    getChannelId: () => 'channel',
    locationRef: { protocol: 'http:', host: '127.0.0.1:3000' }
  });
  service.send({ type: 'queue.updated', data: { version: 1 } });
  service.send({ type: 'queue.updated', data: { version: 2 } });
  assert.equal(service.outbox.length, 1);
  assert.equal(service.outbox[0].data.version, 2);
  assert.equal(service.outbox[0].channelId, 'channel');
});

test('publish chuẩn hóa envelope Dashboard', () => {
  const service = new DashboardRealtimeService({
    WebSocketImpl: { OPEN: 1, CONNECTING: 0 },
    getChannelId: () => 'channel',
    getEventId: () => 'event-fixed'
  });
  const envelope = service.publish({ type: 'current_song', data: { id: 'song' } });
  assert.equal(envelope.source, 'dashboard');
  assert.equal(envelope.eventId, 'event-fixed');
  assert.deepEqual(envelope.data, { id: 'song' });
});
