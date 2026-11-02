/* 호날두 서바이버즈 — game logic (no DOM). One World = one year (stage).
 * Renderer and UI only read world state and drain world.events. Fixed-step update(dt, input). */
(function (RS) {
  'use strict';
  const TAU = Math.PI * 2;

  // ================================================================ Build (persistent across years in a career)
  RS.newBuild = function () {
    return {
      level: 1, xp: 0,
      skills: { kick: 1 }, skillOrder: ['kick'],
      passives: {}, passiveOrder: [],
      evolved: {},
      teammates: [], // on the pitch [{id, lv}], at most MAX_MATES
      bench: [], // bench warmers [{id, lv}], at most MAX_BENCH (weak passive synergy)
      coachCards: [], // card ids, stack for the career
      bonusHp: 0, bonusReroll: 0, // boss rewards (permanent for the career)
      hero: 'ronaldo'
    };
  };
  RS.cloneBuild = (b) => JSON.parse(JSON.stringify(b));
  // Fill missing fields (old saves).
  RS.normalizeBuild = function (b) {
    const d = RS.newBuild();
    if (!b || typeof b !== 'object') return d;
    for (const k of Object.keys(d)) if (b[k] === undefined) b[k] = d[k];
    b.skillOrder = b.skillOrder.filter((id) => RS.SKILLS[id] && b.skills[id]);
    b.passiveOrder = b.passiveOrder.filter((id) => RS.PASSIVES[id] && b.passives[id]);
    b.teammates = b.teammates.filter((m) => m && RS.TEAMMATES[m.id]);
    b.bench = (b.bench || []).filter((m) => m && RS.TEAMMATES[m.id]);
    // old saves carried up to 5 on the pitch: the extras move to the bench
    while (b.teammates.length > RS.MAX_MATES) { const m = b.teammates.splice(RS.MAX_MATES, 1)[0]; if (b.bench.length < RS.MAX_BENCH) b.bench.push(m); }
    b.bench.length = Math.min(b.bench.length, RS.MAX_BENCH);
    if (!RS.HEROES || !RS.HEROES[b.hero]) b.hero = 'ronaldo';
    return b;
  };
  RS.allMates = (b) => b.teammates.concat(b.bench);
  // Named partnership of the two on the pitch (null with fewer than two).
  RS.pairSynergy = function (b) {
    if (b.teammates.length < 2) return null;
    const key = b.teammates.map((m) => RS.TEAMMATES[m.id].role).sort().join('+');
    const s = RS.PAIR_SYNERGY[key];
    return s ? Object.assign({ key }, s) : null;
  };

  // One number the player can watch grow: skills, evolutions, passives, teammates and level.
  RS.powerScore = function (b) {
    let s = b.level * 2;
    for (const id of b.skillOrder) s += b.skills[id] * 10 + (b.evolved[id] ? 40 : 0);
    for (const id of b.passiveOrder) s += b.passives[id] * 8;
    for (const m of b.teammates) s += 6 + m.lv * 5;
    return Math.round(s);
  };
  // Threat of a season on a 1–5 star scale (enemy HP multiplier of the year).
  RS.threatStars = function (idx) {
    const h = RS.yearTuning(idx).hpMul;
    return Math.max(1, Math.min(5, Math.ceil(Math.log2(h + 1))));
  };

  RS.xpToNext = function (level) {
    return Math.floor(6 + level * 5 + Math.max(0, level - 12) * 6 + Math.max(0, level - 30) * 14 + Math.max(0, level - 50) * 30);
  };

  let COACH_CARDS = null;
  RS.coachCard = function (id) {
    if (!COACH_CARDS) {
      COACH_CARDS = {};
      for (const ck of Object.keys(RS.COACHES)) for (const c of RS.COACHES[ck].cards) COACH_CARDS[c.id] = c;
    }
    return COACH_CARDS[id] || null;
  };

  // Derive runtime stats from build (passives + coach cards) and meta upgrades.
  RS.computeStats = function (build, metaUpgrades) {
    const a = { dmg: 0, cd: 0, area: 0, projSpeed: 0, moveSpeed: 0, hp: 0, magnet: 0, crit: 0, dur: 0, regen: 0,
      armor: 0, xp: 0, gold: 0, teamDmg: 0, teamCd: 0, bossDmg: 0, revive: 0, reroll: 0 };
    const add = (mods, times) => { for (const k in mods) if (k in a) a[k] += mods[k] * times; };
    for (const id in build.passives) if (RS.PASSIVES[id]) add(RS.PASSIVES[id].mods, build.passives[id]);
    for (const cid of build.coachCards) { const c = RS.coachCard(cid); if (c) add(c.mods, 1); }
    if (metaUpgrades) for (const id in metaUpgrades) if (RS.META[id]) add(RS.META[id].mods, metaUpgrades[id]);
    // squad: role buffs (pitch full, bench weak) and the partnership of the two on the pitch
    for (const m of build.teammates) add(RS.ROLE_BUFF[RS.TEAMMATES[m.id].role].mods, 1);
    for (const m of build.bench || []) add(RS.ROLE_BUFF[RS.TEAMMATES[m.id].role].mods, RS.BENCH_FACTOR);
    const pair = RS.pairSynergy(build);
    if (pair) add(pair.mods, 1);
    const hero = (RS.HEROES && RS.HEROES[build.hero]) || { moveMul: 1 };
    return {
      dmg: 1 + a.dmg, cd: Math.max(0.45, 1 + a.cd), area: 1 + a.area, projSpeed: 1 + a.projSpeed,
      move: 78 * hero.moveMul * (1 + a.moveSpeed), maxHp: Math.round(100 + a.hp + (build.bonusHp || 0)), magnet: 30 * (1 + a.magnet),
      crit: Math.min(0.9, 0.05 + a.crit), dur: 1 + a.dur, regen: a.regen, armor: a.armor, xp: 1 + a.xp,
      gold: 1 + a.gold, teamDmg: 1 + a.teamDmg, teamCd: Math.max(0.5, 1 + a.teamCd), bossDmg: 1 + a.bossDmg,
      revive: a.revive, reroll: a.reroll + (build.bonusReroll || 0), armor: Math.round(a.armor)
    };
  };

  RS.skillStats = function (id, lv, evolved) {
    const s = RS.SKILLS[id];
    if (evolved) return s.evo;
    return s.lv[Math.max(0, Math.min(s.lv.length, lv) - 1)];
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

  // ================================================================ Evolutions
  RS.availableEvolutions = function (build) {
    const out = [];
    for (const id of build.skillOrder) {
      const s = RS.SKILLS[id];
      if (!build.evolved[id] && build.skills[id] >= RS.SKILL_MAX && (build.passives[s.passive] || 0) >= 1) out.push(id);
    }
    return out;
  };

  // ================================================================ Teammates
  RS.erasUpTo = function (idx) {
    const set = [];
    for (let i = 0; i <= Math.min(idx, RS.YEARS.length - 1); i++) if (!set.includes(RS.YEARS[i].era)) set.push(RS.YEARS[i].era);
    return set;
  };
  RS.mateCandidates = function (build, yearIdx, onlyCurrentEra) {
    const owned = new Set(RS.allMates(build).map((m) => m.id));
    const eras = onlyCurrentEra ? [RS.YEARS[yearIdx].era] : RS.erasUpTo(yearIdx);
    return Object.keys(RS.TEAMMATES).filter((id) => !owned.has(id) && eras.includes(RS.TEAMMATES[id].era));
  };
  RS.squadFull = (build) => build.teammates.length >= RS.MAX_MATES && (build.bench || []).length >= RS.MAX_BENCH;
  // A new teammate goes on the pitch if there is room, else on the bench. Returns 'pitch' | 'bench' | false.
  RS.addMate = function (build, id) {
    if (RS.allMates(build).some((m) => m.id === id) || !RS.TEAMMATES[id]) return false;
    if (build.teammates.length < RS.MAX_MATES) { build.teammates.push({ id, lv: 1 }); return 'pitch'; }
    if (build.bench.length < RS.MAX_BENCH) { build.bench.push({ id, lv: 1 }); return 'bench'; }
    return false;
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
  // A passive that pairs with an owned skill can always be taken (it ignores the passive slot cap),
  // so every owned skill can reach its evolution.
  RS.isPairPassive = (build, pid) => build.skillOrder.some((sid) => RS.SKILLS[sid].passive === pid);
  RS.canTakePassive = (build, pid) => !build.passives[pid] && !!RS.PASSIVES[pid] &&
    (build.passiveOrder.length < RS.MAX_PASSIVES || RS.isPairPassive(build, pid));
  RS.evoHint = function (build, sid) {
    const s = RS.SKILLS[sid];
    if (build.evolved[sid]) return '진화 완료';
    const p = RS.PASSIVES[s.passive];
    return build.passives[s.passive] ? '진화: Lv.6 + ' + p.name + ' ✓' : '진화: Lv.6 + ' + p.name + ' 패시브 필요';
  };
  RS.passiveHint = function (build, pid) {
    const sid = Object.keys(RS.SKILLS).find((k) => RS.SKILLS[k].passive === pid);
    if (!sid) return '';
    const s = RS.SKILLS[sid];
    return build.skills[sid] ? '진화 짝: ' + s.name + ' → ' + s.evoName : '진화 짝: ' + s.name + ' (스킬 필요)';
  };
  RS.mateLine = function (id) {
    const m = RS.TEAMMATES[id], r = RS.ROLES[m.role];
    return r.name + ': ' + r.desc + ' · 팀 효과 ' + RS.ROLE_BUFF[m.role].text;
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
      case 'skill': { const s = RS.SKILLS[c.id]; return Object.assign(c, { name: s.name, icon: s.icon, desc: s.desc, tag: '새 스킬', hint: RS.evoHint(build, c.id) }); }
      case 'skillUp': { const s = RS.SKILLS[c.id]; const nl = build.skills[c.id] + 1;
        return Object.assign(c, { name: s.name, icon: s.icon, desc: s.ups[nl - 1], tag: 'Lv.' + nl + (nl === RS.SKILL_MAX ? ' MAX' : ''), hint: RS.evoHint(build, c.id) }); }
      case 'evolve': { const s = RS.SKILLS[c.id]; return Object.assign(c, { name: s.evoName, icon: s.evoIcon, desc: s.evoDesc, tag: '진화!', hint: s.name + ' + ' + RS.PASSIVES[s.passive].name }); }
      case 'passive': { const p = RS.PASSIVES[c.id]; return Object.assign(c, { name: p.name, icon: p.icon, desc: p.desc, tag: '새 패시브', hint: RS.passiveHint(build, c.id) }); }
      case 'passiveUp': { const p = RS.PASSIVES[c.id]; const nl = build.passives[c.id] + 1;
        return Object.assign(c, { name: p.name, icon: p.icon, desc: p.desc, tag: 'Lv.' + nl + (nl === RS.PASSIVE_MAX ? ' MAX' : ''), hint: RS.passiveHint(build, c.id) }); }
      case 'mate': { const m = RS.TEAMMATES[c.id]; const toBench = build.teammates.length >= RS.MAX_MATES;
        return Object.assign(c, { name: m.name, icon: toBench ? '🪑' : '🤝', desc: RS.mateLine(c.id), tag: toBench ? '벤치 합류' : '동료 합류', hint: RS.synergyHint(build, c.id) }); }
      case 'mateUp': { const m = RS.TEAMMATES[c.id]; const cur = RS.allMates(build).find((x) => x.id === c.id).lv;
        return Object.assign(c, { name: m.name, icon: '📈', desc: RS.mateLine(c.id), tag: '동료 Lv.' + (cur + 1) }); }
      case 'gold': return Object.assign(c, { name: '스폰서 보너스', icon: '💰', desc: '코인 +30', tag: '보너스' });
      case 'heal': return Object.assign(c, { name: '에그타르트', icon: '🥧', desc: '체력 40% 회복', tag: '보너스' });
    }
    return c;
  }

  RS.makeChoices = function (build, rng, yearIdx, n) {
    n = n || 3;
    const pool = [];
    const out = [];
    for (const id of RS.availableEvolutions(build)) if (out.length < 1) out.push({ kind: 'evolve', id });
    for (const id of build.skillOrder) if (build.skills[id] < RS.SKILL_MAX) pool.push({ kind: 'skillUp', id, w: 3 });
    if (build.skillOrder.length < RS.MAX_SKILLS) {
      for (const id in RS.SKILLS) if (!build.skills[id]) pool.push({ kind: 'skill', id, w: 1.7 });
    }
    for (const id of build.passiveOrder) if (build.passives[id] < RS.PASSIVE_MAX) pool.push({ kind: 'passiveUp', id, w: 2 });
    for (const id in RS.PASSIVES) if (RS.canTakePassive(build, id)) {
      // Paired passives come up much more often once the skill is high level (evolution path).
      const sid = build.skillOrder.find((k) => RS.SKILLS[k].passive === id);
      const w = sid ? (build.skills[sid] >= RS.SKILL_MAX - 1 ? 6 : 2.4) : 0.9;
      pool.push({ kind: 'passive', id, w });
    }
    if (!RS.squadFull(build)) {
      const cands = RS.mateCandidates(build, yearIdx || 0, false);
      for (const id of cands) pool.push({ kind: 'mate', id, w: 1.6 / Math.max(1, cands.length / 2) });
    }
    for (const m of RS.allMates(build)) if (m.lv < RS.MATE_MAX_LV) pool.push({ kind: 'mateUp', id: m.id, w: 1.2 });
    while (out.length < n && pool.length) {
      const c = RS.pickWeighted(rng, pool);
      pool.splice(pool.indexOf(c), 1);
      out.push({ kind: c.kind, id: c.id });
    }
    if (out.length < n) out.push({ kind: 'heal', id: 'heal' });
    if (out.length < n) out.push({ kind: 'gold', id: 'gold' });
    return out.map((c) => describe(c, build));
  };

  // Applies a choice to the build. Returns false if it could not apply.
  RS.applyChoice = function (build, c) {
    switch (c.kind) {
      case 'skill':
        if (build.skills[c.id] || build.skillOrder.length >= RS.MAX_SKILLS) return false;
        build.skills[c.id] = 1; build.skillOrder.push(c.id); return true;
      case 'skillUp':
        if (!build.skills[c.id] || build.skills[c.id] >= RS.SKILL_MAX) return false;
        build.skills[c.id]++; return true;
      case 'evolve':
        if (!RS.availableEvolutions(build).includes(c.id)) return false;
        build.evolved[c.id] = true; return true;
      case 'passive':
        if (!RS.canTakePassive(build, c.id)) return false;
        build.passives[c.id] = 1; build.passiveOrder.push(c.id); return true;
      case 'passiveUp':
        if (!build.passives[c.id] || build.passives[c.id] >= RS.PASSIVE_MAX) return false;
        build.passives[c.id]++; return true;
      case 'mate': return !!RS.addMate(build, c.id);
      case 'mateUp': return RS.levelMate(build, c.id, 1);
      case 'gold': case 'heal': return true;
    }
    return false;
  };

  // Transfer swap: newId replaces outId (pitch or bench) and inherits its level (the squad follows the career).
  RS.swapMate = function (build, outId, newId) {
    if (!RS.TEAMMATES[newId] || RS.allMates(build).some((m) => m.id === newId)) return false;
    for (const list of [build.teammates, build.bench]) {
      const i = list.findIndex((m) => m.id === outId);
      if (i >= 0) { list[i] = { id: newId, lv: list[i].lv }; return true; }
    }
    return false;
  };

  // ================================================================ World
  let UID = 1;

  class World {
    constructor(opt) {
      opt = opt || {};
      this.yearIdx = opt.yearIdx || 0;
      this.yearDef = RS.YEARS[this.yearIdx];
      this.tune = RS.yearTuning(this.yearIdx);
      this.era = RS.ERAS[this.yearDef.era];
      this.seed = opt.seed != null ? opt.seed : (Date.now() & 0x7fffffff);
      this.rng = RS.makeRng(this.seed);
      this.build = RS.normalizeBuild(RS.cloneBuild(opt.build || RS.newBuild()));
      this.metaUp = (opt.meta && opt.meta.upgrades) || {};
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
      this.enemies = []; this.enemyPool = [];
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
      this.levelQueue = 0; this.choices = null; this.chestResult = null;
      this.spawnAcc = 0;
      this.rescue = null; this.recruitedThisRun = [];
      this.wstate = {};
      this.debug = { godMode: false };
      this.recalc();
      this.player.hp = this.stats.maxHp;
      this.rerolls = this.stats.reroll;
      for (const m of this.build.teammates) this.spawnMateRuntime(m);
      this.schedule = this.makeSchedule();
    }

    // ------------------------------------------------------------ helpers
    recalc() {
      const prevMax = this.stats ? this.stats.maxHp : null;
      this.stats = RS.computeStats(this.build, this.metaUp);
      if (prevMax != null && this.stats.maxHp > prevMax) this.player.hp += this.stats.maxHp - prevMax;
      this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
    }
    emit(type, data) { this.events.push(Object.assign({ type }, data || {})); }
    later(t, fn) { this.timers.push({ t, fn }); }
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
      const T = this.stageTime, idx = this.yearIdx;
      const s = [];
      s.push({ t: T * 0.22, kind: 'rescue' });
      // mini-boss waves (the debut year gets two late ones so a newcomer can learn the controls first)
      for (const f of (idx === 0 ? [0.78, 0.95] : [0.2, 0.45, 0.7, 0.9])) s.push({ t: T * f, kind: 'mini' });
      if (idx >= 1) s.push({ t: T * 0.3, kind: 'press' });
      s.push({ t: T / 3, kind: 'wave2' });
      s.push({ t: T * 0.4, kind: 'elite' });
      s.push({ t: T * 0.5, kind: 'circle' });
      s.push({ t: T * 2 / 3, kind: 'wave3' });
      s.push({ t: T * 0.75, kind: 'elite' });
      if (idx >= 4) s.push({ t: T * 0.82, kind: 'press' });
      s.push({ t: T, kind: 'boss' });
      return s;
    }
    // 0 → 1 over the stage: enemies spawned later are tougher (see spawnEnemy).
    ramp() { return Math.min(1, this.t / this.stageTime); }

    // ------------------------------------------------------------ main step
    update(dt, input) {
      if (this.phase !== 'play') { this.updateFx(dt); return; }
      this.frame++;
      this.t += dt;
      const p = this.player;
      if (this.bossSpawned && this.boss && this.boss.alive) this.bossT += dt;
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
      this.updateMates(dt);
      this.updateProjs(dt);
      this.updateRings(dt);
      this.updateEnemies(dt);
      this.updateEProjs(dt);
      this.updatePickups(dt);
      this.updateRescue(dt);
      this.updateFx(dt);
      this.cleanup();

      if (p.hp <= 0 && this.phase === 'play') this.onPlayerDown();
      if (this.phase === 'play' && this.levelQueue > 0) this.openLevelUp();
    }

    // ------------------------------------------------------------ spawning
    runScheduled(kind) {
      const idx = this.yearIdx;
      if (kind === 'rescue') this.spawnRescue();
      else if (kind === 'elite') {
        const type = idx >= 3 ? 'tank' : 'grunt';
        const a = this.rng() * TAU, R = this.spawnRadius();
        this.spawnEnemy(type, this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R, { elite: true });
        this.emit('elite');
      } else if (kind === 'circle') {
        const n = 14 + Math.min(26, idx);
        const R = this.spawnRadius() * 0.85;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          this.spawnEnemy('grunt', this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R);
        }
        this.emit('banner', { text: '포위 진형!' });
      } else if (kind === 'press') {
        const n = 8 + Math.min(12, Math.floor(idx / 2));
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
        const base = this.rng() * TAU, R = this.spawnRadius() * 0.9;
        for (let i = 0; i < n; i++) {
          const a = base + i * (TAU / n);
          const type = this.rng.pick(RS.MINI_TYPES);
          this.spawnEnemy(type, this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R, { mini: true });
        }
        this.emit('mini', { n });
        this.emit('banner', { text: n > 1 ? '⚠️ 준보스 ' + n + '명 등장!' : '⚠️ 준보스 등장!' });
      } else if (kind === 'wave2') { this.emit('wave', { n: 2 }); this.emit('banner', { text: '⚡ 2차 공세 — 상대가 거세진다' }); }
      else if (kind === 'wave3') { this.emit('wave', { n: 3 }); this.emit('banner', { text: '🔥 총공세 — 버텨라!' }); }
      else if (kind === 'boss') this.spawnBoss();
    }

    updateSpawns(dt) {
      const prog = Math.min(1, this.t / this.stageTime);
      const rate = this.tune.spawnRate * (0.9 + 1.8 * prog) * (this.bossSpawned ? 0.3 : 1); // the boss fight stays about the boss
      this.spawnAcc = Math.min(6, this.spawnAcc + rate * dt);
      const R = this.spawnRadius();
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.enemies.length >= this.tune.maxAlive) break;
        const type = RS.pickWeighted(this.rng, this.tune.mix).type;
        // bias spawns toward the movement direction so running away still meets enemies
        let a = this.rng() * TAU;
        if (this.player.moving && this.rng() < 0.5) a = Math.atan2(this.player.diry, this.player.dirx) + (this.rng() - 0.5) * 2;
        this.spawnEnemy(type, this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R);
      }
    }

    spawnEnemy(type, x, y, opt) {
      opt = opt || {};
      const def = RS.ENEMIES[type];
      const e = this.enemyPool.pop() || {};
      const tu = this.tune;
      const k = this.ramp(); // later in the stage: tougher, faster, and drawn with a darker tint
      e.uid = UID++; e.type = type; e.sprite = def.sprite; e.x = x; e.y = y; e.alive = true;
      e.r = def.r; e.speed = def.speed * tu.speedMul * (1 + tu.rampSpeed * k) * (0.9 + this.rng() * 0.2);
      e.maxHp = e.hp = Math.round(def.hp * tu.hpMul * (1 + tu.rampHp * k));
      e.dmg = Math.round(def.dmg * tu.dmgMul * (1 + tu.rampDmg * k));
      e.tier = k >= 2 / 3 ? 2 : k >= 1 / 3 ? 1 : 0;
      e.xp = def.xp; e.ranged = !!def.ranged; e.shootT = 1.5 + this.rng() * 2;
      e.stun = 0; e.kx = 0; e.ky = 0; e.flash = -1; e.elite = !!opt.elite; e.boss = false; e.ai = null;
      e.invuln = false; e.tele = null; e.lineVx = 0; e.lineVy = 0; e.life = 0; e.dHit = -9; e.face = 1; e.charging = false;
      e.anim = this.rng() * 10; e.minion = !!opt.minion;
      e.mini = !!def.mini; e.name = def.name;
      if (e.elite) { e.maxHp = e.hp = e.hp * 9; e.r = Math.round(e.r * 1.5); e.dmg = Math.round(e.dmg * 1.4); e.xp *= 12; e.speed *= 1.1; }
      if (e.mini) { // 준보스: scales with the year, acts like a small boss (telegraphed charge / slam)
        e.maxHp = e.hp = Math.round(e.hp * (1 + 0.25 * this.yearIdx));
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
      e.ai = { kind: yd.boss.type, cool: 1.8, act: null, last: null, phase: 1, keep: yd.boss.type === 'messi' ? 70 : 0, strafe: 1, history: [] };
      this.boss = e;
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
      let cands = RS.mateCandidates(this.build, this.yearIdx, true);
      // With a full squad only era players appear: reaching them opens a transfer swap.
      if (!cands.length && !full) cands = RS.mateCandidates(this.build, this.yearIdx, false);
      if (!cands.length) return;
      const id = this.rng.pick(cands);
      const a = this.rng() * TAU;
      const d = Math.min(this.view.w, this.view.h) * 0.42 + 40;
      this.rescue = { id, x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d, progress: 0, need: 1.0, swap: full };
      this.emit('rescueSpawn', { id, swap: full });
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
        const where = RS.addMate(this.build, r.id);
        if (where) {
          if (where === 'pitch') this.spawnMateRuntime(this.build.teammates[this.build.teammates.length - 1], r.x, r.y);
          this.recalc();
          this.recruitedThisRun.push(r.id);
          this.emit('recruit', { id: r.id, bench: where === 'bench' });
        } else this.openSwap(r.id);
      }
    }

    // Transfer offer during a run: replace one teammate (the newcomer keeps that level) or keep the squad.
    openSwap(newId) {
      const nm = RS.TEAMMATES[newId];
      this.swapChoices = RS.allMates(this.build).map((m) => ({
        kind: 'swap', id: newId, out: m.id, icon: '🔄', name: nm.name + ' 영입',
        desc: RS.mateLine(newId), tag: RS.TEAMMATES[m.id].name + ' 방출 · Lv.' + m.lv + ' 승계' + (this.build.bench.some((b) => b.id === m.id) ? ' (벤치)' : '')
      }));
      this.swapChoices.push({ kind: 'keep', id: newId, icon: '✋', name: '지금 스쿼드 유지', desc: nm.name + ' 영입을 거절한다.', tag: '거절' });
      this.phase = 'swap';
      this.emit('swap', { id: newId });
    }

    chooseSwap(i) {
      if (this.phase !== 'swap' || !this.swapChoices || !this.swapChoices[i]) return false;
      const c = this.swapChoices[i];
      if (c.kind === 'swap' && RS.swapMate(this.build, c.out, c.id)) {
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
          if (d.burst) this.shock(d.sx, d.sy, d.burst * this.stats.area, d.dmg, { color: '#c9a0ff', knock: 120 });
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
      const d = Math.max(1, Math.round(dmg - this.stats.armor));
      p.hp -= d;
      this.dmgTaken += d;
      this.hits++;
      if (this.bossSpawned) this.bossDmgTaken += d;
      if (p.hp < this.minHp) this.minHp = p.hp;
      p.iframe = 0.45;
      p.hurtT = 0.2;
      this.emit('hurt', { dmg: d });
    }

    onPlayerDown() {
      const p = this.player;
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
    nearestEnemies(k, maxR, out) {
      out = out || [];
      out.length = 0;
      const p = this.player;
      const md = maxR * maxR;
      const ds = this._dists || (this._dists = []);
      ds.length = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
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
        if (!e.alive || (exclude && exclude.has(e.uid))) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    // ------------------------------------------------------------ weapons
    updateWeapons(dt) {
      const b = this.build, st = this.stats;
      for (const id of b.skillOrder) {
        const ws = this.wstate[id] || (this.wstate[id] = { timer: 0.3 + this.rng() * 0.5, tick: 0 });
        const evo = !!b.evolved[id];
        const s = RS.skillStats(id, b.skills[id], evo);
        if (id === 'bicycle' && evo) { // permanent tornado aura
          ws.tick -= dt;
          ws.angle = (ws.angle || 0) + dt * 9;
          if (ws.tick <= 0) {
            ws.tick = s.cd;
            this.shock(this.player.x, this.player.y, s.radius * st.area, s.dmg, { knock: 40, silentFx: true });
          }
          continue;
        }
        if (id === 'stepover') { this.updateStepover(ws, s, evo, dt); continue; }
        ws.timer -= dt;
        if (ws.timer > 0) continue;
        const fired = this.fire(id, s, evo);
        ws.timer = fired ? s.cd * st.cd : 0.2;
      }
    }

    fire(id, s, evo) {
      const p = this.player, st = this.stats;
      switch (id) {
        case 'kick': {
          const tg = this.nearestEnemies(s.count, 220, this._tg || (this._tg = []));
          if (!tg.length) return false;
          for (let i = 0; i < s.count; i++) {
            const e = tg[i % tg.length];
            const spread = i >= tg.length ? (i - tg.length + 1) * 0.25 * (i % 2 ? 1 : -1) : 0;
            const a = Math.atan2(e.y - p.y, e.x - p.x) + spread;
            this.spawnProj(evo ? 'golden' : 'ball', p.x, p.y, a, s.speed * st.projSpeed, { dmg: s.dmg, pierce: s.pierce, bounce: s.bounce, r: s.r, life: 1.5 });
            if (i === 0 && Math.abs(Math.cos(a)) > 0.2) p.face = Math.cos(a) > 0 ? 1 : -1;
          }
          p.kickT = 0.2;
          this.emit('sfx', { name: 'kick' });
          return true;
        }
        case 'knuckle': {
          const tg = this.nearestEnemies(3, 260, this._tg || (this._tg = []));
          if (!tg.length) return false;
          const e = tg[Math.floor(this.rng() * tg.length)];
          const base = Math.atan2(e.y - p.y, e.x - p.x);
          for (let i = 0; i < s.count; i++) {
            const a = base + (i - (s.count - 1) / 2) * 0.16;
            this.spawnProj(evo ? 'cannon' : 'knuckle', p.x, p.y, a, s.speed * st.projSpeed, { dmg: s.dmg, pierce: s.pierce, r: s.r, life: 1.6, wobble: evo ? 0 : 1, knock: evo ? 60 : 30 });
          }
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
          this.shock(p.x, p.y, R, s.dmg, { knock: 70, silentFx: true });
          this.addFx('swing', p.x, p.y, { r: R, dur: 0.35, follow: true });
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
            stun: s.stun * st.dur, knock: s.knock || 30, hits: new Set(), evo });
          if (s.heal) p.hp = Math.min(st.maxHp, p.hp + s.heal);
          this.emit('sfx', { name: 'siu' });
          this.emit('shout');
          return true;
        }
      }
      return false;
    }

    updateStepover(ws, s, evo, dt) {
      const p = this.player;
      ws.timer -= dt;
      if (ws.timer > 0 || p.dash) return;
      // trigger when an enemy is about to touch
      this.grid.query(p.x, p.y, 34, this._q);
      let threat = null, bd = 1e9;
      for (const e of this._q) {
        if (!e.alive) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        const rr = e.r + p.r + 14;
        if (d < rr * rr && d < bd) { bd = d; threat = e; }
      }
      if (!threat) return;
      let dx, dy;
      if (p.moving) { dx = p.dirx; dy = p.diry; } else {
        dx = p.x - threat.x; dy = p.y - threat.y;
        const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      }
      const dur = 0.16;
      p.dash = { dx, dy, t: 0, dur, speed: s.dist / dur, dmg: s.dmg, hits: new Set(), burst: s.burst || 0, sx: p.x, sy: p.y };
      p.iframe = Math.max(p.iframe, dur + 0.04);
      ws.timer = s.cd * this.stats.cd;
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
      pr.kind = kind; pr.x = x; pr.y = y; pr.vx = Math.cos(a) * speed; pr.vy = Math.sin(a) * speed;
      pr.speed = speed; pr.r = o.r || 3; pr.dmg = o.dmg || 1; pr.pierce = o.pierce || 0; pr.bounce = o.bounce || 0;
      pr.life = o.life || 1.5; pr.t = 0; pr.curve = o.curve || 0; pr.wobble = o.wobble || 0; pr.knock = o.knock || 25;
      pr.critBonus = o.critBonus || 0; pr.team = !!o.team; pr.alive = true; pr.target = o.target || null;
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
        if (pr.curve) {
          const c = Math.cos(pr.curve * dt), s = Math.sin(pr.curve * dt);
          const vx = pr.vx * c - pr.vy * s; pr.vy = pr.vx * s + pr.vy * c; pr.vx = vx;
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
      const res = RS.calcDamage(base, this.stats, { team: o.team, boss: e.boss, critBonus: o.critBonus }, this.rng());
      e.hp -= res.dmg;
      this.dmgDealt += res.dmg;
      if (e.boss) { if (!e.bossDmgIn) e.firstHitT = this.t; e.bossDmgIn += res.dmg; }
      if (e.flash <= -0.06) e.flash = 0.06; // flicker, never stuck white under constant fire
      if (o.knock) {
        const k = e.boss ? o.knock * 0.15 : e.mini ? o.knock * 0.3 : e.elite ? o.knock * 0.4 : o.knock;
        e.kx += (o.kx || 0) * k; e.ky += (o.ky || 0) * k;
      }
      if (o.stun && !e.boss) e.stun = Math.max(e.stun, o.stun * (e.elite || e.mini ? 0.5 : 1)); // bosses are stun-immune
      // damage numbers only where they matter (crits, bosses, 준보스, elites) — plain hits show the spark only
      if (res.crit || e.boss || e.mini || e.elite) this.addText(e.x, e.y - e.r, res.dmg, res.crit);
      // impact spark: a few shards flying away from the hit direction (crits bigger and golden)
      if (this.fx.length < 120) this.addFx('hit', e.x, e.y - 2, { dur: res.crit ? 0.3 : 0.2, kx: o.kx || 0, ky: o.ky || 0, crit: res.crit, seed: this.rng() * 6.28 });
      if (res.crit) { this.emit('sfx', { name: 'crit' }); if (e.boss) this.emit('shake', { k: 0.08 }); }
      if (e.hp <= 0) this.killEnemy(e);
      return res.dmg;
    }

    killEnemy(e) {
      e.alive = false;
      this.kills++;
      const xpv = Math.max(1, Math.round(e.xp * this.tune.xpMul));
      if (e.boss) {
        this.addFx('boom', e.x, e.y, { r: 60, dur: 0.8 });
        // the season ends here, so the loot is banked directly instead of dropped (coins scale with the year)
        this.bossCoins = 30 + 6 * this.yearIdx;
        this.coinsPicked += this.bossCoins;
        for (let i = 0; i < 12; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 50, e.y + (this.rng() - 0.5) * 50, 0);
        if (this.yearDef.final) {
          this.phase = 'victory';
          this.emit('victory');
        } else {
          this.phase = 'clear';
          this.emit('clear');
        }
        this.emit('siuu');
        return;
      }
      if (this.pickups.length < 420) this.dropPickup('gem', e.x, e.y, xpv);
      else this.mergeGem(xpv);
      if (e.elite) this.dropPickup('chest', e.x, e.y, 1);
      if (e.mini) { // 준보스 reward: coins, a heal, sometimes a chest
        for (let i = 0; i < 4; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 24, e.y + (this.rng() - 0.5) * 24, 2);
        this.dropPickup(this.rng() < 0.3 ? 'chest' : 'heal', e.x, e.y + 6, 1);
        this.addFx('boom', e.x, e.y, { r: 30, dur: 0.5 });
        this.emit('miniKill', { name: e.name });
      }
      const r = this.rng();
      if (r < 0.035) this.dropPickup('coin', e.x + 4, e.y, 1);
      else if (r < 0.035 + 1 / 130) this.dropPickup('heal', e.x, e.y, 1);
      else if (r < 0.035 + 1 / 130 + 1 / 420) this.dropPickup('magnet', e.x, e.y, 1);
      this.addFx('poof', e.x, e.y, { dur: 0.3, big: e.elite || e.type === 'tank', seed: this.rng() * 6.28 });
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
        const lv = m.ref.lv;
        m.anim += dt;
        const ox = Math.cos(m.slot * 2.1 + 2.4) * 22, oy = Math.sin(m.slot * 2.1 + 2.4) * 16 + 4;
        const follow = (k) => {
          const tx = p.x + ox, ty = p.y + oy;
          const dx = tx - m.x, dy = ty - m.y;
          m.x += dx * Math.min(1, k * dt); m.y += dy * Math.min(1, k * dt);
          if (Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
        };
        if (m.role === 'defender') {
          m.angle += (2.2 + 0.25 * lv) * dt;
          const R = 26 + 2 * lv;
          m.x = p.x + Math.cos(m.angle) * R; m.y = p.y + Math.sin(m.angle) * R;
          m.face = Math.cos(m.angle + Math.PI / 2) > 0 ? 1 : -1;
          this.grid.query(m.x, m.y, 24, this._q);
          for (const e of this._q) {
            if (!e.alive || this.t - e.dHit < 0.45) continue;
            const rr = e.r + 7 + lv;
            if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > rr * rr) continue;
            e.dHit = this.t;
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            this.damageEnemy(e, 6 + 4 * lv, { team: true, knock: 110 + 15 * lv, kx: dx / d, ky: dy / d });
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
              this.damageEnemy(e, 10 + 6 * lv, { team: true, knock: 140, kx: dx / d, ky: dy / d });
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
              this.damageEnemy(e, 10 + 7 * lv, { team: true, knock: 60, kx: -d.dy, ky: d.dx });
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
                m.dash = { dx: dx / d, dy: dy / d, t: 0, dur: (140 + 20 * lv) / 330, hits: new Set() };
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
              const pr = this.spawnProj('pass', m.x, m.y, 0, 260, { dmg: 24 + 12 * lv, pierce: 2 + Math.floor(lv / 2), r: 3, life: 2 });
              pr.team = true;
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
                this.spawnProj('mateball', m.x, m.y, base + (i - (n - 1) / 2) * 0.18, 250, { dmg: 8 + 4 * lv, r: 3, life: 1.2, team: true });
              }
              m.face = e.x > m.x ? 1 : -1;
            }
          }
        }
      }
    }

    // A midfielder's pass reached 날두: he shoots a power shot at the nearest enemy.
    mateShot(dmg, pierce) {
      const p = this.player;
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
        if (e.stun > 0) e.stun -= dt;
        else if (e.boss) this.bossAI(e, dt, dx, dy, d);
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
        if (d2 < cr * cr) this.hurtPlayer(e.charging ? Math.round(e.dmg * 1.5) : e.dmg, e);
        // recycle stragglers in front of the player
        if (!e.boss && !e.lineVx && !e.lineVy && d2 > recycle2) {
          let a = this.rng() * TAU;
          if (p.moving) a = Math.atan2(p.diry, p.dirx) + (this.rng() - 0.5) * 2;
          e.x = p.x + Math.cos(a) * R; e.y = p.y + Math.sin(a) * R;
        }
      }
    }

    enemyShot(kind, x, y, a, speed, dmg, r, curve, o) {
      if (this.eprojs.length > 300) return null;
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
      const rate = dealt / Math.max(0.5, now - since);
      const want = Math.max(e.baseHp, rate * this.bossTarget(e));
      if (Math.abs(want - e.maxHp) / e.maxHp < 0.1) return;
      const k = want / e.maxHp; // keep the HP-bar fraction: the change is invisible
      e.maxHp = Math.round(e.maxHp * k);
      e.hp = Math.max(1, Math.round(e.hp * k));
    }
    bossTarget(e) { return RS.BOSS_FIGHT_SECONDS * RS.BOSS_TYPES[this.yearDef.boss.type].fight * this.tune.bossFight; }

    bossActions(e) {
      const ai = e.ai;
      if (ai.kind !== 'messi') return RS.BOSS_TYPES[ai.kind].actions;
      return ai.phase === 1 ? RS.MESSI.phase1 : RS.MESSI.phase2;
    }

    bossAI(e, dt, dx, dy, d) {
      const ai = e.ai;
      const isMessi = ai.kind === 'messi';
      if (isMessi && ai.phase === 1 && e.hp <= e.maxHp * 0.5) {
        ai.phase = 2;
        ai.act = { kind: 'roar', t: 0, stage: 0, n: 0 };
        e.invuln = true;
        e.tele = null;
        this.emit('rage');
        this.emit('banner', { text: '메시 분노! 2페이즈' });
      }
      if (e.bossDmgIn && e.calibrated < RS.BOSS_CALIBRATE_AT.length && this.t - e.firstHitT >= RS.BOSS_CALIBRATE_AT[e.calibrated]) { e.calibrated++; this.calibrateBoss(e); }
      if (ai.act) { this.runBossAct(e, ai.act, dt, dx, dy, d); return; }
      // movement between attacks
      const sp = e.speed;
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
      if (ai.cool <= 0) {
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
      ai.cool = RS.BOSS_TYPES[ai.kind].cool * (ai.kind === 'messi' && ai.phase === 2 ? RS.MESSI.rageCool : 1) * this.tune.bossCool;
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
              if ((p.x - a.spot.x) ** 2 + (p.y - a.spot.y) ** 2 < (34 + p.r) ** 2) this.hurtPlayer(Math.round(e.dmg * 1.3), e);
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
      const isMessi = e.ai.kind === 'messi';
      const rage = isMessi && e.ai.phase === 2;
      const ball = isMessi ? 'mball' : 'ball';
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
          if (a.t >= 1.6) { e.invuln = false; e.speed *= RS.MESSI.rageSpeed; this.endAct(e); }
          break;
        // Dashes: 'dash' aims where the player will be; 'cut' runs across the player's escape path;
        // 'dribble'/'dribble3' are 메시's (3 chained in rage).
        case 'dash': case 'cut': case 'dribble': case 'dribble3': {
          const chain = a.kind === 'dribble3' ? 3 : 1;
          const tele = a.kind === 'dash' ? 0.8 : a.kind === 'cut' ? 0.75 : a.kind === 'dribble' ? 0.65 : 0.5;
          const speed = a.kind === 'dash' ? 300 : a.kind === 'cut' ? 330 : a.kind === 'dribble' ? 380 : 430;
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
          const speed = a.kind === 'fan' ? 120 + 2 * this.yearIdx : 170;
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
              this.enemyShot(ball, e.x, e.y, aim + side * kk, isMessi ? 165 : 125 + 1.5 * this.yearIdx, pdmg, 3, -side * kk * 1.1,
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
          const speed = 380 + 5 * this.yearIdx;
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
              for (const off of offs) this.enemyShot(isMessi ? 'mball' : 'ball', e.x, e.y, a.dir + off, speed, Math.round(pdmg * (off ? 0.9 : 1.2)), 4, 0, { power: true });
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
            const n = 5 + Math.min(4, Math.floor(this.yearIdx / 5));
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
            const n = isMessi ? 4 : 6 + Math.min(6, Math.floor(this.yearIdx / 3));
            for (let i = 0; i < n; i++) {
              const ang = i / n * TAU;
              this.spawnEnemy(isMessi ? 'minimessi' : 'grunt', e.x + Math.cos(ang) * 30, e.y + Math.sin(ang) * 30, { minion: true });
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
              this.enemyShot(ball, x, y, ang + Math.PI, isMessi ? 95 : 62 + this.yearIdx, pdmg, 3, 0, { wait: 0.7, life: 3.4 });
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
        case 'heal': p.hp = Math.min(this.stats.maxHp, p.hp + 30); this.addFx('heal', p.x, p.y, { dur: 0.5 }); this.emit('sfx', { name: 'heal' }); break;
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
      this.choices = RS.makeChoices(this.build, this.rng, this.yearIdx, 3);
      this.addFx('levelburst', this.player.x, this.player.y, { dur: 0.7, follow: true });
      this.emit('levelup', { level: this.build.level });
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
      this.choices = RS.makeChoices(this.build, this.rng, this.yearIdx, 3);
      return true;
    }

    applyChoiceRuntime(c) {
      const ok = RS.applyChoice(this.build, c);
      if (!ok) return false;
      if (c.kind === 'gold') this.coinsPicked += 30;
      if (c.kind === 'heal') this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * 0.4);
      if (c.kind === 'mate' && this.build.teammates.some((m) => m.id === c.id)) this.spawnMateRuntime(this.build.teammates.find((m) => m.id === c.id));
      if (c.kind === 'evolve') { this.emit('evolve', { id: c.id }); this.emit('siuu'); this.emit('banner', { text: '진화! ' + RS.SKILLS[c.id].evoName }); }
      this.recalc();
      return true;
    }

    openChest() {
      const res = [];
      const evos = RS.availableEvolutions(this.build);
      if (evos.length) {
        const c = { kind: 'evolve', id: evos[0] };
        this.applyChoiceRuntime(Object.assign(c, { name: RS.SKILLS[c.id].evoName, icon: RS.SKILLS[c.id].evoIcon, desc: RS.SKILLS[c.id].evoDesc, tag: '진화!' }));
        res.push(c);
      } else {
        const n = this.rng() < 0.25 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const opts = RS.makeChoices(this.build, this.rng, this.yearIdx, 3).filter((c) => c.kind !== 'mate');
          const c = opts[0] || { kind: 'gold', id: 'gold', name: '스폰서 보너스', icon: '💰', desc: '코인 +30', tag: '보너스' };
          if (this.applyChoiceRuntime(c)) res.push(c);
        }
      }
      const coins = 10 + this.yearIdx * 2;
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
    power() { return RS.powerScore(this.build); }
    result() {
      const cleared = this.phase === 'clear' || this.phase === 'victory';
      const base = this.coinsPicked + this.kills / 8 + (cleared ? 40 + 8 * this.yearIdx : 0);
      return { cleared, kills: this.kills, time: this.t, level: this.build.level, coins: Math.round(base * this.stats.gold), recruited: this.recruitedThisRun.slice() };
    }
  }
  RS.World = World;

  // ================================================================ Simple bot (tests, attract mode)
  RS.botInput = function (w) {
    const p = w.player;
    let vx = 0, vy = 0;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      const R = e.boss ? 130 : 75;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) || 1;
      const k = (e.boss ? 3 : 1) / (d * d) * 400;
      vx += dx / d * k; vy += dy / d * k;
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
    const danger = Math.hypot(vx, vy);
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

  // Strong default bot. Picks: evolution > passive that unlocks an evolution path > skill upgrade > ...
  RS.botChoose = function (choices, build) {
    const pr = { evolve: 0, skillUp: 2, mate: 3, skill: 4, passive: 5, passiveUp: 6, mateUp: 7, heal: 8, gold: 9 };
    const score = (c) => (c.kind === 'passive' && build && RS.isPairPassive(build, c.id) ? 1 : pr[c.kind]);
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
