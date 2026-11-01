// Soak test: thousands of refresh cycles, window open/close, location changes, sleep/wake — does memory grow?
// Run: node --expose-gc test/soak.js [cycles]
const path = require('path'), os = require('os'), fs = require('fs');
const W = path.resolve(__dirname, '..');
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'soak-'));
const H = require('./support/harness')(W, { userData: ud });
const N = require('./support/feeds')();
H.fetchImpl = N.fetch;
const CYCLES = Number(process.argv[2]) || 3000;
const TOPICS = ['earthquake strikes', 'ceasefire talks resume', 'central bank holds rates', 'election results announced', 'chip maker unveils accelerator', 'wildfire forces evacuations', 'court rules on privacy case', 'storm hits coast'];
const PLACES = ['Japan', 'Chile', 'Turkey', 'Texas', 'Ontario', 'Kenya', 'Norway', 'Peru'];
const mb = () => { global.gc(); global.gc(); return +(process.memoryUsage().heapUsed / 1048576).toFixed(2); };
const outlets = ['bbc', 'guardian', 'npr', 'nyt', 'aljazeera', 'dw'];
(async () => {
  await H.ready; await H.flush();
  const refresh = H.handlers['refresh'], setS = H.handlers['set-settings'];
  const samples = [];
  for (let i = 1; i <= CYCLES; i++) {
    // every feed gets brand-new stories each cycle (worst case for caches/seen-set growth)
    const items = Array.from({ length: 30 }, (_, k) => [`${PLACES[(i + k) % 8]} ${TOPICS[(i * 3 + k) % 8]} update ${i}-${k}`, `https://news.example/${i}/${k}`, 1]);
    N.bodies['re:.*'] = N.rss(items);
    await refresh();
    if (i % 10 === 0 && H.win) H.win.close();          // close to tray (window destroyed)
    if (i % 10 === 5) H.trayClick && H.trayClick();      // reopen from tray
    if (i % 50 === 0) await setS({}, { country: ['US', 'GB', 'CA', 'DE'][(i / 50) % 4], state: '', alerts: true, startup: true });
    if (i % 25 === 0) { H.pm.emit('lock-screen'); H.pm.emit('suspend'); H.pm.emit('resume'); H.pm.emit('unlock-screen'); }
    H.timers.length = 0; H.sent.length = Math.min(H.sent.length, 20); H.notes.length = 0; // harness bookkeeping, not app state
    if (i % (CYCLES / 6) === 0) { samples.push([i, mb()]); console.log('cycle', i, 'heap MB', samples.at(-1)[1]); }
  }
  const growth = samples.at(-1)[1] - samples[1][1];
  console.log('growth between sample 2 and last:', growth.toFixed(2), 'MB over', CYCLES - samples[1][0], 'cycles');
  const state = JSON.parse(fs.readFileSync(path.join(ud, 'state.json'), 'utf8'));
  console.log('state.json bytes', fs.statSync(path.join(ud, 'state.json')).size, 'seen', state.seen.length);
  process.exit(growth > 5 || state.seen.length > 1500 ? 1 : 0);
})();
