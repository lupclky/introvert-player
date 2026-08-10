(function attachPlaylistVoteSkipService(globalScope) {
    'use strict';

    class PlaylistVoteSkipService {
        constructor(options = {}) { Object.assign(this, options); }

        apply(donation) {
            const state = this.getState?.();
            const vote = state?.playlistVoteSkip;
            const song = state?.currentSong;
            if (!vote?.active || vote.success || !song?.playlistRequestId || song.playlistRequestId !== vote.playlistRequestId) return false;
            if (vote.startedAt && donation?.timestamp && donation.timestamp < vote.startedAt) return false;
            if (donation?.id && this.isDonationProcessed?.(donation.id)) return false;
            const amount = Number(donation?.amount) || 0;
            vote.amount = (vote.amount || 0) + amount;
            vote.contributors = vote.contributors || [];
            vote.contributors.push({ id: donation?.id || '', name: donation?.name || 'Khách', amount });
            if (donation?.id) this.markDonationProcessed?.(donation.id);
            this.recordDonation?.(donation, true);
            if (vote.amount < vote.target) { this.updateUi?.(); return true; }
            const playlistRequestId = vote.playlistRequestId;
            vote.success = true;
            // Đóng quỹ ngay khi hoàn tất. Không để donation/playlist đến sau đi
            // qua trạng thái Vote Skip cũ rồi dùng nhầm thời lượng cũ.
            vote.active = false;
            const reduction = this.reducePlaylist?.(song, playlistRequestId) || { reduced: false };
            this.updateUi?.();
            this.notify?.(song, reduction);
            return true;
        }
    }

    globalScope.PlaylistVoteSkipService = PlaylistVoteSkipService;
    if (typeof module !== 'undefined' && module.exports) module.exports = PlaylistVoteSkipService;
})(typeof window !== 'undefined' ? window : globalThis);
