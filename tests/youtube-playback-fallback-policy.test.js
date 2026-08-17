'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const YouTubePlaybackFallbackPolicy = require('../services/youtube-playback-fallback-policy');

function createService(overrides = {}) {
    const service = new YouTubePlaybackFallbackPolicy({
        blockedStateGraceMs: 8000,
        generalGraceMs: 12000,
        ...overrides.options
    });
    const states = {
        UNSTARTED: -1,
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        BUFFERING: 3,
        CUED: 5
    };
    return { service, states };
}

test('fallback sau 8 giây khi iframe bị chặn ở 0:00', () => {
    const { service, states } = createService();
    const result = service.evaluateInitialLoad({
        elapsedMs: 8000,
        currentTime: 0,
        duration: 0,
        playerState: states.PAUSED,
        states
    });
    assert.deepEqual(result, { action: 'fallback', reason: 'blocked_zero_duration' });
});

test('buffering bình thường có thêm thời gian trước khi fallback', () => {
    const { service, states } = createService();
    assert.equal(service.evaluateInitialLoad({
        elapsedMs: 9000,
        currentTime: 0,
        duration: 240,
        playerState: states.BUFFERING,
        states
    }).action, 'wait');
    assert.equal(service.evaluateInitialLoad({
        elapsedMs: 12000,
        currentTime: 0,
        duration: 240,
        playerState: states.BUFFERING,
        states
    }).action, 'fallback');
});

test('tiến trình thực tế vô hiệu hóa watchdog ngay lập tức', () => {
    const { service, states } = createService();
    const result = service.evaluateInitialLoad({
        elapsedMs: 20000,
        currentTime: 0.6,
        duration: 240,
        playerState: states.BUFFERING,
        states
    });
    assert.equal(result.action, 'confirm_playback');
});

test('không fallback khi playback đang bị chủ động chặn', () => {
    const { service, states } = createService();
    const result = service.evaluateInitialLoad({
        elapsedMs: 30000,
        currentTime: 0,
        duration: 0,
        playerState: states.PAUSED,
        states,
        isPlaybackSuppressed: true
    });
    assert.equal(result.action, 'wait');
});

test('tắt autoplay YouTube trước khi iframe bắt đầu phát', () => {
    const guarded = YouTubePlaybackFallbackPolicy.sanitizeStartupMediaUrl(
        'https://www.youtube.com/embed/abc123?enablejsapi=1&autoplay=1&start=10'
    );
    const url = new URL(guarded);
    assert.equal(url.searchParams.get('autoplay'), '0');
    assert.equal(url.searchParams.get('start'), '10');
});

test('tắt auto_play SoundCloud trước READY', () => {
    const guarded = YouTubePlaybackFallbackPolicy.sanitizeStartupMediaUrl(
        'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb&auto_play=true'
    );
    const url = new URL(guarded);
    assert.equal(url.searchParams.get('auto_play'), 'false');
});

test('SoundCloud widget.load không được tự phát trước khi setVolume', () => {
    const options = YouTubePlaybackFallbackPolicy.safeSoundCloudLoadOptions({
        auto_play: true,
        show_artwork: false
    });
    assert.equal(options.auto_play, false);
    assert.equal(options.show_artwork, false);
});
