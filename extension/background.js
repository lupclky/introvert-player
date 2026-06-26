// Lắng nghe tin nhắn từ Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'send-to-pineapple') {
    handleSendToPineapple(request.url, request.title || '', request.playNow)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Giữ kết nối để trả lời bất đồng bộ
  }
});

// Hàm quét tìm cổng hoạt động và gửi yêu cầu thêm nhạc
async function handleSendToPineapple(videoUrl, videoTitle, playNow) {
  const startPort = 3000;
  const endPort = 3005;
  let activePort = null;

  // 1. Quét tìm cổng hoạt động của Pineapple Studio
  for (let port = startPort; port <= endPort; port++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 600); // Timeout nhanh 600ms
      
      const pingUrl = `http://127.0.0.1:${port}/api/ping`;
      const response = await fetch(pingUrl, { signal: controller.signal });
      clearTimeout(id);
      
      if (response.ok) {
        const data = await response.json();
        if (data.app === 'pineapple-studio') {
          activePort = port;
          break;
        }
      }
    } catch (e) {
      // Tiếp tục quét cổng tiếp theo nếu lỗi kết nối
    }
  }

  if (!activePort) {
    throw new Error('Không tìm thấy ứng dụng Pineapple Studio đang chạy (cổng 3000-3005). Hãy bật ứng dụng trước.');
  }

  // 2. Gửi request thêm nhạc tới cổng hoạt động
  const addSongUrl = `http://127.0.0.1:${activePort}/api/add-song`;
  const response = await fetch(addSongUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: videoUrl,
      title: videoTitle,
      playNow: !!playNow
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lỗi từ máy chủ: ${errorText || response.statusText}`);
  }

  const result = await response.json();
  if (result.success) {
    return { success: true, port: activePort };
  } else {
    throw new Error(result.error || 'Lỗi không xác định khi thêm nhạc.');
  }
}
