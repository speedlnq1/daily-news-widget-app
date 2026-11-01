// Trusted outlets only. Anything not in TRUSTED is never shown.
const TRUSTED = {
  'ap': 'AP', 'bbc': 'BBC', 'npr': 'NPR', 'guardian': 'The Guardian',
  'aljazeera': 'Al Jazeera', 'pbs': 'PBS NewsHour', 'dw': 'DW',
  'cbs': 'CBS News', 'abc': 'ABC News', 'nyt': 'NYT',
  'arstechnica': 'Ars Technica', 'mittr': 'MIT Tech Review',
  'verge': 'The Verge', 'wired': 'Wired', 'techcrunch': 'TechCrunch',
  'sky': 'Sky News', 'independent': 'The Independent', 'rnz': 'RNZ', 'cbc': 'CBC News', 'abcau': 'ABC News (Australia)', 'hindu': 'The Hindu',
  'france24': 'France 24', 'straitstimes': 'The Straits Times', 'cna': 'CNA', 'kyiv': 'Kyiv Independent', 'csm': 'Christian Science Monitor',
  'rte': 'RTÉ', 'dailymaverick': 'Daily Maverick', 'smh': 'Sydney Morning Herald', 'globalnews': 'Global News', 'media404': '404 Media'
};

const FEEDS = {
  world: [
    ['bbc', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
    ['guardian', 'https://www.theguardian.com/world/rss'],
    ['aljazeera', 'https://www.aljazeera.com/xml/rss/all.xml'],
    ['npr', 'https://feeds.npr.org/1004/rss.xml'],
    ['dw', 'https://rss.dw.com/rdf/rss-en-world'],
    ['nyt', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
    ['sky', 'https://feeds.skynews.com/feeds/rss/world.xml'],
    ['independent', 'https://www.independent.co.uk/news/world/rss'],
    ['france24', 'https://www.france24.com/en/rss'],
    ['kyiv', 'https://kyivindependent.com/news-archive/rss/'],
    ['csm', 'https://rss.csmonitor.com/feeds/world']
  ],
  country: {
    US: [
      ['npr', 'https://feeds.npr.org/1003/rss.xml'],
      ['pbs', 'https://www.pbs.org/newshour/feeds/rss/headlines'],
      ['cbs', 'https://www.cbsnews.com/latest/rss/us'],
      ['abc', 'https://abcnews.go.com/abcnews/usheadlines'],
      ['nyt', 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml'],
      ['guardian', 'https://www.theguardian.com/us-news/rss'],
      ['sky', 'https://feeds.skynews.com/feeds/rss/us.xml'],
      ['independent', 'https://www.independent.co.uk/news/world/americas/us-politics/rss']
    ],
    GB: [
      ['bbc', 'https://feeds.bbci.co.uk/news/uk/rss.xml'],
      ['guardian', 'https://www.theguardian.com/uk-news/rss'],
      ['sky', 'https://feeds.skynews.com/feeds/rss/uk.xml'],
      ['independent', 'https://www.independent.co.uk/news/uk/rss']
    ],
    CA: [
      ['guardian', 'https://www.theguardian.com/world/canada/rss'],
      ['cbc', 'https://www.cbc.ca/webfeed/rss/rss-canada'],
      ['globalnews', 'https://globalnews.ca/canada/feed/']
    ],
    AU: [['guardian', 'https://www.theguardian.com/australia-news/rss'],
         ['bbc', 'https://feeds.bbci.co.uk/news/world/australia/rss.xml'],
         ['abcau', 'https://www.abc.net.au/news/feed/51120/rss.xml'],
         ['smh', 'https://www.smh.com.au/rss/national.xml']],
    IN: [['bbc', 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml'],
         ['guardian', 'https://www.theguardian.com/world/india/rss'],
         ['hindu', 'https://www.thehindu.com/news/national/feeder/default.rss']],
    SG: [['straitstimes', 'https://www.straitstimes.com/news/singapore/rss.xml'],
         ['cna', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416']],
    IE: [['rte', 'https://www.rte.ie/feeds/rss/?index=/news/&limit=20']],
    ZA: [['dailymaverick', 'https://www.dailymaverick.co.za/dmrss/']],
    ES: [['guardian', 'https://www.theguardian.com/world/spain/rss']],
    DE: [['dw', 'https://rss.dw.com/rdf/rss-en-ger'], ['guardian', 'https://www.theguardian.com/world/germany/rss']],
    MX: [['guardian', 'https://www.theguardian.com/world/mexico/rss']],
    BR: [['guardian', 'https://www.theguardian.com/world/brazil/rss']],
    AR: [['guardian', 'https://www.theguardian.com/world/argentina/rss']],
    CO: [['guardian', 'https://www.theguardian.com/world/colombia/rss']],
    CL: [['guardian', 'https://www.theguardian.com/world/chile/rss']],
    PE: [['guardian', 'https://www.theguardian.com/world/peru/rss']],
    NZ: [['rnz', 'https://www.rnz.co.nz/rss/national.xml'],
         ['guardian', 'https://www.theguardian.com/world/newzealand/rss']]
  },
  tech: [
    ['arstechnica', 'https://feeds.arstechnica.com/arstechnica/index'],
    ['mittr', 'https://www.technologyreview.com/feed/'],
    ['verge', 'https://www.theverge.com/rss/index.xml'],
    ['wired', 'https://www.wired.com/feed/rss'],
    ['techcrunch', 'https://techcrunch.com/feed/'],
    ['nyt', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'],
    ['guardian', 'https://www.theguardian.com/technology/rss'],
    ['bbc', 'https://feeds.bbci.co.uk/news/technology/rss.xml'],
    ['sky', 'https://feeds.skynews.com/feeds/rss/technology.xml'],
    ['media404', 'https://www.404media.co/rss/']
  ]
};

const SITES = ['apnews.com','npr.org','bbc.com','theguardian.com','aljazeera.com','dw.com','pbs.org','cbsnews.com','abcnews.go.com','nytimes.com','skynews.com','independent.co.uk','rnz.co.nz','cbc.ca','straitstimes.com','channelnewsasia.com','rte.ie','dailymaverick.co.za','smh.com.au','globalnews.ca'];
const siteQ = SITES.map(d => 'site:' + d).join(' OR ');
const EDITIONS = new Set(['US','GB','CA','AU','IN','IE','NZ','ZA','SG','PH','MY','NG','KE']);
const gnews = (q, code) => { const c = EDITIONS.has(code) ? code : 'US'; return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=${c}&ceid=${c}:en`; };
// Ambiguous region names need a sharper query.
const REGION_Q = { 'Washington State': '"Washington state" -"Washington, D.C."', 'Virginia': '"Virginia" -"West Virginia"', 'New York': '"New York state" OR "Albany" OR "Gov. Hochul"', 'Georgia (US state)': '"Georgia" (Atlanta OR "Gov. Kemp" OR "state of Georgia") -Tbilisi', 'District of Columbia': '"Washington, D.C."',
  'West Coast': '"West Coast" (Greymouth OR Westport OR Hokitika OR "New Zealand")', 'Canterbury': '"Canterbury" (Christchurch OR "New Zealand")', 'Nelson': '"Nelson" ("New Zealand" OR Tasman OR Motueka)', 'Tasman': '"Tasman" ("New Zealand" OR Nelson OR Motueka)',
  'North West': '"North West" (Mahikeng OR Rustenburg OR "South Africa")', 'Saxony': '"Saxony" (Dresden OR Leipzig OR Germany)', 'Wales': '"Wales" (Cardiff OR Swansea OR "Welsh Government") -"New South Wales"' };
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = n => String(n).replace(/\s*\(.*\)\s*/g, '').replace(/ State$/, '').trim();

// Country tab search: trusted outlets' coverage of the country, on top of any hand-picked feeds.
// Names other than the Intl display name (which we use by default).
const COUNTRY_NAMES = { TR: ['Turkey', 'Türkiye'], CD: ['DR Congo', 'Democratic Republic of Congo'], CG: ['Republic of Congo', 'Congo-Brazzaville'], HK: ['Hong Kong'], CZ: ['Czech Republic', 'Czechia'], KN: ['St Kitts', 'Saint Kitts'], CI: ['Ivory Coast', "Côte d'Ivoire"], MM: ['Myanmar', 'Burma'], SZ: ['Eswatini', 'Swaziland'], MK: ['North Macedonia'], KP: ['North Korea'], KR: ['South Korea'], PS: ['Palestinian', 'West Bank', 'Gaza'], VA: ['Vatican'], TW: ['Taiwan'], RU: ['Russia'], GE: ['Georgia', 'Tbilisi'] };
// Country names that are also people, places or things: headlines matching these are not about the country.
const COUNTRY_NOT = {
  GE: /Atlanta|Savannah|Kemp|Bulldogs|Georgia Tech|University of Georgia|Fulton County|ICE (?:raid|agents?|officers?|detention|arrests?)|Hyundai/i,
  JO: /Michael Jordan|Air Jordan|Hornets|Michael B\. Jordan|Jordan (?:Peele|Spieth|Love|Poole|Henderson|Chiles|Bardella|Pickford|Clarkson|Belfort|Staal|Peterson|Neely)/i,
  TR: /Thanksgiving|stuffing|gravy|wild turkey|turkey (?:recipe|dinner|breast|pardon\b|trot)|pardon(?:s|ed|ing)? (?:a |the )?turkeys?\b|(?:roast|cook)(?:ed|ing)? (?:a |the )?turkey/i,
  GN: /Papua New Guinea|Equatorial Guinea|Guinea-Bissau|guinea pig/i,
  TD: /Chad (?:Bianco|Gable|Daybell|Powers|Wolf|Michael|Ochocinco|Johnson|Smith|Pierce|Holmgren|Kroeger|Prather)/i, // people, not the country
  SD: /South Sudan/i,
  MX: /New Mexico/i,
  IE: /Northern Ireland/i,
  WS: /American Samoa/i,
  PA: /Panama City Beach|Panama City,? Fla/i,
  NE: /Niger Delta|Niger State/, // case-sensitive: "Niger state media" is the country
  PE: /Peru,? (?:Ind(?:iana\b|\.)|Illinois|Ill\.|N\.Y|New York)/i
};
// "Georgia" alone is also a US state, so the headline needs a country cue as well.
const COUNTRY_ONLY = { GE: { test: t => /Tbilisi|Georgian|Caucasus|Kobakhidze|\bGeorgia(?:'s)? president\b|president of Georgia/i.test(t) || (/\bGeorgia\b/.test(t) && /\b(?:EU|Russia|Moscow|Brussels|parliament|parliamentary|prime minister|opposition)\b/i.test(t)) } };
const countryNames = (code, name) => COUNTRY_NAMES[code] || [clean(name)];
function countryFeeds(code, name) { return [['gnews', gnews(`(${countryNames(code, name).map(n => `"${n}"`).join(' OR ')}) (${siteQ}) when:2d`, code)]]; }
// Google News matches article text anywhere, so keep only headlines that name the country.
function countryMatch(code, name) {
  const re = COUNTRY_ONLY[code] || new RegExp('\\b(?:' + countryNames(code, name).map(esc).join('|') + ')\\b', 'i'), no = COUNTRY_NOT[code];
  return title => re.test(title) && !(no && no.test(title));
}
// Everything the Country tab fetches: hand-picked feeds plus a trusted-outlet search (items from the search
// are filtered by headline, see countryMatch). The US and UK have enough hand-picked outlets and ambiguous names.
const countryList = (code, name) => [...(FEEDS.country[code] || []), ...(code === 'US' || code === 'GB' ? [] : countryFeeds(code, name))];
// Local tab: trusted outlets mentioning the region.
function stateFeeds(region, code, countryName) {
  const base = REGION_Q[region] || `"${clean(region)}"`;
  const q = `${base} (${siteQ}) when:2d`;
  return [['gnews', gnews(q, code)]];
}

// Outlets that often rerun the same wire copy count as ONE independent source.
// The Independent regularly reruns AP/PA/Reuters copy, so it counts with the wires, not as separate confirmation.
// Outlets that often rerun the same copy count as one source when checking a story.
// ST and CNA are both Singapore state-linked; Global News uses Canadian Press like CBC; SMH uses AAP like the Guardian Australia.
const FAMILY = { ap: 'wire', npr: 'wire', pbs: 'wire', independent: 'wire', straitstimes: 'sg', cna: 'sg', globalnews: 'cbc', smh: 'guardian' };
const family = k => FAMILY[k] || k;

// A Google News search matches article TEXT, so it can return stories that merely mention the region once.
// The Local tab keeps only stories whose headline names the place.
const REGION_RE = { 'Washington State': /washington state|seattle|olympia|spokane|tacoma/i, 'Virginia': /(?<!west )virginia/i, 'New York': /new york(?! times)|albany|hochul/i,
  'Georgia (US state)': /atlanta|kemp|georgia state|state of georgia|georgia'?s? (?:governor|legislature|senate|house)/i, 'District of Columbia': /washington,? d\.?c|\bd\.?c\.?\b/i,
  'West Coast': /greymouth|westport|hokitika|west coast (?:nz|of the south island)/i, 'Canterbury': /christchurch|canterbury (?:region|council|plains|police|earthquake|crusaders|rugby)|environment canterbury|canterbury,? (?:nz|new zealand)/i, 'Nelson': /nelson[- ](?:city|council|hospital|region|mayor|police|airport|tasman|marlborough)\b|nelson,? (?:nz|new zealand)|\b(?:in|near|around) nelson\b(?! mandela)(?!,? b\.?c)/i, 'Tasman': /\btasman\b(?! sea)/i,
  'North West': /\bnorth west\b(?! (?:england|london|europe|coast|passage|frontier|territor))|mahikeng|rustenburg/i, 'Saxony': /(?<!lower )\bsaxony\b(?!-anhalt)|dresden|leipzig/i, 'Saxony-Anhalt': /saxony-anhalt|magdeburg/i, 'Lower Saxony': /lower saxony|hanover|hannover/i,
  'Wales': /(?<!new south )(?<!prince of )(?<!princess of )\bwales\b|cardiff|swansea/i, 'England': /(?<!new )\bengland\b/i };
function regionMatch(region) { return REGION_RE[region] || new RegExp('\\b' + esc(clean(region)) + '\\b', 'i'); }

module.exports = { TRUSTED, FEEDS, stateFeeds, countryFeeds, countryList, countryMatch, family, regionMatch };
