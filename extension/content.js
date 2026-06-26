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

// Kiểm tra định kỳ trang video YouTube
function checkRoute() {
  const isVideoPage = window.location.pathname === '/watch';
  if (isVideoPage) {
    injectWatchPageButton();
  }
  // Tự động quét và nhúng nút "+ Thêm nhanh" trên trang tìm kiếm/trang chủ/gợi ý
  injectSearchButtons();
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
        // Quét bên trong node mới thêm vào (ví dụ: cả một grid row)
        if (node.querySelectorAll) {
          node.querySelectorAll(
            'ytd-rich-item-renderer, ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model'
          ).forEach(c => injectButtonIntoCard(c));
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

