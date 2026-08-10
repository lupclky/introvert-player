(function attachZyPageApiItemProcessor(globalScope) {
    'use strict';

    class ZyPageApiItemProcessor {
        constructor(options = {}) {
            this.eventProcessor = options.eventProcessor;
            this.normalizeTimestamp = options.normalizeTimestamp || (value => Number(value) || 0);
            this.now = options.now || Date.now;
            this.maxAgeMs = options.maxAgeMs || 7 * 24 * 60 * 60 * 1000;
        }

        normalizeMusicItem(key, item) {
            if (!item?.music?.id) return null;
            // ZyPage exposes two different identifiers here: the outer music.list
            // key and music.key inside the row. donate_music_end expects the latter
            // on current production data, while older payloads may omit it. Keep the
            // outer key as the transaction/source key so the caller can still use it
            // as a compatibility fallback instead of discarding either identifier.
            const rowKey = item.music.key ?? key;
            const data = {
                ...item,
                id: item.id || key,
                key,
                music: { ...item.music, key: rowKey },
                order: item.order || {}
            };
            const liveEvent = this.eventProcessor.normalize({ type: 'api', data });
            const realTimestamp = this.normalizeTimestamp(item.order?.time || item.music?.key || key);
            return { key, item, liveEvent, realTimestamp, donation: liveEvent.donation };
        }

        normalizePlainItem(key, item) {
            if (!item) return null;
            const message = String(item.text || item.message || '').trim();
            const data = { ...item, id: item.id || key, message };
            const liveEvent = this.eventProcessor.normalize({ type: 'api', data });
            const realTimestamp = this.normalizeTimestamp(item.time);
            return { key, item, message, liveEvent, realTimestamp, donation: liveEvent.donation };
        }

        isTimestampEligible(timestamp, lastSyncedTimestamp, isManual = false) {
            if (isManual) return true;
            if (!timestamp || timestamp <= Number(lastSyncedTimestamp || 0)) return false;
            return this.now() - timestamp <= this.maxAgeMs;
        }

        hasMatchingMusicTransaction(musicList, timestamp) {
            return Object.values(musicList || {}).some(item => {
                const musicTimestamp = this.normalizeTimestamp(item?.order?.time || item?.music?.key);
                return musicTimestamp === timestamp;
            });
        }
    }

    globalScope.ZyPageApiItemProcessor = ZyPageApiItemProcessor;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageApiItemProcessor;
})(typeof window !== 'undefined' ? window : globalThis);
