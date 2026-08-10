(function attachSongMetadataService(globalScope) {
    'use strict';

    class SongMetadataService {
        constructor(options = {}) {
            this.fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
            this.electronApi = options.electronApi || globalScope.electronAPI;
            this.getApiUrl = options.getApiUrl || (path => path);
            this.formatTime = options.formatTime || (value => String(value));
            this.cleanChannelName = options.cleanChannelName || (value => String(value || '').trim());
            this.logger = options.logger || console;
            this.cache = options.cache || new Map();
        }

        async get(type, videoId, soundcloudUrl) {
            const cacheKey = type === 'youtube' ? `yt_${videoId}` : `sc_${soundcloudUrl}`;
            if (cacheKey && this.cache.has(cacheKey)) return this.cache.get(cacheKey);

            let title = '', thumbnail = '', author = '', duration = '', views = '';
            try {
                if (type === 'youtube') {
                    const url = `https://www.youtube.com/watch?v=${videoId}`;
                    if (typeof this.electronApi?.getYoutubeMetadata === 'function') {
                        const metadata = await this.electronApi.getYoutubeMetadata(videoId);
                        title = metadata.title || `Nhạc YouTube (${videoId})`;
                        thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        author = this.cleanChannelName(metadata.author_name || metadata.author || metadata.channelTitle || '');
                    } else {
                        const response = await this.fetchImpl(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
                        const data = await response.json();
                        title = data.title || `Nhạc YouTube (${videoId})`;
                        thumbnail = data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        author = this.cleanChannelName(data.author_name || '');
                    }
                    try {
                        const response = await this.fetchImpl(this.getApiUrl(`/api/youtube-duration?videoId=${videoId}`));
                        const data = await response.json();
                        if (data?.duration) duration = this.formatTime(parseFloat(data.duration));
                        if (data?.views) views = data.views;
                    } catch (_) {}
                } else if (type === 'soundcloud') {
                    const response = await this.fetchImpl(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(soundcloudUrl)}`);
                    const data = await response.json();
                    title = data.title || 'Nhạc SoundCloud';
                    thumbnail = data.thumbnail_url || SongMetadataService.soundcloudFallbackThumbnail;
                    author = data.author_name || 'SoundCloud';
                    try {
                        const durationResponse = await this.fetchImpl(this.getApiUrl(`/api/soundcloud-duration?url=${encodeURIComponent(soundcloudUrl)}`));
                        const durationData = await durationResponse.json();
                        if (durationData?.duration) duration = this.formatTime(parseFloat(durationData.duration));
                        if (durationData?.playCount) views = durationData.playCount;
                    } catch (_) {}
                }
            } catch (error) {
                this.logger.error('Lỗi lấy siêu dữ liệu bài nhạc:', error);
                if (type === 'youtube') {
                    title = `YT: ${videoId}`;
                    thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    author = '';
                } else {
                    title = `SC: ${(soundcloudUrl || '').replace('https://soundcloud.com/', '')}`;
                    thumbnail = SongMetadataService.soundcloudFallbackThumbnail;
                    author = 'SoundCloud';
                }
            }

            const result = { title, thumbnail, author, channelName: author, duration, views, videoId, soundcloudUrl };
            if (title && !title.includes('???')) this.cache.set(cacheKey, result);
            return result;
        }
    }

    SongMetadataService.soundcloudFallbackThumbnail = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop';
    globalScope.SongMetadataService = SongMetadataService;
    if (typeof module !== 'undefined' && module.exports) module.exports = SongMetadataService;
})(typeof window !== 'undefined' ? window : globalThis);
