const assert = require('assert');
const { TRUSTED, FEEDS, SECTIONS, stateFeeds, countryFeeds } = require('../src/sources');
const OK = /(^|\.)(bbci\.co\.uk|theguardian\.com|aljazeera\.com|npr\.org|dw\.com|nytimes\.com|skynews\.com|independent\.co\.uk|the-independent\.com|rnz\.co\.nz|cbc\.ca|abc\.net\.au|thehindu\.com|pbs\.org|cbsnews\.com|abcnews\.go\.com|arstechnica\.com|technologyreview\.com|theverge\.com|wired\.com|techcrunch\.com|france24\.com|straitstimes\.com|kyivindependent\.com|csmonitor\.com|channelnewsasia\.com|rte\.ie|dailymaverick\.co\.za|smh\.com\.au|globalnews\.ca|404media\.co|news\.google\.com)$/;
const BAD = /opinion|comment|video|podcast|deals|shopping|sponsor/i;
const all = [...FEEDS.world, ...FEEDS.tech, ...Object.values(SECTIONS).flat(), ...Object.values(FEEDS.country).flat(), ...countryFeeds('FR', 'France'), ...stateFeeds('Ohio', 'US', 'United States')];
for (const [key, url] of all) {
  const u = new URL(url);
  assert.strictEqual(u.protocol, 'https:', url);
  assert(OK.test(u.hostname), 'unlisted host ' + u.hostname);
  assert(!BAD.test(u.pathname), 'non-news section ' + url);
  assert(key === 'gnews' || TRUSTED[key], 'untrusted key ' + key);
}
// Google News searches are restricted to reputable sites only.
for (const [, url] of [...countryFeeds('FR', 'France'), ...stateFeeds('Ohio', 'US', 'US')]) {
  const q = decodeURIComponent(new URL(url).searchParams.get('q'));
  assert(/site:nytimes\.com/.test(q) && !/site:(?!apnews|npr|bbc|theguardian|aljazeera|dw|pbs|cbsnews|abcnews|nytimes|skynews|independent|rnz|cbc|straitstimes|channelnewsasia|rte|dailymaverick|smh|globalnews)/.test(q));
}
// Outlets that rerun each other's copy count once; Google News attribution names map only to trusted outlets.
const { family } = require('../src/sources');
assert.strictEqual(family('straitstimes'), family('cna'));
assert.strictEqual(family('globalnews'), family('cbc'));
assert.strictEqual(family('smh'), family('guardian'));
assert.strictEqual(family('ap'), family('npr'));
assert.notStrictEqual(family('bbc'), family('guardian'));
const { NAME_TO_KEY } = require('../src/fetcher');
for (const key of Object.values(NAME_TO_KEY)) assert(TRUSTED[key], 'attribution name maps to untrusted ' + key);
console.log('sources tests passed');
