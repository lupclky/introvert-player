'use strict';

function registerDonationIpcService(ipcMain, getRepository) {
  const withRepository = (fallback, action) => {
    const repository = getRepository();
    if (!repository) return fallback;
    try {
      return action(repository);
    } catch (error) {
      console.error('Donation IPC error:', error);
      return typeof fallback === 'object' && fallback !== null
        ? { ...fallback, error: error.message }
        : fallback;
    }
  };

  ipcMain.handle('db-get-donations', () => withRepository([], repository => repository.list()));
  ipcMain.handle('db-add-donation', (event, donation) =>
    withRepository({ success: false }, repository => repository.add(donation)));
  ipcMain.handle('db-mark-read', (event, id) =>
    withRepository(false, repository => repository.markRead(id)));
  ipcMain.handle('db-mark-all-read', () =>
    withRepository(false, repository => repository.markAllRead()));
  ipcMain.handle('db-clear-history', () =>
    withRepository(false, repository => repository.clear()));
}

module.exports = { registerDonationIpcService };
