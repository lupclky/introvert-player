(function attachTaskbarNotificationService(globalScope) {
    'use strict';

    class TaskbarNotificationService {
        constructor(options = {}) {
            this.show = options.show || (() => {});
            this.hasSongLink = options.hasSongLink || (() => false);
            this.parseYoutubeId = options.parseYoutubeId || (() => null);
            this.fetchMetadata = options.fetchMetadata || (async () => null);
            this.isDark = options.isDark || (() => false);
            this.now = options.now || Date.now;
            this.dedupeWindowMs = options.dedupeWindowMs || 5000;
            this.recent = new Map();
        }

        send(title, message) {
            const key = `${title}_${message}`;
            const now = this.now();
            if (this.recent.has(key) && now - this.recent.get(key) < this.dedupeWindowMs) return false;
            this.recent.set(key, now);
            for (const [entry, timestamp] of this.recent) {
                if (now - timestamp >= this.dedupeWindowMs) this.recent.delete(entry);
            }
            this.show(title, message, this.isDark());
            return true;
        }

        cleanMessage(message) {
            if (!message) return '';
            const stripped = message.replace(/https?:\/\/[^\s<>"']+/gi, '').trim();
            return stripped || message.trim();
        }

        async notify(donation, context = {}) {
            if (!context.shouldAlert || (context.isStartupSync && !context.isTestDonate)) return false;
            const title = `${donation.name || 'Khách'} - ${(donation.amount || 0).toLocaleString('vi-VN')} ₫`;
            const cleanMessage = this.cleanMessage(donation.message);
            const minimum = context.minimumAmount ?? 49000;
            const isPlaylist = donation.isPlaylistDonation === true;
            const isSong = donation.isMusicOrder || (this.hasSongLink(donation.message) && (donation.amount === 0 || donation.amount >= minimum));

            if (isPlaylist) {
                const playlistTitle = donation.playlistTitle || donation.songTitle || donation.title || 'YouTube Playlist';
                const count = Number(donation.playlistTotalTracks || 0);
                return this.send(title, [`[PLAYLIST] ${playlistTitle}`, count > 0 ? `${count} video trong playlist` : '', cleanMessage].filter(Boolean).join('\n'));
            }
            if (isSong) {
                let songTitle = donation.songTitle || donation.title || '';
                if (!songTitle && donation.songLink) {
                    const youtubeId = this.parseYoutubeId(donation.songLink);
                    const soundcloudUrl = donation.songLink.includes('soundcloud.com') ? donation.songLink.split(/[\s?#]/)[0] : null;
                    const type = youtubeId ? 'youtube' : (soundcloudUrl ? 'soundcloud' : '');
                    if (type) {
                        try {
                            const metadata = await this.fetchMetadata(type, youtubeId, soundcloudUrl);
                            if (metadata?.title && !metadata.title.includes('???')) {
                                songTitle = metadata.title;
                                donation.title = songTitle;
                            }
                        } catch (_) {}
                    }
                }
                const line = songTitle ? `[MUSIC] ${songTitle}` : '[MUSIC] Nhạc Order';
                return this.send(title, cleanMessage ? `${line}\n${cleanMessage}` : line);
            }

            let message = donation.message || '';
            const words = message.split(/\s+/);
            const extensionCode = context.currentSong?.extensionCode;
            const isExtension = extensionCode && words.some(word => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toUpperCase() === extensionCode);
            if (isExtension) message = `Gia hạn bài hát: ${message}`;
            else if (context.currentSong?.voteSkipActive && message.toLowerCase().includes('#skip')) message = `Vote Skip bài hát: ${message}`;
            else message = cleanMessage || '(Không có lời nhắn)';
            return this.send(title, `\n${message}`);
        }
    }

    globalScope.TaskbarNotificationService = TaskbarNotificationService;
    if (typeof module !== 'undefined' && module.exports) module.exports = TaskbarNotificationService;
})(typeof window !== 'undefined' ? window : globalThis);
