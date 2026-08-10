'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { PlaylistRepository } = require('../services/playlist-repository');
const { PlaylistService } = require('../services/playlist-service');

function createService() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const repository = new PlaylistRepository(db);
  repository.migrate();
  const emitted = [];
  const provider = {
    calls: 0,
    async resolve(playlistId) {
      this.calls += 1;
      return {
        externalPlaylistId: playlistId,
        title: 'Playlist đêm', ownerName: 'Kênh A', thumbnailUrl: 'thumb', sourceItemCount: 3,
        tracks: [
          { position: 1, videoId: 'abcdefghijk', title: 'Bài 1', channelName: 'Kênh A', durationSec: 180, viewCount: 50000 },
          { position: 2, videoId: 'lmnopqrstuv', title: 'Bài 2', channelName: 'Kênh A', durationSec: 240, viewCount: 20000 },
          { position: 3, videoId: 'abcdefghijk', title: 'Bài trùng', channelName: 'Kênh A', durationSec: 180, viewCount: 50000 }
        ]
      };
    }
  };
  const service = new PlaylistService({ repository, provider, emit: (type, data) => emitted.push({ type, data }) });
  return { db, repository, provider, service, emitted };
}

const donation = {
  id: 'donation_service_1', name: 'Mèo Cam', amount: 1500000,
  message: '!playlist https://www.youtube.com/playlist?list=PL1234567890abc'
};

test('xử lý donation playlist trọn luồng và lọc video trùng', async () => {
  const fixture = createService();
  try {
    const result = await fixture.service.processDonation(donation);
    assert.equal(result.matched, true);
    assert.equal(result.request.status, 'ready');
    assert.equal(result.request.acceptedItemCount, 2);
    assert.equal(result.request.skippedItemCount, 1);
    assert.deepEqual(fixture.emitted.map(event => event.type), [
      'playlist.detected', 'playlist.validating', 'playlist.validating', 'playlist.validating', 'playlist.validating', 'playlist.accepted'
    ]);
    const filterEvent = fixture.emitted.find(event => event.data?.stage === 'filtered');
    assert.deepEqual(filterEvent.data.skippedReasons, { duplicate: 1 });
  } finally {
    fixture.db.close();
  }
});

test('Quick Add accepts a watch URL with list as a playlist', async () => {
  const fixture = createService();
  try {
    const result = await fixture.service.processManualPlaylist(
      'https://www.youtube.com/watch?v=22RqlqEWxpE&list=PLbscJlpbMW88&pp=sAgC',
      { donorName: 'Channel owner', donationAmount: 0, isOwnerAdd: true },
      { playlistEnabled: false, playlistAutoAccept: false, playlistMinimumDonationVnd: 999999999 }
    );
    assert.equal(result.matched, true);
    assert.equal(result.request.externalPlaylistId, 'PLbscJlpbMW88');
    assert.equal(result.request.source, 'manual_owner');
    assert.equal(result.request.status, 'ready');
    assert.equal(fixture.provider.calls, 1);
  } finally {
    fixture.db.close();
  }
});

test('donation chat accepts a watch URL with list as a playlist', async () => {
  const fixture = createService();
  try {
    const result = await fixture.service.processDonation({
      id: 'donation_watch_playlist',
      name: 'Viewer',
      amount: 1500000,
      message: 'Mở playlist này https://www.youtube.com/watch?v=22RqlqEWxpE&list=PLbscJlpbMW88&pp=sAgC'
    });
    assert.equal(result.matched, true);
    assert.equal(result.request.externalPlaylistId, 'PLbscJlpbMW88');
    assert.equal(result.request.status, 'ready');
    assert.equal(result.request.acceptedItemCount, 2);
    assert.equal(fixture.provider.calls, 1);
  } finally {
    fixture.db.close();
  }
});

test('official donation accepts a playlist URL supplied through songLink', async () => {
  const fixture = createService();
  try {
    const result = await fixture.service.processDonation({
      id: 'donation_song_link_playlist',
      name: 'Viewer',
      amount: 1500000,
      message: 'Mở nhạc giúp mình',
      songLink: 'https://www.youtube.com/watch?v=22RqlqEWxpE&list=PLbscJlpbMW88&pp=sAgC'
    });
    assert.equal(result.matched, true);
    assert.equal(result.request.externalPlaylistId, 'PLbscJlpbMW88');
    assert.equal(result.request.status, 'ready');
    assert.equal(fixture.provider.calls, 1);
  } finally {
    fixture.db.close();
  }
});

test('cùng donation không gọi provider và không enqueue lần hai', async () => {
  const fixture = createService();
  try {
    const first = await fixture.service.processDonation(donation);
    const second = await fixture.service.processDonation(donation);
    assert.equal(first.request.id, second.request.id);
    assert.equal(second.idempotent, true);
    assert.equal(fixture.provider.calls, 1);
  } finally {
    fixture.db.close();
  }
});

test('hoàn tất các track cập nhật request thành completed', async () => {
  const fixture = createService();
  try {
    const result = await fixture.service.processDonation(donation);
    const tracks = result.request.tracks.filter(track => track.status === 'queued');
    fixture.service.trackStarted(tracks[0].id);
    fixture.service.trackFinished(tracks[0].id, 'played');
    fixture.service.trackStarted(tracks[1].id);
    fixture.service.trackFinished(tracks[1].id, 'played');
    const stored = fixture.repository.getById(result.request.id);
    assert.equal(stored.status, 'completed');
    assert.equal(stored.playedDurationSec, 420);
    assert.equal(fixture.emitted.at(-1).type, 'playlist.completed');
  } finally {
    fixture.db.close();
  }
});
