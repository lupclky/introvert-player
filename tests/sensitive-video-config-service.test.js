const test = require('node:test');
const assert = require('node:assert/strict');
const SensitiveVideoConfigService = require('../services/sensitive-video-config-service');

function storage(url) {
    return { getItem: () => url ?? null };
}

test('sensitive video config loads through proxy and returns valid video IDs', async () => {
    const service = new SensitiveVideoConfigService({
        storage: storage('https://config.test/list.json'),
        fetchProxy: async url => ({ contents: JSON.stringify({ abcDEF_123: {}, 'bad id': {} }) }),
        now: () => 42
    });
    const result = await service.load();
    assert.deepEqual(result, { abcDEF_123: {}, 'bad id': {} });
    assert.deepEqual(service.getVideoIds(), ['abcDEF_123']);
});

test('sensitive video config falls back to direct fetch and retains cache on invalid JSON', async () => {
    let body = JSON.stringify({ video123: true });
    const service = new SensitiveVideoConfigService({
        storage: storage('https://config.test/list.json'),
        fetchProxy: async () => { throw new Error('proxy failed'); },
        fetchImpl: async () => ({ ok: true, text: async () => body }),
        logger: { warn() {}, error() {} }
    });
    await service.load();
    body = '{invalid';
    await service.load();
    assert.deepEqual(service.config, { video123: true });
});
