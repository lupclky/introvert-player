'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageQueueIngestionService = require('../services/zypage-queue-ingestion-service');

function createService(overrides = {}) {
    const state = overrides.state || { queue: [], endedKeys: [] };
    const inserted = [];
    const notifications = [];
    const service = new ZyPageQueueIngestionService({
        state,
        eventProcessor: {
            resolveMedia: async text => text.includes('soundcloud')
                ? { type: 'soundcloud', videoId: null, soundcloudUrl: text }
                : { type: 'youtube', videoId: 'abcdefghijk', soundcloudUrl: null }
        },
        normalizeKey: value => value == null ? '' : String(value),
        normalizeTimestamp: value => Number(value) || 0,
        fetchMetadata: async () => ({ title: 'Metadata title', thumbnail: 'thumb', author: 'Channel' }),
        hasBrokenTitle: title => !title || title.includes('broken'),
        needsMetadata: ({ title, author, type }) => title.includes('broken') || (!author && type === 'youtube'),
        insertSong: song => {
            inserted.push(song);
            state.queue.push(song);
            return true;
        },
        onInserted: (song, source) => notifications.push({ song, source }),
        now: () => 1000,
        ...overrides.options
    });
    return { service, state, inserted, notifications };
}

test('order chính thức được dựng và chèn queue đúng một lần', async () => {
    const { service, inserted, notifications } = createService();
    const event = {
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: 'music-1', title: 'Bài chính thức', start: 5 },
        donationKey: 'donate-1',
        eventValue: 123,
        donorName: 'Mèo Cam',
        amount: 1500000,
        message: 'xin bài'
    };

    const first = await service.ingestOfficial(event);
    const second = await service.ingestOfficial(event);
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].musicKey, 'music-1');
    assert.equal(inserted[0].donorName, 'Mèo Cam');
    assert.equal(notifications[0].source, 'official');
});

test('link trong chat lấy metadata và tuân thủ mốc donate', async () => {
    const { service, inserted } = createService();
    const lowEvent = { message: 'https://youtube.com/watch?v=abcdefghijk', amount: 10000, donorName: 'A' };
    const validEvent = {
        message: 'https://youtube.com/watch?v=abcdefghijk',
        amount: 50000,
        donorName: 'B',
        donationKey: 'd-2',
        eventValue: 456
    };

    assert.equal((await service.ingestMessage(lowEvent, 49000)).handled, false);
    assert.equal((await service.ingestMessage(validEvent, 49000)).inserted, true);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].title, 'Metadata title');
    assert.equal(inserted[0].fromMessage, true);
});

test('link trong chat dưới mốc view không được thêm vào queue', async () => {
    const rejected = [];
    const { service, inserted } = createService({ options: {
        fetchMetadata: async () => ({ title: 'Ít view', thumbnail: 'thumb', author: 'Channel', views: 9999 }),
        getMinimumViewCount: () => 10000,
        onRejected: result => rejected.push(result)
    } });
    const result = await service.ingestMessage({
        message: 'https://youtube.com/watch?v=abcdefghijk', amount: 50000, donorName: 'A'
    }, 49000);
    assert.equal(result.inserted, false);
    assert.equal(result.reason, 'below_minimum_views');
    assert.equal(inserted.length, 0);
    assert.equal(rejected.length, 1);
});

test('không khôi phục transaction đã nằm trong endedKeys', async () => {
    const { service, inserted } = createService({ state: { queue: [], endedKeys: [{ key: 'music-ended' }] } });
    const result = await service.ingestOfficial({
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: 'music-ended' },
        donorName: 'Khách',
        amount: 50000,
        eventValue: 10
    });
    assert.equal(result.inserted, false);
    assert.equal(result.reason, 'ended');
    assert.equal(inserted.length, 0);
});

test('metadata YouTube luôn thay tiêu đề API để không dùng nhầm nội dung tin nhắn', async () => {
    const { service } = createService();
    const result = await service.ingestOfficial({
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: 'music-channel', title: 'Tiêu đề hợp lệ', author: '' },
        donorName: 'Khách',
        amount: 50000,
        eventValue: 11
    }, 'api');
    assert.equal(result.song.title, 'Metadata title');
    assert.equal(result.song.author, 'Channel');
    assert.equal(result.song.zypageSource, 'api');
});

test('event trùng sửa lại metadata của bài đã tồn tại trong queue', async () => {
    const existing = {
        id: 'music-duplicate', musicKey: 'music-duplicate', type: 'youtube', videoId: 'abcdefghijk',
        donorName: 'Khách', amount: 50000, timestamp: 1000, title: 'https://youtube.com/watch?v=abcdefghijk'
    };
    let updated = null;
    const { service } = createService({
        state: { queue: [existing], endedKeys: [] },
        options: { onMetadataUpdated: song => { updated = song; } }
    });
    const result = await service.ingestOfficial({
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: 'music-duplicate', title: 'Nội dung tin nhắn' },
        donorName: 'Khách', amount: 50000, eventValue: 12
    });
    assert.equal(result.reason, 'duplicate');
    assert.equal(result.metadataUpdated, true);
    assert.equal(existing.title, 'Metadata title');
    assert.equal(updated, existing);
});

test('snapshot API sửa musicKey Firebase theo music.key nội bộ và giữ khóa ngoài', async () => {
    const existing = {
        id: '1785776172', musicKey: '1785776172', zypageSourceKeys: ['1785776172'],
        type: 'youtube', videoId: 'abcdefghijk', donorName: 'Khách', amount: 100000,
        timestamp: 1000, title: 'Metadata title', author: 'Channel'
    };
    let updated = null;
    const { service } = createService({
        state: { queue: [existing], endedKeys: [] },
        options: { onMetadataUpdated: song => { updated = song; } }
    });
    const result = await service.ingestOfficial({
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: '1785776171', title: 'Bài hát' },
        donationKey: '1785776170', donorName: 'Khách', amount: 100000, eventValue: 1785776171
    }, 'api');

    assert.equal(result.reason, 'duplicate');
    assert.equal(existing.musicKey, '1785776171');
    assert.deepEqual(existing.zypageSourceKeys, ['1785776172', '1785776171', '1785776170']);
    assert.equal(updated, existing);
});

test('reconcileOfficialKey sửa khóa kể cả snapshot đã cũ và không ingest lại', async () => {
    const existing = {
        id: 'wrong-key', musicKey: 'wrong-key', zypageSourceKeys: ['wrong-key'],
        type: 'youtube', videoId: 'abcdefghijk', donorName: 'Khách', amount: 100000,
        timestamp: 1000, title: 'Bài hát'
    };
    const { service } = createService({ state: { queue: [existing], endedKeys: [] } });
    const result = await service.reconcileOfficialKey({
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: 'correct-key' },
        donationKey: 'correct-key', eventValue: 1, donorName: 'Khách', amount: 100000
    }, 'api');
    assert.equal(result.repaired, true);
    assert.equal(existing.musicKey, 'correct-key');
});

test('reconcile music key sau khi chờ lâu bằng transaction time lệch một giây', async () => {
    const existing = {
        id: '1785936667', musicKey: '1785936667', zypageSourceKeys: ['1785936667'],
        zypageTransactionTime: 1785936667,
        type: 'youtube', videoId: 'abcdefghijk', donorName: 'ssaanngg', amount: 52000,
        timestamp: 1000, title: 'Dragon Ball'
    };
    const { service } = createService({
        state: { queue: [existing], endedKeys: [] },
        options: { now: () => 9999999999 }
    });

    const result = await service.reconcileOfficialKey({
        isOfficialMusicOrder: true,
        music: { url: 'https://youtube.com/watch?v=abcdefghijk', key: '1785936666' },
        donationKey: '1785936666', eventValue: 1785936666,
        donorName: 'ssaanngg', amount: 52000
    }, 'api');

    assert.equal(result.repaired, true);
    assert.equal(existing.musicKey, '1785936666');
    assert.deepEqual(existing.zypageSourceKeys, ['1785936667', '1785936666']);
});
