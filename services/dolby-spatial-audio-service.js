(function attachDolbySpatialAudioService(globalScope) {
    'use strict';

    class DolbySpatialAudioService {
        constructor(options = {}) {
            this.AudioContextClass = options.AudioContextClass
                || globalScope.AudioContext
                || globalScope.webkitAudioContext;
            this.logger = options.logger || console;
            this.ctx = null;
            this.sourceNode = null;
            this.subBassFilter = null;
            this.vocalClarityFilter = null;
            this.spatialAirFilter = null;
            this.spatialPanner = null;
            this.earlyReflectionsDelayLeft = null;
            this.earlyReflectionsDelayRight = null;
            this.earlyReflectionsGain = null;
            this.dynamicCompressor = null;
            this.masterGain = null;
            this.isInitialized = false;
            this.isEnabled = true;
        }

        init(audioElement) {
            if (this.isInitialized || !audioElement || !this.AudioContextClass) return false;
            try {
                this.ctx = new this.AudioContextClass();
                this.sourceNode = this.ctx.createMediaElementSource(audioElement);
                this.subBassFilter = this.createFilter('lowshelf', 90, 3.2);
                this.vocalClarityFilter = this.createFilter('peaking', 2800, 2.2, 1.2);
                this.spatialAirFilter = this.createFilter('highshelf', 11000, 2.5);

                if (typeof this.ctx.createStereoPanner === 'function') {
                    this.spatialPanner = this.ctx.createStereoPanner();
                    this.spatialPanner.pan.value = 0;
                }

                this.earlyReflectionsDelayLeft = this.ctx.createDelay();
                this.earlyReflectionsDelayLeft.delayTime.value = 0.014;
                this.earlyReflectionsDelayRight = this.ctx.createDelay();
                this.earlyReflectionsDelayRight.delayTime.value = 0.028;
                this.earlyReflectionsGain = this.ctx.createGain();
                this.earlyReflectionsGain.gain.value = 0.18;

                this.dynamicCompressor = this.ctx.createDynamicsCompressor();
                Object.assign(this.dynamicCompressor.threshold, { value: -18 });
                Object.assign(this.dynamicCompressor.knee, { value: 12 });
                Object.assign(this.dynamicCompressor.ratio, { value: 3.5 });
                Object.assign(this.dynamicCompressor.attack, { value: 0.005 });
                Object.assign(this.dynamicCompressor.release, { value: 0.15 });
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 1;

                this.sourceNode.connect(this.subBassFilter);
                this.subBassFilter.connect(this.vocalClarityFilter);
                this.vocalClarityFilter.connect(this.spatialAirFilter);
                this.spatialAirFilter.connect(this.earlyReflectionsDelayLeft);
                this.earlyReflectionsDelayLeft.connect(this.earlyReflectionsGain);
                this.earlyReflectionsGain.connect(this.dynamicCompressor);
                if (this.spatialPanner) {
                    this.spatialAirFilter.connect(this.spatialPanner);
                    this.spatialPanner.connect(this.dynamicCompressor);
                } else {
                    this.spatialAirFilter.connect(this.dynamicCompressor);
                }
                this.dynamicCompressor.connect(this.masterGain);
                this.masterGain.connect(this.ctx.destination);
                this.isInitialized = true;
                return true;
            } catch (error) {
                this.logger.warn('Không thể khởi tạo Dolby Spatial Audio:', error);
                return false;
            }
        }

        createFilter(type, frequency, gain, q) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = type;
            filter.frequency.value = frequency;
            filter.gain.value = gain;
            if (q != null) filter.Q.value = q;
            return filter;
        }

        resume() {
            if (this.ctx?.state === 'suspended') return this.ctx.resume();
        }

        setEnabled(enabled) {
            this.isEnabled = Boolean(enabled);
            if (!this.isInitialized) return this.isEnabled;
            this.subBassFilter.gain.value = this.isEnabled ? 3.2 : 0;
            this.vocalClarityFilter.gain.value = this.isEnabled ? 2.2 : 0;
            this.spatialAirFilter.gain.value = this.isEnabled ? 2.5 : 0;
            this.earlyReflectionsGain.gain.value = this.isEnabled ? 0.18 : 0;
            return this.isEnabled;
        }
    }

    globalScope.DolbySpatialAudioService = DolbySpatialAudioService;
    if (typeof module !== 'undefined' && module.exports) module.exports = DolbySpatialAudioService;
})(typeof window !== 'undefined' ? window : globalThis);
