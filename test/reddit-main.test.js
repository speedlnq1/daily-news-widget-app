// main.js integration: Reddit posts reach the window, honour the toggle, and never block or alter the verified tabs.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const W = path.resolve(__dirname, '..');
const H = require('./support/harness')(W, { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'rdm-')) });
const feeds = require('./support/feeds')();
const R = require('../src/reddit');
(async () => {
  await H.ready; await H.flush();
  const atom = entries => `<feed xmlns="http://www.w3.org/2005/Atom"><title>f</title>${entries}</feed>`;
  const post = (title, id, sub = 'ClaudeAI') => `<entry><title>${title}</title><link href="https://www.reddit.com/r/${sub}/comments/${id}/t/"/><updated>2026-10-31T10:00:00+00:00</updated></entry>`;
  const rcalls = [];
  const okFetch = async u => { rcalls.push(u); const body = /top\.rss/.test(u) ? atom(post('Claude tip', 'abc123', (/\/r\/([^+/]+)/.exec(u) || [])[1])) : atom(post('Claude tip', 'abc123') + '<entry><title>/u/z on Claude tip</title><link href="https://www.reddit.com/r/ClaudeAI/comments/abc123/t/c1/"/><updated>2026-10-31T10:00:00+00:00</updated><content type="html">&lt;p&gt;nice&lt;/p&gt;</content></entry>'); return { status: 200, ok: true, url: u, headers: { get: () => null }, text: async () => body };  };
  R.setFetch(okFetch);
  feeds.bodies['re:.'] = feeds.rss([['Scientists announce major discovery in deep ocean research', 'https://example.com/a'], ['Scientists announce major discovery in deep ocean research', 'https://example.org/b']]);
  H.fetchImpl = (u, o) => feeds.fetch(u, o);
  const set = H.handlers['set-settings'];
  R.configure({ gap: 1, checkGap: 1, fresh: 0 }); // no throttle: only the setting can stop a request in this test
  const st0 = await H.handlers['get-settings']({}); assert.strictEqual(st0.reddit, false, 'bonus is off by default');
  await set({}, { country: 'US', state: '', alerts: false, startup: false }); await H.flush();
  assert.strictEqual(rcalls.length, 0, 'no Reddit requests unless explicitly enabled');
  const st1 = await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: 'yes' });
  assert.strictEqual(st1.reddit, false, 'only a real boolean true enables it');
  const s = await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: true });
  assert.strictEqual(s.reddit, true);
  await new Promise(r => setTimeout(r, 100));
  assert.ok(rcalls.length > 0, 'reddit was pulled when enabled');
  await new Promise(r => setTimeout(r, 500));
  assert.ok((H.data().reddit || []).length > 0 && H.data().reddit[0].title === 'Claude tip', 'posts reached the window');
  assert.strictEqual(await H.handlers['reddit-comment']({}, H.data().reddit[0].link), 'nice', 'opening a post fetches its top comment');
  // the reader's own communities are validated, saved, applied at once, and "empty" means the defaults
  const st = await H.handlers['get-settings']({}); assert.strictEqual(st.redditSubs.length, 7); assert.deepStrictEqual(st.redditDefaults, st.redditSubs);
  const before = rcalls.length;
  const mine = await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: true, redditSubs: ['r/technology', 'bad name', 'Science'] });
  assert.deepStrictEqual(mine.redditSubs, ['technology', 'Science']);
  await new Promise(r => setTimeout(r, 200));
  assert.ok(rcalls.slice(before).some(u => /\/r\/technology\+Science\/top\.rss/.test(u)), 'the new list is asked for right away');
  assert.strictEqual((await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: true })).redditSubs.length, 2, 'settings saved without a list keep the current one');
  assert.strictEqual((await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: true, redditSubs: [] })).redditSubs.length, 7, 'an empty list means the defaults');
  assert.strictEqual((await H.handlers['reddit-check-sub']({}, 'technology')).ok, true, 'a community can be checked while the bonus is on');
  const off = await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: false });
  assert.strictEqual(off.reddit, false);
  assert.strictEqual(await H.handlers['reddit-comment']({}, 'https://www.reddit.com/r/ClaudeAI/comments/abc123/claude_tip/'), '', 'no comment requests when the bonus is off');
  assert.strictEqual((await H.handlers['reddit-check-sub']({}, 'technology')).ok, true, 'a community can be checked before the bonus is saved on (first-time flow)');
  const n = rcalls.length; await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: false });
  assert.strictEqual(rcalls.length, n, 'no reddit requests when disabled');
  const d = H.data(); assert.ok(d, 'data was pushed'); assert.strictEqual((d.reddit || []).length, 0, 'reddit data dropped when disabled');
  // switching communities while a pull is still running: the old list's posts must not come back afterwards
  const base = { country: 'US', state: '', alerts: false, startup: false, reddit: true };
  await set({}, { ...base, redditSubs: [] }); await new Promise(r => setTimeout(r, 300)); await H.flush();
  assert.ok((H.data().reddit || []).some(p => p.sub === 'ClaudeAI'), 'the old list has posts on screen');
  let free, free2; const gate = new Promise(r => { free = r; }), gate2 = new Promise(r => { free2 = r; });
  R.setFetch(async u => { await (/\/r\/ClaudeAI\+/.test(u) ? gate : /\/r\/technology/.test(u) ? gate2 : null); return okFetch(u); });
  await set({}, { ...base }); await new Promise(r => setTimeout(r, 50)); // a pull of the old list is now waiting on the network
  await set({}, { ...base, redditSubs: ['technology'] });
  free(); await new Promise(r => setTimeout(r, 100)); await H.flush(); // the old pull ends first
  assert.ok(!(H.data().reddit || []).some(p => p.sub === 'ClaudeAI'), 'the old list\'s posts do not come back');
  free2(); await new Promise(r => setTimeout(r, 300)); await H.flush();
  const mine2 = H.data().reddit || []; assert.ok(mine2.length > 0 && mine2.every(p => p.sub === 'technology'), 'only the new list\'s posts remain: ' + JSON.stringify(mine2.map(p => p.sub)));
  // when Reddit refuses, the window gets the reason instead of silence
  R.setFetch(async u => ({ status: 403, ok: false, url: u, headers: { get: () => null }, text: async () => 'Blocked' }));
  await set({}, { country: 'US', state: '', alerts: false, startup: false, hidden: [], reddit: true, redditSubs: ['science'] }); await H.flush(); // a new list starts with no posts
  const failed = H.data(); assert.strictEqual((failed.reddit || []).length, 0);
  assert.match(failed.redditStatus.error, /refused the request \(HTTP 403\)/); assert.ok(failed.redditStatus.retryAt > Date.now(), 'tells when it will try again');
  console.log('reddit main tests passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
