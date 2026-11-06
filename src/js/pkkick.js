/* 호날두 서바이버즈 — the penalty taker (round 18): Renderer.pkKicker redrawn as a jointed pixel figure, seen from
 * behind, so each shot type (RS.PK_SHOTS, PKScene.style()) has its own stance, run-up, strike and follow-through:
 * 🦶 밀어차기 a side-foot push, 🚀 발등슛 a long straight charge, a laces strike and a hop landing on the kicking foot,
 * 🌀 감아차기 a curved approach from wider, the body leaning away and the leg wrapping across, and a soft chip for a
 * 파넨카 or a barely touched 'slow' ball. A kicker whose 파넨카s failed (사기 저하, opt.morale 1–3) waits slumped, with
 * a sweat drop, then a gloomy little cloud, then rain from it. A left-footer (RS.pkFoot: 메시) stands on the other side of the ball and is drawn mirrored.
 * The head and the torso are cut from the season's PK sprite (RS.Sprites.pkHero / pkMate / pkFoe, frame 0), so hair,
 * kit and pattern stay his; arms and legs are drawn here, pixel by pixel, in colours read off that sprite. A scorer
 * still turns to the crowd with the sprite's celebration frame (5). Also here: the strike's effects (a flash at the
 * boot, turf and a shock ring for the 발등슛, a spin swirl for the 감아차기), the ball's trail per type (wrapping
 * Renderer.pkBall) and a bigger goal for each (wrapping Renderer.pkVfx). Loaded right after pkrender.js. */
(function (RS) {
  'use strict';
  const R = RS.Renderer.prototype;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const CELL = 1.5; // world px per pixel of the figure: the PK sprites' HD pixel at three times life size
  const DEPTH = 0.5; // a cell toward the goal shows this much higher on screen (the camera looks down a little)
  const KW = 72, KH = 76, AX = 36, AY = 66; // the figure's own canvas (cells) and the ground point under his pelvis
  const LEG = { thigh: 4.6, shin: 5, foot: 3.4, hip: 3.2 };
  const ARM = { upper: 4.4, fore: 4, sh: 7.5 };
  const OUT = '#100c0a';
  // the goal's perspective, as in pkrender.js (ZC: the camera stands this far behind the spot)
  const ZC = 0.45, sAt = (z) => (1 + ZC) / Math.max(0.06, z + ZC);
  const proj = (g, u, v, z) => { const s = sAt(z); return { x: g.cx + u * g.halfW * s, y: g.yH + g.G * s - v * g.H * s, s }; };
  const ballR = (s) => 1.4 * Math.pow(s, 0.65);
  const ICE = ['#0b2340', '#1b5a9a', '#3aa0e8', '#8ad4ff', '#d8f3ff', '#ffffff'];

  // ---------------------------------------------------------------- his look, read off the sprite
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const hex = (v) => '#' + v.map((q) => clamp(Math.round(q), 0, 255).toString(16).padStart(2, '0')).join('');
  const shade = (c, k) => { const n = parseInt(c.slice(1), 16), v = [n >> 16, (n >> 8) & 255, n & 255]; return hex(v.map((q) => (k > 0 ? q + (255 - q) * k : q * (1 + k)))); };
  const LOOKS = new WeakMap();
  // The PK person (sprites.js pkPerson): 13 template pixels across, each 2 × 2 canvas pixels with a 2-pixel pad; rows
  // 0–4 head, 5 neck, 6 shoulders, 7–9 arms (the hands' row 10), 11–12 shorts, 13–15 legs (메시 before the hormone
  // treatment: one arm row and one shorts row less). Colour areas are lit on the upper left and shaded on the lower
  // right, so the samples are taken inside an area or undone from a known rim.
  function lookOf(spr) {
    let L = LOOKS.get(spr);
    if (L) return L;
    const c = spr.frames[0].n, kid = spr.h < 17, all = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; // one readback
    const px = (x, y, rim) => {
      const i = (y * c.width + x) * 4, v = [all[i], all[i + 1], all[i + 2]];
      return rim === 'lit' ? v.map((q) => (q - 51) / 0.8) : rim === 'dark' ? v.map((q) => q / 0.74) : v;
    };
    const legRow = kid ? 11 : 13, shortsEnd = kid ? 10 : 12, hands = kid ? 9 : 10;
    const skinV = px(14, 12), skin = hex(skinV);
    const band = px(7, 16, 'lit'), bare = px(7, 16, 'dark');
    const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 60;
    L = {
      skin, kit: hex(px(14, 16)), sock: hex(px(11, 2 * legRow + 4)), boot: hex(px(11, 2 * legRow + 6, 'lit')),
      shorts: hex(kid ? px(14, 22, 'lit') : px(14, 26)),
      band: far(bare, skinV) ? hex(band) : null, // the captain's armband on his left arm
      torsoH: 2 * (shortsEnd - 5), sideH: 2 * (hands - 5)
    };
    // the head (rows 0–5, the whole width) and the torso without its arms (rows 6 … the shorts, columns 3–9)
    L.head = canvas(c.width, 14); L.head.getContext('2d').drawImage(c, 0, 0, c.width, 14, 0, 0, c.width, 14);
    L.torso = canvas(16, L.torsoH + 1);
    const t = L.torso.getContext('2d');
    t.drawImage(c, 8, 14, 14, L.torsoH, 1, 0, 14, L.torsoH);
    t.fillStyle = OUT; t.fillRect(0, 0, 1, L.sideH); t.fillRect(15, 0, 1, L.sideH); t.fillRect(3, L.torsoH, 10, 1); // the cut edges and the hem
    LOOKS.set(spr, L);
    return L;
  }

  // ---------------------------------------------------------------- poses
  // A pose (right-footed; a left-footer is drawn mirrored): the body (rol lean to his right +, pit forward +, yaw
  // chest turned to his left +, hop up, fwd toward the goal, dx across, in cells), each leg (l… / r…: a thigh swung
  // forward +, b knee bend, c spread outward +, p foot pitch toe-down +, e foot turned out +) and each arm (L… / R…:
  // a swung forward +, b elbow bend, c upper arm spread outward +, f forearm spread outward +).
  const KEYS = ['rol', 'pit', 'yaw', 'hop', 'fwd', 'dx', 'la', 'lb', 'lc', 'lp', 'le', 'ra', 'rb', 'rc', 'rp', 're', 'La', 'Lb', 'Lc', 'Lf', 'Ra', 'Rb', 'Rc', 'Rf'];
  const STAND = { rol: 0, pit: 0, yaw: 0, hop: 0, fwd: 0, dx: 0, la: 0, lb: 0.12, lc: 0.1, lp: 0, le: 0.25, ra: 0, rb: 0.12, rc: 0.1, rp: 0, re: 0.25,
    La: 0.05, Lb: 0.35, Lc: 0.16, Lf: 0.1, Ra: 0.05, Rb: 0.35, Rc: 0.16, Rf: 0.1 };
  const P = (o) => Object.assign({}, STAND, o);
  const mix = (a, b, t) => { const o = {}; for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
  const HIPS = { La: -0.15, Lb: 0.1, Lc: 0.95, Lf: -0.75, Ra: -0.15, Rb: 0.1, Rc: 0.95, Rf: -0.75 }; // hands on the hips
  // before the run-up: 밀어차기 loose, 발등슛 feet apart and hands on the hips (the deep breath), 감아차기 side-on
  const WAIT = {
    push: P({ La: 0.1, Ra: 0.05 }),
    drive: P(Object.assign({ lc: 0.32, rc: 0.32, pit: -0.06 }, HIPS)),
    curl: P({ yaw: 0.3, la: 0.22, ra: -0.22, rb: 0.3, rol: -0.06, La: 0.2, Lc: 0.3, Ra: -0.15 })
  };
  WAIT.chip = WAIT.push;
  // the strike, right foot: the plant beside the ball, the leg cocked, the contact
  const PLANT = P({ la: 0.3, lb: 0.35, lc: 0.05, le: 0.1, ra: -0.45, rb: 1.4, rc: 0.12, rp: 0.4, La: 0.3, Lb: 0.5, Lc: 0.9, Ra: -0.4, Rb: 0.6, Rc: 0.35, rol: -0.12, pit: 0.15 });
  const COCK = {
    push: P({ la: 0.12, lb: 0.45, ra: -0.75, rb: 1.95, rc: 0.15, rp: 0.5, re: 0.5, La: 0.35, Lb: 0.4, Lc: 1.25, Ra: -0.7, Rb: 0.5, Rc: 0.5, rol: -0.2, pit: 0.18, yaw: 0.15, hop: -0.6 }),
    drive: P({ la: 0.15, lb: 0.5, ra: -0.85, rb: 2.1, rc: 0.08, rp: 0.7, La: 0.4, Lb: 0.3, Lc: 1.3, Ra: -0.8, Rb: 0.4, Rc: 0.45, rol: -0.12, pit: 0.38, yaw: 0.05, hop: -0.8 }),
    curl: P({ la: 0.12, lb: 0.45, lc: 0.15, ra: -0.7, rb: 1.9, rc: 0.35, rp: 0.45, re: 0.7, La: 0.3, Lb: 0.4, Lc: 1.35, Ra: -0.6, Rb: 0.5, Rc: 0.7, rol: -0.32, pit: -0.05, yaw: 0.4, hop: -0.6 }),
    chip: P({ la: 0.1, lb: 0.35, ra: -0.5, rb: 1.5, rc: 0.1, rp: 0.2, La: 0.25, Lb: 0.4, Lc: 0.8, Ra: -0.3, Rc: 0.3, rol: -0.1, pit: 0.05, hop: -0.3 })
  };
  const HIT = {
    push: P({ la: 0.05, lb: 0.4, ra: 0.3, rb: 0.3, rc: -0.1, rp: 0.15, re: 1.15, La: 0.2, Lb: 0.4, Lc: 1.1, Ra: -0.3, Rb: 0.5, Rc: 0.7, rol: -0.18, pit: 0.15, yaw: 0.2, hop: -0.5 }),
    drive: P({ la: 0.05, lb: 0.45, ra: 0.35, rb: 0.12, rc: 0.02, rp: 1.25, re: 0, La: 0.15, Lb: 0.3, Lc: 1.2, Ra: -0.4, Rb: 0.4, Rc: 0.6, rol: -0.1, pit: 0.36, yaw: 0, hop: -0.7 }),
    curl: P({ la: 0.05, lb: 0.4, lc: 0.15, ra: 0.25, rb: 0.35, rc: -0.28, rp: 0.35, re: 1.25, La: 0.1, Lb: 0.4, Lc: 1.4, Ra: -0.2, Rb: 0.5, Rc: 0.8, rol: -0.36, pit: -0.15, yaw: 0.45, hop: -0.5 }),
    chip: P({ la: 0.05, lb: 0.35, ra: 0.12, rb: 0.55, rc: 0, rp: -0.45, re: 0.2, La: 0.2, Lb: 0.4, Lc: 0.7, Ra: -0.2, Rb: 0.4, Rc: 0.4, rol: -0.08, pit: 0.05, hop: -0.3 })
  };
  // the follow-through (≈0.22 s after the contact) and the landing (≈0.5 s)
  const FOLLOW = {
    push: P({ la: -0.1, lb: 0.4, ra: 1.0, rb: 0.2, rc: -0.5, rp: 0.3, re: 0.9, La: 0, Lb: 0.4, Lc: 1.0, Ra: 0.3, Rb: 0.6, Rc: 0.6, rol: -0.2, pit: 0.1, yaw: 0.1, fwd: 1.5 }),
    drive: P({ la: -0.4, lb: 0.95, ra: 1.75, rb: 0.05, rc: 0.45, rp: 1.2, re: 0, La: -0.7, Lb: 0.4, Lc: 1.2, Ra: 0.7, Rb: 0.5, Rc: 0.9, rol: -0.05, pit: -0.15, yaw: -0.1, hop: 2.6, fwd: 4 }),
    curl: P({ la: -0.05, lb: 0.35, lc: 0.15, ra: 1.1, rb: 0.25, rc: -1.0, rp: 0.3, re: 1.0, La: -0.25, Lb: 0.4, Lc: 1.45, Ra: 0.5, Rb: 0.5, Rc: 1.0, rol: -0.45, pit: -0.1, yaw: -0.3, fwd: 1.5, dx: -1 }),
    chip: P({ la: 0, lb: 0.3, ra: 0.6, rb: 0.4, rc: 0, rp: -0.2, re: 0.2, La: 0.1, Lb: 0.6, Lc: 0.5, Ra: 0.1, Rb: 0.6, Rc: 0.4, pit: 0, fwd: 0.5 })
  };
  const LAND = {
    push: P({ la: -0.15, lb: 0.25, ra: 0.2, rb: 0.25, rc: 0, fwd: 2 }),
    drive: P({ la: -0.55, lb: 1.35, lp: 0.5, ra: 0.12, rb: 0.35, rc: 0.05, La: -0.3, Lb: 0.6, Lc: 0.7, Ra: 0.2, Rb: 0.6, Rc: 0.6, pit: 0.18, fwd: 5.5 }),
    curl: P({ la: -0.1, lb: 0.3, ra: 0.2, rb: 0.3, rc: -0.45, re: 0.6, La: 0.1, Lc: 0.8, Ra: 0.2, Rc: 0.7, rol: -0.15, yaw: -0.1, fwd: 2, dx: -1.5 }),
    chip: P(Object.assign({ fwd: 0.5 }, HIPS)) // the cheeky stand
  };
  // a miss or a save: hands on the head, shoulders down
  const HEAD = P({ La: 0.2, Lb: 2.95, Lc: 1.45, Lf: -0.9, Ra: 0.2, Rb: 2.95, Rc: 1.45, Rf: -0.9, pit: 0.2 });
  // 사기 저하 (round 23): a waiting pose slumped by a (0–1) — leaning in, one shoulder low, arms dangling, knees soft
  const slump = (p, a) => Object.assign({}, p, {
    pit: p.pit + 0.32 * a, rol: p.rol + 0.07 * a, hop: p.hop - 0.8 * a, lb: p.lb + 0.3 * a, rb: p.rb + 0.3 * a,
    La: lerp(p.La, -0.05, a), Ra: lerp(p.Ra, -0.05, a), Lb: lerp(p.Lb, 0.08, a), Rb: lerp(p.Rb, 0.08, a),
    Lc: lerp(p.Lc, 0.04, a), Rc: lerp(p.Rc, 0.04, a), Lf: lerp(p.Lf, 0, a), Rf: lerp(p.Rf, 0, a)
  });

  // The run-up's stride: footfalls at whole phi; the foot landing at the last one (N) is the left, the plant.
  function gait(phi, N, A, lean) {
    const i = clamp(Math.floor(phi), 0, N - 1), f = clamp(phi - i, 0, 1), swingL = (N - (i + 1)) % 2 === 0, sn = Math.sin(f * Math.PI);
    const sw = { a: lerp(-0.6, 0.6, sm(f)) * A, b: 0.3 + 1.5 * sn * A, p: 0.2 + 0.4 * sn };
    const su = { a: lerp(0.5, -0.55, f) * A, b: 0.3 + 0.2 * sn, p: -0.1 + 0.7 * f };
    const L = swingL ? sw : su, Rr = swingL ? su : sw, arm = (sm(f) * 2 - 1) * 0.75 * A;
    return P({ pit: lean, rol: (swingL ? 1 : -1) * 0.05, hop: 0.9 * sn * A, la: L.a, lb: L.b, lp: L.p, lc: 0.06, ra: Rr.a, rb: Rr.b, rp: Rr.p, rc: 0.06,
      Ra: swingL ? arm : -arm, La: swingL ? -arm : arm, Lb: 1.3, Rb: 1.3, Lc: 0.2, Rc: 0.2 });
  }
  const STRIDE = { push: [1, 0.15], drive: [1.15, 0.32], curl: [1, 0.08], chip: [0.8, 0.08] }; // amplitude, lean
  const FT = 0.22, LT = 0.5; // the follow-through's and the landing's ends (s after the contact)

  // The pose at T seconds after the run-up began (st: the style; Dr: the run-up's length; pl: its plant share).
  function poseAt(st, T, Dr, pl, N) {
    if (T < Dr * pl) {
      const q = T / (Dr * pl), [A, lean] = STRIDE[st], g = gait(q * N, N, A, lean);
      return mix(WAIT[st], g, sm(q * N / 0.7)); // out of the stance into the stride
    }
    if (T < Dr) {
      const s = (T - Dr * pl) / (Dr * (1 - pl));
      return s < 0.45 ? mix(PLANT, COCK[st], sm(s / 0.45)) : mix(COCK[st], HIT[st], Math.pow((s - 0.45) / 0.55, 2)); // the downswing whips
    }
    const t = T - Dr;
    if (t < FT) return mix(HIT[st], FOLLOW[st], 1 - Math.pow(1 - t / FT, 2));
    if (t < LT) return mix(FOLLOW[st], LAND[st], sm((t - FT) / (LT - FT)));
    return mix(LAND[st], STAND_WATCH(st), sm((t - LT) / 0.5));
  }
  const STAND_WATCH = (st) => (st === 'chip' ? LAND.chip : P({ fwd: LAND[st].fwd, dx: LAND[st].dx }));

  // ---------------------------------------------------------------- the figure
  const dir = (a, c, side) => { const cc = Math.cos(c); return [Math.sin(c) * side, -Math.cos(a) * cc, Math.sin(a) * cc]; };
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  // Joints in the figure's canvas (cells): 3D offsets from a joint show at x, y − up − forward · DEPTH.
  function build(p, L) {
    const legs = {};
    let reach = 0;
    for (const s of ['l', 'r']) {
      const side = s === 'l' ? -1 : 1, d1 = dir(p[s + 'a'], p[s + 'c'], side), d2 = dir(p[s + 'a'] - p[s + 'b'], p[s + 'c'], side);
      const fp = p[s + 'p'], fe = p[s + 'e'], fd = [Math.sin(fe) * Math.cos(fp) * side, -Math.sin(fp), Math.cos(fe) * Math.cos(fp)];
      const knee = add([0, 0, 0], d1, LEG.thigh), ankle = add(knee, d2, LEG.shin);
      legs[s] = { side, knee, ankle, toe: add(ankle, fd, LEG.foot), heel: add(ankle, fd, -0.9), mid: add(ankle, fd, 1.4) };
      reach = Math.max(reach, -ankle[1]);
    }
    const h = reach + p.hop, px = AX + p.dx, py = AY - h - p.fwd * DEPTH;
    const sx = Math.max(0.8, Math.cos(p.yaw)), sy = 1 - 0.16 * Math.abs(p.pit);
    const body = (lx, ly) => { const r = rot(lx * sx, ly * sy, p.rol); return [px + r[0], py + r[1]]; };
    const scr = (base, v) => [base[0] + v[0], base[1] - v[1] - v[2] * DEPTH];
    const out = { p, px, py, sx, sy, legs: [], arms: [] };
    for (const s of ['l', 'r']) {
      const G = legs[s], hip = body(G.side * LEG.hip, -1), hz = G.side * Math.sin(p.yaw * 0.5) * LEG.hip;
      const at = (v) => scr(hip, v);
      out.legs.push({ s, hip, knee: at(G.knee), ankle: at(G.ankle), toe: at(G.toe), heel: at(G.heel), mid: at(G.mid), z: (G.knee[2] + G.ankle[2]) / 2 + hz + 1.5 });
    }
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? -1 : 1, sh = body(side * ARM.sh, -L.torsoH + 2.5), shz = side * Math.sin(p.yaw) * ARM.sh + p.pit * L.torsoH * 0.5;
      const e = dir(p[s + 'a'], p[s + 'c'], side), f = dir(p[s + 'a'] + p[s + 'b'], p[s + 'f'], side);
      const el = add([0, 0, 0], e, ARM.upper), hand = add(el, f, ARM.fore);
      // an arm hangs beside the torso, not behind it: only one swung well forward goes behind
      out.arms.push({ s, sh, el: scr(sh, el), hand: scr(sh, hand), mid: scr(sh, add([0, 0, 0], e, ARM.upper * 0.45)), z: (el[2] + hand[2]) / 2 + shz - 1.5 });
    }
    return out;
  }
  // a thick pixel line: squares stamped along it, snapped to the cell grid
  function stamp(c, a, b, th) {
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.ceil(Math.hypot(dx, dy) * 2) + 1;
    for (let i = 0; i <= n; i++) c.fillRect(Math.round(a[0] + dx * i / n - th / 2), Math.round(a[1] + dy * i / n - th / 2), th, th);
  }
  // one limb: every segment's dark outline first, then the colours, each lit along its upper left
  function limb(c, segs) {
    c.fillStyle = OUT;
    for (const q of segs) stamp(c, q[0], q[1], q[2] + 2);
    for (const q of segs) { c.fillStyle = q[3]; stamp(c, q[0], q[1], q[2]); }
    for (const q of segs) if (q[2] >= 3) { c.fillStyle = shade(q[3], 0.22); stamp(c, [q[0][0] - 0.5, q[0][1] - 0.5], [q[1][0] - 0.5, q[1][1] - 0.5], q[2] - 2); }
  }
  function drawLeg(c, G, L) {
    limb(c, [[G.hip, G.knee, 5, L.skin], [G.knee, G.ankle, 4, L.sock], [G.heel, G.toe, 4, L.boot]]);
    c.fillStyle = shade(L.boot, -0.35); stamp(c, G.heel, G.heel, 2); // the heel and studs
  }
  function drawArm(c, A, L, band) {
    limb(c, [[A.sh, A.mid, 4, L.kit], [A.mid, A.el, 3, L.skin], [A.el, A.hand, 3, L.skin], [A.hand, A.hand, 4, L.skin]]);
    if (band) { c.fillStyle = band; stamp(c, A.mid, A.mid, 3); }
  }
  function drawBody(c, F, L) {
    c.save();
    c.translate(F.px, F.py); c.rotate(F.p.rol); c.scale(F.sx, F.sy);
    c.drawImage(L.torso, -8, -L.torsoH);
    c.translate(0, -L.torsoH); c.scale(1 / F.sx, 1 / F.sy); c.rotate(F.p.rol * 0.3 - F.p.pit * 0.15);
    c.drawImage(L.head, -L.head.width / 2, -14);
    c.restore();
  }
  // the whole figure, far parts first: limbs behind the body (z > 0), the body, limbs in front of it
  function drawFigure(c, F, L, mirror, trail) {
    c.clearRect(0, 0, KW, KH);
    if (trail) { // the swoosh of the striking boot
      for (let i = trail.pts.length - 1; i >= 1; i--) {
        c.globalAlpha = 0.55 * (1 - i / trail.pts.length);
        c.fillStyle = i < 2 ? '#ffffff' : trail.col;
        stamp(c, trail.pts[i], trail.pts[i - 1], Math.max(1, 4 - Math.floor(i / 2)));
      }
      c.globalAlpha = 1;
    }
    const parts = F.legs.map((G) => ({ z: G.z, draw: () => drawLeg(c, G, L) }))
      .concat(F.arms.map((A) => ({ z: A.z, draw: () => drawArm(c, A, L, L.band && (A.s === 'L') !== mirror ? L.band : null) })), [{ z: 0, draw: () => drawBody(c, F, L) }]);
    parts.sort((a, b) => b.z - a.z);
    for (const q of parts) q.draw();
  }

  // ---------------------------------------------------------------- where he stands
  // the spot where his boot meets the ball, from the contact pose (cells from the ground point under his pelvis)
  const CONTACT = {};
  function contact(st, L) {
    const key = st + L.torsoH;
    if (!CONTACT[key]) { const F = build(HIT[st], L), G = F.legs[1]; CONTACT[key] = [G.mid[0] - AX, G.mid[1] - AY]; }
    return CONTACT[key];
  }
  // run-up starts, world px from the strike spot (right-footed; × the goal's width): 발등슛 straight back and far,
  // 감아차기 wide and short, 밀어차기 and the chip between
  const START = { push: [-30, 20], drive: [-12, 30], curl: [-42, 11], chip: [-30, 20] };
  // the curved approach of a 감아차기 bows outward by this much (world px)
  const BOW = { curl: 10, push: 0, drive: 0, chip: 0 };

  R.pkKicker = function (L, g, sc, time) {
    if (!sc) return;
    const S = RS.Sprites, o = sc.o, idx = o.yearIdx | 0;
    const spr = sc.who === 'hero' ? S.pkHero(o.hero, idx, o.small, o.nat) : sc.who === 'mate' ? S.pkMate(idx, o.n || 0, o.nat ? RS.NAT_KITS[o.hero] : null) : S.pkFoe(idx, o.n || 0);
    const look = lookOf(spr), m = sc.foot === 'L' ? -1 : 1, st = sc.style ? sc.style() : 'push';
    const C = contact(st, look), hw = g.halfW / 110;
    const E = { x: g.cx - m * 1 - m * C[0] * CELL, y: g.spotY - 2 - C[1] * CELL }; // he strikes from here
    const S0 = { x: E.x + m * START[st][0] * hw, y: E.y + START[st][1] };
    const K = sc._kk || (sc._kk = { x: S0.x, y: S0.y, t: time, walk: 0, from: null, fx: false });
    const dt = clamp(time - K.t, 0, 0.1);
    K.t = time;
    const Dr = sc.dur('runup'), N = sc.runSteps ? sc.runSteps() : 4, pl = sc.plantAt || 0.8;
    let pose, x, y, T = null;
    if (sc.phase === 'runup' || sc.phase === 'flight' || sc.phase === 'result') {
      if (!K.from) K.from = { x: K.x, y: K.y };
      T = sc.phase === 'runup' ? sc.t : Dr + (sc.phase === 'flight' ? sc.t : sc.dur('flight') * 1.25 + sc.t);
      const q = clamp(T / (Dr * pl), 0, 1), e = st === 'drive' ? Math.pow(q, 1.35) : Math.pow(q, 1.1);
      x = lerp(K.from.x, E.x, e) - m * BOW[st] * Math.sin(q * Math.PI); y = lerp(K.from.y, E.y, e);
      pose = poseAt(st, T, Dr, pl, N);
    } else { // waiting: he walks to his mark when the shot type changes, then breathes
      const dx = S0.x - K.x, dy = S0.y - K.y, d = Math.hypot(dx, dy), step = 50 * dt;
      if (d > 0.3) { const k = Math.min(1, step / d); K.x += dx * k; K.y += dy * k; K.walk += step; }
      x = K.x; y = K.y;
      pose = d > 0.3 ? mix(WAIT[st], gait((K.walk / 7) % 2, 2, 0.5, 0), 0.8) : WAIT[st];
      pose = Object.assign({}, pose, { hop: pose.hop + Math.sin(time * 3) * 0.25 });
    }
    // round 23: 사기 저하 — he waits slumped: shoulders down, arms hanging, head low, knees soft (morale 2–3 fully)
    const gloom = clamp(o.morale | 0, 0, 3), ga = gloom ? (gloom >= 2 ? 1 : 0.6) : 0;
    if (ga && T == null) pose = slump(pose, ga);
    // after the strike: a scorer turns to the crowd (the sprite's celebration), a miss holds his head
    const res = sc.phase === 'result' && sc.result;
    if (res && res.goal && sc.t > 0.12) return this.pkCelebrateKicker(L, sc, spr, x, y);
    if (res && !res.goal) pose = mix(pose, HEAD, sm((sc.t - 0.15) / 0.3));
    // the striking boot's swoosh (from the downswing to the end of the follow-through)
    let trail = null;
    if (T != null && T > Dr * (pl + (1 - pl) * 0.55) && T < Dr + FT) {
      trail = { col: { drive: '#ffc04a', curl: '#7fe8ff', push: '#ffffff', chip: '#ffd0ec' }[st], pts: [] };
      for (let i = 0; i < 7; i++) trail.pts.push(build(poseAt(st, Math.max(0, T - i * 0.014), Dr, pl, N), look).legs[1].mid);
    }
    const F = build(pose, look);
    const kc = this.pkKC || (this.pkKC = canvas(KW, KH)), c = kc.getContext('2d');
    c.imageSmoothingEnabled = false;
    drawFigure(c, F, look, m < 0, trail);
    // the shadow (it stays on the grass when he hops) and the hero's gold ring, as on the pitch
    const w = spr.w * 3, air = Math.max(0, pose.hop) * 0.08;
    L.fillStyle = 'rgba(0,0,0,0.3)'; L.beginPath(); L.ellipse(x, y, w * 0.3 * (1 - air), 2.4, 0, 0, TAU); L.fill();
    if (sc.who === 'hero') { L.strokeStyle = 'rgba(255,216,74,0.85)'; L.lineWidth = 1; L.beginPath(); L.ellipse(x, y, w * 0.36, 3.2, 0, 0, TAU); L.stroke(); }
    L.save();
    L.translate(Math.round(x * 2) / 2, Math.round(y * 2) / 2); L.scale(m, 1);
    L.drawImage(kc, -AX * CELL, -AY * CELL, KW * CELL, KH * CELL);
    L.restore();
    if (gloom) this.pkGloom(L, x + m * (F.px - AX) * CELL, y + (F.py - F.sy * look.torsoH - 14 - AY) * CELL, gloom, time, m);
    if (sc.phase === 'flight' && !K.fx) { K.fx = true; this.pkStrikeFx(g, sc, st, m); }
    this.pkKickParts(L);
  };
  // 사기 저하 over his head (hx, hy: the top of his head, world px): a sweat drop sliding down; from 2 a grey cloud
  // hanging over him; at 3 it is darker and rains on him
  R.pkGloom = function (L, hx, hy, n, time, m) {
    const px = (x, y, w, h) => L.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h);
    const ph = (time * 0.8) % 1, dx = hx + m * 12, dy = hy + 7 + ph * 5;
    L.globalAlpha = ph < 0.8 ? 1 : (1 - ph) * 5;
    L.fillStyle = '#0c1a2a'; px(dx - 1.5, dy - 2, 3, 4.5); px(dx - 0.5, dy - 3.5, 1, 1.5);
    L.fillStyle = '#7fd0ff'; px(dx - 1, dy - 1.5, 2, 3.5); px(dx - 0.5, dy - 2.5, 1, 1);
    L.fillStyle = '#ffffff'; px(dx - 0.5, dy - 1, 0.5, 1);
    L.globalAlpha = 1;
    if (n < 2) return;
    const cx = hx, cy = hy - 9 + Math.sin(time * 2) * 0.8, dark = n >= 3;
    if (dark) { // rain under it
      L.fillStyle = 'rgba(127,190,255,0.75)';
      for (let i = 0; i < 5; i++) { const q = (time * 2.2 + i * 0.29) % 1; px(cx - 6 + i * 3, cy + 3 + q * 8, 0.5, 2); }
    }
    const blobs = [[-5, 0.5, 3.5], [-1.5, -1.5, 4.5], [3, -0.5, 4], [6, 1, 3], [0.5, 1.5, 4]];
    L.fillStyle = '#10141c';
    for (const [bx, by, r] of blobs) { L.beginPath(); L.arc(cx + bx, cy + by, r + 0.7, 0, TAU); L.fill(); }
    L.fillStyle = dark ? '#4a505c' : '#7a8290';
    for (const [bx, by, r] of blobs) { L.beginPath(); L.arc(cx + bx, cy + by, r, 0, TAU); L.fill(); }
    L.fillStyle = dark ? '#5e6676' : '#9aa2b0';
    px(cx - 4, cy - 3, 4, 1); px(cx + 1, cy - 4, 3, 1);
    if (dark && Math.floor(time * 3) % 5 === 0) { L.fillStyle = '#ffe27a'; px(cx + 1, cy + 3, 1, 2); px(cx, cy + 4.5, 1, 2); }
  };
  // the celebration: the sprite's arms-up frame facing the camera (날두 jumps for his SIUU)
  R.pkCelebrateKicker = function (L, sc, spr, x, y) {
    const w = spr.w * 3, h = spr.h * 3, jump = Math.sin(Math.min(1, (sc.t - 0.12) / 0.55) * Math.PI) * (sc.who === 'hero' && sc.o.hero === 'ronaldo' ? 14 : 6);
    L.fillStyle = 'rgba(0,0,0,0.3)'; L.beginPath(); L.ellipse(x, y, w * 0.3, 2.4, 0, 0, TAU); L.fill();
    if (sc.who === 'hero') { L.strokeStyle = 'rgba(255,216,74,0.85)'; L.lineWidth = 1; L.beginPath(); L.ellipse(x, y, w * 0.36, 3.2, 0, 0, TAU); L.stroke(); }
    L.drawImage(spr.frames[5][sc.foot === 'L' ? 'f' : 'n'], Math.round(x - w / 2), Math.round(y - h - jump), w, h);
    this.pkKickParts(L);
  };

  // ---------------------------------------------------------------- effects
  // The strike: a flash at the boot for all; the 발등슛 adds a shock ring, a shake and turf flying up; the 감아차기 a
  // cyan spark of spin; the chip a small one.
  R.pkStrikeFx = function (g, sc, st, m) {
    const Q = this.pkW && this.pkW.pfxQ, x = g.cx, y = g.spotY - 3, seed = (Math.random() * 1e6) | 0;
    if (!Q) return;
    const F = this.pkKF || (this.pkKF = { parts: [], rings: [] });
    if (st === 'drive') {
      Q.push({ fx: 'hitSpark', x, y, angle: -Math.PI / 2, seed });
      Q.push({ fx: 'sparkPop', x, y, palette: RS.PFX_FIRE, seed: seed + 1 });
      F.rings.push({ x, y, t: 0, col: '255,210,120' });
      this.shake = Math.max(this.shake, 0.22);
      const TURF = ['#3a8a3a', '#2a6a2a', '#5aa04a', '#6a4a2a', '#4a3420'];
      for (let i = 0; i < 12; i++) F.parts.push({ x: x - m * 2, y: y + 2, vx: (Math.random() - 0.5) * 50 - m * 12, vy: -30 - Math.random() * 50, t: 0, life: 0.45 + Math.random() * 0.25, c: TURF[i % TURF.length], s: Math.random() < 0.4 ? 1.5 : 1 });
    } else if (st === 'curl') {
      Q.push({ fx: 'sparkPop', x, y, palette: ICE, seed });
      F.rings.push({ x, y, t: 0, col: '127,232,255', small: true });
    } else Q.push({ fx: 'sparkPop', x, y, palette: st === 'chip' ? RS.PFX_GOLD : RS.PFX_WHITE, seed });
  };
  // turf bits and shock rings (world px, real time)
  R.pkKickParts = function (L) {
    const F = this.pkKF;
    if (!F || (!F.parts.length && !F.rings.length)) return;
    const now = performance.now() / 1000, dt = clamp(now - (F.t || now), 0, 0.05);
    F.t = now;
    let n = 0;
    for (const p of F.parts) {
      p.t += dt; if (p.t > p.life) continue;
      p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      F.parts[n++] = p;
      L.globalAlpha = 1 - p.t / p.life; L.fillStyle = p.c; L.fillRect(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2, p.s, p.s);
    }
    F.parts.length = n; n = 0;
    for (const r of F.rings) {
      r.t += dt; const k = r.t / (r.small ? 0.2 : 0.28); if (k >= 1) continue;
      F.rings[n++] = r;
      const rad = (r.small ? 3 : 4) + k * (r.small ? 9 : 16);
      L.globalAlpha = 0.9 * (1 - k); L.strokeStyle = 'rgb(' + r.col + ')'; L.lineWidth = r.small ? 0.5 : 1;
      L.beginPath(); L.ellipse(r.x, r.y, rad, rad * 0.4, 0, 0, TAU); L.stroke();
    }
    F.rings.length = n;
    L.globalAlpha = 1;
  };
  // the ball's trail: the 발등슛 a fire-white comet with speed lines, the 감아차기 a dotted cyan line showing its bend
  // and a spin swirl round the ball; then the ball as before
  const basePkBall = R.pkBall;
  R.pkBall = function (L, g, sc, b, time) {
    const st = sc && sc.style ? sc.style() : 'push', kind = sc && sc.ballKind ? sc.ballKind() : sc && sc.result && sc.result.kind;
    if (b.k < 1.2 && kind !== 'panenka' && kind !== 'slow' && (st === 'drive' || st === 'curl')) {
      const now = proj(g, b.u, b.v, b.z), r = ballR(now.s);
      L.globalCompositeOperation = 'lighter';
      if (st === 'drive') {
        const FIRE = ['#ffffff', '#fff0a0', '#ffd24a', '#ff9a2a', '#ff5a1a', '#c82a10'];
        for (let i = 9; i >= 1; i--) {
          const q = sc.ballAt(Math.max(0, b.k - i * 0.035)), p = proj(g, q.u, q.v, q.z), rr = ballR(p.s) * (1.15 - i * 0.07);
          L.globalAlpha = 0.5 * (1 - i / 10); L.fillStyle = FIRE[Math.min(5, Math.floor(i / 1.6))];
          L.beginPath(); L.arc(p.x, p.y - rr, Math.max(0.6, rr), 0, TAU); L.fill();
        }
        const back = sc.ballAt(Math.max(0, b.k - 0.3)), p0 = proj(g, back.u, back.v, back.z);
        L.globalAlpha = 0.55; L.strokeStyle = '#ffffff'; L.lineWidth = 0.5;
        for (const o of [-1.2, 0, 1.2]) { L.beginPath(); L.moveTo(p0.x + o * r, p0.y - r + o * 0.5); L.lineTo(now.x + o * r * 0.6, now.y - r + o * 0.3); L.stroke(); }
      } else {
        for (let i = 24; i >= 1; i--) {
          const q = sc.ballAt(Math.max(0, b.k - i * 0.03)), p = proj(g, q.u, q.v, q.z);
          L.globalAlpha = 0.7 * (1 - i / 25); L.fillStyle = i < 4 ? '#ffffff' : '#7fe8ff';
          const s = i < 8 ? 1.5 : 1; L.fillRect(Math.round(p.x * 2) / 2 - s / 2, Math.round((p.y - ballR(p.s)) * 2) / 2 - s / 2, s, s);
        }
        const a = time * 30;
        L.globalAlpha = 0.85; L.strokeStyle = '#bff4ff'; L.lineWidth = 0.5;
        for (let i = 0; i < 2; i++) { L.beginPath(); L.arc(now.x, now.y - r, r + 1.2, a + i * Math.PI, a + i * Math.PI + 1.3); L.stroke(); }
      }
      L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
    }
    basePkBall.call(this, L, g, sc, b, time);
  };
  // a bigger goal per type: the 발등슛 bulges the net harder and shakes more, the 감아차기 bursts in cyan
  const basePkVfx = R.pkVfx;
  R.pkVfx = function (sc, f, g, st) {
    basePkVfx.call(this, sc, f, g, st);
    if (f.kind !== 'goal' || sc.mode !== 'shoot' || !sc.style) return; // a perfect strike comes back here as its 'goal'
    const s = sc.style(), p = proj(g, f.u, f.v, 1);
    if (s === 'drive') { if (st.net) st.net.a += 4; this.shake = Math.max(this.shake, sc.slow ? 0.7 : 0.5); this.pkW.pfxQ.push({ fx: 'hitSpark', x: p.x, y: p.y, angle: -Math.PI / 2, seed: (Math.random() * 1e6) | 0 }); }
    else if (s === 'curl') this.pkW.pfxQ.push({ fx: 'sparkPop', x: p.x, y: p.y + 2, palette: ICE, seed: (Math.random() * 1e6) | 0 });
  };
  R.pkKickPose = poseAt; // for checks
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pkkick = 'R27';
