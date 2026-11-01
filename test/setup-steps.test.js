const assert = require('assert');
const S = require('../src/setup-steps');
const T = require('../src/topics');
const G = require('../src/geo');

// Region question only for countries that have a region list.
assert.deepStrictEqual(S.steps(true), ['look', 'country', 'region', 'topics', 'reddit', 'done']);
assert.deepStrictEqual(S.steps(false), ['look', 'country', 'topics', 'reddit', 'done']);
assert.deepStrictEqual([S.steps(G.hasRegions('US')).length, S.steps(G.hasRegions('FR')).length], [6, 5]);

// The bar is never empty, rises on every step and ends at exactly 100.
for (const n of [5, 6]) {
  const p = Array.from({ length: n }, (_, i) => S.percent(i, n));
  assert.ok(p[0] > 0 && p[n - 1] === 100, 'starts above 0, ends at 100: ' + p);
  assert.ok(p.every((v, i) => i === 0 || v > p[i - 1]), 'strictly rising: ' + p);
}
assert.deepStrictEqual([0, 1, 2, 3].map(i => S.percent(i, 4)), [25, 50, 75, 100]);

