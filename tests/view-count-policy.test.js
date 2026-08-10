'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseViewCount, evaluateViewCount } = require('../services/view-count-policy');

test('chuẩn hóa các định dạng lượt xem phổ biến', () => {
  assert.equal(parseViewCount('10,000 views'), 10000);
  assert.equal(parseViewCount('10K'), 10000);
  assert.equal(parseViewCount('1,2 triệu lượt xem'), 1200000);
  assert.equal(parseViewCount(25000), 25000);
});

test('mốc view nhận đúng ranh giới và từ chối giá trị không xác định', () => {
  assert.equal(evaluateViewCount(9999, 10000).accepted, false);
  assert.equal(evaluateViewCount(10000, 10000).accepted, true);
  assert.equal(evaluateViewCount('', 10000).reason, 'unknown_view_count');
});
