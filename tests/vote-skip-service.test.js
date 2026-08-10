'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const VoteSkipService = require('../services/vote-skip-service');
const PlaylistVoteSkipService = require('../services/playlist-vote-skip-service');

function createService(overrides = {}) {
  const state = overrides.state || {
    currentSong: { id: 'current', voteSkipActive: true, voteSkipTarget: 100000, voteAmount: 0 },
    queue: [], voteSkipDefaultAmount: 20000
  };
  const synced = [];
  const service = new VoteSkipService({
    getState: () => state,
    isDonationProcessed: () => false,
    markDonationProcessed: () => {},
    recordDonation: () => {},
    updateUi: () => {},
    syncOverlay: song => synced.push({ id: song.id, amount: song.voteAmount }),
    now: () => 1000,
    ...overrides.options
  });
  return { service, state, synced };
}

test('tiến trình Vote Skip được đồng bộ sang Overlay sau mỗi donate', () => {
  const { service, synced } = createService();
  assert.equal(service.apply({ id: 'd1', name: 'An', amount: 25000, timestamp: 1000 }), true);
  assert.deepEqual(synced, [{ id: 'current', amount: 25000 }]);
});

test('Vote Skip cộng donate nhưng không biến nó thành lệnh loại khỏi queue', () => {
  const song = { id: 'current', title: 'Bài hiện tại', voteSkipActive: true, voteSkipTarget: 100000, voteAmount: 0 };
  const state = { currentSong: song, queue: [song], voteSkipDefaultAmount: 20000 };
  const recorded = [];
  const service = new VoteSkipService({
    getState: () => state,
    recordDonation: donation => recorded.push(donation.id),
    syncOverlay: () => {}, updateUi: () => {}
  });
  assert.equal(service.apply({ id: 'donate-1', name: 'Mèo', amount: 50000 }), true);
  assert.equal(song.voteAmount, 50000);
  assert.deepEqual(recorded, ['donate-1']);
});

test('Vote Skip thành công gọi ngay cơ chế skip mặc định đúng một lần', () => {
  const song = { id: 'current', title: 'Bài hiện tại', voteSkipActive: true, voteSkipTarget: 10000, voteAmount: 0 };
  const state = { currentSong: song, queue: [song, { id: 'next' }], voteSkipDefaultAmount: 20000 };
  let skipped = 0;
  let controlCommands = 0;
  const service = new VoteSkipService({
    getState: () => state, syncOverlay: () => {}, updateUi: () => {}, notifySuccess: () => {},
    sendControl: () => { controlCommands++; }, skipSong: isManual => { assert.equal(isManual, false); skipped++; }
  });
  service.apply({ id: 'donate-2', name: 'Mèo', amount: 10000 });
  assert.equal(skipped, 1);
  assert.equal(controlCommands, 0);
});

test('Vote Skip bài hát không rút gọn playlist và vẫn dùng skip mặc định', () => {
  const song = { id: 'p1', playlistRequestId: 'playlist', voteSkipActive: true, voteSkipTarget: 10000, voteAmount: 0 };
  const state = {
    currentSong: song, queue: [song, { id: 'p2', playlistRequestId: 'playlist' }], voteSkipDefaultAmount: 20000,
    playlistVoteSkip: { active: true, playlistRequestId: 'playlist', target: 10000, amount: 0, contributors: [] }
  };
  let reduced = 0;
  let skipped = 0;
  const service = new VoteSkipService({
    getState: () => state, syncOverlay: () => {}, updateUi: () => {}, sendControl: () => {},
    reducePlaylist: () => { reduced++; return { reduced: true, removedCount: 1, keptDuration: 100 }; },
    notifyPlaylistReduced: () => {}, skipSong: () => { skipped++; }
  });
  assert.equal(service.apply({ id: 'donate-playlist', amount: 10000 }), true);
  assert.equal(reduced, 0);
  assert.equal(skipped, 1);
});
