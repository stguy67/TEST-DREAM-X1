// online.js: rooms, snake draft, batting order, toss and the synced match. Uses DT from app.js.
(function () {
  'use strict';
  const { $, $$, el, clear, state, showView, goHome, refresh, updateControls, setTab, showResult, launchMatch, describe, statLine, strength } = DT;

  const PID_KEY = 'dreamtest.pid', NAME_KEY = 'dreamtest.name', ROOM_KEY = 'dreamtest.room', LEFT_KEY = 'dreamtest.left';
  const DELAY = { slow: 1500, normal: 650, fast: 150 };
  const FILTERS = [['all', 'All'], ['opener', 'Openers'], ['batter', 'Batters'], ['wk', 'Keepers'], ['allrounder', 'All-rounders'], ['spinner', 'Spinners'], ['pacer', 'Pacers']];
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const randId = n => { const c = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

  let pid = lsGet(PID_KEY);
  if (!pid) { pid = randId(20); lsSet(PID_KEY, pid); }

  let room = null, offset = 0, writing = 0, pollTimer = null;
  let ui = { sel: null, filter: 'all', query: '', pane: 'pool', order: null, orderRound: -1, orderSent: false };
  let match = null, timeline = [], steps = 0, matchRound = -1, loopTimer = null, shownResult = false;
  let netDown = false, toastTimer = null;

  const serverNow = () => Date.now() + offset;
  const sideName = side => { const p = room.players.find(x => x.side === side); return p ? p.name : 'Player'; };
  const teamName = side => sideName(side) + "'s XI";
  const tcls = side => (side === 'A' ? 't0' : 't1');
  const squadIds = side => room.picks.filter((_, i) => draftSide(i) === side);
  const squadOf = side => squadIds(side).map(id => PLAYER_BY_ID[id]);

  /* ---------- talking to the server ---------- */
  async function api(op, extra) {
    const body = Object.assign({ op, pid }, room ? { code: room.code } : {}, extra || {});
    const t0 = Date.now();
    let r;
    try { r = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('offline'); }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('The server sent a reply the game could not read.'); }
    const t1 = Date.now();
    if (!r.ok) { const err = new Error(j.error || 'Request failed.'); err.status = r.status; err.storage = j.storage; throw err; }
    if (j.now) offset = j.now - (t0 + t1) / 2;
    return j;
  }
  function errText(e) {
    if (e.storage === false) return 'Online rooms are not switched on yet. The site owner needs to connect a Redis database to this project in Vercel.';
    if (e.message === 'offline') return 'Could not reach the server. Check your connection and try again.';
    return e.message || 'Something went wrong.';
  }
  function flash(text, ms) {
    const n = $('#netmsg'); n.textContent = text; n.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { n.hidden = !netDown; if (netDown) n.textContent = 'Connection lost. Retrying...'; }, ms || 3500);
  }
  function netFail() { if (!netDown) { netDown = true; const n = $('#netmsg'); n.textContent = 'Connection lost. Retrying...'; n.hidden = false; } }
  function netOk() { if (netDown) { netDown = false; $('#netmsg').hidden = true; } }

  /* ---------- home ---------- */
  const nameVal = () => { const v = $('#h-name').value.trim().slice(0, 16); lsSet(NAME_KEY, v); return v; };
  function homeMsg(t, info) { const m = $('#h-msg'); m.textContent = t || ''; m.hidden = !t; m.className = 'status' + (info ? '' : ' bad'); }
  function rejoinHint(code) { $('#h-code').value = code; homeMsg('You left room ' + code + '. Press Join room to go back in.', true); }
  async function createRoom() {
    homeMsg(''); $('#h-create').disabled = true;
    try { const j = await api('create', { name: nameVal() }); enter(j.state); }
    catch (e) { homeMsg(errText(e)); }
    $('#h-create').disabled = false;
  }
  async function joinRoom() {
    homeMsg('');
    const code = $('#h-code').value.trim().toUpperCase();
    if (code.length < 4) { homeMsg('Enter the room code your friend gave you.'); return; }
    $('#h-join').disabled = true;
    try { const j = await api('join', { code, name: nameVal() }); enter(j.state); }
    catch (e) {
      homeMsg(errText(e));
      if (e.status === 404 && lsGet(ROOM_KEY) === code) { lsSet(ROOM_KEY, null); lsSet(LEFT_KEY, null); }
    }
    $('#h-join').disabled = false;
  }
  function enter(s) {
    room = s; lsSet(ROOM_KEY, s.code); lsSet(LEFT_KEY, null);
    ui = { sel: null, filter: 'all', query: '', pane: 'pool', order: null, orderRound: -1, orderSent: false };
    history.replaceState(null, '', location.pathname);
    schedule(900); render();
  }
  async function leave() {
    clearTimeout(pollTimer); stopMatch();
    const code = room && room.code, midGame = !!room && room.phase !== 'lobby';
    if (room && room.phase === 'lobby') { try { await api('leave'); } catch (e) { /* ignore */ } }
    // Leaving a game that is under way is not final: the code is kept so the player can step back in.
    room = null; lsSet(ROOM_KEY, midGame ? code : null); lsSet(LEFT_KEY, midGame ? code : null); netOk();
    showView('home'); homeMsg('');
    if (midGame) rejoinHint(code);
  }

  /* ---------- polling ---------- */
  function schedule(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, ms); }
  async function poll() {
    if (!room) return;
    if (writing > 0) { schedule(300); return; }
    try {
      const j = await api('get', { v: room.v });
      netOk();
      if (!room) return;
      if (j.state && writing === 0 && j.state.v >= room.v) adopt(j.state);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { room = null; lsSet(ROOM_KEY, null); stopMatch(); showView('home'); homeMsg('That room has closed. Make a new one to keep playing.'); return; }
      netFail();
    }
    if (room) schedule(room.phase === 'match' ? 1500 : 1000);
  }
  function adopt(s) { const changed = !room || s.v !== room.v; room = s; if (changed) render(); }
  async function send(op, extra) {
    writing++;
    try { const j = await api(op, extra); if (j.state) adopt(j.state); return true; }
    catch (e) { flash(errText(e)); return false; }
    finally { writing--; }
  }

  /* ---------- render by phase ---------- */
  function render() {
    if (!room) return;
    if (room.phase === 'match') { renderMatch(); return; }
    stopMatch();
    showView('room', { label: 'Leave room', fn: leave });
    const root = $('#room-body');
    const focus = document.activeElement && document.activeElement.id === 'dq' ? document.activeElement.selectionStart : null;
    // Keep the player list where the user had scrolled it when the screen is rebuilt.
    const oldList = room.phase === 'draft' ? $('.plist', root) : null, keepScroll = oldList ? oldList.scrollTop : 0;
    clear(root);
    $('#room').dataset.pane = ui.pane;
    if (room.phase === 'lobby') renderLobby(root);
    else if (room.phase === 'draft') renderDraft(root);
    else if (room.phase === 'order') renderOrder(root);
    else if (room.phase === 'toss') renderToss(root);
    if (keepScroll) { const nl = $('.plist', root); if (nl) nl.scrollTop = keepScroll; }
    if (focus != null) { const q = $('#dq'); if (q) { q.focus(); try { q.setSelectionRange(focus, focus); } catch (e) { /* ignore */ } } }
  }

  function renderLobby(root) {
    const box = el('div', 'roombox');
    box.appendChild(el('h2', '', 'Your room'));
    const cb = el('div', 'codeboard');
    cb.appendChild(el('span', 'muted', 'Room code'));
    cb.appendChild(el('div', 'codebig', room.code));
    const link = location.origin + location.pathname + '?room=' + room.code;
    const lr = el('div', 'linkrow');
    const inp = el('input'); inp.readOnly = true; inp.value = link; inp.id = 'invite'; inp.setAttribute('aria-label', 'Invite link');
    inp.addEventListener('focus', () => inp.select());
    const cp = el('button', 'btn sm', 'Copy invite link'); cp.type = 'button';
    cp.addEventListener('click', () => {
      const fallback = () => { inp.focus(); inp.select(); flash('Press copy on the selected link.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => flash('Invite link copied.'), fallback); else fallback();
    });
    lr.appendChild(inp); lr.appendChild(cp); cb.appendChild(lr);
    box.appendChild(cb);
    box.appendChild(el('p', '', 'Send your friend the code or the link. When they join, the host starts the draft.'));
    const ul = el('ul', 'whos');
    room.players.forEach((p, i) => { const li = el('li'); li.appendChild(el('span', '', p.name + (i === room.you ? ' (you)' : ''))); li.appendChild(el('span', 'muted', i === 0 ? 'Host' : 'Joined')); ul.appendChild(li); });
    if (room.players.length < 2) ul.appendChild(el('li', 'wait', 'Waiting for your friend to join...'));
    box.appendChild(ul);
    box.appendChild(el('p', 'muted', 'The game picks at random who is Team A and who is Team B. Pick order: A, then B twice, A twice, B twice, and so on.'));
    if (room.isHost) {
      const b = el('button', 'btn primary big', 'Start the draft'); b.type = 'button'; b.disabled = room.players.length < 2;
      b.addEventListener('click', () => send('start')); box.appendChild(b);
    } else box.appendChild(el('p', 'status', 'Waiting for ' + room.players[0].name + ' to start the draft.'));
    root.appendChild(box);
  }

  /* ----- draft ----- */
  function squadCard(side, opts) {
    const ids = opts.ids || squadIds(side), players = ids.map(id => PLAYER_BY_ID[id]);
    const card = el('div', 'squad');
    const head = el('div', 'squad-head');
    head.appendChild(el('span', 'swatch ' + tcls(side)));
    const nm = el('h2', 'tname-static', teamName(side));
    nm.style.cssText = 'font:800 1.5rem/1.1 var(--display);flex:1;min-width:0';
    head.appendChild(nm);
    if (room.mySide === side) head.appendChild(el('span', 'you', 'You'));
    head.appendChild(el('span', 'cnt', players.length + '/11'));
    card.appendChild(head);
    card.appendChild(el('p', 'order-h', 'Team ' + side + (opts.order ? '. Batting order, first two open.' : '. In pick order.')));
    const ul = el('ul', 'slots');
    for (let k = 0; k < 11; k++) {
      const p = players[k];
      const li = el('li', 'slot' + (p ? '' : ' empty'));
      li.appendChild(el('span', 'no', String(k + 1)));
      const mid = el('div');
      if (p) { mid.appendChild(el('span', 'sname', p.name)); mid.appendChild(el('span', 'ssub', describe(p))); } else mid.appendChild(el('span', 'sname', 'Open slot'));
      li.appendChild(mid);
      if (p) {
        li.appendChild(el('span', 'srate', String(p.rating)));
        if (opts.move) {
          const act = el('div', 'sact');
          [['▲', 'Move up', -1, k === 0], ['▼', 'Move down', 1, k === players.length - 1]].forEach(([ch, label, dir, dis]) => {
            const b = el('button', 'iconbtn', ch); b.type = 'button'; b.disabled = dis; b.setAttribute('aria-label', label + ' ' + p.name);
            b.addEventListener('click', () => opts.move(k, dir)); act.appendChild(b);
          });
          li.appendChild(act);
        } else li.appendChild(el('span'));
      } else { li.appendChild(el('span')); li.appendChild(el('span')); }
      ul.appendChild(li);
    }
    card.appendChild(ul);
    const s = strength(players), meters = el('div', 'meters');
    [['Batting', s.bat], ['Bowling', s.bowl]].forEach(([n, val]) => {
      const m = el('div', 'meter ' + tcls(side)); m.appendChild(el('span', '', n));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(0, Math.min(100, val)) + '%'; bar.appendChild(fill); m.appendChild(bar);
      m.appendChild(el('b', '', val ? String(val) : '-')); meters.appendChild(m);
    });
    card.appendChild(meters);
    if (opts.needs) {
      const left = 11 - players.length, needK = players.some(p => p.role === 'wk') ? 0 : 1, needB = Math.max(0, 4 - players.filter(canBowl).length);
      const bits = [];
      if (needK) bits.push('a keeper'); if (needB) bits.push(needB + ' bowling option' + (needB === 1 ? '' : 's'));
      card.appendChild(el('p', 'status ' + (bits.length ? 'bad' : 'ok'), left === 0 ? 'XI complete.' : bits.length ? 'Still needs ' + bits.join(' and ') + '.' : 'Keeper and bowlers covered.'));
    }
    return card;
  }

  function renderDraft(root) {
    const n = room.picks.length, mine = room.mySide;
    const turn = n < 22 ? draftSide(n) : null, myTurn = turn === mine;
    // status bar
    const bar = el('div', 'draftbar');
    bar.appendChild(el('div', 'who' + (myTurn ? ' me' : ''), myTurn ? 'Your pick' : sideName(turn) + ' is picking'));
    bar.appendChild(el('div', 'sub', 'Pick ' + Math.min(n + 1, 22) + ' of 22. You are Team ' + mine + ', ' + teamName(mine) + '.'));
    const sel = ui.sel && PLAYER_BY_ID[ui.sel] && !takenKey(PLAYER_BY_ID[ui.sel].key) ? PLAYER_BY_ID[ui.sel] : null;
    if (!sel) ui.sel = null;
    const cf = el('div', 'confirm');
    if (myTurn && sel) {
      cf.appendChild(el('span', '', 'Pick ' + sel.name + '?'));
      const ok = el('button', 'btn primary sm', 'Confirm pick'); ok.type = 'button';
      ok.addEventListener('click', async () => { ok.disabled = true; const id = sel.id; ui.sel = null; await send('pick', { id }); });
      const no = el('button', 'btn sm', 'Cancel'); no.type = 'button'; no.addEventListener('click', () => { ui.sel = null; render(); });
      cf.appendChild(ok); cf.appendChild(no);
    } else cf.appendChild(el('span', 'sub', myTurn ? 'Tap a player, then confirm.' : 'You can look through the list and tap a player to plan your next pick.'));
    bar.appendChild(cf);
    const sn = el('div', 'snake'); sn.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 22; i++) sn.appendChild(el('i', tcls(draftSide(i)) + (i < n ? ' done' : '') + (i === n ? ' now' : '')));
    bar.appendChild(sn);
    root.appendChild(bar);

    // mobile section switch
    const nav = el('nav', 'panes'); nav.setAttribute('aria-label', 'Draft sections');
    [['a', teamName('A') + ' ' + squadIds('A').length], ['pool', 'Players'], ['b', teamName('B') + ' ' + squadIds('B').length]].forEach(([id, label]) => {
      const b = el('button', '', label); b.type = 'button'; b.setAttribute('aria-pressed', String(ui.pane === id));
      b.addEventListener('click', () => { ui.pane = id; render(); }); nav.appendChild(b);
    });
    root.appendChild(nav);

    const grid = el('div', 'grid');
    const pa = el('section', 'pane pane-a'); pa.appendChild(squadCard('A', { needs: true })); grid.appendChild(pa);

    const pp = el('section', 'pane pane-pool');
    const ph = el('div', 'pool-head'); ph.appendChild(el('h2', '', 'Players')); pp.appendChild(ph);
    const fl = el('div', 'filters');
    FILTERS.forEach(([id, label]) => {
      const cnt = id === 'all' ? ALL_PLAYERS.length : ALL_PLAYERS.filter(p => p.role === id).length;
      const b = el('button', '', label + ' ' + cnt); b.type = 'button'; b.setAttribute('aria-pressed', String(ui.filter === id));
      b.addEventListener('click', () => { ui.filter = id; render(); }); fl.appendChild(b);
    });
    pp.appendChild(fl);
    const sl = el('label', 'search'); sl.appendChild(el('span', 'sr', 'Search players'));
    const qi = el('input'); qi.id = 'dq'; qi.type = 'search'; qi.placeholder = 'Search by name'; qi.autocomplete = 'off'; qi.value = ui.query;
    qi.addEventListener('input', () => { ui.query = qi.value; render(); });
    sl.appendChild(qi); pp.appendChild(sl);
    const ul = el('ul', 'plist');
    const q = ui.query.trim().toLowerCase();
    let list = ALL_PLAYERS.filter(p => (ui.filter === 'all' || p.role === ui.filter) && (!q || p.name.toLowerCase().includes(q)));
    list = list.slice().sort((a, b) => ((takenKey(a.key) ? 1 : 0) - (takenKey(b.key) ? 1 : 0)) || (ui.filter === 'all' ? (b.rating - a.rating || a.name.localeCompare(b.name)) : 0));
    if (!list.length) ul.appendChild(el('li', 'empty-list', 'No players match. Clear the search or pick another role.'));
    const mineIds = squadIds(mine);
    list.forEach(p => {
      const li = el('li'), taken = takenKey(p.key);
      const why = !taken && myTurn ? draftBlock(mineIds, p) : '';
      const b = el('button', 'prow' + (ui.sel === p.id ? ' sel' : '')); b.type = 'button'; b.disabled = !!taken || !!why;
      b.appendChild(el('span', 'prate', String(p.rating)));
      const mid = el('span'); mid.appendChild(el('span', 'pname', p.name)); mid.appendChild(el('span', 'psub', describe(p))); b.appendChild(mid);
      if (taken) b.appendChild(el('span', 'ptag ' + tcls(taken), teamName(taken)));
      else if (why) b.appendChild(el('span', 'pstat bad', why));
      else b.appendChild(el('span', 'pstat', statLine(p)));
      b.addEventListener('click', () => { ui.sel = p.id; render(); });
      li.appendChild(b); ul.appendChild(li);
    });
    pp.appendChild(ul); grid.appendChild(pp);

    const pb = el('section', 'pane pane-b'); pb.appendChild(squadCard('B', { needs: true })); grid.appendChild(pb);
    root.appendChild(grid);
  }
  function takenKey(key) {
    for (const side of ['A', 'B']) if (squadOf(side).some(p => p.key === key)) return side;
    return null;
  }

  /* ----- batting order ----- */
  function renderOrder(root) {
    const mine = room.mySide, other = mine === 'A' ? 'B' : 'A';
    if (ui.orderRound !== room.round) {
      const saved = room.orders && room.orders[mine];
      ui.order = saved ? saved.slice() : autoOrder(squadOf(mine)).map(p => p.id);
      ui.orderRound = room.round; ui.orderSent = !!(room.players[room.you] && room.players[room.you].ready);
    }
    const iAmReady = !!room.players[room.you].ready;
    const head = el('div', 'roombox');
    head.appendChild(el('h2', '', 'Set your batting order'));
    head.appendChild(el('p', '', 'The first two in your list open the batting. Move players with the arrows, then press Ready. The toss happens when both of you are ready.'));
    root.appendChild(head);
    const grid = el('div', 'grid2');
    const mineCard = squadCard(mine, { ids: ui.order, order: true, move: iAmReady ? null : (k, dir) => { const j = k + dir; if (j < 0 || j > 10) return; const o = ui.order; const x = o[k]; o[k] = o[j]; o[j] = x; render(); } });
    grid.appendChild(mineCard);
    const oc = squadCard(other, {});
    grid.appendChild(oc);
    root.appendChild(grid);
    const act = el('div', 'roombox'); act.style.marginTop = '18px';
    if (!iAmReady) {
      const b = el('button', 'btn primary big', 'Ready'); b.type = 'button';
      b.addEventListener('click', async () => { b.disabled = true; await send('ready', { ids: ui.order }); });
      act.appendChild(b);
      const a = el('button', 'btn', 'Reset to suggested order'); a.type = 'button';
      a.addEventListener('click', () => { ui.order = autoOrder(squadOf(mine)).map(p => p.id); render(); });
      act.appendChild(a);
    } else act.appendChild(el('p', 'status ok', 'You are ready. Waiting for ' + sideName(other) + '.'));
    root.appendChild(act);
  }

  /* ----- toss ----- */
  function renderToss(root) {
    const t = room.toss, win = t.winner, iWin = win === room.mySide;
    const box = el('div', 'tosscard');
    box.appendChild(el('div', 'coin', win));
    box.appendChild(el('h2', '', 'The toss'));
    box.appendChild(el('p', 'big', sideName(win) + ' wins the toss.'));
    const info = Engine.PITCHES[room.pitch];
    const pc = el('div', 'pitchcard'); pc.appendChild(el('b', '', 'Pitch: ' + info.name)); pc.appendChild(el('p', 'muted', info.blurb + '. Rain ' + (room.weather ? 'may' : 'will not') + ' interrupt play.'));
    box.appendChild(pc);
    if (iWin) {
      box.appendChild(el('p', '', 'Choose what your side does first.'));
      const row = el('div', 'ctl-row');
      [['Bat first', true, true], ['Bowl first', false, false]].forEach(([label, bat, primary]) => {
        const b = el('button', 'btn big' + (primary ? ' primary' : ''), label); b.type = 'button';
        b.addEventListener('click', async () => { $$('button', row).forEach(x => { x.disabled = true; }); await send('tosschoice', { bat }); });
        row.appendChild(b);
      });
      box.appendChild(row);
    } else box.appendChild(el('p', 'status', 'Waiting for ' + sideName(win) + ' to choose bat or bowl.'));
    root.appendChild(box);
  }

  /* ---------- synced match ---------- */
  function teamFor(side) {
    return { name: teamName(side), players: room.orders[side].map(id => PLAYER_BY_ID[id]) };
  }
  function renderMatch() {
    if (!match || matchRound !== room.round) startMatch();
  }
  function startMatch() {
    stopMatch();
    const A = teamFor('A'), B = teamFor('B');
    const firstSide = room.toss.bat ? room.toss.winner : (room.toss.winner === 'A' ? 'B' : 'A');
    const mk = () => new Engine.Match(A, B, { seed: room.seed, pitch: room.pitch, firstBat: firstSide === 'A' ? 0 : 1, weather: room.weather });
    // The same seed gives the same match on every device. A scratch copy maps out where the breaks fall.
    const scratch = mk(); timeline = [];
    for (let g = 0; g < 6000 && !scratch.finished; g++) {
      const out = scratch.step();
      timeline.push({
        stop: out.some(e => e.t === 'break' || e.t === 'inningsEnd' || e.t === 'result'),
        stumps: out.some(e => (e.t === 'break' && e.kind === 'stumps') || e.t === 'result'),
        inn: out.some(e => e.t === 'inningsEnd' || e.t === 'result')
      });
    }
    match = mk(); steps = 0; matchRound = room.round; shownResult = false;
    launchMatch(match, { label: 'Leave room', fn: leave });
    DT.ctl = onlineCtl; DT.resultActions = onlineResultActions;
    const ri = $('#roominfo'); ri.hidden = false; clear(ri);
    ri.appendChild(document.createTextNode('Room '));
    ri.appendChild(el('b', '', room.code));
    ri.appendChild(document.createTextNode('. You are ' + teamName(room.mySide) + ' (Team ' + room.mySide + '). Pause, speed and skips are shared, so either of you can use them.'));
    loopTimer = setInterval(loop, 100);
    loop();
  }
  function stopMatch() {
    clearInterval(loopTimer); loopTimer = null; match = null; matchRound = -1;
    DT.ctl = DT.localCtl; DT.resultActions = DT.defaultResultActions;
    const ri = $('#roominfo'); if (ri) ri.hidden = true;
  }
  const nextStop = from => { for (let k = from; k < timeline.length; k++) if (timeline[k].stop) return k + 1; return null; };
  const nextFlag = (from, flag) => { for (let k = from; k < timeline.length; k++) if (timeline[k][flag]) return k + 1; return timeline.length; };
  function target() {
    const s = room.sync; if (!s) return 0;
    let T = s.cursor;
    if (s.playing) { const e = serverNow() - s.since; if (e > 0) T += Math.floor(e / DELAY[s.speed]); }
    if (s.pauseBreaks) { const h = nextStop(s.cursor); if (h != null && h < T) T = h; }
    return Math.min(T, timeline.length);
  }
  function loop() {
    if (!match || !room || room.phase !== 'match' || !room.sync) return;
    const T = target();
    if (steps < T) {
      const evs = []; let n = 0;
      while (steps < T && !match.finished) { const out = match.step(); steps++; n++; for (const e of out) evs.push(e); }
      DT.addEvents(evs, n > 4);
      refresh();
    }
    const s = room.sync, h = s.pauseBreaks ? nextStop(s.cursor) : null;
    const halted = s.playing && h != null && steps >= h;
    state.playing = s.playing && !match.finished && !halted && steps < timeline.length;
    state.speed = s.speed; state.pauseBreaks = s.pauseBreaks;
    updateControls();
    if (match.finished && !shownResult) { shownResult = true; showResult(); }
  }
  function write(patch) {
    if (!room || !room.sync) return;
    room.sync = Object.assign({}, room.sync, patch, { since: serverNow() });
    send('sync', { patch });
  }
  const onlineCtl = {
    toggle() { write({ playing: !state.playing, cursor: target() }); },
    step() { write({ playing: false, cursor: Math.min(target() + 1, timeline.length) }); },
    skip(kind) {
      const T = target();
      const idx = kind === 'end' ? timeline.length : nextFlag(T, kind === 'session' ? 'stop' : kind === 'day' ? 'stumps' : 'inn');
      write({ playing: false, cursor: idx });
    },
    speed(sp) { write({ speed: sp, cursor: target(), playing: room.sync.playing }); },
    pauseBreaks(v) { write({ pauseBreaks: v, cursor: target(), playing: room.sync.playing }); }
  };
  const onlineResultActions = () => [
    ['Play again with new sides', 'primary', () => send('again')],
    ['View scorecard', '', () => setTab('cards')],
    ['Leave room', '', leave]
  ];

  /* ---------- start up ---------- */
  async function resume() {
    const q = new URLSearchParams(location.search).get('room');
    if (q) { $('#h-code').value = q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); return; }
    const code = lsGet(ROOM_KEY);
    if (!code) return;
    if (lsGet(LEFT_KEY) === code) { rejoinHint(code); return; }
    try { const j = await api('join', { code, name: nameVal() }); enter(j.state); }
    catch (e) { if (e.status === 404 || e.status === 403 || e.status === 400) lsSet(ROOM_KEY, null); }
  }
  function init() {
    $('#h-name').value = lsGet(NAME_KEY) || '';
    $('#h-create').addEventListener('click', createRoom);
    $('#h-join').addEventListener('click', joinRoom);
    $('#h-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('#h-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    resume();
  }
  init();
})();
