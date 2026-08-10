'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const DurationRetryService = require('../services/duration-retry-service');

test('duration retry tiếp tục tải đến khi có thời lượng', async () => {
    const scheduled = [];
    const results = [];
    let calls = 0;
    const service = new DurationRetryService({
        delays: [1],
        setTimer: callback => { scheduled.push(callback); return scheduled.length; }
    });
    service.ensure('song-1', {
        isActive: () => true,
        load: async () => ({ duration: ++calls >= 3 ? 245 : 0 }),
        onResult: result => results.push(result.duration)
    });
    await new Promise(resolve => setImmediate(resolve));
    await scheduled.shift()();
    await scheduled.shift()();
    assert.deepEqual(results, [0, 0, 245]);
    assert.equal(service.jobs.size, 0);
});

test('duration retry dừng khi bài không còn trong queue', async () => {
    const scheduled = [];
    let active = true;
    let calls = 0;
    const service = new DurationRetryService({
        setTimer: callback => { scheduled.push(callback); return scheduled.length; }
    });
    service.ensure('song-2', {
        isActive: () => active,
        load: async () => { calls++; return { duration: 0 }; }
    });
    await new Promise(resolve => setImmediate(resolve));
    active = false;
    await scheduled.shift()();
    assert.equal(calls, 1);
    assert.equal(service.jobs.size, 0);
});

test('duration retry stops after the configured maximum attempts', async () => {
    const scheduled = [];
    let calls = 0;
    let exhaustedAt = 0;
    const service = new DurationRetryService({
        maxAttempts: 2,
        delays: [1],
        setTimer: callback => { scheduled.push(callback); return scheduled.length; }
    });
    service.ensure('song-blocked', {
        isActive: () => true,
        load: async () => { calls++; return { duration: 0 }; },
        onExhausted: attempts => { exhaustedAt = attempts; }
    });
    await new Promise(resolve => setImmediate(resolve));
    await scheduled.shift()();
    assert.equal(calls, 2);
    assert.equal(exhaustedAt, 2);
    assert.equal(service.jobs.size, 0);
    assert.equal(scheduled.length, 0);
});
