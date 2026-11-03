/* 호날두 서바이버즈 — the penalty scene on screen (round 10). Renderer.renderPK draws a PKScene from behind the kicker
 * in a simple perspective — night sky and floodlights, the stands and their crowd, LED boards, the turf, the goal and
 * its net, the keeper, the ball, the kicker — then the aim grid, the power gauge and the 정확도 dial. The scene's vfx
 * become pixel effects (drawPfx); confetti and fireworks celebrate. Labels are drawn in device pixels last. */
(function (RS) {
  'use strict';
  const TAU = Math.PI * 2, HD = 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ZC = 0.45; // the camera stands this far behind the spot (spot → goal line = 1)
  const sAt = (z) => (1 + ZC) / Math.max(0.06, z + ZC); // how much bigger things look at depth z than on the goal line
  const NET_Z = 1.16, NET_TOP = 0.86, BOARD_Z = 1.42;
  const FONT = '"Galmuri11", "DungGeunMo", system-ui, sans-serif';
  const CONFETTI = ['#ffd23a', '#ff4a4a', '#4ae06a', '#7fe0ff', '#ffffff', '#ff8ad8'];
  const FIREWORKS = [RS.PFX_GOLD, RS.PFX_FIRE,
    ['#0b2340', '#1b5a9a', '#3aa0e8', '#8ad4ff', '#d8f3ff', '#ffffff'],
    ['#3a0a2a', '#a01a6a', '#e83a9a', '#ff8ad8', '#ffd0f0', '#ffffff'],
    ['#0a3a1a', '#1a8a3a', '#3ae06a', '#9af0a0', '#e0ffe0', '#ffffff']];
  const SKINS = ['#e8b48e', '#d9a27a', '#8a5a3a', '#c99070', '#5a3a26'];
  const ballR = (s) => 1.4 * Math.pow(s, 0.65); // the ball's radius at screen scale s
  const R = RS.Renderer.prototype;

  // goal space → screen (world px): u across (±1 the posts), v up (1 the bar), z deep (0 the spot, 1 the goal line)
  function proj(g, u, v, z) { const s = sAt(z); return { x: g.cx + u * g.halfW * s, y: g.yH + g.G * s - v * g.H * s, s }; }
  // a zone's cell on the goal mouth (zones as in pk.js: 1–3 along the ground, 7–9 under the bar)
  function cell(g, z) {
    const c = RS.pkCol(z), r = RS.pkRow(z);
    return { x0: g.cx + (-1 + c * 2 / 3) * g.halfW, x1: g.cx + (-1 + (c + 1) * 2 / 3) * g.halfW, y0: g.goalY - (r + 1) / 3 * g.H, y1: g.goalY - r / 3 * g.H };
  }

  // Goal geometry for this view (world px); also the scene's frame for hit-testing taps (PKScene.geo).
  R.pkGeo = function () {
    const V = this.view, g = this.pkG || (this.pkG = {});
    const halfW = Math.round(Math.min(V.w * 0.42, V.h * 0.24)), H = Math.round(halfW * 0.66);
    const goalY = Math.round(Math.max(H + 46, V.h * 0.42)), spotY = Math.round(goalY + (V.h - goalY) * 0.5);
    const G = (spotY - goalY) / (sAt(0) - 1);
    Object.assign(g, { cx: Math.round(V.w / 2), halfW, H, goalY, barY: goalY - H, spotY, G, yH: goalY - G });
    g.boardY = Math.round(g.yH + G * sAt(BOARD_Z));
    g.boardTop = Math.round(g.boardY - 0.34 * H * sAt(BOARD_Z));
    g.standTop = Math.max(0, g.boardTop - Math.round(H * 1.7));
    g.gaugeY = Math.round(goalY + (spotY - goalY) * 0.42);
    g.dialX = Math.round(g.cx + halfW * 0.55); g.dialY = g.gaugeY + 24; g.dialR = 15;
    return g;
  };

  R.pkReset = function () {
    this.pkSt = null; this.pfx.length = 0; this.shake = 0;
    if (this.pkW) this.pkW.pfxQ.length = 0;
  };
  R.pkState = function () { return this.pkSt || (this.pkSt = { cheer: 0, net: null, frameHit: 0, confetti: [], party: 0, partyT: 0, flash: 0, glow: null }); };

  R.renderPK = function (sc) {
    const L = this.lctx, V = this.view, g = this.pkGeo(), st = this.pkState();
    const W = this.pkW || (this.pkW = { pfxQ: [] });
    L.setTransform(HD, 0, 0, HD, 0, 0);
    this.alpha = 1;
    const now = performance.now(), dt = Math.min(0.05, this.pkT ? (now - this.pkT) / 1000 : 1 / 60), time = now / 1000;
    this.pkT = now;
    if (sc) {
      sc.geo = g;
      for (const f of sc.vfx) this.pkVfx(sc, f, g, st);
      sc.vfx.length = 0;
    }
    st.cheer = Math.max(0, st.cheer - dt * 0.45);
    st.frameHit = Math.max(0, st.frameHit - dt * 3);
    if (st.net && (st.net.t += dt) > 1.6) st.net = null;
    if (st.party > 0) { st.party -= dt; if ((st.partyT -= dt) <= 0) { st.partyT = 0.26 + Math.random() * 0.2; this.pkFirework(g); } }
    const idx = sc ? sc.o.yearIdx | 0 : 0, yd = RS.YEARS[idx] || RS.YEARS[0];
    this.pkStands(L, g, sc, time, st, idx);
    this.pkTurf(L, g, RS.ERAS[yd.era].theme);
    let ball = null;
    if (sc && sc.ball && (sc.phase === 'flight' || sc.phase === 'result')) { const k = sc.ballK(); ball = sc.ballAt(k); ball.k = k; }
    this.pkNet(L, g, st);
    if (ball && ball.z > 1) this.pkBall(L, g, sc, ball, time);
    this.pkFrame(L, g, st);
    this.pkKeeper(L, g, sc, time);
    if (!ball) this.pkBallAt(L, g, 0, 0, 0, time, 0); // waiting on the spot
    else if (ball.z <= 1) this.pkBall(L, g, sc, ball, time);
    this.pkKicker(L, g, sc, time);
    if (sc) this.pkOverlay(L, g, sc, time);
    this.drawPfx(L, W, 0, 0);
    this.pkGlow(L, st, dt);
    this.pkConfetti(L, st, dt, time);
    L.drawImage(this.vignette(), 0, 0, V.w, V.h);
    if (st.flash > 0) { // one white flash when our ball hits the net (or our keeper saves)
      L.fillStyle = 'rgba(255,255,255,' + (0.6 * st.flash).toFixed(3) + ')'; L.fillRect(0, 0, V.w, V.h);
      st.flash = Math.max(0, st.flash - dt * 4);
    }
    this.pkPresent(g, sc, dt);
    if (sc) this.pkLabels(this.ctx, g, sc);
  };

  // Upscale; a kick that can decide it zooms in on the goal while the ball flies, and a shake needs a little room.
  R.pkPresent = function (g, sc, dt) {
    const C = this.ctx, V = this.view, LW = this.low.width, LH = this.low.height, DW = V.w * this.scale, DH = V.h * this.scale;
    let z = 1;
    if (sc && sc.slow && sc.phase === 'flight') z = 1 + 0.24 * Math.min(1, sc.t / (sc.dur('flight') * 0.7));
    else if (sc && sc.slow && sc.phase === 'result') z = 1 + 0.24 * Math.max(0, 1 - sc.t / 0.5);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); z = Math.max(z, 1.04); }
    if (z === 1) { C.drawImage(this.low, 0, 0, DW, DH); return; }
    const sw = LW / z, sh = LH / z, jx = this.shake > 0 ? (Math.random() - 0.5) * 12 * this.shake * HD : 0, jy = this.shake > 0 ? (Math.random() - 0.5) * 12 * this.shake * HD : 0;
    const sx = clamp(g.cx * HD - sw / 2 + jx, 0, LW - sw), sy = clamp((g.goalY - g.H * 0.6) * HD - sh * 0.4 + jy, 0, LH - sh);
    C.drawImage(this.low, sx, sy, sw, sh, 0, 0, DW, DH);
  };

  // ---------------------------------------------------------------- the stadium
  R.pkStands = function (L, g, sc, time, st, idx) {
    const V = this.view;
    const sky = L.createLinearGradient(0, 0, 0, g.boardTop);
    sky.addColorStop(0, '#04071a'); sky.addColorStop(1, '#1a2442');
    L.fillStyle = sky; L.fillRect(0, 0, V.w, g.boardTop);
    for (const fx of [0.07, 0.93]) { // floodlights
      const x = V.w * fx, y = Math.max(8, g.standTop - 8), gr = L.createRadialGradient(x, y, 1, x, y, 42);
      gr.addColorStop(0, 'rgba(255,250,224,0.95)'); gr.addColorStop(0.12, 'rgba(255,246,206,0.4)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      L.fillStyle = gr; L.fillRect(x - 42, y - 42, 84, 84);
    }
    const crowd = this.pkCrowd(g, idx);
    L.drawImage(crowd[st.cheer > 0.15 ? 1 + (Math.floor(time * 8) % 2) : 0], 0, g.standTop, V.w, g.boardTop - g.standTop);
    if (sc && sc.who === 'hero' && (sc.phase === 'runup' || sc.phase === 'flight')) { // camera flashes
      for (let i = 0; i < 3; i++) {
        if (Math.random() > 0.35) continue;
        const x = Math.random() * V.w, y = g.standTop + Math.random() * (g.boardTop - g.standTop);
        L.fillStyle = 'rgba(255,255,255,0.35)'; L.fillRect(x - 1, y - 1, 3, 3);
        L.fillStyle = '#ffffff'; L.fillRect(x, y, 1, 1);
      }
    }
    // LED boards: they flash gold while the stadium celebrates
    const flash = st.cheer > 0.3 && Math.floor(time * 6) % 2 === 0, h = g.boardY - g.boardTop;
    const cols = flash ? ['#ffd23a', '#ff8a2a'] : ['#16306a', '#a01a2a', '#123a22', '#2a2a2a'];
    for (let x = 0, i = 0; x < V.w; x += 26, i++) {
      L.fillStyle = cols[i % cols.length]; L.fillRect(x, g.boardTop, 26, h);
      L.fillStyle = flash ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)';
      L.fillRect(x + 5, g.boardTop + Math.round(h * 0.35), 16, Math.max(1, Math.round(h * 0.3)));
    }
    L.fillStyle = 'rgba(255,255,255,0.2)'; L.fillRect(0, g.boardTop, V.w, 1);
  };
  // The crowd behind the goal, cached per view: our colours, the other side's and some neutrals; frames 1 and 2 have
  // alternate halves of it jumping with their arms up.
  R.pkCrowd = function (g, idx) {
    const V = this.view, h = Math.max(4, g.boardTop - g.standTop), yd = RS.YEARS[idx] || RS.YEARS[0];
    const kit = RS.ERAS[yd.era].kit, foe = RS.foeColors(idx);
    const key = V.w + 'x' + h + '|' + kit.main + kit.alt + '|' + foe.join();
    if (this.pkCrowdKey === key) return this.pkCrowdF;
    const cols = [kit.main, kit.main, kit.alt, kit.main, foe[0], foe[1] || '#222222', '#2a2a2a', '#f0f0f0'];
    const rng = RS.makeRng(7), people = [];
    for (let y = h - 2; y > 2; y -= 4) {
      for (let x = 1 + ((y >> 2) % 2) * 1.5; x < V.w - 1; x += 3) people.push({ x: x + rng() * 0.8, y, c: cols[(rng() * cols.length) | 0], s: SKINS[(rng() * SKINS.length) | 0], half: rng() < 0.5 });
    }
    this.pkCrowdF = [0, 1, 2].map((f) => {
      const c = document.createElement('canvas');
      c.width = V.w * HD; c.height = h * HD;
      const x = c.getContext('2d');
      x.setTransform(HD, 0, 0, HD, 0, 0);
      x.fillStyle = '#10182a'; x.fillRect(0, 0, V.w, h);
      x.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = h - 1; y > 0; y -= 4) x.fillRect(0, y, V.w, 0.5);
      for (const p of people) {
        const up = f > 0 && p.half === (f === 1), y = p.y - (up ? 1 : 0);
        x.fillStyle = p.c; x.fillRect(p.x - 1, y - 1.5, 2.5, 2);
        x.fillStyle = p.s; x.fillRect(p.x - 0.5, y - 3, 1.5, 1.5);
        if (up) { x.fillRect(p.x - 1.5, y - 4, 0.5, 1.5); x.fillRect(p.x + 1.5, y - 4, 0.5, 1.5); }
      }
      const gr = x.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(4,7,20,0.6)'); gr.addColorStop(0.55, 'rgba(4,7,20,0)');
      x.fillStyle = gr; x.fillRect(0, 0, V.w, h);
      return c;
    });
    this.pkCrowdKey = key;
    return this.pkCrowdF;
  };
  // Turf in mowing bands that widen toward the camera; the goal line, the six-yard box and the spot.
  R.pkTurf = function (L, g, th) {
    const V = this.view;
    let y0 = g.boardY;
    for (let z = BOARD_Z - 0.14, i = 0; y0 < V.h; z -= 0.14, i++) {
      const y1 = z > -0.4 ? proj(g, 0, 0, z).y : V.h;
      L.fillStyle = i % 2 ? th.g1 : th.g2;
      L.fillRect(0, Math.floor(y0), V.w, Math.ceil(Math.min(V.h, y1) - Math.floor(y0)) + 1);
      y0 = y1;
    }
    L.fillStyle = 'rgba(0,0,0,0.18)'; L.fillRect(0, g.boardY, V.w, g.goalY - g.boardY); // the shade of the stand roof
    L.fillStyle = 'rgba(255,255,255,0.85)';
    L.fillRect(0, g.goalY, V.w, 1);
    const b0 = proj(g, -2.5, 0, 0.5), b1 = proj(g, 2.5, 0, 0.5), c0 = proj(g, -2.5, 0, 1), c1 = proj(g, 2.5, 0, 1);
    L.fillRect(Math.max(0, b0.x), Math.round(b0.y), Math.min(V.w, b1.x) - Math.max(0, b0.x), 1);
    L.strokeStyle = 'rgba(255,255,255,0.85)'; L.lineWidth = 1;
    L.beginPath(); L.moveTo(c0.x, c0.y); L.lineTo(b0.x, b0.y); L.moveTo(c1.x, c1.y); L.lineTo(b1.x, b1.y); L.stroke();
    const sp = proj(g, 0, 0, 0);
    L.fillStyle = '#f4f4f4'; L.beginPath(); L.ellipse(sp.x, sp.y + 1, 3, 1.2, 0, 0, TAU); L.fill();
  };
  // The net — back, roof and sides as a mesh. A goal ripples it out from where the ball went in (st.net).
  R.pkNet = function (L, g, st) {
    const N = st.net;
    const pt = (u, v, z) => {
      const p = proj(g, u, v, z);
      if (N) {
        const dx = p.x - N.x, dy = p.y - N.y, d2 = dx * dx + dy * dy, w = Math.exp(-d2 / 420);
        if (w > 0.02) {
          const d = Math.sqrt(d2) || 1, amp = N.a * w * Math.exp(-N.t * 3) * Math.cos(N.t * 24 - d * 0.25);
          p.x -= (dx / d) * amp * 0.6; p.y -= (dy / d) * amp * 0.6 - amp * 0.35;
        }
      }
      return p;
    };
    const NU = 14, NV = 6;
    L.strokeStyle = 'rgba(236,242,248,0.5)'; L.lineWidth = 0.5;
    L.beginPath();
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const p = pt(-1 + 2 * i / NU, NET_TOP * j / NV, NET_Z); if (j) L.lineTo(p.x, p.y); else L.moveTo(p.x, p.y); }
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { const p = pt(-1 + 2 * i / NU, NET_TOP * j / NV, NET_Z); if (i) L.lineTo(p.x, p.y); else L.moveTo(p.x, p.y); }
    for (let i = 0; i <= NU; i++) { const u = -1 + 2 * i / NU, a = pt(u, 1, 1), b = pt(u, NET_TOP, NET_Z); L.moveTo(a.x, a.y); L.lineTo(b.x, b.y); }
    for (const u of [-1, 1]) for (let j = 0; j <= NV; j++) { const a = pt(u, j / NV, 1), b = pt(u, NET_TOP * j / NV, NET_Z); L.moveTo(a.x, a.y); L.lineTo(b.x, b.y); }
    L.stroke();
  };
  // posts and bar (white; a hit makes them ring bright)
  R.pkFrame = function (L, g, st) {
    const x0 = g.cx - g.halfW, x1 = g.cx + g.halfW;
    L.fillStyle = st.frameHit > 0 ? '#ffffff' : '#e8edf2';
    L.fillRect(x0 - 1, g.barY - 1, 1.5, g.H + 1);
    L.fillRect(x1 - 0.5, g.barY - 1, 1.5, g.H + 1);
    L.fillRect(x0 - 1, g.barY - 1, x1 - x0 + 2, 1.5);
    L.fillStyle = 'rgba(0,0,0,0.28)';
    L.fillRect(x0 + 0.5, g.barY + 0.5, 0.5, g.H - 0.5); L.fillRect(x1 - 0.5, g.barY + 0.5, 0.5, g.H - 0.5); L.fillRect(x0 + 0.5, g.barY + 0.5, x1 - x0 - 1, 0.5);
    if (st.frameHit > 0) {
      L.globalCompositeOperation = 'lighter'; L.fillStyle = 'rgba(255,255,220,' + (0.5 * st.frameHit) + ')';
      L.fillRect(x0 - 2, g.barY - 2, 3.5, g.H + 3); L.fillRect(x1 - 1.5, g.barY - 2, 3.5, g.H + 3); L.fillRect(x0 - 2, g.barY - 2, x1 - x0 + 4, 3.5);
      L.globalCompositeOperation = 'source-over';
    }
  };

  // ---------------------------------------------------------------- the people and the ball
  R.pkKeeper = function (L, g, sc, time) {
    const look = (sc && sc.o.keeper && sc.o.keeper.look) || RS.PK_OUR_LOOK, spr = RS.Sprites.pkKeeper(look);
    const pose = sc ? sc.keeperPose() : { u: Math.sin(time * 2.3) * 0.1, v: 0, angle: 0, k: 0 };
    const w = spr.w * 2, h = spr.h * 2, base = proj(g, pose.u, pose.v, 1), ground = proj(g, pose.u, 0, 1);
    L.fillStyle = 'rgba(0,0,0,' + Math.max(0.1, 0.32 - pose.v * 0.3) + ')';
    L.beginPath(); L.ellipse(ground.x, ground.y, w * 0.34, 1.6, 0, 0, TAU); L.fill();
    const fr = spr.frames[pose.k > 0.05 ? 4 : Math.floor(time * 3) % 2 ? 0 : 2];
    L.save(); L.translate(base.x, base.y - h / 2); L.rotate(pose.angle);
    L.drawImage(fr.n, -w / 2, -h / 2, w, h);
    L.restore();
  };
  R.pkBall = function (L, g, sc, b, time) {
    const hot = sc.mode === 'shoot' && !sc.o.forced && sc.acc === 'great' && RS.pkPowerGrade(sc.power == null ? 0.8 : sc.power) === 'perfect';
    if (b.k < 1.5) { // after-images (a golden streak for a perfect strike)
      for (let i = 3; i >= 1; i--) {
        const q = sc.ballAt(Math.max(0, b.k - i * 0.05)), p = proj(g, q.u, q.v, q.z), r = ballR(p.s) * (hot ? 1.25 : 1);
        L.globalAlpha = (hot ? 0.18 : 0.12) * (4 - i);
        L.fillStyle = hot ? '#ffd23a' : '#ffffff';
        L.beginPath(); L.arc(p.x, p.y - r, r, 0, TAU); L.fill();
      }
      L.globalAlpha = 1;
    }
    this.pkBallAt(L, g, b.u, b.v, b.z, time, b.k < 1.3 ? 1 : 0.25);
  };
  R.pkBallAt = function (L, g, u, v, z, time, spin) {
    const p = proj(g, u, v, z), gp = proj(g, u, 0, z), r = ballR(p.s);
    if (gp.y >= g.boardY) { L.fillStyle = 'rgba(0,0,0,0.3)'; L.beginPath(); L.ellipse(gp.x, gp.y, r * 1.1, r * 0.4, 0, 0, TAU); L.fill(); }
    const x = p.x, y = p.y - r;
    L.fillStyle = '#151515'; L.beginPath(); L.arc(x, y, r + 0.5, 0, TAU); L.fill();
    L.fillStyle = '#f6f6f6'; L.beginPath(); L.arc(x, y, r, 0, TAU); L.fill();
    if (r > 1.6) {
      const a = time * 14 * spin;
      L.fillStyle = '#2a2a2a';
      for (let i = 0; i < 3; i++) { const aa = a + i * TAU / 3; L.fillRect(x + Math.cos(aa) * r * 0.55 - 0.5, y + Math.sin(aa) * r * 0.55 - 0.5, 1, 1); }
    }
    L.fillStyle = '#ffffff'; L.fillRect(x - r * 0.5, y - r * 0.6, 0.5, 0.5);
  };
  // The kicker, three times life size, from behind: waits left of the ball, runs up, strikes; a scorer turns to the
  // crowd with his arms up (날두 jumps for his SIUU).
  R.pkKicker = function (L, g, sc, time) {
    if (!sc) return;
    const S = RS.Sprites, o = sc.o, idx = o.yearIdx | 0;
    const spr = sc.who === 'hero' ? S.pkHero(o.hero, idx, o.small, o.nat) : sc.who === 'mate' ? S.pkMate(idx, o.n || 0, o.nat ? RS.NAT_KITS[o.hero] : null) : S.pkFoe(idx, o.n || 0);
    const w = spr.w * 3, h = spr.h * 3, x0 = g.cx - g.halfW * 0.36, y0 = g.spotY + 32, x1 = g.cx - 7, y1 = g.spotY + 12;
    let x = x0, y = y0 + Math.sin(time * 3) * 0.4, fr = 0, jump = 0;
    if (sc.phase === 'runup') {
      const q = clamp(sc.t / sc.dur('runup'), 0, 1);
      x = lerp(x0, x1, q); y = lerp(y0, y1, q); fr = q > 0.8 ? 4 : Math.floor(q * 7) % 4;
    } else if (sc.phase === 'flight' || sc.phase === 'result') {
      x = x1; y = y1; fr = 4;
      if (sc.phase === 'result' && sc.result.goal) {
        fr = 5;
        jump = Math.sin(Math.min(1, sc.t / 0.55) * Math.PI) * (sc.who === 'hero' && o.hero === 'ronaldo' ? 14 : 6);
      } else if (sc.phase === 'result') fr = 0;
    }
    L.fillStyle = 'rgba(0,0,0,0.3)'; L.beginPath(); L.ellipse(x, y, w * 0.3, 2.4, 0, 0, TAU); L.fill();
    if (sc.who === 'hero') { L.strokeStyle = 'rgba(255,216,74,0.85)'; L.lineWidth = 1; L.beginPath(); L.ellipse(x, y, w * 0.36, 3.2, 0, 0, TAU); L.stroke(); } // the hero's gold ring, as on the pitch
    L.drawImage(spr.frames[fr].n, Math.round(x - w / 2), Math.round(y - h - jump), w, h);
  };

  // ---------------------------------------------------------------- aim grid, power gauge, 정확도 dial, dive pick
  R.pkOverlay = function (L, g, sc, time) {
    const ph = sc.phase, own = sc.mode === 'shoot' && !sc.o.forced;
    if (own && ph === 'aim') this.pkGrid(L, g, sc, time);
    if (own && sc.zone && (ph === 'power' || ph === 'acc' || ph === 'runup')) this.pkMark(L, g, sc.zone, time);
    if (own && (ph === 'power' || ((ph === 'acc' || ph === 'runup') && sc.power != null))) this.pkGauge(L, g, sc);
    if (own && (ph === 'acc' || (ph === 'runup' && sc.acc))) this.pkDial(L, g, sc);
    if (sc.mode === 'keep' && ph === 'guess') this.pkGuess(L, g, sc, time);
  };
  // open cells tinted by their odds (green ≥ 80 %, yellow ≥ 65 %, orange below); locked ones dark
  R.pkGrid = function (L, g, sc, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    for (let z = 1; z <= 9; z++) {
      const c = cell(g, z), open = z <= sc.zones;
      if (open) { const p = sc.zoneOdds(z); L.fillStyle = (p >= 0.8 ? 'rgba(74,224,106,' : p >= 0.65 ? 'rgba(255,210,58,' : 'rgba(255,120,60,') + (0.16 + 0.1 * pulse) + ')'; }
      else L.fillStyle = 'rgba(0,0,0,0.45)';
      L.fillRect(c.x0 + 0.5, c.y0 + 0.5, c.x1 - c.x0 - 1, c.y1 - c.y0 - 1);
      L.strokeStyle = open ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.15)'; L.lineWidth = 0.5;
      L.strokeRect(c.x0 + 0.75, c.y0 + 0.75, c.x1 - c.x0 - 1.5, c.y1 - c.y0 - 1.5);
    }
  };
  R.pkMark = function (L, g, z, time) {
    const c = cell(g, z), x = (c.x0 + c.x1) / 2, y = (c.y0 + c.y1) / 2, r = 3 + Math.sin(time * 8) * 0.6;
    L.strokeStyle = '#ff4a4a'; L.lineWidth = 1;
    L.beginPath(); L.arc(x, y, r, 0, TAU);
    L.moveTo(x - r - 2, y); L.lineTo(x - r + 1, y); L.moveTo(x + r - 1, y); L.lineTo(x + r + 2, y);
    L.moveTo(x, y - r - 2); L.lineTo(x, y - r + 1); L.moveTo(x, y + r - 1); L.lineTo(x, y + r + 2);
    L.stroke();
  };
  R.pkGauge = function (L, g, sc) {
    const P = RS.PK_POWER, x0 = Math.round(g.cx - g.halfW * 0.75), w = Math.round(g.halfW * 1.5), y = g.gaugeY, h = 5;
    L.fillStyle = 'rgba(0,0,0,0.65)'; L.fillRect(x0 - 1.5, y - 1.5, w + 3, h + 3);
    const seg = (a, b, col) => { L.fillStyle = col; L.fillRect(x0 + a * w, y, (b - a) * w, h); };
    seg(0, P.weak, '#5a6470'); seg(P.weak, P.perfect[0], '#d8c040'); seg(P.perfect[0], P.perfect[1], '#4ae06a'); seg(P.perfect[1], P.over, '#d8c040'); seg(P.over, 1, '#ff4a4a');
    L.fillStyle = 'rgba(255,255,255,0.3)'; L.fillRect(x0, y, w, 1);
    const v = sc.phase === 'power' ? sc.gauge() : sc.power, mx = x0 + v * w;
    L.fillStyle = '#ffffff'; L.fillRect(mx - 0.5, y - 3, 1, h + 6);
    L.beginPath(); L.moveTo(mx - 2.5, y - 4.5); L.lineTo(mx + 2.5, y - 4.5); L.lineTo(mx, y - 1.5); L.fill();
  };
  // 정확도 (a Dead by Daylight skill check): the needle turns from the top; stop it on the white arc, the gold one
  // in its middle is perfect
  R.pkDial = function (L, g, sc) {
    const x = g.dialX, y = g.dialY, r = g.dialR, T = sc.timing, rad = (deg) => (deg - 90) * Math.PI / 180;
    L.fillStyle = 'rgba(0,0,0,0.6)'; L.beginPath(); L.arc(x, y, r + 3.5, 0, TAU); L.fill();
    L.strokeStyle = 'rgba(255,255,255,0.35)'; L.lineWidth = 1; L.beginPath(); L.arc(x, y, r, 0, TAU); L.stroke();
    L.lineWidth = 3;
    L.strokeStyle = '#f4f4f4'; L.beginPath(); L.arc(x, y, r, rad(sc.target - T.good / 2), rad(sc.target + T.good / 2)); L.stroke();
    L.strokeStyle = '#ffd23a'; L.beginPath(); L.arc(x, y, r, rad(sc.target - T.great / 2), rad(sc.target + T.great / 2)); L.stroke();
    const a = rad(sc.phase === 'acc' ? sc.needle() : sc.needleAt);
    L.strokeStyle = '#ff3a3a'; L.lineWidth = 1.5;
    L.beginPath(); L.moveTo(x, y); L.lineTo(x + Math.cos(a) * (r + 2.5), y + Math.sin(a) * (r + 2.5)); L.stroke();
    L.fillStyle = '#ff3a3a'; L.beginPath(); L.arc(x, y, 1.5, 0, TAU); L.fill();
  };
  // our keeper: three columns to dive to, and the time left to choose
  R.pkGuess = function (L, g, sc, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6), cw = g.halfW * 2 / 3;
    for (let c = 0; c < 3; c++) {
      const x0 = g.cx + (-1 + c * 2 / 3) * g.halfW;
      L.fillStyle = 'rgba(127,224,255,' + (0.1 + 0.08 * pulse) + ')'; L.fillRect(x0 + 0.5, g.barY + 0.5, cw - 1, g.H - 1);
      L.strokeStyle = 'rgba(127,224,255,0.7)'; L.lineWidth = 0.5; L.strokeRect(x0 + 0.75, g.barY + 0.75, cw - 1.5, g.H - 1.5);
    }
    const k = sc.o.auto ? 1 : Math.max(0, 1 - sc.t / 3.2), w = g.halfW * 1.5;
    L.fillStyle = 'rgba(0,0,0,0.6)'; L.fillRect(g.cx - w / 2 - 1, g.gaugeY - 1, w + 2, 4);
    L.fillStyle = '#7fe0ff'; L.fillRect(g.cx - w / 2, g.gaugeY, w * k, 2);
  };
  // labels in device pixels: odds on the open cells, the level that opens the locked ones, how the strike went
  R.pkLabels = function (C, g, sc) {
    const s = this.scale, base = Math.round(15 * (this.dpr || 1)), ph = sc.phase, own = sc.mode === 'shoot' && !sc.o.forced; // 15 CSS px
    C.textAlign = 'center'; C.textBaseline = 'middle'; C.lineJoin = 'round';
    const text = (str, x, y, size, color) => {
      C.font = '900 ' + Math.round(size) + 'px ' + FONT;
      C.lineWidth = Math.max(2, s * 0.8); C.strokeStyle = 'rgba(0,0,0,0.85)';
      C.strokeText(str, x * s, y * s); C.fillStyle = color; C.fillText(str, x * s, y * s);
    };
    if (own && ph === 'aim') {
      for (let z = 1; z <= 9; z++) {
        const c = cell(g, z), x = (c.x0 + c.x1) / 2, y = (c.y0 + c.y1) / 2;
        if (z <= sc.zones) {
          text(Math.round(sc.zoneOdds(z) * 100) + '%', x, y + 0.5, base * 0.95, '#ffffff');
          text(String(z), c.x0 + 3, c.y0 + 3.2, base * 0.6, 'rgba(255,255,255,0.8)');
        } else text('🔒Lv.' + RS.PK_ZONE_LV[z <= 6 ? 0 : 1], x, y, base * 0.7, 'rgba(255,255,255,0.6)');
      }
    }
    if (own && (ph === 'power' || ph === 'acc' || ph === 'runup')) {
      const x0 = g.cx - g.halfW * 0.75;
      if (ph === 'power') text('파워', x0 - 9, g.gaugeY + 2.5, base * 0.75, '#ffffff');
      else if (sc.power != null) {
        const pg = RS.pkPowerGrade(sc.power);
        text({ perfect: '파워 최고!', ok: '파워 좋음', weak: '힘이 약하다', over: '너무 세다!' }[pg], x0 + sc.power * g.halfW * 1.5, g.gaugeY - 7, base * 0.8,
          { perfect: '#4ae06a', ok: '#ffe27a', weak: '#c8d0d8', over: '#ff6a6a' }[pg]);
      }
    }
    if (own && ph === 'acc') text('정확도', g.dialX, g.dialY + g.dialR + 8, base * 0.75, '#ffffff');
    if (own && ph === 'runup' && sc.acc) text({ great: '완벽!', good: '좋아', miss: '빗나간다…' }[sc.acc], g.dialX, g.dialY - g.dialR - 8, base * 0.95, { great: '#ffd23a', good: '#ffffff', miss: '#ff6a6a' }[sc.acc]);
    if (sc.mode === 'keep' && ph === 'guess') for (let c = 0; c < 3; c++) text(['◀', '▲', '▶'][c], g.cx + (-1 + (c + 0.5) * 2 / 3) * g.halfW, g.goalY - g.H / 2, base * 1.6, '#7fe0ff');
  };

  // ---------------------------------------------------------------- effects
  R.pkVfx = function (sc, f, g, st) {
    const p = proj(g, f.u, f.v, 1), Q = this.pkW.pfxQ, ours = sc.mode === 'shoot', seed = (Math.random() * 1e6) | 0;
    if (f.kind === 'goal') {
      st.net = { x: p.x, y: p.y, t: 0, a: sc.slow ? 9 : 7 };
      Q.push({ fx: 'goldBurst', x: p.x, y: p.y + 8, palette: ours ? RS.PFX_GOLD : RS.PFX_WHITE, seed });
      if (ours) {
        // our goal: the net bulges, a gold firework bursts out of it, the screen flashes white and light floods out
        // of the spot; the stands fire a few rockets for the hero's own goal
        st.cheer = 1;
        Q.push({ fx: 'sparkPop', x: p.x, y: p.y + 2, palette: RS.PFX_GOLD, seed: seed + 1 });
        Q.push({ fx: 'firework', x: p.x, y: p.y + 4, palette: RS.PFX_GOLD, seed: seed + 2 });
        st.flash = sc.slow ? 1 : 0.7;
        st.glow = { x: p.x, y: p.y, t: 0 };
        if (sc.who === 'hero') { st.party = Math.max(st.party, 0.9); st.partyT = 0.2; }
      }
      this.shake = Math.max(this.shake, ours ? (sc.slow ? 0.5 : 0.3) : 0.12);
    } else if (f.kind === 'save') {
      Q.push({ fx: 'hitSpark', x: p.x, y: p.y, angle: -Math.PI / 2, seed });
      Q.push({ fx: 'sparkPop', x: p.x, y: p.y + 3, palette: RS.PFX_WHITE, seed: seed + 1 });
      if (!ours) { st.cheer = 1; st.flash = 0.45; Q.push({ fx: 'firework', x: p.x, y: p.y + 4, palette: RS.PFX_WHITE, seed: seed + 2 }); } // our keeper's save
      this.shake = Math.max(this.shake, 0.25);
    } else if (f.kind === 'frame') {
      Q.push({ fx: 'sparkPop', x: p.x, y: p.y + 3, palette: RS.PFX_WHITE, seed });
      st.frameHit = 1;
      if (!ours) st.cheer = 1;
      this.shake = Math.max(this.shake, 0.22);
    }
  };
  R.pkFirework = function (g) {
    const V = this.view;
    this.pkW.pfxQ.push({ fx: 'firework', x: V.w * (0.12 + Math.random() * 0.76), y: g.boardTop - Math.random() * 10,
      palette: FIREWORKS[(Math.random() * FIREWORKS.length) | 0], seed: (Math.random() * 1e6) | 0 });
  };
  // light flooding out of the spot where our ball went in (additive, 0.7 s)
  R.pkGlow = function (L, st, dt) {
    const G = st.glow;
    if (!G) return;
    const k = (G.t += dt) / 0.7;
    if (k >= 1) { st.glow = null; return; }
    const r = 8 + k * 40, a = 0.85 * (1 - k) * (1 - k), gr = L.createRadialGradient(G.x, G.y, 0, G.x, G.y, r);
    gr.addColorStop(0, 'rgba(255,240,170,' + a.toFixed(3) + ')');
    gr.addColorStop(0.4, 'rgba(255,210,58,' + (a * 0.5).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,190,40,0)');
    L.globalCompositeOperation = 'lighter';
    L.fillStyle = gr; L.fillRect(G.x - r, G.y - r, r * 2, r * 2);
    L.globalCompositeOperation = 'source-over';
  };
  // big: a won shootout or a perfect PK 챌린지 — fireworks over the stands and a storm of confetti
  R.pkCelebrate = function (big) {
    const V = this.view, st = this.pkState();
    st.party = big ? 2.8 : 1.1; st.partyT = 0; st.cheer = 1;
    const n = big ? 120 : 40;
    for (let i = 0; i < n; i++) st.confetti.push({ x: Math.random() * V.w, y: -Math.random() * V.h * 0.6, vx: (Math.random() - 0.5) * 24, vy: 22 + Math.random() * 32, c: CONFETTI[i % CONFETTI.length], ph: Math.random() * TAU });
  };
  R.pkConfetti = function (L, st, dt, time) {
    const V = this.view, A = st.confetti;
    let n = 0;
    for (const c of A) {
      c.x += (c.vx + Math.sin(time * 4 + c.ph) * 12) * dt; c.y += c.vy * dt;
      if (c.y > V.h + 4) continue;
      A[n++] = c;
      L.fillStyle = c.c; L.fillRect(c.x, c.y, Math.sin(time * 9 + c.ph) > 0 ? 1.5 : 0.5, 1);
    }
    A.length = n;
  };
})(globalThis.RS = globalThis.RS || {});
