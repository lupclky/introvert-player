'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { PlaylistRepository } = require('../services/playlist-repository');

function createRepository() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const repository = new PlaylistRepository(db);
  repository.migrate();
  return { db, repository };
}

function requestFixture(overrides = {}) {
  const now = Date.now();
  return {
    id: 'playlist_req_1', donationId: 'donation_1', donorName: 'Mèo Cam',
    donationAmount: 1200000, originalMessage: '!playlist https://youtube.com/playlist?list=PL1234567890abc',
    source: 'youtube', externalPlaylistId: 'PL1234567890abc', title: '',
    status: 'received', rejectionReason: '', rejectionText: '', createdAt: now, updatedAt: now,
    ...overrides
  };
}

test('donation_id chỉ được claim một lần', () => {
  const { db, repository } = createRepository();
  try {
    assert.equal(repository.claim(requestFixture()).created, true);
    assert.equal(repository.claim(requestFixture({ id: 'playlist_req_duplicate' })).created, false);
    assert.equal(repository.getByDonationId('donation_1').id, 'playlist_req_1');
  } finally {
    db.close();
  }
});

test('khôi phục request và track còn hoạt động sau khi lưu', () => {
  const { db, repository } = createRepository();
  try {
    repository.claim(requestFixture());
    repository.saveResolved({
      ...requestFixture(), title: 'Nhạc đêm', ownerName: 'Pineapple', thumbnailUrl: 'thumb',
      sourceItemCount: 2, totalDurationSec: 330, status: 'ready'
    }, [
      { id: 'track_1', position: 1, videoId: 'abcdefghijk', title: 'Bài 1', channelName: 'Kênh A', durationSec: 150 },
      { id: 'track_2', position: 2, videoId: 'lmnopqrstuv', title: 'Bài 2', channelName: 'Kênh B', durationSec: 180 }
    ], []);
    const active = repository.listActive();
    assert.equal(active.length, 1);
    assert.equal(active[0].tracks.length, 2);
    assert.deepEqual(active[0].tracks.map(track => track.status), ['queued', 'queued']);
  } finally {
    db.close();
  }
});

