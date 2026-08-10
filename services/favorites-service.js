(function attachFavoritesService(globalScope) {
    'use strict';

    class FavoritesService {
        constructor(options = {}) {
            this.storage = options.storage || globalScope.localStorage;
            this.key = options.key || 'dua_favorites';
            this.parseYoutubeId = options.parseYoutubeId || (() => null);
            this.formatTime = options.formatTime || (value => String(value));
            this.parseDuration = options.parseDuration || (() => 0);
            this.now = options.now || Date.now;
            this.random = options.random || Math.random;
            this.items = options.items || this.load();
        }

        load() {
            try {
                const parsed = JSON.parse(this.storage?.getItem(this.key) || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) { return []; }
        }

        save() { this.storage?.setItem(this.key, JSON.stringify(this.items)); }

        matches(first, second) {
            if (!first || !second) return false;
            return Boolean(
                (second.videoId && first.videoId === second.videoId)
                || (second.soundcloudUrl && first.soundcloudUrl === second.soundcloudUrl)
                || (second.spotifyId && first.spotifyId === second.spotifyId)
                || (second.id != null && first.id === second.id)
            );
        }

        has(song) { return this.items.some(item => this.matches(item, song)); }

        toggle(song) {
            if (!song) return { action: 'none', item: null };
            if (this.has(song)) {
                this.items = this.items.filter(item => !this.matches(item, song));
                this.save();
                return { action: 'removed', item: song };
            }
            let duration = song.duration || '';
            if (duration && (typeof duration === 'number' || /^\d+(\.\d+)?$/.test(String(duration).trim()))) {
                duration = this.formatTime(Number(duration));
            }
            const item = {
                id: song.id || `${this.now()}${this.random().toString(36).slice(2, 7)}`,
                type: song.type || (song.soundcloudUrl ? 'soundcloud' : 'youtube'),
                videoId: song.videoId || (song.type !== 'soundcloud'
                    ? this.parseYoutubeId(song.id) || this.parseYoutubeId(song.songLink)
                    : null) || null,
                spotifyId: song.spotifyId || null,
                soundcloudUrl: song.soundcloudUrl || null,
                songLink: song.songLink || null,
                title: song.title,
                thumbnail: song.thumbnail,
                author: song.author || '',
                views: song.views || '',
                duration
            };
            this.items.push(item);
            this.save();
            return { action: 'added', item };
        }

        contextKey(item) {
            if (!item) return '';
            if (item.videoId) return `youtube:${item.videoId}`;
            if (item.soundcloudUrl) return `soundcloud:${item.soundcloudUrl}`;
            if (item.spotifyId) return `spotify:${item.spotifyId}`;
            return item.id ? `id:${item.id}` : '';
        }

        findByContextKey(key) { return this.items.find(item => this.contextKey(item) === key) || null; }

        externalUrl(item) {
            if (!item) return '';
            if (item.videoId) return `https://www.youtube.com/watch?v=${item.videoId}`;
            if (item.soundcloudUrl) return item.soundcloudUrl;
            if (item.spotifyId) return `https://open.spotify.com/track/${item.spotifyId}`;
            return item.songLink || '';
        }

        createQueueSong(item) {
            const timestamp = this.now();
            return {
                id: `${timestamp}${this.random().toString(36).slice(2, 7)}`,
                type: item.type || 'youtube',
                videoId: item.videoId || (item.type !== 'soundcloud'
                    ? this.parseYoutubeId(item.id) || this.parseYoutubeId(item.songLink)
                    : null) || null,
                spotifyId: item.spotifyId || null,
                soundcloudUrl: item.soundcloudUrl || null,
                songLink: item.songLink || null,
                title: item.title,
                thumbnail: item.thumbnail,
                author: item.author || '',
                duration: this.parseDuration(item.duration) || '',
                donorName: 'Chủ kênh', amount: 0, message: '', start: 0, end: null,
                timestamp, localAddedAt: timestamp, views: item.views || '',
                isOwnerAdd: true, isQuickAdd: false
            };
        }
    }

    globalScope.FavoritesService = FavoritesService;
    if (typeof module !== 'undefined' && module.exports) module.exports = FavoritesService;
})(typeof window !== 'undefined' ? window : globalThis);
