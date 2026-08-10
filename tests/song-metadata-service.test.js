const test = require('node:test');
const assert = require('node:assert/strict');
const SongMetadataService = require('../services/song-metadata-service');

test('song metadata service uses Electron YouTube metadata, duration API and cache', async () => {
    let metadataCalls = 0;
    let fetchCalls = 0;
    const service = new SongMetadataService({
        electronApi: { getYoutubeMetadata: async () => { metadataCalls++; return { title: 'Bài hát', author: 'Kênh - Topic', thumbnail: 'thumb' }; } },
        fetchImpl: async () => { fetchCalls++; return { json: async () => ({ duration: 125, views: '10K' }) }; },
        getApiUrl: path => `local:${path}`,
        formatTime: seconds => `${seconds}s`,
        cleanChannelName: value => value.replace(/ - Topic$/, '')
    });
    const first = await service.get('youtube', 'abc123');
    const second = await service.get('youtube', 'abc123');
    assert.deepEqual(first, second);
    assert.equal(first.author, 'Kênh');
    assert.equal(first.duration, '125s');
    assert.equal(first.views, '10K');
    assert.equal(metadataCalls, 1);
    assert.equal(fetchCalls, 1);
});

test('song metadata service resolves SoundCloud oEmbed and duration', async () => {
    const responses = [
        { title: 'Track', thumbnail_url: 'cover', author_name: 'Artist' },
        { duration: 200, playCount: 50 }
    ];
    const service = new SongMetadataService({
        fetchImpl: async () => ({ json: async () => responses.shift() }),
        formatTime: value => `${value}s`
    });
    const result = await service.get('soundcloud', null, 'https://soundcloud.com/a/b');
    assert.equal(result.title, 'Track');
    assert.equal(result.author, 'Artist');
    assert.equal(result.duration, '200s');
    assert.equal(result.views, 50);
});

test('song metadata service returns a playable fallback on provider errors', async () => {
    const service = new SongMetadataService({
        fetchImpl: async () => { throw new Error('offline'); },
        logger: { error() {} }
    });
    const result = await service.get('youtube', 'video123');
    assert.equal(result.title, 'YT: video123');
    assert.match(result.thumbnail, /video123/);
});
