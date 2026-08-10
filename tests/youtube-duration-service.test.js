'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { YouTubeDurationService } = require('../services/youtube-duration-service');

test('parseIsoDuration đổi duration YouTube sang giây và làm tròn xuống', () => {
    assert.equal(YouTubeDurationService.parseIsoDuration('PT3M41.9S'), 221);
    assert.equal(YouTubeDurationService.parseIsoDuration('PT1H2M3S'), 3723);
    assert.equal(YouTubeDurationService.parseIsoDuration('invalid'), 0);
});

test('ưu tiên YouTube Data API khi có API key', async () => {
    let fetchCount = 0;
    const service = new YouTubeDurationService({
        apiKey: 'test-key',
        fetchImpl: async () => {
            fetchCount++;
            return {
                ok: true,
                json: async () => ({
                    items: [{ contentDetails: { duration: 'PT3M41S' }, statistics: { viewCount: '123' } }]
                })
            };
        },
        playDlLoader: () => { throw new Error('play-dl không được gọi'); }
    });

    const result = await service.resolve('VVO05mYGFY8');
    assert.equal(result.duration, 221);
    assert.equal(result.views, '123');
    assert.equal(result.source, 'youtube-data-api');
    assert.equal(fetchCount, 1);
});

test('play-dl là nguồn nhanh mặc định và các yêu cầu trùng được gộp/cache', async () => {
    let playDlCalls = 0;
    const service = new YouTubeDurationService({
        apiKey: '',
        playDlLoader: () => ({
            video_basic_info: async () => {
                playDlCalls++;
                await new Promise(resolve => setTimeout(resolve, 10));
                return { video_details: { durationInSec: 221.9, views: 456 } };
            }
        }),
        getYtDlpPath: () => ''
    });

    const [first, concurrent] = await Promise.all([
        service.resolve('VVO05mYGFY8'),
        service.resolve('VVO05mYGFY8')
    ]);
    const cached = await service.resolve('VVO05mYGFY8');

    assert.equal(first.duration, 221);
    assert.equal(concurrent.duration, 221);
    assert.equal(first.source, 'play-dl');
    assert.equal(cached.cached, true);
    assert.equal(playDlCalls, 1);
});

test('từ chối video ID không hợp lệ', async () => {
    const service = new YouTubeDurationService();
    await assert.rejects(() => service.resolve('not-a-video-id'), /Invalid YouTube video ID/);
});

test('caches failed resolution to avoid repeated YouTube requests after 429', async () => {
    let playDlCalls = 0;
    const service = new YouTubeDurationService({
        apiKey: '',
        failureCacheTtlMs: 60_000,
        playDlLoader: () => ({
            video_basic_info: async () => {
                playDlCalls++;
                throw new Error('Got 429 from the request');
            }
        }),
        getYtDlpPath: () => ''
    });

    const first = await service.resolve('VVO05mYGFY8');
    const cached = await service.resolve('VVO05mYGFY8');
    assert.equal(first.duration, 0);
    assert.equal(cached.duration, 0);
    assert.equal(cached.cached, true);
    assert.equal(playDlCalls, 1);
});
