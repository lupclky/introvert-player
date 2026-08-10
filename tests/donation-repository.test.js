'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { DonationRepository } = require('../services/donation-repository');

test('donation repository lưu, chống trùng và cập nhật link nhạc', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repository = new DonationRepository(db);
    const donation = { id: 'd1', name: 'Mèo Cam', amount: 50000, message: 'Xin chào', timestamp: 10000 };
    assert.equal(repository.add(donation).inserted, true);
    assert.equal(repository.add(donation).updated, false);
    assert.equal(repository.add({ ...donation, songLink: 'https://youtu.be/abcdefghijk', isMusicOrder: true }).updated, true);
    const rows = repository.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].songLink, 'https://youtu.be/abcdefghijk');
    assert.equal(rows[0].isMusicOrder, true);
  } finally {
    db.close();
  }
});

test('donation repository đánh dấu đọc và xóa lịch sử', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repository = new DonationRepository(db);
    repository.add({ id: 'd2', name: 'A', amount: 1, timestamp: 20000 });
    assert.equal(repository.markRead('d2'), true);
    assert.equal(repository.list()[0].isNew, false);
    assert.equal(repository.clear(), true);
    assert.deepEqual(repository.list(), []);
  } finally {
    db.close();
  }
});
