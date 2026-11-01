// Community discussion from AI subreddits, read from Reddit's public Atom (RSS) feeds: no login, no API key, no app.
// This is NOT news: it never enters the verified ranking and is exempt from the 2-outlet rule.
// Shows what the posts say (title, a text preview, the top comment when a post is opened); nothing is generated.
const Parser = require('rss-parser');
const SUBS = ['ClaudeAI', 'ChatGPT', 'OpenAI', 'LocalLLaMA', 'vibecoding', 'ClaudeCoding', 'BestGitHubRepos'];
const PER_SUB = 2, MAX_POSTS = 10; // posts kept per community / in total
const LISTING_URL = `https://www.reddit.com/r/${SUBS.join('+')}/top.rss?t=day&limit=100`; // one request covers all communities; the feed has no vote counts, so "top of the day" is the ranking
const UA = 'windows:daily-news-widget:v1.0.0 (by /u/speedlnq1)'; // Reddit's documented <platform>:<app id>:<version> (by /u/<user>) format
const CFG = { gap: 10000, request: 10000, fresh: 60 * 60000 }; // at most one comment request per 10 s
const COMMENT_TTL = 3 * 36e5, EMPTY_TTL = 10 * 60000, MAX_BODY = 2e6;
const parser = new Parser();
let doFetch = (...a) => fetch(...a);
let lastError = '', blockedUntil = 0, backoffStep = 0, running = null, lastAttempt = 0, epoch = 0, pullId = 0, curPull = 0, onState = () => {};
const controllers = new Set();
const comments = new Map(); // post id -> { at, text }; tiny, in memory
let lastComment = 0;

const setFetch = f => { doFetch = f; };
const configure = o => Object.assign(CFG, o);
// Strip control/bidi characters and markdown noise, collapse whitespace, cap length. Output is only ever rendered via textContent.
const clean = (s, max) => {
  s = String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*_~`>#]+/g, '')
    .replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
};
const safeLink = p => (typeof p === 'string' && /^\/r\/[A-Za-z0-9_]{2,30}\/comments\/[a-z0-9]{3,10}\/[A-Za-z0-9_-]{0,200}\/?$/.test(p)) ? 'https://www.reddit.com' + p : null;

// Every failure (HTTP error, captcha/HTML page, timeout, oversize, empty result) pushes the next allowed attempt out: 15 m, 30 m, 1 h ... 6 h.
function fail(retryAfterSec, reason) {
  lastError = reason;
  const until = Date.now() + Math.max((Number(retryAfterSec) || 0) * 1000, Math.min(6 * 36e5, 15 * 60000 * 2 ** backoffStep));
  blockedUntil = Math.max(blockedUntil, until); // only ever later: a second failure must not shorten a Retry-After
  backoffStep = Math.min(backoffStep + 1, 10);
  onState();
}
// Back-off state survives restarts so relaunching the app (or a login-time start) can't bypass a 429 or the hourly spacing.
const snapshot = () => ({ lastAttempt, blockedUntil, backoffStep, lastError });
// What the Reddit tab shows when it has no (fresh) posts: why, and when the next attempt is allowed.
const status = hasPosts => {
  const retryAt = Math.max(blockedUntil, hasPosts ? lastAttempt + CFG.fresh : 0); // with posts on screen the hourly spacing applies too
  return { error: lastError, retryAt: retryAt > Date.now() ? retryAt : 0 };
};
function restore(s) {
  s = s || {}; const now = Date.now(), n = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : lo);
  lastAttempt = n(s.lastAttempt, 0, now); blockedUntil = n(s.blockedUntil, 0, now + 6 * 36e5); backoffStep = n(s.backoffStep, 0, 10); lastError = clean(s.lastError, 120);
}

// Read the body with a hard size cap while streaming; the caller's abort signal (timeout / cancel) stays armed throughout.
async function readCapped(res, signal) {
  if (res.body && typeof res.body.getReader === 'function') {
    const rd = res.body.getReader(), chunks = []; let n = 0;
    let onAbort;
    const aborted = new Promise((_, rej) => { onAbort = () => { rd.cancel().catch(() => {}); rej(new Error('aborted')); }; signal.addEventListener('abort', onAbort); });
    aborted.catch(() => {});
    try {
      for (;;) {
        const { done, value } = await Promise.race([rd.read(), aborted]);
        if (done) break;
        n += value.length;
        if (n > MAX_BODY) { rd.cancel().catch(() => {}); throw new Error('big'); }
        chunks.push(value);
      }
    } finally { signal.removeEventListener('abort', onAbort); }
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
  }
  const text = await Promise.race([res.text(), new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))))]);
  if (text.length > MAX_BODY) throw new Error('big');
  return text;
}

const httpReason = code => code === 401 || code === 403 ? `Reddit refused the request (HTTP ${code}), usually a temporary block` : code === 429 ? 'Reddit asked the app to slow down (HTTP 429)' : `Reddit answered with an error (HTTP ${code})`;
const describe = (e, timedOut) => timedOut ? 'Reddit did not answer in time' : e instanceof SyntaxError ? 'Reddit sent a web page instead of data' : e.message === 'unreadable' ? 'Reddit sent something unreadable' : e.message === 'big' ? 'Reddit\'s reply was too large' : 'Could not connect to Reddit';

// One GET with a timeout covering fetch AND body. Resolves with the Atom feed's entries; every failure is recorded with its reason.
async function getFeed(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), CFG.request);
  controllers.add(ctl);
  try {
    const res = await doFetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'application/atom+xml' } });
    if (new URL(res.url || url).protocol !== 'https:') { fail(0, 'Reddit redirected to a non-secure address'); throw new Error('http insecure'); }
    if (!res.ok) { fail(res.headers && res.headers.get && res.headers.get('retry-after'), httpReason(res.status)); throw new Error('http ' + res.status); }
    if (Number(res.headers.get('content-length') || 0) > MAX_BODY) throw new Error('big');
    const text = await readCapped(res, ctl.signal);
    if (!/<feed[\s>]/.test(text)) throw new SyntaxError('not a feed'); // a block page or captcha instead of the feed
    try { return (await parser.parseString(text)).items || []; } catch { throw new Error('unreadable'); } // looks like a feed but is not valid XML
  } catch (e) {
    if (!/^http /.test(e.message) && !ctl.cancelled) fail(0, describe(e, ctl.signal.aborted)); // timeout, oversize, HTML/captcha page, network error
    throw e;
  } finally { clearTimeout(timer); controllers.delete(ctl); } // the timer covers fetch AND body, and never leaks
}

// Feed text arrives as HTML: drop the tags, then clean() handles entities, links and length.
const plain = (html, max) => clean(String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#32;/g, ' ').replace(/&#x?27;|&#39;/g, "'"), max);

// The post's own text for the preview card: the body of a text post, empty for a link or image post.
const preview = html => { const m = /<div class="md">([\s\S]*?)<\/div>/.exec(String(html || '')); return m ? plain(m[1].replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/p>/g, ' '), 400) : ''; };

// Keeps posts from the listed communities, at most PER_SUB from each, interleaved so a big community can't crowd out the others.
// Community and id come from the post's own link; anything that is not a Reddit comments link is dropped.
function pickPosts(entries) {
  const bySub = new Map(SUBS.map(name => [name, []]));
  for (const e of Array.isArray(entries) ? entries : []) {
    const m = e && /^https:\/\/www\.reddit\.com(\/r\/([A-Za-z0-9_]{2,30})\/comments\/([a-z0-9]{3,10})\/[^\s?#]{0,200})$/.exec(String(e.link));
    const sub = m && SUBS.find(name => name.toLowerCase() === m[2].toLowerCase());
    if (!sub || bySub.get(sub).length >= PER_SUB) continue;
    const post = { id: m[3], sub, title: clean(e.title, 200), text: preview(e.content), ts: Date.parse(e.isoDate || e.pubDate || '') || 0, link: safeLink(m[1]) };
    if (post.title && post.link) bySub.get(sub).push(post);
  }
  const posts = [];
  for (let i = 0; i < PER_SUB; i++) for (const list of bySub.values()) if (list[i]) posts.push(list[i]);
  return posts.slice(0, MAX_POSTS);
}

// The top comment of one post, fetched only when the reader opens that post (so the background pull is a single request).
// Cached (an empty answer only briefly), never asked for during a back-off, and at most one request every CFG.gap.
// Returns the text, '' when there is none, or null when the request had to wait: the caller may try again in a moment.
async function comment(link) {
  const path = String(link).replace(/^https:\/\/www\.reddit\.com/, ''), id = (/^\/r\/\w+\/comments\/([a-z0-9]+)\//.exec(path) || [])[1];
  if (!id || !safeLink(path) || !String(link).startsWith('https://www.reddit.com/')) return '';
  const hit = comments.get(id);
  if (hit && Date.now() - hit.at < (hit.text ? COMMENT_TTL : EMPTY_TTL)) return hit.text;
  if (Date.now() < blockedUntil) return '';
  if (Date.now() - lastComment < CFG.gap) return null;
  lastComment = Date.now();
  try {
    const entries = await getFeed(link + '.rss?sort=top&limit=5&depth=1');
    const c = entries.find(e => e.link !== link && /^\/u\//.test(String(e.title)) && !/^\/u\/(AutoModerator|\[deleted\])(?=\s|$)/.test(e.title) && !/^\[(deleted|removed)\]$/.test(plain(e.content, 400)) && plain(e.content, 400)); // not the post itself, a bot or a removed comment
    const text = c ? plain(c.content, 240) : '';
    if (comments.size > 60) comments.delete(comments.keys().next().value);
    comments.set(id, { at: Date.now(), text });
    return text;
  } catch { lastError = ''; onState(); return ''; } // the posts are fine, only the comment is missing: no scary message, saved or shown
}

// Fetches the listing and returns the posts, or null when nothing usable came back (the caller keeps the previous list).
async function pull(my, onPosts) {
  const posts = pickPosts(await getFeed(LISTING_URL));
  if (my !== epoch) return null;
  if (!posts.length) { fail(0, 'Reddit had no suitable posts'); return null; } // an empty answer counts as a failure: back off
  lastError = ''; backoffStep = 0; onState();
  onPosts(posts);
  return posts;
}

// Throttled: at most one pull per hour while posts are on screen, and no pulls at all during the back-off that follows any failure.
// With nothing on screen (first run, or the bonus was turned off and on again) a pull may start right away unless backing off.
// Resolves with `prev` (same reference) when nothing changed.
function refresh(prev, onPosts = () => {}) {
  if (running) return running;
  const spaced = prev && prev.length && Date.now() - lastAttempt < CFG.fresh;
  if (spaced || Date.now() < blockedUntil) return Promise.resolve(prev || []);
  lastAttempt = Date.now(); onState();
  const my = epoch, id = curPull = ++pullId;
  running = (async () => { try { return (await pull(my, posts => my === epoch && onPosts(posts.map(p => ({ ...p }))))) || prev || []; } catch { return prev || []; } })().finally(() => { if (curPull === id) running = null; }); // an old cancelled pull can't clear a newer one's flag
  return running;
}
// Turning Reddit off: abort in-flight requests and make the running pull discard its result.
function cancel() {
  epoch++; running = null; curPull = 0;
  for (const c of controllers) { c.cancelled = true; c.signal.aborted || c.abort(); }
  controllers.clear();
}

// Rebuild a persisted list field by field so a hand-edited state file can't inject anything.
const valid = l => (Array.isArray(l) ? l : []).slice(0, MAX_POSTS).map(p => p && ({
  id: /^[a-z0-9]{3,10}$/.test(String(p.id)) ? String(p.id) : '', sub: SUBS.includes(p.sub) ? p.sub : '', title: clean(p.title, 200), text: clean(p.text, 400), ts: Number(p.ts) || 0, link: safeLink(typeof p.link === 'string' ? p.link.replace(/^https:\/\/www\.reddit\.com/, '') : '')
})).filter(p => p && p.id && p.sub && p.title && p.link);
const state = () => ({ blockedUntil, lastAttempt, backoffStep, running: !!running });
const onChange = f => { onState = f; };

module.exports = { valid, snapshot, restore, status, onChange, refresh, comment, cancel, setFetch, configure, clean, safeLink, pickPosts, state };
