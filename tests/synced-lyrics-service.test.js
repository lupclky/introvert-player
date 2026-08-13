'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SyncedLyricsService } = require('../services/synced-lyrics-service');

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[String(name).toLowerCase()] || null },
    json: async () => body,
    text: async () => String(body || '')
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

test('link YouTube Music được nhận diện dù kênh không có hậu tố Topic', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song', author_name: 'Official Artist' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, { trackName: 'Song', artistName: 'Official Artist', duration: 180, syncedLyrics: '[00:01.00] Found' });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: 'abcdefghijk', title: 'Song', author: 'Official Artist', duration: 180,
    sourceUrl: 'https://music.youtube.com/watch?v=abcdefghijk'
  });
  assert.equal(result.available, true);
  assert.equal(result.metadataSource, 'youtube-music');
});

test('video YouTube thường không ghép lyrics dù tiêu đề giống bài hát chính thức', async () => {
  const { service, requests } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Artist - Song (Official Music Video)', author_name: 'Artist Official' });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: 'abcdefghijk', title: 'Artist - Song (Official Music Video)', duration: 180,
    sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
  });
  assert.deepEqual(result, { available: false, eligible: false, reason: 'unsupported_source' });
  assert.equal(requests.length, 1);
});

test('kết quả lyrics dùng service phiên âm Nhật Trung trước khi gửi tới giao diện', async () => {
  const service = new SyncedLyricsService({
    fetchImpl: async () => response(404, {}),
    lyricsRomanizationService: {
      romanizeLines: async lines => ({
        romanized: true,
        language: 'ja',
        lines: lines.map(line => ({ ...line, originalText: line.text, text: 'watashi wa utau' }))
      })
    }
  });
  const result = await service.createResolvedResult({
    source: 'LRCLIB', synced: true, duration: 180,
    trackName: '歌', artistName: '歌手', lines: [{ time: 1, text: '私は歌う' }]
  }, { source: 'youtube', title: '歌', artist: '歌手', duration: 180 });
  assert.equal(result.source, 'Phiên âm · LRCLIB');
  assert.equal(result.romanized, true);
  assert.equal(result.romanizationLanguage, 'ja');
  assert.equal(result.lines[0].text, 'watashi wa utau');
  assert.equal(result.lines[0].originalText, '私は歌う');
});

test('tìm kiếm LRCLIB dự phòng khi chữ ký chính xác trả về 404', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Track', author_name: 'Artist - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) return response(200, [{ trackName: 'Track', artistName: 'Artist', duration: 200, syncedLyrics: '[00:02.00] Found' }]);
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
  assert.equal(result.available, false);
  assert.equal(result.reason, 'missing_duration');
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

test('khong de iTunes doi nham sang bai khac cung nghe si va gan thoi luong', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) {
        return response(200, { title: 'Ai \u0110\u01b0a Em V\u1ec1', author_name: 'Tia Hai Chau - Topic' });
      }
      if (value.includes('itunes.apple.com/search')) {
        return response(200, { results: [{
          kind: 'song', trackName: 'Mu\u1ed1n C\u00f3 Anh (i \u00e0 \u00ed a)', artistName: 'Tia H\u1ea3i Ch\u00e2u',
          collectionName: 'Mu\u1ed1n C\u00f3 Anh - Single', trackTimeMillis: 229013
        }] });
      }
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) return response(200, [{
        id: 24737587, trackName: 'Ai \u0110\u01b0a Em V\u1ec1', artistName: 'Tia H\u1ea3i Ch\u00e2u, L\u00ea Thi\u1ec7n Hi\u1ebfu',
        duration: 233, syncedLyrics: '[00:01.00] D\u00f2ng th\u1ee9 nh\u1ea5t\n[00:04.00] D\u00f2ng th\u1ee9 hai'
      }]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: 'C5iRmXKydxk', title: 'Ai \u0110\u01b0a Em V\u1ec1', author: 'Tia Hai Chau - Topic', duration: 233,
    sourceUrl: 'https://music.youtube.com/watch?v=C5iRmXKydxk'
  });
  assert.equal(result.available, true);
  assert.equal(result.metadataSource, 'youtube-music');
  assert.equal(result.trackName, 'Ai \u0110\u01b0a Em V\u1ec1');
});

test('mo rong tim LRCLIB theo ten bai khi ten nghe si YouTube khong khop', async () => {
  const { service, requests } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Track Name', author_name: 'Alias - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) {
        const parsed = new URL(value);
        if (parsed.searchParams.has('artist_name')) return response(200, []);
        return response(200, [{ id: 99, trackName: 'Track Name', artistName: 'Canonical Artist', duration: 180, syncedLyrics: '[00:01.00] Found' }]);
      }
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Track Name', duration: 180 });
  assert.equal(result.available, true);
  assert.ok(requests.some(item => {
    const parsed = new URL(item.url);
    return parsed.hostname === 'lrclib.net'
      && parsed.pathname === '/api/search'
      && parsed.searchParams.has('track_name')
      && !parsed.searchParams.has('artist_name');
  }));
});

test('YouTube Music giu ten goc khi iTunes tra ve ban featuring khac', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) {
        return response(200, { title: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', author_name: 'Juky San - Topic' });
      }
      if (value.includes('itunes.apple.com/search')) {
        return response(200, { results: [{
          kind: 'song', trackName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean (feat. LAMOON)', artistName: 'Juky San',
          collectionName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean (feat. LAMOON) - Single', trackTimeMillis: 216417
        }] });
      }
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) {
        const parsed = new URL(value);
        assert.equal(parsed.searchParams.get('track_name'), 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean');
        return response(200, [{
          id: 25873073, trackName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', artistName: 'Juky San', albumName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean',
          duration: 216, syncedLyrics: '[00:17.00] L\u00e0 ng\u01b0\u1eddi \u0111\u1ea7u ti\u00ean c\u1ea7m tay\n[00:21.00] L\u00e0 ng\u01b0\u1eddi \u0111\u1ea7u ti\u00ean \u00f4m em'
        }]);
      }
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: '0B5ayAe3R3s', title: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', author: 'Juky San - Topic', duration: 216,
    sourceUrl: 'https://music.youtube.com/watch?v=0B5ayAe3R3s'
  });
  assert.equal(result.available, true);
  assert.equal(result.metadataSource, 'youtube-music');
  assert.equal(result.trackName, 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean');
  assert.equal(result.duration, 216);
});

test('uu tien ban lyrics co ten loi va thoi luong trung khop', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Example Song', author_name: 'Example Artist - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) return response(200, [
        { id: 1, trackName: 'Example Song', artistName: 'Example Artist', duration: 260, syncedLyrics: '[00:01.00] Wrong version' },
        { id: 2, trackName: 'Example Song (Acoustic Version)', artistName: 'Example Artist', duration: 200, syncedLyrics: '[00:01.00] Correct version' }
      ]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Example Song', duration: 200 });
  assert.equal(result.available, true);
  assert.equal(result.duration, 200);
  assert.equal(result.lines[0].text, 'Correct version');
});

test('phân tích TTML dòng và giải mã XML entity', () => {
  const lines = SyncedLyricsService.parseTtmlLyrics(`
    <tt><body><div>
      <p begin="00:00:03.250" end="00:00:05.000">Xin &amp; chào</p>
      <p begin="6.5s" end="8s"><span>Thế giới</span></p>
    </div></body></tt>
  `);
  assert.deepEqual(lines, [
    { time: 3.25, text: 'Xin & chào' },
    { time: 6.5, text: 'Thế giới' }
  ]);
});

test('các nguồn synced chạy đồng thời và dùng kết quả hợp lệ về đầu tiên', async () => {
  const syncedRequests = [];
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song (Official Audio)', author_name: 'Singer - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('unison.boidu.dev') || value.includes('lyrics-api.binimum.org') || value.includes('lyrics-storage.binimum.org')) {
        syncedRequests.push(value);
        return response(404, {});
      }
      if (value.includes('lrclib.net/api/get')) return response(200, { trackName: 'Song', artistName: 'Singer', duration: 180, syncedLyrics: '[00:01.00] LRCLIB line' });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Song', author: 'Singer - Topic', duration: 180 });
  assert.equal(result.available, true);
  assert.equal(result.source, 'LRCLIB');
  assert.deepEqual(result.lines, [{ time: 1, text: 'LRCLIB line' }]);
  assert.equal(syncedRequests.some(url => url.includes('unison.boidu.dev')), true);
  assert.equal(syncedRequests.some(url => url.includes('lyrics-api.binimum.org')), true);
});

test('hai nguồn về gần nhau ưu tiên duration sát video đang phát nhất', async () => {
  const { service } = createService({
    options: { syncedRaceWindowMs: 50 },
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song (Official Audio)', author_name: 'Singer - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  service.resolveLrclib = async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { trackName: 'Song', artistName: 'Singer', duration: 179.2, syncedLyrics: '[00:01.00] Faster but less exact' };
  };
  service.resolveUnison = async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return { source: 'Unison', trackName: 'Song', artistName: 'Singer', duration: 180, lines: [{ time: 1, text: 'Closest duration' }] };
  };
  service.resolveLyricsPlus = service.resolveBiniLyrics = service.resolveYouTubeCaptions = service.resolveMusixmatch = async () => null;

  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Song', author: 'Singer - Topic', duration: 180 });
  assert.equal(result.source, 'Unison');
  assert.deepEqual(result.lines, [{ time: 1, text: 'Closest duration' }]);
});

test('lyrics không timestamp chỉ chạy sau khi mọi nguồn synced thất bại', async () => {
  const { service } = createService({
    options: { syncedRaceWindowMs: 0 },
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song (Official Audio)', author_name: 'Singer - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  let pendingSynced = 6;
  const miss = async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    pendingSynced--;
    return null;
  };
  service.resolveLrclib = service.resolveLyricsPlus = service.resolveUnison = service.resolveBiniLyrics = service.resolveYouTubeCaptions = service.resolveMusixmatch = miss;
  service.resolveYouTubeMusicPlainLyrics = async (_videoId, identity) => {
    assert.equal(pendingSynced, 0);
    return { source: 'YouTube Music', synced: false, duration: identity.duration, lines: [{ time: 0, text: 'Plain' }] };
  };

  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Song', author: 'Singer - Topic', duration: 180 });
  assert.equal(result.synced, false);
  assert.equal(result.source, 'YouTube Music');
});

test('cascade ưu tiên Unison được gắn đúng videoId', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Song (Official Audio)', author_name: 'Singer - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('unison.boidu.dev')) return response(200, { data: { id: 7, videoId: 'abcdefghijk', song: 'Song', artist: 'Singer', format: 'lrc', lyrics: '[00:02.00] Unison line' } });
      if (value.includes('lyrics-api.binimum.org')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, {});
      if (value.includes('lrclib.net/api/search')) return response(200, []);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Song', author: 'Singer - Topic', duration: 180 });
  assert.equal(result.source, 'Unison');
  assert.deepEqual(result.lines, [{ time: 2, text: 'Unison line' }]);
});

test('Topic thiếu tên kênh dùng metadata dự phòng và nhận lyrics Musixmatch', async () => {
  const lrc = Array.from({ length: 24 }, (_item, index) => {
    const seconds = 12 + index * 11;
    return `[${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.00] Line ${index + 1}`;
  }).join('\n');
  const { service } = createService({
    options: {
      resolveYouTubeMetadata: async () => ({
        title: 'SECRET (Feat. Quang Hùng MasterD, Cody Nam Võ, CongB, Wren Evans)',
        artist: 'TINH HÀ "SAY HI", Quang Hùng MasterD, Cody Nam Võ, CongB, Wren Evans',
        album: 'TINH HÀ "SAY HI", TẬP 6',
        description: 'Auto-generated by YouTube.',
        duration: 281,
        source: 'yt-dlp'
      })
    },
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'SECRET (Feat. Quang Hùng MasterD, Cody Nam Võ, CongB, Wren Evans)', author_name: ' - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [{ kind: 'song', trackName: 'SECRET (feat. Quang Hùng MasterD, CODYNAMVO, CONGB & Wren Evans)', artistName: 'TINH HÀ "SAY HI"', collectionName: 'TINH HÀ "SAY HI", TẬP 6', trackTimeMillis: 280560 }] });
      if (value.includes('unison.boidu.dev')) return response(404, {});
      if (value.includes('lyrics-api.binimum.org')) return response(404, {});
      if (value.includes('lrclib.net/api/get')) return response(404, {});
      if (value.includes('lrclib.net/api/search')) return response(200, []);
      if (value.includes('token.get')) return response(200, { message: { header: { status_code: 200 }, body: { user_token: 'temporary-token' } } });
      if (value.includes('matcher.track.get')) return response(200, { message: { header: { status_code: 200 }, body: { track: { track_id: 458367901, track_name: 'SECRET', artist_name: 'TINH HÀ "SAY HI"', album_name: 'TINH HÀ "SAY HI", TẬP 6', track_length: 0, has_subtitles: 1, track_isrc: 'VNA0R2602500' } } } });
      if (value.includes('track.subtitle.get')) return response(200, { message: { header: { status_code: 200 }, body: { subtitle: { subtitle_body: lrc } } } });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'YI1d0klj8J0', sourceUrl: 'https://music.youtube.com/watch?v=YI1d0klj8J0' });
  assert.equal(result.available, true);
  assert.equal(result.source, 'Musixmatch');
  assert.equal(result.duration, 281);
  assert.equal(result.lines.length, 24);
});

test('kenh Release dung metadata phat hanh de xu ly lyrics nhu Topic', async () => {
  const { service } = createService({
    options: {
      resolveYouTubeMetadata: async () => ({
        title: 'Release Song', artist: 'Real Artist', album: 'Release Album',
        duration: 180, isReleaseMetadata: true, source: 'yt-dlp'
      })
    },
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Release Song', author_name: 'Release' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, {
        trackName: 'Release Song', artistName: 'Real Artist', albumName: 'Release Album', duration: 180,
        syncedLyrics: '[00:10.00] First line\n[00:30.00] Second line'
      });
      throw new Error(`unexpected url: ${value}`);
    }
  });

  const result = await service.resolve({
    videoId: 'abcdefghijk', title: 'Release Song', author: 'Release', duration: 180,
    sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
  });

  assert.equal(result.available, true);
  assert.equal(result.source, 'LRCLIB');
  assert.equal(result.artistName, 'Real Artist');
});

test('kenh Release khong mo lyrics neu metadata khong xac nhan ban phat hanh', async () => {
  const { service } = createService({
    options: {
      resolveYouTubeMetadata: async () => ({
        title: 'Normal Upload', artist: 'Uploader', duration: 180,
        isReleaseMetadata: false, source: 'yt-dlp'
      })
    },
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Normal Upload', author_name: 'Release' });
      throw new Error(`unexpected url: ${value}`);
    }
  });

  const result = await service.resolve({
    videoId: 'abcdefghijk', title: 'Normal Upload', author: 'Release', duration: 180,
    sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
  });
  assert.deepEqual(result, { available: false, eligible: false, reason: 'unsupported_source' });
});

test('Topic dùng ISRC đã xác minh để lấy LyricsPlus khi Musixmatch bị CAPTCHA', async () => {
  const { service } = createService({
    options: {
      resolveTrackIsrc: async song => song.videoId === 'YI1d0klj8J0' ? 'VNA0R2602500' : '',
      resolveYouTubeMetadata: async () => ({
        title: 'SECRET (Feat. Quang Hùng MasterD, Cody Nam Võ, CongB, Wren Evans)',
        artist: 'TINH HÀ "SAY HI", Quang Hùng MasterD, Cody Nam Võ, CongB, Wren Evans',
        album: 'TINH HÀ "SAY HI", TẬP 6',
        duration: 281
      })
    },
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'SECRET', author_name: ' - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lyricsplus.prjktla.my.id')) return response(200, {
        metadata: { source: 'Apple', totalDuration: '4:40.560' },
        lyrics: Array.from({ length: 61 }, (_, index) => ({ time: 1000 + index * 4300, text: `Line ${index + 1}` }))
      });
      if (value.includes('token.get')) return response(200, { message: { header: { status_code: 401, hint: 'captcha' }, body: {} } });
      if (value.includes('lrclib.net/api/search')) return response(200, []);
      return response(404, {});
    }
  });

  const result = await service.resolve({
    videoId: 'YI1d0klj8J0',
    type: 'youtube',
    title: 'SECRET',
    author: 'Kênh YouTube',
    duration: 280
  });

  assert.equal(result.available, true);
  assert.equal(result.source, 'LyricsPlus · Apple');
  assert.equal(result.lines.length, 61);
});

test('YouTube Music dùng plain lyrics khi không có nguồn timestamp', async () => {
  const { service } = createService({
    options: {
      resolveYouTubeMetadata: async () => ({
        title: 'Nhớ Em 8 Lần', artist: 'CONGB, Mason Nguyen, Tez', album: 'CONGBDAY', duration: 218
      })
    },
    fetchImpl: async (url, options = {}) => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Nhớ Em 8 Lần', author_name: ' - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<html></html>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('/youtubei/v1/next')) {
        assert.equal(options.method, 'POST');
        return response(200, { tabRenderer: { endpoint: { browseEndpoint: {
          browseId: 'MPLY-test',
          browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_TRACK_LYRICS' } }
        } } } });
      }
      if (value.includes('/youtubei/v1/browse')) return response(200, {
        musicDescriptionShelfRenderer: {
          description: { runs: [{ text: 'Dòng một\n\nDòng hai\nDòng ba' }] },
          footer: { runs: [{ text: 'Nguồn: LyricFind' }] }
        }
      });
      if (value.includes('lrclib.net/api/search')) return response(200, []);
      return response(404, {});
    }
  });

  const result = await service.resolve({ videoId: 'WauDsN32JMM', type: 'youtube' });
  assert.equal(result.available, true);
  assert.equal(result.synced, false);
  assert.equal(result.source, 'YouTube Music · LyricFind');
  assert.deepEqual(result.lines.map(line => line.text), ['Dòng một', 'Dòng hai', 'Dòng ba']);
});

test('ban remix cung duration uu tien timeline co credit remixer dung ten', async () => {
  const wrongTimeline = {
    id: 37518568,
    trackName: 'Ai đưa em về (Cukak Remix)',
    artistName: 'TIA (2)',
    albumName: 'Ai đưa em về (Cukak Remix) - Single',
    duration: 230,
    syncedLyrics: '[00:10.65] Sai nhịp\n[00:12.12] Sai bản'
  };
  const correctTimeline = {
    id: 28336322,
    trackName: 'Ai đưa em về (Cukak Remix)',
    artistName: 'Lê Thiện Hiếu, TIA và Cukak',
    albumName: 'Ai đưa em về (Cukak Remix)',
    duration: 230,
    syncedLyrics: '[00:01.71] Đúng nhịp\n[00:03.24] Đúng bản'
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, {
        title: 'Ai đưa em về (Cukak Remix)', author_name: 'Tia Hai Chau - Topic'
      });
      if (value.includes('www.youtube.com/watch')) return response(200, {});
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, wrongTimeline);
      if (value.includes('lrclib.net/api/search')) return response(200, [wrongTimeline, correctTimeline]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: '9s4u7Jg3WCw', title: 'Ai đưa em về (Cukak Remix)',
    author: 'Tia Hai Chau - Topic', duration: 230
  });
  assert.equal(result.available, true);
  assert.equal(result.artistName, 'Lê Thiện Hiếu, TIA và Cukak');
  assert.equal(result.lines[0].text, 'Đúng nhịp');
});

test('khong gan lyrics remix khi candidate cung duration thieu credit remixer', async () => {
  const wrongTimeline = {
    id: 37518568,
    trackName: 'Ai đưa em về (Cukak Remix)',
    artistName: 'TIA (2)',
    duration: 230,
    syncedLyrics: '[00:10.65] Sai nhịp\n[00:12.12] Sai bản'
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, {
        title: 'Ai đưa em về (Cukak Remix)', author_name: 'Tia Hai Chau - Topic'
      });
      if (value.includes('www.youtube.com/watch')) return response(200, {});
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, wrongTimeline);
      if (value.includes('lrclib.net/api/search')) return response(200, [wrongTimeline]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: '9s4u7Jg3WCw', title: 'Ai đưa em về (Cukak Remix)',
    author: 'Tia Hai Chau - Topic', duration: 230
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'not_found');
});

test('khong lay bai khac hoan toan chi vi trung nghe si va thoi luong', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Original Song', author_name: 'Same Artist - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) return response(200, [
        { id: 3, trackName: 'Completely Different Track', artistName: 'Same Artist', duration: 200, syncedLyrics: '[00:01.00] Must not be selected' }
      ]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Original Song', duration: 200 });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'not_found');
});

test('giu lyrics synced dung bai khi metadata thoi luong chi lech mot giay', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Exact Song', author_name: 'Exact Artist - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(404, { message: 'not found' });
      if (value.includes('lrclib.net/api/search')) return response(200, [
        { id: 4, trackName: 'Exact Song', artistName: 'Exact Artist', duration: 201, syncedLyrics: '[00:01.00] One second off' }
      ]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({ videoId: 'abcdefghijk', title: 'Exact Song', duration: 200 });
  assert.equal(result.available, true);
  assert.equal(result.source, 'LRCLIB');
  assert.equal(result.duration, 201);
  assert.deepEqual(result.lines, [{ time: 1, text: 'One second off' }]);
});

test('ten phien ban Ver khong bi nham thanh credit cua remixer', async () => {
  const lyrics = {
    id: 33848828,
    trackName: 'Vì (Special Music Night Ver)',
    artistName: 'marzuz; DuongK',
    albumName: 'Yêu - EP',
    duration: 246,
    syncedLyrics: '[00:12.00] Ngày tháng cứ thế sao quá dài\n[00:18.00] Mình em vẫn thế trong lâu đài'
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [{
        kind: 'song', trackName: 'Vì (Special Music Night Ver)', artistName: 'marzuz & DuongK',
        collectionName: 'Yêu - EP', trackTimeMillis: 245669
      }] });
      if (value.includes('lrclib.net/api/get')) return response(200, lyrics);
      throw new Error(`unexpected url: ${value}`);
    }
  });

  const result = await service.resolve({
    title: 'Vì (Special Music Night Ver)', author: 'marzuz', duration: 245,
    sourceUrl: 'https://music.youtube.com/watch?v=abcdefghijk'
  });

  assert.equal(result.available, true);
  assert.equal(result.synced, true);
  assert.equal(result.source, 'LRCLIB');
  assert.equal(result.duration, 246);
});

test('loai lyrics co duration dung metadata nhung timeline bi cat truoc nua bai', async () => {
  const truncatedLyrics = {
    id: 23866170,
    trackName: 'Mưa Đợi Chờ',
    artistName: 'Miu Lê',
    duration: 238,
    syncedLyrics: Array.from({ length: 23 }, (_, index) => {
      const seconds = 20 + index * 3.35;
      const minute = Math.floor(seconds / 60);
      const second = (seconds % 60).toFixed(2).padStart(5, '0');
      return `[${String(minute).padStart(2, '0')}:${second}] Dòng ${index + 1}`;
    }).join('\n')
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Mưa Đợi Chờ', author_name: 'Miu Lê - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<script>"lengthSeconds":"238"</script>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, truncatedLyrics);
      if (value.includes('lrclib.net/api/search')) return response(200, [truncatedLyrics]);
      return response(404, {});
    }
  });

  const result = await service.resolve({
    videoId: 'sHxWsIfOsm0', title: 'Mưa Đợi Chờ', author: 'Miu Lê', duration: 238,
    sourceUrl: 'https://www.youtube.com/watch?v=sHxWsIfOsm0'
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, 'not_found');
});

test('loai timeline LRCLIB cua SOLO dung duration nhung thieu hon mot phut cuoi', async () => {
  const corruptLyrics = {
    id: 13459054,
    trackName: 'SOLO', artistName: 'JENNIE', albumName: 'SOLO - Single', duration: 170,
    syncedLyrics: Array.from({ length: 30 }, (_, index) => {
      const seconds = 17 + index * (92 / 29);
      const minute = Math.floor(seconds / 60);
      const second = (seconds % 60).toFixed(2).padStart(5, '0');
      return `[${String(minute).padStart(2, '0')}:${second}] Line ${index + 1}`;
    }).join('\n')
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'SOLO', author_name: 'JENNIE - Topic' });
      if (value.includes('youtube.com/watch')) return response(200, '<script>"lengthSeconds":"170"</script>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [{
        kind: 'song', trackName: 'SOLO', artistName: 'JENNIE', collectionName: 'SOLO - Single', trackTimeMillis: 169567
      }] });
      if (value.includes('lrclib.net/api/get')) return response(200, corruptLyrics);
      if (value.includes('lrclib.net/api/search')) return response(200, [corruptLyrics]);
      return response(404, {});
    }
  });

  const result = await service.resolve({
    videoId: '4-4COoO5Qdg', sourceUrl: 'https://www.youtube.com/watch?v=4-4COoO5Qdg'
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'not_found');
});

test('video Topic dung thoi luong YouTube chinh thuc thay cho duration player bi cat giay', async () => {
  const lyrics = {
    id: 38810001,
    trackName: 'XOAY VÒNG (Feat. HURRYKNG, CONGB, JSOL, VƯƠNG BÌNH)',
    artistName: 'TINH HÀ "SAY HI"', albumName: 'TINH HÀ "SAY HI" EP', duration: 206,
    syncedLyrics: '[00:10.06] Are you okay though?\n[00:12.26] I will die in your arms again'
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, {
        title: 'XOAY VÒNG (Feat. HURRYKNG, CONGB, JSOL, VƯƠNG BÌNH)',
        author_name: 'TINH HÀ "SAY HI" - Topic'
      });
      if (value.includes('youtube.com/watch')) return response(200,
        '<script>var ytInitialPlayerResponse={"videoDetails":{"lengthSeconds":"206","shortDescription":"XOAY VÒNG · TINH HÀ \\"SAY HI\\" · HURRYKNG · CONGB · JSOL · VƯƠNG BÌNH"}}</script>');
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [] });
      if (value.includes('lrclib.net/api/get')) return response(200, lyrics);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: '8edEK_ce4k4',
    title: 'XOAY VÒNG (Feat. HURRYKNG, CONGB, JSOL, VƯƠNG BÌNH)',
    author: 'TINH HÀ "SAY HI"', duration: 205,
    sourceUrl: 'https://www.youtube.com/watch?v=8edEK_ce4k4'
  });
  assert.equal(result.available, true);
  assert.equal(result.duration, 206);
});

test('lam tron metadata phan giay de nhan dung lyrics LRCLIB cung ban ghi', async () => {
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, { title: 'Có Em Là Nhà', author_name: 'Min - Topic' });
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [{
        kind: 'song', trackName: 'Có Em Là Nhà', artistName: 'MIN', collectionName: 'Dear Min', trackTimeMillis: 250500
      }] });
      if (value.includes('lrclib.net/api/get')) return response(200, {
        id: 27732620, trackName: 'Có Em Là Nhà', artistName: 'MIN', albumName: 'Dear Min', duration: 251,
        syncedLyrics: '[00:10.00] Dòng thứ nhất\n[00:14.00] Dòng thứ hai'
      });
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: '22opdLbDgM8', title: 'Có Em Là Nhà', author: 'Min - Topic', duration: 250.48
  });
  assert.equal(result.available, true);
  assert.equal(result.trackName, 'Có Em Là Nhà');
  assert.equal(result.duration, 251);
});

test('dung metadata phat hanh khi credit feat dai trung khop du player thieu mot giay', async () => {
  const lyrics = {
    id: 37644928,
    trackName: 'MVP (MƯA VỘI PHÓNG) (feat. Wren Evans, Ali Hoàng Dương, CODYNAMVO, HYO & 2pillz)',
    artistName: 'TINH HÀ "SAY HI"', albumName: 'TINH HÀ "SAY HI", TẬP 4', duration: 222,
    syncedLyrics: '[00:28.62] Mưa nhẹ rơi màn đêm\n[00:30.98] Mình anh phóng qua nơi em'
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) return response(200, {
        title: 'MVP (MƯA VỘI PHÓNG) [Feat. Wren Evans, Ali Hoàng Dương, CODY NAM VÕ, HYO, 2pillz]',
        author_name: 'TINH HÀ "SAY HI" - Topic'
      });
      if (value.includes('youtube.com/watch')) {
        const description = 'MVP (MƯA VỘI PHÓNG) [Feat. Wren Evans, Ali Hoàng Dương, CODY NAM VÕ, HYO, 2pillz] · TINH HÀ "SAY HI" · Wren Evans · Ali Hoàng Dương · CODY NAM VÕ · HYO · 2pillz';
        return response(200, `<script>var data={"shortDescription":"${description}"}</script>`);
      }
      if (value.includes('itunes.apple.com/search')) return response(200, { results: [{
        kind: 'song',
        trackName: 'MVP (MƯA VỘI PHÓNG) [feat. Wren Evans, Ali Hoàng Dương, CODYNAMVO, HYO & 2pillz]',
        artistName: 'TINH HÀ "SAY HI"', collectionName: 'TINH HÀ "SAY HI", TẬP 4 - EP', trackTimeMillis: 221800
      }] });
      if (value.includes('lrclib.net/api/get')) return response(200, lyrics);
      if (value.includes('lrclib.net/api/search')) return response(200, [lyrics]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: 'CLSUxac0F9Q',
    title: 'MVP (MƯA VỘI PHÓNG) [Feat. Wren Evans, Ali Hoàng Dương, CODY NAM VÕ, HYO, 2pillz]',
    author: 'TINH HÀ "SAY HI" - Topic', duration: 221,
    sourceUrl: 'https://www.youtube.com/watch?v=CLSUxac0F9Q'
  });
  assert.equal(result.available, true);
  assert.equal(result.metadataSource, 'apple-itunes');
  assert.equal(result.duration, 222);
});

test('YouTube Music bat buoc dung nghe si cong tac trong credit chinh thuc', async () => {
  const wrongLyrics = {
    id: 30084246, trackName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', artistName: 'Juky San, buitruonglinh',
    albumName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', duration: 216,
    syncedLyrics: '[00:03.00] Lyrics cua ban buitruonglinh'
  };
  const { service } = createService({
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('youtube.com/oembed')) {
        return response(200, { title: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', author_name: 'Juky San - Topic' });
      }
      if (value.includes('youtube.com/watch')) {
        const description = 'Provided to YouTube\\n\\nNg\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean · Juky San · LAMOON · Tr\u1ea7n Th\u1ecb Dung\\n\\nAuto-generated by YouTube.';
        return response(200, `<script>var data={"shortDescription":"${description}"}</script>`);
      }
      if (value.includes('itunes.apple.com/search')) {
        return response(200, { results: [{
          kind: 'song', trackName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean (feat. LAMOON)', artistName: 'Juky San',
          collectionName: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean (feat. LAMOON) - Single', trackTimeMillis: 216417
        }] });
      }
      if (value.includes('lrclib.net/api/get')) return response(200, wrongLyrics);
      if (value.includes('lrclib.net/api/search')) return response(200, [wrongLyrics]);
      throw new Error(`unexpected url: ${value}`);
    }
  });
  const result = await service.resolve({
    videoId: 'dqhxnbtX8rY', title: 'Ng\u01b0\u1eddi \u0110\u1ea7u Ti\u00ean', author: 'Juky San - Topic', duration: 216,
    sourceUrl: 'https://music.youtube.com/watch?v=dqhxnbtX8rY'
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'not_found');
});
