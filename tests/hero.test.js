// 메시 playable hero: own career years, orbiting golden balls, faster feet, 3 s slide, 날두 as the final boss.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');

test('메시 career data is valid: youth first, debut at 17 in 2004 with 딩요, ends with 날두', () => {
  RS.selectHero('messi');
  assert.equal(RS.YEARS, RS.YEARS_MESSI);
  const debut = RS.YEARS.findIndex((y) => y.year === 2004);
  assert.ok(debut >= 3, 'youth seasons before the debut');
  assert.ok(RS.YEARS.slice(0, debut).every((y) => y.youth), 'everything before 2004 is youth');
  assert.equal(RS.yearAge(debut), 17);
  assert.equal(RS.YEARS.find((y) => y.event === 'hgh').youth, true, 'the growth-hormone choice is in the youth');
  assert.equal(RS.YEARS[debut].event, 'dingyo', "딩요's tutoring at the debut");
  for (const y of RS.YEARS) if (y.event) assert.ok(RS.EVENTS[y.event], y.year + ' event');
  const last = RS.YEARS[RS.YEARS.length - 1];
  assert.equal(last.final, true);
  assert.equal(last.boss.type, 'ronaldo');
  for (const y of RS.YEARS) {
    assert.ok(RS.ERAS[y.era], y.year + ' era');
    assert.ok(RS.COACHES[y.coach], y.year + ' coach');
    assert.ok(RS.BOSS_TYPES[y.boss.type], y.year + ' boss');
    assert.ok(y.story && y.title, y.year + ' story');
  }
  const eras = new Set(RS.YEARS.map((y) => y.era));
  for (const era of eras) assert.ok(Object.values(RS.TEAMMATES).some((m) => m.era === era), era + ' has teammates');
  const ids = new Set();
  for (const c of Object.values(RS.COACHES)) for (const card of c.cards) { assert.ok(!ids.has(card.id), 'duplicate coach card ' + card.id); ids.add(card.id); }
  RS.selectHero('ronaldo');
  assert.equal(RS.YEARS, RS.YEARS_RONALDO);
});

test('메시 has his own moves, passives and items: nothing of 날두 crosses over (and back)', () => {
  for (const id of ['kick', 'knuckle', 'header', 'bicycle', 'stepover', 'scissors', 'siuu', 'rabona', 'trail']) assert.equal(RS.SKILLS[id].hero, 'ronaldo', id + ' is 날두-only');
  for (const id of Object.keys(RS.SKILLS)) assert.ok(RS.SKILLS[id].hero, id + ' belongs to one hero');
  assert.equal(RS.passiveFor('jump', 'messi'), false);
  assert.equal(RS.passiveFor('flex', 'messi'), false);
  assert.equal(RS.passiveFor('leftfoot', 'ronaldo'), false);
  assert.equal(RS.passiveFor('recovery', 'messi'), true, 'unpaired training is shared');
  assert.equal(RS.relicFor('honaldo', 'messi'), false);
  assert.equal(RS.relicFor('messia', 'ronaldo'), false);
  const m = RS.newBuild('messi');
  assert.deepEqual(m.skillOrder, ['orbit']);
  assert.equal(m.hero, 'messi');
  const r = RS.newBuild('ronaldo');
  assert.deepEqual(r.skillOrder, ['kick']);
  const rng = RS.makeRng(4);
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    for (const c of RS.makeChoices(m, rng, 4)) {
      seen.add(c.id);
      if (c.kind === 'skill') assert.equal(RS.SKILLS[c.id].hero, 'messi', '메시 offered ' + c.id);
      if (c.kind === 'passive') assert.ok(RS.passiveFor(c.id, 'messi'), '메시 offered ' + c.id);
      assert.notEqual(c.id, 'elastico', 'a gift move is never dealt');
    }
    for (const c of RS.makeChoices(r, rng, 4)) {
      if (c.kind === 'skill') assert.equal(RS.SKILLS[c.id].hero, 'ronaldo', '날두 offered ' + c.id);
      if (c.kind === 'passive') assert.ok(RS.passiveFor(c.id, 'ronaldo'), '날두 offered ' + c.id);
    }
    const sp = RS.drawRelic(m, rng, { super: 1 }, true);
    assert.ok(sp && sp.id !== 'honaldo', '메시 super item: ' + (sp && sp.id));
  }
  for (const id of ['tiki', 'curler', 'solo', 'bobo', 'killpass', 'chip']) assert.ok(seen.has(id), '메시 is offered ' + id);
});

test('growth hormone = difficulty: a small body until the treatment; refusing it keeps it (하드 모드)', () => {
  RS.selectHero('messi');
  const save = RS.newSave(); save.career.build = RS.newBuild('messi');
  const small = RS.computeStats(save.career.build, {});
  const big = RS.computeStats(Object.assign(RS.newBuild('messi'), { hgh: true }), {});
  assert.equal(small.maxHp, big.maxHp - 30);
  assert.ok(Math.abs(small.dmg - (big.dmg - 0.2)) < 1e-9);
  assert.equal(RS.smallBody(save.career.build), true);
  assert.equal(RS.hardMode(save.career.build), false, 'undecided is not 하드 모드');
  const hi = RS.YEARS.findIndex((y) => y.event === 'hgh');
  save.career.yearIdx = hi;
  assert.equal(RS.needsEvent(save, hi), true);
  assert.equal(RS.needsEvent(save, 0), false, 'not in replays or other seasons');
  const cards = RS.eventChoices(save, hi);
  assert.deepEqual(cards.map((c) => c.hgh), [true, false]);
  const hard = JSON.parse(JSON.stringify(save));
  RS.applyEvent(save, hi, cards[0]);
  assert.equal(RS.needsEvent(save, hi), false, 'asked once');
  assert.equal(RS.smallBody(save.career.build), false);
  assert.equal(RS.computeStats(save.career.build, {}).maxHp, big.maxHp, 'the treatment removes the weakness');
  RS.applyEvent(hard, hi, RS.eventChoices(hard, hi)[1]);
  assert.equal(RS.hardMode(hard.career.build), true);
  const w = RS.startYear(hard, hi, { seed: 1 });
  assert.equal(w.small, true);
  assert.equal(w.stats.maxHp, small.maxHp);
  hard.career.yearIdx = hi + 3; // the choice holds for the rest of the career
  assert.equal(RS.startYear(hard, hi + 3, { seed: 1 }).small, true);
  RS.selectHero('ronaldo');
});

test("딩요's tutoring teaches 엘라스티코 (never dealt at level-ups) and he joins the squad", () => {
  RS.selectHero('messi');
  const di = RS.YEARS.findIndex((y) => y.event === 'dingyo');
  const save = RS.newSave(); save.career.build = RS.newBuild('messi'); save.career.yearIdx = di;
  const cards = RS.eventChoices(save, di);
  assert.equal(cards[0].id, 'dy_elastico');
  RS.applyEvent(save, di, cards[0]);
  const b = save.career.build;
  assert.ok(b.skills.elastico === 1 && b.skillOrder.includes('elastico'));
  assert.ok(RS.allMates(b).some((m) => m.id === 'dingyo'), '딩요 joined');
  const full = RS.newSave(); full.career.build = RS.newBuild('messi'); full.career.yearIdx = di;
  for (const id of ['tiki', 'curler', 'solo', 'bobo', 'killpass']) RS.applyChoice(full.career.build, { kind: 'skill', id });
  const alt = RS.eventChoices(full, di)[0];
  assert.equal(alt.id, 'dy_touch', 'a full skill bar gets the other lesson');
  RS.applyEvent(full, di, alt);
  assert.ok(full.career.build.skillOrder.every((id) => full.career.build.skills[id] === 2));
  const b2 = RS.newBuild('messi'); b2.hgh = true;
  const before = RS.computeStats(b2, {}).teamDmg;
  b2.coachCards.push('dy_nolook');
  assert.ok(Math.abs(RS.computeStats(b2, {}).teamDmg - before - 0.2) < 1e-9, 'a lesson lasts like a coach card');
  RS.selectHero('ronaldo');
});

test('youth seasons play like the debut year; 메시 and 날두 share the pro difficulty curve', () => {
  RS.selectHero('ronaldo');
  const r0 = RS.yearTuning(0), r1 = RS.yearTuning(1);
  RS.selectHero('messi');
  const debut = RS.YEARS.findIndex((y) => y.year === 2004);
  for (let i = 0; i <= debut; i++) assert.equal(RS.tuneIdx(i), 0, RS.YEARS[i].year);
  assert.equal(RS.yearTuning(0).spawnRate, r0.spawnRate);
  assert.equal(RS.yearTuning(debut + 1).hpMul, r1.hpMul);
  RS.selectHero('ronaldo');
});

test("메시's moves work: 감아차기 bends onto its target, 칩슛 lands on the toughest enemy, the glare is no SIUU", () => {
  RS.selectHero('messi');
  const mk = (id) => {
    const b = RS.newBuild('messi'); b.hgh = true; b.skills = { [id]: 1 }; b.skillOrder = [id];
    const w = new RS.World({ yearIdx: 4, seed: 3, build: b }); w.debug.godMode = true; return w;
  };
  const wc = mk('curler');
  const t = wc.spawnEnemy('tank', 120, 0);
  let wide = false;
  for (let i = 0; i < 120; i++) { wc.update(1 / 60, { x: 0, y: 0 }); for (const pr of wc.projs) if (pr.alive && Math.abs(pr.y) > 8) wide = true; }
  assert.ok(wide, 'the shot leaves wide of the line');
  assert.ok(t.hp < t.maxHp, 'and bends back onto the target');
  const wp = mk('chip');
  wp.spawnEnemy('grunt', 40, 0);
  const far = wp.spawnEnemy('tank', 150, 0);
  for (let i = 0; i < 90; i++) wp.update(1 / 60, { x: 0, y: 0 });
  assert.ok(far.hp < far.maxHp, 'the lob lands on the tank, not the nearest grunt');
  const wb = mk('bobo');
  wb.spawnEnemy('grunt', 30, 0);
  const sounds = [];
  for (let i = 0; i < 90; i++) { wb.update(1 / 60, { x: 0, y: 0 }); for (const e of wb.events) if (e.type === 'sfx') sounds.push(e.name); wb.events.length = 0; }
  assert.ok(sounds.includes('bobo') && !sounds.includes('siu'), sounds.join());
  RS.selectHero('ronaldo');
});

test('a 메시 save from before the youth seasons moves past them and keeps the grown body', () => {
  RS.selectHero('messi');
  const n = RS.YEARS_MESSI.filter((y) => y.youth).length;
  const old = RS.newSave();
  delete old.career.v; delete old.career.eventDone;
  old.career.build = RS.newBuild('messi'); delete old.career.build.hgh;
  old.career.yearIdx = 2; old.career.cleared = [true, true]; old.career.coachDone = 2; old.career.transferDone = 1; old.career.rewardDone = 1;
  old.career.snapshots = { 0: RS.newBuild('messi'), 1: RS.newBuild('messi') };
  const store = RS.makeStorage(null);
  store.set(RS.SAVE_KEY, JSON.stringify(old));
  const s = RS.loadSave(store);
  assert.equal(s.career.yearIdx, 2 + n);
  assert.equal(RS.YEARS[s.career.yearIdx].year, 2006);
  assert.equal(s.career.coachDone, 2 + n);
  assert.deepEqual(s.career.cleared.slice(0, n + 2), new Array(n + 2).fill(true));
  assert.deepEqual(Object.keys(s.career.snapshots).map(Number).sort((a, b) => a - b), [n, n + 1]);
  assert.equal(s.career.build.hgh, true);
  assert.equal(RS.smallBody(s.career.build), false);
  RS.writeSave(store, s);
  assert.equal(RS.loadSave(store).career.yearIdx, 2 + n, 'migrated once');
  const fresh = RS.newSave(); fresh.career.build = RS.newBuild('messi');
  RS.writeSave(store, fresh);
  assert.equal(RS.loadSave(store).career.yearIdx, 0, 'a fresh career starts in the youth');
  RS.selectHero('ronaldo');
});

test('메시 is faster, slides every 3 s, and his golden balls hit without projectiles', () => {
  RS.selectHero('messi');
  const wm = new RS.World({ yearIdx: 3, seed: 2, build: RS.newBuild('messi') });
  RS.selectHero('ronaldo');
  const wr = new RS.World({ yearIdx: 3, seed: 2, build: RS.newBuild('ronaldo') });
  assert.ok(wm.stats.move > wr.stats.move * 1.15, '메시 faster: ' + wm.stats.move + ' vs ' + wr.stats.move);
  assert.equal(wm.slideCooldown(), 3);
  assert.equal(wr.slideCooldown(), 5);
  RS.selectHero('messi');
  wm.debug.godMode = true;
  const tank = wm.spawnEnemy('tank', 34, 0);
  for (let i = 0; i < 180; i++) wm.update(1 / 60, { x: 0, y: 0 });
  assert.ok(wm.orbs && wm.orbs.length === 1, 'one ball at level 1');
  assert.ok(wm.dmgDealt > 0, 'orbit dealt damage');
  assert.equal(wm.projs.filter((p) => p.alive).length, 0, 'no projectiles');
  assert.ok(tank.hp < tank.maxHp);
  RS.selectHero('ronaldo');
});

test('orbit evolves two ways: 8 balls (8발롱도르공) or one ball 8× (8발롱도르)', () => {
  RS.selectHero('messi');
  const mk = () => { const b = RS.newBuild('messi'); b.skills.orbit = RS.SKILL_MAX; RS.applyChoice(b, { kind: 'passive', id: 'ballon' }); return b; };
  const b = mk();
  const choices = RS.makeChoices(b, RS.makeRng(1), 2);
  const evos = choices.filter((c) => c.kind === 'evolve').map((c) => c.variant).sort();
  assert.deepEqual(evos, ['count', 'size'], 'both paths offered');
  assert.ok(choices.some((c) => c.name === '8발롱도르공') && choices.some((c) => c.name === '8발롱도르'));
  assert.ok(RS.applyChoice(b, { kind: 'evolve', id: 'orbit', variant: 'count' }));
  assert.equal(RS.skillStats('orbit', b.skills.orbit, b.evolved.orbit).count, 8);
  const b2 = mk();
  assert.ok(RS.applyChoice(b2, { kind: 'evolve', id: 'orbit', variant: 'size' }));
  const st = RS.skillStats('orbit', b2.skills.orbit, b2.evolved.orbit);
  assert.equal(st.size, 8);
  const w = new RS.World({ yearIdx: 5, seed: 3, build: b2 });
  w.debug.godMode = true;
  for (let i = 0; i < 8; i++) w.spawnEnemy('grunt', 40 + i * 6, (i % 2 ? 1 : -1) * 20);
  for (let i = 0; i < 120; i++) w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.orbs.length, 1);
  assert.equal(w.orbs[0].r, 32, 'ball radius 8× of 4 px');
  assert.ok(w.kills >= 4, 'the big ball sweeps grunts: ' + w.kills);
  RS.selectHero('ronaldo');
});

test('switching hero parks the current career and restores it later; meta is shared', () => {
  const save = RS.newSave();
  save.meta.coins = 500;
  save.career.yearIdx = 4; save.career.cleared[0] = true;
  RS.switchHero(save, 'messi');
  assert.equal(save.career.build.hero, 'messi');
  assert.equal(save.career.yearIdx, 0);
  assert.equal(RS.YEARS[0].year, 1995, '메시 starts in the youth');
  assert.equal(save.meta.coins, 500);
  assert.deepEqual(save.career.build.skillOrder, ['orbit']);
  save.career.yearIdx = 2;
  RS.switchHero(save, 'ronaldo');
  assert.equal(save.career.build.hero, 'ronaldo');
  assert.equal(save.career.yearIdx, 4, 'ronaldo career restored');
  assert.equal(RS.YEARS[0].year, 2002);
  RS.switchHero(save, 'messi');
  assert.equal(save.career.yearIdx, 2, '메시 career restored');
  // round-trips through storage
  const store = RS.makeStorage(null);
  RS.writeSave(store, save);
  const loaded = RS.loadSave(store);
  assert.equal(loaded.career.build.hero, 'messi');
  assert.equal(loaded.careers.ronaldo.yearIdx, 4);
  RS.selectHero('ronaldo');
});

test('a bot clears the first 메시 seasons and 날두 is a two-phase final boss', () => {
  RS.selectHero('messi');
  const save = RS.newSave(); save.career.build = RS.newBuild('messi');
  const c = simCareer({ seed: 5, to: 4, save });
  assert.equal(c.stoppedAt, null, 'cleared the youth and 2004-2005: ' + JSON.stringify(c.years.map((y) => y.phase)));
  assert.ok(c.years.every((y) => y.skills.startsWith('orbit')), c.years[0].skills);
  assert.equal(c.save.career.build.hgh, true, 'the bot took the treatment');
  const hard = RS.newSave(); hard.career.build = RS.newBuild('messi');
  const h = simCareer({ seed: 5, to: 4, save: hard, events: { hgh: 1 } });
  assert.equal(h.stoppedAt, null, '하드 모드 youth and debut are beatable: ' + JSON.stringify(h.years.map((y) => y.phase)));
  assert.equal(RS.hardMode(h.save.career.build), true);
  const last = RS.YEARS.length - 1;
  const w = new RS.World({ yearIdx: last, seed: 1, build: RS.newBuild('messi') });
  w.debug.godMode = true;
  const boss = w.spawnBoss();
  assert.equal(boss.sprite, 'ronaldo');
  assert.equal(boss.name, '호날두');
  boss.hp = boss.maxHp * 0.4;
  let raged = false, acted = new Set();
  for (let i = 0; i < 60 * 20; i++) {
    w.update(1 / 60, { x: 0, y: 0 });
    if (boss.ai.phase === 2) raged = true;
    if (boss.ai.act) acted.add(boss.ai.act.kind);
  }
  assert.ok(raged, '2nd phase');
  assert.ok(acted.size >= 3, 'uses several patterns: ' + [...acted].join());
  w.killEnemy(boss);
  assert.equal(w.phase, 'victory');
  RS.selectHero('ronaldo');
});
