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
  gop: 'republican', dem: 'democrat', dems: 'democrat', sen: 'senator', nigerian: 'nigeria', nigerians: 'nigeria', romanian: 'romania', spanish: 'spain', french: 'france', british: 'britain', german: 'germany', dutch: 'netherlands', greek: 'greece', swiss: 'switzerland', chinese: 'china', japanese: 'japan', irish: 'ireland', turkish: 'turkey', polish: 'poland', danish: 'denmark', swedish: 'sweden', thai: 'thailand', lebanese: 'lebanon', congolese: 'congo', cease: 'ceasefire', 'cease-fire': 'ceasefire', approves: 'approve', approved: 'approve', passes: 'passes', passed: 'passes' };
const stem = w => { if (w.length > 5 && /(ing|ed)$/.test(w)) return w.replace(/(ing|ed)$/, ''); return w.length > 4 && /[^su]s$/.test(w) ? w.slice(0, -1) : w; };
const GENERIC = new Set('say announce release hit strong record after amid over under into new more most ahead since while during report reports reported according live update updates breaking why how what who when where just now today overnight week year first latest not no up down off'.split(' '));
const NUMWORDS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100' };
function canon(w) { w = SYN[w] || NUMWORDS[w] || w; return stem(w); }
// "South Sudan", "New York", "British Columbia" are places of their own, not Sudan, York or Britain: keep each as one word.
// Only known place words are joined, so a Title Case "New Plan" or "North Star" stays two words. People take the place's
// name ("New Yorkers" -> NewYork, "South Koreans" -> SouthKorea). Congo means the DR Congo, as AP writes it.
const COUNTRY_ALIAS = [[/\b(?:Democratic Republic of (?:the )?|DR )Congo\b/g, 'Congo'], [/\bRepublic of (?:the )?Congo\b|\bCongo[- ](?:Brazzaville|Republic)\b/g, 'CongoRepublic'],
  [/\bEquatorial Guinea/g, 'EquatorialGuinea'], [/\bGuinea-Bissau/g, 'GuineaBissau'], [/\bDominican Republic/g, 'DominicanRepublic'],
  [/\bCentral African Republic/g, 'CentralAfricanRepublic'], [/\bNorthern Irish\b/g, 'NorthernIreland'], [/\bBritish (?=Columbia)/g, 'British']];
const PLACE_PREFIX = /\b(New|North|South|East|West|Northern|Southern|Eastern|Western|Papua) (York|Jersey|Mexico|Hampshire|Orleans|Delhi|England|Zealand|Caledonia|New Guinea|Guinea|South Wales|Brunswick|Korea|Sudan|Africa|Macedonia|Carolina|Dakota|Virginia|Wales|Ireland|Midlands|Timor|Bank|Sahara|Congo|Australia|Territory|Cape|Jerusalem|Darfur|Ham)(?:n|an|ese|er)?s?\b/g;
const norm = t => COUNTRY_ALIAS.reduce((s, [re, to]) => s.replace(re, to), String(t))
  .replace(PLACE_PREFIX, (m, a, b) => a + b.replace(/ /g, '')).replace(/federal reserve/gi, 'Fed').replace(/\bEuropean Union\b/g, 'EU').replace(/\bUnited Nations\b/g, 'UN').replace(/\bEuropean Central Bank\b/g, 'ECB').replace(/\bInternational Monetary Fund\b/g, 'IMF').replace(/prime minister/gi, 'minister');
// --- Quality filter: drop clickbait, listicles, sponsored and opinion pieces; prefer hard news -------------
const CLICKBAIT = [
  /^\s*(top\s+)?\d{1,3}\s+(things|ways|reasons|tips|tricks|facts|signs|mistakes|secrets|best|worst|movies|shows|songs|players|stars)\b/i,
  /\b(you won'?t believe|will (blow|shock) your|what happens next|jaw-?dropping|mind-?blowing|this is why|the reason why|goes viral|breaks the internet|internet (is )?(losing|freaking|going)|doctors hate|one weird|gone wrong|you need to see|can'?t stop (watching|talking)|will leave you)\b/i,
  /\b(shocking|unbelievable|jaw-dropping|savage|obliterat\w+|destroy(s|ed)? (his|her|their)|epic fail)\b/i,
  /!\s*["'”’]?\s*$/, /\?\s*$/, /\.{3}\s*$|…\s*$/, /[?!]{2,}/,
  /\bbest\b.*\b(of|for|to buy)\b.*\b(20\d\d|deals?|gifts?)\b/i, /\b(best deals?|promo code|coupon|\d+% off|prime day|black friday|cyber monday|gift guide|where to buy|buying guide)\b/i,
  /\b(sponsored|paid content|partner content|advertorial|presented by)\b/i
];
const MEDIA_SUFFIX = /\s[–—|-]\s*(podcast|video|audio|newsletter|editorial|opinion)\s*$|\bin pictures\s*$/i; // "... – podcast", "... | Editorial", "A life in pictures"
const OPINION_TITLE = /^\s*(opinion|editorial|column|commentary|letters?|op-?ed|perspective|viewpoint|my view|the big read|podcast|newsletter|quiz|watch|video|photos?|review|hands-on|first look|crossword|puzzle|horoscope)\s*(?:[:|–—]|\s-\s)/i;
const OPINION_PATH = /\/(opinion|opinions|commentisfree|comment|editorial|editorials|voices|columnists?|blogs?|sponsored|brand-?voice|partner-?content|podcasts?|newsletters?|quizzes?|video|videos|reviews?|deals?|shopping|puzzles?|crosswords?|horoscopes?|opinionista|tv-shows?|live-news)\//i;
function isLowQuality(it) {
  const t = String(it.title || '');
  if (OPINION_TITLE.test(t) || MEDIA_SUFFIX.test(t) || CLICKBAIT.some(re => re.test(t))) return true;
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
const SUBJECTS = new Set('senate house congress parliament common lord cabinet court fed ecb nato un eu'.split(' ')); // canon forms (commons -> common)
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
// Country names as one word each (Niger, Nigeria, Austria, Australia, SouthSudan, NorthKorea...), plus a few regions
// named after a country and common names the locale data words differently (Turkey, Myanmar, Congo), for telling
// neighbouring places apart.
const PLACES = (() => {
  const set = new Set('northernireland westernaustralia westvirginia northcarolina southcarolina newmexico congorepublic westbank turkey myanmar burma congo saudi'.split(' '));
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const w = norm(dn.of(String.fromCharCode(a, b)) || '').toLowerCase();
      if (/^[a-z]{4,}$/.test(w)) set.add(canon(w));
    }
  } catch {}
  return set;
})();
// Names written next to each other ("Elon Musk", "Justice Department", "Silicon Valley") are one name, not two.
// `follows(v, w)` tells whether w directly follows v somewhere.
const countNames = (names, follows) => names.filter(w => !names.some(v => v !== w && follows(v, w))).length;
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
    if (/[a-z][A-Z]/.test(w)) { out.add(c); return; } // a joined place name ("NewOrleans", "WestMidlands") is always a name
    if (tc) { if (!SUBJECTS.has(c) && !place(c) && (COMMON_NEWS.has(c) || lower.has(c) || pluralish(w))) return; }
    else if (i === 0 && !/^[A-Z0-9]+$/.test(w) && w.length > 4 && !SUBJECTS.has(c) && !KNOWN_NAMES.has(c) && !capSeen.has(c) && commonStarter(w, c, lower)) return; // sentence-initial common word, not a name
    out.add(c);
  });
  return out;
}
const NO_LOWER = new Set();
const caps = (title, lower = NO_LOWER, capSeen = NO_LOWER) => names(title, lower, capSeen);
const EVENT = /^(earthquake|hurricane|typhoon|cyclone|tsunami|ceasefire|election|explosion|wildfire|flood|shooting|attack|coup|outbreak|crash|strike)$/;
const distinct = t => [...new Set(t)].filter(w => !GENERIC.has(w));
function overlap(a, b) {
  const A = new Set(a), B = new Set(b);
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return { shared: n, jac: n / (A.size + B.size - n || 1) };
}
const ANT = w => (/ss$/.test(w) ? w : String(w).replace(/(es|ed|ing|s|e)$/, ''));
const ANTONYMS = [['pass','reject'],['approve','reject'],['approve','block'],['uphold','overturn'],['rise','fall'],['rally','slump'],['rally','tumble'],['rally','plunge'],
  ['win','lose'],['beat','lose'],['cut','raise'],['hike','cut'],['confirm','deny'],['sign','veto'],['agree','reject'],['accept','reject'],['support','oppose'],['allow','ban'],['grant','deny'],
  ['up','down'],['arrest','release'],['survive','die'],['gain','drop'],['open','close'],['begin','end'],['resume','halt'],['surge','plunge'],['increase','decrease'],['concede','win'],['block','uphold'],['climb','slide'],['climb','fall'],['hold','cut'],['hold','raise'],['confirm','reject'],['survive','lose'],['raise','lower'],['reject','hear'],['fail','pass'],['fail','succeed'],['dismiss','revive'],['lift','impose'],['extend','end'],['postpone','hold'],['expel','admit'],['deny','grant'],
  ['suspend','resume'],['pause','resume'],['pause','restart'],['halt','restart'],['arrest','free'],['charge','convict'],['charge','acquit'],['begin','guilty'],['begin','convict'],['begin','lose'],['fine','win'],['agree','clash'],['kill','abduct'],['kill','kidnap']]
  .map(([x, y]) => [ANT(x), ANT(y)]);
const hasNum = t => t.filter(w => /\d/.test(w)).map(w => w.replace(/\D/g, ''));
// "Israel strikes Iran" vs "Iran strikes Israel": names both headlines share must come in the same order.
// A missed match is safer than one story that reports two opposite results.
function orderConflict(a, b, fa, fb) {
  let names = [...fa].filter(w => fb.has(w));
  if (names.some(w => !a.includes(w) || !b.includes(w))) return false;
  // names next to each other in both headlines ("North Korea", "Kansas and Iowa") count as one
  const next = (w, v) => Math.abs(a.indexOf(w) - a.indexOf(v)) === 1 && Math.abs(b.indexOf(w) - b.indexOf(v)) === 1;
  names = names.sort((x, y) => a.indexOf(x) - a.indexOf(y)).reduce((keep, w) => (keep.some(v => next(w, v)) ? keep : [...keep, w]), []);
  const inB = names.slice().sort((x, y) => b.indexOf(x) - b.indexOf(y));
  return names.some((w, i) => inB[i] !== w);
}
// "Southern California" vs "northern California": two parts of one place.
const COMPASS = new Set('north south east west northern southern eastern western central'.split(' '));
const dir = w => w.replace(/ern$/, ''); // east and eastern are one direction
const compassClash = (a, b) => a.some((w, i) => COMPASS.has(w) && i + 1 < a.length && b.some((v, k) => COMPASS.has(v) && dir(v) !== dir(w) && b[k + 1] === a[i + 1]));
// develop: the two headlines came out hours apart, so new figures or a reversal ("suspends" then "resumes") are the
// next step of one story, not a contradiction.
function conflict(a, b, ca = new Set(), cb = new Set(), fa = new Set(), fb = new Set(), nameRule = true, develop = false) {
  const na = [...new Set(hasNum(a))], nb = [...new Set(hasNum(b))];
  // different figures conflict unless one headline just adds detail (e.g. "7.1 quake" vs "7.1 quake, 12 dead")
  // a later development may bring new figures only when it repeats one of the first report's ("$6.3bn")
  if (na.length && nb.length && !na.every(x => nb.includes(x)) && !nb.every(x => na.includes(x)) && !(develop && na.some(x => nb.includes(x)))) return true;
  const A = new Set(a), B = new Set(b);
  if (A.has('not') !== B.has('not') || A.has('no') !== B.has('no')) return true; // negation
  if (compassClash(a, b)) return true;
  const SA = new Set(a.map(ANT)), SB = new Set(b.map(ANT));
  if (!develop && ANTONYMS.some(([x, y]) => (SA.has(x) && SB.has(y)) || (SA.has(y) && SB.has(x)))) return true;
  // a name/place that appears in only one headline (Gaza vs Lebanon, UK vs US)
  // Only when BOTH headlines carry a name the other lacks. One-sided extra detail ("... after fleeing to Miami") is the same story.
  if (nameRule && [...ca].some(w => !B.has(w)) && [...cb].some(w => !A.has(w))) return true;
  return orderConflict(a, b, fa, fb);
}
// Conservative but usable: shared distinctive words, no conflicting figures/names/direction.
// Names so common that sharing one says little about whether two headlines are the same story.
const COMMON = new Set('trump biden us uk eu un china russia ukraine israel iran gaza president minister government police court state america american britain'.split(' ')); // canon form: British -> britain
function same(a, b, ca, cb, fa, fb, la = new Set(), lb = new Set()) {
  if (conflict(a, b, ca, cb, fa, fb)) return false;
  const da = distinct(a), db = distinct(b);
  const { shared, jac } = overlap(da, db);
  // Outlets word the same story differently: two shared names (or one rare name) plus a few shared words is enough.
  // At least one shared word must be an ordinary word: two stories that only share "Justice Department" and "California"
  // are not the same story.
  const sb = new Set(db), ents = da.filter(w => sb.has(w) && la.has(w) && lb.has(w) && !COMMON.has(w));
  const nameCount = countNames(ents, (v, w) => a.indexOf(w) - a.indexOf(v) === 1 && b.indexOf(w) - b.indexOf(v) === 1);
  const plain = da.some(w => sb.has(w) && !la.has(w) && !lb.has(w));
  if (plain && ((nameCount >= 2 && shared >= 3 && jac >= 0.25) || (ents.length >= 1 && shared >= 4 && jac >= 0.3))) return true;
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

// --- Second pass: the same story, worded differently -------------------
// Outlets often word one story very differently ("Michigan Dem Haley Stevens endorses Republican" vs "Democrat endorses
// Republican candidate in key Michigan Senate race"), so headline matching alone misses it. Two stories are joined when:
//  - their headlines and summaries share two rare names (people, places, groups that at most 4 stories mention),
//  - their headlines share an ordinary word too, not just the names ("Elon Musk wins appeal" and "Elon Musk to step
//    down" share only the name, so they stay apart),
//  - a fair part of all their words is shared, they came out within 36 hours of each other,
//  - and no two headlines contradict: different figures, opposite verbs, swapped roles, or a name in one headline that
//    the other story never mentions ("Senate passes..." vs "House passes...", "floods in Niger" vs "floods in Nigeria").
const RARE = 4, MIN_SHARED_WORDS = 0.12, WINDOW_H = 36, FOLLOW_MIN_H = 3, FOLLOW_MAX_H = 72, FOLLOW_WORDS = 0.15;
// "Indian" is a form of "India", "Mexican" of "Mexico"; "Nigeria" is not a form of "Niger", nor "Australia" of "Austria".
function akin(a, b) {
  if (a === b) return true;
  if (PLACES.has(b) || [...PLACES].some(p => p !== a && p.startsWith(a) && b.startsWith(p))) return false; // "Nigerian" belongs to Nigeria, not Niger
  const stem = b.startsWith(a) ? a : a.replace(/[aeiouy]$/, '');
  return b.startsWith(stem) && ['', 'n', 'an', 'ian', 'ese', 'ish', 'i'].includes(b.slice(stem.length));
}
const mentions = (words, w) => words.has(w) || [...words].some(v => akin(w, v) || akin(v, w));
function storyFacts(c, lowerAll, lowerSeen, capSeen) {
  const names = new Set(), head = new Set();
  for (const i of c.items) {
    for (const w of [...caps(i.title, lowerSeen, capSeen), ...caps(clean(i.summary), lowerSeen, capSeen)]) if (!lowerAll.has(w) && !COMMON.has(w) && !/^\d+$/.test(w)) names.add(w);
    for (const w of distinct(i.tk)) head.add(w);
  }
  const words = new Set(distinct(tokens(c.items.map(i => i.title + ' ' + clean(i.summary)).join(' '))));
  const pairs = new Set(); // "v w" for every two words written next to each other
  for (const i of c.items) for (const t of [i.title, clean(i.summary)]) tokens(t).forEach((w, k, ws) => { if (k) pairs.add(ws[k - 1] + ' ' + w); });
  return { names, head, words, pairs, newest: Math.max(...c.items.map(i => i.ts || 0)) };
}
// Can group A (its items and facts) join group B? Checks every headline pair.
// When each of two headlines carries a name the other lacks, they stay apart if:
//  - neither story mentions the other's name anywhere ("Senate passes..." vs "House passes...", "floods in Niger" vs
//    "floods in Nigeria"); chambers, courts and countries must be in the other story's headlines, since summaries
//    often name the other one too,
//  - both headlines name countries and one has a country the other story's headlines lack ("elections in Serbia and
//    Brazil" vs "Brazil elections"),
//  - or the headlines say the same thing about different names ("Atlanta police chief resigns" vs "New Orleans police
//    chief resigns"), even when a summary names the other place. When only one story mentions the other's name, the
//    headlines must be almost word for word the same to split.
// Where a headline cannot show what is a name (Title Case, or its first word), a word written in lower case in some
// summary ("Hackers", "Boy") is an ordinary word.
const place = w => PLACES.has(w) || [...PLACES].some(p => akin(p, w));
const SAME_FRAME = 0.5, SAME_FRAME_ONE_SIDED = 0.8, SAME_NAMES = 0.3;
function canJoin(A, B, ordinary, develop = false) {
  const unsure = (x, w) => { const ws = norm(x.title).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); return isTitleCase(ws) || canon((ws[0] || '').toLowerCase()) === w; };
  const own = (x, y) => { const ys = new Set(y.tk); return [...x.cp].filter(w => !mentions(ys, w) && (SUBJECTS.has(w) || place(w) || !ordinary.has(w) || !unsure(x, w))); };
  const missing = (names, other) => names.filter(w => !mentions(SUBJECTS.has(w) || place(w) ? other.head : other.words, w));
  const rest = (x, names) => x.tk.filter(w => !names.includes(w));
  return A.items.every(x => B.items.every(y => {
    if (conflict(x.tk, y.tk, x.cp, y.cp, x.fp, y.fp, false, develop)) return false;
    const ox = own(x, y), oy = own(y, x);
    if (!ox.length && !oy.length) return develop || similarity(x.tk, y.tk) >= SAME_NAMES; // the same names: the headlines must agree too
    if (!ox.length || !oy.length) return true; // one headline only adds detail
    const mx = missing(ox, B), my = missing(oy, A);
    if (mx.length && my.length) return false;
    if ((mx.some(place) && [...y.cp].some(place)) || (my.some(place) && [...x.cp].some(place))) return false;
    // one-sided: lenient unless a real name was swapped one for one ("Memphis" for "Baltimore")
    const real = w => SUBJECTS.has(w) || place(w) || !ordinary.has(w);
    if ((mx.some(real) || my.some(real)) && !(ox.length === 1 && oy.length === 1)) return similarity(rest(x, ox), rest(y, oy)) < SAME_FRAME_ONE_SIDED;
    // both mention each other: the shorter headline's words mostly in the longer one means the same frame
    const rx = new Set(rest(x, ox)), ry = new Set(rest(y, oy));
    return [...rx].filter(w => ry.has(w)).length / (Math.min(rx.size, ry.size) || 1) < SAME_FRAME;
  }));
}
function mergeByNames(clusters, lowerSeen, capSeen) {
  const lowerAll = new Set(lowerSeen); // words written in lower case anywhere (summaries too) are ordinary words, not names
  for (const c of clusters) for (const i of c.items) for (const w of clean(i.summary).split(/\s+/)) {
    const x = w.replace(/[^A-Za-z]/g, '');
    if (x.length > 2 && /^[a-z]/.test(x)) lowerAll.add(canon(x));
  }
  const facts = clusters.map(c => storyFacts(c, lowerAll, lowerSeen, capSeen));
  const df = new Map(); // in how many stories each name appears
  for (const f of facts) for (const w of f.names) df.set(w, (df.get(w) || 0) + 1);
  const rare = w => df.get(w) <= RARE;
  // groups[k]: the merged group cluster k belongs to; each group keeps its items and the union of its facts
  const groups = clusters.map((c, k) => ({ items: c.items.slice(), head: new Set(facts[k].head), words: new Set(facts[k].words), names: new Set(facts[k].names), newest: facts[k].newest }));
  const byName = new Map(); // rare name -> clusters that mention it, so only plausible pairs are compared
  facts.forEach((f, k) => { for (const w of f.names) if (rare(w)) byName.set(w, [...(byName.get(w) || []), k]); });
  for (const list of byName.values()) for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
    const i = list[p], j = list[q], A = facts[i], B = facts[j], gi = groups[i], gj = groups[j];
    if (gi === gj || Math.abs(A.newest - B.newest) > WINDOW_H * 36e5) continue;
    const sharedNames = countNames([...A.names].filter(w => B.names.has(w) && rare(w)), (v, w) => A.pairs.has(v + ' ' + w));
    const sharedPlainWord = [...A.head].some(w => B.head.has(w) && !A.names.has(w) && !B.names.has(w));
    if (sharedNames < 2 || !sharedPlainWord) continue;
    if (overlap([...A.words], [...B.words]).jac < MIN_SHARED_WORDS || !canJoin(gi, gj, lowerAll)) continue;
    join(gi, gj);
  }
  followUps([...new Set(groups)], lowerAll);
  // newest item first, as in the first pass (the card links each outlet's newest article)
  return [...new Set(groups)].map(g => ({ items: g.items.sort((x, y) => (y.ts || 0) - (x.ts || 0)), latest: g.latest }));
  function join(gi, gj) {
    gi.items.push(...gj.items);
    for (const k of ['head', 'words', 'names']) for (const w of gj[k]) gi[k].add(w);
    gi.newest = Math.max(gi.newest, gj.newest);
    groups.forEach((g, k) => { if (g === gj) groups[k] = gi; });
  }
  // Repeats: a later development of a story ("Binance suspends withdrawals after hack", then "Binance resumes
  // withdrawals after hack") is one story. Two groups join when they came out hours apart (but within 3 days), name the
  // same uncommon name in their headlines ("Elon Musk" counts once), share two more headline words that are not everyday news words (one if they share
  // two names) and a fair part of all their words, and pass
  // the same name checks as above (so Sudan and South Sudan stay apart). The card then shows the newest headline.
  function followUps(list, ordinary) {
    list.sort((a, b) => b.newest - a.newest);
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const A = list[p], B = list[q];
      if (A.gone || B.gone) continue;
      const gap = Math.abs(A.newest - B.newest) / 36e5;
      if (gap < FOLLOW_MIN_H || gap > FOLLOW_MAX_H) continue;
      const shared = [...A.head].filter(w => B.head.has(w));
      const names = shared.filter(w => A.names.has(w) && B.names.has(w) && !COMMON.has(w));
      const plain = shared.filter(w => !A.names.has(w) && !B.names.has(w) && (/\d/.test(w) || !COMMON_NEWS.has(w))).length; // figures count, "talks" and "deal" do not
      const nameCount = countNames(names, (v, w) => A.items.some(i => i.tk.includes(v) && i.tk.indexOf(w) - i.tk.indexOf(v) === 1));
      if (!nameCount || plain < (nameCount >= 2 ? 1 : 2)) continue;
      if (overlap([...A.words], [...B.words]).jac < FOLLOW_WORDS || !canJoin(A, B, ordinary, true)) continue;
      const latest = A.latest || A.items.slice();
      join(A, B); A.latest = latest; B.gone = true;
    }
  }
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
  for (const c of mergeByNames(clusters, lowerSeen, capSeen)) {
    const sources = [...new Set(c.items.map(i => i.source))];
    const verified = new Set(sources.map(family)).size >= minSources;
    if (!verified && !localOk) continue;
    // user-picked topics: keep the story only if its headlines and summaries (and the sections outlets filed it under)
    // fit a picked topic; the top 10 fills from what is left
    const filed = [...new Set(c.items.flatMap(i => i.topics || []))];
    if (!TOPICS.wanted(c.items.map(i => i.title).join(' '), show, c.items.map(i => i.summary || '').join(' '), filed)) continue;
    // The headline shown is the one closest to all the others (the core of the story); ties go to the newest, then to
    // the one with the longest summary.
    // For a story with later developments, only the newest development's headlines are candidates.
    const close = i => c.items.reduce((n, m) => n + (m === i ? 0 : overlap(distinct(i.tk), distinct(m.tk)).shared), 0);
    const lead = (c.latest || c.items).map(i => ({ i, n: close(i) }))
      .sort((a, b) => b.n - a.n || (b.i.ts || 0) - (a.i.ts || 0) || (b.i.summary || '').length - (a.i.summary || '').length)[0].i;
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
      heads: new Set(c.items.flatMap(i => distinct(i.tk))), names: new Set(c.items.flatMap(i => [...i.cp]).filter(w => !COMMON.has(w))),
      verified, ts: newest, firstTs: Math.min(...c.items.map(i => i.ts).filter(t => t > 0), Infinity) === Infinity ? 0 : Math.min(...c.items.map(i => i.ts).filter(t => t > 0)), links: c.items.map(i => i.link), score
    });
  }
  out.sort((a, b) => b.score - a.score);
  dropRepeats(out);
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

// Last safety net against repeats: a lower-ranked story whose headlines share a name and two more telling words with a
// story already shown is the same subject again ("North Korea linked to Binance hack" under "Binance resumes
// withdrawals after $6.3bn hack"). It is hidden, not merged: its outlets do not count towards the shown story, but its
// links do, so it does not come back as new.
const BROAD_NAMES = new Set('ai crypto republican democrat labour tory conservative reform'.split(' ').map(canon)); // too broad to tie two stories
function dropRepeats(out) {
  const kept = [];
  for (let k = 0; k < out.length; k++) {
    const s = out[k];
    const same = kept.find(t => {
      if (s.verified && !t.verified) return false; // a single-outlet story never hides a verified one
      const shared = [...s.heads].filter(w => t.heads.has(w));
      const names = shared.filter(w => s.names.has(w) && t.names.has(w) && !COMMON_NEWS.has(w) && !SUBJECTS.has(w) && !BROAD_NAMES.has(w)).length;
      const plain = shared.filter(w => !s.names.has(w) && !t.names.has(w) && (/\d/.test(w) || !COMMON_NEWS.has(w))).length;
      // a verified story is hidden only on stronger ties: two names or a shared figure
      return names && plain >= 2 && (!s.verified || names >= 2 || shared.some(w => /\d/.test(w)));
    });
    if (same) { same.links.push(...s.links.filter(l => !same.links.includes(l))); out.splice(k--, 1); } else kept.push(s);
  }
  for (const s of out) { delete s.heads; delete s.names; }
}

module.exports = { isLowQuality, conflict, caps, distinct, same, tokens, decode, clean, safeLink, rankStories, similarity, shorten, SOFT };
