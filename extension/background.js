let cachedPort = null;
const mediaByTab = new Map();
let appWs = null;
let wsReconnectTimer = null;

async function pauseAllBrowserMedia() {
  // Đã bỏ tính năng tự động dừng media trên trình duyệt khi app phát nhạc
  return;
}

async function connectAppWebSocket() {
  if (appWs && (appWs.readyState === WebSocket.OPEN || appWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const port = await findAppPort();
    appWs = new WebSocket(`ws://127.0.0.1:${port}`);

    appWs.onopen = () => {
      console.log(`[Pineapple Remote] WebSocket đã kết nối tới ứng dụng tại cổng ${port}`);
    };

    appWs.onmessage = (event) => {
      // Không tự động tạm dừng media trên trình duyệt khi app phát nhạc
    };

    appWs.onclose = () => {
      appWs = null;
      scheduleWsReconnect();
    };

    appWs.onerror = () => {
      try { appWs.close(); } catch (_) {}
      appWs = null;
    };
  } catch (_) {
    scheduleWsReconnect();
  }
}

function scheduleWsReconnect() {
  clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(connectAppWebSocket, 5000);
}

// Khởi động kết nối WebSocket nền tới ứng dụng
connectAppWebSocket();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'send-to-pineapple') {
    if (request.playNow) {
      pauseAllBrowserMedia();
    }
    handleSendToPineapple(request.url, request.title || '', request.playNow)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'pause-browser-media') {
    pauseAllBrowserMedia()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'browser-media-state') {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) {
      const now = Date.now();
      const previous = mediaByTab.get(tabId);
      mediaByTab.set(tabId, {
        ...request.data,
        tabId,
        receivedAt: now,
        lastPlayingAt: request.data?.playing ? now : previous?.lastPlayingAt || 0
      });
    }
    publishSelectedMedia().then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (!mediaByTab.delete(tabId)) return;
  publishSelectedMedia().catch(() => {});
});

function selectActiveMedia() {
  const now = Date.now();
  const selected = [...mediaByTab.values()]
    .filter(item => now - item.receivedAt < 10000
      && (item.playing || now - Number(item.lastPlayingAt || 0) < 3000))
    .sort((a, b) => Number(b.playing) - Number(a.playing) || b.receivedAt - a.receivedAt)[0];

  return selected ? {
    ...selected,
    // YouTube thường phát pause/play ngắn trong lúc đổi buffer/chất lượng.
    // Giữ trạng thái qua khoảng rung này để Overlay không tắt-bật liên tục.
    playing: true
  } : {
      playing: false,
      provider: null,
      url: '',
      updatedAt: now
  };
}

async function findAppPort() {
  if (cachedPort) {
    try {
      const response = await fetch(`http://127.0.0.1:${cachedPort}/api/ping`);
      if (response.ok) return cachedPort;
    } catch (_) { }
    cachedPort = null;
  }

  for (let port = 3000; port <= 3005; port += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const response = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok && (await response.json()).app === 'pineapple-studio') {
        cachedPort = port;
        return port;
      }
    } catch (_) { }
  }
  throw new Error('Không tìm thấy Pineapple Studio đang chạy ở cổng 3000-3005.');
}

async function publishSelectedMedia() {
  const port = await findAppPort();
  const response = await fetch(`http://127.0.0.1:${port}/api/browser-media-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selectActiveMedia())
  });
  if (!response.ok) throw new Error('Ứng dụng từ chối trạng thái media trình duyệt.');
  const resData = await response.json().catch(() => ({}));
  if (resData && resData.shouldPause) {
    pauseAllBrowserMedia();
  }
  return { success: true, port };
}

async function handleSendToPineapple(videoUrl, videoTitle, playNow) {
  const resolvedUrl = await resolveYouTubeMusicReleaseUrl(videoUrl);
  const activePort = await findAppPort();
  const response = await fetch(`http://127.0.0.1:${activePort}/api/add-song`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: resolvedUrl,
      title: videoTitle,
      playNow: !!playNow
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lỗi từ máy chủ: ${errorText || response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Không thể thêm nhạc.');
  if (playNow) {
    pauseAllBrowserMedia();
  }
  return { success: true, port: activePort };
}

async function resolveYouTubeMusicReleaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch (_) {
    return rawUrl;
  }
  if (!parsed.hostname.includes('youtube.com') || !/^\/browse\/[A-Za-z0-9_-]+/i.test(parsed.pathname)) {
    return rawUrl;
  }

  try {
    const response = await fetch(parsed.toString(), { credentials: 'omit' });
    if (!response.ok) return rawUrl;
    const html = await response.text();
    const normalized = html
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/&amp;/gi, '&');
    const playlistId = normalized.match(/"playlistId"\s*:\s*"(OLAK5uy_[A-Za-z0-9_-]+)"/i)?.[1]
      || normalized.match(/[?&]list=(OLAK5uy_[A-Za-z0-9_-]+)/i)?.[1]
      || normalized.match(/"playlistId"\s*:\s*"(PL[A-Za-z0-9_-]+|RD[A-Za-z0-9_-]+|[A-Za-z0-9_-]{16,})"/i)?.[1]
      || normalized.match(/[?&]list=(PL[A-Za-z0-9_-]+|RD[A-Za-z0-9_-]+|[A-Za-z0-9_-]{16,})/i)?.[1];
    if (playlistId) {
      return `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    }
  } catch (err) {
    console.warn('[Extension] Không thể phân giải URL đĩa nhạc YouTube Music:', err);
  }
  return rawUrl;
}

