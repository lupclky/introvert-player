'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PlaylistQueueService } = require('../services/playlist-queue-service');

function request(id = 'p1') {
  return {
    id, title: 'Playlist', donorName: 'Minh Anh', donationAmount: 1200000,
    totalDurationSec: 300, tracks: [
      { id: `${id}-1`, videoId: 'a', title: 'A', channelName: 'CA', durationSec: 100, status: 'queued' },
      { id: `${id}-2`, videoId: 'b', title: 'B', channelName: 'CB', durationSec: 200, status: 'queued' }
    ]
  };
}

test('playlist vào queue đúng thứ tự và không trùng', () => {
  let result = PlaylistQueueService.enqueue([{ id: 'single' }], request());
  assert.deepEqual(result.queue.map(song => song.id), ['single', 'p1-1', 'p1-2']);
  result = PlaylistQueueService.enqueue(result.queue, request());
  assert.equal(result.added.length, 0);
});

test('di chuyển playlist như một khối', () => {
  const songs = PlaylistQueueService.songsFromRequest(request());
  const moved = PlaylistQueueService.movePlaylist([
    { id: 'current' }, { id: 'single-a' }, ...songs, { id: 'single-b' }
  ], 'p1', 'up', 'current');
  assert.deepEqual(moved.map(song => song.id), ['current', 'p1-1', 'p1-2', 'single-a', 'single-b']);
});

test('bỏ playlist không ảnh hưởng bài đơn', () => {
  const songs = PlaylistQueueService.songsFromRequest(request());
  const result = PlaylistQueueService.removePlaylist([{ id: 'single' }, ...songs], 'p1');
  assert.deepEqual(result.map(song => song.id), ['single']);
});

test('di chuyển bài đơn không tách khối playlist', () => {
  const queue = [
    { id: 'single-a' },
    { id: 'p1', playlistRequestId: 'playlist-1', playlistTrackId: 'p1' },
    { id: 'p2', playlistRequestId: 'playlist-1', playlistTrackId: 'p2' },
    { id: 'single-b' }
  ];
  const moved = PlaylistQueueService.moveEntry(queue, 'single-b', 'up');
  assert.deepEqual(moved.map(song => song.id), ['single-a', 'single-b', 'p1', 'p2']);
});

test('khôi phục playlist giữ nguyên số thứ tự bài đã phát', () => {
  const request = {
    id: 'playlist-restart', acceptedItemCount: 3, tracks: [
      { id: 'done', status: 'played', videoId: 'aaaaaaaaaaa', title: 'Đã phát', durationSec: 10 },
      { id: 'next', status: 'queued', videoId: 'bbbbbbbbbbb', title: 'Tiếp', durationSec: 20 },
      { id: 'last', status: 'queued', videoId: 'ccccccccccc', title: 'Cuối', durationSec: 30 }
    ]
  };
  const songs = PlaylistQueueService.songsFromRequest(request);
  assert.deepEqual(songs.map(song => song.playlistPosition), [2, 3]);
  assert.deepEqual(songs.map(song => song.playlistTotalTracks), [3, 3]);
});

test('manual owner playlist keeps owner flags when converted to queue songs', () => {
  const value = request();
  value.source = 'manual_owner';
  value.originalMessage = 'https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890abc';
  const songs = PlaylistQueueService.songsFromRequest(value);
  assert.equal(songs[0].isOwnerAdd, true);
  assert.equal(songs[0].isQuickAdd, false);
  assert.equal(songs[0].message, '');
});

test('playlist đang phát luôn chọn video tiếp theo cùng nhóm trước bài nhiều tiền hơn', () => {
  const current = { id: 'p1-1', playlistRequestId: 'p1', playlistTrackId: 'p1-1' };
  const expensive = { id: 'single-expensive', amount: 9999999 };
  const playlistNext = { id: 'p1-2', playlistRequestId: 'p1', playlistTrackId: 'p1-2' };
  assert.equal(
    PlaylistQueueService.getNextSong([current, expensive, playlistNext], current).id,
    'p1-2'
  );
});

test('playlist đang phát được gom thành khối liên tục mà không đảo thứ tự nội bộ', () => {
  const current = { id: 'p1-1', playlistRequestId: 'p1', playlistTrackId: 'p1-1' };
  const queue = [
    current,
    { id: 'single-expensive' },
    { id: 'p1-2', playlistRequestId: 'p1', playlistTrackId: 'p1-2' },
    { id: 'single-normal' },
    { id: 'p1-3', playlistRequestId: 'p1', playlistTrackId: 'p1-3' }
  ];
  const result = PlaylistQueueService.prioritizeActivePlaylist(queue, current);
  assert.deepEqual(result.map(song => song.id), [
    'p1-1', 'p1-2', 'p1-3', 'single-expensive', 'single-normal'
  ]);
});
