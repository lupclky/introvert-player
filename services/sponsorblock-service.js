(function attachSponsorBlockService(globalScope) {
    'use strict';

    class SponsorBlockService {
        constructor(options = {}) {
            this.fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
            this.endpoint = options.endpoint || 'https://sponsor.ajay.app/api/skipSegments';
            const configuredTailTolerance = Number(options.tailToleranceSeconds);
            this.tailToleranceSeconds = Number.isFinite(configuredTailTolerance)
                ? Math.max(0, configuredTailTolerance)
                : 1.5;
            this.categories = options.categories || [
                'sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'music_offtopic'
            ];
            this.normalizeCategory = options.normalizeCategory || (category =>
                category === 'music_offtopic' ? 'offtopic' : category
            );
        }

        async fetchSegments(videoId) {
            if (!videoId) return { status: 'empty', segments: [] };
            const query = new URLSearchParams({
                videoID: String(videoId),
                categories: JSON.stringify(this.categories)
            });
            const separator = this.endpoint.includes('?') ? '&' : '?';
            const response = await this.fetchImpl(`${this.endpoint}${separator}${query.toString()}`);
            if (response.status === 404) return { status: 'not-found', segments: [] };
            if (response.status !== 200) return { status: 'error', httpStatus: response.status, segments: [] };

            const data = await response.json();
            let records = Array.isArray(data) ? data : [];
            if (records.length > 0 && Array.isArray(records[0]?.segments)) records = records[0].segments;
            const segments = records
                .filter(item => Array.isArray(item?.segment) && item.segment.length >= 2)
                .map(item => ({
                    start: Number(item.segment[0]),
                    end: Number(item.segment[1]),
                    category: this.normalizeCategory(item.category)
                }))
                .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
            return { status: 'ok', segments };
        }

        isTerminalSegment(segmentEnd, playbackDuration) {
            const end = Number(segmentEnd);
            const duration = Number(playbackDuration);
            return Number.isFinite(end)
                && Number.isFinite(duration)
                && duration > 0
                && end >= duration - this.tailToleranceSeconds;
        }

        resolvePlaybackAction(currentTime, playbackDuration, segments, enabledCategories = {}) {
            const time = Math.max(0, Number(currentTime) || 0);
            const records = Array.isArray(segments) ? segments : [];

            for (const segment of records) {
                if (enabledCategories[segment?.category] !== true) continue;
                const start = Number(segment?.start);
                const end = Number(segment?.end);
                if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
                if (time < start || time >= end) continue;

                return {
                    type: this.isTerminalSegment(end, playbackDuration) ? 'end' : 'seek',
                    target: end + 0.05,
                    segment: { start, end, category: segment.category }
                };
            }

            return { type: 'none' };
        }
    }

    globalScope.SponsorBlockService = SponsorBlockService;
    if (typeof module !== 'undefined' && module.exports) module.exports = SponsorBlockService;
})(typeof window !== 'undefined' ? window : globalThis);
