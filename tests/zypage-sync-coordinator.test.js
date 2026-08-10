'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageSyncCoordinator = require('../services/zypage-sync-coordinator');

test('chỉ cho một lượt sync chạy và giữ yêu cầu mới nhất', () => {
    const coordinator = new ZyPageSyncCoordinator();
    assert.equal(coordinator.begin({ shopId: '1', isManual: false }), true);
    assert.equal(coordinator.begin({ shopId: '2', isManual: false }), false);
    assert.equal(coordinator.begin({ shopId: '3', isManual: true }), false);
    assert.deepEqual(coordinator.finish(), { shopId: '3', isManual: true });
    assert.equal(coordinator.running, false);
});

test('finish không có pending trả null và có thể chạy lượt mới', () => {
    const coordinator = new ZyPageSyncCoordinator();
    coordinator.begin({ shopId: '1' });
    assert.equal(coordinator.finish(), null);
    assert.equal(coordinator.begin({ shopId: '2' }), true);
});
