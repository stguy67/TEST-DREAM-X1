'use strict';
// Room server for Dream Test XI. One POST endpoint, state kept in Redis (REST) with compare-and-set writes.
const lib = require('./_lib.js');
const { PLAYER_BY_ID, draftSide, draftBlock } = lib;

const TTL = 6 * 3600;
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOCAL = process.env.DT_LOCAL === '1';
const mem = (global.__dtMem = global.__dtMem || new Map());
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PITCHES = [['balanced', .30], ['flat', .20], ['green', .18], ['dusty', .16], ['bouncy', .16]];

/* ---------- storage ---------- */
async function redis(cmd) {
  const r = await fetch(REST_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + REST_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || ('storage ' + r.status));
  return j.result;
}
async function load(code) {
  if (LOCAL) { const s = mem.get(code); return s ? JSON.parse(s) : null; }
  const raw = await redis(['GET', 'dt:' + code]);
  return raw ? JSON.parse(raw) : null;
}
const CAS_LUA = "local cur=redis.call('GET',KEYS[1]) if cur then if cjson.decode(cur).v ~= tonumber(ARGV[1]) then return 0 end elseif ARGV[1] ~= '-1' then return 0 end redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]) return 1";
async function store(code, st, expect) {
  st.v = expect + 1;
  const json = JSON.stringify(st);
  if (LOCAL) { const cur = mem.get(code); const cv = cur ? JSON.parse(cur).v : -1; if (cv !== expect) return false; mem.set(code, json); return true; }
  return (await redis(['EVAL', CAS_LUA, '1', 'dt:' + code, String(expect), json, String(TTL)])) === 1;
}

/* ---------- helpers ---------- */
const rnd = () => Math.random();
const clean = (s, fb) => { s = String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); return s || fb; };
function uniqueName(st, name) {
  let n = clean(name, 'Player ' + (st.players.length + 1));
  if (st.players.some(p => p.name.toLowerCase() === n.toLowerCase())) n = n.slice(0, 14) + ' 2';
  return n;
}
const sideOf = (st, me) => (st.sides ? (st.sides.A === me ? 'A' : 'B') : null);
const squad = (st, side) => st.picks.filter((_, i) => draftSide(i) === side);
function beginDraft(st) {
  const first = rnd() < 0.5 ? 0 : 1;
  st.sides = { A: first, B: 1 - first };
  st.picks = []; st.orders = { A: null, B: null }; st.ready = { A: false, B: false };
  st.toss = null; st.sync = null; st.pitch = null; st.seed = null;
  st.round = (st.round || 0) + 1; st.phase = 'draft';
}
function beginToss(st) {
  st.toss = { winner: rnd() < 0.5 ? 'A' : 'B', bat: null };
  let u = rnd(); st.pitch = PITCHES[0][0];
  for (const [k, w] of PITCHES) { if (u < w) { st.pitch = k; break; } u -= w; }
  st.seed = Math.floor(rnd() * 4294967296) >>> 0; st.weather = true; st.phase = 'toss';
}
const samePlayers = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();

/* ---------- actions: mutate st, return an error string or null ---------- */
function act(st, b, now) {
  const me = st.players.findIndex(p => p.pid === b.pid);
  if (b.op === 'join') {
    if (me >= 0) { st._noop = true; return null; }
    if (st.phase !== 'lobby') return 'That game has already started.';
    if (st.players.length >= 2) return 'This room is full.';
    st.players.push({ pid: b.pid, name: uniqueName(st, b.name) });
    return null;
  }
  if (me < 0) return 'You are not in this room.';
  const side = sideOf(st, me);
  switch (b.op) {
    case 'start':
      if (st.phase !== 'lobby') { st._noop = true; return null; }
      if (st.host !== b.pid) return 'Only the host can start the draft.';
      if (st.players.length < 2) return 'Wait for your friend to join first.';
      beginDraft(st); return null;
    case 'again':
      if (st.phase !== 'match') { st._noop = true; return null; }
      beginDraft(st); return null;
    case 'pick': {
      if (st.phase !== 'draft') return 'The draft is not running.';
      if (draftSide(st.picks.length) !== side) return 'It is not your pick.';
      const p = typeof b.id === 'string' && Object.prototype.hasOwnProperty.call(PLAYER_BY_ID, b.id) ? PLAYER_BY_ID[b.id] : null;
      if (!p) return 'Unknown player.';
      if (st.picks.some(id => PLAYER_BY_ID[id].key === p.key)) return 'That player has already been picked.';
      const why = draftBlock(squad(st, side), p);
      if (why) return why + '.';
      st.picks.push(p.id);
      if (st.picks.length === 22) st.phase = 'order';
      return null;
    }
    case 'ready': {
      if (st.phase !== 'order') { st._noop = true; return null; }
      const mine = squad(st, side);
      if (Array.isArray(b.ids)) { if (!samePlayers(b.ids, mine)) return 'That batting order does not match your squad.'; st.orders[side] = b.ids.slice(); }
      else if (!st.orders[side]) st.orders[side] = mine.slice();
      st.ready[side] = true;
      if (st.ready.A && st.ready.B) beginToss(st);
      return null;
    }
    case 'tosschoice':
      if (st.phase !== 'toss') { st._noop = true; return null; }
      if (st.toss.winner !== side) return 'Only the toss winner chooses.';
      st.toss.bat = !!b.bat; st.phase = 'match';
      st.sync = { cursor: 0, playing: true, speed: 'normal', pauseBreaks: true, since: now + 2500 };
      return null;
    case 'sync': {
      if (st.phase !== 'match' || !st.sync) return 'The match has not started.';
      const p = b.patch || {}, s = st.sync;
      if (typeof p.playing === 'boolean') s.playing = p.playing;
      if (typeof p.pauseBreaks === 'boolean') s.pauseBreaks = p.pauseBreaks;
      if (['slow', 'normal', 'fast'].includes(p.speed)) s.speed = p.speed;
      if (Number.isFinite(p.cursor)) s.cursor = Math.max(0, Math.min(20000, Math.floor(p.cursor)));
      s.since = now;
      return null;
    }
    case 'leave':
      if (st.phase === 'lobby') {
        st.players.splice(me, 1);
        if (st.host === b.pid && st.players[0]) st.host = st.players[0].pid;
        return null;
      }
      st._noop = true; return null;
    default: return 'Unknown action.';
  }
}

function view(st, pid, now) {
  const me = st.players.findIndex(p => p.pid === pid);
  const mySide = sideOf(st, me);
  const showOrders = st.phase === 'toss' || st.phase === 'match';
  return {
    code: st.code, v: st.v, phase: st.phase, now, round: st.round || 0,
    you: me, mySide, isHost: st.host === pid,
    players: st.players.map((p, i) => ({ name: p.name, side: sideOf(st, i), ready: st.ready ? !!st.ready[sideOf(st, i)] : false })),
    picks: st.picks || [],
    orders: st.orders ? (showOrders ? st.orders : { A: mySide === 'A' ? st.orders.A : null, B: mySide === 'B' ? st.orders.B : null }) : null,
    toss: st.toss || null, pitch: st.pitch || null, seed: st.seed, weather: st.weather !== false, sync: st.sync || null
  };
}

async function handle(b) {
  const now = Date.now();
  if (b.op === 'create') {
    const pid = String(b.pid || '');
    if (pid.length < 8) return { status: 400, error: 'Missing player id.' };
    for (let i = 0; i < 6; i++) {
      let code = '';
      for (let k = 0; k < 5; k++) code += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)];
      const st = { code, v: 0, phase: 'lobby', created: now, host: pid, players: [{ pid, name: clean(b.name, 'Player 1') }], picks: [], round: 0 };
      if (await store(code, st, -1)) return { state: view(st, pid, now) };
    }
    return { status: 500, error: 'Could not make a room. Try again.' };
  }
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!code) return { status: 400, error: 'Enter a room code.' };
  const pid = String(b.pid || '');
  for (let attempt = 0; attempt < 5; attempt++) {
    const st = await load(code);
    if (!st) return { status: 404, error: 'Room not found. Check the code, or ask your friend to make a new room.' };
    if (b.op === 'get') {
      if (!st.players.some(p => p.pid === pid)) return { status: 403, error: 'You are not in this room.' };
      if (b.v === st.v) return { unchanged: true, now };
      return { state: view(st, pid, now) };
    }
    const before = st.v;
    const err = act(st, Object.assign({}, b, { pid }), now);
    if (err) return { status: 400, error: err };
    if (st._noop) return { state: view(st, pid, now) };
    if (await store(code, st, before)) return { state: view(st, pid, now) };
  }
  return { status: 409, error: 'The room was busy. Try again.' };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ready = LOCAL || !!(REST_URL && REST_TOKEN);
  if (req.method === 'GET') return res.status(200).json({ ok: true, storage: ready });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!ready) return res.status(503).json({ error: 'Online rooms need a Redis database connected to this project.', storage: false });
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const out = await handle(body || {});
    const status = out.status || 200;
    delete out.status;
    return res.status(status).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') });
  }
};
