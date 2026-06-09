const { app, BrowserWindow, Menu, Tray, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

let mainWindow = null;
let server = null;
let serverPort = 3000;
let tray = null;
app.isQuitting = false;

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
        req.on('data', chunk => {
          body += chunk.toString();
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

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${startPort} is in use, trying next port...`);
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

// Trả về phiên bản ứng dụng động cho Renderer Process
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('search-youtube', async (event, query) => {
  return new Promise((resolve) => {
    const https = require('https');
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const regex = /ytInitialData\s*=\s*({.+?});/;
          const match = data.match(regex);
          if (!match) {
            return resolve({ error: "Could not find ytInitialData in response" });
          }
          
          const jsonObj = JSON.parse(match[1]);
          const contents = jsonObj.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
          if (!contents) {
            return resolve({ error: "Unexpected JSON structure" });
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
          
          resolve({ success: true, videos: videos.slice(0, 15) });
        } catch (e) {
          resolve({ error: e.message });
        }
      });
    }).on('error', (e) => {
      resolve({ error: e.message });
    });
  });
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

