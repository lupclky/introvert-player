(function attachQueueNewBadgeService(globalScope) {
    'use strict';

    class QueueNewBadgeService {
        constructor(options = {}) {
            this.durationMs = Number(options.durationMs) > 0 ? Number(options.durationMs) : 5000;
            this.now = options.now || Date.now;
            this.expirations = new Map();
        }

        normalizeSongs(songs) {
            return Array.isArray(songs) ? songs : [songs];
        }

        mark(songs, now = this.now()) {
            const expiresAt = Number(now) + this.durationMs;
            this.normalizeSongs(songs).forEach(song => {
                if (song?.id !== undefined && song?.id !== null) {
                    this.expirations.set(String(song.id), expiresAt);
                }
            });
        }

        getRemainingMs(songs, now = this.now()) {
            let remainingMs = 0;
            this.normalizeSongs(songs).forEach(song => {
                if (song?.id === undefined || song?.id === null) return;
                const key = String(song.id);
                const expiresAt = Number(this.expirations.get(key)) || 0;
                const remaining = expiresAt - Number(now);
                if (remaining <= 0) {
                    if (expiresAt) this.expirations.delete(key);
                    return;
                }
                remainingMs = Math.max(remainingMs, remaining);
            });
            return remainingMs;
        }
    }

    globalScope.QueueNewBadgeService = QueueNewBadgeService;
    if (typeof module !== 'undefined' && module.exports) module.exports = QueueNewBadgeService;
})(typeof window !== 'undefined' ? window : globalThis);
