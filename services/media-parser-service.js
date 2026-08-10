(function attachMediaParserService(globalScope) {
    'use strict';

    class MediaParserService {
        constructor(options = {}) {
            this.URL = options.URL || globalScope.URL;
        }

        parseYoutubeId(rawUrl) {
            if (!rawUrl) return null;
            const cleanUrl = String(rawUrl).trim();
            if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) return cleanUrl;

            const queryMatch = cleanUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (queryMatch?.[1]) return queryMatch[1];

            const pathMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/);
            if (pathMatch?.[1]) return pathMatch[1];

            const fallbackMatch = cleanUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/);
            return fallbackMatch?.[2]?.length === 11 ? fallbackMatch[2] : null;
        }

        parseYoutubePlaylistId(rawUrl) {
            if (!rawUrl || typeof this.URL !== 'function') return null;
            try {
                const parsed = new this.URL(String(rawUrl).trim());
                const youtubeHosts = new Set([
                    'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
                    'youtu.be', 'www.youtu.be'
                ]);
                if (!youtubeHosts.has(parsed.hostname.toLowerCase())) return null;

                const playlistId = String(parsed.searchParams.get('list') || '').trim();
                const videoId = String(parsed.searchParams.get('v') || '').trim();
                if (videoId && /^RD/i.test(playlistId)) return null;
                return /^[A-Za-z0-9_-]{10,64}$/.test(playlistId) ? playlistId : null;
            } catch (_) {
                return null;
            }
        }

        parseSpotifyTrackId(rawUrl) {
            if (!rawUrl) return null;
            const cleanUrl = String(rawUrl).trim();
            const webMatch = cleanUrl.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
            if (webMatch?.[1]) return webMatch[1];

            const uriMatch = cleanUrl.match(/spotify:track:([a-zA-Z0-9]+)/);
            return uriMatch?.[1] || null;
        }

        parseDurationToSeconds(duration) {
            if (duration === null || duration === undefined || duration === '') return 0;
            if (typeof duration === 'number') return duration;

            const value = String(duration).trim();
            if (/^\d+(\.\d+)?$/.test(value)) return parseFloat(value);

            const parts = value.split(':').map(Number);
            if (parts.some(Number.isNaN)) return 0;
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 1) return parts[0];
            return 0;
        }
    }

    globalScope.MediaParserService = MediaParserService;
    if (typeof module !== 'undefined' && module.exports) module.exports = MediaParserService;
})(typeof window !== 'undefined' ? window : globalThis);
