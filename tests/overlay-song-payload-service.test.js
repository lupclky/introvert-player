const test = require('node:test');
const assert = require('node:assert/strict');
const OverlaySongPayloadService = require('../services/overlay-song-payload-service');

test('payload builder creates a complete current and next song snapshot', () => {
    const builder = new OverlaySongPayloadService({ calculateMaxDuration: () => 120 });
    const payload = builder.build(
        { id: 1, title: 'Now', author: 'Channel', amount: 50000, duration: 283.9, voteSkipActive: true, voteSkipTarget: 75000, voteAmount: 25000, playlistRequestId: 'p', playlistTrackId: 'pt-1', playlistPosition: 1, playlistTotalTracks: 2 },
        { id: 2, title: 'Next', channelTitle: 'Next Channel', duration: 200, playlistRequestId: 'p', playlistTrackId: 'pt-2', playlistPosition: 2 },
        { skipSegments: [[1, 2]], extensionPrice: 50000, extensionMinutes: 6, voteSkipDefaultAmount: 20000, luckyMode: true, volume: 67 },
        { isResuming: true, resumeFrom: 35 }
    );
    assert.equal(payload.author, 'Channel');
    assert.equal(payload.channelName, 'Channel');
    assert.equal(payload.resumeFrom, 35);
    assert.equal(payload.maxDuration, 120);
    assert.equal(payload.duration, 283);
    assert.equal(payload.volume, 67);
    assert.equal(payload.nextSongAuthor, 'Next Channel');
    assert.equal(payload.nextSongChannelName, 'Next Channel');
    assert.equal(payload.nextSongDuration, 200);
    assert.equal(payload.timeLimitExempt, true);
    assert.equal(payload.nextSongTimeLimitExempt, true);
    assert.equal(payload.nextSongPlaylistTrackId, 'pt-2');
    assert.equal(payload.nextSongPlaylistPosition, 2);
    assert.equal(payload.voteSkipActive, true);
    assert.equal(payload.voteSkipTarget, 75000);
    assert.equal(payload.voteAmount, 25000);
    assert.equal(Object.hasOwn(payload, 'voteSkipSuccess'), false);
    assert.equal(Object.hasOwn(payload, 'voteSkipContributors'), false);
});

test('payload builder applies bypass and null defaults consistently', () => {
    const builder = new OverlaySongPayloadService({ calculateMaxDuration: () => 120 });
    const payload = builder.build({ id: 1, title: 'Only' }, null, { bypassCurrentSongDuration: true });
    assert.equal(payload.maxDuration, 0);
    assert.equal(payload.volume, 80);
    assert.equal(payload.nextSongTitle, null);
    assert.equal(payload.isResuming, false);
});

test('payload builder preserves an intentional mute volume', () => {
    const builder = new OverlaySongPayloadService();
    const payload = builder.build({ id: 1, title: 'Muted' }, null, { volume: 0 });
    assert.equal(payload.volume, 0);
});
