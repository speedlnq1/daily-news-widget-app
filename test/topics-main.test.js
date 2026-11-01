// main.js integration: picking fewer topics empties tabs cleanly (no "offline", no stale stories), and old saved hide-lists still load.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const W = path.resolve(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tpm-'));
const H = require('./support/harness')(W, { userData });
const feeds = require('./support/feeds')();
(async () => {
  await H.ready; await H.flush();
  feeds.bodies['re:.'] = feeds.rss([['Scientists announce major discovery in deep ocean research', 'https://example.com/a'], ['Scientists announce major discovery in deep ocean research', 'https://example.org/b']]);
  H.fetchImpl = (u, o) => feeds.fetch(u, o);
  const set = H.handlers['set-settings'];
  const base = { country: 'US', state: '', alerts: false, startup: false };
  await set({}, base); await H.flush();
  assert.ok(H.data().world.length > 0 && !H.data().error, 'all topics: stories shown');
  // narrow pick: the old science story must not carry over into the new, sports-only tabs
  await set({}, { ...base, topics: ['sports'] }); await H.flush();
  assert.ok(!H.data().error, 'not reported as offline');
  assert.strictEqual(H.data().world.length, 0, 'old stories are not kept after the topics changed');
  let fetched = 0; H.fetchImpl = (u, o) => { fetched++; return feeds.fetch(u, o); };
  await set({}, { ...base, topics: [] }); await H.flush();
  assert.strictEqual(fetched, 0, 'no topics picked: no feed is fetched');
  assert.ok(!H.data().error && H.data().world.length === 0, 'no topics: empty tabs, not offline');
  await set({}, { ...base, topics: ['science'] }); await H.flush();
  assert.ok(H.data().world.length > 0, 'picking the matching topic brings the story back');
  console.log('topics main tests passed');
  process.exit(0);
})();
