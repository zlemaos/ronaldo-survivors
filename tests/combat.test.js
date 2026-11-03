const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

test('calcDamage applies damage, team, boss multipliers and crit', () => {
  const st = RS.computeStats(RS.newBuild(), {});
  assert.deepEqual(RS.calcDamage(10, st, {}, 0.99), { dmg: 10, crit: false });
  assert.deepEqual(RS.calcDamage(10, st, {}, 0.0), { dmg: 20, crit: true });
  const b = RS.newBuild();
  b.passives.boots = 2; b.passiveOrder.push('boots');
  b.coachCards.push('hd_team', 'hd_time');
  const st2 = RS.computeStats(b, { might: 2 });
  assert.equal(st2.dmg, 1 + 0.2 + 0.1);
  assert.equal(RS.calcDamage(10, st2, { team: true, boss: true }, 0.99).dmg, Math.round(10 * 1.3 * 1.15 * 1.15));
  assert.equal(RS.calcDamage(0.1, st, {}, 0.99).dmg, 1, 'minimum 1');
});

test('enemies take damage and die, dropping XP gems', () => {
  const w = new RS.World({ yearIdx: 0, seed: 1 });
  const e = w.spawnEnemy('grunt', 30, 0);
  assert.equal(e.hp, 8);
  w.stats.crit = 0;
  w.damageEnemy(e, 5);
  assert.equal(e.hp, 3);
  w.damageEnemy(e, 5);
  assert.equal(e.alive, false);
  assert.equal(w.kills, 1);
  assert.ok(w.pickups.some((p) => p.kind === 'gem' && p.value >= 1));
});

test('collecting XP levels up and offers 4 picks; picking applies and resumes', () => {
  const w = new RS.World({ yearIdx: 0, seed: 2 });
  w.gainXp(RS.xpToNext(1) + RS.xpToNext(2));
  assert.equal(w.build.level, 3);
  assert.equal(w.levelQueue, 2);
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.phase, 'levelup');
  assert.equal(w.choices.length, RS.LEVEL_CARDS);
  const kinds = new Set(w.choices.map((c) => c.kind + ':' + c.id));
  assert.equal(kinds.size, RS.LEVEL_CARDS, 'choices are distinct');
  for (const c of w.choices) assert.ok(c.name && c.desc && c.icon, 'cards are described');
  const before = JSON.stringify(w.build);
  w.choose(0);
  assert.notEqual(JSON.stringify(w.build), before);
  assert.equal(w.phase, 'levelup', 'second queued level-up opens');
  w.choose(1);
  assert.equal(w.phase, 'play');
  assert.equal(w.levelQueue, 0);
});

test('passive slots cap at six while existing passives can improve', () => {
  const b = RS.newBuild();
  const ids = Object.keys(RS.PASSIVES).filter(id => RS.passiveFor(id, 'ronaldo'));
  for (const id of ids.slice(0, 6)) assert.ok(RS.applyChoice(b, { kind: 'passive', id }));
  assert.equal(RS.applyChoice(b, { kind: 'passive', id: ids[6] }), false);
  assert.ok(RS.applyChoice(b, { kind: 'passiveUp', id: ids[0] }));
  assert.equal(b.passives[ids[0]], 2);
});

test('a maxed build can keep training and healing', () => {
  const b = RS.newBuild();
  b.weapon.g = 5; b.weapon.p = 10;
  b.armory = RS.weaponIds('ronaldo', 5).filter(id => id !== b.weapon.id).map(id => ({ id, g: 5, p: 10 }));
  RS.syncWeapon(b);
  for (const id of Object.keys(RS.PASSIVES).slice(0, 6)) { b.passives[id] = RS.PASSIVE_MAX; b.passiveOrder.push(id); }
  const all = Object.keys(RS.TEAMMATES).map((id) => ({ id, lv: RS.MATE_MAX_LV }));
  b.teammates = all.slice(0, RS.MAX_MATES);
  b.bench = all.slice(RS.MAX_MATES, RS.MAX_MATES + RS.MAX_BENCH);
  const d = RS.makeChoices(b, RS.makeRng(1), 5, 4);
  assert.deepEqual(d.map((x) => x.kind), ['drill', 'drill', 'drill', 'heal']);
  assert.equal(new Set(d.map((x) => x.id)).size, 4, 'no card twice');
  const before = RS.computeStats(b, {});
  for (let i = 0; i < 3; i++) assert.ok(RS.applyChoice(b, { kind: 'drill', id: 'shoot' }), 'drills have no cap');
  assert.equal(b.drills.shoot, 3);
  assert.ok(RS.computeStats(b, {}).dmg > before.dmg);
});

test('player takes contact damage with armor and i-frames', () => {
  const w = new RS.World({ yearIdx: 0, seed: 3 });
  w.build.passives.icebath = 2; w.build.passiveOrder.push('icebath'); w.recalc();
  const hp = w.player.hp;
  w.hurtPlayer(10);
  assert.equal(w.player.hp, hp - 8);
  w.hurtPlayer(10);
  assert.equal(w.player.hp, hp - 8, 'i-frames block the second hit');
});

test('death ends the year; meta revive gives one second chance', () => {
  const w = new RS.World({ yearIdx: 0, seed: 4, meta: { upgrades: { revive: 1 } } });
  w.player.hp = 0;
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.phase, 'play');
  assert.ok(w.player.hp > 0);
  w.player.hp = 0; w.player.iframe = 0;
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.phase, 'dead');
});
