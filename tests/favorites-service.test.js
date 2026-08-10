const test = require('node:test');
const assert = require('node:assert/strict');
const FavoritesService = require('../services/favorites-service');

function storage(initial = {}) {
    const values = { ...initial };
    return { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, values };
}

test('favorites toggle persists additions and removals', () => {
    const store = storage();
    const service = new FavoritesService({ storage: store, now: () => 10, random: () => 0.5, formatTime: value => `${value}s` });
    assert.equal(service.toggle({ videoId: 'abc', title: 'Song', duration: 90 }).action, 'added');
    assert.equal(service.has({ videoId: 'abc' }), true);
    assert.equal(service.items[0].duration, '90s');
    assert.equal(service.toggle({ videoId: 'abc' }).action, 'removed');
    assert.deepEqual(JSON.parse(store.values.dua_favorites), []);
});

test('favorites context, external URL and queue conversion are media aware', () => {
    const service = new FavoritesService({ storage: storage(), items: [{ soundcloudUrl: 'https://soundcloud.test/x', title: 'X', duration: '3:20' }], now: () => 20, random: () => 0.25, parseDuration: () => 200 });
    assert.equal(service.contextKey(service.items[0]), 'soundcloud:https://soundcloud.test/x');
    assert.equal(service.externalUrl(service.items[0]), 'https://soundcloud.test/x');
    const song = service.createQueueSong(service.items[0]);
    assert.equal(song.duration, 200);
    assert.equal(song.isOwnerAdd, true);
    assert.equal(song.amount, 0);
});
