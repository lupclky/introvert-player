'use strict';

class SyncedLyricsService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.now = options.now || Date.now;
    this.logger = options.logger || console;
    this.clientName = options.clientName || 'IntrovertPlayer';
    this.clientVersion = options.clientVersion || 'unknown';
    this.clientContact = options.clientContact || 'https://github.com/';
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || 9000);
    this.cacheTtlMs = Math.max(60000, Number(options.cacheTtlMs) || 24 * 60 * 60 * 1000);
    this.failureCacheTtlMs = Math.max(60000, Number(options.failureCacheTtlMs) || 30 * 60 * 1000);
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

  static cleanTrackTitle(value) {
    return String(value || '')
      .replace(/\s*[\[(](official\s*)?(music\s*)?(audio|video|lyric(s)?|visualizer|mv)[^\])]*[\])]/gi, '')
      .replace(/\s*[\[(](vietsub|lyrics?\s*video|audio\s*only)[^\])]*[\])]/gi, '')
      .replace(/\s*[-–—|]\s*(official\s*)?(audio|lyrics?|visualizer)\s*$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
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
        [finalSound, initialOverrides[index + 1]] = liaison[syllable.final];
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

  async fetchJson(url, headers = {}) {
    if (!this.fetchImpl) throw new Error('fetch is not available');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': `${this.clientName} ${this.clientVersion} (${this.clientContact})`,
          Accept: 'application/json',
          ...headers
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

  async fetchYouTubeIdentity(videoId) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) return null;
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    try {
      const data = await this.fetchJson(url);
      return {
        title: String(data?.title || '').trim(),
        rawArtist: String(data?.author_name || '').trim()
      };
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
    let score = 0;
    if (candidateTitle === targetTitle) score += 8;
    else if (candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle)) score += 4;
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
    let score = 0;
    if (title === targetTitle) score += 10;
    else if (title.includes(targetTitle) || targetTitle.includes(title)) score += 5;
    if (artist === targetArtist) score += 8;
    else if (artist.includes(targetArtist) || targetArtist.includes(artist)) score += 3;
    const duration = Number(candidate.duration) || 0;
    const targetDuration = Number(identity.duration) || 0;
    if (duration > 0 && targetDuration > 0) {
      const difference = Math.abs(duration - targetDuration);
      if (difference <= 2.5) score += 8;
      else if (difference <= 8) score += 4;
      else if (difference > 20) score -= 8;
    }
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

  async resolveLrclib(identity) {
    const exactUrl = new URL('https://lrclib.net/api/get');
    exactUrl.searchParams.set('track_name', identity.title);
    exactUrl.searchParams.set('artist_name', identity.artist);
    exactUrl.searchParams.set('album_name', identity.album || '');
    exactUrl.searchParams.set('duration', String(Math.round(Number(identity.duration) || 0)));
    try {
      const exact = await this.fetchJson(exactUrl, { 'Lrclib-Client': `${this.clientName}/${this.clientVersion}` });
      if (SyncedLyricsService.getLyricsQuality(exact).complete) return exact;
    } catch (error) {
      if (error.status !== 400 && error.status !== 404) throw error;
    }

    const searchUrl = new URL('https://lrclib.net/api/search');
    searchUrl.searchParams.set('track_name', identity.title);
    searchUrl.searchParams.set('artist_name', identity.artist);
    const matches = await this.fetchJson(searchUrl, { 'Lrclib-Client': `${this.clientName}/${this.clientVersion}` });
    if (!Array.isArray(matches)) return null;
    const ranked = matches
      .map(item => ({ item, quality: SyncedLyricsService.getLyricsQuality(item), score: this.scoreLyricsCandidate(item, identity) }))
      .filter(candidate => candidate.quality.complete)
      .sort((left, right) => right.score - left.score);
    return ranked[0]?.score >= 12 ? ranked[0].item : null;
  }

  getCacheKey(song) {
    return [song?.videoId, song?.sourceUrl || song?.songLink || song?.url, song?.title, song?.author || song?.channelName, Math.round(Number(song?.duration) || 0)]
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

  async resolveUncached(song) {
    const sourceUrl = song.sourceUrl || song.songLink || song.url || '';
    const isAppleSource = SyncedLyricsService.isAppleMusicUrl(sourceUrl);
    let youtubeIdentity = null;
    if (song.videoId) youtubeIdentity = await this.fetchYouTubeIdentity(song.videoId);
    const rawArtist = youtubeIdentity?.rawArtist || song.rawAuthor || song.author || song.channelName || '';
    const isTopic = SyncedLyricsService.isTopicChannel(rawArtist);
    if (!isAppleSource && !isTopic) return { available: false, eligible: false, reason: 'unsupported_source' };

    const identity = {
      title: SyncedLyricsService.cleanTrackTitle(youtubeIdentity?.title || song.title),
      artist: SyncedLyricsService.cleanArtist(rawArtist),
      album: String(song.albumName || song.album || '').trim(),
      duration: Math.max(0, Number(song.duration) || 0)
    };
    if (!identity.title || !identity.artist) return { available: false, eligible: true, reason: 'missing_metadata' };

    const apple = await this.resolveAppleMetadata(identity, sourceUrl);
    const canonical = apple || { ...identity, source: isAppleSource ? 'apple-link' : 'youtube-topic' };
    if (!canonical.duration) canonical.duration = identity.duration;
    const record = await this.resolveLrclib(canonical);
    const parsedLines = SyncedLyricsService.parseSyncedLyrics(record?.syncedLyrics);
    const preferredLyrics = SyncedLyricsService.preferKoreanRomanization(parsedLines);
    const lines = preferredLyrics.lines;
    if (!record || !lines.length) return { available: false, eligible: true, reason: 'not_found' };
    return {
      available: true,
      eligible: true,
      synced: true,
      source: preferredLyrics.romanized ? 'Phiên âm · LRCLIB' : 'LRCLIB',
      romanized: preferredLyrics.romanized,
      metadataSource: canonical.source,
      trackName: String(record.trackName || canonical.title),
      artistName: String(record.artistName || canonical.artist),
      albumName: String(record.albumName || canonical.album || ''),
      duration: Math.max(0, Number(record.duration) || Number(canonical.duration) || 0),
      lines
    };
  }
}

module.exports = { SyncedLyricsService };
