// main.js integration: Reddit posts reach the window, honour the toggle, and never block or alter the verified tabs.
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const W = path.resolve(__dirname, '..');
const H = require('./support/harness')(W, { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'rdm-')) });
const feeds = require('./support/feeds')();
const R = require('../src/reddit');
(async () => {
  await H.ready; await H.flush();
  const atom = entries => `<feed xmlns="http://www.w3.org/2005/Atom"><title>f</title>${entries}</feed>`;
  const post = (title, id) => `<entry><title>${title}</title><link href="https://www.reddit.com/r/ClaudeAI/comments/${id}/t/"/><updated>2026-10-31T10:00:00+00:00</updated></entry>`;
  const rcalls = [];
  R.setFetch(async u => { rcalls.push(u); const body = /top\.rss/.test(u) ? atom(post('Claude tip', 'abc123')) : atom(post('Claude tip', 'abc123') + '<entry><title>/u/z on Claude tip</title><link href="https://www.reddit.com/r/ClaudeAI/comments/abc123/t/c1/"/><updated>2026-10-31T10:00:00+00:00</updated><content type="html">&lt;p&gt;nice&lt;/p&gt;</content></entry>'); return { status: 200, ok: true, url: u, headers: { get: () => null }, text: async () => body }; });
  feeds.bodies['re:.'] = feeds.rss([['Scientists announce major discovery in deep ocean research', 'https://example.com/a'], ['Scientists announce major discovery in deep ocean research', 'https://example.org/b']]);
  H.fetchImpl = (u, o) => feeds.fetch(u, o);
  const set = H.handlers['set-settings'];
  R.configure({ gap: 1, fresh: 0 }); // no throttle: only the setting can stop a request in this test
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
  const off = await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: false });
  assert.strictEqual(off.reddit, false);
  assert.strictEqual(await H.handlers['reddit-comment']({}, 'https://www.reddit.com/r/ClaudeAI/comments/abc123/claude_tip/'), '', 'no comment requests when the bonus is off');
  const n = rcalls.length; await set({}, { country: 'US', state: '', alerts: false, startup: false, reddit: false });
  assert.strictEqual(rcalls.length, n, 'no reddit requests when disabled');
  const d = H.data(); assert.ok(d, 'data was pushed'); assert.strictEqual((d.reddit || []).length, 0, 'reddit data dropped when disabled');
  // when Reddit refuses, the window gets the reason instead of silence
  R.setFetch(async u => ({ status: 403, ok: false, url: u, headers: { get: () => null }, text: async () => 'Blocked' }));
  await set({}, { country: 'US', state: '', alerts: false, startup: false, hidden: [], reddit: true }); await H.flush();
  const failed = H.data(); assert.strictEqual((failed.reddit || []).length, 0);
  assert.match(failed.redditStatus.error, /refused the request \(HTTP 403\)/); assert.ok(failed.redditStatus.retryAt > Date.now(), 'tells when it will try again');
  console.log('reddit main tests passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
