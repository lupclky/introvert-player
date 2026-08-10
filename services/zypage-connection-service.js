(function attachZyPageConnectionService(globalScope) {
    'use strict';

    class ZyPageConnectionService {
        constructor(options = {}) {
            this.fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
            this.storage = options.storage || globalScope.localStorage;
            this.state = options.state || {};
            this.log = options.log || (() => {});
            this.updateStatus = options.updateStatus || (() => {});
            this.saveConfig = options.saveConfig || (() => Promise.resolve());
            this.startListener = options.startListener || (() => {});
            this.alert = options.alert || globalScope.alert?.bind(globalScope) || (() => {});
            this.resolveShopId = options.resolveShopId || null;
        }

        static parseConnectionInput(input) {
            const normalizedInput = String(input || '').trim();
            let domain = 'https://zypage.com';
            let token = '';
            let pathType = 'donate-music';
            let splitter = '';

            if (normalizedInput.includes('donate-music/')) {
                splitter = 'donate-music/';
            } else if (normalizedInput.includes('donate-message/')) {
                splitter = 'donate-message/';
                pathType = 'donate-message';
            }

            if (splitter) {
                try {
                    domain = new URL(normalizedInput).origin;
                } catch (_) {
                    const match = normalizedInput.match(/^(https?:\/\/[^/]+)/);
                    if (match) domain = match[1];
                }
                token = normalizedInput.split(splitter).pop().split('/')[0].split('?')[0];
            } else {
                token = normalizedInput;
            }

            return { domain, token, pathType };
        }

        async fetchPage(url) {
            if (typeof this.fetchImpl !== 'function') {
                throw new Error('Fetch API is unavailable.');
            }

            try {
                const response = await this.fetchImpl(`https://corsproxy.io/?${encodeURIComponent(url)}`);
                if (response.ok) return { contents: await response.text() };
            } catch (error) {
                console.warn('CORSProxy.io failed, trying allorigins fallback...', error);
            }

            try {
                const response = await this.fetchImpl(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}&v=${Date.now()}`);
                if (response.ok) {
                    const data = await response.json();
                    return { contents: data.contents };
                }
            } catch (error) {
                console.error('AllOrigins failed too:', error);
            }

            throw new Error('Không thể kết nối qua các CORS proxy. Máy chủ có thể đang quá tải.');
        }

        async persistConnection({ input, domain, token, pathType, shopId }) {
            Object.assign(this.state, {
                zypageToken: token,
                zypageShopId: shopId,
                zypageDomain: domain,
                zypagePathType: pathType
            });

            this.storage?.setItem('dua_zypage_token', token);
            this.storage?.setItem('dua_zypage_shop_id', shopId);
            this.storage?.setItem('dua_zypage_domain', domain);
            this.storage?.setItem('dua_zypage_path_type', pathType);
            await this.saveConfig(input, shopId);
        }

        async connect({ input, shopId = '', autoReconnect = false } = {}) {
            const normalizedInput = String(input || '').trim();
            if (!normalizedInput) {
                if (!autoReconnect) this.alert('Vui lòng điền link trang ZyPage trước!');
                return null;
            }

            const connection = ZyPageConnectionService.parseConnectionInput(normalizedInput);
            if (!connection.token || connection.token.length < 10) {
                this.alert('Link ZyPage hoặc Shop Token không đúng định dạng!');
                return null;
            }

            this.updateStatus('connecting', 'Đang kết nối...');
            this.log(`Đang kết nối tới Live ZyPage [Token: ${connection.token}]...`);

            const savedShopId = String(shopId || '').trim();
            let resolvedShopId = '';
            if (typeof this.resolveShopId === 'function') {
                try {
                    const resolved = await this.resolveShopId(connection);
                    if (resolved?.success && resolved.shopId) resolvedShopId = String(resolved.shopId).trim();
                } catch (error) {
                    console.warn('ZyPage main-process shop resolver failed:', error);
                }
            }
            if (!resolvedShopId) resolvedShopId = savedShopId;
            if (savedShopId && resolvedShopId && savedShopId !== resolvedShopId) {
                this.log(`ÄÃ£ sá»­a Shop ID ZyPage: <strong>${savedShopId}</strong> â†’ <strong>${resolvedShopId}</strong>.`, 'system');
            }
            if (autoReconnect && resolvedShopId) {
                this.log(`Sử dụng Shop ID đã lưu: <strong>${resolvedShopId}</strong>`);
            } else if (!resolvedShopId) {
                try {
                    const page = await this.fetchPage(`${connection.domain}/${connection.pathType}/${connection.token}`);
                    const match = page.contents?.match(/"shop_id"\s*:\s*(\d+)/) || page.contents?.match(/shop_id\s*:\s*(\d+)/);
                    if (!match) throw new Error('Không tìm thấy shop_id trong mã nguồn.');
                    resolvedShopId = match[1];
                    this.log(`Đã tự động tìm thấy Shop ID ZyPage: <strong>${resolvedShopId}</strong>`);
                } catch (error) {
                    console.error('ZyPage live connect error:', error);
                    this.log(`Kết nối tự động thất bại: ${error.message}`, 'system');
                    this.updateStatus('disconnected', 'Cần nhập Shop ID');
                    if (!autoReconnect) {
                        this.alert("Kết nối tự động thất bại. Vui lòng nhập Shop ID thủ công để kết nối trực tiếp.");
                    }
                    return null;
                }
            }

            const result = { input: normalizedInput, ...connection, shopId: resolvedShopId };
            await this.persistConnection(result);
            this.startListener(resolvedShopId, connection.token);
            return result;
        }
    }

    globalScope.ZyPageConnectionService = ZyPageConnectionService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageConnectionService;
})(typeof window !== 'undefined' ? window : globalThis);
