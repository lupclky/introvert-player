'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseViewCount } = require('../services/view-count-policy');

test('chuẩn hóa các định dạng lượt xem phổ biến', () => {
  assert.equal(parseViewCount('10,000 views'), 10000);
  assert.equal(parseViewCount('10K'), 10000);
  assert.equal(parseViewCount('1,2 triệu lượt xem'), 1200000);
  assert.equal(parseViewCount(25000), 25000);
});
