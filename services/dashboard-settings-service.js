(function attachDashboardSettingsService(globalScope) {
    'use strict';
    class DashboardSettingsService {
        constructor(options = {}) {
            this.storage = options.storage || globalScope.localStorage;
            this.systemDark = options.systemDark || (() => false);
        }
        get(key, fallback = null) { const value = this.storage?.getItem(key); return value == null ? fallback : value; }
        set(key, value) { this.storage?.setItem(key, value); return value; }
        setDarkMode(value) { return this.set('dua_dark_mode', value); }
        resolveDarkMode() {
            const setting = this.get('dua_dark_mode', 'light');
            const isDark = setting === 'system' ? Boolean(this.systemDark()) : !(setting === 'light' || setting === 'false');
            const normalized = setting === 'false' ? 'light' : (setting === 'true' ? 'dark' : setting);
            return { setting: normalized, isDark };
        }
        setFocusMode(value) { this.set('dua_focus_mode', Boolean(value)); return Boolean(value); }
        setLuckyMode(value) { this.set('dua_lucky_mode', Boolean(value)); return Boolean(value); }
        setTheme(value) {
            const theme = ['pineapple', 'enchanted-wild', 'cutepink'].includes(value) ? value : 'enchanted-wild';
            this.set('dua_theme', theme); return theme;
        }
        setOpacity(value) {
            const opacity = String(Math.max(0, Math.min(100, Number(value) || 0)));
            this.set('dua_opacity', opacity); return opacity;
        }
    }
    globalScope.DashboardSettingsService = DashboardSettingsService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DashboardSettingsService;
})(typeof window !== 'undefined' ? window : globalThis);
