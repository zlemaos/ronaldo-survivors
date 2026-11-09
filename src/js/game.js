/* 호날두 서바이버즈 — game logic (no DOM). One World = one year (stage).
 * Renderer and UI only read world state and drain world.events. Fixed-step update(dt, input). */
(function (RS) {
  'use strict';
  const TAU = Math.PI * 2;

  // ================================================================ Build (persistent across years in a career)
  RS.newBuild = function (hero) {
    hero = RS.HEROES[hero] ? hero : 'ronaldo';
    const start = RS.HEROES[hero].startSkill;
    return RS.syncWeapon({
      level: 1, xp: 0, rivalry: { w: 0, l: 0 },
      // round 11: the one weapon in hand ({id, g: grade index into RS.GRADES, p: 강화 +1 … +10, v: evolution
      // variant}) and the 무기고 of the other weapons owned (one copy per move, the best kept)
      weapon: { id: start, g: 0, p: 1 }, armory: [],
      // runtime mirror of the weapon (RS.syncWeapon): World and Renderer read these as one move at a level
      skills: {}, skillOrder: [], evolved: {}, stars: {},
      passives: {}, passiveOrder: [], passiveGrades: {}, // passiveGrades[id]: the grade of each level's card (round 13)
      teammates: [], // on the pitch [{id, lv}], at most MAX_MATES (lv = the teammate's 강화 +1 … +10)
      bench: [], // bench warmers [{id, lv}], at most MAX_BENCH (weak passive synergy)
      coachCards: [], // card ids, stack for the career
      relics: {}, relicOrder: [], // 특수 카드 items (id -> 1), kept for the career
      drills: {}, // 개인 훈련 cards taken (id -> count, no cap)
      bonusHp: 0, bonusReroll: 0, // boss rewards (permanent for the career)
      hgh: null, // 메시 growth hormone: null = not decided yet (small body), true = treated, false = small for good
      fans: RS.FANS.start, // 민심 0–100, moved by press conferences (RS.fanTier)
      flags: {}, // story marks left by press answers (e.g. fatherJail)
      ballons: [], // years of the 발롱도르 won in this career (RS.ballonCount): trophy balls need them
      hero
    });
  };
  // Skills / passives / items a hero may take: hero-locked entries name their hero (or a list of heroes). A passive
  // without a hero follows the moves it pairs with: one paired only with the other heroes' moves is never offered.
  const heroOk = (h, hero) => !h || (Array.isArray(h) ? h.includes(hero) : h === hero);
  RS.skillFor = (id, hero) => heroOk(RS.SKILLS[id].hero, hero);
  RS.passiveFor = (id, hero) => {
    const h = RS.PASSIVES[id].hero;
    if (h) return heroOk(h, hero);
    const pairs = Object.keys(RS.SKILLS).filter((k) => RS.SKILLS[k].passive === id);
    return !pairs.length || pairs.some((k) => RS.skillFor(k, hero));
  };
  RS.relicFor = (id, hero) => heroOk(RS.RELICS[id].hero, hero || 'ronaldo');
  // Can this build be offered the item? Its hero, and its story condition (need 'hgh': only after the treatment).
  RS.relicOk = (id, b) => RS.relicFor(id, b.hero) && (RS.RELICS[id].need !== 'hgh' || b.hgh === true);
  // A stacking item (약물 꽂기): doses taken and the multiplier on its mods (first dose 1, each more + STIM.step).
  RS.stimDoses = (b) => (b.relics && b.relics.doping) || 0;
  RS.stackMul = (n) => (n > 0 ? 1 + RS.STIM.step * (n - 1) : 0);
  RS.skillUse = (id) => RS.SKILLS[id].use || id; // runtime behaviour of a move

  // ================================================================ Round 11: one weapon (RS.GRADES, 강화)
  RS.clampGrade = (g) => Math.max(0, Math.min(RS.GRADES.length - 1, g | 0));
  RS.gradeOf = (g) => RS.GRADES[RS.clampGrade(g)];
  RS.plusOf = (p) => Math.max(1, Math.min(RS.PLUS_MAX, p | 0));
  // Damage multiplier of a weapon: its grade × (1 + PLUS_STEP per 강화 step), so 일반 +10 (1.27) < 고급 +1 (1.3).
  RS.weaponMul = (w) => (w ? RS.gradeOf(w.g).mul * (1 + RS.PLUS_STEP * (RS.plusOf(w.p) - 1)) : 1);
  RS.weaponPower = (w) => Math.round(100 * RS.weaponMul(w)); // 무기 공격력 on the cards (일반 +1 = 100)
  RS.weaponBetter = (a, b) => !b || RS.weaponMul(a) > RS.weaponMul(b) + 1e-9;
  // Moves a hero can wield at grade g: his own, no story gifts (RS.EVENTS teach those), 합체 moves from SS up, and a
  // move with a story condition (need: a build flag, e.g. 제토라인 once 제라두 has joined) only for a build that met it.
  RS.weaponIds = (hero, g, b) => Object.keys(RS.SKILLS).filter((id) => RS.skillFor(id, hero) && !RS.SKILLS[id].gift && (!RS.SKILLS[id].fusion || g >= RS.FUSED_FROM) && (!RS.SKILLS[id].need || !!(b && b.flags && b.flags[RS.SKILLS[id].need])));
  // Every owned weapon loses n grades (a knee that gave way: RS.EVENTS.wc2010). Never below B; the hand is re-synced.
  RS.downgradeWeapons = function (b, n) {
    for (const w of [b.weapon].concat(b.armory || [])) w.g = RS.clampGrade(w.g - (n || 1));
    RS.syncWeapon(b);
    return b;
  };
  // The mirror the World and the Renderer read: one move at the grade's table row (RS.GRADES lv); 전설 is its
  // evolved form (the 회전 공 only once a 발롱도르 is won), with the variant w.v for moves that have several.
  RS.syncWeapon = function (b) {
    const w = b.weapon, s = RS.SKILLS[w.id], G = RS.gradeOf(w.g);
    b.skills = { [w.id]: G.lv }; b.skillOrder = [w.id]; b.evolved = {}; b.stars = {};
    if (G.evo && (!s.needBallon || RS.ballonCount(b))) b.evolved[w.id] = s.evos ? (s.evos[w.v] ? w.v : Object.keys(s.evos)[0]) : true;
    return b;
  };
  RS.ownedWeapon = (b, id) => (b.weapon && b.weapon.id === id ? b.weapon : b.armory.find((x) => x.id === id)) || null;
  // Worth taking: a move not owned yet, or a better copy of one (the hand and the 무기고 keep one copy per move).
  RS.weaponNew = (b, w) => RS.weaponBetter(w, RS.ownedWeapon(b, w.id));
  // Gain a weapon. It replaces the owned copy of its move (a copy in hand stays in hand); equip: take it in hand,
  // the one held goes to the 무기고. False when it is no better than the copy owned.
  RS.gainWeapon = function (b, w, equip) {
    if (!RS.SKILLS[w.id] || !RS.weaponNew(b, w)) return false;
    const nw = { id: w.id, g: RS.clampGrade(w.g), p: RS.plusOf(w.p) };
    if (w.v) nw.v = w.v;
    const held = b.weapon.id === w.id;
    b.armory = b.armory.filter((x) => x.id !== w.id);
    if (held || equip) { if (!held) b.armory.push(b.weapon); b.weapon = nw; } else b.armory.push(nw);
    RS.syncWeapon(b);
    return true;
  };
  // Take a 무기고 weapon in hand (훈련장, between seasons): the two trade places.
  RS.equipFromArmory = function (b, id) {
    const i = b.armory.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const w = b.armory.splice(i, 1)[0];
    b.armory.push(b.weapon);
    b.weapon = w;
    RS.syncWeapon(b);
    return true;
  };
  // 강화 of the weapon in hand by n steps (capped at +PLUS_MAX). False when it is maxed.
  RS.enhanceWeapon = function (b, n) {
    if (b.weapon.p >= RS.PLUS_MAX) return false;
    b.weapon.p = RS.plusOf(b.weapon.p + (n || 1));
    return true;
  };
  RS.rollGrade = function (rng, odds) {
    let r = rng();
    for (let g = 0; g < odds.length; g++) { if (r < odds[g]) return g; r -= odds[g]; }
    return 0;
  };
  RS.rollPlus = function (rng, weights) {
    let r = rng() * weights.reduce((a, x) => a + x, 0);
    for (let i = 0; i < weights.length; i++) { if (r < weights[i]) return i + 1; r -= weights[i]; }
    return 1;
  };
  // luck (행운 부적, items): × (1 + luck) on the odds of 희귀 and up, taken from 일반, then 고급; when those run out,
  // the odds are scaled back to a sum of 1. A grade the season has not opened (odds 0) stays closed. (Taking the
  // excess from 일반 alone left the odds over 1 once a late season had no 일반, and RS.rollGrade never reached the
  // top: from season 10 a 20 % 행운 부적 dealt no 전설 at all.)
  RS.luckOdds = function (odds, luck) {
    if (!luck) return odds;
    const o = odds.map((p, g) => (g >= 2 ? p * (1 + luck) : p));
    let over = o.reduce((a, x) => a + x, 0) - 1;
    for (let g = 0; g < 2 && over > 0; g++) { const t = Math.min(o[g], over); o[g] -= t; over -= t; }
    if (over > 0) for (let g = 0; g < o.length; g++) o[g] /= 1 + over;
    return o;
  };
  // A random weapon: a grade from `odds` (a season's RS.GRADE_STAGES row, a 무기 상자, 토레쓰's reward), a move of
  // this hero for that grade, a 강화.
  RS.rollWeapon = function (b, rng, odds) {
    const g = RS.rollGrade(rng, odds), ids = RS.weaponIds(b.hero, g, b);
    const id = ids[Math.floor(rng() * ids.length)], evos = RS.SKILLS[id].evos;
    const w = { id, g, p: RS.rollPlus(rng, RS.WEAPON_PLUS_W) };
    if (evos) { const ks = Object.keys(evos); w.v = ks[Math.floor(rng() * ks.length)]; }
    return w;
  };
  // Grade odds of the level-up weapon and passive cards at pro season idx (RS.GRADE_STAGES); the difficulty's `top`
  // (하드) moves part of the 영웅 and 전설 share down to 희귀.
  RS.gradeOddsAt = function (idx) {
    let o = RS.GRADE_STAGES[0].odds;
    for (const s of RS.GRADE_STAGES) if ((idx || 0) >= s.from) o = s.odds;
    const top = (RS.DIFFS[RS.DIFF] || RS.DIFFS.normal).top;
    if (top == null || top === 1) return o;
    const r = o.slice();
    for (let g = 3; g < r.length; g++) { r[2] += r[g] * (1 - top); r[g] *= top; }
    return r;
  };
  // The weapon card of a level-up: a few rolls for one worth taking (a move not owned, or a better copy).
  RS.offerWeapon = function (b, rng, luck, idx) {
    const odds = RS.luckOdds(RS.gradeOddsAt(idx), luck);
    for (let i = 0; i < 6; i++) { const w = RS.rollWeapon(b, rng, odds); if (RS.weaponNew(b, w)) return w; }
    return null;
  };
  // 승부차기 토너먼트 rewards (round 19): a move the cup unlocked (meta.unlocked, RS.CUP_REWARDS) is not handed over —
  // it can turn up. On a level-up of its hero one card in RS.CUP_OFFER is that move at SIUUU (RS.CUP_GRADE); never
  // once a copy that good is owned. The rng is drawn only when such a move exists, so other hands stay as they were.
  RS.CUP_OFFER = 0.03;
  RS.cupOffer = function (b, rng, unlocked, hero) {
    const ids = RS.CUP_REWARDS.filter((r) => r.hero === hero && unlocked && unlocked[r.id] && RS.weaponNew(b, { id: r.id, g: RS.CUP_GRADE, p: 1 })).map((r) => r.id);
    if (!ids.length || rng() >= RS.CUP_OFFER) return null;
    const id = ids[Math.floor(rng() * ids.length)];
    return { kind: 'weapon', id, wpn: { id, g: RS.CUP_GRADE, p: 1 }, cup: true };
  };
  // A 무기 상자: the weapon goes straight into the hand when it beats the one held, else to the 무기고; a copy no
  // better than the one owned turns into coins (RS.SELL_BACK of the price). Returns { w, kept, refund }.
  RS.openBox = function (b, w, box) {
    const hand = RS.weaponBetter(w, b.weapon);
    if (RS.gainWeapon(b, w, hand)) return { w, kept: hand ? 'hand' : 'armory', refund: 0 };
    return { w, kept: false, refund: Math.round(box.cost * RS.SELL_BACK) };
  };
  RS.gradeTag = (w) => RS.gradeOf(w.g).name + ' +' + RS.plusOf(w.p);
  RS.weaponName = (b, w) => (RS.gradeOf(w.g).evo ? RS.evoTitle(b, w.id, w.v) : RS.SKILLS[w.id].name);
  RS.weaponIcon = (w) => { const s = RS.SKILLS[w.id], v = s.evos && s.evos[w.v]; return RS.gradeOf(w.g).evo ? (v ? v.icon : s.evoIcon) : s.icon; };
  RS.weaponDesc = (b, w) => (RS.gradeOf(w.g).evo ? RS.evoDescFor(b, w.id, w.v) : RS.SKILLS[w.id].desc);
  // Old saves held up to six moves: each becomes a weapon of the grade its level earned (Lv.1 일반, Lv.2–3 고급,
  // Lv.4–5 희귀, Lv.6 영웅, evolved 전설 with +2 per 각성 star; a 합체 move at least 영웅).
  RS.weaponFromSkill = function (b, id) {
    const lv = b.skills[id] || 1, ev = b.evolved && b.evolved[id], st = (b.stars && b.stars[id]) || 0;
    let g = ev ? 4 : lv >= 6 ? 3 : lv >= 4 ? 2 : lv >= 2 ? 1 : 0;
    if (RS.SKILLS[id].fusion) g = Math.max(g, RS.FUSED_FROM);
    const w = { id, g, p: RS.plusOf(1 + 2 * st) };
    if (typeof ev === 'string') w.v = ev;
    return w;
  };
  // 발롱도르 the hero has won in this career (build.ballons): only these may show as trophy balls (RS.BALLON_MAX).
  RS.ballonCount = (b) => Math.min(RS.BALLON_MAX, ((b && b.ballons) || []).length);
  // Look of 메시's ball moves (회전 공, 드리볼, 드롭볼, 위성 군단; Renderer): a plain white ball, golden from the skill's
  // goldLv; evolved, the first ballonCount balls of a move are 발롱도르 trophies and the rest stay golden.
  RS.ballLook = (b, id) => (b.evolved[id] ? (RS.ballonCount(b) ? 'ballon' : 'gold') : (b.skills[id] || 0) >= (RS.SKILLS[id].goldLv || 3) ? 'gold' : 'white');
  RS.ballLookAt = (b, id, i) => (b.evolved[id] ? (i < RS.ballonCount(b) ? 'ballon' : 'gold') : RS.ballLook(b, id));
  RS.orbitLook = (b) => RS.ballLook(b, 'orbit');
  // Name of an evolved move for this build: a 발롱도르 in the name needs a real one. Before the first the move is
  // golden ('황금 …') and the 회전 공 cannot evolve yet; after it a leading 8 is the number won so far.
  RS.evoTitle = function (b, id, variant) {
    const s = RS.SKILLS[id], v = variant && s.evos && s.evos[variant], name = v ? v.name : s.evoName;
    if (name.indexOf('발롱') < 0) return name;
    const n = RS.ballonCount(b);
    if (n) return name.replace(/^8/, String(n));
    if (s.needBallon) return '발롱도르 (첫 수상 뒤)';
    return name.replace('발롱볼', '볼').replace(/\d*발롱도르/, '황금');
  };
  // The evolution card's text: the 회전 공 says what the 발롱도르 won so far make of it (World.updateOrbit).
  RS.evoDescFor = function (b, id, variant) {
    const s = RS.SKILLS[id], v = variant && s.evos && s.evos[variant];
    if (!s.needBallon) return v ? v.desc : s.evoDesc;
    const n = RS.ballonCount(b), fill = Math.max(0, RS.ORBIT_RING - n), size = variant === 'size';
    return (size ? '받은 발롱도르 ' + n + '개가 하나로 합쳐진 공 (크기 ×' + Math.max(2, n) + ').' : '받은 발롱도르 ' + n + '개가 돈다.') +
      (fill ? ' 황금 공 ' + fill + '개가 함께 돈다.' : '') + ' 발롱도르를 받을 때마다 ' + (size ? '더 커진다 (최대 ×8).' : '1개씩 늘어난다 (최대 8개).');
  };
  // 메시 plays in a small body until the growth-hormone treatment (for the whole career without it).
  RS.smallBody = (b) => !!b && b.hero === 'messi' && b.hgh !== true;
  RS.hardMode = (b) => !!b && b.hero === 'messi' && b.hgh === false; // refused the treatment: small for good
  // 민심 tier (RS.FANS) of a build; old builds without fans sit at the start value.
  RS.fanTier = (b) => { const f = b && b.fans != null ? b.fans : RS.FANS.start; return RS.FANS.tiers.find((t) => f >= t.min); };
  RS.clampFans = (v) => Math.max(0, Math.min(100, Math.round(v)));
  RS.cloneBuild = (b) => JSON.parse(JSON.stringify(b));
  // Fill missing fields (old saves).
  RS.normalizeBuild = function (b) {
    const d = RS.newBuild(b && b.hero);
    if (!b || typeof b !== 'object') return d;
    const hadWeapon = !!(b.weapon && typeof b.weapon === 'object' && RS.SKILLS[b.weapon.id]);
    for (const k of Object.keys(d)) if (b[k] === undefined) b[k] = d[k];
    b.skillOrder = b.skillOrder.filter((id) => RS.SKILLS[id] && b.skills[id]);
    b.passiveOrder = b.passiveOrder.filter((id) => RS.PASSIVES[id] && b.passives[id]);
    for (const id of Object.keys(b.relics)) if (!RS.RELICS[id]) delete b.relics[id];
    b.relicOrder = b.relicOrder.filter((id) => RS.RELICS[id] && b.relics[id]);
    b.teammates = b.teammates.filter((m) => m && RS.TEAMMATES[m.id]);
    b.bench = (b.bench || []).filter((m) => m && RS.TEAMMATES[m.id]);
    // old saves carried up to 5 on the pitch: the extras move to the bench
    while (b.teammates.length > RS.MAX_MATES) { const m = b.teammates.splice(RS.MAX_MATES, 1)[0]; if (b.bench.length < RS.MAX_BENCH) b.bench.push(m); }
    b.bench.length = Math.min(b.bench.length, RS.MAX_BENCH);
    if (!RS.HEROES || !RS.HEROES[b.hero]) b.hero = 'ronaldo';
    if (b.hero === 'messi') RS.toMessiMoves(b);
    // round 13: every passive level keeps its card's grade; a level saved before has none and counts as
    // RS.PASSIVE_OLD_G (희귀, the old card's full value)
    const pg = b.passiveGrades && typeof b.passiveGrades === 'object' ? b.passiveGrades : {};
    b.passiveGrades = {};
    for (const id of b.passiveOrder) {
      const gs = (Array.isArray(pg[id]) ? pg[id] : []).slice(0, b.passives[id]).map(RS.clampGrade);
      while (gs.length < b.passives[id]) gs.push(RS.PASSIVE_OLD_G);
      b.passiveGrades[id] = gs;
    }
    for (const k of ['stars', 'drills', 'flags']) if (!b[k] || typeof b[k] !== 'object') b[k] = {};
    // round 11: the weapon in hand and the 무기고 (old saves: from their moves, RS.weaponFromSkill), one copy per move
    const mine = (w) => w && typeof w === 'object' && RS.SKILLS[w.id] && RS.skillFor(w.id, b.hero);
    let arm = (Array.isArray(b.armory) ? b.armory : []).filter(mine);
    if (!hadWeapon || !mine(b.weapon)) {
      const old = b.skillOrder.filter((id) => RS.skillFor(id, b.hero)).map((id) => RS.weaponFromSkill(b, id));
      old.sort((x, y) => RS.weaponMul(y) - RS.weaponMul(x));
      b.weapon = old.shift() || { id: RS.HEROES[b.hero].startSkill, g: 0, p: 1 };
      arm = arm.concat(old);
    }
    // grades saved before round 13 keep their index (일반 · 고급 · 레어→희귀 · 에픽→영웅 · 황금→전설); 무지개 (5)
    // clamps to 전설, the top of the five-step ladder
    b.weapon = Object.assign({}, b.weapon, { g: RS.clampGrade(b.weapon.g), p: RS.plusOf(b.weapon.p) });
    b.armory = [];
    for (const w of arm) RS.gainWeapon(b, Object.assign({}, w), false);
    RS.syncWeapon(b);
    for (const id of Object.keys(b.drills)) if (!RS.DRILLS[id]) delete b.drills[id];
    b.fans = RS.clampFans(typeof b.fans === 'number' ? b.fans : RS.FANS.start);
    if (!b.rivalry || typeof b.rivalry !== 'object') b.rivalry = { w: 0, l: 0 }; // 엘 클라시코 record
    b.ballons = Array.isArray(b.ballons) ? b.ballons.filter((y) => typeof y === 'number') : [];
    if (b.relics.doping) b.relics.doping = Math.max(1, Math.min(RS.STIM.max, b.relics.doping | 0));
    return b;
  };
  // Old 메시 saves can carry 날두's moves, passives or items: each becomes 메시's counterpart
  // (RS.MESSI_COUNTERPART) with its level and evolution; when he already has that one, the next move of his own
  // he lacks takes its place.
  RS.toMessiMoves = function (b) {
    const C = RS.MESSI_COUNTERPART, ron = (id) => RS.SKILLS[id].hero !== 'messi';
    if (b.skillOrder.some(ron)) {
      const spare = Object.keys(RS.SKILLS).filter((id) => !ron(id) && !b.skills[id]);
      const skills = {}, evolved = {}, order = [];
      for (const id of b.skillOrder) {
        let to = id;
        if (ron(id)) {
          to = spare.includes(C.skills[id]) ? C.skills[id] : spare[0];
          if (!to) continue;
          spare.splice(spare.indexOf(to), 1);
        }
        skills[to] = b.skills[id]; order.push(to);
        const ev = b.evolved[id], evos = RS.SKILLS[to].evos;
        if (ev) evolved[to] = !evos ? true : evos[ev] ? ev : Object.keys(evos)[0];
      }
      b.skills = skills; b.skillOrder = order; b.evolved = evolved;
    }
    if (b.passiveOrder.some((id) => !RS.passiveFor(id, 'messi'))) {
      const passives = {}, order = [], grades = {}, G = b.passiveGrades || {};
      for (const id of b.passiveOrder) {
        const to = RS.passiveFor(id, 'messi') ? id : C.passives[id];
        if (!to || !RS.PASSIVES[to]) continue;
        if (!passives[to]) order.push(to);
        if (!passives[to] || b.passives[id] > passives[to]) { passives[to] = b.passives[id]; grades[to] = G[id] || []; }
      }
      b.passives = passives; b.passiveOrder = order; b.passiveGrades = grades;
    }
    for (const id of b.relicOrder.slice()) {
      if (RS.relicFor(id, 'messi')) continue;
      const to = C.relics[id], i = b.relicOrder.indexOf(id);
      delete b.relics[id];
      if (to && !b.relics[to]) { b.relics[to] = 1; b.relicOrder[i] = to; } else b.relicOrder.splice(i, 1);
    }
    return b;
  };
  RS.allMates = (b) => b.teammates.concat(b.bench);
  // Teammate rating: OVR, its grade (RS.MATE_TIERS) and the power multiplier it gives (damage and team buff).
  RS.mateOvr = (id) => (RS.TEAMMATES[id] && RS.TEAMMATES[id].ovr) || 75;
  RS.mateMul = (id, youth) => 1 + (RS.mateOvr(id) - RS.MATE_OVR_PIVOT[youth ? 'youth' : 'pro']) * RS.MATE_OVR_STEP;
  RS.mateTier = (id) => { const o = RS.mateOvr(id); return RS.MATE_TIERS.find((t) => o >= t.min); };
  RS.mateBadge = (id, lv) => 'OVR ' + RS.mateOvr(id) + ' ' + RS.mateTier(id).name + (lv ? ' +' + lv : '');
  RS.samePerson = (a, b) => (RS.TEAMMATES[a].same || a) === (RS.TEAMMATES[b].same || b);
  // Teammates sign already trained: 강화 +1 … +10 (RS.MATE_PLUS_W: +1 common, +10 rare).
  RS.rollMatePlus = (rng) => RS.rollPlus(rng, RS.MATE_PLUS_W);
  // A teammate's card colour on the RS.GRADES scale: his OVR tier (강화 never changes a grade).
  RS.mateGrade = (id) => RS.MATE_GRADE[RS.mateTier(id).key];
  // His strength in one number (OVR power × 강화), used to compare a transfer.
  RS.mateValue = (id, lv) => RS.mateMul(id) * (1 + RS.ROLE_PLUS * ((lv || 1) - 1));
  // Transfer verdict: OVR and 강화 of the newcomer against the man he replaces, and the position change.
  RS.swapVerdict = function (outId, newId, outLv, newLv) {
    const a = RS.mateValue(outId, outLv), n = RS.mateValue(newId, newLv), d = Math.round((n / a - 1) * 100);
    const ro = RS.TEAMMATES[outId].role, rn = RS.TEAMMATES[newId].role;
    const pos = ro !== rn ? ' · 포지션 ' + RS.ROLES[ro].name + '→' + RS.ROLES[rn].name : '';
    const who = 'OVR ' + RS.mateOvr(outId) + ' +' + (outLv || 1) + ' → OVR ' + RS.mateOvr(newId) + ' +' + (newLv || 1);
    if (!d) return '= ' + who + ' 같은 급' + pos;
    return (d > 0 ? '▲ ' : '▼ ') + who + ' (' + (d > 0 ? '+' : '') + d + '%)' + pos;
  };
  // Named partnership of the two on the pitch (null with fewer than two): a named pair (RS.NAMED_PAIRS, e.g. the
  // 티키타카 trio) beats the role pair.
  RS.pairSynergy = function (b) {
    if (b.teammates.length < 2) return null;
    const ids = b.teammates.map((m) => m.id).sort().join('+');
    if (RS.NAMED_PAIRS[ids]) return Object.assign({ key: ids, named: true }, RS.NAMED_PAIRS[ids]);
    const key = b.teammates.map((m) => RS.TEAMMATES[m.id].role).sort().join('+');
    const s = RS.PAIR_SYNERGY[key];
    return s ? Object.assign({ key }, s) : null;
  };
  RS.trioReady = (b) => { const s = RS.pairSynergy(b); return !!(s && s.named); };

  // One number the player can watch grow: the weapon (grade and 강화), passives, teammates and level.
  RS.powerScore = function (b, youth) {
    let s = b.level * 2 + RS.weaponMul(b.weapon) * 40;
    for (const id of b.passiveOrder) s += RS.passivePow(b, id) * 8;
    for (const m of b.teammates) s += (6 + m.lv * 5) * RS.mateMul(m.id, youth);
    for (const id of b.relicOrder || []) s += RS.GRADES[RS.RELICS[id].g].power * (RS.RELICS[id].stack ? RS.stackMul(b.relics[id]) : 1);
    for (const id in b.drills || {}) s += b.drills[id] * 2;
    return Math.round(s);
  };
  // Threat of a season on a 1–5 star scale (enemy HP × damage of the year on a log scale, so the wall and the
  // 고난의 시즌 show); the final duel is always ★5.
  RS.threatStars = function (idx) {
    if (RS.YEARS[idx].final) return 5;
    const t = RS.yearTuning(idx);
    return Math.max(1, Math.min(5, Math.ceil((Math.log10(t.hpMul * t.dmgMul) + 0.5) * 1.25)));
  };

  // Round 11: about 2.8 × the XP per level of round 10 (the debut season gave eight level-ups): a level-up is an
  // event again, about four in the debut season.
  RS.xpToNext = function (level) {
    return Math.floor(14 + level * 11 + Math.max(0, level - 12) * 11 + Math.max(0, level - 30) * 28 + Math.max(0, level - 50) * 60);
  };

  let COACH_CARDS = null;
  RS.coachCard = function (id) {
    if (!COACH_CARDS) {
      COACH_CARDS = {};
      for (const ck of Object.keys(RS.COACHES)) for (const c of RS.COACHES[ck].cards) COACH_CARDS[c.id] = c;
      // story-event lessons with a lasting effect are kept like coach cards (round 14: the fx of a card or of each
      // of its rolled outcomes too, under the card id + the outcome index — RS.applyEvent)
      for (const ev of Object.values(RS.EVENTS || {})) for (const c of RS.eventCards(ev)) {
        if (c.mods) COACH_CARDS[c.id] = c;
        if (c.fx && c.fx.mods) COACH_CARDS[c.id] = { id: c.id, name: ev.title, icon: c.icon, desc: c.desc, mods: c.fx.mods };
        (c.rolls || []).forEach((o, i) => { if (o.fx && o.fx.mods) COACH_CARDS[c.id + '_' + i] = { id: c.id + '_' + i, name: ev.title, icon: c.icon, desc: o.text, mods: o.fx.mods }; });
      }
      // press-conference outcomes too (RS.pressCardId), and the stand-in for a move taught on a full skill bar
      for (const pid of Object.keys(RS.PRESS || {})) for (const ch of RS.PRESS[pid].choices) {
        const outs = ch.rolls ? ch.rolls.map((o, i) => [o, i]) : [[ch.result, null]];
        for (const [o, i] of outs) {
          const fx = (o && o.fx) || {};
          if (fx.mods) { const cid = RS.pressCardId(pid, ch.id, i); COACH_CARDS[cid] = { id: cid, name: RS.PRESS[pid].title, icon: ch.icon, desc: o.note, mods: fx.mods }; }
          if (fx.skill) { const cid = RS.pressCardId(pid, ch.id, i) + '_full'; COACH_CARDS[cid] = { id: cid, name: RS.PRESS[pid].title, icon: ch.icon, desc: '공격력 +5%', mods: RS.PRESS_FULL_MODS }; }
        }
      }
    }
    return COACH_CARDS[id] || null;
  };
  // The lasting effect of a press answer is kept in coachCards under this id (roll: the outcome index, or null).
  RS.pressCardId = (pressId, choiceId, roll) => 'press_' + pressId + '_' + choiceId + (roll != null ? '_' + roll : '');

  // Derive runtime stats from build (passives + coach cards) and meta upgrades. youth: a youth season (RS.mateMul).
  RS.computeStats = function (build, metaUpgrades, youth) {
    const a = { dmg: 0, cd: 0, area: 0, projSpeed: 0, moveSpeed: 0, hp: 0, magnet: 0, crit: 0, dur: 0, regen: 0,
      armor: 0, xp: 0, gold: 0, teamDmg: 0, teamCd: 0, bossDmg: 0, revive: 0, reroll: 0, luck: 0, hitGuard: 0 };
    const add = (mods, times) => { for (const k in mods) if (k in a) a[k] += mods[k] * times; };
    for (const id in build.passives) if (RS.PASSIVES[id]) add(RS.PASSIVES[id].mods, RS.passivePow(build, id));
    for (const id in build.relics || {}) if (RS.RELICS[id] && RS.RELICS[id].mods) add(RS.RELICS[id].mods, RS.RELICS[id].stack ? RS.stackMul(build.relics[id]) : 1);
    for (const cid of build.coachCards) { const c = RS.coachCard(cid); if (c) add(c.mods, 1); }
    for (const id in build.drills || {}) if (RS.DRILLS[id]) add(RS.DRILLS[id].mods, build.drills[id]);
    if (metaUpgrades) for (const id in metaUpgrades) if (RS.META[id]) add(RS.META[id].mods, metaUpgrades[id]);
    // squad: role buffs (pitch full, bench weak) scaled by each player's OVR and 강화, and the partnership on the pitch
    const plus = (m) => 1 + RS.ROLE_PLUS * ((m.lv || 1) - 1);
    for (const m of build.teammates) add(RS.ROLE_BUFF[RS.TEAMMATES[m.id].role].mods, RS.mateMul(m.id, youth) * plus(m));
    for (const m of build.bench || []) add(RS.ROLE_BUFF[RS.TEAMMATES[m.id].role].mods, RS.BENCH_FACTOR * RS.mateMul(m.id, youth) * plus(m));
    const pair = RS.pairSynergy(build);
    if (pair) add(pair.mods, 1);
    add(RS.fanTier(build).mods, 1); // 민심
    if (RS.smallBody(build)) add(RS.SMALL_BODY, 1);
    const hero = (RS.HEROES && RS.HEROES[build.hero]) || { moveMul: 1 };
    // 첼씨 토레쓰 (round 14): his own grade scales his damage and HP (RS.CHELSEA; B fights at 82 %, SSS at 125 %)
    const hg = RS.heroGrade ? RS.heroGrade(build) : null, hgMul = hg == null ? 1 : RS.CHELSEA.mul[hg], hgHp = hg == null ? 0 : RS.CHELSEA.hp[hg];
    return {
      dmg: (1 + a.dmg) * hgMul, cd: Math.max(0.45, 1 + a.cd), area: 1 + a.area, projSpeed: 1 + a.projSpeed,
      move: RS.BASE_MOVE * hero.moveMul * (1 + a.moveSpeed), maxHp: Math.round(100 + a.hp + hgHp + (build.bonusHp || 0)), magnet: 38 * (1 + a.magnet),
      crit: Math.min(0.9, 0.05 + a.crit), dur: 1 + a.dur, regen: a.regen, armor: a.armor, xp: 1 + a.xp,
      gold: 1 + a.gold, teamDmg: 1 + a.teamDmg, teamCd: Math.max(0.5, 1 + a.teamCd), bossDmg: 1 + a.bossDmg,
      revive: a.revive, reroll: a.reroll + (build.bonusReroll || 0), armor: Math.round(a.armor), luck: a.luck,
      hitGuard: Math.min(RS.HIT_GUARD_MAX, a.hitGuard)
    };
  };

  // stars: 각성 of an evolved move (RS.STAR_STEP per star); the starred stat sets are cached (read every step).
  const STARRED = {};
  // A fused move (합체) hits for RS.FUSE_SCALE of its table: the gain of fusing is the freed slot and the new behaviour,
  // not twice the parents' output (the strong bot cleared 하드 outright with unscaled tables).
  const fuseScale = (id, base) => {
    if (!RS.SKILLS[id].fused) return base;
    const key = 'F|' + id + '|' + JSON.stringify(base);
    return STARRED[key] || (STARRED[key] = Object.assign({}, base, { dmg: base.dmg * RS.FUSE_SCALE },
      base.boomDmg ? { boomDmg: base.boomDmg * RS.FUSE_SCALE } : {}, base.zdmg ? { zdmg: base.zdmg * RS.FUSE_SCALE } : {}));
  };
  RS.skillStats = function (id, lv, evolved, stars) {
    const s = RS.SKILLS[id];
    if (!evolved) return fuseScale(id, s.lv[Math.max(0, Math.min(s.lv.length, lv) - 1)]);
    const base = fuseScale(id, (s.evos && s.evos[evolved] && s.evos[evolved].stats) || s.evo);
    if (!stars) return base;
    const key = id + '|' + evolved + '|' + stars;
    return STARRED[key] || (STARRED[key] = Object.assign({}, base,
      { dmg: base.dmg * (1 + RS.STAR_STEP.dmg * stars), cd: base.cd * (1 + RS.STAR_STEP.cd * stars) }));
  };

  // Pure damage formula (tested). Returns {dmg, crit}.
  RS.calcDamage = function (base, stats, opt, roll) {
    opt = opt || {};
    let d = base * stats.dmg;
    if (opt.team) d *= stats.teamDmg;
    if (opt.boss) d *= stats.bossDmg;
    const crit = roll < stats.crit + (opt.critBonus || 0);
    if (crit) d *= 2;
    return { dmg: Math.max(1, Math.round(d)), crit };
  };

  // 합체 depth of a move (a fused move of fused moves counts twice): the final rival answers it (World.recalc).
  RS.fuseDepth = (id) => { const f = RS.SKILLS[id] && RS.SKILLS[id].fusion; return f ? 1 + Math.max(...f.map(RS.fuseDepth)) : 0; };

  // ================================================================ Teammates
  // Who can sign in season yearIdx: the hero's own teammates at that club in that very season (RS.TEAMMATES yrs),
  // nobody who is the same person as a man in the squad, never a reward-only player (special).
  RS.mateCandidates = function (build, yearIdx) {
    if (build.flags && build.flags.solo) return []; // 독박축구 (RS.EVENTS.pep): nobody signs
    const owned = RS.allMates(build).map((m) => m.id);
    return Object.keys(RS.TEAMMATES).filter((id) => !RS.TEAMMATES[id].special && RS.mateInSeason(id, yearIdx) && !owned.some((o) => RS.samePerson(o, id)));
  };
  // Did he play beside the hero in season yearIdx (that club, that year)? A reward-only player (special) always does.
  RS.mateInSeason = function (id, yearIdx) {
    const t = RS.TEAMMATES[id], y = RS.YEARS[yearIdx];
    return !!t && !!y && (!!t.special || (t.era === y.era && (!t.yrs || (y.year >= t.yrs[0] && y.year <= t.yrs[1]))));
  };
  // A new season (RS.finishYear, an old save, a hero switch): whoever did not play beside the hero that season
  // leaves the squad (round 11: 리버풀 still fielded the whole 줄무늬단 squad), and the best free man of that club and
  // season takes his place at the same 강화 — the squad's training is kept, only the faces change. With nobody left
  // to sign the place stays empty and the bench fills the pitch. Returns { gone: [ids], joined: [{ id, lv }] }.
  RS.releaseOffSeason = function (build, yearIdx) {
    const out = { gone: [], joined: [] };
    build.bench = build.bench || [];
    for (const list of [build.teammates, build.bench]) {
      for (let i = 0; i < list.length; i++) {
        if (RS.mateInSeason(list[i].id, yearIdx)) continue;
        out.gone.push(list[i].id);
        const next = RS.mateCandidates(build, yearIdx).sort((a, b) => RS.TEAMMATES[b].ovr - RS.TEAMMATES[a].ovr)[0];
        if (next) { list[i] = { id: next, lv: list[i].lv }; out.joined.push(list[i]); RS.mateJoined(build, next); } else list.splice(i--, 1);
      }
    }
    while (build.teammates.length < RS.MAX_MATES && build.bench.length) build.teammates.push(build.bench.shift());
    return out;
  };
  RS.squadFull = (build) => build.teammates.length >= RS.MAX_MATES && (build.bench || []).length >= RS.MAX_BENCH;
  // A new teammate (강화 lv, default +1) goes on the pitch if there is room, else on the bench.
  // Returns 'pitch' | 'bench' | false.
  RS.addMate = function (build, id, lv) {
    if (!RS.TEAMMATES[id] || (build.flags && build.flags.solo) || RS.allMates(build).some((m) => RS.samePerson(m.id, id))) return false;
    const m = { id, lv: Math.max(1, Math.min(RS.MATE_MAX_LV, lv | 0 || 1)) };
    if (build.teammates.length < RS.MAX_MATES) { build.teammates.push(m); RS.mateJoined(build, id); return 'pitch'; }
    if (build.bench.length < RS.MAX_BENCH) { build.bench.push(m); RS.mateJoined(build, id); return 'bench'; }
    return false;
  };
  // A teammate joined (any way in): the story marks he leaves. 제라두 (round 14) unlocks 제토라인 for the career
  // (RS.SKILLS.zeto need 'zeto'); the UI tells the player once (RS.unlockNote).
  RS.MATE_UNLOCKS = { gerrardo: { flag: 'zeto', note: '🔗 제토라인 해금! 제라두와 호흡을 맞췄다 · 이제 레벨업·무기 상자에서 제토라인이 나온다' } };
  RS.mateJoined = function (build, id) {
    const u = RS.MATE_UNLOCKS[id];
    if (!u || !build.flags) return null;
    if (build.flags[u.flag]) return null;
    build.flags[u.flag] = true;
    build.flags[u.flag + 'New'] = true; // shown once by the UI
    return u.note;
  };
  // The one-time notice of an unlock still to show (cleared when read).
  RS.unlockNote = function (build) {
    for (const id of Object.keys(RS.MATE_UNLOCKS)) {
      const u = RS.MATE_UNLOCKS[id];
      if (build.flags && build.flags[u.flag + 'New']) { delete build.flags[u.flag + 'New']; return u.note; }
    }
    return null;
  };
  // 뻽's 티키타카 (RS.EVENTS.pep): 챠비 and 니에미스타 take the two pitch places (keeping their level when already in
  // the squad, else Lv.1). Whoever stood there steps down to the bench; when it overflows, the lowest-level bench
  // players leave.
  RS.TRIO = ['xavino', 'iniestar'];
  RS.formTrio = function (build) {
    const take = (id) => {
      for (const list of [build.teammates, build.bench]) { const i = list.findIndex((m) => RS.samePerson(m.id, id)); if (i >= 0) return list.splice(i, 1)[0]; }
      return { id, lv: 1 };
    };
    const trio = RS.TRIO.map(take);
    for (const m of build.teammates.splice(0)) build.bench.push(m);
    while (build.bench.length > RS.MAX_BENCH) {
      let lo = 0;
      for (let i = 1; i < build.bench.length; i++) if (build.bench[i].lv < build.bench[lo].lv) lo = i;
      build.bench.splice(lo, 1);
    }
    build.teammates.push(...trio);
    return build;
  };
  RS.levelMate = function (build, id, n) {
    const m = RS.allMates(build).find((x) => x.id === id);
    if (!m || m.lv >= RS.MATE_MAX_LV) return false;
    m.lv = Math.min(RS.MATE_MAX_LV, m.lv + (n || 1));
    return true;
  };
  // Pitch ↔ bench. Bench → pitch needs a free pitch slot (or swaps with `withId` on the pitch).
  RS.toggleBench = function (build, id, withId) {
    const pi = build.teammates.findIndex((m) => m.id === id);
    if (pi >= 0) {
      if (build.bench.length >= RS.MAX_BENCH) return false;
      build.bench.push(build.teammates.splice(pi, 1)[0]);
      return true;
    }
    const bi = build.bench.findIndex((m) => m.id === id);
    if (bi < 0) return false;
    if (withId) {
      const wi = build.teammates.findIndex((m) => m.id === withId);
      if (wi < 0) return false;
      const out = build.teammates[wi];
      build.teammates[wi] = build.bench.splice(bi, 1)[0];
      build.bench.push(out);
      return true;
    }
    if (build.teammates.length >= RS.MAX_MATES) return false;
    build.teammates.push(build.bench.splice(bi, 1)[0]);
    return true;
  };

  // ================================================================ Level-up choices
  // Passives are plain stat boosts (round 11: no evolution pairs any more): MAX_PASSIVES slots, Lv.PASSIVE_MAX each.
  // Round 13: every card (a new passive or a level) has a grade and adds the passive's mods × RS.GRADES[g].pmul.
  RS.passiveMax = (id) => (RS.PASSIVES[id] && RS.PASSIVES[id].max) || RS.PASSIVE_MAX; // 오뚝이 정신 stops at Lv.3
  RS.canTakePassive = (build, pid) => !build.passives[pid] && !!RS.PASSIVES[pid] && build.passiveOrder.length < RS.MAX_PASSIVES;
  // The sum of pmul over a passive's levels (a level without a grade counts as RS.PASSIVE_OLD_G).
  RS.passivePow = function (b, id) {
    const gs = (b.passiveGrades && b.passiveGrades[id]) || [];
    let s = 0;
    for (let i = 0; i < (b.passives[id] || 0); i++) s += RS.gradeOf(gs[i] != null ? gs[i] : RS.PASSIVE_OLD_G).pmul;
    return s;
  };
  RS.cardGrade = (c) => RS.clampGrade(c.g != null ? c.g : RS.PASSIVE_OLD_G); // a passive card dealt without a grade
  RS.scaleMods = (mods, k) => { const o = {}; for (const key in mods) o[key] = mods[key] * k; return o; };
  // "공격력 +6% · 이동속도 +4.8%": a mods table as card text (RS.MOD_TEXT).
  RS.modsText = function (mods) {
    const out = [];
    for (const key in mods) {
      const t = RS.MOD_TEXT[key], v = mods[key] * (t[2] || 1) * (t[1] === '%' ? 100 : 1);
      out.push(t[0] + ' ' + (v < 0 ? '-' : '+') + Math.round(Math.abs(v) * 100) / 100 + t[1]);
    }
    return out.join(' · ');
  };
  // A teammate's one job with its icon, and what he lends the team (cards and the squad panel).
  RS.mateLine = function (id) {
    const m = RS.TEAMMATES[id], r = RS.ROLES[m.role];
    const desc = (RS.HERO === 'messi' && r.descMessi) || r.desc;
    return r.icon + ' ' + r.name + ' — ' + desc.replace(/\{hero\}/g, RS.HEROES[RS.HERO].short) + ' · 팀 효과: ' + RS.ROLE_BUFF[m.role].text;
  };
  // What signing this player would do to the partnership (shown on recruit cards).
  RS.synergyHint = function (build, id) {
    const role = RS.TEAMMATES[id].role;
    if (build.teammates.length >= RS.MAX_MATES) return '벤치: 팀 효과의 1/3만 적용';
    if (build.teammates.length === 1) {
      const key = [RS.TEAMMATES[build.teammates[0].id].role, role].sort().join('+');
      const s = RS.PAIR_SYNERGY[key];
      return s ? '파트너십 "' + s.name + '": ' + s.desc : '';
    }
    return '';
  };

  function describe(c, build) {
    switch (c.kind) {
      case 'weapon': { const w = c.wpn, cur = build.weapon, a = RS.weaponPower(cur), n = RS.weaponPower(w);
        // swap / cmp / from*: the two banners on top of the card (main.js renderCards): does the weapon in hand
        // change, and is the grade above or below the one held
        return Object.assign(c, { name: RS.weaponName(build, w), icon: RS.weaponIcon(w), desc: RS.weaponDesc(build, w), tag: RS.gradeTag(w), g: w.g,
          swap: w.id !== cur.id, cmp: Math.sign(w.g - cur.g), fromIcon: RS.weaponIcon(cur), fromName: RS.weaponName(build, cur), fromGrade: RS.gradeOf(cur.g).name, toGrade: RS.gradeOf(w.g).name,
          hint: (c.cup ? '🏆 승부차기 우승으로 해금 · 아주 드물게 나온다 · ' : '') + (n > a ? '▲ ' : n < a ? '▼ ' : '= ') + '무기 공격력 ' + a + ' → ' + n + (w.id === cur.id ? '' : ' · 지금 무기는 무기고로') }); }
      case 'enhance': { const w = build.weapon, nw = Object.assign({}, w, { p: w.p + 1 });
        return Object.assign(c, { name: RS.weaponName(build, w) + ' 강화', icon: '🔨', desc: RS.gradeTag(w) + ' → +' + nw.p + ' · 무기 공격력 ' + RS.weaponPower(w) + ' → ' + RS.weaponPower(nw),
          tag: '강화 +' + nw.p, g: w.g, hint: '강화는 +' + RS.PLUS_MAX + '까지 · 등급이 한 단계 오르는 것이 +10보다 세다' }); }
      case 'passive': { const p = RS.PASSIVES[c.id], G = RS.gradeOf(c.g);
        return Object.assign(c, { name: p.name, icon: p.icon, desc: RS.modsText(RS.scaleMods(p.mods, G.pmul)), tag: G.name + ' · 새 패시브',
          hint: '패시브 칸 ' + (build.passiveOrder.length + 1) + '/' + RS.MAX_PASSIVES + ' · 레벨 카드마다 등급만큼 더해진다' }); }
      case 'passiveUp': { const p = RS.PASSIVES[c.id], G = RS.gradeOf(c.g), nl = build.passives[c.id] + 1;
        return Object.assign(c, { name: p.name, icon: p.icon, desc: RS.modsText(RS.scaleMods(p.mods, G.pmul)), tag: G.name + ' · Lv.' + nl + (nl === RS.passiveMax(c.id) ? ' MAX' : ''),
          hint: '지금까지 ' + RS.modsText(RS.scaleMods(p.mods, RS.passivePow(build, c.id))) }); }
      case 'mate': { const m = RS.TEAMMATES[c.id]; const toBench = build.teammates.length >= RS.MAX_MATES; const syn = RS.synergyHint(build, c.id);
        return Object.assign(c, { name: m.name, icon: RS.ROLES[m.role].icon, desc: RS.mateLine(c.id), tag: RS.mateBadge(c.id, c.lv), g: RS.mateGrade(c.id),
          hint: (toBench ? '벤치 합류' : '선발 합류') + (syn ? ' · ' + syn : '') }); }
      case 'mateUp': { const m = RS.TEAMMATES[c.id]; const cur = RS.allMates(build).find((x) => x.id === c.id).lv;
        return Object.assign(c, { name: m.name + ' 강화', icon: '📈', desc: RS.mateLine(c.id), tag: '+' + cur + ' → +' + (cur + 1), g: RS.mateGrade(c.id), hint: '동료 강화 · 피해와 팀 효과가 커진다' }); }
      case 'drill': { const d = RS.DRILLS[c.id]; const n = ((build.drills && build.drills[c.id]) || 0) + 1;
        return Object.assign(c, { name: d.name + (n > 1 ? ' ' + n + '회차' : ''), icon: d.icon, desc: d.desc + ' (영구)', tag: '개인 훈련', hint: '횟수 제한 없음 · 커리어 내내 유지' }); }
      case 'gold': return Object.assign(c, { name: '스폰서 보너스', icon: '💰', desc: '코인 +30', tag: '보너스' });
      case 'heal': return Object.assign(c, { name: '에그타르트', icon: '🥧', desc: '체력 40% 회복', tag: '보너스' });
      case 'relic': { const r = RS.RELICS[c.id];
        return Object.assign(c, { name: r.name, icon: r.icon, desc: r.desc, tag: RS.GRADES[r.g].name + ' 아이템', g: r.g, hint: r.stack ? '스팀팩 1/' + RS.STIM.max + ' · 커리어 내내 유지' : '특수 아이템 · 커리어 내내 유지' }); }
      case 'stim': { const r = RS.RELICS.doping, n = RS.stimDoses(build) + 1;
        return Object.assign(c, { name: r.name + ' ' + n + '회차', icon: r.icon, g: r.g, tag: '스팀팩 ' + n + '/' + RS.STIM.max,
          desc: n === 1 ? r.desc : '한 방 더! 첫 투여 효과의 ' + Math.round(RS.STIM.step * 100) + '%가 더해진다 (지금까지 ' + (n - 1) + '번 투여)',
          hint: n === RS.STIM.max ? '마지막 투여 · 풀강' : '최대 ' + RS.STIM.max + '번까지 · 커리어 내내 유지' }); }
      case 'gamble': { const g = RS.GAMBLES[c.id];
        return Object.assign(c, { name: g.name, icon: g.icon, desc: g.desc, tag: '도박', hint: '결과는 고르는 순간 정해진다' }); }
    }
    return c;
  }

  // A hand of n cards. The weapon gets one card for a new weapon (another move to swap to, or a better copy) and
  // one for a 강화 step of the one held; new passives share one weight between them, so they never crowd it out.
  // Weapon and passive cards take their grade from the season's odds (RS.gradeOddsAt, raised by luck).
  RS.seasonIdx = (yearIdx) => RS.tuneIdx(Math.min(yearIdx || 0, RS.YEARS.length - 1));
  // unlocked: meta.unlocked, for a cup move that may take one card (RS.cupOffer).
  RS.makeChoices = function (build, rng, yearIdx, n, luck, unlocked) {
    n = n || 3;
    const pool = [], out = [];
    const hero = build.hero || 'ronaldo';
    const idx = RS.seasonIdx(yearIdx), odds = RS.luckOdds(RS.gradeOddsAt(idx), luck);
    const wpn = RS.offerWeapon(build, rng, luck, idx);
    if (wpn) pool.push({ kind: 'weapon', id: wpn.id, wpn, w: 2.4 });
    if (build.weapon.p < RS.PLUS_MAX) pool.push({ kind: 'enhance', id: build.weapon.id, w: 2.6 });
    for (const id of build.passiveOrder) if (build.passives[id] < RS.passiveMax(id)) pool.push({ kind: 'passiveUp', id, w: 1.2 });
    const fresh = Object.keys(RS.PASSIVES).filter((id) => RS.canTakePassive(build, id) && RS.passiveFor(id, hero));
    for (const id of fresh) pool.push({ kind: 'passive', id, w: 3 / fresh.length });
    if (!RS.squadFull(build)) {
      const cands = RS.mateCandidates(build, yearIdx || 0);
      for (const id of cands) pool.push({ kind: 'mate', id, w: 1.6 / Math.max(1, cands.length / 2) });
    }
    for (const m of RS.allMates(build)) if (m.lv < RS.MATE_MAX_LV) pool.push({ kind: 'mateUp', id: m.id, w: 1 });
    while (out.length < n && pool.length) {
      const c = RS.pickWeighted(rng, pool);
      pool.splice(pool.indexOf(c), 1);
      out.push(c.kind === 'weapon' ? { kind: 'weapon', id: c.id, wpn: c.wpn } : c.kind === 'mate' ? { kind: 'mate', id: c.id, lv: RS.rollMatePlus(rng) }
        : c.kind === 'passive' || c.kind === 'passiveUp' ? { kind: c.kind, id: c.id, g: RS.rollGrade(rng, odds) } : { kind: c.kind, id: c.id });
    }
    // The offer ran short (a maxed build): 개인 훈련 cards (no cap) keep the hand a real choice; a heal stays last.
    if (out.length < n) {
      const drills = Object.keys(RS.DRILLS);
      while (out.length < n - 1 && drills.length) out.push({ kind: 'drill', id: drills.splice(Math.floor(rng() * drills.length), 1)[0] });
      out.push({ kind: 'heal', id: 'heal' });
    }
    const cup = RS.cupOffer(build, rng, unlocked, hero); // it takes the weapon card's place, or any card's
    if (cup) { const i = out.findIndex((c) => c.kind === 'weapon'); out[i >= 0 ? i : Math.floor(rng() * out.length)] = cup; }
    return out.map((c) => describe(c, build));
  };

  // ---------------------------------------------------------------- 특수 카드 (graded items, gambles)
  RS.relicPool = (build, g) => Object.keys(RS.RELICS).filter((id) => RS.RELICS[id].g === g && !build.relics[id] && RS.relicOk(id, build));
  RS.relicsLeft = (build) => Object.keys(RS.RELICS).some((id) => !build.relics[id] && RS.relicOk(id, build));
  // The next 약물 꽂기 dose can be offered: 메시 after the treatment, below the dose cap.
  RS.stimReady = (build) => RS.relicOk('doping', build) && RS.stimDoses(build) < RS.STIM.max;
  // The item odds of pro season idx (RS.ITEM_STAGES: { chance, odds }).
  RS.itemStageAt = function (idx) {
    let s = RS.ITEM_STAGES[0];
    for (const x of RS.ITEM_STAGES) if ((idx || 0) >= x.from) s = x;
    return s;
  };
  // One item the build lacks, of grade g or — all of that grade owned — the nearest lower grade that has one (never
  // a higher one: no luck gives more than it rolled). Returns a described card or null.
  RS.relicOfGrade = function (build, rng, g) {
    for (let k = g; k >= 0; k--) {
      const pool = RS.relicPool(build, k);
      if (pool.length) return describe({ kind: 'relic', id: pool[Math.floor(rng() * pool.length)] }, build);
    }
    return null;
  };
  // A gamble card among those that make sense now (올인 needs coins from this match).
  RS.gambleCard = function (build, rng, coins) {
    const ids = Object.keys(RS.GAMBLES).filter((id) => !RS.GAMBLES[id].needCoins || (coins || 0) >= RS.GAMBLES[id].needCoins);
    return describe({ kind: 'gamble', id: ids[Math.floor(rng() * ids.length)] }, build);
  };
  // The 4th card of a level-up at pro season idx: a 약물 꽂기 dose (RS.STIM: its own chance once 메시 took the
  // treatment), an item (the season's chance × (1 + luck), its grade from the season's odds), a gamble card, or null.
  RS.rollSpecial = function (build, rng, luck, coins, idx) {
    const L = (1 + (luck || 0)) * ((RS.DIFFS[RS.DIFF] || RS.DIFFS.normal).special || 1);
    if (RS.stimReady(build) && rng() < (RS.stimDoses(build) ? RS.STIM.odds : RS.STIM.first) * L) return describe({ kind: 'stim', id: 'doping' }, build);
    const st = RS.itemStageAt(idx), r = rng();
    if (r < st.chance * L) return RS.relicOfGrade(build, rng, RS.rollGrade(rng, st.odds));
    return r < st.chance * L + RS.GAMBLE_ODDS ? RS.gambleCard(build, rng, coins) : null;
  };
  // Level-up hand (round 11): three cards; a graded item, 약물 or gamble card, when one is rolled, comes as a 4th.
  RS.LEVEL_CARDS = 3;
  RS.levelChoices = function (build, rng, yearIdx, luck, coins, unlocked) {
    const out = RS.makeChoices(build, rng, yearIdx, RS.LEVEL_CARDS, luck, unlocked);
    const sp = RS.rollSpecial(build, rng, luck, coins, RS.seasonIdx(yearIdx));
    if (sp) out.push(sp);
    return out;
  };

  // Applies a choice to the build. Returns false if it could not apply.
  RS.applyChoice = function (build, c) {
    switch (c.kind) {
      case 'weapon': return !!c.wpn && RS.gainWeapon(build, c.wpn, true);
      case 'enhance': return RS.enhanceWeapon(build, 1);
      case 'passive':
        if (!RS.canTakePassive(build, c.id)) return false;
        build.passives[c.id] = 1; build.passiveOrder.push(c.id); build.passiveGrades[c.id] = [RS.cardGrade(c)]; return true;
      case 'passiveUp':
        if (!build.passives[c.id] || build.passives[c.id] >= RS.passiveMax(c.id)) return false;
        build.passives[c.id]++; (build.passiveGrades[c.id] = build.passiveGrades[c.id] || []).push(RS.cardGrade(c)); return true;
      case 'mate': return !!RS.addMate(build, c.id, c.lv);
      case 'mateUp': return RS.levelMate(build, c.id, 1);
      case 'drill':
        if (!RS.DRILLS[c.id]) return false;
        build.drills[c.id] = (build.drills[c.id] || 0) + 1; return true;
      case 'gold': case 'heal': return true;
      case 'relic':
        if (!RS.RELICS[c.id] || build.relics[c.id]) return false;
        build.relics[c.id] = 1; build.relicOrder.push(c.id); return true;
      case 'stim': { // one more 약물 꽂기 dose (the first one also adds the item)
        const n = RS.stimDoses(build);
        if (n >= RS.STIM.max) return false;
        if (!n) build.relicOrder.push('doping');
        build.relics.doping = n + 1; return true;
      }
      case 'gamble': return !!RS.GAMBLES[c.id]; // the World rolls the outcome
    }
    return false;
  };

  // Transfer swap: newId takes outId's place (pitch or bench) with his own 강화 lv (none given: outId's level).
  RS.swapMate = function (build, outId, newId, lv) {
    if (!RS.TEAMMATES[newId] || RS.allMates(build).some((m) => m.id !== outId && RS.samePerson(m.id, newId)) || outId === newId) return false;
    for (const list of [build.teammates, build.bench]) {
      const i = list.findIndex((m) => m.id === outId);
      if (i >= 0) { list[i] = { id: newId, lv: lv ? Math.max(1, Math.min(RS.MATE_MAX_LV, lv | 0)) : list[i].lv }; RS.mateJoined(build, newId); return true; }
    }
    return false;
  };

  // ================================================================ World
  // Moves with a radius that still strike far away (lobs, slams, drops, burning turf): the bot keeps its distance.
  const BOT_REMOTE = { chip: 1, hand: 1, dropball: 1, meteor: 1, trail: 1 };
  const STEP_REACH = 46; // 스텝오버 / 솔로 dash at a man this close (px beyond both bodies)
  const STEP_BURST = 26; // radius of the burst a 스텝오버 / 솔로 dash leaves behind (px, × area)
  // 토레쓰 runs on after 드록빠 (RS.TORRES) — in any season with that boss, but never in his own career.
  RS.torresDue = (w) => w.yearDef.boss.type === 'drogba' && !w.yearDef.final && w.hero !== 'torres';
  // 신의 손: the hand lands HAND_T s after it appears; repeated slams come HAND_GAP s apart.
  const HAND_T = 0.42, HAND_GAP = 0.4;
  // 드롭볼: rise (s), fall (s) and the height it falls from (world px, drawn above the landing spot).
  const DROP_RISE = 0.35, DROP_FALL = 0.42, DROP_H = 150;
  RS.DROP_H = DROP_H; RS.HAND_T = HAND_T;

  class World {
    constructor(opt) {
      opt = opt || {};
      this.yearIdx = opt.yearIdx || 0;
      this.yearDef = RS.YEARS[this.yearIdx];
      this.youth = !!this.yearDef.youth; // kids' league: teammates are rated against kids (RS.mateMul)
      this.tune = RS.yearTuning(this.yearIdx);
      this.lvl = RS.tuneIdx(this.yearIdx); // difficulty index: youth seasons play like the debut year
      this.era = RS.ERAS[this.yearDef.era];
      this.seed = opt.seed != null ? opt.seed : (Date.now() & 0x7fffffff);
      this.rng = RS.makeRng(this.seed);
      this.build = RS.normalizeBuild(RS.cloneBuild(opt.build || RS.newBuild()));
      this.metaUp = (opt.meta && opt.meta.upgrades) || {};
      this.unlocked = (opt.meta && opt.meta.unlocked) || {}; // cup moves that may turn up on a level-up (RS.cupOffer)
      this.siuuuShown = false; // the SIUUU weapon's big moment has played this match (World.siuuuMoment)
      this.view = opt.view || { w: 260, h: 460 };
      this.events = [];
      this.t = 0;
      this.frame = 0;
      this.stageTime = this.tune.duration;
      this.phase = 'play'; // play | levelup | chest | clear | dead | victory
      this.saves = 0; this.dmgTaken = 0; this.bossDmgTaken = 0; this.hits = 0; this.minHp = Infinity;
      this.dpsHist = []; this._lastSec = 0; this._lastDmg = 0; this.bossT = 0; this.swapChoices = null;
      this.player = { x: 0, y: 0, vx: 0, vy: 0, r: 7, hp: 100, iframe: 0, dirx: 1, diry: 0, face: 1, moving: false,
        dash: null, jump: 0, animT: 0, revived: false, hurtT: 0, kickT: 0, dustT: 0, slideCd: 0 };
      this.hero = opt.hero || (opt.build && opt.build.hero) || 'ronaldo';
      this.small = RS.smallBody(this.build); // drawn with the short kid body
      // per world, not per page: the separation pass reads uid parity, so a seed replays the same match
      this.enemies = []; this.enemyPool = []; this.nextUid = 1;
      this.projs = []; this.projPool = [];
      this.eprojs = [];
      this.pickups = [];
      this.rings = [];
      this.fx = [];
      this.texts = []; for (let i = 0; i < 48; i++) this.texts.push({ t: 9, x: 0, y: 0, v: 0, crit: false });
      this.textIdx = 0;
      this.timers = [];
      this.mates = [];
      this.grid = new RS.Grid(32, 1024, 1024);
      this._q = []; this._q2 = [];
      this.kills = 0; this.coinsPicked = 0; this.dmgDealt = 0;
      this.boss = null; this.bossSpawned = false;
      this.rival = null; this.rivalResult = null; // 엘 클라시코: 'win' | 'loss' once decided
      // 토레쓰 (RS.TORRES): cleared = the season boss (드록빠) is down, the special boss may still be on
      this.cleared = false; this.torres = null; this.torresResult = null;
      this.pfxQ = []; // pixelfx effects queued for the renderer (World.pfx)
      this.levelQueue = 0; this.choices = null; this.chestResult = null;
      this.spawnAcc = 0;
      this.rescue = null; this.recruitedThisRun = [];
      this.wstate = {};
      this.zones = []; this.relicT = {}; this._boomBudget = 0;
      this.diceUsed = false; this.lastGamble = null;
      this.debug = { godMode: false };
      this.recalc();
      this.player.hp = this.stats.maxHp;
      this.rerolls = this.stats.reroll;
      for (const m of this.build.teammates) this.spawnMateRuntime(m);
      this.dribs = []; this.drops = []; // 메시's 드리볼 / 드롭볼 balls (read by the renderer)
      this.schedule = this.makeSchedule();
    }

    // ------------------------------------------------------------ helpers
    recalc() {
      const prevMax = this.stats ? this.stats.maxHp : null;
      this.stats = RS.computeStats(this.build, this.metaUp, this.youth);
      this.wmul = RS.weaponMul(this.build.weapon); // the weapon's grade and 강화 (World.weaponStats)
      this.botR = this.weaponReach(); this.botBoss = this.bossReach();
      if (prevMax != null && this.stats.maxHp > prevMax) this.player.hp += this.stats.maxHp - prevMax;
      this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
      // The final stays a duel. 메시/날두 hit harder by exactly the toughness the graded items added (max HP + a
      // minute of regen: the final crowd plus the duel), and their side keeps the hero's pace: bullets, dashes and
      // walking speed up by how much faster than the duel's tuned pace (RS.FINAL_PACE × the hero's base speed) the
      // hero runs, so a fast build cannot simply outrun the patterns. Telegraph and cooldown times stay, so the
      // reaction windows are unchanged. Season bosses do not scale: there the items are meant to feel overpowered.
      this.finalScale = 1; this.finalPace = 1;
      if (this.yearDef.final) {
        const hero = RS.HEROES[this.build.hero] || { moveMul: 1 };
        this.finalPace = Math.max(1, this.stats.move / (RS.BASE_MOVE * hero.moveMul * RS.FINAL_PACE));
      }
      if (this.yearDef.final && this.build.relicOrder.length) {
        const s0 = RS.computeStats(Object.assign({}, this.build, { relics: {}, relicOrder: [] }), this.metaUp);
        this.finalScale = Math.max(1, (this.stats.maxHp + 60 * this.stats.regen) / (s0.maxHp + 60 * s0.regen));
      }
      // 합체 moves make the hero far stronger than the duel was tuned for: the rival answers in kind (RS.FINAL_FUSE
      // per fusion depth: a tier-2 fusion counts twice)
      if (this.yearDef.final) for (const id of this.build.skillOrder) this.finalScale *= 1 + RS.FINAL_FUSE * RS.fuseDepth(id);
    }
    emit(type, data) { this.events.push(Object.assign({ type }, data || {})); }
    later(t, fn) { this.timers.push({ t, fn }); }
    // Queue a pixelfx effect (Renderer.drawPfx) at a world point, or on an entity (follow). Headless runs just
    // collect them; the queue is capped so a quiet renderer never grows it.
    pfx(fx, x, y, o) {
      if (this.pfxQ.length >= RS.PFX_MAX) this.pfxQ.shift();
      this.pfxQ.push(Object.assign({ fx, x, y, seed: Math.floor(this.rng() * 1e6) }, o || {}));
    }
    addFx(kind, x, y, o) {
      if (this.fx.length > 140) this.fx.shift();
      const f = Object.assign({ kind, x, y, t: 0, dur: 0.3 }, o || {});
      this.fx.push(f);
      return f;
    }
    addText(x, y, v, crit) {
      const tx = this.texts[this.textIdx];
      this.textIdx = (this.textIdx + 1) % this.texts.length;
      tx.x = x + (this.rng() - 0.5) * 6; tx.y = y - 6; tx.v = v; tx.crit = crit; tx.t = 0;
    }
    spawnRadius() { return Math.hypot(this.view.w / 2, this.view.h / 2) + 24; }

    makeSchedule() {
      const T = this.stageTime, idx = this.lvl;
      const s = [];
      s.push({ t: T * 0.22, kind: 'rescue' });
      // mini-boss waves (the debut year gets two late ones so a newcomer can learn the controls first)
      for (const f of (idx === 0 ? [0.78, 0.95] : [0.2, 0.45, 0.7, 0.9])) s.push({ t: T * f, kind: 'mini' });
      if (idx >= 1) s.push({ t: T * 0.3, kind: 'press' });
      s.push({ t: T * 0.12, kind: 'wave1' });
      s.push({ t: T / 3, kind: 'wave2' });
      s.push({ t: T * 0.4, kind: 'elite' });
      s.push({ t: T * 0.5, kind: 'circle' });
      if (this.yearDef.rival) s.push({ t: T * 0.42, kind: 'rival' }); // 엘 클라시코: the rival plays the middle of the stage
      s.push({ t: T * 2 / 3, kind: 'wave3' });
      s.push({ t: T * 0.75, kind: 'elite' });
      if (idx >= 4) s.push({ t: T * 0.82, kind: 'press' });
      // the season's own pressure (RS.YEARS twist / foe): the 첼씨 버스 or a defensive wall, more 기자단, 연장전
      const yd = this.yearDef, tw = yd.twist || {};
      if (yd.foe || tw.wall) for (const f of yd.foe ? [0.4, 0.75] : [0.36, 0.72]) s.push({ t: T * f, kind: 'bus' });
      for (let i = 0; i < (tw.press || 0); i++) s.push({ t: T * (0.55 + 0.3 * i), kind: 'press' });
      if (tw.extra) s.push({ t: T - tw.extra, kind: 'extra' });
      s.push({ t: T, kind: 'boss' });
      return s;
    }
    // 0 → 1 over the stage: enemies spawned later are tougher (see spawnEnemy).
    ramp() { return Math.min(1, this.t / this.stageTime); }

    // ------------------------------------------------------------ main step
    update(dt, input) {
      if (this.phase === 'cine') { this.updateCine(dt); return; }
      if (this.phase !== 'play') { this.updateFx(dt); return; }
      this.snapPrev();
      this.frame++;
      this.t += dt;
      this._boomBudget = 6; // 폭발 슈팅 chains: at most this many blasts start per step
      const p = this.player;
      if (this.bossSpawned && this.boss && this.boss.alive && !this.boss.special) this.bossT += dt; // the season boss only
      if (Math.floor(this.t) !== this._lastSec) { // damage per second over the last 20 s (boss HP scaling)
        this._lastSec = Math.floor(this.t);
        this.dpsHist.push(this.dmgDealt - this._lastDmg);
        this._lastDmg = this.dmgDealt;
        if (this.dpsHist.length > 20) this.dpsHist.shift();
      }

      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
      }
      for (const ev of this.schedule) if (!ev.done && this.t >= ev.t) { ev.done = true; this.runScheduled(ev.kind); }
      this.updateSpawns(dt);
      this.updatePlayer(dt, input || { x: 0, y: 0 });

      this.grid.clear();
      for (const e of this.enemies) if (e.alive) this.grid.insert(e);

      this.updateWeapons(dt);
      this.updateRelics(dt);
      this.updateMates(dt);
      this.updateProjs(dt);
      this.updateRings(dt);
      this.updateZones(dt);
      this.updateEnemies(dt);
      this.updateEProjs(dt);
      this.updatePickups(dt);
      this.updateRescue(dt);
      this.updateFx(dt);
      this.cleanup();

      if (p.hp <= 0 && this.phase === 'play') this.onPlayerDown();
      if (this.phase === 'play' && this.levelQueue > 0) this.openLevelUp();
    }

    // Positions at the start of a step (px, py). The renderer draws everything between these and the new ones by
    // how far the clock is into the next step, so motion stays smooth at any screen refresh rate. Anything that
    // jumps (spawned, recycled, a drop landing) sets px/py to its new place itself.
    snapPrev() {
      const p = this.player;
      p.px = p.x; p.py = p.y;
      for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
      for (const pr of this.projs) { pr.px = pr.x; pr.py = pr.y; }
      for (const ep of this.eprojs) { ep.px = ep.x; ep.py = ep.y; }
      for (const m of this.mates) { m.px = m.x; m.py = m.y; }
      if (this.orbs) for (const o of this.orbs) { o.px = o.x; o.py = o.y; }
      for (const b of this.dribs) { b.px = b.x; b.py = b.y; }
      for (const b of this.drops) { b.px = b.x; b.py = b.y; }
    }

    // ------------------------------------------------------------ spawning
    // Formation waves keep the crowd bounded: the farthest ordinary enemies leave the pitch first (no drops).
    makeRoom(n) {
      let over = this.enemies.length + n - (this.tune.maxAlive + RS.CROWD.room);
      if (over <= 0) return;
      const p = this.player, d2 = (e) => (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      const cand = this.enemies.filter((e) => e.alive && !e.boss && !e.mini && !e.elite).sort((a, b) => d2(b) - d2(a));
      for (let i = 0; i < cand.length && over > 0; i++, over--) cand[i].alive = false;
    }

    // Round 13.2: a 공세 banner brings its men — a pack of RS.CROWD.surge[n − 1] × the season's pack from one side,
    // never ahead of a runner ("1차 공세라 할만큼 몹이 몰려오지도 않았는데 2차 공세 시작이라네"). While a boss or the
    // 클라시코 rival is on, only the banner.
    surge(n) {
      const K = RS.CROWD, p = this.player;
      if (!this.bossSpawned && !this.rival) {
        // 하드 ×2; the debut ×0.5, so a newcomer who barely moves still sees 45 s (full surges killed him at 41 s)
        const m = Math.round((K.packN[0] + K.packN[1] * this.lvl) * K.surge[n - 1] * (this.tune.crowd || 1) * (this.lvl === 0 ? 0.5 : 1));
        this.makeRoom(m);
        const R = this.spawnRadius(), a0 = this.awayAngle(K.packArc / 2);
        const room = Math.min(m, this.tune.maxAlive + K.room - this.enemies.length); // 준보스 and elites never make room
        for (let i = 0; i < room; i++) {
          const a = a0 + (this.rng() - 0.5) * K.packArc, d = R + this.rng() * 28;
          this.spawnEnemy(RS.pickWeighted(this.rng, this.tune.mix).type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
        }
      }
      this.emit('wave', { n });
      this.emit('banner', { text: ['⚔️ 1차 공세 — 상대가 몰려온다', '⚡ 2차 공세 — 상대가 거세진다', '🔥 총공세 — 버텨라!'][n - 1] });
    }

    runScheduled(kind) {
      const idx = this.lvl;
      if (kind === 'rescue') this.spawnRescue();
      else if (kind === 'elite') {
        const type = idx >= 3 ? 'tank' : 'grunt';
        const a = this.rng() * TAU, R = this.spawnRadius();
        this.spawnEnemy(type, this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R, { elite: true });
        this.emit('elite');
      } else if (kind === 'circle') {
        // round 12: three quarters of a ring, so there is a way out (was 8 + idx men all round)
        const n = 6 + Math.min(14, Math.floor(idx * 0.6));
        this.makeRoom(n);
        const R = this.spawnRadius() * 0.85, a0 = this.rng() * TAU;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / Math.max(1, n - 1)) * TAU * 0.75;
          this.spawnEnemy('grunt', this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R);
        }
        this.emit('banner', { text: '포위 진형! 빈틈으로 빠져나가라' });
      } else if (kind === 'press') {
        const n = 6 + Math.min(10, Math.floor(idx / 2));
        this.makeRoom(n);
        const a = this.rng() * TAU;
        const R = this.spawnRadius();
        const cx = this.player.x + Math.cos(a) * R, cy = this.player.y + Math.sin(a) * R;
        const vx = -Math.cos(a), vy = -Math.sin(a);
        const px = -vy, py = vx;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 14;
          const e = this.spawnEnemy('press', cx + px * off, cy + py * off);
          if (e) { e.lineVx = vx; e.lineVy = vy; e.life = 9; }
        }
        this.emit('banner', { text: '기자단 돌격!' });
      } else if (kind === 'mini') {
        const n = this.tune.minis;
        this.makeRoom(n);
        const base = this.rng() * TAU, R = this.spawnRadius() * 0.9;
        // 이빨괴물 수아레즈 (round 14): beaten once as a season boss (build.flags.suarez), he takes one 준보스 place
        // some waves — never in the season that has him as its boss
        const suarez = !!(this.build.flags && this.build.flags.suarez) && this.yearDef.boss.type !== 'suarez' && this.rng() < RS.SUAREZ.miniOdds;
        for (let i = 0; i < n; i++) {
          const a = base + i * (TAU / n);
          const type = suarez && i === 0 ? 'suarezmini' : this.rng.pick(RS.MINI_TYPES);
          this.spawnEnemy(type, this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R, { mini: true });
        }
        this.emit('mini', { n });
        this.emit('banner', { text: suarez ? '🦷 이빨괴물 수아레즈 난입!' + (n > 1 ? ' 준보스 ' + n + '명' : '') : n > 1 ? '⚠️ 준보스 ' + n + '명 등장!' : '⚠️ 준보스 등장!' });
      } else if (kind === 'bus') { // 버스 수비 / 철벽: two rows of heavy defenders sweep straight across the pitch —
        // break a gap through the line or run around its end
        const n = 5 + Math.min(5, Math.floor(idx / 4)); // per row (round 11: was 7 + idx / 3, the 첼씨 seasons were a wall of men)
        this.makeRoom(n * 2);
        const a = this.rng() * TAU, R = this.spawnRadius(), p = this.player;
        const vx = -Math.cos(a), vy = -Math.sin(a), px = -vy, py = vx; // marching direction, along the row
        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * 20, d = R + row * 24;
            const e = this.spawnEnemy('tank', p.x + Math.cos(a) * d + px * off, p.y + Math.sin(a) * d + py * off);
            if (e) { e.lineVx = vx; e.lineVy = vy; e.speed = 40 * this.tune.speedMul; e.life = 2.4 * R / 40; e.maxHp = e.hp = Math.round(e.hp * 1.5); }
          }
        }
        const yd = this.yearDef;
        this.emit('banner', { text: (yd.twist && yd.twist.wall) || RS.FOES[yd.foe].wall });
      } else if (kind === 'extra') this.emit('banner', { text: '⏱ 연장전! ' + this.yearDef.twist.extra + '초 더 버텨라' });
      else if (kind === 'wave1' || kind === 'wave2' || kind === 'wave3') this.surge(+kind[4]);
      else if (kind === 'rival') this.spawnRival();
      else if (kind === 'boss') this.spawnBoss();
    }

    // 엘 클라시코 (RS.RIVAL): the rival hero as a boss in the middle of the stage, for RS.RIVAL_WINDOW seconds.
    // His HP is set once from the player's recent output (a fight of secs[0] + secs[1] × rivalLv windows worth)
    // and never recalibrated, so a stronger build really does catch him and a weak one really does not.
    spawnRival() {
      if (this.rival) return;
      const yd = this.yearDef, kind = yd.rival, R = RS.RIVAL[kind], bt = RS.BOSS_TYPES[kind], lv = yd.rivalLv || 0;
      const a = this.rng() * TAU, D = this.spawnRadius() * 0.8;
      const e = this.spawnEnemy('grunt', this.player.x + Math.cos(a) * D, this.player.y + Math.sin(a) * D);
      e.type = 'rival'; e.sprite = bt.sprite; e.boss = true; e.rival = true; e.elite = false;
      e.r = bt.r; e.speed = bt.speed * this.tune.speedMul * (1 + 0.03 * lv);
      // a single running target takes about an eighth of a crowd build's output (RS.RIVAL_HIT_SHARE); the checkpoints
      // of RS.RIVAL_CALIBRATE_AT (World.calibrateBoss) then set the fight to secs[0] + secs[1] × lv windows of the
      // damage that really lands, and after that his HP is fixed: late burst, focus and a stronger build decide the
      // window. His floor is only RS.RIVAL_FLOOR of a boss (round 11: the full boss HP as a floor kept a one-weapon
      // build from ever catching him — 130 damage landed on 2797 HP)
      e.baseHp = Math.round(RS.bossHp(bt, this.tune) * (1 + R.hp * lv) * RS.RIVAL_FLOOR);
      e.maxHp = e.hp = Math.round(Math.max(e.baseHp, this.recentDps() * RS.RIVAL_HIT_SHARE * this.bossTarget({ rival: true, rivalLv: lv })));
      e.bossDmgIn = 0; e.calibrated = 0;
      e.dmg = Math.round(bt.dmg * this.tune.bossDmgMul * (1 + R.dmg * lv));
      e.xp = 40; e.name = R.name; e.leaveAt = this.t + RS.RIVAL_WINDOW; e.rivalLv = lv;
      e.ai = { kind, cool: 1.5, act: null, last: null, phase: 1, keep: 70, strafe: 1, history: [], rival: true, lv };
      this.rival = e;
      this.clearCrowd(RS.BOSS_CROWD.rivalKeep);
      this.emit('rival', { name: e.name, lv, secs: RS.RIVAL_WINDOW });
      return e;
    }
    rivalLeave(e) {
      e.alive = false; e.tele = null;
      this.rival = null; this.rivalResult = 'loss';
      this.addFx('poof', e.x, e.y, { dur: 0.4, big: true, seed: 0 });
      this.emit('rivalEnd', { win: false, name: e.name });
    }

    // 토레쓰 (RS.TORRES): 드록빠 is down, the season is cleared, and he runs on at once for RS.TORRES.window seconds.
    // Like the rival his HP follows the damage that really lands at the first two checkpoints (a fight of
    // window × secs), then stays: keep hitting him and he falls. He leaves when the window closes.
    spawnTorres() {
      if (this.torres || this.phase !== 'play') return null;
      const bt = RS.BOSS_TYPES.torres, a = this.rng() * TAU, D = this.spawnRadius() * 0.8;
      const e = this.spawnEnemy('grunt', this.player.x + Math.cos(a) * D, this.player.y + Math.sin(a) * D);
      e.type = 'torres'; e.sprite = bt.sprite; e.boss = true; e.special = true; e.elite = false;
      e.r = bt.r; e.speed = bt.speed * this.tune.speedMul;
      e.baseHp = Math.round(RS.bossHp(bt, this.tune) * RS.RIVAL_FLOOR);
      e.maxHp = e.hp = Math.round(Math.max(e.baseHp, this.recentDps() * RS.RIVAL_HIT_SHARE * this.bossTarget(e)));
      e.bossDmgIn = 0; e.calibrated = 0;
      e.dmg = Math.round(bt.dmg * this.tune.bossDmgMul);
      e.xp = 0; e.name = RS.TORRES.name; e.leaveAt = this.t + RS.TORRES.window;
      e.ai = { kind: 'torres', cool: 1.2, act: null, last: null, phase: 1, keep: 0, strafe: 1, history: [] };
      this.torres = e; this.boss = e; // the boss bar follows him
      this.clearCrowd(RS.BOSS_CROWD.keep);
      this.emit('torres', { name: e.name, secs: RS.TORRES.window });
      return e;
    }
    // The window closed (or the hero went down): the season stays cleared, without the extra reward.
    torresLeave(e) {
      e.alive = false; e.tele = null;
      this.torres = null; this.boss = null; this.torresResult = 'loss';
      this.addFx('poof', e.x, e.y, { dur: 0.4, big: true, seed: 0 });
      this.emit('torresEnd', { win: false, name: e.name });
      this.phase = 'clear';
      this.emit('clear');
    }

    // 캄프 누 900억 일시불 골 (round 14, RS.YEARS[].cine): the last 첼씨 시련 ends with the goal played out in the
    // game's own pixels — the crowd walks off, a goal appears up the pitch with the keeper (발기스) in front of it,
    // 토레쓰 runs on alone from the half line, steps round the keeper's dive, rolls the ball in, and slides on his
    // knees — then the season clears like any other. Scripted on the fixed step (World.updateCine), so a seed replays
    // it the same; the renderer only reads fx ('goal', 'cball', 'lob') and the player's usual poses.
    startCine(kind, boss) {
      const p = this.player;
      this.phase = 'cine';
      this.boss = null; this.torres = null;
      for (const e of this.enemies) if (e.alive) { e.alive = false; this.addFx('poof', e.x, e.y, { dur: 0.35, seed: e.uid }); }
      this.eprojs.length = 0; this.projs.forEach((pr) => { pr.alive = false; });
      p.dash = null; p.jump = 0; p.kickT = 0; p.iframe = 0; p.hurtT = 0; p.moving = false; p.vx = p.vy = 0; // nobody hits him now; no blink
      const gx = p.x + 44, gy = p.y - 196; // the goal, up the pitch (a little right: the sidestep ends under it); the run covers most of it
      const k = this.spawnEnemy('grunt', gx, gy + 22, {});
      k.boss = true; k.sprite = boss && boss.sprite !== 'bkeeper' ? 'bkeeper' : 'bkeeper'; k.cine = true; k.ai = null; k.invuln = true;
      k.r = 14; k.name = this.yearDef.boss.name; k.maxHp = k.hp = 1e9; k.face = p.x < k.x ? -1 : 1; k.xp = 0;
      this.addFx('goal', gx, gy, { dur: 99, w: 60 });
      this.addFx('cball', p.x, p.y, { dur: 99, follow: true, side: 1 });
      this.cine = { t: 0, step: 0, gx, gy, k, y0: p.y, x0: p.x, kind };
      this.emit('cine', { kind, text: '⏱ 추가시간 — 하프라인에 토레쓰 혼자!' });
      this.emit('sfx', { name: 'whistle' });
    }
    updateCine(dt) {
      const c = this.cine, p = this.player, k = c.k;
      if (!c) { this.phase = 'clear'; this.emit('clear'); return; }
      this.snapPrev();
      this.frame++;
      c.t += dt; this.t += dt;
      p.animT += dt;
      if (p.kickT > 0) p.kickT -= dt;
      const at = (n, t0) => { if (c.step === n && c.t >= t0) { c.step = n + 1; return true; } return false; };
      if (c.step <= 0) { // the run from the half line, ball at his feet; the keeper edges out to meet him
        p.moving = true; p.diry = -1; p.dirx = 0; p.y -= 82 * dt;
        k.y += 10 * dt;
        if (Math.floor(c.t * 12) !== Math.floor((c.t - dt) * 12)) this.addFx('poof', p.x, p.y + 6, { dur: 0.18, seed: c.t });
      }
      if (at(0, 1.75)) { c.dive = { x: k.x, y: k.y, tx: p.x - 4, ty: p.y - 22 }; this.emit('sfx', { name: 'warn' }); }
      if (c.step === 1) { // the keeper dives at the ball; 토레쓰 drags it to the right and steps round him
        const d = c.dive, u = Math.min(1, (c.t - 1.75) / 0.4);
        k.x = d.x + (d.tx - d.x) * u; k.y = d.y + (d.ty - d.y) * u; k.face = -1;
        p.moving = true; p.face = 1; p.dirx = 1; p.x += 118 * dt; p.y -= 26 * dt;
        if (Math.floor(c.t * 20) % 2 === 0) this.addFx('strail', p.x, p.y, { dur: 0.3, dx: 1, dy: -0.2 });
      }
      if (at(1, 2.2)) { // the finish: a roll into the far side of the goal
        p.moving = false; p.kickT = 0.35; p.face = -1;
        for (const f of this.fx) if (f.kind === 'cball') f.dur = 0;
        this.addFx('lob', c.gx - 16, c.gy - 2, { dur: 0.55, x0: p.x - 6, y0: p.y, white: true, low: true });
        this.emit('sfx', { name: 'kick' });
      }
      if (at(2, 2.8)) { // GOAL
        this.addFx('shock', c.gx - 16, c.gy - 2, { r: 30, dur: 0.5, color: '#ffffff' });
        this.addFx('boom', c.gx - 16, c.gy, { r: 44, dur: 0.7 });
        this.pfx('bigExplosion', c.gx - 16, c.gy + 2, { palette: RS.PFX_GOLD });
        this.emit('shake', { k: 0.4 });
        this.emit('banner', { text: '⚽ GOAL!!! 캄프 누 900억 일시불 골' });
        this.emit('sfx', { name: 'horn' }); this.emit('sfx', { name: 'cheer' });
        this.emit('siuu');
        this.cleared = true;
      }
      if (c.step === 3 && c.t >= 3.25) { // the knee slide, back down the pitch toward the camera
        if (!c.slid) { c.slid = true; p.face = -1; this.emit('sfx', { name: 'dash' }); this.addFx('martial', p.x, p.y, { dur: 1.2, ch: '900억!', n: 2, follow: true }); }
        const u = Math.min(1, (c.t - 3.25) / 1.1);
        p.moving = false; p.kickT = 0; p.jump = 0;
        p.y += (1 - u) * 110 * dt; p.x -= (1 - u) * 20 * dt;
        if (Math.floor(c.t * 24) % 2 === 0 && u < 1) this.addFx('strail', p.x, p.y + 4, { dur: 0.35, dx: -0.2, dy: 1 });
      }
      if (at(3, 5.2)) {
        for (const f of this.fx) if (f.kind === 'goal') f.dur = 0;
        k.alive = false;
        this.phase = 'clear';
        this.emit('clear');
      }
      this.updateFx(dt);
      this.cleanup();
    }

    // The season boss, the 클라시코 rival and 토레쓰 get the stage (RS.BOSS_CROWD): the ordinary crowd but the `keep`
    // nearest walks off in a puff (elites, 준보스 and bosses stay), so shots reach the big man. The final stays a
    // duel: there the elites and 준보스 walk off too and only `duelKeep` men stay (round 11: six 준보스 left on with
    // 메시 decided most finals).
    clearCrowd(keep) {
      const p = this.player, list = [], duel = !!this.yearDef.final;
      if (duel) keep = Math.min(keep, RS.BOSS_CROWD.duelKeep);
      for (const e of this.enemies) if (e.alive && !e.boss && (duel || (!e.mini && !e.elite))) list.push(e);
      if (list.length <= keep) return;
      list.sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
      for (let i = keep; i < list.length; i++) {
        list[i].alive = false;
        if (i < keep + 20) this.addFx('poof', list[i].x, list[i].y, { dur: 0.35, seed: i });
      }
    }

    // Round 12 (RS.CROWD): a thin trickle from every side, and packs that come on from one side at a time — never
    // ahead of a running hero (no man of a pack within 60° of his heading, World.awayAngle): whichever way he runs he
    // meets only the trickle there, and the pack he left behind follows him.
    updateSpawns(dt) {
      const prog = Math.min(1, this.t / this.stageTime), C = RS.BOSS_CROWD, K = RS.CROWD, p = this.player;
      // the boss fight stays about the boss; the 클라시코 window too, a little less
      const focus = this.bossSpawned || this.rival;
      const rate = this.tune.spawnRate * K.trickle * (K.start + (1 - K.start) * prog) * (this.bossSpawned ? 0.3 : this.rival ? C.rivalRate : 1);
      const cap = focus ? Math.min(this.tune.maxAlive, this.bossSpawned && this.yearDef.final ? C.duelMax : C.max) : this.tune.maxAlive;
      this.spawnAcc = Math.min(6, this.spawnAcc + rate * dt);
      const R = this.spawnRadius();
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.enemies.length >= cap) break;
        const a = this.rng() * TAU;
        this.spawnEnemy(RS.pickWeighted(this.rng, this.tune.mix).type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      }
      if (focus) return;
      // Round 13.1 (RS.CROWD.near): a man or two always on his way, even in a thin early season. The count runs every
      // `nearEvery` s, not every frame, and takes every man on the pitch: stragglers are recycled back around the hero
      // (World.updateEnemies), and counting only the ring filled the crowd cap behind a runner. The new man steps in
      // just off the screen edge, never ahead of a running hero.
      if (this.nearT == null) this.nearT = K.nearFirst;
      if ((this.nearT -= dt) <= 0) {
        this.nearT = K.nearEvery;
        let n = 0;
        for (const e of this.enemies) if (e.alive && !e.boss) n++;
        if (n < Math.round(K.near * this.tune.crowd) && this.enemies.length < cap) {
          const a = this.awayAngle(0);
          const d = Math.min(this.view.w / 2 / Math.abs(Math.cos(a)), this.view.h / 2 / Math.abs(Math.sin(a))) + 16;
          this.spawnEnemy(RS.pickWeighted(this.rng, this.tune.mix).type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
        }
      }
      if (this.packT == null) this.packT = K.packFirst;
      if ((this.packT -= dt) > 0) return;
      this.packT = K.packEvery[0] + (K.packEvery[1] - K.packEvery[0]) * prog;
      const n = Math.min(cap - this.enemies.length, Math.round((K.packN[0] + K.packN[1] * this.lvl) * this.tune.crowd * (K.packGrow[0] + (K.packGrow[1] - K.packGrow[0]) * prog)));
      const a0 = this.awayAngle(K.packArc / 2);
      for (let i = 0; i < n; i++) {
        const a = a0 + (this.rng() - 0.5) * K.packArc, d = R + this.rng() * 28;
        this.spawnEnemy(RS.pickWeighted(this.rng, this.tune.mix).type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      }
    }

    spawnEnemy(type, x, y, opt) {
      opt = opt || {};
      const def = RS.ENEMIES[type];
      const e = this.enemyPool.pop() || {};
      const tu = this.tune;
      const k = this.ramp(); // later in the stage: tougher, faster, and drawn with a darker tint
      e.uid = this.nextUid++; e.type = type; e.sprite = def.sprite; e.x = e.px = x; e.y = e.py = y; e.alive = true;
      e.pace = def.pace || 'normal'; // fast and slow enemies keep their pace all stage; normal ones speed up
      e.r = def.r; e.speed = def.speed * tu.speedMul * (1 + (e.pace === 'normal' ? tu.rampSpeed * k : 0)) * (0.9 + this.rng() * 0.2);
      e.maxHp = e.hp = Math.round(def.hp * tu.hpMul * (1 + tu.rampHp * k));
      e.dmg = Math.round(def.dmg * tu.dmgMul * (1 + tu.rampDmg * k));
      e.tier = k >= 2 / 3 ? 2 : k >= 1 / 3 ? 1 : 0;
      e.xp = def.xp; e.ranged = !!def.ranged; e.shootT = 1.5 + this.rng() * 2;
      e.stun = 0; e.kx = 0; e.ky = 0; e.flash = -1; e.elite = !!opt.elite; e.boss = false; e.ai = null;
      e.invuln = false; e.tele = null; e.lineVx = 0; e.lineVy = 0; e.life = 0; e.dHit = -9; e.face = 1; e.charging = false; e.orbT = 0;
      e.anim = this.rng() * 10; e.minion = !!opt.minion;
      e.mini = !!def.mini; e.name = def.name;
      e.rival = false; e.leaveAt = 0; e.rivalLv = 0; // pooled objects: a past 클라시코 rival must not linger
      e.special = false; e.numAcc = 0; e.numT = -9; e.numCrit = false; // nor 토레쓰, nor a damage number pending
      if (e.elite) { e.maxHp = e.hp = e.hp * 9; e.r = Math.round(e.r * 1.5); e.dmg = Math.round(e.dmg * 1.4); e.xp *= 12; e.speed *= RS.ELITE_SPEED; e.pace = 'slow'; }
      if (e.mini) { // 준보스: scales with the year (not with the wall), acts like a small boss (telegraphed charge / slam)
        e.maxHp = e.hp = Math.round(e.hp / tu.wallHp * (1 + 0.25 * this.lvl));
        e.dmg = Math.round(e.dmg / tu.wallDmg);
        e.ai = { kind: 'mini', cool: 1.6 + this.rng(), act: null, acts: def.acts, n: 0 };
      }
      this.enemies.push(e);
      return e;
    }

    spawnBoss() {
      if (this.bossSpawned) return;
      this.bossSpawned = true;
      const yd = this.yearDef;
      const bt = RS.BOSS_TYPES[yd.boss.type];
      const a = -Math.PI / 2 + (this.rng() - 0.5);
      const R = this.spawnRadius() * 0.8;
      const e = this.spawnEnemy('grunt', this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R);
      e.type = 'boss'; e.sprite = bt.sprite; e.boss = true; e.elite = false;
      e.r = bt.r; e.speed = bt.speed * this.tune.speedMul;
      e.maxHp = e.hp = RS.bossHp(bt, this.tune);
      e.bossDmgIn = 0; e.calibrated = 0; e.baseHp = e.maxHp;
      // starting floor from the player's recent total output (assumes ~25 % of it lands on the boss)
      e.maxHp = e.hp = Math.round(Math.max(e.maxHp, this.recentDps() * 0.25 * this.bossTarget(e)));
      e.dmg = Math.round(bt.dmg * this.tune.bossDmgMul);
      e.xp = 40;
      e.name = yd.boss.name;
      e.ai = { kind: yd.boss.type, cool: 1.8, act: null, last: null, phase: 1, keep: RS.FINAL[yd.boss.type] ? 70 : 0, strafe: 1, history: [] };
      this.boss = e;
      this.clearCrowd(RS.BOSS_CROWD.keep);
      this.emit('boss', { name: e.name, final: !!yd.final });
      return e;
    }

    // Average damage per second over the last 20 s (all targets).
    recentDps() {
      if (!this.dpsHist.length) return 0;
      let s = 0;
      for (const v of this.dpsHist) s += v;
      return s / this.dpsHist.length;
    }

    spawnRescue() {
      const full = RS.squadFull(this.build);
      // this season's teammates only; with a full squad reaching him opens a transfer swap
      const cands = RS.mateCandidates(this.build, this.yearIdx);
      if (!cands.length) return;
      const id = this.rng.pick(cands), lv = RS.rollMatePlus(this.rng);
      const a = this.rng() * TAU;
      const d = Math.min(this.view.w, this.view.h) * 0.42 + 40;
      this.rescue = { id, lv, x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d, progress: 0, need: 1.0, swap: full };
      this.emit('rescueSpawn', { id, lv, swap: full });
    }

    updateRescue(dt) {
      const r = this.rescue;
      if (!r) return;
      const p = this.player;
      const d = Math.hypot(p.x - r.x, p.y - r.y);
      if (d < 22) r.progress += dt; else r.progress = Math.max(0, r.progress - dt * 0.5);
      if (r.progress >= r.need) {
        this.rescue = null;
        this.addFx('shock', r.x, r.y, { r: 30, dur: 0.4, color: '#7fe0ff' });
        const where = RS.addMate(this.build, r.id, r.lv);
        if (where) {
          if (where === 'pitch') this.spawnMateRuntime(this.build.teammates[this.build.teammates.length - 1], r.x, r.y);
          this.recalc();
          this.recruitedThisRun.push(r.id);
          this.emit('recruit', { id: r.id, lv: r.lv, bench: where === 'bench' });
        } else this.openSwap(r.id, r.lv);
      }
    }

    // Transfer offer during a run: replace one teammate (the newcomer brings his own 강화) or keep the squad.
    openSwap(newId, lv) {
      const nm = RS.TEAMMATES[newId];
      // each card says who leaves and who comes (round 12: "A → B" read as a pass, not a transfer)
      this.swapChoices = RS.allMates(this.build).map((m) => ({
        kind: 'swap', id: newId, lv, out: m.id, icon: '🔄', name: nm.name + ' 영입 · ' + RS.TEAMMATES[m.id].name + ' 방출',
        desc: '🔻 나감: ' + RS.TEAMMATES[m.id].name + ' +' + m.lv + (this.build.bench.some((b) => b.id === m.id) ? ' (벤치)' : ' (선발)') +
          '\n🔺 들어옴: ' + nm.name + ' +' + lv + '\n' + RS.mateLine(newId),
        tag: RS.mateBadge(newId, lv), g: RS.mateGrade(newId), hint: RS.swapVerdict(m.id, newId, m.lv, lv)
      }));
      this.swapChoices.push({ kind: 'keep', id: newId, icon: '✋', name: '지금 스쿼드 유지', desc: nm.name + ' 영입을 거절한다.', tag: '거절' });
      this.phase = 'swap';
      this.emit('swap', { id: newId });
    }

    chooseSwap(i) {
      if (this.phase !== 'swap' || !this.swapChoices || !this.swapChoices[i]) return false;
      const c = this.swapChoices[i];
      if (c.kind === 'swap' && RS.swapMate(this.build, c.out, c.id, c.lv)) {
        const m = this.mates.find((x) => x.id === c.out); // null when the released player sat on the bench
        if (m) {
          const ref = this.build.teammates.find((x) => x.id === c.id);
          const def = RS.TEAMMATES[c.id];
          m.id = c.id; m.ref = ref; m.role = def.role; m.dash = null; m.timer = 0.5;
        }
        this.recalc();
        this.recruitedThisRun.push(c.id);
        this.emit('recruit', { id: c.id, swap: c.out });
      }
      this.swapChoices = null;
      this.phase = 'play';
      return true;
    }

    // ------------------------------------------------------------ player
    updatePlayer(dt, input) {
      const p = this.player;
      p.iframe = Math.max(0, p.iframe - dt);
      p.hurtT = Math.max(0, p.hurtT - dt);
      p.jump = Math.max(0, p.jump - dt);
      p.kickT = Math.max(0, p.kickT - dt);
      p.slideCd = Math.max(0, p.slideCd - dt);
      if (this.stats.regen > 0) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.regen * dt);
      let ix = input.x || 0, iy = input.y || 0;
      const m = Math.hypot(ix, iy);
      if (m > 1) { ix /= m; iy /= m; }
      p.moving = m > 0.15;
      if (p.moving) {
        const n = Math.hypot(ix, iy);
        p.dirx = ix / n; p.diry = iy / n;
        if (Math.abs(ix) > 0.1) p.face = ix > 0 ? 1 : -1;
        p.animT += dt * (0.6 + Math.min(1, m));
        p.dustT -= dt;
        if (p.dustT <= 0 && !p.dash) { // little dust puffs behind the running feet
          p.dustT = 0.14;
          this.addFx('dust', p.x - p.dirx * 5 + (this.rng() - 0.5) * 4, p.y + 7, { dur: 0.35, vx: -p.dirx * 12, vy: -6 });
        }
      }
      if (p.dash) {
        const d = p.dash;
        d.t += dt;
        p.x += d.dx * d.speed * dt; p.y += d.dy * d.speed * dt;
        // hit enemies along the path
        this.grid.query(p.x, p.y, 30, this._q);
        for (const e of this._q) {
          if (!e.alive || d.hits.has(e.uid)) continue;
          const rr = e.r + 10;
          if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) { d.hits.add(e.uid); this.damageEnemy(e, d.dmg, { knock: 90, kx: d.dx, ky: d.dy }); }
        }
        if (Math.floor(d.t * 60) % 3 === 0) this.addFx('ghost', p.x, p.y, { dur: 0.25, face: p.face });
        if (d.slide) this.addFx('strail', p.x, p.y + 4, { dur: 0.3, dx: d.dx, dy: d.dy, k: d.t / d.dur }); // gradient streak
        if (d.t >= d.dur) {
          if (d.cup) this.hollywoodLand(d);
          else if (d.burst) this.shock(d.sx, d.sy, d.burst * this.stats.area, d.dmg, { color: '#c9a0ff', knock: 120 });
          p.dash = null;
        }
      } else {
        p.x += ix * this.stats.move * dt;
        p.y += iy * this.stats.move * dt;
      }
      // smoothed velocity, used by bosses to lead their attacks
      const vx = p.dash ? p.dash.dx * p.dash.speed : ix * this.stats.move;
      const vy = p.dash ? p.dash.dy * p.dash.speed : iy * this.stats.move;
      p.vx += (vx - p.vx) * Math.min(1, dt * 8);
      p.vy += (vy - p.vy) * Math.min(1, dt * 8);
    }

    // 슬라이딩 버튼: an invulnerable dash in the move direction (or facing) with a gradient trail. Returns false
    // while on cooldown. Enemies on the path take a little damage and are knocked aside.
    slide() {
      const p = this.player;
      if (this.phase !== 'play' || p.dash || p.slideCd > 0) return false;
      let dx = p.dirx, dy = p.diry;
      if (!p.moving) { dx = p.face; dy = 0; }
      const n = Math.hypot(dx, dy) || 1;
      p.dash = { dx: dx / n, dy: dy / n, speed: RS.SLIDE.speed, dur: RS.SLIDE.dur, t: 0, dmg: RS.SLIDE.dmg, hits: new Set(), slide: true, sx: p.x, sy: p.y };
      p.slideCd = this.slideCooldown();
      p.iframe = Math.max(p.iframe, RS.SLIDE.dur + 0.1);
      this.emit('sfx', { name: 'dash' });
      this.emit('slide');
      return true;
    }
    slideCooldown() { return RS.SLIDE.cd[this.hero] || RS.SLIDE.cd.ronaldo; }

    hurtPlayer(dmg, src) {
      const p = this.player;
      if (p.iframe > 0 || p.dash || this.debug.godMode || this.phase !== 'play') return;
      // armor takes a flat bite off every hit, never more than RS.ARMOR_CAP of it (stacked armor made 1-damage hits)
      const raw = dmg * (this.bossSpawned ? this.finalScale : 1);
      const d = Math.max(1, Math.round(raw - Math.min(this.stats.armor, raw * RS.ARMOR_CAP)));
      p.hp -= d;
      this.dmgTaken += d;
      this.hits++;
      if (this.bossSpawned) this.bossDmgTaken += d;
      if (p.hp < this.minHp) this.minHp = p.hp;
      p.iframe = Math.max(RS.IFRAMES, this.stats.hitGuard); // 오뚝이 정신: the hero blinks (render.js) the whole time
      p.hurtT = 0.2;
      this.emit('hurt', { dmg: d });
    }

    onPlayerDown() {
      const p = this.player;
      if (this.cleared) { // 드록빠 is already down: falling to 토레쓰 just ends the clear
        if (this.torres) this.torresLeave(this.torres);
        else { this.phase = 'clear'; this.emit('clear'); }
        return;
      }
      if (this.stats.revive > 0 && !p.revived) {
        p.revived = true;
        p.hp = Math.round(this.stats.maxHp * 0.6);
        p.iframe = 2.5;
        this.shock(p.x, p.y, 120, 30, { knock: 300, stun: 1.5, color: '#ffcc33' });
        this.emit('revive');
        this.emit('banner', { text: '불사조 부활!' });
        return;
      }
      p.hp = 0;
      this.phase = 'dead';
      this.emit('dead');
    }

    // ------------------------------------------------------------ targeting
    // Round 12: every aim — the hero's moves and items, his teammates, homing, bouncing and dribbled balls — picks only
    // men on screen (the view around the hero, + 8 px); bosses, the 클라시코 rival and 토레쓰 always. A portrait phone
    // shows 147 across while the moves reach 240: two hits in three landed out of sight, an empty-looking pitch.
    inSight(e) {
      const p = this.player;
      return e.boss || (Math.abs(e.x - p.x) <= this.view.w / 2 + 8 && Math.abs(e.y - p.y) <= this.view.h / 2 + 8);
    }
    // Round 12: a direction around the hero for new or recycled men that stays more than 60° (+ margin) off a running
    // hero's heading — one ahead of him is turned round (a pack passes its half-width as the margin, under 30°)
    awayAngle(margin) {
      const p = this.player, a = this.rng() * TAU;
      return p.moving && Math.cos(a - Math.atan2(p.diry, p.dirx)) > Math.cos(Math.PI / 3 + margin) ? a + Math.PI : a;
    }
    nearestEnemies(k, maxR, out) {
      out = out || [];
      out.length = 0;
      const p = this.player;
      const md = maxR * maxR;
      const ds = this._dists || (this._dists = []);
      ds.length = 0;
      for (const e of this.enemies) {
        if (!e.alive || !this.inSight(e)) continue;
        let d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d > md * (e.boss ? 1.6 : 1)) continue;
        if (e.boss || e.mini) d *= e.boss ? 0.2 : 0.55; // big targets pull the auto-aim: fights stay about them
        if (out.length < k) { out.push(e); ds.push(d); }
        else {
          let wi = 0;
          for (let i = 1; i < ds.length; i++) if (ds[i] > ds[wi]) wi = i;
          if (d < ds[wi]) { out[wi] = e; ds[wi] = d; }
        }
      }
      // sort nearest first
      const idx = out.map((e, i) => i).sort((a, b) => ds[a] - ds[b]);
      const sorted = idx.map((i) => out[i]);
      out.length = 0;
      for (const e of sorted) out.push(e);
      return out;
    }
    nearestFrom(x, y, maxR, exclude) {
      let best = null, bd = maxR * maxR;
      this.grid.query(x, y, maxR, this._q2);
      for (const e of this._q2) {
        if (!e.alive || (exclude && exclude.has(e.uid)) || !this.inSight(e)) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    // ------------------------------------------------------------ weapons
    // The weapon's stats this step: its table row or evolved form (the variant name picks the path), with every
    // damage number × the grade and 강화 multiplier (RS.weaponMul). Cached until the move or the multiplier changes.
    weaponStats(id) {
      const b = this.build, base = RS.skillStats(id, b.skills[id], b.evolved[id], b.stars[id]);
      if (this._wsBase !== base || this._wsMul !== this.wmul) {
        const s = Object.assign({}, base), m = this.wmul * (RS.WEAPON_SOLO[id] || 1);
        for (const k of ['dmg', 'boomDmg', 'zdmg']) if (s[k]) s[k] *= m;
        if (s.cd && RS.WEAPON_CD[id]) s.cd *= RS.WEAPON_CD[id];
        this._wsBase = base; this._wsMul = this.wmul; this._ws = s;
      }
      return this._ws;
    }
    // How close the bot (RS.botInput) lets the crowd come: a close-range weapon (회전 공, 바이시클 킥, 함성 …) only
    // hits what stands inside its radius, so the bot holds the crowd at that edge instead of the usual 75 px.
    weaponReach() {
      const id = this.build.weapon.id, s = this.weaponStats(id), use = RS.skillUse(id);
      if (use === 'stepover') return STEP_REACH + 12; // the dash fires at a man this close
      if (!s.radius || BOT_REMOTE[use]) return 75;
      return Math.max(26, Math.min(75, s.radius * this.stats.area * 0.85));
    }
    // How close the bot closes on a boss: a move with a radius around the hero to its edge (a SIUU ring of 130 px
    // as well — weaponReach keeps the crowd at 75 px at most); 불꽃 질주 to 70 px, so the boss chasing him walks on
    // fire that is still burning (it burns out in about 2 s; from 180 px he arrived after it); a 라보나 inside the
    // distance its boomerangs fly before they turn (it aims at men 220 px off, but a 희귀 one turns at about 130);
    // any other shot within 180 px. Round 13's career bot, held at 180 px with these, fought 2009-11 bosses for two
    // to nine minutes.
    bossReach() {
      const id = this.build.weapon.id, s = this.weaponStats(id), use = RS.skillUse(id);
      if (use === 'trail') return 70;
      if (use === 'rabona') return Math.min(180, s.range * this.stats.area * 0.85);
      if (use === 'stepover' || !s.radius || BOT_REMOTE[use]) return this.botR < 75 ? this.botR : 180;
      return Math.max(26, Math.min(180, s.radius * this.stats.area * 0.85));
    }
    // The weapon in hand changed mid-match: its runtime state and the balls of the old move go.
    weaponChanged() {
      this.wstate = {}; this.orbs = null; this.dribs.length = 0; this.drops.length = 0;
      this._wsBase = null;
    }
    updateWeapons(dt) {
      const b = this.build, st = this.stats;
      for (const id of b.skillOrder) {
        const ws = this.wstate[id] || (this.wstate[id] = { timer: 0.3 + this.rng() * 0.5, tick: 0 });
        const evo = !!b.evolved[id], use = RS.skillUse(id);
        const s = this.weaponStats(id);
        if (s.aura) { // permanent tornado aura (바이시클 킥 / 엘라스티코 evolved)
          ws.tick -= dt;
          ws.angle = (ws.angle || 0) + dt * 9;
          if (ws.tick <= 0) {
            ws.tick = s.cd;
            this.shock(this.player.x, this.player.y, s.radius * st.area, s.dmg, { knock: 40, silentFx: true });
          }
          continue;
        }
        if (use === 'stepover') { this.updateStepover(ws, s, evo, dt, id); continue; }
        if (use === 'orbit') { this.updateOrbit(ws, s, dt, id); continue; }
        if (use === 'trail') { this.updateTrail(ws, s, dt); continue; }
        if (use === 'dribball') { this.updateDribball(ws, s, dt); continue; }
        if (use === 'dropball') { this.updateDropball(ws, s, dt); continue; }
        if (use === 'swarm') { // 위성 군단: the orbit and the hunting balls at once
          this.updateOrbit(ws, s, dt, id);
          this.updateDribball(ws, ws.drib || (ws.drib = {}), dt, s);
          continue;
        }
        ws.timer -= dt;
        if (ws.timer > 0) continue;
        const fired = this.fire(use, s, evo, id);
        ws.timer = fired ? s.cd * st.cd : 0.2;
      }
    }

    // 메시's balls circle the player at `radius`; each enemy they touch takes damage once per `cd` seconds (bigger
    // balls cover more ground). The evolved 회전 공 is the 발롱도르 he has won (RS.ballonCount): count = one trophy
    // each, size = all of them in one ball (×N, at least ×2); golden balls fill the ring up to the Lv.6 four.
    // Each ball keeps its size, damage and look in this.orbs (the renderer reads them).
    updateOrbit(ws, s, dt, id) {
      const p = this.player, st = this.stats, b = this.build, evolved = id === 'orbit' && b.evolved.orbit;
      let n = s.count, nTro = 0, troR = 4 * s.size, troDmg = s.dmg, speed = s.speed, knock = s.knock || 20, fillR = troR, fillDmg = s.dmg;
      if (evolved) {
        const nb = RS.ballonCount(b), big = evolved === 'size', k = nb / RS.BALLON_MAX, O = RS.SKILLS.orbit;
        nTro = big ? Math.min(1, nb) : nb;
        n = nTro + Math.max(0, RS.ORBIT_RING - nb);
        fillR = 4 * O.evos.count.stats.size;
        fillDmg = O.lv[RS.SKILL_MAX - 1].dmg * this.wmul;
        if (big) { troR = 4 * Math.max(2, nb); troDmg = s.dmg * (0.7 + 0.3 * k); speed = 4.4 - 1.8 * Math.max(0, nb - 1) / 7; knock = s.knock * (0.25 + 0.75 * k); }
      }
      ws.angle = (ws.angle || 0) + dt * speed;
      const R = s.radius * st.area;
      const orbs = this.orbs || (this.orbs = []);
      orbs.length = n;
      let maxR = 0;
      for (let i = 0; i < n; i++) {
        const a = ws.angle + i * TAU / n;
        const o = orbs[i] || (orbs[i] = { x: 0, y: 0, r: 0, dmg: 0, look: 'white' });
        o.x = p.x + Math.cos(a) * R; o.y = p.y + Math.sin(a) * R;
        if (evolved) { const t = i < nTro; o.r = t ? troR : fillR; o.dmg = t ? troDmg : fillDmg; o.look = t ? 'ballon' : 'gold'; }
        else { o.r = troR; o.dmg = s.dmg; o.look = RS.ballLookAt(b, id, i); }
        if (o.r > maxR) maxR = o.r;
      }
      const reach = R + maxR + 20;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - p.x) > reach + e.r || Math.abs(e.y - p.y) > reach + e.r) continue;
        if (e.orbT > this.t) continue;
        for (let i = 0; i < n; i++) {
          const o = orbs[i];
          const rr = o.r + e.r;
          if ((e.x - o.x) ** 2 + (e.y - o.y) ** 2 < rr * rr) {
            e.orbT = this.t + s.cd * st.cd;
            const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
            this.damageEnemy(e, o.dmg, { knock, kx: (e.x - p.x) / d, ky: (e.y - p.y) / d });
            break;
          }
        }
      }
    }

    // 불꽃 질주: drops a burning patch behind the feet while running (evolved: also while standing). A patch is not
    // stacked on top of the last one; that one just keeps burning longer. A slide (or any dash) lays a carpet: a
    // patch every 0.8 radius of the path (round 12: the slide outran the timer and left nothing behind).
    updateTrail(ws, s, dt) {
      const p = this.player, st = this.stats;
      if (p.dash) {
        const r = s.radius * st.area, y = p.y + 5, last = this.zones[this.zones.length - 1];
        if (last && (last.x - p.x) ** 2 + (last.y - y) ** 2 < (r * 0.8) ** 2) return;
        if (this.zones.length >= 70) this.zones.shift();
        this.zones.push({ x: p.x, y, r, t: 0, life: s.life * st.dur, tick: s.tick, tickT: 0, dmg: s.dmg, evo: !!s.still, seed: this.rng() * 6.28 });
        return;
      }
      ws.timer -= dt;
      if (ws.timer > 0 || (!p.moving && !s.still)) return;
      ws.timer = s.cd;
      const x = p.x - p.dirx * 4, y = p.y + 5, r = s.radius * st.area;
      const last = this.zones[this.zones.length - 1];
      if (last && (last.x - x) ** 2 + (last.y - y) ** 2 < (last.r * 0.7) ** 2) { last.t = Math.min(last.t, last.life * 0.3); return; }
      if (this.zones.length >= 70) this.zones.shift();
      this.zones.push({ x, y, r, t: 0, life: s.life * st.dur, tick: s.tick, tickT: 0, dmg: s.dmg, evo: !!s.still, seed: this.rng() * 6.28 });
    }
    updateZones(dt) {
      for (const z of this.zones) {
        z.t += dt;
        if (z.t >= z.life) continue;
        z.tickT -= dt;
        if (z.tickT > 0) continue;
        z.tickT = z.tick;
        this.grid.query(z.x, z.y, z.r + 16, this._q);
        for (const e of this._q) {
          if (!e.alive) continue;
          const rr = z.r + e.r;
          if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 < rr * rr) this.damageEnemy(e, z.dmg, { dot: true });
        }
      }
      if (this.zones.length && this.frame % 10 === 0) this.zones = this.zones.filter((z) => z.t < z.life);
    }

    // use = runtime behaviour (RS.skillUse), id = the move itself (its own ball look and 메시's variants).
    fire(use, s, evo, id) {
      const p = this.player, st = this.stats;
      const def = RS.SKILLS[id || use];
      const ball = (n, e) => def.proj ? def.proj[evo ? 1 : 0] : evo ? e : n;
      // an evolved 발롱도르 move (def.trophy): the first ballonCount balls of each volley are trophies
      const nTro = evo && def.trophy ? RS.ballonCount(this.build) : 0;
      // 메시's balls are played by a teammate (World.passOrigin); 날두 kicks himself
      const po = def.passer ? this.passOrigin(def.passer) : null, pz = po && po.mate;
      const ox = po ? po.x : p.x, oy = po ? po.y : p.y;
      const dmg = s.dmg * (po && po.own ? RS.PASSER_BONUS : 1);
      const kicked = (a) => {
        const f = Math.abs(Math.cos(a)) > 0.2 ? (Math.cos(a) > 0 ? 1 : -1) : 0;
        if (pz) { pz.kickT = 0.25; if (f) pz.face = f; } else if (!po) { p.kickT = 0.2; if (f) p.face = f; }
      };
      switch (use) {
        case 'missile': { // 유도 대포알: cannon balls that turn after the toughest men nearby and explode at the first hit
          const tg = this.nearestEnemies(6, 260, this._tg || (this._tg = []));
          if (!tg.length) return false;
          const sorted = tg.slice().sort((a, b) => b.hp - a.hp);
          for (let i = 0; i < s.count; i++) {
            const e = sorted[i % sorted.length];
            const a = Math.atan2(e.y - oy, e.x - ox) + (i % 2 ? 0.5 : -0.5) * Math.min(1, i);
            this.spawnProj(i < nTro ? 'ballon' : evo ? 'golden' : 'cannon', ox, oy, a, s.speed * st.projSpeed,
              { dmg, pierce: s.pierce, r: s.r, life: 2.2, home: 4.5, target: e, knock: 60, boom: s.boom, boomDmg: s.boomDmg, gold: !!s.gold });
            if (i === 0) kicked(a);
          }
          this.emit('sfx', { name: 'shoot' });
          return true;
        }
        case 'airraid': { // 공중 지배: the header jump, then tornado rings rolling outward from the landing
          if (!this.nearestEnemies(1, 140, this._tg || (this._tg = [])).length) return false;
          p.jump = 0.35;
          const R = s.radius * st.area;
          this.later(0.35, () => {
            this.shock(p.x, p.y, R, s.dmg, { knock: 90, color: '#ffe08a' });
            this.emit('sfx', { name: 'thud' });
            this.pfx('boomSmall', p.x, p.y + 6, { palette: RS.PFX_WHITE, o: { r: Math.round(R * 1.1), n: 16 } });
            const x = p.x, y = p.y;
            for (let i = 1; i <= s.rings; i++) this.later(0.15 * i, () => {
              const r = R * (0.8 + 0.35 * i);
              this.shock(x, y, r, s.dmg * 0.6, { knock: 60, stun: s.stun * st.dur, silentFx: true });
              this.addFx('swing', x, y, { r, dur: 0.3, gold: evo });
              if (i === 1) this.emit('sfx', { name: 'swish' });
            });
          });
          return true;
        }
        case 'blitz': { // 환상 난무 / 마라도나 모드: a zigzag through `count` enemies, untouchable meanwhile
          const tg = this.nearestEnemies(s.count, s.range * st.area, this._al || (this._al = [])).slice();
          if (tg.length < 2) return false;
          const ZIG = 0.07;
          p.iframe = Math.max(p.iframe, tg.length * ZIG); // untouchable only while the afterimage runs
          let x0 = p.x, y0 = p.y;
          tg.forEach((e, i) => {
            const fx = x0, fy = y0;
            x0 = e.x; y0 = e.y;
            this.later(i * ZIG, () => {
              const x = e.alive ? e.x : x0, y = e.alive ? e.y : y0;
              this.addFx('zip', x, y, { dur: 0.32, x0: fx, y0: fy, alien: evo });
              this.addFx('ghost', x, y, { dur: 0.35, face: x >= fx ? 1 : -1 });
              if (e.alive) this.damageEnemy(e, s.dmg, { knock: 50, kx: x >= fx ? 1 : -1, ky: 0, stun: s.stun * st.dur });
              if (i % 2 === 0) this.emit('sfx', { name: 'zip' });
            });
          });
          this.addFx('martial', p.x, p.y, { dur: 0.8, ch: id === 'maradona' ? '🇦🇷' : '7', n: 1, follow: true });
          return true;
        }
        case 'inferno': { // 지옥의 함성: the SIUU ring, then a ring of fire where the crowd was thrown
          if (!this.nearestEnemies(1, s.radius * st.area, this._tg || (this._tg = [])).length) return false;
          const R = s.radius * st.area;
          this.rings.push({ x: p.x, y: p.y, r: 0, maxR: R, t: 0, dur: 0.45, dmg: s.dmg, stun: s.stun * st.dur, knock: s.knock, hits: new Set(), evo, shout: true });
          if (s.heal) p.hp = Math.min(st.maxHp, p.hp + s.heal);
          const x = p.x, y = p.y, n = s.zones;
          this.later(0.4, () => {
            for (let i = 0; i < n; i++) {
              const a = i / n * TAU;
              if (this.zones.length >= 90) this.zones.shift();
              this.zones.push({ x: x + Math.cos(a) * R * 0.7, y: y + Math.sin(a) * R * 0.7, r: s.zr * st.area, t: 0, life: s.life * st.dur, tick: s.tick, tickT: 0, dmg: s.zdmg, evo, seed: this.rng() * 6.28 });
            }
          });
          this.emit('sfx', { name: 'siu' }); this.emit('shout');
          this.pfx('goldBurst', p.x, p.y, { follow: p, dy: 8, palette: RS.PFX_FIRE });
          return true;
        }
        case 'meteor': { // CR7 궁극기 / GOAT 모드: golden meteors on up to `count` enemies, one after another
          const tg = this.nearestEnemies(s.count, s.range * st.area, this._mt || (this._mt = [])).slice();
          if (!tg.length) return false;
          const R = s.radius * st.area;
          tg.forEach((e, i) => {
            const x = e.x, y = e.y, delay = 0.35 + i * 0.07;
            this.addFx('meteor', x, y, { dur: delay, ballon: i < nTro });
            this.later(delay, () => {
              this.shock(x, y, R, s.dmg, { knock: 80, stun: s.stun * st.dur, color: '#ffd84a' });
              if (i % 3 === 0) { this.emit('sfx', { name: 'thud' }); this.pfx('boomSmall', x, y + 3, { palette: RS.PFX_GOLD }); }
            });
          });
          this.emit('sfx', { name: 'curl' });
          return true;
        }
        case 'rabona': { // curling boomerangs: out to `range`, then home to 날두 (piercing both ways)
          const tg = this.nearestEnemies(s.count, 220, this._tg || (this._tg = []));
          if (!tg.length) return false;
          for (let i = 0; i < s.count; i++) {
            const e = tg[i % tg.length];
            const a = evo ? this.t * 1.7 + i * TAU / s.count : Math.atan2(e.y - p.y, e.x - p.x) + (i >= tg.length ? (i - tg.length + 1) * 0.5 : 0);
            this.spawnProj(evo ? 'rabona2' : 'rabona', p.x, p.y, a, s.speed * st.projSpeed,
              { dmg: s.dmg, pierce: 999, r: s.r, life: 5, boomer: s.range * st.area, curve: (i % 2 ? -1 : 1) * 1.6, knock: 40 });
          }
          p.kickT = 0.2;
          this.emit('sfx', { name: 'curl' });
          return true;
        }
        case 'kick': {
          const tg = this.nearestEnemies(s.count, 220, this._tg || (this._tg = []));
          if (!tg.length) return false;
          for (let i = 0; i < s.count; i++) {
            const e = tg[i % tg.length];
            const spread = i >= tg.length ? (i - tg.length + 1) * 0.25 * (i % 2 ? 1 : -1) : 0;
            const a = Math.atan2(e.y - oy, e.x - ox) + spread;
            this.spawnProj(i < nTro ? 'ballon' : ball('ball', 'golden'), ox, oy, a, s.speed * st.projSpeed, { dmg, pierce: s.pierce, bounce: s.bounce, r: s.r, life: 1.5 });
            if (i === 0) kicked(a);
          }
          this.emit('sfx', { name: 'kick' });
          return true;
        }
        case 'knuckle': {
          const tg = this.nearestEnemies(3, 260, this._tg || (this._tg = []));
          if (!tg.length) return false;
          const e = tg[Math.floor(this.rng() * tg.length)];
          const base = Math.atan2(e.y - oy, e.x - ox);
          for (let i = 0; i < s.count; i++) {
            const a = base + (i - (s.count - 1) / 2) * 0.16;
            this.spawnProj(ball('knuckle', 'cannon'), ox, oy, a, s.speed * st.projSpeed, { dmg, pierce: s.pierce, r: s.r, life: 1.6, wobble: evo || def.straight ? 0 : 1, knock: evo ? 60 : 30 });
          }
          if (pz) kicked(base);
          if (id === 'penaldo') { kicked(base); this.penaldoShot(ox, oy, base); }
          this.emit('sfx', { name: 'shoot' });
          return true;
        }
        case 'header': {
          if (!this.nearestEnemies(1, 120, this._tg || (this._tg = [])).length) return false;
          p.jump = 0.35;
          const R = s.radius * st.area;
          this.later(0.35, () => {
            this.shock(p.x, p.y, R, s.dmg, { knock: 80, color: '#ffe08a' });
            this.emit('sfx', { name: 'thud' });
            if (s.double) this.later(0.22, () => this.shock(p.x, p.y, R * 1.4, s.dmg * 0.7, { knock: 120, color: '#ffb84d' }));
          });
          return true;
        }
        case 'bicycle': {
          if (!this.nearestEnemies(1, s.radius * st.area + 30, this._tg || (this._tg = [])).length) return false;
          const R = s.radius * st.area;
          this.shock(p.x, p.y, R, s.dmg, { knock: 70, silentFx: true, stun: s.stun || 0 });
          this.addFx('swing', p.x, p.y, { r: R, dur: 0.35, follow: true, gold: id === 'elastico' });
          this.emit('sfx', { name: 'swish' });
          return true;
        }
        case 'scissors': {
          if (!this.enemies.length) return false;
          const b = Math.atan2(p.diry, p.dirx);
          const q = Math.PI / 4;
          const angs = [b - q, b + q];
          if (s.dirs >= 4) angs.push(b + Math.PI - q, b + Math.PI + q);
          if (s.dirs >= 6) angs.push(b - Math.PI / 2, b + Math.PI / 2);
          if (s.dirs >= 8) angs.push(b, b + Math.PI);
          for (let i = 0; i < angs.length; i++) {
            this.spawnProj(evo ? 'scissor2' : 'scissor', p.x, p.y, angs[i], s.speed * st.projSpeed,
              { dmg: s.dmg, pierce: s.pierce, r: s.r, life: 1.3, curve: (i % 2 ? -1 : 1) * 0.9, critBonus: s.critBonus || 0 });
          }
          this.emit('sfx', { name: 'kick' });
          return true;
        }
        case 'siuu': {
          if (!this.nearestEnemies(1, s.radius * st.area, this._tg || (this._tg = [])).length) return false;
          this.rings.push({ x: p.x, y: p.y, r: 0, maxR: s.radius * st.area, t: 0, dur: 0.45, dmg: s.dmg,
            stun: s.stun * st.dur, knock: s.knock || 30, hits: new Set(), evo, shout: id !== 'bobo' });
          if (s.heal) p.hp = Math.min(st.maxHp, p.hp + s.heal);
          if (id === 'bobo') { // 메시: a glare and one line, not a SIUU
            this.addFx('martial', p.x, p.y, { dur: 0.8, ch: evo ? '저리 가!' : '뭘 봐?', n: 1, follow: true });
            this.emit('sfx', { name: 'bobo' });
          } else { this.emit('sfx', { name: 'siu' }); this.emit('shout'); if (evo) this.pfx('goldBurst', p.x, p.y, { follow: p, dy: 8 }); }
          return true;
        }
        case 'curler': { // 감아차기: leaves wide of the target and bends back in on it (homing)
          const tg = this.nearestEnemies(s.count, 240, this._tg || (this._tg = []));
          if (!tg.length) return false;
          for (let i = 0; i < s.count; i++) {
            const e = tg[i % tg.length];
            const a = Math.atan2(e.y - oy, e.x - ox) + (i % 2 ? -0.9 : 0.9);
            this.spawnProj(ball('curler', 'golden'), ox, oy, a, s.speed * st.projSpeed,
              { dmg, pierce: s.pierce, r: s.r, life: 1.8, home: s.home, target: e, critBonus: s.critBonus || 0, knock: 30 });
            if (i === 0) kicked(a + (i % 2 ? 0.9 : -0.9));
          }
          this.emit('sfx', { name: 'curl' });
          return true;
        }
        case 'chip': { // 로빙 패스: lobbed over the crowd onto the toughest enemies in range (the boss first)
          const tg = this.nearestEnemies(8, 230, this._mt || (this._mt = []));
          if (!tg.length) return false;
          const R = s.radius * st.area;
          tg.slice().sort((a, b) => b.hp - a.hp).slice(0, s.count).forEach((e, i) => {
            const x = e.x, y = e.y, delay = 0.45 + i * 0.12;
            this.addFx('lob', x, y, { dur: delay, white: !evo, x0: ox, y0: oy, ballon: i < nTro });
            this.later(delay, () => { this.shock(x, y, R, dmg, { knock: 60, color: evo ? '#ffd84a' : '#ffffff' }); this.emit('sfx', { name: 'thud' }); });
            if (i === 0) kicked(Math.atan2(y - oy, x - ox));
          });
          this.emit('sfx', { name: 'curl' });
          return true;
        }
        case 'hand': { // 신의 손: a giant hand slams the thickest crowd (the boss first), `count` times in a row
          const R = s.radius * st.area;
          if (!this.crowdTarget(210, R)) return false;
          // 심판매수 (round 19): no palm — a bribed referee drops in under a shower of banknotes, raises a giant red
          // card and the spot blows up in red (Renderer 'referee', 'redcards')
          const ref = id === 'bribe';
          if (ref) this.cupDebut(id);
          for (let i = 0; i < s.count; i++) {
            this.later(i * HAND_GAP, () => {
              const e = this.crowdTarget(210, R);
              const x = e ? e.x : p.x + p.face * 30, y = e ? e.y : p.y;
              this.addFx(ref ? 'referee' : 'hand', x, y, { dur: HAND_T + (ref ? 1.0 : 0.4), hit: HAND_T, r: R, evo });
              this.later(HAND_T, () => {
                this.shock(x, y, R, s.dmg, { knock: 120, stun: s.stun * st.dur, silentFx: true });
                this.pfx('boomSmall', x, y + 4, { palette: ref ? RS.PFX_RED : RS.PFX_WHITE, o: { r: Math.round(R * 1.2), n: 18 } });
                if (ref) {
                  this.addFx('redcards', x, y, { dur: 0.9, r: R, seed: this.rng() * 6.28 });
                  this.pfx('firework', x, y + 6, { palette: RS.PFX_RED });
                  this.emit('sfx', { name: 'whistle' });
                }
                // the referee never saw it: cards and shots under the palm are swatted away too
                for (const ep of this.eprojs) if (ep.alive && (ep.x - x) ** 2 + (ep.y - y) ** 2 < R * R * 1.7) ep.alive = false;
                this.emit('shake', { k: 0.22 });
                this.emit('sfx', { name: 'hand' });
              });
            });
          }
          // round 11: the palm guards the first slam only (it covered every slam: 황금 신의 분노 was untouchable)
          if (s.guard) p.iframe = Math.max(p.iframe, Math.min(RS.GUARD_MAX, s.guard));
          this.addFx('martial', p.x, p.y, { dur: 0.9, ch: def.shout || '신의 손!', n: 0, center: true, follow: true });
          this.emit('sfx', { name: 'drop' });
          return true;
        }
      }
      return false;
    }

    // The enemy with the most others around it (within r) among the ten nearest within `range` of 메시: a boss
    // counts triple and 준보스 / elites a bit more, so slams and drops go where they hurt. null = nobody in range.
    crowdTarget(range, r) {
      const tg = this.nearestEnemies(10, range, this._ct || (this._ct = []));
      let best = null, bs = -1;
      for (const e of tg) {
        this.grid.query(e.x, e.y, r, this._q2);
        let c = 0;
        for (const o of this._q2) if (o.alive && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < r * r) c++;
        if (e.boss) c = c * 3 + 6; else if (e.mini || e.elite) c += 3;
        if (c > bs) { bs = c; best = e; }
      }
      return best;
    }

    // 드리볼: `count` balls leave 메시's feet and chase the enemies around him (within `leash` × area), one touch
    // per ball every `touch` s — the ball pops back off the shin and goes for the next man; with nobody in reach
    // they juggle at his feet. this.dribs holds them for the renderer.
    updateDribball(ws, s, dt, swarm) {
      // 위성 군단 drives this with its own numbers: dcount hunting balls at dspeed
      if (swarm) Object.assign(s, { count: swarm.dcount, leash: swarm.leash, speed: swarm.dspeed, r: swarm.r, dmg: swarm.dmg, touch: swarm.touch, trip: swarm.trip });
      const p = this.player, st = this.stats, D = this.dribs;
      const leash = s.leash * st.area, spd = s.speed * st.projSpeed, br = s.r;
      while (D.length < s.count) D.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: 0, vy: 0, tg: null, cd: 0.2 * D.length, i: D.length, spin: 0, r: br });
      D.length = s.count;
      for (const b of D) {
        b.r = br;
        b.look = swarm ? 'gold' : RS.ballLookAt(this.build, 'dribball', b.i); // 위성 군단's trophies ride the ring
        b.cd -= dt;
        if (b.tg && (!b.tg.alive || !this.inSight(b.tg) || (b.tg.x - p.x) ** 2 + (b.tg.y - p.y) ** 2 > leash * leash)) b.tg = null;
        if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 > (leash + 30) ** 2) b.tg = null; // 메시 ran off: back to his feet
        else if (!b.tg && b.cd <= 0) b.tg = this.dribTarget(b, leash);
        let tx, ty;
        if (b.tg) { tx = b.tg.x; ty = b.tg.y; } else { const a = this.t * 5 + b.i * 2.1; tx = p.x + Math.cos(a) * 9; ty = p.y + 6 + Math.sin(a) * 3; }
        const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
        // the velocity turns toward the target, so the ball curves like a dribble instead of flying straight
        const k = Math.min(1, 9 * dt), want = b.tg ? spd : Math.min(spd * 1.3, d * 7);
        b.vx += (dx / d * want - b.vx) * k; b.vy += (dy / d * want - b.vy) * k;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.spin += Math.hypot(b.vx, b.vy) * dt;
        if (b.tg && b.cd <= 0) {
          const e = b.tg, rr = e.r + br + 1;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
            const n = Math.hypot(e.x - p.x, e.y - p.y) || 1;
            this.damageEnemy(e, s.dmg, { knock: 25, kx: (e.x - p.x) / n, ky: (e.y - p.y) / n, stun: s.trip || 0 });
            b.cd = s.touch * st.cd;
            b.vx *= -0.6; b.vy *= -0.6;
            b.tg = null;
            this.emit('sfx', { name: 'tap' });
          }
        }
      }
    }
    // Nearest enemy to the ball inside the leash, preferring one no other 드리볼 is already on.
    dribTarget(b, leash) {
      const p = this.player;
      this.grid.query(p.x, p.y, leash, this._q2);
      let best = null, bd = Infinity;
      for (const e of this._q2) {
        if (!e.alive || !this.inSight(e) || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > leash * leash) continue;
        let d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
        for (const o of this.dribs) if (o !== b && o.tg === e) d += 1e4;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    // 드롭볼: `count` balls circle 메시. Every cd (shared by the balls) one that has circled a while shoots up out
    // of sight, then crashes onto the thickest crowd near him like a meteor (a wide blast; evolved: it bursts into
    // `scatter` small balls) and is gone for `respawn` s before it pops back into the circle. this.drops: renderer.
    updateDropball(ws, s, dt) {
      const p = this.player, st = this.stats, B = this.drops, n = s.count, R = 20 * Math.sqrt(st.area);
      while (B.length < n) B.push({ st: 'orbit', t: 0.4, x: p.x, y: p.y, px: p.x, py: p.y, h: 6, tx: 0, ty: 0, tg: null, i: B.length });
      B.length = n;
      ws.angle = (ws.angle || 0) + dt * 2.6;
      ws.timer -= dt;
      if (ws.timer <= 0) {
        const b = B.find((x) => x.st === 'orbit' && x.t >= 0.6);
        const e = b && this.crowdTarget(200, s.radius * st.area);
        if (e) { b.st = 'rise'; b.t = 0; b.tg = e; b.tx = e.x; b.ty = e.y; ws.timer = s.cd * st.cd / n; this.emit('sfx', { name: 'drop' }); }
        else ws.timer = 0.2;
      }
      for (const b of B) {
        b.t += dt;
        b.look = RS.ballLookAt(this.build, 'dropball', b.i);
        if (b.st === 'orbit') {
          const a = ws.angle + b.i * TAU / n;
          b.x = p.x + Math.cos(a) * R; b.y = p.y + Math.sin(a) * R * 0.8; b.h = 7 + Math.sin(this.t * 6 + b.i * 2) * 2;
        } else if (b.st === 'rise') {
          b.h += (120 + 900 * b.t) * dt;
          // the drop follows its man until it falls — while he is on screen (round 12), else it lands where he was
          // last seen; a boss it follows anywhere
          if (b.tg && (!b.tg.alive || !this.inSight(b.tg))) b.tg = null;
          if (b.tg) { b.tx = b.tg.x; b.ty = b.tg.y; }
          if (b.t >= DROP_RISE) { b.st = 'fall'; b.t = 0; b.x = b.px = b.tx; b.y = b.py = b.ty; b.h = DROP_H; }
        } else if (b.st === 'fall') {
          const k = Math.min(1, b.t / DROP_FALL);
          b.h = DROP_H * (1 - k * k);
          if (k >= 1) {
            const Rb = s.radius * st.area, evo = !!s.scatter;
            this.shock(b.x, b.y, Rb, s.dmg, { knock: 90, silentFx: true });
            this.addFx('impact', b.x, b.y, { r: Rb, dur: 0.55, gold: evo });
            this.pfx('boomSmall', b.x, b.y + 3, evo ? { palette: RS.PFX_GOLD } : null);
            this.addFx('crater', b.x, b.y, { r: Rb * 0.75, dur: 1.6 });
            for (let i = 0; i < 6; i++) this.addFx('dust', b.x, b.y, { dur: 0.45, vx: Math.cos(i * 1.05) * Rb * 0.8, vy: Math.sin(i * 1.05) * Rb * 0.5 - 6 });
            if (s.scatter) for (let i = 0; i < s.scatter; i++) {
              this.spawnProj('golden', b.x, b.y, i * TAU / s.scatter + this.rng() * 0.4, 190 * st.projSpeed, { dmg: s.dmg * 0.35, pierce: 2, r: 3, life: 0.6, knock: 30 });
            }
            this.emit('shake', { k: 0.12 });
            this.emit('sfx', { name: 'impact' });
            b.st = 'gone'; b.t = 0; b.tg = null;
          }
        } else if (b.st === 'gone' && b.t >= s.respawn) {
          b.st = 'orbit'; b.t = 0;
          const a = ws.angle + b.i * TAU / n;
          b.x = b.px = p.x + Math.cos(a) * R; b.y = b.py = p.y + Math.sin(a) * R * 0.8;
          this.addFx('pop', b.x, b.y, { dur: 0.3 });
        }
      }
    }

    // 스텝오버 / 솔로 드리블 (round 11, now a weapon on its own): when an enemy comes within STEP_REACH the hero
    // slips through him — the dash runs at the nearest man and past him, untouchable, hitting all it crosses.
    updateStepover(ws, s, evo, dt, id) {
      const p = this.player, shout = id && RS.SKILLS[id] && RS.SKILLS[id].shout;
      ws.timer -= dt;
      if (shout) ws.say = Math.max(0, (ws.say || 0) - dt);
      if (ws.timer > 0 || p.dash) return;
      this.grid.query(p.x, p.y, STEP_REACH + 12, this._q);
      let threat = null, bd = 1e9;
      for (const e of this._q) {
        if (!e.alive) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        const rr = e.r + p.r + STEP_REACH;
        if (d < rr * rr && d < bd) { bd = d; threat = e; }
      }
      if (!threat) return;
      let dx = threat.x - p.x, dy = threat.y - p.y;
      const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      const dur = 0.16;
      // every grade leaves the afterimage burst where the dash began (the evolved 전설 form a bigger one)
      const cup = id === 'hollywood'; // 명품 헐리웃: the dive and its landing (World.hollywoodLand)
      if (cup) this.cupDebut(id);
      p.dash = { dx, dy, t: 0, dur, speed: s.dist / dur, dmg: s.dmg, hits: new Set(), burst: s.burst || STEP_BURST, sx: p.x, sy: p.y, cup };
      p.iframe = Math.max(p.iframe, dur + 0.04);
      ws.timer = s.cd * this.stats.cd;
      // 명품 헐리웃 (round 15): the dive says its name now and then, not on every dash
      if (shout && !ws.say) { ws.say = 3; this.addFx('martial', p.x, p.y, { dur: 0.8, ch: shout, n: 0, center: true, follow: true }); }
      this.emit('sfx', { name: 'dash' });
    }

    shock(x, y, R, dmg, o) {
      o = o || {};
      this.grid.query(x, y, R + 20, this._q);
      for (const e of this._q) {
        if (!e.alive) continue;
        const rr = R + e.r;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy > rr * rr) continue;
        const d = Math.hypot(dx, dy) || 1;
        this.damageEnemy(e, dmg, { knock: o.knock || 0, kx: dx / d, ky: dy / d, stun: o.stun || 0, team: o.team });
      }
      if (!o.silentFx) this.addFx('shock', x, y, { r: R, dur: 0.3, color: o.color || '#ffffff' });
    }

    spawnProj(kind, x, y, a, speed, o) {
      const pr = this.projPool.pop() || { hits: new Set() };
      pr.kind = kind; pr.x = pr.px = x; pr.y = pr.py = y; pr.vx = Math.cos(a) * speed; pr.vy = Math.sin(a) * speed;
      pr.speed = speed; pr.r = o.r || 3; pr.dmg = o.dmg || 1; pr.pierce = o.pierce || 0; pr.bounce = o.bounce || 0;
      pr.life = o.life || 1.5; pr.t = 0; pr.curve = o.curve || 0; pr.wobble = o.wobble || 0; pr.knock = o.knock || 25;
      pr.critBonus = o.critBonus || 0; pr.team = !!o.team; pr.alive = true; pr.target = o.target || null;
      pr.boomer = o.boomer || 0; pr.back = false; pr.trav = 0; pr.home = o.home || 0;
      pr.boom = o.boom || 0; pr.boomDmg = o.boomDmg || 0; pr.gold = !!o.gold; // 유도 대포알: explodes at its first hit
      pr.fxn = 0; // hit sparks drawn so far (패널두)
      pr.hits.clear();
      this.projs.push(pr);
      return pr;
    }

    updateProjs(dt) {
      const p = this.player;
      for (const pr of this.projs) {
        if (!pr.alive) continue;
        pr.t += dt;
        if (pr.kind === 'pass') { // midfielder pass flying to 날두
          const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy);
          if (d < 8 || pr.t > 1.2) { pr.alive = false; this.mateShot(pr.dmg, pr.pierce); continue; }
          pr.x += dx / d * 260 * dt; pr.y += dy / d * 260 * dt;
          continue;
        }
        if (pr.boomer) { // 라보나: curls out, then flies home; enemies on the way back are hit again
          if (!pr.back) {
            pr.trav += pr.speed * dt;
            if (pr.trav >= pr.boomer) { pr.back = true; pr.curve = 0; pr.hits.clear(); }
          } else {
            const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy) || 1;
            if (d < 10) { pr.alive = false; continue; }
            pr.vx = dx / d * pr.speed * 1.15; pr.vy = dy / d * pr.speed * 1.15;
          }
        }
        if (pr.curve) {
          const c = Math.cos(pr.curve * dt), s = Math.sin(pr.curve * dt);
          const vx = pr.vx * c - pr.vy * s; pr.vy = pr.vx * s + pr.vy * c; pr.vx = vx;
        }
        if (pr.home) { // 감아차기: turns toward its target at `home` rad/s; a fallen target is replaced
          if (!pr.target || !pr.target.alive || !this.inSight(pr.target)) pr.target = this.nearestFrom(pr.x, pr.y, 200, pr.hits);
          const tg = pr.target;
          if (tg) {
            const cur = Math.atan2(pr.vy, pr.vx);
            let d = Math.atan2(tg.y - pr.y, tg.x - pr.x) - cur;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            const a = cur + Math.max(-pr.home * dt, Math.min(pr.home * dt, d));
            pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed;
          }
        }
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (pr.wobble) { const w = Math.sin(pr.t * 28) * 40 * dt; const n = pr.speed || 1; pr.x += -pr.vy / n * w; pr.y += pr.vx / n * w; }
        pr.life -= dt;
        if (pr.life <= 0) { pr.alive = false; continue; }
        this.grid.query(pr.x, pr.y, pr.r + 20, this._q);
        for (const e of this._q) {
          if (!e.alive || pr.hits.has(e.uid)) continue;
          const rr = e.r + pr.r;
          if ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 > rr * rr) continue;
          pr.hits.add(e.uid);
          const n = Math.hypot(pr.vx, pr.vy) || 1;
          this.damageEnemy(e, pr.dmg, { knock: pr.knock, kx: pr.vx / n, ky: pr.vy / n, critBonus: pr.critBonus, team: pr.team });
          if (pr.kind === 'cannon') this.addFx('spark', e.x, e.y, { dur: 0.2 });
          if (pr.kind === 'pcannon' && pr.fxn++ < 4) this.pfx('hitSpark', e.x, e.y, { angle: Math.atan2(pr.vy, pr.vx), palette: RS.PFX_SIUUU }); // the 11m cannon tearing through
          if (pr.boom) { // one explosion per ball, at the first man it hits
            const R = pr.boom * this.stats.area;
            this.shock(e.x, e.y, R, pr.boomDmg, { knock: 70, color: pr.gold ? '#ffd84a' : '#ff8a3a' });
            this.addFx('impact', e.x, e.y, { r: R, dur: 0.5, gold: pr.gold });
            this.pfx('boomSmall', e.x, e.y + 3, pr.gold ? { palette: RS.PFX_GOLD } : null);
            this.emit('sfx', { name: 'thud' });
            pr.boom = 0;
          }
          if (pr.pierce > 0) { pr.pierce--; continue; }
          if (pr.bounce > 0) {
            pr.bounce--;
            const nx = this.nearestFrom(pr.x, pr.y, 140, pr.hits);
            if (nx) {
              const a = Math.atan2(nx.y - pr.y, nx.x - pr.x);
              pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed; pr.life = Math.max(pr.life, 0.8);
              continue;
            }
          }
          pr.alive = false;
          break;
        }
      }
    }

    updateRings(dt) {
      for (const r of this.rings) {
        r.t += dt;
        r.r = r.maxR * Math.min(1, r.t / r.dur);
        this.grid.query(r.x, r.y, r.r + 20, this._q);
        for (const e of this._q) {
          if (!e.alive || r.hits.has(e.uid)) continue;
          const dx = e.x - r.x, dy = e.y - r.y;
          const rr = r.r + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          r.hits.add(e.uid);
          const d = Math.hypot(dx, dy) || 1;
          this.damageEnemy(e, r.dmg, { stun: r.stun, knock: r.knock, kx: dx / d, ky: dy / d });
        }
      }
      for (let i = this.rings.length - 1; i >= 0; i--) if (this.rings[i].t >= this.rings[i].dur + 0.15) this.rings.splice(i, 1);
    }

    damageEnemy(e, base, o) {
      if (!e.alive) return 0;
      o = o || {};
      if (e.invuln) { this.addText(e.x, e.y - e.r, 0, false); return 0; }
      if (this.build.relics.adrenaline && this.player.hp < this.stats.maxHp * 0.5) base *= 1.6; // 아드레날린
      const res = RS.calcDamage(base, this.stats, { team: o.team, boss: e.boss, critBonus: o.critBonus }, this.rng());
      e.hp -= res.dmg;
      this.dmgDealt += res.dmg;
      if (e.boss) { if (!e.bossDmgIn) e.firstHitT = this.t; e.bossDmgIn += res.dmg; }
      if (e.flash <= -0.06) e.flash = 0.06; // flicker, never stuck white under constant fire
      // poise (RS.WALL): later seasons' crowds shrug off part of the knockback and stun
      if (o.knock) {
        const k = (e.boss ? o.knock * 0.15 : e.mini ? o.knock * 0.3 : e.elite ? o.knock * 0.4 : o.knock) * this.tune.poise;
        e.kx += (o.kx || 0) * k; e.ky += (o.ky || 0) * k;
      }
      if (o.stun && !e.boss) { // bosses are stun-immune
        const was = e.stun;
        e.stun = Math.max(e.stun, o.stun * (e.elite || e.mini ? 0.5 : 1) * this.tune.poise);
        if ((e.mini || e.elite) && was <= 0 && e.stun >= 0.6) this.pfx('stunStars', e.x, e.y, { follow: e, life: e.stun, dy: -e.r });
      }
      // damage numbers only on the big ones (bosses, 준보스, elites), at most one every RS.NUM_GAP s per target with
      // the hits in between summed into it — the crowd's hits show the spark only (round 11: a readable screen)
      if (e.boss || e.mini || e.elite) {
        e.numAcc += res.dmg; e.numCrit = e.numCrit || res.crit;
        if (this.t - e.numT >= RS.NUM_GAP) { this.addText(e.x, e.y - e.r, e.numAcc, e.numCrit); e.numAcc = 0; e.numCrit = false; e.numT = this.t; }
      }
      // impact spark: a few shards flying away from the hit direction (crits bigger and golden); burns stay quiet
      if (!o.dot && this.fx.length < 70) this.addFx('hit', e.x, e.y - 2, { dur: res.crit ? 0.3 : 0.2, kx: o.kx || 0, ky: o.ky || 0, crit: res.crit, seed: this.rng() * 6.28 });
      if (res.crit && !o.dot) {
        this.emit('sfx', { name: 'crit' });
        if (e.boss) { this.emit('shake', { k: 0.08 }); this.emit('hitstop', { t: RS.HIT_STOP.crit }); }
        if (e.boss || e.mini || e.elite) this.pfx('hitSpark', e.x, e.y - 2, { angle: Math.atan2(o.ky || 0, o.kx || 1) });
      }
      if (e.hp <= 0) this.killEnemy(e);
      return res.dmg;
    }

    killEnemy(e) {
      e.alive = false;
      this.kills++;
      const xpv = Math.max(1, Math.round(e.xp * this.tune.xpMul * RS.CROWD.value));
      if (e.rival) { // 클라시코 win: the season goes on; a chest and coins where he fell
        this.rival = null; this.rivalResult = 'win';
        this.addFx('boom', e.x, e.y, { r: 50, dur: 0.7 });
        this.pfx('smallExplosion', e.x, e.y + 4, { palette: RS.PFX_GOLD });
        this.emit('hitstop', { t: RS.HIT_STOP.rival });
        for (let i = 0; i < 8; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 40, e.y + (this.rng() - 0.5) * 40, 3);
        this.dropPickup('chest', e.x, e.y + 6, 1);
        this.emit('rivalEnd', { win: true, name: e.name });
        this.emit('siuu');
        return;
      }
      if (e.special) { // 토레쓰 beaten inside his window: the extra reward and his career (RS.finishYear)
        this.torres = null; this.boss = null; this.torresResult = 'win';
        this.addFx('boom', e.x, e.y, { r: 60, dur: 0.8 });
        this.pfx('bigExplosion', e.x, e.y + 6);
        this.emit('hitstop', { t: RS.HIT_STOP.boss });
        for (let i = 0; i < 12; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 50, e.y + (this.rng() - 0.5) * 50, 0);
        this.emit('torresEnd', { win: true, name: e.name });
        this.phase = 'clear';
        this.emit('clear');
        this.emit('siuu');
        return;
      }
      if (e.boss) {
        this.addFx('boom', e.x, e.y, { r: 60, dur: 0.8 });
        this.pfx('bigExplosion', e.x, e.y + 6);
        this.emit('hitstop', { t: RS.HIT_STOP.boss });
        // the season ends here, so the loot is banked directly instead of dropped (coins scale with the year)
        this.bossCoins = 30 + 6 * this.lvl;
        this.coinsPicked += this.bossCoins;
        for (let i = 0; i < 12; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 50, e.y + (this.rng() - 0.5) * 50, 0);
        if (RS.torresDue(this)) { // 드록빠 is down: the season is cleared and 토레쓰 runs on
          this.cleared = true; this.boss = null;
          this.emit('banner', { text: e.name + ' 격파! 시즌 클리어 — ⚡ ' + RS.TORRES.name + ' 난입!' });
          this.emit('siuu');
          this.later(1, () => this.spawnTorres());
          return;
        }
        if (this.yearDef.final) {
          this.phase = 'victory';
          this.emit('victory');
        } else if (this.yearDef.cine) { // round 14: the 캄프 누 goal is played out before the clear (World.startCine)
          this.startCine(this.yearDef.cine, e);
        } else {
          this.phase = 'clear';
          this.emit('clear');
        }
        this.emit('siuu');
        return;
      }
      if (this.pickups.length < 420) this.dropPickup('gem', e.x, e.y, xpv);
      else this.mergeGem(xpv);
      if (this.build.relics.bomb && this._boomBudget > 0) { // 폭발 슈팅: the fallen enemy blows up (chains)
        this._boomBudget--;
        const x = e.x, y = e.y, R = 26 * this.stats.area, dmg = 8 + 0.8 * this.build.level;
        this.later(0.08, () => this.shock(x, y, R, dmg, { knock: 60, color: '#ff8a3a' }));
      }
      if (this.build.relics.nutmeg && this._boomBudget > 0) { this._boomBudget--; this.nutmegChain(e.x, e.y); }
      if (e.elite) this.dropPickup('chest', e.x, e.y, 1);
      if (e.mini) { // 준보스 reward: coins, a heal, sometimes a chest
        for (let i = 0; i < 4; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 24, e.y + (this.rng() - 0.5) * 24, 2);
        this.dropPickup(this.rng() < 0.3 ? 'chest' : 'heal', e.x, e.y + 6, 1);
        this.addFx('boom', e.x, e.y, { r: 30, dur: 0.5 });
        this.pfx('boomSmall', e.x, e.y + 4);
        this.emit('miniKill', { name: e.name });
      } else if (e.elite || e.type === 'tank') this.pfx('sparkPop', e.x, e.y + 2);
      const r = this.rng(), hc = this.tune.healMul / 130; // heal drops: rarer on 하드, more on 이지 (RS.DIFFS)
      const cc = 0.035 * RS.CROWD.value; // fewer men, each worth more (round 12)
      if (r < cc) this.dropPickup('coin', e.x + 4, e.y, 1);
      else if (r < cc + hc) this.dropPickup('heal', e.x, e.y, 1);
      else if (r < cc + hc + 1 / 420) this.dropPickup('magnet', e.x, e.y, 1);
      this.addFx('poof', e.x, e.y, { dur: 0.3, big: e.elite || e.type === 'tank', seed: this.rng() * 6.28 });
      // the fallen man tips over and fades (drawn with his own sprite)
      if (!e.mini && this.fx.length < 120) this.addFx('down', e.x, e.y, { dur: 0.32, sprite: e.sprite, tier: e.tier, face: e.face, elite: e.elite });
      this.emit('sfx', { name: 'kill' });
    }

    mergeGem(v) {
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const g = this.pickups[i];
        if (g.kind === 'gem' && g.alive && !g.vac) { g.value += v; return; }
      }
    }

    dropPickup(kind, x, y, value) {
      this.pickups.push({ kind, x, y, value, vac: false, alive: true, vs: 0, bob: this.rng() * 6 });
    }

    // ------------------------------------------------------------ teammates
    spawnMateRuntime(m, x, y) {
      const def = RS.TEAMMATES[m.id];
      const slot = this.mates.length;
      this.mates.push({ id: m.id, ref: m, role: def.role, slot, x: x != null ? x : this.player.x - 12 - slot * 6,
        y: y != null ? y : this.player.y + 10, timer: 1 + slot * 0.4, angle: slot * 1.3, dash: null, face: 1, punch: 0, anim: 0 });
    }

    updateMates(dt) {
      const p = this.player, st = this.stats;
      for (const m of this.mates) {
        // lv: damage keeps growing to MATE_MAX_LV; lg: reach, speed and size stop at Lv.5; mm: the player's OVR
        const lv = m.ref.lv, lg = Math.min(lv, 5), mm = RS.mateMul(m.id, this.youth);
        m.anim += dt;
        m.kickT = Math.max(0, (m.kickT || 0) - dt);
        const ox = Math.cos(m.slot * 2.1 + 2.4) * 22, oy = Math.sin(m.slot * 2.1 + 2.4) * 16 + 4;
        const follow = (k) => {
          const tx = p.x + ox, ty = p.y + oy;
          const dx = tx - m.x, dy = ty - m.y;
          m.x += dx * Math.min(1, k * dt); m.y += dy * Math.min(1, k * dt);
          if (Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
        };
        if (m.role === 'defender') {
          m.angle += (2.2 + 0.25 * lg) * dt;
          const R = 26 + 2 * lg;
          m.x = p.x + Math.cos(m.angle) * R; m.y = p.y + Math.sin(m.angle) * R;
          m.face = Math.cos(m.angle + Math.PI / 2) > 0 ? 1 : -1;
          this.grid.query(m.x, m.y, 24, this._q);
          for (const e of this._q) {
            if (!e.alive || this.t - e.dHit < 0.45) continue;
            const rr = e.r + 7 + lg;
            if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > rr * rr) continue;
            e.dHit = this.t;
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            this.damageEnemy(e, (6 + 4 * lv) * mm, { team: true, knock: 110 + 15 * lg, kx: dx / d, ky: dy / d });
          }
        } else if (m.role === 'keeper') {
          follow(6);
          // one save per cooldown: a keeper helps, but cannot make 날두 untouchable
          const R = RS.keeperRadius(lv);
          m.blockCd = Math.max(0, (m.blockCd || 0) - dt);
          if (m.blockCd <= 0) for (const ep of this.eprojs) {
            if (!ep.alive || ep.wait > 0 || ep.kind === 'mball' || ep.power) continue; // nobody saves 메시's shots or a 강슛
            if ((ep.x - m.x) ** 2 + (ep.y - m.y) ** 2 < R * R) {
              ep.alive = false;
              this.addFx('save', ep.x, ep.y, { dur: 0.3 });
              m.punch = 0.2;
              m.blockCd = Math.max(0.9, 2.0 - 0.25 * lv) * st.teamCd;
              this.saves++;
              break;
            }
          }
          m.timer -= dt;
          m.punch = Math.max(0, m.punch - dt);
          if (m.timer <= 0) {
            m.timer = Math.max(0.8, 2 - 0.2 * lv) * st.teamCd;
            const e = this.nearestFrom(m.x, m.y, 44);
            if (e) {
              const dx = e.x - m.x, dy = e.y - m.y, d = Math.hypot(dx, dy) || 1;
              this.damageEnemy(e, (10 + 6 * lv) * mm, { team: true, knock: 140, kx: dx / d, ky: dy / d });
              m.punch = 0.2;
            }
          }
        } else if (m.role === 'winger') {
          if (m.dash) {
            const d = m.dash;
            d.t += dt;
            m.x += d.dx * 330 * dt; m.y += d.dy * 330 * dt;
            this.grid.query(m.x, m.y, 30, this._q);
            for (const e of this._q) {
              if (!e.alive || d.hits.has(e.uid)) continue;
              const rr = e.r + 9;
              if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > rr * rr) continue;
              d.hits.add(e.uid);
              this.damageEnemy(e, (10 + 7 * lv) * mm, { team: true, knock: 60, kx: -d.dy, ky: d.dx });
            }
            if (Math.floor(d.t * 60) % 3 === 0) this.addFx('mghost', m.x, m.y, { dur: 0.2, id: m.id, face: m.face });
            if (d.t >= d.dur) m.dash = null;
          } else {
            follow(5);
            m.timer -= dt;
            if (m.timer <= 0) {
              const e = this.nearestFrom(p.x, p.y, 150);
              m.timer = e ? Math.max(1.4, 4.2 - 0.55 * lv) * st.teamCd : 0.5;
              if (e) {
                const dx = e.x - m.x, dy = e.y - m.y, d = Math.hypot(dx, dy) || 1;
                m.dash = { dx: dx / d, dy: dy / d, t: 0, dur: (140 + 20 * lg) / 330, hits: new Set() };
                m.face = dx > 0 ? 1 : -1;
              }
            }
          }
        } else if (m.role === 'mid') {
          follow(5);
          m.timer -= dt;
          if (m.timer <= 0) {
            const has = this.nearestEnemies(1, 220, this._tg2 || (this._tg2 = [])).length;
            m.timer = has ? Math.max(1.4, 4 - 0.5 * lv) * st.teamCd : 0.5;
            if (has) {
              const pr = this.spawnProj('pass', m.x, m.y, 0, 260, { dmg: (24 + 12 * lv) * mm, pierce: 2 + Math.floor(lg / 2), r: 3, life: 2 });
              pr.team = true;
              m.kickT = 0.25; m.face = p.x > m.x ? 1 : -1;
            }
          }
        } else if (m.role === 'striker') {
          follow(5);
          m.timer -= dt;
          if (m.timer <= 0) {
            const e = this.nearestFrom(m.x, m.y, 200);
            m.timer = e ? Math.max(0.55, 1.4 - 0.16 * lv) * st.teamCd : 0.4;
            if (e) {
              const n = 1 + (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0);
              const base = Math.atan2(e.y - m.y, e.x - m.x);
              for (let i = 0; i < n; i++) {
                this.spawnProj('mateball', m.x, m.y, base + (i - (n - 1) / 2) * 0.18, 250, { dmg: (8 + 4 * lv) * mm, r: 3, life: 1.2, team: true });
              }
              m.face = e.x > m.x ? 1 : -1;
              m.kickT = 0.2;
            }
          }
        }
      }
    }

    // Where a 메시 pass (RS.SKILLS[id].passer) is played from: that move's own passer (챠비 / 니에미스타) when he is
    // one of the starting two (own: his pass hits RS.PASSER_BONUS harder), else the other starter; with nobody on
    // the pitch the ball comes long from just off the screen behind 메시. Nobody else ever runs on: the pitch holds
    // RS.MAX_MATES teammates at most. Returns a shared { x, y, mate, own } (use it at once).
    passOrigin(passer) {
      const p = this.player, o = this._po || (this._po = { x: 0, y: 0, mate: null, own: false });
      let m = null;
      for (const x of this.mates) if (!m || x.id === passer) m = x;
      o.mate = m; o.own = !!m && m.id === passer;
      if (m) { o.x = m.x; o.y = m.y; }
      else { o.x = p.x - (p.face || 1) * (this.view.w / 2 + 10); o.y = p.y + (this.rng() - 0.5) * 40; }
      return o;
    }

    // A midfielder's pass reached the hero. 날두 shoots a power shot at the nearest enemy; 메시 never shoots —
    // he takes the ball on and slaloms through the defenders around him.
    mateShot(dmg, pierce) {
      const p = this.player;
      if (this.build.hero === 'messi') {
        const R = 30 * this.stats.area;
        this.shock(p.x, p.y, R, dmg * 0.8, { knock: 70, team: true, silentFx: true });
        this.addFx('swing', p.x, p.y, { r: R, dur: 0.3, follow: true });
        this.emit('sfx', { name: 'swish' });
        return;
      }
      const tg = this.nearestEnemies(1, 260, this._tg || (this._tg = []));
      const a = tg.length ? Math.atan2(tg[0].y - p.y, tg[0].x - p.x) : Math.atan2(p.diry, p.dirx);
      this.spawnProj('shot', p.x, p.y, a, 320 * this.stats.projSpeed, { dmg, pierce, r: 4, life: 1.4, team: true, knock: 50 });
      this.emit('sfx', { name: 'shoot' });
    }

    // ------------------------------------------------------------ enemies
    updateEnemies(dt) {
      const p = this.player;
      const R = this.spawnRadius();
      const recycle2 = (R + 140) * (R + 140);
      const parity = this.frame & 1;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.flash = Math.max(-0.2, e.flash - dt);
        e.anim += dt;
        const dx = p.x - e.x, dy = p.y - e.y;
        const d2 = dx * dx + dy * dy;
        const d = Math.sqrt(d2) || 1;
        if (e.rival && e === this.rival && this.t >= e.leaveAt) { this.rivalLeave(e); continue; }
        if (e.special && this.t >= e.leaveAt) { this.torresLeave(e); continue; }
        if (e.stun > 0) e.stun -= dt;
        else if (e.boss && !e.cine) this.bossAI(e, dt, dx, dy, d); // the 캄프 누 keeper is World.updateCine's (a boss felled earlier in the step starts it)
        else if (e.mini) this.miniAI(e, dt, dx, dy, d);
        else if (e.lineVx || e.lineVy) {
          e.x += e.lineVx * e.speed * dt; e.y += e.lineVy * e.speed * dt;
          e.life -= dt;
          if (e.life <= 0) { e.alive = false; continue; }
        } else if (e.ranged) {
          const want = d > 95 ? 1 : d < 70 ? -0.8 : 0.15;
          e.x += dx / d * e.speed * want * dt; e.y += dy / d * e.speed * want * dt;
          e.shootT -= dt;
          if (e.shootT <= 0 && d < 200) {
            e.shootT = 2.6 + this.rng() * 1.5;
            this.enemyShot('card', e.x, e.y, Math.atan2(dy, dx), 95, Math.round(e.dmg * 1.2), 3);
          }
        } else {
          e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt;
        }
        if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1;
        // knockback decay
        if (e.kx || e.ky) {
          e.x += e.kx * dt; e.y += e.ky * dt;
          const f = Math.pow(0.0015, dt);
          e.kx *= f; e.ky *= f;
          if (Math.abs(e.kx) < 1) e.kx = 0;
          if (Math.abs(e.ky) < 1) e.ky = 0;
        }
        // separation (half the crowd per frame)
        if (!e.boss && (e.uid & 1) === parity) {
          this.grid.query(e.x, e.y, e.r * 2, this._q);
          for (const o of this._q) {
            if (o === e || !o.alive) continue;
            const sx = e.x - o.x, sy = e.y - o.y;
            const rr = e.r + o.r;
            const sd2 = sx * sx + sy * sy;
            if (sd2 >= rr * rr || sd2 === 0) continue;
            const sd = Math.sqrt(sd2);
            const push = (rr - sd) * 0.5;
            e.x += sx / sd * push; e.y += sy / sd * push;
          }
        }
        // contact damage (a charging 준보스 hits harder and wider)
        const cr = e.r + p.r - 2 + (e.charging ? 4 : 0);
        if (d2 < cr * cr) this.hurtPlayer(e.charging ? Math.round(e.dmg * 1.25) : e.dmg, e);
        // recycle stragglers around the player: behind or beside a runner, never ahead (round 12: they were put in
        // front of him, so whichever way he fled the crowd was already waiting there)
        if (!e.boss && !e.lineVx && !e.lineVy && d2 > recycle2) {
          const a = this.awayAngle(0);
          e.x = e.px = p.x + Math.cos(a) * R; e.y = e.py = p.y + Math.sin(a) * R;
        }
      }
    }

    enemyShot(kind, x, y, a, speed, dmg, r, curve, o) {
      if (this.eprojs.length > 300) return null;
      speed *= this.finalPace; // 1 outside the final
      const ep = { kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, r: r || 3, dmg, life: 5,
        curve: curve || 0, alive: true, t: 0, home: 0, turn: 0, wait: 0 };
      if (o) Object.assign(ep, o);
      this.eprojs.push(ep);
      return ep;
    }

    updateEProjs(dt) {
      const p = this.player;
      for (const ep of this.eprojs) {
        if (!ep.alive) continue;
        if (ep.wait > 0) { ep.wait -= dt; continue; } // telegraph: visible, harmless, not moving yet
        ep.t += dt;
        if (ep.curve) {
          const c = Math.cos(ep.curve * dt), s = Math.sin(ep.curve * dt);
          const vx = ep.vx * c - ep.vy * s; ep.vy = ep.vx * s + ep.vy * c; ep.vx = vx;
        }
        if (ep.home > 0) { // brief homing, limited turn rate
          ep.home -= dt;
          const cur = Math.atan2(ep.vy, ep.vx);
          let diff = Math.atan2(p.y - ep.y, p.x - ep.x) - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const na = cur + Math.max(-ep.turn * dt, Math.min(ep.turn * dt, diff));
          ep.vx = Math.cos(na) * ep.speed; ep.vy = Math.sin(na) * ep.speed;
        }
        ep.x += ep.vx * dt; ep.y += ep.vy * dt;
        ep.life -= dt;
        if (ep.life <= 0) { ep.alive = false; continue; }
        const rr = ep.r + p.r - 1;
        if ((ep.x - p.x) ** 2 + (ep.y - p.y) ** 2 < rr * rr) {
          if (p.iframe <= 0 && !p.dash) { ep.alive = false; this.hurtPlayer(ep.dmg, ep); }
        }
      }
    }

    // ------------------------------------------------------------ bosses (incl. 메시)
    // Where the player will be in `lead` seconds if they keep running (bosses lead their attacks).
    predict(lead, maxDist) {
      const p = this.player;
      let dx = p.vx * lead, dy = p.vy * lead;
      const d = Math.hypot(dx, dy);
      if (maxDist && d > maxDist) { dx *= maxDist / d; dy *= maxDist / d; }
      return { x: p.x + dx, y: p.y + dy };
    }

    // At fixed checkpoints, rescale boss HP so the measured damage rate on it gives a real fight
    // (never below the year's base HP). The HP bar keeps its current fraction, so the change is invisible.
    calibrateBoss(e) {
      // damage rate since the previous checkpoint (the first checkpoint uses everything since the first hit)
      const now = this.t;
      const since = e.lastCalT != null ? e.lastCalT : e.firstHitT;
      const dealt = e.bossDmgIn - (e.lastCalDmg || 0);
      e.lastCalT = now; e.lastCalDmg = e.bossDmgIn;
      // the rival and 토레쓰 run about: the average since the first hit (one burst or one dry spell must not set him)
      const rate = e.rival || e.special ? e.bossDmgIn / Math.max(1, now - e.firstHitT) : dealt / Math.max(0.5, now - since);
      const want = Math.max(e.baseHp, rate * this.bossTarget(e));
      if (Math.abs(want - e.maxHp) / e.maxHp < 0.1) return;
      const k = want / e.maxHp; // keep the HP-bar fraction: the change is invisible
      e.maxHp = Math.round(e.maxHp * k);
      e.hp = Math.max(1, Math.round(e.hp * k));
    }
    // Seconds of the player's measured damage rate a boss is worth. The rival and 토레쓰 aim inside their window
    // (at most RS.RIVAL_MAX_SHARE of it: a build that keeps hitting him wins).
    bossTarget(e) {
      if (e.special) return RS.TORRES.window * RS.TORRES.secs;
      if (e.rival) { const R = RS.RIVAL[this.yearDef.rival]; return RS.RIVAL_WINDOW * Math.min(RS.RIVAL_MAX_SHARE, R.secs[0] + R.secs[1] * (e.rivalLv || 0)); }
      return RS.BOSS_FIGHT_SECONDS * RS.BOSS_TYPES[this.yearDef.boss.type].fight * this.tune.bossFight;
    }

    bossActions(e) {
      const ai = e.ai, fin = RS.FINAL[ai.kind];
      if (ai.rival) { // 엘 클라시코: the move lists unlocked by his level; the rage list in phase 2
        const R = RS.RIVAL[ai.kind];
        if (ai.phase === 2) return fin.phase2;
        return [].concat(...R.tiers.slice(0, ai.lv + 1));
      }
      if (!fin) return RS.BOSS_TYPES[ai.kind].actions;
      return ai.phase === 1 ? fin.phase1 : fin.phase2;
    }

    bossAI(e, dt, dx, dy, d) {
      const ai = e.ai, fin = RS.FINAL[ai.kind];
      if (fin && ai.phase === 1 && e.hp <= e.maxHp * 0.5 && (!ai.rival || ai.lv >= RS.RIVAL[ai.kind].rageAt)) {
        ai.phase = 2;
        ai.act = { kind: 'roar', t: 0, stage: 0, n: 0 };
        e.invuln = true;
        e.tele = null;
        this.emit('rage');
        this.emit('banner', { text: fin.rageText });
      }
      const cal = e.rival || e.special ? RS.RIVAL_CALIBRATE_AT : RS.BOSS_CALIBRATE_AT;
      if (e.bossDmgIn && e.calibrated < cal.length && this.t - e.firstHitT >= cal[e.calibrated]) { e.calibrated++; this.calibrateBoss(e); }
      if (ai.act) { this.runBossAct(e, ai.act, dt, dx, dy, d); return; }
      // movement between attacks
      const sp = e.speed * this.finalPace;
      if (ai.keep) {
        const want = d > ai.keep + 20 ? 1 : d < ai.keep - 20 ? -1 : 0;
        if (this.rng() < dt * 0.4) ai.strafe = -ai.strafe;
        const tx = -dy / d * ai.strafe, ty = dx / d * ai.strafe;
        e.x += (dx / d * want + tx * 0.8) * sp * dt;
        e.y += (dy / d * want + ty * 0.8) * sp * dt;
      } else {
        e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
      }
      // never let the player simply outrun the boss off-screen
      if (d > this.spawnRadius() * 0.9) { e.x += dx / d * sp * 1.5 * dt; e.y += dy / d * sp * 1.5 * dt; }
      ai.cool -= dt;
      // round 13.3: a boss starts an attack only from the hero's screen (+24 px); farther off he first walks in (the
      // user: "보스 사거리 무제한인 거 에바야", he kept attacking a hero fleeing for his life)
      const inReach = Math.abs(dx) <= this.view.w / 2 + 24 && Math.abs(dy) <= this.view.h / 2 + 24;
      if (ai.cool <= 0 && inReach) {
        const list = this.bossActions(e);
        let k = this.rng.pick(list);
        if (k === ai.last && list.length > 1) k = this.rng.pick(list.filter((x) => x !== ai.last));
        ai.last = k;
        ai.act = { kind: k, t: 0, stage: 0, n: 0 };
        ai.history.push(k);
        if (ai.history.length > 40) ai.history.shift();
      }
    }

    endAct(e) {
      const ai = e.ai;
      ai.act = null;
      e.tele = null;
      const fin = RS.FINAL[ai.kind];
      ai.cool = RS.BOSS_TYPES[ai.kind].cool * (fin && ai.phase === 2 ? fin.rageCool : 1) * this.tune.bossCool;
    }

    // 준보스: walks at the player; every few seconds a telegraphed charge (red line, then a fast run that hits
    // hard) or a ground slam where the player is heading. Standing still is punished; a side-step dodges both.
    miniAI(e, dt, dx, dy, d) {
      const ai = e.ai, p = this.player;
      if (ai.act) {
        const a = ai.act; a.t += dt;
        if (a.kind === 'charge') {
          if (a.stage === 0) {
            if (a.t < 0.45) { const tp = this.predict(0.3 + d / 260, 70); a.dir = Math.atan2(tp.y - e.y, tp.x - e.x); }
            e.tele = { kind: 'line', x: e.x, y: e.y, a: a.dir, len: 120, p: Math.min(1, a.t / 0.65), thin: true };
            if (a.t >= 0.65) { a.stage = 1; a.t = 0; e.tele = null; e.charging = true; this.emit('sfx', { name: 'dash' }); }
          } else if (a.stage === 1) {
            e.x += Math.cos(a.dir) * 260 * dt; e.y += Math.sin(a.dir) * 260 * dt;
            if (Math.floor(a.t * 60) % 4 === 0) this.addFx('poof', e.x, e.y + e.r, { dur: 0.2 });
            if (a.t >= 0.46) { a.stage = 2; a.t = 0; e.charging = false; }
          } else if (a.t >= 0.4) { ai.act = null; ai.cool = 2.4 + this.rng(); }
        } else { // slam
          if (a.stage === 0) {
            if (!a.spot) { a.spot = this.predict(0.7, 70); this.emit('sfx', { name: 'warn' }); }
            e.tele = { kind: 'circles', spots: [a.spot], r: 34, p: Math.min(1, a.t / 0.8) };
            if (a.t >= 0.8) {
              a.stage = 1; e.tele = null;
              this.addFx('shock', a.spot.x, a.spot.y, { r: 34, dur: 0.35, color: '#ff8a5c' });
              this.emit('sfx', { name: 'thud' });
              if ((p.x - a.spot.x) ** 2 + (p.y - a.spot.y) ** 2 < (34 + p.r) ** 2) this.hurtPlayer(Math.round(e.dmg * 1.1), e);
            }
          } else if (a.t >= 0.5) { ai.act = null; ai.cool = 2.6 + this.rng(); }
        }
        return;
      }
      e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt;
      ai.cool -= dt;
      if (ai.cool <= 0 && d < 170) {
        const kind = ai.acts[ai.n % ai.acts.length]; ai.n++;
        ai.act = { kind, t: 0, stage: 0, dir: Math.atan2(dy, dx) };
        if (kind === 'charge') this.emit('sfx', { name: 'warn' });
      }
    }

    runBossAct(e, a, dt, dx, dy, d) {
      const p = this.player;
      a.t += dt;
      const aim = Math.atan2(dy, dx);
      const pdmg = Math.round(e.dmg * 0.75);
      const fin = RS.FINAL[e.ai.kind];
      const isMessi = !!fin;
      const rage = isMessi && e.ai.phase === 2;
      const ball = fin ? fin.ball : 'ball';
      const k = this.tune.bossDensity; // fewer bullets in the first years
      switch (a.kind) {
        case 'roar':
          if (a.stage === 0) {
            a.stage = 1;
            this.addFx('shock', e.x, e.y, { r: 140, dur: 0.8, color: '#7ec8ff' });
            const n = d || 1;
            p.x += (p.x - e.x) / n * 30; p.y += (p.y - e.y) / n * 30;
            for (const o of this.enemies) if (o !== e && o.alive && !o.boss) o.stun = Math.max(o.stun, 0.6);
          }
          if (a.t >= 1.6) { e.invuln = false; e.speed *= fin.rageSpeed; this.endAct(e); }
          break;
        // Dashes: 'dash' aims where the player will be; 'cut' runs across the player's escape path;
        // 'dribble'/'dribble3' are 메시's (3 chained in rage).
        case 'dash': case 'cut': case 'dribble': case 'dribble3': {
          const chain = a.kind === 'dribble3' ? 3 : 1;
          const tele = a.kind === 'dash' ? 0.8 : a.kind === 'cut' ? 0.75 : a.kind === 'dribble' ? 0.65 : 0.5;
          const speed = (a.kind === 'dash' ? 300 : a.kind === 'cut' ? 330 : a.kind === 'dribble' ? 380 : 430) * this.finalPace;
          const dur = 0.75;
          if (a.stage === 0) {
            if (a.dir == null) this.emit('sfx', { name: 'warn' });
            if (a.dir == null || a.t < tele - 0.25) { // keeps tracking, locks 0.25 s before the dash
              const lead = a.kind === 'cut' ? 0.9 : 0.45;
              const tp = this.predict(lead + d / speed, a.kind === 'cut' ? 140 : 90);
              a.dir = Math.atan2(tp.y - e.y, tp.x - e.x);
            }
            e.tele = { kind: 'line', x: e.x, y: e.y, a: a.dir, len: speed * dur, p: Math.min(1, a.t / tele) };
            if (a.t >= tele) { a.stage = 1; a.t = 0; e.tele = null; this.emit('sfx', { name: 'dash' }); }
          } else if (a.stage === 1) {
            e.x += Math.cos(a.dir) * speed * dt; e.y += Math.sin(a.dir) * speed * dt;
            if (Math.floor(a.t * 60) % 3 === 0) this.addFx('bghost', e.x, e.y, { dur: 0.3, sprite: e.sprite, face: Math.cos(a.dir) > 0 ? 1 : -1 });
            if (a.t >= dur) {
              a.n++;
              if (rage) { // in rage, each dribble ends with a point-blank shot at where the player is going
                const tp = this.predict(0.35, 60);
                const base = Math.atan2(tp.y - e.y, tp.x - e.x);
                const n = 3;
                for (let i = 0; i < n; i++) this.enemyShot(ball, e.x, e.y, base + (i - (n - 1) / 2) * 0.24, 165, pdmg, 3);
                this.emit('sfx', { name: 'shoot' });
              }
              if (a.n < chain) { a.stage = 0; a.t = 0; a.dir = null; }
              else { a.stage = 2; a.t = 0; }
            }
          } else if (a.t >= 0.35) this.endAct(e);
          break;
        }
        case 'fan': case 'volley': case 'volley2': {
          const waves = a.kind === 'volley' ? 1 : 2;
          const n = Math.max(3, Math.round((a.kind === 'fan' ? 5 : a.kind === 'volley' ? 7 : 9) * k));
          const spread = a.kind === 'fan' ? 0.8 : 1.15;
          const speed = a.kind === 'fan' ? 120 + 2 * this.lvl : 170;
          if (a.t >= 0.35 + a.n * 0.45 && a.n < waves) {
            const off = (a.n % 2) * (spread / (n - 1)) * 0.5;
            const tp = this.predict(0.5, 70);
            const base = Math.atan2(tp.y - e.y, tp.x - e.x);
            for (let i = 0; i < n; i++) this.enemyShot(ball, e.x, e.y, base - spread / 2 + spread * i / (n - 1) + off, speed, pdmg, 3);
            a.n++;
            this.emit('sfx', { name: 'shoot' });
          }
          if (a.n >= waves && a.t > 0.35 + waves * 0.45) this.endAct(e);
          break;
        }
        case 'ring': {
          if (a.n < 2 && a.t >= 0.3 + a.n * 0.5) {
            const n = Math.round(14 * k);
            for (let i = 0; i < n; i++) this.enemyShot('ball', e.x, e.y, (i + a.n * 0.5) / n * TAU, 95, pdmg, 3);
            a.n++;
            this.emit('sfx', { name: 'shoot' });
          }
          if (a.n >= 2 && a.t > 1.3) this.endAct(e);
          break;
        }
        case 'curl': {
          // curling shots that bend in and home on the player briefly
          const n = isMessi ? (rage ? 5 : 3) : Math.max(2, Math.round(4 * k));
          if (a.n === 0 && a.t >= 0.3) {
            for (let i = 0; i < n; i++) {
              const side = i % 2 ? 1 : -1;
              const kk = 0.7 + 0.25 * Math.floor(i / 2);
              this.enemyShot(ball, e.x, e.y, aim + side * kk, isMessi ? 165 : 125 + 1.5 * this.lvl, pdmg, 3, -side * kk * 1.1,
                { home: isMessi ? (rage ? 1.1 : 0.9) : 0.6, turn: isMessi ? 3.0 : 2.0, life: 4 });
            }
            a.n = 1;
            this.emit('sfx', { name: 'curl' });
          }
          if (a.t > 0.9) this.endAct(e);
          break;
        }
        case 'burst': {
          const n = Math.max(3, Math.round(6 * k));
          if (a.n < n && a.t >= 0.3 + a.n * 0.13) {
            const tp = this.predict(d / 170, 80);
            this.enemyShot('ball', e.x, e.y, Math.atan2(tp.y - e.y, tp.x - e.x) + (this.rng() - 0.5) * 0.15, 170, pdmg, 3);
            a.n++;
          }
          if (a.n >= n && a.t > 0.3 + n * 0.13 + 0.4) this.endAct(e);
          break;
        }
        case 'snipe': {
          // 강슛: a red aim line tracks where the player is heading, locks for a moment, then a very fast shot.
          // Running straight gets you hit; changing direction after the lock dodges it.
          const tele = 0.9, lock = 0.16;
          const speed = 380 + 5 * this.lvl;
          if (a.stage === 0) {
            if (a.dir == null) this.emit('sfx', { name: 'warn' });
            if (a.dir == null || a.t < tele - lock) {
              const tp = this.predict(lock + d / speed, 120);
              a.dir = Math.atan2(tp.y - e.y, tp.x - e.x);
            }
            e.tele = { kind: 'line', x: e.x, y: e.y, a: a.dir, len: 260, p: Math.min(1, a.t / tele), thin: true };
            if (a.t >= tele) {
              e.tele = null; a.stage = 1; a.t = 0;
              const offs = isMessi && !rage ? [0] : [0, -0.12, 0.12];
              for (const off of offs) this.enemyShot(ball, e.x, e.y, a.dir + off, speed, Math.round(pdmg * (off ? 0.9 : 1.2)), 4, 0, { power: true });
              this.emit('sfx', { name: 'shoot' });
            }
          } else if (a.t > 0.4) this.endAct(e);
          break;
        }
        case 'cards': {
          if (a.n === 0 && a.t >= 0.4) {
            for (let i = 0; i < 5; i++) this.enemyShot('card', e.x, e.y, aim - 0.6 + i * 0.3, 110, pdmg, 3);
            this.enemyShot('redcard', e.x, e.y, aim, 70, Math.round(pdmg * 1.8), 6, 0, { home: 1.5, turn: 1.2, life: 6 });
            a.n = 1;
          }
          if (a.t > 1.0) this.endAct(e);
          break;
        }
        case 'wall': { // 수비벽: a line of defenders rises between the boss and the player and walks at him
          if (a.n === 0 && a.t >= 0.4) {
            const n = 5 + Math.min(4, Math.floor(this.lvl / 5));
            this.makeRoom(n);
            const mx = e.x + dx * 0.45, my = e.y + dy * 0.45;
            const px = -dy / d, py = dx / d;
            for (let i = 0; i < n; i++) {
              const off = (i - (n - 1) / 2) * 16;
              const w = this.spawnEnemy('grunt', mx + px * off, my + py * off, { minion: true });
              if (w) { w.hp = w.maxHp = Math.round(w.maxHp * 2.5); w.speed *= 0.8; w.stun = 0.3; }
            }
            a.n = 1;
            this.addFx('shock', mx, my, { r: 40, dur: 0.4, color: '#ffffff' });
            this.emit('sfx', { name: 'thud' });
          }
          if (a.t > 0.9) this.endAct(e);
          break;
        }
        case 'punt': { // 펀트킥: one huge slow ball that homes for a while — walk around it
          if (a.n === 0 && a.t >= 0.5) {
            const tp = this.predict(0.6, 80);
            this.enemyShot('cannon', e.x, e.y, Math.atan2(tp.y - e.y, tp.x - e.x), 105, Math.round(e.dmg * 1.6), 9, 0, { home: 1.8, turn: 1.8, life: 5, power: true });
            a.n = 1;
            this.emit('sfx', { name: 'thud' });
          }
          if (a.t > 1.0) this.endAct(e);
          break;
        }
        case 'summon': {
          if (a.n === 0 && a.t >= 0.5) {
            const n = isMessi ? 4 : 6 + Math.min(6, Math.floor(this.lvl / 3));
            this.makeRoom(n);
            for (let i = 0; i < n; i++) {
              const ang = i / n * TAU;
              this.spawnEnemy(fin ? fin.minion : 'grunt', e.x + Math.cos(ang) * 30, e.y + Math.sin(ang) * 30, { minion: true });
            }
            a.n = 1;
            this.addFx('shock', e.x, e.y, { r: 36, dur: 0.4, color: '#ffffff' });
          }
          if (a.t > 0.9) this.endAct(e);
          break;
        }
        case 'slam': case 'pslam': {
          // telegraphed ground slam where the player is heading; 'pslam' adds two flanking circles
          if (a.stage === 0) {
            if (!a.spots) {
              const tp = this.predict(0.9, 90);
              a.spots = [tp];
              if (a.kind === 'pslam' && k > 0.7) {
                const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
                const off = 62;
                a.spots.push({ x: tp.x + Math.cos(ang) * off, y: tp.y + Math.sin(ang) * off }, { x: tp.x - Math.cos(ang) * off, y: tp.y - Math.sin(ang) * off });
              }
              this.emit('sfx', { name: 'warn' });
            }
            e.tele = { kind: 'circles', spots: a.spots, r: 46, p: Math.min(1, a.t / 1.0) };
            if (a.t >= 1.0) {
              a.stage = 1;
              e.tele = null;
              this.emit('sfx', { name: 'thud' });
              for (const sp of a.spots) {
                this.addFx('shock', sp.x, sp.y, { r: 46, dur: 0.4, color: '#ff8a5c' });
                if ((p.x - sp.x) ** 2 + (p.y - sp.y) ** 2 < (46 + p.r) ** 2) this.hurtPlayer(Math.round(e.dmg * 1.1), e);
              }
            }
          } else if (a.t > 1.4) this.endAct(e);
          break;
        }
        case 'encircle': {
          // a ring of balls appears around the player (one gap), waits, then closes in
          if (a.n === 0) {
            const n = Math.round((isMessi ? 20 : 16) * Math.max(0.75, k));
            const R = 118;
            const gap = Math.floor(this.rng() * n);
            const gapW = rage ? 2 : 3;
            for (let i = 0; i < n; i++) {
              if (((i - gap + n) % n) < gapW) continue;
              const ang = i / n * TAU;
              const x = p.x + Math.cos(ang) * R, y = p.y + Math.sin(ang) * R;
              this.enemyShot(ball, x, y, ang + Math.PI, isMessi ? 95 : 62 + this.lvl, pdmg, 3, 0, { wait: 0.7, life: 3.4 });
            }
            a.n = 1;
            this.emit('sfx', { name: 'warn' });
          }
          if (a.t > 1.6) this.endAct(e);
          break;
        }
        default: this.endAct(e);
      }
    }

    // ------------------------------------------------------------ pickups
    updatePickups(dt) {
      const p = this.player, st = this.stats;
      const m2 = st.magnet * st.magnet;
      for (const g of this.pickups) {
        if (!g.alive) continue;
        const dx = p.x - g.x, dy = p.y - g.y;
        const d2 = dx * dx + dy * dy;
        if (!g.vac && (d2 < m2 || (g.kind === 'chest' && d2 < 18 * 18))) g.vac = true;
        if (g.vac) {
          const d = Math.sqrt(d2) || 1;
          g.vs = Math.min(420, g.vs + 600 * dt);
          const sp = Math.max(g.vs, 60);
          g.x += dx / d * sp * dt; g.y += dy / d * sp * dt;
          if (d < 8) this.collect(g);
        }
      }
    }

    collect(g) {
      g.alive = false;
      const p = this.player;
      switch (g.kind) {
        case 'gem': this.gainXp(g.value); this.emit('sfx', { name: 'gem' }); break;
        case 'coin': this.coinsPicked += g.value; this.emit('sfx', { name: 'coin' }); break;
        case 'heal': p.hp = Math.min(this.stats.maxHp, p.hp + 30); this.addFx('heal', p.x, p.y, { dur: 0.5 }); this.pfx('heal', p.x, p.y, { follow: p, dy: 8 }); this.emit('sfx', { name: 'heal' }); break;
        case 'magnet': for (const o of this.pickups) if (o.alive && o.kind === 'gem') o.vac = true; this.emit('sfx', { name: 'magnet' }); break;
        case 'chest': this.openChest(); break;
      }
    }

    gainXp(v) {
      const b = this.build;
      b.xp += v * this.stats.xp;
      while (b.xp >= RS.xpToNext(b.level)) {
        b.xp -= RS.xpToNext(b.level);
        b.level++;
        this.levelQueue++;
      }
    }

    // ------------------------------------------------------------ level-up / chest
    openLevelUp() {
      this.phase = 'levelup';
      this.diceUsed = false;
      this.deal();
      this.addFx('levelburst', this.player.x, this.player.y, { dur: 0.7, follow: true });
      this.emit('levelup', { level: this.build.level });
    }
    // A new four-card hand (the 4th may be a graded item or a gamble).
    deal() {
      this.choices = RS.levelChoices(this.build, this.rng, this.yearIdx, this.stats.luck, this.coinsPicked, this.unlocked);
      const sp = this.choices.find((c) => c.kind === 'relic' || c.kind === 'gamble' || c.kind === 'stim' || c.cup);
      if (sp) this.emit('special', { g: sp.g }); // a gamble card has no grade
    }

    choose(i) {
      if (this.phase !== 'levelup' || !this.choices || !this.choices[i]) return false;
      const c = this.choices[i];
      this.applyChoiceRuntime(c);
      this.levelQueue = Math.max(0, this.levelQueue - 1);
      this.choices = null;
      this.phase = 'play';
      if (this.levelQueue > 0) this.openLevelUp();
      return true;
    }

    reroll() {
      if (this.phase !== 'levelup' || this.rerolls <= 0) return false;
      this.rerolls--;
      this.deal();
      return true;
    }
    // 행운의 주사위: one free reroll on every level-up screen.
    rollDice() {
      if (this.phase !== 'levelup' || !this.build.relics.dice || this.diceUsed) return false;
      this.diceUsed = true;
      this.deal();
      return true;
    }

    // 도박 카드: roll the printed odds now and apply the outcome.
    resolveGamble(c) {
      const g = RS.GAMBLES[c.id];
      let r = this.rng(), out = g.outcomes[g.outcomes.length - 1];
      for (const o of g.outcomes) { if (r < o.p) { out = o; break; } r -= o.p; }
      const res = { id: c.id, win: !!out.win, text: out.text, relic: null };
      if (out.levels) { this.build.level += out.levels; this.levelQueue += out.levels; }
      if (out.relic) {
        const rc = RS.relicOfGrade(this.build, this.rng, out.relic);
        if (rc) { this.applyChoiceRuntime(rc); res.relic = rc.id; } else { this.coinsPicked += 50; res.text += ' (아이템 대신 코인 +50)'; }
      }
      if (out.hpHalf) this.player.hp = Math.max(1, Math.round(this.player.hp / 2));
      if (out.coinMul != null) this.coinsPicked = Math.round(this.coinsPicked * out.coinMul);
      this.lastGamble = res;
      this.emit('gamble', res);
      return res;
    }

    applyChoiceRuntime(c) {
      const ok = RS.applyChoice(this.build, c);
      if (!ok) return false;
      if (c.kind === 'relic') {
        this.recalc();
        const r = RS.RELICS[c.id];
        if (r.fx === 'fullheal') this.player.hp = this.stats.maxHp;
        this.addFx('levelburst', this.player.x, this.player.y, { dur: 0.9, follow: true, g: r.g });
        this.emit('relic', { id: c.id, g: r.g });
        if (r.g >= 4) { this.emit('siuu'); this.pfx('goldBurst', this.player.x, this.player.y, { follow: this.player, dy: 8 }); }
        return true;
      }
      if (c.kind === 'stim') { // one more 약물 꽂기 dose: a red surge around 메시
        this.recalc();
        this.addFx('levelburst', this.player.x, this.player.y, { dur: 0.9, follow: true, g: RS.RELICS.doping.g });
        this.addFx('stim', this.player.x, this.player.y, { dur: 1.1, follow: true });
        this.emit('stim', { n: RS.stimDoses(this.build) });
        return true;
      }
      if (c.kind === 'gamble') this.resolveGamble(c);
      if (c.kind === 'gold') this.coinsPicked += 30;
      if (c.kind === 'heal') this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * 0.4);
      if (c.kind === 'mate' && this.build.teammates.some((m) => m.id === c.id)) this.spawnMateRuntime(this.build.teammates.find((m) => m.id === c.id));
      if (c.kind === 'weapon') this.weaponSwapped();
      if (c.kind === 'enhance') this.emit('enhance', { p: this.build.weapon.p });
      this.recalc();
      return true;
    }
    // A new weapon in hand (a level-up card): the old move's balls go, a banner names it, a 전설 one shines.
    weaponSwapped() {
      const w = this.build.weapon;
      this.weaponChanged();
      this.emit('weapon', { id: w.id, g: w.g, p: w.p });
      if (w.g >= RS.GRADES.length - 1) this.siuuuMoment(w.id);
      else if (w.g >= 4) { this.emit('siuu'); this.pfx('goldBurst', this.player.x, this.player.y, { follow: this.player, dy: 8 }); }
    }
    // A SIUUU weapon arrives (round 19): above 전설's gold burst — a burst in the grade's three colours, three
    // fireworks, the SIUUU call over the hero (Renderer 'siuuup') and a banner (main.js 'siuuuWeapon'). Played when
    // it is taken, and for a SIUUU cup move held from the start, at its first shot of the match (World.cupDebut).
    siuuuMoment(id) {
      const p = this.player;
      this.siuuuShown = true;
      this.addFx('siuuup', p.x, p.y, { dur: 1.9, follow: true, id });
      this.pfx('goldBurst', p.x, p.y, { follow: p, dy: 8, palette: RS.PFX_SIUUU, o: { n: 60 } });
      this.pfx('firework', p.x, p.y - 2, { palette: RS.PFX_SIUUU });
      this.pfx('firework', p.x - 30, p.y + 6, { palette: RS.PFX_GOLD });
      this.pfx('firework', p.x + 30, p.y + 6, { palette: RS.PFX_PINK });
      this.emit('siuuuWeapon', { id });
      this.emit('shake', { k: 0.55 });
    }
    cupDebut(id) {
      if (!this.siuuuShown && this.build.weapon.id === id && this.build.weapon.g >= RS.GRADES.length - 1) this.siuuuMoment(id);
    }
    // 패널두 (round 19): every shot is a penalty — the spot under his boot, a white-hot lane down the line the 11m
    // cannon flies, a SIUUU-coloured muzzle blast and a deep boom; now and then he calls it.
    penaldoShot(x, y, a) {
      this.cupDebut('penaldo');
      this.addFx('pkshot', x, y, { dur: 0.5, a, len: 110 });
      this.pfx('boomSmall', x + Math.cos(a) * 9, y + Math.sin(a) * 9 + 3, { palette: RS.PFX_SIUUU, o: { r: 16, n: 14 } });
      if (!(this.cupSay > this.t)) { this.cupSay = this.t + 3.5; this.addFx('martial', x, y, { dur: 0.8, ch: '11m 대포!', n: 0, center: true, follow: true }); }
      this.emit('shake', { k: 0.14 });
      this.emit('sfx', { name: 'impact' });
    }
    // 명품 헐리웃 (round 19): the dive ends in a theatrical fall — the spot he lands on explodes (the burst moves from
    // where the dash began to where he falls), a spotlight, camera flashes, the judges' 10s and the 오스카.
    hollywoodLand(d) {
      const p = this.player, R = d.burst * this.stats.area;
      this.shock(p.x, p.y, R, d.dmg, { knock: 140, silentFx: true });
      this.addFx('dive', p.x, p.y, { dur: 1.3, face: p.face, r: R, seed: this.rng() * 6.28 });
      this.addFx('impact', p.x, p.y, { r: R, dur: 0.55, gold: true });
      this.addFx('boom', p.x, p.y, { r: R * 1.8, dur: 0.5 });
      this.pfx('goldBurst', p.x, p.y, { dy: 6, palette: RS.PFX_FIRE, o: { n: 40 } });
      this.pfx('boomSmall', p.x, p.y + 4, { palette: RS.PFX_GOLD, o: { r: Math.round(R * 1.1), n: 22 } });
      this.pfx('sparkPop', p.x, p.y - 10, { palette: RS.PFX_PINK, o: { n: 16, up: 60 } });
      this.emit('shake', { k: 0.3 });
      this.emit('sfx', { name: 'impact' });
      this.emit('sfx', { name: 'flash' });
    }

    // A chest: one plain card from a hand, sometimes three (never a weapon swap or a teammate, nothing to decide).
    openChest() {
      const res = [];
      const n = this.rng() < 0.25 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const opts = RS.makeChoices(this.build, this.rng, this.yearIdx, 3).filter((c) => c.kind !== 'mate' && c.kind !== 'weapon');
        const c = opts[0] || { kind: 'gold', id: 'gold', name: '스폰서 보너스', icon: '💰', desc: '코인 +30', tag: '보너스' };
        if (this.applyChoiceRuntime(c)) res.push(c);
      }
      if (this.rng() < RS.CHEST_RELIC.chance && RS.relicsLeft(this.build)) { // sometimes an item sits in the chest
        const rc = RS.relicOfGrade(this.build, this.rng, RS.rollGrade(this.rng, RS.itemStageAt(this.lvl).odds));
        if (rc && this.applyChoiceRuntime(rc)) res.push(rc);
      }
      const coins = 10 + this.lvl * 2;
      this.coinsPicked += coins;
      this.chestResult = { items: res, coins };
      this.phase = 'chest';
      this.emit('chest');
    }

    closeChest() {
      if (this.phase !== 'chest') return;
      this.chestResult = null;
      this.phase = 'play';
    }

    // ------------------------------------------------------------ 특수 카드 runtime effects
    updateRelics(dt) {
      const R = this.build.relics, T = this.relicT, p = this.player, st = this.stats;
      if (R.whistle) { // 추가시간 휘슬: everything but the boss freezes
        T.whistle = (T.whistle == null ? 4 : T.whistle) - dt;
        if (T.whistle <= 0) {
          T.whistle = 12;
          for (const e of this.enemies) if (e.alive && !e.boss) e.stun = Math.max(e.stun, e.mini || e.elite ? 1 : 2);
          this.addFx('whistle', p.x, p.y, { dur: 0.7, r: 150, follow: true });
          this.emit('sfx', { name: 'whistle' });
        }
      }
      if (R.honaldo) {
        T.honaldo = (T.honaldo == null ? 1 : T.honaldo) - dt;
        if (T.honaldo <= 0) T.honaldo = this.honaldo() ? 3 * st.cd : 0.3;
      }
      if (R.meteor) {
        T.meteor = (T.meteor == null ? 2 : T.meteor) - dt;
        if (T.meteor <= 0) T.meteor = this.meteorShower() ? 4 * st.cd : 0.5;
      }
      if (R.messia) {
        T.messia = (T.messia == null ? 1 : T.messia) - dt;
        if (T.messia <= 0) T.messia = this.messia() ? 3 * st.cd : 0.3;
      }
      if (R.alien) {
        T.alien = (T.alien == null ? 2 : T.alien) - dt;
        if (T.alien <= 0) T.alien = this.alienRun() ? 4 * st.cd : 0.5;
      }
    }
    // 외계인 모드: 메시's afterimage zigzags through up to eight enemies near him, one every ZIG s — big damage and a
    // stun on each — while he himself is untouchable. False = nobody near.
    alienRun() {
      const p = this.player, st = this.stats;
      const tg = this.nearestEnemies(8, 170, this._al || (this._al = [])).slice();
      if (!tg.length) return false;
      const dmg = 26 + 2.2 * this.build.level, ZIG = 0.07;
      p.iframe = Math.max(p.iframe, tg.length * ZIG + 0.25);
      let x0 = p.x, y0 = p.y;
      tg.forEach((e, i) => {
        const fx = x0, fy = y0;
        x0 = e.x; y0 = e.y;
        this.later(i * ZIG, () => {
          const x = e.alive ? e.x : x0, y = e.alive ? e.y : y0;
          this.addFx('zip', x, y, { dur: 0.32, x0: fx, y0: fy, alien: true });
          this.addFx('ghost', x, y, { dur: 0.35, face: x >= fx ? 1 : -1 });
          if (e.alive) this.damageEnemy(e, dmg, { knock: 40, kx: x >= fx ? 1 : -1, ky: 0, stun: 0.8 * st.dur });
          if (i % 2 === 0) this.emit('sfx', { name: 'zip' });
        });
      });
      this.addFx('martial', p.x, p.y, { dur: 0.8, ch: '👽', n: 1, follow: true });
      return true;
    }
    // 알까기 연쇄: from a fallen enemy the ball slips through the legs of up to three men near him in turn
    // (damage + a short stun). Shares the 폭발 슈팅 chain budget, so a crowd cannot loop it forever in one step.
    nutmegChain(x, y) {
      const dmg = 8 + 0.8 * this.build.level, hits = new Set();
      let cx = x, cy = y;
      for (let i = 0; i < 3; i++) {
        const e = this.nearestFrom(cx, cy, 60, hits);
        if (!e) break;
        hits.add(e.uid);
        const fx = cx, fy = cy;
        cx = e.x; cy = e.y;
        this.later(0.06 + i * 0.07, () => {
          this.addFx('zip', e.x, e.y, { dur: 0.22, x0: fx, y0: fy });
          if (e.alive) this.damageEnemy(e, dmg, { knock: 15, kx: e.x >= fx ? 1 : -1, ky: 0, stun: 0.5 });
        });
      }
      if (hits.size) this.emit('sfx', { name: 'zip' });
    }
    // 메시아: 드리블 돌파 (메!) → 감아차기 연사 (시!) → 기적의 일격 (아!). Damage grows with the level. False = no target.
    messia() {
      const p = this.player, st = this.stats;
      const tg = this.nearestEnemies(1, 140, this._tg || (this._tg = []))[0];
      if (!tg) return false;
      const base = 30 + 2.5 * this.build.level;
      if (!p.dash) {
        const n = Math.hypot(tg.x - p.x, tg.y - p.y) || 1, dur = 0.18;
        p.dash = { dx: (tg.x - p.x) / n, dy: (tg.y - p.y) / n, t: 0, dur, speed: 70 / dur, dmg: base, hits: new Set(), burst: 0, sx: p.x, sy: p.y };
        p.iframe = Math.max(p.iframe, dur + 0.04);
      }
      this.addFx('martial', p.x, p.y, { dur: 0.7, ch: '메!', n: 0, follow: true });
      this.emit('sfx', { name: 'dash' });
      this.later(0.24, () => { // 시!: the teammates fire five curling passes (메시 never shoots himself)
        const ts = this.nearestEnemies(5, 220, this._mt || (this._mt = []));
        for (let i = 0; i < 5; i++) {
          const e = ts.length ? ts[i % ts.length] : null, po = this.passOrigin(i % 2 ? 'iniestar' : 'xavino');
          const a = (e ? Math.atan2(e.y - po.y, e.x - po.x) : i * TAU / 5) + (i % 2 ? -0.9 : 0.9);
          this.spawnProj('golden', po.x, po.y, a, 230 * st.projSpeed, { dmg: base * 0.8, pierce: 2, r: 4, life: 1.6, home: 6, target: e, knock: 40 });
          if (po.mate) po.mate.kickT = 0.25;
        }
        this.addFx('martial', p.x, p.y, { dur: 0.7, ch: '시!', n: 1, follow: true });
        this.emit('sfx', { name: 'curl' });
      });
      this.later(0.55, () => {
        const bs = this.boss;
        const t2 = bs && bs.alive && (bs.x - p.x) ** 2 + (bs.y - p.y) ** 2 < 180 * 180 ? bs : this.nearestEnemies(1, 180, this._tg)[0];
        const x = t2 ? t2.x : p.x + p.face * 30, y = t2 ? t2.y : p.y;
        this.shock(x, y, 52 * st.area, base * 1.8, { knock: 140, stun: 1.2, color: '#9fe0ff' });
        this.addFx('boom', x, y, { r: 52 * st.area, dur: 0.5 });
        p.hp = Math.min(st.maxHp, p.hp + 6);
        this.addFx('martial', p.x, p.y, { dur: 0.8, ch: '아!', n: 2, follow: true });
        this.emit('shake', { k: 0.18 });
        this.emit('sfx', { name: 'thud' });
      });
      return true;
    }
    // 호날도: 정권 (호!) → 회오리 발차기 (날!) → 내려찍기 (도!). Damage grows with the level. False = no target.
    honaldo() {
      const p = this.player, st = this.stats;
      const tg = this.nearestEnemies(1, 130, this._tg || (this._tg = []))[0];
      if (!tg) return false;
      const base = 30 + 2.5 * this.build.level;
      const a = Math.atan2(tg.y - p.y, tg.x - p.x);
      if (Math.abs(Math.cos(a)) > 0.2) p.face = Math.cos(a) > 0 ? 1 : -1;
      p.kickT = 0.3;
      this.shock(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 34 * st.area, base, { knock: 200, color: '#ffd84a' });
      this.addFx('martial', p.x, p.y, { dur: 0.7, ch: '호!', n: 0, follow: true });
      this.emit('sfx', { name: 'kick' });
      this.later(0.22, () => {
        const R = 80 * st.area;
        this.shock(p.x, p.y, R, base * 1.2, { knock: 240, silentFx: true });
        this.addFx('swing', p.x, p.y, { r: R, dur: 0.4, follow: true, gold: true });
        this.addFx('martial', p.x, p.y, { dur: 0.7, ch: '날!', n: 1, follow: true });
        this.emit('sfx', { name: 'swish' });
      });
      this.later(0.5, () => {
        const bs = this.boss;
        const t2 = bs && bs.alive && (bs.x - p.x) ** 2 + (bs.y - p.y) ** 2 < 160 * 160 ? bs : this.nearestEnemies(1, 160, this._tg)[0];
        const x = t2 ? t2.x : p.x + p.face * 30, y = t2 ? t2.y : p.y;
        p.jump = 0.35;
        this.shock(x, y, 48 * st.area, base * 1.8, { knock: 140, stun: 1.2, color: '#ff7a3a' });
        this.addFx('boom', x, y, { r: 48 * st.area, dur: 0.5 });
        this.addFx('martial', p.x, p.y, { dur: 0.8, ch: '도!', n: 2, follow: true });
        this.emit('shake', { k: 0.18 });
        this.emit('sfx', { name: 'thud' });
      });
      return true;
    }
    // 별똥별 슛: golden balls fall on up to eight nearby enemies, one after another.
    meteorShower() {
      const tg = this.nearestEnemies(8, 240, this._mt || (this._mt = []));
      if (!tg.length) return false;
      const dmg = 20 + 1.6 * this.build.level, R = 22 * this.stats.area;
      tg.forEach((e, i) => {
        const x = e.x, y = e.y, delay = 0.35 + i * 0.07;
        this.addFx('meteor', x, y, { dur: delay });
        this.later(delay, () => { this.shock(x, y, R, dmg, { knock: 70, color: '#ffd84a' }); if (i % 3 === 0) this.emit('sfx', { name: 'thud' }); });
      });
      this.emit('sfx', { name: 'curl' });
      return true;
    }

    // ------------------------------------------------------------ fx / cleanup
    updateFx(dt) {
      for (const f of this.fx) f.t += dt;
      if (this.fx.length && this.frame % 10 === 0) this.fx = this.fx.filter((f) => f.t < f.dur);
      for (const tx of this.texts) tx.t += dt;
    }

    cleanup() {
      let w = 0;
      for (const e of this.enemies) { if (e.alive) this.enemies[w++] = e; else this.enemyPool.push(e); }
      this.enemies.length = w;
      w = 0;
      for (const pr of this.projs) { if (pr.alive) this.projs[w++] = pr; else this.projPool.push(pr); }
      this.projs.length = w;
      if (this.frame % 6 === 0) {
        this.eprojs = this.eprojs.filter((x) => x.alive);
        this.pickups = this.pickups.filter((x) => x.alive);
      }
    }

    // ------------------------------------------------------------ results
    exportBuild() { return RS.cloneBuild(this.build); }
    power() { return RS.powerScore(this.build, this.youth); }
    result() {
      const cleared = this.phase === 'clear' || this.phase === 'victory' || this.phase === 'cine'; // cine: the boss is down, the goal is playing out
      const base = this.coinsPicked + this.kills * RS.CROWD.value / 8 + (cleared ? 40 + 8 * this.lvl : 0);
      return { cleared, kills: this.kills, time: this.t, level: this.build.level, coins: Math.round(base * this.stats.gold), recruited: this.recruitedThisRun.slice(),
        rival: this.rivalResult, rivalName: this.yearDef.rival ? RS.RIVAL[this.yearDef.rival].name : null, torres: this.torresResult };
    }
  }
  RS.World = World;

  // ================================================================ Simple bot (tests, attract mode)
  const BOT_RUNS = { charge: 1, dash: 1, cut: 1, dribble: 1, dribble3: 1 }; // attacks that run along a locked line
  RS.botInput = function (w) {
    const p = w.player;
    let vx = 0, vy = 0, bx = 0, by = 0; // bx/by: the extra berth from hard hitters (left out of `danger` below)
    const gruntDmg = RS.ENEMIES.grunt.dmg * w.tune.dmgMul;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      // close-range weapons: the crowd (and the boss, a little further) may come to their edge
      const near = w.botR || 75, R = e.boss ? (near < 75 ? near + 14 : 130) : near;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) || 1;
      const k = (e.boss ? 3 : 1) / (d * d) * 400 * (75 / near);
      // the harder a man hits, the wider the berth (round 11: the bot brushed past 거구 and 준보스 for 30 a touch)
      const extra = e.boss ? 0 : k * (Math.min(3, Math.max(1, e.dmg / gruntDmg)) - 1);
      vx += dx / d * (k + extra); vy += dy / d * (k + extra);
      bx += dx / d * extra; by += dy / d * extra;
    }
    for (const ep of w.eprojs) {
      if (!ep.alive) continue;
      if (ep.wait > 0 && ep.wait > 0.3) continue;
      const dx = p.x - ep.x, dy = p.y - ep.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 60 * 60) continue;
      const d = Math.sqrt(d2) || 1;
      vx += dx / d * 4 / Math.max(1, d / 15); vy += dy / d * 4 / Math.max(1, d / 15);
    }
    if (w.boss && w.boss.alive && w.boss.tele) {
      const t = w.boss.tele;
      if (t.kind === 'circles') for (const c of t.spots) { const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1; if (d < t.r + 20) { vx += dx / d * 6; vy += dy / d * 6; } }
      if (t.kind === 'line') { vx += -Math.sin(t.a) * 5; vy += Math.cos(t.a) * 5; }
    }
    // every other telegraph as well — 준보스, the 클라시코 rival, 토레쓰 (round 11: with one weapon they live long
    // enough to act; seven of the nine hits that ended a strong bot's 2007 were 준보스 charges and slams it walked
    // into, and in 2010 the rival's dribbles): out of the slam circle, off the line to the side the hero stands on —
    // and still off it while the charge or dash runs (the line is gone then, the direction is not)
    for (const e of w.enemies) {
      if (!e.alive || e === w.boss) continue;
      const a = e.ai && e.ai.act;
      const t = e.tele || (a && a.stage === 1 && a.dir != null && BOT_RUNS[a.kind] ? { kind: 'line', x: e.x, y: e.y, a: a.dir, len: 200 } : null);
      if (!t) continue;
      if (t.kind === 'circles') for (const c of t.spots) { const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1; if (d < t.r + 20) { vx += dx / d * 6; vy += dy / d * 6; } }
      else if (t.kind === 'line') {
        const ux = Math.cos(t.a), uy = Math.sin(t.a), rx = p.x - t.x, ry = p.y - t.y;
        const along = rx * ux + ry * uy, side = ry * ux - rx * uy; // side: along the normal (-uy, ux)
        if (along > -10 && along < t.len + 40 && Math.abs(side) < e.r + p.r + 24) { const s = side < 0 ? -1 : 1; vx += -uy * s * 6; vy += ux * s * 6; }
      }
    }
    // the berth steers but does not hold the bot back from a boss (counted in, it doubled the boss fights)
    const danger = Math.hypot(vx - bx, vy - by);
    // a boss on the pitch (season boss, 클라시코 rival, 토레쓰): close in until the one weapon reaches him — a
    // close-range move to its edge, a shot inside the auto-aim range (round 11: with one weapon, a 바이시클 킥 bot
    // that only backed away never touched the boss and the match ran 14 minutes)
    const bs = w.boss && w.boss.alive ? w.boss : w.rival && w.rival.alive ? w.rival : null;
    if (bs) {
      const want = w.botBoss || 180;
      const dx = bs.x - p.x, dy = bs.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > want) { const k = danger > 2 ? 0.5 : 1.2; vx += dx / d * k; vy += dy / d * k; }
    }
    // attraction: rescue marker, chests, gems
    let target = null;
    if (w.rescue) target = w.rescue;
    else {
      let bd = 140 * 140;
      for (const g of w.pickups) {
        if (!g.alive) continue;
        const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
        const s = g.kind === 'chest' ? d * 0.2 : d;
        if (s < bd) { bd = s; target = g; }
      }
    }
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1;
      const k = danger > 1.5 ? 0.3 : 1;
      vx += dx / d * k; vy += dy / d * k;
    } else {
      // drift in a slow circle around origin to keep space
      const a = w.t * 0.25;
      vx += Math.cos(a) * 0.4 - p.x * 0.002; vy += Math.sin(a) * 0.4 - p.y * 0.002;
    }
    const n = Math.hypot(vx, vy);
    return n > 0.01 ? { x: vx / n, y: vy / n } : { x: 0, y: 0 };
  };

  // Strong default bot, also the 완전 오토 picker. Order: 전설 items > a 약물 꽂기 dose > 영웅 items > a better weapon
  // (a higher grade first) > a teammate completing a named partnership > 희귀 items > 강화 > a teammate > passives
  // > ... It never takes a weaker weapon and never gambles.
  RS.botChoose = function (choices, build) {
    const pr = { enhance: 2, mate: 3, passive: 4, passiveUp: 5, mateUp: 6, drill: 7.5, heal: 8, gold: 9, gamble: 10, stim: -2 };
    const itemScore = { 2: 1.5, 3: -1, 4: -3 };
    const score = (c) => {
      if (c.kind === 'relic') return itemScore[RS.RELICS[c.id].g];
      if (c.kind === 'weapon') return !build || !RS.weaponBetter(c.wpn, build.weapon) ? 11 : c.wpn.g > build.weapon.g ? 0 : 1;
      if (c.kind === 'mate' && build && build.teammates.length === 1 && RS.NAMED_PAIRS[[build.teammates[0].id, c.id].sort().join('+')]) return 1.2;
      return pr[c.kind];
    };
    let bi = 0;
    for (let i = 1; i < choices.length; i++) if (score(choices[i]) < score(choices[bi])) bi = i;
    return bi;
  };

  // A human-like weaker bot: reacts late (input from `delay` s ago) and with aim noise.
  RS.makeBot = function (opt) {
    opt = opt || {};
    const rng = RS.makeRng(opt.seed || 1);
    const q = [];
    const steps = Math.max(0, Math.round((opt.delay || 0) * 60));
    let noiseA = 0;
    return function (w) {
      const v = RS.botInput(w);
      if (rng() < 0.05) noiseA = (rng() - 0.5) * 2 * (opt.noise || 0);
      const c = Math.cos(noiseA), s = Math.sin(noiseA);
      q.push({ x: v.x * c - v.y * s, y: v.x * s + v.y * c });
      return q.length > steps ? q.shift() : { x: 0, y: 0 };
    };
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).game = 'R34';
