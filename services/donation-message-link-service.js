(function attachDonationMessageLinkService(globalScope) {
    'use strict';

    class DonationMessageLinkService {
        constructor(options = {}) {
            this.parseYoutubeId = options.parseYoutubeId || (() => null);
        }

        getUrls(message) {
            if (!message) return [];
            return String(message).match(/https?:\/\/[^\s<>"']+/gi) || [];
        }

        isSongUrl(url) {
            const value = String(url || '');
            return value.includes('soundcloud.com') || Boolean(this.parseYoutubeId(value));
        }

        hasSongLink(message) {
            return this.getUrls(message).some(url => this.isSongUrl(url));
        }

        extractSongLink(message) {
            return this.getUrls(message).find(url => this.isSongUrl(url)) || null;
        }

        formatMessageWithLinks(message) {
            if (!message) return '';
            const escapedMessage = String(message)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

            return escapedMessage.replace(/https?:\/\/[^\s<>"']+/gi, url =>
                `<a href="${url}" target="_blank" onclick="event.stopPropagation()" style="color: var(--pineapple-orange); text-decoration: underline;">${url}</a>`
            );
        }
    }

    globalScope.DonationMessageLinkService = DonationMessageLinkService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DonationMessageLinkService;
})(typeof window !== 'undefined' ? window : globalThis);
