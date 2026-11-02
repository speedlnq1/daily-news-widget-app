const Parser = require('rss-parser');
const { FEEDS, SECTIONS, HOME, NATIONAL, sectionsFor, sectionTopics, stateFeeds, countryList, countryMatch, regionMatch } = require('./sources');
const TOPICS = require('./topics');
const GEO = require('./geo');
const { rankStories } = require('./rank');

let doFetch = (...a) => fetch(...a); // main swaps in electron.net.fetch (honours Windows proxy settings)
const setFetch = fn => { doFetch = fn; };
const cache = new Map(); // url -> { etag, lastModified, items }; small, in memory only
const MAX_CACHE = 120; // every feed and topic section, so each keeps its ETag
let answered = 0; // feeds that answered this round (0 means offline)
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

// How each tab ranks: World needs 2+ independent outlets; the other tabs also show single-outlet stories, labelled.
const TABS = {
  world: {},
  country: { minSources: 2, localOk: true, singleCap: 2, profile: 'country' },
  state: { localOk: true, profile: 'state' },
  tech: { profile: 'tech', localOk: true, singleCap: 2 }
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
        summary: key === 'gnews' ? '' : String(i.contentSnippet || i.summary || i.content || '').slice(0, 600), // only the start is ever shown
        ts: Date.parse(i.isoDate || '') || 0
      };
    }).filter(Boolean);
    if (cache.size >= MAX_CACHE && !cache.has(url)) cache.delete(cache.keys().next().value);
    answered++;
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

// Country tab items: hand-picked feeds plus a trusted-outlet search; search items must name the country in the headline
// and must not come from an outlet that is already read directly.
async function countryItems(code, countryName) {
  const keep = countryMatch(code, countryName), own = new Set((FEEDS.country[code] || []).map(f => f[0]));
  return (await gather(countryList(code, countryName))).filter(i => !i.search || (keep(i.title) && !own.has(i.source)));
}
const TOP = 10; // stories per tab: the same limit rankStories uses
const short = tabs => ['world', 'country', 'tech'].some(k => tabs[k].length < TOP);
const rankTabs = (pools, show) => ({
  world: rankStories(pools.world, { ...TABS.world, show }),
  country: rankStories(pools.country, { ...TABS.country, show }),
  state: rankStories(pools.state, { ...TABS.state, show }),
  tech: rankStories(pools.tech, { ...TABS.tech, show }),
  fetchedAt: Date.now()
});

async function fetchAll(settings) {
  const show = settings.topics; // ids of the topics the user picked
  if (!show.length) return { world: [], country: [], state: [], tech: [], fetchedAt: Date.now() }; // nothing picked: nothing to fetch
  answered = 0;
  const name = c => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c); } catch { return c; } };
  // Only the selected country (and region) is fetched. Outlets rarely overlap on country news, so a story from
  // one trusted outlet is shown too (labelled, after the multi-outlet ones, at most 2 per outlet).
  const countryName = name(settings.country), keep = countryMatch(settings.country, countryName);
  const inRegion = settings.state && GEO.hasRegions(settings.country) ? regionMatch(settings.state) : null;
  const [world, country, state, tech] = await Promise.all([
    gather(FEEDS.world),
    countryItems(settings.country, countryName),
    inRegion ? gather(stateFeeds(settings.state, settings.country, countryName)).then(r => r.filter(i => inRegion.test(i.title))) : [],
    gather(FEEDS.tech)
  ]);
  if (!answered) return { world: [], country: [], state: [], tech: [], fetchedAt: Date.now(), offline: true }; // fully offline
  let tabs = rankTabs({ world, country, state, tech }, show);
  // A narrow topic pick (say, only Sports and Health) can leave tabs short. Then the topic sections of the same trusted
  // outlets are read too, and the Tech tab's feeds also count for World. Every story still needs the same outlets.
  const sections = show.length < TOPICS.IDS.length && short(tabs) ? sectionsFor(show) : [];
  if (sections.length) {
    const extra = (await Promise.all(sections.map(sec => gather(SECTIONS[sec]).then(r => r.map(i => ({ ...i, section: sec, topics: sectionTopics(sec) })))))).flat();
    // Each section story goes only where it belongs: Country when its headline names the country (or it is the
    // national politics section of an outlet from there), Local when its headline names the region, AI & Tech only
    // from the AI and crypto sections. Section copies come first so that an article in both feeds keeps its topic.
    const forCountry = extra.filter(i => keep(i.title) || (NATIONAL.has(i.section) && HOME[i.source] === settings.country));
    const forState = inRegion ? extra.filter(i => inRegion.test(i.title)) : [];
    const forTech = extra.filter(i => i.section === 'ai' || i.section === 'crypto');
    tabs = rankTabs({ world: uniq([...extra, ...world, ...tech]), country: uniq([...forCountry, ...country]), state: uniq([...forState, ...state]), tech: uniq([...forTech, ...tech]) }, show);
  }
  return tabs;
}
// The same article can sit in an outlet's main feed and in a section feed: keep it once.
function uniq(items) {
  const seen = new Set();
  return items.filter(i => { const k = i.source + '|' + i.title; if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { fetchAll, setFetch, gather, countryItems, NAME_TO_KEY, TABS };
