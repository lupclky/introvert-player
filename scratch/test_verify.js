const assert = require('assert');

// --- SHA-256 PURE JS IMPLEMENTATION ---
function sha256(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';

    var words = [];
    var asciiLength = ascii[lengthProperty];
    
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];

    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = 1;
            }
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return; // ASCII only
        words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
    words[words[lengthProperty]] = (asciiLength * 8) | 0;
    
    var h0 = hash[0], h1 = hash[1], h2 = hash[2], h3 = hash[3], h4 = hash[4], h5 = hash[5], h6 = hash[6], h7 = hash[7];
    for (j = 0; j < words[lengthProperty]; j += 16) {
        var w = words.slice(j, j + 16);
        var oldh0 = h0, oldh1 = h1, oldh2 = h2, oldh3 = h3, oldh4 = h4, oldh5 = h5, oldh6 = h6, oldh7 = h7;
        for (i = 0; i < 64; i++) {
            if (i < 16) {
                // do nothing
            } else {
                var w15 = w[i - 15], w2 = w[i - 2];
                var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
                var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            var ch = (h4 & h5) ^ (~h4 & h6);
            var maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
            var temp1 = (h7 + (rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25)) + ch + k[i] + w[i]) | 0;
            var temp2 = ((rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22)) + maj) | 0;
            h7 = h6;
            h6 = h5;
            h5 = h4;
            h4 = (h3 + temp1) | 0;
            h3 = h2;
            h2 = h1;
            h1 = h0;
            h0 = (temp1 + temp2) | 0;
        }
        h0 = (h0 + oldh0) | 0;
        h1 = (h1 + oldh1) | 0;
        h2 = (h2 + oldh2) | 0;
        h3 = (h3 + oldh3) | 0;
        h4 = (h4 + oldh4) | 0;
        h5 = (h5 + oldh5) | 0;
        h6 = (h6 + oldh6) | 0;
        h7 = (h7 + oldh7) | 0;
    }
    
    var h = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (i = 0; i < 8; i++) {
        var hex = (h[i] >>> 0).toString(16);
        result += ('00000000' + hex).slice(-8);
    }
    return result;
}

function verifyActionCode(code) {
    if (!code || typeof code !== 'string') return null;
    const parts = code.trim().toUpperCase().split('-');
    if (parts.length !== 4 || parts[0] !== 'ADD') {
        return null;
    }
    const amount = parseInt(parts[1], 10);
    const nonce = parts[2];
    const sig = parts[3];
    if (isNaN(amount) || amount <= 0 || !nonce || !sig) {
        return null;
    }
    
    const secret = 'pineapple-studio-secret-key-2026';
    const rawString = `${amount}-${nonce}-${secret}`;
    const expectedSig = sha256(rawString).substring(0, 12).toUpperCase();
    
    if (sig === expectedSig) {
        return { amount, nonce, code: code.trim().toUpperCase() };
    }
    return null;
}

// Test cases
console.log('Running verifyActionCode tests...');

// 1. Invalid codes
assert.strictEqual(verifyActionCode(''), null);
assert.strictEqual(verifyActionCode('INVALID'), null);
assert.strictEqual(verifyActionCode('ADD-10-ABCD'), null);
assert.strictEqual(verifyActionCode('ADD-INVALID-ABCD-SIG'), null);
assert.strictEqual(verifyActionCode('ADD--5-ABCD-SIG'), null);

// 2. Valid code verification
// Code generated for 15 actions: ADD-15-A606F85C1083024D-2F2BC5066C04
const code15 = 'ADD-15-A606F85C1083024D-2F2BC5066C04';
const res15 = verifyActionCode(code15);
assert.notStrictEqual(res15, null);
assert.strictEqual(res15.amount, 15);
assert.strictEqual(res15.nonce, 'A606F85C1083024D');
assert.strictEqual(res15.code, code15);

// 3. Valid code for 50 actions: ADD-50-EB628CAE6279764A-423E356ED248
const code50 = 'ADD-50-EB628CAE6279764A-423E356ED248';
const res50 = verifyActionCode(code50);
assert.notStrictEqual(res50, null);
assert.strictEqual(res50.amount, 50);
assert.strictEqual(res50.nonce, 'EB628CAE6279764A');
assert.strictEqual(res50.code, code50);

// 4. Modifying signature should fail
const forgedCode = 'ADD-15-A606F85C1083024D-2F2BC5066C05'; // changed last digit
assert.strictEqual(verifyActionCode(forgedCode), null);

console.log('ALL TESTS PASSED SUCCESSFULLY!');
