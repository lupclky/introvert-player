const test = require('node:test');
const assert = require('node:assert/strict');
const TaskbarNotificationService = require('../services/taskbar-notification-service');

test('taskbar service formats playlist notifications and deduplicates them', async () => {
    const shown = [];
    const service = new TaskbarNotificationService({ show: (...args) => shown.push(args), now: () => 100 });
    const donation = { name: 'Mèo', amount: 1500000, message: 'xem nhé https://youtube.test/list', isPlaylistDonation: true, playlistTitle: 'Mix', playlistTotalTracks: 8 };
    const context = { shouldAlert: true, isStartupSync: false };
    assert.equal(await service.notify(donation, context), true);
    assert.equal(await service.notify(donation, context), false);
    assert.equal(shown.length, 1);
    assert.match(shown[0][1], /\[PLAYLIST\] Mix/);
    assert.match(shown[0][1], /8 video/);
});

test('taskbar service resolves missing song titles through metadata service', async () => {
    const shown = [];
    const service = new TaskbarNotificationService({
        show: (...args) => shown.push(args),
        hasSongLink: () => true,
        parseYoutubeId: () => 'abc',
        fetchMetadata: async () => ({ title: 'Tên bài' })
    });
    const donation = { name: 'A', amount: 100000, message: 'https://youtube.test/watch', songLink: 'https://youtube.test/watch' };
    await service.notify(donation, { shouldAlert: true, isStartupSync: false, minimumAmount: 50000 });
    assert.match(shown[0][1], /\[MUSIC\] Tên bài/);
    assert.equal(donation.title, 'Tên bài');
});

test('taskbar service suppresses startup synchronization', async () => {
    let shown = false;
    const service = new TaskbarNotificationService({ show: () => { shown = true; } });
    assert.equal(await service.notify({ name: 'A' }, { shouldAlert: true, isStartupSync: true, isTestDonate: false }), false);
    assert.equal(shown, false);
});
