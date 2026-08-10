(function attachZyPageQueueIngestionService(globalScope) {
    'use strict';

    const viewCountPolicy = globalScope.ViewCountPolicy
        || (typeof require === 'function' ? require('./view-count-policy') : null);

    class ZyPageQueueIngestionService {
        constructor(options = {}) {
            this.state = options.state || { queue: [], endedKeys: [] };
            this.eventProcessor = options.eventProcessor;
            this.normalizeKey = options.normalizeKey || (value => String(value || '').trim());
            this.normalizeTimestamp = options.normalizeTimestamp || (value => Number(value) || 0);
            this.fetchMetadata = options.fetchMetadata || (() => Promise.resolve({}));
            this.needsMetadata = options.needsMetadata || (() => false);
            this.hasBrokenTitle = options.hasBrokenTitle || (title => !title);
            this.insertSong = options.insertSong || (() => false);
            this.onInserted = options.onInserted || (() => {});
            this.onMetadataUpdated = options.onMetadataUpdated || (() => {});
            this.onRejected = options.onRejected || (() => {});
            this.getMinimumViewCount = options.getMinimumViewCount || (() => 0);
            this.now = options.now || Date.now;
        }

        getSourceKeys(...values) {
            return values.map(this.normalizeKey).filter(Boolean);
        }

        isEnded(keys) {
            const ended = new Set((this.state.endedKeys || []).map(item => String(item?.key || item)));
            return keys.some(key => ended.has(String(key)));
        }

        findDuplicate({ id, musicKey, type, videoId, soundcloudUrl, donorName, amount, timestamp, transactionTime }) {
            return (this.state.queue || []).find(song => {
                if (String(song.id) === String(id) || String(song.musicKey) === String(musicKey)) return true;
                const sameMedia = song.type === type && (
                    (type === 'youtube' && song.videoId === videoId)
                    || (type === 'soundcloud' && song.soundcloudUrl === soundcloudUrl)
                );
                if (!sameMedia) return false;
                if (song.donorName !== donorName || Number(song.amount || 0) !== Number(amount || 0)) return false;

                // Firebase's music key can lead the API row key by one second.
                // Compare the original ZyPage transaction times first; song.timestamp
                // is only the local arrival time and makes reconciliation fail after a
                // queued song has waited for more than two minutes.
                const existingTransactionTime = this.normalizeTimestamp(song.zypageTransactionTime);
                const candidateTransactionTime = this.normalizeTimestamp(transactionTime);
                if (existingTransactionTime && candidateTransactionTime) {
                    return Math.abs(existingTransactionTime - candidateTransactionTime) <= 2000;
                }

                return Math.abs(Number(song.timestamp || 0) - Number(timestamp || 0)) < 120000;
            }) || null;
        }

        async ingestOfficial(liveEvent, origin = 'firebase') {
            const music = liveEvent?.music;
            if (!liveEvent?.isOfficialMusicOrder || !music?.url) return { handled: false, inserted: false };
            const media = await this.eventProcessor.resolveMedia(music.url);
            if (!media) return { handled: false, inserted: false };

            const id = music.key || liveEvent.donationKey || liveEvent.eventValue;
            const musicKey = music.key || id;
            const sourceKeys = this.getSourceKeys(music.key, liveEvent.donationKey, liveEvent.eventValue);
            const timestamp = this.now();
            const transactionTime = this.normalizeTimestamp(liveEvent.eventValue);
            const candidate = {
                id,
                musicKey,
                type: media.type,
                videoId: media.videoId,
                soundcloudUrl: media.soundcloudUrl,
                donorName: liveEvent.donorName,
                amount: liveEvent.amount,
                timestamp,
                transactionTime
            };
            if (this.isEnded(sourceKeys)) return { handled: true, inserted: false, reason: 'ended' };
            let title = music.title || `Nhạc ${media.type.toUpperCase()}`;
            let author = music.author || '';
            let metadata = null;
            const shouldFetchMetadata = media.type === 'youtube'
                || this.needsMetadata({ title, author, type: media.type, videoId: media.videoId });
            if (shouldFetchMetadata) {
                try {
                    metadata = await this.fetchMetadata(media.type, media.videoId, media.soundcloudUrl);
                } catch (_) { }
            }
            const metadataTitle = String(metadata?.title || '').trim();
            const isMetadataFallback = media.type === 'youtube'
                && (/^YT:\s*/i.test(metadataTitle) || /^Nhạc YouTube\s*\(/i.test(metadataTitle));
            if (metadataTitle && !isMetadataFallback) title = metadataTitle;
            if (metadata?.author) author = metadata.author;
            const channelName = metadata?.channelName || author || music.channelName || music.channelTitle || '';

            const existingSong = this.findDuplicate(candidate);
            if (existingSong) {
                let metadataChanged = false;
                const mergedSourceKeys = [...new Set([
                    ...(Array.isArray(existingSong.zypageSourceKeys) ? existingSong.zypageSourceKeys : []),
                    ...sourceKeys
                ].map(String))];
                if (mergedSourceKeys.length !== (existingSong.zypageSourceKeys || []).length) {
                    existingSong.zypageSourceKeys = mergedSourceKeys;
                    metadataChanged = true;
                }
                // Snapshot API dùng khóa ngoài của music.list làm khóa chuẩn.
                // Sửa bài đã nhận trước đó từ Firebase thay vì giữ musicKey lệch.
                if (origin === 'api' && musicKey && String(existingSong.musicKey || '') !== String(musicKey)) {
                    existingSong.musicKey = musicKey;
                    metadataChanged = true;
                }
                if (title && existingSong.title !== title) {
                    existingSong.title = title;
                    metadataChanged = true;
                }
                if (author && existingSong.author !== author) {
                    existingSong.author = author;
                    metadataChanged = true;
                }
                if (channelName && existingSong.channelName !== channelName) {
                    existingSong.channelName = channelName;
                    metadataChanged = true;
                }
                if (metadata?.thumbnail && existingSong.thumbnail !== metadata.thumbnail) {
                    existingSong.thumbnail = metadata.thumbnail;
                    metadataChanged = true;
                }
                if (metadataChanged) this.onMetadataUpdated(existingSong);
                return { handled: true, inserted: false, reason: 'duplicate', existingSong, metadataUpdated: metadataChanged };
            }

            const song = {
                ...candidate,
                isZyPage: true,
                zypageSource: origin,
                zypageSourceKeys: sourceKeys,
                zypageTransactionTime: transactionTime,
                spotifyId: null,
                title,
                thumbnail: metadata?.thumbnail || music.thumbnail || (media.type === 'youtube'
                    ? `https://img.youtube.com/vi/${media.videoId}/hqdefault.jpg`
                    : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop'),
                author,
                channelName,
                message: liveEvent.message,
                start: music.start || 0,
                end: null,
                timestamp,
                localAddedAt: timestamp,
                _alertSent: true
            };
            const inserted = Boolean(this.insertSong(song));
            if (inserted) this.onInserted(song, 'official', origin);
            return { handled: true, inserted, song };
        }

        async reconcileOfficialKey(liveEvent, origin = 'api') {
            const music = liveEvent?.music;
            if (origin !== 'api' || !liveEvent?.isOfficialMusicOrder || !music?.url || !music?.key) {
                return { repaired: false };
            }
            const media = await this.eventProcessor.resolveMedia(music.url);
            if (!media) return { repaired: false };
            const candidate = {
                id: music.key,
                musicKey: music.key,
                type: media.type,
                videoId: media.videoId,
                soundcloudUrl: media.soundcloudUrl,
                donorName: liveEvent.donorName,
                amount: liveEvent.amount,
                timestamp: this.now(),
                transactionTime: this.normalizeTimestamp(liveEvent.eventValue)
            };
            const existingSong = this.findDuplicate(candidate);
            if (!existingSong) return { repaired: false };

            const sourceKeys = this.getSourceKeys(music.key, liveEvent.donationKey, liveEvent.eventValue);
            const mergedSourceKeys = [...new Set([
                ...(Array.isArray(existingSong.zypageSourceKeys) ? existingSong.zypageSourceKeys : []),
                ...sourceKeys
            ].map(String))];
            const changed = String(existingSong.musicKey || '') !== String(music.key)
                || mergedSourceKeys.length !== (existingSong.zypageSourceKeys || []).length;
            if (!changed) return { repaired: false, existingSong };

            existingSong.musicKey = music.key;
            existingSong.zypageSourceKeys = mergedSourceKeys;
            this.onMetadataUpdated(existingSong);
            return { repaired: true, existingSong, musicKey: String(music.key) };
        }

        async ingestMessage(liveEvent, minimumAmount = 0, origin = 'firebase') {
            if (!liveEvent?.message) return { handled: false, inserted: false };
            if (liveEvent.amount !== 0 && liveEvent.amount < minimumAmount) return { handled: false, inserted: false };
            const media = await this.eventProcessor.resolveMedia(liveEvent.message);
            if (!media) return { handled: false, inserted: false };

            const eventKey = liveEvent.donationKey;
            const timestamp = this.now();
            const musicKey = eventKey ? `msg_${eventKey}` : `msg_live_${liveEvent.eventValue}_${timestamp}`;
            const sourceKeys = this.getSourceKeys(musicKey, eventKey, liveEvent.eventValue);
            const candidate = {
                id: musicKey,
                musicKey,
                type: media.type,
                videoId: media.videoId,
                soundcloudUrl: media.soundcloudUrl,
                donorName: liveEvent.donorName,
                amount: liveEvent.amount,
                timestamp
            };
            if (this.isEnded(sourceKeys)) return { handled: true, inserted: false, reason: 'ended' };
            const existingSong = this.findDuplicate(candidate);
            if (existingSong) return { handled: true, inserted: false, reason: 'duplicate', existingSong };

            const metadata = await this.fetchMetadata(media.type, media.videoId, media.soundcloudUrl);
            const viewPolicy = viewCountPolicy?.evaluateViewCount(
                metadata?.views ?? metadata?.viewCount,
                this.getMinimumViewCount()
            ) || { accepted: true, count: null, minimum: 0, reason: '' };
            if (!viewPolicy.accepted) {
                const result = {
                    handled: true,
                    inserted: false,
                    reason: viewPolicy.reason,
                    viewCount: viewPolicy.count,
                    minimumViewCount: viewPolicy.minimum
                };
                this.onRejected(result, liveEvent, metadata);
                return result;
            }
            const song = {
                ...candidate,
                isZyPage: true,
                zypageSource: origin,
                zypageSourceKeys: sourceKeys,
                zypageTransactionTime: this.normalizeTimestamp(liveEvent.eventValue),
                fromMessage: true,
                spotifyId: null,
                title: metadata.title,
                thumbnail: metadata.thumbnail,
                author: metadata.author || '',
                channelName: metadata.channelName || metadata.author || '',
                views: metadata.views ?? metadata.viewCount ?? '',
                message: liveEvent.message,
                start: 0,
                end: null,
                timestamp,
                localAddedAt: timestamp
            };
            const inserted = Boolean(this.insertSong(song));
            if (inserted) {
                song._alertSent = true;
                this.onInserted(song, 'message', origin);
            }
            return { handled: true, inserted, song };
        }
    }

    globalScope.ZyPageQueueIngestionService = ZyPageQueueIngestionService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageQueueIngestionService;
})(typeof window !== 'undefined' ? window : globalThis);
