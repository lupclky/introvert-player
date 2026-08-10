(function attachZyPageSongEndService(globalScope) {
    'use strict';

    class ZyPageSongEndService {
        constructor(options = {}) {
            this.logger = options.logger || console;
            this.sentKeys = new Set();
            this.pendingKeys = new Set();
            this.transport = options.transport || (() => Promise.resolve(false));
        }

        createRequest(config = {}) {
            const { domain, shopId, token, musicKey } = config;
            if (!domain || !shopId || !token || musicKey == null || musicKey === '') return null;
            const body = new URLSearchParams({
                action: 'donate_music_end',
                shop_id: String(shopId),
                shop_token: String(token),
                music_key: String(musicKey)
            });
            return {
                url: `${String(domain).replace(/\/$/, '')}/assets/ajax/system.php`,
                body,
                musicKey: String(musicKey),
                videoId: String(config.videoId || '').trim(),
                donorName: String(config.donorName || '').trim(),
                amount: Number(config.amount || 0),
                transactionTime: Number(config.transactionTime || 0)
            };
        }

        async send(config) {
            const request = this.createRequest(config);
            if (!request) return { success: false, reason: 'invalid' };
            if (this.sentKeys.has(request.musicKey) || this.pendingKeys.has(request.musicKey)) {
                return { success: false, reason: 'duplicate' };
            }
            this.pendingKeys.add(request.musicKey);
            try {
                try {
                    const result = await this.transport(request);
                    if (result === true || result?.success === true) {
                        this.sentKeys.add(request.musicKey);
                        return {
                            success: true,
                            method: 'ipc',
                            reason: result?.reason || '',
                            status: result?.status ?? null,
                            response: result?.response || null
                        };
                    }
                    return {
                        success: false,
                        reason: result?.reason || 'server_rejected',
                        status: result?.status ?? null,
                        response: result?.response ?? null,
                        error: result?.error || null
                    };
                } catch (error) {
                    this.logger.warn('ZyPage song-end transport failed.', error);
                    return { success: false, reason: 'transport', error };
                }
            } finally {
                this.pendingKeys.delete(request.musicKey);
            }
        }
    }

    globalScope.ZyPageSongEndService = ZyPageSongEndService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageSongEndService;
})(typeof window !== 'undefined' ? window : globalThis);
