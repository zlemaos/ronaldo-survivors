const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

test('teammate cards and lines state the role in one plain line', () => {
  for (const id of Object.keys(RS.TEAMMATES)) {
    const line = RS.mateLine(id);
    assert.ok(line.includes(RS.ROLES[RS.TEAMMATES[id].role].name), line);
    assert.ok(!line.includes('\n'));
  }
  const b = RS.newBuild();
  const c = RS.makeChoices(b, RS.makeRng(2), 9, 3).concat(RS.makeChoices(b, RS.makeRng(5), 9, 3));
  for (const x of c) if (x.kind === 'mate') assert.equal(x.desc, RS.mateLine(x.id));
});

test('every era has teammates to sign', () => {
  for (const era of Object.keys(RS.ERAS)) {
    const n = Object.values(RS.TEAMMATES).filter((m) => m.era === era).length;
    assert.ok(n >= 3, era + ' has ' + n);
  }
});

test('club change opens a transfer window: sign or swap (level passes on)', () => {
  const save = RS.newSave();
  const rng = RS.makeRng(4);
  const b = save.career.build;
  for (const id of ['tumblenano', 'hugovia', 'lisbongk', 'gingerscorp', 'looneytoon']) RS.addMate(b, id);
  assert.ok(RS.squadFull(b));
  b.teammates[0].lv = 4;
  save.career.yearIdx = 7; save.career.coachDone = 7; // 2009: Madrid
  assert.equal(RS.clubChanged(7), true);
  assert.equal(RS.clubChanged(8), false);
  const offers = RS.transferOffers(save, 7, rng);
  assert.equal(offers.length, 2);
  for (const offer of offers) assert.equal(RS.TEAMMATES[offer.id].era, 'madrid');
  assert.equal(RS.applyTransfer(save, 7, offers[0].id, 'tumblenano', offers[0].lv), true);
  const m = b.teammates.find((x) => x.id === offers[0].id);
  assert.equal(m.lv, offers[0].lv, 'arrives pre-trained');
  assert.ok(!b.teammates.some((x) => x.id === 'tumblenano'));
  assert.equal(b.teammates.length, RS.MAX_MATES);
  assert.equal(b.bench.length, RS.MAX_BENCH);
  assert.equal(save.career.snapshots[7].teammates.find((x) => x.id === offers[0].id).lv, offers[0].lv);
  RS.finishTransfers(save, 7);
  assert.deepEqual(RS.transferOffers(save, 7, rng), [], 'window closes once handled');
  assert.deepEqual(RS.transferOffers(save, 8, rng), [], 'no window without a club change');
});

test('squad follows the career: every season the teammates are the hero\'s own at that club, that year', () => {
  const simCareer = require('./career-sim.js');
  // played on 이지: this is about transfers; 노멀's wall stops a bot without 훈련장 upgrades around 2018 (round 8)
  RS.setDiff('easy');
  let c;
  try { c = simCareer({ seed: 3, to: 18 }); } finally { RS.setDiff('normal'); } // through 2020 (Turin)
  assert.equal(c.stoppedAt, null);
  for (const y of c.years) {
    for (const id of y.mates.split(',').filter(Boolean).map((s) => s.replace(/\d+$/, ''))) assert.ok(RS.mateInSeason(id, y.idx), y.year + ': ' + id);
  }
  assert.ok(c.years.filter((y) => y.idx >= 16).every((y) => y.mates), 'the 유벤투스 seasons field a squad');
});

test('rescue marker with a full squad offers an in-run swap', () => {
  const b = RS.newBuild();
  for (const id of ['tumblenano', 'hugovia', 'lisbongk', 'gingerscorp', 'looneytoon']) RS.addMate(b, id);
  b.teammates[1].lv = 3;
  const w = new RS.World({ yearIdx: 8, build: b, seed: 2 }); // Madrid
  assert.equal(w.mates.length, RS.MAX_MATES, 'only the starters run on the pitch');
  w.debug.godMode = true;
  w.spawnRescue();
  assert.ok(w.rescue && w.rescue.swap);
  assert.equal(RS.TEAMMATES[w.rescue.id].era, 'madrid');
  w.player.x = w.rescue.x; w.player.y = w.rescue.y;
  for (let i = 0; i < 80 && w.phase === 'play'; i++) w.updateRescue(1 / 60);
  assert.equal(w.phase, 'swap');
  assert.equal(w.swapChoices.length, RS.MAX_MATES + RS.MAX_BENCH + 1, 'any starter or bench player can be released');
  const newId = w.swapChoices[1].id;
  assert.equal(w.chooseSwap(1), true);
  assert.equal(w.phase, 'play');
  assert.ok(!w.build.teammates.some((m) => m.id === 'hugovia'));
  assert.ok(w.build.teammates.find((m) => m.id === newId).lv >= 1 && w.build.teammates.find((m) => m.id === newId).lv <= 10);
  assert.equal(w.mates.find((m) => m.id === newId).role, RS.TEAMMATES[newId].role);
  // keep option
  w.spawnRescue(); w.player.x = w.rescue.x; w.player.y = w.rescue.y;
  for (let i = 0; i < 80 && w.phase === 'play'; i++) w.updateRescue(1 / 60);
  const before = JSON.stringify(w.build.teammates);
  w.chooseSwap(w.swapChoices.length - 1);
  assert.equal(JSON.stringify(w.build.teammates), before);
});

test('bosses are stun-immune and boss HP calibrates to the damage rate', () => {
  const w = new RS.World({ yearIdx: 12, seed: 1 });
  w.debug.godMode = true;
  const e = w.spawnBoss();
  w.damageEnemy(e, 1, { stun: 5 });
  assert.equal(e.stun, 0);
  const base = e.maxHp;
  // simulate a very strong player: 5000 damage in the first 2 s
  e.firstHitT = w.t; e.bossDmgIn = 1;
  w.t += 2; e.bossDmgIn = 10000;
  w.calibrateBoss(e);
  assert.ok(e.maxHp > base * 5, 'HP raised for a strong build');
  assert.ok(Math.abs(e.maxHp - 5000 * w.bossTarget(e)) / e.maxHp < 0.01);
  // a weak player never gets a boss below the year's base HP
  const w2 = new RS.World({ yearIdx: 12, seed: 1 });
  const e2 = w2.spawnBoss();
  e2.firstHitT = 0; e2.bossDmgIn = 10; w2.t = 6;
  w2.calibrateBoss(e2);
  assert.equal(e2.maxHp, e2.baseHp);
});

test('강슛 telegraph tracks the player and fires a fast shot keepers cannot save', () => {
  const w = new RS.World({ yearIdx: 6, seed: 9 });
  w.debug.godMode = true;
  const e = w.spawnBoss();
  e.ai.act = { kind: 'snipe', t: 0, stage: 0, n: 0 };
  w.player.vx = 80; w.player.vy = 0;
  w.runBossAct(e, e.ai.act, 0.1, w.player.x - e.x, w.player.y - e.y, Math.hypot(w.player.x - e.x, w.player.y - e.y));
  assert.equal(e.tele.kind, 'line');
  for (let i = 0; i < 60; i++) w.runBossAct(e, e.ai.act, 1 / 60, w.player.x - e.x, w.player.y - e.y, 100);
  const shots = w.eprojs.filter((p) => p.power);
  assert.equal(shots.length, 3);
  assert.ok(shots[0].speed >= 380);
});
