'use strict';

const wanakana = require('wanakana');
const KuroshiroModule = require('kuroshiro');
const KuromojiAnalyzerModule = require('kuroshiro-analyzer-kuromoji');
const { pinyin } = require('pinyin-pro');

const Kuroshiro = KuroshiroModule.default || KuroshiroModule;
const KuromojiAnalyzer = KuromojiAnalyzerModule.default || KuromojiAnalyzerModule;

class LyricsRomanizationService {
  constructor(options = {}) {
    this.toRomaji = options.toRomaji || wanakana.toRomaji;
    this.pinyin = options.pinyin || pinyin;
    this.romanizeKorean = options.romanizeKorean || LyricsRomanizationService.romanizeKoreanText;
    this.createJapaneseConverter = options.createJapaneseConverter || (async () => {
      const converter = new Kuroshiro();
      await converter.init(new KuromojiAnalyzer());
      return converter;
    });
    this.logger = options.logger || console;
    this.japaneseConverterPromise = null;
  }

  static containsKana(value) {
    return /[\u3040-\u30ff\u31f0-\u31ff]/u.test(String(value || ''));
  }

  static containsHan(value) {
    return /\p{Script=Han}/u.test(String(value || ''));
  }

  static containsHangul(value) {
    return /[\uAC00-\uD7A3]/u.test(String(value || '').normalize('NFC'));
  }

  static romanizeKoreanText(value) {
    const text = String(value || '').normalize('NFC');
    if (!LyricsRomanizationService.containsHangul(text)) return text;

    const initials = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
    const vowels = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
    const finals = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
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

  static detectLanguage(lines) {
    const texts = Array.isArray(lines) ? lines.map(line => String(line?.text || '')) : [];
    const hasKana = texts.some(LyricsRomanizationService.containsKana);
    const hasHan = texts.some(LyricsRomanizationService.containsHan);
    const hasHangul = texts.some(LyricsRomanizationService.containsHangul);
    if (hasKana) return 'ja';
    if (hasHan && !hasHangul) return 'zh';
    if (hasHangul && !hasHan) return 'ko';
    if (hasHan && hasHangul) return 'zh, ko';
    return '';
  }

  async getJapaneseConverter() {
    if (!this.japaneseConverterPromise) {
      this.japaneseConverterPromise = Promise.resolve()
        .then(() => this.createJapaneseConverter())
        .catch(error => {
          this.japaneseConverterPromise = null;
          throw error;
        });
    }
    return this.japaneseConverterPromise;
  }

  async romanizeJapanese(value) {
    const text = String(value || '');
    if (!LyricsRomanizationService.containsKana(text) && !LyricsRomanizationService.containsHan(text)) return text;
    if (!LyricsRomanizationService.containsHan(text)) return this.toRomaji(text);
    const converter = await this.getJapaneseConverter();
    return converter.convert(text, { to: 'romaji', mode: 'spaced', romajiSystem: 'hepburn' });
  }

  romanizeChinese(value) {
    const text = String(value || '');
    if (!LyricsRomanizationService.containsHan(text)) return text;
    return this.pinyin(text, { toneType: 'symbol', type: 'string', nonZh: 'consecutive' })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  async romanizeLines(lines) {
    if (!Array.isArray(lines) || !lines.length) return { lines, romanized: false, language: '' };
    const language = LyricsRomanizationService.detectLanguage(lines);
    if (!language) return { lines, romanized: false, language: '' };

    const hasKanaInSong = lines.some(line => LyricsRomanizationService.containsKana(line?.text));

    try {
      const output = [];
      for (const line of lines) {
        const originalText = String(line?.text || '');
        let currentText = originalText;

        // Step 1: Romanize Korean if line contains Hangul
        if (LyricsRomanizationService.containsHangul(currentText)) {
          currentText = (typeof this.romanizeKorean === 'function'
            ? this.romanizeKorean(currentText)
            : LyricsRomanizationService.romanizeKoreanText(currentText)) || currentText;
        }

        // Step 2: Romanize Japanese or Chinese if line contains Hanzi/Kana
        if (LyricsRomanizationService.containsKana(currentText) || (hasKanaInSong && LyricsRomanizationService.containsHan(currentText))) {
          currentText = (await this.romanizeJapanese(currentText)) || currentText;
        } else if (LyricsRomanizationService.containsHan(currentText)) {
          currentText = this.romanizeChinese(currentText) || currentText;
        }

        currentText = currentText.trim();
        if (currentText && currentText !== originalText) {
          output.push({ ...line, text: currentText, originalText });
        } else {
          output.push({ ...line, text: originalText });
        }
      }
      const romanized = output.some(line => line.originalText);
      return { lines: output, romanized, language: romanized ? language : '' };
    } catch (error) {
      this.logger.warn?.('[Lyrics Romanization] Không thể phiên âm:', error?.message || error);
      return { lines, romanized: false, language: '' };
    }
  }
}

module.exports = { LyricsRomanizationService };
