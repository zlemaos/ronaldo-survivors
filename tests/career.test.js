const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

function fakeClear(world) { world.phase = 'clear'; world.kills = 100; }

test('years span debut at 17 to the present and end with 메시', () => {
  assert.equal(RS.YEARS[0].year, 2002);
  assert.equal(RS.yearAge(0), 17);
  const last = RS.YEARS[RS.YEARS.length - 1];
  assert.equal(last.final, true);
  assert.equal(last.boss.type, 'messi');
  RS.YEARS.forEach((y, i) => {
    if (i) assert.equal(y.year, RS.YEARS[i - 1].year + 1, 'one stage per year');
    assert.ok(RS.ERAS[y.era] && RS.COACHES[y.coach] && RS.BOSS_TYPES[y.boss.type]);
    const t = RS.yearTuning(i);
    assert.ok(t.duration >= 90 && t.duration <= 180, 'stage length fits a phone session');
  });
});

test('coach pick happens before a career year and is saved in the snapshot', () => {
  const save = RS.newSave();
  const rng = RS.makeRng(1);
  assert.equal(RS.needsCoach(save, 0), true);
  const cards = RS.coachChoices(save, 0, rng);
  assert.equal(cards.length, 3);
  const coachCard = cards.find((c) => RS.coachCard(c.id));
  RS.applyCoach(save, 0, coachCard, rng);
  assert.equal(RS.needsCoach(save, 0), false);
  assert.ok(save.career.build.coachCards.includes(coachCard.id));
  assert.ok(save.career.snapshots[0].coachCards.includes(coachCard.id));
  const w = RS.startYear(save, 0, { seed: 1 });
  const st = RS.computeStats(save.career.build, {});
  assert.deepEqual(w.stats, st, 'coach buff is active in the run');
});

test('recruit and train coach cards affect teammates', () => {
  const save = RS.newSave();
  const rng = RS.makeRng(2);
  RS.applyCoach(save, 0, RS.COACH_EXTRA.recruit, rng);
  assert.equal(save.career.build.teammates.length, 1);
  RS.applyCoach(save, 1, RS.COACH_EXTRA.train, rng);
  assert.equal(save.career.build.teammates[0].lv, 2);
});

test('clearing a year advances the career, keeps the build and saves/loads', () => {
  const store = RS.makeStorage(null);
  const save = RS.newSave();
  const rng = RS.makeRng(3);
  RS.applyCoach(save, 0, RS.coachChoices(save, 0, rng)[0], rng);
  const w = RS.startYear(save, 0, { seed: 2 });
  w.gainXp(200);
  w.levelQueue = 0;
  RS.applyChoice(w.build, { kind: 'skill', id: 'siuu' });
  fakeClear(w);
  const out = RS.finishYear(save, w);
  assert.equal(out.cleared, true);
  assert.equal(save.career.yearIdx, 1);
  assert.equal(save.career.cleared[0], true);
  assert.ok(save.career.build.level > 1);
  assert.equal(save.career.build.skills.siuu, 1, 'build carries to next year');
  assert.ok(save.meta.coins > 0);
  RS.writeSave(store, save);
  const loaded = RS.loadSave(store);
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(save)));
  assert.equal(RS.canPlay(loaded, 1), true);
  assert.equal(RS.canPlay(loaded, 2), false);
});

test('dying does not advance; retry starts from the year snapshot', () => {
  const save = RS.newSave();
  const rng = RS.makeRng(4);
  RS.applyCoach(save, 0, RS.coachChoices(save, 0, rng)[0], rng);
  const w = RS.startYear(save, 0, { seed: 2 });
  w.gainXp(500);
  w.phase = 'dead';
  const out = RS.finishYear(save, w);
  assert.equal(out.cleared, false);
  assert.equal(save.career.yearIdx, 0);
  assert.equal(save.career.build.level, 1);
  assert.equal(RS.startYear(save, 0).build.level, 1);
});

test('replaying a cleared year uses its snapshot and does not change the career', () => {
  const save = RS.newSave();
  const rng = RS.makeRng(5);
  for (let i = 0; i < 3; i++) {
    RS.applyCoach(save, i, RS.coachChoices(save, i, rng)[0], rng);
    const w = RS.startYear(save, i, { seed: i });
    w.gainXp(100 * (i + 1));
    fakeClear(w);
    RS.finishYear(save, w);
  }
  const careerBefore = JSON.stringify(save.career);
  assert.equal(RS.isReplay(save, 1), true);
  assert.equal(RS.needsCoach(save, 1), false);
  const w = RS.startYear(save, 1, { seed: 9 });
  assert.equal(w.build.level, save.career.snapshots[1].level);
  w.gainXp(9999);
  fakeClear(w);
  const coins = save.meta.coins;
  const out = RS.finishYear(save, w);
  assert.equal(out.replay, true);
  assert.equal(JSON.stringify(save.career), careerBefore);
  assert.ok(save.meta.coins > coins, 'replays still pay coins');
});

test('발롱도르 are granted once for real Ballon d\'Or years', () => {
  const save = RS.newSave();
  const idx = RS.YEARS.findIndex((y) => y.ballon);
  save.career.yearIdx = idx; save.career.coachDone = idx;
  const w = RS.startYear(save, idx, { seed: 1 });
  fakeClear(w);
  assert.equal(RS.finishYear(save, w).ballon, 1);
  const w2 = RS.startYear(save, idx, { seed: 1 });
  fakeClear(w2);
  assert.equal(RS.finishYear(save, w2).ballon, 0);
  assert.equal(save.meta.ballons, 1);
});

test('meta shop buys permanent upgrades with coins/발롱도르', () => {
  const save = RS.newSave();
  assert.equal(RS.buyMeta(save, 'might'), false);
  save.meta.coins = 1000;
  assert.equal(RS.buyMeta(save, 'might'), true);
  assert.equal(save.meta.coins, 1000 - RS.META.might.cost[0]);
  assert.equal(save.meta.upgrades.might, 1);
  assert.equal(RS.buyMeta(save, 'revive'), false);
  save.meta.ballons = 2;
  assert.equal(RS.buyMeta(save, 'revive'), true);
  assert.equal(RS.buyMeta(save, 'revive'), false, 'max level');
  const w = RS.startYear(save, 0, { seed: 1 });
  assert.equal(w.stats.dmg, 1.05);
  assert.equal(w.stats.revive, 1);
});

test('corrupt or old saves load with defaults and never throw', () => {
  const store = RS.makeStorage(null);
  store.set(RS.SAVE_KEY, '{not json');
  assert.deepEqual(RS.loadSave(store), RS.newSave());
  store.set(RS.SAVE_KEY, JSON.stringify({ career: { yearIdx: 3, build: { level: 5 } }, meta: { coins: 7, upgrades: { bogus: 3 } } }));
  const s = RS.loadSave(store);
  assert.equal(s.career.yearIdx, 3);
  assert.equal(s.career.build.level, 5);
  assert.deepEqual(s.career.build.skillOrder, ['kick']);
  assert.equal(s.meta.coins, 7);
  assert.deepEqual(s.meta.upgrades, {});
  assert.equal(s.meta.muted, false);
});

test('beating 메시 finishes the career; a new lap keeps meta', () => {
  const save = RS.newSave();
  const last = RS.YEARS.length - 1;
  save.career.yearIdx = last; save.career.coachDone = last;
  save.meta.upgrades.might = 2;
  const w = RS.startYear(save, last, { seed: 1 });
  w.phase = 'victory';
  const out = RS.finishYear(save, w);
  assert.equal(out.finished, true);
  assert.equal(save.career.finished, true);
  assert.equal(save.meta.wins, 1);
  RS.newCareer(save);
  assert.equal(save.career.yearIdx, 0);
  assert.equal(save.career.laps, 1);
  assert.equal(save.meta.upgrades.might, 2);
});
