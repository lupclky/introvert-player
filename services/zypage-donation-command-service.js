(function attachZyPageDonationCommandService(globalScope) {
    'use strict';

    class ZyPageDonationCommandService {
        constructor(options = {}) {
            this.processPlaylist = options.processPlaylist || (() => Promise.resolve(null));
            this.applyVoteSkip = options.applyVoteSkip || (() => false);
            this.applyExtension = options.applyExtension || (() => false);
            this.recordDonation = options.recordDonation || (() => {});
            this.onError = options.onError || (() => {});
        }

        async process(donation, context = '') {
            const result = {
                playlistHandled: false,
                voteSkipped: false,
                extended: false,
                recorded: false,
                error: null
            };
            if (!donation) return result;

            try {
                const playlistResult = await this.processPlaylist(donation);
                result.playlistHandled = Boolean(playlistResult?.matched);

                // Playlist là một đơn độc lập: phải được xử lý/enqueue trọn vẹn,
                // không được dùng làm khoản góp cho Vote Skip của playlist đang phát.
                result.voteSkipped = result.playlistHandled ? false : Boolean(this.applyVoteSkip(donation));
                // Vote Skip chỉ là một khoản đóng góp cho bài đang phát. Khi không
                // có Vote Skip, donate thường vẫn có thể gia hạn như trước.
                if (!result.playlistHandled && !result.voteSkipped && this.applyExtension(donation)) {
                    result.extended = true;
                }
                if (!result.voteSkipped && !result.extended && donation.name) {
                    await this.recordDonation(donation, true);
                    result.recorded = true;
                }
            } catch (error) {
                result.error = error;
                this.onError(error, context, donation);
            }
            return result;
        }
    }

    globalScope.ZyPageDonationCommandService = ZyPageDonationCommandService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageDonationCommandService;
})(typeof window !== 'undefined' ? window : globalThis);
