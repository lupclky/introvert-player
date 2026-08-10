'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SponsorBlockService = require('../services/sponsorblock-service');

test('chuẩn hóa response SponsorBlock dạng trực tiếp', async () => {
    let requestedUrl = '';
    const service = new SponsorBlockService({
        fetchImpl: async url => {
            requestedUrl = url;
            return ({
            status: 200,
            json: async () => [{ segment: [10, 20], category: 'sponsor' }]
            });
        }
    });
    const result = await service.fetchSegments('video id');
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.segments, [{ start: 10, end: 20, category: 'sponsor' }]);
    const params = new URL(requestedUrl).searchParams;
    assert.equal(params.get('videoID'), 'video id');
    assert.deepEqual(JSON.parse(params.get('categories')), ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'music_offtopic']);
});

test('chuẩn hóa response SponsorBlock dạng bọc segments', async () => {
    const service = new SponsorBlockService({
        fetchImpl: async () => ({
            status: 200,
            json: async () => [{ segments: [{ segment: [1.5, 3.5], category: 'music_offtopic' }] }]
        })
    });
    const result = await service.fetchSegments('video');
    assert.deepEqual(result.segments, [{ start: 1.5, end: 3.5, category: 'offtopic' }]);
});

test('404 trả danh sách trống có trạng thái rõ ràng', async () => {
    const service = new SponsorBlockService({ fetchImpl: async () => ({ status: 404 }) });
    assert.deepEqual(await service.fetchSegments('video'), { status: 'not-found', segments: [] });
});
