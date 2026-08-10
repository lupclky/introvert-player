(function attachDashboardDonationHistoryService(globalScope) {
    'use strict';

    class DashboardDonationHistoryService {
        constructor(options = {}) {
            this.api = options.api || globalScope.electronAPI || {};
            this.storage = options.storage || globalScope.localStorage;
            this.now = options.now || Date.now;
            this.historyKey = options.historyKey || 'dua_donation_history';
            this.migrationKey = options.migrationKey || 'dua_donation_history_migrated';
            this.retentionMs = options.retentionMs || 30 * 24 * 60 * 60 * 1000;
        }

        get usesDatabase() {
            return typeof this.api.dbGetDonations === 'function';
        }

        readLocal() {
            try {
                const parsed = JSON.parse(this.storage?.getItem(this.historyKey) || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }

        writeLocal(history) {
            this.storage?.setItem(this.historyKey, JSON.stringify(history || []));
        }

        async list() {
            if (this.usesDatabase) return await this.api.dbGetDonations();
            const cutoff = this.now() - this.retentionMs;
            return this.readLocal().filter(item => Number(item.timestamp || 0) >= cutoff);
        }

        async add(donation) {
            if (typeof this.api.dbAddDonation === 'function') return await this.api.dbAddDonation(donation);
            const history = this.readLocal();
            const existing = history.find(item => (
                item.id === donation.id
                || (item.name === donation.name
                    && Number(item.amount) === Number(donation.amount)
                    && Math.abs(Number(item.timestamp || 0) - Number(donation.timestamp || 0)) < 5000)
            ));
            if (existing) {
                if (donation.songLink && !existing.songLink) {
                    existing.songLink = donation.songLink;
                    existing.isMusicOrder = true;
                    this.writeLocal(history);
                    return { success: true, inserted: false, updated: true };
                }
                return { success: true, inserted: false, updated: false };
            }

            const timestamp = donation.timestamp || this.now();
            const cutoff = this.now() - this.retentionMs;
            const next = [{ ...donation, timestamp, isNew: true }, ...history]
                .filter(item => Number(item.timestamp || 0) >= cutoff);
            this.writeLocal(next);
            return { success: true, inserted: true, updated: false };
        }

        async migrate() {
            if (typeof this.api.dbAddDonation !== 'function') return { migrated: false, count: 0 };
            if (this.storage?.getItem(this.migrationKey) === 'true') return { migrated: false, count: 0 };
            let count = 0;
            try {
                const history = this.readLocal().sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
                for (const item of history) {
                    await this.api.dbAddDonation(item);
                    count++;
                }
                return { migrated: true, count };
            } finally {
                this.storage?.setItem(this.migrationKey, 'true');
            }
        }

        async markRead(id) {
            if (typeof this.api.dbMarkRead === 'function') return this.api.dbMarkRead(id);
            const history = this.readLocal();
            const item = history.find(entry => entry.id === id);
            if (item) {
                item.isNew = false;
                this.writeLocal(history);
            }
        }

        async markAllRead() {
            if (typeof this.api.dbMarkAllRead === 'function') return this.api.dbMarkAllRead();
            const history = this.readLocal();
            let changed = false;
            history.forEach(item => {
                if (item.isNew) {
                    item.isNew = false;
                    changed = true;
                }
            });
            if (changed) this.writeLocal(history);
        }

        async clear() {
            if (typeof this.api.dbClearHistory === 'function') return this.api.dbClearHistory();
            this.writeLocal([]);
        }
    }

    globalScope.DashboardDonationHistoryService = DashboardDonationHistoryService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DashboardDonationHistoryService;
})(typeof window !== 'undefined' ? window : globalThis);
