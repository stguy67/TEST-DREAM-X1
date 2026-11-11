// engine.js
// Over-by-over Test match simulator. Ball-by-ball inside each over.
//
// Core idea: every batter has an "average" (from batting skill) and every bowler an "average"
// (from bowling skill). A matchup average is  batAvg * bowlAvg / 30  (30 = league average),
// and the chance of a wicket on a ball is  (expected runs per ball) / (matchup average).
// Pitch, ball age, fatigue, settling in, collapses and batting tempo all bend those numbers.

const Engine = (function () {
  'use strict';

  const TUNE = { HZ: 0.72, L: 30 };

  /* ---------- helpers ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function interp(tbl, x) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (x <= tbl[i][0]) {
        const [x0, y0] = tbl[i - 1], [x1, y1] = tbl[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return tbl[tbl.length - 1][1];
  }
  const fmtOvers = b => Math.floor(b / 6) + '.' + (b % 6);

  // batting skill -> batting average; bowling skill -> bowling average
  const BAT_AVG = [[0, 3], [10, 6], [25, 13], [40, 20], [55, 27], [70, 34], [80, 40], [88, 46], [92, 50], [95, 55], [97, 60], [99, 68]];
  const BOWL_AVG = [[0, 200], [30, 95], [40, 72], [50, 53], [60, 42], [70, 34], [80, 28], [90, 24], [95, 21.5], [99, 19.5]];

  /* ---------- runs per ball: tilted distribution ---------- */
  const RUN_VALUES = [0, 1, 2, 3, 4, 6];
  const RUN_BASE = [0.69, 0.19, 0.03, 0.003, 0.055, 0.005];
  const RUN_TABLE = [];
  (function buildRunTable() {
    const tilted = lam => {
      const w = RUN_VALUES.map((r, i) => RUN_BASE[i] * Math.exp(lam * r));
      const s = w.reduce((a, b) => a + b, 0);
      return w.map(x => x / s);
    };
    const mean = d => d.reduce((a, p, i) => a + p * RUN_VALUES[i], 0);
    for (let k = 10; k <= 140; k++) {
      let lo = -4, hi = 4;
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2;
        if (mean(tilted(mid)) < k / 100) lo = mid; else hi = mid;
      }
      const d = tilted((lo + hi) / 2);
      let c = 0;
      RUN_TABLE[k] = d.map(p => (c += p));
    }
  })();
  function sampleRuns(r, u) {
    const cum = RUN_TABLE[clamp(Math.round(r * 100), 10, 140)];
    for (let i = 0; i < cum.length; i++) if (u < cum[i]) return RUN_VALUES[i];
    return 6;
  }

  /* ---------- pitches ---------- */
  // pace / spin: [value on day 1, change by the end of the match]; run = scoring factor; haz = wicket factor
  const PITCHES = {
    balanced: { name: 'Balanced', blurb: 'Something for everyone', pace: [1.00, -0.04], spin: [0.98, 0.20], run: 1.00, haz: 1.00 },
    flat: { name: 'Flat road', blurb: 'Runs galore, bowlers toil', pace: [0.96, -0.03], spin: [0.92, 0.12], run: 1.08, haz: 0.90 },
    green: { name: 'Green seamer', blurb: 'Seam and swing early on', pace: [1.18, -0.16], spin: [0.86, 0.10], run: 0.93, haz: 1.10 },
    dusty: { name: 'Dust bowl', blurb: 'Turns square from day one', pace: [0.93, -0.03], spin: [1.04, 0.34], run: 0.95, haz: 1.06 },
    bouncy: { name: 'Bouncy and quick', blurb: 'Pace and bounce throughout', pace: [1.12, -0.04], spin: [0.90, 0.10], run: 1.00, haz: 1.02 }
  };
  function pickPitch(rng) {
    const u = rng();
    return u < .30 ? 'balanced' : u < .50 ? 'flat' : u < .68 ? 'green' : u < .84 ? 'dusty' : 'bouncy';
  }

  // batting tempo
  const MODES = {
    defend: { run: 0.62, haz: 0.82, label: 'Defending' },
    normal: { run: 1.00, haz: 1.00, label: 'Normal' },
    chase: { run: 1.08, haz: 1.05, label: 'Chasing' },
    aggressive: { run: 1.28, haz: 1.20, label: 'Attacking' }
  };

  const PACE_HOW = [['b', .21], ['lbw', .20], ['ct', .18], ['cf', .33], ['cb', .03], ['ro', .04], ['hw', .01]];
  const SPIN_HOW = [['b', .16], ['lbw', .25], ['st', .11], ['ct', .05], ['cf', .34], ['cb', .05], ['ro', .03], ['hw', .01]];

  const MILESTONES = [[50, 'a fifty'], [100, 'a hundred'], [150, '150'], [200, 'a double century'], [250, '250'], [300, 'a triple century'], [350, '350'], [400, '400']];

  const newBall = age => 1 + 0.14 * Math.exp(-age / 10);
  const fatMult = (f, p) => 1 + 0.03 * Math.max(0, f.tired - (p.type === 'spin' ? 11 : 7));

  /* ---------- the match ---------- */
  class Match {
    constructor(teamA, teamB, opts) {
      opts = opts || {};
      this.opts = opts;
      this.seed = opts.seed != null ? opts.seed : (Math.random() * 4294967296) >>> 0;
      this.rng = mulberry32(this.seed);
      this.teams = [teamA, teamB].map((t, i) => ({
        idx: i, name: t.name || ('Team ' + 'AB'[i]), xi: t.players.slice(),
        fatigue: {}, field: {}, capAggr: 0.88 + this.rng() * 0.28
      }));
      for (const t of this.teams) {
        t.keeper = t.xi.find(p => p.role === 'wk') || t.xi[t.xi.length - 1];
      }
      const pk = opts.pitch && opts.pitch !== 'random' && PITCHES[opts.pitch] ? opts.pitch : pickPitch(this.rng);
      this.pitchKey = pk;
      this.pitch = PITCHES[pk];
      this.weather = opts.weather !== false;
      this.day = 0; this.dayBalls = 0; this.dayLimitBalls = 540;
      this.lunchDone = false; this.teaDone = false;
      this.matchBalls = 0;
      this.inns = []; this.cur = null;
      this.phase = 'pre'; this.finished = false; this.result = null;
      this.followOn = false; this.firstBat = null; this.toss = null;
      this.log = [];
    }

    gauss() {
      const u = Math.max(1e-9, this.rng()), v = this.rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    oversLeft() {
      return Math.max(0, ((this.dayLimitBalls - this.dayBalls) + (5 - this.day) * 540) / 6);
    }
    aids() {
      const w = clamp((Math.max(0, this.day - 1) + this.dayBalls / 540) / 5, 0, 1);
      const p = this.pitch;
      return { pace: p.pace[0] + p.pace[1] * w, spin: p.spin[0] + p.spin[1] * w };
    }
    total(teamIdx) { return this.inns.filter(i => i.bat === teamIdx).reduce((a, i) => a + i.runs, 0); }
    fat(team, p) { return team.fatigue[p.id] || (team.fatigue[p.id] = { tired: 0, spell: 0, rest: 99 }); }
    session() { return this.dayBalls < 180 ? 1 : this.dayBalls < 360 ? 2 : 3; }

    /* ----- public stepping ----- */
    step() {
      const out = [];
      if (this.finished) return out;
      if (this.phase === 'pre') {
        this.doToss(out);
        this.startDay(out);
        this.phase = 'play';
      }
      let played = false, guard = 0;
      while (!played && !this.finished && guard++ < 6) {
        if (!this.cur) this.startInnings(out);
        if (this.finished) break;
        played = this.playOver(out);
      }
      this.postOver(out);
      for (const e of out) this.log.push(e);
      return out;
    }

    // until: 'over' | 'session' | 'day' | 'innings' | 'end'
    run(until) {
      const all = [];
      for (let i = 0; i < 6000 && !this.finished; i++) {
        const out = this.step();
        for (const e of out) all.push(e);
        if (until === 'over') break;
        const kinds = out.filter(e => e.t === 'break' || e.t === 'inningsEnd' || e.t === 'result').map(e => e.kind || e.t);
        if (until === 'session' && kinds.length) break;
        if (until === 'day' && out.some(e => (e.t === 'break' && e.kind === 'stumps') || e.t === 'result')) break;
        if (until === 'innings' && out.some(e => e.t === 'inningsEnd' || e.t === 'result')) break;
      }
      return all;
    }

    /* ----- toss, days, innings ----- */
    doToss(out) {
      const rng = this.rng, pk = this.pitchKey;
      let text;
      if (this.opts.firstBat === 0 || this.opts.firstBat === 1) {
        this.firstBat = this.opts.firstBat;
        this.toss = { winner: null };
        text = `${this.teams[this.firstBat].name} will bat first on a ${this.pitch.name.toLowerCase()} pitch.`;
      } else {
        const w = rng() < 0.5 ? 0 : 1;
        const batProb = { green: 0.35, dusty: 0.80, flat: 0.88, bouncy: 0.50, balanced: 0.65 }[pk];
        const bat = rng() < batProb;
        this.firstBat = bat ? w : 1 - w;
        this.toss = { winner: w, bat };
        text = `${this.teams[w].name} win the toss and elect to ${bat ? 'bat' : 'bowl'} first on a ${this.pitch.name.toLowerCase()} pitch.`;
      }
      out.push({ t: 'toss', text, pitch: this.pitch.name, pitchBlurb: this.pitch.blurb });
    }

    startDay(out) {
      for (; ;) {
        this.day++;
        if (this.day > 5) { this.finishDraw(out); return; }
        this.dayBalls = 0; this.lunchDone = false; this.teaDone = false;
        let lost = 0;
        if (this.weather) {
          if (this.rng() < 0.13) {
            lost = Math.round(10 + this.rng() * 45);
            if (this.rng() < 0.04) lost = 90;
          }
        }
        this.dayLimitBalls = (90 - lost) * 6;
        for (const t of this.teams) for (const k in t.fatigue) { t.fatigue[k].tired *= 0.4; t.fatigue[k].spell = 0; }
        out.push({
          t: 'day', day: this.day, lost,
          text: lost >= 90 ? `Day ${this.day}: washed out by rain, no play possible.`
            : lost ? `Day ${this.day}: rain delays play, ${lost} overs lost.`
              : `Day ${this.day}: play begins.`
        });
        if (lost >= 90) continue;
        return;
      }
    }

    startInnings(out) {
      const no = this.inns.length + 1;
      let bat;
      if (no === 1) bat = this.firstBat;
      else if (no === 2) bat = 1 - this.firstBat;
      else if (no === 3) bat = this.followOn ? 1 - this.firstBat : this.firstBat;
      else bat = this.followOn ? this.firstBat : 1 - this.firstBat;
      const bt = this.teams[bat], ft = this.teams[1 - bat];
      let target = null;
      if (no === 4) {
        const own = this.total(bat), opp = this.total(1 - bat);
        target = opp - own + 1;
      }
      const inn = {
        no, bat, bowl: 1 - bat, runs: 0, wkts: 0, balls: 0,
        extras: { b: 0, lb: 0, w: 0, nb: 0 },
        batters: bt.xi.map(p => ({ p, runs: 0, balls: 0, fours: 0, sixes: 0, out: null, in: false, mile: 0, form: Math.exp(0.20 * this.gauss()) })),
        fow: [], bowlers: {}, bowlOrder: [], seq: [], wktBalls: [],
        declared: false, end: null, ended: null, target, ballAge: 0,
        striker: 0, nonStriker: 1, next: 2, part: { runs: 0, balls: 0 }, prevBowlerId: null, overs: 0, mode: 'normal'
      };
      inn.batters[0].in = true; inn.batters[1].in = true;
      this.inns.push(inn);
      this.cur = inn;
      for (const k in ft.fatigue) ft.fatigue[k].spell = 0;
      let text = `Innings ${no}: ${bt.name} to bat`;
      if (no === 3 && this.followOn) text = `Innings 3: ${bt.name} follow on`;
      if (no === 4) text += `, chasing ${target} to win`;
      out.push({ t: 'innings', no, bat: bt.name, bowl: ft.name, target, text, day: this.day });
    }

    /* ----- AI decisions ----- */
    tempo(inn) {
      const left = this.oversLeft();
      if (inn.no === 4) {
        const need = inn.target - inn.runs, wih = 10 - inn.wkts;
        if (need <= 0) return 'normal';
        const rr = need / Math.max(left, 0.5);
        if (left < 6) return rr > 7 ? 'defend' : 'aggressive';
        if (wih <= 3 && rr > 3) return 'defend';
        if (rr <= 3.0) return 'chase';
        if (rr <= 4.4) return wih >= 6 ? 'aggressive' : 'normal';
        if (rr <= 6.0) return wih >= 7 ? 'aggressive' : 'defend';
        return 'defend';
      }
      if (inn.no === 3) {
        const lead = this.total(inn.bat) - this.total(inn.bowl);
        if (lead < 0) return left < 210 ? 'defend' : 'normal';
        if (lead > 120 && left < 170) return 'aggressive';
      }
      if (inn.no === 2 && this.day >= 4 && left < 150) return 'defend';
      return 'normal';
    }

    shouldDeclare(inn) {
      const cap = this.teams[inn.bat].capAggr, left = this.oversLeft();
      if (inn.no === 1) {
        return inn.runs >= 700 || (inn.runs >= 520 * cap && this.day >= 2 && left <= 255);
      }
      if (inn.no === 3 && !this.followOn) {
        const lead = this.total(inn.bat) - this.total(inn.bowl);
        const rules = [[320, 110], [390, 90], [460, 70], [540, 55]];
        return rules.some(([l, o]) => lead >= l * cap && left >= o);
      }
      return false;
    }

    pickBowler(inn, ft) {
      const rng = this.rng, aids = this.aids();
      let best = null, bs = -1;
      for (const p of ft.xi) {
        if (p.bowl < 30 || p.id === inn.prevBowlerId) continue;
        const f = this.fat(ft, p), spin = p.type === 'spin';
        const aid = spin ? aids.spin : aids.pace * newBall(inn.ballAge);
        let s = 1 / (interp(BOWL_AVG, p.bowl) / aid * fatMult(f, p));
        if (f.spell >= (spin ? 12 : 7)) s *= 0.22;
        if (p.bowl < 65) s *= 0.6;
        s *= 0.93 + 0.14 * rng();
        if (s > bs) { bs = s; best = p; }
      }
      if (!best) best = ft.xi.find(p => p.bowl >= 30) || ft.xi.find(p => p.id !== ft.keeper.id) || ft.xi[0];
      return best;
    }

    /* ----- one over ----- */
    playOver(out) {
      const inn = this.cur, bt = this.teams[inn.bat], ft = this.teams[inn.bowl];
      if (inn.overs > 0 && this.shouldDeclare(inn)) {
        inn.declared = true;
        this.endInnings(out, 'declared');
        return false;
      }
      const notes = [];
      if (inn.ballAge >= 80 && ft.xi.some(p => p.type === 'pace' && p.bowl >= 65) && this.rng() < 0.85) {
        inn.ballAge = 0;
        notes.push('The new ball is taken.');
      }
      inn.mode = this.tempo(inn);
      const bowler = this.pickBowler(inn, ft);
      let brec = inn.bowlers[bowler.id];
      if (!brec) { brec = inn.bowlers[bowler.id] = { p: bowler, balls: 0, runs: 0, wkts: 0, maidens: 0 }; inn.bowlOrder.push(bowler.id); }
      const aids = this.aids();
      const f = this.fat(ft, bowler);
      const ctx = {
        bowler, brec, ft, bt,
        aid: bowler.type === 'spin' ? aids.spin : aids.pace * newBall(inn.ballAge),
        fatM: fatMult(f, bowler),
        mode: MODES[inn.mode]
      };
      const sess = this.session(), overNo = Math.floor(inn.balls / 6) + 1;
      const balls = [];
      let legal = 0, runs = 0, bowlerRuns = 0, wk = 0;
      while (legal < 6 && !inn.ended) {
        const r = this.ball(inn, ctx, notes);
        balls.push(r.ball);
        runs += r.runs; bowlerRuns += r.bowlerRuns; if (r.w) wk++;
        if (r.legal) legal++;
      }
      if (legal === 6 && bowlerRuns === 0) brec.maidens++;
      if (legal === 6 && !inn.ended) { const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t; }
      inn.overs++; inn.ballAge++; inn.prevBowlerId = bowler.id;
      // fatigue bookkeeping
      for (const p of ft.xi) {
        if (p.bowl < 30) continue;
        const pf = this.fat(ft, p);
        if (p.id === bowler.id) { pf.tired += 1; pf.spell += 1; pf.rest = 0; }
        else { pf.tired = Math.max(0, pf.tired - 0.6); pf.rest++; if (pf.rest >= (p.type === 'spin' ? 2 : 4)) pf.spell = 0; }
      }
      const bats = [inn.striker, inn.nonStriker].map(i => inn.batters[i]).filter(b => b && !b.out).map(b => ({
        name: b.p.short, runs: b.runs, balls: b.balls, striker: b === inn.batters[inn.striker]
      }));
      out.push({
        t: 'over', inn: inn.no, batTeam: bt.name, over: overNo, partial: legal < 6,
        bowler: bowler.short, bowlerStyle: bowler.style,
        figs: `${fmtOvers(brec.balls)}-${brec.maidens}-${brec.runs}-${brec.wkts}`,
        balls, runs, wkts: wk, notes,
        score: { runs: inn.runs, wkts: inn.wkts, overs: fmtOvers(inn.balls) },
        bats, mode: inn.mode, modeLabel: MODES[inn.mode].label,
        day: this.day, session: sess, target: inn.target
      });
      if (inn.ended) {
        this.endInnings(out, inn.ended);
      }
      return true;
    }

    /* ----- one ball ----- */
    ball(inn, ctx, notes) {
      const rng = this.rng, st = inn.batters[inn.striker], br = ctx.brec, bowler = ctx.bowler, pit = this.pitch;
      if (rng() < 0.017) {
        const nb = rng() < 0.45;
        inn.runs++; inn.extras[nb ? 'nb' : 'w']++; br.runs++; inn.part.runs++;
        this.checkChase(inn);
        return { legal: false, runs: 1, bowlerRuns: 1, ball: { k: nb ? 'nb' : 'wd', v: 1 } };
      }
      const A = interp(BAT_AVG, st.p.bat) * st.form;
      const bw = interp(BOWL_AVG, bowler.bowl) / ctx.aid * ctx.fatM;
      const M = A * bw / TUNE.L;
      let r = (0.38 + 0.50 * st.p.aggr) * Math.pow(bw / 28, 0.35)
        * (0.72 + 0.28 * (1 - Math.exp(-st.balls / 12))) * pit.run * ctx.mode.run;
      r = clamp(r, 0.12, 1.35);
      let cw = 0;
      for (let i = inn.wktBalls.length - 1; i >= 0 && inn.balls - inn.wktBalls[i] <= 48; i--) cw++;
      const collapse = Math.min(1.2, 1 + 0.05 * cw);
      // a worn pitch plus a target on the board makes the last innings the hardest
      const pressure = inn.no === 4 ? 1.16 : inn.no === 3 ? 1.04 : 1;
      const p = clamp(TUNE.HZ * r / M * (1 + 1.2 * Math.exp(-st.balls / 14)) * pit.haz * ctx.mode.haz * collapse * pressure, 0.004, 0.30);

      inn.balls++; this.matchBalls++; this.dayBalls++; br.balls++; st.balls++; inn.part.balls++;

      if (rng() < p) return this.wicket(inn, ctx, st, notes);

      if (rng() < 0.012) {
        inn.runs++; inn.extras.lb++; inn.part.runs++;
        const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t;
        this.checkChase(inn);
        this.seqPush(inn, bowler.id, false);
        return { legal: true, runs: 1, bowlerRuns: 0, ball: { k: 'lb', v: 1 } };
      }
      const runs = sampleRuns(r, rng());
      st.runs += runs; inn.runs += runs; br.runs += runs; inn.part.runs += runs;
      if (runs === 4) st.fours++;
      if (runs === 6) st.sixes++;
      for (const [th, label] of MILESTONES) {
        if (st.runs >= th && st.mile < th) {
          st.mile = th;
          notes.push(`${st.p.short} reaches ${label} (${st.runs} off ${st.balls} balls).`);
        }
      }
      if (runs % 2 === 1) { const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t; }
      this.seqPush(inn, bowler.id, false);
      this.checkChase(inn);
      return { legal: true, runs, bowlerRuns: runs, ball: { k: runs === 4 ? 'four' : runs === 6 ? 'six' : runs === 0 ? 'dot' : 'run', v: runs } };
    }

    seqPush(inn, id, w) { inn.seq.push({ id, w }); if (inn.seq.length > 3) inn.seq.shift(); }
    checkChase(inn) { if (inn.no === 4 && inn.runs >= inn.target && !inn.ended) inn.ended = 'chased'; }

    wicket(inn, ctx, st, notes) {
      const rng = this.rng, bowler = ctx.bowler, ft = ctx.ft, br = ctx.brec;
      const table = bowler.type === 'spin' ? SPIN_HOW : PACE_HOW;
      let u = rng(), how = table[table.length - 1][0];
      for (const [h, pr] of table) { if (u < pr) { how = h; break; } u -= pr; }
      const keeper = ft.keeper;
      const fielders = ft.xi.filter(p => p.id !== bowler.id && p.id !== keeper.id);
      const pickF = () => fielders[Math.floor(rng() * fielders.length)];
      let outIdx = inn.striker, text, credit = true;
      switch (how) {
        case 'b': text = `b ${bowler.short}`; break;
        case 'lbw': text = `lbw b ${bowler.short}`; break;
        case 'hw': text = `hit wicket b ${bowler.short}`; break;
        case 'st': text = `st †${keeper.short} b ${bowler.short}`; this.addField(ft, keeper, 'st'); break;
        case 'ct': text = `c †${keeper.short} b ${bowler.short}`; this.addField(ft, keeper, 'c'); break;
        case 'cb': text = `c & b ${bowler.short}`; this.addField(ft, bowler, 'c'); break;
        case 'cf': { const f = pickF() || keeper; text = `c ${f.short} b ${bowler.short}`; this.addField(ft, f, 'c'); break; }
        case 'ro': {
          const f = pickF() || keeper;
          if (rng() < 0.3) outIdx = inn.nonStriker;
          text = `run out (${f.short})`; credit = false; this.addField(ft, f, 'ro'); break;
        }
      }
      const b = inn.batters[outIdx];
      b.out = { how, text };
      inn.wkts++;
      inn.fow.push({ w: inn.wkts, runs: inn.runs, name: b.p.short, over: fmtOvers(inn.balls) });
      inn.wktBalls.push(inn.balls);
      if (credit) {
        br.wkts++;
        this.seqPush(inn, bowler.id, true);
        const s = inn.seq;
        if (s.length === 3 && s.every(x => x.w && x.id === bowler.id)) notes.push(`HAT-TRICK for ${bowler.short}!`);
        if (br.wkts === 5) notes.push(`${bowler.short} takes a five-wicket haul.`);
      } else this.seqPush(inn, bowler.id, false);
      notes.unshift(`WICKET! ${b.p.short} ${text}, ${b.runs} (${b.balls}b${b.fours ? `, ${b.fours}x4` : ''}${b.sixes ? `, ${b.sixes}x6` : ''}).`);
      inn.part = { runs: 0, balls: 0 };
      if (inn.wkts >= 10) inn.ended = 'allout';
      else {
        const nb = inn.next++;
        inn.batters[nb].in = true;
        if (outIdx === inn.striker) inn.striker = nb; else inn.nonStriker = nb;
      }
      return { legal: true, runs: 0, bowlerRuns: 0, w: true, ball: { k: 'wkt', v: 0 } };
    }

    addField(team, p, kind) {
      const f = team.field[p.id] || (team.field[p.id] = { c: 0, st: 0, ro: 0 });
      f[kind]++;
    }

    /* ----- innings end, results ----- */
    endInnings(out, reason) {
      const inn = this.cur;
      inn.end = reason;
      this.cur = null;
      const bt = this.teams[inn.bat], ft = this.teams[inn.bowl];
      const score = `${inn.runs}${inn.wkts < 10 ? '/' + inn.wkts : ''}${reason === 'declared' ? 'd' : ''}`;
      const why = reason === 'allout' ? 'all out' : reason === 'declared' ? 'declared' : reason === 'chased' ? 'target reached' : '';
      out.push({ t: 'inningsEnd', no: inn.no, team: bt.name, runs: inn.runs, wkts: inn.wkts, reason,
        text: `${bt.name} ${score} (${fmtOvers(inn.balls)} ov), ${why}.`, day: this.day });
      const n = inn.no;
      if (n === 2) {
        const lead = this.total(this.firstBat) - inn.runs;
        if (lead >= 200 && this.oversLeft() >= 120 && this.rng() < (lead >= 300 ? 0.8 : 0.55)) {
          this.followOn = true;
          out.push({ t: 'info', text: `${this.teams[this.firstBat].name} lead by ${lead} and enforce the follow-on.` });
        }
      }
      if (n === 3 && this.followOn) {
        const t1 = this.total(this.firstBat), t2 = this.total(1 - this.firstBat);
        if (t2 < t1) {
          this.finishWin(out, this.firstBat, `by an innings and ${t1 - t2} runs`);
          return;
        }
      }
      if (n === 4) {
        const chaser = inn.bat;
        if (reason === 'chased') {
          this.finishWin(out, chaser, `by ${10 - inn.wkts} wicket${10 - inn.wkts === 1 ? '' : 's'}`);
        } else if (reason === 'allout') {
          const short = inn.target - 1 - inn.runs;
          if (short === 0) this.finishTie(out);
          else this.finishWin(out, 1 - chaser, `by ${short} run${short === 1 ? '' : 's'}`);
        }
      }
    }

    finishWin(out, idx, margin) {
      this.finished = true;
      this.result = { type: 'win', winner: idx, margin, text: `${this.teams[idx].name} win ${margin}` };
      this.result.potm = this.playerOfMatch(idx);
      out.push({ t: 'result', text: this.result.text, result: this.result });
    }
    finishTie(out) {
      this.finished = true;
      this.result = { type: 'tie', winner: null, text: 'Match tied!' };
      this.result.potm = this.playerOfMatch(null);
      out.push({ t: 'result', text: this.result.text, result: this.result });
    }
    finishDraw(out) {
      this.finished = true;
      this.cur = null;
      this.result = { type: 'draw', winner: null, text: 'Match drawn' };
      this.result.potm = this.playerOfMatch(null);
      out.push({ t: 'result', text: 'Stumps on day 5. Match drawn.', result: this.result });
    }

    playerOfMatch(winnerIdx) {
      const pts = {}, info = {};
      const add = (p, team, v) => { pts[p.id] = (pts[p.id] || 0) + v; info[p.id] = { p, team }; };
      for (const inn of this.inns) {
        for (const b of inn.batters) if (b.in) add(b.p, inn.bat, b.runs + (b.runs >= 100 ? 20 : b.runs >= 50 ? 8 : 0));
        for (const id in inn.bowlers) { const r = inn.bowlers[id]; add(r.p, inn.bowl, r.wkts * 20 + (r.wkts >= 5 ? 15 : 0)); }
      }
      for (const t of this.teams) for (const id in t.field) { const p = t.xi.find(x => x.id === id); const f = t.field[id]; add(p, t.idx, f.c * 5 + f.st * 6 + f.ro * 4); }
      let best = null;
      for (const id in pts) {
        if (winnerIdx != null && info[id].team !== winnerIdx) continue;
        if (!best || pts[id] > pts[best]) best = id;
      }
      if (!best) return null;
      const p = info[best].p, tIdx = info[best].team;
      const bats = [], bowls = [];
      for (const inn of this.inns) {
        const b = inn.batters.find(x => x.p.id === best && x.in);
        if (b) bats.push(b.runs + (b.out ? '' : '*'));
        const r = inn.bowlers[best];
        if (r) bowls.push(`${r.wkts}/${r.runs}`);
      }
      const parts = [];
      if (bats.length) parts.push(bats.join(' & ') + ' runs');
      if (bowls.length) parts.push(bowls.join(' & ') + ' bowling');
      return { name: p.name, team: this.teams[tIdx].name, line: parts.join(', ') };
    }

    /* ----- time: sessions, stumps ----- */
    postOver(out) {
      if (this.finished) return;
      const sc = () => this.scoreLines();
      if (!this.lunchDone && this.dayBalls >= 180 && this.dayLimitBalls > 180) {
        this.lunchDone = true;
        out.push({ t: 'break', kind: 'lunch', text: `Lunch on day ${this.day}`, lines: sc(), day: this.day });
      }
      if (!this.teaDone && this.dayBalls >= 360 && this.dayLimitBalls > 360) {
        this.teaDone = true;
        out.push({ t: 'break', kind: 'tea', text: `Tea on day ${this.day}`, lines: sc(), day: this.day });
      }
      if (this.dayBalls >= this.dayLimitBalls) {
        out.push({ t: 'break', kind: 'stumps', text: `Stumps on day ${this.day}`, lines: sc(), day: this.day });
        this.startDay(out);
      }
    }

    scoreLines() {
      return this.teams.map(t => {
        const parts = this.inns.filter(i => i.bat === t.idx).map(i =>
          `${i.runs}${i.wkts < 10 ? '/' + i.wkts : ''}${i.end === 'declared' ? 'd' : ''}${i === this.cur ? '*' : ''}`);
        return { name: t.name, text: parts.length ? parts.join(' & ') : 'yet to bat' };
      });
    }

    /* ----- snapshot for the UI ----- */
    snapshot() {
      const cur = this.cur;
      const rr = cur && cur.balls ? cur.runs / (cur.balls / 6) : 0;
      let situation = '';
      if (cur) {
        if (cur.no === 4) {
          const need = cur.target - cur.runs;
          situation = `Need ${need} to win, ${fmtOvers(Math.round(this.oversLeft() * 6))} overs left`;
        } else if (cur.no >= 2) {
          const diff = this.total(cur.bat) - this.total(cur.bowl);
          situation = diff > 0 ? `Lead by ${diff}` : diff < 0 ? `Trail by ${-diff}` : 'Scores level';
        }
      }
      return {
        day: this.day, session: this.session(), oversLeft: Math.round(this.oversLeft()),
        finished: this.finished, result: this.result, pitch: this.pitch.name, lines: this.scoreLines(),
        cur: cur ? {
          no: cur.no, bat: this.teams[cur.bat].name, runs: cur.runs, wkts: cur.wkts, overs: fmtOvers(cur.balls),
          rr: rr, mode: MODES[cur.mode].label, situation, target: cur.target,
          partnership: cur.part,
          batters: [cur.striker, cur.nonStriker].map(i => cur.batters[i]).filter(b => b && !b.out).map(b => ({
            name: b.p.short, runs: b.runs, balls: b.balls, striker: b === cur.batters[cur.striker]
          }))
        } : null
      };
    }

    scorecards() {
      return this.inns.map(inn => ({
        no: inn.no, team: this.teams[inn.bat].name, vs: this.teams[inn.bowl].name,
        runs: inn.runs, wkts: inn.wkts, overs: fmtOvers(inn.balls), end: inn.end, live: inn === this.cur,
        extras: inn.extras, extrasTotal: inn.extras.b + inn.extras.lb + inn.extras.w + inn.extras.nb,
        batters: inn.batters.map(b => ({
          name: b.p.name, short: b.p.short, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes,
          in: b.in, out: b.out ? b.out.text : null,
          sr: b.balls ? (100 * b.runs / b.balls).toFixed(1) : '-'
        })),
        fow: inn.fow,
        bowlers: inn.bowlOrder.map(id => {
          const r = inn.bowlers[id];
          return { name: r.p.short, overs: fmtOvers(r.balls), maidens: r.maidens, runs: r.runs, wkts: r.wkts,
            econ: r.balls ? (r.runs / (r.balls / 6)).toFixed(2) : '-' };
        })
      }));
    }
  }

  return { Match, PITCHES, MODES, TUNE, mulberry32, interp, BAT_AVG, BOWL_AVG, fmtOvers };
})();
