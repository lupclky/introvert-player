'use strict';

function normalizePathType(pathType) {
  return pathType === 'donate-message' ? 'donate-message' : 'donate-music';
}

function parseShopId(pageContents) {
  const text = String(pageContents || '');
  const match = text.match(/"shop_id"\s*:\s*(\d+)/) || text.match(/shop_id\s*:\s*(\d+)/);
  return String(match?.[1] || '').trim();
}

function registerZyPageShopIdIpcService({ ipcMain, fetchImpl = globalThis.fetch }) {
  ipcMain.handle('zypage-resolve-shop-id', async (_event, config = {}) => {
    const domain = String(config.domain || '').replace(/\/$/, '');
    const token = String(config.token || '').trim();
    if (!/^https:\/\/[^/]+$/i.test(domain) || token.length < 10) return { success: false, reason: 'invalid' };
    if (typeof fetchImpl !== 'function') return { success: false, reason: 'fetch_unavailable' };
    try {
      const response = await fetchImpl(`${domain}/${normalizePathType(config.pathType)}/${encodeURIComponent(token)}`, {
        method: 'GET', redirect: 'follow'
      });
      if (!response.ok) return { success: false, reason: `http_${response.status}` };
      const shopId = parseShopId(await response.text());
      return shopId ? { success: true, shopId } : { success: false, reason: 'shop_id_not_found' };
    } catch (error) {
      return { success: false, reason: 'network', error: error.message };
    }
  });
}

module.exports = { registerZyPageShopIdIpcService, parseShopId, normalizePathType };
