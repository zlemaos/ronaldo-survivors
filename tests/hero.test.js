// 메시 playable hero: own career years, orbiting golden balls, faster feet, 3 s slide, 날두 as the final boss.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');

test('메시 career data is valid and ends with 날두', () => {
  RS.selectHero('messi');
  assert.equal(RS.YEARS, RS.YEARS_MESSI);
  assert.equal(RS.YEARS[0].year, 2004);
  assert.equal(RS.yearAge(0), 17);
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

test('메시 starts with the orbit skill; hero-locked skills and passives never cross over', () => {
  const m = RS.newBuild('messi');
  assert.deepEqual(m.skillOrder, ['orbit']);
  assert.equal(m.hero, 'messi');
  const r = RS.newBuild('ronaldo');
  assert.deepEqual(r.skillOrder, ['kick']);
  const rng = RS.makeRng(4);
  for (let i = 0; i < 40; i++) {
    for (const c of RS.makeChoices(m, rng, 3)) { assert.notEqual(c.id, 'kick', '메시 never gets 킥'); }
    for (const c of RS.makeChoices(r, rng, 3)) { assert.notEqual(c.id, 'orbit'); assert.notEqual(c.id, 'ballon'); }
  }
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
  assert.equal(RS.YEARS[0].year, 2004);
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
  const c = simCareer({ seed: 5, to: 3, save });
  assert.equal(c.stoppedAt, null, 'cleared 2004-2007: ' + JSON.stringify(c.years.map((y) => y.phase)));
  assert.ok(c.years.every((y) => y.skills.startsWith('orbit')), c.years[0].skills);
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
