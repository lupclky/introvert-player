'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WindowsMediaService = require('../services/windows-media-service');

test('WindowsMediaService initializes and registers action handlers', () => {
    const registeredHandlers = {};
    const mockMediaSession = {
        setActionHandler: (action, handler) => {
            registeredHandlers[action] = handler;
        },
        metadata: null,
        playbackState: 'none',
        setPositionState: () => {}
    };

    let played = false;
    let paused = false;
    let nexted = false;
    let previoused = false;
    let seekedTime = null;

    const service = new WindowsMediaService({
        mediaSession: mockMediaSession,
        MediaMetadata: class MockMediaMetadata {
            constructor(init) {
                Object.assign(this, init);
            }
        },
        onPlay: () => { played = true; },
        onPause: () => { paused = true; },
        onNext: () => { nexted = true; },
        onPrevious: () => { previoused = true; },
        onSeek: (details) => { seekedTime = details?.seekTime; }
    });

    service.initialize();

    assert.ok(typeof registeredHandlers['play'] === 'function');
    assert.ok(typeof registeredHandlers['pause'] === 'function');
    assert.ok(typeof registeredHandlers['nexttrack'] === 'function');
    assert.ok(typeof registeredHandlers['previoustrack'] === 'function');
    assert.ok(typeof registeredHandlers['seekto'] === 'function');

    registeredHandlers['play']();
    assert.equal(played, true);

    registeredHandlers['pause']();
    assert.equal(paused, true);

    registeredHandlers['nexttrack']();
    assert.equal(nexted, true);

    registeredHandlers['previoustrack']();
    assert.equal(previoused, true);

    registeredHandlers['seekto']({ seekTime: 42 });
    assert.equal(seekedTime, 42);
});

test('WindowsMediaService updates metadata and playbackState', () => {
    let mockMetadata = null;
    const mockMediaSession = {
        setActionHandler: () => {},
        get metadata() { return mockMetadata; },
        set metadata(val) { mockMetadata = val; },
        playbackState: 'none',
        setPositionState: () => {}
    };

    class MockMediaMetadata {
        constructor(init) {
            Object.assign(this, init);
        }
    }

    const service = new WindowsMediaService({
        mediaSession: mockMediaSession,
        MediaMetadata: MockMediaMetadata
    });

    // Test with song playing
    service.updateMetadata({
        title: 'Bao Tiền Một Mớ Bình Yên',
        author: '14 Casper',
        donorName: 'Minh',
        thumbnailUrl: 'https://example.com/thumb.jpg'
    }, true);

    assert.equal(mockMediaSession.playbackState, 'playing');
    assert.equal(mockMetadata.title, 'Bao Tiền Một Mớ Bình Yên');
    assert.equal(mockMetadata.artist, '14 Casper');
    assert.equal(mockMetadata.album, 'Người donate: Minh');
    assert.equal(mockMetadata.artwork[0].src, 'https://example.com/thumb.jpg');

    // Test with paused song
    service.updateMetadata({
        title: 'Bao Tiền Một Mớ Bình Yên',
        author: '14 Casper',
        donorName: 'Minh'
    }, false);
    assert.equal(mockMediaSession.playbackState, 'paused');

    // Test with no song (cleared)
    service.updateMetadata(null, false);
    assert.equal(mockMediaSession.playbackState, 'none');
    assert.equal(mockMetadata, null);
});

test('WindowsMediaService handles hardware media actions from globalShortcut', () => {
    let played = 0;
    let paused = 0;
    let nexted = 0;
    let previoused = 0;

    const service = new WindowsMediaService({
        mediaSession: null,
        onPlay: () => { played++; },
        onPause: () => { paused++; },
        onNext: () => { nexted++; },
        onPrevious: () => { previoused++; }
    });

    service.isPlaying = false;
    service.handleMediaAction('play-pause');
    assert.equal(played, 1);

    service.isPlaying = true;
    service.handleMediaAction('play-pause');
    assert.equal(paused, 1);

    service.handleMediaAction('next-track');
    assert.equal(nexted, 1);

    service.handleMediaAction('previous-track');
    assert.equal(previoused, 1);

    service.handleMediaAction('stop');
    assert.equal(paused, 2);
});

test('WindowsMediaService updates position state safely', () => {
    let positionState = null;
    const mockMediaSession = {
        setActionHandler: () => {},
        setPositionState: (state) => {
            positionState = state;
        }
    };

    const service = new WindowsMediaService({
        mediaSession: mockMediaSession
    });

    service.updatePosition(15, 200);
    assert.deepEqual(positionState, {
        duration: 200,
        playbackRate: 1,
        position: 15
    });

    // Invalid inputs should not throw
    service.updatePosition('invalid', null);
});
