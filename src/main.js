const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeImage, session, powerMonitor, net, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchAll, setFetch } = require('./fetcher');
const Reddit = require('./reddit');
const Background = require('./background');

// Low-footprint flags: no GPU process (saves RAM), small JS heap.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=96');
app.commandLine.appendSwitch('disable-background-networking');

const GEO = require('./geo');
const TOPICS = require('./topics');
const localeCountry = () => { const c = (app.getSystemLocale() || '').split(/[-_]/).slice(1).map(x => x.toUpperCase()).find(x => /^[A-Z]{2}$/.test(x) && GEO.validCountry(x)); return c || 'US'; };
const DEFAULTS = { country: 'US', state: '', alerts: true, startup: true, configured: false, reddit: false }; // Reddit is an opt-in bonus
// Every link that leaves the app goes through here: https only, no credentials, sane length;
// failures (no default browser, blocked by policy) tell the user instead of failing silently.
async function openLink(url) {
  try {
    if (typeof url !== 'string' || url.length > 2048) throw new Error('bad');
    const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) throw new Error('bad');
    await shell.openExternal(u.href);
  } catch { push('notice', "Couldn't open that link in your browser."); }
}
const isHttps = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => showWin());
app.enableSandbox();
let quitting = false;
app.on('before-quit', () => { quitting = true; });
app.on('session-end', () => { quitting = true; });
let win = null, tray, data = null, settings = sanitize(DEFAULTS, DEFAULTS), seen = new Set(), lastDaily = '';
const store = () => path.join(app.getPath('userData'), 'state.json');

function sanitize(s, base) {
  s = s || {};
  const country = GEO.validCountry(s.country) ? s.country : base.country;
  const region = GEO.hasRegions(country) && GEO.validRegion(country, String(s.state || '')) ? String(s.state || '') : '';
  return { configured: !!s.configured, country, state: region, alerts: s.alerts !== false, startup: s.startup !== false, topics: TOPICS.fromSettings(s), reddit: s.reddit === true,
    theme: s.theme === 'light' ? 'light' : 'dark', textColor: ['light', 'dark'].includes(s.textColor) ? s.textColor : 'auto',
    blur: typeof s.blur === 'number' && s.blur >= 0 ? Math.min(40, Math.round(s.blur)) : 24, bg: s.bg === 'light' || s.bg === 'dark' ? s.bg : '' }; // bg: tone of the picture, '' = none
}
// Cached stories come from disk, so check their shape before anything renders them.
function cleanData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const ok = x => x && typeof x === 'object' && typeof x.title === 'string' && isHttps(x.link) && Array.isArray(x.sources) && x.sources.every(n => typeof n === 'string') && Array.isArray(x.links) && x.links.every(l => typeof l === 'string');
  const out = { fetchedAt: Number(d.fetchedAt) || 0, loc: typeof d.loc === 'string' ? d.loc : '', picks: typeof d.picks === 'string' ? d.picks : '' };
  for (const k of ['world', 'country', 'state', 'tech']) out[k] = Array.isArray(d[k]) ? d[k].filter(ok).slice(0, 10).map(x => ({ ...x, summary: typeof x.summary === 'string' ? x.summary : '', detail: typeof x.detail === 'string' ? x.detail.slice(0, 400) : '', articles: Array.isArray(x.articles) ? x.articles.filter(a => a && typeof a.outlet === 'string' && isHttps(a.link) && x.links.includes(a.link)).slice(0, 20).map(a => ({ outlet: a.outlet, link: a.link })) : [], ts: Number(x.ts) || 0, firstTs: Number(x.firstTs) || 0, score: Number(x.score) || 0, impact: Number(x.impact) || 0, indep: Number(x.indep) || 0, verified: !!x.verified })) : [];
  return out;
}
function load() {
  try {
    const j = JSON.parse(fs.readFileSync(store(), 'utf8'));
    settings = sanitize({ ...DEFAULTS, ...j.settings }, DEFAULTS); seen = new Set(Array.isArray(j.seen) ? j.seen.filter(x => typeof x === 'string') : []);
    lastDaily = typeof j.lastDaily === 'string' ? j.lastDaily : ''; data = cleanData(j.data);
    if (data && !data.picks) data.picks = settings.topics.join(','); // cache saved before topic picks existed
    if (data) data.reddit = Reddit.valid(j.data && j.data.reddit);
    Reddit.restore(j.rstate);
    if (settings.bg && !fs.existsSync(bgFile())) settings.bg = ''; // the picture is gone from disk
    if (data) data.redditStatus = Reddit.status(data.reddit.length > 0);
  } catch {}
}
function save() {
  try { const tmp = store() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ settings, seen: [...seen].slice(-1500), lastDaily, data, rstate: Reddit.snapshot() })); fs.renameSync(tmp, store()); } catch {}
}

// Background picture: a small JPEG copy kept in the app's own data folder. It never leaves this PC.
const bgFile = () => path.join(app.getPath('userData'), 'background.jpg');
// Read only when a window needs it, so nothing stays in memory while the widget sits in the tray.
function readBackground() {
  try { return 'data:image/jpeg;base64,' + fs.readFileSync(bgFile()).toString('base64'); } catch { return ''; }
}
// What the window gets: the saved settings plus the picture itself.
const view = () => ({ ...settings, bgUrl: settings.bg ? readBackground() : '' });

function createWindow() {
  const room = screen.getPrimaryDisplay().workAreaSize.height; // small screens at high zoom: shrink the height, the list scrolls
  win = new BrowserWindow({
    width: 360, height: Math.max(360, Math.min(540, room - 40)), frame: false, resizable: false, maximizable: false, transparent: true, backgroundColor: '#00000000', skipTaskbar: false,
    icon: path.join(__dirname, 'icon.png'), alwaysOnTop: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, backgroundThrottling: true, devTools: !app.isPackaged }
  });
  const w = win;
  w.loadFile(path.join(__dirname, 'index.html'));
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', e => e.preventDefault());
  w.webContents.on('will-attach-webview', e => e.preventDefault());
  w.webContents.on('did-finish-load', () => { push('settings', view()); if (data) push('data', lastError ? { ...data, error: 'offline' } : data); });
  // Closing DESTROYS the window so no renderer process runs while the widget sits in the tray.
  w.on('closed', () => { if (win === w) win = null; });
}

const live = () => win && !win.isDestroyed() && !win.webContents.isDestroyed();
function push(ch, payload) { if (live()) win.webContents.send(ch, payload); }

function setLogin() {
  if (!app.isPackaged || !settings.configured) return; // never register dev builds, or before the user has chosen
  app.setLoginItemSettings({ openAtLogin: !!settings.startup });
}
function showWin() {
  if (!live()) createWindow();
  else { win.show(); win.focus(); }
}

const TABS = ['world', 'country', 'state', 'tech'];
const notes = new Set(); // keep references so click handlers survive GC
let inflight = null, failures = 0, timer = null, lastError = false;
function pushOffline() {
  lastError = true;
  const loc = settings.country + '|' + settings.state;
  push('data', data && data.loc === loc && data.picks === settings.topics.join(',') ? { ...data, error: 'offline' } : { error: 'offline' });
}

function refresh(daily) {
  if (!inflight) inflight = doRefresh(daily).catch(() => { pushOffline(); }).finally(() => { inflight = null; });
  return inflight;
}

async function doRefresh(daily) {
  const loc = settings.country + '|' + settings.state;
  const fresh = await fetchAll({ ...settings });
  if (loc !== settings.country + '|' + settings.state) return doRefresh(daily); // location changed mid-refresh: discard and redo
  if (fresh.offline) { pushOffline(); failures++; return; } // no feed answered; empty tabs from the topic filter are a normal result
  // A tab that came back empty (feed outage) keeps its previous list instead of being wiped.
  const picks = settings.topics.join(',');
  if (data && data.loc === loc && data.picks === picks && Date.now() - (data.fetchedAt || 0) < 24 * 36e5) for (const k of TABS) if (!fresh[k].length && data[k] && data[k].length) fresh[k] = data[k];
  fresh.loc = loc; fresh.picks = picks;
  fresh.reddit = (data && data.reddit) || []; // community posts have their own, slower refresh (see redditKick)
  fresh.redditStatus = data && data.redditStatus;
  failures = 0; lastError = false;
  const first = !data || data.loc !== loc; // new install or new location: record, don't alert
  data = fresh;
  if (daily) lastDaily = new Date().toDateString();
  // Breaking alert: story first reported <6h ago, covered by 3+ trusted outlets, not alerted before.
  // On the very first run we only record current stories so you aren't flooded.
  const all = TABS.flatMap(k => fresh[k]);
  let alerts = 0;
  for (const s of all.slice().sort((a, b) => b.score - a.score)) {
    const known = s.links.some(l => seen.has(l));
    const age = Date.now() - s.firstTs;
    const major = s.impact >= 3 || (s.impact >= 2 && s.indep >= 4);
    const breaking = major && s.indep >= 3 && s.firstTs > 0 && age > -3e5 && age < 6 * 36e5;
    if (known) continue;
    if (breaking) {
      s.links.forEach(l => seen.add(l));
      if (settings.alerts && !first && alerts < 2) { alerts++; notify(s); } // max 2 per refresh
    } else if (first) s.links.forEach(l => seen.add(l));
  }
  while (seen.size > 1500) seen.delete(seen.values().next().value); // cap the in-memory set too
  save();
  push('data', data);
  redditKick();
}

// Reddit community section: separate from the verified news. Throttled to one pull per hour, backs off on 429/403,
// runs in the background so a slow Reddit never delays the news refresh.
function redditKick() {
  if (!settings.reddit || !settings.topics.length || !data) return; // nothing picked: no Reddit request either
  const show = list => {
    if (!settings.reddit || !data) return;
    data.reddit = list; data.redditStatus = Reddit.status(list.length > 0); save();
    push('data', lastError ? { ...data, error: 'offline' } : data);
  };
  const before = data.reddit || [];
  Reddit.refresh(before, show).then(list => {
    if (list !== before || JSON.stringify(Reddit.status(list.length > 0)) !== JSON.stringify(data && data.redditStatus)) show(list); // new posts, or a new reason to show
  }).catch(() => {});
}

function notify(s) {
  const n = new Notification({ title: 'Breaking: ' + s.sources.slice(0, 3).join(', '), body: s.title });
  notes.add(n);
  while (notes.size > 20) notes.delete(notes.values().next().value); // 'close' isn't guaranteed to fire; never accumulate
  const done = () => notes.delete(n);
  n.on('click', () => { showWin(); openLink(s.link); done(); });
  n.on('close', done);
  n.show();
}

// One timer, re-armed after every run. 15 min on mains, 60 min on battery, exponential
// back-off while offline, nothing while the PC is locked/asleep, and skipped when idle for 30+ min.
function delayMs() {
  const t = Number(process.env.DNW_TEST_INTERVAL_MS); if (process.env.CI === 'true' && t >= 5000) return t; // CI-only: shorten the poll to measure repeat refreshes
  if (failures) return Math.min(15, 2 ** failures) * 60000;
  return (powerMonitor.isOnBatteryPower() ? 60 : 15) * 60000;
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if ((process.env.CI === 'true' && process.env.DNW_TEST_INTERVAL_MS) || powerMonitor.getSystemIdleTime() < 1800) await tick(); else if (!data) await tick();
    schedule();
  }, delayMs());
  if (timer.unref) timer.unref();
}
function tick() {
  const today = new Date().toDateString();
  return refresh(lastDaily !== today).catch(() => {});
}
const stale = ms => !data || Date.now() - (data.fetchedAt || 0) > ms;

if (gotLock) app.whenReady().then(() => {
  app.setAppUserModelId('com.local.dailynews');
  setFetch((u, o) => net.fetch(u, o)); // uses the Windows proxy configuration
  Reddit.setFetch((u, o) => net.fetch(u, o));
  Reddit.onChange(save);
  load();
  if (!settings.configured) settings.country = localeCountry();
  setLogin();
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  initUpdater();
  if (!process.argv.includes('--start-hidden')) createWindow(); // flag used by the CI resource measurement
  const img = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Daily News Widget');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: showWin },
    { label: 'Refresh now', click: () => refresh(true).catch(() => {}) },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWin);
  tick().finally(schedule);
  // Sleep/lock: stop the timer; on wake, catch up only if data is old.
  powerMonitor.on('suspend', () => clearTimeout(timer));
  powerMonitor.on('lock-screen', () => clearTimeout(timer));
  const wake = () => { (stale(10 * 60000) ? tick() : Promise.resolve()).finally(schedule); };
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);
  powerMonitor.on('on-battery', schedule);
  powerMonitor.on('on-ac', schedule);
  if (updatesOn()) setInterval(() => { try { require('electron-updater').autoUpdater.checkForUpdates().catch(() => {}); } catch {} }, 24 * 36e5).unref();
});

ipcMain.handle('get-settings', () => view());
ipcMain.handle('reddit-comment', (_e, link) => (settings.reddit ? Reddit.comment(link) : '')); // the top comment of a post the reader opened
ipcMain.handle('set-settings', async (_e, s) => {
  s = s || {};
  const old = settings;
  settings = sanitize({ ...settings, country: s.country, state: s.state, alerts: !!s.alerts, startup: !!s.startup, topics: s.topics, reddit: s.reddit === true, configured: true }, settings); // the look is kept as it was
  if (!settings.reddit) { Reddit.cancel(); if (data) { data.reddit = []; data.redditStatus = undefined; } } // turning it off aborts any pull in progress
  else if (!settings.topics.length) Reddit.cancel(); // nothing picked: stop asking Reddit too
  setLogin();
  save();
  if (inflight) await inflight.catch(() => {});
  await refresh(true);
  if (settings.reddit && !old.reddit) redditKick(); // still subject to the hourly throttle; saving settings never forces a pull
  return view();
});
// Look settings change on their own, right away, and never trigger a news refresh.
ipcMain.handle('set-look', (_e, s) => {
  s = s || {};
  const next = { ...settings };
  for (const k of ['theme', 'textColor', 'blur']) if (k in s) next[k] = s[k];
  settings = sanitize(next, settings); save();
  return { ...settings }; // no picture here: the window already has it
});
ipcMain.handle('pick-background', async () => {
  if (!live()) return {};
  try {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a background picture', properties: ['openFile'], filters: [{ name: 'JPG or PNG', extensions: ['jpg', 'jpeg', 'png'] }] });
    if (r.canceled || !r.filePaths.length) return {};
    const file = r.filePaths[0];
    if (fs.statSync(file).size > Background.MAX_BYTES) return { error: 'That picture is too big. Use one under 10 MB.' };
    const buf = fs.readFileSync(file);
    if (!Background.isImage(buf)) return { error: 'Only JPG or PNG pictures work.' };
    const dims = Background.size(buf); // from the header, before anything is decoded
    if (!Background.sane(dims)) return { error: 'That picture is too large. Use one under 40 megapixels.' };
    let img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { error: "That picture couldn't be read." };
    const to = Background.fit(dims.width, dims.height);
    if (to.resize) img = img.resize({ ...to.resize, quality: 'good' });
    img = img.crop(to.crop);
    const jpg = img.toJPEG(88);
    const small = img.resize({ width: 8, height: 8 }).toBitmap();
    const tmp = bgFile() + '.tmp'; fs.writeFileSync(tmp, jpg); fs.renameSync(tmp, bgFile());
    settings = { ...settings, bg: Background.tone(small) }; save();
    return { settings: view() };
  } catch { return { error: "That picture couldn't be used." }; }
});
ipcMain.handle('clear-background', () => {
  try { fs.unlinkSync(bgFile()); } catch {}
  settings = { ...settings, bg: '' }; save();
  return view();
});
ipcMain.handle('refresh', () => refresh(true));
ipcMain.on('open', (_e, url) => { openLink(url); });
ipcMain.on('hide', () => { if (live()) win.close(); });
app.on('window-all-closed', () => {}); // stay alive in the tray

// Auto-update: only in packaged builds that are code-signed (publisherName set), and only from the
// publish target in package.json. Windows verifies the update is signed by the same publisher (see SECURITY.md).
function updatesOn() { return app.isPackaged && require('./updates').updatesEnabled(require('../package.json')); }
function initUpdater() {
  if (!updatesOn()) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch {}
}
