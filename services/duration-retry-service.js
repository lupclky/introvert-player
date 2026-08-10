(function attachDurationRetryService(globalScope) {
    'use strict';

    class DurationRetryService {
        constructor(options = {}) {
            this.setTimer = options.setTimer || ((callback, delay) => globalScope.setTimeout(callback, delay));
            this.clearTimer = options.clearTimer || (timer => globalScope.clearTimeout(timer));
            this.delays = options.delays || [1500, 3000, 5000, 10000, 15000];
            this.maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
            this.jobs = new Map();
        }

        ensure(key, options = {}) {
            const normalizedKey = String(key ?? '');
            if (!normalizedKey || this.jobs.has(normalizedKey)) return false;
            const job = { key: normalizedKey, attempts: 0, timer: null, options };
            this.jobs.set(normalizedKey, job);
            this.run(job);
            return true;
        }

        async run(job) {
            if (!this.jobs.has(job.key)) return;
            if (job.options.isActive && !job.options.isActive()) {
                this.cancel(job.key);
                return;
            }

            job.attempts += 1;
            try {
                const result = await job.options.load();
                job.options.onResult?.(result, job.attempts);
                if (Number(result?.duration) > 0) {
                    this.jobs.delete(job.key);
                    job.options.onResolved?.(result, job.attempts);
                    return;
                }
            } catch (error) {
                job.options.onError?.(error, job.attempts);
            }

            if (!this.jobs.has(job.key)) return;
            const maxAttempts = Math.max(1, Number(job.options.maxAttempts) || this.maxAttempts);
            if (job.attempts >= maxAttempts) {
                this.jobs.delete(job.key);
                job.options.onExhausted?.(job.attempts);
                return;
            }
            const delay = this.delays[Math.min(job.attempts - 1, this.delays.length - 1)];
            job.timer = this.setTimer(() => this.run(job), delay);
        }

        cancel(key) {
            const normalizedKey = String(key ?? '');
            const job = this.jobs.get(normalizedKey);
            if (!job) return false;
            if (job.timer != null) this.clearTimer(job.timer);
            this.jobs.delete(normalizedKey);
            return true;
        }
    }

    globalScope.DurationRetryService = DurationRetryService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DurationRetryService;
})(typeof window !== 'undefined' ? window : globalThis);
