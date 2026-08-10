const test = require('node:test');
const assert = require('node:assert/strict');
const QuickAddService = require('../services/quick-add-service');

function service(overrides = {}) {
    return new QuickAddService({
        parseYoutubeId: value => String(value).includes('video') ? 'abcdefghijk' : null,
        parsePlaylistId: value => String(value).includes('list=') ? 'playlist123' : null,
        resolveSoundcloudUrl: async value => value.replace('on.soundcloud.com', 'soundcloud.com/user'),
        fetchMetadata: async type => ({ title: `${type} title`, thumbnail: 'cover', author: 'channel', duration: '3:20', views: 10 }),
        parseDuration: () => 200, now: () => 100, random: () => 0.5, ...overrides
    });
}

test('quick add classifies playlist before the video contained in a watch URL', () => {
    const result = service().classify('https://youtube.com/watch?v=video123456&list=playlist123');
    assert.equal(result.kind, 'playlist');
    assert.equal(result.playlistId, 'playlist123');
});

test('quick add coi YouTube Mix tự sinh RD là một bài đơn', () => {
    const result = service({
        parseYoutubeId: () => 'BZqfL_2CzKg',
        parsePlaylistId: () => 'RDBZqfL_2CzKg'
    }).classify('https://youtube.com/watch?v=BZqfL_2CzKg&list=RDBZqfL_2CzKg&start_radio=1');
    assert.equal(result.kind, 'track');
    assert.equal(result.videoId, 'BZqfL_2CzKg');
});

test('quick add rejects Spotify and invalid inputs', () => {
    assert.deepEqual(service().classify('spotify:track:abc'), { kind: 'unsupported', provider: 'spotify' });
    assert.equal(service().classify('not a link').kind, 'invalid');
});

test('quick add resolves SoundCloud and creates a normalized queue item', async () => {
    const quickAdd = service();
    const media = await quickAdd.resolve('https://on.soundcloud.com/short');
    const song = quickAdd.createSong(media, { donorName: 'Mèo', amount: 50000, isOwnerAdd: false });
    assert.equal(media.soundcloudUrl, 'https://soundcloud.com/user/short');
    assert.equal(song.title, 'soundcloud title');
    assert.equal(song.duration, 200);
    assert.equal(song.donorName, 'Mèo');
    assert.equal(song.isQuickAdd, true);
});

test('quick add creates the same queue shape from a search result', () => {
    const song = service().createSong({ id: 'video-result', title: 'Search', thumbnail: 'x', duration: '1:00' }, { isOwnerAdd: true });
    assert.equal(song.type, 'youtube');
    assert.equal(song.videoId, 'abcdefghijk');
    assert.equal(song.isOwnerAdd, true);
    assert.equal(song.isQuickAdd, false);
});
