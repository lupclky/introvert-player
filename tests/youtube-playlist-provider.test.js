'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { YouTubePlaylistProvider, durationTextToSeconds } = require('../services/youtube-playlist-provider');
const { selectTracksWithinDuration } = require('../services/playlist-policy');

test('đổi thời lượng YouTube sang giây', () => {
  assert.equal(durationTextToSeconds('4:05'), 245);
  assert.equal(durationTextToSeconds('1:02:03'), 3723);
  assert.equal(durationTextToSeconds('LIVE'), 0);
});

test('trích metadata và thứ tự video từ ytInitialData', async () => {
  const data = {
    playlistMetadataRenderer: { title: 'Playlist thử nghiệm' },
    playlistSidebarSecondaryInfoRenderer: {
      videoOwner: { videoOwnerRenderer: { title: { simpleText: 'Kênh thử nghiệm' } } }
    },
    contents: [
      { playlistVideoRenderer: {
        videoId: 'abcdefghijk', title: { simpleText: 'Bài một' },
        shortBylineText: { runs: [{ text: 'Kênh A' }] }, lengthText: { simpleText: '3:10' },
        thumbnail: { thumbnails: [{ url: 'thumb-1' }] }
      } },
      { playlistVideoRenderer: {
        videoId: 'lmnopqrstuv', title: { simpleText: 'Bài hai' },
        shortBylineText: { runs: [{ text: 'Kênh B' }] }, lengthText: { simpleText: '4:20' },
        thumbnail: { thumbnails: [{ url: 'thumb-2' }] }
      } }
    ]
  };
  const provider = new YouTubePlaylistProvider({ fetchPlaylistData: async () => data });
  const result = await provider.resolve('PL1234567890abc');
  assert.equal(result.title, 'Playlist thử nghiệm');
  assert.equal(result.ownerName, 'Kênh thử nghiệm');
  assert.deepEqual(result.tracks.map(track => track.videoId), ['abcdefghijk', 'lmnopqrstuv']);
  assert.deepEqual(result.tracks.map(track => track.durationSec), [190, 260]);
});

test('lấy lượt xem từng video trước khi lọc playlist', async () => {
  const data = { contents: [
    { playlistVideoRenderer: { videoId: 'abcdefghijk', title: { simpleText: 'Ít view' }, lengthText: { simpleText: '3:00' } } },
    { playlistVideoRenderer: { videoId: 'lmnopqrstuv', title: { simpleText: 'Đủ view' }, lengthText: { simpleText: '4:00' } } }
  ] };
  const stats = { abcdefghijk: 9999, lmnopqrstuv: 10000 };
  const provider = new YouTubePlaylistProvider({
    fetchPlaylistData: async () => data,
    fetchVideoStats: async videoId => ({ viewCount: stats[videoId] })
  });
  const playlist = await provider.resolve('PL1234567890abc');
  const selection = selectTracksWithinDuration(playlist.tracks, {
    playlistMaximumDurationSec: 4200,
    playlistMaximumItemsToResolve: 50,
    minimumViewCount: 10000
  });
  assert.deepEqual(selection.accepted.map(track => track.videoId), ['lmnopqrstuv']);
  assert.equal(selection.skipped[0].skipReason, 'below_minimum_views');
});
