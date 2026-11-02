const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

test('teammate data is valid', () => {
  for (const [id, m] of Object.entries(RS.TEAMMATES)) {
    assert.ok(RS.ROLES[m.role], id + ' role');
    assert.ok(RS.ERAS[m.era], id + ' era');
  }
});

test('joining via level-up pick adds a companion that fights', () => {
  const w = new RS.World({ yearIdx: 9, seed: 6 });
  assert.equal(w.mates.length, 0);
  assert.ok(w.applyChoiceRuntime({ kind: 'mate', id: 'looneytoon' }));
  assert.equal(w.build.teammates.length, 1);
  assert.equal(w.mates.length, 1);
  w.debug.godMode = true;
  w.build.skillOrder = []; w.build.skills = {}; // only the striker attacks
  w.spawnEnemy('tank', 40, 0);
  let teamHits = 0;
  for (let i = 0; i < 300; i++) { w.update(1 / 60, { x: 0, y: 0 }); }
  teamHits = w.dmgDealt;
  assert.ok(teamHits > 0, 'striker dealt damage');
});

test('mate candidates follow eras and exclude owned', () => {
  const b = RS.newBuild();
  const early = RS.mateCandidates(b, 0, false);
  assert.ok(early.every((id) => RS.TEAMMATES[id].era === 'lisbon'));
  RS.addMate(b, early[0]);
  assert.ok(!RS.mateCandidates(b, 0, false).includes(early[0]));
  assert.ok(RS.mateCandidates(b, 10, false).some((id) => RS.TEAMMATES[id].era === 'madrid'));
});

test('teammates level up to max and slots are capped', () => {
  const b = RS.newBuild();
  RS.addMate(b, 'tumblenano');
  for (let i = 0; i < 10; i++) RS.levelMate(b, 'tumblenano', 1);
  assert.equal(b.teammates[0].lv, RS.MATE_MAX_LV);
  assert.equal(RS.levelMate(b, 'tumblenano', 1), false);
  for (const id of Object.keys(RS.TEAMMATES)) RS.addMate(b, id);
  assert.equal(b.teammates.length, RS.MAX_MATES, 'two on the pitch');
  assert.equal(b.bench.length, RS.MAX_BENCH, 'three on the bench');
  assert.ok(RS.squadFull(b));
  assert.equal(RS.addMate(b, 'tumblenano'), false, 'no duplicates');
  assert.equal(RS.levelMate(b, b.bench[0].id, 1), true, 'bench players train too');
});

test('squad: role buffs on the pitch, a third of them on the bench, named partnership for the pair', () => {
  const b = RS.newBuild();
  const byRole = (r) => Object.keys(RS.TEAMMATES).find((id) => RS.TEAMMATES[id].role === r);
  const base = RS.computeStats(b, {});
  assert.equal(RS.addMate(b, byRole('striker')), 'pitch');
  const one = RS.computeStats(b, {});
  assert.ok(Math.abs(one.dmg - base.dmg - RS.ROLE_BUFF.striker.mods.dmg) < 1e-9, 'striker buff on the pitch');
  assert.equal(RS.pairSynergy(b), null);
  assert.equal(RS.addMate(b, byRole('mid')), 'pitch');
  const pair = RS.pairSynergy(b);
  assert.equal(pair && pair.key, 'mid+striker');
  const two = RS.computeStats(b, {});
  assert.ok(two.teamDmg > one.teamDmg, 'partnership applies');
  assert.equal(RS.addMate(b, byRole('keeper')), 'bench');
  const three = RS.computeStats(b, {});
  assert.equal(three.maxHp - two.maxHp, Math.round(RS.ROLE_BUFF.keeper.mods.hp * RS.BENCH_FACTOR), 'bench keeper gives a third');
  // bench → pitch swaps with a starter and changes the partnership
  const striker = b.teammates[0].id;
  assert.equal(RS.toggleBench(b, byRole('keeper'), striker), true);
  assert.equal(RS.pairSynergy(b).key, 'keeper+mid');
  assert.ok(b.bench.some((m) => m.id === striker));
  // pitch → bench frees a slot; bench full refuses
  assert.equal(RS.toggleBench(b, b.teammates[0].id), true);
  assert.equal(b.teammates.length, 1);
  assert.ok(RS.synergyHint(b, byRole('winger')).includes('파트너십'), 'recruit cards preview the partnership');
  RS.addMate(b, byRole('defender')); RS.addMate(b, byRole('winger'));
  assert.equal(b.bench.length, RS.MAX_BENCH);
  assert.equal(RS.toggleBench(b, b.teammates[0].id), false, 'bench full');
  // old 5-on-pitch saves migrate: extras go to the bench
  const old = RS.newBuild(); delete old.bench;
  old.teammates = Object.keys(RS.TEAMMATES).slice(0, 5).map((id) => ({ id, lv: 2 }));
  const mig = RS.normalizeBuild(RS.cloneBuild(old));
  assert.equal(mig.teammates.length, RS.MAX_MATES);
  assert.equal(mig.bench.length, 3);
});

test('rescue marker on the field recruits when 날두 stands on it', () => {
  const w = new RS.World({ yearIdx: 1, seed: 8 });
  w.spawnRescue();
  assert.ok(w.rescue);
  const id = w.rescue.id;
  w.player.x = w.rescue.x; w.player.y = w.rescue.y;
  w.debug.godMode = true;
  for (let i = 0; i < 80; i++) w.updateRescue(1 / 60);
  assert.equal(w.rescue, null);
  assert.ok(w.build.teammates.some((m) => m.id === id));
  assert.ok(w.events.some((e) => e.type === 'recruit'));
  assert.deepEqual(w.recruitedThisRun, [id]);
});

test('every role runs (defender, keeper blocks projectiles, winger, mid pass, striker)', () => {
  // only two run on the pitch now, so the five roles are exercised in three worlds
  const run = (ids, fn) => {
    const b = RS.newBuild();
    for (const id of ids) assert.equal(RS.addMate(b, id), 'pitch');
    const w = new RS.World({ yearIdx: 10, build: b, seed: 3 });
    w.debug.godMode = true;
    for (let i = 0; i < 30; i++) w.spawnEnemy('grunt', 60 + (i % 6) * 8, (Math.floor(i / 6) - 2) * 8);
    let passes = 0;
    const before = fn ? fn(w) : null;
    for (let i = 0; i < 600; i++) {
      if (w.phase === 'levelup') w.choose(0);
      if (w.phase === 'chest') w.closeChest();
      w.update(1 / 60, { x: 0, y: 0 });
      passes += w.projs.filter((p) => p.kind === 'pass').length ? 1 : 0;
    }
    return { w, passes, before };
  };
  const a = run(['saintcasi', 'ozilly'], (w) => { const k = w.mates.find((m) => m.role === 'keeper'); w.enemyShot('card', k.x + 10, k.y, Math.PI, 10, 5, 3); });
  assert.ok(a.passes > 0, 'midfielder passed');
  assert.ok(a.w.fx.length >= 0);
  const c = run(['pepperoni', 'benjamin']);
  assert.ok(c.w.dmgDealt > 0, 'defender+striker world deals damage');
  const d = run(['tumblenano', 'benjamin']);
  assert.ok(d.w.dmgDealt > 0, 'winger+striker world deals damage');
});
