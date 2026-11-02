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
      teammates: [], // [{id, lv}]
      coachCards: [] // card ids, stack for the career
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
    return b;
  };

  RS.xpToNext = function (level) {
    return Math.floor(6 + level * 5 + Math.max(0, level - 12) * 6 + Math.max(0, level - 30) * 12);
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
    return {
      dmg: 1 + a.dmg, cd: Math.max(0.45, 1 + a.cd), area: 1 + a.area, projSpeed: 1 + a.projSpeed,
      move: 78 * (1 + a.moveSpeed), maxHp: Math.round(100 + a.hp), magnet: 30 * (1 + a.magnet),
      crit: Math.min(0.9, 0.05 + a.crit), dur: 1 + a.dur, regen: a.regen, armor: a.armor, xp: 1 + a.xp,
      gold: 1 + a.gold, teamDmg: 1 + a.teamDmg, teamCd: Math.max(0.5, 1 + a.teamCd), bossDmg: 1 + a.bossDmg,
      revive: a.revive, reroll: a.reroll
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
    const owned = new Set(build.teammates.map((m) => m.id));
    const eras = onlyCurrentEra ? [RS.YEARS[yearIdx].era] : RS.erasUpTo(yearIdx);
    return Object.keys(RS.TEAMMATES).filter((id) => !owned.has(id) && eras.includes(RS.TEAMMATES[id].era));
  };
  RS.addMate = function (build, id) {
    if (build.teammates.length >= RS.MAX_MATES) return false;
    if (build.teammates.some((m) => m.id === id) || !RS.TEAMMATES[id]) return false;
    build.teammates.push({ id, lv: 1 });
    return true;
  };
  RS.levelMate = function (build, id, n) {
    const m = build.teammates.find((x) => x.id === id);
    if (!m || m.lv >= RS.MATE_MAX_LV) return false;
    m.lv = Math.min(RS.MATE_MAX_LV, m.lv + (n || 1));
    return true;
  };

  // ================================================================ Level-up choices
  function describe(c, build) {
    switch (c.kind) {
      case 'skill': { const s = RS.SKILLS[c.id]; return Object.assign(c, { name: s.name, icon: s.icon, desc: s.desc, tag: '새 스킬' }); }
      case 'skillUp': { const s = RS.SKILLS[c.id]; const nl = build.skills[c.id] + 1;
        return Object.assign(c, { name: s.name, icon: s.icon, desc: s.ups[nl - 1], tag: 'Lv.' + nl + (nl === RS.SKILL_MAX ? ' MAX' : '') }); }
      case 'evolve': { const s = RS.SKILLS[c.id]; return Object.assign(c, { name: s.evoName, icon: s.evoIcon, desc: s.evoDesc, tag: '진화!' }); }
      case 'passive': { const p = RS.PASSIVES[c.id]; return Object.assign(c, { name: p.name, icon: p.icon, desc: p.desc, tag: '새 패시브' }); }
      case 'passiveUp': { const p = RS.PASSIVES[c.id]; const nl = build.passives[c.id] + 1;
        return Object.assign(c, { name: p.name, icon: p.icon, desc: p.desc, tag: 'Lv.' + nl + (nl === RS.PASSIVE_MAX ? ' MAX' : '') }); }
      case 'mate': { const m = RS.TEAMMATES[c.id]; const r = RS.ROLES[m.role];
        return Object.assign(c, { name: m.name, icon: '🤝', desc: r.desc, tag: '동료 합류 · ' + r.name }); }
      case 'mateUp': { const m = RS.TEAMMATES[c.id]; const cur = build.teammates.find((x) => x.id === c.id).lv;
        return Object.assign(c, { name: m.name, icon: '📈', desc: RS.ROLES[m.role].name + ' 능력 강화', tag: '동료 Lv.' + (cur + 1) }); }
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
    if (build.passiveOrder.length < RS.MAX_PASSIVES) {
      // Prefer passives that pair with owned skills (helps reach evolutions).
      for (const id in RS.PASSIVES) if (!build.passives[id]) {
        const pairs = build.skillOrder.some((s) => RS.SKILLS[s].passive === id);
        pool.push({ kind: 'passive', id, w: pairs ? 1.8 : 0.9 });
      }
    }
    if (build.teammates.length < RS.MAX_MATES) {
      const cands = RS.mateCandidates(build, yearIdx || 0, false);
      for (const id of cands) pool.push({ kind: 'mate', id, w: 1.6 / Math.max(1, cands.length / 2) });
    }
    for (const m of build.teammates) if (m.lv < RS.MATE_MAX_LV) pool.push({ kind: 'mateUp', id: m.id, w: 1.2 });
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
        if (build.passives[c.id] || build.passiveOrder.length >= RS.MAX_PASSIVES) return false;
        build.passives[c.id] = 1; build.passiveOrder.push(c.id); return true;
      case 'passiveUp':
        if (!build.passives[c.id] || build.passives[c.id] >= RS.PASSIVE_MAX) return false;
        build.passives[c.id]++; return true;
      case 'mate': return RS.addMate(build, c.id);
      case 'mateUp': return RS.levelMate(build, c.id, 1);
      case 'gold': case 'heal': return true;
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
      this.player = { x: 0, y: 0, r: 6, hp: 100, iframe: 0, dirx: 1, diry: 0, face: 1, moving: false,
        dash: null, jump: 0, animT: 0, revived: false, hurtT: 0 };
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
      if (idx >= 1) s.push({ t: T * 0.3, kind: 'press' });
      s.push({ t: T * 0.4, kind: 'elite' });
      s.push({ t: T * 0.5, kind: 'circle' });
      s.push({ t: T * 0.75, kind: 'elite' });
      if (idx >= 4) s.push({ t: T * 0.82, kind: 'press' });
      s.push({ t: T, kind: 'boss' });
      return s;
    }

    // ------------------------------------------------------------ main step
    update(dt, input) {
      if (this.phase !== 'play') { this.updateFx(dt); return; }
      this.frame++;
      this.t += dt;
      const p = this.player;

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
      } else if (kind === 'boss') this.spawnBoss();
    }

    updateSpawns(dt) {
      const prog = Math.min(1, this.t / this.stageTime);
      const rate = this.tune.spawnRate * (0.9 + 1.8 * prog) * (this.bossSpawned ? 0.45 : 1);
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
      e.uid = UID++; e.type = type; e.sprite = def.sprite; e.x = x; e.y = y; e.alive = true;
      e.r = def.r; e.speed = def.speed * tu.speedMul * (0.9 + this.rng() * 0.2);
      e.maxHp = e.hp = Math.round(def.hp * tu.hpMul);
      e.dmg = Math.round(def.dmg * tu.dmgMul);
      e.xp = def.xp; e.ranged = !!def.ranged; e.shootT = 1.5 + this.rng() * 2;
      e.stun = 0; e.kx = 0; e.ky = 0; e.flash = -1; e.elite = !!opt.elite; e.boss = false; e.ai = null;
      e.invuln = false; e.tele = null; e.lineVx = 0; e.lineVy = 0; e.life = 0; e.dHit = -9; e.face = 1;
      e.anim = this.rng() * 10; e.minion = !!opt.minion;
      if (e.elite) { e.maxHp = e.hp = e.hp * 9; e.r = Math.round(e.r * 1.5); e.dmg = Math.round(e.dmg * 1.4); e.xp *= 12; e.speed *= 1.1; }
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
      e.maxHp = e.hp = Math.round(bt.hp * this.tune.hpMul);
      e.dmg = Math.round(bt.dmg * this.tune.dmgMul);
      e.xp = 40;
      e.name = yd.boss.name;
      e.ai = { kind: yd.boss.type, cool: 1.8, act: null, last: null, phase: 1, coolMul: 1, keep: yd.boss.type === 'messi' ? 105 : 0, strafe: 1 };
      this.boss = e;
      this.emit('boss', { name: e.name, final: !!yd.final });
      return e;
    }

    spawnRescue() {
      if (this.build.teammates.length >= RS.MAX_MATES) return;
      let cands = RS.mateCandidates(this.build, this.yearIdx, true);
      if (!cands.length) cands = RS.mateCandidates(this.build, this.yearIdx, false);
      if (!cands.length) return;
      const id = this.rng.pick(cands);
      const a = this.rng() * TAU;
      const d = Math.min(this.view.w, this.view.h) * 0.42 + 40;
      this.rescue = { id, x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d, progress: 0, need: 1.0 };
      this.emit('rescueSpawn', { id });
    }

    updateRescue(dt) {
      const r = this.rescue;
      if (!r) return;
      const p = this.player;
      const d = Math.hypot(p.x - r.x, p.y - r.y);
      if (d < 22) r.progress += dt; else r.progress = Math.max(0, r.progress - dt * 0.5);
      if (r.progress >= r.need) {
        if (RS.addMate(this.build, r.id)) {
          this.spawnMateRuntime(this.build.teammates[this.build.teammates.length - 1], r.x, r.y);
          this.recruitedThisRun.push(r.id);
          this.emit('recruit', { id: r.id });
          this.addFx('shock', r.x, r.y, { r: 30, dur: 0.4, color: '#7fe0ff' });
        }
        this.rescue = null;
      }
    }

    // ------------------------------------------------------------ player
    updatePlayer(dt, input) {
      const p = this.player;
      p.iframe = Math.max(0, p.iframe - dt);
      p.hurtT = Math.max(0, p.hurtT - dt);
      p.jump = Math.max(0, p.jump - dt);
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
        if (d.t >= d.dur) {
          if (d.burst) this.shock(d.sx, d.sy, d.burst * this.stats.area, d.dmg, { color: '#c9a0ff', knock: 120 });
          p.dash = null;
        }
      } else {
        p.x += ix * this.stats.move * dt;
        p.y += iy * this.stats.move * dt;
      }
    }

    hurtPlayer(dmg, src) {
      const p = this.player;
      if (p.iframe > 0 || p.dash || this.debug.godMode || this.phase !== 'play') return;
      const d = Math.max(1, Math.round(dmg - this.stats.armor));
      p.hp -= d;
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
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d > md) continue;
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
          }
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
      p.iframe = Math.max(p.iframe, dur + 0.12);
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
      if (e.flash <= -0.06) e.flash = 0.06; // flicker, never stuck white under constant fire
      if (o.knock) {
        const k = e.boss ? o.knock * 0.15 : e.elite ? o.knock * 0.4 : o.knock;
        e.kx += (o.kx || 0) * k; e.ky += (o.ky || 0) * k;
      }
      if (o.stun) e.stun = Math.max(e.stun, e.boss ? o.stun * 0.15 : e.elite ? o.stun * 0.5 : o.stun);
      this.addText(e.x, e.y - e.r, res.dmg, res.crit);
      if (e.hp <= 0) this.killEnemy(e);
      return res.dmg;
    }

    killEnemy(e) {
      e.alive = false;
      this.kills++;
      const xpv = Math.max(1, Math.round(e.xp * this.tune.xpMul));
      if (e.boss) {
        this.addFx('boom', e.x, e.y, { r: 60, dur: 0.8 });
        this.dropPickup('chest', e.x, e.y, 1);
        for (let i = 0; i < 12; i++) this.dropPickup('coin', e.x + (this.rng() - 0.5) * 50, e.y + (this.rng() - 0.5) * 50, 2);
        this.dropPickup('gem', e.x, e.y, xpv * 5);
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
      const r = this.rng();
      if (r < 0.035) this.dropPickup('coin', e.x + 4, e.y, 1);
      else if (r < 0.035 + 1 / 130) this.dropPickup('heal', e.x, e.y, 1);
      else if (r < 0.035 + 1 / 130 + 1 / 420) this.dropPickup('magnet', e.x, e.y, 1);
      this.addFx('poof', e.x, e.y, { dur: 0.25 });
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
          const R = 26 + 5 * lv;
          for (const ep of this.eprojs) {
            if (!ep.alive) continue;
            if ((ep.x - m.x) ** 2 + (ep.y - m.y) ** 2 < R * R) {
              ep.alive = false;
              this.addFx('save', ep.x, ep.y, { dur: 0.3 });
              m.punch = 0.2;
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
        // contact damage
        const cr = e.r + p.r - 2;
        if (d2 < cr * cr) this.hurtPlayer(e.dmg, e);
        // recycle stragglers in front of the player
        if (!e.boss && !e.lineVx && !e.lineVy && d2 > recycle2) {
          let a = this.rng() * TAU;
          if (p.moving) a = Math.atan2(p.diry, p.dirx) + (this.rng() - 0.5) * 2;
          e.x = p.x + Math.cos(a) * R; e.y = p.y + Math.sin(a) * R;
        }
      }
    }

    enemyShot(kind, x, y, a, speed, dmg, r, curve) {
      if (this.eprojs.length > 260) return;
      this.eprojs.push({ kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: r || 3, dmg, life: 5, curve: curve || 0, alive: true, t: 0 });
    }

    updateEProjs(dt) {
      const p = this.player;
      for (const ep of this.eprojs) {
        if (!ep.alive) continue;
        ep.t += dt;
        if (ep.curve) {
          const c = Math.cos(ep.curve * dt), s = Math.sin(ep.curve * dt);
          const vx = ep.vx * c - ep.vy * s; ep.vy = ep.vx * s + ep.vy * c; ep.vx = vx;
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
    bossAI(e, dt, dx, dy, d) {
      const ai = e.ai;
      const isMessi = ai.kind === 'messi';
      if (isMessi && ai.phase === 1 && e.hp <= e.maxHp * 0.5) {
        ai.phase = 2;
        ai.act = { kind: 'roar', t: 0 };
        e.invuln = true;
        e.tele = null;
        this.emit('rage');
        this.emit('banner', { text: '메시 분노! 2페이즈' });
      }
      if (ai.act) { this.runBossAct(e, ai.act, dt, dx, dy, d); return; }
      // movement between attacks
      const sp = e.speed * (isMessi ? (ai.phase === 2 ? 1.25 : 1) : 1);
      if (ai.keep) {
        const want = d > ai.keep + 20 ? 1 : d < ai.keep - 20 ? -1 : 0;
        if (this.rng() < dt * 0.4) ai.strafe = -ai.strafe;
        const tx = -dy / d * ai.strafe, ty = dx / d * ai.strafe;
        e.x += (dx / d * want + tx * 0.8) * sp * dt;
        e.y += (dy / d * want + ty * 0.8) * sp * dt;
      } else {
        e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
      }
      ai.cool -= dt;
      if (ai.cool <= 0) {
        let list;
        if (isMessi) list = ai.phase === 1 ? ['dribble', 'curl', 'volley'] : ['dribble3', 'curl', 'volley2', 'summon', 'dribble3'];
        else list = RS.BOSS_TYPES[ai.kind].actions;
        let k = this.rng.pick(list);
        if (k === ai.last && list.length > 1) k = this.rng.pick(list.filter((x) => x !== ai.last));
        ai.last = k;
        ai.act = { kind: k, t: 0, stage: 0, n: 0 };
        if (isMessi) ai.history = (ai.history || []).concat(k).slice(-12);
      }
    }

    endAct(e) {
      const ai = e.ai;
      ai.act = null;
      e.tele = null;
      const base = ai.kind === 'messi' ? RS.BOSS_TYPES.messi.cool : RS.BOSS_TYPES[ai.kind].cool;
      ai.cool = base * (ai.kind === 'messi' && ai.phase === 2 ? 0.62 : 1);
    }

    runBossAct(e, a, dt, dx, dy, d) {
      const p = this.player;
      a.t += dt;
      const aim = Math.atan2(dy, dx);
      const pdmg = Math.round(e.dmg * 0.75);
      const isMessi = e.ai.kind === 'messi';
      switch (a.kind) {
        case 'roar':
          if (a.stage === 0) {
            a.stage = 1;
            this.addFx('shock', e.x, e.y, { r: 140, dur: 0.8, color: '#7ec8ff' });
            const n = d || 1;
            p.x += (p.x - e.x) / n * 30; p.y += (p.y - e.y) / n * 30;
            for (const o of this.enemies) if (o !== e && o.alive && !o.boss) { o.stun = Math.max(o.stun, 0.6); }
          }
          if (a.t >= 1.6) { e.invuln = false; e.speed *= 1.3; this.endAct(e); }
          break;
        case 'dash': case 'dribble': case 'dribble3': {
          const chain = a.kind === 'dribble3' ? 3 : 1;
          const tele = a.kind === 'dash' ? 0.85 : a.kind === 'dribble' ? 0.7 : 0.48;
          const speed = a.kind === 'dash' ? 300 : a.kind === 'dribble' ? 380 : 430;
          const dur = a.kind === 'dash' ? 0.7 : 0.72;
          if (a.stage === 0) { // telegraph
            if (!a.dir) { a.dir = aim; this.emit('sfx', { name: 'warn' }); }
            e.tele = { kind: 'line', x: e.x, y: e.y, a: a.dir, len: speed * dur, p: Math.min(1, a.t / tele) };
            if (a.t >= tele) { a.stage = 1; a.t = 0; e.tele = null; this.emit('sfx', { name: 'dash' }); }
          } else if (a.stage === 1) {
            e.x += Math.cos(a.dir) * speed * dt; e.y += Math.sin(a.dir) * speed * dt;
            if (Math.floor(a.t * 60) % 3 === 0) this.addFx('bghost', e.x, e.y, { dur: 0.3, sprite: e.sprite, face: Math.cos(a.dir) > 0 ? 1 : -1 });
            if (a.t >= dur) {
              a.n++;
              if (a.n < chain) { a.stage = 0; a.t = 0; a.dir = null; }
              else { a.stage = 2; a.t = 0; }
            }
          } else if (a.t >= 0.35) this.endAct(e);
          break;
        }
        case 'fan': case 'volley': case 'volley2': {
          const waves = a.kind === 'volley2' ? 2 : a.kind === 'fan' ? 2 : 1;
          const n = a.kind === 'fan' ? 5 : a.kind === 'volley' ? 7 : 9;
          const spread = a.kind === 'fan' ? 0.8 : 1.15;
          const speed = a.kind === 'fan' ? 120 : 150;
          if (a.t >= 0.35 + a.n * 0.45 && a.n < waves) {
            const off = (a.n % 2) * (spread / (n - 1)) * 0.5;
            for (let i = 0; i < n; i++) this.enemyShot(isMessi ? 'mball' : 'ball', e.x, e.y, aim - spread / 2 + spread * i / (n - 1) + off, speed, pdmg, 3);
            a.n++;
            this.emit('sfx', { name: 'shoot' });
          }
          if (a.n >= waves && a.t > 0.35 + waves * 0.45) this.endAct(e);
          break;
        }
        case 'ring': {
          if (a.n < 2 && a.t >= 0.3 + a.n * 0.5) {
            const n = 14;
            for (let i = 0; i < n; i++) this.enemyShot('ball', e.x, e.y, (i + a.n * 0.5) / n * TAU, 95, pdmg, 3);
            a.n++;
            this.emit('sfx', { name: 'shoot' });
          }
          if (a.n >= 2 && a.t > 1.3) this.endAct(e);
          break;
        }
        case 'curl': {
          const n = isMessi ? (e.ai.phase === 2 ? 5 : 3) : 4;
          if (a.n === 0 && a.t >= 0.3) {
            for (let i = 0; i < n; i++) {
              const side = i % 2 ? 1 : -1;
              const k = 0.7 + 0.25 * Math.floor(i / 2);
              this.enemyShot(isMessi ? 'mball' : 'ball', e.x, e.y, aim + side * k, 135, pdmg, 3, -side * k * 1.25);
            }
            a.n = 1;
            this.emit('sfx', { name: 'curl' });
          }
          if (a.t > 0.9) this.endAct(e);
          break;
        }
        case 'burst': {
          if (a.n < 5 && a.t >= 0.3 + a.n * 0.13) {
            this.enemyShot('ball', e.x, e.y, aim + (this.rng() - 0.5) * 0.2, 170, pdmg, 3);
            a.n++;
          }
          if (a.n >= 5 && a.t > 1.1) this.endAct(e);
          break;
        }
        case 'cards': {
          if (a.n === 0 && a.t >= 0.4) {
            for (let i = 0; i < 5; i++) this.enemyShot('card', e.x, e.y, aim - 0.6 + i * 0.3, 110, pdmg, 3);
            this.enemyShot('redcard', e.x, e.y, aim, 70, Math.round(pdmg * 1.8), 6);
            a.n = 1;
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
        case 'slam': {
          if (a.stage === 0) {
            if (!a.tx) { a.tx = p.x; a.ty = p.y; this.emit('sfx', { name: 'warn' }); }
            e.tele = { kind: 'circle', x: a.tx, y: a.ty, r: 48, p: Math.min(1, a.t / 1.0) };
            if (a.t >= 1.0) {
              a.stage = 1;
              e.tele = null;
              this.addFx('shock', a.tx, a.ty, { r: 48, dur: 0.4, color: '#ff8a5c' });
              this.emit('sfx', { name: 'thud' });
              if ((p.x - a.tx) ** 2 + (p.y - a.ty) ** 2 < (48 + p.r) ** 2) this.hurtPlayer(Math.round(e.dmg * 1.2), e);
            }
          } else if (a.t > 1.4) this.endAct(e);
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
      if (c.kind === 'mate') this.spawnMateRuntime(this.build.teammates[this.build.teammates.length - 1]);
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
      const dx = p.x - ep.x, dy = p.y - ep.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 60 * 60) continue;
      const d = Math.sqrt(d2) || 1;
      vx += dx / d * 4 / Math.max(1, d / 15); vy += dy / d * 4 / Math.max(1, d / 15);
    }
    if (w.boss && w.boss.alive && w.boss.tele) {
      const t = w.boss.tele;
      if (t.kind === 'circle') { const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy) || 1; if (d < t.r + 20) { vx += dx / d * 6; vy += dy / d * 6; } }
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

  RS.botChoose = function (choices) {
    const pr = { evolve: 0, skillUp: 1, mate: 2, skill: 3, passive: 4, passiveUp: 5, mateUp: 6, heal: 7, gold: 8 };
    let bi = 0;
    for (let i = 1; i < choices.length; i++) if (pr[choices[i].kind] < pr[choices[bi].kind]) bi = i;
    return bi;
  };
})(globalThis.RS = globalThis.RS || {});
