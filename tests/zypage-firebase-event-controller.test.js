'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageFirebaseEventController = require('../services/zypage-firebase-event-controller');

function createController(overrides = {}) {
    const calls = [];
    const state = {
        currentSong: null,
        lastHandledZyPageEndSignature: '',
        lastHandledZyPageEndAt: 0
    };
    const controller = new ZyPageFirebaseEventController({
        getState: () => state,
        eventProcessor: { normalize: value => ({
            donation: { id: 'd1', name: 'Mèo' },
            message: '',
            isOfficialMusicOrder: true,
            music: { url: 'https://youtube.com/watch?v=x' }
        }) },
        commandService: { process: async () => ({ playlistHandled: false, extended: false, voteSkipped: false }) },
        ingestionService: {
            ingestOfficial: async () => ({ handled: true, inserted: true }),
            ingestMessage: async () => ({ handled: false, inserted: false })
        },
        getMinimumAmount: () => 49000,
        hasSongLink: () => false,
        refreshQueue: () => calls.push('refresh'),
        playIfIdle: () => calls.push('play'),
        syncQueue: shopId => calls.push(['sync', shopId]),
        togglePlayback: () => calls.push('pause'),
        normalizeKey: value => value ? String(value) : '',
        getSourceKeys: song => song.sourceKeys || [],
        skipSong: automatic => calls.push(['skip', automatic]),
        log: () => {},
        schedule: callback => callback(),
        ...overrides
    });
    return { controller, state, calls };
}

test('event add ingest, render và yêu cầu sync sau cùng', async () => {
    const { controller, calls } = createController();
    const result = await controller.handle({ type: 'add', data: { id: 'd1', music: { key: 'm1' } } }, 'shop-1');
    assert.equal(result.inserted, true);
    assert.deepEqual(calls, ['refresh', 'play', ['sync', 'shop-1']]);
});

test('official music donation still enters queue after Vote Skip contribution', async () => {
    const { controller, calls } = createController({
        commandService: { process: async () => ({ playlistHandled: false, extended: false, voteSkipped: true }) }
    });
    const result = await controller.handle({ type: 'add', data: { id: 'd-vote', music: { key: 'm-vote' } } }, 'shop-1');
    assert.equal(result.inserted, true);
    assert.deepEqual(calls, ['refresh', 'play', ['sync', 'shop-1']]);
});

test('event pause chỉ điều khiển playback', async () => {
    const { controller, calls } = createController();
    const result = await controller.handle({ type: 'donateMusicPause' }, 'shop');
    assert.equal(result.action, 'pause');
    assert.deepEqual(calls, ['pause']);
});

test('event end sai key không skip bài đang phát', async () => {
    const { controller, state, calls } = createController();
    state.currentSong = { id: 'song', title: 'Bài', isZyPage: true, sourceKeys: ['current-key'] };
    const result = await controller.handle({ type: 'donateMusicEnd', data: { music_key: 'old-key' } });
    assert.equal(result.reason, 'stale-key');
    assert.deepEqual(calls, []);
});

test('event end trùng chỉ skip đúng một lần', async () => {
    const { controller, state, calls } = createController();
    state.currentSong = { id: 'song', title: 'Bài', isZyPage: true, sourceKeys: ['key-1'] };
    const event = { type: 'donateMusicEnd', data: { music_key: 'key-1' } };
    const first = await controller.handle(event);
    const second = await controller.handle(event);
    assert.equal(first.skipped, true);
    assert.equal(second.reason, 'duplicate');
    assert.deepEqual(calls, [['skip', false]]);
});
