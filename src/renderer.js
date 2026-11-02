// Rail tabs. To add a tab: add a line here, an icon in ICON, and a list with the same key in the data.
const NEWS_TABS = [['world', 'World'], ['country', 'Country'], ['state', 'Local'], ['tech', 'AI & Tech']];
const ICON = { // 24x24 line icons
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  country: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  state: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  tech: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  reddit: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  location: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const icon = k => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>'; // constants above only, never story text
const tabs = () => (settings.reddit ? [...NEWS_TABS, ['reddit', 'Reddit']] : NEWS_TABS); // Reddit gets its own tab only when the bonus is on
const NAMES = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return Object.fromEntries(GEO.CODES.map(c => [c, d.of(c)])); } catch { return Object.fromEntries(GEO.CODES.map(c => [c, c])); } })();
const codeOf = n => { n = n.trim().toLowerCase(); return GEO.CODES.find(c => NAMES[c].toLowerCase() === n || c.toLowerCase() === n); };
let retryFocus = false, cur = 'world', data = null, settings = {}, shownKey = '';
const $ = id => document.getElementById(id);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

function ago(ts) {
  if (!ts) return '';
  const m = Math.max(0, Math.round((Date.now() - ts) / 6e4));
  return m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
}

const iconButton = (cls, key, label, onclick) => { const b = el('button', cls); b.innerHTML = icon(key); b.title = label; b.setAttribute('aria-label', label); b.onclick = onclick; return b; };
function buildTabs() {
  const nav = $('tabs'); nav.textContent = '';
  for (const [k, label] of tabs()) {
    const b = iconButton('tab', k, label, () => { cur = k; if (settingsOpen()) showSettings(false); else render(); }); b.dataset.tab = k; b.setAttribute('role', 'tab');
    b.onkeydown = e => { const list = tabs(), i = list.findIndex(t => t[0] === cur), n = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : null; if (n === null) return; e.preventDefault(); cur = list[(n + list.length) % list.length][0]; render(); $('tabs').querySelector('.on').focus(); };
    nav.appendChild(b);
  }
}

const tabName = () => (tabs().find(t => t[0] === cur) || tabs()[0])[1]; // so an empty tab says which tab it is
function render() {
  if ($('tabs').children.length !== tabs().length) { if (!tabs().some(t => t[0] === cur)) cur = 'world'; buildTabs(); }
  for (const b of $('tabs').children) {
    const on = b.dataset.tab === cur && !settingsOpen(); // while Settings is open, only its button is lit
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
  }
  if (!document.body.classList.contains('setup')) $('title').textContent = settingsOpen() ? 'Settings' : tabName();
  const items = data && data[cur];
  // Re-render the list only when it changed, so focus and entrance animations aren't reset.
  const key = cur + '|' + settings.state + '|' + (data ? JSON.stringify((items || []).map(s => s.links && s.links[0])) + (data.error || '') + (cur === 'reddit' ? JSON.stringify(redditPosts().map(p => p.id)) + JSON.stringify(data.redditStatus) : '') + (settings.topics || []).join() : 'null');
  if (key !== shownKey) {
    shownKey = key;
    const list = $('list'); list.textContent = ''; if (items && items.length) retryFocus = false;
    if (cur === 'reddit' && data) renderReddit(list);
    else if (!items || !items.length) {
      if (!data) { list.appendChild(el('p', 'hint', 'Loading ' + tabName() + '…')); for (let k = 0; k < 5; k++) list.appendChild(el('div', 'sk')); }
      else {
        const noReg = cur === 'state' && !GEO.hasRegions(settings.country), noState = cur === 'state' && !settings.state;
        const [icon, head, sub] = data.error ? ['📡', tabName() + ": can't reach the news sources", 'Check your connection. Your last update stays here when it is available.']
          : noReg ? ['📍', 'No local news for ' + (NAMES[settings.country] || 'your country') + ' yet', 'Regional news is not available for this country.']
          : noState ? ['📍', 'Pick your region', 'Open Settings to choose a state or region for local news.']
          : !(settings.topics || []).length ? ['☑', 'No topics picked', 'Open Settings and tick the topics you want to see.']
          : cur === 'country' ? ['✓', 'No trusted stories about ' + (NAMES[settings.country] || 'your country') + ' right now', 'Only stories from trusted outlets are shown, so quiet news days can leave this empty. Try again later, or pick more topics in Settings.']
          : cur === 'tech' ? ['✓', 'No trusted tech stories right now', 'Stories show once a trusted tech outlet covers them. Try again later, or pick more topics in Settings.']
          : cur === 'state' ? ['✓', 'No trusted local stories on your topics right now', 'Local news is quieter. Try again later, or pick more topics in Settings.']
          : ['✓', 'No verified stories on your topics right now', 'World shows a story only once 2+ independent outlets cover it. The other tabs also show single-outlet stories, labelled.'];
        const box = el('div', 'empty'); const ic = el('div', 'ic', icon); ic.setAttribute('aria-hidden', 'true'); box.appendChild(ic); box.appendChild(el('b', '', head)); box.appendChild(el('span', '', sub));
        if (data.error) { const r = el('button', 'sec', 'Try again'); r.onclick = () => { retryFocus = true; $('rf').click(); }; box.appendChild(r); if (retryFocus) r.focus(); }
        list.appendChild(box);
      }
    } else items.forEach((s, i) => {
      const d = el('div', 's g'); d.tabIndex = 0; d.dataset.link = s.link; d.setAttribute('role', 'button'); d.style.animationDelay = (i * 35) + 'ms';
      d.appendChild(el('h3', '', s.title));
      if (s.summary) d.appendChild(el('p', '', s.summary));
      const m = el('div', 'm');
      s.sources.slice(0, 3).forEach(n => m.appendChild(el('span', 'pill', n)));
      m.appendChild(el('span', '', ago(s.ts)));
      if (!s.verified) m.appendChild(el('span', 'tag', 'single trusted source'));
      d.appendChild(m);
      d.onclick = () => showCard(s);
      d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showCard(s); } };
      list.appendChild(d);
    });
  }
  setFooter();
}

// Story card: built only from what the feeds gave us. No article is fetched until the reader presses Go to source.
let cardLink = '';
const behindCard = ['.rail', 'header', 'main', 'footer'];
function showCard(s) {
  cardLink = s.link;
  $('ct').textContent = s.title;
  const m = $('cm'); m.textContent = '';
  const t = s.firstTs || s.ts;
  if (s.label) m.appendChild(el('span', '', s.label));
  else if (t) m.appendChild(el('span', '', 'First reported ' + new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + ago(t)));
  if (!s.verified && !s.label) m.appendChild(el('span', 'tag', 'single trusted source')); // community cards carry their own label
  $('cg').textContent = s.goLabel || 'Go to source ↗';
  $('cs').textContent = s.detail || s.summary || 'The news feed gave only a headline for this story. Use Go to source for the full article.';
  const outlets = $('co'); outlets.textContent = '';
  for (const a of s.articles || []) { const li = el('li'), b = el('button', '', a.outlet + ' ↗'); b.title = 'Open the ' + a.outlet + ' article'; b.onclick = () => api.open(a.link); li.appendChild(b); outlets.appendChild(li); }
  $('cbl').hidden = outlets.hidden = !outlets.children.length;
  $('cg').onclick = () => api.open(s.link);
  $('card').hidden = false;
  behindCard.forEach(t => { document.querySelector(t).inert = true; }); // keep Tab and clicks inside the card
  $('cg').focus();
}
function closeCard() {
  $('card').hidden = true;
  behindCard.forEach(t => { document.querySelector(t).inert = false; });
  const rows = [...$('list').querySelectorAll('.s')]; // the list may have been redrawn while the card was open
  (rows.find(r => r.dataset.link === cardLink) || rows[0] || $('rf')).focus();
}
$('cc').onclick = closeCard;
$('card').onclick = e => { if (e.target === $('card')) closeCard(); };
$('card').onkeydown = e => { // keep Tab inside the open card
  if (e.key !== 'Tab') return;
  const f = [...$('card').querySelectorAll('button')].filter(b => !b.closest('[hidden]')), first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};


// Reddit tab: community posts + an excerpt of the top comment. Opinion, not verified news, and never mixed with the news tabs.
const redditPosts = () => ((data && data.reddit) || []).filter(p => TOPICS.wanted(p.title + ' ' + (p.text || ''), settings.topics)); // topic choices cover the text preview too
const clock = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function emptyBox(list, icon, head, sub) {
  const box = el('div', 'empty'), ic = el('div', 'ic', icon); ic.setAttribute('aria-hidden', 'true');
  box.appendChild(ic); box.appendChild(el('b', '', head)); box.appendChild(el('span', '', sub)); list.appendChild(box);
}
function renderReddit(list) {
  const posts = redditPosts(), why = data.redditStatus || {};
  const retry = why.retryAt ? ' Next try around ' + clock(why.retryAt) + '.' : '';
  const h = el('div', 'rh'), top = el('div', 'rhead'); top.appendChild(el('b', '', 'Community discussion · Reddit'));
  top.appendChild(iconButton('ib', 'settings', 'Choose Reddit communities', () => { showSettings(true, 'rnew'); $('rnew').scrollIntoView({ block: 'center' }); }));
  h.appendChild(top); list.appendChild(h);
  if (!posts.length) {
    if ((data.reddit || []).length) emptyBox(list, '☑', 'No Reddit posts match your topics', 'Open Settings to pick more topics.');
    else if (why.error) emptyBox(list, '📡', "Couldn't reach Reddit", why.error + '.' + retry);
    else emptyBox(list, '⏳', 'Loading Reddit posts…', 'The first load takes a few seconds.');
    return;
  }
  h.appendChild(el('span', '', why.error ? 'Showing older posts. Last try failed: ' + why.error + '.' + retry : 'Community discussion. Opinion, not verified news.'));
  posts.forEach((p, i) => {
    const d = el('div', 's g rd'); d.tabIndex = 0; d.dataset.link = p.link; d.setAttribute('role', 'button'); d.style.animationDelay = (i * 35) + 'ms';
    d.appendChild(el('h3', '', p.title));
    const m = el('div', 'm');
    m.appendChild(el('span', 'pill rp', 'r/' + p.sub));
    m.appendChild(el('span', '', ago(p.ts)));
    d.appendChild(m);
    const base = p.text || 'Link or image post: open it to see the content.';
    const card = { title: p.title, link: p.link, ts: p.ts, label: 'r/' + p.sub + ' · ' + ago(p.ts) + ' · opinion, not verified news', detail: base + '\n\nLoading the top comment…', goLabel: 'Go to post ↗' };
    const open = () => { showCard(card); api.redditComment(p.link).then(t => { if (cardLink === p.link && !$('card').hidden) $('cs').textContent = base + '\n\n' + (t ? 'Top comment: “' + t + '”' : t === null ? 'Try again in a few seconds.' : 'No top comment available right now.'); }).catch(() => {}); }; // fetched only now, when the reader opens the post
    d.onclick = open;
    d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    list.appendChild(d);
  });
}

function setFooter() {
  $('ft').textContent = data && data.fetchedAt ? (data.error ? 'Offline — showing last update' : 'Updated ' + ago(data.fetchedAt)) : data && data.error ? 'Offline' : 'Loading…';
  $('fw').className = data && data.error ? 'off' : '';
}

function buildTopics() {
  const tl = $('tl');
  for (const t of TOPICS.TOPICS) {
    const l = document.createElement('label'), c = document.createElement('input');
    c.type = 'checkbox'; c.value = t.id; l.appendChild(c); l.appendChild(document.createTextNode(t.label)); tl.appendChild(l);
  }
}
const pickedTopics = () => [...document.querySelectorAll('#tl input:checked')].map(i => i.value);
function fillLists() {
  const cl = $('cl'); if (!cl.children.length) GEO.CODES.slice().sort((a, b) => NAMES[a].localeCompare(NAMES[b])).forEach(c => { const o = document.createElement('option'); o.value = NAMES[c]; cl.appendChild(o); });
  const c = codeOf($('c').value), rl = $('rl'); rl.textContent = '';
  const regs = (c && GEO.REGIONS[c]) || [];
  regs.forEach(x => { const o = document.createElement('option'); o.value = x; rl.appendChild(o); });
  $('st').disabled = !regs.length;
  $('st').placeholder = !c ? 'Pick a country first' : regs.length ? 'Type to search…' : 'Not available for this country';
  if (!regs.length) $('st').value = '';
}
let lastCode = '';
$('c').addEventListener('input', () => { const c = codeOf($('c').value) || ''; if (c !== lastCode) { $('st').value = ''; lastCode = c; } fillLists(); });

const settingsOpen = () => $('set').style.display === 'flex';
function showSettings(open, focus = 'bgpick') {
  $('set').style.display = open ? 'flex' : 'none';
  $('list').style.display = open ? 'none' : '';
  $('rf').style.display = open ? 'none' : '';
  $('gear').setAttribute('aria-expanded', open); $('gear').classList.toggle('on', open);
  render();
  if (open) { $('err').textContent = ''; fillLists(); $(focus).focus(); }
}

// Look: dark or light glass, text color, blur and a background picture. Saved on this PC only; applied right away.
const TEXT_CHOICES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], THEME_CHOICES = [['dark', 'Dark'], ['light', 'Light']];
const PICTURE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/; // what the main process hands over
function applyLook() {
  const root = document.documentElement, app = $('app'), light = settings.theme === 'light', pic = PICTURE.test(settings.bgUrl || '') ? settings.bgUrl : '';
  const picked = settings.textColor || 'auto', text = picked !== 'auto' && pic ? picked : pic ? (settings.bg === 'light' ? 'dark' : 'light') : light ? 'dark' : 'light'; // Auto: contrast with what is behind. Without a picture the look decides, so letters can't vanish into the glass
  root.dataset.theme = light ? 'light' : 'dark'; root.dataset.text = text;
  root.style.setProperty('--blur', (typeof settings.blur === 'number' ? settings.blur : 24) + 'px');
  app.classList.toggle('img', !!pic);
  app.style.setProperty('--img', pic ? 'url("' + pic + '")' : 'none');
  $('thumb').style.backgroundImage = pic ? 'url("' + pic + '")' : '';
  $('bgclear').hidden = !pic;
  $('blur').value = settings.blur ?? 24;
  for (const [id, now] of [['tc', pic ? picked : 'auto'], ['th', light ? 'light' : 'dark']]) for (const b of $(id).children) b.setAttribute('aria-pressed', b.dataset.v === now);
  for (const b of $('tc').children) b.disabled = !pic && b.dataset.v !== 'auto'; // letters follow the look until there is a picture
  $('tchint').textContent = pic ? 'Auto picks letters to suit the picture.' : 'Light and Dark letters are for a background picture. Add one above to use them.';
}
async function changeLook(patch) {
  settings = { ...settings, ...patch }; applyLook();
  try { settings = { ...settings, ...(await api.setLook(patch)) }; applyLook(); } catch {}
}
function segment(id, choices, key) {
  for (const [v, label] of choices) { const b = el('button', '', label); b.dataset.v = v; b.onclick = () => changeLook({ [key]: v }); $(id).appendChild(b); }
}
segment('tc', TEXT_CHOICES, 'textColor'); segment('th', THEME_CHOICES, 'theme');
$('blur').oninput = () => { settings.blur = +$('blur').value; applyLook(); };
$('blur').onchange = () => changeLook({ blur: +$('blur').value });
$('bgpick').onclick = async () => {
  const msg = t => { $('bgmsg').textContent = t; };
  msg('Choosing…');
  try {
    const r = await api.pickBackground();
    if (r.settings) { settings = r.settings; applyLook(); msg('Background set.'); } else msg(r.error || 'JPG or PNG. Stays on your PC.');
  } catch { msg("Couldn't use that image."); }
};
$('bgclear').onclick = async () => { settings = await api.clearBackground(); applyLook(); $('bgmsg').textContent = 'Background removed.'; };

api.onData(d => { data = d; $('rf').classList.remove('busy'); render(); });
// Reddit communities: edited here, applied when Settings is saved.
let rsubs = [], rdefaults = [];
const rmsg = t => { $('rmsg').textContent = t; };
function drawChips() {
  const box = $('rchips'); box.textContent = '';
  rsubs.forEach(name => {
    const chip = el('span', 'pill', 'r/' + name), x = el('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove r/' + name);
    x.onclick = () => { rsubs = rsubs.filter(n => n !== name); drawChips(); rmsg('Press Save to apply.'); $('rnew').focus(); };
    chip.appendChild(x); box.appendChild(chip);
  });
}
let rchecking = false, rmax = 10;
async function addSub() {
  if (rchecking) return;
  const name = $('rnew').value.trim().replace(/^\/?r\//i, '');
  if (!name) return rmsg('Type the name of a community.');
  if (rsubs.some(n => n.toLowerCase() === name.toLowerCase())) return rmsg('That community is already in the list.');
  if (rsubs.length >= rmax) return rmsg('You can follow up to ' + rmax + ' communities.');
  rmsg('Checking…'); rchecking = true; $('radd').disabled = true;
  let r; try { r = await api.redditCheckSub(name); } catch { r = { ok: null }; }
  rchecking = false; $('radd').disabled = false;
  if (r.ok === false) return rmsg(r.reason);
  if (r.wait) return rmsg('Try again in a moment.');
  rsubs.push(r.ok ? r.name : name); $('rnew').value = ''; drawChips();
  rmsg(r.ok ? 'Added. Press Save to apply.' : "Added without checking, because Reddit couldn't be asked just now. Press Save to apply.");
}
$('radd').onclick = addSub;
$('rnew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } };
$('rreset').onclick = () => { rsubs = rdefaults.slice(); drawChips(); rmsg('Press Save to apply.'); };

// Fill the Settings form from saved settings.
function fillForm(s) {
  $('c').value = NAMES[s.country] || ''; $('st').value = s.state; lastCode = s.country;
  document.querySelectorAll('#tl input').forEach(i => { i.checked = (s.topics || []).includes(i.value); });
  fillLists(); $('al').checked = s.alerts; $('su').checked = s.startup; $('rd').checked = s.reddit === true;
  if (s.redditDefaults) rdefaults = s.redditDefaults;
  if (s.redditMax) rmax = s.redditMax;
  rsubs = (s.redditSubs || []).slice(); drawChips();
}
function setupDone(s) {
  settings = s; fillForm(s); showSettings(false); shownKey = ''; render();
  const tab = $('tabs').querySelector('.on'); if (tab) tab.focus(); // the focused button just disappeared
}
api.onSettings(s => { settings = s; applyLook(); fillForm(s); if (!s.configured) Setup.start(s, setupDone); render(); });
$('rf').onclick = async () => {
  const b = $('rf'); if (b.classList.contains('busy')) return;
  b.classList.add('busy'); $('ft').textContent = 'Refreshing…';
  try { await api.refresh(); } catch {}
  b.classList.remove('busy'); setFooter();
};
$('x').onclick = () => api.hide();
$('rf').innerHTML = icon('refresh'); $('x').innerHTML = icon('close');
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!settings.configured) return; if (!$('card').hidden) return closeCard(); if (settingsOpen()) showSettings(false); else api.hide(); } });
$('save').onclick = async () => {
  const code = codeOf($('c').value);
  if (!code) { $('err').textContent = 'Pick a country from the list.'; return; }
  const typed = $('st').value.trim().toLowerCase();
  const reg = typed ? ((GEO.REGIONS[code] || []).find(x => x.toLowerCase() === typed) || '') : '';
  if (typed && !reg) { $('err').textContent = 'Pick a region from the list, or clear it.'; return; }
  $('err').textContent = '';
  const b = $('save'); b.disabled = true; b.textContent = 'Saving…';
  let ok = true;
  try { settings = await api.setSettings({ country: code, state: reg, alerts: $('al').checked, startup: $('su').checked, reddit: $('rd').checked, redditSubs: rsubs, topics: pickedTopics() }); } catch { ok = false; }
  b.disabled = false; b.textContent = 'Save';
  if (!ok) { $('err').textContent = 'Could not save. Try again.'; return; }
  rsubs = (settings.redditSubs || []).slice(); drawChips(); rmsg('');
  showSettings(false); shownKey = ''; render();
};
buildTabs();
$('dock').append(iconButton('tab', 'location', 'Location', () => { showSettings(true, 'c'); $('c').scrollIntoView({ block: 'center' }); }), iconButton('tab', 'settings', 'Settings', () => showSettings(!settingsOpen())));
$('dock').lastChild.id = 'gear'; $('dock').firstChild.id = 'loc';
buildTopics();
render();
let noticeT;
api.onNotice(msg => { $('ft').textContent = msg; $('fw').className = 'off'; clearTimeout(noticeT); noticeT = setTimeout(setFooter, 4000); });
