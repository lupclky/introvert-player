const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardSettingsUiController = require('../services/dashboard-settings-ui-controller');

function element() {
    const listeners = {};
    return {
        value: '', style: {}, listeners,
        addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
        click() { (listeners.click || []).forEach(listener => listener({ target: this })); }
    };
}

test('Settings controller khởi tạo tài khoản và cấu hình đúng một lần', () => {
    let darkModeCalls = 0;
    let configCalls = 0;
    let authCalls = 0;
    const controller = new DashboardSettingsUiController({
        document: { getElementById: () => null },
        window: {},
        storage: { getItem: () => null, setItem: () => {} },
        state: {},
        applyDarkModeState: () => darkModeCalls++,
        loadConfigFromAppData: () => configCalls++,
        checkYoutubeAuth: () => authCalls++
    });

    controller.init();
    controller.init();

    assert.equal(darkModeCalls, 1);
    assert.equal(configCalls, 1);
    assert.equal(authCalls, 1);
});

test('mốc nhận nhạc hỗ trợ nút áp dụng và phím Enter', () => {
    const input = element();
    const button = element();
    const values = [];
    const nodes = {
        'zypage-min-amount-input': input,
        'btn-zypage-min-amount-apply': button
    };
    const controller = new DashboardSettingsUiController({
        document: { getElementById: id => nodes[id] || null },
        window: {},
        storage: { getItem: () => null, setItem: () => {} },
        state: {},
        applyDarkModeState: () => {},
        onMinAmountConfigChange: value => values.push(value),
        setTimeout: () => 1
    });
    controller.init();
    input.value = '50000';
    input.listeners.keydown[0]({ key: 'Enter' });

    assert.deepEqual(values, ['50000']);
});
