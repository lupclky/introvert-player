'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageApiItemProcessor = require('../services/zypage-api-item-processor');
const ZyPageDonationEventProcessor = require('../services/zypage-donation-event-processor');

function createProcessor(now = 10_000_000) {
    const eventProcessor = new ZyPageDonationEventProcessor({
        now: () => now,
        normalizeTimestamp: value => Number(value) || 0
    });
    return new ZyPageApiItemProcessor({
        eventProcessor,
        now: () => now,
        normalizeTimestamp: value => Number(value) || 0,
        maxAgeMs: 1000
    });
}

test('normalizeMusicItem tạo liveEvent dùng chung với Firebase', () => {
    const processor = createProcessor();
    const result = processor.normalizeMusicItem('row-1', {
        music: { id: 'https://youtube.com/watch?v=abcdefghijk', key: 'music-1', title: 'Bài hát' },
        order: { name: 'Mèo', amount: '100.000', time: 9999500 }
    });
    assert.equal(result.realTimestamp, 9999500);
    assert.equal(result.liveEvent.donorName, 'Mèo');
    assert.equal(result.liveEvent.amount, 100000);
    assert.equal(result.liveEvent.music.key, 'music-1');
    assert.equal(result.liveEvent.donationKey, 'row-1');
});

test('normalizeMusicItem giữ music.key nội bộ và khóa ngoài làm donationKey', () => {
    const processor = createProcessor();
    const result = processor.normalizeMusicItem('1785776171', {
        music: { id: 'abcdefghijk', key: 1785776172, title: 'Bài hát' },
        order: { name: 'Mèo', amount: 100000, time: 1785776171 }
    });
    assert.equal(result.liveEvent.music.key, 1785776172);
    assert.equal(result.liveEvent.donationKey, '1785776171');
});

test('normalizeMusicItem fallback sang khóa ngoài khi payload không có music.key', () => {
    const processor = createProcessor();
    const result = processor.normalizeMusicItem('row-fallback', {
        music: { id: 'abcdefghijk', title: 'Bài hát' },
        order: { name: 'Mèo', amount: 100000, time: 9999500 }
    });
    assert.equal(result.liveEvent.music.key, 'row-fallback');
    assert.equal(result.liveEvent.donationKey, 'row-fallback');
});

test('normalizePlainItem giữ lời nhắn và khóa giao dịch', () => {
    const processor = createProcessor();
    const result = processor.normalizePlainItem('donate-1', {
        name: 'Khách', amount: '50000', text: ' https://youtube.com/watch?v=abcdefghijk ', time: 9999500
    });
    assert.equal(result.message, 'https://youtube.com/watch?v=abcdefghijk');
    assert.equal(result.liveEvent.donationKey, 'donate-1');
    assert.equal(result.donation.amount, 50000);
});

test('lọc timestamp cũ và phát hiện plain donate trùng transaction music', () => {
    const processor = createProcessor();
    assert.equal(processor.isTimestampEligible(9999500, 0, false), true);
    assert.equal(processor.isTimestampEligible(9998000, 0, false), false);
    assert.equal(processor.isTimestampEligible(1, 9999500, false), false);
    assert.equal(processor.isTimestampEligible(1, 9999500, true), true);
    assert.equal(processor.hasMatchingMusicTransaction({ a: { order: { time: 123 } } }, 123), true);
});
