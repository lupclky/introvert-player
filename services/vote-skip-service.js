(function attachVoteSkipService(globalScope) {
    'use strict';

    class VoteSkipService {
        constructor(options = {}) {
            Object.assign(this, options);
            this.now = options.now || Date.now;
        }

        apply(donation) {
            const state = this.getState?.();
            const song = state?.currentSong;
            if (!song?.voteSkipActive || song.voteSkipSuccess) return false;
            if (song.voteSkipStartTime && donation?.timestamp && donation.timestamp < song.voteSkipStartTime) return false;
            if (donation?.id && this.isDonationProcessed?.(donation.id)) return false;

            const amount = Number(donation?.amount) || 0;
            song.voteAmount = (song.voteAmount || 0) + amount;
            song.voteSkipContributors = song.voteSkipContributors || [];
            song.voteSkipContributors.push({
                id: donation?.id || '', name: donation?.name || 'Khách', amount,
                timestamp: donation?.timestamp || this.now()
            });
            song.voteSkipTarget = song.voteSkipTarget || (song.isOwnerAdd ? state.voteSkipDefaultAmount : (song.amount || state.voteSkipDefaultAmount));
            if (donation?.id) this.markDonationProcessed?.(donation.id);
            this.recordDonation?.(donation, true);

            const target = song.voteSkipTarget;
            if (song.voteAmount < target) {
                this.updateUi?.();
                this.syncOverlay?.(song);
                this.log?.(`🗳️ <strong>[Nhận Vote Skip]</strong> ${donation?.name || 'Khách'}: <strong>${song.voteAmount.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} ₫</strong>.`, 'system');
                return true;
            }

            song.voteSkipSuccess = true;
            this.updateUi?.();
            this.syncOverlay?.(song);
            this.notifySuccess?.(song);
            // Vote Skip chỉ quyết định quyền bỏ qua. Việc đổi bài phải đi qua
            // đúng hàm skip mặc định của Dashboard, không có timer/luồng riêng.
            this.skipSong?.(false);
            return true;
        }
    }

    globalScope.VoteSkipService = VoteSkipService;
    if (typeof module !== 'undefined' && module.exports) module.exports = VoteSkipService;
})(typeof window !== 'undefined' ? window : globalThis);
