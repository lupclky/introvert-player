const { app, BrowserWindow, Menu, Tray, ipcMain, session, shell } = require('electron');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');

let mainWindow = null;
let server = null;
let serverPort = 3000;
let tray = null;
app.isQuitting = false;
let wss = null;
const activeWsClients = new Set();

// Tắt GPU và sandbox để tránh crash khi chạy từ thư mục AppData
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');
app.disableHardwareAcceleration();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Bộ ánh xạ MIME types để server phục vụ đúng định dạng file
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  // Hàm bổ trợ kiểm tra Origin tin cậy (localhost, 127.0.0.1, file:// và null của OBS local file)
  function isOriginAllowed(origin) {
    if (!origin || origin === 'null') return true;
    return /^http:\/\/localhost(:\d+)?$/.test(origin) || 
           /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) || 
           /^file:\/\//.test(origin);
  }

  // Hàm khởi tạo Local HTTP Server
  function createLocalServer(startPort, callback) {
    server = http.createServer((req, res) => {
      const origin = req.headers.origin;

      // Chặn các request CORS có Origin lạ không nằm trong whitelist
      if (origin && !isOriginAllowed(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Cross-Origin Request Blocked');
        return;
      }

      // Helper để sinh CORS Headers động cho các phản hồi
      function getCorsHeaders(extraHeaders = {}) {
        const headers = { ...extraHeaders };
        if (origin) {
          headers['Access-Control-Allow-Origin'] = origin;
        }
        return headers;
      }

      // Xử lý tiền kiểm CORS (OPTIONS Preflight)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
      }

      // Xử lý API lưu cấu hình (POST /api/config)
      if (req.url === '/api/config' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const configPath = path.join(app.getPath('userData'), 'config.json');
            fs.writeFileSync(configPath, body, 'utf8');
            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error('Lỗi lưu cấu hình AppData:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xử lý API phân giải URL rút gọn (GET /api/resolve?url=...)
      if (req.url.startsWith('/api/resolve') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const targetUrl = parsedUrl.searchParams.get('url');
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        const https = require('https');
        const http = require('http');

        function followRedirects(urlToFetch, depth = 0) {
          if (depth > 5) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many redirects' }));
            return;
          }

          const client = urlToFetch.startsWith('https') ? https : http;
          try {
            client.get(urlToFetch, (clientRes) => {
              if (clientRes.statusCode >= 300 && clientRes.statusCode < 400 && clientRes.headers.location) {
                let nextUrl = clientRes.headers.location;
                if (!nextUrl.startsWith('http')) {
                  const origin = new URL(urlToFetch).origin;
                  nextUrl = new URL(nextUrl, origin).href;
                }
                followRedirects(nextUrl, depth + 1);
              } else {
                res.writeHead(200, getCorsHeaders({
                  'Content-Type': 'application/json'
                }));
                res.end(JSON.stringify({ resolvedUrl: urlToFetch }));
              }
            }).on('error', (err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            });
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        }

        followRedirects(targetUrl);
        return;
      }

      // Xử lý API lấy độ dài thật của YouTube video (GET /api/youtube-duration?videoId=...)
      if (req.url.startsWith('/api/youtube-duration') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const videoId = parsedUrl.searchParams.get('videoId');
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing videoId parameter' }));
          return;
        }

        const https = require('https');
        const postData = JSON.stringify({
          videoId: videoId,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20210621.02.00'
            }
          }
        });

        try {
          const reqOpts = {
            hostname: 'www.youtube.com',
            port: 443,
            path: '/youtubei/v1/player',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          };

          const ytReq = https.request(reqOpts, (ytRes) => {
            let data = '';
            ytRes.setEncoding('utf8');
            ytRes.on('data', chunk => data += chunk);
            ytRes.on('end', () => {
              let duration = 0;
              let views = '';
              try {
                const json = JSON.parse(data);
                if (json && json.videoDetails) {
                  duration = parseInt(json.videoDetails.lengthSeconds || 0, 10);
                  views = json.videoDetails.viewCount || '';
                }
              } catch (e) {
                console.error("Error parsing YouTube player JSON:", e);
              }
              res.writeHead(200, getCorsHeaders({
                'Content-Type': 'application/json'
              }));
              res.end(JSON.stringify({ duration: duration, views: views }));
            });
          });

          ytReq.on('error', (err) => {
            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({ duration: 0, views: '', error: err.message }));
          });

          ytReq.write(postData);
          ytReq.end();
        } catch (e) {
          res.writeHead(200, getCorsHeaders({
            'Content-Type': 'application/json'
          }));
          res.end(JSON.stringify({ duration: 0, views: '', error: e.message }));
        }
        return;
      }

      // Xử lý API tìm kiếm video YouTube (GET /api/youtube-search?q=...)
      if (req.url.startsWith('/api/youtube-search') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const query = parsedUrl.searchParams.get('q');
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing q parameter' }));
          return;
        }

        const https = require('https');
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;

        try {
          const reqOpts = {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            }
          };
          https.get(searchUrl, reqOpts, (clientRes) => {
            let body = '';
            clientRes.setEncoding('utf8');
            clientRes.on('data', chunk => body += chunk);
            clientRes.on('end', () => {
              try {
                const regex = /ytInitialData\s*=\s*({.+?});/;
                const match = body.match(regex);
                if (!match) {
                  res.writeHead(200, getCorsHeaders({
                    'Content-Type': 'application/json'
                  }));
                  res.end(JSON.stringify({ success: false, error: 'Could not find ytInitialData in response' }));
                  return;
                }

                const jsonObj = JSON.parse(match[1]);
                const contents = jsonObj.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                if (!contents) {
                  res.writeHead(200, getCorsHeaders({
                    'Content-Type': 'application/json'
                  }));
                  res.end(JSON.stringify({ success: false, error: 'Unexpected JSON structure' }));
                  return;
                }

                let items = [];
                for (const content of contents) {
                  if (content.itemSectionRenderer) {
                    items = content.itemSectionRenderer.contents;
                    break;
                  }
                }

                const videos = [];
                for (const item of items) {
                  if (item.videoRenderer) {
                    const v = item.videoRenderer;
                    const videoId = v.videoId;
                    const title = v.title?.runs?.[0]?.text || '';
                    const thumbnail = v.thumbnail?.thumbnails?.[0]?.url || '';
                    const duration = v.lengthText?.simpleText || '0:00';
                    const author = v.ownerText?.runs?.[0]?.text || '';
                    const views = v.viewCountText?.simpleText || '';

                    if (videoId && title) {
                      videos.push({
                        videoId,
                        title,
                        thumbnail,
                        duration,
                        author,
                        views,
                        url: `https://www.youtube.com/watch?v=${videoId}`
                      });
                    }
                  }
                }

                res.writeHead(200, getCorsHeaders({
                  'Content-Type': 'application/json'
                }));
                res.end(JSON.stringify({ success: true, videos: videos.slice(0, 15) }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          }).on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      // Xử lý API lấy độ dài thật của SoundCloud video/track (GET /api/soundcloud-duration?url=...)
      if (req.url.startsWith('/api/soundcloud-duration') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const trackUrl = parsedUrl.searchParams.get('url');
        if (!trackUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        const https = require('https');
        const http = require('http');

        function parseISO8601Duration(durationStr) {
          const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
          const matches = durationStr.match(regex);
          if (!matches) return 0;
          const hours = parseInt(matches[1] || 0);
          const minutes = parseInt(matches[2] || 0);
          const seconds = parseInt(matches[3] || 0);
          return hours * 3600 + minutes * 60 + seconds;
        }

        function fetchSoundCloudPage(urlToFetch, depth = 0) {
          if (depth > 5) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many redirects' }));
            return;
          }

          const client = urlToFetch.startsWith('https') ? https : http;
          try {
            const reqOpts = {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            };
            client.get(urlToFetch, reqOpts, (clientRes) => {
              if (clientRes.statusCode >= 300 && clientRes.statusCode < 400 && clientRes.headers.location) {
                let nextUrl = clientRes.headers.location;
                if (!nextUrl.startsWith('http')) {
                  const origin = new URL(urlToFetch).origin;
                  nextUrl = new URL(nextUrl, origin).href;
                }
                fetchSoundCloudPage(nextUrl, depth + 1);
              } else {
                let data = '';
                clientRes.setEncoding('utf8');
                clientRes.on('data', chunk => data += chunk);
                clientRes.on('end', () => {
                  let duration = 0;
                  const match = data.match(/itemprop="duration"\s+content="([^"]+)"/i) || 
                                data.match(/<meta[^>]+itemprop="duration"[^>]+content="([^"]+)"/i) ||
                                data.match(/content="([^"]+)"[^>]+itemprop="duration"/i);
                  if (match && match[1]) {
                    duration = parseISO8601Duration(match[1]);
                  }
                  let playCount = '';
                  const playMatch = data.match(/<meta[^>]+property="soundcloud:play_count"[^>]+content="(\d+)"/i) ||
                                    data.match(/content="(\d+)"[^>]+property="soundcloud:play_count"/i) ||
                                    data.match(/"playback_count"\s*:\s*(\d+)/);
                  if (playMatch && playMatch[1]) {
                    playCount = playMatch[1];
                  }

                  res.writeHead(200, getCorsHeaders({
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                  }));
                  res.end(JSON.stringify({ duration: duration, playCount: playCount }));
                });
              }
            }).on('error', (err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            });
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        }

        fetchSoundCloudPage(trackUrl);
        return;
      }

      // Xử lý API đọc cấu hình (GET /api/config)
      if (req.url === '/api/config' && req.method === 'GET') {
        try {
          const configPath = path.join(app.getPath('userData'), 'config.json');
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(configData);
          } else {
            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({}));
          }
        } catch (err) {
          console.error('Lỗi đọc cấu hình AppData:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // Chỉ chấp nhận GET requests cho file tĩnh
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('Method Not Allowed');
      }

      // Làm sạch path để tránh tấn công Directory Traversal
      let safeUrl = req.url.split('?')[0];
      if (safeUrl === '/') {
        safeUrl = '/index.html';
      }

      const filePath = path.join(__dirname, safeUrl);

      // Kiểm tra xem file có nằm trong thư mục ứng dụng hay không
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
      }

      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('File Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, getCorsHeaders({
          'Content-Type': contentType,
          'Cache-Control': 'no-store, must-revalidate'
        }));

        const readStream = fs.createReadStream(filePath);
        readStream.on('error', (streamErr) => {
          console.error('Error reading file:', streamErr);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        });
        readStream.pipe(res);
      });
    });

    // Khởi tạo WebSocket Server gắn với HTTP Server hiện tại
    wss = new WebSocket.Server({ server });
    wss.on('connection', (ws, req) => {
      const origin = req.headers.origin;
      if (origin && !isOriginAllowed(origin)) {
        console.warn(`[WebSocket] Kết nối bị từ chối do origin lạ: ${origin}`);
        ws.close();
        return;
      }

      activeWsClients.add(ws);
      console.log(`[WebSocket] OBS Overlay đã kết nối. Tổng số client: ${activeWsClients.size}`);

      ws.on('message', (message) => {
        try {
          const msgStr = message.toString();
          // Chuyển tiếp tin nhắn từ Overlay sang Dashboard (Renderer)
          if (mainWindow) {
            mainWindow.webContents.send('from-overlay', JSON.parse(msgStr));
          }
        } catch (err) {
          console.error('[WebSocket] Lỗi xử lý tin nhắn từ overlay:', err);
        }
      });

      ws.on('close', () => {
        activeWsClients.delete(ws);
        console.log(`[WebSocket] OBS Overlay đã ngắt kết nối. Tổng số client: ${activeWsClients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[WebSocket] Lỗi kết nối client:', err);
        activeWsClients.delete(ws);
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${startPort} is in use, trying next port...`);
        if (wss) {
          try { wss.close(); } catch(e){}
          wss = null;
          activeWsClients.clear();
        }
        createLocalServer(startPort + 1, callback);
      } else {
        console.error('Server error:', err);
      }
    });

    server.listen(startPort, '127.0.0.1', () => {
      serverPort = startPort;
      console.log(`Server is running on http://127.0.0.1:${serverPort}`);
      callback(serverPort);
    });
  }

  function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      title: "Introvert Player",
      frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Load trang Dashboard thông qua URL của local server
    mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

    // Tạo menu ứng dụng cơ bản
    Menu.setApplicationMenu(null); // Ẩn menu mặc định để giao diện trông tối giản và chuyên nghiệp hơn



    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('window-state-change', 'maximized');
    });

    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('window-state-change', 'normal');
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  function createTray() {
    const { nativeImage } = require('electron');

    // Ưu tiên tải icon từ extraResources (nằm ngoài ASAR), fallback vào __dirname (khi dev)
    let iconPath = path.join(process.resourcesPath, 'icon.ico');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, 'build', 'icon.ico');
    }

    const trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.error('Tray icon is empty, skipping tray creation. Path:', iconPath);
      return;
    }
    tray = new Tray(trayIcon);

    const getContextMenu = () => {
      const loginSettings = app.getLoginItemSettings();
      return Menu.buildFromTemplate([
        {
          label: 'Hiển thị',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          }
        },
        {
          label: 'Khởi động cùng Windows',
          type: 'checkbox',
          checked: loginSettings.openAtLogin,
          click: (menuItem) => {
            app.setLoginItemSettings({
              openAtLogin: menuItem.checked,
              path: app.getPath('exe')
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Thoát',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]);
    };

    tray.setToolTip('Introvert Player');

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    tray.on('right-click', () => {
      const contextMenu = getContextMenu();
      tray.popUpContextMenu(contextMenu);
    });
  }

  app.whenReady().then(() => {
    // Bắt đầu khởi chạy server trước, sau đó tạo cửa sổ hiển thị
    createLocalServer(3000, (port) => {
      createWindow(port);
      try {
        createTray();
      } catch (e) {
        console.error('Failed to create tray icon:', e);
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (server) {
        server.close();
      }
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow(serverPort);
    }
  });
}

// Chuyển tiếp tin nhắn từ Dashboard tới tất cả các client WebSocket (OBS Overlay)
ipcMain.on('send-to-overlay', (event, message) => {
  const msgStr = JSON.stringify(message);
  activeWsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msgStr);
      } catch (err) {
        console.error('[WebSocket] Lỗi gửi tin nhắn sang overlay:', err);
      }
    }
  });
});

// Lắng nghe sự kiện điều khiển cửa sổ từ Dashboard (Renderer)
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') {
    mainWindow.minimize();
  } else if (action === 'maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  } else if (action === 'close') {
    mainWindow.close();
  }
});

ipcMain.handle('search-youtube', async (event, query) => {
  if (currentSearchReq) {
    try {
      currentSearchReq.destroy();
    } catch (e) {}
    currentSearchReq = null;
  }
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const cookies = await getYoutubeCookieHeader();
    
    let cookieStr = cookies || '';
    if (!cookieStr.includes('SOCS=')) {
      if (cookieStr) cookieStr += '; ';
      cookieStr += 'SOCS=CAESEwgDEgk0ODE3Nzk3OTQaAmVuIAEaBgiA_eWqBg';
    }
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cookie': cookieStr
    };
    
    const { html } = await fetchHtmlWithRedirects(url, headers);
    const jsonObj = extractYtInitialData(html);
    if (!jsonObj) {
      return { error: "Could not find or parse ytInitialData in response" };
    }
    
    const contents = jsonObj.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) {
      return { error: "Unexpected JSON structure" };
    }
    
    let items = [];
    for (const content of contents) {
      if (content.itemSectionRenderer) {
        items = content.itemSectionRenderer.contents;
        break;
      }
    }
    
    const videos = [];
    for (const item of items) {
      if (item.videoRenderer) {
        const v = item.videoRenderer;
        const videoId = v.videoId;
        const title = v.title?.runs?.[0]?.text || '';
        const thumbnail = v.thumbnail?.thumbnails?.[0]?.url || '';
        const duration = v.lengthText?.simpleText || '0:00';
        const author = v.ownerText?.runs?.[0]?.text || '';
        const views = v.viewCountText?.simpleText || '';
        
        if (videoId && title) {
          videos.push({
            videoId,
            title,
            thumbnail,
            duration,
            author,
            views,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
        }
      }
    }
    
    return { success: true, videos: videos.slice(0, 15) };
  } catch (e) {
    if (e.message === 'SEARCH_ABORTED') {
      return { success: false, aborted: true };
    }
    return { error: e.message };
  }
});

ipcMain.handle('get-youtube-metadata', async (event, videoId) => {
  return new Promise((resolve) => {
    const https = require('https');
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}`;
    
    function decodeHtmlEntities(str) {
      if (!str) return '';
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&ndash;/g, '-')
        .replace(/&mdash;/g, '-');
    }

    https.get(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.title) {
            return resolve({
              title: decodeHtmlEntities(json.title),
              thumbnail: json.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
            });
          }
        } catch (e) {}
        fallbackScrape();
      });
    }).on('error', () => {
      fallbackScrape();
    });

    function fallbackScrape() {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      https.get(watchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const titleMatch = data.match(/<title>(.*?)<\/title>/i);
          let title = titleMatch ? titleMatch[1] : '';
          if (title.endsWith(' - YouTube')) {
            title = title.substring(0, title.length - 10);
          }
          title = title.trim();
          if (title && title !== 'YouTube') {
            resolve({
              title: decodeHtmlEntities(title),
              thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
            });
          } else {
            resolve({
              title: `Nhạc YouTube (${videoId})`,
              thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
            });
          }
        });
      }).on('error', () => {
        resolve({
          title: `Nhạc YouTube (${videoId})`,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        });
      });
    }
  });
});

// ==========================================
// YOUTUBE ACCOUNT SYNC HANDLERS (OPTION 2)
// ==========================================

// Helper to follow redirects and get page HTML
function fetchHtmlWithRedirects(urlToFetch, reqHeaders, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) {
      return reject(new Error("Too many redirects"));
    }
    const https = require('https');
    try {
      const req = https.get(urlToFetch, { headers: reqHeaders }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const origin = new URL(urlToFetch).origin;
            nextUrl = new URL(nextUrl, origin).href;
          }
          return fetchHtmlWithRedirects(nextUrl, reqHeaders, depth + 1).then(resolve, reject);
        }
        
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ html: data, statusCode: res.statusCode });
        });
      });
      
      currentSearchReq = req;
      
      req.on('error', (err) => {
        if (req.destroyed) {
          reject(new Error("SEARCH_ABORTED"));
        } else {
          reject(err);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Helper to extract ytInitialData from HTML using robust substring search
function extractYtInitialData(html) {
  const startStr = 'ytInitialData = ';
  let startIdx = html.indexOf(startStr);
  let jsonStartIdx = -1;
  
  if (startIdx !== -1) {
    jsonStartIdx = startIdx + startStr.length;
  } else {
    // Thử các mẫu khác
    const altStarts = [
      "window['ytInitialData'] = ",
      'window["ytInitialData"] = ',
      "ytInitialData="
    ];
    for (const alt of altStarts) {
      const idx = html.indexOf(alt);
      if (idx !== -1) {
        jsonStartIdx = idx + alt.length;
        break;
      }
    }
  }
  
  if (jsonStartIdx === -1) return null;
  
  // Tìm thẻ kết thúc </script> của block script hiện tại
  const endIdx = html.indexOf('</script>', jsonStartIdx);
  if (endIdx === -1) return null;
  
  let jsonStr = html.substring(jsonStartIdx, endIdx).trim();
  // Loại bỏ dấu chấm phẩy ở cuối nếu có
  if (jsonStr.endsWith(';')) {
    jsonStr = jsonStr.substring(0, jsonStr.length - 1).trim();
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Fallback: Sử dụng regex nếu cắt chuỗi đơn giản gặp lỗi
    const patterns = [
      /ytInitialData\s*=\s*({.+?});/,
      /ytInitialData\s*=\s*({.+?})(?:\s*;|\s*<\/script>)/,
      /ytInitialData\s*=\s*({[\s\S]+?});/,
      /ytInitialData\s*=\s*({[\s\S]+?})(?:\s*;|\s*<\/script>)/
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch (e2) {}
      }
    }
  }
  return null;
}

async function getYoutubeCookieHeader() {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://www.youtube.com' });
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function getSapisidHash() {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://www.youtube.com' });
  const sapisidCookie = cookies.find(c => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
  if (!sapisidCookie) return null;
  
  const sapisid = sapisidCookie.value;
  const time = Math.floor(Date.now() / 1000);
  const origin = 'https://www.youtube.com';
  const msg = `${time} ${sapisid} ${origin}`;
  const sha1 = crypto.createHash('sha1').update(msg).digest('hex');
  return `SAPISIDHASH ${time}_${sha1}`;
}

function findKeysRecursive(obj, keys, results = []) {
  if (!obj || typeof obj !== 'object') return results;
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findKeysRecursive(item, keys, results);
    }
  } else {
    for (const k of Object.keys(obj)) {
      if (keys.includes(k)) {
        results.push({ key: k, value: obj[k] });
      }
      findKeysRecursive(obj[k], keys, results);
    }
  }
  return results;
}

function extractVideoData(v) {
  const videoId = v.videoId;
  if (!videoId) return null;
  
  let title = '';
  if (typeof v.title === 'string') {
    title = v.title;
  } else if (v.title?.runs?.[0]?.text) {
    title = v.title.runs[0].text;
  } else if (v.title?.simpleText) {
    title = v.title.simpleText;
  }
  
  let thumbnail = '';
  if (v.thumbnail?.thumbnails?.length > 0) {
    const thumbs = v.thumbnail.thumbnails;
    thumbnail = thumbs[thumbs.length - 1].url;
  } else {
    thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  
  let duration = '0:00';
  if (v.lengthText?.simpleText) {
    duration = v.lengthText.simpleText;
  } else if (v.thumbnailOverlays) {
    for (const overlay of v.thumbnailOverlays) {
      if (overlay.thumbnailOverlayTimeStatusRenderer?.text?.simpleText) {
        duration = overlay.thumbnailOverlayTimeStatusRenderer.text.simpleText;
        break;
      }
    }
  }
  
  let author = '';
  if (v.ownerText?.runs?.[0]?.text) {
    author = v.ownerText.runs[0].text;
  } else if (v.shortBylineText?.runs?.[0]?.text) {
    author = v.shortBylineText.runs[0].text;
  }
  
  let views = '';
  if (v.viewCountText?.simpleText) {
    views = v.viewCountText.simpleText;
  } else if (v.shortViewCountText?.simpleText) {
    views = v.shortViewCountText.simpleText;
  }
  
  return {
    videoId,
    title,
    thumbnail,
    duration,
    author,
    views,
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

function extractPlaylistData(p) {
  const playlistId = p.playlistId;
  if (!playlistId) return null;
  
  let title = '';
  if (typeof p.title === 'string') {
    title = p.title;
  } else if (p.title?.runs?.[0]?.text) {
    title = p.title.runs[0].text;
  } else if (p.title?.simpleText) {
    title = p.title.simpleText;
  }
  
  let thumbnail = '';
  if (p.thumbnail?.thumbnails?.length > 0) {
    thumbnail = p.thumbnail.thumbnails[p.thumbnail.thumbnails.length - 1].url;
  } else if (p.thumbnails?.[0]?.thumbnails?.length > 0) {
    thumbnail = p.thumbnails[0].thumbnails[0].url;
  }
  
  let videoCount = '0';
  if (p.videoCount) {
    videoCount = String(p.videoCount);
  } else if (p.videoCountText?.runs?.[0]?.text) {
    videoCount = p.videoCountText.runs[0].text;
  } else if (p.videoCountText?.simpleText) {
    videoCount = p.videoCountText.simpleText;
  } else if (p.videoCountShortText?.simpleText) {
    videoCount = p.videoCountShortText.simpleText;
  }
  
  return {
    playlistId,
    title,
    thumbnail,
    videoCount
  };
}

function extractVideoFromLockup(v) {
  if (v.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  
  const videoId = v.contentId;
  if (!videoId) return null;
  
  const m = v.metadata?.lockupMetadataViewModel;
  const title = m?.title?.content || '';
  
  let thumbnail = '';
  const sources = v.contentImage?.thumbnailViewModel?.image?.sources;
  if (sources && sources.length > 0) {
    thumbnail = sources[sources.length - 1].url;
  } else {
    thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  
  let duration = '0:00';
  const overlays = v.contentImage?.thumbnailViewModel?.overlays;
  if (overlays && overlays.length > 0) {
    for (const ov of overlays) {
      const text = ov.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
      if (text) {
        duration = text;
        break;
      }
    }
  }
  
  let author = '';
  let views = '';
  const rows = m?.metadata?.contentMetadataViewModel?.metadataRows;
  if (rows && rows.length > 0) {
    author = rows[0].metadataParts?.[0]?.text?.content || '';
    if (rows.length > 1) {
      views = rows[1].metadataParts?.[0]?.text?.content || '';
    }
  }
  
  return {
    videoId,
    title,
    thumbnail,
    duration,
    author,
    views,
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

function extractPlaylistFromLockup(p) {
  if (p.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') return null;
  
  const playlistId = p.contentId;
  if (!playlistId) return null;
  
  const m = p.metadata?.lockupMetadataViewModel;
  const title = m?.title?.content || '';
  
  let thumbnail = '';
  const sources = p.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources;
  if (sources && sources.length > 0) {
    thumbnail = sources[sources.length - 1].url;
  }
  
  let videoCount = '0';
  const overlays = p.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays;
  if (overlays && overlays.length > 0) {
    for (const ov of overlays) {
      const text = ov.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel?.text;
      if (text) {
        videoCount = text;
        break;
      }
    }
  }
  
  return {
    playlistId,
    title,
    thumbnail,
    videoCount
  };
}

async function fetchYoutubePageData(url) {
  const cookies = await getYoutubeCookieHeader();
  
  let cookieStr = cookies || '';
  if (!cookieStr.includes('SOCS=')) {
    if (cookieStr) cookieStr += '; ';
    cookieStr += 'SOCS=CAESEwgDEgk0ODE3Nzk3OTQaAmVuIAEaBgiA_eWqBg';
  }
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': cookieStr
  };
  
  const { html } = await fetchHtmlWithRedirects(url, headers);
  const jsonObj = extractYtInitialData(html);
  if (!jsonObj) {
    throw new Error("Could not find or parse ytInitialData in response");
  }
  return jsonObj;
}

async function fetchYoutubePageDataAndHtml(url) {
  const cookies = await getYoutubeCookieHeader();
  
  let cookieStr = cookies || '';
  if (!cookieStr.includes('SOCS=')) {
    if (cookieStr) cookieStr += '; ';
    cookieStr += 'SOCS=CAESEwgDEgk0ODE3Nzk3OTQaAmVuIAEaBgiA_eWqBg';
  }
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': cookieStr
  };
  
  const { html } = await fetchHtmlWithRedirects(url, headers);
  const jsonObj = extractYtInitialData(html);
  if (!jsonObj) {
    throw new Error("Could not find or parse ytInitialData in response");
  }
  return { jsonObj, html };
}

ipcMain.handle('youtube-login', async () => {
  return new Promise((resolve) => {
    let win = new BrowserWindow({
      width: 500,
      height: 600,
      title: 'Đăng nhập YouTube',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    win.loadURL('https://www.youtube.com/signin');
    
    // Check cookies periodically
    const checkInterval = setInterval(async () => {
      if (win.isDestroyed()) {
        clearInterval(checkInterval);
        return;
      }
      
      try {
        const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
        const hasSid = cookies.some(c => c.name === 'SID' || c.name === '__Secure-3PSID');
        
        if (hasSid) {
          clearInterval(checkInterval);
          win.destroy();
          resolve({ success: true });
        }
      } catch (e) {
        // ignore errors during polling
      }
    }, 1000);
    
    win.on('closed', () => {
      clearInterval(checkInterval);
      resolve({ success: false, error: 'User closed window' });
    });
  });
});

ipcMain.handle('youtube-check-auth', async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
    const hasSid = cookies.some(c => c.name === 'SID' || c.name === '__Secure-3PSID');
    
    let displayName = 'YouTube Account';
    let avatarUrl = '';
    
    if (hasSid) {
      // Try to fetch home page to extract user avatar/name if possible
      try {
        const data = await fetchYoutubePageData('https://www.youtube.com');
        // Look for avatar/name in initial data
        const keys = ['avatar', 'accountName'];
        const results = findKeysRecursive(data, keys);
        for (const item of results) {
          if (item.key === 'avatar' && item.value?.thumbnails?.[0]?.url) {
            avatarUrl = item.value.thumbnails[0].url;
          }
          if (item.key === 'accountName' && item.value?.runs?.[0]?.text) {
            displayName = item.value.runs[0].text;
          }
        }
      } catch (e) {
        // Fallback to generic info if fetching fails
      }
    }
    
    return { loggedIn: hasSid, displayName, avatarUrl };
  } catch (error) {
    return { loggedIn: false, error: error.message };
  }
});

ipcMain.handle('youtube-logout', async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({});
    for (const cookie of cookies) {
      if (cookie.domain.includes('youtube') || cookie.domain.includes('google')) {
        let domain = cookie.domain;
        if (domain.startsWith('.')) {
          domain = domain.substring(1);
        }
        const url = `https://${domain}${cookie.path}`;
        await session.defaultSession.cookies.remove(url, cookie.name);
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('youtube-get-playlists', async () => {
  try {
    const data = await fetchYoutubePageData('https://www.youtube.com/feed/playlists');
    const keys = ['playlistRenderer', 'gridPlaylistRenderer', 'lockupViewModel'];
    const results = findKeysRecursive(data, keys);
    const playlists = [];
    const seenIds = new Set();
    
    for (const item of results) {
      if (item.key === 'lockupViewModel') {
        const p = extractPlaylistFromLockup(item.value);
        if (p && !seenIds.has(p.playlistId)) {
          seenIds.add(p.playlistId);
          playlists.push(p);
        }
      } else {
        const p = extractPlaylistData(item.value);
        if (p && !seenIds.has(p.playlistId)) {
          seenIds.add(p.playlistId);
          playlists.push(p);
        }
      }
    }
    return { success: true, playlists };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('youtube-get-playlist-videos', async (event, playlistId) => {
  try {
    const data = await fetchYoutubePageData(`https://www.youtube.com/playlist?list=${playlistId}`);
    const keys = ['playlistVideoRenderer', 'videoRenderer', 'gridVideoRenderer', 'compactVideoRenderer', 'lockupViewModel'];
    const results = findKeysRecursive(data, keys);
    const videos = [];
    const seenIds = new Set();
    
    for (const item of results) {
      if (item.key === 'lockupViewModel') {
        const v = extractVideoFromLockup(item.value);
        if (v && !seenIds.has(v.videoId)) {
          seenIds.add(v.videoId);
          videos.push(v);
        }
      } else {
        const v = extractVideoData(item.value);
        if (v && !seenIds.has(v.videoId)) {
          seenIds.add(v.videoId);
          videos.push(v);
        }
      }
    }
    return { success: true, videos };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('youtube-get-recommendations', async () => {
  try {
    // Bước 1: Tải trang chủ YouTube với đầy đủ cookies của tài khoản đã đăng nhập
    // fetchYoutubePageDataAndHtml đã xử lý SOCS cookie + redirect đúng chuẩn, trả về cả JSON và HTML thô
    const { jsonObj: homeData, html: homepageHtml } = await fetchYoutubePageDataAndHtml('https://www.youtube.com');

    // Lấy cookies đầy đủ (bao gồm SID, SAPISID, SOCS...) để dùng cho Innertube POST
    const rawCookies = await getYoutubeCookieHeader();
    let cookieStr = rawCookies || '';
    if (!cookieStr.includes('SOCS=')) {
      if (cookieStr) cookieStr += '; ';
      cookieStr += 'SOCS=CAESEwgDEgk0ODE3Nzk3OTQaAmVuIAEaBgiA_eWqBg';
    }

    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cookie': cookieStr
    };

    const authHeader = await getSapisidHash();
    if (authHeader) {
      baseHeaders['Authorization'] = authHeader;
    }

    // Lấy API Key từ trang chủ HTML (Ưu tiên apiKey thực tế của session rồi mới đến INNERTUBE_API_KEY dự phòng)
    const apiKeyMatch = homepageHtml.match(/"apiKey"\s*:\s*"([^"]+)"/) || homepageHtml.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

    // Helper: POST Innertube browse với cookies tài khoản đầy đủ
    const innertubePost = (body) => new Promise((resolve, reject) => {
      const postStr = JSON.stringify(body);
      const reqOpts = {
        hostname: 'www.youtube.com',
        port: 443,
        path: `/youtubei/v1/browse?key=${apiKey}`,
        method: 'POST',
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': '2.20240308.01.00',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/'
        }
      };
      const req = https.request(reqOpts, (res) => {
        let resBody = '';
        res.setEncoding('utf8');
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(resBody)); } catch (e) { reject(e); }
        });
      });
      req.on('error', err => reject(err));
      req.write(postStr);
      req.end();
    });

    const innertubeCxt = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240308.01.00',
          originalUrl: 'https://www.youtube.com',
          hl: 'vi',
          gl: 'VN'
        }
      }
    };

    // Tìm chip "Âm nhạc" trong feedFilterChipBarRenderer của trang chủ (hỗ trợ nhiều ngôn ngữ)
    let musicChipToken = null;
    const musicLabels = [
      'Âm nhạc', 'Music', 'Musique', 'Música', 'Musik', 'Musica', 
      '音楽', '음악', '音乐', '音樂', 'Музыка', 'Muzyka', 'Müzik'
    ];
    const chipResults = findKeysRecursive(homeData, ['chipCloudChipRenderer']);
    for (const item of chipResults) {
      const chip = item.value;
      const label = chip?.text?.runs?.[0]?.text || chip?.text?.simpleText || '';
      const isMusicLabel = musicLabels.some(l => label.toLowerCase().trim() === l.toLowerCase());
      if (isMusicLabel) {
        musicChipToken =
          chip?.navigationEndpoint?.continuationCommand?.token ||
          chip?.onSelectCommand?.continuationCommand?.token ||
          null;
        break;
      }
    }

    const keys = ['videoRenderer', 'gridVideoRenderer', 'compactVideoRenderer', 'lockupViewModel', 'continuationItemRenderer'];
    const videos = [];
    const seenIds = new Set();
    let continuationToken = null;

    const collectVideos = (results) => {
      for (const item of results) {
        if (item.key === 'continuationItemRenderer') {
          continuationToken = continuationToken || item.value?.continuationEndpoint?.continuationCommand?.token;
        } else if (item.key === 'lockupViewModel') {
          const v = extractVideoFromLockup(item.value);
          if (v && !seenIds.has(v.videoId)) { seenIds.add(v.videoId); videos.push(v); }
        } else {
          const v = extractVideoData(item.value);
          if (v && !seenIds.has(v.videoId)) { seenIds.add(v.videoId); videos.push(v); }
        }
      }
    };

    if (musicChipToken) {
      // Bước 2: POST với token chip Âm nhạc → feed trang chủ đã lọc theo Âm nhạc, cá nhân hóa
      try {
        const chipJson = await innertubePost({ ...innertubeCxt, continuation: musicChipToken });
        collectVideos(findKeysRecursive(chipJson, keys));
      } catch (e) {
        console.error("Lỗi khi fetch chip âm nhạc:", e);
      }
    }

    // Fallback: dùng ytInitialData trang chủ nếu chip không có kết quả
    if (videos.length === 0) {
      collectVideos(findKeysRecursive(homeData, keys));
    }

    // Lấy thêm trang tiếp theo nếu cần
    if (continuationToken && videos.length < 36) {
      try {
        const contJson = await innertubePost({ ...innertubeCxt, continuation: continuationToken });
        collectVideos(findKeysRecursive(contJson, keys));
      } catch (contErr) {
        console.error("Lỗi khi tải thêm gợi ý âm nhạc từ YouTube:", contErr);
      }
    }

    return { success: true, videos: videos.slice(0, 60) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});




ipcMain.handle('get-app-version', () => app.getVersion());

// Cấu hình cập nhật tự động từ GitHub Release
const GITHUB_REPO = 'lupclky/dua-corner-player';

function isNewerVersion(latest, current) {
  const parse = v => v.replace(/^v/, '').split('.').map(Number);
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

ipcMain.handle('check-for-updates', async () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'Electron-Update-Checker'
      }
    };

    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        resolve({ hasUpdate: false, error: `GitHub API returned status ${res.statusCode}` });
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = release.tag_name;
          const currentVersion = app.getVersion();

          if (isNewerVersion(latestVersion, currentVersion)) {
            const exeAsset = release.assets.find(asset => asset.name.toLowerCase().endsWith('.exe'));
            if (exeAsset) {
              resolve({
                hasUpdate: true,
                latestVersion: latestVersion,
                downloadUrl: exeAsset.browser_download_url,
                releaseNotes: release.body
              });
              return;
            }
          }
          resolve({ hasUpdate: false });
        } catch (e) {
          resolve({ hasUpdate: false, error: e.message });
        }
      });
    }).on('error', (err) => {
      resolve({ hasUpdate: false, error: err.message });
    });
  });
});

ipcMain.on('start-update', (event, downloadUrl) => {
  const tempPath = app.getPath('temp');
  const destPath = path.join(tempPath, 'IntrovertPlayer_Setup.exe');

  downloadFileWithProgress(downloadUrl, destPath, 
    (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-progress', percent);
      }
    },
    () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded');
      }
      
      // Khởi chạy trình cài đặt và tự động thoát app
      setTimeout(() => {
        try {
          const child = spawn(destPath, [], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          app.isQuitting = true;
          app.quit();
        } catch (e) {
          if (mainWindow) {
            mainWindow.webContents.send('update-error', `Không thể khởi chạy trình cài đặt: ${e.message}`);
          }
        }
      }, 1000);
    },
    (err) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-error', err.message);
      }
    }
  );
});

function downloadFileWithProgress(url, destPath, onProgress, onSuccess, onError) {
  const options = {
    headers: {
      'User-Agent': 'Electron-Update-Checker'
    }
  };

  https.get(url, options, (res) => {
    // Xử lý chuyển hướng (301, 302, 307, 308)
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      downloadFileWithProgress(res.headers.location, destPath, onProgress, onSuccess, onError);
      return;
    }

    if (res.statusCode !== 200) {
      onError(new Error(`Tải xuống thất bại: HTTP ${res.statusCode}`));
      return;
    }

    const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
    let downloadedBytes = 0;
    const fileStream = fs.createWriteStream(destPath);

    res.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      fileStream.write(chunk);
      if (totalBytes > 0) {
        const percent = Math.round((downloadedBytes / totalBytes) * 100);
        onProgress(percent);
      }
    });

    res.on('end', () => {
      fileStream.end();
      onSuccess();
    });

    res.on('error', (err) => {
      fileStream.close();
      fs.unlink(destPath, () => {});
      onError(err);
    });

    fileStream.on('error', (err) => {
      fileStream.close();
      fs.unlink(destPath, () => {});
      onError(err);
    });
  }).on('error', (err) => {
    onError(err);
  });
}

// ==========================================
// ĐIỀU KHIỂN & LƯU TRỮ NHẬT KÝ HOẠT ĐỘNG
// ==========================================

ipcMain.on('save-log-entry', (event, text) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'activity_logs.txt');
    const timestamp = new Date().toLocaleString('vi-VN');
    const logLine = `[${timestamp}] ${text}\n`;
    fs.appendFileSync(logPath, logLine, 'utf8');

    // Giới hạn kích thước file log dưới 2MB
    try {
      const stats = fs.statSync(logPath);
      if (stats.size > 2 * 1024 * 1024) {
        const data = fs.readFileSync(logPath, 'utf8');
        const lines = data.split('\n');
        if (lines.length > 1000) {
          const truncated = lines.slice(-1000).join('\n');
          fs.writeFileSync(logPath, truncated, 'utf8');
        }
      }
    } catch (e) {
      // Bỏ qua lỗi khi kiểm tra kích thước file
    }
  } catch (err) {
    console.error('Failed to save log entry:', err);
  }
});

ipcMain.handle('open-log-file', async () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'activity_logs.txt');
    if (!fs.existsSync(logPath)) {
      const timestamp = new Date().toLocaleString('vi-VN');
      fs.writeFileSync(logPath, `[${timestamp}] [System] Khởi tạo file log hoạt động thành công.\n`, 'utf8');
    }
    await shell.openPath(logPath);
    return { success: true };
  } catch (err) {
    console.error('Failed to open log file:', err);
    return { success: false, error: err.message };
  }
});


