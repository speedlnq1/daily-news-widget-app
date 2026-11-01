// Cases from the independent ranking review (blind). Each topic must catch realistic headlines and avoid known over-blocks.
const assert = require('assert');
const T = require('../src/topics');
const { clean, rankStories } = require('../src/rank');
const hit = (id, list) => list.forEach(h => assert.ok(T.topicOf(h) === id, id + ' should match: ' + h));
const miss = (id, list) => list.forEach(h => assert.ok(T.topicOf(h) !== id, id + ' should NOT match: ' + h));
hit('war', ['Russia pounds Kyiv with drones, 5 killed', 'Israeli forces enter southern Lebanon', 'Hezbollah fires rockets as Gaza talks stall', 'Ukraine says it repelled assault near Kharkiv', 'Missile strike hits port city']);
hit('politics', ['Trump announces new tariffs on imports', 'Newsom signs climate bill', 'Starmer faces backbench revolt', 'Kremlin rejects talks proposal', 'Senate passes budget']);
hit('sports', ['Chiefs beat Bills in overtime thriller', 'LeBron James scores 40 as Lakers win', 'Arsenal sign striker in transfer window', 'Djokovic into Wimbledon final']);
hit('celebrity', ['Taylor Swift announces engagement', 'Prince Harry and Meghan attend premiere', 'Rapper drops surprise album']);
hit('disasters', ['Magnitude 6.8 quake hits Turkey', 'Hurricane Milton makes landfall', 'Winter storm batters Midwest', 'Wildfire forces evacuations']);
hit('health', ['Mpox cases rise in Africa', 'Measles outbreak spreads in Texas', 'FDA approves new Alzheimer’s drug']);
hit('crime', ['Police arrest suspect after robbery', 'Man sentenced for murder', 'Jury hears murder trial evidence']);
miss('crime', ['Clinical trial shows cancer drug works', 'Researchers begin trial of new battery design']);
miss('disasters', ['Stock market storms higher on rate hopes', 'Startup storms into smart home market']);
miss('health', ['Health Secretary resigns over budget row']);
miss('war', ['Researchers grow crops in lunar soil', 'Bakery chain opens twenty stores']);
// "<" in a headline must not truncate it; real tags still stripped
assert.strictEqual(clean('Unemployment falls to <4% as hiring picks up in US'), 'Unemployment falls to <4% as hiring picks up in US');
assert.strictEqual(clean('<b>Bold</b> move <script>x()</script>by city'), 'Bold move by city');
// Trivial "default"/"price war" stories must not reach impact tier 3 (alert-eligible)
const imp = title => rankStories(['bbc', 'guardian', 'npr', 'nyt'].map((s, i) => ({ source: s, title, link: 'https://x.com/' + i, summary: '', ts: Date.now() - 36e5 })), { limit: 5 })[0].impact;
assert.ok(imp('Spotify changes default playlist view for everyone') < 3, 'default setting is not top impact');
assert.ok(imp('Price war erupts between UK supermarkets') < 3, 'price war is not a war');
assert.strictEqual(imp('Government defaults on sovereign debt payments'), 3);
assert.strictEqual(imp('Missile strikes hit city as war escalates'), 3);
// Reach is capped so an uneventful 6-outlet story cannot outrank a serious 2-outlet one
const mk = (t, srcs) => srcs.map((s, i) => ({ source: s, title: t, link: 'https://x.com/' + t.length + s + i, summary: '', ts: Date.now() - 36e5 }));
const order = rankStories([...mk('Royal portrait unveiled at gallery', ['bbc', 'guardian', 'npr', 'nyt', 'aljazeera', 'dw']), ...mk('Military coup topples government in capital', ['bbc', 'nyt'])], { limit: 5 });
assert.ok(/coup/i.test(order[0].title), 'serious 2-outlet story outranks fluffy 6-outlet story: ' + order.map(o => o.title));
// Cross-outlet wording
const pair = (a, b) => rankStories([{ source: 'bbc', title: a, link: 'https://x.com/a', summary: '', ts: Date.now() - 36e5 }, { source: 'guardian', title: b, link: 'https://x.com/b', summary: '', ts: Date.now() - 36e5 }]).length;
assert.strictEqual(pair('Fed cuts interest rates by quarter point', 'Federal Reserve cuts interest rates by quarter point'), 1);
assert.strictEqual(pair('Powerful quake hits Japan coast, tsunami warning issued', 'Strong earthquake hits Japan coast, tsunami warning issued'), 1);
assert.strictEqual(pair('Senate passes funding bill', 'Senate rejects funding bill'), 0);
console.log('review probe tests passed');
