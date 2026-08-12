(function attachYouTubePlaybackFallbackPolicy(globalScope) {
    'use strict';

    class YouTubePlaybackFallbackPolicy {
        constructor(options = {}) {
            this.blockedStateGraceMs = Math.max(1000, Number(options.blockedStateGraceMs) || 8000);
            this.generalGraceMs = Math.max(
                this.blockedStateGraceMs,
                Number(options.generalGraceMs) || 12000
            );
            this.progressThresholdSec = Math.max(0, Number(options.progressThresholdSec) || 0.5);
        }

        evaluateInitialLoad(input = {}) {
            const elapsedMs = Math.max(0, Number(input.elapsedMs) || 0);
            const currentTime = Math.max(0, Number(input.currentTime) || 0);
            const duration = Math.max(0, Number(input.duration) || 0);
            const playerState = Number(input.playerState);
            const states = input.states || {};

            if (input.hasStarted === true
                || currentTime > this.progressThresholdSec
                || playerState === Number(states.PLAYING)) {
                return { action: 'confirm_playback', reason: 'playback_progress' };
            }

            if (input.isPlaybackSuppressed === true) {
                return { action: 'wait', reason: 'playback_suppressed' };
            }

            const blockedStates = [states.UNSTARTED, states.PAUSED, states.CUED]
                .map(Number)
                .filter(Number.isFinite);
            const isClearlyBlocked = duration <= 0
                && blockedStates.includes(playerState);

            if (isClearlyBlocked && elapsedMs >= this.blockedStateGraceMs) {
                return { action: 'fallback', reason: 'blocked_zero_duration' };
            }
            if (elapsedMs >= this.generalGraceMs) {
                return { action: 'fallback', reason: 'initial_load_timeout' };
            }
            return { action: 'wait', reason: isClearlyBlocked ? 'blocked_grace' : 'loading_grace' };
        }
    }

    globalScope.YouTubePlaybackFallbackPolicy = YouTubePlaybackFallbackPolicy;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = YouTubePlaybackFallbackPolicy;
    }
})(typeof window !== 'undefined' ? window : globalThis);
