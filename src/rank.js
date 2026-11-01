const { TRUSTED, family } = require('./sources');
const TOPICS = require('./topics');

const STOP = new Set('the a an of to in on for and or at by with as is are was were be has have had from after over new says say will this that it its their his her you your out but than into about amid'.split(' '));
// Impact tiers: how much a headline suggests large-scale consequence. Heuristic, not editorial judgement.
const TIERS = [
  [3, /(?<!price |trade |bidding |culture |turf |flame |streaming |tariff |cola |pay )\b(wars?|invasion|invade[sd]?|nuclear|missile|airstrike|ceasefire|coup|assassinat\w*|genocide|massacre|terror\w*|pandemic|outbreak|earthquake|tsunami|hurricane|typhoon|cyclone|famine|state of emergency|martial law|(?:sovereign|debt|bond|loan|credit) default|defaults? on|collapse[sd]?)\b/i],
  [2, /\b(election|elected|referendum|summit|treaty|sanctions?|tariffs?|recession|inflation|interest rates?|central bank|supreme court|ruling|verdict|impeach\w*|resign\w*|protests?|riot\w*|wildfires?|flood\w*|explosion|crash|shooting|killed|dead|deaths?|evacuat\w*|hostages?|refugees?|climate|breakthrough|merger|bankruptcy|cyberattack|hack\w*|outage)\b/i],
  [1, /\b(law|bill|signed|ban|launch\w*|model|regulat\w*|deal|talks|vote[sd]?|strike|arrest\w*|charged)\b/i]
];
// Extra tab-specific signals, layered over the general tiers above.
const PROFILES = {
  country: [[3, /\b(shutdown|default|impeach\w*|supreme court|national guard|state of emergency|federal|congress|parliament|prime minister|president|budget|recession|unemployment|inflation|election)\b/i], [2, /\b(law|bill|ruling|policy|tax|immigration|healthcare|border|strike|protests?)\b/i]],
  state: [[3, /\b(governor|legislature|lawmakers?|state budget|disaster|evacuat\w*|wildfires?|flood\w*|hurricane|tornado|storm|election|ballot|school funding|emergency)\b/i], [2, /\b(law|bill|signed|tax|county|mayor|police|court|highway|water|power outage|measure|referendum)\b/i]],
  tech: [[3, /\b(breach|data leak|ransomware|zero-day|vulnerabilit\w*|cyberattack|outage|antitrust|regulat\w*|ban|lawsuit|acquires?|acquisition|merger|billion|funding round|raises \$|ipo|layoffs|shutdown)\b/i], [3, /\b(gpt[- ]?\d|gemini|claude|llama|openai|anthropic|deepmind|nvidia|model release|new model|launches? (?:new )?(?:ai )?model|open-source model|agi|superintelligence)\b/i], [2, /\b(chips?|gpu|quantum|robot\w*|autonomous|launch\w*|unveils?|release[sd]?|privacy|safety|copyright)\b/i]]
};
const impactOf = (title, profile) => {
  let best = 0;
  for (const [w, re] of TIERS) if (re.test(title)) { best = w; break; }
  for (const [w, re] of PROFILES[profile] || []) if (re.test(title)) best = Math.max(best, w);
  return best;
};
// --- Headline matching -------------------------------------------------
// Canonicalise words so "launches/releases/unveils" or "powerful/strong" compare equal.
const SYN = { quake: 'earthquake', quakes: 'earthquake', earthquakes: 'earthquake', pm: 'minister', releases: 'release', released: 'release', launches: 'release', launched: 'release', unveils: 'release', unveiled: 'release', debuts: 'release',
  powerful: 'strong', major: 'strong', massive: 'strong', hits: 'hit', strikes: 'hit', struck: 'hit', rocks: 'hit', jolts: 'hit', agree: 'agrees', agreed: 'agrees',
  kills: 'killed', kill: 'killed', dead: 'killed', dies: 'dies', says: 'say', said: 'say', announces: 'announce', announced: 'announce', biggest: 'record', largest: 'record',
  cease: 'ceasefire', 'cease-fire': 'ceasefire', approves: 'approve', approved: 'approve', passes: 'passes', passed: 'passes' };
const stem = w => { if (w.length > 5 && /(ing|ed)$/.test(w)) return w.replace(/(ing|ed)$/, ''); return w.length > 4 && /[^su]s$/.test(w) ? w.slice(0, -1) : w; };
const GENERIC = new Set('say announce release hit strong record after amid over under into new more most ahead since while during report reports reported according live update updates breaking why how what who when where just now today overnight week year first latest not no up down off'.split(' '));
const NUMWORDS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100' };
function canon(w) { w = SYN[w] || NUMWORDS[w] || w; return stem(w); }
const norm = t => String(t).replace(/federal reserve/gi, 'Fed').replace(/prime minister/gi, 'minister');
// --- Quality filter: drop clickbait, listicles, sponsored and opinion pieces; prefer hard news -------------
const CLICKBAIT = [
  /^\s*(top\s+)?\d{1,3}\s+(things|ways|reasons|tips|tricks|facts|signs|mistakes|secrets|best|worst|movies|shows|songs|players|stars)\b/i,
  /\b(you won'?t believe|will (blow|shock) your|what happens next|jaw-?dropping|mind-?blowing|this is why|the reason why|goes viral|breaks the internet|internet (is )?(losing|freaking|going)|doctors hate|one weird|gone wrong|you need to see|can'?t stop (watching|talking)|will leave you)\b/i,
  /\b(shocking|unbelievable|jaw-dropping|savage|obliterat\w+|destroy(s|ed)? (his|her|their)|epic fail)\b/i,
  /!\s*["'”’]?\s*$/, /\?\s*$/, /\.{3}\s*$|…\s*$/, /[?!]{2,}/,
  /\bbest\b.*\b(of|for|to buy)\b.*\b(20\d\d|deals?|gifts?)\b/i, /\b(best deals?|promo code|coupon|\d+% off|prime day|black friday|cyber monday|gift guide|where to buy|buying guide)\b/i,
  /\b(sponsored|paid content|partner content|advertorial|presented by)\b/i
];
const OPINION_TITLE = /^\s*(opinion|editorial|column|commentary|letters?|op-?ed|perspective|viewpoint|my view|the big read|podcast|newsletter|quiz|watch|video|photos?|review|hands-on|first look|crossword|puzzle|horoscope)\s*(?:[:|–—]|\s-\s)/i;
const OPINION_PATH = /\/(opinion|opinions|commentisfree|comment|editorial|editorials|voices|columnists?|blogs?|sponsored|brand-?voice|partner-?content|podcasts?|newsletters?|quizzes?|video|videos|reviews?|deals?|shopping|puzzles?|crosswords?|horoscopes?|opinionista|tv-shows?|live-news)\//i;
function isLowQuality(it) {
  const t = String(it.title || '');
  if (OPINION_TITLE.test(t) || CLICKBAIT.some(re => re.test(t))) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  const words = t.split(/\s+/).filter(w => w.replace(/[^A-Za-z]/g, '').length > 3);
  if (letters.length > 12 && words.length >= 3 && words.filter(w => w === w.toUpperCase() && /[A-Z]{4,}/.test(w)).length / words.length > 0.5) return true; // SHOUTING
  try { if (OPINION_PATH.test(new URL(it.link).pathname + '/')) return true; } catch {}
  return false;
}
// Soft signal: analysis/live/explainer pieces are fine but rank below straight reporting.
const SOFT = /^\s*(analysis|explainer|live|live updates|as it happened|what to know|fact check)\s*(?:[:|–—]|\s-\s)|\s[–—-]\s*live\s*$|\blive updates\b|\bas it happened\b/i;

function tokens(title) {
  return norm(title).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => (w.length >= 2 || /\d/.test(w)) && !STOP.has(w)).map(canon);
}
// Capitalised words (names/places/organisations) that are specific to this headline.
// Title Case headlines capitalise every word, so there a capitalised word only counts as a name when its lower-case form is
// neither a common headline word nor seen in lower case anywhere in this batch of headlines (`lower`).
const SUBJECTS = new Set('senate house congress parliament commons lords cabinet court fed ecb nato un eu'.split(' '));
const COMMON_NEWS = new Set(('earthquake quake hurricane typhoon cyclone tornado tsunami wildfire gunman gunmen drone drones airstrike airstrikes explosion blast kills killed killing kill dozens hundreds thousands scores people police officials official court judge trial case bill law vote votes election results leader leaders president minister government war attack attacks gunmen shooting ' +
  'fire blaze storm flood floods crash train plane flight ship deal talks plan plans report warns calls orders rules ruling charges charged arrested arrests dies dead death deaths injured wounded hospital school students teachers workers strike protests protesters protest rally march ' +
  'demand demands push bid effort move vows seeks faces face set sets new big major top last next coast city town village state county country nation world global national local public federal military army troops forces security border migrants immigration economy economic market markets ' +
  'stocks prices price rates rate inflation tax taxes budget funding money billion million trillion company firm tech powerful massive deadly violent historic record shock surge fall falls rise rises drop drops cut cuts hike hikes win wins loses lose lead leads blow ' +
  'how why what who when where which is are was be can could will would should may might must does did has have had not more most many few some all any every each other another two three four five six seven eight nine ten ' +
  'man woman men women boy girl child children family father mother son daughter couple teen student teacher doctor nurse driver officer soldier prisoner victim suspect witness survivor resident residents voter voters ' +
  'former rare huge key latest exclusive explained analysis report reports update updates live breaking just about over under into near amid after before during despite against between inside outside behind beyond ' +
  'here there this that these those they their his her its our your we you he she it one no yes still already again also even only once now then soon later today tonight yesterday tomorrow ' +
  'why what how when where who three four first second third next last final early late high low long short good bad best worst better worse old young big small little large great ' +
  'fears hopes plans seeks wants needs gets gives takes makes says said tells asks urges warns vows pledges promises admits denies reveals shows finds finds leads brings sees ' +
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december morning night weekend').split(' ').map(w => canon(w)));
// Plurals and verbs in -s ("Hackers", "Withdrawals", "Suspends") are common words, not names; real names ending in s are listed.
const S_NAMES = new Set('texas kansas arkansas illinois paris brussels netherlands philippines maldives bahamas seychelles emirates states nations athens vilnius cyprus burkinas lebanon barclays lloyds hsbc natwest santander paribas'.split(' '));
const pluralish = w => /s$/i.test(w) && !/(as|is|us|os)$/i.test(w) && !S_NAMES.has(w.toLowerCase());
// Sentence-initial words are only treated as names when they are known ones: every country name (from the OS locale data),
// major parties, clubs and companies, or a word seen capitalised mid-sentence elsewhere in the same batch of headlines.
const KNOWN_NAMES = (() => {
  const set = new Set(('labour reform conservative conservatives tory tories democrat democrats republican republicans libdem greens snp sinn bjp congress likud hamas hezbollah taliban nato opec fifa uefa ' +
    'arsenal chelsea liverpool tottenham everton newcastle villa celtic rangers hibs hearts barcelona madrid juventus milan inter napoli bayern dortmund psg ajax lakers celtics knicks yankees dodgers cowboys patriots ' +
    'apple google microsoft amazon meta tesla nvidia openai anthropic samsung intel amd uber netflix disney boeing airbus toyota volkswagen ford walmart paypal binance coinbase spotify twitter ' +
    'california texas florida ohio georgia virginia washington york jersey carolina michigan arizona nevada oregon colorado illinois alaska hawaii london paris berlin moscow beijing tokyo delhi').split(' '));
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const n = dn.of(String.fromCharCode(a, b));
      if (n && n.length > 2 && !/^[A-Z]{2}$/.test(n) && n !== 'Unknown Region') for (const w of n.replace(/[^A-Za-z ]/g, ' ').split(/\s+/)) if (w.length > 2) set.add(w.toLowerCase());
    }
  } catch {}
  return new Set([...set].map(w => canon(w)));
})();
// A capitalised first word is a name (Nissan, Zelensky, Toronto, Ryanair) unless it looks like an ordinary English word or verb.
const NOT_ING = new Set(['beijing', 'nanjing', 'xining', 'turing', 'bering', 'chongqing', 'zhejiang', 'zhuhai']);
const commonStarter = (w, c, lower) => COMMON_NEWS.has(c) || lower.has(c) || pluralish(w) || (!NOT_ING.has(w.toLowerCase()) && /(?:ing|ed|tion|sion|ment|ness|ship|ally|ly|ful|ous|ive)$/i.test(w));
function isTitleCase(ws) {
  const long = ws.filter(w => w.length > 3);
  return ws.length >= 6 && long.filter(w => /^[A-Z]/.test(w)).length / (long.length || 1) > 0.6;
}
function names(title, lower, capSeen) {
  const out = new Set();
  const ws = norm(title).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const tc = isTitleCase(ws);
  ws.forEach((w, i) => {
    if (w.length < 2 || !/^[A-Z]/.test(w)) return;
    const c = canon(w.toLowerCase());
    if (GENERIC.has(c) || STOP.has(w.toLowerCase())) return;
    if (tc) { if (!SUBJECTS.has(c) && (COMMON_NEWS.has(c) || lower.has(c) || pluralish(w))) return; }
    else if (i === 0 && !/^[A-Z0-9]+$/.test(w) && w.length > 4 && !SUBJECTS.has(c) && !KNOWN_NAMES.has(c) && !capSeen.has(c) && commonStarter(w, c, lower)) return; // sentence-initial common word, not a name
    out.add(c);
  });
  return out;
}
const NO_LOWER = new Set();
const caps = (title, lower = NO_LOWER, capSeen = NO_LOWER) => names(title, lower, capSeen);
const EVENT = /^(earthquake|hurricane|typhoon|cyclone|tsunami|ceasefire|election|explosion|wildfire|flood|shooting|attack|coup|outbreak|crash|strike)$/;
const capsAll = caps; // same set; kept as a separate name for the word-order / entity checks
const distinct = t => [...new Set(t)].filter(w => !GENERIC.has(w));
function overlap(a, b) {
  const A = new Set(a), B = new Set(b);
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return { shared: n, jac: n / (A.size + B.size - n || 1) };
}
const ANT = w => (/ss$/.test(w) ? w : String(w).replace(/(es|ed|ing|s|e)$/, ''));
const ANTONYMS = [['pass','reject'],['approve','reject'],['approve','block'],['uphold','overturn'],['rise','fall'],['rally','slump'],['rally','tumble'],['rally','plunge'],
  ['win','lose'],['beat','lose'],['cut','raise'],['hike','cut'],['confirm','deny'],['sign','veto'],['agree','reject'],['accept','reject'],['support','oppose'],['allow','ban'],['grant','deny'],
  ['up','down'],['arrest','release'],['survive','die'],['gain','drop'],['open','close'],['begin','end'],['resume','halt'],['surge','plunge'],['increase','decrease'],['concede','win'],['block','uphold'],['climb','slide'],['climb','fall'],['hold','cut'],['hold','raise'],['confirm','reject'],['survive','lose'],['raise','lower'],['reject','hear'],['fail','pass'],['fail','succeed'],['dismiss','revive'],['lift','impose'],['extend','end'],['postpone','hold'],['expel','admit'],['deny','grant']]
  .map(([x, y]) => [ANT(x), ANT(y)]);
const hasNum = t => t.filter(w => /\d/.test(w)).map(w => w.replace(/\D/g, ''));
// "Israel strikes Iran" vs "Iran strikes Israel": shared names must appear in the same order.
function orderConflict(a, b, fa, fb) {
  const names = [...fa].filter(w => fb.has(w));
  if (names.length < 2) return false;
  const ia = names.map(w => a.indexOf(w)), ib = names.map(w => b.indexOf(w));
  if (ia.includes(-1) || ib.includes(-1)) return false;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    if (Math.abs(ia[i] - ia[j]) === 1 && Math.abs(ib[i] - ib[j]) === 1) continue; // one multi-word name ("North Korea")
    if ((ia[i] < ia[j]) !== (ib[i] < ib[j])) return true; // swapped roles, at any distance
  }
  return false;
}
function conflict(a, b, ca = new Set(), cb = new Set(), fa = new Set(), fb = new Set()) {
  const na = [...new Set(hasNum(a))], nb = [...new Set(hasNum(b))];
  // different figures conflict unless one headline just adds detail (e.g. "7.1 quake" vs "7.1 quake, 12 dead")
  if (na.length && nb.length && !na.every(x => nb.includes(x)) && !nb.every(x => na.includes(x))) return true;
  const A = new Set(a), B = new Set(b);
  if (A.has('not') !== B.has('not') || A.has('no') !== B.has('no')) return true; // negation
  const SA = new Set(a.map(ANT)), SB = new Set(b.map(ANT));
  if (ANTONYMS.some(([x, y]) => (SA.has(x) && SB.has(y)) || (SA.has(y) && SB.has(x)))) return true;
  // a name/place that appears in only one headline (Gaza vs Lebanon, UK vs US)
  // Only when BOTH headlines carry a name the other lacks. One-sided extra detail ("... after fleeing to Miami") is the same story.
  if ([...ca].some(w => !B.has(w)) && [...cb].some(w => !A.has(w))) return true;
  return orderConflict(a, b, fa, fb);
}
// Conservative but usable: shared distinctive words, no conflicting figures/names/direction.
// Names so common that sharing one says little about whether two headlines are the same story.
const COMMON = new Set('trump biden us uk eu un china russia ukraine israel iran gaza president minister government police court state america american british'.split(' '));
// Capitalised words incl. the first word, even in Title Case headlines (Title Case just means "everything is capitalised").
function loose(title) {
  const out = new Set();
  for (const w of norm(title).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/)) if (w.length >= 2 && /^[A-Z]/.test(w)) out.add(canon(w.toLowerCase()));
  return out;
}
function same(a, b, ca, cb, fa, fb, la = new Set(), lb = new Set()) {
  if (conflict(a, b, ca, cb, fa, fb)) return false;
  const da = distinct(a), db = distinct(b);
  const { shared, jac } = overlap(da, db);
  // Outlets word the same story differently: two shared names (or one rare name) plus a few shared words is enough.
  const sb = new Set(db), ents = da.filter(w => sb.has(w) && la.has(w) && lb.has(w) && !COMMON.has(w));
  if ((ents.length >= 2 && shared >= 3 && jac >= 0.25) || (ents.length >= 1 && shared >= 4 && jac >= 0.3)) return true;
  if ((shared >= 4 && jac >= 0.4) || (shared >= 3 && jac >= 0.5) || (shared >= 2 && jac >= 0.67)) return true;
  // same named place/entity + same kind of event (e.g. "earthquake" + "Japan")
  const set = new Set(db), common = da.filter(w => set.has(w));
  return common.length >= 2 && common.some(w => EVENT.test(w)) && common.some(w => ca.has(w) && cb.has(w)) && jac >= 0.3;
}
function similarity(a, b) { return overlap(a, b).jac; }
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return NAMED[e.toLowerCase()] ?? ' ';
  });
}
function clean(s = '') {
  // strip tags first, then decode entities (decoded text is never re-parsed as HTML)
  return decode(String(s).replace(/<(script|style)[^>]*>[\s\S]*?(<\/\1>|$)/gi, ' ').replace(/<!--[\s\S]*?(-->|$)/g, ' ').replace(/<\/?[a-z][^>]*>?/gi, ' '))
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 400);
}
function safeLink(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : ''; } catch { return ''; }
}
function shorten(s, n = 140) {
  s = clean(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return cut.slice(0, end > 60 ? end : n).replace(/[,;:\s]+$/, '') + '…';
}

// items: [{source, title, link, summary, ts}]
// minSources: independent trusted outlets needed. localOk: allow 1 trusted outlet (labelled).
// singleCap: when set, verified stories sort first and single-source stories are capped per outlet.
function rankStories(items, { limit = 10, minSources = 2, localOk = false, singleCap = 0, profile = 'world', show = TOPICS.IDS, now = Date.now() } = {}) {
  const trusted = items.map(i => ({ ...i, link: safeLink(i.link) })).filter(i => TRUSTED[i.source] && i.title && i.link && !isLowQuality(i));
  const capSeen = new Set(); // words seen capitalised in mid-sentence anywhere in this batch are names
  for (const it of trusted) String(it.title).split(/\s+/).forEach((w, i) => { const x = w.replace(/[^A-Za-z]/g, ''); if (i > 0 && x.length > 2 && /^[A-Z][a-z]/.test(x)) capSeen.add(canon(x.toLowerCase())); });
  const lowerSeen = new Set(); // words seen in lower case in this batch are ordinary words, not names
  for (const it of trusted) for (const w of String(it.title).split(/\s+/)) { const x = w.replace(/[^A-Za-z]/g, ''); if (x.length > 2 && /^[a-z]/.test(x)) lowerSeen.add(canon(x)); }
  const clusters = [];
  const index = new Map(); // distinctive token -> clusters containing it (so we only compare plausible pairs)
  for (const it of trusted.slice().sort((x, y) => (y.ts || 0) - (x.ts || 0))) {
    const t = tokens(it.title), cp = caps(it.title, lowerSeen, capSeen), fp = cp, lo = fp, dt = distinct(t);
    const hits = new Map();
    for (const w of dt) for (const c of index.get(w) || []) hits.set(c, (hits.get(c) || 0) + 1);
    let best = null, bestJ = 0;
    for (const [c, n] of hits) {
      if (n < 2) continue; // a match needs at least two shared distinctive words
      if (c.items.some(m => conflict(t, m.tk, cp, m.cp, fp, m.fp))) continue;
      for (const m of c.items) if (m.source !== it.source && same(t, m.tk, cp, m.cp, fp, m.fp, lo, m.lo)) { const j = overlap(dt, distinct(m.tk)).jac; if (j > bestJ) { bestJ = j; best = c; } }
    }
    const rec = { ...it, tk: t, cp, fp, lo };
    const target = best || (clusters.push({ items: [] }), clusters[clusters.length - 1]);
    target.items.push(rec);
    for (const w of dt) { if (!index.has(w)) index.set(w, new Set()); index.get(w).add(target); }
  }
  const out = [];
  for (const c of clusters) {
    const sources = [...new Set(c.items.map(i => i.source))];
    const verified = new Set(sources.map(family)).size >= minSources;
    if (!verified && !localOk) continue;
    // user-picked topics: keep the story only if its headlines and summaries together fit a picked topic; the top 10 fills from what is left
    if (!TOPICS.wanted(c.items.map(i => i.title + ' ' + (i.summary || '')).join(' '), show)) continue;
    const lead = c.items.slice().sort((a, b) => (b.summary || '').length - (a.summary || '').length)[0];
    if (c.items.every(i => i.ts > 0 && now - i.ts > 72 * 36e5)) continue; // too old to be news
    const newest = Math.min(now, Math.max(...c.items.map(i => i.ts || 0)));
    const ageH = Math.max(0, (now - newest) / 36e5);
    const recency = Math.max(0, 1 - ageH / 48);
    const impact = Math.max(...c.items.map(i => impactOf(i.title, profile)));
    const reach = new Set(sources.map(family)).size;
    // reach (independent outlets) and severity dominate; recency only breaks ties and ages stories out
    const soft = c.items.every(i => SOFT.test(i.title)) ? -1.5 : 0; // prefer straight reporting over analysis/live blogs
    const score = Math.min(reach, 4) * 3 + impact * 2.5 + recency * 2 + Math.min(c.items.length, 6) * 0.3 + soft;
    out.push({
      title: shorten(lead.title, 160),
      summary: shorten(lead.summary),
      detail: shorten(lead.summary, 380), // longer text for the story card
      link: lead.link,
      sources: sources.map(s => TRUSTED[s]),
      articles: sources.map(src => ({ outlet: TRUSTED[src], link: c.items.find(i => i.source === src).link })), // newest article from each outlet
      indep: new Set(sources.map(family)).size, impact,
      verified, ts: newest, firstTs: Math.min(...c.items.map(i => i.ts).filter(t => t > 0), Infinity) === Infinity ? 0 : Math.min(...c.items.map(i => i.ts).filter(t => t > 0)), links: c.items.map(i => i.link), score
    });
  }
  out.sort((a, b) => b.score - a.score);
  if (!singleCap) return out.slice(0, limit);
  // Verified stories come first; single-source stories fill the rest, at most singleCap per outlet.
  const picked = out.filter(story => story.verified);
  const perOutlet = {};
  for (const story of out.filter(story => !story.verified)) {
    const outlet = story.sources[0];
    perOutlet[outlet] = (perOutlet[outlet] || 0) + 1;
    if (perOutlet[outlet] <= singleCap) picked.push(story);
  }
  return picked.slice(0, limit);
}

module.exports = { capsAll, isLowQuality, conflict, caps, distinct, same, tokens, decode, clean, safeLink, rankStories, similarity, shorten, SOFT };
