const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardSettingsService = require('../services/dashboard-settings-service');

function storage() {
    const values = {};
    return { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, values };
}

test('settings normalizes dark mode and follows system preference', () => {
    const store = storage();
    const service = new DashboardSettingsService({ storage: store, systemDark: () => true });
    service.setDarkMode('system');
    assert.deepEqual(service.resolveDarkMode(), { setting: 'system', isDark: true });
    service.setDarkMode('false');
    assert.deepEqual(service.resolveDarkMode(), { setting: 'light', isDark: false });
});

test('settings validates theme and clamps opacity', () => {
    const service = new DashboardSettingsService({ storage: storage() });
    assert.equal(service.setTheme('invalid'), 'enchanted-wild');
    assert.equal(service.setOpacity(140), '100');
    assert.equal(service.setOpacity(-5), '0');
});
