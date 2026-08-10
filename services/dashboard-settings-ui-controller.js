(function (root, factory) {
    const DashboardSettingsUiController = factory();
    if (typeof module === 'object' && module.exports) module.exports = DashboardSettingsUiController;
    if (root) root.DashboardSettingsUiController = DashboardSettingsUiController;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    class DashboardSettingsUiController {
        constructor(options = {}) {
            Object.assign(this, options);
            this.document = options.document || (typeof document !== 'undefined' ? document : null);
            this.window = options.window || (typeof window !== 'undefined' ? window : {});
            this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
            const setTimeoutImpl = options.setTimeout || this.window.setTimeout || globalThis.setTimeout;
            this.setTimeout = (...args) => Reflect.apply(setTimeoutImpl, this.window || globalThis, args);
            this.alert = options.alert || (() => {});
            this.initialized = false;
        }

        init() {
            if (this.initialized || !this.document) return;
            this.initialized = true;
            const document = this.document;
            const window = this.window;
            const localStorage = this.storage;
            const setTimeout = this.setTimeout;
            const alert = this.alert;
            const {
                state, publishMqtt, logSystem, fetchSensitiveVideosConfig, updatePlayerUI,
                showDashboardSystemAlert, sendControlCommand, applyDarkModeState,
                generateExtensionCode, calculateMaxDurationForSong, updateMaxDurationValue,
                syncMaxDurationToOverlay, renderQueue, updateForceExtensionButtonUI,
                updateVoteSkipButtonUI, onMinAmountConfigChange
            } = this;

    // Thiết lập input link Gist JSON cảnh báo nhạy cảm
    const sensitiveUrlInput = document.getElementById('sensitive-videos-url-input');
    const sensitiveUrlApplyBtn = document.getElementById('btn-sensitive-videos-url-apply');
    if (sensitiveUrlInput) {
        sensitiveUrlInput.value = state.sensitiveVideosUrl;
        if (sensitiveUrlApplyBtn) {
            sensitiveUrlApplyBtn.addEventListener('click', () => {
                const val = (sensitiveUrlInput.value || '').trim();
                state.sensitiveVideosUrl = val;
                localStorage.setItem('dua_sensitive_videos_url', val);
                publishMqtt('sensitive_videos_url', { url: val });
                logSystem(`Đã lưu và đồng bộ Link Gist cảnh báo: "<strong>${val || 'Mặc định'}</strong>"`, 'system');
                
                // Tải lại danh sách nhạy cảm ngay lập tức và cập nhật UI
                fetchSensitiveVideosConfig().then(() => {
                    updatePlayerUI(state.currentSong);
                });

                sensitiveUrlApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    sensitiveUrlApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
                
                alert("Đã lưu và đồng bộ Link JSON cảnh báo nhạy cảm trực tuyến!");
            });
        }
    }

    // Thiết lập cấu hình Hỗ trợ phát nhạc bản quyền (yt-bypass-toggle và yt-dlp check)
    const ytBypassToggle = document.getElementById('yt-bypass-toggle');
    const ytdlpStatusText = document.getElementById('ytdlp-status-text');
    const btnYtdlpDownload = document.getElementById('btn-ytdlp-download');

    // Hàm gọi đến main process để kiểm tra trạng thái yt-dlp
    function checkYtDlpStatus() {
        if (!window.electronAPI || typeof window.electronAPI.checkYtDlpStatus !== 'function') {
            if (ytdlpStatusText) ytdlpStatusText.textContent = "Không hỗ trợ trong trình duyệt";
            if (btnYtdlpDownload) btnYtdlpDownload.style.display = 'none';
            return;
        }

        window.electronAPI.checkYtDlpStatus().then((status) => {
            updateYtDlpUI(status);
        }).catch((err) => {
            console.error("Lỗi check yt-dlp status:", err);
            if (ytdlpStatusText) ytdlpStatusText.textContent = "Lỗi kiểm tra công cụ.";
        });
    }

    // Cập nhật giao diện của phần yt-dlp dựa trên status trả về
    function updateYtDlpUI(status) {
        if (!ytdlpStatusText || !btnYtdlpDownload) return;

        const progress = status.progress;
        const exists = status.exists;
        const error = status.error;

        if (progress !== null && !isNaN(progress) && progress >= 0 && progress < 100) {
            ytdlpStatusText.innerHTML = `<span style="color: var(--pineapple-orange-dark); font-weight: 800;">Đang tải xuống: ${progress}%...</span>`;
            btnYtdlpDownload.disabled = true;
            btnYtdlpDownload.textContent = "Đang tải...";
            btnYtdlpDownload.style.opacity = "0.6";
        } else if (progress === 100 || progress === 'success') {
            ytdlpStatusText.innerHTML = `<span style="color: var(--pineapple-success); font-weight: 800;">Đã cài đặt thành công (Sẵn sàng)</span>`;
            btnYtdlpDownload.disabled = false;
            btnYtdlpDownload.textContent = "Cập nhật yt-dlp.exe";
            btnYtdlpDownload.style.opacity = "1";
        } else if (progress === -1 || error) {
            ytdlpStatusText.innerHTML = `<span style="color: #EF4444; font-weight: 800;">Lỗi tải: ${error || 'Không xác định'}</span>`;
            btnYtdlpDownload.disabled = false;
            btnYtdlpDownload.textContent = "Thử lại";
            btnYtdlpDownload.style.opacity = "1";
        } else {
            // progress === null
            if (exists) {
                ytdlpStatusText.innerHTML = `<span style="color: var(--pineapple-success); font-weight: 800;">Đã cài đặt (Sẵn sàng)</span>`;
                btnYtdlpDownload.disabled = false;
                btnYtdlpDownload.textContent = "Cập nhật yt-dlp.exe";
                btnYtdlpDownload.style.opacity = "1";
            } else {
                ytdlpStatusText.innerHTML = `<span style="color: #6B7280; font-weight: 800;">Chưa cài đặt (Cần tải công cụ)</span>`;
                btnYtdlpDownload.disabled = false;
                btnYtdlpDownload.textContent = "Tải yt-dlp.exe";
                btnYtdlpDownload.style.opacity = "1";
            }
        }
    }

    if (ytBypassToggle) {
        const isBypassEnabled = localStorage.getItem('dua_yt_bypass_enabled') !== 'false';
        ytBypassToggle.checked = isBypassEnabled;
        
        ytBypassToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('dua_yt_bypass_enabled', isChecked ? 'true' : 'false');
            // Dashboard (file://) và OBS overlay (http://localhost) không dùng chung
            // localStorage; gửi cờ này qua realtime để overlay dùng đúng lựa chọn.
            publishMqtt('direct_stream_config', { enabled: isChecked });
            logSystem(`🔧 <strong>[Bản quyền]</strong> Đã ${isChecked ? 'BẬT' : 'TẮT'} tự động sử dụng luồng âm thanh dự phòng (DirectStream) cho nhạc bản quyền.`, 'system');
            showDashboardSystemAlert("Phát nhạc bản quyền", `Đã ${isChecked ? 'bật' : 'tắt'} tự động sử dụng luồng dự phòng.`);
        });
    }

    // Thiết lập cấu hình Âm lượng thích ứng (adaptive-volume-toggle)
    const adaptiveVolumeToggle = document.getElementById('adaptive-volume-toggle');
    if (adaptiveVolumeToggle) {
        const isAdaptiveEnabled = localStorage.getItem('dua_adaptive_volume_enabled') === 'true';
        adaptiveVolumeToggle.checked = isAdaptiveEnabled;
        
        adaptiveVolumeToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('dua_adaptive_volume_enabled', isChecked ? 'true' : 'false');
            logSystem(`🔧 <strong>[Âm lượng thích ứng]</strong> Đã ${isChecked ? 'BẬT' : 'TẮT'} tự động điều chỉnh âm lượng thích ứng.`, 'system');
            showDashboardSystemAlert("Âm lượng thích ứng", `Đã ${isChecked ? 'bật' : 'tắt'} tự động điều chỉnh âm lượng.`);
            
            // Gửi tin nhắn đồng bộ sang overlay để cập nhật trạng thái ngay lập tức
            sendControlCommand('set_adaptive_volume', isChecked);
        });
    }

    // Khởi tạo hàm downloadYtDlp toàn cục để gọi từ button onclick
    window.downloadYtDlp = function() {
        if (!window.electronAPI || typeof window.electronAPI.downloadYtDlp !== 'function') return;

        logSystem(`📥 <strong>[yt-dlp]</strong> Bắt đầu tải/cập nhật công cụ hỗ trợ phát nhạc bản quyền (yt-dlp.exe)...`, 'system');
        if (btnYtdlpDownload) {
            btnYtdlpDownload.disabled = true;
            btnYtdlpDownload.textContent = "Đang tải...";
            btnYtdlpDownload.style.opacity = "0.6";
        }
        if (ytdlpStatusText) {
            ytdlpStatusText.innerHTML = `<span style="color: var(--pineapple-orange-dark); font-weight: 800;">Đang kết nối tải xuống...</span>`;
        }

        window.electronAPI.downloadYtDlp().then((res) => {
            if (res && res.success) {
                // Thành công
            } else {
                const errMsg = res ? res.error : 'Lỗi không rõ';
                logSystem(`❌ <strong>[yt-dlp]</strong> Lỗi bắt đầu tải xuống: ${errMsg}`, 'error');
                if (ytdlpStatusText) {
                    ytdlpStatusText.innerHTML = `<span style="color: #EF4444; font-weight: 800;">Lỗi: ${errMsg}</span>`;
                }
                if (btnYtdlpDownload) {
                    btnYtdlpDownload.disabled = false;
                    btnYtdlpDownload.textContent = "Thử lại";
                    btnYtdlpDownload.style.opacity = "1";
                }
            }
        }).catch((err) => {
            logSystem(`❌ <strong>[yt-dlp]</strong> Gặp lỗi khi gọi yêu cầu tải: ${err.message}`, 'error');
            if (ytdlpStatusText) {
                ytdlpStatusText.innerHTML = `<span style="color: #EF4444; font-weight: 800;">Lỗi: ${err.message}</span>`;
            }
            if (btnYtdlpDownload) {
                btnYtdlpDownload.disabled = false;
                btnYtdlpDownload.textContent = "Thử lại";
                btnYtdlpDownload.style.opacity = "1";
            }
        });
    };

    // Lắng nghe tiến trình tải về từ main process
    if (window.electronAPI && typeof window.electronAPI.onYtDlpDownloadProgress === 'function') {
        window.electronAPI.onYtDlpDownloadProgress((data) => {
            const progress = data.progress;
            if (progress === 100) {
                logSystem(`✅ <strong>[yt-dlp]</strong> Đã tải và cài đặt thành công công cụ hỗ trợ yt-dlp.exe! Sẵn sàng phát nhạc bản quyền.`, 'system');
                checkYtDlpStatus();
            } else if (progress === -1) {
                const errMsg = data.error || 'Lỗi tải tệp tin';
                logSystem(`❌ <strong>[yt-dlp]</strong> Tải công cụ thất bại: ${errMsg}`, 'error');
                checkYtDlpStatus();
            } else {
                // Đang tải
                if (ytdlpStatusText) {
                    ytdlpStatusText.innerHTML = `<span style="color: var(--pineapple-orange-dark); font-weight: 800;">Đang tải xuống: ${progress}%...</span>`;
                }
            }
        });
    }

    // Gọi check status lúc khởi chạy
    checkYtDlpStatus();

    // Khôi phục trạng thái Dark Mode
    applyDarkModeState();

    // Thiết lập cài đặt checkbox Chủ kênh thêm nhạc
    const quickOwnerAddCheckbox = document.getElementById('quick-owner-add');
    if (quickOwnerAddCheckbox) {
        const isQuickOwnerAdd = localStorage.getItem('dua_quick_owner_add') === 'true';
        quickOwnerAddCheckbox.checked = isQuickOwnerAdd;
        
        const nameInput = document.getElementById('quick-donor-name');
        const amountInput = document.getElementById('quick-donor-amount');
        const toggleInputs = () => {
            const isChecked = quickOwnerAddCheckbox.checked;
            if (nameInput) {
                nameInput.disabled = isChecked;
                nameInput.style.opacity = isChecked ? '0.5' : '1';
                nameInput.style.cursor = isChecked ? 'not-allowed' : '';
            }
            if (amountInput) {
                amountInput.disabled = isChecked;
                amountInput.style.opacity = isChecked ? '0.5' : '1';
                amountInput.style.cursor = isChecked ? 'not-allowed' : '';
            }
        };
        
        quickOwnerAddCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('dua_quick_owner_add', e.target.checked ? 'true' : 'false');
            logSystem(`Cập nhật chế độ Chủ kênh thêm nhạc: ${e.target.checked ? 'BẬT' : 'TẮT'}`, 'system');
            toggleInputs();
        });
        
        toggleInputs();
    }

    // Thiết lập input Giới hạn thời gian phát tối đa
    const maxDurToggle = document.getElementById('max-duration-toggle');
    const maxDurInput = document.getElementById('max-duration-input');
    const maxDurGroup = document.getElementById('max-duration-form-group');
    const maxDurApplyBtn = document.getElementById('btn-max-duration-apply');

    const limitModeFixed = document.getElementById('limit-mode-fixed');
    const limitModeMilestone = document.getElementById('limit-mode-milestone');
    const milestoneGroup = document.getElementById('milestone-form-group');
    const milestoneContainer = document.getElementById('milestone-list-container');
    const addMilestoneBtn = document.getElementById('btn-add-milestone');
    const msDurDefault = document.getElementById('ms-dur-default');
    const msApplyBtn = document.getElementById('btn-milestone-apply');

    function renderMilestonesUI() {
        if (!milestoneContainer) return;
        milestoneContainer.innerHTML = '';
        
        state.milestones.forEach((milestone, idx) => {
            const row = document.createElement('div');
            row.className = 'milestone-row';
            row.style.display = 'flex';
            row.style.gap = '0.4rem';
            row.style.alignItems = 'center';
            row.style.fontSize = '0.85rem';
            row.style.fontWeight = '700';
            row.style.flexWrap = 'wrap';
            
            row.innerHTML = `
                <span>Dưới <</span>
                <input class="dua-input ms-amount-input" style="width: 110px; padding: 0.25rem 0.5rem; border-radius: 8px; font-size: 0.8rem; box-shadow: none;" type="number" value="${milestone.amount}">
                <span>VNĐ phát tối đa</span>
                <input class="dua-input ms-duration-input" style="width: 110px; padding: 0.25rem 0.5rem; border-radius: 8px; font-size: 0.8rem; box-shadow: none;" type="number" value="${milestone.duration}">
                <span>phút</span>
                <button class="btn-remove-milestone" type="button" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 0.2rem; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; outline: none;" title="Xóa mốc này">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            
            const removeBtn = row.querySelector('.btn-remove-milestone');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    saveInputsToState();
                    state.milestones.splice(idx, 1);
                    renderMilestonesUI();
                });
            }
            
            milestoneContainer.appendChild(row);
        });
    }

    function saveInputsToState() {
        if (!milestoneContainer) return;
        const rows = milestoneContainer.querySelectorAll('.milestone-row');
        const newMilestones = [];
        rows.forEach(row => {
            const amountInput = row.querySelector('.ms-amount-input');
            const durInput = row.querySelector('.ms-duration-input');
            if (amountInput && durInput) {
                newMilestones.push({
                    amount: parseInt(amountInput.value) || 0,
                    duration: parseInt(durInput.value) || 0
                });
            }
        });
        state.milestones = newMilestones;
        if (msDurDefault) {
            state.defaultDuration = parseInt(msDurDefault.value) || 30;
        }
    }

    function updateLimitUI() {
        if (!state.maxDurationEnabled) {
            maxDurGroup.style.display = 'none';
            milestoneGroup.style.display = 'none';
        } else {
            if (state.limitMode === 'fixed') {
                maxDurGroup.style.display = 'block';
                milestoneGroup.style.display = 'none';
            } else {
                maxDurGroup.style.display = 'none';
                milestoneGroup.style.display = 'flex';
            }
        }
    }

    if (maxDurToggle && maxDurInput && maxDurGroup && maxDurApplyBtn) {
        maxDurToggle.checked = state.maxDurationEnabled;
        maxDurInput.value = state.maxDuration;

        if (state.limitMode === 'fixed') {
            limitModeFixed.checked = true;
        } else {
            limitModeMilestone.checked = true;
        }

        if (msDurDefault) msDurDefault.value = state.defaultDuration;
        renderMilestonesUI();

        updateLimitUI();
        updateMaxDurationValue();

        maxDurToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            state.maxDurationEnabled = isChecked;
            localStorage.setItem('dua_max_duration_enabled', isChecked);
            updateLimitUI();
            
            if (!isChecked) {
                syncMaxDurationToOverlay(0);
                // Tắt giới hạn → reset bypass
                state.bypassCurrentSongDuration = false;
                renderQueue();
                logSystem("Tắt giới hạn thời gian phát nhạc.");
                showDashboardSystemAlert("Giới hạn thời gian", "Đã tắt giới hạn thời gian phát nhạc.");
            } else {
                updateMaxDurationValue();
                logSystem(`Đã mở cài đặt giới hạn phát.`);
                showDashboardSystemAlert("Giới hạn thời gian", "Đã bật giới hạn thời gian phát nhạc.");
            }
        });

        const handleLimitModeChange = (e) => {
            state.limitMode = e.target.value;
            localStorage.setItem('dua_limit_mode', state.limitMode);
            updateLimitUI();
            // Đặt lại cờ bypass khi đổi chế độ giới hạn
            state.bypassCurrentSongDuration = false;
            renderQueue();
            updateMaxDurationValue();
            logSystem(`Đổi chế độ giới hạn thời gian: <strong>${state.limitMode === 'fixed' ? 'Cố định' : 'Theo mốc donate'}</strong>`);
        };

        if (limitModeFixed) limitModeFixed.addEventListener('change', handleLimitModeChange);
        if (limitModeMilestone) limitModeMilestone.addEventListener('change', handleLimitModeChange);

        maxDurApplyBtn.addEventListener('click', () => {
            const val = parseInt(maxDurInput.value) || 180;
            state.maxDuration = val;
            localStorage.setItem('dua_max_duration_val', val);
            
            if (state.maxDurationEnabled) {
                syncMaxDurationToOverlay(val);
                // Đặt lại cờ bypass khi người dùng áp dụng giới hạn mới
                state.bypassCurrentSongDuration = false;
                renderQueue();
                logSystem(`Đã áp dụng giới hạn phát cố định: <strong>Phát tối đa ${val} giây mỗi bài</strong>`, 'system');
                showDashboardSystemAlert("Giới hạn thời gian", `Đã áp dụng giới hạn phát cố định: <strong>Phát tối đa ${val} giây mỗi bài</strong>`);
                
                maxDurApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    maxDurApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
            } else {
                logSystem("Vui lòng tích chọn 'Kích hoạt' trước để áp dụng giới hạn thời gian phát!", 'system');
            }
        });

        if (addMilestoneBtn) {
            addMilestoneBtn.addEventListener('click', () => {
                saveInputsToState();
                let lastAmount = 100000;
                let lastDur = 5;
                if (state.milestones.length > 0) {
                    const sorted = [...state.milestones].sort((a, b) => a.amount - b.amount);
                    const lastEl = sorted[sorted.length - 1];
                    lastAmount = lastEl.amount + 100000;
                    lastDur = lastEl.duration + 5;
                }
                state.milestones.push({ amount: lastAmount, duration: lastDur });
                state.milestones.sort((a, b) => a.amount - b.amount);
                renderMilestonesUI();
            });
        }

        if (msApplyBtn) {
            msApplyBtn.addEventListener('click', () => {
                saveInputsToState();
                
                // Sắp xếp các mốc
                state.milestones.sort((a, b) => a.amount - b.amount);
                renderMilestonesUI();
                
                localStorage.setItem('dua_milestones', JSON.stringify(state.milestones));
                localStorage.setItem('dua_default_duration', state.defaultDuration);

                if (state.maxDurationEnabled) {
                    updateMaxDurationValue();
                    // Đặt lại cờ bypass khi người dùng áp dụng cấu hình mốc mới
                    state.bypassCurrentSongDuration = false;
                    renderQueue();
                    
                    let msg = "Đã áp dụng cấu hình mốc donate: ";
                    if (state.milestones.length > 0) {
                        const milestoneStrings = state.milestones.map(m => `dưới ${m.amount.toLocaleString('vi-VN')} VNĐ phát ${m.duration} phút`);
                        msg += milestoneStrings.join(', ') + `, còn lại phát ${state.defaultDuration} phút.`;
                    } else {
                        msg += `còn lại phát ${state.defaultDuration} phút.`;
                    }
                    logSystem(msg, 'system');
                    showDashboardSystemAlert("Giới hạn thời gian", "Đã áp dụng cấu hình mốc phát nhạc.");
                    
                    msApplyBtn.style.background = 'var(--pineapple-success)';
                    setTimeout(() => {
                        msApplyBtn.style.background = 'var(--pineapple-yellow)';
                    }, 800);
                } else {
                    logSystem("Vui lòng tích chọn 'Kích hoạt' trước để áp dụng cấu hình mốc!", 'system');
                }
            });
        }

        // Thiết lập cấu hình Gia hạn thời gian
        const extensionToggle = document.getElementById('extension-toggle');
        const extensionPriceInput = document.getElementById('extension-price-input');
        const extensionMinutesInput = document.getElementById('extension-minutes-input');
        const extensionFormGroup = document.getElementById('extension-form-group');
        const extensionApplyBtn = document.getElementById('btn-extension-apply');

        function updateExtensionUI() {
            if (!extensionToggle || !extensionFormGroup) return;
            if (!state.extensionEnabled) {
                extensionFormGroup.style.display = 'none';
            } else {
                extensionFormGroup.style.display = 'flex';
            }
        }

        if (extensionToggle && extensionPriceInput && extensionMinutesInput && extensionFormGroup && extensionApplyBtn) {
            extensionToggle.checked = state.extensionEnabled;
            extensionPriceInput.value = state.extensionPrice;
            extensionMinutesInput.value = state.extensionMinutes;

            updateExtensionUI();

            extensionToggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                state.extensionEnabled = isChecked;
                localStorage.setItem('dua_extension_enabled', isChecked ? 'true' : 'false');
                updateExtensionUI();
                
                // Nếu bật gia hạn và đang có bài hát phát nhưng chưa có code, tự động sinh mã
                if (isChecked && state.currentSong && !state.currentSong.extensionCode) {
                    state.currentSong.extensionCode = generateExtensionCode();
                    state.currentSong.extendedDuration = state.currentSong.extendedDuration || 0;
                    state.currentSong = state.currentSong; // trigger setter
                    
                    const payloadRaw = localStorage.getItem('dua_current_song');
                    if (payloadRaw) {
                        try {
                            const payload = JSON.parse(payloadRaw);
                            payload.extensionCode = state.currentSong.extensionCode;
                            payload.maxDuration = calculateMaxDurationForSong(state.currentSong);
                            payload.extensionPrice = state.extensionPrice;
                            payload.extensionMinutes = state.extensionMinutes;
                            localStorage.setItem('dua_current_song', JSON.stringify(payload));
                            publishMqtt('current_song', payload);
                        } catch(e) {}
                    }
                    updateMaxDurationValue();
                }
                
                logSystem(`Cập nhật chế độ gia hạn thời gian: ${isChecked ? 'BẬT' : 'TẤT'}`, 'system');
                showDashboardSystemAlert("Gia hạn thời gian", `Cập nhật chế độ gia hạn thời gian: ${isChecked ? 'BẬT' : 'TẤT'}`);
                updateForceExtensionButtonUI();
                updatePlayerUI(state.currentSong);
            });

            extensionApplyBtn.addEventListener('click', () => {
                const price = parseInt(extensionPriceInput.value) || 50000;
                const minutes = parseInt(extensionMinutesInput.value) || 6;
                
                state.extensionPrice = price;
                state.extensionMinutes = minutes;
                localStorage.setItem('dua_extension_price', price);
                localStorage.setItem('dua_extension_minutes', minutes);

                // Sync rate mới xuống payload overlay nếu đang có bài hát
                const payloadRaw = localStorage.getItem('dua_current_song');
                if (payloadRaw) {
                    try {
                        const payload = JSON.parse(payloadRaw);
                        payload.extensionPrice = price;
                        payload.extensionMinutes = minutes;
                        localStorage.setItem('dua_current_song', JSON.stringify(payload));
                        publishMqtt('current_song', payload);
                    } catch(e) {}
                }
                
                logSystem(`Đã áp dụng cấu hình gia hạn: <strong>${price.toLocaleString('vi-VN')} VNĐ = ${minutes} phút</strong>`, 'system');
                showDashboardSystemAlert("Gia hạn thời gian", `Đã áp dụng cấu hình gia hạn: <strong>${price.toLocaleString('vi-VN')} VNĐ = ${minutes} phút</strong>`);
                
                updatePlayerUI(state.currentSong);
                extensionApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    extensionApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
            });
        }

        // Thiết lập cấu hình Vote Skip
        const voteSkipDefaultAmountInput = document.getElementById('vote-skip-default-amount-input');
        const voteSkipSettingsApplyBtn = document.getElementById('btn-vote-skip-settings-apply');
        
        if (voteSkipDefaultAmountInput && voteSkipSettingsApplyBtn) {
            voteSkipDefaultAmountInput.value = state.voteSkipDefaultAmount;
            
            voteSkipSettingsApplyBtn.addEventListener('click', () => {
                const defaultAmt = parseInt(voteSkipDefaultAmountInput.value) || 20000;
                state.voteSkipDefaultAmount = defaultAmt;
                localStorage.setItem('dua_vote_skip_default_amount', defaultAmt);
                
                // Đồng bộ nếu bài hát đang phát là bài tự thêm và đang bật vote skip
                if (state.currentSong) {
                    if (state.currentSong.isOwnerAdd) {
                        state.currentSong.voteSkipTarget = defaultAmt;
                        state.currentSong = state.currentSong; // trigger setter
                        
                        const payloadRaw = localStorage.getItem('dua_current_song');
                        if (payloadRaw) {
                            try {
                                const payload = JSON.parse(payloadRaw);
                                payload.voteSkipTarget = defaultAmt;
                                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                                publishMqtt('current_song', payload);
                            } catch (e) {}
                        }
                        updateVoteSkipButtonUI();
                    }
                }
                
                logSystem(`Đã áp dụng cấu hình mục tiêu skip mặc định cho bài tự thêm: <strong>${defaultAmt.toLocaleString('vi-VN')} VNĐ</strong>`, 'system');
                showDashboardSystemAlert("Vote Skip", `Đã áp dụng cấu hình mục tiêu skip mặc định: <strong>${defaultAmt.toLocaleString('vi-VN')} VNĐ</strong>`);
                
                voteSkipSettingsApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    voteSkipSettingsApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
            });
        }
    }

    this.loadConfigFromAppData?.();

    // Thiết lập sự kiện áp dụng cho số tiền tối thiểu nhận nhạc từ tin nhắn ZyPage
    const minAmountInput = document.getElementById('zypage-min-amount-input');
    const minAmountApplyBtn = document.getElementById('btn-zypage-min-amount-apply');
    if (minAmountInput && minAmountApplyBtn) {
        minAmountApplyBtn.addEventListener('click', () => {
            const val = minAmountInput.value;
            onMinAmountConfigChange(val);

            // Phản hồi trực quan trên nút
            minAmountApplyBtn.style.background = 'var(--pineapple-success)';
            setTimeout(() => {
                minAmountApplyBtn.style.background = 'var(--pineapple-yellow)';
            }, 800);

            alert("Đã áp dụng số tiền tối thiểu mới nhận nhạc từ tin nhắn!");
        });

        // Hỗ trợ nhấn Enter trong ô nhập liệu
        minAmountInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                minAmountApplyBtn.click();
            }
        });
    }

    this.checkYoutubeAuth?.();

        }
    }

    return DashboardSettingsUiController;
});
