// Every country and region in the pickers gets a working feed, and only the chosen place is fetched.
const assert = require('assert');
const GEO = require('../src/geo');
const { TRUSTED, FEEDS, stateFeeds, countryList, countryMatch, regionMatch } = require('../src/sources');
const { fetchAll, setFetch } = require('../src/fetcher');

const trusted = url => /^https:\/\/(news\.google\.com|rss\.dw\.com|www\.theguardian\.com|feeds\.bbci\.co\.uk|www\.rnz\.co\.nz|www\.cbc\.ca|www\.abc\.net\.au|www\.thehindu\.com|feeds\.npr\.org|www\.pbs\.org|www\.cbsnews\.com|abcnews\.go\.com|rss\.nytimes\.com|feeds\.skynews\.com|www\.independent\.co\.uk|www\.smh\.com\.au|globalnews\.ca|www\.straitstimes\.com|www\.channelnewsasia\.com|www\.rte\.ie|www\.dailymaverick\.co\.za)\//.test(url);
const HAND_WRITTEN = ['Georgia (US state)', 'District of Columbia', 'West Coast', 'North West', 'Saxony', 'Saxony-Anhalt', 'Lower Saxony', 'Wales', 'England', 'Canterbury', 'Nelson', 'Tasman']; // these match place cues, not just the name
const dn = new Intl.DisplayNames(['en'], { type: 'region' });
for (const c of GEO.CODES) {
  const feeds = countryList(c, dn.of(c));
  assert(feeds.length >= 1 && feeds.every(([, u]) => trusted(u)), 'country feed for ' + c);
  for (const r of GEO.REGIONS[c] || []) {
    assert(stateFeeds(r, c, dn.of(c)).every(([, u]) => trusted(u)), 'region feed for ' + r);
    if (!HAND_WRITTEN.includes(r)) assert(regionMatch(r).test(r), 'region matcher for ' + r);
  }
}
// Country names that are also people, places or things: the headlines seen in a mock run must not pass.
const about = (code, title) => countryMatch(code, dn.of(code))(title);
for (const [code, title] of [
  ['GE', 'Atlanta mayor faces runoff as Georgia voters head back to the polls'], ['JO', 'Michael Jordan sells stake in Charlotte Hornets'],
  ['TR', 'How to roast a Thanksgiving turkey'], ['GN', 'Papua New Guinea earthquake kills dozens'], ['TD', 'Chad Daybell sentenced to death'],
  ['SD', 'South Sudan peace talks stall'], ['MX', 'New Mexico governor signs budget'], ['IE', 'Northern Ireland assembly returns'],
  ['WS', 'American Samoa tuna cannery lays off workers'], ['PA', 'Panama City Beach hotel fire injures six'], ['NE', 'Niger Delta oil spill spreads'], ['PE', 'Peru, Indiana, school board votes on budget'],
  ['JO', 'Jordan Chiles wins appeal over Olympic medal'], ['NE', 'Niger Delta militants threaten pipelines'], ['GE', 'Georgia election officials certify results'], ['GE', 'Georgia protest over ICE raid'], ['GE', 'Trump, president, visits Georgia hurricane damage'], ['TR', 'Trump pardons turkey at the White House'], ['TR', 'Turkey Trot draws record crowd'], ['GE', 'Georgia government shutdown looms'], ['TR', 'Turkey recipe: how to cook a Thanksgiving dinner'], ['TD', 'Chad Daybell sentenced to death']
]) assert(!about(code, title), 'wrong place: ' + title);
for (const [code, title] of [
  ['GE', 'Georgia protesters clash with police in Tbilisi'], ['JO', 'Jordan and Egypt back Gaza ceasefire plan'], ['TR', 'Turkey raises interest rates'], ['TR', 'Turkey pardons jailed journalists'], ['GE', 'Georgia president vetoes bill'], ['GE', 'Georgia president Kavelashvili sworn in'], ['GE', 'Skaters on thin ice in Georgia protest at Tbilisi rink'],
  ['GN', 'Guinea junta delays election'], ['TD', 'Floods displace thousands in Chad'], ['GE', 'Georgia votes in parliamentary election'], ["GE", "Georgia's prime minister rejects EU criticism"], ['GE', 'EU suspends visa-free travel for Georgia'], ['PE', 'Peru, Indonesia sign trade pact'], ['PE', 'Peru India trade talks open'], ['NE', 'Niger state media says junta frees ex-president'], ['SD', 'Sudan army retakes Khartoum district'], ['MX', 'Mexico sends troops to border city'], ['IE', 'Ireland budget cuts VAT on food'],
  ['TD', 'Chad Declares State of Emergency After Floods'], ['TD', 'Chad Army Kills Rebels'], ['TR', 'Turkey Cooks Up New Trade Deal'], ['PA', 'Panama City port workers strike'], ['NE', 'Niger junta expels envoy'], ['PE', 'Peru president dismisses cabinet'], ['WS', 'Samoa elects new prime minister']
]) assert(about(code, title), 'right place: ' + title);
// Region names that are also other places: look-alike headlines must not pass, real ones must.
const inRegion = (r, t) => regionMatch(r).test(t);
for (const [r, t] of [['West Coast', 'West Coast storm hits California'], ['Canterbury', 'Canterbury Cathedral gets new roof'], ['Nelson', 'Nelson Mandela statue unveiled'], ['Tasman', 'Tasman Sea swell warning for Sydney'],
  ['North West', 'North West England rail strike'], ['Saxony', 'Lower Saxony votes on school reform'], ['Wales', 'New South Wales floods worsen'], ['Wales', 'Prince of Wales opens hospital'], ['Wales', 'Princess of Wales visits school'], ['Nelson', 'Willie Nelson hospitalized'], ['Nelson', 'Nelson Chamisa arrested'], ['Nelson', 'Floods in Nelson Mandela Bay'], ['Nelson', 'Nelson, B.C. wildfire forces evacuations'], ['Nelson', 'Lord Nelson pub fire'], ['Nelson', 'Willie Nelson cancels tour'], ['Nelson', 'Bill Nelson praises NASA launch'], ['Canterbury', 'Archbishop of Canterbury urges calm']]) assert(!inRegion(r, t), 'wrong region: ' + t);
for (const [r, t] of [['West Coast', 'Greymouth flooding closes roads'], ['Canterbury', 'Christchurch council approves stadium'], ['Nelson', 'Nelson hospital to expand'], ['Nelson', 'Flooding in Nelson closes roads'], ['Tasman', 'Abel Tasman National Park track reopens'], ['Tasman', 'Tasman council bans fireworks'],
  ['North West', 'Mahikeng water crisis deepens'], ['Saxony', 'Dresden protest draws thousands'], ['Wales', 'Wales sets new speed limit'], ['Wales', 'South Wales Police arrest two'], ['Nelson', 'Nelson City Council votes on rates']]) assert(inRegion(r, t), 'right region: ' + t);
// The popular countries are in the picker and have hand-picked feeds from trusted outlets.
for (const c of ['US', 'GB', 'ES', 'DE', 'MX', 'BR', 'AR', 'CO', 'CL', 'PE']) assert(GEO.CODES.includes(c) && FEEDS.country[c] && FEEDS.country[c].length, c + ' is in the picker with feeds');
for (const feeds of Object.values(FEEDS.country)) assert(feeds.every(([k]) => TRUSTED[k]), 'hand-picked feeds use trusted outlets');
assert(FEEDS.country.NZ.every(([, u]) => !u.includes('new-zealand')), 'NZ Guardian address');

(async () => {
  const asked = [];
  const now = new Date().toUTCString();
  const item = t => `<item><title><![CDATA[${t}]]></title><link>https://www.bbc.com/${Math.random().toString(36).slice(2)}</link><pubDate>${now}</pubDate></item>`;
  setFetch(async u => {
    asked.push(u);
    const gn = u.includes('news.google.com');
    const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${gn ? item('Fiji cyclone damages power lines across main island - BBC News') + item('Fiji central bank holds interest rate steady - The Guardian') : ''}</channel></rss>`;
    return { status: 200, ok: true, url: u, headers: { get: () => null }, text: async () => body };
  });
  const out = await fetchAll({ country: 'FJ', state: '', topics: require('../src/topics').IDS });
  assert(out.country.length === 2, 'a country with few outlets still shows its stories');
  assert(out.country.every(s => s.verified === false), 'single-outlet stories are labelled');
  const host = u => new URL(u).hostname;
  const countryAsks = asked.filter(u => u.includes('news.google.com'));
  assert.strictEqual(countryAsks.length, 1, 'only the selected country is searched');
  assert(decodeURIComponent(countryAsks[0]).includes('Fiji') && !asked.some(u => /rnz\.co\.nz|cbc\.ca/.test(host(u))), 'no other country feeds are fetched');
  asked.length = 0;
  setFetch(async u => (asked.push(u), { status: 200, ok: true, url: u, headers: { get: () => null }, text: async () => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${u.includes('rnz.co.nz') ? item('Wellington council approves new harbour ferry plan') : ''}</channel></rss>` }));
  const nz = await fetchAll({ country: 'NZ', state: '', topics: require('../src/topics').IDS }); // hand-picked feeds, only RNZ has the story: still shown, labelled
  assert(nz.country.length === 1 && nz.country[0].verified === false, 'single-outlet story on a hand-picked country');
  asked.length = 0;
  await fetchAll({ country: 'NZ', state: 'Wellington', topics: require('../src/topics').IDS });
  assert(asked.some(u => /rnz\.co\.nz/.test(host(u))) && !asked.some(u => /cbc\.ca|thehindu/.test(host(u))), 'only NZ feeds are fetched');
  // A story from an outlet we already read directly is not added a second time from the search.
  setFetch(async u => ({ status: 200, ok: true, url: u, headers: { get: () => null }, text: async () => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${u.includes('news.google.com') ? item('Spain approves new housing law - The Guardian') + item('Spain heatwave strains power grid - BBC News') : u.includes('theguardian.com') ? item('Spain approves new housing law') : ''}</channel></rss>` }));
  const es = await fetchAll({ country: 'ES', state: '', topics: require('../src/topics').IDS });
  assert(es.country.length === 2 && es.country.every(s => s.links.length === 1), 'Guardian story appears once; the BBC story from the search still shows');
  console.log('places tests passed');
})().catch(e => { console.error(e); process.exit(1); });
