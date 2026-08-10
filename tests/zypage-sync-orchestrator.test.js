'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageSyncOrchestrator = require('../services/zypage-sync-orchestrator');
const ZyPageSyncCoordinator = require('../services/zypage-sync-coordinator');

function createOrchestrator(overrides = {}) {
    const calls = [];
    const snapshot = {
        contents: {},
        musicList: { musicRow: { music: { id: 'yt' } } },
        plainDonateList: { donateRow: { text: 'https://youtube.com/watch?v=x' } },
        musicKeys: ['musicRow'],
        plainKeys: ['donateRow']
    };
    const normalizedMusic = {
        liveEvent: { music: { url: 'https://youtube.com/watch?v=x' }, amount: 100000 },
        realTimestamp: 200,
        donation: { name: 'A' }
    };
    const normalizedPlain = {
        liveEvent: { message: 'https://youtube.com/watch?v=y', amount: 50000 },
        realTimestamp: 300,
        donation: { name: 'B' },
        message: 'https://youtube.com/watch?v=y'
    };
    const orchestrator = new ZyPageSyncOrchestrator({
        coordinator: new ZyPageSyncCoordinator(),
        snapshotService: {
            buildUrl: () => 'https://api.test',
            fetchSnapshot: async () => snapshot
        },
        itemProcessor: {
            normalizeMusicItem: () => normalizedMusic,
            normalizePlainItem: () => normalizedPlain,
            isTimestampEligible: () => true,
            hasMatchingMusicTransaction: () => false
        },
        ingestionService: {
            ingestOfficial: async () => ({ inserted: true }),
            ingestMessage: async () => ({ inserted: true })
        },
        commandService: { process: async () => ({ playlistHandled: false, extended: false, voteSkipped: false }) },
        beforeSync: async () => calls.push('before'),
        hasSongLink: () => true,
        setLastSyncedTimestamp: value => calls.push(['timestamp', value]),
        refreshQueue: () => calls.push('refresh'),
        playIfIdle: () => calls.push('play'),
        log: () => {},
        ...overrides
    });
    return { orchestrator, calls };
}

test('orchestrator xử lý music/plain và chỉ render queue một lần', async () => {
    const { orchestrator, calls } = createOrchestrator();
    const result = await orchestrator.sync({
        shopId: '1', domain: 'https://zypage.com', lastSyncedTimestamp: 100, minimumAmount: 49000
    });
    assert.equal(result.addedCount, 2);
    assert.deepEqual(calls, ['before', ['timestamp', 300], 'refresh', 'play']);
});

test('playlist đã xử lý không chèn lại bài đơn', async () => {
    let ingested = false;
    const { orchestrator } = createOrchestrator({
        commandService: { process: async () => ({ playlistHandled: true, extended: false, voteSkipped: false }) },
        ingestionService: {
            ingestOfficial: async () => { ingested = true; return { inserted: true }; },
            ingestMessage: async () => { ingested = true; return { inserted: true }; }
        }
    });
    const result = await orchestrator.sync({ shopId: '1', domain: 'x' });
    assert.equal(ingested, false);
    assert.equal(result.addedCount, 0);
});

test('yêu cầu sync trong lúc đang chạy được xếp lại đúng một lần', async () => {
    const coordinator = new ZyPageSyncCoordinator();
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const pending = [];
    const { orchestrator } = createOrchestrator({
        coordinator,
        beforeSync: () => wait,
        schedule: callback => callback(),
        onPendingSync: request => pending.push(request)
    });
    const first = orchestrator.sync({ shopId: 'first', domain: 'x' });
    const second = await orchestrator.sync({ shopId: 'second', domain: 'x', isManual: true });
    assert.equal(second.queued, true);
    release();
    await first;
    assert.deepEqual(pending, [{ shopId: 'second', isManual: true }]);
});
