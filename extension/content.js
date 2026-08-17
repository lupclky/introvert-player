// Tạo và tiêm CSS của Extension vào trang web
const style = document.createElement('style');
style.textContent = `
  .pineapple-toast {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 100000;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #10B981;
    color: #FFF;
    padding: 0.75rem 1.25rem;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    transform: translateY(-50px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pineapple-toast.show {
    transform: translateY(0);
    opacity: 1;
  }
  .pineapple-toast.error {
    background: #EF4444;
  }
  
  #metadata-line {
    max-height: none !important;
    overflow: visible !important;
    display: flex !important;
    flex-wrap: wrap !important;
  }
  
  .pineapple-quick-add-btn {
    cursor: pointer;
    background: rgba(128, 128, 128, 0.12) !important;
    color: var(--yt-spec-text-primary, #606060) !important;
    border: 1px solid rgba(128, 128, 128, 0.15) !important;
    font-weight: 600 !important;
    font-size: 1.25rem !important;
    padding: 4px 11px !important;
    border-radius: 6px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 0.25rem !important;
    margin-left: 8px !important;
    flex-shrink: 0 !important;
    transition: all 0.2s ease !important;
    user-select: none !important;
    white-space: nowrap !important;
    line-height: 1 !important;
  }
  .pineapple-quick-add-btn:hover {
    background: rgba(128, 128, 128, 0.24) !important;
    color: var(--yt-spec-text-primary, #0f0f0f) !important;
    transform: scale(1.05) !important;
  }
  .pineapple-quick-add-btn.loading {
    cursor: not-allowed !important;
  }
  /* Layout: cho phép nút nằm cạnh tiêu đề trên trang chủ và trang tìm kiếm */
  ytd-rich-grid-media h3#title-wrapper,
  ytd-video-renderer h3#title-wrapper,
  ytd-grid-video-renderer h3#title-wrapper,
  ytd-compact-video-renderer h3#title-wrapper,
  ytd-rich-grid-media #title-wrapper,
  ytd-video-renderer #title-wrapper,
  ytd-grid-video-renderer #title-wrapper,
  ytd-compact-video-renderer #title-wrapper,
  ytd-rich-item-renderer #title-wrapper {
    display: flex !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    gap: 0 !important;
  }
  ytd-rich-grid-media #video-title-link,
  ytd-video-renderer #video-title-link,
  ytd-grid-video-renderer #video-title-link,
  ytd-compact-video-renderer #video-title-link,
  ytd-rich-item-renderer #video-title-link,
  ytd-rich-grid-media a[href*="/watch?v="].ytd-rich-grid-media,
  ytd-rich-grid-media #video-title,
  ytd-video-renderer #video-title {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }
  ytd-watch-metadata #title,
  ytd-video-primary-info-renderer #container {
    display: flex !important;
    align-items: center !important;
    flex-wrap: wrap !important;
    gap: 12px !important;
  }
  .pineapple-watch-quick-add-btn {
    cursor: pointer;
    background: rgba(128, 128, 128, 0.12) !important;
    color: var(--yt-spec-text-primary, #0f0f0f) !important;
    border: 1px solid rgba(128, 128, 128, 0.18) !important;
    font-weight: 600 !important;
    font-size: 0.82rem !important;
    padding: 6px 14px !important;
    border-radius: 18px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 0.3rem !important;
    transition: all 0.2s ease !important;
    user-select: none !important;
    vertical-align: middle !important;
    margin-bottom: 2px !important;
  }
  .pineapple-watch-quick-add-btn:hover {
    background: rgba(128, 128, 128, 0.24) !important;
    transform: scale(1.02) !important;
  }
  .pineapple-watch-quick-add-btn.loading {
    cursor: not-allowed !important;
    opacity: 0.7 !important;
  }
  .pineapple-ytmusic-add-btn {
    cursor: pointer !important;
    position: relative !important;
    z-index: 9999 !important;
    pointer-events: auto !important;
    box-sizing: border-box !important;
    min-width: 32px !important;
    height: 32px !important;
    padding: 0 10px !important;
    border: 1px solid rgba(255, 255, 255, 0.28) !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.12) !important;
    color: var(--ytmusic-text-primary, #fff) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    font-family: Roboto, Arial, sans-serif !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    transition: background-color .18s ease, border-color .18s ease, transform .15s ease !important;
    user-select: none !important;
    -webkit-user-select: none !important;
  }
  .pineapple-ytmusic-add-btn:hover {
    background: rgba(255, 255, 255, 0.28) !important;
    border-color: rgba(255, 255, 255, 0.5) !important;
    transform: scale(1.04) !important;
  }
  .pineapple-ytmusic-add-btn:active {
    transform: scale(0.96) !important;
  }
  .pineapple-ytmusic-add-btn.loading {
    cursor: wait !important;
    opacity: .62 !important;
  }
  .pineapple-ytmusic-playlist-btn {
    min-width: 52px !important;
    padding-inline: 12px !important;
    font-size: 13px !important;
  }
  ytmusic-responsive-list-item-renderer .pineapple-ytmusic-add-btn {
    margin-right: 8px !important;
  }
  ytmusic-card-shelf-renderer .pineapple-ytmusic-add-btn {
    margin-left: 10px !important;
  }
  ytmusic-two-row-item-renderer .pineapple-ytmusic-add-btn {
    position: absolute !important;
    right: 8px !important;
    top: 8px !important;
    z-index: 10 !important;
    background: rgba(20, 20, 20, .85) !important;
    backdrop-filter: blur(6px) !important;
  }
  ytmusic-two-row-item-renderer {
    position: relative !important;
  }
  ytmusic-responsive-list-item-renderer {
    overflow: visible !important;
  }
`;
document.head.appendChild(style);

// Hàm gửi tin nhắn an toàn tránh lỗi mất ngữ cảnh khi Extension tải lại (Context Invalidated)
function safeSendMessage(message, callback) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage(message, callback);
      return;
    } catch (e) {
      console.warn('[Extension] Lỗi gửi tin nhắn (có thể extension đã được tải lại):', e);
    }
  }
  showToast('Tiện ích mở rộng đã được cập nhật/tải lại. Vui lòng F5 (Refresh) trang YouTube.', true);
  if (callback) {
    callback({ success: false, error: 'Extension context invalidated. Please refresh the page.' });
  }
}

// Hàm hiển thị thông báo Toast
function showToast(message, isError) {
  const toast = document.createElement('div');
  toast.className = `pineapple-toast ${isError ? 'error' : ''}`;
  toast.innerHTML = `
    <span>${isError ? '⚠️' : '✅'}</span>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  // Trigger animation show
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);

  // Ẩn và xoá toast sau 4 giây
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Đồng bộ media thực sự đang phát để Overlay có thể dùng làm nội dung thay thế
// khi hàng đợi donate trống. Extension chỉ gửi metadata, không nhân đôi âm thanh.
let lastBrowserMediaSignature = '';

function readText(selectors) {
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function readBrowserMediaState() {
  const hostname = location.hostname.toLowerCase();
  const media = document.querySelector('video, audio');
  const playing = Boolean(media && !media.paused && !media.ended && media.readyState >= 2);
  const sessionMetadata = navigator.mediaSession?.metadata;
  let provider = null;
  let title = sessionMetadata?.title || '';
  let artist = sessionMetadata?.artist || '';
  let thumbnail = sessionMetadata?.artwork?.at(-1)?.src || '';

  if (hostname === 'music.youtube.com') {
    provider = 'youtube-music';
    title = readText(['ytmusic-player-bar .title', 'ytmusic-player-bar [class*="title"]']) || title;
    artist = readText(['ytmusic-player-bar .byline', 'ytmusic-player-bar [class*="byline"]']) || artist;
    thumbnail = document.querySelector('ytmusic-player-bar img')?.src || thumbnail;
  } else if (hostname.endsWith('youtube.com')) {
    provider = 'youtube';
    title = readText(['ytd-watch-metadata h1', 'h1.title']) || title || document.title.replace(/\s+-\s+YouTube$/, '');
    artist = readText(['ytd-watch-metadata ytd-channel-name a', '#owner-name a']) || artist;
    const videoId = new URL(location.href).searchParams.get('v');
    if (!thumbnail && videoId) thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  } else if (hostname.endsWith('soundcloud.com')) {
    provider = 'soundcloud';
    title = readText(['.playbackSoundBadge__titleLink', '.soundTitle__title']) || title;
    artist = readText(['.playbackSoundBadge__lightLink', '.soundTitle__username']) || artist;
    thumbnail = document.querySelector('.playbackSoundBadge__avatar span[style*="background-image"]')?.style.backgroundImage
      ?.replace(/^url\(["']?/, '').replace(/["']?\)$/, '') || thumbnail;
  }

  return {
    provider,
    playing,
    url: location.href,
    title: title || 'Media trên trình duyệt',
    artist,
    thumbnail,
    currentTime: Number(media?.currentTime) || 0,
    duration: Number.isFinite(media?.duration) ? media.duration : 0
  };
}

function publishBrowserMediaState(force = false) {
  const state = readBrowserMediaState();
  if (!state.provider) return;
  const signature = [
    state.provider,
    state.playing,
    state.url,
    state.title,
    Math.floor(state.currentTime / 2),
    Math.floor(state.duration)
  ].join('|');
  if (!force && signature === lastBrowserMediaSignature) return;
  lastBrowserMediaSignature = signature;
  try {
    chrome.runtime.sendMessage({ action: 'browser-media-state', data: state }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) { }
}

document.addEventListener('play', () => publishBrowserMediaState(true), true);
document.addEventListener('pause', () => publishBrowserMediaState(true), true);
document.addEventListener('ended', () => publishBrowserMediaState(true), true);
window.addEventListener('pagehide', () => {
  const state = readBrowserMediaState();
  state.playing = false;
  try { chrome.runtime.sendMessage({ action: 'browser-media-state', data: state }); } catch (_) { }
});
setInterval(publishBrowserMediaState, 1000);

// Kiểm tra định kỳ trang video YouTube
function checkRoute() {
  if (window.location.hostname === 'music.youtube.com') {
    injectYouTubeMusicButtons();
    return;
  }
  const isVideoPage = window.location.pathname === '/watch';
  if (isVideoPage) {
    injectWatchPageButton();
  }
  // Tự động quét và nhúng nút "+ Thêm nhanh" trên trang tìm kiếm/trang chủ/gợi ý
  injectSearchButtons();
}

function normalizeYouTubeMusicUrl(rawHref, kind = 'track') {
  if (!rawHref) return '';
  let href = String(rawHref).trim();
  if (!href.startsWith('http://') && !href.startsWith('https://')) {
    if (!href.startsWith('/')) href = '/' + href;
    href = 'https://music.youtube.com' + href;
  }
  try {
    const parsed = new URL(href);
    parsed.protocol = 'https:';
    parsed.hostname = 'music.youtube.com';
    parsed.hash = '';

    if (kind === 'track') {
      const videoId = parsed.searchParams.get('v');
      return videoId ? `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
    }

    const playlistId = parsed.searchParams.get('list');
    if (playlistId) return `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;

    // Album/EP/Single/Release browse URLs: e.g. /browse/MPRE..., /browse/VL..., /browse/FEmusic...
    if (/^\/browse\/[A-Za-z0-9_-]+/i.test(parsed.pathname)) {
      return `https://music.youtube.com${parsed.pathname}`;
    }
    return '';
  } catch (_) {
    return '';
  }
}

function readYouTubeMusicCardTitle(card, anchor) {
  return (anchor?.getAttribute('title')
    || anchor?.getAttribute('aria-label')
    || card.querySelector('.title-column yt-formatted-string, yt-formatted-string.title, .title a, #title, a.yt-simple-endpoint')?.textContent
    || anchor?.textContent
    || '').trim();
}

function resetYouTubeMusicButton(btn, text) {
  btn.classList.remove('loading');
  btn.disabled = false;
  btn.textContent = text;
  btn.style.removeProperty('color');
  btn.style.removeProperty('border-color');
}

function createYouTubeMusicAddButton(card, url, title, options = {}) {
  const isPlaylist = options.isPlaylist === true;
  const idleText = isPlaylist ? '+ Playlist' : '+';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `pineapple-ytmusic-add-btn${isPlaylist ? ' pineapple-ytmusic-playlist-btn' : ''}`;
  btn.dataset.mediaUrl = url || '';
  btn.dataset.mediaTitle = title || '';
  btn.dataset.mediaKind = isPlaylist ? 'playlist' : 'track';
  btn.textContent = idleText;
  btn.title = isPlaylist
    ? 'Thêm playlist này vào Pineapple Studio'
    : 'Thêm bài hát này vào hàng đợi Pineapple Studio';
  btn.setAttribute('aria-label', btn.title);

  const stopProp = (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  btn.addEventListener('pointerdown', stopProp);
  btn.addEventListener('mousedown', stopProp);
  btn.addEventListener('mouseup', stopProp);
  btn.addEventListener('touchstart', stopProp, { passive: true });
  btn.addEventListener('touchend', stopProp, { passive: true });

  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (btn.classList.contains('loading')) return;

    const currentAnchor = isPlaylist
      ? (getYouTubeMusicPrimaryAnchor(card) || card.querySelector('a[href*="playlist?list="], a[href*="browse/"], a[href*="watch?"][href*="list="]'))
      : card.querySelector('a[href*="watch?v="]');
    
    let currentUrl = normalizeYouTubeMusicUrl(currentAnchor?.getAttribute('href') || btn.dataset.mediaUrl, isPlaylist ? 'playlist' : 'track');
    if (!currentUrl && btn.dataset.mediaUrl) {
      currentUrl = normalizeYouTubeMusicUrl(btn.dataset.mediaUrl, isPlaylist ? 'playlist' : 'track') || btn.dataset.mediaUrl;
    }
    const currentTitle = readYouTubeMusicCardTitle(card, currentAnchor) || btn.dataset.mediaTitle || 'YouTube Music';
    if (!currentUrl) {
      showToast('Không tìm thấy đường dẫn đĩa nhạc / bài hát.', true);
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;
    btn.textContent = '…';
    safeSendMessage({
      action: 'send-to-pineapple',
      url: currentUrl,
      title: currentTitle,
      playNow: false
    }, response => {
      btn.classList.remove('loading');
      btn.disabled = false;
      if (response?.success) {
        btn.textContent = '✓';
        btn.style.setProperty('color', '#34d399', 'important');
        btn.style.setProperty('border-color', 'rgba(52, 211, 153, .8)', 'important');
        showToast(`Đã thêm ${isPlaylist ? 'playlist' : 'bài hát'}: ${currentTitle}`);
        setTimeout(() => resetYouTubeMusicButton(btn, idleText), 2500);
      } else {
        btn.textContent = '×';
        btn.style.setProperty('color', '#f87171', 'important');
        btn.style.setProperty('border-color', 'rgba(248, 113, 113, .8)', 'important');
        showToast(response?.error || 'Không thể thêm nhạc từ YouTube Music.', true);
        setTimeout(() => resetYouTubeMusicButton(btn, idleText), 3000);
      }
    });
  });
  return btn;
}

function injectYouTubeMusicTrackButton(card) {
  if (isYouTubeMusicReleaseCard(card)) return false;
  const anchor = card.querySelector('a[href*="watch?v="]');
  if (!anchor) return false;
  const url = normalizeYouTubeMusicUrl(anchor.getAttribute('href'), 'track');
  const title = readYouTubeMusicCardTitle(card, anchor);
  if (!url || !title) return false;

  card.querySelectorAll('.pineapple-ytmusic-add-btn[data-media-kind="playlist"]').forEach(button => button.remove());
  const existing = card.querySelector('.pineapple-ytmusic-add-btn[data-media-kind="track"]');
  if (existing) {
    existing.dataset.mediaUrl = url;
    existing.dataset.mediaTitle = title;
    return true;
  }
  const btn = createYouTubeMusicAddButton(card, url, title);
  if (card.matches('ytmusic-responsive-list-item-renderer')) {
    const actions = card.querySelector('.menu, .right-items, [class*="menu"]');
    if (actions?.parentElement) actions.parentElement.insertBefore(btn, actions);
    else card.appendChild(btn);
  } else if (card.matches('ytmusic-card-shelf-renderer')) {
    const actions = card.querySelector('#buttons, .buttons, .button-container, [class*="buttons"]');
    if (actions) actions.appendChild(btn);
    else card.appendChild(btn);
  } else {
    card.appendChild(btn);
  }
  return true;
}

function getYouTubeMusicPrimaryAnchor(card) {
  if (!card) return null;
  const titleSelectors = [
    '.title-column a[href]',
    'yt-formatted-string.title a[href]',
    '.title a[href]',
    'a#title[href]',
    '#title a[href]',
    'a.yt-simple-endpoint[href*="browse/"]',
    'a.yt-simple-endpoint[href*="playlist?list="]'
  ];
  for (const selector of titleSelectors) {
    const anchor = card.querySelector(selector);
    if (anchor) return anchor;
  }
  return card.querySelector('a[href*="browse/"], a[href*="playlist?list="], a[href*="watch?v="]');
}

function isYouTubeMusicReleaseCard(card) {
  if (!card) return false;
  const primaryHref = String(getYouTubeMusicPrimaryAnchor(card)?.getAttribute('href') || '');
  // Song rows can contain a secondary album link. The title destination is
  // authoritative, otherwise an individual track is mislabeled as playlist.
  if (primaryHref.includes('/watch?') && new URL(primaryHref, 'https://music.youtube.com').searchParams.get('v')) return false;
  if (/browse\/[A-Za-z0-9_-]+/i.test(primaryHref)) return true;
  if (/playlist\?list=/i.test(primaryHref)) return true;
  const text = String(card.textContent || '').toLowerCase();
  return /(?:^|[·\s•()\[\]])(album|đĩa nhạc|đĩa đơn|single|ep|playlist|danh sách phát)(?:$|[·\s•()\[\]])/i.test(text)
    && Boolean(card.querySelector('a[href*="watch?"][href*="list="], a[href*="playlist?list="], a[href*="browse/"]'));
}

function injectYouTubeMusicPlaylistButton(card) {
  const isRelease = isYouTubeMusicReleaseCard(card);
  if (!isRelease && card.querySelector('a[href*="watch?v="]')) return false;
  const anchor = card.querySelector(
    'a[href*="playlist?list="], a[href*="browse/"], a[href*="watch?"][href*="list="]'
  ) || getYouTubeMusicPrimaryAnchor(card);
  if (!anchor) return false;
  const url = normalizeYouTubeMusicUrl(anchor.getAttribute('href'), 'playlist');
  const title = readYouTubeMusicCardTitle(card, anchor);
  if (!url || !title) return false;
  card.querySelectorAll('.pineapple-ytmusic-add-btn[data-media-kind="track"]').forEach(button => button.remove());
  const existing = card.querySelector('.pineapple-ytmusic-add-btn[data-media-kind="playlist"]');
  if (existing) {
    existing.dataset.mediaUrl = url;
    existing.dataset.mediaTitle = title;
    return true;
  }
  const btn = createYouTubeMusicAddButton(card, url, title, { isPlaylist: true });
  if (card.matches('ytmusic-responsive-list-item-renderer')) {
    const actions = card.querySelector('.menu, .right-items, [class*="menu"]');
    if (actions?.parentElement) actions.parentElement.insertBefore(btn, actions);
    else card.appendChild(btn);
  } else if (card.matches('ytmusic-card-shelf-renderer')) {
    const actions = card.querySelector('#buttons, .buttons, .button-container, [class*="buttons"]');
    if (actions) actions.appendChild(btn);
    else card.appendChild(btn);
  } else {
    card.appendChild(btn);
  }
  return true;
}

function injectYouTubeMusicButtons(root = document) {
  root.querySelectorAll?.('ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer, ytmusic-card-shelf-renderer')
    .forEach(card => {
      const playlistInjected = injectYouTubeMusicPlaylistButton(card);
      if (!playlistInjected) injectYouTubeMusicTrackButton(card);
    });
}

// Hàm quét và nhúng nút thêm nhanh trên trang xem video
function injectWatchPageButton() {
  const isVideoPage = window.location.pathname === '/watch';
  if (!isVideoPage) return;

  // Selector tiêu đề của YouTube:
  // - ytd-watch-metadata #title (layout hiện tại)
  // - ytd-video-primary-info-renderer #container (layout cũ/khác)
  const titleContainer = document.querySelector('ytd-watch-metadata #title, ytd-video-primary-info-renderer #container');
  if (!titleContainer) return;

  // Tránh trùng lặp: Kiểm tra xem nút đã tồn tại chưa
  if (titleContainer.querySelector('.pineapple-watch-quick-add-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'pineapple-watch-quick-add-btn';
  btn.innerHTML = '+ Thêm nhanh';
  btn.title = 'Thêm nhanh video này vào hàng đợi phát Pineapple Studio';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (btn.classList.contains('loading')) return;

    // Tạm dừng video đang phát trên trình duyệt
    const video = document.querySelector('video');
    if (video) {
      video.pause();
    }

    btn.classList.add('loading');
    btn.innerHTML = 'Đang thêm...';
    btn.style.opacity = '0.7';

    const videoUrl = window.location.href;
    const h1El = titleContainer.querySelector('h1');
    const videoTitle = h1El ? h1El.textContent.trim() : document.title;

    safeSendMessage({
      action: 'send-to-pineapple',
      url: videoUrl,
      title: videoTitle,
      playNow: false
    }, (response) => {
      btn.classList.remove('loading');
      btn.style.opacity = '1';

      if (response && response.success) {
        btn.innerHTML = 'Đã thêm!';
        btn.style.background = 'rgba(16, 185, 129, 0.15)';
        btn.style.color = '#10B981';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        btn.style.boxShadow = 'none';
        
        setTimeout(() => {
          btn.innerHTML = '+ Thêm nhanh';
          btn.style.background = '';
          btn.style.color = '';
          btn.style.borderColor = '';
          btn.style.boxShadow = '';
        }, 2000);
      } else {
        btn.innerHTML = 'Lỗi!';
        btn.style.background = 'rgba(239, 68, 68, 0.15)';
        btn.style.color = '#EF4444';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        btn.style.boxShadow = 'none';
        
        const errMsg = (response && response.error) ? response.error : 'Lỗi kết nối';
        showToast(errMsg, true);

        setTimeout(() => {
          btn.innerHTML = '+ Thêm nhanh';
          btn.style.background = '';
          btn.style.color = '';
          btn.style.borderColor = '';
          btn.style.boxShadow = '';
        }, 3000);
      }
    });
  });

  // Chèn nút vào trong container tiêu đề (thường là sau phần h1)
  const h1 = titleContainer.querySelector('h1');
  if (h1) {
    h1.after(btn);
  } else {
    titleContainer.appendChild(btn);
  }
}

// Chạy kiểm tra ban đầu và đăng ký lắng nghe sự kiện chuyển trang của YouTube (SPA)
checkRoute();
setInterval(checkRoute, 1000);
function injectSearchButtons() {
  // Layout cũ, sidebar, playlist, và lockup view-model trực tiếp trong sidebar mới
  document.querySelectorAll(
    'ytd-video-renderer, ytd-rich-grid-media, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model'
  ).forEach(card => injectButtonIntoCard(card));

  // Layout mới (2024+): ytd-rich-item-renderer dùng yt-lockup-view-model bên trong
  document.querySelectorAll('ytd-rich-item-renderer').forEach(card => injectButtonIntoCard(card));
}

// Hàm nhúng nút vào một card video cụ thể — hỗ trợ cả layout cũ lẫn layout mới
function injectButtonIntoCard(card) {
  const tagName = card.tagName.toLowerCase();

  // Kiểm tra xem phần tử có nằm ở cột đề xuất liên quan bên phải hoặc danh sách phát không
  const isSidebar = card.closest('#related, ytd-watch-next-secondary-results-renderer, #playlist-items, ytd-playlist-panel-video-renderer');

  // ══════════════════════════════════════════════════════════════
  // LAYOUT CHO SIDEBAR / PLAYLIST PANEL / YT-LOCKUP TRÊN WATCH SIDEBAR
  // ══════════════════════════════════════════════════════════════
  if (isSidebar || tagName === 'ytd-compact-video-renderer' || tagName === 'ytd-playlist-panel-video-renderer') {
    injectButtonIntoSidebarCard(card);
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYOUT MỚI TRÊN TRANG CHỦ / TRANG TÌM KIẾM (2024+): yt-lockup-view-model
  //   Cấu trúc thực tế dựa vào DevTools:
  //     yt-lockup-metadata-view-model
  //       ├─ h3 > a.ytLockupMetadataViewModelTitle  (tiêu đề)
  //       ├─ div...  (channel, views)
  //       └─ [ytd-menu-renderer hoặc div.MenuButton] (nút ⋮)
  //   KHÔNG dùng #video-title
  // ══════════════════════════════════════════════════════════════
  const newTitleAnchor = card.querySelector('a.ytLockupMetadataViewModelTitle');
  if (newTitleAnchor) {
    const href = newTitleAnchor.getAttribute('href') || '';
    if (!href.includes('/watch?v=')) return;

    const videoUrl = href.startsWith('http')
      ? href.split('&')[0]
      : 'https://www.youtube.com' + href.split('&')[0];

    const videoTitle = newTitleAnchor.getAttribute('aria-label') || newTitleAnchor.textContent.trim();
    if (!videoTitle) return;

    // Tìm container lockup (cha chứa cả tiêu đề lẫn nút ⋮)
    const lockupMeta = newTitleAnchor.closest('yt-lockup-metadata-view-model') || newTitleAnchor.closest('[class*="lockup-metadata"]');
    if (!lockupMeta) return;

    // Tránh trùng lặp
    if (lockupMeta.querySelector('.pineapple-quick-add-btn')) {
      const btn = lockupMeta.querySelector('.pineapple-quick-add-btn');
      const curUrl = btn.dataset.videoUrl;
      btn.dataset.videoUrl = videoUrl;
      btn.dataset.videoTitle = videoTitle;
      if (curUrl && curUrl !== videoUrl) {
        btn.innerHTML = '+';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.classList.remove('loading');
        btn.style.opacity = '1';
      }
      return;
    }

    const btn = _createQuickAddBtn(card, videoUrl, videoTitle, newTitleAnchor, 'new');
    // Nút nhỏ gọn hơn cho layout trang chủ (tránh chiếm quá nhiều không gian)
    btn.style.setProperty('font-size', '1.15rem', 'important');
    btn.style.setProperty('padding', '3px 9px', 'important');
    btn.style.setProperty('flex-shrink', '0', 'important');
    btn.style.setProperty('align-self', 'center', 'important');

    // Tìm nút ⋮ trong lockup container và chèn nút CỦA CHÚNG TA ngay trước nó
    // → nút sẽ nằm trong khoảng trống giữa tiêu đề và dấu ⋮
    const menuBtn = lockupMeta.querySelector('ytd-menu-renderer, [class*="MenuButton"], button[aria-label*="Action"]');
    if (menuBtn) {
      menuBtn.parentElement.insertBefore(btn, menuBtn);
    } else {
      // Fallback: chèn sau h3 bên trong lockup container
      const h3 = lockupMeta.querySelector('h3');
      if (h3) h3.insertAdjacentElement('afterend', btn);
      else lockupMeta.appendChild(btn);
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYOUT CŨ TRÊN TRANG CHỦ / TRANG TÌM KIẾM: ytd-rich-grid-media / ytd-video-renderer
  //   Cấu trúc: h3 > a > yt-formatted-string#video-title
  // ══════════════════════════════════════════════════════════════
  const anchor = card.querySelector('a[href*="/watch?v="]');
  if (!anchor) return;
  const videoUrl = 'https://www.youtube.com' + anchor.getAttribute('href').split('&')[0];

  const titleEl = card.querySelector('#video-title');
  if (!titleEl || !titleEl.textContent.trim()) return;
  const videoTitle = titleEl.textContent.trim();

  const titleAnchorEl = titleEl.closest('a') || titleEl;
  const h3 = titleAnchorEl.closest('h3') || titleAnchorEl.parentElement;
  if (!h3) return;

  let btn = h3.querySelector('.pineapple-quick-add-btn');
  if (btn) {
    const curUrl = btn.dataset.videoUrl;
    btn.dataset.videoUrl = videoUrl;
    btn.dataset.videoTitle = videoTitle;
    if (curUrl && curUrl !== videoUrl) {
      btn.innerHTML = '+';
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.classList.remove('loading');
      btn.style.opacity = '1';
    }
    return;
  }

  btn = _createQuickAddBtn(card, videoUrl, videoTitle, anchor, 'old');

  h3.style.setProperty('display', 'flex', 'important');
  h3.style.setProperty('align-items', 'center', 'important');
  h3.style.setProperty('overflow', 'visible', 'important');
  h3.style.setProperty('max-height', 'none', 'important');
  h3.style.setProperty('-webkit-line-clamp', 'unset', 'important');
  h3.style.setProperty('-webkit-box-orient', 'unset', 'important');

  titleAnchorEl.style.setProperty('flex', '1 1 auto', 'important');
  titleAnchorEl.style.setProperty('min-width', '0', 'important');
  titleAnchorEl.style.setProperty('overflow', 'hidden', 'important');

  h3.appendChild(btn);
}

// Hàm nhúng nút vào các card danh sách phát bên lề (sidebar playlist) và danh sách đề xuất
function injectButtonIntoSidebarCard(card) {
  const anchor = card.querySelector('a.ytLockupMetadataViewModelTitle') || card.querySelector('a[href*="/watch?v="]');
  if (!anchor) return;
  const hrefAttr = anchor.getAttribute('href');
  if (!hrefAttr) return;
  const videoUrl = 'https://www.youtube.com' + hrefAttr.split('&')[0];

  const titleEl = card.querySelector('#video-title') || card.querySelector('a.ytLockupMetadataViewModelTitle');
  if (!titleEl || !titleEl.textContent.trim()) return;
  const videoTitle = titleEl.textContent.trim();

  // Tìm h3 hoặc h4 là container trực tiếp của tiêu đề để không phá vỡ cấu trúc flex của thẻ cha lớn
  const container = titleEl.closest('h3') || titleEl.closest('h4') || titleEl.parentElement;
  if (!container) return;

  let btn = container.querySelector('.pineapple-quick-add-btn');
  if (btn) {
    const curUrl = btn.dataset.videoUrl;
    btn.dataset.videoUrl = videoUrl;
    btn.dataset.videoTitle = videoTitle;
    if (curUrl && curUrl !== videoUrl) {
      btn.innerHTML = '+';
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.classList.remove('loading');
      btn.style.opacity = '1';
    }
    return;
  }

  const isLockup = !!card.querySelector('a.ytLockupMetadataViewModelTitle');
  btn = _createQuickAddBtn(card, videoUrl, videoTitle, anchor, isLockup ? 'new' : 'sidebar');
  btn.style.setProperty('font-size', '0.95rem', 'important');
  btn.style.setProperty('padding', '3px 8px', 'important');
  btn.style.setProperty('margin-left', '6px', 'important');
  btn.style.setProperty('border-radius', '5px', 'important');
  btn.style.setProperty('flex-shrink', '0', 'important');
  btn.style.setProperty('display', 'inline-flex', 'important');
  btn.style.setProperty('align-items', 'center', 'important');
  btn.style.setProperty('justify-content', 'center', 'important');

  // Đặt container tiêu đề thành flex để đẩy nút "+" sang bên phải tiêu đề một cách gọn gàng
  container.style.setProperty('display', 'flex', 'important');
  container.style.setProperty('align-items', 'flex-start', 'important');
  container.style.setProperty('justify-content', 'space-between', 'important');
  container.style.setProperty('gap', '4px', 'important');
  container.style.setProperty('width', '100%', 'important');

  // Thiết lập title co giãn và ẩn phần tràn chữ đúng cách
  titleEl.style.setProperty('flex', '1 1 auto', 'important');
  titleEl.style.setProperty('min-width', '0', 'important');
  titleEl.style.setProperty('overflow', 'hidden', 'important');

  container.appendChild(btn);
}

// Hàm tạo nút thêm nhanh (helper dùng chung)
function _createQuickAddBtn(card, videoUrl, videoTitle, titleRef, layout) {
  const btn = document.createElement('span');
  btn.className = 'pineapple-quick-add-btn';
  btn.dataset.videoUrl = videoUrl;
  btn.dataset.videoTitle = videoTitle;
  btn.dataset.layout = layout;
  btn.innerHTML = '+';
  btn.title = 'Thêm nhanh vào hàng đợi phát Pineapple Studio';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Đọc URL mới nhất tại thời điểm click
    let freshUrl = videoUrl;
    let freshTitle = videoTitle;
    if (layout === 'new') {
      const fa = card.querySelector('a.ytLockupMetadataViewModelTitle');
      if (fa) {
        const fhref = fa.getAttribute('href') || '';
        freshUrl = fhref.startsWith('http') ? fhref.split('&')[0] : 'https://www.youtube.com' + fhref.split('&')[0];
        freshTitle = fa.getAttribute('aria-label') || fa.textContent.trim() || freshTitle;
      }
    } else {
      const fa = card.querySelector('a.ytLockupMetadataViewModelTitle') || card.querySelector('a[href*="/watch?v="]');
      const ft = card.querySelector('#video-title') || card.querySelector('a.ytLockupMetadataViewModelTitle');
      if (fa) freshUrl = 'https://www.youtube.com' + fa.getAttribute('href').split('&')[0];
      if (ft) freshTitle = ft.textContent.trim() || freshTitle;
    }
    btn.dataset.videoUrl = freshUrl;
    btn.dataset.videoTitle = freshTitle;
    sendVideoFromSearch(freshUrl, freshTitle, btn);
  });

  return btn;
}

// MutationObserver để bắt các card trang chủ được tải muộn (lazy load / infinite scroll)
let homepageObserver = null;
function startHomepageObserver() {
  if (homepageObserver) return;
  homepageObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        // Xử lý trực tiếp nếu node là card
        if (['ytd-rich-item-renderer', 'ytd-rich-grid-media', 'ytd-video-renderer',
             'ytd-grid-video-renderer', 'ytd-compact-video-renderer', 'ytd-playlist-panel-video-renderer', 'yt-lockup-view-model'].includes(tag)) {
          injectButtonIntoCard(node);
        }
        if (tag === 'ytmusic-responsive-list-item-renderer' || tag === 'ytmusic-two-row-item-renderer' || tag === 'ytmusic-card-shelf-renderer') {
          const playlistInjected = injectYouTubeMusicPlaylistButton(node);
          if (!playlistInjected) injectYouTubeMusicTrackButton(node);
        }
        // Quét bên trong node mới thêm vào (ví dụ: cả một grid row)
        if (node.querySelectorAll) {
          node.querySelectorAll(
            'ytd-rich-item-renderer, ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model'
          ).forEach(c => injectButtonIntoCard(c));
          injectYouTubeMusicButtons(node);
        }
      }
    }
  });
  homepageObserver.observe(document.body, { childList: true, subtree: true });
}

// Khởi động MutationObserver ngay khi script chạy
startHomepageObserver();

// Hàm gửi video từ kết quả tìm kiếm sang extension background
function sendVideoFromSearch(videoUrl, videoTitle, btn) {
  if (btn.classList.contains('loading')) return;

  btn.classList.add('loading');
  btn.innerHTML = '…';
  btn.style.opacity = '0.7';

  safeSendMessage({
    action: 'send-to-pineapple',
    url: videoUrl,
    title: videoTitle,
    playNow: false
  }, (response) => {
    btn.classList.remove('loading');
    btn.style.opacity = '1';

    if (response && response.success) {
      btn.innerHTML = '✓';
      btn.style.background = 'rgba(16, 185, 129, 0.15)';
      btn.style.color = '#10B981';
      btn.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      
      setTimeout(() => {
        btn.innerHTML = '+';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 2000);
    } else {
      btn.innerHTML = '✕';
      btn.style.background = 'rgba(239, 68, 68, 0.15)';
      btn.style.color = '#EF4444';
      btn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      
      const errMsg = (response && response.error) ? response.error : 'Lỗi kết nối';
      showToast(errMsg, true);

      setTimeout(() => {
        btn.innerHTML = '+';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 3000);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pause-video') {
    const mediaElements = document.querySelectorAll('video, audio');
    let pausedAny = false;
    mediaElements.forEach(m => {
      if (m && !m.paused) {
        try {
          m.pause();
          pausedAny = true;
        } catch (_) {}
      }
    });
    if (pausedAny) {
      publishBrowserMediaState(true);
    }
    sendResponse({ success: true, paused: pausedAny });
    return true;
  }
});
