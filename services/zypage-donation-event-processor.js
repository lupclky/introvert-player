(function attachZyPageDonationEventProcessor(globalScope) {
    'use strict';

    class ZyPageDonationEventProcessor {
        constructor(options = {}) {
            this.parseYoutubeId = options.parseYoutubeId || (() => null);
            this.resolveSoundcloudUrl = options.resolveSoundcloudUrl || (url => Promise.resolve(url));
            this.normalizeTimestamp = options.normalizeTimestamp || (value => Number(value) || 0);
            this.now = options.now || Date.now;
            this.random = options.random || Math.random;
        }

        normalize(value) {
            const data = value?.data || {};
            const order = data.order || {};
            const amount = Number(String(order.amount ?? data.amount ?? '0').replace(/[^0-9]/g, '')) || 0;
            const message = String(
                order.message || order.text || order.note || order.content
                || order.donate_message || order.donateMessage || order.comment
                || data.text || data.message || data.note || data.content
                || data.donate_message || data.donateMessage || data.comment || ''
            ).trim();
            const isOfficialMusicOrder = Boolean(data.music || data.type === 'music');
            const music = this.normalizeMusic(data.music);
            const donationKey = data.id || data.key || order.id || order.key || null;
            const eventValue = data.time || data.timestamp || order.time || order.timestamp || value?.value || this.now();
            const id = music.key || order.id || order.key || data.id || data.key
                || `donate_${this.now()}_${Math.floor(this.random() * 1000)}`;

            return {
                raw: value,
                data,
                order,
                amount,
                message,
                donorName: order.name || data.name || 'Khách ZyPage',
                donationKey,
                eventValue,
                isOfficialMusicOrder,
                music,
                donation: {
                    id,
                    name: order.name || data.name || 'Khách',
                    amount,
                    message,
                    timestamp: this.normalizeTimestamp(order.time || order.timestamp || data.time || data.timestamp) || this.now(),
                    isMusicOrder: isOfficialMusicOrder,
                    songLink: isOfficialMusicOrder ? music.url : null
                }
            };
        }

        normalizeMusic(music) {
            if (typeof music === 'string') {
                const rawSource = music.trim();
                const url = /^[A-Za-z0-9_-]{11}$/.test(rawSource)
                    ? `https://www.youtube.com/watch?v=${rawSource}`
                    : rawSource;
                return { url, title: null, thumbnail: null, author: null, channelName: null, start: 0, key: null };
            }
            if (!music || typeof music !== 'object') {
                return { url: '', title: null, thumbnail: null, author: null, channelName: null, start: 0, key: null };
            }
            const rawSource = String(music.url || music.link || music.id || '').trim();
            const url = /^[A-Za-z0-9_-]{11}$/.test(rawSource)
                ? `https://www.youtube.com/watch?v=${rawSource}`
                : rawSource;
            return {
                url,
                title: music.title || null,
                thumbnail: music.thumbnail || null,
                author: music.author || music.channelName || music.channelTitle || music.artist || null,
                channelName: music.channelName || music.channelTitle || music.author || music.artist || null,
                start: Number(music.start) || 0,
                key: music.key || null
            };
        }

        async resolveMedia(text) {
            const directVideoId = String(text || '').trim();
            if (/^[A-Za-z0-9_-]{11}$/.test(directVideoId)) {
                return {
                    type: 'youtube', videoId: directVideoId, soundcloudUrl: null,
                    sourceUrl: `https://www.youtube.com/watch?v=${directVideoId}`
                };
            }
            const urls = String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
            for (const url of urls) {
                if (url.includes('soundcloud.com')) {
                    return { type: 'soundcloud', videoId: null, soundcloudUrl: await this.resolveSoundcloudUrl(url), sourceUrl: url };
                }
                if (url.includes('spotify.com') || url.startsWith('spotify:')) continue;
                const videoId = this.parseYoutubeId(url);
                if (videoId) return { type: 'youtube', videoId, soundcloudUrl: null, sourceUrl: url };
            }
            return null;
        }
    }

    globalScope.ZyPageDonationEventProcessor = ZyPageDonationEventProcessor;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageDonationEventProcessor;
})(typeof window !== 'undefined' ? window : globalThis);
