const assert = require('assert');
const { rankStories } = require('../src/rank');
const now = Date.now();
const h = x => now - x * 36e5;
const items = [
  { source: 'bbc', title: 'Earthquake strikes northern Japan, dozens killed', link: 'https://example.com/a', summary: '<p>A strong quake hit.</p>', ts: h(1) },
  { source: 'guardian', title: 'Dozens killed as earthquake strikes northern Japan', link: 'https://example.com/b', summary: 'Rescue underway.', ts: h(2) },
  { source: 'npr', title: 'Dozens killed as earthquake strikes northern Japan, rescue under way', link: 'https://example.com/c', summary: 'x', ts: h(2) },
  { source: 'bbc', title: 'Local bakery wins award', link: 'https://example.com/d', summary: 'Nice.', ts: h(1) },
  { source: 'randomblog', title: 'Aliens landed today shocking', link: 'https://example.com/e', summary: 'fake', ts: h(1) },
  { source: 'randomblog', title: 'Aliens landed today shocking!', link: 'https://example.com/f', summary: 'fake', ts: h(1) },
];
const r = rankStories(items);
assert.strictEqual(r.length, 1, 'only multi-source trusted story survives');
assert.ok(r[0].sources.length === 3);
assert.ok(!/<p>/.test(r[0].summary));
const local = rankStories(items, { localOk: true });
assert.strictEqual(local.length, 2);
assert.strictEqual(local[1].verified, false);
assert.ok(!local.some(s => /Aliens/.test(s.title)), 'untrusted never shown');
const { clean, safeLink } = require('../src/rank');
assert.strictEqual(safeLink('javascript:alert(1)'), '');
assert.strictEqual(safeLink('http://x.com/a'), '');
assert.strictEqual(safeLink('file:///etc/passwd'), '');
assert.strictEqual(safeLink('https://user:pw@x.com/'), '');
assert.ok(safeLink('https://x.com/a'));
assert.ok(!/[<>]/.test(clean('<img src=x onerror=alert(1)>Hi <script>bad')));
assert.ok(!/\u202e/.test(clean('a\u202eb')));
const evil = rankStories([
  { source: 'bbc', title: 'Big war news today', link: 'javascript:alert(1)', summary: '', ts: now },
  { source: 'npr', title: 'Big war news today', link: 'javascript:alert(1)', summary: '', ts: now }]);
assert.strictEqual(evil.length, 0, 'non-https links dropped');
const L = (src, title, ts = now - 36e5) => ({ source: src, title, link: 'https://example.com/' + Math.random(), summary: '', ts });
const none = rankStories([L('bbc', 'Fed holds rates steady'), L('guardian', 'ECB holds rates steady')]);
assert.strictEqual(none.length, 0, 'Fed vs ECB must not merge');
assert.strictEqual(rankStories([L('bbc', 'UK inflation falls to 2 percent'), L('npr', 'US inflation falls to 2 percent')]).length, 0, 'UK vs US must not merge');
assert.strictEqual(rankStories([L('bbc', 'Israel strikes Gaza hospital, dozens killed'), L('npr', 'Israel strikes Lebanon, dozens killed')]).length, 0);
const storm = rankStories([
  L('npr', 'Hurricane Milton makes landfall in Florida'),
  L('guardian', 'Hurricane Milton makes landfall in Florida, millions without power'),
  L('bbc', 'Millions without power as Hurricane Milton makes landfall in Florida')]);
assert.strictEqual(storm.length, 1);
assert.strictEqual(storm[0].sources.length, 3, 'transitive clustering counts all outlets');
assert.ok(storm[0].links.length === 3 && storm[0].firstTs > 0);
const { decode } = require('../src/rank');
assert.strictEqual(clean('Don&#8217;t panic: AT&amp;T'), 'Don’t panic: AT&T');
assert.strictEqual(clean('&lt;script&gt;x&lt;/script&gt;').includes('<'), true, 'decoded text stays plain text (rendered via textContent)');
const pair = (a, b) => rankStories([L('bbc', a), L('guardian', b)]).length;
assert.strictEqual(pair('Senate passes government funding bill', 'Senate rejects government funding bill'), 0, 'antonyms must not merge');
assert.strictEqual(pair('5 killed in explosion at chemical plant', '3 killed in explosion at chemical plant'), 0, 'different figures must not merge');
assert.strictEqual(pair('Senate passes government funding bill', 'Senate passes government funding bill, avoiding shutdown'), 1);
// wire family: AP+NPR+PBS count as one source
const wire = rankStories([L('ap', 'Hurricane Milton makes landfall in Florida'), L('npr', 'Hurricane Milton makes landfall in Florida'), L('pbs', 'Hurricane Milton makes landfall in Florida')]);
assert.strictEqual(wire.length, 0, 'wire-sharing outlets are one source');
const mixed = rankStories([L('ap', 'Hurricane Milton makes landfall in Florida'), L('npr', 'Hurricane Milton makes landfall in Florida'), L('bbc', 'Hurricane Milton makes landfall in Florida')]);
assert.strictEqual(mixed.length, 1); assert.strictEqual(mixed[0].indep, 2);
// World ordering: a serious widely-covered story outranks a minor one with the same reach.
const ord = rankStories([
  L('bbc', 'Celebrity chef opens new restaurant downtown'), L('guardian', 'Celebrity chef opens new restaurant downtown'),
  L('bbc', 'Missile strike hits city, dozens killed in war escalation'), L('guardian', 'Missile strike hits city, dozens killed in war escalation')]);
assert.ok(/Missile/.test(ord[0].title), 'high-impact story ranks first');
// Tab-specific impact: in tech, a major acquisition/breach outranks a minor gadget story with equal reach.
const tech = rankStories([
  L('verge', 'Startup unveils new smart lamp'), L('wired', 'Startup unveils new smart lamp'),
  L('verge', 'Chipmaker acquires AI startup in billion dollar deal'), L('wired', 'Chipmaker acquires AI startup in billion dollar deal')], { profile: 'tech' });
assert.ok(/acquires/.test(tech[0].title));
const st = rankStories([
  L('npr', 'Local cafe adds new menu items this week'), L('cbs', 'Local cafe adds new menu items this week'),
  L('npr', 'Governor signs state budget after legislature vote'), L('cbs', 'Governor signs state budget after legislature vote')], { profile: 'state', localOk: true });
assert.ok(/budget/.test(st[0].title));
// Realistic cross-outlet pairs: same event, different wording
const P2 = (a, sa, b, sb) => rankStories([L(sa, a), L(sb, b)]).length;
[['Israel and Hamas agree to ceasefire deal after months of talks','bbc','Israel and Hamas agree ceasefire deal, mediators say','guardian'],
 ['Russia launches biggest drone attack on Ukraine since war began','bbc','Russia launches record drone attack on Ukraine overnight','aljazeera'],
 ['Powerful earthquake strikes off coast of Japan','bbc','Strong earthquake hits Japan, tsunami warning issued','nyt'],
 ['OpenAI releases GPT-6 with new reasoning features','verge','OpenAI launches GPT-6','techcrunch']].forEach(x => assert.strictEqual(P2(...x), 1, 'should merge: ' + x[0]));
[['Fed holds rates steady','bbc','ECB holds rates steady','guardian'],
 ['UK inflation falls to 2 percent','bbc','US inflation falls to 2 percent','nyt'],
 ['Israel strikes Gaza hospital, dozens killed','bbc','Israel strikes Lebanon, dozens killed','guardian'],
 ['Trump says he will not attend summit','bbc','Trump says he will attend summit','nyt'],
 ['Oil prices up sharply on supply fears','bbc','Oil prices down sharply on supply fears','nyt'],
 ['Hurricane hits Florida coast','bbc','Hurricane hits Texas coast','nyt']].forEach(x => assert.strictEqual(P2(...x), 0, 'must NOT merge: ' + x[0]));
console.log('rank tests passed');

// Round-4 regression cases
const M = (a, b) => rankStories([L('bbc', a), L('nyt', b)]).length;
['Israel strikes Iran|Iran strikes Israel', 'Harris concedes election to Trump|Trump concedes election to Harris',
 'India beats Pakistan in final|Pakistan beats India in final', 'Senate approves bill to ban TikTok|Senate rejects bill to ban TikTok',
 'Court upholds abortion ban in Texas|Court overturns abortion ban in Texas', 'Stocks rally as Fed signals rate cut|Stocks slump as Fed signals rate cut']
  .forEach(p => { const [a, b] = p.split('|'); assert.strictEqual(M(a, b), 0, 'must not merge: ' + p); });
assert.strictEqual(M('Israel and Hamas Agree to Ceasefire Deal After Months of Talks', 'Israel and Hamas agree ceasefire deal, mediators say'), 1, 'title-case headline merges');
assert.strictEqual(M('Magnitude 7.1 earthquake hits Japan, 12 dead', 'Magnitude 7.1 earthquake strikes Japan'), 1, 'extra detail does not conflict');
assert.ok(!/alert\(1\)/.test(clean('<script>alert(1)</script>A strong quake')), 'script contents removed');
const old = rankStories([{ source: 'bbc', title: 'Old news story about something', link: 'https://x.com/o1', summary: '', ts: now - 100 * 36e5 }, { source: 'nyt', title: 'Old news story about something', link: 'https://x.com/o2', summary: '', ts: now - 100 * 36e5 }]);
assert.strictEqual(old.length, 0, 'stories older than 72h are dropped');
console.log('round-4 tests passed');
