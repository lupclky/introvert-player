'use strict';

const { LyricsRomanizationService } = require('./lyrics-romanization-service');

class SyncedLyricsService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.resolveYouTubeMetadata = typeof options.resolveYouTubeMetadata === 'function'
      ? options.resolveYouTubeMetadata
      : null;
    this.now = options.now || Date.now;
    this.logger = options.logger || console;
    this.lyricsRomanizationService = options.lyricsRomanizationService || new LyricsRomanizationService({
      logger: this.logger
    });
    this.clientName = options.clientName || 'IntrovertPlayer';
    this.clientVersion = options.clientVersion || 'unknown';
    this.clientContact = options.clientContact || 'https://github.com/';
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || 9000);
    this.cacheTtlMs = Math.max(60000, Number(options.cacheTtlMs) || 24 * 60 * 60 * 1000);
    this.failureCacheTtlMs = Math.max(60000, Number(options.failureCacheTtlMs) || 30 * 60 * 1000);
    this.syncedRaceWindowMs = Number.isFinite(Number(options.syncedRaceWindowMs))
      ? Math.max(0, Math.min(500, Number(options.syncedRaceWindowMs)))
      : 160;
    this.durationToleranceSeconds = Number.isFinite(Number(options.durationToleranceSeconds))
      ? Math.max(0, Math.min(3, Number(options.durationToleranceSeconds)))
      : 1.5;
    this.unisonApiUrl = options.unisonApiUrl || 'https://unison.boidu.dev/lyrics';
    this.biniLyricsApiUrl = options.biniLyricsApiUrl || 'https://lyrics-api.binimum.org/';
    this.lyricsPlusApiUrl = options.lyricsPlusApiUrl || 'https://lyricsplus.prjktla.my.id/v2/lyrics/get';
    this.resolveTrackIsrc = typeof options.resolveTrackIsrc === 'function'
      ? options.resolveTrackIsrc
      : null;
    this.musixmatchApiUrl = options.musixmatchApiUrl || 'https://apic-desktop.musixmatch.com/ws/1.1/';
    this.musixmatchToken = '';
    this.musixmatchTokenPromise = null;
    this.cache = options.cache || new Map();
    this.inflight = new Map();
  }

  static normalizeComparable(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&amp;/g, ' and ')
      .replace(/[^a-z0-9\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  static cleanArtist(value) {
    return String(value || '')
      .replace(/\s*[-–—]\s*(topic|chủ\s*đề)\s*$/i, '')
      .trim();
  }

  static isKaraokeSource(title, artist) {
    const combined = `${title || ''} ${artist || ''}`;
    return /\bkaraoke\b/i.test(combined)
      || /\[[^\]]*karaoke[^\]]*\]/i.test(combined);
  }

  static cleanTrackTitle(value) {
    return String(value || '')
      .replace(/^\s*\[[^\]]*karaoke[^\]]*\]\s*[-–—|:]?\s*/gi, '')
      .replace(/^\s*karaoke(?:\s*(?:song\s*ca|tone\s*(?:nam|nữ|chuẩn)|beat|beat\s*chuẩn|beat\s*gốc|nhạc\s*sống))?\s*[-–—|:]\s*/gi, '')
      .replace(/^\s*karaoke\s+beat\s*[-–—|:]?\s*/gi, '')
      .replace(/\s*[-–—|]\s*["'“][^"'”]+["'”]\s*(?:album|ep|single|ost)?\s*$/gi, '')
      .replace(/\s*[-–—|]\s*(?:tone\s*(?:nam|nữ|song\s*ca|chuẩn)|beat\s*chuẩn|beat\s*gốc|nhạc\s*sống|karaoke|official\s*beat).*$/gi, '')
      .replace(/\s*[\[(][^\])]*(?:karaoke|tone\s*(?:nam|nữ|song\s*ca|chuẩn)|hạ\s*tone|tăng\s*tone|beat\s*(?:chuẩn|gốc|nhạc\s*sống)|nhạc\s*sống)[^\])]*[\])]/gi, '')
      .replace(/\s*[\[(](?:official\s*)?(?:music\s*)?(?:audio|video|lyric(?:s)?|visualizer|mv)[^\])]*[\])]/gi, '')
      .replace(/\s*[\[(](?:vietsub|lyrics?\s*video|audio\s*only)[^\])]*[\])]/gi, '')
      .replace(/\s*[-–—|]\s*(?:official\s*)?(?:audio|lyrics?|visualizer)\s*$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getCoreTrackTitle(value) {
    const qualifier = /(?:feat(?:uring)?|ft\.?|with|remix|mix|version|ver\.?|live|acoustic|remaster(?:ed)?|radio\s*edit|edit|instrumental|karaoke|cover|demo|sped\s*up|slowed(?:\s*down)?|nightcore|mono|stereo|from\s+.+)/i;
    return SyncedLyricsService.cleanTrackTitle(value)
      .replace(/\s*[\[(][^\])]*(?:feat(?:uring)?|ft\.?|with|remix|mix|version|ver\.?|live|acoustic|remaster(?:ed)?|radio\s*edit|edit|instrumental|karaoke|cover|demo|sped\s*up|slowed(?:\s*down)?|nightcore|mono|stereo|from\s+)[^\])]*[\])]/gi, '')
      .replace(new RegExp(`\\s*[-\u2013\u2014|]\\s*${qualifier.source}.*$`, 'i'), '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getTokenSimilarity(left, right) {
    const leftTokens = new Set(SyncedLyricsService.normalizeComparable(left).split(' ').filter(Boolean));
    const rightTokens = new Set(SyncedLyricsService.normalizeComparable(right).split(' ').filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;
    const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
    return intersection / Math.min(leftTokens.size, rightTokens.size);
  }

  static hasRelatedArtist(left, right) {
    const normalizedLeft = SyncedLyricsService.normalizeComparable(left);
    const normalizedRight = SyncedLyricsService.normalizeComparable(right);
    if (!normalizedLeft || !normalizedRight) return false;
    return normalizedLeft === normalizedRight
      || normalizedLeft.includes(normalizedRight)
      || normalizedRight.includes(normalizedLeft)
      || SyncedLyricsService.getTokenSimilarity(normalizedLeft, normalizedRight) >= 0.6;
  }

  static normalizeDuration(value) {
    const duration = Number(value);
    // Metadata providers expose the same track differently: the player may
    // report 250.480s while Apple/LRCLIB publish the rounded 251s. Normalize
    // every provider to its nearest whole second before requiring equality.
    return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
  }

  static hasExactDuration(candidate, identity) {
    const candidateDuration = SyncedLyricsService.normalizeDuration(candidate?.duration);
    const targetDuration = SyncedLyricsService.normalizeDuration(identity?.duration);
    return candidateDuration > 0 && targetDuration > 0 && candidateDuration === targetDuration;
  }

  static extractFeaturedArtists(value) {
    const source = String(value || '');
    const output = [];
    const matcher = /(?:feat(?:uring)?\.?|ft\.?|with|cùng\s+với)\s+([^\])]+)/gi;
    for (const match of source.matchAll(matcher)) {
      String(match[1] || '')
        .split(/\s*(?:,|&|\band\b|\bx\b)\s*/i)
        .map(item => item.trim())
        .filter(Boolean)
        .forEach(item => output.push(item));
    }
    return [...new Set(output)];
  }

  hasCompatibleDuration(candidate, identity) {
    return SyncedLyricsService.getDurationDistance(candidate, identity) <= this.durationToleranceSeconds;
  }

  static getDurationDistance(candidate, identity) {
    const candidateDuration = Number(candidate?.duration);
    const targetDuration = Number(identity?.duration);
    if (!(candidateDuration > 0) || !(targetDuration > 0)) return Number.POSITIVE_INFINITY;
    return Math.abs(candidateDuration - targetDuration);
  }

  static hasSufficientTimelineCoverage(lines, identity) {
    const normalizedLines = Array.isArray(lines) ? lines : [];
    const duration = Math.max(0, Number(identity?.duration) || 0);
    // A tiny fixture or a genuinely sparse lyric does not provide enough
    // evidence to reject. For normal lyrics, reject timelines that cover less
    // than 70% of the release and leave over 45 seconds uncovered. This catches
    // corrupt LRCLIB records whose declared duration is correct but whose actual
    // timestamps belong to a shortened edit (for example SOLO ending at 1:49
    // while the Topic audio continues to 2:50).
    if (normalizedLines.length < 8 || duration < 120) return true;
    const lastTimestamp = normalizedLines.reduce((latest, line) => {
      const time = Number(line?.time);
      return Number.isFinite(time) ? Math.max(latest, time) : latest;
    }, 0);
    return lastTimestamp >= duration * 0.7 || duration - lastTimestamp <= 45;
  }

  static getProviderPriority(source) {
    const src = String(source || '');
    if (src.includes('Verified')) return 100;
    if (src.startsWith('LRCLIB')) return 90;
    if (src.startsWith('LyricsPlus')) return 90;
    if (src.startsWith('Unison')) return 90;
    if (src.startsWith('BiniLyrics')) return 90;
    if (src.startsWith('YouTube Captions')) return 50;
    if (src.startsWith('Musixmatch')) return 80;
    return 10;
  }

  static getCuratedLyrics(videoId, identity) {
    const vid = String(videoId || '');
    const titleNorm = SyncedLyricsService.normalizeComparable(identity?.title);
    const hasTyga = SyncedLyricsService.includesArtist(identity?.artist, 'tyga')
      || SyncedLyricsService.includesArtist(identity?.title, 'tyga')
      || SyncedLyricsService.includesArtist(identity?.rawArtist, 'tyga')
      || SyncedLyricsService.includesArtist(identity?.credits, 'tyga');
    if (vid === '-cbGww7sL_s' || (titleNorm.includes('make it hot') && hasTyga)) {
      return {
        trackName: '2 Phút Hơn (Make It Hot) [KAIZ Remix]',
        artistName: 'Pháo feat. Tyga & KAIZ',
        albumName: '2 Phút Hơn (Make It Hot) [KAIZ Remix]',
        duration: 159,
        source: 'Introvert Verified LRC',
        syncedLyrics: `[00:03.73] Tay em đang run run nhưng anh thì cứ rót đi
[00:07.56] Anh mà không nể em là khi mà anh không hết ly
[00:11.15] Uống thêm vài ly vì đời chẳng mấy khi vui
[00:14.70] Nốc thêm vài chai vì anh em chẳng mấy khi gặp lại
[00:18.86] Nơi đây đang xoay xoay, thế gian đang xoay vòng
[00:22.38] Anh đang ở nơi đâu, biết anh có thay lòng?
[00:26.12] Đừng nói chi-í-i-i mà
[00:29.78] Mình uống đi-í-i-i
[00:33.55] Một hai ba bốn hai ba một
[00:37.11] Hình như anh nói anh say rồi
[00:40.93] Một hai ba bốn hai ba một
[00:44.71] Hình như anh nói anh yêu em rồi
[00:48.80] (Tyga)
[00:49.50] I'm bored in the parking lot
[00:51.35] Wanna watch? I make it hot
[00:53.20] I do the most, I make a lot
[00:55.10] You take it off and make it pop
[00:57.00] Shots make the party rock
[00:58.90] Rock my ice, it don't tell time
[01:00.80] Closin' off, forever shine
[01:02.70] Floatin' and I'm hella hot
[01:04.60] Bass, pop
[01:06.50] Shake, twist
[01:08.40] Drink, vanity, hey!
[01:10.30] Blow my mind
[01:12.20] Tell me, it's mine
[01:14.10] You lyin', it's fine
[01:16.00] Got many girl on my line
[01:18.27] Đừng nói chi-í-i-i mà
[01:22.39] Mình uống đi-í-i-i
[01:25.89] Đừng nói chi-í-i-i mà
[01:29.79] Mình uống đi-í-i-i
[01:37.52] Tay em đang run run nhưng anh thì cứ rót đi
[01:41.43] Anh mà không nể em là khi mà anh không hết ly
[01:44.78] Uống thêm vài ly vì đời chẳng mấy khi vui
[01:48.26] Nốc thêm vài chai vì anh em chẳng mấy khi gặp lại
[01:52.45] Nơi đây đang xoay xoay, thế gian đang xoay vòng
[01:56.21] Anh đang ở nơi đâu, biết anh có thay lòng?
[01:59.70] Đừng nói chi-í-i-i mà
[02:03.42] Mình uống đi-í-i-i
[02:07.08] Một hai ba bốn hai ba một
[02:11.06] Hình như anh nói anh say rồi
[02:14.72] Một hai ba bốn hai ba một
[02:18.51] Hình như anh nói anh yêu em rồi
[02:26.02] Một hai ba bốn hai ba`
      };
    }
    if (vid === 'sHxWsIfOsm0' || (titleNorm.includes('mua doi cho') && SyncedLyricsService.includesArtist(identity?.artist || identity?.rawArtist, 'miu le'))) {
      return {
        trackName: 'Mưa Đợi Chờ',
        artistName: 'Miu Lê',
        albumName: 'Mưa Đợi Chờ/Không Còn Nhau',
        duration: 238,
        source: 'Introvert Verified LRC',
        syncedLyrics: `[00:20.12] Đêm nay mưa cứ rơi rơi làm tôi nhớ về
[00:24.91] Mong cho cơn mưa đừng vội xóa đi tình yêu
[00:29.01] Tình yêu chỉ tôi đợi chờ
[00:31.14] Mà lòng ai cứ luôn hững hờ
[00:33.96] Những phút giây trong lòng nhói đau
[00:38.12] Bỗng tiếng nói như bên tai dịu êm
[00:42.82] Anh nơi đâu anh đừng vội bước đi thật nhanh
[00:47.03] Ngoài kia có mưa đang rơi rơi rơi
[00:50.01] Đừng xa em người hỡi
[00:56.97] Lúc khi yêu người nói rằng
[00:59.02] Bên nhau một đời không phai
[01:01.93] Trong lòng hoài mãi mãi em khó hoài nghi
[01:06.03] Cứ yêu thương người hết lòng
[01:08.38] Say mê từng ngày bên anh
[01:11.05] Trong lòng hoài không quen
[01:12.99] Anh giờ đã khác
[01:14.94] Dù xa anh như bao giấc mơ
[01:18.09] Quên từng lời hứa xưa
[01:20.07] Bao đêm mưa cùng ai
[01:22.18] Ta nắm tay cho giọt nước mưa kia vương không ướt vai
[01:27.08] Như giọt lệ của em
[01:29.00] Rơi rơi khi người đi
[01:31.23] Tiếc thương chi thêm buồn
[01:43.13] Đêm nay mưa cứ rơi rơi làm tôi nhớ về
[01:47.92] Mong cho cơn mưa đừng vội xóa đi tình yêu
[01:52.02] Tình yêu chỉ tôi đợi chờ
[01:54.15] Mà lòng ai cứ luôn hững hờ
[01:56.97] Những phút giây trong lòng nhói đau
[02:01.13] Bỗng tiếng nói như bên tai dịu êm
[02:05.83] Anh nơi đâu anh đừng vội bước đi thật nhanh
[02:10.04] Ngoài kia có mưa đang rơi rơi rơi
[02:13.02] Đừng xa em người hỡi
[02:19.98] Lúc khi yêu người nói rằng
[02:22.03] Bên nhau một đời không phai
[02:24.94] Trong lòng hoài mãi mãi em khó hoài nghi
[02:29.04] Cứ yêu thương người hết lòng
[02:31.39] Say mê từng ngày bên anh
[02:34.06] Trong lòng hoài không quen
[02:36.00] Anh giờ đã khác
[02:37.95] Dù xa anh như bao giấc mơ
[02:41.10] Quên từng lời hứa xưa
[02:43.08] Bao đêm mưa cùng ai
[02:45.19] Ta nắm tay cho giọt nước mưa kia vương không ướt vai
[02:50.09] Như giọt lệ của em
[02:52.01] Rơi rơi khi người đi
[02:54.24] Tiếc thương chi thêm buồn
[02:58.00] (Uh-oh, uh-oh, uh-oh...)
[03:05.03] Cứ yêu thương người hết lòng
[03:07.40] Say mê từng ngày bên anh
[03:10.05] Trong lòng hoài không quen
[03:12.00] Anh giờ đã khác
[03:13.95] Dù xa anh như bao giấc mơ
[03:17.10] Quên từng lời hứa xưa
[03:19.10] Bao đêm mưa cùng ai
[03:21.20] Ta nắm tay cho giọt nước mưa kia vương không ướt vai
[03:26.10] Như giọt lệ của em
[03:28.00] Rơi rơi khi người đi
[03:30.25] Tiếc thương chi thêm buồn
[03:36.00] Hah-ah-ah, ah ah ah
[03:42.00] Hah-ah-ah, ah ah hah`
      };
    }
    if (vid === '4ZFezhS5hZs' || (titleNorm.includes('exit sign') && (titleNorm.includes('song 26') || titleNorm.includes('performance')))) {
      return {
        trackName: 'Exit Sign (Sóng 26 Performance)',
        artistName: 'HIEUTHUHAI x marzuz',
        albumName: 'Sóng 26',
        duration: 261,
        source: 'Introvert Verified LRC',
        syncedLyrics: `[00:58.72] Anh không nhớ nổi lần cuối cùng anh nhìn vào mắt em đó là từ bao giờ
[01:01.72] Em từng trách anh chỉ ôm ước mơ, còn không sợ mất em thì làm sao chờ?
[01:05.00] Lúc đó anh có xin lỗi hay không thì kết quả nó cũng như nhau mà
[01:07.72] Cuối cùng thì hai ta đều ích kỷ, nông nổi, tự trọng cao mà
[01:11.08] Ta từng bắt gặp nhau ở khắp Sài Gòn, chắc là lúc còn yêu thì muốn tránh cũng khó
[01:14.20] Không thể tin là mình chưa từng gặp lại sau khi mà anh bước qua cánh cửa đó
[01:17.48] Tình yêu mình từng là ánh lửa đỏ, từng là chim sẻ cố đập cánh giữa gió
[01:20.40] Cố gắng sống hai cuộc đời, chắc là thằng nhóc này muốn làm thần thánh nữa đó
[01:23.04] Sao giờ em xuất hiện tại đây vậy? Cuối hàng khán giả với cánh tay vẫy
[01:26.24] Em từng cùng anh đứng ở hậu trường và cùng anh về nhà sau khi mà bay nhảy
[01:29.28] Cũng từng nói, "Em không có gạt anh, em thích nhạc anh", and you know the vision
[01:32.48] Anh từng hứa là mình không nhạt đâu, sẽ không lạc nhau, cùng bên nhau vào khi cần
[01:35.60] Ngay lúc đó anh chỉ muốn lao xuống, anh thật sự tò mò, em dạo này khỏe không?
[01:38.60] Nhưng mà sao hôm nay em đi khuya vậy? Ba mẹ em biết là ba mẹ sẽ trông
[01:41.52] Anh từng mong em hạnh phúc, tới khi em nở nụ cười, anh như bị đâm mười nhát
[01:44.52] Khi anh đứng trên sân khấu một mình, còn em đứng cạnh cùng với một người khác
[01:50.48] Em hiểu rằng chúng ta không ai là sai
[01:54.72] Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai
[01:59.40] Mãi sau những điều anh cho là lý do để anh tồn tại
[02:04.60] Vậy đâu còn lý do để em ở lại?
[02:07.84] Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài
[02:11.72] So thanks for showing me the exit sign
[02:14.92] Chưa nói tới đúng sai nhưng chuyến xe dừng lại là do chân anh đặt trên phanh
[02:18.24] Anh đã không ngần ngại chia con đường làm hai vì anh nghĩ là anh quên nhanh
[02:21.48] Gặp một cô gái mới coi là cả thế giới, viết tên cả hai lên tranh
[02:24.36] Không dễ nhiều đêm trắng để chờ lên nắng, giờ thì ký ức gọi tên anh
[02:27.20] Nên là cứ rót đi, bàn vẫn ướt mặc dù có lót ly
[02:29.64] Ước gì có thể paste nỗi đau này qua chỗ khác, nhưng không, nó nhân lên, nó chỉ copy
[02:33.28] Thật khó để nhìn xung quanh khi chỉ trông ngóng vì sao như Tsiolkovsky
[02:36.40] Để bây giờ em đi mất, liên kết còn lại tồn tại giữa anh và em là chung một tài khoản Shopee
[02:40.48] Gom hết tất cả về em xong rồi thiêu nhanh
[02:42.44] Giọng em vang lên trước khi môi em mở, găm thẳng vào anh như là siêu thanh
[02:45.60] Không cần phải là người giỏi toán, đủ biết đây không phải đổi ngang
[02:48.32] Em chỉ mất đi một thằng thất bại, anh mất đi một người yêu anh
[02:51.60] 8515 lần nói anh yêu em ở trong Mess nếu mà em search
[02:54.68] Cũng tới lúc mình phải quên đi thôi dù từng có với nhau là rất nhiều cam kết
[02:57.64] Tiếc nhất không phải chia tay mà là không yêu em nhiều hơn trước lúc tình yêu chết
[03:00.60] Có lẽ phải ghi tên em vào credit vì bài nhạc nào anh cũng viết về em hết
[03:03.68] Em hiểu rằng chúng ta không ai là sai
[03:07.80] Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai
[03:12.48] Mãi sau những điều anh cho là lý do để anh tồn tại
[03:17.56] Vậy đâu còn lý do để em ở lại?
[03:21.04] Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài
[03:25.60] So thanks for showing me the exit sign
[03:31.64] Hah-ah-ah-whoo
[03:44.68] Hãy gìn giữ nhau trong những kỷ niệm
[03:56.24] Hãy gìn giữ nhau trong những kỷ niệm
[03:59.40] I thank you for finally showing me the exit sign
[04:03.64] Thanks for showing me the exit sign`
      };
    }
    return null;
  }

  static selectClosestDuration(records, identity) {
    return records.reduce((best, record) => {
      if (!best) return record;
      const recordDistance = SyncedLyricsService.getDurationDistance(record, identity);
      const bestDistance = SyncedLyricsService.getDurationDistance(best, identity);
      if (recordDistance !== bestDistance) return recordDistance < bestDistance ? record : best;
      if (record?.durationVerified === true && best?.durationVerified !== true) return record;
      if (best?.durationVerified === true && record?.durationVerified !== true) return best;
      const recordPriority = SyncedLyricsService.getProviderPriority(record?.source);
      const bestPriority = SyncedLyricsService.getProviderPriority(best?.source);
      if (recordPriority !== bestPriority) return recordPriority > bestPriority ? record : best;
      return best;
    }, null);
  }

  static extractNamedVersionCredits(value) {
    const source = String(value || '');
    const output = [];
    const genericLabels = new Set([
      'club', 'dance', 'extended', 'original', 'radio', 'official', 'audio',
      'video', 'lyric', 'lyrics', 'vietsub', 'sped up', 'slowed', 'nightcore'
    ]);
    // Only Remix/Mix/Edit prefixes identify a person whose credit must also
    // appear in provider metadata (for example "Cukak Remix"). A phrase such
    // as "Special Music Night Ver" describes the release, not an artist.
    const matcher = /[\[(]([^\])]+?)\s+(?:remix|mix|edit)\s*[\])]/gi;
    for (const match of source.matchAll(matcher)) {
      const credit = String(match[1] || '').trim();
      const normalized = SyncedLyricsService.normalizeComparable(credit);
      if (!normalized || genericLabels.has(normalized)) continue;
      output.push(credit);
    }
    return [...new Set(output)];
  }

  static hasNamedVersionCredits(candidate, identity) {
    const credits = SyncedLyricsService.extractNamedVersionCredits(identity?.title);
    if (!credits.length) return true;
    return credits.every(credit => SyncedLyricsService.includesArtist(candidate?.artistName, credit));
  }

  static includesArtist(value, artist) {
    const haystack = SyncedLyricsService.normalizeComparable(value);
    const needle = SyncedLyricsService.normalizeComparable(artist);
    if (!haystack || !needle) return false;
    if (haystack === needle || haystack.includes(needle)) return true;
    // Credits frequently spell stage names with spaces while distributors
    // collapse them (for example "CODY NAM VÕ" vs "CODYNAMVO").
    return haystack.replace(/\s+/g, '').includes(needle.replace(/\s+/g, ''));
  }

  static hasRequiredArtists(candidate, identity) {
    const requiredArtists = Array.isArray(identity?.requiredArtists) ? identity.requiredArtists.filter(Boolean) : [];
    if (!requiredArtists.length) return true;
    const metadata = [candidate?.trackName, candidate?.artistName, candidate?.albumName].filter(Boolean).join(' ');
    return requiredArtists.every(artist => SyncedLyricsService.includesArtist(metadata, artist));
  }

  static isTopicChannel(value) {
    return /\s*[-–—]\s*(topic|chủ\s*đề)\s*$/i.test(String(value || '').trim());
  }

  static isAppleMusicUrl(value) {
    try {
      const parsed = new URL(String(value || ''));
      return parsed.hostname === 'music.apple.com' || parsed.hostname.endsWith('.music.apple.com');
    } catch (_) {
      return false;
    }
  }

  static isYouTubeMusicUrl(value) {
    try {
      const hostname = new URL(String(value || '')).hostname.toLowerCase();
      return hostname === 'music.youtube.com' || hostname.endsWith('.music.youtube.com');
    } catch (_) {
      return false;
    }
  }

  static isLikelyMusicTitle(value) {
    const title = String(value || '').trim();
    if (!title) return false;
    return /(?:official\s+(?:music\s+)?(?:video|audio)|lyric(?:s|\s+video)?|visualizer|vietsub|\bmv\b|\baudio\b)/i.test(title)
      || /^.{1,80}\s[-–—|]\s.{1,120}$/.test(title);
  }

  static parseAppleTrackId(value) {
    if (!SyncedLyricsService.isAppleMusicUrl(value)) return '';
    try {
      const parsed = new URL(String(value));
      const queryId = String(parsed.searchParams.get('i') || '').trim();
      if (/^\d+$/.test(queryId)) return queryId;
      const pathId = parsed.pathname.match(/\/(\d+)(?:\/)?$/)?.[1] || '';
      return /^\d+$/.test(pathId) ? pathId : '';
    } catch (_) {
      return '';
    }
  }

  static parseSyncedLyrics(value) {
    const output = [];
    const source = String(value || '').replace(/^\uFEFF/, '');
    for (const rawLine of source.split(/\r?\n/)) {
      if (/^\s*\[(ar|al|ti|by|re|ve|length):/i.test(rawLine)) continue;
      const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g)];
      if (!timestamps.length) continue;
      const text = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g, '').trim();
      if (!text) continue;
      for (const timestamp of timestamps) {
        const fraction = String(timestamp[3] || '0');
        const fractionSeconds = Number(fraction) / (fraction.length === 3 ? 1000 : fraction.length === 2 ? 100 : 10);
        const time = Number(timestamp[1]) * 60 + Number(timestamp[2]) + fractionSeconds;
        if (Number.isFinite(time) && time >= 0) output.push({ time: Math.round(time * 1000) / 1000, text });
      }
    }
    return output
      .sort((left, right) => left.time - right.time)
      .filter((line, index, lines) => index === 0 || line.time !== lines[index - 1].time || line.text !== lines[index - 1].text)
      .slice(0, 500);
  }

  static parseClockTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return NaN;
    if (/^\d+(?:\.\d+)?s$/i.test(raw)) return Number(raw.slice(0, -1));
    const parts = raw.split(':').map(Number);
    if (parts.some(part => !Number.isFinite(part))) return NaN;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts.length === 1 ? parts[0] : NaN;
  }

  static decodeXmlText(value) {
    return String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static isPlaceholderArtist(value) {
    const normalized = SyncedLyricsService.normalizeComparable(SyncedLyricsService.cleanArtist(value));
    return !normalized || [
      'release', 'releases', 'various artists', 'various artist',
      'youtube music', 'youtube', 'kenh youtube', 'official release'
    ].includes(normalized);
  }

  static parseTtmlLyrics(value) {
    const source = String(value || '').replace(/^\uFEFF/, '');
    const output = [];
    for (const paragraph of source.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
      const begin = paragraph[1].match(/\bbegin\s*=\s*["']([^"']+)["']/i)?.[1];
      const time = SyncedLyricsService.parseClockTime(begin);
      const text = SyncedLyricsService.decodeXmlText(paragraph[2]);
      if (Number.isFinite(time) && time >= 0 && text) output.push({ time: Math.round(time * 1000) / 1000, text });
    }
    return output
      .sort((left, right) => left.time - right.time)
      .filter((line, index, lines) => index === 0 || line.time !== lines[index - 1].time || line.text !== lines[index - 1].text)
      .slice(0, 500);
  }

  static containsHangul(value) {
    return /[\uAC00-\uD7A3]/u.test(String(value || '').normalize('NFC'));
  }

  static romanizeKoreanText(value) {
    const text = String(value || '').normalize('NFC');
    if (!SyncedLyricsService.containsHangul(text)) return text;

    const initials = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
    const vowels = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
    const finals = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
    // When a final consonant is followed by a silent ㅇ, carry its readable
    // sound into the next syllable. Compound finals keep their first sound.
    const liaison = {
      1: ['', 'g'], 2: ['', 'kk'], 3: ['k', 's'], 4: ['', 'n'], 5: ['n', 'j'], 6: ['n', 'h'],
      7: ['', 'd'], 8: ['', 'r'], 9: ['l', 'g'], 10: ['l', 'm'], 11: ['l', 'b'], 12: ['l', 's'],
      13: ['l', 't'], 14: ['l', 'p'], 15: ['l', 'h'], 16: ['', 'm'], 17: ['', 'b'], 18: ['p', 's'],
      19: ['', 's'], 20: ['', 'ss'], 22: ['', 'j'], 23: ['', 'ch'], 24: ['', 'k'], 25: ['', 't'],
      26: ['', 'p'], 27: ['', 'h']
    };
    const chars = Array.from(text);
    const syllables = chars.map(character => {
      const offset = character.codePointAt(0) - 0xAC00;
      if (offset < 0 || offset > 11171) return null;
      return {
        initial: Math.floor(offset / 588),
        vowel: Math.floor((offset % 588) / 28),
        final: offset % 28
      };
    });
    const initialOverrides = new Map();
    const output = chars.map((character, index) => {
      const syllable = syllables[index];
      if (!syllable) return character;
      let finalSound = finals[syllable.final] || '';
      const next = syllables[index + 1];
      if (syllable.final && next?.initial === 11 && liaison[syllable.final]) {
        const [remainingFinal, carriedInitial] = liaison[syllable.final];
        finalSound = remainingFinal;
        initialOverrides.set(index + 1, carriedInitial);
      }
      const initialSound = initialOverrides.get(index) ?? initials[syllable.initial] ?? '';
      return `${initialSound}${vowels[syllable.vowel] || ''}${finalSound}`;
    }).join('');
    return output.trim();
  }

  static preferKoreanRomanization(lines) {
    if (!Array.isArray(lines) || !lines.some(line => SyncedLyricsService.containsHangul(line?.text))) {
      return { lines, romanized: false };
    }
    return {
      romanized: true,
      lines: lines.map(line => {
        const originalText = String(line?.text || '');
        const text = SyncedLyricsService.romanizeKoreanText(originalText) || originalText;
        return SyncedLyricsService.containsHangul(originalText)
          ? { ...line, text, originalText }
          : { ...line, text };
      })
    };
  }

  static getLyricsQuality(candidate) {
    const lines = SyncedLyricsService.parseSyncedLyrics(candidate?.syncedLyrics);
    const compactLength = value => String(value || '').replace(/\s+/g, '').length;
    const plainLength = compactLength(candidate?.plainLyrics);
    const syncedTextLength = compactLength(lines.map(line => line.text).join('\n'));
    const textCoverage = plainLength > 0 ? Math.min(1, syncedTextLength / plainLength) : null;
    const duration = Math.max(0, Number(candidate?.duration) || 0);
    const lastTimestamp = lines.length ? lines[lines.length - 1].time : 0;
    const timeCoverage = duration > 0 ? Math.min(1, lastTimestamp / duration) : null;
    const incompleteAgainstPlain = plainLength >= 160 && textCoverage < 0.35;
    const endsImmediately = plainLength >= 160 && duration >= 60 && lines.length <= 4 && lastTimestamp < duration * 0.2;
    return {
      lines,
      textCoverage,
      timeCoverage,
      complete: lines.length > 0 && !incompleteAgainstPlain && !endsImmediately
    };
  }

  async fetchJson(url, headers = {}, requestOptions = {}) {
    if (!this.fetchImpl) throw new Error('fetch is not available');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const response = await this.fetchImpl(url, {
        ...requestOptions,
        headers: {
          'User-Agent': `${this.clientName} ${this.clientVersion} (${this.clientContact})`,
          Accept: 'application/json',
          ...headers,
          ...(requestOptions.headers || {})
        },
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfter = response.headers?.get?.('retry-after') || '';
        throw error;
      }
      return response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async fetchText(url, headers = {}) {
    if (!this.fetchImpl) throw new Error('fetch is not available');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': `${this.clientName} ${this.clientVersion} (${this.clientContact})`,
          Accept: 'text/plain, application/xml, text/xml, application/json',
          ...headers
        },
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.text();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async fetchYouTubeIdentity(videoId, options = {}) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) return null;
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    try {
      const data = await this.fetchJson(url);
      const identity = {
        title: String(data?.title || '').trim(),
        rawArtist: String(data?.author_name || '').trim(),
        credits: '',
        duration: 0
      };
      if (options.includeCredits || SyncedLyricsService.isTopicChannel(identity.rawArtist)) {
        try {
          const response = await this.fetchImpl(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
            headers: {
              'User-Agent': `${this.clientName} ${this.clientVersion} (${this.clientContact})`,
              Accept: 'text/html'
            }
          });
          if (response?.ok) {
            const html = await response.text();
            const match = String(html || '').match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
            if (match?.[1]) identity.credits = JSON.parse(`"${match[1]}"`);
            const durationMatch = String(html || '').match(/"lengthSeconds"\s*:\s*"?(\d+)"?/);
            identity.duration = SyncedLyricsService.normalizeDuration(durationMatch?.[1]);
          }
        } catch (error) {
          this.logger.warn?.(`[Lyrics] Không lấy được credit YouTube ${videoId}:`, error.message);
        }
      }
      return identity;
    } catch (error) {
      this.logger.warn?.(`[Lyrics] Không lấy được danh tính YouTube ${videoId}:`, error.message);
      return null;
    }
  }

  scoreAppleCandidate(candidate, identity) {
    const targetTitle = SyncedLyricsService.normalizeComparable(identity.title);
    const targetArtist = SyncedLyricsService.normalizeComparable(identity.artist);
    const candidateTitle = SyncedLyricsService.normalizeComparable(candidate?.trackName);
    const candidateArtist = SyncedLyricsService.normalizeComparable(candidate?.artistName);
    const targetCoreTitle = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(identity.title));
    const candidateCoreTitle = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(candidate?.trackName));
    const titleMatches = candidateTitle === targetTitle
      || candidateTitle.includes(targetTitle)
      || targetTitle.includes(candidateTitle)
      || (candidateCoreTitle && candidateCoreTitle === targetCoreTitle);
    // Artist and duration alone are not enough to identify a song. Without
    // this guard iTunes can replace the requested title with another track by
    // the same artist that happens to have a similar duration.
    if (!targetTitle || !candidateTitle || !titleMatches) return -100;
    let score = 0;
    if (candidateTitle === targetTitle) score += 8;
    else if (candidateCoreTitle === targetCoreTitle) score += 6;
    else score += 4;
    if (candidateArtist === targetArtist) score += 6;
    else if (candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist)) score += 3;
    const targetDuration = Number(identity.duration) || 0;
    const candidateDuration = Number(candidate?.trackTimeMillis) / 1000 || 0;
    if (targetDuration > 0 && candidateDuration > 0) {
      const difference = Math.abs(targetDuration - candidateDuration);
      if (difference <= 2.5) score += 6;
      else if (difference <= 8) score += 3;
      else if (difference > 20) score -= 4;
    }
    return score;
  }

  async resolveAppleMetadata(identity, sourceUrl) {
    const appleTrackId = SyncedLyricsService.parseAppleTrackId(sourceUrl);
    let results = [];
    try {
      if (appleTrackId) {
        const payload = await this.fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appleTrackId)}&entity=song`);
        results = Array.isArray(payload?.results) ? payload.results : [];
      }
      if (!results.some(item => item?.kind === 'song')) {
        const term = [identity.title, identity.artist].filter(Boolean).join(' ');
        if (!term) return null;
        const url = new URL('https://itunes.apple.com/search');
        url.searchParams.set('term', term);
        url.searchParams.set('media', 'music');
        url.searchParams.set('entity', 'song');
        url.searchParams.set('country', 'VN');
        url.searchParams.set('limit', '10');
        const payload = await this.fetchJson(url);
        results = Array.isArray(payload?.results) ? payload.results : [];
      }
    } catch (error) {
      this.logger.warn?.('[Lyrics] Apple/iTunes metadata không khả dụng:', error.message);
      return null;
    }

    const candidates = results.filter(item => item?.kind === 'song' && item.trackName && item.artistName);
    candidates.sort((left, right) => this.scoreAppleCandidate(right, identity) - this.scoreAppleCandidate(left, identity));
    const best = candidates[0];
    if (!best || this.scoreAppleCandidate(best, identity) < 7) return null;
    return {
      title: String(best.trackName || '').trim(),
      artist: String(best.artistName || '').trim(),
      album: String(best.collectionName || '').trim(),
      duration: Math.max(0, Number(best.trackTimeMillis) / 1000 || 0),
      source: 'apple-itunes'
    };
  }

  scoreLyricsCandidate(candidate, identity) {
    if (!candidate?.syncedLyrics) return -100;
    const title = SyncedLyricsService.normalizeComparable(candidate.trackName);
    const artist = SyncedLyricsService.normalizeComparable(candidate.artistName);
    const targetTitle = SyncedLyricsService.normalizeComparable(identity.title);
    const targetArtist = SyncedLyricsService.normalizeComparable(identity.artist);
    const coreTitle = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(candidate.trackName));
    const targetCoreTitle = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(identity.title));
    const titleSimilarity = SyncedLyricsService.getTokenSimilarity(coreTitle, targetCoreTitle);
    let score = 0;
    if (title === targetTitle) score += 12;
    else if (coreTitle && coreTitle === targetCoreTitle) score += 10;
    else if (title.includes(targetTitle) || targetTitle.includes(title)) score += 6;
    else if (titleSimilarity >= 0.75) score += 5;
    else if (titleSimilarity >= 0.5) score += 2;
    if (artist === targetArtist) score += 8;
    else if (SyncedLyricsService.hasRelatedArtist(artist, targetArtist)) score += 4;
    const namedVersionCredits = SyncedLyricsService.extractNamedVersionCredits(identity?.title);
    if (namedVersionCredits.length && SyncedLyricsService.hasNamedVersionCredits(candidate, identity)) score += 12;
    if (SyncedLyricsService.hasExactDuration(candidate, identity)) score += 16;
    else if (this.hasCompatibleDuration(candidate, identity)) score += 12;
    else score -= 100;
    const quality = SyncedLyricsService.getLyricsQuality(candidate);
    if (!quality.complete) score -= 30;
    if (quality.lines.length >= 30) score += 8;
    else if (quality.lines.length >= 10) score += 4;
    if (quality.textCoverage !== null) {
      if (quality.textCoverage >= 0.65) score += 10;
      else if (quality.textCoverage >= 0.35) score += 4;
    }
    if (quality.timeCoverage !== null && quality.timeCoverage >= 0.75) score += 4;
    return score;
  }

  isLyricsCandidateRelated(candidate, identity) {
    if (!SyncedLyricsService.hasRequiredArtists(candidate, identity)) return false;
    const candidateTitle = SyncedLyricsService.normalizeComparable(candidate?.trackName);
    const targetTitle = SyncedLyricsService.normalizeComparable(identity?.title);
    const candidateCore = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(candidate?.trackName));
    const targetCore = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(identity?.title));
    const titleRelated = Boolean(candidateTitle && targetTitle) && (
      candidateTitle === targetTitle
      || candidateCore === targetCore
      || candidateTitle.includes(targetTitle)
      || targetTitle.includes(candidateTitle)
      || SyncedLyricsService.getTokenSimilarity(candidateCore, targetCore) >= 0.5
    );
    if (titleRelated) return true;
    return SyncedLyricsService.hasExactDuration(candidate, identity)
      && SyncedLyricsService.hasRelatedArtist(candidate?.artistName, identity?.artist)
      && SyncedLyricsService.getTokenSimilarity(candidateCore, targetCore) >= 0.25;
  }

  async resolveLrclib(identity, aliases = [], trace = null) {
    const exactUrl = new URL('https://lrclib.net/api/get');
    exactUrl.searchParams.set('track_name', identity.title);
    exactUrl.searchParams.set('artist_name', identity.artist);
    exactUrl.searchParams.set('album_name', identity.album || '');
    exactUrl.searchParams.set('duration', String(SyncedLyricsService.normalizeDuration(identity.duration)));
    if (trace) trace.exactRequest = exactUrl.toString();
    let exactFallback = null;
    try {
      const exact = await this.fetchJson(exactUrl, { 'Lrclib-Client': `${this.clientName}/${this.clientVersion}` });
      exactFallback = exact;
      const exactQuality = SyncedLyricsService.getLyricsQuality(exact);
      const exactDuration = SyncedLyricsService.hasExactDuration(exact, identity);
      const compatibleDuration = this.hasCompatibleDuration(exact, identity);
      const requiredArtistsMatch = SyncedLyricsService.hasRequiredArtists(exact, identity);
      const namedVersionCreditsMatch = SyncedLyricsService.hasNamedVersionCredits(exact, identity);
      const timelineCoverageMatch = SyncedLyricsService.hasSufficientTimelineCoverage(exactQuality.lines, identity);
      if (trace) trace.exactCandidate = this.summarizeDebugCandidate(exact, identity, {
        quality: exactQuality,
        exactDuration,
        requiredArtistsMatch,
        namedVersionCreditsMatch,
        timelineCoverageMatch,
        accepted: exactQuality.complete && compatibleDuration && requiredArtistsMatch && namedVersionCreditsMatch && timelineCoverageMatch
      });
      // A named remix can have several LRCLIB records with the exact same title
      // and duration but different timeline offsets. Do not accept the first
      // `/get` result until its artist credits also identify the named remixer.
      if (exactQuality.complete && compatibleDuration && requiredArtistsMatch && namedVersionCreditsMatch && timelineCoverageMatch) return exact;
    } catch (error) {
      if (trace) trace.exactError = { message: error.message, status: error.status || 0 };
      if (error.status !== 400 && error.status !== 404) throw error;
    }

    const searchIdentities = [identity, ...aliases]
      .filter(item => item?.title)
      .map(item => ({ ...item, duration: Number(identity.duration) || Number(item.duration) || 0 }));
    const searchQueries = [];
    const queryKeys = new Set();
    const addQuery = query => {
      const normalized = Object.entries(query).filter(([, value]) => value).sort().map(([key, value]) => `${key}=${value}`).join('&');
      if (!normalized || queryKeys.has(normalized)) return;
      queryKeys.add(normalized);
      searchQueries.push(query);
    };
    searchIdentities.forEach(searchIdentity => {
      const coreTitle = SyncedLyricsService.getCoreTrackTitle(searchIdentity.title);
      addQuery({ track_name: searchIdentity.title, artist_name: searchIdentity.artist });
      addQuery({ track_name: searchIdentity.title });
      if (coreTitle && SyncedLyricsService.normalizeComparable(coreTitle) !== SyncedLyricsService.normalizeComparable(searchIdentity.title)) {
        addQuery({ track_name: coreTitle, artist_name: searchIdentity.artist });
        addQuery({ track_name: coreTitle });
      }
      addQuery({ q: [coreTitle || searchIdentity.title, searchIdentity.artist].filter(Boolean).join(' ') });
    });
    const collected = new Map();
    if (exactFallback) {
      const key = String(exactFallback?.id || [exactFallback?.trackName, exactFallback?.artistName, exactFallback?.duration].join('|'));
      collected.set(key, exactFallback);
    }
    for (const query of searchQueries) {
      const searchUrl = new URL('https://lrclib.net/api/search');
      Object.entries(query).forEach(([key, value]) => {
        if (value) searchUrl.searchParams.set(key, value);
      });
      if (trace) trace.searchRequests.push(searchUrl.toString());
      const matches = await this.fetchJson(searchUrl, { 'Lrclib-Client': `${this.clientName}/${this.clientVersion}` });
      if (Array.isArray(matches)) {
        matches.forEach(item => {
          const key = String(item?.id || [item?.trackName, item?.artistName, item?.duration].join('|'));
          const existing = collected.get(key);
          const bestItemScore = Math.max(...searchIdentities.map(searchIdentity => this.scoreLyricsCandidate(item, searchIdentity)));
          const bestExistingScore = existing
            ? Math.max(...searchIdentities.map(searchIdentity => this.scoreLyricsCandidate(existing, searchIdentity)))
            : -Infinity;
          if (!existing || bestItemScore > bestExistingScore) {
            collected.set(key, item);
          }
        });
      }
      const ranked = [...collected.values()]
        .map(item => ({
          item,
          quality: SyncedLyricsService.getLyricsQuality(item),
          score: Math.max(...searchIdentities.map(searchIdentity => this.scoreLyricsCandidate(item, searchIdentity))),
          related: searchIdentities.some(searchIdentity => this.isLyricsCandidateRelated(item, searchIdentity))
        }))
        .filter(candidate => candidate.quality.complete
          && candidate.related
          && searchIdentities.some(searchIdentity => SyncedLyricsService.hasNamedVersionCredits(candidate.item, searchIdentity))
          && searchIdentities.some(searchIdentity => this.hasCompatibleDuration(candidate.item, searchIdentity))
          && searchIdentities.some(searchIdentity => SyncedLyricsService.hasSufficientTimelineCoverage(candidate.quality.lines, searchIdentity)))
        .sort((left, right) => right.score - left.score);
      if (trace) {
        trace.candidates = [...collected.values()].map(item => {
          const quality = SyncedLyricsService.getLyricsQuality(item);
          const score = Math.max(...searchIdentities.map(searchIdentity => this.scoreLyricsCandidate(item, searchIdentity)));
          const related = searchIdentities.some(searchIdentity => this.isLyricsCandidateRelated(item, searchIdentity));
          const exactDuration = searchIdentities.some(searchIdentity => SyncedLyricsService.hasExactDuration(item, searchIdentity));
          const compatibleDuration = searchIdentities.some(searchIdentity => this.hasCompatibleDuration(item, searchIdentity));
          const requiredArtistsMatch = searchIdentities.some(searchIdentity => SyncedLyricsService.hasRequiredArtists(item, searchIdentity));
          const namedVersionCreditsMatch = searchIdentities.some(searchIdentity => SyncedLyricsService.hasNamedVersionCredits(item, searchIdentity));
          const timelineCoverageMatch = searchIdentities.some(searchIdentity => SyncedLyricsService.hasSufficientTimelineCoverage(quality.lines, searchIdentity));
          return this.summarizeDebugCandidate(item, identity, {
            quality,
            score,
            related,
            exactDuration,
            requiredArtistsMatch,
            namedVersionCreditsMatch,
            timelineCoverageMatch,
            accepted: quality.complete && related && compatibleDuration && namedVersionCreditsMatch && timelineCoverageMatch && score >= 12
          });
        }).sort((left, right) => right.score - left.score);
      }
      if (ranked[0]?.score >= 12) return ranked[0].item;
    }
    return null;
  }

  async resolveUnison(videoId, identity, trace = null) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) return null;
    const url = new URL(this.unisonApiUrl);
    url.searchParams.set('v', videoId);
    url.searchParams.set('song', identity.title);
    url.searchParams.set('artist', identity.artist);
    url.searchParams.set('duration', String(SyncedLyricsService.normalizeDuration(identity.duration)));
    if (identity.album) url.searchParams.set('album', identity.album);
    if (trace) trace.providers.unison = { request: url.toString() };
    try {
      const payload = await this.fetchJson(url);
      const data = payload?.data || payload;
      if (!data?.lyrics || String(data.videoId || videoId) !== String(videoId)) return null;
      const lines = data.format === 'ttml'
        ? SyncedLyricsService.parseTtmlLyrics(data.lyrics)
        : data.format === 'lrc'
          ? SyncedLyricsService.parseSyncedLyrics(data.lyrics)
          : [];
      if (!lines.length) return null;
      if (trace) trace.providers.unison.result = { format: data.format, lines: lines.length, id: data.id || null };
      return {
        source: 'Unison',
        trackName: String(data.song || identity.title),
        artistName: String(data.artist || identity.artist),
        albumName: String(data.album || identity.album || ''),
        duration: Number(identity.duration) || 0,
        durationVerified: false,
        lines
      };
    } catch (error) {
      if (trace) trace.providers.unison.error = { message: error.message, status: error.status || 0 };
      return null;
    }
  }

  async resolveBiniLyrics(identity, aliases = [], trace = null) {
    const identities = [identity, ...aliases].filter(item => item?.title && item?.artist);
    if (trace) trace.providers.biniLyrics = { requests: [], candidates: [] };
    for (const searchIdentity of identities) {
      const url = new URL(this.biniLyricsApiUrl);
      url.searchParams.set('track', searchIdentity.title);
      url.searchParams.set('artist', searchIdentity.artist);
      if (searchIdentity.album) url.searchParams.set('album', searchIdentity.album);
      url.searchParams.set('duration', String(SyncedLyricsService.normalizeDuration(identity.duration)));
      if (trace) trace.providers.biniLyrics.requests.push(url.toString());
      try {
        const payload = await this.fetchJson(url);
        const matches = Array.isArray(payload?.results) ? payload.results : [];
        const ranked = matches.map(item => ({
          raw: item,
          trackName: item.track_name || item.trackName || '',
          artistName: item.artist_name || item.artistName || '',
          albumName: item.album_name || item.albumName || '',
          duration: Number(item.duration) || 0,
          lyricsUrl: item.lyricsUrl || item.lyrics_url || ''
        })).filter(item => item.lyricsUrl
          && this.hasCompatibleDuration(item, identity)
          && SyncedLyricsService.hasRequiredArtists(item, searchIdentity)
          && SyncedLyricsService.hasNamedVersionCredits(item, searchIdentity)
          && this.isLyricsCandidateRelated(item, searchIdentity))
          .sort((left, right) => this.scoreProviderMetadata(right, searchIdentity) - this.scoreProviderMetadata(left, searchIdentity));
        if (trace) trace.providers.biniLyrics.candidates.push(...ranked.map(item => ({
          trackName: item.trackName,
          artistName: item.artistName,
          duration: SyncedLyricsService.normalizeDuration(item.duration),
          score: this.scoreProviderMetadata(item, searchIdentity)
        })));
        for (const candidate of ranked.slice(0, 3)) {
          const lyricsUrl = new URL(candidate.lyricsUrl);
          if (lyricsUrl.protocol !== 'https:' || !/(^|\.)binimum\.org$/i.test(lyricsUrl.hostname)) continue;
          const ttml = await this.fetchText(lyricsUrl);
          const lines = SyncedLyricsService.parseTtmlLyrics(ttml);
          if (lines.length) return { ...candidate, source: 'BiniLyrics', durationVerified: true, lines };
        }
      } catch (error) {
        if (trace) trace.providers.biniLyrics.error = { message: error.message, status: error.status || 0 };
      }
    }
    return null;
  }

  scoreProviderMetadata(candidate, identity) {
    const candidateTitle = SyncedLyricsService.normalizeComparable(candidate?.trackName);
    const targetTitle = SyncedLyricsService.normalizeComparable(identity?.title);
    const candidateCore = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(candidate?.trackName));
    const targetCore = SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(identity?.title));
    let score = SyncedLyricsService.hasExactDuration(candidate, identity)
      ? 20
      : this.hasCompatibleDuration(candidate, identity) ? 16 : -100;
    if (candidateTitle === targetTitle) score += 12;
    else if (candidateCore === targetCore) score += 10;
    else score += Math.round(SyncedLyricsService.getTokenSimilarity(candidateCore, targetCore) * 8);
    if (SyncedLyricsService.hasRelatedArtist(candidate?.artistName, identity?.artist)) score += 8;
    if (SyncedLyricsService.hasNamedVersionCredits(candidate, identity)) score += 8;
    return score;
  }

  async resolveYouTubeCaptions(videoId, identity, trace = null) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) return null;
    if (trace) trace.providers.youtubeCaptions = {};
    try {
      const page = await this.fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { Accept: 'text/html' });
      const rawTracks = page.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"audioTracks"/i)?.[1];
      if (!rawTracks) return null;
      const tracks = JSON.parse(rawTracks);
      const manualTracks = tracks.filter(track => track?.baseUrl && track?.kind !== 'asr');
      if (!manualTracks.length) return null;
      const track = manualTracks.find(item => !/translated/i.test(String(item?.name?.simpleText || ''))) || manualTracks[0];
      const captionsUrl = new URL(track.baseUrl);
      captionsUrl.searchParams.set('fmt', 'json3');
      const payload = await this.fetchJson(captionsUrl);
      const lines = (Array.isArray(payload?.events) ? payload.events : []).map(event => ({
        time: Math.max(0, Number(event?.tStartMs) || 0) / 1000,
        text: (Array.isArray(event?.segs) ? event.segs : []).map(segment => segment?.utf8 || '').join('').replace(/[♪♫♬]/g, '').replace(/\s+/g, ' ').trim()
      })).filter(line => line.text);
      if (!lines.length) return null;
      if (trace) trace.providers.youtubeCaptions.result = { language: track.languageCode || '', lines: lines.length };
      return {
        source: 'YouTube Captions',
        trackName: identity.title,
        artistName: identity.artist,
        albumName: identity.album || '',
        duration: Number(identity.duration) || 0,
        durationVerified: false,
        lines
      };
    } catch (error) {
      if (trace) trace.providers.youtubeCaptions.error = { message: error.message, status: error.status || 0 };
      return null;
    }
  }

  static findYouTubeMusicLyricsBrowseId(value) {
    if (!value || typeof value !== 'object') return '';
    const endpoint = value?.tabRenderer?.endpoint?.browseEndpoint;
    if (endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS') {
      return String(endpoint.browseId || '');
    }
    for (const child of Object.values(value)) {
      const found = SyncedLyricsService.findYouTubeMusicLyricsBrowseId(child);
      if (found) return found;
    }
    return '';
  }

  static findYouTubeMusicPlainLyrics(value) {
    if (!value || typeof value !== 'object') return null;
    const shelf = value.musicDescriptionShelfRenderer;
    if (shelf?.description?.runs) {
      const text = shelf.description.runs.map(run => run?.text || '').join('').trim();
      if (text) {
        return {
          text,
          source: shelf.footer?.runs?.map(run => run?.text || '').join('').replace(/^Nguồn:\s*/i, '').trim()
        };
      }
    }
    for (const child of Object.values(value)) {
      const found = SyncedLyricsService.findYouTubeMusicPlainLyrics(child);
      if (found) return found;
    }
    return null;
  }

  async resolveYouTubeMusicPlainLyrics(videoId, identity, trace = null) {
    if (trace) trace.providers.youtubeMusicLyrics = {};
    if (!videoId) return null;
    try {
      const context = {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20260810.01.00',
          hl: 'vi',
          gl: 'VN'
        }
      };
      const nextResponse = await this.fetchJson('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com'
      }, { method: 'POST', body: JSON.stringify({ context, videoId }) });
      const browseId = SyncedLyricsService.findYouTubeMusicLyricsBrowseId(nextResponse);
      if (!browseId) return null;
      const browseResponse = await this.fetchJson('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com'
      }, { method: 'POST', body: JSON.stringify({ context, browseId }) });
      const lyrics = SyncedLyricsService.findYouTubeMusicPlainLyrics(browseResponse);
      const lines = String(lyrics?.text || '').split(/\r?\n/).map(text => text.trim()).filter(Boolean)
        .map(text => ({ time: 0, text }));
      if (!lines.length) return null;
      if (trace) trace.providers.youtubeMusicLyrics.result = {
        browseId,
        source: lyrics.source || 'YouTube Music',
        synced: false,
        lines: lines.length
      };
      return {
        source: `YouTube Music · ${lyrics.source || 'Lyrics'}`,
        synced: false,
        trackName: identity.title,
        artistName: identity.artist,
        albumName: identity.album || '',
        duration: Number(identity.duration) || 0,
        lines
      };
    } catch (error) {
      if (trace) trace.providers.youtubeMusicLyrics.error = { message: error.message, status: error.status || 0 };
      return null;
    }
  }

  async fetchMusixmatch(action, parameters = {}) {
    const url = new URL(action, this.musixmatchApiUrl);
    Object.entries(parameters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    url.searchParams.set('app_id', 'web-desktop-app-v1.0');
    url.searchParams.set('t', String(this.now()));
    return this.fetchJson(url, {
      Origin: 'https://www.musixmatch.com',
      Referer: 'https://www.musixmatch.com/',
      'Accept-Language': 'en-US,en;q=0.9'
    });
  }

  async getMusixmatchToken() {
    if (this.musixmatchToken) return this.musixmatchToken;
    if (this.musixmatchTokenPromise) return this.musixmatchTokenPromise;
    this.musixmatchTokenPromise = this.fetchMusixmatch('token.get', { user_language: 'en' })
      .then(payload => {
        const token = String(payload?.message?.body?.user_token || '');
        if (Number(payload?.message?.header?.status_code) !== 200 || !token) return '';
        this.musixmatchToken = token;
        return token;
      })
      .catch(() => '')
      .finally(() => { this.musixmatchTokenPromise = null; });
    return this.musixmatchTokenPromise;
  }

  async resolveMusixmatch(identity, trace = null) {
    if (trace) trace.providers.musixmatch = {};
    try {
      const token = await this.getMusixmatchToken();
      if (!token) return null;
      const matchPayload = await this.fetchMusixmatch('matcher.track.get', {
        usertoken: token,
        q_track: identity.title,
        q_artist: identity.artist,
        album: identity.album || '',
        page_size: 1,
        page: 1
      });
      const status = Number(matchPayload?.message?.header?.status_code) || 0;
      if (status === 401) this.musixmatchToken = '';
      if (status !== 200) return null;
      const track = matchPayload?.message?.body?.track;
      if (!track?.track_id || !track?.has_subtitles) return null;
      const candidate = {
        trackName: String(track.track_name || ''),
        artistName: String(track.artist_name || ''),
        albumName: String(track.album_name || ''),
        duration: Number(track.track_length) || 0
      };
      const candidateCore = SyncedLyricsService.getCoreTrackTitle(candidate.trackName);
      const identityCore = SyncedLyricsService.getCoreTrackTitle(identity.title);
      const titleRelated = SyncedLyricsService.getTokenSimilarity(candidateCore, identityCore) >= 0.75;
      const artistRelated = SyncedLyricsService.hasRelatedArtist(candidate.artistName, identity.artist);
      const versionMatches = SyncedLyricsService.hasNamedVersionCredits(candidate, identity);
      if (!titleRelated || !artistRelated || !versionMatches) return null;

      const subtitlePayload = await this.fetchMusixmatch('track.subtitle.get', {
        usertoken: token,
        track_id: track.track_id,
        subtitle_format: 'lrc'
      });
      const syncedLyrics = String(subtitlePayload?.message?.body?.subtitle?.subtitle_body || '');
      const lines = SyncedLyricsService.parseSyncedLyrics(syncedLyrics);
      const targetDuration = SyncedLyricsService.normalizeDuration(identity.duration);
      const lastTimestamp = lines.at(-1)?.time || 0;
      // Some new Musixmatch releases expose track_length=0. In that case the
      // exact matcher result is still safe only when its timeline substantially
      // covers, and never exceeds, the authoritative YouTube duration.
      const durationMatches = candidate.duration > 0
        ? this.hasCompatibleDuration(candidate, identity)
        : targetDuration > 0 && lastTimestamp >= targetDuration * 0.65 && lastTimestamp <= targetDuration + 1;
      if (!lines.length || !durationMatches) return null;
      if (trace) trace.providers.musixmatch.result = {
        trackId: track.track_id,
        isrc: track.track_isrc || '',
        trackName: candidate.trackName,
        artistName: candidate.artistName,
        trackDuration: candidate.duration,
        expectedDuration: targetDuration,
        lastTimestamp,
        lines: lines.length
      };
      return {
        source: 'Musixmatch',
        ...candidate,
        duration: Number(candidate.duration) || Number(identity.duration) || 0,
        durationVerified: Number(candidate.duration) > 0,
        lines
      };
    } catch (error) {
      if (trace) trace.providers.musixmatch.error = { message: error.message, status: error.status || 0 };
      return null;
    }
  }

  async resolveLyricsPlus(identity, isrc, trace = null) {
    if (trace) trace.providers.lyricsPlus = {};
    const normalizedIsrc = String(isrc || '').trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalizedIsrc)) return null;
    try {
      const url = new URL(this.lyricsPlusApiUrl);
      url.searchParams.set('isrc', normalizedIsrc);
      if (trace) trace.providers.lyricsPlus.request = url.toString();
      const payload = await this.fetchJson(url);
      const rawLines = Array.isArray(payload?.lyrics) ? payload.lyrics : [];
      const lines = rawLines.map(line => ({
        time: Math.max(0, (Number(line?.time) || 0) / 1000),
        text: String(line?.text || '').replace(/\s+/g, ' ').trim()
      })).filter(line => line.text);
      const durationText = String(payload?.metadata?.totalDuration || '');
      const durationParts = durationText.split(':').map(Number);
      const providerDuration = durationParts.length === 2 && durationParts.every(Number.isFinite)
        ? durationParts[0] * 60 + durationParts[1]
        : 0;
      if (!lines.length
        || !providerDuration
        || !this.hasCompatibleDuration({ duration: providerDuration }, identity)) {
        return null;
      }
      if (trace) trace.providers.lyricsPlus.result = {
        isrc: normalizedIsrc,
        source: String(payload?.metadata?.source || 'LyricsPlus'),
        duration: providerDuration,
        lines: lines.length
      };
      return {
        source: `LyricsPlus · ${String(payload?.metadata?.source || 'Cache')}`,
        trackName: identity.title,
        artistName: identity.artist,
        albumName: identity.album || '',
        duration: providerDuration,
        durationVerified: true,
        lines
      };
    } catch (error) {
      if (trace) trace.providers.lyricsPlus.error = { message: error.message, status: error.status || 0 };
      return null;
    }
  }

  summarizeDebugCandidate(candidate, identity, checks = {}) {
    const quality = checks.quality || SyncedLyricsService.getLyricsQuality(candidate);
    return {
      id: candidate?.id ?? null,
      trackName: String(candidate?.trackName || ''),
      artistName: String(candidate?.artistName || ''),
      albumName: String(candidate?.albumName || ''),
      duration: SyncedLyricsService.normalizeDuration(candidate?.duration),
      expectedDuration: SyncedLyricsService.normalizeDuration(identity?.duration),
      lines: quality.lines?.length || 0,
      score: Number.isFinite(checks.score) ? checks.score : this.scoreLyricsCandidate(candidate, identity),
      exactDuration: checks.exactDuration ?? SyncedLyricsService.hasExactDuration(candidate, identity),
      requiredArtistsMatch: checks.requiredArtistsMatch ?? SyncedLyricsService.hasRequiredArtists(candidate, identity),
      namedVersionCreditsMatch: checks.namedVersionCreditsMatch ?? SyncedLyricsService.hasNamedVersionCredits(candidate, identity),
      related: checks.related ?? this.isLyricsCandidateRelated(candidate, identity),
      complete: Boolean(quality.complete),
      timelineCoverageMatch: checks.timelineCoverageMatch
        ?? SyncedLyricsService.hasSufficientTimelineCoverage(quality.lines, identity),
      accepted: Boolean(checks.accepted)
    };
  }

  getCacheKey(song) {
    return [song?.videoId, song?.sourceUrl || song?.songLink || song?.url, song?.title, song?.author || song?.channelName, SyncedLyricsService.normalizeDuration(song?.duration)]
      .map(value => String(value || '').trim().toLowerCase())
      .join('|');
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    const ttl = entry.result?.available ? this.cacheTtlMs : this.failureCacheTtlMs;
    if (this.now() - entry.timestamp >= ttl) {
      this.cache.delete(key);
      return null;
    }
    return { ...entry.result, cached: true };
  }

  async resolve(song = {}) {
    const key = this.getCacheKey(song);
    const cached = this.getCached(key);
    if (cached) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const request = this.resolveUncached(song)
      .catch(error => {
        this.logger.warn?.('[Lyrics] Không thể tải lời đồng bộ:', error.message);
        return { available: false, eligible: true, reason: error.status === 429 ? 'rate_limited' : 'provider_error', retryAfter: error.retryAfter || '' };
      })
      .then(result => {
        this.cache.set(key, { timestamp: this.now(), result });
        return result;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  async debug(song = {}) {
    const trace = {
      generatedAt: new Date(this.now()).toISOString(),
      input: {
        videoId: String(song.videoId || ''),
        title: String(song.title || ''),
        artist: String(song.rawAuthor || song.author || song.channelName || ''),
        playerDuration: SyncedLyricsService.normalizeDuration(song.duration),
        sourceUrl: String(song.sourceUrl || song.songLink || song.url || '')
      },
      searchRequests: [],
      candidates: [],
      providers: {}
    };
    try {
      const result = await this.resolveUncached(song, trace);
      trace.result = { ...result, lines: Array.isArray(result.lines) ? `${result.lines.length} lines` : [] };
    } catch (error) {
      trace.result = { available: false, reason: 'provider_error', error: error.message, status: error.status || 0 };
    }
    return trace;
  }

  async resolveUncached(song, trace = null) {
    if (trace && !trace.providers) trace.providers = {};
    const sourceUrl = song.sourceUrl || song.songLink || song.url || '';
    const isAppleSource = SyncedLyricsService.isAppleMusicUrl(sourceUrl);
    const isYouTubeMusicSource = SyncedLyricsService.isYouTubeMusicUrl(sourceUrl);
    let youtubeIdentity = null;
    const suppliedArtist = song.rawAuthor || song.author || song.channelName || '';
    const suppliedTitle = String(song.title || '');
    if (song.videoId) youtubeIdentity = await this.fetchYouTubeIdentity(song.videoId, {
      includeCredits: isYouTubeMusicSource
        || (SyncedLyricsService.isTopicChannel(suppliedArtist) && /(?:feat(?:uring)?\.?|ft\.?)\s/i.test(suppliedTitle))
    });
    // Preserve the source classification before a metadata fallback replaces
    // the literal "- Topic" channel with the real artist name.
    const youtubeWasTopic = SyncedLyricsService.isTopicChannel(youtubeIdentity?.rawArtist || suppliedArtist);
    const suppliedDuration = Number(song.duration) || 0;
    const youtubeArtistMissing = SyncedLyricsService.isPlaceholderArtist(youtubeIdentity?.rawArtist || suppliedArtist);
    const youtubeDurationMissing = !(Number(youtubeIdentity?.duration) > 0 || suppliedDuration > 0);
    let verifiedReleaseMetadata = false;
    if (song.videoId && this.resolveYouTubeMetadata && (youtubeArtistMissing || youtubeDurationMissing)) {
      try {
        const fallback = await this.resolveYouTubeMetadata(song.videoId);
        if (fallback) {
          verifiedReleaseMetadata = fallback.isReleaseMetadata === true;
          youtubeIdentity = {
            ...(youtubeIdentity || {}),
            title: String(fallback.title || fallback.track || youtubeIdentity?.title || suppliedTitle).trim(),
            rawArtist: String(fallback.artist || fallback.creator || fallback.uploader || youtubeIdentity?.rawArtist || suppliedArtist).trim(),
            credits: String(fallback.description || youtubeIdentity?.credits || ''),
            duration: Math.max(0, Number(fallback.duration) || Number(youtubeIdentity?.duration) || suppliedDuration),
            album: String(fallback.album || '').trim(),
            metadataFallbackSource: String(fallback.source || 'youtube-metadata-fallback')
          };
        }
      } catch (error) {
        this.logger.warn?.(`[Lyrics] Metadata YouTube dự phòng thất bại ${song.videoId}:`, error.message);
        if (trace) trace.youtubeFallbackError = error.message;
      }
    }
    if (trace) trace.youtube = youtubeIdentity ? { ...youtubeIdentity } : null;
    const rawArtist = youtubeIdentity?.rawArtist || song.rawAuthor || song.author || song.channelName || '';
    const rawTitle = youtubeIdentity?.title || song.title || '';
    const isTopic = youtubeWasTopic || SyncedLyricsService.isTopicChannel(rawArtist);
    const isKaraoke = SyncedLyricsService.isKaraokeSource(rawTitle, rawArtist);
    const hasCuratedLyrics = Boolean(SyncedLyricsService.getCuratedLyrics(song.videoId, {
      title: rawTitle,
      artist: rawArtist,
      rawArtist,
      credits: youtubeIdentity?.credits
    }));
    // A music-looking title is not an authoritative release identity. Regular
    // YouTube uploads (MV, live, fan edit, compilation, etc.) can share a title
    // with a Topic track while using a different cut or arrangement. Only
    // Topic, YouTube Music, Apple Music, Karaoke, and Curated sources may auto-attach lyrics.
    if (!isAppleSource && !isYouTubeMusicSource && !isTopic && !verifiedReleaseMetadata && !isKaraoke && !hasCuratedLyrics) {
      return { available: false, eligible: false, reason: 'unsupported_source' };
    }

    let cleanedTitle = SyncedLyricsService.cleanTrackTitle(rawTitle);
    let cleanedArtist = SyncedLyricsService.cleanArtist(rawArtist);

    if (isKaraoke) {
      const parts = cleanedTitle.split(/\s*[-–—|]\s*/).filter(Boolean);
      if (parts.length >= 2) {
        cleanedTitle = parts[0].trim();
        cleanedArtist = parts.slice(1).join(' - ').trim();
      }
    }

    const identity = {
      title: cleanedTitle,
      artist: cleanedArtist,
      album: String(song.albumName || song.album || youtubeIdentity?.album || '').trim(),
      // A Topic watch page is the authoritative identity for the exact
      // YouTube upload. This keeps the 100% duration rule while correcting
      // player values that were truncated by one second (205 vs 206).
      duration: Math.max(0, Number(youtubeIdentity?.duration) || Number(song.duration) || 0)
    };
    const isrc = String(song.isrc || await this.resolveTrackIsrc?.({ ...song, identity, youtubeIdentity }) || '').trim().toUpperCase();
    if (trace) trace.identity = { ...identity, playerDuration: SyncedLyricsService.normalizeDuration(song.duration) };
    if (trace) trace.isrc = isrc || null;
    if (!identity.title || !identity.artist) return { available: false, eligible: true, reason: 'missing_metadata' };
    if (!SyncedLyricsService.normalizeDuration(identity.duration)) {
      return { available: false, eligible: true, reason: 'missing_duration' };
    }

    const apple = await this.resolveAppleMetadata(identity, sourceUrl);
    if (trace) trace.apple = apple ? { ...apple, normalizedDuration: SyncedLyricsService.normalizeDuration(apple.duration) } : null;
    const appleTitleMatchesExactly = apple
      && SyncedLyricsService.normalizeComparable(apple.title) === SyncedLyricsService.normalizeComparable(identity.title);
    // Apple search often returns a different featured/collaboration version
    // with the same base title and duration. Keep YouTube's authoritative
    // title unless Apple agrees exactly; Apple Music links still use Apple's
    // complete metadata because that source identifies the release itself.
    const appleFeaturedArtists = apple ? SyncedLyricsService.extractFeaturedArtists(`${apple.title} ${apple.album}`) : [];
    const confirmedFeaturedArtists = appleFeaturedArtists.filter(artist =>
      SyncedLyricsService.includesArtist(youtubeIdentity?.credits, artist)
    );
    const appleCoreTitleMatches = apple
      && SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(apple.title))
      === SyncedLyricsService.normalizeComparable(SyncedLyricsService.getCoreTrackTitle(identity.title));
    const allAppleFeaturedArtistsConfirmed = appleFeaturedArtists.length > 0
      && confirmedFeaturedArtists.length === appleFeaturedArtists.length;
    const appleCollaborationConfirmed = apple
      && appleCoreTitleMatches
      && allAppleFeaturedArtistsConfirmed;
    const trustedApple = apple && (isAppleSource || appleTitleMatchesExactly || appleCollaborationConfirmed) ? apple : null;
    const canonical = trustedApple || {
      ...identity,
      source: isAppleSource
        ? 'apple-link'
        : isYouTubeMusicSource
          ? 'youtube-music'
          : isTopic
            ? 'youtube-topic'
            : isKaraoke
              ? 'youtube-karaoke'
              : 'youtube-topic'
    };
    if (confirmedFeaturedArtists.length) canonical.requiredArtists = confirmedFeaturedArtists;
    if (!canonical.duration) canonical.duration = identity.duration;
    if (trace) {
      trace.matching = {
        appleTitleMatchesExactly: Boolean(appleTitleMatchesExactly),
        appleCoreTitleMatches: Boolean(appleCoreTitleMatches),
        appleFeaturedArtists,
        confirmedFeaturedArtists,
        appleCollaborationConfirmed: Boolean(appleCollaborationConfirmed),
        trustedApple: Boolean(trustedApple)
      };
      trace.canonical = { ...canonical, duration: SyncedLyricsService.normalizeDuration(canonical.duration) };
    }
    const appleCoreSimilarity = apple
      ? SyncedLyricsService.getTokenSimilarity(
        SyncedLyricsService.getCoreTrackTitle(apple.title),
        SyncedLyricsService.getCoreTrackTitle(identity.title)
      )
      : 0;
    const appleAliasEligible = apple
      && apple !== trustedApple
      && appleCoreSimilarity >= 0.75
      && SyncedLyricsService.hasExactDuration(apple, identity);
    const aliases = [];
    if (appleAliasEligible) aliases.push({ ...apple, requiredArtists: confirmedFeaturedArtists });
    if (trustedApple && SyncedLyricsService.normalizeComparable(trustedApple.title) !== SyncedLyricsService.normalizeComparable(identity.title)) {
      aliases.push({ ...identity, requiredArtists: confirmedFeaturedArtists });
    }
    const curated = SyncedLyricsService.getCuratedLyrics(song.videoId, canonical);
    const syncedProviders = [
      ['Curated', Promise.resolve(curated ? {
        source: curated.source || 'Introvert Verified LRC',
        trackName: curated.trackName,
        artistName: curated.artistName,
        albumName: curated.albumName,
        duration: curated.duration,
        durationVerified: true,
        lines: SyncedLyricsService.parseSyncedLyrics(curated.syncedLyrics)
      } : null)],
      ['LRCLIB', this.resolveLrclib(canonical, aliases, trace).then(record => {
        if (!record) return null;
        return {
          source: 'LRCLIB',
          trackName: String(record.trackName || canonical.title),
          artistName: String(record.artistName || canonical.artist),
          albumName: String(record.albumName || canonical.album || ''),
          duration: Math.max(0, Number(record.duration) || Number(canonical.duration) || 0),
          durationVerified: Number(record.duration) > 0,
          lines: SyncedLyricsService.parseSyncedLyrics(record.syncedLyrics)
        };
      })],
      ['LyricsPlus', this.resolveLyricsPlus(canonical, isrc, trace)],
      ['Unison', this.resolveUnison(song.videoId, canonical, trace)],
      ['BiniLyrics', this.resolveBiniLyrics(canonical, aliases, trace)],
      ['YouTube Captions', this.resolveYouTubeCaptions(song.videoId, canonical, trace)],
      ['Musixmatch', this.resolveMusixmatch(canonical, trace)]
    ];
    const providerErrors = [];
    const syncedRecords = [];
    const firstSyncedRecord = await Promise.any(syncedProviders.map(([provider, task]) =>
      task.then(record => {
        if (record?.lines?.length && record.synced !== false
          && SyncedLyricsService.hasSufficientTimelineCoverage(record.lines, canonical)) {
          syncedRecords.push(record);
          return record;
        }
        throw new Error(record?.lines?.length ? 'timeline_incomplete' : 'not_found');
      }).catch(error => {
        providerErrors.push({ provider, message: error.message || String(error) });
        throw error;
      })
    )).catch(() => null);
    if (firstSyncedRecord) {
      const firstDurationDistance = SyncedLyricsService.getDurationDistance(firstSyncedRecord, identity);
      const isMusixmatch = String(firstSyncedRecord.source || '').startsWith('Musixmatch');
      if (this.syncedRaceWindowMs > 0 && (firstSyncedRecord.durationVerified !== true || firstDurationDistance > 0 || isMusixmatch)) {
        await new Promise(resolve => setTimeout(resolve, this.syncedRaceWindowMs));
      }
      const closestRecord = SyncedLyricsService.selectClosestDuration(syncedRecords, identity)
        || firstSyncedRecord;
      if (trace) {
        trace.providers.selected = closestRecord.source;
        trace.providers.syncedCandidates = syncedRecords.map(candidate => ({
          source: candidate.source,
          duration: Number(candidate.duration) || 0,
          durationDistance: SyncedLyricsService.getDurationDistance(candidate, identity)
        }));
        trace.providers.errors = providerErrors.filter(error => error.message !== 'not_found');
      }
      return this.createResolvedResult(closestRecord, canonical);
    }

    // Plain YouTube Music/LyricFind lyrics have no timestamps. Only request
    // them after every synced provider has completed without a usable result.
    let record = null;
    try {
      record = await this.resolveYouTubeMusicPlainLyrics(song.videoId, canonical, trace);
    } catch (error) {
      providerErrors.push({ provider: 'YouTube Music', message: error.message || String(error) });
    }
    if (trace) {
      trace.providers.selected = record?.source || null;
      trace.providers.errors = providerErrors.filter(error => error.message !== 'not_found');
    }
    if (!record?.lines?.length) return { available: false, eligible: true, reason: 'not_found' };
    return this.createResolvedResult(record, canonical);
  }

  async createResolvedResult(record, canonical) {
    const preferredLyrics = await this.lyricsRomanizationService.romanizeLines(record.lines || []);
    return {
      available: true,
      eligible: true,
      synced: record.synced !== false,
      source: preferredLyrics.romanized ? `Phiên âm · ${record.source}` : record.source,
      romanized: preferredLyrics.romanized,
      romanizationLanguage: preferredLyrics.language || '',
      metadataSource: canonical.source,
      trackName: String(record.trackName || canonical.title),
      artistName: String(record.artistName || canonical.artist),
      albumName: String(record.albumName || canonical.album || ''),
      duration: Math.max(0, Number(record.duration) || Number(canonical.duration) || 0),
      lines: preferredLyrics.lines
    };
  }
}

module.exports = { SyncedLyricsService };
