const test = require('node:test');
const assert = require('node:assert/strict');
const QuickAddService = require('../services/quick-add-service');

function createService(overrides = {}) {
    return new QuickAddService({
        parseYoutubeId: value => String(value).includes('video') ? 'abcdefghijk' : null,
        parsePlaylistId: value => String(value).includes('list=') ? 'playlist123' : null,
        resolveSoundcloudUrl: async value => value.replace('on.soundcloud.com', 'soundcloud.com/user'),
        fetchMetadata: async type => ({ title: `${type} title`, thumbnail: 'cover', author: 'channel', duration: '3:20', views: 10 }),
        parseDuration: () => 200, now: () => 100, random: () => 0.5, ...overrides
    });
}

test('quick add classifies playlist before the video contained in a watch URL', () => {
    const result = createService().classify('https://youtube.com/watch?v=video123456&list=playlist123');
    assert.equal(result.kind, 'playlist');
    assert.equal(result.playlistId, 'playlist123');
});

test('quick add coi YouTube Mix tự sinh RD là một bài đơn', () => {
    const result = createService({
        parseYoutubeId: () => 'BZqfL_2CzKg',
        parsePlaylistId: () => 'RDBZqfL_2CzKg'
    }).classify('https://youtube.com/watch?v=BZqfL_2CzKg&list=RDBZqfL_2CzKg&start_radio=1');
    assert.equal(result.kind, 'track');
    assert.equal(result.videoId, 'BZqfL_2CzKg');
});

test('quick add giữ nguồn YouTube Music để nhận diện lyrics', async () => {
    const quickAdd = createService({ parseYoutubeId: () => 'abcdefghijk', parsePlaylistId: () => null });
    const input = 'https://music.youtube.com/watch?v=abcdefghijk';
    const media = await quickAdd.resolve(input);
    const song = quickAdd.createSong(media, { isOwnerAdd: true });
    assert.equal(media.sourceUrl, input);
    assert.equal(song.sourceUrl, input);
});

test('quick add rejects Spotify and invalid inputs', () => {
    assert.deepEqual(createService().classify('spotify:track:abc'), { kind: 'unsupported', provider: 'spotify' });
    assert.equal(createService().classify('not a link').kind, 'invalid');
});

test('quick add resolves SoundCloud and creates a normalized queue item', async () => {
    const quickAdd = createService();
    const media = await quickAdd.resolve('https://on.soundcloud.com/short');
    const song = quickAdd.createSong(media, { donorName: 'Mèo', amount: 50000, isOwnerAdd: false });
    assert.equal(media.soundcloudUrl, 'https://soundcloud.com/user/short');
    assert.equal(song.title, 'soundcloud title');
    assert.equal(song.duration, 200);
    assert.equal(song.donorName, 'Mèo');
    assert.equal(song.isQuickAdd, true);
});

test('quick add creates the same queue shape from a search result', () => {
    const song = createService().createSong({ id: 'video-result', title: 'Search', thumbnail: 'x', duration: '1:00' }, { isOwnerAdd: true });
    assert.equal(song.type, 'youtube');
    assert.equal(song.videoId, 'abcdefghijk');
    assert.equal(song.isOwnerAdd, true);
    assert.equal(song.isQuickAdd, false);
});

test('quick add chuyển playlist đã nhận diện sang transport thêm thủ công', async () => {
    const calls = [];
    const quickAdd = createService({
        addManualPlaylist: async (...args) => {
            calls.push(args);
            return { matched: true, request: { id: 'playlist-request', status: 'ready' } };
        }
    });
    const context = { donorName: 'Chủ kênh', donationAmount: 0, isOwnerAdd: true };
    const settings = { playlistEnabled: true };
    const blacklist = ['blocked-video'];
    const url = 'https://youtube.com/playlist?list=playlist123';

    const result = await quickAdd.addPlaylist(url, context, settings, blacklist);

    assert.equal(result.request.status, 'ready');
    assert.deepEqual(calls, [[url, context, settings, blacklist]]);
});
