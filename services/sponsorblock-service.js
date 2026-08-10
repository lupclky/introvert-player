(function attachSponsorBlockService(globalScope) {
    'use strict';

    class SponsorBlockService {
        constructor(options = {}) {
            this.fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
            this.endpoint = options.endpoint || 'https://sponsor.ajay.app/api/skipSegments';
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
    }

    globalScope.SponsorBlockService = SponsorBlockService;
    if (typeof module !== 'undefined' && module.exports) module.exports = SponsorBlockService;
})(typeof window !== 'undefined' ? window : globalThis);
