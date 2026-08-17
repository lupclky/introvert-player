// Trình quản lý Nhạc Donate Dứa Corner — Logic Chính (app.js)

// Khởi tạo thời điểm chạy app để chống spam thông báo khi sync lúc bắt đầu
const appStartTime = Date.now();

const PLAYLIST_PRICING_POLICY = Object.freeze({
    version: 2,
    minimumDonationVnd: 500000,
    baseDurationSec: 30 * 60,
    extraDonationStepVnd: 50000,
    extraDurationStepSec: 5 * 60
});

function readStoredPlaylistPricingValue(key, fallback, min, max) {
    if (Number(localStorage.getItem('dua_playlist_pricing_version')) !== PLAYLIST_PRICING_POLICY.version) {
        return fallback;
    }
    const rawValue = localStorage.getItem(key);
    if (rawValue === null || String(rawValue).trim() === '') return fallback;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeDashboardPlaylistPricing(input = {}, acceptSavedValues = true) {
    const source = acceptSavedValues && Number(input.playlistPricingVersion) === PLAYLIST_PRICING_POLICY.version
        ? input
        : {};
    const normalize = (value, fallback, min, max) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, Math.round(parsed)));
    };
    return {
        playlistPricingVersion: PLAYLIST_PRICING_POLICY.version,
        playlistMinimumDonationVnd: normalize(source.playlistMinimumDonationVnd, PLAYLIST_PRICING_POLICY.minimumDonationVnd, 0, 1000000000),
        playlistBaseDurationSec: normalize(source.playlistBaseDurationSec, PLAYLIST_PRICING_POLICY.baseDurationSec, 60, Number.MAX_SAFE_INTEGER),
        playlistExtraDonationStepVnd: normalize(source.playlistExtraDonationStepVnd, PLAYLIST_PRICING_POLICY.extraDonationStepVnd, 1, 1000000000),
        playlistExtraDurationStepSec: normalize(source.playlistExtraDurationStepSec, PLAYLIST_PRICING_POLICY.extraDurationStepSec, 60, Number.MAX_SAFE_INTEGER)
    };
}

// Firebase Web config is public client bootstrap metadata. Keep one shared
// definition so every ZyPage listener uses the same default app.
window.DEFAULT_FIREBASE_CONFIG ||= Object.freeze({
    apiKey: "AAAADrfQcaQ:APA91bFmkJVtZFrN0QRT1BprQolTFljW1Rz0k1uIreUy9TP-5gKVWlD_tRekQLUcuJy8MnD7N0GYgTLu95wqldj3YxlK94h-aLhqXjB1My2-nVaNE8FyH7xShwLzgmjbnsKofNnVV58l",
    authDomain: "cmanga-chat-default-rtdb.firebaseapp.com",
    databaseURL: "https://cmanga-chat-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "cmanga-chat",
    storageBucket: "cmanga-chat.appspot.com",
    messagingSenderId: "663373805842"
});

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

function cleanChannelName(name) {
    if (!name || typeof name !== 'string') return name || '';
    return name.replace(/\s*[\-\–\—]\s*(Topic|Chủ\s*đề)\s*$/gi, '').trim();
}

// Chuẩn hóa timestamp về dạng mili-giây (nếu là giây thì nhân với 1000) để đồng bộ giữa nhạc tự add và nhạc donate
// Tên kênh dùng chung cho Dashboard Player và Queue, đồng bộ với Overlay.
function getDashboardRawChannelName(song) {
    return song?.author || song?.channelTitle || song?.channelName || song?.artist || song?.uploader || song?.channel || '';
}

function isDashboardChannelPlaceholder(name) {
    return /^(youtube|youtube artist|kênh youtube|soundcloud|spotify|zypage player)$/i.test(String(name || '').trim());
}

function getDashboardChannelName(song) {
    if (!song || typeof song !== 'object') return '';
    const rawName = getDashboardRawChannelName(song);
    const channelName = cleanChannelName(String(rawName || ''));
    if (channelName && !isDashboardChannelPlaceholder(channelName)) return channelName;
    // Bài YouTube luôn cần tên kênh thật; không dùng nhãn chủ kênh làm fallback.
    if ((!song.type || song.type === 'youtube') && song.videoId) return 'Kênh YouTube';
    if (song.isOwnerAdd) return 'ZyPage Player';
    return song.type === 'soundcloud' ? 'SoundCloud' : 'Kênh YouTube';
}

function escapeDashboardHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function updateDashboardQueueChannelUI(song) {
    if (!song || song.id === undefined || song.id === null) return;
    document.querySelectorAll('.queue-item[data-song-id], .queue-card-v2[data-song-id]').forEach((item) => {
        if (String(item.dataset.songId) !== String(song.id)) return;
        const queueChannelEl = item.querySelector('.queue-item-channel, .queue-card-v2-channel');
        if (queueChannelEl) {
            queueChannelEl.textContent = getDashboardChannelName(song);
            queueChannelEl.title = queueChannelEl.textContent;
        }
    });
}

function updateDashboardChannelUI(song) {
    const channelEl = document.getElementById('current-song-channel');
    if (channelEl) {
        if (!song) {
            channelEl.textContent = '';
            channelEl.title = '';
            channelEl.style.display = 'none';
        } else {
            channelEl.textContent = getDashboardChannelName(song);
            channelEl.title = channelEl.textContent;
            channelEl.style.display = 'block';
        }
    }

    updateDashboardQueueChannelUI(song);
}

const dashboardChannelFetches = new Map();
const dashboardChannelFetchWatchers = new Set();
function ensureDashboardChannelName(song, forceVerify = false) {
    if (!song || (song.type && song.type !== 'youtube') || !song.videoId) return;
    const existingName = cleanChannelName(String(getDashboardRawChannelName(song) || ''));
    if (!forceVerify && existingName && !isDashboardChannelPlaceholder(existingName)) return;

    const requestedSongId = String(song.id);
    const fetchKey = String(song.videoId);
    const watcherKey = `${fetchKey}:${requestedSongId}`;
    if (dashboardChannelFetchWatchers.has(watcherKey)) return;
    dashboardChannelFetchWatchers.add(watcherKey);

    let fetchPromise = dashboardChannelFetches.get(fetchKey);
    if (!fetchPromise) {
        fetchPromise = fetchSongMetadata('youtube', fetchKey);
        dashboardChannelFetches.set(fetchKey, fetchPromise);
        fetchPromise
            .finally(() => {
                if (dashboardChannelFetches.get(fetchKey) === fetchPromise) {
                    dashboardChannelFetches.delete(fetchKey);
                }
            })
            .catch(() => { });
    }

    // Mỗi bài đăng ký callback riêng ngay cả khi dùng chung một videoId.
    // Callback cũ chỉ được sửa đúng item queue của nó, không được ghi lên Player mới.
    fetchPromise
        .then((metadata) => {
            const author = cleanChannelName(String(metadata?.author || ''));
            if (!author || isDashboardChannelPlaceholder(author)) return;

            const queuedSong = state.queue.find((queued) =>
                String(queued.id) === requestedSongId && String(queued.videoId || '') === fetchKey
            );
            if (queuedSong) {
                queuedSong.author = author;
                queuedSong.channelName = author;
                queuedSong.authorVideoId = fetchKey;
            }

            const isCurrent = state.currentSong &&
                String(state.currentSong.id) === requestedSongId &&
                String(state.currentSong.videoId || '') === fetchKey;
            if (isCurrent) {
                state.currentSong.author = author;
                state.currentSong.channelName = author;
                state.currentSong.authorVideoId = fetchKey;
                state.currentSong = state.currentSong;
                updateDashboardChannelUI(state.currentSong);
            } else if (queuedSong) {
                updateDashboardQueueChannelUI(queuedSong);
            }

            if (queuedSong) saveQueue();

            // Đồng bộ tên kênh mới lấy được sang Overlay nếu bài này đang phát.
            if (isCurrent) {
                const payloadRaw = localStorage.getItem('dua_current_song');
                if (payloadRaw) {
                    try {
                        const payload = JSON.parse(payloadRaw);
                        if (String(payload.id) === requestedSongId && String(payload.videoId || '') === fetchKey) {
                            payload.author = author;
                            payload.channelName = author;
                            localStorage.setItem('dua_current_song', JSON.stringify(payload));
                            publishMqtt('current_song', payload);
                        }
                    } catch (e) { }
                }
            }
        })
        .catch(() => { })
        .finally(() => dashboardChannelFetchWatchers.delete(watcherKey));
}

function normalizeTimestamp(t) {
    if (!t) return Date.now();
    const num = Number(t);
    if (isNaN(num)) return Date.now();
    return (num < 10000000000) ? num * 1000 : num;
}

function normalizeOptionalTimestamp(t) {
    if (t === undefined || t === null || t === '') return 0;
    const num = Number(t);
    if (!Number.isFinite(num)) return 0;
    const normalized = (num < 10000000000) ? num * 1000 : num;
    const earliestSupported = 946684800000; // 2000-01-01
    const latestReasonable = Date.now() + 24 * 60 * 60 * 1000;
    return normalized >= earliestSupported && normalized <= latestReasonable ? normalized : 0;
}

function hasBrokenTextEncoding(value) {
    const text = String(value || '');
    return text.includes('???') || text.includes('\uFFFD');
}

function normalizeZyPageKey(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object' || typeof value === 'function') return '';
    return String(value).trim();
}

function getZyPageSourceKeys(song) {
    if (!song) return [];
    const values = [song.id, song.musicKey];
    if (Array.isArray(song.zypageSourceKeys)) values.push(...song.zypageSourceKeys);
    return [...new Set(values.map(normalizeZyPageKey).filter(Boolean))];
}

function getZyPageMediaKey(song) {
    if (!song) return '';
    if (song.type === 'youtube' && song.videoId) return `youtube:${String(song.videoId).trim()}`;
    if (song.type === 'soundcloud' && song.soundcloudUrl) return `soundcloud:${normalizeSoundcloudUrl(song.soundcloudUrl).toLowerCase()}`;
    return '';
}

function normalizeZyPageDonor(value) {
    return normalizeFancyText(String(value || '')).trim().toLocaleLowerCase('vi-VN');
}

function isSameZyPageTransaction(first, second) {
    if (!first || !second || !first.isZyPage || !second.isZyPage || first.isQuickAdd || second.isQuickAdd) return false;

    const firstKeys = getZyPageSourceKeys(first);
    const secondKeys = new Set(getZyPageSourceKeys(second));
    if (firstKeys.some(key => secondKeys.has(key))) return true;

    const firstMedia = getZyPageMediaKey(first);
    const secondMedia = getZyPageMediaKey(second);
    if (!firstMedia || firstMedia !== secondMedia) return false;
    if (Number(first.amount || 0) !== Number(second.amount || 0)) return false;
    if (normalizeZyPageDonor(first.donorName) !== normalizeZyPageDonor(second.donorName)) return false;

    const firstTransactionTime = normalizeOptionalTimestamp(first.zypageTransactionTime);
    const secondTransactionTime = normalizeOptionalTimestamp(second.zypageTransactionTime);
    if (firstTransactionTime && secondTransactionTime) {
        return Math.abs(firstTransactionTime - secondTransactionTime) <= 2000;
    }

    // Firebase va API thuong ve cach nhau khoang 1,5 giay. Cua so ngan nay
    // du de khoa race condition ma van cho phep mot nguoi order lai cung bai.
    const firstSource = String(first.zypageSource || '');
    const secondSource = String(second.zypageSource || '');
    if (firstSource && secondSource && firstSource === secondSource) return false;
    const firstArrival = Number(first.localAddedAt || first.timestamp || 0);
    const secondArrival = Number(second.localAddedAt || second.timestamp || 0);
    return !!firstArrival && !!secondArrival && Math.abs(firstArrival - secondArrival) <= 15000;
}

function mergeZyPageSourceKeys(target, source) {
    if (!target || !source) return target;
    target.zypageSourceKeys = [...new Set([
        ...getZyPageSourceKeys(target),
        ...getZyPageSourceKeys(source)
    ])];
    if (!target.zypageTransactionTime && source.zypageTransactionTime) {
        target.zypageTransactionTime = source.zypageTransactionTime;
    }
    return target;
}

function findDuplicateZyPageSong(song, queue = state.queue) {
    if (!song || !song.isZyPage || song.isQuickAdd) return null;
    return (queue || []).find(existing => existing !== song && isSameZyPageTransaction(existing, song)) || null;
}

function isZyPageSongEnded(song) {
    const ended = new Set((state.endedKeys || []).map(item => normalizeZyPageKey(item && item.key)));
    return getZyPageSourceKeys(song).some(key => ended.has(key));
}

function markZyPageSongAsEnded(song) {
    getZyPageSourceKeys(song).forEach(markMusicKeyAsEnded);
}

function dedupeZyPageQueue() {
    if (!Array.isArray(state.queue) || state.queue.length < 2) return 0;

    const cleaned = [];
    let removed = 0;
    for (const song of state.queue) {
        const duplicate = findDuplicateZyPageSong(song, cleaned);
        if (!duplicate) {
            cleaned.push(song);
            continue;
        }

        const duplicateIndex = cleaned.indexOf(duplicate);
        const songIsCurrent = state.currentSong && String(state.currentSong.id) === String(song.id);
        if (songIsCurrent) {
            mergeZyPageSourceKeys(song, duplicate);
            cleaned[duplicateIndex] = song;
        } else {
            mergeZyPageSourceKeys(duplicate, song);
        }
        removed++;
    }

    if (removed > 0) state.queue = cleaned;
    return removed;
}

const soundCloudResolvedUrlCache = new Map();

function isShortSoundCloudUrl(url) {
    try {
        return new URL(String(url || '').trim()).hostname.toLowerCase() === 'on.soundcloud.com';
    } catch (e) {
        return /(^|\/\/)on\.soundcloud\.com\//i.test(String(url || ''));
    }
}

// Chuẩn hóa đường dẫn SoundCloud (chuyển m.soundcloud.com sang soundcloud.com và loại bỏ tham số)
function normalizeSoundcloudUrl(url) {
    if (!url) return '';
    let u = String(url).trim().replace(/[\])}>.,!?;:'"]+$/g, '');
    try {
        const parsed = new URL(u);
        if (parsed.hostname.toLowerCase() === 'm.soundcloud.com') {
            parsed.hostname = 'soundcloud.com';
        }
        parsed.search = '';
        parsed.hash = '';
        return parsed.href.replace(/\/$/, '');
    } catch (e) {
        if (u.includes('m.soundcloud.com')) {
            u = u.replace('m.soundcloud.com', 'soundcloud.com');
        }
        return u.split(/[\s?#]/)[0];
    }
}

// Phân giải link SoundCloud rút gọn nếu là link on.soundcloud.com và sau đó chuẩn hóa
async function resolveSoundcloudUrlIfNeeded(url) {
    if (!url) return '';
    const originalUrl = String(url).trim().replace(/[\])}>.,!?;:'"]+$/g, '');
    if (soundCloudResolvedUrlCache.has(originalUrl)) {
        return soundCloudResolvedUrlCache.get(originalUrl);
    }

    let u = originalUrl;
    if (isShortSoundCloudUrl(u)) {
        // Electron main process resolve redirect ổn định hơn fetch từ renderer.
        if (window.electronAPI && typeof window.electronAPI.resolveExternalUrl === 'function') {
            try {
                const result = await window.electronAPI.resolveExternalUrl(u);
                if (result?.success && result.resolvedUrl) u = result.resolvedUrl;
            } catch (e) {
                console.warn('Không thể resolve SoundCloud qua Electron:', e);
            }
        }

        // Fallback cho chế độ chạy bằng trình duyệt/local server.
        if (isShortSoundCloudUrl(u)) {
            try {
                const resolveRes = await fetch(getApiUrl(`/api/resolve?url=${encodeURIComponent(u)}`));
                if (resolveRes.ok) {
                    const resolveData = await resolveRes.json();
                    if (resolveData.resolvedUrl) u = resolveData.resolvedUrl;
                }
            } catch (e) {
                console.warn('Không thể resolve SoundCloud qua local API:', e);
            }
        }

        // SoundCloud oEmbed có thể trả URL track API ngay cả khi endpoint redirect lỗi.
        if (isShortSoundCloudUrl(u)) {
            try {
                const oembedRes = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(originalUrl)}`);
                if (oembedRes.ok) {
                    const oembed = await oembedRes.json();
                    const match = String(oembed?.html || '').match(/[?&]url=([^&"']+)/i);
                    if (match?.[1]) u = decodeURIComponent(match[1]);
                }
            } catch (e) {
                console.warn('Không thể resolve SoundCloud qua oEmbed:', e);
            }
        }

        if (isShortSoundCloudUrl(u)) {
            console.error('Không thể phân giải link SoundCloud rút gọn:', originalUrl);
        }
    }

    const normalizedUrl = normalizeSoundcloudUrl(u);
    if (normalizedUrl) {
        soundCloudResolvedUrlCache.set(originalUrl, normalizedUrl);
    }
    return normalizedUrl;
}

// Mở liên kết ngoài bằng trình duyệt mặc định của hệ thống Windows
function openExternalLink(event, url) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!url || url === '#') return;
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}
window.openExternalLink = openExternalLink;

function getSongMetadataService() {
    return window.songMetadataService
        || (window.songMetadataService = new window.SongMetadataService({
            fetchImpl: fetch.bind(window),
            electronApi: window.electronAPI,
            getApiUrl,
            formatTime,
            cleanChannelName
        }));
}

async function fetchSongMetadata(type, videoId, soundcloudUrl) {
    return getSongMetadataService().get(type, videoId, soundcloudUrl);
}

const dashboardLyricsTimeline = window.LyricsTimelineService
    ? new window.LyricsTimelineService({ beforeCount: 1, afterCount: 1 })
    : null;
let dashboardLyricsRenderKey = '';
let dashboardLyricsRequestKey = '';
let dashboardLyricsActiveIndex = -2;
let dashboardLyricsUserScrolling = false;
let dashboardLyricsResyncTimer = null;
let dashboardLyricsIgnoreScrollUntil = 0;

function toggleDashboardLyricsCollapse(forceState = null) {
    const panel = document.getElementById('dashboard-lyrics');
    if (!panel) return;
    const isCurrentlyCollapsed = panel.classList.contains('is-collapsed');
    const shouldCollapse = forceState !== null ? Boolean(forceState) : !isCurrentlyCollapsed;
    panel.classList.toggle('is-collapsed', shouldCollapse);
    try {
        localStorage.setItem('dua_dashboard_lyrics_collapsed', shouldCollapse ? 'true' : 'false');
    } catch (_) {}
    if (!shouldCollapse && dashboardLyricsActiveIndex >= 0) {
        requestAnimationFrame(() => positionDashboardLyrics(dashboardLyricsActiveIndex, 'instant'));
    }
}

function positionDashboardLyrics(activeIndex, behavior = 'smooth') {
    const panel = document.getElementById('dashboard-lyrics');
    if (panel?.classList.contains('is-collapsed')) return;
    const container = document.getElementById('dashboard-lyrics-lines');
    if (!container) return;
    const targetIndex = Math.max(0, Number(activeIndex) || 0);
    const line = container.querySelector(`[data-lyric-index="${targetIndex}"]`);
    if (!line) return;
    const containerRect = container.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    const lineTopInsideContainer = container.scrollTop + lineRect.top - containerRect.top;
    const top = Math.max(0, lineTopInsideContainer - (container.clientHeight / 2) + (lineRect.height / 2));
    dashboardLyricsIgnoreScrollUntil = Date.now() + (behavior === 'smooth' ? 1000 : 120);
    if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top, behavior });
    } else {
        container.scrollTop = top;
    }
}

function scheduleDashboardLyricsResync() {
    dashboardLyricsUserScrolling = true;
    clearTimeout(dashboardLyricsResyncTimer);
    dashboardLyricsResyncTimer = setTimeout(() => {
        dashboardLyricsUserScrolling = false;
        positionDashboardLyrics(dashboardLyricsActiveIndex, 'smooth');
    }, 2000);
}

function seekToDashboardLyric(time, lyricIndex) {
    if (state.focusMode || isControlsDisabled() || !state.currentSong) return;
    const startPoint = Math.max(0, Number(state.currentSong.start) || 0);
    const requestedTime = Math.max(startPoint, Number(time) || 0);
    const maximumTime = currentOverlayDuration > 0
        ? startPoint + currentOverlayDuration
        : Math.max(startPoint, Number(state.currentSong.duration) || requestedTime);
    const targetTime = Math.min(requestedTime, maximumTime || requestedTime);

    dashboardPendingSeekTarget = targetTime;
    dashboardSeekUiLockUntil = Date.now() + 5000;
    state.lastReportedTime = targetTime;
    dashboardLyricsUserScrolling = false;
    clearTimeout(dashboardLyricsResyncTimer);

    const success = attemptGlobalAction('seek', () => {
        sendControlCommand('seek', targetTime);
        logSystem(`Tua theo lời bài hát tới: ${formatTime(targetTime)}`);
    });
    if (!success) {
        dashboardPendingSeekTarget = null;
        dashboardSeekUiLockUntil = 0;
        return;
    }

    dashboardLyricsActiveIndex = lyricIndex;
    const container = document.getElementById('dashboard-lyrics-lines');
    const previousLine = container?.querySelector('.dashboard-lyric-line.is-active');
    previousLine?.classList.remove('is-active');
    previousLine?.removeAttribute('aria-current');
    const activeLine = container?.querySelector(`[data-lyric-index="${lyricIndex}"]`);
    activeLine?.classList.add('is-active');
    activeLine?.setAttribute('aria-current', 'true');
    requestAnimationFrame(() => positionDashboardLyrics(lyricIndex, 'smooth'));
}

function ensureDashboardLyricsInteractions(container) {
    if (!container || container.dataset.lyricsInteractionsBound === 'true') return;
    container.dataset.lyricsInteractionsBound = 'true';
    container.addEventListener('wheel', scheduleDashboardLyricsResync, { passive: true });
    container.addEventListener('touchstart', scheduleDashboardLyricsResync, { passive: true });
    container.addEventListener('scroll', () => {
        if (Date.now() > dashboardLyricsIgnoreScrollUntil) scheduleDashboardLyricsResync();
    }, { passive: true });
    container.addEventListener('keydown', (event) => {
        if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            scheduleDashboardLyricsResync();
        }
    });
    container.addEventListener('pointerdown', (event) => {
        if (event.target === container) scheduleDashboardLyricsResync();
    });
    container.addEventListener('click', (event) => {
        const line = event.target.closest('.dashboard-lyric-line[data-lyric-time]');
        if (!line || !container.contains(line)) return;
        seekToDashboardLyric(Number(line.dataset.lyricTime), Number(line.dataset.lyricIndex));
    });
}

function clearDashboardLyrics() {
    const panel = document.getElementById('dashboard-lyrics');
    const lines = document.getElementById('dashboard-lyrics-lines');
    if (panel) panel.hidden = true;
    if (lines) lines.replaceChildren();
    clearTimeout(dashboardLyricsResyncTimer);
    dashboardLyricsUserScrolling = false;
    dashboardLyricsIgnoreScrollUntil = 0;
    dashboardLyricsActiveIndex = -2;
    dashboardLyricsRenderKey = '';
}

function updateDashboardLyrics(lyrics, currentTime = 0) {
    const panel = document.getElementById('dashboard-lyrics');
    const container = document.getElementById('dashboard-lyrics-lines');
    const source = document.getElementById('dashboard-lyrics-source');
    if (localStorage.getItem('dua_lyrics_enabled') === 'false' || !panel || !container || !dashboardLyricsTimeline || !lyrics?.available || !Array.isArray(lyrics.lines) || !lyrics.lines.length) {
        clearDashboardLyrics();
        return;
    }

    const isSynced = lyrics.synced !== false;
    const normalizedLines = isSynced
        ? dashboardLyricsTimeline.normalizeLines(lyrics.lines)
        : lyrics.lines.map(line => ({ time: 0, text: String(line?.text || '').trim() })).filter(line => line.text);
    const activeIndex = isSynced ? dashboardLyricsTimeline.findActiveIndex(normalizedLines, currentTime) : -1;
    const firstLine = normalizedLines[0];
    const lastLine = normalizedLines[normalizedLines.length - 1];
    const renderKey = `${state.currentSong?.id || ''}:${isSynced ? 'synced' : 'plain'}:${normalizedLines.length}:${firstLine?.time || 0}:${lastLine?.time || 0}`;
    panel.hidden = false;
    try {
        if (localStorage.getItem('dua_dashboard_lyrics_collapsed') === 'true') {
            panel.classList.add('is-collapsed');
        }
    } catch (_) {}
    if (source) source.textContent = `${lyrics.source || 'LRCLIB'}${isSynced ? '' : ' · Không đồng bộ'}`;
    container.classList.toggle('is-unsynced', !isSynced);
    if (isSynced) ensureDashboardLyricsInteractions(container);
    if (renderKey !== dashboardLyricsRenderKey) {
        dashboardLyricsRenderKey = renderKey;
        dashboardLyricsActiveIndex = -2;
        dashboardLyricsUserScrolling = false;
        clearTimeout(dashboardLyricsResyncTimer);
        container.replaceChildren(...normalizedLines.map((line, index) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.className = 'dashboard-lyric-line';
            element.dataset.lyricIndex = String(index);
            element.dataset.lyricTime = String(line.time);
            element.disabled = !isSynced;
            element.title = !isSynced ? '' : (line.isWaitingDots ? 'Đang chờ...' : `Tua tới ${formatTime(line.time)}`);
            if (isSynced && !line.isWaitingDots) {
                element.setAttribute('aria-label', `${line.text}. Tua tới ${formatTime(line.time)}`);
            }

            if (line.isWaitingDots) {
                const dots = document.createElement('div');
                dots.className = 'dashboard-instrumental-dots is-countdown';
                for (let i = 0; i < 3; i++) {
                    const dot = document.createElement('span');
                    dot.className = 'dashboard-instrumental-dot';
                    dots.appendChild(dot);
                }
                element.appendChild(dots);
            } else if (line.originalText) {
                const textSpan = document.createElement('span');
                textSpan.className = 'dashboard-lyric-text';
                textSpan.textContent = line.text;

                const originalSpan = document.createElement('span');
                originalSpan.className = 'dashboard-lyric-original-text';
                originalSpan.textContent = line.originalText;

                element.appendChild(textSpan);
                element.appendChild(originalSpan);
            } else {
                element.textContent = line.text;
            }
            return element;
        }));
        container.scrollTop = 0;
    }

    if (!isSynced) {
        dashboardLyricsActiveIndex = -1;
        return;
    }

    if (activeIndex >= 0 && normalizedLines[activeIndex]?.isWaitingDots) {
        const activeLine = container.querySelector(`[data-lyric-index="${activeIndex}"]`);
        if (activeLine) {
            const dots = activeLine.querySelectorAll('.dashboard-instrumental-dot');
            const startTime = normalizedLines[activeIndex].time;
            const endTime = normalizedLines[activeIndex + 1]?.time ?? (startTime + 3);
            dots.forEach((dot, index) => {
                if (currentTime >= endTime - 3 + index) dot.classList.add('is-lit');
                else dot.classList.remove('is-lit');
            });
        }
    }

    if (activeIndex === dashboardLyricsActiveIndex) return;
    const previousLine = container.querySelector('.dashboard-lyric-line.is-active');
    if (previousLine) {
        previousLine.classList.remove('is-active');
        previousLine.removeAttribute('aria-current');
    }
    const activeLine = container.querySelector(`[data-lyric-index="${Math.max(0, activeIndex)}"]`);
    if (activeIndex >= 0 && activeLine) {
        activeLine.classList.add('is-active');
        activeLine.setAttribute('aria-current', 'true');
    }
    const immediate = dashboardLyricsActiveIndex === -2;
    dashboardLyricsActiveIndex = activeIndex;
    if (!dashboardLyricsUserScrolling) {
        requestAnimationFrame(() => positionDashboardLyrics(activeIndex, immediate ? 'auto' : 'smooth'));
    }
}

async function loadSyncedLyricsForSong(song) {
    if (localStorage.getItem('dua_lyrics_enabled') === 'false') {
        clearDashboardLyrics();
        const lyricsIconEl = document.getElementById('current-song-lyrics-icon');
        if (lyricsIconEl) lyricsIconEl.style.display = 'none';
        return;
    }
    if (!song || typeof window.electronAPI?.getSyncedLyrics !== 'function') {
        clearDashboardLyrics();
        return;
    }
    const songId = String(song.id ?? '');
    const videoId = String(song.videoId || '');
    const requestKey = `${songId}:${videoId}:${Date.now()}`;
    dashboardLyricsRequestKey = requestKey;
    try {
        const result = await window.electronAPI.getSyncedLyrics({
            id: song.id,
            type: song.type || 'youtube',
            videoId: song.videoId || null,
            title: song.title || '',
            author: song.rawAuthor || song.author || song.channelName || '',
            rawAuthor: song.rawAuthor || '',
            channelName: song.channelName || song.author || '',
            albumName: song.albumName || song.album || '',
            duration: Math.max(0, Number(song.duration) || 0),
            sourceUrl: song.sourceUrl || song.songLink || song.url || ''
        });
        if (dashboardLyricsRequestKey !== requestKey
            || String(state.currentSong?.id ?? '') !== songId
            || String(state.currentSong?.videoId || '') !== videoId) return;

        const lyricsState = result?.available && Array.isArray(result.lines) && result.lines.length
            ? { ...result, resolved: true }
            : {
                available: false,
                resolved: true,
                eligible: Boolean(result?.eligible),
                reason: String(result?.reason || 'not_found'),
                lines: []
            };
        song.lyrics = lyricsState;
        const queuedSong = state.queue.find(item => String(item.id) === songId);
        if (queuedSong) queuedSong.lyrics = lyricsState;
        if (state.currentSong && String(state.currentSong.id) === songId) {
            state.currentSong.lyrics = lyricsState;
            state.currentSong = state.currentSong;
        }
        updateDashboardLyrics(lyricsState, state.lastReportedTime || 0);
        const lyricsIconEl = document.getElementById('btn-toggle-lyrics-visibility');
        if (lyricsIconEl) {
            lyricsIconEl.style.display = Boolean(lyricsState.available && lyricsState.lines?.length) ? 'inline-flex' : 'none';
            const isEnabled = localStorage.getItem('dua_lyrics_enabled') !== 'false';
            if (isEnabled) {
                lyricsIconEl.classList.add('dua-btn-primary');
                lyricsIconEl.classList.remove('dua-btn-secondary');
            } else {
                lyricsIconEl.classList.add('dua-btn-secondary');
                lyricsIconEl.classList.remove('dua-btn-primary');
            }
        }

        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            const payload = JSON.parse(payloadRaw);
            if (String(payload.id ?? '') === songId) {
                payload.lyrics = lyricsState.available
                    ? {
                        available: true, resolved: true, eligible: true, synced: lyricsState.synced !== false,
                        source: lyricsState.source || 'LRCLIB',
                        romanized: Boolean(lyricsState.romanized),
                        trackName: lyricsState.trackName || song.title || '',
                        artistName: lyricsState.artistName || song.author || song.channelName || '',
                        lines: lyricsState.lines
                    }
                    : {
                        available: false, resolved: true, eligible: lyricsState.eligible,
                        reason: lyricsState.reason, lines: []
                    };
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                publishMqtt('current_song', payload);
            }
        }
    } catch (error) {
        if (dashboardLyricsRequestKey === requestKey) clearDashboardLyrics();
        console.warn('[Lyrics] Không thể hiển thị lời đồng bộ:', error?.message || error);
    }
}


// --- BIẾN TOÀN CỤC & CẤU HÌNH ---
let isPlayerApiReady = false;
let lastPlayedVideoId = null;
let playSongRequestSequence = 0;
let searchTimeout = null;

function normalizeDashboardVolume(value, fallback = 80) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function loadDashboardVolume() {
    const storedValue = localStorage.getItem('dua_volume');
    if (storedValue === null || storedValue === '') return 80;

    const storedVolume = normalizeDashboardVolume(storedValue, null);
    if (storedVolume === null) return 80;
    if (storedVolume > 0 || localStorage.getItem('dua_explicitly_muted') === 'true') {
        return storedVolume;
    }

    // Older builds stored a transient player mute as the permanent base volume.
    // Recover the last audible level once unless the user explicitly muted.
    const previousAudibleVolume = normalizeDashboardVolume(
        localStorage.getItem('dua_pre_mute_volume'),
        80
    );
    const recoveredVolume = previousAudibleVolume > 0 ? previousAudibleVolume : 80;
    localStorage.setItem('dua_volume', String(recoveredVolume));
    return recoveredVolume;
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
    volume: loadDashboardVolume(),
    maxDurationEnabled: localStorage.getItem('dua_max_duration_enabled') === 'true',
    hideEmptyOverlay: localStorage.getItem('dua_hide_empty_overlay') === 'true',
    showOverlayLyrics: localStorage.getItem('dua_show_overlay_lyrics') !== 'false',
    showIdlePriceTable: localStorage.getItem('dua_show_idle_price_table') !== 'false',
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
    lastHandledZyPageEndSignature: '',
    lastHandledZyPageEndAt: 0,
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
    processedDonationKeys: (() => {
        try {
            const raw = localStorage.getItem('dua_processed_donation_keys');
            const parsed = raw ? JSON.parse(raw) : [];
            const now = Date.now();
            return parsed.map(item => typeof item === 'string' ? { key: item, timestamp: now } : item)
                .filter(item => item && item.key && now - Number(item.timestamp || 0) < 7 * 24 * 60 * 60 * 1000);
        } catch (e) {
            return [];
        }
    })(),
    lastSyncedDonateTime: Number(localStorage.getItem('dua_last_synced_donate_time')) || 0,
    favorites: (() => {
        try {
            const raw = localStorage.getItem('dua_favorites');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    })(),

    // Cấu hình đồng bộ realtime Dashboard ↔ Overlay
    localSyncKey: localStorage.getItem('dua_local_sync_key') || '',

    theme: ['pineapple', 'enchanted-wild', 'cutepink'].includes(localStorage.getItem('dua_theme'))
        ? localStorage.getItem('dua_theme')
        : 'enchanted-wild',
    opacity: localStorage.getItem('dua_opacity') || '100',
    emptyQueueMessage: localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k',
    alertActionText: localStorage.getItem('dua_alert_action_text') || 'gửi một quả dứa',
    focusModeMessage: localStorage.getItem('dua_focus_mode_message') || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng',
    sensitiveVideosUrl: localStorage.getItem('dua_sensitive_videos_url') || 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json',

    extensionEnabled: localStorage.getItem('dua_extension_enabled') === 'true',
    extensionPrice: parseInt(localStorage.getItem('dua_extension_price')) || 50000,
    extensionMinutes: parseInt(localStorage.getItem('dua_extension_minutes')) || 6,
    voteSkipDefaultAmount: parseInt(localStorage.getItem('dua_vote_skip_default_amount')) || 20000,

    // Donate mở YouTube Playlist
    playlistSettings: {
        playlistEnabled: true,
        playlistPricingVersion: PLAYLIST_PRICING_POLICY.version,
        playlistMinimumDonationVnd: readStoredPlaylistPricingValue('dua_playlist_minimum_vnd', PLAYLIST_PRICING_POLICY.minimumDonationVnd, 0, 1000000000),
        playlistBaseDurationSec: readStoredPlaylistPricingValue('dua_playlist_base_duration_sec', PLAYLIST_PRICING_POLICY.baseDurationSec, 60, Number.MAX_SAFE_INTEGER),
        playlistExtraDonationStepVnd: readStoredPlaylistPricingValue('dua_playlist_extra_step_vnd', PLAYLIST_PRICING_POLICY.extraDonationStepVnd, 1, 1000000000),
        playlistExtraDurationStepSec: readStoredPlaylistPricingValue('dua_playlist_extra_duration_sec', PLAYLIST_PRICING_POLICY.extraDurationStepSec, 60, Number.MAX_SAFE_INTEGER),
        playlistMaximumDurationSec: readStoredPlaylistPricingValue('dua_playlist_base_duration_sec', PLAYLIST_PRICING_POLICY.baseDurationSec, 60, Number.MAX_SAFE_INTEGER),
        playlistMaximumItemsToResolve: parseInt(localStorage.getItem('dua_playlist_max_items')) || 50,
        playlistAutoAccept: localStorage.getItem('dua_playlist_auto_accept') !== 'false',
        playlistContinuousPlayback: localStorage.getItem('dua_playlist_continuous') !== 'false',
        playlistDeduplicateTracks: localStorage.getItem('dua_playlist_dedupe') !== 'false'
    },
    expandedPlaylistIds: new Set(),
    activePlaylistSnapshot: null,
    playlistProgressLastSentAt: 0,

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
    currentSongPlaybackConfirmed: false,
    automatedSkipBlockedUntil: 0,
    ignoreLegacyEndedUntil: 0,
    pendingOverlayReset: !sessionStorage.getItem('dua_app_initialized'),
    lastReportedTime: 0,
    luckyMode: localStorage.getItem('dua_lucky_mode') === 'true',
    isLuckyRolling: false,
    luckyTimeout: null,
    luckyNextSong: null,
    pausePlayBypass: localStorage.getItem('dua_pause_play_bypass') === 'true',

    // Các biến trạng thái hỗ trợ điều chỉnh và học hỏi Adaptive Volume
    adaptiveActive: false,
    adaptiveLoudnessDb: null,
    adaptiveOrigVolume: 80,
    adaptiveAdjustedVolume: null
};

// Persist the normalized theme so settings and overlay stay in sync.
localStorage.setItem('dua_theme', state.theme);
localStorage.removeItem('dua_test_mode');

function isControlsDisabled() {
    return false; // Bỏ hoàn toàn chặn điều khiển khi bài đợi lâu phát
}


// Lấy bài chờ đầu tiên theo đúng thứ tự hàng đợi đang hiển thị.
// Hàm này luôn đọc state.queue tại thời điểm gọi, không lưu sẵn ứng viên.
function getFirstPendingSong() {
    if (!Array.isArray(state.queue) || state.queue.length === 0) return null;
    const currentId = state.currentSong ? String(state.currentSong.id) : null;
    return state.queue.find(song => song && String(song.id) !== currentId) || null;
}

// --- LẤY BÀI HÁT TIẾP THEO (HỖ TRỢ LUCKY MODE) ---
function getNextSong() {
    const playlistNextSong = window.PlaylistQueueService?.getNextSong
        ? window.PlaylistQueueService.getNextSong(state.queue, state.currentSong)
        : null;
    if (state.currentSong?.playlistRequestId && playlistNextSong?.playlistRequestId === state.currentSong.playlistRequestId) {
        return playlistNextSong;
    }

    const firstPendingSong = getFirstPendingSong();
    if (!firstPendingSong) return null;

    const currentId = state.currentSong ? String(state.currentSong.id) : null;

    // Vote Skip luôn bám theo vị trí đầu tiên của hàng đợi hiện tại. Nhánh này
    // cũng khiến dữ liệu "bài tiếp theo" trên overlay cập nhật đúng khi hàng đợi đổi.
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
    return firstPendingSong;
}

function updateNextSongInCurrentPayload(nextSongOverride) {
    if (!state.currentSong) return;
    const nextSong = arguments.length > 0 ? nextSongOverride : getNextSong();
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
        payload.nextSongPlaylistRequestId = nextSong ? (nextSong.playlistRequestId || null) : null;
        payload.nextSongPlaylistPosition = nextSong ? (nextSong.playlistPosition || null) : null;
        payload.nextSongPlaylistTotalTracks = nextSong ? (nextSong.playlistTotalTracks || null) : null;
        payload.nextSongPlaylistTitle = nextSong ? (nextSong.playlistTitle || null) : null;
        payload.nextSongDuration = nextSong ? nextSong.duration : null;
        payload.nextSongStart = nextSong ? nextSong.start : null;
        payload.nextSongEnd = nextSong ? nextSong.end : null;
        payload.luckyMode = state.luckyMode || false;
        // Payload có thể được phát lại chỉ vì queue thay đổi (ví dụ thêm nhanh
        // từ Lịch sử). Luôn ghi volume hiện tại để không gửi lại mức 0 đã cũ.
        payload.volume = Math.max(0, Math.min(100, Number.isFinite(Number(state.volume)) ? Math.round(Number(state.volume)) : 80));
        if (state.bypassCurrentSongDuration) {
            payload.maxDuration = 0;
        }
        localStorage.setItem('dua_current_song', JSON.stringify(payload));
        publishMqtt('current_song', payload);
    } catch (e) {
        console.error("Lỗi cập nhật thông tin bài tiếp theo trong payload:", e);
    }
}

sessionStorage.setItem('dua_app_initialized', 'true');

// Tự động sinh khóa đồng bộ cục bộ nếu chưa có
if (!state.localSyncKey) {
    const randomPart = window.crypto?.getRandomValues
        ? Array.from(window.crypto.getRandomValues(new Uint32Array(4))).map(value => value.toString(36)).join('')
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    state.localSyncKey = 'dua_' + randomPart;
    localStorage.setItem('dua_local_sync_key', state.localSyncKey);
}

const REALTIME_RECONNECT_DELAY_MS = 500;
const OVERLAY_PROGRESS_SYNC_INTERVAL_MS = 500;
const dashboardRealtimeService = new window.DashboardRealtimeService({
    getChannelId: () => state.localSyncKey,
    onMessage: data => handleMqttMessage(null, data),
    getEventId: type => window.makeEventId?.(type),
    reconnectDelayMs: REALTIME_RECONNECT_DELAY_MS
});

function initDashboardRealtimeListener() {
    dashboardRealtimeService.connect();
}

function publishRealtimeTransport(message) {
    return dashboardRealtimeService.publish(message);
}

// Cấu hình thể loại SponsorBlock cần bỏ qua
const defaultSponsorBlockCategories = {
    sponsor: true,
    intro: true,
    outro: true,
    selfpromo: true,
    interaction: false,
    offtopic: true
};

function loadSponsorBlockCategorySettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('dua_sb_categories') || '{}');
        return saved && typeof saved === 'object' ? saved : {};
    } catch {
        return {};
    }
}

const sponsorBlockCategories = {
    ...defaultSponsorBlockCategories,
    ...loadSponsorBlockCategorySettings()
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

function buildTimeLimitConfig() {
    const milestones = (Array.isArray(state.milestones) ? state.milestones : [])
        .map(item => ({
            amount: Math.max(0, Number(item?.amount) || 0),
            durationMinutes: Math.max(0, Number(item?.duration) || 0)
        }))
        .filter(item => item.amount > 0 && item.durationMinutes > 0)
        .sort((a, b) => a.amount - b.amount);

    return {
        version: 1,
        enabled: Boolean(state.maxDurationEnabled),
        showIdlePriceTable: state.showIdlePriceTable !== false,
        mode: state.limitMode === 'milestone' ? 'milestone' : 'fixed',
        fixedDurationSeconds: Math.max(0, Number(state.maxDuration) || 0),
        milestones,
        defaultDurationMinutes: Math.max(0, Number(state.defaultDuration) || 0)
    };
}

// Đồng bộ giới hạn thời gian phát và bảng mốc sang Overlay.
// Overlay cũ vẫn tương thích vì tiếp tục đọc trường value như trước.
function syncMaxDurationToOverlay(val) {
    localStorage.setItem('dua_max_duration', val);
    publishMqtt('max_duration', {
        value: val,
        config: buildTimeLimitConfig()
    });
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
                publishMqtt('current_song', payload);
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
                publishMqtt('current_song', payload);
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

// =========================================================================
// DONATE MỞ YOUTUBE PLAYLIST — renderer orchestration
// =========================================================================

function getPlaylistSettings() {
    return { ...state.playlistSettings };
}

function getPlaylistBlacklistVideoIds() {
    return getSensitiveVideoConfigService().getVideoIds();
}

function setPlaylistProcessingStatus(text, tone = 'loading') {
    const element = document.getElementById('playlist-processing-status');
    if (!element) return;
    if (!text) {
        element.hidden = true;
        element.textContent = '';
        element.dataset.tone = '';
        return;
    }
    element.hidden = false;
    element.dataset.tone = tone;
    const indicator = tone === 'loading'
        ? '<svg class="m3-spinner playlist-status-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg>'
        : '<span class="playlist-status-dot" aria-hidden="true"></span>';
    element.innerHTML = `${indicator}<span>${escapeDashboardHtml(text)}</span>`;
}

function initializePlaylistSettingsUI() {
    const settings = state.playlistSettings;
    const values = {
        'playlist-minimum-input': settings.playlistMinimumDonationVnd,
        'playlist-duration-input': Math.max(1, Math.round(Number(settings.playlistBaseDurationSec || PLAYLIST_PRICING_POLICY.baseDurationSec) / 60)),
        'playlist-extra-amount-input': settings.playlistExtraDonationStepVnd,
        'playlist-extra-duration-input': Math.max(1, Math.round(Number(settings.playlistExtraDurationStepSec || PLAYLIST_PRICING_POLICY.extraDurationStepSec) / 60))
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (!element) return;
        if (element.type === 'checkbox') element.checked = Boolean(value);
        else element.value = value;
    });
    const pricingNote = document.getElementById('playlist-pricing-note');
    if (pricingNote) {
        pricingNote.textContent = `Từ ${Number(settings.playlistMinimumDonationVnd || 0).toLocaleString('vi-VN')} VNĐ được phát ${Math.round(Number(settings.playlistBaseDurationSec || 0) / 60).toLocaleString('vi-VN')} phút; mỗi ${Number(settings.playlistExtraDonationStepVnd || 0).toLocaleString('vi-VN')} VNĐ dư thêm ${Math.round(Number(settings.playlistExtraDurationStepSec || 0) / 60).toLocaleString('vi-VN')} phút.`;
    }
}

function savePlaylistSettings() {
    const numberValue = (id, fallback, min, max) => {
        const element = document.getElementById(id);
        const value = Number(element?.value);
        return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
    };
    const pricing = normalizeDashboardPlaylistPricing({
        playlistPricingVersion: PLAYLIST_PRICING_POLICY.version,
        playlistMinimumDonationVnd: numberValue('playlist-minimum-input', PLAYLIST_PRICING_POLICY.minimumDonationVnd, 0, 1000000000),
        playlistBaseDurationSec: numberValue('playlist-duration-input', PLAYLIST_PRICING_POLICY.baseDurationSec / 60, 1, 525600) * 60,
        playlistExtraDonationStepVnd: numberValue('playlist-extra-amount-input', PLAYLIST_PRICING_POLICY.extraDonationStepVnd, 1, 1000000000),
        playlistExtraDurationStepSec: numberValue('playlist-extra-duration-input', PLAYLIST_PRICING_POLICY.extraDurationStepSec / 60, 1, 525600) * 60
    });
    state.playlistSettings = {
        ...state.playlistSettings,
        playlistEnabled: true,
        ...pricing,
        playlistMaximumDurationSec: pricing.playlistBaseDurationSec,
        playlistMaximumItemsToResolve: 50,
        playlistAutoAccept: true,
        playlistContinuousPlayback: true,
        playlistDeduplicateTracks: true
    };

    const storageMap = {
        dua_playlist_enabled: state.playlistSettings.playlistEnabled,
        dua_playlist_pricing_version: state.playlistSettings.playlistPricingVersion,
        dua_playlist_minimum_vnd: state.playlistSettings.playlistMinimumDonationVnd,
        dua_playlist_base_duration_sec: state.playlistSettings.playlistBaseDurationSec,
        dua_playlist_extra_step_vnd: state.playlistSettings.playlistExtraDonationStepVnd,
        dua_playlist_extra_duration_sec: state.playlistSettings.playlistExtraDurationStepSec,
        dua_playlist_max_duration_sec: state.playlistSettings.playlistMaximumDurationSec,
        dua_playlist_max_items: state.playlistSettings.playlistMaximumItemsToResolve,
        dua_playlist_auto_accept: state.playlistSettings.playlistAutoAccept,
        dua_playlist_continuous: state.playlistSettings.playlistContinuousPlayback,
        dua_playlist_dedupe: state.playlistSettings.playlistDeduplicateTracks
    };
    Object.entries(storageMap).forEach(([key, value]) => localStorage.setItem(key, String(value)));
    localStorage.removeItem('dua_minimum_view_count');
    initializePlaylistSettingsUI();
    const urlInput = document.getElementById('zypage-url');
    saveConfigToAppData(urlInput ? urlInput.value.trim() : '', state.zypageShopId);
    publishRealtimeSnapshot();
    showDashboardSystemAlert('Cài đặt Playlist', 'Đã lưu cấu hình nhận YouTube Playlist.');
}
window.savePlaylistSettings = savePlaylistSettings;

function makePlaylistQueueSongs(request) {
    if (!window.PlaylistQueueService) return [];
    return window.PlaylistQueueService.songsFromRequest(request);
}

async function enqueuePlaylistRequest(request, options = {}) {
    if (!request || !['ready', 'queued', 'playing', 'paused'].includes(request.status)) return [];
    const songs = makePlaylistQueueSongs(request);
    const existingIds = new Set(state.queue.map(song => String(song.id)));
    const added = songs.filter(song => !existingIds.has(String(song.id)));
    if (added.length === 0) return [];

    // Playlist là một khối. Chèn cả khối vào cuối queue để không bị tách bởi thuật toán bài đơn.
    markQueueSongsAsNew(added);
    state.queue.push(...added);
    saveQueue();
    renderQueue();
    updateNextSongInCurrentPayload();
    if (window.electronAPI?.markPlaylistQueued && request.status === 'ready') {
        await window.electronAPI.markPlaylistQueued(request.id);
    }
    if (!options.silent) {
        logSystem(`Đã thêm playlist <strong>${request.title}</strong> (${added.length} video, ${formatTime(request.totalDurationSec)}) vào hàng đợi.`, 'queue');
    }
    if (!state.currentSong && !state.focusMode) playNextInQueue();
    return added;
}

async function processPlaylistDonationIfPresent(donation) {
    if (!window.electronAPI?.processPlaylistDonation || !donation?.id) return { matched: false };
    try {
        const result = await window.electronAPI.processPlaylistDonation(
            donation,
            getPlaylistSettings(),
            getPlaylistBlacklistVideoIds()
        );
        if (!result?.matched) return { matched: false };
        // Giữ metadata playlist trên chính lượt donate để mọi kênh thông báo
        // (Dashboard, taskbar và Overlay) cùng nhận diện một kiểu dữ liệu.
        donation.isPlaylistDonation = true;
        donation.playlistRequestId = result.request?.id || result.playlistRequestId || '';
        donation.playlistTitle = result.request?.title || 'YouTube Playlist';
        donation.playlistTotalTracks = Number(
            result.request?.acceptedItemCount
            || result.request?.tracks?.filter(track => !track.skipReason).length
            || 0
        );
        donation.playlistThumbnail = result.request?.thumbnailUrl || '';
        if (result.request?.status === 'ready' || result.request?.status === 'queued') {
            await enqueuePlaylistRequest(result.request, { silent: Boolean(result.idempotent) });
        }
        await renderPendingPlaylistReviews();
        return result;
    } catch (error) {
        console.error('Playlist donation processing failed:', error);
        setPlaylistProcessingStatus(`Không thể kiểm tra playlist: ${error.message}`, 'error');
        return { matched: true, error: error.message };
    }
}

async function restorePlaylistQueueFromDatabase() {
    if (!window.electronAPI?.getActivePlaylists) return;
    try {
        const requests = await window.electronAPI.getActivePlaylists();
        for (const request of requests || []) await enqueuePlaylistRequest(request, { silent: true });
        await renderPendingPlaylistReviews();
    } catch (error) {
        console.error('Không thể khôi phục playlist:', error);
    }
}

function playlistReasonText(request) {
    if (request.rejectionReason === 'insufficient_amount') {
        return `${Number(request.donationAmount || 0).toLocaleString('vi-VN')}đ / ${state.playlistSettings.playlistMinimumDonationVnd.toLocaleString('vi-VN')}đ tối thiểu`;
    }
    return request.rejectionText || 'Cần streamer kiểm tra trước khi đưa vào hàng đợi.';
}

function playlistIssueSummary(request) {
    const labels = {
        private: 'riêng tư', deleted: 'đã xóa', unavailable: 'không khả dụng',
        livestream: 'livestream', upcoming: 'sắp phát', duplicate: 'trùng',
        blacklisted: 'bị chặn', unknown_duration: 'chưa rõ thời lượng', duration_limit: 'vượt thời lượng',
        below_minimum_views: 'dưới mốc view', unknown_view_count: 'chưa rõ lượt xem'
    };
    const counts = new Map();
    for (const track of request.tracks || []) {
        if (!track.skipReason) continue;
        counts.set(track.skipReason, (counts.get(track.skipReason) || 0) + 1);
    }
    return [...counts.entries()].map(([reason, count]) => `${count} ${labels[reason] || reason}`).join(' · ');
}

async function renderPendingPlaylistReviews() {
    const panel = document.getElementById('playlist-review-panel');
    if (!panel || !window.electronAPI?.getPendingPlaylists) return;
    const requests = await window.electronAPI.getPendingPlaylists();
    if (!requests?.length) {
        panel.hidden = true;
        panel.innerHTML = '';
        return;
    }
    panel.hidden = false;
    panel.innerHTML = `<div class="playlist-review-heading"><span>Cần xử lý</span><b>${requests.length}</b></div>` + requests.map(request => `
        <article class="playlist-review-card" data-playlist-request-id="${escapeDashboardHtml(request.id)}">
            <div class="playlist-review-main">
                <div><strong>${escapeDashboardHtml(request.donorName)}</strong><span>${Number(request.donationAmount || 0).toLocaleString('vi-VN')}đ</span></div>
                <p>${escapeDashboardHtml(request.title || 'Yêu cầu YouTube Playlist')}</p>
                <small>${escapeDashboardHtml(playlistReasonText(request))}</small>
                ${playlistIssueSummary(request) ? `<small class="playlist-review-issues">${escapeDashboardHtml(playlistIssueSummary(request))}</small>` : ''}
                <input class="dua-input playlist-review-url" id="playlist-override-${escapeDashboardHtml(request.id)}"
                    type="url" placeholder="Dán URL playlist khác nếu cần ghi đè">
            </div>
            <div class="playlist-review-actions">
                <button class="dua-btn" onclick="acceptPendingPlaylist('${request.id}')">Chấp nhận</button>
                <button class="dua-btn" onclick="convertPendingPlaylistToSingle('${request.id}')">Lấy bài đầu</button>
                <button class="dua-btn dua-btn-danger" onclick="rejectPendingPlaylist('${request.id}')">Từ chối</button>
            </div>
        </article>
    `).join('');
}

async function acceptPendingPlaylist(requestId) {
    setPlaylistProcessingStatus('Đang kiểm tra playlist…');
    try {
        const overrideUrl = document.getElementById(`playlist-override-${requestId}`)?.value?.trim() || '';
        const request = await window.electronAPI.acceptPlaylist(requestId, getPlaylistSettings(), getPlaylistBlacklistVideoIds(), overrideUrl);
        if (request?.status === 'ready') await enqueuePlaylistRequest(request);
        await renderPendingPlaylistReviews();
    } catch (error) {
        setPlaylistProcessingStatus(error.message === 'invalid_playlist_url' ? 'URL playlist ghi đè không hợp lệ.' : `Không thể nhận playlist: ${error.message}`, 'error');
    }
}
window.acceptPendingPlaylist = acceptPendingPlaylist;

async function rejectPendingPlaylist(requestId) {
    await window.electronAPI.rejectPlaylist(requestId);
    await renderPendingPlaylistReviews();
}
window.rejectPendingPlaylist = rejectPendingPlaylist;

async function convertPendingPlaylistToSingle(requestId) {
    setPlaylistProcessingStatus('Đang lấy bài hợp lệ đầu tiên…');
    const result = await window.electronAPI.convertPlaylistToSingle(requestId, getPlaylistSettings());
    if (result?.success && result.track) {
        const request = result.request;
        const song = {
            id: `playlist_single_${result.track.id}`,
            type: 'youtube', videoId: result.track.videoId, title: result.track.title,
            author: result.track.channelName || '', thumbnail: result.track.thumbnailUrl,
            duration: result.track.durationSec, donorName: request.donorName,
            amount: request.donationAmount, message: request.originalMessage,
            timestamp: Date.now(), localAddedAt: Date.now(), fromPlaylistConversion: true
        };
        if (insertSongSmartly(song)) sortAndRefreshQueue();
        setPlaylistProcessingStatus('Đã chuyển thành bài đơn.', 'success');
        setTimeout(() => setPlaylistProcessingStatus(''), 3500);
    } else {
        setPlaylistProcessingStatus('Chưa tìm thấy video hợp lệ. Hãy dán URL playlist ghi đè rồi chọn Chấp nhận.', 'error');
    }
    await renderPendingPlaylistReviews();
}
window.convertPendingPlaylistToSingle = convertPendingPlaylistToSingle;

function togglePlaylistGroup(requestId) {
    if (state.expandedPlaylistIds.has(requestId)) state.expandedPlaylistIds.delete(requestId);
    else state.expandedPlaylistIds.add(requestId);
    renderQueue();
}
window.togglePlaylistGroup = togglePlaylistGroup;

function movePlaylistGroup(requestId, direction) {
    if (!window.PlaylistQueueService) return;
    state.queue = window.PlaylistQueueService.movePlaylist(state.queue, requestId, direction, state.currentSong?.id ?? null);
    saveQueue();
    renderQueue();
    updateNextSongInCurrentPayload();
}
window.movePlaylistGroup = movePlaylistGroup;

function movePlaylistTrackWithinGroup(songId, direction) {
    const sourceIndex = state.queue.findIndex(song => String(song.id) === String(songId));
    if (sourceIndex < 0) return;
    const source = state.queue[sourceIndex];
    if (!source?.playlistRequestId) return;

    const siblingIndexes = state.queue
        .map((song, index) => ({ song, index }))
        .filter(item => item.song.playlistRequestId === source.playlistRequestId
            && String(item.song.id) !== String(state.currentSong?.id))
        .map(item => item.index);
    const position = siblingIndexes.indexOf(sourceIndex);
    const targetPosition = direction === 'up' ? position - 1 : position + 1;
    if (position < 0 || targetPosition < 0 || targetPosition >= siblingIndexes.length) return;

    const targetIndex = siblingIndexes[targetPosition];
    [state.queue[sourceIndex], state.queue[targetIndex]] = [state.queue[targetIndex], state.queue[sourceIndex]];
    saveQueue();
    renderQueue();
    updateNextSongInCurrentPayload();
}
window.movePlaylistTrackWithinGroup = movePlaylistTrackWithinGroup;

function togglePinPlaylistTrack(songId) {
    const song = state.queue.find(item => String(item.id) === String(songId));
    if (!song?.playlistRequestId) return;
    song.isPinned = !song.isPinned;

    const indexes = state.queue
        .map((item, index) => ({ item, index }))
        .filter(entry => entry.item.playlistRequestId === song.playlistRequestId
            && String(entry.item.id) !== String(state.currentSong?.id))
        .map(entry => entry.index);
    const ordered = indexes.map(index => state.queue[index])
        .sort((left, right) => Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)));
    indexes.forEach((index, order) => { state.queue[index] = ordered[order]; });
    saveQueue();
    renderQueue();
    updateNextSongInCurrentPayload();
}
window.togglePinPlaylistTrack = togglePinPlaylistTrack;

function moveQueueEntryV2(songId, direction) {
    if (!window.PlaylistQueueService) return;
    state.queue = window.PlaylistQueueService.moveEntry(state.queue, songId, direction, state.currentSong?.id ?? null);
    saveQueue();
    renderQueue();
    updateNextSongInCurrentPayload();
}
window.moveQueueEntryV2 = moveQueueEntryV2;

async function skipEntirePlaylist(requestId) {
    if (!confirm('Bỏ qua toàn bộ playlist này?')) return;
    const containsCurrent = Boolean(state.currentSong?.playlistRequestId === requestId);
    if (window.PlaylistQueueService) state.queue = window.PlaylistQueueService.removePlaylist(state.queue, requestId);
    saveQueue();
    await window.electronAPI?.skipPlaylist?.(requestId);
    if (containsCurrent) {
        state.currentSong = null;
        localStorage.removeItem('dua_current_song');
        sendControlCommand('stop');
        playNextInQueue(false);
    } else {
        renderQueue();
        updateNextSongInCurrentPayload();
    }
}
window.skipEntirePlaylist = skipEntirePlaylist;

async function toggleCurrentPlaylistPause() {
    if (!state.currentSong?.playlistRequestId) return;
    if (state.isPlaying) {
        await window.electronAPI?.pausePlaylist?.(state.currentSong.playlistRequestId);
    } else {
        await window.electronAPI?.resumePlaylist?.(state.currentSong.playlistRequestId);
    }
    togglePlayPause();
}
window.toggleCurrentPlaylistPause = toggleCurrentPlaylistPause;

function buildRealtimeQueueSnapshot() {
    return state.queue.map((song, index) => ({
        id: song.id, position: index + 1, type: song.type, videoId: song.videoId || null,
        soundcloudUrl: song.soundcloudUrl || null, spotifyId: song.spotifyId || null,
        title: song.title, author: song.author || song.channelName || song.channelTitle || '',
        channelName: song.channelName || song.author || song.channelTitle || '', thumbnail: song.thumbnail || '',
        donorName: song.donorName || '', amount: Number(song.amount || 0), message: song.message || '',
        duration: Math.max(0, Math.floor(Number(song.duration) || 0)), start: Number(song.start || 0), end: song.end || null,
        isOwnerAdd: Boolean(song.isOwnerAdd), isPinned: Boolean(song.isPinned),
        timeLimitExempt: Boolean(song.timeLimitExempt || (song.playlistRequestId && song.playlistTrackId)),
        playlistRequestId: song.playlistRequestId || null, playlistTrackId: song.playlistTrackId || null,
        playlistTitle: song.playlistTitle || null, playlistPosition: song.playlistPosition || null,
        playlistTotalTracks: song.playlistTotalTracks || null, playlistTotalDurationSec: song.playlistTotalDurationSec || null
    }));
}

function publishRealtimeQueueUpdated() {
    const queue = buildRealtimeQueueSnapshot();
    publishRealtimeTransport({ type: 'queue.updated', data: { queue } });
}

function publishRealtimeSnapshot() {
    let currentSong = null;
    const effectiveMaxDuration = state.bypassCurrentSongDuration
        ? 0
        : (state.currentSong
            ? calculateMaxDurationForSong(state.currentSong)
            : (state.maxDurationEnabled ? state.maxDuration : 0));
    if (state.currentSong) {
        const payloadBuilder = window.overlaySongPayloadService
            || (window.overlaySongPayloadService = new window.OverlaySongPayloadService({
                calculateMaxDuration: calculateMaxDurationForSong
            }));
        currentSong = payloadBuilder.build(state.currentSong, getNextSong(), state);
        currentSong.maxDuration = effectiveMaxDuration;
        // Rehydrate the local payload as well: startup cleanup may have removed it
        // while Dashboard state and queue still know which song is active.
        localStorage.setItem('dua_current_song', JSON.stringify(currentSong));
    }
    publishRealtimeTransport({
        type: 'overlay.snapshot',
        data: {
            currentSong,
            queue: buildRealtimeQueueSnapshot(),
            activePlaylist: state.activePlaylistSnapshot,
            settings: getPlaylistSettings(),
            overlayConfig: {
                theme: state.theme,
                opacity: state.opacity,
                // Đây là giới hạn hiệu lực của bài hiện tại, không phải chỉ là
                // cấu hình mặc định. Khi bấm "Phát hết bài", giá trị phải giữ 0
                // cả lúc Overlay reconnect và nhận snapshot mới.
                maxDuration: effectiveMaxDuration,
                timeLimitConfig: buildTimeLimitConfig(),
                alertActionText: state.alertActionText,
                emptyQueueMessage: state.emptyQueueMessage,
                hideEmptyOverlay: Boolean(state.hideEmptyOverlay),
                showOverlayLyrics: state.showOverlayLyrics !== false,
                lyricsEnabled: localStorage.getItem('dua_lyrics_enabled') !== 'false',
                focusMode: Boolean(state.focusMode),
                focusModeMessage: state.focusModeMessage,
                volume: Math.max(0, Math.min(100, Number.isFinite(Number(state.volume)) ? Math.round(Number(state.volume)) : 80)),
                // DirectStream chỉ được dùng sau lỗi iframe thật sự; mặc định bật để
                // xử lý video bị chặn nhúng (101/150), trừ khi streamer tự tắt.
                directStreamFallbackEnabled: localStorage.getItem('dua_yt_bypass_enabled') !== 'false'
            },
            playback: { isPlaying: state.isPlaying, currentTime: state.lastReportedTime || 0 }
        }
    });
}

function handlePlaylistRealtimeEvent(payload) {
    if (!payload?.type) return;
    console.info(`[Playlist realtime] ${payload.type}`, payload.data || {});
    publishRealtimeTransport(payload);
    const data = payload.data || {};
    if (payload.type === 'playlist.detected') {
        setPlaylistProcessingStatus('Đang kiểm tra playlist…');
    } else if (payload.type === 'playlist.validating') {
        if (data.stage === 'fetching_metadata' && data.totalItems) {
            setPlaylistProcessingStatus(`Đang lấy thời lượng ${data.resolvedItems || 0}/${data.totalItems} video…`);
        } else {
            setPlaylistProcessingStatus('Đang xác thực yêu cầu playlist…');
        }
    } else if (payload.type === 'playlist.accepted') {
        setPlaylistProcessingStatus('');
    } else if (payload.type === 'playlist.rejected') {
        const reasonLabels = {
            no_valid_tracks: 'Playlist không còn video hợp lệ.',
            metadata_error: 'Không thể lấy dữ liệu playlist từ YouTube.',
            playlist_disabled: 'Tính năng nhận playlist đang tắt.',
            rejected_by_streamer: 'Playlist đã bị từ chối.'
        };
        setPlaylistProcessingStatus(reasonLabels[data.reason] || 'Playlist chưa được đưa vào hàng đợi.', 'error');
        setTimeout(() => setPlaylistProcessingStatus(''), 5000);
    } else if (payload.type === 'playlist.started' || payload.type === 'playlist.track_started') {
        state.activePlaylistSnapshot = data;
    } else if (payload.type === 'playlist.completed') {
        state.activePlaylistSnapshot = null;
        const completedRequestId = data.playlistRequestId;
        if (completedRequestId) {
            state.queue = state.queue.filter(song => song.playlistRequestId !== completedRequestId);
            state.expandedPlaylistIds.delete(completedRequestId);
            saveQueue();
            renderQueue();
            updateNextSongInCurrentPayload();
        }
    }
    if (payload.type.startsWith('playlist.')) renderPendingPlaylistReviews().catch(() => {});
}

function finishPlaylistTrack(song, status, reason = '') {
    if (!song?.playlistTrackId || song.playlistTerminalReported) return;
    song.playlistTerminalReported = true;
    if (window.electronAPI?.markPlaylistTrackFinished) {
        window.electronAPI.markPlaylistTrackFinished(song.playlistTrackId, status, reason).catch(error => {
            console.error('Không thể kết thúc playlist track:', error);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    getWindowsMediaService();
    initializePlaylistSettingsUI();
    if (window.electronAPI?.onPlaylistEvent) window.electronAPI.onPlaylistEvent(handlePlaylistRealtimeEvent);
    restorePlaylistQueueFromDatabase().then(() => publishRealtimeSnapshot());
});

function isDonationKeyProcessed(key) {
    if (key === undefined || key === null || key === '') return false;
    const normalizedKey = String(key);
    return (state.processedDonationKeys || []).some(item => String(item.key) === normalizedKey);
}

function markDonationKeyAsProcessed(key) {
    if (key === undefined || key === null || key === '') return;
    const normalizedKey = String(key);
    if (!Array.isArray(state.processedDonationKeys)) state.processedDonationKeys = [];
    if (!isDonationKeyProcessed(normalizedKey)) {
        state.processedDonationKeys.push({ key: normalizedKey, timestamp: Date.now() });
    }

    const now = Date.now();
    state.processedDonationKeys = state.processedDonationKeys
        .filter(item => item && now - Number(item.timestamp || 0) < 7 * 24 * 60 * 60 * 1000)
        .slice(-1000);
    localStorage.setItem('dua_processed_donation_keys', JSON.stringify(state.processedDonationKeys));
}

function calculateMaxDurationForSong(songOrAmount) {
    if (songOrAmount && typeof songOrAmount === 'object') {
        const isPlaylistTimeLimitExempt = window.PlaylistQueueService?.isTimeLimitExempt
            ? window.PlaylistQueueService.isTimeLimitExempt(songOrAmount)
            : Boolean(songOrAmount.playlistRequestId && songOrAmount.playlistTrackId);
        if (songOrAmount.timeLimitExempt === true || isPlaylistTimeLimitExempt) return 0;
    }
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
    if (song.timeLimitExempt === true || (song.playlistRequestId && song.playlistTrackId)) return false;
    // Nếu chưa có thời lượng thực của bài hát, mặc định cho phép để tránh bị chặn oan lúc mới load
    if (!song.duration || song.duration <= 0) return true;
    
    const currentLimit = calculateMaxDurationForSong(song);
    return (song.duration - currentLimit) > 0;
}

function checkAndApplyExtension(donation) {
    if (!state.extensionEnabled) return false;
    if (!state.currentSong) return false;

    // Khóa donate đã áp dụng gia hạn được lưu riêng, không đánh dấu bài order là đã kết thúc.
    if (donation.id && isDonationKeyProcessed(donation.id)) {
        return false;
    }
    
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
        
        // Chỉ đánh dấu lượt donate đã xử lý; bài nhạc đi kèm vẫn được phép vào Queue.
        if (donation.id) {
            markDonationKeyAsProcessed(donation.id);
        }
        
        // Ghi nhận lịch sử và hiển thị thông báo taskbar
        handleNewDonation(donation, true);
        
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
                publishMqtt('current_song', payload);
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

function getVoteSkipService() {
    return window.voteSkipService || (window.voteSkipService = new window.VoteSkipService({
        getState: () => state,
        isDonationProcessed: isDonationKeyProcessed,
        markDonationProcessed: markDonationKeyAsProcessed,
        recordDonation: handleNewDonation,
        log: logSystem,
        updateUi: updateVoteSkipButtonUI,
        sendControl: sendControlCommand,
        skipSong,
        reducePlaylist: (song, expectedPlaylistRequestId = song?.playlistRequestId) => {
            const playlistRequestId = String(expectedPlaylistRequestId || '');
            if (!playlistRequestId || String(song?.playlistRequestId || '') !== playlistRequestId) {
                console.warn('[Vote Skip Playlist] Bỏ qua yêu cầu rút gọn sai playlist.', {
                    songId: song?.id || null,
                    songPlaylistRequestId: song?.playlistRequestId || null,
                    expectedPlaylistRequestId: expectedPlaylistRequestId || null
                });
                return { reduced: false, reason: 'playlist_request_mismatch' };
            }
            const currentIndex = state.queue.findIndex(item => String(item.id) === String(song.id));
            if (currentIndex < 0) return { reduced: false };
            const candidates = state.queue.map((item, index) => ({ item, index }))
                .filter(entry => entry.index >= currentIndex && String(entry.item.playlistRequestId || '') === playlistRequestId);
            if (candidates.length < 2) return { reduced: false };
            const totalDuration = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.item.duration) || 0), 0);
            if (totalDuration <= 0) return { reduced: false };

            const targetDuration = totalDuration / 2;
            let keptDuration = 0;
            const keptIds = new Set();
            for (const entry of candidates) {
                const duration = Math.max(0, Number(entry.item.duration) || 0);
                if (keptIds.size > 0 && keptDuration + duration > targetDuration) break;
                keptIds.add(String(entry.item.id));
                keptDuration += duration;
            }
            if (keptIds.size >= candidates.length) return { reduced: false };

            const removed = candidates.filter(entry => !keptIds.has(String(entry.item.id))).map(entry => entry.item);
            const finalTotalTracks = Number(song.playlistPosition || 1) + keptIds.size - 1;
            state.queue = state.queue.filter(item => String(item.playlistRequestId || '') !== playlistRequestId || keptIds.has(String(item.id)) || String(item.id) === String(song.id));
            state.queue.forEach(item => {
                if (String(item.playlistRequestId || '') === playlistRequestId) {
                    item.playlistTotalTracks = finalTotalTracks;
                    item.playlistTotalDurationSec = Math.round(keptDuration);
                    item.playlistVoteReduced = true;
                }
            });
            removed.forEach(item => finishPlaylistTrack(item, 'skipped', 'vote_skip_playlist'));
            saveQueue();
            renderQueue();
            updateNextSongInCurrentPayload();
            getVoteSkipService().syncOverlay(song, true);
            return { reduced: true, removedCount: removed.length, keptDuration, totalDuration };
        },
        syncOverlay: (song) => {
            const payloadRaw = localStorage.getItem('dua_current_song');
            if (!payloadRaw) return;
            try {
                const payload = JSON.parse(payloadRaw);
                if (String(payload.id) !== String(song.id)) return;
                payload.voteSkipActive = Boolean(song.voteSkipActive);
                payload.voteSkipTarget = Math.max(0, Number(song.voteSkipTarget) || Number(state.voteSkipDefaultAmount) || 20000);
                payload.voteAmount = Math.max(0, Number(song.voteAmount) || 0);
                payload.playlistTotalTracks = song.playlistTotalTracks || payload.playlistTotalTracks || null;
                payload.playlistTotalDurationSec = song.playlistTotalDurationSec || payload.playlistTotalDurationSec || null;
                payload.playlistVoteReduced = Boolean(song.playlistVoteReduced);
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                publishMqtt('current_song', payload);
            } catch (error) {
                console.error('Lỗi đồng bộ metadata playlist sang overlay:', error);
            }
        },
        notifySuccess: song => {
            logSystem(`🗳️ <strong>[Vote Skip Thành Công]</strong> <strong>${song.title}</strong>`, 'system');
        },
        notifyPlaylistReduced: (song, reduction) => {
            const message = `Playlist được rút gọn còn ${formatTime(Math.round(reduction.keptDuration))}; đã bỏ ${reduction.removedCount} video ở cuối.`;
            logSystem(`🗳️ <strong>[Vote Skip Playlist]</strong> <strong>${song.playlistTitle || song.title}</strong> — ${message}`, 'system');
            showDashboardSystemAlert('Vote Skip Playlist thành công', message);
            if (window.electronAPI?.showTaskbarNotification) {
                window.electronAPI.showTaskbarNotification('🗳️ VOTE SKIP PLAYLIST', `${song.playlistTitle || song.title}\n${message}`, document.body.classList.contains('dark-mode'), 8000);
            }
        }
    }));
}

function getPlaylistVoteSkipService() {
    return window.playlistVoteSkipService || (window.playlistVoteSkipService = new window.PlaylistVoteSkipService({
        getState: () => state,
        isDonationProcessed: isDonationKeyProcessed,
        markDonationProcessed: markDonationKeyAsProcessed,
        recordDonation: handleNewDonation,
        updateUi: updateVoteSkipButtonUI,
        reducePlaylist: (song, playlistRequestId) => getVoteSkipService().reducePlaylist(song, playlistRequestId),
        notify: (song, reduction) => {
            const message = reduction.reduced
                ? `Playlist được rút gọn còn ${formatTime(Math.round(reduction.keptDuration))}; đã bỏ ${reduction.removedCount} video ở cuối.`
                : 'Playlist không còn đủ video để rút gọn thêm.';
            logSystem(`🗳️ <strong>[Vote Skip Playlist]</strong> <strong>${song.playlistTitle || song.title}</strong> — ${message}`, 'system');
            showDashboardSystemAlert('Vote Skip Playlist', message);
        }
    }));
}

function checkAndApplyVoteSkip(donation) {
    if (state.playlistVoteSkip?.active) {
        const applied = getPlaylistVoteSkipService().apply(donation);
        if (applied) return true;
        if (state.currentSong?.playlistRequestId !== state.playlistVoteSkip.playlistRequestId) state.playlistVoteSkip = null;
    }
    return getVoteSkipService().apply(donation);
}

function togglePlaylistVoteSkip() {
    const song = state.currentSong;
    if (!song?.playlistRequestId) return;
    const active = state.playlistVoteSkip;
    if (active?.active && active.playlistRequestId === song.playlistRequestId) {
        state.playlistVoteSkip = null;
        updateVoteSkipButtonUI();
        return;
    }
    if (song.voteSkipActive) {
        showDashboardSystemAlert('Vote Skip đang bật', 'Hãy tắt Vote Skip bài hát trước khi mở Vote Skip Playlist.');
        return;
    }
    promptVoteSkipTarget(state.voteSkipDefaultAmount, target => {
        state.playlistVoteSkip = {
            active: true, success: false, playlistRequestId: song.playlistRequestId,
            amount: 0, target, contributors: [], startedAt: Date.now()
        };
        updateVoteSkipButtonUI();
        showDashboardSystemAlert('Mở Vote Skip Playlist', 'Quỹ đạt mục tiêu sẽ rút ngắn 50% phần playlist còn lại.');
    });
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
    updateVoteSkipButtonUI();
    if (state.currentSong) getVoteSkipService().syncOverlay(state.currentSong);
}

function toggleVoteSkip() {
    if (!state.currentSong) {
        logSystem("Không có bài hát nào đang phát để mở Vote Skip!", 'system');
        return;
    }

    if (state.currentSong.voteSkipActive) {
        state.currentSong.voteSkipActive = false;
        state.currentSong.voteSkipSuccess = false;
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
            state.currentSong.voteSkipSuccess = false;
            state.currentSong.voteSkipStartTime = Date.now();
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
    const playlistBtn = document.getElementById('btn-vote-skip-playlist');
    const playlistVote = state.playlistVoteSkip;
    if (playlistBtn) {
        const isCurrentPlaylist = Boolean(state.currentSong?.playlistRequestId);
        const isActivePlaylistVote = Boolean(isCurrentPlaylist && playlistVote?.active
            && playlistVote.playlistRequestId === state.currentSong.playlistRequestId);
        playlistBtn.style.display = isCurrentPlaylist ? 'inline-flex' : 'none';
        playlistBtn.textContent = isActivePlaylistVote
            ? `Vote Playlist: ${formatMoneyShort(playlistVote.amount || 0)}/${formatMoneyShort(playlistVote.target || 0)}`
            : 'Vote skip Playlist 50%';
        playlistBtn.classList.toggle('active-voteskip', isActivePlaylistVote);
    }

    const playlistBar = document.getElementById('dash-playlist-vote-skip-bar');
    const playlistProgress = document.getElementById('dash-playlist-vote-skip-progress-text');
    const playlistFill = document.getElementById('dash-playlist-vote-skip-fill');
    const playlistContributors = document.getElementById('dash-playlist-vote-skip-contributors');
    const playlistContributorList = document.getElementById('dash-playlist-vote-skip-contributors-list');
    const isActivePlaylistVote = Boolean(state.currentSong?.playlistRequestId && playlistVote?.active
        && playlistVote.playlistRequestId === state.currentSong.playlistRequestId);
    if (playlistBar) playlistBar.classList.toggle('visible', isActivePlaylistVote);
    if (isActivePlaylistVote) {
        const amount = Number(playlistVote.amount || 0);
        const target = Math.max(1, Number(playlistVote.target || 0));
        if (playlistProgress) {
            playlistProgress.textContent = playlistVote.success
                ? `ĐÃ RÚT GỌN 50% (${amount.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNĐ)`
                : `${amount.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNĐ`;
        }
        if (playlistFill) {
            playlistFill.style.width = `${playlistVote.success ? 100 : Math.min(100, (amount / target) * 100)}%`;
            playlistFill.style.background = playlistVote.success
                ? 'var(--pineapple-success, #4ADE80)'
                : 'linear-gradient(90deg, #FF5722, #FF8A65)';
        }
        if (playlistContributors && playlistContributorList) {
            const donors = {};
            (playlistVote.contributors || []).forEach(item => {
                donors[item.name || 'Khách'] = (donors[item.name || 'Khách'] || 0) + (Number(item.amount) || 0);
            });
            const text = Object.entries(donors).sort((a, b) => b[1] - a[1])
                .map(([name, value]) => `${name} (${value.toLocaleString('vi-VN')}đ)`).join(', ');
            playlistContributorList.textContent = text;
            playlistContributors.style.display = text ? 'block' : 'none';
        }
    } else if (playlistContributors) {
        playlistContributors.style.display = 'none';
    }

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
function getActionCodeService() {
    return window.actionCodeService
        || (window.actionCodeService = new window.ActionCodeService({ storage: localStorage }));
}

// --- LOGIC KÍCH HOẠT MÃ THÊM LƯỢT ---
function verifyActionCode(code) {
    return getActionCodeService().verify(code);
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
    
    const result = getActionCodeService().redeem(code);
    if (!result.success && result.reason === 'invalid') {
        if (errEl) {
            errEl.textContent = 'Mã kích hoạt không đúng hoặc không hợp lệ!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    // Kiểm tra trùng lặp
    if (!result.success && result.reason === 'used') {
        if (errEl) {
            errEl.textContent = 'Mã kích hoạt này đã được sử dụng trước đó!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    // Hợp lệ, tiến hành lưu trữ
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
    // No-op - Action rate limiting has been disabled
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

function getSensitiveVideoConfigService() {
    if (!window.sensitiveVideoConfigService) {
        window.sensitiveVideoConfigService = new window.SensitiveVideoConfigService({
            storage: localStorage,
            fetchProxy: fetchWithCorsProxy,
            fetchImpl: fetch.bind(window)
        });
    }
    return window.sensitiveVideoConfigService;
}

async function fetchSensitiveVideosConfig() {
    return getSensitiveVideoConfigService().load();
}

let dashboardBootstrapController = null;
function getDashboardBootstrapController() {
    if (!dashboardBootstrapController) {
        const settingsUiController = new window.DashboardSettingsUiController({
            document,
            window,
            storage: localStorage,
            state,
            publishMqtt,
            logSystem,
            alert: message => alert(message),
            fetchSensitiveVideosConfig,
            updatePlayerUI,
            showDashboardSystemAlert,
        sendControlCommand,
            applyDarkModeState,
            generateExtensionCode,
            calculateMaxDurationForSong,
            updateMaxDurationValue,
            syncMaxDurationToOverlay,
            renderQueue,
            updateForceExtensionButtonUI,
            updateVoteSkipButtonUI,
            onMinAmountConfigChange,
            loadConfigFromAppData,
            checkYoutubeAuth
        });
        const playbackUiController = new window.DashboardPlaybackUiController({
            document,
            window,
            state,
            sendControlCommand,
            updateGlobalLimitUI,
            applyDashboardFocusModeState,
            isControlsDisabled,
            togglePlayPause,
            toggleMute,
            onVolumeChange,
            attemptGlobalAction,
            logSystem,
            formatTime,
            getCurrentOverlayDuration: () => currentOverlayDuration
        });
        dashboardBootstrapController = new window.DashboardBootstrapController({
            document,
            window,
            parseYoutubePlaylistId,
            parseYoutubeId,
            fetchSongMetadata,
            renderSearchResults: (...args) => getDashboardSearchService().renderResults(...args),
            callYouTubeSearch: query => getDashboardSearchService().searchYouTube(query),
            clearQuickSearch,
            cleanChannelName,
            state,
            storage: localStorage,
            publishMqtt,
            logSystem,
            alert: message => alert(message),
            updateObsUrlDisplay,
            sponsorBlockCategories,
            categoryLabels,
            settingsUiController,
            playbackUiController,
            dedupeZyPageQueue,
            renderQueue,
            initQueue,
            toggleFavoriteStatus,
            findFavoriteByContextKey,
            addFavoriteToQueue,
            showQueueToolsMenu,
            triggerManualZyPageSync,
            toggleLuckyMode,
            onSortConfigChange,
            syncIdlePriceTable: () => {
                const currentDuration = state.bypassCurrentSongDuration ? 0
                    : (state.currentSong
                        ? calculateMaxDurationForSong(state.currentSong)
                        : (state.maxDurationEnabled && state.limitMode === 'fixed' ? state.maxDuration : 0));
                syncMaxDurationToOverlay(currentDuration);
            },
            onSearchTimeoutChange: timeout => { searchTimeout = timeout; }
        });
    }
    return dashboardBootstrapController;
}

// --- LOGIC KHỞI ĐẦU KHI TRANG LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    getDashboardBootstrapController().initQuickAddUi();
    getDashboardBootstrapController().initSettingsUi();
    // Sửa lỗi mất focus bàn phím của Electron frameless window trên Windows khi click vào input
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            if (window.electronAPI && typeof window.electronAPI.focusWindow === 'function') {
                window.electronAPI.focusWindow();
            }
        }
    });


    // Kiểm tra và gắn class nếu chạy trên hệ điều hành Windows để dùng Titlebar Overlay
    const isWindows = navigator.userAgent.toLowerCase().includes('windows');
    if (isWindows) {
        document.body.classList.add('window-overlay-active');
    }

    // Khởi động monitor kết nối dịch vụ
    startServiceMonitorLoop();

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

            // Hiển thị walkthrough lần đầu sau khi nâng cấp phiên bản mới
            const lastSeenVersion = localStorage.getItem('dua_last_seen_version');
            if (lastSeenVersion !== ver) {
                showWalkthroughModal(ver);
            }
            localStorage.setItem('dua_last_seen_version', ver);
        });
    }

    getDashboardBootstrapController().initPlaybackUi();

    getDashboardBootstrapController().initQueueUi();

    // Cấu hình hiển thị ô nhúng OBS và khởi tạo realtime database
    updateObsUrlDisplay();
    initRealtimeDatabase();

/* ============================================================
   Dolby Atmos Spatial Audio DSP Engine
   ============================================================ */

function toggleDolbyAtmosSpatialAudio() {
    const currentState = localStorage.getItem('dua_dolby_atmos_enabled') !== 'false';
    const newState = !currentState;
    localStorage.setItem('dua_dolby_atmos_enabled', newState ? 'true' : 'false');
    
    if (window.dolbyAtmosEngine) {
        window.dolbyAtmosEngine.setEnabled(newState);
    }
    
    const badgeEl = document.getElementById('dolby-atmos-badge');
    if (badgeEl) {
        if (newState) {
            badgeEl.classList.add('active');
            badgeEl.title = "Đang BẬT âm thanh vòm Dolby Atmos Spatial Audio (Click để TẮT)";
            showDashboardSystemAlert("Dolby Atmos", "Đã BẬT chế độ Âm thanh vòm Dolby Atmos Spatial Audio cao cấp!", "DOLBY");
        } else {
            badgeEl.classList.remove('active');
            badgeEl.title = "Đang TẮT âm thanh vòm Dolby Atmos Spatial Audio (Click để BẬT)";
            showDashboardSystemAlert("Dolby Atmos", "Đã TẮT chế độ Âm thanh vòm Dolby Atmos", "DOLBY");
        }
    }
    
    const cmd = {
        type: 'set_dolby_atmos',
        value: newState,
        timestamp: Date.now()
    };
    publishMqtt('control_command', cmd);
}
window.toggleDolbyAtmosSpatialAudio = toggleDolbyAtmosSpatialAudio;



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
    } else if (code === 'drm_protected') {
        errorDescription = "Video dùng DRM: cả YouTube iframe lẫn DirectStream đều không có nguồn media có thể phát trong OBS.";
    } else if (code === 'authentication_required') {
        errorDescription = "YouTube yêu cầu xác thực chống bot nên DirectStream không thể lấy URL phát.";
    } else if (code === 'embedding_disabled') {
        errorDescription = "Chủ video đã tắt phát nhúng và nguồn DirectStream thay thế cũng không khả dụng.";
    } else if (code === 'format_unavailable') {
        errorDescription = "YouTube không cung cấp luồng DirectStream nào có chứa audio cho video này.";
    } else if (code === 'resolver_timeout') {
        errorDescription = "DirectStream mất quá nhiều thời gian để phân giải nguồn phát.";
    } else if (code === 'direct_stream_hls_failed') {
        errorDescription = "Nguồn HLS dự phòng đã tải được nhưng OBS không thể tiếp tục phát sau khi thử phục hồi.";
    } else if (code === 'direct_stream_play_failed' || code === 'direct_stream_resolution_failed' || code === 'yt_dlp_failed') {
        errorDescription = "Iframe không phát được và nguồn DirectStream dự phòng cũng thất bại.";
    }

    const fullMsg = `Bài hát: <strong>${title}</strong> gặp sự cố phát.<br><br>
        <span style="color: var(--pineapple-orange-dark); font-weight: 800;"><i class="fa-solid fa-triangle-exclamation"></i> Chi tiết:</span> ${errorDescription}<br><br>
        <em>Hệ thống đã tự động bỏ qua để phát bài tiếp theo. Hãy chọn bản nhạc khác thay thế (ví dụ: bản Vietsub, Lyric do fan đăng tải).</em>`;

    logSystem(`Lỗi phát bài "${title}" (Mã lỗi: ${code}). Chi tiết: ${errorDescription}`, "error");
    // Dùng cùng một đường chuyển bài với nút Next/Vote Skip. Không để
    // player_error tự xây thêm một cơ chế queue riêng gây double skip.
    skipSong(false, 'player_error_' + code);
    // Hiển thị sau thông báo skip để phần giải thích lỗi vẫn là thông báo cuối.
    showDashboardSystemAlert("Lỗi trình phát", fullMsg, "LỖI PHÁT NHẠC");
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
let mediaParserService = null;

function getMediaParserService() {
    return mediaParserService || (mediaParserService = new window.MediaParserService());
}

function parseYoutubeId(url) {
    return getMediaParserService().parseYoutubeId(url);
}

// F12 helper: inspect YouTube -> Apple -> LRCLIB without the negative cache.
// Example: debugSyncedLyrics('https://www.youtube.com/watch?v=8edEK_ce4k4')
window.debugSyncedLyrics = async function debugSyncedLyrics(urlOrVideoId = '') {
    if (typeof window.electronAPI?.debugSyncedLyrics !== 'function') {
        throw new Error('Lyrics debug IPC is unavailable. Restart the app after installing the patch.');
    }
    const rawInput = String(urlOrVideoId || '').trim();
    const directVideoId = /^[A-Za-z0-9_-]{11}$/.test(rawInput) ? rawInput : '';
    const videoId = directVideoId || parseYoutubeId(rawInput) || String(state.currentSong?.videoId || '');
    if (!videoId) throw new Error('Không tìm thấy YouTube video ID để debug.');

    const currentSong = String(state.currentSong?.videoId || '') === videoId ? state.currentSong : null;
    let metadata = {};
    if (!currentSong && typeof window.electronAPI?.getYoutubeMetadata === 'function') {
        metadata = await window.electronAPI.getYoutubeMetadata(videoId) || {};
    }
    const sourceUrl = /^https?:\/\//i.test(rawInput)
        ? rawInput
        : `https://www.youtube.com/watch?v=${videoId}`;
    const report = await window.electronAPI.debugSyncedLyrics({
        videoId,
        title: currentSong?.title || metadata.title || '',
        author: currentSong?.rawAuthor || currentSong?.author || currentSong?.channelName || metadata.author || '',
        rawAuthor: currentSong?.rawAuthor || '',
        channelName: currentSong?.channelName || currentSong?.author || metadata.author || '',
        albumName: currentSong?.albumName || currentSong?.album || '',
        duration: Math.max(0, Number(currentSong?.duration) || Number(metadata.duration) || 0),
        sourceUrl
    });
    console.groupCollapsed(`[Lyrics Debug] ${videoId} · ${report?.result?.reason || (report?.result?.available ? 'matched' : 'unknown')}`);
    console.log('Input / YouTube / canonical:', {
        input: report?.input,
        youtube: report?.youtube,
        identity: report?.identity,
        apple: report?.apple,
        matching: report?.matching,
        canonical: report?.canonical
    });
    if (Array.isArray(report?.candidates) && report.candidates.length) console.table(report.candidates);
    console.log('LRCLIB requests:', report?.searchRequests || []);
    console.log('Full report:', report);
    console.groupEnd();
    return report;
};

// --- TRÍCH XUẤT SPOTIFY TRACK ID ---
function parseYoutubePlaylistId(rawUrl) {
    return getMediaParserService().parseYoutubePlaylistId(rawUrl);
}

function parseSpotifyTrackId(url) {
    return getMediaParserService().parseSpotifyTrackId(url);
}

// --- THÊM BÀI HÁT NHANH BẰNG LINK ---
let quickAddPlaylistInFlight = false;

function getQuickAddService() {
    return window.quickAddService
        || (window.quickAddService = new window.QuickAddService({
            parseYoutubeId,
            parsePlaylistId: parseYoutubePlaylistId,
            resolveSoundcloudUrl: resolveSoundcloudUrlIfNeeded,
            fetchMetadata: fetchSongMetadata,
            addManualPlaylist: (...args) => window.electronAPI?.addManualPlaylist?.(...args),
            parseDuration: parseDurationToSeconds
        }));
}

function getQuickAddUiController() {
    return window.quickAddUiController
        || (window.quickAddUiController = new window.QuickAddUiController({ document }));
}

function getDashboardSearchService() {
    return window.dashboardSearchService
        || (window.dashboardSearchService = new window.DashboardSearchService({
            document,
            state,
            electronAPI: window.electronAPI,
            fetchImpl: window.fetch.bind(window),
            getApiUrl,
            isFavorite,
            toggleFavorite: toggleFavoriteStatus,
            formatViews: formatViewsCompact,
            cleanChannelName,
            formatTime,
            readQuickAddOptions: () => getQuickAddUiController().readOptions(),
            createSong: (video, options) => getQuickAddService().createSong(video, options),
            insertSong: insertSongSmartly,
            broadcastNewDonationAlert,
            saveQueue,
            sortAndRefreshQueue,
            clearQuickSearch,
            logSystem,
            showDashboardSystemAlert,
            playNextInQueue
        }));
}

async function addYoutubePlaylistFromQuickAdd(url, contextOverride = null) {
    if (quickAddPlaylistInFlight) return;
    if (!window.electronAPI?.addManualPlaylist) {
        alert('Phiên bản ứng dụng hiện tại chưa hỗ trợ thêm playlist từ Quick Add.');
        return;
    }

    const nameInput = document.getElementById('quick-donor-name');
    const amountInput = document.getElementById('quick-donor-amount');
    const quickAddOptions = getQuickAddUiController().readOptions();
    const donorName = contextOverride?.donorName ?? quickAddOptions.donorName;
    const donorAmount = contextOverride?.donationAmount ?? quickAddOptions.amount;
    const isOwnerAdd = contextOverride?.isOwnerAdd ?? quickAddOptions.isOwnerAdd;
    const searchResultsContainer = document.getElementById('quick-add-search-results');

    quickAddPlaylistInFlight = true;
    if (searchResultsContainer) {
        searchResultsContainer.style.display = 'flex';
        searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Đang tải playlist YouTube...</div>';
    }

    try {
        const result = await getQuickAddService().addPlaylist(
            url,
            { donorName, donationAmount: donorAmount, isOwnerAdd },
            getPlaylistSettings(),
            getPlaylistBlacklistVideoIds()
        );
        const request = result?.request;
        if (!result?.matched || !request) {
            throw new Error(result?.error || 'invalid_playlist_url');
        }

        if (request.status === 'ready' || request.status === 'queued') {
            const added = await enqueuePlaylistRequest(request);
            showDashboardSystemAlert('Đã thêm playlist', `${escapeDashboardHtml(request.title)} · ${added.length} video`, 'HÀNG ĐỢI');
            if (!contextOverride) {
                clearQuickSearch();
                if (nameInput) nameInput.value = '';
                if (amountInput) amountInput.value = '';
                const quickAddPopover = document.getElementById('quick-add-popover');
                if (quickAddPopover) quickAddPopover.classList.remove('visible');
            }
            return;
        }

        await renderPendingPlaylistReviews();
        const reason = request.rejectionText || 'Playlist cần được kiểm tra trước khi thêm vào hàng đợi.';
        if (searchResultsContainer) {
            searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error);">${escapeDashboardHtml(reason)}</div>`;
        }
    } catch (error) {
        console.error('Quick Add playlist failed:', error);
        const message = error?.message === 'invalid_playlist_url'
            ? 'Đường dẫn playlist YouTube không hợp lệ.'
            : `Không thể tải playlist: ${error.message}`;
        if (searchResultsContainer) {
            searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error);">${escapeDashboardHtml(message)}</div>`;
        }
    } finally {
        quickAddPlaylistInFlight = false;
    }
}

async function handleQuickAddSubmit(event) {
    event.preventDefault();
    if (state.focusMode) return;

    const urlInput = document.getElementById('donor-url');
    if (!urlInput) return;

    let url = urlInput.value.trim();
    
    getDashboardBootstrapController().cancelQuickAddSearch();
    
    const isUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('spotify:');
    if (!isUrl) {
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
                const result = await getDashboardSearchService().searchYouTube(url);
                if (result && result.success && result.videos && result.videos.length > 0) {
                    getDashboardSearchService().renderResults(result.videos, 'quick-add-search-results');
                    getDashboardSearchService().addResultToQueue(result.videos[0]);
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

    const classifiedMedia = getQuickAddService().classify(url);
    if (classifiedMedia.kind === 'playlist') {
        await addYoutubePlaylistFromQuickAdd(url);
        return;
    }
    if (classifiedMedia.kind === 'unsupported') {
        alert("Ứng dụng đã ngừng hỗ trợ phát nhạc từ Spotify. Vui lòng sử dụng link YouTube hoặc SoundCloud!");
        return;
    }
    if (classifiedMedia.kind !== 'track') {
        alert("Đường dẫn bài hát không hợp lệ. Vui lòng nhập link YouTube hoặc SoundCloud!");
        return;
    }
    logSystem(`Đang lấy thông tin bài hát từ ${classifiedMedia.type.toUpperCase()}...`, 'queue');

    try {
        const resolvedMedia = await getQuickAddService().resolve(url);
        const nameInput = document.getElementById('quick-donor-name');
        const donorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Fan Cứng Nhạc Trẻ";
        const amountInput = document.getElementById('quick-donor-amount');
        const donorAmount = (amountInput && amountInput.value.trim() !== '') ? Number(amountInput.value) : 100000000;
        const ownerAddCheckbox = document.getElementById('quick-owner-add');
        const isOwnerAdd = ownerAddCheckbox ? ownerAddCheckbox.checked : false;
        const newSong = getQuickAddService().createSong(resolvedMedia, { donorName, amount: donorAmount, isOwnerAdd });

        insertSongSmartly(newSong);
        broadcastNewDonationAlert(newSong);
        saveQueue();
        sortAndRefreshQueue();
        
        logSystem(`Đã thêm nhanh bài hát: <strong>${newSong.title}</strong> (${newSong.type.toUpperCase()})`, 'queue');
        showDashboardSystemAlert("Đã thêm nhạc nhanh", `Đã thêm nhanh bài hát: <strong>${newSong.title}</strong>`, 'HÀNG ĐỢI');
        
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
// --- PHÁT THÔNG BÁO DONATE MỚI LÊN OBS OVERLAY ---
async function broadcastNewDonationAlert(song) {
    if (!song) return;
    
    if ((song.type === 'youtube' || song.type === 'soundcloud') && !song.duration) {
        resolveSongDuration(song);
    }
    
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
        publishMqtt('owner_add_alert', ownerAlertPayload);
        
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
    }
    // Thông báo taskbar cho nhạc order từ donate đã được xử lý trong handleNewDonation để tránh lặp
    
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

    if (song.isPlaylistDonation) {
        positionStr = song.playlistTotalTracks > 0
            ? `Playlist ${song.playlistTotalTracks} video`
            : 'Playlist';
    }

    const alertPayload = {
        id: song.id,
        donorName: String(song.donorName || 'Khách').trim(),
        amount: Number(song.amount) || 0,
        title: String(song.title || 'Nhạc Youtube').trim(),
        message: String(song.message || '').trim(),
        position: positionStr,
        thumbnail: String(song.thumbnail || '').trim(),
        type: String(song.type || '').trim(),
        videoId: String(song.videoId || '').trim(),
        duration: song.duration,
        start: song.start,
        end: song.end,
        isPlaylist: Boolean(song.isPlaylistDonation || song.playlistRequestId),
        playlistRequestId: String(song.playlistRequestId || '').trim(),
        playlistTitle: String(song.playlistTitle || '').trim(),
        playlistTotalTracks: Number(song.playlistTotalTracks || 0),
        timestamp: Date.now() + Math.random() // Tránh trùng lặp sự kiện storage
    };
    
    localStorage.setItem('dua_new_donation_alert', JSON.stringify(alertPayload));
    
    // Hiển thị thông báo trên Dashboard
    showDashboardNewDonationAlert(alertPayload);
    
    // Realtime database broadcast
    logSystem(`📡 <strong>[Alert → Overlay]</strong> Đang gửi new_donation_alert: <strong>${alertPayload.donorName}</strong> | ${alertPayload.title} | pos=${alertPayload.position}`, 'system');
    publishMqtt('new_donation_alert', alertPayload);
}

// --- LƯU TRỮ HÀNG ĐỢI VÀO LOCALSTORAGE ---
function saveQueue() {
    const duplicateCount = dedupeZyPageQueue();
    if (duplicateCount > 0) {
        logSystem(`Da tu dong don ${duplicateCount} ban ghi ZyPage bi trung trong hang doi.`, 'system');
    }
    localStorage.setItem('dua_queue', JSON.stringify(state.queue));
    publishRealtimeQueueUpdated();
}

// --- SẮP XẾP VÀ VẼ LẠI HÀNG ĐỢI ---
function sortAndRefreshQueue(forceSort = false) {
    state.queue = window.DashboardQueueService.sort(state.queue, {
        currentSong: state.currentSong,
        sortConfig: state.sortConfig,
        forceSort
    });

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

const durationRetryService = new window.DurationRetryService();

function resolveSongDuration(song) {
    if (!song || Number(song.duration) > 0) return;
    const mediaIdentity = song.type === 'youtube'
        ? String(song.videoId || '').trim()
        : String(song.soundcloudUrl || '').trim();
    if (!mediaIdentity) return;
    const jobKey = `${song.type}:${mediaIdentity}`;
    const isSameMedia = item => Boolean(item)
        && String(item.type || '') === String(song.type || '')
        && (song.type === 'youtube'
            ? String(item.videoId || '').trim() === mediaIdentity
            : String(item.soundcloudUrl || '').trim() === mediaIdentity);
    const isCurrentSong = () => isSameMedia(state.currentSong);
    const isActive = () => isCurrentSong() || state.queue.some(isSameMedia);
    const load = async () => {
        let path = '';
        if (song.type === 'youtube' && song.videoId) {
            path = `/api/youtube-duration?videoId=${encodeURIComponent(song.videoId)}`;
        } else if (song.type === 'soundcloud' && song.soundcloudUrl) {
            path = `/api/soundcloud-duration?url=${encodeURIComponent(song.soundcloudUrl)}`;
        } else {
            return { duration: 0 };
        }
        const response = await fetch(getApiUrl(path), { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    };

    durationRetryService.ensure(jobKey, {
        isActive,
        load,
        onResult: data => {
            const duration = Math.max(0, Math.floor(Number(data?.duration) || 0));
            const views = data?.views ?? data?.playCount;
            let changed = false;
            const matchingSongs = new Set([song, ...state.queue.filter(isSameMedia)]);
            if (isCurrentSong()) matchingSongs.add(state.currentSong);
            matchingSongs.forEach(item => {
                if (duration > 0 && Number(item.duration) !== duration) {
                    item.duration = duration;
                    changed = true;
                }
                if (views != null && views !== '' && item.views !== views) {
                    item.views = views;
                    changed = true;
                }
            });
            if (isCurrentSong() && duration > 0) {
                state.currentSong.maxDuration = Math.max(
                    Number(state.currentSong.maxDuration) || 0,
                    duration
                );
            }
            if (!changed) return;
            saveQueue();
            renderQueue();
            if (isCurrentSong()) updatePlayerUI(state.currentSong);
        },
        onResolved: (_data, attempts) => {
            console.info(`[Duration] Đã lấy thời lượng cho ${song.title || song.id} sau ${attempts} lần.`);
        },
        onError: (error, attempts) => {
            console.warn(`[Duration] Lần ${attempts} chưa lấy được thời lượng ${song.title || song.id}:`, error.message || error);
        }
    });
}

// --- RENDER DANH SÁCH HÀNG ĐỢI LÊN HTML ---

let queueNewBadgeService = null;

function getQueueNewBadgeService() {
    return queueNewBadgeService || (queueNewBadgeService = new window.QueueNewBadgeService({ durationMs: 5000 }));
}

function markQueueSongsAsNew(songs, now = Date.now()) {
    getQueueNewBadgeService().mark(songs, now);
}

function renderQueueNewBadge(songs, now = Date.now()) {
    const remainingMs = getQueueNewBadgeService().getRemainingMs(songs, now);
    if (remainingMs <= 0) return '';
    return `<span class="queue-new-badge" style="--queue-new-badge-lifetime:${Math.ceil(remainingMs)}ms" onanimationend="this.remove()">MỚI</span>`;
}

function renderQueueLyricsBadge(song) {
    if (!song?.lyrics?.available) return '';
    return `<span class="queue-lyrics-badge" title="Bài hát có lời đồng bộ" aria-label="Có lời bài hát"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display: inline-block; vertical-align: -2px; margin-right: 4px; color: var(--pineapple-orange, #FB923C);"><path d="M6.8 4.7A3.8 3.8 0 0 1 10.6 8.5c0 3.4-2.1 6.6-5.3 9.2a1 1 0 0 1-1.4-1.4c2.3-2 3.7-4.3 4-6.3A3.8 3.8 0 1 1 6.8 4.7zm10.4 0A3.8 3.8 0 0 1 21 8.5c0 3.4-2.1 6.6-5.3 9.2a1 1 0 0 1-1.4-1.4c2.3-2 3.7-4.3 4-6.3A3.8 3.8 0 1 1 17.2 4.7z"></path></svg></span>`;
}

function getQueueSongUrl(song) {
    if (song.type === 'youtube' && song.videoId) return `https://www.youtube.com/watch?v=${song.videoId}`;
    if (song.type === 'soundcloud' && song.soundcloudUrl) return song.soundcloudUrl;
    return song.songLink || '#';
}

function renderQueueSongCardV2Legacy(song, options = {}) {
    const isCurrent = Boolean(options.isCurrent);
    const child = Boolean(options.child);
    const channelName = escapeDashboardHtml(getDashboardChannelName(song));
    const title = escapeDashboardHtml(song.title || 'Chưa có tên bài hát');
    const donor = escapeDashboardHtml(song.donorName || 'Khách');
    const amount = Number(song.amount || 0).toLocaleString('vi-VN') + 'đ';
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    const realIndex = state.queue.findIndex(item => String(item.id) === String(song.id));
    const songUrl = getQueueSongUrl(song);
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')" title="Mở trên trình duyệt">${title}</a>`
        : title;
    const playlistChip = song.playlistRequestId
        ? (() => {
            const sameGroup = state.queue.filter(s => s && s.playlistRequestId === song.playlistRequestId);
            const total = Number(song.playlistTotalTracks || sameGroup.length || 1);
            const completed = Math.max(0, total - sameGroup.length);
            const idx = sameGroup.findIndex(s => String(s.id) === String(song.id));
            const pos = completed + 1 + (idx !== -1 ? idx : 0);
            return `<span class="queue-playlist-chip"><i class="fa-solid fa-layer-group"></i> Playlist · Video ${pos}/${total}</span>`;
        })()
        : '';
    const ownerLabel = song.isOwnerAdd ? 'Chủ kênh' : donor;
    const statusLabel = isCurrent ? (state.isPlaying ? 'Đang phát' : 'Đã tạm dừng') : '';

    return `
        <article class="queue-card-v2 ${isCurrent ? 'is-playing' : 'is-waiting'} ${child ? 'is-playlist-child' : ''}" data-song-id="${escapeDashboardHtml(String(song.id))}">
            ${child ? '' : `<header class="queue-card-v2-head"><span title="${ownerLabel}">${ownerLabel}</span><b>${song.isOwnerAdd ? 'Chủ kênh thêm' : amount}</b></header>`}
            <div class="queue-card-v2-body">
                <div class="queue-card-v2-thumb"><img src="${thumbnail}" alt="" loading="lazy">${isCurrent ? '<span class="queue-equalizer" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</div>
                <div class="queue-card-v2-copy">
                    <div class="queue-card-v2-title">${linkedTitle}</div>
                    <div class="queue-card-v2-channel" title="${channelName}">${channelName || 'Kênh YouTube'}</div>
                    <div class="queue-card-v2-meta">${playlistChip}${statusLabel ? `<span class="queue-state-chip">${statusLabel}</span>` : ''}</div>
                </div>
                <div class="queue-card-v2-actions">
                    ${isCurrent ? `
                        ${song.playlistRequestId ? `<button title="${state.isPlaying ? 'Tạm dừng playlist' : 'Tiếp tục playlist'}" onclick="toggleCurrentPlaylistPause()"><i class="fa-solid fa-${state.isPlaying ? 'pause' : 'play'}"></i></button>` : ''}
                        <button title="Bỏ qua bài này" onclick="skipSong(true)"><i class="fa-solid fa-forward-step"></i></button>
                        ${song.playlistRequestId ? `<button class="danger" title="Bỏ toàn bộ playlist" onclick="skipEntirePlaylist('${song.playlistRequestId}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                    ` : `
                        ${!child ? `<button title="${song.isPinned ? 'Bỏ ghim' : 'Ghim bài'}" onclick="togglePinQueueItem('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>` : ''}
                        ${!child && realIndex > 0 ? `<button title="Di chuyển lên" onclick="moveQueueEntryV2('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>` : ''}
                        ${!child && realIndex >= 0 && realIndex < state.queue.length - 1 ? `<button title="Di chuyển xuống" onclick="moveQueueEntryV2('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>` : ''}
                        <button title="Phát ngay" onclick="userForcePlaySong('${song.id}')"><i class="fa-solid fa-play"></i></button>
                        <button title="Xóa bài" onclick="userRemoveSongFromQueue('${song.id}')"><i class="fa-solid fa-xmark"></i></button>
                    `}
                </div>
            </div>
            ${isCurrent ? '' : `<div class="queue-waiting-duration"><i class="fa-regular fa-clock"></i> ${duration > 0 ? formatTime(duration) : 'Đang lấy thời lượng'}</div>`}
        </article>
    `;
}

function renderQueueSongCardV2(song, options = {}) {
    const isCurrent = Boolean(options.isCurrent);
    const channelName = escapeDashboardHtml(getDashboardChannelName(song));
    const title = escapeDashboardHtml(song.title || 'Chưa có tên bài hát');
    const donor = escapeDashboardHtml(song.donorName || 'Khách');
    const amount = Number(song.amount || 0).toLocaleString('vi-VN') + ' VNĐ';
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    const realIndex = state.queue.findIndex(item => String(item.id) === String(song.id));
    const songUrl = getQueueSongUrl(song);
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')">${title}</a>`
        : title;
    const donorLine = song.isOwnerAdd
        ? '<span>Chủ kênh thêm</span>'
        : `<span>${donor}</span><b>${amount}</b>`;
    const newBadge = renderQueueNewBadge(song);
    const lyricsBadge = renderQueueLyricsBadge(song);

    return `
        <article class="queue-card-v2 queue-card-classic ${isCurrent ? 'is-playing' : 'is-waiting'}" data-song-id="${escapeDashboardHtml(String(song.id))}">
            <div class="queue-card-v2-body">
                <div class="queue-card-v2-thumb">
                    <img src="${thumbnail}" alt="" loading="lazy">
                    ${isCurrent ? '<span class="queue-equalizer" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
                </div>
                <div class="queue-card-v2-copy">
                    <div class="queue-card-v2-title">${lyricsBadge}${linkedTitle}${newBadge}</div>
                    <div class="queue-card-v2-channel" title="${channelName}">${channelName || 'Kênh YouTube'}</div>
                    <div class="queue-card-classic-footer">
                        <div class="queue-card-classic-donor">${donorLine}</div>
                        <div class="queue-card-classic-controls">
                            <span class="queue-card-classic-duration"><i class="fa-regular fa-clock"></i> ${duration > 0 ? formatTime(duration) : '--:--'}</span>
                            <div class="queue-card-v2-actions">
                                ${isCurrent ? `
                                    <button class="primary" title="${state.isPlaying ? 'Tạm dừng' : 'Tiếp tục'}" onclick="togglePlayPause()"><i class="fa-solid fa-${state.isPlaying ? 'pause' : 'play'}"></i></button>
                                    <button title="Bỏ qua bài này" onclick="skipSong(true)"><i class="fa-solid fa-forward-step"></i></button>
                                ` : `
                                    <button class="${song.isPinned ? 'active' : ''}" title="${song.isPinned ? 'Bỏ ghim' : 'Ghim bài'}" onclick="togglePinQueueItem('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>
                                    ${realIndex > 0 ? `<button title="Di chuyển lên" onclick="moveQueueEntryV2('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>` : ''}
                                    ${realIndex >= 0 && realIndex < state.queue.length - 1 ? `<button title="Di chuyển xuống" onclick="moveQueueEntryV2('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>` : ''}
                                    <button class="primary" title="Phát ngay" onclick="userForcePlaySong('${song.id}')"><i class="fa-solid fa-play"></i></button>
                                    <button class="danger" title="Xóa bài" onclick="userRemoveSongFromQueue('${song.id}')"><i class="fa-solid fa-trash"></i></button>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderPlaylistGroupV2Legacy(group, groupIndex, groupCount) {
    const songs = group.songs || [];
    const first = songs[0];
    if (!first) return '';
    const requestId = first.playlistRequestId;
    const expanded = state.expandedPlaylistIds.has(requestId);
    const duration = songs.reduce((sum, song) => sum + Number(song.duration || 0), 0);
    return `
        <section class="playlist-group-card ${expanded ? 'is-expanded' : ''}" data-playlist-request-id="${requestId}">
            <header class="playlist-group-donor"><span>${escapeDashboardHtml(first.donorName || 'Khách')}</span><b>${Number(first.amount || 0).toLocaleString('vi-VN')}đ</b></header>
            <div class="playlist-group-summary">
                <img src="${escapeDashboardHtml(first.playlistThumbnailUrl || first.thumbnail || '')}" alt="">
                <div class="playlist-group-copy">
                    <strong>${escapeDashboardHtml(first.playlistTitle || 'YouTube Playlist')}</strong>
                    <span>${songs.length} video đang chờ · ${formatTime(duration)}${Number(first.playlistSkippedItemCount || 0) > 0 ? ` · bỏ qua ${first.playlistSkippedItemCount}` : ''}</span>
                </div>
                <div class="playlist-group-actions">
                    <button title="Mở hoặc thu gọn" onclick="togglePlaylistGroup('${requestId}')"><i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'}"></i></button>
                    <button title="Di chuyển playlist lên" ${groupIndex <= 0 ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                    <button title="Di chuyển playlist xuống" ${groupIndex >= groupCount - 1 ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                    <button title="Phát playlist" onclick="userForcePlaySong('${first.id}')"><i class="fa-solid fa-play"></i></button>
                    <button class="danger" title="Bỏ toàn bộ playlist" onclick="skipEntirePlaylist('${requestId}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="playlist-group-tracks">
                ${expanded ? songs.map(song => renderQueueSongCardV2(song, { child: true })).join('') : ''}
            </div>
        </section>
    `;
}

function renderPlaylistTrackRowLegacy(song, index, total) {
    const songUrl = getQueueSongUrl(song);
    const title = escapeDashboardHtml(song.title || 'Chưa có tên bài hát');
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')">${title}</a>`
        : title;
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    return `
        <article class="playlist-track-row ${song.isPinned ? 'is-pinned' : ''}" data-song-id="${escapeDashboardHtml(String(song.id))}">
            <span class="playlist-track-number">${index + 1}</span>
            <img class="playlist-track-thumb" src="${thumbnail}" alt="" loading="lazy">
            <div class="playlist-track-title" title="${title}">${linkedTitle}</div>
            <time>${duration > 0 ? formatTime(duration) : '--:--'}</time>
            <div class="playlist-track-actions">
                <button class="primary" title="Phát ngay" onclick="userForcePlaySong('${song.id}')"><i class="fa-solid fa-play"></i></button>
                <button class="${song.isPinned ? 'active' : ''}" title="${song.isPinned ? 'Bỏ ghim' : 'Ghim bài'}" onclick="togglePinPlaylistTrack('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>
                <button title="Di chuyển lên" ${index === 0 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                <button title="Di chuyển xuống" ${index >= total - 1 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="danger" title="Xóa bài" onclick="userRemoveSongFromQueue('${song.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </article>
    `;
}

function renderPlaylistTrackRow(song, index, total, options = {}) {
    const isCurrent = Boolean(state.currentSong && String(state.currentSong.id) === String(song.id));
    const title = escapeDashboardHtml(song.title || 'Chưa có tên bài hát');
    const songUrl = getQueueSongUrl(song);
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')">${title}</a>`
        : title;
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    const movableIndex = Number.isInteger(options.movableIndex) ? options.movableIndex : index;
    const movableTotal = Number.isInteger(options.movableTotal) ? options.movableTotal : total;
    const completedOffset = Number.isInteger(options.completedOffset) ? options.completedOffset : 0;
    const displayIndex = completedOffset + 1 + index;
    const newBadge = renderQueueNewBadge(song);
    const lyricsBadge = renderQueueLyricsBadge(song);
    return `
        <article class="playlist-track-row ${song.isPinned ? 'is-pinned' : ''} ${isCurrent ? 'is-playing' : ''}" data-song-id="${escapeDashboardHtml(String(song.id))}" ${isCurrent ? 'aria-current="true"' : ''}>
            <span class="playlist-track-number">${displayIndex}</span>
            <img class="playlist-track-thumb" src="${thumbnail}" alt="" loading="lazy">
            <div class="playlist-track-title" title="${title}">
                ${lyricsBadge}${linkedTitle}
                ${newBadge}
                ${isCurrent ? '<span class="playlist-track-playing-label" title="Bài đang phát" aria-label="Bài đang phát"><i class="fa-solid fa-volume-high"></i></span>' : ''}
            </div>
            <time>${duration > 0 ? formatTime(duration) : '--:--'}</time>
            <div class="playlist-track-actions">
                <button class="primary" title="${isCurrent ? (state.isPlaying ? 'Tạm dừng' : 'Tiếp tục') : 'Phát ngay'}" onclick="${isCurrent ? 'togglePlayPause()' : `userForcePlaySong('${song.id}')`}"><i class="fa-solid fa-${isCurrent && state.isPlaying ? 'pause' : 'play'}"></i></button>
                <button class="${song.isPinned ? 'active' : ''}" title="${song.isPinned ? 'Bỏ ghim' : 'Ghim bài'}" ${isCurrent ? 'disabled' : ''} onclick="togglePinPlaylistTrack('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>
                <button title="Di chuyển lên" ${isCurrent || movableIndex <= 0 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                <button title="Di chuyển xuống" ${isCurrent || movableIndex < 0 || movableIndex >= movableTotal - 1 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="danger" title="${isCurrent ? 'Bỏ qua bài đang phát' : 'Xóa bài'}" onclick="${isCurrent ? 'skipSong(true)' : `userRemoveSongFromQueue('${song.id}')`}"><i class="fa-solid fa-trash"></i></button>
            </div>
        </article>
    `;
}

function renderPlaylistGroupV2(group, groupIndex = 0, groupCount = 1, options = {}) {
    const songs = group.songs || [];
    const first = songs[0];
    if (!first) return '';
    const requestId = first.playlistRequestId;
    const expanded = Boolean(options.forceExpanded || state.expandedPlaylistIds.has(requestId));
    const duration = songs.reduce((sum, song) => sum + Number(song.duration || 0), 0);
    const activeSong = state.currentSong?.playlistRequestId === requestId ? state.currentSong : null;
    const movableSongs = songs.filter(song => !activeSong || String(song.id) !== String(activeSong.id));
    const donorName = escapeDashboardHtml(first.donorName || 'Khách');
    const playlistTotal = Number(first.playlistTotalTracks || songs.length);
    const completedCount = Math.max(0, playlistTotal - songs.length);
    const ownerText = first.isOwnerAdd
        ? 'Chủ kênh thêm'
        : `${donorName} <b>${Number(first.amount || 0).toLocaleString('vi-VN')}đ</b>`;
    const activeIndex = activeSong ? songs.findIndex(s => String(s.id) === String(activeSong.id)) : -1;
    const currentPos = completedCount + 1 + (activeIndex !== -1 ? activeIndex : 0);
    const statusText = activeSong
        ? `Đang phát ${currentPos}/${playlistTotal}`
        : `${songs.length} video · ${formatTime(duration)}`;
    const newBadge = renderQueueNewBadge(songs);
    const remainingTimeHtml = activeSong ? `<span id="dashboard-playlist-remaining-${requestId}" style="font-variant-numeric: tabular-nums; min-width: 4.5ch; display: inline-block; text-align: right; margin-right: 0.5rem; font-size: 0.9em; opacity: 0.9; font-weight: 600;"></span>` : '';

    return `
        <section class="playlist-group-card ${expanded ? 'is-expanded' : ''} ${activeSong ? 'is-active-playlist' : ''}" data-playlist-request-id="${requestId}">
            <div class="playlist-group-overview">
                <img src="${escapeDashboardHtml(first.playlistThumbnailUrl || first.thumbnail || '')}" alt="">
                <div class="playlist-group-copy">
                    <strong>${escapeDashboardHtml(first.playlistTitle || 'YouTube Playlist')}${newBadge}</strong>
                    <span class="playlist-group-donation">${ownerText}</span>
                    <span class="playlist-group-status"><i class="fa-solid fa-volume-high"></i> ${statusText}</span>
                </div>
                <div class="playlist-group-header-actions">
                    ${remainingTimeHtml}
                    <button class="primary" title="${activeSong ? (state.isPlaying ? 'Tạm dừng playlist' : 'Tiếp tục playlist') : 'Phát playlist ngay'}" onclick="${activeSong ? 'toggleCurrentPlaylistPause()' : `userForcePlaySong('${first.id}')`}"><i class="fa-solid fa-${activeSong && state.isPlaying ? 'pause' : 'play'}"></i></button>
                    <button title="Di chuyển playlist lên" ${groupIndex <= 0 || activeSong ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                    <button title="Di chuyển playlist xuống" ${groupIndex >= groupCount - 1 || activeSong ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                    <button class="danger" title="Xóa toàn bộ playlist" onclick="skipEntirePlaylist('${requestId}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="playlist-group-toggle" ${options.forceExpanded ? '' : `role="button" tabindex="0" onclick="togglePlaylistGroup('${requestId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();togglePlaylistGroup('${requestId}')}"`}>
                <i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'}"></i>
                <span>${options.forceExpanded ? `${songs.length} video trong playlist` : (expanded ? 'Thu gọn danh sách' : `Xem thêm ${songs.length} video`)}</span>
            </div>
            <div class="playlist-group-tracks">
                ${expanded ? songs.map((song, index) => renderPlaylistTrackRow(song, index, songs.length, {
                    movableIndex: movableSongs.findIndex(item => String(item.id) === String(song.id)),
                    movableTotal: movableSongs.length,
                    completedOffset: completedCount
                })).join('') : ''}
            </div>
        </section>
    `;
}

function renderQueue() {
    const queueContainer = document.getElementById('queue-list-container');
    const queueCount = document.getElementById('queue-count');
    if (!queueContainer) return;
    if (queueCount) queueCount.textContent = state.queue.length;

    if (state.queue.length === 0) {
        queueContainer.innerHTML = '<div class="empty-queue-notice">Hàng đợi đang trống. Hãy dán link YouTube bài hát đầu tiên!</div>';
        return;
    }

    state.queue.forEach(song => {
        if ((song.type === 'youtube' || song.type === 'soundcloud') && !song.duration) resolveSongDuration(song);
        ensureDashboardChannelName(song);
    });

    const current = state.currentSong
        ? state.queue.find(song => String(song.id) === String(state.currentSong.id)) || state.currentSong
        : null;
    const allGroups = window.PlaylistQueueService
        ? window.PlaylistQueueService.group(state.queue, null)
        : state.queue.map(song => ({ type: song.playlistRequestId ? 'playlist' : 'song', playlistRequestId: song.playlistRequestId, songs: [song] }));
    const activePlaylistGroupIndex = current?.playlistRequestId
        ? allGroups.findIndex(group => group.type === 'playlist' && group.playlistRequestId === current.playlistRequestId)
        : -1;
    let activePlaylistGroup = activePlaylistGroupIndex >= 0 ? allGroups[activePlaylistGroupIndex] : null;
    if (current?.playlistRequestId) {
        const playlistSongs = activePlaylistGroup ? [...activePlaylistGroup.songs] : [];
        if (!playlistSongs.some(song => String(song.id) === String(current.id))) playlistSongs.unshift(current);
        activePlaylistGroup = {
            type: 'playlist',
            playlistRequestId: current.playlistRequestId,
            songs: playlistSongs
        };
    }
    const groups = allGroups.filter(group => !(activePlaylistGroup
        && group.type === 'playlist'
        && group.playlistRequestId === activePlaylistGroup.playlistRequestId)
        && !(current && group.type === 'song' && String(group.songs[0]?.id) === String(current.id)));
    const waitingCount = groups.reduce((sum, group) => sum + group.songs.length, 0);

    const currentSection = activePlaylistGroup
        ? `<div class="queue-section-label"><span>Đang phát</span></div>${renderPlaylistGroupV2(activePlaylistGroup, Math.max(0, activePlaylistGroupIndex), allGroups.length, { forceExpanded: true })}`
        : (current ? `<div class="queue-section-label"><span>Đang phát</span></div>${renderQueueSongCardV2(current, { isCurrent: true })}` : '');
    const waitingHtml = groups.map(group => group.type === 'playlist'
        ? renderPlaylistGroupV2(group, allGroups.indexOf(group), allGroups.length)
        : renderQueueSongCardV2(group.songs[0])).join('');
    const waitingSection = waitingHtml ? `
        <div class="queue-section-label queue-next-label"><span>Tiếp theo · ${waitingCount} video</span></div>
        <div class="queue-waiting-list">${waitingHtml}</div>
    ` : '';

    queueContainer.innerHTML = `
        ${currentSection}
        ${waitingSection}
    `;
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
function playNextInQueue(isAutomatic = false, preferredSong = null, previousSongOverride = null) {
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

    if (isAutomatic && state.luckyMode && state.luckyNextSong && !previousSongOverride?.playlistRequestId && !state.currentSong?.playlistRequestId) {
        const luckyIndex = state.queue.findIndex(s => String(s.id) === String(state.luckyNextSong.id));
        if (luckyIndex !== -1) {
            const targetSong = state.queue[luckyIndex];
            state.queue.splice(luckyIndex, 1);
            state.queue.unshift(targetSong);
            saveQueue();
            renderQueue();
        }
    }

    const previousSong = previousSongOverride || state.currentSong;
    let nextSong = preferredSong || getNextSong() || state.queue[0];
    if ((!preferredSong || previousSongOverride)
        && previousSong?.playlistRequestId
        && nextSong?.playlistRequestId === previousSong.playlistRequestId
        && window.PlaylistQueueService?.prioritizeActivePlaylist) {
        state.queue = window.PlaylistQueueService.prioritizeActivePlaylist(state.queue, previousSong);
        nextSong = state.queue.find(song => String(song.id) === String(nextSong.id)) || nextSong;
        saveQueue();
    }
    state.currentSong = nextSong;
    playSong(state.currentSong);
}

// --- GỬI LỆNH ĐIỀU KHIỂN SANG OBS OVERLAY ---
function sendControlCommand(type, value = null) {
    const cmdPayload = {
        type: type,
        value: value,
        timestamp: Date.now() + Math.random() // Đảm bảo sự kiện storage kích hoạt liên tục
    };
    
    logSystem(`[Điều khiển] Thực thi lệnh điều khiển trình phát: <strong>${type}</strong>${value !== null ? ` [Giá trị: ${value}]` : ''}`, 'system');
    
    publishMqtt('control_command', cmdPayload);
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

    // Chúng ta sẽ gọi notifyPlaybackState sau khi quyết định trạng thái (play/pause)


    const requestSequence = ++playSongRequestSequence;
    const requestedSongId = String(song.id);
    const requestedVideoId = String(song.videoId || '');
    const isLatestPlayRequest = () => requestSequence === playSongRequestSequence &&
        !!state.currentSong &&
        String(state.currentSong.id) === requestedSongId &&
        String(state.currentSong.videoId || '') === requestedVideoId;

    // Tự sửa các bài SoundCloud cũ đã lưu URL on.soundcloud.com trước khi phát.
    if (song.type === 'soundcloud' && song.soundcloudUrl) {
        const originalSoundCloudUrl = song.soundcloudUrl;
        const resolvedSoundCloudUrl = await resolveSoundcloudUrlIfNeeded(originalSoundCloudUrl);
        if (!isLatestPlayRequest()) return;
        if (resolvedSoundCloudUrl && resolvedSoundCloudUrl !== originalSoundCloudUrl) {
            song.soundcloudUrl = resolvedSoundCloudUrl;
            if (song.songLink === originalSoundCloudUrl) song.songLink = resolvedSoundCloudUrl;
            const queuedSong = state.queue.find(item => String(item.id) === requestedSongId);
            if (queuedSong) {
                queuedSong.soundcloudUrl = resolvedSoundCloudUrl;
                if (queuedSong.songLink === originalSoundCloudUrl) queuedSong.songLink = resolvedSoundCloudUrl;
            }
            state.currentSong = song;
            saveQueue();
            logSystem(`Đã phân giải link SoundCloud rút gọn: <strong>${resolvedSoundCloudUrl}</strong>`, 'system');
        }
    }

    state.lastSwitchTime = Date.now();
    state.currentSongPlaybackConfirmed = false;

    // Vote Skip Playlist chỉ sống trong đúng playlist đã mở. Khi chuyển sang
    // bài/playlist khác, hủy quỹ cũ để không chặn donate hoặc làm luồng phát treo.
    if (state.playlistVoteSkip?.active && song.playlistRequestId !== state.playlistVoteSkip.playlistRequestId) {
        state.playlistVoteSkip = null;
    }

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

        const shouldResume = await new Promise((resolve) => {
            promptResumePlayback(song, resolve);
        });
        if (!isLatestPlayRequest()) return;
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

    if (song.playlistTrackId && window.electronAPI?.markPlaylistTrackStarted) {
        if (song.playlistInterrupted) {
            delete song.playlistInterrupted;
            window.electronAPI?.resumePlaylist?.(song.playlistRequestId).catch(() => {});
        }
        window.electronAPI.markPlaylistTrackStarted(song.playlistTrackId).catch(error => {
            console.error('Không thể cập nhật trạng thái playlist track:', error);
        });
    }
    
    // Thu thập các đoạn SponsorBlock
    const skipSegments = await fetchSponsorBlockSegments(song.videoId);
    if (!isLatestPlayRequest()) return;
    state.skipSegments = skipSegments;

    // Tìm bài tiếp theo trong hàng đợi không trùng với bài đang chuẩn bị phát (hỗ trợ Lucky Mode)
    const nextSong = getNextSong();

    const payloadBuilder = window.overlaySongPayloadService
        || (window.overlaySongPayloadService = new window.OverlaySongPayloadService({ calculateMaxDuration: calculateMaxDurationForSong }));
    const payload = payloadBuilder.build(song, nextSong, state, {
        isResuming: needSeekAfterLoad,
        resumeFrom: startFrom
    });

    localStorage.setItem('dua_current_song', JSON.stringify(payload));
    
    // Realtime database broadcast
    publishMqtt('current_song', payload);

    // Lyrics tải bất đồng bộ sau khi player đã nhận bài. Metadata-only update
    // của cùng song id không tạo lại iframe/direct stream trên Overlay.
    loadSyncedLyricsForSong(song);

    // Send resume as an explicit one-shot player command. The payload position
    // still handles initial load; this command also reaches an existing player.
    if (needSeekAfterLoad) {
        sendControlCommand('resume', {
            songId: song.id,
            position: startFrom
        });
    }

    // Phát lệnh chạy nhạc hoặc tạm dừng nếu trình duyệt đang phát nhạc
    if (latestBrowserMediaState?.playing) {
        logSystem("Đã tải bài hát nhưng tạm dừng vì đang có nhạc trên trình duyệt. Nhấn Phát để tiếp tục.", "system");
        sendControlCommand('pause');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
    } else {
        sendControlCommand('play');
        state.isPlaying = true;
        updatePlayPauseButtonUI(true);
    }

    // Cập nhật lại hàng đợi để đồng bộ hiển thị bài đang phát
    renderQueue();
}

let lastNotifiedPlaybackState = null;
let lastNotifiedSongId = null;

// Cập nhật trạng thái nút Tạm dừng/Tiếp tục của Dashboard
function updatePlayPauseButtonUI(isPlaying) {
    getWindowsMediaService()?.updateMetadata?.(state.currentSong, isPlaying);
    
    const currentSongId = state.currentSong?.id || null;
    if (lastNotifiedPlaybackState !== isPlaying || lastNotifiedSongId !== currentSongId) {
        lastNotifiedPlaybackState = isPlaying;
        lastNotifiedSongId = currentSongId;
        if (window.electronAPI && typeof window.electronAPI.notifyPlaybackState === 'function') {
            window.electronAPI.notifyPlaybackState({ isPlaying: Boolean(isPlaying), song: state.currentSong });
        }
    }
    const waves = document.getElementById('music-waves');
    const playBtn = document.getElementById('btn-play-pause');
    if (isPlaying) {
        if (waves) waves.classList.remove('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        if (waves) waves.classList.add('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    const pausedBadge = document.getElementById('dashboard-paused-badge');
    if (pausedBadge) {
        pausedBadge.style.display = (!isPlaying && state.currentSong) ? 'inline-flex' : 'none';
    }
    if (!isPlaying) {
        setDashboardVideoLoading(false);
    }
    
    // Disable if controls are locked due to long-waiting auto pinned song playing
    const disabled = isControlsDisabled();
    if (playBtn) {
        playBtn.disabled = disabled;
        if (disabled) {
            playBtn.style.opacity = '0.5';
            playBtn.style.cursor = 'not-allowed';
            playBtn.title = "Không thể thao tác do bài hát đợi quá 75 phút đang phát";
        } else {
            playBtn.style.opacity = '';
            playBtn.style.cursor = '';
            playBtn.title = "Phát/Tạm dừng";
        }
    }
}
// --- THU THẬP PHÂN ĐOẠN QUẢNG CÁO TỪ SPONSORBLOCK ---
async function fetchSponsorBlockSegments(videoId) {
    logSystem(`Đang kiểm tra cơ sở dữ liệu SponsorBlock cho video ID: ${videoId}...`);
    try {
        const service = window.sponsorBlockService
            || (window.sponsorBlockService = new window.SponsorBlockService());
        const result = await service.fetchSegments(videoId);
        if (result.status === 'ok') {
            if (result.segments.length > 0) {
                logSystem(`SponsorBlock tìm thấy <strong>${result.segments.length}</strong> phân đoạn quảng cáo/giới thiệu!`, 'sponsorblock');
                result.segments.forEach(seg => {
                    logSystem(`- [${categoryLabels[seg.category] || seg.category}]: ${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s`, 'sponsorblock');
                });
            } else {
                logSystem(`SponsorBlock: Video sạch, không phát hiện quảng cáo/đoạn giới thiệu.`, 'sponsorblock');
            }
        } else if (result.status === 'not-found') {
            logSystem(`SponsorBlock: Không có dữ liệu phân đoạn quảng cáo cho video này.`, 'sponsorblock');
        } else {
            logSystem(`SponsorBlock API phản hồi với trạng thái: ${result.httpStatus}`, 'sponsorblock');
        }
        return result.segments;
    } catch (err) {
        console.error("SponsorBlock fetch error:", err);
        logSystem(`Không thể kết nối tới máy chủ SponsorBlock.`, 'system');
        return [];
    }
}

// --- GIÁM SÁT TIẾN TRÌNH & TỰ ĐỘNG BỎ QUA QUA SPONSORBLOCK ---
// --- KÍCH HOẠT PHÁT NHẠC KHI TRÌNH DUYỆT CHẶN ---
function resumeAutoplay() {
    document.getElementById('autoplay-blocker').style.display = 'none';
    sendControlCommand('play');
}

// --- THAY ĐỔI MỐC THỜI GIAN THEO THANH TRƯỢT (SEEK) ---
let currentOverlayDuration = 0;
let isDashboardSeeking = false;
let dashboardSeekUiLockUntil = 0;
let dashboardPendingSeekTarget = null;

function isDashboardSeekUiLocked() {
    return isDashboardSeeking
        || dashboardPendingSeekTarget !== null
        || Date.now() < dashboardSeekUiLockUntil;
}

function shouldIgnorePreSeekProgress(currentTime) {
    if (dashboardPendingSeekTarget === null) return false;
    const observed = Math.max(0, Number(currentTime) || 0);
    if (Math.abs(observed - dashboardPendingSeekTarget) <= 2.5) {
        dashboardPendingSeekTarget = null;
        dashboardSeekUiLockUntil = 0;
        return false;
    }
    if (Date.now() >= dashboardSeekUiLockUntil) {
        dashboardPendingSeekTarget = null;
        dashboardSeekUiLockUntil = 0;
        return false;
    }
    return true;
}

function onSeekSliderStart() {
    isDashboardSeeking = true;
}

function onSeekSliderChange(pct) {
    if (state.focusMode || isControlsDisabled()) return;
    isDashboardSeeking = true;
    const normalizedPct = Math.max(0, Math.min(100, Number(pct) || 0));
    const progressSlider = document.getElementById('progress-slider');
    if (progressSlider) {
        progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${normalizedPct}%, var(--pineapple-white) ${normalizedPct}%, var(--pineapple-white) 100%)`;
    }
    const currentTimeDisplay = document.getElementById('current-time-display');
    if (currentTimeDisplay && currentOverlayDuration > 0) {
        currentTimeDisplay.textContent = formatTime((normalizedPct / 100) * currentOverlayDuration);
    }
}

function onSeekSliderCommit(pct) {
    if (state.focusMode || isControlsDisabled() || currentOverlayDuration <= 0) {
        isDashboardSeeking = false;
        updatePlayerUI(state.currentSong);
        return;
    }
    const normalizedPct = Math.max(0, Math.min(100, Number(pct) || 0));
    let startPoint = 0;
    if (state.currentSong) {
        startPoint = state.currentSong.start || 0;
    }
    const seekToSeconds = startPoint + (normalizedPct / 100) * currentOverlayDuration;
    const relativeElapsed = (normalizedPct / 100) * currentOverlayDuration;
    isDashboardSeeking = false;
    dashboardPendingSeekTarget = seekToSeconds;
    dashboardSeekUiLockUntil = Date.now() + 5000;
    state.lastReportedTime = seekToSeconds;
    const success = attemptGlobalAction('seek', () => {
        sendControlCommand('seek', seekToSeconds);
        logSystem(`Tua bài nhạc tới: ${formatTime(relativeElapsed)}`);
    });
    if (!success) {
        dashboardPendingSeekTarget = null;
        dashboardSeekUiLockUntil = 0;
        updatePlayerUI(state.currentSong);
    }
}

function onSeekSliderCancel() {
    isDashboardSeeking = false;
    dashboardPendingSeekTarget = null;
    dashboardSeekUiLockUntil = 0;
    updatePlayerUI(state.currentSong);
}

// --- ĐIỀU CHỈNH ÂM LƯỢNG ---
function onVolumeChange(val) {
    if (state.focusMode) return;
    const targetVal = normalizeDashboardVolume(val, null);
    if (targetVal === null) return;

    if (state.adaptiveActive && targetVal > 0) {
        // Đang thích ứng âm lượng: Tính toán offset mới (tuning) thay vì thay đổi volume gốc
        const origVol = state.adaptiveOrigVolume;
        const currentLoudness = state.adaptiveLoudnessDb;

        if (origVol > 0 && currentLoudness !== null && currentLoudness !== undefined) {
            const multiplier = targetVal / origVol;
            let dbAdj = 20 * Math.log10(multiplier);
            if (isNaN(dbAdj) || !isFinite(dbAdj)) dbAdj = 0;

            // newOffset = loudnessDb + dbAdj
            let newOffset = currentLoudness + dbAdj;
            newOffset = Math.max(-15, Math.min(15, newOffset)); // Giới hạn từ -15 đến 15 dB

            localStorage.setItem('dua_adaptive_loudness_offset', newOffset);

            // Gửi offset mới sang overlay để áp dụng ngay lập tức cho bài hiện tại
            sendControlCommand('set_adaptive_offset', newOffset);

            // Cập nhật số hiển thị tạm thời
            document.getElementById('volume-val-display').textContent = targetVal + '%';

            // In log thông báo hệ thống
            if (window.lastAdaptiveOffsetLogTime === undefined || Date.now() - window.lastAdaptiveOffsetLogTime > 2000) {
                window.lastAdaptiveOffsetLogTime = Date.now();
                logSystem(`⚙️ [Âm lượng thích ứng] Đã ghi nhận gu âm thanh của bạn! Lưu offset mới: <strong>${newOffset.toFixed(1)} dB</strong>. Nhạc tiếp theo sẽ tự động thích ứng dựa trên mức điều chỉnh này.`, 'system');
            }
        }
    } else {
        // Trường hợp bình thường hoặc kéo về 0 (Mute): Cập nhật âm lượng gốc
        state.volume = targetVal;
        localStorage.setItem('dua_volume', targetVal);
        localStorage.setItem('dua_explicitly_muted', targetVal === 0 ? 'true' : 'false');
        if (targetVal > 0) {
            state.preMuteVolume = targetVal;
            localStorage.setItem('dua_pre_mute_volume', String(targetVal));
        }
        document.getElementById('volume-val-display').textContent = targetVal + '%';

        // Giữ payload bài hiện tại đồng nhất với volume vừa chỉnh. Không publish
        // current_song ở đây vì control_command đã đủ và tránh reload player;
        // lần publish payload kế tiếp sẽ không thể kéo Overlay về volume cũ.
        try {
            const currentPayloadRaw = localStorage.getItem('dua_current_song');
            if (currentPayloadRaw) {
                const currentPayload = JSON.parse(currentPayloadRaw);
                currentPayload.volume = state.volume;
                localStorage.setItem('dua_current_song', JSON.stringify(currentPayload));
            }
        } catch (_) { }
        
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

function getWindowsMediaService() {
    if (!window.windowsMediaService) {
        window.windowsMediaService = new (window.WindowsMediaService || function() {})( {
            onPlay: () => {
                if (state.currentSong) {
                    if (!state.isPlaying) togglePlayPause();
                } else if (state.queue && state.queue.length > 0) {
                    playNextInQueue();
                }
            },
            onPause: () => {
                if (state.isPlaying) togglePlayPause();
            },
            onNext: () => {
                skipSong(true);
            },
            onPrevious: () => {
                if (state.currentSong) {
                    sendControlCommand('seek', 0);
                }
            },
            onSeek: (details) => {
                if (details && typeof details.seekTime === 'number') {
                    sendControlCommand('seek', details.seekTime);
                }
            }
        });
        if (typeof window.windowsMediaService.initialize === 'function') {
            window.windowsMediaService.initialize();
        }

        if (window.electronAPI && typeof window.electronAPI.onMediaControlAction === 'function') {
            window.electronAPI.onMediaControlAction((action) => {
                if (typeof window.windowsMediaService?.handleMediaAction === 'function') {
                    window.windowsMediaService.handleMediaAction(action);
                }
            });
        }
    }
    return window.windowsMediaService;
}

// --- PHÁT / TẠM DỪNG BẰNG TAY ---
function getDashboardPlaybackController() {
    return window.dashboardPlaybackController
        || (window.dashboardPlaybackController = new window.PlaybackController({
            control: sendControlCommand,
            playNext: playNextInQueue,
            update: playing => {
                updatePlayPauseButtonUI(playing);
                renderQueue();
            }
        }));
}

function togglePlayPause() {
    if (state.focusMode || isControlsDisabled()) return;
    if (!state.currentSong) {
        if (state.queue.length > 0) {
            attemptGlobalAction('play', () => {
                playNextInQueue();
            });
        }
        return;
    }

    const action = state.isPlaying ? 'pause' : 'play';
    attemptGlobalAction(action, () => {
        const result = getDashboardPlaybackController().toggle(state);
        logSystem(result.playing ? "Tiếp tục trình phát nhạc (Overlay)." : "Tạm dừng trình phát nhạc (Overlay).");
    });
}

// --- SKIP BÀI (NEXT) ---
function skipSong(isManual = true, skipReasonOverride = null) {
    if (state.focusMode) return;
    if (isManual && isControlsDisabled()) return;
    if (!state.currentSong) return;

    if (!isManual && state.currentSong.voteSkipSuccess === true) {
        const now = Date.now();
        if (now < Number(state.automatedSkipBlockedUntil || 0)) {
            console.warn('Bỏ yêu cầu automated skip trùng trong cùng một lượt chuyển bài.');
            return;
        }
        state.automatedSkipBlockedUntil = now + 2500;
        // Overlay cũ từng phát một ended không có reason sau đếm ngược Vote Skip.
        // Chặn riêng dạng legacy này; ended chuẩn của Overlay mới vẫn được nhận.
        state.ignoreLegacyEndedUntil = now + 20000;
    }
    
    const skipAction = () => {
        const completedSong = state.currentSong;
        const nextSong = getNextSong();
        const skipReason = skipReasonOverride
            || (!isManual && completedSong?.voteSkipSuccess === true ? 'vote_skip' : 'skipped_by_streamer');
        finishPlaylistTrack(completedSong, 'skipped', skipReason);
        logSystem(`Bỏ qua bài hát: <strong>${completedSong.title}</strong>`);
        showDashboardSystemAlert("Bỏ qua bài hát", `Đã bỏ qua bài hát: <strong>${completedSong.title}</strong>`);
        removeSongFromQueue(completedSong.id, false);
        // Manual skip và Vote Skip dùng cùng một cơ chế chọn/phát bài tiếp theo.
        playNextInQueue(true, nextSong, completedSong);
    };

    if (isManual) {
        attemptGlobalAction('skip', skipAction);
    } else {
        skipAction();
    }
}

// --- HIỂN THỊ MENU CHUỘT PHẢI / CÔNG CỤ HÀNG ĐỢI ---
function showQueueToolsMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (window.electronAPI && typeof window.electronAPI.showQueueContextMenu === 'function') {
        window.electronAPI.showQueueContextMenu({
            luckyMode: !!state.luckyMode,
            sortConfig: state.sortConfig || 'time'
        });
    }
}

// --- FORCE PLAY (PHÁT NGAY LẬP TỨC MỘT BÀI TRONG QUEUE) ---
function forcePlaySong(songId) {
    if (state.focusMode) return;
    const songIndex = state.queue.findIndex(s => String(s.id) === String(songId));
    if (songIndex === -1) return;

    const targetSong = state.queue[songIndex];
    const targetPlaylistId = targetSong.playlistRequestId;
    const currentPlaylistId = state.currentSong?.playlistRequestId;

    // Lưu tiến trình bài đang phát nếu chuyển sang bài/playlist khác
    if (state.currentSong) {
        const currentSongInQueue = state.queue.find(s => String(s.id) === String(state.currentSong.id));
        if (currentSongInQueue) {
            const isSamePlaylist = targetPlaylistId && currentPlaylistId && targetPlaylistId === currentPlaylistId;
            if (!isSamePlaylist) {
                const duration = currentSongInQueue.duration || 0;
                const currentTime = state.lastReportedTime || 0;
                if (currentTime > 2 && (duration === 0 || currentTime < duration - 5)) {
                    currentSongInQueue.savedProgress = currentTime;
                    logSystem(`Đã lưu tiến trình bài hát "${currentSongInQueue.title}" tại ${formatTime(currentTime)}`, 'system');
                }
                if (currentSongInQueue.playlistRequestId) {
                    currentSongInQueue.playlistInterrupted = true;
                    window.electronAPI?.pausePlaylist?.(currentSongInQueue.playlistRequestId).catch(() => {});
                }
            }
        }
    }

    if (targetPlaylistId) {
        // Đưa toàn bộ playlist này lên đầu hàng đợi để các bài cùng nhóm nằm cạnh nhau
        if (window.PlaylistQueueService?.prioritizeActivePlaylist) {
            state.queue = window.PlaylistQueueService.prioritizeActivePlaylist(state.queue, targetSong);
        }
    } else {
        // Bài đơn lẻ (Standalone): đưa lên đầu hàng đợi
        const currentTargetIndex = state.queue.findIndex(s => String(s.id) === String(songId));
        if (currentTargetIndex !== -1) {
            const target = state.queue.splice(currentTargetIndex, 1)[0];
            state.queue.unshift(target);
        }
    }

    // Reset savedProgress cho targetSong nếu có (để tránh bị hỏi "Phát tiếp tục?")
    if (targetSong.savedProgress) {
        delete targetSong.savedProgress;
    }

    saveQueue();
    renderQueue();
    playNextInQueue(false, targetSong);
    
    logSystem(`Ép phát ngay lập tức bài hát: <strong>${targetSong.title}</strong>`, 'system');
}

// --- XÓA MỘT BÀI HÁT KHỎI HÀNG ĐỢI ---
function removeSongFromQueue(songId, refreshUI = true) {
    const isPlayingCurrent = state.currentSong && String(state.currentSong.id) === String(songId);
    const mutation = (window.queueMutationService ||= new window.QueueMutationService()).remove(state.queue, songId);
    const songToRemove = mutation.item;
    const nextSongBeforeRemoval = isPlayingCurrent ? getNextSong() : null;
    state.queue = mutation.queue;
    saveQueue();
    
    if (songToRemove && songToRemove.isZyPage) {
        console.info('[ZyPage End] Thùng rác yêu cầu kết thúc bài', summarizeZyPageSongForLog(songToRemove));
        sendZyPageSongEnd(songToRemove).catch(error => {
            console.error('[ZyPage End] Lỗi ngoài dự kiến khi xử lý nút thùng rác:', error);
        });
    }
    
    if (isPlayingCurrent) {
        state.currentSong = null;
        localStorage.removeItem('dua_current_song');
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
    } else {
        // Cập nhật lại nextSongTitle của bài hát đang phát nếu bài bị xoá nằm trong hàng đợi
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
    }

    if (refreshUI) {
        renderQueue();
        if (isPlayingCurrent) {
            playNextInQueue(true, nextSongBeforeRemoval, songToRemove);
        }
    }
}

function normalizeFancyText(str) {
    if (!str) return '';
    const ranges = [
        { start: 0x1D400, end: 0x1D419, base: 65 },  // Bold A-Z
        { start: 0x1D41A, end: 0x1D433, base: 97 },  // Bold a-z
        { start: 0x1D434, end: 0x1D44D, base: 65 },  // Italic A-Z
        { start: 0x1D44E, end: 0x1D467, base: 97 },  // Italic a-z
        { start: 0x1D468, end: 0x1D481, base: 65 },  // Bold Italic A-Z
        { start: 0x1D482, end: 0x1D49B, base: 97 },  // Bold Italic a-z
        { start: 0x1D49C, end: 0x1D4B5, base: 65 },  // Script A-Z
        { start: 0x1D4B6, end: 0x1D4CF, base: 97 },  // Script a-z
        { start: 0x1D4D0, end: 0x1D4E9, base: 65 },  // Bold Script A-Z
        { start: 0x1D4EA, end: 0x1D503, base: 97 },  // Bold Script a-z
        { start: 0x1D504, end: 0x1D51D, base: 65 },  // Fraktur A-Z
        { start: 0x1D51E, end: 0x1D537, base: 97 },  // Fraktur a-z
        { start: 0x1D538, end: 0x1D551, base: 65 },  // Double-struck A-Z
        { start: 0x1D552, end: 0x1D56B, base: 97 },  // Double-struck a-z
        { start: 0x1D56C, end: 0x1D585, base: 65 },  // Sans-serif A-Z
        { start: 0x1D586, end: 0x1D59F, base: 97 },  // Sans-serif a-z
        { start: 0x1D5A0, end: 0x1D5B9, base: 65 },  // Sans-serif Bold A-Z
        { start: 0x1D5BA, end: 0x1D5D3, base: 97 },  // Sans-serif Bold a-z
        { start: 0x1D5D4, end: 0x1D5ED, base: 65 },  // Sans-serif Italic A-Z
        { start: 0x1D5EE, end: 0x1D607, base: 97 },  // Sans-serif Italic a-z
        { start: 0x1D608, end: 0x1D621, base: 65 },  // Sans-serif Bold Italic A-Z
        { start: 0x1D622, end: 0x1D63B, base: 97 },  // Sans-serif Bold Italic a-z
        { start: 0x1D63C, end: 0x1D655, base: 65 },  // Sans-serif Bold Italic A-Z (Bổ sung)
        { start: 0x1D656, end: 0x1D66F, base: 97 },  // Sans-serif Bold Italic a-z (Bổ sung)
        { start: 0x1D670, end: 0x1D689, base: 65 },  // Monospace A-Z
        { start: 0x1D68A, end: 0x1D6A3, base: 97 },  // Monospace a-z
        
        { start: 0x1D7CE, end: 0x1D7D7, base: 48 },  // Bold 0-9
        { start: 0x1D7D8, end: 0x1D7E1, base: 48 },  // Double-struck 0-9
        { start: 0x1D7E2, end: 0x1D7EB, base: 48 },  // Sans-serif 0-9
        { start: 0x1D7EC, end: 0x1D7F5, base: 48 },  // Sans-serif Bold 0-9
        { start: 0x1D7F6, end: 0x1D7FF, base: 48 }   // Monospace 0-9
    ];

    const exceptions = {
        0x210E: 'h', 0x2102: 'C', 0x210D: 'H', 0x2115: 'N', 0x2119: 'P',
        0x211A: 'Q', 0x211D: 'R', 0x2124: 'Z', 0x212C: 'B', 0x2130: 'E',
        0x2131: 'F', 0x210B: 'H', 0x2110: 'I', 0x2112: 'L', 0x2133: 'M',
        0x211B: 'R', 0x212F: 'e', 0x210A: 'g', 0x2134: 'o'
    };

    let result = '';
    for (const char of str) {
        const cp = char.codePointAt(0);
        if (exceptions[cp]) {
            result += exceptions[cp];
            continue;
        }
        let matched = false;
        for (const r of ranges) {
            if (cp >= r.start && cp <= r.end) {
                const offset = cp - r.start;
                result += String.fromCharCode(r.base + offset);
                matched = true;
                break;
            }
        }
        if (!matched) {
            result += char;
        }
    }
    return result;
}

function insertSongSmartly(newSong) {
    if (!newSong) return false;
    if (newSong) {
        if (newSong.title) newSong.title = normalizeFancyText(newSong.title);
        if (newSong.donorName) newSong.donorName = normalizeFancyText(newSong.donorName);
        if (newSong.message) newSong.message = normalizeFancyText(newSong.message);
    }

    if (newSong.isZyPage && !newSong.isQuickAdd) {
        newSong.zypageSourceKeys = getZyPageSourceKeys(newSong);
        if (isZyPageSongEnded(newSong)) {
            logZyPageQueueDecision('SKIP_ENDED', newSong);
            logSystem(`Bo qua ban ghi ZyPage da ket thuc: <strong>${newSong.title || newSong.musicKey || newSong.id}</strong>`, 'system');
            return false;
        }

        // Day la diem khoa cuoi cung cho moi nguon (Firebase/API). Kiem tra tai
        // day lan nua sau cac await metadata de khong con cua so chen dong thoi.
        const duplicate = findDuplicateZyPageSong(newSong);
        if (duplicate) {
            logZyPageQueueDecision('SKIP_DUPLICATE', newSong, duplicate);
            mergeZyPageSourceKeys(duplicate, newSong);
            localStorage.setItem('dua_queue', JSON.stringify(state.queue));
            return false;
        }
    }

    state.queue = window.DashboardQueueService.insert(state.queue, newSong, {
        currentSong: state.currentSong,
        sortConfig: state.sortConfig
    });
    markQueueSongsAsNew(newSong);
    if (newSong.isZyPage) logZyPageQueueDecision('QUEUE_ADD', newSong);
    return true;
}

// --- DỊCH CHUYỂN BÀI HÁT LÊN TRONG HÀNG ĐỢI ---
function moveQueueItemUp(songId) {
    if (state.focusMode || isControlsDisabled()) return;
    const result = (window.queueMutationService ||= new window.QueueMutationService()).move(state.queue, songId, -1, { hasCurrent: Boolean(state.currentSong) });
    if (result.changed) {
        state.queue = result.queue;
        const temp = result.item;
        
        saveQueue();
        renderQueue();
        logSystem(`Đã đẩy bài hát lên trước: <strong>${temp.title}</strong>`);

        // Cập nhật lại nextSongTitle của bài hát đang phát
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
        
        // Nếu chuyển lên đầu hàng đợi và hiện tại không có bài nào phát, kích hoạt phát
        if (result.index === 0 && !state.currentSong && !state.focusMode) {
            playNextInQueue();
        }
    }
}

// --- DỊCH CHUYỂN BÀI HÁT XUỐNG TRONG HÀNG ĐỢI ---
function moveQueueItemDown(songId) {
    if (state.focusMode || isControlsDisabled()) return;
    const result = (window.queueMutationService ||= new window.QueueMutationService()).move(state.queue, songId, 1, { hasCurrent: Boolean(state.currentSong) });
    if (result.changed) {
        state.queue = result.queue;
        const temp = result.item;
        
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
    if (isControlsDisabled()) {
        logSystem("Không thể ghim/bỏ ghim khi đang phát bài hát đợi lâu!", "system");
        showDashboardSystemAlert("Thao tác bị khóa", "Không thể ghim/bỏ ghim khi đang phát bài đợi lâu");
        return;
    }
    const result = (window.queueMutationService ||= new window.QueueMutationService()).togglePin(state.queue, songId);
    if (!result.changed) return;
    state.queue = result.queue;
    const song = result.item;

    logSystem(`Đã ${song.isPinned ? 'ghim' : 'bỏ ghim'} bài hát: <strong>${song.title}</strong>`);
    
    // Sắp xếp lại hàng đợi để đưa bài ghim lên trên
    sortAndRefreshQueue(true);
}
window.togglePinQueueItem = togglePinQueueItem;

// --- CẬP NHẬT GIAO DIỆN KHI CÓ BÀI MỚI / DỪNG ---
function setDashboardVideoLoading(isLoading) {
    const element = document.getElementById('dashboard-video-loading');
    const pausedBadge = document.getElementById('dashboard-paused-badge');
    if (!element) return;
    const shouldShowLoading = Boolean(isLoading && state.isPlaying);
    element.hidden = !shouldShowLoading;
    if (pausedBadge) {
        pausedBadge.style.display = (!state.isPlaying && state.currentSong && !shouldShowLoading) ? 'inline-flex' : 'none';
    }
}

function updatePlayerUI(song) {
    const cover = document.getElementById('current-song-cover');
    const title = document.getElementById('current-song-title');
    const donorSection = document.getElementById('current-song-donor');
    const messageSection = document.getElementById('current-song-message');
    const coverWrapper = document.getElementById('song-cover-wrapper');
    const slider = document.getElementById('progress-slider');
    const separator = document.getElementById('progress-separator');

    if (!song) {
        clearDashboardLyrics();
        setDashboardVideoLoading(false);
        const pausedBadge = document.getElementById('dashboard-paused-badge');
        if (pausedBadge) pausedBadge.style.display = 'none';
        const directStreamBadge = document.getElementById('direct-stream-badge');
        if (directStreamBadge) directStreamBadge.style.display = 'none';

        updateDashboardChannelUI(null);

        cover.src = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
        title.textContent = "Chưa có bài hát nào";
        const playlistIconEl = document.getElementById('current-song-playlist-icon');
        if (playlistIconEl) playlistIconEl.style.display = 'none';
        const lyricsIconEl = document.getElementById('btn-toggle-lyrics-visibility');
        if (lyricsIconEl) lyricsIconEl.style.display = 'none';
        donorSection.style.display = 'none';
        getWindowsMediaService()?.updateMetadata?.(null, false);
        messageSection.style.display = 'none';
        coverWrapper.classList.remove('spinning');
        if (slider) {
            slider.value = 0;
            slider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-white) 0%)`;
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
        
        // Hide player favorite button when no song is loaded
        const favBtn = document.getElementById('btn-player-favorite');
        if (favBtn) favBtn.style.display = 'none';

        return;
    }

    updateDashboardLyrics(song.lyrics, state.lastReportedTime || 0);

    setDashboardVideoLoading(Boolean(state.isPlaying && state.currentSongPlaybackConfirmed === false));
    const pausedBadge = document.getElementById('dashboard-paused-badge');
    if (pausedBadge) {
        pausedBadge.style.display = (!state.isPlaying && state.currentSong) ? 'inline-flex' : 'none';
    }
 
    cover.src = song.thumbnail;
    
    let currentSongUrl = '#';
    if (song.type === 'youtube' && song.videoId) {
        currentSongUrl = `https://www.youtube.com/watch?v=${song.videoId}`;
    } else if (song.type === 'soundcloud' && song.soundcloudUrl) {
        currentSongUrl = song.soundcloudUrl;
    } else if (song.songLink) {
        currentSongUrl = song.songLink;
    } else if (song.videoId) {
        currentSongUrl = `https://www.youtube.com/watch?v=${song.videoId}`;
    }

    const isPlaylist = Boolean(song.playlistRequestId || song.isPlaylistTrack || song.playlistTrackId);
    const playlistIconEl = document.getElementById('current-song-playlist-icon');
    if (playlistIconEl) playlistIconEl.style.display = isPlaylist ? 'inline-flex' : 'none';
    const lyricsIconEl = document.getElementById('btn-toggle-lyrics-visibility');
    if (lyricsIconEl) {
        lyricsIconEl.style.display = Boolean(song.lyrics?.available && song.lyrics.lines?.length) ? 'inline-flex' : 'none';
        const isEnabled = localStorage.getItem('dua_lyrics_enabled') !== 'false';
        if (isEnabled) {
            lyricsIconEl.classList.add('dua-btn-primary');
            lyricsIconEl.classList.remove('dua-btn-secondary');
        } else {
            lyricsIconEl.classList.add('dua-btn-secondary');
            lyricsIconEl.classList.remove('dua-btn-primary');
        }
    }
    getWindowsMediaService()?.updateMetadata?.(song, state.isPlaying);

    if (currentSongUrl && currentSongUrl !== '#') {
        title.innerHTML = `<a href="${currentSongUrl}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bài hát trên trình duyệt mặc định" onclick="openExternalLink(event, '${currentSongUrl}')">${song.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.72rem; margin-left: 0.25rem; opacity: 0.6;"></i></a>`;
    } else {
        title.textContent = song.title;
    }

    if (song.authorVideoId && String(song.authorVideoId) !== String(song.videoId || '')) {
        song.author = '';
        song.authorVideoId = '';
    }
    updateDashboardChannelUI(song);
    ensureDashboardChannelName(song, true);

    // Show player favorite button and sync state
    const favBtn = document.getElementById('btn-player-favorite');
    if (favBtn) {
        favBtn.style.display = 'inline-flex';
        const isFav = isFavorite(song);
        const icon = favBtn.querySelector('i');
        if (icon) {
            icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            icon.style.color = isFav ? '#EF4444' : '';
        }
        favBtn.title = isFav ? 'Bỏ yêu thích' : 'Yêu thích';
    }
    
    const directStreamBadge = document.getElementById('direct-stream-badge');
    if (directStreamBadge) directStreamBadge.style.display = 'none';
    
    if (song.isOwnerAdd) {
        donorSection.innerHTML = `<i class="fa-solid fa-user-shield"></i> <span id="current-donor-name">Chủ kênh thêm</span>`;
    } else {
        donorSection.innerHTML = `<span id="current-donor-name">${song.donorName}</span><span id="current-donor-amount">${song.amount.toLocaleString('vi-VN')} VNĐ</span>`;
    }
    donorSection.style.display = 'flex';

    if (song.message) {
        messageSection.textContent = `"${song.message}"`;
        messageSection.style.display = 'block';
    } else {
        messageSection.style.display = 'none';
    }

    coverWrapper.classList.add('spinning');
    
    // Đã xóa bỏ chức năng cảnh báo nội dung nhạy cảm
    const warningEl = document.getElementById('dash-sensitive-warning');
    if (warningEl) warningEl.classList.remove('visible');
    
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
                            publishMqtt('current_song', payload);
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

    const disabled = isControlsDisabled();
    const skipBtn = document.getElementById('btn-skip');
    if (skipBtn) {
        skipBtn.disabled = disabled;
        if (disabled) {
            skipBtn.style.opacity = '0.5';
            skipBtn.style.cursor = 'not-allowed';
            skipBtn.title = "Không thể thao tác do bài hát đợi quá 75 phút đang phát";
        } else {
            skipBtn.style.opacity = '';
            skipBtn.style.cursor = '';
            skipBtn.title = "Bỏ qua";
        }
    }

    const progressSlider = document.getElementById('progress-slider');
    if (progressSlider) {
        progressSlider.disabled = disabled;
        if (disabled) {
            progressSlider.style.cursor = 'not-allowed';
            progressSlider.title = "Không thể tua do bài hát đợi quá 75 phút đang phát";
        } else {
            progressSlider.style.cursor = '';
            progressSlider.title = "";
        }
    }

    updateBypassButtonUI();
    updateForceExtensionButtonUI();
    updateVoteSkipButtonUI();
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

    // toggleContentProtection is no longer supported
}

// --- CHUYỂN ĐỔI PHÂN KHU CẤU HÌNH (SUB-TABS SETTINGS) ---
function switchSettingsSection(sectionId) {
    const sections = document.querySelectorAll('.settings-section');
    const buttons = document.querySelectorAll('.settings-tab-btn');
    const sectionTitles = {
        sync: 'Đồng bộ ZyPage',
        youtube: 'Đồng bộ YouTube',
        playback: 'Phát lại',
        limits: 'Giới hạn thời gian',
        filters: 'SponsorBlock',
        playlist: 'YouTube Playlist',
        overlay: 'Giao diện và OBS',
        logs: 'Trạng thái và nhật ký',
        about: 'Giới thiệu'
    };
    
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
            btn.setAttribute('aria-current', 'page');
        } else {
            btn.classList.remove('active');
            btn.removeAttribute('aria-current');
        }
    });

    const panelTitle = document.getElementById('settings-panel-title');
    if (panelTitle) panelTitle.textContent = sectionTitles[sectionId] || sectionTitles.sync;
}

function getDashboardSettingsService() {
    if (!window.dashboardSettingsService) {
        window.dashboardSettingsService = new window.DashboardSettingsService({
            storage: localStorage,
            systemDark: () => window.matchMedia('(prefers-color-scheme: dark)').matches
        });
    }
    return window.dashboardSettingsService;
}

function changeDarkModeSetting(val) {
    getDashboardSettingsService().setDarkMode(val);
    applyDarkModeState();
}

function applyDarkModeState() {
    const { setting, isDark } = getDashboardSettingsService().resolveDarkMode();
    
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    const selectEl = document.getElementById('dark-mode-select');
    if (selectEl) {
        selectEl.value = setting;
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
    const setting = getDashboardSettingsService().get('dua_dark_mode', 'light');
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
    state.focusMode = getDashboardSettingsService().setFocusMode(enabled);
    publishMqtt('focus_mode', { value: enabled });
    
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

function toggleDashboardLyricsVisibility() {
    const isCurrentlyEnabled = localStorage.getItem('dua_lyrics_enabled') !== 'false';
    const newState = !isCurrentlyEnabled;
    localStorage.setItem('dua_lyrics_enabled', newState ? 'true' : 'false');
    publishMqtt('lyrics_config', { enabled: newState });
    logSystem(`🔧 <strong>[Lời bài hát]</strong> Đã ${newState ? 'BẬT' : 'TẮT'} lời bài hát đồng bộ (Synced Lyrics).`, 'system');
    showDashboardSystemAlert("Lời bài hát", `Đã ${newState ? 'bật' : 'tắt'} hiển thị lời bài hát.`);

    const btn = document.getElementById('btn-toggle-lyrics-visibility');
    if (btn) {
        if (newState) {
            btn.classList.add('dua-btn-primary');
            btn.classList.remove('dua-btn-secondary');
        } else {
            btn.classList.add('dua-btn-secondary');
            btn.classList.remove('dua-btn-primary');
        }
    }

    const settingsToggle = document.getElementById('lyrics-enabled-toggle');
    if (settingsToggle) {
        settingsToggle.checked = newState;
    }

    if (!newState) {
        clearDashboardLyrics();
    } else if (state?.currentSong) {
        if (state.currentSong.lyrics?.available) {
            updateDashboardLyrics(state.currentSong.lyrics, state.lastReportedTime || 0);
        } else {
            loadSyncedLyricsForSong(state.currentSong);
        }
    }
}
window.toggleDashboardLyricsVisibility = toggleDashboardLyricsVisibility;

// --- BẬT / TẮT CHẾ ĐỘ LUCKY (QUAY NHẠC NGẪU NHIÊN) ---
function toggleLuckyMode(enabled) {
    state.luckyMode = getDashboardSettingsService().setLuckyMode(enabled);
    publishMqtt('lucky_mode', { value: enabled });
    
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
            publishMqtt('current_song', payload);
        } catch(e) {}
    }
    
    updateForceExtensionButtonUI();
    updatePlayerUI(state.currentSong);
    logSystem(`${state.currentSong.extensionForceShow ? '🔔 Đã hiển thị' : '🔕 Đã ẩn'} mã gia hạn trên Overlay.`);
}

// --- HIỂN THỊ THÔNG BÁO DONATE MỚI TRÊN DASHBOARD ---
let dbAlertTimeout = null;
function showDashboardNewDonationAlert(alertData) {
    const alertBox = document.getElementById('db-alert-box');
    if (!alertBox) return;
    
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
    
    if (dbAlertTimeout) clearTimeout(dbAlertTimeout);
    dbAlertTimeout = setTimeout(() => {
        alertBox.classList.remove('active');
    }, 6000);
}

function closeDashboardAlert() {
    const alertBox = document.getElementById('db-alert-box');
    if (alertBox) {
        alertBox.classList.remove('active');
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

function getDashboardNotificationService() {
    if (!window.dashboardNotificationService) {
        window.dashboardNotificationService = new window.DashboardNotificationService({ storage: localStorage });
    }
    return window.dashboardNotificationService;
}

function syncDashboardNotificationState() {
    const snapshot = getDashboardNotificationService().snapshot();
    state.notifications = snapshot.items;
    state.unreadNotificationsCount = snapshot.unreadCount;
}

function loadNotificationsHistory() {
    getDashboardNotificationService().load();
    syncDashboardNotificationState();
    updateNotificationBadge();
    renderNotificationsList();
}

function saveNotificationsHistory() {
    const service = getDashboardNotificationService();
    service.items = state.notifications;
    service.unreadCount = state.unreadNotificationsCount;
    service.save();
}

function saveToNotificationHistory(notif) {
    // Thêm trường unread
    getDashboardNotificationService().add(notif);
    syncDashboardNotificationState();
    
    // Giới hạn tối đa 30 thông báo trong lịch sử
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
                ${notif.message ? `<div class="notification-item-msg">${escapeDashboardHtml(notif.message)}</div>` : ''}
                <div class="notification-item-footer">
                    <span class="notification-item-badge">${notif.position}</span>
                    <span class="notification-item-time">${timeStr}</span>
                </div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            if (notif.unread) {
                getDashboardNotificationService().markRead(notif);
                syncDashboardNotificationState();
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
        getDashboardNotificationService().markAllRead();
        syncDashboardNotificationState();
        updateNotificationBadge();
        renderNotificationsList();
    } else {
        dropdown.classList.remove('visible');
    }
}

function clearNotificationHistory(event) {
    if (event) event.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo?")) return;
    
    getDashboardNotificationService().clear();
    syncDashboardNotificationState();
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

    if (dbSysAlertTimeout) clearTimeout(dbSysAlertTimeout);
    dbSysAlertTimeout = setTimeout(() => {
        alertBox.classList.remove('active');
    }, 4500);
}

function closeDashboardSystemAlert() {
    const alertBox = document.getElementById('db-system-alert-box');
    if (alertBox) {
        alertBox.classList.remove('active');
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

// --- CHUYỂN ĐỔI CHUỖI THỜI LƯỢNG (HH:MM:SS HOẶC MM:SS) SANG GIÂY ---
function parseDurationToSeconds(duration) {
    return getMediaParserService().parseDurationToSeconds(duration);
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
    callback();
    return true;
}

function userRemoveSongFromQueue(songId) {
    if (state.focusMode) return;
    attemptGlobalAction('delete', () => {
        const song = state.queue.find(item => String(item.id) === String(songId));
        finishPlaylistTrack(song, 'skipped', 'removed_from_queue');
        removeSongFromQueue(songId, true);
    });
}

function userForcePlaySong(songId) {
    if (state.focusMode) return;
    attemptGlobalAction('force_play', () => {
        forcePlaySong(songId);
    });
}

window.userRemoveSongFromQueue = userRemoveSongFromQueue;
window.userForcePlaySong = userForcePlaySong;

async function resolveZyPageSongEndKeysFromSnapshot(song) {
    if (!song || !state.zypageShopId) return [];
    try {
        const snapshotService = getZyPageSyncOrchestrator()?.snapshotService;
        if (!snapshotService?.fetchSnapshot) return [];
        const snapshot = await snapshotService.fetchSnapshot({
            domain: state.zypageDomain,
            shopId: state.zypageShopId
        });
        const songTransactionTime = normalizeOptionalTimestamp(song.zypageTransactionTime);
        const matches = Object.entries(snapshot.musicList || {}).filter(([key, item]) => {
            const itemVideoId = String(item?.music?.id || '').trim();
            if (!itemVideoId || itemVideoId !== String(song.videoId || '').trim()) return false;
            if (Number(item?.order?.amount || 0) !== Number(song.amount || 0)) return false;
            if (normalizeZyPageDonor(item?.order?.name) !== normalizeZyPageDonor(song.donorName)) return false;
            const itemTransactionTime = normalizeOptionalTimestamp(item?.order?.time || item?.music?.key || key);
            return !songTransactionTime || !itemTransactionTime
                || Math.abs(songTransactionTime - itemTransactionTime) <= 2000;
        });
        return [...new Set(matches.flatMap(([key, item]) => [item?.music?.key, key])
            .map(normalizeZyPageKey).filter(Boolean))];
    } catch (error) {
        console.warn('[ZyPage End] Không thể đối chiếu music_key từ snapshot:', error);
        return [];
    }
}

// --- BÁO CÁO KẾT THÚC BÀI LÊN MÁY CHỦ ZYPAGE ĐỂ TRÔI BÀI ---
async function sendZyPageSongEnd(song) {
    const requestId = `end_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const musicKeyCandidates = [...new Set([
        song?.musicKey,
        ...(Array.isArray(song?.zypageSourceKeys) ? song.zypageSourceKeys : []),
        song?.id
    ].map(normalizeZyPageKey).filter(Boolean))];
    const musicKey = musicKeyCandidates[0] || '';
    const debugInfo = {
        requestId,
        songId: song?.id ?? null,
        musicKey: musicKey || null,
        musicKeyCandidates,
        title: song?.title || '',
        shopId: state.zypageShopId || null,
        domain: state.zypageDomain || null,
        hasToken: Boolean(state.zypageToken),
        ipcAvailable: typeof window.electronAPI?.sendZyPageSongEnd === 'function'
    };
    console.groupCollapsed(`%c[ZyPage End] ${requestId} · ${song?.title || musicKey || 'Không rõ bài'}`, 'color:#16845b;font-weight:700');
    console.log('Chuẩn bị gửi:', debugInfo);

    const missing = [];
    if (!state.zypageShopId) missing.push('shop_id');
    if (!state.zypageToken) missing.push('shop_token');
    if (!musicKey) missing.push('music_key');
    if (typeof window.electronAPI?.sendZyPageSongEnd !== 'function') missing.push('ipc');
    if (missing.length > 0) {
        const result = { success: false, reason: `missing_${missing.join('_')}`, requestId };
        console.error('Không gửi được lệnh vì thiếu:', missing);
        console.log('Kết quả:', result);
        console.groupEnd();
        logSystem(`⚠️ Không thể kết thúc bài trên ZyPage: thiếu ${missing.join(', ')}.`, 'system');
        return result;
    }

    logSystem(`Đang báo cáo kết thúc bài lên ZyPage để trôi bài: <strong>${song.title}</strong>...`, 'system');
    const service = window.zypageSongEndService
        || (window.zypageSongEndService = new window.ZyPageSongEndService({
            transport: request => window.electronAPI?.sendZyPageSongEnd?.({
                domain: state.zypageDomain,
                shopId: request.body.get('shop_id'),
                token: request.body.get('shop_token'),
                musicKey: request.musicKey,
                videoId: request.videoId,
                donorName: request.donorName,
                amount: request.amount,
                transactionTime: request.transactionTime,
                pathType: state.zypagePathType
            })
        }));
    try {
        console.log('Đang gửi một lệnh donate_music_end qua main process...');
        let result = null;
        let attemptedMusicKey = musicKey;
        for (const candidate of musicKeyCandidates) {
            attemptedMusicKey = candidate;
            result = await service.send({
                domain: state.zypageDomain,
                shopId: state.zypageShopId,
                token: state.zypageToken,
                musicKey: candidate,
                videoId: song?.videoId,
                donorName: song?.donorName,
                amount: song?.amount,
                transactionTime: song?.zypageTransactionTime
            });
            if (result.success || result.reason !== 'invalid_music_key') break;
            console.warn(`[ZyPage End] music_key ${candidate} không hợp lệ; đang thử khóa nguồn tiếp theo.`);
        }
        if (result?.reason === 'invalid_music_key') {
            const snapshotCandidates = await resolveZyPageSongEndKeysFromSnapshot(song);
            for (const candidate of snapshotCandidates) {
                if (musicKeyCandidates.includes(candidate)) continue;
                attemptedMusicKey = candidate;
                console.warn(`[ZyPage End] Thử music_key ${candidate} đã đối chiếu từ snapshot hiện tại.`);
                result = await service.send({
                    domain: state.zypageDomain,
                    shopId: state.zypageShopId,
                    token: state.zypageToken,
                    musicKey: candidate,
                    videoId: song?.videoId,
                    donorName: song?.donorName,
                    amount: song?.amount,
                    transactionTime: song?.zypageTransactionTime
                });
                if (result.success || result.reason !== 'invalid_music_key') break;
            }
        }
        result ||= { success: false, reason: 'invalid_music_key' };
        const loggedResult = { ...result, requestId };
        loggedResult.musicKey = attemptedMusicKey;
        console.log('Phản hồi ZyPage:', loggedResult);
        if (result.success) {
            markZyPageSongAsEnded(song);
            console.info('[ZyPage End] Thành công; đã đánh dấu transaction kết thúc.');
            logSystem(`Đã gửi yêu cầu trôi bài lên ZyPage.`, 'system');
        } else if (result.reason === 'duplicate') {
            console.warn('[ZyPage End] Bỏ qua vì music_key này đã được gửi thành công trước đó.');
        } else {
            console.error(`[ZyPage End] Thất bại: ${result.reason || 'unknown'}`);
            logSystem(`⚠️ Không thể kết thúc bài trên ZyPage (${result.reason || 'unknown'}).`, 'system');
        }
        console.groupEnd();
        return loggedResult;
    } catch (error) {
        console.error('[ZyPage End] Exception:', error);
        console.groupEnd();
        logSystem(`⚠️ Lỗi gửi kết thúc bài lên ZyPage: ${escapeDashboardHtml(error.message || String(error))}.`, 'system');
        return { success: false, reason: 'exception', requestId, error: error.message || String(error) };
    }
}

// =========================================================================
// --- PHẦN PHÁT TRIỂN THÊM: KẾT NỐI LIVE ZYPAGE & LẮNG NGHE FIREBASE ---
// =========================================================================

// --- HÀM TRUY VẤN QUA PROXY CORS CÓ FALLBACK TRÁNH LỖI TIMEOUT ---
async function fetchWithCorsProxy(url) {
    const service = new window.ZyPageConnectionService({ fetchImpl: window.fetch.bind(window) });
    return service.fetchPage(url);
}

// Hàm bóc tách Domain và Token từ URL hoặc text
function extractZyPageDomainAndToken(input) {
    return window.ZyPageConnectionService.parseConnectionInput(input);
}

// ==========================================
// QUẢN LÝ LỜI NHẮN DONATE & LỊCH SỬ 7 NGÀY
// ==========================================
let donationMessageLinkService = null;

function getDonationMessageLinkService() {
    return donationMessageLinkService || (donationMessageLinkService = new window.DonationMessageLinkService({
        parseYoutubeId
    }));
}

function hasSongLink(message) {
    return getDonationMessageLinkService().hasSongLink(message);
}

function formatMessageWithLinks(msg, donorName, donorAmount) {
    return getDonationMessageLinkService().formatMessageWithLinks(msg, donorName, donorAmount);
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
            spotifyId: null,
            soundcloudUrl: scUrl || null,
            title: meta.title,
            thumbnail: meta.thumbnail,
            author: meta.author || '',
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

function getDonationHistoryService() {
    return window.dashboardDonationHistoryService
        || (window.dashboardDonationHistoryService = new window.DashboardDonationHistoryService({
            api: window.electronAPI,
            storage: localStorage
        }));
}

async function handleNewDonation(donation, shouldAlert = true) {
    if (!donation || !donation.name) return;
    
    // Normalize fancy fonts in name and message
    donation.name = normalizeFancyText(donation.name);
    if (donation.message) {
        donation.message = normalizeFancyText(donation.message);
    }
    
    const result = await getDonationHistoryService().add(donation);
    if (!result?.success) return;
    if (result.updated) await renderDonationHistory();
    if (!result.inserted) return;
    
    // Gửi thông báo Taskbar phi tập trung (cho màn hình phụ / không ảnh hưởng game)
    const isStartupSync = (Date.now() - appStartTime) < 5000;
    const isTestDonate = donation.id && donation.id.toString().includes('test_donate');
    
    const taskbarService = window.taskbarNotificationService
        || (window.taskbarNotificationService = new window.TaskbarNotificationService({
            show: (title, message, darkMode) => window.electronAPI?.showTaskbarNotification?.(title, message, darkMode),
            hasSongLink,
            parseYoutubeId,
            fetchMetadata: fetchSongMetadata,
            isDark: () => document.body.classList.contains('dark-mode')
        }));
    await taskbarService.notify(donation, {
        shouldAlert,
        isStartupSync,
        isTestDonate,
        minimumAmount: state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000,
        currentSong: state.currentSong
    });
    
    // Chỉ kích hoạt thông báo góc trên Dashboard nếu rất mới và được yêu cầu (hoặc test donate)
    const isVeryRecent = Math.abs(Date.now() - donation.timestamp) < 120000;
    if (shouldAlert && (isVeryRecent || isTestDonate)) {
        const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
        const hasLink = hasSongLink(donation.message);
        const isPlaylist = donation.isPlaylistDonation === true;
        const willBeSong = (donation.isMusicOrder || (hasLink && (donation.amount === 0 || donation.amount >= minAmount)));
        
        if (isPlaylist) {
            broadcastNewDonationAlert({
                id: donation.id,
                donorName: donation.name,
                amount: donation.amount,
                title: donation.playlistTitle || 'YouTube Playlist',
                message: donation.message || '',
                thumbnail: donation.playlistThumbnail || '',
                type: 'youtube',
                isPlaylistDonation: true,
                playlistRequestId: donation.playlistRequestId || '',
                playlistTitle: donation.playlistTitle || 'YouTube Playlist',
                playlistTotalTracks: Number(donation.playlistTotalTracks || 0)
            });
        } else if (!willBeSong) {
            showDashboardNewDonationAlert({
                id: donation.id,
                donorName: String(donation.name || 'Khách').trim(),
                amount: Number(donation.amount) || 0,
                title: String(donation.message || '(Không có lời nhắn)').trim(),
                position: 'DONATE',
                timestamp: donation.timestamp
            });
        }
    }
    renderDonationHistory();
}

async function migrateDonationHistoryToSqlite() {
    try {
        const result = await getDonationHistoryService().migrate();
        if (result.migrated) console.log(`Migration to SQLite completed: ${result.count} donations.`);
    } catch (error) {
        console.error('Failed to migrate donation history to SQLite:', error);
    }
}

async function getDonationHistory() {
    return getDonationHistoryService().list();
}

function saveDonationHistory(history) {
    getDonationHistoryService().writeLocal(history);
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
    return getDonationMessageLinkService().extractSongLink(msg);
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

const DONATION_HISTORY_VIEW_KEY = 'dua_donation_history_view';
let currentDonationSearchQuery = '';
let currentDonationHistoryView = (() => {
    try {
        return localStorage.getItem(DONATION_HISTORY_VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch (_) {
        return 'grid';
    }
})();

function applyDonationHistoryView() {
    const container = document.getElementById('donation-history-list');
    if (container) {
        container.classList.toggle('view-grid', currentDonationHistoryView === 'grid');
        container.classList.toggle('view-list', currentDonationHistoryView === 'list');
    }

    ['grid', 'list'].forEach(view => {
        const button = document.getElementById(`donation-view-${view}`);
        if (!button) return;
        const isActive = currentDonationHistoryView === view;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function setDonationHistoryView(view) {
    currentDonationHistoryView = view === 'list' ? 'list' : 'grid';
    try {
        localStorage.setItem(DONATION_HISTORY_VIEW_KEY, currentDonationHistoryView);
    } catch (_) {}
    applyDonationHistoryView();
}
window.setDonationHistoryView = setDonationHistoryView;

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
    applyDonationHistoryView();
    
    const fullHistory = await getDonationHistory();
    const totalRevenue = fullHistory.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalCount = fullHistory.length;
    
    const statsLine = document.getElementById('donation-stats-line');
    if (statsLine) {
        statsLine.textContent = `${totalCount} lượt donate`;
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
            if (songLink) {
                cardEl.classList.add('has-song-attachment');
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
                                <div class="song-attachment-title" title="${meta.title}">
                                    <a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bài hát trên trình duyệt mặc định" onclick="openExternalLink(event, '${songLink}')">
                                        ${meta.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem; opacity: 0.6;"></i>
                                    </a>
                                </div>
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
                songTitleHtml = `<div style="font-size: 0.85rem; font-weight: 800; color: var(--pineapple-orange-dark, #D97706); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${meta.title}"><a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bài hát trên trình duyệt mặc định" onclick="openExternalLink(event, '${songLink}')">${meta.title}</a></div>`;
            } else {
                songTitleHtml = `<div style="font-size: 0.85rem; font-weight: 800; color: var(--pineapple-orange-dark, #D97706); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Đang tải tên bài hát...</div>`;
            }
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'recent-donation-item';
        itemEl.style.cssText = 'background: transparent; border: 1px solid var(--pineapple-border-color); border-radius: 12px; padding: 0.6rem 0.8rem; box-shadow: none; display: flex; flex-direction: column; gap: 0.15rem;';

        itemEl.innerHTML = `
            ${songTitleHtml}
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 800; color: var(--pineapple-text);">
                <span>${item.name}</span>
                <span style="color: var(--pineapple-orange-dark);">+${item.amount.toLocaleString('vi-VN')} ₫</span>
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
                                <div class="song-attachment-title" title="${updatedMeta.title}">
                                    <a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bài hát trên trình duyệt" onclick="event.stopPropagation()">
                                        ${updatedMeta.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem; opacity: 0.6;"></i>
                                    </a>
                                </div>
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
                        <div class="song-attachment-title" title="${meta.title}">
                            <a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bài hát trên trình duyệt" onclick="event.stopPropagation()">
                                ${meta.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem; opacity: 0.6;"></i>
                            </a>
                        </div>
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
    await getDonationHistoryService().markRead(id);
    await renderDonationHistory();
}

async function markAllDonationsAsRead() {
    await getDonationHistoryService().markAllRead();
    await renderDonationHistory();
}
window.markAllDonationsAsRead = markAllDonationsAsRead;

async function clearAllDonationHistory() {
    if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử lời nhắn donate?")) {
        await getDonationHistoryService().clear();
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
    const headerEl = document.getElementById('fs-alert-header');
    
    if (amountEl) amountEl.textContent = donation.amount.toLocaleString('vi-VN');
    if (senderEl) senderEl.textContent = donation.name;
    if (headerEl) headerEl.textContent = donation.isPlaylistDonation ? 'DONATE PLAYLIST MỚI' : 'DONATE MỚI';
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

let zypageConnectionService = null;
let zypageConnectPromise = null;

function getZyPageConnectionService() {
    if (!zypageConnectionService && window.ZyPageConnectionService) {
        zypageConnectionService = new window.ZyPageConnectionService({
            state,
            storage: localStorage,
            log: logSystem,
            updateStatus: updateZyPageStatusBadge,
            saveConfig: saveConfigToAppData,
            startListener: startFirebaseListener,
            resolveShopId: config => window.electronAPI?.resolveZyPageShopId?.(config),
            alert: window.alert.bind(window)
        });
    }
    return zypageConnectionService;
}

// Kết nối Live với ZyPage
async function connectZyPageLive(isAutoReconnect = false) {
    const urlInput = document.getElementById('zypage-url');
    const shopIdInput = document.getElementById('zypage-shop-id');
    const connectButton = document.getElementById('btn-zypage-connect');
    if (!urlInput) return;

    const service = getZyPageConnectionService();
    if (service) {
        if (zypageConnectPromise) return zypageConnectPromise;
        if (connectButton) connectButton.disabled = true;
        zypageConnectPromise = service.connect({
            input: urlInput.value,
            shopId: shopIdInput?.value || '',
            autoReconnect: isAutoReconnect
        });
        try {
            const result = await zypageConnectPromise;
            if (result && shopIdInput) shopIdInput.value = result.shopId;
            return result;
        } finally {
            zypageConnectPromise = null;
            if (connectButton) connectButton.disabled = false;
        }
    }

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

function summarizeZyPageSongForLog(song) {
    if (!song) return null;
    return {
        id: song.id,
        musicKey: song.musicKey || '',
        source: song.zypageSource || '',
        sourceKeys: getZyPageSourceKeys(song),
        title: song.title || '',
        donorName: song.donorName || '',
        amount: Number(song.amount || 0),
        type: song.type || '',
        videoId: song.videoId || '',
        soundcloudUrl: song.soundcloudUrl || '',
        transactionTime: song.zypageTransactionTime || 0
    };
}

function logZyPageQueueDecision(decision, incomingSong, existingSong = null) {
    const styles = {
        QUEUE_ADD: 'color:#16845b;font-weight:700',
        SKIP_DUPLICATE: 'color:#b7791f;font-weight:700',
        SKIP_ENDED: 'color:#c24141;font-weight:700'
    };
    console.groupCollapsed(`%c[ZyPage Queue] ${decision}`, styles[decision] || 'font-weight:700');
    console.log('Bài nhận được:', summarizeZyPageSongForLog(incomingSong));
    if (existingSong) console.log('Bản đang giữ trong hàng đợi:', summarizeZyPageSongForLog(existingSong));
    console.log('Thời điểm xử lý:', new Date().toISOString());
    console.groupEnd();
}

function logFirebaseDonateEvent(val, isInitialSnapshot = false) {
    const eventType = val && val.type ? String(val.type) : 'unknown';
    const receivedAt = new Date().toISOString();
    const queueSnapshot = (state.queue || []).map((song, index) => ({
        position: index + 1,
        id: song.id,
        musicKey: song.musicKey || '',
        title: song.title || '',
        donorName: song.donorName || '',
        amount: Number(song.amount || 0),
        isCurrent: !!(state.currentSong && String(state.currentSong.id) === String(song.id))
    }));

    const initialLabel = isInitialSnapshot ? ' · snapshot khởi tạo (không xử lý)' : '';
    console.groupCollapsed(`%c[ZyPage Firebase] ${eventType}${initialLabel} · ${receivedAt}`, 'color:#16845b;font-weight:600');
    console.log('Loại event:', eventType);
    console.log('Nhận lúc:', receivedAt);
    console.log('Payload Firebase:', val);
    console.log('Bài đang phát:', state.currentSong || null);
    console.log(`Hàng đợi trước xử lý (${queueSnapshot.length} video):`);
    if (queueSnapshot.length > 0) console.table(queueSnapshot);
    else console.log('(trống)');
    console.groupEnd();
}

function getZyPageDonationEventProcessor() {
    return window.zypageDonationEventProcessor
        || (window.zypageDonationEventProcessor = new window.ZyPageDonationEventProcessor({
            parseYoutubeId,
            resolveSoundcloudUrl: resolveSoundcloudUrlIfNeeded,
            normalizeTimestamp: normalizeOptionalTimestamp
        }));
}

function getZyPageQueueIngestionService(eventProcessor = getZyPageDonationEventProcessor()) {
    return window.zypageQueueIngestionService
        || (window.zypageQueueIngestionService = new window.ZyPageQueueIngestionService({
            state,
            eventProcessor,
            normalizeKey: normalizeZyPageKey,
            normalizeTimestamp: normalizeOptionalTimestamp,
            fetchMetadata: fetchSongMetadata,
            hasBrokenTitle: title => !title || hasBrokenTextEncoding(title),
            needsMetadata: ({ title, author, type, videoId }) => (
                !title || hasBrokenTextEncoding(title) || (!author && type === 'youtube' && videoId)
            ),
            insertSong: insertSongSmartly,
            onInserted: (song, source) => {
                broadcastNewDonationAlert(song);
                const action = source === 'official'
                    ? 'Nhận order nhạc chính thức'
                    : 'Phát hiện link nhạc trong tin nhắn donate';
                logSystem(`[ZyPage] ${action} từ <strong>${song.donorName}</strong>: ${song.title}`, 'queue');
            },
            onMetadataUpdated: song => {
                saveQueue();
                if (state.currentSong && String(state.currentSong.id) === String(song.id)) {
                    Object.assign(state.currentSong, {
                        musicKey: song.musicKey,
                        zypageSourceKeys: Array.isArray(song.zypageSourceKeys)
                            ? [...song.zypageSourceKeys]
                            : [],
                        title: song.title,
                        author: song.author,
                        thumbnail: song.thumbnail
                    });
                    try {
                        const payload = JSON.parse(localStorage.getItem('dua_current_song') || '{}');
                        Object.assign(payload, {
                            musicKey: song.musicKey,
                            zypageSourceKeys: Array.isArray(song.zypageSourceKeys)
                                ? [...song.zypageSourceKeys]
                                : [],
                            title: song.title,
                            author: song.author,
                            thumbnail: song.thumbnail
                        });
                        localStorage.setItem('dua_current_song', JSON.stringify(payload));
                        publishMqtt('current_song', payload);
                    } catch (_) {}
                }
                renderQueue();
            }
        }));
}

function getZyPageDonationCommandService() {
    return window.zypageDonationCommandService
        || (window.zypageDonationCommandService = new window.ZyPageDonationCommandService({
            processPlaylist: processPlaylistDonationIfPresent,
            applyVoteSkip: checkAndApplyVoteSkip,
            applyExtension: checkAndApplyExtension,
            recordDonation: handleNewDonation,
            onError: (error, context) => {
                console.error(`Lỗi xử lý lệnh donate${context ? ` từ ${context}` : ''}:`, error);
            }
        }));
}

function getZyPageFirebaseEventController() {
    return window.zypageFirebaseEventController
        || (window.zypageFirebaseEventController = new window.ZyPageFirebaseEventController({
            getState: () => state,
            eventProcessor: getZyPageDonationEventProcessor(),
            commandService: getZyPageDonationCommandService(),
            ingestionService: getZyPageQueueIngestionService(),
            getMinimumAmount: () => state.zypageMinMessageAmount !== undefined
                ? state.zypageMinMessageAmount
                : 49000,
            hasSongLink,
            refreshQueue: () => sortAndRefreshQueue(),
            playIfIdle: () => {
                if (!state.currentSong && !state.focusMode) playNextInQueue();
            },
            togglePlayback: togglePlayPause,
            normalizeKey: normalizeZyPageKey,
            getSourceKeys: getZyPageSourceKeys,
            skipSong,
            syncQueue: shopId => syncQueueFromZyPageApi(shopId),
            log: logSystem,
            onError: (error, action) => console.error(`Lỗi xử lý Firebase ${action}:`, error)
        }));
}

// Khởi chạy cổng lắng nghe Firebase
function startFirebaseListener(shopId, token) {
    try {
        if (!window.zypageFirebaseListenerService) {
            window.zypageFirebaseListenerService = new window.ZyPageFirebaseListenerService({
                firebase,
                config: window.DEFAULT_FIREBASE_CONFIG
            });
        }
        state.firebaseRef = window.zypageFirebaseListenerService.subscribe({
            token,
            onSnapshot: logFirebaseDonateEvent,
            onEvent: val => getZyPageFirebaseEventController().handle(val, shopId)
        });

        state.zypageConnected = true;
        updateZyPageStatusBadge('connected', 'Đã kết nối Live');
        
        document.getElementById('btn-zypage-connect').style.display = 'none';
        document.getElementById('btn-zypage-disconnect').style.display = 'inline-flex';
        
        logSystem("Đồng bộ Live Firebase hoàn tất! Sẵn sàng nhận nhạc tự động.", 'system');

        // Kênh OBS dùng localSyncKey cố định, không phụ thuộc token ZyPage.
        updateObsUrlDisplay();

        syncQueueFromZyPageApi(shopId);

    } catch (err) {
        console.error("Firebase setup error:", err);
        logSystem(`Lỗi khởi tạo Realtime Database: ${err.message}`, 'system');
        updateZyPageStatusBadge('disconnected', 'Lỗi Firebase');
    }
}

// Ngắt kết nối Live ZyPage
function disconnectZyPageLive() {
    window.zypageFirebaseListenerService?.unsubscribe();
    state.firebaseRef = null;

    state.zypageConnected = false;
    state.zypageToken = '';
    state.zypageShopId = '';
    
    localStorage.removeItem('dua_zypage_token');
    localStorage.removeItem('dua_zypage_shop_id');

    updateZyPageStatusBadge('disconnected', 'Chưa kết nối');
    
    document.getElementById('btn-zypage-connect').style.display = 'inline-flex';
    document.getElementById('btn-zypage-disconnect').style.display = 'none';
    
    logSystem("Đã ngắt kết nối với Live ZyPage.", 'system');

    updateObsUrlDisplay();
}

// --- TỰ ĐỘNG SỬA TIÊU ĐỀ LỖI ENCODE (DẤU HỎI CHẤM) CHO CÁC BÀI TRONG HÀNG ĐỢI ---
async function autoFixQueueEncodings() {
    if (!state.queue || state.queue.length === 0) return;
    
    let isChanged = false;
    const changedSongIds = new Set();
    for (let i = 0; i < state.queue.length; i++) {
        const song = state.queue[i];
        // Nếu tiêu đề bị vỡ font (chứa dấu hỏi chấm)
        if (song && song.title && hasBrokenTextEncoding(song.title)) {
            try {
                logSystem(`⚠️ [Auto Fix] Phát hiện bài hát trong hàng đợi bị lỗi tiêu đề encode: "${song.title}". Đang tự động cào lại...`, 'system');
                const meta = await fetchSongMetadata(song.type, song.videoId, song.soundcloudUrl);
                if (meta && meta.title && !hasBrokenTextEncoding(meta.title)) {
                    const repairedTitle = normalizeFancyText(meta.title);
                    if (repairedTitle !== song.title) {
                        song.title = repairedTitle;
                        if (meta.author && !song.author) song.author = normalizeFancyText(meta.author);
                        if (meta.channelName || meta.author) song.channelName = normalizeFancyText(meta.channelName || meta.author);
                        changedSongIds.add(String(song.id));
                        isChanged = true;
                        logSystem(`✅ [Auto Fix] Đã sửa tiêu đề bài hát thành công: <strong>${song.title}</strong>`, 'system');
                    }
                }
            } catch (e) {
                console.error("Lỗi khi tự động sửa encoding bài hát:", e);
            }
        }
    }
    
    if (isChanged) {
        // Cập nhật lại bài đang phát nếu nó bị thay đổi tiêu đề
        if (state.currentSong && changedSongIds.has(String(state.currentSong.id))) {
            const currentInQueue = state.queue.find(s => String(s.id) === String(state.currentSong.id));
            if (currentInQueue) {
                state.currentSong = currentInQueue;
                try {
                    const payload = JSON.parse(localStorage.getItem('dua_current_song') || '{}');
                    payload.title = currentInQueue.title;
                    payload.author = currentInQueue.author || payload.author || '';
                    payload.channelName = currentInQueue.channelName || currentInQueue.author || payload.channelName || '';
                    localStorage.setItem('dua_current_song', JSON.stringify(payload));
                    publishMqtt('current_song', payload);
                } catch (e) { }
            }
        }
        sortAndRefreshQueue(true);
    }
}

// Gọi API lấy hàng đợi bài hát mới nhất từ máy chủ ZyPage
function getZyPageSyncOrchestrator() {
    if (window.zypageSyncOrchestrator) return window.zypageSyncOrchestrator;

    const eventProcessor = getZyPageDonationEventProcessor();
    const snapshotService = window.zypageApiSnapshotService
        || (window.zypageApiSnapshotService = new window.ZyPageApiSnapshotService({
            fetchPage: fetchWithCorsProxy
        }));
    const itemProcessor = window.zypageApiItemProcessor
        || (window.zypageApiItemProcessor = new window.ZyPageApiItemProcessor({
            eventProcessor,
            normalizeTimestamp
        }));
    const coordinator = window.zypageSyncCoordinator
        || (window.zypageSyncCoordinator = new window.ZyPageSyncCoordinator());

    window.zypageSyncOrchestrator = new window.ZyPageSyncOrchestrator({
        coordinator,
        snapshotService,
        itemProcessor,
        ingestionService: getZyPageQueueIngestionService(eventProcessor),
        commandService: getZyPageDonationCommandService(),
        beforeSync: autoFixQueueEncodings,
        hasSongLink,
        broadcastAlert: broadcastNewDonationAlert,
        log: logSystem,
        onSnapshot: snapshot => {
            logSystem(`[ZyPage API] Phản hồi JSON nhận được từ ZyPage:<br><pre style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 8px; overflow-x: auto; max-height: 200px; font-family: monospace; font-size: 0.75rem; text-align: left; margin: 5px 0; border: 1px solid var(--pineapple-border-color); white-space: pre-wrap; word-break: break-all;">${JSON.stringify(snapshot.contents, null, 2)}</pre>`, 'system');
            logSystem(`🔍 [API Debug] Danh sách ID hàng đợi trên server ZyPage: musicList=[${snapshot.musicKeys.join(', ') || 'Trống'}] | plainList=[${snapshot.plainKeys.join(', ') || 'Trống'}]`, 'system');
        },
        setLastSyncedTimestamp: timestamp => {
            state.lastSyncedDonateTime = timestamp;
            localStorage.setItem('dua_last_synced_donate_time', timestamp);
        },
        refreshQueue: () => sortAndRefreshQueue(),
        playIfIdle: () => {
            if (!state.currentSong && !state.focusMode) playNextInQueue();
        },
        onPendingSync: pending => syncQueueFromZyPageApi(pending.shopId, pending.isManual),
        onError: error => console.error('Queue sync error:', error)
    });
    return window.zypageSyncOrchestrator;
}

async function syncQueueFromZyPageApi(shopId, isManual = false) {
    return getZyPageSyncOrchestrator().sync({
        shopId,
        isManual,
        domain: state.zypageDomain,
        lastSyncedTimestamp: state.lastSyncedDonateTime,
        minimumAmount: state.zypageMinMessageAmount !== undefined
            ? state.zypageMinMessageAmount
            : 49000
    });
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

// Hàm cập nhật hiển thị âm lượng và hiệu ứng cầu vồng cho thanh trượt
function updateAdaptiveVolumeUI(adjustedVolume, loudnessDb, isPlaying) {
    const isAdaptiveEnabled = localStorage.getItem('dua_adaptive_volume_enabled') === 'true';
    const volumeSlider = document.getElementById('volume-slider');
    const volDisplay = document.getElementById('volume-val-display');
    const adaptiveVolRow = document.getElementById('player-adaptive-volume-row');
    const adaptiveVolText = document.getElementById('player-adaptive-vol-text');
    const adaptiveBadge = document.getElementById('adaptive-volume-badge');
    const adaptiveInfo = document.getElementById('adaptive-volume-info');

    // Ẩn badge rườm rà
    if (adaptiveVolRow) adaptiveVolRow.style.display = 'none';
    if (adaptiveBadge) adaptiveBadge.style.display = 'none';

    if (!volumeSlider || !volDisplay) return;

    const isAdjusted = isAdaptiveEnabled && adjustedVolume !== undefined && adjustedVolume !== state.volume && isPlaying;

    // In log chi tiết tự động vào bảng log hệ thống của dashboard để người dùng theo dõi
    if (isPlaying) {
        if (window.lastAdaptiveSystemLogTime === undefined || Date.now() - window.lastAdaptiveSystemLogTime > 8000) {
            window.lastAdaptiveSystemLogTime = Date.now();
            
            if (!isAdaptiveEnabled) {
                logSystem(`⚙️ [Âm lượng thích ứng] Chưa bật tính năng trong cài đặt.`, 'system');
            } else if (adjustedVolume === undefined) {
                logSystem(`⚠️ [Âm lượng thích ứng] Chưa nhận được dữ liệu volume thích ứng từ OBS Overlay.`, 'system');
            } else if (loudnessDb === null || loudnessDb === undefined) {
                logSystem(`⚠️ [Âm lượng thích ứng] Video này không có dữ liệu Loudness (hoặc API /api/yt-loudness trả về null).`, 'system');
            } else if (adjustedVolume === state.volume) {
                logSystem(`⚙️ [Âm lượng thích ứng] Trùng khớp với âm lượng gốc (${state.volume}%), không cần điều chỉnh.`, 'system');
            }
        }
    }

    if (isAdjusted) {
        // Lưu lại thông tin phục vụ việc học hỏi (user tuning)
        state.adaptiveActive = true;
        state.adaptiveLoudnessDb = loudnessDb;
        state.adaptiveOrigVolume = state.volume;
        state.adaptiveAdjustedVolume = adjustedVolume;

        // Cập nhật số % hiển thị và giá trị thanh trượt về mức thích ứng
        const oldText = volDisplay.textContent;
        const newText = `${adjustedVolume}%`;
        volDisplay.textContent = newText;
        volDisplay.title = `Âm lượng gốc: ${state.volume}% → Đã thích ứng về: ${adjustedVolume}% (Loudness: ${loudnessDb != null ? loudnessDb.toFixed(1) : 'N/A'} dB)`;
        
        if (document.activeElement !== volumeSlider) {
            volumeSlider.value = adjustedVolume;
        }
        
        if (!volumeSlider.classList.contains('adaptive-active')) {
            volumeSlider.classList.add('adaptive-active');
            logSystem(`✨ <strong>[Âm lượng thích ứng]</strong> Đang điều chỉnh âm lượng gốc từ <strong>${state.volume}%</strong> về thực tế <strong>${adjustedVolume}%</strong> (Loudness: ${loudnessDb != null ? loudnessDb.toFixed(1) : 'N/A'} dB).`, 'system');
        } else if (oldText !== newText) {
            logSystem(`✨ <strong>[Âm lượng thích ứng]</strong> Điều chỉnh về mức thực tế mới: <strong>${adjustedVolume}%</strong> (Loudness: ${loudnessDb != null ? loudnessDb.toFixed(1) : 'N/A'} dB).`, 'system');
        }
        
        volumeSlider.title = `Âm lượng thích ứng: ${adjustedVolume}% (Gốc: ${state.volume}%)`;
    } else {
        state.adaptiveActive = false;
        
        // Trả về mức âm lượng gốc
        volDisplay.textContent = `${state.volume}%`;
        volDisplay.title = `Âm lượng: ${state.volume}%`;
        
        if (document.activeElement !== volumeSlider) {
            volumeSlider.value = state.volume;
        }
        
        if (volumeSlider.classList.contains('adaptive-active')) {
            volumeSlider.classList.remove('adaptive-active');
            logSystem(`✨ <strong>[Âm lượng thích ứng]</strong> Đã khôi phục về âm lượng gốc: <strong>${state.volume}%</strong>.`, 'system');
        }
        volumeSlider.title = `Âm lượng: ${state.volume}%`;
    }
    
    // Luôn log console đầy đủ
    if (window.lastAdaptiveLogTime === undefined || Date.now() - window.lastAdaptiveLogTime > 3000) {
        window.lastAdaptiveLogTime = Date.now();
        console.log("[Adaptive Volume Debug] isAdaptiveEnabled:", isAdaptiveEnabled, "| adjustedVolume:", adjustedVolume, "| targetVolume:", state.volume, "| loudnessDb:", loudnessDb, "| isPlaying:", isPlaying, "| isAdjusted:", isAdjusted);
    }
}

// Lắng nghe sự kiện đồng bộ trạng thái từ OBS Overlay phát ngược lại Dashboard
function handleOverlayPlaybackEvent(event) {
    const decision = (window.overlayEventService ||= new window.OverlayEventService()).evaluate(event, state);
    if (decision.action === 'ignore') return false;
    if (decision.action === 'player_error') {
        handlePlayerError(decision.code, decision.title);
        return true;
    }

    if (decision.eventId) state.lastHandledEndedEventId = decision.eventId;
    const completedSong = decision.song;
    const nextSong = getNextSong();
    logSystem(`Đã phát xong: <strong>${completedSong.title}</strong>`);
    finishPlaylistTrack(completedSong, 'played');
    removeSongFromQueue(completedSong.id, false);

    if (state.focusMode) {
        state.currentSong = null;
        updatePlayerUI(null);
        publishMqtt('current_song', null);
        sendControlCommand('stop');
    } else {
        playNextInQueue(false, nextSong, completedSong);
    }
    return true;
}

// =========================================================================
// --- CƠ SỞ DỮ LIỆU REALTIME DASHBOARD ↔ OBS ---
// =========================================================================

function updateObsUrlDisplay() {
    const obsUrlInput = document.getElementById('obs-url-input');
    if (!obsUrlInput) return;
    
    const scaleSelect = document.getElementById('obs-scale-select');
    const scaleVal = scaleSelect ? scaleSelect.value : '1';
    
    const themeSelect = document.getElementById('obs-theme-select');
    const themeVal = themeSelect ? themeSelect.value : 'enchanted-wild';
    
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
    if (themeVal !== 'enchanted-wild') {
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
    theme = getDashboardSettingsService().setTheme(theme);
    state.theme = theme;
    updateObsUrlDisplay();
    publishMqtt('theme_change', { theme: theme });
    
    // Cập nhật theme xem trước tức thời
    const previewIframe = document.getElementById('theme-preview-iframe');
    if (previewIframe) {
        previewIframe.src = `overlay.html?preview=true&theme=${theme}`;
    }
}

function onOpacityChange(val) {
    val = getDashboardSettingsService().setOpacity(val);
    state.opacity = val;
    const opacityVal = document.getElementById('obs-opacity-val');
    if (opacityVal) {
        opacityVal.textContent = val + '%';
    }
    updateObsUrlDisplay();
    publishMqtt('opacity_change', { opacity: val });
}

function initRealtimeDatabase() {
    logSystem(`<span style="color: var(--pineapple-success); font-weight: 600;"><i class="fa-solid fa-database"></i> Đang kết nối cơ sở dữ liệu realtime...</span>`);
    // Một snapshot chứa toàn bộ bài hát, hàng đợi, cấu hình và trạng thái ban đầu.
    // Sau đó chỉ control_command và overlay_state đi qua changefeed WebSocket.
    initDashboardRealtimeListener();
    publishRealtimeSnapshot();
}
function publishMqtt(type, payload) {
    // Không log spammy ticks để tránh rác log
    if (type !== 'progress' && type !== 'overlay_state') {
        logSystem(`[Tập lệnh thực thi] Gửi đi: <strong>${type}</strong> ${payload ? `[${JSON.stringify(payload)}]` : ''}`, 'system');
    }
    publishRealtimeTransport({ type, data: payload });
}

function handleMqttMessage(topic, messageStrOrObj) {
    try {
        const payload = typeof messageStrOrObj === 'string' ? JSON.parse(messageStrOrObj) : messageStrOrObj;
        if (!payload) return;
        
        // Cập nhật nhịp tim kết nối của OBS Overlay
        state.lastOverlayHeartbeat = Date.now();

        // Không log overlay_state hoặc progress định kỳ để tránh rác log
        if (payload.type !== 'overlay_state' && payload.type !== 'lyrics_timing' && payload.type !== 'progress' && payload.type !== 'status' && payload.type !== 'realtime.heartbeat') {
            logSystem(`[Tập lệnh thực thi] Nhận lại: <strong>${payload.type}</strong> ${payload.data ? `[${JSON.stringify(payload.data)}]` : ''}`, 'system');
        }

        // Overlay có thể kết nối lại và gửi request_sync trước khi Dashboard
        // kịp subscribe, khiến lượt reload lúc khởi động bị bỏ lỡ. Trạng thái
        // phát hoặc heartbeat đầu tiên cũng xác nhận rằng Overlay đã online.
        // Hạ cờ trước khi gửi lệnh để lần kết nối sau reload không tạo vòng lặp.
        const isOverlayStartupSignal = payload.type === 'request_sync'
            || payload.type === 'realtime.heartbeat'
            || payload.type === 'overlay_state';
        if (state.pendingOverlayReset && isOverlayStartupSignal) {
            state.pendingOverlayReset = false;
            logSystem("Overlay đã online trong phiên mở app mới. Đang tự động tải lại overlay...");
            triggerResetOverlay();
            return;
        }

        if (payload.type === 'request_sync') {
            logSystem("Nhận yêu cầu đồng bộ cấu hình từ Overlay.");

            publishRealtimeSnapshot();
            sendControlCommand('volume', state.volume);
            const canResume = state.currentSong && !document.getElementById('resume-playback-modal');
            sendControlCommand(canResume && state.isPlaying ? 'play' : canResume ? 'pause' : 'stop');
        } else if (payload.type === 'lyrics_timing') {
            if (localStorage.getItem('dua_lyrics_enabled') === 'false') return;
            const data = payload.data || payload.state;
            if (!data || data.currentTime === undefined) return;
            if (data.songId != null
                && String(data.songId) !== String(state.currentSong?.id ?? '')) return;
            // This high-frequency channel only advances the lyric cursor. Player
            // progress, queue state, volume and playback controls remain owned by
            // the normal overlay_state channel.
            updateDashboardLyrics(state.currentSong?.lyrics, Number(data.currentTime) || 0);
        } else if (payload.type === 'overlay_state') {
            const data = payload.state;
            if (!data) return;
            // Tick cũ có thể đến sau current_song mới. Không cho trạng thái của bài
            // trước ghi đè duration, nút play/pause hoặc progress của bài hiện tại.
            if (data.songId != null
                && String(data.songId) !== String(state.currentSong?.id ?? '')) return;
            const ignorePreSeekProgress = shouldIgnorePreSeekProgress(data.currentTime);

            if (state.currentSong && (data.isPlaying === true || Number(data.currentTime || 0) > 0.5 || Number(data.duration || 0) > 0)) {
                state.currentSongPlaybackConfirmed = true;
            }
            setDashboardVideoLoading(Boolean(state.currentSong
                && state.isPlaying
                && (data.isBuffering === true || state.currentSongPlaybackConfirmed === false)));
            
            // Cập nhật DirectStream badge dựa trên trạng thái phát trực tiếp từ file
            const directStreamBadge = document.getElementById('direct-stream-badge');
            if (directStreamBadge) {
                if (data.isDirectStream) {
                    directStreamBadge.style.display = 'inline-flex';
                } else {
                    directStreamBadge.style.display = 'none';
                }
            }

            // Cập nhật hiển thị âm lượng thích ứng nếu có dữ liệu từ overlay
            updateAdaptiveVolumeUI(data.adjustedVolume, data.loudnessDb, data.isPlaying);
            
            if (data.currentTime !== undefined && !ignorePreSeekProgress) {
                state.lastReportedTime = data.currentTime;
                updateDashboardLyrics(state.currentSong?.lyrics, data.currentTime);
                getWindowsMediaService()?.updatePosition?.(data.currentTime, data.duration || state.currentSong?.duration);
            }

            if (state.currentSong?.playlistRequestId
                && Date.now() - state.playlistProgressLastSentAt >= OVERLAY_PROGRESS_SYNC_INTERVAL_MS) {
                state.playlistProgressLastSentAt = Date.now();
                const currentQueueIndex = state.queue.findIndex(song => String(song.id) === String(state.currentSong.id));
                const remainingPlaylistSec = state.queue.reduce((total, song, index) => {
                    if (song.playlistRequestId !== state.currentSong.playlistRequestId || index < currentQueueIndex) return total;
                    if (index === currentQueueIndex) {
                        return total + Math.max(0, Number(data.duration || song.duration || 0) - Number(data.currentTime || 0));
                    }
                    return total + Math.max(0, Number(song.duration || 0));
                }, 0);
                
                const dashboardRemainingEl = document.getElementById(`dashboard-playlist-remaining-${state.currentSong.playlistRequestId}`);
                if (dashboardRemainingEl) {
                    dashboardRemainingEl.textContent = formatTime(remainingPlaylistSec);
                }
                
                const samePlaylistTracks = state.queue.filter(s => s && s.playlistRequestId === state.currentSong.playlistRequestId);
                const playlistTotal = Number(state.currentSong.playlistTotalTracks || samePlaylistTracks.length || 1);
                const completedCount = Math.max(0, playlistTotal - samePlaylistTracks.length);
                const currentTrackIdx = samePlaylistTracks.findIndex(s => String(s.id) === String(state.currentSong.id));
                const currentTrackPos = completedCount + 1 + (currentTrackIdx !== -1 ? currentTrackIdx : 0);

                publishMqtt('playlist.track_progress', {
                    playlistRequestId: state.currentSong.playlistRequestId,
                    trackId: state.currentSong.playlistTrackId,
                    currentTrack: currentTrackPos,
                    totalTracks: playlistTotal,
                    currentTimeSec: Number(data.currentTime || 0),
                    durationSec: Number(data.duration || state.currentSong.duration || 0),
                    remainingPlaylistSec
                });
            }

            const isPlayingChanged = state.isPlaying !== data.isPlaying;
            state.isPlaying = data.isPlaying;
            updatePlayPauseButtonUI(data.isPlaying);

            const normalizedDuration = Math.max(0, Math.floor(Number(data.duration) || 0));
            if (normalizedDuration > 0 && state.currentSong) {
                if (!state.currentSong.duration || state.currentSong.duration !== normalizedDuration) {
                    state.currentSong.duration = normalizedDuration;
                    const matchedQueueSong = state.queue.find(s => String(s.id) === String(state.currentSong.id));
                    if (matchedQueueSong) {
                        matchedQueueSong.duration = normalizedDuration;
                    }
                    renderQueue();
                    updateForceExtensionButtonUI();
                    updatePlayerUI(state.currentSong);

                    // Lyrics are selected with an exact whole-second duration.
                    // Retry when Overlay reports the authoritative player
                    // duration instead of keeping a stale metadata match/miss.
                    loadSyncedLyricsForSong(state.currentSong);

                    // Ghi lại vào localStorage để đồng bộ đồng nhất
                    const payloadRaw = localStorage.getItem('dua_current_song');
                    if (payloadRaw) {
                        try {
                            const payload = JSON.parse(payloadRaw);
                            payload.duration = normalizedDuration;
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

            const isLive = !!data.isLive || (!data.duration || data.duration <= 0);

            if (!isLive) {
                if (progressSlider) progressSlider.style.display = 'block';
                if (currentTimeDisplay) currentTimeDisplay.style.display = 'inline';
                if (totalTimeDisplay) totalTimeDisplay.style.display = 'inline';
                let startPoint = 0;
                let limitDuration = data.duration;
                
                if (state.currentSong) {
                    startPoint = state.currentSong.start || 0;
                    let endPoint = data.duration;
                    
                    if (state.currentSong.end && state.currentSong.end > startPoint) {
                        endPoint = Math.min(endPoint, state.currentSong.end);
                    }
                    
                    const maxDur = state.bypassCurrentSongDuration ? 0 : calculateMaxDurationForSong(state.currentSong);
                    if (maxDur > 0) {
                        endPoint = Math.min(endPoint, startPoint + maxDur);
                    }
                    
                    limitDuration = Math.max(1, endPoint - startPoint);
                }
                
                currentOverlayDuration = limitDuration;
                
                const elapsedTime = Math.min(limitDuration, Math.max(0, data.currentTime - startPoint));
                
                if (progressSlider && !isDashboardSeekUiLocked()) {
                    const pct = (elapsedTime / limitDuration) * 100;
                    progressSlider.value = pct;
                    progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
                }

                if (currentTimeDisplay && !ignorePreSeekProgress) currentTimeDisplay.textContent = formatTime(elapsedTime);
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
                
                // Live Stream handling via realtime state
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
                        progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
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
                        progressSlider.style.background = `var(--pineapple-orange)`;
                    }
                    // Ẩn countdown khi không có giới hạn
                    if (dashCountdown) dashCountdown.classList.remove('visible');
                }
            }
        } else if (payload.type === 'overlay_event') {
            handleOverlayPlaybackEvent(payload.event);
        } else if (payload.type === 'overlay_log') {
            const d = payload.data;
            logSystem(`🔍 <strong>[Overlay Log]</strong> ${d && d.msg ? d.msg : ''} ${d && d.data ? JSON.stringify(d.data).slice(0, 300) : ''}`, 'system');
        } else if (payload.type === 'overlay_error') {
            const d = payload.data;
            logSystem(`🚨 <strong>[Overlay Error]</strong> ${d && d.message ? d.message : JSON.stringify(d).slice(0, 300)}`, 'system');
        }
    } catch (e) {
        console.error("Error parsing realtime message:", e);
    }
}


// --- ĐỌC VÀ GHI CẤU HÌNH ZYPAGE VÀO APPDATA ---
async function saveConfigToAppData(url, shopId) {
    try {
        const notifMonitor = localStorage.getItem('dua_notif_monitor') || 'auto';
        await fetch(getApiUrl('/api/config'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                zypageUrl: url, 
                zypageShopId: shopId,
                zypageMinMessageAmount: state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000,
                playlistSettings: getPlaylistSettings(),
                notifMonitor: notifMonitor
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

            if (config.playlistSettings && typeof config.playlistSettings === 'object') {
                const { minimumViewCount: _ignoredViewCount, ...savedPlaylistSettings } = config.playlistSettings;
                const savedPricing = normalizeDashboardPlaylistPricing(savedPlaylistSettings, true);
                state.playlistSettings = {
                    ...state.playlistSettings,
                    ...savedPlaylistSettings,
                    playlistEnabled: true,
                    // Cấu hình cũ chưa có version được chuyển về mặc định 500k/30p/50k/5p.
                    // Cấu hình version 2 do người dùng lưu được giữ nguyên.
                    ...savedPricing,
                    playlistMaximumDurationSec: savedPricing.playlistBaseDurationSec,
                    playlistMaximumItemsToResolve: 50,
                    playlistAutoAccept: true,
                    playlistContinuousPlayback: true,
                    playlistDeduplicateTracks: true
                };
                localStorage.removeItem('dua_minimum_view_count');
                initializePlaylistSettingsUI();
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

function clearQuickSearch() {
    const urlInput = document.getElementById('donor-url');
    getQuickAddUiController().clear();
    if (urlInput) urlInput.blur();
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
}

// --- CÁC HÀM TRỢ GIÚP CHO CHỨC NĂNG YÊU THÍCH (FAVORITES) ---
function getFavoritesService() {
    if (!window.favoritesService) {
        window.favoritesService = new window.FavoritesService({
            storage: localStorage,
            items: state.favorites,
            parseYoutubeId,
            formatTime,
            parseDuration: parseDurationToSeconds
        });
    }
    return window.favoritesService;
}

function saveFavorites() {
    const service = getFavoritesService();
    service.items = state.favorites;
    service.save();
}

function isFavorite(song) {
    return getFavoritesService().has(song);
}

function toggleFavoriteStatus(song) {
    if (!song) return;
    const result = getFavoritesService().toggle(song);
    state.favorites = getFavoritesService().items;
    if (result.action === 'removed') {
        logSystem(`Đã xóa khỏi danh sách Yêu thích: <strong>${song.title}</strong>`, 'system');
        showDashboardSystemAlert("Yêu thích", `Đã xóa khỏi danh sách Yêu thích: <strong>${song.title}</strong>`, 'HỆ THỐNG');
    } else {
        logSystem(`Đã thêm vào danh sách Yêu thích: <strong>${song.title}</strong>`, 'system');
        showDashboardSystemAlert("Yêu thích", `Đã lưu vào danh sách Yêu thích: <strong>${song.title}</strong>`, 'HỆ THỐNG');
    }

    // Danh sách Yêu thích luôn phản ánh dữ liệu mới ngay tại nơi phát sinh thay đổi.
    // Đặt ở hàm dùng chung để nút tim trong Player, tìm kiếm và danh sách đều đồng bộ.
    renderFavoritesList();
    
    // Cập nhật lại UI nút Trái tim của Player nếu bài đang phát trùng khớp bài vừa toggle
    if (state.currentSong && (
        (song.videoId && state.currentSong.videoId === song.videoId) ||
        (song.soundcloudUrl && state.currentSong.soundcloudUrl === song.soundcloudUrl) ||
        (song.spotifyId && state.currentSong.spotifyId === song.spotifyId) ||
        (song.id === state.currentSong.id)
    )) {
        const favBtn = document.getElementById('btn-player-favorite');
        if (favBtn) {
            const isNowFav = isFavorite(state.currentSong);
            const icon = favBtn.querySelector('i');
            if (icon) {
                icon.className = isNowFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
                icon.style.color = isNowFav ? '#EF4444' : '';
            }
            favBtn.title = isNowFav ? 'Bỏ yêu thích' : 'Yêu thích';
        }
    }
}

function getFavoriteContextKey(favorite) {
    return getFavoritesService().contextKey(favorite);
}

function findFavoriteByContextKey(key) {
    return getFavoritesService().findByContextKey(key);
}

function getFavoriteExternalUrl(favorite) {
    return getFavoritesService().externalUrl(favorite);
}

function addFavoriteToQueue(favorite) {
    if (!favorite || state.focusMode) return;

    const newSong = getFavoritesService().createQueueSong(favorite);

    insertSongSmartly(newSong);
    broadcastNewDonationAlert(newSong);
    saveQueue();
    sortAndRefreshQueue();

    logSystem(`Đã thêm nhanh bài hát từ danh sách Yêu thích: <strong>${favorite.title}</strong>`, 'queue');
    showDashboardSystemAlert('Đã thêm nhạc nhanh', `Đã thêm nhanh bài yêu thích: <strong>${favorite.title}</strong>`, 'HÀNG ĐỢI');

    if (!state.currentSong) {
        playNextInQueue();
    }
}

function renderFavoritesList() {
    const container = document.getElementById('qa-favorites-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!state.favorites || state.favorites.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 30px 10px; text-align: center; color: #6B7280; font-weight: 700; width: 100%;">
                <i class="fa-solid fa-heart" style="font-size: 1.8rem; color: #E5E7EB; margin-bottom: 0.5rem; display: block;"></i>
                Chưa có bài hát yêu thích nào.<br/>Hãy bấm icon Trái tim ở kết quả tìm kiếm hoặc trình phát để lưu bài!
            </div>
        `;
        return;
    }
    
    state.favorites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'grid-result-item';
        item.title = 'Nhấp để thêm vào hàng đợi · Chuột phải để xem tùy chọn';
        
        let displayDuration = fav.duration || '--:--';
        if (displayDuration && (typeof displayDuration === 'number' || /^\d+(\.\d+)?$/.test(displayDuration.toString().trim()))) {
            displayDuration = formatTime(parseFloat(displayDuration));
        }
        
        item.innerHTML = `
            <div class="grid-result-thumb-wrapper">
                <img src="${fav.thumbnail}" alt="thumb">
                <span class="grid-result-duration">${displayDuration}</span>
                <button type="button" class="fav-item-remove-btn" title="Bỏ yêu thích" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.6); color: #EF4444; border: none; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; font-size: 0.75rem;">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
            <div class="grid-result-info">
                <div class="grid-result-title" title="${fav.title}">${fav.title}</div>
                <div class="grid-result-meta" title="${fav.author || ''} • ${fav.views || ''}">
                    <span>${fav.author || 'YouTube'}</span>
                    ${fav.views ? `• <span>${formatViewsCompact(fav.views)} views</span>` : ''}
                </div>
            </div>
        `;
        
        // Bấm chọn phát nhanh bài hát yêu thích
        const selectAction = (e) => {
            if (e.target.closest('.fav-item-remove-btn')) return;
            addFavoriteToQueue(fav);
        };
        
        item.addEventListener('click', selectAction);

        item.addEventListener('contextmenu', (e) => {
            if (!window.electronAPI || typeof window.electronAPI.showFavoriteContextMenu !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            window.electronAPI.showFavoriteContextMenu({
                key: getFavoriteContextKey(fav),
                title: fav.title || 'Bài hát yêu thích',
                url: getFavoriteExternalUrl(fav)
            });
        });
        
        // Bấm nút xóa tim
        const removeBtn = item.querySelector('.fav-item-remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavoriteStatus(fav);
            });
        }
        
        container.appendChild(item);
    });
}

// ==========================================
// YOUTUBE ACCOUNT SYNC UI LOGIC (OPTION 2)
// ==========================================

let isYtLoggedIn = false;
let hasLoadedRecommendations = false;
let hasLoadedPlaylists = false;
let activeQuickAddTab = 'recommendations';

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
                statusBadge.style.backgroundColor = 'var(--pineapple-success)';
            }
            if (btnLogin) btnLogin.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'block';
            
            // Auto switch to recommendations on startup
            switchQuickAddTab('recommendations');
        } else {
            isYtLoggedIn = false;
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
            
            // Auto switch to favorites when not logged in
            switchQuickAddTab('favorites');
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
    const tabs = ['recommendations', 'playlists', 'favorites'];
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
    } else if (tabName === 'favorites') {
        renderFavoritesList();
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
            getDashboardSearchService().renderResults(result.videos, 'qa-recommendations-list');
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
            getDashboardSearchService().renderResults(result.videos, 'qa-playlists-list');
        } else {
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi: ${result.error || 'Không thể tải video trong playlist này'}</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lỗi kết nối mạng: ${e.message}</div>`;
    }
}

// --- WALKTHROUGH GIỚI THIỆU PHIÊN BẢN MỚI ---
function closeWalkthroughModal() {
    const modal = document.getElementById('walkthrough-modal');
    const frame = document.getElementById('walkthrough-frame');
    if (modal) modal.style.display = 'none';
    if (frame) frame.src = 'about:blank';
}

function showWalkthroughModal(version) {
    const modal = document.getElementById('walkthrough-modal');
    const frame = document.getElementById('walkthrough-frame');
    const versionLabel = document.getElementById('walkthrough-version-label');
    if (!modal || !frame) return;

    if (versionLabel) versionLabel.textContent = `v${version}`;
    frame.src = `landing/walkthrough.html?embedded=true&version=${encodeURIComponent(version)}`;
    modal.style.display = 'flex';
}

async function openWhatsNewWalkthrough(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    let ver = '26.8.11';
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
        try {
            ver = await window.electronAPI.getAppVersion();
        } catch (e) {
            console.error(e);
        }
    }
    showWalkthroughModal(ver);
}

function toggleWalkthroughEditMode() {
    const frame = document.getElementById('walkthrough-frame');
    if (!frame) return;

    // Convert src to a URL object to modify params safely
    let currentSrc = frame.src;
    if (currentSrc === 'about:blank') return;

    try {
        const url = new URL(currentSrc, window.location.href);
        const isEdit = url.searchParams.get('edit') === 'true';

        if (isEdit) {
            url.searchParams.delete('edit');
            url.searchParams.set('embedded', 'true');
            showDashboardSystemAlert("Chế độ xem", "Đã quay về chế độ xem giới thiệu.");
        } else {
            url.searchParams.delete('embedded');
            url.searchParams.set('edit', 'true');
            showDashboardSystemAlert("Chế độ soạn thảo ✍️", "Đã chuyển sang chế độ soạn thảo trực tiếp trong app Electron!");
        }
        frame.src = url.toString();
    } catch (e) {
        console.error("Lỗi chuyển đổi chế độ soạn thảo:", e);
    }
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
            songLink = extractSongLinkFromMessage(message) || '';
            isFromMessage = Boolean(songLink);
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
        const playlistResult = await processPlaylistDonationIfPresent(donation);
        const playlistHandled = Boolean(playlistResult?.matched);

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

        if (playlistHandled) {
            return;
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
                soundcloudUrl = await resolveSoundcloudUrlIfNeeded(songLink);
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
                        spotifyId: null,
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

let latestBrowserMediaState = null;

function getBrowserMediaLabel(provider) {
    if (provider === 'youtube-music') return 'YouTube Music';
    if (provider === 'soundcloud') return 'SoundCloud';
    return 'YouTube';
}

function renderBrowserMediaMonitor(media) {
    const monitor = document.getElementById('browser-media-monitor');
    if (!monitor) return;
    const isFresh = media?.active
        && media.playing
        && Date.now() - Number(media.updatedAt || 0) <= 10000;
    monitor.hidden = !isFresh;
    if (!isFresh) return;

    const title = document.getElementById('browser-media-monitor-title');
    const channel = document.getElementById('browser-media-monitor-channel');
    const thumb = document.getElementById('browser-media-monitor-thumb');
    if (title) title.textContent = media.title || 'Media trên trình duyệt';
    if (channel) channel.textContent = media.artist || getBrowserMediaLabel(media.provider);
    if (thumb) {
        let thumbnail = media.thumbnail || '';
        if (!thumbnail && media.provider !== 'soundcloud') {
            const videoId = parseYoutubeId(media.url || '');
            if (videoId) thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
        if (thumbnail) thumb.src = thumbnail;
        thumb.alt = media.title || '';
    }
}

let lastBrowserMediaPlayingState = false;
if (window.electronAPI && typeof window.electronAPI.onBrowserMediaState === 'function') {
    window.electronAPI.onBrowserMediaState(media => {
        const isPlayingNow = media?.active && media?.playing;
        const browserJustStartedPlaying = !lastBrowserMediaPlayingState && isPlayingNow;
        lastBrowserMediaPlayingState = isPlayingNow;
        
        latestBrowserMediaState = media;
        renderBrowserMediaMonitor(media);
        
        if (browserJustStartedPlaying && state.isPlaying) {
            logSystem("Trình duyệt bắt đầu phát nhạc. Ứng dụng tự động tạm dừng.", "system");
            if (typeof togglePlayPause === 'function') {
                togglePlayPause();
            }
        }
    });
    setInterval(() => renderBrowserMediaMonitor(latestBrowserMediaState), 2000);
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
        const playlistId = parseYoutubePlaylistId(url);
        if (playlistId) {
            logSystem(`🔌 <strong>[Extension]</strong> Nhận yêu cầu thêm playlist từ Browser: <strong>${url}</strong>`, 'system');
            try {
                await addYoutubePlaylistFromQuickAdd(url, {
                    donorName: 'Trình duyệt',
                    donationAmount: 100000000,
                    isOwnerAdd: true
                });
            } catch (err) {
                console.error("Lỗi thêm playlist từ Extension:", err);
                logSystem(`⚠️ <strong>[Extension]</strong> Lỗi thêm playlist: ${err.message}`, 'error');
            }
            return;
        }
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
                spotifyId: null,
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
            showDashboardSystemAlert("Extension thêm nhạc", `Đã thêm bài hát từ trình duyệt: <strong>${title}</strong>`, 'HÀNG ĐỢI');

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

// Cross-frame walkthrough persistence bridge
window.addEventListener('message', async (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    
    if (event.data.type === 'save-walkthrough-image') {
        if (window.electronAPI && typeof window.electronAPI.saveWalkthroughImage === 'function') {
            try {
                const res = await window.electronAPI.saveWalkthroughImage(event.data.fileName, event.data.base64Data);
                event.source.postMessage({
                    type: 'save-walkthrough-image-response',
                    requestId: event.data.requestId,
                    result: res
                }, '*');
            } catch (err) {
                event.source.postMessage({
                    type: 'save-walkthrough-image-response',
                    requestId: event.data.requestId,
                    result: { success: false, error: err.message }
                }, '*');
            }
        } else {
            event.source.postMessage({
                type: 'save-walkthrough-image-response',
                requestId: event.data.requestId,
                result: { success: false, error: 'electronAPI.saveWalkthroughImage is not available' }
            }, '*');
        }
    } else if (event.data.type === 'save-walkthrough-html') {
        if (window.electronAPI && typeof window.electronAPI.saveWalkthroughHTML === 'function') {
            try {
                const res = await window.electronAPI.saveWalkthroughHTML(event.data.cleanHTML);
                event.source.postMessage({
                    type: 'save-walkthrough-html-response',
                    requestId: event.data.requestId,
                    result: res
                }, '*');
            } catch (err) {
                event.source.postMessage({
                    type: 'save-walkthrough-html-response',
                    requestId: event.data.requestId,
                    result: { success: false, error: err.message }
                }, '*');
            }
        } else {
            event.source.postMessage({
                type: 'save-walkthrough-html-response',
                requestId: event.data.requestId,
                result: { success: false, error: 'electronAPI.saveWalkthroughHTML is not available' }
            }, '*');
        }
    }
});


