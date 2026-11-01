const assert = require('assert');
const { rankStories } = require('../src/rank');
const T = require('../src/topics');
const now = Date.now();
const L = (src, title, i) => ({ source: src, title, link: 'https://example.com/' + i + src, summary: '', ts: now - 36e5 });
const pair = (title, i) => [L('bbc', title, i), L('guardian', title, i)];
// 14 distinct stories: 5 war, 3 politics, 6 neutral
const titles = ['Missile strikes hit city as war escalates in region one', 'Troops advance on the frontline near border town two', 'Ceasefire talks collapse after airstrike on hospital three',
 'Army shells port as offensive widens four', 'Rebels seize base in new battle five',
 'Senate passes budget after tense vote six', 'Prime minister faces parliament over reform seven', 'Governor signs election law eight',
 'Scientists map deep ocean trench using robot nine', 'Museum unveils restored medieval manuscript ten', 'Bakery chain opens twenty stores across country eleven',
 'Researchers grow crops in lunar soil twelve', 'City library adds night reading rooms thirteen', 'Engineers test quiet electric ferry fourteen'];
const items = titles.flatMap((t, i) => pair(t, i));
const ALL = T.IDS;
const without = (...ids) => ALL.filter(i => !ids.includes(i));
const all = rankStories(items, { limit: 20, show: ALL });
assert.strictEqual(all.length, 14, 'every topic on: nothing hidden');
const noWar = rankStories(items, { limit: 20, show: without('war') });
assert.ok(noWar.every(s => !/missile|troops|ceasefire|army|rebels/i.test(s.title)), 'war stories left out');
assert.strictEqual(noWar.length, 9);
assert.strictEqual(rankStories(items, { limit: 20, show: without('war', 'politics') }).length, 6);
// picking only some topics keeps just those stories
const onlyWar = rankStories(items, { limit: 20, show: ['war'] });
assert.strictEqual(onlyWar.length, 5); assert.ok(onlyWar.every(s => /missile|troops|ceasefire|army|rebels/i.test(s.title)));
// war headlines that also brush against other topics are still war, so unticking War hides them
['Russian missiles pound Kyiv', 'Putin vows response after Ukraine drone strike', 'Netanyahu says Gaza offensive will continue', 'Israeli forces raid West Bank town', 'Rocket attack kills 5']
  .forEach(h => assert.strictEqual(T.topicOf(h), 'war', h));
// look-alike words do not pull a headline into the wrong topic
const lookalikes = ['Senate yields to pressure on bill', 'James Bond actor named', 'Food bank opens in town', 'European Union leaders meet', 'Hamas rocket fired at town', 'Police discover body in park',
  'Bruno Mars announces tour', 'Ai Weiwei opens exhibition', 'Gemini crew returns home', 'Claude Monet painting sells', 'Amazon rainforest fire grows', 'Hackney council meets', 'Intel officials brief senators'];
lookalikes.forEach(h => assert.ok(!['finance', 'business', 'science', 'ai', 'tech', 'crypto'].includes(T.topicOf(h)), h + ' -> ' + T.topicOf(h)));
// "everything else" holds stories that fit no topic
assert.strictEqual(T.topicOf('City library adds night reading rooms'), 'other');
assert.strictEqual(rankStories(items, { limit: 20, show: ['other'] }).length, 14 - rankStories(items, { limit: 20, show: without('other') }).length);
// nothing picked: empty result, no crash
assert.strictEqual(rankStories(items, { limit: 20, show: [] }).length, 0);
// a story only counts as 'other' when the whole cluster fits no topic
const mixed = [L('bbc', 'Missile strike hits port city', 900), L('guardian', 'Missile strike hits port city', 900)];
mixed[1].summary = 'Officials gathered for talks on the new harbour plan';
assert.strictEqual(rankStories(mixed, { limit: 10, show: ['other'] }).length, 0, 'war story is not other');
// A.I. spelling and narrow keywords
assert.strictEqual(T.topicOf('The A.I. boom reshapes offices'), 'ai');
assert.strictEqual(T.topicOf('Apple pie contest and Christmas markets open'), 'other');
// look-alikes that used to land in the wrong topic, and common headlines that used to land in 'other'
const expect = { 'Shark attack kills swimmer': 'other', 'FBI raids home of former adviser': 'crime', 'Salvation Army appeals for donations': 'other', 'Bank chiefs warn of slowdown': 'other',
  'Primary school teacher wins award': 'other', 'Kansas City Royals beat Tigers': 'other', 'Liverpool parade crash: driver charged': 'other', 'AI could wipe out jobs, warns IMF': 'ai',
  'Fed holds rates steady': 'finance', 'Researchers find new cancer treatment': 'health', 'Drug overdose deaths fall': 'health', 'Israel strikes Iran nuclear sites': 'war',
  'Jury finds rapper guilty': 'crime', 'Government shutdown enters third week': 'politics', 'England beat Wales in Six Nations rugby': 'sports' };
for (const [h, id] of Object.entries(expect)) assert.strictEqual(T.topicOf(h), id, h);
// refill really pulls from the next-best stories when plenty exist
const extra = ['Glacier survey reveals thinning ice shelf', 'Baker revives forgotten sourdough recipe', 'Astronomers detect faint radio pulse', 'Chess prodigy masters endgame theory',
  'Orchard growers test drought tolerant apples', 'Violinist restores antique cello workshop', 'Divers catalogue coral nursery progress', 'Teachers pilot outdoor mathematics lessons',
  'Cartographers digitise nineteenth century atlas', 'Botanists name newly found orchid species', 'Potters rebuild kiln after village fair', 'Linguists document fading mountain dialect'];
const many = extra.flatMap((t, i) => pair(t, 100 + i));
assert.strictEqual(rankStories([...items, ...many], { limit: 10, show: without('war', 'politics') }).length, 10, 'tab refills to 10');
// validation
assert.deepStrictEqual(T.valid(['war', 'bogus', 'war', 5, 'sports']), ['war', 'sports']);
assert.deepStrictEqual(T.valid('x'), []);
// settings: saved "hidden" lists from older versions become "everything except those"; nothing saved means all topics
assert.deepStrictEqual(T.fromSettings({}), ALL);
assert.deepStrictEqual(T.fromSettings({ hidden: ['war', 'sports', 'bogus'] }), without('war', 'sports'));
assert.deepStrictEqual(T.fromSettings({ hidden: [] }), ALL);
assert.deepStrictEqual(T.fromSettings({ topics: ['ai', 'crypto', 'ai', 'nope'] }), ['ai', 'crypto']);
assert.deepStrictEqual(T.fromSettings({ topics: [], hidden: ['war'] }), [], 'new picks win over old hidden list');
assert.ok(T.wanted('Bitcoin hits record high', ['crypto']) && !T.wanted('Bitcoin hits record high', ['sports']));
// each topic matches an obvious example and not an unrelated one
const ex = { war: 'Troops move as ceasefire fails', politics: 'Senate vote on budget', crime: 'Police arrest suspect after robbery', celebrity: 'Actor attends red carpet premiere',
  sports: 'Premier League playoffs begin', disasters: 'Earthquake and tsunami warning issued', health: 'Measles outbreak spreads', crypto: 'Bitcoin hits record high',
  finance: 'Stocks fall as inflation worries investors', business: 'Retailer announces layoffs after merger', ai: 'OpenAI releases new chatbot model', tech: 'Apple unveils new iPhone software',
  science: 'Scientists map deep ocean trench' };
for (const t of T.TOPICS.filter(t => t.re)) { assert.strictEqual(T.topicOf(ex[t.id]), t.id, t.id + ' example is filed under its own topic'); assert.ok(!t.re.test('City library adds night reading rooms'), t.id + ' does not over-match'); }
console.log('topic tests passed');
