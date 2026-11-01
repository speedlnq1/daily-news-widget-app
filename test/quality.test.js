// Clickbait / opinion / sponsored filter with realistic headlines.
const assert = require('assert');
const { isLowQuality, rankStories, SOFT } = require('../src/rank');
const L = (title, link = 'https://www.example.com/world/2026/oct/31/story') => ({ title, link });
const bad = [
  ['10 things you need to know about the new iPhone'], ['7 reasons your commute is getting worse'], ["You won't believe what this senator said"], ['Shocking video shows what happened next'],
  ['Why is everyone suddenly talking about this tiny country?'], ['Is this the end of the Fed as we know it?'], ['Markets TUMBLE!!! Investors PANIC'], ['BREAKING NEWS ALERT FROM WASHINGTON TODAY'],
  ['The best laptops to buy in 2026'], ['Prime Day deals: 40% off headphones'], ['Sponsored: how to save on your energy bill'], ['Opinion: The Fed is making a mistake'],
  ['Editorial: Our view on the budget'], ['Podcast: this week in tech'], ['Review: the new Pixel is great'], ['Quiz: how well do you know world capitals'],
  ['Mayor says city will cut taxes...'], ['Shocking scenes at the council meeting'],
  ['The Fed is wrong about inflation', 'https://www.theguardian.com/commentisfree/2026/oct/31/the-fed-is-wrong'], ['What the budget means for you', 'https://www.nytimes.com/2026/10/31/opinion/budget.html'],
  ['Best budget phones', 'https://www.theverge.com/deals/2026/10/31/best-phones'],
  ['Why the minister must go', 'https://www.dailymaverick.co.za/opinionista/2026-10-31-why-the-minister-must-go/'],
  ['Inside Story', 'https://www.france24.com/en/tv-shows/inside-story/20261031-the-week'], ['Live: protests in France', 'https://www.france24.com/en/live-news/20261031-protests']
];
bad.forEach(([t, l]) => assert.ok(isLowQuality(L(t, l)), 'should be filtered: ' + t));
const good = ['Fed cuts interest rates by a quarter point', 'Hamas says it received a new ceasefire proposal', 'Magnitude 7.1 earthquake strikes off Japan, tsunami warning issued',
  'Senate passes $1.2 trillion spending bill, averting shutdown', 'Opinion polls show tight race in key states', 'Apple reports record quarterly revenue of $94 billion',
  'Review of police shooting finds officers followed policy', 'UN Security Council votes to extend peacekeeping mission', 'EU agrees 20th sanctions package against Russia',
  'Researchers report new treatment slows Alzheimer’s progression', 'OpenAI releases GPT-6 with longer context window', 'Storm kills 12 in Philippines as typhoon makes landfall',
  'Court rules Texas abortion law can take effect', 'Unemployment falls to <4% as hiring picks up'];
good.forEach(t => assert.ok(!isLowQuality(L(t)), 'must NOT be filtered: ' + t));
// end to end: clickbait never reaches the list even when two outlets carry it; hard news does
const mk = (title, srcs, link = 'https://x.com/w/') => srcs.map((s, i) => ({ source: s, title, link: link + title.length + s + i, summary: '', ts: Date.now() - 36e5 }));
const out = rankStories([...mk("You won't believe what the Fed just did!", ['bbc', 'guardian', 'nyt']), ...mk('Fed cuts interest rates by a quarter point', ['bbc', 'guardian'])]);
assert.deepStrictEqual(out.map(o => o.title), ['Fed cuts interest rates by a quarter point']);
// analysis/live pieces rank below straight reporting at equal reach
const sc = t => rankStories(mk(t, ['bbc', 'guardian']))[0].score;
const penalty = sc('Senate passes sweeping tax overhaul bill') - sc('Analysis: Senate passes sweeping tax overhaul bill');
assert.ok(Math.abs(penalty - 1.5) < 0.2, 'analysis gets the soft penalty, got ' + penalty);
assert.ok(SOFT.test('Pope Francis dies – live'));
// regressions from blind review: legitimate hard news must survive
['Yahoo! agrees sale to Verizon', 'Biden: "We will not back down!" as strikes continue', 'Brutal heatwave kills hundreds in India',
 'Epic Games wins antitrust case against Google', 'General promoted to army chief', 'Video-game makers cut 10,000 jobs',
 'Watch-maker Swatch cuts jobs', '10 times more cases than last year, WHO warns', 'Review: Inquiry into Grenfell published'.replace('Review: ', 'Inquiry: ')]
  .forEach(t => assert.ok(!isLowQuality(L(t)), 'false positive: ' + t));
['Watch: Rocket launch from Cape Canaveral', 'Video - storm hits coast', 'Review: new phone is great'].forEach(t => assert.ok(isLowQuality(L(t)), 'should filter: ' + t));
// original headline is shown as the outlet wrote it (only whitespace/HTML cleaned)
const orig = 'Fed cuts interest rates by a quarter point, signals further easing';
assert.strictEqual(rankStories(mk(orig, ['bbc', 'guardian']))[0].title, orig);
console.log('quality tests passed');
