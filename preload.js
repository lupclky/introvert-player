const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-control', 'minimize'),
    maximize: () => ipcRenderer.send('window-control', 'maximize'),
    close: () => ipcRenderer.send('window-control', 'close'),
    focusWindow: () => ipcRenderer.send('window-control', 'focus'),
    themeChange: (theme) => ipcRenderer.send('theme-change', theme),
    onWindowStateChange: (callback) => ipcRenderer.on('window-state-change', (event, state) => callback(state)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
    getYoutubeMetadata: (videoId) => ipcRenderer.invoke('get-youtube-metadata', videoId),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    startUpdate: (url) => ipcRenderer.send('start-update', url),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (event, error) => callback(error)),
    sendOverlayMessage: (message) => ipcRenderer.send('send-to-overlay', message),
    onOverlayMessage: (callback) => ipcRenderer.on('from-overlay', (event, message) => callback(message)),
    
    // YouTube Account Sync
    ytLogin: () => ipcRenderer.invoke('youtube-login'),
    ytCheckAuth: () => ipcRenderer.invoke('youtube-check-auth'),
    ytLogout: () => ipcRenderer.invoke('youtube-logout'),
    ytGetPlaylists: () => ipcRenderer.invoke('youtube-get-playlists'),
    ytGetPlaylistVideos: (playlistId) => ipcRenderer.invoke('youtube-get-playlist-videos', playlistId),
    ytGetRecommendations: () => ipcRenderer.invoke('youtube-get-recommendations'),
    
    // External Log File
    saveLogEntry: (text) => ipcRenderer.send('save-log-entry', text),
    openLogFile: () => ipcRenderer.invoke('open-log-file'),
    
    // yt-dlp direct stream bypass
    checkYtDlpStatus: () => ipcRenderer.invoke('check-ytdlp-status'),
    downloadYtDlp: () => ipcRenderer.invoke('download-ytdlp'),
    onYtDlpDownloadProgress: (callback) => ipcRenderer.on('ytdlp-download-progress', (event, data) => callback(data)),
    
    // Test Donate
    onTestDonate: (callback) => ipcRenderer.on('test-donate', (event, data) => callback(data)),
    
    // External Add Song (from browser extension)
    onAddSongExternal: (callback) => ipcRenderer.on('add-song-external', (event, data) => callback(data)),

    // Custom Taskbar Notification
    showTaskbarNotification: (title, message, isDarkMode, duration) => ipcRenderer.send('show-taskbar-notification', { title, message, isDarkMode, duration }),

    // SQLite Database for Donations
    dbGetDonations: () => ipcRenderer.invoke('db-get-donations'),
    dbAddDonation: (donation) => ipcRenderer.invoke('db-add-donation', donation),
    dbMarkRead: (id) => ipcRenderer.invoke('db-mark-read', id),
    dbMarkAllRead: () => ipcRenderer.invoke('db-mark-all-read'),
    dbClearHistory: () => ipcRenderer.invoke('db-clear-history')
});
