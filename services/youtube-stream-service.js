(function attachYouTubeStreamService(globalScope) {
    'use strict';

    class YouTubeStreamResolutionError extends Error {
        constructor(code, message, statusCode = 502, details = []) {
            super(message);
            this.name = 'YouTubeStreamResolutionError';
            this.code = code;
            this.statusCode = statusCode;
            this.details = details;
        }
    }

    class YouTubeStreamService {
        constructor(options = {}) {
            const nodeRequire = typeof require === 'function' ? require : null;
            this.spawnImpl = options.spawnImpl
                || (nodeRequire ? nodeRequire('child_process').spawn : null);
            this.fsImpl = options.fsImpl
                || (nodeRequire ? nodeRequire('fs') : null);
            this.getYtDlpPath = options.getYtDlpPath || (() => '');
            this.nodeRuntimePath = options.nodeRuntimePath
                || (typeof process !== 'undefined' ? process.execPath : '');
            this.processEnv = options.processEnv
                || (typeof process !== 'undefined' ? process.env : {});
            this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || 25000);
            this.attempts = options.attempts || [
                { name: 'default-audio' },
                // tv_embedded không cần PO Token và dùng được cookie tài khoản.
                { name: 'tv-embedded-audio', extractorArgs: 'youtube:player_client=tv_embedded' },
                { name: 'web-creator-audio', extractorArgs: 'youtube:player_client=web_creator' },
                { name: 'web-music-audio', extractorArgs: 'youtube:player_client=web_music' },
                { name: 'web-safari-audio', extractorArgs: 'youtube:player_client=web_safari' },
                { name: 'tv-downgraded-audio', extractorArgs: 'youtube:player_client=tv_downgraded' }
            ];
        }

        static classifyFailure(message, resolver = '') {
            const normalized = String(message || '').toLowerCase();
            if (normalized.includes('drm protected')) {
                // YouTube đang A/B test DRM trên client TV, có thể báo DRM cho
                // video mà web vẫn phát bình thường. Không coi kết quả này là
                // bằng chứng video thực sự có DRM.
                if (resolver.startsWith('tv') || resolver.startsWith('default')) {
                    return { code: 'tv_client_drm', statusCode: 502 };
                }
                return { code: 'drm_protected', statusCode: 422 };
            }
            if (normalized.includes('playback on other websites has been disabled')
                || normalized.includes('embedding disabled')
                || normalized.includes('blocked it from display on this website or application')) {
                return { code: 'embedding_disabled', statusCode: 422 };
            }
            if (normalized.includes('sign in to confirm you') && normalized.includes('not a bot')) {
                return { code: 'authentication_required', statusCode: 502 };
            }
            if (normalized.includes('requested format is not available')) {
                return { code: 'format_unavailable', statusCode: 422 };
            }
            if (normalized.includes('timed out')) {
                return { code: 'resolver_timeout', statusCode: 504 };
            }
            return { code: 'yt_dlp_failed', statusCode: 502 };
        }

        static serializeNetscapeCookies(cookies = []) {
            const lines = ['# Netscape HTTP Cookie File'];
            for (const cookie of cookies) {
                const domain = String(cookie?.domain || '').trim();
                const name = String(cookie?.name || '').replace(/[\t\r\n]/g, '');
                const value = String(cookie?.value || '').replace(/[\t\r\n]/g, '');
                if (!domain || !name) continue;
                const httpOnlyPrefix = cookie.httpOnly ? '#HttpOnly_' : '';
                const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                const secure = cookie.secure ? 'TRUE' : 'FALSE';
                const expires = Number.isFinite(Number(cookie.expirationDate))
                    ? Math.max(0, Math.floor(Number(cookie.expirationDate)))
                    : 0;
                lines.push([
                    `${httpOnlyPrefix}${domain}`,
                    includeSubdomains,
                    cookie.path || '/',
                    secure,
                    expires,
                    name,
                    value
                ].join('\t'));
            }
            return lines.length > 1 ? `${lines.join('\n')}\n` : '';
        }

        async resolve(videoId, options = {}) {
            const normalizedVideoId = String(videoId || '').trim();
            if (!/^[A-Za-z0-9_-]{6,20}$/.test(normalizedVideoId)) {
                throw new YouTubeStreamResolutionError(
                    'invalid_video_id',
                    'Invalid YouTube video ID',
                    400
                );
            }

            const ytDlpPath = this.getYtDlpPath();
            if (!ytDlpPath || !this.fsImpl?.existsSync(ytDlpPath)) {
                throw new YouTubeStreamResolutionError(
                    'yt_dlp_not_ready',
                    'yt-dlp.exe is not ready',
                    503
                );
            }

            // Hai client yt-dlp chạy cạnh tranh. DirectStream hiếm khi được gọi,
            // nên đổi một ít CPU lấy việc không phải chờ tuần tự 2 lần network.
            const controllers = this.attempts.map(() => new AbortController());
            const abortAll = exceptIndex => controllers.forEach((controller, index) => {
                if (index !== exceptIndex && !controller.signal.aborted) controller.abort();
            });
            const onExternalAbort = () => abortAll(-1);
            if (options.signal?.aborted) onExternalAbort();
            else options.signal?.addEventListener?.('abort', onExternalAbort, { once: true });

            let failures = [];
            try {
                const attemptPromises = this.attempts.map((attempt, index) =>
                    this.runAttempt(
                        ytDlpPath,
                        normalizedVideoId,
                        attempt,
                        controllers[index].signal,
                        options.cookiesFilePath
                    ).then(url => ({ url, resolver: attempt.name, index }))
                        .catch(error => Promise.reject({
                            resolver: attempt.name,
                            message: error?.message || String(error)
                        }))
                );
                const result = await Promise.any(attemptPromises);
                abortAll(result.index);
                // Chờ các tiến trình vừa abort đóng handle trước khi Main xóa
                // file cookie tạm trên Windows.
                await Promise.allSettled(attemptPromises);
                return { success: true, url: result.url, resolver: result.resolver };
            } catch (error) {
                failures = Array.isArray(error?.errors)
                    ? error.errors
                    : [{ resolver: 'unknown', message: error?.message || String(error) }];
            } finally {
                options.signal?.removeEventListener?.('abort', onExternalAbort);
            }

            const priority = [
                'authentication_required',
                'embedding_disabled',
                'format_unavailable',
                'drm_protected',
                'tv_client_drm',
                'resolver_timeout',
                'yt_dlp_failed'
            ];
            const classified = failures.map(item => ({
                ...YouTubeStreamService.classifyFailure(item.message, item.resolver),
                resolver: item.resolver,
                message: item.message
            }));
            const selected = priority
                .map(code => classified.find(item => item.code === code))
                .find(Boolean)
                || { code: 'yt_dlp_failed', statusCode: 502, message: 'yt-dlp failed' };

            const finalError = new YouTubeStreamResolutionError(
                selected.code,
                selected.message,
                selected.statusCode,
                classified
            );
            throw finalError;
        }

        runAttempt(ytDlpPath, videoId, attempt = {}, signal, cookiesFilePath = '') {
            if (!this.spawnImpl) {
                return Promise.reject(new Error('Process spawning is unavailable'));
            }

            return new Promise((resolve, reject) => {
                const args = [
                    '--no-playlist',
                    '--no-warnings',
                    '--no-progress'
                ];
                if (this.nodeRuntimePath) {
                    // yt-dlp 2026 cần JavaScript runtime để giải n/sig challenge.
                    // Electron chạy như Node nhờ ELECTRON_RUN_AS_NODE, vì vậy bản
                    // đóng gói không phụ thuộc Node được cài riêng trên máy.
                    args.push('--js-runtimes', `node:${this.nodeRuntimePath}`);
                }
                if (cookiesFilePath) {
                    args.push('--cookies', cookiesFilePath);
                }
                if (attempt.extractorArgs) {
                    args.push('--extractor-args', attempt.extractorArgs);
                }
                args.push(
                    '-g',
                    // Chỉ nhận URL media HTTPS trực tiếp. web_safari đôi khi trả
                    // manifest HLS nhanh hơn web_creator; chọn kết quả đó theo race
                    // khiến OBS/hls.js lỗi dù audio WebM/M4A trực tiếp vẫn tồn tại.
                    // Nếu không có audio-only, cho phép luồng ghép HTTPS có audio.
                    '-f', 'bestaudio[protocol=https]/bestaudio*[protocol=https]',
                    `https://www.youtube.com/watch?v=${videoId}`
                );

                const child = this.spawnImpl(ytDlpPath, args, {
                    env: {
                        ...this.processEnv,
                        ELECTRON_RUN_AS_NODE: '1'
                    }
                });
                let stdout = '';
                let stderr = '';
                let settled = false;

                const finish = (error, value) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    if (signal && typeof signal.removeEventListener === 'function') {
                        signal.removeEventListener('abort', onAbort);
                    }
                    if (error) reject(error);
                    else resolve(value);
                };
                const onAbort = () => {
                    try { child.kill(); } catch (_) { }
                    finish(new Error('DirectStream request was aborted'));
                };
                const timer = setTimeout(() => {
                    try { child.kill(); } catch (_) { }
                    finish(new Error(`yt-dlp resolver timed out after ${this.timeoutMs}ms`));
                }, this.timeoutMs);

                child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
                child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
                child.on('error', error => finish(error));
                child.on('close', code => {
                    if (code !== 0) {
                        finish(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
                        return;
                    }
                    const url = stdout
                        .split(/\r?\n/)
                        .map(line => line.trim())
                        .find(line => /^https?:\/\//i.test(line));
                    if (!url) {
                        finish(new Error(stderr.trim() || 'yt-dlp returned no playable stream URL'));
                        return;
                    }
                    finish(null, url);
                });

                if (signal?.aborted) onAbort();
                else if (signal && typeof signal.addEventListener === 'function') {
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });
        }
    }

    globalScope.YouTubeStreamService = YouTubeStreamService;
    globalScope.YouTubeStreamResolutionError = YouTubeStreamResolutionError;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { YouTubeStreamService, YouTubeStreamResolutionError };
    }
})(typeof window !== 'undefined' ? window : globalThis);
