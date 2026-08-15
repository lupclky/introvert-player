// TrÃ¬nh quáº£n lÃ½ Nháº¡c Donate Dá»©a Corner â€” Logic ChÃ­nh (app.js)

// Khá»Ÿi táº¡o thá»i Ä‘iá»ƒm cháº¡y app Ä‘á»ƒ chá»‘ng spam thÃ´ng bÃ¡o khi sync lÃºc báº¯t Ä‘áº§u
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

// Tá»± Ä‘á»™ng chuyá»ƒn hÆ°á»›ng tá»« 127.0.0.1 sang localhost Ä‘á»ƒ trÃ¡nh bá»‹ YouTube cháº·n báº£n quyá»n Ã¢m nháº¡c
if (window.location.hostname === '127.0.0.1') {
    window.location.replace(window.location.href.replace('127.0.0.1', 'localhost'));
}

// Helper Ä‘á»ƒ láº¥y Ä‘Ãºng base API host khi cháº¡y á»Ÿ trÃ¬nh duyá»‡t ngoÃ i (vÃ­ dá»¥ Live Server trÃªn port 5500)
function getApiUrl(path) {
    if (window.location.port === '3000' || window.electronAPI) {
        return path;
    }
    return `http://localhost:3000${path}`;
}

function formatViewsCompact(views) {
    if (!views) return '';
    if (isNaN(views)) {
        return views.replace(/\s*(views|lÆ°á»£t xem|views?|lÆ°á»£t nghe|plays?|play_count)\s*/gi, '').trim();
    }
    const num = parseInt(views, 10);
    if (isNaN(num)) return '';
    if (num >= 1e9) {
        return (num / 1e9).toFixed(1).replace(/\.0$/, '') + ' Tá»·';
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
    return name.replace(/\s*[\-\â€“\â€”]\s*(Topic|Chá»§\s*Ä‘á»)\s*$/gi, '').trim();
}

// Chuáº©n hÃ³a timestamp vá» dáº¡ng mili-giÃ¢y (náº¿u lÃ  giÃ¢y thÃ¬ nhÃ¢n vá»›i 1000) Ä‘á»ƒ Ä‘á»“ng bá»™ giá»¯a nháº¡c tá»± add vÃ  nháº¡c donate
// TÃªn kÃªnh dÃ¹ng chung cho Dashboard Player vÃ  Queue, Ä‘á»“ng bá»™ vá»›i Overlay.
function getDashboardRawChannelName(song) {
    return song?.author || song?.channelTitle || song?.channelName || song?.artist || song?.uploader || song?.channel || '';
}

function isDashboardChannelPlaceholder(name) {
    return /^(youtube|youtube artist|kÃªnh youtube|soundcloud|spotify|zypage player)$/i.test(String(name || '').trim());
}

function getDashboardChannelName(song) {
    if (!song || typeof song !== 'object') return '';
    const rawName = getDashboardRawChannelName(song);
    const channelName = cleanChannelName(String(rawName || ''));
    if (channelName && !isDashboardChannelPlaceholder(channelName)) return channelName;
    // BÃ i YouTube luÃ´n cáº§n tÃªn kÃªnh tháº­t; khÃ´ng dÃ¹ng nhÃ£n chá»§ kÃªnh lÃ m fallback.
    if ((!song.type || song.type === 'youtube') && song.videoId) return 'KÃªnh YouTube';
    if (song.isOwnerAdd) return 'ZyPage Player';
    return song.type === 'soundcloud' ? 'SoundCloud' : 'KÃªnh YouTube';
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

    // Má»—i bÃ i Ä‘Äƒng kÃ½ callback riÃªng ngay cáº£ khi dÃ¹ng chung má»™t videoId.
    // Callback cÅ© chá»‰ Ä‘Æ°á»£c sá»­a Ä‘Ãºng item queue cá»§a nÃ³, khÃ´ng Ä‘Æ°á»£c ghi lÃªn Player má»›i.
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

            // Äá»“ng bá»™ tÃªn kÃªnh má»›i láº¥y Ä‘Æ°á»£c sang Overlay náº¿u bÃ i nÃ y Ä‘ang phÃ¡t.
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

// Chuáº©n hÃ³a Ä‘Æ°á»ng dáº«n SoundCloud (chuyá»ƒn m.soundcloud.com sang soundcloud.com vÃ  loáº¡i bá» tham sá»‘)
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

// PhÃ¢n giáº£i link SoundCloud rÃºt gá»n náº¿u lÃ  link on.soundcloud.com vÃ  sau Ä‘Ã³ chuáº©n hÃ³a
async function resolveSoundcloudUrlIfNeeded(url) {
    if (!url) return '';
    const originalUrl = String(url).trim().replace(/[\])}>.,!?;:'"]+$/g, '');
    if (soundCloudResolvedUrlCache.has(originalUrl)) {
        return soundCloudResolvedUrlCache.get(originalUrl);
    }

    let u = originalUrl;
    if (isShortSoundCloudUrl(u)) {
        // Electron main process resolve redirect á»•n Ä‘á»‹nh hÆ¡n fetch tá»« renderer.
        if (window.electronAPI && typeof window.electronAPI.resolveExternalUrl === 'function') {
            try {
                const result = await window.electronAPI.resolveExternalUrl(u);
                if (result?.success && result.resolvedUrl) u = result.resolvedUrl;
            } catch (e) {
                console.warn('KhÃ´ng thá»ƒ resolve SoundCloud qua Electron:', e);
            }
        }

        // Fallback cho cháº¿ Ä‘á»™ cháº¡y báº±ng trÃ¬nh duyá»‡t/local server.
        if (isShortSoundCloudUrl(u)) {
            try {
                const resolveRes = await fetch(getApiUrl(`/api/resolve?url=${encodeURIComponent(u)}`));
                if (resolveRes.ok) {
                    const resolveData = await resolveRes.json();
                    if (resolveData.resolvedUrl) u = resolveData.resolvedUrl;
                }
            } catch (e) {
                console.warn('KhÃ´ng thá»ƒ resolve SoundCloud qua local API:', e);
            }
        }

        // SoundCloud oEmbed cÃ³ thá»ƒ tráº£ URL track API ngay cáº£ khi endpoint redirect lá»—i.
        if (isShortSoundCloudUrl(u)) {
            try {
                const oembedRes = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(originalUrl)}`);
                if (oembedRes.ok) {
                    const oembed = await oembedRes.json();
                    const match = String(oembed?.html || '').match(/[?&]url=([^&"']+)/i);
                    if (match?.[1]) u = decodeURIComponent(match[1]);
                }
            } catch (e) {
                console.warn('KhÃ´ng thá»ƒ resolve SoundCloud qua oEmbed:', e);
            }
        }

        if (isShortSoundCloudUrl(u)) {
            console.error('KhÃ´ng thá»ƒ phÃ¢n giáº£i link SoundCloud rÃºt gá»n:', originalUrl);
        }
    }

    const normalizedUrl = normalizeSoundcloudUrl(u);
    if (normalizedUrl) {
        soundCloudResolvedUrlCache.set(originalUrl, normalizedUrl);
    }
    return normalizedUrl;
}

// Má»Ÿ liÃªn káº¿t ngoÃ i báº±ng trÃ¬nh duyá»‡t máº·c Ä‘á»‹nh cá»§a há»‡ thá»‘ng Windows
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

function positionDashboardLyrics(activeIndex, behavior = 'smooth') {
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
        logSystem(`Tua theo lá»i bÃ i hÃ¡t tá»›i: ${formatTime(targetTime)}`);
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
    if (!panel || !container || !dashboardLyricsTimeline || !lyrics?.available || !Array.isArray(lyrics.lines) || !lyrics.lines.length) {
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
    if (source) source.textContent = `${lyrics.source || 'LRCLIB'}${isSynced ? '' : ' Â· KhÃ´ng Ä‘á»“ng bá»™'}`;
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
            element.title = !isSynced ? '' : (line.isWaitingDots ? 'Äang chá»...' : `Tua tá»›i ${formatTime(line.time)}`);
            if (isSynced && !line.isWaitingDots) {
                element.setAttribute('aria-label', `${line.text}. Tua tá»›i ${formatTime(line.time)}`);
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
        console.warn('[Lyrics] KhÃ´ng thá»ƒ hiá»ƒn thá»‹ lá»i Ä‘á»“ng bá»™:', error?.message || error);
    }
}


// --- BIáº¾N TOÃ€N Cá»¤C & Cáº¤U HÃŒNH ---
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

// Khá»Ÿi táº¡o tráº¡ng thÃ¡i trá»‘ng (khÃ´ng lÆ°u cÃ¡c bÃ i hÃ¡t Ä‘Ã£ order tá»« phiÃªn trÆ°á»›c)
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
    playerVisible: localStorage.getItem('dua_player_visible') !== 'false', // máº·c Ä‘á»‹nh true
    sortConfig: localStorage.getItem('dua_sort_config') || 'time', // 'time' hoáº·c 'amount'
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
                // Di trÃº dá»¯ liá»‡u cÅ©
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
    
    // Thuá»™c tÃ­nh phá»¥c vá»¥ Live Sync ZyPage
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

    // Cáº¥u hÃ¬nh Ä‘á»“ng bá»™ realtime Dashboard â†” Overlay
    localSyncKey: localStorage.getItem('dua_local_sync_key') || '',

    theme: ['pineapple', 'enchanted-wild', 'cutepink'].includes(localStorage.getItem('dua_theme'))
        ? localStorage.getItem('dua_theme')
        : 'enchanted-wild',
    opacity: localStorage.getItem('dua_opacity') || '100',
    emptyQueueMessage: localStorage.getItem('dua_empty_queue_message') || 'Order nháº¡c tá»± Ä‘á»™ng Zypage 50k',
    alertActionText: localStorage.getItem('dua_alert_action_text') || 'gá»­i má»™t quáº£ dá»©a',
    focusModeMessage: localStorage.getItem('dua_focus_mode_message') || 'Äang báº­t cháº¿ Ä‘á»™ Táº­p trung ðŸ¤« HÃ ng Ä‘á»£i táº¡m dá»«ng',
    sensitiveVideosUrl: localStorage.getItem('dua_sensitive_videos_url') || 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json',

    extensionEnabled: localStorage.getItem('dua_extension_enabled') === 'true',
    extensionPrice: parseInt(localStorage.getItem('dua_extension_price')) || 50000,
    extensionMinutes: parseInt(localStorage.getItem('dua_extension_minutes')) || 6,
    voteSkipDefaultAmount: parseInt(localStorage.getItem('dua_vote_skip_default_amount')) || 20000,

    // Donate má»Ÿ YouTube Playlist
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

    // Cá» táº¡m thá»i: bá» qua giá»›i háº¡n thá»i gian cho bÃ i hÃ¡t hiá»‡n táº¡i
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

    // CÃ¡c biáº¿n tráº¡ng thÃ¡i há»— trá»£ Ä‘iá»u chá»‰nh vÃ  há»c há»i Adaptive Volume
    adaptiveActive: false,
    adaptiveLoudnessDb: null,
    adaptiveOrigVolume: 80,
    adaptiveAdjustedVolume: null
};

// Persist the normalized theme so settings and overlay stay in sync.
localStorage.setItem('dua_theme', state.theme);
localStorage.removeItem('dua_test_mode');

function isControlsDisabled() {
    return false; // Bá» hoÃ n toÃ n cháº·n Ä‘iá»u khiá»ƒn khi bÃ i Ä‘á»£i lÃ¢u phÃ¡t
}


// Láº¥y bÃ i chá» Ä‘áº§u tiÃªn theo Ä‘Ãºng thá»© tá»± hÃ ng Ä‘á»£i Ä‘ang hiá»ƒn thá»‹.
// HÃ m nÃ y luÃ´n Ä‘á»c state.queue táº¡i thá»i Ä‘iá»ƒm gá»i, khÃ´ng lÆ°u sáºµn á»©ng viÃªn.
function getFirstPendingSong() {
    if (!Array.isArray(state.queue) || state.queue.length === 0) return null;
    const currentId = state.currentSong ? String(state.currentSong.id) : null;
    return state.queue.find(song => song && String(song.id) !== currentId) || null;
}

// --- Láº¤Y BÃ€I HÃT TIáº¾P THEO (Há»– TRá»¢ LUCKY MODE) ---
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

    // Vote Skip luÃ´n bÃ¡m theo vá»‹ trÃ­ Ä‘áº§u tiÃªn cá»§a hÃ ng Ä‘á»£i hiá»‡n táº¡i. NhÃ¡nh nÃ y
    // cÅ©ng khiáº¿n dá»¯ liá»‡u "bÃ i tiáº¿p theo" trÃªn overlay cáº­p nháº­t Ä‘Ãºng khi hÃ ng Ä‘á»£i Ä‘á»•i.
    if (state.luckyMode) {
        // Kiá»ƒm tra xem luckyNextSong Ä‘Ã£ chá»n trÆ°á»›c Ä‘Ã³ cÃ²n há»£p lá»‡ khÃ´ng
        if (state.luckyNextSong) {
            const exists = state.queue.some(s => String(s.id) === String(state.luckyNextSong.id));
            if (!exists || String(state.luckyNextSong.id) === currentId) {
                state.luckyNextSong = null;
            }
        }
        
        // Náº¿u chÆ°a chá»n hoáº·c khÃ´ng há»£p lá»‡, chá»n ngáº«u nhiÃªn bÃ i tiáº¿p theo trong hÃ ng Ä‘á»£i
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
    
    // Cháº¿ Ä‘á»™ bÃ¬nh thÆ°á»ng: Láº¥y bÃ i Ä‘áº§u tiÃªn trong hÃ ng Ä‘á»£i khÃ¡c bÃ i hiá»‡n táº¡i
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
        // Payload cÃ³ thá»ƒ Ä‘Æ°á»£c phÃ¡t láº¡i chá»‰ vÃ¬ queue thay Ä‘á»•i (vÃ­ dá»¥ thÃªm nhanh
        // tá»« Lá»‹ch sá»­). LuÃ´n ghi volume hiá»‡n táº¡i Ä‘á»ƒ khÃ´ng gá»­i láº¡i má»©c 0 Ä‘Ã£ cÅ©.
        payload.volume = Math.max(0, Math.min(100, Number.isFinite(Number(state.volume)) ? Math.round(Number(state.volume)) : 80));
        if (state.bypassCurrentSongDuration) {
            payload.maxDuration = 0;
        }
        localStorage.setItem('dua_current_song', JSON.stringify(payload));
        publishMqtt('current_song', payload);
    } catch (e) {
        console.error("Lá»—i cáº­p nháº­t thÃ´ng tin bÃ i tiáº¿p theo trong payload:", e);
    }
}

sessionStorage.setItem('dua_app_initialized', 'true');

// Tá»± Ä‘á»™ng sinh khÃ³a Ä‘á»“ng bá»™ cá»¥c bá»™ náº¿u chÆ°a cÃ³
if (!state.localSyncKey) {
    const randomPart = window.crypto?.getRandomValues
        ? Array.from(window.crypto.getRandomValues(new Uint32Array(4))).map(value => value.toString(36)).join('')
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    state.localSyncKey = 'dua_' + randomPart;
    localStorage.setItem('dua_local_sync_key', state.localSyncKey);
}

const REALTIME_RECONNECT_DELAY_MS = 500;
const OVERLAY_PROGRESS_SYNC_INTERVAL_MS = 250;
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

// Cáº¥u hÃ¬nh thá»ƒ loáº¡i SponsorBlock cáº§n bá» qua
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

// Map nhÃ£n tiáº¿ng Viá»‡t cho cÃ¡c danh má»¥c SponsorBlock
const categoryLabels = {
    sponsor: 'TÃ i trá»£ (Sponsor)',
    intro: 'Nháº¡c má»Ÿ Ä‘áº§u (Intro)',
    outro: 'Äoáº¡n káº¿t (Outro)',
    selfpromo: 'Quáº£ng cÃ¡o cÃ¡ nhÃ¢n (Self-promo)',
    interaction: 'KÃªu gá»i tÆ°Æ¡ng tÃ¡c (Interaction)',
    offtopic: 'Äoáº¡n Ä‘á»‘i thoáº¡i phá»¥ (Off-topic)'
};

// --- Dá»® LIá»†U NHáº C MáºªU Äá»‚ TEST ---
const mockSongs = [
    {
        title: "LTT - Why does everyone hate this laptop?",
        url: "https://www.youtube.com/watch?v=t5JvD8Zmdt4",
        donor: "BÃ© Dá»©a Ham Há»c",
        amount: 50000,
        message: "Video nÃ y cÃ³ Ä‘oáº¡n tÃ i trá»£ (Sponsor) ngay khÃºc Ä‘áº§u, báº­t SponsorBlock lÃªn Ä‘á»ƒ test nhÃ©!",
        start: 0,
        end: 0
    },
    {
        title: "Alan Walker - Faded (Official Music Video)",
        url: "https://www.youtube.com/watch?v=60ItHLz5WEA",
        donor: "NgÆ°á»i hÃ¢m má»™ giáº¥u tÃªn",
        amount: 20000,
        message: "PhÃ¡t bÃ i nÃ y nha anh streamer Ä‘áº¹p trai!",
        start: 10,
        end: 180
    },
    {
        title: "Chill Lofi Beats to Study/Relax",
        url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        donor: "Viewer CÃ´ ÄÆ¡n",
        amount: 100000,
        message: "ChÃºc má»i ngÆ°á»i nghe nháº¡c vui váº» nha, lofi chill quÃ¡.",
        start: 0,
        end: 300
    }
];

let mockIndex = 0;

// Tá»± Ä‘á»™ng Ä‘á»“ng bá»™ cÃ¡c cháº¿ Ä‘á»™ SponsorBlock lÃºc khá»Ÿi Ä‘á»™ng
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

// Äá»“ng bá»™ giá»›i háº¡n thá»i gian phÃ¡t vÃ  báº£ng má»‘c sang Overlay.
// Overlay cÅ© váº«n tÆ°Æ¡ng thÃ­ch vÃ¬ tiáº¿p tá»¥c Ä‘á»c trÆ°á»ng value nhÆ° trÆ°á»›c.
function syncMaxDurationToOverlay(val) {
    localStorage.setItem('dua_max_duration', val);
    publishMqtt('max_duration', {
        value: val,
        config: buildTimeLimitConfig()
    });
}

// Táº¡m thá»i báº­t/táº¯t giá»›i háº¡n thá»i gian cho bÃ i hÃ¡t Ä‘ang phÃ¡t
function bypassCurrentSongLimit() {
    if (state.focusMode) return;
    if (!state.currentSong) return;
    
    if (state.bypassCurrentSongDuration) {
        // Táº¯t bypass (KhÃ´i phá»¥c giá»›i háº¡n thá»i gian ban Ä‘áº§u)
        state.bypassCurrentSongDuration = false;
        const originalLimit = calculateMaxDurationForSong(state.currentSong);
        syncMaxDurationToOverlay(originalLimit);
        
        // Cáº­p nháº­t payload Ä‘ang lÆ°u trong localStorage
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.maxDuration = originalLimit;
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                publishMqtt('current_song', payload);
            } catch(e) {}
        }
        
        logSystem(`ðŸ”’ ÄÃ£ khÃ´i phá»¥c giá»›i háº¡n thá»i gian cho bÃ i hiá»‡n táº¡i: <strong>${state.currentSong.title}</strong>`);
        showDashboardSystemAlert("KhÃ´i phá»¥c giá»›i háº¡n", `ðŸ”’ ÄÃ£ khÃ´i phá»¥c giá»›i háº¡n thá»i gian cho bÃ i hiá»‡n táº¡i: <strong>${state.currentSong.title}</strong>`);
    } else {
        // Báº­t bypass (Má»Ÿ giá»›i háº¡n thá»i gian)
        state.bypassCurrentSongDuration = true;
        syncMaxDurationToOverlay(0);
        
        // Cáº­p nháº­t payload Ä‘ang lÆ°u trong localStorage
        const payloadRaw = localStorage.getItem('dua_current_song');
        if (payloadRaw) {
            try {
                const payload = JSON.parse(payloadRaw);
                payload.maxDuration = 0;
                localStorage.setItem('dua_current_song', JSON.stringify(payload));
                publishMqtt('current_song', payload);
            } catch(e) {}
        }
        
        logSystem(`ðŸ”“ ÄÃ£ má»Ÿ giá»›i háº¡n thá»i gian cho bÃ i hiá»‡n táº¡i: <strong>${state.currentSong.title}</strong>`);
        showDashboardSystemAlert("Má»Ÿ giá»›i háº¡n bÃ i", `ðŸ”“ ÄÃ£ má»Ÿ giá»›i háº¡n thá»i gian cho bÃ i hiá»‡n táº¡i: <strong>${state.currentSong.title}</strong>`);
    }
    
    renderQueue(); // Cáº­p nháº­t láº¡i nÃºt báº¥m trÃªn giao diá»‡n
    updateBypassButtonUI(); // Cáº­p nháº­t nÃºt tráº¡ng thÃ¡i trÃªn giao diá»‡n
}

function generateExtensionCode() {
    // Sá»­ dá»¥ng bá»™ kÃ½ tá»± khÃ´ng gÃ¢y nháº§m láº«n:
    // Loáº¡i bá»: 0, O, Q (trÃ¡nh nháº§m nhau)
    // Loáº¡i bá»: 1, I, L (trÃ¡nh nháº§m nhau)
    // Loáº¡i bá»: 2, Z (trÃ¡nh nháº§m nhau)
    // Loáº¡i bá»: 5, S (trÃ¡nh nháº§m nhau)
    // Loáº¡i bá»: 8, B (trÃ¡nh nháº§m nhau)
    // Loáº¡i bá»: U (trÃ¡nh nháº§m vá»›i V)
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
// DONATE Má»ž YOUTUBE PLAYLIST â€” renderer orchestration
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
        pricingNote.textContent = `Tá»« ${Number(settings.playlistMinimumDonationVnd || 0).toLocaleString('vi-VN')} VNÄ Ä‘Æ°á»£c phÃ¡t ${Math.round(Number(settings.playlistBaseDurationSec || 0) / 60).toLocaleString('vi-VN')} phÃºt; má»—i ${Number(settings.playlistExtraDonationStepVnd || 0).toLocaleString('vi-VN')} VNÄ dÆ° thÃªm ${Math.round(Number(settings.playlistExtraDurationStepSec || 0) / 60).toLocaleString('vi-VN')} phÃºt.`;
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
    showDashboardSystemAlert('CÃ i Ä‘áº·t Playlist', 'ÄÃ£ lÆ°u cáº¥u hÃ¬nh nháº­n YouTube Playlist.');
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

    // Playlist lÃ  má»™t khá»‘i. ChÃ¨n cáº£ khá»‘i vÃ o cuá»‘i queue Ä‘á»ƒ khÃ´ng bá»‹ tÃ¡ch bá»Ÿi thuáº­t toÃ¡n bÃ i Ä‘Æ¡n.
    markQueueSongsAsNew(added);
    state.queue.push(...added);
    saveQueue();
    renderQueue();
    updateNextSongInCurrentPayload();
    if (window.electronAPI?.markPlaylistQueued && request.status === 'ready') {
        await window.electronAPI.markPlaylistQueued(request.id);
    }
    if (!options.silent) {
        logSystem(`ÄÃ£ thÃªm playlist <strong>${request.title}</strong> (${added.length} video, ${formatTime(request.totalDurationSec)}) vÃ o hÃ ng Ä‘á»£i.`, 'queue');
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
        // Giá»¯ metadata playlist trÃªn chÃ­nh lÆ°á»£t donate Ä‘á»ƒ má»i kÃªnh thÃ´ng bÃ¡o
        // (Dashboard, taskbar vÃ  Overlay) cÃ¹ng nháº­n diá»‡n má»™t kiá»ƒu dá»¯ liá»‡u.
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
        setPlaylistProcessingStatus(`KhÃ´ng thá»ƒ kiá»ƒm tra playlist: ${error.message}`, 'error');
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
        console.error('KhÃ´ng thá»ƒ khÃ´i phá»¥c playlist:', error);
    }
}

function playlistReasonText(request) {
    if (request.rejectionReason === 'insufficient_amount') {
        return `${Number(request.donationAmount || 0).toLocaleString('vi-VN')}Ä‘ / ${state.playlistSettings.playlistMinimumDonationVnd.toLocaleString('vi-VN')}Ä‘ tá»‘i thiá»ƒu`;
    }
    return request.rejectionText || 'Cáº§n streamer kiá»ƒm tra trÆ°á»›c khi Ä‘Æ°a vÃ o hÃ ng Ä‘á»£i.';
}

function playlistIssueSummary(request) {
    const labels = {
        private: 'riÃªng tÆ°', deleted: 'Ä‘Ã£ xÃ³a', unavailable: 'khÃ´ng kháº£ dá»¥ng',
        livestream: 'livestream', upcoming: 'sáº¯p phÃ¡t', duplicate: 'trÃ¹ng',
        blacklisted: 'bá»‹ cháº·n', unknown_duration: 'chÆ°a rÃµ thá»i lÆ°á»£ng', duration_limit: 'vÆ°á»£t thá»i lÆ°á»£ng',
        below_minimum_views: 'dÆ°á»›i má»‘c view', unknown_view_count: 'chÆ°a rÃµ lÆ°á»£t xem'
    };
    const counts = new Map();
    for (const track of request.tracks || []) {
        if (!track.skipReason) continue;
        counts.set(track.skipReason, (counts.get(track.skipReason) || 0) + 1);
    }
    return [...counts.entries()].map(([reason, count]) => `${count} ${labels[reason] || reason}`).join(' Â· ');
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
    panel.innerHTML = `<div class="playlist-review-heading"><span>Cáº§n xá»­ lÃ½</span><b>${requests.length}</b></div>` + requests.map(request => `
        <article class="playlist-review-card" data-playlist-request-id="${escapeDashboardHtml(request.id)}">
            <div class="playlist-review-main">
                <div><strong>${escapeDashboardHtml(request.donorName)}</strong><span>${Number(request.donationAmount || 0).toLocaleString('vi-VN')}Ä‘</span></div>
                <p>${escapeDashboardHtml(request.title || 'YÃªu cáº§u YouTube Playlist')}</p>
                <small>${escapeDashboardHtml(playlistReasonText(request))}</small>
                ${playlistIssueSummary(request) ? `<small class="playlist-review-issues">${escapeDashboardHtml(playlistIssueSummary(request))}</small>` : ''}
                <input class="dua-input playlist-review-url" id="playlist-override-${escapeDashboardHtml(request.id)}"
                    type="url" placeholder="DÃ¡n URL playlist khÃ¡c náº¿u cáº§n ghi Ä‘Ã¨">
            </div>
            <div class="playlist-review-actions">
                <button class="dua-btn" onclick="acceptPendingPlaylist('${request.id}')">Cháº¥p nháº­n</button>
                <button class="dua-btn" onclick="convertPendingPlaylistToSingle('${request.id}')">Láº¥y bÃ i Ä‘áº§u</button>
                <button class="dua-btn dua-btn-danger" onclick="rejectPendingPlaylist('${request.id}')">Tá»« chá»‘i</button>
            </div>
        </article>
    `).join('');
}

async function acceptPendingPlaylist(requestId) {
    setPlaylistProcessingStatus('Äang kiá»ƒm tra playlistâ€¦');
    try {
        const overrideUrl = document.getElementById(`playlist-override-${requestId}`)?.value?.trim() || '';
        const request = await window.electronAPI.acceptPlaylist(requestId, getPlaylistSettings(), getPlaylistBlacklistVideoIds(), overrideUrl);
        if (request?.status === 'ready') await enqueuePlaylistRequest(request);
        await renderPendingPlaylistReviews();
    } catch (error) {
        setPlaylistProcessingStatus(error.message === 'invalid_playlist_url' ? 'URL playlist ghi Ä‘Ã¨ khÃ´ng há»£p lá»‡.' : `KhÃ´ng thá»ƒ nháº­n playlist: ${error.message}`, 'error');
    }
}
window.acceptPendingPlaylist = acceptPendingPlaylist;

async function rejectPendingPlaylist(requestId) {
    await window.electronAPI.rejectPlaylist(requestId);
    await renderPendingPlaylistReviews();
}
window.rejectPendingPlaylist = rejectPendingPlaylist;

async function convertPendingPlaylistToSingle(requestId) {
    setPlaylistProcessingStatus('Äang láº¥y bÃ i há»£p lá»‡ Ä‘áº§u tiÃªnâ€¦');
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
        setPlaylistProcessingStatus('ÄÃ£ chuyá»ƒn thÃ nh bÃ i Ä‘Æ¡n.', 'success');
        setTimeout(() => setPlaylistProcessingStatus(''), 3500);
    } else {
        setPlaylistProcessingStatus('ChÆ°a tÃ¬m tháº¥y video há»£p lá»‡. HÃ£y dÃ¡n URL playlist ghi Ä‘Ã¨ rá»“i chá»n Cháº¥p nháº­n.', 'error');
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
    if (!confirm('Bá» qua toÃ n bá»™ playlist nÃ y?')) return;
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
                // ÄÃ¢y lÃ  giá»›i háº¡n hiá»‡u lá»±c cá»§a bÃ i hiá»‡n táº¡i, khÃ´ng pháº£i chá»‰ lÃ 
                // cáº¥u hÃ¬nh máº·c Ä‘á»‹nh. Khi báº¥m "PhÃ¡t háº¿t bÃ i", giÃ¡ trá»‹ pháº£i giá»¯ 0
                // cáº£ lÃºc Overlay reconnect vÃ  nháº­n snapshot má»›i.
                maxDuration: effectiveMaxDuration,
                timeLimitConfig: buildTimeLimitConfig(),
                alertActionText: state.alertActionText,
                emptyQueueMessage: state.emptyQueueMessage,
                hideEmptyOverlay: Boolean(state.hideEmptyOverlay),
                showOverlayLyrics: state.showOverlayLyrics !== false,
                focusMode: Boolean(state.focusMode),
                focusModeMessage: state.focusModeMessage,
                volume: Math.max(0, Math.min(100, Number.isFinite(Number(state.volume)) ? Math.round(Number(state.volume)) : 80)),
                // DirectStream chá»‰ Ä‘Æ°á»£c dÃ¹ng sau lá»—i iframe tháº­t sá»±; máº·c Ä‘á»‹nh báº­t Ä‘á»ƒ
                // xá»­ lÃ½ video bá»‹ cháº·n nhÃºng (101/150), trá»« khi streamer tá»± táº¯t.
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
        setPlaylistProcessingStatus('Äang kiá»ƒm tra playlistâ€¦');
    } else if (payload.type === 'playlist.validating') {
        if (data.stage === 'fetching_metadata' && data.totalItems) {
            setPlaylistProcessingStatus(`Äang láº¥y thá»i lÆ°á»£ng ${data.resolvedItems || 0}/${data.totalItems} videoâ€¦`);
        } else {
            setPlaylistProcessingStatus('Äang xÃ¡c thá»±c yÃªu cáº§u playlistâ€¦');
        }
    } else if (payload.type === 'playlist.accepted') {
        setPlaylistProcessingStatus('');
    } else if (payload.type === 'playlist.rejected') {
        const reasonLabels = {
            no_valid_tracks: 'Playlist khÃ´ng cÃ²n video há»£p lá»‡.',
            metadata_error: 'KhÃ´ng thá»ƒ láº¥y dá»¯ liá»‡u playlist tá»« YouTube.',
            playlist_disabled: 'TÃ­nh nÄƒng nháº­n playlist Ä‘ang táº¯t.',
            rejected_by_streamer: 'Playlist Ä‘Ã£ bá»‹ tá»« chá»‘i.'
        };
        setPlaylistProcessingStatus(reasonLabels[data.reason] || 'Playlist chÆ°a Ä‘Æ°á»£c Ä‘Æ°a vÃ o hÃ ng Ä‘á»£i.', 'error');
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
            console.error('KhÃ´ng thá»ƒ káº¿t thÃºc playlist track:', error);
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
    // Náº¿u chÆ°a cÃ³ thá»i lÆ°á»£ng thá»±c cá»§a bÃ i hÃ¡t, máº·c Ä‘á»‹nh cho phÃ©p Ä‘á»ƒ trÃ¡nh bá»‹ cháº·n oan lÃºc má»›i load
    if (!song.duration || song.duration <= 0) return true;
    
    const currentLimit = calculateMaxDurationForSong(song);
    return (song.duration - currentLimit) > 0;
}

function checkAndApplyExtension(donation) {
    if (!state.extensionEnabled) return false;
    if (!state.currentSong) return false;

    // KhÃ³a donate Ä‘Ã£ Ã¡p dá»¥ng gia háº¡n Ä‘Æ°á»£c lÆ°u riÃªng, khÃ´ng Ä‘Ã¡nh dáº¥u bÃ i order lÃ  Ä‘Ã£ káº¿t thÃºc.
    if (donation.id && isDonationKeyProcessed(donation.id)) {
        return false;
    }
    
    if (!isExtensionAllowedForSong(state.currentSong)) {
        logSystem(`Nháº­n code gia háº¡n tá»« <strong>${donation.name}</strong>, nhÆ°ng bÃ i hÃ¡t Ä‘Ã£ Ä‘Æ°á»£c phÃ¡t háº¿t hoáº·c thá»i lÆ°á»£ng giá»›i háº¡n Ä‘Ã£ cháº¡m tá»›i Ä‘á»™ dÃ i thá»±c táº¿ cá»§a video. KhÃ´ng Ã¡p dá»¥ng gia háº¡n.`, 'system');
        return false;
    }
    
    const message = (donation.message || '').trim();
    if (!message) return false;
    
    const activeCode = state.currentSong.extensionCode;
    if (!activeCode) return false;
    
    // TÃ¡ch tin nháº¯n thÃ nh cÃ¡c tá»« vÃ  lÃ m sáº¡ch cÃ¡c kÃ½ tá»± Ä‘áº·c biá»‡t á»Ÿ Ä‘áº§u/cuá»‘i cá»§a tá»«ng tá»«
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
            logSystem(`Nháº­n code gia háº¡n tá»« <strong>${donation.name}</strong>, nhÆ°ng sá»‘ tiá»n ${amount.toLocaleString('vi-VN')} Ä‘ khÃ´ng Ä‘á»§ Ä‘á»ƒ gia háº¡n (GiÃ¡ thiáº¿t láº­p: ${price.toLocaleString('vi-VN')} Ä‘ = ${minutes} phÃºt).`, 'system');
            return false;
        }
        
        // Chá»‰ Ä‘Ã¡nh dáº¥u lÆ°á»£t donate Ä‘Ã£ xá»­ lÃ½; bÃ i nháº¡c Ä‘i kÃ¨m váº«n Ä‘Æ°á»£c phÃ©p vÃ o Queue.
        if (donation.id) {
            markDonationKeyAsProcessed(donation.id);
        }
        
        // Ghi nháº­n lá»‹ch sá»­ vÃ  hiá»ƒn thá»‹ thÃ´ng bÃ¡o taskbar
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
        logSystem(`âž• <strong>[Gia háº¡n thÃ nh cÃ´ng]</strong> LÆ°á»£t donate tá»« <strong>${donation.name}</strong> (${amount.toLocaleString('vi-VN')} â‚«) chá»©a mÃ£ code <strong>${activeCode}</strong>. BÃ i hÃ¡t <strong>${state.currentSong.title}</strong> Ä‘Æ°á»£c cá»™ng thÃªm <strong>${minutesStr} phÃºt</strong>.`, 'system');
        showDashboardSystemAlert("Gia háº¡n thá»i gian", `LÆ°á»£t donate tá»« <strong>${donation.name}</strong> (${amount.toLocaleString('vi-VN')} â‚«) chá»©a mÃ£ code <strong>${activeCode}</strong>. BÃ i hÃ¡t <strong>${state.currentSong.title}</strong> Ä‘Æ°á»£c cá»™ng thÃªm <strong>${minutesStr} phÃºt.</strong>`);
        
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
    return amount + 'Ä‘';
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
                console.warn('[Vote Skip Playlist] Bá» qua yÃªu cáº§u rÃºt gá»n sai playlist.', {
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
                console.error('Lá»—i Ä‘á»“ng bá»™ metadata playlist sang overlay:', error);
            }
        },
        notifySuccess: song => {
            logSystem(`ðŸ—³ï¸ <strong>[Vote Skip ThÃ nh CÃ´ng]</strong> <strong>${song.title}</strong>`, 'system');
        },
        notifyPlaylistReduced: (song, reduction) => {
            const message = `Playlist Ä‘Æ°á»£c rÃºt gá»n cÃ²n ${formatTime(Math.round(reduction.keptDuration))}; Ä‘Ã£ bá» ${reduction.removedCount} video á»Ÿ cuá»‘i.`;
            logSystem(`ðŸ—³ï¸ <strong>[Vote Skip Playlist]</strong> <strong>${song.playlistTitle || song.title}</strong> â€” ${message}`, 'system');
            showDashboardSystemAlert('Vote Skip Playlist thÃ nh cÃ´ng', message);
            if (window.electronAPI?.showTaskbarNotification) {
                window.electronAPI.showTaskbarNotification('ðŸ—³ï¸ VOTE SKIP PLAYLIST', `${song.playlistTitle || song.title}\n${message}`, document.body.classList.contains('dark-mode'), 8000);
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
                ? `Playlist Ä‘Æ°á»£c rÃºt gá»n cÃ²n ${formatTime(Math.round(reduction.keptDuration))}; Ä‘Ã£ bá» ${reduction.removedCount} video á»Ÿ cuá»‘i.`
                : 'Playlist khÃ´ng cÃ²n Ä‘á»§ video Ä‘á»ƒ rÃºt gá»n thÃªm.';
            logSystem(`ðŸ—³ï¸ <strong>[Vote Skip Playlist]</strong> <strong>${song.playlistTitle || song.title}</strong> â€” ${message}`, 'system');
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
        showDashboardSystemAlert('Vote Skip Ä‘ang báº­t', 'HÃ£y táº¯t Vote Skip bÃ i hÃ¡t trÆ°á»›c khi má»Ÿ Vote Skip Playlist.');
        return;
    }
    promptVoteSkipTarget(state.voteSkipDefaultAmount, target => {
        state.playlistVoteSkip = {
            active: true, success: false, playlistRequestId: song.playlistRequestId,
            amount: 0, target, contributors: [], startedAt: Date.now()
        };
        updateVoteSkipButtonUI();
        showDashboardSystemAlert('Má»Ÿ Vote Skip Playlist', 'Quá»¹ Ä‘áº¡t má»¥c tiÃªu sáº½ rÃºt ngáº¯n 50% pháº§n playlist cÃ²n láº¡i.');
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
    title.innerHTML = `<i class="fa-solid fa-vote-yea"></i> Thiáº¿t láº­p Vote Skip`;

    const desc = document.createElement('div');
    desc.style.cssText = `
        font-family: var(--font-primary);
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--pineapple-text);
        line-height: 1.4;
        opacity: 0.85;
    `;
    desc.innerText = 'Nháº­p sá»‘ tiá»n má»¥c tiÃªu Ä‘á»ƒ kÃ­ch hoáº¡t Báº§u chá»n bá» qua bÃ i hÃ¡t nÃ y:';

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
    cancelBtn.innerText = 'Há»§y bá»';
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
    applyBtn.innerText = 'Ãp dá»¥ng';
    applyBtn.onclick = () => {
        const parsed = parseInt(input.value.replace(/[^0-9]/g, ''), 10) || 0;
        if (parsed <= 0) {
            alert('Vui lÃ²ng nháº­p sá»‘ tiá»n lá»›n hÆ¡n 0!');
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
        logSystem("KhÃ´ng cÃ³ bÃ i hÃ¡t nÃ o Ä‘ang phÃ¡t Ä‘á»ƒ má»Ÿ Vote Skip!", 'system');
        return;
    }

    if (state.currentSong.voteSkipActive) {
        state.currentSong.voteSkipActive = false;
        state.currentSong.voteSkipSuccess = false;
        logSystem(`ðŸ—³ï¸ <strong>[Táº¯t Vote Skip]</strong> ÄÃ£ táº¯t tÃ­nh nÄƒng vote skip cho bÃ i hÃ¡t: <strong>${state.currentSong.title}</strong>`, 'system');
        showDashboardSystemAlert("Táº¯t Vote Skip", `ÄÃ£ táº¯t tÃ­nh nÄƒng vote skip cho bÃ i hÃ¡t hiá»‡n táº¡i.`);
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
            
            logSystem(`ðŸ—³ï¸ <strong>[Má»Ÿ Vote Skip]</strong> ÄÃ£ báº­t tÃ­nh nÄƒng vote skip cho bÃ i hÃ¡t: <strong>${state.currentSong.title}</strong> (Má»¥c tiÃªu: ${parsedTarget.toLocaleString('vi-VN')} â‚«)`, 'system');
            showDashboardSystemAlert("Má»Ÿ Vote Skip", `ÄÃ£ báº­t tÃ­nh nÄƒng vote skip cho bÃ i hÃ¡t hiá»‡n táº¡i.`);
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
        playlistBtn.style.display = 'none';
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
                ? `ÄÃƒ RÃšT Gá»ŒN 50% (${amount.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNÄ)`
                : `${amount.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNÄ`;
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
                donors[item.name || 'KhÃ¡ch'] = (donors[item.name || 'KhÃ¡ch'] || 0) + (Number(item.amount) || 0);
            });
            const text = Object.entries(donors).sort((a, b) => b[1] - a[1])
                .map(([name, value]) => `${name} (${value.toLocaleString('vi-VN')}Ä‘)`).join(', ');
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
        btn.style.display = 'none';
        if (state.currentSong.voteSkipActive) {
            btn.classList.add('active-voteskip');
            const target = state.currentSong.voteSkipTarget || (state.currentSong.isOwnerAdd ? state.voteSkipDefaultAmount : (state.currentSong.amount || state.voteSkipDefaultAmount));
            const voteAmt = state.currentSong.voteAmount || 0;
            
            if (state.currentSong.voteSkipSuccess) {
                btn.innerHTML = `Vote skip thÃ nh cÃ´ng!`;
                btn.style.background = 'var(--pineapple-success, #4ADE80)';
                btn.style.color = '#1e293b';
                btn.style.borderColor = '#16a34a';
                btn.style.boxShadow = '3px 3px 0px #16a34a';
            } else {
                btn.innerHTML = `Äang Vote skip: ${formatMoneyShort(voteAmt)}/${formatMoneyShort(target)}`;
                btn.style.background = '';
                btn.style.color = '';
                btn.style.borderColor = '';
                btn.style.boxShadow = '';
            }
        } else {
            btn.classList.remove('active-voteskip');
            btn.innerHTML = `Má»Ÿ Vote skip`;
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
                    progressText.textContent = `VOTE SKIP THÃ€NH CÃ”NG! (${voteAmt.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNÄ)`;
                }
                if (fill) {
                    fill.style.width = '100%';
                    fill.style.background = 'var(--pineapple-success, #4ADE80)';
                }
            } else {
                if (progressText) {
                    progressText.textContent = `${voteAmt.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} VNÄ`;
                }
                if (fill) {
                    const pct = Math.min(100, Math.max(0, (voteAmt / target) * 100));
                    fill.style.width = `${pct}%`;
                    fill.style.background = 'linear-gradient(90deg, #FF5722, #FF8A65)';
                }
            }

            // Cáº­p nháº­t danh sÃ¡ch ngÆ°á»i gÃ³p pháº§n
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
                        .map(([name, amt]) => `${name} (${amt.toLocaleString('vi-VN')}Ä‘)`)
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

// --- LOGIC KÃCH HOáº T MÃƒ THÃŠM LÆ¯á»¢T ---
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
            errEl.textContent = 'Vui lÃ²ng nháº­p mÃ£ kÃ­ch hoáº¡t!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    const result = getActionCodeService().redeem(code);
    if (!result.success && result.reason === 'invalid') {
        if (errEl) {
            errEl.textContent = 'MÃ£ kÃ­ch hoáº¡t khÃ´ng Ä‘Ãºng hoáº·c khÃ´ng há»£p lá»‡!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    // Kiá»ƒm tra trÃ¹ng láº·p
    if (!result.success && result.reason === 'used') {
        if (errEl) {
            errEl.textContent = 'MÃ£ kÃ­ch hoáº¡t nÃ y Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng trÆ°á»›c Ä‘Ã³!';
            errEl.style.display = 'block';
        }
        if (successEl) successEl.style.display = 'none';
        return;
    }
    
    // Há»£p lá»‡, tiáº¿n hÃ nh lÆ°u trá»¯
    if (errEl) errEl.style.display = 'none';
    if (successEl) {
        successEl.textContent = `ThÃªm thÃ nh cÃ´ng +${result.amount} lÆ°á»£t sá»­ dá»¥ng!`;
        successEl.style.display = 'block';
    }
    
    updateRateLimitUI();
    
    // Tá»± Ä‘á»™ng Ä‘Ã³ng modal sau 1.2s
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

// --- LOGIC KHá»žI Äáº¦U KHI TRANG LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    getDashboardBootstrapController().initQuickAddUi();
    getDashboardBootstrapController().initSettingsUi();
    // Sá»­a lá»—i máº¥t focus bÃ n phÃ­m cá»§a Electron frameless window trÃªn Windows khi click vÃ o input
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            if (window.electronAPI && typeof window.electronAPI.focusWindow === 'function') {
                window.electronAPI.focusWindow();
            }
        }
    });


    // Kiá»ƒm tra vÃ  gáº¯n class náº¿u cháº¡y trÃªn há»‡ Ä‘iá»u hÃ nh Windows Ä‘á»ƒ dÃ¹ng Titlebar Overlay
    const isWindows = navigator.userAgent.toLowerCase().includes('windows');
    if (isWindows) {
        document.body.classList.add('window-overlay-active');
    }

    // Khá»Ÿi Ä‘á»™ng monitor káº¿t ná»‘i dá»‹ch vá»¥
    startServiceMonitorLoop();

    // Sá»­a lá»—i focus cho cÃ¡c Ã´ nháº­p liá»‡u (Ä‘áº·c biá»‡t trong vÃ¹ng titlebar no-drag cá»§a Electron trÃªn Windows)
    document.addEventListener('mousedown', (e) => {
        const target = e.target.closest('input, textarea, select');
        if (target) {
            setTimeout(() => {
                target.focus();
            }, 15);
        }
    }, true);



    // Dá»n dáº¹p dá»¯ liá»‡u hÃ ng Ä‘á»£i vÃ  tráº¡ng thÃ¡i bÃ i hÃ¡t cÅ© tá»« phiÃªn trÆ°á»›c
    localStorage.removeItem('dua_music_queue');
    localStorage.removeItem('dua_current_song');

    // Láº¥y phiÃªn báº£n á»©ng dá»¥ng Ä‘á»™ng tá»« main process
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
        window.electronAPI.getAppVersion().then((ver) => {
            const verDisplay = document.getElementById('app-version-display');
            if (verDisplay) {
                verDisplay.textContent = `v${ver}`;
                verDisplay.style.cursor = 'pointer';
                verDisplay.title = "PhiÃªn báº£n á»©ng dá»¥ng";

                // Click 5 láº§n vÃ o phiÃªn báº£n Ä‘á»ƒ kÃ­ch hoáº¡t tab After Credit bÃ­ máº­t (Easter Egg)
                let versionClicks = 0;
                verDisplay.addEventListener('click', () => {
                    versionClicks++;
                    if (versionClicks === 5) {
                        localStorage.setItem('dua_aftercredit_unlocked', 'true');
                        const afterCreditBtn = document.getElementById('menu-btn-aftercredit');
                        if (afterCreditBtn) {
                            afterCreditbtn.style.display = 'none';
                            showDashboardSystemAlert("Má»Ÿ khÃ³a bÃ­ máº­t", "ÄÃ£ kÃ­ch hoáº¡t tab After Credit bÃ­ máº­t! ðŸŽ", "BÃ Máº¬T");
                        }
                    }
                });
            }

            // Hiá»ƒn thá»‹ nÃºt tab After Credit náº¿u Ä‘Ã£ Ä‘Æ°á»£c má»Ÿ khÃ³a trÆ°á»›c Ä‘Ã³
            if (localStorage.getItem('dua_aftercredit_unlocked') === 'true') {
                const afterCreditBtn = document.getElementById('menu-btn-aftercredit');
                if (afterCreditBtn) {
                    afterCreditbtn.style.display = 'none';
                }
            }

            // Hiá»ƒn thá»‹ walkthrough láº§n Ä‘áº§u sau khi nÃ¢ng cáº¥p phiÃªn báº£n má»›i
            const lastSeenVersion = localStorage.getItem('dua_last_seen_version');
            if (lastSeenVersion !== ver) {
                showWalkthroughModal(ver);
            }
            localStorage.setItem('dua_last_seen_version', ver);
        });
    }

    getDashboardBootstrapController().initPlaybackUi();

    getDashboardBootstrapController().initQueueUi();

    // Cáº¥u hÃ¬nh hiá»ƒn thá»‹ Ã´ nhÃºng OBS vÃ  khá»Ÿi táº¡o realtime database
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
            badgeEl.title = "Äang Báº¬T Ã¢m thanh vÃ²m Dolby Atmos Spatial Audio (Click Ä‘á»ƒ Táº®T)";
            showDashboardSystemAlert("Dolby Atmos", "ÄÃ£ Báº¬T cháº¿ Ä‘á»™ Ã‚m thanh vÃ²m Dolby Atmos Spatial Audio cao cáº¥p!", "DOLBY");
        } else {
            badgeEl.classList.remove('active');
            badgeEl.title = "Äang Táº®T Ã¢m thanh vÃ²m Dolby Atmos Spatial Audio (Click Ä‘á»ƒ Báº¬T)";
            showDashboardSystemAlert("Dolby Atmos", "ÄÃ£ Táº®T cháº¿ Ä‘á»™ Ã‚m thanh vÃ²m Dolby Atmos", "DOLBY");
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



    // Láº¯ng nghe tráº¡ng thÃ¡i phÃ³ng to cá»­a sá»•
    if (window.electronAPI && typeof window.electronAPI.onWindowStateChange === 'function') {
        window.electronAPI.onWindowStateChange((state) => {
            const maxBtnIcon = document.querySelector('.btn-maximize i');
            if (maxBtnIcon) {
                if (state === 'maximized') {
                    maxBtnIcon.className = 'fa-regular fa-clone'; // Icon 2 Ã´ vuÃ´ng
                } else {
                    maxBtnIcon.className = 'fa-regular fa-square'; // Icon 1 Ã´ vuÃ´ng
                }
            }
        });
    }

    // --- KIá»‚M TRA VÃ€ Táº¢I Báº¢N Cáº¬P NHáº¬T Tá»° Äá»˜NG ---
    if (window.electronAPI && typeof window.electronAPI.checkForUpdates === 'function') {
        const updateWidget = document.getElementById('app-update-widget');
        const updateText = document.getElementById('app-update-text');

        window.electronAPI.checkForUpdates().then((result) => {
            if (result && result.hasUpdate) {
                if (updateWidget && updateText) {
                    updateText.innerHTML = `ÄÃ£ cÃ³ báº£n cáº­p nháº­t má»›i (<strong>${result.latestVersion}</strong>)`;
                    updateWidget.style.display = 'flex';

                    updateWidget.onclick = () => {
                        // VÃ´ hiá»‡u hÃ³a click trÃ¹ng láº·p
                        updateWidget.onclick = null;
                        updateWidget.style.cursor = 'default';
                        updateWidget.style.pointerEvents = 'none';
                        updateWidget.style.opacity = '0.8';
                        updateText.textContent = 'Äang táº£i... 0%';

                        window.electronAPI.startUpdate(result.downloadUrl);
                    };
                }
            }
        }).catch((err) => {
            console.error("Lá»—i kiá»ƒm tra báº£n cáº­p nháº­t:", err);
        });

        // Láº¯ng nghe tiáº¿n trÃ¬nh táº£i
        if (typeof window.electronAPI.onUpdateProgress === 'function') {
            window.electronAPI.onUpdateProgress((progress) => {
                if (updateText) {
                    updateText.textContent = `Äang táº£i... ${progress}%`;
                }
            });
        }

        // Láº¯ng nghe khi táº£i xong vÃ  khá»Ÿi cháº¡y trÃ¬nh cÃ i Ä‘áº·t
        if (typeof window.electronAPI.onUpdateDownloaded === 'function') {
            window.electronAPI.onUpdateDownloaded(() => {
                if (updateText) {
                    updateText.textContent = 'Äang cháº¡y trÃ¬nh cÃ i Ä‘áº·t...';
                }
            });
        }

        // Láº¯ng nghe khi cÃ³ lá»—i
        if (typeof window.electronAPI.onUpdateError === 'function') {
            window.electronAPI.onUpdateError((err) => {
                if (updateWidget && updateText) {
                    updateText.textContent = 'Lá»—i cáº­p nháº­t! Báº¥m Ä‘á»ƒ thá»­ láº¡i';
                    updateWidget.style.cursor = 'pointer';
                    updateWidget.style.pointerEvents = 'auto';
                    updateWidget.style.opacity = '1';
                    
                    // GÃ¡n láº¡i sá»± kiá»‡n click Ä‘á»ƒ thá»­ láº¡i
                    updateWidget.onclick = () => {
                        updateWidget.onclick = null;
                        updateWidget.style.cursor = 'default';
                        updateWidget.style.pointerEvents = 'none';
                        updateWidget.style.opacity = '0.8';
                        updateText.textContent = 'Kiá»ƒm tra láº¡i...';
                        
                        window.electronAPI.checkForUpdates().then((r) => {
                            if (r && r.hasUpdate) {
                                updateText.textContent = 'Äang táº£i... 0%';
                                window.electronAPI.startUpdate(r.downloadUrl);
                            } else {
                                updateWidget.style.display = 'none';
                            }
                        }).catch(() => {
                            updateText.textContent = 'Lá»—i cáº­p nháº­t! Báº¥m Ä‘á»ƒ thá»­ láº¡i';
                            updateWidget.style.cursor = 'pointer';
                            updateWidget.style.pointerEvents = 'auto';
                            updateWidget.style.opacity = '1';
                        });
                    };
                }
                alert(`Lá»—i khi táº£i báº£n cáº­p nháº­t: ${err}`);
            });
        }
    }
    
    // Render danh sÃ¡ch lá»‹ch sá»­ lá»i nháº¯n donate
    migrateDonationHistoryToSqlite().then(() => {
        renderDonationHistory();
    });

    setTimeout(() => {
        const loadingScreen = document.getElementById('app-loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 800); // Khá»›p vá»›i thá»i gian transition opacity 0.8s trong CSS
        }
    }, 5000); // TÄƒng thá»i gian hiá»ƒn thá»‹ lÃªn 5 giÃ¢y (theo yÃªu cáº§u)
    // Khá»Ÿi táº¡o lá»‹ch sá»­ thÃ´ng bÃ¡o
    if (typeof loadNotificationsHistory === 'function') {
        loadNotificationsHistory();
    }

    // Click bÃªn ngoÃ i Ä‘á»ƒ Ä‘Ã³ng dropdown thÃ´ng bÃ¡o
    document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.notification-center-wrapper');
        const dropdown = document.getElementById('notification-center-dropdown');
        if (wrapper && dropdown && dropdown.classList.contains('visible') && !wrapper.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });

    // Click bÃªn ngoÃ i Ä‘á»ƒ Ä‘Ã³ng modal chi tiáº¿t donate
    const donationDetailModal = document.getElementById('donation-detail-modal');
    if (donationDetailModal) {
        donationDetailModal.addEventListener('click', (e) => {
            if (e.target === donationDetailModal) {
                closeDonationDetailModal();
            }
        });
    }
});

// --- HÃ€M GHI LOG Há»† THá»NG ---
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
        tagText = 'Lá»—i';
        tagClass = 'log-tag-error';
    }

    entry.innerHTML = `
        <span class="log-tag ${tagClass}">${tagText}</span>
        <span>${message}</span>
    `;

    logBox.appendChild(entry);
    
    // Giá»›i háº¡n tá»‘i Ä‘a 100 dÃ²ng log Ä‘á»ƒ trÃ¡nh trÃ n RAM/náº·ng trang khi treo mÃ¡y lÃ¢u
    while (logBox.children.length > 100) {
        logBox.removeChild(logBox.firstChild);
    }
    
    // ÄÃ£ loáº¡i bá» tá»± Ä‘á»™ng cuá»™n (auto scroll) theo yÃªu cáº§u ngÆ°á»i dÃ¹ng
    
    // Ghi log ra file ngoÃ i .txt thÃ´ng qua IPC (ÄÃ£ táº¯t theo yÃªu cáº§u ngÆ°á»i dÃ¹ng Ä‘á»ƒ trÃ¡nh náº·ng mÃ¡y)
    /*
    if (window.electronAPI && typeof window.electronAPI.saveLogEntry === 'function') {
        const cleanMessage = message.replace(/<\/?[^>]+(>|$)/g, "").replace(/&nbsp;/g, " ");
        window.electronAPI.saveLogEntry(`[${tagText}] ${cleanMessage}`);
    }
    */
}

// HÃ m má»Ÿ file log hoáº¡t Ä‘á»™ng bÃªn ngoÃ i á»©ng dá»¥ng
async function openExternalLogFile() {
    if (window.electronAPI && typeof window.electronAPI.openLogFile === 'function') {
        try {
            const result = await window.electronAPI.openLogFile();
            if (!result.success) {
                logSystem(`KhÃ´ng thá»ƒ má»Ÿ file log: ${result.error}`, 'error');
            }
        } catch (err) {
            logSystem(`Lá»—i khi má»Ÿ file log: ${err.message}`, 'error');
        }
    } else {
        alert("TÃ­nh nÄƒng nÃ y chá»‰ há»— trá»£ khi cháº¡y trÃªn á»©ng dá»¥ng Introvert Player Desktop.");
    }
}

// --- HÃ€M Xá»¬ LÃ Lá»–I PHÃT NHáº C (NHÃšNG Bá»Š CHáº¶N) ---
function handlePlayerError(code, title) {
    let errorDescription = "Lá»—i chÆ°a xÃ¡c Ä‘á»‹nh";
    if (code === 101 || code === 150) {
        errorDescription = "HÃ£ng Ä‘Ä©a sá»Ÿ há»¯u Ä‘Ã£ cháº·n tÃ­nh nÄƒng phÃ¡t nhÃºng (Embedding Disabled) cá»§a video nÃ y trÃªn cÃ¡c trang web/á»©ng dá»¥ng ngoÃ i.";
    } else if (code === 2) {
        errorDescription = "ID video YouTube khÃ´ng há»£p lá»‡.";
    } else if (code === 100) {
        errorDescription = "Video khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ bá»‹ xÃ³a / chuyá»ƒn sang cháº¿ Ä‘á»™ riÃªng tÆ°.";
    } else if (code === 5) {
        errorDescription = "KhÃ´ng thá»ƒ phÃ¡t video nÃ y trong trÃ¬nh phÃ¡t HTML5.";
    } else if (code === 'drm_protected') {
        errorDescription = "Video dÃ¹ng DRM: cáº£ YouTube iframe láº«n DirectStream Ä‘á»u khÃ´ng cÃ³ nguá»“n media cÃ³ thá»ƒ phÃ¡t trong OBS.";
    } else if (code === 'authentication_required') {
        errorDescription = "YouTube yÃªu cáº§u xÃ¡c thá»±c chá»‘ng bot nÃªn DirectStream khÃ´ng thá»ƒ láº¥y URL phÃ¡t.";
    } else if (code === 'embedding_disabled') {
        errorDescription = "Chá»§ video Ä‘Ã£ táº¯t phÃ¡t nhÃºng vÃ  nguá»“n DirectStream thay tháº¿ cÅ©ng khÃ´ng kháº£ dá»¥ng.";
    } else if (code === 'format_unavailable') {
        errorDescription = "YouTube khÃ´ng cung cáº¥p luá»“ng DirectStream nÃ o cÃ³ chá»©a audio cho video nÃ y.";
    } else if (code === 'resolver_timeout') {
        errorDescription = "DirectStream máº¥t quÃ¡ nhiá»u thá»i gian Ä‘á»ƒ phÃ¢n giáº£i nguá»“n phÃ¡t.";
    } else if (code === 'direct_stream_hls_failed') {
        errorDescription = "Nguá»“n HLS dá»± phÃ²ng Ä‘Ã£ táº£i Ä‘Æ°á»£c nhÆ°ng OBS khÃ´ng thá»ƒ tiáº¿p tá»¥c phÃ¡t sau khi thá»­ phá»¥c há»“i.";
    } else if (code === 'direct_stream_play_failed' || code === 'direct_stream_resolution_failed' || code === 'yt_dlp_failed') {
        errorDescription = "Iframe khÃ´ng phÃ¡t Ä‘Æ°á»£c vÃ  nguá»“n DirectStream dá»± phÃ²ng cÅ©ng tháº¥t báº¡i.";
    }

    const fullMsg = `BÃ i hÃ¡t: <strong>${title}</strong> gáº·p sá»± cá»‘ phÃ¡t.<br><br>
        <span style="color: var(--pineapple-orange-dark); font-weight: 800;"><i class="fa-solid fa-triangle-exclamation"></i> Chi tiáº¿t:</span> ${errorDescription}<br><br>
        <em>Há»‡ thá»‘ng Ä‘Ã£ tá»± Ä‘á»™ng bá» qua Ä‘á»ƒ phÃ¡t bÃ i tiáº¿p theo. HÃ£y chá»n báº£n nháº¡c khÃ¡c thay tháº¿ (vÃ­ dá»¥: báº£n Vietsub, Lyric do fan Ä‘Äƒng táº£i).</em>`;

    logSystem(`Lá»—i phÃ¡t bÃ i "${title}" (MÃ£ lá»—i: ${code}). Chi tiáº¿t: ${errorDescription}`, "error");
    // DÃ¹ng cÃ¹ng má»™t Ä‘Æ°á»ng chuyá»ƒn bÃ i vá»›i nÃºt Next/Vote Skip. KhÃ´ng Ä‘á»ƒ
    // player_error tá»± xÃ¢y thÃªm má»™t cÆ¡ cháº¿ queue riÃªng gÃ¢y double skip.
    skipSong(false, 'player_error_' + code);
    // Hiá»ƒn thá»‹ sau thÃ´ng bÃ¡o skip Ä‘á»ƒ pháº§n giáº£i thÃ­ch lá»—i váº«n lÃ  thÃ´ng bÃ¡o cuá»‘i.
    showDashboardSystemAlert("Lá»—i trÃ¬nh phÃ¡t", fullMsg, "Lá»–I PHÃT NHáº C");
}

// --- MÃ” PHá»ŽNG THÃŠM LINK NHANH MáºªU ---
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

// --- TRÃCH XUáº¤T YOUTUBE VIDEO ID ---
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
    if (!videoId) throw new Error('KhÃ´ng tÃ¬m tháº¥y YouTube video ID Ä‘á»ƒ debug.');

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
    console.groupCollapsed(`[Lyrics Debug] ${videoId} Â· ${report?.result?.reason || (report?.result?.available ? 'matched' : 'unknown')}`);
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

// --- TRÃCH XUáº¤T SPOTIFY TRACK ID ---
function parseYoutubePlaylistId(rawUrl) {
    return getMediaParserService().parseYoutubePlaylistId(rawUrl);
}

function parseSpotifyTrackId(url) {
    return getMediaParserService().parseSpotifyTrackId(url);
}

// --- THÃŠM BÃ€I HÃT NHANH Báº°NG LINK ---
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
        alert('PhiÃªn báº£n á»©ng dá»¥ng hiá»‡n táº¡i chÆ°a há»— trá»£ thÃªm playlist tá»« Quick Add.');
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
        searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang táº£i playlist YouTube...</div>';
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
            showDashboardSystemAlert('ÄÃ£ thÃªm playlist', `${escapeDashboardHtml(request.title)} Â· ${added.length} video`, 'HÃ€NG Äá»¢I');
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
        const reason = request.rejectionText || 'Playlist cáº§n Ä‘Æ°á»£c kiá»ƒm tra trÆ°á»›c khi thÃªm vÃ o hÃ ng Ä‘á»£i.';
        if (searchResultsContainer) {
            searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error);">${escapeDashboardHtml(reason)}</div>`;
        }
    } catch (error) {
        console.error('Quick Add playlist failed:', error);
        const message = error?.message === 'invalid_playlist_url'
            ? 'ÄÆ°á»ng dáº«n playlist YouTube khÃ´ng há»£p lá»‡.'
            : `KhÃ´ng thá»ƒ táº£i playlist: ${error.message}`;
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
            searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang tÃ¬m kiáº¿m trÃªn YouTube...</div>';
            searchResultsContainer.style.display = 'flex';
            
            try {
                const result = await getDashboardSearchService().searchYouTube(url);
                if (result && result.success && result.videos && result.videos.length > 0) {
                    getDashboardSearchService().renderResults(result.videos, 'quick-add-search-results');
                    getDashboardSearchService().addResultToQueue(result.videos[0]);
                } else if (result && result.error) {
                    searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i: ${result.error}</div>`;
                } else {
                    searchResultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">KhÃ´ng tÃ¬m tháº¥y káº¿t quáº£ phÃ¹ há»£p!</div>';
                }
            } catch (e) {
                searchResultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i káº¿t ná»‘i máº¡ng!</div>`;
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
        alert("á»¨ng dá»¥ng Ä‘Ã£ ngá»«ng há»— trá»£ phÃ¡t nháº¡c tá»« Spotify. Vui lÃ²ng sá»­ dá»¥ng link YouTube hoáº·c SoundCloud!");
        return;
    }
    if (classifiedMedia.kind !== 'track') {
        alert("ÄÆ°á»ng dáº«n bÃ i hÃ¡t khÃ´ng há»£p lá»‡. Vui lÃ²ng nháº­p link YouTube hoáº·c SoundCloud!");
        return;
    }
    logSystem(`Äang láº¥y thÃ´ng tin bÃ i hÃ¡t tá»« ${classifiedMedia.type.toUpperCase()}...`, 'queue');

    try {
        const resolvedMedia = await getQuickAddService().resolve(url);
        const nameInput = document.getElementById('quick-donor-name');
        const donorName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "mÃ¨o 3k";
        const amountInput = document.getElementById('quick-donor-amount');
        const donorAmount = (amountInput && amountInput.value.trim() !== '') ? Number(amountInput.value) : 100000000;
        const ownerAddCheckbox = document.getElementById('quick-owner-add');
        const isOwnerAdd = ownerAddCheckbox ? ownerAddCheckbox.checked : false;
        const newSong = getQuickAddService().createSong(resolvedMedia, { donorName, amount: donorAmount, isOwnerAdd });

        insertSongSmartly(newSong);
        broadcastNewDonationAlert(newSong);
        saveQueue();
        sortAndRefreshQueue();
        
        logSystem(`ÄÃ£ thÃªm nhanh bÃ i hÃ¡t: <strong>${newSong.title}</strong> (${newSong.type.toUpperCase()})`, 'queue');
        showDashboardSystemAlert("ÄÃ£ thÃªm nháº¡c nhanh", `ÄÃ£ thÃªm nhanh bÃ i hÃ¡t: <strong>${newSong.title}</strong>`, 'HÃ€NG Äá»¢I');
        
        clearQuickSearch();
        if (nameInput) nameInput.value = '';
        if (amountInput) amountInput.value = '';

        // áº¨n popover thÃªm nhanh
        const quickAddPopover = document.getElementById('quick-add-popover');
        if (quickAddPopover) quickAddPopover.classList.remove('visible');

        if (!state.currentSong && !state.focusMode) {
            playNextInQueue();
        }

    } catch (error) {
        console.error("Error fetching track metadata: ", error);
        alert("Lá»—i khi táº£i thÃ´ng tin bÃ i hÃ¡t. Vui lÃ²ng kiá»ƒm tra láº¡i káº¿t ná»‘i máº¡ng!");
    }
}

// --- Äá»’NG Bá»˜ TRáº NG THÃI SANG OBS OVERLAY WEB (LOCALSTORAGE BROADCAST) ---
// --- PHÃT THÃ”NG BÃO DONATE Má»šI LÃŠN OBS OVERLAY ---
async function broadcastNewDonationAlert(song) {
    if (!song) return;
    
    if ((song.type === 'youtube' || song.type === 'soundcloud') && !song.duration) {
        resolveSongDuration(song);
    }
    
    // Náº¿u lÃ  chá»§ kÃªnh thÃªm nháº¡c, phÃ¡t thÃ´ng bÃ¡o "ÄÃ£ thÃªm nháº¡c" riÃªng thay vÃ¬ alert donate
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
        
        // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o trÃªn Dashboard
        showDashboardOwnerAddToast(song);
        
        // ThÃ´ng bÃ¡o taskbar phi táº­p trung (khÃ´ng cÆ°á»›p focus)
        if (!song.isExtensionAdd && window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            window.electronAPI.showTaskbarNotification(
                'ÄÃ£ thÃªm bÃ i hÃ¡t má»›i',
                song.title || 'BÃ i hÃ¡t khÃ´ng rÃµ tÃªn',
                document.body.classList.contains('dark-mode'),
                3000
            );
        }
        return;
    }

    if (song.isQuickAdd) {
        // ThÃ´ng bÃ¡o taskbar phi táº­p trung (khÃ´ng cÆ°á»›p focus) cho nháº¡c thÃªm nhanh
        if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
            window.electronAPI.showTaskbarNotification(
                'ThÃªm nhanh tá»« app',
                song.title || 'BÃ i hÃ¡t khÃ´ng rÃµ tÃªn',
                document.body.classList.contains('dark-mode'),
                3000
            );
        }
    }
    // ThÃ´ng bÃ¡o taskbar cho nháº¡c order tá»« donate Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ trong handleNewDonation Ä‘á»ƒ trÃ¡nh láº·p
    
    // TÃ¬m vá»‹ trÃ­ cá»§a bÃ i hÃ¡t trong hÃ ng Ä‘á»£i sau khi sáº¯p xáº¿p Ä‘á»ƒ gá»­i Ä‘i chÃ­nh xÃ¡c
    let tempQueue = [...state.queue];
    if (!tempQueue.some(s => String(s.id) === String(song.id))) {
        tempQueue.push(song);
    }

    let positionStr = '';

    if (state.currentSong) {
        if (String(song.id) === String(state.currentSong.id)) {
            positionStr = 'Äang phÃ¡t';
        } else {
            // Lá»c bá» bÃ i Ä‘ang phÃ¡t khá»i hÃ ng Ä‘á»£i Ä‘á»ƒ tÃ­nh vá»‹ trÃ­ cÃ¡c bÃ i phÃ­a sau báº¯t Ä‘áº§u tá»« #1
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
                positionStr = 'Tiáº¿p theo';
            } else {
                positionStr = idx !== -1 ? `#${idx + 1}` : '#-';
            }
        }
    } else {
        // ChÆ°a cÃ³ bÃ i hÃ¡t nÃ o Ä‘ang phÃ¡t, bÃ i Ä‘áº§u tiÃªn trong hÃ ng Ä‘á»£i sáº¯p xáº¿p sáº½ Ä‘Æ°á»£c phÃ¡t luÃ´n
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
            positionStr = 'Äang phÃ¡t';
        } else if (idx === 1) {
            positionStr = 'Tiáº¿p theo';
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
        donorName: String(song.donorName || 'KhÃ¡ch').trim(),
        amount: Number(song.amount) || 0,
        title: String(song.title || 'Nháº¡c Youtube').trim(),
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
        timestamp: Date.now() + Math.random() // TrÃ¡nh trÃ¹ng láº·p sá»± kiá»‡n storage
    };
    
    localStorage.setItem('dua_new_donation_alert', JSON.stringify(alertPayload));
    
    // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o trÃªn Dashboard
    showDashboardNewDonationAlert(alertPayload);
    
    // Realtime database broadcast
    logSystem(`ðŸ“¡ <strong>[Alert â†’ Overlay]</strong> Äang gá»­i new_donation_alert: <strong>${alertPayload.donorName}</strong> | ${alertPayload.title} | pos=${alertPayload.position}`, 'system');
    publishMqtt('new_donation_alert', alertPayload);
}

// --- LÆ¯U TRá»® HÃ€NG Äá»¢I VÃ€O LOCALSTORAGE ---
function saveQueue() {
    const duplicateCount = dedupeZyPageQueue();
    if (duplicateCount > 0) {
        logSystem(`Da tu dong don ${duplicateCount} ban ghi ZyPage bi trung trong hang doi.`, 'system');
    }
    localStorage.setItem('dua_queue', JSON.stringify(state.queue));
    publishRealtimeQueueUpdated();
}

// --- Sáº®P Xáº¾P VÃ€ Váº¼ Láº I HÃ€NG Äá»¢I ---
function sortAndRefreshQueue(forceSort = false) {
    state.queue = window.DashboardQueueService.sort(state.queue, {
        currentSong: state.currentSong,
        sortConfig: state.sortConfig,
        forceSort
    });

    saveQueue();
    renderQueue();
    
    // Cáº­p nháº­t vÃ  gá»­i láº¡i thÃ´ng tin bÃ i hÃ¡t tiáº¿p theo náº¿u Ä‘ang phÃ¡t
    if (state.currentSong) {
        updateNextSongInCurrentPayload();
    }
}

function onSortConfigChange(val) {
    state.sortConfig = val;
    localStorage.setItem('dua_sort_config', val);
    logSystem(`Thay Ä‘á»•i thá»© tá»± Æ°u tiÃªn hÃ ng Ä‘á»£i: ${val === 'amount' ? 'Sá»‘ tiá»n' : 'Thá»i gian'}`);
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
            console.info(`[Duration] ÄÃ£ láº¥y thá»i lÆ°á»£ng cho ${song.title || song.id} sau ${attempts} láº§n.`);
        },
        onError: (error, attempts) => {
            console.warn(`[Duration] Láº§n ${attempts} chÆ°a láº¥y Ä‘Æ°á»£c thá»i lÆ°á»£ng ${song.title || song.id}:`, error.message || error);
        }
    });
}

// --- RENDER DANH SÃCH HÃ€NG Äá»¢I LÃŠN HTML ---

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
    return `<span class="queue-new-badge" style="--queue-new-badge-lifetime:${Math.ceil(remainingMs)}ms" onanimationend="this.remove()">Má»šI</span>`;
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
    const title = escapeDashboardHtml(song.title || 'ChÆ°a cÃ³ tÃªn bÃ i hÃ¡t');
    const donor = escapeDashboardHtml(song.donorName || 'KhÃ¡ch');
    const amount = Number(song.amount || 0).toLocaleString('vi-VN') + 'Ä‘';
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    const realIndex = state.queue.findIndex(item => String(item.id) === String(song.id));
    const songUrl = getQueueSongUrl(song);
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')" title="Má»Ÿ trÃªn trÃ¬nh duyá»‡t">${title}</a>`
        : title;
    const playlistChip = song.playlistRequestId
        ? `<span class="queue-playlist-chip"><i class="fa-solid fa-layer-group"></i> Playlist Â· Video ${song.playlistPosition}/${song.playlistTotalTracks}</span>`
        : '';
    const ownerLabel = song.isOwnerAdd ? 'Chá»§ kÃªnh' : donor;
    const statusLabel = isCurrent ? (state.isPlaying ? 'Äang phÃ¡t' : 'ÄÃ£ táº¡m dá»«ng') : '';

    return `
        <article class="queue-card-v2 ${isCurrent ? 'is-playing' : 'is-waiting'} ${child ? 'is-playlist-child' : ''}" data-song-id="${escapeDashboardHtml(String(song.id))}">
            ${child ? '' : `<header class="queue-card-v2-head"><span title="${ownerLabel}">${ownerLabel}</span><b>${song.isOwnerAdd ? 'Chá»§ kÃªnh thÃªm' : amount}</b></header>`}
            <div class="queue-card-v2-body">
                <div class="queue-card-v2-thumb"><img src="${thumbnail}" alt="" loading="lazy">${isCurrent ? '<span class="queue-equalizer" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</div>
                <div class="queue-card-v2-copy">
                    <div class="queue-card-v2-title">${linkedTitle}</div>
                    <div class="queue-card-v2-channel" title="${channelName}">${channelName || 'KÃªnh YouTube'}</div>
                    <div class="queue-card-v2-meta">${playlistChip}${statusLabel ? `<span class="queue-state-chip">${statusLabel}</span>` : ''}</div>
                </div>
                <div class="queue-card-v2-actions">
                    ${isCurrent ? `
                        ${song.playlistRequestId ? `<button title="${state.isPlaying ? 'Táº¡m dá»«ng playlist' : 'Tiáº¿p tá»¥c playlist'}" onclick="toggleCurrentPlaylistPause()"><i class="fa-solid fa-${state.isPlaying ? 'pause' : 'play'}"></i></button>` : ''}
                        <button title="Bá» qua bÃ i nÃ y" onclick="skipSong(true)"><i class="fa-solid fa-forward-step"></i></button>
                        ${song.playlistRequestId ? `<button class="danger" title="Bá» toÃ n bá»™ playlist" onclick="skipEntirePlaylist('${song.playlistRequestId}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                    ` : `
                        ${!child ? `<button title="${song.isPinned ? 'Bá» ghim' : 'Ghim bÃ i'}" onclick="togglePinQueueItem('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>` : ''}
                        ${!child && realIndex > 0 ? `<button title="Di chuyá»ƒn lÃªn" onclick="moveQueueEntryV2('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>` : ''}
                        ${!child && realIndex >= 0 && realIndex < state.queue.length - 1 ? `<button title="Di chuyá»ƒn xuá»‘ng" onclick="moveQueueEntryV2('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>` : ''}
                        <button title="PhÃ¡t ngay" onclick="userForcePlaySong('${song.id}')"><i class="fa-solid fa-play"></i></button>
                        <button title="XÃ³a bÃ i" onclick="userRemoveSongFromQueue('${song.id}')"><i class="fa-solid fa-xmark"></i></button>
                    `}
                </div>
            </div>
            ${isCurrent ? '' : `<div class="queue-waiting-duration"><i class="fa-regular fa-clock"></i> ${duration > 0 ? formatTime(duration) : 'Äang láº¥y thá»i lÆ°á»£ng'}</div>`}
        </article>
    `;
}

function renderQueueSongCardV2(song, options = {}) {
    const isCurrent = Boolean(options.isCurrent);
    const channelName = escapeDashboardHtml(getDashboardChannelName(song));
    const title = escapeDashboardHtml(song.title || 'ChÆ°a cÃ³ tÃªn bÃ i hÃ¡t');
    const donor = escapeDashboardHtml(song.donorName || 'KhÃ¡ch');
    const amount = Number(song.amount || 0).toLocaleString('vi-VN') + ' VNÄ';
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    const realIndex = state.queue.findIndex(item => String(item.id) === String(song.id));
    const songUrl = getQueueSongUrl(song);
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')">${title}</a>`
        : title;
    const donorLine = song.isOwnerAdd
        ? '<span>Chá»§ kÃªnh thÃªm</span>'
        : `<span>${donor}</span><b>${amount}</b>`;
    const newBadge = renderQueueNewBadge(song);

    return `
        <article class="queue-card-v2 queue-card-classic ${isCurrent ? 'is-playing' : 'is-waiting'}" data-song-id="${escapeDashboardHtml(String(song.id))}">
            <div class="queue-card-v2-body">
                <div class="queue-card-v2-thumb">
                    <img src="${thumbnail}" alt="" loading="lazy">
                    ${isCurrent ? '<span class="queue-equalizer" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
                </div>
                <div class="queue-card-v2-copy">
                    <div class="queue-card-v2-title">${linkedTitle}${newBadge}</div>
                    <div class="queue-card-v2-channel" title="${channelName}">${channelName || 'KÃªnh YouTube'}</div>
                    <div class="queue-card-classic-footer">
                        <div class="queue-card-classic-donor">${donorLine}</div>
                        <div class="queue-card-classic-controls">
                            <span class="queue-card-classic-duration"><i class="fa-regular fa-clock"></i> ${duration > 0 ? formatTime(duration) : '--:--'}</span>
                            <div class="queue-card-v2-actions">
                                ${isCurrent ? `
                                    <button class="primary" title="${state.isPlaying ? 'Táº¡m dá»«ng' : 'Tiáº¿p tá»¥c'}" onclick="togglePlayPause()"><i class="fa-solid fa-${state.isPlaying ? 'pause' : 'play'}"></i></button>
                                    <button title="Bá» qua bÃ i nÃ y" onclick="skipSong(true)"><i class="fa-solid fa-forward-step"></i></button>
                                ` : `
                                    <button class="${song.isPinned ? 'active' : ''}" title="${song.isPinned ? 'Bá» ghim' : 'Ghim bÃ i'}" onclick="togglePinQueueItem('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>
                                    ${realIndex > 0 ? `<button title="Di chuyá»ƒn lÃªn" onclick="moveQueueEntryV2('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>` : ''}
                                    ${realIndex >= 0 && realIndex < state.queue.length - 1 ? `<button title="Di chuyá»ƒn xuá»‘ng" onclick="moveQueueEntryV2('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>` : ''}
                                    <button class="primary" title="PhÃ¡t ngay" onclick="userForcePlaySong('${song.id}')"><i class="fa-solid fa-play"></i></button>
                                    <button class="danger" title="XÃ³a bÃ i" onclick="userRemoveSongFromQueue('${song.id}')"><i class="fa-solid fa-trash"></i></button>
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
            <header class="playlist-group-donor"><span>${escapeDashboardHtml(first.donorName || 'KhÃ¡ch')}</span><b>${Number(first.amount || 0).toLocaleString('vi-VN')}Ä‘</b></header>
            <div class="playlist-group-summary">
                <img src="${escapeDashboardHtml(first.playlistThumbnailUrl || first.thumbnail || '')}" alt="">
                <div class="playlist-group-copy">
                    <strong>${escapeDashboardHtml(first.playlistTitle || 'YouTube Playlist')}</strong>
                    <span>${songs.length} video Ä‘ang chá» Â· ${formatTime(duration)}${Number(first.playlistSkippedItemCount || 0) > 0 ? ` Â· bá» qua ${first.playlistSkippedItemCount}` : ''}</span>
                </div>
                <div class="playlist-group-actions">
                    <button title="Má»Ÿ hoáº·c thu gá»n" onclick="togglePlaylistGroup('${requestId}')"><i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'}"></i></button>
                    <button title="Di chuyá»ƒn playlist lÃªn" ${groupIndex <= 0 ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                    <button title="Di chuyá»ƒn playlist xuá»‘ng" ${groupIndex >= groupCount - 1 ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                    <button title="PhÃ¡t playlist" onclick="userForcePlaySong('${first.id}')"><i class="fa-solid fa-play"></i></button>
                    <button class="danger" title="Bá» toÃ n bá»™ playlist" onclick="skipEntirePlaylist('${requestId}')"><i class="fa-solid fa-trash"></i></button>
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
    const title = escapeDashboardHtml(song.title || 'ChÆ°a cÃ³ tÃªn bÃ i hÃ¡t');
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
                <button class="primary" title="PhÃ¡t ngay" onclick="userForcePlaySong('${song.id}')"><i class="fa-solid fa-play"></i></button>
                <button class="${song.isPinned ? 'active' : ''}" title="${song.isPinned ? 'Bá» ghim' : 'Ghim bÃ i'}" onclick="togglePinPlaylistTrack('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>
                <button title="Di chuyá»ƒn lÃªn" ${index === 0 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                <button title="Di chuyá»ƒn xuá»‘ng" ${index >= total - 1 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="danger" title="XÃ³a bÃ i" onclick="userRemoveSongFromQueue('${song.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </article>
    `;
}

function renderPlaylistTrackRow(song, index, total, options = {}) {
    const songUrl = getQueueSongUrl(song);
    const isCurrent = Boolean(state.currentSong && String(state.currentSong.id) === String(song.id));
    const title = escapeDashboardHtml(song.title || 'ChÆ°a cÃ³ tÃªn bÃ i hÃ¡t');
    const linkedTitle = songUrl !== '#'
        ? `<a href="${escapeDashboardHtml(songUrl)}" onclick="openExternalLink(event, '${escapeDashboardHtml(songUrl)}')">${title}</a>`
        : title;
    const thumbnail = escapeDashboardHtml(song.thumbnail || '');
    const duration = Number(song.duration || 0);
    const movableIndex = Number.isInteger(options.movableIndex) ? options.movableIndex : index;
    const movableTotal = Number.isInteger(options.movableTotal) ? options.movableTotal : total;
    const newBadge = renderQueueNewBadge(song);
    return `
        <article class="playlist-track-row ${song.isPinned ? 'is-pinned' : ''} ${isCurrent ? 'is-playing' : ''}" data-song-id="${escapeDashboardHtml(String(song.id))}" ${isCurrent ? 'aria-current="true"' : ''}>
            <span class="playlist-track-number">${Number(song.playlistPosition || index + 1)}</span>
            <img class="playlist-track-thumb" src="${thumbnail}" alt="" loading="lazy">
            <div class="playlist-track-title" title="${title}">
                ${linkedTitle}
                ${newBadge}
                ${isCurrent ? '<span class="playlist-track-playing-label" title="BÃ i Ä‘ang phÃ¡t" aria-label="BÃ i Ä‘ang phÃ¡t"><i class="fa-solid fa-volume-high"></i></span>' : ''}
            </div>
            <time>${duration > 0 ? formatTime(duration) : '--:--'}</time>
            <div class="playlist-track-actions">
                <button class="primary" title="${isCurrent ? (state.isPlaying ? 'Táº¡m dá»«ng' : 'Tiáº¿p tá»¥c') : 'PhÃ¡t ngay'}" onclick="${isCurrent ? 'togglePlayPause()' : `userForcePlaySong('${song.id}')`}"><i class="fa-solid fa-${isCurrent && state.isPlaying ? 'pause' : 'play'}"></i></button>
                <button class="${song.isPinned ? 'active' : ''}" title="${song.isPinned ? 'Bá» ghim' : 'Ghim bÃ i'}" ${isCurrent ? 'disabled' : ''} onclick="togglePinPlaylistTrack('${song.id}')"><i class="fa-solid fa-thumbtack"></i></button>
                <button title="Di chuyá»ƒn lÃªn" ${isCurrent || movableIndex <= 0 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                <button title="Di chuyá»ƒn xuá»‘ng" ${isCurrent || movableIndex < 0 || movableIndex >= movableTotal - 1 ? 'disabled' : ''} onclick="movePlaylistTrackWithinGroup('${song.id}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                <button class="danger" title="${isCurrent ? 'Bá» qua bÃ i Ä‘ang phÃ¡t' : 'XÃ³a bÃ i'}" onclick="${isCurrent ? 'skipSong(true)' : `userRemoveSongFromQueue('${song.id}')`}"><i class="fa-solid fa-trash"></i></button>
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
    const donorName = escapeDashboardHtml(first.donorName || 'KhÃ¡ch');
    const playlistTotal = Number(first.playlistTotalTracks || songs.length);
    const ownerText = first.isOwnerAdd
        ? 'Chá»§ kÃªnh thÃªm'
        : `${donorName} <b>${Number(first.amount || 0).toLocaleString('vi-VN')}Ä‘</b>`;
    const statusText = activeSong
        ? `Äang phÃ¡t ${Number(activeSong.playlistPosition || 1)}/${playlistTotal}`
        : `${songs.length} video Â· ${formatTime(duration)}`;
    const newBadge = renderQueueNewBadge(songs);

    return `
        <section class="playlist-group-card ${expanded ? 'is-expanded' : ''} ${activeSong ? 'is-active-playlist' : ''}" data-playlist-request-id="${requestId}">
            <div class="playlist-group-overview">
                <img src="${escapeDashboardHtml(first.playlistThumbnailUrl || first.thumbnail || '')}" alt="">
                <div class="playlist-group-copy">
                    <strong>Playlist cá»§a ${donorName}${newBadge}</strong>
                    <span class="playlist-group-donation">${ownerText}</span>
                    <span class="playlist-group-status"><i class="fa-solid fa-volume-high"></i> ${statusText}</span>
                </div>
                <div class="playlist-group-header-actions">
                    <button class="primary" title="${activeSong ? (state.isPlaying ? 'Táº¡m dá»«ng playlist' : 'Tiáº¿p tá»¥c playlist') : 'PhÃ¡t playlist ngay'}" onclick="${activeSong ? 'toggleCurrentPlaylistPause()' : `userForcePlaySong('${first.id}')`}"><i class="fa-solid fa-${activeSong && state.isPlaying ? 'pause' : 'play'}"></i></button>
                    <button title="Di chuyá»ƒn playlist lÃªn" ${groupIndex <= 0 || activeSong ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'up')"><i class="fa-solid fa-arrow-up"></i></button>
                    <button title="Di chuyá»ƒn playlist xuá»‘ng" ${groupIndex >= groupCount - 1 || activeSong ? 'disabled' : ''} onclick="movePlaylistGroup('${requestId}', 'down')"><i class="fa-solid fa-arrow-down"></i></button>
                    <button class="danger" title="XÃ³a toÃ n bá»™ playlist" onclick="skipEntirePlaylist('${requestId}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="playlist-group-toggle" ${options.forceExpanded ? '' : `role="button" tabindex="0" onclick="togglePlaylistGroup('${requestId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();togglePlaylistGroup('${requestId}')}"`}>
                <i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'}"></i>
                <span>${options.forceExpanded ? `${songs.length} video trong playlist` : (expanded ? 'Thu gá»n danh sÃ¡ch' : `Xem thÃªm ${songs.length} video`)}</span>
            </div>
            <div class="playlist-group-tracks">
                ${expanded ? songs.map((song, index) => renderPlaylistTrackRow(song, index, songs.length, {
                    movableIndex: movableSongs.findIndex(item => String(item.id) === String(song.id)),
                    movableTotal: movableSongs.length
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
        queueContainer.innerHTML = '<div class="empty-queue-notice">HÃ ng Ä‘á»£i Ä‘ang trá»‘ng. HÃ£y dÃ¡n link YouTube bÃ i hÃ¡t Ä‘áº§u tiÃªn!</div>';
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
        ? `<div class="queue-section-label"><span>Äang phÃ¡t</span></div>${renderPlaylistGroupV2(activePlaylistGroup, Math.max(0, activePlaylistGroupIndex), allGroups.length, { forceExpanded: true })}`
        : (current ? `<div class="queue-section-label"><span>Äang phÃ¡t</span></div>${renderQueueSongCardV2(current, { isCurrent: true })}` : '');
    const waitingHtml = groups.map(group => group.type === 'playlist'
        ? renderPlaylistGroupV2(group, allGroups.indexOf(group), allGroups.length)
        : renderQueueSongCardV2(group.songs[0])).join('');
    const waitingSection = waitingHtml ? `
        <div class="queue-section-label queue-next-label"><span>Tiáº¿p theo Â· ${waitingCount} video</span></div>
        <div class="queue-waiting-list">${waitingHtml}</div>
    ` : '';

    queueContainer.innerHTML = `
        ${currentSection}
        ${waitingSection}
    `;
}

// --- KHá»žI Táº O TRáº NG THÃI PHÃT KHI LOAD TRANG ---
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

// --- PHÃT BÃ€I TIáº¾P THEO TRONG HÃ€NG Äá»¢I ---
function playNextInQueue(isAutomatic = false, preferredSong = null, previousSongOverride = null) {
    renderQueue(); // Äáº£m báº£o Ä‘á»“ng bá»™ giao diá»‡n hÃ ng Ä‘á»£i
    if (state.queue.length === 0) {
        state.currentSong = null;
        updatePlayerUI(null);
        localStorage.removeItem('dua_current_song');
        publishMqtt('current_song', null);
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
        logSystem("ÄÃ£ phÃ¡t háº¿t hÃ ng Ä‘á»£i nháº¡c donate.");
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

// --- Gá»¬I Lá»†NH ÄIá»€U KHIá»‚N SANG OBS OVERLAY ---
function sendControlCommand(type, value = null) {
    const cmdPayload = {
        type: type,
        value: value,
        timestamp: Date.now() + Math.random() // Äáº£m báº£o sá»± kiá»‡n storage kÃ­ch hoáº¡t liÃªn tá»¥c
    };
    
    logSystem(`[Äiá»u khiá»ƒn] Thá»±c thi lá»‡nh Ä‘iá»u khiá»ƒn trÃ¬nh phÃ¡t: <strong>${type}</strong>${value !== null ? ` [GiÃ¡ trá»‹: ${value}]` : ''}`, 'system');
    
    publishMqtt('control_command', cmdPayload);
}

// --- Báº¢NG Há»ŽI Lá»°A CHá»ŒN PHÃT TIáº¾P BÃ€I HÃT Bá»Š Äáº¨Y XUá»NG ---
function promptResumePlayback(song, onResolve) {
    // XÃ³a báº¥t ká»³ modal nÃ o cÅ© náº¿u cÃ²n tá»“n táº¡i
    const oldModal = document.getElementById('resume-playback-modal');
    if (oldModal) oldModal.remove();

    // Táº¡o modal lá»±a chá»n phÃ¡t tiáº¿p
    const modal = document.createElement('div');
    modal.id = 'resume-playback-modal';
    modal.className = 'browser-blocked-overlay';
    modal.style.cssText = 'display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 10000;';

    const savedSeconds = Math.floor(song.savedProgress);
    const card = document.createElement('div');
    card.className = 'blocked-card';
    card.style.cssText = 'max-width: 420px; width: 100%;';

    card.innerHTML = `
        <h3 style="font-family: var(--font-title); font-weight: 800; color: var(--pineapple-text); margin-top: 0; margin-bottom: 0.5rem;"><i class="fa-solid fa-clock-rotate-left"></i> PhÃ¡t tiáº¿p tá»¥c?</h3>
        <p style="font-size: 0.9rem; font-weight: 700; color: var(--pineapple-text); margin-bottom: 1.25rem; line-height: 1.4; opacity: 0.85;">
            BÃ i hÃ¡t <strong>${song.title}</strong> cÃ³ tiáº¿n trÃ¬nh cÅ© táº¡i <strong style="color: var(--pineapple-orange-dark, #D97706);">${formatTime(savedSeconds)}</strong>.<br>
            Báº¡n cÃ³ muá»‘n phÃ¡t tiáº¿p hay phÃ¡t láº¡i tá»« Ä‘áº§u?
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; margin-bottom: 0.8rem;">
            <button id="btn-resume-yes" class="dua-btn dua-btn-primary" style="padding: 0.45rem 1.2rem; font-size: 0.85rem; border-width: 2px; box-shadow: 2px 2px 0px var(--pineapple-shadow, #2B1810); font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-forward"></i> PhÃ¡t tiáº¿p</button>
            <button id="btn-resume-no" class="dua-btn dua-btn-secondary" style="padding: 0.45rem 1.2rem; font-size: 0.85rem; border-width: 2px; box-shadow: 2px 2px 0px var(--pineapple-shadow, #2B1810); font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-rotate-left"></i> PhÃ¡t láº¡i</button>
        </div>
        <div id="resume-countdown" style="font-size: 0.82rem; font-weight: 700; color: var(--pineapple-text); opacity: 0.55;">
            Tá»± Ä‘á»™ng phÃ¡t tiáº¿p sau 8 giÃ¢y...
        </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    let timeLeft = 8;
    const countdownEl = card.querySelector('#resume-countdown');
    
    const interval = setInterval(() => {
        timeLeft--;
        if (countdownEl) {
            countdownEl.textContent = `Tá»± Ä‘á»™ng phÃ¡t tiáº¿p sau ${timeLeft} giÃ¢y...`;
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

// --- PHÃT Má»˜T BÃ€I HÃT CHI TIáº¾T (Äá»’NG Bá»˜ SANG OVERLAY) ---
async function playSong(song) {
    if (!song) return;

    const requestSequence = ++playSongRequestSequence;
    const requestedSongId = String(song.id);
    const requestedVideoId = String(song.videoId || '');
    const isLatestPlayRequest = () => requestSequence === playSongRequestSequence &&
        !!state.currentSong &&
        String(state.currentSong.id) === requestedSongId &&
        String(state.currentSong.videoId || '') === requestedVideoId;

    // Tá»± sá»­a cÃ¡c bÃ i SoundCloud cÅ© Ä‘Ã£ lÆ°u URL on.soundcloud.com trÆ°á»›c khi phÃ¡t.
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
            logSystem(`ÄÃ£ phÃ¢n giáº£i link SoundCloud rÃºt gá»n: <strong>${resolvedSoundCloudUrl}</strong>`, 'system');
        }
    }

    state.lastSwitchTime = Date.now();
    state.currentSongPlaybackConfirmed = false;

    // Vote Skip Playlist chá»‰ sá»‘ng trong Ä‘Ãºng playlist Ä‘Ã£ má»Ÿ. Khi chuyá»ƒn sang
    // bÃ i/playlist khÃ¡c, há»§y quá»¹ cÅ© Ä‘á»ƒ khÃ´ng cháº·n donate hoáº·c lÃ m luá»“ng phÃ¡t treo.
    if (state.playlistVoteSkip?.active && song.playlistRequestId !== state.playlistVoteSkip.playlistRequestId) {
        state.playlistVoteSkip = null;
    }

    // Äáº·t láº¡i cá» bypass khi chuyá»ƒn bÃ i má»›i
    state.bypassCurrentSongDuration = false;

    // Khá»Ÿi táº¡o/Ä‘áº·t láº¡i thuá»™c tÃ­nh vote skip cá»§a bÃ i hÃ¡t hiá»‡n táº¡i
    song.voteSkipActive = song.voteSkipActive || false;
    song.voteAmount = song.voteAmount || 0;
    song.voteSkipTarget = song.voteSkipTarget || (song.isOwnerAdd ? state.voteSkipDefaultAmount : (song.amount || state.voteSkipDefaultAmount));
    song.voteSkipSuccess = song.voteSkipSuccess || false;
    song.voteSkipContributors = song.voteSkipContributors || [];

    // Gá»­i cáº¥u hÃ¬nh Ã¢m lÆ°á»£ng hiá»‡n táº¡i sang overlay Ä‘á»ƒ Ä‘áº£m báº£o Ä‘á»“ng bá»™ tuyá»‡t Ä‘á»‘i trÆ°á»›c khi phÃ¡t
    sendControlCommand('volume', state.volume);

    // Kiá»ƒm tra xem bÃ i hÃ¡t cÃ³ tiáº¿n trÃ¬nh Ä‘Ã£ lÆ°u hay khÃ´ng
    let startFrom = song.start || 0;
    let needSeekAfterLoad = false;
    if (song.savedProgress && song.savedProgress > 2) {
        // Táº¡m dá»«ng bÃ i Ä‘ang phÃ¡t (náº¿u cÃ³) trÆ°á»›c khi há»i ngÆ°á»i dÃ¹ng
        if (state.isPlaying) {
            sendControlCommand('pause');
        }
        // Gá»­i tráº¡ng thÃ¡i chá» lÃªn overlay Ä‘á»ƒ hiá»ƒn thá»‹ thÃ´ng bÃ¡o

        const shouldResume = await new Promise((resolve) => {
            promptResumePlayback(song, resolve);
        });
        if (!isLatestPlayRequest()) return;
        if (shouldResume) {
            startFrom = Math.floor(song.savedProgress);
            needSeekAfterLoad = true;
            logSystem(`PhÃ¡t tiáº¿p tá»¥c bÃ i hÃ¡t "${song.title}" tá»« ${formatTime(startFrom)}`, 'system');
        } else {
            // XÃ³a tiáº¿n trÃ¬nh Ä‘Ã£ lÆ°u
            delete song.savedProgress;
            const qItem = state.queue.find(s => String(s.id) === String(song.id));
            if (qItem) {
                delete qItem.savedProgress;
            }
            saveQueue();
        }
    }

    // Thiáº¿t láº­p mÃ£ gia háº¡n (luÃ´n sinh mÃ£ Ä‘á»ƒ sáºµn sÃ ng khi báº­t tÃ­nh nÄƒng)
    if (!song.extensionCode) {
        song.extensionCode = generateExtensionCode();
    }
    song.extendedDuration = song.extendedDuration || 0;

    logSystem(`Äang chuáº©n bá»‹ gá»­i bÃ i hÃ¡t sang Overlay: <strong>${song.title}</strong>...`);
    updatePlayerUI(song);

    if (song.playlistTrackId && window.electronAPI?.markPlaylistTrackStarted) {
        if (song.playlistInterrupted) {
            delete song.playlistInterrupted;
            window.electronAPI?.resumePlaylist?.(song.playlistRequestId).catch(() => {});
        }
        window.electronAPI.markPlaylistTrackStarted(song.playlistTrackId).catch(error => {
            console.error('KhÃ´ng thá»ƒ cáº­p nháº­t tráº¡ng thÃ¡i playlist track:', error);
        });
    }
    
    // Thu tháº­p cÃ¡c Ä‘oáº¡n SponsorBlock
    const skipSegments = await fetchSponsorBlockSegments(song.videoId);
    if (!isLatestPlayRequest()) return;
    state.skipSegments = skipSegments;

    // TÃ¬m bÃ i tiáº¿p theo trong hÃ ng Ä‘á»£i khÃ´ng trÃ¹ng vá»›i bÃ i Ä‘ang chuáº©n bá»‹ phÃ¡t (há»— trá»£ Lucky Mode)
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

    // Lyrics táº£i báº¥t Ä‘á»“ng bá»™ sau khi player Ä‘Ã£ nháº­n bÃ i. Metadata-only update
    // cá»§a cÃ¹ng song id khÃ´ng táº¡o láº¡i iframe/direct stream trÃªn Overlay.
    loadSyncedLyricsForSong(song);

    // Send resume as an explicit one-shot player command. The payload position
    // still handles initial load; this command also reaches an existing player.
    if (needSeekAfterLoad) {
        sendControlCommand('resume', {
            songId: song.id,
            position: startFrom
        });
    }

    // PhÃ¡t lá»‡nh cháº¡y nháº¡c
    sendControlCommand('play');
    state.isPlaying = true;
    updatePlayPauseButtonUI(true);

    // Cáº­p nháº­t láº¡i hÃ ng Ä‘á»£i Ä‘á»ƒ Ä‘á»“ng bá»™ hiá»ƒn thá»‹ bÃ i Ä‘ang phÃ¡t
    renderQueue();
}

// Cáº­p nháº­t tráº¡ng thÃ¡i nÃºt Táº¡m dá»«ng/Tiáº¿p tá»¥c cá»§a Dashboard
function updatePlayPauseButtonUI(isPlaying) {
    getWindowsMediaService()?.updateMetadata?.(state.currentSong, isPlaying);
    const waves = document.getElementById('music-waves');
    const playBtn = document.getElementById('btn-play-pause');
    if (isPlaying) {
        if (waves) waves.classList.remove('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        if (waves) waves.classList.add('paused');
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
    
    // Disable if controls are locked due to long-waiting auto pinned song playing
    const disabled = isControlsDisabled();
    if (playBtn) {
        playBtn.disabled = disabled;
        if (disabled) {
            playBtn.style.opacity = '0.5';
            playBtn.style.cursor = 'not-allowed';
            playBtn.title = "KhÃ´ng thá»ƒ thao tÃ¡c do bÃ i hÃ¡t Ä‘á»£i quÃ¡ 75 phÃºt Ä‘ang phÃ¡t";
        } else {
            playBtn.style.opacity = '';
            playBtn.style.cursor = '';
            playBtn.title = "PhÃ¡t/Táº¡m dá»«ng";
        }
    }
}
// --- THU THáº¬P PHÃ‚N ÄOáº N QUáº¢NG CÃO Tá»ª SPONSORBLOCK ---
async function fetchSponsorBlockSegments(videoId) {
    logSystem(`Äang kiá»ƒm tra cÆ¡ sá»Ÿ dá»¯ liá»‡u SponsorBlock cho video ID: ${videoId}...`);
    try {
        const service = window.sponsorBlockService
            || (window.sponsorBlockService = new window.SponsorBlockService());
        const result = await service.fetchSegments(videoId);
        if (result.status === 'ok') {
            if (result.segments.length > 0) {
                logSystem(`SponsorBlock tÃ¬m tháº¥y <strong>${result.segments.length}</strong> phÃ¢n Ä‘oáº¡n quáº£ng cÃ¡o/giá»›i thiá»‡u!`, 'sponsorblock');
                result.segments.forEach(seg => {
                    logSystem(`- [${categoryLabels[seg.category] || seg.category}]: ${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s`, 'sponsorblock');
                });
            } else {
                logSystem(`SponsorBlock: Video sáº¡ch, khÃ´ng phÃ¡t hiá»‡n quáº£ng cÃ¡o/Ä‘oáº¡n giá»›i thiá»‡u.`, 'sponsorblock');
            }
        } else if (result.status === 'not-found') {
            logSystem(`SponsorBlock: KhÃ´ng cÃ³ dá»¯ liá»‡u phÃ¢n Ä‘oáº¡n quáº£ng cÃ¡o cho video nÃ y.`, 'sponsorblock');
        } else {
            logSystem(`SponsorBlock API pháº£n há»“i vá»›i tráº¡ng thÃ¡i: ${result.httpStatus}`, 'sponsorblock');
        }
        return result.segments;
    } catch (err) {
        console.error("SponsorBlock fetch error:", err);
        logSystem(`KhÃ´ng thá»ƒ káº¿t ná»‘i tá»›i mÃ¡y chá»§ SponsorBlock.`, 'system');
        return [];
    }
}

// --- GIÃM SÃT TIáº¾N TRÃŒNH & Tá»° Äá»˜NG Bá»Ž QUA QUA SPONSORBLOCK ---
// --- KÃCH HOáº T PHÃT NHáº C KHI TRÃŒNH DUYá»†T CHáº¶N ---
function resumeAutoplay() {
    document.getElementById('autoplay-blocker').style.display = 'none';
    sendControlCommand('play');
}

// --- THAY Äá»”I Má»C THá»œI GIAN THEO THANH TRÆ¯á»¢T (SEEK) ---
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
        logSystem(`Tua bÃ i nháº¡c tá»›i: ${formatTime(relativeElapsed)}`);
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

// --- ÄIá»€U CHá»ˆNH Ã‚M LÆ¯á»¢NG ---
function onVolumeChange(val) {
    if (state.focusMode) return;
    const targetVal = normalizeDashboardVolume(val, null);
    if (targetVal === null) return;

    if (state.adaptiveActive && targetVal > 0) {
        // Äang thÃ­ch á»©ng Ã¢m lÆ°á»£ng: TÃ­nh toÃ¡n offset má»›i (tuning) thay vÃ¬ thay Ä‘á»•i volume gá»‘c
        const origVol = state.adaptiveOrigVolume;
        const currentLoudness = state.adaptiveLoudnessDb;

        if (origVol > 0 && currentLoudness !== null && currentLoudness !== undefined) {
            const multiplier = targetVal / origVol;
            let dbAdj = 20 * Math.log10(multiplier);
            if (isNaN(dbAdj) || !isFinite(dbAdj)) dbAdj = 0;

            // newOffset = loudnessDb + dbAdj
            let newOffset = currentLoudness + dbAdj;
            newOffset = Math.max(-15, Math.min(15, newOffset)); // Giá»›i háº¡n tá»« -15 Ä‘áº¿n 15 dB

            localStorage.setItem('dua_adaptive_loudness_offset', newOffset);

            // Gá»­i offset má»›i sang overlay Ä‘á»ƒ Ã¡p dá»¥ng ngay láº­p tá»©c cho bÃ i hiá»‡n táº¡i
            sendControlCommand('set_adaptive_offset', newOffset);

            // Cáº­p nháº­t sá»‘ hiá»ƒn thá»‹ táº¡m thá»i
            document.getElementById('volume-val-display').textContent = targetVal + '%';

            // In log thÃ´ng bÃ¡o há»‡ thá»‘ng
            if (window.lastAdaptiveOffsetLogTime === undefined || Date.now() - window.lastAdaptiveOffsetLogTime > 2000) {
                window.lastAdaptiveOffsetLogTime = Date.now();
                logSystem(`âš™ï¸ [Ã‚m lÆ°á»£ng thÃ­ch á»©ng] ÄÃ£ ghi nháº­n gu Ã¢m thanh cá»§a báº¡n! LÆ°u offset má»›i: <strong>${newOffset.toFixed(1)} dB</strong>. Nháº¡c tiáº¿p theo sáº½ tá»± Ä‘á»™ng thÃ­ch á»©ng dá»±a trÃªn má»©c Ä‘iá»u chá»‰nh nÃ y.`, 'system');
            }
        }
    } else {
        // TrÆ°á»ng há»£p bÃ¬nh thÆ°á»ng hoáº·c kÃ©o vá» 0 (Mute): Cáº­p nháº­t Ã¢m lÆ°á»£ng gá»‘c
        state.volume = targetVal;
        localStorage.setItem('dua_volume', targetVal);
        localStorage.setItem('dua_explicitly_muted', targetVal === 0 ? 'true' : 'false');
        if (targetVal > 0) {
            state.preMuteVolume = targetVal;
            localStorage.setItem('dua_pre_mute_volume', String(targetVal));
        }
        document.getElementById('volume-val-display').textContent = targetVal + '%';

        // Giá»¯ payload bÃ i hiá»‡n táº¡i Ä‘á»“ng nháº¥t vá»›i volume vá»«a chá»‰nh. KhÃ´ng publish
        // current_song á»Ÿ Ä‘Ã¢y vÃ¬ control_command Ä‘Ã£ Ä‘á»§ vÃ  trÃ¡nh reload player;
        // láº§n publish payload káº¿ tiáº¿p sáº½ khÃ´ng thá»ƒ kÃ©o Overlay vá» volume cÅ©.
        try {
            const currentPayloadRaw = localStorage.getItem('dua_current_song');
            if (currentPayloadRaw) {
                const currentPayload = JSON.parse(currentPayloadRaw);
                currentPayload.volume = state.volume;
                localStorage.setItem('dua_current_song', JSON.stringify(currentPayload));
            }
        } catch (_) { }
        
        // Cáº­p nháº­t biá»ƒu tÆ°á»£ng nÃºt táº¯t Ã¢m thanh
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
        // Táº¯t Ã¢m thanh
        state.preMuteVolume = state.volume;
        localStorage.setItem('dua_pre_mute_volume', state.preMuteVolume);
        const slider = document.getElementById('volume-slider');
        if (slider) slider.value = 0;
        onVolumeChange(0);
    } else {
        // Báº­t láº¡i Ã¢m thanh
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

// --- PHÃT / Táº M Dá»ªNG Báº°NG TAY ---
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
        logSystem(result.playing ? "Tiáº¿p tá»¥c trÃ¬nh phÃ¡t nháº¡c (Overlay)." : "Táº¡m dá»«ng trÃ¬nh phÃ¡t nháº¡c (Overlay).");
    });
}

// --- SKIP BÃ€I (NEXT) ---
function skipSong(isManual = true, skipReasonOverride = null) {
    if (state.focusMode) return;
    if (isManual && isControlsDisabled()) return;
    if (!state.currentSong) return;

    if (!isManual && state.currentSong.voteSkipSuccess === true) {
        const now = Date.now();
        if (now < Number(state.automatedSkipBlockedUntil || 0)) {
            console.warn('Bá» yÃªu cáº§u automated skip trÃ¹ng trong cÃ¹ng má»™t lÆ°á»£t chuyá»ƒn bÃ i.');
            return;
        }
        state.automatedSkipBlockedUntil = now + 2500;
        // Overlay cÅ© tá»«ng phÃ¡t má»™t ended khÃ´ng cÃ³ reason sau Ä‘áº¿m ngÆ°á»£c Vote Skip.
        // Cháº·n riÃªng dáº¡ng legacy nÃ y; ended chuáº©n cá»§a Overlay má»›i váº«n Ä‘Æ°á»£c nháº­n.
        state.ignoreLegacyEndedUntil = now + 20000;
    }
    
    const skipAction = () => {
        const completedSong = state.currentSong;
        const nextSong = getNextSong();
        const skipReason = skipReasonOverride
            || (!isManual && completedSong?.voteSkipSuccess === true ? 'vote_skip' : 'skipped_by_streamer');
        finishPlaylistTrack(completedSong, 'skipped', skipReason);
        logSystem(`Bá» qua bÃ i hÃ¡t: <strong>${completedSong.title}</strong>`);
        showDashboardSystemAlert("Bá» qua bÃ i hÃ¡t", `ÄÃ£ bá» qua bÃ i hÃ¡t: <strong>${completedSong.title}</strong>`);
        removeSongFromQueue(completedSong.id, false);
        // Manual skip vÃ  Vote Skip dÃ¹ng cÃ¹ng má»™t cÆ¡ cháº¿ chá»n/phÃ¡t bÃ i tiáº¿p theo.
        playNextInQueue(true, nextSong, completedSong);
    };

    if (isManual) {
        attemptGlobalAction('skip', skipAction);
    } else {
        skipAction();
    }
}

// --- HIá»‚N THá»Š MENU CHUá»˜T PHáº¢I / CÃ”NG Cá»¤ HÃ€NG Äá»¢I ---
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

// --- FORCE PLAY (PHÃT NGAY Láº¬P Tá»¨C Má»˜T BÃ€I TRONG QUEUE) ---
function forcePlaySong(songId) {
    if (state.focusMode) return;
    const songIndex = state.queue.findIndex(s => String(s.id) === String(songId));
    if (songIndex === -1) return;

    // LÆ°u tiáº¿n trÃ¬nh bÃ i Ä‘ang phÃ¡t trÆ°á»›c khi chuyá»ƒn bÃ i Æ°u tiÃªn
    if (state.currentSong) {
        const currentSongInQueue = state.queue.find(s => String(s.id) === String(state.currentSong.id));
        if (currentSongInQueue) {
            const duration = currentSongInQueue.duration || 0;
            const currentTime = state.lastReportedTime || 0;
            // Chá»‰ lÆ°u tiáº¿n trÃ¬nh náº¿u bÃ i hÃ¡t Ä‘Ã£ phÃ¡t Ä‘Æ°á»£c trÃªn 2 giÃ¢y vÃ  cÃ²n cÃ¡ch káº¿t thÃºc trÃªn 5 giÃ¢y (náº¿u cÃ³ duration)
            if (currentTime > 2 && (duration === 0 || currentTime < duration - 5)) {
                currentSongInQueue.savedProgress = currentTime;
                logSystem(`ÄÃ£ lÆ°u tiáº¿n trÃ¬nh bÃ i hÃ¡t "${currentSongInQueue.title}" táº¡i ${formatTime(currentTime)}`, 'system');
            }
            const target = state.queue[songIndex];
            if (currentSongInQueue.playlistRequestId && target?.playlistRequestId !== currentSongInQueue.playlistRequestId) {
                currentSongInQueue.playlistInterrupted = true;
                window.electronAPI?.pausePlaylist?.(currentSongInQueue.playlistRequestId).catch(() => {});
            }
        }
    }

    const targetSong = state.queue[songIndex];
    
    state.queue.splice(songIndex, 1);
    state.queue.unshift(targetSong);
    
    saveQueue();
    renderQueue();
    playNextInQueue(false, targetSong);
    
    logSystem(`Ã‰p phÃ¡t ngay láº­p tá»©c bÃ i hÃ¡t: <strong>${targetSong.title}</strong>`, 'system');
}

// --- XÃ“A Má»˜T BÃ€I HÃT KHá»ŽI HÃ€NG Äá»¢I ---
function removeSongFromQueue(songId, refreshUI = true) {
    const isPlayingCurrent = state.currentSong && String(state.currentSong.id) === String(songId);
    const mutation = (window.queueMutationService ||= new window.QueueMutationService()).remove(state.queue, songId);
    const songToRemove = mutation.item;
    const nextSongBeforeRemoval = isPlayingCurrent ? getNextSong() : null;
    state.queue = mutation.queue;
    saveQueue();
    
    if (songToRemove && songToRemove.isZyPage) {
        console.info('[ZyPage End] ThÃ¹ng rÃ¡c yÃªu cáº§u káº¿t thÃºc bÃ i', summarizeZyPageSongForLog(songToRemove));
        sendZyPageSongEnd(songToRemove).catch(error => {
            console.error('[ZyPage End] Lá»—i ngoÃ i dá»± kiáº¿n khi xá»­ lÃ½ nÃºt thÃ¹ng rÃ¡c:', error);
        });
    }
    
    if (isPlayingCurrent) {
        state.currentSong = null;
        localStorage.removeItem('dua_current_song');
        sendControlCommand('stop');
        state.isPlaying = false;
        updatePlayPauseButtonUI(false);
    } else {
        // Cáº­p nháº­t láº¡i nextSongTitle cá»§a bÃ i hÃ¡t Ä‘ang phÃ¡t náº¿u bÃ i bá»‹ xoÃ¡ náº±m trong hÃ ng Ä‘á»£i
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
        { start: 0x1D63C, end: 0x1D655, base: 65 },  // Sans-serif Bold Italic A-Z (Bá»• sung)
        { start: 0x1D656, end: 0x1D66F, base: 97 },  // Sans-serif Bold Italic a-z (Bá»• sung)
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

// --- Dá»ŠCH CHUYá»‚N BÃ€I HÃT LÃŠN TRONG HÃ€NG Äá»¢I ---
function moveQueueItemUp(songId) {
    if (state.focusMode || isControlsDisabled()) return;
    const result = (window.queueMutationService ||= new window.QueueMutationService()).move(state.queue, songId, -1, { hasCurrent: Boolean(state.currentSong) });
    if (result.changed) {
        state.queue = result.queue;
        const temp = result.item;
        
        saveQueue();
        renderQueue();
        logSystem(`ÄÃ£ Ä‘áº©y bÃ i hÃ¡t lÃªn trÆ°á»›c: <strong>${temp.title}</strong>`);

        // Cáº­p nháº­t láº¡i nextSongTitle cá»§a bÃ i hÃ¡t Ä‘ang phÃ¡t
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
        
        // Náº¿u chuyá»ƒn lÃªn Ä‘áº§u hÃ ng Ä‘á»£i vÃ  hiá»‡n táº¡i khÃ´ng cÃ³ bÃ i nÃ o phÃ¡t, kÃ­ch hoáº¡t phÃ¡t
        if (result.index === 0 && !state.currentSong && !state.focusMode) {
            playNextInQueue();
        }
    }
}

// --- Dá»ŠCH CHUYá»‚N BÃ€I HÃT XUá»NG TRONG HÃ€NG Äá»¢I ---
function moveQueueItemDown(songId) {
    if (state.focusMode || isControlsDisabled()) return;
    const result = (window.queueMutationService ||= new window.QueueMutationService()).move(state.queue, songId, 1, { hasCurrent: Boolean(state.currentSong) });
    if (result.changed) {
        state.queue = result.queue;
        const temp = result.item;
        
        saveQueue();
        renderQueue();
        logSystem(`ÄÃ£ háº¡ bÃ i hÃ¡t xuá»‘ng sau: <strong>${temp.title}</strong>`);

        // Cáº­p nháº­t láº¡i nextSongTitle cá»§a bÃ i hÃ¡t Ä‘ang phÃ¡t
        if (state.currentSong) {
            updateNextSongInCurrentPayload();
        }
    }
}

// --- GHIM / Bá»Ž GHIM BÃ€I HÃT TRONG HÃ€NG Äá»¢I ---
function togglePinQueueItem(songId) {
    if (isControlsDisabled()) {
        logSystem("KhÃ´ng thá»ƒ ghim/bá» ghim khi Ä‘ang phÃ¡t bÃ i hÃ¡t Ä‘á»£i lÃ¢u!", "system");
        showDashboardSystemAlert("Thao tÃ¡c bá»‹ khÃ³a", "KhÃ´ng thá»ƒ ghim/bá» ghim khi Ä‘ang phÃ¡t bÃ i Ä‘á»£i lÃ¢u");
        return;
    }
    const result = (window.queueMutationService ||= new window.QueueMutationService()).togglePin(state.queue, songId);
    if (!result.changed) return;
    state.queue = result.queue;
    const song = result.item;

    logSystem(`ÄÃ£ ${song.isPinned ? 'ghim' : 'bá» ghim'} bÃ i hÃ¡t: <strong>${song.title}</strong>`);
    
    // Sáº¯p xáº¿p láº¡i hÃ ng Ä‘á»£i Ä‘á»ƒ Ä‘Æ°a bÃ i ghim lÃªn trÃªn
    sortAndRefreshQueue(true);
}
window.togglePinQueueItem = togglePinQueueItem;

// --- Cáº¬P NHáº¬T GIAO DIá»†N KHI CÃ“ BÃ€I Má»šI / Dá»ªNG ---
function setDashboardVideoLoading(isLoading) {
    const element = document.getElementById('dashboard-video-loading');
    if (!element) return;
    element.hidden = !isLoading;
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
        const directStreamBadge = document.getElementById('direct-stream-badge');
        if (directStreamBadge) directStreamBadge.style.display = 'none';

        updateDashboardChannelUI(null);

        cover.src = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
        title.textContent = "ChÆ°a cÃ³ bÃ i hÃ¡t nÃ o";
        const playlistIconEl = document.getElementById('current-song-playlist-icon');
        if (playlistIconEl) playlistIconEl.style.display = 'none';
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
 
        // áº¨n countdown khi khÃ´ng cÃ²n bÃ i nÃ o
        const dashCountdown = document.getElementById('dash-live-countdown');
        if (dashCountdown) dashCountdown.classList.remove('visible');
        
        // áº¨n cáº£nh bÃ¡o nháº¡y cáº£m trÃªn dashboard
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

    setDashboardVideoLoading(state.currentSongPlaybackConfirmed === false);
 
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
    getWindowsMediaService()?.updateMetadata?.(song, state.isPlaying);

    if (currentSongUrl && currentSongUrl !== '#') {
        title.innerHTML = `<a href="${currentSongUrl}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bÃ i hÃ¡t trÃªn trÃ¬nh duyá»‡t máº·c Ä‘á»‹nh" onclick="openExternalLink(event, '${currentSongUrl}')">${song.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.72rem; margin-left: 0.25rem; opacity: 0.6;"></i></a>`;
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
        favbtn.style.display = 'none';
        const isFav = isFavorite(song);
        const icon = favBtn.querySelector('i');
        if (icon) {
            icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            icon.style.color = isFav ? '#EF4444' : '';
        }
        favBtn.title = isFav ? 'Bá» yÃªu thÃ­ch' : 'YÃªu thÃ­ch';
    }
    
    const directStreamBadge = document.getElementById('direct-stream-badge');
    if (directStreamBadge) directStreamBadge.style.display = 'none';
    
    if (song.isOwnerAdd) {
        donorSection.innerHTML = `<i class="fa-solid fa-user-shield"></i> <span id="current-donor-name">Chá»§ kÃªnh thÃªm</span>`;
    } else {
        donorSection.innerHTML = `<span id="current-donor-name">${song.donorName}</span><span id="current-donor-amount">${song.amount.toLocaleString('vi-VN')} VNÄ</span>`;
    }
    donorSection.style.display = 'flex';

    if (song.message) {
        messageSection.textContent = `"${song.message}"`;
        messageSection.style.display = 'block';
    } else {
        messageSection.style.display = 'none';
    }

    coverWrapper.classList.add('spinning');
    
    // ÄÃ£ xÃ³a bá» chá»©c nÄƒng cáº£nh bÃ¡o ná»™i dung nháº¡y cáº£m
    const warningEl = document.getElementById('dash-sensitive-warning');
    if (warningEl) warningEl.classList.remove('visible');
    
    const featuresRow = document.getElementById('control-features-row');
    if (featuresRow) featuresRow.style.display = 'flex';

    // Cáº­p nháº­t thÃ´ng tin gia háº¡n thá»i gian trÃªn Dashboard Player
    const extensionInfoEl = document.getElementById('current-song-extension-info');
    if (extensionInfoEl) {
        if (song && state.extensionEnabled && isExtensionAllowedForSong(song)) {
            // Tá»± Ä‘á»™ng sinh mÃ£ gia háº¡n náº¿u bÃ i hÃ¡t hiá»‡n táº¡i Ä‘ang phÃ¡t chÆ°a cÃ³ mÃ£ (tá»± sá»­a lá»—i "ChÆ°a cÃ³")
            if (!song.extensionCode) {
                song.extensionCode = generateExtensionCode();
                song.extendedDuration = song.extendedDuration || 0;
                
                // Äá»“ng bá»™ ngÆ°á»£c láº¡i tráº¡ng thÃ¡i hiá»‡n táº¡i
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
                ? '<span style="color: #EF4444; font-weight: 800;">Äang hiá»‡n trÃªn Livestream</span>' 
                : '<span style="color: #6B7280; font-weight: 700;">Äang áº©n trÃªn Livestream</span>';
            
            const maxDuration = calculateMaxDurationForSong(song);
            const currentLimitStr = formatTime(maxDuration);
            const totalDurationStr = song.duration ? formatTime(song.duration) : 'KhÃ´ng rÃµ';

            const priceFormatted = Number(state.extensionPrice).toLocaleString('vi-VN');
            const rateStr = ` <span style="font-size: 0.78rem; font-weight: 600; opacity: 0.8; color: var(--pineapple-text);">(${priceFormatted}Ä‘ = ${state.extensionMinutes}p)</span>`;

            extensionInfoEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px dashed var(--pineapple-border-color); padding-bottom: 0.25rem; margin-bottom: 0.25rem;">
                    <div>MÃ£ gia háº¡n: <strong style="font-size: 0.9rem; color: var(--pineapple-orange-dark);">${extCode}</strong>${rateStr}</div>
                    <div>${forceShowText}</div>
                </div>
                <div style="font-size: 0.76rem; color: var(--pineapple-text); opacity: 0.95;">
                    ÄÃ£ gia háº¡n: <strong>+${extMinsStr} phÃºt</strong> | Giá»›i háº¡n phÃ¡t: <strong>${currentLimitStr}</strong> / Äá»™ dÃ i gá»‘c: <strong>${totalDurationStr}</strong>
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
            skipBtn.title = "KhÃ´ng thá»ƒ thao tÃ¡c do bÃ i hÃ¡t Ä‘á»£i quÃ¡ 75 phÃºt Ä‘ang phÃ¡t";
        } else {
            skipBtn.style.opacity = '';
            skipBtn.style.cursor = '';
            skipBtn.title = "Bá» qua";
        }
    }

    const progressSlider = document.getElementById('progress-slider');
    if (progressSlider) {
        progressSlider.disabled = disabled;
        if (disabled) {
            progressSlider.style.cursor = 'not-allowed';
            progressSlider.title = "KhÃ´ng thá»ƒ tua do bÃ i hÃ¡t Ä‘á»£i quÃ¡ 75 phÃºt Ä‘ang phÃ¡t";
        } else {
            progressSlider.style.cursor = '';
            progressSlider.title = "";
        }
    }

    updateBypassButtonUI();
    updateForceExtensionButtonUI();
    updateVoteSkipButtonUI();
}

// --- CHUYá»‚N Äá»”I TAB Ná»˜I DUNG DASHBOARD ---
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

// --- CHUYá»‚N Äá»”I PHÃ‚N KHU Cáº¤U HÃŒNH (SUB-TABS SETTINGS) ---
function switchSettingsSection(sectionId) {
    const sections = document.querySelectorAll('.settings-section');
    const buttons = document.querySelectorAll('.settings-tab-btn');
    const sectionTitles = {
        sync: 'Äá»“ng bá»™ ZyPage',
        youtube: 'Äá»“ng bá»™ YouTube',
        playback: 'PhÃ¡t láº¡i',
        limits: 'Giá»›i háº¡n thá»i gian',
        filters: 'SponsorBlock',
        playlist: 'YouTube Playlist',
        overlay: 'Giao diá»‡n vÃ  OBS',
        logs: 'Tráº¡ng thÃ¡i vÃ  nháº­t kÃ½',
        about: 'Giá»›i thiá»‡u'
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

// Láº¯ng nghe sá»± thay Ä‘á»•i giao diá»‡n cá»§a há»‡ thá»‘ng
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const setting = getDashboardSettingsService().get('dua_dark_mode', 'light');
    if (setting === 'system') {
        applyDarkModeState();
    }
});

// --- ÃP Dá»¤NG TRáº NG THÃI VÃ” HIá»†U HÃ“A HOáº T Äá»˜NG KHI Báº¬T FOCUS MODE ---
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

// --- Báº¬T / Táº®T CHáº¾ Äá»˜ Táº¬P TRUNG (FOCUS MODE) ---
function toggleFocusMode(enabled) {
    state.focusMode = getDashboardSettingsService().setFocusMode(enabled);
    publishMqtt('focus_mode', { value: enabled });
    
    applyDashboardFocusModeState(enabled);
    
    if (enabled) {
        logSystem("ÄÃ£ Báº¬T cháº¿ Ä‘á»™ Táº­p trung: Táº¡m dá»«ng tá»± Ä‘á»™ng chuyá»ƒn bÃ i khi cÃ³ nháº¡c má»›i.", "system");
        showDashboardSystemAlert("Cháº¿ Ä‘á»™ Táº­p trung", "ÄÃ£ Báº¬T: HÃ ng Ä‘á»£i sáº½ Ä‘Æ°á»£c giá»¯ láº¡i, khÃ´ng tá»± Ä‘á»™ng phÃ¡t bÃ i má»›i.");
        
        // Táº¡m dá»«ng bÃ i hÃ¡t Ä‘ang phÃ¡t náº¿u cÃ³
        if (state.currentSong && state.isPlaying) {
            state.wasPlayingBeforeFocusMode = true;
            sendControlCommand('pause');
            state.isPlaying = false;
            updatePlayPauseButtonUI(false);
            logSystem("Tá»± Ä‘á»™ng táº¡m dá»«ng bÃ i hÃ¡t hiá»‡n táº¡i do kÃ­ch hoáº¡t Cháº¿ Ä‘á»™ Táº­p trung.", "system");
        } else {
            state.wasPlayingBeforeFocusMode = false;
        }
    } else {
        logSystem("ÄÃ£ Táº®T cháº¿ Ä‘á»™ Táº­p trung.", "system");
        showDashboardSystemAlert("Cháº¿ Ä‘á»™ Táº­p trung", "ÄÃ£ Táº®T.");
        
        // Náº¿u trÆ°á»›c Ä‘Ã³ bÃ i hÃ¡t Ä‘ang phÃ¡t dá»Ÿ bá»‹ táº¡m dá»«ng do Focus Mode, tá»± Ä‘á»™ng phÃ¡t láº¡i
        if (state.currentSong && state.wasPlayingBeforeFocusMode) {
            sendControlCommand('play');
            state.isPlaying = true;
            updatePlayPauseButtonUI(true);
            logSystem("Tá»± Ä‘á»™ng tiáº¿p tá»¥c phÃ¡t láº¡i bÃ i hÃ¡t Ä‘ang phÃ¡t dá»Ÿ sau khi Táº®T Cháº¿ Ä‘á»™ Táº­p trung.", "system");
        } else if (!state.currentSong && state.queue.length > 0) {
            // Tá»± Ä‘á»™ng cháº¡y nháº¡c náº¿u hÃ ng Ä‘á»£i cÃ³ bÃ i hÃ¡t mÃ  trÃ¬nh phÃ¡t Ä‘ang trá»‘ng
            playNextInQueue();
            logSystem("Tá»± Ä‘á»™ng phÃ¡t bÃ i hÃ¡t má»›i tá»« hÃ ng Ä‘á»£i sau khi Táº®T Cháº¿ Ä‘á»™ Táº­p trung.", "system");
        }
    }
}

// --- Báº¬T / Táº®T CHáº¾ Äá»˜ LUCKY (QUAY NHáº C NGáºªU NHIÃŠN) ---
function toggleLuckyMode(enabled) {
    state.luckyMode = getDashboardSettingsService().setLuckyMode(enabled);
    publishMqtt('lucky_mode', { value: enabled });
    
    const switchEl = document.getElementById('lucky-mode-toggle-switch');
    if (switchEl) {
        switchEl.checked = enabled;
    }
    
    if (enabled) {
        logSystem("ÄÃ£ Báº¬T cháº¿ Ä‘á»™ Lucky: Tá»± Ä‘á»™ng quay ngáº«u nhiÃªn bÃ i tiáº¿p theo khi háº¿t nháº¡c.", "system");
        showDashboardSystemAlert("Cháº¿ Ä‘á»™ Lucky", "ÄÃ£ Báº¬T: BÃ i tiáº¿p theo sáº½ Ä‘Æ°á»£c chá»n ngáº«u nhiÃªn tá»« hÃ ng Ä‘á»£i.");
    } else {
        logSystem("ÄÃ£ Táº®T cháº¿ Ä‘á»™ Lucky.", "system");
        showDashboardSystemAlert("Cháº¿ Ä‘á»™ Lucky", "ÄÃ£ Táº®T.");
        state.luckyNextSong = null;
    }
    
    // Cáº­p nháº­t láº¡i nextSongTitle cá»§a bÃ i hÃ¡t Ä‘ang phÃ¡t Ä‘á»ƒ Ä‘á»“ng bá»™
    if (state.currentSong) {
        updateNextSongInCurrentPayload();
    }
}


// --- Cáº¬P NHáº¬T NÃšT VÃ” CÃ™NG (BYPASS LIMIT) TRÃŠN PLAYER CONTROL ---
function updateBypassButtonUI() {
    const btn = document.getElementById('btn-bypass-limit');
    if (!btn) return;
    
    if (state.currentSong) {
        btn.style.display = 'none';
        if (state.bypassCurrentSongDuration) {
            btn.classList.add('active-bypass');
            btn.title = "Äang phÃ¡t háº¿t bÃ i (khÃ´ng giá»›i háº¡n)";
        } else {
            btn.classList.remove('active-bypass');
            btn.title = "PhÃ¡t háº¿t bÃ i hÃ¡t nÃ y (bá» qua giá»›i háº¡n thá»i gian)";
        }
    } else {
        btn.style.display = 'none';
    }
}

// --- Cáº¬P NHáº¬T NÃšT GIA Háº N THá»¦ CÃ”NG (FORCE EXTENSION) TRÃŠN PLAYER CONTROL ---
function updateForceExtensionButtonUI() {
    const btn = document.getElementById('btn-force-extension');
    if (!btn) return;
    
    if (state.currentSong && state.extensionEnabled && isExtensionAllowedForSong(state.currentSong)) {
        btn.style.display = 'none';
        if (state.currentSong.extensionForceShow) {
            btn.classList.add('active-extension');
            btn.innerHTML = `Äang hiá»‡n gia háº¡n`;
            btn.title = "Äang buá»™c hiá»ƒn thá»‹ mÃ£ gia háº¡n trÃªn Overlay";
        } else {
            btn.classList.remove('active-extension');
            btn.innerHTML = `Hiá»‡n gia háº¡n`;
            btn.title = "Hiá»‡n mÃ£ gia háº¡n trÃªn Overlay";
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
    logSystem(`${state.currentSong.extensionForceShow ? 'ðŸ”” ÄÃ£ hiá»ƒn thá»‹' : 'ðŸ”• ÄÃ£ áº©n'} mÃ£ gia háº¡n trÃªn Overlay.`);
}

// --- HIá»‚N THá»Š THÃ”NG BÃO DONATE Má»šI TRÃŠN DASHBOARD ---
let dbAlertTimeout = null;
function showDashboardNewDonationAlert(alertData) {
    const alertBox = document.getElementById('db-alert-box');
    if (!alertBox) return;
    
    // LÆ°u thÃ´ng bÃ¡o vÃ o lá»‹ch sá»­
    if (typeof saveToNotificationHistory === 'function') {
        saveToNotificationHistory({
            id: alertData.id || Date.now() + Math.random().toString(36).substr(2, 5),
            title: alertData.title || 'KhÃ´ng rÃµ',
            donorName: alertData.donorName || 'KhÃ¡ch',
            amount: alertData.amount || 0,
            position: alertData.position || 'HÃ ng Ä‘á»£i',
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
    
    if (songTitleEl) songTitleEl.textContent = alertData.title || 'KhÃ´ng rÃµ';
    if (donorNameEl) donorNameEl.textContent = alertData.donorName || 'KhÃ¡ch';
    if (amountEl) amountEl.textContent = alertData.amount ? alertData.amount.toLocaleString('vi-VN') + ' VNÄ' : '0 VNÄ';
    
    if (statusEl) {
        statusEl.textContent = alertData.position || 'HÃ ng Ä‘á»£i';
    }
    
    // Hiá»ƒn thá»‹ áº£nh thumbnail náº¿u cÃ³
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
    
    // Hiá»ƒn thá»‹ lá»i nháº¯n náº¿u cÃ³
    if (msgBubbleEl) {
        const msg = alertData.message || '';
        if (msg.trim() !== '') {
            msgBubbleEl.textContent = `â€œ${msg.trim()}â€`;
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

// --- THÃ”NG BÃO CHá»¦ KÃŠNH THÃŠM NHáº C TRÃŠN DASHBOARD ---
let dbOwnerAddToastTimeout = null;
function showDashboardOwnerAddToast(song) {
    const toast = document.getElementById('db-owner-add-toast');
    const thumb = document.getElementById('db-owner-add-toast-thumb');
    const titleEl = document.getElementById('db-owner-add-toast-title');
    if (!toast || !titleEl) return;

    const songTitle = song.title || 'KhÃ´ng rÃµ';
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

// --- Há»† THá»NG LÆ¯U TRá»® Lá»ŠCH Sá»¬ THÃ”NG BÃO ---
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
    // ThÃªm trÆ°á»ng unread
    getDashboardNotificationService().add(notif);
    syncDashboardNotificationState();
    
    // Giá»›i háº¡n tá»‘i Ä‘a 30 thÃ´ng bÃ¡o trong lá»‹ch sá»­
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
        listContainer.innerHTML = '<div class="notification-empty-state">KhÃ´ng cÃ³ thÃ´ng bÃ¡o nÃ o</div>';
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
                    <span class="notification-item-action">gá»­i</span>
                    <span class="notification-item-amount">${notif.amount ? notif.amount.toLocaleString('vi-VN') + ' â‚«' : '0 â‚«'}</span>
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
    
    if (diffSec < 60) return 'Vá»«a xong';
    if (diffMin < 60) return `${diffMin} phÃºt trÆ°á»›c`;
    if (diffHour < 24) return `${diffHour} giá» trÆ°á»›c`;
    return new Date(timestamp).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toggleNotificationCenter(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notification-center-dropdown');
    if (!dropdown) return;
    
    const isVisible = dropdown.classList.contains('visible');
    
    // ÄÃ³ng cÃ¡c dropdown khÃ¡c náº¿u cÃ³
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
    if (!confirm("Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a toÃ n bá»™ lá»‹ch sá»­ thÃ´ng bÃ¡o?")) return;
    
    getDashboardNotificationService().clear();
    syncDashboardNotificationState();
    updateNotificationBadge();
    renderNotificationsList();
}

// --- HIá»‚N THá»Š THÃ”NG BÃO Há»† THá»NG TRÃŠN DASHBOARD ---
let dbSysAlertTimeout = null;
function showDashboardSystemAlert(title, message, badge = 'Há»† THá»NG') {
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

// --- áº¨N / HIá»†N YOUTUBE PLAYER EMBED ---
function togglePlayerVisibility() {
    const wrapper = document.getElementById('youtube-player-container-wrapper');
    if (wrapper.classList.contains('hidden-player')) {
        wrapper.classList.remove('hidden-player');
        state.playerVisible = true;
        logSystem("Hiá»ƒn thá»‹ khung hÃ¬nh Youtube.");
    } else {
        wrapper.classList.add('hidden-player');
        state.playerVisible = false;
        logSystem("áº¨n khung hÃ¬nh Youtube.");
    }
    localStorage.setItem('dua_player_visible', state.playerVisible);
}

// --- Äá»ŠNH Dáº NG THá»œI GIAN (MM:SS) ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null || seconds === undefined) {
        return "0:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- CHUYá»‚N Äá»”I CHUá»–I THá»œI LÆ¯á»¢NG (HH:MM:SS HOáº¶C MM:SS) SANG GIÃ‚Y ---
function parseDurationToSeconds(duration) {
    return getMediaParserService().parseDurationToSeconds(duration);
}

// --- GIá»šI Háº N TÆ¯Æ NG TÃC CHUNG (7 Láº¦N TRONG 18 GIá»œ) ---
function getValidActionTimestamps() {
    const raw = localStorage.getItem('dua_action_timestamps');
    let timestamps = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const eighteenHours = 18 * 60 * 60 * 1000;
    // Lá»c cÃ¡c timestamp náº±m trong vÃ²ng 18 giá» qua
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
        el.textContent = `LÆ°á»£t: 5/5`;
        el.style.color = 'var(--pineapple-text)';
        // Reset cá» bypass náº¿u cÃ³ láº¡i lÆ°á»£t bÃ¬nh thÆ°á»ng
        if (state.pausePlayBypass) {
            state.pausePlayBypass = false;
            localStorage.setItem('dua_pause_play_bypass', 'false');
        }
    } else {
        // TÃ¬m timestamp má»›i nháº¥t (cuá»‘i cÃ¹ng trong máº£ng) Ä‘áº¡i diá»‡n cho lÆ°á»£t há»“i cuá»‘i cÃ¹ng Ä‘á»ƒ vá» má»‘c full 5/5
        const newest = timestamps[timestamps.length - 1];
        const eighteenHours = 18 * 60 * 60 * 1000;
        const targetTime = newest + eighteenHours;
        const diff = targetTime - Date.now();
        
        if (diff > 0) {
            if (remaining === 0) {
                if (state.pausePlayBypass) {
                    el.innerHTML = `LÆ°á»£t: 0/5 (Há»“i full: ${formatDurationHMS(diff)}) <span style="font-size:0.75rem; color: #10b981;">(Cho phÃ©p Play)</span>`;
                    el.style.color = 'var(--pineapple-orange-dark)';
                } else {
                    el.textContent = `LÆ°á»£t: 0/5 (Há»“i full: ${formatDurationHMS(diff)})`;
                    el.style.color = '#ef4444';
                }
            } else {
                el.textContent = `LÆ°á»£t: ${remaining}/5 (Há»“i full: ${formatDurationHMS(diff)})`;
                el.style.color = 'var(--pineapple-text)';
            }
        } else {
            el.textContent = `LÆ°á»£t: 5/5`;
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
        console.warn('[ZyPage End] KhÃ´ng thá»ƒ Ä‘á»‘i chiáº¿u music_key tá»« snapshot:', error);
        return [];
    }
}

// --- BÃO CÃO Káº¾T THÃšC BÃ€I LÃŠN MÃY CHá»¦ ZYPAGE Äá»‚ TRÃ”I BÃ€I ---
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
    console.groupCollapsed(`%c[ZyPage End] ${requestId} Â· ${song?.title || musicKey || 'KhÃ´ng rÃµ bÃ i'}`, 'color:#16845b;font-weight:700');
    console.log('Chuáº©n bá»‹ gá»­i:', debugInfo);

    const missing = [];
    if (!state.zypageShopId) missing.push('shop_id');
    if (!state.zypageToken) missing.push('shop_token');
    if (!musicKey) missing.push('music_key');
    if (typeof window.electronAPI?.sendZyPageSongEnd !== 'function') missing.push('ipc');
    if (missing.length > 0) {
        const result = { success: false, reason: `missing_${missing.join('_')}`, requestId };
        console.error('KhÃ´ng gá»­i Ä‘Æ°á»£c lá»‡nh vÃ¬ thiáº¿u:', missing);
        console.log('Káº¿t quáº£:', result);
        console.groupEnd();
        logSystem(`âš ï¸ KhÃ´ng thá»ƒ káº¿t thÃºc bÃ i trÃªn ZyPage: thiáº¿u ${missing.join(', ')}.`, 'system');
        return result;
    }

    logSystem(`Äang bÃ¡o cÃ¡o káº¿t thÃºc bÃ i lÃªn ZyPage Ä‘á»ƒ trÃ´i bÃ i: <strong>${song.title}</strong>...`, 'system');
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
        console.log('Äang gá»­i má»™t lá»‡nh donate_music_end qua main process...');
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
            console.warn(`[ZyPage End] music_key ${candidate} khÃ´ng há»£p lá»‡; Ä‘ang thá»­ khÃ³a nguá»“n tiáº¿p theo.`);
        }
        if (result?.reason === 'invalid_music_key') {
            const snapshotCandidates = await resolveZyPageSongEndKeysFromSnapshot(song);
            for (const candidate of snapshotCandidates) {
                if (musicKeyCandidates.includes(candidate)) continue;
                attemptedMusicKey = candidate;
                console.warn(`[ZyPage End] Thá»­ music_key ${candidate} Ä‘Ã£ Ä‘á»‘i chiáº¿u tá»« snapshot hiá»‡n táº¡i.`);
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
        console.log('Pháº£n há»“i ZyPage:', loggedResult);
        if (result.success) {
            markZyPageSongAsEnded(song);
            console.info('[ZyPage End] ThÃ nh cÃ´ng; Ä‘Ã£ Ä‘Ã¡nh dáº¥u transaction káº¿t thÃºc.');
            logSystem(`ÄÃ£ gá»­i yÃªu cáº§u trÃ´i bÃ i lÃªn ZyPage.`, 'system');
        } else if (result.reason === 'duplicate') {
            console.warn('[ZyPage End] Bá» qua vÃ¬ music_key nÃ y Ä‘Ã£ Ä‘Æ°á»£c gá»­i thÃ nh cÃ´ng trÆ°á»›c Ä‘Ã³.');
        } else {
            console.error(`[ZyPage End] Tháº¥t báº¡i: ${result.reason || 'unknown'}`);
            logSystem(`âš ï¸ KhÃ´ng thá»ƒ káº¿t thÃºc bÃ i trÃªn ZyPage (${result.reason || 'unknown'}).`, 'system');
        }
        console.groupEnd();
        return loggedResult;
    } catch (error) {
        console.error('[ZyPage End] Exception:', error);
        console.groupEnd();
        logSystem(`âš ï¸ Lá»—i gá»­i káº¿t thÃºc bÃ i lÃªn ZyPage: ${escapeDashboardHtml(error.message || String(error))}.`, 'system');
        return { success: false, reason: 'exception', requestId, error: error.message || String(error) };
    }
}

// =========================================================================
// --- PHáº¦N PHÃT TRIá»‚N THÃŠM: Káº¾T Ná»I LIVE ZYPAGE & Láº®NG NGHE FIREBASE ---
// =========================================================================

// --- HÃ€M TRUY Váº¤N QUA PROXY CORS CÃ“ FALLBACK TRÃNH Lá»–I TIMEOUT ---
async function fetchWithCorsProxy(url) {
    const service = new window.ZyPageConnectionService({ fetchImpl: window.fetch.bind(window) });
    return service.fetchPage(url);
}

// HÃ m bÃ³c tÃ¡ch Domain vÃ  Token tá»« URL hoáº·c text
function extractZyPageDomainAndToken(input) {
    return window.ZyPageConnectionService.parseConnectionInput(input);
}

// ==========================================
// QUáº¢N LÃ Lá»œI NHáº®N DONATE & Lá»ŠCH Sá»¬ 7 NGÃ€Y
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
        logSystem(`Äang láº¥y thÃ´ng tin bÃ i hÃ¡t tá»« lá»‹ch sá»­ donate cá»§a <strong>${donorName}</strong>...`, 'system');
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
        logSystem(`ÄÃ£ thÃªm bÃ i hÃ¡t tá»« tin nháº¯n: <strong>${meta.title}</strong>`, 'queue');
        showDashboardSystemAlert("ÄÃ£ thÃªm nháº¡c", `ÄÃ£ thÃªm bÃ i hÃ¡t: <strong>${meta.title}</strong>`, 'HÃ€NG Äá»¢I');
        if (!state.currentSong && !state.focusMode) {
            playNextInQueue();
        }
    } catch (e) {
        alert("Lá»—i khi thÃªm bÃ i hÃ¡t: " + e.message);
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
    
    // Gá»­i thÃ´ng bÃ¡o Taskbar phi táº­p trung (cho mÃ n hÃ¬nh phá»¥ / khÃ´ng áº£nh hÆ°á»Ÿng game)
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
    
    // Chá»‰ kÃ­ch hoáº¡t thÃ´ng bÃ¡o gÃ³c trÃªn Dashboard náº¿u ráº¥t má»›i vÃ  Ä‘Æ°á»£c yÃªu cáº§u (hoáº·c test donate)
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
                donorName: String(donation.name || 'KhÃ¡ch').trim(),
                amount: Number(donation.amount) || 0,
                title: String(donation.message || '(KhÃ´ng cÃ³ lá»i nháº¯n)').trim(),
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
    
    // ÄÃ¡nh dáº¥u Ä‘ang táº£i
    donationSongMetadataCache.set(url, { loading: true });
    
    let fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    if (url.includes('soundcloud.com')) {
        fetchUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    }
    
    fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
            const meta = {
                title: data.title || 'BÃ i hÃ¡t tá»« link Ä‘Ã­nh kÃ¨m',
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
            console.error("Lá»—i láº¥y metadata oEmbed cho:", url, err);
            donationSongMetadataCache.set(url, {
                title: 'ÄÆ°á»ng dáº«n bÃ i hÃ¡t',
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
        return "HÃ´m nay";
    } else if (isYesterday) {
        return "HÃ´m qua";
    } else {
        return `NgÃ y ${day}/${month}/${year}`;
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
        statsLine.textContent = `${totalCount} lÆ°á»£t donate`;
    }
    
    let history = [...fullHistory];
    
    // Lá»c lá»‹ch sá»­ náº¿u cÃ³ tá»« khÃ³a tÃ¬m kiáº¿m
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
                    <div class="empty-history-title">KhÃ´ng tÃ¬m tháº¥y káº¿t quáº£</div>
                    <div class="empty-history-subtitle">Thá»­ tÃ¬m kiáº¿m báº±ng tá»« khÃ³a khÃ¡c xem sao.</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-history-notice">
                    <i class="fa-solid fa-envelope-open-text empty-history-icon"></i>
                    <div class="empty-history-title">ChÆ°a cÃ³ lá»i nháº¯n nÃ o</div>
                    <div class="empty-history-subtitle">CÃ¡c lá»i nháº¯n donate sáº½ xuáº¥t hiá»‡n á»Ÿ Ä‘Ã¢y.</div>
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
            <span class="timeline-date-separator" style="color: var(--pineapple-text); opacity: 0.4; margin: 0 0.2rem;">â€¢</span>
            <span class="timeline-date-count">${group.items.length} lÆ°á»£t donate</span>
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
            cardEl.title = "Click Ä‘á»ƒ xem chi tiáº¿t";
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
                            <svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang táº£i thÃ´ng tin nháº¡c...
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
                                    <a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bÃ i hÃ¡t trÃªn trÃ¬nh duyá»‡t máº·c Ä‘á»‹nh" onclick="openExternalLink(event, '${songLink}')">
                                        ${meta.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem; opacity: 0.6;"></i>
                                    </a>
                                </div>
                                <div class="song-attachment-author" title="${meta.author}">${meta.author}</div>
                            </div>
                            <button class="song-attachment-add-btn" onclick="window.quickAddSongFromHistory('${type}', '${videoId || ''}', '${scUrl || ''}', '${encodeURIComponent(item.name)}', ${item.amount})">
                                ThÃªm nhanh
                            </button>
                        </div>
                    `;
                }
            }
            
            cardEl.innerHTML = `
                <div class="donation-history-meta">
                    <span class="donation-history-donor">
                        <strong>${item.name}</strong>
                        <span class="donation-history-amount">${item.amount.toLocaleString('vi-VN')} VNÄ</span>
                    </span>
                    <span class="donation-history-time">${fullTimeStr}</span>
                </div>
                ${item.message ? `<div class="donation-history-message">${formatMessageWithLinks(item.message, item.name, item.amount)}</div>` : '<div class="donation-history-message" style="opacity: 0.5;">(KhÃ´ng cÃ³ lá»i nháº¯n)</div>'}
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
    // Láº¥y tá»‘i Ä‘a 2 donate gáº§n nháº¥t
    const recent = history.slice(0, 2);

    if (recent.length === 0) {
        container.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--pineapple-text); opacity: 0.6; text-align: center; padding: 0.5rem 0;">
                ChÆ°a nháº­n Ä‘Æ°á»£c donate nÃ o
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
                songTitleHtml = `<div style="font-size: 0.85rem; font-weight: 800; color: var(--pineapple-orange-dark, #D97706); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${meta.title}"><a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bÃ i hÃ¡t trÃªn trÃ¬nh duyá»‡t máº·c Ä‘á»‹nh" onclick="openExternalLink(event, '${songLink}')">${meta.title}</a></div>`;
            } else {
                songTitleHtml = `<div style="font-size: 0.85rem; font-weight: 800; color: var(--pineapple-orange-dark, #D97706); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Äang táº£i tÃªn bÃ i hÃ¡t...</div>`;
            }
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'recent-donation-item';
        itemEl.style.cssText = 'background: transparent; border: 1px solid var(--pineapple-border-color); border-radius: 12px; padding: 0.6rem 0.8rem; box-shadow: none; display: flex; flex-direction: column; gap: 0.15rem;';

        itemEl.innerHTML = `
            ${songTitleHtml}
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 800; color: var(--pineapple-text);">
                <span>${item.name}</span>
                <span style="color: var(--pineapple-orange-dark);">+${item.amount.toLocaleString('vi-VN')} â‚«</span>
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
    document.getElementById('donation-detail-amount').textContent = `${item.amount.toLocaleString('vi-VN')} VNÄ`;
    
    const date = new Date(item.timestamp);
    const fullTimeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    document.getElementById('donation-detail-time').textContent = fullTimeStr;
    
    const msgArea = document.getElementById('donation-detail-message');
    msgArea.innerHTML = item.message ? formatMessageWithLinks(item.message, item.name, item.amount) : '<span style="opacity: 0.5;">(KhÃ´ng cÃ³ lá»i nháº¯n)</span>';
    
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
                <svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang táº£i thÃ´ng tin nháº¡c...
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
                                    <a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bÃ i hÃ¡t trÃªn trÃ¬nh duyá»‡t" onclick="event.stopPropagation()">
                                        ${updatedMeta.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem; opacity: 0.6;"></i>
                                    </a>
                                </div>
                                <div class="song-attachment-author" title="${updatedMeta.author}">${updatedMeta.author}</div>
                            </div>
                            <button class="song-attachment-add-btn" onclick="window.quickAddSongFromHistory('${type}', '${videoId || ''}', '${scUrl || ''}', '${encodeURIComponent(item.name)}', ${item.amount})">
                                ThÃªm nhanh
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
                            <a href="${songLink}" target="_blank" rel="noopener noreferrer" class="song-title-link" title="Xem bÃ i hÃ¡t trÃªn trÃ¬nh duyá»‡t" onclick="event.stopPropagation()">
                                ${meta.title} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem; opacity: 0.6;"></i>
                            </a>
                        </div>
                        <div class="song-attachment-author" title="${meta.author}">${meta.author}</div>
                    </div>
                    <button class="song-attachment-add-btn" onclick="window.quickAddSongFromHistory('${type}', '${videoId || ''}', '${scUrl || ''}', '${encodeURIComponent(item.name)}', ${item.amount})">
                        ThÃªm nhanh
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
    if (confirm("Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a toÃ n bá»™ lá»‹ch sá»­ lá»i nháº¯n donate?")) {
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
    if (headerEl) headerEl.textContent = donation.isPlaylistDonation ? 'DONATE PLAYLIST Má»šI' : 'DONATE Má»šI';
    if (messageEl) {
        messageEl.textContent = donation.message ? `"${donation.message}"` : '(KhÃ´ng cÃ³ lá»i nháº¯n)';
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

// Káº¿t ná»‘i Live vá»›i ZyPage
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
        if (!isAutoReconnect) alert("Vui lÃ²ng Ä‘iá»n link trang ZyPage trÆ°á»›c!");
        return;
    }

    const { domain, token, pathType } = extractZyPageDomainAndToken(inputVal);
    if (!token || token.length < 10) {
        alert("Link ZyPage hoáº·c Shop Token khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng!");
        return;
    }

    // Kiá»ƒm tra xem ngÆ°á»i dÃ¹ng cÃ³ nháº­p thá»§ cÃ´ng Shop ID khÃ´ng
    let shopId = shopIdInput ? shopIdInput.value.trim() : '';

    updateZyPageStatusBadge('connecting', 'Äang káº¿t ná»‘i...');
    logSystem(`Äang káº¿t ná»‘i tá»›i Live ZyPage [Token: ${token}]...`);

    if (isAutoReconnect && shopId) {
        logSystem(`Sá»­ dá»¥ng Shop ID Ä‘Ã£ lÆ°u: <strong>${shopId}</strong>`);
        // LÆ°u cáº¥u hÃ¬nh vÃ  khá»Ÿi Ä‘á»™ng luÃ´n
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
        // Táº£i mÃ£ nguá»“n trang ZyPage Ä‘á»ƒ bÃ³c tÃ¡ch Shop ID (sá»­ dá»¥ng proxy cÃ³ fallback)
        const resJson = await fetchWithCorsProxy(`${domain}/${pathType}/${token}`);
        
        if (!resJson.contents) {
            throw new Error("KhÃ´ng láº¥y Ä‘Æ°á»£c ná»™i dung trang.");
        }

        // DÃ¹ng Regex trÃ­ch xuáº¥t shop_id
        const shopIdMatch = resJson.contents.match(/"shop_id"\s*:\s*(\d+)/) || resJson.contents.match(/shop_id\s*:\s*(\d+)/);
        if (!shopIdMatch) {
            throw new Error("KhÃ´ng tÃ¬m tháº¥y shop_id trong mÃ£ nguá»“n.");
        }

        shopId = shopIdMatch[1];
        logSystem(`ÄÃ£ tá»± Ä‘á»™ng tÃ¬m tháº¥y Shop ID ZyPage: <strong>${shopId}</strong>`);
        
        if (shopIdInput) {
            shopIdInput.value = shopId;
        }

        // LÆ°u cáº¥u hÃ¬nh
        state.zypageToken = token;
        state.zypageShopId = shopId;
        state.zypageDomain = domain;
        state.zypagePathType = pathType;
        localStorage.setItem('dua_zypage_token', token);
        localStorage.setItem('dua_zypage_shop_id', shopId);
        localStorage.setItem('dua_zypage_domain', domain);
        localStorage.setItem('dua_zypage_path_type', pathType);
        saveConfigToAppData(inputVal, shopId);

        // Khá»Ÿi Ä‘á»™ng cá»•ng láº¯ng nghe Firebase Realtime Database
        startFirebaseListener(shopId, token);

    } catch (err) {
        console.error("ZyPage live connect error:", err);
        logSystem(`Káº¿t ná»‘i tá»± Ä‘á»™ng tháº¥t báº¡i: ${err.message}`, 'system');
        logSystem(`ðŸ’¡ Máº¹o: HÃ£y tá»± nháº­p Shop ID vÃ o Ã´ 'Shop ID (TÃ¹y chá»n)' Ä‘á»ƒ bá» qua bÆ°á»›c cÃ o dá»¯ liá»‡u tá»± Ä‘á»™ng bá»‹ lá»—i!`, 'system');
        updateZyPageStatusBadge('disconnected', 'Cáº§n nháº­p Shop ID');
        if (!isAutoReconnect) {
            alert("Káº¿t ná»‘i tá»± Ä‘á»™ng tháº¥t báº¡i do mÃ¡y chá»§ trung gian bá»‹ lá»—i (522/Timeout).\n\nVui lÃ²ng tá»± nháº­p mÃ£ 'Shop ID' thá»§ cÃ´ng Ä‘á»ƒ kÃ­ch hoáº¡t cá»•ng káº¿t ná»‘i trá»±c tiáº¿p!");
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
    console.log('BÃ i nháº­n Ä‘Æ°á»£c:', summarizeZyPageSongForLog(incomingSong));
    if (existingSong) console.log('Báº£n Ä‘ang giá»¯ trong hÃ ng Ä‘á»£i:', summarizeZyPageSongForLog(existingSong));
    console.log('Thá»i Ä‘iá»ƒm xá»­ lÃ½:', new Date().toISOString());
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

    const initialLabel = isInitialSnapshot ? ' Â· snapshot khá»Ÿi táº¡o (khÃ´ng xá»­ lÃ½)' : '';
    console.groupCollapsed(`%c[ZyPage Firebase] ${eventType}${initialLabel} Â· ${receivedAt}`, 'color:#16845b;font-weight:600');
    console.log('Loáº¡i event:', eventType);
    console.log('Nháº­n lÃºc:', receivedAt);
    console.log('Payload Firebase:', val);
    console.log('BÃ i Ä‘ang phÃ¡t:', state.currentSong || null);
    console.log(`HÃ ng Ä‘á»£i trÆ°á»›c xá»­ lÃ½ (${queueSnapshot.length} video):`);
    if (queueSnapshot.length > 0) console.table(queueSnapshot);
    else console.log('(trá»‘ng)');
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
                    ? 'Nháº­n order nháº¡c chÃ­nh thá»©c'
                    : 'PhÃ¡t hiá»‡n link nháº¡c trong tin nháº¯n donate';
                logSystem(`[ZyPage] ${action} tá»« <strong>${song.donorName}</strong>: ${song.title}`, 'queue');
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
                console.error(`Lá»—i xá»­ lÃ½ lá»‡nh donate${context ? ` tá»« ${context}` : ''}:`, error);
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
            onError: (error, action) => console.error(`Lá»—i xá»­ lÃ½ Firebase ${action}:`, error)
        }));
}

// Khá»Ÿi cháº¡y cá»•ng láº¯ng nghe Firebase
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
        updateZyPageStatusBadge('connected', 'ÄÃ£ káº¿t ná»‘i Live');
        
        document.getElementById('btn-zypage-connect').style.display = 'none';
        document.getElementById('btn-zypage-disconnect').style.display = 'inline-flex';
        
        logSystem("Äá»“ng bá»™ Live Firebase hoÃ n táº¥t! Sáºµn sÃ ng nháº­n nháº¡c tá»± Ä‘á»™ng.", 'system');

        // KÃªnh OBS dÃ¹ng localSyncKey cá»‘ Ä‘á»‹nh, khÃ´ng phá»¥ thuá»™c token ZyPage.
        updateObsUrlDisplay();

        syncQueueFromZyPageApi(shopId);

    } catch (err) {
        console.error("Firebase setup error:", err);
        logSystem(`Lá»—i khá»Ÿi táº¡o Realtime Database: ${err.message}`, 'system');
        updateZyPageStatusBadge('disconnected', 'Lá»—i Firebase');
    }
}

// Ngáº¯t káº¿t ná»‘i Live ZyPage
function disconnectZyPageLive() {
    window.zypageFirebaseListenerService?.unsubscribe();
    state.firebaseRef = null;

    state.zypageConnected = false;
    state.zypageToken = '';
    state.zypageShopId = '';
    
    localStorage.removeItem('dua_zypage_token');
    localStorage.removeItem('dua_zypage_shop_id');

    updateZyPageStatusBadge('disconnected', 'ChÆ°a káº¿t ná»‘i');
    
    document.getElementById('btn-zypage-connect').style.display = 'inline-flex';
    document.getElementById('btn-zypage-disconnect').style.display = 'none';
    
    logSystem("ÄÃ£ ngáº¯t káº¿t ná»‘i vá»›i Live ZyPage.", 'system');

    updateObsUrlDisplay();
}

// --- Tá»° Äá»˜NG Sá»¬A TIÃŠU Äá»€ Lá»–I ENCODE (Dáº¤U Há»ŽI CHáº¤M) CHO CÃC BÃ€I TRONG HÃ€NG Äá»¢I ---
async function autoFixQueueEncodings() {
    if (!state.queue || state.queue.length === 0) return;
    
    let isChanged = false;
    const changedSongIds = new Set();
    for (let i = 0; i < state.queue.length; i++) {
        const song = state.queue[i];
        // Náº¿u tiÃªu Ä‘á» bá»‹ vá»¡ font (chá»©a dáº¥u há»i cháº¥m)
        if (song && song.title && hasBrokenTextEncoding(song.title)) {
            try {
                logSystem(`âš ï¸ [Auto Fix] PhÃ¡t hiá»‡n bÃ i hÃ¡t trong hÃ ng Ä‘á»£i bá»‹ lá»—i tiÃªu Ä‘á» encode: "${song.title}". Äang tá»± Ä‘á»™ng cÃ o láº¡i...`, 'system');
                const meta = await fetchSongMetadata(song.type, song.videoId, song.soundcloudUrl);
                if (meta && meta.title && !hasBrokenTextEncoding(meta.title)) {
                    const repairedTitle = normalizeFancyText(meta.title);
                    if (repairedTitle !== song.title) {
                        song.title = repairedTitle;
                        if (meta.author && !song.author) song.author = normalizeFancyText(meta.author);
                        if (meta.channelName || meta.author) song.channelName = normalizeFancyText(meta.channelName || meta.author);
                        changedSongIds.add(String(song.id));
                        isChanged = true;
                        logSystem(`âœ… [Auto Fix] ÄÃ£ sá»­a tiÃªu Ä‘á» bÃ i hÃ¡t thÃ nh cÃ´ng: <strong>${song.title}</strong>`, 'system');
                    }
                }
            } catch (e) {
                console.error("Lá»—i khi tá»± Ä‘á»™ng sá»­a encoding bÃ i hÃ¡t:", e);
            }
        }
    }
    
    if (isChanged) {
        // Cáº­p nháº­t láº¡i bÃ i Ä‘ang phÃ¡t náº¿u nÃ³ bá»‹ thay Ä‘á»•i tiÃªu Ä‘á»
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

// Gá»i API láº¥y hÃ ng Ä‘á»£i bÃ i hÃ¡t má»›i nháº¥t tá»« mÃ¡y chá»§ ZyPage
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
            logSystem(`[ZyPage API] Pháº£n há»“i JSON nháº­n Ä‘Æ°á»£c tá»« ZyPage:<br><pre style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 8px; overflow-x: auto; max-height: 200px; font-family: monospace; font-size: 0.75rem; text-align: left; margin: 5px 0; border: 1px solid var(--pineapple-border-color); white-space: pre-wrap; word-break: break-all;">${JSON.stringify(snapshot.contents, null, 2)}</pre>`, 'system');
            logSystem(`ðŸ” [API Debug] Danh sÃ¡ch ID hÃ ng Ä‘á»£i trÃªn server ZyPage: musicList=[${snapshot.musicKeys.join(', ') || 'Trá»‘ng'}] | plainList=[${snapshot.plainKeys.join(', ') || 'Trá»‘ng'}]`, 'system');
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

// Cáº­p nháº­t tháº» tráº¡ng thÃ¡i ZyPage
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

// HÃ m cáº­p nháº­t hiá»ƒn thá»‹ Ã¢m lÆ°á»£ng vÃ  hiá»‡u á»©ng cáº§u vá»“ng cho thanh trÆ°á»£t
function updateAdaptiveVolumeUI(adjustedVolume, loudnessDb, isPlaying) {
    const isAdaptiveEnabled = localStorage.getItem('dua_adaptive_volume_enabled') === 'true';
    const volumeSlider = document.getElementById('volume-slider');
    const volDisplay = document.getElementById('volume-val-display');
    const adaptiveVolRow = document.getElementById('player-adaptive-volume-row');
    const adaptiveVolText = document.getElementById('player-adaptive-vol-text');
    const adaptiveBadge = document.getElementById('adaptive-volume-badge');
    const adaptiveInfo = document.getElementById('adaptive-volume-info');

    // áº¨n badge rÆ°á»m rÃ 
    if (adaptiveVolRow) adaptiveVolRow.style.display = 'none';
    if (adaptiveBadge) adaptiveBadge.style.display = 'none';

    if (!volumeSlider || !volDisplay) return;

    const isAdjusted = isAdaptiveEnabled && adjustedVolume !== undefined && adjustedVolume !== state.volume && isPlaying;

    // In log chi tiáº¿t tá»± Ä‘á»™ng vÃ o báº£ng log há»‡ thá»‘ng cá»§a dashboard Ä‘á»ƒ ngÆ°á»i dÃ¹ng theo dÃµi
    if (isPlaying) {
        if (window.lastAdaptiveSystemLogTime === undefined || Date.now() - window.lastAdaptiveSystemLogTime > 8000) {
            window.lastAdaptiveSystemLogTime = Date.now();
            
            if (!isAdaptiveEnabled) {
                logSystem(`âš™ï¸ [Ã‚m lÆ°á»£ng thÃ­ch á»©ng] ChÆ°a báº­t tÃ­nh nÄƒng trong cÃ i Ä‘áº·t.`, 'system');
            } else if (adjustedVolume === undefined) {
                logSystem(`âš ï¸ [Ã‚m lÆ°á»£ng thÃ­ch á»©ng] ChÆ°a nháº­n Ä‘Æ°á»£c dá»¯ liá»‡u volume thÃ­ch á»©ng tá»« OBS Overlay.`, 'system');
            } else if (loudnessDb === null || loudnessDb === undefined) {
                logSystem(`âš ï¸ [Ã‚m lÆ°á»£ng thÃ­ch á»©ng] Video nÃ y khÃ´ng cÃ³ dá»¯ liá»‡u Loudness (hoáº·c API /api/yt-loudness tráº£ vá» null).`, 'system');
            } else if (adjustedVolume === state.volume) {
                logSystem(`âš™ï¸ [Ã‚m lÆ°á»£ng thÃ­ch á»©ng] TrÃ¹ng khá»›p vá»›i Ã¢m lÆ°á»£ng gá»‘c (${state.volume}%), khÃ´ng cáº§n Ä‘iá»u chá»‰nh.`, 'system');
            }
        }
    }

    if (isAdjusted) {
        // LÆ°u láº¡i thÃ´ng tin phá»¥c vá»¥ viá»‡c há»c há»i (user tuning)
        state.adaptiveActive = true;
        state.adaptiveLoudnessDb = loudnessDb;
        state.adaptiveOrigVolume = state.volume;
        state.adaptiveAdjustedVolume = adjustedVolume;

        // Cáº­p nháº­t sá»‘ % hiá»ƒn thá»‹ vÃ  giÃ¡ trá»‹ thanh trÆ°á»£t vá» má»©c thÃ­ch á»©ng
        const oldText = volDisplay.textContent;
        const newText = `${adjustedVolume}%`;
        volDisplay.textContent = newText;
        volDisplay.title = `Ã‚m lÆ°á»£ng gá»‘c: ${state.volume}% â†’ ÄÃ£ thÃ­ch á»©ng vá»: ${adjustedVolume}% (Loudness: ${loudnessDb != null ? loudnessDb.toFixed(1) : 'N/A'} dB)`;
        
        if (document.activeElement !== volumeSlider) {
            volumeSlider.value = adjustedVolume;
        }
        
        if (!volumeSlider.classList.contains('adaptive-active')) {
            volumeSlider.classList.add('adaptive-active');
            logSystem(`âœ¨ <strong>[Ã‚m lÆ°á»£ng thÃ­ch á»©ng]</strong> Äang Ä‘iá»u chá»‰nh Ã¢m lÆ°á»£ng gá»‘c tá»« <strong>${state.volume}%</strong> vá» thá»±c táº¿ <strong>${adjustedVolume}%</strong> (Loudness: ${loudnessDb != null ? loudnessDb.toFixed(1) : 'N/A'} dB).`, 'system');
        } else if (oldText !== newText) {
            logSystem(`âœ¨ <strong>[Ã‚m lÆ°á»£ng thÃ­ch á»©ng]</strong> Äiá»u chá»‰nh vá» má»©c thá»±c táº¿ má»›i: <strong>${adjustedVolume}%</strong> (Loudness: ${loudnessDb != null ? loudnessDb.toFixed(1) : 'N/A'} dB).`, 'system');
        }
        
        volumeSlider.title = `Ã‚m lÆ°á»£ng thÃ­ch á»©ng: ${adjustedVolume}% (Gá»‘c: ${state.volume}%)`;
    } else {
        state.adaptiveActive = false;
        
        // Tráº£ vá» má»©c Ã¢m lÆ°á»£ng gá»‘c
        volDisplay.textContent = `${state.volume}%`;
        volDisplay.title = `Ã‚m lÆ°á»£ng: ${state.volume}%`;
        
        if (document.activeElement !== volumeSlider) {
            volumeSlider.value = state.volume;
        }
        
        if (volumeSlider.classList.contains('adaptive-active')) {
            volumeSlider.classList.remove('adaptive-active');
            logSystem(`âœ¨ <strong>[Ã‚m lÆ°á»£ng thÃ­ch á»©ng]</strong> ÄÃ£ khÃ´i phá»¥c vá» Ã¢m lÆ°á»£ng gá»‘c: <strong>${state.volume}%</strong>.`, 'system');
        }
        volumeSlider.title = `Ã‚m lÆ°á»£ng: ${state.volume}%`;
    }
    
    // LuÃ´n log console Ä‘áº§y Ä‘á»§
    if (window.lastAdaptiveLogTime === undefined || Date.now() - window.lastAdaptiveLogTime > 3000) {
        window.lastAdaptiveLogTime = Date.now();
        console.log("[Adaptive Volume Debug] isAdaptiveEnabled:", isAdaptiveEnabled, "| adjustedVolume:", adjustedVolume, "| targetVolume:", state.volume, "| loudnessDb:", loudnessDb, "| isPlaying:", isPlaying, "| isAdjusted:", isAdjusted);
    }
}

// Láº¯ng nghe sá»± kiá»‡n Ä‘á»“ng bá»™ tráº¡ng thÃ¡i tá»« OBS Overlay phÃ¡t ngÆ°á»£c láº¡i Dashboard
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
    logSystem(`ÄÃ£ phÃ¡t xong: <strong>${completedSong.title}</strong>`);
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
// --- CÆ  Sá»ž Dá»® LIá»†U REALTIME DASHBOARD â†” OBS ---
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
    if (state.alertActionText && state.alertActionText !== 'gá»­i má»™t quáº£ dá»©a') {
        url += `&alert_action=${encodeURIComponent(state.alertActionText)}`;
    }
    
    obsUrlInput.value = url;
}

function onThemeChange(theme) {
    theme = getDashboardSettingsService().setTheme(theme);
    state.theme = theme;
    updateObsUrlDisplay();
    publishMqtt('theme_change', { theme: theme });
    
    // Cáº­p nháº­t theme xem trÆ°á»›c tá»©c thá»i
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
    logSystem(`<span style="color: var(--pineapple-success); font-weight: 600;"><i class="fa-solid fa-database"></i> Äang káº¿t ná»‘i cÆ¡ sá»Ÿ dá»¯ liá»‡u realtime...</span>`);
    // Má»™t snapshot chá»©a toÃ n bá»™ bÃ i hÃ¡t, hÃ ng Ä‘á»£i, cáº¥u hÃ¬nh vÃ  tráº¡ng thÃ¡i ban Ä‘áº§u.
    // Sau Ä‘Ã³ chá»‰ control_command vÃ  overlay_state Ä‘i qua changefeed WebSocket.
    initDashboardRealtimeListener();
    publishRealtimeSnapshot();
}
function publishMqtt(type, payload) {
    // KhÃ´ng log spammy ticks Ä‘á»ƒ trÃ¡nh rÃ¡c log
    if (type !== 'progress' && type !== 'overlay_state') {
        logSystem(`[Táº­p lá»‡nh thá»±c thi] Gá»­i Ä‘i: <strong>${type}</strong> ${payload ? `[${JSON.stringify(payload)}]` : ''}`, 'system');
    }
    publishRealtimeTransport({ type, data: payload });
}

function handleMqttMessage(topic, messageStrOrObj) {
    try {
        const payload = typeof messageStrOrObj === 'string' ? JSON.parse(messageStrOrObj) : messageStrOrObj;
        if (!payload) return;
        
        // Cáº­p nháº­t nhá»‹p tim káº¿t ná»‘i cá»§a OBS Overlay
        state.lastOverlayHeartbeat = Date.now();

        // KhÃ´ng log overlay_state hoáº·c progress Ä‘á»‹nh ká»³ Ä‘á»ƒ trÃ¡nh rÃ¡c log
        if (payload.type !== 'overlay_state' && payload.type !== 'lyrics_timing' && payload.type !== 'progress' && payload.type !== 'status' && payload.type !== 'realtime.heartbeat') {
            logSystem(`[Táº­p lá»‡nh thá»±c thi] Nháº­n láº¡i: <strong>${payload.type}</strong> ${payload.data ? `[${JSON.stringify(payload.data)}]` : ''}`, 'system');
        }

        // Overlay cÃ³ thá»ƒ káº¿t ná»‘i láº¡i vÃ  gá»­i request_sync trÆ°á»›c khi Dashboard
        // ká»‹p subscribe, khiáº¿n lÆ°á»£t reload lÃºc khá»Ÿi Ä‘á»™ng bá»‹ bá» lá»¡. Tráº¡ng thÃ¡i
        // phÃ¡t hoáº·c heartbeat Ä‘áº§u tiÃªn cÅ©ng xÃ¡c nháº­n ráº±ng Overlay Ä‘Ã£ online.
        // Háº¡ cá» trÆ°á»›c khi gá»­i lá»‡nh Ä‘á»ƒ láº§n káº¿t ná»‘i sau reload khÃ´ng táº¡o vÃ²ng láº·p.
        const isOverlayStartupSignal = payload.type === 'request_sync'
            || payload.type === 'realtime.heartbeat'
            || payload.type === 'overlay_state';
        if (state.pendingOverlayReset && isOverlayStartupSignal) {
            state.pendingOverlayReset = false;
            logSystem("Overlay Ä‘Ã£ online trong phiÃªn má»Ÿ app má»›i. Äang tá»± Ä‘á»™ng táº£i láº¡i overlay...");
            triggerResetOverlay();
            return;
        }

        if (payload.type === 'request_sync') {
            logSystem("Nháº­n yÃªu cáº§u Ä‘á»“ng bá»™ cáº¥u hÃ¬nh tá»« Overlay.");

            publishRealtimeSnapshot();
            sendControlCommand('volume', state.volume);
            const canResume = state.currentSong && !document.getElementById('resume-playback-modal');
            sendControlCommand(canResume && state.isPlaying ? 'play' : canResume ? 'pause' : 'stop');
        } else if (payload.type === 'lyrics_timing') {
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
            // Tick cÅ© cÃ³ thá»ƒ Ä‘áº¿n sau current_song má»›i. KhÃ´ng cho tráº¡ng thÃ¡i cá»§a bÃ i
            // trÆ°á»›c ghi Ä‘Ã¨ duration, nÃºt play/pause hoáº·c progress cá»§a bÃ i hiá»‡n táº¡i.
            if (data.songId != null
                && String(data.songId) !== String(state.currentSong?.id ?? '')) return;
            const ignorePreSeekProgress = shouldIgnorePreSeekProgress(data.currentTime);

            if (state.currentSong && (data.isPlaying === true || Number(data.currentTime || 0) > 0.5)) {
                state.currentSongPlaybackConfirmed = true;
            }
            setDashboardVideoLoading(Boolean(state.currentSong
                && (data.isBuffering === true || state.currentSongPlaybackConfirmed === false)));
            
            // Cáº­p nháº­t DirectStream badge dá»±a trÃªn tráº¡ng thÃ¡i phÃ¡t trá»±c tiáº¿p tá»« file
            const directStreamBadge = document.getElementById('direct-stream-badge');
            if (directStreamBadge) {
                if (data.isDirectStream) {
                    directStreamBadge.style.display = 'inline-flex';
                } else {
                    directStreamBadge.style.display = 'none';
                }
            }

            // Cáº­p nháº­t hiá»ƒn thá»‹ Ã¢m lÆ°á»£ng thÃ­ch á»©ng náº¿u cÃ³ dá»¯ liá»‡u tá»« overlay
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
                publishMqtt('playlist.track_progress', {
                    playlistRequestId: state.currentSong.playlistRequestId,
                    trackId: state.currentSong.playlistTrackId,
                    currentTrack: state.currentSong.playlistPosition,
                    totalTracks: state.currentSong.playlistTotalTracks,
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

                    // Ghi láº¡i vÃ o localStorage Ä‘á»ƒ Ä‘á»“ng bá»™ Ä‘á»“ng nháº¥t
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

                // áº¨n countdown khi phÃ¡t nháº¡c thÆ°á»ng
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

                // Cáº­p nháº­t countdown badge trÃªn dashboard
                const dashCountdown = document.getElementById('dash-live-countdown');
                const dashCdTime = document.getElementById('dash-cd-time');

                if (limitDuration > 0) {
                    const displayElapsedTime = Math.min(limitDuration, elapsedTime);
                    if (progressSlider) {
                        const pct = (displayElapsedTime / limitDuration) * 100;
                        progressSlider.value = pct;
                        progressSlider.style.background = `linear-gradient(to right, var(--pineapple-orange) 0%, var(--pineapple-orange) ${pct}%, var(--pineapple-white) ${pct}%, var(--pineapple-white) 100%)`;
                    }
                    // Hiá»‡n countdown vá»›i thá»i gian cÃ²n láº¡i
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
                    // áº¨n countdown khi khÃ´ng cÃ³ giá»›i háº¡n
                    if (dashCountdown) dashCountdown.classList.remove('visible');
                }
            }
        } else if (payload.type === 'overlay_event') {
            handleOverlayPlaybackEvent(payload.event);
        } else if (payload.type === 'overlay_log') {
            const d = payload.data;
            logSystem(`ðŸ” <strong>[Overlay Log]</strong> ${d && d.msg ? d.msg : ''} ${d && d.data ? JSON.stringify(d.data).slice(0, 300) : ''}`, 'system');
        } else if (payload.type === 'overlay_error') {
            const d = payload.data;
            logSystem(`ðŸš¨ <strong>[Overlay Error]</strong> ${d && d.message ? d.message : JSON.stringify(d).slice(0, 300)}`, 'system');
        }
    } catch (e) {
        console.error("Error parsing realtime message:", e);
    }
}


// --- Äá»ŒC VÃ€ GHI Cáº¤U HÃŒNH ZYPAGE VÃ€O APPDATA ---
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
        console.log("ÄÃ£ lÆ°u cáº¥u hÃ¬nh ZyPage vÃ o AppData thÃ nh cÃ´ng.");
    } catch (e) {
        console.warn("KhÃ´ng thá»ƒ lÆ°u cáº¥u hÃ¬nh vÃ o AppData:", e);
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
                    // Cáº¥u hÃ¬nh cÅ© chÆ°a cÃ³ version Ä‘Æ°á»£c chuyá»ƒn vá» máº·c Ä‘á»‹nh 500k/30p/50k/5p.
                    // Cáº¥u hÃ¬nh version 2 do ngÆ°á»i dÃ¹ng lÆ°u Ä‘Æ°á»£c giá»¯ nguyÃªn.
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
                
                // Tá»± Ä‘á»™ng káº¿t ná»‘i láº¡i
                connectZyPageLive(true);
                return;
            }
        }
    } catch (e) {
        console.warn("KhÃ´ng thá»ƒ táº£i cáº¥u hÃ¬nh tá»« AppData, dÃ¹ng localStorage cÅ© lÃ m dá»± phÃ²ng:", e);
    }

    // Dá»± phÃ²ng (Fallback) khi cháº¡y file:/// hoáº·c API lá»—i
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

    // Táº£i danh sÃ¡ch video nháº¡y cáº£m trá»±c tuyáº¿n vÃ  cáº­p nháº­t giao diá»‡n
    fetchSensitiveVideosConfig().then(() => {
        updatePlayerUI(state.currentSong);
    });
    // Tá»± Ä‘á»™ng táº£i láº¡i má»—i 10 phÃºt
    setInterval(fetchSensitiveVideosConfig, 10 * 60 * 1000);
}

function onMinAmountConfigChange(value) {
    const amount = isNaN(value) || value === '' ? 49000 : Number(value);
    state.zypageMinMessageAmount = amount;
    localStorage.setItem('dua_zypage_min_message_amount', amount);
    
    const urlInput = document.getElementById('zypage-url');
    const url = urlInput ? urlInput.value.trim() : '';
    saveConfigToAppData(url, state.zypageShopId);
    
    logSystem(`[Cáº¥u hÃ¬nh] Thay Ä‘á»•i sá»‘ tiá»n tá»‘i thiá»ƒu nháº­n nháº¡c tá»« tin nháº¯n: <strong>${amount.toLocaleString('vi-VN')} VNÄ</strong>`, 'system');
}

// --- YÃŠU Cáº¦U OVERLAY LOAD Láº I TRANG (RESET) ---
function triggerResetOverlay() {
    logSystem("Gá»­i yÃªu cáº§u Reset/Táº£i láº¡i trang tá»›i Overlay...", 'system');
    sendControlCommand('reload');
}

function clearQuickSearch() {
    const urlInput = document.getElementById('donor-url');
    getQuickAddUiController().clear();
    if (urlInput) urlInput.blur();
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
}

// --- CÃC HÃ€M TRá»¢ GIÃšP CHO CHá»¨C NÄ‚NG YÃŠU THÃCH (FAVORITES) ---
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
        logSystem(`ÄÃ£ xÃ³a khá»i danh sÃ¡ch YÃªu thÃ­ch: <strong>${song.title}</strong>`, 'system');
        showDashboardSystemAlert("YÃªu thÃ­ch", `ÄÃ£ xÃ³a khá»i danh sÃ¡ch YÃªu thÃ­ch: <strong>${song.title}</strong>`, 'Há»† THá»NG');
    } else {
        logSystem(`ÄÃ£ thÃªm vÃ o danh sÃ¡ch YÃªu thÃ­ch: <strong>${song.title}</strong>`, 'system');
        showDashboardSystemAlert("YÃªu thÃ­ch", `ÄÃ£ lÆ°u vÃ o danh sÃ¡ch YÃªu thÃ­ch: <strong>${song.title}</strong>`, 'Há»† THá»NG');
    }

    // Danh sÃ¡ch YÃªu thÃ­ch luÃ´n pháº£n Ã¡nh dá»¯ liá»‡u má»›i ngay táº¡i nÆ¡i phÃ¡t sinh thay Ä‘á»•i.
    // Äáº·t á»Ÿ hÃ m dÃ¹ng chung Ä‘á»ƒ nÃºt tim trong Player, tÃ¬m kiáº¿m vÃ  danh sÃ¡ch Ä‘á»u Ä‘á»“ng bá»™.
    renderFavoritesList();
    
    // Cáº­p nháº­t láº¡i UI nÃºt TrÃ¡i tim cá»§a Player náº¿u bÃ i Ä‘ang phÃ¡t trÃ¹ng khá»›p bÃ i vá»«a toggle
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
            favBtn.title = isNowFav ? 'Bá» yÃªu thÃ­ch' : 'YÃªu thÃ­ch';
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

    logSystem(`ÄÃ£ thÃªm nhanh bÃ i hÃ¡t tá»« danh sÃ¡ch YÃªu thÃ­ch: <strong>${favorite.title}</strong>`, 'queue');
    showDashboardSystemAlert('ÄÃ£ thÃªm nháº¡c nhanh', `ÄÃ£ thÃªm nhanh bÃ i yÃªu thÃ­ch: <strong>${favorite.title}</strong>`, 'HÃ€NG Äá»¢I');

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
                ChÆ°a cÃ³ bÃ i hÃ¡t yÃªu thÃ­ch nÃ o.<br/>HÃ£y báº¥m icon TrÃ¡i tim á»Ÿ káº¿t quáº£ tÃ¬m kiáº¿m hoáº·c trÃ¬nh phÃ¡t Ä‘á»ƒ lÆ°u bÃ i!
            </div>
        `;
        return;
    }
    
    state.favorites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'grid-result-item';
        item.title = 'Nháº¥p Ä‘á»ƒ thÃªm vÃ o hÃ ng Ä‘á»£i Â· Chuá»™t pháº£i Ä‘á»ƒ xem tÃ¹y chá»n';
        
        let displayDuration = fav.duration || '--:--';
        if (displayDuration && (typeof displayDuration === 'number' || /^\d+(\.\d+)?$/.test(displayDuration.toString().trim()))) {
            displayDuration = formatTime(parseFloat(displayDuration));
        }
        
        item.innerHTML = `
            <div class="grid-result-thumb-wrapper">
                <img src="${fav.thumbnail}" alt="thumb">
                <span class="grid-result-duration">${displayDuration}</span>
                <button type="button" class="fav-item-remove-btn" title="Bá» yÃªu thÃ­ch" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.6); color: #EF4444; border: none; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; font-size: 0.75rem;">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
            <div class="grid-result-info">
                <div class="grid-result-title" title="${fav.title}">${fav.title}</div>
                <div class="grid-result-meta" title="${fav.author || ''} â€¢ ${fav.views || ''}">
                    <span>${fav.author || 'YouTube'}</span>
                    ${fav.views ? `â€¢ <span>${formatViewsCompact(fav.views)} views</span>` : ''}
                </div>
            </div>
        `;
        
        // Báº¥m chá»n phÃ¡t nhanh bÃ i hÃ¡t yÃªu thÃ­ch
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
                title: fav.title || 'BÃ i hÃ¡t yÃªu thÃ­ch',
                url: getFavoriteExternalUrl(fav)
            });
        });
        
        // Báº¥m nÃºt xÃ³a tim
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
                statusBadge.textContent = 'ÄÃ£ káº¿t ná»‘i';
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
            if (nameText) nameText.textContent = 'ChÆ°a káº¿t ná»‘i tÃ i khoáº£n';
            if (avatarImg) {
                avatarImg.style.display = 'none';
                avatarImg.src = '';
            }
            if (statusBadge) {
                statusBadge.textContent = 'ChÆ°a káº¿t ná»‘i';
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
            if (plistSelect) plistSelect.innerHTML = '<option value="">-- Chá»n Playlist --</option>';
            const plistList = document.getElementById('qa-playlists-list');
            if (plistList) plistList.innerHTML = '';
            
            // Auto switch to favorites when not logged in
            switchQuickAddTab('favorites');
        }
    } catch (e) {
        console.error("Lá»—i khi kiá»ƒm tra Ä‘Äƒng nháº­p YouTube:", e);
    }
}

async function loginYoutube() {
    if (!window.electronAPI || typeof window.electronAPI.ytLogin !== 'function') {
        alert("TÃ­nh nÄƒng nÃ y chá»‰ kháº£ dá»¥ng khi cháº¡y trÃªn á»©ng dá»¥ng mÃ¡y tÃ­nh (Electron)!");
        return;
    }
    
    try {
        logSystem("Äang má»Ÿ cá»­a sá»• Ä‘Äƒng nháº­p YouTube...", 'system');
        const result = await window.electronAPI.ytLogin();
        if (result && result.success) {
            logSystem("ÄÄƒng nháº­p YouTube thÃ nh cÃ´ng!", 'system');
            showDashboardSystemAlert("Äá»“ng bá»™ YouTube", "ÄÄƒng nháº­p YouTube thÃ nh cÃ´ng vÃ  Ä‘Ã£ káº¿t ná»‘i!", "Há»† THá»NG");
        } else {
            logSystem(`ÄÄƒng nháº­p YouTube tháº¥t báº¡i hoáº·c bá»‹ Ä‘Ã³ng: ${result.error || ''}`, 'system');
        }
        await checkYoutubeAuth();
    } catch (e) {
        console.error("Lá»—i khi Ä‘Äƒng nháº­p YouTube:", e);
    }
}

async function logoutYoutube() {
    if (!window.electronAPI || typeof window.electronAPI.ytLogout !== 'function') {
        return;
    }
    
    if (!confirm("Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n Ä‘Äƒng xuáº¥t tÃ i khoáº£n YouTube khá»i á»©ng dá»¥ng?")) {
        return;
    }
    
    try {
        logSystem("Äang Ä‘Äƒng xuáº¥t tÃ i khoáº£n YouTube...", 'system');
        const result = await window.electronAPI.ytLogout();
        if (result && result.success) {
            logSystem("ÄÃ£ Ä‘Äƒng xuáº¥t tÃ i khoáº£n YouTube thÃ nh cÃ´ng.", 'system');
            showDashboardSystemAlert("Äá»“ng bá»™ YouTube", "ÄÃ£ ngáº¯t káº¿t ná»‘i tÃ i khoáº£n YouTube thÃ nh cÃ´ng.", "Há»† THá»NG");
        }
        await checkYoutubeAuth();
    } catch (e) {
        console.error("Lá»—i khi Ä‘Äƒng xuáº¥t YouTube:", e);
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
                        Vui lÃ²ng káº¿t ná»‘i tÃ i khoáº£n YouTube trong pháº§n Cáº¥u hÃ¬nh Ä‘á»ƒ xem gá»£i Ã½ cÃ¡ nhÃ¢n hÃ³a!
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
                        Vui lÃ²ng káº¿t ná»‘i tÃ i khoáº£n YouTube trong pháº§n Cáº¥u hÃ¬nh Ä‘á»ƒ Ä‘á»“ng bá»™ danh sÃ¡ch phÃ¡t!
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
    
    container.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang táº£i gá»£i Ã½ tá»« YouTube...</div>';
    
    try {
        const result = await window.electronAPI.ytGetRecommendations();
        if (result && result.success) {
            hasLoadedRecommendations = true;
            getDashboardSearchService().renderResults(result.videos, 'qa-recommendations-list');
        } else {
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i: ${result.error || 'KhÃ´ng thá»ƒ láº¥y dá»¯ liá»‡u gá»£i Ã½'}</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i káº¿t ná»‘i máº¡ng: ${e.message}</div>`;
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
    
    select.innerHTML = '<option value="">-- Äang táº£i danh sÃ¡ch phÃ¡t... --</option>';
    container.innerHTML = '';
    
    try {
        const result = await window.electronAPI.ytGetPlaylists();
        if (result && result.success && result.playlists && result.playlists.length > 0) {
            hasLoadedPlaylists = true;
            select.innerHTML = '<option value="">-- Chá»n Playlist --</option>';
            result.playlists.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.playlistId;
                opt.textContent = `${p.title} (${p.videoCount} video)`;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value="">-- Lá»—i táº£i danh sÃ¡ch phÃ¡t --</option>';
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i: ${result?.error || 'KhÃ´ng tÃ¬m tháº¥y playlist cÃ¡ nhÃ¢n nÃ o'}</div>`;
        }
    } catch (e) {
        select.innerHTML = '<option value="">-- Lá»—i káº¿t ná»‘i máº¡ng --</option>';
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i: ${e.message}</div>`;
    }
}

async function loadQuickAddPlaylistVideos(playlistId) {
    const container = document.getElementById('qa-playlists-list');
    if (!container) return;
    
    if (!playlistId) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = '<div style="padding: 10px; text-align: center; font-weight: 700; color: var(--pineapple-text); display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg class="m3-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang táº£i danh sÃ¡ch video...</div>';
    
    try {
        const result = await window.electronAPI.ytGetPlaylistVideos(playlistId);
        if (result && result.success) {
            getDashboardSearchService().renderResults(result.videos, 'qa-playlists-list');
        } else {
            container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i: ${result.error || 'KhÃ´ng thá»ƒ táº£i video trong playlist nÃ y'}</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--pineapple-error); font-weight: 700;">Lá»—i káº¿t ná»‘i máº¡ng: ${e.message}</div>`;
    }
}

// --- WALKTHROUGH GIá»šI THIá»†U PHIÃŠN Báº¢N Má»šI ---
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
            showDashboardSystemAlert("Cháº¿ Ä‘á»™ xem", "ÄÃ£ quay vá» cháº¿ Ä‘á»™ xem giá»›i thiá»‡u.");
        } else {
            url.searchParams.delete('embedded');
            url.searchParams.set('edit', 'true');
            showDashboardSystemAlert("Cháº¿ Ä‘á»™ soáº¡n tháº£o âœï¸", "ÄÃ£ chuyá»ƒn sang cháº¿ Ä‘á»™ soáº¡n tháº£o trá»±c tiáº¿p trong app Electron!");
        }
        frame.src = url.toString();
    } catch (e) {
        console.error("Lá»—i chuyá»ƒn Ä‘á»•i cháº¿ Ä‘á»™ soáº¡n tháº£o:", e);
    }
}

// --- GIÃM SÃT TRáº NG THÃI Káº¾T Ná»I Dá»ŠCH Vá»¤ ---
state.lastOverlayHeartbeat = 0;
state.internetConnected = true;

let lastNetworkCheckTime = 0;
async function checkNetworkConnection() {
    if (Date.now() - lastNetworkCheckTime < 20000) return;
    lastNetworkCheckTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        // Kiá»ƒm tra káº¿t ná»‘i tá»›i Raw GitHub Gist URL
        await fetch('https://raw.githubusercontent.com', { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);
        state.internetConnected = true;
    } catch (e) {
        state.internetConnected = false;
    }
}

async function startServiceMonitorLoop() {
    setInterval(async () => {
        // 1. Kiá»ƒm tra máº¡ng & Gist
        await checkNetworkConnection();
        const netBadge = document.getElementById('monitor-internet');
        if (netBadge) {
            if (state.internetConnected) {
                netBadge.className = 'status-badge connected';
                netBadge.textContent = 'ÄANG HOáº T Äá»˜NG';
            } else {
                netBadge.className = 'status-badge disconnected';
                netBadge.textContent = 'Máº¤T Káº¾T Ná»I';
            }
        }

        // 2. Kiá»ƒm tra ZyPage Sync
        const zyBadge = document.getElementById('monitor-zypage');
        if (zyBadge) {
            if (state.zypageConnected) {
                zyBadge.className = 'status-badge connected';
                zyBadge.textContent = 'ÄÃƒ Káº¾T Ná»I';
            } else {
                zyBadge.className = 'status-badge disconnected';
                zyBadge.textContent = 'NGáº®T Káº¾T Ná»I';
            }
        }

        // 3. Kiá»ƒm tra YouTube Account Login
        const ytBadge = document.getElementById('monitor-youtube');
        if (ytBadge) {
            if (isYtLoggedIn) {
                ytBadge.className = 'status-badge connected';
                ytBadge.textContent = 'ÄÃƒ ÄÄ‚NG NHáº¬P';
            } else {
                ytBadge.className = 'status-badge disconnected';
                ytBadge.textContent = 'CHÆ¯A LIÃŠN Káº¾T';
            }
        }

        // 4. Kiá»ƒm tra OBS Overlay (WS)
        const obsBadge = document.getElementById('monitor-obs');
        if (obsBadge) {
            const isObsConnected = state.lastOverlayHeartbeat && (Date.now() - state.lastOverlayHeartbeat < 7000);
            if (isObsConnected) {
                obsBadge.className = 'status-badge connected';
                obsBadge.textContent = 'ÄÃƒ Káº¾T Ná»I';
            } else {
                obsBadge.className = 'status-badge disconnected';
                obsBadge.textContent = 'CHÆ¯A Káº¾T Ná»I';
            }
        }
    }, 2000);
}

// Lá»‡nh Ä‘á»“ng bá»™ thá»§ cÃ´ng ZyPage bá» qua bá»™ lá»c thá»i gian Ä‘á»ƒ kÃ©o cÃ¡c bÃ i hÃ¡t cÃ²n Ä‘á»ng
function triggerManualZyPageSync() {
    if (!state.zypageShopId) {
        alert("Vui lÃ²ng thiáº¿t láº­p cáº¥u hÃ¬nh Ä‘á»“ng bá»™ ZyPage trÆ°á»›c trong pháº§n CÃ i Ä‘áº·t!");
        return;
    }

    const btn = document.getElementById('btn-manual-sync');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="m3-spinner" viewBox="0 0 24 24" style="margin-right: 0.35rem;"><circle cx="12" cy="12" r="9.5" fill="none"></circle></svg> Äang táº£i...';
    }

    logSystem("Báº¯t Ä‘áº§u kÃ­ch hoáº¡t Ä‘á»“ng bá»™ thá»§ cÃ´ng hÃ ng Ä‘á»£i ZyPage...", "system");

    syncQueueFromZyPageApi(state.zypageShopId, true).finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Äá»“ng bá»™ ZyPage';
        }
    });
}

// --- Láº®NG NGHE Sá»° KIá»†N TEST DONATE (GIáº¢ Láº¬P) ---
if (window.electronAPI && typeof window.electronAPI.onTestDonate === 'function') {
    window.electronAPI.onTestDonate(async (data) => {
        if (!data) return;
        const donorName = (data.donorName || 'KhÃ¡ch').trim();
        const amountStr = String(data.amount || '0').replace(/[^0-9]/g, '');
        const amount = Number(amountStr) || 0;
        const message = (data.message || '').trim();
        let songLink = (data.songLink || '').trim();

        // Tá»± Ä‘á»™ng bÃ³c tÃ¡ch link nháº¡c tá»« tin nháº¯n náº¿u songLink trá»‘ng
        let isFromMessage = false;
        if (!songLink && message) {
            songLink = extractSongLinkFromMessage(message) || '';
            isFromMessage = Boolean(songLink);
        }

        logSystem(`ðŸ§ª <strong>[Test Donate]</strong> Nháº­n lÆ°á»£t donate thá»­ nghiá»‡m tá»« <strong>${donorName}</strong> (${amount.toLocaleString('vi-VN')} â‚«)`, 'system');

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

        // 1. Kiá»ƒm tra Vote Skip bÃ i hÃ¡t Ä‘ang phÃ¡t
        if (checkAndApplyVoteSkip(donation)) {
            logSystem(`ðŸ§ª <strong>[Test Donate]</strong> KÃ­ch hoáº¡t tÃ­nh nÄƒng Vote Skip thÃ nh cÃ´ng.`, 'system');
            isVoteSkipped = true;
        }

        // 2. Kiá»ƒm tra Gia háº¡n thá»i gian phÃ¡t bÃ i hÃ¡t Ä‘ang phÃ¡t
        if (!isVoteSkipped && checkAndApplyExtension(donation)) {
            logSystem(`ðŸ§ª <strong>[Test Donate]</strong> KÃ­ch hoáº¡t tÃ­nh nÄƒng Gia háº¡n thÃ nh cÃ´ng.`, 'system');
            isExtended = true;
        }

        // 3. Hiá»ƒn thá»‹ thÃ´ng bÃ¡o gÃ³c Dashboard & OBS Overlay
        if (!isVoteSkipped && !isExtended) {
            handleNewDonation(donation, true);
        }

        if (playlistHandled) {
            return;
        }

        if ((isVoteSkipped || isExtended) && !songLink) {
            return;
        }

        // 4. Náº¿u cÃ³ kÃ¨m link bÃ i hÃ¡t há»£p lá»‡, tá»± Ä‘á»™ng cÃ o metadata & thÃªm vÃ o hÃ ng Ä‘á»£i
        if (songLink) {
            if (isFromMessage) {
                const minAmount = state.zypageMinMessageAmount !== undefined ? state.zypageMinMessageAmount : 49000;
                if (amount < minAmount) {
                    logSystem(`âš ï¸ ðŸ§ª <strong>[Test Donate]</strong> Link nháº¡c trong tin nháº¯n bá»‹ bá» qua do sá»‘ tiá»n (${amount.toLocaleString('vi-VN')} â‚«) nhá» hÆ¡n sá»‘ tiá»n tá»‘i thiá»ƒu thiáº¿t láº­p (${minAmount.toLocaleString('vi-VN')} â‚«).`, 'system');
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
                    logSystem(`ðŸ§ª <strong>[Test Donate]</strong> Äang táº£i siÃªu dá»¯ liá»‡u cho bÃ i hÃ¡t: <strong>${songLink}</strong>...`, 'system');
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
                    logSystem(`ðŸ§ª <strong>[Test Donate]</strong> ÄÃ£ tá»± Ä‘á»™ng thÃªm nháº¡c vÃ o hÃ ng Ä‘á»£i: <strong>${meta.title}</strong>`, 'queue');
                    
                    // Cáº­p nháº­t giao diá»‡n vÃ  tá»± phÃ¡t náº¿u cáº§n
                    sortAndRefreshQueue();
                    if (!state.currentSong && !state.focusMode) {
                        playNextInQueue();
                    }
                } catch (err) {
                    console.error("Lá»—i láº¥y metadata cho bÃ i nháº¡c test donate:", err);
                    logSystem(`âš ï¸ ðŸ§ª <strong>[Test Donate]</strong> Lá»—i láº¥y siÃªu dá»¯ liá»‡u bÃ i hÃ¡t: ${err.message}`, 'error');
                }
            } else {
                logSystem(`ðŸ§ª <strong>[Test Donate]</strong> Link bÃ i hÃ¡t khÃ´ng Ä‘Æ°á»£c há»— trá»£ (cáº§n lÃ  YouTube hoáº·c SoundCloud): ${songLink}`, 'system');
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
    if (title) title.textContent = media.title || 'Media trÃªn trÃ¬nh duyá»‡t';
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

if (window.electronAPI && typeof window.electronAPI.onBrowserMediaState === 'function') {
    window.electronAPI.onBrowserMediaState(media => {
        latestBrowserMediaState = media;
        renderBrowserMediaMonitor(media);
    });
    setInterval(() => renderBrowserMediaMonitor(latestBrowserMediaState), 2000);
}

// --- Láº®NG NGHE Sá»° KIá»†N THÃŠM NHáº C Tá»ª EXTENSION ---
if (window.electronAPI && typeof window.electronAPI.onAddSongExternal === 'function') {
    window.electronAPI.onAddSongExternal(async (data) => {
        if (!data || !data.url) return;
        if (state.focusMode) {
            logSystem(`âš ï¸ <strong>[Extension]</strong> KhÃ´ng thá»ƒ thÃªm nháº¡c do Ä‘ang báº­t cháº¿ Ä‘á»™ Táº­p trung.`, 'system');
            return;
        }

        let url = data.url.trim();
        const playlistId = parseYoutubePlaylistId(url);
        if (playlistId) {
            logSystem(`ðŸ”Œ <strong>[Extension]</strong> Nháº­n yÃªu cáº§u thÃªm playlist tá»« Browser: <strong>${url}</strong>`, 'system');
            try {
                await addYoutubePlaylistFromQuickAdd(url, {
                    donorName: 'TrÃ¬nh duyá»‡t',
                    donationAmount: 100000000,
                    isOwnerAdd: true
                });
            } catch (err) {
                console.error("Lá»—i thÃªm playlist tá»« Extension:", err);
                logSystem(`âš ï¸ <strong>[Extension]</strong> Lá»—i thÃªm playlist: ${err.message}`, 'error');
            }
            return;
        }
        let videoId = parseYoutubeId(url);
        let type = 'youtube';

        if (!videoId) {
            logSystem(`âš ï¸ <strong>[Extension]</strong> Link bÃ i hÃ¡t khÃ´ng há»£p lá»‡: ${url}`, 'error');
            return;
        }

        logSystem(`ðŸ”Œ <strong>[Extension]</strong> Nháº­n yÃªu cáº§u phÃ¡t bÃ i hÃ¡t tá»« Browser: <strong>${url}</strong>`, 'system');

        try {
            let title = '';
            let thumbnail = '';

            if (window.electronAPI && typeof window.electronAPI.getYoutubeMetadata === 'function') {
                const metadata = await window.electronAPI.getYoutubeMetadata(videoId);
                title = metadata.title || `Nháº¡c YouTube (${videoId})`;
                thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            } else {
                const fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
                const response = await fetch(fetchUrl);
                const resData = await response.json();
                title = resData.title || `Nháº¡c YouTube (${videoId})`;
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
                donorName: "TrÃ¬nh duyá»‡t",
                amount: 100000000, // Máº·c Ä‘á»‹nh 100M Ä‘á»ƒ Ä‘Æ°á»£c Æ°u tiÃªn cao
                message: "Gá»­i tá»« extension trÃ¬nh duyá»‡t",
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

            logSystem(`ðŸ”Œ <strong>[Extension]</strong> ÄÃ£ thÃªm nháº¡c vÃ o hÃ ng Ä‘á»£i: <strong>${title}</strong>`, 'queue');
            showDashboardSystemAlert("Extension thÃªm nháº¡c", `ÄÃ£ thÃªm bÃ i hÃ¡t tá»« trÃ¬nh duyá»‡t: <strong>${title}</strong>`, 'HÃ€NG Äá»¢I');

            // ThÃ´ng bÃ¡o taskbar phi táº­p trung (khÃ´ng cÆ°á»›p focus)
            if (window.electronAPI && typeof window.electronAPI.showTaskbarNotification === 'function') {
                window.electronAPI.showTaskbarNotification(
                    'ÄÃ£ thÃªm bÃ i hÃ¡t tá»« trÃ¬nh duyá»‡t',
                    title,
                    document.body.classList.contains('dark-mode'),
                    3000
                );
            }

            // Tá»± Ä‘á»™ng phÃ¡t náº¿u trÃ¬nh phÃ¡t Ä‘ang dá»«ng
            if (!state.currentSong && !state.focusMode) {
                playNextInQueue();
            } else if (data.playNow) {
                // PhÃ¡t ngay láº­p tá»©c: skip bÃ i Ä‘ang phÃ¡t
                logSystem(`ðŸ”Œ <strong>[Extension]</strong> YÃªu cáº§u phÃ¡t ngay láº­p tá»©c. Äang bá» qua bÃ i hiá»‡n táº¡i...`, 'system');
                skipSong(false);
            }
        } catch (err) {
            console.error("Lá»—i thÃªm nháº¡c tá»« Extension:", err);
            logSystem(`âš ï¸ <strong>[Extension]</strong> Lá»—i láº¥y thÃ´ng tin bÃ i hÃ¡t: ${err.message}`, 'error');
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



