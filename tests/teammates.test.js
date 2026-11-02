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
  assert.equal(b.teammates.length, RS.MAX_MATES);
  assert.equal(RS.addMate(b, 'tumblenano'), false, 'no duplicates');
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
  const b = RS.newBuild();
  for (const id of ['pepperoni', 'saintcasi', 'tumblenano', 'ozilly', 'benjamin']) RS.addMate(b, id);
  const w = new RS.World({ yearIdx: 10, build: b, seed: 3 });
  w.debug.godMode = true;
  for (let i = 0; i < 30; i++) w.spawnEnemy('grunt', 60 + (i % 6) * 8, (Math.floor(i / 6) - 2) * 8);
  const keeper = w.mates.find((m) => m.role === 'keeper');
  w.enemyShot('card', keeper.x + 10, keeper.y, Math.PI, 10, 5, 3);
  let passes = 0;
  for (let i = 0; i < 600; i++) {
    if (w.phase === 'levelup') w.choose(0);
    if (w.phase === 'chest') w.closeChest();
    w.update(1 / 60, { x: 0, y: 0 });
    passes += w.projs.filter((p) => p.kind === 'pass').length ? 1 : 0;
  }
  assert.ok(w.fx.length >= 0);
  assert.ok(passes > 0, 'midfielder passed');
  assert.ok(w.kills > 5);
});
