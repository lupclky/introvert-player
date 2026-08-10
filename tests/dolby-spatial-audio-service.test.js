const test = require('node:test');
const assert = require('node:assert/strict');
const DolbySpatialAudioService = require('../services/dolby-spatial-audio-service');

function node(extra = {}) {
    return { connect() {}, ...extra };
}

class FakeAudioContext {
    constructor() { this.destination = {}; this.state = 'suspended'; }
    createMediaElementSource() { return node(); }
    createBiquadFilter() { return node({ frequency: {}, gain: {}, Q: {} }); }
    createStereoPanner() { return node({ pan: {} }); }
    createDelay() { return node({ delayTime: {} }); }
    createGain() { return node({ gain: {} }); }
    createDynamicsCompressor() {
        return node({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} });
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
}

test('Dolby service builds the audio graph once', () => {
    const service = new DolbySpatialAudioService({ AudioContextClass: FakeAudioContext });
    assert.equal(service.init({}), true);
    assert.equal(service.init({}), false);
    assert.equal(service.isInitialized, true);
    assert.equal(service.subBassFilter.frequency.value, 90);
    assert.equal(service.dynamicCompressor.threshold.value, -18);
});

test('Dolby service enables and disables DSP gains', () => {
    const service = new DolbySpatialAudioService({ AudioContextClass: FakeAudioContext });
    service.init({});
    service.setEnabled(false);
    assert.equal(service.subBassFilter.gain.value, 0);
    assert.equal(service.earlyReflectionsGain.gain.value, 0);
    service.setEnabled(true);
    assert.equal(service.vocalClarityFilter.gain.value, 2.2);
    assert.equal(service.spatialAirFilter.gain.value, 2.5);
});
