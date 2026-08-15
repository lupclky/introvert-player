const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-control', 'minimize'),
    maximize: () => ipcRenderer.send('window-control', 'maximize'),
    close: () => ipcRenderer.send('window-control', 'close'),
    focusWindow: () => ipcRenderer.send('window-control', 'focus'),
    showSystemMenu: () => ipcRenderer.send('window-control', 'system-menu'),
    themeChange: (theme) => ipcRenderer.send('theme-change', theme),
    onWindowStateChange: (callback) => ipcRenderer.on('window-state-change', (event, state) => callback(state)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
    getYoutubeMetadata: (videoId) => ipcRenderer.invoke('get-youtube-metadata', videoId),
    getSyncedLyrics: (song) => ipcRenderer.invoke('get-synced-lyrics', song),
    debugSyncedLyrics: (song) => ipcRenderer.invoke('debug-synced-lyrics', song),
    resolveExternalUrl: (url) => ipcRenderer.invoke('resolve-external-url', url),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    startUpdate: (url) => ipcRenderer.send('start-update', url),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (event, error) => callback(error)),
    // YouTube Account Sync
    ytLogin: () => ipcRenderer.invoke('youtube-login'),
    ytCheckAuth: () => ipcRenderer.invoke('youtube-check-auth'),
    ytLogout: () => ipcRenderer.invoke('youtube-logout'),
    ytGetPlaylists: () => ipcRenderer.invoke('youtube-get-playlists'),
    ytGetPlaylistVideos: (playlistId) => ipcRenderer.invoke('youtube-get-playlist-videos', playlistId),
    ytGetRecommendations: () => ipcRenderer.invoke('youtube-get-recommendations'),

    // Donate mở YouTube Playlist
    processPlaylistDonation: (donation, settings, blacklistVideoIds) => ipcRenderer.invoke('playlist-process-donation', donation, settings, blacklistVideoIds),
    addManualPlaylist: (sourceUrl, context, settings, blacklistVideoIds) => ipcRenderer.invoke('playlist-add-manual', sourceUrl, context, settings, blacklistVideoIds),
    getPendingPlaylists: () => ipcRenderer.invoke('playlist-list-pending'),
    getActivePlaylists: () => ipcRenderer.invoke('playlist-list-active'),
    acceptPlaylist: (requestId, settings, blacklistVideoIds, overrideUrl) => ipcRenderer.invoke('playlist-accept', requestId, settings, blacklistVideoIds, overrideUrl),
    rejectPlaylist: (requestId) => ipcRenderer.invoke('playlist-reject', requestId),
    convertPlaylistToSingle: (requestId, settings) => ipcRenderer.invoke('playlist-convert-single', requestId, settings),
    markPlaylistQueued: (requestId) => ipcRenderer.invoke('playlist-mark-queued', requestId),
    markPlaylistTrackStarted: (trackId) => ipcRenderer.invoke('playlist-track-started', trackId),
    markPlaylistTrackFinished: (trackId, status, reason) => ipcRenderer.invoke('playlist-track-finished', trackId, status, reason),
    pausePlaylist: (requestId) => ipcRenderer.invoke('playlist-pause', requestId),
    resumePlaylist: (requestId) => ipcRenderer.invoke('playlist-resume', requestId),
    skipPlaylist: (requestId) => ipcRenderer.invoke('playlist-skip', requestId),
    sendZyPageSongEnd: (config) => ipcRenderer.invoke('zypage-song-end', config),
    resolveZyPageShopId: (config) => ipcRenderer.invoke('zypage-resolve-shop-id', config),
    onPlaylistEvent: (callback) => ipcRenderer.on('playlist-event', (event, payload) => callback(payload)),
    
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
    onBrowserMediaState: (callback) => ipcRenderer.on('browser-media-state', (event, data) => callback(data)),

    // Custom Taskbar Notification
    showTaskbarNotification: (title, message, isDarkMode, duration) => ipcRenderer.send('show-taskbar-notification', { title, message, isDarkMode, duration }),

    // Open link in default external browser
    openExternal: (url) => ipcRenderer.send('open-external-url', url),

    // Native context menu for favorite songs
    showFavoriteContextMenu: (favorite) => ipcRenderer.send('show-favorite-context-menu', favorite),
    onFavoriteContextAction: (callback) => ipcRenderer.on('favorite-context-action', (event, action) => callback(action)),

    // Native context menu for queue controls
    showQueueContextMenu: (params) => ipcRenderer.send('show-queue-context-menu', params),
    onQueueContextAction: (callback) => ipcRenderer.on('queue-context-action', (event, action) => callback(action)),

    // SQLite Database for Donations
    dbGetDonations: () => ipcRenderer.invoke('db-get-donations'),
    dbAddDonation: (donation) => ipcRenderer.invoke('db-add-donation', donation),
    dbMarkRead: (id) => ipcRenderer.invoke('db-mark-read', id),
    dbMarkAllRead: () => ipcRenderer.invoke('db-mark-all-read'),
    dbClearHistory: () => ipcRenderer.invoke('db-clear-history'),

    // Windows Media Controls / Headphone Integration
    onMediaControlAction: (callback) => ipcRenderer.on('media-control-action', (event, action) => callback(action)),

    // Walkthrough Content System
    saveWalkthroughHTML: (cleanHTML) => ipcRenderer.invoke('save-walkthrough-html', cleanHTML),
    saveWalkthroughImage: (fileName, base64Data) => ipcRenderer.invoke('save-walkthrough-image', fileName, base64Data)
});
