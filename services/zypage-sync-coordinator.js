(function attachZyPageSyncCoordinator(globalScope) {
    'use strict';

    class ZyPageSyncCoordinator {
        constructor() {
            this.running = false;
            this.pending = null;
        }

        begin(request) {
            if (this.running) {
                this.pending = request;
                return false;
            }
            this.running = true;
            return true;
        }

        finish() {
            this.running = false;
            const pending = this.pending;
            this.pending = null;
            return pending;
        }

        reset() {
            this.running = false;
            this.pending = null;
        }
    }

    globalScope.ZyPageSyncCoordinator = ZyPageSyncCoordinator;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageSyncCoordinator;
})(typeof window !== 'undefined' ? window : globalThis);
