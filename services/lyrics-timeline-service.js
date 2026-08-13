(function attachLyricsTimelineService(globalScope) {
    'use strict';

    class LyricsTimelineService {
        constructor(options = {}) {
            const beforeCount = Number(options.beforeCount);
            const afterCount = Number(options.afterCount);
            this.beforeCount = Math.max(0, Number.isFinite(beforeCount) ? beforeCount : 1);
            this.afterCount = Math.max(0, Number.isFinite(afterCount) ? afterCount : 1);
        }

        normalizeLines(lines) {
            if (!Array.isArray(lines)) return [];
            const result = lines
                .map(line => ({
                    time: Math.max(0, Number(line?.time) || 0),
                    text: String(line?.text || '').trim(),
                    ...(line?.originalText ? { originalText: String(line.originalText).trim() } : {}),
                    ...(line?.isWaitingDots ? { isWaitingDots: true } : {})
                }))
                .filter(line => line.text || line.isWaitingDots)
                .sort((left, right) => left.time - right.time);

            const finalResult = [];
            if (result.length > 0 && result[0].time > 5 && !result[0].isWaitingDots) {
                finalResult.push({ time: 0, text: '', isWaitingDots: true });
            }

            for (let i = 0; i < result.length; i++) {
                finalResult.push(result[i]);
                if (i < result.length - 1) {
                    const currentLine = result[i];
                    const nextLine = result[i + 1];
                    const gap = nextLine.time - currentLine.time;
                    if (gap > 10 && !nextLine.isWaitingDots && !currentLine.isWaitingDots) {
                        const dotsStartTime = Math.min(currentLine.time + 5, nextLine.time - 5);
                        finalResult.push({ time: dotsStartTime, text: '', isWaitingDots: true });
                    }
                }
            }
            return finalResult;
        }

        findActiveIndex(lines, currentTime) {
            const normalized = this.normalizeLines(lines);
            if (!normalized.length) return -1;
            const time = Math.max(0, Number(currentTime) || 0);
            let low = 0;
            let high = normalized.length - 1;
            let result = time >= normalized[0].time ? 0 : -1;
            while (low <= high) {
                const middle = Math.floor((low + high) / 2);
                if (normalized[middle].time <= time + 0.03) {
                    result = middle;
                    low = middle + 1;
                } else {
                    high = middle - 1;
                }
            }
            return result;
        }

        getWindow(lines, currentTime) {
            const normalized = this.normalizeLines(lines);
            const activeIndex = this.findActiveIndex(normalized, currentTime);
            const anchorIndex = activeIndex >= 0 ? activeIndex : 0;
            const windowSize = this.beforeCount + this.afterCount + 1;
            const maximumStart = Math.max(0, normalized.length - windowSize);
            const start = Math.min(maximumStart, Math.max(0, anchorIndex - this.beforeCount));
            const end = Math.min(normalized.length, start + windowSize);
            return {
                activeIndex,
                lines: normalized.slice(start, end).map((line, offset) => ({
                    ...line,
                    index: start + offset,
                    active: start + offset === activeIndex,
                    upcoming: activeIndex < 0 || start + offset > activeIndex
                }))
            };
        }
    }

    globalScope.LyricsTimelineService = LyricsTimelineService;
    if (typeof module !== 'undefined' && module.exports) module.exports = LyricsTimelineService;
})(typeof window !== 'undefined' ? window : globalThis);
