(function attachYouTubePlaybackFallbackPolicy(globalScope) {
    'use strict';

    function sanitizeStartupMediaUrl(value) {
        if (typeof value !== 'string' || !value) return value;
        try {
            const url = new URL(value, 'https://localhost/');
            const host = String(url.hostname || '').toLowerCase();
            const path = String(url.pathname || '').toLowerCase();
            const isYouTube = (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) && path.startsWith('/embed/');
            const isSoundCloud = host === 'w.soundcloud.com' && path.startsWith('/player');
            if (isYouTube && url.searchParams.get('autoplay') === '1') {
                url.searchParams.set('autoplay', '0');
                return url.toString();
            }
            if (isSoundCloud && /^(true|1)$/i.test(String(url.searchParams.get('auto_play') || ''))) {
                url.searchParams.set('auto_play', 'false');
                return url.toString();
            }
        } catch (_) { }
        return value;
    }

    function installStartupAutoplayGuard(scope) {
        const proto = scope?.HTMLIFrameElement?.prototype;
        if (!proto || proto.__duaStartupAutoplayGuardInstalled) return;
        try { Object.defineProperty(proto, '__duaStartupAutoplayGuardInstalled', { value: true }); } catch (_) { return; }

        const nativeSetAttribute = proto.setAttribute;
        if (typeof nativeSetAttribute === 'function') {
            proto.setAttribute = function (name, value) {
                return nativeSetAttribute.call(this, name, String(name).toLowerCase() === 'src' ? sanitizeStartupMediaUrl(value) : value);
            };
        }

        const src = Object.getOwnPropertyDescriptor(proto, 'src');
        if (src?.get && src?.set && src.configurable !== false) {
            try {
                Object.defineProperty(proto, 'src', {
                    ...src,
                    set(value) { src.set.call(this, sanitizeStartupMediaUrl(value)); }
                });
            } catch (_) { }
        }
    }

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

    YouTubePlaybackFallbackPolicy.sanitizeStartupMediaUrl = sanitizeStartupMediaUrl;
    installStartupAutoplayGuard(globalScope);

    globalScope.YouTubePlaybackFallbackPolicy = YouTubePlaybackFallbackPolicy;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = YouTubePlaybackFallbackPolicy;
    }
})(typeof window !== 'undefined' ? window : globalThis);
