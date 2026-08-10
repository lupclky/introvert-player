const test = require('node:test');
const assert = require('node:assert/strict');
const DonationMessageLinkService = require('../services/donation-message-link-service');

function createService(overrides = {}) {
    return new DonationMessageLinkService({
        parseYoutubeId: value => value.includes('youtube.com/watch?v=') ? 'VVO05mYGFY8' : null,
        ...overrides
    });
}

test('phát hiện và lấy link nhạc đầu tiên trong lời nhắn donate', () => {
    const service = createService();
    const message = 'nghe bài này https://example.com/a rồi https://youtube.com/watch?v=VVO05mYGFY8 nhé';
    assert.equal(service.hasSongLink(message), true);
    assert.equal(service.extractSongLink(message), 'https://youtube.com/watch?v=VVO05mYGFY8');
});

test('hỗ trợ link SoundCloud và bỏ qua URL không phải nhạc', () => {
    const service = createService();
    assert.equal(service.hasSongLink('https://soundcloud.com/artist/song'), true);
    assert.equal(service.extractSongLink('xem https://example.com/a'), null);
    assert.equal(service.hasSongLink('không có link'), false);
});

test('escape HTML trước khi biến URL thành liên kết an toàn', () => {
    const output = createService().formatMessageWithLinks('<b>nhạc</b> https://example.com/?a=1&b=2');
    assert.match(output, /&lt;b&gt;nhạc&lt;\/b&gt;/);
    assert.match(output, /<a href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
    assert.doesNotMatch(output, /<b>/);
});

test('trả giá trị rỗng ổn định khi lời nhắn không tồn tại', () => {
    const service = createService();
    assert.equal(service.formatMessageWithLinks(null), '');
    assert.equal(service.extractSongLink(null), null);
    assert.equal(service.hasSongLink(null), false);
});
