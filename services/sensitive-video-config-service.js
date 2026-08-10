(function attachSensitiveVideoConfigService(globalScope) {
    'use strict';

    class SensitiveVideoConfigService {
        constructor(options = {}) {
            this.storage = options.storage || globalScope.localStorage;
            this.fetchProxy = options.fetchProxy;
            this.fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
            this.now = options.now || Date.now;
            this.logger = options.logger || console;
            this.storageKey = options.storageKey || 'dua_sensitive_videos_url';
            this.defaultUrl = options.defaultUrl || 'https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json';
            this.config = {};
        }

        getUrl() {
            return this.storage?.getItem(this.storageKey) || this.defaultUrl;
        }

        getVideoIds() {
            return Object.keys(this.config).filter(key => /^[A-Za-z0-9_-]{6,20}$/.test(key));
        }

        async load() {
            const url = this.getUrl();
            if (!url) {
                this.config = {};
                return this.config;
            }

            const requestUrl = `${url.trim()}${url.includes('?') ? '&' : '?'}t=${this.now()}`;
            let rawText = null;
            try {
                if (this.fetchProxy) {
                    const response = await this.fetchProxy(requestUrl);
                    rawText = response?.contents || null;
                }
            } catch (error) {
                this.logger.warn('Sensitive video proxy failed; using direct request.', error);
            }

            if (!rawText && this.fetchImpl) {
                try {
                    const response = await this.fetchImpl(requestUrl, { cache: 'no-store' });
                    if (response?.ok) rawText = await response.text();
                } catch (error) {
                    this.logger.error('Sensitive video request failed.', error);
                    return this.config;
                }
            }

            if (!rawText) return this.config;
            try {
                const parsed = JSON.parse(rawText);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.config = parsed;
            } catch (error) {
                this.logger.error('Sensitive video JSON is invalid.', error);
            }
            return this.config;
        }
    }

    globalScope.SensitiveVideoConfigService = SensitiveVideoConfigService;
    if (typeof module !== 'undefined' && module.exports) module.exports = SensitiveVideoConfigService;
})(typeof window !== 'undefined' ? window : globalThis);
