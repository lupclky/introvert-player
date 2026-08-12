'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const LyricsTimelineService = require('../services/lyrics-timeline-service');

function createService(overrides = {}) {
  return new LyricsTimelineService({ beforeCount: 1, afterCount: 1, ...overrides.options });
}

test('chọn đúng câu hiện tại theo currentTime của player', () => {
  const service = createService();
  const lines = [{ time: 5, text: 'A' }, { time: 10, text: 'B' }, { time: 15, text: 'C' }];
  const view = service.getWindow(lines, 12.4);
  assert.equal(view.activeIndex, 1);
  assert.deepEqual(view.lines.map(line => [line.text, line.active]), [['A', false], ['B', true], ['C', false]]);
});

test('trước câu đầu tiên hiển thị câu sắp tới nhưng chưa tô sáng', () => {
  const service = createService();
  const view = service.getWindow([{ time: 5, text: 'A' }, { time: 10, text: 'B' }, { time: 15, text: 'C' }], 1);
  assert.equal(view.activeIndex, -1);
  assert.equal(view.lines.length, 3);
  assert.equal(view.lines[0].active, false);
  assert.equal(view.lines[0].upcoming, true);
});

test('ở đầu và cuối bài vẫn lấp đầy cửa sổ lyrics nếu còn đủ dữ liệu', () => {
  const service = createService();
  const lines = [{ time: 5, text: 'A' }, { time: 10, text: 'B' }, { time: 15, text: 'C' }, { time: 20, text: 'D' }];
  assert.deepEqual(service.getWindow(lines, 6).lines.map(line => line.text), ['A', 'B', 'C']);
  assert.deepEqual(service.getWindow(lines, 25).lines.map(line => line.text), ['B', 'C', 'D']);
});

test('cửa sổ overlay bốn dòng giữ một câu trước và hai câu sau', () => {
  const service = createService({ options: { beforeCount: 1, afterCount: 2 } });
  const lines = [
    { time: 5, text: 'A' }, { time: 10, text: 'B' }, { time: 15, text: 'C' },
    { time: 20, text: 'D' }, { time: 25, text: 'E' }
  ];
  const view = service.getWindow(lines, 16);
  assert.deepEqual(view.lines.map(line => [line.text, line.active]), [
    ['B', false], ['C', true], ['D', false], ['E', false]
  ]);
});

test('chuẩn hóa thứ tự và bỏ dòng trống', () => {
  const service = createService();
  const normalized = service.normalizeLines([{ time: 9, text: 'B' }, { time: 2, text: ' A ' }, { time: 4, text: '' }]);
  assert.deepEqual(normalized, [{ time: 2, text: 'A' }, { time: 9, text: 'B' }]);
});
