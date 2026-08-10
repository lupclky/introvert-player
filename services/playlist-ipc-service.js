'use strict';

function registerPlaylistIpcService(ipcMain, options = {}) {
  const getService = options.getService || (() => null);
  const getRepository = options.getRepository || (() => null);
  const service = () => {
    const instance = getService();
    if (!instance) throw new Error('playlist_service_not_ready');
    return instance;
  };

  ipcMain.handle('playlist-process-donation', (event, donation, settings, blacklist) =>
    service().processDonation(donation, settings, blacklist));
  ipcMain.handle('playlist-add-manual', (event, sourceUrl, context, settings, blacklist) =>
    service().processManualPlaylist(sourceUrl, context, settings, blacklist));
  ipcMain.handle('playlist-list-pending', () => getRepository()?.listPending() || []);
  ipcMain.handle('playlist-list-active', () => getRepository()?.listActive() || []);
  ipcMain.handle('playlist-accept', (event, requestId, settings, blacklist, overrideUrl) => {
    if (overrideUrl) service().overrideSource(String(requestId), String(overrideUrl));
    return service().resolveAndAccept(String(requestId), settings, blacklist);
  });
  ipcMain.handle('playlist-reject', (event, requestId) => service().reject(String(requestId)));
  ipcMain.handle('playlist-convert-single', (event, requestId, settings) => service().convertToSingle(String(requestId), settings));
  ipcMain.handle('playlist-mark-queued', (event, requestId) => service().markQueued(String(requestId)));
  ipcMain.handle('playlist-track-started', (event, trackId) => service().trackStarted(String(trackId)));
  ipcMain.handle('playlist-track-finished', (event, trackId, status, reason) => service().trackFinished(String(trackId), status, reason));
  ipcMain.handle('playlist-pause', (event, requestId) => service().pause(String(requestId)));
  ipcMain.handle('playlist-resume', (event, requestId) => service().resume(String(requestId)));
  ipcMain.handle('playlist-skip', (event, requestId) => service().skipPlaylist(String(requestId)));
}

module.exports = { registerPlaylistIpcService };
