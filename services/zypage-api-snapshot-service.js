(function attachZyPageApiSnapshotService(globalScope) {
    'use strict';

    class ZyPageApiSnapshotService {
        constructor(options = {}) {
            this.fetchPage = options.fetchPage;
            this.now = options.now || Date.now;
        }

        buildUrl(domain, shopId) {
            const origin = String(domain || 'https://zypage.com').replace(/\/$/, '');
            return `${origin}/api/get_data_by_id?table=shop&data=donate&id=${encodeURIComponent(shopId)}&v=${this.now()}`;
        }

        parseContents(rawContents) {
            const contents = typeof rawContents === 'string' ? JSON.parse(rawContents) : rawContents;
            let shopData = contents?.data || {};
            if (typeof shopData === 'string') shopData = JSON.parse(shopData);

            let donate = shopData?.donate || {};
            if (typeof donate === 'string') {
                try {
                    donate = JSON.parse(donate);
                } catch (_) {
                    donate = {};
                }
            }

            const musicList = donate?.music?.list || {};
            const plainDonateList = donate?.list || {};
            return {
                contents,
                shopData,
                donate,
                musicList,
                plainDonateList,
                musicKeys: Object.keys(musicList),
                plainKeys: Object.keys(plainDonateList)
            };
        }

        async fetchSnapshot({ domain, shopId }) {
            if (typeof this.fetchPage !== 'function') throw new Error('Thiếu hàm tải dữ liệu ZyPage.');
            const url = this.buildUrl(domain, shopId);
            const response = await this.fetchPage(url);
            if (!response?.contents) throw new Error('Không nhận được nội dung từ ZyPage.');
            return { url, ...this.parseContents(response.contents) };
        }
    }

    globalScope.ZyPageApiSnapshotService = ZyPageApiSnapshotService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageApiSnapshotService;
})(typeof window !== 'undefined' ? window : globalThis);
