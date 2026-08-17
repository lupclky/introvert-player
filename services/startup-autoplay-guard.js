(function installStartupAutoplayGuard(globalScope) {
    'use strict';

    function sanitizeStartupMediaUrl(value) {
        if (typeof value !== 'string' || value.length === 0) return value;

        try {
            const url = new URL(value, 'https://localhost/');
            const hostname = String(url.hostname || '').toLowerCase();
            const pathname = String(url.pathname || '').toLowerCase();
            const isYouTubeEmbed = (
                hostname === 'youtube.com'
                || hostname.endsWith('.youtube.com')
                || hostname === 'youtube-nocookie.com'
                || hostname.endsWith('.youtube-nocookie.com')
            ) && pathname.startsWith('/embed/');
            const isSoundCloudPlayer = hostname === 'w.soundcloud.com'
                && pathname.startsWith('/player');

            if (isYouTubeEmbed && url.searchParams.get('autoplay') === '1') {
                url.searchParams.set('autoplay', '0');
                return url.toString();
            }

            if (isSoundCloudPlayer) {
                const autoPlay = String(url.searchParams.get('auto_play') || '').toLowerCase();
                if (autoPlay === 'true' || autoPlay === '1') {
                    url.searchParams.set('auto_play', 'false');
                    return url.toString();
                }
            }
        } catch (_) { }

        if (/youtube(?:-nocookie)?\.com\/embed\//i.test(value)) {
            return value.replace(/([?&])autoplay=1(?=&|$)/i, '$1autoplay=0');
        }
        if (/w\.soundcloud\.com\/player\//i.test(value)) {
            return value.replace(/([?&])auto_play=(?:true|1)(?=&|$)/i, '$1auto_play=false');
        }
        return value;
    }

    function createSafeSoundCloudLoadOptions(options) {
        return { ...(options || {}), auto_play: false };
    }

    function installIframeGuard(scope) {
        const proto = scope?.HTMLIFrameElement?.prototype;
        if (!proto || proto.__duaStartupAutoplayGuardInstalled) return;

        try {
            Object.defineProperty(proto, '__duaStartupAutoplayGuardInstalled', {
                value: true,
                configurable: true
            });
        } catch (_) {
            return;
        }

        const nativeSetAttribute = proto.setAttribute;
        if (typeof nativeSetAttribute === 'function') {
            proto.setAttribute = function guardedSetAttribute(name, value) {
                if (String(name).toLowerCase() === 'src') value = sanitizeStartupMediaUrl(value);
                return nativeSetAttribute.call(this, name, value);
            };
        }

        const srcDescriptor = Object.getOwnPropertyDescriptor(proto, 'src');
        if (srcDescriptor?.get && srcDescriptor?.set && srcDescriptor.configurable !== false) {
            try {
                Object.defineProperty(proto, 'src', {
                    ...srcDescriptor,
                    set(value) {
                        srcDescriptor.set.call(this, sanitizeStartupMediaUrl(value));
                    }
                });
            } catch (_) { }
        }
    }

    function patchSoundCloudWidgetFactory(scope) {
        const widgetFactory = scope?.SC?.Widget;
        if (typeof widgetFactory !== 'function' || widgetFactory.__duaStartupAutoplayGuardInstalled) return false;

        const guardedFactory = function guardedSoundCloudWidgetFactory(...args) {
            const widget = widgetFactory.apply(this, args);
            if (widget && typeof widget.load === 'function' && !widget.__duaStartupAutoplayGuardInstalled) {
                const nativeLoad = widget.load;
                widget.load = function guardedSoundCloudLoad(trackUrl, options) {
                    return nativeLoad.call(this, trackUrl, createSafeSoundCloudLoadOptions(options));
                };
                try {
                    Object.defineProperty(widget, '__duaStartupAutoplayGuardInstalled', {
                        value: true,
                        configurable: true
                    });
                } catch (_) { }
            }
            return widget;
        };

        try {
            Object.getOwnPropertyNames(widgetFactory).forEach(key => {
                if (['length', 'name', 'prototype'].includes(key)) return;
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(widgetFactory, key);
                    if (descriptor) Object.defineProperty(guardedFactory, key, descriptor);
                } catch (_) { }
            });
            Object.defineProperty(guardedFactory, '__duaStartupAutoplayGuardInstalled', {
                value: true,
                configurable: true
            });
            scope.SC.Widget = guardedFactory;
            return true;
        } catch (_) {
            return false;
        }
    }

    function installSoundCloudGuard(scope) {
        if (!scope?.document) return;
        patchSoundCloudWidgetFactory(scope);
        if (typeof scope.document.addEventListener !== 'function') return;

        scope.document.addEventListener('load', event => {
            const target = event?.target;
            if (!target || String(target.tagName || '').toUpperCase() !== 'SCRIPT') return;
            if (!/w\.soundcloud\.com\/player\/api\.js/i.test(String(target.src || ''))) return;
            patchSoundCloudWidgetFactory(scope);
        }, true);
    }

    installIframeGuard(globalScope);
    installSoundCloudGuard(globalScope);

    globalScope.StartupAutoplayGuard = {
        sanitizeStartupMediaUrl,
        createSafeSoundCloudLoadOptions
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = globalScope.StartupAutoplayGuard;
    }
})(typeof window !== 'undefined' ? window : globalThis);
