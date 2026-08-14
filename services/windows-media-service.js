(function attachWindowsMediaService(globalScope) {
    'use strict';

    class WindowsMediaService {
        constructor(options = {}) {
            this.mediaSession = options.mediaSession !== undefined
                ? options.mediaSession
                : (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null);
            this.MediaMetadata = options.MediaMetadata !== undefined
                ? options.MediaMetadata
                : (typeof window !== 'undefined' && 'MediaMetadata' in window ? window.MediaMetadata : null);

            this.onPlay = typeof options.onPlay === 'function' ? options.onPlay : () => {};
            this.onPause = typeof options.onPause === 'function' ? options.onPause : () => {};
            this.onNext = typeof options.onNext === 'function' ? options.onNext : () => {};
            this.onPrevious = typeof options.onPrevious === 'function' ? options.onPrevious : () => {};
            this.onSeek = typeof options.onSeek === 'function' ? options.onSeek : () => {};
            this.log = typeof options.log === 'function' ? options.log : () => {};

            this.audioKeeper = null;
            this.currentSong = null;
            this.isPlaying = false;
            this.isInitialized = false;
            this.isInternalSync = false;
        }

        initialize() {
            if (this.isInitialized) return;
            this.isInitialized = true;

            this._setupAudioKeeper();
            this._setupMediaSessionHandlers();
        }

        _setupMediaSessionHandlers() {
            if (!this.mediaSession || typeof this.mediaSession.setActionHandler !== 'function') return;

            const actions = [
                ['play', () => {
                    this.onPlay();
                }],
                ['pause', () => {
                    this.onPause();
                }],
                ['nexttrack', () => {
                    this.onNext();
                }],
                ['previoustrack', () => {
                    this.onPrevious();
                }],
                ['stop', () => {
                    this.onPause();
                }],
                ['seekto', (details) => {
                    this.onSeek(details);
                }]
            ];

            actions.forEach(([action, handler]) => {
                try {
                    this.mediaSession.setActionHandler(action, handler);
                } catch (e) {
                    this.log(`Action handler ${action} not supported: ${e.message}`);
                }
            });
        }

        _createSilentAudioSrc() {
            try {
                const sampleRate = 8000;
                const durationSeconds = 3;
                const numChannels = 1;
                const bytesPerSample = 2;
                const dataSize = durationSeconds * sampleRate * bytesPerSample;
                const buffer = new ArrayBuffer(44 + dataSize);
                const view = new DataView(buffer);

                // RIFF identifier
                view.setUint32(0, 0x52494646, false); // "RIFF"
                view.setUint32(4, 36 + dataSize, true);
                view.setUint32(8, 0x57415645, false); // "WAVE"

                // fmt subchunk
                view.setUint32(12, 0x666d7420, false); // "fmt "
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true); // PCM
                view.setUint16(22, numChannels, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
                view.setUint16(32, numChannels * bytesPerSample, true);
                view.setUint16(34, bytesPerSample * 8, true);

                // data subchunk
                view.setUint32(36, 0x64617461, false); // "data"
                view.setUint32(40, dataSize, true);

                const blob = new Blob([buffer], { type: 'audio/wav' });
                return URL.createObjectURL(blob);
            } catch (_) {
                return 'data:audio/wav;base64,UklGRqQ4AQBXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYA4AQAAAAAAAAAAAAAAAAAAAAAA';
            }
        }

        _setupAudioKeeper() {
            if (typeof document === 'undefined') return;
            try {
                let audio = document.getElementById('windows-media-audio-keeper');
                if (!audio) {
                    audio = document.createElement('audio');
                    audio.id = 'windows-media-audio-keeper';
                    audio.loop = true;
                    audio.preload = 'auto';
                    audio.src = this._createSilentAudioSrc();
                    audio.style.display = 'none';

                    // Lắng nghe sự kiện play/pause từ hệ thống OS
                    audio.addEventListener('pause', () => {
                        if (!this.isInternalSync && this.isPlaying) {
                            this.onPause();
                        }
                    });
                    audio.addEventListener('play', () => {
                        if (!this.isInternalSync && !this.isPlaying) {
                            this.onPlay();
                        }
                    });

                    document.body.appendChild(audio);
                }
                this.audioKeeper = audio;
            } catch (e) {
                this.log(`Failed to setup audio keeper: ${e.message}`);
            }
        }

        updateMetadata(song, isPlaying) {
            this.currentSong = song || null;
            this.isPlaying = Boolean(isPlaying);

            this._syncAudioKeeper();

            if (!this.mediaSession) return;

            if (!song) {
                this.mediaSession.playbackState = 'none';
                if (this.mediaSession.metadata) {
                    this.mediaSession.metadata = null;
                }
                return;
            }

            const title = song.title || 'Chưa có tên bài hát';
            const artist = song.author || song.channelName || (song.donorName ? `Donate bởi: ${song.donorName}` : 'Introvert Player');
            const album = song.donorName ? `Người donate: ${song.donorName}` : 'Introvert Player';
            const artwork = [];

            const thumb = song.thumbnailUrl || song.coverUrl || song.thumbnail;
            if (thumb) {
                artwork.push({
                    src: thumb,
                    sizes: '512x512',
                    type: 'image/jpeg'
                });
            }

            try {
                if (this.MediaMetadata) {
                    this.mediaSession.metadata = new this.MediaMetadata({
                        title: title,
                        artist: artist,
                        album: album,
                        artwork: artwork
                    });
                }
            } catch (e) {
                this.log(`Failed to set media metadata: ${e.message}`);
            }

            try {
                this.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
            } catch (_) {}
        }

        updatePosition(currentTime, duration) {
            if (!this.mediaSession || !this.mediaSession.setPositionState) return;
            const validDuration = Number(duration);
            const validPosition = Number(currentTime);
            if (Number.isFinite(validDuration) && validDuration > 0 && Number.isFinite(validPosition) && validPosition >= 0) {
                try {
                    this.mediaSession.setPositionState({
                        duration: Math.max(validPosition, validDuration),
                        playbackRate: 1,
                        position: Math.min(validPosition, validDuration)
                    });
                } catch (_) {}
            }
        }

        _syncAudioKeeper() {
            if (!this.audioKeeper) return;
            this.isInternalSync = true;
            try {
                if (this.isPlaying && this.currentSong) {
                    this.audioKeeper.play().catch(() => {});
                } else {
                    this.audioKeeper.pause();
                }
            } finally {
                setTimeout(() => {
                    this.isInternalSync = false;
                }, 50);
            }
        }

        handleMediaAction(action) {
            switch (action) {
                case 'play-pause':
                    if (this.isPlaying) this.onPause();
                    else this.onPlay();
                    break;
                case 'play':
                    this.onPlay();
                    break;
                case 'pause':
                case 'stop':
                    this.onPause();
                    break;
                case 'next-track':
                    this.onNext();
                    break;
                case 'previous-track':
                    this.onPrevious();
                    break;
            }
        }
    }

    globalScope.WindowsMediaService = WindowsMediaService;
    if (typeof module !== 'undefined' && module.exports) module.exports = WindowsMediaService;
})(typeof window !== 'undefined' ? window : globalThis);
