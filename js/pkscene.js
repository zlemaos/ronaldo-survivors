/* 호날두 서바이버즈 — one penalty on screen (round 10): the touch steps and the animation clock, no DOM.
 * 'shoot' (we kick): aim a zone → stop the power gauge → stop the 정확도 needle → run-up → flight → result.
 * 'keep' (they kick at our keeper): pick the dive → run-up → flight → result.
 * Rules come from pk.js; Renderer.renderPK draws it and turns `vfx` into pixel effects; main.js plays `sfx`.
 * Positions are in goal space: u from -1 (left post) to 1 (right post), v from 0 (ground) to 1 (the bar). */
(function (RS) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const U_COL = [-0.64, 0, 0.64], V_ROW = [0.2, 0.52, 0.84];
  // phase lengths in seconds (fast: a teammate's or the other side's kick in a shootout; slow: the ball's flight on a
  // kick that can decide it)
  const T = { runup: 0.55, flight: 0.46, result: 1.5, fastRunup: 0.32, fastFlight: 0.38, fastResult: 0.95, slow: 1.3 };

  class PKScene {
    // opt: { mode: 'shoot' | 'keep', who: 'hero' | 'mate' | 'opp' (the kicker), keeper (RS.PK_KEEPERS entry or our
    //   keeper), fin, level, hero, small, yearIdx, auto, fast, slow, rng, forced: { goal } (a teammate's kick: the
    //   outcome is already rolled), ourK (our keeper's rating, 'keep') }
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
      this.zone = null; this.power = null; this.acc = null; this.dive = null;
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
    waiting() { return !this.o.auto && !this.o.forced && (this.phase === 'aim' || this.phase === 'power' || this.phase === 'acc' || this.phase === 'guess'); }
    get slow() { return !!this.o.slow; }
    dur(k) { return this.o.fast ? T['fast' + k[0].toUpperCase() + k.slice(1)] : k === 'flight' && this.slow ? T.slow : T[k]; }
    // the gauge (0–1, up and down) and the needle (degrees) as they are now
    gauge() { const x = (this.t * this.timing.gauge) % 2; return x < 1 ? x : 2 - x; }
    needle() { return (this.t * this.timing.needle * 360) % 360; }
    // odds of each zone at a clean kick (shown on the aim grid)
    zoneOdds(z) { return RS.pkOdds({ fin: this.o.fin, keeper: this.o.keeper, zone: z, power: 0.79, acc: 'good', hero: this.o.hero }).goal; }

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
      if (this.phase === 'guess') {
        const g = this.geo; if (!g) return false;
        this.pickDive(x < g.cx - g.halfW / 3 ? 0 : x > g.cx + g.halfW / 3 ? 2 : 1); return true;
      }
      return false;
    }
    zoneAt(x, y) {
      const g = this.geo; if (!g) return 0;
      const u = (x - g.cx) / g.halfW, v = (g.goalY - y) / (g.goalY - g.barY);
      if (u < -1.05 || u > 1.05 || v < -0.25 || v > 1.1) return 0;
      const col = clamp(Math.floor((u + 1) / (2 / 3)), 0, 2), row = clamp(Math.floor(v / (1 / 3)), 0, 2);
      return row * 3 + col + 1;
    }
    pickZone(z) { this.zone = z; this.sfx.push('click'); this.go('power'); }
    stopPower(p) { this.power = p; this.sfx.push('tap'); this.go('acc'); }
    stopNeedle(deg) {
      this.needleAt = deg;
      this.acc = RS.pkNeedleGrade(deg - this.target, this.timing);
      this.sfx.push(this.acc === 'great' ? 'sparkle' : this.acc === 'good' ? 'tap' : 'warn');
      this.go('runup');
    }
    pickDive(c) { this.dive = c; this.sfx.push('click'); this.go('runup'); }

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
          if (this.o.auto && this.t > 0.6) this.pickDive(null);
          else if (this.t > 3.2) this.pickDive(null); // no answer: he guesses
          break;
        case 'runup':
          if (this.t >= this.dur('runup')) { this.kick(); this.go('flight'); }
          break;
        case 'flight': {
          const k = this.t / this.dur('flight');
          if (!this.hitDone && k >= 1) { this.hitDone = true; this.impact(); }
          if (k >= 1.25) this.go('result');
          break;
        }
        case 'result': if (this.t >= this.dur('result')) this.done = true; break;
      }
    }

    // the strike: roll (or take) the outcome and fix where the ball goes
    kick() {
      const o = this.o, rng = this.rng;
      if (this.mode === 'keep') {
        const r = RS.soOppKick(rng, o.ourK || 70, this.dive);
        this.zone = r.col + 1 + (rng() < 0.5 ? 3 : 0); // the other side's kicker: low or mid height
        this.result = { res: r.res, goal: r.goal, diveCol: r.diveCol };
      } else if (o.forced) {
        const q = rng(), res = o.forced.goal ? 'goal' : q < 0.65 ? 'save' : q < 0.85 ? 'post' : 'over';
        const col = RS.pkCol(this.zone), others = [0, 1, 2].filter((c) => c !== col);
        this.result = { res, goal: res === 'goal', diveCol: res === 'save' ? col : others[Math.floor(rng() * 2)] };
      } else {
        this.result = RS.pkKick(rng, { fin: o.fin, keeper: o.keeper, zone: this.zone, power: this.power, acc: this.acc, hero: o.hero });
      }
      // where the ball ends: the zone, a little off its centre; misses leave the frame
      const col = RS.pkCol(this.zone), row = RS.pkRow(this.zone), res = this.result.res, side = col === 0 ? -1 : col === 2 ? 1 : (rng() < 0.5 ? -1 : 1);
      let u = U_COL[col] + (rng() - 0.5) * 0.18, v = V_ROW[row] + (rng() - 0.5) * 0.12;
      if (res === 'post') u = side * 1.0;
      else if (res === 'bar') v = 1.0;
      else if (res === 'over') { v = 1.5; u *= 0.8; }
      else if (res === 'wide') { u = side * 1.38; v = Math.min(v, 0.5); }
      this.ball = { u, v };
      this.sfx.push('kick');
    }
    // the ball arrives: net, glove, frame or nothing
    impact() {
      const r = this.result, B = this.ball;
      if (r.res === 'goal') { this.vfx.push({ kind: 'goal', u: B.u, v: B.v }); this.sfx.push('net'); this.sfx.push(this.mode === 'keep' ? 'oh' : 'goal'); }
      else if (r.res === 'save') { this.vfx.push({ kind: 'save', u: B.u, v: B.v }); this.sfx.push('thud'); this.sfx.push(this.mode === 'keep' ? 'cheer' : 'oh'); }
      else if (r.res === 'post' || r.res === 'bar') { this.vfx.push({ kind: 'frame', u: B.u, v: B.v }); this.sfx.push('ping'); this.sfx.push(this.mode === 'keep' ? 'cheer' : 'oh'); }
      else this.sfx.push(this.mode === 'keep' ? 'cheer' : 'oh');
    }
    // Flight progress of the ball: 0 at the strike, 1 at the goal line, on past it while the result shows.
    ballK() {
      const D = this.dur('flight');
      return this.phase === 'flight' ? this.t / D : this.phase === 'result' ? 1.25 + this.t / D : 0;
    }
    // The ball in goal space at flight progress k: u across, v up, z deep (0 the spot, 1 the goal line). It bends a
    // little toward its corner on a low arc; after the line (s = seconds since) it sinks into the net, bounces off the
    // keeper or the frame, or flies on into the stands.
    ballAt(k) {
      const B = this.ball, r = this.result.res;
      if (k <= 1) return { u: B.u * k * (0.8 + 0.2 * k), v: B.v * k + Math.sin(k * Math.PI) * 0.08, z: k };
      const s = (k - 1) * this.dur('flight'), side = Math.sign(B.u) || 1, ease = (rate) => 1 - Math.exp(-s * rate);
      switch (r) {
        case 'goal': return { u: B.u, v: Math.max(0, B.v * Math.exp(-s * 2.6) - 0.02 * s), z: 1 + 0.15 * ease(9) };
        case 'save': return { u: B.u + side * 0.55 * ease(3), v: Math.max(0, B.v + 0.9 * s - 2.4 * s * s), z: 1 - 0.5 * ease(2.5) };
        case 'post': return { u: B.u + side * 0.3 * ease(3), v: Math.max(0, B.v + 0.5 * s - 2.4 * s * s), z: 1 - 0.4 * ease(2) };
        case 'bar': return { u: B.u + 0.1 * ease(2), v: Math.max(0, 1 + 1.1 * s - 1.8 * s * s), z: 1 + 0.35 * ease(2) };
        default: return { u: B.u * (1 + 0.25 * s), v: B.v + 0.8 * s, z: 1 + 0.9 * s }; // over / wide: into the stands
      }
    }
    // The keeper: u across and v off the ground (goal space), his lean (radians, + to the right) and how far into
    // the dive he is (0–1). Before the kick he sways on his line; a save takes him to the ball, otherwise he goes
    // the way he guessed (diveCol) and lands.
    keeperPose() {
      const tt = this.time;
      if (!this.result || (this.phase !== 'flight' && this.phase !== 'result')) return { u: Math.sin(tt * 2.3) * 0.1, v: Math.max(0, Math.sin(tt * 4.6)) * 0.03, angle: 0, k: 0 };
      const D = this.dur('flight'), col = this.result.diveCol, save = this.result.res === 'save';
      const k = this.phase === 'result' ? 1 : clamp((this.t / D - 0.12) / 0.6, 0, 1), e = 1 - (1 - k) * (1 - k);
      const tu = save ? this.ball.u * 0.85 : (col - 1) * 0.72, tv = save ? Math.max(0.15, this.ball.v * 0.75) : col === 1 ? 0.3 : 0.18;
      const fall = this.phase === 'result' ? Math.max(0, 1 - this.t * 2.5) : 1; // back down on the grass
      return { u: tu * e, v: tv * Math.sin(e * Math.PI * 0.5) * fall, angle: (col === 1 ? 0 : (col - 1) * 1.2) * e, k: e };
    }
  }
  RS.PKScene = PKScene;
})(globalThis.RS = globalThis.RS || {});
