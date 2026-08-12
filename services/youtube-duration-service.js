'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { parseViewCount } = require('./view-count-policy');

class YouTubeDurationService {
    constructor(options = {}) {
        this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
        this.playDlLoader = options.playDlLoader || (() => require('play-dl'));
        this.spawnImpl = options.spawnImpl || spawn;
        this.fsImpl = options.fsImpl || fs;
        this.getYtDlpPath = options.getYtDlpPath || (() => '');
        this.apiKey = options.apiKey || process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || '';
        this.enableInnerTubeSearch = options.enableInnerTubeSearch !== false;
        this.enablePlayDl = options.enablePlayDl !== false;
        this.now = options.now || Date.now;
        this.logger = options.logger || console;
        this.cacheTtlMs = Math.max(1000, Number(options.cacheTtlMs) || 12 * 60 * 60 * 1000);
        this.failureCacheTtlMs = Math.max(1000, Number(options.failureCacheTtlMs) || 10 * 60 * 1000);
        this.maxCacheEntries = Math.max(10, Number(options.maxCacheEntries) || 1000);
        this.sourceTimeoutMs = Math.max(1000, Number(options.sourceTimeoutMs) || 10000);
        this.ytDlpTimeoutMs = Math.max(1000, Number(options.ytDlpTimeoutMs) || 20000);
        this.cache = options.cache || new Map();
        this.inflight = new Map();
    }

    static isValidVideoId(videoId) {
        return /^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''));
    }

    static parseIsoDuration(value) {
        const match = String(value || '').match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
        if (!match) return 0;
        const days = Number(match[1] || 0);
        const hours = Number(match[2] || 0);
        const minutes = Number(match[3] || 0);
        const seconds = Number(match[4] || 0);
        return Math.max(0, Math.floor(days * 86400 + hours * 3600 + minutes * 60 + seconds));
    }

    static parseClockDuration(value) {
        const text = String(value || '').trim();
        if (!/^\d{1,3}(?::\d{1,2}){1,2}$/.test(text)) return 0;
        const parts = text.split(':').map(Number);
        if (parts.some(part => !Number.isFinite(part))) return 0;
        return Math.max(0, Math.floor(parts.reduce((total, part) => total * 60 + part, 0)));
    }

    static findExactVideoRenderer(value, videoId) {
        if (!value || typeof value !== 'object') return null;
        if (value.videoRenderer?.videoId === videoId) return value.videoRenderer;
        for (const child of Object.values(value)) {
            const found = YouTubeDurationService.findExactVideoRenderer(child, videoId);
            if (found) return found;
        }
        return null;
    }

    normalizeResult(result, source, cached = false) {
        return {
            duration: Math.max(0, Math.floor(Number(result?.duration) || 0)),
            views: result?.views === undefined || result?.views === null ? '' : String(result.views),
            source,
            cached,
            ...(result?.error ? { error: String(result.error) } : {})
        };
    }

    async withTimeout(promise, timeoutMs, label) {
        let timer = null;
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
                })
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    getCached(videoId) {
        const entry = this.cache.get(videoId);
        if (!entry) return null;
        const ttl = Number(entry.duration) > 0 ? this.cacheTtlMs : this.failureCacheTtlMs;
        if (this.now() - entry.timestamp >= ttl) {
            this.cache.delete(videoId);
            return null;
        }
        return this.normalizeResult(entry, entry.source, true);
    }

    setCached(videoId, result) {
        if (!result) return;
        if (this.cache.size >= this.maxCacheEntries) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(videoId, { ...result, timestamp: this.now() });
    }

    async resolve(videoId) {
        const normalizedId = String(videoId || '').trim();
        if (!YouTubeDurationService.isValidVideoId(normalizedId)) {
            throw new Error('Invalid YouTube video ID');
        }

        const cached = this.getCached(normalizedId);
        if (cached) return cached;
        if (this.inflight.has(normalizedId)) return this.inflight.get(normalizedId);

        const request = this.resolveUncached(normalizedId)
            .then(result => {
                this.setCached(normalizedId, result);
                return result;
            })
            .finally(() => this.inflight.delete(normalizedId));
        this.inflight.set(normalizedId, request);
        return request;
    }

    async resolveUncached(videoId) {
        const failures = [];
        const sources = [
            ['youtube-data-api', () => this.resolveWithYouTubeDataApi(videoId)],
            ['innertube-search', () => this.resolveWithInnerTubeSearch(videoId)],
            ['yt-dlp', () => this.resolveWithYtDlp(videoId)],
            ['play-dl', () => this.resolveWithPlayDl(videoId)]
        ];

        for (const [source, resolver] of sources) {
            if (source === 'youtube-data-api' && !this.apiKey) continue;
            if (source === 'innertube-search' && (!this.enableInnerTubeSearch || !this.fetchImpl)) continue;
            if (source === 'play-dl' && !this.enablePlayDl) continue;
            try {
                const rawResult = await resolver();
                const result = this.normalizeResult(rawResult, source, false);
                if (result.duration > 0) return result;
                failures.push(`${source}: no duration`);
            } catch (error) {
                failures.push(`${source}: ${error.message}`);
                this.logger.warn?.(`[YouTube duration] ${source} failed for ${videoId}:`, error.message);
            }
        }

        return {
            duration: 0,
            views: '',
            source: 'unavailable',
            cached: false,
            error: failures.join(' | ')
        };
    }

    async resolveWithYouTubeDataApi(videoId) {
        if (!this.fetchImpl || !this.apiKey) throw new Error('YouTube Data API is not configured');
        const url = new URL('https://www.googleapis.com/youtube/v3/videos');
        url.searchParams.set('part', 'contentDetails,statistics');
        url.searchParams.set('id', videoId);
        url.searchParams.set('fields', 'items(contentDetails(duration),statistics(viewCount))');
        url.searchParams.set('key', this.apiKey);
        const response = await this.withTimeout(this.fetchImpl(url), this.sourceTimeoutMs, 'YouTube Data API');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const item = payload?.items?.[0];
        return {
            duration: YouTubeDurationService.parseIsoDuration(item?.contentDetails?.duration),
            views: item?.statistics?.viewCount || ''
        };
    }

    async resolveWithPlayDl(videoId) {
        const play = this.playDlLoader();
        const info = await this.withTimeout(
            play.video_basic_info(`https://www.youtube.com/watch?v=${videoId}`),
            this.sourceTimeoutMs,
            'play-dl'
        );
        return {
            duration: info?.video_details?.durationInSec,
            views: info?.video_details?.views || ''
        };
    }

    async resolveWithInnerTubeSearch(videoId) {
        if (!this.fetchImpl) throw new Error('fetch is not available');
        const response = await this.withTimeout(
            this.fetchImpl('https://www.youtube.com/youtubei/v1/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
                },
                body: JSON.stringify({
                    query: videoId,
                    context: {
                        client: {
                            clientName: 'WEB',
                            clientVersion: '2.20210621.02.00'
                        }
                    }
                })
            }),
            this.sourceTimeoutMs,
            'InnerTube Search'
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const renderer = YouTubeDurationService.findExactVideoRenderer(payload, videoId);
        if (!renderer) throw new Error('exact video not found');
        const durationText = renderer.lengthText?.simpleText
            || renderer.lengthText?.runs?.map(run => run?.text || '').join('')
            || '';
        const viewText = renderer.viewCountText?.simpleText
            || renderer.shortViewCountText?.simpleText
            || '';
        return {
            duration: YouTubeDurationService.parseClockDuration(durationText),
            views: parseViewCount(viewText) ?? ''
        };
    }

    resolveWithYtDlp(videoId) {
        const ytDlpPath = this.getYtDlpPath();
        if (!ytDlpPath || !this.fsImpl.existsSync(ytDlpPath)) {
            return Promise.reject(new Error('yt-dlp.exe is not ready'));
        }

        return new Promise((resolve, reject) => {
            const child = this.spawnImpl(ytDlpPath, [
                '--no-playlist',
                '--skip-download',
                '--dump-single-json',
                '--no-warnings',
                `https://www.youtube.com/watch?v=${videoId}`
            ]);
            let stdout = '';
            let stderr = '';
            let settled = false;
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(result);
            };
            const timer = setTimeout(() => {
                try { child.kill(); } catch (_) { }
                finish(new Error('yt-dlp metadata timeout'));
            }, this.ytDlpTimeoutMs);

            child.stdout.on('data', chunk => { stdout += chunk.toString(); });
            child.stderr.on('data', chunk => { stderr += chunk.toString(); });
            child.on('error', error => finish(error));
            child.on('close', code => {
                if (code !== 0) {
                    finish(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
                    return;
                }
                try {
                    const metadata = JSON.parse(stdout);
                    finish(null, { duration: metadata.duration, views: metadata.view_count || '' });
                } catch (error) {
                    finish(error);
                }
            });
        });
    }
}

module.exports = { YouTubeDurationService };
