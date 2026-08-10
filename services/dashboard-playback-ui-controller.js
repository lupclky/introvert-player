(function (root, factory) {
    const DashboardPlaybackUiController = factory();
    if (typeof module === 'object' && module.exports) module.exports = DashboardPlaybackUiController;
    if (root) root.DashboardPlaybackUiController = DashboardPlaybackUiController;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    class DashboardPlaybackUiController {
        constructor(options = {}) {
            Object.assign(this, options);
            this.document = options.document || (typeof document !== 'undefined' ? document : null);
            this.window = options.window || (typeof window !== 'undefined' ? window : {});
            const setIntervalImpl = options.setInterval || this.window.setInterval || globalThis.setInterval;
            this.setInterval = (...args) => Reflect.apply(setIntervalImpl, this.window || globalThis, args);
            this.initialized = false;
        }

        init() {
            if (this.initialized || !this.document) return;
            this.initialized = true;
            this.restorePlayerUi();
            this.initModeUi();
            this.initDolbyEngine();
            this.document.addEventListener('keydown', event => this.handleKeyboardShortcut(event));
        }

        restorePlayerUi() {
            const wrapper = this.document.getElementById('youtube-player-container-wrapper');
            if (!this.state.playerVisible) wrapper?.classList.add('hidden-player');

            const slider = this.document.getElementById('volume-slider');
            if (!slider) return;
            slider.value = this.state.volume;
            const value = this.document.getElementById('volume-val-display');
            if (value) value.textContent = `${this.state.volume}%`;
            this.updateMuteIcon();
            this.sendControlCommand('volume', this.state.volume);
        }

        updateMuteIcon() {
            const icon = this.document.getElementById('mute-btn');
            if (!icon) return;
            icon.className = this.state.volume === 0
                ? 'fa-solid fa-volume-xmark'
                : this.state.volume < 50
                    ? 'fa-solid fa-volume-low'
                    : 'fa-solid fa-volume-high';
        }

        initModeUi() {
            this.updateGlobalLimitUI();
            this.globalLimitInterval = this.setInterval(this.updateGlobalLimitUI, 1000);
            const focusSwitch = this.document.getElementById('focus-mode-toggle-switch');
            if (focusSwitch) focusSwitch.checked = this.state.focusMode;
            this.applyDashboardFocusModeState(this.state.focusMode);
            const luckySwitch = this.document.getElementById('lucky-mode-toggle-switch');
            if (luckySwitch) luckySwitch.checked = this.state.luckyMode;
        }

        initDolbyEngine() {
            if (!this.window.dolbyAtmosEngine && this.window.DolbySpatialAudioService) {
                this.window.dolbyAtmosEngine = new this.window.DolbySpatialAudioService();
            }
        }

        handleKeyboardShortcut(event) {
            if (event.ctrlKey || event.altKey || event.metaKey || this.isTyping()) return;
            const key = event.key.toLowerCase();
            if (this.isControlsDisabled() && this.isPlaybackControlKey(event, key)) {
                event.preventDefault();
                return;
            }
            if (key === ' ' || key === 'k') return this.runSimpleAction(event, this.togglePlayPause);
            if (key === 'm') return this.runSimpleAction(event, this.toggleMute);
            if (event.key === 'ArrowUp') return this.changeVolume(event, 5);
            if (event.key === 'ArrowDown') return this.changeVolume(event, -5);
            if (event.key === 'ArrowLeft' || key === 'j') return this.seekRelative(event, event.key === 'ArrowLeft' ? -5 : -10);
            if (event.key === 'ArrowRight' || key === 'l') return this.seekRelative(event, event.key === 'ArrowRight' ? 5 : 10);
            if (event.key >= '0' && event.key <= '9') return this.seekByPercent(event, parseInt(event.key, 10) * 10);
        }

        isTyping() {
            const active = this.document.activeElement;
            return Boolean(active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable));
        }

        isPlaybackControlKey(event, key) {
            return key === ' ' || key === 'k' || event.key === 'ArrowLeft' || key === 'j'
                || event.key === 'ArrowRight' || key === 'l' || (event.key >= '0' && event.key <= '9');
        }

        runSimpleAction(event, action) {
            event.preventDefault();
            action();
        }

        changeVolume(event, delta) {
            event.preventDefault();
            if (this.state.focusMode) return;
            const volume = Math.max(0, Math.min(100, this.state.volume + delta));
            const slider = this.document.getElementById('volume-slider');
            if (slider) slider.value = volume;
            this.onVolumeChange(volume);
        }

        getPlaybackBounds() {
            const start = this.state.currentSong?.start || 0;
            const overlayDuration = this.getCurrentOverlayDuration();
            const duration = overlayDuration > 0 ? overlayDuration : (this.state.currentSong?.duration || 0);
            return { start, duration };
        }

        seekRelative(event, delta) {
            event.preventDefault();
            if (this.state.focusMode) return;
            const { start, duration } = this.getPlaybackBounds();
            let target = (this.state.lastReportedTime || 0) + delta;
            target = Math.max(start, target);
            if (duration > 0) target = Math.min(start + duration, target);
            const direction = delta < 0 ? 'lùi' : 'tới';
            this.attemptGlobalAction('seek', () => {
                this.sendControlCommand('seek', target);
                this.logSystem(`[Phím tắt] Tua ${direction} tới: <strong>${this.formatTime(target - start)}</strong>`, 'system');
            });
        }

        seekByPercent(event, percent) {
            event.preventDefault();
            if (this.state.focusMode) return;
            const { start, duration } = this.getPlaybackBounds();
            if (duration <= 0) return;
            const target = start + (percent / 100) * duration;
            this.attemptGlobalAction('seek', () => {
                this.sendControlCommand('seek', target);
                this.logSystem(`[Phím tắt] Tua nhanh tới ${percent}%: <strong>${this.formatTime(target - start)}</strong>`, 'system');
            });
        }
    }

    return DashboardPlaybackUiController;
});
