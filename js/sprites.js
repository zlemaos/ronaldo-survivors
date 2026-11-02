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
    G: '#e0a822', g: '#ffd75a', O: '#c06a2a', o: '#f2a35a', R: '#d22b2b', c: '#7a4a22' };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Render a char grid with palette + per-pixel kit pattern. Adds outline. Returns canvas.
  // opt.glow: a second, bright outline ring outside the dark one (the player's "I am the hero" halo).
  function paint(rows, pal, opt) {
    opt = opt || {};
    const sc = opt.scale || 1;
    const pad = opt.glow ? 2 : 1;
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const W = (w + pad * 2) * sc, H = (h + pad * 2) * sc;
    const c = canvas(W, H);
    const x = c.getContext('2d');
    const fill = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const ch = rows[j][i] || '.';
        let col = pal[ch] !== undefined ? pal[ch] : BASE_PAL[ch];
        if (ch === 'K' && opt.pattern && pal.k2) {
          const p = opt.pattern;
          const alt = (p === 'hoops' && j % 2 === 0) || (p === 'stripes' && i % 2 === 1) ||
            (p === 'trim' && (j === opt.collar || i === 1 || i === w - 2)) ||
            (p === 'sash' && ((i - j + 40) % 7 === 0));
          if (alt) col = pal.k2;
        }
        if (opt.white && col) col = '#ffffff';
        if (!col) continue;
        fill.push([i, j]);
        x.fillStyle = col;
        x.fillRect((i + pad) * sc, (j + pad) * sc, sc, sc);
      }
    }
    // outline (4-neighbour ring), then the optional glow ring (8-neighbour, one step further out)
    const on = new Set(fill.map(([i, j]) => i + ',' + j));
    const ring = [];
    x.fillStyle = opt.white ? 'rgba(255,255,255,0.9)' : (opt.outline || 'rgba(16,12,10,0.95)');
    for (const [i, j] of fill) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, key = ni + ',' + nj;
        if (!on.has(key)) { on.add(key); ring.push([ni, nj]); x.fillRect((ni + pad) * sc, (nj + pad) * sc, sc, sc); }
      }
    }
    if (opt.glow) {
      x.fillStyle = opt.white ? 'rgba(255,255,255,0.9)' : opt.glow;
      for (const [i, j] of ring) {
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const ni = i + di, nj = j + dj, key = ni + ',' + nj;
          if (!on.has(key)) { on.add(key); x.fillRect((ni + pad) * sc, (nj + pad) * sc, sc, sc); }
        }
      }
    }
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

  // Sprite = { frames: [{n, f, w}], w, h } ; n normal, f flipped, w white flash
  function makeSprite(frameRows, pal, opt) {
    const frames = frameRows.map((rows) => {
      const n = paint(rows, pal, opt);
      const wcan = paint(rows, pal, Object.assign({}, opt, { white: true }));
      return { n, f: flip(n), w: wcan, wf: flip(wcan) };
    });
    return { frames, w: frames[0].n.width, h: frames[0].n.height };
  }

  // pose: undefined → 4 run frames; 'kick' / 'head' → one posed frame
  function person(hair, pose, kid) {
    const head = (HAIR[hair] || HAIR.short).map(pad);
    const body = kid ? kidRows(BODY) : BODY;
    if (pose === 'kick') return [head.concat(body, KICK_LEGS)];
    if (pose === 'head') return [head.concat(kid ? kidRows(HEAD_BODY) : HEAD_BODY, HEAD_LEGS)];
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
  RS.heroLook = (hero, yearIdx, yd, small) => hero === 'messi' ? RS.messiLook(yearIdx, yd, small) : RS.ronaldoLook(yearIdx, yd);

  function kitPal(kit, extra) {
    return Object.assign({ K: kit.main, k2: kit.alt, S: kit.shorts, W: kit.socks }, extra || {});
  }

  RS.Sprites = {
    ronaldo(yearIdx, scale, yd) { return RS.Sprites.hero('ronaldo', yearIdx, scale, yd); },
    // Player sprite for a hero: frames 0-3 run cycle, 4 kick pose, 5 heading jump (see Renderer.drawPlayer)
    hero(hero, yearIdx, scale, yd, small) {
      const L = RS.heroLook(hero, yearIdx, yd, small);
      return get(L.key + '|' + (scale || 1), () => {
        const frames = person(L.hair, null, L.kid).concat(person(L.hair, 'kick', L.kid), person(L.hair, 'head', L.kid));
        if (L.armband) for (const f of frames) f[7] = f[7].slice(0, 2) + 'A' + f[7].slice(3);
        const pal = hero === 'messi'
          ? kitPal(L.kit, { H: '#4a3020', b: '#4a3020', B: L.goldBoots ? '#f0c030' : '#f0f0f0', A: '#75aadb', s: '#e8b48e' })
          : kitPal(L.kit, { H: '#20140c', h: '#e8c870', B: L.goldBoots ? '#f0c030' : '#222', A: '#ffd400', s: '#d9a27a' });
        // the hero alone carries a gold halo outline: instantly separable from the crowd
        return makeSprite(frames, pal, { pattern: L.kit.pattern, collar: 6, scale: scale || 1, glow: '#ffd84a' });
      });
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
        // teammates: a thin green ring so "ours" reads apart from the dull enemy crowd without rivalling the hero
        return makeSprite(person(hair), pal, { pattern: def.role === 'keeper' ? 'trim' : era.kit.pattern, collar: 6, glow: 'rgba(80,230,130,0.85)' });
      });
    },
    coach(coachId, scale) {
      const c = RS.COACHES[coachId];
      return get('coach|' + coachId + '|' + scale, () => makeSprite(person('short').slice(0, 1),
        { K: c.look.suit, k2: '#f4f4f4', S: c.look.suit, W: '#222', H: c.look.hair, B: '#111' }, { pattern: 'trim', collar: 6, scale }));
    },
    enemy(type, yearIdx, tier) {
      const era = RS.ERAS[RS.YEARS[yearIdx].era];
      const foe = era.foe;
      tier = tier || 0;
      return get('en|' + type + '|' + RS.YEARS[yearIdx].era + '|' + tier, () => {
        const o = (opt) => Object.assign({}, opt, tier ? { outline: TIER_OUTLINE[tier] } : {});
        const P = (pal) => tiered(dull(pal), tier);
        switch (type) {
          case 'grunt': return makeSprite(person('short'), P({ K: foe[0], k2: '#ffffff', S: '#20202a', W: foe[0], H: '#3a2a1a' }), o({ pattern: 'trim', collar: 6 }));
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
      const era = RS.ERAS[RS.YEARS[yearIdx].era];
      return get('boss|' + spriteKey + '|' + RS.YEARS[yearIdx].era, () => {
        const sc = 2;
        switch (spriteKey) {
          case 'bkeeper': return makeSprite(person('cap'), { K: '#f2e600', k2: '#111', S: '#111', W: '#f2e600', C: '#111', H: '#222' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'btackler': return makeSprite(person('fade'), { K: '#7a1020', k2: '#f0c040', S: '#111', W: '#7a1020', H: '#111', f: '#5a3a2a' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'bmaestro': return makeSprite(person('long'), { K: '#1b3f92', k2: '#9b1b3a', S: '#1b3f92', W: '#1b3f92', H: '#2a1a10' }, { pattern: 'stripes', scale: sc });
          case 'bstriker': return makeSprite(person('slick'), { K: '#ff7a1a', k2: '#1a1a1a', S: '#1a1a1a', W: '#ff7a1a', H: '#e2c068' }, { pattern: 'trim', collar: 6, scale: sc });
          case 'bref': return makeSprite(person('bald').map((f) => { f = f.slice(); f[8] = '..s.KKKKK.R..'; f[9] = '..s.KKKKK.R..'; return f; }), { K: '#111', k2: '#111', S: '#111', W: '#111', R: '#e01b1b' }, { scale: sc });
          case 'bgiant': return makeSprite([0, 1].map((i) => TANK.concat(TANK_LEGS[i])), { K: era.foe[1], k2: '#111', S: '#111', W: era.foe[1], H: '#111', s: '#c98a66' }, { pattern: 'trim', collar: 5, scale: sc });
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
    grassTile(themeKey) {
      return get('grass|' + themeKey, () => {
        const th = RS.ERAS[themeKey].theme;
        const c = canvas(64, 64); const x = c.getContext('2d');
        x.fillStyle = th.g1; x.fillRect(0, 0, 32, 64);
        x.fillStyle = th.g2; x.fillRect(32, 0, 32, 64);
        const rng = RS.makeRng(themeKey.length * 77 + 5);
        for (let i = 0; i < 70; i++) {
          x.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
          x.fillRect(Math.floor(rng() * 64), Math.floor(rng() * 64), 1, rng() < 0.3 ? 2 : 1);
        }
        return c;
      });
    },
    // Canvas element (CSS-scaled) for DOM screens.
    toCanvas(sprite, frame, cssScale) {
      const src = sprite.frames ? sprite.frames[frame || 0].n : sprite.n;
      const c = canvas(src.width, src.height);
      c.getContext('2d').drawImage(src, 0, 0);
      c.style.width = (src.width * cssScale) + 'px';
      c.style.height = (src.height * cssScale) + 'px';
      c.className = 'pix';
      return c;
    }
  };
})(globalThis.RS = globalThis.RS || {});
