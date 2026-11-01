// Tech tab: single trusted-outlet stories fill the list (labelled), multi-outlet stories rank first.
const assert = require('assert');
const { rankStories } = require('../src/rank');
const now = Date.now(), h = n => now - n * 36e5;
const it = (source, title, ago, path) => ({ source, title, link: `https://www.example.com/${path}`, summary: '', ts: h(ago) });
const items = [
  it('arstechnica', 'Nvidia unveils new Blackwell data centre chip', 2, 'a1'),
  it('techcrunch', 'Nvidia unveils new Blackwell data centre chip for cloud', 3, 'a2'),
  it('verge', 'Apple launches redesigned MacBook Air with M5 processor', 1, 'b1'),
  it('wired', 'Researchers find flaw in widely used router firmware', 4, 'c1'),
  it('arstechnica', 'Linux kernel adds support for new Rust drivers', 5, 'd1'),
  it('techcrunch', 'Startup raises funding for robot warehouse pickers', 6, 'e1'),
];
const out = rankStories(items, { profile: 'tech', localOk: true });
assert.strictEqual(out.length, 5, 'single-outlet tech stories should appear');
assert.strictEqual(out[0].verified, true, 'multi-outlet story ranks first and is verified');
assert.ok(out.slice(1).every(s => s.verified === false), 'single-outlet stories are labelled unverified');
assert.strictEqual(rankStories(items, { profile: 'tech' }).length, 1, 'default still requires 2 outlets');
console.log('tech-tab ok');

// one outlet must not flood the tab; verified stories always first
const flood = [it('arstechnica', 'Nvidia unveils new Blackwell data centre chip', 40, 'o1'), it('techcrunch', 'Nvidia unveils new Blackwell data centre chip for cloud', 41, 'o2')];
const topics = ['Apple ships macOS update', 'Google tests Gemini browser mode', 'Meta delays smart glasses launch', 'Tesla recalls robotaxi software', 'Intel confirms foundry customer', 'Samsung reveals foldable phone', 'Microsoft patches Windows zero-day', 'Amazon expands drone delivery', 'Netflix adds cloud gaming tier', 'Sony raises console prices', 'Oracle wins cloud contract', 'Adobe launches video generator'];
topics.forEach((t, i) => flood.push(it('verge', t, 1 + i * 0.1, 'v' + i)));
const f = rankStories(flood, { profile: 'tech', localOk: true, singleCap: 2 });
assert.strictEqual(f[0].verified, true, 'verified story sorts first even when older');
assert.strictEqual(f.filter(s => !s.verified).length, 2, 'single-source capped at 2 per outlet');
assert.strictEqual(f.length, 3);
console.log('tech-tab cap ok');
