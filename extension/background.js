let cachedPort = null;
const mediaByTab = new Map();
let currentPlayingTabId = null;
let appWs = null;
let wsReconnectTimer = null;

async function pauseOtherBrowserMedia(exceptTabId) {
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://music.youtube.com/*', '*://soundcloud.com/*'] });
    for (const tab of tabs) {
      if (tab.id !== exceptTabId) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'pause-video' });
        } catch (err) {}
      }
    }
  } catch (err) {
    console.error('Lỗi khi tạm dừng media tab khác:', err);
  }
}

async function pauseAllBrowserMedia() {
  currentPlayingTabId = null;
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://music.youtube.com/*', '*://soundcloud.com/*'] });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'pause-video' });
      } catch (err) {}
    }
  } catch (err) {
    console.error('Lỗi khi tạm dừng media:', err);
  }
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
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'app_playback_started' && data.isPlaying) {
          pauseAllBrowserMedia();
        }
      } catch (err) {}
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
      const isPlaying = Boolean(request.data?.playing);
      const previous = mediaByTab.get(tabId);
      const justStarted = isPlaying && (!previous || !previous.playing);

      mediaByTab.set(tabId, {
        ...request.data,
        tabId,
        playing: isPlaying,
        receivedAt: now,
        lastPlayingAt: isPlaying ? now : (previous?.lastPlayingAt || 0)
      });

      if (justStarted) {
        currentPlayingTabId = tabId;
        // Khi 1 tab YouTube bắt đầu phát, tự động tạm dừng tất cả tab YouTube khác
        pauseOtherBrowserMedia(tabId);
      } else if (!isPlaying && currentPlayingTabId === tabId) {
        // Tab đang phát vừa tạm dừng -> kiểm tra xem có tab nào khác đang phát không
        const otherPlaying = [...mediaByTab.values()].find(t => t.tabId !== tabId && t.playing && (now - t.receivedAt < 15000));
        currentPlayingTabId = otherPlaying ? otherPlaying.tabId : null;
      }
    }
    publishSelectedMedia().then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (currentPlayingTabId === tabId) {
    currentPlayingTabId = null;
  }
  if (!mediaByTab.delete(tabId)) return;
  publishSelectedMedia().catch(() => {});
});

function selectActiveMedia() {
  const now = Date.now();
  const validTabs = [...mediaByTab.values()].filter(item => now - item.receivedAt < 15000);

  // 1. Ưu tiên tab đang được xác định là active và đang phát
  if (currentPlayingTabId) {
    const activeItem = validTabs.find(item => item.tabId === currentPlayingTabId && item.playing);
    if (activeItem) {
      return { ...activeItem, playing: true, updatedAt: now };
    }
  }

  // 2. Tìm bất kỳ tab nào đang phát nhạc thực sự (sắp xếp theo thời gian nhận mới nhất)
  const playingTabs = validTabs
    .filter(item => item.playing)
    .sort((a, b) => b.receivedAt - a.receivedAt);

  if (playingTabs.length > 0) {
    currentPlayingTabId = playingTabs[0].tabId;
    return { ...playingTabs[0], playing: true, updatedAt: now };
  }

  // 3. Nếu không có tab nào đang phát, lấy thông tin metadata của tab gần nhất với trạng thái playing: false
  const mostRecentTab = validTabs.sort((a, b) => (b.lastPlayingAt || b.receivedAt) - (a.lastPlayingAt || a.receivedAt))[0];
  if (mostRecentTab) {
    return { ...mostRecentTab, playing: false, updatedAt: now };
  }

  return {
    playing: false,
    provider: null,
    url: '',
    title: '',
    artist: '',
    thumbnail: '',
    currentTime: 0,
    duration: 0,
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-pineapple-queue",
    title: "Thêm nhạc vào Pineapple Studio",
    contexts: ["link", "page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-to-pineapple-queue") {
    const url = info.linkUrl || info.pageUrl;
    if (url) {
      handleSendToPineapple(url, tab?.title || "Nhạc từ menu chuột phải", false)
        .then(() => console.log("[Extension] Đã thêm vào hàng đợi:", url))
        .catch(err => console.error("[Extension] Lỗi khi thêm qua context menu:", err));
    }
  }
});
