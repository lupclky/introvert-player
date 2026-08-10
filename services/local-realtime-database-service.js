'use strict';

function normalizeRealtimeChannelId(value) {
  const normalized = String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160);
  if (!normalized) throw new Error('missing_realtime_channel_id');
  return normalized;
}

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizeRealtimeVolume(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

class LocalRealtimeDatabaseService {
  constructor(options = {}) {
    if (!options.database) throw new TypeError('database is required');
    this.db = options.database;
    this.clients = options.clients || new Set();
    this.getOpenState = options.getOpenState || (() => 1);
    this.publishCounts = new Map();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS realtime_channels (
        channel_id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS realtime_events (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_realtime_events_channel_time
        ON realtime_events(channel_id, created_at DESC);
    `);
  }

  getSnapshot(channelId) {
    const channel = normalizeRealtimeChannelId(channelId);
    const row = this.db.prepare('SELECT snapshot_json, version, updated_at FROM realtime_channels WHERE channel_id = ?').get(channel);
    return row ? {
      ...safeJsonParse(row.snapshot_json, {}),
      version: Number(row.version || 1),
      updatedAt: Number(row.updated_at || 0)
    } : { currentSong: null, queue: [], activePlaylist: null, settings: null, overlayConfig: null, playback: null, version: 1, updatedAt: 0 };
  }

  saveSnapshot(channelId, snapshot) {
    const channel = normalizeRealtimeChannelId(channelId);
    const updatedAt = Date.now();
    const value = { ...snapshot, updatedAt };
    this.db.prepare(`
      INSERT INTO realtime_channels(channel_id, snapshot_json, version, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(channel_id) DO UPDATE SET snapshot_json = excluded.snapshot_json,
        version = excluded.version, updated_at = excluded.updated_at
    `).run(channel, JSON.stringify(value), updatedAt);
    return value;
  }

  updateSnapshotFromEvent(channelId, message) {
    const current = this.getSnapshot(channelId);
    const data = message?.data;
    if (message.type === 'overlay.snapshot') {
      return this.saveSnapshot(channelId, { ...current, ...(data || {}) });
    }
    if (message.type === 'current_song') current.currentSong = data || null;
    else if (message.type === 'queue.updated') current.queue = Array.isArray(data?.queue) ? data.queue : [];
    else if (message.type === 'playlist.started' || message.type === 'playlist.track_started') current.activePlaylist = data || null;
    else if (message.type === 'playlist.track_progress') current.activePlaylist = { ...(current.activePlaylist || {}), ...(data || {}) };
    else if (message.type === 'playlist.paused' || message.type === 'playlist.resumed') {
      current.activePlaylist = { ...(current.activePlaylist || {}), playbackStatus: message.type === 'playlist.paused' ? 'paused' : 'playing' };
    } else if (message.type === 'playlist.completed') current.activePlaylist = null;
    else if (message.type === 'max_duration') {
      current.overlayConfig = {
        ...(current.overlayConfig || {}),
        maxDuration: Number(data?.value || 0),
        timeLimitConfig: data?.config || current.overlayConfig?.timeLimitConfig || null
      };
    } else if (message.type === 'theme_change') {
      current.overlayConfig = { ...(current.overlayConfig || {}), theme: data?.theme || 'enchanted-wild' };
    } else if (message.type === 'opacity_change') {
      current.overlayConfig = { ...(current.overlayConfig || {}), opacity: data?.opacity ?? '100' };
    } else if (message.type === 'alert_action_text') {
      current.overlayConfig = { ...(current.overlayConfig || {}), alertActionText: data?.text ?? '' };
    } else if (message.type === 'empty_queue_message') {
      current.overlayConfig = { ...(current.overlayConfig || {}), emptyQueueMessage: data?.text ?? '' };
    } else if (message.type === 'hide_empty_overlay') {
      current.overlayConfig = { ...(current.overlayConfig || {}), hideEmptyOverlay: Boolean(data?.value) };
    } else if (message.type === 'focus_mode') {
      current.overlayConfig = { ...(current.overlayConfig || {}), focusMode: Boolean(data?.value) };
    } else if (message.type === 'focus_mode_message') {
      current.overlayConfig = { ...(current.overlayConfig || {}), focusModeMessage: data?.text ?? '' };
    } else if (message.type === 'control_command' && data?.type === 'volume') {
      const volume = normalizeRealtimeVolume(data?.value);
      if (volume === null) return current;
      current.overlayConfig = { ...(current.overlayConfig || {}), volume };
    } else if (message.type === 'control_command' && ['play', 'pause', 'stop', 'seek', 'resume'].includes(data?.type)) {
      const resumePosition = data.type === 'resume' && data.value && typeof data.value === 'object'
        ? Number(data.value.position || 0)
        : 0;
      current.playback = {
        ...(current.playback || {}),
        isPlaying: data.type === 'play' ? true : data.type === 'pause' || data.type === 'stop' ? false : current.playback?.isPlaying,
        currentTime: data.type === 'seek'
          ? Number(data.value || 0)
          : data.type === 'resume'
            ? resumePosition
            : current.playback?.currentTime || 0,
        resumeSongId: data.type === 'resume' ? data.value?.songId ?? null : current.playback?.resumeSongId ?? null
      };
    }
    else return current;
    return this.saveSnapshot(channelId, current);
  }

  createEnvelope(message, source) {
    return {
      version: Number(message?.version || 1),
      type: String(message?.type || ''),
      data: Object.prototype.hasOwnProperty.call(message || {}, 'data') ? message.data : {},
      state: message?.state,
      event: message?.event,
      timestamp: Number(message?.timestamp || Date.now()),
      eventId: message?.eventId || `${message?.type || 'event'}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
      source
    };
  }

  publish(channelId, direction, message) {
    const channel = normalizeRealtimeChannelId(channelId);
    const envelope = this.createEnvelope(message, direction === 'to_overlay' ? 'dashboard' : 'overlay');
    if (!envelope.type) throw new Error('missing_realtime_event_type');

    if (direction === 'to_overlay') this.updateSnapshotFromEvent(channel, envelope);
    if (!['overlay_state', 'playlist.track_progress', 'realtime.heartbeat'].includes(envelope.type)) {
      this.db.prepare(`
        INSERT OR IGNORE INTO realtime_events(id, channel_id, direction, event_type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(envelope.eventId, channel, direction, envelope.type, JSON.stringify(envelope), envelope.timestamp);
      const count = (this.publishCounts.get(channel) || 0) + 1;
      if (count >= 25) {
        this.publishCounts.set(channel, 0);
        this.prune(channel, 200);
      } else {
        this.publishCounts.set(channel, count);
      }
    }

    this.broadcast(channel, envelope, direction);
    return envelope;
  }

  broadcast(channelId, envelope, direction = 'to_overlay') {
    const serialized = JSON.stringify(envelope);
    const targetRole = direction === 'to_overlay' ? 'overlay' : 'dashboard';
    for (const client of this.clients) {
      if (client.readyState !== this.getOpenState() || client.realtimeChannelId !== channelId) continue;
      // Client cũ chưa gửi role được xem là Overlay để giữ tương thích OBS URL cũ.
      const clientRole = client.realtimeRole || 'overlay';
      if (clientRole !== targetRole) continue;
      try { client.send(serialized); } catch (_) {}
    }
  }

  subscribe(client, channelId, options = {}) {
    const channel = normalizeRealtimeChannelId(channelId);
    client.realtimeChannelId = channel;
    if (options.role) client.realtimeRole = options.role;
    const snapshot = this.getSnapshot(channel);
    if (options.sendSnapshot === false) return snapshot;
    const envelope = this.createEnvelope({
      type: 'overlay.snapshot',
      data: snapshot,
      eventId: `snapshot:${channel}:${snapshot.updatedAt || 0}`,
      timestamp: snapshot.updatedAt || Date.now()
    }, 'database');
    try { client.send(JSON.stringify(envelope)); } catch (_) {}
    return snapshot;
  }

  prune(channelId, maxEvents) {
    this.db.prepare(`
      DELETE FROM realtime_events WHERE channel_id = ? AND id NOT IN (
        SELECT id FROM realtime_events WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?
      )
    `).run(channelId, channelId, maxEvents);
  }
}

module.exports = { LocalRealtimeDatabaseService, normalizeRealtimeChannelId, normalizeRealtimeVolume };
