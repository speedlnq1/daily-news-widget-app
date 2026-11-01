const assert = require('assert');
const { updatesEnabled } = require('../src/updates');
assert.strictEqual(updatesEnabled({ build: { win: { target: 'nsis' } } }), false);
assert.strictEqual(updatesEnabled({ build: { win: { publisherName: '' } } }), false);
assert.strictEqual(updatesEnabled({ build: { win: { publisherName: '   ' } } }), false);
assert.strictEqual(updatesEnabled({ build: { win: { publisherName: [] } } }), false);
assert.strictEqual(updatesEnabled({}), false);
assert.strictEqual(updatesEnabled(null), false);
assert.strictEqual(updatesEnabled({ build: { win: { publisherName: 'Example Ltd' } } }), true);
assert.strictEqual(updatesEnabled({ build: { win: { publisherName: ['Example Ltd'] } } }), true);
// the shipped package.json must not enable updates until a certificate exists
assert.strictEqual(updatesEnabled(require('../package.json')), false, 'auto-update must stay off while unsigned');
console.log('updates ok');
