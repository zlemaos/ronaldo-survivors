/* 호날두 서바이버즈 — one penalty on screen (round 10, round 16): the touch steps and the animation clock, no DOM.
 * 'shoot' (we kick): aim a zone → stop the power gauge → stop the 정확도 needle → run-up → flight → result.
 * 'keep' (they kick at our keeper): pick one of six cells early, or wait, watch the ball and pick it within
 * RS.soReact() seconds (by 난이도) → result.
 * Rules come from pk.js; Renderer.renderPK draws it and turns `vfx` into pixel effects; main.js plays `sfx`.
 * Positions are in goal space: u from -1 (left post) to 1 (right post), v from 0 (ground) to 1 (the bar). */
(function (RS) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const U_COL = [-0.64, 0, 0.64], V_ROW = [0.2, 0.52, 0.84], V_KEEP = [0.22, 0.74];
  // a perfect strike bends into its zone's own corner (round 16: "구석으로 빨려 들어가게")
  const U_CORNER = [-0.93, 0, 0.93], V_CORNER = [0.08, 0.5, 0.93];
  // phase lengths in seconds (fast: a teammate's or the other side's kick in a shootout; slow: the ball's flight on a
  // kick that can decide it; react: the other side's kick while our keeper watches it; chip: a 파넨카's lob)
  // round 23: chipTop a perfect 파넨카's higher float; roll / lob a 'slow' ball barely touched — along the grass (the
  // low row) or a lazy floater (the rows above), far slower than any struck ball
  const T = { runup: 0.55, flight: 0.46, result: 1.5, fastRunup: 0.32, fastFlight: 0.38, fastResult: 0.95, slow: 1.3, chip: 0.95, chipTop: 1.2, roll: 2.4, lob: 2.1, guess: 2.6 };
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  // Round 18: each shot type has its own run-up — the 발등슛 a longer, straighter charge, the 감아차기 a curved approach
  // from wider — its length (× T.runup) and its footfalls (RUN_STEPS; the last one is the plant beside the ball, at
  // PLANT of the run-up; the strike swings through the rest). The flight is × RS.PK_SHOTS[shot].flight.
  const RUN = { push: 1, drive: 1.4, curl: 1.15, chip: 1.25 };
  const RUN_STEPS = { push: 4, drive: 6, curl: 5, chip: 4 };
  const PLANT = 0.8;
  // a 감아차기 swings out this far (goal half-widths) before it bends back in
  const CURL_BOW = 0.34;
  // round 36 (the user: 방향 맞췄는데 공이 그냥 지나감 — 버그?): a goal past a keeper who went the right way clips his
  // fingertips — his glove's centre stops this far inside the ball, and the touch nudges it at most this far on
  const TOUCH_GAP = 0.05, TOUCH_PUSH = 0.09;

  class PKScene {
    // opt: { mode: 'shoot' | 'keep', who: 'hero' | 'mate' | 'opp' (the kicker), keeper (RS.PK_KEEPERS entry or our
    //   keeper), fin, level, hero, small, yearIdx, auto, fast, slow, rng, forced: { goal } (a teammate's kick: the
    //   outcome is already rolled), ourK (our keeper's rating, 'keep'), oppMiss, midSaved (RS.soOppAim), rage (the keeper's 분노 모드),
    //   shot (round 18: the player's shot type, RS.PK_SHOTS; the 🤖 picks its own) }
    constructor(opt) {
      this.o = opt;
      this.who = opt.who || 'hero';
      this.rng = opt.rng || Math.random;
      this.mode = opt.mode || 'shoot';
      // the shot type and the kicking foot: the hero's own pick; a teammate's and the other side's kickers vary by
      // their number (looks only: their outcome does not use it; the other side never curls, so 보고 막기 stays
      // readable); 메시 is left-footed (RS.pkFoot), and so is one kicker in four of the others
      const n = opt.n | 0;
      this.shot = opt.forced ? RS.PK_SHOT_IDS[(n + 1) % 3] : this.mode === 'keep' ? (n % 2 ? 'drive' : 'push') : RS.PK_SHOTS[opt.shot] ? opt.shot : 'push';
      this.foot = this.who === 'hero' ? RS.pkFoot(opt.hero) : n % 4 === 2 ? 'L' : 'R';
      this.stepN = 0; // footfalls of the run-up so far (the 'step' sounds)
      this.phase = this.mode === 'keep' ? 'guess' : opt.forced ? 'runup' : 'aim';
      this.t = 0; this.time = 0;
      this.zones = opt.zones || RS.pkZoneCount(opt.level || 1); // round 23: the 토너먼트 opens all nine
      this.timing = RS.pkTiming(opt.fin || 50, null, opt.morale); // round 23: 사기 저하 speeds the gauge and the needle
      this.target = 150 + this.rng() * 170; // centre of the needle's target, degrees from the top, clockwise
      this.zone = null; this.power = null; this.acc = null; this.dive = null; this.perfect = false;
      this.watch = false; this.reactOpen = false; this.diveT = 0; this.aim = null; this.away = false;
      this.reactWin = opt.react || RS.soReact(); // seconds to react while the ball flies
      this.fake = this.rng() < 0.5 ? -1 : 1; // the side a 티배깅 keeper starts toward
      this.result = null; this.ball = null; this.hitDone = false;
      this.vfx = []; this.sfx = [];
      this.done = false;
      this.bot = null;
      this.setAuto(opt.auto);
      if (opt.forced) this.zone = [1, 3, 1, 3, 2, 4, 6][Math.floor(this.rng() * (this.zones >= 6 ? 7 : 5))];
      this.geo = null; // the renderer's goal geometry, for hit-testing taps
    }
    // 🤖 on or off for this kick (the screen's toggle): the AI picks a sensible kick and executes it as steadily as
    // the 골결정력 allows
    setAuto(on) {
      this.o.auto = !!on;
      this.bot = on && this.mode === 'shoot' && !this.o.forced ? RS.pkBotKick(this.rng, this.o.fin || 50, this.o.level || 1, this.o.keeper, this.zones) : null;
      if (this.mode === 'shoot' && !this.o.forced && this.phase === 'aim') this.shot = this.bot ? this.bot.shot : RS.PK_SHOTS[this.o.shot] ? this.o.shot : 'push';
    }
    // the player picks the shot type while he aims (round 18)
    pickShot(id) {
      if (this.phase !== 'aim' || this.o.auto || this.o.forced || this.mode !== 'shoot' || !RS.PK_SHOTS[id]) return false;
      if (id !== this.shot) { this.shot = id; this.sfx.push('click'); }
      return true;
    }
    // How the strike looks: the shot type, or 'chip' for a soft touch down the middle (a 파넨카 or a 티배깅 — whatever
    // type was picked); known once the power is set.
    style() {
      if (this.result && (this.result.kind === 'panenka' || this.result.kind === 'slow')) return 'chip';
      if (this.mode === 'shoot' && !this.o.forced && this.zone && this.power != null) {
        const pg = RS.pkPowerGrade(this.power, this.o.fin);
        if (pg === 'slow' || (RS.pkCol(this.zone) === 1 && (pg === 'pan' || pg === 'panPerfect'))) return 'chip';
      }
      return this.shot;
    }
    // the run-up for Renderer.pkKicker: its footfalls and the share of it before the plant
    runSteps() { return RUN_STEPS[this.style()] || 4; }
    get plantAt() { return PLANT; }
    // the ball bends this way (+ to the right): a right foot curls it to the left, a left foot to the right
    get curlDir() { return this.foot === 'L' ? 1 : -1; }
    // does the kick wait for a tap now?
    waiting() { return !this.o.auto && !this.o.forced && (this.phase === 'aim' || this.phase === 'power' || this.phase === 'acc' || this.phase === 'guess' || this.reactOpen); }
    get slow() { return !!this.o.slow; }
    // round 23 (the user: 파워 약하게 차도 강하게 날라가는데): × the flight time of our struck ball by its power — the
    // blue band 1, a soft grey one about 1.7, a 파넨카-zone touch to a side about 2, a full one 0.85
    pace() {
      if (this.mode !== 'shoot' || this.o.forced || this.power == null || (this.result && this.result.kind)) return 1;
      return clamp(1 + (RS.PK_POWER.blue - this.power) * 1.8, 0.85, 2.1);
    }
    dur(k) {
      const kind = k === 'flight' ? this.ballKind() : null;
      // a chip floats slowly, theirs too while our keeper watches it (it still lands after his window)
      if (kind === 'panenka') return (this.chipTop ? T.chipTop : T.chip) * (this.slow ? 1.3 : 1);
      if (kind === 'slow') return (this.slowRoll ? T.roll : T.lob) * (this.slow ? 1.2 : 1);
      if (k === 'flight' && this.mode === 'keep' && this.watch) return this.reactWin + 0.1; // the ball lands just after the window
      const d = this.o.fast ? T['fast' + k[0].toUpperCase() + k.slice(1)] : k === 'flight' && this.slow ? T.slow : T[k];
      if (k === 'runup') return d * (RUN[this.style()] || 1);
      if (k === 'flight') return d * RS.pkShot(this.shot).flight * this.pace();
      return d;
    }
    // how the ball travels: the result's kind, or the other side's 파넨카 while our keeper still watches it
    ballKind() { return this.result && this.result.kind ? this.result.kind : this.aim && this.aim.panenka ? 'panenka' : null; }
    // a perfect 파넨카 (its blue band): the higher, prettier float
    get chipTop() { return !!(this.result && this.result.odds && this.result.odds.chipPerfect); }
    // a 'slow' ball aimed along the ground rolls; higher up it floats
    get slowRoll() { return this.zone != null && RS.pkRow(this.zone) === 0; }
    // the gauge (0–1, up and down; a 발등슛's sweeps faster, a 감아차기's slower) and the needle (degrees) as they are now
    gauge() { const x = (this.t * this.timing.gauge * RS.pkShot(this.shot).gauge) % 2; return x < 1 ? x : 2 - x; }
    needle() { return (this.t * this.timing.needle * 360) % 360; }
    // each zone's chance at a perfect strike (shown on the aim grid)
    zoneOdds(z) { return RS.pkZoneBest({ fin: this.o.fin, keeper: this.o.keeper, hero: this.o.hero, rage: this.o.rage, shot: this.shot }, z); }

    go(phase) { this.phase = phase; this.t = 0; }

    // A tap in world px (x, y). Returns true when it did something.
    tap(x, y) {
      if (this.o.auto) return false;
      if (this.phase === 'aim') {
        const z = this.zoneAt(x, y);
        if (!z || z > this.zones) return false;
        this.pickZone(z); return true;
      }
      if (this.phase === 'power') { this.stopPower(this.gauge()); return true; }
      if (this.phase === 'acc') { this.stopNeedle(this.needle()); return true; }
      if (this.keepOpen()) { const c = this.keepCell(x, y); if (!c) return false; this.keepInput(c); return true; }
      return false;
    }
    // round 35 (the user: 내가 먼저 다이빙 했는데 선방 안되는데?): once the early pick timed out into watching, a tap
    // during the run-up was dropped and the keeper stood still — it is an early dive too
    keepOpen() { return this.phase === 'guess' || this.reactOpen || (this.mode === 'keep' && this.watch && this.phase === 'runup' && !this.o.auto); }
    zoneAt(x, y) {
      const g = this.geo; if (!g) return 0;
      const u = (x - g.cx) / g.halfW, v = (g.goalY - y) / (g.goalY - g.barY);
      if (u < -1.05 || u > 1.05 || v < -0.25 || v > 1.1) return 0;
      const col = clamp(Math.floor((u + 1) / (2 / 3)), 0, 2), row = clamp(Math.floor(v / (1 / 3)), 0, 2);
      return row * 3 + col + 1;
    }
    // our keeper's six cells: three columns, the low and the high half of the goal
    keepCell(x, y) {
      const g = this.geo; if (!g) return null;
      const u = (x - g.cx) / g.halfW, v = (g.goalY - y) / (g.goalY - g.barY);
      if (u < -1.3 || u > 1.3 || v < -0.4 || v > 1.4) return null;
      return { col: clamp(Math.floor((u + 1) / (2 / 3)), 0, 2), row: v >= 0.5 ? 1 : 0 };
    }
    // a cell from a tap or a key: the early dive, or the reaction while the ball flies
    keepInput(c) {
      if (this.phase === 'guess') this.pickDive(c);
      else if (this.phase === 'runup' && this.watch) { this.dive = c; this.watch = false; this.sfx.push('click'); }
      else if (this.reactOpen) this.react(c);
    }
    pickZone(z) { this.zone = z; this.sfx.push('click'); this.go('power'); }
    stopPower(p) {
      this.power = p; this.go('acc');
      // round 20: the harder the strike, the faster and narrower the dial; round 27: the higher the aim, too
      this.timing = RS.pkTiming(this.o.fin || 50, p, this.o.morale, RS.pkRow(this.zone));
      this.sfx.push(RS.pkPowerGrade(p, this.o.fin) === 'perfect' ? 'sparkle' : 'tap');
    }
    stopNeedle(deg) {
      this.needleAt = deg;
      this.acc = RS.pkNeedleGrade(deg - this.target, this.timing);
      this.perfect = RS.pkPerfect(this.power, this.acc, this.o.fin);
      this.sfx.push(this.perfect ? 'perfectLock' : this.acc === 'great' || this.acc === 'fine' ? 'sparkle' : this.acc === 'good' ? 'tap' : 'warn');
      this.go('runup');
    }
    pickDive(c) { this.dive = c; this.sfx.push('click'); this.go('runup'); }
    // skip the early pick: watch the ball and react to it
    watchNow() { if (this.phase === 'guess' && !this.o.auto) { this.watch = true; this.go('runup'); } }
    // the reaction: the cell and how long after the strike it came
    react(c) {
      if (!this.reactOpen) return;
      this.reactOpen = false;
      this.dive = { col: c.col, row: c.row, rt: this.t };
      this.diveT = this.t;
      this.result = RS.soOppSave(this.rng, this.o.ourK || 70, this.aim, this.dive);
      this.sfx.push('click');
    }

    update(dt) {
      if (this.done) return;
      this.t += dt; this.time += dt;
      const b = this.bot;
      switch (this.phase) {
        case 'aim': if (b && this.t > 0.7) this.pickZone(b.zone); break;
        case 'power':
          if (b && this.t > 0.55 && Math.abs(this.gauge() - b.power) < 0.03) this.stopPower(b.power);
          else if (b && this.t > 2.5) this.stopPower(b.power);
          else if (!b && this.t > 6) this.stopPower(this.gauge()); // nobody tapped: wherever it is
          break;
        case 'acc': {
          // the AI stops the needle where its roll says; a player who lets it run two turns misses
          if (b) {
            const T = this.timing, off = b.acc === 'great' ? 0 : b.acc === 'fine' ? T.great / 2 + (T.fine - T.great) / 4 : b.acc === 'good' ? T.fine / 2 + (T.good - T.fine) / 4 : T.good / 2 + 12;
            const stopAt = (this.target + off) / 360 / this.timing.needle;
            if (this.t >= stopAt) this.stopNeedle(this.target + off);
          } else if (this.t * this.timing.needle >= 2) this.stopNeedle(this.target + 180);
          break;
        }
        case 'guess':
          if (this.o.auto && this.t > 0.6) this.pickDive(null); // he guesses
          else if (!this.o.auto && this.t > T.guess) this.watchNow(); // no early pick: watch the ball
          break;
        case 'runup': {
          // footfalls: the run-up's steps, then the plant beside the ball
          const D = this.dur('runup'), N = this.runSteps();
          while (this.stepN < N && this.t >= D * PLANT * (this.stepN + 1) / N) { this.stepN++; this.sfx.push(this.stepN === N ? 'plant' : 'step'); }
          if (this.t >= D) { this.kick(); this.go('flight'); }
          break;
        }
        case 'flight': {
          if (this.reactOpen && this.t > this.reactWin) this.reactOpen = false; // too late
          const k = this.t / this.dur('flight');
          if (!this.hitDone && k >= 1) { this.hitDone = true; this.impact(); }
          if (k >= 1.25) this.go('result');
          break;
        }
        case 'result':
          if (this.result && this.result.kickAway && !this.away && this.t > 0.35) { this.away = true; this.sfx.push('kick'); this.sfx.push('angry'); }
          if (this.t >= this.dur('result') + (this.result && this.result.kickAway ? 0.5 : 0)) this.done = true;
          break;
      }
    }

    // the strike: roll (or take) the outcome and fix where the ball goes
    kick() {
      const o = this.o, rng = this.rng;
      let u, v;
      if (this.mode === 'keep') {
        // the other side's kicker: a column and a height; our keeper's early pick (or his own guess on auto) settles
        // it now, a watching keeper settles it when he moves (react) or when the ball arrives
        const a = this.aim = RS.soOppAim(rng, o.oppMiss, o.midSaved);
        this.zone = a.col + 1 + (a.row ? 6 : 0);
        if (!this.watch) this.result = RS.soOppSave(rng, o.ourK || 70, a, this.dive || RS.soGuess(rng));
        else this.reactOpen = true;
        u = U_COL[a.col] + (rng() - 0.5) * 0.2; v = V_KEEP[a.row] + (rng() - 0.5) * 0.12;
        if (a.panenka) { u = (rng() - 0.5) * 0.12; v = 0.42; } // round 23: their 파넨카 drops in down the middle
        this.missAt(a.off, a.col, u, v);
        this.sfx.push('kick');
        this.strikeSfx(a.panenka ? 'panenka' : null); // their chip ticks like ours
        return;
      }
      if (o.forced) {
        const q = rng(), res = o.forced.goal ? 'goal' : q < 0.65 ? 'save' : q < 0.85 ? 'post' : 'over';
        const col = RS.pkCol(this.zone), others = [0, 1, 2].filter((c) => c !== col);
        this.result = { res, goal: res === 'goal', diveCol: res === 'save' ? col : others[Math.floor(rng() * 2)] };
      } else {
        this.result = RS.pkKick(rng, { fin: o.fin, keeper: o.keeper, zone: this.zone, power: this.power, acc: this.acc, hero: o.hero, rage: o.rage, shot: this.shot, panStreak: o.panStreak });
      }
      const col = RS.pkCol(this.zone), row = RS.pkRow(this.zone), r = this.result;
      this.kRow = Math.floor(this.target) % 3; // the height he guesses when he is beaten (no extra roll: same luck)
      u = U_COL[col] + (rng() - 0.5) * 0.18; v = V_ROW[row] + (rng() - 0.5) * 0.12;
      if (this.shot === 'curl' && col !== 1) u *= 1.12; // a 감아차기 bends in nearer the corner
      // round 23 (the user: 파란색 맞추면 코너 구석으로 빨려들어가게 … 어긋날 수록 가운데방향으로 쏠리는 거): a struck
      // ball goes from its zone's own corner (blue needle) toward the keeper in the middle as the needle misses
      // (RS.PK_PULL × the shot's pull), a little scatter growing with the miss
      if (!r.kind && !o.forced && RS.PK_PULL[this.acc] != null) {
        const p = clamp(RS.PK_PULL[this.acc] * RS.pkShot(this.shot).pull, 0, 1), j = 0.04 + 0.12 * p;
        u = lerp(U_CORNER[col], 0, p * 0.9) + (rng() - 0.5) * j;
        v = lerp(V_CORNER[row], 0.4, p * 0.6) + (rng() - 0.5) * j * 0.6;
      }
      if (r.kind === 'perfect') { u = col === 1 ? (rng() < 0.5 ? -0.14 : 0.14) : U_CORNER[col]; v = V_CORNER[row]; } // pkKick decided whether he guessed the side (round 20)
      else if (r.kind === 'panenka') { u = (rng() - 0.5) * 0.12; v = 0.42; }
      this.missAt(r.res, col, u, v);
      this.sfx.push('kick');
      this.strikeSfx(r.kind);
      if (r.kind === 'perfect') this.sfx.push('zip');
    }
    // the strike's own sound on top of the thump: the 발등슛's crack and rush, the 감아차기's whirring spin, a chip's tick
    strikeSfx(kind) {
      if (kind === 'panenka' || kind === 'slow') this.sfx.push('chip');
      else if (this.shot === 'drive') this.sfx.push('rocket');
      else if (this.shot === 'curl') this.sfx.push('spin');
    }
    // where a missed ball goes: off the post, the bar, over or wide (the middle spreads up or to either side)
    missAt(res, col, u, v) {
      const side = col === 0 ? -1 : col === 2 ? 1 : (this.rng() < 0.5 ? -1 : 1);
      if (res === 'post') u = side * 1.0;
      else if (res === 'bar') v = 1.0;
      else if (res === 'over') { v = 1.5; u *= 0.8; }
      else if (res === 'wide') { u = side * 1.38; v = Math.min(v, 0.5); }
      this.ball = { u, v };
    }
    // Round 36: does this goal clip the keeper's fingertips? Only the outcome decides it (no roll): a goal that is
    // neither a perfect strike, a 파넨카 nor a 'slow' ball, past a keeper who went its way — the shot's column when
    // we kick (his height is only a look: he dives to the ball's), the column and the height he picked or reacted
    // to when our keeper dives (the wrong height stays a clean miss over or under him; one who froze never moved).
    get touch() {
      const r = this.result;
      if (!r || r.res !== 'goal' || r.kind || !this.ball || !this.zone) return false;
      if (this.mode === 'keep') return (!this.watch || !!(this.dive && this.dive.rt != null)) && r.diveCol === r.col && r.diveRow === r.row;
      return r.diveCol === RS.pkCol(this.zone);
    }
    // where his glove meets the ball (goal space: just inside it from his side; in the middle on top of a low one,
    // under a high one) and the nudge (du, dv) the touch gives it on into the net — never past the post or the bar
    touchAt() {
      const B = this.ball, side = RS.pkCol(this.zone) - 1, up = B.v < 0.34 ? -1 : 1;
      const dv = up > 0 ? clamp(0.97 - B.v, 0, TOUCH_PUSH * 0.5) : -Math.min(B.v, TOUCH_PUSH * 0.5);
      if (side) return { u: B.u - side * TOUCH_GAP, v: B.v, du: side * clamp(0.97 - Math.abs(B.u), 0, TOUCH_PUSH), dv };
      return { u: B.u, v: B.v - up * TOUCH_GAP * 1.4, du: (Math.sign(B.u) || this.fake) * TOUCH_PUSH * 0.6, dv };
    }
    // seconds since the ball clipped his glove, or -1 (no touch, or not yet)
    touchT() {
      const k = this.ballK();
      return this.touch && k >= 1 ? (k - 1) * this.dur('flight') : -1;
    }
    // the ball arrives: net, glove, frame or nothing (a watching keeper who never moved stays on his line)
    impact() {
      if (!this.result) { this.reactOpen = false; this.result = RS.soOppSave(this.rng, this.o.ourK || 70, this.aim, { col: 1, row: 0, rt: this.reactWin }); }
      const r = this.result, B = this.ball, keep = this.mode === 'keep';
      // round 23 (the user: 탄성 탄식이나 함성 … 진동 그런게 왜캐 없어): the crowd roars ('roar') for us, sighs
      // ('aah') against us; the frame draws a gasp first ('ooh')
      if (r.res === 'goal') {
        if (this.touch) { const d = this.touchAt(); this.vfx.push({ kind: 'touch', u: d.u, v: d.v, du: d.du, dv: d.dv }); this.sfx.push('tap'); } // round 36
        this.vfx.push({ kind: r.kind === 'perfect' ? 'perfect' : 'goal', u: B.u, v: B.v });
        this.sfx.push('net'); this.sfx.push(keep ? 'aah' : 'goal');
        if (r.kind === 'perfect') this.sfx.push('perfect');
      } else if (r.res === 'save') {
        this.vfx.push({ kind: r.kind === 'panenka' && !keep ? 'rage' : 'save', u: B.u, v: B.v });
        this.sfx.push('thud'); this.sfx.push(keep ? 'roar' : r.kind === 'panenka' || r.kind === 'slow' ? 'boo' : 'aah');
      } else if (r.res === 'post' || r.res === 'bar') { this.vfx.push({ kind: 'frame', u: B.u, v: B.v }); this.sfx.push('ping'); this.sfx.push('ooh'); this.sfx.push(keep ? 'roar' : 'aah'); }
      else this.sfx.push(keep ? 'roar' : 'aah');
    }
    // Flight progress of the ball: 0 at the strike, 1 at the goal line, on past it while the result shows.
    ballK() {
      const D = this.dur('flight');
      return this.phase === 'flight' ? this.t / D : this.phase === 'result' ? 1.25 + this.t / D : 0;
    }
    // The ball in goal space at flight progress k: u across, v up, z deep (0 the spot, 1 the goal line). It bends a
    // little toward its corner on a low arc (a perfect strike stays straight, then swerves into the corner; a 파넨카
    // floats up and drops, a perfect one higher; a 'slow' one rolls along the grass, bobbing, or lobs up lazily);
    // after the line (s = seconds since) it sinks into the net (a slow one trickles in), sticks in the keeper's
    // gloves, is booted away toward us, bounces off the frame, or flies on into the stands.
    // Round 18: a 발등슛 flies low and flat, then rises like a rocket; a 감아차기 swings out (against curlDir) and
    // bends back in, dipping at the end. The other side's 발등슛 flies straight (보고 막기 reads it).
    ballAt(k) {
      const B = this.ball, r = this.result ? this.result : { res: 'goal' }, kind = this.ballKind();
      if (k <= 1) {
        const shot = kind === 'panenka' || kind === 'slow' ? null : this.shot, bow = -this.curlDir * CURL_BOW * Math.sin(k * Math.PI) * (1 - 0.35 * k);
        if (kind === 'perfect') {
          if (shot === 'curl') return { u: B.u * k + bow * 1.2, v: B.v * Math.pow(k, 1.3) + Math.sin(k * Math.PI) * 0.1, z: k };
          if (shot === 'drive') return { u: B.u * (0.5 * k + 0.5 * k * k * k), v: B.v * Math.pow(k, 2) + Math.sin(k * Math.PI) * 0.03, z: k };
          return { u: B.u * (0.3 * k + 0.7 * k * k * k), v: B.v * Math.pow(k, 1.6) + Math.sin(k * Math.PI) * 0.04, z: k };
        }
        if (kind === 'panenka') return { u: B.u * k, v: B.v * k + Math.sin(k * Math.PI) * (this.chipTop ? 0.95 : 0.6), z: k };
        if (kind === 'slow') {
          const z = k * (1.3 - 0.3 * k); // it dies as it goes
          if (this.slowRoll) return { u: B.u * z, v: Math.abs(Math.sin(z * Math.PI * 6)) * 0.04 * (1 - 0.7 * z), z };
          return { u: B.u * k, v: B.v * k + Math.sin(k * Math.PI) * 0.5, z: k };
        }
        if (shot === 'drive') return this.mode === 'keep' ? { u: B.u * k, v: B.v * k, z: k } : { u: B.u * k, v: B.v * Math.pow(k, 1.7) + Math.sin(k * Math.PI) * 0.03, z: k };
        if (shot === 'curl') return { u: B.u * k + bow, v: B.v * k + Math.sin(k * Math.PI) * 0.13, z: k };
        return { u: B.u * k * (0.8 + 0.2 * k), v: B.v * k + Math.sin(k * Math.PI) * 0.08, z: k };
      }
      const s = (k - 1) * this.dur('flight'), side = Math.sign(B.u) || this.fake, ease = (rate) => 1 - Math.exp(-s * rate);
      if (r.res === 'save' && r.kickAway) { // he catches it, then boots it out toward the camera
        const t = Math.max(0, s - 0.35);
        if (!t) return { u: B.u * 0.3, v: 0.3, z: 1 };
        return { u: B.u * 0.3 + side * 0.4 * t, v: 0.3 + 2.6 * t - 1.2 * t * t, z: Math.max(-0.3, 1 - 1.6 * t) };
      }
      if (r.res === 'save' && kind === 'panenka') return { u: B.u * 0.3, v: 0.3, z: 1 }; // in his arms
      if (kind === 'slow') {
        const v0 = this.slowRoll ? 0 : B.v;
        if (r.res === 'save') return { u: B.u, v: lerp(v0, 0.3, smooth((s - 0.15) / 0.45)), z: 1 }; // he picks it up
        return { u: B.u, v: Math.max(0, v0 * Math.exp(-s * 1.5)), z: 1 + 0.13 * (1 - Math.exp(-s * 1.3)) }; // it trickles in
      }
      if (r.res === 'goal' && this.touch) { // round 36: off his fingertips — nudged aside, a little slower into the net
        const d = this.touchAt(), e = ease(8);
        return { u: B.u + d.du * e, v: Math.max(0, (B.v + d.dv * e) * Math.exp(-Math.max(0, s - 0.08) * 2.6) - 0.02 * s), z: 1 + 0.15 * ease(5) };
      }
      switch (r.res) {
        case 'goal': return { u: B.u, v: Math.max(0, B.v * Math.exp(-s * 2.6) - 0.02 * s), z: 1 + 0.15 * ease(9) };
        case 'save': return { u: B.u + side * 0.55 * ease(3), v: Math.max(0, B.v + 0.9 * s - 2.4 * s * s), z: 1 - 0.5 * ease(2.5) };
        case 'post': return { u: B.u + side * 0.3 * ease(3), v: Math.max(0, B.v + 0.5 * s - 2.4 * s * s), z: 1 - 0.4 * ease(2) };
        case 'bar': return { u: B.u + 0.1 * ease(2), v: Math.max(0, 1 + 1.1 * s - 1.8 * s * s), z: 1 + 0.35 * ease(2) };
        default: return { u: B.u * (1 + 0.25 * s), v: B.v + 0.8 * s, z: 1 + 0.9 * s }; // over / wide: into the stands
      }
    }
    // The keeper for Renderer.pkKeeper (round 18: a jointed keeper). mode 'idle' (on his line; still = a watching
    // keeper frozen until the player reacts), 'dive' (side -1 / 0 / 1, row 0 low · 1 mid · 2 high, k 0–1 how far
    // into it — set, load, launch, full stretch — target the goal-space point his leading glove reaches, land 0–1
    // back down on the grass) or 'catch' (he takes a slow ball in his arms: a 파넨카 he read, or a 'slow' one — u
    // where he stands, walk while he steps over to it, low: he bends down for a roller). kick 0–1: he boots it away.
    keeperPose() {
      const tt = this.time, idle = { mode: 'idle', u: Math.sin(tt * 2.3) * 0.1, t: tt };
      if (this.phase !== 'flight' && this.phase !== 'result') return idle;
      const r = this.result, D = this.dur('flight'), inResult = this.phase === 'result';
      const land = inResult ? clamp(this.t / 0.45, 0, 1) : 0;
      const kick = inResult && r && r.kickAway ? clamp((this.t - 0.3) / 0.22, 0, 1) : 0;
      if (this.mode === 'keep' && this.watch) {
        if (r && r.kind === 'panenka' && r.res === 'save') return { mode: 'catch', u: 0, k: 1, kick: 0, t: tt }; // he stayed: it drops into his arms
        if (r && r.kind === 'panenka' && (!this.dive || this.dive.rt == null)) return this.divePose(r, 1, 2, inResult ? 1 : 0.6, 0); // a late jump under it
        if (!r || !this.dive || this.dive.rt == null) return r ? { mode: 'idle', u: 0, t: tt, still: true } : idle;
        // round 36: a late reaction that still gets a touch flies quicker, so his glove is there as the ball arrives
        const kd = this.touch ? clamp(this.dur('flight') - this.diveT, 0.1, 0.32) : 0.32;
        const k = inResult ? 1 : clamp((this.t - this.diveT) / kd, 0, 1);
        return this.divePose(r, this.dive.col, this.dive.row ? 2 : 0, k, land);
      }
      if (!r) return idle;
      const q = inResult ? 1 : clamp(this.t / D, 0, 1);
      if (r.kind === 'slow') {
        if (r.res === 'save') { // no dive: he walks over (the middle: he just waits) and picks it up
          const w = smooth(q / 0.7), far = Math.abs(this.ball.u) > 0.08;
          return { mode: 'catch', u: this.ball.u * w, walk: far && q > 0.02 && q < 0.7, low: this.slowRoll, k: q, kick: 0, t: tt };
        }
        // he went early the other way and lies there watching it trickle in
        const sec = inResult ? D * 1.25 + this.t : this.t;
        const away = r.diveCol !== 1 ? r.diveCol : RS.pkCol(this.zone) === 0 ? 2 : 0; // one who stayed still went down the wrong way
        return this.divePose(r, away, 0,clamp(sec / 0.5, 0, 1), clamp((sec - 0.6) / 0.4, 0, 1));
      }
      if (r.kind === 'panenka' && r.res === 'save') return { mode: 'catch', u: 0, k: q, kick, t: tt };
      const k = inResult ? 1 : clamp((this.t / D - 0.06) / 0.62, 0, 1);
      const row = this.mode === 'keep' ? (r.diveRow ? 2 : 0) : this.kRow;
      return this.divePose(r, r.diveCol, row, k, land);
    }
    // a dive toward col at height row; a save takes his glove to the ball, a touch (round 36) his fingertips just
    // inside it (and the ball's height decides the dive)
    divePose(r, col, row, k, land) {
      const B = this.ball, save = r.res === 'save', touch = !save && this.touch;
      const reach = r.kind === 'perfect' && col === RS.pkCol(this.zone) ? 0.84 : 1; // fingertips short of the corner
      if (save || touch) row = B.v < 0.34 ? 0 : B.v < 0.66 ? 1 : 2;
      const target = save ? { u: B.u, v: B.v } : touch ? this.touchAt() : { u: (col - 1) * 0.86 * reach, v: [0.1, 0.5, 0.86][row] * (r.kind === 'perfect' ? 0.92 : 1) };
      return { mode: 'dive', u: 0, side: col - 1, row, k, land, target, t: this.time };
    }
  }
  RS.PKScene = PKScene;
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pkscene = 'R36';
