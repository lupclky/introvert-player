'use strict';

function registerZyPageSongEndIpcService({ ipcMain, fetchImpl = globalThis.fetch }) {
  ipcMain.handle('zypage-song-end', async (event, config = {}) => {
    const domain = String(config.domain || '').replace(/\/$/, '');
    const shopId = String(config.shopId || '').trim();
    const token = String(config.token || '').trim();
    const musicKey = String(config.musicKey || '').trim();
    if (!/^https:\/\/[^/]+$/i.test(domain) || !shopId || !token || !musicKey) {
      return { success: false, reason: 'invalid' };
    }
    if (typeof fetchImpl !== 'function') return { success: false, reason: 'fetch_unavailable' };

    try {
      let effectiveShopId = shopId;
      const postEnd = async (key, targetShopId = effectiveShopId) => {
        const body = new URLSearchParams({
          action: 'donate_music_end', shop_id: targetShopId, shop_token: token, music_key: key
        });
        const response = await fetchImpl(`${domain}/assets/ajax/system.php`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(), redirect: 'follow'
        });
        const responseText = await response.text();
        let responseData = null;
        try { responseData = JSON.parse(responseText.trim()); } catch (_) {}
        return { response, responseData, key };
      };

      // A saved configuration can retain a shop_id from an older ZyPage link.
      // The token page is authoritative, and main process fetch avoids renderer CORS.
      const resolveShopIdFromTokenPage = async () => {
        const pathType = config.pathType === 'donate-message' ? 'donate-message' : 'donate-music';
        const page = await fetchImpl(
          `${domain}/${pathType}/${encodeURIComponent(token)}`,
          { method: 'GET', redirect: 'follow' }
        );
        if (!page.ok) return '';
        const contents = await page.text();
        const match = contents.match(/"shop_id"\s*:\s*(\d+)/) || contents.match(/shop_id\s*:\s*(\d+)/);
        return String(match?.[1] || '').trim();
      };

      let attempt = await postEnd(musicKey);
      let zyPageStatus = Number(attempt.responseData?.status);

      // Status 2 may mean either a Firebase key offset or a stale shop_id. Repair
      // the shop first; otherwise the subsequent snapshot lookup queries an empty,
      // unrelated shop and can never recover the correct music key.
      if (attempt.response.ok && zyPageStatus === 2) {
        try {
          const resolvedShopId = await resolveShopIdFromTokenPage();
          if (resolvedShopId && resolvedShopId !== effectiveShopId) {
            effectiveShopId = resolvedShopId;
            attempt = await postEnd(musicKey);
            zyPageStatus = Number(attempt.responseData?.status);
          }
        } catch (_) {
          // Keep the original response path if ZyPage's token page is temporarily unavailable.
        }
      }

      // Firebase may publish a key one second newer than music.key. Resolve the
      // authoritative row directly in the Electron main process (no CORS proxy)
      // and retry only when the full song identity matches.
      if (attempt.response.ok && zyPageStatus === 2 && config.videoId) {
        const snapshotResponse = await fetchImpl(
          `${domain}/api/get_data_by_id?table=shop&data=donate&id=${encodeURIComponent(effectiveShopId)}&v=${Date.now()}`,
          { method: 'GET', redirect: 'follow' }
        );
        const snapshotText = await snapshotResponse.text();
        let snapshot = null;
        try { snapshot = JSON.parse(snapshotText.trim()); } catch (_) {}
        let donate = snapshot?.data?.donate || {};
        if (typeof donate === 'string') {
          try { donate = JSON.parse(donate); } catch (_) { donate = {}; }
        }
        const normalizeName = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi-VN');
        const transactionTime = Number(config.transactionTime || 0);
        const matches = Object.entries(donate?.music?.list || {}).filter(([outerKey, item]) => {
          if (String(item?.music?.id || '') !== String(config.videoId)) return false;
          if (Number(item?.order?.amount || 0) !== Number(config.amount || 0)) return false;
          if (normalizeName(item?.order?.name) !== normalizeName(config.donorName)) return false;
          const itemTime = Number(item?.order?.time || item?.music?.key || outerKey || 0);
          return !transactionTime || !itemTime || Math.abs(transactionTime - itemTime) <= 2
            || Math.abs(transactionTime - itemTime * 1000) <= 2000;
        });
        const resolvedKey = String(matches[0]?.[1]?.music?.key ?? matches[0]?.[0] ?? '').trim();
        if (resolvedKey && resolvedKey !== musicKey) {
          attempt = await postEnd(resolvedKey);
          zyPageStatus = Number(attempt.responseData?.status);
        }
      }

      const completed = attempt.response.ok && zyPageStatus === 1;
      return {
        success: completed,
        reason: attempt.response.ok
          ? (zyPageStatus === 1 ? '' : (zyPageStatus === 2 ? 'invalid_music_key' : 'server_rejected'))
          : `http_${attempt.response.status}`,
        status: attempt.response.status,
        response: attempt.responseData,
        musicKey: attempt.key,
        shopId: effectiveShopId
      };
    } catch (error) {
      return { success: false, reason: 'network', error: error.message };
    }
  });
}

module.exports = { registerZyPageSongEndIpcService };
