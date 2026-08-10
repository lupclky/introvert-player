(function attachViewCountPolicy(globalScope) {
    'use strict';

    function parseViewCount(value) {
        if (Number.isFinite(Number(value)) && String(value).trim() !== '') {
            return Math.max(0, Math.floor(Number(value)));
        }

        const text = String(value || '').trim().toLowerCase().replace(/\u00a0/g, ' ');
        if (!text) return null;

        let multiplier = 1;
        if (/\b(k|ngh[iì]n|ng[aà]n)\b/i.test(text) || /\d\s*k\b/i.test(text)) multiplier = 1e3;
        else if (/\b(m|tr|tri[eệ]u)\b/i.test(text) || /\d\s*m\b/i.test(text)) multiplier = 1e6;
        else if (/\b(b|t[yỷ])\b/i.test(text) || /\d\s*b\b/i.test(text)) multiplier = 1e9;

        const numberText = text.match(/[\d.,]+/)?.[0];
        if (!numberText) return null;

        if (multiplier === 1) {
            const digits = numberText.replace(/\D/g, '');
            return digits ? Math.max(0, Number(digits)) : null;
        }

        const normalized = numberText.replace(/,(?=\d{1,2}(?:\D|$))/g, '.').replace(/,(?!\d{1,2}(?:\D|$))/g, '');
        const parts = normalized.split('.');
        const numericText = parts.length > 2
            ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`
            : normalized;
        const parsed = Number(numericText);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed * multiplier)) : null;
    }

    function evaluateViewCount(value, minimum = 10000) {
        const count = parseViewCount(value);
        const threshold = Math.max(0, Math.floor(Number(minimum) || 0));
        return {
            accepted: threshold === 0 || (count !== null && count >= threshold),
            count,
            minimum: threshold,
            reason: count === null ? 'unknown_view_count' : (count < threshold ? 'below_minimum_views' : '')
        };
    }

    const api = { parseViewCount, evaluateViewCount };
    globalScope.ViewCountPolicy = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
