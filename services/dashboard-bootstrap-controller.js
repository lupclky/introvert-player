(function (root, factory) {
    const DashboardBootstrapController = factory();
    if (typeof module === 'object' && module.exports) module.exports = DashboardBootstrapController;
    if (root) root.DashboardBootstrapController = DashboardBootstrapController;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    class DashboardBootstrapController {
        constructor(options = {}) {
            this.document = options.document || (typeof document !== 'undefined' ? document : null);
            this.window = options.window || (typeof window !== 'undefined' ? window : null);
            this.parseYoutubePlaylistId = options.parseYoutubePlaylistId || (() => null);
            this.parseYoutubeId = options.parseYoutubeId || (() => null);
            this.fetchSongMetadata = options.fetchSongMetadata || (async () => null);
            this.renderSearchResults = options.renderSearchResults || (() => {});
            this.callYouTubeSearch = options.callYouTubeSearch || (async () => null);
            this.clearQuickSearch = options.clearQuickSearch || (() => {});
            this.cleanChannelName = options.cleanChannelName || (value => value);
            this.state = options.state || {};
            this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
            this.publishMqtt = options.publishMqtt || (() => {});
            this.logSystem = options.logSystem || (() => {});
            this.alert = options.alert || (() => {});
            this.updateObsUrlDisplay = options.updateObsUrlDisplay || (() => {});
            this.syncIdlePriceTable = options.syncIdlePriceTable || (() => {});
            this.sponsorBlockCategories = options.sponsorBlockCategories || {};
            this.categoryLabels = options.categoryLabels || {};
            this.settingsUiController = options.settingsUiController || null;
            this.playbackUiController = options.playbackUiController || null;
            this.dedupeZyPageQueue = options.dedupeZyPageQueue || (() => 0);
            this.renderQueue = options.renderQueue || (() => {});
            this.initQueue = options.initQueue || (() => {});
            this.updateTestModeUI = options.updateTestModeUI || (() => {});
            this.toggleFavoriteStatus = options.toggleFavoriteStatus || (() => {});
            this.findFavoriteByContextKey = options.findFavoriteByContextKey || (() => null);
            this.addFavoriteToQueue = options.addFavoriteToQueue || (() => {});
            this.showQueueToolsMenu = options.showQueueToolsMenu || (() => {});
            this.triggerManualZyPageSync = options.triggerManualZyPageSync || (() => {});
            this.toggleLuckyMode = options.toggleLuckyMode || (() => {});
            this.onSortConfigChange = options.onSortConfigChange || (() => {});
            const setTimeoutImpl = options.setTimeout || this.window?.setTimeout || globalThis.setTimeout;
            const clearTimeoutImpl = options.clearTimeout || this.window?.clearTimeout || globalThis.clearTimeout;
            this.setTimeout = (...args) => Reflect.apply(setTimeoutImpl, this.window || globalThis, args);
            this.clearTimeout = (...args) => Reflect.apply(clearTimeoutImpl, this.window || globalThis, args);
            this.onSearchTimeoutChange = options.onSearchTimeoutChange || (() => {});
            this.searchTimeout = null;
            this.initialized = new Set();
        }

        initQuickAddUi() {
            if (!this.document || this.initialized.has('quick-add')) return;

            const urlInput = this.document.getElementById('donor-url');
            const results = this.document.getElementById('quick-add-search-results');
            if (!urlInput || !results) return;

            this.initialized.add('quick-add');
            const clearButton = this.document.getElementById('search-clear-btn');
            const popover = this.document.getElementById('quick-add-popover');
            const form = this.document.getElementById('quick-add-form');

            urlInput.addEventListener('input', () => {
                this.handleQuickAddInput(urlInput, results, clearButton, popover);
            });

            clearButton?.addEventListener('click', () => this.clearQuickSearch());

            this.document.addEventListener('click', event => {
                const target = event.target;
                if (!urlInput.contains(target) && !results.contains(target) && (!clearButton || !clearButton.contains(target))) {
                    results.style.display = 'none';
                }
                if (popover && form && !form.contains(target)) popover.classList.remove('visible');
            });

            urlInput.addEventListener('focus', () => {
                popover?.classList.add('visible');
                const query = urlInput.value.trim();
                const isUrl = this.isUrl(query);
                if (!isUrl && query.length >= 2 && results.children.length > 0) results.style.display = 'flex';
            });

            this.document.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || !popover) return;
                popover.classList.remove('visible');
                urlInput.blur();
            });
        }

        // Các điểm vào này tạo ranh giới rõ ràng cho những nhóm bootstrap tiếp theo.
        initSettingsUi() {
            if (!this.document || this.initialized.has('settings')) return;
            this.initialized.add('settings');
            this.initSponsorBlockSettings();
            this.initAppearanceSettings();
            this.initOverlayTextSetting({
                inputId: 'overlay-empty-msg-input', buttonId: 'btn-overlay-empty-msg-apply',
                counterId: 'overlay-empty-msg-counter', stateKey: 'emptyQueueMessage',
                storageKey: 'dua_empty_queue_message', mqttTopic: 'empty_queue_message',
                fallback: 'Order nhạc tự động Zypage 50k', payloadKey: 'text',
                logLabel: 'lời hiển thị khi hết nhạc', alertText: 'Đã áp dụng và đồng bộ lời hiển thị mới lên OBS Overlay!'
            });
            this.initOverlayTextSetting({
                inputId: 'overlay-donate-action-input', buttonId: 'btn-overlay-donate-action-apply',
                counterId: 'overlay-donate-action-counter', stateKey: 'alertActionText',
                storageKey: 'dua_alert_action_text', mqttTopic: 'alert_action_text',
                fallback: 'gửi một quả dứa', payloadKey: 'text', afterSave: this.updateObsUrlDisplay,
                logLabel: 'chữ hiển thị Donate', alertText: 'Đã áp dụng và đồng bộ chữ hiển thị Donate mới lên OBS Overlay!'
            });
            this.initOverlayTextSetting({
                inputId: 'overlay-focus-msg-input', buttonId: 'btn-overlay-focus-msg-apply',
                counterId: 'overlay-focus-msg-counter', stateKey: 'focusModeMessage',
                storageKey: 'dua_focus_mode_message', mqttTopic: 'focus_mode_message',
                fallback: 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng', payloadKey: 'text',
                logLabel: 'lời hiển thị Tập trung', alertText: 'Đã áp dụng và đồng bộ lời hiển thị Tập trung mới lên OBS Overlay!'
            });
            this.initBooleanSetting({
                elementId: 'hide-empty-overlay-toggle', stateKey: 'hideEmptyOverlay',
                storageKey: 'dua_hide_empty_overlay', mqttTopic: 'hide_empty_overlay', payloadKey: 'value',
                onChange: checked => this.logSystem(`Đã cấu hình ${checked ? 'Ẩn' : 'Hiện'} overlay khi không có nhạc.`)
            });
            this.initBooleanSetting({
                elementId: 'show-idle-price-table-toggle', stateKey: 'showIdlePriceTable',
                storageKey: 'dua_show_idle_price_table',
                onChange: checked => {
                    this.syncIdlePriceTable();
                    this.logSystem(`Đã ${checked ? 'bật' : 'tắt'} bảng giá khi hết nhạc.`);
                }
            });
            this.settingsUiController?.init();
        }
        initQueueUi() {
            if (!this.document || this.initialized.has('queue')) return;
            this.initialized.add('queue');

            const sortSelect = this.document.getElementById('queue-sort-select');
            if (sortSelect) sortSelect.value = this.state.sortConfig;

            const restoredDuplicateCount = this.dedupeZyPageQueue();
            if (restoredDuplicateCount > 0) {
                this.storage?.setItem('dua_queue', JSON.stringify(this.state.queue));
                this.logSystem(`Da don ${restoredDuplicateCount} bai ZyPage bi trung tu du lieu cu.`, 'system');
            }
            this.renderQueue();
            this.initQueue();
            this.updateTestModeUI();

            const favoriteButton = this.document.getElementById('btn-player-favorite');
            favoriteButton?.addEventListener('click', () => {
                if (this.state.currentSong) this.toggleFavoriteStatus(this.state.currentSong);
            });

            const electronApi = this.window?.electronAPI;
            electronApi?.onFavoriteContextAction?.(({ action, key } = {}) => {
                const favorite = this.findFavoriteByContextKey(key);
                if (!favorite) return;
                if (action === 'delete') this.toggleFavoriteStatus(favorite);
                else if (action === 'queue') this.addFavoriteToQueue(favorite);
            });

            const queueCard = this.document.getElementById('card-queue');
            queueCard?.addEventListener('contextmenu', event => {
                if (event.target.closest('input, textarea, select')) return;
                this.showQueueToolsMenu(event);
            });

            electronApi?.onQueueContextAction?.(({ action } = {}) => {
                if (action === 'sync') this.triggerManualZyPageSync();
                else if (action === 'toggle-lucky-mode') this.toggleLuckyMode(!this.state.luckyMode);
                else if (action === 'sort-time') this.onSortConfigChange('time');
                else if (action === 'sort-amount') this.onSortConfigChange('amount');
            });
        }
        initPlaybackUi() {
            if (this.initialized.has('playback')) return;
            this.initialized.add('playback');
            this.playbackUiController?.init();
        }

        initSponsorBlockSettings() {
            Object.keys(this.sponsorBlockCategories).forEach(key => {
                const checkbox = this.document.getElementById(`sb-${key}`);
                if (!checkbox) return;
                checkbox.checked = this.sponsorBlockCategories[key];
                checkbox.addEventListener('change', event => {
                    const checked = event.target.checked;
                    this.sponsorBlockCategories[key] = checked;
                    this.logSystem(`Cập nhật SponsorBlock: ${this.categoryLabels[key]} -> ${checked ? 'BẬT' : 'TẮT'}`);
                    this.storage?.setItem('dua_sb_categories', JSON.stringify(this.sponsorBlockCategories));
                    this.publishMqtt('sb_categories', this.sponsorBlockCategories);
                });
            });
        }

        initAppearanceSettings() {
            const themeSelect = this.document.getElementById('obs-theme-select');
            if (themeSelect) {
                this.storage?.setItem('dua_theme', this.state.theme);
                themeSelect.value = this.state.theme;
                const preview = this.document.getElementById('theme-preview-iframe');
                if (preview) preview.src = `overlay.html?preview=true&theme=${this.state.theme}`;
            }
            const opacityRange = this.document.getElementById('obs-opacity-range');
            const opacityValue = this.document.getElementById('obs-opacity-val');
            if (opacityRange && opacityValue) {
                opacityRange.value = this.state.opacity;
                opacityValue.textContent = `${this.state.opacity}%`;
            }
        }

        initOverlayTextSetting(config) {
            const input = this.document.getElementById(config.inputId);
            if (!input) return;
            const button = this.document.getElementById(config.buttonId);
            const counter = this.document.getElementById(config.counterId);
            input.value = this.state[config.stateKey] || '';
            const updateCounter = () => {
                if (!counter) return;
                const length = input.value.length;
                counter.textContent = `${length}/50`;
                counter.style.color = length >= 50 ? '#EF4444' : '';
                input.style.borderColor = length >= 50 ? '#EF4444' : '';
            };
            input.addEventListener('input', updateCounter);
            updateCounter();
            button?.addEventListener('click', () => {
                const value = (input.value || config.fallback).substring(0, 50);
                this.state[config.stateKey] = value;
                this.storage?.setItem(config.storageKey, value);
                this.publishMqtt(config.mqttTopic, { [config.payloadKey]: value });
                config.afterSave?.();
                this.logSystem(`Đã lưu và đồng bộ ${config.logLabel}: "<strong>${value}</strong>"`, 'system');
                this.flashApplyButton(button);
                this.alert(config.alertText);
            });
        }

        initBooleanSetting(config) {
            const element = this.document.getElementById(config.elementId);
            if (!element) return;
            element.checked = Boolean(this.state[config.stateKey]);
            element.addEventListener('change', event => {
                const checked = event.target.checked;
                this.state[config.stateKey] = checked;
                this.storage?.setItem(config.storageKey, String(checked));
                if (config.mqttTopic) this.publishMqtt(config.mqttTopic, { [config.payloadKey]: checked });
                config.onChange?.(checked);
            });
        }

        flashApplyButton(button) {
            button.style.background = 'var(--pineapple-success)';
            this.setTimeout(() => { button.style.background = 'var(--pineapple-yellow)'; }, 800);
        }

        cancelQuickAddSearch() {
            if (this.searchTimeout) this.clearTimeout(this.searchTimeout);
            this.setSearchTimeout(null);
        }

        setSearchTimeout(timeout) {
            this.searchTimeout = timeout;
            this.onSearchTimeoutChange(timeout);
        }

        isUrl(query) {
            return query.startsWith('http://') || query.startsWith('https://') || query.startsWith('spotify:');
        }

        handleQuickAddInput(urlInput, results, clearButton, popover) {
            const query = urlInput.value.trim();
            if (clearButton) clearButton.style.display = query ? 'flex' : 'none';
            if (query) popover?.classList.add('visible');
            this.cancelQuickAddSearch();

            if (!query || query.length < 2) {
                results.style.display = 'none';
                return;
            }

            const playlistId = this.parseYoutubePlaylistId(query);
            const youtubeId = this.parseYoutubeId(query);
            results.style.display = 'flex';

            this.setSearchTimeout(this.setTimeout(async () => {
                this.setSearchTimeout(null);
                if (urlInput.value.trim() !== query) return;

                if (playlistId) {
                    results.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--pineapple-text);">Đã nhận diện playlist YouTube · Nhấn Enter để thêm toàn bộ playlist</div>';
                    return;
                }
                if (youtubeId) {
                    await this.loadDirectMedia({ urlInput, results, query, type: 'youtube', id: youtubeId });
                    return;
                }
                if (query.includes('soundcloud.com')) {
                    await this.loadDirectMedia({ urlInput, results, query, type: 'soundcloud', id: null });
                    return;
                }
                if (this.isUrl(query)) {
                    results.style.display = 'none';
                    return;
                }
                await this.searchYoutube(urlInput, results, query);
            }, 350));
        }

        async loadDirectMedia({ urlInput, results, query, type, id }) {
            const platform = type === 'youtube' ? 'YouTube' : 'SoundCloud';
            results.innerHTML = `<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải thông tin ${platform}...</div>`;
            try {
                const metadata = await this.fetchSongMetadata(type, id, type === 'soundcloud' ? query : undefined);
                if (urlInput.value.trim() !== query) return;
                if (!metadata?.title) throw new Error('Missing media metadata');
                const author = this.cleanChannelName(metadata.author || platform);
                this.renderSearchResults([{
                    id: id || query,
                    videoId: type === 'youtube' ? id : undefined,
                    soundcloudUrl: type === 'soundcloud' ? query : undefined,
                    type,
                    title: metadata.title,
                    thumbnail: metadata.thumbnail,
                    author,
                    channel: author,
                    duration: metadata.duration || '',
                    views: metadata.views || ''
                }], 'quick-add-search-results');
            } catch (_) {
                if (urlInput.value.trim() === query) {
                    results.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Nhấn Enter để thêm bài hát!</div>';
                }
            }
        }

        async searchYoutube(urlInput, results, query) {
            results.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tìm kiếm trên YouTube...</div>';
            try {
                const response = await this.callYouTubeSearch(query);
                if (urlInput.value.trim() !== query || response?.aborted) return;
                if (response?.success && response.videos?.length) {
                    this.renderSearchResults(response.videos, 'quick-add-search-results');
                } else if (response?.error) {
                    results.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${response.error}</div>`;
                } else {
                    results.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Không tìm thấy kết quả phù hợp!</div>';
                }
            } catch (_) {
                if (urlInput.value.trim() === query) {
                    results.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng!</div>';
                }
            }
        }
    }

    return DashboardBootstrapController;
});
