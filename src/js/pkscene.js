/* 호날두 서바이버즈 — one penalty on screen (round 10, round 16): the touch steps and the animation clock, no DOM.
 * 'shoot' (we kick): aim a zone → stop the power gauge → stop the 정확도 needle → run-up → flight → result.
 * 'keep' (they kick at our keeper): pick one of six cells early, or wait, watch the ball and pick it within
 * RS.SO_REACT seconds → result.
 * Rules come from pk.js; Renderer.renderPK draws it and turns `vfx` into pixel effects; main.js plays `sfx`.
 * Positions are in goal space: u from -1 (left post) to 1 (right post), v from 0 (ground) to 1 (the bar). */
(function (RS) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const U_COL = [-0.64, 0, 0.64], V_ROW = [0.2, 0.52, 0.84], V_KEEP = [0.22, 0.74];
  // a perfect strike bends into its zone's own corner (round 16: "구석으로 빨려 들어가게")
  const U_CORNER = [-0.93, 0, 0.93], V_CORNER = [0.08, 0.5, 0.93];
  // phase lengths in seconds (fast: a teammate's or the other side's kick in a shootout; slow: the ball's flight on a
  // kick that can decide it; react: the other side's kick while our keeper watches it; chip: a 파넨카's lob)
  const T = { runup: 0.55, flight: 0.46, result: 1.5, fastRunup: 0.32, fastFlight: 0.38, fastResult: 0.95, slow: 1.3, react: 1.1, chip: 0.95, guess: 2.6 };

  class PKScene {
    // opt: { mode: 'shoot' | 'keep', who: 'hero' | 'mate' | 'opp' (the kicker), keeper (RS.PK_KEEPERS entry or our
    //   keeper), fin, level, hero, small, yearIdx, auto, fast, slow, rng, forced: { goal } (a teammate's kick: the
    //   outcome is already rolled), ourK (our keeper's rating, 'keep'), oppMiss, rage (the keeper's 분노 모드) }
    constructor(opt) {
      this.o = opt;
      this.who = opt.who || 'hero';
      this.rng = opt.rng || Math.random;
      this.mode = opt.mode || 'shoot';
      this.phase = this.mode === 'keep' ? 'guess' : opt.forced ? 'runup' : 'aim';
      this.t = 0; this.time = 0;
      this.zones = RS.pkZoneCount(opt.level || 1);
      this.timing = RS.pkTiming(opt.fin || 50);
      this.target = 150 + this.rng() * 170; // centre of the needle's target, degrees from the top, clockwise
      this.zone = null; this.power = null; this.acc = null; this.dive = null; this.perfect = false;
      this.watch = false; this.reactOpen = false; this.diveT = 0; this.aim = null; this.away = false;
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
      this.bot = on && this.mode === 'shoot' && !this.o.forced ? RS.pkBotKick(this.rng, this.o.fin || 50, this.o.level || 1) : null;
    }
    // does the kick wait for a tap now?
    waiting() { return !this.o.auto && !this.o.forced && (this.phase === 'aim' || this.phase === 'power' || this.phase === 'acc' || this.phase === 'guess' || this.reactOpen); }
    get slow() { return !!this.o.slow; }
    dur(k) {
      if (k === 'flight' && this.mode === 'keep' && this.watch) return T.react;
      if (k === 'flight' && this.result && this.result.kind === 'panenka') return T.chip * (this.slow ? 1.3 : 1);
      return this.o.fast ? T['fast' + k[0].toUpperCase() + k.slice(1)] : k === 'flight' && this.slow ? T.slow : T[k];
    }
    // the gauge (0–1, up and down) and the needle (degrees) as they are now
    gauge() { const x = (this.t * this.timing.gauge) % 2; return x < 1 ? x : 2 - x; }
    needle() { return (this.t * this.timing.needle * 360) % 360; }
    // each zone's chance at a perfect strike (shown on the aim grid)
    zoneOdds(z) { return RS.pkZoneBest({ fin: this.o.fin, keeper: this.o.keeper, hero: this.o.hero, rage: this.o.rage }, z); }

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
      if (this.phase === 'guess' || this.reactOpen) { const c = this.keepCell(x, y); if (!c) return false; this.keepInput(c); return true; }
      return false;
    }
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
      else if (this.reactOpen) this.react(c);
    }
    pickZone(z) { this.zone = z; this.sfx.push('click'); this.go('power'); }
    stopPower(p) {
      this.power = p; this.go('acc');
      this.sfx.push(RS.pkPowerGrade(p, this.o.fin) === 'perfect' ? 'sparkle' : 'tap');
    }
    stopNeedle(deg) {
      this.needleAt = deg;
      this.acc = RS.pkNeedleGrade(deg - this.target, this.timing);
      this.perfect = RS.pkPerfect(this.power, this.acc, this.o.fin);
      this.sfx.push(this.perfect ? 'perfectLock' : this.acc === 'great' ? 'sparkle' : this.acc === 'good' ? 'tap' : 'warn');
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
            const off = b.acc === 'great' ? 0 : b.acc === 'good' ? this.timing.great / 2 + (this.timing.good - this.timing.great) / 4 : this.timing.good / 2 + 12;
            const stopAt = (this.target + off) / 360 / this.timing.needle;
            if (this.t >= stopAt) this.stopNeedle(this.target + off);
          } else if (this.t * this.timing.needle >= 2) this.stopNeedle(this.target + 180);
          break;
        }
        case 'guess':
          if (this.o.auto && this.t > 0.6) this.pickDive(null); // he guesses
          else if (!this.o.auto && this.t > T.guess) this.watchNow(); // no early pick: watch the ball
          break;
        case 'runup':
          if (this.t >= this.dur('runup')) { this.kick(); this.go('flight'); }
          break;
        case 'flight': {
          if (this.reactOpen && this.t > RS.SO_REACT) this.reactOpen = false; // too late
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
        const a = this.aim = RS.soOppAim(rng, o.oppMiss);
        this.zone = a.col + 1 + (a.row ? 6 : 0);
        if (!this.watch) this.result = RS.soOppSave(rng, o.ourK || 70, a, this.dive || RS.soGuess(rng));
        else this.reactOpen = true;
        u = U_COL[a.col] + (rng() - 0.5) * 0.2; v = V_KEEP[a.row] + (rng() - 0.5) * 0.12;
        this.missAt(a.off, a.col, u, v);
        this.sfx.push('kick');
        return;
      }
      if (o.forced) {
        const q = rng(), res = o.forced.goal ? 'goal' : q < 0.65 ? 'save' : q < 0.85 ? 'post' : 'over';
        const col = RS.pkCol(this.zone), others = [0, 1, 2].filter((c) => c !== col);
        this.result = { res, goal: res === 'goal', diveCol: res === 'save' ? col : others[Math.floor(rng() * 2)] };
      } else {
        this.result = RS.pkKick(rng, { fin: o.fin, keeper: o.keeper, zone: this.zone, power: this.power, acc: this.acc, hero: o.hero, rage: o.rage });
      }
      const col = RS.pkCol(this.zone), row = RS.pkRow(this.zone), r = this.result;
      u = U_COL[col] + (rng() - 0.5) * 0.18; v = V_ROW[row] + (rng() - 0.5) * 0.12;
      if (r.kind === 'perfect') { u = col === 1 ? (rng() < 0.5 ? -0.14 : 0.14) : U_CORNER[col]; v = V_CORNER[row]; if (r.goal && rng() < 0.5) r.diveCol = col; } // he goes the right way and still cannot reach it
      else if (r.kind === 'panenka') { u = (rng() - 0.5) * 0.12; v = 0.42; }
      else if (r.kind === 'tbag') { u = (rng() - 0.5) * 0.1; v = 0.1; }
      this.missAt(r.res, col, u, v);
      this.sfx.push('kick');
      if (r.kind === 'perfect') this.sfx.push('zip');
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
    // the ball arrives: net, glove, frame or nothing (a watching keeper who never moved stays on his line)
    impact() {
      if (!this.result) { this.reactOpen = false; this.result = RS.soOppSave(this.rng, this.o.ourK || 70, this.aim, { col: 1, row: 0, rt: RS.SO_REACT }); }
      const r = this.result, B = this.ball, keep = this.mode === 'keep';
      if (r.res === 'goal') {
        this.vfx.push({ kind: r.kind === 'perfect' ? 'perfect' : 'goal', u: B.u, v: B.v });
        this.sfx.push('net'); this.sfx.push(keep ? 'oh' : 'goal');
        if (r.kind === 'perfect') this.sfx.push('perfect');
      } else if (r.res === 'save') {
        this.vfx.push({ kind: r.kind === 'panenka' ? 'rage' : 'save', u: B.u, v: B.v });
        this.sfx.push('thud'); this.sfx.push(keep ? 'cheer' : r.kind === 'panenka' || r.kind === 'tbag' ? 'boo' : 'oh');
      } else if (r.res === 'post' || r.res === 'bar') { this.vfx.push({ kind: 'frame', u: B.u, v: B.v }); this.sfx.push('ping'); this.sfx.push(keep ? 'cheer' : 'oh'); }
      else this.sfx.push(keep ? 'cheer' : 'oh');
    }
    // Flight progress of the ball: 0 at the strike, 1 at the goal line, on past it while the result shows.
    ballK() {
      const D = this.dur('flight');
      return this.phase === 'flight' ? this.t / D : this.phase === 'result' ? 1.25 + this.t / D : 0;
    }
    // The ball in goal space at flight progress k: u across, v up, z deep (0 the spot, 1 the goal line). It bends a
    // little toward its corner on a low arc (a perfect strike stays straight, then swerves into the corner; a 파넨카
    // floats up and drops; a 티배깅 one rolls); after the line (s = seconds since) it sinks into the net, sticks in
    // the keeper's gloves, is booted away toward us, bounces off the frame, or flies on into the stands.
    ballAt(k) {
      const B = this.ball, r = this.result ? this.result : { res: 'goal' }, kind = r.kind;
      if (k <= 1) {
        if (kind === 'perfect') return { u: B.u * (0.3 * k + 0.7 * k * k * k), v: B.v * Math.pow(k, 1.6) + Math.sin(k * Math.PI) * 0.04, z: k };
        if (kind === 'panenka') return { u: B.u * k, v: B.v * k + Math.sin(k * Math.PI) * 0.6, z: k };
        if (kind === 'tbag') return { u: B.u * k, v: B.v * k, z: k };
        return { u: B.u * k * (0.8 + 0.2 * k), v: B.v * k + Math.sin(k * Math.PI) * 0.08, z: k };
      }
      const s = (k - 1) * this.dur('flight'), side = Math.sign(B.u) || this.fake, ease = (rate) => 1 - Math.exp(-s * rate);
      if (r.res === 'save' && r.kickAway) { // he catches it, then boots it out toward the camera
        const t = Math.max(0, s - 0.35);
        if (!t) return { u: B.u * 0.3, v: 0.3, z: 1 };
        return { u: B.u * 0.3 + side * 0.4 * t, v: 0.3 + 2.6 * t - 1.2 * t * t, z: Math.max(-0.3, 1 - 1.6 * t) };
      }
      if (r.res === 'save' && (kind === 'panenka' || kind === 'tbag')) return { u: B.u * 0.3, v: 0.3, z: 1 }; // in his arms
      switch (r.res) {
        case 'goal': return { u: B.u, v: Math.max(0, B.v * Math.exp(-s * 2.6) - 0.02 * s), z: 1 + 0.15 * ease(9) };
        case 'save': return { u: B.u + side * 0.55 * ease(3), v: Math.max(0, B.v + 0.9 * s - 2.4 * s * s), z: 1 - 0.5 * ease(2.5) };
        case 'post': return { u: B.u + side * 0.3 * ease(3), v: Math.max(0, B.v + 0.5 * s - 2.4 * s * s), z: 1 - 0.4 * ease(2) };
        case 'bar': return { u: B.u + 0.1 * ease(2), v: Math.max(0, 1 + 1.1 * s - 1.8 * s * s), z: 1 + 0.35 * ease(2) };
        default: return { u: B.u * (1 + 0.25 * s), v: B.v + 0.8 * s, z: 1 + 0.9 * s }; // over / wide: into the stands
      }
    }
    // The keeper: u across and v off the ground (goal space), his lean (radians, + to the right) and how far into
    // the dive he is (0–1). Before the kick he sways on his line; a save takes him to the ball, otherwise he goes
    // the way he guessed (diveCol) and lands. A 티배깅 keeper starts one way, stops and walks back to the middle; a
    // keeper who reads a 파넨카 just stands and takes it; a watching keeper moves only when the player reacts.
    keeperPose() {
      const tt = this.time, idle = { u: Math.sin(tt * 2.3) * 0.1, v: Math.max(0, Math.sin(tt * 4.6)) * 0.03, angle: 0, k: 0 };
      if (this.phase !== 'flight' && this.phase !== 'result') return idle;
      const r = this.result, D = this.dur('flight'), inResult = this.phase === 'result';
      const fall = inResult ? Math.max(0, 1 - this.t * 2.5) : 1; // back down on the grass
      if (this.mode === 'keep' && this.watch) {
        if (!r || !this.dive || this.dive.rt == null) return r ? { u: 0, v: 0, angle: 0, k: 0 } : idle;
        const k = inResult ? 1 : clamp((this.t - this.diveT) / 0.3, 0, 1), e = 1 - (1 - k) * (1 - k), save = r.res === 'save';
        const tu = save ? this.ball.u * 0.85 : (this.dive.col - 1) * 0.72, tv = save ? Math.max(0.15, this.ball.v * 0.75) : this.dive.row ? 0.55 : 0.18;
        return { u: tu * e, v: tv * Math.sin(e * Math.PI * 0.5) * fall, angle: (this.dive.col === 1 ? 0 : (this.dive.col - 1) * 1.2) * e, k: e };
      }
      if (!r) return idle;
      const q = inResult ? 1 : clamp(this.t / D, 0, 1);
      if (r.kind === 'tbag' && r.res === 'save') { // a feint toward fake, then back to the middle for it
        const out = q < 0.4 ? q / 0.4 : Math.max(0, 1 - (q - 0.4) / 0.45);
        return { u: this.fake * 0.35 * out, v: 0, angle: this.fake * 0.25 * out, k: 0 };
      }
      if (r.kind === 'panenka' && r.res === 'save') return { u: 0, v: Math.sin(clamp(q, 0, 1) * Math.PI) * 0.12 * fall, angle: inResult ? Math.sin(this.t * 30) * 0.12 : 0, k: 0 };
      const col = r.diveCol, save = r.res === 'save';
      const k = inResult ? 1 : clamp((this.t / D - 0.12) / 0.6, 0, 1), e = 1 - (1 - k) * (1 - k);
      const reach = r.kind === 'perfect' && col === RS.pkCol(this.zone) ? 0.82 : 1; // fingertips short of the corner
      const tu = save ? this.ball.u * 0.85 : (col - 1) * 0.72 * reach, tv = save ? Math.max(0.15, this.ball.v * 0.75) : col === 1 ? 0.3 : 0.18 + (r.kind === 'perfect' ? this.ball.v * 0.5 : 0);
      return { u: tu * e, v: tv * Math.sin(e * Math.PI * 0.5) * fall, angle: (col === 1 ? 0 : (col - 1) * 1.2) * e, k: e };
    }
  }
  RS.PKScene = PKScene;
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pkscene = 'R16';
