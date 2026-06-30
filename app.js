// Trình quản lý Nhạc Donate Dứa Corner — Logic Chính (app.js)

// Khởi tạo thời điểm chạy app để chống spam thông báo khi sync lúc bắt đầu
const appStartTime = Date.now();

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
    if (isNaN(num)) return Date.now();
    return (num < 10000000000) ? num * 1000 : num;
}

// Lấy thông tin tiêu đề và ảnh thu nhỏ cho các bài hát từ URL
async function fetchSongMetadata(type, videoId, soundcloudUrl) {
    let title = '';
    let thumbnail = '';
    
    try {
        if (type === 'youtube') {
            const url = `https://www.youtube.com/watch?v=${videoId}`;
            if (window.electronAPI && typeof window.electronAPI.getYoutubeMetadata === 'function') {
                const metadata = await window.electronAPI.getYoutubeMetadata(videoId);
                title = metadata.title || `Nhạc YouTube (${videoId})`;
                thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            } else {
                const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
                const data = await response.json();
                title = data.title || `Nhạc YouTube (${videoId})`;
                thumbnail = data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        } else if (type === 'soundcloud') {
            const response = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(soundcloudUrl)}`);
            const data = await response.json();
            title = data.title || `Nhạc SoundCloud`;
            thumbnail = data.thumbnail_url || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
        }
    } catch (e) {
        console.error("Lỗi lấy siêu dữ liệu bài nhạc:", e);
        if (type === 'youtube') {
            title = `YT: ${videoId}`;
            thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        } else {
            title = `SC: ${(soundcloudUrl || '').replace('https://soundcloud.com/', '')}`;
            thumbnail = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
        }
    }
    return { title, thumbnail };
}


// --- BIẾN TOÀN CỤC & CẤU HÌNH ---
let player = null;
let isPlayerApiReady = false;
let playbackMonitorInterval = null;
let lastPlayedVideoId = null;
let searchTimeout = null;

const KEYWORD_SHORTCUTS_STORAGE_KEY = 'dua_keyword_shortcuts';
const FAVORITE_SONGS_STORAGE_KEY = 'dua_favorite_songs';
let keywordSettingsSearchTimeout = null;
let selectedKeywordVideo = null;
let keywordShortcuts = loadKeywordShortcuts();
let favoriteSongs = loadFavoriteSongs();

function normalizeKeyword(value) {
    return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

function foldKeyword(value) {
    return normalizeKeyword(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
}

function updateRangeProgress(slider, value) {
    if (!slider) return;
    const numericValue = Number(value);
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const safeValue = Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : min;
    const percent = max > min ? ((safeValue - min) / (max - min)) * 100 : 0;
    slider.style.setProperty('--range-progress', `${percent}%`);
}

function loadKeywordShortcuts() {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEYWORD_SHORTCUTS_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && item.keyword && item.videoId) : [];
    } catch (error) {
        console.warn('Không thể đọc danh sách keyword:', error);
        return [];
    }
}

function saveKeywordShortcutsToStorage() {
    localStorage.setItem(KEYWORD_SHORTCUTS_STORAGE_KEY, JSON.stringify(keywordShortcuts));
}

function loadFavoriteSongs() {
    try {
        const parsed = JSON.parse(localStorage.getItem(FAVORITE_SONGS_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && item.videoId) : [];
    } catch (error) {
        console.warn('Không thể đọc danh sách yêu thích:', error);
        return [];
    }
}

function saveFavoriteSongs() {
    localStorage.setItem(FAVORITE_SONGS_STORAGE_KEY, JSON.stringify(favoriteSongs));
}

function isFavoriteSong(videoId) {
    return favoriteSongs.some(item => String(item.videoId) === String(videoId));
}

function normalizeLibraryVideo(video) {
    return {
        videoId: video.videoId,
        title: video.title || `YouTube (${video.videoId})`,
        thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
        author: video.author || '',
        duration: video.duration || '',
        views: video.views || '',
        keyword: video.shortcutKeyword || video.keyword || '',
        savedAt: Date.now()
    };
}

function toggleFavoriteSong(video) {
    if (!video || !video.videoId) return false;
    const index = favoriteSongs.findIndex(item => String(item.videoId) === String(video.videoId));
    let added = false;
    if (index >= 0) {
        favoriteSongs.splice(index, 1);
    } else {
        favoriteSongs.unshift(normalizeLibraryVideo(video));
        added = true;
    }
    saveFavoriteSongs();
    renderKeywordLibrary();
    updateCurrentFavoriteButton();
    return added;
}

function updateCurrentFavoriteButton() {
    const button = document.getElementById('btn-favorite-current');
    if (!button) return;
    const song = state.currentSong;
    const canFavorite = !!(song && (song.type || 'youtube') === 'youtube' && song.videoId);
    button.style.display = canFavorite ? 'inline-flex' : 'none';
    if (!canFavorite) return;
    const favorite = isFavoriteSong(song.videoId);
    button.classList.toggle('favorite-active', favorite);
    button.innerHTML = `<i class="${favorite ? 'fa-solid' : 'fa-regular'} fa-heart"></i><span>${favorite ? 'Đã yêu thích' : 'Yêu thích'}</span>`;
    button.title = favorite ? 'Bỏ bài đang phát khỏi danh sách yêu thích' : 'Thêm bài đang phát vào danh sách yêu thích';
}

function toggleCurrentSongFavorite() {
    if (!state.currentSong || !state.currentSong.videoId) return;
    toggleFavoriteSong(state.currentSong);
}

function updateCurrentKeywordButton() {
    const button = document.getElementById('btn-save-current-keyword');
    if (!button) return;
    const song = state.currentSong;
    button.style.display = song && (song.type || 'youtube') === 'youtube' && song.videoId ? 'inline-flex' : 'none';
}

function saveCurrentSongKeyword() {
    if (!state.currentSong || !state.currentSong.videoId) return;
    openSaveKeywordForVideo(state.currentSong);
}

function openSaveKeywordForVideo(video) {
    if (!video || !video.videoId) return;
    const oldModal = document.getElementById('save-video-keyword-modal');
    if (oldModal) oldModal.remove();

    const normalizedVideo = normalizeLibraryVideo(video);
    const existing = keywordShortcuts.find(item => String(item.videoId) === String(video.videoId));
    const modal = document.createElement('div');
    modal.id = 'save-video-keyword-modal';
    modal.className = 'save-video-keyword-modal';
    modal.innerHTML = `
        <form class="save-video-keyword-card">
            <h3>Lưu keyword</h3>
            <p title="${escapeKeywordHtml(normalizedVideo.title)}">${escapeKeywordHtml(normalizedVideo.title)}</p>
            <input class="dua-input" type="text" maxlength="80" autocomplete="off" placeholder="Nhập keyword..." value="${escapeKeywordHtml(existing ? existing.keyword : '')}">
            <div>
                <button type="button" class="dua-btn keyword-modal-cancel">Hủy</button>
                <button type="submit" class="dua-btn dua-btn-primary">Lưu</button>
            </div>
        </form>`;
    document.body.appendChild(modal);

    const form = modal.querySelector('form');
    const input = modal.querySelector('input');
    const close = () => modal.remove();
    modal.querySelector('.keyword-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', event => {
        if (event.target === modal) close();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        const keyword = input.value.trim().replace(/\s+/g, ' ');
        if (!keyword) return input.focus();
        const shortcut = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...normalizedVideo,
            keyword,
            updatedAt: Date.now()
        };
        const existingIndex = keywordShortcuts.findIndex(item => normalizeKeyword(item.keyword) === normalizeKeyword(keyword));
        if (existingIndex >= 0) {
            shortcut.id = keywordShortcuts[existingIndex].id;
            keywordShortcuts.splice(existingIndex, 1, shortcut);
        } else {
            keywordShortcuts.unshift(shortcut);
        }
        saveKeywordShortcutsToStorage();
        renderKeywordShortcutList();
        close();
    });
    requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        input.select();
    });
}

function findKeywordShortcut(query) {
    const normalized = normalizeKeyword(query);
    if (!normalized) return null;
    return keywordShortcuts.find(item => normalizeKeyword(item.keyword) === normalized) || null;
}

function findKeywordSuggestions(query, limit = 5) {
    const foldedQuery = foldKeyword(query);
    if (foldedQuery.length < 2) return [];

    return keywordShortcuts
        .map((shortcut, index) => {
            const foldedKeyword = foldKeyword(shortcut.keyword);
            let rank = 99;
            if (foldedKeyword === foldedQuery) rank = 0;
            else if (foldedKeyword.startsWith(foldedQuery)) rank = 1;
            else if (foldedKeyword.split(' ').some(word => word.startsWith(foldedQuery))) rank = 2;
            else if (foldedKeyword.includes(foldedQuery)) rank = 3;
            return { shortcut, rank, index };
        })
        .filter(item => item.rank < 99)
        .sort((a, b) => a.rank - b.rank || a.shortcut.keyword.length - b.shortcut.keyword.length || a.index - b.index)
        .slice(0, limit)
        .map(item => item.shortcut);
}

function keywordShortcutToVideo(shortcut) {
    if (!shortcut) return null;
    return {
        videoId: shortcut.videoId,
        title: shortcut.title || `YouTube (${shortcut.videoId})`,
        thumbnail: shortcut.thumbnail || `https://img.youtube.com/vi/${shortcut.videoId}/hqdefault.jpg`,
        author: shortcut.author || 'Video đã gắn keyword',
        duration: shortcut.duration || '',
        views: shortcut.views || '',
        url: `https://www.youtube.com/watch?v=${shortcut.videoId}`,
        isKeywordShortcut: true,
        shortcutKeyword: shortcut.keyword
    };
}

function prioritizeKeywordVideo(query, videos = []) {
    const shortcutVideos = findKeywordSuggestions(query).map(keywordShortcutToVideo);
    if (shortcutVideos.length === 0) return videos;
    const shortcutIds = new Set(shortcutVideos.map(video => video.videoId));
    return [...shortcutVideos, ...videos.filter(video => video && !shortcutIds.has(video.videoId))];
}

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
        if (val && typeof val === 'object') {
            if (val.extensionForceShow === undefined) {
                val.extensionForceShow = false;
            }
        }
        this._currentSong = val;
        if (val) {
            localStorage.setItem('dua_current_song_raw', JSON.stringify(val));
        } else {
            localStorage.removeItem('dua_current_song_raw');
        }
    },
    _isPlaying: localStorage.getItem('dua_is_playing') === 'true',
    _playbackIntent: localStorage.getItem('dua_playback_intent') || 'stop',
    get playbackIntent() {
        return this._playbackIntent;
    },
    set playbackIntent(val) {
        this._playbackIntent = val;
        localStorage.setItem('dua_playback_intent', val);
    },
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
    hideEmptyOverlay: localStorage.getItem('dua_hide_empty_overlay') === 'true',
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
            }).filter(item => now - item.timestamp < 7 * 24 * 60 * 60 * 1000);
        } catch (e) {
            return [];
        }
    })(),
    lastSyncedDonateTime: Number(localStorage.getItem('dua_last_synced_donate_time')) || 0,

    // Cấu hình đồng bộ local sync qua WebSocket/IPC
    localSyncKey: localStorage.getItem('dua_local_sync_key') || '',

    testMode: localStorage.getItem('dua_test_mode') === 'true',
    theme: localStorage.getItem('dua_theme') || 'flex',
    opacity: localStorage.getItem('dua_opacity') || '100',
    emptyQueueMessage: localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k',
    alertActionText: localStorage.getItem('dua_alert_action_text') || 'gửi một quả dứa',
    focusModeMessage: localStorage.getItem('dua_focus_mode_message') || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng',
    sensitiveVideosUrl: localStorage.getItem('dua_sensitive_videos_url') || 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json',

    extensionEnabled: localStorage.getItem('dua_extension_enabled') === 'true',
    extensionPrice: parseInt(localStorage.getItem('dua_extension_price')) || 50000,
    extensionMinutes: parseInt(localStorage.getItem('dua_extension_minutes')) || 6,
    voteSkipDefaultAmount: parseInt(localStorage.getItem('dua_vote_skip_default_amount')) || 20000,

    // Cờ tạm thời: bỏ qua giới hạn thời gian cho bài hát hiện tại
    bypassCurrentSongDuration: false,
    lastHandledEndedEventId: null,
    focusMode: localStorage.getItem('dua_focus_mode') === 'true',
    _wasPlayingBeforeFocusMode: localStorage.getItem('dua_was_playing_before_focus') === 'true',
    get wasPlayingBeforeFocusMode() {
        return this._wasPlayingBeforeFocusMode;
    },
    set wasPlayingBeforeFocusMode(val) {
        this._wasPlayingBeforeFocusMode = val;
        localStorage.setItem('dua_was_playing_before_focus', val);
    },
    lastSwitchTime: 0,
    pendingOverlayReset: !sessionStorage.getItem('dua_app_initialized'),
    lastReportedTime: 0,
    luckyMode: localStorage.getItem('dua_lucky_mode') === 'true',
    isLuckyRolling: false,
    luckyTimeout: null,
    luckyNextSong: null,
    pausePlayBypass: localStorage.getItem('dua_pause_play_bypass') === 'true',
    autoPinEnabled: localStorage.getItem('dua_auto_pin_enabled') !== 'false',
    autoPinWaitTime: parseInt(localStorage.getItem('dua_auto_pin_wait_time')) || 60
};

// --- LẤY BÀI HÁT TIẾP THEO (HỖ TRỢ LUCKY MODE) ---
function getNextSong() {
    if (state.queue.length === 0) return null;
    
    const currentId = state.currentSong ? String(state.currentSong.id) : null;
    
    if (state.luckyMode) {
        // Kiểm tra xem luckyNextSong đã chọn trước đó còn hợp lệ không
        if (state.luckyNextSong) {
            const exists = state.queue.some(s => String(s.id) === String(state.luckyNextSong.id));
            if (!exists || String(state.luckyNextSong.id) === currentId) {
                state.luckyNextSong = null;
            }
        }
        
        // Nếu chưa chọn hoặc không hợp lệ, chọn ngẫu nhiên bài tiếp theo trong hàng đợi
        if (!state.luckyNextSong) {
            const candidates = state.queue.filter(s => String(s.id) !== currentId);
            if (candidates.length > 0) {
                const randomIndex = Math.floor(Math.random() * candidates.length);
                state.luckyNextSong = candidates[randomIndex];
            }
        }
        
        if (state.luckyNextSong) {
            return state.luckyNextSong;
        }
    }
    
    // Chế độ bình thường: Lấy bài đầu tiên trong hàng đợi khác bài hiện tại
    return state.queue.find(s => String(s.id) !== currentId);
}

function updateNextSongInCurrentPayload() {
    if (!state.currentSong) return;
    const nextSong = getNextSong();
    const payloadRaw = localStorage.getItem('dua_current_song');
    if (!payloadRaw) return;
    try {
        const payload = JSON.parse(payloadRaw);
        payload.nextSongTitle = nextSong ? nextSong.title : null;
        payload.nextSongDonor = nextSong ? nextSong.donorName : null;
        payload.nextSongAmount = nextSong ? nextSong.amount : null;
        payload.nextSongIsOwnerAdd = nextSong ? (nextSong.isOwnerAdd || false) : false;
        payload.nextSongId = nextSong ? nextSong.id : null;
        payload.nextSongThumbnail = nextSong ? nextSong.thumbnail : null;
        payload.nextSongType = nextSong ? nextSong.type || 'youtube' : null;
        payload.nextSongVideoId = nextSong ? nextSong.videoId : null;
        payload.luckyMode = state.luckyMode || false;
        if (state.bypassCurrentSongDuration) {
            payload.maxDuration = 0;
        }
        localStorage.setItem('dua_current_song', JSON.stringify(payload));
        sendOverlayMessage('current_song', payload);
    } catch (e) {
        console.error("Lỗi cập nhật thông tin bài tiếp theo trong payload:", e);
    }
}

sessionStorage.setItem('dua_app_initialized', 'true');

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
    sendOverlayMessage('max_duration', { value: val });
}

// Tạm thời bật/tắt giới hạn thời gian cho bài hát đang phát
function bypassCurrentSongLimit() {
    if (state.focusMode) return;
    if (!state.currentSong) return;
    
    if (state.bypassCurrentSongDuration) {
        // Tắt bypass (Khôi phục giới hạn thời gian ban đầu)
        state.bypassCurrentSongDuration = false;
        const originalLimit = calculateMaxDurationForSong(state.currentSong);
        syncMaxDurationToOverlay(originalLimit);
        
        // Cập nhật payload đang lưu trong localStorage
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.maxDuration = originalLimit;
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                sendOverlayMessage('current_song', payload);
            } catch(e) {}
        }
        
        logSystem(`🔒 Đã khôi phục giới hạn thời gian cho bài hiện tại: <strong>${state.currentSong.title}</strong>`);
        showDashboardSystemAlert("Khôi phục giới hạn", `🔒 Đã khôi phục giới hạn thời gian cho bài hiện tại: <strong>${state.currentSong.title}</strong>`);
    } else {
        // Bật bypass (Mở giới hạn thời gian)
        state.bypassCurrentSongDuration = true;
        syncMaxDurationToOverlay(0);
        
        // Cập nhật payload đang lưu trong localStorage
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.maxDuration = 0;
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                sendOverlayMessage('current_song', payload);
            } catch(e) {}
        }
        
        logSystem(`🔓 Đã mở giới hạn thời gian cho bài hiện tại: <strong>${state.currentSong.title}</strong>`);
        showDashboardSystemAlert("Mở giới hạn bài", `🔓 Đã mở giới hạn thời gian cho bài hiện tại: <strong>${state.currentSong.title}</strong>`);
    }
    
    renderQueue(); // Cập nhật lại nút bấm trên giao diện
    updateBypassButtonUI(); // Cập nhật nút trạng thái trên giao diện
}

function generateExtensionCode() {
    // Sử dụng bộ ký tự không gây nhầm lẫn:
    // Loại bỏ: 0, O, Q (tránh nhầm nhau)
    // Loại bỏ: 1, I, L (tránh nhầm nhau)
    // Loại bỏ: 2, Z (tránh nhầm nhau)
    // Loại bỏ: 5, S (tránh nhầm nhau)
    // Loại bỏ: 8, B (tránh nhầm nhau)
    // Loại bỏ: U (tránh nhầm với V)
    const chars = 'ACDEFGHJKMNPRTUVWXY34679';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function markMusicKeyAsEnded(key) {
    if (!key) return;
    const musicKeyStr = String(key);
    const exists = state.endedKeys.some(e => e.key === musicKeyStr);
    if (!exists) {
        state.endedKeys.push({
            key: musicKeyStr,
            timestamp: Date.now()
        });
        const now = Date.now();
        state.endedKeys = state.endedKeys.filter(item => now - item.timestamp < 7 * 24 * 60 * 60 * 1000);
        if (state.endedKeys.length > 1000) {
            state.endedKeys.shift();
        }
        localStorage.setItem('dua_ended_keys', JSON.stringify(state.endedKeys));
    }
}

function calculateMaxDurationForSong(songOrAmount) {
    if (!state.maxDurationEnabled) return 0;
    
    let amount = 0;
    let extended = 0;
    if (songOrAmount && typeof songOrAmount === 'object') {
        amount = songOrAmount.amount;
        extended = songOrAmount.extendedDuration || 0;
    } else {
        amount = songOrAmount;
    }
    
    let baseDuration = 0;
    if (state.limitMode === 'fixed') {
        baseDuration = state.maxDuration;
    } else {
        const songAmount = Number(amount) || 0;
        const sortedMilestones = [...state.milestones].sort((a, b) => a.amount - b.amount);
        let found = false;
        for (const milestone of sortedMilestones) {
            if (songAmount < milestone.amount) {
                baseDuration = milestone.duration * 60;
                found = true;
                break;
            }
        }
        if (!found) {
            baseDuration = state.defaultDuration * 60;
        }
    }
    return baseDuration + extended;
}

function isExtensionAllowedForSong(song) {
    if (!song) return false;
    // Nếu chưa có thời lượng thực của bài hát, mặc định cho phép để tránh bị chặn oan lúc mới load
    if (!song.duration || song.duration <= 0) return true;
    
    const currentLimit = calculateMaxDurationForSong(song);
    return (song.duration - currentLimit) > 0;
}

function checkAndApplyExtension(donation) {
    if (!state.extensionEnabled) return false;
    if (!state.currentSong) return false;
    
    if (!isExtensionAllowedForSong(state.currentSong)) {
        logSystem(`Nhận code gia hạn từ <strong>${donation.name}</strong>, nhưng bài hát đã được phát hết hoặc thời lượng giới hạn đã chạm tới độ dài thực tế của video. Không áp dụng gia hạn.`, 'system');
        return false;
    }
    
    const message = (donation.message || '').trim();
    if (!message) return false;
    
    const activeCode = state.currentSong.extensionCode;
    if (!activeCode) return false;
    
    // Tách tin nhắn thành các từ và làm sạch các ký tự đặc biệt ở đầu/cuối của từng từ
    const words = message.split(/\s+/);
    const hasActiveCodeWord = words.some(word => {
        const cleaned = word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toUpperCase();
        return cleaned === activeCode;
    });
    
    if (hasActiveCodeWord) {
        const amount = Number(donation.amount) || 0;
        const price = state.extensionPrice || 50000;
        const minutes = state.extensionMinutes || 6;
        
        const addedSeconds = Math.round((amount / price) * minutes * 60);
        if (addedSeconds <= 0) {
            logSystem(`Nhận code gia hạn từ <strong>${donation.name}</strong>, nhưng số tiền ${amount.toLocaleString('vi-VN')} đ không đủ để gia hạn (Giá thiết lập: ${price.toLocaleString('vi-VN')} đ = ${minutes} phút).`, 'system');
            return false;
        }
        
        // Mark this donation key as ended/processed
        if (donation.id) {
            markMusicKeyAsEnded(donation.id);
        }
        
        // Log to donation history (shouldAlert = false)
        handleNewDonation(donation, false);
        
        // Apply extension
        state.currentSong.extendedDuration = (state.currentSong.extendedDuration || 0) + addedSeconds;
        
        // Keep active code, just reset force show flag
        state.currentSong.extensionForceShow = false;
        
        // Re-save to triggering setter
        state.currentSong = state.currentSong;
        
        // Sync new max duration to overlay
        const newMaxDur = calculateMaxDurationForSong(state.currentSong);
        syncMaxDurationToOverlay(newMaxDur);
        
        // Update payload and broadcast
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.maxDuration = newMaxDur;
                payload.extendedDuration = state.currentSong.extendedDuration;
                payload.extensionPrice = state.extensionPrice;
                payload.extensionMinutes = state.extensionMinutes;
                payload.extensionForceShow = false;
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                sendOverlayMessage('current_song', payload);
            } catch(e) {}
        }
        
        // Trigger floating flash on overlay
        sendControlCommand('extended', {
            donorName: donation.name,
            amount: amount,
            seconds: addedSeconds
        });
        
        const minutesStr = (addedSeconds / 60).toFixed(1).replace(/\.0$/, '');
        logSystem(`➕ <strong>[Gia hạn thành công]</strong> Lượt donate từ <strong>${donation.name}</strong> (${amount.toLocaleString('vi-VN')} ₫) chứa mã code <strong>${activeCode}</strong>. Bài hát <strong>${state.currentSong.title}</strong> được cộng thêm <strong>${minutesStr} phút</strong>.`, 'system');
        showDashboardSystemAlert("Gia hạn thời gian", `Lượt donate từ <strong>${donation.name}</strong> (${amount.toLocaleString('vi-VN')} ₫) chứa mã code <strong>${activeCode}</strong>. Bài hát <strong>${state.currentSong.title}</strong> được cộng thêm <strong>${minutesStr} phút.</strong>`);
        
        updatePlayerUI(state.currentSong);
        return true;
    }
    
    return false;
}

function formatMoneyShort(amount) {
    if (amount >= 1000000) {
        return (amount / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (amount >= 1000) {
        return (amount / 1000).toFixed(0) + 'k';
    }
    return amount + 'đ';
}

function checkAndApplyVoteSkip(donation) {
    if (!state.currentSong) return false;
    if (!state.currentSong.voteSkipActive) return false;

    // Tạm thời bỏ yêu cầu từ khóa #skip khi vote skip bài hát
    // const message = (donation.message || '').trim().toLowerCase();
    // if (!message.includes('#skip')) return false;

    const amount = Number(donation.amount) || 0;
    state.currentSong.voteAmount = (state.currentSong.voteAmount || 0) + amount;

    // Lưu lại người đóng góp
    if (!state.currentSong.voteSkipContributors) {
        state.currentSong.voteSkipContributors = [];
    }
    state.currentSong.voteSkipContributors.push({
        name: donation.name || 'Khách',
        amount: amount,
        timestamp: donation.timestamp || Date.now()
    });

    // Cập nhật lại target nếu cần
    const target = state.currentSong.voteSkipTarget || (state.currentSong.isOwnerAdd ? state.voteSkipDefaultAmount : (state.currentSong.amount || state.voteSkipDefaultAmount));
    state.currentSong.voteSkipTarget = target;

    // Lưu lại trạng thái của song hiện tại
    state.currentSong = state.currentSong;

    // Đánh dấu khoá này đã xử lý xong để tránh xử lý lại
    if (donation.id) {
        markMusicKeyAsEnded(donation.id);
    }

    // Ghi nhận lịch sử và vẫn phát thông báo donate khi lượt này được dùng cho Vote Skip
    donation.isVoteSkip = true;
    donation.voteSkipCurrent = state.currentSong.voteAmount;
    donation.voteSkipTarget = target;
    handleNewDonation(donation, true);

    if (state.currentSong.voteAmount >= target) {
        if (state.currentSong.voteSkipSuccess) return true;
        state.currentSong.voteSkipSuccess = true;

        // Tổng hợp danh sách người đóng góp (gộp trùng tên)
        const donorMap = {};
        (state.currentSong.voteSkipContributors || []).forEach(c => {
            donorMap[c.name] = (donorMap[c.name] || 0) + c.amount;
        });
        const sortedDonors = Object.entries(donorMap).sort((a, b) => b[1] - a[1]);
        const contribTextHTML = sortedDonors
            .map(([name, amt]) => `<strong>${name}</strong> (${amt.toLocaleString('vi-VN')} ₫)`)
            .join(', ');
        const contribTextPlain = sortedDonors
            .map(([name, amt]) => `• ${name} (${amt.toLocaleString('vi-VN')}đ)`)
            .join('\n');

        logSystem(`🗳️ <strong>[Vote Skip Thành Công]</strong> Bài hát <strong>${state.currentSong.title}</strong> đã được vote skip thành công! Người đóng góp: ${contribTextHTML || 'Không rõ'}. Tự động skip bài!`, 'system');
        showDashboardSystemAlert("Vote Skip Thành Công 🗳️", `Quỹ vote skip bài hát đạt ${state.currentSong.voteAmount.toLocaleString('vi-VN')} ₫. Bỏ qua bài hát hiện tại.<br/>Góp phần bởi: ${contribTextHTML || 'Không rõ'}`);
        
        // Gửi thông báo Taskbar phi tập trung báo thành công kèm danh sách người góp phần
        if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            window.electronAPI.showTaskbarNotification(
                "🗳️ VOTE SKIP THÀNH CÔNG!", 
                `${state.currentSong.title}\nGóp phần bởi:\n${contribTextPlain || '• Không rõ'}`, 
                document.body.classList.contains('dark-mode'),
                8000
            );
        }

        // Cập nhật payload gửi sang overlay
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.voteAmount = state.currentSong.voteAmount;
                payload.voteSkipTarget = state.currentSong.voteSkipTarget;
                payload.voteSkipSuccess = true;
                payload.voteSkipContributors = state.currentSong.voteSkipContributors || [];
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                sendOverlayMessage('current_song', payload);
            } catch (e) {
                console.error("Lỗi cập nhật payload vote skip thành công:", e);
            }
        }

        // Gửi lệnh điều khiển thành công sang overlay
        sendControlCommand('vote_skip_success');
        
        // Cập nhật giao diện tiến trình Vote Skip trên dashboard streamer
        updateVoteSkipButtonUI();
        
        const currentSongId = state.currentSong.id;
        // Trì hoãn skip bài hát để overlay kịp hiển thị thông báo thành công và đếm ngược 15s của bài tiếp theo
        const hasNextSong = state.queue.some(s => String(s.id) !== String(currentSongId));
        const delay = hasNextSong ? 18000 : 3000;
        
        setTimeout(() => {
            if (state.currentSong && state.currentSong.id === currentSongId) {
                skipSong(false);
            }
        }, delay);
    } else {
        // Cập nhật payload gửi sang overlay
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.voteAmount = state.currentSong.voteAmount;
                payload.voteSkipTarget = state.currentSong.voteSkipTarget;
                payload.voteSkipSuccess = false;
                payload.voteSkipContributors = state.currentSong.voteSkipContributors || [];
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                sendOverlayMessage('current_song', payload);
            } catch (e) {
                console.error("Lỗi cập nhật payload vote skip:", e);
            }
        }
        
        updateVoteSkipButtonUI();
        
        logSystem(`🗳️ <strong>[Nhận Vote Skip]</strong> Lượt donate từ <strong>${donation.name}</strong> (${amount.toLocaleString('vi-VN')} ₫) được cộng dồn vào quỹ vote skip. Quỹ hiện tại: <strong>${state.currentSong.voteAmount.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} ₫</strong>.`, 'system');
        showDashboardSystemAlert("Vote Skip", `Lượt donate từ <strong>${donation.name}</strong> (${amount.toLocaleString('vi-VN')} ₫) được cộng dồn vào quỹ. Quỹ hiện tại: ${state.currentSong.voteAmount.toLocaleString('vi-VN')} ₫.`);
    }

    return true;
}

function promptVoteSkipTarget(defaultAmount, onConfirm) {
    const oldModal = document.getElementById('vote-skip-prompt-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'vote-skip-prompt-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 15000;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
    `;

    const card = document.createElement('div');
    card.className = 'dua-card';
    card.style.cssText = `
        width: 100%;
        max-width: 420px;
        background: var(--pineapple-white);
        border: 3px solid var(--pineapple-border-color);
        border-radius: 20px;
        box-shadow: 8px 8px 0px var(--pineapple-shadow);
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        box-sizing: border-box;
    `;

    const title = document.createElement('h3');
    title.className = 'dua-card-title';
    title.style.cssText = `
        margin: 0;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid var(--pineapple-border-color);
        font-family: var(--font-primary);
        font-size: 1.15rem;
        font-weight: 800;
        color: var(--pineapple-text);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    `;
    title.innerHTML = `<i class="fa-solid fa-vote-yea"></i> Thiết lập Vote Skip`;

    const desc = document.createElement('div');
    desc.style.cssText = `
        font-family: var(--font-primary);
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--pineapple-text);
        line-height: 1.4;
        opacity: 0.85;
    `;
    desc.innerText = 'Nhập số tiền mục tiêu để kích hoạt Bầu chọn bỏ qua bài hát này:';

    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dua-input';
    input.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        font-size: 1.1rem;
        font-weight: 800;
        padding: 0.6rem 1rem;
        border-radius: 12px;
        border: 2px solid var(--pineapple-border-color);
        background: var(--pineapple-white);
        color: var(--pineapple-text);
        outline: none;
        box-shadow: 2px 2px 0px var(--pineapple-shadow);
        text-align: center;
    `;
    
    function formatNumberString(val) {
        const cleanVal = val.replace(/[^0-9]/g, '');
        if (!cleanVal) return '';
        return Number(cleanVal).toLocaleString('vi-VN');
    }

    input.value = formatNumberString(String(defaultAmount));

    input.addEventListener('input', (e) => {
        const cursor = e.target.selectionStart;
        const oldLength = e.target.value.length;
        const formatted = formatNumberString(e.target.value);
        e.target.value = formatted;
        
        const newLength = formatted.length;
        e.target.setSelectionRange(cursor + (newLength - oldLength), cursor + (newLength - oldLength));
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            applyBtn.click();
        } else if (e.key === 'Escape') {
            cancelBtn.click();
        }
    });

    inputWrapper.appendChild(input);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 0.5rem;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dua-btn dua-btn-secondary';
    cancelBtn.style.cssText = `
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
        font-weight: 800;
        cursor: pointer;
    `;
    cancelBtn.innerText = 'Hủy bỏ';
    cancelBtn.onclick = () => {
        modal.remove();
    };

    const applyBtn = document.createElement('button');
    applyBtn.className = 'dua-btn';
    applyBtn.style.cssText = `
        padding: 0.5rem 1.2rem;
        font-size: 0.85rem;
        font-weight: 800;
        cursor: pointer;
        background: var(--pineapple-orange);
        border: 2px solid var(--pineapple-border-color);
        box-shadow: 2px 2px 0px var(--pineapple-shadow);
        color: white;
    `;
    applyBtn.innerText = 'Áp dụng';
    applyBtn.onclick = () => {
        const parsed = parseInt(input.value.replace(/[^0-9]/g, ''), 10) || 0;
        if (parsed <= 0) {
            alert('Vui lòng nhập số tiền lớn hơn 0!');
            return;
        }
        modal.remove();
        onConfirm(parsed);
    };

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(applyBtn);

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(inputWrapper);
    card.appendChild(buttonRow);
    modal.appendChild(card);
    document.body.appendChild(modal);

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

function finalizeVoteSkipToggle() {
    state.currentSong = state.currentSong;

    const payloadRaw = localStorage.getItem('dua_current_song');
    if (payloadRaw) {
        try {
            const payload = JSON.parse(payloadRaw);
            payload.voteSkipActive = state.currentSong.voteSkipActive;
            payload.voteAmount = state.currentSong.voteAmount;
            payload.voteSkipTarget = state.currentSong.voteSkipTarget;
            payload.voteSkipSuccess = state.currentSong.voteSkipSuccess || false;
            payload.voteSkipContributors = state.currentSong.voteSkipContributors || [];
            localStorage.setItem('dua_current_song', JSON.stringify(payload));
            sendOverlayMessage('current_song', payload);
        } catch (e) {
            console.error("Lỗi đồng bộ toggle vote skip:", e);
        }
    }

    updateVoteSkipButtonUI();
}

function toggleVoteSkip() {
    if (!state.currentSong) {
        logSystem("Không có bài hát nào đang phát để mở Vote Skip!", 'system');
        return;
    }

    if (state.currentSong.voteSkipActive) {
        state.currentSong.voteSkipActive = false;
        logSystem(`🗳️ <strong>[Tắt Vote Skip]</strong> Đã tắt tính năng vote skip cho bài hát: <strong>${state.currentSong.title}</strong>`, 'system');
        showDashboardSystemAlert("Tắt Vote Skip", `Đã tắt tính năng vote skip cho bài hát hiện tại.`);
        finalizeVoteSkipToggle();
    } else {
        let defaultTarget = 0;
        if (state.currentSong.isOwnerAdd) {
            defaultTarget = state.voteSkipDefaultAmount;
        } else {
            defaultTarget = (Number(state.currentSong.amount) || 0) + 1000;
        }
        
        promptVoteSkipTarget(defaultTarget, (parsedTarget) => {
            state.currentSong.voteSkipActive = true;
            state.currentSong.voteAmount = 0;
            state.currentSong.voteSkipTarget = parsedTarget;
            
            logSystem(`🗳️ <strong>[Mở Vote Skip]</strong> Đã bật tính năng vote skip cho bài hát: <strong>${state.currentSong.title}</strong> (Mục tiêu: ${parsedTarget.toLocaleString('vi-VN')} ₫)`, 'system');
            showDashboardSystemAlert("Mở Vote Skip", `Đã bật tính năng vote skip cho bài hát hiện tại.`);
            finalizeVoteSkipToggle();
        });
    }
}

function updateVoteSkipButtonUI() {
    const btn = document.getElementById('btn-vote-skip');
    const dashBar = document.getElementById('dash-vote-skip-bar');
    const progressText = document.getElementById('dash-vote-skip-progress-text');
    const fill = document.getElementById('dash-vote-skip-fill');

    if (!state.currentSong) {
        if (btn) btn.style.display = 'none';
        if (dashBar) dashBar.classList.remove('visible');
        const contribContainer = document.getElementById('dash-vote-skip-contributors');
        if (contribContainer) contribContainer.style.display = 'none';
        return;
    }

    if (btn) {
        btn.style.display = 'inline-flex';
        if (state.currentSong.voteSkipActive) {
            btn.classList.add('active-voteskip');
            const target = state.currentSong.voteSkipTarget || (state.currentSong.isOwnerAdd ? state.voteSkipDefaultAmount : (state.currentSong.amount || state.voteSkipDefaultAmount));
            const voteAmt = state.currentSong.voteAmount || 0;
            
            if (state.currentSong.voteSkipSuccess) {
                btn.innerHTML = `Vote skip thành công!`;
                btn.style.background = 'var(--pineapple-success, #4ADE80)';
                btn.style.color = '#1e293b';
                btn.style.borderColor = '#16a34a';
                btn.style.boxShadow = '3px 3px 0px #16a34a';
            } else {
                btn.innerHTML = `Đang Vote skip: ${formatMoneyShort(voteAmt)}/${formatMoneyShort(target)}`;
                btn.style.background = '';
                btn.style.color = '';
                btn.style.borderColor = '';
                btn.style.boxShadow = '';
            }
        } else {
            btn.classList.remove('active-voteskip');
            btn.innerHTML = `Mở Vote skip`;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.style.boxShadow = '';
        }
    }

    if (dashBar) {
        if (state.currentSong.voteSkipActive) {
            dashBar.classList.add('visible');
            const target = state.currentSong.voteSkipTarget || (state.currentSong.isOwnerAdd ? state.voteSkipDefaultAmount : (state.currentSong.amount || state.voteSkipDefaultAmount));
            const voteAmt = state.currentSong.voteAmount || 0;
            
            if (state.currentSong.voteSkipSuccess) {
                if (progressText) {
                    progressText.textContent = `VOTE SKIP THÀNH CÔNG! (${voteAmt.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNĐ)`;
                }
                if (fill) {
                    fill.style.width = '100%';
                    fill.style.background = 'var(--pineapple-success, #4ADE80)';
                }
            } else {
                if (progressText) {
                    progressText.textContent = `${voteAmt.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNĐ`;
                }
                if (fill) {
                    const pct = Math.min(100, Math.max(0, (voteAmt / target) * 100));
                    fill.style.width = `${pct}%`;
                    fill.style.background = 'linear-gradient(90deg, #FF5722, #FF8A65)';
                }
            }

            // Cập nhật danh sách người góp phần
            const contribContainer = document.getElementById('dash-vote-skip-contributors');
            const contribList = document.getElementById('dash-vote-skip-contributors-list');
            if (contribContainer && contribList) {
                const contributors = state.currentSong.voteSkipContributors || [];
                if (contributors.length > 0) {
                    const donorMap = {};
                    contributors.forEach(c => {
                        donorMap[c.name] = (donorMap[c.name] || 0) + c.amount;
                    });
                    const sortedDonors = Object.entries(donorMap).sort((a, b) => b[1] - a[1]);
                    const listText = sortedDonors
                        .map(([name, amt]) => `${name} (${amt.toLocaleString('vi-VN')}đ)`)
                        .join(', ');
                    contribList.textContent = listText;
                    contribContainer.style.display = 'block';
                } else {
                    contribContainer.style.display = 'none';
                }
            }
        } else {
            dashBar.classList.remove('visible');
            const contribContainer = document.getElementById('dash-vote-skip-contributors');
            if (contribContainer) contribContainer.style.display = 'none';
        }
    }
}

// --- SHA-256 PURE JS IMPLEMENTATION ---
function sha256(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';

    var words = [];
    var asciiLength = ascii[lengthProperty];
    
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];

    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = 1;
            }
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return; // ASCII only
        words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
    words[words[lengthProperty]] = (asciiLength * 8) | 0;
    
    var h0 = hash[0], h1 = hash[1], h2 = hash[2], h3 = hash[3], h4 = hash[4], h5 = hash[5], h6 = hash[6], h7 = hash[7];
    for (j = 0; j < words[lengthProperty]; j += 16) {
        var w = words.slice(j, j + 16);
        var oldh0 = h0, oldh1 = h1, oldh2 = h2, oldh3 = h3, oldh4 = h4, oldh5 = h5, oldh6 = h6, oldh7 = h7;
        for (i = 0; i < 64; i++) {
            if (i < 16) {
                // do nothing
            } else {
                var w15 = w[i - 15], w2 = w[i - 2];
                var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
                var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            var ch = (h4 & h5) ^ (~h4 & h6);
            var maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
            var temp1 = (h7 + (rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25)) + ch + k[i] + w[i]) | 0;
            var temp2 = ((rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22)) + maj) | 0;
            h7 = h6;
            h6 = h5;
            h5 = h4;
            h4 = (h3 + temp1) | 0;
            h3 = h2;
            h2 = h1;
            h1 = h0;
            h0 = (temp1 + temp2) | 0;
        }
        h0 = (h0 + oldh0) | 0;
        h1 = (h1 + oldh1) | 0;
        h2 = (h2 + oldh2) | 0;
        h3 = (h3 + oldh3) | 0;
        h4 = (h4 + oldh4) | 0;
        h5 = (h5 + oldh5) | 0;
        h6 = (h6 + oldh6) | 0;
        h7 = (h7 + oldh7) | 0;
    }
    
    var h = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (i = 0; i < 8; i++) {
        var hex = (h[i] >>> 0).toString(16);
        result += ('00000000' + hex).slice(-8);
    }
    return result;
}

// --- LOGIC KÍCH HOẠT MÃ THÊM LƯỢT ---
function verifyActionCode(code) {
    if (!code || typeof code !== 'string') return null;
    const parts = code.trim().toUpperCase().split('-');
    if (parts.length !== 4 || parts[0] !== 'ADD') {
        return null;
    }
    const amount = parseInt(parts[1], 10);
    const nonce = parts[2];
    const sig = parts[3];
    if (isNaN(amount) || amount <= 0 || !nonce || !sig) {
        return null;
    }
    
    const secret = 'pineapple-studio-secret-key-2026';
    const rawString = `${amount}-${nonce}-${secret}`;
    const expectedSig = sha256(rawString).substring(0, 12).toUpperCase();
    
    if (sig === expectedSig) {
        return { amount, nonce, code: code.trim().toUpperCase() };
    }
    return null;
}

function openAddActionCodeModal() {
    const modal = document.getElementById('add-action-code-modal');
    const input = document.getElementById('action-code-input');
    const errEl = document.getElementById('action-code-error');
    const successEl = document.getElementById('action-code-success');
    
    if (modal && input) {
        input.value = '';
        if (errEl) errEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';
        modal.style.display = 'flex';
        setTimeout(() => input.focus(), 50);
    }
}

function closeAddActionCodeModal() {
    const modal = document.getElementById('add-action-code-modal');
    if (modal) modal.style.display = 'none';
}

function submitActionCode() {
    const input = document.getElementById('action-code-input');
    const errEl = document.getElementById('action-code-error');
    const successEl = document.getElementById('action-code-success');
    
    if (!input) return;
    
    const code = input.value.trim();
    if (!code) {
        if (errEl) {
            errEl.textContent = 'Vui lòng nhập mã kích hoạt!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    const result = verifyActionCode(code);
    if (!result) {
        if (errEl) {
            errEl.textContent = 'Mã kích hoạt không đúng hoặc không hợp lệ!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    // Kiểm tra trùng lặp
    let usedCodes = [];
    try {
        const raw = localStorage.getItem('dua_used_codes');
        usedCodes = raw ? JSON.parse(raw) : [];
    } catch(e) {}
    
    if (usedCodes.includes(result.code)) {
        if (errEl) {
            errEl.textContent = 'Mã kích hoạt này đã được sử dụng trước đó!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    // Hợp lệ, tiến hành lưu trữ
    usedCodes.push(result.code);
    localStorage.setItem('dua_used_codes', JSON.stringify(usedCodes));
    
    let bonusActions = parseInt(localStorage.getItem('dua_bonus_actions') || '0', 10);
    if (isNaN(bonusActions) || bonusActions < 0) bonusActions = 0;
    bonusActions += result.amount;
    localStorage.setItem('dua_bonus_actions', String(bonusActions));
    
    if (errEl) errEl.style.display = 'none';
    if (successEl) {
        successEl.textContent = `Thêm thành công +${result.amount} lượt sử dụng!`;
        successEl.style.display = 'block';
    }
    
    updateRateLimitUI();
    
    // Tự động đóng modal sau 1.2s
    setTimeout(closeAddActionCodeModal, 1200);
}

function updateRateLimitUI() {
    const remainingEl = document.getElementById('rate-limit-remaining');
    const timerContainer = document.getElementById('rate-limit-replenish-container');
    const timerEl = document.getElementById('rate-limit-timer');
    
    if (!remainingEl) return;
    
    const now = Date.now();
    
    let actions = [];
    try {
        const raw = localStorage.getItem('dua_limit_actions_history');
        actions = raw ? JSON.parse(raw) : [];
    } catch (e) {}
    
    // Nếu có thao tác và thao tác đầu tiên đã cũ hơn 12h, hồi phục toàn bộ (8/8)
    if (actions.length > 0) {
        const firstActionTime = actions[0];
        if (now - firstActionTime >= 12 * 60 * 60 * 1000) {
            actions = [];
            localStorage.setItem('dua_limit_actions_history', JSON.stringify(actions));
        }
    }
    
    const remaining = Math.max(0, 8 - actions.length);
    const bonusPlayAllowed = localStorage.getItem('dua_bonus_play_allowed') === 'true';
    
    let bonusActions = parseInt(localStorage.getItem('dua_bonus_actions') || '0', 10);
    if (isNaN(bonusActions) || bonusActions < 0) {
        bonusActions = 0;
    }
    const bonusText = bonusActions > 0 ? ` (+${bonusActions})` : '';
    
    if (bonusPlayAllowed && remaining === 0) {
        remainingEl.innerHTML = `<span style="color: #15803D;">0/8 (+1 Play)</span>${bonusText}`;
    } else if (remaining === 0) {
        remainingEl.textContent = `0/8${bonusText}`;
    } else {
        remainingEl.textContent = `${remaining}/8${bonusText}`;
    }
    
    if (actions.length > 0) {
        if (timerContainer) timerContainer.style.display = 'inline';
        
        const nextReplenishTime = actions[0] + 12 * 60 * 60 * 1000;
        const timeDiff = nextReplenishTime - now;
        
        if (timeDiff > 0) {
            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
            
            const hoursStr = String(hours).padStart(2, '0');
            const minutesStr = String(minutes).padStart(2, '0');
            const secondsStr = String(seconds).padStart(2, '0');
            
            if (timerEl) {
                timerEl.textContent = `${hoursStr}:${minutesStr}:${secondsStr}`;
            }
        } else {
            // Lượt cũ đã được nạp lại
            if (timerContainer) timerContainer.style.display = 'none';
            setTimeout(updateRateLimitUI, 0);
        }
    } else {
        if (timerContainer) timerContainer.style.display = 'none';
    }
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
            const currentDur = calculateMaxDurationForSong(state.currentSong);
            syncMaxDurationToOverlay(currentDur);
        } else {
            syncMaxDurationToOverlay(0);
        }
    }
    updateBypassButtonUI();
}

let sensitiveVideosConfig = {};

async function fetchSensitiveVideosConfig() {
    const url = localStorage.getItem('dua_sensitive_videos_url') || 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json';
    if (!url) {
        sensitiveVideosConfig = {};
        return;
    }
    try {
        const cacheBusterUrl = url.trim() + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        let rawText = null;
        try {
            const proxyRes = await fetchWithCorsProxy(cacheBusterUrl);
            if (proxyRes && proxyRes.contents) {
                rawText = proxyRes.contents;
            }
        } catch (proxyErr) {
            console.warn("Dashboard: Tải qua proxy thất bại, thử tải trực tiếp:", proxyErr);
            const response = await fetch(cacheBusterUrl, { cache: 'no-store' });
            if (response.ok) {
                rawText = await response.text();
            }
        }

        if (rawText) {
            try {
                const data = JSON.parse(rawText);
                if (data && typeof data === 'object') {
                    sensitiveVideosConfig = data;
                    console.log("Dashboard: Đã tải cấu hình video nhạy cảm trực tuyến thành công:", sensitiveVideosConfig);
                }
            } catch (jsonErr) {
                console.error("Dashboard: Lỗi định dạng JSON trong file Gist:", jsonErr);
            }
        }
    } catch (e) {
        console.error("Dashboard: Lỗi kết nối khi tải cấu hình video nhạy cảm trực tuyến:", e);
    }
}

function setupDashboardPlayerLayout() {
    const playerWidget = document.querySelector('.player-widget');
    const playerLeftColumn = document.querySelector('#tab-player .left-column');
    const playerRightColumn = document.querySelector('#tab-player .right-column');
    const videoModePanel = document.getElementById('video-mode-panel');
    const videoPreviewSection = document.getElementById('video-preview-section');
    const persistentPlayerHost = document.getElementById('persistent-player-host') || document.body;

    if (playerWidget) {
        playerWidget.classList.add('mini-floating-player');
        if (playerWidget.parentElement !== persistentPlayerHost) {
            persistentPlayerHost.appendChild(playerWidget);
        }
    }

    if (videoPreviewSection && videoModePanel && videoPreviewSection.parentElement !== videoModePanel) {
        videoModePanel.appendChild(videoPreviewSection);
    }

    let videoModeBottomControls = document.getElementById('video-mode-bottom-controls');
    if (!videoModeBottomControls && videoModePanel) {
        videoModeBottomControls = document.createElement('div');
        videoModeBottomControls.id = 'video-mode-bottom-controls';
        videoModeBottomControls.className = 'video-mode-bottom-controls';
        videoModePanel.appendChild(videoModeBottomControls);
    }

    const videoToggle = document.querySelector('.video-toggle-wrapper');
    if (videoToggle && videoModeBottomControls && videoToggle.parentElement !== videoModeBottomControls) {
        videoModeBottomControls.appendChild(videoToggle);
    }

    let toolsCard = document.getElementById('dashboard-player-tools');
    if (!toolsCard && playerLeftColumn) {
        toolsCard = document.createElement('div');
        toolsCard.id = 'dashboard-player-tools';
        toolsCard.className = 'dua-card dashboard-player-tools';
        toolsCard.innerHTML = `
            <h3 class="dua-card-title">
                <i class="fa-solid fa-sliders"></i>
                Công cụ bài đang phát
            </h3>
            <div id="dashboard-player-tools-body" class="dashboard-player-tools-body"></div>
        `;
        const sensitiveWarning = document.getElementById('dash-sensitive-warning');
        playerLeftColumn.insertBefore(toolsCard, sensitiveWarning || playerLeftColumn.firstChild);
    }

    const toolsBody = document.getElementById('dashboard-player-tools-body');
    const controlsToMove = [
        document.getElementById('rate-limit-widget-mini'),
        document.getElementById('control-features-row'),
        document.getElementById('dash-live-countdown'),
        document.getElementById('dash-vote-skip-bar')
    ];
    if (toolsBody) {
        controlsToMove.forEach(el => {
            if (el && el.parentElement !== toolsBody) {
                toolsBody.appendChild(el);
            }
        });
    }

    const queueCard = document.getElementById('card-queue');
    if (queueCard && playerLeftColumn) {
        if (queueCard.parentElement !== playerLeftColumn) {
            playerLeftColumn.appendChild(queueCard);
        }
        // Luôn cố định Công cụ bài đang phát ngay phía trên Hàng đợi nhạc.
        if (toolsCard && (toolsCard.parentElement !== playerLeftColumn || toolsCard.nextElementSibling !== queueCard)) {
            playerLeftColumn.insertBefore(toolsCard, queueCard);
        }
    }

    if (playerRightColumn && !playerRightColumn.querySelector('#video-preview-section')) {
        playerRightColumn.classList.add('video-panel-detached');
    }
}

function updateMiniPlayerTitleMarquee() {
    const title = document.getElementById('current-song-title');
    if (!title) return;

    title.classList.remove('marquee');
    title.removeAttribute('data-title');

    if (!title.closest('.mini-floating-player')) return;

    requestAnimationFrame(() => {
        const titleText = title.textContent.trim();
        const availableWidth = title.parentElement?.clientWidth || title.clientWidth;
        const contentWidth = title.scrollWidth;
        if (contentWidth > availableWidth + 8) {
            title.dataset.title = titleText;
            const duration = Math.max(14, contentWidth / 22);
            title.style.setProperty('--mini-marquee-duration', `${duration.toFixed(1)}s`);
            title.classList.add('marquee');
        } else {
            title.style.removeProperty('--mini-marquee-duration');
        }
    });
}

// --- LOGIC KHỞI ĐẦU KHI TRANG LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    setupDashboardPlayerLayout();

    // Sửa lỗi mất focus bàn phím của Electron frameless window trên Windows khi click vào input
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            if (window.electronAPI && typeof window.electronAPI.focusWindow === 'function') {
                window.electronAPI.focusWindow();
            }
        }
    });

    // Khởi động giao diện giới hạn thao tác
    updateRateLimitUI();
    setInterval(updateRateLimitUI, 1000);

    // Kiểm tra và gắn class nếu chạy trên hệ điều hành Windows để dùng Titlebar Overlay
    const isWindows = navigator.userAgent.toLowerCase().includes('windows');
    if (isWindows) {
        document.body.classList.add('window-overlay-active');
    }

    // Khởi động monitor kết nối dịch vụ
    startServiceMonitorLoop();

    // Kiểm tra tự động ghim bài hát đợi quá lâu định kỳ mỗi 30 giây
    setInterval(checkAutoPinQueue, 30000);
    // Chạy kiểm tra một lần lúc khởi động sau 1.5 giây
    setTimeout(checkAutoPinQueue, 1500);

    // Sửa lỗi focus cho các ô nhập liệu (đặc biệt trong vùng titlebar no-drag của Electron trên Windows)
    document.addEventListener('mousedown', (e) => {
        const target = e.target.closest('input, textarea, select');
        if (target) {
            setTimeout(() => {
                target.focus();
            }, 15);
        }
    }, true);



    // Dọn dẹp dữ liệu hàng đợi và trạng thái bài hát cũ từ phiên trước
    localStorage.removeItem('dua_music_queue');
    localStorage.removeItem('dua_current_song');
    localStorage.removeItem('dua_overlay_state');

    // Lấy phiên bản ứng dụng động từ main process
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
        window.electronAPI.getAppVersion().then((ver) => {
            const verDisplay = document.getElementById('app-version-display');
            if (verDisplay) {
                verDisplay.textContent = `v${ver}`;
                verDisplay.style.cursor = 'pointer';
                verDisplay.title = "Phiên bản ứng dụng";

                // Click 5 lần vào phiên bản để kích hoạt tab After Credit bí mật (Easter Egg)
                let versionClicks = 0;
                verDisplay.addEventListener('click', () => {
                    versionClicks++;
                    if (versionClicks === 5) {
                        localStorage.setItem('dua_aftercredit_unlocked', 'true');
                        const afterCreditBtn = document.getElementById('menu-btn-aftercredit');
                        if (afterCreditBtn) {
                            afterCreditBtn.style.display = 'inline-flex';
                            showDashboardSystemAlert("Mở khóa bí mật", "Đã kích hoạt tab After Credit bí mật! 🎁", "BÍ MẬT");
                        }
                    }
                });
            }

            // Hiển thị nút tab After Credit nếu đã được mở khóa trước đó
            if (localStorage.getItem('dua_aftercredit_unlocked') === 'true') {
                const afterCreditBtn = document.getElementById('menu-btn-aftercredit');
                if (afterCreditBtn) {
                    afterCreditBtn.style.display = 'inline-flex';
                }
            }

            // Bổ sung hiển thị changelog lần đầu sau khi nâng cấp phiên bản mới
            const lastSeenVersion = localStorage.getItem('dua_last_seen_version');
            if (lastSeenVersion !== ver) {
                // Chuyển mặc định sang theme flex khi nâng cấp lên phiên bản mới hoặc cài mới
                localStorage.setItem('dua_theme', 'flex');
                state.theme = 'flex';
                const themeSelect = document.getElementById('obs-theme-select');
                if (themeSelect) {
                    themeSelect.value = 'flex';
                }
                updateObsUrlDisplay();
                sendOverlayMessage('theme_change', { theme: 'flex' });

                loadChangelogForVersion(ver).then((markdownText) => {
                    const htmlContent = convertChangelogMarkdownToHtml(markdownText);
                    showChangelogModal(ver, htmlContent);
                });
            }
            localStorage.setItem('dua_last_seen_version', ver);
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
        updateRangeProgress(volSlider, state.volume);
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
                sendOverlayMessage('sb_categories', sponsorBlockCategories);
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
        
        // Cập nhật theme xem trước ban đầu
        const previewIframe = document.getElementById('theme-preview-iframe');
        if (previewIframe) {
            previewIframe.src = `overlay.html?preview=true&theme=${state.theme}`;
        }
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
                sendOverlayMessage('empty_queue_message', { text: val });
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
                sendOverlayMessage('alert_action_text', { text: val });
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

    // Thiết lập input lời hiển thị khi bật chế độ Tập trung và nút áp dụng
    const focusMsgInput = document.getElementById('overlay-focus-msg-input');
    const focusMsgApplyBtn = document.getElementById('btn-overlay-focus-msg-apply');
    const focusMsgCounter = document.getElementById('overlay-focus-msg-counter');
    if (focusMsgInput) {
        focusMsgInput.value = state.focusModeMessage;
        
        const updateFocusCounter = () => {
            if (focusMsgCounter) {
                const len = focusMsgInput.value.length;
                focusMsgCounter.textContent = `${len}/50`;
                if (len >= 50) {
                    focusMsgCounter.style.color = '#EF4444';
                    focusMsgInput.style.borderColor = '#EF4444';
                } else {
                    focusMsgCounter.style.color = '';
                    focusMsgInput.style.borderColor = '';
                }
            }
        };

        focusMsgInput.addEventListener('input', updateFocusCounter);
        updateFocusCounter();

        if (focusMsgApplyBtn) {
            focusMsgApplyBtn.addEventListener('click', () => {
                let val = focusMsgInput.value || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng';
                if (val.length > 50) {
                    val = val.substring(0, 50);
                }
                state.focusModeMessage = val;
                localStorage.setItem('dua_focus_mode_message', val);
                sendOverlayMessage('focus_mode_message', { text: val });
                logSystem(`Đã lưu và đồng bộ lời hiển thị Tập trung: "<strong>${val}</strong>"`, 'system');
                
                // Phản hồi trực quan trên nút
                focusMsgApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    focusMsgApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
                
                alert("Đã áp dụng và đồng bộ lời hiển thị Tập trung mới lên OBS Overlay!");
            });
        }
    }

    const hideEmptyToggle = document.getElementById('hide-empty-overlay-toggle');
    if (hideEmptyToggle) {
        hideEmptyToggle.checked = state.hideEmptyOverlay;
        hideEmptyToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            state.hideEmptyOverlay = isChecked;
            localStorage.setItem('dua_hide_empty_overlay', isChecked);
            sendOverlayMessage('hide_empty_overlay', { value: isChecked });
            logSystem(`Đã cấu hình ${isChecked ? 'Ẩn' : 'Hiện'} overlay khi không có nhạc.`);
        });
    }

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
                sendOverlayMessage('sensitive_videos_url', { url: val });
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

    // Thiết lập cấu hình Hỗ trợ phát nhạc bản quyền (yt-bypass-select và yt-dlp check)
    const ytBypassSelect = document.getElementById('yt-bypass-select');
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

    if (ytBypassSelect) {
        // Đọc cấu hình chế độ bypass YouTube (mặc định: auto)
        let activeBypassMode = localStorage.getItem('dua_yt_bypass_mode');
        if (!activeBypassMode) {
            // Khớp/Ánh xạ từ cấu hình legacy cũ nếu có
            const oldBypass = localStorage.getItem('dua_yt_bypass_enabled');
            if (oldBypass === 'false') {
                activeBypassMode = 'never';
            } else {
                activeBypassMode = 'auto';
            }
            localStorage.setItem('dua_yt_bypass_mode', activeBypassMode);
        }
        ytBypassSelect.value = activeBypassMode;
        
        ytBypassSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            localStorage.setItem('dua_yt_bypass_mode', mode);
            
            // Đồng bộ legacy key cho các thành phần cũ
            localStorage.setItem('dua_yt_bypass_enabled', mode === 'never' ? 'false' : 'true');
            
            let logMsg = '';
            if (mode === 'never') logMsg = 'Không bao giờ (chỉ dùng Iframe)';
            else if (mode === 'always') logMsg = 'Luôn luôn (Luôn dùng DirectStream)';
            else logMsg = 'Tự động sử dụng luồng dự phòng DirectStream khi Iframe lỗi';

            logSystem(`🔧 <strong>[Bản quyền]</strong> Chuyển chế độ phát YouTube thành: <strong>${logMsg}</strong>.`, 'system');
            showDashboardSystemAlert("Phát nhạc bản quyền", `Đã chuyển chế độ sang: ${mode.toUpperCase()}`);
            
            // Gửi cấu hình sang Overlay qua WebSocket
            sendOverlayMessage('bypass_mode_change', { mode: mode });
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
                            sendOverlayMessage('current_song', payload);
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
                        sendOverlayMessage('current_song', payload);
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
                                sendOverlayMessage('current_song', payload);
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

        // Thiết lập cấu hình Tự động ghim bài hát đợi lâu
        const autoPinToggle = document.getElementById('auto-pin-toggle');
        const autoPinMinutesInput = document.getElementById('auto-pin-minutes-input');
        const autoPinFormGroup = document.getElementById('auto-pin-form-group');
        const autoPinApplyBtn = document.getElementById('btn-auto-pin-apply');

        function updateAutoPinUI() {
            if (!autoPinToggle || !autoPinFormGroup) return;
            if (!state.autoPinEnabled) {
                autoPinFormGroup.style.display = 'none';
            } else {
                autoPinFormGroup.style.display = 'flex';
            }
        }

        if (autoPinToggle && autoPinMinutesInput && autoPinFormGroup && autoPinApplyBtn) {
            autoPinToggle.checked = state.autoPinEnabled;
            autoPinMinutesInput.value = state.autoPinWaitTime;

            updateAutoPinUI();

            autoPinToggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                state.autoPinEnabled = isChecked;
                localStorage.setItem('dua_auto_pin_enabled', isChecked ? 'true' : 'false');
                updateAutoPinUI();
                logSystem(`Cập nhật chế độ tự động ghim bài hát đợi lâu: ${isChecked ? 'BẬT' : 'TẤT'}`, 'system');
                showDashboardSystemAlert("Tự động ghim bài hát", `Cập nhật chế độ tự động ghim bài hát đợi lâu: ${isChecked ? 'BẬT' : 'TẤT'}`);
                
                if (typeof checkAutoPinQueue === 'function') {
                    checkAutoPinQueue();
                }
            });

            autoPinApplyBtn.addEventListener('click', () => {
                const minutes = parseInt(autoPinMinutesInput.value) || 60;
                state.autoPinWaitTime = minutes;
                localStorage.setItem('dua_auto_pin_wait_time', minutes);

                logSystem(`Đã áp dụng cấu hình tự động ghim: đợi quá <strong>${minutes} phút</strong>`, 'system');
                showDashboardSystemAlert("Tự động ghim bài hát", `Đã áp dụng cấu hình tự động ghim: đợi quá <strong>${minutes} phút</strong>`);

                if (typeof checkAutoPinQueue === 'function') {
                    checkAutoPinQueue();
                }

                autoPinApplyBtn.style.background = 'var(--pineapple-success)';
                setTimeout(() => {
                    autoPinApplyBtn.style.background = 'var(--pineapple-yellow)';
                }, 800);
            });
        }
    }

    // Tải cấu hình ZyPage từ AppData nếu chạy trong Electron HTTP server
    loadConfigFromAppData();

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

    // Hiển thị hàng đợi
    renderQueue();
    // Khởi tạo trạng thái bài đầu tiên chờ phát
    initQueue();
    // Đồng bộ UI nút Test Mode từ localStorage
    updateTestModeUI();

    // Khởi tạo giới hạn click chung
    updateGlobalLimitUI();
    setInterval(updateGlobalLimitUI, 1000);

    const focusModeSwitch = document.getElementById('focus-mode-toggle-switch');
    if (focusModeSwitch) {
        focusModeSwitch.checked = state.focusMode;
    }
    applyDashboardFocusModeState(state.focusMode);

    const luckyModeSwitch = document.getElementById('lucky-mode-toggle-switch');
    if (luckyModeSwitch) {
        luckyModeSwitch.checked = state.luckyMode;
    }

    // Cấu hình hiển thị ô nhúng OBS và khởi tạo MQTT
    updateObsUrlDisplay();
    initOverlayConnection();

    // Thiết lập sự kiện tìm kiếm YouTube trên ô thêm nhanh
    const urlInput = document.getElementById('donor-url');
    const searchResultsContainer = document.getElementById('quick-add-search-results');
    const clearBtn = document.getElementById('search-clear-btn');
    
    if (urlInput && searchResultsContainer) {
        searchTimeout = null;
        
        urlInput.addEventListener('input', () => {
            const query = urlInput.value.trim();
            if (clearBtn) {
                clearBtn.style.display = query ? 'flex' : 'none';
            }
            if (searchTimeout) clearTimeout(searchTimeout);
            
            const isUrl = query.startsWith('http://') || query.startsWith('https://') || query.startsWith('spotify:');
            
            if (isUrl || query.length < 2) {
                searchResultsContainer.style.display = 'none';
                return;
            }
            
            searchResultsContainer.style.display = 'flex';
            const keywordMatches = findKeywordSuggestions(query);
            if (keywordMatches.length > 0) {
                renderSearchResults(keywordMatches.map(keywordShortcutToVideo), 'quick-add-search-results');
            }
            
            // Trì hoãn 350ms để tăng tốc độ phản hồi tìm kiếm (debounce)
            searchTimeout = setTimeout(async () => {
                if (keywordMatches.length === 0) {
                    searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tìm kiếm trên YouTube...</div>';
                }
                
                try {
                    const result = await callYouTubeSearch(query);
                    
                    // Kiểm tra nếu giá trị hiện tại trong ô tìm kiếm đã thay đổi trong khi đang tải, hủy hiển thị kết quả cũ
                    if (urlInput.value.trim() !== query) {
                        return;
                    }

                    if (result && result.aborted) {
                        return; // Bỏ qua nếu request này bị hủy bởi request mới hơn
                    }
                    if (result && result.success && result.videos && result.videos.length > 0) {
                        renderSearchResults(prioritizeKeywordVideo(query, result.videos), 'quick-add-search-results');
                    } else if (keywordMatches.length > 0) {
                        renderSearchResults(keywordMatches.map(keywordShortcutToVideo), 'quick-add-search-results');
                    } else if (result && result.error) {
                        searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result.error}</div>`;
                    } else {
                        searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Không tìm thấy kết quả phù hợp!</div>';
                    }
                } catch (e) {
                    if (urlInput.value.trim() === query) {
                        searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng!</div>`;
                    }
                }
            }, 350);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                clearQuickSearch();
            });
        }

        // Ẩn bảng kết quả khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (!urlInput.contains(e.target) && !searchResultsContainer.contains(e.target) && (!clearBtn || !clearBtn.contains(e.target))) {
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

    setupKeywordSettings();
    renderKeywordLibrary();



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
    
    // Thiết lập Popover cho Quick Add trên Titlebar
    const donorUrlInput = document.getElementById('donor-url');
    const quickAddPopover = document.getElementById('quick-add-popover');
    const quickAddForm = document.getElementById('quick-add-form');
    const quickAddSearchWrapper = quickAddForm ? quickAddForm.querySelector('.search-input-wrapper') : null;

    if (donorUrlInput && quickAddPopover) {
        const openQuickAddPopover = () => {
            const notificationDropdown = document.getElementById('notification-center-dropdown');
            if (notificationDropdown) notificationDropdown.classList.remove('visible');
            quickAddPopover.classList.add('visible');
            donorUrlInput.setAttribute('aria-expanded', 'true');
        };

        const focusQuickAddInput = (event) => {
            if (event && event.target && event.target.closest('#search-clear-btn')) return;
            if (window.electronAPI && typeof window.electronAPI.focusWindow === 'function') {
                window.electronAPI.focusWindow();
            }
            openQuickAddPopover();
            if (!event || event.target !== donorUrlInput) {
                if (event) event.preventDefault();
                requestAnimationFrame(() => donorUrlInput.focus({ preventScroll: true }));
            }
        };

        // Toàn bộ khung search đều có thể click để nhập, không chỉ riêng phần chữ.
        if (quickAddSearchWrapper) {
            quickAddSearchWrapper.addEventListener('mousedown', focusQuickAddInput);
            quickAddSearchWrapper.addEventListener('click', focusQuickAddInput);
        }

        // Hiển thị popover khi focus vào ô tìm kiếm/nhập link
        donorUrlInput.addEventListener('focus', () => {
            openQuickAddPopover();
        });

        // Ẩn popover khi click ra ngoài form
        document.addEventListener('click', (e) => {
            if (quickAddForm && !quickAddForm.contains(e.target)) {
                quickAddPopover.classList.remove('visible');
                donorUrlInput.setAttribute('aria-expanded', 'false');
            }
        });

        // Đóng popover khi bấm nút Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                quickAddPopover.classList.remove('visible');
                donorUrlInput.setAttribute('aria-expanded', 'false');
                donorUrlInput.blur();
            }
        });
    }

    // Các phím tắt điều khiển giống YouTube khi không nhập liệu
    document.addEventListener('keydown', (e) => {
        // Không kích hoạt phím tắt khi dùng tổ hợp phím hệ thống (Ctrl, Alt, Windows/Command)
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }

        // Không kích hoạt phím tắt khi người dùng đang nhập liệu trong ô input, textarea, select hoặc contentEditable
        const activeEl = document.activeElement;
        if (activeEl) {
            const tag = activeEl.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) {
                return;
            }
        }

        const key = e.key.toLowerCase();

        // Khóa các phím tắt phát/tạm dừng và tua khi đang phát bài hát đợi lâu
        if (state.currentSong && state.currentSong.isAutoPinned) {
            if (key === ' ' || key === 'k' || e.key === 'ArrowLeft' || key === 'j' || e.key === 'ArrowRight' || key === 'l' || (e.key >= '0' && e.key <= '9')) {
                e.preventDefault();
                return;
            }
        }

        // 1. Phát / Tạm dừng: Space hoặc K
        if (key === ' ' || key === 'k') {
            e.preventDefault(); // Tránh cuộn trang đối với phím Space
            togglePlayPause();
            return;
        }

        // 2. Tắt / Bật tiếng: M
        if (key === 'm') {
            e.preventDefault();
            toggleMute();
            return;
        }

        // 3. Tăng âm lượng: Mũi tên Lên (Up Arrow)
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (state.focusMode) return;
            const newVol = Math.min(100, state.volume + 5);
            const slider = document.getElementById('volume-slider');
            if (slider) slider.value = newVol;
            onVolumeChange(newVol);
            return;
        }

        // 4. Giảm âm lượng: Mũi tên Xuống (Down Arrow)
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (state.focusMode) return;
            const newVol = Math.max(0, state.volume - 5);
            const slider = document.getElementById('volume-slider');
            if (slider) slider.value = newVol;
            onVolumeChange(newVol);
            return;
        }

        // 5. Tua lùi: Mũi tên Trái (5s) hoặc J (10s)
        if (e.key === 'ArrowLeft' || key === 'j') {
            e.preventDefault();
            if (state.focusMode) return;
            let startPoint = 0;
            if (state.currentSong) {
                startPoint = state.currentSong.start || 0;
            }
            const maxDur = (currentOverlayDuration > 0) ? currentOverlayDuration : (state.currentSong ? (state.currentSong.duration || 0) : 0);
            const delta = (e.key === 'ArrowLeft') ? -5 : -10;
            let targetTime = (state.lastReportedTime || 0) + delta;
            if (targetTime < startPoint) {
                targetTime = startPoint;
            }
            if (maxDur > 0 && targetTime > startPoint + maxDur) {
                targetTime = startPoint + maxDur;
            }
            attemptGlobalAction('seek', () => {
                sendControlCommand('seek', targetTime);
                logSystem(`[Phím tắt] Tua lùi tới: <strong>${formatTime(targetTime - startPoint)}</strong>`, 'system');
            });
            return;
        }

        // 6. Tua tới: Mũi tên Phải (5s) hoặc L (10s)
        if (e.key === 'ArrowRight' || key === 'l') {
            e.preventDefault();
            if (state.focusMode) return;
            let startPoint = 0;
            if (state.currentSong) {
                startPoint = state.currentSong.start || 0;
            }
            const maxDur = (currentOverlayDuration > 0) ? currentOverlayDuration : (state.currentSong ? (state.currentSong.duration || 0) : 0);
            const delta = (e.key === 'ArrowRight') ? 5 : 10;
            let targetTime = (state.lastReportedTime || 0) + delta;
            if (targetTime < startPoint) {
                targetTime = startPoint;
            }
            if (maxDur > 0 && targetTime > startPoint + maxDur) {
                targetTime = startPoint + maxDur;
            }
            attemptGlobalAction('seek', () => {
                sendControlCommand('seek', targetTime);
                logSystem(`[Phím tắt] Tua tới: <strong>${formatTime(targetTime - startPoint)}</strong>`, 'system');
            });
            return;
        }

        // 7. Tua theo phần trăm: Các phím từ 0 đến 9
        if (e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            if (state.focusMode) return;
            const digit = parseInt(e.key);
            const targetPct = digit * 10;
            let startPoint = 0;
            if (state.currentSong) {
                startPoint = state.currentSong.start || 0;
            }
            const maxDur = (currentOverlayDuration > 0) ? currentOverlayDuration : (state.currentSong ? (state.currentSong.duration || 0) : 0);
            if (maxDur > 0) {
                const targetTime = startPoint + (targetPct / 100) * maxDur;
                attemptGlobalAction('seek', () => {
                    sendControlCommand('seek', targetTime);
                    logSystem(`[Phím tắt] Tua nhanh tới ${targetPct}%: <strong>${formatTime(targetTime - startPoint)}</strong>`, 'system');
                });
            }
            return;
        }
    });

    // Khôi phục trạng thái kết nối YouTube
    checkYoutubeAuth();



    // Render danh sách lịch sử lời nhắn donate
    migrateDonationHistoryToSqlite().then(() => {
        renderDonationHistory();
    });

    setTimeout(() => {
        const loadingScreen = document.getElementById('app-loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 800); // Khớp với thời gian transition opacity 0.8s trong CSS
        }
    }, 5000); // Tăng thời gian hiển thị lên 5 giây (theo yêu cầu)
    // Khởi tạo lịch sử thông báo
    if (typeof loadNotificationsHistory === 'function') {
        loadNotificationsHistory();
    }

    // Click bên ngoài để đóng dropdown thông báo
    document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.notification-center-wrapper');
        const dropdown = document.getElementById('notification-center-dropdown');
        if (wrapper && dropdown && dropdown.classList.contains('visible') && !wrapper.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });

    // Click bên ngoài để đóng modal chi tiết donate
    const donationDetailModal = document.getElementById('donation-detail-modal');
    if (donationDetailModal) {
        donationDetailModal.addEventListener('click', (e) => {
            if (e.target === donationDetailModal) {
                closeDonationDetailModal();
            }
        });
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
    } else if (type === 'error') {
        tagText = 'Lỗi';
        tagClass = 'log-tag-error';
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
    
    // Đã loại bỏ tự động cuộn (auto scroll) theo yêu cầu người dùng
    
    // Ghi log ra file ngoài .txt thông qua IPC (Đã tắt theo yêu cầu người dùng để tránh nặng máy)
    /*
    if (window.electronAPI && typeof window.electronAPI.saveLogEntry === 'function') {
        const cleanMessage = message.replace(/<\/?[^>]+(>|$)/g, "").replace(/&nbsp;/g, " ");
        window.electronAPI.saveLogEntry(`[${tagText}] ${cleanMessage}`);
    }
    */
}

// Hàm mở file log hoạt động bên ngoài ứng dụng
async function openExternalLogFile() {
    if (window.electronAPI && typeof window.electronAPI.openLogFile === 'function') {
        try {
            const result = await window.electronAPI.openLogFile();
            if (!result.success) {
                logSystem(`Không thể mở file log: ${result.error}`, 'error');
            }
        } catch (err) {
            logSystem(`Lỗi khi mở file log: ${err.message}`, 'error');
        }
    } else {
        alert("Tính năng này chỉ hỗ trợ khi chạy trên ứng dụng Introvert Player Desktop.");
    }
}

// --- HÀM XỬ LÝ LỖI PHÁT NHẠC (NHÚNG BỊ CHẶN) ---
function handlePlayerError(code, title) {
    let errorDescription = "Lỗi chưa xác định";
    if (code === 101 || code === 150) {
        errorDescription = "Hãng đĩa sở hữu đã chặn tính năng phát nhúng (Embedding Disabled) của video này trên các trang web/ứng dụng ngoài.";
    } else if (code === 2) {
        errorDescription = "ID video YouTube không hợp lệ.";
    } else if (code === 100) {
        errorDescription = "Video không tồn tại hoặc đã bị xóa / chuyển sang chế độ riêng tư.";
    } else if (code === 5) {
        errorDescription = "Không thể phát video này trong trình phát HTML5.";
    }

    const fullMsg = `Bài hát: <strong>${title}</strong> gặp sự cố phát.<br><br>
        <span style="color: var(--pineapple-orange-dark); font-weight: 800;"><i class="fa-solid fa-triangle-exclamation"></i> Chi tiết:</span> ${errorDescription}<br><br>
        <em>Hệ thống đã tự động bỏ qua để phát bài tiếp theo. Hãy chọn bản nhạc khác thay thế (ví dụ: bản Vietsub, Lyric do fan đăng tải).</em>`;

    // Hiển thị thông báo màu đỏ/cam trên Dashboard
    showDashboardSystemAlert("Lỗi trình phát", fullMsg, "LỖI PHÁT NHẠC");
    logSystem(`Lỗi phát bài "${title}" (Mã lỗi: ${code}). Chi tiết: ${errorDescription}`, "error");
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

// --- THÊM BÀI HÁT NHANH BẰNG LINK ---
async function handleQuickAddSubmit(event) {
    event.preventDefault();
    if (state.focusMode) return;

    const urlInput = document.getElementById('donor-url');
    if (!urlInput) return;

    let url = urlInput.value.trim();
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
    
    const isUrl = url.startsWith('http://') || url.startsWith('https://');
    if (!isUrl) {
        const keywordMatch = findKeywordShortcut(url);
        if (keywordMatch) {
            addSearchResultToQueue(keywordShortcutToVideo(keywordMatch));
            return;
        }

        const searchResultsContainer = document.getElementById('quick-add-search-results');
        if (searchResultsContainer && searchResultsContainer.style.display !== 'none' && searchResultsContainer.dataset.query === url) {
            const firstItem = searchResultsContainer.querySelector('.search-result-item');
            if (firstItem) {
                firstItem.click();
            }
            return;
        }
        if (searchResultsContainer) {
            searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tìm kiếm trên YouTube...</div>';
            searchResultsContainer.style.display = 'flex';
            
            try {
                const result = await callYouTubeSearch(url);
                if (result && result.success && result.videos && result.videos.length > 0) {
                    const prioritizedVideos = prioritizeKeywordVideo(url, result.videos);
                    renderSearchResults(prioritizedVideos, 'quick-add-search-results');
                    addSearchResultToQueue(prioritizedVideos[0]);
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
        const donorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Em Dứa";

        const amountInput = document.getElementById('quick-donor-amount');
        const donorAmount = (amountInput && amountInput.value.trim() !== '') ? Number(amountInput.value) : 100000000;

        const ownerAddCheckbox = document.getElementById('quick-owner-add');
        const isOwnerAdd = ownerAddCheckbox ? ownerAddCheckbox.checked : false;

        const newSong = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            type: type,
            videoId: videoId,
            
            soundcloudUrl: soundcloudUrl,
            title: title,
            thumbnail: thumbnail,
            donorName: donorName,
            amount: donorAmount,
            message: "",
            start: 0,
            end: null,
            timestamp: Date.now(),
            localAddedAt: Date.now(),
            isOwnerAdd: isOwnerAdd,
            isQuickAdd: !isOwnerAdd
        };

        insertSongSmartly(newSong);
        broadcastNewDonationAlert(newSong);
        saveQueue();
        sortAndRefreshQueue();
        
        logSystem(`Đã thêm nhanh bài hát: <strong>${title}</strong> (${type.toUpperCase()})`, 'queue');
        if (!isOwnerAdd) {
            showDashboardSystemAlert("Đã thêm nhạc nhanh", `Đã thêm nhanh bài hát: <strong>${title}</strong>`, 'HÀNG ĐỢI');
        }
        
        clearQuickSearch();
        if (nameInput) nameInput.value = '';
        if (amountInput) amountInput.value = '';

        // Ẩn popover thêm nhanh
        const quickAddPopover = document.getElementById('quick-add-popover');
        if (quickAddPopover) quickAddPopover.classList.remove('visible');

        if (!state.currentSong && !state.focusMode) {
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
    
    // Nếu là chủ kênh thêm nhạc, phát thông báo "Đã thêm nhạc" riêng thay vì alert donate
    if (song.isOwnerAdd) {
        const ownerAlertPayload = {
            id: song.id,
            title: song.title,
            thumbnail: song.thumbnail || '',
            type: song.type || 'youtube',
            videoId: song.videoId || '',
            timestamp: Date.now() + Math.random()
        };
        localStorage.setItem('dua_owner_add_alert', JSON.stringify(ownerAlertPayload));
        sendOverlayMessage('owner_add_alert', ownerAlertPayload);
        
        // Hiển thị thông báo trên Dashboard
        showDashboardOwnerAddToast(song);
        
        // Thông báo taskbar phi tập trung (không cướp focus)
        if (!song.isExtensionAdd && window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            window.electronAPI.showTaskbarNotification(
                'Đã thêm bài hát mới',
                song.title || 'Bài hát không rõ tên',
                document.body.classList.contains('dark-mode'),
                3000
            );
        }
        return;
    }

    if (song.isQuickAdd) {
        // Thông báo taskbar phi tập trung (không cướp focus) cho nhạc thêm nhanh
        if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            window.electronAPI.showTaskbarNotification(
                'Thêm nhanh từ app',
                song.title || 'Bài hát không rõ tên',
                document.body.classList.contains('dark-mode'),
                3000
            );
        }
        // Nhạc thêm nhanh có thông báo xác nhận riêng từ nơi gọi.
        // Không phát thêm popup donate giả khiến hai thông báo chồng nhau.
        return;
    } else {
        // Đây là nhạc order từ donate (ZyPage hoặc Test)
        if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            const title = `${song.donorName || 'Khách'} - ${(song.amount || 0).toLocaleString('vi-VN')} ₫`;
            
            // Lọc bỏ URL trong tin nhắn để hiển thị sạch sẽ
            let cleanMsg = '';
            if (song.message) {
                const urlRegex = /https?:\/\/[^\s<>"']+/gi;
                cleanMsg = song.message.replace(urlRegex, '').trim();
            }
            
            const msgText = cleanMsg ? `${song.title || 'Bài hát không rõ tên'}\n${cleanMsg}` : (song.title || 'Bài hát không rõ tên');
            
            window.electronAPI.showTaskbarNotification(
                title,
                msgText,
                document.body.classList.contains('dark-mode')
            );
        }
    }
    
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
        thumbnail: song.thumbnail || '',
        type: song.type || '',
        videoId: song.videoId || '',
        timestamp: Date.now() + Math.random() // Tránh trùng lặp sự kiện storage
    };
    
    localStorage.setItem('dua_new_donation_alert', JSON.stringify(alertPayload));
    
    // Hiển thị thông báo trên Dashboard
    showDashboardNewDonationAlert(alertPayload);
    
    // MQTT broadcast
    sendOverlayMessage('new_donation_alert', alertPayload);
}

// --- LƯU TRỮ HÀNG ĐỢI VÀO LOCALSTORAGE ---
function saveQueue() {
    localStorage.setItem('dua_queue', JSON.stringify(state.queue));
    sendOverlayMessage('queue_change', state.queue);
}

// --- KIỂM TRA TỰ ĐỘNG GHIM BÀI HÁT ĐỢI QUÁ LÂU ---
function checkAutoPinQueue(skipRefresh = false) {
    if (!state.autoPinEnabled) return;
    
    const limitMs = state.autoPinWaitTime * 60 * 1000;
    const now = Date.now();
    let hasChanges = false;
    
    state.queue.forEach(song => {
        // Không áp dụng cho bài đang phát
        if (state.currentSong && String(song.id) === String(state.currentSong.id)) {
            return;
        }
        
        // Không áp dụng nếu bài đó đã ghim
        if (song.isPinned) {
            return;
        }
        
        const addedTime = song.localAddedAt || song.timestamp || now;
        const waitingDuration = now - addedTime;
        if (waitingDuration > limitMs) {
            song.isPinned = true;
            song.isAutoPinned = true;
            hasChanges = true;
            logSystem(`Bài hát "<strong>${song.title}</strong>" đã đợi quá ${state.autoPinWaitTime} phút. Tự động ghim lên đầu!`, 'system');
            showDashboardSystemAlert("Tự động ghim bài hát", `Tự động ghim bài hát: <strong>${song.title}</strong> do đợi lâu`);
        }
    });
    
    if (hasChanges && !skipRefresh) {
        saveQueue();
        sortAndRefreshQueue(true);
    }
}
window.checkAutoPinQueue = checkAutoPinQueue;

// --- SẮP XẾP VÀ VẼ LẠI HÀNG ĐỢI ---
function sortAndRefreshQueue(forceSort = false) {
    // Tự động ghim bài hát đợi quá lâu trước khi sắp xếp hàng đợi
    checkAutoPinQueue(true);

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
                // Ghim cuối (isPinnedBottom) luôn ở đáy hàng đợi
                if (a.isPinnedBottom && !b.isPinnedBottom) return 1;
                if (!a.isPinnedBottom && b.isPinnedBottom) return -1;
                
                // Nếu cả hai đều ghim cuối: sắp xếp theo thứ tự bấm trước sau (pinnedBottomTime)
                if (a.isPinnedBottom && b.isPinnedBottom) {
                    return (a.pinnedBottomTime || 0) - (b.pinnedBottomTime || 0);
                }

                // Ưu tiên bài hát đã ghim (isPinned)
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                
                if (b.amount !== a.amount) {
                    return b.amount - a.amount;
                }
                return a.timestamp - b.timestamp;
            });
        } else if (state.sortConfig === 'time') {
            otherSongs.sort((a, b) => {
                // Ghim cuối (isPinnedBottom) luôn ở đáy hàng đợi
                if (a.isPinnedBottom && !b.isPinnedBottom) return 1;
                if (!a.isPinnedBottom && b.isPinnedBottom) return -1;
                
                // Nếu cả hai đều ghim cuối: sắp xếp theo thứ tự bấm trước sau (pinnedBottomTime)
                if (a.isPinnedBottom && b.isPinnedBottom) {
                    return (a.pinnedBottomTime || 0) - (b.pinnedBottomTime || 0);
                }

                // Ưu tiên bài hát đã ghim (isPinned)
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                
                return a.timestamp - b.timestamp;
            });
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
        updateNextSongInCurrentPayload();
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
                        if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                            updatePlayerUI(state.currentSong);
                        }
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
                        if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                            updatePlayerUI(state.currentSong);
                        }
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
    const queueViews = [
        {
            container: document.getElementById('queue-list-container'),
            count: document.getElementById('queue-count'),
            sortSelect: document.getElementById('queue-sort-select')
        },
        {
            container: document.getElementById('queue-list-container-video'),
            count: document.getElementById('queue-count-video'),
            sortSelect: document.getElementById('queue-sort-select-video')
        }
    ].filter(view => view.container);

    if (queueViews.length === 0) return;

    queueViews.forEach(view => {
        if (view.count) view.count.textContent = state.queue.length;
        if (view.sortSelect && view.sortSelect.value !== state.sortConfig) {
            view.sortSelect.value = state.sortConfig;
        }
    });

    if (state.queue.length === 0) {
        queueViews.forEach(view => {
            view.container.innerHTML = '<div class="empty-queue-notice">Hàng đợi đang trống. Hãy dán link YouTube bài hát đầu tiên!</div>';
        });
        return;
    }

    // Bài đang phát luôn được ghim lên đầu hàng đợi
    const sortedQueue = state.currentSong
        ? [
            ...state.queue.filter(s => String(s.id) === String(state.currentSong.id)),
            ...state.queue.filter(s => String(s.id) !== String(state.currentSong.id))
          ]
        : state.queue;

    const queueHtml = sortedQueue.map((song, index) => {
        if ((song.type === 'youtube' || song.type === 'soundcloud') && !song.duration) {
            resolveSongDuration(song);
        }
        const isCurrent = state.currentSong && String(state.currentSong.id) === String(song.id);
        const isNew = song.localAddedAt && (Date.now() - song.localAddedAt < 10000);
        const item = document.createElement('div');
        item.className = `queue-item ${isCurrent ? 'playing-now' : ''} ${(!isCurrent && isNew) ? 'newly-added' : ''}`;
        
        let sourceBadgeHTML = '';
        if (song.type === 'soundcloud') {
            sourceBadgeHTML = ` <span class="source-badge soundcloud" style="background: #FF5500; color: #fff; padding: 0.15rem 0.35rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; margin-left: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; vertical-align: middle;"><i class="fa-brands fa-soundcloud"></i> SoundCloud</span>`;
        }

        let autoPinBadgeHTML = '';
        if (song.isAutoPinned) {
            autoPinBadgeHTML = ` <span class="auto-pin-badge" style="background: var(--pineapple-orange); color: #fff; padding: 0.15rem 0.35rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; margin-left: 0.4rem; display: inline-flex; align-items: center; gap: 0.2rem; vertical-align: middle;" title="Đã tự động ghim do đợi lâu (> ${state.autoPinWaitTime} phút)"><i class="fa-solid fa-clock"></i> Đợi lâu</span>`;
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
                    ${song.isPinned ? `<i class="fa-solid fa-thumbtack pinned-title-icon" style="color: var(--pineapple-orange-dark); margin-right: 0.35rem; transform: rotate(45deg); display: inline-block; vertical-align: middle;"></i>` : ''}
                    ${song.isPinnedBottom ? `<i class="fa-solid fa-thumbtack pinned-title-icon" style="color: var(--pineapple-orange-dark); margin-right: 0.35rem; transform: rotate(180deg); display: inline-block; vertical-align: middle;"></i>` : ''}
                    ${song.title}${sourceBadgeHTML}${autoPinBadgeHTML}
                </div>
                <!-- Hàng 2: Thông tin người ủng hộ + thời gian + nút chức năng -->
                <div class="queue-item-row2">
                    <div class="queue-item-donor">
                        ${song.isOwnerAdd ? `
                            <span class="owner-add-badge"><i class="fa-solid fa-user-shield"></i> Chủ kênh thêm</span>
                        ` : `
                            ${song.donorName}
                            <span style="color: var(--pineapple-text); font-weight: 500;">gửi</span>
                            <span style="color: var(--pineapple-orange-dark); font-weight: 800;">${song.amount.toLocaleString('vi-VN')} VNĐ</span>
                        `}
                        ${(song.start > 0 || song.end) && !song.isZyPage ? `<span style="font-size:0.72rem; color:#6B7280; margin-left: 0.3rem;">[${song.start}s–${song.end || 'hết'}]</span>` : ''}
                    </div>
                    <div class="queue-item-row2-right">
                        ${song.views ? `
                        <span class="queue-item-views-inline" style="font-size: 0.72rem; color: #6B7280; display: inline-flex; align-items: center; gap: 0.2rem; margin-right: 0.4rem;" title="${song.type === 'soundcloud' ? 'Lượt nghe' : 'Lượt xem'}: ${Number(song.views) ? Number(song.views).toLocaleString('vi-VN') : song.views}">
                            <i class="${song.type === 'soundcloud' ? 'fa-solid fa-headphones' : 'fa-regular fa-eye'}" style="font-size: 0.72rem;"></i>
                            ${formatViewsCompact(song.views)}
                        </span>
                        ` : ''}
                        <span class="queue-item-duration-inline" style="display: inline-flex; align-items: center; gap: 0.2rem;">
                            <i class="fa-regular fa-clock" style="font-size: 0.72rem;"></i>
                            ${song.duration ? formatTime(song.duration) : '<svg class="m3-spinner" viewBox="0 0 24 24" style="width: 0.75rem; height: 0.75rem;"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg>'}
                        </span>
                        <div class="queue-item-actions">
                            ${isCurrent ? `
                                <button class="queue-item-btn" style="background: #10b981; color: white; border-color: #10b981; cursor: default; box-shadow: none;" title="Đang phát">
                                    <i class="fa-solid fa-play"></i>
                                </button>
                            ` : `
                                ${song.isAutoPinned ? `
                                    <button class="queue-item-btn btn-pin pinned" style="opacity: 0.6; cursor: not-allowed;" title="Đã tự động ghim do đợi lâu (không thể bỏ ghim)" disabled>
                                        <i class="fa-solid fa-thumbtack"></i>
                                    </button>
                                ` : `
                                    <button class="queue-item-btn btn-pin ${song.isPinned ? 'pinned' : ''}" title="${song.isPinned ? 'Bỏ ghim bài hát' : 'Ghim bài hát lên đầu'}" onclick="togglePinQueueItem('${song.id}')">
                                        <i class="fa-solid fa-thumbtack"></i>
                                    </button>
                                    <button class="queue-item-btn btn-pin-bottom ${song.isPinnedBottom ? 'pinned-bottom' : ''}" title="${song.isPinnedBottom ? 'Bỏ ghim cuối' : 'Ghim bài hát xuống cuối'}" onclick="togglePinBottomQueueItem('${song.id}')">
                                        <i class="fa-solid fa-thumbtack" style="transform: rotate(180deg); display: inline-block;"></i>
                                    </button>
                                `}
                                ${(!song.isPinned && !song.isPinnedBottom && realIndex > (state.currentSong ? 1 : 0) && !state.queue[realIndex - 1].isPinned && !state.queue[realIndex - 1].isPinnedBottom) ? `
                                    <button class="queue-item-btn" title="Dịch chuyển lên" onclick="moveQueueItemUp('${song.id}')">
                                        <i class="fa-solid fa-arrow-up"></i>
                                    </button>
                                ` : ''}
                                ${(!song.isPinned && !song.isPinnedBottom && realIndex < state.queue.length - 1 && !state.queue[realIndex + 1].isPinned && !state.queue[realIndex + 1].isPinnedBottom) ? `
                                    <button class="queue-item-btn" title="Dịch chuyển xuống" onclick="moveQueueItemDown('${song.id}')">
                                        <i class="fa-solid fa-arrow-down"></i>
                                    </button>
                                ` : ''}
                                <button class="queue-item-btn btn-play" title="Phát ngay lập tức" onclick="userForcePlaySong('${song.id}')">
                                    <i class="fa-solid fa-play"></i>
                                </button>
                            `}
                            <button class="queue-item-btn btn-delete" title="Xóa" onclick="userRemoveSongFromQueue('${song.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                ${song.message ? `<div class="queue-item-message">"${song.message}"</div>` : ''}
            </div>
        `;
        return item.outerHTML;
    }).join('');

    queueViews.forEach(view => {
        view.container.innerHTML = queueHtml;
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
function playNextInQueue(isAutomatic = false) {
    renderQueue(); // Đảm bảo đồng bộ giao diện hàng đợi
    if (state.queue.length === 0) {
        state.currentSong = null;
        updatePlayerUI(null);
        localStorage.removeItem('dua_current_song');
        sendOverlayMessage('current_song', null);
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
        logSystem("Đã phát hết hàng đợi nhạc donate.");
        return;
    }

    if (isAutomatic && state.luckyMode && state.luckyNextSong) {
        const luckyIndex = state.queue.findIndex(s => String(s.id) === String(state.luckyNextSong.id));
        if (luckyIndex !== -1) {
            const targetSong = state.queue[luckyIndex];
            state.queue.splice(luckyIndex, 1);
            state.queue.unshift(targetSong);
            saveQueue();
            renderQueue();
        }
    }

    state.currentSong = state.queue[0];
    playSong(state.currentSong);
}

// --- GỬI LỆNH ĐIỀU KHIỂN SANG OBS OVERLAY ---
function sendControlCommand(type, value = null, options = {}) {
    const cmdPayload = {
        type: type,
        value: value,
        timestamp: Date.now() + Math.random() // Đảm bảo sự kiện storage kích hoạt liên tục
    };
    
    logSystem(`[Điều khiển] Thực thi lệnh điều khiển trình phát: <strong>${type}</strong>${value !== null ? ` [Giá trị: ${value}]` : ''}`, 'system');
    
    localStorage.setItem('dua_control_command', JSON.stringify(cmdPayload));
    if (options.updateIntent !== false && (type === 'play' || type === 'pause' || type === 'stop')) {
        localStorage.setItem('dua_playback_intent', type);
        if (typeof state !== 'undefined') {
            state.playbackIntent = type;
        }
    }
    
    // MQTT broadcast
    sendOverlayMessage('control_command', cmdPayload);

    if (type === 'play' || type === 'pause' || type === 'stop') {
        try {
            window.vpanelApplyPlaybackCommand?.(type);
        } catch (e) {}
    }
}

// --- BẢNG HỎI LỰA CHỌN PHÁT TIẾP BÀI HÁT BỊ ĐẨY XUỐNG ---
function promptResumePlayback(song, onResolve) {
    // Xóa bất kỳ modal nào cũ nếu còn tồn tại
    const oldModal = document.getElementById('resume-playback-modal');
    if (oldModal) oldModal.remove();

    // Tạo modal lựa chọn phát tiếp
    const modal = document.createElement('div');
    modal.id = 'resume-playback-modal';
    modal.className = 'browser-blocked-overlay';
    modal.style.cssText = 'display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 10000;';

    const savedSeconds = Math.floor(song.savedProgress);
    const card = document.createElement('div');
    card.className = 'blocked-card';
    card.style.cssText = 'max-width: 420px; width: 100%;';

    card.innerHTML = `
        <h3 style="font-family: var(--font-title); font-weight: 800; color: var(--pineapple-text); margin-top: 0; margin-bottom: 0.5rem;"><i class="fa-solid fa-clock-rotate-left"></i> Phát tiếp tục?</h3>
        <p style="font-size: 0.9rem; font-weight: 700; color: var(--pineapple-text); margin-bottom: 1.25rem; line-height: 1.4; opacity: 0.85;">
            Bài hát <strong>${song.title}</strong> có tiến trình cũ tại <strong style="color: var(--pineapple-orange-dark, #D97706);">${formatTime(savedSeconds)}</strong>.<br>
            Bạn có muốn phát tiếp hay phát lại từ đầu?
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; margin-bottom: 0.8rem;">
            <button id="btn-resume-yes" class="dua-btn dua-btn-primary" style="padding: 0.45rem 1.2rem; font-size: 0.85rem; border-width: 2px; box-shadow: 2px 2px 0px var(--pineapple-shadow, #2B1810); font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-forward"></i> Phát tiếp</button>
            <button id="btn-resume-no" class="dua-btn dua-btn-secondary" style="padding: 0.45rem 1.2rem; font-size: 0.85rem; border-width: 2px; box-shadow: 2px 2px 0px var(--pineapple-shadow, #2B1810); font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-rotate-left"></i> Phát lại</button>
        </div>
        <div id="resume-countdown" style="font-size: 0.82rem; font-weight: 700; color: var(--pineapple-text); opacity: 0.55;">
            Tự động phát tiếp sau 8 giây...
        </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    let timeLeft = 8;
    const countdownEl = card.querySelector('#resume-countdown');
    
    const interval = setInterval(() => {
        timeLeft--;
        if (countdownEl) {
            countdownEl.textContent = `Tự động phát tiếp sau ${timeLeft} giây...`;
        }
        if (timeLeft <= 0) {
            cleanup(true);
        }
    }, 1000);

    const cleanup = (shouldResume) => {
        clearInterval(interval);
        modal.remove();
        onResolve(shouldResume);
    };

    card.querySelector('#btn-resume-yes').addEventListener('click', () => cleanup(true));
    card.querySelector('#btn-resume-no').addEventListener('click', () => cleanup(false));
}

// --- PHÁT MỘT BÀI HÁT CHI TIẾT (ĐỒNG BỘ SANG OVERLAY) ---
async function playSong(song) {
    if (!song) return;

    state.lastSwitchTime = Date.now();

    // Đặt lại cờ bypass khi chuyển bài mới
    state.bypassCurrentSongDuration = false;

    // Khởi tạo/đặt lại thuộc tính vote skip của bài hát hiện tại
    song.voteSkipActive = song.voteSkipActive || false;
    song.voteAmount = song.voteAmount || 0;
    song.voteSkipTarget = song.voteSkipTarget || (song.isOwnerAdd ? state.voteSkipDefaultAmount : (song.amount || state.voteSkipDefaultAmount));
    song.voteSkipSuccess = song.voteSkipSuccess || false;
    song.voteSkipContributors = song.voteSkipContributors || [];

    // Gửi cấu hình âm lượng hiện tại sang overlay để đảm bảo đồng bộ tuyệt đối trước khi phát
    sendControlCommand('volume', state.volume);

    // Kiểm tra xem bài hát có tiến trình đã lưu hay không
    let startFrom = song.start || 0;
    let needSeekAfterLoad = false;
    if (song.savedProgress && song.savedProgress > 2) {
        // Tạm dừng bài đang phát (nếu có) trước khi hỏi người dùng
        if (state.isPlaying) {
            sendControlCommand('pause');
        }
        // Gửi trạng thái chờ lên overlay để hiển thị thông báo
        sendControlCommand('waiting_resume', song.title);

        const shouldResume = await new Promise((resolve) => {
            promptResumePlayback(song, resolve);
        });
        if (shouldResume) {
            startFrom = Math.floor(song.savedProgress);
            needSeekAfterLoad = true;
            logSystem(`Phát tiếp tục bài hát "${song.title}" từ ${formatTime(startFrom)}`, 'system');
        } else {
            // Xóa tiến trình đã lưu
            delete song.savedProgress;
            const qItem = state.queue.find(s => String(s.id) === String(song.id));
            if (qItem) {
                delete qItem.savedProgress;
            }
            saveQueue();
        }
    }

    // Thiết lập mã gia hạn (luôn sinh mã để sẵn sàng khi bật tính năng)
    if (!song.extensionCode) {
        song.extensionCode = generateExtensionCode();
    }
    song.extendedDuration = song.extendedDuration || 0;

    logSystem(`Đang chuẩn bị gửi bài hát sang Overlay: <strong>${song.title}</strong>...`);
    updatePlayerUI(song);
    
    // Thu thập các đoạn SponsorBlock
    await fetchSponsorBlockSegments(song.videoId);

    // Tìm bài tiếp theo trong hàng đợi không trùng với bài đang chuẩn bị phát (hỗ trợ Lucky Mode)
    const nextSong = getNextSong();

    // Gửi thông tin bài hát hiện tại sang overlay qua localStorage
    const payload = {
        id: song.id,
        type: song.type || 'youtube',
        videoId: song.videoId || null,
        soundcloudUrl: song.soundcloudUrl || null,
        
        title: song.title,
        thumbnail: song.thumbnail,
        donorName: song.donorName,
        amount: song.amount,
        message: song.message,
        isOwnerAdd: song.isOwnerAdd || false,
        start: startFrom,
        isResuming: needSeekAfterLoad,
        end: song.end || null,
        skipSegments: state.skipSegments || [],
        maxDuration: calculateMaxDurationForSong(song),
        extensionCode: song.extensionCode || null,
        extendedDuration: song.extendedDuration || 0,
        extensionForceShow: song.extensionForceShow || false,
        extensionPrice: state.extensionPrice,
        extensionMinutes: state.extensionMinutes,
        voteSkipActive: song.voteSkipActive || false,
        voteAmount: song.voteAmount || 0,
        voteSkipTarget: song.voteSkipTarget || (song.isOwnerAdd ? state.voteSkipDefaultAmount : (song.amount || state.voteSkipDefaultAmount)),
        voteSkipSuccess: song.voteSkipSuccess || false,
        voteSkipContributors: song.voteSkipContributors || [],
        nextSongTitle: nextSong ? nextSong.title : null,
        nextSongDonor: nextSong ? nextSong.donorName : null,
        nextSongAmount: nextSong ? nextSong.amount : null,
        nextSongIsOwnerAdd: nextSong ? (nextSong.isOwnerAdd || false) : false,
        nextSongId: nextSong ? nextSong.id : null,
        nextSongThumbnail: nextSong ? nextSong.thumbnail : null,
        nextSongType: nextSong ? nextSong.type || 'youtube' : null,
        nextSongVideoId: nextSong ? nextSong.videoId : null,
        luckyMode: state.luckyMode || false
    };

    localStorage.setItem('dua_current_song', JSON.stringify(payload));
    
    // MQTT broadcast
    sendOverlayMessage('current_song', payload);
    
    // Phát lệnh chạy nhạc
    sendControlCommand('play');
    state.isPlaying = true;
    updatePlayPauseButtonUI(true);

    setTimeout(() => {
        if (!state.currentSong || String(state.currentSong.id) !== String(song.id) || !state.isPlaying) return;
        let overlayState = null;
        try {
            const rawState = localStorage.getItem('dua_overlay_state');
            if (rawState) overlayState = JSON.parse(rawState);
        } catch(e) {}

        const stateAge = overlayState && overlayState.timestamp ? Date.now() - overlayState.timestamp : Infinity;
        const expectedStart = startFrom || 0;
        const hasRealPlayback = overlayState &&
            overlayState.isPlaying &&
            stateAge < 4500 &&
            Number(overlayState.currentTime || 0) > expectedStart + 0.5;

        if (!hasRealPlayback) {
            console.warn("[Player Watchdog] Overlay did not report active playback. Resending current_song/play.");
            sendOverlayMessage('current_song', payload);
            sendControlCommand('play');
        }
    }, 4500);

    // Cập nhật lại hàng đợi để đồng bộ hiển thị bài đang phát
    renderQueue();
}

// Cập nhật trạng thái nút Tạm dừng/Tiếp tục của Dashboard
function updatePlayPauseButtonUI(isPlaying) {
    const waves = document.getElementById('music-waves');
    const playBtn = document.getElementById('btn-play-pause');
    if (isPlaying) {
        if (waves) waves.classList.remove('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        if (waves) waves.classList.add('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
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
        state.lastReportedTime = currentTime;

        const duration = player.getDuration();
        let isLiveStream = false;
        try {
            const vd = player.getVideoData ? player.getVideoData() : {};
            isLiveStream = !!(vd && vd.isLive);
        } catch (e) {
            isLiveStream = (!duration || duration <= 0);
        }

        const progressSlider = document.getElementById('progress-slider');
        const currentTimeDisplay = document.getElementById('current-time-display');
        const totalTimeDisplay = document.getElementById('total-time-display');

        if (isLiveStream) {
            if (progressSlider) progressSlider.style.display = 'none';
            if (currentTimeDisplay) currentTimeDisplay.style.display = 'none';
            if (totalTimeDisplay) {
                totalTimeDisplay.textContent = "LIVE";
                totalTimeDisplay.style.display = 'inline';
            }
        } else {
            if (!duration) return;
            if (progressSlider) {
                progressSlider.style.display = 'block';
                const pct = (currentTime / duration) * 100;
                progressSlider.value = pct;
                updateRangeProgress(progressSlider, pct);
            }
            if (currentTimeDisplay) {
                currentTimeDisplay.textContent = formatTime(currentTime);
                currentTimeDisplay.style.display = 'inline';
            }
            if (totalTimeDisplay) {
                totalTimeDisplay.textContent = formatTime(duration);
                totalTimeDisplay.style.display = 'inline';
            }
        }

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
    if (state.focusMode) return;
    if (state.currentSong && state.currentSong.isAutoPinned) {
        logSystem("Không thể tua bài hát đợi lâu!", "system");
        updatePlayerUI(state.currentSong);
        return;
    }
    const progressSlider = document.getElementById('progress-slider');
    if (progressSlider) {
        updateRangeProgress(progressSlider, pct);
    }
    if (currentOverlayDuration <= 0) return;
    let startPoint = 0;
    if (state.currentSong) {
        startPoint = state.currentSong.start || 0;
    }
    const seekToSeconds = startPoint + (pct / 100) * currentOverlayDuration;
    const relativeElapsed = (pct / 100) * currentOverlayDuration;
    const success = attemptGlobalAction('seek', () => {
        sendControlCommand('seek', seekToSeconds);
        logSystem(`Tua bài nhạc tới: ${formatTime(relativeElapsed)}`);
    });
    if (!success) {
        updatePlayerUI(state.currentSong);
    }
}

// --- ĐIỀU CHỈNH ÂM LƯỢNG ---
function onVolumeChange(val) {
    if (state.focusMode) return;
    state.volume = parseInt(val);
    localStorage.setItem('dua_volume', val);
    document.getElementById('volume-val-display').textContent = val + '%';
    updateRangeProgress(document.getElementById('volume-slider'), state.volume);
    
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
    if (state.focusMode) return;
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
    if (state.focusMode) return;
    if (!state.currentSong) {
        if (state.queue.length > 0) {
            attemptGlobalAction('play', () => {
                playNextInQueue();
            });
        }
        return;
    }

    if (state.isPlaying) {
        attemptGlobalAction('pause', () => {
            sendControlCommand('pause');
            state.isPlaying = false;
            logSystem("Tạm dừng trình phát nhạc (Overlay).");
            updatePlayPauseButtonUI(false);
            renderQueue();
        });
    } else {
        attemptGlobalAction('play', () => {
            sendControlCommand('play');
            state.isPlaying = true;
            logSystem("Tiếp tục trình phát nhạc (Overlay).");
            updatePlayPauseButtonUI(true);
            renderQueue();
        });
    }
}

// --- SKIP BÀI (NEXT) ---
function skipSong(isManual = true) {
    if (state.focusMode) return;
    if (!state.currentSong) return;
    if (isManual && state.currentSong.isAutoPinned) {
        logSystem("Không thể bỏ qua bài hát đợi lâu!", "system");
        showDashboardSystemAlert("Thao tác bị khóa", "Không thể bỏ qua bài hát do đợi lâu");
        return;
    }
    
    const skipAction = () => {
        logSystem(`Bỏ qua bài hát: <strong>${state.currentSong.title}</strong>`);
        showDashboardSystemAlert("Bỏ qua bài hát", `Đã bỏ qua bài hát: <strong>${state.currentSong.title}</strong>`);
        removeSongFromQueue(state.currentSong.id, false);
        playNextInQueue(true);
    };

    if (isManual) {
        attemptGlobalAction('skip', skipAction);
    } else {
        skipAction();
    }
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
    if (state.focusMode) return;
    const songIndex = state.queue.findIndex(s => String(s.id) === String(songId));
    if (songIndex === -1) return;

    // Lưu tiến trình bài đang phát trước khi chuyển bài ưu tiên
    if (state.currentSong) {
        const currentSongInQueue = state.queue.find(s => String(s.id) === String(state.currentSong.id));
        if (currentSongInQueue) {
            const duration = currentSongInQueue.duration || 0;
            const currentTime = state.lastReportedTime || 0;
            // Chỉ lưu tiến trình nếu bài hát đã phát được trên 2 giây và còn cách kết thúc trên 5 giây (nếu có duration)
            if (currentTime > 2 && (duration === 0 || currentTime < duration - 5)) {
                currentSongInQueue.savedProgress = currentTime;
                logSystem(`Đã lưu tiến trình bài hát "${currentSongInQueue.title}" tại ${formatTime(currentTime)}`, 'system');
            }
        }
    }

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
        updatePlayerUI(null);
        if (typeof window.vpanelUpdateSong === 'function') {
            window.vpanelUpdateSong(null);
        }
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
        stopPlaybackMonitor();
        broadcastStateToOverlay();
    } else {
        // Cập nhật lại nextSongTitle của bài hát đang phát nếu bài bị xoá nằm trong hàng đợi
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
    }

    if (refreshUI) {
        renderQueue();
        if (isPlayingCurrent) {
            playNextInQueue(true);
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
            const item = state.queue[i];
            
            // Nếu bài duyệt qua là ghim cuối mà bài mới không phải ghim cuối, chèn bài mới trước nó
            if (item.isPinnedBottom && !newSong.isPinnedBottom) {
                insertIndex = i;
                break;
            }
            // Nếu cả hai đều ghim cuối: sắp xếp theo pinnedBottomTime
            if (item.isPinnedBottom && newSong.isPinnedBottom) {
                if ((item.pinnedBottomTime || 0) > (newSong.pinnedBottomTime || 0)) {
                    insertIndex = i;
                    break;
                }
                continue;
            }
            // Nếu bài mới là ghim cuối mà bài duyệt qua chưa ghim cuối, bỏ qua bài duyệt qua này để xuống dưới
            if (!item.isPinnedBottom && newSong.isPinnedBottom) {
                continue;
            }

            // Bài mới (mặc định chưa ghim) không được chèn trước bài đã ghim
            if (item.isPinned && !newSong.isPinned) {
                continue;
            }
            // Nếu bài mới được ghim mà bài duyệt qua chưa ghim, chèn ngay trước nó
            if (!item.isPinned && newSong.isPinned) {
                insertIndex = i;
                break;
            }
            
            // Cả hai cùng ghim hoặc cùng không ghim: so sánh số tiền
            if (item.amount < newSong.amount) {
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
        let insertIndex = -1;
        for (let i = startIndex; i < state.queue.length; i++) {
            const item = state.queue[i];
            
            // Ghim cuối
            if (item.isPinnedBottom && !newSong.isPinnedBottom) {
                insertIndex = i;
                break;
            }
            if (item.isPinnedBottom && newSong.isPinnedBottom) {
                if ((item.pinnedBottomTime || 0) > (newSong.pinnedBottomTime || 0)) {
                    insertIndex = i;
                    break;
                }
                continue;
            }
            if (!item.isPinnedBottom && newSong.isPinnedBottom) {
                continue;
            }

            if (item.isPinned && !newSong.isPinned) {
                continue;
            }
            if (!item.isPinned && newSong.isPinned) {
                insertIndex = i;
                break;
            }
            // Cả hai cùng ghim hoặc cùng không ghim: so sánh timestamp
            if (item.timestamp > newSong.timestamp) {
                insertIndex = i;
                break;
            }
        }
        if (insertIndex !== -1) {
            state.queue.splice(insertIndex, 0, newSong);
        } else {
            state.queue.push(newSong);
        }
    }
}

// --- DỊCH CHUYỂN BÀI HÁT LÊN TRONG HÀNG ĐỢI ---
function moveQueueItemUp(songId) {
    if (state.focusMode) return;
    const index = state.queue.findIndex(s => String(s.id) === String(songId));
    const minIndex = state.currentSong ? 1 : 0;
    if (index > minIndex) {
        const currentSongItem = state.queue[index];
        const prevSongItem = state.queue[index - 1];

        // Bài ghim không thể thay đổi vị trí
        if (currentSongItem.isPinned) return;
        // Bài không ghim không thể vượt lên trước bài ghim
        if (prevSongItem.isPinned) return;

        const temp = state.queue[index];
        state.queue[index] = state.queue[index - 1];
        state.queue[index - 1] = temp;
        
        saveQueue();
        renderQueue();
        logSystem(`Đã đẩy bài hát lên trước: <strong>${temp.title}</strong>`);

        // Cập nhật lại nextSongTitle của bài hát đang phát
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
        
        // Nếu chuyển lên đầu hàng đợi và hiện tại không có bài nào phát, kích hoạt phát
        if (index - 1 === 0 && !state.currentSong && !state.focusMode) {
            playNextInQueue();
        }
    }
}

// --- DỊCH CHUYỂN BÀI HÁT XUỐNG TRONG HÀNG ĐỢI ---
function moveQueueItemDown(songId) {
    if (state.focusMode) return;
    const index = state.queue.findIndex(s => String(s.id) === String(songId));
    const minIndex = state.currentSong ? 1 : 0;
    if (index >= minIndex && index !== -1 && index < state.queue.length - 1) {
        const currentSongItem = state.queue[index];
        const nextSongItem = state.queue[index + 1];

        // Bài ghim không thể thay đổi vị trí
        if (currentSongItem.isPinned) return;
        // Bài không ghim không thể hạ xuống sau bài ghim
        if (nextSongItem.isPinned) return;

        const temp = state.queue[index];
        state.queue[index] = state.queue[index + 1];
        state.queue[index + 1] = temp;
        
        saveQueue();
        renderQueue();
        logSystem(`Đã hạ bài hát xuống sau: <strong>${temp.title}</strong>`);

        // Cập nhật lại nextSongTitle của bài hát đang phát
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
    }
}

// --- GHIM / BỎ GHIM BÀI HÁT TRONG HÀNG ĐỢI ---
function togglePinQueueItem(songId) {
    const index = state.queue.findIndex(s => String(s.id) === String(songId));
    if (index === -1) return;
    
    const song = state.queue[index];
    if (song.isAutoPinned) {
        logSystem(`Bài hát <strong>${song.title}</strong> được ghim tự động do đợi lâu, không thể bỏ ghim!`, 'system');
        return;
    }
    song.isPinned = !song.isPinned;
    if (song.isPinned) {
        song.isPinnedBottom = false;
        delete song.pinnedBottomTime;
    }
    
    logSystem(`Đã ${song.isPinned ? 'ghim' : 'bỏ ghim'} bài hát: <strong>${song.title}</strong>`);
    
    // Sắp xếp lại hàng đợi để đưa bài ghim lên trên
    sortAndRefreshQueue(true);
}
window.togglePinQueueItem = togglePinQueueItem;

// --- GHIM / BỎ GHIM CUỐI BÀI HÁT TRONG HÀNG ĐỢI ---
function togglePinBottomQueueItem(songId) {
    const index = state.queue.findIndex(s => String(s.id) === String(songId));
    if (index === -1) return;
    
    const song = state.queue[index];
    if (song.isAutoPinned) {
        logSystem(`Bài hát <strong>${song.title}</strong> được ghim tự động do đợi lâu, không thể ghim cuối!`, 'system');
        return;
    }
    
    song.isPinnedBottom = !song.isPinnedBottom;
    if (song.isPinnedBottom) {
        song.isPinned = false;
        song.pinnedBottomTime = Date.now();
    } else {
        delete song.pinnedBottomTime;
    }
    
    logSystem(`Đã ${song.isPinnedBottom ? 'ghim cuối' : 'bỏ ghim cuối'} bài hát: <strong>${song.title}</strong>`);
    
    // Sắp xếp lại hàng đợi
    sortAndRefreshQueue(true);
}
window.togglePinBottomQueueItem = togglePinBottomQueueItem;

// --- CẬP NHẬT GIAO DIỆN KHI CÓ BÀI MỚI / DỪNG ---
function updatePlayerUI(song) {
    const cover = document.getElementById('current-song-cover');
    const title = document.getElementById('current-song-title');
    const donorSection = document.getElementById('current-song-donor');
    const messageSection = document.getElementById('current-song-message');
    const coverWrapper = document.getElementById('song-cover-wrapper');
    const slider = document.getElementById('progress-slider');
    const separator = document.getElementById('progress-separator');

    if (!song) {
        const directStreamBadge = document.getElementById('direct-stream-badge');
        if (directStreamBadge) directStreamBadge.style.display = 'none';

        cover.src = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
        title.textContent = "Chưa có bài hát nào";
        updateMiniPlayerTitleMarquee();
        donorSection.style.display = 'none';
        messageSection.style.display = 'none';
        coverWrapper.classList.remove('spinning');
        if (slider) {
            slider.value = 0;
            updateRangeProgress(slider, 0);
            slider.style.display = 'block';
        }
        if (separator) {
            separator.style.display = 'none';
        }
        
        document.getElementById('current-time-display').textContent = '0:00';
        document.getElementById('total-time-display').textContent = '0:00';
 
        // Ẩn countdown khi không còn bài nào
        const dashCountdown = document.getElementById('dash-live-countdown');
        if (dashCountdown) dashCountdown.classList.remove('visible');
        
        // Ẩn cảnh báo nhạy cảm trên dashboard
        const warningEl = document.getElementById('dash-sensitive-warning');
        if (warningEl) warningEl.classList.remove('visible');
        
        const featuresRow = document.getElementById('control-features-row');
        if (featuresRow) featuresRow.style.display = 'flex';
 
        updateBypassButtonUI();
        updateForceExtensionButtonUI();
        updateVoteSkipButtonUI();
        updateCurrentFavoriteButton();
        updateCurrentKeywordButton();
        return;
    }
 
    cover.src = song.thumbnail;
    title.textContent = song.title;
    updateMiniPlayerTitleMarquee();
    
    const directStreamBadge = document.getElementById('direct-stream-badge');
    if (directStreamBadge) directStreamBadge.style.display = 'none';
    
    if (song.isOwnerAdd) {
        donorSection.innerHTML = `<i class="fa-solid fa-user-shield"></i> <span id="current-donor-name">Chủ kênh thêm</span>`;
    } else {
        donorSection.innerHTML = `<span id="current-donor-name">${song.donorName}</span> <span style="color: var(--pineapple-text);">đã tặng</span> <span id="current-donor-amount">${song.amount.toLocaleString('vi-VN')} VNĐ</span>`;
    }
    donorSection.style.display = 'flex';

    if (song.message) {
        messageSection.textContent = `"${song.message}"`;
        messageSection.style.display = 'block';
    } else {
        messageSection.style.display = 'none';
    }

    coverWrapper.classList.add('spinning');
    
    // Cập nhật cảnh báo nhạy cảm trên dashboard
    const warningEl = document.getElementById('dash-sensitive-warning');
    const warningMsgEl = document.getElementById('dash-sensitive-message');
    if (warningEl) {
        const warningConfig = sensitiveVideosConfig[song.videoId] || (song.videoId === 'Wv7t22rx7Ik' ? {
            message: "T19: Nội dung chuẩn bị phát không phù hợp với người có vấn đề tâm lý. Hãy cân nhắc trước khi nghe.",
            duration: 5
        } : null);

        if (song.videoId && warningConfig) {
            if (warningMsgEl) {
                warningMsgEl.textContent = warningConfig.message || "Cảnh báo: Video này chứa nội dung nhạy cảm.";
            }
            warningEl.classList.add('visible');
        } else {
            warningEl.classList.remove('visible');
        }
    }
    
    const featuresRow = document.getElementById('control-features-row');
    if (featuresRow) featuresRow.style.display = 'flex';

    // Cập nhật thông tin gia hạn thời gian trên Dashboard Player
    const extensionInfoEl = document.getElementById('current-song-extension-info');
    if (extensionInfoEl) {
        if (song && state.extensionEnabled && isExtensionAllowedForSong(song)) {
            // Tự động sinh mã gia hạn nếu bài hát hiện tại đang phát chưa có mã (tự sửa lỗi "Chưa có")
            if (!song.extensionCode) {
                song.extensionCode = generateExtensionCode();
                song.extendedDuration = song.extendedDuration || 0;
                
                // Đồng bộ ngược lại trạng thái hiện tại
                if (state.currentSong && state.currentSong.id === song.id) {
                    state.currentSong.extensionCode = song.extensionCode;
                    state.currentSong.extendedDuration = song.extendedDuration;
                    state.currentSong = state.currentSong; // trigger setter
                    
                    const payloadRaw = localStorage.getItem('dua_current_song');
                    if (payloadRaw) {
                        try {
                            const payload = JSON.parse(payloadRaw);
                            payload.extensionCode = song.extensionCode;
                            payload.maxDuration = calculateMaxDurationForSong(state.currentSong);
                            localStorage.setItem('dua_current_song', JSON.stringify(payload));
                            sendOverlayMessage('current_song', payload);
                        } catch(e) {}
                    }
                    updateMaxDurationValue();
                }
            }
            
            const extCode = song.extensionCode;
            const extDuration = song.extendedDuration || 0;
            const extMinsStr = (extDuration / 60).toFixed(1).replace(/\.0$/, '');
            const forceShowText = song.extensionForceShow 
                ? '<span style="color: #EF4444; font-weight: 800;">Đang hiện trên Livestream</span>' 
                : '<span style="color: #6B7280; font-weight: 700;">Đang ẩn trên Livestream</span>';
            
            const maxDuration = calculateMaxDurationForSong(song);
            const currentLimitStr = formatTime(maxDuration);
            const totalDurationStr = song.duration ? formatTime(song.duration) : 'Không rõ';

            const priceFormatted = Number(state.extensionPrice).toLocaleString('vi-VN');
            const rateStr = ` <span style="font-size: 0.78rem; font-weight: 600; opacity: 0.8; color: var(--pineapple-text);">(${priceFormatted}đ = ${state.extensionMinutes}p)</span>`;

            extensionInfoEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px dashed var(--pineapple-border-color); padding-bottom: 0.25rem; margin-bottom: 0.25rem;">
                    <div>Mã gia hạn: <strong style="font-size: 0.9rem; color: var(--pineapple-orange-dark);">${extCode}</strong>${rateStr}</div>
                    <div>${forceShowText}</div>
                </div>
                <div style="font-size: 0.76rem; color: var(--pineapple-text); opacity: 0.95;">
                    Đã gia hạn: <strong>+${extMinsStr} phút</strong> | Giới hạn phát: <strong>${currentLimitStr}</strong> / Độ dài gốc: <strong>${totalDurationStr}</strong>
                </div>
            `;
            extensionInfoEl.style.display = 'block';
        } else {
            extensionInfoEl.style.display = 'none';
        }
    }

    updateBypassButtonUI();
    updateForceExtensionButtonUI();
    updateVoteSkipButtonUI();
    updateCurrentFavoriteButton();
    updateCurrentKeywordButton();

    // Cập nhật Video Preview trực tiếp thay vì qua localStorage events
    if (typeof window.vpanelUpdateSong === 'function') {
        window.vpanelUpdateSong(song);
    }

    // Cập nhật trạng thái vô hiệu hoá của các nút điều khiển khi phát nhạc đợi lâu
    updatePlayerControlsDisableState(song);
}

function updatePlayerControlsDisableState(song) {
    const isAutoPinned = !!(song && song.isAutoPinned);
    
    // 1. Thanh tua (progress-slider)
    const progressSlider = document.getElementById('progress-slider');
    if (progressSlider) {
        progressSlider.disabled = isAutoPinned;
        if (isAutoPinned) {
            progressSlider.style.pointerEvents = 'none';
            progressSlider.style.opacity = '0.5';
        } else {
            progressSlider.style.pointerEvents = '';
            progressSlider.style.opacity = '';
        }
    }
    
    // 2. Nút Play/Pause (btn-play-pause)
    const btnPlayPause = document.getElementById('btn-play-pause');
    if (btnPlayPause) {
        btnPlayPause.disabled = isAutoPinned;
        if (isAutoPinned) {
            btnPlayPause.style.pointerEvents = 'none';
            btnPlayPause.style.opacity = '0.5';
        } else {
            btnPlayPause.style.pointerEvents = '';
            btnPlayPause.style.opacity = '';
        }
    }
    
    // 3. Nút Skip (btn-skip)
    const btnSkip = document.getElementById('btn-skip');
    if (btnSkip) {
        btnSkip.disabled = isAutoPinned;
        if (isAutoPinned) {
            btnSkip.style.pointerEvents = 'none';
            btnSkip.style.opacity = '0.5';
        } else {
            btnSkip.style.pointerEvents = '';
            btnSkip.style.opacity = '';
        }
    }
    
    // 4. Nút Phát hết bài (btn-bypass-limit)
    const btnBypass = document.getElementById('btn-bypass-limit');
    if (btnBypass) {
        btnBypass.disabled = isAutoPinned;
        if (isAutoPinned) {
            btnBypass.style.pointerEvents = 'none';
            btnBypass.style.opacity = '0.5';
        } else {
            btnBypass.style.pointerEvents = '';
            btnBypass.style.opacity = '';
        }
    }

    // 5. Nút Favorite (btn-favorite-current)
    const btnFavorite = document.getElementById('btn-favorite-current');
    if (btnFavorite) {
        btnFavorite.disabled = isAutoPinned;
        if (isAutoPinned) {
            btnFavorite.style.pointerEvents = 'none';
            btnFavorite.style.opacity = '0.5';
        } else {
            btnFavorite.style.pointerEvents = '';
            btnFavorite.style.opacity = '';
        }
    }

    // 6. Nút Save Keyword (btn-save-current-keyword)
    const btnSaveKeyword = document.getElementById('btn-save-current-keyword');
    if (btnSaveKeyword) {
        btnSaveKeyword.disabled = isAutoPinned;
        if (isAutoPinned) {
            btnSaveKeyword.style.pointerEvents = 'none';
            btnSaveKeyword.style.opacity = '0.5';
        } else {
            btnSaveKeyword.style.pointerEvents = '';
            btnSaveKeyword.style.opacity = '';
        }
    }
}
window.updatePlayerControlsDisableState = updatePlayerControlsDisableState;

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

    if (typeof window.vpanelHandleTabChange === 'function') {
        window.vpanelHandleTabChange(tabId);
    }

    // toggleContentProtection is no longer supported
}

// --- CHUYỂN ĐỔI PHÂN KHU CẤU HÌNH (SUB-TABS SETTINGS) ---
function switchSettingsSection(sectionId) {
    const sections = document.querySelectorAll('.settings-section');
    const buttons = document.querySelectorAll('.settings-tab-btn');
    
    sections.forEach(sec => {
        if (sec.id === `settings-sec-${sectionId}`) {
            sec.style.display = 'flex';
        } else {
            sec.style.display = 'none';
        }
    });
    
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick') === `switchSettingsSection('${sectionId}')`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function changeDarkModeSetting(val) {
    localStorage.setItem('dua_dark_mode', val);
    applyDarkModeState();
}

function applyDarkModeState() {
    const setting = localStorage.getItem('dua_dark_mode') || 'dark';
    let isDark = true;
    if (setting === 'light' || setting === 'false') {
        isDark = false;
    } else if (setting === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    const selectEl = document.getElementById('dark-mode-select');
    if (selectEl) {
        selectEl.value = (setting === 'false') ? 'light' : ((setting === 'true') ? 'dark' : setting);
    }
    
    if (window.electronAPI && typeof window.electronAPI.themeChange === 'function') {
        window.electronAPI.themeChange(isDark ? 'dark' : 'light');
    }
}

function toggleDarkMode(isDark) {
    changeDarkModeSetting(isDark ? 'dark' : 'light');
}

// Lắng nghe sự thay đổi giao diện của hệ thống
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const setting = localStorage.getItem('dua_dark_mode') || 'dark';
    if (setting === 'system') {
        applyDarkModeState();
    }
});

// --- ÁP DỤNG TRẠNG THÁI VÔ HIỆU HÓA HOẠT ĐỘNG KHI BẬT FOCUS MODE ---
function applyDashboardFocusModeState(enabled) {
    if (enabled) {
        document.body.classList.add('focus-mode-active');
    } else {
        document.body.classList.remove('focus-mode-active');
    }

    const selectors = [
        '#btn-play-pause',
        '#btn-skip',
        '#btn-bypass-limit',
        '#progress-slider',
        '#volume-slider',
        '#card-quick-add input',
        '#card-quick-add button',
        '#card-youtube-dashboard select',
        '#card-youtube-dashboard button',
        '#card-time-limit input',
        '#card-time-limit button',
        '#queue-sort-select',
        '#btn-test-mode'
    ].join(', ');

    const elements = document.querySelectorAll(selectors);
    elements.forEach(el => {
        if (el.id !== 'focus-mode-toggle-switch') {
            el.disabled = enabled;
        }
    });
}

// --- BẬT / TẮT CHẾ ĐỘ TẬP TRUNG (FOCUS MODE) ---
function toggleFocusMode(enabled) {
    state.focusMode = enabled;
    localStorage.setItem('dua_focus_mode', enabled);
    sendOverlayMessage('focus_mode', { value: enabled });
    
    applyDashboardFocusModeState(enabled);
    
    if (enabled) {
        logSystem("Đã BẬT chế độ Tập trung: Tạm dừng tự động chuyển bài khi có nhạc mới.", "system");
        showDashboardSystemAlert("Chế độ Tập trung", "Đã BẬT: Hàng đợi sẽ được giữ lại, không tự động phát bài mới.");
        
        // Tạm dừng bài hát đang phát nếu có
        if (state.currentSong && state.isPlaying) {
            state.wasPlayingBeforeFocusMode = true;
            sendControlCommand('pause');
            state.isPlaying = false;
            updatePlayPauseButtonUI(false);
            logSystem("Tự động tạm dừng bài hát hiện tại do kích hoạt Chế độ Tập trung.", "system");
        } else {
            state.wasPlayingBeforeFocusMode = false;
        }
    } else {
        logSystem("Đã TẮT chế độ Tập trung.", "system");
        showDashboardSystemAlert("Chế độ Tập trung", "Đã TẮT.");
        
        // Nếu trước đó bài hát đang phát dở bị tạm dừng do Focus Mode, tự động phát lại
        if (state.currentSong && state.wasPlayingBeforeFocusMode) {
            sendControlCommand('play');
            state.isPlaying = true;
            updatePlayPauseButtonUI(true);
            logSystem("Tự động tiếp tục phát lại bài hát đang phát dở sau khi TẮT Chế độ Tập trung.", "system");
        } else if (!state.currentSong && state.queue.length > 0) {
            // Tự động chạy nhạc nếu hàng đợi có bài hát mà trình phát đang trống
            playNextInQueue();
            logSystem("Tự động phát bài hát mới từ hàng đợi sau khi TẮT Chế độ Tập trung.", "system");
        }
    }
}

// --- BẬT / TẮT CHẾ ĐỘ LUCKY (QUAY NHẠC NGẪU NHIÊN) ---
function toggleLuckyMode(enabled) {
    state.luckyMode = enabled;
    localStorage.setItem('dua_lucky_mode', enabled);
    sendOverlayMessage('lucky_mode', { value: enabled });
    
    const switchEl = document.getElementById('lucky-mode-toggle-switch');
    if (switchEl) {
        switchEl.checked = enabled;
    }
    
    if (enabled) {
        logSystem("Đã BẬT chế độ Lucky: Tự động quay ngẫu nhiên bài tiếp theo khi hết nhạc.", "system");
        showDashboardSystemAlert("Chế độ Lucky", "Đã BẬT: Bài tiếp theo sẽ được chọn ngẫu nhiên từ hàng đợi.");
    } else {
        logSystem("Đã TẮT chế độ Lucky.", "system");
        showDashboardSystemAlert("Chế độ Lucky", "Đã TẮT.");
        state.luckyNextSong = null;
    }
    
    // Cập nhật lại nextSongTitle của bài hát đang phát để đồng bộ
    if (state.currentSong) {
        updateNextSongInCurrentPayload();
    }
}


// --- CẬP NHẬT NÚT VÔ CÙNG (BYPASS LIMIT) TRÊN PLAYER CONTROL ---
function updateBypassButtonUI() {
    const btn = document.getElementById('btn-bypass-limit');
    if (!btn) return;
    
    if (state.currentSong) {
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

// --- CẬP NHẬT NÚT GIA HẠN THỦ CÔNG (FORCE EXTENSION) TRÊN PLAYER CONTROL ---
function updateForceExtensionButtonUI() {
    const btn = document.getElementById('btn-force-extension');
    if (!btn) return;
    
    if (state.currentSong && state.extensionEnabled && isExtensionAllowedForSong(state.currentSong)) {
        btn.style.display = 'inline-flex';
        if (state.currentSong.extensionForceShow) {
            btn.classList.add('active-extension');
            btn.innerHTML = `Đang hiện gia hạn`;
            btn.title = "Đang buộc hiển thị mã gia hạn trên Overlay";
        } else {
            btn.classList.remove('active-extension');
            btn.innerHTML = `Hiện gia hạn`;
            btn.title = "Hiện mã gia hạn trên Overlay";
        }
    } else {
        btn.style.display = 'none';
    }
}

function toggleForceExtension() {
    if (!state.currentSong) return;
    
    state.currentSong.extensionForceShow = !state.currentSong.extensionForceShow;
    
    // Save to trigger setter or update UI
    state.currentSong = state.currentSong;
    
    // Sync to overlay
    const payloadRaw = localStorage.getItem('dua_current_song');
    if (payloadRaw) {
        try {
            const payload = JSON.parse(payloadRaw);
            payload.extensionForceShow = state.currentSong.extensionForceShow;
            localStorage.setItem('dua_current_song', JSON.stringify(payload));
            sendOverlayMessage('current_song', payload);
        } catch(e) {}
    }
    
    updateForceExtensionButtonUI();
    updatePlayerUI(state.currentSong);
    logSystem(`${state.currentSong.extensionForceShow ? '🔔 Đã hiển thị' : '🔕 Đã ẩn'} mã gia hạn trên Overlay.`);
}

// --- HIỆU ỨNG PHÁO GIẤY DASHBOARD TỐI GIẢN ---
let dbConfettiAnimationId = null;
function startDashboardConfetti() {
    const canvas = document.getElementById('dashboard-confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const width = canvas.width = window.innerWidth;
    const height = canvas.height = window.innerHeight;
    
    if (dbConfettiAnimationId) cancelAnimationFrame(dbConfettiAnimationId);
    
    const colors = ['#FF6B8B', '#FF8E9E', '#FB923C', '#4DCC93', '#5AB9EA', '#FBBF24', '#A78BFA'];
    const particles = [];
    
    for (let i = 0; i < 40; i++) {
        particles.push({
            x: 0,
            y: height,
            vx: 5 + Math.random() * 8,
            vy: -10 - Math.random() * 10,
            g: 0.2 + Math.random() * 0.1,
            size: 5 + Math.random() * 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * 360,
            rotSpeed: -4 + Math.random() * 8,
            swaySpeed: 0.04 + Math.random() * 0.04,
            swayOffset: Math.random() * 10
        });
    }
    for (let i = 0; i < 40; i++) {
        particles.push({
            x: width,
            y: height,
            vx: -5 - Math.random() * 8,
            vy: -10 - Math.random() * 10,
            g: 0.2 + Math.random() * 0.1,
            size: 5 + Math.random() * 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * 360,
            rotSpeed: -4 + Math.random() * 8,
            swaySpeed: 0.04 + Math.random() * 0.04,
            swayOffset: Math.random() * 10
        });
    }
    
    let frame = 0;
    function update() {
        ctx.clearRect(0, 0, width, height);
        let alive = false;
        
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.y > height + 20) continue;
            
            alive = true;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.g;
            p.vx *= 0.98;
            p.rot += p.rotSpeed;
            p.x += Math.sin(frame * p.swaySpeed + p.swayOffset) * 0.5;
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
        
        frame++;
        if (alive) {
            dbConfettiAnimationId = requestAnimationFrame(update);
        } else {
            ctx.clearRect(0, 0, width, height);
        }
    }
    
    dbConfettiAnimationId = requestAnimationFrame(update);
}

// --- HIỂN THỊ THÔNG BÁO DONATE MỚI TRÊN DASHBOARD ---
let dbAlertTimeout = null;
function updateDashboardAlertStacking() {
    const donationAlert = document.getElementById('db-alert-box');
    const systemAlert = document.getElementById('db-system-alert-box');
    if (!systemAlert) return;

    systemAlert.style.removeProperty('top');
    if (!donationAlert || !donationAlert.classList.contains('active') || !systemAlert.classList.contains('active')) return;

    const donationRect = donationAlert.getBoundingClientRect();
    const systemRect = systemAlert.getBoundingClientRect();
    const overlapsHorizontally = donationRect.left < systemRect.right && donationRect.right > systemRect.left;
    if (overlapsHorizontally) {
        systemAlert.style.top = `${54 + donationRect.height + 10}px`;
    }
}

function showDashboardNewDonationAlert(alertData) {
    const alertBox = document.getElementById('db-alert-box');
    if (!alertBox) return;
    // Kích hoạt pháo giấy
    startDashboardConfetti();
    
    // Lưu thông báo vào lịch sử
    if (typeof saveToNotificationHistory === 'function') {
        saveToNotificationHistory({
            id: alertData.id || Date.now() + Math.random().toString(36).substr(2, 5),
            title: alertData.title || 'Không rõ',
            donorName: alertData.donorName || 'Khách',
            amount: alertData.amount || 0,
            position: alertData.position || 'Hàng đợi',
            message: alertData.message || '',
            thumbnail: alertData.thumbnail || '',
            timestamp: alertData.timestamp || Date.now()
        });
    }
    
    const songTitleEl = document.getElementById('db-alert-song');
    const donorNameEl = document.getElementById('db-alert-donor');
    const amountEl = document.getElementById('db-alert-amount');
    const statusEl = document.getElementById('db-alert-status');
    const thumbEl = document.getElementById('db-alert-thumb');
    const thumbWrapper = document.getElementById('db-alert-thumb-wrapper');
    const msgBubbleEl = document.getElementById('db-alert-message-bubble');
    
    if (songTitleEl) songTitleEl.textContent = alertData.title || 'Không rõ';
    if (donorNameEl) donorNameEl.textContent = alertData.donorName || 'Khách';
    if (amountEl) amountEl.textContent = alertData.amount ? alertData.amount.toLocaleString('vi-VN') + ' VNĐ' : '0 VNĐ';
    
    if (statusEl) {
        statusEl.textContent = alertData.position || 'Hàng đợi';
    }
    
    // Hiển thị ảnh thumbnail nếu có
    if (thumbEl && thumbWrapper) {
        if (alertData.thumbnail) {
            thumbEl.src = alertData.thumbnail;
            thumbEl.style.display = 'block';
            thumbWrapper.style.display = 'block';
        } else {
            thumbEl.src = '';
            thumbEl.style.display = 'none';
            thumbWrapper.style.display = 'none';
        }
    }
    
    // Hiển thị lời nhắn nếu có
    if (msgBubbleEl) {
        const msg = alertData.message || '';
        if (msg.trim() !== '') {
            msgBubbleEl.textContent = `“${msg.trim()}”`;
            msgBubbleEl.style.display = 'block';
        } else {
            msgBubbleEl.textContent = '';
            msgBubbleEl.style.display = 'none';
        }
    }
    
    alertBox.classList.add('active');
    requestAnimationFrame(updateDashboardAlertStacking);
    
    if (dbAlertTimeout) clearTimeout(dbAlertTimeout);
    dbAlertTimeout = setTimeout(() => {
        alertBox.classList.remove('active');
        updateDashboardAlertStacking();
    }, 6000);
}

function closeDashboardAlert() {
    const alertBox = document.getElementById('db-alert-box');
    if (alertBox) {
        alertBox.classList.remove('active');
        updateDashboardAlertStacking();
    }
}

// --- THÔNG BÁO CHỦ KÊNH THÊM NHẠC TRÊN DASHBOARD ---
let dbOwnerAddToastTimeout = null;
function showDashboardOwnerAddToast(song) {
    const toast = document.getElementById('db-owner-add-toast');
    const thumb = document.getElementById('db-owner-add-toast-thumb');
    const titleEl = document.getElementById('db-owner-add-toast-title');
    if (!toast || !titleEl) return;

    const songTitle = song.title || 'Không rõ';
    const thumbSrc = song.thumbnail || 
        (song.type === 'youtube' && song.videoId 
            ? `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg` 
            : '');

    if (thumb) {
        if (thumbSrc) {
            thumb.src = thumbSrc;
            thumb.style.display = 'block';
        } else {
            thumb.src = '';
            thumb.style.display = 'none';
        }
    }
    if (titleEl) titleEl.textContent = songTitle;

    toast.classList.remove('show', 'hide');
    void toast.offsetWidth;
    toast.classList.add('show');

    if (dbOwnerAddToastTimeout) clearTimeout(dbOwnerAddToastTimeout);
    dbOwnerAddToastTimeout = setTimeout(() => {
        closeDashboardOwnerAddToast();
    }, 6000);
}

function closeDashboardOwnerAddToast() {
    const toast = document.getElementById('db-owner-add-toast');
    if (toast) {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.classList.remove('hide'), 350);
    }
}
window.showDashboardOwnerAddToast = showDashboardOwnerAddToast;
window.closeDashboardOwnerAddToast = closeDashboardOwnerAddToast;

// --- HỆ THỐNG LƯU TRỮ LỊCH SỬ THÔNG BÁO ---
state.notifications = [];
state.unreadNotificationsCount = 0;

function loadNotificationsHistory() {
    try {
        const raw = localStorage.getItem('dua_notifications_history');
        state.notifications = raw ? JSON.parse(raw) : [];
        const unreadCountRaw = localStorage.getItem('dua_unread_notifications_count');
        state.unreadNotificationsCount = unreadCountRaw ? parseInt(unreadCountRaw, 10) : 0;
    } catch (e) {
        state.notifications = [];
        state.unreadNotificationsCount = 0;
    }
    updateNotificationBadge();
    renderNotificationsList();
}

function saveNotificationsHistory() {
    localStorage.setItem('dua_notifications_history', JSON.stringify(state.notifications));
    localStorage.setItem('dua_unread_notifications_count', state.unreadNotificationsCount);
}

function saveToNotificationHistory(notif) {
    // Thêm trường unread
    notif.unread = true;
    state.notifications.unshift(notif);
    
    // Giới hạn tối đa 30 thông báo trong lịch sử
    if (state.notifications.length > 30) {
        state.notifications.pop();
    }
    
    state.unreadNotificationsCount++;
    saveNotificationsHistory();
    updateNotificationBadge();
    renderNotificationsList();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    if (state.unreadNotificationsCount > 0) {
        badge.textContent = state.unreadNotificationsCount > 9 ? '9+' : state.unreadNotificationsCount;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
        badge.textContent = '0';
    }
}

function renderNotificationsList() {
    const listContainer = document.getElementById('notification-dropdown-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (state.notifications.length === 0) {
        listContainer.innerHTML = '<div class="notification-empty-state">Không có thông báo nào</div>';
        return;
    }
    
    state.notifications.forEach(notif => {
        const item = document.createElement('div');
        item.className = `notification-item ${notif.unread ? 'unread' : ''}`;
        
        const timeStr = formatRelativeTime(notif.timestamp);
        
        item.innerHTML = `
            ${notif.thumbnail ? `
            <div class="notification-item-thumb">
                <img src="${notif.thumbnail}" alt="thumb">
            </div>
            ` : ''}
            <div class="notification-item-info">
                <div class="notification-item-donor-line">
                    <span class="notification-item-donor">${notif.donorName}</span>
                    <span class="notification-item-action">gửi</span>
                    <span class="notification-item-amount">${notif.amount ? notif.amount.toLocaleString('vi-VN') + ' ₫' : '0 ₫'}</span>
                </div>
                <div class="notification-item-title" title="${notif.title}">${notif.title}</div>
                ${notif.message ? `<div class="notification-item-msg">“${notif.message}”</div>` : ''}
                <div class="notification-item-footer">
                    <span class="notification-item-badge">${notif.position}</span>
                    <span class="notification-item-time">${timeStr}</span>
                </div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            if (notif.unread) {
                notif.unread = false;
                state.unreadNotificationsCount = Math.max(0, state.unreadNotificationsCount - 1);
                saveNotificationsHistory();
                updateNotificationBadge();
                item.classList.remove('unread');
            }
        });
        
        listContainer.appendChild(item);
    });
}

function formatRelativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toggleNotificationCenter(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notification-center-dropdown');
    if (!dropdown) return;
    
    const isVisible = dropdown.classList.contains('visible');
    
    // Đóng các dropdown khác nếu có
    const popover = document.getElementById('quick-add-popover');
    if (popover) popover.classList.remove('visible');
    
    if (!isVisible) {
        dropdown.classList.add('visible');
        state.unreadNotificationsCount = 0;
        state.notifications.forEach(n => n.unread = false);
        saveNotificationsHistory();
        updateNotificationBadge();
        renderNotificationsList();
    } else {
        dropdown.classList.remove('visible');
    }
}

function clearNotificationHistory(event) {
    if (event) event.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo?")) return;
    
    state.notifications = [];
    state.unreadNotificationsCount = 0;
    saveNotificationsHistory();
    updateNotificationBadge();
    renderNotificationsList();
}

// --- HIỂN THỊ THÔNG BÁO HỆ THỐNG TRÊN DASHBOARD ---
let dbSysAlertTimeout = null;
function showDashboardSystemAlert(title, message, badge = 'HỆ THỐNG') {
    const alertBox = document.getElementById('db-system-alert-box');
    if (!alertBox) return;

    const titleEl = document.getElementById('db-sys-alert-title');
    const messageEl = document.getElementById('db-sys-alert-message');

    if (titleEl) {
        titleEl.textContent = title;
    }
    if (messageEl) {
        messageEl.innerHTML = message;
    }

    alertBox.classList.add('active');
    requestAnimationFrame(updateDashboardAlertStacking);

    if (dbSysAlertTimeout) clearTimeout(dbSysAlertTimeout);
    dbSysAlertTimeout = setTimeout(() => {
        alertBox.classList.remove('active');
        updateDashboardAlertStacking();
    }, 4500);
}

function closeDashboardSystemAlert() {
    const alertBox = document.getElementById('db-system-alert-box');
    if (alertBox) {
        alertBox.classList.remove('active');
        updateDashboardAlertStacking();
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

// --- GIỚI HẠN TƯƠNG TÁC CHUNG (7 LẦN TRONG 18 GIỜ) ---
function getValidActionTimestamps() {
    const raw = localStorage.getItem('dua_action_timestamps');
    let timestamps = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const eighteenHours = 18 * 60 * 60 * 1000;
    // Lọc các timestamp nằm trong vòng 18 giờ qua
    timestamps = timestamps.filter(t => (now - t) < eighteenHours);
    localStorage.setItem('dua_action_timestamps', JSON.stringify(timestamps));
    return timestamps;
}

function getNextLimitResetTime() {
    const timestamps = getValidActionTimestamps();
    if (timestamps.length === 0) return "";
    const oldest = timestamps[0];
    const eighteenHours = 18 * 60 * 60 * 1000;
    const targetTime = oldest + eighteenHours;
    const diff = targetTime - Date.now();
    if (diff <= 0) return "";
    return formatDurationHMS(diff);
}

function formatDurationHMS(ms) {
    if (ms <= 0) return "00:00:00";
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateGlobalLimitUI() {
    const el = document.getElementById('global-click-limit-display');
    if (!el) return;
    
    const timestamps = getValidActionTimestamps();
    const limit = 5;
    const remaining = Math.max(0, limit - timestamps.length);
    
    if (remaining === limit) {
        el.textContent = `Lượt: 5/5`;
        el.style.color = 'var(--pineapple-text)';
        // Reset cờ bypass nếu có lại lượt bình thường
        if (state.pausePlayBypass) {
            state.pausePlayBypass = false;
            localStorage.setItem('dua_pause_play_bypass', 'false');
        }
    } else {
        // Tìm timestamp mới nhất (cuối cùng trong mảng) đại diện cho lượt hồi cuối cùng để về mốc full 5/5
        const newest = timestamps[timestamps.length - 1];
        const eighteenHours = 18 * 60 * 60 * 1000;
        const targetTime = newest + eighteenHours;
        const diff = targetTime - Date.now();
        
        if (diff > 0) {
            if (remaining === 0) {
                if (state.pausePlayBypass) {
                    el.innerHTML = `Lượt: 0/5 (Hồi full: ${formatDurationHMS(diff)}) <span style="font-size:0.75rem; color: #10b981;">(Cho phép Play)</span>`;
                    el.style.color = 'var(--pineapple-orange-dark)';
                } else {
                    el.textContent = `Lượt: 0/5 (Hồi full: ${formatDurationHMS(diff)})`;
                    el.style.color = '#ef4444';
                }
            } else {
                el.textContent = `Lượt: ${remaining}/5 (Hồi full: ${formatDurationHMS(diff)})`;
                el.style.color = 'var(--pineapple-text)';
            }
        } else {
            el.textContent = `Lượt: 5/5`;
            el.style.color = 'var(--pineapple-text)';
        }
    }
}

function attemptGlobalAction(actionType, callback) {
    // Nếu là thao tác phát nhạc (play), luôn cho phép và không bị tính vào giới hạn 8 lượt
    if (actionType === 'play') {
        localStorage.setItem('dua_bonus_play_allowed', 'false');
        callback();
        updateRateLimitUI();
        return true;
    }

    const now = Date.now();
    
    let actions = [];
    try {
        const raw = localStorage.getItem('dua_limit_actions_history');
        actions = raw ? JSON.parse(raw) : [];
    } catch (e) {}
    
    // Nếu có thao tác và thao tác đầu tiên đã cũ hơn 12h, hồi phục toàn bộ (8/8)
    if (actions.length > 0) {
        const firstActionTime = actions[0];
        if (now - firstActionTime >= 12 * 60 * 60 * 1000) {
            actions = [];
            localStorage.setItem('dua_limit_actions_history', JSON.stringify(actions));
        }
    }
    
    const bonusPlayAllowed = localStorage.getItem('dua_bonus_play_allowed') === 'true';
    
    // Nếu đã dùng hết 8 lượt trong 12 giờ
    if (actions.length >= 8) {
        // Trường hợp đặc biệt: Phát nhạc (play) khi lượt cuối là pause và đang có bonus play khả dụng
        if (actionType === 'play' && bonusPlayAllowed) {
            localStorage.setItem('dua_bonus_play_allowed', 'false');
            callback();
            updateRateLimitUI();
            return true;
        }
        
        // Kiểm tra lượt cộng thêm (bonus actions) trước khi báo giới hạn
        let bonusActions = parseInt(localStorage.getItem('dua_bonus_actions') || '0', 10);
        if (!isNaN(bonusActions) && bonusActions > 0) {
            localStorage.setItem('dua_bonus_actions', String(bonusActions - 1));
            callback();
            updateRateLimitUI();
            return true;
        }
        
        // Bị giới hạn
        const nextReplenishTime = actions[0] + 12 * 60 * 60 * 1000;
        const timeDiff = nextReplenishTime - now;
        
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        
        const timeStr = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;
        
        showDashboardSystemAlert("Giới hạn thao tác", `Bạn đã dùng hết 8 lượt thao tác trong 12 giờ. Vui lòng đợi ${timeStr} hoặc nạp thêm lượt sử dụng để tiếp tục.`);
        return false;
    }
    
    // Cho phép thực hiện thao tác
    actions.push(now);
    localStorage.setItem('dua_limit_actions_history', JSON.stringify(actions));
    
    // Nếu vừa chạm mốc 8 lượt và hành động vừa thực hiện là pause, cho phép 1 lượt play tiếp theo
    if (actionType === 'pause' && actions.length === 8) {
        localStorage.setItem('dua_bonus_play_allowed', 'true');
    }
    
    // Nếu bấm play thành công (không phải lượt cuối), xoá cờ bonus
    if (actionType === 'play') {
        localStorage.setItem('dua_bonus_play_allowed', 'false');
    }
    
    callback();
    updateRateLimitUI();
    return true;
}

function userRemoveSongFromQueue(songId) {
    if (state.focusMode) return;
    if (state.currentSong && String(songId) === String(state.currentSong.id) && state.currentSong.isAutoPinned) {
        logSystem("Không thể xóa bài hát hiện tại khi đang phát bài hát đợi lâu!", "system");
        showDashboardSystemAlert("Thao tác bị khóa", "Không thể xóa bài đang phát do đợi lâu");
        return;
    }
    attemptGlobalAction('delete', () => {
        removeSongFromQueue(songId, true);
    });
}

function userForcePlaySong(songId) {
    if (state.focusMode) return;
    if (state.currentSong && state.currentSong.isAutoPinned) {
        logSystem("Không thể ép phát bài hát khác khi đang phát bài hát đợi lâu!", "system");
        showDashboardSystemAlert("Thao tác bị khóa", "Không thể ép phát bài khác khi đang phát bài đợi lâu");
        return;
    }
    attemptGlobalAction('force_play', () => {
        forcePlaySong(songId);
    });
}

window.userRemoveSongFromQueue = userRemoveSongFromQueue;
window.userForcePlaySong = userForcePlaySong;

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
        
        // Dọn dẹp các khóa quá hạn 7 ngày
        const now = Date.now();
        state.endedKeys = state.endedKeys.filter(item => now - item.timestamp < 7 * 24 * 60 * 60 * 1000);
        
        // Giới hạn lịch sử tối đa 1000 khóa
        if (state.endedKeys.length > 1000) {
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
    let pathType = 'donate-music';
    
    let splitter = '';
    if (input.includes('donate-music/')) {
        splitter = 'donate-music/';
        pathType = 'donate-music';
    } else if (input.includes('donate-message/')) {
        splitter = 'donate-message/';
        pathType = 'donate-message';
    }
    
    if (splitter) {
        try {
            const urlObj = new URL(input);
            domain = urlObj.origin;
        } catch (e) {
            const match = input.match(/^(https?:\/\/[^\/]+)/);
            if (match) domain = match[1];
        }
        
        const parts = input.split(splitter);
        token = parts[parts.length - 1].split('/')[0].split('?')[0];
    } else {
        token = input;
    }
    
    return { domain, token, pathType };
}

// ==========================================
// QUẢN LÝ LỜI NHẮN DONATE & LỊCH SỬ 7 NGÀY
// ==========================================
function hasSongLink(message) {
    if (!message) return false;
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const urlMatches = message.match(urlRegex) || [];
    for (const url of urlMatches) {
        if (url.includes('soundcloud.com') || parseYoutubeId(url)) {
            return true;
        }
    }
    return false;
}

function formatMessageWithLinks(msg, donorName, donorAmount) {
    if (!msg) return '';
    
    const escapedMsg = msg
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
        
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    return escapedMsg.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" onclick="event.stopPropagation()" style="color: var(--pineapple-orange); text-decoration: underline;">${url}</a>`;
    });
}

async function quickAddSongFromHistory(type, videoId, scUrl, donorNameEncoded, donorAmount) {
    const donorName = decodeURIComponent(donorNameEncoded);
    try {
        logSystem(`Đang lấy thông tin bài hát từ lịch sử donate của <strong>${donorName}</strong>...`, 'system');
        const meta = await fetchSongMetadata(type, videoId || null, scUrl || null);
        const uniqueKey = `msg_manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const msgItem = {
            id: uniqueKey,
            musicKey: uniqueKey,
            isZyPage: true,
            fromMessage: true,
            isQuickAdd: true,
            type: type,
            videoId: videoId || null,
            
            soundcloudUrl: scUrl || null,
            title: meta.title,
            thumbnail: meta.thumbnail,
            donorName: donorName,
            amount: Number(donorAmount) || 0,
            message: "",
            start: 0,
            end: null,
            timestamp: Date.now(),
            localAddedAt: Date.now()
        };
        
        insertSongSmartly(msgItem);
        broadcastNewDonationAlert(msgItem);
        saveQueue();
        sortAndRefreshQueue();
        logSystem(`Đã thêm bài hát từ tin nhắn: <strong>${meta.title}</strong>`, 'queue');
        showDashboardSystemAlert("Đã thêm nhạc", `Đã thêm bài hát: <strong>${meta.title}</strong>`, 'HÀNG ĐỢI');
        if (!state.currentSong && !state.focusMode) {
            playNextInQueue();
        }
    } catch (e) {
        alert("Lỗi khi thêm bài hát: " + e.message);
    }
}
window.quickAddSongFromHistory = quickAddSongFromHistory;

async function handleNewDonation(donation, shouldAlert = true) {
    if (!donation || !donation.name) return;
    
    let isNewInsert = false;
    let isUpdated = false;
    
    if (window.electronAPI && typeof window.electronAPI.dbAddDonation === 'function') {
        const res = await window.electronAPI.dbAddDonation(donation);
        if (res && res.success) {
            isNewInsert = !!res.inserted;
            isUpdated = !!res.updated;
        } else {
            return;
        }
        if (isUpdated) {
            await renderDonationHistory();
            return;
        }
        if (!isNewInsert) {
            return;
        }
    } else {
        // Check if donation already exists in our history
        let history = await getDonationHistory();
        const existingIndex = history.findIndex(item => 
            item.id === donation.id || 
            (item.name === donation.name && item.amount === donation.amount && Math.abs(item.timestamp - donation.timestamp) < 5000)
        );
        
        if (existingIndex !== -1) {
            // Nếu đã tồn tại nhưng lần này có kèm link nhạc mà trong lịch sử chưa lưu, hãy cập nhật lại
            if (donation.songLink && !history[existingIndex].songLink) {
                history[existingIndex].songLink = donation.songLink;
                history[existingIndex].isMusicOrder = true;
                localStorage.setItem('dua_donation_history', JSON.stringify(history));
                await renderDonationHistory();
            }
            return;
        }
        
        // Mark as new/unread
        donation.isNew = true;
        donation.timestamp = donation.timestamp || Date.now();
        
        // Add to history
        history.unshift(donation);
        
        // Filter out donations older than 30 days (1 month)
        const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        history = history.filter(item => item.timestamp >= oneMonthAgo);
        
        // Save to localStorage
        localStorage.setItem('dua_donation_history', JSON.stringify(history));
        isNewInsert = true;
    }
    
    // Gửi thông báo Taskbar phi tập trung (cho màn hình phụ / không ảnh hưởng game)
    const isStartupSync = (Date.now() - appStartTime) < 5000;
    const isTestDonate = donation.id && donation.id.toString().includes('test_donate');
    
    // Chỉ hiển thị nếu không phải lúc đồng bộ khởi động, hoặc đó là test donate
    if (shouldAlert && (!isStartupSync || isTestDonate || donation.isVoteSkip)) {
        if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            const title = `${donation.name || 'Khách'} - ${(donation.amount || 0).toLocaleString('vi-VN')} ₫`;
            let msgText = donation.message || '';
            
            // Xác định loại hình donate để ghi nhãn thông báo phù hợp
            const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
            const hasLink = hasSongLink(donation.message);
            const isSong = (donation.isMusicOrder || (hasLink && donation.amount >= minAmount));
            
            if (!isSong || donation.isVoteSkip) {
                // Kiểm tra xem có chứa mã gia hạn không
                const activeCode = state.currentSong?.extensionCode;
                const words = (donation.message || '').split(/\s+/);
                const isExtensionCode = activeCode && words.some(word => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toUpperCase() === activeCode);
                
                if (donation.isVoteSkip) {
                    const voteProgress = donation.voteSkipTarget
                        ? ` (${Number(donation.voteSkipCurrent || 0).toLocaleString('vi-VN')} / ${Number(donation.voteSkipTarget).toLocaleString('vi-VN')} ₫)`
                        : '';
                    msgText = `Vote Skip${voteProgress}${donation.message ? `\n${donation.message}` : ''}`;
                } else if (isExtensionCode) {
                    msgText = `Gia hạn bài hát: ${donation.message}`;
                } else if (state.currentSong?.voteSkipActive && (donation.message || '').toLowerCase().includes('#skip')) {
                    msgText = `Vote Skip bài hát: ${donation.message}`;
                } else {
                    msgText = msgText || '(Không có lời nhắn)';
                }
                
                window.electronAPI.showTaskbarNotification(title, "\n" + msgText, document.body.classList.contains('dark-mode'));
            }
        }
    }
    
    // Chỉ kích hoạt thông báo góc trên Dashboard nếu rất mới và được yêu cầu (hoặc test donate)
    const isVeryRecent = Math.abs(Date.now() - donation.timestamp) < 120000;
    if (shouldAlert && (isVeryRecent || isTestDonate)) {
        const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
        const hasLink = hasSongLink(donation.message);
        const willBeSong = (donation.isMusicOrder || (hasLink && donation.amount >= minAmount));
        
        if (!willBeSong || donation.isVoteSkip) {
            showDashboardNewDonationAlert({
                id: donation.id,
                donorName: donation.name,
                amount: donation.amount,
                title: donation.isVoteSkip ? `Vote Skip${donation.message ? ` • ${donation.message}` : ''}` : (donation.message || '(Không có lời nhắn)'),
                position: donation.isVoteSkip ? 'VOTE SKIP' : 'DONATE',
                timestamp: donation.timestamp
            });
        }
    }
    renderDonationHistory();
}

async function migrateDonationHistoryToSqlite() {
    if (!window.electronAPI || typeof window.electronAPI.dbAddDonation !== 'function') {
        return;
    }
    const migrated = localStorage.getItem('dua_donation_history_migrated');
    if (migrated === 'true') {
        return;
    }
    
    try {
        const raw = localStorage.getItem('dua_donation_history');
        if (raw) {
            const history = JSON.parse(raw);
            if (Array.isArray(history) && history.length > 0) {
                console.log(`Starting migration of ${history.length} donations to SQLite...`);
                const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
                for (const item of sortedHistory) {
                    await window.electronAPI.dbAddDonation(item);
                }
                console.log('Migration to SQLite completed successfully.');
            }
        }
    } catch (e) {
        console.error('Failed to migrate donation history to SQLite:', e);
    } finally {
        localStorage.setItem('dua_donation_history_migrated', 'true');
    }
}

async function getDonationHistory() {
    if (window.electronAPI && typeof window.electronAPI.dbGetDonations === 'function') {
        return await window.electronAPI.dbGetDonations();
    }
    const raw = localStorage.getItem('dua_donation_history');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return parsed.filter(item => item.timestamp >= oneMonthAgo);
    } catch (e) {
        return [];
    }
}

function saveDonationHistory(history) {
    localStorage.setItem('dua_donation_history', JSON.stringify(history));
}

const donationSongMetadataCache = new Map();
try {
    const cached = sessionStorage.getItem('dua_donation_song_meta_cache');
    if (cached) {
        const parsed = JSON.parse(cached);
        for (const k in parsed) {
            donationSongMetadataCache.set(k, parsed[k]);
        }
    }
} catch (e) {}

function extractSongLinkFromMessage(msg) {
    if (!msg) return null;
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const matches = msg.match(urlRegex);
    if (!matches) return null;
    for (const url of matches) {
        if (parseYoutubeId(url) || url.includes('soundcloud.com')) {
            return url;
        }
    }
    return null;
}

function getOrFetchSongMetadata(url, onFetched) {
    if (donationSongMetadataCache.has(url)) {
        return donationSongMetadataCache.get(url);
    }
    
    // Đánh dấu đang tải
    donationSongMetadataCache.set(url, { loading: true });
    
    let fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    if (url.includes('soundcloud.com')) {
        fetchUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    }
    
    fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
            const meta = {
                title: data.title || 'Bài hát từ link đính kèm',
                thumbnail: data.thumbnail_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop',
                author: data.author_name || (url.includes('soundcloud.com') ? 'SoundCloud' : 'YouTube Artist'),
                loading: false
            };
            donationSongMetadataCache.set(url, meta);
            try {
                const obj = {};
                donationSongMetadataCache.forEach((v, k) => { obj[k] = v; });
                sessionStorage.setItem('dua_donation_song_meta_cache', JSON.stringify(obj));
            } catch (e) {}
            onFetched();
        })
        .catch(err => {
            console.error("Lỗi lấy metadata oEmbed cho:", url, err);
            donationSongMetadataCache.set(url, {
                title: 'Đường dẫn bài hát',
                thumbnail: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop',
                author: url.includes('soundcloud.com') ? 'SoundCloud' : 'YouTube',
                loading: false
            });
            onFetched();
        });
        
    return { loading: true };
}

let currentDonationSearchQuery = '';

function onDonationSearchInput(query) {
    currentDonationSearchQuery = String(query).trim().toLowerCase();
    renderDonationHistory();
}
window.onDonationSearchInput = onDonationSearchInput;

function getFriendlyDateString(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const isToday = date.getDate() === today.getDate() &&
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();
                    
    const isYesterday = date.getDate() === yesterday.getDate() &&
                        date.getMonth() === yesterday.getMonth() &&
                        date.getFullYear() === yesterday.getFullYear();
                        
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    if (isToday) {
        return "Hôm nay";
    } else if (isYesterday) {
        return "Hôm qua";
    } else {
        return `Ngày ${day}/${month}/${year}`;
    }
}

function formatHourMinute(timestamp) {
    const date = new Date(timestamp);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${hrs}:${mins}`;
}

async function renderDonationHistory() {
    const container = document.getElementById('donation-history-list');
    if (!container) return;
    
    const fullHistory = await getDonationHistory();
    const totalRevenue = fullHistory.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalCount = fullHistory.length;
    
    const statsLine = document.getElementById('donation-stats-line');
    if (statsLine) {
        statsLine.textContent = `Tổng doanh thu: ${totalRevenue.toLocaleString('vi-VN')} VNĐ | Số lượt donate: ${totalCount}`;
    }
    
    let history = [...fullHistory];
    
    // Lọc lịch sử nếu có từ khóa tìm kiếm
    if (currentDonationSearchQuery) {
        history = history.filter(item => {
            const date = new Date(item.timestamp);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`.toLowerCase();
            
            const name = String(item.name || '').toLowerCase();
            const amount = String(item.amount || '').toLowerCase();
            const amountFormatted = (item.amount ? item.amount.toLocaleString('vi-VN') : '').toLowerCase();
            const message = String(item.message || '').toLowerCase();
            
            return name.includes(currentDonationSearchQuery) ||
                   amount.includes(currentDonationSearchQuery) ||
                   amountFormatted.includes(currentDonationSearchQuery) ||
                   message.includes(currentDonationSearchQuery) ||
                   timeStr.includes(currentDonationSearchQuery);
        });
    }
    
    if (history.length === 0) {
        if (currentDonationSearchQuery) {
            container.innerHTML = `
                <div class="empty-history-notice">
                    <i class="fa-solid fa-magnifying-glass empty-history-icon"></i>
                    <div class="empty-history-title">Không tìm thấy kết quả</div>
                    <div class="empty-history-subtitle">Thử tìm kiếm bằng từ khóa khác xem sao.</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-history-notice">
                    <i class="fa-solid fa-envelope-open-text empty-history-icon"></i>
                    <div class="empty-history-title">Chưa có lời nhắn nào</div>
                    <div class="empty-history-subtitle">Các lời nhắn donate sẽ xuất hiện ở đây.</div>
                </div>
            `;
        }
        return;
    }
    
    container.innerHTML = '';
    
    // Group by date
    const groups = [];
    history.forEach(item => {
        const dateText = getFriendlyDateString(item.timestamp);
        let group = groups.find(g => g.dateText === dateText);
        if (!group) {
            group = { dateText: dateText, items: [] };
            groups.push(group);
        }
        group.items.push(item);
    });
    
    const timelineEl = document.createElement('div');
    timelineEl.className = 'donation-timeline';
    
    groups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'timeline-group';
        
        // Date Header
        const headerEl = document.createElement('div');
        headerEl.className = 'timeline-date-header';
        headerEl.innerHTML = `
            <span class="timeline-date-text">${group.dateText}</span>
            <span class="timeline-date-separator" style="color: var(--pineapple-text); opacity: 0.4; margin: 0 0.2rem;">•</span>
            <span class="timeline-date-count">${group.items.length} lượt donate</span>
        `;
        groupEl.appendChild(headerEl);
        
        // Group Items (Grid)
        const itemsEl = document.createElement('div');
        itemsEl.className = 'timeline-group-items';
        
        group.items.forEach(item => {
            // Create the card element
            const cardEl = document.createElement('div');
            cardEl.className = `donation-history-item${item.isNew ? ' new-donation' : ''}`;
            cardEl.setAttribute('data-id', item.id);
            cardEl.title = "Click để xem chi tiết";
            cardEl.onclick = () => {
                showDonationDetail(item);
            };
            
            const date = new Date(item.timestamp);
            const fullTimeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            let songLink = item.songLink || extractSongLinkFromMessage(item.message);
            if (songLink && !songLink.startsWith('http')) {
                const ytId = parseYoutubeId(songLink);
                if (ytId) {
                    songLink = `https://www.youtube.com/watch?v=${ytId}`;
                }
            }
            let attachmentHtml = '';
            if (songLink) {
                const meta = getOrFetchSongMetadata(songLink, () => {
                    renderDonationHistory();
                });
                
                if (meta.loading) {
                    attachmentHtml = `
                        <div class="song-attachment-loading" onclick="event.stopPropagation()" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                            <svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải thông tin nhạc...
                        </div>
                    `;
                } else {
                    const videoId = parseYoutubeId(songLink);
                    const scUrl = songLink.includes('soundcloud.com') ? songLink.split(/[\s?#]/)[0] : null;
                    const type = videoId ? 'youtube' : (scUrl ? 'soundcloud' : '');
                    
                    attachmentHtml = `
                        <div class="donation-song-attachment" onclick="event.stopPropagation()">
                            <img class="song-attachment-thumb" src="${meta.thumbnail}">
                            <div class="song-attachment-info">
                                <div class="song-attachment-title" title="${meta.title}">${meta.title}</div>
                                <div class="song-attachment-author" title="${meta.author}">${meta.author}</div>
                            </div>
                            <button class="song-attachment-add-btn" onclick="window.quickAddSongFromHistory('${type}', '${videoId || ''}', '${scUrl || ''}', '${encodeURIComponent(item.name)}', ${item.amount})">
                                Thêm nhanh
                            </button>
                        </div>
                    `;
                }
            }
            
            cardEl.innerHTML = `
                <div class="donation-history-meta">
                    <span class="donation-history-donor">
                        <strong>${item.name}</strong>
                        <span class="donation-history-amount">${item.amount.toLocaleString('vi-VN')} VNĐ</span>
                    </span>
                    <span class="donation-history-time">${fullTimeStr}</span>
                </div>
                ${item.message ? `<div class="donation-history-message">${formatMessageWithLinks(item.message, item.name, item.amount)}</div>` : '<div class="donation-history-message" style="opacity: 0.5;">(Không có lời nhắn)</div>'}
                ${attachmentHtml}
            `;
            
            itemsEl.appendChild(cardEl);
        });
        
        groupEl.appendChild(itemsEl);
        timelineEl.appendChild(groupEl);
    });
    
    container.appendChild(timelineEl);
    
    renderRecentDonationsDashboard();
}

async function renderRecentDonationsDashboard() {
    const container = document.getElementById('recent-donations-container');
    if (!container) return;

    const history = await getDonationHistory();
    // Lấy tối đa 2 donate gần nhất
    const recent = history.slice(0, 2);

    if (recent.length === 0) {
        container.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--pineapple-text); opacity: 0.6; text-align: center; padding: 0.5rem 0;">
                Chưa nhận được donate nào
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    recent.forEach(item => {
        let songLink = item.songLink || extractSongLinkFromMessage(item.message);
        let songTitleHtml = '';

        if (songLink) {
            if (!songLink.startsWith('http')) {
                const ytId = parseYoutubeId(songLink);
                if (ytId) songLink = `https://www.youtube.com/watch?v=${ytId}`;
            }
            const meta = getOrFetchSongMetadata(songLink, () => {
                renderRecentDonationsDashboard();
            });
            if (meta && !meta.loading) {
                songTitleHtml = `<div style="font-size: 0.85rem; font-weight: 800; color: var(--pineapple-orange-dark, #D97706); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${meta.title}">🎵 ${meta.title}</div>`;
            } else {
                songTitleHtml = `<div style="font-size: 0.85rem; font-weight: 800; color: var(--pineapple-orange-dark, #D97706); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">🎵 Đang tải tên bài hát...</div>`;
            }
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'recent-donation-item';
        itemEl.style.cssText = 'background: var(--pineapple-yellow-light); border: 2px solid var(--pineapple-border-color); border-radius: 12px; padding: 0.6rem 0.8rem; box-shadow: 2px 2px 0px var(--pineapple-shadow); display: flex; flex-direction: column; gap: 0.15rem;';

        itemEl.innerHTML = `
            ${songTitleHtml}
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 800; color: var(--pineapple-text);">
                <span>${item.name}</span>
                <span style="color: #10B981;">+${item.amount.toLocaleString('vi-VN')} ₫</span>
            </div>
            ${item.message ? `<div style="font-size: 0.8rem; color: var(--pineapple-text); opacity: 0.85; line-height: 1.3; word-break: break-word; white-space: pre-wrap;">${item.message}</div>` : ''}
        `;
        container.appendChild(itemEl);
    });
}

async function showDonationDetail(item) {
    if (item.isNew) {
        const cardEl = document.querySelector(`.donation-history-item[data-id="${item.id}"]`);
        if (cardEl) {
            cardEl.classList.remove('new-donation');
        }
        await markDonationAsRead(item.id);
    }
    
    const modal = document.getElementById('donation-detail-modal');
    if (!modal) return;
    
    document.getElementById('donation-detail-donor').textContent = item.name;
    document.getElementById('donation-detail-amount').textContent = `${item.amount.toLocaleString('vi-VN')} VNĐ`;
    
    const date = new Date(item.timestamp);
    const fullTimeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    document.getElementById('donation-detail-time').textContent = fullTimeStr;
    
    const msgArea = document.getElementById('donation-detail-message');
    msgArea.innerHTML = item.message ? formatMessageWithLinks(item.message, item.name, item.amount) : '<span style="opacity: 0.5;">(Không có lời nhắn)</span>';
    
    const attachContainer = document.getElementById('donation-detail-attachment-container');
    const attachArea = document.getElementById('donation-detail-attachment');
    
    let songLink = item.songLink || extractSongLinkFromMessage(item.message);
    if (songLink && !songLink.startsWith('http')) {
        const ytId = parseYoutubeId(songLink);
        if (ytId) {
            songLink = `https://www.youtube.com/watch?v=${ytId}`;
        }
    }
    
    if (songLink) {
        attachContainer.style.display = 'block';
        attachArea.innerHTML = `
            <div class="song-attachment-loading" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; border: 1.5px solid var(--pineapple-border-color); border-radius: 12px;">
                <svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải thông tin nhạc...
            </div>
        `;
        
        const meta = getOrFetchSongMetadata(songLink, () => {
            if (modal.style.display === 'flex') {
                const updatedMeta = getOrFetchSongMetadata(songLink, () => {});
                if (updatedMeta && !updatedMeta.loading) {
                    const videoId = parseYoutubeId(songLink);
                    const scUrl = songLink.includes('soundcloud.com') ? songLink.split(/[\s?#]/)[0] : null;
                    const type = videoId ? 'youtube' : (scUrl ? 'soundcloud' : '');
                    
                    attachArea.innerHTML = `
                        <div class="donation-song-attachment" style="margin-top: 0; width: 100%;">
                            <img class="song-attachment-thumb" src="${updatedMeta.thumbnail}">
                            <div class="song-attachment-info">
                                <div class="song-attachment-title" title="${updatedMeta.title}">${updatedMeta.title}</div>
                                <div class="song-attachment-author" title="${updatedMeta.author}">${updatedMeta.author}</div>
                            </div>
                            <button class="song-attachment-add-btn" onclick="window.quickAddSongFromHistory('${type}', '${videoId || ''}', '${scUrl || ''}', '${encodeURIComponent(item.name)}', ${item.amount})">
                                Thêm nhanh
                            </button>
                        </div>
                    `;
                }
            }
        });
        
        if (meta && !meta.loading) {
            const videoId = parseYoutubeId(songLink);
            const scUrl = songLink.includes('soundcloud.com') ? songLink.split(/[\s?#]/)[0] : null;
            const type = videoId ? 'youtube' : (scUrl ? 'soundcloud' : '');
            
            attachArea.innerHTML = `
                <div class="donation-song-attachment" style="margin-top: 0; width: 100%;">
                    <img class="song-attachment-thumb" src="${meta.thumbnail}">
                    <div class="song-attachment-info">
                        <div class="song-attachment-title" title="${meta.title}">${meta.title}</div>
                        <div class="song-attachment-author" title="${meta.author}">${meta.author}</div>
                    </div>
                    <button class="song-attachment-add-btn" onclick="window.quickAddSongFromHistory('${type}', '${videoId || ''}', '${scUrl || ''}', '${encodeURIComponent(item.name)}', ${item.amount})">
                        Thêm nhanh
                    </button>
                </div>
            `;
        }
    } else {
        attachContainer.style.display = 'none';
        attachArea.innerHTML = '';
    }
    
    modal.style.display = 'flex';
}

function closeDonationDetailModal() {
    const modal = document.getElementById('donation-detail-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}
window.showDonationDetail = showDonationDetail;
window.closeDonationDetailModal = closeDonationDetailModal;

async function markDonationAsRead(id) {
    if (window.electronAPI && typeof window.electronAPI.dbMarkRead === 'function') {
        await window.electronAPI.dbMarkRead(id);
    } else {
        let history = await getDonationHistory();
        const index = history.findIndex(item => item.id === id);
        if (index !== -1) {
            history[index].isNew = false;
            saveDonationHistory(history);
        }
    }
    await renderDonationHistory();
}

async function markAllDonationsAsRead() {
    if (window.electronAPI && typeof window.electronAPI.dbMarkAllRead === 'function') {
        await window.electronAPI.dbMarkAllRead();
    } else {
        let history = await getDonationHistory();
        let changed = false;
        history.forEach(item => {
            if (item.isNew) {
                item.isNew = false;
                changed = true;
            }
        });
        if (changed) {
            saveDonationHistory(history);
        }
    }
    await renderDonationHistory();
}
window.markAllDonationsAsRead = markAllDonationsAsRead;

async function clearAllDonationHistory() {
    if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử lời nhắn donate?")) {
        if (window.electronAPI && typeof window.electronAPI.dbClearHistory === 'function') {
            await window.electronAPI.dbClearHistory();
        } else {
            saveDonationHistory([]);
        }
        await renderDonationHistory();
    }
}

let fsAlertTimeout = null;
function showFullscreenDonationAlert(donation) {
    const overlay = document.getElementById('fullscreen-donation-alert');
    if (!overlay) return;
    
    const amountEl = document.getElementById('fs-alert-amount');
    const senderEl = document.getElementById('fs-alert-sender');
    const messageEl = document.getElementById('fs-alert-message-box');
    
    if (amountEl) amountEl.textContent = donation.amount.toLocaleString('vi-VN');
    if (senderEl) senderEl.textContent = donation.name;
    if (messageEl) {
        messageEl.textContent = donation.message ? `"${donation.message}"` : '(Không có lời nhắn)';
    }
    
    overlay.style.display = 'flex';
    
    if (fsAlertTimeout) {
        clearTimeout(fsAlertTimeout);
    }
    
    fsAlertTimeout = setTimeout(() => {
        closeFullscreenDonationAlert();
    }, 10000);
}

function closeFullscreenDonationAlert() {
    const overlay = document.getElementById('fullscreen-donation-alert');
    if (overlay) {
        overlay.style.display = 'none';
    }
    if (fsAlertTimeout) {
        clearTimeout(fsAlertTimeout);
        fsAlertTimeout = null;
    }
    renderDonationHistory();
}

// Kết nối Live với ZyPage
async function connectZyPageLive(isAutoReconnect = false) {
    const urlInput = document.getElementById('zypage-url');
    const shopIdInput = document.getElementById('zypage-shop-id');
    if (!urlInput) return;

    const inputVal = urlInput.value.trim();
    if (!inputVal) {
        if (!isAutoReconnect) alert("Vui lòng điền link trang ZyPage trước!");
        return;
    }

    const { domain, token, pathType } = extractZyPageDomainAndToken(inputVal);
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
        state.zypagePathType = pathType;
        localStorage.setItem('dua_zypage_token', token);
        localStorage.setItem('dua_zypage_shop_id', shopId);
        localStorage.setItem('dua_zypage_domain', domain);
        localStorage.setItem('dua_zypage_path_type', pathType);
        saveConfigToAppData(inputVal, shopId);
        startFirebaseListener(shopId, token);
        return;
    }

    try {
        // Tải mã nguồn trang ZyPage để bóc tách Shop ID (sử dụng proxy có fallback)
        const resJson = await fetchWithCorsProxy(`${domain}/${pathType}/${token}`);
        
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
        state.zypagePathType = pathType;
        localStorage.setItem('dua_zypage_token', token);
        localStorage.setItem('dua_zypage_shop_id', shopId);
        localStorage.setItem('dua_zypage_domain', domain);
        localStorage.setItem('dua_zypage_path_type', pathType);
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
                
                // Trích xuất trực tiếp từ Firebase Event Data nếu là sự kiện 'add'
                if (val.type === 'add' && val.data) {
                    let isExtended = false;
                    let isVoteSkipped = false;
                    try {
                        const amountStr = String(val.data.amount || '0').replace(/[^0-9]/g, '');
                        const donateAmount = Number(amountStr) || 0;
                        const message = String(val.data.text || val.data.message || '').trim();
                        const isOfficial = !!(val.data.music || val.data.type === 'music');
                        
                        let firebaseSongLink = null;
                        if (isOfficial && val.data.music) {
                            if (typeof val.data.music === 'string') {
                                firebaseSongLink = val.data.music;
                            } else if (typeof val.data.music === 'object') {
                                firebaseSongLink = val.data.music.id || val.data.music.url;
                            }
                        }
                        
                        const donation = {
                            id: val.data.id || val.data.key || `donate_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                            name: val.data.name || 'Khách',
                            amount: donateAmount,
                            message: message,
                            timestamp: normalizeTimestamp(val.data.time || val.data.timestamp || Date.now()),
                            isMusicOrder: isOfficial,
                            songLink: firebaseSongLink
                        };
                        if (checkAndApplyVoteSkip(donation)) {
                            isVoteSkipped = true;
                        } else if (checkAndApplyExtension(donation)) {
                            isExtended = true;
                        } else {
                            handleNewDonation(donation, true);
                        }
                    } catch (e) {
                        console.error("Lỗi khi ghi nhận donate từ Firebase Event:", e);
                    }

                    const hasLink = hasSongLink(String(val.data.text || val.data.message || '').trim());
                    if ((isExtended || isVoteSkipped) && !hasLink) {
                        return;
                    }

                    try {
                        const isOfficial = !!(val.data.music || val.data.type === 'music');
                        if (isOfficial) {
                            logSystem(`[Realtime Firebase] Lượt donate từ <strong>${val.data.name || 'Khách'}</strong> là order nhạc chính thức. Bỏ qua bóc tách tin nhắn.`, 'system');
                        }
                        const amountStr = String(val.data.amount || '0').replace(/[^0-9]/g, '');
                        const donateAmount = Number(amountStr) || 0;
                        const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
                        
                        if (!isOfficial && donateAmount >= minAmount) {
                            const message = String(val.data.text || val.data.message || '').trim();
                            if (message) {
                                // Tìm link nhạc trong message
                                const urlRegex = /https?:\/\/[^\s<>"']+/gi;
                                const urlMatches = message.match(urlRegex) || [];
                                let type = null;
                                let videoId = null;
                                let soundcloudUrl = null;

                                for (const url of urlMatches) {
                                    if (url.includes('soundcloud.com')) {
                                        soundcloudUrl = url.split(/[\s?#]/)[0];
                                        type = 'soundcloud';
                                        break;
                                    }
                                    const ytId = parseYoutubeId(url);
                                    if (ytId) {
                                        videoId = ytId;
                                        type = 'youtube';
                                        break;
                                    }
                                }

                                if (type) {
                                    const eventVal = val.value || val.data.time || Date.now();
                                    const songTimestamp = normalizeTimestamp(eventVal);
                                    const musicKey = `msg_live_${eventVal}_${songTimestamp}`;
                                    
                                    // Bỏ qua nếu đã phát trước đó hoặc đã tồn tại trong queue
                                    const isEnded = state.endedKeys.some(e => e.key === musicKey);
                                    const isExist = state.queue.some(q => 
                                        q.id === musicKey || 
                                        (q.type === type && (
                                            (type === 'youtube' && q.videoId === videoId) ||
                                            (type === 'soundcloud' && q.soundcloudUrl === soundcloudUrl)
                                        ) && q.timestamp === songTimestamp)
                                    );

                                    if (!isEnded && !isExist) {
                                        // Lấy thông tin bài hát (tiêu đề, thumbnail) trước khi đưa vào hàng đợi
                                        fetchSongMetadata(type, videoId, soundcloudUrl).then((meta) => {
                                            const msgItem = {
                                                id: musicKey,
                                                musicKey: musicKey,
                                                isZyPage: true,
                                                fromMessage: true,
                                                type: type,
                                                videoId: videoId || null,
                                                
                                                soundcloudUrl: soundcloudUrl || null,
                                                title: meta.title,
                                                thumbnail: meta.thumbnail,
                                                donorName: val.data.name || 'Khách ZyPage',
                                                amount: donateAmount,
                                                message: message,
                                                start: 0,
                                                end: null,
                                                timestamp: songTimestamp,
                                                localAddedAt: Date.now()
                                            };

                                            insertSongSmartly(msgItem);
                                            broadcastNewDonationAlert(msgItem);
                                            logSystem(`[Realtime Firebase] Phát hiện link nhạc trong tin nhắn donate của <strong>${msgItem.donorName}</strong>: ${msgItem.title}`, 'queue');
                                            
                                            // Cập nhật giao diện queue
                                            sortAndRefreshQueue();
                                            if (!state.currentSong && !state.focusMode) {
                                                playNextInQueue();
                                            }
                                        }).catch((err) => {
                                            console.error("Lỗi lấy metadata cho bài hát từ tin nhắn realtime:", err);
                                        });
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Lỗi xử lý trích xuất link nhạc realtime:", err);
                    }
                }
                
                syncQueueFromZyPageApi(shopId);
            } else if (val.type === 'donateMusicPause') {
                togglePlayPause();
            } else if (val.type === 'donateMusicEnd') {
                if (state.currentSong && !state.currentSong.isZyPage) {
                    logSystem(`Nhận lệnh kết thúc bài từ ZyPage, nhưng bài hát đang phát (${state.currentSong.title}) là nhạc Thêm nhanh cục bộ. Bỏ qua lệnh này.`, 'system');
                } else {
                    skipSong(false);
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
        initOverlayConnection();

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
    initOverlayConnection();
}

// Gọi API lấy hàng đợi bài hát mới nhất từ máy chủ ZyPage
async function syncQueueFromZyPageApi(shopId, isManual = false) {
    if (state.isSyncingQueue) {
        state.syncQueuePending = true;
        return;
    }
    state.isSyncingQueue = true;

    try {
        const getUrl = `${state.zypageDomain}/api/get_data_by_id?table=shop&data=donate&id=${shopId}&v=${Date.now()}`;
        logSystem(`[ZyPage API] Đang gửi yêu cầu đồng bộ tới ZyPage${isManual ? ' (Thủ công)' : ''}: ${getUrl}`, 'system');
        
        const resJson = await fetchWithCorsProxy(getUrl);
        if (!resJson.contents) {
            logSystem(`[ZyPage API] Không nhận được phản hồi nội dung từ proxy cho URL: ${getUrl}`, 'error');
            return;
        }

        const contents = JSON.parse(resJson.contents);
        logSystem(`[ZyPage API] Phản hồi JSON nhận được từ ZyPage:<br><pre style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 8px; overflow-x: auto; max-height: 200px; font-family: monospace; font-size: 0.75rem; text-align: left; margin: 5px 0; border: 1px solid var(--pineapple-border-color); white-space: pre-wrap; word-break: break-all;">${JSON.stringify(contents, null, 2)}</pre>`, 'system');
        
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
        const plainDonateList = donateObj?.list || {};

        let addedCount = 0;
        let maxTimestamp = state.lastSyncedDonateTime;

        Object.entries(musicList).forEach(([key, item]) => {
            if (!item.music || !item.music.id) return;

            const songTimestamp = normalizeTimestamp(item.order?.time || item.music?.key || key);

            // Ghi nhận donate nhạc vào Lịch sử & Thông báo
            let isExtended = false;
            if (item.order) {
                try {
                    const amountStr = String(item.order.amount || '0').replace(/[^0-9]/g, '');
                    const donation = {
                        id: item.music?.key || key,
                        name: item.order.name || 'Khách ZyPage',
                        amount: Number(amountStr) || 0,
                        message: item.order.message || '',
                        timestamp: songTimestamp,
                        isMusicOrder: true,
                        songLink: item.music.id
                    };
                    if (checkAndApplyVoteSkip(donation)) {
                        isExtended = true;
                    } else if (checkAndApplyExtension(donation)) {
                        isExtended = true;
                    } else if (donation.name) {
                        handleNewDonation(donation, true);
                    }
                } catch (e) {
                    console.error("Lỗi khi ghi nhận donate từ musicList:", e);
                }
            }

            if (isExtended) {
                return;
            }

            if (!isManual) {
                // Chỉ lấy bài hát mới được donate trong khoảng thời gian ngắn, bỏ qua các bài đã đồng bộ trước đó
                if (songTimestamp <= state.lastSyncedDonateTime) {
                    return;
                }

                // Bỏ qua các bài hát có thời gian donate quá 7 ngày trước để tránh nhận nhầm lệnh cũ
                const now = Date.now();
                if (now - songTimestamp > 7 * 24 * 60 * 60 * 1000) {
                    return;
                }
            }

            if (songTimestamp > maxTimestamp) {
                maxTimestamp = songTimestamp;
            }

            const musicIdStr = String(item.music.id).trim();
            let type = 'youtube';
            let videoId = null;
            
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
            
            // Bỏ qua nếu không phải đồng bộ thủ công và bài hát đã phát xong hoặc bị xóa trước đó
            if (!isManual && state.endedKeys.some(e => e.key === String(musicKey))) {
                return;
            }

            const uniqueKey = musicKey || item.order?.time || (videoId || spotifyId || soundcloudUrl);
            const isExist = state.queue.some(q => q.id === uniqueKey || 
                (q.type === type && (
                    (type === 'youtube' && q.videoId === videoId) ||
                    (type === 'spotify' && q.spotifyId === spotifyId) ||
                    (type === 'soundcloud' && q.soundcloudUrl === soundcloudUrl)
                ) && q.timestamp === songTimestamp)
            );

            if (!isExist) {
                const localItem = {
                    id: uniqueKey,
                    musicKey: musicKey,
                    isZyPage: true,
                    type: type,
                    videoId: videoId,
                    
                    soundcloudUrl: soundcloudUrl,
                    title: item.music.title || `Nhạc ${type.toUpperCase()}`,
                    thumbnail: item.music.thumbnail || (type === 'youtube' 
                        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` 
                        : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop"),
                    donorName: item.order?.name || 'Khách ZyPage',
                    amount: Number(String(item.order?.amount || '0').replace(/[^0-9]/g, '')) || 0,
                    message: item.order?.message || '',
                    start: Number(item.music.start) || 0,
                    end: null, // Bỏ qua trường end từ ZyPage để tránh xung đột với giới hạn của Introvert Player
                    timestamp: songTimestamp,
                    localAddedAt: Date.now()
                };

                insertSongSmartly(localItem);
                broadcastNewDonationAlert(localItem);
                addedCount++;
            }
        });

        // --- QUÉT TIN NHẮN DONATE THƯỜNG ĐỂ TÌM LINK NHẠC ---
        // Người donate paste link YouTube/SoundCloud trực tiếp vào message thay vì dùng tính năng order nhạc
        const plainDonatePromises = Object.entries(plainDonateList).map(async ([key, item]) => {
            if (!item) return;

            const rawMsg = item.text || item.message || '';
            const message = String(rawMsg).trim();
            const songTimestamp = normalizeTimestamp(item.time);

            // Ghi nhận tất cả donate thường vào Lịch sử & Thông báo
            let isExtended = false;
            let isVoteSkipped = false;
            try {
                const donation = {
                    id: key,
                    name: item.name || 'Khách ZyPage',
                    amount: Number(String(item.amount || '0').replace(/[^0-9]/g, '')) || 0,
                    message: message,
                    timestamp: songTimestamp
                };
                if (checkAndApplyVoteSkip(donation)) {
                    isVoteSkipped = true;
                } else if (checkAndApplyExtension(donation)) {
                    isExtended = true;
                } else if (donation.name) {
                    handleNewDonation(donation, true);
                }
            } catch (e) {
                console.error("Lỗi khi ghi nhận donate từ plainDonateList:", e);
            }

            const hasLink = hasSongLink(message);
            if ((isExtended || isVoteSkipped) && !hasLink) return;

            if (!rawMsg) return;
            if (!message) return;

            // Chỉ xử lý donate từ số tiền tối thiểu cấu hình trở lên mới được parse link nhạc
            const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
            const donateAmount = Number(String(item.amount || '0').replace(/[^0-9]/g, '')) || 0;
            if (donateAmount < minAmount) return;

            // Nếu đây là lượt donate order nhạc chính thức (có trường music hoặc type là music),
            // ta bỏ qua việc trích xuất link từ tin nhắn để tránh thêm 2 bài hát cho 1 lượt donate
            if (item.music || item.type === 'music') return;

            // Kiểm tra chéo với danh sách musicList để chắc chắn lượt donate này không chứa order nhạc chính thức
            const hasOrderedMusic = Object.values(musicList).some(m => {
                const mTime = normalizeTimestamp(m.order?.time || m.music?.key);
                return mTime === songTimestamp;
            });
            if (hasOrderedMusic) return;

            if (!isManual) {
                if (songTimestamp <= state.lastSyncedDonateTime) return;

                const now = Date.now();
                if (now - songTimestamp > 7 * 24 * 60 * 60 * 1000) return;
            }

            if (songTimestamp > maxTimestamp) {
                maxTimestamp = songTimestamp;
            }

            // Trích xuất link URL đầu tiên trong message (YouTube hoặc SoundCloud)
            const urlRegex = /https?:\/\/[^\s<>"']+/gi;
            const urlMatches = message.match(urlRegex) || [];

            let type = null;
            let videoId = null;
            let soundcloudUrl = null;

            for (const url of urlMatches) {
                if (url.includes('soundcloud.com')) {
                    soundcloudUrl = url.split(/[\s?#]/)[0]; // Loại bỏ query params và hash
                    type = 'soundcloud';
                    break;
                }
                const ytId = parseYoutubeId(url);
                if (ytId) {
                    videoId = ytId;
                    type = 'youtube';
                    break;
                }
            }

            if (!type) return; // Message không có link nhạc hợp lệ

            // Sử dụng key + timestamp làm musicKey duy nhất (vì không có music.key)
            const musicKey = `msg_${key}_${songTimestamp}`;

            // Bỏ qua nếu không phải đồng bộ thủ công và bài hát đã phát xong hoặc bị xóa trước đó
            if (!isManual && state.endedKeys.some(e => e.key === musicKey)) return;

            const uniqueKey = musicKey;
            const isExist = state.queue.some(q => 
                q.id === uniqueKey || 
                (q.type === type && (
                    (type === 'youtube' && q.videoId === videoId) ||
                    (type === 'soundcloud' && q.soundcloudUrl === soundcloudUrl)
                ) && q.timestamp === songTimestamp)
            );

            if (!isExist) {
                try {
                    // Lấy thông tin bài hát (tiêu đề, thumbnail) trước khi đưa vào hàng đợi
                    const meta = await fetchSongMetadata(type, videoId, soundcloudUrl);

                    const msgItem = {
                        id: uniqueKey,
                        musicKey: musicKey,
                        isZyPage: true,
                        fromMessage: true, // Đánh dấu bài hát được trích xuất từ tin nhắn donate
                        type: type,
                        videoId: videoId || null,
                        
                        soundcloudUrl: soundcloudUrl || null,
                        title: meta.title,
                        thumbnail: meta.thumbnail,
                        donorName: item.name || 'Khách ZyPage',
                        amount: Number(String(item.amount || '0').replace(/[^0-9]/g, '')) || 0,
                        message: message,
                        start: 0,
                        end: null,
                        timestamp: songTimestamp,
                        localAddedAt: Date.now()
                    };

                    insertSongSmartly(msgItem);
                    broadcastNewDonationAlert(msgItem);
                    logSystem(`Phát hiện link nhạc trong tin nhắn donate của <strong>${msgItem.donorName}</strong>: ${msgItem.title}`, 'queue');
                    addedCount++;
                } catch (err) {
                    console.error("Lỗi lấy metadata cho bài hát từ tin nhắn trong danh sách đồng bộ:", err);
                }
            }
        });

        await Promise.all(plainDonatePromises);

        if (Object.keys(musicList).length === 0 && Object.keys(plainDonateList).length === 0) {
            logSystem("Không tìm thấy bài hát nào trong hàng đợi trên trang ZyPage của bạn.", "system");
        }

        if (maxTimestamp > state.lastSyncedDonateTime) {
            state.lastSyncedDonateTime = maxTimestamp;
            localStorage.setItem('dua_last_synced_donate_time', state.lastSyncedDonateTime);
        }

        if (addedCount > 0) {
            logSystem(`Đã đồng bộ thành công thêm <strong>${addedCount}</strong> bài hát mới vào hàng đợi!`, 'queue');
            // Bỏ thông báo pop-up đồng bộ ZyPage theo yêu cầu của người dùng để tránh làm phiền
            // showDashboardSystemAlert("Đồng bộ ZyPage", `Đã đồng bộ thành công thêm <strong>${addedCount}</strong> bài hát mới vào hàng đợi!`, 'HÀNG ĐỢI');
            sortAndRefreshQueue();

            if (!state.currentSong && !state.focusMode) {
                playNextInQueue();
            }
        } else {
            logSystem("Hàng đợi đã được cập nhật đồng bộ hoàn toàn.", "system");
            if (isManual) {
                // Bỏ thông báo pop-up đồng bộ ZyPage theo yêu cầu của người dùng để tránh làm phiền
                // showDashboardSystemAlert("Đồng bộ ZyPage", "Hàng đợi đã được đồng bộ hoàn toàn. Không có bài hát mới nào cần thêm.", "ĐỒNG BỘ");
            }
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



// =========================================================================
// --- ĐỒNG BỘ MQTT XUYÊN TRÌNH DUYỆT (CHROME <-> OBS) ---
// =========================================================================

function updateObsUrlDisplay() {
    const obsUrlInput = document.getElementById('obs-url-input');
    if (!obsUrlInput) return;
    
    const scaleSelect = document.getElementById('obs-scale-select');
    const scaleVal = scaleSelect ? scaleSelect.value : '1';
    
    const themeSelect = document.getElementById('obs-theme-select');
    const themeVal = themeSelect ? themeSelect.value : 'flex';
    
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
    if (themeVal !== 'flex') {
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
    sendOverlayMessage('theme_change', { theme: theme });
    
    // Cập nhật theme xem trước tức thời
    const previewIframe = document.getElementById('theme-preview-iframe');
    if (previewIframe) {
        previewIframe.src = `overlay.html?preview=true&theme=${theme}`;
    }
}

function onOpacityChange(val) {
    state.opacity = val;
    localStorage.setItem('dua_opacity', val);
    const opacityVal = document.getElementById('obs-opacity-val');
    if (opacityVal) {
        opacityVal.textContent = val + '%';
    }
    updateObsUrlDisplay();
    sendOverlayMessage('opacity_change', { opacity: val });
}

function initOverlayConnection() {
    logSystem(`<span style="color: var(--pineapple-success); font-weight: 800;"><i class="fa-solid fa-circle-check"></i> Đang kết nối Local WebSocket...</span>`);
    
    if (window.electronAPI && typeof window.electronAPI.onOverlayMessage === 'function') {
        if (!state.wsListenerRegistered) {
            window.electronAPI.onOverlayMessage((payload) => {
                handleOverlayMessage(null, payload);
            });
            state.wsListenerRegistered = true;
        }
    }
    
    // Đồng bộ cấu hình ban đầu ngay khi gọi initOverlayConnection
    setTimeout(() => {
        sendOverlayMessage('max_duration', { value: state.maxDurationEnabled ? state.maxDuration : 0 });
        sendOverlayMessage('opacity_change', { opacity: state.opacity });
        sendOverlayMessage('theme_change', { theme: state.theme });
        sendOverlayMessage('alert_action_text', { text: state.alertActionText });
        sendOverlayMessage('hide_empty_overlay', { value: state.hideEmptyOverlay });
        sendOverlayMessage('focus_mode', { value: state.focusMode });
        sendOverlayMessage('focus_mode_message', { text: state.focusModeMessage });
        sendControlCommand('volume', state.volume);
        
        // Đồng bộ chế độ phát YouTube bypass
        const activeBypassMode = localStorage.getItem('dua_yt_bypass_mode') || (localStorage.getItem('dua_yt_bypass_enabled') === 'false' ? 'never' : 'auto');
        sendOverlayMessage('bypass_mode_change', { mode: activeBypassMode });
        
        if (state.currentSong && !document.getElementById('resume-playback-modal')) {
            const nextSong = getNextSong();
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
                isOwnerAdd: state.currentSong.isOwnerAdd || false,
                start: state.currentSong.start || 0,
                end: state.currentSong.end || null,
                skipSegments: state.skipSegments || [],
                maxDuration: state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong),
                extensionCode: state.currentSong.extensionCode || null,
                extendedDuration: state.currentSong.extendedDuration || 0,
                extensionForceShow: state.currentSong.extensionForceShow || false,
                extensionPrice: state.extensionPrice,
                extensionMinutes: state.extensionMinutes,
                voteSkipActive: state.currentSong.voteSkipActive || false,
                voteAmount: state.currentSong.voteAmount || 0,
                voteSkipTarget: state.currentSong.voteSkipTarget || (state.currentSong.isOwnerAdd ? state.voteSkipDefaultAmount : (state.currentSong.amount || state.voteSkipDefaultAmount)),
                voteSkipSuccess: state.currentSong.voteSkipSuccess || false,
                voteSkipContributors: state.currentSong.voteSkipContributors || [],
                nextSongTitle: nextSong ? nextSong.title : null,
                nextSongDonor: nextSong ? nextSong.donorName : null,
                nextSongAmount: nextSong ? nextSong.amount : null,
                nextSongIsOwnerAdd: nextSong ? (nextSong.isOwnerAdd || false) : false,
                nextSongId: nextSong ? nextSong.id : null,
                nextSongThumbnail: nextSong ? nextSong.thumbnail : null,
                nextSongType: nextSong ? nextSong.type || 'youtube' : null,
                nextSongVideoId: nextSong ? nextSong.videoId : null,
                luckyMode: state.luckyMode || false
            };
            sendOverlayMessage('current_song', payloadSong);
            const playbackIntent = state.playbackIntent || (state.currentSong ? 'play' : 'stop');
            sendControlCommand(playbackIntent === 'pause' ? 'pause' : 'play', null, { updateIntent: false });
        } else {
            sendOverlayMessage('current_song', null);
            sendControlCommand('stop');
        }
    }, 100);
}

function sendOverlayMessage(type, payload) {
    // Không log spammy ticks để tránh rác log
    if (type !== 'progress' && type !== 'overlay_state') {
        logSystem(`[Tập lệnh thực thi] Gửi đi: <strong>${type}</strong> ${payload ? `[${JSON.stringify(payload)}]` : ''}`, 'system');
    }
    if (window.electronAPI && typeof window.electronAPI.sendOverlayMessage === 'function') {
        window.electronAPI.sendOverlayMessage({ type: type, data: payload });
    }
}

function handleOverlayMessage(topic, messageStrOrObj) {
    try {
        const payload = typeof messageStrOrObj === 'string' ? JSON.parse(messageStrOrObj) : messageStrOrObj;
        if (!payload) return;

        // Cập nhật nhịp tim kết nối của OBS Overlay
        state.lastOverlayHeartbeat = Date.now();

        // Không log overlay_state hoặc progress định kỳ để tránh rác log
        if (payload.type !== 'overlay_state' && payload.type !== 'progress' && payload.type !== 'status') {
            logSystem(`[Tập lệnh thực thi] Nhận lại: <strong>${payload.type}</strong> ${payload.data ? `[${JSON.stringify(payload.data)}]` : ''}`, 'system');
        }

        if (payload.type === 'request_sync') {
            logSystem("Nhận yêu cầu đồng bộ cấu hình từ Overlay.");
            
            if (state.pendingOverlayReset) {
                state.pendingOverlayReset = false;
                logSystem("Phát hiện lượt reset overlay chưa thực hiện khi mở app. Đang gửi lệnh reset...");
                triggerResetOverlay();
                return;
            }
            
            // Gửi queue hiện tại
            sendOverlayMessage('queue_change', state.queue);
            // Gửi theme hiện tại
            sendOverlayMessage('theme_change', { theme: state.theme });
            // Gửi opacity hiện tại
            sendOverlayMessage('opacity_change', { opacity: state.opacity });
            // Gửi chế độ phát nhạc YouTube hiện tại
            const activeBypassMode = localStorage.getItem('dua_yt_bypass_mode') || (localStorage.getItem('dua_yt_bypass_enabled') === 'false' ? 'never' : 'auto');
            sendOverlayMessage('bypass_mode_change', { mode: activeBypassMode });
            // Gửi SponsorBlock categories hiện tại
            sendOverlayMessage('sb_categories', sponsorBlockCategories);
            // Gửi âm lượng hiện tại
            sendControlCommand('volume', state.volume);
            // Gửi giới hạn thời gian phát hiện tại (tôn trọng bypass)
            const currentDur = state.bypassCurrentSongDuration ? 0 : 
                (state.currentSong ? calculateMaxDurationForSong(state.currentSong) : (state.maxDurationEnabled ? state.maxDuration : 0));
            sendOverlayMessage('max_duration', { value: currentDur });
            // Gửi alert action text
            sendOverlayMessage('alert_action_text', { text: state.alertActionText });
            // Gửi trạng thái ẩn/hiện overlay khi hết nhạc
            sendOverlayMessage('hide_empty_overlay', { value: state.hideEmptyOverlay });
            // Gửi trạng thái chế độ Tập trung
            sendOverlayMessage('focus_mode', { value: state.focusMode });
            // Gửi lời hiển thị khi bật Tập trung
            sendOverlayMessage('focus_mode_message', { text: state.focusModeMessage });
            // Gửi link Gist JSON cảnh báo nhạy cảm
            sendOverlayMessage('sensitive_videos_url', { url: state.sensitiveVideosUrl });
            // Gửi bài hát hiện tại (nếu có) - chỉ gửi khi không ở trong trạng thái chờ lựa chọn phát tiếp
            if (state.currentSong && !document.getElementById('resume-playback-modal')) {
                // Gửi lời hiển thị khi hết nhạc
                sendOverlayMessage('empty_queue_message', { text: state.emptyQueueMessage });
                
                const nextSong = getNextSong();
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
                    isOwnerAdd: state.currentSong.isOwnerAdd || false,
                    start: state.currentSong.start || 0,
                    end: state.currentSong.end || null,
                    skipSegments: state.skipSegments || [],
                    maxDuration: state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong),
                    extensionCode: state.currentSong.extensionCode || null,
                    extendedDuration: state.currentSong.extendedDuration || 0,
                    extensionForceShow: state.currentSong.extensionForceShow || false,
                    extensionPrice: state.extensionPrice,
                    extensionMinutes: state.extensionMinutes,
                    voteSkipActive: state.currentSong.voteSkipActive || false,
                    voteAmount: state.currentSong.voteAmount || 0,
                    voteSkipTarget: state.currentSong.voteSkipTarget || (state.currentSong.isOwnerAdd ? state.voteSkipDefaultAmount : (state.currentSong.amount || state.voteSkipDefaultAmount)),
                    voteSkipSuccess: state.currentSong.voteSkipSuccess || false,
                    voteSkipContributors: state.currentSong.voteSkipContributors || [],
                    nextSongTitle: nextSong ? nextSong.title : null,
                    nextSongDonor: nextSong ? nextSong.donorName : null,
                    nextSongAmount: nextSong ? nextSong.amount : null,
                    nextSongIsOwnerAdd: nextSong ? (nextSong.isOwnerAdd || false) : false,
                    nextSongId: nextSong ? nextSong.id : null,
                    nextSongThumbnail: nextSong ? nextSong.thumbnail : null,
                    nextSongType: nextSong ? nextSong.type || 'youtube' : null,
                    nextSongVideoId: nextSong ? nextSong.videoId : null,
                    luckyMode: state.luckyMode || false
                };
                sendOverlayMessage('current_song', payloadSong);
                const playbackIntent = state.playbackIntent || (state.currentSong ? 'play' : 'stop');
                sendControlCommand(playbackIntent === 'pause' ? 'pause' : 'play', null, { updateIntent: false });
            } else {
                sendOverlayMessage('current_song', null);
                sendControlCommand('stop');
            }
        } else if (payload.type === 'overlay_state') {
            const data = payload.state;
            if (!data) return;
            
            // Ghi nhận trạng thái vào localStorage để các thành phần Dashboard khác (như syncFromOverlayState) đọc đúng
            localStorage.setItem('dua_overlay_state', JSON.stringify({
                currentTime: data.currentTime,
                duration: data.duration,
                isPlaying: data.isPlaying,
                isBuffering: !!data.isBuffering,
                isDirectStream: data.isDirectStream,
                isLive: !!data.isLive,
                sentAt: data.sentAt || Date.now(),
                timestamp: Date.now()
            }));
            
            // Cập nhật DirectStream badge dựa trên trạng thái phát trực tiếp từ file
            const directStreamBadge = document.getElementById('direct-stream-badge');
            if (directStreamBadge) {
                if (data.isDirectStream) {
                    directStreamBadge.style.display = 'inline-flex';
                } else {
                    directStreamBadge.style.display = 'none';
                }
            }
            
            if (data.currentTime !== undefined) {
                state.lastReportedTime = data.currentTime;
            }

            const reportedPlaying = data.isBuffering
                ? state.playbackIntent !== 'pause' && state.playbackIntent !== 'stop'
                : !!data.isPlaying;
            const isPlayingChanged = state.isPlaying !== reportedPlaying;
            state.isPlaying = reportedPlaying;
            updatePlayPauseButtonUI(reportedPlaying);

            if (data.duration > 0 && state.currentSong) {
                if (!state.currentSong.duration || state.currentSong.duration !== data.duration) {
                    state.currentSong.duration = data.duration;
                    const matchedQueueSong = state.queue.find(s => String(s.id) === String(state.currentSong.id));
                    if (matchedQueueSong) {
                        matchedQueueSong.duration = data.duration;
                    }
                    renderQueue();
                    updateForceExtensionButtonUI();
                    updatePlayerUI(state.currentSong);

                    // Ghi lại vào localStorage để đồng bộ đồng nhất
                    const payloadRaw = localStorage.getItem('dua_current_song');
                    if (payloadRaw) {
                        try {
                            const payload = JSON.parse(payloadRaw);
                            payload.duration = data.duration;
                            localStorage.setItem('dua_current_song', JSON.stringify(payload));
                        } catch(e) {}
                    }
                } else if (isPlayingChanged) {
                    renderQueue();
                }
            } else if (isPlayingChanged) {
                renderQueue();
            }

            const progressSlider = document.getElementById('progress-slider');
            const currentTimeDisplay = document.getElementById('current-time-display');
            const totalTimeDisplay = document.getElementById('total-time-display');

            const isDirectStream = !!data.isDirectStream;
            const isLive = !isDirectStream && (!!data.isLive || (!data.duration || data.duration <= 0));

            if (!isLive) {
                if (progressSlider) progressSlider.style.display = 'block';
                if (currentTimeDisplay) currentTimeDisplay.style.display = 'inline';
                if (totalTimeDisplay) totalTimeDisplay.style.display = 'inline';
                let startPoint = 0;
                let limitDuration = data.duration || 0;
                
                if (state.currentSong) {
                    startPoint = state.currentSong.start || 0;
                    let endPoint = data.duration || 0;
                    
                    if ((!endPoint || endPoint <= startPoint) && isDirectStream) {
                        endPoint = startPoint;
                    }
                    if (state.currentSong.end && state.currentSong.end > startPoint) {
                        endPoint = endPoint > startPoint ? Math.min(endPoint, state.currentSong.end) : state.currentSong.end;
                    }
                    
                    const maxDur = state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong);
                    if (maxDur > 0) {
                        const maxEndPoint = startPoint + maxDur;
                        endPoint = endPoint > startPoint ? Math.min(endPoint, maxEndPoint) : maxEndPoint;
                    }
                    
                    limitDuration = Math.max(1, endPoint - startPoint);
                }
                
                currentOverlayDuration = limitDuration;
                
                const elapsedTime = Math.min(limitDuration, Math.max(0, data.currentTime - startPoint));
                
                if (progressSlider) {
                    const pct = (elapsedTime / limitDuration) * 100;
                    progressSlider.value = pct;
                    updateRangeProgress(progressSlider, pct);
                }

                if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(elapsedTime);
                if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(limitDuration);

                // Ẩn countdown khi phát nhạc thường
                const dashCountdown = document.getElementById('dash-live-countdown');
                if (dashCountdown) dashCountdown.classList.remove('visible');
            } else {
                if (progressSlider) progressSlider.style.display = 'none';
                if (currentTimeDisplay) currentTimeDisplay.style.display = 'none';
                if (totalTimeDisplay) {
                    totalTimeDisplay.textContent = "LIVE";
                    totalTimeDisplay.style.display = 'inline';
                }
                
                // Live Stream handling via MQTT
                let limitDuration = 0;
                if (state.currentSong) {
                    const startPoint = state.currentSong.start || 0;
                    if (state.currentSong.end && state.currentSong.end > startPoint) {
                        limitDuration = state.currentSong.end - startPoint;
                    }
                    const maxDur = state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong);
                    if (maxDur > 0) {
                        limitDuration = maxDur;
                    }
                }

                const elapsedTime = data.currentTime; // livePlayTime from overlay

                // Cập nhật countdown badge trên dashboard
                const dashCountdown = document.getElementById('dash-live-countdown');
                const dashCdTime = document.getElementById('dash-cd-time');

                if (limitDuration > 0) {
                    const displayElapsedTime = Math.min(limitDuration, elapsedTime);
                    if (progressSlider) {
                        const pct = (displayElapsedTime / limitDuration) * 100;
                        progressSlider.value = pct;
                        updateRangeProgress(progressSlider, pct);
                    }
                    // Hiện countdown với thời gian còn lại
                    if (dashCountdown && dashCdTime) {
                        const remaining = Math.max(0, limitDuration - displayElapsedTime);
                        dashCdTime.textContent = formatTime(Math.ceil(remaining));
                        dashCountdown.classList.add('visible');
                    }
                } else {
                    if (progressSlider) {
                        progressSlider.value = 100;
                        updateRangeProgress(progressSlider, 100);
                    }
                    // Ẩn countdown khi không có giới hạn
                    if (dashCountdown) dashCountdown.classList.remove('visible');
                }
            }

            // Cập nhật tiến trình cho Dashboard Video Preview trực tiếp
            if (typeof window.vpanelUpdateState === 'function') {
                window.vpanelUpdateState(data);
            }
        } else if (payload.type === 'overlay_event') {
            const event = payload.event;
            if (event && event.type === 'ended') {
                if (event.eventId) {
                    if (state.lastHandledEndedEventId === event.eventId) {
                        console.log("Ignoring duplicate ended event from WebSocket:", event.eventId);
                        return;
                    }
                    state.lastHandledEndedEventId = event.eventId;
                }
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
                if (state.focusMode) {
                    state.currentSong = null;
                    updatePlayerUI(null);
                    sendOverlayMessage('current_song', null);
                    sendControlCommand('stop');
                    logSystem("Bài hát đã kết thúc. Hàng đợi tạm giữ do đang bật chế độ Tập trung.");
                } else {
                    playNextInQueue(true);
                }
            } else if (event && event.type === 'player_error') {
                handlePlayerError(event.code, event.title);
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
            body: JSON.stringify({ 
                zypageUrl: url, 
                zypageShopId: shopId,
                zypageMinMessageAmount: state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000
            })
        });
        console.log("Đã lưu cấu hình ZyPage vào AppData thành công.");
    } catch (e) {
        console.warn("Không thể lưu cấu hình vào AppData:", e);
    }
}

async function loadConfigFromAppData() {
    const zypageInput = document.getElementById('zypage-url');
    const zypageShopIdInput = document.getElementById('zypage-shop-id');
    const minAmountInput = document.getElementById('zypage-min-amount-input');
    
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
            
            const savedMinAmount = config.zypageMinMessageAmount !== undefined ? Number(config.zypageMinMessageAmount) : 49000;
            state.zypageMinMessageAmount = savedMinAmount;
            localStorage.setItem('dua_zypage_min_message_amount', savedMinAmount);
            if (minAmountInput) {
                minAmountInput.value = savedMinAmount;
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
    
    const localMinAmount = localStorage.getItem('dua_zypage_min_message_amount');
    state.zypageMinMessageAmount = localMinAmount !== null ? Number(localMinAmount) : 49000;
    if (minAmountInput) {
        minAmountInput.value = state.zypageMinMessageAmount;
    }

    if (zypageInput && state.zypageToken) {
        const pathType = localStorage.getItem('dua_zypage_path_type') || 'donate-music';
        zypageInput.value = `${state.zypageDomain}/${pathType}/${state.zypageToken}`;
        connectZyPageLive(true);
    }

    // Tải danh sách video nhạy cảm trực tuyến và cập nhật giao diện
    fetchSensitiveVideosConfig().then(() => {
        updatePlayerUI(state.currentSong);
    });
    // Tự động tải lại mỗi 10 phút
    setInterval(fetchSensitiveVideosConfig, 10 * 60 * 1000);
}

function onMinAmountConfigChange(value) {
    const amount = isNaN(value) || value === '' ? 49000 : Number(value);
    state.zypageMinMessageAmount = amount;
    localStorage.setItem('dua_zypage_min_message_amount', amount);
    
    const urlInput = document.getElementById('zypage-url');
    const url = urlInput ? urlInput.value.trim() : '';
    saveConfigToAppData(url, state.zypageShopId);
    
    logSystem(`[Cấu hình] Thay đổi số tiền tối thiểu nhận nhạc từ tin nhắn: <strong>${amount.toLocaleString('vi-VN')} VNĐ</strong>`, 'system');
}

// --- YÊU CẦU OVERLAY LOAD LẠI TRANG (RESET) ---
function triggerResetOverlay() {
    logSystem("Gửi yêu cầu Reset/Tải lại trang tới Overlay...", 'system');
    sendControlCommand('reload');
}

// --- KEYWORD TÌM KIẾM NHANH ---
function escapeKeywordHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setupKeywordSettings() {
    const videoInput = document.getElementById('keyword-video-input');
    const keywordInput = document.getElementById('keyword-name-input');
    if (!videoInput || videoInput.dataset.ready === 'true') {
        renderKeywordShortcutList();
        return;
    }

    videoInput.dataset.ready = 'true';
    videoInput.addEventListener('input', () => {
        selectedKeywordVideo = null;
        renderSelectedKeywordVideo();
        if (keywordSettingsSearchTimeout) clearTimeout(keywordSettingsSearchTimeout);

        const query = videoInput.value.trim();
        const results = document.getElementById('keyword-search-results');
        const isUrl = /^https?:\/\//i.test(query);
        if (!results || isUrl || query.length < 2) {
            if (results) results.style.display = 'none';
            return;
        }

        results.style.display = 'block';
        results.innerHTML = '<div class="keyword-search-status"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tìm trên YouTube...</div>';
        keywordSettingsSearchTimeout = setTimeout(async () => {
            try {
                const response = await callYouTubeSearch(query);
                if (videoInput.value.trim() !== query) return;
                renderKeywordSearchResults(response && response.success ? response.videos : []);
            } catch (error) {
                if (videoInput.value.trim() === query) {
                    results.innerHTML = '<div class="keyword-search-status keyword-search-error">Không thể tìm kiếm YouTube.</div>';
                }
            }
        }, 350);
    });

    videoInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const resultBox = document.getElementById('keyword-search-results');
            const isVisibleSearch = resultBox && resultBox.style.display !== 'none' && !/^https?:\/\//i.test(videoInput.value.trim());
            const firstResult = isVisibleSearch ? resultBox.querySelector('.keyword-search-result') : null;
            if (firstResult) firstResult.click();
            else saveKeywordShortcut();
        }
    });
    if (keywordInput) {
        keywordInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                videoInput.focus();
            }
        });
    }
    renderKeywordShortcutList();
}

function renderKeywordSearchResults(videos) {
    const container = document.getElementById('keyword-search-results');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'block';

    if (!videos || videos.length === 0) {
        container.innerHTML = '<div class="keyword-search-status">Không tìm thấy video phù hợp.</div>';
        return;
    }

    videos.slice(0, 8).forEach(video => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'keyword-search-result';
        item.innerHTML = `
            <img src="${escapeKeywordHtml(video.thumbnail || '')}" alt="">
            <span class="keyword-search-result-info">
                <strong>${escapeKeywordHtml(video.title || 'Video YouTube')}</strong>
                <small>${escapeKeywordHtml(video.author || '')}${video.duration ? ` • ${escapeKeywordHtml(video.duration)}` : ''}</small>
            </span>`;
        item.addEventListener('click', () => selectKeywordVideo(video));
        container.appendChild(item);
    });
}

function selectKeywordVideo(video) {
    selectedKeywordVideo = {
        videoId: video.videoId,
        title: video.title || `YouTube (${video.videoId})`,
        thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
        author: video.author || '',
        duration: video.duration || '',
        views: video.views || ''
    };
    const input = document.getElementById('keyword-video-input');
    if (input) input.value = `https://www.youtube.com/watch?v=${video.videoId}`;
    const results = document.getElementById('keyword-search-results');
    if (results) results.style.display = 'none';
    renderSelectedKeywordVideo();
}

function renderSelectedKeywordVideo() {
    const container = document.getElementById('keyword-selected-video');
    if (!container) return;
    if (!selectedKeywordVideo) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = `
        <img src="${escapeKeywordHtml(selectedKeywordVideo.thumbnail)}" alt="">
        <div><span>Đã chọn</span><strong>${escapeKeywordHtml(selectedKeywordVideo.title)}</strong><small>${escapeKeywordHtml(selectedKeywordVideo.author || '')}</small></div>`;
}

async function saveKeywordShortcut() {
    const keywordInput = document.getElementById('keyword-name-input');
    const videoInput = document.getElementById('keyword-video-input');
    const saveButton = document.getElementById('keyword-save-btn');
    const keyword = keywordInput ? keywordInput.value.trim().replace(/\s+/g, ' ') : '';

    if (!keyword) {
        alert('Vui lòng nhập keyword.');
        if (keywordInput) keywordInput.focus();
        return;
    }

    let video = selectedKeywordVideo;
    if (!video) {
        const videoId = parseYoutubeId(videoInput ? videoInput.value : '');
        if (!videoId) {
            alert('Hãy chọn một kết quả tìm kiếm hoặc dán link YouTube hợp lệ.');
            if (videoInput) videoInput.focus();
            return;
        }
        if (saveButton) saveButton.disabled = true;
        try {
            const metadata = await fetchSongMetadata('youtube', videoId, null);
            video = {
                videoId,
                title: metadata.title,
                thumbnail: metadata.thumbnail,
                author: '',
                duration: '',
                views: ''
            };
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    }

    const shortcut = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        keyword,
        ...video,
        updatedAt: Date.now()
    };
    const existingIndex = keywordShortcuts.findIndex(item => normalizeKeyword(item.keyword) === normalizeKeyword(keyword));
    if (existingIndex >= 0) {
        shortcut.id = keywordShortcuts[existingIndex].id;
        keywordShortcuts.splice(existingIndex, 1, shortcut);
    } else {
        keywordShortcuts.unshift(shortcut);
    }
    saveKeywordShortcutsToStorage();
    renderKeywordShortcutList();

    if (keywordInput) keywordInput.value = '';
    if (videoInput) videoInput.value = '';
    selectedKeywordVideo = null;
    renderSelectedKeywordVideo();
    logSystem(`Đã lưu keyword <strong>${escapeKeywordHtml(keyword)}</strong> cho bài <strong>${escapeKeywordHtml(video.title)}</strong>.`, 'system');
}

function deleteKeywordShortcut(id) {
    keywordShortcuts = keywordShortcuts.filter(item => item.id !== id);
    saveKeywordShortcutsToStorage();
    renderKeywordShortcutList();
}

function renderKeywordShortcutList() {
    const container = document.getElementById('keyword-shortcut-list');
    const count = document.getElementById('keyword-shortcut-count');
    if (count) count.textContent = String(keywordShortcuts.length);
    if (!container) return;
    container.innerHTML = '';
    renderKeywordLibrary();

    if (keywordShortcuts.length === 0) {
        container.innerHTML = '<div class="keyword-empty-state"><strong>Chưa có keyword</strong><span>Keyword đã lưu sẽ hiển thị tại đây.</span></div>';
        return;
    }

    keywordShortcuts.forEach(shortcut => {
        const item = document.createElement('div');
        item.className = 'keyword-shortcut-item';
        item.innerHTML = `
            <span class="keyword-pill">${escapeKeywordHtml(shortcut.keyword)}</span>
            <img src="${escapeKeywordHtml(shortcut.thumbnail || `https://img.youtube.com/vi/${shortcut.videoId}/mqdefault.jpg`)}" alt="">
            <div class="keyword-shortcut-info">
                <strong title="${escapeKeywordHtml(shortcut.title)}">${escapeKeywordHtml(shortcut.title)}</strong>
                <small>${escapeKeywordHtml(shortcut.author || 'YouTube')} • ${escapeKeywordHtml(shortcut.videoId)}</small>
            </div>
            <button type="button" class="keyword-delete-btn" title="Xóa keyword">Xóa</button>`;
        item.querySelector('.keyword-delete-btn').addEventListener('click', () => deleteKeywordShortcut(shortcut.id));
        container.appendChild(item);
    });

}

function createPlayerLibraryCard(video, options = {}) {
    const normalizedVideo = normalizeLibraryVideo(video);
    const card = document.createElement('article');
    card.className = 'player-library-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('title', 'Thêm vào hàng đợi');

    const keyword = options.keyword || normalizedVideo.keyword;
    card.innerHTML = `
        <div class="player-library-thumb">
            <img src="${escapeKeywordHtml(normalizedVideo.thumbnail)}" alt="">
            ${normalizedVideo.duration ? `<span>${escapeKeywordHtml(normalizedVideo.duration)}</span>` : ''}
        </div>
        <div class="player-library-card-body">
            ${keyword ? `<div class="player-library-keyword">${escapeKeywordHtml(keyword)}</div>` : ''}
            <div class="player-library-title">${escapeKeywordHtml(normalizedVideo.title)}</div>
            ${normalizedVideo.author ? `<div class="player-library-author">${escapeKeywordHtml(normalizedVideo.author)}</div>` : ''}
        </div>`;

    card.addEventListener('click', () => addSearchResultToQueue(normalizedVideo));
    card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            addSearchResultToQueue(normalizedVideo);
        }
    });
    return card;
}

function renderKeywordLibrary() {
    const container = document.getElementById('qa-keywords-list');
    if (!container) return;
    container.innerHTML = '';

    const libraryItems = new Map();
    keywordShortcuts.forEach(shortcut => {
        const key = String(shortcut.videoId);
        const existing = libraryItems.get(key);
        if (existing) {
            if (!existing.keywords.includes(shortcut.keyword)) existing.keywords.push(shortcut.keyword);
        } else {
            libraryItems.set(key, {
                video: keywordShortcutToVideo(shortcut),
                keywords: [shortcut.keyword]
            });
        }
    });
    favoriteSongs.forEach(video => {
        const key = String(video.videoId);
        if (!libraryItems.has(key)) {
            libraryItems.set(key, { video, keywords: video.keyword ? [video.keyword] : [] });
        }
    });

    if (libraryItems.size === 0) {
        container.innerHTML = '<div class="player-library-empty"><strong>Chưa có Keyword hoặc bài yêu thích</strong><span>Lưu keyword hoặc chọn “Yêu thích” để bài hát xuất hiện tại đây.</span></div>';
        return;
    }

    libraryItems.forEach(item => {
        container.appendChild(createPlayerLibraryCard(item.video, { keyword: item.keywords.join(', ') }));
    });
}

// --- HIỂN THỊ KẾT QUẢ TÌM KIẾM YOUTUBE ---
function renderSearchResults(videos, containerId = 'qa-search-list') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (containerId === 'quick-add-search-results') {
        const urlInput = document.getElementById('donor-url');
        if (urlInput) {
            container.dataset.query = urlInput.value.trim();
        }
    }
    
    if (!videos || videos.length === 0) {
        container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Không tìm thấy video nào!</div>';
        return;
    }
    
    const isGrid = containerId === 'qa-recommendations-list' || containerId === 'qa-playlists-list';
    
    videos.forEach(video => {
        const item = document.createElement('div');
        
        if (isGrid) {
            item.className = 'grid-result-item';
            item.innerHTML = `
                <div class="grid-result-thumb-wrapper">
                    <img src="${video.thumbnail}" alt="thumb">
                    <span class="grid-result-duration">${video.duration}</span>
                </div>
                <div class="grid-result-info">
                    <div class="grid-result-title" title="${video.title}">${video.title}</div>
                    <div class="grid-result-meta" title="${video.author} • ${video.views || ''}">
                        <span>${video.author}</span>
                        ${video.views ? `• <span>${formatViewsCompact(video.views)} views</span>` : ''}
                    </div>
                </div>
                <div class="grid-result-actions">
                    <button type="button" class="grid-favorite-btn${isFavoriteSong(video.videoId) ? ' active' : ''}">
                        ${isFavoriteSong(video.videoId) ? 'Đã thích' : 'Yêu thích'}
                    </button>
                </div>
            `;
        } else {
            item.className = `search-result-item${video.isKeywordShortcut ? ' keyword-priority-result' : ''}`;
            item.innerHTML = `
                <div class="search-result-thumb">
                    <img src="${video.thumbnail ? video.thumbnail.replace('/default.jpg', '/mqdefault.jpg') : ''}" alt="thumb">
                </div>
                <div class="search-result-info">
                    <div class="search-result-title" title="${video.title}">${video.title}</div>
                    ${video.isKeywordShortcut ? `<span class="keyword-priority-badge"><i class="fa-solid fa-key"></i> Keyword: ${escapeKeywordHtml(video.shortcutKeyword)}</span>` : ''}
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
                <div class="search-result-actions">
                    <button type="button" class="search-result-favorite${isFavoriteSong(video.videoId) ? ' active' : ''}" title="Yêu thích">
                        <i class="${isFavoriteSong(video.videoId) ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>
                    <button type="button" class="search-result-keyword" title="Lưu keyword">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button type="button" class="search-result-btn" title="Thêm vào hàng đợi">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            `;
        }
        
        // Đăng ký sự kiện click chọn bài
        const addBtn = item.querySelector('.search-result-btn');
        const selectAction = (e) => {
            e.stopPropagation();
            addSearchResultToQueue(video);
        };
        
        if (addBtn) {
            addBtn.addEventListener('click', selectAction);
        }
        const favoriteBtn = item.querySelector('.grid-favorite-btn');
        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', e => {
                e.stopPropagation();
                const added = toggleFavoriteSong(video);
                favoriteBtn.classList.toggle('active', added);
                favoriteBtn.textContent = added ? 'Đã thích' : 'Yêu thích';
            });
        }
        const searchFavoriteBtn = item.querySelector('.search-result-favorite');
        if (searchFavoriteBtn) {
            searchFavoriteBtn.addEventListener('click', e => {
                e.stopPropagation();
                const added = toggleFavoriteSong(video);
                searchFavoriteBtn.classList.toggle('active', added);
                searchFavoriteBtn.innerHTML = `<i class="${added ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
            });
        }
        const searchKeywordBtn = item.querySelector('.search-result-keyword');
        if (searchKeywordBtn) {
            searchKeywordBtn.addEventListener('click', e => {
                e.stopPropagation();
                openSaveKeywordForVideo(video);
            });
        }
        item.addEventListener('click', selectAction);
        
        container.appendChild(item);
    });
}

function clearQuickSearch() {
    const urlInput = document.getElementById('donor-url');
    if (urlInput) urlInput.value = '';
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const searchResultsContainer = document.getElementById('quick-add-search-results');
    if (searchResultsContainer) searchResultsContainer.style.display = 'none';
}

// --- THÊM BÀI HÁT TỪ KẾT QUẢ TÌM KIẾM VÀO HÀNG ĐỢI ---
function addSearchResultToQueue(video) {
    if (state.focusMode) return;
    const nameInput = document.getElementById('quick-donor-name');
    const donorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Em Dứa";
    
    const amountInput = document.getElementById('quick-donor-amount');
    const donorAmount = (amountInput && amountInput.value.trim() !== '') ? Number(amountInput.value) : 100000000;

    const ownerAddCheckbox = document.getElementById('quick-owner-add');
    const isOwnerAdd = ownerAddCheckbox ? ownerAddCheckbox.checked : false;

    const newSong = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        type: 'youtube',
        videoId: video.videoId,
        
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
        views: video.views || '',
        isOwnerAdd: isOwnerAdd,
        isQuickAdd: !isOwnerAdd
    };
    
    insertSongSmartly(newSong);
    broadcastNewDonationAlert(newSong);
    saveQueue();
    sortAndRefreshQueue();
    
    logSystem(`Đã thêm nhanh bài hát từ tìm kiếm: <strong>${video.title}</strong>`, 'queue');
    if (!isOwnerAdd) {
        showDashboardSystemAlert("Đã thêm nhạc nhanh", `Đã thêm nhanh bài hát: <strong>${video.title}</strong>`, 'HÀNG ĐỢI');
    }
    
    // Xóa trống dữ liệu nhập và ẩn dropdown/popover
    clearQuickSearch();
    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
    
    const quickAddPopover = document.getElementById('quick-add-popover');
    if (quickAddPopover) quickAddPopover.classList.remove('visible');
    
    if (!state.currentSong && !state.focusMode) {
        playNextInQueue();
    }
}

// ==========================================
// YOUTUBE ACCOUNT SYNC UI LOGIC (OPTION 2)
// ==========================================

let isYtLoggedIn = false;
let hasLoadedRecommendations = false;
let hasLoadedPlaylists = false;
let activeQuickAddTab = 'keywords';

async function checkYoutubeAuth() {
    if (!window.electronAPI || typeof window.electronAPI.ytCheckAuth !== 'function') {
        return;
    }
    
    try {
        const result = await window.electronAPI.ytCheckAuth();
        const avatarImg = document.getElementById('yt-user-avatar');
        const nameText = document.getElementById('yt-user-name');
        const statusBadge = document.getElementById('yt-status-badge');
        const btnLogin = document.getElementById('btn-yt-login');
        const btnLogout = document.getElementById('btn-yt-logout');
        const ytDashboard = document.getElementById('card-youtube-dashboard');
        
        if (result && result.loggedIn) {
            isYtLoggedIn = true;
            if (ytDashboard) ytDashboard.style.display = 'flex';
            if (nameText) nameText.textContent = result.displayName || 'YouTube Account';
            if (avatarImg) {
                if (result.avatarUrl) {
                    avatarImg.src = Math.max(0, result.avatarUrl.indexOf('http')) === 0 ? result.avatarUrl : '';
                    avatarImg.style.display = 'block';
                } else {
                    avatarImg.style.display = 'none';
                }
            }
            if (statusBadge) {
                statusBadge.textContent = 'Đã kết nối';
                statusBadge.className = 'status-badge connected';
                statusBadge.style.backgroundColor = '#10B981'; // green
            }
            if (btnLogin) btnLogin.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'block';
            
            // Keyword là thư viện mặc định; YouTube chỉ tải khi người dùng mở tab tương ứng.
            switchQuickAddTab('keywords');
        } else {
            isYtLoggedIn = false;
            // Keyword và Yêu thích là thư viện local nên Player vẫn luôn hiển thị khối này.
            if (ytDashboard) ytDashboard.style.display = 'flex';
            if (nameText) nameText.textContent = 'Chưa kết nối tài khoản';
            if (avatarImg) {
                avatarImg.style.display = 'none';
                avatarImg.src = '';
            }
            if (statusBadge) {
                statusBadge.textContent = 'Chưa kết nối';
                statusBadge.className = 'status-badge disconnected';
                statusBadge.style.backgroundColor = '#EF4444'; // red
            }
            if (btnLogin) btnLogin.style.display = 'block';
            if (btnLogout) btnLogout.style.display = 'none';
            
            // Clear content if logged out
            hasLoadedRecommendations = false;
            hasLoadedPlaylists = false;
            const recList = document.getElementById('qa-recommendations-list');
            if (recList) recList.innerHTML = '';
            const plistSelect = document.getElementById('qa-playlist-select');
            if (plistSelect) plistSelect.innerHTML = '<option value="">-- Chọn Playlist --</option>';
            const plistList = document.getElementById('qa-playlists-list');
            if (plistList) plistList.innerHTML = '';
        }
    } catch (e) {
        console.error("Lỗi khi kiểm tra đăng nhập YouTube:", e);
    }
}

async function loginYoutube() {
    if (!window.electronAPI || typeof window.electronAPI.ytLogin !== 'function') {
        alert("Tính năng này chỉ khả dụng khi chạy trên ứng dụng máy tính (Electron)!");
        return;
    }
    
    try {
        logSystem("Đang mở cửa sổ đăng nhập YouTube...", 'system');
        const result = await window.electronAPI.ytLogin();
        if (result && result.success) {
            logSystem("Đăng nhập YouTube thành công!", 'system');
            showDashboardSystemAlert("Đồng bộ YouTube", "Đăng nhập YouTube thành công và đã kết nối!", "HỆ THỐNG");
        } else {
            logSystem(`Đăng nhập YouTube thất bại hoặc bị đóng: ${result.error || ''}`, 'system');
        }
        await checkYoutubeAuth();
    } catch (e) {
        console.error("Lỗi khi đăng nhập YouTube:", e);
    }
}

async function logoutYoutube() {
    if (!window.electronAPI || typeof window.electronAPI.ytLogout !== 'function') {
        return;
    }
    
    if (!confirm("Bạn có chắc chắn muốn đăng xuất tài khoản YouTube khỏi ứng dụng?")) {
        return;
    }
    
    try {
        logSystem("Đang đăng xuất tài khoản YouTube...", 'system');
        const result = await window.electronAPI.ytLogout();
        if (result && result.success) {
            logSystem("Đã đăng xuất tài khoản YouTube thành công.", 'system');
            showDashboardSystemAlert("Đồng bộ YouTube", "Đã ngắt kết nối tài khoản YouTube thành công.", "HỆ THỐNG");
        }
        await checkYoutubeAuth();
    } catch (e) {
        console.error("Lỗi khi đăng xuất YouTube:", e);
    }
}

function switchQuickAddTab(tabName) {
    activeQuickAddTab = tabName;
    
    // Switch active class on tab buttons
    const tabs = ['recommendations', 'playlists', 'keywords'];
    tabs.forEach(t => {
        const btn = document.getElementById(`qa-tab-btn-${t}`);
        const content = document.getElementById(`qa-content-${t}`);
        if (btn) {
            if (t === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
        if (content) {
            if (t === tabName) {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        }
    });
    
    if (tabName === 'recommendations') {
        if (!isYtLoggedIn) {
            const container = document.getElementById('qa-recommendations-list');
            if (container) {
                container.innerHTML = `
                    <div style="padding: 20px 10px; text-align: center; color: #6B7280; font-weight: 700;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; color: var(--pineapple-orange); margin-bottom: 0.5rem; display: block;"></i>
                        Vui lòng kết nối tài khoản YouTube trong phần Cấu hình để xem gợi ý cá nhân hóa!
                    </div>
                `;
            }
            return;
        }
        if (!hasLoadedRecommendations) {
            loadRecommendations();
        }
    } else if (tabName === 'playlists') {
        if (!isYtLoggedIn) {
            const container = document.getElementById('qa-playlists-list');
            if (container) {
                container.innerHTML = `
                    <div style="padding: 20px 10px; text-align: center; color: #6B7280; font-weight: 700;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; color: var(--pineapple-orange); margin-bottom: 0.5rem; display: block;"></i>
                        Vui lòng kết nối tài khoản YouTube trong phần Cấu hình để đồng bộ danh sách phát!
                    </div>
                `;
            }
            return;
        }
        if (!hasLoadedPlaylists) {
            refreshQuickAddPlaylists();
        }
    } else if (tabName === 'keywords') {
        renderKeywordLibrary();
    }
}

async function loadRecommendations() {
    const container = document.getElementById('qa-recommendations-list');
    if (!container) return;
    
    container.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải gợi ý từ YouTube...</div>';
    
    try {
        const result = await window.electronAPI.ytGetRecommendations();
        if (result && result.success) {
            hasLoadedRecommendations = true;
            renderSearchResults(result.videos, 'qa-recommendations-list');
        } else {
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result.error || 'Không thể lấy dữ liệu gợi ý'}</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng: ${e.message}</div>`;
    }
}

async function refreshRecommendations() {
    hasLoadedRecommendations = false;
    await loadRecommendations();
}

async function refreshQuickAddPlaylists() {
    const select = document.getElementById('qa-playlist-select');
    const container = document.getElementById('qa-playlists-list');
    if (!select || !container) return;
    
    select.innerHTML = '<option value="">-- Đang tải danh sách phát... --</option>';
    container.innerHTML = '';
    
    try {
        const result = await window.electronAPI.ytGetPlaylists();
        if (result && result.success && result.playlists && result.playlists.length > 0) {
            hasLoadedPlaylists = true;
            select.innerHTML = '<option value="">-- Chọn Playlist --</option>';
            result.playlists.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.playlistId;
                opt.textContent = `${p.title} (${p.videoCount} video)`;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value="">-- Lỗi tải danh sách phát --</option>';
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result?.error || 'Không tìm thấy playlist cá nhân nào'}</div>`;
        }
    } catch (e) {
        select.innerHTML = '<option value="">-- Lỗi kết nối mạng --</option>';
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${e.message}</div>`;
    }
}

async function loadQuickAddPlaylistVideos(playlistId) {
    const container = document.getElementById('qa-playlists-list');
    if (!container) return;
    
    if (!playlistId) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải danh sách video...</div>';
    
    try {
        const result = await window.electronAPI.ytGetPlaylistVideos(playlistId);
        if (result && result.success) {
            renderSearchResults(result.videos, 'qa-playlists-list');
        } else {
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result.error || 'Không thể tải video trong playlist này'}</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng: ${e.message}</div>`;
    }
}

// --- LOGIC NHẬT KÝ THAY ĐỔI (CHANGELOG) ---
function closeChangelogModal() {
    const modal = document.getElementById('changelog-modal');
    if (modal) modal.style.display = 'none';
}

function showChangelogModal(version, changelogHtml) {
    const modal = document.getElementById('changelog-modal');
    const versionTitle = document.getElementById('changelog-version-title');
    const contentArea = document.getElementById('changelog-content-area');
    
    if (modal && contentArea) {
        if (versionTitle) versionTitle.textContent = `Phiên bản v${version}`;
        contentArea.innerHTML = changelogHtml || `<p>Đã cập nhật ứng dụng thành công lên phiên bản v${version}.</p>`;
        modal.style.display = 'flex';
    }
}

async function loadChangelogForVersion(version) {
    try {
        const response = await fetch('CHANGELOG.md');
        if (!response.ok) throw new Error("Could not load CHANGELOG.md");
        const text = await response.text();
        
        const cleanVer = version.replace(/^v/, '');
        const lines = text.split('\n');
        let capturing = false;
        let changelogLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('## ') && line.includes(`[${cleanVer}]`)) {
                capturing = true;
                continue;
            }
            
            if (capturing) {
                if (line.startsWith('## ')) {
                    break;
                }
                changelogLines.push(lines[i]);
            }
        }
        
        if (changelogLines.length > 0) {
            return changelogLines.join('\n').trim();
        }
        return null;
    } catch (err) {
        console.error("Error loading/parsing changelog:", err);
        return null;
    }
}

function convertChangelogMarkdownToHtml(markdownText) {
    if (!markdownText) return '';
    
    const lines = markdownText.split('\n');
    let html = '';
    let inList = false;
    
    const parseMarkdownStyles = (text) => {
        let result = text;
        // Hỗ trợ ảnh ![alt](url)
        result = result.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; margin: 0.5rem auto; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 2px solid var(--pineapple-border-color); display: block;">');
        // Hỗ trợ chữ in đậm **text**
        result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return result;
    };
    
    for (let line of lines) {
        let trimmed = line.trim();
        
        if (trimmed.startsWith('### ')) {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            html += `<h3 class="changelog-h3">${trimmed.substring(4)}</h3>`;
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (!inList) {
                html += '<ul class="changelog-ul">';
                inList = true;
            }
            let itemContent = trimmed.substring(2);
            itemContent = parseMarkdownStyles(itemContent);
            html += `<li class="changelog-li">${itemContent}</li>`;
        } else {
            if (trimmed === '') {
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
            } else {
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
                let paraContent = parseMarkdownStyles(trimmed);
                html += `<p class="changelog-p">${paraContent}</p>`;
            }
        }
    }
    if (inList) {
        html += '</ul>';
    }
    return html;
}

// --- GIÁM SÁT TRẠNG THÁI KẾT NỐI DỊCH VỤ ---
state.lastOverlayHeartbeat = 0;
state.internetConnected = true;

let lastNetworkCheckTime = 0;
async function checkNetworkConnection() {
    if (Date.now() - lastNetworkCheckTime < 20000) return;
    lastNetworkCheckTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        // Kiểm tra kết nối tới Raw GitHub Gist URL
        await fetch('https://raw.githubusercontent.com', { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);
        state.internetConnected = true;
    } catch (e) {
        state.internetConnected = false;
    }
}

async function startServiceMonitorLoop() {
    setInterval(async () => {
        // 1. Kiểm tra mạng & Gist
        await checkNetworkConnection();
        const netBadge = document.getElementById('monitor-internet');
        if (netBadge) {
            if (state.internetConnected) {
                netBadge.className = 'status-badge connected';
                netBadge.textContent = 'ĐANG HOẠT ĐỘNG';
            } else {
                netBadge.className = 'status-badge disconnected';
                netBadge.textContent = 'MẤT KẾT NỐI';
            }
        }

        // 2. Kiểm tra ZyPage Sync
        const zyBadge = document.getElementById('monitor-zypage');
        if (zyBadge) {
            if (state.zypageConnected) {
                zyBadge.className = 'status-badge connected';
                zyBadge.textContent = 'ĐÃ KẾT NỐI';
            } else {
                zyBadge.className = 'status-badge disconnected';
                zyBadge.textContent = 'NGẮT KẾT NỐI';
            }
        }

        // 3. Kiểm tra YouTube Account Login
        const ytBadge = document.getElementById('monitor-youtube');
        if (ytBadge) {
            if (isYtLoggedIn) {
                ytBadge.className = 'status-badge connected';
                ytBadge.textContent = 'ĐÃ ĐĂNG NHẬP';
            } else {
                ytBadge.className = 'status-badge disconnected';
                ytBadge.textContent = 'CHƯA LIÊN KẾT';
            }
        }

        // 4. Kiểm tra OBS Overlay (WS)
        const obsBadge = document.getElementById('monitor-obs');
        if (obsBadge) {
            const isObsConnected = state.lastOverlayHeartbeat && (Date.now() - state.lastOverlayHeartbeat < 7000);
            if (isObsConnected) {
                obsBadge.className = 'status-badge connected';
                obsBadge.textContent = 'ĐÃ KẾT NỐI';
            } else {
                obsBadge.className = 'status-badge disconnected';
                obsBadge.textContent = 'CHƯA KẾT NỐI';
            }
        }
    }, 2000);
}

// Lệnh đồng bộ thủ công ZyPage bỏ qua bộ lọc thời gian để kéo các bài hát còn đọng
function triggerManualZyPageSync() {
    if (!state.zypageShopId) {
        alert("Vui lòng thiết lập cấu hình đồng bộ ZyPage trước trong phần Cài đặt!");
        return;
    }

    const btn = document.getElementById('btn-manual-sync');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="m3-spinner" viewBox="0 0 24 24" style="margin-right: 0.35rem;"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải...';
    }

    logSystem("Bắt đầu kích hoạt đồng bộ thủ công hàng đợi ZyPage...", "system");

    syncQueueFromZyPageApi(state.zypageShopId, true).finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Đồng bộ ZyPage';
        }
    });
}

// --- LẮNG NGHE SỰ KIỆN TEST DONATE (GIẢ LẬP) ---
if (window.electronAPI && typeof window.electronAPI.onTestDonate === 'function') {
    window.electronAPI.onTestDonate(async (data) => {
        if (!data) return;
        const donorName = (data.donorName || 'Khách').trim();
        const amountStr = String(data.amount || '0').replace(/[^0-9]/g, '');
        const amount = Number(amountStr) || 0;
        const message = (data.message || '').trim();
        let songLink = (data.songLink || '').trim();

        // Tự động bóc tách link nhạc từ tin nhắn nếu songLink trống
        let isFromMessage = false;
        if (!songLink && message) {
            const urlRegex = /https?:\/\/[^\s<>"']+/gi;
            const urlMatches = message.match(urlRegex) || [];
            for (const url of urlMatches) {
                if (url.includes('soundcloud.com') || parseYoutubeId(url)) {
                    songLink = url;
                    isFromMessage = true;
                    break;
                }
            }
        }

        logSystem(`🧪 <strong>[Test Donate]</strong> Nhận lượt donate thử nghiệm từ <strong>${donorName}</strong> (${amount.toLocaleString('vi-VN')} ₫)`, 'system');

        const donation = {
            id: `test_donate_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: donorName,
            amount: amount,
            message: message,
            timestamp: Date.now(),
            isMusicOrder: !!songLink && !isFromMessage,
            songLink: songLink || null
        };

        let isExtended = false;
        let isVoteSkipped = false;

        // 1. Kiểm tra Vote Skip bài hát đang phát
        if (checkAndApplyVoteSkip(donation)) {
            logSystem(`🧪 <strong>[Test Donate]</strong> Kích hoạt tính năng Vote Skip thành công.`, 'system');
            isVoteSkipped = true;
        }

        // 2. Kiểm tra Gia hạn thời gian phát bài hát đang phát
        if (!isVoteSkipped && checkAndApplyExtension(donation)) {
            logSystem(`🧪 <strong>[Test Donate]</strong> Kích hoạt tính năng Gia hạn thành công.`, 'system');
            isExtended = true;
        }

        // 3. Hiển thị thông báo góc Dashboard & OBS Overlay
        if (!isVoteSkipped && !isExtended) {
            handleNewDonation(donation, true);
        }

        if ((isVoteSkipped || isExtended) && !songLink) {
            return;
        }

        // 4. Nếu có kèm link bài hát hợp lệ, tự động cào metadata & thêm vào hàng đợi
        if (songLink) {
            if (isFromMessage) {
                const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
                if (amount < minAmount) {
                    logSystem(`⚠️ 🧪 <strong>[Test Donate]</strong> Link nhạc trong tin nhắn bị bỏ qua do số tiền (${amount.toLocaleString('vi-VN')} ₫) nhỏ hơn số tiền tối thiểu thiết lập (${minAmount.toLocaleString('vi-VN')} ₫).`, 'system');
                    return;
                }
            }

            let type = null;
            let videoId = null;
            let soundcloudUrl = null;

            if (songLink.includes('soundcloud.com')) {
                soundcloudUrl = songLink.split(/[\s?#]/)[0];
                type = 'soundcloud';
            } else {
                videoId = parseYoutubeId(songLink);
                if (videoId) {
                    type = 'youtube';
                }
            }

            if (type) {
                try {
                    logSystem(`🧪 <strong>[Test Donate]</strong> Đang tải siêu dữ liệu cho bài hát: <strong>${songLink}</strong>...`, 'system');
                    const meta = await fetchSongMetadata(type, videoId, soundcloudUrl);
                    
                    const musicKey = donation.id;
                    const msgItem = {
                        id: musicKey,
                        musicKey: musicKey,
                        isZyPage: true,
                        fromMessage: isFromMessage || !donation.isMusicOrder,
                        type: type,
                        videoId: videoId || null,
                        
                        soundcloudUrl: soundcloudUrl || null,
                        title: meta.title,
                        thumbnail: meta.thumbnail,
                        donorName: donorName,
                        amount: amount,
                        message: message,
                        start: 0,
                        end: null,
                        timestamp: donation.timestamp,
                        localAddedAt: Date.now()
                    };

                    insertSongSmartly(msgItem);
                    broadcastNewDonationAlert(msgItem);
                    logSystem(`🧪 <strong>[Test Donate]</strong> Đã tự động thêm nhạc vào hàng đợi: <strong>${meta.title}</strong>`, 'queue');
                    
                    // Cập nhật giao diện và tự phát nếu cần
                    sortAndRefreshQueue();
                    if (!state.currentSong && !state.focusMode) {
                        playNextInQueue();
                    }
                } catch (err) {
                    console.error("Lỗi lấy metadata cho bài nhạc test donate:", err);
                    logSystem(`⚠️ 🧪 <strong>[Test Donate]</strong> Lỗi lấy siêu dữ liệu bài hát: ${err.message}`, 'error');
                }
            } else {
                logSystem(`🧪 <strong>[Test Donate]</strong> Link bài hát không được hỗ trợ (cần là YouTube hoặc SoundCloud): ${songLink}`, 'system');
            }
        }
    });
}

// --- LẮNG NGHE SỰ KIỆN THÊM NHẠC TỪ EXTENSION ---
if (window.electronAPI && typeof window.electronAPI.onAddSongExternal === 'function') {
    window.electronAPI.onAddSongExternal(async (data) => {
        if (!data || !data.url) return;
        if (state.focusMode) {
            logSystem(`⚠️ <strong>[Extension]</strong> Không thể thêm nhạc do đang bật chế độ Tập trung.`, 'system');
            return;
        }

        let url = data.url.trim();
        let videoId = parseYoutubeId(url);
        let type = 'youtube';

        if (!videoId) {
            logSystem(`⚠️ <strong>[Extension]</strong> Link bài hát không hợp lệ: ${url}`, 'error');
            return;
        }

        logSystem(`🔌 <strong>[Extension]</strong> Nhận yêu cầu phát bài hát từ Browser: <strong>${url}</strong>`, 'system');

        try {
            let title = '';
            let thumbnail = '';

            if (window.electronAPI && typeof window.electronAPI.getYoutubeMetadata === 'function') {
                const metadata = await window.electronAPI.getYoutubeMetadata(videoId);
                title = metadata.title || `Nhạc YouTube (${videoId})`;
                thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            } else {
                const fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
                const response = await fetch(fetchUrl);
                const resData = await response.json();
                title = resData.title || `Nhạc YouTube (${videoId})`;
                thumbnail = resData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }

            const newSong = {
                id: 'ext_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: type,
                videoId: videoId,
                
                soundcloudUrl: null,
                title: title,
                thumbnail: thumbnail,
                donorName: "Trình duyệt",
                amount: 100000000, // Mặc định 100M để được ưu tiên cao
                message: "Gửi từ extension trình duyệt",
                start: 0,
                end: null,
                timestamp: Date.now(),
                localAddedAt: Date.now(),
                isOwnerAdd: true,
                isExtensionAdd: true
            };

            insertSongSmartly(newSong);
            broadcastNewDonationAlert(newSong);
            saveQueue();
            sortAndRefreshQueue();

            logSystem(`🔌 <strong>[Extension]</strong> Đã thêm nhạc vào hàng đợi: <strong>${title}</strong>`, 'queue');
            // Thông báo taskbar phi tập trung (không cướp focus)
            if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
                window.electronAPI.showTaskbarNotification(
                    'Đã thêm bài hát từ trình duyệt',
                    title,
                    document.body.classList.contains('dark-mode'),
                    3000
                );
            }

            // Tự động phát nếu trình phát đang dừng
            if (!state.currentSong && !state.focusMode) {
                playNextInQueue();
            } else if (data.playNow) {
                // Phát ngay lập tức: skip bài đang phát
                logSystem(`🔌 <strong>[Extension]</strong> Yêu cầu phát ngay lập tức. Đang bỏ qua bài hiện tại...`, 'system');
                skipSong(false);
            }
        } catch (err) {
            console.error("Lỗi thêm nhạc từ Extension:", err);
            logSystem(`⚠️ <strong>[Extension]</strong> Lỗi lấy thông tin bài hát: ${err.message}`, 'error');
        }
    });
}



// ===================================================
// VIDEO PREVIEW PANEL — Dashboard (vpanel)
// ===================================================
// Preview iframe shows video from overlay, synced via dua_overlay_state.
// Audio stays in overlay. Controls here command the overlay player.

(function initDashboardVideoPlayer() {
    // -- State --
    let vpCurrentVideoId = null;
    let vpIsPlaying = false;
    let vpPreviewMuted = true;        // preview iframe is muted by default
    let vpIsDashFullscreen = false;
    let vpVideoEnabled = true;
    let vpCcEnabled = localStorage.getItem('vpanel_cc_enabled') === 'true';
    let vpSyncInterval = null;
    let vpIframePlayer = null;        // YT player API handle for the preview iframe
    let vpIframePlayerReady = false;
    let playerInitInProgress = false;
    let vpDirectPlayer = null;        // HTML5 video element handle for DirectStream
    let vpPipWindow = null;
    let vpPipPlaceholder = null;
    let vpUseDirectStreamFallback = false; // Flag to indicate fallback to DirectStream on YT Iframe error
    let directLoadInProgress = false; // flag to avoid overlapping fetch requests
    let directLoadVideoId = null;
    let directLoadFailedAt = 0;
    let vpCurrentTime = 0;
    let vpDuration = 0;
    let vpIsLive = false;
    let vpLastIframeSeekAt = 0;
    let vpLastDirectSeekAt = 0;
    let vpLastSyncTimestamp = 0;

    // -- Element refs (resolved after DOM is ready) --
    let elSection, elIframe, elEmptyOverlay, elSyncBadge,
        elPlayIcon, elTimeDisplay, elMuteBtn, elFsDashTop, elFsDashBot;

    function resolveElements() {
        elSection      = document.getElementById('video-preview-section');
        elIframe       = document.getElementById('vpanel-iframe');
        elEmptyOverlay = document.getElementById('vpanel-empty-overlay');
        elSyncBadge    = document.getElementById('vpanel-sync-badge');
        elPlayIcon     = document.getElementById('vpanel-play-icon');
        elTimeDisplay  = document.getElementById('vpanel-time-display');
        elMuteBtn      = document.getElementById('vpanel-btn-mute-preview');
        elFsDashTop    = document.getElementById('vpanel-btn-fullscreen-dash');
        elFsDashBot    = document.getElementById('vpanel-btn-fs-dash-bottom');
    }

    function isVideoPanelActive() {
        const videoTab = document.getElementById('tab-video');
        return !!(vpVideoEnabled && videoTab && videoTab.classList.contains('active'));
    }

    function suspendPreviewPlayers(reasonText = '⏸ Video Mode tạm nghỉ') {
        destroyDirectPlayer();
        destroyYTPlayer();
        setSyncBadge('no-video', reasonText);
    }


    function resumeVideoPanelFromCurrentState() {
        if (!vpVideoEnabled || !isVideoPanelActive()) return;

        let song = null;
        try {
            const rawSong = localStorage.getItem('dua_current_song');
            if (rawSong) song = JSON.parse(rawSong);
        } catch (e) {}
        if ((!song || song.type !== 'youtube' || !song.videoId) && typeof state !== 'undefined' && state.currentSong?.type === 'youtube') {
            song = state.currentSong;
        }

        if (!song || song.type !== 'youtube' || !song.videoId) {
            vpCurrentVideoId = null;
            destroyYTPlayer();
            destroyDirectPlayer();
            showEmptyOverlay(true);
            setSyncBadge('no-video', 'â¬› ChÆ°a cÃ³ video');
            return;
        }

        let currentTime = 0;
        let isDirectStream = false;
        try {
            const rawState = localStorage.getItem('dua_overlay_state');
            if (rawState) {
                const overlayState = JSON.parse(rawState);
                currentTime = Number(overlayState.currentTime) || 0;
                isDirectStream = !!overlayState.isDirectStream;
                vpDuration = Number(overlayState.duration) || 0;
                vpIsPlaying = !!overlayState.isPlaying;
                vpIsLive = !!overlayState.isLive || (!isDirectStream && (!vpDuration || vpDuration <= 0));
            }
        } catch (e) {}
        if (!currentTime && typeof state !== 'undefined' && state.lastReportedTime) {
            currentTime = state.lastReportedTime;
        }

        showEmptyOverlay(false);
        vpCurrentVideoId = song.videoId;
        vpUseDirectStreamFallback = isDirectStream;
        updatePlayIcon(vpIsPlaying);
        updateTimeDisplay(currentTime, vpDuration || song.duration || 0);

        if (isDirectStream) {
            destroyYTPlayer();
            if (!vpDirectPlayer || directLoadVideoId !== song.videoId) {
                loadDirectStream(song.videoId, currentTime);
            }
        } else {
            destroyDirectPlayer();
            if (!vpIframePlayer || !vpIframePlayerReady) {
                initYTPlayerInstance(song.videoId, currentTime);
            }
        }

        vpLastSyncTimestamp = 0;
        setTimeout(() => syncFromOverlayState(true), 120);
    }

    function moveCurrentSongToolsToVideoTab(shouldMove) {
        const toolsCard = document.getElementById('dashboard-player-tools');
        const videoColumn = document.getElementById('video-mode-right-column');
        const videoQueue = document.getElementById('card-queue-video');
        const playerToolsHost = document.querySelector('#tab-player .left-column');
        if (!toolsCard) return;

        if (shouldMove && videoColumn) {
            videoColumn.insertBefore(toolsCard, videoQueue || videoColumn.firstChild);
        } else if (!shouldMove && playerToolsHost) {
            const queueCard = document.getElementById('card-queue');
            if (queueCard && queueCard.parentNode === playerToolsHost) {
                playerToolsHost.insertBefore(toolsCard, queueCard);
            } else {
                playerToolsHost.appendChild(toolsCard);
            }
        }
    }

    function updateCcButtonUI() {
        const btn = document.getElementById('vpanel-btn-cc');
        if (!btn) return;
        btn.classList.toggle('active-toggle', vpCcEnabled);
        btn.innerHTML = `<i class="fa-solid fa-closed-captioning"></i> CC: ${vpCcEnabled ? 'Bat' : 'Tat'}`;
    }

    function applyCaptionStateToIframePlayer() {
        if (!vpIframePlayer || !vpIframePlayerReady) return;
        try {
            if (vpCcEnabled) {
                if (typeof vpIframePlayer.loadModule === 'function') vpIframePlayer.loadModule('captions');
                if (typeof vpIframePlayer.setOption === 'function') {
                    vpIframePlayer.setOption('captions', 'track', {});
                    vpIframePlayer.setOption('captions', 'fontSize', 1);
                }
            } else if (typeof vpIframePlayer.unloadModule === 'function') {
                vpIframePlayer.unloadModule('captions');
            }
        } catch (e) {
            console.warn('[Video Preview] Unable to update captions state:', e);
        }
    }

    function restoreFromDocumentPip() {
        const wrapper = document.getElementById('vpanel-iframe-wrapper');
        if (wrapper && vpPipPlaceholder) {
            vpPipPlaceholder.replaceWith(wrapper);
        }
        vpPipPlaceholder = null;
        vpPipWindow = null;
    }

    // -- Build YouTube embed URL --
    function buildYTUrl(videoId, startSec) {
        startSec = Math.max(0, Math.floor(startSec || 0));
        const mute = vpPreviewMuted ? 1 : 0;
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${mute}&enablejsapi=1&controls=0&start=${startSec}&origin=${encodeURIComponent(window.location.origin)}&rel=0&modestbranding=1`;
    }

    // -- Ensure YouTube Iframe API script is loaded and ready --
    function ensureYTAPIReady() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                resolve();
                return;
            }

            // Append script if not already in document
            if (!document.getElementById('yt-iframe-api-script')) {
                const tag = document.createElement('script');
                tag.id = 'yt-iframe-api-script';
                tag.src = "https://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                if (firstScriptTag) {
                    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                } else {
                    document.head.appendChild(tag);
                }
            }

            // Poll for YT object readiness
            const checkInterval = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50);
        });
    }

    // -- Rebuild Div Placeholder to avoid API wrapper/state issues --
    function rebuildPlaceholderElement() {
        const wrapper = document.getElementById('vpanel-iframe-wrapper');
        if (!wrapper) return null;

        // Remove old iframe/placeholder if exists
        const oldElement = document.getElementById('vpanel-iframe');
        if (oldElement) {
            try { oldElement.parentNode.removeChild(oldElement); } catch(e){}
        }

        // Create new clean div placeholder with the expected ID 'vpanel-iframe'
        const div = document.createElement('div');
        div.id = 'vpanel-iframe';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.background = '#000';

        wrapper.appendChild(div);
        elIframe = div;
        return div;
    }

    // -- Clean up YT Player --
    function destroyYTPlayer() {
        if (vpIframePlayer) {
            try {
                if (typeof vpIframePlayer.destroy === 'function') {
                    vpIframePlayer.destroy();
                }
            } catch (e) {
                console.error("[Video Preview] Error destroying YT.Player:", e);
            }
            vpIframePlayer = null;
        }
        vpIframePlayerReady = false;
        playerInitInProgress = false;
        rebuildPlaceholderElement();
    }

    // -- Rebuild HTML5 Video Element for DirectStream --
    function rebuildDirectVideoElement() {
        const wrapper = document.getElementById('vpanel-iframe-wrapper');
        if (!wrapper) return null;

        // Remove old video or iframe if exists
        const oldVideo = document.getElementById('vpanel-video-direct');
        if (oldVideo) {
            try { oldVideo.parentNode.removeChild(oldVideo); } catch(e){}
        }
        const oldIframe = document.getElementById('vpanel-iframe');
        if (oldIframe) {
            try { oldIframe.parentNode.removeChild(oldIframe); } catch(e){}
        }

        // Create new HTML5 video player
        const video = document.createElement('video');
        video.id = 'vpanel-video-direct';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.background = '#000';
        video.autoplay = true;
        video.muted = vpPreviewMuted;
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.zIndex = '5'; // Place above iframe

        wrapper.appendChild(video);
        vpDirectPlayer = video;
        return video;
    }

    // -- Clean up HTML5 Direct Video Player --
    function destroyDirectPlayer() {
        if (vpDirectPlayer) {
            try {
                vpDirectPlayer.pause();
                vpDirectPlayer.src = '';
                vpDirectPlayer.load();
                if (vpDirectPlayer.parentNode) {
                    vpDirectPlayer.parentNode.removeChild(vpDirectPlayer);
                }
            } catch (e) {
                console.error("[Video Preview] Error destroying direct player:", e);
            }
            vpDirectPlayer = null;
        }
        directLoadInProgress = false;
    }

    // -- Initialize the YouTube Player API Instance --
    function initYTPlayerInstance(videoId, startSec) {
        const startSeconds = vpIsLive ? 0 : Math.max(0, Math.floor(startSec || 0));
        if (vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.loadVideoById === 'function') {
            try {
                vpIframePlayer.loadVideoById({
                    videoId: videoId,
                    startSeconds
                });
                if (vpPreviewMuted) {
                    vpIframePlayer.mute();
                } else {
                    vpIframePlayer.unMute();
                }
                return;
            } catch (e) {
                console.error("[Video Preview] Failed to load video via API, recreating...", e);
                destroyYTPlayer();
            }
        }

        if (playerInitInProgress) return;
        playerInitInProgress = true;

        ensureYTAPIReady().then(() => {
            // Rebuild fresh placeholder div in DOM
            rebuildPlaceholderElement();

            try {
                // Instantiating YT.Player on 'vpanel-iframe' div. YT API will replace this div with the actual iframe
                vpIframePlayer = new YT.Player('vpanel-iframe', {
                    height: '100%',
                    width: '100%',
                    videoId: videoId,
                    playerVars: {
                        'autoplay': 1,
                        'mute': vpPreviewMuted ? 1 : 0,
                        'enablejsapi': 1,
                        'controls': 0,
                        'start': startSeconds,
                        'origin': window.location.origin,
                        'rel': 0,
                        'modestbranding': 1,
                        'cc_load_policy': vpCcEnabled ? 1 : 0
                    },
                    events: {
                        'onReady': (event) => {
                            vpIframePlayerReady = true;
                            playerInitInProgress = false;
                            
                            // Re-resolve elIframe to point to the newly replaced iframe element
                            elIframe = document.getElementById('vpanel-iframe');
                            
                            if (vpPreviewMuted) {
                                vpIframePlayer.mute();
                            } else {
                                vpIframePlayer.unMute();
                            }
                            applyCaptionStateToIframePlayer();
                            syncFromOverlayState();
                        },
                        'onStateChange': (event) => {
                            // optional state changes
                        },
                        'onError': (event) => {
                            console.error("[Video Preview] YT player error:", event.data);
                            destroyYTPlayer();
                            setSyncBadge('no-video', '⚠ Iframe preview lỗi');
                        }
                    }
                });
            } catch (e) {
                console.error("[Video Preview] Error creating YT.Player:", e);
                playerInitInProgress = false;
                setSyncBadge('no-video', '⚠ Iframe preview lỗi');
            }
        }).catch(err => {
            console.error("[Video Preview] Failed to resolve YouTube API:", err);
            playerInitInProgress = false;
            setSyncBadge('no-video', '⚠ Iframe preview lỗi');
        });
    }

    // -- Load a video into the preview iframe --
    function vpLoadVideo(videoId, startSec) {
        if (videoId === vpCurrentVideoId && startSec === undefined) return;
        vpCurrentVideoId = videoId;
        
        if (!videoId) {
            vpCurrentVideoId = null;
            destroyYTPlayer();
            destroyDirectPlayer();
            showEmptyOverlay(true);
            setSyncBadge('no-video', '⬛ Chưa có video');
            return;
        }

        showEmptyOverlay(false);
        setSyncBadge('syncing', '⟳ Đang tải...');
        initYTPlayerInstance(videoId, startSec);
    }

    // -- Load Direct Stream Video/Audio --
    function loadDirectStream(videoId, startSec) {
        if (directLoadInProgress && directLoadVideoId === videoId) return;
        if (directLoadFailedAt && Date.now() - directLoadFailedAt < 10000) return;
        directLoadInProgress = true;
        directLoadVideoId = videoId;

        destroyYTPlayer(); // Ensure YouTube player is clean
        rebuildDirectVideoElement(); // Recreate video DOM

        setSyncBadge('syncing', '⟳ Đang giải mã DirectStream...');

        const streamApiUrl = `/api/yt-stream?videoId=${videoId}&type=video`;
        fetch(streamApiUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                directLoadInProgress = false;
                directLoadVideoId = null;
                if (vpCurrentVideoId !== videoId) return;

                if (data.success && data.url) {
                    directLoadFailedAt = 0;
                    if (vpDirectPlayer) {
                        const startAt = Math.max(0, Number(startSec) || 0);
                        const syncDirectPlayback = () => {
                            if (!vpDirectPlayer || vpCurrentVideoId !== videoId) return;

                            if (vpIsPlaying) {
                                startDirectPreviewPlayback(startAt);
                            } else {
                                try {
                                    vpDirectPlayer.currentTime = startAt;
                                } catch (seekErr) {
                                    console.warn("[Video Preview] Unable to seek DirectStream immediately:", seekErr);
                                }
                                vpDirectPlayer.pause();
                                vpDirectPlayer.muted = vpPreviewMuted;
                                setSyncBadge('synced', '⏸ Tạm dừng (DirectStream)');
                            }
                        };

                        vpDirectPlayer.src = data.url;
                        vpDirectPlayer.preload = 'auto';
                        vpDirectPlayer.playsInline = true;
                        vpDirectPlayer.muted = vpPreviewMuted;

                        const handleReady = () => {
                            vpDirectPlayer.removeEventListener('loadedmetadata', handleReady);
                            vpDirectPlayer.removeEventListener('canplay', handleReady);
                            syncDirectPlayback();
                        };

                        vpDirectPlayer.addEventListener('loadedmetadata', handleReady);
                        vpDirectPlayer.addEventListener('canplay', handleReady);

                        try {
                            vpDirectPlayer.load();
                        } catch (loadErr) {
                            console.warn("[Video Preview] DirectStream load() failed:", loadErr);
                        }

                        if (vpDirectPlayer.readyState >= 1) {
                            handleReady();
                        }
                    }
                } else {
                    throw new Error(data.error || "Unknown resolution error");
                }
            })
            .catch(err => {
                directLoadInProgress = false;
                directLoadVideoId = null;
                directLoadFailedAt = Date.now();
                console.error("[Video Preview] Failed to resolve DirectStream:", err);
                setSyncBadge('no-video', '⚠ Lỗi DirectStream');
            });
    }

    function showEmptyOverlay(show) {
        if (!elEmptyOverlay) return;
        if (show) {
            elEmptyOverlay.classList.remove('hidden');
        } else {
            elEmptyOverlay.classList.add('hidden');
        }
    }

    // Custom CSS style fallback will keep sync badge colors
    function setSyncBadge(cls, text) {
        if (!elSyncBadge) return;
        elSyncBadge.className = `vpanel-sync-badge ${cls}`;
        elSyncBadge.innerHTML = `<i class="fa-solid fa-circle" style="font-size:0.5rem;"></i> ${text}`;
    }

    function startDirectPreviewPlayback(startAt, badgeText = '✓ Đồng bộ (DirectStream)') {
        if (!vpDirectPlayer || !vpCurrentVideoId) return;

        try {
            vpDirectPlayer.currentTime = Math.max(0, Number(startAt) || 0);
        } catch (seekErr) {
            console.warn('[Video Preview] Unable to seek DirectStream immediately:', seekErr);
        }

        const restoreMuteState = () => {
            if (!vpDirectPlayer || !vpCurrentVideoId) return;
            vpDirectPlayer.muted = vpPreviewMuted;
            if (!vpPreviewMuted) {
                try { vpDirectPlayer.volume = 1; } catch (e) {}
            }
        };

        vpDirectPlayer.muted = true;
        const playResult = vpDirectPlayer.play();
        if (playResult && typeof playResult.then === 'function') {
            playResult
                .then(() => {
                    restoreMuteState();
                    setSyncBadge('synced', badgeText);
                })
                .catch(err => {
                    restoreMuteState();
                    console.error('[Video Preview] Direct stream play error:', err);
                    setSyncBadge('no-video', '⚠ Lỗi DirectStream');
                });
        } else {
            restoreMuteState();
            setSyncBadge('synced', badgeText);
        }
    }

    function isDirectPreviewLive() {
        if (!vpUseDirectStreamFallback || !vpDirectPlayer) return false;
        const mediaDuration = vpDirectPlayer.duration;
        return vpIsLive || !Number.isFinite(mediaDuration) || mediaDuration <= 0 || vpDuration <= 0;
    }

    function shouldSeekPreview(kind, drift, threshold) {
        const now = Date.now();
        const lastSeekAt = kind === 'direct' ? vpLastDirectSeekAt : vpLastIframeSeekAt;
        if (Math.abs(drift) < threshold || now - lastSeekAt < 1500) return false;

        if (kind === 'direct') {
            vpLastDirectSeekAt = now;
        } else {
            vpLastIframeSeekAt = now;
        }
        return true;
    }

    function updatePlayIcon(isPlaying) {
        if (!elPlayIcon) return;
        elPlayIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    }

    function updateTimeDisplay(currentTime, duration) {
        if (!elTimeDisplay) return;
        elTimeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }

    // -- Sync loop: read overlay state from localStorage every 1.5s --
    function startSyncLoop() {
        if (vpSyncInterval) clearInterval(vpSyncInterval);
        vpSyncInterval = setInterval(() => {
            syncFromOverlayState();
        }, 1500);
    }

    function syncFromOverlayState(force = false) {
        try {
            const raw = localStorage.getItem('dua_overlay_state');
            let currentTime = 0, duration = 0, isPlaying = false, timestamp = 0, isDirectStream = false, isLive = false, sentAt = 0;
            if (raw) { 
                try { 
                    const os = JSON.parse(raw); 
                    currentTime = os.currentTime||0; 
                    duration = os.duration||0; 
                    isPlaying = !!os.isPlaying; 
                    timestamp = os.timestamp||0; 
                    isDirectStream = !!os.isDirectStream;
                    isLive = !!os.isLive;
                    sentAt = os.sentAt||0;
                } catch(ep){} 
            }
            if (!force && timestamp && timestamp === vpLastSyncTimestamp) return; // truly no new data
            if (timestamp) vpLastSyncTimestamp = timestamp;

            vpUseDirectStreamFallback = isDirectStream;

            vpCurrentTime = currentTime || (typeof state !== 'undefined' && state.lastReportedTime ? state.lastReportedTime : 0);
            vpDuration = duration || 0;
            vpIsPlaying = isPlaying || (typeof state !== 'undefined' ? !!state.isPlaying : false);
            vpIsLive = !!isLive || (!isDirectStream && (!duration || duration <= 0));

            updateTimeDisplay(vpCurrentTime, vpDuration);
            updatePlayIcon(vpIsPlaying);

            // Check if we need to load a new video
            const songRaw = localStorage.getItem('dua_current_song');
            if (songRaw) {
                const song = JSON.parse(songRaw);
                const newVideoId = song && song.type === 'youtube' ? song.videoId : null;

                if (newVideoId) {
                    if (!vpVideoEnabled) {
                        destroyYTPlayer();
                        destroyDirectPlayer();
                        vpCurrentVideoId = newVideoId;
                        setSyncBadge('no-video', '⏸ Đã tắt xem video');
                        return;
                    }

                    if (!isVideoPanelActive()) {
                        vpCurrentVideoId = newVideoId;
                        suspendPreviewPlayers();
                        return;
                    }

                    // Reset fallback state if video changed
                    if (newVideoId !== vpCurrentVideoId) {
                        vpCurrentVideoId = newVideoId;
                        vpUseDirectStreamFallback = false;
                        directLoadVideoId = null;
                        directLoadFailedAt = 0;
                    }

                    const now = Date.now();
                    const latency = sentAt ? (now - sentAt) : 0;
                    const safeLatency = Math.min(Math.max(0, latency), 2000);
                    const estimatedAudioTime = vpCurrentTime + (vpIsPlaying ? safeLatency / 1000 : 0);

                    vpUseDirectStreamFallback = isDirectStream;

                    if (vpUseDirectStreamFallback) {
                        if (vpIframePlayer || vpIframePlayerReady || playerInitInProgress) {
                            destroyYTPlayer();
                        }
                        if (!vpDirectPlayer) {
                            loadDirectStream(vpCurrentVideoId, estimatedAudioTime);
                        } else {
                            const previewTime = vpDirectPlayer.currentTime;
                            const drift = estimatedAudioTime - previewTime;
                            const isLivePreview = isDirectPreviewLive();
                            
                            if (vpIsPlaying) {
                                if (vpDirectPlayer.paused) {
                                    startDirectPreviewPlayback(estimatedAudioTime);
                                }
                                if (!isLivePreview && shouldSeekPreview('direct', drift, 1.5) && !vpDirectPlayer.seeking) {
                                    vpDirectPlayer.currentTime = estimatedAudioTime;
                                }
                                setSyncBadge('synced', '✓ Đồng bộ (DirectStream)');
                            } else {
                                if (!vpDirectPlayer.paused) {
                                    vpDirectPlayer.pause();
                                }
                                if (!isLivePreview && shouldSeekPreview('direct', drift, 1.5) && !vpDirectPlayer.seeking) {
                                    vpDirectPlayer.currentTime = estimatedAudioTime;
                                }
                                setSyncBadge('synced', '⏸ Tạm dừng (DirectStream)');
                            }
                        }
                    } else {
                        destroyDirectPlayer();
                        if (!vpIframePlayer || !vpIframePlayerReady) {
                            initYTPlayerInstance(vpCurrentVideoId, estimatedAudioTime);
                        } else {
                            const previewTime = vpIframePlayer.getCurrentTime ? vpIframePlayer.getCurrentTime() : 0;
                            const playerState = vpIframePlayer.getPlayerState ? vpIframePlayer.getPlayerState() : -1;
                            const drift = estimatedAudioTime - previewTime;

                            if (vpIsPlaying) {
                                if (playerState !== YT.PlayerState.PLAYING) {
                                    try { vpIframePlayer.playVideo(); } catch(e){}
                                }
                                if (!vpIsLive && shouldSeekPreview('iframe', drift, 1.25)) {
                                    try { vpIframePlayer.seekTo(estimatedAudioTime, true); } catch(e){}
                                }
                                setSyncBadge('synced', '✓ Đồng bộ (YT Iframe)');
                            } else {
                                if (playerState !== YT.PlayerState.PAUSED && playerState !== YT.PlayerState.ENDED) {
                                    try { vpIframePlayer.pauseVideo(); } catch(e){}
                                }
                                if (!vpIsLive && shouldSeekPreview('iframe', drift, 1.25)) {
                                    try { vpIframePlayer.seekTo(estimatedAudioTime, true); } catch(e){}
                                }
                                setSyncBadge('synced', '⏸ Tạm dừng (YT Iframe)');
                            }
                        }
                    }
                }
            } else {
                // No song playing
                if (vpCurrentVideoId) {
                    vpCurrentVideoId = null;
                    destroyYTPlayer();
                    destroyDirectPlayer();
                    showEmptyOverlay(true);
                }
                setSyncBadge('no-video', '⬛ Chưa có video');
            }
        } catch (e) {
            // ignore
        }
    }



    // -- Watch for initial state on DOMContentLoaded --
    function init() {
        resolveElements();
        updateCcButtonUI();
        if (document.getElementById('tab-video')?.classList.contains('active')) {
            moveCurrentSongToolsToVideoTab(true);
        }
        // startSyncLoop(); // Tắt vòng lặp kiểm tra localStorage định kỳ để tránh tranh chấp giật hình với WebSocket thực tế

        // Restore video preview enabled state
        const savedVideoEnabled = localStorage.getItem('vpanel_video_enabled');
        if (savedVideoEnabled === 'false') {
            vpVideoEnabled = false;
        } else {
            vpVideoEnabled = true;
        }
        const elToggle = document.getElementById('video-preview-toggle-switch');
        if (elToggle) elToggle.checked = vpVideoEnabled;
        if (elSection) {
            if (isVideoPanelActive()) {
                elSection.classList.remove('vp-hidden');
            } else {
                elSection.classList.add('vp-hidden');
            }
        }

        // Initial load: try dua_current_song (set by playSong) OR state.currentSong
        let initSong = null;
        try { const r = localStorage.getItem('dua_current_song'); if(r) initSong = JSON.parse(r); } catch(e){}
        // Fallback: read from app's global state (same JS context)
        if (!initSong && typeof state !== 'undefined' && state.currentSong) initSong = state.currentSong;
        if (initSong && initSong.type === 'youtube' && initSong.videoId) {
            let startAt = 0;
            try { 
                const sr = localStorage.getItem('dua_overlay_state'); 
                if(sr) {
                    const os = JSON.parse(sr);
                    startAt = os.currentTime || 0; 
                }
            } catch(e){}
            if (!startAt && typeof state !== 'undefined' && state.lastReportedTime) startAt = state.lastReportedTime;
            
            vpCurrentVideoId = initSong.videoId;
            vpUseDirectStreamFallback = false;
            directLoadVideoId = null;
            directLoadFailedAt = 0;
            if (isVideoPanelActive()) {
                showEmptyOverlay(false);
                setSyncBadge('syncing', '⟳ Đang tải...');
                initYTPlayerInstance(initSong.videoId, startAt);
            } else {
                setSyncBadge('no-video', '⏸ Đã tắt xem video');
            }
            
            vpIsPlaying = typeof state !== 'undefined' ? !!state.isPlaying : false;
            updatePlayIcon(vpIsPlaying);
        }

        // Handle iframe load event fallback (only if no player API bound yet)
        if (elIframe) {
            elIframe.addEventListener('load', function() {
                if (elIframe.src !== 'about:blank' && vpCurrentVideoId && !vpIframePlayerReady) {
                    setSyncBadge('synced', '✓ Đồng bộ');
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

    // ===================== PUBLIC FUNCTIONS =====================

    // Toggle Video Preview visibility and active player
    window.toggleVideoPreview = function(enabled) {
        vpVideoEnabled = !!enabled;
        localStorage.setItem('vpanel_video_enabled', vpVideoEnabled ? 'true' : 'false');
        
        const elToggle = document.getElementById('video-preview-toggle-switch');
        if (elToggle) elToggle.checked = vpVideoEnabled;

        if (elSection) {
            if (vpVideoEnabled) {
                elSection.classList.remove('vp-hidden');
                // Trigger sync immediately to load video
                resumeVideoPanelFromCurrentState();
            } else {
                elSection.classList.add('vp-hidden');
                destroyDirectPlayer();
                destroyYTPlayer();
                setSyncBadge('no-video', '⏸ Đã tắt xem video');
            }
        }
    };

    // Play/Pause — command goes to overlay
    window.vpanelHandleTabChange = function(tabId) {
        if (tabId === 'video' && vpVideoEnabled) {
            moveCurrentSongToolsToVideoTab(true);
            if (elSection) elSection.classList.remove('vp-hidden');
            resumeVideoPanelFromCurrentState();
        } else if (tabId !== 'video') {
            moveCurrentSongToolsToVideoTab(false);
            restoreFromDocumentPip();
            suspendPreviewPlayers();
        }
    };

    window.vpanelToggleCc = function() {
        vpCcEnabled = !vpCcEnabled;
        localStorage.setItem('vpanel_cc_enabled', vpCcEnabled ? 'true' : 'false');
        updateCcButtonUI();
        applyCaptionStateToIframePlayer();
    };

    window.vpanelTogglePiP = async function() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                return;
            }

            if (vpDirectPlayer && document.pictureInPictureEnabled && typeof vpDirectPlayer.requestPictureInPicture === 'function') {
                await vpDirectPlayer.requestPictureInPicture();
                return;
            }

            const wrapper = document.getElementById('vpanel-iframe-wrapper');
            if (!wrapper) return;

            if (vpPipWindow && !vpPipWindow.closed) {
                vpPipWindow.close();
                restoreFromDocumentPip();
                return;
            }

            if (window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === 'function') {
                vpPipPlaceholder = document.createElement('div');
                vpPipPlaceholder.id = 'vpanel-pip-placeholder';
                vpPipPlaceholder.style.cssText = 'width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;';
                wrapper.parentNode.insertBefore(vpPipPlaceholder, wrapper);

                vpPipWindow = await window.documentPictureInPicture.requestWindow({
                    width: Math.min(960, Math.max(420, wrapper.clientWidth || 640)),
                    height: Math.min(540, Math.max(240, wrapper.clientHeight || 360))
                });
                const style = vpPipWindow.document.createElement('style');
                style.textContent = 'html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden;} #vpanel-iframe-wrapper{width:100%!important;height:100%!important;max-height:none!important;border-radius:0!important;}';
                vpPipWindow.document.head.appendChild(style);
                vpPipWindow.document.body.appendChild(wrapper);
                vpPipWindow.addEventListener('pagehide', restoreFromDocumentPip, { once: true });
                return;
            }

            logSystem('[Video Preview] Trinh duyet hien tai khong ho tro PiP cho iframe.', 'system');
        } catch (err) {
            console.error('[Video Preview] PiP error:', err);
            restoreFromDocumentPip();
            logSystem(`[Video Preview] Khong the bat PiP: ${err.message}`, 'error');
        }
    };

    window.vpanelApplyPlaybackCommand = function(type) {
        if (type === 'pause' || type === 'stop') {
            vpIsPlaying = false;
            updatePlayIcon(false);
            if (vpDirectPlayer && !vpDirectPlayer.paused) {
                try { vpDirectPlayer.pause(); } catch (e) {}
            }
            if (vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.pauseVideo === 'function') {
                try { vpIframePlayer.pauseVideo(); } catch (e) {}
            }
            if (type === 'stop') {
                setSyncBadge('no-video', 'â¹ ÄÃ£ dá»«ng');
            }
            return;
        }

        if (type === 'play') {
            vpIsPlaying = true;
            updatePlayIcon(true);
            if (!isVideoPanelActive()) return;
            if (vpDirectPlayer && vpDirectPlayer.paused) {
                vpDirectPlayer.play().catch(() => {});
            }
            if (vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.playVideo === 'function') {
                try { vpIframePlayer.playVideo(); } catch (e) {}
            }
        }
    };

    window.vpanelPlayPause = function() {
        if (vpIsPlaying) {
            sendControlCommand('pause');
            vpIsPlaying = false;
            updatePlayIcon(false);
            if (vpDirectPlayer && !vpDirectPlayer.paused) {
                vpDirectPlayer.pause();
            }
            if (vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.pauseVideo === 'function') {
                vpIframePlayer.pauseVideo();
            }
        } else {
            sendControlCommand('play');
            vpIsPlaying = true;
            updatePlayIcon(true);
            if (vpDirectPlayer && vpDirectPlayer.paused) {
                vpDirectPlayer.play().catch(()=>{});
            }
            if (vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.playVideo === 'function') {
                vpIframePlayer.playVideo();
            }
        }
    };

    // Seek relative (seconds) — command goes to overlay
    window.vpanelSeekRelative = function(deltaSec) {
        const newTime = Math.max(0, vpCurrentTime + deltaSec);
        const limitedTime = vpDuration > 0 ? Math.min(newTime, vpDuration - 1) : newTime;
        sendControlCommand('seek', limitedTime);
        vpCurrentTime = limitedTime;
        updateTimeDisplay(vpCurrentTime, vpDuration);
        
        // Seek direct player
        if (vpDirectPlayer) {
            vpDirectPlayer.currentTime = limitedTime;
        }
        // Seek YouTube player
        if (vpCurrentVideoId && vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.seekTo === 'function') {
            try {
                vpIframePlayer.seekTo(limitedTime, true);
            } catch(e) {
                console.error("[Video Preview] seekTo failed:", e);
            }
        }
        setSyncBadge('syncing', '⟳ Đang tua...');
        logSystem(`[Video Preview] Tua tới: <strong>${formatTime(limitedTime)}</strong>`);
    };

    // Set quality — commands the overlay player
    window.vpanelSetQuality = function(quality) {
        sendControlCommand('set_quality', quality);
        logSystem(`[Video Preview] Đặt chất lượng overlay: <strong>${quality}</strong>`);
    };

    // Toggle preview mute (only affects preview iframe, not overlay audio)
    window.vpanelTogglePreviewMute = function() {
        vpPreviewMuted = !vpPreviewMuted;
        if (elMuteBtn) {
            elMuteBtn.innerHTML = vpPreviewMuted
                ? '<i class="fa-solid fa-volume-xmark"></i> Preview muted'
                : '<i class="fa-solid fa-volume-high"></i> Preview audio';
            elMuteBtn.title = vpPreviewMuted
                ? 'Bật âm preview (âm thanh thực vẫn từ Overlay)'
                : 'Tắt âm preview';
        }
        
        // Apply to direct player
        if (vpDirectPlayer) {
            vpDirectPlayer.muted = vpPreviewMuted;
        }
        // Apply to YouTube player API directly
        if (vpIframePlayer && vpIframePlayerReady && typeof vpIframePlayer.mute === 'function') {
            if (vpPreviewMuted) {
                vpIframePlayer.mute();
            } else {
                vpIframePlayer.unMute();
            }
        }
    };

    // Toggle Dashboard fullscreen mode
    window.vpanelToggleFullscreenDash = function() {
        if (!elSection) elSection = document.getElementById('video-preview-section');
        vpIsDashFullscreen = !vpIsDashFullscreen;

        if (vpIsDashFullscreen) {
            elSection.classList.add('vp-fullscreen-dash');
            // Update button icons
            const icons = [elFsDashTop, elFsDashBot];
            icons.forEach(btn => {
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>';
                    btn.title = 'Thu nhỏ';
                    btn.classList.add('active-toggle');
                }
            });
            // Scroll to top so fullscreen is visible
            document.querySelector('.app-content')?.scrollTo({ top: 0 });
        } else {
            elSection.classList.remove('vp-fullscreen-dash');
            const icons = [elFsDashTop, elFsDashBot];
            icons.forEach(btn => {
                if (btn) {
                    btn.innerHTML = btn === elFsDashTop
                        ? '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>'
                        : '<i class="fa-solid fa-expand"></i> Dashboard';
                    btn.title = 'Phóng to toàn Dashboard';
                    btn.classList.remove('active-toggle');
                }
            });
        }
    };

    // Cập nhật bài hát hiện tại từ bên ngoài closure
    window.vpanelUpdateSong = function(song) {
        if (!song || song.type !== 'youtube') {
            if (vpCurrentVideoId) {
                vpCurrentVideoId = null;
                destroyYTPlayer();
                destroyDirectPlayer();
                showEmptyOverlay(true);
                setSyncBadge('no-video', '⬛ Chưa có video');
            }
        } else {
            const newId = song.videoId;
            if (newId !== vpCurrentVideoId) {
                setTimeout(() => {
                    let startAt = 0;
                    if (typeof state !== 'undefined' && state.lastReportedTime !== undefined) {
                        startAt = state.lastReportedTime || 0;
                    }
                    
                    if (!vpVideoEnabled) {
                        destroyYTPlayer();
                        destroyDirectPlayer();
                        vpCurrentVideoId = newId;
                        setSyncBadge('no-video', '⏸ Đã tắt xem video');
                        return;
                    }
                    vpCurrentVideoId = newId;
                    if (!isVideoPanelActive()) {
                        destroyYTPlayer();
                        destroyDirectPlayer();
                        setSyncBadge('no-video', '⏸ Video Mode tạm nghỉ');
                        return;
                    }
                    vpUseDirectStreamFallback = false;
                    directLoadVideoId = null;
                    directLoadFailedAt = 0;
                    showEmptyOverlay(false);
                    setSyncBadge('syncing', '⟳ Đang tải...');
                    initYTPlayerInstance(newId, startAt);
                }, 600);
            } else if (vpVideoEnabled && isVideoPanelActive() && !vpDirectPlayer && (!vpIframePlayer || !vpIframePlayerReady)) {
                resumeVideoPanelFromCurrentState();
            }
        }
    };

    // Cập nhật trạng thái tiến trình từ bên ngoài closure
    window.vpanelUpdateState = function(data) {
        try {
            if (data.isDirectStream !== undefined) {
                vpUseDirectStreamFallback = !!data.isDirectStream;
            }
            vpCurrentTime = data.currentTime || 0;
            vpDuration = data.duration || 0;
            vpIsPlaying = !!data.isPlaying;
            vpIsLive = !!data.isLive || (!vpUseDirectStreamFallback && (!vpDuration || vpDuration <= 0));
            updateTimeDisplay(vpCurrentTime, vpDuration);
            updatePlayIcon(vpIsPlaying);
            
            if (vpCurrentVideoId) {
                if (!vpVideoEnabled) {
                    destroyYTPlayer();
                    destroyDirectPlayer();
                    setSyncBadge('no-video', '⏸ Đã tắt xem video');
                    return;
                }

                if (!isVideoPanelActive()) {
                    suspendPreviewPlayers();
                    return;
                }

                const now = Date.now();
                const latency = data.sentAt ? (now - data.sentAt) : 0;
                const safeLatency = Math.min(Math.max(0, latency), 2000);
                const estimatedAudioTime = vpCurrentTime + (vpIsPlaying ? safeLatency / 1000 : 0);

                if (vpUseDirectStreamFallback) {
                    if (vpIframePlayer || vpIframePlayerReady || playerInitInProgress) {
                        destroyYTPlayer();
                    }
                    if (!vpDirectPlayer) {
                        loadDirectStream(vpCurrentVideoId, estimatedAudioTime);
                    } else {
                        const previewTime = vpDirectPlayer.currentTime;
                        const drift = estimatedAudioTime - previewTime;
                        const isLivePreview = isDirectPreviewLive();
                        
                        if (vpIsPlaying) {
                            if (vpDirectPlayer.paused) {
                                startDirectPreviewPlayback(estimatedAudioTime);
                            }
                            if (!isLivePreview && shouldSeekPreview('direct', drift, 1.5) && !vpDirectPlayer.seeking) {
                                vpDirectPlayer.currentTime = estimatedAudioTime;
                            }
                            setSyncBadge('synced', '✓ Đồng bộ (DirectStream)');
                        } else {
                            if (!vpDirectPlayer.paused) {
                                vpDirectPlayer.pause();
                            }
                            if (!isLivePreview && shouldSeekPreview('direct', drift, 1.5) && !vpDirectPlayer.seeking) {
                                vpDirectPlayer.currentTime = estimatedAudioTime;
                            }
                            setSyncBadge('synced', '⏸ Tạm dừng (DirectStream)');
                        }
                    }
                } else {
                    destroyDirectPlayer();
                    if (!vpIframePlayer || !vpIframePlayerReady) {
                        initYTPlayerInstance(vpCurrentVideoId, estimatedAudioTime);
                    } else {
                        const previewTime = vpIframePlayer.getCurrentTime ? vpIframePlayer.getCurrentTime() : 0;
                        const playerState = vpIframePlayer.getPlayerState ? vpIframePlayer.getPlayerState() : -1;
                        const drift = estimatedAudioTime - previewTime;

                        if (vpIsPlaying) {
                            if (playerState !== YT.PlayerState.PLAYING) {
                                try { vpIframePlayer.playVideo(); } catch(e){}
                            }
                            if (!vpIsLive && shouldSeekPreview('iframe', drift, 1.25)) {
                                try { vpIframePlayer.seekTo(estimatedAudioTime, true); } catch(e){}
                            }
                            setSyncBadge('synced', '✓ Đồng bộ (YT Iframe)');
                        } else {
                            if (playerState !== YT.PlayerState.PAUSED && playerState !== YT.PlayerState.ENDED) {
                                try { vpIframePlayer.pauseVideo(); } catch(e){}
                            }
                            if (!vpIsLive && shouldSeekPreview('iframe', drift, 1.25)) {
                                try { vpIframePlayer.seekTo(estimatedAudioTime, true); } catch(e){}
                            }
                            setSyncBadge('synced', '⏸ Tạm dừng (YT Iframe)');
                        }
                    }
                }
            }
        } catch(e3) {
            console.error("vpanelUpdateState error:", e3);
        }
    };

    // Native browser / Electron fullscreen
    window.vpanelToggleNativeFullscreen = function() {
        // Fullscreen either the direct player wrapper or normal wrapper
        const wrapper = document.getElementById('vpanel-iframe-wrapper');
        if (!wrapper) return;
        if (!document.fullscreenElement) {
            wrapper.requestFullscreen && wrapper.requestFullscreen();
        } else {
            document.exitFullscreen && document.exitFullscreen();
        }
    };

    // Exit dashboard fullscreen on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && vpIsDashFullscreen) {
            window.vpanelToggleFullscreenDash();
        }
    });

})();

