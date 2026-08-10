const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardPlaybackUiController = require('../services/dashboard-playback-ui-controller');

function element() {
    const listeners = {};
    return {
        value: '', textContent: '', className: '', checked: false,
        listeners,
        classList: { add(value) { this.value = value; } },
        addEventListener(type, listener) { (listeners[type] ||= []).push(listener); }
    };
}

function createController(overrides = {}) {
    const nodes = {
        'youtube-player-container-wrapper': element(),
        'volume-slider': element(),
        'volume-val-display': element(),
        'mute-btn': element(),
        'focus-mode-toggle-switch': element(),
        'lucky-mode-toggle-switch': element()
    };
    const listeners = {};
    const calls = [];
    const state = { playerVisible: false, volume: 40, focusMode: false, luckyMode: true, lastReportedTime: 20 };
    const controller = new DashboardPlaybackUiController({
        document: {
            activeElement: null,
            getElementById: id => nodes[id] || null,
            addEventListener: (type, listener) => { (listeners[type] ||= []).push(listener); }
        },
        window: {}, state,
        setInterval: () => 1,
        updateGlobalLimitUI: () => calls.push('limit'),
        applyDashboardFocusModeState: value => calls.push(`focus:${value}`),
        sendControlCommand: (type, value) => calls.push(`${type}:${value}`),
        isControlsDisabled: () => false,
        togglePlayPause: () => calls.push('play'),
        toggleMute: () => calls.push('mute'),
        onVolumeChange: value => calls.push(`volume-change:${value}`),
        attemptGlobalAction: (_type, action) => action(),
        logSystem: () => {}, formatTime: value => String(value),
        getCurrentOverlayDuration: () => 0,
        ...overrides
    });
    return { controller, nodes, listeners, calls, state };
}

test('Playback UI khôi phục player và chỉ khởi tạo một lần', () => {
    const { controller, nodes, listeners, calls } = createController();
    controller.init();
    controller.init();

    assert.equal(nodes['youtube-player-container-wrapper'].classList.value, 'hidden-player');
    assert.equal(nodes['volume-slider'].value, 40);
    assert.equal(nodes['volume-val-display'].textContent, '40%');
    assert.equal(nodes['mute-btn'].className, 'fa-solid fa-volume-low');
    assert.equal(listeners.keydown.length, 1);
    assert.deepEqual(calls, ['volume:40', 'limit', 'focus:false']);
});

test('Playback keyboard điều khiển phát và âm lượng', () => {
    const { controller, listeners, calls } = createController();
    controller.init();
    const event = key => ({ key, preventDefault() {} });
    listeners.keydown[0](event('k'));
    listeners.keydown[0](event('ArrowUp'));

    assert.ok(calls.includes('play'));
    assert.ok(calls.includes('volume-change:45'));
});

test('timer native được gọi với đúng Window context', () => {
    const fakeWindow = {
        setInterval(callback, delay) {
            assert.equal(this, fakeWindow);
            assert.equal(delay, 1000);
            return 9;
        }
    };
    const { controller } = createController({ window: fakeWindow, setInterval: undefined });
    controller.init();
    assert.equal(controller.globalLimitInterval, 9);
});
