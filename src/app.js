// app.js: screens and controls. Uses globals from players.js, profiles.js and engine.js.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

  const FILTERS = [['all', 'All'], ['opener', 'Openers'], ['batter', 'Batters'], ['wk', 'Keepers'], ['allrounder', 'All-rounders'], ['spinner', 'Spinners'], ['pacer', 'Pacers']];
  const PITCH_ORDER = ['random', 'balanced', 'flat', 'green', 'dusty', 'bouncy'];
  const SPEEDS = { slow: 1500, normal: 650, fast: 150 };
  const STORE_KEY = 'dreamtest.v1';
  const DEFAULT_A = ['hobbs', 'gavaskar', 'bradman', 'tendulkar', 'lara', 'sobers_ar', 'gilchrist', 'imran', 'warne', 'marshall', 'mcgrath'];
  const DEFAULT_B = ['hayden', 'greenidge', 'ssmith', 'richards', 'kallis_ar', 'sangakkara_wk', 'botham', 'murali', 'wasim', 'steyn', 'ambrose'];
  const ORD = ['', '1st', '2nd', '3rd', '4th'];

  const state = {
    teams: [{ name: 'Team A', ids: DEFAULT_A.slice(), manual: false }, { name: 'Team B', ids: DEFAULT_B.slice(), manual: false }],
    target: 0, filter: 'all', query: '', pane: 'pool', example: true,
    settings: { pitch: 'random', toss: 'random', rain: true },
    match: null, setup: null, playing: false, speed: 'normal', pauseBreaks: true, tab: 'live', timer: null, lastOver: null
  };

  /* ---------- saved squads ---------- */
  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.teams) && s.teams.length === 2) {
        const seen = new Set(), teams = [];
        for (const t of s.teams) {
          const ids = [];
          for (const id of (t.ids || [])) {
            const p = PLAYER_BY_ID[id];
            if (p && !seen.has(p.key) && ids.length < 11) { seen.add(p.key); ids.push(id); }
          }
          teams.push({ name: String(t.name || '').slice(0, 24), ids, manual: !!t.manual });
        }
        state.teams = teams; state.example = false;
      }
      const st = s && s.settings;
      if (st) {
        if (PITCH_ORDER.includes(st.pitch)) state.settings.pitch = st.pitch;
        if (['random', 'a', 'b'].includes(st.toss)) state.settings.toss = st.toss;
        if (typeof st.rain === 'boolean') state.settings.rain = st.rain;
      }
    } catch (e) { /* storage unavailable */ }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ teams: state.teams, settings: state.settings })); } catch (e) { /* ignore */ } }

  /* ---------- squad helpers ---------- */
  const squadPlayers = t => t.ids.map(id => PLAYER_BY_ID[id]).filter(Boolean);
  const orderedPlayers = t => t.manual ? squadPlayers(t) : autoOrder(squadPlayers(t));
  const teamLabel = i => (state.teams[i].name || '').trim() || ('Team ' + 'AB'[i]);
  function takenBy(key) {
    for (let i = 0; i < 2; i++) if (squadPlayers(state.teams[i]).some(p => p.key === key)) return i;
    return -1;
  }
  function describe(p) {
    const base = ROLE_LABEL[p.role];
    if (p.role === 'spinner' || p.role === 'pacer' || p.role === 'allrounder') return base + ', ' + (STYLE_NAME[p.style] || '').toLowerCase();
    return base;
  }
  function statLine(p) {
    if (p.role === 'allrounder') return 'Bat ' + p.bat + ', bowl ' + p.bowl;
    if (p.role === 'wk' || p.role === 'spinner' || p.role === 'pacer') return 'Bat ' + p.bat;
    return '';
  }
  function strength(players) {
    if (!players.length) return { bat: 0, bowl: 0 };
    const bats = players.slice(0, 7).map(p => p.bat);
    const bowls = players.filter(canBowl).map(p => p.bowl).sort((a, b) => b - a).slice(0, 5);
    return { bat: Math.round(avg(bats)), bowl: bowls.length ? Math.round(avg(bowls)) : 0 };
  }
  function touched() { state.example = false; save(); }

  function addPlayer(p) {
    if (takenBy(p.key) >= 0) return;
    let ti = state.target;
    if (state.teams[ti].ids.length >= 11) {
      if (state.teams[1 - ti].ids.length < 11) { ti = 1 - ti; state.target = ti; } else return;
    }
    state.teams[ti].ids.push(p.id);
    if (state.teams[ti].ids.length >= 11 && state.teams[1 - ti].ids.length < 11) state.target = 1 - ti;
    touched(); renderSetup();
  }
  function removeAt(ti, idx) {
    const t = state.teams[ti];
    if (!t.manual) t.ids = orderedPlayers(t).map(p => p.id);
    t.ids.splice(idx, 1);
    state.target = ti; touched(); renderSetup();
  }
  function move(ti, idx, dir) {
    const t = state.teams[ti];
    if (!t.manual) { t.ids = orderedPlayers(t).map(p => p.id); t.manual = true; }
    const j = idx + dir;
    if (j < 0 || j >= t.ids.length) return;
    const x = t.ids[idx]; t.ids[idx] = t.ids[j]; t.ids[j] = x;
    touched(); renderSetup();
  }
  function fillTeam(i) {
    const other = new Set(squadPlayers(state.teams[1 - i]).map(p => p.key));
    const xi = autoPick(Math.random, other);
    state.teams[i].ids = xi.map(p => p.id); state.teams[i].manual = false;
    touched(); renderSetup();
  }

  /* ---------- setup screens ---------- */
  function renderPanes() {
    const nav = $('#panes'); clear(nav);
    const items = [['a', teamLabel(0) + ' ' + state.teams[0].ids.length], ['pool', 'Players'], ['b', teamLabel(1) + ' ' + state.teams[1].ids.length], ['match', 'Match']];
    items.forEach(([id, label]) => {
      const b = el('button', '', label); b.type = 'button';
      b.setAttribute('aria-pressed', String(state.pane === id));
      b.addEventListener('click', () => { state.pane = id; $('#setup').dataset.pane = id; renderPanes(); });
      nav.appendChild(b);
    });
    $('#setup').dataset.pane = state.pane;
  }

  function renderSquad(i) {
    const root = $(i === 0 ? '#pane-a' : '#pane-b'); clear(root);
    const t = state.teams[i], players = orderedPlayers(t), v = validateXI(players);
    const card = el('div', 'squad');
    const head = el('div', 'squad-head');
    head.appendChild(el('span', 'swatch t' + i));
    const input = el('input', 'tname'); input.type = 'text'; input.maxLength = 24; input.value = t.name; input.id = 'name-' + i;
    input.placeholder = 'Team ' + 'AB'[i]; input.setAttribute('aria-label', 'Team ' + 'AB'[i] + ' name');
    input.addEventListener('input', () => { t.name = input.value; touched(); renderPanes(); renderTarget(); renderMatchPane(); });
    head.appendChild(input);
    head.appendChild(el('span', 'cnt', players.length + '/11'));
    card.appendChild(head);
    card.appendChild(el('p', 'order-h', 'Batting order. The first two open.'));
    const ul = el('ul', 'slots');
    for (let k = 0; k < 11; k++) {
      const p = players[k];
      const li = el('li', 'slot' + (p ? '' : ' empty'));
      li.appendChild(el('span', 'no', String(k + 1)));
      const mid = el('div');
      if (p) { mid.appendChild(el('span', 'sname', p.name)); mid.appendChild(el('span', 'ssub', describe(p))); }
      else mid.appendChild(el('span', 'sname', 'Open slot'));
      li.appendChild(mid);
      if (p) {
        li.appendChild(el('span', 'srate', String(p.rating)));
        const act = el('div', 'sact');
        [['▲', 'Move up', () => move(i, k, -1), k === 0], ['▼', 'Move down', () => move(i, k, 1), k === players.length - 1], ['×', 'Remove', () => removeAt(i, k), false]].forEach(([ch, label, fn, dis]) => {
          const b = el('button', 'iconbtn', ch); b.type = 'button'; b.disabled = dis;
          b.setAttribute('aria-label', label + ' ' + p.name); b.addEventListener('click', fn); act.appendChild(b);
        });
        li.appendChild(act);
      } else { li.appendChild(el('span')); li.appendChild(el('span')); }
      ul.appendChild(li);
    }
    card.appendChild(ul);
    const s = strength(players);
    const meters = el('div', 'meters');
    [['Batting', s.bat], ['Bowling', s.bowl]].forEach(([n, val]) => {
      const m = el('div', 'meter t' + i); m.appendChild(el('span', '', n));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(0, Math.min(100, val)) + '%'; bar.appendChild(fill); m.appendChild(bar);
      m.appendChild(el('b', '', val ? String(val) : '-')); meters.appendChild(m);
    });
    card.appendChild(meters);
    card.appendChild(el('p', 'status ' + (v.ok ? 'ok' : 'bad'), v.ok ? 'Ready to play.' : v.problems.join('. ') + '.'));
    const acts = el('div', 'squad-acts');
    [['Auto-pick', () => fillTeam(i), false], ['Auto order', () => { t.manual = false; touched(); renderSetup(); }, !t.manual], ['Clear', () => { t.ids = []; t.manual = false; state.target = i; touched(); renderSetup(); }, !t.ids.length]].forEach(([label, fn, dis]) => {
      const b = el('button', 'btn sm', label); b.type = 'button'; b.disabled = dis; b.addEventListener('click', fn); acts.appendChild(b);
    });
    card.appendChild(acts);
    root.appendChild(card);
  }

  function renderTarget() {
    const root = $('#target'); clear(root);
    [0, 1].forEach(i => {
      const b = el('button', 't' + i, teamLabel(i) + ' ' + state.teams[i].ids.length + '/11'); b.type = 'button';
      b.setAttribute('aria-pressed', String(state.target === i));
      b.addEventListener('click', () => { state.target = i; renderTarget(); });
      root.appendChild(b);
    });
  }
  function renderFilters() {
    const root = $('#filters'); clear(root);
    FILTERS.forEach(([id, label]) => {
      const n = id === 'all' ? ALL_PLAYERS.length : ALL_PLAYERS.filter(p => p.role === id).length;
      const b = el('button', '', label + ' ' + n); b.type = 'button';
      b.setAttribute('aria-pressed', String(state.filter === id));
      b.addEventListener('click', () => { state.filter = id; renderFilters(); renderPool(); });
      root.appendChild(b);
    });
  }
  function renderPool() {
    const ul = $('#plist'); clear(ul);
    const q = state.query.trim().toLowerCase();
    let list = ALL_PLAYERS.filter(p => (state.filter === 'all' || p.role === state.filter) && (!q || p.name.toLowerCase().includes(q)));
    // available players first, then by rating
    list = list.slice().sort((a, b) => ((takenBy(a.key) >= 0) - (takenBy(b.key) >= 0)) || (state.filter === 'all' ? (b.rating - a.rating || a.name.localeCompare(b.name)) : 0));
    if (!list.length) { ul.appendChild(el('li', 'empty-list', 'No players match. Clear the search or pick another role.')); return; }
    const full = state.teams[0].ids.length >= 11 && state.teams[1].ids.length >= 11;
    list.forEach(p => {
      const li = el('li'); const taken = takenBy(p.key);
      const b = el('button', 'prow'); b.type = 'button'; b.disabled = taken >= 0 || full;
      b.appendChild(el('span', 'prate', String(p.rating)));
      const mid = el('span'); mid.appendChild(el('span', 'pname', p.name)); mid.appendChild(el('span', 'psub', describe(p))); b.appendChild(mid);
      if (taken >= 0) b.appendChild(el('span', 'ptag t' + taken, teamLabel(taken)));
      else b.appendChild(el('span', 'pstat', statLine(p)));
      b.addEventListener('click', () => addPlayer(p));
      li.appendChild(b); ul.appendChild(li);
    });
  }

  function renderMatchPane() {
    const root = $('#pane-match'); clear(root);
    const box = el('div', 'matchset');
    const pr = el('div', 'set-row'); pr.appendChild(el('h3', '', 'Pitch'));
    const grid = el('div', 'pitches');
    PITCH_ORDER.forEach(k => {
      const info = k === 'random' ? { name: 'Random', blurb: 'Revealed at the toss' } : Engine.PITCHES[k];
      const b = el('button', 'pitch'); b.type = 'button'; b.setAttribute('aria-pressed', String(state.settings.pitch === k));
      b.appendChild(el('b', '', info.name)); b.appendChild(el('span', '', info.blurb));
      b.addEventListener('click', () => { state.settings.pitch = k; save(); renderMatchPane(); });
      grid.appendChild(b);
    });
    pr.appendChild(grid); box.appendChild(pr);

    const tr = el('div', 'set-row'); tr.appendChild(el('h3', '', 'Toss'));
    const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Toss');
    [['random', 'Coin toss'], ['a', teamLabel(0) + ' bat first'], ['b', teamLabel(1) + ' bat first']].forEach(([id, label]) => {
      const b = el('button', id === 'a' ? 't0' : id === 'b' ? 't1' : '', label); b.type = 'button'; b.setAttribute('aria-pressed', String(state.settings.toss === id));
      b.addEventListener('click', () => { state.settings.toss = id; save(); renderMatchPane(); }); seg.appendChild(b);
    });
    tr.appendChild(seg); box.appendChild(tr);

    const wr = el('div', 'set-row');
    const lab = el('label', 'chk'); const cb = el('input'); cb.type = 'checkbox'; cb.id = 'chk-rain'; cb.checked = state.settings.rain;
    cb.addEventListener('change', () => { state.settings.rain = cb.checked; save(); });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(' Rain can interrupt play')); wr.appendChild(lab); box.appendChild(wr);

    const vs = [0, 1].map(i => validateXI(orderedPlayers(state.teams[i])));
    const row = el('div', 'start-row');
    const start = el('button', 'btn primary big', 'Start the Test'); start.type = 'button'; start.disabled = !(vs[0].ok && vs[1].ok);
    start.addEventListener('click', startMatch); row.appendChild(start);
    const fill = el('button', 'btn', 'Auto-pick both'); fill.type = 'button';
    fill.addEventListener('click', () => { fillTeam(0); fillTeam(1); }); row.appendChild(fill);
    let msg = 'Both squads are ready.';
    const bad = [0, 1].find(i => !vs[i].ok);
    if (bad != null) msg = teamLabel(bad) + ': ' + vs[bad].problems[0] + '.';
    row.appendChild(el('p', 'start-msg ' + (bad != null ? 'status bad' : 'status ok'), msg));
    box.appendChild(row);
    root.appendChild(box);
  }

  function renderSetup() {
    $('#example-note').hidden = !state.example;
    renderPanes(); renderSquad(0); renderSquad(1); renderTarget(); renderFilters(); renderPool(); renderMatchPane();
  }

  /* ---------- views ---------- */
  function showView(name, back) {
    const changed = state.view !== name;
    state.view = name;
    ['home', 'setup', 'room', 'match'].forEach(v => { const n = $('#' + v); if (n) n.hidden = v !== name; });
    const b = $('#btn-quit');
    if (back) { b.hidden = false; b.textContent = back.label; state.back = back.fn; } else { b.hidden = true; state.back = null; }
    if (changed) window.scrollTo(0, 0);
  }
  function goHome() { showView('home'); }
  function goSetup() { showView('setup', { label: 'Home', fn: goHome }); renderSetup(); }

  /* ---------- starting and driving a match ---------- */
  function startMatch() {
    const vs = [0, 1].map(i => validateXI(orderedPlayers(state.teams[i])));
    if (!vs[0].ok || !vs[1].ok) return;
    const names = [teamLabel(0), teamLabel(1)];
    if (names[0].toLowerCase() === names[1].toLowerCase()) names[1] += ' (2)';
    state.setup = {
      teams: [0, 1].map(i => ({ name: names[i], players: orderedPlayers(state.teams[i]) })),
      opts: { pitch: state.settings.pitch, firstBat: state.settings.toss === 'a' ? 0 : state.settings.toss === 'b' ? 1 : undefined, weather: state.settings.rain }
    };
    launch();
  }
  function launch() {
    clearTimeout(state.timer); state.timer = null;
    const s = state.setup;
    state.match = new Engine.Match(s.teams[0], s.teams[1], Object.assign({}, s.opts));
    state.lastOver = null; state.tab = 'live';
    showView('match', { label: 'Back to teams', fn: quit });
    $('#roominfo').hidden = true;
    $('#resultbox').hidden = true; clear($('#feed')); clear($('#cards'));
    setTab('live');
    refresh();
    setPlaying(true);
    window.scrollTo(0, 0);
  }
  function quit() {
    clearTimeout(state.timer); state.timer = null; state.playing = false; state.match = null;
    goSetup();
  }
  // Used by online rooms: show a match that someone else drives.
  function launchMatch(m, back) {
    clearTimeout(state.timer); state.timer = null; state.playing = false;
    state.match = m; state.lastOver = null; state.tab = 'live';
    showView('match', back);
    $('#resultbox').hidden = true; clear($('#feed')); clear($('#cards'));
    setTab('live'); refresh();
  }
  function setPlaying(v) {
    clearTimeout(state.timer); state.timer = null;
    state.playing = v && !!state.match && !state.match.finished;
    if (state.playing) state.timer = setTimeout(tick, 80);
    updateControls();
  }
  function tick() {
    state.timer = null;
    const m = state.match;
    if (!state.playing || !m || m.finished) return;
    const out = m.step();
    addEvents(out, false); refresh();
    if (m.finished) { state.playing = false; showResult(); updateControls(); return; }
    if (state.pauseBreaks && out.some(e => e.t === 'break' || e.t === 'inningsEnd')) { state.playing = false; updateControls(); return; }
    state.timer = setTimeout(tick, SPEEDS[state.speed]);
  }
  function stepOnce() {
    const m = state.match; if (!m || m.finished) return;
    setPlaying(false);
    const out = m.step(); addEvents(out, false); refresh();
    if (m.finished) showResult();
    updateControls();
  }
  function skip(kind) {
    const m = state.match; if (!m || m.finished) return;
    setPlaying(false);
    const out = m.run(kind); addEvents(out, true); refresh();
    if (m.finished) showResult();
    updateControls();
  }

  /* ---------- board, crease, controls ---------- */
  function scoreText(i) {
    return state.match.inns.filter(x => x.bat === i);
  }
  function updateBoard() {
    const m = state.match, snap = m.snapshot();
    [0, 1].forEach(i => {
      const root = $('#bt' + i);
      $('.bname span', root).textContent = m.teams[i].name;
      root.classList.toggle('batting', !!(m.cur && m.cur.bat === i));
      const sc = $('.bscore', root); clear(sc);
      const inns = scoreText(i);
      if (!inns.length) { sc.appendChild(el('span', 'yet', 'yet to bat')); return; }
      inns.forEach((inn, k) => {
        if (k) sc.appendChild(el('span', 'amp', '&'));
        sc.appendChild(el('span', 'sc' + (k === inns.length - 1 ? ' cur' : ''), inn.runs + (inn.wkts < 10 ? '/' + inn.wkts : '') + (inn.end === 'declared' ? 'd' : '')));
      });
    });
    const day = Math.max(1, Math.min(5, m.day));
    $('#bday').textContent = 'Day ' + day;
    if (m.finished) { $('#bsess').textContent = 'Match over'; $('#bleft').textContent = ''; $('#bsit').textContent = m.result.text; }
    else {
      $('#bsess').textContent = 'Session ' + snap.session;
      $('#bleft').textContent = Math.max(0, Math.floor((m.dayLimitBalls - m.dayBalls) / 6)) + ' overs left today';
      $('#bsit').textContent = snap.cur ? (snap.cur.situation || (snap.cur.bat + ' batting')) : '';
    }
    $('#bpitch').textContent = 'Pitch: ' + m.pitch.name;
    const pips = $('#pips'); clear(pips);
    const p = m.finished ? (day - 1) * 3 + 3 : (day - 1) * 3 + (snap.session - 1);
    for (let d = 0; d < 5; d++) {
      const g = el('div', 'dayp'); g.appendChild(el('em', '', String(d + 1)));
      for (let s = 0; s < 3; s++) { const k = d * 3 + s; g.appendChild(el('span', 'pip' + (k < p ? ' done' : k === p ? ' now' : ''))); }
      pips.appendChild(g);
    }
  }
  function updateCrease() {
    const m = state.match, snap = m.snapshot(), c = snap.cur, root = $('#crease');
    if (!c || !m.cur) { root.hidden = true; return; }
    root.hidden = false;
    const bat = $('#cr-bat'); clear(bat);
    c.batters.forEach(b => {
      const p = el('p'); p.appendChild(el('span', '', b.name + (b.striker ? ' *' : ''))); p.appendChild(el('b', '', b.runs + ' (' + b.balls + ')')); bat.appendChild(p);
    });
    const bowl = $('#cr-bowl'); clear(bowl);
    const lo = state.lastOver;
    if (lo && lo.inn === c.no) { const p = el('p'); p.appendChild(el('span', '', lo.bowler)); p.appendChild(el('b', '', lo.figs)); bowl.appendChild(p); }
    else bowl.appendChild(el('p', 'muted', 'New bowler to come'));
    const meta = $('#cr-meta'); clear(meta);
    const rr = c.overs === '0.0' ? 0 : c.rr;
    [['Partnership', c.partnership.runs + ' (' + c.partnership.balls + ')'], ['Run rate', rr.toFixed(2)], ['Tempo', c.mode]].forEach(([k, v]) => {
      const p = el('p'); p.appendChild(el('span', '', k)); p.appendChild(el('b', '', v)); meta.appendChild(p);
    });
  }
  function updateControls() {
    const m = state.match; if (!m) return;
    const done = m.finished;
    const play = $('#btn-play');
    play.textContent = state.playing ? 'Pause' : 'Resume';
    play.disabled = done;
    $('#btn-step').disabled = done;
    $$('[data-skip]').forEach(b => { b.disabled = done; });
    $$('#speed button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.speed === state.speed)));
    $('#chk-break').checked = state.pauseBreaks;
  }
  function refresh() { updateBoard(); updateCrease(); updateControls(); }

  /* ---------- commentary ---------- */
  function rowEl(cls, text) { const d = el('div', 'row ' + cls); d.appendChild(el('p', '', text)); return d; }
  function chipEl(b) {
    const c = el('span', 'chip'); let t;
    switch (b.k) {
      case 'dot': c.classList.add('dot'); t = '·'; c.title = 'Dot ball'; break;
      case 'run': t = String(b.v); c.title = b.v + (b.v === 1 ? ' run' : ' runs'); break;
      case 'four': c.classList.add('four'); t = '4'; c.title = 'Four'; break;
      case 'six': c.classList.add('six'); t = '6'; c.title = 'Six'; break;
      case 'wkt': c.classList.add('wkt'); t = 'W'; c.title = 'Wicket'; break;
      default: c.classList.add('ex'); t = b.k; c.title = b.k === 'wd' ? 'Wide' : b.k === 'nb' ? 'No ball' : 'Leg bye';
    }
    c.textContent = t; return c;
  }
  function overEl(e) {
    const d = el('article', 'over');
    const h = el('div', 'oh');
    h.appendChild(el('span', 'on', 'Over ' + e.over));
    h.appendChild(el('span', 'obowl', e.bowler));
    h.appendChild(el('span', 'ofig', e.figs));
    if (!e.partial && e.runs === 0) h.appendChild(el('span', 'otag', 'Maiden'));
    else if (e.runs >= 12) h.appendChild(el('span', 'otag', e.runs + ' off the over'));
    h.appendChild(el('span', 'osc', e.score.runs + '/' + e.score.wkts));
    d.appendChild(h);
    const balls = el('div', 'balls'); e.balls.forEach(b => balls.appendChild(chipEl(b))); d.appendChild(balls);
    e.notes.forEach(n => d.appendChild(el('p', 'onote' + (/WICKET|HAT-TRICK/.test(n) ? ' w' : ''), n)));
    return d;
  }
  function skippedEl(b) {
    const d = el('div', 'skipped');
    d.appendChild(el('strong', '', (b.from === b.to ? 'Over ' + b.from : 'Overs ' + b.from + ' to ' + b.to) + ' skipped'));
    d.appendChild(el('span', 'muted', b.runs + ' runs, ' + b.wkts + (b.wkts === 1 ? ' wicket' : ' wickets') + ' in ' + b.n + (b.n === 1 ? ' over' : ' overs')));
    if (b.notes.length) {
      const ul = el('ul'); b.notes.slice(0, 14).forEach(n => ul.appendChild(el('li', '', n)));
      if (b.notes.length > 14) ul.appendChild(el('li', '', '+' + (b.notes.length - 14) + ' more events'));
      d.appendChild(ul);
    }
    return d;
  }
  function eventEl(e) {
    switch (e.t) {
      case 'toss': { const d = el('div', 'row toss'); d.appendChild(el('p', '', e.text)); d.appendChild(el('p', 'sub', 'Pitch: ' + e.pitch + '. ' + e.pitchBlurb + '.')); return d; }
      case 'day': return rowEl('day', e.text);
      case 'innings': return rowEl('innstart', e.text);
      case 'inningsEnd': return rowEl('innend', e.text);
      case 'info': return rowEl('info', e.text);
      case 'result': return rowEl('info', e.text);
      case 'break': {
        const d = el('div', 'brk'); d.appendChild(el('h3', '', e.text));
        e.lines.forEach(l => { const p = el('p'); p.appendChild(el('b', '', l.name)); p.appendChild(el('span', '', l.text)); d.appendChild(p); });
        return d;
      }
      case 'over': state.lastOver = e; return overEl(e);
      default: return null;
    }
  }
  function addEvents(list, condense) {
    const feed = $('#feed'), nodes = []; let bucket = null, lastOver = -1;
    if (condense) list.forEach((e, i) => { if (e.t === 'over') lastOver = i; });
    const flush = () => { if (bucket) nodes.push(skippedEl(bucket)); bucket = null; };
    list.forEach((e, i) => {
      if (e.t === 'over' && condense && i < lastOver) {
        if (!bucket) bucket = { n: 0, runs: 0, wkts: 0, notes: [], from: e.over, to: e.over };
        bucket.n++; bucket.runs += e.runs; bucket.wkts += e.wkts; bucket.to = e.over;
        e.notes.forEach(n => { if (/WICKET|HAT-TRICK|reaches|five-wicket/.test(n)) bucket.notes.push(n); });
        return;
      }
      flush();
      const n = eventEl(e); if (n) nodes.push(n);
    });
    flush();
    nodes.forEach(n => feed.insertBefore(n, feed.firstChild));
    while (feed.childElementCount > 260) feed.removeChild(feed.lastChild);
    if (state.tab === 'cards') renderCards();
  }

  /* ---------- scorecards ---------- */
  function table(headers, rows, totalRow) {
    const wrap = el('div', 'tw'), t = el('table'), th = el('thead'), hr = el('tr');
    headers.forEach(h => hr.appendChild(el('th', '', h))); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody');
    rows.forEach(r => {
      const tr = el('tr');
      r.forEach(c => { const td = el('td'); if (c instanceof Node) td.appendChild(c); else td.textContent = c; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }
  function renderCards() {
    const root = $('#cards'); clear(root);
    const sc = state.match.scorecards();
    if (!sc.length) { root.appendChild(el('p', 'muted', 'The scorecard appears once play starts.')); return; }
    sc.forEach(inn => {
      const sec = el('section', 'card');
      const h = el('h3'); h.appendChild(el('span', '', ORD[inn.no] + ' innings, ' + inn.team));
      h.appendChild(el('span', 'tot', inn.runs + (inn.wkts < 10 ? '/' + inn.wkts : '') + (inn.end === 'declared' ? 'd' : '') + ' (' + inn.overs + ' ov)' + (inn.live ? ', in progress' : '')));
      sec.appendChild(h);
      const rows = inn.batters.filter(b => b.in).map(b => {
        const nm = el('span'); nm.appendChild(document.createTextNode(b.name));
        nm.appendChild(el('small', '', b.out || 'not out'));
        return [nm, String(b.runs), String(b.balls), String(b.fours), String(b.sixes), String(b.sr)];
      });
      const ex = inn.extras;
      rows.push(['Extras (b ' + ex.b + ', lb ' + ex.lb + ', w ' + ex.w + ', nb ' + ex.nb + ')', String(inn.extrasTotal), '', '', '', '']);
      rows.push(['Total', inn.runs + (inn.wkts < 10 ? '/' + inn.wkts : ''), inn.overs + ' ov', '', '', '']);
      const bt = table(['Batter', 'R', 'B', '4s', '6s', 'SR'], rows);
      const last = $$('tbody tr', bt); if (last.length) last[last.length - 1].classList.add('tot');
      sec.appendChild(bt);
      const dnb = inn.batters.filter(b => !b.in).map(b => b.short);
      if (dnb.length) sec.appendChild(el('p', '', 'Did not bat: ' + dnb.join(', ')));
      if (inn.fow.length) sec.appendChild(el('p', '', 'Fall of wickets: ' + inn.fow.map(f => f.w + '-' + f.runs + ' (' + f.name + ', ' + f.over + ' ov)').join(', ')));
      if (inn.bowlers.length) sec.appendChild(table(['Bowler', 'O', 'M', 'R', 'W', 'Econ'], inn.bowlers.map(b => [b.name, b.overs, String(b.maidens), String(b.runs), String(b.wkts), String(b.econ)])));
      root.appendChild(sec);
    });
  }
  function setTab(t) {
    state.tab = t;
    $$('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
    $('#feed').hidden = t !== 'live'; $('#cards').hidden = t !== 'cards';
    if (t === 'cards') renderCards();
  }

  /* ---------- result ---------- */
  function showResult() {
    const m = state.match, r = m.result, box = $('#resultbox'); clear(box); box.hidden = false;
    box.appendChild(el('h2', '', r.text));
    if (r.potm) box.appendChild(el('p', '', 'Player of the match: ' + r.potm.name + ' (' + r.potm.team + '), ' + r.potm.line + '.'));
    const act = el('div', 'ctl-row');
    DT.resultActions().forEach(([label, cls, fn]) => {
      const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); act.appendChild(b);
    });
    box.appendChild(act);
  }

  /* ---------- wiring ---------- */
  function init() {
    loadSaved();
    const legends = new Set(ALL_PLAYERS.map(p => p.key)).size;
    $('#tagline').textContent = 'Pick two XIs from ' + legends + ' all-time greats. Their ratings decide a five-day Test, played over by over.';
    $('#q').addEventListener('input', e => { state.query = e.target.value; renderPool(); });
    $('#btn-quit').addEventListener('click', () => { if (state.back) state.back(); });
    $('#btn-play').addEventListener('click', () => DT.ctl.toggle());
    $('#btn-step').addEventListener('click', () => DT.ctl.step());
    $$('[data-skip]').forEach(b => b.addEventListener('click', () => DT.ctl.skip(b.dataset.skip)));
    $$('#speed button').forEach(b => b.addEventListener('click', () => DT.ctl.speed(b.dataset.speed)));
    $('#chk-break').addEventListener('change', e => DT.ctl.pauseBreaks(e.target.checked));
    $('#h-local').addEventListener('click', goSetup);
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    renderSetup();
    showView('home');
  }
  const localCtl = {
    toggle: () => setPlaying(!state.playing), step: stepOnce, skip,
    speed: sp => { state.speed = sp; updateControls(); },
    pauseBreaks: v => { state.pauseBreaks = v; }
  };
  const DT = {
    $, $$, el, clear, state, showView, goHome, addEvents, refresh, updateControls, setTab, showResult, launchMatch,
    describe, statLine, strength, teamLabel, ctl: localCtl, localCtl,
    resultActions: () => [['Rematch', 'primary', () => launch()], ['View scorecard', '', () => setTab('cards')], ['Pick new teams', '', quit]]
  };
  DT.defaultResultActions = DT.resultActions;
  window.DT = DT;
  init();
})();
