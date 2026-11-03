const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

test('every skill has a paired passive and evolved stats', () => {
  for (const [id, s] of Object.entries(RS.SKILLS)) {
    assert.ok(RS.PASSIVES[s.passive], id + ' pairs with an existing passive');
    assert.equal(s.lv.length, RS.SKILL_MAX);
    assert.ok(s.evo && s.evoName && s.evoDesc);
    assert.equal(s.ups.length, RS.SKILL_MAX);
  }
});

test('evolution needs max level AND the matching passive', () => {
  const b = RS.newBuild();
  assert.deepEqual(RS.availableEvolutions(b), []);
  b.skills.kick = RS.SKILL_MAX;
  assert.deepEqual(RS.availableEvolutions(b), [], 'max level alone is not enough');
  b.passives.freekick = 1; b.passiveOrder.push('freekick');
  assert.deepEqual(RS.availableEvolutions(b), [], 'wrong passive');
  b.passives.boots = 1; b.passiveOrder.push('boots');
  assert.deepEqual(RS.availableEvolutions(b), ['kick']);
  b.skills.kick = RS.SKILL_MAX - 1;
  assert.deepEqual(RS.availableEvolutions(b), [], 'passive alone is not enough');
});

test('evolution is offered as a card and applied; cannot apply twice', () => {
  const b = RS.newBuild();
  b.skills.kick = RS.SKILL_MAX; b.passives.boots = 1; b.passiveOrder.push('boots');
  const c = RS.makeChoices(b, RS.makeRng(9), 0);
  assert.equal(c[0].kind, 'evolve');
  assert.equal(c[0].name, '황금 볼', 'no 발롱도르 won yet: the golden ball, not the trophy');
  assert.equal(RS.applyChoice(b, c[0]), true);
  assert.equal(b.evolved.kick, true);
  assert.equal(RS.applyChoice(b, { kind: 'evolve', id: 'kick' }), false);
  assert.deepEqual(RS.skillStats('kick', RS.SKILL_MAX, true), RS.SKILLS.kick.evo);
});

test('chest evolves an eligible skill, emits evolve + SIUU', () => {
  const b = RS.newBuild();
  b.skills.knuckle = RS.SKILL_MAX; b.skillOrder.push('knuckle');
  b.passives.freekick = 1; b.passiveOrder.push('freekick');
  const w = new RS.World({ yearIdx: 0, build: b, seed: 3 });
  w.openChest();
  assert.equal(w.phase, 'chest');
  assert.equal(w.build.evolved.knuckle, true);
  assert.ok(w.events.some((e) => e.type === 'evolve' && e.id === 'knuckle'));
  assert.ok(w.events.some((e) => e.type === 'siuu'));
  w.closeChest();
  assert.equal(w.phase, 'play');
});

test('each evolved skill fires without errors', () => {
  const b = RS.newBuild();
  b.skills = {}; b.skillOrder = [];
  for (const id of Object.keys(RS.SKILLS).slice(0, 6)) { b.skills[id] = RS.SKILL_MAX; b.skillOrder.push(id); b.evolved[id] = true; }
  const w = new RS.World({ yearIdx: 3, build: b, seed: 4 });
  w.debug.godMode = true;
  for (let i = 0; i < 40; i++) w.spawnEnemy('grunt', (i % 8) * 6 - 20, Math.floor(i / 8) * 6 - 12);
  for (let i = 0; i < 600; i++) { if (w.phase === 'levelup') w.choose(0); if (w.phase === 'chest') w.closeChest(); w.update(1 / 60, { x: 0, y: 0 }); }
  assert.ok(w.kills > 30);
});
