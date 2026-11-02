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

test('collecting XP levels up and offers 3 picks; picking applies and resumes', () => {
  const w = new RS.World({ yearIdx: 0, seed: 2 });
  w.gainXp(RS.xpToNext(1) + RS.xpToNext(2));
  assert.equal(w.build.level, 3);
  assert.equal(w.levelQueue, 2);
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.phase, 'levelup');
  assert.equal(w.choices.length, 3);
  const kinds = new Set(w.choices.map((c) => c.kind + ':' + c.id));
  assert.equal(kinds.size, 3, 'choices are distinct');
  for (const c of w.choices) assert.ok(c.name && c.desc && c.icon, 'cards are described');
  const before = JSON.stringify(w.build);
  w.choose(0);
  assert.notEqual(JSON.stringify(w.build), before);
  assert.equal(w.phase, 'levelup', 'second queued level-up opens');
  w.choose(1);
  assert.equal(w.phase, 'play');
  assert.equal(w.levelQueue, 0);
});

test('skill and passive slot limits are respected by choices', () => {
  const b = RS.newBuild();
  for (const id of Object.keys(RS.SKILLS)) if (!b.skills[id] && b.skillOrder.length < RS.MAX_SKILLS) { b.skills[id] = 1; b.skillOrder.push(id); }
  const rng = RS.makeRng(5);
  for (let i = 0; i < 200; i++) {
    for (const c of RS.makeChoices(b, rng, 0)) assert.notEqual(c.kind, 'skill', 'no new skills when slots are full');
  }
  assert.equal(RS.applyChoice(b, { kind: 'skill', id: 'siuu' }), b.skillOrder.length < RS.MAX_SKILLS && !b.skills.siuu);
});

test('choices fall back to heal/gold when everything is maxed', () => {
  const b = RS.newBuild();
  b.skills = {}; b.skillOrder = [];
  for (const id of Object.keys(RS.SKILLS).slice(0, 6)) { b.skills[id] = RS.SKILL_MAX; b.skillOrder.push(id); b.evolved[id] = true; }
  for (const id of Object.keys(RS.PASSIVES).slice(0, 6)) { b.passives[id] = RS.PASSIVE_MAX; b.passiveOrder.push(id); }
  const all = Object.keys(RS.TEAMMATES).map((id) => ({ id, lv: RS.MATE_MAX_LV }));
  b.teammates = all.slice(0, RS.MAX_MATES);
  b.bench = all.slice(RS.MAX_MATES, RS.MAX_MATES + RS.MAX_BENCH);
  const c = RS.makeChoices(b, RS.makeRng(1), 5);
  assert.deepEqual(c.map((x) => x.kind).sort(), ['gold', 'heal']);
  assert.ok(c.every((x) => x.kind === 'gold' || x.kind === 'heal'));
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
