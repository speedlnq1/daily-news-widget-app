// The story card is built only from feed data: per-outlet links and a short, sanitized detail text.
const assert = require('assert');
const { rankStories } = require('../src/rank');
const now = Date.now(), h = n => now - n * 36e5;
const it = (source, title, ago, path, summary = '') => ({ source, title, link: `https://www.example.com/${path}`, summary, ts: h(ago) });
const long = 'Officials said the quake struck offshore. '.repeat(30);
const [s] = rankStories([
  it('bbc', 'Magnitude 7 earthquake strikes off Japan coast', 2, 'bbc1', '<p>Officials said <b>no tsunami</b> warning &amp; checks continue.</p><script>alert(1)</script>'),
  it('guardian', 'Magnitude 7 earthquake strikes off Japan coast, tsunami warning lifted', 3, 'g1', long),
  it('guardian', 'Magnitude 7 earthquake strikes off Japan coast, tsunami warning lifted again', 4, 'g2'),
]);
assert.deepStrictEqual(s.articles.map(a => a.link).sort(), ['https://www.example.com/bbc1', 'https://www.example.com/g1'], 'one link per outlet, newest first');
assert.strictEqual(s.articles.length, s.sources.length, 'every outlet in the story is listed');
assert.ok(s.detail.length > s.summary.length && s.detail.length <= 381 && s.detail.endsWith('…'), 'detail is longer than the summary but still short: ' + s.detail.length);
const [t] = rankStories([it('bbc', 'Magnitude 7 earthquake strikes off Japan coast', 2, 'a', '<p>Officials said <b>no tsunami</b> warning &amp; checks continue.</p><script>alert(1)</script>'), it('guardian', 'Magnitude 7 earthquake strikes off Japan coast again', 3, 'b')]);
assert.ok(!/[<>]/.test(t.detail) && t.detail.includes('no tsunami warning & checks'), 'tags stripped, entities decoded: ' + t.detail);
// community (Reddit) cards must never be tagged "single trusted source": they carry their own label instead
assert.ok(/if \(!s\.verified && !s\.label\) m\.appendChild\(el\('span', 'tag', 'single trusted source'\)\)/.test(require('fs').readFileSync(require('path').join(__dirname, '../src/renderer.js'), 'utf8')), 'card tag skips labelled community cards');
console.log('story-card ok');
