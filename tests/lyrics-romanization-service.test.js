'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LyricsRomanizationService } = require('../services/lyrics-romanization-service');

function createService(overrides = {}) {
  const warnings = [];
  const service = new LyricsRomanizationService({
    logger: { warn: (...args) => warnings.push(args) },
    ...overrides.options
  });
  return { service, warnings };
}

test('phiên âm Kana sang Romaji và giữ lời gốc', async () => {
  const { service } = createService();
  const result = await service.romanizeLines([{ time: 1, text: 'ひらがな と カタカナ' }]);
  assert.equal(result.language, 'ja');
  assert.equal(result.romanized, true);
  assert.equal(result.lines[0].text, 'hiragana to katakana');
  assert.equal(result.lines[0].originalText, 'ひらがな と カタカナ');
});

test('phiên âm cả Kanji bằng Kuroshiro và tái sử dụng tokenizer', async () => {
  let initializeCount = 0;
  const { service } = createService({
    options: {
      createJapaneseConverter: async () => {
        initializeCount += 1;
        return { convert: async text => text === '私は音楽が好きです' ? 'watashi wa ongaku ga suki desu' : text };
      }
    }
  });
  const first = await service.romanizeLines([{ time: 1, text: '私は音楽が好きです' }]);
  const second = await service.romanizeLines([{ time: 2, text: '私は音楽が好きです' }]);
  assert.equal(first.lines[0].text, 'watashi wa ongaku ga suki desu');
  assert.equal(second.lines[0].text, 'watashi wa ongaku ga suki desu');
  assert.equal(initializeCount, 1);
});

test('phiên âm chữ Hán sang Pinyin có dấu thanh', async () => {
  const { service } = createService();
  const result = await service.romanizeLines([{ time: 1, text: '你好世界' }]);
  assert.equal(result.language, 'zh');
  assert.equal(result.romanized, true);
  assert.equal(result.lines[0].text, 'nǐ hǎo shì jiè');
  assert.equal(result.lines[0].originalText, '你好世界');
});

test('không sửa lời Latin và trả lời gốc nếu bộ phiên âm lỗi', async () => {
  const { service, warnings } = createService({
    options: { createJapaneseConverter: async () => { throw new Error('dictionary unavailable'); } }
  });
  const latin = await service.romanizeLines([{ time: 1, text: 'English only' }]);
  const failed = await service.romanizeLines([{ time: 2, text: '日本語です' }]);
  assert.equal(latin.romanized, false);
  assert.equal(failed.romanized, false);
  assert.equal(failed.lines[0].text, '日本語です');
  assert.equal(warnings.length, 1);
});
