(function attachDashboardNotificationService(globalScope) {
    'use strict';
    class DashboardNotificationService {
        constructor(options = {}) {
            this.storage = options.storage || globalScope.localStorage;
            this.historyKey = options.historyKey || 'dua_notifications_history';
            this.unreadKey = options.unreadKey || 'dua_unread_notifications_count';
            this.limit = options.limit || 30;
            this.items = [];
            this.unreadCount = 0;
        }
        load() {
            try {
                const parsed = JSON.parse(this.storage?.getItem(this.historyKey) || '[]');
                this.items = Array.isArray(parsed) ? parsed.slice(0, this.limit) : [];
                this.unreadCount = Math.max(0, Number(this.storage?.getItem(this.unreadKey)) || 0);
            } catch (_) { this.items = []; this.unreadCount = 0; }
            return this.snapshot();
        }
        save() {
            this.storage?.setItem(this.historyKey, JSON.stringify(this.items));
            this.storage?.setItem(this.unreadKey, this.unreadCount);
        }
        snapshot() { return { items: this.items, unreadCount: this.unreadCount }; }
        add(notification) {
            const item = { ...notification, unread: true };
            this.items.unshift(item);
            this.items = this.items.slice(0, this.limit);
            this.unreadCount++;
            this.save(); return item;
        }
        markRead(notification) {
            const item = typeof notification === 'object' ? notification : this.items.find(entry => entry.id === notification);
            if (item?.unread) { item.unread = false; this.unreadCount = Math.max(0, this.unreadCount - 1); this.save(); }
        }
        markAllRead() {
            this.items.forEach(item => { item.unread = false; });
            this.unreadCount = 0; this.save();
        }
        clear() { this.items = []; this.unreadCount = 0; this.save(); }
    }
    globalScope.DashboardNotificationService = DashboardNotificationService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DashboardNotificationService;
})(typeof window !== 'undefined' ? window : globalThis);
