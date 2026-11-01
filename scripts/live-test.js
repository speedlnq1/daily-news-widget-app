// Live-feed check: runs the real fetch + ranking against the internet (no Electron) and writes a report.
// Usage: node scripts/live-test.js [out.json]   (needs internet; run by the "Live feeds" CI job)
const fs = require('fs');
const { gather } = require('../src/fetcher');
const { FEEDS, stateFeeds, countryList, regionMatch } = require('../src/sources');
const GEO = require('../src/geo');
const { isLowQuality, rankStories, tokens, similarity, same, conflict, caps, capsAll, distinct } = require('../src/rank');

const CASES = [
  { country: 'US', state: 'California' }, { country: 'US', state: 'Texas' }, { country: 'US', state: 'Washington State' },
  { country: 'GB', state: 'Scotland' }, { country: 'CA', state: 'Ontario' }, { country: 'AU', state: 'Victoria' },
  { country: 'IN', state: 'Maharashtra' }, { country: 'NZ', state: 'Wellington' }, { country: 'ZA', state: 'Gauteng' }, { country: 'SG', state: '' }, { country: 'IE', state: '' }, { country: 'FJ', state: '' }, { country: 'ES', state: '' }, { country: 'DE', state: 'Bavaria' }, { country: 'MX', state: '' }, { country: 'BR', state: '' }, { country: 'AR', state: '' }, { country: 'CO', state: '' }, { country: 'CL', state: '' }, { country: 'PE', state: '' }, { country: 'NG', state: 'Lagos' }
];
const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const name = c => { try { return dn.of(c); } catch { return c; } };
const now = Date.now();
const age = ts => ts ? +((now - ts) / 36e5).toFixed(1) : null;

function describe(stories, raw) {
  const byLink = new Map(raw.map(r => [r.link, r]));
  return stories.map(s => ({
    title: s.title, impact: s.impact, indep: s.indep, sources: s.sources, ageH: age(s.ts), score: +s.score.toFixed(1),
    members: s.links.map(l => byLink.get(l)).filter(Boolean).map(r => `${r.source}: ${r.title}`)
  }));
}
// Different-outlet headlines that look alike but ended up in different clusters (possible missed merges).
function missed(stories, raw) {
  const owner = new Map(); stories.forEach((s, i) => s.links.forEach(l => owner.set(l, i)));
  const out = [], seen = new Set(), items = raw.filter(r => owner.has(r.link));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.source === b.source || owner.get(a.link) === owner.get(b.link)) continue;
    const sim = similarity(tokens(a.title), tokens(b.title));
    const k = [owner.get(a.link), owner.get(b.link)].join();
    if (sim >= 0.3 && !seen.has(k)) {
      seen.add(k);
      const ta = tokens(a.title), tb = tokens(b.title), ca = caps(a.title), cb = caps(b.title);
      out.push({ sim: +sim.toFixed(2), why: conflict(ta, tb, ca, cb) ? 'CONFLICT uniqA=' + [...ca].filter(w => !tb.includes(w)).join('/') + ' uniqB=' + [...cb].filter(w => !ta.includes(w)).join('/') : same(ta, tb, ca, cb, capsAll(a.title), capsAll(b.title), capsAll(a.title), capsAll(b.title)) ? 'same-but-not-clustered' : 'low-overlap', a: `${a.source}: ${a.title}`, b: `${b.source}: ${b.title}` });
    }
  }
  return out.sort((x, y) => y.sim - x.sim).slice(0, 15);
}
// Same rule as main.js: breaking = high impact, 3+ independent outlets, first seen < 6h ago.
const breaking = (s) => (s.impact >= 3 || (s.impact >= 2 && s.indep >= 4)) && s.indep >= 3 && s.firstTs > 0 && now - s.firstTs < 6 * 36e5;

async function nytProbe() {
  const Parser = require('rss-parser'); const parser = new Parser();
  const secs = ['World', 'US', 'Technology', 'Business', 'Politics', 'Science', 'Health', 'Climate', 'Europe', 'AsiaPacific', 'MiddleEast', 'Americas', 'Africa', 'HomePage'];
  const rows = [];
  for (const sec of secs) {
    const url = `https://rss.nytimes.com/services/xml/rss/nyt/${sec}.xml`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'DailyNewsWidget/1.0', 'Accept-Encoding': 'gzip, br' }, signal: AbortSignal.timeout(10000) });
      const body = await res.text();
      let n = 0, sample = '', linkOk = 0;
      try { const f = await parser.parseString(body); n = f.items.length; sample = f.items[0] && f.items[0].title; linkOk = f.items.filter(i => /^https:\/\/www\.nytimes\.com\//.test(i.link || '')).length; } catch (e) { sample = 'PARSE ERROR ' + e.message; }
      rows.push(`${res.status} ${sec} bytes=${body.length} items=${n} httpsLinks=${linkOk} etag=${!!res.headers.get('etag')} | ${sample}`);
    } catch (e) { rows.push(`ERR ${sec} ${e.message}`); }
  }
  return rows;
}
const CANDIDATES = (process.env.PROBE || '').split(/\s+/).filter(Boolean);
async function candidateProbe() {
  const Parser = require('rss-parser'); const parser = new Parser(); const rows = [];
  for (const url of CANDIDATES) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'DailyNewsWidget/1.0', 'Accept-Encoding': 'gzip, br' }, signal: AbortSignal.timeout(10000) });
      const body = await res.text(); let n = 0, sample = '', ts = [], https = 0;
      try { const f = await parser.parseString(body); n = f.items.length; sample = (f.items[0] || {}).title; ts = f.items.map(i => Date.parse(i.isoDate || '')).filter(Boolean); https = f.items.filter(i => /^https:/.test(i.link || '')).length; } catch (e) { sample = 'PARSE ERROR ' + e.message; }
      const paths = (parsed => parsed.slice(0, 8).join(' '))(await (async () => { try { return (await parser.parseString(body)).items.map(i => new URL(i.link).pathname.split('/').slice(0, 3).join('/')); } catch { return []; } })()); rows.push(`PATHS ${paths}`); rows.push(`${res.status} final=${res.url.slice(0, 80)} n=${n} https=${https} newest=${ts.length ? age(Math.max(...ts)) : '-'}h bytes=${body.length} | ${url} | ${sample}`);
    } catch (e) { rows.push(`ERR ${url} ${e.message} ${e.cause ? e.cause.code || e.cause.message : ''}`); }
  }
  return rows;
}
(async () => {
  const report = { at: new Date(now).toISOString(), feeds: [], tabs: {} };
  const probe = async (tab, list) => {
    const rows = await Promise.all(list.map(async ([k, u]) => {
      const t0 = Date.now(); const items = await gather([[k, u]]);
      const ts = items.map(i => i.ts).filter(Boolean);
      return { tab, key: k, url: u, n: items.length, newestH: ts.length ? age(Math.max(...ts)) : null, ms: Date.now() - t0 };
    }));
    report.feeds.push(...rows);
  };
  // fixed feeds
  await probe('world', FEEDS.world); await probe('tech', FEEDS.tech);
  for (const c of Object.keys(FEEDS.country)) await probe('country:' + c, FEEDS.country[c]);

  const world = await gather(FEEDS.world), tech = await gather(FEEDS.tech);
  const W = rankStories(world), T = rankStories(tech, { profile: 'tech', localOk: true, singleCap: 2 });
  report.tabs.world = { stories: describe(W, world), missed: missed(W, world), rawCount: world.length, breaking: W.filter(breaking).map(s => s.title) };
  report.tabs.tech = { stories: describe(T, tech), missed: missed(T, tech), rawCount: tech.length, verifiedCount: T.filter(s => s.verified).length, singleSourceCount: T.filter(s => !s.verified).length, breaking: T.filter(breaking).map(s => s.title) };

  for (const c of CASES) {
    const id = `${c.country}${c.state ? '/' + c.state : ''}`;
    const cf = countryList(c.country, name(c.country));
    const craw = await gather(cf);
    const C = rankStories(craw, { minSources: 2, profile: 'country' });
    let S = [], sraw = [];
    const hasRegions = c.state && GEO.hasRegions(c.country);
    if (hasRegions) { sraw = (await gather(stateFeeds(c.state, c.country, name(c.country)))).filter(i => regionMatch(c.state).test(i.title)); S = rankStories(sraw, { localOk: true, profile: 'state' }); }
    report.tabs[id] = {
      country: { curated: !!FEEDS.country[c.country], rawCount: craw.length, stories: describe(C, craw), missed: missed(C, craw), breaking: C.filter(breaking).map(s => s.title) },
      state: { hasRegions: !!hasRegions, rawCount: sraw.length, stories: describe(S, sraw), singleSource: S.filter(s => !s.verified).length }
    };
  }
  fs.writeFileSync(process.argv[2] || 'live-report.json', JSON.stringify(report, null, 1));

  // Human summary
  const L = [];
  L.push('# Live feed report ' + report.at, '', '## Feeds (items / newest age h / ms)');
  for (const f of report.feeds) L.push(`${f.n === 0 ? 'FAIL' : 'ok  '} ${f.tab} ${f.key} n=${f.n} newest=${f.newestH}h ${f.ms}ms ${f.url}`);
  if (CANDIDATES.length) L.push('', '## Candidate feeds', ...(await candidateProbe()));
  L.push('', '## NYT section feeds', ...(await nytProbe()));
  const nyt = [...world, ...tech];
  L.push('NYT stories in world top10: ' + report.tabs.world.stories.filter(s => s.sources.includes('NYT')).length + ', multi-outlet with NYT: ' + report.tabs.world.stories.filter(s => s.sources.includes('NYT') && s.indep > 1).length);
  L.push('NYT stories in tech top10: ' + report.tabs.tech.stories.filter(s => s.sources.includes('NYT')).length);
  {
    const kept = tech.filter(r => !isLowQuality(r)), dropped = tech.filter(r => isLowQuality(r));
    const old = kept.filter(r => r.ts && now - r.ts > 72 * 36e5);
    const all = rankStories(tech, { profile: 'tech', minSources: 1, limit: 1000 });
    const bySrc = {}; tech.forEach(r => { const o = bySrc[r.source] || (bySrc[r.source] = { raw: 0, lowQuality: 0 }); o.raw++; if (isLowQuality(r)) o.lowQuality++; });
    L.push('', '## Tech diagnostics', `raw items ${tech.length}; dropped by quality filter ${dropped.length}; older than 72h ${old.length}`,
      `clusters ${all.length}; with 2+ independent outlets ${all.filter(c => c.indep >= 2).length}; single-outlet ${all.filter(c => c.indep < 2).length}`,
      'per outlet (raw / dropped by quality): ' + Object.entries(bySrc).map(([k, o]) => `${k} ${o.raw}/${o.lowQuality}`).join(', '),
      'quality-filter samples: ' + dropped.slice(0, 12).map(r => `[${r.source}] ${r.title}`).join(' | '));
  }
  const dump = (label, t) => {
    L.push('', `## ${label}: ${t.stories.length} stories (raw ${t.rawCount})`);
    t.stories.forEach((s, i) => L.push(`${i + 1}. [i${s.impact} x${s.indep} ${s.ageH}h] ${s.title}${s.members.length > 1 ? '\n     ' + s.members.join('\n     ') : ''}`));
    if (t.missed && t.missed.length) { L.push('  possible missed merges:'); t.missed.forEach(m => L.push(`   ${m.sim} [${m.why}] ${m.a} || ${m.b}`)); }
    if (t.breaking && t.breaking.length) L.push('  would alert: ' + t.breaking.join(' | '));
  };
  dump('world', report.tabs.world); dump('tech', report.tabs.tech);
  for (const c of CASES) { const id = `${c.country}${c.state ? '/' + c.state : ''}`; dump(id + ' country', report.tabs[id].country); dump(id + ' state', report.tabs[id].state); }
  if (process.env.RAW) {
    const rawDump = (label, raw) => { L.push('', '## RAW ' + label); raw.slice().sort((a, b) => b.ts - a.ts).forEach(r => L.push(`${r.source} ${age(r.ts)}h ${r.title}`)); };
    rawDump('world', world); rawDump('IN/Maharashtra state', await gather(stateFeeds('Maharashtra', 'IN', 'India')));
  }
  fs.writeFileSync((process.argv[2] || 'live-report.json').replace(/\.json$/, '.txt'), L.join('\n'));
  console.log(L.join('\n'));
})();
