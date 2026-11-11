// Player database for the Test match simulator.
// Ratings are out of 99. Categories are filled in one at a time.

const PLAYERS = {
  openers: [
    { id: "hobbs",      name: "Jack Hobbs",        role: "opener", rating: 99 },
    { id: "gavaskar",   name: "Sunil Gavaskar",    role: "opener", rating: 98 },
    { id: "cook",       name: "Alastair Cook",     role: "opener", rating: 97 },
    { id: "hutton",     name: "Len Hutton",        role: "opener", rating: 97 },
    { id: "hayden",     name: "Matthew Hayden",    role: "opener", rating: 96 },
    { id: "sutcliffe",  name: "Herbert Sutcliffe", role: "opener", rating: 96 },
    { id: "greenidge",  name: "Gordon Greenidge",  role: "opener", rating: 95 },
    { id: "sehwag",     name: "Virender Sehwag",   role: "opener", rating: 95 },
    { id: "gsmith",     name: "Graeme Smith",      role: "opener", rating: 95 },
    { id: "ponsford",   name: "Bill Ponsford",     role: "opener", rating: 94 }
  ],
  batters: [ // middle-order batters
    { id: "bradman",      name: "Don Bradman",            role: "batter", rating: 99 },
    { id: "tendulkar",    name: "Sachin Tendulkar",       role: "batter", rating: 99 },
    { id: "sobers",       name: "Garfield Sobers",        role: "batter", rating: 98 },
    { id: "lara",         name: "Brian Lara",             role: "batter", rating: 98 },
    { id: "ssmith",       name: "Steve Smith",            role: "batter", rating: 98 },
    { id: "richards",     name: "Viv Richards",           role: "batter", rating: 97 },
    { id: "sangakkara",   name: "Kumar Sangakkara",       role: "batter", rating: 97 },
    { id: "ponting",      name: "Ricky Ponting",          role: "batter", rating: 97 },
    { id: "kallis",       name: "Jacques Kallis",         role: "batter", rating: 97 },
    { id: "dravid",       name: "Rahul Dravid",           role: "batter", rating: 96 },
    { id: "gchappell",    name: "Greg Chappell",          role: "batter", rating: 96 },
    { id: "hammond",      name: "Wally Hammond",          role: "batter", rating: 96 },
    { id: "root",         name: "Joe Root",               role: "batter", rating: 96 },
    { id: "pollock",      name: "Graeme Pollock",         role: "batter", rating: 96 },
    { id: "border",       name: "Allan Border",           role: "batter", rating: 95 },
    { id: "swaugh",       name: "Steve Waugh",            role: "batter", rating: 95 },
    { id: "younis",       name: "Younis Khan",            role: "batter", rating: 95 },
    { id: "miandad",      name: "Javed Miandad",          role: "batter", rating: 95 },
    { id: "williamson",   name: "Kane Williamson",        role: "batter", rating: 95 },
    { id: "abd",          name: "AB de Villiers",         role: "batter", rating: 95 },
    { id: "mahela",       name: "Mahela Jayawardene",     role: "batter", rating: 94 },
    { id: "inzamam",      name: "Inzamam-ul-Haq",         role: "batter", rating: 94 },
    { id: "chanderpaul",  name: "Shivnarine Chanderpaul", role: "batter", rating: 94 },
    { id: "barrington",   name: "Ken Barrington",         role: "batter", rating: 94 },
    { id: "clarke",       name: "Michael Clarke",         role: "batter", rating: 93 },
    { id: "laxman",       name: "VVS Laxman",             role: "batter", rating: 93 },
    { id: "pietersen",    name: "Kevin Pietersen",        role: "batter", rating: 93 },
    { id: "mathews",      name: "Angelo Mathews",         role: "batter", rating: 92 },
    { id: "misbah",       name: "Misbah-ul-Haq",          role: "batter", rating: 92 },
    { id: "amla",         name: "Hashim Amla",            role: "batter", rating: 92 }
  ],
  wicketkeepers: [
    { id: "gilchrist",     name: "Adam Gilchrist",   role: "wk", rating: 99 },
    { id: "knott",         name: "Alan Knott",       role: "wk", rating: 98 },
    { id: "dhoni",         name: "MS Dhoni",         role: "wk", rating: 96 },
    // Same person as "sangakkara" in batters; sameAs lets the team builder block picking him twice
    { id: "sangakkara_wk", name: "Kumar Sangakkara", role: "wk", rating: 96, sameAs: "sangakkara" },
    { id: "healy",         name: "Ian Healy",        role: "wk", rating: 96 },
    { id: "aflower",       name: "Andy Flower",      role: "wk", rating: 95 },
    { id: "evans",         name: "Godfrey Evans",    role: "wk", rating: 95 },
    { id: "ames",          name: "Les Ames",         role: "wk", rating: 95 },
    { id: "stewart",       name: "Alec Stewart",     role: "wk", rating: 94 },
    { id: "boucher",       name: "Mark Boucher",     role: "wk", rating: 94 },
    { id: "dujon",         name: "Jeff Dujon",       role: "wk", rating: 94 },
    { id: "haddin",        name: "Brad Haddin",      role: "wk", rating: 93 },
    { id: "prior",         name: "Matt Prior",       role: "wk", rating: 93 },
    { id: "pant",          name: "Rishabh Pant",     role: "wk", rating: 93 },
    { id: "engineer",      name: "Farokh Engineer",  role: "wk", rating: 92 }
  ],
  allrounders: [
    // sameAs links an entry to the same person in another category (blocks double-picking)
    { id: "sobers_ar",   name: "Garfield Sobers",     role: "allrounder", rating: 99, sameAs: "sobers" },
    { id: "kallis_ar",   name: "Jacques Kallis",      role: "allrounder", rating: 99, sameAs: "kallis" },
    { id: "imran",       name: "Imran Khan",          role: "allrounder", rating: 98 },
    { id: "miller",      name: "Keith Miller",        role: "allrounder", rating: 97 },
    { id: "botham",      name: "Ian Botham",          role: "allrounder", rating: 97 },
    { id: "kapil",       name: "Kapil Dev",           role: "allrounder", rating: 97 },
    { id: "hadlee",      name: "Richard Hadlee",      role: "allrounder", rating: 97 },
    { id: "spollock",    name: "Shaun Pollock",       role: "allrounder", rating: 96 },
    { id: "ashwin",      name: "Ravichandran Ashwin", role: "allrounder", rating: 96 },
    { id: "shakib",      name: "Shakib Al Hasan",     role: "allrounder", rating: 96 },
    { id: "greig",       name: "Tony Greig",          role: "allrounder", rating: 95 },
    { id: "vettori",     name: "Daniel Vettori",      role: "allrounder", rating: 95 },
    { id: "flintoff",    name: "Andrew Flintoff",     role: "allrounder", rating: 94 },
    { id: "cairns",      name: "Chris Cairns",        role: "allrounder", rating: 94 },
    { id: "razzaq",      name: "Abdul Razzaq",        role: "allrounder", rating: 93 },
    { id: "mushtaq",     name: "Mushtaq Mohammad",    role: "allrounder", rating: 93 },
    { id: "rhodes",      name: "Wilfred Rhodes",      role: "allrounder", rating: 93 },
    { id: "noble",       name: "Monty Noble",         role: "allrounder", rating: 92 },
    { id: "bailey",      name: "Trevor Bailey",       role: "allrounder", rating: 92 },
    { id: "benaud",      name: "Richie Benaud",       role: "allrounder", rating: 92 }
  ],
  spinners: [
    { id: "murali",      name: "Muttiah Muralitharan", role: "spinner", rating: 99 },
    { id: "warne",       name: "Shane Warne",          role: "spinner", rating: 99 },
    { id: "kumble",      name: "Anil Kumble",          role: "spinner", rating: 97 },
    { id: "ashwin_sp",   name: "Ravichandran Ashwin",  role: "spinner", rating: 97, sameAs: "ashwin" },
    { id: "laker",       name: "Jim Laker",            role: "spinner", rating: 96 },
    { id: "grimmett",    name: "Clarrie Grimmett",     role: "spinner", rating: 96 },
    { id: "herath",      name: "Rangana Herath",       role: "spinner", rating: 95 },
    { id: "bedi",        name: "Bishan Singh Bedi",    role: "spinner", rating: 95 },
    { id: "saqlain",     name: "Saqlain Mushtaq",      role: "spinner", rating: 94 },
    { id: "underwood",   name: "Derek Underwood",      role: "spinner", rating: 94 },
    { id: "jadeja",      name: "Ravindra Jadeja",      role: "spinner", rating: 94 },
    { id: "harbhajan",   name: "Harbhajan Singh",      role: "spinner", rating: 93 },
    { id: "vettori_sp",  name: "Daniel Vettori",       role: "spinner", rating: 93, sameAs: "vettori" },
    { id: "prasanna",    name: "EAS Prasanna",         role: "spinner", rating: 92 },
    { id: "qadir",       name: "Abdul Qadir",          role: "spinner", rating: 92 }
  ],
  pacers: [
    { id: "marshall",    name: "Malcolm Marshall", role: "pacer", rating: 99 },
    { id: "wasim",       name: "Wasim Akram",      role: "pacer", rating: 99 },
    { id: "mcgrath",     name: "Glenn McGrath",    role: "pacer", rating: 98 },
    { id: "lillee",      name: "Dennis Lillee",    role: "pacer", rating: 98 },
    { id: "hadlee_pc",   name: "Richard Hadlee",   role: "pacer", rating: 98, sameAs: "hadlee" },
    { id: "ambrose",     name: "Curtly Ambrose",   role: "pacer", rating: 97 },
    { id: "imran_pc",    name: "Imran Khan",       role: "pacer", rating: 97, sameAs: "imran" },
    { id: "steyn",       name: "Dale Steyn",       role: "pacer", rating: 97 },
    { id: "waqar",       name: "Waqar Younis",     role: "pacer", rating: 96 },
    { id: "barnes",      name: "Sydney Barnes",    role: "pacer", rating: 96 },
    { id: "garner",      name: "Joel Garner",      role: "pacer", rating: 96 },
    { id: "trueman",     name: "Fred Trueman",     role: "pacer", rating: 95 },
    { id: "walsh",       name: "Courtney Walsh",   role: "pacer", rating: 95 },
    { id: "spollock_pc", name: "Shaun Pollock",    role: "pacer", rating: 95, sameAs: "spollock" },
    { id: "roberts",     name: "Andy Roberts",     role: "pacer", rating: 95 },
    { id: "holding",     name: "Michael Holding",  role: "pacer", rating: 95 },
    { id: "donald",      name: "Allan Donald",     role: "pacer", rating: 94 },
    { id: "willis",      name: "Bob Willis",       role: "pacer", rating: 94 },
    { id: "anderson",    name: "James Anderson",   role: "pacer", rating: 94 },
    { id: "vaas",        name: "Chaminda Vaas",    role: "pacer", rating: 93 }
  ]
};

;
// profiles.js
// Turns the raw rating entries in players.js into simulation-ready players.
//
// Each person gets: bat (0-99 batting skill), bowl (0-99 bowling skill, 0 = does not bowl),
// type ('pace' | 'spin'), style, aggr (0-1, how fast they like to score).
// Specialists keep the rating you gave them as their main skill. Everyone else
// (all-rounder split, tail-end batting, part-time bowling) comes from the table below.
//
// Fields: b = batting skill, w = bowling skill, t = bowling type, s = style, a = aggression

const PERSON = {
  // ---- Openers (bat = category rating) ----
  hobbs: { a: .45 }, gavaskar: { a: .30 }, cook: { a: .25 }, hutton: { a: .35 },
  hayden: { a: .80 }, sutcliffe: { a: .30 }, greenidge: { a: .75 },
  sehwag: { a: .97, w: 52, t: 'spin', s: 'OB' }, gsmith: { a: .50 }, ponsford: { a: .45 },

  // ---- Middle-order batters (bat = category rating; w = part-time bowling) ----
  bradman: { a: .80 }, tendulkar: { a: .60, w: 50, t: 'spin', s: 'LB' },
  sobers: { b: 98, w: 90, t: 'pace', s: 'LF/SLA', a: .65 }, lara: { a: .85 },
  ssmith: { a: .45, w: 55, t: 'spin', s: 'LB' }, richards: { a: .95, w: 50, t: 'spin', s: 'OB' },
  sangakkara: { b: 97, a: .60 }, ponting: { a: .70 },
  kallis: { b: 97, w: 85, t: 'pace', s: 'RFM', a: .35 }, dravid: { a: .20 },
  gchappell: { a: .55, w: 50, t: 'pace', s: 'RM' }, hammond: { a: .60, w: 55, t: 'pace', s: 'RM' },
  root: { a: .50, w: 55, t: 'spin', s: 'OB' }, pollock: { a: .55 },
  border: { a: .35, w: 50, t: 'spin', s: 'SLA' }, swaugh: { a: .50, w: 52, t: 'pace', s: 'RM' },
  younis: { a: .45 }, miandad: { a: .65, w: 40, t: 'spin', s: 'LB' },
  williamson: { a: .35, w: 50, t: 'spin', s: 'OB' }, abd: { a: .85 }, mahela: { a: .60 },
  inzamam: { a: .45 }, chanderpaul: { a: .10 }, barrington: { a: .30, w: 50, t: 'spin', s: 'LB' },
  clarke: { a: .65, w: 55, t: 'spin', s: 'SLA' }, laxman: { a: .60 },
  pietersen: { a: .80, w: 45, t: 'spin', s: 'OB' }, mathews: { a: .45, w: 62, t: 'pace', s: 'RM' },
  misbah: { a: .30 }, amla: { a: .30 },

  // ---- Wicketkeepers (keeping skill = category rating, batting set here) ----
  gilchrist: { b: 97, a: .90 }, knott: { b: 88, a: .55 }, dhoni: { b: 90, a: .60 },
  healy: { b: 86, a: .60 }, aflower: { b: 93, a: .40 }, evans: { b: 72, a: .65 },
  ames: { b: 90, a: .60 }, stewart: { b: 86, a: .55 }, boucher: { b: 82, a: .55 },
  dujon: { b: 86, a: .50 }, haddin: { b: 80, a: .65 }, prior: { b: 82, a: .50 },
  pant: { b: 90, a: .90 }, engineer: { b: 82, a: .80 },

  // ---- All-rounders (batting and bowling split) ----
  imran: { b: 82, w: 97, t: 'pace', s: 'RF', a: .55 }, miller: { b: 87, w: 90, t: 'pace', s: 'RF', a: .75 },
  botham: { b: 88, w: 90, t: 'pace', s: 'RFM', a: .90 }, kapil: { b: 80, w: 90, t: 'pace', s: 'RFM', a: .85 },
  hadlee: { b: 78, w: 97, t: 'pace', s: 'RFM', a: .50 }, spollock: { b: 80, w: 94, t: 'pace', s: 'RFM', a: .40 },
  ashwin: { b: 78, w: 96, t: 'spin', s: 'OB', a: .40 }, shakib: { b: 85, w: 90, t: 'spin', s: 'SLA', a: .55 },
  greig: { b: 86, w: 78, t: 'pace', s: 'RM/OB', a: .60 }, vettori: { b: 70, w: 92, t: 'spin', s: 'SLA', a: .35 },
  flintoff: { b: 82, w: 88, t: 'pace', s: 'RF', a: .75 }, cairns: { b: 80, w: 84, t: 'pace', s: 'RFM', a: .80 },
  razzaq: { b: 79, w: 80, t: 'pace', s: 'RFM', a: .80 }, mushtaq: { b: 84, w: 78, t: 'spin', s: 'LB', a: .60 },
  rhodes: { b: 72, w: 92, t: 'spin', s: 'SLA', a: .20 }, noble: { b: 80, w: 88, t: 'spin', s: 'OB', a: .40 },
  bailey: { b: 78, w: 78, t: 'pace', s: 'RM', a: .05 }, benaud: { b: 68, w: 88, t: 'spin', s: 'LB', a: .60 },

  // ---- Spinners (bowl = category rating, batting set here) ----
  murali: { b: 20, s: 'OB', a: .70 }, warne: { b: 52, s: 'LB', a: .70 }, kumble: { b: 48, s: 'LB', a: .40 },
  laker: { b: 38, s: 'OB', a: .35 }, grimmett: { b: 28, s: 'LB', a: .30 }, herath: { b: 35, s: 'SLA', a: .40 },
  bedi: { b: 18, s: 'SLA', a: .30 }, saqlain: { b: 40, s: 'OB', a: .50 }, underwood: { b: 22, s: 'SLA', a: .30 },
  jadeja: { b: 76, s: 'SLA', a: .60 }, harbhajan: { b: 52, s: 'OB', a: .70 }, prasanna: { b: 30, s: 'OB', a: .35 },
  qadir: { b: 32, s: 'LB', a: .50 },

  // ---- Pacers (bowl = category rating, batting set here) ----
  marshall: { b: 58, s: 'RF', a: .60 }, wasim: { b: 64, s: 'LF', a: .75 }, mcgrath: { b: 12, s: 'RFM', a: .30 },
  lillee: { b: 45, s: 'RF', a: .60 }, ambrose: { b: 34, s: 'RF', a: .40 }, steyn: { b: 36, s: 'RF', a: .50 },
  waqar: { b: 33, s: 'RF', a: .50 }, barnes: { b: 30, s: 'RFM', a: .30 }, garner: { b: 38, s: 'RF', a: .60 },
  trueman: { b: 45, s: 'RF', a: .60 }, walsh: { b: 8, s: 'RFM', a: .25 }, roberts: { b: 40, s: 'RF', a: .50 },
  holding: { b: 22, s: 'RF', a: .40 }, donald: { b: 25, s: 'RF', a: .40 }, willis: { b: 20, s: 'RF', a: .40 },
  anderson: { b: 12, s: 'RFM', a: .25 }, vaas: { b: 52, s: 'LFM', a: .50 }
};

// Surname shown on scorecards where the plain last word would be unclear
const SHORT = {
  abd: 'de Villiers', mahela: 'Jayawardene', gsmith: 'G Smith', ssmith: 'S Smith', swaugh: 'S Waugh',
  gchappell: 'G Chappell', spollock: 'S Pollock', pollock: 'G Pollock', saqlain: 'Saqlain',
  mushtaq: 'M Mohammad', bedi: 'Bedi', murali: 'Muralitharan', kumble: 'Kumble', aflower: 'A Flower',
  imran: 'Imran', kapil: 'Kapil Dev', hadlee: 'Hadlee', shakib: 'Shakib', misbah: 'Misbah',
  inzamam: 'Inzamam', younis: 'Younis', waqar: 'Waqar', wasim: 'Wasim', dhoni: 'Dhoni',
  hobbs: 'Hobbs', prasanna: 'Prasanna', engineer: 'Engineer'
};

const STYLE_NAME = {
  RF: 'Right-arm fast', LF: 'Left-arm fast', RFM: 'Right-arm fast-medium', LFM: 'Left-arm fast-medium',
  RM: 'Right-arm medium', 'RM/OB': 'Medium / off-spin', 'LF/SLA': 'Left-arm pace & spin',
  OB: 'Off-spin', LB: 'Leg-spin', SLA: 'Slow left-arm'
};

const ROLE_LABEL = {
  opener: 'Opener', batter: 'Batter', wk: 'Wicketkeeper',
  allrounder: 'All-rounder', spinner: 'Spinner', pacer: 'Pacer'
};
const ROLE_ORDER = ['opener', 'batter', 'wk', 'allrounder', 'spinner', 'pacer'];
const DEFAULT_AGGR = { opener: .5, batter: .5, wk: .55, allrounder: .55, spinner: .35, pacer: .4 };

function buildPlayerList() {
  const all = [];
  for (const cat of Object.keys(PLAYERS)) {
    for (const p of PLAYERS[cat]) {
      const key = p.sameAs || p.id;
      const d = PERSON[key] || {};
      const bat = d.b != null ? d.b : ((p.role === 'opener' || p.role === 'batter') ? p.rating : 40);
      let bowl = 0, type = null;
      if (p.role === 'spinner') { bowl = p.rating; type = 'spin'; }
      else if (p.role === 'pacer') { bowl = p.rating; type = 'pace'; }
      else if (d.w) { bowl = d.w; type = d.t; }
      let style = d.s || '';
      if (!style && type) style = type === 'spin' ? 'OB' : 'RFM';
      const parts = p.name.split(' ');
      all.push({
        id: p.id, key, name: p.name, role: p.role, rating: p.rating,
        short: SHORT[key] || parts[parts.length - 1],
        bat, bowl, type, style,
        aggr: d.a != null ? d.a : DEFAULT_AGGR[p.role],
        keep: p.role === 'wk' ? p.rating : 0
      });
    }
  }
  return all;
}

const ALL_PLAYERS = buildPlayerList();
const PLAYER_BY_ID = {};
for (const p of ALL_PLAYERS) PLAYER_BY_ID[p.id] = p;

// A player counts as a proper bowling option from this skill up (below it = part-timer)
const BOWLING_OPTION_MIN = 65;

function canBowl(p) { return p.bowl >= BOWLING_OPTION_MIN; }

// Batting order: best two openers open, then everyone by batting skill,
// keepers and all-rounders nudged down a little so they sit at 6-8 like real sides.
function autoOrder(xi) {
  const players = xi.slice();
  const openers = players.filter(p => p.role === 'opener').sort((a, b) => b.rating - a.rating);
  let open;
  if (openers.length >= 2) open = openers.slice(0, 2);
  else {
    const rest = players.filter(p => p.role !== 'opener' && p.role !== 'wk' && p.bat >= 85).sort((a, b) => b.bat - a.bat);
    open = openers.concat(rest).slice(0, 2);
  }
  const openIds = new Set(open.map(p => p.id));
  const weight = p => p.bat - (p.role === 'wk' ? 7 : 0) - (p.role === 'allrounder' ? 3 : 0);
  const others = players.filter(p => !openIds.has(p.id)).sort((a, b) => weight(b) - weight(a));
  return open.concat(others);
}

function validateXI(xi) {
  const problems = [];
  const keys = new Set(xi.map(p => p.key));
  if (xi.length !== 11) problems.push(xi.length < 11 ? `Pick ${11 - xi.length} more player${11 - xi.length === 1 ? '' : 's'}` : 'Too many players');
  if (keys.size !== xi.length) problems.push('Same player picked twice');
  if (!xi.some(p => p.role === 'wk')) problems.push('Need a wicketkeeper');
  const bowlers = xi.filter(canBowl).length;
  if (bowlers < 4) problems.push(`Need ${4 - bowlers} more bowling option${4 - bowlers === 1 ? '' : 's'}`);
  return { ok: problems.length === 0, problems, bowlers };
}

// Balanced random XI (2 openers, 3 batters, 1 keeper, 2 all-rounders, 1 spinner, 2 pacers),
// leaning towards the higher rated players.
function autoPick(rng, takenKeys) {
  const keys = new Set(takenKeys || []);
  const need = [['opener', 2], ['batter', 3], ['wk', 1], ['allrounder', 2], ['spinner', 1], ['pacer', 2]];
  const picked = [];
  for (const [role, n] of need) {
    for (let i = 0; i < n; i++) {
      const pool = ALL_PLAYERS.filter(p => p.role === role && !keys.has(p.key));
      if (!pool.length) continue;
      const w = pool.map(p => Math.exp((p.rating - 96) / 2.2));
      let u = rng() * w.reduce((a, b) => a + b, 0), idx = 0;
      for (; idx < pool.length - 1; idx++) { if (u < w[idx]) break; u -= w[idx]; }
      picked.push(pool[idx]);
      keys.add(pool[idx].key);
    }
  }
  return autoOrder(picked);
}

// ---- Snake draft rules (shared by the browser and the room server) ----
// Pick 1 goes to A, then B takes two, A takes two, and so on. Over 22 picks each side gets 11.
function draftSide(i) { return i === 0 ? 'A' : (Math.floor((i - 1) / 2) % 2 === 0 ? 'B' : 'A'); }

// Returns why this pick would leave the side unable to finish a legal XI, or '' if it is fine.
function draftBlock(ids, p) {
  const xi = ids.map(id => PLAYER_BY_ID[id]).concat([p]);
  const left = 11 - xi.length;
  const needK = xi.some(x => x.role === 'wk') ? 0 : 1;
  const needB = Math.max(0, 4 - xi.filter(canBowl).length);
  if (left >= needK + needB) return '';
  if (needK && needB) return 'Leaves no room for a keeper and ' + needB + ' bowler' + (needB === 1 ? '' : 's');
  if (needK) return 'You still need a keeper';
  return 'You still need ' + needB + ' bowling option' + (needB === 1 ? '' : 's');
}

module.exports={PLAYERS,ALL_PLAYERS,PLAYER_BY_ID,autoOrder,validateXI,canBowl,draftSide,draftBlock};
