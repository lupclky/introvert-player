'use strict';

class DashboardRealtimeService {
  constructor(options = {}) {
    this.getChannelId = options.getChannelId || (() => '');
    this.onMessage = options.onMessage || (() => {});
    this.getEventId = options.getEventId || null;
    this.WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
    this.locationRef = options.locationRef || globalThis.location || { protocol: 'http:', host: '127.0.0.1:3000' };
    this.reconnectDelayMs = Number(options.reconnectDelayMs || 500);
    this.maxOutbox = Number(options.maxOutbox || 200);
    this.replaceableTypes = new Set(options.replaceableTypes || [
      'overlay.snapshot', 'current_song', 'queue.updated', 'playlist.track_progress'
    ]);
    this.socket = null;
    this.reconnectTimer = null;
    this.outbox = [];
    this.closed = false;
  }

  getSocketUrl() {
    const protocol = this.locationRef.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${this.locationRef.host || '127.0.0.1:3000'}/ws`;
  }

  send(message) {
    const envelope = { ...message, channelId: this.getChannelId() };
    if (this.socket?.readyState === this.WebSocketImpl.OPEN) {
      this.socket.send(JSON.stringify(envelope));
      return true;
    }

    if (this.replaceableTypes.has(envelope.type)) {
      const oldIndex = this.outbox.findIndex(item => item.type === envelope.type);
      if (oldIndex >= 0) this.outbox.splice(oldIndex, 1);
    }
    this.outbox.push(envelope);
    if (this.outbox.length > this.maxOutbox) this.outbox.shift();
    return false;
  }

  publish(message) {
    const normalized = {
      version: Number(message?.version || 1),
      type: message?.type,
      data: Object.prototype.hasOwnProperty.call(message || {}, 'data') ? message.data : {},
      state: message?.state,
      event: message?.event,
      timestamp: Number(message?.timestamp || Date.now()),
      eventId: message?.eventId
        || this.getEventId?.(message?.type || 'dashboard')
        || `${message?.type}:${Date.now()}:${Math.random()}`,
      source: 'dashboard'
    };
    this.send(normalized);
    return normalized;
  }

  connect() {
    this.closed = false;
    if (!this.WebSocketImpl) return;
    if (this.socket && [this.WebSocketImpl.OPEN, this.WebSocketImpl.CONNECTING].includes(this.socket.readyState)) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = new this.WebSocketImpl(this.getSocketUrl());
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({
        type: 'realtime.subscribe', role: 'dashboard', channelId: this.getChannelId(), timestamp: Date.now()
      }));
      while (this.outbox.length && socket.readyState === this.WebSocketImpl.OPEN) {
        socket.send(JSON.stringify(this.outbox.shift()));
      }
    };
    socket.onmessage = event => this.onMessage(event.data);
    socket.onerror = error => console.error('[Realtime DB] Dashboard WebSocket lỗi:', error);
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
    };
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket && typeof this.socket.close === 'function') this.socket.close();
    this.socket = null;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DashboardRealtimeService };
if (typeof window !== 'undefined') window.DashboardRealtimeService = DashboardRealtimeService;
