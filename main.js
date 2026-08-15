const { app, BrowserWindow, Menu, Tray, ipcMain, session, shell, clipboard, globalShortcut } = require('electron');
app.disableHardwareAcceleration();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const WebSocket = require('ws');
const sqlite = require('node:sqlite');
const { PlaylistRepository } = require('./services/playlist-repository');
const { YouTubePlaylistProvider } = require('./services/youtube-playlist-provider');
const { PlaylistService } = require('./services/playlist-service');
const { RealtimeEventService } = require('./services/realtime-event-service');
const { LocalRealtimeDatabaseService } = require('./services/local-realtime-database-service');
const { DonationRepository } = require('./services/donation-repository');
const { registerDonationIpcService } = require('./services/donation-ipc-service');
const { registerMainContextMenuService } = require('./services/main-context-menu-service');
const { registerActivityLogService } = require('./services/activity-log-service');
const { registerPlaylistIpcService } = require('./services/playlist-ipc-service');
const { registerExternalUrlIpcService } = require('./services/external-url-service');
const { startPubgMonitorService } = require('./services/pubg-monitor-service');
const { registerZyPageSongEndIpcService } = require('./services/zypage-song-end-ipc-service');
const { registerZyPageShopIdIpcService } = require('./services/zypage-shop-id-ipc-service');
const { YouTubeDurationService } = require('./services/youtube-duration-service');
const { YouTubeStreamService } = require('./services/youtube-stream-service');
const { BrowserMediaStateService } = require('./services/browser-media-state-service');
const { SyncedLyricsService } = require('./services/synced-lyrics-service');
const { registerSyncedLyricsIpcService } = require('./services/synced-lyrics-ipc-service');

let db = null;
let playlistRepository = null;
let playlistProvider = null;
let playlistService = null;
let localRealtimeDatabaseService = null;
let donationRepository = null;

function initDatabase() {
  try {
    const dbPath = path.join(app.getPath('userData'), 'donations.db');
    console.log('Initializing SQLite database at:', dbPath);
    db = new sqlite.DatabaseSync(dbPath);
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
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
    donationRepository = new DonationRepository(db);
    playlistRepository = new PlaylistRepository(db);
    playlistRepository.migrate();
    localRealtimeDatabaseService = new LocalRealtimeDatabaseService({
      database: db,
      clients: activeWsClients,
      getOpenState: () => WebSocket.OPEN
    });
    localRealtimeDatabaseService.migrate();
    playlistProvider = new YouTubePlaylistProvider({
      fetchPlaylistData: playlistId => fetchYoutubePageData(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`),
      fetchVideoMetadata: async videoId => {
        const metadata = await youtubeDurationService.resolve(videoId);
        return {
          durationSec: metadata.duration,
          viewCount: metadata.views,
          source: metadata.source
        };
      }
    });
    playlistService = new PlaylistService({
      repository: playlistRepository,
      provider: playlistProvider,
      emit: (type, data) => {
        console.info(`[Playlist event] ${type}`, data);
        const eventPayload = realtimeEventService.envelope(type, data);
        if (eventPayload && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('playlist-event', eventPayload);
        }
      }
    });
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
let activeDashboardRealtimeChannelId = null;
let pubgMonitorService = null;
const realtimeEventService = new RealtimeEventService({
  clients: activeWsClients,
  getOpenState: () => WebSocket.OPEN
});
const youtubeDurationService = new YouTubeDurationService({
  getYtDlpPath: () => path.join(app.getPath('userData'), 'yt-dlp.exe'),
  // play-dl can leak an internal rejected promise when YouTube returns 429.
  // yt-dlp/Data API are isolated and Overlay supplies the authoritative runtime duration.
  enablePlayDl: process.env.ENABLE_PLAY_DL_DURATION === '1'
});
const youtubeStreamService = new YouTubeStreamService({
  getYtDlpPath: () => path.join(app.getPath('userData'), 'yt-dlp.exe'),
  timeoutMs: 12000
});
const browserMediaStateService = new BrowserMediaStateService();
const syncedLyricsService = new SyncedLyricsService({
  clientName: 'IntrovertPlayer',
  clientVersion: app.getVersion(),
  clientContact: 'https://zypage.com',
  resolveYouTubeMetadata: videoId => youtubeDurationService.resolveMetadataWithYtDlp(videoId),
  // Verified release identifiers let the free LyricsPlus cache resolve tracks
  // even when Musixmatch temporarily requires a CAPTCHA.
  resolveTrackIsrc: song => ({
    YI1d0klj8J0: 'VNA0R2602500'
  })[String(song?.videoId || '')] || ''
});

function broadcastBrowserMediaState(state) {
  const message = JSON.stringify({
    type: 'browser_media_state',
    data: state,
    timestamp: Date.now(),
    source: 'browser-extension'
  });
  activeWsClients.forEach(client => {
    if (client.isRealtimeOverlayClient && client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch (_) { }
    }
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser-media-state', state);
  }
}

// Táº¯t sandbox Ä‘á»ƒ trÃ¡nh crash khi cháº¡y tá»« thÆ° má»¥c AppData (giá»¯ GPU báº­t Ä‘á»ƒ trÃ¡nh bug input focus)
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

  // Bá»™ Ã¡nh xáº¡ MIME types Ä‘á»ƒ server phá»¥c vá»¥ Ä‘Ãºng Ä‘á»‹nh dáº¡ng file
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  // HÃ m bá»• trá»£ kiá»ƒm tra Origin tin cáº­y (localhost, 127.0.0.1, file:// vÃ  null cá»§a OBS local file, vercel.app)
  function isOriginAllowed(origin) {
    if (!origin || origin === 'null') return true;
    return /^http:\/\/localhost(:\d+)?$/.test(origin) || 
           /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) || 
           /^chrome-extension:\/\//.test(origin) ||
           /^file:\/\//.test(origin) ||
           /\.vercel\.app$/.test(origin);
  }

  // HÃ m khá»Ÿi táº¡o Local HTTP Server
  function createLocalServer(startPort, callback) {
    server = http.createServer((req, res) => {
      const origin = req.headers.origin;

      // Cháº·n cÃ¡c request CORS cÃ³ Origin láº¡ khÃ´ng náº±m trong whitelist
      if (origin && !isOriginAllowed(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Cross-Origin Request Blocked');
        return;
      }

      // Helper Ä‘á»ƒ sinh CORS Headers Ä‘á»™ng cho cÃ¡c pháº£n há»“i
      function getCorsHeaders(extraHeaders = {}) {
        const headers = { ...extraHeaders };
        if (origin) {
          headers['Access-Control-Allow-Origin'] = origin;
        }
        return headers;
      }

      // Xá»­ lÃ½ tiá»n kiá»ƒm CORS (OPTIONS Preflight)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, getCorsHeaders({
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }));
        res.end();
        return;
      }

      // Xá»­ lÃ½ API lÆ°u cáº¥u hÃ¬nh (POST /api/config)
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
            console.error('Lá»—i lÆ°u cáº¥u hÃ¬nh AppData:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xá»­ lÃ½ API ghi log debug tá»« overlay (POST /api/debug-log)
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

      // Xá»­ lÃ½ API lÆ°u walkthrough vÃ  Ä‘áº©y lÃªn Vercel (POST /api/save-walkthrough)
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
            
            // Ghi Ä‘Ã¨ tá»‡p tin walkthrough.html trong thÆ° má»¥c landing
            const filePath = path.join(__dirname, 'landing', 'walkthrough.html');
            fs.writeFileSync(filePath, htmlContent, 'utf8');
            console.log('[API] ÄÃ£ lÆ°u thÃ nh cÃ´ng ná»™i dung walkthrough.html vÃ o Ä‘Ä©a cá»©ng.');
            
            // Náº¿u cá» deploy báº±ng true, cháº¡y lá»‡nh vercel --prod
            if (data.deploy) {
              const { exec } = require('child_process');
              const landingDir = path.join(__dirname, 'landing');
              
              console.log('[API] Báº¯t Ä‘áº§u Ä‘áº©y lÃªn Vercel...');
              exec('npx vercel --prod --yes', { cwd: landingDir }, (error, stdout, stderr) => {
                if (error) {
                  console.error('[API] Lá»—i khi cháº¡y lá»‡nh deploy Vercel:', error);
                } else {
                  console.log('[API] Deploy Vercel thÃ nh cÃ´ng:\n', stdout);
                }
              });
            }

            res.writeHead(200, getCorsHeaders({
              'Content-Type': 'application/json'
            }));
            res.end(JSON.stringify({ success: true, message: 'ÄÃ£ lÆ°u vÃ  triá»ƒn khai thÃ nh cÃ´ng!' }));
          } catch (err) {
            console.error('[API] Lá»—i API save-walkthrough:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xá»­ lÃ½ API test donate (POST /api/test-donate)
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
            console.error('Lá»—i API test-donate:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xá»­ lÃ½ API Ping (GET /api/ping)
      if (req.url === '/api/ping' && req.method === 'GET') {
        res.writeHead(200, getCorsHeaders({
          'Content-Type': 'application/json'
        }));
        res.end(JSON.stringify({ success: true, app: "pineapple-studio", version: app.getVersion() }));
        return;
      }

      // Nháº­n tráº¡ng thÃ¡i media tá»« Extension Ä‘á»ƒ Overlay dÃ¹ng khi queue trá»‘ng.
      if (req.url === '/api/browser-media-state' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          if (body.length < 65536) body += chunk;
        });
        req.on('end', () => {
          try {
            const state = browserMediaStateService.update(JSON.parse(body || '{}'));
            broadcastBrowserMediaState(state);
            res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ success: true, active: state.active }));
          } catch (err) {
            res.writeHead(400, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // Xá»­ lÃ½ API ThÃªm nháº¡c tá»« Extension (POST /api/add-song)
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
            console.error('Lá»—i API add-song:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Xá»­ lÃ½ API phÃ¢n giáº£i URL rÃºt gá»n (GET /api/resolve?url=...)
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

      // Xá»­ lÃ½ API láº¥y Ä‘á»™ dÃ i tháº­t cá»§a YouTube video (GET /api/youtube-duration?videoId=...)
      if (req.url.startsWith('/api/youtube-duration') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const videoId = parsedUrl.searchParams.get('videoId');
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing videoId parameter' }));
          return;
        }

        if (!YouTubeDurationService.isValidVideoId(videoId)) {
          res.writeHead(400, getCorsHeaders({ 'Content-Type': 'application/json' }));
          res.end(JSON.stringify({ duration: 0, views: '', error: 'Invalid YouTube video ID' }));
          return;
        }

        youtubeDurationService.resolve(videoId)
          .then(result => {
            if (res.writableEnded || res.destroyed) return;
            res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify(result));
          })
          .catch(error => {
            if (res.writableEnded || res.destroyed) return;
            res.writeHead(500, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ duration: 0, views: '', source: 'error', error: error.message }));
          });
        return;
      }

      // Xá»­ lÃ½ API tÃ¬m kiáº¿m video YouTube (GET /api/youtube-search?q=...)
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

      // Xá»­ lÃ½ API láº¥y Ä‘á»™ dÃ i tháº­t cá»§a SoundCloud video/track (GET /api/soundcloud-duration?url=...)
      if (req.url.startsWith('/api/soundcloud-duration') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        let trackUrl = parsedUrl.searchParams.get('url');
        if (trackUrl && trackUrl.includes('m.soundcloud.com')) {
          trackUrl = trackUrl.replace('m.soundcloud.com', 'soundcloud.com');
        }
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

      // Xá»­ lÃ½ API Ä‘á»c cáº¥u hÃ¬nh (GET /api/config)
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
          console.error('Lá»—i Ä‘á»c cáº¥u hÃ¬nh AppData:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // Xá»­ lÃ½ API láº¥y loudnessDb tá»« YouTube (GET /api/yt-loudness?videoId=...)
      if (req.url.startsWith('/api/yt-loudness') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const videoId = parsedUrl.searchParams.get('videoId');
        console.log(`[API yt-loudness] Nháº­n request láº¥y loudness cho videoId: ${videoId}`);
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
              // TÃ¬m ytInitialPlayerResponse trong HTML vÃ  trÃ­ch xuáº¥t JSON báº±ng Ä‘áº¿m ngoáº·c nhá»n
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
                    console.log(`[API yt-loudness] ThÃ nh cÃ´ng trÃ­ch xuáº¥t cho ${videoId} -> loudnessDb: ${loudnessDb}, perceptual: ${perceptualLoudnessDb}`);
                    res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
                    res.end(JSON.stringify({ videoId, loudnessDb: loudnessDb ?? null, perceptualLoudnessDb: perceptualLoudnessDb ?? null }));
                    return;
                  }
                }
              }
            } catch (e) {
              console.error(`[yt-loudness] Lá»—i phÃ¢n tÃ­ch playerResponse cho ${videoId}:`, e.message);
            }
            console.log(`[API yt-loudness] Tráº£ vá» loudnessDb máº·c Ä‘á»‹nh: null cho ${videoId}`);
            res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({ videoId, loudnessDb: null, perceptualLoudnessDb: null }));
          });
        }).on('error', (err) => {
          console.error(`[yt-loudness] Lá»—i káº¿t ná»‘i cho ${videoId}:`, err.message);
          res.writeHead(500, getCorsHeaders({ 'Content-Type': 'application/json' }));
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Xá»­ lÃ½ API láº¥y URL stream trá»±c tiáº¿p tá»« YouTube (GET /api/yt-stream?videoId=...)
      if (req.url.startsWith('/api/yt-stream') && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const videoId = parsedUrl.searchParams.get('videoId');
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing videoId parameter' }));
          return;
        }

        const abortController = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) abortController.abort();
        });

        let ytDlpCookieFilePath = '';
        // DÃ¹ng cookie cá»§a phiÃªn Ä‘Äƒng nháº­p YouTube trong app thay vÃ¬ Ä‘á»c trá»±c tiáº¿p
        // database Chromium Ä‘ang bá»‹ khÃ³a. File Netscape chá»‰ tá»“n táº¡i trong Ä‘Ãºng
        // thá»i gian yt-dlp phÃ¢n giáº£i URL vÃ  luÃ´n Ä‘Æ°á»£c xÃ³a á»Ÿ finally.
        createYtDlpCookieFile()
          .then(cookieFilePath => {
            ytDlpCookieFilePath = cookieFilePath;
            return youtubeStreamService.resolve(videoId, {
              signal: abortController.signal,
              cookiesFilePath: cookieFilePath
            });
          })
          .then(result => {
            if (res.destroyed || res.writableEnded) return;
            res.writeHead(200, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify(result));
          })
          .catch(error => {
            if (res.destroyed || res.writableEnded) return;
            const statusCode = Number(error?.statusCode) || 502;
            const errorCode = error?.code || 'yt_dlp_failed';
            console.error(`yt-dlp stream resolution failed for ${videoId} (${errorCode}):`, error?.message || error);
            if (Array.isArray(error?.details)) {
              console.error('yt-dlp resolver details:', error.details.map(item => ({
                resolver: item.resolver,
                code: item.code
              })));
            }
            res.writeHead(statusCode, getCorsHeaders({ 'Content-Type': 'application/json' }));
            res.end(JSON.stringify({
              success: false,
              code: errorCode,
              error: error?.message || 'yt-dlp failed'
            }));
          })
          .finally(() => removeYtDlpCookieFile(ytDlpCookieFilePath));
        return;
      }

      // Chá»‰ cháº¥p nháº­n GET requests cho file tÄ©nh
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('Method Not Allowed');
      }

      // LÃ m sáº¡ch path Ä‘á»ƒ trÃ¡nh táº¥n cÃ´ng Directory Traversal
      let safeUrl = req.url.split('?')[0];
      if (safeUrl === '/') {
        safeUrl = '/index.html';
      }

      const filePath = path.join(__dirname, safeUrl);

      // Kiá»ƒm tra xem file cÃ³ náº±m trong thÆ° má»¥c á»©ng dá»¥ng hay khÃ´ng
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

    // Khá»Ÿi táº¡o WebSocket Server gáº¯n vá»›i HTTP Server hiá»‡n táº¡i
    wss = new WebSocket.Server({ server });
    wss.on('connection', (ws, req) => {
      const origin = req.headers.origin;
      if (origin && !isOriginAllowed(origin)) {
        console.warn(`[WebSocket] Káº¿t ná»‘i bá»‹ tá»« chá»‘i do origin láº¡: ${origin}`);
        ws.close();
        return;
      }

      activeWsClients.add(ws);
      console.log(`[WebSocket] OBS Overlay Ä‘Ã£ káº¿t ná»‘i. Tá»•ng sá»‘ client: ${activeWsClients.size}`);

      // Snapshot Ä‘Æ°á»£c gá»­i sau khi Overlay Ä‘Äƒng kÃ½ Ä‘Ãºng channel realtime.

      // Gá»­i tráº¡ng thÃ¡i PUBG hiá»‡n táº¡i cho client má»›i káº¿t ná»‘i
      try {
        ws.send(JSON.stringify({
          type: 'pubg_state',
          data: { running: pubgMonitorService?.getRunning() || false }
        }));
      } catch (e) {
        console.error('[WebSocket] Lá»—i gá»­i tráº¡ng thÃ¡i PUBG ban Ä‘áº§u:', e);
      }

      ws.on('message', (message) => {
        try {
          const msgStr = message.toString();
          const parsed = JSON.parse(msgStr);
          if (parsed?.type === 'realtime.subscribe') {
            const role = parsed.role === 'dashboard' ? 'dashboard' : 'overlay';
            ws.realtimeRole = role;
            ws.isRealtimeOverlayClient = role === 'overlay';
            ws.requestedRealtimeChannelId = String(parsed.channelId || '');

            if (role === 'dashboard') {
              activeDashboardRealtimeChannelId = ws.requestedRealtimeChannelId;
              localRealtimeDatabaseService?.subscribe(ws, activeDashboardRealtimeChannelId, { role, sendSnapshot: false });
              activeWsClients.forEach(client => {
                if (client !== ws && client.isRealtimeOverlayClient && client.readyState === WebSocket.OPEN) {
                  // Chá»‰ Ä‘á»•i channel; Dashboard sáº½ gá»­i snapshot má»›i ngay sau khi subscribe.
                  // KhÃ´ng phÃ¡t snapshot SQLite cÅ© vÃ¬ cÃ³ thá»ƒ lÃ m Overlay náº¡p láº¡i bÃ i trÆ°á»›c.
                  localRealtimeDatabaseService?.subscribe(client, activeDashboardRealtimeChannelId, {
                    role: 'overlay',
                    sendSnapshot: false
                  });
                }
              });
              console.log(`[Local Realtime DB] Dashboard Ä‘ang listening channel: ${activeDashboardRealtimeChannelId}`);
            } else {
              const effectiveChannelId = activeDashboardRealtimeChannelId || parsed.channelId;
              localRealtimeDatabaseService?.subscribe(ws, effectiveChannelId, { role: 'overlay' });
              const browserMediaSnapshot = browserMediaStateService.getSnapshot();
              if (browserMediaSnapshot) {
                try {
                  ws.send(JSON.stringify({
                    type: 'browser_media_state',
                    data: browserMediaSnapshot,
                    timestamp: Date.now(),
                    source: 'browser-extension'
                  }));
                } catch (_) { }
              }
              if (activeDashboardRealtimeChannelId && ws.requestedRealtimeChannelId !== activeDashboardRealtimeChannelId) {
                console.warn(`[WebSocket] Overlay dÃ¹ng channel cÅ© ${ws.requestedRealtimeChannelId}; Ä‘Ã£ ghÃ©p vÃ o ${activeDashboardRealtimeChannelId}.`);
              }
            }
            return;
          }
          const channelId = ws.realtimeChannelId || parsed?.channelId;
          const direction = ws.realtimeRole === 'dashboard' ? 'to_overlay' : 'from_overlay';
          if (channelId && localRealtimeDatabaseService) {
            localRealtimeDatabaseService.publish(channelId, direction, parsed);
          }
        } catch (err) {
          console.error('[WebSocket] Lá»—i xá»­ lÃ½ tin nháº¯n tá»« overlay:', err);
        }
      });

      ws.on('close', () => {
        activeWsClients.delete(ws);
        console.log(`[WebSocket] OBS Overlay Ä‘Ã£ ngáº¯t káº¿t ná»‘i. Tá»•ng sá»‘ client: ${activeWsClients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[WebSocket] Lá»—i káº¿t ná»‘i client:', err);
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

  function registerGlobalMediaShortcuts(win) {
    const shortcuts = [
      { key: 'MediaPlayPause', action: 'play-pause' },
      { key: 'MediaNextTrack', action: 'next-track' },
      { key: 'MediaPreviousTrack', action: 'previous-track' },
      { key: 'MediaStop', action: 'stop' }
    ];

    shortcuts.forEach(({ key, action }) => {
      try {
        globalShortcut.register(key, () => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('media-control-action', action);
          }
        });
      } catch (e) {
        console.warn(`Failed to register global media shortcut [${key}]:`, e);
      }
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
        color: '#F5F2EB',      // Match light mode background initially
        symbolColor: '#2D2727', // Match light mode text
        height: 41
      } : false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Má»Ÿ táº¥t cáº£ liÃªn káº¿t bÃªn ngoÃ i (HTTP/HTTPS) báº±ng trÃ¬nh duyá»‡t máº·c Ä‘á»‹nh cá»§a há»‡ thá»‘ng Windows
    registerGlobalMediaShortcuts(mainWindow);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url && /^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // Menu chuá»™t pháº£i native cho Dashboard.
    // The application menu is hidden, so register DevTools shortcuts directly
    // on this window rather than using a process-wide global shortcut.
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut = input.type === 'keyDown' && (
        input.key === 'F12' ||
        ((input.control || input.meta) && input.shift && String(input.key).toLowerCase() === 'i')
      );
      if (!isDevToolsShortcut) return;
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    });

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
          label: 'ThÃªm vÃ o tá»« Ä‘iá»ƒn',
          click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        });
        template.push({ type: 'separator' });
      }

      if (params.isEditable) {
        template.push(
          { label: 'HoÃ n tÃ¡c', role: 'undo', enabled: Boolean(editFlags.canUndo) },
          { label: 'LÃ m láº¡i', role: 'redo', enabled: Boolean(editFlags.canRedo) },
          { type: 'separator' },
          { label: 'Cáº¯t', role: 'cut', enabled: Boolean(editFlags.canCut) },
          { label: 'Sao chÃ©p', role: 'copy', enabled: Boolean(editFlags.canCopy) },
          { label: 'DÃ¡n', role: 'paste', enabled: Boolean(editFlags.canPaste) },
          { label: 'DÃ¡n khÃ´ng Ä‘á»‹nh dáº¡ng', role: 'pasteAndMatchStyle', enabled: Boolean(editFlags.canPaste) },
          { label: 'XÃ³a', role: 'delete', enabled: Boolean(editFlags.canDelete) },
          { type: 'separator' },
          { label: 'Chá»n táº¥t cáº£', role: 'selectAll', enabled: Boolean(editFlags.canSelectAll) }
        );
      } else {
        if (params.selectionText && params.selectionText.trim()) {
          template.push({ label: 'Sao chÃ©p', role: 'copy' });
        }
        template.push({ label: 'Chá»n táº¥t cáº£', role: 'selectAll' });
      }

      if (params.linkURL && /^https?:\/\//i.test(params.linkURL)) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push(
          { label: 'Má»Ÿ liÃªn káº¿t trong trÃ¬nh duyá»‡t', click: () => shell.openExternal(params.linkURL) },
          { label: 'Sao chÃ©p Ä‘á»‹a chá»‰ liÃªn káº¿t', click: () => clipboard.writeText(params.linkURL) }
        );
      }

      if (params.mediaType === 'image' && params.srcURL) {
        if (template.length > 0) template.push({ type: 'separator' });
        template.push(
          { label: 'Sao chÃ©p hÃ¬nh áº£nh', click: () => mainWindow.webContents.copyImageAt(params.x, params.y) },
          { label: 'Sao chÃ©p Ä‘á»‹a chá»‰ hÃ¬nh áº£nh', click: () => clipboard.writeText(params.srcURL) }
        );
        if (/^https?:\/\//i.test(params.srcURL)) {
          template.push({ label: 'Má»Ÿ hÃ¬nh áº£nh trong trÃ¬nh duyá»‡t', click: () => shell.openExternal(params.srcURL) });
        }
      }

      if (template.length > 0) template.push({ type: 'separator' });
      template.push(
        { label: 'Táº£i láº¡i giao diá»‡n', role: 'reload' },
        {
          label: 'Thu phÃ³ng',
          submenu: [
            { label: 'PhÃ³ng to', role: 'zoomIn' },
            { label: 'Thu nhá»', role: 'zoomOut' },
            { label: 'Äáº·t láº¡i 100%', role: 'resetZoom' }
          ]
        },
        { type: 'separator' },
        {
          label: 'Má»Ÿ DevTools (F12)',
          click: () => mainWindow.webContents.openDevTools()
        }
      );

      Menu.buildFromTemplate(template).popup({ window: mainWindow });
    });

    // Load trang Dashboard thÃ´ng qua URL cá»§a local server
    mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

    // Táº¡o menu á»©ng dá»¥ng cÆ¡ báº£n
    Menu.setApplicationMenu(null); // áº¨n menu máº·c Ä‘á»‹nh Ä‘á»ƒ giao diá»‡n trÃ´ng tá»‘i giáº£n vÃ  chuyÃªn nghiá»‡p hÆ¡n



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

    // Æ¯u tiÃªn táº£i icon tá»« extraResources (náº±m ngoÃ i ASAR), fallback vÃ o __dirname (khi dev)
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
          label: 'Hiá»ƒn thá»‹',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          }
        },
        {
          label: 'Khá»Ÿi Ä‘á»™ng cÃ¹ng Windows',
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
          label: 'ThoÃ¡t',
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

    // Thiáº¿t láº­p khá»Ÿi Ä‘á»™ng cÃ¹ng Windows khi má»Ÿ app láº§n Ä‘áº§u
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
      console.error('Lá»—i khi thiáº¿t láº­p khá»Ÿi Ä‘á»™ng cÃ¹ng Windows láº§n Ä‘áº§u:', e);
    }

    // Dá»n dáº¹p cÃ¡c file html táº¡m cá»§a thÃ´ng bÃ¡o tá»« láº§n cháº¡y trÆ°á»›c
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
      console.error('KhÃ´ng thá»ƒ dá»n dáº¹p file thÃ´ng bÃ¡o táº¡m:', e);
    }

    // Báº¯t Ä‘áº§u khá»Ÿi cháº¡y server trÆ°á»›c, sau Ä‘Ã³ táº¡o cá»­a sá»• hiá»ƒn thá»‹
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
    try {
      globalShortcut.unregisterAll();
    } catch (_) {}
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

let lastIsDarkMode = false;

registerMainContextMenuService({ ipcMain, Menu, BrowserWindow, shell, clipboard });
registerZyPageSongEndIpcService({ ipcMain });
registerZyPageShopIdIpcService({ ipcMain });
registerSyncedLyricsIpcService({ ipcMain, service: syncedLyricsService });

// Láº¯ng nghe yÃªu cáº§u hiá»ƒn thá»‹ thÃ´ng bÃ¡o taskbar tá»« Dashboard (Renderer)
ipcMain.on('show-taskbar-notification', (event, data) => {
  if (data && data.title) {
    if (data.isDarkMode !== undefined) {
      lastIsDarkMode = data.isDarkMode;
    }
    showTaskbarNotification(data.title, data.message || '', lastIsDarkMode, data.duration);
  }
});

// Láº¯ng nghe sá»± kiá»‡n Ä‘iá»u khiá»ƒn cá»­a sá»• tá»« Dashboard (Renderer)
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
        label: 'KhÃ´i phá»¥c',
        enabled: mainWindow.isMaximized() || mainWindow.isMinimized(),
        click: () => {
          if (mainWindow.isMinimized()) mainWindow.restore();
          else if (mainWindow.isMaximized()) mainWindow.unmaximize();
        }
      },
      {
        label: 'Di chuyá»ƒn',
        enabled: !mainWindow.isMaximized(),
        click: () => {}
      },
      {
        label: 'KÃ­ch cá»¡',
        enabled: !mainWindow.isMaximized(),
        click: () => {}
      },
      {
        label: 'Thu nhá»',
        enabled: mainWindow.isMinimizable(),
        click: () => {
          mainWindow.minimize();
        }
      },
      {
        label: 'PhÃ³ng to',
        enabled: mainWindow.isMaximizable() && !mainWindow.isMaximized(),
        click: () => {
          mainWindow.maximize();
        }
      },
      { type: 'separator' },
      {
        label: 'ÄÃ³ng',
        accelerator: 'Alt+F4',
        click: () => {
          mainWindow.close();
        }
      }
    ]);
    menu.popup({ window: mainWindow });
  }
});

// Láº¯ng nghe sá»± kiá»‡n chuyá»ƒn Ä‘á»•i theme Ä‘á»ƒ cáº­p nháº­t Titlebar Overlay tÆ°Æ¡ng á»©ng
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
          const views = v.views ? v.views.toLocaleString('vi-VN') + ' lÆ°á»£t xem' : '';
          
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

    function decodeJsonString(str) {
      if (!str) return '';
      try {
        return JSON.parse(`"${str}"`);
      } catch (e) {
        return str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }

    function extractAuthorFromWatchHtml(html) {
      const authorMetaTag = html.match(/<meta[^>]+itemprop=["']author["'][^>]*>/i)?.[0] || '';
      const authorMetaTagReversed = html.match(/<meta[^>]+content=["'][^"']+["'][^>]+itemprop=["']author["'][^>]*>/i)?.[0] || '';
      const metaAuthorTag = authorMetaTag || authorMetaTagReversed;
      const metaAuthor = metaAuthorTag.match(/content=["']([^"']*)["']/i)?.[1] || '';
      if (metaAuthor) return decodeHtmlEntities(metaAuthor).trim();

      const ownerChannelName = html.match(/"ownerChannelName"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1] || '';
      if (ownerChannelName) return decodeHtmlEntities(decodeJsonString(ownerChannelName)).trim();

      const authorName = html.match(/"author"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1] || '';
      return authorName ? decodeHtmlEntities(decodeJsonString(authorName)).trim() : '';
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
              thumbnail: json.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              author: decodeHtmlEntities(json.author_name || '')
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
          const author = extractAuthorFromWatchHtml(data);
          if (title && title !== 'YouTube') {
            resolve({
              title: decodeHtmlEntities(title),
              thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              author
            });
          } else {
            resolve({
              title: `Nháº¡c YouTube (${videoId})`,
              thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              author
            });
          }
        });
      }).on('error', () => {
        resolve({
          title: `Nháº¡c YouTube (${videoId})`,
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
    // Thá»­ cÃ¡c máº«u khÃ¡c
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
  
  // TÃ¬m tháº» káº¿t thÃºc </script> cá»§a block script hiá»‡n táº¡i
  const endIdx = html.indexOf('</script>', jsonStartIdx);
  if (endIdx === -1) return null;
  
  let jsonStr = html.substring(jsonStartIdx, endIdx).trim();
  // Loáº¡i bá» dáº¥u cháº¥m pháº©y á»Ÿ cuá»‘i náº¿u cÃ³
  if (jsonStr.endsWith(';')) {
    jsonStr = jsonStr.substring(0, jsonStr.length - 1).trim();
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Fallback: Sá»­ dá»¥ng regex náº¿u cáº¯t chuá»—i Ä‘Æ¡n giáº£n gáº·p lá»—i
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

async function createYtDlpCookieFile() {
  try {
    const cookies = await session.defaultSession.cookies.get({});
    const youtubeCookies = cookies.filter(cookie => {
      const domain = String(cookie?.domain || '').replace(/^\./, '').toLowerCase();
      return domain === 'youtube.com'
        || domain.endsWith('.youtube.com')
        || domain === 'google.com'
        || domain.endsWith('.google.com');
    });
    const contents = YouTubeStreamService.serializeNetscapeCookies(youtubeCookies);
    if (!contents) return '';

    const cookieFilePath = path.join(
      app.getPath('userData'),
      `.yt-dlp-cookies-${process.pid}-${crypto.randomUUID()}.txt`
    );
    await fs.promises.writeFile(cookieFilePath, contents, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
    return cookieFilePath;
  } catch (error) {
    console.warn('KhÃ´ng thá»ƒ chuáº©n bá»‹ cookie YouTube cho DirectStream:', error?.message || error);
    return '';
  }
}

async function removeYtDlpCookieFile(cookieFilePath) {
  if (!cookieFilePath) return;
  const retryDelaysMs = [0, 150, 500];
  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      await fs.promises.unlink(cookieFilePath);
      return;
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      if (!['EBUSY', 'EPERM'].includes(error?.code) || delayMs === retryDelaysMs.at(-1)) {
        console.warn('KhÃ´ng thá»ƒ xÃ³a file cookie táº¡m cá»§a DirectStream:', error?.message || error);
        return;
      }
    }
  }
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
      title: 'ÄÄƒng nháº­p YouTube',
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
    // BÆ°á»›c 1: Táº£i trang chá»§ YouTube vá»›i Ä‘áº§y Ä‘á»§ cookies cá»§a tÃ i khoáº£n Ä‘Ã£ Ä‘Äƒng nháº­p
    // fetchYoutubePageDataAndHtml Ä‘Ã£ xá»­ lÃ½ SOCS cookie + redirect Ä‘Ãºng chuáº©n, tráº£ vá» cáº£ JSON vÃ  HTML thÃ´
    const { jsonObj: homeData, html: homepageHtml } = await fetchYoutubePageDataAndHtml('https://www.youtube.com');

    // Láº¥y cookies Ä‘áº§y Ä‘á»§ (bao gá»“m SID, SAPISID, SOCS...) Ä‘á»ƒ dÃ¹ng cho Innertube POST
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

    // Láº¥y API Key tá»« trang chá»§ HTML (Æ¯u tiÃªn apiKey thá»±c táº¿ cá»§a session rá»“i má»›i Ä‘áº¿n INNERTUBE_API_KEY dá»± phÃ²ng)
    const apiKeyMatch = homepageHtml.match(/"apiKey"\s*:\s*"([^"]+)"/) || homepageHtml.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

    // Helper: POST Innertube browse vá»›i cookies tÃ i khoáº£n Ä‘áº§y Ä‘á»§
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

    // TÃ¬m chip "Ã‚m nháº¡c" trong feedFilterChipBarRenderer cá»§a trang chá»§ (há»— trá»£ nhiá»u ngÃ´n ngá»¯)
    let musicChipToken = null;
    const musicLabels = [
      'Ã‚m nháº¡c', 'Music', 'Musique', 'MÃºsica', 'Musik', 'Musica', 
      'éŸ³æ¥½', 'ìŒì•…', 'éŸ³ä¹', 'éŸ³æ¨‚', 'ÐœÑƒÐ·Ñ‹ÐºÐ°', 'Muzyka', 'MÃ¼zik'
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
      // BÆ°á»›c 2: POST vá»›i token chip Ã‚m nháº¡c â†’ feed trang chá»§ Ä‘Ã£ lá»c theo Ã‚m nháº¡c, cÃ¡ nhÃ¢n hÃ³a
      try {
        const chipJson = await innertubePost({ ...innertubeCxt, continuation: musicChipToken });
        collectVideos(findKeysRecursive(chipJson, keys));
      } catch (e) {
        console.error("Lá»—i khi fetch chip Ã¢m nháº¡c:", e);
      }
    }

    // Fallback: dÃ¹ng ytInitialData trang chá»§ náº¿u chip khÃ´ng cÃ³ káº¿t quáº£
    if (videos.length === 0) {
      collectVideos(findKeysRecursive(homeData, keys));
    }

    // Láº¥y thÃªm trang tiáº¿p theo náº¿u cáº§n
    if (continuationToken && videos.length < 36) {
      try {
        const contJson = await innertubePost({ ...innertubeCxt, continuation: continuationToken });
        collectVideos(findKeysRecursive(contJson, keys));
      } catch (contErr) {
        console.error("Lá»—i khi táº£i thÃªm gá»£i Ã½ Ã¢m nháº¡c tá»« YouTube:", contErr);
      }
    }

    return { success: true, videos: videos.slice(0, 60) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});




ipcMain.handle('get-app-version', () => app.getVersion());

// Walkthrough persistence and asset saving
ipcMain.handle('save-walkthrough-html', async (event, cleanHTML) => {
  try {
    const filePath = path.join(__dirname, 'landing', 'walkthrough.html');
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'walkthrough.html not found on disk' };
    }
    let fileContent = fs.readFileSync(filePath, 'utf8');
    const startMarker = '<!-- EDITOR_CANVAS_START -->';
    const endMarker = '<!-- EDITOR_CANVAS_END -->';
    const startIndex = fileContent.indexOf(startMarker);
    const endIndex = fileContent.indexOf(endMarker);

    if (startIndex !== -1 && endIndex !== -1) {
      const before = fileContent.substring(0, startIndex + startMarker.length);
      const after = fileContent.substring(endIndex);
      
      const newCanvasHTML = `\n                <div id="editor-canvas" class="article-content" contenteditable="true" placeholder="Báº¯t Ä‘áº§u viáº¿t bÃ i viáº¿t cá»§a báº¡n táº¡i Ä‘Ã¢y...">\n${cleanHTML}\n                </div>\n`;
      fileContent = before + newCanvasHTML + after;
      fs.writeFileSync(filePath, fileContent, 'utf8');
      return { success: true };
    } else {
      return { success: false, error: 'Could not find EDITOR_CANVAS markers in walkthrough.html' };
    }
  } catch (error) {
    console.error('save-walkthrough-html error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-walkthrough-image', async (event, fileName, base64Data) => {
  try {
    const imageDir = path.join(__dirname, 'landing', 'image');
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Content, 'base64');

    const originalExt = path.extname(fileName);
    const fileBase = path.basename(fileName, originalExt).replace(/[^a-zA-Z0-9_-]/g, "_");

    // Detect actual extension from mime type
    const mimeMatch = base64Data.match(/^data:(image\/\w+);base64,/);
    let fileExt = '.webp';
    if (mimeMatch) {
      const mime = mimeMatch[1];
      if (mime === 'image/gif') fileExt = '.gif';
      else if (mime === 'image/png') fileExt = '.png';
      else if (mime === 'image/jpeg') fileExt = '.jpg';
    }

    const uniqueFileName = `${fileBase}_${Date.now()}${fileExt}`;
    const filePath = path.join(imageDir, uniqueFileName);

    fs.writeFileSync(filePath, buffer);

    return { success: true, relativePath: `image/${uniqueFileName}` };
  } catch (error) {
    console.error('save-walkthrough-image error:', error);
    return { success: false, error: error.message };
  }
});

registerExternalUrlIpcService(ipcMain);

// ==========================================
// DONATE Má»ž YOUTUBE PLAYLIST
// ==========================================

registerPlaylistIpcService(ipcMain, {
  getService: () => playlistService,
  getRepository: () => playlistRepository
});

registerDonationIpcService(ipcMain, () => donationRepository);

// Cáº¥u hÃ¬nh cáº­p nháº­t tá»± Ä‘á»™ng tá»« GitHub Release
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

ipcMain.handle('check-for-updates', async () => { return { hasUpdate: false }; });


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
      
      // Khá»Ÿi cháº¡y trÃ¬nh cÃ i Ä‘áº·t vÃ  tá»± Ä‘á»™ng thoÃ¡t app
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
            mainWindow.webContents.send('update-error', `KhÃ´ng thá»ƒ khá»Ÿi cháº¡y trÃ¬nh cÃ i Ä‘áº·t: ${e.message}`);
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
    // Xá»­ lÃ½ chuyá»ƒn hÆ°á»›ng (301, 302, 307, 308)
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      downloadFileWithProgress(res.headers.location, destPath, onProgress, onSuccess, onError);
      return;
    }

    if (res.statusCode !== 200) {
      onError(new Error(`Táº£i xuá»‘ng tháº¥t báº¡i: HTTP ${res.statusCode}`));
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
// ÄIá»€U KHIá»‚N & LÆ¯U TRá»® NHáº¬T KÃ HOáº T Äá»˜NG
// ==========================================

registerActivityLogService({ ipcMain, app, shell, fs, path });

const activeNotifications = [];

function getPreferredNotificationDisplay(screen) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplays = displays.filter(display => display.id !== primaryDisplay.id);

  if (secondaryDisplays.length === 0) return primaryDisplay;

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const dashboardDisplay = screen.getDisplayMatching(mainWindow.getBounds());
      const matchingSecondary = secondaryDisplays.find(display => display.id === dashboardDisplay.id);
      if (matchingSecondary) return matchingSecondary;
    } catch (e) {}
  }

  return secondaryDisplays.reduce((largest, display) => {
    const largestArea = largest.workArea.width * largest.workArea.height;
    const displayArea = display.workArea.width * display.workArea.height;
    return displayArea > largestArea ? display : largest;
  }, secondaryDisplays[0]);
}

const escapeHtml = (text) => {
  return (text || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};


function repositionNotifications() {
  const { screen } = require('electron');
  try {
    const targetDisplays = [getPreferredNotificationDisplay(screen)];
    const notifWidth = 480;
    
    targetDisplays.forEach((display) => {
      const { x, y, width, height } = display.workArea;
      let currentOffset = 0;
      
      const displayNotifs = activeNotifications.filter(n => n.displayId === display.id);
      
      displayNotifs.forEach((notif) => {
        const h = notif.height || 110;
        const posX = x + width - notifWidth - 20;
        const posY = y + height - h - 20 - currentOffset;
        
        if (notif.window && !notif.window.isDestroyed()) {
          notif.window.setBounds({ x: posX, y: posY, width: notifWidth, height: h });
        }
        currentOffset += h + 10;
      });
    });
  } catch (e) {
    console.error('Lá»—i khi reposition notifications:', e);
  }
}

function closeNotificationById(id) {
  let found = false;
  for (let i = activeNotifications.length - 1; i >= 0; i--) {
    const notif = activeNotifications[i];
    if (notif.id === id) {
      if (notif.timeout) {
        clearTimeout(notif.timeout);
        notif.timeout = null;
      }
      if (notif.revealFallback) {
        clearTimeout(notif.revealFallback);
        notif.revealFallback = null;
      }
      activeNotifications.splice(i, 1);
      if (notif.window && !notif.window.isDestroyed()) {
        try {
          notif.window.destroy();
        } catch (e) {}
      }
      try {
        if (notif.tempHtmlPath && fs.existsSync(notif.tempHtmlPath)) {
          fs.unlinkSync(notif.tempHtmlPath);
        }
      } catch (e) {}
      found = true;
    }
  }
  if (found) {
    repositionNotifications();
  }
}

ipcMain.on('close-notification-window', (event, id) => {
  closeNotificationById(id);
});

ipcMain.on('set-ignore-mouse-events', (event, id, ignore, options) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow && !senderWindow.isDestroyed()) {
    if (ignore) {
      senderWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      senderWindow.setIgnoreMouseEvents(false);
    }
  }
});

function showTaskbarNotification(title, message, isDarkMode = false, duration) {
  const { screen, BrowserWindow } = require('electron');
  
  try {
    const targetDisplays = [getPreferredNotificationDisplay(screen)];
    
    // TÃ¡ch tiÃªu Ä‘á» nháº¡c vÃ  tin nháº¯n tá»« message (phÃ¢n cÃ¡ch báº±ng \n)
    const rawMsgStr = (message || '').trim();
    const lines = rawMsgStr.split('\n');
    const notificationKind = /^\[PLAYLIST\]/i.test(lines[0] || '')
      ? 'playlist'
      : (/^\[MUSIC\]/i.test(lines[0] || '') ? 'music' : 'donation');
    const notificationKindLabel = notificationKind === 'playlist'
      ? 'PLAYLIST'
      : 'DONATE Má»šI';
    let songTitle = '';
    let cleanMsg = '';
    
    if (lines.length > 1) {
        songTitle = (lines[0] || '').replace(/^(\[PLAYLIST\]|\[MUSIC\]|ðŸŽµ|â–¶)\s*/u, '').replace(/[\uD800-\uDFFF]/g, '').trim();
        cleanMsg = lines.slice(1).join('\n').trim();
    } else if (lines.length === 1 && rawMsgStr) {
        const singleLine = lines[0].trim();
        if (singleLine.startsWith('[PLAYLIST]') || singleLine.startsWith('[MUSIC]') || singleLine.startsWith('ðŸŽµ') || singleLine.startsWith('â–¶') || singleLine.toLowerCase().includes('youtube') || singleLine.toLowerCase().includes('http://') || singleLine.toLowerCase().includes('https://')) {
            songTitle = singleLine.replace(/^(\[PLAYLIST\]|\[MUSIC\]|ðŸŽµ|â–¶)\s*/u, '').replace(/[\uD800-\uDFFF]/g, '').trim();
            cleanMsg = '';
        } else {
            songTitle = '';
            cleanMsg = singleLine;
        }
    }
    const cleanMsgLines = cleanMsg ? cleanMsg.split('\n') : [];

    const notifWidth = 480;
    
    // TÃ­nh toÃ¡n Ä‘á»™ cao linh hoáº¡t 100% theo ná»™i dung thá»±c táº¿ (khÃ´ng dÃ¹ng ellipsis ...)
    const titleLines = Math.max(1, Math.ceil((title || '').length / 36));
    // Chá»«a má»™t hÃ ng cho nhÃ£n DONATE Má»šI / PLAYLIST.
    let calculatedHeight = 84 + (titleLines * 24);

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
    
    const bgGradient = isDarkMode
      ? 'linear-gradient(145deg, rgba(22, 42, 34, 0.98) 0%, rgba(14, 29, 25, 0.98) 100%)'
      : 'linear-gradient(145deg, rgba(244, 244, 231, 0.98) 0%, rgba(226, 235, 218, 0.98) 100%)';
    const borderColor = isDarkMode ? 'rgba(132, 170, 132, 0.52)' : 'rgba(67, 124, 94, 0.42)';
    const titleColor = isDarkMode ? '#D9E8C7' : '#285E49';
    const textSongColor = isDarkMode ? '#EDF2E5' : '#233D33';
    const textMsgColor = isDarkMode ? '#C5D2C1' : '#516158';

    const notifGroupId = 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);

    let timeoutDuration = null;
    const isHang = (duration === -1 || duration === 0);
    if (!isHang) {
      timeoutDuration = 10000;
      if (duration !== undefined && duration !== null && duration > 0) {
        timeoutDuration = duration;
      } else {
        const contentText = (title || '') + ' ' + (message || '');
        const charCount = contentText.length;
        timeoutDuration = Math.min(20000, Math.max(5000, 5000 + (charCount / 15) * 1000));
      }
    }

    // Táº¡o thÃ´ng bÃ¡o trÃªn má»—i mÃ n hÃ¬nh Ä‘Æ°á»£c chá»n
    targetDisplays.forEach((display) => {
      const { x, y, width, height } = display.workArea;
      
      // TÃ­nh toÃ¡n vá»‹ trÃ­ Y dá»±a trÃªn sá»‘ lÆ°á»£ng thÃ´ng bÃ¡o hiá»‡n cÃ³ trÃªn mÃ n hÃ¬nh nÃ y
      let offset = 0;
      activeNotifications.forEach(notif => {
        if (notif.displayId === display.id) {
          offset += (notif.height || 110) + 10;
        }
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
        focusable: false,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          backgroundThrottling: false
        }
      });

      // Äá»ƒ hiá»ƒn thá»‹ trÃªn game vÃ  cÃ¡c mÃ n hÃ¬nh khÃ¡c tá»‘t hÆ¡n
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setFocusable(false);
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setIgnoreMouseEvents(true, { forward: true });

      const tempHtmlPath = path.join(app.getPath('userData'), `${notifGroupId}_${display.id}.html`);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              height: 100vh;
              overflow: hidden;
              background: transparent;
              font-family: 'Aptos', 'Segoe UI', sans-serif;
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
              font-family: 'Aptos Display', 'Aptos', 'Segoe UI', sans-serif;
              font-size: 1.15rem;
              font-weight: 800;
              color: ${titleColor};
              margin-bottom: 4px;
              padding-right: 20px;
              word-break: break-word;
            }
            .kind-badge {
              display: inline-flex;
              align-items: center;
              width: fit-content;
              min-height: 22px;
              box-sizing: border-box;
              margin-bottom: 7px;
              padding: 3px 8px;
              border: 1px solid ${notificationKind === 'playlist' ? (isDarkMode ? '#789B66' : '#6F9872') : borderColor};
              border-radius: 7px;
              background: ${notificationKind === 'playlist' ? (isDarkMode ? '#315C46' : '#DDEBD2') : (isDarkMode ? 'rgba(96, 127, 103, .22)' : 'rgba(255, 255, 255, .52)')};
              color: ${notificationKind === 'playlist' ? (isDarkMode ? '#EAF6C9' : '#246A4E') : titleColor};
              font-size: .68rem;
              font-weight: 700;
              line-height: 1;
              letter-spacing: .04em;
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
              font-family: 'Aptos Display', 'Aptos', 'Segoe UI', sans-serif;
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
              <div class="kind-badge">${notificationKindLabel}</div>
              <div class="title">${escapeHtml(title)}</div>
              ${songTitle ? `<div class="song-title"><svg style="width: 16px; height: 16px; fill: #FF0000; vertical-align: -3px; margin-right: 5px; flex-shrink: 0; display: inline-block;" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>${escapeHtml(songTitle)}</div>` : ''}
              ${cleanMsg ? `<div class="message">${escapeHtml(cleanMsg)}</div>` : ''}
            </div>
          </div>
          <script>
            const { ipcRenderer } = require('electron');
            function closeNotification() {
              ipcRenderer.send('close-notification-window', '${notifGroupId}');
            }
            
            const container = document.querySelector('.container');
            container.addEventListener('mouseenter', () => {
              ipcRenderer.send('set-ignore-mouse-events', '${notifGroupId}', false);
            });
            container.addEventListener('mouseleave', () => {
              ipcRenderer.send('set-ignore-mouse-events', '${notifGroupId}', true, { forward: true });
            });
          </script>
        </body>
        </html>
      `;

      fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');
      const notificationEntry = {
        id: notifGroupId,
        displayId: display.id,
        window: win,
        timeout: null,
        revealFallback: null,
        height: notifHeight,
        tempHtmlPath: tempHtmlPath
      };
      activeNotifications.push(notificationEntry);

      let hasBeenShown = false;
      const revealNotification = () => {
        if (hasBeenShown || !win || win.isDestroyed()) return;
        hasBeenShown = true;
        if (notificationEntry.revealFallback) {
          clearTimeout(notificationEntry.revealFallback);
          notificationEntry.revealFallback = null;
        }

        win.showInactive();
        win.setFocusable(false);
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        win.moveTop();

        if (timeoutDuration !== null) {
          notificationEntry.timeout = setTimeout(() => {
            closeNotificationById(notifGroupId);
          }, timeoutDuration);
        }
      };

      // ÄÄƒng kÃ½ listener trÆ°á»›c loadFile Ä‘á»ƒ khÃ´ng bá» lá»¡ ready-to-show khi mÃ¡y pháº£n há»“i nhanh.
      win.once('ready-to-show', revealNotification);
      win.webContents.once('did-finish-load', revealNotification);
      notificationEntry.revealFallback = setTimeout(revealNotification, 2000);

      win.loadFile(tempHtmlPath).catch((error) => {
        console.error('Lá»—i khi táº£i giao diá»‡n notification:', error);
        revealNotification();
      });

      win.once('show', () => {
        if (win && !win.isDestroyed()) {
          win.setFocusable(false);
          win.setAlwaysOnTop(true, 'screen-saver');
          win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
          win.moveTop();
        }
      });

      win.on('closed', () => {
        if (notificationEntry.revealFallback) {
          clearTimeout(notificationEntry.revealFallback);
          notificationEntry.revealFallback = null;
        }
        try {
          if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath);
          }
        } catch (e) {
          console.error('Lá»—i khi xÃ³a file táº¡m notification:', e);
        }

        const idx = activeNotifications.findIndex(n => n.window === win);
        if (idx !== -1) {
          activeNotifications.splice(idx, 1);
          repositionNotifications();
        }
      });
    });

  } catch (err) {
    console.error('Lá»—i khi táº¡o thÃ´ng bÃ¡o Taskbar:', err);
  }
}

// Theo dÃµi game cháº¡y á»Ÿ service riÃªng; timer Ä‘Æ°á»£c unref Ä‘á»ƒ khÃ´ng giá»¯ tiáº¿n trÃ¬nh Electron khi thoÃ¡t.
pubgMonitorService = startPubgMonitorService({
  exec,
  broadcast: payload => {
    const message = JSON.stringify(payload);
    activeWsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }
});




