const Parser = require('rss-parser');
const { FEEDS, stateFeeds, countryList, countryMatch, regionMatch } = require('./sources');
const GEO = require('./geo');
const { rankStories } = require('./rank');

let doFetch = (...a) => fetch(...a); // main swaps in electron.net.fetch (honours Windows proxy settings)
const setFetch = fn => { doFetch = fn; };
const cache = new Map(); // url -> { etag, lastModified, items }; small, in memory only
const MAX_CACHE = 60;
let changed = 0, answered = 0, last = null, lastKey = '';
const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'DailyNewsWidget/1.0' } });

// Map Google News "Title - Outlet" suffixes onto trusted keys.
const NAME_TO_KEY = {
  'associated press': 'ap', 'ap news': 'ap', 'bbc': 'bbc', 'bbc news': 'bbc', 'npr': 'npr',
  'the guardian': 'guardian', 'pbs newshour': 'pbs', 'pbs news': 'pbs', 'pbs': 'pbs', 'cbs news': 'cbs',
  'abc news': 'abc', 'the associated press': 'ap', 'associated press': 'ap', 'al jazeera english': 'aljazeera', 'npr.org': 'npr', 'the new york times': 'nyt', 'al jazeera': 'aljazeera', 'dw': 'dw',
  'sky news': 'sky', 'the independent': 'independent', 'independent': 'independent', 'rnz': 'rnz', 'cbc news': 'cbc', 'cbc.ca': 'cbc',
  'the straits times': 'straitstimes', 'cna': 'cna', 'channel newsasia': 'cna', 'rté': 'rte', 'rte': 'rte', 'daily maverick': 'dailymaverick',
  'the sydney morning herald': 'smh', 'sydney morning herald': 'smh', 'global news': 'globalnews'
};

async function pull(key, url) {
  try {
    const prev = cache.get(url);
    const headers = { 'User-Agent': 'DailyNewsWidget/1.0', 'Accept-Encoding': 'gzip, br' };
    if (prev && prev.etag) headers['If-None-Match'] = prev.etag;
    if (prev && prev.lastModified) headers['If-Modified-Since'] = prev.lastModified;
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 10000);
    let res;
    try { res = await doFetch(url, { redirect: 'follow', signal: ctl.signal, headers }); } finally { clearTimeout(timeout); } // don't leave a pending timer per request
    if (res.status === 304 && prev) { answered++; return prev.items; } // nothing changed: no body downloaded
    // never accept a feed that redirected away from https, and cap the body size
    if (!res.ok || new URL(res.url || url).protocol !== 'https:') return prev ? prev.items : [];
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 3e6) return [];
    const body = await res.text();
    if (body.length > 3e6) return [];
    const feed = await parser.parseString(body);
    const items = feed.items.slice(0, 40).map(i => {
      let source = key, title = String(i.title || '');
      if (key === 'gnews') {
        const m = title.match(/^(.*) - ([^]+?)$/s);
        // outlet name is the text after the LAST ' - '
        if (m && m[1].includes(' - ')) { const k = title.lastIndexOf(' - '); m[1] = title.slice(0, k); m[2] = title.slice(k + 3); }
        if (!m) return null;
        source = NAME_TO_KEY[m[2].trim().toLowerCase()];
        if (!source) return null;
        title = m[1];
      }
      return {
        source, title, link: i.link, search: key === 'gnews',
        summary: key === 'gnews' ? '' : String(i.contentSnippet || i.summary || i.content || ''),
        ts: Date.parse(i.isoDate || '') || 0
      };
    }).filter(Boolean);
    if (cache.size >= MAX_CACHE && !cache.has(url)) cache.delete(cache.keys().next().value);
    changed++; answered++;
    cache.set(url, { etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'), items });
    return items;
  } catch (e) {
    const prev = cache.get(url);
    return prev ? prev.items : [];
  }
}

async function gather(list) {
  const res = await Promise.all(list.map(([k, u]) => pull(k, u)));
  return res.flat();
}

async function fetchAll(settings) {
  const show = settings.topics; // ids of the topics the user picked
  if (!show.length) return { world: [], country: [], state: [], tech: [], fetchedAt: Date.now() }; // nothing picked: nothing to fetch
  changed = 0; answered = 0;
  const name = c => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c); } catch { return c; } };
  // Only the selected country (and region) is fetched. Outlets rarely overlap on country news, so a story from
  // one trusted outlet is shown too (labelled, after the multi-outlet ones, at most 2 per outlet).
  const keep = countryMatch(settings.country, name(settings.country));
  const own = new Set((FEEDS.country[settings.country] || []).map(f => f[0])); // outlets we already read directly
  const useRegion = settings.state && GEO.hasRegions(settings.country);
  const [world, country, state, tech] = await Promise.all([
    gather(FEEDS.world),
    gather(countryList(settings.country, name(settings.country))).then(r => r.filter(i => !i.search || (keep(i.title) && !own.has(i.source)))),
    useRegion ? gather(stateFeeds(settings.state, settings.country, name(settings.country))).then(r => r.filter(i => regionMatch(settings.state).test(i.title))) : [],
    gather(FEEDS.tech)
  ]);
  if (!answered) return { world: [], country: [], state: [], tech: [], fetchedAt: Date.now(), offline: true }; // fully offline
  const key = settings.country + '|' + settings.state + '|' + show.join(',');
  // Every feed answered 304 Not Modified: skip re-ranking entirely.
  if (!changed && last && lastKey === key) return { ...last, fetchedAt: Date.now() };
  lastKey = key;
  return (last = {
    world: rankStories(world, { show }),
    country: rankStories(country, { minSources: 2, localOk: true, singleCap: 2, profile: 'country', show }),
    state: rankStories(state, { localOk: true, profile: 'state', show }),
    tech: rankStories(tech, { profile: 'tech', localOk: true, singleCap: 2, show }),
    fetchedAt: Date.now()
  });
}

module.exports = { fetchAll, setFetch, gather, NAME_TO_KEY };
