'use strict';

const http = require('http');
const https = require('https');

function resolveExternalRedirectUrl(targetUrl, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, depth) => {
      if (depth > maxRedirects) return reject(new Error('Too many redirects'));
      let parsed;
      try {
        parsed = new URL(currentUrl);
      } catch (error) {
        return reject(new Error('Invalid URL'));
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) return reject(new Error('Unsupported URL protocol'));
      const client = parsed.protocol === 'https:' ? https : http;
      const request = client.get(parsed, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
        }
      }, response => {
        const status = Number(response.statusCode || 0);
        if (status >= 300 && status < 400 && response.headers.location) {
          const nextUrl = new URL(response.headers.location, parsed).href;
          response.resume();
          follow(nextUrl, depth + 1);
          return;
        }
        response.resume();
        if (status >= 200 && status < 400) resolve(parsed.href);
        else reject(new Error(`URL resolve failed with HTTP ${status || 'unknown'}`));
      });
      request.setTimeout(12000, () => request.destroy(new Error('URL resolve timeout')));
      request.on('error', reject);
    };
    follow(targetUrl, 0);
  });
}

function registerExternalUrlIpcService(ipcMain) {
  ipcMain.handle('resolve-external-url', async (event, targetUrl) => {
    try {
      return { success: true, resolvedUrl: await resolveExternalRedirectUrl(String(targetUrl || '')) };
    } catch (error) {
      console.error('resolve-external-url error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { resolveExternalRedirectUrl, registerExternalUrlIpcService };
