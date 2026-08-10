'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PlaylistVoteSkipService = require('../services/playlist-vote-skip-service');

test('playlist vote skip only reduces its active playlist', () => {
  const song = { id: 'p1', playlistRequestId: 'playlist-a' };
  const state = {
    currentSong: song,
    playlistVoteSkip: { active: true, playlistRequestId: 'playlist-a', target: 10000, amount: 0, contributors: [] }
  };
  let reduced = 0;
  const service = new PlaylistVoteSkipService({
    getState: () => state,
    reducePlaylist: (current, playlistRequestId) => {
      reduced++;
      assert.equal(current, song);
      assert.equal(playlistRequestId, 'playlist-a');
      return { reduced: true, removedCount: 2, keptDuration: 120 };
    },
    updateUi: () => {}, notify: () => {}
  });
  assert.equal(service.apply({ id: 'd1', amount: 10000 }), true);
  assert.equal(reduced, 1);
  assert.equal(state.playlistVoteSkip.success, true);
});
