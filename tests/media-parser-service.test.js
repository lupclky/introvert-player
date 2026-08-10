const test = require('node:test');
const assert = require('node:assert/strict');
const MediaParserService = require('../services/media-parser-service');

function createService(overrides = {}) {
    return new MediaParserService({ URL, ...overrides });
}

test('nhận diện video YouTube từ ID và các dạng URL phổ biến', () => {
    const service = createService();
    assert.equal(service.parseYoutubeId('VVO05mYGFY8'), 'VVO05mYGFY8');
    assert.equal(service.parseYoutubeId('https://www.youtube.com/watch?v=VVO05mYGFY8&t=10'), 'VVO05mYGFY8');
    assert.equal(service.parseYoutubeId('https://youtu.be/VVO05mYGFY8'), 'VVO05mYGFY8');
    assert.equal(service.parseYoutubeId('https://youtube.com/shorts/VVO05mYGFY8'), 'VVO05mYGFY8');
    assert.equal(service.parseYoutubeId('không phải video'), null);
});

test('nhận diện playlist YouTube nhưng loại playlist Mix tự sinh', () => {
    const service = createService();
    assert.equal(
        service.parseYoutubePlaylistId('https://www.youtube.com/playlist?list=PL1234567890'),
        'PL1234567890'
    );
    assert.equal(
        service.parseYoutubePlaylistId('https://www.youtube.com/watch?v=VVO05mYGFY8&list=RDVVO05mYGFY8'),
        null
    );
    assert.equal(service.parseYoutubePlaylistId('https://example.com/?list=PL1234567890'), null);
});

test('nhận diện Spotify track từ URL và URI', () => {
    const service = createService();
    assert.equal(service.parseSpotifyTrackId('https://open.spotify.com/track/4PTG3Z6ehGkBFbfkGiQkYm'), '4PTG3Z6ehGkBFbfkGiQkYm');
    assert.equal(service.parseSpotifyTrackId('spotify:track:4PTG3Z6ehGkBFbfkGiQkYm'), '4PTG3Z6ehGkBFbfkGiQkYm');
    assert.equal(service.parseSpotifyTrackId('https://open.spotify.com/album/abc'), null);
});

test('chuẩn hóa thời lượng số, MM:SS và HH:MM:SS sang giây', () => {
    const service = createService();
    assert.equal(service.parseDurationToSeconds(42.5), 42.5);
    assert.equal(service.parseDurationToSeconds('221.5'), 221.5);
    assert.equal(service.parseDurationToSeconds('3:41'), 221);
    assert.equal(service.parseDurationToSeconds('1:02:03'), 3723);
    assert.equal(service.parseDurationToSeconds('sai'), 0);
    assert.equal(service.parseDurationToSeconds(''), 0);
});
