'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SyncedLyricsService } = require('../services/synced-lyrics-service');

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[String(name).toLowerCase()] || null },
    json: async () => body
  };
}

function createService(overrides = {}) {
  const requests = [];
  const service = new SyncedLyricsService({
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return overrides.fetchImpl(url, options);
    },
    now: () => 1000,
    logger: { warn() {} },
    clientVersion: '26.8.12',
    ...overrides.options
  });
  return { service, requests };
}

test('phân tích LRC có nhiều timestamp và sắp xếp đúng thời gian', () => {
  const lines = SyncedLyricsService.parseSyncedLyrics('[ar:Artist]\n[00:10.50][00:20.500] Xin chào\n[00:05.05] Mở đầu');
  assert.deepEqual(lines, [
    { time: 5.05, text: 'Mở đầu' },
    { time: 10.5, text: 'Xin chào' },
    { time: 20.5, text: 'Xin chào' }
  ]);
});

test('phiên âm Hangul sang chữ Latin và giữ nguyên phần tiếng Anh', () => {
  assert.equal(SyncedLyricsService.romanizeKoreanText('사랑해 baby'), 'saranghae baby');
  assert.equal(SyncedLyricsService.romanizeKoreanText('한국어'), 'hangugeo');
  assert.equal(SyncedLyricsService.romanizeKoreanText('English only'), 'English only');
});

test('lyrics tiếng Hàn ưu tiên phiên âm và vẫn giữ lời gốc trong dữ liệu', () => {
  const result = SyncedLyricsService.preferKoreanRomanization([
    { time: 1, text: '오늘도 너를 사랑해' },
    { time: 3, text: 'English line' }
  ]);
  assert.equal(result.romanized, true);
  assert.equal(result.lines[0].text, 'oneuldo neoreul saranghae');
  assert.equal(result.lines[0].originalText, '오늘도 너를 사랑해');
  assert.equal(result.lines[1].text, 'English line');
  assert.equal(result.lines[1].originalText, undefined);
});

test('video Topic dùng metadata Apple rồi lấy lyrics đồng bộ từ LRCLIB', async () => {
  const { service, requests } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song (Official Audio)', author_name: 'Singer - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [{ kind: 'song', trackName: 'Song', artistName: 'Singer', collectionName: 'Album', trackTimeMillis: 180000 }] });
      if (value.includes('lrclib.net/api/get')) return response(200, { trackName: 'Song', artistName: 'Singer', albumName: 'Album', duration: 180, syncedLyrics: '[00:01.00] First\n[00:03.25] Second' });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Song', author: 'Singer', duration: 180 });
  assert.equal(result.available, true);
  assert.equal(result.metadataSource, 'apple-itunes');
  assert.deepEqual(result.lines, [{ time: 1, text: 'First' }, { time: 3.25, text: 'Second' }]);
  assert.ok(requests.some(item => item.options.headers['Lrclib-Client'] === 'IntrovertPlayer/26.8.12'));
});

test('video Topic tiếng Hàn trả phiên âm làm lời hiển thị ưu tiên', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: '노래', author_name: '가수 - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, {
        trackName: '노래', artistName: '가수', duration: 180,
        syncedLyrics: '[00:01.00] 오늘도 너를 사랑해\n[00:03.00] English line'
      });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: '노래', duration: 180 });
  assert.equal(result.available, true);
  assert.equal(result.romanized, true);
  assert.equal(result.source, 'Phiên âm · LRCLIB');
  assert.equal(result.lines[0].text, 'oneuldo neoreul saranghae');
  assert.equal(result.lines[0].originalText, '오늘도 너를 사랑해');
});

test('không gọi Apple và LRCLIB cho video không phải Topic', async () => {
  const { service, requests } = createService({
    fetchImpl: async url => {
      assert.match(String(url), /youtube\.com\/oembed/);
      return response(200, { title: 'Normal video', author_name: 'Normal channel' });
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Normal video', duration: 120 });
  assert.deepEqual(result, { available: false, eligible: false, reason: 'unsupported_source' });
  assert.equal(requests.length, 1);
});

test('tìm kiếm LRCLIB dự phòng khi chữ ký chính xác trả về 404', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Track', author_name: 'Artist - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) return response(200, [{ trackName: 'Track', artistName: 'Artist', duration: 201, syncedLyrics: '[00:02.00] Found' }]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Track', duration: 200 });
  assert.equal(result.available, true);
  assert.equal(result.lines[0].text, 'Found');
});

test('tìm kiếm LRCLIB dự phòng khi endpoint chính xác trả về 400', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Track', author_name: 'Artist – Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(400, { message: 'invalid duration' });
      if (value.includes('lrclib.net/api/search')) return response(200, [{ trackName: 'Track', artistName: 'Artist', duration: 201, syncedLyrics: '[00:02.00] Found' }]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Track', duration: 0 });
  assert.equal(result.available, true);
  assert.equal(result.lines[0].text, 'Found');
});

test('cache tránh gọi lại API ngoài cho cùng một bài', async () => {
  const { service, requests } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song', author_name: 'Singer - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      return response(200, { trackName: 'Song', artistName: 'Singer', duration: 180, syncedLyrics: '[00:01.00] Line' });
    }
  });
  const song = { videoId: 'abcdefghijk', title: 'Song', duration: 180 };
  const first = await service.resolve(song);
  const callsAfterFirst = requests.length;
  const second = await service.resolve(song);
  assert.equal(first.available, true);
  assert.equal(second.cached, true);
  assert.equal(requests.length, callsAfterFirst);
});

test('loại bản lyrics chỉ có vài timestamp và chọn bản đầy đủ hơn', async () => {
  const incomplete = {
    trackName: 'Blue Valentine', artistName: 'NMIXX', duration: 186,
    plainLyrics: 'A complete lyric '.repeat(80),
    syncedLyrics: '[00:00.00] Intro\n[00:06.17] First line'
  };
  const completeLines = Array.from({ length: 40 }, (_, index) => `[${String(Math.floor(index * 4 / 60)).padStart(2, '0')}:${String(index * 4 % 60).padStart(2, '0')}.00] Line ${index + 1}`).join('\n');
  const complete = {
    trackName: 'Blue Valentine', artistName: 'NMIXX', duration: 186,
    plainLyrics: Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`).join('\n'),
    syncedLyrics: completeLines
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Blue Valentine', author_name: 'NMIXX - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, incomplete);
      if (value.includes('lrclib.net/api/search')) return response(200, [incomplete, complete]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Blue Valentine', duration: 186 });
  assert.equal(result.available, true);
  assert.equal(result.lines.length, 40);
  assert.equal(result.lines.at(-1).text, 'Line 40');
});
