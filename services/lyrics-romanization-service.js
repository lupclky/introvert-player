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

  static detectLanguage(lines) {
    const texts = Array.isArray(lines) ? lines.map(line => String(line?.text || '')) : [];
    if (texts.some(LyricsRomanizationService.containsKana)) return 'ja';
    if (texts.some(LyricsRomanizationService.containsHan)) return 'zh';
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
    return this.pinyin(text, { toneType: 'symbol', type: 'string' });
  }

  async romanizeLines(lines) {
    if (!Array.isArray(lines) || !lines.length) return { lines, romanized: false, language: '' };
    const language = LyricsRomanizationService.detectLanguage(lines);
    if (!language) return { lines, romanized: false, language: '' };

    try {
      const output = [];
      for (const line of lines) {
        const originalText = String(line?.text || '');
        const hasTargetScript = language === 'ja'
          ? LyricsRomanizationService.containsKana(originalText) || LyricsRomanizationService.containsHan(originalText)
          : LyricsRomanizationService.containsHan(originalText);
        if (!hasTargetScript) {
          output.push({ ...line, text: originalText });
          continue;
        }
        const converted = String(language === 'ja'
          ? await this.romanizeJapanese(originalText)
          : this.romanizeChinese(originalText)).trim() || originalText;
        output.push(converted !== originalText
          ? { ...line, text: converted, originalText }
          : { ...line, text: originalText });
      }
      return { lines: output, romanized: output.some(line => line.originalText), language };
    } catch (error) {
      this.logger.warn?.('[Lyrics Romanization] Không thể phiên âm:', error?.message || error);
      return { lines, romanized: false, language: '' };
    }
  }
}

module.exports = { LyricsRomanizationService };
