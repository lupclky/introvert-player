'use strict';

function registerMainContextMenuService({ ipcMain, Menu, BrowserWindow, shell, clipboard }) {
  ipcMain.on('open-external-url', (event, url) => {
    if (url && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  ipcMain.on('show-favorite-context-menu', (event, favorite) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow || !favorite || typeof favorite !== 'object') return;
    const key = String(favorite.key || '').slice(0, 512);
    const title = String(favorite.title || 'Bài hát yêu thích').slice(0, 300);
    const displayTitle = title.length > 72 ? `${title.slice(0, 69)}...` : title;
    const url = typeof favorite.url === 'string' && /^https?:\/\//i.test(favorite.url) ? favorite.url : '';
    if (!key) return;
    const sendAction = action => {
      if (!event.sender.isDestroyed()) event.sender.send('favorite-context-action', { action, key });
    };
    const template = [
      { label: displayTitle, enabled: false },
      { type: 'separator' },
      { label: 'Thêm vào hàng đợi', click: () => sendAction('queue') }
    ];
    if (url) template.push(
      { label: 'Mở bài hát trong trình duyệt', click: () => shell.openExternal(url) },
      { label: 'Sao chép liên kết', click: () => clipboard.writeText(url) }
    );
    template.push(
      { label: 'Sao chép tên bài hát', click: () => clipboard.writeText(title) },
      { type: 'separator' },
      { label: 'Xóa khỏi yêu thích', click: () => sendAction('delete') }
    );
    Menu.buildFromTemplate(template).popup({ window: ownerWindow });
  });

  ipcMain.on('show-queue-context-menu', (event, params) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow || !params || typeof params !== 'object') return;
    const sendAction = action => {
      if (!event.sender.isDestroyed()) event.sender.send('queue-context-action', { action });
    };
    const template = [
      { label: 'Đồng bộ ZyPage', click: () => sendAction('sync') },
      { type: 'separator' },
      { label: 'Chế độ Lucky (Quay ngẫu nhiên)', type: 'checkbox', checked: !!params.luckyMode, click: () => sendAction('toggle-lucky-mode') },
      { type: 'separator' },
      { label: 'Ưu tiên: Thời gian', type: 'radio', checked: params.sortConfig === 'time', click: () => sendAction('sort-time') },
      { label: 'Ưu tiên: Số tiền', type: 'radio', checked: params.sortConfig === 'amount', click: () => sendAction('sort-amount') }
    ];
    Menu.buildFromTemplate(template).popup({ window: ownerWindow });
  });
}

module.exports = { registerMainContextMenuService };
