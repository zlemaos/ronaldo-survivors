/* 호날두 서바이버즈 — pixel art drawn in code. Templates are char grids; palettes map chars to colors.
 * Every sprite gets a 1px dark outline (clear silhouettes on small screens) plus flipped / white-flash variants. */
(function (RS) {
  'use strict';

  // People are 13 px wide and 16 px tall (5 head + 8 body + 3 legs); the renderer shows them at 5x on a phone.
  const pad = (r) => '.' + r + '.'; // the 11-wide hair templates sit centred on the 13-wide body
  const BODY = [
    '.....sss.....',
    '...KKKKKKK...',
    '..sKKKKKKKs..',
    '..sKKKKKKKs..',
    '..sKKKKKKKs..',
    '..s.KKKKK.s..',
    '....SSSSS....',
    '....SSSSS....'
  ];
  // run cycle: contact, stride, pass, stride
  const LEGS = [
    ['....WW.WW....', '....WW.WW....', '....BB.BB....'],
    ['...WW...WW...', '...WW...WW...', '..BB.....BB..'],
    ['.....WWW.....', '....WW.WW....', '....BB.BB....'],
    ['...WW...WW...', '..WW.....WW..', '..BB.....BB..']
  ];
  // poses: a kick (front leg swung forward) and a heading jump (arms up, knees tucked)
  const KICK_LEGS = ['....WW..WWW..', '....BB....WBB', '.............'];
  const HEAD_BODY = [
    '..s..sss..s..',
    '..sKKKKKKKs..',
    '..KKKKKKKKK..',
    '...KKKKKKK...',
    '...KKKKKKK...',
    '....KKKKK....',
    '....SSSSS....',
    '....SSSSS....'
  ];
  const HEAD_LEGS = ['...WWW.WWW...', '....BB.BB....', '.............'];
  // 메시's own pose instead of the heading jump: low on the ball, the ball glued to the front foot (his dribbles)
  const DRIBBLE_LEGS = ['....WW.WW....', '...WW...WWqq.', '...BB....Bqx.'];
  // 메시 before the growth-hormone treatment (and his whole career in 하드 모드): one torso and one shorts row less
  const kidRows = (rows) => rows.filter((r, i) => i !== 3 && i !== 7);
  const HAIR = {
    kid: ['...HHHHH...', '..HHHHHHH..', '..HHHssss..', '..Hssesse..', '...sssss...'],
    young: ['...hHhHh...', '..HhHHhHH..', '..HHsssss..', '..Hssesse..', '...sssss...'],
    slick: ['....HHHH...', '..HHHHHHH..', '..HHsssss..', '..Hssesse..', '...sssss...'],
    fade: ['...HHHHH...', '..fHHHHHH..', '..fssssss..', '..fssesse..', '...sssss...'],
    veteran: ['...HHHHH...', '..fHHHHHH..', '..fssssss..', '..fssesse..', '...sbbbs...'],
    messi: ['..HHHHHH...', '.HHHHHHHH..', '.HHsssss...', '..Hssesse..', '..bbsssb...'],
    short: ['...HHHHH...', '..HHHHHHH..', '..Hssssss..', '..sssesse..', '...sssss...'],
    bald: ['...sssss...', '..sssssss..', '..sssssss..', '..sssesse..', '...sssss...'],
    long: ['..HHHHHH...', '.HHHHHHHHH.', '.HHsssssH..', '.HHssesse..', '..Hsssss...'],
    // 토레쓰 (round 11): the 엘 니뇨 look — long strawberry-blond hair held back by a white band
    torres: ['...HHHHH...', '..HHHHHHHH.', '.HHqqqqqqH.', '.HHssesse..', '..Hsssss...'],
    cap: ['...CCCCC...', '..CCCCCCCC.', '..Hssssss..', '..sssesse..', '...sssss...']
  };
  const TANK = [
    '.....HHHHH.....',
    '....HHHHHHH....',
    '....Hssssss....',
    '....sssesse....',
    '.....sssss.....',
    '..KKKKKKKKKKK..',
    '.KKKKKKKKKKKKK.',
    'sKKKKKKKKKKKKKs',
    'sKKKKKKKKKKKKKs',
    'sKKKKKKKKKKKKKs',
    'ss.KKKKKKKKK.ss',
    '...SSSSSSSSS...',
    '...SSSS.SSSS...',
    '...SSSS.SSSS...'
  ];
  const TANK_LEGS = [
    ['....sss.sss....', '....WWW.WWW....', '...BBBB.BBBB...'],
    ['...sss...sss...', '...WWW...WWW...', '..BBBB...BBBB..']
  ];
  // Darken a #rrggbb colour by k (0..1).
  function darken(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.round(v * (1 - k)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  // Later-wave enemies (tier 1, 2) wear darker kits and a red outline so "they got stronger" is visible.
  function tiered(pal, tier) {
    if (!tier) return pal;
    const p = Object.assign({}, pal);
    for (const k of ['K', 'k2', 'S', 'W']) if (p[k] && p[k][0] === '#') p[k] = darken(p[k], tier === 2 ? 0.3 : 0.15);
    return p;
  }
  const TIER_OUTLINE = [null, 'rgba(60,10,10,0.95)', 'rgba(140,10,10,0.95)'];
  const SMALL = {
    ball: ['.WWW.', 'WWBWW', 'WBBBW', 'WWBWW', '.WWW.'],
    ball7: ['..WWW..', '.WWBWW.', 'WWBBBWW', 'WBBBBBW', 'WWBBBWW', '.WWBWW.', '..WWW..'],
    gem1: ['.W.', 'WBW', '.W.'],
    gem2: ['.O.', 'OoO', 'OoO', '.O.'],
    gem3: ['GGGGG', 'GgggG', '.GgG.', '..G..', '.GGG.'],
    coin: ['.YY.', 'YyyY', 'YyyY', '.YY.'],
    heal: ['.cccc.', 'cyyyyc', 'cyYYyc', 'cyyyyc', '.cccc.'],
    magnet: ['RR.RR', 'RR.RR', 'RR.RR', 'RRRRR', '.RRR.'],
    chest: ['.ccccccc.', 'cyyyyyyyc', 'cccccccccc'.slice(0, 9), 'cbbbYbbbc', 'cbbbbbbbc', 'cbbbbbbbc', 'ccccccccc'],
    card: ['YYY', 'YYY', 'YYY', 'YYY'],
    redcard: ['RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR'],
    shadow: ['.kkkkk.', 'kkkkkkk', '.kkkkk.'],
    camera: ['KKKK', 'KWKK', 'KKKK']
  };

  const BASE_PAL = { '.': null, s: '#e7b48c', e: '#1a1a1a', H: '#2a1b12', h: '#e2c068', f: '#7a5a46', b: '#4a2e1c',
    K: '#ffffff', k: '#dddddd', S: '#ffffff', W: '#ffffff', B: '#222222', C: '#444444', Y: '#f4d43a', y: '#ffe98a',
    G: '#e0a822', g: '#ffd75a', O: '#c06a2a', o: '#f2a35a', R: '#d22b2b', c: '#7a4a22', q: '#f8f8f8', x: '#26262a' };

  // ---------------------------------------------------------------- HD people (opt.hd)
  // People are drawn at twice the detail: Scale2x rounds the 13×16 template's stair-step edges, every colour
  // area gets a light rim on its upper-left and a shade on its lower-right (light from the upper left, like the
  // balls), eyes get a glint, and the outline is one crisp dark pixel plus a soft one. The renderer draws them
  // back at world size on its 2× canvas, so the art reads finer while the sizes stay the same.
  const SHADE_GROUP = { s: 1, e: 1, b: 1, H: 2, h: 2, f: 2, K: 3, A: 3, Y: 3, R: 3, S: 4, W: 5, B: 6, C: 7, q: 8, x: 8 };
  // Scale2x (EPX) on a char grid. Eyes are kept as solid 2×2 blocks (smoothing would chip them).
  function scale2x(rows) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const at = (i, j) => { const ch = j < 0 || j >= h || i < 0 || i >= w ? '.' : rows[j][i] || '.'; return ch === 'e' ? 's' : ch; };
    const out = [];
    for (let j = 0; j < h; j++) {
      let r0 = '', r1 = '';
      for (let i = 0; i < w; i++) {
        if ((rows[j][i] || '.') === 'e') { r0 += 'ee'; r1 += 'ee'; continue; }
        const P = at(i, j), A = at(i, j - 1), B = at(i + 1, j), C = at(i - 1, j), D = at(i, j + 1);
        r0 += (C === A && C !== D && A !== B ? A : P) + (A === B && A !== C && B !== D ? B : P);
        r1 += (D === C && D !== B && C !== A ? C : P) + (B === D && B !== A && D !== C ? D : P);
      }
      out.push(r0, r1);
    }
    return out;
  }
  // Mix a #rrggbb colour toward [r,g,b] by k.
  function mixTo(hex, t, k) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    return '#' + c.map((v, i) => Math.round(v + (t[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Render a char grid with palette + per-pixel kit pattern. Adds outline. Returns canvas.
  // opt.glow: a second, bright outline ring outside the dark one (the player's "I am the hero" halo).
  // opt.hd: twice the detail (see HD people above); the canvas is twice the size.
  function paint(rows, pal, opt) {
    opt = opt || {};
    const sc = opt.scale || 1, hd = opt.hd ? 2 : 1;
    const grid = hd === 2 ? scale2x(rows) : rows;
    const w0 = Math.max(...rows.map((r) => r.length));
    const h = grid.length, w = w0 * hd;
    const glowN = opt.glow ? hd : 0, pad = hd + glowN; // outline rings (hd: crisp + soft), then the glow
    const W = (w + pad * 2) * sc, H = (h + pad * 2) * sc;
    const c = canvas(W, H);
    const x = c.getContext('2d');
    const at = (i, j) => (j < 0 || j >= h || i < 0 || i >= w ? '.' : grid[j][i] || '.');
    const fill = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const ch = at(i, j);
        let col = pal[ch] !== undefined ? pal[ch] : BASE_PAL[ch];
        if (ch === 'K' && opt.pattern && pal.k2) {
          const p = opt.pattern, bi = Math.floor(i / hd), bj = Math.floor(j / hd);
          const alt = (p === 'hoops' && bj % 2 === 0) || (p === 'stripes' && bi % 2 === 1) ||
            (p === 'trim' && (bj === opt.collar || bi === 1 || bi === w0 - 2)) ||
            (p === 'sash' && ((bi - bj + 40) % 7 === 0));
          if (alt) col = pal.k2;
        }
        if (!col) continue;
        if (opt.white) col = '#ffffff';
        else if (hd === 2 && col[0] === '#') {
          const g = SHADE_GROUP[ch];
          if (ch === 'e' && i % 2 === 1 && j % 2 === 0) col = '#f2f2f2'; // eye glint, upper right
          else if (g) {
            const same = (a, b) => SHADE_GROUP[at(a, b)] === g;
            if (!same(i + 1, j) || !same(i, j + 1)) col = mixTo(col, [0, 0, 0], 0.26);
            else if (!same(i - 1, j) || !same(i, j - 1)) col = mixTo(col, [255, 255, 255], 0.2);
          }
        }
        fill.push([i, j]);
        x.fillStyle = col;
        x.fillRect((i + pad) * sc, (j + pad) * sc, sc, sc);
      }
    }
    // outline (4-neighbour rings: one; hd: a crisp one and a soft one), then the optional glow (8-neighbour)
    const on = new Set(fill.map(([i, j]) => i + ',' + j));
    const dark = opt.white ? 'rgba(255,255,255,0.9)' : (opt.outline || 'rgba(16,12,10,0.95)');
    const ring = (from, style, diag) => {
      const out = [];
      x.fillStyle = style;
      for (const [i, j] of from) {
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if ((!di && !dj) || (!diag && di && dj)) continue;
          const ni = i + di, nj = j + dj, key = ni + ',' + nj;
          if (!on.has(key)) { on.add(key); out.push([ni, nj]); x.fillRect((ni + pad) * sc, (nj + pad) * sc, sc, sc); }
        }
      }
      return out;
    };
    let edge = ring(fill, dark, false);
    if (hd === 2) edge = edge.concat(ring(edge, opt.white ? 'rgba(255,255,255,0.45)' : (opt.outline ? dark : 'rgba(16,12,10,0.5)'), false));
    if (opt.glow) for (let k = 0; k < glowN; k++) edge = ring(edge, opt.white ? 'rgba(255,255,255,0.9)' : opt.glow, true);
    return c;
  }
  // Enemy kits are pulled toward a dull slate tone so the vivid, gold-ringed hero reads at a glance.
  function dull(pal) {
    const p = Object.assign({}, pal);
    const mix = (hex, k) => {
      const n = parseInt(hex.slice(1), 16), t = [0x3a, 0x40, 0x48];
      const f = (v, i) => Math.round(v + (t[i] - v) * k);
      return '#' + [f(n >> 16, 0), f((n >> 8) & 255, 1), f(n & 255, 2)].map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    for (const k of ['K', 'k2', 'S', 'W', 'H', 's']) if (p[k] && p[k][0] === '#') p[k] = mix(p[k], k === 's' ? 0.2 : 0.38);
    return p;
  }

  function flip(c) {
    const o = canvas(c.width, c.height);
    const x = o.getContext('2d');
    x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
    return o;
  }

  // Sprite = { frames: [{n, f, w}], w, h, hd } ; n normal, f flipped, w white flash. People are HD (opt.hd
  // defaults on): canvases are hd× the size and w/h are world units, so draw them with an explicit w, h.
  function makeSprite(frameRows, pal, opt) {
    opt = Object.assign({ hd: true }, opt);
    const frames = frameRows.map((rows) => {
      const n = paint(rows, pal, opt);
      const wcan = paint(rows, pal, Object.assign({}, opt, { white: true }));
      return { n, f: flip(n), w: wcan, wf: flip(wcan) };
    });
    const hd = opt.hd ? 2 : 1;
    return { frames, w: frames[0].n.width / hd, h: frames[0].n.height / hd, hd };
  }

  // pose: undefined → 4 run frames; 'kick' / 'head' / 'dribble' → one posed frame
  function person(hair, pose, kid) {
    const head = (HAIR[hair] || HAIR.short).map(pad);
    const body = kid ? kidRows(BODY) : BODY;
    if (pose === 'kick') return [head.concat(body, KICK_LEGS)];
    if (pose === 'head') return [head.concat(kid ? kidRows(HEAD_BODY) : HEAD_BODY, HEAD_LEGS)];
    if (pose === 'dribble') return [head.concat(body, DRIBBLE_LEGS)];
    return LEGS.map((legs) => head.concat(body, legs));
  }

  const cache = {};
  function get(key, build) { return cache[key] || (cache[key] = build()); }

  // ---------------------------------------------------------------- 메시's orbiting ball (RS.orbitLook)
  // Drawn per pixel: a lit sphere with the 32-panel ball pattern (12 pentagons, 20 hexagons) spinning about a
  // pentagon axis, so ORB_FRAMES steps over 72° loop seamlessly. 'white': the plain ball (dark pentagons);
  // 'gold': a golden ball; 'ballon': the 발롱도르 — polished gold mirroring a bright sky over a dark horizon,
  // engraved seams, standing on a little trophy base. Ramps run dark → light; seam = steps darker on a seam.
  const ORB_FRAMES = 10;
  const ORB_LOOKS = {
    white: { panel: ['#8f99a3', '#b4bcc4', '#d6dce1', '#eef1f3', '#ffffff'],
      patch: ['#0c0d10', '#16181c', '#22252a', '#30343b', '#454b54'], line: '#4f5761', hi: '#ffffff', seam: 2 },
    gold: { panel: ['#7a4c06', '#a26c0e', '#cc9419', '#eebc38', '#ffdb6e', '#fff1b8'],
      patch: ['#5a3805', '#7a4c06', '#9a640c', '#b67c14', '#d49a1c'], line: '#3e2603', hi: '#fffbe8', seam: 2 },
    ballon: { panel: ['#3e2503', '#5e3c06', '#86580c', '#b07a14', '#d69f22', '#f0c43c', '#ffe27a', '#fff6c8'],
      line: '#2e1b02', hi: '#ffffff', seam: 3 }
  };
  const PENT_W = 0.0768; // pentagons are smaller than hexagons: their edge sits 16.5° from the centre, not 18.7°
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  let ORB_GEO = null;
  function orbGeo() {
    if (ORB_GEO) return ORB_GEO;
    const f = (1 + Math.sqrt(5)) / 2;
    const n = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    const pent = [], hex = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      pent.push(n(0, a, b * f), n(a, b * f, 0), n(b * f, 0, a)); // icosahedron vertices
      hex.push(n(0, a * f, b / f), n(a * f, b / f, 0), n(b / f, 0, a * f)); // its face centres
      for (const c of [-1, 1]) hex.push(n(a, b, c));
    }
    const lt = n(-0.45, -0.7, 0.55); // light from the upper left, towards the viewer
    const pal = {};
    for (const k in ORB_LOOKS) {
      const v = ORB_LOOKS[k];
      pal[k] = { panel: v.panel.map(rgb), patch: v.patch && v.patch.map(rgb), line: rgb(v.line), hi: rgb(v.hi), seam: v.seam };
    }
    ORB_GEO = { pent, hex, axis: n(1, f, 0), lt, hv: n(lt[0], lt[1], lt[2] + 1), pal };
    return ORB_GEO;
  }
  // d = ball diameter in low-res px. Returns { c, cx, cy, foot }: the sphere centre in the canvas and the
  // distance from it down to the sprite's bottom (where the ground shadow goes).
  function orbSprite(look, d, frame) {
    const G = orbGeo(), P = G.pal[look], A = G.axis, LT = G.lt, HV = G.hv;
    const R = d / 2, trophy = look === 'ballon';
    const standH = trophy ? Math.max(3, Math.round(d * 0.3)) : 0;
    const W = d + 2, H = d + 2 + standH, cx = W / 2, cy = 1 + R;
    const c = canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), px = img.data;
    const th = -frame / ORB_FRAMES * Math.PI * 2 / 5, ct = Math.cos(th), st = Math.sin(th);
    // a tiny white ball shows only smaller patches (true-size ones blot out an 8-px ball); else ≈1 px seam lines
    const tiny = look === 'white' && d < 12, seamA = tiny ? 0 : 1.1 / R, pw = tiny ? 0.2 : PENT_W;
    // trophy stand: a narrow neck under the ball flaring to a wide foot, with a dark band
    const sTop = Math.floor(cy + R) - 1, sBot = H - 1, band = sTop + Math.round((sBot - sTop) * 0.6);
    const neck = Math.max(2, d * 0.3), foot = Math.max(4, d * 0.64);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const nx = (i + 0.5 - cx) / R, ny = (j + 0.5 - cy) / R, rr = nx * nx + ny * ny, r = Math.sqrt(rr) * R;
      let col = null;
      if (r <= R - 0.8) {
        const nz = Math.sqrt(Math.max(0, 1 - rr));
        // the pattern point: this surface normal turned back by the spin (Rodrigues' rotation about A)
        const ad = (A[0] * nx + A[1] * ny + A[2] * nz) * (1 - ct);
        const qx = nx * ct + (A[1] * nz - A[2] * ny) * st + A[0] * ad;
        const qy = ny * ct + (A[2] * nx - A[0] * nz) * st + A[1] * ad;
        const qz = nz * ct + (A[0] * ny - A[1] * nx) * st + A[2] * ad;
        let p1 = -2, h1 = -2, h2 = -2;
        for (const v of G.pent) { const t = v[0] * qx + v[1] * qy + v[2] * qz; if (t > p1) p1 = t; }
        for (const v of G.hex) { const t = v[0] * qx + v[1] * qy + v[2] * qz; if (t > h1) { h2 = h1; h1 = t; } else if (t > h2) h2 = t; }
        const a5 = Math.acos(Math.min(1, p1)) + pw, a6 = Math.acos(Math.min(1, h1)), a6b = Math.acos(Math.min(1, h2));
        const isPent = a5 < a6;
        const gap = isPent ? a6 - a5 : Math.min(a5, a6b) - a6; // twice the angle to the nearest seam
        const seam = seamA > 0 && gap < seamA / Math.max(0.5, nz);
        const diff = Math.max(0, nx * LT[0] + ny * LT[1] + nz * LT[2]);
        const spec = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 28);
        let l;
        if (trophy) { // polished metal: the reflected view ray sees a bright sky above a dark horizon
          const ry = 2 * nz * ny;
          const env = ry < -0.15 ? 0.8 + 0.2 * Math.min(1, -ry) : ry < 0.1 ? 0.2 : 0.42 + 0.25 * Math.min(1, ry);
          l = 0.35 * diff + 0.65 * env;
        } else l = 0.3 + 0.7 * diff + 0.12 * Math.max(0, nx + ny) * (1 - nz); // + a little bounce light, lower right
        const ramp = isPent && P.patch ? P.patch : P.panel;
        let k = Math.min(ramp.length - 1, Math.floor(l * ramp.length));
        if (seam) k = Math.max(0, k - P.seam);
        col = spec > 0.62 && !seam ? P.hi : ramp[k];
      } else if (r <= R + 0.3) col = P.line;
      else if (trophy && j >= sTop) {
        const t = (j - sTop) / Math.max(1, sBot - sTop), hw = (neck + (foot - neck) * t * t) / 2;
        const u = (i + 0.5 - cx) / hw;
        if (Math.abs(u) <= 1) {
          if (j === sBot || Math.abs(u) > 1 - 1 / hw) col = P.line;
          else {
            const ramp = P.panel;
            let k = Math.min(ramp.length - 1, Math.max(0, Math.floor((0.66 - 0.36 * u - 0.12 * t) * ramp.length)));
            if (d >= 12 && j === band) k = 1; else if (d >= 12 && j === band - 1) k = Math.min(ramp.length - 1, k + 2);
            col = ramp[k];
          }
        }
      }
      if (col) { const o = (j * W + i) * 4; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    return { c, cx: Math.floor(cx), cy: Math.floor(cy), foot: H - Math.floor(cy) };
  }

  // ---------------------------------------------------------------- 날두 evolves by year
  // `yd` may be given explicitly (the 날두 boss in a 메시 career is drawn from his own last year).
  RS.ronaldoLook = function (yearIdx, yd) {
    const y = yd || RS.YEARS[yearIdx];
    const era = RS.ERAS[y.era];
    const hair = y.year <= 2004 ? 'young' : y.year <= 2010 ? 'slick' : y.year <= 2022 ? 'fade' : 'veteran';
    return {
      hair, kit: era.kit,
      goldBoots: y.year >= 2008,
      armband: y.year >= 2016,
      key: 'ron|' + hair + '|' + y.era + '|' + (y.year >= 2008) + '|' + (y.year >= 2016)
    };
  };
  // 메시: a kid haircut in the youth, his own look after; the kit follows the club, gold boots from the first
  // 발롱도르, armband as captain. small = the short body (before the growth hormone, or 하드 모드).
  RS.messiLook = function (yearIdx, yd, small) {
    const y = yd || RS.YEARS[yearIdx];
    const era = RS.ERAS[y.era];
    const hair = y.youth ? 'kid' : 'messi';
    return {
      hair, kid: !!small, kit: era.kit,
      goldBoots: y.year >= 2009,
      armband: y.year >= 2018,
      key: 'mes|' + hair + '|' + !!small + '|' + y.era + '|' + (y.year >= 2009) + '|' + (y.year >= 2018)
    };
  };
  // 토레쓰 (round 11): the banded long hair up to 리버풀, shorter after; captain's armband in his first spell at
  // home (from 19), gold boots from the 유로 2012 득점왕.
  RS.torresLook = function (yearIdx, yd) {
    const y = yd || RS.YEARS[yearIdx];
    const era = RS.ERAS[y.era];
    const hair = y.year <= 2010 ? 'torres' : 'short', gold = y.year >= 2012, arm = y.year >= 2003 && y.year <= 2006;
    // 성공한 첼씨 토레쓰 (round 14, RS.TORRES_BLUE): 첼씨 blue in every season, golden boots from the first
    const blue = !!RS.TORRES_BLUE, kit = blue ? RS.ERAS.chelseat.kit : era.kit;
    return { hair, kit, goldBoots: gold || blue, armband: arm, key: 'tor|' + hair + '|' + (blue ? 'blue' : y.era) + '|' + (gold || blue) + '|' + arm };
  };
  RS.heroLook = (hero, yearIdx, yd, small) => hero === 'messi' ? RS.messiLook(yearIdx, yd, small)
    : hero === 'torres' ? RS.torresLook(yearIdx, yd) : RS.ronaldoLook(yearIdx, yd);

  function kitPal(kit, extra) {
    return Object.assign({ K: kit.main, k2: kit.alt, S: kit.shorts, W: kit.socks }, extra || {});
  }
  const TORRES_HAIR = '#e0a84a', TORRES_SKIN = '#f0c8a0';
  function heroPal(hero, L) {
    if (hero === 'torres') return kitPal(L.kit, { H: TORRES_HAIR, h: '#f4d890', B: L.goldBoots ? '#f0c030' : '#f0f0f0', A: '#ffd400', s: TORRES_SKIN });
    return hero === 'messi'
      ? kitPal(L.kit, { H: '#4a3020', b: '#4a3020', B: L.goldBoots ? '#f0c030' : '#f0f0f0', A: '#75aadb', s: '#e8b48e' })
      : kitPal(L.kit, { H: '#20140c', h: '#e8c870', B: L.goldBoots ? '#f0c030' : '#222', A: '#ffd400', s: '#d9a27a' });
  }
  // round 10 (PK): a person seen from behind — the face rows become hair (a bald head stays skin), the chin the neck
  function backRows(rows) {
    const hair = rows.slice(0, 4).some((r) => /[Hh]/.test(r));
    return rows.map((r, j) => (j < 4 ? (hair ? r.replace(/[seb]/g, 'H') : r.replace(/[eb]/g, 's')) : j === 4 ? r.replace(/[eb]/g, 's') : r));
  }
  // The penalty taker: frames 0-3 run and 4 kick seen from behind, 5 the celebration facing the camera (arms up).
  function pkPerson(hair, kid, pal, opt, armband) {
    const frames = person(hair, null, kid).concat(person(hair, 'kick', kid)).map(backRows).concat(person(hair, 'head', kid));
    if (armband) for (const f of frames) f[7] = f[7].slice(0, 2) + 'A' + f[7].slice(3);
    return makeSprite(frames, pal, opt);
  }
  const PK_HAIRS = ['short', 'fade', 'slick', 'long', 'bald'];
  const PK_SKINS = ['#d9a27a', '#8a5a3a', '#e8b48e', '#5a3a26', '#c99070'];

  RS.Sprites = {
    ronaldo(yearIdx, scale, yd) { return RS.Sprites.hero('ronaldo', yearIdx, scale, yd); },
    // Player sprite for a hero: frames 0-3 run cycle, 4 kick pose, 5 날두's heading jump / 메시's dribble
    // (see Renderer.drawPlayer)
    hero(hero, yearIdx, scale, yd, small) {
      const L = RS.heroLook(hero, yearIdx, yd, small);
      return get(L.key + '|' + (scale || 1), () => {
        const frames = person(L.hair, null, L.kid).concat(person(L.hair, 'kick', L.kid), person(L.hair, hero === 'messi' ? 'dribble' : 'head', L.kid));
        if (L.armband) for (const f of frames) f[7] = f[7].slice(0, 2) + 'A' + f[7].slice(3);
        // the hero alone carries a gold halo outline: instantly separable from the crowd
        return makeSprite(frames, heroPal(hero, L), { pattern: L.kit.pattern, collar: 6, scale: scale || 1, glow: '#ffd84a' });
      });
    },
    // round 10 (PK, see pkPerson): the hero in that season's look — in the national team's kit for a shootout of
    // the national team (nat) — a teammate (n picks his hair and skin) and the other side's kicker. At three times
    // life size the pitch's gold halo outline would swamp him; Renderer.pkKicker rings his feet instead.
    pkHero(hero, yearIdx, small, nat) {
      const L0 = RS.heroLook(hero, yearIdx, null, small), L = nat ? Object.assign({}, L0, { kit: RS.NAT_KITS[hero] }) : L0;
      return get('pkh|' + L0.key + '|' + !!nat, () => pkPerson(L.hair, L.kid, heroPal(hero, L), { pattern: L.kit.pattern, collar: 6 }, L.armband));
    },
    pkMate(yearIdx, n, kit) {
      const k = kit || RS.ERAS[RS.YEARS[yearIdx].era].kit, i = n % 5;
      return get('pkm|' + k.main + k.alt + k.pattern + '|' + i, () => pkPerson(PK_HAIRS[i], false, kitPal(k, { H: '#2a1a10', f: '#2a1a10', s: PK_SKINS[i], B: '#222' }), { pattern: k.pattern, collar: 6 }));
    },
    pkFoe(yearIdx, n) {
      const foe = RS.foeColors(yearIdx), i = (n + 2) % 5;
      return get('pkf|' + foe.join() + '|' + i, () => pkPerson(PK_HAIRS[i], false, { K: foe[0], k2: foe[1] || '#111', S: '#20202a', W: foe[0], H: '#2a1a10', f: '#2a1a10', s: PK_SKINS[i], B: '#222' }, { pattern: 'trim', collar: 6 }));
    },
    // A keeper facing the kicker (RS.PK_KEEPERS look): frames 0-3 on his line, 4 diving (arms up).
    pkKeeper(look) {
      const st = look.style || 'short';
      return get('pkg|' + st + look.K + look.k2 + look.H + look.s + look.C, () => makeSprite(person(st).concat(person(st, 'head')),
        { K: look.K, k2: look.k2 || '#111', S: look.S || '#161616', W: look.W || look.K, H: look.H || '#2a1a10', f: look.H || '#2a1a10', s: look.s || '#d9a27a', C: look.C || look.K, B: '#222' },
        { pattern: 'trim', collar: 6 }));
    },
    messi(scale) {
      return get('messi|' + (scale || 1), () => makeSprite(person('messi'),
        { K: '#8cc8f0', k2: '#f6f6f6', S: '#1a1a2e', W: '#f6f6f6', H: '#4a3020', b: '#4a3020', s: '#e8b48e', B: '#f0f0f0' },
        { pattern: 'stripes', scale: scale || 1 }));
    },
    mate(id, yearIdx) {
      const def = RS.TEAMMATES[id];
      const era = RS.ERAS[RS.YEARS[yearIdx].era];
      return get('mate|' + id + '|' + RS.YEARS[yearIdx].era, () => {
        const hairs = ['short', 'slick', 'long', 'fade', 'bald'];
        let hash = 0; for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        const hair = def.style || (def.role === 'keeper' ? 'cap' : hairs[hash % hairs.length]);
        const pal = def.role === 'keeper'
          ? { K: '#2fd36b', k2: '#1a1a1a', S: '#1a1a1a', W: '#2fd36b', H: def.hair, s: def.skin, C: '#1a1a1a', B: '#222' }
          : kitPal(era.kit, { H: def.hair, s: def.skin, f: def.hair });
        // teammates: a thin green ring so "ours" reads apart from the dull enemy crowd without rivalling the hero.
        // Frames 0-3 run, 4 kick (a pass or a shot).
        return makeSprite(person(hair).concat(person(hair, 'kick')), pal, { pattern: def.role === 'keeper' ? 'trim' : era.kit.pattern, collar: 6, glow: 'rgba(80,230,130,0.85)' });
      });
    },
    coach(coachId, scale) {
      const c = RS.COACHES[coachId];
      return get('coach|' + coachId + '|' + scale, () => makeSprite(person('short').slice(0, 1),
        { K: c.look.suit, k2: '#f4f4f4', S: c.look.suit, W: '#222', H: c.look.hair, B: '#111' }, { pattern: 'trim', collar: 6, scale }));
    },
    enemy(type, yearIdx, tier) {
      const foe = RS.foeColors(yearIdx); // the era's opponents, or a named foe's kit (첼씨 blue)
      tier = tier || 0;
      return get('en|' + type + '|' + foe.join() + '|' + tier, () => {
        const o = (opt) => Object.assign({}, opt, tier ? { outline: TIER_OUTLINE[tier] } : {});
        const P = (pal) => tiered(dull(pal), tier);
        switch (type) {
          case 'grunt': return makeSprite(person('short'), P({ K: foe[0], k2: '#ffffff', S: '#20202a', W: foe[0], H: '#3a2a1a' }), o({ pattern: 'trim', collar: 6 }));
          // 이빨괴물 수아레즈 as a 준보스 (round 14): 리버풀 red whatever the season's crowd wears (the renderer scales him 1.5×)
          case 'bsuarez': return makeSprite(person('slick'), { K: '#c8102e', k2: '#f6eb61', S: '#c8102e', W: '#c8102e', H: '#1a1a1a', s: '#e0ac84' }, o({ pattern: 'trim', collar: 6 }));
          case 'runner': return makeSprite(person('long'), P({ K: foe[1], k2: '#202020', S: '#f4f4f4', W: foe[1], H: '#6a4a2a', s: '#c99070' }), o({ pattern: 'trim', collar: 6 }));
          case 'tank': return makeSprite([0, 1].map((i) => TANK.concat(TANK_LEGS[i])), P({ K: foe[0], k2: '#111', S: '#20202a', W: foe[0], H: '#111', s: '#b07a56' }), o({ pattern: 'trim', collar: 5 }));
          case 'ref': return makeSprite(person('bald').map((f) => { f = f.slice(); f[8] = '..s.KKKKK.Y..'; f[9] = '..s.KKKKK.Y..'; return f; }), P({ K: '#151515', k2: '#151515', S: '#151515', W: '#151515', s: '#e7b48c' }), o({}));
          case 'press': return makeSprite(person('cap').map((f) => { f = f.slice(); f[7] = '..sKKKKKKKCC.'; f[8] = '..sKKKKKKKCW.'; return f; }), P({ K: '#6e6e78', k2: '#6e6e78', S: '#30303a', W: '#30303a', C: '#2a2a2a', H: '#111' }), o({}));
          case 'minimessi': return makeSprite(person('messi'), P({ K: '#8cc8f0', k2: '#f6f6f6', S: '#1a1a2e', W: '#f6f6f6', H: '#4a3020', b: '#4a3020' }), { pattern: 'stripes', outline: '#123a6a' });
          case 'miniron': return makeSprite(person('fade'), P({ K: '#c41e2a', k2: '#1f7a3a', S: '#1f7a3a', W: '#c41e2a', H: '#20140c', B: '#f0c030' }), { pattern: 'sash', outline: '#5a0a10' });
        }
        return null;
      });
    },
    boss(spriteKey, yearIdx) {
      const foe = RS.foeColors(yearIdx);
      return get('boss|' + spriteKey + '|' + foe.join(), () => {
        const sc = 2;
        switch (spriteKey) {
          case 'bkeeper': return makeSprite(person('cap'), { K: '#f2e600', k2: '#111', S: '#111', W: '#f2e600', C: '#111', H: '#222' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'btackler': return makeSprite(person('fade'), { K: '#7a1020', k2: '#f0c040', S: '#111', W: '#7a1020', H: '#111', f: '#5a3a2a' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'bmaestro': return makeSprite(person('long'), { K: '#1b3f92', k2: '#9b1b3a', S: '#1b3f92', W: '#1b3f92', H: '#2a1a10' }, { pattern: 'stripes', scale: sc });
          case 'bstriker': return makeSprite(person('slick'), { K: '#ff7a1a', k2: '#1a1a1a', S: '#1a1a1a', W: '#ff7a1a', H: '#e2c068' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'bref': return makeSprite(person('bald').map((f) => { f = f.slice(); f[8] = '..s.KKKKK.R..'; f[9] = '..s.KKKKK.R..'; return f; }), { K: '#111', k2: '#111', S: '#111', W: '#111', R: '#e01b1b' }, { scale: sc });
          case 'bgiant': return makeSprite([0, 1].map((i) => TANK.concat(TANK_LEGS[i])), { K: foe[1], k2: '#111', S: '#111', W: foe[1], H: '#111', s: '#c98a66' }, { pattern: 'trim', collar: 5, scale: sc });
          // 드록빠: 첼씨 royal blue with white trim and socks, close-cropped hair
          case 'bdrogba': return makeSprite(person('fade'), { K: '#1a56b8', k2: '#f2f2f2', S: '#1a56b8', W: '#f2f2f2', H: '#111111', f: '#111111', s: '#5a3a26' }, { pattern: 'trim', collar: 6, scale: sc });
          // 토레쓰 (round 11): 첼씨 blue like 드록빠, told apart by the blond banded hair and white boots
          case 'btorres': return makeSprite(person('torres'), { K: '#1a56b8', k2: '#f2f2f2', S: '#1a56b8', W: '#f2f2f2', H: TORRES_HAIR, s: TORRES_SKIN, B: '#f0f0f0' }, { pattern: 'trim', collar: 6, scale: sc });
          // 이빨괴물 수아레즈 (round 14): 리버풀 red with the yellow trim, slicked dark hair
          case 'bsuarez': return makeSprite(person('slick'), { K: '#c8102e', k2: '#f6eb61', S: '#c8102e', W: '#c8102e', H: '#1a1a1a', s: '#e0ac84' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'messi': return RS.Sprites.messi(1);
          case 'ronaldo': { const ry = RS.YEARS_RONALDO; return RS.Sprites.hero('ronaldo', ry.length - 1, 1, ry[ry.length - 1]); }
        }
        return null;
      });
    },
    item(key, pal) {
      return get('it|' + key + '|' + (pal ? JSON.stringify(pal) : ''), () => {
        let rows, p = pal || {};
        switch (key) {
          case 'ball': rows = SMALL.ball; p = Object.assign({ W: '#ffffff', B: '#1a1a1a' }, p); break;
          case 'golden': rows = SMALL.ball; p = { W: '#ffd84a', B: '#b07a10' }; break;
          case 'tiki': rows = SMALL.ball; p = { W: '#ffffff', B: '#a50044' }; break; // 메시's passes: blaugrana
          case 'curler': rows = SMALL.ball; p = { W: '#eaf6ff', B: '#75aadb' }; break; // albiceleste
          case 'knuckle': rows = SMALL.ball; p = { W: '#e8f6ff', B: '#2a6ad8' }; break;
          case 'cannon': rows = SMALL.ball7; p = { W: '#ffb347', B: '#d0281a' }; break;
          case 'pcannon': rows = SMALL.ball7; p = { W: '#ffffff', B: '#13a6c4' }; break; // 패널두's 11m cannon (round 19)
          case 'scissor': rows = SMALL.ball; p = { W: '#ffffff', B: '#e0306a' }; break;
          case 'scissor2': rows = SMALL.ball; p = { W: '#e8d0ff', B: '#7a2ad8' }; break;
          case 'rabona': rows = SMALL.ball; p = { W: '#fff0d0', B: '#e06a10' }; break;
          case 'rabona2': rows = SMALL.ball7; p = { W: '#ffe0f4', B: '#c02a90' }; break;
          case 'shot': rows = SMALL.ball7; p = { W: '#fffbe0', B: '#e0a010' }; break;
          case 'pass': case 'mateball': rows = SMALL.ball; p = { W: '#ffffff', B: '#3a8a3a' }; break;
          case 'eball': rows = SMALL.ball; p = { W: '#ffd0d0', B: '#a01010' }; break;
          case 'mball': rows = SMALL.ball; p = { W: '#d8f0ff', B: '#2a72c0' }; break;
          case 'card': rows = SMALL.card; break;
          case 'redcard': rows = SMALL.redcard; break;
          case 'gem1': rows = SMALL.gem1; p = { W: '#ffffff', B: '#58c8ff' }; break;
          case 'gem2': rows = SMALL.gem2; break;
          case 'gem3': rows = SMALL.gem3; break;
          case 'coin': rows = SMALL.coin; break;
          case 'heal': rows = SMALL.heal; break;
          case 'magnet': rows = SMALL.magnet; break;
          case 'chest': rows = SMALL.chest; break;
        }
        return { n: paint(rows, p, {}), w: (rows[0].length + 2), h: rows.length + 2 };
      });
    },
    ORB_FRAMES,
    // 메시's orbiting ball: look 'white' | 'gold' | 'ballon', diameter in low-res px, spin frame
    orb(look, d, frame) { return get('orb|' + look + '|' + d + '|' + frame, () => orbSprite(look, d, frame)); },
    // soft gold halo behind the 발롱도르 (drawn additively)
    orbGlow(d) {
      return get('orbglow|' + d, () => {
        const s = Math.ceil(d * 1.8) + 4, c = canvas(s, s), g = c.getContext('2d');
        const gr = g.createRadialGradient(s / 2, s / 2, d * 0.25, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(255,214,100,0.55)'); gr.addColorStop(1, 'rgba(255,190,60,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
        return c;
      });
    },
    shadow() {
      return get('shadow', () => {
        const c = canvas(13, 5); const x = c.getContext('2d');
        x.fillStyle = 'rgba(0,0,0,0.28)';
        x.fillRect(3, 0, 7, 1); x.fillRect(1, 1, 11, 3); x.fillRect(3, 4, 7, 1);
        return c;
      });
    },
    // 64×64 world px of turf at twice the detail (128×128 canvas; the renderer draws it at 64×64): two mowing
    // stripes with a soft sheen across each, short grass blades and a few tufts.
    grassTile(themeKey) {
      return get('grass2|' + themeKey, () => {
        const th = RS.ERAS[themeKey].theme;
        const c = canvas(128, 128); const x = c.getContext('2d');
        x.fillStyle = th.g1; x.fillRect(0, 0, 64, 128);
        x.fillStyle = th.g2; x.fillRect(64, 0, 64, 128);
        for (const [x0, a] of [[0, 0.05], [64, 0.035]]) {
          const g = x.createLinearGradient(x0, 0, x0 + 64, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = g; x.fillRect(x0, 0, 64, 128);
        }
        const rng = RS.makeRng(themeKey.length * 77 + 5);
        for (let i = 0; i < 560; i++) { // blades: 1-px strokes, lit ones and shaded ones
          const bx = Math.floor(rng() * 128), by = Math.floor(rng() * 128);
          x.fillStyle = rng() < 0.55 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
          x.fillRect(bx, by, 1, 1 + Math.floor(rng() * 3));
        }
        for (let i = 0; i < 24; i++) { // tufts: three blades over a dark root
          const bx = 2 + Math.floor(rng() * 122), by = 3 + Math.floor(rng() * 121);
          x.fillStyle = 'rgba(0,0,0,0.13)'; x.fillRect(bx - 1, by + 2, 4, 1);
          x.fillStyle = 'rgba(255,255,255,0.11)'; x.fillRect(bx - 1, by, 1, 2); x.fillRect(bx + 2, by, 1, 2); x.fillRect(bx + 1, by - 1, 1, 3);
        }
        return c;
      });
    },
    // 신의 손: an open hand seen from above (fingers up, thumb out to the left), built from simple shapes and
    // painted in HD with the people's rim light and outline. { c: canvas, w, h } in world px.
    hand() {
      return get('hand', () => {
        const W = 16, Hh = 19, g = [];
        for (let j = 0; j < Hh; j++) g.push(new Array(W).fill('.'));
        const rect = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < Hh) g[y][x] = ch; };
        for (const [fx, top] of [[3, 2], [6, 0], [9, 1], [12, 4]]) { rect(fx, top, fx + 1, 9, 's'); g[top][fx] = 'y'; g[top][fx + 1] = 'y'; } // fingers, nails
        rect(3, 8, 13, 15, 's'); // palm
        rect(4, 16, 12, 18, 'S'); // cuff
        for (const [tx, ty] of [[0, 7], [1, 8], [1, 9], [2, 9], [2, 10], [2, 11], [0, 8], [1, 10]]) g[ty][tx] = 's'; // thumb
        rect(5, 12, 11, 12, 'b'); // a crease across the palm
        const c = paint(g.map((r) => r.join('')), { s: '#f0c39a', y: '#f8e2cf', b: '#d79a72', S: '#2a63c8' }, { hd: true });
        return { c, w: c.width / 2, h: c.height / 2 };
      });
    },
    // Canvas element (CSS-scaled) for DOM screens.
    toCanvas(sprite, frame, cssScale) {
      const src = sprite.frames ? sprite.frames[frame || 0].n : sprite.n, k = sprite.hd || 1;
      const c = canvas(src.width, src.height);
      c.getContext('2d').drawImage(src, 0, 0);
      c.style.width = (src.width / k * cssScale) + 'px';
      c.style.height = (src.height / k * cssScale) + 'px';
      c.className = 'pix';
      return c;
    }
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).sprites = 'R23';
