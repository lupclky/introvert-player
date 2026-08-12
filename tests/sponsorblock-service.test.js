'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SponsorBlockService = require('../services/sponsorblock-service');

function createService(overrides = {}) {
    let requestedUrl = '';
    const service = new SponsorBlockService({
        fetchImpl: async url => {
            requestedUrl = url;
            return {
                status: 200,
                json: async () => [{ segment: [10, 20], category: 'sponsor' }]
            };
        },
        ...overrides.options
    });
    return { service, getRequestedUrl: () => requestedUrl };
}

test('chuẩn hóa response SponsorBlock dạng trực tiếp', async () => {
    const { service, getRequestedUrl } = createService();
    const result = await service.fetchSegments('video id');
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.segments, [{ start: 10, end: 20, category: 'sponsor' }]);
    const params = new URL(getRequestedUrl()).searchParams;
    assert.equal(params.get('videoID'), 'video id');
    assert.deepEqual(JSON.parse(params.get('categories')), ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'music_offtopic']);
});

test('chuẩn hóa response SponsorBlock dạng bọc segments', async () => {
    const { service } = createService({ options: {
        fetchImpl: async () => ({
            status: 200,
            json: async () => [{ segments: [{ segment: [1.5, 3.5], category: 'music_offtopic' }] }]
        })
    } });
    const result = await service.fetchSegments('video');
    assert.deepEqual(result.segments, [{ start: 1.5, end: 3.5, category: 'offtopic' }]);
});

test('404 trả danh sách trống có trạng thái rõ ràng', async () => {
    const { service } = createService({ options: { fetchImpl: async () => ({ status: 404 }) } });
    assert.deepEqual(await service.fetchSegments('video'), { status: 'not-found', segments: [] });
});

test('đoạn SponsorBlock ở đầu bài vẫn trả hành động tua', () => {
    const { service } = createService();
    const action = service.resolvePlaybackAction(
        0.2,
        320,
        [{ start: 0, end: 13.068, category: 'sponsor' }],
        { sponsor: true }
    );
    assert.equal(action.type, 'seek');
    assert.ok(Math.abs(action.target - 13.118) < 1e-9);
});

test('đoạn SponsorBlock chạm đuôi trả hành động kết bài thay vì tua vượt duration', () => {
    const { service } = createService();
    const action = service.resolvePlaybackAction(
        294,
        319,
        [{ start: 293.918, end: 319.941, category: 'outro' }],
        { outro: true }
    );
    assert.equal(action.type, 'end');
    assert.equal(action.segment.end, 319.941);
});
