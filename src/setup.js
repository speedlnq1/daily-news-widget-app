// First-run setup: one question per screen, a progress bar on top, big buttons.
// Loaded after renderer.js and uses its helpers ($, el, NAMES).
const Setup = (() => {
  const PRIVACY = 'https://github.com/speedlnq1/daily-news-widget-app/blob/main/PRIVACY.md';
  let pick, at, onDone;
  const steps = () => SetupSteps.steps(GEO.hasRegions(pick.country));

  function button(label, cls, onclick) { const b = el('button', cls, label); b.onclick = onclick; return b; }
  function go(to) { at = to; show(); }
  function dropdown(label, choices, value) {
    const select = el('select'); select.setAttribute('aria-label', label);
    for (const [v, text] of choices) { const o = el('option', '', text); o.value = v; select.appendChild(o); }
    select.value = value; return select;
  }
  // Fills the box: a scrollable body (optional top part, question, help text, optional middle part) and the buttons pinned below it.
  // Returns the control to focus (the middle part unless told otherwise).
  function screen(box, { top, title, help, middle, buttons, focus }) {
    const head = el('div', 'head'), acts = el('div', 'btns');
    head.append(el('h2', '', title), el('p', 'hint', help)); acts.append(...buttons);
    const body = el('div', 'body'); // scrolls in a small window; the buttons below it never move
    body.append(...[top, head, middle].filter(Boolean)); box.append(body, acts);
    return focus || middle || buttons[0];
  }

  // Each view returns the control to focus.
  const views = {
    look(box) { // applies right away, so the user sees the choice
      const opts = el('div', 'opts'), now = () => settings.theme === 'light' ? 'light' : 'dark';
      for (const [v, label] of [['dark', 'Dark'], ['light', 'Light']]) {
        const o = button(label, 'opt', () => { changeLook({ theme: v }); opts.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed', x === o)); });
        const swatch = el('i'); swatch.style.background = v === 'dark' ? '#050505' : '#e9edf2'; o.prepend(swatch);
        o.setAttribute('aria-pressed', now() === v); opts.appendChild(o);
      }
      return screen(box, { title: 'Pick your look', help: 'Black glass or white glass. You can change it later in Settings.', middle: opts, buttons: [button('Next', 'pri', () => go(at + 1))], focus: opts.querySelector('[aria-pressed=true]') });
    },
    country(box) {
      const countries = GEO.CODES.slice().sort((a, b) => NAMES[a].localeCompare(NAMES[b])).map(c => [c, NAMES[c]]);
      const select = dropdown('Country', countries, pick.country);
      return screen(box, { title: 'Where do you live?', help: 'This sets your Country news.', middle: select, buttons: [button('Next', 'pri', () => {
        if (select.value !== pick.country) pick.state = '';
        pick.country = select.value; go(at + 1);
      })] });
    },
    region(box) {
      const select = dropdown('State or region', [['', 'Choose one…'], ...GEO.REGIONS[pick.country].map(r => [r, r])], pick.state);
      return screen(box, { title: 'Which state or region?', help: 'This sets your Local news.', middle: select, buttons: [
        button('Next', 'pri', () => { pick.state = select.value; go(at + 1); }), button('Skip', 'sec', () => { pick.state = ''; go(at + 1); })] });
    },
    topics(box) {
      const chips = el('div', 'chips'), err = el('p', 'werr'); err.setAttribute('role', 'alert');
      TOPICS.TOPICS.forEach(t => {
        const c = button(t.label, 'chip', () => {
          pick.topics = pick.topics.includes(t.id) ? pick.topics.filter(x => x !== t.id) : [...pick.topics, t.id];
          c.setAttribute('aria-pressed', pick.topics.includes(t.id)); err.textContent = '';
        });
        c.setAttribute('aria-pressed', pick.topics.includes(t.id)); chips.appendChild(c);
      });
      const next = button('Next', 'pri', () => { if (pick.topics.length) go(at + 1); else err.textContent = 'Pick at least one topic.'; });
      return screen(box, { title: 'What do you want to see?', help: 'Tap to turn a topic off.', middle: chips, buttons: [err, next], focus: next });
    },
    reddit(box) {
      const skip = button('Skip', 'sec', () => { pick.reddit = false; go(at + 1); }); // focused, so a held Enter can't opt in
      return screen(box, { title: 'Add Reddit AI chatter?', help: 'Posts from AI and coding communities in their own Reddit tab. Not verified news. Reddit sees your IP.',
        buttons: [button('Yes, add it', 'pri', () => { pick.reddit = true; go(at + 1); }), skip], focus: skip });
    },
    done(box) {
      const check = el('div', 'check', '✓'); check.setAttribute('aria-hidden', 'true');
      const err = el('p', 'werr'); err.setAttribute('role', 'alert');
      const fin = button('Show my news', 'pri', async () => {
        fin.disabled = true; fin.textContent = 'Saving…'; err.textContent = '';
        try {
          const s = await api.setSettings({ country: pick.country, state: pick.state, alerts: pick.alerts, startup: pick.startup, reddit: pick.reddit, topics: pick.topics });
          $('wiz').style.display = 'none'; document.body.classList.remove('setup'); onDone(s);
        } catch { fin.disabled = false; fin.textContent = 'Show my news'; err.textContent = 'Could not save. Try again.'; }
      });
      return screen(box, { top: check, title: "You're all set!", help: (pick.alerts && pick.startup ? 'Breaking alerts and start with Windows are on. ' : '') + 'Change anything later in Settings.', buttons: [err, fin], focus: fin });
    }
  };

  function show() {
    const list = steps(), pct = SetupSteps.percent(at, list.length), box = $('wb');
    $('wp').setAttribute('aria-valuenow', pct); $('wp').firstChild.style.width = pct + '%'; $('wpt').textContent = pct + '% done';
    box.textContent = '';
    const nav = el('div', 'nav'); // fixed height so the question stays in the same place; empty on the first and last step
    if (at > 0 && list[at] !== 'done') { const back = button('← Back', 'back', () => go(at - 1)); back.setAttribute('aria-label', 'Back'); nav.appendChild(back); }
    box.appendChild(nav);
    const ctl = views[list[at]](box);
    // Announce the question when focus lands on the control.
    box.querySelector('h2').id = 'wq'; box.querySelector('.hint').id = 'wh';
    ctl.setAttribute('aria-labelledby', ctl.tagName === 'SELECT' ? 'wq' : 'wq wf'); ctl.id = 'wf'; ctl.setAttribute('aria-describedby', 'wh');
    ctl.focus(); // keep the progress bar in view
  }

  // s: current settings (country is guessed from the system language). done(newSettings) runs after saving.
  function start(s, done) {
    pick = { country: s.country, state: '', topics: TOPICS.IDS.slice(), reddit: false, alerts: s.alerts !== false, startup: s.startup !== false };
    onDone = done; at = 0;
    ['list', 'set'].forEach(id => { $(id).style.display = 'none'; });
    document.body.classList.add('setup'); $('title').textContent = 'Setup'; // CSS hides refresh, settings and the status line
    $('wiz').style.display = 'flex'; show();
  }
  $('priv').onclick = () => api.open(PRIVACY);
  return { start };
})();
