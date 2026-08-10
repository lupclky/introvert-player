(function attachOverlaySongPayloadService(globalScope) {
    'use strict';
    class OverlaySongPayloadService {
        constructor(options = {}) { this.calculateMaxDuration = options.calculateMaxDuration || (() => 0); }
        build(song, nextSong, state = {}, options = {}) {
            if (!song) return null;
            const channelName = value => value ? (value.channelName || value.author || value.channelTitle || value.uploader || '') : '';
            const resumeFrom = options.isResuming ? Number(options.resumeFrom || 0) : null;
            return {
                id: song.id, type: song.type || 'youtube', videoId: song.videoId || null,
                soundcloudUrl: song.soundcloudUrl || null, spotifyId: song.spotifyId || null,
                title: song.title, thumbnail: song.thumbnail,
                author: channelName(song), channelName: channelName(song),
                donorName: song.donorName, amount: song.amount, message: song.message,
                // Keep the Dashboard volume together with the song snapshot.  A new
                // player may be created before its separate control command arrives.
                volume: Math.max(0, Math.min(100, Number.isFinite(Number(state.volume)) ? Math.round(Number(state.volume)) : 80)),
                isOwnerAdd: Boolean(song.isOwnerAdd), start: song.start || 0,
                // Preserve queue duration in the live payload so natural completion
                // is not confused with a phantom iframe-ended notification.
                duration: Math.max(0, Math.floor(Number(song.duration) || 0)),
                resumeFrom, isResuming: Boolean(options.isResuming), end: song.end || null,
                skipSegments: state.skipSegments || [],
                maxDuration: state.bypassCurrentSongDuration ? 0 : this.calculateMaxDuration(song),
                extensionCode: song.extensionCode || null, extendedDuration: song.extendedDuration || 0,
                extensionForceShow: Boolean(song.extensionForceShow), extensionPrice: state.extensionPrice,
                extensionMinutes: state.extensionMinutes,
                // Display-only Vote Skip state. The Overlay must never receive the
                // success flag or own the skip transition; Dashboard remains the
                // single authority that advances the queue.
                voteSkipActive: Boolean(song.voteSkipActive),
                voteSkipTarget: Math.max(0, Number(song.voteSkipTarget) || Number(state.voteSkipDefaultAmount) || 20000),
                voteAmount: Math.max(0, Number(song.voteAmount) || 0),
                playlistRequestId: song.playlistRequestId || null, playlistTrackId: song.playlistTrackId || null,
                playlistTitle: song.playlistTitle || null, playlistOwnerName: song.playlistOwnerName || null,
                playlistPosition: song.playlistPosition || null, playlistTotalTracks: song.playlistTotalTracks || null,
                playlistTotalDurationSec: song.playlistTotalDurationSec || null,
                playlistThumbnailUrl: song.playlistThumbnailUrl || null,
                nextSongTitle: nextSong?.title || null,
                nextSongAuthor: nextSong ? channelName(nextSong) : null,
                nextSongChannelName: nextSong ? channelName(nextSong) : null,
                nextSongDonor: nextSong?.donorName || null, nextSongAmount: nextSong?.amount ?? null,
                nextSongIsOwnerAdd: Boolean(nextSong?.isOwnerAdd), nextSongId: nextSong?.id || null,
                nextSongThumbnail: nextSong?.thumbnail || null,
                nextSongType: nextSong ? (nextSong.type || 'youtube') : null,
                nextSongVideoId: nextSong?.videoId || null,
                nextSongPlaylistRequestId: nextSong?.playlistRequestId || null,
                nextSongPlaylistPosition: nextSong?.playlistPosition || null,
                nextSongPlaylistTotalTracks: nextSong?.playlistTotalTracks || null,
                nextSongPlaylistTitle: nextSong?.playlistTitle || null,
                nextSongDuration: nextSong?.duration ?? null, nextSongStart: nextSong?.start ?? null,
                nextSongEnd: nextSong?.end ?? null, luckyMode: Boolean(state.luckyMode)
            };
        }
    }
    globalScope.OverlaySongPayloadService = OverlaySongPayloadService;
    if (typeof module !== 'undefined' && module.exports) module.exports = OverlaySongPayloadService;
})(typeof window !== 'undefined' ? window : globalThis);
