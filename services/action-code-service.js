(function attachActionCodeService(globalScope) {
    'use strict';

    class ActionCodeService {
        constructor(options = {}) {
            this.storage = options.storage || globalScope.localStorage;
            this.secret = options.secret || 'pineapple-studio-secret-key-2026';
            this.usedCodesKey = options.usedCodesKey || 'dua_used_codes';
            this.bonusActionsKey = options.bonusActionsKey || 'dua_bonus_actions';
        }

        sha256(ascii) {
            const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
            const maxWord = Math.pow(2, 32);
            const words = [];
            const asciiLength = ascii.length;
            const hash = [];
            const constants = [];
            const composites = {};
            for (let candidate = 2, count = 0; count < 64; candidate++) {
                if (composites[candidate]) continue;
                for (let multiple = 0; multiple < 313; multiple += candidate) composites[multiple] = 1;
                hash[count] = (Math.pow(candidate, 0.5) * maxWord) | 0;
                constants[count++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
            }
            ascii += '\x80';
            while (ascii.length % 64 - 56) ascii += '\x00';
            for (let index = 0; index < ascii.length; index++) {
                const code = ascii.charCodeAt(index);
                if (code >> 8) return undefined;
                words[index >> 2] |= code << ((3 - index % 4) * 8);
            }
            words[words.length] = ((asciiLength * 8) / maxWord) | 0;
            words[words.length] = (asciiLength * 8) | 0;

            let [h0, h1, h2, h3, h4, h5, h6, h7] = hash;
            for (let offset = 0; offset < words.length; offset += 16) {
                const w = words.slice(offset, offset + 16);
                const old = [h0, h1, h2, h3, h4, h5, h6, h7];
                for (let index = 0; index < 64; index++) {
                    if (index >= 16) {
                        const w15 = w[index - 15], w2 = w[index - 2];
                        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
                        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
                        w[index] = (w[index - 16] + s0 + w[index - 7] + s1) | 0;
                    }
                    const ch = (h4 & h5) ^ (~h4 & h6);
                    const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
                    const temp1 = (h7 + (rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25)) + ch + constants[index] + w[index]) | 0;
                    const temp2 = ((rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22)) + maj) | 0;
                    h7 = h6; h6 = h5; h5 = h4; h4 = (h3 + temp1) | 0;
                    h3 = h2; h2 = h1; h1 = h0; h0 = (temp1 + temp2) | 0;
                }
                h0 = (h0 + old[0]) | 0; h1 = (h1 + old[1]) | 0;
                h2 = (h2 + old[2]) | 0; h3 = (h3 + old[3]) | 0;
                h4 = (h4 + old[4]) | 0; h5 = (h5 + old[5]) | 0;
                h6 = (h6 + old[6]) | 0; h7 = (h7 + old[7]) | 0;
            }
            return [h0, h1, h2, h3, h4, h5, h6, h7]
                .map(value => (`00000000${(value >>> 0).toString(16)}`).slice(-8)).join('');
        }

        verify(code) {
            if (!code || typeof code !== 'string') return null;
            const parts = code.trim().toUpperCase().split('-');
            if (parts.length !== 4 || parts[0] !== 'ADD') return null;
            const amount = parseInt(parts[1], 10);
            const nonce = parts[2];
            const signature = parts[3];
            if (!Number.isFinite(amount) || amount <= 0 || !nonce || !signature) return null;
            const expected = this.sha256(`${amount}-${nonce}-${this.secret}`).slice(0, 12).toUpperCase();
            return signature === expected ? { amount, nonce, code: parts.join('-') } : null;
        }

        redeem(code) {
            const result = this.verify(code);
            if (!result) return { success: false, reason: 'invalid' };
            let usedCodes = [];
            try {
                const parsed = JSON.parse(this.storage?.getItem(this.usedCodesKey) || '[]');
                usedCodes = Array.isArray(parsed) ? parsed : [];
            } catch (_) {}
            if (usedCodes.includes(result.code)) return { success: false, reason: 'used', ...result };
            usedCodes.push(result.code);
            this.storage?.setItem(this.usedCodesKey, JSON.stringify(usedCodes));
            const current = Math.max(0, parseInt(this.storage?.getItem(this.bonusActionsKey) || '0', 10) || 0);
            const total = current + result.amount;
            this.storage?.setItem(this.bonusActionsKey, String(total));
            return { success: true, total, ...result };
        }
    }

    globalScope.ActionCodeService = ActionCodeService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ActionCodeService;
})(typeof window !== 'undefined' ? window : globalThis);
