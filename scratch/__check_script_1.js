
        // Tự động chuyển hướng từ 127.0.0.1 sang localhost để tránh lệch origin localStorage
        if (window.location.hostname === '127.0.0.1') {
            window.location.replace(window.location.href.replace('127.0.0.1', 'localhost'));
        }

        // Phân tích tham số URL
        const urlParams = new URLSearchParams(window.location.search);

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
        fetchSensitiveVideosConfig();

        // Tự động tải lại cấu hình video nhạy cảm mỗi 10 phút (600000ms)
        setInterval(fetchSensitiveVideosConfig, 10 * 60 * 1000);

        // Hàm áp dụng theme
        function applyTheme(theme) {
            document.body.className = '';
            if (theme === 'spacegods') {
                document.body.classList.add('theme-spacegods');
            } else if (theme === 'cutepink') {
                document.body.classList.add('theme-cutepink');
            } else if (theme === 'classic') {
                document.body.classList.add('theme-classic');
            } else if (theme === 'classic-dark') {
                document.body.classList.add('theme-classic-dark');
            } else if (theme === 'frosted-glass') {
                document.body.classList.add('theme-frosted-glass');
            } else if (theme === 'frosted-glass-light') {
                document.body.classList.add('theme-frosted-glass-light');
            }
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
        const initialTheme = urlParams.get('theme') || localStorage.getItem('dua_theme') || 'pineapple';
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

        let overlayPlayer = null;
        let isPlayerReady = false;
        let currentVideoId = null;
        let lastSongId = null;
        let isMorphingTransitionActive = false;
        let morphTimeoutId = null;
        let lastSongLoadStartTimestamp = 0;
        let stuckStateStartTime = null;
        let lastWarnedSongId = null;
        let warningCountdownInterval = null;
        let voteSkipCountdownInterval = null;
        let localVoteSkipSuccessHandled = false;
        let warningSongId = null;
        let alertTimeout = null;
        let playbackMonitorInterval = null;
        let livePlayTime = 0;
        let lastLiveTickTimestamp = null;
        let isLiveStream = false; // Detect live stream chính xác qua getVideoData().isLive
        let lastCommandTimestamp = 0;
        let lastCommandType = 'play';
        let destroyTimeout = null;
        let mqttClient = null;
        let mqttTopic = null;
        let syncInterval = null;
        let isSponsorBlockNotificationActive = false;
        let sbToastTimeout = null;
        let localIsResuming = false;
        let resumeTargetTime = 0;
        let resumeTimeoutId = null;
        let hasSeekedForResume = false;

        // Biến lưu mức âm lượng mục tiêu — đây là nguồn sự thật duy nhất cho âm lượng
        let targetVolume = localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : 80;
        // Interval liên tục ép âm lượng trong giai đoạn chuyển bài (chống YouTube reset async)
        let volumeEnforcerInterval = null;
        let volumeEnforcerStartTime = 0;

        let skipSegments = [];
        let sponsorBlockCategories = {};
        let lastSBSeekTimestamp = 0;
        let lastSBSeekTarget = 0;
        let lastSkippedSegmentKey = null;

        let currentPlayback = {
            currentTime: 0,
            duration: 0,
            isPlaying: false
        };
        let currentRemainingTime = 999999;
        let spotifyEmbedController = null;
        let currentSpotifyId = null;
        let isSpotifySdkLoaded = false;
        let pendingSpotifyTrackId = null;
        let soundCloudWidget = null;
        let currentSoundCloudUrl = null;
        let isSoundCloudSdkLoaded = false;
        let soundCloudDuration = 0;

        // yt-dlp direct stream bypass variables
        let directAudioPlayer = null;
        let isDirectAudioPlaying = false;
        let currentDirectVideoId = null;
        let directAudioDuration = 0;

        // Biến quản lý phase ngăn kéo "Tiếp theo"
        let currentDrawerText = "";

        function applyMarquee(containerEl, textEl, text, baseSpeed = 30) {
            if (!containerEl || !textEl) return;
            
            textEl.classList.remove('marquee');
            textEl.style.animationDuration = '0s';
            textEl.style.display = 'inline-block';
            textEl.style.overflow = 'hidden';
            textEl.textContent = text;
            
            setTimeout(() => {
                const containerWidth = containerEl.offsetWidth;
                const textWidth = textEl.scrollWidth;
                if (textWidth > containerWidth) {
                    textEl.innerHTML = `<span style="padding-right: 2rem;">${text}</span><span style="padding-right: 2rem;">${text}</span>`;
                    textEl.classList.add('marquee');
                    textEl.style.animationDuration = `${Math.max(5, textWidth / baseSpeed)}s`;
                    textEl.style.display = 'inline-block';
                    textEl.style.overflow = 'visible';
                } else {
                    textEl.style.display = 'inline-block';
                    textEl.style.overflow = 'hidden';
                }
            }, 50);
        }

        function calculateNextSongLimitDuration(nextSong) {
            if (!nextSong) return 0;
            
            let startPoint = nextSong.start || 0;
            let originalDuration = 0;
            if (nextSong.end && nextSong.end > startPoint) {
                originalDuration = nextSong.end - startPoint;
            }
            
            const maxDurationEnabled = localStorage.getItem('dua_max_duration_enabled') === 'true';
            
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
                    } catch (e) {}
                    
                    if (!milestones || milestones.length === 0) {
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

        function updateNextSongSequence(remainingTime, song) {
            const drawer = document.getElementById('obs-next-song-drawer');
            const modal = document.getElementById('obs-next-songs-modal');
            const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
            
            if (!drawer || !modal || !fullscreenCard) return;
            
            const alertBox = document.getElementById('obs-alert-box');
            const hasAlert = alertBox && alertBox.classList.contains('active');
            const hasNoNext = !song || !song.nextSongTitle;
            
            if (hasAlert || isSponsorBlockNotificationActive || hasNoNext || remainingTime < 0) {
                drawer.classList.remove('show');
                modal.classList.remove('show');
                fullscreenCard.classList.remove('active');
                if (widget) {
                    widget.classList.remove('show-queue');
                    widget.classList.remove('next-fullscreen-active');
                }
                return;
            }
            
            const currentTheme = localStorage.getItem('dua_theme') || 'pineapple';
            const isClassic = ['classic', 'classic-dark'].includes(currentTheme);
            
            // Phase 1: 30s left to 15s left -> Show 3 next songs
            if (remainingTime <= 30 && remainingTime > 15) {
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
                const nextSongs = idx !== -1 ? queue.slice(idx + 1, idx + 5) : queue.slice(0, 4);
                
                if (isClassic) {
                    modal.classList.remove('show');
                    drawer.classList.remove('show');
                    
                    const classicQueueEl = document.getElementById('obs-classic-queue');
                    if (classicQueueEl) {
                        let queueHtml = '<div class="classic-next-songs-container">';
                        if (nextSongs.length > 0) {
                            nextSongs.forEach((ns, index) => {
                                let titleText = ns.title || 'Không rõ tên bài hát';
                                let metaText = '';
                                if (ns.isOwnerAdd) {
                                    metaText = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                                } else {
                                    const donor = ns.donorName || 'Khách';
                                    const amount = (ns.amount && Number(ns.amount) > 0)
                                        ? ` · ${Number(ns.amount).toLocaleString('vi-VN')} ₫`
                                        : '';
                                    metaText = `<span class="classic-next-song-donor">${donor}</span>${amount}`;
                                }
                                let label = '';
                                if (index === 0) {
                                    label = 'Tiếp';
                                } else {
                                    label = `#${index + 1}`;
                                }

                                queueHtml += `
                                    <div class="classic-next-song-item">
                                        <div class="classic-next-song-title" title="${titleText}">
                                            <span class="classic-next-song-label">${label}:</span>${titleText}
                                        </div>
                                        <div class="classic-next-song-meta" title="${metaText.replace(/<[^>]*>/g, '')}">${metaText}</div>
                                    </div>
                                `;
                            });
                        } else {
                            queueHtml += `
                                <div style="font-style: italic; font-size: 0.85rem; text-align: center; width: 100%;">
                                    Hết bài hát tiếp theo
                                </div>
                            `;
                        }
                        queueHtml += '</div>';
                        classicQueueEl.innerHTML = queueHtml;
                    }
                    if (widget) {
                        widget.classList.add('show-queue');
                        widget.classList.remove('next-fullscreen-active');
                    }
                } else {
                    if (widget) {
                        widget.classList.remove('show-queue');
                        widget.classList.remove('next-fullscreen-active');
                    }
                    drawer.classList.remove('show');
                    
                    const listEl = document.getElementById('obs-next-songs-list');
                    if (listEl) {
                        listEl.innerHTML = '';
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
            }
            // Phase 2: 15s left to 0s left -> Show Fullscreen card
            else if (remainingTime <= 15 && remainingTime >= 0) {
                drawer.classList.remove('show');
                modal.classList.remove('show');
                if (widget) {
                    widget.classList.remove('show-queue');
                    widget.classList.add('next-fullscreen-active');
                }
                
                let queue = [];
                try {
                    const rawQueue = localStorage.getItem('dua_queue');
                    if (rawQueue) {
                        queue = JSON.parse(rawQueue);
                    }
                } catch (e) {}
                
                let idx = -1;
                if (song && song.id) {
                    idx = queue.findIndex(s => String(s.id) === String(song.id));
                }
                const nextSong = idx !== -1 ? queue[idx + 1] : queue[0];
                
                if (nextSong) {
                    const thumbEl = document.getElementById('next-fullscreen-thumb');
                    const titleEl = document.getElementById('next-fullscreen-title');
                    const donorNameEl = document.getElementById('next-fullscreen-donor-name');
                    const donorAmountEl = document.getElementById('next-fullscreen-donor-amount');
                    const countdownEl = document.getElementById('next-fullscreen-countdown');
                    
                    if (thumbEl) {
                        const targetSrc = nextSong.thumbnail || (nextSong.type === 'youtube'
                            ? `https://img.youtube.com/vi/${nextSong.videoId}/hqdefault.jpg`
                            : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');
                        if (thumbEl.dataset.originalSrc !== targetSrc) {
                            thumbEl.dataset.originalSrc = targetSrc;
                            thumbEl.src = targetSrc;
                        }
                    }
                    
                    const hasThemeChanged = (titleEl.dataset.lastTheme !== currentTheme);
                    if (titleEl && (titleEl.dataset.originalTitle !== nextSong.title || hasThemeChanged)) {
                        titleEl.dataset.originalTitle = nextSong.title;
                        titleEl.dataset.lastTheme = currentTheme;
                        if (!isClassic) {
                            const containerEl = document.getElementById('next-fullscreen-title-container');
                            applyMarquee(containerEl, titleEl, nextSong.title || 'Không rõ tên bài hát', 30);
                        } else {
                            titleEl.classList.remove('marquee');
                            titleEl.style.removeProperty('display');
                            titleEl.style.removeProperty('overflow');
                            titleEl.style.removeProperty('animation-duration');
                            titleEl.textContent = nextSong.title || 'Không rõ tên bài hát';
                        }
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
                        const targetDonorName = nextSong.donorName || 'Khách';
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
                    
                    if (countdownEl) {
                        const targetCountdown = `Phát sau ${formatTime(Math.max(0, Math.ceil(remainingTime)))}`;
                        if (countdownEl.textContent !== targetCountdown) {
                            countdownEl.textContent = targetCountdown;
                        }
                    }
                    
                    if (!fullscreenCard.classList.contains('active')) {
                        fullscreenCard.classList.add('active');
                    }
                } else {
                    if (fullscreenCard.classList.contains('active')) {
                        fullscreenCard.classList.remove('active');
                    }
                }
            }
            // Idle state
            else {
                drawer.classList.remove('show');
                modal.classList.remove('show');
                fullscreenCard.classList.remove('active');
                if (widget) {
                    widget.classList.remove('show-queue');
                    widget.classList.remove('next-fullscreen-active');
                }
            }
        }

        function triggerSponsorBlockToast() {
            const nextSongDrawer = document.getElementById('obs-next-song-drawer');
            const nextTextEl = document.getElementById('obs-next-text');
            const nextTagEl = document.getElementById('obs-next-tag');
            const nextDonorInfo = document.getElementById('obs-next-donor-info');
            
            if (!nextSongDrawer || !nextTextEl || !nextTagEl) return;
            
            isSponsorBlockNotificationActive = true;
            
            // Clear any active transitions/text
            nextSongDrawer.classList.remove('show');
            
            setTimeout(() => {
                nextTagEl.style.display = 'none';
                if (nextDonorInfo) nextDonorInfo.style.setProperty('display', 'none', 'important');
                nextTextEl.textContent = 'SponsorBlocks đã bỏ qua nhà tài trợ';
                nextTextEl.classList.remove('marquee');
                nextTextEl.style.animationDuration = '0s';
                
                nextSongDrawer.classList.add('show');
            }, 100);
            
            if (sbToastTimeout) clearTimeout(sbToastTimeout);
            sbToastTimeout = setTimeout(() => {
                nextSongDrawer.classList.remove('show');
                
                setTimeout(() => {
                    nextTagEl.style.display = '';
                    nextTagEl.textContent = 'TIẾP THEO';
                    nextTextEl.textContent = '';
                    isSponsorBlockNotificationActive = false;
                }, 400); // Wait for slide up transition to finish
            }, 4000); // Display for 4 seconds
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
            
            return (realDuration - currentLimit) > 240;
        }

        // Khởi tạo trạng thái YouTube API
        window.onYouTubeIframeAPIReady = function() {
            isPlayerReady = true;
            updateOverlayUI(); // Chạy đồng bộ ngay sau khi API sẵn sàng
        };

        // Nạp động file script YouTube API để đảm bảo sự kiện onYouTubeIframeAPIReady luôn kích hoạt đúng thứ tự
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        // Hàm đọc cài đặt SponsorBlock từ dashboard qua localStorage
        function loadSponsorBlockCategories() {
            try {
                const sbRaw = localStorage.getItem('dua_sb_categories');
                if (sbRaw) {
                    sponsorBlockCategories = JSON.parse(sbRaw);
                } else {
                    sponsorBlockCategories = {
                        sponsor: true,
                        intro: true,
                        outro: true,
                        selfpromo: true,
                        interaction: false,
                        offtopic: true
                    };
                }
            } catch (e) {
                console.error("Error loading SB categories:", e);
            }
        }

        function applyTargetVolume() {
            let activeVol = localIsResuming ? 0 : targetVolume;
            if (overlayPlayer && typeof overlayPlayer.setVolume === 'function') {
                try { overlayPlayer.setVolume(activeVol); } catch(e){}
            }
            if (soundCloudWidget && typeof soundCloudWidget.setVolume === 'function') {
                try { soundCloudWidget.setVolume(activeVol); } catch(e){}
            }
            if (directAudioPlayer) {
                try { directAudioPlayer.volume = activeVol / 100; } catch(e){}
            }
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
                    console.log(`[Volume Enforcer] KẾT THÚC sau 5s — volume hiện tại: ${overlayPlayer ? overlayPlayer.getVolume() : '?'}%`);
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
                        } catch(e){}
                    }, 500);
                } else {
                    try {
                        spotifyEmbedController.play();
                        if (localIsResuming && resumeTargetTime > 0) {
                            spotifyEmbedController.seek(resumeTargetTime);
                        }
                    } catch(e){}
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
                        } catch(err){}
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
                        } catch(e){}
                    }, 1000);
                });
            }
        }

        function loadSoundCloudSdk(callback) {
            if (isSoundCloudSdkLoaded) {
                if (callback) callback();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://w.soundcloud.com/player/api.js';
            script.onload = () => {
                isSoundCloudSdkLoaded = true;
                if (callback) callback();
            };
            document.body.appendChild(script);
        }

        function playSoundCloudTrack(trackUrl) {
            loadSoundCloudSdk(() => {
                const iframe = document.getElementById('obs-soundcloud-player');
                if (!iframe) return;
                
                if (!soundCloudWidget) {
                    currentSoundCloudUrl = trackUrl;
                    soundCloudDuration = 0;
                    iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&show_artwork=false&show_comments=false&show_playcount=false&sharing=false&download=false&buying=false`;
                    
                    soundCloudWidget = SC.Widget(iframe);
                    
                    soundCloudWidget.bind(SC.Widget.Events.READY, () => {
                        soundCloudWidget.setVolume(targetVolume);
                        
                        soundCloudWidget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
                            let isSongActive = false;
                            try {
                                const songRaw = localStorage.getItem('dua_current_song');
                                if (songRaw) {
                                    const song = JSON.parse(songRaw);
                                    isSongActive = song.type === 'soundcloud';
                                }
                            } catch(err){}
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
                            lastSongLoadStartTimestamp = 0; // Reset loader watchdog
                            currentPlayback.isPlaying = true;
                            soundCloudWidget.setVolume(targetVolume);
                            if (localIsResuming && resumeTargetTime > 0) {
                                try { soundCloudWidget.seekTo(resumeTargetTime * 1000); } catch(e){}
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
                                    try { soundCloudWidget.seekTo(resumeTargetTime * 1000); } catch(e){}
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
                            try { soundCloudWidget.seekTo(resumeTargetTime * 1000); } catch(e){}
                        }
                    }
                }
            });
        }

        function updateTrackProgress(currentTime, duration, isPlaying) {
            if (!duration || isNaN(duration) || duration <= 0) return;
            
            localStorage.setItem('dua_overlay_state', JSON.stringify({
                currentTime: currentTime,
                duration: duration,
                isPlaying: isPlaying,
                timestamp: Date.now()
            }));

            if (!window.lastMqttPublishTime || Date.now() - window.lastMqttPublishTime >= 1000) {
                publishMqtt('overlay_state', {
                    currentTime: currentTime,
                    duration: duration,
                    isPlaying: isPlaying
                });
                window.lastMqttPublishTime = Date.now();
            }

            const currentSongRaw = localStorage.getItem('dua_current_song');
            if (currentSongRaw) {
                try {
                    const song = JSON.parse(currentSongRaw);
                    
                    let startPoint = song.start || 0;
                    let limitDuration = duration;
                    if (song.end && song.end > startPoint) {
                        limitDuration = Math.min(limitDuration, song.end);
                    }
                    const maxDurRaw = localStorage.getItem('dua_max_duration');
                    if (maxDurRaw) {
                        const maxDur = parseInt(maxDurRaw);
                        if (maxDur > 0) {
                            limitDuration = Math.min(limitDuration, startPoint + maxDur);
                        }
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

                    if (song.end && currentTime >= song.end) {
                        triggerEndedEvent();
                        return;
                    }

                    if (maxDurRaw) {
                        const maxDur = parseInt(maxDurRaw);
                        if (maxDur > 0) {
                            if (elapsedTime >= maxDur) {
                                console.log(`Overlay: Đã phát đạt giới hạn thời gian tối đa cấu hình (${maxDur}s). Chuyển bài tiếp theo...`);
                                triggerEndedEvent();
                                return;
                            }
                        }
                    }

                    // Watchdog cho bài hát (Spotify/SoundCloud): nếu đã phát hết thời lượng (remainingTime <= -1.5)
                    // nhưng widget/player bị treo không chuyển bài hoặc không kích hoạt sự kiện kết thúc.
                    if (limitDuration > 0 && remainingTime <= -1.5) {
                        console.log(`Overlay Watchdog (Non-YT): Đã phát hết thời lượng bài hát (remainingTime = ${remainingTime.toFixed(1)}s) nhưng chưa chuyển bài. Tự động chuyển...`);
                        triggerEndedEvent();
                        return;
                    }
                } catch (e) {}
            }
        }

        function initDirectAudioPlayer() {
            if (!directAudioPlayer) {
                directAudioPlayer = document.getElementById('obs-direct-audio-player');
                if (!directAudioPlayer) return;
                
                // Trình theo dõi sự kiện của thẻ <audio> ẩn
                directAudioPlayer.addEventListener('timeupdate', () => {
                    if (isDirectAudioPlaying) {
                        const currentTime = directAudioPlayer.currentTime;
                        const duration = directAudioPlayer.duration || 0;
                        currentPlayback.currentTime = currentTime;
                        currentPlayback.duration = duration;
                        updateTrackProgress(currentTime, duration, true);
                    }
                });

                directAudioPlayer.addEventListener('ended', () => {
                    if (isDirectAudioPlaying) {
                        console.log("Direct Audio: Kết thúc bài hát.");
                        stopDirectAudioStream();
                        triggerEndedEvent();
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
                        console.log("Direct Audio Metadata loaded. Duration:", directAudioDuration);
                    }
                });
            }
        }

        function resolveAndPlayDirectStream(videoId, startTime) {
            initDirectAudioPlayer();
            if (!directAudioPlayer) {
                console.error("Direct Audio Player element not found.");
                triggerEndedEvent();
                return;
            }

            console.log("Resolving direct audio stream for YouTube Video ID:", videoId);
            
            const streamApiUrl = `/api/yt-stream?videoId=${videoId}`;
            
            isDirectAudioPlaying = true;
            currentDirectVideoId = videoId;
            lastSongLoadStartTimestamp = Date.now(); // reset watchdog load timestamp

            // Pause other players
            if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') {
                try { overlayPlayer.pauseVideo(); } catch(e){}
            }

            fetch(streamApiUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (!isDirectAudioPlaying || currentDirectVideoId !== videoId) {
                        // Song changed or bypass stopped in the meantime
                        return;
                    }
                    if (data.success && data.url) {
                        console.log("Successfully resolved direct stream url:", data.url);
                        directAudioPlayer.src = data.url;
                        directAudioPlayer.currentTime = startTime || 0;
                        
                        let activeVol = localIsResuming ? 0 : targetVolume;
                        directAudioPlayer.volume = activeVol / 100;
                        
                        directAudioPlayer.play()
                            .then(() => {
                                console.log("Direct stream audio playback started.");
                                currentPlayback.isPlaying = true;
                                lastSongLoadStartTimestamp = 0; // stop loading watchdog
                                startVolumeEnforcer();
                            })
                            .catch(err => {
                                console.error("Error playing direct audio stream:", err);
                                triggerEndedEvent();
                            });
                    } else {
                        throw new Error(data.error || "Unknown resolution error");
                    }
                })
                .catch(err => {
                    console.error("Failed to resolve direct audio stream:", err);
                    stopDirectAudioStream();
                    triggerEndedEvent();
                });
        }

        function stopDirectAudioStream() {
            isDirectAudioPlaying = false;
            currentDirectVideoId = null;
            if (directAudioPlayer) {
                try {
                    directAudioPlayer.pause();
                    directAudioPlayer.src = '';
                } catch(e) {}
            }
        }

        // Hàm khởi tạo iframe trình phát YouTube
        function initOverlayPlayer(videoId, startTime) {
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

            overlayPlayer = new YT.Player('obs-youtube-placeholder', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: {
                    'autoplay': 1,
                    'controls': 1,
                    'modestbranding': 1,
                    'rel': 0,
                    'allowfullscreen': 1
                },
                events: {
                    'onReady': (event) => {
                        // Cập nhật targetVolume từ localStorage (phòng trường hợp thay đổi trong lúc chờ)
                        targetVolume = localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : targetVolume;
                        event.target.setVolume(targetVolume);
                        event.target.seekTo(startTime || 0, true);
                        
                        if (warningCountdownInterval) {
                            try { event.target.pauseVideo(); } catch(e){}
                        } else {
                            event.target.playVideo();
                            startVolumeEnforcer(); // Bắt đầu ép volume liên tục
                            startPlaybackMonitor();
                        }
                    },
                    'onStateChange': onPlayerStateChange,
                    'onError': (event) => {
                        console.error("Overlay Player: Lỗi tải video YouTube (Mã lỗi: " + event.data + ").");
                        
                        const bypassEnabled = localStorage.getItem('dua_yt_bypass_enabled') !== 'false';
                        if (bypassEnabled && (event.data === 150 || event.data === 101 || event.data === 2 || event.data === 100)) {
                            console.log("Overlay Player: Kích hoạt chế độ phát nhạc dự phòng bằng Direct Stream...");
                            let currentId = currentVideoId || videoId;
                            let currentStart = startTime || 0;
                            try {
                                const songRaw = localStorage.getItem('dua_current_song');
                                if (songRaw) {
                                    const songObj = JSON.parse(songRaw);
                                    if (songObj.videoId) currentId = songObj.videoId;
                                    currentStart = songObj.start || 0;
                                }
                            } catch(e) {}
                            resolveAndPlayDirectStream(currentId, currentStart);
                            return;
                        }

                        console.log("Overlay Player: Tự động chuyển bài tiếp theo...");
                        let songTitle = "Không rõ";
                        try {
                            const songRaw = localStorage.getItem('dua_current_song');
                            if (songRaw) {
                                const songObj = JSON.parse(songRaw);
                                songTitle = songObj.title || "Không rõ";
                            }
                        } catch(e) {}

                        const errorPayload = {
                            type: 'player_error',
                            code: event.data,
                            title: songTitle,
                            timestamp: Date.now()
                        };

                        localStorage.setItem('dua_overlay_error', JSON.stringify(errorPayload));
                        publishMqtt('overlay_event', errorPayload);

                        stopVolumeEnforcer();
                        triggerEndedEvent();
                    }
                }
            });
        }

        function triggerVoteSkipSuccessFlow() {
            if (localVoteSkipSuccessHandled) return;
            localVoteSkipSuccessHandled = true;
            lastCommandType = 'pause'; // Chặn auto-play enforcer
            const widget = document.getElementById('obs-player-widget');
            
            // 1. Tạm dừng phát tất cả các player ngay lập tức
            try {
                if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') overlayPlayer.pauseVideo();
                if (soundCloudWidget) soundCloudWidget.pause();
                if (spotifyEmbedController) spotifyEmbedController.pause();
                if (directAudioPlayer) directAudioPlayer.pause();
            } catch(e) {}

            // Hiện màn hình báo vote skip thành công
            const successOverlay = document.getElementById('obs-voteskip-success-overlay');
            if (successOverlay) {
                successOverlay.classList.add('active');
            }

            // 2. Tìm bài hát tiếp theo
            let queue = [];
            try {
                const rawQueue = localStorage.getItem('dua_queue');
                if (rawQueue) {
                    queue = JSON.parse(rawQueue);
                }
            } catch (e) {}

            let idx = -1;
            const currentSongRaw = localStorage.getItem('dua_current_song');
            if (currentSongRaw) {
                try {
                    const song = JSON.parse(currentSongRaw);
                    if (song && song.id) {
                        idx = queue.findIndex(s => String(s.id) === String(song.id));
                    }
                } catch(e) {}
            }
            const nextSong = idx !== -1 ? queue[idx + 1] : null;

            // Xóa đếm ngược cũ nếu có
            if (voteSkipCountdownInterval) {
                clearInterval(voteSkipCountdownInterval);
                voteSkipCountdownInterval = null;
            }

            // Trì hoãn 2 giây rồi hiện đếm ngược 15s nếu có bài tiếp theo
            setTimeout(() => {
                if (successOverlay) {
                    successOverlay.classList.remove('active');
                }

                if (nextSong) {
                    const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
                    const thumbEl = document.getElementById('next-fullscreen-thumb');
                    const titleEl = document.getElementById('next-fullscreen-title');
                    const donorNameEl = document.getElementById('next-fullscreen-donor-name');
                    const donorAmountEl = document.getElementById('next-fullscreen-donor-amount');
                    const countdownEl = document.getElementById('next-fullscreen-countdown');

                    if (widget) {
                        widget.classList.remove('show-queue');
                        widget.classList.add('next-fullscreen-active');
                    }

                    // Cập nhật thông tin bài tiếp theo
                    if (thumbEl) {
                        const targetSrc = nextSong.thumbnail || (nextSong.type === 'youtube'
                            ? `https://img.youtube.com/vi/${nextSong.videoId}/hqdefault.jpg`
                            : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');
                        thumbEl.src = targetSrc;
                    }

                    if (titleEl) {
                        const currentTheme = localStorage.getItem('dua_theme') || 'pineapple';
                        const isClassic = ['classic', 'classic-dark'].includes(currentTheme);
                        if (!isClassic) {
                            const containerEl = document.getElementById('next-fullscreen-title-container');
                            applyMarquee(containerEl, titleEl, nextSong.title || 'Không rõ tên bài hát', 30);
                        } else {
                            titleEl.textContent = nextSong.title || 'Không rõ tên bài hát';
                        }
                    }

                    if (nextSong.isOwnerAdd) {
                        const storedMsg = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                        if (donorNameEl) {
                            donorNameEl.textContent = storedMsg;
                            donorNameEl.style.setProperty('max-width', 'none', 'important');
                            donorNameEl.style.setProperty('white-space', 'normal', 'important');
                        }
                        if (donorAmountEl) {
                            donorAmountEl.style.setProperty('display', 'none', 'important');
                        }
                    } else {
                        const targetDonorName = nextSong.donorName || 'Khách';
                        if (donorNameEl) {
                            donorNameEl.textContent = targetDonorName;
                            donorNameEl.style.removeProperty('max-width');
                            donorNameEl.style.removeProperty('white-space');
                        }
                        const targetAmount = (nextSong.amount && Number(nextSong.amount) > 0)
                            ? Number(nextSong.amount).toLocaleString('vi-VN') + ' ₫'
                            : '0 ₫';
                        if (donorAmountEl) {
                            donorAmountEl.textContent = targetAmount;
                            donorAmountEl.style.removeProperty('display');
                        }
                    }

                    if (fullscreenCard) {
                        fullscreenCard.classList.add('active');
                    }

                    // Chạy đếm ngược 15s
                    let timeLeft = 15;
                    if (countdownEl) {
                        countdownEl.textContent = `Phát sau ${timeLeft}s`;
                    }

                    voteSkipCountdownInterval = setInterval(() => {
                        timeLeft--;
                        if (timeLeft <= 0) {
                            clearInterval(voteSkipCountdownInterval);
                            voteSkipCountdownInterval = null;
                            if (fullscreenCard) {
                                fullscreenCard.classList.remove('active');
                            }
                            if (widget) {
                                widget.classList.remove('next-fullscreen-active');
                            }
                            triggerEndedEvent();
                        } else {
                            if (countdownEl) {
                                countdownEl.textContent = `Phát sau ${timeLeft}s`;
                            }
                        }
                    }, 1000);

                } else {
                    // Không có bài tiếp theo -> kết thúc ngay (gửi triggerEndedEvent về app.js)
                    triggerEndedEvent();
                }
            }, 2000);
        }

        function executeControlCommand(command) {
            if (localVoteSkipSuccessHandled && (command.type === 'play' || command.type === 'pause' || command.type === 'seek')) {
                console.log("Overlay: Vote skip success flow is active, ignoring command:", command.type);
                return;
            }

            if (command.type === 'extended') {
                const details = command.value;
                if (details) {
                    const donorName = details.donorName || 'Khách';
                    const amount = Number(details.amount) || 0;
                    const seconds = Number(details.seconds) || 360;
                    const mins = (seconds / 60).toFixed(1).replace(/\.0$/, '');
                    
                    const flash = document.createElement('div');
                    flash.className = 'obs-extended-flash';
                    flash.innerHTML = `<span>➕ ${donorName} (+${mins}p)</span>`;
                    
                    document.body.appendChild(flash);
                    
                    setTimeout(() => {
                        flash.remove();
                    }, 4000);
                }
                return;
            }

            if (command.type === 'vote_skip_success') {
                triggerVoteSkipSuccessFlow();
                return;
            }

            // Nếu đang trong quá trình đếm ngược cảnh báo nhạy cảm, chặn các lệnh play/seek/resume để tránh rò rỉ âm thanh
            if (warningCountdownInterval && (command.type === 'play' || command.type === 'seek')) {
                console.log("Overlay: Đang đếm ngược cảnh báo nhạy cảm, bỏ qua lệnh điều khiển:", command.type);
                return;
            }

            if (command.type === 'volume') {
                targetVolume = (command.value !== null && !isNaN(parseInt(command.value))) ? parseInt(command.value) : 80;
                localStorage.setItem('dua_volume', targetVolume);
                applyTargetVolume();
                
                // Đồng bộ âm lượng sang SoundCloud widget
                if (soundCloudWidget) {
                    try { soundCloudWidget.setVolume(targetVolume); } catch(e){}
                }
                return;
            } else if (command.type === 'reload') {
                console.log("Overlay: Nhận lệnh tải lại trang (reload)...");
                localStorage.removeItem('dua_control_command');
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
                } catch(e){}
                // Hiện overlay chờ với nội dung phù hợp
                const waitWidget = document.getElementById('obs-player-widget');
                const waitOverlay = document.getElementById('obs-empty-overlay');
                if (waitWidget && waitOverlay) {
                    waitWidget.classList.add('active');
                    waitWidget.style.display = '';
                    waitOverlay.classList.add('active', 'focus-active');
                    waitOverlay.textContent = `⏸ Đang hỏi có phát tiếp "${songTitle}"...`;
                }
                return;
            }

            // Định cấu hình định tuyến lệnh theo nguồn nhạc
            let songType = 'youtube';
            try {
                const songRaw = localStorage.getItem('dua_current_song');
                if (songRaw) {
                    const song = JSON.parse(songRaw);
                    songType = song.type || 'youtube';
                }
            } catch(e){}

            if (songType === 'spotify') {
                if (!spotifyEmbedController) return;
                if (command.type === 'play') {
                    if (!currentPlayback.isPlaying) {
                        try { spotifyEmbedController.play(); } catch(e){}
                    }
                } else if (command.type === 'pause') {
                    if (currentPlayback.isPlaying) {
                        try { spotifyEmbedController.pause(); } catch(e){}
                    }
                } else if (command.type === 'seek') {
                    try { spotifyEmbedController.seek(command.value); } catch(e){}
                } else if (command.type === 'stop') {
                    try { spotifyEmbedController.pause(); } catch(e){}
                }
            } else if (songType === 'soundcloud') {
                if (!soundCloudWidget) return;
                if (command.type === 'play') {
                    if (!currentPlayback.isPlaying) {
                        try { soundCloudWidget.play(); } catch(e){}
                    }
                } else if (command.type === 'pause') {
                    if (currentPlayback.isPlaying) {
                        try { soundCloudWidget.pause(); } catch(e){}
                    }
                } else if (command.type === 'seek') {
                    try { soundCloudWidget.seekTo(command.value * 1000); } catch(e){} // SoundCloud nhận mili giây
                } else if (command.type === 'stop') {
                    try { soundCloudWidget.pause(); } catch(e){}
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
                        directAudioPlayer.currentTime = command.value;
                        lastCommandType = 'seek';
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
                    overlayPlayer.seekTo(command.value, true);
                    lastCommandType = 'seek';
                } else if (command.type === 'stop') {
                    try { overlayPlayer.stopVideo(); } catch (e) {}
                    lastCommandType = 'stop';
                }
            }
        }

        // Kiểm tra lệnh điều khiển từ dashboard gửi sang
        function checkControlCommands() {
            try {
                const cmdRaw = localStorage.getItem('dua_control_command');
                if (!cmdRaw) return;

                const command = JSON.parse(cmdRaw);
                if (command.timestamp === lastCommandTimestamp) return;
                lastCommandTimestamp = command.timestamp;

                executeControlCommand(command);
            } catch (err) {
                console.error("Error reading control commands:", err);
            }
        }

        // Hàm giám sát tiến trình phát và gửi ngược dữ liệu về Dashboard
        function startPlaybackMonitor() {
            if (playbackMonitorInterval) clearInterval(playbackMonitorInterval);

            playbackMonitorInterval = setInterval(() => {
                if (isDirectAudioPlaying) return;
                if (!overlayPlayer || typeof overlayPlayer.getCurrentTime !== 'function') return;

                try {
                    const playerState = overlayPlayer.getPlayerState();
                    
                    // Watchdog: Nếu đang ở trạng thái PLAY nhưng player bị đứng ở UNSTARTED, BUFFERING hoặc CUED quá 15 giây
                    if (lastCommandType === 'play' && 
                        (playerState === YT.PlayerState.UNSTARTED || 
                         playerState === YT.PlayerState.BUFFERING || 
                         playerState === YT.PlayerState.CUED)) {
                        
                        if (!stuckStateStartTime) {
                            stuckStateStartTime = Date.now();
                        }
                        
                        const timeStuck = Date.now() - stuckStateStartTime;
                        if (timeStuck > 15000) {
                            console.error(`Overlay Player: Watchdog triggered (stuck in state ${playerState} for ${timeStuck}ms). Skipping song...`);
                            
                            // Reset stuck/load timestamps
                            stuckStateStartTime = null;
                            lastSongLoadStartTimestamp = 0;
                            
                            let songTitle = "Không rõ";
                            try {
                                const songRaw = localStorage.getItem('dua_current_song');
                                if (songRaw) {
                                    const songObj = JSON.parse(songRaw);
                                    songTitle = songObj.title || "Không rõ";
                                }
                            } catch(e) {}

                            const errorPayload = {
                                type: 'player_error',
                                code: 150, // 150 representing block/unplayable
                                title: songTitle,
                                timestamp: Date.now()
                            };

                            localStorage.setItem('dua_overlay_error', JSON.stringify(errorPayload));
                            publishMqtt('overlay_event', errorPayload);

                            stopVolumeEnforcer();
                            triggerEndedEvent();
                            return;
                        }
                    } else {
                        stuckStateStartTime = null;
                    }

                    if (playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.PAUSED) {
                        // Reset watchdog timer
                        lastSongLoadStartTimestamp = 0;
                        
                        const currentTime = overlayPlayer.getCurrentTime();
                        const duration = overlayPlayer.getDuration();
                        // Detect live stream chính xác qua YouTube API
                        try {
                            const vd = overlayPlayer.getVideoData ? overlayPlayer.getVideoData() : {};
                            isLiveStream = !!(vd && vd.isLive);
                        } catch(e) {
                            isLiveStream = (!duration || duration <= 0);
                        }
                        const isLive = isLiveStream;

                        // An toàn: kiểm tra volume thực tế, sửa nếu lệch khỏi targetVolume
                        if (typeof overlayPlayer.getVolume === 'function') {
                            const actualVol = overlayPlayer.getVolume();
                            if (Math.abs(actualVol - targetVolume) > 1) {
                                console.warn(`[Volume Guard] Phát hiện volume lệch: thực tế=${actualVol}%, mục tiêu=${targetVolume}% → sửa lại`);
                                overlayPlayer.setVolume(targetVolume);
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

                        // 1. Đồng bộ ngược trạng thái phát về Dashboard qua localStorage
                        localStorage.setItem('dua_overlay_state', JSON.stringify({
                            currentTime: isLive ? livePlayTime : currentTime,
                            duration: isLive ? 0 : duration,
                            isLive: isLive,
                            isPlaying: isPlaying,
                            timestamp: now
                        }));

                        // Đồng bộ trạng thái qua MQTT giãn cách 1 giây để tiết kiệm băng thông
                        if (!window.lastMqttPublishTime || now - window.lastMqttPublishTime >= 1000) {
                            publishMqtt('overlay_state', {
                                currentTime: isLive ? livePlayTime : currentTime,
                                duration: isLive ? 0 : duration,
                                isLive: isLive,
                                isPlaying: isPlaying
                            });
                            window.lastMqttPublishTime = now;
                        }

                        // 2. Kiểm tra mốc kết thúc bài do cấu hình hoặc giới hạn thời gian phát tối đa
                        const currentSongRaw = localStorage.getItem('dua_current_song');
                        if (currentSongRaw) {
                            try {
                                const song = JSON.parse(currentSongRaw);
                                
                                let elapsedTime;
                                let limitDuration;
                                let actualPlayDuration;

                                if (isLive) {
                                    elapsedTime = livePlayTime;
                                    let limit = 0;
                                    if (song.end && song.end > 0) {
                                        limit = song.end;
                                    }
                                    const maxDurRaw = localStorage.getItem('dua_max_duration');
                                    if (maxDurRaw) {
                                        const maxDur = parseInt(maxDurRaw);
                                        if (maxDur > 0) {
                                            if (limit > 0) {
                                                limit = Math.min(limit, maxDur);
                                            } else {
                                                limit = maxDur;
                                            }
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
                                    const maxDurRaw = localStorage.getItem('dua_max_duration');
                                    if (maxDurRaw) {
                                        const maxDur = parseInt(maxDurRaw);
                                        if (maxDur > 0) {
                                            limitDuration = Math.min(limitDuration, startPoint + maxDur);
                                        }
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
                                    if (song.end && currentTime >= song.end) {
                                        triggerEndedEvent();
                                        return;
                                    }

                                    // Kiểm tra giới hạn thời gian phát tối đa toàn cục
                                    const maxDurRaw = localStorage.getItem('dua_max_duration');
                                    if (maxDurRaw) {
                                        const maxDur = parseInt(maxDurRaw);
                                        if (maxDur > 0) {
                                            if (elapsedTime >= maxDur) {
                                                console.log(`Overlay: Đã phát đạt giới hạn thời gian tối đa cấu hình (${maxDur}s). Chuyển bài tiếp theo...`);
                                                triggerEndedEvent();
                                                return;
                                            }
                                        }
                                    }

                                    // Watchdog cho bài hát bình thường: nếu đã phát hết thời lượng (remainingTime <= -1.5)
                                    // nhưng YT player bị treo không chuyển trạng thái ENDED.
                                    if (limitDuration > 0 && remainingTime <= -1.5) {
                                        console.log(`Overlay Watchdog: Đã phát hết thời lượng bài hát (remainingTime = ${remainingTime.toFixed(1)}s) nhưng player chưa chuyển bài. Tự động chuyển...`);
                                        triggerEndedEvent();
                                        return;
                                    }
                                }
                            } catch (e) {}
                        }

                        // 3. Xử lý SponsorBlock tự động bỏ qua phân đoạn (Chỉ cho video thường)
                        if (!isLive) {
                            loadSponsorBlockCategories();
                            if (skipSegments && skipSegments.length > 0) {
                                const now = Date.now();
                                for (const segment of skipSegments) {
                                    if (sponsorBlockCategories[segment.category] === true) {
                                        const segmentKey = segment.start + '-' + segment.end;
                                        if (currentTime >= segment.start && currentTime < segment.end) {
                                            // Tránh gọi seek liên tục nếu vừa mới seek tới phân đoạn này
                                            if (lastSkippedSegmentKey === segmentKey) {
                                                break;
                                            }
                                            console.log(`SponsorBlock Overlay: Nhảy phân đoạn [${segment.category}] (${currentTime.toFixed(1)}s -> ${segment.end.toFixed(1)}s)`);
                                            lastSBSeekTimestamp = now;
                                            lastSBSeekTarget = segment.end;
                                            lastSkippedSegmentKey = segmentKey;
                                            overlayPlayer.seekTo(segment.end, true);
                                            triggerSponsorBlockToast();
                                            break;
                                        } else {
                                            // Giải phóng khóa khi đã phát qua khỏi phân đoạn hoặc tua lại phía trước phân đoạn
                                            if (lastSkippedSegmentKey === segmentKey) {
                                                lastSkippedSegmentKey = null;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Thử đọc trạng thái player khi đang tải:", e);
                }

            }, 250);
        }

        function triggerEndedEvent() {
            if (playbackMonitorInterval) {
                clearInterval(playbackMonitorInterval);
                playbackMonitorInterval = null;
            }
            
            const eventId = 'ended_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Phát tín hiệu kết thúc bài về Dashboard
            localStorage.setItem('dua_overlay_event', JSON.stringify({
                type: 'ended',
                eventId: eventId,
                timestamp: Date.now()
            }));

            // Đồng bộ tín hiệu kết thúc qua MQTT
            publishMqtt('overlay_event', {
                type: 'ended',
                eventId: eventId
            });
        }

        function onPlayerStateChange(event) {
            // Luôn áp dụng targetVolume ở mọi sự kiện trạng thái
            if (typeof event.target.setVolume === 'function') {
                event.target.setVolume(targetVolume);
            }

            if (event.data === YT.PlayerState.ENDED) {
                stopVolumeEnforcer();
                triggerEndedEvent();
            } else if (event.data === YT.PlayerState.PLAYING) {
                if (warningCountdownInterval) {
                    try { event.target.pauseVideo(); } catch(e){}
                    return;
                }
                // Nếu đang phát tiếp tục, thực hiện seek chủ động sang vị trí cần thiết
                if (localIsResuming && !hasSeekedForResume && resumeTargetTime > 0) {
                    hasSeekedForResume = true;
                    console.log(`Overlay Player: Chủ động seek sang ${resumeTargetTime}s khi bắt đầu phát tiếp tục`);
                    try { event.target.seekTo(resumeTargetTime, true); } catch(e){}
                }
                // Video đang phát — ép volume ngay (YouTube hay reset đúng lúc này)
                applyTargetVolume();
                console.log(`[onStateChange] PLAYING — ép volume: ${targetVolume}%`);
            } else if (event.data === YT.PlayerState.BUFFERING) {
                // Buffering — khởi động lại enforcer vì YouTube có thể reset volume
                startVolumeEnforcer();
            } else if (event.data === YT.PlayerState.PAUSED) {
                // Nếu bị tạm dừng ngoài ý muốn (không phải do lệnh pause/stop từ dashboard), tự động phát tiếp
                if (lastCommandType !== 'pause' && lastCommandType !== 'stop' && lastCommandType !== 'waiting_resume' && !warningCountdownInterval) {
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

        // Cập nhật Giao diện Overlay
        function updateOverlayUI() {
            try {
                // Kiểm tra lệnh điều khiển trước
                checkControlCommands();

                // LOADER WATCHDOG: Skip the song if loading takes more than 15 seconds
                if (!isDirectAudioPlaying && lastSongLoadStartTimestamp > 0 && (Date.now() - lastSongLoadStartTimestamp > 15000)) {
                    console.error("Overlay Player: Loader Watchdog triggered (song loading timed out >15s). Skipping song...");
                    lastSongLoadStartTimestamp = 0;
                    triggerEndedEvent();
                    return;
                }

                if (lastCommandType === 'waiting_resume') {
                    // Đang chờ người dùng lựa chọn, giữ nguyên giao diện chờ
                    const waitWidget = document.getElementById('obs-player-widget');
                    const waitOverlay = document.getElementById('obs-empty-overlay');
                    if (waitWidget && waitOverlay) {
                        waitWidget.classList.add('active');
                        waitWidget.style.display = '';
                        waitOverlay.classList.add('active', 'focus-active');
                    }
                    return;
                }

                // Đồng bộ theme định kỳ từ localStorage
                const storedTheme = localStorage.getItem('dua_theme') || 'pineapple';
                if (!document.body.classList.contains('theme-' + storedTheme) && !(storedTheme === 'pineapple' && document.body.className === '')) {
                    applyTheme(storedTheme);
                }

                const dataRaw = localStorage.getItem('dua_current_song');
                if (!dataRaw) {
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
                    
                    const hideEmpty = localStorage.getItem('dua_hide_empty_overlay') === 'true';
                    const isFocus = localStorage.getItem('dua_focus_mode') === 'true';
                    if (hideEmpty && !isFocus) {
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
                                emptyOverlay.classList.add('focus-active');
                                const storedFocusMsg = localStorage.getItem('dua_focus_mode_message');
                                emptyOverlay.textContent = storedFocusMsg || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng';
                            } else {
                                emptyOverlay.classList.remove('focus-active');
                                const storedMsg = localStorage.getItem('dua_empty_queue_message');
                                emptyOverlay.textContent = storedMsg || 'Order nhạc tự động Zypage 50k';
                            }
                        }
                    }
                    
                    const nextSongDrawer = document.getElementById('obs-next-song-drawer');
                    if (nextSongDrawer) nextSongDrawer.classList.remove('show');
                    widget.classList.remove('obs-ext-active');
                    widget.classList.remove('obs-voteskip-active');
                    const successOverlay = document.getElementById('obs-voteskip-success-overlay');
                    if (successOverlay) successOverlay.classList.remove('active');
                    
                    if (overlayPlayer) {
                        try { overlayPlayer.destroy(); } catch (e) {}
                        overlayPlayer = null;
                        document.getElementById('obs-youtube-area').innerHTML = '<div id="obs-youtube-placeholder"></div>';
                    }
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch(e){}
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch(e){}
                    }
                    stopDirectAudioStream();
                    
                    lastSongId = 'no_song';
                    currentVideoId = null;
                    currentRemainingTime = 999999;
                    return;
                } else {
                    if (destroyTimeout) {
                        clearTimeout(destroyTimeout);
                        destroyTimeout = null;
                    }
                    const isFocus = localStorage.getItem('dua_focus_mode') === 'true';
                    const emptyOverlay = document.getElementById('obs-empty-overlay');
                    if (emptyOverlay) {
                        if (isFocus && (lastCommandType === 'pause' || lastCommandType === 'stop')) {
                            emptyOverlay.classList.add('active', 'focus-active');
                            const storedFocusMsg = localStorage.getItem('dua_focus_mode_message');
                            emptyOverlay.textContent = storedFocusMsg || 'Đang bật chế độ Tập trung 🤫 Hàng đợi tạm dừng';
                        } else {
                            if (lastCommandType !== 'waiting_resume') {
                                emptyOverlay.classList.remove('active', 'focus-active');
                            }
                        }
                    }
                    widget.style.display = '';
                }

                const data = JSON.parse(dataRaw);
                
                // Fallback for vote skip success in case the control command was missed/delayed
                if (data && data.voteSkipSuccess === true && !localVoteSkipSuccessHandled) {
                    console.log("Overlay: Detected voteSkipSuccess in state payload, triggering success flow...");
                    triggerVoteSkipSuccessFlow();
                }
                
                // Return early if vote skip success flow is handled and active for this song
                // to avoid clearing the countdown timer or interfering with the transition UI.
                if (localVoteSkipSuccessHandled && data && data.id === lastSongId) {
                    return;
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

                if (voteSkipCountdownInterval) {
                    clearInterval(voteSkipCountdownInterval);
                    voteSkipCountdownInterval = null;
                    const successOverlay = document.getElementById('obs-voteskip-success-overlay');
                    if (successOverlay) {
                        successOverlay.classList.remove('active');
                    }
                    const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
                    if (fullscreenCard) {
                        fullscreenCard.classList.remove('active');
                    }
                    if (widget) {
                        widget.classList.remove('next-fullscreen-active');
                    }
                }
                
                // KIỂM TRA CẤU HÌNH CẢNH BÁO NỘI DUNG NHẠY CẢM (ĐỘNG TỪ GIST HOẶC MẶC ĐỊNH)
                const sensitiveConfig = sensitiveVideosConfig[data.videoId] || (data.videoId === 'Wv7t22rx7Ik' ? {
                    message: "Nội dung chuẩn bị phát rất nhạy cảm, không phù hợp với người có vấn đề tâm lý. Hãy cân nhắc trước khi nghe.",
                    duration: 5
                } : null);

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
                        try { overlayPlayer.pauseVideo(); } catch(e){}
                    }
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch(e){}
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch(e){}
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

                skipSegments = data.skipSegments || [];
                
                const isNewSong = (lastSongId !== data.id);

                // Định nghĩa hàm cập nhật nội dung chữ và marquee
                const updateTextContent = (songData, skipMarquee = false) => {
                    title.textContent = songData.title || "Chưa có tên bài hát";
                    if (songData.isOwnerAdd) {
                        const storedMsg = localStorage.getItem('dua_empty_queue_message') || 'Order nhạc tự động Zypage 50k';
                        donorName.textContent = storedMsg;
                        donorName.style.setProperty('max-width', 'none', 'important');
                        donorName.style.setProperty('white-space', 'normal', 'important');
                        donorAmount.style.setProperty('display', 'none', 'important');
                    } else {
                        donorName.textContent = songData.donorName || "Khách";
                        donorName.style.removeProperty('max-width');
                        donorName.style.removeProperty('white-space');
                        donorAmount.textContent = songData.amount ? songData.amount.toLocaleString('vi-VN') + ' ₫' : '0 ₫';
                        donorAmount.style.removeProperty('display');
                    }
                    donorContainer.style.display = 'flex';
                    
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
                    const currentTheme = localStorage.getItem('dua_theme') || 'pineapple';
                    title.dataset.lastTheme = currentTheme;
                    
                    if (!skipMarquee) {
                        applyMarquee(titleContainer, title, songData.title || "Chưa có tên bài hát", 30);
                    } else {
                        title.classList.remove('marquee');
                        title.style.animationDuration = '0s';
                        title.style.display = 'inline-block';
                        title.style.overflow = 'hidden';
                    }
                };

                // Cập nhật thông tin bài hát
                if (isNewSong) {
                    localVoteSkipSuccessHandled = false;
                    const successOverlay = document.getElementById('obs-voteskip-success-overlay');
                    if (successOverlay) {
                        successOverlay.classList.remove('active');
                    }
                    const fullscreenCard = document.getElementById('obs-next-song-fullscreen');
                    if (fullscreenCard) {
                        fullscreenCard.classList.remove('active');
                        widget.classList.remove('next-fullscreen-active');
                    }
                    if (resumeTimeoutId) {
                        clearTimeout(resumeTimeoutId);
                        resumeTimeoutId = null;
                    }
                    localIsResuming = !!data.isResuming;
                    if (localIsResuming) {
                        resumeTargetTime = data.start || 0;
                        toggleResumingState(true);
                        resumeTimeoutId = setTimeout(() => {
                            localIsResuming = false;
                            toggleResumingState(false);
                        }, 8000);
                    } else {
                        resumeTargetTime = 0;
                        toggleResumingState(false);
                    }
                    lastSkippedSegmentKey = null;
                    const currentTheme = localStorage.getItem('dua_theme') || 'pineapple';
                    const isClassic = ['classic', 'classic-dark'].includes(currentTheme);
                    
                    // Kiểm tra xem thẻ "Bài tiếp theo" có đang hiển thị trước đó không để đồng bộ hoạt ảnh morph
                    const wasFullscreenActive = fullscreenCard && fullscreenCard.classList.contains('active') && !isClassic;
                    
                    const playerMain = document.getElementById('obs-player-main');
                    if (playerMain) {
                        playerMain.classList.remove('song-pop-animation');
                        if (!wasFullscreenActive) {
                            void playerMain.offsetWidth; // Trigger reflow
                            playerMain.classList.add('song-pop-animation');
                        }
                    }
                    
                    if (isClassic) {
                        const obsCoverWrapper = document.getElementById('obs-cover-wrapper');
                        const details = document.querySelector('.obs-details');
                        if (obsCoverWrapper && widget) {
                            // Bước 1: Nhấc cần gạt, dừng quay đĩa
                            widget.classList.add('changing-disc-active');
                            
                            // Bước 2: Sau 500ms (cần gạt đã nhấc hẳn), cho đĩa trượt ra và chữ mờ dần
                            setTimeout(() => {
                                obsCoverWrapper.classList.add('changing-disc');
                                if (details) details.classList.add('changing-text');
                            }, 500);
                            
                            // Bước 3: Cập nhật ảnh đĩa mới và chữ mới khi đĩa cũ đã khuất hoàn toàn (sau 1000ms)
                            setTimeout(() => {
                                cover.src = data.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
                                updateTextContent(data, true);
                            }, 1000);
                            
                            // Bước 4: Dọn dẹp và hạ cần gạt sau khi đĩa mới đã về vị trí (sau 1600ms)
                            setTimeout(() => {
                                widget.classList.remove('changing-disc-active');
                                obsCoverWrapper.classList.remove('changing-disc');
                                if (details) {
                                    details.classList.remove('changing-text');
                                    const titleContainer = document.getElementById('obs-song-title-container');
                                    applyMarquee(titleContainer, title, data.title || "Chưa có tên bài hát", 30);
                                }
                            }, 1600);
                        } else {
                            cover.src = data.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
                            updateTextContent(data);
                        }
                    } else {
                        if (wasFullscreenActive) {
                            // Bỏ qua tất cả các hiệu ứng bounce/changing-text để morph được mượt mà và khớp hoàn toàn.
                            // Cập nhật nội dung và đĩa ngay lập tức và tĩnh.
                            cover.src = data.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
                            
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
                                applyMarquee(titleContainer, title, data.title || "Chưa có tên bài hát", 30);
                            }, 800);
                        } else {
                            // Với các theme khác khi không có morph (ví dụ bắt đầu phát từ hàng đợi trống), chạy hiệu ứng bình thường
                            cover.src = data.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";
                            
                            const isTextAnimTheme = (currentTheme === 'pineapple' || currentTheme === 'spacegods' || currentTheme === 'cutepink' || currentTheme === 'frosted-glass' || currentTheme === 'frosted-glass-light');
                            if (isTextAnimTheme) {
                                const details = document.querySelector('.obs-details');
                                if (details) {
                                    details.classList.add('changing-text');
                                    
                                    setTimeout(() => {
                                        updateTextContent(data, true);
                                    }, 250);
                                    
                                    setTimeout(() => {
                                        details.classList.remove('changing-text');
                                        const titleContainer = document.getElementById('obs-song-title-container');
                                        applyMarquee(titleContainer, title, data.title || "Chưa có tên bài hát", 30);
                                    }, 1000);
                                } else {
                                    updateTextContent(data);
                                }
                            } else {
                                updateTextContent(data);
                            }
                        }
                    }
                    
                    lastSongId = data.id;
                    livePlayTime = 0;
                    lastLiveTickTimestamp = null;
                    isLiveStream = false;
                }

                // Trực tiếp kiểm tra thay đổi theme để re-apply hoặc reset marquee cho tiêu đề bài hát hiện tại
                const currentTheme = localStorage.getItem('dua_theme') || 'pineapple';
                const hasThemeChanged = (title.dataset.lastTheme !== currentTheme);
                if (hasThemeChanged) {
                    title.dataset.lastTheme = currentTheme;
                    const titleContainer = document.getElementById('obs-song-title-container');
                    applyMarquee(titleContainer, title, data.title || "Chưa có tên bài hát", 30);
                }

                // Đồng bộ hóa các Player (YouTube, Spotify, SoundCloud) trên overlay
                const currentType = data.type || 'youtube';
                
                if (currentType === 'spotify') {
                    // Tạm dừng các player khác
                    if (overlayPlayer && typeof overlayPlayer.pauseVideo === 'function') {
                        try { overlayPlayer.pauseVideo(); } catch(e){}
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch(e){}
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
                        try { overlayPlayer.pauseVideo(); } catch(e){}
                    }
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch(e){}
                    }
                    stopDirectAudioStream();
                    
                    // Phát SoundCloud
                    if (isNewSong || currentVideoId !== data.soundcloudUrl) {
                        lastSongLoadStartTimestamp = Date.now();
                        currentVideoId = data.soundcloudUrl;
                        playSoundCloudTrack(data.soundcloudUrl);
                    }
                } else {
                    // Mặc định: YouTube
                    if (spotifyEmbedController) {
                        try { spotifyEmbedController.pause(); } catch(e){}
                    }
                    if (soundCloudWidget) {
                        try { soundCloudWidget.pause(); } catch(e){}
                    }
                    
                    if (isPlayerReady) {
                        if (currentVideoId !== data.videoId || isNewSong) {
                            stopDirectAudioStream();
                            currentVideoId = data.videoId;
                            targetVolume = localStorage.getItem('dua_volume') !== null ? parseInt(localStorage.getItem('dua_volume')) : targetVolume;
                            if (overlayPlayer && typeof overlayPlayer.loadVideoById === 'function') {
                                try {
                                    console.log("Overlay Player: Chuyển bài bằng loadVideoById:", data.videoId, "| Volume mục tiêu:", targetVolume);
                                    lastSongLoadStartTimestamp = Date.now();
                                    lastCommandType = 'play';
                                    overlayPlayer.loadVideoById({
                                        videoId: data.videoId,
                                        startSeconds: data.start || 0
                                    });
                                    setTimeout(() => {
                                        if (overlayPlayer && typeof overlayPlayer.playVideo === 'function') {
                                            overlayPlayer.playVideo();
                                        }
                                    }, 100);
                                    startVolumeEnforcer();
                                    startPlaybackMonitor();
                                } catch (e) {
                                    console.error("Error calling loadVideoById, falling back to full init:", e);
                                    document.getElementById('obs-youtube-area').innerHTML = '<div id="obs-youtube-placeholder"></div>';
                                    initOverlayPlayer(data.videoId, data.start || 0);
                                }
                            } else {
                                console.log("Overlay Player: Khởi tạo mới vì chưa có player:", data.videoId);
                                document.getElementById('obs-youtube-area').innerHTML = '<div id="obs-youtube-placeholder"></div>';
                                initOverlayPlayer(data.videoId, data.start || 0);
                            }
                        }
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
                                duration = overlayPlayer.getDuration();
                                isPlaying = playerState === YT.PlayerState.PLAYING;
                            }
                        }
                    }

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
                                const maxDurRaw = localStorage.getItem('dua_max_duration');
                                if (maxDurRaw) {
                                    const maxDur = parseInt(maxDurRaw);
                                    if (maxDur > 0) {
                                        if (endPoint > 0) {
                                            endPoint = Math.min(endPoint, maxDur);
                                        } else {
                                            endPoint = maxDur;
                                        }
                                    }
                                }
                            } else {
                                if (song.end && song.end > startPoint) {
                                    endPoint = Math.min(endPoint, song.end);
                                }
                                const maxDurRaw = localStorage.getItem('dua_max_duration');
                                if (maxDurRaw) {
                                    const maxDur = parseInt(maxDurRaw);
                                    if (maxDur > 0) {
                                        endPoint = Math.min(endPoint, startPoint + maxDur);
                                    }
                                }
                            }
                            limitDuration = isLive ? endPoint : Math.max(1, endPoint - startPoint);
                        }
                        
                        const displayCurrentTime = isLive ? livePlayTime : currentTime;
                        const elapsedTime = limitDuration > 0 ? Math.min(limitDuration, Math.max(0, displayCurrentTime - startPoint)) : displayCurrentTime;
                        const pct = limitDuration > 0 ? ((elapsedTime / limitDuration) * 100) : 100;
                        const safePct = Math.min(100, Math.max(0, pct)) + '%';
                        progressFill.style.width = safePct;
                        if (progressThumb) {
                            progressThumb.style.left = safePct;
                        }
                        currentTimeDisplay.textContent = formatTime(elapsedTime);
                        totalTimeDisplay.textContent = limitDuration > 0 ? formatTime(limitDuration) : "LIVE";

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
                    if (isPlaying) {
                        widget.classList.add('playing');
                        if (!isMorphingTransitionActive) {
                            coverWrapper.classList.add('spinning');
                            coverWrapper.style.animationPlayState = 'running';
                        } else {
                            coverWrapper.style.animationPlayState = 'paused';
                        }
                    } else {
                        coverWrapper.style.animationPlayState = 'paused';
                        widget.classList.remove('playing');
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

                            // Cập nhật hiển thị rate (xxk / x phút)
                            if (extRateEl && data.extensionPrice && data.extensionMinutes) {
                                const priceK = Math.round(data.extensionPrice / 1000);
                                extRateEl.textContent = `${priceK}k / ${data.extensionMinutes} phút`;
                            } else if (extRateEl) {
                                extRateEl.textContent = '';
                            }
                            
                            const isManual = !!data.extensionForceShow;
                            const isAuto = (currentRemainingTime <= 120 && currentRemainingTime > 30);
                            const allowed = isExtensionAllowedForSong(data, duration);
                            
                            if (allowed && (isManual || isAuto)) {
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

                // Cập nhật hiển thị Vote Skip
                const voteSkipWidget = document.getElementById('obs-vote-skip-widget');
                const voteSkipText = document.getElementById('obs-vote-skip-progress-text');
                const voteSkipFill = document.getElementById('obs-vote-skip-fill');
                
                if (voteSkipWidget) {
                    if (data && data.voteSkipActive) {
                        widget.classList.add('obs-voteskip-active');
                        const target = data.voteSkipTarget || 20000;
                        const voteAmt = data.voteAmount || 0;
                        
                        if (voteSkipText) {
                            voteSkipText.textContent = `${voteAmt.toLocaleString('vi-VN')}đ / ${target.toLocaleString('vi-VN')}đ`;
                        }
                        if (voteSkipFill) {
                            const pct = Math.min(100, Math.max(0, (voteAmt / target) * 100));
                            voteSkipFill.style.width = `${pct}%`;
                        }
                    } else {
                        widget.classList.remove('obs-voteskip-active');
                    }
                }

                // Hiển thị widget
                widget.classList.add('active');
                widget.style.display = '';

            } catch (err) {
                console.error("Error reading storage:", err);
            }
        }

        // Hàm kích hoạt popup thông báo donate mới
        function triggerNewDonationAlert(alertData) {
            const alertBox = document.getElementById('obs-alert-box');
            
            // Layout classic elements
            const alertDonor = document.getElementById('alert-donor');
            const alertAmount = document.getElementById('alert-amount');
            const alertSong = document.getElementById('alert-song');
            const alertStatusText = document.getElementById('alert-status-text');
            const alertSongContainer = document.getElementById('obs-alert-song-container');

            // Layout modern elements
            const alertModernThumb = document.getElementById('alert-modern-thumb');
            const alertModernSong = document.getElementById('alert-modern-song');
            const alertModernSongContainer = document.getElementById('alert-modern-song-container');
            const alertModernDonor = document.getElementById('alert-modern-donor');
            const alertModernAmount = document.getElementById('alert-modern-amount');
            const alertModernStatus = document.getElementById('alert-modern-status');

            const nextSongDrawer = document.getElementById('obs-next-song-drawer');
            if (nextSongDrawer) {
                nextSongDrawer.classList.remove('show');
            }

            const donorText = alertData.donorName || 'Khách';
            const amountText = alertData.amount ? alertData.amount.toLocaleString('vi-VN') + ' ₫' : '0 ₫';
            const songTitle = alertData.title || 'Không rõ';
            const pos = alertData.position || '';

            // 1. Populate Classic Layout
            if (alertDonor) alertDonor.textContent = donorText;
            if (alertAmount) alertAmount.textContent = amountText;

            const currentTheme = localStorage.getItem('dua_theme') || 'pineapple';
            const isClassic = ['classic', 'classic-dark'].includes(currentTheme);

            if (isClassic) {
                if (alertSong) {
                    alertSong.classList.remove('marquee');
                    alertSong.style.animationDuration = '0s';
                    alertSong.textContent = songTitle;
                    
                    alertSong.style.display = '-webkit-box';
                    alertSong.style.webkitLineClamp = '3';
                    alertSong.style.webkitBoxOrient = 'vertical';
                    alertSong.style.whiteSpace = 'normal';
                    alertSong.style.wordBreak = 'break-word';
                    alertSong.style.overflow = 'hidden';
                }
                
                if (alertStatusText) {
                    alertStatusText.className = 'obs-alert-status-text';
                    if (pos === 'Đang phát') {
                        alertStatusText.classList.add('badge-playing');
                        alertStatusText.textContent = 'Đang phát';
                    } else if (pos === 'Tiếp theo') {
                        alertStatusText.classList.add('badge-next');
                        alertStatusText.textContent = 'Tiếp theo';
                    } else {
                        alertStatusText.classList.add('badge-queue');
                        const posNum = String(pos).replace('#', '');
                        alertStatusText.textContent = `Hàng đợi số ${posNum}`;
                    }
                }
            } else {
                // 2. Populate Modern Layout
                // Thumbnail
                if (alertModernThumb) {
                    const targetSrc = alertData.thumbnail || (alertData.type === 'youtube'
                        ? `https://img.youtube.com/vi/${alertData.videoId}/hqdefault.jpg`
                        : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop');
                    alertModernThumb.src = targetSrc;
                }

                // Title with marquee
                if (alertModernSong && alertModernSongContainer) {
                    applyMarquee(alertModernSongContainer, alertModernSong, songTitle, 30);
                }

                // Donor Name and Amount
                if (alertModernDonor) alertModernDonor.textContent = donorText;
                if (alertModernAmount) alertModernAmount.textContent = amountText;

                // Status text / countdown equivalent
                if (alertModernStatus) {
                    if (pos === 'Đang phát') {
                        alertModernStatus.textContent = 'Đang phát';
                    } else if (pos === 'Tiếp theo') {
                        alertModernStatus.textContent = 'Tiếp theo';
                    } else if (pos) {
                        const posNum = String(pos).replace('#', '');
                        alertModernStatus.textContent = `Hàng đợi số ${posNum}`;
                    } else {
                        alertModernStatus.textContent = '';
                    }
                }

                // Message if present
                const alertModernMessage = document.getElementById('alert-modern-message');
                if (alertModernMessage) {
                    if (alertData.message && alertData.message.trim() !== '') {
                        alertModernMessage.textContent = alertData.message.trim();
                        alertModernMessage.style.display = 'block';
                    } else {
                        alertModernMessage.textContent = '';
                        alertModernMessage.style.display = 'none';
                    }
                }

                // Populate also classic text in case theme changes dynamically while alert is active (unlikely but safe)
                if (alertSong && alertSongContainer) {
                    alertSong.style.display = '';
                    alertSong.style.webkitLineClamp = '';
                    alertSong.style.webkitBoxOrient = '';
                    alertSong.style.whiteSpace = '';
                    alertSong.style.wordBreak = '';
                    alertSong.style.overflow = '';
                    applyMarquee(alertSongContainer, alertSong, songTitle, 45);
                }
                if (alertStatusText) {
                    alertStatusText.className = 'obs-alert-status-text';
                    if (pos === 'Đang phát') {
                        alertStatusText.classList.add('badge-playing');
                        alertStatusText.textContent = 'Đang phát';
                    } else if (pos === 'Tiếp theo') {
                        alertStatusText.classList.add('badge-next');
                        alertStatusText.textContent = 'Tiếp theo';
                    } else {
                        alertStatusText.classList.add('badge-queue');
                        const posNum = String(pos).replace('#', '');
                        alertStatusText.textContent = `Hàng đợi số ${posNum}`;
                    }
                }
            }

            // Sync alert action text for the new modern badge as well
            updateAlertActionTextDisplay();

            // Reset hoạt ảnh bằng cách xóa và thêm lại class active
            alertBox.classList.remove('active');
            void alertBox.offsetWidth; // Trigger reflow để reset transition
            alertBox.classList.add('active');

            // Ẩn thông báo sau 6 giây
            if (alertTimeout) clearTimeout(alertTimeout);
            alertTimeout = setTimeout(() => {
                alertBox.classList.remove('active');
            }, 6000);
        }

        // Kiểm tra thay đổi liên tục bằng vòng lặp hoạt ảnh (200ms một lần là đủ mượt và nhẹ)
        setInterval(updateOverlayUI, 200);

        // Lắng nghe cả sự kiện Storage của trình duyệt (giúp phản ứng ngay lập tức)
        window.addEventListener('storage', (e) => {
            if (e.key === 'dua_current_song') {
                updateOverlayUI();
            } else if (e.key === 'dua_control_command') {
                checkControlCommands();
            } else if (e.key === 'dua_new_donation_alert') {
                try {
                    const alertData = JSON.parse(e.newValue);
                    if (alertData) {
                        triggerNewDonationAlert(alertData);
                    }
                } catch (err) {
                    console.error("Error parsing alert data:", err);
                }
            } else if (e.key === 'dua_theme') {
                applyTheme(e.newValue || 'pineapple');
            } else if (e.key === 'dua_opacity') {
                applyOpacity(e.newValue || '100');
            } else if (e.key === 'dua_alert_action_text') {
                updateAlertActionTextDisplay();
            } else if (e.key === 'dua_hide_empty_overlay') {
                updateOverlayUI();
            } else if (e.key === 'dua_sensitive_videos_url') {
                fetchSensitiveVideosConfig();
            } else if (e.key === 'dua_focus_mode') {
                updateOverlayUI();
            } else if (e.key === 'dua_focus_mode_message') {
                updateOverlayUI();
            }
        });

        // =========================================================================
        // --- ĐỒNG BỘ MQTT XUYÊN TRÌNH DUYỆT (OBS OVERLAY SIDE) ---
        // =========================================================================

        // Phân tích tham số URL để tìm key hoặc token đồng bộ
        const zypageToken = urlParams.get('token');
        const localKey = urlParams.get('key');
        const channelId = zypageToken || localKey;

        let wsClient = null;
        let isWsConnecting = false;

        function initMqtt() {
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
                    console.log("Overlay: Kết nối WebSocket thành công!");
                    
                    // Yêu cầu đồng bộ cấu hình hiện tại từ Dashboard
                    publishMqtt('request_sync', {});
                    
                    // Dò tìm kết nối liên tục từ Dashboard (gửi yêu cầu mỗi 5 giây)
                    if (syncInterval) clearInterval(syncInterval);
                    syncInterval = setInterval(() => {
                        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                            publishMqtt('request_sync', {});
                        }
                    }, 5000);
                };

                wsClient.onmessage = (event) => {
                    handleMqttMessage(null, event.data);
                };

                wsClient.onclose = () => {
                    isWsConnecting = false;
                    console.log("Overlay: Kết nối WebSocket bị đóng. Đang thử kết nối lại sau 3 giây...");
                    if (syncInterval) clearInterval(syncInterval);
                    setTimeout(initMqtt, 3000);
                };

                wsClient.onerror = (err) => {
                    isWsConnecting = false;
                    console.error("Overlay WebSocket error:", err);
                };

            } catch (e) {
                isWsConnecting = false;
                console.error("Overlay WebSocket connection failed:", e);
                setTimeout(initMqtt, 3000);
            }
        }

        function publishMqtt(type, payload) {
            if (!wsClient || wsClient.readyState !== WebSocket.OPEN) return;
            
            const messageObj = { type: type };
            if (type === 'overlay_state') {
                messageObj.state = payload;
            } else if (type === 'overlay_event') {
                messageObj.event = payload;
            }
            
            try {
                wsClient.send(JSON.stringify(messageObj));
            } catch (err) {
                console.error("Overlay WebSocket send error:", err);
            }
        }

        function handleMqttMessage(topic, messageStr) {
            try {
                const payload = JSON.parse(messageStr);
                if (!payload) return;

                console.log("Overlay nhận lệnh MQTT:", payload.type);

                if (payload.type === 'current_song') {
                    const song = payload.data;
                    if (!song) {
                        localStorage.removeItem('dua_current_song');
                    } else {
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
                    
                    localStorage.setItem('dua_control_command', JSON.stringify(cmd));
                    executeControlCommand(cmd);
                } else if (payload.type === 'max_duration') {
                    const maxDurVal = payload.data?.value;
                    if (maxDurVal !== undefined) {
                        localStorage.setItem('dua_max_duration', maxDurVal);
                    }
                } else if (payload.type === 'empty_queue_message') {
                    const text = payload.data?.text;
                    if (text !== undefined) {
                        localStorage.setItem('dua_empty_queue_message', text);
                    }
                    updateOverlayUI();
                } else if (payload.type === 'new_donation_alert') {
                    const alertData = payload.data;
                    if (alertData) {
                        localStorage.setItem('dua_new_donation_alert', JSON.stringify(alertData));
                        triggerNewDonationAlert(alertData);
                    }
                } else if (payload.type === 'theme_change') {
                    const theme = payload.data?.theme || 'pineapple';
                    localStorage.setItem('dua_theme', theme);
                    applyTheme(theme);
                } else if (payload.type === 'opacity_change') {
                    const opacity = payload.data?.opacity || '100';
                    localStorage.setItem('dua_opacity', opacity);
                    applyOpacity(opacity);
                } else if (payload.type === 'alert_action_text') {
                    const text = payload.data?.text;
                    if (text !== undefined) {
                        localStorage.setItem('dua_alert_action_text', text);
                        updateAlertActionTextDisplay();
                    }
                } else if (payload.type === 'hide_empty_overlay') {
                    const val = payload.data?.value;
                    if (val !== undefined) {
                        localStorage.setItem('dua_hide_empty_overlay', val ? 'true' : 'false');
                    }
                    updateOverlayUI();
                } else if (payload.type === 'focus_mode') {
                    const val = payload.data?.value;
                    if (val !== undefined) {
                        localStorage.setItem('dua_focus_mode', val ? 'true' : 'false');
                    }
                    updateOverlayUI();
                } else if (payload.type === 'focus_mode_message') {
                    const text = payload.data?.text;
                    if (text !== undefined) {
                        localStorage.setItem('dua_focus_mode_message', text);
                    }
                    updateOverlayUI();
                } else if (payload.type === 'sensitive_videos_url') {
                    const url = payload.data?.url;
                    if (url !== undefined) {
                        localStorage.setItem('dua_sensitive_videos_url', url);
                        fetchSensitiveVideosConfig();
                    }
                } else if (payload.type === 'sb_categories') {
                    const cats = payload.data;
                    if (cats) {
                        localStorage.setItem('dua_sb_categories', JSON.stringify(cats));
                        sponsorBlockCategories = cats;
                    }
                } else if (payload.type === 'queue_change') {
                    const queue = payload.data;
                    if (queue) {
                        localStorage.setItem('dua_queue', JSON.stringify(queue));
                    } else {
                        localStorage.removeItem('dua_queue');
                    }
                    updateOverlayUI();
                }
            } catch (e) {
                console.error("Overlay: Lỗi xử lý tin nhắn MQTT:", e);
            }
        }

        // Khởi động kết nối MQTT khi tải trang
        initMqtt();

        // Áp dụng tỉ lệ thu phóng (zoom/scale) cho các widget overlay nếu được truyền từ URL
        const scaleVal = parseFloat(urlParams.get('scale')) || 1.0;
        if (scaleVal !== 1.0) {
            const overlayContent = document.getElementById('overlay-content');
            if (overlayContent) {
                overlayContent.style.transform = `scale(${scaleVal})`;
                overlayContent.style.transformOrigin = 'top left';
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
                try { spotifyEmbedController.play(); } catch(e){}
            }
            // Giải phóng SoundCloud
            if (soundCloudWidget) {
                try { soundCloudWidget.play(); } catch(e){}
            }
        });

        // Chạy kiểm tra ngay khi load
        updateOverlayUI();
    
