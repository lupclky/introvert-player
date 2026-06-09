const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-control', 'minimize'),
    maximize: () => ipcRenderer.send('window-control', 'maximize'),
    close: () => ipcRenderer.send('window-control', 'close'),
    onWindowStateChange: (callback) => ipcRenderer.on('window-state-change', (event, state) => callback(state)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
    getYoutubeMetadata: (videoId) => ipcRenderer.invoke('get-youtube-metadata', videoId),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    startUpdate: (url) => ipcRenderer.send('start-update', url),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (event, error) => callback(error))
});
