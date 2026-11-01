// Diagnostic: fetch every built-in feed once and print HTTP status / item count / newest age. Not a pass/fail test.
const Parser = require('rss-parser');
const { FEEDS } = require('../src/sources');
const p = new Parser({ timeout: 10000 });
async function feeds() {
  for (const group of ['world', 'tech']) for (const [k, u] of FEEDS[group]) {
    const t = Date.now();
    try {
      const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'DailyNewsWidget/1.0', 'Accept-Encoding': 'gzip, br' } });
      const body = await r.text(); let n = '-', age = '-';
      try {
        const f = await p.parseString(body); // parse once, reuse for count, age and headline dump
        n = f.items.length;
        const ts = Math.max(...f.items.map(i => Date.parse(i.isoDate || '') || 0)); age = ts ? Math.round((Date.now() - ts) / 36e5) + 'h' : 'n/a';
        f.items.slice(0, 25).forEach(i => console.log('T|' + group + '|' + k + '|' + i.title));
      } catch (e) { n = 'parse-error: ' + String(e.message).slice(0, 60); }
      console.log(`${group.padEnd(5)} ${k.padEnd(10)} HTTP ${r.status} ${r.url.slice(0, 60)} items=${n} newest=${age} ${Date.now() - t}ms`);
    } catch (e) { console.log(`${group.padEnd(5)} ${k.padEnd(10)} ERROR ${e.message}`); }
  }
}

// Run the app's real fetch+rank pipeline (Node fetch) and show how many stories survive the 2-outlet filter.
async function pipeline() {
  const { fetchAll } = require('../src/fetcher');
  const r = await fetchAll({ country: 'US', state: 'California', topics: require('../src/topics').IDS });
  for (const k of ['world', 'country', 'state', 'tech']) console.log(`PIPELINE ${k}: ${r[k].length} stories`, r[k].slice(0, 3).map(s => `[${s.sources.join('+')}] ${s.title.slice(0, 70)}`));
}

feeds().then(pipeline);
