const { app, BrowserWindow, Menu, Tray, ipcMain, session, shell, clipboard } = require('electron');
app.disableHardwareAcceleration();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const sqlite = require('node:sqlite');

let db = null;
function initDatabase() {
  try {
    const dbPath = path.join(app.getPath('userData'), 'donations.db');
    console.log('Initializing SQLite database at:', dbPath);
    db = new sqlite.DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS donations (
        id TEXT PRIMARY KEY,
        name TEXT,
        amount REAL,
        message TEXT,
        timestamp INTEGER,
        isNew INTEGER,
        songLink TEXT,
        isMusicOrder INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_donations_timestamp ON donations(timestamp DESC);
    `);
    console.log('SQLite database initialized successfully.');
  } catch (e) {
    console.error('Failed to initialize SQLite database:', e);
  }
}

let mainWindow = null;
let server = null;
let serverPort = 3000;
let tray = null;
app.isQuitting = false;
let wss = null;
const activeWsClients = new Set();

// Tắt sandbox để tránh crash khi chạy từ thư mục AppData (giữ GPU bật để tránh bug input focus)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
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

  // Hàm bổ trợ kiểm tra Origin tin cậy (localhost, 127.0.0.1, file:// và null của OBS local file, vercel.app)
  function isOriginAllowed(origin) {
    if (!origin || origin === 'null') return true;
    return /^http:\/\/localhost(:\d+)?$/.test(origin) || 
           /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) || 
           /^chrome-extension:\/\//.test(origin) ||
           /^file:\/\//.test(origin) ||
           /\.vercel\.app$/.test(origin);
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

      // Xử lý API ghi log debug từ overlay (POST /api/debug-log)
      if (req.url === '/api/debug-log' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            console.log(data.message);
          } catch(e) {
            console.log(body);
          }
          res.writeHead(200, getCorsHeaders({
            'Content-Type': 'application/json'
          }));
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      // Xử lý API lưu walkthrough và đẩy lên Vercel (POST /api/save-walkthrough)
      if (req.url === '/api/save-walkthrough' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const htmlContent = data.html;
            
            // Ghi đè tệp tin walkthrough.html trong thư mục landing
            const filePath = path.join(__dirname, 'landing', 'walkthrough.html');
            fs.writeFileSync(filePath, htmlContent, 'utf8');
            console.log('[API] Đã lưu thành công nội dung walkthrough.html vào đĩa cứng.');
            
            // Nếu cờ deploy bằng true, chạy lệnh vercel --prod
            if (data.deploy) {
              const { exec } = require('child_process');
              const landingDir = path.join(__dirname, 'landing');
              
              console.log('[API] Bắt đầu đẩy lên Vercel...');
              exec('npx vercel --prod --yes', { cwd: landingDir }, (error, stdout, stderr) => {
                if (error) {
                  console.error('[API] Lỗi khi chạy lệnh deploy Vercel:', error);
                } else {
                  console.log('[API] Deploy Vercel thành công:\n', stdout);
                }
              });
            }

            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({ success: true, message: 'Đã lưu và triển khai thành công!' }));
          } catch (err) {
            console.error('[API] Lỗi API save-walkthrough:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xử lý API test donate (POST /api/test-donate)
      if (req.url === '/api/test-donate' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (mainWindow) {
              mainWindow.webContents.send('test-donate', data);
            }
            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error('Lỗi API test-donate:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xử lý API Ping (GET /api/ping)
      if (req.url === '/api/ping' && req.method === 'GET') {
        res.writeHead(200, getCorsHeaders({
          'Content-Type': 'application/json'
        }));
        res.end(JSON.stringify({ success: true, app: "pineapple-studio", version: "26.8.0" }));
        return;
      }

      // Xử lý API Thêm nhạc từ Extension (POST /api/add-song)
      if (req.url === '/api/add-song' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (mainWindow && data.url) {
              mainWindow.webContents.send('add-song-external', data);
            }
            
            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error('Lỗi API add-song:', err);
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

      // Xử lý API lấy loudnessDb từ YouTube (GET /api/yt-loudness?videoId=...)
      if (req.url.startsWith('/api/yt-loudness') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const videoId = parsedUrl.searchParams.get('videoId');
        console.log(`[API yt-loudness] Nhận request lấy loudness cho videoId: ${videoId}`);
        if (!videoId) {
          res.writeHead(400, getCorsHeaders({ 'Content-Type': 'application/json' }));
          res.end(JSON.stringify({ error: 'Missing videoId' }));
          return;
        }

        const https = require('https');
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        https.get(watchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        }, (ytRes) => {
          let html = '';
          ytRes.setEncoding('utf8');
          ytRes.on('data', chunk => { html += chunk; });
          ytRes.on('end', () => {
            try {
              // Tìm ytInitialPlayerResponse trong HTML và trích xuất JSON bằng đếm ngoặc nhọn
              const marker = 'ytInitialPlayerResponse';
              const idx = html.indexOf(marker);
              if (idx !== -1) {
                const startBrace = html.indexOf('{', idx);
                if (startBrace !== -1) {
                  let depth = 0;
                  let endBrace = -1;
                  for (let i = startBrace; i < html.length; i++) {
                    if (html[i] === '{') depth++;
                    else if (html[i] === '}') { depth--; if (depth === 0) { endBrace = i; break; } }
                  }
                  if (endBrace !== -1) {
                    const jsonStr = html.substring(startBrace, endBrace + 1);
                    const playerResponse = JSON.parse(jsonStr);
                    const loudnessDb = playerResponse?.playerConfig?.audioConfig?.loudnessDb;
                    const perceptualLoudnessDb = playerResponse?.playerConfig?.audioConfig?.perceptualLoudnessDb;
                    console.log(`[API yt-loudness] Thành công trích xuất cho ${videoId} -> loudnessDb: ${loudnessDb}, perceptual: ${perceptualLoudnessDb}`);
                    res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
                    res.end(JSON.stringify({ videoId, loudnessDb: loudnessDb ?? null, perceptualLoudnessDb: perceptualLoudnessDb ?? null }));
                    return;
                  }
                }
              }
            } catch (e) {
              console.error(`[yt-loudness] Lỗi phân tích playerResponse cho ${videoId}:`, e.message);
            }
            console.log(`[API yt-loudness] Trả về loudnessDb mặc định: null cho ${videoId}`);
            res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ videoId, loudnessDb: null, perceptualLoudnessDb: null }));
          });
        }).on('error', (err) => {
          console.error(`[yt-loudness] Lỗi kết nối cho ${videoId}:`, err.message);
          res.writeHead(500, getCorsHeaders({ 'Content-Type': 'application/json' }));
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Xử lý API lấy URL stream trực tiếp từ YouTube (GET /api/yt-stream?videoId=...)
      if (req.url.startsWith('/api/yt-stream') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const videoId = parsedUrl.searchParams.get('videoId');
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing videoId parameter' }));
          return;
        }

        const ytDlpPath = path.join(app.getPath('userData'), 'yt-dlp.exe');
        if (!fs.existsSync(ytDlpPath)) {
          res.writeHead(503, getCorsHeaders({ 'Content-Type': 'application/json' }));
          res.end(JSON.stringify({ error: 'yt-dlp.exe is not ready' }));
          return;
        }

        const { spawn } = require('child_process');
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Chạy yt-dlp.exe -g -f ba [url]
        const proc = spawn(ytDlpPath, ['-g', '-f', 'ba', videoUrl]);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', data => stdout += data.toString());
        proc.stderr.on('data', data => stderr += data.toString());

        proc.on('close', code => {
          if (code === 0) {
            res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ success: true, url: stdout.trim() }));
          } else {
            console.error(`yt-dlp stream resolution failed for ${videoId}:`, stderr);
            res.writeHead(500, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ error: `yt-dlp failed: ${stderr.trim()}` }));
          }
        });
        
        req.on('close', () => {
          try { proc.kill(); } catch (e) {}
        });
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

      // Gửi trạng thái PUBG hiện tại cho client mới kết nối
      try {
        ws.send(JSON.stringify({
          type: 'pubg_state',
          data: { running: isPubgRunning }
        }));
      } catch (e) {
        console.error('[WebSocket] Lỗi gửi trạng thái PUBG ban đầu:', e);
      }

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
    const isWin = process.platform === 'win32';
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 640,
      minHeight: 640,
      title: "Pineapple Studio",
      frame: false,
      titleBarStyle: isWin ? 'hidden' : 'hidden',
      titleBarOverlay: isWin ? {
        color: '#0C0A0F',      // Match dark mode background initially
        symbolColor: '#E2E8F0', // Match dark mode text
        height: 41
      } : false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Mở tất cả liên kết bên ngoài (HTTP/HTTPS) bằng trình duyệt mặc định của hệ thống Windows
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url && /^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // Menu chuột phải native cho Dashboard.
    mainWindow.webContents.on('context-menu', (event, params) => {
      const template = [];
      const editFlags = params.editFlags || {};

      if (params.misspelledWord) {
        (params.dictionarySuggestions || []).slice(0, 5).forEach((suggestion) => {
          template.push({
            label: suggestion,
            click: () => mainWindow.webContents.replaceMisspelling(suggestion)
          });
        });
        if ((params.dictionarySuggestions || []).length > 0) template.push({ type: 'separator' });
        template.push({
          label: 'Thêm vào từ điển',
          click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        });
        template.push({ type: 'separator' });
      }

      if (params.isEditable) {
        template.push(
          { label: 'Hoàn tác', role: 'undo', enabled: Boolean(editFlags.canUndo) },
          { label: 'Làm lại', role: 'redo', enabled: Boolean(editFlags.canRedo) },
          { type: 'separator' },
          { label: 'Cắt', role: 'cut', enabled: Boolean(editFlags.canCut) },
          { label: 'Sao chép', role: 'copy', enabled: Boolean(editFlags.canCopy) },
          { label: 'Dán', role: 'paste', enabled: Boolean(editFlags.canPaste) },
          { label: 'Dán không định dạng', role: 'pasteAndMatchStyle', enabled: Boolean(editFlags.canPaste) },
          { label: 'Xóa', role: 'delete', enabled: Boolean(editFlags.canDelete) },
          { type: 'separator' },
          { label: 'Chọn tất cả', role: 'selectAll', enabled: Boolean(editFlags.canSelectAll) }
        );
      } else {
        if (params.selectionText && params.selectionText.trim()) {
          template.push({ label: 'Sao chép', role: 'copy' });
        }
        template.push({ label: 'Chọn tất cả', role: 'selectAll' });
      }

      if (params.linkURL && /^https?:\/\//i.test(params.linkURL)) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push(
          { label: 'Mở liên kết trong trình duyệt', click: () => shell.openExternal(params.linkURL) },
          { label: 'Sao chép địa chỉ liên kết', click: () => clipboard.writeText(params.linkURL) }
        );
      }

      if (params.mediaType === 'image' && params.srcURL) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push(
          { label: 'Sao chép hình ảnh', click: () => mainWindow.webContents.copyImageAt(params.x, params.y) },
          { label: 'Sao chép địa chỉ hình ảnh', click: () => clipboard.writeText(params.srcURL) }
        );
        if (/^https?:\/\//i.test(params.srcURL)) {
          template.push({ label: 'Mở hình ảnh trong trình duyệt', click: () => shell.openExternal(params.srcURL) });
        }
      }

      if (template.length > 0) template.push({ type: 'separator' });
      template.push(
        { label: 'Tải lại giao diện', role: 'reload' },
        {
          label: 'Thu phóng',
          submenu: [
            { label: 'Phóng to', role: 'zoomIn' },
            { label: 'Thu nhỏ', role: 'zoomOut' },
            { label: 'Đặt lại 100%', role: 'resetZoom' }
          ]
        }
      );

      Menu.buildFromTemplate(template).popup({ window: mainWindow });
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

    tray.setToolTip('Pineapple Studio');

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
    initDatabase();

    // Thiết lập khởi động cùng Windows khi mở app lần đầu
    try {
      const firstRunPath = path.join(app.getPath('userData'), '.first_run');
      if (!fs.existsSync(firstRunPath)) {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: app.getPath('exe')
        });
        fs.writeFileSync(firstRunPath, 'initialized');
        console.log('First run: Enabled Start with Windows (openAtLogin) by default.');
      }
    } catch (e) {
      console.error('Lỗi khi thiết lập khởi động cùng Windows lần đầu:', e);
    }

    // Dọn dẹp các file html tạm của thông báo từ lần chạy trước
    try {
      const userDataDir = app.getPath('userData');
      if (fs.existsSync(userDataDir)) {
        const files = fs.readdirSync(userDataDir);
        files.forEach(file => {
          if (file.startsWith('notif_') && file.endsWith('.html')) {
            try {
              fs.unlinkSync(path.join(userDataDir, file));
            } catch (e) {}
          }
        });
      }
    } catch (e) {
      console.error('Không thể dọn dẹp file thông báo tạm:', e);
    }

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

let lastIsDarkMode = false;

// Lắng nghe yêu cầu mở liên kết bằng trình duyệt mặc định của hệ thống
ipcMain.on('open-external-url', (event, url) => {
  if (url && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on('show-favorite-context-menu', (event, favorite) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow || !favorite || typeof favorite !== 'object') return;

  const key = String(favorite.key || '').slice(0, 512);
  const title = String(favorite.title || 'Bài hát yêu thích').slice(0, 300);
  const displayTitle = title.length > 72 ? `${title.slice(0, 69)}...` : title;
  const url = typeof favorite.url === 'string' && /^https?:\/\//i.test(favorite.url)
    ? favorite.url
    : '';
  if (!key) return;

  const sendAction = (action) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('favorite-context-action', { action, key });
    }
  };

  const template = [
    { label: displayTitle, enabled: false },
    { type: 'separator' },
    { label: 'Thêm vào hàng đợi', click: () => sendAction('queue') }
  ];

  if (url) {
    template.push(
      { label: 'Mở bài hát trong trình duyệt', click: () => shell.openExternal(url) },
      { label: 'Sao chép liên kết', click: () => clipboard.writeText(url) }
    );
  }

  template.push(
    { label: 'Sao chép tên bài hát', click: () => clipboard.writeText(title) },
    { type: 'separator' },
    { label: 'Xóa khỏi yêu thích', click: () => sendAction('delete') }
  );

  Menu.buildFromTemplate(template).popup({ window: ownerWindow });
});

// Lắng nghe yêu cầu hiển thị thông báo taskbar từ Dashboard (Renderer)
ipcMain.on('show-taskbar-notification', (event, data) => {
  if (data && data.title) {
    if (data.isDarkMode !== undefined) {
      lastIsDarkMode = data.isDarkMode;
    }
    showTaskbarNotification(data.title, data.message || '', lastIsDarkMode, data.duration);
  }
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
  } else if (action === 'focus') {
    mainWindow.focus();
  } else if (action === 'system-menu') {
    const { Menu } = require('electron');
    const menu = Menu.buildFromTemplate([
      {
        label: 'Khôi phục',
        enabled: mainWindow.isMaximized() || mainWindow.isMinimized(),
        click: () => {
          if (mainWindow.isMinimized()) mainWindow.restore();
          else if (mainWindow.isMaximized()) mainWindow.unmaximize();
        }
      },
      {
        label: 'Di chuyển',
        enabled: !mainWindow.isMaximized(),
        click: () => {}
      },
      {
        label: 'Kích cỡ',
        enabled: !mainWindow.isMaximized(),
        click: () => {}
      },
      {
        label: 'Thu nhỏ',
        enabled: mainWindow.isMinimizable(),
        click: () => {
          mainWindow.minimize();
        }
      },
      {
        label: 'Phóng to',
        enabled: mainWindow.isMaximizable() && !mainWindow.isMaximized(),
        click: () => {
          mainWindow.maximize();
        }
      },
      { type: 'separator' },
      {
        label: 'Đóng',
        accelerator: 'Alt+F4',
        click: () => {
          mainWindow.close();
        }
      }
    ]);
    menu.popup({ window: mainWindow });
  }
});

// Lắng nghe sự kiện chuyển đổi theme để cập nhật Titlebar Overlay tương ứng
ipcMain.on('theme-change', (event, theme) => {
  if (!mainWindow) return;
  if (process.platform === 'win32') {
    if (theme === 'dark') {
      mainWindow.setTitleBarOverlay({
        color: '#0C0A0F',
        symbolColor: '#E2E8F0',
        height: 41
      });
    } else {
      mainWindow.setTitleBarOverlay({
        color: '#F5F2EB',
        symbolColor: '#2D2727',
        height: 41
      });
    }
  }
});

let currentSearchReq = null;
const youtubeSearchCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL
const MAX_CACHE_SIZE = 150;

ipcMain.handle('search-youtube', async (event, query) => {
  const cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery) {
    return { success: true, videos: [] };
  }

  // Check cache first
  if (youtubeSearchCache.has(cleanQuery)) {
    const cached = youtubeSearchCache.get(cleanQuery);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    } else {
      youtubeSearchCache.delete(cleanQuery);
    }
  }

  if (currentSearchReq) {
    try {
      currentSearchReq.destroy();
    } catch (e) {}
    currentSearchReq = null;
  }

  // 1. Try InnerTube search API first (blazing fast, ~200-400ms & highly stable)
  try {
    const data = await new Promise((resolve, reject) => {
      const https = require('https');
      const postData = JSON.stringify({
        query: query,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20210621.02.00'
          }
        }
      });

      const reqOpts = {
        hostname: 'www.youtube.com',
        port: 443,
        path: '/youtubei/v1/search',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      const ytReq = https.request(reqOpts, (ytRes) => {
        let body = '';
        ytRes.setEncoding('utf8');
        ytRes.on('data', chunk => body += chunk);
        ytRes.on('end', () => resolve(body));
      });

      currentSearchReq = ytReq;

      ytReq.on('error', (err) => {
        if (ytReq.destroyed) {
          reject(new Error("SEARCH_ABORTED"));
        } else {
          reject(err);
        }
      });

      ytReq.write(postData);
      ytReq.end();
    });

    const jsonObj = JSON.parse(data);
    const contents = jsonObj.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) {
      throw new Error("Unexpected JSON structure in InnerTube response");
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

    const result = { success: true, videos: videos.slice(0, 15) };
    
    // Store in cache
    if (youtubeSearchCache.size >= MAX_CACHE_SIZE) {
      const firstKey = youtubeSearchCache.keys().next().value;
      if (firstKey) youtubeSearchCache.delete(firstKey);
    }
    youtubeSearchCache.set(cleanQuery, {
      timestamp: Date.now(),
      data: result
    });
    
    return result;

  } catch (innerTubeError) {
    if (innerTubeError.message === 'SEARCH_ABORTED') {
      return { success: false, aborted: true };
    }
    console.warn("[InnerTube Search failed, falling back to HTML Scrape]:", innerTubeError.message);

    // 2. Try HTML Scrape fallback
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
        throw new Error("Could not find or parse ytInitialData in response");
      }
      
      const contents = jsonObj.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
      if (!contents) {
        throw new Error("Unexpected JSON structure in scraped HTML");
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
      
      const result = { success: true, videos: videos.slice(0, 15) };
      
      if (youtubeSearchCache.size >= MAX_CACHE_SIZE) {
        const firstKey = youtubeSearchCache.keys().next().value;
        if (firstKey) youtubeSearchCache.delete(firstKey);
      }
      youtubeSearchCache.set(cleanQuery, {
        timestamp: Date.now(),
        data: result
      });
      
      return result;

    } catch (scrapeError) {
      if (scrapeError.message === 'SEARCH_ABORTED') {
        return { success: false, aborted: true };
      }
      console.warn("[HTML Scrape failed, falling back to play-dl search]:", scrapeError.message);

      // 3. Last resort fallback: play-dl search
      try {
        const play = require('play-dl');
        const searchResults = await play.search(query, { limit: 15 });
        const videos = [];
        for (const v of searchResults) {
          const videoId = v.id;
          const title = v.title || '';
          const thumbnail = v.thumbnails?.[0]?.url || '';
          const duration = v.durationRaw || '0:00';
          const author = v.channel?.name || '';
          const views = v.views ? v.views.toLocaleString('vi-VN') + ' lượt xem' : '';
          
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
        
        const result = { success: true, videos };
        
        // Store in cache
        if (youtubeSearchCache.size >= MAX_CACHE_SIZE) {
          const firstKey = youtubeSearchCache.keys().next().value;
          if (firstKey) youtubeSearchCache.delete(firstKey);
        }
        youtubeSearchCache.set(cleanQuery, {
          timestamp: Date.now(),
          data: result
        });
        
        return result;
      } catch (playDlError) {
        console.error("[All search methods failed]:", playDlError.message);
        return { error: playDlError.message };
      }
    }
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

let ytDlpDownloadProgress = null; // null: idle, 'downloading', or number (0-100), or 'success', or 'error'
let ytDlpDownloadError = null;

function downloadYtDlpBinary(force = false) {
  const ytDlpPath = path.join(app.getPath('userData'), 'yt-dlp.exe');
  if (fs.existsSync(ytDlpPath) && !force) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    ytDlpDownloadProgress = 0;
    ytDlpDownloadError = null;
    
    // Broadcast progress
    function broadcastProgress(progress) {
      ytDlpDownloadProgress = progress;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ytdlp-download-progress', { progress });
      }
    }

    broadcastProgress(0);

    const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    
    function startDownload(url) {
      const https = require('https');
      const request = https.get(url, (response) => {
        // Handle redirect
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return startDownload(response.headers.location);
        }

        if (response.statusCode !== 200) {
          const errMsg = `Failed to download: Status Code ${response.statusCode}`;
          ytDlpDownloadError = errMsg;
          broadcastProgress(-1);
          return reject(new Error(errMsg));
        }

        const totalBytes = parseInt(response.headers['content-length'] || 0, 10);
        let receivedBytes = 0;

        const file = fs.createWriteStream(ytDlpPath);
        response.pipe(file);

        response.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.round((receivedBytes / totalBytes) * 100);
            broadcastProgress(pct);
          }
        });

        file.on('finish', () => {
          file.close();
          broadcastProgress(100);
          resolve();
        });

        file.on('error', (err) => {
          file.close();
          fs.unlink(ytDlpPath, () => {});
          ytDlpDownloadError = err.message;
          broadcastProgress(-1);
          reject(err);
        });
      });

      request.on('error', (err) => {
        ytDlpDownloadError = err.message;
        broadcastProgress(-1);
        reject(err);
      });
    }

    startDownload(downloadUrl);
  });
}

ipcMain.handle('check-ytdlp-status', async () => {
  const ytDlpPath = path.join(app.getPath('userData'), 'yt-dlp.exe');
  let exists = fs.existsSync(ytDlpPath);
  if (!exists) {
    const localScratchPath = path.join(__dirname, 'scratch', 'yt-dlp.exe');
    if (fs.existsSync(localScratchPath)) {
      try {
        fs.copyFileSync(localScratchPath, ytDlpPath);
        exists = true;
        console.log("Successfully copied yt-dlp.exe from scratch folder to AppData.");
      } catch (err) {
        console.error("Failed to copy yt-dlp.exe from scratch folder:", err);
      }
    }
  }
  return {
    exists,
    progress: ytDlpDownloadProgress,
    error: ytDlpDownloadError
  };
});

ipcMain.handle('download-ytdlp', async () => {
  try {
    await downloadYtDlpBinary(true);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

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

// SQLite operations
ipcMain.handle('db-get-donations', () => {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM donations ORDER BY timestamp DESC');
    const rows = stmt.all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      message: row.message || '',
      timestamp: Number(row.timestamp),
      isNew: row.isNew === 1,
      songLink: row.songLink || '',
      isMusicOrder: row.isMusicOrder === 1
    }));
  } catch (err) {
    console.error('db-get-donations error:', err);
    return [];
  }
});

ipcMain.handle('db-add-donation', (event, donation) => {
  if (!db) return { success: false };
  try {
    const id = donation.id || `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const name = donation.name || '';
    const amount = Number(donation.amount) || 0;
    const message = donation.message || '';
    const timestamp = Number(donation.timestamp) || Date.now();
    const isNew = donation.isNew !== undefined ? donation.isNew : true;
    const songLink = donation.songLink || '';
    const isMusicOrder = donation.isMusicOrder ? 1 : 0;

    // Check if donation already exists
    let existing = null;
    if (donation.id) {
      const stmt = db.prepare('SELECT * FROM donations WHERE id = ?');
      existing = stmt.get(donation.id);
    }
    if (!existing) {
      const stmt = db.prepare('SELECT * FROM donations WHERE name = ? AND amount = ? AND abs(timestamp - ?) < 5000 LIMIT 1');
      existing = stmt.get(name, amount, timestamp);
    }

    if (existing) {
      if (songLink && !existing.songLink) {
        const stmt = db.prepare('UPDATE donations SET songLink = ?, isMusicOrder = 1 WHERE id = ?');
        stmt.run(songLink, existing.id);
        return { success: true, updated: true, id: existing.id };
      }
      return { success: true, updated: false, id: existing.id };
    }

    const stmt = db.prepare(`
      INSERT INTO donations (id, name, amount, message, timestamp, isNew, songLink, isMusicOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, amount, message, timestamp, isNew ? 1 : 0, songLink, isMusicOrder);
    return { success: true, inserted: true, id };
  } catch (err) {
    console.error('db-add-donation error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-mark-read', (event, id) => {
  if (!db) return false;
  try {
    const stmt = db.prepare('UPDATE donations SET isNew = 0 WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  } catch (err) {
    console.error('db-mark-read error:', err);
    return false;
  }
});

ipcMain.handle('db-mark-all-read', () => {
  if (!db) return false;
  try {
    const stmt = db.prepare('UPDATE donations SET isNew = 0 WHERE isNew = 1');
    const res = stmt.run();
    return res.changes > 0;
  } catch (err) {
    console.error('db-mark-all-read error:', err);
    return false;
  }
});

ipcMain.handle('db-clear-history', () => {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM donations');
    const res = stmt.run();
    return true;
  } catch (err) {
    console.error('db-clear-history error:', err);
    return false;
  }
});

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

const activeNotifications = [];

function repositionNotifications() {
  const { screen } = require('electron');
  try {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const externalDisplay = displays.find(d => d.id !== primaryDisplay.id);
    const targetDisplay = externalDisplay || primaryDisplay;
    const { x, y, width, height } = targetDisplay.workArea;
    
    const notifWidth = 360;
    
    let currentOffset = 0;
    activeNotifications.forEach((notif) => {
      const h = notif.height || 110;
      const posX = x + width - notifWidth - 20;
      const posY = y + height - h - 20 - currentOffset;
      
      if (notif.window && !notif.window.isDestroyed()) {
        notif.window.setBounds({ x: posX, y: posY, width: notifWidth, height: h });
      }
      currentOffset += h + 10;
    });
  } catch (e) {
    console.error('Lỗi khi reposition notifications:', e);
  }
}

function closeNotificationById(id) {
  const index = activeNotifications.findIndex(n => n.id === id);
  if (index !== -1) {
    const notif = activeNotifications[index];
    if (notif.timeout) clearTimeout(notif.timeout);
    activeNotifications.splice(index, 1);
    if (notif.window && !notif.window.isDestroyed()) {
      try {
        notif.window.destroy();
      } catch (e) {}
    }
    repositionNotifications();
  }
}

ipcMain.on('close-notification-window', (event, id) => {
  closeNotificationById(id);
});

ipcMain.on('set-ignore-mouse-events', (event, id, ignore, options) => {
  const notif = activeNotifications.find(n => n.id === id);
  if (notif && notif.window && !notif.window.isDestroyed()) {
    if (ignore) {
      notif.window.setIgnoreMouseEvents(true, { forward: true });
    } else {
      notif.window.setIgnoreMouseEvents(false);
    }
  }
});

function showTaskbarNotification(title, message, isDarkMode = false, duration) {
  const { screen, BrowserWindow } = require('electron');
  
  try {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const externalDisplay = displays.find(d => d.id !== primaryDisplay.id);
    const targetDisplay = externalDisplay || primaryDisplay;
    
    const { x, y, width, height } = targetDisplay.workArea;
    
    // Tách tiêu đề nhạc và tin nhắn từ message (phân cách bằng \n)
    const rawMsgStr = (message || '').trim();
    const lines = rawMsgStr.split('\n');
    let songTitle = '';
    let cleanMsg = '';
    
    if (lines.length > 1) {
        songTitle = (lines[0] || '').replace(/^(\[MUSIC\]|🎵|▶)\s*/u, '').replace(/[\uD800-\uDFFF]/g, '').trim();
        cleanMsg = lines.slice(1).join('\n').trim();
    } else if (lines.length === 1 && rawMsgStr) {
        const singleLine = lines[0].trim();
        if (singleLine.startsWith('[MUSIC]') || singleLine.startsWith('🎵') || singleLine.startsWith('▶') || singleLine.toLowerCase().includes('youtube') || singleLine.toLowerCase().includes('http://') || singleLine.toLowerCase().includes('https://')) {
            songTitle = singleLine.replace(/^(\[MUSIC\]|🎵|▶)\s*/u, '').replace(/[\uD800-\uDFFF]/g, '').trim();
            cleanMsg = '';
        } else {
            songTitle = '';
            cleanMsg = singleLine;
        }
    }
    const cleanMsgLines = cleanMsg ? cleanMsg.split('\n') : [];

    const notifWidth = 480;
    
    // Tính toán độ cao linh hoạt 100% theo nội dung thực tế (không dùng ellipsis ...)
    const titleLines = Math.max(1, Math.ceil((title || '').length / 36));
    let calculatedHeight = 55 + (titleLines * 24);

    if (songTitle) {
        const songLines = Math.max(1, Math.ceil((songTitle || '').length / 36));
        calculatedHeight += (songLines * 22) + 12;
    }

    if (cleanMsg) {
        let msgLinesCount = 0;
        cleanMsgLines.forEach(line => {
            msgLinesCount += Math.max(1, Math.ceil((line || '').length / 40));
        });
        calculatedHeight += (msgLinesCount * 24) + 14;
    }

    const notifHeight = Math.max(120, Math.min(650, calculatedHeight));
    
    // Tính toán vị trí Y dựa trên số lượng thông báo hiện có
    let offset = 0;
    activeNotifications.forEach(notif => {
      offset += (notif.height || 110) + 10;
    });
    const posX = x + width - notifWidth - 20;
    const posY = y + height - notifHeight - 20 - offset;
    
    const win = new BrowserWindow({
      width: notifWidth,
      height: notifHeight,
      x: posX,
      y: posY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true, // Cho phép focus để click dấu x
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // Cho phép click xuyên qua phần trong suốt và tương tác phần đặc
    win.setIgnoreMouseEvents(true, { forward: true });

    const escapeHtml = (text) => {
      return (text || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Lấy thông tin màu sắc theo theme của Dashboard
    const bgGradient = isDarkMode 
      ? 'linear-gradient(135deg, #1D1A22 0%, #121016 100%)' 
      : 'linear-gradient(135deg, #FAF6EE 0%, #F5F0E4 100%)';
    const borderColor = isDarkMode ? 'rgba(226, 232, 240, 0.08)' : 'rgba(45, 39, 39, 0.15)';
    const titleColor = isDarkMode ? '#FB923C' : '#EA580C';
    const textSongColor = isDarkMode ? '#E2E8F0' : '#2D2727';
    const textMsgColor = isDarkMode ? '#D1D5DB' : '#4B5563';
    const msgBg = isDarkMode ? '#17151E' : '#FAF6EE';
    const msgBorder = isDarkMode ? 'rgba(226, 232, 240, 0.06)' : 'rgba(45, 39, 39, 0.12)';

    const notifId = 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Quicksand:wght@700;800&display=swap');
          html, body {
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
            background: transparent;
            font-family: 'Nunito', sans-serif;
          }
          .container {
            display: flex;
            align-items: center;
            gap: 14px;
            background: ${isDarkMode ? 'rgba(18, 16, 22, 0.92)' : 'rgba(250, 246, 238, 0.95)'};
            background-image: ${bgGradient};
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 2px solid ${borderColor};
            border-radius: 16px;
            padding: 12px 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, ${isDarkMode ? '0.5' : '0.15'});
            color: ${textSongColor};
            height: 100%;
            box-sizing: border-box;
            position: relative;
            animation: slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          @keyframes slide-in {
            from {
              transform: translateY(30px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          .content {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .title {
            font-family: 'Quicksand', sans-serif;
            font-size: 1.15rem;
            font-weight: 800;
            color: ${titleColor};
            margin-bottom: 4px;
            padding-right: 20px;
            word-break: break-word;
          }
          .close-btn {
            position: absolute;
            top: 8px;
            right: 12px;
            font-size: 1.25rem;
            font-weight: 800;
            cursor: pointer;
            color: ${isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'};
            transition: color 0.15s ease;
            line-height: 1;
            z-index: 10;
            -webkit-app-region: no-drag;
          }
          .close-btn:hover {
            color: ${isDarkMode ? '#FB923C' : '#EA580C'};
          }
          .song-title {
            font-family: 'Quicksand', sans-serif;
            font-size: 1.0rem;
            font-weight: 700;
            color: ${textSongColor};
            line-height: 1.35;
            word-break: break-word;
            white-space: normal;
          }
          .message {
            font-size: 1.08rem;
            font-weight: 600;
            color: ${textMsgColor};
            background: transparent;
            border: none;
            padding: 4px 0;
            margin-top: 8px;
            display: block;
            word-break: break-word;
            white-space: pre-wrap;
            overflow: visible;
          }
          .message::-webkit-scrollbar {
            width: 4px;
          }
          .message::-webkit-scrollbar-track {
            background: transparent;
          }
          .message::-webkit-scrollbar-thumb {
            background: ${isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'};
            border-radius: 4px;
          }
          .message::-webkit-scrollbar-thumb:hover {
            background: ${isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="close-btn" onclick="closeNotification()">&times;</div>
          <div class="content">
            <div class="title">${escapeHtml(title)}</div>
            ${songTitle ? `<div class="song-title"><svg style="width: 16px; height: 16px; fill: #FF0000; vertical-align: -3px; margin-right: 5px; flex-shrink: 0; display: inline-block;" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>${escapeHtml(songTitle)}</div>` : ''}
            ${cleanMsg ? `<div class="message">${escapeHtml(cleanMsg)}</div>` : ''}
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          function closeNotification() {
            ipcRenderer.send('close-notification-window', '${notifId}');
          }
          
          const container = document.querySelector('.container');
          container.addEventListener('mouseenter', () => {
            ipcRenderer.send('set-ignore-mouse-events', '${notifId}', false);
          });
          container.addEventListener('mouseleave', () => {
            ipcRenderer.send('set-ignore-mouse-events', '${notifId}', true, { forward: true });
          });
        </script>
      </body>
      </html>
    `;

    const tempHtmlPath = path.join(app.getPath('userData'), `${notifId}.html`);
    fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

    win.loadFile(tempHtmlPath);

    let timeout = null;
    const isHang = (duration === -1 || duration === 0);
    if (!isHang) {
      let timeoutVal = 10000;
      if (duration !== undefined && duration !== null && duration > 0) {
        timeoutVal = duration;
      } else {
        const contentText = (title || '') + ' ' + (message || '');
        const charCount = contentText.length;
        timeoutVal = Math.min(20000, Math.max(5000, 5000 + (charCount / 15) * 1000));
      }
      timeout = setTimeout(() => {
        closeNotificationById(notifId);
      }, timeoutVal);
    }

    activeNotifications.push({
      id: notifId,
      window: win,
      timeout: timeout,
      height: notifHeight
    });

    win.once('ready-to-show', () => {
      if (win && !win.isDestroyed()) {
        win.showInactive();
      }
    });

    win.on('closed', () => {
      try {
        if (fs.existsSync(tempHtmlPath)) {
          fs.unlinkSync(tempHtmlPath);
        }
      } catch (e) {
        console.error('Lỗi khi xóa file tạm notification:', e);
      }

      const idx = activeNotifications.findIndex(n => n.id === notifId);
      if (idx !== -1) {
        const notif = activeNotifications[idx];
        if (notif.timeout) clearTimeout(notif.timeout);
        activeNotifications.splice(idx, 1);
        repositionNotifications();
      }
    });

  } catch (err) {
    console.error('Lỗi khi tạo thông báo Taskbar:', err);
  }
}

// --- THEO DÕI TIẾN TRÌNH PUBG ĐỂ TỰ ĐỘNG ẨN OVERLAY ---
const { exec } = require('child_process');
let isPubgRunning = false;

function checkPubgProcess() {
  if (process.platform !== 'win32') return;

  exec('tasklist /FI "IMAGENAME eq TslGame.exe" /NH', (err, stdout, stderr) => {
    if (err) return;
    
    // Kiểm tra xem PUBG (TslGame.exe) có đang chạy không
    const running = stdout.toLowerCase().includes('tslgame.exe');
    
    if (running !== isPubgRunning) {
      isPubgRunning = running;
      console.log(`[PUBG Detector] Trạng thái chạy thay đổi: ${isPubgRunning ? 'Đang chạy (Ẩn overlay)' : 'Đã tắt (Hiện overlay)'}`);
      
      // Gửi tin nhắn qua WebSocket tới OBS Overlay
      const alertPayload = {
        type: 'pubg_state',
        data: {
          running: isPubgRunning
        }
      };
      
      const msgStr = JSON.stringify(alertPayload);
      activeWsClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(msgStr);
          } catch (e) {
            console.error('[WebSocket] Lỗi gửi trạng thái PUBG tới overlay:', e);
          }
        }
      });
    }
  });
}

// Chạy kiểm tra mỗi 4 giây
setInterval(checkPubgProcess, 4000);



