(function attachQuickAddUiController(g) {
    'use strict';
    class QuickAddUiController {
        constructor(o = {}) {
            this.document = o.document || g.document;
            this.searchTimeout = null;
            this.pendingRequests = new Map(); // Map<key: string, controller: AbortController>
        }
        readOptions() {
            const d = this.document;
            const name = d?.getElementById('quick-donor-name');
            const amount = d?.getElementById('quick-donor-amount');
            const owner = d?.getElementById('quick-owner-add');
            return { donorName: name?.value.trim() || 'Dương Thiếu Ngủ', amount: amount?.value.trim() !== '' ? Number(amount.value) : 100000000, isOwnerAdd: Boolean(owner?.checked) };
        }
        clear() {
            const d = this.document;
            for (const id of ['donor-url', 'quick-donor-name', 'quick-donor-amount']) {
                const e = d?.getElementById(id);
                if (e) e.value = '';
            }
            const results = d?.getElementById('quick-add-search-results');
            if (results) {
                results.style.display = 'none';
                results.innerHTML = '';
            }
            d?.getElementById('quick-add-popover')?.classList.remove('visible');
            this.cancelAllQuickAddSearches();
        }
        cancelAllQuickAddSearches() {
            for (const controller of this.pendingRequests.values()) {
                controller.abort();
            }
            this.pendingRequests.clear();
        }
        showStatus(html, tone = 'normal') {
            const e = this.document?.getElementById('quick-add-search-results');
            if (!e) return;
            e.style.display = 'flex';
            e.dataset.tone = tone;
            e.innerHTML = html;
        }
    } g.QuickAddUiController = QuickAddUiController;
    if (typeof module !== 'undefined' && module.exports) module.exports = QuickAddUiController;
})(typeof window !== 'undefined' ? window : globalThis);
