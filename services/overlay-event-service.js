(function attachOverlayEventService(globalScope) {
  'use strict';

  class OverlayEventService {
    constructor(options = {}) {
      this.now = options.now || Date.now;
    }

    evaluate(event, state) {
      if (!event) return { action: 'ignore', reason: 'missing' };
      if (event.type === 'player_error') {
        const currentSong = state.currentSong;
        if (!currentSong || (event.songId != null && String(event.songId) !== String(currentSong.id))) {
          return { action: 'ignore', reason: 'stale' };
        }
        return { action: 'player_error', code: event.code, title: event.title };
      }
      if (event.type !== 'ended') return { action: 'ignore', reason: 'unsupported' };

      const currentSong = state.currentSong;
      if (!currentSong || (event.songId != null && String(event.songId) !== String(currentSong.id))) {
        return { action: 'ignore', reason: 'stale' };
      }
      if (state.currentSongPlaybackConfirmed === false) {
        return { action: 'ignore', reason: 'playback_not_confirmed' };
      }
      if (!event.reason && Number(state.ignoreLegacyEndedUntil || 0) > this.now()) {
        return { action: 'ignore', reason: 'legacy_vote_skip_conflict' };
      }
      if (event.eventId && event.eventId === state.lastHandledEndedEventId) {
        return { action: 'ignore', reason: 'duplicate' };
      }
      return { action: 'ended', eventId: event.eventId || null, song: currentSong };
    }

    progress(data, song, calculate, bypass = false) {
      const duration = Math.max(0, Number(data?.duration) || 0);
      const start = Number(song?.start) || 0;
      let end = duration;
      if (song?.end > start) end = Math.min(end, song.end);
      const max = bypass ? 0 : Number(calculate?.(song) || 0);
      if (max > 0) end = Math.min(end, start + max);
      const limit = Math.max(1, end - start);
      const elapsed = Math.min(limit, Math.max(0, (Number(data?.currentTime) || 0) - start));
      return { isLive: Boolean(data?.isLive) || duration <= 0, limitDuration: limit, elapsedTime: elapsed, percent: Math.min(100, (elapsed / limit) * 100) };
    }
  }

  globalScope.OverlayEventService = OverlayEventService;
  if (typeof module !== 'undefined' && module.exports) module.exports = OverlayEventService;
})(typeof window !== 'undefined' ? window : globalThis);
