'use strict';

class BrowserMediaStateService {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.staleAfterMs = Number(options.staleAfterMs) || 10000;
    this.state = null;
  }

  normalize(payload = {}) {
    const provider = ['youtube', 'youtube-music', 'soundcloud'].includes(payload.provider)
      ? payload.provider
      : null;
    const url = String(payload.url || '').trim();
    const isSafeUrl = /^https:\/\/(?:www\.|music\.)?youtube\.com\//i.test(url)
      || /^https:\/\/(?:www\.|m\.)?soundcloud\.com\//i.test(url);
    const currentTime = Math.max(0, Number(payload.currentTime) || 0);
    const duration = Math.max(0, Number(payload.duration) || 0);

    return {
      active: Boolean(payload.playing && provider && isSafeUrl),
      playing: Boolean(payload.playing && provider && isSafeUrl),
      provider,
      url: isSafeUrl ? url : '',
      title: String(payload.title || '').trim().slice(0, 500),
      artist: String(payload.artist || '').trim().slice(0, 300),
      thumbnail: /^https:\/\//i.test(String(payload.thumbnail || '').trim())
        ? String(payload.thumbnail).trim().slice(0, 2000)
        : '',
      currentTime,
      duration,
      tabId: Number.isInteger(payload.tabId) ? payload.tabId : null,
      updatedAt: this.now()
    };
  }

  update(payload) {
    this.state = this.normalize(payload);
    return { ...this.state };
  }

  removeTab(tabId) {
    if (this.state?.tabId === tabId) {
      this.state = { ...this.state, active: false, playing: false, updatedAt: this.now() };
    }
    return this.getSnapshot();
  }

  getSnapshot() {
    if (!this.state) return null;
    if (this.state.playing && this.now() - this.state.updatedAt > this.staleAfterMs) {
      return { ...this.state, active: false, playing: false };
    }
    return { ...this.state };
  }
}

module.exports = { BrowserMediaStateService };
