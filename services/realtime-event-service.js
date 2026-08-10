'use strict';

const ALLOWED_EVENTS = new Set([
  'playlist.detected', 'playlist.validating', 'playlist.accepted', 'playlist.rejected',
  'playlist.queued', 'playlist.started', 'playlist.paused', 'playlist.resumed',
  'playlist.track_started', 'playlist.track_progress', 'playlist.track_skipped',
  'playlist.completed', 'queue.updated', 'overlay.snapshot'
]);

class RealtimeEventService {
  constructor(options = {}) {
    this.clients = options.clients || new Set();
    this.getOpenState = options.getOpenState || (() => 1);
    this.snapshot = { currentSong: null, queue: [], activePlaylist: null, settings: null, updatedAt: Date.now() };
    this.lastProgressAt = new Map();
  }

  envelope(type, data, metadata = {}) {
    if (!ALLOWED_EVENTS.has(type)) throw new Error(`unsupported_realtime_event:${type}`);
    return {
      version: 1,
      type,
      data: data && typeof data === 'object' ? data : {},
      timestamp: Number(metadata.timestamp || Date.now()),
      eventId: metadata.eventId || `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      source: metadata.source || 'main'
    };
  }

  validate(type, data) {
    if (!ALLOWED_EVENTS.has(type)) return false;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (type.startsWith('playlist.') && type !== 'playlist.detected' && !data.playlistRequestId) return false;
    return true;
  }

  broadcast(payload) {
    const serialized = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState !== this.getOpenState()) continue;
      try { client.send(serialized); } catch (_) {}
    }
  }

  publish(type, data, metadata = {}) {
    if (!this.validate(type, data)) throw new Error(`invalid_realtime_payload:${type}`);
    if (type === 'playlist.track_progress') {
      const key = String(data.playlistRequestId || 'unknown');
      const now = Date.now();
      const previous = this.lastProgressAt.get(key) || 0;
      if (now - previous < 900) return null;
      this.lastProgressAt.set(key, now);
    }
    if (type === 'overlay.snapshot') this.snapshot = { ...this.snapshot, ...data, updatedAt: Date.now() };
    if (type === 'queue.updated') this.snapshot = { ...this.snapshot, queue: data.queue || [], updatedAt: Date.now() };
    if (type === 'playlist.started' || type === 'playlist.track_started') {
      this.snapshot = { ...this.snapshot, activePlaylist: data, updatedAt: Date.now() };
    }
    if (type === 'playlist.track_progress' && this.snapshot.activePlaylist?.playlistRequestId === data.playlistRequestId) {
      this.snapshot = {
        ...this.snapshot,
        activePlaylist: { ...this.snapshot.activePlaylist, ...data },
        updatedAt: Date.now()
      };
    }
    if ((type === 'playlist.paused' || type === 'playlist.resumed') && this.snapshot.activePlaylist?.playlistRequestId === data.playlistRequestId) {
      this.snapshot = {
        ...this.snapshot,
        activePlaylist: { ...this.snapshot.activePlaylist, playbackStatus: type === 'playlist.paused' ? 'paused' : 'playing' },
        updatedAt: Date.now()
      };
    }
    if (type === 'playlist.completed') {
      this.snapshot = { ...this.snapshot, activePlaylist: null, updatedAt: Date.now() };
    }
    const payload = this.envelope(type, data, metadata);
    this.broadcast(payload);
    return payload;
  }

  attachClient(client) {
    const snapshot = this.envelope('overlay.snapshot', this.snapshot);
    try { client.send(JSON.stringify(snapshot)); } catch (_) {}
  }
}

module.exports = { RealtimeEventService, ALLOWED_EVENTS };
