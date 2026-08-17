(function attachDashboardSearchService(globalScope) {
    'use strict';

    class DashboardSearchService {
        constructor(options = {}) {
            this.document = options.document || globalScope.document;
            this.state = options.state || {};
            this.electronAPI = options.electronAPI || globalScope.electronAPI || null;
            this.fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
            this.getApiUrl = options.getApiUrl || (path => path);
            this.isFavorite = options.isFavorite || (() => false);
            this.toggleFavorite = options.toggleFavorite || (() => {});
            this.formatViews = options.formatViews || (value => String(value || ''));
            this.cleanChannelName = options.cleanChannelName || (value => String(value || ''));
            this.formatTime = options.formatTime || (value => String(value || ''));
            this.readQuickAddOptions = options.readQuickAddOptions || (() => ({ donorName: 'Em Dứa', amount: 100000000, isOwnerAdd: false }));
            this.createSong = options.createSong || (video => video);
            this.insertSong = options.insertSong || (() => {});
            this.broadcastNewDonationAlert = options.broadcastNewDonationAlert || (() => {});
            this.saveQueue = options.saveQueue || (() => {});
            this.sortAndRefreshQueue = options.sortAndRefreshQueue || (() => {});
            this.clearQuickSearch = options.clearQuickSearch || (() => {});
            this.logSystem = options.logSystem || (() => {});
            this.showDashboardSystemAlert = options.showDashboardSystemAlert || (() => {});
            this.playNextInQueue = options.playNextInQueue || (() => {});
        }

        async searchYouTube(query) {
            if (this.electronAPI && typeof this.electronAPI.searchYouTube === 'function') {
                return this.electronAPI.searchYouTube(query);
            }
            if (typeof this.fetchImpl !== 'function') throw new Error('Search transport is unavailable');
            const response = await this.fetchImpl(this.getApiUrl(`/api/youtube-search?q=${encodeURIComponent(query)}`));
            return response.json();
        }

        renderResults(videos, containerId = 'qa-search-list') {
            const container = this.document?.getElementById(containerId);
            if (!container) return;

            container.innerHTML = '';
            if (containerId === 'quick-add-search-results') {
                const urlInput = this.document.getElementById('donor-url');
                if (urlInput) container.dataset.query = String(urlInput.value || '').trim();
            }
            if (!Array.isArray(videos) || videos.length === 0) {
                container.innerHTML = '<div style="padding: 10px; text-align: center; color: #6B7280; font-weight: 700;">Không tìm thấy video nào!</div>';
                return;
            }

            const isGrid = containerId === 'qa-recommendations-list' || containerId === 'qa-playlists-list';
            videos.forEach(video => this.appendResult(container, video, isGrid));
        }

        appendResult(container, video, isGrid) {
            const item = this.document.createElement('div');
            const isFavorite = this.isFavorite(video);
            const authorName = this.cleanChannelName(video.author || video.channel || video.channelTitle || video.uploader || 'YouTube');
            let displayDuration = video.duration || '--:--';
            if (displayDuration && (typeof displayDuration === 'number' || /^\d+(\.\d+)?$/.test(String(displayDuration).trim()))) {
                displayDuration = this.formatTime(parseFloat(displayDuration));
            }

            if (isGrid) {
                item.className = 'grid-result-item';
                item.innerHTML = `
                    <div class="grid-result-thumb-wrapper">
                        <img src="${video.thumbnail}" alt="thumb">
                        <span class="grid-result-duration">${displayDuration}</span>
                        <button type="button" class="grid-result-favorite-btn" title="${isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}" style="position: absolute; top: 5px; left: 5px; background: rgba(0,0,0,0.6); color: ${isFavorite ? '#EF4444' : '#FFF'}; border: none; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; font-size: 0.75rem; z-index: 10;">
                            <i class="${isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}"></i>
                        </button>
                    </div>
                    <div class="grid-result-info">
                        <div class="grid-result-title" title="${video.title}">${video.title}</div>
                        <div class="grid-result-meta" title="${authorName} • ${video.views || ''}">
                            <span>${authorName}</span>
                            ${video.views ? `• <span>${this.formatViews(video.views)} views</span>` : ''}
                        </div>
                    </div>`;
            } else {
                item.className = 'search-result-item';
                item.innerHTML = `
                    <div class="search-result-thumb"><img src="${video.thumbnail ? video.thumbnail.replace('/default.jpg', '/mqdefault.jpg') : ''}" alt="thumb"></div>
                    <div class="search-result-info">
                        <div class="search-result-title" title="${video.title}">${video.title}</div>
                        <div class="search-result-meta">
                            <span>${authorName}</span>
                            <span style="display: flex; align-items: center; gap: 5px;">
                                ${video.views ? `<span class="search-result-views" style="display: inline-flex; align-items: center; gap: 0.15rem; color: #9CA3AF; margin-right: 0.3rem;" title="Lượt xem: ${video.views}"><i class="fa-regular fa-eye" style="font-size: 0.7rem;"></i>${this.formatViews(video.views)}</span>` : ''}
                                <span class="search-result-duration">${displayDuration}</span>
                            </span>
                        </div>
                    </div>
                    <div class="search-result-actions" style="display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0;">
                        <button type="button" class="search-result-favorite-btn" title="${isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}"><i class="${isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="${isFavorite ? 'color: #EF4444;' : ''}"></i></button>
                        <button type="button" class="search-result-btn" title="Thêm vào hàng đợi"><i class="fa-solid fa-plus"></i></button>
                    </div>`;
            }

            const selectAction = event => {
                if (event.target.closest('.search-result-favorite-btn') || event.target.closest('.grid-result-favorite-btn')) return;
                event.stopPropagation();
                this.addResultToQueue(video);
            };
            item.querySelector('.search-result-btn')?.addEventListener('click', selectAction);
            item.addEventListener('click', selectAction);

            const favoriteButton = item.querySelector('.search-result-favorite-btn') || item.querySelector('.grid-result-favorite-btn');
            favoriteButton?.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleFavorite(video);
                this.updateFavoriteButton(favoriteButton, isGrid, this.isFavorite(video));
            });
            container.appendChild(item);
        }

        updateFavoriteButton(button, isGrid, isFavorite) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
                if (isGrid) button.style.color = isFavorite ? '#EF4444' : '#FFF';
                else icon.style.color = isFavorite ? '#EF4444' : '';
            }
            button.title = isFavorite ? 'Bỏ yêu thích' : 'Yêu thích';
        }

        addResultToQueue(video) {
            if (this.state.focusMode) return null;
            const options = this.readQuickAddOptions();
            const newSong = this.createSong(video, options);
            this.insertSong(newSong);
            this.broadcastNewDonationAlert(newSong);
            this.saveQueue();
            this.sortAndRefreshQueue();
            this.logSystem(`Đã thêm nhanh bài hát từ tìm kiếm: <strong>${video.title}</strong>`, 'queue');
            this.showDashboardSystemAlert('Đã thêm nhạc nhanh', `Đã thêm nhanh bài hát: <strong>${video.title}</strong>`, 'HÀNG ĐỢI');
            this.clearQuickSearch();
            this.document?.getElementById('quick-add-popover')?.classList.remove('visible');
            if (!this.state.currentSong && !this.state.focusMode) this.playNextInQueue();
            return newSong;
        }
    }

    globalScope.DashboardSearchService = DashboardSearchService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DashboardSearchService;
})(typeof window !== 'undefined' ? window : globalThis);
