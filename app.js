// Trình quản lý Nhạc Donate Dứa Corner — Logic Chính (app.js)

// Tự động chuyển hướng từ 127.0.0.1 sang localhost để tránh bị YouTube chặn bản quyền âm nhạc
if (window.location.hostname === '127.0.0.1') {
    window.location.replace(window.location.href.replace('127.0.0.1', 'localhost'));
}

// Helper để lấy đúng base API host khi chạy ở trình duyệt ngoài (ví dụ Live Server trên port 5500)
function getApiUrl(path) {
    if (window.location.port === '3000' || window.electronAPI) {
        return path;
    }
    return `http://localhost:3000${path}`;
}

async function callYouTubeSearch(query) {
    if (window.electronAPI && typeof window.electronAPI.searchYouTube === 'function') {
        return await window.electronAPI.searchYouTube(query);
    }
    const response = await fetch(getApiUrl(`/api/youtube-search?q=${encodeURIComponent(query)}`));
    return await response.json();
}

function formatViewsCompact(views) {
    if (!views) return '';
    if (isNaN(views)) {
        return views.replace(/\s*(views|lượt xem|views?|lượt nghe|plays?|play_count)\s*/gi, '').trim();
    }
    const num = parseInt(views, 10);
    if (isNaN(num)) return '';
    if (num >= 1e9) {
        return (num / 1e9).toFixed(1).replace(/\.0$/, '') + ' Tỷ';
    }
    if (num >= 1e6) {
        return (num / 1e6).toFixed(1).replace(/\.0$/, '') + ' Tr';
    }
    if (num >= 1e3) {
        return (num / 1e3).toFixed(1).replace(/\.0$/, '') + ' N';
    }
    return num.toLocaleString('vi-VN');
}


// Chuẩn hóa timestamp về dạng mili-giây (nếu là giây thì nhân với 1000) để đồng bộ giữa nhạc tự add và nhạc donate
function normalizeTimestamp(t) {
    if (!t) return Date.now();
    const num = Number(t);
    return (num < 10000000000) ? num * 1000 : num;
}

// --- BIẾN TOÀN CỤC & CẤU HÌNH ---
let player = null;
let isPlayerApiReady = false;
let playbackMonitorInterval = null;
let lastPlayedVideoId = null;
let searchTimeout = null;

// Khởi tạo trạng thái trống (không lưu các bài hát đã order từ phiên trước)
const state = {
    queue: (() => {
        try {
            const raw = localStorage.getItem('dua_queue');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    })(),
    _currentSong: (() => {
        try {
            const raw = localStorage.getItem('dua_current_song_raw');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    })(),
    get currentSong() {
        return this._currentSong;
    },
    set currentSong(val) {
        this._currentSong = val;
        if (val) {
            localStorage.setItem('dua_current_song_raw', JSON.stringify(val));
        } else {
            localStorage.removeItem('dua_current_song_raw');
        }
    },
    _isPlaying: localStorage.getItem('dua_is_playing') === 'true',
    get isPlaying() {
        return this._isPlaying;
    },
    set isPlaying(val) {
        this._isPlaying = val;
        localStorage.setItem('dua_is_playing', val);
    },
    playerVisible: localStorage.getItem('dua_player_visible') !== 'false', // mặc định true
    sortConfig: localStorage.getItem('dua_sort_config') || 'time', // 'time' hoặc 'amount'
    viewMode: 'dashboard',
    skipSegments: [],
    volume: localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : 80,
    maxDurationEnabled: localStorage.getItem('dua_max_duration_enabled') === 'true',
    maxDuration: parseInt(localStorage.getItem('dua_max_duration_val')) || 180,
    limitMode: localStorage.getItem('dua_limit_mode') || 'fixed',
    milestones: (() => {
        const rawMilestones = localStorage.getItem('dua_milestones');
        let parsed = null;
        try {
            parsed = rawMilestones ? JSON.parse(rawMilestones) : null;
        } catch (e) {}
        
        let initialMilestones = [
            { amount: 100000, duration: 5 },
            { amount: 200000, duration: 15 }
        ];
        
        if (parsed) {
            if (Array.isArray(parsed)) {
                initialMilestones = parsed;
            } else if (typeof parsed === 'object') {
                // Di trú dữ liệu cũ
                initialMilestones = [];
                if (parsed.amount1 !== undefined && parsed.dur1 !== undefined) {
                    initialMilestones.push({ amount: Number(parsed.amount1) || 100000, duration: Number(parsed.dur1) || 5 });
                }
                if (parsed.amount2 !== undefined && parsed.dur2 !== undefined) {
                    initialMilestones.push({ amount: Number(parsed.amount2) || 200000, duration: Number(parsed.dur2) || 15 });
                }
            }
        }
        return initialMilestones;
    })(),
    defaultDuration: (() => {
        const rawMilestones = localStorage.getItem('dua_milestones');
        let parsed = null;
        try {
            parsed = rawMilestones ? JSON.parse(rawMilestones) : null;
        } catch (e) {}
        
        let initialDefault = 30;
        if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
            if (parsed.dur3 !== undefined) {
                initialDefault = Number(parsed.dur3) || 30;
            }
        }
        const savedDefault = localStorage.getItem('dua_default_duration');
        return savedDefault !== null ? parseInt(savedDefault) : initialDefault;
    })(),
    
    // Thuộc tính phục vụ Live Sync ZyPage
    zypageToken: localStorage.getItem('dua_zypage_token') || '',
    zypageShopId: localStorage.getItem('dua_zypage_shop_id') || '',
    zypageDomain: localStorage.getItem('dua_zypage_domain') || 'https://zypage.com',
    zypageConnected: false,
    firebaseRef: null,
    isSyncingQueue: false,
    syncQueuePending: false,
    endedKeys: (() => {
        try {
            const raw = localStorage.getItem('dua_ended_keys');
            const parsed = raw ? JSON.parse(raw) : [];
            const now = Date.now();
            return parsed.map(item => {
                if (typeof item === 'string') {
                    return { key: item, timestamp: now };
                }
                return item;
            }).filter(item => now - item.timestamp < 24 * 60 * 60 * 1000);
        } catch (e) {
            return [];
        }
    })(),
    lastSyncedDonateTime: Number(localStorage.getItem('dua_last_synced_donate_time')) || 0,

    // Cấu hình đồng bộ MQTT xuyên trình duyệt
    localSyncKey: localStorage.getItem('dua_local_sync_key') || '',
    mqttClient: null,
    mqttTopic: '',

    testMode: localStorage.getItem('dua_test_mode') === 'true',
    theme: localStorage.getItem('dua_theme') || 'pineapple',
    opacity: localStorage.getItem('dua_opacity') || '100',
    emptyQueueMessage: localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k',
    alertActionText: localStorage.getItem('dua_alert_action_text') || 'gửi một quả dứa',

    // Cờ tạm thời: bỏ qua giới hạn thời gian cho bài hát hiện tại
    bypassCurrentSongDuration: false,
    lastSwitchTime: 0
};

// Tự động sinh khóa đồng bộ cục bộ nếu chưa có
if (!state.localSyncKey) {
    state.localSyncKey = 'dua_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('dua_local_sync_key', state.localSyncKey);
}

// Cấu hình thể loại SponsorBlock cần bỏ qua
const sponsorBlockCategories = {
    sponsor: true,
    intro: true,
    outro: true,
    selfpromo: true,
    interaction: false,
    offtopic: true
};

// Map nhãn tiếng Việt cho các danh mục SponsorBlock
const categoryLabels = {
    sponsor: 'Tài trợ (Sponsor)',
    intro: 'Nhạc mở đầu (Intro)',
    outro: 'Đoạn kết (Outro)',
    selfpromo: 'Quảng cáo cá nhân (Self-promo)',
    interaction: 'Kêu gọi tương tác (Interaction)',
    offtopic: 'Đoạn đối thoại phụ (Off-topic)'
};

// --- DỮ LIỆU NHẠC MẪU ĐỂ TEST ---
const mockSongs = [
    {
        title: "LTT - Why does everyone hate this laptop?",
        url: "https://www.youtube.com/watch?v=t5JvD8Zmdt4",
        donor: "Bé Dứa Ham Học",
        amount: 50000,
        message: "Video này có đoạn tài trợ (Sponsor) ngay khúc đầu, bật SponsorBlock lên để test nhé!",
        start: 0,
        end: 0
    },
    {
        title: "Alan Walker - Faded (Official Music Video)",
        url: "https://www.youtube.com/watch?v=60ItHLz5WEA",
        donor: "Người hâm mộ giấu tên",
        amount: 20000,
        message: "Phát bài này nha anh streamer đẹp trai!",
        start: 10,
        end: 180
    },
    {
        title: "Chill Lofi Beats to Study/Relax",
        url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        donor: "Viewer Cô Đơn",
        amount: 100000,
        message: "Chúc mọi người nghe nhạc vui vẻ nha, lofi chill quá.",
        start: 0,
        end: 300
    }
];

let mockIndex = 0;

// Tự động đồng bộ các chế độ SponsorBlock lúc khởi động
localStorage.setItem('dua_sb_categories', JSON.stringify(sponsorBlockCategories));

// Đồng bộ giới hạn thời gian phát sang cả localStorage và MQTT
function syncMaxDurationToOverlay(val) {
    localStorage.setItem('dua_max_duration', val);
    publishMqtt('max_duration', { value: val });
}

// Tạm thời bỏ giới hạn thời gian cho bài hát đang phát
function bypassCurrentSongLimit() {
    if (!state.currentSong) return;
    state.bypassCurrentSongDuration = true;
    syncMaxDurationToOverlay(0);
    
    // Cập nhật payload đang lưu trong localStorage để bảo tồn bypass
    // qua mọi lần re-broadcast (ví dụ: khi sắp xếp lại hàng đợi)
    const payloadRaw = localStorage.getItem('dua_current_song');
    if (payloadRaw) {
        try {
            const payload = JSON.parse(payloadRaw);
            payload.maxDuration = 0;
            localStorage.setItem('dua_current_song', JSON.stringify(payload));
            publishMqtt('current_song', payload);
        } catch(e) {}
    }
    
    logSystem(`🔓 Đã mở giới hạn thời gian cho bài hiện tại: <strong>${state.currentSong.title}</strong>`);
    showDashboardSystemAlert("Mở giới hạn bài", `🔓 Đã mở giới hạn thời gian cho bài hiện tại: <strong>${state.currentSong.title}</strong>`);
    renderQueue(); // Cập nhật lại nút bấm trên giao diện
}

function calculateMaxDurationForSong(amount) {
    if (!state.maxDurationEnabled) return 0;
    if (state.limitMode === 'fixed') return state.maxDuration;
    
    const songAmount = Number(amount) || 0;
    const sortedMilestones = [...state.milestones].sort((a, b) => a.amount - b.amount);
    
    for (const milestone of sortedMilestones) {
        if (songAmount < milestone.amount) {
            return milestone.duration * 60;
        }
    }
    return state.defaultDuration * 60;
}

function updateMaxDurationValue() {
    if (!state.maxDurationEnabled) {
        syncMaxDurationToOverlay(0);
        updateBypassButtonUI();
        return;
    }
    
    if (state.limitMode === 'fixed') {
        syncMaxDurationToOverlay(state.maxDuration);
    } else {
        if (state.currentSong) {
            const currentDur = calculateMaxDurationForSong(state.currentSong.amount);
            syncMaxDurationToOverlay(currentDur);
        } else {
            syncMaxDurationToOverlay(0);
        }
    }
    updateBypassButtonUI();
}

// --- LOGIC KHỞI ĐẦU KHI TRANG LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    // Dọn dẹp dữ liệu hàng đợi và trạng thái bài hát cũ từ phiên trước
    localStorage.removeItem('dua_music_queue');
    localStorage.removeItem('dua_current_song');
    localStorage.removeItem('dua_overlay_state');

    // Lấy phiên bản ứng dụng động từ main process
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
        window.electronAPI.getAppVersion().then((ver) => {
            const verDisplay = document.getElementById('app-version-display');
            if (verDisplay) verDisplay.textContent = `v${ver}`;
        });
    }

    // Khôi phục cài đặt hiển thị khung Youtube
    const playerWrapper = document.getElementById('youtube-player-container-wrapper');
    if (!state.playerVisible) {
        playerWrapper.classList.add('hidden-player');
    }
    
    // Khôi phục slider âm lượng
    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
        volSlider.value = state.volume;
        document.getElementById('volume-val-display').textContent = state.volume + '%';
        
        // Khởi tạo icon mute khi load trang
        const muteIcon = document.getElementById('mute-btn');
        if (muteIcon) {
            if (state.volume === 0) {
                muteIcon.className = 'fa-solid fa-volume-xmark';
            } else if (state.volume < 50) {
                muteIcon.className = 'fa-solid fa-volume-low';
            } else {
                muteIcon.className = 'fa-solid fa-volume-high';
            }
        }
        
        sendControlCommand('volume', state.volume); // Gửi âm lượng khởi tạo sang overlay
    }

    // Thiết lập cài đặt checkbox SponsorBlock
    for (const key in sponsorBlockCategories) {
        const checkbox = document.getElementById(`sb-${key}`);
        if (checkbox) {
            checkbox.checked = sponsorBlockCategories[key];
            checkbox.addEventListener('change', (e) => {
                sponsorBlockCategories[key] = e.target.checked;
                logSystem(`Cập nhật SponsorBlock: ${categoryLabels[key]} -> ${e.target.checked ? 'BẬT' : 'TẮT'}`);
                localStorage.setItem('dua_sb_categories', JSON.stringify(sponsorBlockCategories));
                publishMqtt('sb_categories', sponsorBlockCategories);
            });
        }
    }

    // Đọc cài đặt sắp xếp hàng đợi
    const sortSelect = document.getElementById('queue-sort-select');
    if (sortSelect) {
        sortSelect.value = state.sortConfig;
    }

    // Đọc cài đặt theme
    const themeSelect = document.getElementById('obs-theme-select');
    if (themeSelect) {
        themeSelect.value = state.theme;
    }

    // Đọc cài đặt opacity
    const opacityRange = document.getElementById('obs-opacity-range');
    const opacityVal = document.getElementById('obs-opacity-val');
    if (opacityRange && opacityVal) {
        opacityRange.value = state.opacity;
        opacityVal.textContent = state.opacity + '%';
    }

    // Thiết lập input lời hiển thị khi hết nhạc và nút áp dụng
    const emptyMsgInput = document.getElementById('overlay-empty-msg-input');
    const emptyMsgApplyBtn = document.getElementById('btn-overlay-empty-msg-apply');
    const emptyMsgCounter = document.getElementById('overlay-empty-msg-counter');
    if (emptyMsgInput) {
        emptyMsgInput.value = state.emptyQueueMessage;
        
        const updateCounter = () => {
            if (emptyMsgCounter) {
                const len = emptyMsgInput.value.length;
                emptyMsgCounter.textContent = `${len}/50`;
                if (len >= 50) {
                    emptyMsgCounter.style.color = '#EF4444'; // Đỏ báo lỗi
                    emptyMsgInput.style.borderColor = '#EF4444'; // Đổi viền input thành đỏ
                } else {
                    emptyMsgCounter.style.color = ''; // Mặc định
                    emptyMsgInput.style.borderColor = ''; // Mặc định
                }
            }
        };

        emptyMsgInput.addEventListener('input', updateCounter);
        updateCounter();

        if (emptyMsgApplyBtn) {
            emptyMsgApplyBtn.addEventListener('click', () => {
                let val = emptyMsgInput.value || 'Order nhạc tự động Zypage 50k';
                if (val.length > 50) {
                    val = val.substring(0, 50);
                }
                state.emptyQueueMessage = val;
                localStorage.setItem('dua_empty_queue_message', val);
                publishMqtt('empty_queue_message', { text: val });
                logSystem(`Đã lưu và đồng bộ lời hiển thị khi hết nhạc: "<strong>${val}</strong>"`, 'system');
                
                // Phản hồi trực quan trên nút
                emptyMsgApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    emptyMsgApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
                
                alert("Đã áp dụng và đồng bộ lời hiển thị mới lên OBS Overlay!");
            });
        }
    }

    // Thiết lập input chữ hiển thị hành động donate và nút áp dụng
    const alertActionInput = document.getElementById('overlay-donate-action-input');
    const alertActionApplyBtn = document.getElementById('btn-overlay-donate-action-apply');
    const alertActionCounter = document.getElementById('overlay-donate-action-counter');
    if (alertActionInput) {
        alertActionInput.value = state.alertActionText;
        
        const updateActionCounter = () => {
            if (alertActionCounter) {
                const len = alertActionInput.value.length;
                alertActionCounter.textContent = `${len}/50`;
                if (len >= 50) {
                    alertActionCounter.style.color = '#EF4444';
                    alertActionInput.style.borderColor = '#EF4444';
                } else {
                    alertActionCounter.style.color = '';
                    alertActionInput.style.borderColor = '';
                }
            }
        };

        alertActionInput.addEventListener('input', updateActionCounter);
        updateActionCounter();

        if (alertActionApplyBtn) {
            alertActionApplyBtn.addEventListener('click', () => {
                let val = alertActionInput.value || 'gửi một quả dứa';
                if (val.length > 50) {
                    val = val.substring(0, 50);
                }
                state.alertActionText = val;
                localStorage.setItem('dua_alert_action_text', val);
                updateObsUrlDisplay();
                publishMqtt('alert_action_text', { text: val });
                logSystem(`Đã lưu và đồng bộ chữ hiển thị Donate: "<strong>${val}</strong>"`, 'system');
                
                // Phản hồi trực quan trên nút
                alertActionApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    alertActionApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
                
                alert("Đã áp dụng và đồng bộ chữ hiển thị Donate mới lên OBS Overlay!");
            });
        }
    }

    // Khôi phục trạng thái Dark Mode
    const isDark = localStorage.getItem('dua_dark_mode') === 'true';
    toggleDarkMode(isDark);

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
    }

    // Tải cấu hình ZyPage từ AppData nếu chạy trong Electron HTTP server
    loadConfigFromAppData();

    // Hiển thị hàng đợi
    renderQueue();
    // Khởi tạo trạng thái bài đầu tiên chờ phát
    initQueue();
    // Đồng bộ UI nút Test Mode từ localStorage
    updateTestModeUI();

    // Cấu hình hiển thị ô nhúng OBS và khởi tạo MQTT
    updateObsUrlDisplay();
    initMqtt();

    // Thiết lập sự kiện tìm kiếm YouTube trên ô thêm nhanh
    const urlInput = document.getElementById('donor-url');
    const searchResultsContainer = document.getElementById('quick-add-search-results');
    
    if (urlInput && searchResultsContainer) {
        searchTimeout = null;
        
        urlInput.addEventListener('input', () => {
            const query = urlInput.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);
            
            // Kiểm tra xem có phải là đường dẫn URL hay không
            const isUrl = query.startsWith('http://') || query.startsWith('https://') || query.startsWith('spotify:');
            
            if (isUrl || query.length < 2) {
                searchResultsContainer.style.display = 'none';
                return;
            }
            
            // Trì hoãn 200ms để tránh gửi request liên tục (debounce)
            searchTimeout = setTimeout(async () => {
                searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tìm kiếm trên YouTube...</div>';
                searchResultsContainer.style.display = 'flex';
                
                try {
                    const result = await callYouTubeSearch(query);
                    if (result && result.success && result.videos && result.videos.length > 0) {
                        renderSearchResults(result.videos);
                    } else if (result && result.error) {
                        searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result.error}</div>`;
                    } else {
                        searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Không tìm thấy kết quả phù hợp!</div>';
                    }
                } catch (e) {
                    searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng!</div>`;
                }
            }, 200);
        });

        // Ẩn bảng kết quả khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (!urlInput.contains(e.target) && !searchResultsContainer.contains(e.target)) {
                searchResultsContainer.style.display = 'none';
            }
        });

        // Hiện lại bảng kết quả khi focus nếu đã có dữ liệu và là từ khóa
        urlInput.addEventListener('focus', () => {
            const query = urlInput.value.trim();
            const isUrl = query.startsWith('http://') || query.startsWith('https://') || query.startsWith('spotify:');
            if (!isUrl && query.length >= 2 && searchResultsContainer.children.length > 0) {
                searchResultsContainer.style.display = 'flex';
            }
        });
    }



    // Lắng nghe trạng thái phóng to cửa sổ
    if (window.electronAPI && typeof window.electronAPI.onWindowStateChange === 'function') {
        window.electronAPI.onWindowStateChange((state) => {
            const maxBtnIcon = document.querySelector('.btn-maximize i');
            if (maxBtnIcon) {
                if (state === 'maximized') {
                    maxBtnIcon.className = 'fa-regular fa-clone'; // Icon 2 ô vuông
                } else {
                    maxBtnIcon.className = 'fa-regular fa-square'; // Icon 1 ô vuông
                }
            }
        });
    }

    // --- KIỂM TRA VÀ TẢI BẢN CẬP NHẬT TỰ ĐỘNG ---
    if (window.electronAPI && typeof window.electronAPI.checkForUpdates === 'function') {
        const updateWidget = document.getElementById('app-update-widget');
        const updateText = document.getElementById('app-update-text');

        window.electronAPI.checkForUpdates().then((result) => {
            if (result && result.hasUpdate) {
                if (updateWidget && updateText) {
                    updateText.innerHTML = `Đã có bản cập nhật mới (<strong>${result.latestVersion}</strong>)`;
                    updateWidget.style.display = 'flex';

                    updateWidget.onclick = () => {
                        // Vô hiệu hóa click trùng lặp
                        updateWidget.onclick = null;
                        updateWidget.style.cursor = 'default';
                        updateWidget.style.pointerEvents = 'none';
                        updateWidget.style.opacity = '0.8';
                        updateText.textContent = 'Đang tải... 0%';

                        window.electronAPI.startUpdate(result.downloadUrl);
                    };
                }
            }
        }).catch((err) => {
            console.error("Lỗi kiểm tra bản cập nhật:", err);
        });

        // Lắng nghe tiến trình tải
        if (typeof window.electronAPI.onUpdateProgress === 'function') {
            window.electronAPI.onUpdateProgress((progress) => {
                if (updateText) {
                    updateText.textContent = `Đang tải... ${progress}%`;
                }
            });
        }

        // Lắng nghe khi tải xong và khởi chạy trình cài đặt
        if (typeof window.electronAPI.onUpdateDownloaded === 'function') {
            window.electronAPI.onUpdateDownloaded(() => {
                if (updateText) {
                    updateText.textContent = 'Đang chạy trình cài đặt...';
                }
            });
        }

        // Lắng nghe khi có lỗi
        if (typeof window.electronAPI.onUpdateError === 'function') {
            window.electronAPI.onUpdateError((err) => {
                if (updateWidget && updateText) {
                    updateText.textContent = 'Lỗi cập nhật! Bấm để thử lại';
                    updateWidget.style.cursor = 'pointer';
                    updateWidget.style.pointerEvents = 'auto';
                    updateWidget.style.opacity = '1';
                    
                    // Gán lại sự kiện click để thử lại
                    updateWidget.onclick = () => {
                        updateWidget.onclick = null;
                        updateWidget.style.cursor = 'default';
                        updateWidget.style.pointerEvents = 'none';
                        updateWidget.style.opacity = '0.8';
                        updateText.textContent = 'Kiểm tra lại...';
                        
                        window.electronAPI.checkForUpdates().then((r) => {
                            if (r && r.hasUpdate) {
                                updateText.textContent = 'Đang tải... 0%';
                                window.electronAPI.startUpdate(r.downloadUrl);
                            } else {
                                updateWidget.style.display = 'none';
                            }
                        }).catch(() => {
                            updateText.textContent = 'Lỗi cập nhật! Bấm để thử lại';
                            updateWidget.style.cursor = 'pointer';
                            updateWidget.style.pointerEvents = 'auto';
                            updateWidget.style.opacity = '1';
                        });
                    };
                }
                alert(`Lỗi khi tải bản cập nhật: ${err}`);
            });
        }
    }
});

// --- HÀM GHI LOG HỆ THỐNG ---
function logSystem(message, type = 'system') {
    const logBox = document.getElementById('log-box');
    if (!logBox) return;

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    let tagText = 'System';
    let tagClass = 'log-tag-system';
    if (type === 'sponsorblock') {
        tagText = 'SponsorBlock';
        tagClass = 'log-tag-sb';
    } else if (type === 'queue') {
        tagText = 'Donate';
        tagClass = 'log-tag-queue';
    }

    entry.innerHTML = `
        <span class="log-tag ${tagClass}">${tagText}</span>
        <span>${message}</span>
    `;

    logBox.appendChild(entry);
    
    // Giới hạn tối đa 100 dòng log để tránh tràn RAM/nặng trang khi treo máy lâu
    while (logBox.children.length > 100) {
        logBox.removeChild(logBox.firstChild);
    }
    
    logBox.scrollTop = logBox.scrollHeight;
}

// --- MÔ PHỎNG THÊM LINK NHANH MẪU ---
function fillMockSongQuick() {
    const urls = [
        "https://www.youtube.com/watch?v=60ItHLz5WEA", // YouTube (Alan Walker - Faded)
        "https://open.spotify.com/track/4PTG3Z6ehGkBFbfkGiQkYm", // Spotify (Alan Walker - Faded)
        "https://soundcloud.com/alanwalker/alan-walker-faded" // SoundCloud (Alan Walker - Faded)
    ];
    const input = document.getElementById('donor-url');
    if (input) {
        input.value = urls[mockIndex];
        mockIndex = (mockIndex + 1) % urls.length;
    }
}

// --- TRÍCH XUẤT YOUTUBE VIDEO ID ---
function parseYoutubeId(url) {
    if (!url) return null;
    const cleanUrl = url.trim();
    // Nếu bản thân nó đã là 11 ký tự video ID hợp lệ
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
        return cleanUrl;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
    const match = cleanUrl.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- TRÍCH XUẤT SPOTIFY TRACK ID ---
function parseSpotifyTrackId(url) {
    if (!url) return null;
    const cleanUrl = url.trim();
    const regExp = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
    const match = cleanUrl.match(regExp);
    if (match && match[1]) return match[1];
    
    const uriReg = /spotify:track:([a-zA-Z0-9]+)/;
    const uriMatch = cleanUrl.match(uriReg);
    if (uriMatch && uriMatch[1]) return uriMatch[1];
    
    return null;
}

// --- THÊM BÀI HÁT NHANH BẰNG LINK ---
async function handleQuickAddSubmit(event) {
    event.preventDefault();

    const urlInput = document.getElementById('donor-url');
    if (!urlInput) return;

    let url = urlInput.value.trim();
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
    
    // Nếu không phải là URL, thực hiện tìm kiếm ngay lập tức
    const isUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('spotify:');
    if (!isUrl) {
        const searchResultsContainer = document.getElementById('quick-add-search-results');
        if (searchResultsContainer) {
            searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tìm kiếm trên YouTube...</div>';
            searchResultsContainer.style.display = 'flex';
            
            try {
                const result = await callYouTubeSearch(url);
                if (result && result.success && result.videos && result.videos.length > 0) {
                    renderSearchResults(result.videos);
                } else if (result && result.error) {
                    searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result.error}</div>`;
                } else {
                    searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Không tìm thấy kết quả phù hợp!</div>';
                }
            } catch (e) {
                searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng!</div>`;
            }
        }
        return;
    }

    let type = 'youtube';
    let videoId = null;
    let spotifyId = null;
    let soundcloudUrl = null;

    // Phân giải link SoundCloud rút gọn nếu phát hiện on.soundcloud.com
    if (url.includes('on.soundcloud.com')) {
        logSystem(`Đang phân giải link SoundCloud di động...`, 'queue');
        try {
            const resolveRes = await fetch(getApiUrl(`/api/resolve?url=${encodeURIComponent(url)}`));
            const resolveData = await resolveRes.json();
            if (resolveData.resolvedUrl) {
                url = resolveData.resolvedUrl;
                logSystem(`Đã phân giải: ${url}`, 'queue');
            }
        } catch (e) {
            console.error("Lỗi phân giải link SoundCloud rút gọn:", e);
        }
    }

    // Xác định nguồn bài hát
    if (url.includes('spotify.com') || url.startsWith('spotify:')) {
        alert("Ứng dụng đã ngừng hỗ trợ phát nhạc từ Spotify. Vui lòng sử dụng link YouTube hoặc SoundCloud!");
        return;
    } else if (url.includes('soundcloud.com')) {
        soundcloudUrl = url;
        type = 'soundcloud';
    } else {
        videoId = parseYoutubeId(url);
        if (!videoId) {
            alert("Đường dẫn bài hát không hợp lệ. Vui lòng nhập link YouTube hoặc SoundCloud!");
            return;
        }
        url = `https://www.youtube.com/watch?v=${videoId}`;
        type = 'youtube';
    }

    logSystem(`Đang lấy thông tin bài hát từ ${type.toUpperCase()}...`, 'queue');

    let fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    if (type === 'spotify') {
        fetchUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    } else if (type === 'soundcloud') {
        fetchUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    }

    try {
        let title = '';
        let thumbnail = '';

        if (type === 'youtube') {
            if (window.electronAPI && typeof window.electronAPI.getYoutubeMetadata === 'function') {
                const metadata = await window.electronAPI.getYoutubeMetadata(videoId);
                title = metadata.title || `Nhạc YouTube (${videoId})`;
                thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            } else {
                const response = await fetch(fetchUrl);
                const data = await response.json();
                title = data.title || `Nhạc YouTube (${videoId})`;
                thumbnail = data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        } else {
            const response = await fetch(fetchUrl);
            const data = await response.json();
            if (type === 'spotify') {
                title = data.title || `Nhạc Spotify (ID: ${spotifyId})`;
                thumbnail = data.thumbnail_url || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
            } else if (type === 'soundcloud') {
                title = data.title || `Nhạc SoundCloud`;
                thumbnail = data.thumbnail_url || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
            }
        }

        const nameInput = document.getElementById('quick-donor-name');
        const donorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Introvert";

        const amountInput = document.getElementById('quick-donor-amount');
        const donorAmount = (amountInput && amountInput.value.trim() !== '') ? Number(amountInput.value) : 100000000;

        const newSong = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            type: type,
            videoId: videoId,
            spotifyId: spotifyId,
            soundcloudUrl: soundcloudUrl,
            title: title,
            thumbnail: thumbnail,
            donorName: donorName,
            amount: donorAmount,
            message: "",
            start: 0,
            end: null,
            timestamp: Date.now(),
            localAddedAt: Date.now()
        };

        insertSongSmartly(newSong);
        broadcastNewDonationAlert(newSong);
        saveQueue();
        sortAndRefreshQueue();
        
        logSystem(`Đã thêm nhanh bài hát: <strong>${title}</strong> (${type.toUpperCase()})`, 'queue');
        showDashboardSystemAlert("Đã thêm nhạc nhanh", `Đã thêm nhanh bài hát: <strong>${title}</strong>`, 'HÀNG ĐỢI');
        
        urlInput.value = '';
        if (nameInput) nameInput.value = '';
        if (amountInput) amountInput.value = '';

        if (!state.currentSong) {
            playNextInQueue();
        }

    } catch (error) {
        console.error("Error fetching track metadata: ", error);
        alert("Lỗi khi tải thông tin bài hát. Vui lòng kiểm tra lại kết nối mạng!");
    }
}

// --- ĐỒNG BỘ TRẠNG THÁI SANG OBS OVERLAY WEB (LOCALSTORAGE BROADCAST) ---
function broadcastStateToOverlay() {
    if (!state.currentSong) {
        localStorage.removeItem('dua_current_playing_state');
        return;
    }

    const payload = {
        id: state.currentSong.id,
        videoId: state.currentSong.videoId,
        title: state.currentSong.title,
        thumbnail: state.currentSong.thumbnail,
        donorName: state.currentSong.donorName,
        amount: state.currentSong.amount,
        message: state.currentSong.message,
        isPlaying: state.isPlaying,
        currentTime: player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0,
        duration: player && typeof player.getDuration === 'function' ? player.getDuration() : 0
    };

    localStorage.setItem('dua_current_playing_state', JSON.stringify(payload));
}

// --- PHÁT THÔNG BÁO DONATE MỚI LÊN OBS OVERLAY ---
function broadcastNewDonationAlert(song) {
    if (!song) return;
    
    // Tìm vị trí của bài hát trong hàng đợi sau khi sắp xếp để gửi đi chính xác
    let tempQueue = [...state.queue];
    if (!tempQueue.some(s => String(s.id) === String(song.id))) {
        tempQueue.push(song);
    }

    let positionStr = '';

    if (state.currentSong) {
        if (String(song.id) === String(state.currentSong.id)) {
            positionStr = 'Đang phát';
        } else {
            // Lọc bỏ bài đang phát khỏi hàng đợi để tính vị trí các bài phía sau bắt đầu từ #1
            const pendingQueue = tempQueue.filter(s => String(s.id) !== String(state.currentSong.id));
            if (state.sortConfig === 'amount') {
                pendingQueue.sort((a, b) => {
                    if (b.amount !== a.amount) {
                        return b.amount - a.amount;
                    }
                    return a.timestamp - b.timestamp;
                });
            } else {
                pendingQueue.sort((a, b) => a.timestamp - b.timestamp);
            }
            const idx = pendingQueue.findIndex(s => String(s.id) === String(song.id));
            if (idx === 0) {
                positionStr = 'Tiếp theo';
            } else {
                positionStr = idx !== -1 ? `#${idx + 1}` : '#-';
            }
        }
    } else {
        // Chưa có bài hát nào đang phát, bài đầu tiên trong hàng đợi sắp xếp sẽ được phát luôn
        if (state.sortConfig === 'amount') {
            tempQueue.sort((a, b) => {
                if (b.amount !== a.amount) {
                    return b.amount - a.amount;
                }
                return a.timestamp - b.timestamp;
            });
        } else {
            tempQueue.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        const idx = tempQueue.findIndex(s => String(s.id) === String(song.id));
        if (idx === 0) {
            positionStr = 'Đang phát';
        } else if (idx === 1) {
            positionStr = 'Tiếp theo';
        } else {
            positionStr = idx !== -1 ? `#${idx}` : '#-';
        }
    }

    const alertPayload = {
        id: song.id,
        donorName: song.donorName,
        amount: song.amount,
        title: song.title,
        message: song.message,
        position: positionStr,
        timestamp: Date.now() + Math.random() // Tránh trùng lặp sự kiện storage
    };
    
    localStorage.setItem('dua_new_donation_alert', JSON.stringify(alertPayload));
    
    // Hiển thị thông báo trên Dashboard
    showDashboardNewDonationAlert(alertPayload);
    
    // MQTT broadcast
    publishMqtt('new_donation_alert', alertPayload);
}

// --- LƯU TRỮ HÀNG ĐỢI VÀO LOCALSTORAGE ---
function saveQueue() {
    localStorage.setItem('dua_queue', JSON.stringify(state.queue));
}

// --- SẮP XẾP VÀ VẼ LẠI HÀNG ĐỢI ---
function sortAndRefreshQueue(forceSort = false) {
    let playingSong = null;
    let otherSongs = [];
    
    if (state.currentSong) {
        playingSong = state.queue.find(s => String(s.id) === String(state.currentSong.id));
        if (!playingSong) {
            // Fallback bảo vệ bài hát thêm nhanh đang chạy nếu không khớp danh sách ZyPage
            playingSong = state.currentSong;
        }
        otherSongs = state.queue.filter(s => String(s.id) !== String(state.currentSong.id));
    } else {
        otherSongs = [...state.queue];
    }

    if (forceSort) {
        if (state.sortConfig === 'amount') {
            otherSongs.sort((a, b) => {
                if (b.amount !== a.amount) {
                    return b.amount - a.amount;
                }
                return a.timestamp - b.timestamp;
            });
        } else if (state.sortConfig === 'time') {
            otherSongs.sort((a, b) => a.timestamp - b.timestamp);
        }
    }

    if (playingSong) {
        state.queue = [playingSong, ...otherSongs];
    } else {
        state.queue = otherSongs;
    }

    saveQueue();
    renderQueue();
    
    // Cập nhật và gửi lại thông tin bài hát tiếp theo nếu đang phát
    if (state.currentSong) {
        const nextSong = state.queue.find(s => String(s.id) !== String(state.currentSong.id));
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.nextSongTitle = nextSong ? nextSong.title : null;
                payload.nextSongDonor = nextSong ? nextSong.donorName : null;
                payload.nextSongAmount = nextSong ? nextSong.amount : null;
                // Giữ bypass: nếu đang bypass giới hạn, giữ maxDuration = 0 trong payload
                if (state.bypassCurrentSongDuration) {
                    payload.maxDuration = 0;
                }
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                publishMqtt('current_song', payload);
            } catch (e) {
                console.error("Lỗi cập nhật nextSongTitle khi sort:", e);
            }
        }
    }
}

function onSortConfigChange(val) {
    state.sortConfig = val;
    localStorage.setItem('dua_sort_config', val);
    logSystem(`Thay đổi thứ tự ưu tiên hàng đợi: ${val === 'amount' ? 'Số tiền' : 'Thời gian'}`);
    sortAndRefreshQueue(true);
}

const pendingDurationFetches = new Set();

async function resolveSongDuration(song) {
    if (!song || song.duration > 0) return;
    if (pendingDurationFetches.has(song.id)) return;
    
    pendingDurationFetches.add(song.id);
    
    if (song.type === 'youtube' && song.videoId) {
        try {
            const res = await fetch(getApiUrl(`/api/youtube-duration?videoId=${song.videoId}`));
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    let updated = false;
                    if (data.duration > 0) {
                        song.duration = data.duration;
                        if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                            state.currentSong.duration = data.duration;
                        }
                        updated = true;
                    }
                    if (data.views) {
                        song.views = data.views;
                        if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                            state.currentSong.views = data.views;
                        }
                        updated = true;
                    }
                    if (updated) {
                        saveQueue();
                        renderQueue();
                    }
                }
            }
        } catch (e) {
            console.error("Lỗi lấy độ dài YouTube video:", e);
        }
    } else if (song.type === 'soundcloud' && song.soundcloudUrl) {
        try {
            const res = await fetch(getApiUrl(`/api/soundcloud-duration?url=${encodeURIComponent(song.soundcloudUrl)}`));
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    let updated = false;
                    if (data.duration > 0) {
                        song.duration = data.duration;
                        if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                            state.currentSong.duration = data.duration;
                        }
                        updated = true;
                    }
                    if (data.playCount) {
                        song.views = data.playCount;
                        if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                            state.currentSong.views = data.playCount;
                        }
                        updated = true;
                    }
                    if (updated) {
                        saveQueue();
                        renderQueue();
                    }
                }
            }
        } catch (e) {
            console.error("Lỗi lấy độ dài SoundCloud track:", e);
        }
    }
    
    pendingDurationFetches.delete(song.id);
}

// --- RENDER DANH SÁCH HÀNG ĐỢI LÊN HTML ---
function renderQueue() {
    const queueContainer = document.getElementById('queue-list-container');
    const queueCount = document.getElementById('queue-count');
    
    if (!queueContainer) return;
    
    queueCount.textContent = state.queue.length;

    if (state.queue.length === 0) {
        queueContainer.innerHTML = '<div class="empty-queue-notice">Hàng đợi đang trống. Hãy dán link YouTube bài hát đầu tiên!</div>';
        return;
    }

    // Bài đang phát luôn được ghim lên đầu hàng đợi
    const sortedQueue = state.currentSong
        ? [
            ...state.queue.filter(s => String(s.id) === String(state.currentSong.id)),
            ...state.queue.filter(s => String(s.id) !== String(state.currentSong.id))
          ]
        : state.queue;

    queueContainer.innerHTML = '';
    sortedQueue.forEach((song, index) => {
        if ((song.type === 'youtube' || song.type === 'soundcloud') && !song.duration) {
            resolveSongDuration(song);
        }
        const isCurrent = state.currentSong && String(state.currentSong.id) === String(song.id);
        const isNew = song.localAddedAt && (Date.now() - song.localAddedAt < 10000);
        const item = document.createElement('div');
        item.className = `queue-item ${isCurrent ? 'playing-now' : ''} ${(!isCurrent && isNew) ? 'newly-added' : ''}`;
        
        let sourceBadgeHTML = '';
        if (song.type === 'spotify') {
            sourceBadgeHTML = ` <span class="source-badge spotify" style="background: #1DB954; color: #fff; padding: 0.15rem 0.35rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; margin-left: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; vertical-align: middle;"><i class="fa-brands fa-spotify"></i> Spotify</span>`;
        } else if (song.type === 'soundcloud') {
            sourceBadgeHTML = ` <span class="source-badge soundcloud" style="background: #FF5500; color: #fff; padding: 0.15rem 0.35rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; margin-left: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; vertical-align: middle;"><i class="fa-brands fa-soundcloud"></i> SoundCloud</span>`;
        }

        // Tím index thực trong state.queue để kiểm tra vị trí đầu/cuối
        const realIndex = state.queue.findIndex(s => String(s.id) === String(song.id));

        item.innerHTML = `
            <div class="queue-item-thumb">
                <img src="${song.thumbnail}" alt="Thumbnail">
            </div>
            <div class="queue-item-info">
                <!-- Hàng 1: Tiêu đề bài hát hiển thị đầy đủ -->
                <div class="queue-item-title">
                    ${song.title}${sourceBadgeHTML}
                </div>
                <!-- Hàng 2: Thông tin người ủng hộ + thời gian + nút chức năng -->
                <div class="queue-item-row2">
                    <div class="queue-item-donor">
                        ${song.donorName}
                        <span style="color: var(--pineapple-text); font-weight: 500;">gửi</span>
                        <span style="color: var(--pineapple-orange-dark); font-weight: 800;">${song.amount.toLocaleString('vi-VN')} VNĐ</span>
                        ${(song.start > 0 || song.end) && !song.isZyPage ? `<span style="font-size:0.72rem; color:#6B7280; margin-left: 0.3rem;">[${song.start}s–${song.end || 'hết'}]</span>` : ''}
                    </div>
                    <div class="queue-item-row2-right">
                        ${song.views ? `
                        <span class="queue-item-views-inline" style="font-size: 0.72rem; color: #6B7280; display: inline-flex; align-items: center; gap: 0.2rem; margin-right: 0.4rem;" title="${song.type === 'soundcloud' ? 'Lượt nghe' : 'Lượt xem'}: ${Number(song.views) ? Number(song.views).toLocaleString('vi-VN') : song.views}">
                            <i class="${song.type === 'soundcloud' ? 'fa-solid fa-headphones' : 'fa-regular fa-eye'}" style="font-size: 0.72rem;"></i>
                            ${formatViewsCompact(song.views)}
                        </span>
                        ` : ''}
                        <span class="queue-item-duration-inline">
                            <i class="fa-regular fa-clock" style="font-size: 0.72rem;"></i>
                            ${song.duration ? formatTime(song.duration) : '<i class="fa-solid fa-spinner fa-spin" style="font-size: 0.7rem; color: #9CA3AF;"></i>'}
                        </span>
                        <div class="queue-item-actions">
                            ${isCurrent ? `
                                <button class="queue-item-btn" style="background: #10b981; color: white; border-color: #10b981; cursor: default; box-shadow: none;" title="Đang phát">
                                    <i class="fa-solid fa-play"></i>
                                </button>
                            ` : `
                                ${realIndex > (state.currentSong ? 1 : 0) ? `
                                    <button class="queue-item-btn" title="Dịch chuyển lên" onclick="moveQueueItemUp('${song.id}')">
                                        <i class="fa-solid fa-arrow-up"></i>
                                    </button>
                                ` : ''}
                                ${realIndex < state.queue.length - 1 ? `
                                    <button class="queue-item-btn" title="Dịch chuyển xuống" onclick="moveQueueItemDown('${song.id}')">
                                        <i class="fa-solid fa-arrow-down"></i>
                                    </button>
                                ` : ''}
                                <button class="queue-item-btn btn-play" title="Phát ngay lập tức" onclick="forcePlaySong('${song.id}')">
                                    <i class="fa-solid fa-play"></i>
                                </button>
                            `}
                            <button class="queue-item-btn btn-delete" title="Xóa" onclick="removeSongFromQueue('${song.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                ${song.message ? `<div class="queue-item-message">"${song.message}"</div>` : ''}
            </div>
        `;
        queueContainer.appendChild(item);
    });
}

// --- KHỞI TẠO TRẠNG THÁI PHÁT KHI LOAD TRANG ---
function initQueue() {
    if (state.currentSong) {
        updatePlayerUI(state.currentSong);
        updatePlayPauseButtonUI(state.isPlaying);
        renderQueue();
    } else if (state.queue.length > 0) {
        state.currentSong = state.queue[0];
        updatePlayerUI(state.currentSong);
        playSong(state.currentSong);
    }
}

// --- PHÁT BÀI TIẾP THEO TRONG HÀNG ĐỢI ---
function playNextInQueue() {
    renderQueue(); // Đảm bảo đồng bộ giao diện hàng đợi
    if (state.queue.length === 0) {
        state.currentSong = null;
        updatePlayerUI(null);
        localStorage.removeItem('dua_current_song');
        publishMqtt('current_song', null);
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
        logSystem("Đã phát hết hàng đợi nhạc donate.");
        return;
    }

    state.currentSong = state.queue[0];
    playSong(state.currentSong);
}

// --- GỬI LỆNH ĐIỀU KHIỂN SANG OBS OVERLAY ---
function sendControlCommand(type, value = null) {
    const cmdPayload = {
        type: type,
        value: value,
        timestamp: Date.now() + Math.random() // Đảm bảo sự kiện storage kích hoạt liên tục
    };
    
    localStorage.setItem('dua_control_command', JSON.stringify(cmdPayload));
    
    // MQTT broadcast
    publishMqtt('control_command', cmdPayload);
}

// --- PHÁT MỘT BÀI HÁT CHI TIẾT (ĐỒNG BỘ SANG OVERLAY) ---
async function playSong(song) {
    if (!song) return;

    state.lastSwitchTime = Date.now();

    // Đặt lại cờ bypass khi chuyển bài mới
    state.bypassCurrentSongDuration = false;

    // Gửi cấu hình âm lượng hiện tại sang overlay để đảm bảo đồng bộ tuyệt đối trước khi phát
    sendControlCommand('volume', state.volume);

    logSystem(`Đang chuẩn bị gửi bài hát sang Overlay: <strong>${song.title}</strong>...`);
    updatePlayerUI(song);
    
    // Thu thập các đoạn SponsorBlock
    await fetchSponsorBlockSegments(song.videoId);

    // Tìm bài tiếp theo trong hàng đợi không trùng với bài đang chuẩn bị phát
    const nextSong = state.queue.find(s => String(s.id) !== String(song.id));

    // Gửi thông tin bài hát hiện tại sang overlay qua localStorage
    const payload = {
        id: song.id,
        type: song.type || 'youtube',
        videoId: song.videoId || null,
        soundcloudUrl: song.soundcloudUrl || null,
        spotifyId: song.spotifyId || null,
        title: song.title,
        thumbnail: song.thumbnail,
        donorName: song.donorName,
        amount: song.amount,
        message: song.message,
        start: song.start || 0,
        end: song.end || null,
        skipSegments: state.skipSegments || [],
        maxDuration: calculateMaxDurationForSong(song.amount),
        nextSongTitle: nextSong ? nextSong.title : null,
        nextSongDonor: nextSong ? nextSong.donorName : null,
        nextSongAmount: nextSong ? nextSong.amount : null
    };

    localStorage.setItem('dua_current_song', JSON.stringify(payload));
    
    // MQTT broadcast
    publishMqtt('current_song', payload);
    
    // Phát lệnh chạy nhạc
    sendControlCommand('play');
    state.isPlaying = true;
    updatePlayPauseButtonUI(true);

    // Cập nhật lại hàng đợi để đồng bộ hiển thị bài đang phát
    renderQueue();
}

// Cập nhật trạng thái nút Tạm dừng/Tiếp tục của Dashboard
function updatePlayPauseButtonUI(isPlaying) {
    const waves = document.getElementById('music-waves');
    const playBtn = document.getElementById('btn-play-pause');
    if (isPlaying) {
        if (waves) waves.classList.remove('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Tạm dừng';
    } else {
        if (waves) waves.classList.add('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i> Tiếp tục';
    }
}

// --- THU THẬP PHÂN ĐOẠN QUẢNG CÁO TỪ SPONSORBLOCK ---
async function fetchSponsorBlockSegments(videoId) {
    state.skipSegments = [];
    logSystem(`Đang kiểm tra cơ sở dữ liệu SponsorBlock cho video ID: ${videoId}...`);

    try {
        const response = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`);
        if (response.status === 200) {
            const data = await response.json();
            
            let segments = [];
            if (Array.isArray(data)) {
                if (data.length > 0 && data[0].segments) {
                    segments = data[0].segments;
                } else {
                    segments = data;
                }
            }

            state.skipSegments = segments.map(item => ({
                start: item.segment[0],
                end: item.segment[1],
                category: item.category
            }));

            if (state.skipSegments.length > 0) {
                logSystem(`SponsorBlock tìm thấy <strong>${state.skipSegments.length}</strong> phân đoạn quảng cáo/giới thiệu!`, 'sponsorblock');
                state.skipSegments.forEach(seg => {
                    logSystem(`- [${categoryLabels[seg.category] || seg.category}]: ${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s`, 'sponsorblock');
                });
            } else {
                logSystem(`SponsorBlock: Video sạch, không phát hiện quảng cáo/đoạn giới thiệu.`, 'sponsorblock');
            }
        } else if (response.status === 404) {
            logSystem(`SponsorBlock: Không có dữ liệu phân đoạn quảng cáo cho video này.`, 'sponsorblock');
        } else {
            logSystem(`SponsorBlock API phản hồi với trạng thái: ${response.status}`, 'sponsorblock');
        }
    } catch (err) {
        console.error("SponsorBlock fetch error:", err);
        logSystem(`Không thể kết nối tới máy chủ SponsorBlock.`, 'system');
    }
}

// --- GIÁM SÁT TIẾN TRÌNH & TỰ ĐỘNG BỎ QUA QUA SPONSORBLOCK ---
function startPlaybackMonitor() {
    if (playbackMonitorInterval) clearInterval(playbackMonitorInterval);

    playbackMonitorInterval = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function') return;

        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        
        if (!duration) return;

        const progressSlider = document.getElementById('progress-slider');
        const currentTimeDisplay = document.getElementById('current-time-display');
        const totalTimeDisplay = document.getElementById('total-time-display');

        if (progressSlider) {
            const pct = (currentTime / duration) * 100;
            progressSlider.value = pct;
            progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
        }

        if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(currentTime);
        if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(duration);

        // Đồng bộ dữ liệu sang Overlay
        broadcastStateToOverlay();

        // 1. Kiểm tra giới hạn mốc Kết thúc của người dùng
        if (state.currentSong && state.currentSong.end && currentTime >= state.currentSong.end) {
            logSystem(`Chạm mốc kết thúc do cấu hình (${state.currentSong.end}s). Tự động chuyển bài...`);
            stopPlaybackMonitor();
            removeSongFromQueue(state.currentSong.id, false);
            playNextInQueue();
            return;
        }

        // 2. Logic SponsorBlock: Bỏ qua các phân đoạn quảng cáo
        if (state.skipSegments.length > 0) {
            for (const segment of state.skipSegments) {
                if (sponsorBlockCategories[segment.category] === true) {
                    if (currentTime >= segment.start && currentTime < segment.end) {
                        const skipToTime = segment.end;
                        
                        logSystem(`SponsorBlock: Bỏ qua đoạn <strong>[${categoryLabels[segment.category] || segment.category}]</strong> (${currentTime.toFixed(1)}s -> ${skipToTime.toFixed(1)}s)`, 'sponsorblock');
                        showDashboardSystemAlert("Bỏ qua nhà tài trợ", `Bỏ qua đoạn <strong>[${categoryLabels[segment.category] || segment.category}]</strong> (${currentTime.toFixed(1)}s -> ${skipToTime.toFixed(1)}s)`, 'SPONSORBLOCK');
                        
                        player.seekTo(skipToTime, true);
                        break;
                    }
                }
            }
        }

    }, 250);
}

function stopPlaybackMonitor() {
    if (playbackMonitorInterval) {
        clearInterval(playbackMonitorInterval);
        playbackMonitorInterval = null;
    }
}

// --- KIỂM TRA LỖI AUTOPLAY BỊ CHẶN BỞI TRÌNH DUYỆT ---
function checkAutoplayFailure() {
    setTimeout(() => {
        if (player && typeof player.getPlayerState === 'function') {
            const playerState = player.getPlayerState();
            if (playerState === -1 || (playerState === 2 && state.isPlaying)) {
                document.getElementById('autoplay-blocker').style.display = 'flex';
                logSystem("Phát hiện âm thanh bị chặn phát tự động. Vui lòng nhấp vào màn hình để kích hoạt.", "system");
            }
        }
    }, 2000);
}

// --- KÍCH HOẠT PHÁT NHẠC KHI TRÌNH DUYỆT CHẶN ---
function resumeAutoplay() {
    document.getElementById('autoplay-blocker').style.display = 'none';
    sendControlCommand('play');
}

// --- THAY ĐỔI MỐC THỜI GIAN THEO THANH TRƯỢT (SEEK) ---
let currentOverlayDuration = 0;
function onSeekSliderChange(pct) {
    const progressSlider = document.getElementById('progress-slider');
    if (progressSlider) {
        progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
    }
    if (currentOverlayDuration <= 0) return;
    let startPoint = 0;
    if (state.currentSong) {
        startPoint = state.currentSong.start || 0;
    }
    const seekToSeconds = startPoint + (pct / 100) * currentOverlayDuration;
    sendControlCommand('seek', seekToSeconds);
    const relativeElapsed = (pct / 100) * currentOverlayDuration;
    logSystem(`Tua bài nhạc tới: ${formatTime(relativeElapsed)}`);
}

// --- ĐIỀU CHỈNH ÂM LƯỢNG ---
function onVolumeChange(val) {
    state.volume = parseInt(val);
    localStorage.setItem('dua_volume', val);
    document.getElementById('volume-val-display').textContent = val + '%';
    
    // Cập nhật biểu tượng nút tắt âm thanh
    const muteIcon = document.getElementById('mute-btn');
    if (muteIcon) {
        if (state.volume === 0) {
            muteIcon.className = 'fa-solid fa-volume-xmark';
        } else if (state.volume < 50) {
            muteIcon.className = 'fa-solid fa-volume-low';
        } else {
            muteIcon.className = 'fa-solid fa-volume-high';
        }
    }
    
    sendControlCommand('volume', state.volume);
}

function toggleMute() {
    if (state.volume > 0) {
        // Tắt âm thanh
        state.preMuteVolume = state.volume;
        localStorage.setItem('dua_pre_mute_volume', state.preMuteVolume);
        const slider = document.getElementById('volume-slider');
        if (slider) slider.value = 0;
        onVolumeChange(0);
    } else {
        // Bật lại âm thanh
        const restoredVol = parseInt(localStorage.getItem('dua_pre_mute_volume')) || 80;
        const slider = document.getElementById('volume-slider');
        if (slider) slider.value = restoredVol;
        onVolumeChange(restoredVol);
    }
}

// --- PHÁT / TẠM DỪNG BẰNG TAY ---
function togglePlayPause() {
    if (!state.currentSong) {
        if (state.queue.length > 0) {
            playNextInQueue();
        }
        return;
    }

    if (state.isPlaying) {
        sendControlCommand('pause');
        state.isPlaying = false;
        logSystem("Tạm dừng trình phát nhạc (Overlay).");
        updatePlayPauseButtonUI(false);
        renderQueue();
    } else {
        sendControlCommand('play');
        state.isPlaying = true;
        logSystem("Tiếp tục trình phát nhạc (Overlay).");
        updatePlayPauseButtonUI(true);
        renderQueue();
    }
}

// --- SKIP BÀI (NEXT) ---
function skipSong() {
    if (!state.currentSong) return;
    logSystem(`Bỏ qua bài hát: <strong>${state.currentSong.title}</strong>`);
    showDashboardSystemAlert("Bỏ qua bài hát", `Đã bỏ qua bài hát: <strong>${state.currentSong.title}</strong>`);
    removeSongFromQueue(state.currentSong.id, false);
    playNextInQueue();
}

// --- GIỮ HÀNG ĐỢI ZYPAGE (KHÔNG GỬi TÍN HIỆU KẾT THÚC) ---
function toggleTestMode() {
    state.testMode = !state.testMode;
    localStorage.setItem('dua_test_mode', state.testMode);
    updateTestModeUI();
    logSystem(
        state.testMode
            ? '🔒 <strong>Giữ hàng đợi ZyPage BẬT</strong> — Bài hát sẽ <u>không bị xóa</u> và không gửi tín hiệu kết thúc lên ZyPage.'
            : '🔓 <strong>Giữ hàng đợi ZyPage TẮT</strong> — Bài hát sẽ bị xóa và gửi tín hiệu kết thúc lên ZyPage bình thường.',
        'system'
    );
}

function updateTestModeUI() {
    const btn = document.getElementById('btn-test-mode');
    if (!btn) return;
    if (state.testMode) {
        btn.innerHTML = '<i class="fa-solid fa-lock"></i>';
        btn.title = 'Giữ hàng đợi: BẬT (Bài hát sẽ KHÔNG bị xóa khỏi hàng đợi)';
        btn.style.background = '#DCFCE7';
        btn.style.borderColor = '#15803D';
        btn.style.color = '#15803D';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
        btn.title = 'Giữ hàng đợi: TẮT (Bài hát sẽ bị xóa khỏi hàng đợi sau khi phát)';
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
    }
}

// --- FORCE PLAY (PHÁT NGAY LẬP TỨC MỘT BÀI TRONG QUEUE) ---
function forcePlaySong(songId) {
    const songIndex = state.queue.findIndex(s => String(s.id) === String(songId));
    if (songIndex === -1) return;

    const targetSong = state.queue[songIndex];
    
    state.queue.splice(songIndex, 1);
    state.queue.unshift(targetSong);
    
    saveQueue();
    renderQueue();
    playNextInQueue();
    
    logSystem(`Ép phát ngay lập tức bài hát: <strong>${targetSong.title}</strong>`, 'system');
}

// --- XÓA MỘT BÀI HÁT KHỎI HÀNG ĐỢI ---
function removeSongFromQueue(songId, refreshUI = true) {
    const isPlayingCurrent = state.currentSong && String(state.currentSong.id) === String(songId);
    
    const songToRemove = state.queue.find(s => String(s.id) === String(songId));
    
    state.queue = state.queue.filter(s => String(s.id) !== String(songId));
    saveQueue();
    
    if (songToRemove && songToRemove.isZyPage) {
        sendZyPageSongEnd(songToRemove);
    }
    
    if (isPlayingCurrent) {
        state.currentSong = null;
        localStorage.removeItem('dua_current_song');
        localStorage.removeItem('dua_overlay_state');
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
        stopPlaybackMonitor();
        broadcastStateToOverlay();
    } else {
        // Cập nhật lại nextSongTitle của bài hát đang phát nếu bài bị xoá nằm trong hàng đợi
        if (state.currentSong) {
            const nextSong = state.queue.find(s => String(s.id) !== String(state.currentSong.id));
            const payloadRaw = localStorage.getItem('dua_current_song');
            if (payloadRaw) {
                try {
                    const payload = JSON.parse(payloadRaw);
                    payload.nextSongTitle = nextSong ? nextSong.title : null;
                    payload.nextSongDonor = nextSong ? nextSong.donorName : null;
                    payload.nextSongAmount = nextSong ? nextSong.amount : null;
                    localStorage.setItem('dua_current_song', JSON.stringify(payload));
                    publishMqtt('current_song', payload);
                } catch (e) {
                    console.error("Lỗi cập nhật nextSongTitle khi xoá bài:", e);
                }
            }
        }
    }

    if (refreshUI) {
        renderQueue();
        if (isPlayingCurrent) {
            playNextInQueue();
        }
    }
}

function insertSongSmartly(newSong) {
    if (state.queue.length === 0) {
        state.queue.push(newSong);
        return;
    }

    const startIndex = state.currentSong ? 1 : 0;

    if (state.sortConfig === 'amount') {
        let insertIndex = -1;
        for (let i = startIndex; i < state.queue.length; i++) {
            if (state.queue[i].amount < newSong.amount) {
                insertIndex = i;
                break;
            }
        }
        if (insertIndex !== -1) {
            state.queue.splice(insertIndex, 0, newSong);
        } else {
            state.queue.push(newSong);
        }
    } else {
        // Defaults to 'time' or any other configurations
        state.queue.push(newSong);
    }
}

// --- DỊCH CHUYỂN BÀI HÁT LÊN TRONG HÀNG ĐỢI ---
function moveQueueItemUp(songId) {
    const index = state.queue.findIndex(s => String(s.id) === String(songId));
    const minIndex = state.currentSong ? 1 : 0;
    if (index > minIndex) {
        const temp = state.queue[index];
        state.queue[index] = state.queue[index - 1];
        state.queue[index - 1] = temp;
        
        saveQueue();
        renderQueue();
        logSystem(`Đã đẩy bài hát lên trước: <strong>${temp.title}</strong>`);

        // Cập nhật lại nextSongTitle của bài hát đang phát
        if (state.currentSong) {
            const nextSong = state.queue.find(s => String(s.id) !== String(state.currentSong.id));
            const payloadRaw = localStorage.getItem('dua_current_song');
            if (payloadRaw) {
                try {
                    const payload = JSON.parse(payloadRaw);
                    payload.nextSongTitle = nextSong ? nextSong.title : null;
                    payload.nextSongDonor = nextSong ? nextSong.donorName : null;
                    payload.nextSongAmount = nextSong ? nextSong.amount : null;
                    localStorage.setItem('dua_current_song', JSON.stringify(payload));
                    publishMqtt('current_song', payload);
                } catch (e) {
                    console.error("Lỗi cập nhật nextSongTitle khi di chuyển bài lên:", e);
                }
            }
        }
        
        // Nếu chuyển lên đầu hàng đợi và hiện tại không có bài nào phát, kích hoạt phát
        if (index - 1 === 0 && !state.currentSong) {
            playNextInQueue();
        }
    }
}

// --- DỊCH CHUYỂN BÀI HÁT XUỐNG TRONG HÀNG ĐỢI ---
function moveQueueItemDown(songId) {
    const index = state.queue.findIndex(s => String(s.id) === String(songId));
    const minIndex = state.currentSong ? 1 : 0;
    if (index >= minIndex && index !== -1 && index < state.queue.length - 1) {
        const temp = state.queue[index];
        state.queue[index] = state.queue[index + 1];
        state.queue[index + 1] = temp;
        
        saveQueue();
        renderQueue();
        logSystem(`Đã hạ bài hát xuống sau: <strong>${temp.title}</strong>`);

        // Cập nhật lại nextSongTitle của bài hát đang phát
        if (state.currentSong) {
            const nextSong = state.queue.find(s => String(s.id) !== String(state.currentSong.id));
            const payloadRaw = localStorage.getItem('dua_current_song');
            if (payloadRaw) {
                try {
                    const payload = JSON.parse(payloadRaw);
                    payload.nextSongTitle = nextSong ? nextSong.title : null;
                    payload.nextSongDonor = nextSong ? nextSong.donorName : null;
                    payload.nextSongAmount = nextSong ? nextSong.amount : null;
                    localStorage.setItem('dua_current_song', JSON.stringify(payload));
                    publishMqtt('current_song', payload);
                } catch (e) {
                    console.error("Lỗi cập nhật nextSongTitle khi di chuyển bài xuống:", e);
                }
            }
        }
    }
}

// --- CẬP NHẬT GIAO DIỆN KHI CÓ BÀI MỚI / DỪNG ---
function updatePlayerUI(song) {
    const cover = document.getElementById('current-song-cover');
    const title = document.getElementById('current-song-title');
    const donorSection = document.getElementById('current-song-donor');
    const messageSection = document.getElementById('current-song-message');
    const coverWrapper = document.getElementById('song-cover-wrapper');
    const liveBadge = document.getElementById('playing-live-badge');
    const slider = document.getElementById('progress-slider');

    if (!song) {
        cover.src = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
        title.textContent = "Chưa có bài hát nào";
        donorSection.style.display = 'none';
        messageSection.style.display = 'none';
        coverWrapper.classList.remove('spinning');
        liveBadge.style.display = 'none';
        if (slider) {
            slider.value = 0;
            slider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-white) 0%)`;
        }
        
        document.getElementById('current-time-display').textContent = '0:00';
        document.getElementById('total-time-display').textContent = '0:00';
        
        updateBypassButtonUI();
        return;
    }

    cover.src = song.thumbnail;
    title.textContent = song.title;
    
    document.getElementById('current-donor-name').textContent = song.donorName;
    document.getElementById('current-donor-amount').textContent = song.amount.toLocaleString('vi-VN') + ' VNĐ';
    donorSection.style.display = 'flex';

    if (song.message) {
        messageSection.textContent = `"${song.message}"`;
        messageSection.style.display = 'block';
    } else {
        messageSection.style.display = 'none';
    }

    coverWrapper.classList.add('spinning');
    liveBadge.style.display = 'flex';
    
    updateBypassButtonUI();
}

// --- CHUYỂN ĐỔI TAB NỘI DUNG DASHBOARD ---
function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.titlebar-menu-btn');
    
    tabs.forEach(tab => {
        if (tab.id === `tab-${tabId}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    buttons.forEach(btn => {
        if (btn.id === `menu-btn-${tabId}`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// --- BẬT / TẮT DARK MODE DASHBOARD ---
function toggleDarkMode(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('dua_dark_mode', 'true');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('dua_dark_mode', 'false');
    }
    const switchEl = document.getElementById('dark-mode-toggle-switch');
    if (switchEl) {
        switchEl.checked = isDark;
    }
}

// --- CẬP NHẬT NÚT VÔ CÙNG (BYPASS LIMIT) TRÊN PLAYER CONTROL ---
function updateBypassButtonUI() {
    const btn = document.getElementById('btn-bypass-limit');
    if (!btn) return;
    
    if (state.currentSong && state.maxDurationEnabled) {
        btn.style.display = 'inline-flex';
        if (state.bypassCurrentSongDuration) {
            btn.classList.add('active-bypass');
            btn.title = "Đang phát hết bài (không giới hạn)";
        } else {
            btn.classList.remove('active-bypass');
            btn.title = "Phát hết bài hát này (bỏ qua giới hạn thời gian)";
        }
    } else {
        btn.style.display = 'none';
    }
}

// --- HIỂN THỊ THÔNG BÁO DONATE MỚI TRÊN DASHBOARD ---
let dbAlertTimeout = null;
function showDashboardNewDonationAlert(alertData) {
    const alertBox = document.getElementById('db-alert-box');
    if (!alertBox) return;
    
    const songTitleEl = document.getElementById('db-alert-song');
    const donorNameEl = document.getElementById('db-alert-donor');
    const amountEl = document.getElementById('db-alert-amount');
    const statusEl = document.getElementById('db-alert-status');
    
    if (songTitleEl) songTitleEl.textContent = alertData.title || 'Không rõ';
    if (donorNameEl) donorNameEl.textContent = alertData.donorName || 'Khách';
    if (amountEl) amountEl.textContent = alertData.amount ? alertData.amount.toLocaleString('vi-VN') + ' VNĐ' : '0 VNĐ';
    if (statusEl) {
        statusEl.textContent = alertData.position || 'Hàng đợi';
    }
    
    alertBox.classList.add('active');
    
    if (dbAlertTimeout) clearTimeout(dbAlertTimeout);
    dbAlertTimeout = setTimeout(() => {
        alertBox.classList.remove('active');
        const sysAlertBox = document.getElementById('db-system-alert-box');
        if (sysAlertBox) {
            sysAlertBox.classList.remove('stacked');
        }
    }, 6000);
}

function closeDashboardAlert() {
    const alertBox = document.getElementById('db-alert-box');
    if (alertBox) {
        alertBox.classList.remove('active');
    }
    const sysAlertBox = document.getElementById('db-system-alert-box');
    if (sysAlertBox) {
        sysAlertBox.classList.remove('stacked');
    }
}

// --- HIỂN THỊ THÔNG BÁO HỆ THỐNG TRÊN DASHBOARD ---
let dbSysAlertTimeout = null;
function showDashboardSystemAlert(title, message, badge = 'HỆ THỐNG') {
    const alertBox = document.getElementById('db-system-alert-box');
    if (!alertBox) return;

    const titleEl = document.getElementById('db-sys-alert-title');
    const msgEl = document.getElementById('db-sys-alert-message');
    const badgeEl = document.getElementById('db-sys-alert-badge');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (badgeEl) badgeEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${badge.toUpperCase()}`;

    // Kiểm tra nếu thông báo donate mới đang hiển thị thì nâng thông báo hệ thống lên
    const donAlertBox = document.getElementById('db-alert-box');
    if (donAlertBox && donAlertBox.classList.contains('active')) {
        alertBox.classList.add('stacked');
    } else {
        alertBox.classList.remove('stacked');
    }

    alertBox.classList.add('active');

    if (dbSysAlertTimeout) clearTimeout(dbSysAlertTimeout);
    dbSysAlertTimeout = setTimeout(() => {
        alertBox.classList.remove('active');
        alertBox.classList.remove('stacked');
    }, 6000);
}

function closeDashboardSystemAlert() {
    const alertBox = document.getElementById('db-system-alert-box');
    if (alertBox) {
        alertBox.classList.remove('active');
        alertBox.classList.remove('stacked');
    }
}

// --- ẨN / HIỆN YOUTUBE PLAYER EMBED ---
function togglePlayerVisibility() {
    const wrapper = document.getElementById('youtube-player-container-wrapper');
    if (wrapper.classList.contains('hidden-player')) {
        wrapper.classList.remove('hidden-player');
        state.playerVisible = true;
        logSystem("Hiển thị khung hình Youtube.");
    } else {
        wrapper.classList.add('hidden-player');
        state.playerVisible = false;
        logSystem("Ẩn khung hình Youtube.");
    }
    localStorage.setItem('dua_player_visible', state.playerVisible);
}

// --- ĐỊNH DẠNG THỜI GIAN (MM:SS) ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null || seconds === undefined) {
        return "0:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- BÁO CÁO KẾT THÚC BÀI LÊN MÁY CHỦ ZYPAGE ĐỂ TRÔI BÀI ---
async function sendZyPageSongEnd(song) {
    if (state.testMode) return;

    if (!state.zypageShopId || !state.zypageToken || !song.musicKey) return;
    
    // Ghi nhận khóa bài hát đã kết thúc vào bộ nhớ đệm lịch sử (dạng Object có timestamp)
    const musicKeyStr = String(song.musicKey);
    const exists = state.endedKeys.some(e => e.key === musicKeyStr);
    
    if (!exists) {
        state.endedKeys.push({
            key: musicKeyStr,
            timestamp: Date.now()
        });
        
        // Dọn dẹp các khóa quá hạn 24 giờ
        const now = Date.now();
        state.endedKeys = state.endedKeys.filter(item => now - item.timestamp < 24 * 60 * 60 * 1000);
        
        // Giới hạn lịch sử tối đa 200 khóa
        if (state.endedKeys.length > 200) {
            state.endedKeys.shift();
        }
        localStorage.setItem('dua_ended_keys', JSON.stringify(state.endedKeys));
    }
    
    logSystem(`Đang báo cáo kết thúc bài lên ZyPage để trôi bài: <strong>${song.title}</strong>...`, 'system');
    
    const postUrl = `${state.zypageDomain}/assets/ajax/system.php`;
    
    // Phương pháp 1: Form POST qua Iframe ẩn (Bỏ qua hoàn toàn CORS bảo mật và tương thích 100% trong mọi trình duyệt/OBS)
    try {
        const iframeId = 'dua-zypage-post-iframe';
        let iframe = document.getElementById(iframeId);
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = iframeId;
            iframe.name = iframeId;
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
        }

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = postUrl;
        form.target = iframeId;

        const data = {
            action: 'donate_music_end',
            shop_id: state.zypageShopId,
            shop_token: state.zypageToken,
            music_key: musicKeyStr
        };

        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = data[key];
                form.appendChild(input);
            }
        }

        document.body.appendChild(form);
        form.submit();
        
        setTimeout(() => {
            if (form.parentNode) {
                document.body.removeChild(form);
            }
        }, 1000);
        console.log("sendZyPageSongEnd: Form submitted successfully via iframe");
    } catch (e) {
        console.warn("Lỗi gửi form qua iframe ẩn:", e);
    }

    const params = new URLSearchParams();
    params.append('action', 'donate_music_end');
    params.append('shop_id', state.zypageShopId);
    params.append('shop_token', state.zypageToken);
    params.append('music_key', musicKeyStr);

    let beaconSent = false;

    // Phương pháp 2: navigator.sendBeacon (không bị chặn CORS, gửi ngầm khi unload/chuyển bài)
    if (typeof navigator.sendBeacon === 'function') {
        try {
            // Dùng Blob chứa urlencoded string để đảm bảo Content-Type chuẩn application/x-www-form-urlencoded
            const blob = new Blob([params.toString()], { type: 'application/x-www-form-urlencoded' });
            beaconSent = navigator.sendBeacon(postUrl, blob);
            if (beaconSent) {
                console.log("sendZyPageSongEnd: beacon sent successfully");
            }
        } catch (e) {
            console.warn("sendBeacon failed:", e);
        }
    }

    // Phương pháp 3: fetch trực tiếp với mode no-cors và keepalive: true để dự phòng
    try {
        await fetch(postUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString(),
            mode: 'no-cors',
            keepalive: true
        });
        logSystem(`Đã gửi yêu cầu trôi bài lên ZyPage.`, 'system');
    } catch (err) {
        console.error("Lỗi gửi fetch no-cors:", err);
        if (!beaconSent) {
            logSystem(`⚠️ Đang gửi yêu cầu trôi bài ngầm lên ZyPage.`, 'system');
        }
    }
}

// =========================================================================
// --- PHẦN PHÁT TRIỂN THÊM: KẾT NỐI LIVE ZYPAGE & LẮNG NGHE FIREBASE ---
// =========================================================================

// --- HÀM TRUY VẤN QUA PROXY CORS CÓ FALLBACK TRÁNH LỖI TIMEOUT ---
async function fetchWithCorsProxy(url) {
    // Thử proxy 1: corsproxy.io (Mượt mà, ổn định hơn)
    try {
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        if (response.ok) {
            const text = await response.text();
            return { contents: text };
        }
    } catch (e) {
        console.warn("CORSProxy.io failed, trying allorigins fallback...", e);
    }

    // Thử proxy 2: allorigins.win (Bọc JSON)
    try {
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}&v=${Date.now()}`);
        if (response.ok) {
            const data = await response.json();
            return { contents: data.contents };
        }
    } catch (e) {
        console.error("AllOrigins failed too:", e);
    }

    throw new Error("Không thể kết nối qua tất cả các CORS Proxy. Máy chủ có thể đang quá tải (Status 522).");
}

// Hàm bóc tách Domain và Token từ URL hoặc text
function extractZyPageDomainAndToken(input) {
    input = input.trim();
    let domain = 'https://zypage.com';
    let token = '';
    
    if (input.includes('donate-music/')) {
        try {
            const urlObj = new URL(input);
            domain = urlObj.origin;
        } catch (e) {
            const match = input.match(/^(https?:\/\/[^\/]+)/);
            if (match) domain = match[1];
        }
        
        const parts = input.split('donate-music/');
        token = parts[parts.length - 1].split('/')[0].split('?')[0];
    } else {
        token = input;
    }
    
    return { domain, token };
}

// Kết nối Live với ZyPage
async function connectZyPageLive(isAutoReconnect = false) {
    const urlInput = document.getElementById('zypage-url');
    const shopIdInput = document.getElementById('zypage-shop-id');
    if (!urlInput) return;

    const inputVal = urlInput.value.trim();
    if (!inputVal) {
        if (!isAutoReconnect) alert("Vui lòng điền link trang donate-music ZyPage trước!");
        return;
    }

    const { domain, token } = extractZyPageDomainAndToken(inputVal);
    if (!token || token.length < 10) {
        alert("Link ZyPage hoặc Shop Token không đúng định dạng!");
        return;
    }

    // Kiểm tra xem người dùng có nhập thủ công Shop ID không
    let shopId = shopIdInput ? shopIdInput.value.trim() : '';

    updateZyPageStatusBadge('connecting', 'Đang kết nối...');
    logSystem(`Đang kết nối tới Live ZyPage [Token: ${token}]...`);

    if (isAutoReconnect && shopId) {
        logSystem(`Sử dụng Shop ID đã lưu: <strong>${shopId}</strong>`);
        // Lưu cấu hình và khởi động luôn
        state.zypageToken = token;
        state.zypageShopId = shopId;
        state.zypageDomain = domain;
        localStorage.setItem('dua_zypage_token', token);
        localStorage.setItem('dua_zypage_shop_id', shopId);
        localStorage.setItem('dua_zypage_domain', domain);
        saveConfigToAppData(inputVal, shopId);
        startFirebaseListener(shopId, token);
        return;
    }

    try {
        // Tải mã nguồn trang ZyPage để bóc tách Shop ID (sử dụng proxy có fallback)
        const resJson = await fetchWithCorsProxy(`${domain}/donate-music/${token}`);
        
        if (!resJson.contents) {
            throw new Error("Không lấy được nội dung trang.");
        }

        // Dùng Regex trích xuất shop_id
        const shopIdMatch = resJson.contents.match(/"shop_id"\s*:\s*(\d+)/) || resJson.contents.match(/shop_id\s*:\s*(\d+)/);
        if (!shopIdMatch) {
            throw new Error("Không tìm thấy shop_id trong mã nguồn.");
        }

        shopId = shopIdMatch[1];
        logSystem(`Đã tự động tìm thấy Shop ID ZyPage: <strong>${shopId}</strong>`);
        
        if (shopIdInput) {
            shopIdInput.value = shopId;
        }

        // Lưu cấu hình
        state.zypageToken = token;
        state.zypageShopId = shopId;
        state.zypageDomain = domain;
        localStorage.setItem('dua_zypage_token', token);
        localStorage.setItem('dua_zypage_shop_id', shopId);
        localStorage.setItem('dua_zypage_domain', domain);
        saveConfigToAppData(inputVal, shopId);

        // Khởi động cổng lắng nghe Firebase Realtime Database
        startFirebaseListener(shopId, token);

    } catch (err) {
        console.error("ZyPage live connect error:", err);
        logSystem(`Kết nối tự động thất bại: ${err.message}`, 'system');
        logSystem(`💡 Mẹo: Hãy tự nhập Shop ID vào ô 'Shop ID (Tùy chọn)' để bỏ qua bước cào dữ liệu tự động bị lỗi!`, 'system');
        updateZyPageStatusBadge('disconnected', 'Cần nhập Shop ID');
        if (!isAutoReconnect) {
            alert("Kết nối tự động thất bại do máy chủ trung gian bị lỗi (522/Timeout).\n\nVui lòng tự nhập mã 'Shop ID' thủ công để kích hoạt cổng kết nối trực tiếp!");
        }
    }
}

// Khởi chạy cổng lắng nghe Firebase
function startFirebaseListener(shopId, token) {
    if (state.firebaseRef) {
        state.firebaseRef.off();
    }

    try {
        if (!firebase.apps.length) {
            const config = {
                apiKey: "AAAADrfQcaQ:APA91bFmkJVtZFrN0QRT1BprQolTFljW1Rz0k1uIreUy9TP-5gKVWlD_tRekQLUcuJy8MnD7N0GYgTLu95wqldj3YxlK94h-aLhqXjB1My2-nVaNE8FyH7xShwLzgmjbnsKofNnVV58l",
                authDomain: "cmanga-chat-default-rtdb.firebaseapp.com",
                databaseURL: "https://cmanga-chat-default-rtdb.asia-southeast1.firebasedatabase.app/",
                projectId: "cmanga-chat",
                storageBucket: "cmanga-chat.appspot.com",
                messagingSenderId: "663373805842"
            };
            firebase.initializeApp(config);
        }

        const dbRef = firebase.database().ref('ZYPAGE');
        state.firebaseRef = dbRef.child("Page/Donate/" + token);

        let isInitialLoad = true;
        state.firebaseRef.on('value', (snap) => {
            const val = snap.val();
            if (!val) return;
            
            if (isInitialLoad) {
                isInitialLoad = false;
                return;
            }
            
            logSystem(`Nhận lệnh từ ZyPage Live: <strong>${val.type}</strong>`, 'system');

            if (val.type === 'donateMusicLoad' || val.type === 'add') {
                logSystem("Phát hiện có lượt donate nhạc mới! Đang đồng bộ...", 'queue');
                syncQueueFromZyPageApi(shopId);
            } else if (val.type === 'donateMusicPause') {
                togglePlayPause();
            } else if (val.type === 'donateMusicEnd') {
                if (state.currentSong && !state.currentSong.isZyPage) {
                    logSystem(`Nhận lệnh kết thúc bài từ ZyPage, nhưng bài hát đang phát (${state.currentSong.title}) là nhạc Thêm nhanh cục bộ. Bỏ qua lệnh này.`, 'system');
                } else {
                    skipSong();
                }
            }
        });

        state.zypageConnected = true;
        updateZyPageStatusBadge('connected', 'Đã kết nối Live');
        
        document.getElementById('btn-zypage-connect').style.display = 'none';
        document.getElementById('btn-zypage-disconnect').style.display = 'inline-flex';
        
        logSystem("Đồng bộ Live Firebase hoàn tất! Sẵn sàng nhận nhạc tự động.", 'system');

        // Khởi động kết nối MQTT đồng bộ với token mới của ZyPage
        updateObsUrlDisplay();
        initMqtt();

        syncQueueFromZyPageApi(shopId);

    } catch (err) {
        console.error("Firebase setup error:", err);
        logSystem(`Lỗi khởi tạo Realtime Database: ${err.message}`, 'system');
        updateZyPageStatusBadge('disconnected', 'Lỗi Firebase');
    }
}

// Ngắt kết nối Live ZyPage
function disconnectZyPageLive() {
    if (state.firebaseRef) {
        state.firebaseRef.off();
        state.firebaseRef = null;
    }

    state.zypageConnected = false;
    state.zypageToken = '';
    state.zypageShopId = '';
    
    localStorage.removeItem('dua_zypage_token');
    localStorage.removeItem('dua_zypage_shop_id');

    updateZyPageStatusBadge('disconnected', 'Chưa kết nối');
    
    document.getElementById('btn-zypage-connect').style.display = 'inline-flex';
    document.getElementById('btn-zypage-disconnect').style.display = 'none';
    
    logSystem("Đã ngắt kết nối với Live ZyPage.", 'system');

    // Reconnect MQTT với localSyncKey cục bộ
    updateObsUrlDisplay();
    initMqtt();
}

// Gọi API lấy hàng đợi bài hát mới nhất từ máy chủ ZyPage
async function syncQueueFromZyPageApi(shopId) {
    if (state.isSyncingQueue) {
        state.syncQueuePending = true;
        return;
    }
    state.isSyncingQueue = true;

    try {
        const getUrl = `${state.zypageDomain}/api/get_data_by_id?table=shop&data=donate&id=${shopId}&v=${Date.now()}`;
        
        const resJson = await fetchWithCorsProxy(getUrl);
        if (!resJson.contents) return;

        const contents = JSON.parse(resJson.contents);
        let shopData = contents.data;
        if (typeof shopData === 'string') {
            shopData = JSON.parse(shopData);
        }

        let donateObj = shopData.donate;
        if (typeof donateObj === 'string') {
            try {
                donateObj = JSON.parse(donateObj);
            } catch (e) {
                console.error("Error parsing donateObj:", e);
                donateObj = {};
            }
        }

        const musicList = donateObj?.music?.list || {};

        if (Object.keys(musicList).length === 0) {
            logSystem("Không tìm thấy bài hát nào trong hàng đợi trên trang ZyPage của bạn.", "system");
            return;
        }

        let addedCount = 0;
        let maxTimestamp = state.lastSyncedDonateTime;

        Object.entries(musicList).forEach(([key, item]) => {
            if (!item.music || !item.music.id) return;

            const songTimestamp = normalizeTimestamp(item.order.time);

            // Chỉ lấy bài hát mới được donate trong khoảng thời gian ngắn, bỏ qua các bài đã đồng bộ trước đó
            if (songTimestamp <= state.lastSyncedDonateTime) {
                return;
            }

            // Bỏ qua các bài hát có thời gian donate quá 15 phút trước để tránh nhận nhầm lệnh cũ
            const now = Date.now();
            if (now - songTimestamp > 15 * 60 * 1000) {
                return;
            }

            if (songTimestamp > maxTimestamp) {
                maxTimestamp = songTimestamp;
            }

            const musicIdStr = String(item.music.id).trim();
            let type = 'youtube';
            let videoId = null;
            let spotifyId = null;
            let soundcloudUrl = null;

            if (musicIdStr.includes('spotify.com') || musicIdStr.startsWith('spotify:')) {
                logSystem(`Bỏ qua bài hát từ Spotify (đã dừng hỗ trợ): <strong>${item.music.title || musicIdStr}</strong>`, 'system');
                return;
            } else if (musicIdStr.includes('soundcloud.com')) {
                soundcloudUrl = musicIdStr;
                type = 'soundcloud';
            } else {
                videoId = parseYoutubeId(musicIdStr);
                if (!videoId) return;
                type = 'youtube';
            }

            const musicKey = item.music.key || key;
            
            // Bỏ qua các bài hát đã phát xong hoặc bị xóa trước đó (sử dụng some để check dạng Object)
            if (state.endedKeys.some(e => e.key === String(musicKey))) {
                return;
            }

            const uniqueKey = musicKey || item.order.time || (videoId || spotifyId || soundcloudUrl);
            const isExist = state.queue.some(q => q.id === uniqueKey || 
                (q.type === type && (
                    (type === 'youtube' && q.videoId === videoId) ||
                    (type === 'spotify' && q.spotifyId === spotifyId) ||
                    (type === 'soundcloud' && q.soundcloudUrl === soundcloudUrl)
                ) && q.timestamp === normalizeTimestamp(item.order.time))
            );

            if (!isExist) {
                const localItem = {
                    id: uniqueKey,
                    musicKey: musicKey,
                    isZyPage: true,
                    type: type,
                    videoId: videoId,
                    spotifyId: spotifyId,
                    soundcloudUrl: soundcloudUrl,
                    title: item.music.title || `Nhạc ${type.toUpperCase()}`,
                    thumbnail: item.music.thumbnail || (type === 'youtube' 
                        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` 
                        : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop"),
                    donorName: item.order.name || 'Khách ZyPage',
                    amount: Number(item.order.amount) || 0,
                    message: item.order.message || '',
                    start: Number(item.music.start) || 0,
                    end: Number(item.music.end) || null,
                    timestamp: normalizeTimestamp(item.order.time),
                    localAddedAt: Date.now()
                };

                insertSongSmartly(localItem);
                broadcastNewDonationAlert(localItem);
                addedCount++;
            }
        });

        if (maxTimestamp > state.lastSyncedDonateTime) {
            state.lastSyncedDonateTime = maxTimestamp;
            localStorage.setItem('dua_last_synced_donate_time', state.lastSyncedDonateTime);
        }

        if (addedCount > 0) {
            logSystem(`Đã đồng bộ thành công thêm <strong>${addedCount}</strong> bài hát mới vào hàng đợi!`, 'queue');
            showDashboardSystemAlert("Đồng bộ ZyPage", `Đã đồng bộ thành công thêm <strong>${addedCount}</strong> bài hát mới vào hàng đợi!`, 'HÀNG ĐỢI');
            sortAndRefreshQueue();

            if (!state.currentSong) {
                playNextInQueue();
            }
        } else {
            logSystem("Hàng đợi đã được cập nhật đồng bộ hoàn toàn.", "system");
        }

    } catch (err) {
        console.error("Queue sync error:", err);
        logSystem(`Đồng bộ danh sách nhạc ZyPage thất bại: ${err.message}`, 'system');
    } finally {
        state.isSyncingQueue = false;
        if (state.syncQueuePending) {
            state.syncQueuePending = false;
            setTimeout(() => {
                syncQueueFromZyPageApi(shopId);
            }, 500);
        }
    }
}

// Cập nhật thẻ trạng thái ZyPage
function updateZyPageStatusBadge(status, text) {
    const badge = document.getElementById('zypage-status-badge');
    const card = document.getElementById('zypage-sync-card');
    if (!badge) return;

    badge.className = `status-badge ${status}`;
    badge.textContent = text;

    if (card) {
        if (status === 'connected') {
            card.className = 'dua-card zypage-sync-card';
        } else {
            card.className = 'dua-card zypage-sync-card disconnected';
        }
    }
}

// Lắng nghe sự kiện đồng bộ trạng thái từ OBS Overlay phát ngược lại Dashboard
window.addEventListener('storage', (e) => {
    if (e.key === 'dua_overlay_state') {
        try {
            const data = JSON.parse(e.newValue);
            if (!data) return;

            const isPlayingChanged = state.isPlaying !== data.isPlaying;
            state.isPlaying = data.isPlaying;
            updatePlayPauseButtonUI(data.isPlaying);

            if (data.duration > 0 && state.currentSong) {
                if (!state.currentSong.duration || state.currentSong.duration !== data.duration) {
                    state.currentSong.duration = data.duration;
                    const matchedQueueSong = state.queue.find(s => String(s.id) === String(state.currentSong.id));
                    if (matchedQueueSong) {
                        matchedQueueSong.duration = data.duration;
                    }
                    renderQueue();
                } else if (isPlayingChanged) {
                    renderQueue();
                }
            } else if (isPlayingChanged) {
                renderQueue();
            }

            const progressSlider = document.getElementById('progress-slider');
            const currentTimeDisplay = document.getElementById('current-time-display');
            const totalTimeDisplay = document.getElementById('total-time-display');

            if (data.duration > 0) {
                let startPoint = 0;
                let limitDuration = data.duration;
                
                if (state.currentSong) {
                    startPoint = state.currentSong.start || 0;
                    let endPoint = data.duration;
                    
                    if (state.currentSong.end && state.currentSong.end > startPoint) {
                        endPoint = Math.min(endPoint, state.currentSong.end);
                    }
                    
                    const maxDur = calculateMaxDurationForSong(state.currentSong.amount);
                    if (maxDur > 0) {
                        endPoint = Math.min(endPoint, startPoint + maxDur);
                    }
                    
                    limitDuration = Math.max(1, endPoint - startPoint);
                }
                
                currentOverlayDuration = limitDuration;
                
                const elapsedTime = Math.min(limitDuration, Math.max(0, data.currentTime - startPoint));
                
                if (progressSlider) {
                    const pct = (elapsedTime / limitDuration) * 100;
                    progressSlider.value = pct;
                    progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
                }

                if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(elapsedTime);
                if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(limitDuration);
            }

        } catch (err) {
            console.error("Error parsing overlay state:", err);
        }
    } else if (e.key === 'dua_overlay_event') {
        try {
            const data = JSON.parse(e.newValue);
            if (data && data.type === 'ended') {
                if (Date.now() - state.lastSwitchTime < 1500) {
                    console.log("Ignoring fake ended event (manual song switch)...");
                    return;
                }
                const titleStr = state.currentSong ? state.currentSong.title : 'Không rõ';
                logSystem(`Đã phát xong: <strong>${titleStr}</strong>`);
                const songId = state.currentSong ? state.currentSong.id : null;
                if (songId) {
                    removeSongFromQueue(songId, false);
                }
                playNextInQueue();
            }
        } catch (err) {
            console.error("Error parsing overlay event:", err);
        }
    }
});

// =========================================================================
// --- ĐỒNG BỘ MQTT XUYÊN TRÌNH DUYỆT (CHROME <-> OBS) ---
// =========================================================================

function updateObsUrlDisplay() {
    const obsUrlInput = document.getElementById('obs-url-input');
    if (!obsUrlInput) return;
    
    const scaleSelect = document.getElementById('obs-scale-select');
    const scaleVal = scaleSelect ? scaleSelect.value : '1';
    
    const themeSelect = document.getElementById('obs-theme-select');
    const themeVal = themeSelect ? themeSelect.value : 'pineapple';
    
    let baseUrl = '';
    if (window.location.protocol === 'file:') {
        baseUrl = window.location.href.replace('index.html', '').replace(/\/$/, '') + '/overlay.html';
    } else {
        baseUrl = window.location.origin + window.location.pathname.replace('index.html', '').replace(/\/$/, '') + '/overlay.html';
    }
    
    const paramName = 'key';
    const paramValue = state.localSyncKey;
    
    let url = `${baseUrl}?${paramName}=${paramValue}`;
    if (scaleVal !== '1') {
        url += `&scale=${scaleVal}`;
    }
    if (themeVal !== 'pineapple') {
        url += `&theme=${themeVal}`;
    }
    if (state.opacity !== '100') {
        url += `&opacity=${state.opacity}`;
    }
    if (state.alertActionText && state.alertActionText !== 'gửi một quả dứa') {
        url += `&alert_action=${encodeURIComponent(state.alertActionText)}`;
    }
    
    obsUrlInput.value = url;
}

function onThemeChange(theme) {
    state.theme = theme;
    localStorage.setItem('dua_theme', theme);
    updateObsUrlDisplay();
    publishMqtt('theme_change', { theme: theme });
}

function onOpacityChange(val) {
    state.opacity = val;
    localStorage.setItem('dua_opacity', val);
    const opacityVal = document.getElementById('obs-opacity-val');
    if (opacityVal) {
        opacityVal.textContent = val + '%';
    }
    updateObsUrlDisplay();
    publishMqtt('opacity_change', { opacity: val });
}

function initMqtt() {
    if (state.mqttClient) {
        try {
            state.mqttClient.end();
        } catch (e) {
            console.error("Error ending old MQTT client:", e);
        }
        state.mqttClient = null;
    }

    const channelId = state.localSyncKey;
    state.mqttTopic = `dua_corner/player/${channelId}`;
    
    logSystem(`Đang kết nối MQTT đồng bộ xuyên trình duyệt...`);
    
    try {
        state.mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
            keepalive: 60,
            clientId: 'dua_dashboard_' + Math.random().toString(16).substr(2, 8),
            clean: true
        });

        state.mqttClient.on('connect', () => {
            logSystem(`<span style="color: var(--pineapple-success); font-weight: 800;"><i class="fa-solid fa-circle-check"></i> Đã kết nối MQTT thành công!</span> Kênh: ${channelId}`);
            
            const statusTopic = `${state.mqttTopic}/status`;
            state.mqttClient.subscribe(statusTopic, (err) => {
                if (err) {
                    console.error("MQTT Subscribe error:", err);
                } else {
                    console.log("Subscribed to status topic:", statusTopic);
                }
            });

            // Đồng bộ cấu hình ban đầu ngay khi kết nối MQTT thành công
            publishMqtt('max_duration', { value: state.maxDurationEnabled ? state.maxDuration : 0 });
            publishMqtt('opacity_change', { opacity: state.opacity });
            publishMqtt('theme_change', { theme: state.theme });
            publishMqtt('alert_action_text', { text: state.alertActionText });
            sendControlCommand('volume', state.volume);
            
            if (state.currentSong) {
                const nextSong = state.queue.find(s => String(s.id) !== String(state.currentSong.id));
                const payloadSong = {
                    id: state.currentSong.id,
                    type: state.currentSong.type || 'youtube',
                    videoId: state.currentSong.videoId || null,
                    soundcloudUrl: state.currentSong.soundcloudUrl || null,
                    spotifyId: state.currentSong.spotifyId || null,
                    title: state.currentSong.title,
                    thumbnail: state.currentSong.thumbnail,
                    donorName: state.currentSong.donorName,
                    amount: state.currentSong.amount,
                    message: state.currentSong.message,
                    start: state.currentSong.start || 0,
                    end: state.currentSong.end || null,
                    skipSegments: state.skipSegments || [],
                    maxDuration: state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong.amount),
                    nextSongTitle: nextSong ? nextSong.title : null,
                    nextSongDonor: nextSong ? nextSong.donorName : null,
                    nextSongAmount: nextSong ? nextSong.amount : null
                };
                publishMqtt('current_song', payloadSong);
                sendControlCommand(state.isPlaying ? 'play' : 'pause');
            } else {
                publishMqtt('current_song', null);
                sendControlCommand('stop');
            }
        });

        state.mqttClient.on('message', (topic, message) => {
            handleMqttMessage(topic, message.toString());
        });

        state.mqttClient.on('error', (err) => {
            console.error("MQTT error:", err);
            logSystem(`Lỗi kết nối MQTT: ${err.message || err}`, 'system');
        });

    } catch (e) {
        console.error("Failed to connect to MQTT:", e);
        logSystem(`Không thể kết nối MQTT: ${e.message}`, 'system');
    }
}

function publishMqtt(type, payload) {
    if (!state.mqttClient || !state.mqttClient.connected) return;
    
    const topic = `${state.mqttTopic}/command`;
    const message = JSON.stringify({ type: type, data: payload });
    state.mqttClient.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
            console.error("MQTT Publish error:", err);
        }
    });
}

function handleMqttMessage(topic, messageStr) {
    try {
        const payload = JSON.parse(messageStr);
        if (!payload) return;

        if (payload.type === 'request_sync') {
            logSystem("Nhận yêu cầu đồng bộ cấu hình từ Overlay.");
            // Gửi theme hiện tại
            publishMqtt('theme_change', { theme: state.theme });
            // Gửi opacity hiện tại
            publishMqtt('opacity_change', { opacity: state.opacity });
            // Gửi SponsorBlock categories hiện tại
            publishMqtt('sb_categories', sponsorBlockCategories);
            // Gửi âm lượng hiện tại
            sendControlCommand('volume', state.volume);
            // Gửi giới hạn thời gian phát hiện tại (tôn trọng bypass)
            const currentDur = state.bypassCurrentSongDuration ? 0 : 
                (state.currentSong ? calculateMaxDurationForSong(state.currentSong.amount) : (state.maxDurationEnabled ? state.maxDuration : 0));
            publishMqtt('max_duration', { value: currentDur });
            // Gửi alert action text
            publishMqtt('alert_action_text', { text: state.alertActionText });
            // Gửi bài hát hiện tại (nếu có)
            if (state.currentSong) {
                // Gửi lời hiển thị khi hết nhạc
                publishMqtt('empty_queue_message', { text: state.emptyQueueMessage });
                
                const nextSong = state.queue.find(s => String(s.id) !== String(state.currentSong.id));
                const payloadSong = {
                    id: state.currentSong.id,
                    type: state.currentSong.type || 'youtube',
                    videoId: state.currentSong.videoId || null,
                    soundcloudUrl: state.currentSong.soundcloudUrl || null,
                    spotifyId: state.currentSong.spotifyId || null,
                    title: state.currentSong.title,
                    thumbnail: state.currentSong.thumbnail,
                    donorName: state.currentSong.donorName,
                    amount: state.currentSong.amount,
                    message: state.currentSong.message,
                    start: state.currentSong.start || 0,
                    end: state.currentSong.end || null,
                    skipSegments: state.skipSegments || [],
                    maxDuration: state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong.amount),
                    nextSongTitle: nextSong ? nextSong.title : null,
                    nextSongDonor: nextSong ? nextSong.donorName : null,
                    nextSongAmount: nextSong ? nextSong.amount : null
                };
                publishMqtt('current_song', payloadSong);
                sendControlCommand(state.isPlaying ? 'play' : 'pause');
            } else {
                publishMqtt('current_song', null);
                sendControlCommand('stop');
            }
        } else if (payload.type === 'overlay_state') {
            const data = payload.state;
            if (!data) return;

            const isPlayingChanged = state.isPlaying !== data.isPlaying;
            state.isPlaying = data.isPlaying;
            updatePlayPauseButtonUI(data.isPlaying);

            if (data.duration > 0 && state.currentSong) {
                if (!state.currentSong.duration || state.currentSong.duration !== data.duration) {
                    state.currentSong.duration = data.duration;
                    const matchedQueueSong = state.queue.find(s => String(s.id) === String(state.currentSong.id));
                    if (matchedQueueSong) {
                        matchedQueueSong.duration = data.duration;
                    }
                    renderQueue();
                } else if (isPlayingChanged) {
                    renderQueue();
                }
            } else if (isPlayingChanged) {
                renderQueue();
            }

            const progressSlider = document.getElementById('progress-slider');
            const currentTimeDisplay = document.getElementById('current-time-display');
            const totalTimeDisplay = document.getElementById('total-time-display');

            if (data.duration > 0) {
                let startPoint = 0;
                let limitDuration = data.duration;
                
                if (state.currentSong) {
                    startPoint = state.currentSong.start || 0;
                    let endPoint = data.duration;
                    
                    if (state.currentSong.end && state.currentSong.end > startPoint) {
                        endPoint = Math.min(endPoint, state.currentSong.end);
                    }
                    
                    const maxDur = state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong.amount);
                    if (maxDur > 0) {
                        endPoint = Math.min(endPoint, startPoint + maxDur);
                    }
                    
                    limitDuration = Math.max(1, endPoint - startPoint);
                }
                
                currentOverlayDuration = limitDuration;
                
                const elapsedTime = Math.min(limitDuration, Math.max(0, data.currentTime - startPoint));
                
                if (progressSlider) {
                    const pct = (elapsedTime / limitDuration) * 100;
                    progressSlider.value = pct;
                    progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
                }

                if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(elapsedTime);
                if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(limitDuration);
            }
            
        } else if (payload.type === 'overlay_event') {
            const event = payload.event;
            if (event && event.type === 'ended') {
                if (Date.now() - state.lastSwitchTime < 1500) {
                    console.log("Ignoring fake ended event from MQTT (manual song switch)...");
                    return;
                }
                const titleStr = state.currentSong ? state.currentSong.title : 'Không rõ';
                logSystem(`Đã phát xong: <strong>${titleStr}</strong>`);
                const songId = state.currentSong ? state.currentSong.id : null;
                if (songId) {
                    removeSongFromQueue(songId, false);
                }
                playNextInQueue();
            }
        }
    } catch (e) {
        console.error("Error parsing MQTT message:", e);
    }
}


// --- ĐỌC VÀ GHI CẤU HÌNH ZYPAGE VÀO APPDATA ---
async function saveConfigToAppData(url, shopId) {
    try {
        await fetch(getApiUrl('/api/config'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ zypageUrl: url, zypageShopId: shopId })
        });
        console.log("Đã lưu cấu hình ZyPage vào AppData thành công.");
    } catch (e) {
        console.warn("Không thể lưu cấu hình vào AppData:", e);
    }
}

async function loadConfigFromAppData() {
    const zypageInput = document.getElementById('zypage-url');
    const zypageShopIdInput = document.getElementById('zypage-shop-id');
    
    try {
        const response = await fetch(getApiUrl('/api/config'));
        if (response.ok) {
            const config = await response.json();
            if (config.zypageUrl) {
                if (zypageInput) zypageInput.value = config.zypageUrl;
            }
            if (config.zypageShopId) {
                if (zypageShopIdInput) zypageShopIdInput.value = config.zypageShopId;
                state.zypageShopId = config.zypageShopId;
                localStorage.setItem('dua_zypage_shop_id', config.zypageShopId);
            }
            if (config.zypageUrl) {
                const { domain, token } = extractZyPageDomainAndToken(config.zypageUrl);
                state.zypageToken = token;
                state.zypageDomain = domain;
                localStorage.setItem('dua_zypage_token', token);
                localStorage.setItem('dua_zypage_domain', domain);
                
                // Tự động kết nối lại
                connectZyPageLive(true);
                return;
            }
        }
    } catch (e) {
        console.warn("Không thể tải cấu hình từ AppData, dùng localStorage cũ làm dự phòng:", e);
    }

    // Dự phòng (Fallback) khi chạy file:/// hoặc API lỗi
    if (zypageShopIdInput && state.zypageShopId) {
        zypageShopIdInput.value = state.zypageShopId;
    }
    if (zypageInput && state.zypageToken) {
        zypageInput.value = `${state.zypageDomain}/donate-music/${state.zypageToken}`;
        connectZyPageLive(true);
    }
}

// --- YÊU CẦU OVERLAY LOAD LẠI TRANG (RESET) ---
function triggerResetOverlay() {
    logSystem("Gửi yêu cầu Reset/Tải lại trang tới Overlay...", 'system');
    sendControlCommand('reload');
}

// --- HIỂN THỊ KẾT QUẢ TÌM KIẾM YOUTUBE ---
function renderSearchResults(videos) {
    const container = document.getElementById('quick-add-search-results');
    if (!container) return;
    
    container.innerHTML = '';
    
    videos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        item.innerHTML = `
            <div class="search-result-thumb">
                <img src="${video.thumbnail}" alt="thumb">
            </div>
            <div class="search-result-info">
                <div class="search-result-title" title="${video.title}">${video.title}</div>
                <div class="search-result-meta">
                    <span>${video.author}</span>
                    <span style="display: flex; align-items: center; gap: 5px;">
                        ${video.views ? `
                        <span class="search-result-views" style="display: inline-flex; align-items: center; gap: 0.15rem; color: #9CA3AF; margin-right: 0.3rem;" title="Lượt xem: ${video.views}">
                            <i class="fa-regular fa-eye" style="font-size: 0.7rem;"></i>
                            ${formatViewsCompact(video.views)}
                        </span>
                        ` : ''}
                        <span class="search-result-duration">${video.duration}</span>
                    </span>
                </div>
            </div>
            <button class="search-result-btn" title="Thêm vào hàng đợi">
                <i class="fa-solid fa-plus"></i>
            </button>
        `;
        
        // Đăng ký sự kiện click chọn bài
        const addBtn = item.querySelector('.search-result-btn');
        const selectAction = (e) => {
            e.stopPropagation();
            addSearchResultToQueue(video);
        };
        
        addBtn.addEventListener('click', selectAction);
        item.addEventListener('click', selectAction);
        
        container.appendChild(item);
    });
}

// --- THÊM BÀI HÁT TỪ KẾT QUẢ TÌM KIẾM VÀO HÀNG ĐỢI ---
function addSearchResultToQueue(video) {
    const nameInput = document.getElementById('quick-donor-name');
    const donorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Introvert";
    
    const amountInput = document.getElementById('quick-donor-amount');
    const donorAmount = (amountInput && amountInput.value.trim() !== '') ? Number(amountInput.value) : 100000000;

    const newSong = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        type: 'youtube',
        videoId: video.videoId,
        spotifyId: null,
        soundcloudUrl: null,
        title: video.title,
        thumbnail: video.thumbnail,
        donorName: donorName,
        amount: donorAmount,
        message: "",
        start: 0,
        end: null,
        timestamp: Date.now(),
        localAddedAt: Date.now(),
        views: video.views || ''
    };
    
    insertSongSmartly(newSong);
    broadcastNewDonationAlert(newSong);
    saveQueue();
    sortAndRefreshQueue();
    
    logSystem(`Đã thêm nhanh bài hát từ tìm kiếm: <strong>${video.title}</strong>`, 'queue');
    showDashboardSystemAlert("Đã thêm nhạc nhanh", `Đã thêm nhanh bài hát: <strong>${video.title}</strong>`, 'HÀNG ĐỢI');
    
    // Xóa trống dữ liệu nhập và ẩn dropdown
    const urlInput = document.getElementById('donor-url');
    if (urlInput) urlInput.value = '';
    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
    
    const container = document.getElementById('quick-add-search-results');
    if (container) container.style.display = 'none';
    
    if (!state.currentSong) {
        playNextInQueue();
    }
}


