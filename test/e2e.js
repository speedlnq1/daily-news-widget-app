// End-to-end test of the PACKAGED app on Windows (run in CI by .github/workflows/build.yml).
// usage: node test/e2e.js "<path to Daily News Widget.exe>"   (needs playwright-core)
// Every scenario runs in its own throwaway --user-data-dir; one failure does not stop the others.
const { _electron: electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('assert');
const T = require('../src/topics');

const EXE = process.argv[2] || process.env.E2E_EXE;
if (!EXE || !fs.existsSync(EXE)) { console.error('exe not found: ' + EXE); process.exit(2); }
const OUT = path.resolve(process.env.E2E_OUT || 'e2e-out');
fs.mkdirSync(OUT, { recursive: true });
const OFFLINE = ['--proxy-server=127.0.0.1:9']; // every outbound request fails fast
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Poll until fn() is truthy (or throw with msg). Replaces fixed sleeps.
async function until(fn, msg, ms = 15000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for: ' + msg); await sleep(100); }
}
// Number of app processes. Throws if tasklist itself fails, so a broken probe can't look like "all exited".
const procCount = () => execFileSync('tasklist', ['/FI', 'IMAGENAME eq ' + path.basename(EXE), '/NH'], { encoding: 'utf8' }).split('\n').filter(l => l.includes(path.basename(EXE))).length;
const results = [];

const story = (title, sources, ageH, extra = {}) => ({
  title, summary: 'Short factual summary of the story so you can decide whether to open it.', sources, detail: 'First sentence of the feed summary. Second sentence with a few more details.',
  articles: sources.map(o => ({ outlet: o, link: 'https://example.com/' + encodeURIComponent(title) + '/' + o })),
  links: ['https://example.com/' + encodeURIComponent(title), ...sources.map(o => 'https://example.com/' + encodeURIComponent(title) + '/' + o)], link: 'https://example.com/' + encodeURIComponent(title),
  ts: Date.now() - ageH * 36e5, firstTs: Date.now() - ageH * 36e5, verified: sources.length > 1, score: 10, impact: 2, indep: sources.length, ...extra
});
function fixture(loc = 'US|California') {
  const mk = (p, n) => Array.from({ length: n }, (_, i) => story(`${p} story ${i + 1}: a headline long enough to wrap onto a second line in a narrow window`, i % 3 ? ['BBC', 'AP'] : ['Reuters-like', 'NPR', 'The Guardian'], i + 1, i === 4 ? { verified: false, sources: ['BBC'] } : {}));
  return { world: mk('World', 10), country: mk('Country', 10), state: mk('Local', 7), tech: mk('Tech', 10), fetchedAt: Date.now() - 20 * 6e4, loc };
}
const configured = (over = {}, data = fixture()) => ({ settings: { country: 'US', state: 'California', alerts: true, startup: false, configured: true, ...over }, seen: [], lastDaily: new Date().toDateString(), data });

function freshDir(state) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dnw-'));
  if (state !== undefined) fs.writeFileSync(path.join(d, 'state.json'), typeof state === 'string' ? state : JSON.stringify(state));
  return d;
}
const readState = d => JSON.parse(fs.readFileSync(path.join(d, 'state.json'), 'utf8'));
function killAll() { try { execFileSync('taskkill', ['/F', '/IM', path.basename(EXE), '/T'], { stdio: 'ignore' }); } catch {} }

async function launch(dir, { args = [], env = {} } = {}) {
  const app = await electron.launch({ executablePath: EXE, args: ['--user-data-dir=' + dir, ...args], env: { ...process.env, ...env }, timeout: 60000 });
  const errors = [];
  // Attach listeners the moment a window object exists, before the first window finishes loading.
  const attached = new WeakSet();
  const attach = pg => { if (attached.has(pg)) return; attached.add(pg); pg.on('pageerror', e => errors.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  app.on('window', attach);
  app.windows().forEach(attach); // a window may already exist by the time launch() resolves
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, errors };
}
// A REAL mouse click on the screen (not a browser-level one), so the operating system's own hit-testing is exercised:
// transparent windows, drag regions and layered windows can swallow real clicks that playwright's page.click never sees.
async function osClick(app, page, selector) {
  const r = await page.evaluate(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; }, selector);
  const pt = await app.evaluate(({ BrowserWindow, screen }, r) => {
    const w = BrowserWindow.getAllWindows()[0]; w.setAlwaysOnTop(true); w.show(); w.focus();
    const b = w.getContentBounds(); return screen.dipToScreenPoint({ x: b.x + r.x, y: b.y + r.y });
  }, r);
  await sleep(300);
  const ps = `Add-Type 'using System;using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint a,uint b,uint c,UIntPtr e);}'; [M]::SetCursorPos(${Math.round(pt.x)},${Math.round(pt.y)}) | Out-Null; Start-Sleep -Milliseconds 200; [M]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 80; [M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
  await sleep(500);
}

// Hide destroys the window, so the click can race its own teardown. Tolerate only that "closed" error,
// then assert the window really went away.
async function hideWidget(app, page) {
  await page.click('#x').catch(e => { if (!/has been closed|Target closed/i.test(String(e.message))) throw e; });
  await until(() => app.windows().length === 0, 'window to close after hide');
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
async function desktopShot(name) { // real screen capture incl. window chrome; best effort
  const f = path.join(OUT, name + '.png').replace(/'/g, "''");
  try { execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -A System.Windows.Forms,System.Drawing;$b=[Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object Drawing.Bitmap $b.Width,$b.Height;$g=[Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size);$bm.Save('${f}')`], { stdio: 'ignore', timeout: 30000 }); } catch {}
}
const visible = (page, sel) => page.locator(sel).evaluate(e => getComputedStyle(e).display !== 'none' && e.offsetParent !== null).catch(() => false);
// Walks the first-run setup with the dropdowns and buttons; Next on topics, Skip on Reddit. A country with regions also gets a region question.
const lookNext = page => page.click('#wb .pri >> text=Next'); // first setup screen: pick the look (dark is the default)
async function finishSetup(page, country, region) {
  await page.waitForSelector('#wiz', { state: 'visible' }); await lookNext(page);
  await page.selectOption('#wb select', { label: country }); await page.click('#wb .pri >> text=Next');
  if (/region/.test(await page.textContent('#wb h2'))) { if (region) await page.selectOption('#wb select', { label: region }); await page.click('#wb .pri >> text=Next'); }
  await page.click('#wb .pri >> text=Next'); // topics
  await page.click('#wb .sec >> text=Skip'); // Reddit
  await page.click('#wb .pri >> text=Show my news');
  await page.waitForSelector('#tabs', { state: 'visible' });
}
const cardOpen = page => page.evaluate(() => !document.getElementById('card').hidden); // #card is position:fixed, so `visible()` (offsetParent) can't see it
const cards = page => page.locator('#list .s').count();
const runKey = () => {
  try { return execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'], { encoding: 'utf8' }); } catch { return ''; }
};
const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_RE = /Daily News Widget|com\.local\.dailynews|daily-news-widget/i;
function clearRunEntries() { // the checkbox test must start from a known-empty state
  for (const line of runKey().split('\n')) if (RUN_RE.test(line)) { const name = line.trim().split(/\s{2,}/)[0]; try { execFileSync('reg', ['delete', RUN, '/v', name, '/f'], { stdio: 'ignore' }); } catch {} }
}
const hasRunEntry = () => RUN_RE.test(runKey());

async function scenario(name, fn) {
  const t0 = Date.now(); let err = null;
  try { killAll(); await until(() => procCount() === 0, 'previous app processes to exit'); await fn(); } catch (e) { err = e; }
  killAll();
  results.push({ name, ok: !err, ms: Date.now() - t0, error: err && String(err.message || err).split('\n').slice(0, 4).join(' | ') });
  console.log(`${err ? 'FAIL' : 'PASS'}  ${name}${err ? '\n      ' + results[results.length - 1].error : ''}`);
}

(async () => {
  // ---------------------------------------------------------------- first run & pickers
  await scenario('first run is a step-by-step setup with a progress bar, no console errors', async () => {
    const dir = freshDir(); const { app, page, errors } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#wiz', { state: 'visible', timeout: 10000 });
      assert(!(await visible(page, '#set')), 'full settings shown during first run');
      assert(!(await visible(page, '#tabs')), 'tabs visible during first run');
      assert.strictEqual(await page.getAttribute('#wb .opt >> text=Dark', 'aria-pressed'), 'true', 'dark is not the default look');
      assert(['17', '20'].includes(await page.getAttribute('#wp', 'aria-valuenow')), 'first step should already show progress');
      await shot(page, '01-first-run');
      await page.click('#wb .opt >> text=Light'); assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'light', 'picking Light did not apply right away');
      await page.click('#wb .opt >> text=Dark'); await lookNext(page);
      assert(await page.inputValue('#wb select'), 'country not pre-filled from locale');
      assert.strictEqual(await page.evaluate(() => document.activeElement.tagName), 'SELECT', 'country dropdown not focused');
      await page.keyboard.press('Escape'); // must not hide the widget before setup is finished
      assert(await visible(page, '#wiz'), 'Escape closed the setup');
      assert(!(await visible(page, '#gear')), 'gear should be hidden until setup is done');
      await page.selectOption('#wb select', { label: 'United States' }); await page.click('#wb .pri >> text=Next');
      assert.strictEqual(await page.textContent('#wb h2'), 'Which state or region?');
      await page.selectOption('#wb select', { label: 'California' }); await page.click('#wb .pri >> text=Next');
      assert.strictEqual(await page.textContent('#wb h2'), 'What do you want to see?');
      assert.strictEqual(await page.getAttribute('#wp', 'aria-valuenow'), '67');
      // The buttons stay pinned above the privacy line, and every chip can be scrolled into view.
      const fit = await page.evaluate(() => {
        const next = document.querySelector('#wb .pri').getBoundingClientRect(), body = document.querySelector('#wb .body'), chips = [...body.querySelectorAll('.chip')];
        body.scrollTop = body.scrollHeight; const last = chips[chips.length - 1].getBoundingClientRect(), box = body.getBoundingClientRect();
        return { nextOnScreen: next.top >= 0 && next.bottom <= document.querySelector('.wfoot').getBoundingClientRect().top, lastChipReachable: last.bottom <= box.bottom + 1 };
      });
      assert(fit.nextOnScreen, 'Next button is cut off or off screen on the topics step'); assert(fit.lastChipReachable, 'last topic chip cannot be scrolled into view');
      for (const c of await page.locator('#wb .chip').all()) await c.click(); // turn everything off
      await page.click('#wb .pri >> text=Next');
      assert(/at least one/i.test(await page.textContent('.werr')), 'setup let you continue with zero topics');
      for (const c of await page.locator('#wb .chip').all()) await c.click(); // all back on
      await page.click('#wb .chip >> text=Sports'); // turn one topic off
      await shot(page, '01b-first-run-topics');
      await page.click('#wb .pri >> text=Next');
      await page.click('#wb .back'); // Back keeps the choices
      assert.strictEqual(await page.getAttribute('#wb .chip >> text=Sports', 'aria-pressed'), 'false');
      await page.click('#wb .pri >> text=Next');
      assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), 'Skip', 'Reddit step must focus Skip, not opt-in');
      assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('aria-labelledby')), 'wq wf', 'focused control should announce the question');
      await page.click('#wb .pri >> text=Yes, add it');
      assert.strictEqual(await page.getAttribute('#wp', 'aria-valuenow'), '100');
      await shot(page, '01c-first-run-done');
      await page.click('#wb .pri >> text=Show my news');
      await page.waitForSelector('#tabs', { state: 'visible' });
      assert(!(await visible(page, '#wiz')), 'setup still open after finishing');
      const s = readState(dir).settings;
      assert.strictEqual(s.country, 'US'); assert.strictEqual(s.state, 'California'); assert.strictEqual(s.configured, true);
      assert.strictEqual(s.reddit, true); assert.deepStrictEqual(s.topics, T.IDS.filter(id => id !== 'sports'));
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
    } finally { await app.close(); }
  });

  await scenario('setup for a country without regions skips the region question; Skip leaves Reddit off', async () => {
    const dir = freshDir(); const { app, page } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#wiz', { state: 'visible' }); await lookNext(page);
      await page.selectOption('#wb select', { label: 'France' }); await page.click('#wb .pri >> text=Next');
      assert.strictEqual(await page.textContent('#wb h2'), 'What do you want to see?');
      assert.strictEqual(await page.getAttribute('#wp', 'aria-valuenow'), '60');
      await page.click('#wb .pri >> text=Next');
      await page.click('#wb .sec >> text=Skip');
      await page.click('#wb .pri >> text=Show my news'); await page.waitForSelector('#tabs', { state: 'visible' });
      const s = readState(dir).settings;
      assert.strictEqual(s.country, 'FR'); assert.strictEqual(s.reddit, false); assert.deepStrictEqual(s.topics, T.IDS);
      // Settings are still the full place to change things, and changing country clears the region.
      await page.click('#gear'); await page.fill('#c', 'Canada'); await page.dispatchEvent('#c', 'input');
      assert.strictEqual(await page.inputValue('#st'), '', 'state not cleared when country changed');
      await page.fill('#c', 'France'); await page.dispatchEvent('#c', 'input');
      assert(await page.locator('#st').isDisabled(), 'region box should be disabled for a country with no regions');
      await shot(page, '05-settings-no-regions');
    } finally { await app.close(); }
  });

  // ---------------------------------------------------------------- tabs, buttons, keyboard
  await scenario('every tab renders <=10 cards; buttons work (refresh, gear, hide)', async () => {
    const dir = freshDir(configured()); const { app, page, errors } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#list .s');
      for (const [k, shotName] of [['world', '02-world'], ['country', '03-country'], ['state', '04-local'], ['tech', '06-tech']]) {
        await page.click(`#tabs [data-tab=${k}]`);
        const n = await cards(page);
        assert(n >= 1 && n <= 10, `${k}: ${n} cards`);
        assert.strictEqual(await page.getAttribute(`#tabs [data-tab=${k}]`, 'aria-selected'), 'true');
        await shot(page, shotName);
      }
      await page.click('#rf'); await page.waitForFunction(() => !document.getElementById('rf').classList.contains('busy'), null, { timeout: 60000 });
      assert((await page.textContent('#ft')).length > 0, 'footer empty after refresh');
      await page.click('#gear'); assert(await visible(page, '#set')); assert.strictEqual(await page.getAttribute('#gear', 'aria-expanded'), 'true');
      await page.click('#gear'); assert(!(await visible(page, '#set')));
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
      await hideWidget(app, page);
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('keyboard: tab order reaches every control, Enter/Space on cards, Escape', async () => {
    const dir = freshDir(configured()); const { app, page } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#list .s');
      const seen = new Set();
      for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); seen.add(await page.evaluate(() => { const a = document.activeElement; return a.id || a.dataset.tab || (a.classList.contains('s') ? 'card' : a.tagName); })); }
      for (const id of ['rf', 'gear', 'x', 'world', 'country', 'state', 'tech', 'card']) assert(seen.has(id), 'tab key never reaches ' + id);
      const hasRing = await page.evaluate(() => { document.querySelector('#gear').focus(); const o = getComputedStyle(document.querySelector('#gear')).outlineStyle; return o !== 'none'; });
      assert(hasRing, 'no visible focus ring on gear (keyboard focus)');
      await page.focus('#gear'); await page.keyboard.press('Enter');
      assert(await visible(page, '#set'), 'Enter on gear did not open settings');
      await page.keyboard.press('Escape');
      assert(!(await visible(page, '#set')), 'Escape did not close settings');
      await page.keyboard.press('Escape').catch(() => {}); // window is destroyed by this key
      await until(() => app.windows().length === 0, 'Escape on main view to hide the widget');
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('story card: click opens details, Esc closes only the card and returns focus', async () => {
    const dir = freshDir(configured()); const { app, page, errors } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#list .s');
      await page.click('#list .s');
      assert(await cardOpen(page), 'card did not open');
      assert((await page.textContent('#ct')).includes('World story 1'), 'card shows the headline');
      assert((await page.locator('#co button').count()) >= 2, 'card lists every outlet');
      assert(await page.evaluate(() => document.activeElement.id === 'cg'), 'Go to source button gets focus');
      await shot(page, '14-story-card');
      await page.keyboard.press('Escape');
      assert(!(await cardOpen(page)), 'Escape did not close the card');
      assert(app.windows().length === 1, 'Escape on the card must not hide the widget');
      assert(await page.evaluate(() => document.activeElement.classList.contains('s')), 'focus returns to the story');
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
    } finally { await app.close().catch(() => {}); }
  });

  // ---------------------------------------------------------------- tray / single instance / startup
  await scenario('hide keeps app in tray; second launch re-shows window (single instance)', async () => {
    const dir = freshDir(configured()); const { app, page } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#list .s');
      await hideWidget(app, page);
      const alive = await app.evaluate(({ app }) => app.getName());
      assert(alive, 'main process died after hide (should live in tray)');
      const trayCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
      assert.strictEqual(trayCount, 0, 'renderer should be destroyed while in tray');
      spawn(EXE, ['--user-data-dir=' + dir, ...OFFLINE], { detached: true, stdio: 'ignore' }).unref();
      await until(() => app.windows().length === 1, 'second launch to bring the widget back', 30000);
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('--start-hidden (autostart mode): runs in tray with no window', async () => {
    const dir = freshDir(configured());
    spawn(EXE, ['--user-data-dir=' + dir, '--start-hidden', ...OFFLINE], { detached: true, stdio: 'ignore' }).unref();
    const name = path.basename(EXE, '.exe');
    const sample = () => { const [n, w] = execFileSync('powershell', ['-NoProfile', '-Command', `$p=Get-Process -Name '${name}' -ErrorAction SilentlyContinue; "$($p.Count) $(($p | Where-Object {$_.MainWindowHandle -ne 0}).Count)"`], { encoding: 'utf8' }).trim().split(' ').map(Number); return { n, w }; };
    await until(() => sample().n >= 1, 'app process to start with --start-hidden', 30000);
    // "no window ever appears" can only be observed over time: sample for 10 s after the process is up.
    for (let i = 0; i < 20; i++) { assert.strictEqual(sample().w, 0, 'a window was shown in --start-hidden mode'); await sleep(500); }
  });

  await scenario('Start-with-Windows checkbox adds/removes the Run registry entry', async () => {
    if (process.env.CI !== 'true') { console.log('      skipped: this test edits the real HKCU Run key (set CI=true to run it)'); return; }
    clearRunEntries();
    assert(!hasRunEntry(), 'could not clear the Run entry before the test:\n' + runKey()); // otherwise "adds" could pass vacuously
    const dir = freshDir(); const { app, page } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#wiz', { state: 'visible' });
      assert(!hasRunEntry(), 'app registered itself for startup before the user chose to');
      await finishSetup(page, 'United States'); // setup turns "start with Windows" on by default
      await until(() => hasRunEntry(), 'Run registry entry after finishing setup', 8000).catch(e => { throw new Error(e.message + '\n' + runKey()); });
      await page.click("#gear"); assert(await page.isChecked('#su'), 'settings form does not show the startup choice made in setup');
      await page.uncheck('#su'); await page.click('#save'); await page.waitForSelector('#tabs', { state: 'visible' });
      await until(() => !hasRunEntry(), 'Run registry entry to be removed after disabling startup', 8000).catch(e => { throw new Error(e.message + '\n' + runKey()); });
    } finally { await app.close().catch(() => {}); }
  });

  // ---------------------------------------------------------------- restart & corrupt settings
  await scenario('restart keeps settings, shows cached stories instantly, not first run', async () => {
    const dir = freshDir(); let r = await launch(dir, { args: OFFLINE });
    await finishSetup(r.page, 'Canada', 'Ontario');
    await r.page.click('#gear'); assert.strictEqual(await r.page.inputValue('#c'), 'Canada', 'settings form lost the setup answers'); // Save here must not undo them
    await r.page.uncheck('#al'); await r.page.click('#save'); await r.page.waitForSelector('#tabs', { state: 'visible' });
    await r.app.close(); killAll(); await until(() => procCount() === 0, 'app to exit before restart');
    const st = readState(dir); st.data = fixture('CA|Ontario'); fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(st));
    r = await launch(dir, { args: OFFLINE });
    try {
      await r.page.waitForSelector('#tabs', { state: 'visible' });
      assert(!(await visible(r.page, '#set')) && !(await visible(r.page, '#wiz')), 'first-run screen shown again after restart');
      await r.page.waitForSelector('#list .s', { timeout: 5000 });
      await r.page.click('#gear');
      assert.strictEqual(await r.page.inputValue('#c'), 'Canada'); assert.strictEqual(await r.page.inputValue('#st'), 'Ontario');
      assert.strictEqual(await r.page.isChecked('#al'), false, 'alerts setting lost');
    } finally { await r.app.close().catch(() => {}); }
  });

  for (const [label, content] of [
    ['garbage text', '{{{ not json'], ['empty file', ''], ['JSON null', 'null'], ['JSON array', '[]'],
    ['settings is a string', JSON.stringify({ settings: 'oops', data: 'oops' })],
    ['data has wrong shape', JSON.stringify({ settings: { country: 'US', configured: true }, data: { world: 'x', country: 5, state: null, tech: [{}] } })],
    ['unknown country in settings', JSON.stringify({ settings: { country: 'ZZ', state: 'Nowhere', configured: true }, data: null })]
  ]) {
    await scenario('corrupt state.json (' + label + ') -> app still starts', async () => {
      const dir = freshDir(content); const { app, page, errors } = await launch(dir, { args: OFFLINE });
      try {
        await page.waitForSelector('#gear', { state: 'attached', timeout: 15000 });
        await page.waitForFunction(() => !/Loading/.test((document.getElementById('ft') || {}).textContent || 'Loading') || document.querySelectorAll('#list .s').length > 0, null, { timeout: 60000 }); // first refresh settled
        // the UI must actually respond: gear toggles settings, then each tab (when visible) switches
        if (await visible(page, '#wiz')) { // never configured: the setup must respond (the gear is hidden until it is done)
          await lookNext(page); await page.selectOption('#wb select', { label: 'France' }); await page.click('#wb .pri >> text=Next');
          assert.strictEqual(await page.textContent('#wb h2'), 'What do you want to see?', 'setup did not move on');
        } else {
          const before = await page.getAttribute('#gear', 'aria-expanded');
          await page.click('#gear');
          assert.notStrictEqual(await page.getAttribute('#gear', 'aria-expanded'), before, 'gear click did nothing');
          await page.click('#gear');
        }
        if (await visible(page, '#tabs')) for (const k of ['country', 'state', 'tech', 'world']) { await page.click(`#tabs [data-tab=${k}]`); assert.strictEqual(await page.getAttribute(`#tabs [data-tab=${k}]`, 'aria-selected'), 'true', 'tab ' + k + ' did not select'); }
        assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
        await shot(page, '08-corrupt-' + label.replace(/\W+/g, '-'));
      } finally { await app.close().catch(() => {}); }
    });
  }

  // ---------------------------------------------------------------- no network
  await scenario('no network, nothing cached: friendly message, no crash, refresh recovers state', async () => {
    const dir = freshDir(configured({}, null)); const { app, page, errors } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForFunction(() => /offline|can.t reach/i.test(document.body.innerText), null, { timeout: 90000 });
      await shot(page, '09-offline-empty');
      for (const [k, name] of [['world', 'World'], ['tech', 'AI & Tech']]) { // every tab says which tab it is, so switching visibly changes the page
        await page.click(`#tabs [data-tab=${k}]`);
        assert.strictEqual(await page.textContent('#title'), name);
        assert(new RegExp('^' + name.replace('&', '&') + ': can.t reach', 'i').test(await page.textContent('#list .empty b')), 'offline box does not name the ' + name + ' tab');
      }
      await page.click('#rf'); await page.waitForFunction(() => !document.getElementById('rf').classList.contains('busy'), null, { timeout: 90000 });
      assert(/offline/i.test(await page.textContent('#ft')), 'footer should say Offline');
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('no network with cached stories: stories stay, footer says offline', async () => {
    const dir = freshDir(configured()); const { app, page } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForFunction(() => /offline/i.test((document.getElementById('ft') || {}).textContent || ''), null, { timeout: 90000 });
      assert(await cards(page) > 0, 'cached stories vanished while offline');
      await shot(page, '10-offline-cached');
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('live network: real feeds load (informational for content, strict for no crash)', async () => {
    const dir = freshDir(configured({ configured: false }, null)); const { app, page, errors } = await launch(dir);
    try {
      await finishSetup(page, 'United States', 'California');
      try {
        await page.waitForFunction(() => document.querySelectorAll('#list .s').length > 0 || !/Loading/.test((document.getElementById('ft') || {}).textContent || 'Loading'), null, { timeout: 90000 });
      } catch (e) { await shot(page, '11-live-timeout'); console.log('      page text at timeout: ' + (await page.evaluate(() => document.body.innerText).catch(() => '?')).replace(/\s+/g, ' ').slice(0, 300)); throw e; }
      console.log('      footer: ' + (await page.textContent('#ft')));
      const counts = {};
      for (const k of ['world', 'country', 'state', 'tech']) { await page.click(`#tabs [data-tab=${k}]`); counts[k] = await cards(page); assert(counts[k] <= 10, k + ' has >10'); }
      console.log('      live card counts', JSON.stringify(counts));
      await page.click('#tabs [data-tab=world]'); await shot(page, '11-live-world');
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('real mouse clicks reach the rail, Settings and the Look buttons', async () => {
    const dir = freshDir(configured()); const { app, page, errors } = await launch(dir, { args: OFFLINE });
    const seen = {};
    try {
      await page.waitForSelector('#list .s');
      await osClick(app, page, '#tabs [data-tab=tech]'); seen.tab = await page.getAttribute('#tabs [data-tab=tech]', 'aria-selected');
      await osClick(app, page, '#gear'); seen.settings = await page.getAttribute('#gear', 'aria-expanded');
      await osClick(app, page, '#th button[data-v=light]'); seen.light = await page.getAttribute('html', 'data-theme');
      await desktopShot('14-real-clicks');
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
      assert.deepStrictEqual(seen, { tab: 'true', settings: 'true', light: 'light' }, 'real clicks did not work: ' + JSON.stringify(seen));
    } finally { await app.close().catch(() => {}); }
  });

  await scenario('look: Light/Dark and blur apply at once and are saved', async () => {
    const dir = freshDir(configured()); const { app, page, errors } = await launch(dir, { args: OFFLINE });
    try {
      await page.waitForSelector('#list .s');
      assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'dark', 'dark is the default look');
      await page.click('#gear');
      await page.click('#th button >> text=Light'); assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'light');
      assert.strictEqual(await page.getAttribute('html', 'data-text'), 'dark', 'Light look uses dark letters');
      assert(await page.isDisabled('#tc button >> text=Dark'), 'Light/Dark letters need a picture, so they are disabled without one');
      await page.fill('#blur', '10'); await page.dispatchEvent('#blur', 'change');
      await until(() => { const s = readState(dir).settings; return s.theme === 'light' && s.blur === 10; }, 'look saved to state.json');
      assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
    } finally { await app.close().catch(() => {}); }
  });

  // ---------------------------------------------------------------- DPI / size
  for (const scale of [1, 1.25, 1.5, 2, 3]) {
    await scenario(`DPI scale ${scale}: nothing overflows the fixed-size widget`, async () => {
      const dir = freshDir(configured()); const { app, page } = await launch(dir, { args: ['--force-device-scale-factor=' + scale, ...OFFLINE] });
      try {
        await page.waitForSelector('#list .s');
        assert.strictEqual(await page.evaluate(() => devicePixelRatio), scale);
        await shot(page, `12-dpi-${scale}`);
        const bad = await page.evaluate(() => ({ h: document.documentElement.scrollWidth > innerWidth, els: [...document.querySelectorAll('.rail *, header *, .s, footer *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName + '.' + e.className).slice(0, 5) }));
        assert(!bad.h && !bad.els.length, 'overflow: ' + JSON.stringify(bad));
        await page.click('#gear'); await shot(page, `12-dpi-${scale}-settings`);
        const sb = await page.evaluate(() => { const r = document.getElementById('save').getBoundingClientRect(); return r.bottom <= innerHeight + 1 || document.getElementById('set').scrollHeight > document.getElementById('set').clientHeight; });
        assert(sb, 'Save button unreachable');
      } finally { await app.close().catch(() => {}); }
    });
  }

  // real-desktop screenshot (a real capture shows the transparent rounded window)
  await scenario('desktop capture of the widget window', async () => {
    const dir = freshDir(configured()); const { app, page } = await launch(dir, { args: OFFLINE });
    try { await page.waitForSelector('#list .s'); await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running')); await desktopShot('13-desktop'); } finally { await app.close().catch(() => {}); }
  });

  // ---------------------------------------------------------------- report
  killAll();
  const failed = results.filter(r => !r.ok);
  const md = ['| result | scenario | detail |', '|---|---|---|', ...results.map(r => `| ${r.ok ? 'PASS' : '**FAIL**'} | ${r.name} | ${r.error || ''} |`)].join('\n');
  fs.writeFileSync(path.join(OUT, 'results.md'), md + '\n');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## E2E on packaged app\n' + md + '\n');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(2); });
