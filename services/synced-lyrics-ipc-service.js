'use strict';

function registerSyncedLyricsIpcService({ ipcMain, service }) {
  if (!ipcMain || !service) throw new TypeError('ipcMain and service are required');
  ipcMain.handle('get-synced-lyrics', async (_event, song) => service.resolve(song || {}));
  ipcMain.handle('debug-synced-lyrics', async (_event, song) => service.debug(song || {}));
}

module.exports = { registerSyncedLyricsIpcService };
