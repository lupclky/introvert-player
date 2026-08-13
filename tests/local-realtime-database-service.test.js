'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { LocalRealtimeDatabaseService } = require('../services/local-realtime-database-service');

function fixture() {
  const database = new DatabaseSync(':memory:');
  const clients = new Set();
  const service = new LocalRealtimeDatabaseService({ database, clients, getOpenState: () => 1 });
  service.migrate();
  return { database, clients, service };
}

test('snapshot realtime được lưu và gửi ngay khi Overlay subscribe', () => {
  const { database, clients, service } = fixture();
  try {
    service.publish('dua_channel', 'to_overlay', {
      type: 'overlay.snapshot', data: { currentSong: { id: 'song-1' }, queue: [{ id: 'song-1' }] }
    });
    const messages = [];
    const client = { readyState: 1, send: value => messages.push(JSON.parse(value)) };
    clients.add(client);
    service.subscribe(client, 'dua_channel');
    assert.equal(messages[0].type, 'overlay.snapshot');
    assert.equal(messages[0].data.currentSong.id, 'song-1');
  } finally { database.close(); }
});

test('lệnh resume lưu đúng songId và vị trí tua vào snapshot realtime', () => {
  const { database, service } = fixture();
  try {
    service.publish('channel_a', 'to_overlay', {
      type: 'control_command',
      data: { type: 'resume', value: { songId: 'song-7', position: 99 } }
    });
    const snapshot = service.getSnapshot('channel_a');
    assert.equal(snapshot.playback.currentTime, 99);
    assert.equal(snapshot.playback.resumeSongId, 'song-7');
  } finally { database.close(); }
});

test('đổi channel không phát lại snapshot cũ khi Dashboard sắp gửi snapshot mới', () => {
  const { database, clients, service } = fixture();
  try {
    service.publish('dua_channel', 'to_overlay', {
      type: 'overlay.snapshot', data: { currentSong: { id: 'stale-song' } }
    });
    const messages = [];
    const client = { readyState: 1, send: value => messages.push(JSON.parse(value)) };
    clients.add(client);
    service.subscribe(client, 'dua_channel', { role: 'overlay', sendSnapshot: false });
    assert.equal(messages.length, 0);
    assert.equal(client.realtimeChannelId, 'dua_channel');
  } finally { database.close(); }
});

test('Overlay heartbeat is not persisted in realtime event history', () => {
  const { database, service } = fixture();
  try {
    service.publish('channel_a', 'from_overlay', {
      type: 'realtime.heartbeat', data: { connected: true }
    });
    const count = database.prepare('SELECT COUNT(*) AS total FROM realtime_events').get().total;
    assert.equal(Number(count), 0);
  } finally { database.close(); }
});

test('nhịp lyrics 5ms chỉ chuyển tiếp và không ghi lịch sử realtime', () => {
  const { database, clients, service } = fixture();
  try {
    const dashboard = { readyState: 1, realtimeRole: 'dashboard', realtimeChannelId: 'channel_a', sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
    clients.add(dashboard);
    service.publish('channel_a', 'from_overlay', {
      type: 'lyrics_timing', data: { songId: 'song-1', currentTime: 12.345 }
    });
    const count = database.prepare('SELECT COUNT(*) AS total FROM realtime_events').get().total;
    assert.equal(Number(count), 0);
    assert.equal(dashboard.sent.length, 1);
    assert.equal(dashboard.sent[0].type, 'lyrics_timing');
    assert.equal(dashboard.sent[0].data.currentTime, 12.345);
  } finally { database.close(); }
});

test('chỉ client cùng channel nhận event', () => {
  const { database, clients, service } = fixture();
  try {
    const first = { readyState: 1, realtimeChannelId: 'channel_a', sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
    const second = { readyState: 1, realtimeChannelId: 'channel_b', sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
    clients.add(first); clients.add(second);
    service.publish('channel_a', 'to_overlay', { type: 'theme_change', data: { theme: 'enchanted-wild' } });
    assert.equal(first.sent.length, 1);
    assert.equal(second.sent.length, 0);
  } finally { database.close(); }
});

test('changefeed định tuyến hai chiều theo role, không echo lại nguồn gửi', () => {
  const { database, clients, service } = fixture();
  try {
    const dashboard = { readyState: 1, realtimeRole: 'dashboard', realtimeChannelId: 'channel_a', sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
    const overlay = { readyState: 1, realtimeRole: 'overlay', realtimeChannelId: 'channel_a', sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
    clients.add(dashboard);
    clients.add(overlay);

    service.publish('channel_a', 'to_overlay', { type: 'current_song', data: { id: 'song-1' } });
    assert.equal(overlay.sent.length, 1);
    assert.equal(dashboard.sent.length, 0);

    service.publish('channel_a', 'from_overlay', { type: 'overlay_state', data: { playing: true } });
    assert.equal(dashboard.sent.length, 1);
    assert.equal(overlay.sent.length, 1);
    assert.equal(dashboard.sent[0].type, 'overlay_state');
  } finally { database.close(); }
});

test('tiến trình cập nhật snapshot nhưng không làm phình event log', () => {
  const { database, service } = fixture();
  try {
    service.publish('channel_a', 'to_overlay', { type: 'playlist.started', data: { playlistRequestId: 'p1' } });
    service.publish('channel_a', 'to_overlay', { type: 'playlist.track_progress', data: { playlistRequestId: 'p1', currentTimeSec: 10 } });
    assert.equal(service.getSnapshot('channel_a').activePlaylist.currentTimeSec, 10);
    const count = database.prepare('SELECT COUNT(*) AS total FROM realtime_events').get().total;
    assert.equal(Number(count), 1);
  } finally { database.close(); }
});

test('cấu hình Overlay được cập nhật trong snapshot để reconnect không cần REST', () => {
  const { database, service } = fixture();
  try {
    service.publish('channel_a', 'to_overlay', { type: 'theme_change', data: { theme: 'cutepink' } });
    service.publish('channel_a', 'to_overlay', { type: 'opacity_change', data: { opacity: '82' } });
    service.publish('channel_a', 'to_overlay', {
      type: 'max_duration',
      data: { value: 900, config: { showIdlePriceTable: true } }
    });
    service.publish('channel_a', 'to_overlay', { type: 'show_overlay_lyrics', data: { value: false } });
    const snapshot = service.getSnapshot('channel_a');
    assert.equal(snapshot.overlayConfig.theme, 'cutepink');
    assert.equal(snapshot.overlayConfig.opacity, '82');
    assert.equal(snapshot.overlayConfig.maxDuration, 900);
    assert.equal(snapshot.overlayConfig.timeLimitConfig.showIdlePriceTable, true);
    assert.equal(snapshot.overlayConfig.showOverlayLyrics, false);
  } finally { database.close(); }
});

test('volume invalid does not overwrite the saved audible level', () => {
  const { database, service } = fixture();
  try {
    service.publish('channel_a', 'to_overlay', {
      type: 'control_command', data: { type: 'volume', value: 55 }
    });
    service.publish('channel_a', 'to_overlay', {
      type: 'control_command', data: { type: 'volume', value: null }
    });
    assert.equal(service.getSnapshot('channel_a').overlayConfig.volume, 55);
  } finally { database.close(); }
});

test('intentional zero volume remains a valid mute state', () => {
  const { database, service } = fixture();
  try {
    service.publish('channel_a', 'to_overlay', {
      type: 'control_command', data: { type: 'volume', value: 0 }
    });
    assert.equal(service.getSnapshot('channel_a').overlayConfig.volume, 0);
  } finally { database.close(); }
});
