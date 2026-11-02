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
  const HAIR = {
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
  function paint(rows, pal, opt) {
    opt = opt || {};
    const sc = opt.scale || 1;
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const W = (w + 2) * sc, H = (h + 2) * sc;
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
        x.fillRect((i + 1) * sc, (j + 1) * sc, sc, sc);
      }
    }
    // outline
    const on = new Set(fill.map(([i, j]) => i + ',' + j));
    x.fillStyle = opt.white ? 'rgba(255,255,255,0.9)' : (opt.outline || 'rgba(16,12,10,0.95)');
    for (const [i, j] of fill) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (!on.has(ni + ',' + nj)) x.fillRect((ni + 1) * sc, (nj + 1) * sc, sc, sc);
      }
    }
    return c;
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
  function person(hair, pose) {
    const head = (HAIR[hair] || HAIR.short).map(pad);
    if (pose === 'kick') return [head.concat(BODY, KICK_LEGS)];
    if (pose === 'head') return [head.concat(HEAD_BODY, HEAD_LEGS)];
    return LEGS.map((legs) => head.concat(BODY, legs));
  }

  const cache = {};
  function get(key, build) { return cache[key] || (cache[key] = build()); }

  // ---------------------------------------------------------------- 날두 evolves by year
  RS.ronaldoLook = function (yearIdx) {
    const y = RS.YEARS[yearIdx];
    const era = RS.ERAS[y.era];
    const hair = y.year <= 2004 ? 'young' : y.year <= 2010 ? 'slick' : y.year <= 2022 ? 'fade' : 'veteran';
    return {
      hair, kit: era.kit,
      goldBoots: y.year >= 2008,
      armband: y.year >= 2016,
      key: 'ron|' + hair + '|' + y.era + '|' + (y.year >= 2008) + '|' + (y.year >= 2016)
    };
  };

  function kitPal(kit, extra) {
    return Object.assign({ K: kit.main, k2: kit.alt, S: kit.shorts, W: kit.socks }, extra || {});
  }

  RS.Sprites = {
    ronaldo(yearIdx, scale) {
      const L = RS.ronaldoLook(yearIdx);
      return get(L.key + '|' + (scale || 1), () => {
        // frames 0-3 run cycle, 4 kick pose, 5 heading jump (see Renderer.drawPlayer)
        const frames = person(L.hair).concat(person(L.hair, 'kick'), person(L.hair, 'head'));
        if (L.armband) for (const f of frames) f[7] = f[7].slice(0, 2) + 'A' + f[7].slice(3);
        const pal = kitPal(L.kit, { H: '#20140c', h: '#e8c870', B: L.goldBoots ? '#f0c030' : '#222', A: '#ffd400', s: '#d9a27a' });
        return makeSprite(frames, pal, { pattern: L.kit.pattern, collar: 6, scale: scale || 1 });
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
        const hair = def.role === 'keeper' ? 'cap' : hairs[hash % hairs.length];
        const pal = def.role === 'keeper'
          ? { K: '#2fd36b', k2: '#1a1a1a', S: '#1a1a1a', W: '#2fd36b', H: def.hair, s: def.skin, C: '#1a1a1a', B: '#222' }
          : kitPal(era.kit, { H: def.hair, s: def.skin, f: def.hair });
        return makeSprite(person(hair), pal, { pattern: def.role === 'keeper' ? 'trim' : era.kit.pattern, collar: 6 });
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
        const P = (pal) => tiered(pal, tier);
        switch (type) {
          case 'grunt': return makeSprite(person('short'), P({ K: foe[0], k2: '#ffffff', S: '#20202a', W: foe[0], H: '#3a2a1a' }), o({ pattern: 'trim', collar: 6 }));
          case 'runner': return makeSprite(person('long'), P({ K: foe[1], k2: '#202020', S: '#f4f4f4', W: foe[1], H: '#6a4a2a', s: '#c99070' }), o({ pattern: 'trim', collar: 6 }));
          case 'tank': return makeSprite([0, 1].map((i) => TANK.concat(TANK_LEGS[i])), P({ K: foe[0], k2: '#111', S: '#20202a', W: foe[0], H: '#111', s: '#b07a56' }), o({ pattern: 'trim', collar: 5 }));
          case 'ref': return makeSprite(person('bald').map((f) => { f = f.slice(); f[8] = '..s.KKKKK.Y..'; f[9] = '..s.KKKKK.Y..'; return f; }), P({ K: '#151515', k2: '#151515', S: '#151515', W: '#151515', s: '#e7b48c' }), o({}));
          case 'press': return makeSprite(person('cap').map((f) => { f = f.slice(); f[7] = '..sKKKKKKKCC.'; f[8] = '..sKKKKKKKCW.'; return f; }), P({ K: '#6e6e78', k2: '#6e6e78', S: '#30303a', W: '#30303a', C: '#2a2a2a', H: '#111' }), o({}));
          case 'minimessi': return makeSprite(person('messi'), P({ K: '#8cc8f0', k2: '#f6f6f6', S: '#1a1a2e', W: '#f6f6f6', H: '#4a3020', b: '#4a3020' }), { pattern: 'stripes', outline: '#123a6a' });
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
          case 'knuckle': rows = SMALL.ball; p = { W: '#e8f6ff', B: '#2a6ad8' }; break;
          case 'cannon': rows = SMALL.ball7; p = { W: '#ffb347', B: '#d0281a' }; break;
          case 'scissor': rows = SMALL.ball; p = { W: '#ffffff', B: '#e0306a' }; break;
          case 'scissor2': rows = SMALL.ball; p = { W: '#e8d0ff', B: '#7a2ad8' }; break;
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
