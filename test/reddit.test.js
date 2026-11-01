const assert = require('assert');
const R = require('../src/reddit');

// text cleaning and links
assert.strictEqual(R.clean('Hello‮ **world**\n\n[link](http://evil.example) http://x.example/a  &amp; more\u0000', 100), 'Hello world link & more');
assert.ok(R.clean('word '.repeat(100), 50).length <= 50 && R.clean('word '.repeat(100), 50).endsWith('…'));
assert.strictEqual(R.safeLink('/r/ClaudeAI/comments/abc123/some_title/'), 'https://www.reddit.com/r/ClaudeAI/comments/abc123/some_title/');
for (const bad of ['https://evil.example/', '//evil.example/r/a/comments/abc/x/', '/r/a/comments/abc/x/\nfoo', 'javascript:alert(1)', '/u/x', null, 5]) assert.strictEqual(R.safeLink(bad), null, String(bad));

// saved posts are rebuilt field by field, so a hand-edited state file can't inject links or communities
const saved = R.valid([{ id: 'abc123', sub: 'ClaudeAI', title: 'ok', link: 'https://www.reddit.com/r/ClaudeAI/comments/abc123/x/' },
  { id: 'abc124', sub: 'ClaudeAI', title: 'x', link: 'https://evil.example/r/ClaudeAI/comments/abc124/x/' },
  { id: 'abc125', sub: 'NotAllowed', title: 'x', link: 'https://www.reddit.com/r/A1/comments/abc125/x/' }, null, 'x']);
assert.strictEqual(saved.length, 1);
assert.deepStrictEqual(R.valid('nope'), []);

// fake Reddit
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const raw = (id, sub, o = {}) => `<entry><title>${o.title || 'Post ' + id}</title><link href="${o.href || `https://www.reddit.com/r/${sub}/comments/${id}/post_${id}/`}"/><updated>2026-10-31T10:00:00+00:00</updated><content type="html">${esc(o.body || '<div>submitted by /u/x</div>')}</content></entry>`;
const listing = kids => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>feed</title>${kids.join('')}</feed>`;
const comment = (who, html) => `<entry><title>/u/${who} on Post</title><link href="https://www.reddit.com/r/ClaudeAI/comments/x/y/z/"/><updated>2026-10-31T10:00:00+00:00</updated><content type="html">${esc(html)}</content></entry>`;
const reply = (u, status, body, headers = {}) => ({ status, ok: status < 300, url: u, headers: { get: k => headers[k.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const HOT = [raw('cha1', 'ChatGPT'), raw('cha2', 'ChatGPT'), raw('cha3', 'ChatGPT'), raw('cla1', 'ClaudeAI'), raw('cla2', 'claudeai'), raw('ope1', 'OpenAI'), raw('loc1', 'LocalLLaMA'), raw('loc2', 'LocalLLaMA'),
  raw('vib1', 'vibecoding'), raw('cc1', 'ClaudeCoding'), raw('bgr1', 'bestgithubrepos'), raw('bgr2', 'BestGitHubRepos'), raw('bgr3', 'BestGitHubRepos'), raw('oth1', 'SomeOtherSub'), raw('evil', 'ClaudeAI', { href: 'https://evil.example/r/ClaudeAI/comments/evil1/x/' }), raw('cla3', 'ClaudeAI')];
const COMMENTS = listing([raw('post', 'ClaudeAI'), comment('AutoModerator', '<p>rules</p>'), comment('[deleted]', '<p>gone</p>'), comment('carol', '<p>[removed]</p>'), comment('bob', '<div class="md"><p>Great point, see <a href="http://x.example">this</a></p></div>')]);
const network = (hot = HOT) => {
  const N = { calls: [], agents: new Set() };
  N.fetch = async (u, o) => { N.calls.push(u); N.agents.add(o.headers['User-Agent']); return /top\.rss/.test(u) ? reply(u, 200, listing(hot)) : reply(u, 200, COMMENTS); };
  return N;
};
const fresh = () => { // every scenario starts from clean module state
  for (const k of Object.keys(require.cache)) if (/src[\\/]reddit\.js$/.test(k)) delete require.cache[k];
  const M = require('../src/reddit'); M.configure({ gap: 1, checkGap: 1, request: 200, fresh: 60 * 60000 }); return M;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // picking posts: 2 per community, interleaved, junk and unknown communities dropped
  const picked = R.pickPosts((await new (require('rss-parser'))().parseString(listing(HOT))).items);
  assert.deepStrictEqual(picked.map(p => p.id), ['cla1', 'cha1', 'ope1', 'loc1', 'vib1', 'cc1', 'bgr1', 'cla2', 'cha2', 'loc2']); // no other-community or off-site posts; max 2 each
  assert.deepStrictEqual(R.pickPosts([{ title: 'T', link: 'https://www.reddit.com/r/vibecoding/comments/vib2/t/' }]).map(p => p.sub), ['vibecoding']);

  // happy path: ONE listing request for all communities and nothing else in the background
  let M = fresh(), N = network(), early = null;
  M.setFetch(N.fetch);
  let out = await M.refresh([], posts => { early = early || posts; });
  assert.ok(/r\/ClaudeAI\+ChatGPT\+OpenAI\+LocalLLaMA\+vibecoding\+ClaudeCoding\+BestGitHubRepos\/top\.rss/.test(N.calls[0]), 'one combined listing request: ' + N.calls[0]);
  assert.strictEqual(N.calls.length, 1, 'a pull is a single request');
  assert.ok(early && early.length === out.length, 'posts are shown as soon as they arrive');
  assert.ok(out.every(p => /^https:\/\/www\.reddit\.com\/r\/\w+\/comments\//.test(p.link)));
  assert.ok([...N.agents].every(a => /^windows:daily-news-widget:v[\d.]+ \(by \/u\/\w+\)$/.test(a)), 'Reddit-format user agent: ' + [...N.agents]);
  assert.deepStrictEqual(M.status(), { error: '', retryAt: 0 });
  const requests = N.calls.length; assert.strictEqual(await M.refresh(out), out); assert.strictEqual(N.calls.length, requests, 'throttled for an hour');

  // the top comment is fetched only when a post is opened, from the post's own link, then cached
  assert.strictEqual(await M.comment(out[0].link), 'Great point, see this', 'AutoModerator, deleted and removed comments skipped; tags and links stripped');
  assert.ok(/^https:\/\/www\.reddit\.com\/r\/\w+\/comments\/\w+\/post_\w+\/\.rss\?sort=top/.test(N.calls[1]), 'comment feed uses the post\'s own link: ' + N.calls[1]);
  assert.strictEqual(await M.comment(out[0].link), 'Great point, see this'); assert.strictEqual(N.calls.length, 2, 'cached: no second request');
  M.configure({ gap: 60000 });
  assert.strictEqual(await M.comment(out[1].link), null, 'a second post right away is told to wait, not "no comment"'); assert.strictEqual(N.calls.length, 2);
  for (const bad of ['https://evil.example/r/a/comments/abc123/x/', 'javascript:1', '', null, 'https://www.reddit.com/r/ClaudeAI/comments/abc123/../../x', 'https://www.reddit.com/r/ClaudeAI/comments/abc123/a%2Fb/', 'https://www.reddit.com/r/ClaudeAI/comments/abc123/a\\b/']) assert.strictEqual(await M.comment(bad), '', String(bad));
  assert.strictEqual(N.calls.length, 2, 'only genuine Reddit post links are ever requested');
  M.configure({ gap: 1 }); await sleep(5); assert.strictEqual(await M.comment(out[1].link), 'Great point, see this'); assert.ok(N.calls.length === 3, 'after the gap the next post may be asked for');
  // a failing comment request gives nothing, shows no error, and the next one is still limited by the gap
  M = fresh(); let lastSaved = '{}'; M.onChange(() => { lastSaved = JSON.stringify(M.snapshot()); }); M.setFetch(async u => (/top\.rss/.test(u) ? reply(u, 200, listing(HOT)) : reply(u, 500, {}))); out = await M.refresh([]);
  assert.strictEqual(await M.comment(out[0].link), ''); assert.strictEqual(M.status(true).error, '', 'a missing comment is not shown as a failure');
  assert.strictEqual(JSON.parse(lastSaved).lastError, '', 'and no false error is saved for the next start');
  // no comment requests while Reddit is blocking
  M = fresh(); N = network(); M.setFetch(N.fetch); M.restore({ lastAttempt: 0, blockedUntil: Date.now() + 36e5, backoffStep: 1 });
  assert.strictEqual(await M.comment('https://www.reddit.com/r/ClaudeAI/comments/abc123/x/'), ''); assert.strictEqual(N.calls.length, 0);

  // every failure has a plain-language reason and backs off
  const failing = async (handler, expected, after = 1) => {
    const M2 = fresh(), N2 = { calls: [] };
    M2.setFetch(async (u, o) => { N2.calls.push(u); return handler(u, o); });
    const prev = [{ id: 'old1', sub: 'ClaudeAI', title: 'old', link: 'https://www.reddit.com/r/ClaudeAI/comments/old1/x/', ts: 1 }];
    assert.strictEqual(await M2.refresh(prev), prev, 'previous posts kept');
    assert.ok(expected.test(M2.status().error), `reason "${M2.status().error}" should match ${expected}`);
    assert.ok(M2.status(false).retryAt > Date.now() + 14 * 60000, 'back-off at least 15 minutes');
    assert.ok(M2.status(true).retryAt > Date.now() + 59 * 60000, 'with posts on screen the next try is an hour after the last one');
    assert.strictEqual(N2.calls.length, after, 'stops at the first failure');
    await M2.refresh(prev); assert.strictEqual(N2.calls.length, after, 'no requests during back-off');
    return M2;
  };
  await failing(u => reply(u, 403, 'Blocked'), /refused the request \(HTTP 403\)/);
  await failing(u => reply(u, 429, {}), /slow down \(HTTP 429\)/);
  await failing(u => ({ ...reply(u, 200, {}), url: u.replace('https:', 'http:') }), /non-secure address/);
  await failing(u => reply(u, 503, {}), /error \(HTTP 503\)/);
  await failing(u => reply(u, 200, '<html>Please verify you are human</html>'), /web page instead of data/);
  await failing(u => reply(u, 200, '<feed xmlns="http://www.w3.org/2005/Atom"><entry></feed>'), /unreadable/);
  await failing(u => { throw new Error('getaddrinfo ENOTFOUND'); }, /Could not connect/);
  await failing(u => reply(u, 200, listing([raw('oth1', 'SomeOtherSub')])), /no suitable posts/);
  M = await failing(u => reply(u, 429, {}, { 'retry-after': '7200' }), /slow down/);
  assert.ok(M.status(false).retryAt > Date.now() + 7100e3, 'Retry-After honoured');

  // a stalled answer times out with a reason and frees the pull; a stream over the size cap is cut off
  M = fresh(); M.setFetch(async u => ({ status: 200, ok: true, url: u, headers: { get: () => null }, text: () => new Promise(() => {}), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) } }));
  assert.deepStrictEqual(await M.refresh([]), []); assert.match(M.status().error, /did not answer in time/); assert.strictEqual(M.state().running, false);
  M = fresh(); M.setFetch(async u => ({ status: 200, ok: true, url: u, headers: { get: () => null }, text: () => new Promise(() => {}) }));
  assert.deepStrictEqual(await M.refresh([]), []); assert.match(M.status().error, /did not answer in time/);
  M = fresh(); let chunks = 0;
  M.setFetch(async u => ({ status: 200, ok: true, url: u, headers: { get: () => null }, body: { getReader: () => ({ read: async () => { chunks++; return chunks > 50 ? { done: true } : { done: false, value: new Uint8Array(100000) }; }, cancel: async () => {} }) } }));
  assert.deepStrictEqual(await M.refresh([]), []); assert.ok(chunks <= 21, 'stopped reading at the size cap: ' + chunks); assert.match(M.status().error, /too large/);

  // the back-off keeps growing while Reddit keeps failing
  M = fresh(); M.setFetch(async u => reply(u, 500, {})); await M.refresh([]);
  M.restore({ lastAttempt: 0, blockedUntil: 0, backoffStep: M.state().backoffStep }); const step = M.state().backoffStep; await M.refresh([]);
  assert.ok(M.state().backoffStep > step, 'back-off keeps growing while Reddit keeps failing');
  assert.ok(M.status(false).retryAt - Date.now() > 29 * 60000, 'second failure waits at least 30 minutes');
  // a fully successful pull resets the back-off and clears the reason
  M = fresh(); N = network(); M.setFetch(N.fetch); M.restore({ lastAttempt: 0, blockedUntil: 0, backoffStep: 3, lastError: 'old problem' });
  await M.refresh([]); assert.strictEqual(M.state().backoffStep, 0); assert.strictEqual(M.status().error, '');

  // back-off, spacing and the last reason survive a restart; garbage is clamped
  M = fresh(); M.setFetch(async u => reply(u, 429, {}, { 'retry-after': '3600' })); await M.refresh([]);
  const snap = JSON.parse(JSON.stringify(M.snapshot())); assert.ok(snap.blockedUntil > Date.now()); assert.match(snap.lastError, /slow down/);
  M = fresh(); N = network(); M.setFetch(N.fetch); M.restore(snap); await M.refresh([]);
  assert.strictEqual(N.calls.length, 0, 'restart does not bypass the block'); assert.match(M.status().error, /slow down/);
  M = fresh(); N = network(); M.setFetch(N.fetch); M.restore({ lastAttempt: Date.now() - 60000, blockedUntil: 0, backoffStep: 0 }); await M.refresh(saved);
  assert.strictEqual(N.calls.length, 0, 'restart does not bypass the hourly spacing');
  M = fresh(); M.restore({ lastAttempt: 'x', blockedUntil: 9e15, backoffStep: -4, lastError: 5 });
  assert.ok(M.snapshot().blockedUntil <= Date.now() + 6 * 36e5 + 1000 && M.state().backoffStep === 0, 'garbage state is clamped');
  let saves = 0; M = fresh(); M.onChange(() => saves++); M.setFetch(async u => reply(u, 429, {})); await M.refresh([]); assert.ok(saves >= 1, 'state changes are reported so they can be saved');

  // turning Reddit off aborts the request in flight and discards a late result
  M = fresh(); let aborted = false; M.configure({ request: 60000 });
  M.setFetch(async (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); })));
  const running = M.refresh([]); await sleep(20); assert.strictEqual(M.state().running, true);
  M.cancel(); assert.ok(aborted, 'in-flight request aborted'); await running; assert.strictEqual(M.state().running, false); assert.strictEqual(M.status().error, '', 'cancelling is not an error');
  M = fresh(); N = network(); let release; const gate = new Promise(r => { release = r; }); let shown = 0;
  M.setFetch(async (u, o) => { await gate; return N.fetch(u, o); });
  const late = M.refresh([], () => shown++); await sleep(20); M.cancel(); release();
  assert.deepStrictEqual(await late, [], 'result of a cancelled pull is discarded'); assert.strictEqual(shown, 0, 'and never shown'); assert.ok(N.calls.length <= 1);

  // an old cancelled pull finishing late must not mark a newer pull as finished
  M = fresh(); N = network(); M.configure({ fresh: 0, request: 60000 });
  let release1, release2; const gate1 = new Promise(r => { release1 = r; }), gate2 = new Promise(r => { release2 = r; }); let started = 0;
  M.setFetch(async (u, o) => { await (++started === 1 ? gate1 : gate2); return N.fetch(u, o); });
  const first = M.refresh([]); await sleep(20); M.cancel();
  const second = M.refresh([]); await sleep(20); assert.strictEqual(M.state().running, true);
  release1(); await first; assert.strictEqual(M.state().running, true, 'old pull did not clear the newer one');
  release2(); await second; assert.strictEqual(M.state().running, false);

  // turning the bonus off and on again within the hour: nothing on screen, so a new pull may start right away
  M = fresh(); N = network(); M.setFetch(N.fetch);
  const aborted1 = M.refresh([]); await sleep(0); M.cancel(); await aborted1;
  const before = N.calls.length; out = await M.refresh([]);
  assert.ok(N.calls.length > before && out.length > 0, 'a re-enabled bonus with no posts loads again');
  assert.strictEqual(await M.refresh(out), out, 'but with posts on screen the hour still applies');

  // the reader's own communities: names are validated, the list is combined into the one listing request, and changing it starts fresh
  assert.deepStrictEqual(R.cleanSubs([' r/Foo_Bar ', 'foo_bar', 'x', '/r/Abc', 5, 'bad name', 'a'.repeat(22)]), ['Foo_Bar', 'Abc']);
  assert.strictEqual(R.cleanSubs([]).length, 7, 'an empty list means the defaults'); assert.strictEqual(R.cleanSubs('nope').length, 7);
  assert.strictEqual(R.cleanSubs(Array.from({ length: 30 }, (_, i) => 'sub' + i)).length, 10, 'at most 10 communities');
  M = fresh(); N = network(); M.setFetch(N.fetch);
  assert.strictEqual(M.setSubs(['ClaudeAI', 'technology']), true); assert.strictEqual(M.setSubs(['ClaudeAI', 'Technology']), false, 'same list (any case): nothing to redo');
  out = await M.refresh([]); assert.ok(/\/r\/ClaudeAI\+technology\/top\.rss/.test(N.calls[0]), 'only the chosen communities are asked for: ' + N.calls[0]);
  // with a few communities each one may bring more posts, up to the cap of 10
  M = fresh(); M.setSubs(['ClaudeAI', 'ChatGPT']);
  const many = (await new (require('rss-parser'))().parseString(listing(Array.from({ length: 12 }, (_, i) => raw('p' + i + 'xx', i % 2 ? 'ChatGPT' : 'ClaudeAI'))))).items;
  const some = M.pickPosts(many); assert.strictEqual(some.length, 10); assert.strictEqual(some.filter(p => p.sub === 'ClaudeAI').length, 5);
  // checking a name before it is added: found (with Reddit's spelling), not found, invalid, or "could not check"
  const found = (u) => reply(u, 200, listing([raw('abc123', 'Technology')]));
  M = fresh(); M.setFetch(async u => found(u)); assert.deepStrictEqual(await M.check('technology'), { ok: true, name: 'Technology' });
  M = fresh(); M.setFetch(async u => reply(u, 200, listing([raw('abc123', 'SomethingElse')]))); assert.strictEqual((await M.check('nonexistentsub')).ok, false, 'a search-page redirect is not a community');
  M = fresh(); M.setFetch(async u => reply(u, 200, listing([]))); assert.strictEqual((await M.check('emptysub')).ok, false);
  M = fresh(); N = network(); M.setFetch(N.fetch); assert.strictEqual((await M.check('bad name!')).ok, false); assert.strictEqual(N.calls.length, 0, 'invalid names are never requested');
  for (const code of [403, 404]) { M = fresh(); M.setFetch(async u => reply(u, code, 'no')); const r = await M.check('privatesub'); assert.strictEqual(r.ok, false, 'HTTP ' + code + ' means the community cannot be followed'); assert.match(r.reason, new RegExp('HTTP ' + code)); }
  // a check that fails for any reason leaves the real listing's back-off and saved reason alone
  for (const handler of [u => reply(u, 500, {}), u => reply(u, 403, 'no'), u => { throw new Error('ENOTFOUND'); }, u => reply(u, 200, '<html>captcha</html>')]) {
    M = fresh(); M.restore({ lastAttempt: 0, blockedUntil: 0, backoffStep: 0, lastError: 'real problem' }); M.setFetch(async u => handler(u)); await M.check('technology');
    assert.deepStrictEqual(M.snapshot(), { lastAttempt: 0, blockedUntil: 0, backoffStep: 0, lastError: 'real problem' }, 'check changed the back-off state');
  }
  M = fresh(); M.setFetch(async u => reply(u, 500, {})); assert.strictEqual((await M.check('technology')).ok, null, 'Reddit unreachable: may be added unchecked');
  M = fresh(); N = network(); M.setFetch(N.fetch); M.restore({ lastAttempt: 0, blockedUntil: Date.now() + 36e5, backoffStep: 1 });
  assert.strictEqual((await M.check('technology')).ok, null, 'during a back-off nothing is asked'); assert.strictEqual(N.calls.length, 0);
  // two names added in quick succession: the second is told to wait (not added unchecked, not rejected)
  M = fresh(); M.configure({ checkGap: 60000 }); M.setFetch(async u => found(u)); await M.check('technology'); assert.deepStrictEqual(await M.check('science'), { ok: null, wait: true });

  console.log('reddit tests passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
