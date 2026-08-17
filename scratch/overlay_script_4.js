
        // Redirect debug logs to local server terminal
        (function () {
            window.debugBgLogs = [];
            const originalLog = console.log;
            console.log = function (...args) {
                originalLog.apply(console, args);
                try {
                    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
                    if (msg.includes('[DEBUG BG]') || msg.includes('[DEBUG DRAWER]')) {
                        window.debugBgLogs.push(msg);
                        fetch('http://localhost:3000/api/debug-log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: msg })
                        }).catch(() => { });
                    }
                } catch (e) { }
            };
        })();

        // Hàm chuẩn hóa font chữ điệu đà (Mathematical Alphanumeric Symbols) thành chữ thường chuẩn
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

        // Đệ quy chuẩn hóa toàn bộ chuỗi trong payload nhận được
        function normalizePayloadStrings(obj) {
            if (!obj) return obj;
            if (typeof obj === 'string') {
                return normalizeFancyText(obj);
            }
            if (typeof obj === 'object') {
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        obj[key] = normalizePayloadStrings(obj[key]);
                    }
                }
            }
            return obj;
        }

        // Tự động chuyển hướng từ 127.0.0.1 sang localhost để tránh lệch origin localStorage
        if (window.location.hostname === '127.0.0.1') {
            window.location.replace(window.location.href.replace('127.0.0.1', 'localhost'));
        }

        // Tự động điều chỉnh kích thước chữ cho màn hình chờ không có nhạc
        function adjustEmptyOverlayFontSize(element, text) {
            if (!element) return;
            const len = Array.from(String(text || '').trim()).length;
            let baseSize = 1.4; // rem
            if (len > 25) {
                // Scales down from 1.4rem to 1.0rem as length increases from 25 to 50 characters
                const scale = Math.min(1, (len - 25) / (50 - 25));
                baseSize = 1.4 - scale * 0.4;
            }
            if (baseSize < 0.9) baseSize = 0.9; // clamp minimum to 0.9rem
            element.style.fontSize = `${baseSize}rem`;
        }

        const IDLE_SLIDE_DURATION_MS = 7600;
        const IDLE_PRICE_PAGE_SIZE = 4;
        let idleSlideshowActive = false;
        let idleSlideshowStartedAt = 0;
        let idleSlideshowSignature = '';
        let idleLastRenderedSlide = '';
        let idleSlideshowElement = null;

        function escapeIdleHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function readIdleTimeLimitConfig() {
            try {
                const synced = JSON.parse(localStorage.getItem('dua_time_limit_config') || 'null');
                if (synced && typeof synced === 'object') {
                    const localShowSetting = localStorage.getItem('dua_show_idle_price_table');
                    if (localShowSetting !== null) {
                        synced.showIdlePriceTable = localShowSetting !== 'false';
                    }
                    return synced;
                }
            } catch (e) { }

            let milestones = [];
            try {
                const stored = JSON.parse(localStorage.getItem('dua_milestones') || '[]');
                if (Array.isArray(stored)) milestones = stored;
            } catch (e) { }

            return {
                enabled: localStorage.getItem('dua_max_duration_enabled') === 'true',
                showIdlePriceTable: localStorage.getItem('dua_show_idle_price_table') !== 'false',
                mode: localStorage.getItem('dua_limit_mode') || 'fixed',
                milestones,
                defaultDurationMinutes: Number(localStorage.getItem('dua_default_duration')) || 0
            };
        }

        function buildIdlePriceRows() {
            const config = readIdleTimeLimitConfig();
            // Checkbox hiển thị bảng giá hoạt động độc lập với trạng thái bật giới hạn.
            // Chỉ cần có các mốc hợp lệ đã lưu là Overlay có thể giới thiệu bảng giá.
            if (!config || config.showIdlePriceTable === false) return [];

            const normalized = (Array.isArray(config.milestones) ? config.milestones : [])
                .map(item => ({
                    amount: Math.max(0, Number(item?.amount) || 0),
                    duration: Math.max(0, Number(item?.durationMinutes ?? item?.duration) || 0)
                }))
                .filter(item => item.amount > 0 && item.duration > 0)
                .sort((a, b) => a.amount - b.amount)
                .filter((item, index, list) => index === 0 || item.amount !== list[index - 1].amount);

            const numberFormat = new Intl.NumberFormat('vi-VN');
            const formatAmountK = (amount) => {
                const thousands = Math.max(0, Number(amount) || 0) / 1000;
                return `${new Intl.NumberFormat('vi-VN', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1
                }).format(thousands)}K`;
            };
            const rows = normalized.map(item => ({
                threshold: `Dưới ${formatAmountK(item.amount)}`,
                duration: `${numberFormat.format(item.duration)} phút`
            }));

            const defaultDuration = Math.max(0, Number(config.defaultDurationMinutes) || 0);
            if (defaultDuration > 0 && normalized.length > 0) {
                rows.push({
                    threshold: `Từ ${formatAmountK(normalized[normalized.length - 1].amount)}`,
                    duration: `${numberFormat.format(defaultDuration)} phút`
                });
            }
            return rows;
        }

        function readIdlePlaylistPricing() {
            const priceTableConfig = readIdleTimeLimitConfig();
            if (!priceTableConfig || priceTableConfig.showIdlePriceTable === false) return null;
            const defaults = {
                enabled: true,
                minimumDonationVnd: 500000,
                baseDurationSec: 30 * 60,
                extraDonationStepVnd: 50000,
                extraDurationStepSec: 5 * 60
            };
            try {
                const settings = JSON.parse(localStorage.getItem('dua_playlist_settings') || 'null');
                if (settings?.playlistEnabled === false) return null;
                // Snapshot cũ chỉ có mốc 1,5 triệu/70 phút. Chỉ đọc các giá trị
                // động khi Dashboard đã gửi đúng phiên bản chính sách mới.
                if (Number(settings?.playlistPricingVersion) !== 2) return defaults;
                const normalize = (value, fallback, min) => {
                    const parsed = Number(value);
                    return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
                };
                return {
                    enabled: true,
                    minimumDonationVnd: normalize(settings.playlistMinimumDonationVnd, defaults.minimumDonationVnd, 0),
                    baseDurationSec: normalize(settings.playlistBaseDurationSec, defaults.baseDurationSec, 60),
                    extraDonationStepVnd: normalize(settings.playlistExtraDonationStepVnd, defaults.extraDonationStepVnd, 1),
                    extraDurationStepSec: normalize(settings.playlistExtraDurationStepSec, defaults.extraDurationStepSec, 60)
                };
            } catch (_) {
                return defaults;
            }
        }

        function formatIdleAmountK(amount) {
            return `${new Intl.NumberFormat('vi-VN', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1
            }).format(Math.max(0, Number(amount) || 0) / 1000)}K`;
        }

        function buildIdleSlides(message) {
            const rows = buildIdlePriceRows();
            const slides = [];
            // Khi bật bảng giá, hiển thị ngay lúc Overlay chuyển sang trạng thái chờ.
            for (let index = 0; index < rows.length; index += IDLE_PRICE_PAGE_SIZE) {
                slides.push({
                    type: 'prices',
                    rows: rows.slice(index, index + IDLE_PRICE_PAGE_SIZE),
                    page: Math.floor(index / IDLE_PRICE_PAGE_SIZE) + 1,
                    totalPages: Math.ceil(rows.length / IDLE_PRICE_PAGE_SIZE)
                });
            }
            const playlistPricing = readIdlePlaylistPricing();
            if (playlistPricing?.enabled) {
                slides.push({
                    type: 'playlist-prices',
                    title: 'Bảng giá Playlist',
                    rows: [
                        {
                            threshold: `Tối thiểu ${formatIdleAmountK(playlistPricing.minimumDonationVnd)}`,
                            duration: `${new Intl.NumberFormat('vi-VN').format(playlistPricing.baseDurationSec / 60)} phút`
                        },
                        {
                            threshold: `Thêm ${formatIdleAmountK(playlistPricing.extraDonationStepVnd)}`,
                            duration: `+${new Intl.NumberFormat('vi-VN').format(playlistPricing.extraDurationStepSec / 60)} phút`
                        }
                    ]
                });
            }
            slides.push({ type: 'message', message });
            return { slides, rows, playlistPricing };
        }

        function hasIdlePriceSlides() {
            return buildIdleSlides('').slides.some(slide => slide.type !== 'message');
        }

        function renderIdleSlideshow(element, message) {
            if (!element) return;

            if (idleSlideshowElement !== element) {
                if (idleSlideshowElement) {
                    idleSlideshowElement.classList.remove('idle-slideshow-active');
                    idleSlideshowElement.style.removeProperty('font-size');
                    idleSlideshowElement.style.removeProperty('--idle-slide-duration');
                }
                idleSlideshowActive = false;
                idleSlideshowStartedAt = 0;
                idleSlideshowSignature = '';
                idleLastRenderedSlide = '';
                idleSlideshowElement = element;
            }

            const safeMessage = message || 'Order nhạc tự động Zypage 50k';
            const { slides } = buildIdleSlides(safeMessage);
            const signature = JSON.stringify({ message: safeMessage, slides });

            if (!idleSlideshowActive || signature !== idleSlideshowSignature) {
                idleSlideshowActive = true;
                idleSlideshowStartedAt = Date.now();
                idleSlideshowSignature = signature;
                idleLastRenderedSlide = '';
            }

            const elapsed = Math.max(0, Date.now() - idleSlideshowStartedAt);
            const slideIndex = slides.length > 1
                ? Math.floor(elapsed / IDLE_SLIDE_DURATION_MS) % slides.length
                : 0;
            const slide = slides[slideIndex];
            const renderKey = `${signature}|${slideIndex}`;
            if (renderKey === idleLastRenderedSlide) return;

            idleLastRenderedSlide = renderKey;
            element.classList.add('idle-slideshow-active');
            element.classList.remove('focus-active');
            element.style.removeProperty('font-size');
            element.style.setProperty('--idle-slide-duration', `${IDLE_SLIDE_DURATION_MS}ms`);
            const transitionClass = slides.length > 1 ? 'idle-slide-cycle' : 'idle-slide-static';

            if (slide.type === 'message') {
                element.innerHTML = `<div class="idle-slide idle-slide-message ${transitionClass}"><span class="idle-slide-message-text">${escapeIdleHtml(slide.message)}</span></div>`;
                adjustEmptyOverlayFontSize(element.querySelector('.idle-slide-message'), slide.message);
                return;
            }

            const itemsHtml = slide.rows.map(row => `
                <div class="idle-price-item">
                    <span class="idle-price-threshold">${escapeIdleHtml(row.threshold)}</span>
                    <span class="idle-price-duration">${escapeIdleHtml(row.duration)}</span>
                </div>
            `).join('');

            const playlistClass = slide.type === 'playlist-prices' ? ' idle-playlist-price-slide' : '';
            element.innerHTML = `
                <div class="idle-slide idle-price-slide${playlistClass} ${transitionClass}">
                    <div class="idle-price-title">${escapeIdleHtml(slide.title || 'Bảng giá')}</div>
                    <div class="idle-price-grid">${itemsHtml}</div>
                </div>
            `;
        }

        function stopIdleSlideshow(element) {
            if (element && idleSlideshowElement && element !== idleSlideshowElement) {
                element.classList.remove('idle-slideshow-active');
                element.style.removeProperty('font-size');
                element.style.removeProperty('--idle-slide-duration');
                return;
            }
            const activeElement = element || idleSlideshowElement;
            idleSlideshowActive = false;
            idleSlideshowStartedAt = 0;
            idleSlideshowSignature = '';
            idleLastRenderedSlide = '';
            idleSlideshowElement = null;
            if (activeElement) {
                activeElement.classList.remove('idle-slideshow-active');
                activeElement.style.removeProperty('font-size');
                activeElement.style.removeProperty('--idle-slide-duration');
            }
        }

        // Phân tích tham số URL
        const urlParams = new URLSearchParams(window.location.search);
        const isPreview = urlParams.get('preview') === 'true';

        let sensitiveVideosConfig = {};

        // --- HÀM TRUY VẤN QUA PROXY CORS CÓ FALLBACK TRÁNH LỖI TIMEOUT ---
        async function fetchWithCorsProxy(url) {
            try {
                const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
                if (response.ok) {
                    const text = await response.text();
                    return { contents: text };
                }
            } catch (e) {
                console.warn("Overlay CORSProxy.io failed, trying allorigins fallback...", e);
            }
            try {
                const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}&v=${Date.now()}`);
                if (response.ok) {
                    const data = await response.json();
                    return { contents: data.contents };
                }
            } catch (e) {
                console.error("Overlay AllOrigins failed too:", e);
            }
            throw new Error("Không thể kết nối qua tất cả các CORS Proxy.");
        }

        // Hàm tải cấu hình video nhạy cảm trực tuyến
        async function fetchSensitiveVideosConfig() {
            const url = localStorage.getItem('dua_sensitive_videos_url') || 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json';
            if (!url) {
                sensitiveVideosConfig = {};
                return;
            }
            try {
                // Thêm cache-buster để tránh bị cache bởi CDN (Fastly) của GitHub Gist và trình duyệt
                const cacheBusterUrl = url.trim() + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                let rawText = null;
                try {
                    const proxyRes = await fetchWithCorsProxy(cacheBusterUrl);
                    if (proxyRes && proxyRes.contents) {
                        rawText = proxyRes.contents;
                    }
                } catch (proxyErr) {
                    console.warn("Overlay: Tải qua proxy thất bại, thử tải trực tiếp:", proxyErr);
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
                            console.log("Overlay: Đã tải cấu hình video nhạy cảm trực tuyến thành công:", sensitiveVideosConfig);
                        }
                    } catch (jsonErr) {
                        console.error("Overlay: Lỗi định dạng JSON trong file Gist (thiếu dấu phẩy, ngoặc hoặc sai cú pháp):", jsonErr);
                    }
                }
            } catch (e) {
                console.error("Overlay: Lỗi kết nối khi tải cấu hình video nhạy cảm trực tuyến:", e);
            }
        }

        // Tải cấu hình lần đầu khi trang load
        if (!isPreview) {
            fetchSensitiveVideosConfig();
            // Tự động tải lại cấu hình video nhạy cảm mỗi 10 phút (600000ms)
            setInterval(fetchSensitiveVideosConfig, 10 * 60 * 1000);
        }

        // Hàm áp dụng theme
        function applyTheme(theme) {
            const availableThemes = ['pineapple', 'enchanted-wild', 'cutepink'];
            const normalizedTheme = availableThemes.includes(theme) ? theme : 'enchanted-wild';
            document.body.className = '';

            if (normalizedTheme === 'enchanted-wild') {
                document.body.classList.add('theme-enchanted-wild');
            } else if (normalizedTheme === 'cutepink') {
                document.body.classList.add('theme-cutepink');
            }

            if (!isPreview && localStorage.getItem('dua_theme') !== normalizedTheme) {
                localStorage.setItem('dua_theme', normalizedTheme);
            }

            if (typeof refreshAllActiveMarquees === 'function') {
                refreshAllActiveMarquees(true);
            }

            return normalizedTheme;
        }
        function applyOpacity(opacityVal) {
            const overlayContent = document.getElementById('overlay-content');
            if (overlayContent) {
                const opacity = (opacityVal === null || opacityVal === undefined || isNaN(opacityVal))
                    ? 1.0
                    : parseFloat(opacityVal) / 100;
                overlayContent.style.opacity = opacity;
            }
        }
        const initialTheme = urlParams.get('theme') || localStorage.getItem('dua_theme') || 'enchanted-wild';
        applyTheme(initialTheme);

        const initialOpacity = urlParams.get('opacity') || localStorage.getItem('dua_opacity') || '100';
        applyOpacity(initialOpacity);

        function updateAlertActionTextDisplay() {
            const val = urlParams.get('alert_action') || localStorage.getItem('dua_alert_action_text') || 'gửi một quả dứa';
            const actionSpans = document.querySelectorAll('.obs-alert-action-text');
            actionSpans.forEach(span => {
                span.textContent = val;
            });
        }
        updateAlertActionTextDisplay();

        // Logic đồng bộ hóa thời gian thực qua localStorage
        const widget = document.getElementById('obs-player-widget');
        const cover = document.getElementById('obs-song-cover');
        const coverWrapper = document.getElementById('obs-cover-wrapper');
        const title = document.getElementById('obs-song-title');
        const donorContainer = document.getElementById('obs-donor-container');
        const donorName = document.getElementById('obs-donor-name');
        const donorAmount = document.getElementById('obs-donor-amount');
        const songMessage = document.getElementById('obs-song-message');
        const currentTimeDisplay = document.getElementById('obs-current-time');
        const totalTimeDisplay = document.getElementById('obs-total-time');
        const progressFill = document.getElementById('obs-progress-fill');
        const progressThumb = document.getElementById('obs-progress-thumb');
        const overlayLyrics = document.getElementById('obs-lyrics');
        const overlayLyricsLines = document.getElementById('obs-lyrics-lines');
        const overlayLyricsTimeline = window.LyricsTimelineService
            ? new window.LyricsTimelineService()
            : null;
        let overlayLyricsRenderKey = '';
        let overlayLyricsSongKey = '';
        let overlayLyricsActiveIndex = -2;
        let overlayLyricsTrack = null;

        function positionOverlayLyrics(activeIndex, immediate = false) {
            if (!overlayLyricsLines || !overlayLyricsTrack) return;
            const lines = overlayLyricsTrack.children;
            if (!lines.length) return;
            const anchorIndex = Math.max(0, activeIndex);
            const activeLine = lines[Math.min(anchorIndex, lines.length - 1)];
            if (!activeLine) return;
            const viewportHeight = overlayLyricsLines.clientHeight || 94;
            const preferredCenter = viewportHeight * 0.5;
            const firstLine = lines[0];
            const lastLine = lines[lines.length - 1];
            const topPadding = Math.max(0, preferredCenter - (firstLine.offsetHeight / 2));
            const bottomPadding = Math.max(0, viewportHeight - preferredCenter - (lastLine.offsetHeight / 2));
            overlayLyricsTrack.style.paddingTop = `${topPadding}px`;
            overlayLyricsTrack.style.paddingBottom = `${bottomPadding}px`;
            const contentHeight = overlayLyricsTrack.scrollHeight;
            const desiredOffset = activeLine.offsetTop + activeLine.offsetHeight / 2 - preferredCenter;
            const maximumOffset = Math.max(0, contentHeight - viewportHeight);
            const offset = Math.max(0, Math.min(maximumOffset, desiredOffset));
            overlayLyricsTrack.classList.toggle('no-transition', immediate);
            overlayLyricsTrack.style.transform = `translate3d(0, ${-offset}px, 0)`;
            if (immediate) {
                requestAnimationFrame(() => overlayLyricsTrack?.classList.remove('no-transition'));
            }
        }

        function updateOverlayLyrics(song, currentTime = 0) {
            updateLyricsOverlayDetails(song);
            const lyrics = song?.lyrics;
            const lyricsEnabled = localStorage.getItem('dua_lyrics_enabled') !== 'false';
            const showOverlayLyrics = lyricsEnabled && localStorage.getItem('dua_show_overlay_lyrics') !== 'false';
            const hasSyncedLyrics = Boolean(showOverlayLyrics && lyrics?.available && lyrics?.synced !== false
                && Array.isArray(lyrics.lines) && lyrics.lines.length);
            const panelVisible = Boolean(overlayLyrics && overlayLyricsLines && overlayLyricsTimeline
                && hasSyncedLyrics);
            const visibilityChanged = widget.classList.contains('lyrics-visible') !== hasSyncedLyrics;
            widget.classList.toggle('lyrics-visible', hasSyncedLyrics);
            widget.classList.remove('lyrics-instrumental');
            syncSpecialLyricsLayout();
            if (overlayLyrics) overlayLyrics.hidden = !panelVisible;
            if (!panelVisible) {
                if (overlayLyricsLines) {
                    overlayLyricsLines.replaceChildren();
                }
                overlayLyricsRenderKey = '';
                overlayLyricsSongKey = '';
                overlayLyricsActiveIndex = -2;
                overlayLyricsTrack = null;
            } else {
                const normalizedLines = overlayLyricsTimeline.normalizeLines(lyrics.lines);
                const activeIndex = overlayLyricsTimeline.findActiveIndex(normalizedLines, currentTime);
                const firstLine = normalizedLines[0];
                const lastLine = normalizedLines[normalizedLines.length - 1];
                const songKey = `${song.id || ''}:${normalizedLines.length}:${firstLine?.time || 0}:${lastLine?.time || 0}`;
                if (songKey !== overlayLyricsSongKey) {
                    overlayLyricsSongKey = songKey;
                    overlayLyricsRenderKey = songKey;
                    overlayLyricsActiveIndex = -2;
                    overlayLyricsTrack = document.createElement('div');
                    overlayLyricsTrack.className = 'obs-lyrics-track no-transition';
                    overlayLyricsTrack.replaceChildren(...normalizedLines.map((line, index) => {
                        const element = document.createElement('div');
                        const textLength = Array.from(line.text).length;
                        const lengthClass = textLength > 72
                            ? ' is-very-long'
                            : textLength > 44
                                ? ' is-long'
                                : '';
                        element.className = `obs-lyric-line${lengthClass}`;
                        element.dataset.lyricIndex = String(index);
                        element.setAttribute('aria-hidden', 'true');

                        if (line.isWaitingDots) {
                            const dots = document.createElement('div');
                            dots.className = 'obs-instrumental-dots is-countdown';
                            for (let i = 0; i < 3; i++) {
                                const dot = document.createElement('span');
                                dot.className = 'obs-instrumental-dot';
                                dots.appendChild(dot);
                            }
                            element.appendChild(dots);
                        } else if (line.originalText) {
                            const textSpan = document.createElement('span');
                            textSpan.className = 'obs-lyric-text';
                            textSpan.textContent = line.text;

                            const originalSpan = document.createElement('span');
                            originalSpan.className = 'obs-lyric-original-text';
                            originalSpan.textContent = line.originalText;

                            element.appendChild(textSpan);
                            element.appendChild(originalSpan);
                        } else {
                            element.textContent = line.text;
                        }

                        return element;
                    }));
                    overlayLyricsLines.replaceChildren(overlayLyricsTrack);
                }

                if (activeIndex >= 0 && normalizedLines[activeIndex]?.isWaitingDots && overlayLyricsTrack) {
                    const activeLine = overlayLyricsTrack.children[activeIndex];
                    if (activeLine) {
                        const dots = activeLine.querySelectorAll('.obs-instrumental-dot');
                        const startTime = normalizedLines[activeIndex].time;
                        const endTime = normalizedLines[activeIndex + 1]?.time ?? (startTime + 3);
                        dots.forEach((dot, index) => {
                            if (currentTime >= endTime - 3 + index) dot.classList.add('is-lit');
                            else dot.classList.remove('is-lit');
                        });
                    }
                }

                if (activeIndex !== overlayLyricsActiveIndex && overlayLyricsTrack) {
                    const previousLine = overlayLyricsTrack.querySelector('.obs-lyric-line.is-active');
                    if (previousLine) previousLine.classList.remove('is-active');
                    const nextLine = overlayLyricsTrack.children[Math.max(0, activeIndex)];
                    if (activeIndex >= 0 && nextLine) nextLine.classList.add('is-active');
                    const anchorIndex = Math.max(0, activeIndex);
                    const maximumStart = Math.max(0, overlayLyricsTrack.children.length - 3);
                    const windowStart = Math.min(maximumStart, Math.max(0, anchorIndex - 1));
                    overlayLyricsTrack.querySelectorAll('.obs-lyric-line.is-window-visible').forEach(line => {
                        line.classList.remove('is-window-visible');
                        line.setAttribute('aria-hidden', 'true');
                    });
                    for (let index = windowStart; index < Math.min(windowStart + 3, overlayLyricsTrack.children.length); index += 1) {
                        const visibleLine = overlayLyricsTrack.children[index];
                        visibleLine.classList.add('is-window-visible');
                        visibleLine.removeAttribute('aria-hidden');
                    }
                    const immediate = overlayLyricsActiveIndex === -2;
                    overlayLyricsActiveIndex = activeIndex;
                    requestAnimationFrame(() => positionOverlayLyrics(activeIndex, immediate));
                }
            }
            const expectedHeight = getOverlayRestingHeight();
            // Do not restart a valid height transition from the 200ms UI poll.
            // The measured height is expected to differ while the card is moving.
            const heightMismatch = !overlayHeightTransitionActive
                && Math.abs((widget.getBoundingClientRect().height || 0) - expectedHeight) > 1;
            if ((visibilityChanged || heightMismatch) && (!widget.dataset.upNextPhase || widget.dataset.upNextPhase === 'idle')) {
                transitionOverlayWidgetHeight(getOverlayRestingHeight());
            }
        }

        let overlayPlayer = null;
        let isPlayerReady = false;
        let currentVideoId = null;
        let lastSongId = null;
        let endedSignalSongId = null;
        let activePlaybackSongId = null;
        let activePlaybackHasStarted = false;
        let currentDirectSongId = null;
        let directFallbackAttemptedSongId = null;
        let isMorphingTransitionActive = false;
        let morphTimeoutId = null;
        let lastSongLoadStartTimestamp = 0;
        let stuckStateStartTime = null;
        let lastWarnedSongId = null;
        let warningCountdownInterval = null;
        let isLuckyRolling = false;
        let luckyRollCompleted = false;
        let luckyRollCurrentSongId = null;
        let warningSongId = null;
        let alertTimeout = null;
        let lastRenderedEmptyQueueMessage = null;
        let playbackMonitorInterval = null;
        let livePlayTime = 0;
        let lastLiveTickTimestamp = null;
        let isLiveStream = false; // Detect live stream chính xác qua getVideoData().isLive
        let lastCommandTimestamp = 0;
        let lastCommandType = 'play';
        let destroyTimeout = null;
        let lastProgressPct = null;
        const REALTIME_PROGRESS_INTERVAL_MS = 250;
        const LYRICS_TIMING_INTERVAL_MS = 20;
        const REALTIME_RECONNECT_DELAY_MS = 500;
        const OVERLAY_COLLAPSED_HEIGHT = 160;
        const OVERLAY_UP_NEXT_HEIGHT = 280;
        const OVERLAY_HEIGHT_DURATION = 560;
        let overlayHeightTransitionToken = 0;
        let overlayHeightCleanupTimeout = null;
        let overlayPhaseFadeTimeout = null;
        let overlayHeightTarget = OVERLAY_COLLAPSED_HEIGHT;
        let overlayHeightTransitionActive = false;

        function transitionOverlayWidgetHeight(targetHeight, applyState) {
            if (!widget) {
                if (typeof applyState === 'function') applyState();
                return;
            }

            const fromHeight = Math.max(1, widget.getBoundingClientRect().height || OVERLAY_COLLAPSED_HEIGHT);
            const safeTargetHeight = Math.max(1, Number(targetHeight) || OVERLAY_COLLAPSED_HEIGHT);

            // Cùng một mục tiêu có thể đến từ timer và sự kiện đổi bài gần như đồng thời.
            // Chỉ áp dụng class mới, không khởi động lại animation đang chạy.
            if (overlayHeightTransitionActive && Math.abs(overlayHeightTarget - safeTargetHeight) < 0.5) {
                if (typeof applyState === 'function') applyState();
                return;
            }

            if (!overlayHeightTransitionActive && Math.abs(fromHeight - safeTargetHeight) < 0.5) {
                overlayHeightTarget = safeTargetHeight;
                if (typeof applyState === 'function') applyState();
                return;
            }

            const token = ++overlayHeightTransitionToken;
            overlayHeightTarget = safeTargetHeight;
            overlayHeightTransitionActive = true;

            if (overlayHeightCleanupTimeout) {
                clearTimeout(overlayHeightCleanupTimeout);
                overlayHeightCleanupTimeout = null;
            }

            widget.style.setProperty('transition', 'none', 'important');
            widget.style.setProperty('height', `${fromHeight}px`, 'important');
            widget.style.setProperty('min-height', `${fromHeight}px`, 'important');
            widget.style.setProperty('max-height', `${fromHeight}px`, 'important');
            void widget.offsetHeight;

            if (typeof applyState === 'function') applyState();
            void widget.offsetHeight;

            requestAnimationFrame(() => {
                if (token !== overlayHeightTransitionToken) return;
                const transitionValue = `height ${OVERLAY_HEIGHT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1), min-height ${OVERLAY_HEIGHT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1), max-height ${OVERLAY_HEIGHT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`;
                widget.style.setProperty('transition', transitionValue, 'important');
                void widget.offsetHeight;

                requestAnimationFrame(() => {
                    if (token !== overlayHeightTransitionToken) return;
                    widget.style.setProperty('height', `${safeTargetHeight}px`, 'important');
                    widget.style.setProperty('min-height', `${safeTargetHeight}px`, 'important');
                    widget.style.setProperty('max-height', `${safeTargetHeight}px`, 'important');

                    overlayHeightCleanupTimeout = setTimeout(() => {
                        if (token !== overlayHeightTransitionToken) return;
                        widget.style.removeProperty('transition');
                        widget.style.removeProperty('height');
                        widget.style.removeProperty('min-height');
                        widget.style.removeProperty('max-height');
                        overlayHeightTransitionActive = false;
                        overlayHeightCleanupTimeout = null;
                    }, OVERLAY_HEIGHT_DURATION + 80);
                });
            });
        }

        function getOverlayRestingHeight() {
            if (!widget) return OVERLAY_COLLAPSED_HEIGHT;
            if (widget.classList.contains('alert-active')) return OVERLAY_UP_NEXT_HEIGHT;
            if (widget.classList.contains('obs-ext-active')) return 210;
            if (widget.classList.contains('lucky-active')) return 220;
            if (widget.classList.contains('lyrics-visible')) {
                return OVERLAY_UP_NEXT_HEIGHT;
            }
            // Set 18 uses the same compact 160px player for regular and playlist
            // tracks. Returning the legacy 198px value here made JS animate to
            // 198px, then CSS snap back to 160px after cleanup, forever.
            if (widget.classList.contains('is-playlist-playing')) return OVERLAY_COLLAPSED_HEIGHT;
            return OVERLAY_COLLAPSED_HEIGHT;
        }

        function syncSpecialLyricsLayout() {
            if (!widget) return false;
            const supportsSpecialLayout = document.body.classList.contains('theme-enchanted-wild');
            const hasVisibleLyrics = widget.classList.contains('lyrics-visible');
            const hasSpecialState = widget.classList.contains('alert-active')
                || widget.classList.contains('show-queue')
                || widget.classList.contains('next-fullscreen-active')
                || widget.classList.contains('phase-crossfade');
            const enabled = supportsSpecialLayout && hasVisibleLyrics && hasSpecialState;
            widget.classList.toggle('has-special-lyrics-layout', enabled);
            if (supportsSpecialLayout && hasVisibleLyrics) {
                // A measured offset creates a feedback loop after the special
                // overlay becomes visible, repeatedly shrinking the lyric area.
                widget.style.setProperty('--obs-player-region-height', '104px');
            } else {
                widget.style.removeProperty('--obs-player-region-height');
            }
            return enabled;
        }

        function getUpNextTargetHeight() {
            return OVERLAY_UP_NEXT_HEIGHT;
        }

        function clearUpNextPhase(targetHeight = null) {
            if (!widget) return;
            if (overlayPhaseFadeTimeout) {
                clearTimeout(overlayPhaseFadeTimeout);
                overlayPhaseFadeTimeout = null;
            }
            widget.dataset.upNextPhase = 'idle';
            const resolvedTargetHeight = targetHeight === null
                ? (widget.classList.contains('lyrics-visible') ? OVERLAY_UP_NEXT_HEIGHT : OVERLAY_COLLAPSED_HEIGHT)
                : targetHeight;
            transitionOverlayWidgetHeight(resolvedTargetHeight, () => {
                widget.classList.remove('show-queue', 'next-fullscreen-active', 'phase-crossfade');
                widget.style.removeProperty('--obs-overlay-expanded-height');
                syncSpecialLyricsLayout();
                if (typeof refreshAllActiveMarquees === 'function') {
                    refreshAllActiveMarquees(true);
                    setTimeout(() => refreshAllActiveMarquees(true), 350);
                }
            });
        }

        function getYouTubeIdFromUrl(url) {
            if (!url) return null;
            // 1. Matches thumbnail URLs: /vi/dQw4w9WgXcQ/ or /vi_webp/dQw4w9WgXcQ/
            const thumbMatch = url.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})(?:\/|\.|$)/i);
            if (thumbMatch) return thumbMatch[1];

            // 2. Matches watch/embed/short URLs:
            try {
                const urlObj = new URL(url);
                if (urlObj.hostname.includes('youtu.be')) {
                    return urlObj.pathname.substring(1).split('/')[0];
                }
                if (urlObj.pathname.startsWith('/embed/')) {
                    return urlObj.pathname.split('/')[2];
                }
                const vParam = urlObj.searchParams.get('v');
                if (vParam && vParam.length === 11) {
                    return vParam;
                }
            } catch (e) { }
            return null;
        }

        function normalizeCoverUrl(url) {
            if (!url) return "";
            let cleanUrl = url.trim();
            // Strip url("...") or url('...') wrappers
            const urlWrapperMatch = cleanUrl.match(/^url\(['"]?(.*?)['"]?\)$/i);
            if (urlWrapperMatch) {
                cleanUrl = urlWrapperMatch[1];
            }
            try {
                const absUrl = new URL(cleanUrl, window.location.href);
                const ytId = getYouTubeIdFromUrl(absUrl.href);
                if (ytId) {
                    return `youtube:${ytId}`;
                }
                let clean = absUrl.host + absUrl.pathname;
                if (clean.endsWith('/')) {
                    clean = clean.slice(0, -1);
                }
                return clean.toLowerCase();
            } catch (e) {
                let clean = cleanUrl.replace(/^(https?:\/\/)?(www\.)?/, "");
                const qIdx = clean.indexOf('?');
                if (qIdx !== -1) {
                    clean = clean.substring(0, qIdx);
                }
                const hIdx = clean.indexOf('#');
                if (hIdx !== -1) {
                    clean = clean.substring(0, hIdx);
                }
                if (clean.endsWith('/')) {
                    clean = clean.slice(0, -1);
                }
                return clean.toLowerCase();
            }
        }

        function isSameThumbnail(url1, url2) {
            if (!url1 || !url2) return false;
            return normalizeCoverUrl(url1) === normalizeCoverUrl(url2);
        }

        function setCoverSrcSafely(targetThumbnail) {
            if (!cover) return;
            const fallbackUrl = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
            const target = targetThumbnail || fallbackUrl;
            if (!isSameThumbnail(cover.src, target)) {
                cover.src = target;
            }
        }

        function getNextSongThumbnailUrl(currentSong) {
            if (!currentSong) return null;

            let queue = [];
            try {
                const rawQueue = localStorage.getItem('dua_queue');
                if (rawQueue) {
                    queue = JSON.parse(rawQueue);
                }
            } catch (e) { }

            let idx = -1;
            if (currentSong.id) {
                idx = queue.findIndex(s => String(s.id) === String(currentSong.id));
            }

            const isLuckyMode = (currentSong.luckyMode === true || localStorage.getItem('dua_lucky_mode') === 'true');
            let nextSong = null;
            if (isLuckyMode && currentSong.nextSongId) {
                nextSong = queue.find(s => String(s.id) === String(currentSong.nextSongId));
            }
            if (!nextSong) {
                nextSong = idx !== -1 ? queue[idx + 1] : queue[0];
            }

            if (!nextSong && currentSong.nextSongTitle) {
                nextSong = {
                    thumbnail: currentSong.nextSongThumbnail,
                    type: currentSong.nextSongType,
                    videoId: currentSong.nextSongVideoId
                };
            }

            if (!nextSong) return null;

            return nextSong.thumbnail || ((!nextSong.type || nextSong.type === 'youtube')
                ? `https://img.youtube.com/vi/${nextSong.videoId}/hqdefault.jpg`
                : null);
        }

        let mqttClient = null;
        let mqttTopic = null;
        let isSponsorBlockNotificationActive = false;
        let sbToastTimeout = null;
        let isExtensionNotificationActive = false;
        let extensionToastTimeout = null;
        let localIsResuming = false;
        let resumeTargetTime = 0;
        let resumeTimeoutId = null;
        let hasSeekedForResume = false;
        let lastResumeSeekAttemptAt = 0;

        // Biến lưu mức âm lượng mục tiêu — đây là nguồn sự thật duy nhất cho âm lượng
        let targetVolume = localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : 80;
        // Interval liên tục ép âm lượng trong giai đoạn chuyển bài (chống YouTube reset async)
        let volumeEnforcerInterval = null;
        let volumeEnforcerStartTime = 0;

        function syncTargetVolume(value) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return false;
            targetVolume = Math.max(0, Math.min(100, Math.round(parsed)));
            localStorage.setItem('dua_volume', String(targetVolume));
            applyTargetVolume();
            return true;
        }

        // Biến lưu loudnessDb từ server cho Adaptive Volume
        let currentLoudnessDb = null;
        let currentLoudnessVideoId = null;

        let skipSegments = [];
        let skipSegmentsSongId = null;
        const sponsorBlockPlaybackPolicy = new SponsorBlockService({ tailToleranceSeconds: 1.5 });
        const youtubePlaybackFallbackPolicy = new YouTubePlaybackFallbackPolicy({
            blockedStateGraceMs: 8000,
            generalGraceMs: 12000
        });
        const defaultSponsorBlockCategories = {
            sponsor: true,
            intro: true,
            outro: true,
            selfpromo: true,
            interaction: false,
            offtopic: true
        };
        let sponsorBlockCategories = { ...defaultSponsorBlockCategories };
        let lastSBSeekTimestamp = 0;
        let lastSBSeekTarget = 0;
        let lastSkippedSegmentKey = null;

        let currentPlayback = {
            currentTime: 0,
            duration: 0,
            isPlaying: false
        };
        let iframeLastObservedTime = 0;
        let iframeLastProgressAt = 0;
        let iframePlaybackStalled = false;
        let currentRemainingTime = 999999;
        let spotifyEmbedController = null;
        let currentSpotifyId = null;
        let isSpotifySdkLoaded = false;
        let pendingSpotifyTrackId = null;
        let soundCloudWidget = null;
        let currentSoundCloudUrl = null;
        let isSoundCloudSdkLoaded = false;
        let isSoundCloudSdkLoading = false;
        let soundCloudSdkCallbacks = [];
        let soundCloudDuration = 0;
        let soundCloudLoadRequestId = 0;
        let soundCloudLoadTimeoutId = null;

        // yt-dlp direct stream bypass variables
        let directAudioPlayer = null;
        let directHlsPlayer = null;
        let isDirectAudioPlaying = false;
        let currentDirectVideoId = null;
        let directAudioDuration = 0;
        let directAudioStartTime = 0;

        // Biến quản lý phase ngăn kéo "Tiếp theo"
        let currentDrawerText = "";

        const activeMarqueeElements = new Set();

        function getRenderedTextWidth(text, textEl) {
            if (!text) return 0;
            if (!window._marqueeMeasureEl) {
                const measure = document.createElement('span');
                measure.style.position = 'absolute';
                measure.style.visibility = 'hidden';
                measure.style.whiteSpace = 'nowrap';
                measure.style.top = '-9999px';
                measure.style.left = '-9999px';
                measure.style.pointerEvents = 'none';
                measure.style.height = 'auto';
                measure.style.width = 'auto';
                document.body.appendChild(measure);
                window._marqueeMeasureEl = measure;
            }
            const measure = window._marqueeMeasureEl;
            const computed = window.getComputedStyle(textEl);
            measure.style.fontFamily = computed.fontFamily;
            measure.style.fontSize = computed.fontSize;
            measure.style.fontWeight = computed.fontWeight;
            measure.style.letterSpacing = computed.letterSpacing;
            measure.style.textTransform = computed.textTransform;
            measure.textContent = text;
            return measure.getBoundingClientRect().width;
        }

        function refreshMarqueeElement(textEl, force = false) {
            if (!textEl || !textEl._marqueeContainer || !textEl._marqueeContainer.isConnected) return;
            const containerEl = textEl._marqueeContainer;
            const text = textEl._marqueeText || '';
            const speed = textEl._marqueeSpeed || 40;

            if (!text) {
                textEl.textContent = '';
                textEl.classList.remove('marquee');
                textEl.style.animation = 'none';
                textEl._appliedMarqueeText = '';
                textEl._appliedDuration = null;
                return;
            }

            // Kiểm tra xem container có đang bị ẩn hay có chiều rộng hợp lệ không
            const containerWidth = containerEl.clientWidth || containerEl.offsetWidth || 0;
            const widget = document.getElementById('obs-player-widget');
            const isWidgetHidden = widget && (
                widget.classList.contains('alert-active') ||
                widget.classList.contains('show-queue') ||
                widget.classList.contains('next-fullscreen-active') ||
                widget.classList.contains('phase-crossfade')
            ) && !textEl.closest('.obs-alert-box') && !textEl.closest('.obs-next-song-drawer') && !textEl.closest('#obs-next-song-fullscreen');

            if (containerWidth <= 0 || isWidgetHidden) {
                textEl._marqueePending = true;
                return;
            }

            textEl._marqueePending = false;
            const textWidth = getRenderedTextWidth(text, textEl);

            if (textWidth > containerWidth + 2) {
                let rootFontSize = 16;
                try {
                    rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
                } catch (e) {}
                const gap = 2.5 * rootFontSize;
                const distance = textWidth + gap;
                const duration = distance / speed;
                const durationStr = `${duration.toFixed(3)}s`;

                const isCurrentlyMarquee = textEl.classList.contains('marquee');
                const isSameText = textEl._appliedMarqueeText === text;
                const isSameDuration = textEl._appliedDuration === durationStr;

                if (!isCurrentlyMarquee || !isSameText || !isSameDuration || force) {
                    textEl.innerHTML = `<span style="display: inline-block; padding-right: 2.5rem; white-space: nowrap;">${text}</span><span style="display: inline-block; padding-right: 2.5rem; white-space: nowrap;">${text}</span>`;
                    textEl.classList.add('marquee');
                    textEl.style.display = 'inline-block';
                    textEl.style.whiteSpace = 'nowrap';
                    textEl.style.overflow = 'visible';
                    textEl.style.animation = 'none';
                    void textEl.offsetWidth; // Ép reflow để animation kích hoạt mượt mà
                    textEl.style.animation = `obs-marquee ${durationStr} linear infinite`;
                    textEl._appliedMarqueeText = text;
                    textEl._appliedDuration = durationStr;
                    textEl._appliedContainerWidth = containerWidth;
                }
            } else {
                if (textEl.classList.contains('marquee') || textEl._appliedMarqueeText !== text || force) {
                    textEl.textContent = text;
                    textEl.classList.remove('marquee');
                    textEl.style.display = 'inline-block';
                    textEl.style.whiteSpace = 'nowrap';
                    textEl.style.overflow = 'hidden';
                    textEl.style.animation = 'none';
                    textEl._appliedMarqueeText = text;
                    textEl._appliedDuration = null;
                    textEl._appliedContainerWidth = containerWidth;
                }
            }
        }

        function refreshAllActiveMarquees(force = false) {
            for (const textEl of activeMarqueeElements) {
                if (!textEl.isConnected) {
                    activeMarqueeElements.delete(textEl);
                    continue;
                }
                refreshMarqueeElement(textEl, force);
            }
        }

        function applyMarquee(containerEl, textEl, text, baseSpeed = 40) {
            if (!containerEl || !textEl) return;

            if (textEl._marqueeTimeout) {
                clearTimeout(textEl._marqueeTimeout);
                textEl._marqueeTimeout = null;
            }

            textEl._marqueeContainer = containerEl;
            textEl._marqueeText = text;
            textEl._marqueeSpeed = baseSpeed;
            activeMarqueeElements.add(textEl);

            refreshMarqueeElement(textEl, true);

            textEl._marqueeTimeout = setTimeout(() => {
                textEl._marqueeTimeout = null;
                refreshMarqueeElement(textEl);
            }, 60);
        }

        function calculateNextSongLimitDuration(nextSong) {
            if (!nextSong) return 0;

            let startPoint = nextSong.start || 0;
            let originalDuration = 0;
            if (nextSong.end && nextSong.end > startPoint) {
                originalDuration = nextSong.end - startPoint;
            }

            if (originalDuration <= 0 && nextSong.duration) {
                originalDuration = nextSong.duration;
            }

            const isPlaylistTrack = Boolean(
                nextSong.timeLimitExempt
                || nextSong.isPlaylistTrack
                || (nextSong.playlistRequestId && nextSong.playlistTrackId)
            );
            const maxDurationEnabled = !isPlaylistTrack
                && localStorage.getItem('dua_max_duration_enabled') === 'true';

            let maxDur = 0;
            if (maxDurationEnabled) {
                const limitMode = localStorage.getItem('dua_limit_mode') || 'fixed';
                if (limitMode === 'fixed') {
                    const fixedMaxVal = parseInt(localStorage.getItem('dua_max_duration_val')) || 180;
                    maxDur = fixedMaxVal;
                } else {
                    const songAmount = Number(nextSong.amount) || 0;
                    let milestones = [];
                    try {
                        const rawMilestones = localStorage.getItem('dua_milestones');
                        if (rawMilestones) {
                            milestones = JSON.parse(rawMilestones);
                        }
                    } catch (e) { }

                    if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
                        milestones = [
                            { amount: 100000, duration: 5 },
                            { amount: 200000, duration: 15 }
                        ];
                    }

                    const sortedMilestones = [...milestones].sort((a, b) => a.amount - b.amount);
                    let matched = false;
                    for (const milestone of sortedMilestones) {
                        if (songAmount < milestone.amount) {
                            maxDur = milestone.duration * 60;
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        const defaultDuration = parseInt(localStorage.getItem('dua_default_duration')) || 30;
                        maxDur = defaultDuration * 60;
                    }
                }
            }

            let finalDuration = 0;
            if (originalDuration > 0) {
                if (maxDur > 0) {
                    finalDuration = Math.min(originalDuration, maxDur);
                } else {
                    finalDuration = originalDuration;
                }
            } else {
                if (maxDur > 0) {
                    finalDuration = maxDur;
                }
            }

            return finalDuration;
        }

        function getUpcomingPlaylistLabel(song) {
            if (!song?.playlistRequestId) return '';
            const position = Math.max(1, Number(song.playlistPosition || 1));
            const total = Math.max(position, Number(song.playlistTotalTracks || position));
            const plTitle = song.playlistTitle || 'YouTube Playlist';
            return `${position}/${total} ${plTitle}`;
        }

        function getUpcomingDonorLabel(song) {
            const donor = song?.donorName || 'Khách';
            return song?.playlistRequestId ? (song?.playlistTitle || 'YouTube Playlist') : donor;
        }

        function getSongPlaybackStart(song) {
            const resumeFrom = Number(song?.resumeFrom);
            if (song?.isResuming && Number.isFinite(resumeFrom) && resumeFrom >= 0) return resumeFrom;
            return Math.max(0, Number(song?.start) || 0);
        }

        function updateNextSongSequence(remainingTime, song) {
            const drawer = document.getElementById('obs-next-song-drawer');
            const modal = document.getElementById('obs-next-songs-modal');
            const fullscreenCard = document.getElementById('obs-next-song-fullscreen');

            if (!drawer || !modal || !fullscreenCard) return;

            const alertBox = document.getElementById('obs-alert-box');
            const hasAlert = alertBox && alertBox.classList.contains('active');
            const hasNoNext = !song || !song.nextSongTitle;

            if (hasAlert || isSponsorBlockNotificationActive || isExtensionNotificationActive || hasNoNext || remainingTime < 0) {
                // Bridge the gap between countdown ending and the new song starting.
                // Keep fullscreenCard visible (don't flash black/white) while waiting for the new song
                // to arrive via WebSocket and trigger the transition.
                if (!hasNoNext && remainingTime < 0 && remainingTime >= -10 && !hasAlert && !isSponsorBlockNotificationActive && !isExtensionNotificationActive && fullscreenCard.classList.contains('active')) {
                    // Keep the card visible; the new song's start event will hide it
                    return;
                }

                if (!isSponsorBlockNotificationActive && !isExtensionNotificationActive) {
                    drawer.classList.remove('show');
                }
                modal.classList.remove('show');
                fullscreenCard.classList.remove('active');
                if (widget) {
                    if (widget.dataset.upNextPhase !== 'idle'
                        || widget.classList.contains('show-queue')
                        || widget.classList.contains('next-fullscreen-active')
                        || widget.classList.contains('phase-crossfade')) {
                        clearUpNextPhase();
                    }
                }
                drawer.style.removeProperty('--next-cover-url');
                fullscreenCard.style.removeProperty('--next-cover-url');
                // Luôn ẩn danh sách đóng góp trong khi phát bình thường

                return;
            }

            const isLuckyMode = (song.luckyMode === true || localStorage.getItem('dua_lucky_mode') === 'true');

            // Phase 1: 30s left to 15s left -> Show 3 next songs (Skip this phase entirely if lucky mode is active)
            if (!isLuckyMode && remainingTime <= 30 && remainingTime > 15) {
                fullscreenCard.classList.remove('active');

                let queue = [];
                try {
                    const rawQueue = localStorage.getItem('dua_queue');
                    if (rawQueue) {
                        queue = JSON.parse(rawQueue);
                    }
                } catch (e) {
                    console.error("Lỗi đọc dua_queue từ localStorage:", e);
                }

                let idx = -1;
                if (song && song.id) {
                    idx = queue.findIndex(s => String(s.id) === String(song.id));
                }
                // Synced lyrics reserve the lower region, so show two entries.
                // The classic no-lyrics preview keeps its original four.
                const queuePreviewLimit = widget?.classList.contains('lyrics-visible') ? 2 : 4;
                const nextSongs = idx !== -1
                    ? queue.slice(idx + 1, idx + 1 + queuePreviewLimit)
                    : queue.slice(0, queuePreviewLimit);
                if (nextSongs.length === 0 && song.nextSongTitle) {
                    nextSongs.push({
                        id: song.nextSongId,
                        title: song.nextSongTitle,
                        donorName: song.nextSongDonor,
                        amount: song.nextSongAmount,
                        isOwnerAdd: song.nextSongIsOwnerAdd,
                        playlistRequestId: song.nextSongPlaylistRequestId,
                        playlistPosition: song.nextSongPlaylistPosition,
                        playlistTotalTracks: song.nextSongPlaylistTotalTracks,
                        playlistTitle: song.nextSongPlaylistTitle
                    });
                }

                if (widget && widget.dataset.upNextPhase !== 'queue') {
                    if (overlayPhaseFadeTimeout) {
                        clearTimeout(overlayPhaseFadeTimeout);
                        overlayPhaseFadeTimeout = null;
                    }
                    widget.dataset.upNextPhase = 'queue';
                    const targetHeight = getUpNextTargetHeight();
                    widget.style.setProperty('--obs-overlay-expanded-height', `${targetHeight}px`);
                    transitionOverlayWidgetHeight(targetHeight, () => {
                        widget.classList.add('show-queue');
                        widget.classList.remove('next-fullscreen-active', 'phase-crossfade');
                        syncSpecialLyricsLayout();
                    });
                }
                if (!isSponsorBlockNotificationActive && !isExtensionNotificationActive) {
                    drawer.classList.remove('show');
                }

                const listEl = document.getElementById('obs-next-songs-list');
                if (listEl) {
                    listEl.innerHTML = '';
                    listEl.dataset.count = String(nextSongs.length);
                    if (nextSongs.length > 0) {
                        nextSongs.forEach((ns, index) => {
                            const itemEl = document.createElement('div');
                            itemEl.className = 'modal-song-item';

                            const indexEl = document.createElement('div');
                            indexEl.className = 'modal-song-index';
                            indexEl.innerHTML = index === 0 ? 'TIẾP<br>THEO' : `#${index + 1}`;

                            const detailsEl = document.createElement('div');
                            detailsEl.className = 'modal-song-details';

                            const titleEl = document.createElement('div');
                            titleEl.className = 'modal-song-title';
                            titleEl.textContent = ns.title || 'Không rõ tên bài hát';
                            if (ns.isPinned) {
                                const pinIcon = document.createElement('i');
                                pinIcon.className = 'fa-solid fa-thumbtack';
                                pinIcon.style.color = 'var(--pineapple-orange-dark)';
                                pinIcon.style.marginRight = '0.35rem';
                                pinIcon.style.transform = 'rotate(45deg)';
                                pinIcon.style.display = 'inline-block';
                                pinIcon.style.verticalAlign = 'middle';
                                titleEl.prepend(pinIcon);
                            }

                            const metaEl = document.createElement('div');
                            metaEl.className = 'modal-song-meta';

                            if (ns.isOwnerAdd) {
                                const storedMsg = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                                metaEl.textContent = storedMsg;
                            } else {
                                const donor = ns.donorName || 'Khách';
                                const amount = (ns.amount && Number(ns.amount) > 0)
                                    ? ` · ${Number(ns.amount).toLocaleString('vi-VN')} ₫`
                                    : '';
                                metaEl.innerHTML = `<span class="modal-song-donor">${donor}</span>${amount}`;
                            }

                            detailsEl.appendChild(titleEl);
                            detailsEl.appendChild(metaEl);

                            itemEl.appendChild(indexEl);
                            itemEl.appendChild(detailsEl);
                            listEl.appendChild(itemEl);
                        });
                    } else {
                        const emptyEl = document.createElement('div');
                        emptyEl.className = 'modal-song-item';
                        emptyEl.style.justifyContent = 'center';
                        emptyEl.style.fontStyle = 'italic';
                        emptyEl.style.color = 'var(--theme-sub-text-color)';
                        emptyEl.textContent = 'Hết bài hát tiếp theo';
                        listEl.appendChild(emptyEl);
                    }
                }
                modal.classList.add('show');

            }
            // Phase 2: Show Fullscreen card (starts at 30s for Lucky mode, 15s for Normal mode)
            else if (remainingTime <= (isLuckyMode ? 30 : 15) && remainingTime >= 0) {
                if (!isSponsorBlockNotificationActive && !isExtensionNotificationActive) {
                    drawer.classList.remove('show');
                }

                const shouldCrossFadeFromQueue = Boolean(widget
                    && widget.dataset.upNextPhase === 'queue'
                    && widget.classList.contains('show-queue'));

                if (widget && widget.dataset.upNextPhase !== 'countdown') {
                    widget.dataset.upNextPhase = 'countdown';
                    const targetHeight = getUpNextTargetHeight();
                    widget.style.setProperty('--obs-overlay-expanded-height', `${targetHeight}px`);

                    if (shouldCrossFadeFromQueue) {
                        widget.classList.add('phase-crossfade', 'next-fullscreen-active');
                        syncSpecialLyricsLayout();
                        if (overlayPhaseFadeTimeout) clearTimeout(overlayPhaseFadeTimeout);
                        overlayPhaseFadeTimeout = setTimeout(() => {
                            if (widget.dataset.upNextPhase !== 'countdown') return;
                            widget.classList.remove('show-queue', 'phase-crossfade');
                            widget.style.removeProperty('--obs-overlay-expanded-height');
                            overlayPhaseFadeTimeout = null;
                        }, 520);
                    } else {
                        transitionOverlayWidgetHeight(targetHeight, () => {
                            widget.classList.remove('show-queue', 'phase-crossfade');
                            widget.classList.add('next-fullscreen-active');
                            syncSpecialLyricsLayout();
                        });
                    }
                }

                modal.classList.remove('show');

                let queue = [];
                try {
                    const rawQueue = localStorage.getItem('dua_queue');
                    if (rawQueue) {
                        queue = JSON.parse(rawQueue);
                    }
                } catch (e) { }

                let idx = -1;
                if (song && song.id) {
                    idx = queue.findIndex(s => String(s.id) === String(song.id));
                }

                // Determine the correct next song object
                let nextSong = null;
                if (isLuckyMode && song.nextSongId) {
                    nextSong = queue.find(s => String(s.id) === String(song.nextSongId));
                }
                if (!nextSong) {
                    nextSong = idx !== -1 ? queue[idx + 1] : queue[0];
                }

                // Fallback nextSong object if nextSong is not in queue yet (e.g. queue empty / not synced yet)
                if (!nextSong && song.nextSongTitle) {
                    nextSong = {
                        title: song.nextSongTitle,
                        donorName: song.nextSongDonor,
                        amount: song.nextSongAmount,
                        isOwnerAdd: song.nextSongIsOwnerAdd,
                        thumbnail: song.nextSongThumbnail,
                        type: song.nextSongType,
                        videoId: song.nextSongVideoId,
                        duration: song.nextSongDuration,
                        start: song.nextSongStart,
                        end: song.nextSongEnd,
                        playlistRequestId: song.nextSongPlaylistRequestId,
                        playlistPosition: song.nextSongPlaylistPosition,
                        playlistTotalTracks: song.nextSongPlaylistTotalTracks,
                        playlistTitle: song.nextSongPlaylistTitle
                    };
                }

                if (nextSong) {
                    const thumbEl = document.getElementById('next-fullscreen-thumb');
                    const titleEl = document.getElementById('next-fullscreen-title');
                    const donorNameEl = document.getElementById('next-fullscreen-donor-name');
                    const donorAmountEl = document.getElementById('next-fullscreen-donor-amount');
                    const countdownEl = document.getElementById('next-fullscreen-countdown');

                    const targetSrc = nextSong.thumbnail || ((!nextSong.type || nextSong.type === 'youtube')
                        ? `https://img.youtube.com/vi/${nextSong.videoId}/hqdefault.jpg`
                        : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');

                    if (thumbEl) {
                        if (thumbEl.dataset.originalSrc !== targetSrc) {
                            thumbEl.dataset.originalSrc = targetSrc;
                            thumbEl.src = targetSrc;
                        }
                    }

                    // Preload thumbnail to main player cover in background.
                    if (cover) {
                        if (!isSameThumbnail(cover.src, targetSrc)) {
                            cover.src = targetSrc;
                        }
                    }

                    // Set blurred backdrop image property
                    const coverUrl = `url('${targetSrc}')`;
                    drawer.style.setProperty('--next-cover-url', coverUrl);
                    fullscreenCard.style.setProperty('--next-cover-url', coverUrl);
                    const currentTheme = localStorage.getItem('dua_theme') || 'enchanted-wild';
                    const hasThemeChanged = (titleEl.dataset.lastTheme !== currentTheme);
                    if (titleEl && (titleEl.dataset.originalTitle !== nextSong.title || hasThemeChanged)) {
                        titleEl.dataset.originalTitle = nextSong.title;
                        titleEl.dataset.lastTheme = currentTheme;
                        const containerEl = document.getElementById('next-fullscreen-title-container');
                        applyMarquee(containerEl, titleEl, nextSong.title || 'Không rõ tên bài hát', 40);
                    }

                    if (nextSong.isOwnerAdd) {
                        const storedMsg = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                        if (donorNameEl && donorNameEl.dataset.originalText !== storedMsg) {
                            donorNameEl.dataset.originalText = storedMsg;
                            donorNameEl.textContent = storedMsg;
                            donorNameEl.style.setProperty('max-width', 'none', 'important');
                            donorNameEl.style.setProperty('white-space', 'normal', 'important');
                        }
                        if (donorAmountEl && donorAmountEl.style.display !== 'none') {
                            donorAmountEl.style.setProperty('display', 'none', 'important');
                        }
                    } else {
                        const targetDonorName = getUpcomingDonorLabel(nextSong);
                        if (donorNameEl && donorNameEl.dataset.originalText !== targetDonorName) {
                            donorNameEl.dataset.originalText = targetDonorName;
                            donorNameEl.textContent = targetDonorName;
                            donorNameEl.style.removeProperty('max-width');
                            donorNameEl.style.removeProperty('white-space');
                        }
                        const targetAmount = (nextSong.amount && Number(nextSong.amount) > 0)
                            ? Number(nextSong.amount).toLocaleString('vi-VN') + ' ₫'
                            : '0 ₫';
                        if (donorAmountEl) {
                            if (donorAmountEl.textContent !== targetAmount || donorAmountEl.style.display === 'none') {
                                donorAmountEl.textContent = targetAmount;
                                donorAmountEl.style.removeProperty('display');
                            }
                        }
                    }

                    const badgeEl = document.getElementById('next-fullscreen-badge');
                    if (badgeEl) {
                        const targetBadge = `TIẾP THEO ${formatTime(Math.max(0, Math.ceil(remainingTime)))}`;
                        if (badgeEl.textContent !== targetBadge) {
                            badgeEl.textContent = targetBadge;
                        }
                    }

                    if (countdownEl) {
                        const nextSongDurationLimit = calculateNextSongLimitDuration(nextSong);
                        const durStr = nextSongDurationLimit > 0 ? formatTime(nextSongDurationLimit) : '--:--';
                        const playlistLabel = getUpcomingPlaylistLabel(nextSong);
                        const playlistPosition = playlistLabel
                            ? `<span class="playlist-countdown-position">${playlistLabel}</span>`
                            : '';
                        const targetHtml = `${playlistPosition}<span class="playlist-countdown-duration"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px; display: inline-block; margin-top: -2px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${durStr}</span>`;
                        if (countdownEl.innerHTML !== targetHtml) {
                            countdownEl.innerHTML = targetHtml;
                        }
                    }

                    const messageEl = document.getElementById('next-fullscreen-message');
                    if (messageEl) {
                        if (nextSong.message && nextSong.message.trim() !== '') {
                            const trimmedMsg = nextSong.message.trim();
                            if (messageEl.textContent !== trimmedMsg || messageEl.style.display === 'none') {
                                messageEl.textContent = trimmedMsg;
                                messageEl.style.display = 'block';
                            }
                        } else {
                            if (messageEl.style.display !== 'none') {
                                messageEl.textContent = '';
                                messageEl.style.display = 'none';
                            }
                        }
                    }

                    if (!fullscreenCard.classList.contains('active') || fullscreenCard.dataset.currentSongId !== String(nextSong.id)) {
                        fullscreenCard.dataset.currentSongId = String(nextSong.id);
                        if (!fullscreenCard.classList.contains('active')) {
                            fullscreenCard.classList.add('active');
                        }
                    }
                } else {
                    if (fullscreenCard.classList.contains('active')) {
                        fullscreenCard.classList.remove('active');
                        delete fullscreenCard.dataset.currentSongId;
                    }
                    drawer.style.removeProperty('--next-cover-url');
                    fullscreenCard.style.removeProperty('--next-cover-url');
                    const badgeEl = document.getElementById('next-fullscreen-badge');
                    if (badgeEl) badgeEl.textContent = 'TIẾP THEO';
                }
            }
            // Idle state
            else {
                if (!isSponsorBlockNotificationActive && !isExtensionNotificationActive) {
                    drawer.classList.remove('show');
                }
                modal.classList.remove('show');
                if (fullscreenCard.classList.contains('active')) {
                    fullscreenCard.classList.remove('active');
                    delete fullscreenCard.dataset.currentSongId;
                }
                const badgeEl = document.getElementById('next-fullscreen-badge');
                if (badgeEl) badgeEl.textContent = 'TIẾP THEO';
                if (widget) {
                    if (widget.dataset.upNextPhase !== 'idle'
                        || widget.classList.contains('show-queue')
                        || widget.classList.contains('next-fullscreen-active')) {
                        clearUpNextPhase();
                    }
                }
                drawer.style.removeProperty('--next-cover-url');
                fullscreenCard.style.removeProperty('--next-cover-url');
            }
        }

        // ========================================================
        // Thông báo chủ kênh thêm nhạc
        // ========================================================
        let ownerAddToastTimeout = null;

        function triggerOwnerAddAlert(data) {
            const toast = document.getElementById('obs-owner-add-toast');
            const thumb = document.getElementById('obs-owner-add-toast-thumb');
            const titleEl = document.getElementById('obs-owner-add-toast-title');
            if (!toast || !titleEl) return;

            const songTitle = data.title || 'Không rõ';
            const thumbSrc = data.thumbnail ||
                (data.type === 'youtube' && data.videoId
                    ? `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`
                    : '');

            if (thumb) thumb.src = thumbSrc;
            if (titleEl) titleEl.textContent = songTitle;

            // Với lyrics, dùng lại thẻ "Đã thêm" cũ nhưng đặt đè đúng vùng
            // player phía trên, tuyệt đối không chiếm thêm chiều cao hay che lời.
            const widget = document.getElementById('obs-player-widget');
            const drawer = document.getElementById('obs-next-song-drawer');
            if (widget) {
                const widgetRect = widget.getBoundingClientRect();
                const hasLyrics = widget.classList.contains('lyrics-visible');
                toast.classList.toggle('lyrics-mode', hasLyrics);
                if (hasLyrics) {
                    const playerRegionHeight = Math.max(1, Math.round(overlayLyrics?.offsetTop || 104));
                    toast.style.setProperty('--obs-player-region-height', `${playerRegionHeight}px`);
                } else {
                    toast.style.removeProperty('--obs-player-region-height');
                }
                let targetTop = hasLyrics ? widgetRect.top : widgetRect.bottom;

                // If drawer is visible and drawer sits below player
                if (!hasLyrics && drawer && drawer.classList.contains('show')) {
                    const drawerRect = drawer.getBoundingClientRect();
                    targetTop = Math.max(targetTop, drawerRect.bottom);
                }

                toast.style.top = `${targetTop + (hasLyrics ? 0 : 8)}px`;
                toast.style.left = `${widgetRect.left}px`;
                toast.style.width = `${widgetRect.width}px`;
            }

            // Reset and show
            toast.classList.remove('show', 'hide');
            void toast.offsetWidth;
            toast.classList.add('show');

            if (ownerAddToastTimeout) clearTimeout(ownerAddToastTimeout);
            ownerAddToastTimeout = setTimeout(() => {
                toast.classList.remove('show');
                toast.classList.add('hide');
                setTimeout(() => {
                    toast.classList.remove('hide');
                    if (typeof refreshAllActiveMarquees === 'function') refreshAllActiveMarquees();
                }, 350);
            }, 5000);
        }

        function triggerSponsorBlockToast() {
            const nextSongDrawer = document.getElementById('obs-next-song-drawer');
            const nextTextEl = document.getElementById('obs-next-text');
            const nextTagEl = document.getElementById('obs-next-tag');
            const nextDonorInfo = document.getElementById('obs-next-donor-info');

            if (!nextSongDrawer || !nextTextEl || !nextTagEl) return;

            isSponsorBlockNotificationActive = true;
            isExtensionNotificationActive = false;
            if (extensionToastTimeout) {
                clearTimeout(extensionToastTimeout);
                extensionToastTimeout = null;
            }

            const updateSBContent = () => {
                nextSongDrawer.classList.add('sb-active');
                nextSongDrawer.classList.remove('ext-active');
                nextTagEl.style.setProperty('display', 'none', 'important');
                if (nextDonorInfo) nextDonorInfo.style.setProperty('display', 'none', 'important');
                nextTextEl.textContent = 'Đã tự động bỏ qua quảng cáo';
                nextTextEl.classList.remove('marquee');
                nextTextEl.style.animationDuration = '0s';
            };

            if (nextSongDrawer.classList.contains('show')) {
                updateSBContent();
            } else {
                nextSongDrawer.classList.remove('show');
                setTimeout(() => {
                    updateSBContent();
                    nextSongDrawer.classList.add('show');
                }, 100);
            }

            if (sbToastTimeout) clearTimeout(sbToastTimeout);
            sbToastTimeout = setTimeout(() => {
                let currentSong = null;
                try {
                    const songRaw = localStorage.getItem('dua_current_song');
                    if (songRaw) currentSong = JSON.parse(songRaw);
                } catch (e) { }

                const shouldKeepDrawer = currentRemainingTime <= 15 && currentRemainingTime >= 0 && currentSong && currentSong.nextSongTitle;

                if (shouldKeepDrawer) {
                    nextSongDrawer.classList.remove('sb-active');
                    nextTagEl.textContent = 'TIẾP THEO';
                    nextTagEl.style.display = '';

                    const nextSongObj = {
                        duration: currentSong.nextSongDuration,
                        start: currentSong.nextSongStart,
                        end: currentSong.nextSongEnd,
                        playlistRequestId: currentSong.nextSongPlaylistRequestId,
                        playlistTrackId: currentSong.nextSongPlaylistTrackId,
                        timeLimitExempt: currentSong.nextSongTimeLimitExempt
                    };
                    const nextSongDurationLimit = calculateNextSongLimitDuration(nextSongObj);
                    const drawerDurationEl = document.getElementById('obs-next-duration');
                    if (drawerDurationEl) {
                        if (nextSongDurationLimit > 0) {
                            drawerDurationEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 11px; height: 11px; vertical-align: middle; margin-right: 4px; display: inline-block; margin-top: -2px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${formatTime(nextSongDurationLimit)}`;
                            drawerDurationEl.style.display = 'block';
                        } else {
                            drawerDurationEl.style.display = 'none';
                        }
                    }

                    const targetSrc = currentSong.nextSongThumbnail || (currentSong.nextSongType === 'youtube'
                        ? `https://img.youtube.com/vi/${currentSong.nextSongVideoId}/hqdefault.jpg`
                        : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');
                    nextSongDrawer.style.setProperty('--next-cover-url', `url('${targetSrc}')`);

                    const containerEl = document.getElementById('obs-next-title-container');
                    applyMarquee(containerEl, nextTextEl, currentSong.nextSongTitle || '', 40);

                    if (nextDonorInfo) {
                        const donor = currentSong.nextSongDonorName || 'Khách';
                        const amount = (currentSong.nextSongAmount && Number(currentSong.nextSongAmount) > 0)
                            ? ` · ${Number(currentSong.nextSongAmount).toLocaleString('vi-VN')} ₫`
                            : '';
                        const nextDonorNameDisplay = document.getElementById('obs-next-donor-name');
                        const nextDonorAmountDisplay = document.getElementById('obs-next-donor-amount');
                        if (nextDonorNameDisplay) nextDonorNameDisplay.textContent = donor;
                        if (nextDonorAmountDisplay) nextDonorAmountDisplay.textContent = amount;
                        nextDonorInfo.style.setProperty('display', 'flex', 'important');
                    }
                    isSponsorBlockNotificationActive = false;
                } else {
                    nextSongDrawer.classList.remove('show');
                    nextSongDrawer.style.removeProperty('--next-cover-url');

                    setTimeout(() => {
                        nextSongDrawer.classList.remove('sb-active');
                        nextTagEl.textContent = 'TIẾP THEO';
                        nextTagEl.style.display = '';
                        nextTextEl.textContent = '';
                        isSponsorBlockNotificationActive = false;
                    }, 400);
                }
            }, 4000);
        }

        function triggerExtensionSuccessToast(mins) {
            const nextSongDrawer = document.getElementById('obs-next-song-drawer');
            const nextTextEl = document.getElementById('obs-next-text');
            const nextTagEl = document.getElementById('obs-next-tag');
            const nextDonorInfo = document.getElementById('obs-next-donor-info');

            if (!nextSongDrawer || !nextTextEl || !nextTagEl) return;

            isExtensionNotificationActive = true;
            isSponsorBlockNotificationActive = false;
            if (sbToastTimeout) {
                clearTimeout(sbToastTimeout);
                sbToastTimeout = null;
            }

            const updateExtContent = () => {
                nextSongDrawer.classList.add('ext-active');
                nextSongDrawer.classList.remove('sb-active');
                nextTagEl.style.setProperty('display', 'none', 'important');
                if (nextDonorInfo) nextDonorInfo.style.setProperty('display', 'none', 'important');
                nextTextEl.textContent = `Thành công +${mins} phút`;
                nextTextEl.classList.remove('marquee');
                nextTextEl.style.animationDuration = '0s';
            };

            if (nextSongDrawer.classList.contains('show')) {
                updateExtContent();
            } else {
                nextSongDrawer.classList.remove('show');
                setTimeout(() => {
                    updateExtContent();
                    nextSongDrawer.classList.add('show');
                }, 100);
            }

            if (extensionToastTimeout) clearTimeout(extensionToastTimeout);
            extensionToastTimeout = setTimeout(() => {
                let currentSong = null;
                try {
                    const songRaw = localStorage.getItem('dua_current_song');
                    if (songRaw) currentSong = JSON.parse(songRaw);
                } catch (e) { }

                const shouldKeepDrawer = currentRemainingTime <= 15 && currentRemainingTime >= 0 && currentSong && currentSong.nextSongTitle;

                if (shouldKeepDrawer) {
                    nextSongDrawer.classList.remove('ext-active');
                    nextTagEl.textContent = 'TIẾP THEO';
                    nextTagEl.style.display = '';

                    const nextSongObj = {
                        duration: currentSong.nextSongDuration,
                        start: currentSong.nextSongStart,
                        end: currentSong.nextSongEnd,
                        playlistRequestId: currentSong.nextSongPlaylistRequestId,
                        playlistTrackId: currentSong.nextSongPlaylistTrackId,
                        timeLimitExempt: currentSong.nextSongTimeLimitExempt
                    };
                    const nextSongDurationLimit = calculateNextSongLimitDuration(nextSongObj);
                    const drawerDurationEl = document.getElementById('obs-next-duration');
                    if (drawerDurationEl) {
                        if (nextSongDurationLimit > 0) {
                            drawerDurationEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 11px; height: 11px; vertical-align: middle; margin-right: 4px; display: inline-block; margin-top: -2px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${formatTime(nextSongDurationLimit)}`;
                            drawerDurationEl.style.display = 'block';
                        } else {
                            drawerDurationEl.style.display = 'none';
                        }
                    }

                    const targetSrc = currentSong.nextSongThumbnail || (currentSong.nextSongType === 'youtube'
                        ? `https://img.youtube.com/vi/${currentSong.nextSongVideoId}/hqdefault.jpg`
                        : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');
                    nextSongDrawer.style.setProperty('--next-cover-url', `url('${targetSrc}')`);

                    const containerEl = document.getElementById('obs-next-title-container');
                    applyMarquee(containerEl, nextTextEl, currentSong.nextSongTitle || '', 40);

                    if (nextDonorInfo) {
                        const donor = currentSong.nextSongDonorName || 'Khách';
                        const amount = (currentSong.nextSongAmount && Number(currentSong.nextSongAmount) > 0)
                            ? ` · ${Number(currentSong.nextSongAmount).toLocaleString('vi-VN')} ₫`
                            : '';
                        const nextDonorNameDisplay = document.getElementById('obs-next-donor-name');
                        const nextDonorAmountDisplay = document.getElementById('obs-next-donor-amount');
                        if (nextDonorNameDisplay) nextDonorNameDisplay.textContent = donor;
                        if (nextDonorAmountDisplay) nextDonorAmountDisplay.textContent = amount;
                        nextDonorInfo.style.setProperty('display', 'flex', 'important');
                    }
                    isExtensionNotificationActive = false;
                } else {
                    nextSongDrawer.classList.remove('show');
                    nextSongDrawer.style.removeProperty('--next-cover-url');

                    setTimeout(() => {
                        nextSongDrawer.classList.remove('ext-active');
                        nextTagEl.textContent = 'TIẾP THEO';
                        nextTagEl.style.display = '';
                        nextTextEl.textContent = '';
                        isExtensionNotificationActive = false;
                    }, 400);
                }
            }, 4000);
        }

        // Hàm định dạng thời gian (MM:SS)
        function formatTime(seconds) {
            if (isNaN(seconds) || seconds === null || seconds === undefined) {
                return "0:00";
            }
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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

        function isExtensionAllowedForSong(song, actualDuration) {
            if (!song) return false;

            const realDuration = actualDuration || song.duration || 0;
            if (realDuration <= 0) return true;

            const currentLimit = song.maxDuration || 0;
            if (currentLimit <= 0) return false;

            return (realDuration - currentLimit) > 0;
        }

        // Khởi tạo trạng thái YouTube API
        window.onYouTubeIframeAPIReady = function () {
            isPlayerReady = true;
            console.info('[YouTube IFrame] API ready.', {
                origin: window.location.origin || 'null',
                userAgent: navigator.userAgent
            });
            updateOverlayUI(); // Chạy đồng bộ ngay sau khi API sẵn sàng
        };

        // Nạp động file script YouTube API để đảm bảo sự kiện onYouTubeIframeAPIReady luôn kích hoạt đúng thứ tự
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = () => {
            console.error('[YouTube IFrame] Không tải được iframe_api.', {
                origin: window.location.origin || 'null',
                userAgent: navigator.userAgent
            });
        };
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        // Hàm đọc cài đặt SponsorBlock từ dashboard qua localStorage
        function loadSponsorBlockCategories() {
            try {
                const sbRaw = localStorage.getItem('dua_sb_categories');
                const saved = sbRaw ? JSON.parse(sbRaw) : {};
                sponsorBlockCategories = {
                    ...defaultSponsorBlockCategories,
                    ...(saved && typeof saved === 'object' ? saved : {})
                };
            } catch (e) {
                console.error("Error loading SB categories:", e);
            }
        }

        function getAdaptiveVolumeAdjustment() {
            const isAdaptiveEnabled = localStorage.getItem('dua_adaptive_volume_enabled') === 'true';
            if (!isAdaptiveEnabled) return 0;

            if (currentLoudnessDb !== null && typeof currentLoudnessDb === 'number' && !isNaN(currentLoudnessDb)) {
                const offsetVal = parseFloat(localStorage.getItem('dua_adaptive_loudness_offset')) || 0;
                return -(currentLoudnessDb - offsetVal);
            }
            return 0;
        }

        // Lấy loudnessDb từ server API cho video YouTube hiện tại
        function fetchLoudnessDb(videoId) {
            if (!videoId) return;
            // Nếu đã lấy cho video này rồi, bỏ qua
            if (currentLoudnessVideoId === videoId && currentLoudnessDb !== null) return;

            currentLoudnessVideoId = videoId;
            currentLoudnessDb = null; // Reset trong lúc chờ

            let baseUrl = 'http://localhost:3000';
            if (location.protocol.startsWith('http')) {
                baseUrl = `${location.protocol}//${location.hostname}:${location.port}`;
            }
            fetch(`${baseUrl}/api/yt-loudness?videoId=${encodeURIComponent(videoId)}`)
                .then(res => res.json())
                .then(data => {
                    // Chỉ áp dụng nếu vẫn đang phát video này
                    if (currentLoudnessVideoId !== videoId) return;
                    if (data.loudnessDb !== null && data.loudnessDb !== undefined) {
                        currentLoudnessDb = data.loudnessDb;
                        console.log(`[Adaptive Volume] Đã lấy loudnessDb cho ${videoId}: ${currentLoudnessDb} dB → multiplier: ${Math.pow(10, currentLoudnessDb / 20).toFixed(3)}`);
                        applyTargetVolume(); // Áp dụng ngay lập tức
                    } else {
                        console.log(`[Adaptive Volume] Không lấy được loudnessDb cho ${videoId}`);
                        currentLoudnessDb = null;
                    }
                })
                .catch(err => {
                    console.warn(`[Adaptive Volume] Lỗi lấy loudnessDb cho ${videoId}:`, err);
                    currentLoudnessDb = null;
                });
        }

        function getAdjustedVolume() {
            // Resume changes only the playhead. It must never mute or overwrite
            // the Dashboard volume while the player is seeking.
            const activeVol = targetVolume;
            const isAdaptiveEnabled = localStorage.getItem('dua_adaptive_volume_enabled') === 'true';

            if (isAdaptiveEnabled && !localIsResuming) {
                const dbAdj = getAdaptiveVolumeAdjustment();
                if (dbAdj !== 0) {
                    const multiplier = Math.pow(10, dbAdj / 20);
                    let finalVolume = Math.round(targetVolume * multiplier);
                    if (targetVolume > 0 && finalVolume < 5) {
                        finalVolume = 5;
                    }
                    if (finalVolume > 100) {
                        finalVolume = 100;
                    }
                    return finalVolume;
                }
            }
            return activeVol;
        }

        function applyTargetVolume() {
            const finalVolume = getAdjustedVolume();
            if (overlayPlayer && typeof overlayPlayer.setVolume === 'function') {
                try { overlayPlayer.setVolume(finalVolume); } catch (e) { }
            }
            if (soundCloudWidget && typeof soundCloudWidget.setVolume === 'function') {
                try { soundCloudWidget.setVolume(finalVolume); } catch (e) { }
            }
            if (directAudioPlayer) {
                try { directAudioPlayer.volume = finalVolume / 100; } catch (e) { }
            }
        }

        function getActivePlaybackVolume() {
            if (isDirectAudioPlaying && directAudioPlayer) {
                return Math.round((Number(directAudioPlayer.volume) || 0) * 100);
            }
            if (overlayPlayer && typeof overlayPlayer.getVolume === 'function') {
                try { return overlayPlayer.getVolume(); } catch (_) { }
            }
            return '?';
        }

        // Bộ ép âm lượng liên tục — chạy mỗi 150ms trong tối đa 5 giây sau khi chuyển bài
        // Đây là cách duy nhất đảm bảo YouTube API không thể reset volume ở bất kỳ thời điểm nào
        function startVolumeEnforcer() {
            stopVolumeEnforcer(); // Dọn cái cũ
            volumeEnforcerStartTime = Date.now();
            console.log(`[Volume Enforcer] BẮT ĐẦU — mục tiêu: ${targetVolume}%`);
            applyTargetVolume(); // Áp dụng ngay lập tức
            volumeEnforcerInterval = setInterval(() => {
                applyTargetVolume();
                // Dừng sau 5 giây (đủ cho YouTube hoàn tất mọi async reset)
                if (Date.now() - volumeEnforcerStartTime > 5000) {
                    console.log(`[Volume Enforcer] KẾT THÚC sau 5s — volume hiện tại: ${getActivePlaybackVolume()}%`);
                    stopVolumeEnforcer();
                }
            }, 150);
        }

        function stopVolumeEnforcer() {
            if (volumeEnforcerInterval) {
                clearInterval(volumeEnforcerInterval);
                volumeEnforcerInterval = null;
            }
        }

        function loadSpotifySdk() {
            if (isSpotifySdkLoaded) return;
            isSpotifySdkLoaded = true;

            window.onSpotifyIframeApiReady = (IFrameAPI) => {
                window.SpotifyIframeAPI = IFrameAPI;
                if (pendingSpotifyTrackId) {
                    playSpotifyTrack(pendingSpotifyTrackId);
                    pendingSpotifyTrackId = null;
                }
            };

            const script = document.createElement('script');
            script.src = 'https://open.spotify.com/embed/iframe-api/v1';
            script.async = true;
            document.body.appendChild(script);
        }

        function playSpotifyTrack(trackId) {
            if (!window.SpotifyIframeAPI) {
                pendingSpotifyTrackId = trackId;
                loadSpotifySdk();
                return;
            }

            if (spotifyEmbedController) {
                if (currentSpotifyId !== trackId) {
                    currentSpotifyId = trackId;
                    spotifyEmbedController.loadUri(`spotify:track:${trackId}`);
                    setTimeout(() => {
                        try {
                            spotifyEmbedController.play();
                            if (localIsResuming && resumeTargetTime > 0) {
                                spotifyEmbedController.seek(resumeTargetTime);
                            }
                        } catch (e) { }
                    }, 500);
                } else {
                    try {
                        spotifyEmbedController.play();
                        if (localIsResuming && resumeTargetTime > 0) {
                            spotifyEmbedController.seek(resumeTargetTime);
                        }
                    } catch (e) { }
                }
            } else {
                currentSpotifyId = trackId;
                const options = {
                    width: '100%',
                    height: '100%',
                    uri: `spotify:track:${trackId}`
                };
                window.SpotifyIframeAPI.createController(document.getElementById('obs-spotify-placeholder'), options, (EmbedController) => {
                    spotifyEmbedController = EmbedController;

                    spotifyEmbedController.addListener('playback_update', (e) => {
                        if (!e.data) return;
                        lastSongLoadStartTimestamp = 0; // Reset loader watchdog

                        let isSongActive = false;
                        try {
                            const songRaw = localStorage.getItem('dua_current_song');
                            if (songRaw) {
                                const song = JSON.parse(songRaw);
                                isSongActive = song.type === 'spotify';
                            }
                        } catch (err) { }
                        if (!isSongActive) return;

                        const currentTime = e.data.position / 1000;
                        const duration = e.data.duration / 1000;
                        const isPlaying = !e.data.isPaused;

                        currentPlayback.currentTime = currentTime;
                        currentPlayback.duration = duration;
                        currentPlayback.isPlaying = isPlaying;

                        updateTrackProgress(currentTime, duration, isPlaying);

                        if (isPlaying && duration > 0 && e.data.position >= e.data.duration - 500) {
                            console.log("Spotify: Kết thúc bài hát.");
                            triggerEndedEvent();
                            return;
                        }

                        // Tự động chuyển bài khi kết thúc 30s preview của Spotify (nếu không có Premium)
                        if (e.data.isPaused && e.data.position >= 29000 && lastCommandType !== 'pause' && lastCommandType !== 'stop') {
                            console.log("Spotify: Đã phát hết 30s preview (chưa đăng nhập Premium). Chuyển bài...");
                            triggerEndedEvent();
                        }
                    });

                    setTimeout(() => {
                        try {
                            spotifyEmbedController.play();
                            if (localIsResuming && resumeTargetTime > 0) {
                                spotifyEmbedController.seek(resumeTargetTime);
                            }
                        } catch (e) { }
                    }, 1000);
                });
            }
        }

        function loadSoundCloudSdk(callback) {
            if (isSoundCloudSdkLoaded && window.SC?.Widget) {
                if (callback) callback(null);
                return;
            }
            if (callback) soundCloudSdkCallbacks.push(callback);
            if (isSoundCloudSdkLoading) return;
            isSoundCloudSdkLoading = true;
            const script = document.createElement('script');
            script.src = 'https://w.soundcloud.com/player/api.js';
            script.onload = () => {
                isSoundCloudSdkLoading = false;
                isSoundCloudSdkLoaded = Boolean(window.SC?.Widget);
                const error = isSoundCloudSdkLoaded ? null : new Error('SoundCloud Widget API is unavailable');
                const callbacks = soundCloudSdkCallbacks.splice(0);
                callbacks.forEach(item => item(error));
            };
            script.onerror = () => {
                isSoundCloudSdkLoading = false;
                const error = new Error('Cannot load SoundCloud Widget API');
                const callbacks = soundCloudSdkCallbacks.splice(0);
                callbacks.forEach(item => item(error));
            };
            document.body.appendChild(script);
        }

        function clearSoundCloudLoadTimeout() {
            if (!soundCloudLoadTimeoutId) return;
            clearTimeout(soundCloudLoadTimeoutId);
            soundCloudLoadTimeoutId = null;
        }

        function reportSoundCloudPlaybackError(requestId, trackUrl, error) {
            if (requestId !== soundCloudLoadRequestId) return;
            clearSoundCloudLoadTimeout();
            lastSongLoadStartTimestamp = 0;
            currentPlayback.isPlaying = false;
            console.error('SoundCloud: Không thể phát track:', trackUrl, error);
            let song = null;
            try { song = JSON.parse(localStorage.getItem('dua_current_song') || 'null'); } catch (_) { }
            if (song?.type !== 'soundcloud') return;
            publishMqtt('overlay_event', {
                type: 'player_error',
                code: 5,
                title: song.title || 'SoundCloud',
                songId: song.id,
                provider: 'soundcloud',
                timestamp: Date.now()
            });
            publishOverlayPlaybackState({
                currentTime: 0,
                duration: Number(song.duration || 0),
                isLive: false,
                isPlaying: false,
                isBuffering: false
            }, true);
        }

        function bindSoundCloudWidgetError(requestId, trackUrl) {
            const errorEvent = window.SC?.Widget?.Events?.ERROR;
            if (!soundCloudWidget || !errorEvent) return;
            try { soundCloudWidget.unbind(errorEvent); } catch (_) { }
            soundCloudWidget.bind(errorEvent, (error) => {
                reportSoundCloudPlaybackError(requestId, trackUrl, error || new Error('SoundCloud Widget error'));
            });
        }

        async function resolveOverlaySoundCloudUrl(trackUrl) {
            let resolvedUrl = String(trackUrl || '').trim();
            try {
                const parsed = new URL(resolvedUrl);
                if (parsed.hostname.toLowerCase() === 'on.soundcloud.com') {
                    const response = await fetch(`/api/resolve?url=${encodeURIComponent(resolvedUrl)}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.resolvedUrl) resolvedUrl = data.resolvedUrl;
                    }
                }
            } catch (error) {
                console.warn('Overlay: Không thể resolve link SoundCloud rút gọn:', error);
            }

            try {
                const parsed = new URL(resolvedUrl);
                if (parsed.hostname.toLowerCase() === 'm.soundcloud.com') parsed.hostname = 'soundcloud.com';
                parsed.search = '';
                parsed.hash = '';
                resolvedUrl = parsed.href.replace(/\/$/, '');
            } catch (error) {
                resolvedUrl = resolvedUrl.split(/[\s?#]/)[0];
            }

            // UUID-style permalinks can resolve in the public website but remain
            // stuck in the Widget inside OBS. SoundCloud oEmbed exposes the stable
            // api.soundcloud.com/tracks/<id> URL intended for its own player.
            try {
                const response = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(resolvedUrl)}`);
                if (response.ok) {
                    const data = await response.json();
                    const srcMatch = String(data?.html || '').match(/\bsrc=["']([^"']+)["']/i);
                    if (srcMatch?.[1]) {
                        const playerUrl = new URL(srcMatch[1].replace(/&amp;/g, '&'));
                        const canonicalTrackUrl = playerUrl.searchParams.get('url');
                        if (/^https:\/\/api\.soundcloud\.com\/tracks\/\d+$/i.test(canonicalTrackUrl || '')) {
                            return canonicalTrackUrl;
                        }
                    }
                }
            } catch (error) {
                console.warn('Overlay: Không thể lấy URL Widget chuẩn từ SoundCloud oEmbed:', error);
            }
            return resolvedUrl;
        }

        async function playSoundCloudTrack(trackUrl) {
            const requestId = ++soundCloudLoadRequestId;
            const requestedTrackUrl = String(trackUrl || '').trim();
            clearSoundCloudLoadTimeout();
            soundCloudLoadTimeoutId = setTimeout(() => {
                reportSoundCloudPlaybackError(requestId, requestedTrackUrl, new Error('SoundCloud load timeout'));
            }, 15000);
            trackUrl = await resolveOverlaySoundCloudUrl(trackUrl);
            if (requestId !== soundCloudLoadRequestId) return;
            if (!trackUrl) {
                reportSoundCloudPlaybackError(requestId, requestedTrackUrl, new Error('Invalid SoundCloud URL'));
                return;
            }

            loadSoundCloudSdk((sdkError) => {
                if (requestId !== soundCloudLoadRequestId) return;
                if (sdkError) {
                    reportSoundCloudPlaybackError(requestId, trackUrl, sdkError);
                    return;
                }
                const iframe = document.getElementById('obs-soundcloud-player');
                if (!iframe) {
                    reportSoundCloudPlaybackError(requestId, trackUrl, new Error('SoundCloud iframe is missing'));
                    return;
                }

                if (!soundCloudWidget) {
                    currentSoundCloudUrl = trackUrl;
                    soundCloudDuration = 0;
                    iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&show_artwork=false&show_comments=false&show_playcount=false&sharing=false&download=false&buying=false`;

                    soundCloudWidget = SC.Widget(iframe);
                    bindSoundCloudWidgetError(requestId, trackUrl);

                    soundCloudWidget.bind(SC.Widget.Events.READY, () => {
                        soundCloudWidget.setVolume(targetVolume);
                        try { soundCloudWidget.play(); } catch (_) { }

                        soundCloudWidget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
                            let isSongActive = false;
                            try {
                                const songRaw = localStorage.getItem('dua_current_song');
                                if (songRaw) {
                                    const song = JSON.parse(songRaw);
                                    isSongActive = song.type === 'soundcloud';
                                }
                            } catch (err) { }
                            if (!isSongActive) return;

                            const currentTime = e.currentPosition / 1000;
                            if (!soundCloudDuration || isNaN(soundCloudDuration) || soundCloudDuration <= 0) {
                                soundCloudWidget.getDuration((ms) => {
                                    const gotDuration = ms / 1000;
                                    if (gotDuration && !isNaN(gotDuration) && gotDuration > 0) {
                                        soundCloudDuration = gotDuration;
                                        currentPlayback.currentTime = currentTime;
                                        currentPlayback.duration = soundCloudDuration;
                                        currentPlayback.isPlaying = true;
                                        updateTrackProgress(currentTime, soundCloudDuration, true);
                                    }
                                });
                            } else {
                                currentPlayback.currentTime = currentTime;
                                currentPlayback.duration = soundCloudDuration;
                                currentPlayback.isPlaying = true;
                                updateTrackProgress(currentTime, soundCloudDuration, true);
                            }
                        });

                        soundCloudWidget.bind(SC.Widget.Events.PLAY, () => {
                            clearSoundCloudLoadTimeout();
                            lastSongLoadStartTimestamp = 0; // Reset loader watchdog
                            currentPlayback.isPlaying = true;
                            soundCloudWidget.setVolume(targetVolume);
                            if (localIsResuming && resumeTargetTime > 0) {
                                try { soundCloudWidget.seekTo(resumeTargetTime * 1000); } catch (e) { }
                            }
                            soundCloudWidget.getDuration((ms) => {
                                const gotDuration = ms / 1000;
                                if (gotDuration && !isNaN(gotDuration) && gotDuration > 0) {
                                    soundCloudDuration = gotDuration;
                                }
                            });
                        });

                        soundCloudWidget.bind(SC.Widget.Events.PAUSE, () => {
                            currentPlayback.isPlaying = false;
                        });

                        soundCloudWidget.bind(SC.Widget.Events.FINISH, () => {
                            console.log("SoundCloud: Kết thúc bài hát.");
                            triggerEndedEvent();
                        });
                    });
                } else {
                    bindSoundCloudWidgetError(requestId, trackUrl);
                    if (currentSoundCloudUrl !== trackUrl) {
                        currentSoundCloudUrl = trackUrl;
                        soundCloudDuration = 0;
                        soundCloudWidget.load(trackUrl, {
                            auto_play: true,
                            show_artwork: false,
                            show_comments: false,
                            show_playcount: false,
                            sharing: false,
                            download: false,
                            buying: false
                        }, () => {
                            if (localIsResuming && resumeTargetTime > 0) {
                                setTimeout(() => {
                                    try { soundCloudWidget.seekTo(resumeTargetTime * 1000); } catch (e) { }
                                }, 500);
                            }
                            soundCloudWidget.getDuration((ms) => {
                                const gotDuration = ms / 1000;
                                if (gotDuration && !isNaN(gotDuration) && gotDuration > 0) {
                                    soundCloudDuration = gotDuration;
                                }
                            });
                        });
                    } else {
                        soundCloudWidget.play();
                        if (localIsResuming && resumeTargetTime > 0) {
                            try { soundCloudWidget.seekTo(resumeTargetTime * 1000); } catch (e) { }
                        }
                    }
                }
            });
        }

        function getPayloadDuration() {
            try {
                return Math.max(0, Number(JSON.parse(localStorage.getItem('dua_current_song') || '{}').duration) || 0);
            } catch (_) {
                return 0;
            }
        }

        function isResumeSeekInProgress() {
            return localIsResuming && resumeTargetTime > 0;
        }

        function resolveSponsorBlockSeekTarget(requestedTime) {
            let target = Math.max(0, Number(requestedTime) || 0);
            if (!Array.isArray(skipSegments) || skipSegments.length === 0) return target;
            loadSponsorBlockCategories();
            const playbackDuration = getPayloadDuration();

            // Lặp để xử lý cả các segment bật có phần giao nhau hoặc nối tiếp.
            for (let pass = 0; pass < skipSegments.length; pass += 1) {
                let moved = false;
                for (const segment of skipSegments) {
                    if (sponsorBlockCategories[segment.category] !== true) continue;
                    const start = Number(segment.start);
                    const end = Number(segment.end);
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
                    if (target >= start && target < end) {
                        // Seeking past a tail segment can exceed YouTube's real duration
                        // and wrap the iframe back to 0:00. End handling owns this case.
                        if (sponsorBlockPlaybackPolicy.isTerminalSegment(end, playbackDuration)) {
                            return target;
                        }
                        target = end + 0.05;
                        moved = true;
                    }
                }
                if (!moved) break;
            }
            return target;
        }

        function skipSponsorBlockSegment(currentTime, playbackDuration, expectedSongId, seekTo) {
            const normalizedSongId = expectedSongId == null ? null : String(expectedSongId);
            if (typeof seekTo !== 'function'
                || normalizedSongId === null
                || normalizedSongId !== activePlaybackSongId
                || normalizedSongId !== skipSegmentsSongId
                || !Array.isArray(skipSegments)
                || skipSegments.length === 0) return false;
            loadSponsorBlockCategories();
            const now = Date.now();

            const action = sponsorBlockPlaybackPolicy.resolvePlaybackAction(
                currentTime,
                playbackDuration,
                skipSegments,
                sponsorBlockCategories
            );
            if (action.type === 'none') {
                lastSkippedSegmentKey = null;
                lastSBSeekTimestamp = 0;
                lastSBSeekTarget = 0;
                return false;
            }

            const { segment } = action;
            const segmentKey = `${segment.category}:${segment.start}-${segment.end}`;
            const isRetry = lastSkippedSegmentKey === segmentKey
                && Math.abs(lastSBSeekTarget - segment.end) < 0.01;
            if (isRetry && now - lastSBSeekTimestamp < 600) return false;

            lastSBSeekTimestamp = now;
            lastSBSeekTarget = segment.end;
            lastSkippedSegmentKey = segmentKey;

            if (action.type === 'end') {
                console.log(`SponsorBlock Overlay: Đoạn [${segment.category}] chạm đuôi (${segment.end.toFixed(1)}s/${Number(playbackDuration).toFixed(1)}s); kết bài thay vì tua vượt duration.`);
                triggerEndedEvent('sponsorblock_tail', normalizedSongId);
                return true;
            }

            console.log(`SponsorBlock Overlay: Nhảy phân đoạn [${segment.category}] (${Number(currentTime).toFixed(1)}s -> ${segment.end.toFixed(1)}s)`);
            try {
                seekTo(action.target);
            } catch (error) {
                console.warn('SponsorBlock Overlay: Lệnh tua thất bại, sẽ thử lại.', error);
                return false;
            }
            if (!isRetry) triggerSponsorBlockToast();
            return true;
        }

        function normalizePlaybackDuration(playerDuration) {
            const iframeDuration = Math.max(0, Number(playerDuration) || 0);
            const payloadDuration = getPayloadDuration();
            if (iframeDuration > 0 && payloadDuration > 0) {
                // YouTube iframe commonly rounds 221.181 up to 222. Treat a small
                // difference as the same media duration and keep the earlier,
                // precise endpoint supplied by the Overlay payload.
                if (Math.abs(iframeDuration - payloadDuration) <= 2) {
                    return Math.floor(Math.min(iframeDuration, payloadDuration));
                }
                return Math.floor(iframeDuration);
            }
            return Math.floor(iframeDuration || payloadDuration);
        }

        function getEffectiveSongMaxDuration(song) {
            if (song && Object.prototype.hasOwnProperty.call(song, 'maxDuration')) {
                return Math.max(0, Math.floor(Number(song.maxDuration) || 0));
            }
            return Math.max(0, Math.floor(Number(localStorage.getItem('dua_max_duration')) || 0));
        }

        function syncCurrentSongMaxDuration(value) {
            const normalizedValue = Math.max(0, Math.floor(Number(value) || 0));
            localStorage.setItem('dua_max_duration', String(normalizedValue));
            try {
                const songRaw = localStorage.getItem('dua_current_song');
                if (!songRaw) return normalizedValue;
                const song = JSON.parse(songRaw);
                song.maxDuration = normalizedValue;
                localStorage.setItem('dua_current_song', JSON.stringify(song));
            } catch (_) { }
            return normalizedValue;
        }

        function isIframeAtNaturalEnd(player, toleranceSeconds = 1.5) {
            if (!player || lastCommandType !== 'play' || isLiveStream) return false;
            try {
                const currentTime = Math.max(0, Number(player.getCurrentTime?.()) || 0);
                const duration = normalizePlaybackDuration(player.getDuration?.());
                return duration > 0
                    && currentTime > 0
                    && currentTime >= duration - Math.max(0, Number(toleranceSeconds) || 0);
            } catch (_) {
                return false;
            }
        }

        function publishOverlayPlaybackState(playbackState, force = false) {
            const now = Date.now();
            if (!force && window.lastMqttPublishTime && now - window.lastMqttPublishTime < REALTIME_PROGRESS_INTERVAL_MS) return;
            let songId = null;
            try { songId = JSON.parse(localStorage.getItem('dua_current_song') || 'null')?.id ?? null; } catch (_) { }
            publishMqtt('overlay_state', {
                ...playbackState,
                songId,
                isDirectStream: isDirectAudioPlaying,
                adjustedVolume: getAdjustedVolume(),
                loudnessDb: currentLoudnessDb,
                overlayUrl: location.href
            });
            window.lastMqttPublishTime = now;
        }

        function updateTrackProgress(currentTime, duration, isPlaying) {
            duration = normalizePlaybackDuration(duration);
            if (!duration || isNaN(duration) || duration <= 0) return;
            publishOverlayPlaybackState({
                currentTime,
                duration,
                isLive: false,
                isPlaying,
                isBuffering: !isDirectAudioPlaying && iframePlaybackStalled
            });

            const currentSongRaw = localStorage.getItem('dua_current_song');
            if (currentSongRaw) {
                try {
                    const song = JSON.parse(currentSongRaw);

                    // OBS/CEF can lose YouTube's ENDED callback and leave the iframe
                    // paused about one second before its reported duration. A manual
                    // pause changes lastCommandType to `pause`, so it is not mistaken
                    // for a natural completion here.
                    const naturalEndTolerance = isPlaying ? 0.5 : 1.5;
                    if (duration > 0 && lastCommandType === 'play' && currentTime > 0 && duration - currentTime <= naturalEndTolerance) {
                        triggerEndedEvent();
                        return;
                    }

                    let startPoint = song.start || 0;
                    let limitDuration = duration;
                    if (song.end && song.end > startPoint) {
                        limitDuration = Math.min(limitDuration, song.end);
                    }
                    const maxDur = getEffectiveSongMaxDuration(song);
                    if (maxDur > 0) {
                        limitDuration = Math.min(limitDuration, startPoint + maxDur);
                    }
                    const actualPlayDuration = Math.max(1, limitDuration - startPoint);
                    const elapsedTime = currentTime - startPoint;
                    const remainingTime = actualPlayDuration - elapsedTime;
                    currentRemainingTime = remainingTime;

                    if (remainingTime <= 15 && remainingTime >= -1) {
                        if (!window.lastDebugTime || Date.now() - window.lastDebugTime >= 1000) {
                            console.log(`[DEBUG DRAWER] Remaining Time: ${remainingTime.toFixed(1)}s, Next Song: "${song.nextSongTitle || 'null'}"`);
                            window.lastDebugTime = Date.now();
                        }
                    }

                    updateNextSongSequence(remainingTime, song);

                    if (song.end && currentTime >= song.end - 0.35) {
                        triggerEndedEvent();
                        return;
                    }

                    if (maxDur > 0) {
                        if (elapsedTime >= maxDur - 0.35) {
                            console.log(`Overlay: Đã phát đạt giới hạn thời gian tối đa cấu hình (${maxDur}s). Chuyển bài tiếp theo...`);
                            triggerEndedEvent();
                            return;
                        }
                    }

                } catch (e) { }
            }
        }

        function initDirectAudioPlayer() {
            if (!directAudioPlayer) {
                directAudioPlayer = document.getElementById('obs-direct-audio-player');
                if (!directAudioPlayer) return;

                // Trình theo dõi sự kiện của thẻ <audio> ẩn
                directAudioPlayer.addEventListener('timeupdate', () => {
                    if (isDirectAudioPlaying) {
                        let currentTime = directAudioPlayer.currentTime;
                        if (localIsResuming && resumeTargetTime > 0) {
                            if (currentTime >= resumeTargetTime - 1.5) {
                                localIsResuming = false;
                                hasSeekedForResume = true;
                                toggleResumingState(false);
                                applyTargetVolume();
                            } else {
                                seekActivePlayerToResumeTarget();
                                currentTime = directAudioPlayer.currentTime;
                            }
                        }
                        const playbackDuration = normalizePlaybackDuration(directAudioPlayer.duration);
                        const skipped = !isResumeSeekInProgress() && skipSponsorBlockSegment(
                            currentTime,
                            playbackDuration,
                            currentDirectSongId,
                            targetTime => {
                            directAudioPlayer.currentTime = playbackDuration > 0
                                ? Math.min(targetTime, Math.max(0, playbackDuration - 0.5))
                                : targetTime;
                            }
                        );
                        if (skipped) currentTime = directAudioPlayer.currentTime;
                        const duration = playbackDuration;
                        currentPlayback.currentTime = currentTime;
                        currentPlayback.duration = duration;
                        updateTrackProgress(currentTime, duration, true);
                    }
                });

                directAudioPlayer.addEventListener('ended', () => {
                    if (isDirectAudioPlaying) {
                        const endedDirectSongId = currentDirectSongId;
                        console.log("Direct Audio: Kết thúc bài hát.");
                        stopDirectAudioStream();
                        triggerEndedEvent('direct_stream_ended', endedDirectSongId);
                    }
                });

                directAudioPlayer.addEventListener('pause', () => {
                    if (isDirectAudioPlaying) {
                        currentPlayback.isPlaying = false;
                        updateTrackProgress(directAudioPlayer.currentTime, directAudioPlayer.duration || 0, false);
                    }
                });

                directAudioPlayer.addEventListener('play', () => {
                    if (isDirectAudioPlaying) {
                        currentPlayback.isPlaying = true;
                        updateTrackProgress(directAudioPlayer.currentTime, directAudioPlayer.duration || 0, true);
                    }
                });

                directAudioPlayer.addEventListener('loadedmetadata', () => {
                    if (isDirectAudioPlaying) {
                        directAudioDuration = directAudioPlayer.duration;
                        currentPlayback.duration = directAudioDuration;
                        if (directAudioStartTime > 0) {
                            const latestSafeStart = Number.isFinite(directAudioDuration) && directAudioDuration > 0
                                ? Math.max(0, directAudioDuration - 0.25)
                                : directAudioStartTime;
                            try {
                                directAudioPlayer.currentTime = Math.min(directAudioStartTime, latestSafeStart);
                            } catch (error) {
                                console.warn('Direct Audio: Không thể tiếp tục từ vị trí iframe:', error);
                            }
                        }
                        seekActivePlayerToResumeTarget(true);
                        console.log("Direct Audio Metadata loaded. Duration:", directAudioDuration);
                    }
                });
            }
        }

        function reportDirectStreamFailure(code, message, videoId, songId) {
            let song = null;
            try { song = JSON.parse(localStorage.getItem('dua_current_song') || 'null'); } catch (_) { }
            if (!song || songId == null || String(song.id) !== String(songId)) return;

            const normalizedCode = code || 'direct_stream_failed';
            publishMqtt('overlay_error', {
                message,
                code: normalizedCode,
                videoId,
                songId
            });
            // Iframe đã thất bại và DirectStream cũng không phát được. Gửi đúng
            // player_error để Dashboard dùng chung cơ chế chuyển bài, tránh giữ
            // vĩnh viễn một item ở 0:00.
            publishMqtt('overlay_event', {
                type: 'player_error',
                code: normalizedCode,
                title: song.title || 'YouTube',
                songId,
                provider: 'direct_stream',
                timestamp: Date.now()
            });
        }

        function resolveAndPlayDirectStream(videoId, startTime, expectedSongId = activePlaybackSongId) {
            const normalizedExpectedSongId = expectedSongId == null ? null : String(expectedSongId);
            if (normalizedExpectedSongId !== activePlaybackSongId) {
                console.warn(`Direct Audio: Bỏ yêu cầu cũ của bài ${normalizedExpectedSongId}; bài hiện tại là ${activePlaybackSongId}.`);
                return;
            }
            initDirectAudioPlayer();
            if (!directAudioPlayer) {
                console.error("Direct Audio Player element not found.");
                reportDirectStreamFailure(
                    'direct_stream_player_missing',
                    'Direct Audio Player element not found.',
                    videoId,
                    normalizedExpectedSongId
                );
                return;
            }

            console.log("Resolving direct audio stream for YouTube Video ID:", videoId);

            const streamApiUrl = `/api/yt-stream?videoId=${videoId}`;

            isDirectAudioPlaying = true;
            currentDirectVideoId = videoId;
            currentDirectSongId = normalizedExpectedSongId;
            directAudioStartTime = Math.max(0, Number(startTime) || 0);
            lastSongLoadStartTimestamp = Date.now(); // reset watchdog load timestamp

            // Pause other players
            if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') {
                try { overlayPlayer.pauseVideo(); } catch (e) { }
            }

            fetch(streamApiUrl)
                .then(async response => {
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        const error = new Error(payload.error || `HTTP error! status: ${response.status}`);
                        error.code = payload.code || 'direct_stream_resolution_failed';
                        throw error;
                    }
                    return payload;
                })
                .then(data => {
                    if (!isDirectAudioPlaying
                        || currentDirectVideoId !== videoId
                        || currentDirectSongId !== normalizedExpectedSongId
                        || activePlaybackSongId !== normalizedExpectedSongId) {
                        // Song changed or bypass stopped in the meantime
                        return;
                    }
                    if (data.success && data.url) {
                        console.log(`Successfully resolved direct stream via ${data.resolver || 'yt-dlp'}.`);
                        const activeVol = getAdjustedVolume();
                        directAudioPlayer.volume = activeVol / 100;

                        const beginPlayback = () => directAudioPlayer.play()
                            .then(() => {
                                if (activePlaybackSongId !== normalizedExpectedSongId) {
                                    stopDirectAudioStream();
                                    return;
                                }
                                console.log("Direct stream audio playback started.");
                                currentPlayback.isPlaying = true;
                                activePlaybackHasStarted = true;
                                lastSongLoadStartTimestamp = 0; // stop loading watchdog
                                startVolumeEnforcer();
                            })
                            .catch(err => {
                                if (activePlaybackSongId !== normalizedExpectedSongId) return;
                                console.error("Error playing direct audio stream:", err);
                                stopDirectAudioStream();
                                reportDirectStreamFailure(
                                    'direct_stream_play_failed',
                                    `Direct stream playback failed: ${err.message || err}`,
                                    videoId,
                                    normalizedExpectedSongId
                                );
                            });

                        const isHlsStream = /\.m3u8(?:$|[?#])/i.test(data.url)
                            || /\/manifest\/hls_playlist\//i.test(data.url);
                        if (isHlsStream && window.Hls?.isSupported?.()) {
                            if (directHlsPlayer) {
                                try { directHlsPlayer.destroy(); } catch (_) { }
                            }
                            console.log('Direct stream: phát nguồn HLS qua hls.js.');
                            directHlsPlayer = new window.Hls({
                                enableWorker: false,
                                maxBufferLength: 30,
                                backBufferLength: 15
                            });
                            const hlsForRequest = directHlsPlayer;
                            let hlsRecoveryAttempts = 0;
                            hlsForRequest.on(window.Hls.Events.MANIFEST_PARSED, () => {
                                if (directHlsPlayer !== hlsForRequest
                                    || activePlaybackSongId !== normalizedExpectedSongId) return;
                                beginPlayback();
                            });
                            hlsForRequest.on(window.Hls.Events.ERROR, (_event, details) => {
                                if (!details?.fatal || directHlsPlayer !== hlsForRequest
                                    || activePlaybackSongId !== normalizedExpectedSongId) return;
                                console.error('Direct stream HLS fatal error:', details);
                                if (hlsRecoveryAttempts < 2) {
                                    hlsRecoveryAttempts += 1;
                                    console.warn(`Direct stream HLS: thử phục hồi ${hlsRecoveryAttempts}/2 (${details.type || 'unknown'}).`);
                                    if (details.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                                        try { hlsForRequest.recoverMediaError(); } catch (_) { }
                                    } else {
                                        setTimeout(() => {
                                            if (directHlsPlayer !== hlsForRequest
                                                || activePlaybackSongId !== normalizedExpectedSongId) return;
                                            try { hlsForRequest.startLoad(); } catch (_) { }
                                        }, 500 * hlsRecoveryAttempts);
                                    }
                                    return;
                                }
                                stopDirectAudioStream();
                                reportDirectStreamFailure(
                                    'direct_stream_hls_failed',
                                    `HLS playback failed: ${details.type || 'unknown'} / ${details.details || 'unknown'}`,
                                    videoId,
                                    normalizedExpectedSongId
                                );
                            });
                            hlsForRequest.loadSource(data.url);
                            hlsForRequest.attachMedia(directAudioPlayer);
                        } else {
                            directAudioPlayer.src = data.url;
                            beginPlayback();
                        }
                    } else {
                        const error = new Error(data.error || "Unknown resolution error");
                        error.code = data.code || 'direct_stream_resolution_failed';
                        throw error;
                    }
                })
                .catch(err => {
                    if (activePlaybackSongId !== normalizedExpectedSongId) return;
                    console.error("Failed to resolve direct audio stream:", err);
                    stopDirectAudioStream();
                    reportDirectStreamFailure(
                        err.code || 'direct_stream_resolution_failed',
                        `Direct stream resolution failed: ${err.message || err}`,
                        videoId,
                        normalizedExpectedSongId
                    );
                });
        }

        function tryDirectStreamFallback(reason, videoId, startTime) {
            // Chỉ fallback ở lỗi iframe xác thực. Mặc định bật để xử lý 101/150;
            // streamer vẫn có thể tắt hẳn tại Dashboard.
            const bypassEnabled = localStorage.getItem('dua_yt_bypass_enabled') !== 'false';
            const resolvedVideoId = videoId || currentVideoId;
            const fallbackSongId = activePlaybackSongId;
            if (!bypassEnabled || !resolvedVideoId || fallbackSongId == null) return false;

            // onError/watchdog của iframe có thể báo lặp trong lúc yt-dlp đang
            // resolve hoặc thẻ audio đang chuẩn bị phát. Đây vẫn là lỗi đã được
            // DirectStream xử lý; trả true để caller không phát thêm player_error
            // và khiến Dashboard skip mất bài hiện tại.
            if (isDirectAudioPlaying
                && String(currentDirectSongId) === String(fallbackSongId)
                && String(currentDirectVideoId) === String(resolvedVideoId)) {
                console.log(`Overlay Player: Bỏ lỗi iframe lặp; DirectStream đang xử lý ${resolvedVideoId}.`);
                return true;
            }
            if (directFallbackAttemptedSongId === fallbackSongId) return false;
            directFallbackAttemptedSongId = fallbackSongId;
            console.warn(`Overlay Player: Chuyển sang DirectStream (${reason}) cho ${resolvedVideoId}.`);
            stuckStateStartTime = null;
            lastSongLoadStartTimestamp = 0;
            let fallbackStart = Math.max(0, Number(startTime) || 0);
            try {
                const iframeVideoData = overlayPlayer?.getVideoData?.() || {};
                const iframeVideoId = String(iframeVideoData.video_id || currentVideoId || '');
                const iframeTime = Math.max(0, Number(overlayPlayer?.getCurrentTime?.()) || 0);
                if (iframeVideoId === String(resolvedVideoId) && iframeTime > fallbackStart) {
                    fallbackStart = iframeTime;
                }
            } catch (_) { }
            resolveAndPlayDirectStream(resolvedVideoId, fallbackStart, fallbackSongId);
            return true;
        }

        function stopDirectAudioStream() {
            isDirectAudioPlaying = false;
            currentDirectVideoId = null;
            currentDirectSongId = null;
            directAudioStartTime = 0;
            if (directHlsPlayer) {
                const hlsToDestroy = directHlsPlayer;
                directHlsPlayer = null;
                try { hlsToDestroy.destroy(); } catch (_) { }
            }
            if (directAudioPlayer) {
                try {
                    directAudioPlayer.pause();
                    directAudioPlayer.src = '';
                } catch (e) { }
            }
        }

        // Hàm khởi tạo iframe trình phát YouTube
        // `medium` là mức 360p theo YouTube IFrame API. YT có thể hạ thấp hơn nếu
        // mạng/video không có 360p, nhưng không được yêu cầu nâng lên HD.
        const YOUTUBE_MAX_PLAYBACK_QUALITY = 'medium';
        const YOUTUBE_QUALITY_LABELS = Object.freeze({
            tiny: '144p',
            small: '240p',
            medium: '360p',
            large: '480p',
            hd720: '720p',
            hd1080: '1080p',
            highres: 'cao hơn 1080p',
            auto: 'tự động',
            default: 'mặc định',
            unknown: 'chưa xác định'
        });

        function getIframePlaybackQualitySnapshot(player = overlayPlayer) {
            if (!player) return { quality: 'unknown', label: YOUTUBE_QUALITY_LABELS.unknown, available: [] };
            try {
                const quality = String(player.getPlaybackQuality?.() || 'unknown');
                const available = Array.isArray(player.getAvailableQualityLevels?.())
                    ? player.getAvailableQualityLevels()
                    : [];
                const videoId = String(player.getVideoData?.()?.video_id || currentVideoId || '');
                const iframe = player.getIframe?.();
                return {
                    videoId,
                    quality,
                    label: YOUTUBE_QUALITY_LABELS[quality] || quality,
                    available,
                    playerSize: iframe ? `${iframe.clientWidth || 0}x${iframe.clientHeight || 0}` : 'unknown'
                };
            } catch (error) {
                return { quality: 'unknown', label: YOUTUBE_QUALITY_LABELS.unknown, available: [], error: error?.message || String(error) };
            }
        }

        function logIframePlaybackQuality(reason = 'manual', player = overlayPlayer) {
            const snapshot = getIframePlaybackQualitySnapshot(player);
            console.info(`[Iframe Quality] ${reason}: ${snapshot.label} (${snapshot.quality})`, snapshot);
            return snapshot;
        }

        // Dùng trực tiếp trong DevTools của Overlay: debugIframePlaybackQuality().
        window.debugIframePlaybackQuality = () => logIframePlaybackQuality('manual');

        function enforceIframePlaybackQuality(player) {
            try {
                if (player && typeof player.setPlaybackQuality === 'function') {
                    player.setPlaybackQuality(YOUTUBE_MAX_PLAYBACK_QUALITY);
                }
            } catch (e) {
                console.warn("Overlay Player: Không thể đặt chất lượng tối đa 360p:", e);
            }
        }

        function initOverlayPlayer(videoId, startTime, expectedSongId = activePlaybackSongId) {
            const playerSongId = expectedSongId == null ? null : String(expectedSongId);
            lastSongLoadStartTimestamp = Date.now();
            currentVideoId = videoId; // Set currentVideoId to avoid double loading in updateOverlayUI
            lastCommandType = 'play'; // Đặt lệnh mặc định về play khi khởi tạo mới
            if (overlayPlayer) {
                try {
                    overlayPlayer.destroy();
                } catch (e) {
                    console.error("Error destroying player:", e);
                }
                overlayPlayer = null;
            }

            const playerVars = {
                'autoplay': 1,
                'start': Math.floor(Math.max(0, Number(startTime) || 0)),
                'controls': 1,
                'modestbranding': 1,
                'rel': 0,
                'allowfullscreen': 1,
                // Gợi ý 360p ngay khi iframe khởi tạo; enforceIframePlaybackQuality
                // tiếp tục áp dụng khi player sẵn sàng/chuyển sang PLAYING.
                'vq': YOUTUBE_MAX_PLAYBACK_QUALITY
            };
            // YouTube IFrame API cần biết origin thật của trang chủ để xác thực lệnh
            // postMessage. Không truyền "null" khi Overlay được mở từ file://.
            if (/^https?:\/\//i.test(String(window.location?.origin || ''))) {
                playerVars.origin = window.location.origin;
            }

            overlayPlayer = new YT.Player('obs-youtube-placeholder', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars,
                'onReady': (event) => {
                    if (playerSongId !== activePlaybackSongId) {
                        try { event.target.destroy(); } catch (_) { }
                        return;
                    }
                    // Cập nhật targetVolume từ localStorage (phòng trường hợp thay đổi trong lúc chờ)
                    targetVolume = localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : targetVolume;
                    applyTargetVolume();
                    event.target.seekTo(startTime || 0, true);

                    enforceIframePlaybackQuality(event.target);
                    setTimeout(() => {
                        if (event.target === overlayPlayer) logIframePlaybackQuality('ready', event.target);
                    }, 1200);

                    if (warningCountdownInterval) {
                        try { event.target.pauseVideo(); } catch (e) { }
                    } else {
                        event.target.playVideo();
                        seekActivePlayerToResumeTarget(true);
                        startVolumeEnforcer(); // Bắt đầu ép volume liên tục
                        startPlaybackMonitor();
                    }
                },
                'onStateChange': event => onPlayerStateChange(event, playerSongId),
                'onPlaybackQualityChange': event => {
                    if (playerSongId === activePlaybackSongId) {
                        logIframePlaybackQuality(`quality-change:${event.data || 'unknown'}`, event.target);
                    }
                },
                'onError': (event) => {
                    if (playerSongId !== activePlaybackSongId) {
                        console.warn(`Overlay Player: Bỏ lỗi từ player cũ của bài ${playerSongId}.`);
                        return;
                    }
                    console.error('Overlay Player: Lỗi tải video YouTube.', {
                        code: event.data,
                        videoId: currentVideoId || videoId,
                        origin: playerVars.origin || '(không có origin HTTP)'
                    });

                    if (event.data === 150 || event.data === 101 || event.data === 153 || event.data === 2 || event.data === 5 || event.data === 100) {
                        console.log("Overlay Player: Kích hoạt chế độ phát nhạc dự phòng bằng Direct Stream...");
                        let currentId = currentVideoId || videoId;
                        let currentStart = startTime || 0;
                        try {
                            const songRaw = localStorage.getItem('dua_current_song');
                            if (songRaw) {
                                const songObj = JSON.parse(songRaw);
                                if (songObj.videoId) currentId = songObj.videoId;
                                currentStart = getSongPlaybackStart(songObj);
                            }
                        } catch (e) { }
                        if (tryDirectStreamFallback(`YouTube error ${event.data}`, currentId, currentStart)) return;
                    }

                    console.log("Overlay Player: Tự động chuyển bài tiếp theo...");
                    let songTitle = "Không rõ";
                    try {
                        const songRaw = localStorage.getItem('dua_current_song');
                        if (songRaw) {
                            const songObj = JSON.parse(songRaw);
                            songTitle = songObj.title || "Không rõ";
                        }
                    } catch (e) { }

                    const errorPayload = {
                        type: 'player_error',
                        code: event.data,
                        title: songTitle,
                        songId: playerSongId,
                        timestamp: Date.now()
                    };

                    publishMqtt('overlay_event', errorPayload);

                    stopVolumeEnforcer();
                }
            });
        }

        function executeControlCommand(command) {
            if (command.type === 'resume') {
                const details = command.value && typeof command.value === 'object'
                    ? command.value
                    : { position: command.value };
                const target = Math.max(0, Number(details.position) || 0);
                let currentSongId = null;
                try {
                    currentSongId = JSON.parse(localStorage.getItem('dua_current_song') || 'null')?.id ?? null;
                } catch (_) { }
                if (target <= 0 || (details.songId != null && currentSongId != null
                    && String(details.songId) !== String(currentSongId))) {
                    return;
                }

                if (resumeTimeoutId) {
                    clearTimeout(resumeTimeoutId);
                    resumeTimeoutId = null;
                }
                localIsResuming = true;
                resumeTargetTime = target;
                hasSeekedForResume = false;
                lastResumeSeekAttemptAt = 0;
                lastCommandType = 'play';
                toggleResumingState(true);
                updateOverlayUI();
                seekActivePlayerToResumeTarget(true);
                return;
            }

            // `waiting_resume` intentionally blocks UI updates while Dashboard asks
            // for a decision. The following play command is the authoritative
            // decision signal; clear the block before routing it to a player.
            // Otherwise a new current_song payload can remain hidden forever.
            if (command.type === 'play' && lastCommandType === 'waiting_resume') {
                lastCommandType = 'play';
                updateOverlayUI();
            }

            if (command.type === 'extended') {
                const details = command.value;
                if (details) {
                    const seconds = Number(details.seconds) || 360;
                    const mins = (seconds / 60).toFixed(1).replace(/\.0$/, '');

                    // Hide the extension container immediately
                    const extContainerGlobal = document.getElementById('obs-extension-code-container');
                    if (extContainerGlobal) {
                        extContainerGlobal.style.display = 'none';
                    }
                    const widget = document.getElementById('obs-player-widget');
                    if (widget) {
                        widget.classList.remove('obs-ext-active');
                    }

                    // Trigger the drawer success toast
                    triggerExtensionSuccessToast(mins);
                }
                return;
            }

            // Nếu đang trong quá trình đếm ngược cảnh báo nhạy cảm, chặn các lệnh play/seek/resume để tránh rò rỉ âm thanh
            if (warningCountdownInterval && (command.type === 'play' || command.type === 'seek')) {
                console.log("Overlay: Đang đếm ngược cảnh báo nhạy cảm, bỏ qua lệnh điều khiển:", command.type);
                return;
            }

            if (command.type === 'set_dolby_atmos') {
                const enabled = command.value === true || command.value === 'true';
                localStorage.setItem('dua_dolby_atmos_enabled', enabled ? 'true' : 'false');
                if (window.dolbyAtmosEngine) {
                    window.dolbyAtmosEngine.setEnabled(enabled);
                }
                return;
            }

            if (command.type === 'set_adaptive_volume') {
                console.log("[Overlay] Nhận lệnh set_adaptive_volume:", command.value);
                const enabled = command.value === true || command.value === 'true';
                localStorage.setItem('dua_adaptive_volume_enabled', enabled ? 'true' : 'false');

                if (enabled && currentVideoId) {
                    fetchLoudnessDb(currentVideoId);
                } else if (!enabled) {
                    currentLoudnessDb = null;
                }

                applyTargetVolume();
                return;
            }

            if (command.type === 'set_adaptive_offset') {
                console.log("[Overlay] Nhận lệnh set_adaptive_offset:", command.value);
                const offsetVal = parseFloat(command.value);
                if (!isNaN(offsetVal)) {
                    localStorage.setItem('dua_adaptive_loudness_offset', offsetVal);
                    applyTargetVolume();
                }
                return;
            }

            if (command.type === 'volume') {
                // Ignore malformed commands. Falling back here can unexpectedly
                // change the player's volume during a queue update.
                if (!syncTargetVolume(command.value)) return;

                // Đồng bộ âm lượng sang SoundCloud widget
                if (soundCloudWidget) {
                    try { soundCloudWidget.setVolume(targetVolume); } catch (e) { }
                }
                return;
            } else if (command.type === 'reload') {
                console.log("Overlay: Nhận lệnh tải lại trang (reload)...");
                window.location.reload();
                return;
            } else if (command.type === 'waiting_resume') {
                // Dashboard đang hỏi người dùng về tiến trình bài hát — tạm dừng và hiển thị thông báo chờ
                const songTitle = command.value || '';
                lastCommandType = 'waiting_resume'; // Set this to prevent auto-play enforcer
                try {
                    if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') overlayPlayer.pauseVideo();
                    if (soundCloudWidget) soundCloudWidget.pause();
                    if (spotifyEmbedController) spotifyEmbedController.pause();
                    if (directAudioPlayer) directAudioPlayer.pause();
                } catch (e) { }
                // Hiện overlay chờ với nội dung phù hợp
                const waitWidget = document.getElementById('obs-player-widget');
                const waitOverlay = document.getElementById('obs-empty-overlay');
                if (waitWidget && waitOverlay) {
                    stopIdleSlideshow(waitOverlay);
                    waitWidget.classList.add('active');
                    waitWidget.style.display = '';
                    waitOverlay.classList.add('active', 'focus-active');
                    waitOverlay.innerHTML = '<div class="obs-waiting-resume-content"><span class="obs-loading-spinner" aria-hidden="true"></span><span>Đang chờ tiếp tục...</span></div>';
                    adjustEmptyOverlayFontSize(waitOverlay, waitOverlay.textContent);
                }
                return;
            }

            // Dashboard là nguồn quyết định trạng thái phát của bài trong app.
            // Ghi nhận trước khi định tuyến để SoundCloud/Spotify hoặc player chưa
            // khởi tạo vẫn chuyển đúng sang media trình duyệt khi pause/stop.
            if (command.type === 'play' || command.type === 'pause' || command.type === 'stop') {
                lastCommandType = command.type;
            }

            // Định cấu hình định tuyến lệnh theo nguồn nhạc
            let songType = 'youtube';
            try {
                const songRaw = localStorage.getItem('dua_current_song');
                if (songRaw) {
                    const song = JSON.parse(songRaw);
                    songType = song.type || 'youtube';
                }
            } catch (e) { }

            if (command.type === 'seek') {
                // Tua thủ công thay thế hoàn toàn yêu cầu "Phát tiếp" cũ.
                // Nếu giữ localIsResuming, watchdog resume sẽ kéo playhead trở
                // lại resumeTargetTime ngay sau khi người dùng vừa tua xong.
                if (resumeTimeoutId) {
                    clearTimeout(resumeTimeoutId);
                    resumeTimeoutId = null;
                }
                localIsResuming = false;
                resumeTargetTime = 0;
                hasSeekedForResume = true;
                lastResumeSeekAttemptAt = 0;
                toggleResumingState(false);
                currentPlayback.currentTime = Math.max(0, Number(command.value) || 0);
            }

            if (songType === 'spotify') {
                if (!spotifyEmbedController) return;
                if (command.type === 'play') {
                    if (!currentPlayback.isPlaying) {
                        try { spotifyEmbedController.play(); } catch (e) { }
                    }
                } else if (command.type === 'pause') {
                    if (currentPlayback.isPlaying) {
                        try { spotifyEmbedController.pause(); } catch (e) { }
                    }
                } else if (command.type === 'seek') {
                    try { spotifyEmbedController.seek(command.value); } catch (e) { }
                } else if (command.type === 'stop') {
                    try { spotifyEmbedController.pause(); } catch (e) { }
                }
            } else if (songType === 'soundcloud') {
                if (!soundCloudWidget) return;
                if (command.type === 'play') {
                    if (!currentPlayback.isPlaying) {
                        try { soundCloudWidget.play(); } catch (e) { }
                    }
                } else if (command.type === 'pause') {
                    if (currentPlayback.isPlaying) {
                        try { soundCloudWidget.pause(); } catch (e) { }
                    }
                } else if (command.type === 'seek') {
                    try { soundCloudWidget.seekTo(command.value * 1000); } catch (e) { } // SoundCloud nhận mili giây
                } else if (command.type === 'stop') {
                    try { soundCloudWidget.pause(); } catch (e) { }
                }
            } else {
                // YouTube
                if (isDirectAudioPlaying && directAudioPlayer) {
                    if (command.type === 'play') {
                        directAudioPlayer.play().catch(e => console.error("directAudioPlayer.play error:", e));
                        lastCommandType = 'play';
                    } else if (command.type === 'pause') {
                        directAudioPlayer.pause();
                        lastCommandType = 'pause';
                    } else if (command.type === 'seek') {
                        const wasPlaying = !directAudioPlayer.paused;
                        const directDuration = normalizePlaybackDuration(directAudioPlayer.duration);
                        const requestedTime = Math.max(0, Number(command.value) || 0);
                        if (directDuration > 0 && requestedTime >= directDuration - 0.5) {
                            lastCommandType = 'play';
                            triggerEndedEvent();
                            return;
                        }
                        directAudioPlayer.currentTime = directDuration > 0
                            ? Math.min(requestedTime, Math.max(0, directDuration - 0.5))
                            : requestedTime;
                        lastCommandType = wasPlaying ? 'play' : 'pause';
                    } else if (command.type === 'stop') {
                        stopDirectAudioStream();
                        lastCommandType = 'stop';
                    }
                    return;
                }

                if (!overlayPlayer || typeof overlayPlayer.getPlayerState !== 'function') return;
                const playerState = overlayPlayer.getPlayerState();
                if (command.type === 'play') {
                    if (playerState !== YT.PlayerState.PLAYING) {
                        overlayPlayer.playVideo();
                    }
                    lastCommandType = 'play';
                } else if (command.type === 'pause') {
                    if (playerState !== YT.PlayerState.PAUSED) {
                        overlayPlayer.pauseVideo();
                    }
                    lastCommandType = 'pause';
                } else if (command.type === 'seek') {
                    const wasPlaying = playerState === YT.PlayerState.PLAYING
                        || playerState === YT.PlayerState.BUFFERING;
                    const iframeDuration = normalizePlaybackDuration(overlayPlayer.getDuration?.());
                    const requestedTime = Math.max(0, Number(command.value) || 0);
                    if (iframeDuration > 0 && requestedTime >= iframeDuration - 0.5) {
                        lastCommandType = 'play';
                        triggerEndedEvent();
                        return;
                    }
                    overlayPlayer.seekTo(
                        iframeDuration > 0 ? Math.min(requestedTime, Math.max(0, iframeDuration - 0.5)) : requestedTime,
                        true
                    );
                    lastCommandType = wasPlaying ? 'play' : 'pause';
                } else if (command.type === 'stop') {
                    try { overlayPlayer.stopVideo(); } catch (e) { }
                    lastCommandType = 'stop';
                }
            }
        }

        // Kiểm tra lệnh điều khiển từ dashboard gửi sang
        function startPlaybackMonitor() {
            if (playbackMonitorInterval) clearInterval(playbackMonitorInterval);

            playbackMonitorInterval = setInterval(() => {
                if (isLuckyRolling) return;
                if (isDirectAudioPlaying) return;
                if (!overlayPlayer || typeof overlayPlayer.getCurrentTime !== 'function') return;

                try {
                    const playerState = overlayPlayer.getPlayerState();
                    const observedCurrentTime = Math.max(0, Number(overlayPlayer.getCurrentTime()) || 0);
                    const progressNow = Date.now();
                    if (playerState === YT.PlayerState.PLAYING && lastCommandType === 'play') {
                        if (!iframeLastProgressAt || Math.abs(observedCurrentTime - iframeLastObservedTime) >= 0.05) {
                            iframeLastObservedTime = observedCurrentTime;
                            iframeLastProgressAt = progressNow;
                            iframePlaybackStalled = false;
                        } else if (progressNow - iframeLastProgressAt >= 1000) {
                            iframePlaybackStalled = true;
                        }
                    } else {
                        iframeLastObservedTime = observedCurrentTime;
                        iframeLastProgressAt = progressNow;
                        iframePlaybackStalled = false;
                    }
                    if (localIsResuming && resumeTargetTime > 0) {
                        if (observedCurrentTime >= resumeTargetTime - 1.5) {
                            localIsResuming = false;
                            hasSeekedForResume = true;
                            toggleResumingState(false);
                            applyTargetVolume();
                        } else {
                            seekActivePlayerToResumeTarget();
                        }
                    }
                    if (playerState === YT.PlayerState.PLAYING || observedCurrentTime > 0.5) {
                        activePlaybackHasStarted = true;
                    }

                    // State-change messages can be missed while Dashboard or the
                    // local socket reconnects. Keep publishing BUFFERING for the
                    // whole interruption, not only on the first YouTube callback.
                    const observedDuration = normalizePlaybackDuration(overlayPlayer.getDuration?.());
                    if (playerState === YT.PlayerState.BUFFERING) {
                        publishOverlayPlaybackState({
                            currentTime: observedCurrentTime,
                            duration: observedDuration,
                            isLive: isLiveStream,
                            isPlaying: false,
                            isBuffering: true
                        });
                    }

                    // SponsorBlock must keep watching the iframe independently of
                    // the PLAYING branch below. YouTube can temporarily enter
                    // BUFFERING/CUED while processing seekTo, and may ignore the
                    // first seek issued immediately after onReady.
                    if (!isLiveStream && !isResumeSeekInProgress()) {
                        skipSponsorBlockSegment(observedCurrentTime, observedDuration, activePlaybackSongId, targetTime => {
                            overlayPlayer.seekTo(targetTime, true);
                            if (playerState !== YT.PlayerState.PLAYING
                                && typeof overlayPlayer.playVideo === 'function') {
                                overlayPlayer.playVideo();
                            }
                        });
                    }

                    // Polling is a fallback for OBS/CEF occasionally dropping the
                    // corresponding onStateChange callback at the end of a video.
                    if (playerState === YT.PlayerState.ENDED) {
                        if (!activePlaybackHasStarted) {
                            console.warn('Overlay Player: Polling bỏ ENDED cũ vì bài hiện tại chưa bắt đầu phát.');
                            return;
                        }
                        triggerEndedEvent();
                        return;
                    }

                    // OBS/CEF occasionally reports PAUSED, BUFFERING, CUED or
                    // UNSTARTED at the real media tail and never emits ENDED.
                    // Resolve that terminal state before the stall watchdog can
                    // retry the iframe and eventually restart via DirectStream.
                    if (playerState !== YT.PlayerState.PLAYING && isIframeAtNaturalEnd(overlayPlayer)) {
                        console.log(`Overlay Player: Trạng thái ${playerState} tại cuối bài; xác nhận kết thúc từ Overlay.`);
                        triggerEndedEvent();
                        return;
                    }

                    // Watchdog: Nếu đang ở trạng thái PLAY nhưng player bị đứng ở UNSTARTED, BUFFERING hoặc CUED quá 15 giây
                    if (lastCommandType === 'play' &&
                        (playerState === YT.PlayerState.UNSTARTED ||
                            playerState === YT.PlayerState.BUFFERING ||
                            playerState === YT.PlayerState.CUED)) {

                        if (!stuckStateStartTime) {
                            stuckStateStartTime = Date.now();
                        }

                        const timeStuck = Date.now() - stuckStateStartTime;
                        if (timeStuck > 30000) {
                            console.error(`Overlay Player: Watchdog phát hiện trạng thái ${playerState} kéo dài ${timeStuck}ms.`);

                            // Reset stuck/load timestamps
                            stuckStateStartTime = null;
                            lastSongLoadStartTimestamp = 0;

                            // Một bài đã vào PLAYING chỉ đang buffer tạm thời. Không
                            // được dừng iframe để đổi nguồn đúng tại mốc 30 giây.
                            if (activePlaybackHasStarted) {
                                console.warn('Overlay Player: Bài đã phát thành công; giữ iframe và chờ buffer hồi phục.');
                                try { overlayPlayer.playVideo(); } catch (_) { }
                                return;
                            }

                            let songTitle = "Không rõ";
                            try {
                                const songRaw = localStorage.getItem('dua_current_song');
                                if (songRaw) {
                                    const songObj = JSON.parse(songRaw);
                                    songTitle = songObj.title || "Không rõ";
                                }
                            } catch (e) { }

                            let fallbackId = currentVideoId;
                            let fallbackStart = 0;
                            try {
                                const songRaw = localStorage.getItem('dua_current_song');
                                if (songRaw) {
                                    const songObj = JSON.parse(songRaw);
                                    fallbackId = songObj.videoId || fallbackId;
                                    fallbackStart = getSongPlaybackStart(songObj);
                                }
                            } catch (_) { }
                            if (tryDirectStreamFallback(`iframe stuck in state ${playerState}`, fallbackId, fallbackStart)) {
                                stopVolumeEnforcer();
                                return;
                            }
                            const errorPayload = {
                                type: 'player_error', code: 150, title: songTitle, timestamp: Date.now()
                            };
                            publishMqtt('overlay_event', errorPayload);
                            stopVolumeEnforcer();
                            // A stalled iframe is a playback error, not an ended song.
                            // Keep the queue item so the user can retry or skip it explicitly.
                            return;
                        }
                    } else {
                        stuckStateStartTime = null;
                    }

                    if (playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.PAUSED) {
                        const currentTime = overlayPlayer.getCurrentTime();
                        // PAUSED tại 0:00 có thể chính là trạng thái YouTube dùng
                        // khi chặn embed. Chỉ tắt watchdog sau khi có bằng chứng
                        // player đã thực sự chạy.
                        if (playerState === YT.PlayerState.PLAYING
                            || activePlaybackHasStarted
                            || (Number(currentTime) || 0) > 0.5) {
                            lastSongLoadStartTimestamp = 0;
                        }
                        const duration = normalizePlaybackDuration(overlayPlayer.getDuration());
                        // Detect live stream chính xác qua YouTube API & tự động lấy author nếu thiếu
                        try {
                            const vd = overlayPlayer.getVideoData ? overlayPlayer.getVideoData() : {};
                            isLiveStream = !!(vd && vd.isLive);
                            if (vd && vd.author && data && (!data.author || data.author !== vd.author)) {
                                data.author = vd.author;
                                const channelNameEl = document.getElementById('obs-channel-name');
                                const channelNameContainer = document.getElementById('obs-channel-name-container');
                                if (channelNameEl) {
                                    if (channelNameContainer) {
                                        applyMarquee(channelNameContainer, channelNameEl, vd.author, 40);
                                    } else {
                                        channelNameEl.textContent = vd.author;
                                    }
                                }
                            }
                        } catch (e) {
                            isLiveStream = (!duration || duration <= 0);
                        }
                        const isLive = isLiveStream;

                        // An toàn: kiểm tra volume thực tế, sửa nếu lệch khỏi volume mục tiêu (đã tính thích ứng)
                        if (typeof overlayPlayer.getVolume === 'function') {
                            const actualVol = overlayPlayer.getVolume();
                            const expectedVol = getAdjustedVolume();
                            if (Math.abs(actualVol - expectedVol) > 1) {
                                console.warn(`[Volume Guard] Phát hiện volume lệch: thực tế=${actualVol}%, mục tiêu=${expectedVol}% → sửa lại`);
                                try { overlayPlayer.setVolume(expectedVol); } catch (e) { }
                            }
                        }

                        const isPlaying = playerState === YT.PlayerState.PLAYING;
                        const now = Date.now();

                        // Cập nhật livePlayTime cho Live Stream
                        if (isLive) {
                            if (isPlaying) {
                                if (lastLiveTickTimestamp) {
                                    livePlayTime += (now - lastLiveTickTimestamp) / 1000;
                                }
                                lastLiveTickTimestamp = now;
                            } else {
                                lastLiveTickTimestamp = null;
                            }
                        } else {
                            livePlayTime = currentTime;
                        }

                        publishOverlayPlaybackState({
                            currentTime: isLive ? livePlayTime : currentTime,
                            duration: isLive ? 0 : duration,
                            isLive,
                            isPlaying,
                            isBuffering: iframePlaybackStalled
                        });

                        // 2. Kiểm tra mốc kết thúc bài do cấu hình hoặc giới hạn thời gian phát tối đa
                        const currentSongRaw = localStorage.getItem('dua_current_song');
                        if (currentSongRaw) {
                            try {
                                const song = JSON.parse(currentSongRaw);

                                const naturalEndTolerance = isPlaying ? 0.5 : 1.5;
                                if (!isLive && duration > 0 && lastCommandType === 'play' && currentTime > 0 && duration - currentTime <= naturalEndTolerance) {
                                    triggerEndedEvent();
                                    return;
                                }

                                let elapsedTime;
                                let limitDuration;
                                let actualPlayDuration;

                                if (isLive) {
                                    elapsedTime = livePlayTime;
                                    let limit = 0;
                                    if (song.end && song.end > 0) {
                                        limit = song.end;
                                    }
                                    const maxDur = getEffectiveSongMaxDuration(song);
                                    if (maxDur > 0) {
                                        if (limit > 0) {
                                            limit = Math.min(limit, maxDur);
                                        } else {
                                            limit = maxDur;
                                        }
                                    }
                                    limitDuration = limit;
                                    actualPlayDuration = limit;
                                } else {
                                    let startPoint = song.start || 0;
                                    limitDuration = duration;
                                    if (song.end && song.end > startPoint) {
                                        limitDuration = Math.min(limitDuration, song.end);
                                    }
                                    const maxDur = getEffectiveSongMaxDuration(song);
                                    if (maxDur > 0) {
                                        limitDuration = Math.min(limitDuration, startPoint + maxDur);
                                    }
                                    actualPlayDuration = Math.max(1, limitDuration - startPoint);
                                    elapsedTime = currentTime - startPoint;
                                }

                                const remainingTime = limitDuration > 0 ? (actualPlayDuration - elapsedTime) : 999999;
                                currentRemainingTime = remainingTime;

                                // Gỡ lỗi thời gian thực (in ra console để dễ debug)
                                if (limitDuration > 0 && remainingTime <= 15 && remainingTime >= -1) {
                                    if (!window.lastDebugTime || Date.now() - window.lastDebugTime >= 1000) {
                                        console.log(`[DEBUG DRAWER] Time limit: ${limitDuration}s, Duration: ${duration.toFixed(1)}s, Remaining Time: ${remainingTime.toFixed(1)}s, Next Song Title: "${song.nextSongTitle || 'null'}"`);
                                        window.lastDebugTime = Date.now();
                                    }
                                }

                                updateNextSongSequence(remainingTime, song);

                                if (isLive) {
                                    if (limitDuration > 0 && elapsedTime >= limitDuration) {
                                        console.log(`Overlay (Live): Đã phát đạt giới hạn thời gian tối đa cấu hình (${limitDuration}s). Chuyển bài tiếp theo...`);
                                        triggerEndedEvent();
                                        return;
                                    }
                                } else {
                                    // Kiểm tra mốc kết thúc tùy chỉnh của bài hát
                                    if (song.end && currentTime >= song.end - 0.35) {
                                        triggerEndedEvent();
                                        return;
                                    }

                                    // Kiểm tra giới hạn thời gian phát tối đa toàn cục
                                    const maxDur = getEffectiveSongMaxDuration(song);
                                    if (maxDur > 0) {
                                        if (elapsedTime >= maxDur - 0.35) {
                                            console.log(`Overlay: Đã phát đạt giới hạn thời gian tối đa cấu hình (${maxDur}s). Chuyển bài tiếp theo...`);
                                            triggerEndedEvent();
                                            return;
                                        }
                                    }

                                }
                            } catch (e) { }
                        }

                    }
                } catch (e) {
                    console.warn("Thử đọc trạng thái player khi đang tải:", e);
                }

            }, 250);
        }

        function triggerEndedEvent(reason = 'natural_end', expectedSongId = null) {
            // Kiểm tra xem có đang ở chế độ Lucky và chưa quay số không
            let isLuckyMode = false;
            let currentSong = null;
            try {
                const songRaw = localStorage.getItem('dua_current_song');
                if (songRaw) {
                    currentSong = JSON.parse(songRaw);
                    isLuckyMode = (currentSong.luckyMode === true || localStorage.getItem('dua_lucky_mode') === 'true');
                }
            } catch (e) { }

            if (!currentSong || currentSong.id == null) {
                console.warn(`Overlay: Bỏ tín hiệu ended (${reason}) vì không có bài hiện tại.`);
                return;
            }

            const currentSongId = String(currentSong.id);
            const normalizedExpectedSongId = expectedSongId == null ? null : String(expectedSongId);
            if (normalizedExpectedSongId !== null && normalizedExpectedSongId !== currentSongId) {
                console.warn(`Overlay: Bỏ tín hiệu ended cũ (${reason}) của bài ${normalizedExpectedSongId}; bài hiện tại là ${currentSongId}.`);
                return;
            }
            if (activePlaybackSongId !== null && activePlaybackSongId !== currentSongId) {
                console.warn(`Overlay: Bỏ tín hiệu ended (${reason}) vì player ${activePlaybackSongId} không khớp payload ${currentSongId}.`);
                return;
            }

            if (isLuckyMode && !luckyRollCompleted && !isLuckyRolling && currentSong && currentSong.nextSongTitle) {
                isLuckyRolling = true;
                luckyRollCurrentSongId = currentSong.id;

                // Tạm dừng phát tất cả các player ngay lập tức để quay số
                try {
                    if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') overlayPlayer.pauseVideo();
                    if (soundCloudWidget) soundCloudWidget.pause();
                    if (spotifyEmbedController) spotifyEmbedController.pause();
                    if (directAudioPlayer) directAudioPlayer.pause();
                } catch (e) { }
                stopDirectAudioStream();

                // Tìm bài hát thắng cuộc
                let queue = [];
                try {
                    const rawQueue = localStorage.getItem('dua_queue');
                    if (rawQueue) queue = JSON.parse(rawQueue);
                } catch (e) { }

                let winningSong = null;
                if (currentSong.nextSongId && Array.isArray(queue)) {
                    winningSong = queue.find(s => s && String(s.id) === String(currentSong.nextSongId));
                }
                if (!winningSong) {
                    winningSong = {
                        id: currentSong.nextSongId,
                        title: currentSong.nextSongTitle,
                        donorName: currentSong.nextSongDonor,
                        amount: currentSong.nextSongAmount,
                        isOwnerAdd: currentSong.nextSongIsOwnerAdd,
                        thumbnail: currentSong.nextSongThumbnail,
                        type: currentSong.nextSongType,
                        videoId: currentSong.nextSongVideoId
                    };
                }

                // Chạy hiệu ứng quay số
                runLuckyRollAnimation(winningSong);
                return; // Thoát sớm, chưa gửi sự kiện ended
            }

            const endedSongId = currentSongId;
            if (endedSignalSongId === endedSongId) return;
            endedSignalSongId = endedSongId;

            if (playbackMonitorInterval) {
                clearInterval(playbackMonitorInterval);
                playbackMonitorInterval = null;
            }

            const eventId = 'ended_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const endedPayload = {
                type: 'ended',
                eventId: eventId,
                songId: currentSong.id,
                reason,
                timestamp: Date.now()
            };

            // Overlay là nguồn duy nhất xác nhận kết bài qua realtime changefeed.
            publishMqtt('overlay_event', endedPayload);
        }

        function onPlayerStateChange(event, expectedSongId = activePlaybackSongId) {
            const playerSongId = expectedSongId == null ? null : String(expectedSongId);
            if (playerSongId !== activePlaybackSongId) {
                console.warn(`Overlay Player: Bỏ state ${event.data} từ player cũ của bài ${playerSongId}.`);
                return;
            }
            // Luôn áp dụng targetVolume ở mọi sự kiện trạng thái
            applyTargetVolume();

            // Publish state transitions immediately so Dashboard can distinguish
            // a real mid-track buffer from pause/loading heuristics.
            if (event.data === YT.PlayerState.PLAYING
                || event.data === YT.PlayerState.BUFFERING
                || event.data === YT.PlayerState.PAUSED) {
                let currentTime = 0;
                let duration = 0;
                try {
                    currentTime = Math.max(0, Number(event.target.getCurrentTime?.()) || 0);
                    duration = normalizePlaybackDuration(event.target.getDuration?.());
                } catch (_) { }
                if (event.data === YT.PlayerState.PLAYING) {
                    iframeLastObservedTime = currentTime;
                    iframeLastProgressAt = Date.now();
                    iframePlaybackStalled = false;
                } else if (event.data === YT.PlayerState.PAUSED) {
                    iframePlaybackStalled = false;
                }
                publishOverlayPlaybackState({
                    currentTime,
                    duration,
                    isLive: isLiveStream,
                    isPlaying: event.data === YT.PlayerState.PLAYING,
                    isBuffering: event.data === YT.PlayerState.BUFFERING
                }, true);
            }

            if (event.data === YT.PlayerState.ENDED) {
                if (!activePlaybackHasStarted) {
                    console.warn('Overlay Player: Bỏ ENDED cũ vì bài hiện tại chưa bắt đầu phát.');
                    return;
                }
                stopVolumeEnforcer();
                triggerEndedEvent('youtube_ended', playerSongId);
            } else if (event.data === YT.PlayerState.PLAYING) {
                lastSongLoadStartTimestamp = 0;
                activePlaybackHasStarted = true;
                // onReady can race with a repeated current_song render and leave
                // the monitor cleared while the replacement iframe still plays.
                // PLAYING is the authoritative point to ensure it is alive.
                if (!playbackMonitorInterval) startPlaybackMonitor();
                enforceIframePlaybackQuality(event.target);
                // Do not wait for the 250ms monitor: short segments at 0s can
                // otherwise be passed before the first polling cycle.
                if (!isLiveStream && !isResumeSeekInProgress()) {
                    const playbackTime = Math.max(0, Number(event.target.getCurrentTime?.()) || 0);
                    const playbackDuration = normalizePlaybackDuration(event.target.getDuration?.());
                    skipSponsorBlockSegment(playbackTime, playbackDuration, playerSongId, targetTime => {
                        event.target.seekTo(targetTime, true);
                        if (typeof event.target.playVideo === 'function') event.target.playVideo();
                    });
                }
                setTimeout(() => {
                    if (event.target === overlayPlayer && playerSongId === activePlaybackSongId) {
                        logIframePlaybackQuality('playing', event.target);
                    }
                }, 800);

                if (warningCountdownInterval) {
                    try { event.target.pauseVideo(); } catch (e) { }
                    return;
                }
                // Nếu đang phát tiếp tục, thực hiện seek chủ động sang vị trí cần thiết
                if (localIsResuming && !hasSeekedForResume && resumeTargetTime > 0) {
                    hasSeekedForResume = true;
                    console.log(`Overlay Player: Chủ động seek sang ${resumeTargetTime}s khi bắt đầu phát tiếp tục`);
                    try { event.target.seekTo(resumeTargetTime, true); } catch (e) { }
                }
                // Video đang phát — ép volume ngay (YouTube hay reset đúng lúc này)
                applyTargetVolume();
                console.log(`[onStateChange] PLAYING — ép volume: ${targetVolume}%`);

                // Adaptive Volume: lấy loudnessDb từ server cho video đang phát
                if (localStorage.getItem('dua_adaptive_volume_enabled') === 'true') {
                    try {
                        const vd = event.target.getVideoData ? event.target.getVideoData() : {};
                        const playingVideoId = vd.video_id || currentVideoId || null;
                        if (playingVideoId) {
                            fetchLoudnessDb(playingVideoId);
                        }
                    } catch (e) {
                        console.warn('[Adaptive Volume] Lỗi lấy videoId từ player:', e);
                    }
                }
            } else if (event.data === YT.PlayerState.BUFFERING) {
                if (isIframeAtNaturalEnd(event.target)) {
                    console.log('Overlay Player: Iframe BUFFERING tại cuối bài; xác nhận kết thúc từ Overlay.');
                    triggerEndedEvent();
                    return;
                }
                // Buffering — khởi động lại enforcer vì YouTube có thể reset volume
                startVolumeEnforcer();
            } else if (event.data === YT.PlayerState.PAUSED) {
                if (isIframeAtNaturalEnd(event.target)) {
                    console.log('Overlay Player: Iframe PAUSED tại cuối bài; xác nhận kết thúc từ Overlay.');
                    triggerEndedEvent();
                    return;
                }
                // Nếu bị tạm dừng ngoài ý muốn (không phải do lệnh pause/stop từ dashboard), tự động phát tiếp
                if (lastCommandType !== 'pause' && lastCommandType !== 'stop' && lastCommandType !== 'waiting_resume' && !warningCountdownInterval && !isLuckyRolling) {
                    console.log("Overlay Player: Phát hiện trình phát bị tạm dừng ngoài ý muốn. Đang tự động phát lại...");
                    event.target.playVideo();
                }
            }
        }

        function toggleResumingState(isResuming) {
            const progressContainer = document.getElementById('obs-progress-container');
            const waitingTextEl = document.getElementById('obs-waiting-resume-text');
            if (!progressContainer || !waitingTextEl) return;

            if (isResuming) {
                // Hiển thị text chờ, ẩn các element bên trong progressContainer (nhưng giữ container visible)
                const currentTimeEl = document.getElementById('obs-current-time');
                const progressBgEl = document.getElementById('obs-progress-bar-bg');
                const totalTimeEl = document.getElementById('obs-total-time');
                if (currentTimeEl) currentTimeEl.style.visibility = 'hidden';
                if (progressBgEl) progressBgEl.style.visibility = 'hidden';
                if (totalTimeEl) totalTimeEl.style.visibility = 'hidden';
                waitingTextEl.style.display = 'flex';
            } else {
                // Phục hồi lại tất cả — chỉ ẩn waiting text
                const currentTimeEl = document.getElementById('obs-current-time');
                const progressBgEl = document.getElementById('obs-progress-bar-bg');
                const totalTimeEl = document.getElementById('obs-total-time');
                if (currentTimeEl) currentTimeEl.style.visibility = '';
                if (progressBgEl) progressBgEl.style.visibility = '';
                if (totalTimeEl) totalTimeEl.style.visibility = '';
                waitingTextEl.style.display = 'none';
            }
        }

        function seekActivePlayerToResumeTarget(force = false) {
            if (!localIsResuming || resumeTargetTime <= 0) return false;
            const sponsorAdjustedTarget = resolveSponsorBlockSeekTarget(resumeTargetTime);
            if (sponsorAdjustedTarget > resumeTargetTime + 0.01) {
                console.log(`Overlay Resume: Mốc ${resumeTargetTime.toFixed(1)}s nằm trong SponsorBlock; hợp nhất thành ${sponsorAdjustedTarget.toFixed(1)}s.`);
                resumeTargetTime = sponsorAdjustedTarget;
                hasSeekedForResume = false;
            }
            const now = Date.now();
            if (!force && now - lastResumeSeekAttemptAt < 600) return false;
            lastResumeSeekAttemptAt = now;

            try {
                if (isDirectAudioPlaying && directAudioPlayer) {
                    directAudioPlayer.currentTime = resumeTargetTime;
                    directAudioPlayer.play().catch(() => {});
                    return true;
                }
                if (overlayPlayer && typeof overlayPlayer.seekTo === 'function') {
                    overlayPlayer.seekTo(resumeTargetTime, true);
                    if (typeof overlayPlayer.playVideo === 'function') overlayPlayer.playVideo();
                    return true;
                }
                if (soundCloudWidget) {
                    soundCloudWidget.seekTo(resumeTargetTime * 1000);
                    soundCloudWidget.play();
                    return true;
                }
                if (spotifyEmbedController) {
                    spotifyEmbedController.seek(resumeTargetTime);
                    spotifyEmbedController.play();
                    return true;
                }
            } catch (error) {
                console.warn(`Overlay Player: Chưa thể tua tiếp tới ${resumeTargetTime}s, sẽ thử lại.`, error);
            }
            return false;
        }

        function createSlotItemHtml(song) {
            if (!song) return '';
            const title = song.title || 'Không rõ tên bài hát';
            let donor = song.donorName || 'Khách';
            if (song.isOwnerAdd) {
                donor = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
            }
            const amountStr = (!song.isOwnerAdd && song.amount && Number(song.amount) > 0)
                ? ` · ${Number(song.amount).toLocaleString('vi-VN')} ₫`
                : '';
            const thumb = song.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';

            return `
                <div class="lucky-slot-item">
                    <img class="lucky-slot-thumb" src="${thumb}" alt="Cover">
                    <div class="lucky-slot-details">
                        <div class="lucky-slot-song-title" title="${title}">${title}</div>
                        <div class="lucky-slot-donor-name">
                            <i class="fa-solid fa-heart"></i> ${donor}${amountStr}
                        </div>
                    </div>
                </div>
            `;
        }

        function runLuckyRollAnimation(winningSong) {
            const overlay = document.getElementById('obs-lucky-roll-overlay');
            const slotItemsContainer = document.getElementById('lucky-roll-slot-items');
            const widget = document.getElementById('obs-player-widget');
            if (!overlay || !slotItemsContainer) {
                isLuckyRolling = false;
                updateOverlayUI();
                return;
            }

            // Tự động tăng chiều cao cho Player Widget khi Lucky Roll hoạt động
            if (widget) {
                widget.classList.add('lucky-active');
            }

            // Show overlay
            overlay.classList.add('active');
            overlay.classList.remove('winner-flash');

            // Build candidates list from queue
            let queue = [];
            try {
                const rawQueue = localStorage.getItem('dua_queue');
                if (rawQueue) {
                    queue = JSON.parse(rawQueue);
                }
            } catch (e) {
                console.error("Lucky Roll: Error reading queue:", e);
            }
            if (!Array.isArray(queue)) queue = [];

            // Filter out winning song from candidates to make the roll interesting
            let candidates = queue.filter(s => s && String(s.id) !== String(winningSong ? winningSong.id : ''));

            // If no candidates, use some fallback mock songs or just the winning song
            if (candidates.length === 0) {
                candidates = [
                    { title: "Alan Walker - Faded", donorName: "Khách", thumbnail: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200" },
                    { title: "Chill Lofi Beats", donorName: "Viewer", thumbnail: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200" }
                ];
            }

            // Create a reel of items (e.g. 15 items)
            // The last item must be the winning song!
            const totalItems = 15;
            let reelHtml = '';

            for (let i = 0; i < totalItems - 1; i++) {
                const randomSong = candidates[Math.floor(Math.random() * candidates.length)];
                reelHtml += createSlotItemHtml(randomSong);
            }
            // Add the winner at the end
            reelHtml += createSlotItemHtml(winningSong);

            slotItemsContainer.innerHTML = reelHtml;
            slotItemsContainer.style.transition = 'none';
            slotItemsContainer.style.top = '0px';

            // Force reflow
            void slotItemsContainer.offsetHeight;

            // Trigger scroll animation
            // Slot item height is 90px. To align the last item perfectly:
            // top should slide up to -((totalItems - 1) * 90)px
            const targetTop = -((totalItems - 1) * 90);

            slotItemsContainer.style.transition = 'top 3.5s cubic-bezier(0.1, 0.8, 0.1, 1)';
            slotItemsContainer.style.top = `${targetTop}px`;

            // After roll stops
            setTimeout(() => {
                // Add winner flash
                overlay.classList.add('winner-flash');

                // Wait 1.5s more for user to see the winner
                setTimeout(() => {
                    // Do NOT hide the overlay yet to prevent black screen flash.
                    // It will be hidden in updateOverlayUI() once the new song actually arrives.
                    isLuckyRolling = false;
                    luckyRollCompleted = true;

                    // Phát tín hiệu kết thúc bài về Dashboard sau khi quay số xong để chuyển bài
                    triggerEndedEvent();
                }, 1500);
            }, 3500);
        }

        function renderPreviewUI() {
            const currentTheme = urlParams.get('theme') || localStorage.getItem('dua_theme') || 'enchanted-wild';
            if (!document.body.classList.contains('theme-' + currentTheme)) {
                applyTheme(currentTheme);
            }

            const widget = document.getElementById('obs-player-widget');
            if (widget) {
                widget.classList.add('active');
                widget.style.display = '';
                widget.classList.remove('obs-ext-active', 'next-fullscreen-active', 'owner-promo-mode');
                widget.classList.remove('show-queue', 'phase-crossfade');
                widget.dataset.upNextPhase = 'idle';
            }

            const emptyOverlay = document.getElementById('obs-empty-overlay');
            if (emptyOverlay) emptyOverlay.classList.remove('active', 'focus-active');

            const warningOverlay = document.getElementById('obs-warning-overlay');
            if (warningOverlay) warningOverlay.classList.remove('active');

            const rollOverlay = document.getElementById('obs-lucky-roll-overlay');
            if (rollOverlay) rollOverlay.classList.remove('active');

            const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
            if (fullscreenCard) fullscreenCard.classList.remove('active');

            const title = document.getElementById('obs-song-title');
            const channelNameEl = document.getElementById('obs-channel-name');
            const promoTitleEl = document.getElementById('obs-owner-promo-title');
            const donorContainer = document.getElementById('obs-donor-container');
            const donorName = document.getElementById('obs-donor-name');
            const donorAmount = document.getElementById('obs-donor-amount');
            const songMsg = document.getElementById('obs-song-message');

            if (title) title.textContent = "Không Thời Gian - Dương Domic";
            if (channelNameEl) channelNameEl.textContent = "Dương Domic";
            if (promoTitleEl) promoTitleEl.textContent = "Không Thời Gian - Dương Domic";
            updateLyricsOverlayDetails({ lyrics: { available: true, lines: [{ time: 0, text: 'Sample' }] } });
            if (donorContainer) donorContainer.style.display = 'flex';
            if (donorName) {
                donorName.textContent = "mèo 3k";
                donorName.style.removeProperty('max-width');
                donorName.style.removeProperty('white-space');
            }
            if (donorAmount) {
                donorAmount.textContent = "100.000.000 ₫";
                donorAmount.style.removeProperty('display');
            }
            if (songMsg) {
                songMsg.style.display = 'none';
            }

            const currentTimeDisplay = document.getElementById('obs-current-time');
            const totalTimeDisplay = document.getElementById('obs-total-time');
            const progressFill = document.getElementById('obs-progress-fill');

            if (currentTimeDisplay) currentTimeDisplay.textContent = "0:45";
            if (totalTimeDisplay) totalTimeDisplay.textContent = "3:20";
            if (progressFill) {
                progressFill.style.width = "22.5%";
            }

            const cover = document.getElementById('obs-song-cover');
            if (cover) {
                cover.src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
            }
            const coverWrapper = document.getElementById('obs-cover-wrapper');
            if (coverWrapper) {
                coverWrapper.classList.add('spinning');
                coverWrapper.style.animationPlayState = 'running';
            }

        }

        let lastOwnerPromoTitleSignature = '';

        function updateOwnerPromoMode(widgetElement, song) {
            const promoContainer = document.getElementById('obs-owner-promo-title-container');
            const promoTitle = document.getElementById('obs-owner-promo-title');
            const promoDonorName = document.getElementById('obs-donor-name');
            const ownerPricePromo = document.getElementById('obs-owner-price-promo');

            if (!widgetElement || !song) {
                if (widgetElement) {
                    widgetElement.classList.remove('owner-promo-mode', 'owner-price-table-active');
                }
                stopIdleSlideshow(ownerPricePromo);
                lastOwnerPromoTitleSignature = '';
                if (promoTitle) {
                    promoTitle.classList.remove('marquee');
                    promoTitle.style.animationDuration = '0s';
                    promoTitle.textContent = '';
                }
                return false;
            }

            const isOwnerSong = Boolean(song.isOwnerAdd);
            widgetElement.classList.toggle('owner-promo-mode', isOwnerSong);
            if (promoDonorName) {
                delete promoDonorName.dataset.ownerPromoText;
            }

            if (isOwnerSong) {
                const shouldShowPriceTable = hasIdlePriceSlides();
                widgetElement.classList.toggle('owner-price-table-active', shouldShowPriceTable);
                if (shouldShowPriceTable && ownerPricePromo) {
                    const orderMessage = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                    renderIdleSlideshow(ownerPricePromo, orderMessage);
                } else {
                    stopIdleSlideshow(ownerPricePromo);
                }

                const titleText = song.title || 'Chưa có tên bài hát';
                const signature = `${song.id || ''}|${titleText}`;
                if (lastOwnerPromoTitleSignature !== signature && promoContainer && promoTitle) {
                    lastOwnerPromoTitleSignature = signature;
                    applyMarquee(promoContainer, promoTitle, titleText, 40);
                }
            } else {
                widgetElement.classList.remove('owner-price-table-active');
                stopIdleSlideshow(ownerPricePromo);
                lastOwnerPromoTitleSignature = '';
                if (promoTitle) {
                    promoTitle.classList.remove('marquee');
                    promoTitle.style.animationDuration = '0s';
                    promoTitle.textContent = '';
                }
            }
            return isOwnerSong;
        }

        // Cập nhật Giao diện Overlay
        function updatePlaylistOverlayDetails(songData) {
            const playerWidget = document.getElementById('obs-player-widget');
            const meta = document.getElementById('obs-playlist-meta');
            const donorPlaylistIcon = document.getElementById('obs-playlist-icon');
            const ownerPlaylistIcon = document.getElementById('obs-owner-playlist-icon');
            const isPlaylist = Boolean(songData?.playlistRequestId || songData?.isPlaylistTrack || songData?.playlistTrackId);
            const isOwner = Boolean(songData?.isOwnerAdd);

            if (playerWidget) playerWidget.classList.toggle('is-playlist-playing', isPlaylist);
            if (donorPlaylistIcon) {
                donorPlaylistIcon.style.display = (isPlaylist && !isOwner) ? 'inline-flex' : 'none';
            }
            if (ownerPlaylistIcon) {
                ownerPlaylistIcon.style.display = (isPlaylist && isOwner) ? 'inline-flex' : 'none';
            }
            if (!isPlaylist) {
                if (meta) { meta.hidden = true; meta.textContent = ''; }
                return;
            }

            let activePlaylist = {};
            try { activePlaylist = JSON.parse(localStorage.getItem('dua_active_playlist') || '{}'); } catch (_) { }
            const position = Number(songData.playlistPosition || activePlaylist.currentTrack || 1);
            const total = Number(songData.playlistTotalTracks || activePlaylist.totalTracks || 1);

            if (meta) {
                const remaining = Number(activePlaylist.remainingPlaylistSec || 0);
                const plTitle = songData.playlistTitle || activePlaylist.playlistTitle || 'YouTube Playlist';
                meta.textContent = `${position}/${total} ${plTitle}${remaining > 0 ? ` · còn ${formatTime(remaining)}` : ''}`;
                meta.hidden = false;
            }
        }

        function updateVoteSkipProgress(songData) {
            const voteSkipWidget = document.getElementById('obs-vote-skip-widget');
            const progressText = document.getElementById('obs-vote-skip-progress-text');
            const progressFill = document.getElementById('obs-vote-skip-fill');
            if (!voteSkipWidget) return;

            const isActive = Boolean(songData?.voteSkipActive);
            voteSkipWidget.hidden = !isActive;
            if (!isActive) {
                if (progressFill) progressFill.style.width = '0%';
                return;
            }

            const target = Math.max(1, Number(songData.voteSkipTarget) || 20000);
            const amount = Math.max(0, Number(songData.voteAmount) || 0);
            const percent = Math.min(100, (amount / target) * 100);
            if (progressText) {
                progressText.textContent = `${amount.toLocaleString('vi-VN')}đ / ${target.toLocaleString('vi-VN')}đ`;
            }
            if (progressFill) progressFill.style.width = `${percent}%`;
        }

        function updateLyricsOverlayDetails(songData) {
            const obsLyricsIcon = document.getElementById('obs-lyrics-icon');
            const obsOwnerLyricsIcon = document.getElementById('obs-owner-lyrics-icon');
            const hasLyrics = Boolean(songData?.lyrics?.available && songData.lyrics.lines?.length);
            const isOwner = Boolean(songData?.isOwnerAdd);
            if (obsLyricsIcon) {
                obsLyricsIcon.style.display = hasLyrics ? 'inline-flex' : 'none';
            }
            if (obsOwnerLyricsIcon) {
                obsOwnerLyricsIcon.style.display = (hasLyrics && isOwner) ? 'inline-flex' : 'none';
            }
        }

        let browserMediaState = null;
        let lastBrowserOwnerDonorSignature = '';

        function getBrowserMediaProviderLabel(provider) {
            if (provider === 'youtube-music') return 'YouTube Music';
            if (provider === 'soundcloud') return 'SoundCloud';
            return 'YouTube';
        }

        function getBrowserMediaOwnerSong() {
            const media = browserMediaState;
            const age = Date.now() - Number(media?.updatedAt || 0);
            if (!media?.active || !media.playing || age > 10000) return null;
            return {
                id: `browser-owner:${media.provider || 'media'}:${media.url || ''}`,
                isOwnerAdd: true,
                type: media.provider === 'soundcloud' ? 'soundcloud' : 'youtube',
                title: media.title || 'Media trên trình duyệt',
                channelName: media.artist || getBrowserMediaProviderLabel(media.provider),
                thumbnail: media.thumbnail || '',
                duration: Math.max(0, Number(media.duration) || 0)
            };
        }

        function renderBrowserMediaFallback() {
            const media = browserMediaState;
            const age = Date.now() - Number(media?.updatedAt || 0);
            const ownerSong = getBrowserMediaOwnerSong();
            if (!ownerSong) return false;

            const playerWidget = document.getElementById('obs-player-widget');
            const emptyOverlay = document.getElementById('obs-empty-overlay');
            const title = document.getElementById('obs-song-title');
            const channel = document.getElementById('obs-channel-name');
            const donorName = document.getElementById('obs-donor-name');
            const donorAmount = document.getElementById('obs-donor-amount');
            const donorNameContainer = document.getElementById('obs-donor-name-container');
            const currentTime = Math.max(0, Number(media.currentTime) || 0) + Math.max(0, age / 1000);
            const duration = Math.max(0, Number(media.duration) || 0);
            const progress = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;

            // Dùng chính owner renderer để bảng giá, lời mời order, marquee và
            // cách thu gọn luôn giống hệt một bài chủ kênh thêm thông thường.
            playerWidget.classList.add(
                'active',
                'playing',
                'browser-media-fallback',
                'is-owner-add',
                'owner-promo-mode'
            );
            playerWidget.classList.remove('is-playlist-playing');
            playerWidget.style.display = '';
            const ownerPricePromo = document.getElementById('obs-owner-price-promo');
            if (playerWidget.classList.contains('owner-price-table-active') && ownerPricePromo) {
                const orderMessage = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                // renderIdleSlideshow vừa dựng slide vừa tiến trang dựa trên thời
                // gian đã chạy. Gọi lại không reset timer khi signature không đổi.
                renderIdleSlideshow(ownerPricePromo, orderMessage);
            }
            if (emptyOverlay) {
                stopIdleSlideshow(emptyOverlay);
                emptyOverlay.classList.remove('active', 'focus-active');
            }
            if (title) title.textContent = ownerSong.title;
            if (channel) channel.textContent = ownerSong.channelName;
            if (donorName) {
                const orderMessage = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                const donorSignature = `${ownerSong.id}|${orderMessage}`;
                if (lastBrowserOwnerDonorSignature !== donorSignature) {
                    lastBrowserOwnerDonorSignature = donorSignature;
                    if (donorNameContainer) applyMarquee(donorNameContainer, donorName, orderMessage, 40);
                    else donorName.textContent = orderMessage;
                }
                donorName.style.setProperty('max-width', 'none', 'important');
                donorName.style.setProperty('white-space', 'normal', 'important');
            }
            if (donorAmount) donorAmount.style.setProperty('display', 'none', 'important');

            const currentEl = document.getElementById('obs-current-time');
            const totalEl = document.getElementById('obs-total-time');
            const fillEl = document.getElementById('obs-progress-fill');
            const thumbEl = document.getElementById('obs-progress-thumb');
            if (currentEl) {
                const elapsed = formatTime(Math.min(currentTime, duration || currentTime));
                currentEl.textContent = `${elapsed} / ${duration > 0 ? formatTime(duration) : 'LIVE'}`;
            }
            if (totalEl) totalEl.textContent = duration > 0 ? formatTime(duration) : '--:--';
            if (fillEl) fillEl.style.width = `${progress}%`;
            if (thumbEl) thumbEl.style.left = `${progress}%`;
            return true;
        }

        function updateOverlayUI() {
            if (isPreview) {
                renderPreviewUI();
                return;
            }
            if (isLuckyRolling) return;
            try {
                let loaderMediaType = 'youtube';
                try {
                    loaderMediaType = JSON.parse(localStorage.getItem('dua_current_song') || '{}')?.type || 'youtube';
                } catch (_) { }
                const isYouTubeLoader = loaderMediaType === 'youtube';
                // Một policy duy nhất quyết định thời điểm chuyển nguồn. Iframe
                // bị chặn rõ ràng ở 0:00 chỉ chờ 8 giây; buffering chưa rõ nguyên
                // nhân có tối đa 12 giây. Không thử playVideo thêm một vòng 15 giây.
                if (isYouTubeLoader && !isDirectAudioPlaying && lastSongLoadStartTimestamp > 0 && overlayPlayer) {
                    let playerState = null;
                    let observedCurrentTime = 0;
                    let observedDuration = 0;
                    try {
                        playerState = overlayPlayer.getPlayerState?.();
                        observedCurrentTime = Math.max(0, Number(overlayPlayer.getCurrentTime?.()) || 0);
                        observedDuration = normalizePlaybackDuration(overlayPlayer.getDuration?.());
                    } catch (_) { }
                    const loaderDecision = youtubePlaybackFallbackPolicy.evaluateInitialLoad({
                        elapsedMs: Date.now() - lastSongLoadStartTimestamp,
                        currentTime: observedCurrentTime,
                        duration: observedDuration,
                        playerState,
                        hasStarted: activePlaybackHasStarted,
                        isPlaybackSuppressed: Boolean(warningCountdownInterval || isLuckyRolling),
                        states: YT.PlayerState
                    });

                    if (loaderDecision.action === 'confirm_playback') {
                        activePlaybackHasStarted = true;
                        lastSongLoadStartTimestamp = 0;
                    } else if (loaderDecision.action === 'fallback') {
                        console.error(`Overlay Player: Loader Watchdog chuyển DirectStream (${loaderDecision.reason}).`);
                        lastSongLoadStartTimestamp = 0;
                        let fallbackId = currentVideoId;
                        let fallbackStart = 0;
                        try {
                            const songRaw = localStorage.getItem('dua_current_song');
                            if (songRaw) {
                                const songObj = JSON.parse(songRaw);
                                fallbackId = songObj.videoId || fallbackId;
                                fallbackStart = getSongPlaybackStart(songObj);
                            }
                        } catch (_) { }
                        if (tryDirectStreamFallback(loaderDecision.reason, fallbackId, fallbackStart)) return;
                        publishMqtt('overlay_event', {
                            type: 'player_error',
                            code: 'iframe_and_direct_stream_failed',
                            songId: activePlaybackSongId,
                            timestamp: Date.now()
                        });
                        return;
                    }
                }

                // Resume prompts are owned by Dashboard. Do not allow a stale
                // transient command to block Overlay rendering indefinitely.
                if (lastCommandType === 'waiting_resume') {
                    lastCommandType = 'pause';
                }

                if (lastCommandType === 'waiting_resume') {
                    // Đang chờ người dùng lựa chọn, giữ nguyên giao diện chờ
                    const waitWidget = document.getElementById('obs-player-widget');
                    const waitOverlay = document.getElementById('obs-empty-overlay');
                    if (waitWidget && waitOverlay) {
                        stopIdleSlideshow(waitOverlay);
                        waitWidget.classList.add('active');
                        waitWidget.style.display = '';
                        waitOverlay.classList.add('active', 'focus-active');
                    }
                    return;
                }

                // Đồng bộ theme định kỳ từ localStorage
                const storedTheme = localStorage.getItem('dua_theme') || 'enchanted-wild';
                if (!document.body.classList.contains('theme-' + storedTheme) && !(storedTheme === 'pineapple' && document.body.className === '')) {
                    applyTheme(storedTheme);
                }

                const dataRaw = localStorage.getItem('dua_current_song');
                let shouldRestoreAppMetadata = false;
                const browserSongWhilePaused = dataRaw
                    && (lastCommandType === 'pause' || lastCommandType === 'stop')
                    ? getBrowserMediaOwnerSong()
                    : null;

                // Giữ bài app nguyên vẹn trong queue/player nhưng tạm dùng giao
                // diện bài chủ kênh cho media đang phát trên trình duyệt. Khi
                // Dashboard gửi `play`, nhánh này tự tắt và bài app hiện lại.
                if (browserSongWhilePaused) {
                    updateOverlayLyrics(null, 0);
                    updateVoteSkipProgress(null);
                    updatePlaylistOverlayDetails(null);
                    updateLyricsOverlayDetails(null);
                    const browserOwnerSignature = `${browserSongWhilePaused.id || ''}|${browserSongWhilePaused.title || ''}`;
                    if (!widget.classList.contains('browser-media-fallback')
                        || lastOwnerPromoTitleSignature !== browserOwnerSignature) {
                        updateOwnerPromoMode(widget, browserSongWhilePaused);
                    }
                    renderBrowserMediaFallback();
                    return;
                }

                if (!dataRaw) {
                    updateOverlayLyrics(null, 0);
                    updateLyricsOverlayDetails(null);
                    const browserOwnerSong = getBrowserMediaOwnerSong();
                    // Khi owner browser view đã ổn định, chỉ cập nhật metadata và
                    // playhead. Không tháo/lắp lại player, slideshow và class mỗi
                    // 200ms vì OBS sẽ vẽ ra một frame trung gian gây nhấp nháy.
                    if (browserOwnerSong && widget.classList.contains('browser-media-fallback')) {
                        const ownerSignature = `${browserOwnerSong.id || ''}|${browserOwnerSong.title || ''}`;
                        if (lastOwnerPromoTitleSignature !== ownerSignature) {
                            updateOwnerPromoMode(widget, browserOwnerSong);
                        }
                        renderBrowserMediaFallback();
                        return;
                    }
                    updateVoteSkipProgress(null);
                    updatePlaylistOverlayDetails(null);
                    updateLyricsOverlayDetails(null);
                    updateOwnerPromoMode(widget, browserOwnerSong);
                    if (destroyTimeout) {
                        clearTimeout(destroyTimeout);
                        destroyTimeout = null;
                    }
                    if (warningCountdownInterval) {
                        clearInterval(warningCountdownInterval);
                        warningCountdownInterval = null;
                    }
                    warningSongId = null;
                    const warningOverlay = document.getElementById('obs-warning-overlay');
                    if (warningOverlay) warningOverlay.classList.remove('active');

                    widget.classList.remove('playing');

                    // Reset lucky roll state
                    isLuckyRolling = false;
                    luckyRollCompleted = false;
                    luckyRollCurrentSongId = null;
                    const lOverlay = document.getElementById('obs-lucky-roll-overlay');
                    if (lOverlay) {
                        lOverlay.classList.remove('active', 'winner-flash');
                    }
                    widget.classList.remove('lucky-active');

                    const hideEmpty = localStorage.getItem('dua_hide_empty_overlay') === 'true';
                    const isFocus = localStorage.getItem('dua_focus_mode') === 'true';
                    if (browserOwnerSong) {
                        // Không dựng slideshow màn trống khi owner browser đang
                        // dùng slideshow bảng giá. Hai slideshow dùng chung state;
                        // đổi qua lại mỗi 200ms là nguyên nhân gây nhấp nháy.
                        const emptyOverlay = document.getElementById('obs-empty-overlay');
                        stopIdleSlideshow(emptyOverlay);
                        if (emptyOverlay) emptyOverlay.classList.remove('active', 'focus-active');
                        widget.classList.add('active');
                        widget.style.display = '';
                    } else if (hideEmpty && !isFocus) {
                        stopIdleSlideshow(document.getElementById('obs-empty-overlay'));
                        widget.classList.remove('active');
                        widget.style.display = 'none';
                    } else {
                        widget.classList.add('active'); // Luôn hiển thị overlay
                        widget.style.display = '';

                        // Hiện empty overlay đè lên player
                        const emptyOverlay = document.getElementById('obs-empty-overlay');
                        if (emptyOverlay) {
                            emptyOverlay.classList.add('active');
                            if (isFocus) {
                                stopIdleSlideshow(emptyOverlay);
                                emptyOverlay.classList.add('focus-active');
                                const storedFocusMsg = localStorage.getItem('dua_focus_mode_message');
                                emptyOverlay.textContent = storedFocusMsg || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng';
                            } else {
                                const storedMsg = localStorage.getItem('dua_empty_queue_message');
                                renderIdleSlideshow(emptyOverlay, storedMsg || 'Order nhạc tự động Zypage 50k');
                            }
                            if (isFocus) adjustEmptyOverlayFontSize(emptyOverlay, emptyOverlay.textContent);
                        }
                    }

                    const nextSongDrawer = document.getElementById('obs-next-song-drawer');
                    if (nextSongDrawer) nextSongDrawer.classList.remove('show');
                    widget.classList.remove('obs-ext-active');
                    if (widget.dataset.upNextPhase !== 'idle'
                        || widget.classList.contains('show-queue')
                        || widget.classList.contains('next-fullscreen-active')
                        || widget.classList.contains('phase-crossfade')) {
                        clearUpNextPhase();
                    }
                    const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
                    if (fullscreenCard) fullscreenCard.classList.remove('active');
                    if (overlayPlayer) {
                        try { overlayPlayer.destroy(); } catch (e) { }
                        overlayPlayer = null;
                        document.getElementById('obs-youtube-area').innerHTML = '<div id="obs-youtube-placeholder"></div>';
                    }
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch (e) { }
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch (e) { }
                    }
                    stopDirectAudioStream();

                    lastSongId = 'no_song';
                    currentVideoId = null;
                    activePlaybackSongId = null;
                    activePlaybackHasStarted = false;
                    directFallbackAttemptedSongId = null;
                    skipSegments = [];
                    skipSegmentsSongId = null;
                    lastSkippedSegmentKey = null;
                    lastSBSeekTimestamp = 0;
                    lastSBSeekTarget = 0;
                    currentRemainingTime = 999999;
                    lastProgressPct = null;
                    if (renderBrowserMediaFallback()) return;
                    lastBrowserOwnerDonorSignature = '';
                    widget.classList.remove('browser-media-fallback', 'is-owner-add', 'owner-promo-mode', 'owner-price-table-active');
                    return;
                } else {
                    if (widget.classList.contains('browser-media-fallback')) {
                        shouldRestoreAppMetadata = true;
                        lastBrowserOwnerDonorSignature = '';
                        widget.classList.remove('browser-media-fallback', 'is-owner-add', 'owner-promo-mode', 'owner-price-table-active');
                        const donorAmount = document.getElementById('obs-donor-amount');
                        if (donorAmount) donorAmount.style.removeProperty('display');
                    }
                    if (destroyTimeout) {
                        clearTimeout(destroyTimeout);
                        destroyTimeout = null;
                    }
                    const isFocus = localStorage.getItem('dua_focus_mode') === 'true';
                    const emptyOverlay = document.getElementById('obs-empty-overlay');
                    if (emptyOverlay) {
                        stopIdleSlideshow(emptyOverlay);
                        if (isFocus && (lastCommandType === 'pause' || lastCommandType === 'stop')) {
                            emptyOverlay.classList.add('active', 'focus-active');
                            const storedFocusMsg = localStorage.getItem('dua_focus_mode_message');
                            emptyOverlay.textContent = storedFocusMsg || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng';
                            adjustEmptyOverlayFontSize(emptyOverlay, emptyOverlay.textContent);
                        } else {
                            if (lastCommandType !== 'waiting_resume') {
                                emptyOverlay.classList.remove('active', 'focus-active');
                            }
                        }
                    }
                    widget.style.display = '';
                }

                const data = JSON.parse(dataRaw);
                updateVoteSkipProgress(data);
                updateLyricsOverlayDetails(data);
                const isOwnerPromo = updateOwnerPromoMode(widget, data);

                const isLuckyNewSong = String(lastSongId ?? '') !== String(data.id ?? '');
                if (isLuckyNewSong) {
                    luckyRollCompleted = false;
                    luckyRollCurrentSongId = null;

                    // Tắt overlay quay số Lucky Roll nếu bài mới đã tải xong
                    const lOverlay = document.getElementById('obs-lucky-roll-overlay');
                    if (lOverlay) {
                        lOverlay.classList.remove('active', 'winner-flash');
                    }
                    const widget = document.getElementById('obs-player-widget');
                    if (widget) {
                        widget.classList.remove('lucky-active');
                    }
                    const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
                    if (fullscreenCard) {
                        fullscreenCard.classList.remove('active');
                    }
                }

                // Cập nhật mã gia hạn thời gian
                const extContainerGlobal = document.getElementById('obs-extension-code-container');
                const extCodeValGlobal = document.getElementById('obs-extension-code');
                if (extContainerGlobal && extCodeValGlobal) {
                    if (data.extensionCode) {
                        extCodeValGlobal.textContent = data.extensionCode;
                    }
                }

                // Mismatch check: Nếu có đếm ngược của bài khác đang chạy, huỷ ngay lập tức để nhận bài mới
                if (warningCountdownInterval && warningSongId !== data.id) {
                    clearInterval(warningCountdownInterval);
                    warningCountdownInterval = null;
                    warningSongId = null;
                    const warningOverlay = document.getElementById('obs-warning-overlay');
                    if (warningOverlay) {
                        warningOverlay.classList.remove('active');
                    }
                }

                // ĐÃ XÓA BỎ CHỨC NĂNG CẢNH BÁO NỘI DUNG NHẠY CẢM
                const sensitiveConfig = null;

                if (sensitiveConfig && lastWarnedSongId !== data.id) {
                    if (warningCountdownInterval) {
                        // Cảnh báo đang hoạt động đếm ngược, không chạy lại
                        return;
                    }

                    const warningOverlay = document.getElementById('obs-warning-overlay');
                    const warningCountdown = document.getElementById('obs-warning-countdown');
                    const warningText = document.querySelector('.obs-warning-text');

                    if (warningOverlay) {
                        warningOverlay.classList.add('active');
                    }
                    if (warningText && sensitiveConfig.message) {
                        warningText.textContent = sensitiveConfig.message;
                    }

                    // Tạm dừng tất cả player hiện tại để không cho phát âm thanh lúc này
                    lastCommandType = 'pause';
                    if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') {
                        try { overlayPlayer.pauseVideo(); } catch (e) { }
                    }
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch (e) { }
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch (e) { }
                    }

                    let timeLeft = sensitiveConfig.duration || 5; // Đếm ngược theo số giây cấu hình hoặc mặc định 5s
                    if (warningCountdown) {
                        warningCountdown.textContent = `Phát sau ${timeLeft}s...`;
                    }

                    warningSongId = data.id; // Gán ID bài đang chạy cảnh báo

                    warningCountdownInterval = setInterval(() => {
                        timeLeft--;
                        if (warningCountdown) {
                            warningCountdown.textContent = `Phát sau ${timeLeft}s...`;
                        }
                        if (timeLeft <= 0) {
                            clearInterval(warningCountdownInterval);
                            warningCountdownInterval = null;
                            warningSongId = null;

                            if (warningOverlay) {
                                warningOverlay.classList.remove('active');
                            }

                            lastWarnedSongId = data.id;
                            lastCommandType = 'play';

                            // Phát video sau khi hết cảnh báo nhạy cảm
                            updateOverlayUI();
                            setTimeout(() => {
                                if (overlayPlayer && typeof overlayPlayer.playVideo === 'function') {
                                    overlayPlayer.playVideo();
                                    console.log("Overlay Player: Hết cảnh báo nhạy cảm -> Ép chạy video");
                                }
                            }, 200);
                        }
                    }, 1000);

                    widget.classList.remove('playing');
                    const emptyOverlay = document.getElementById('obs-empty-overlay');
                    if (emptyOverlay) emptyOverlay.classList.remove('active');
                    widget.style.display = '';

                    return; // Tạm ngắt, không chạy tiếp đoạn play
                } else {
                    const warningOverlay = document.getElementById('obs-warning-overlay');
                    if (warningOverlay) {
                        warningOverlay.classList.remove('active');
                    }
                    if (warningCountdownInterval) {
                        clearInterval(warningCountdownInterval);
                        warningCountdownInterval = null;
                    }
                    warningSongId = null;
                }

                const isNewSong = String(lastSongId ?? '') !== String(data.id ?? '');
                const incomingSongId = data.id == null ? null : String(data.id);
                skipSegments = Array.isArray(data.skipSegments) ? data.skipSegments : [];
                skipSegmentsSongId = incomingSongId;
                if (!isNewSong && isResumeSeekInProgress()) {
                    const sponsorAdjustedResume = resolveSponsorBlockSeekTarget(resumeTargetTime);
                    if (sponsorAdjustedResume > resumeTargetTime + 0.01) {
                        console.log(`Overlay Resume: Hợp nhất mốc phát tiếp ${resumeTargetTime.toFixed(1)}s với SponsorBlock thành ${sponsorAdjustedResume.toFixed(1)}s.`);
                        resumeTargetTime = sponsorAdjustedResume;
                        hasSeekedForResume = false;
                        lastResumeSeekAttemptAt = 0;
                    }
                }

                const currentEmptyMsg = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                let emptyMsgChanged = false;
                if (lastRenderedEmptyQueueMessage !== currentEmptyMsg) {
                    lastRenderedEmptyQueueMessage = currentEmptyMsg;
                    emptyMsgChanged = true;
                }

                if (isNewSong) {
                    endedSignalSongId = null;
                    activePlaybackSongId = incomingSongId;
                    activePlaybackHasStarted = false;
                    iframeLastObservedTime = 0;
                    iframeLastProgressAt = 0;
                    iframePlaybackStalled = false;
                    directFallbackAttemptedSongId = null;
                    lastSkippedSegmentKey = null;
                    lastSBSeekTimestamp = 0;
                    lastSBSeekTarget = 0;
                    // Reset thanh tiến trình và thời gian hiển thị về 0 ngay lập tức khi sang bài mới
                    if (progressFill) progressFill.style.width = '0%';
                    if (progressThumb) progressThumb.style.left = '0%';
                    if (currentTimeDisplay) currentTimeDisplay.textContent = '0:00';
                    if (totalTimeDisplay) totalTimeDisplay.textContent = '0:00';
                }

                if (!window.overlayAuthorCache) window.overlayAuthorCache = {};

                function cleanChannelName(name) {
                    if (!name || typeof name !== 'string') return name || '';
                    return name.replace(/\s*[\-\–\—]\s*(Topic|Chủ\s*đề)\s*$/gi, '').trim();
                }

                // Định nghĩa hàm cập nhật nội dung chữ và marquee
                const updateTextContent = (songData, skipMarquee = false) => {
                    title.textContent = songData.title || "Chưa có tên bài hát";

                    const channelNameEl = document.getElementById('obs-channel-name');
                    const channelNameContainer = document.getElementById('obs-channel-name-container');

                    // Kiểm tra cache nếu songData.author chưa có
                    if (!songData.author && songData.videoId && window.overlayAuthorCache[songData.videoId]) {
                        songData.author = window.overlayAuthorCache[songData.videoId];
                    }

                    let channelText = songData.author || songData.channelTitle || songData.channelName || songData.artist || songData.uploader || songData.channel || '';
                    if (!channelText && typeof overlayPlayer !== 'undefined' && overlayPlayer && typeof overlayPlayer.getVideoData === 'function') {
                        try {
                            const vd = overlayPlayer.getVideoData();
                            if (vd && vd.author) {
                                channelText = vd.author;
                                songData.author = cleanChannelName(vd.author);
                                if (vd.video_id) window.overlayAuthorCache[vd.video_id] = songData.author;
                            }
                        } catch (e) { }
                    }
                    if (!channelText) {
                        channelText = songData.isOwnerAdd ? 'ZyPage Player' : 'Kênh YouTube';
                    }

                    channelText = cleanChannelName(channelText);

                    if (channelNameEl) {
                        if (channelNameContainer && !skipMarquee) {
                            applyMarquee(channelNameContainer, channelNameEl, channelText, 40);
                        } else {
                            channelNameEl.textContent = channelText;
                        }
                    }

                    const playlistMetaEl = document.getElementById('obs-playlist-meta');
                    if (playlistMetaEl) {
                        let activePlaylist = {};
                        try { activePlaylist = JSON.parse(localStorage.getItem('dua_active_playlist') || '{}'); } catch (_) { }
                        if (songData.playlistRequestId) {
                            const position = Number(songData.playlistPosition || activePlaylist.currentTrack || 1);
                            const total = Number(songData.playlistTotalTracks || activePlaylist.totalTracks || 1);
                            const remaining = Number(activePlaylist.remainingPlaylistSec || 0);
                            const donor = songData.donorName || activePlaylist.donorName || 'Khách';
                            const plTitle = songData.playlistTitle || activePlaylist.playlistTitle || 'YouTube Playlist';
                            playlistMetaEl.textContent = `${position}/${total} ${plTitle}${remaining > 0 ? ` · còn ${formatTime(remaining)}` : ''}`;
                            playlistMetaEl.hidden = false;
                        } else {
                            playlistMetaEl.hidden = true;
                            playlistMetaEl.textContent = '';
                        }
                    }

                    // Nếu tên kênh vẫn là fallback "Kênh YouTube" và video là YouTube — tự động cào lại từ noembed
                    if ((channelText === 'Kênh YouTube' || !channelText) && songData.videoId && (!songData.isOwnerAdd)) {
                        const targetVideoId = songData.videoId;
                        const targetSongId = songData.id;
                        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${targetVideoId}`)
                            .then(r => r.json())
                            .then(d => {
                                const fetchedAuthor = cleanChannelName(d.author_name || '');
                                if (fetchedAuthor && fetchedAuthor !== 'Kênh YouTube') {
                                    window.overlayAuthorCache[targetVideoId] = fetchedAuthor;
                                    // CHỈ CẬP NHẬT GIAO DIỆN NẾU BÀI HÁT HIỆN TẠI VẪN TRÙNG KHỚP (tránh lỗi cướp tên kênh do skip bài quá nhanh)
                                    if (data && (data.id === targetSongId || data.videoId === targetVideoId)) {
                                        songData.author = fetchedAuthor;
                                        data.author = fetchedAuthor;
                                        if (channelNameEl) {
                                            if (channelNameContainer) {
                                                applyMarquee(channelNameContainer, channelNameEl, fetchedAuthor, 40);
                                            } else {
                                                channelNameEl.textContent = fetchedAuthor;
                                            }
                                        }
                                    }
                                }
                            })
                            .catch(() => { });
                    }

                    const donorNameContainer = document.getElementById('obs-donor-name-container');
                    const playerWidgetEl = document.getElementById('obs-player-widget');
                    const promoTitleEl = document.getElementById('obs-owner-promo-title');
                    const promoTitleContainer = document.getElementById('obs-owner-promo-title-container');

                    if (songData.isOwnerAdd) {
                        if (playerWidgetEl) playerWidgetEl.classList.add('is-owner-add');
                        const emptyMsg = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                        if (donorNameContainer) {
                            applyMarquee(donorNameContainer, donorName, emptyMsg, 40);
                        } else {
                            donorName.textContent = emptyMsg;
                        }
                        donorName.style.setProperty('max-width', 'none', 'important');
                        donorName.style.setProperty('white-space', 'normal', 'important');
                        donorAmount.style.setProperty('display', 'none', 'important');
                        if (donorContainer) donorContainer.style.display = 'flex';

                        // Đặt tên bài hát cho dòng dưới cùng
                        const songTitleText = songData.title || "Chưa có tên bài hát";
                        if (promoTitleEl) {
                            if (promoTitleContainer && !skipMarquee) {
                                applyMarquee(promoTitleContainer, promoTitleEl, songTitleText, 40);
                            } else {
                                promoTitleEl.textContent = songTitleText;
                            }
                        }
                    } else {
                        if (playerWidgetEl) playerWidgetEl.classList.remove('is-owner-add');
                        const nameToUse = songData.donorName || "Khách";
                        if (donorNameContainer) {
                            applyMarquee(donorNameContainer, donorName, nameToUse, 40);
                        } else {
                            donorName.textContent = nameToUse;
                        }
                        donorName.style.removeProperty('max-width');
                        donorName.style.removeProperty('white-space');
                        donorAmount.textContent = songData.amount ? songData.amount.toLocaleString('vi-VN') + ' ₫' : '0 ₫';
                        donorAmount.style.removeProperty('display');
                        if (donorContainer) donorContainer.style.display = 'flex';
                    }

                    const extContainer = document.getElementById('obs-extension-code-container');
                    const extCodeVal = document.getElementById('obs-extension-code');
                    if (extContainer && extCodeVal) {
                        if (songData.extensionCode) {
                            extCodeVal.textContent = songData.extensionCode;
                        }
                    }

                    songMessage.style.display = 'none';

                    // Tự động kiểm tra độ rộng chữ của tiêu đề để kích hoạt animation chạy dòng (marquee)
                    const titleContainer = document.getElementById('obs-song-title-container');
                    const currentTheme = localStorage.getItem('dua_theme') || 'enchanted-wild';
                    title.dataset.lastTheme = currentTheme;

                    if (!skipMarquee) {
                        applyMarquee(titleContainer, title, songData.title || "Chưa có tên bài hát", 40);
                    } else {
                        title.classList.remove('marquee');
                        title.style.animationDuration = '0s';
                        title.style.display = 'inline-block';
                        title.style.overflow = 'hidden';
                    }
                };

                // Cập nhật thông tin bài hát
                if (isNewSong) {
                    const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
                    // Kiểm tra xem thẻ "Bài tiếp theo" có đang hiển thị trước đó không để đồng bộ hoạt ảnh morph
                    const wasFullscreenActive = fullscreenCard && fullscreenCard.classList.contains('active');

                    if (fullscreenCard) {
                        fullscreenCard.classList.remove('active');
                        if (widget.dataset.upNextPhase !== 'idle'
                            || widget.classList.contains('show-queue')
                            || widget.classList.contains('next-fullscreen-active')
                            || widget.classList.contains('phase-crossfade')) {
                            clearUpNextPhase();
                        }
                    }
                    if (resumeTimeoutId) {
                        clearTimeout(resumeTimeoutId);
                        resumeTimeoutId = null;
                    }
                    localIsResuming = !!data.isResuming;
                    // A resume request belongs to one song load only. Without this
                    // reset, every later "Phát tiếp" request is ignored because the
                    // previous song already marked its seek as completed.
                    hasSeekedForResume = false;
                    lastResumeSeekAttemptAt = 0;
                    if (localIsResuming) {
                        resumeTargetTime = getSongPlaybackStart(data);
                        resumeTargetTime = resolveSponsorBlockSeekTarget(resumeTargetTime);
                        toggleResumingState(true);
                    } else {
                        resumeTargetTime = 0;
                        toggleResumingState(false);
                    }
                    lastSkippedSegmentKey = null;

                    const playerMain = document.getElementById('obs-player-main');
                    if (playerMain) {
                        playerMain.classList.remove('song-pop-animation');
                    }

                    if (wasFullscreenActive) {
                        // Bỏ qua tất cả các hiệu ứng bounce/changing-text để morph được mượt mà và khớp hoàn toàn.
                        // Cập nhật nội dung và đĩa ngay lập tức và tĩnh.
                        setCoverSrcSafely(data.thumbnail);

                        const details = document.querySelector('.obs-details');
                        if (details) {
                            details.classList.remove('changing-text');
                        }

                        // 1. Reset marquee của tiêu đề trên thẻ fullscreen về dạng tĩnh ngay lập tức
                        const fullscreenTitle = document.getElementById('next-fullscreen-title');
                        if (fullscreenTitle) {
                            fullscreenTitle.classList.remove('marquee');
                            fullscreenTitle.style.animationDuration = '0s';
                            fullscreenTitle.style.display = 'inline-block';
                            fullscreenTitle.style.overflow = 'hidden';
                            fullscreenTitle.textContent = fullscreenTitle.dataset.originalTitle || '';
                            fullscreenTitle.dataset.originalTitle = ''; // Force update next time
                        }

                        // 2. Cập nhật chữ trên player chính dạng tĩnh (skip marquee) để đồng bộ morph
                        updateTextContent(data, true);

                        // 3. Đánh dấu trạng thái morphing và hoãn các chuyển động tự động
                        isMorphingTransitionActive = true;
                        if (morphTimeoutId) clearTimeout(morphTimeoutId);

                        morphTimeoutId = setTimeout(() => {
                            isMorphingTransitionActive = false;

                            // Bắt đầu xoay đĩa nhạc nếu widget đang phát
                            const isWidgetPlaying = widget.classList.contains('playing');
                            if (isWidgetPlaying && coverWrapper) {
                                coverWrapper.classList.add('spinning');
                                coverWrapper.style.animationPlayState = 'running';
                            }

                            // Bắt đầu chạy dòng chữ marquee chính
                            const titleContainer = document.getElementById('obs-song-title-container');
                            applyMarquee(titleContainer, title, data.title || "Chưa có tên bài hát", 40);
                        }, 800);
                    } else {
                        // Cập nhật ngay lập tức và tĩnh, không hiệu ứng nhảy chữ hay nhảy avatar
                        setCoverSrcSafely(data.thumbnail);
                        updateTextContent(data);
                    }

                    lastSongId = data.id;
                    livePlayTime = 0;
                    lastLiveTickTimestamp = null;
                    isLiveStream = false;
                } else if (shouldRestoreAppMetadata) {
                    // Thoát browser fallback không phải là đổi bài. Chỉ khôi phục
                    // metadata app; giữ nguyên player, playhead và lastSongId để
                    // lệnh Play tiếp tục đúng vị trí thay vì tải lại từ đầu.
                    setCoverSrcSafely(data.thumbnail);
                    updateTextContent(data);
                } else if (data.isOwnerAdd && emptyMsgChanged) {
                    updateTextContent(data);
                }

                updatePlaylistOverlayDetails(data);

                // Trực tiếp kiểm tra thay đổi theme để re-apply hoặc reset marquee cho tiêu đề bài hát hiện tại
                const currentTheme = localStorage.getItem('dua_theme') || 'enchanted-wild';
                const hasThemeChanged = (title.dataset.lastTheme !== currentTheme);
                if (hasThemeChanged) {
                    title.dataset.lastTheme = currentTheme;
                    const titleContainer = document.getElementById('obs-song-title-container');
                    applyMarquee(titleContainer, title, data.title || "Chưa có tên bài hát", 40);
                }

                // Đồng bộ hóa các Player (YouTube, Spotify, SoundCloud) trên overlay
                const currentType = data.type || 'youtube';

                if (currentType === 'spotify') {
                    soundCloudLoadRequestId++;
                    clearSoundCloudLoadTimeout();
                    // Tạm dừng các player khác
                    if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') {
                        try { overlayPlayer.pauseVideo(); } catch (e) { }
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch (e) { }
                    }
                    stopDirectAudioStream();

                    // Phát Spotify
                    if (isNewSong || currentVideoId !== data.spotifyId) {
                        lastSongLoadStartTimestamp = Date.now();
                        currentVideoId = data.spotifyId;
                        playSpotifyTrack(data.spotifyId);
                    }
                } else if (currentType === 'soundcloud') {
                    // Tạm dừng các player khác
                    if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') {
                        try { overlayPlayer.pauseVideo(); } catch (e) { }
                    }
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch (e) { }
                    }
                    stopDirectAudioStream();

                    // Phát SoundCloud
                    if (isNewSong || currentVideoId !== data.soundcloudUrl) {
                        lastSongLoadStartTimestamp = Date.now();
                        currentVideoId = data.soundcloudUrl;
                        playSoundCloudTrack(data.soundcloudUrl);
                    }
                } else {
                    soundCloudLoadRequestId++;
                    clearSoundCloudLoadTimeout();
                    // Mặc định: YouTube
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch (e) { }
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch (e) { }
                    }

                    if (isPlayerReady) {
                        if (currentVideoId !== data.videoId || isNewSong) {
                            stopDirectAudioStream();
                            currentVideoId = data.videoId;
                            currentLoudnessDb = null; // Reset loudness khi chuyển bài
                            currentLoudnessVideoId = null;
                            targetVolume = localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : targetVolume;
                            // Mỗi bài dùng một YT.Player riêng. Callback của player cũ
                            // giữ songId cũ và không thể kết thúc nhầm bài vừa chuyển.
                            stopVolumeEnforcer();
                            if (playbackMonitorInterval) {
                                clearInterval(playbackMonitorInterval);
                                playbackMonitorInterval = null;
                            }
                            if (overlayPlayer) {
                                try { overlayPlayer.destroy(); } catch (_) { }
                                overlayPlayer = null;
                            }
                            document.getElementById('obs-youtube-area').innerHTML = '<div id="obs-youtube-placeholder"></div>';
                            console.log("Overlay Player: Tạo player mới cho bài:", data.videoId, "| songId:", activePlaybackSongId);
                            initOverlayPlayer(data.videoId, getSongPlaybackStart(data), activePlaybackSongId);
                        }
                    }
                    // updateOverlayUI runs continuously and is the stable owner of
                    // the active player lifecycle. Recover the monitor here if a
                    // rapid player replacement cleared it after onReady/PLAYING.
                    if (overlayPlayer && !playbackMonitorInterval && !isDirectAudioPlaying) {
                        startPlaybackMonitor();
                    }
                }

                // Cập nhật thanh tiến trình chạy và thời lượng từ chính local Player
                try {
                    let currentTime = 0;
                    let duration = 0;
                    let isPlaying = false;
                    let currentRemainingTime = 999999;

                    if (currentType === 'spotify') {
                        currentTime = currentPlayback.currentTime;
                        duration = currentPlayback.duration;
                        isPlaying = currentPlayback.isPlaying;
                    } else if (currentType === 'soundcloud') {
                        currentTime = currentPlayback.currentTime;
                        duration = currentPlayback.duration;
                        isPlaying = currentPlayback.isPlaying;
                    } else {
                        // YouTube
                        if (isDirectAudioPlaying && directAudioPlayer) {
                            currentTime = directAudioPlayer.currentTime;
                            duration = directAudioPlayer.duration || 0;
                            isPlaying = !directAudioPlayer.paused;
                        } else if (overlayPlayer && typeof overlayPlayer.getCurrentTime === 'function' && typeof overlayPlayer.getPlayerState === 'function') {
                            const playerState = overlayPlayer.getPlayerState();
                            if (playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.PAUSED) {
                                currentTime = overlayPlayer.getCurrentTime();
                                duration = normalizePlaybackDuration(overlayPlayer.getDuration());
                                isPlaying = playerState === YT.PlayerState.PLAYING;

                                // The UI polling path is the most reliable source in OBS's
                                // CEF runtime: if the iframe visibly advances, publish that
                                // exact state back to Dashboard as well. DirectStream already
                                // does this from the audio element's timeupdate event, whereas
                                // iframe playback previously depended only on a separate
                                // monitor interval and could leave Dashboard stuck at 0:00.
                                currentPlayback.currentTime = currentTime;
                                currentPlayback.duration = duration;
                                currentPlayback.isPlaying = isPlaying;
                                updateTrackProgress(currentTime, duration, isPlaying);
                            }
                        }
                    }

                    updateOverlayLyrics(data, currentTime);

                    // Check if player has actually reached the resume playback position
                    if (localIsResuming) {
                        let reachedPlayback = isPlaying && currentTime >= resumeTargetTime - 1.5;
                        if (reachedPlayback) {
                            if (resumeTimeoutId) {
                                clearTimeout(resumeTimeoutId);
                                resumeTimeoutId = null;
                            }
                            localIsResuming = false;
                            toggleResumingState(false);
                        } else {
                            // Đang chờ đến vị trí resume, hiển thị trạng thái chờ
                            toggleResumingState(true);
                        }
                    }

                    // Dùng isLiveStream được set bởi startPlaybackMonitor (chính xác hơn getDuration)
                    const isLive = (currentType === 'youtube' && isLiveStream);

                    const progressContainer = document.getElementById('obs-progress-container');
                    const liveCountdownEl = document.getElementById('obs-live-countdown');
                    const liveCountdownTime = document.getElementById('obs-live-cd-time');

                    if (isLive) {
                        if (progressContainer) progressContainer.style.display = 'none';
                    } else {
                        if (progressContainer) progressContainer.style.display = 'flex';
                        if (liveCountdownEl) liveCountdownEl.classList.remove('visible');
                    }

                    if (isLive || (duration && duration > 0)) {
                        let startPoint = 0;
                        let limitDuration = isLive ? 0 : duration;

                        const currentSongRaw = localStorage.getItem('dua_current_song');
                        if (currentSongRaw) {
                            const song = JSON.parse(currentSongRaw);
                            startPoint = isLive ? 0 : (song.start || 0);
                            let endPoint = limitDuration;

                            if (isLive) {
                                if (song.end && song.end > 0) {
                                    endPoint = song.end;
                                }
                                const maxDur = getEffectiveSongMaxDuration(song);
                                if (maxDur > 0) {
                                    if (endPoint > 0) {
                                        endPoint = Math.min(endPoint, maxDur);
                                    } else {
                                        endPoint = maxDur;
                                    }
                                }
                            } else {
                                if (song.end && song.end > startPoint) {
                                    endPoint = Math.min(endPoint, song.end);
                                }
                                const maxDur = getEffectiveSongMaxDuration(song);
                                if (maxDur > 0) {
                                    endPoint = Math.min(endPoint, startPoint + maxDur);
                                }
                            }
                            limitDuration = isLive ? endPoint : Math.max(1, endPoint - startPoint);
                        }

                        const displayCurrentTime = isLive ? livePlayTime : currentTime;
                        const elapsedTime = limitDuration > 0 ? Math.min(limitDuration, Math.max(0, displayCurrentTime - startPoint)) : displayCurrentTime;
                        const pct = limitDuration > 0 ? ((elapsedTime / limitDuration) * 100) : 100;
                        const safePct = Math.min(100, Math.max(0, pct)) + '%';

                        lastProgressPct = pct;

                        progressFill.style.width = safePct;
                        if (progressThumb) progressThumb.style.left = safePct;
                        if (widget.classList.contains('is-owner-add')) {
                            currentTimeDisplay.textContent = `${formatTime(elapsedTime)} / ${limitDuration > 0 ? formatTime(limitDuration) : "LIVE"}`;
                        } else {
                            currentTimeDisplay.textContent = formatTime(elapsedTime);
                            totalTimeDisplay.textContent = limitDuration > 0 ? formatTime(limitDuration) : "LIVE";
                        }

                        currentRemainingTime = limitDuration > 0 ? Math.max(0, limitDuration - elapsedTime) : Math.max(0, duration - displayCurrentTime);

                        // Hiển thị countdown cho live stream có giới hạn
                        if (isLive && limitDuration > 0 && liveCountdownEl && liveCountdownTime) {
                            const remaining = Math.max(0, limitDuration - elapsedTime);
                            liveCountdownTime.textContent = formatTime(Math.ceil(remaining));
                            liveCountdownEl.classList.add('visible');
                        } else if (liveCountdownEl) {
                            liveCountdownEl.classList.remove('visible');
                        }
                    }

                    // Đồng bộ hoạt ảnh xoay đĩa theo trạng thái phát thực tế
                    // Chỉ gán class/style khi giá trị thực sự thay đổi để tránh Chromium repaint liên tục gây nháy hình bìa (thumbnail)
                    if (isPlaying) {
                        if (!widget.classList.contains('playing')) {
                            widget.classList.add('playing');
                        }
                        if (!isMorphingTransitionActive) {
                            if (!coverWrapper.classList.contains('spinning')) {
                                coverWrapper.classList.add('spinning');
                            }
                            if (coverWrapper.style.animationPlayState !== 'running') {
                                coverWrapper.style.animationPlayState = 'running';
                            }
                        } else {
                            if (coverWrapper.style.animationPlayState !== 'paused') {
                                coverWrapper.style.animationPlayState = 'paused';
                            }
                        }
                    } else {
                        if (coverWrapper.style.animationPlayState !== 'paused') {
                            coverWrapper.style.animationPlayState = 'paused';
                        }
                        if (widget.classList.contains('playing')) {
                            widget.classList.remove('playing');
                        }
                    }

                    // Cập nhật hiển thị mã gia hạn thời gian theo quy tắc:
                    // - Chỉ xuất hiện 90s trước khi TIẾP THEO hiện lên (tức là khi currentRemainingTime <= 120 và > 30)
                    // - Hoặc được kích hoạt thủ công (data.extensionForceShow is true)
                    const extContainerGlobal = document.getElementById('obs-extension-code-container');
                    const extCodeValGlobal = document.getElementById('obs-extension-code');
                    const extRateEl = document.getElementById('obs-extension-rate');
                    if (extContainerGlobal && extCodeValGlobal) {
                        if (data && data.extensionCode) {
                            extCodeValGlobal.textContent = data.extensionCode;

                            // Cập nhật hiển thị rate (ví dụ: 50.000đ / 6 phút)
                            if (extRateEl && data.extensionPrice && data.extensionMinutes) {
                                const priceFormatted = Number(data.extensionPrice).toLocaleString('vi-VN');
                                extRateEl.textContent = `${priceFormatted}đ / ${data.extensionMinutes} phút`;
                            } else if (extRateEl) {
                                extRateEl.textContent = '';
                            }

                            const isManual = !!data.extensionForceShow && !isExtensionNotificationActive;
                            const allowed = isExtensionAllowedForSong(data, duration);

                            if (allowed && isManual) {
                                extContainerGlobal.style.display = 'flex';
                                widget.classList.add('obs-ext-active');
                            } else {
                                extContainerGlobal.style.display = 'none';
                                widget.classList.remove('obs-ext-active');
                            }
                        } else {
                            extContainerGlobal.style.display = 'none';
                            widget.classList.remove('obs-ext-active');
                        }
                    }
                } catch (e) {
                    // Thầm lặng bỏ qua
                }

               // Hiển thị widget
                if (!widget.classList.contains('active')) {
                    widget.classList.add('active');
                }
                // Tự động kiểm tra và phục hồi marquee nếu có phần tử đang chờ hoặc kích thước thay đổi
                if (typeof refreshAllActiveMarquees === 'function') {
                    refreshAllActiveMarquees();
                }

            } catch (err) {
                console.error("Error reading storage:", err);
            }
        }

        // Hàm kích hoạt popup thông báo donate mới
        function triggerNewDonationAlert(alertData) {
            try {
                publishMqtt('overlay_log', { msg: "triggerNewDonationAlert called", data: alertData });
                const alertBox = document.getElementById('obs-alert-box');
                if (!alertBox) {
                    publishMqtt('overlay_error', { message: "alertBox element is null" });
                    return;
                }

                // Layout modern elements
                const alertModernThumb = document.getElementById('alert-modern-thumb');
                const alertModernSong = document.getElementById('alert-modern-song');
                const alertModernSongContainer = document.getElementById('alert-modern-song-container');
                const alertModernDonor = document.getElementById('alert-modern-donor');
                const alertModernAmount = document.getElementById('alert-modern-amount');
                const alertModernStatus = document.getElementById('alert-modern-status');
                const alertPlaylistBadge = document.getElementById('alert-modern-playlist-badge');

                const nextSongDrawer = document.getElementById('obs-next-song-drawer');
                if (nextSongDrawer) {
                    nextSongDrawer.classList.remove('show');
                }

                const donorText = alertData.donorName || 'Khách';
                const amountText = alertData.amount ? alertData.amount.toLocaleString('vi-VN') + ' ₫' : '0 ₫';
                const songTitle = alertData.title || 'Không rõ';
                const pos = alertData.position || '';
                const isPlaylistAlert = alertData.isPlaylist === true || Boolean(alertData.playlistRequestId);
                const alertDurationLimit = calculateNextSongLimitDuration(alertData);

                const targetSrc = alertData.thumbnail || (alertData.type === 'youtube'
                    ? `https://img.youtube.com/vi/${alertData.videoId}/hqdefault.jpg`
                    : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');

                const modernDurEl = document.getElementById('alert-modern-duration');
                if (modernDurEl) {
                    if (alertDurationLimit > 0) {
                        modernDurEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px; display: inline-block; margin-top: -2px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${formatTime(alertDurationLimit)}`;
                        modernDurEl.style.display = 'block';
                    } else {
                        modernDurEl.style.display = 'none';
                    }
                }
                // 2. Populate Modern Layout
                // Thumbnail
                if (alertModernThumb) {
                    alertModernThumb.src = targetSrc;
                }

                // Title with marquee
                if (alertModernSong && alertModernSongContainer) {
                    applyMarquee(alertModernSongContainer, alertModernSong, songTitle, 55);
                }

                // Donor Name and Amount
                if (alertModernDonor) alertModernDonor.textContent = donorText;
                if (alertModernAmount) alertModernAmount.textContent = amountText;
                if (alertPlaylistBadge) alertPlaylistBadge.hidden = !isPlaylistAlert;

                // Status text / countdown equivalent
                if (alertModernStatus) {
                    const cleanPos = String(pos || '').trim().toUpperCase();
                    if (isPlaylistAlert) {
                        const trackCount = Number(alertData.playlistTotalTracks || 0);
                        alertModernStatus.textContent = trackCount > 0 ? `${trackCount} video` : 'Playlist';
                    } else if (cleanPos === 'ĐANG PHÁT' || cleanPos === 'DANG PHAT') {
                        alertModernStatus.textContent = 'Đang phát';
                    } else if (cleanPos === 'TIẾP THEO' || cleanPos === 'TIEP THEO') {
                        alertModernStatus.textContent = 'Tiếp theo';
                    } else if (cleanPos === 'DONATE' || cleanPos === 'ỦNG HỘ' || cleanPos === 'UNG HO') {
                        alertModernStatus.textContent = 'Ủng hộ';
                    } else if (cleanPos) {
                        const posNum = String(pos).replace('#', '');
                        alertModernStatus.textContent = `Hàng đợi số ${posNum}`;
                    } else {
                        alertModernStatus.textContent = '';
                    }
                }

                // Message if present
                const alertModernMessage = document.getElementById('alert-modern-message');
                if (alertModernMessage) {
                    const cleanMsg = alertData.message ? String(alertData.message).trim() : '';
                    if (cleanMsg !== '') {
                        alertModernMessage.textContent = cleanMsg;
                        alertModernMessage.style.display = 'block';
                    } else {
                        alertModernMessage.textContent = '';
                        alertModernMessage.style.display = 'none';
                    }
                }

                // Sync alert action text for the new modern badge as well
                updateAlertActionTextDisplay();

                const widget = document.getElementById('obs-player-widget');
                if (widget) {
                    widget.style.display = '';
                    widget.classList.add('active');
                    widget.classList.add('alert-active');
                    syncSpecialLyricsLayout();
                    transitionOverlayWidgetHeight(getOverlayRestingHeight());
                }

                // Ẩn empty overlay tạm thời nếu có để tránh đè lên alert
                const emptyOverlay = document.getElementById('obs-empty-overlay');
                if (emptyOverlay) {
                    emptyOverlay.classList.remove('active');
                }

                // Reset hoạt ảnh bằng cách xóa và thêm lại class active
                alertBox.classList.remove('active');
                void alertBox.offsetWidth; // Trigger reflow để reset transition
                alertBox.classList.add('active');

                // Ẩn thông báo sau 6 giây.
                if (alertTimeout) clearTimeout(alertTimeout);
                if (window._alertActiveClassTimeout) {
                    clearTimeout(window._alertActiveClassTimeout);
                    window._alertActiveClassTimeout = null;
                }
                alertTimeout = setTimeout(() => {
                    alertBox.classList.remove('active');
                    window._alertActiveClassTimeout = setTimeout(() => {
                        window._alertActiveClassTimeout = null;
                        if (widget) {
                            widget.classList.remove('alert-active');
                            syncSpecialLyricsLayout();
                            transitionOverlayWidgetHeight(getOverlayRestingHeight());
                            if (typeof refreshAllActiveMarquees === 'function') {
                                refreshAllActiveMarquees(true);
                                setTimeout(() => refreshAllActiveMarquees(true), 350);
                            }
                        }
                    }, 320);
                }, 6000);
            } catch (err) {
                console.error("Error in triggerNewDonationAlert:", err);
                publishMqtt('overlay_error', { message: err.message, stack: err.stack, alertData: alertData });
            }
        }

        function updateLyricsRealtimeSync() {
            if (localStorage.getItem('dua_lyrics_enabled') === 'false') {
                if (overlayLyrics && !overlayLyrics.hidden) overlayLyrics.hidden = true;
                return;
            }
            if (isPreview || isLuckyRolling) return;
            // Khi app đang pause/stop và browser media đang phát, loop 200ms của
            // updateOverlayUI đã gọi updateOverlayLyrics(null) để tắt lyrics.
            // Không để loop 5ms này override ngược lại — tránh giật do xung đột.
            if (lastCommandType === 'pause' || lastCommandType === 'stop') {
                if (getBrowserMediaOwnerSong()) return;
            }
            let song = null;
            try {
                song = JSON.parse(localStorage.getItem('dua_current_song') || 'null');
            } catch (_) {
                return;
            }
            const lyrics = song?.lyrics;
            if (!lyrics?.available || lyrics.synced === false
                || !Array.isArray(lyrics.lines) || !lyrics.lines.length) return;

            const mediaType = song.type || 'youtube';
            let currentTime = Math.max(0, Number(currentPlayback.currentTime) || 0);
            let isPlaying = Boolean(currentPlayback.isPlaying);
            try {
                if (mediaType === 'youtube' && isDirectAudioPlaying && directAudioPlayer) {
                    currentTime = Math.max(0, Number(directAudioPlayer.currentTime) || 0);
                    isPlaying = !directAudioPlayer.paused && !directAudioPlayer.ended;
                } else if (mediaType === 'youtube' && overlayPlayer?.getCurrentTime) {
                    currentTime = Math.max(0, Number(overlayPlayer.getCurrentTime()) || 0);
                    isPlaying = overlayPlayer.getPlayerState?.() === YT.PlayerState.PLAYING;
                }
            } catch (_) { }

            updateOverlayLyrics(song, currentTime);
            if (!isPlaying) return;
            publishMqtt('lyrics_timing', {
                songId: song.id ?? null,
                currentTime
            });
        }

        // Lyrics have an isolated 5ms clock. The full player UI and normal
        // playback-state transport intentionally keep their existing cadence.
        setInterval(updateLyricsRealtimeSync, LYRICS_TIMING_INTERVAL_MS);

        // Kiểm tra thay đổi liên tục bằng vòng lặp hoạt ảnh (200ms một lần là đủ mượt và nhẹ)
        setInterval(updateOverlayUI, 200);

        // Lắng nghe cả sự kiện Storage của trình duyệt (giúp phản ứng ngay lập tức)

        // =========================================================================
        // --- CƠ SỞ DỮ LIỆU REALTIME (OBS OVERLAY SIDE) ---
        // =========================================================================

        // Phân tích tham số URL để tìm key hoặc token đồng bộ
        const zypageToken = urlParams.get('token');
        const localKey = urlParams.get('key');
        // `key` là channel do Dashboard hiện tại cấp. Token chỉ còn là fallback cho URL OBS cũ.
        const channelId = localKey || zypageToken;

        let wsClient = null;
        let isWsConnecting = false;
        let realtimeReconnectTimer = null;
        const realtimeOutbox = [];
        const receivedRealtimeEventIds = new Set();

        function initRealtimeDatabase() {
            if (isPreview) return;
            initLocalRealtimeChangefeed();
        }

        function initLocalRealtimeChangefeed() {
            if (isPreview) return;
            if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
                return;
            }
            if (isWsConnecting) return;
            isWsConnecting = true;

            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Tự động nhận diện host/port chạy local web server, fallback về localhost:3000 khi mở file trực tiếp
            const wsHost = window.location.host || 'localhost:3000';
            const wsUrl = `${wsProtocol}//${wsHost}/ws`;

            console.log(`Overlay: Đang kết nối Local WebSocket tới: ${wsUrl}...`);

            try {
                wsClient = new WebSocket(wsUrl);

                wsClient.onopen = () => {
                    isWsConnecting = false;
                    if (realtimeReconnectTimer) {
                        clearTimeout(realtimeReconnectTimer);
                        realtimeReconnectTimer = null;
                    }
                    console.log("Overlay: Đang listening Local Realtime DB.");

                    // Server đẩy snapshot mới nhất ngay sau subscribe; không GET/PUT hay polling.
                    sendLocalWebSocketMessage({ type: 'realtime.subscribe', role: 'overlay', channelId, timestamp: Date.now() });
                    while (realtimeOutbox.length && wsClient?.readyState === WebSocket.OPEN) {
                        wsClient.send(JSON.stringify(realtimeOutbox.shift()));
                    }
                    sendLocalWebSocketMessage({ type: 'request_sync', data: {}, timestamp: Date.now() });
                };

                wsClient.onmessage = (event) => {
                    handleMqttMessage(null, event.data);
                };

                wsClient.onclose = () => {
                    isWsConnecting = false;
                    wsClient = null;
                    console.log("Overlay: Changefeed bị đóng. Đang kết nối lại...");
                    if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
                    realtimeReconnectTimer = setTimeout(initLocalRealtimeChangefeed, REALTIME_RECONNECT_DELAY_MS);
                };

                wsClient.onerror = (err) => {
                    isWsConnecting = false;
                    console.error("Overlay WebSocket error:", err);
                };

            } catch (e) {
                isWsConnecting = false;
                console.error("Overlay WebSocket connection failed:", e);
                setTimeout(initLocalRealtimeChangefeed, REALTIME_RECONNECT_DELAY_MS * 2);
            }
        }

        function sendLocalWebSocketMessage(messageObj) {
            const envelope = { ...messageObj, channelId: messageObj.channelId || channelId };
            if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
                if (!['realtime.heartbeat', 'overlay_state', 'lyrics_timing', 'progress'].includes(envelope.type)) {
                    realtimeOutbox.push(envelope);
                    if (realtimeOutbox.length > 100) realtimeOutbox.shift();
                }
                return false;
            }
            try {
                wsClient.send(JSON.stringify(envelope));
                return true;
            } catch (err) {
                console.error('Overlay WebSocket send error:', err);
                return false;
            }
        }

        function publishMqtt(type, payload) {
            const messageObj = {
                version: 1,
                type,
                data: payload,
                timestamp: Date.now(),
                eventId: window.makeEventId?.(type || 'overlay') || `${type}:${Date.now()}:${Math.random()}`,
                source: 'overlay'
            };
            if (type === 'overlay_state') {
                messageObj.state = payload;
            } else if (type === 'overlay_event') {
                messageObj.event = payload;
            }

            sendLocalWebSocketMessage(messageObj);
        }

        function applyRealtimeSnapshot(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') return;
            let snapshotCurrentSong = null;
            if (Object.prototype.hasOwnProperty.call(snapshot, 'currentSong')) {
                snapshotCurrentSong = snapshot.currentSong;
                if (snapshotCurrentSong) localStorage.setItem('dua_current_song', JSON.stringify(snapshotCurrentSong));
                else localStorage.removeItem('dua_current_song');
            }
            if (Array.isArray(snapshot.queue)) localStorage.setItem('dua_queue', JSON.stringify(snapshot.queue));
            if (snapshot.activePlaylist) localStorage.setItem('dua_active_playlist', JSON.stringify(snapshot.activePlaylist));
            else localStorage.removeItem('dua_active_playlist');
            if (snapshot.settings) localStorage.setItem('dua_playlist_settings', JSON.stringify(snapshot.settings));
            const config = snapshot.overlayConfig;
            if (config && typeof config === 'object') {
                if (config.volume !== undefined) syncTargetVolume(config.volume);
                if (config.maxDuration !== undefined) localStorage.setItem('dua_max_duration', String(config.maxDuration));
                if (config.timeLimitConfig) {
                    localStorage.setItem('dua_time_limit_config', JSON.stringify(config.timeLimitConfig));
                    if (config.timeLimitConfig.showIdlePriceTable !== undefined) {
                        localStorage.setItem('dua_show_idle_price_table', config.timeLimitConfig.showIdlePriceTable ? 'true' : 'false');
                    }
                }
                if (config.alertActionText !== undefined) localStorage.setItem('dua_alert_action_text', String(config.alertActionText));
                if (config.emptyQueueMessage !== undefined) localStorage.setItem('dua_empty_queue_message', String(config.emptyQueueMessage));
                if (config.hideEmptyOverlay !== undefined) localStorage.setItem('dua_hide_empty_overlay', config.hideEmptyOverlay ? 'true' : 'false');
                if (config.showOverlayLyrics !== undefined) localStorage.setItem('dua_show_overlay_lyrics', config.showOverlayLyrics ? 'true' : 'false');
                if (config.lyricsEnabled !== undefined) localStorage.setItem('dua_lyrics_enabled', config.lyricsEnabled ? 'true' : 'false');
                if (config.focusMode !== undefined) localStorage.setItem('dua_focus_mode', config.focusMode ? 'true' : 'false');
                if (config.focusModeMessage !== undefined) localStorage.setItem('dua_focus_mode_message', String(config.focusModeMessage));
                if (config.directStreamFallbackEnabled !== undefined) {
                    localStorage.setItem('dua_yt_bypass_enabled', config.directStreamFallbackEnabled ? 'true' : 'false');
                }
                if (config.theme) applyTheme(config.theme);
                if (config.opacity !== undefined) applyOpacity(String(config.opacity));
            }
            // Giới hạn gắn với bài hiện tại luôn có độ ưu tiên cao nhất. Snapshot
            // cũ từng ghi maxDuration của bài rồi bị overlayConfig mặc định đè lại,
            // khiến Dashboard hiển thị 3:41 nhưng Overlay chỉ còn 3:00.
            if (snapshotCurrentSong?.maxDuration !== undefined) {
                localStorage.setItem('dua_max_duration', String(snapshotCurrentSong.maxDuration));
            }
            updateOverlayUI();
        }

        function handlePlaylistRealtimeEvent(payload) {
            const eventData = payload?.data || {};

            if (payload.type === 'playlist.started' || payload.type === 'playlist.track_started') {
                localStorage.setItem('dua_active_playlist', JSON.stringify(eventData));
                updateOverlayUI();
            } else if (payload.type === 'playlist.track_progress') {
                const previous = JSON.parse(localStorage.getItem('dua_active_playlist') || '{}');
                localStorage.setItem('dua_active_playlist', JSON.stringify({ ...previous, ...eventData }));
            } else if (payload.type === 'playlist.completed') {
                localStorage.removeItem('dua_active_playlist');
                updateOverlayUI();
            }
        }

        function handleMqttMessage(topic, messageStr) {
            try {
                let payload = typeof messageStr === 'string' ? JSON.parse(messageStr) : messageStr;
                if (!payload) return;
                payload = normalizePayloadStrings(payload);

                if (payload.eventId) {
                    if (receivedRealtimeEventIds.has(payload.eventId)) return;
                    receivedRealtimeEventIds.add(payload.eventId);
                    if (receivedRealtimeEventIds.size > 500) {
                        receivedRealtimeEventIds.delete(receivedRealtimeEventIds.values().next().value);
                    }
                }

                console.log("Overlay nhận sự kiện realtime:", payload.type);

                if (payload.type === 'overlay.snapshot') {
                    applyRealtimeSnapshot(payload.data);
                } else if (payload.type === 'browser_media_state') {
                    browserMediaState = payload.data && typeof payload.data === 'object'
                        ? payload.data
                        : null;
                    updateOverlayUI();
                } else if (payload.type === 'direct_stream_config') {
                    localStorage.setItem('dua_yt_bypass_enabled', payload.data?.enabled === false ? 'false' : 'true');
                } else if (payload.type === 'lyrics_config') {
                    localStorage.setItem('dua_lyrics_enabled', payload.data?.enabled === false ? 'false' : 'true');
                    updateOverlayUI();
                } else if (payload.type === 'queue.updated') {
                    const queue = Array.isArray(payload.data?.queue) ? payload.data.queue : [];
                    localStorage.setItem('dua_queue', JSON.stringify(queue));
                    updateOverlayUI();
                } else if (payload.type && payload.type.startsWith('playlist.')) {
                    handlePlaylistRealtimeEvent(payload);
                } else if (payload.type === 'current_song') {
                    const song = payload.data;
                    if (!song) {
                        localStorage.removeItem('dua_current_song');
                    } else {
                        let previousSongId = null;
                        try {
                            previousSongId = JSON.parse(localStorage.getItem('dua_current_song') || 'null')?.id ?? null;
                        } catch (_) { }
                        const isActualSongChange = previousSongId === null || String(previousSongId) !== String(song.id);
                        // Apply the song snapshot volume before updateOverlayUI creates
                        // or loads the next player. This avoids a race with the separate
                        // `control_command: volume` event. Metadata-only republish for
                        // the same song (for example after adding from History) must not
                        // restore a stale volume and mute the active player.
                        if (isActualSongChange && song.volume !== undefined) syncTargetVolume(song.volume);
                        localStorage.setItem('dua_current_song', JSON.stringify(song));
                        // Đồng bộ giới hạn thời gian từ bài hát
                        if (song.maxDuration !== undefined) {
                            localStorage.setItem('dua_max_duration', song.maxDuration);
                        }
                    }
                    updateOverlayUI();
                } else if (payload.type === 'control_command') {
                    const cmd = payload.data;
                    if (!cmd) return;

                    if (cmd.timestamp === lastCommandTimestamp) return;
                    lastCommandTimestamp = cmd.timestamp;

                    executeControlCommand(cmd);
                } else if (payload.type === 'max_duration') {
                    const maxDurVal = payload.data?.value;
                    if (maxDurVal !== undefined) {
                        syncCurrentSongMaxDuration(maxDurVal);
                    }
                    const timeLimitConfig = payload.data?.config;
                    if (timeLimitConfig && typeof timeLimitConfig === 'object') {
                        const nextConfig = JSON.stringify(timeLimitConfig);
                        const oldConfig = localStorage.getItem('dua_time_limit_config');
                        if (timeLimitConfig.showIdlePriceTable !== undefined) {
                            localStorage.setItem('dua_show_idle_price_table', timeLimitConfig.showIdlePriceTable ? 'true' : 'false');
                        }
                        if (oldConfig !== nextConfig) {
                            localStorage.setItem('dua_time_limit_config', nextConfig);
                            updateOverlayUI();
                        }
                    }
                } else if (payload.type === 'empty_queue_message') {
                    const text = payload.data?.text;
                    if (text !== undefined) {
                        localStorage.setItem('dua_empty_queue_message', text);
                        updateOverlayUI();
                    }
                } else if (payload.type === 'owner_add_alert') {
                    const alertData = payload.data;
                    if (alertData) {
                        localStorage.setItem('dua_owner_add_alert', JSON.stringify(alertData));
                        triggerOwnerAddAlert(alertData);
                    }
                } else if (payload.type === 'new_donation_alert') {
                    const alertData = payload.data;
                    if (alertData) {
                        localStorage.setItem('dua_new_donation_alert', JSON.stringify(alertData));
                        triggerNewDonationAlert(alertData);
                    }
                } else if (payload.type === 'theme_change') {
                    const theme = applyTheme(payload.data?.theme || 'enchanted-wild');
                    const oldTheme = localStorage.getItem('dua_theme');
                    if (oldTheme !== theme) {
                        localStorage.setItem('dua_theme', theme);
                    }
                } else if (payload.type === 'opacity_change') {
                    const opacity = payload.data?.opacity || '100';
                    const oldOpacity = localStorage.getItem('dua_opacity');
                    if (oldOpacity !== opacity) {
                        localStorage.setItem('dua_opacity', opacity);
                        applyOpacity(opacity);
                    }
                } else if (payload.type === 'alert_action_text') {
                    const text = payload.data?.text;
                    if (text !== undefined) {
                        localStorage.setItem('dua_alert_action_text', text);
                        updateAlertActionTextDisplay();
                    }
                } else if (payload.type === 'hide_empty_overlay') {
                    const val = payload.data?.value;
                    if (val !== undefined) {
                        const oldVal = localStorage.getItem('dua_hide_empty_overlay');
                        const newValStr = val ? 'true' : 'false';
                        if (oldVal !== newValStr) {
                            localStorage.setItem('dua_hide_empty_overlay', newValStr);
                            updateOverlayUI();
                        }
                    }
                } else if (payload.type === 'show_overlay_lyrics') {
                    const val = payload.data?.value;
                    if (val !== undefined) {
                        const oldVal = localStorage.getItem('dua_show_overlay_lyrics');
                        const newValStr = val ? 'true' : 'false';
                        if (oldVal !== newValStr) {
                            localStorage.setItem('dua_show_overlay_lyrics', newValStr);
                            updateOverlayUI();
                        }
                    }
                } else if (payload.type === 'focus_mode') {
                    const val = payload.data?.value;
                    if (val !== undefined) {
                        const oldVal = localStorage.getItem('dua_focus_mode');
                        const newValStr = val ? 'true' : 'false';
                        if (oldVal !== newValStr) {
                            localStorage.setItem('dua_focus_mode', newValStr);
                            updateOverlayUI();
                        }
                    }
                } else if (payload.type === 'focus_mode_message') {
                    const text = payload.data?.text;
                    if (text !== undefined) {
                        localStorage.setItem('dua_focus_mode_message', text);
                        updateOverlayUI();
                    }
                } else if (payload.type === 'sensitive_videos_url') {
                    const url = payload.data?.url;
                    if (url !== undefined) {
                        const oldUrl = localStorage.getItem('dua_sensitive_videos_url');
                        if (oldUrl !== url) {
                            localStorage.setItem('dua_sensitive_videos_url', url);
                            fetchSensitiveVideosConfig();
                        }
                    }
                } else if (payload.type === 'sb_categories') {
                    const cats = payload.data;
                    if (cats && typeof cats === 'object') {
                        sponsorBlockCategories = {
                            ...defaultSponsorBlockCategories,
                            ...cats
                        };
                        localStorage.setItem('dua_sb_categories', JSON.stringify(sponsorBlockCategories));
                    }
                } else if (payload.type === 'pubg_state') {
                    const running = payload.data?.running;
                    const overlayContainer = document.getElementById('obs-player-widget') || document.body;
                    if (running) {
                        overlayContainer.style.opacity = '0';
                        overlayContainer.style.pointerEvents = 'none';
                        overlayContainer.style.transition = 'opacity 0.5s ease';
                    } else {
                        overlayContainer.style.opacity = '';
                        overlayContainer.style.pointerEvents = '';
                        overlayContainer.style.transition = 'opacity 0.5s ease';
                    }
                }
            } catch (e) {
                console.error("Overlay: Lỗi xử lý sự kiện realtime:", e);
            }
        }

        // Khởi động kết nối realtime database khi tải trang
        initRealtimeDatabase();

        // Keep connection status alive even while no song is loaded.
        if (!isPreview) {
            setInterval(() => {
                publishMqtt('realtime.heartbeat', {
                    connected: true,
                    overlayUrl: location.href
                });
            }, 3000);
        }

        // Áp dụng tỉ lệ thu phóng (zoom/scale) cho các widget overlay nếu được truyền từ URL
        const scaleVal = parseFloat(urlParams.get('scale')) || 1.0;
        if (scaleVal !== 1.0) {
            const overlayContent = document.getElementById('overlay-content');
            if (overlayContent) {
                // Chromium zoom rasterizes text at the requested output size.
                // A transform scales an already-rendered layer and looks soft in OBS.
                overlayContent.style.zoom = String(scaleVal);
                overlayContent.style.transform = 'none';
            }
        }

        // Bắt tương tác click vào trang để giải phóng chính sách chặn âm thanh tự động phát của trình duyệt
        document.body.addEventListener('click', () => {
            if (warningCountdownInterval) {
                console.log("Overlay: Đang đếm ngược cảnh báo nhạy cảm, bỏ qua kích hoạt click phát lại.");
                return;
            }
            console.log("Overlay: Người dùng đã tương tác click. Kích hoạt phát lại các trình phát...");
            // Giải phóng Spotify
            if (spotifyEmbedController) {
                try { spotifyEmbedController.play(); } catch (e) { }
            }
            // Giải phóng SoundCloud
            if (soundCloudWidget) {
                try { soundCloudWidget.play(); } catch (e) { }
            }
        });

        // Lắng nghe sự kiện resize cửa sổ hoặc khi font chữ tải xong để tính toán lại marquee chính xác
        window.addEventListener('resize', () => {
            if (typeof refreshAllActiveMarquees === 'function') refreshAllActiveMarquees(true);
        });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                if (typeof refreshAllActiveMarquees === 'function') refreshAllActiveMarquees(true);
            }).catch(() => {});
        }

        // Chạy kiểm tra ngay khi load
        updateOverlayUI();
    