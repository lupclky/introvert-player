'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageDonationCommandService = require('../services/zypage-donation-command-service');

test('playlist được nhận diện trước nhưng donation thường vẫn được lưu', async () => {
    const calls = [];
    const service = new ZyPageDonationCommandService({
        processPlaylist: async () => { calls.push('playlist'); return { matched: true }; },
        applyVoteSkip: () => { calls.push('vote'); return false; },
        applyExtension: () => { calls.push('extension'); return false; },
        recordDonation: async () => { calls.push('record'); }
    });
    const result = await service.process({ name: 'Mèo' });
    assert.deepEqual(calls, ['playlist', 'record']);
    assert.equal(result.playlistHandled, true);
    assert.equal(result.recorded, true);
});

test('Vote Skip ưu tiên hơn gia hạn và không ghi donation lần nữa', async () => {
    const calls = [];
    const service = new ZyPageDonationCommandService({
        processPlaylist: async () => null,
        applyVoteSkip: () => { calls.push('vote'); return true; },
        applyExtension: () => { calls.push('extension'); return true; },
        recordDonation: () => { calls.push('record'); }
    });
    const result = await service.process({ name: 'Khách' });
    assert.deepEqual(calls, ['vote']);
    assert.equal(result.voteSkipped, true);
    assert.equal(result.extended, false);
    assert.equal(result.recorded, false);
});

test('gia hạn chỉ chạy khi Vote Skip không nhận donation', async () => {
    const service = new ZyPageDonationCommandService({
        processPlaylist: async () => null,
        applyVoteSkip: () => false,
        applyExtension: () => true,
        recordDonation: () => assert.fail('không được ghi donation')
    });
    const result = await service.process({ name: 'Khách' });
    assert.equal(result.extended, true);
});

test('lỗi callback được cô lập và trả trong kết quả', async () => {
    const errors = [];
    const service = new ZyPageDonationCommandService({
        processPlaylist: async () => { throw new Error('playlist error'); },
        onError: (error, context) => errors.push({ error, context })
    });
    const result = await service.process({ name: 'Khách' }, 'test');
    assert.equal(result.error.message, 'playlist error');
    assert.equal(errors[0].context, 'test');
});
