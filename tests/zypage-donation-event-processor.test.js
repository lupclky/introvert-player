'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageDonationEventProcessor = require('../services/zypage-donation-event-processor');

test('chuẩn hóa payload order nhạc Firebase thành donation thống nhất', () => {
    const processor = new ZyPageDonationEventProcessor({
        normalizeTimestamp: value => Number(value) * 1000,
        now: () => 9999,
        random: () => 0.5
    });
    const result = processor.normalize({
        type: 'add',
        data: {
            id: 'event-1',
            music: {
                id: 'https://youtube.com/watch?v=abcdefghijk',
                key: 'music-1',
                title: 'Bài hát',
                channelTitle: 'Tên kênh',
                start: 12
            },
            order: { name: 'Mèo Cam', amount: '1.500.000 đ', message: 'xin bài', time: 123 }
        }
    });

    assert.equal(result.amount, 1500000);
    assert.equal(result.donorName, 'Mèo Cam');
    assert.equal(result.music.author, 'Tên kênh');
    assert.equal(result.donation.id, 'music-1');
    assert.equal(result.donation.timestamp, 123000);
    assert.equal(result.donation.songLink, 'https://youtube.com/watch?v=abcdefghijk');
    assert.equal(result.isOfficialMusicOrder, true);
});

test('resolveMedia nhận YouTube, SoundCloud và bỏ Spotify', async () => {
    const processor = new ZyPageDonationEventProcessor({
        parseYoutubeId: url => url.includes('youtube.com') ? 'abcdefghijk' : null,
        resolveSoundcloudUrl: async url => `${url}/resolved`
    });

    assert.deepEqual(
        await processor.resolveMedia('xem https://youtube.com/watch?v=abcdefghijk'),
        { type: 'youtube', videoId: 'abcdefghijk', soundcloudUrl: null }
    );
    assert.deepEqual(
        await processor.resolveMedia('https://soundcloud.com/a/b'),
        { type: 'soundcloud', videoId: null, soundcloudUrl: 'https://soundcloud.com/a/b/resolved' }
    );
    assert.equal(await processor.resolveMedia('https://open.spotify.com/track/123'), null);
});

test('music.id dạng video ID được chuẩn hóa thành URL YouTube phát được', async () => {
    const processor = new ZyPageDonationEventProcessor({
        parseYoutubeId: url => url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || null
    });
    const event = processor.normalize({
        type: 'add',
        data: {
            music: { id: 'Zye7IpFvc_E', key: 'music-real', title: 'Nội dung bị gán nhầm' },
            order: { name: 'Mèo Cam', amount: 100000 }
        }
    });
    assert.equal(event.music.url, 'https://www.youtube.com/watch?v=Zye7IpFvc_E');
    assert.deepEqual(await processor.resolveMedia(event.music.url), {
        type: 'youtube', videoId: 'Zye7IpFvc_E', soundcloudUrl: null
    });
});

test('payload donate thường vẫn giữ đầy đủ biến thể nội dung', () => {
    const processor = new ZyPageDonationEventProcessor({ now: () => 1000, random: () => 0 });
    const result = processor.normalize({
        data: { key: 'donate-1', name: 'Khách', amount: '50,000', donate_message: 'lời nhắn' }
    });
    assert.equal(result.donation.id, 'donate-1');
    assert.equal(result.donation.message, 'lời nhắn');
    assert.equal(result.donation.amount, 50000);
    assert.equal(result.donation.isMusicOrder, false);
});
