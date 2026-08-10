(function attachZyPageSyncOrchestrator(globalScope) {
    'use strict';

    class ZyPageSyncOrchestrator {
        constructor(options = {}) {
            Object.assign(this, options);
            this.log = options.log || (() => {});
            this.onError = options.onError || console.error;
            this.schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
        }

        async sync({ shopId, isManual = false, domain, lastSyncedTimestamp = 0, minimumAmount = 49000 }) {
            const request = { shopId, isManual };
            if (!this.coordinator.begin(request)) return { queued: true, addedCount: 0 };

            let addedCount = 0;
            let maxTimestamp = Number(lastSyncedTimestamp || 0);
            try {
                await this.beforeSync?.();
                const url = this.snapshotService.buildUrl(domain, shopId);
                this.log(`[ZyPage API] Đang gửi yêu cầu đồng bộ tới ZyPage${isManual ? ' (Thủ công)' : ''}: ${url}`, 'system');
                const snapshot = await this.snapshotService.fetchSnapshot({ domain, shopId });
                this.onSnapshot?.(snapshot);

                const { musicList, plainDonateList } = snapshot;
                for (const [key, item] of Object.entries(musicList)) {
                    const normalized = this.itemProcessor.normalizeMusicItem(key, item);
                    if (!normalized) continue;
                    const { liveEvent, realTimestamp, donation } = normalized;
                    const command = await this.commandService.process(donation, 'musicList');

                    if (command.playlistHandled || (command.extended && !command.voteSkipped)) continue;
                    if (!this.itemProcessor.isTimestampEligible(realTimestamp, lastSyncedTimestamp, isManual)) {
                        const repair = await this.ingestionService.reconcileOfficialKey?.(liveEvent, 'api');
                        if (repair?.repaired) {
                            this.log(`[ZyPage API] Đã sửa music_key bài trong queue thành khóa snapshot: ${repair.musicKey}`, 'system');
                        }
                        continue;
                    }
                    maxTimestamp = Math.max(maxTimestamp, realTimestamp);

                    if (liveEvent.music.url.includes('spotify.com') || liveEvent.music.url.startsWith('spotify:')) {
                        this.log(`Bỏ qua bài hát từ Spotify (đã dừng hỗ trợ): <strong>${liveEvent.music.title || liveEvent.music.url}</strong>`, 'system');
                        continue;
                    }

                    const result = await this.ingestionService.ingestOfficial(liveEvent, 'api');
                    if (result.inserted) {
                        addedCount++;
                    } else if (result.existingSong && !result.existingSong._alertSent) {
                        result.existingSong._alertSent = true;
                        this.broadcastAlert?.(result.existingSong);
                    }
                }

                await Promise.all(Object.entries(plainDonateList).map(async ([key, item]) => {
                    const normalized = this.itemProcessor.normalizePlainItem(key, item);
                    if (!normalized) return;
                    const { liveEvent, realTimestamp, donation, message } = normalized;
                    const command = await this.commandService.process(donation, 'plainDonateList');

                    if (command.playlistHandled || !message) return;
                    const hasLink = this.hasSongLink(message);
                    if ((command.extended || command.voteSkipped) && !hasLink) return;
                    if (item.music || item.type === 'music') return;
                    if (this.itemProcessor.hasMatchingMusicTransaction(musicList, realTimestamp)) return;
                    if (!this.itemProcessor.isTimestampEligible(realTimestamp, lastSyncedTimestamp, isManual)) return;
                    if (liveEvent.amount !== 0 && liveEvent.amount < minimumAmount) return;

                    maxTimestamp = Math.max(maxTimestamp, realTimestamp);
                    const result = await this.ingestionService.ingestMessage(liveEvent, minimumAmount, 'api');
                    if (result.inserted) addedCount++;
                }));

                if (snapshot.musicKeys.length === 0 && snapshot.plainKeys.length === 0) {
                    this.log('Không tìm thấy bài hát nào trong hàng đợi trên trang ZyPage của bạn.', 'system');
                }
                if (maxTimestamp > lastSyncedTimestamp) this.setLastSyncedTimestamp?.(maxTimestamp);

                if (addedCount > 0) {
                    this.log(`Đã đồng bộ thành công thêm <strong>${addedCount}</strong> bài hát mới vào hàng đợi!`, 'queue');
                    this.refreshQueue?.();
                    this.playIfIdle?.();
                } else {
                    this.log('Hàng đợi đã được cập nhật đồng bộ hoàn toàn.', 'system');
                }
                return { queued: false, addedCount, maxTimestamp, snapshot };
            } catch (error) {
                this.onError(error);
                this.log(`Đồng bộ danh sách nhạc ZyPage thất bại: ${error.message}`, 'system');
                return { queued: false, addedCount, maxTimestamp, error };
            } finally {
                const pending = this.coordinator.finish();
                if (pending) this.schedule(() => this.onPendingSync?.(pending), 500);
            }
        }
    }

    globalScope.ZyPageSyncOrchestrator = ZyPageSyncOrchestrator;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageSyncOrchestrator;
})(typeof window !== 'undefined' ? window : globalThis);
