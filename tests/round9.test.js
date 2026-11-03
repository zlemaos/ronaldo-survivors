// Round 9: tougher 노멀/하드 (오토 cannot clear 하드), rarer graded cards, the 엘 클라시코 rival boss and its record,
// 메시's 2009 Rome final against 호날두, and 합체 (fused moves).
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');

const withHero = (hero, fn) => { RS.selectHero(hero); try { return fn(); } finally { RS.selectHero('ronaldo'); } };
const withDiff = (k, fn) => { RS.setDiff(k); try { return fn(); } finally { RS.setDiff('normal'); } };
const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };
// one fixed step; menus (level-up, chest, transfer) are answered first so the match keeps running
const step = (w, bot) => {
  if (w.phase === 'levelup') w.choose(RS.botChoose(w.choices, w.build));
  if (w.phase === 'chest') w.closeChest();
  if (w.phase === 'swap') w.chooseSwap(w.swapChoices.length - 1);
  if (w.phase === 'play') w.update(1 / 60, bot ? RS.botInput(w) : { x: 0, y: 0 });
};
const running = (w) => w.phase !== 'dead' && w.phase !== 'clear' && w.phase !== 'victory';

test('하드 is not cleared by 완전 오토: the strong bot with the whole 훈련장 stalls before the last seasons', () => withDiff('hard', () => {
  const save = RS.newSave();
  for (const k of Object.keys(RS.META)) save.meta.upgrades[k] = RS.META[k].max;
  const c = simCareer({ seed: 7, save, to: RS.YEARS.length - 2 });
  assert.notEqual(c.stoppedAt, null, 'the bot cleared 하드');
  assert.ok(RS.YEARS[c.stoppedAt].year <= 2021, 'stalled only at ' + RS.YEARS[c.stoppedAt].year);
}));

test('하드 bites from the first pro season and its crowd shrugs off knockback; 노멀 eases in over three', () => {
  const h1 = withDiff('hard', () => RS.yearTuning(1)), n1 = withDiff('normal', () => RS.yearTuning(1)), n4 = withDiff('normal', () => RS.yearTuning(4));
  assert.ok(h1.hpMul / n1.hpMul > 1.3, 'hard/normal HP at season 1: ' + (h1.hpMul / n1.hpMul).toFixed(2));
  assert.ok(h1.poise < n1.poise && h1.bossCool < n1.bossCool && h1.healMul < n1.healMul);
  assert.ok(n4.hpMul / withDiff('easy', () => RS.yearTuning(4)).hpMul > n1.hpMul / withDiff('easy', () => RS.yearTuning(1)).hpMul);
});

test('graded cards are rare: about one 히든-or-better in 80 level-ups on 노멀, half that on 하드, and draws cost real coins', () => {
  const b = RS.newBuild('ronaldo');
  const count = (diff) => withDiff(diff, () => {
    const rng = RS.makeRng(11); let n = 0;
    for (let i = 0; i < 40000; i++) { const c = RS.rollSpecial(b, rng, 0, 0); if (c && c.kind === 'relic' && c.tier !== 'rare') n++; }
    return n / 40000;
  });
  const normal = count('normal'), hard = count('hard');
  assert.ok(normal > 0.006 && normal < 0.016, '노멀 rate ' + normal);
  assert.ok(hard < normal * 0.7, '하드 rate ' + hard + ' vs ' + normal);
  assert.ok(RS.COIN_DRAWS.find((d) => d.id === 'hidden').cost >= 150 && RS.COIN_DRAWS.find((d) => d.id === 'hidden').odds.hidden >= 0.85);
});

test('엘 클라시코 seasons: 날두 2009–2017 and 메시 2010–2018, numbered from the first; 메시 2009 is the Rome final against 호날두', () => {
  const r = RS.YEARS.filter((y) => y.rival);
  assert.deepEqual(r.map((y) => y.year), [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017]);
  assert.deepEqual(r.map((y) => y.rivalLv), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(r.every((y) => y.rival === 'messi'));
  withHero('messi', () => {
    const m = RS.YEARS.filter((y) => y.rival);
    assert.deepEqual(m.map((y) => y.year), [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018]);
    assert.ok(m.every((y) => y.rival === 'ronaldo'));
    const rome = RS.YEARS.find((y) => y.year === 2009);
    assert.equal(rome.boss.type, 'ronaldo');
    assert.ok(rome.ballon && !rome.rival, 'the Rome final is the season boss, not a mid-stage 클라시코');
  });
});

test('메시 2009: 호날두 is the season boss with his own moves and a rage phase at half HP', () => withHero('messi', () => {
  const w = new RS.World({ yearIdx: RS.YEARS.findIndex(y => y.year === 2009), seed: 2, build: RS.newBuild('messi') });
  w.debug.godMode = true;
  const boss = w.spawnBoss();
  assert.equal(boss.name, '호날두');
  assert.equal(boss.ai.phase, 1);
  boss.hp = Math.floor(boss.maxHp / 2);
  step(w, false);
  assert.equal(boss.ai.phase, 2);
  assert.ok(w.events.some(e => e.type === 'rage'));
  for (let i = 0; i < 60 * 20; i++) step(w, false);
  assert.ok(boss.ai.history.some(k => k === 'snipe' || k === 'dash' || k === 'pslam'), boss.ai.history.join(','));
}));

test('엘 클라시코: the rival comes at the middle of the stage for 30 s; a kill is a win, the window closing is a loss, and pooled enemies never inherit him', () => withHero('messi', () => {
  const save = RS.newSave(); RS.switchHero(save, 'messi');
  const c = simCareer({ seed: 5, save, to: 8 });
  const idx = RS.YEARS.findIndex((y) => y.year === 2010);
  // a strong bot wins the first 클라시코 inside the window
  const w = RS.startYear(JSON.parse(JSON.stringify(c.save)), idx, { seed: 3 });
  let seen = null, end = null, t0 = 0;
  for (let i = 0; i < 60 * 75 && running(w); i++) {
    step(w, true);
    for (const ev of w.events) { if (ev.type === 'rival') { seen = ev; t0 = w.t; } if (ev.type === 'rivalEnd') end = Object.assign({ at: w.t - t0 }, ev); }
    w.events.length = 0;
  }
  assert.ok(seen && seen.name === '호날두' && seen.lv === 0, 'rival banner');
  assert.ok(Math.abs(t0 - w.stageTime * 0.42) < 0.5, 'came at ' + t0.toFixed(1));
  assert.ok(end && end.win && end.at < RS.RIVAL_WINDOW, 'first 클라시코: ' + JSON.stringify(end));
  assert.equal(w.rivalResult, 'win');
  assert.ok(!w.enemies.some((e) => e.rival), 'no enemy still flagged as the rival');
  // a motionless, unarmed player loses: he leaves when the window closes
  const w2 = RS.startYear(JSON.parse(JSON.stringify(c.save)), idx, { seed: 3 });
  w2.debug.godMode = true; w2.build.skillOrder = []; w2.build.skills = {}; w2.build.relics = {}; w2.build.relicOrder = []; w2.mates.length = 0;
  let left = null, t1 = 0;
  for (let i = 0; i < 60 * 75 && running(w2); i++) {
    step(w2, false);
    for (const ev of w2.events) { if (ev.type === 'rival') t1 = w2.t; if (ev.type === 'rivalEnd') left = Object.assign({ at: w2.t - t1 }, ev); }
    w2.events.length = 0;
  }
  assert.ok(left && !left.win && Math.abs(left.at - RS.RIVAL_WINDOW) < 0.2, 'loss: ' + JSON.stringify(left));
  assert.equal(w2.rivalResult, 'loss');
}));

test('the 클라시코 record moves 민심 and a lost one in a 발롱도르 year hands the trophy to the rival (a replay can take it back)', () => withHero('messi', () => {
  const save = RS.newSave(); RS.switchHero(save, 'messi');
  const idx = RS.YEARS.findIndex((y) => y.year === 2011); // a 발롱도르 year with a 클라시코
  assert.ok(RS.YEARS[idx].ballon && RS.YEARS[idx].rival);
  save.career.yearIdx = idx;
  const play = (result) => {
    const w = new RS.World({ yearIdx: idx, seed: 1, build: save.career.build, meta: save.meta });
    w.phase = 'clear'; w.rivalResult = result;
    return RS.finishYear(save, w);
  };
  const fans0 = save.career.build.fans;
  const lost = play('loss');
  assert.equal(lost.rival, 'loss'); assert.equal(lost.ballonStolen, true); assert.equal(lost.ballon, 0);
  assert.equal(save.meta.ballons, 0);
  assert.deepEqual(save.career.build.rivalry, { w: 0, l: 1 });
  assert.equal(save.career.build.fans, fans0 - RS.RIVAL_FANS);
  // the year is cleared, so playing it again is a replay: the trophy can still be won, the record does not move
  const won = play('win');
  assert.equal(won.replay, true);
  assert.equal(won.ballon, 1); assert.equal(save.meta.ballons, 1);
  assert.deepEqual(save.career.build.rivalry, { w: 0, l: 1 });
}));

test('old saves convert the best 날두 move into the held weapon and keep the rest in the armory', () => {
  const raw = JSON.stringify({ v: 2, career: { yearIdx: 3, build: { hero: 'ronaldo', level: 9, skills: { kick: 6, knuckle: 2 }, skillOrder: ['kick', 'knuckle'], passives: {}, passiveOrder: [], evolved: {}, teammates: [], bench: [], relics: {}, relicOrder: [], coachCards: [] } }, meta: { coins: 10 } });
  const save = RS.loadSave(memStore(raw));
  const b = save.career.build;
  assert.deepEqual(b.rivalry, { w: 0, l: 0 });
  assert.deepEqual(b.weapon, { id: 'kick', g: 3, p: 1 });
  assert.deepEqual(b.armory, [{ id: 'knuckle', g: 1, p: 1 }]);
  assert.deepEqual(b.skillOrder, ['kick']);
});
