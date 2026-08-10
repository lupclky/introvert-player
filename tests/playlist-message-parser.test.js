'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlaylistDonationMessage } = require('../services/playlist-message-parser');

const PLAYLIST_ID = 'PL1234567890abc';

test('nhận URL /playlist?list và bỏ tracking parameters', () => {
  const result = parsePlaylistDonationMessage(`Mở giúp https://www.youtube.com/playlist?list=${PLAYLIST_ID}&si=tracking&utm_source=x`);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.playlistId, PLAYLIST_ID);
  assert.equal(result.normalizedUrl, `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`);
});

test('nhận URL ngay sau !playlist', () => {
  const result = parsePlaylistDonationMessage(`!playlist https://www.youtube.com/watch?v=abc12345678&list=${PLAYLIST_ID}`);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.commanded, true);
  assert.equal(result.playlistId, PLAYLIST_ID);
});

test('watch có list trong nội dung donate được nhận là playlist', () => {
  const result = parsePlaylistDonationMessage(`https://www.youtube.com/watch?v=abc12345678&list=${PLAYLIST_ID}`);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.commanded, false);
  assert.equal(result.playlistId, PLAYLIST_ID);
  assert.equal(result.normalizedUrl, `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`);
});

test('watch có Mix RD tự sinh được giữ là bài đơn khi không có lệnh playlist', () => {
  const result = parsePlaylistDonationMessage('https://www.youtube.com/watch?v=BZqfL_2CzKg&list=RDBZqfL_2CzKg&start_radio=1');
  assert.equal(result.matched, false);
  assert.equal(result.kind, 'none');
});

test('nhiều URL không có command chuyển pending review', () => {
  const result = parsePlaylistDonationMessage(`https://youtu.be/abc12345678 https://youtube.com/playlist?list=${PLAYLIST_ID}`);
  assert.equal(result.kind, 'pending_review');
  assert.equal(result.reason, 'ambiguous_urls');
  assert.equal(result.candidatePlaylistId, PLAYLIST_ID);
});

test('nhiều URL có command chọn URL ngay sau command', () => {
  const result = parsePlaylistDonationMessage(`https://youtu.be/abc12345678 !playlist https://youtube.com/playlist?list=${PLAYLIST_ID}`);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.playlistId, PLAYLIST_ID);
});

test('URL lỗi sau command chuyển pending review', () => {
  const result = parsePlaylistDonationMessage('!playlist https://example.com/not-youtube');
  assert.equal(result.kind, 'pending_review');
  assert.equal(result.reason, 'invalid_playlist_url');
});

test('gop URL playlist trung khi ban hien thi dung HTML entity', () => {
  const encoded = 'https://www.youtube.com/watch?v=22RqlqEWxpE&amp;list=PLbscJlpbMW88&amp;pp=sAgC';
  const plain = 'https://www.youtube.com/watch?v=22RqlqEWxpE&list=PLbscJlpbMW88&pp=sAgC';
  const result = parsePlaylistDonationMessage(`${encoded}\n${plain}`);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.commanded, false);
  assert.equal(result.playlistId, 'PLbscJlpbMW88');
  assert.equal(result.normalizedUrl, 'https://www.youtube.com/playlist?list=PLbscJlpbMW88');
});

test('nhan playlist khi noi dung con nguyen cu phap Markdown', () => {
  const encoded = 'https://www.youtube.com/watch?v=22RqlqEWxpE&amp;list=PLbscJlpbMW88&amp;pp=sAgC';
  const plain = 'https://www.youtube.com/watch?v=22RqlqEWxpE&list=PLbscJlpbMW88&pp=sAgC';
  const result = parsePlaylistDonationMessage(`[${encoded}](${encoded})\n[**${plain}**](${plain})`);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.playlistId, 'PLbscJlpbMW88');
});
