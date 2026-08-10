const test = require('node:test');
const assert = require('node:assert/strict');
const ActionCodeService = require('../services/action-code-service');

function storage() {
    const values = {};
    return { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, values };
}

test('action code service produces standard SHA-256', () => {
    const service = new ActionCodeService({ storage: storage() });
    assert.equal(service.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('action code service validates, redeems and rejects reused codes', () => {
    const store = storage();
    const service = new ActionCodeService({ storage: store });
    const amount = 5;
    const nonce = 'HELLO';
    const signature = service.sha256(`${amount}-${nonce}-${service.secret}`).slice(0, 12).toUpperCase();
    const code = `ADD-${amount}-${nonce}-${signature}`;
    assert.deepEqual(service.verify(code), { amount, nonce, code });
    assert.equal(service.redeem(code).total, 5);
    assert.equal(service.redeem(code).reason, 'used');
    assert.equal(store.values.dua_bonus_actions, '5');
});

test('action code service rejects malformed and forged codes', () => {
    const service = new ActionCodeService({ storage: storage() });
    assert.equal(service.verify('invalid'), null);
    assert.equal(service.redeem('ADD-5-HELLO-000000000000').reason, 'invalid');
});
