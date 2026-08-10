(function attachZyPageFirebaseEventController(globalScope) {
    'use strict';

    class ZyPageFirebaseEventController {
        constructor(options = {}) {
            Object.assign(this, options);
            this.log = options.log || (() => {});
            this.schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
            this.onError = options.onError || console.error;
        }

        get state() {
            return this.getState?.() || {};
        }

        async handle(value, shopId) {
            if (!value?.type) return { handled: false };
            this.log(`Nhận lệnh từ ZyPage Live: <strong>${value.type}</strong>`, 'system');

            if (value.type === 'donateMusicLoad' || value.type === 'add') {
                return this.handleAdd(value, shopId);
            }
            if (value.type === 'donateMusicPause') {
                this.togglePlayback?.();
                return { handled: true, action: 'pause' };
            }
            if (value.type === 'donateMusicEnd') {
                return this.handleEnd(value);
            }
            return { handled: false };
        }

        async handleAdd(value, shopId) {
            this.log('Phát hiện có lượt donate nhạc mới! Đang đồng bộ...', 'queue');
            let inserted = false;
            let commandResult = null;

            if (value.type === 'add' && value.data) {
                try {
                    this.logDebugKeys(value.data);
                    const liveEvent = this.eventProcessor.normalize(value);
                    commandResult = await this.commandService.process(liveEvent.donation, 'Firebase Event');
                    const hasLink = this.hasSongLink(liveEvent.message);
                    const consumedExtension = commandResult.extended && !hasLink;
                    const consumedVote = commandResult.voteSkipped && !hasLink && !liveEvent.isOfficialMusicOrder;

                    if (!consumedExtension && !consumedVote) {
                        const minimumAmount = this.getMinimumAmount?.() ?? 49000;
                        const official = commandResult.playlistHandled
                            ? { handled: true, inserted: false }
                            : await this.ingestionService.ingestOfficial(liveEvent);
                        inserted = official.inserted;
                        this.log(`[Queue ingestion] official: handled=${Boolean(official.handled)}, inserted=${Boolean(official.inserted)}${official.reason ? `, reason=${official.reason}` : ''}`, 'system');
                        if (!official.handled) {
                            const message = await this.ingestionService.ingestMessage(liveEvent, minimumAmount);
                            inserted = message.inserted;
                            this.log(`[Queue ingestion] message: handled=${Boolean(message.handled)}, inserted=${Boolean(message.inserted)}${message.reason ? `, reason=${message.reason}` : ''}`, 'system');
                        }
                        if (inserted) {
                            this.refreshQueue?.();
                            this.playIfIdle?.();
                        }
                    }
                } catch (error) {
                    this.onError(error, 'add');
                }
            }

            this.schedule(() => this.syncQueue?.(shopId), 1500);
            return { handled: true, action: 'add', inserted, commandResult };
        }

        logDebugKeys(data) {
            const keys = [];
            if (data.id) keys.push(`id: ${data.id}`);
            if (data.key) keys.push(`key: ${data.key}`);
            if (data.music?.key) keys.push(`music.key: ${data.music.key}`);
            if (data.order?.id) keys.push(`order.id: ${data.order.id}`);
            if (data.order?.key) keys.push(`order.key: ${data.order.key}`);
            this.log(`🔍 [Live Debug] Khoá giao dịch nhận được từ Firebase: ${keys.join(' | ') || 'Trống'}`, 'system');
        }

        handleEnd(value) {
            const state = this.state;
            const currentSong = state.currentSong;
            if (!currentSong) return { handled: true, action: 'end', skipped: false };
            if (!currentSong.isZyPage) {
                this.log(`Nhận lệnh kết thúc bài từ ZyPage, nhưng bài hát đang phát (${currentSong.title}) là nhạc Thêm nhanh cục bộ. Bỏ qua lệnh này.`, 'system');
                return { handled: true, action: 'end', skipped: false, reason: 'local-song' };
            }

            const data = value.data || {};
            const endKey = this.normalizeKey(
                data.music_key || data.musicKey || data.key || data.id
                || data.music?.key || value.music_key || value.musicKey
            );
            const currentKeys = this.getSourceKeys(currentSong);
            if (endKey && !currentKeys.includes(endKey)) {
                this.log(`Bỏ qua lệnh kết thúc ZyPage cũ (${endKey}) vì không khớp bài đang phát.`, 'system');
                return { handled: true, action: 'end', skipped: false, reason: 'stale-key' };
            }

            const now = Date.now();
            const signature = endKey || JSON.stringify(value);
            const repeated = signature === state.lastHandledZyPageEndSignature
                && now - state.lastHandledZyPageEndAt < 10000;
            const rapidKeylessRepeat = !endKey && now - state.lastHandledZyPageEndAt < 3000;
            if (repeated || rapidKeylessRepeat) {
                this.log('Bỏ qua lệnh kết thúc ZyPage bị lặp.', 'system');
                return { handled: true, action: 'end', skipped: false, reason: 'duplicate' };
            }

            state.lastHandledZyPageEndSignature = signature;
            state.lastHandledZyPageEndAt = now;
            this.skipSong?.(false);
            return { handled: true, action: 'end', skipped: true };
        }
    }

    globalScope.ZyPageFirebaseEventController = ZyPageFirebaseEventController;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageFirebaseEventController;
})(typeof window !== 'undefined' ? window : globalThis);
