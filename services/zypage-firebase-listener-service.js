(function attachZyPageFirebaseListenerService(globalScope) {
    'use strict';

    class ZyPageFirebaseListenerService {
        constructor(options = {}) {
            this.firebase = options.firebase || globalScope.firebase;
            this.config = options.config || globalScope.DEFAULT_FIREBASE_CONFIG;
            this.rootPath = options.rootPath || 'ZYPAGE';
            this.activeRef = null;
            this.activeHandler = null;
        }

        ensureInitialized() {
            if (!this.firebase) throw new Error('Firebase SDK chưa được tải.');
            const apps = this.firebase.apps || [];
            if (!apps.some(app => app.name === '[DEFAULT]')) {
                const config = this.config || globalScope.DEFAULT_FIREBASE_CONFIG;
                if (!config) throw new Error('Thiếu cấu hình Firebase dùng chung.');
                this.firebase.initializeApp(config);
                this.config = config;
            }
        }

        subscribe({ token, onSnapshot = () => {}, onEvent = () => {} } = {}) {
            if (!token) throw new Error('Thiếu ZyPage token để đăng ký Firebase.');
            this.ensureInitialized();
            this.unsubscribe();

            this.activeRef = this.firebase.database()
                .ref(this.rootPath)
                .child(`Page/Donate/${token}`);

            let isInitialSnapshot = true;
            this.activeHandler = async snapshot => {
                const value = snapshot?.val?.();
                if (!value) return;
                onSnapshot(value, isInitialSnapshot);
                if (isInitialSnapshot) {
                    isInitialSnapshot = false;
                    return;
                }
                await onEvent(value);
            };

            this.activeRef.on('value', this.activeHandler);
            return this.activeRef;
        }

        unsubscribe() {
            if (!this.activeRef) return;
            if (this.activeHandler) this.activeRef.off('value', this.activeHandler);
            else this.activeRef.off();
            this.activeRef = null;
            this.activeHandler = null;
        }
    }

    globalScope.ZyPageFirebaseListenerService = ZyPageFirebaseListenerService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ZyPageFirebaseListenerService;
})(typeof window !== 'undefined' ? window : globalThis);
