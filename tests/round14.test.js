const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };
const torresSave = () => { const s = RS.newSave(); s.meta.unlocked.torres = true; RS.switchHero(s, 'torres'); return s; };
const withRonaldo = (fn) => { try { return fn(); } finally { RS.selectHero('ronaldo'); } };
// Play season idx to its clear with god mode (the boss is killed outright), through any 캄프 누 cinematic.
const clearSeason = (s, idx, seed) => {
  const w = RS.startYear(s, idx, { seed: seed || 3 }); w.debug.godMode = true;
  w.killEnemy(w.spawnBoss());
  for (let i = 0; i < 60 * 12 && w.phase === 'cine'; i++) w.update(1 / 60, null);
  assert.equal(w.phase, 'clear', 'season ' + idx + ' clears');
  return RS.finishYear(s, w);
};

// Round 14: the ladder reads as letter ranks, SSS being the old top; GOAT and SIUUU sit above it.
test('the ladder is B · A · S · SS · SSS · GOAT · SIUUU and each +1 beats the grade below at +10', () => {
  assert.deepEqual(RS.GRADES.map((g) => g.name), ['B', 'A', 'S', 'SS', 'SSS', 'GOAT', 'SIUUU']);
  assert.equal(RS.GRADE_TOP, 4);
  for (let g = 0; g < RS.GRADES.length - 1; g++) assert.ok(RS.weaponMul({ g, p: 10 }) < RS.weaponMul({ g: g + 1, p: 1 }), RS.GRADES[g].name);
  for (const st of RS.GRADE_STAGES) {
    assert.equal(st.odds.length, RS.GRADES.length);
    assert.ok(Math.abs(st.odds.reduce((a, x) => a + x, 0) - 1) < 1e-9, 'odds sum to 1 from season ' + st.from);
    assert.ok(st.odds[6] > 0 && st.odds[6] <= 1e-6, 'SIUUU is a lightning strike');
    assert.ok(st.odds[5] <= st.odds[4] && st.odds[6] < st.odds[5], 'rarer up the ladder');
  }
  assert.ok(RS.GRADE_STAGES[0].odds[5] <= 1e-5, 'GOAT is a one-in-100,000 card in the debut');
  assert.ok(RS.gradeOddsAt(5)[5] >= 5e-4, 'GOAT opens by the wall season');
  const hard = withRonaldo(() => { RS.setDiff('hard'); try { return RS.gradeOddsAt(10); } finally { RS.setDiff('normal'); } });
  assert.ok(hard[5] < RS.gradeOddsAt(10)[5] && hard[6] < RS.gradeOddsAt(10)[6], '하드 cuts GOAT and SIUUU too');
  assert.equal(RS.ENHANCE.cost.length, RS.GRADES.length);
});

test('a save from before round 14 keeps its grades below GOAT', () => {
  const s = RS.newSave();
  s.career.v = 3;
  s.career.build.weapon = { id: 'kick', g: 5, p: 2 };
  s.career.build.armory = [{ id: 'knuckle', g: 6, p: 1 }];
  const r = RS.loadSave(memStore(JSON.stringify(s)));
  assert.equal(r.career.build.weapon.g, RS.GRADE_TOP);
  assert.equal(r.career.build.armory[0].g, RS.GRADE_TOP);
  assert.equal(r.career.v, RS.CAREER_V);
  assert.equal(r.career.recallDone, -1);
});

test('제토라인 is dealt to 토레쓰 only once 제라두 has joined, from any way in', () => withRonaldo(() => {
  const s = torresSave(), b = s.career.build, rng = RS.makeRng(5);
  assert.ok(!RS.weaponIds('torres', 4, b).includes('zeto'));
  assert.ok(!RS.weaponIds('torres', 4).includes('zeto'), 'never without a build');
  assert.equal(RS.addMate(b, 'gerrardo', 3), 'pitch');
  assert.equal(b.flags.zeto, true);
  assert.ok(RS.unlockNote(b) && RS.unlockNote(b) === null, 'the notice shows once');
  assert.ok(RS.weaponIds('torres', 0, b).includes('zeto'));
  assert.ok(!RS.weaponIds('ronaldo', 4, Object.assign({}, b, { hero: 'ronaldo' })).includes('zeto'), 'his alone');
  let seen = false;
  for (let i = 0; i < 400 && !seen; i++) seen = RS.rollWeapon(b, rng, [0, 0, 0, 0, 1]).id === 'zeto';
  assert.ok(seen, 'it comes up among his weapons');
  const b2 = RS.newBuild('torres');
  b2.teammates.push({ id: 'kuyto', lv: 1 });
  assert.ok(RS.swapMate(b2, 'kuyto', 'gerrardo', 2));
  assert.equal(b2.flags.zeto, true);
  // it fires like the 유도 대포알, from the passer: a world with the move in hand lands damage
  const b3 = RS.newBuild('torres'); b3.flags.zeto = true; b3.teammates.push({ id: 'gerrardo', lv: 1 });
  assert.ok(RS.gainWeapon(b3, { id: 'zeto', g: 2, p: 1 }, true));
  const w = new RS.World({ yearIdx: 6, seed: 2, build: b3 }); w.debug.godMode = true;
  for (let i = 0; i < 60 * 20; i++) { if (w.phase === 'levelup') w.choose(0); else if (w.phase === 'chest') w.closeChest(); else if (w.phase === 'swap') w.chooseSwap(0); else w.update(1 / 60, { x: 0, y: 0 }); }
  assert.ok(w.dmgDealt > 0 && w.kills > 0, '제토라인 lands: ' + w.dmgDealt);
}));

test('2010: playing the 월드컵 on the knee can cost two grades on every weapon; resting makes 2014 safe', () => withRonaldo(() => {
  const idx = RS.YEARS_TORRES.findIndex((y) => y.event === 'wc2010');
  assert.ok(idx > 0);
  const run = (card, seed) => {
    const s = torresSave(); s.career.yearIdx = idx;
    RS.gainWeapon(s.career.build, { id: 'kick', g: 3, p: 2 }, true);
    s.career.build.armory.push({ id: 'knuckle', g: 1, p: 1 });
    const cards = RS.eventChoices(s, idx);
    const info = RS.applyEvent(s, idx, cards.find((c) => c.id === card), RS.makeRng(seed));
    return { s, info, b: s.career.build };
  };
  // the 40 % roll: a seed that lands it and one that does not
  const outcomes = new Set();
  for (let seed = 1; seed < 40 && outcomes.size < 2; seed++) {
    const { info, b } = run('wc10_go', seed);
    outcomes.add(info.roll);
    if (info.roll === 1) { assert.equal(b.weapon.g, 1); assert.equal(b.armory[0].g, 0, 'never below B'); assert.equal(b.flags.knee, 'bad'); }
    else { assert.equal(b.weapon.g, 3); assert.equal(b.flags.knee, 'ok'); assert.ok(RS.computeStats(b, {}).bossDmg > 1); }
  }
  assert.deepEqual([...outcomes].sort(), [0, 1]);
  const rest = run('wc10_rest', 1);
  assert.equal(rest.b.flags.knee, 'fit');
  assert.equal(RS.computeStats(rest.b, {}).maxHp, 115);
  // 2014 follows the knee: a fit knee gets the safe card, a bad one the gamble
  const i14 = RS.YEARS_TORRES.findIndex((y) => y.event === 'wc2014');
  rest.s.career.yearIdx = i14;
  assert.ok(RS.eventChoices(rest.s, i14).some((c) => c.id === 'wc14_fit'));
  const bad = run('wc10_go', [...Array(40).keys()].find((seed) => run('wc10_go', seed + 1).info.roll === 1) + 1);
  bad.s.career.yearIdx = i14;
  const bc = RS.eventChoices(bad.s, i14);
  assert.ok(bc.some((c) => c.id === 'wc14_bad') && bc.find((c) => c.id === 'wc14_bad').rolls[1].fx.gradeDown === 2);
}));

test('2011 crossroads: 안필드 keeps 리버풀 seasons with 수아레즈 as the boss, who then returns as a 준보스', () => withRonaldo(() => {
  const s = torresSave(), idx = 10;
  assert.equal(RS.YEARS[idx].press, 'crossroads');
  s.career.yearIdx = idx;
  const out = RS.applyPress(s, idx, 'stay', RS.makeRng(1));
  assert.equal(out.path, 'liverpool');
  assert.equal(s.career.build.flags.path, 'liverpool');
  assert.equal(RS.YEARS, RS.YEARS_TORRES_LFC);
  assert.equal(RS.YEARS[idx].era, 'liverpool');
  assert.equal(RS.YEARS[idx].boss.type, 'suarez');
  assert.equal(RS.YEARS.length, 19);
  assert.ok(RS.YEARS.every((y) => RS.COACHES[y.coach] && RS.BOSS_TYPES[y.boss.type] && RS.ERAS[y.era]));
  assert.ok(RS.computeStats(s.career.build, {}).dmg > 1, 'the 칭호 card counts');
  assert.ok(RS.mateCandidates(s.career.build, 12).includes('gerrardo'), '제라두 stays for the 잔류 years');
  // a reload keeps the path
  const r = RS.loadSave(memStore(JSON.stringify(s)));
  assert.equal(RS.YEARS[idx].boss.type, 'suarez');
  const res = clearSeason(r, idx);
  assert.equal(res.suarez, true);
  assert.equal(r.career.build.flags.suarez, true);
  // from now on a 준보스 wave may bring him (never in his own boss season)
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const w = RS.startYear(r, 11, { seed });
    w.runScheduled('mini');
    if (w.enemies.some((e) => e.alive && e.type === 'suarezmini')) seen++;
  }
  assert.ok(seen > 3 && seen < 27, '수아레즈 as a 준보스 in some waves: ' + seen);
  const own = RS.startYear(r, idx, { seed: 1 }); own.runScheduled('mini');
  assert.ok(!own.enemies.some((e) => e.type === 'suarezmini'), 'not beside himself');
  assert.ok(RS.heroGrade(r.career.build) == null, 'no 첼씨 grade on this path');
}));

test('2011 crossroads: 첼씨 is four 시련 — each clear lifts 첼씨 토레쓰 a grade, the 캄프 누 goal plays out, 성공한 첼씨 토레쓰 is unlocked', () => withRonaldo(() => {
  const s = torresSave(), idx = 10, b = s.career.build;
  s.career.yearIdx = idx;
  const base = RS.computeStats(b, {}).dmg;
  RS.applyPress(s, idx, 'chelsea', RS.makeRng(1));
  assert.equal(b.flags.path, 'chelsea');
  assert.equal(RS.heroGrade(b), 0);
  assert.equal(RS.heroGradeName(b), 'B');
  assert.ok(RS.computeStats(b, {}).dmg < base, 'a B 첼씨 토레쓰 hits softer');
  assert.ok(RS.needsRecall(s, idx));
  RS.applyPress(s, idx, 'go', RS.makeRng(1), RS.YEARS[idx].recall);
  assert.ok(!RS.needsRecall(s, idx) && s.career.recallDone === idx);
  assert.equal(RS.YEARS.length, 21);
  const trials = RS.YEARS.map((y, i) => (y.ctrial ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(trials, [10, 11, 12, 13]);
  assert.equal(RS.YEARS[13].cine, 'goal900');
  for (const [k, i] of trials.entries()) {
    const res = clearSeason(s, i, 7 + i);
    assert.deepEqual(res.cgrade, { from: k, to: k + 1 }, 'trial ' + (k + 1));
    assert.equal(RS.heroGrade(s.career.build), k + 1); // the career build is the world's export now
    if (RS.needsBossReward(s, i)) RS.applyBossReward(s, i, { id: 'coins' }, RS.makeRng(1));
  }
  assert.equal(RS.heroGradeName(s.career.build), 'SSS');
  assert.equal(s.meta.unlocked.torresBlue, true);
  assert.ok(RS.computeStats(s.career.build, {}).dmg > base, 'an SSS 첼씨 토레쓰 hits harder');
  assert.equal(RS.YEARS[14].year, 2013);
  // the cinematic itself: the keeper stands in front of a goal, the ball is kicked, the season clears
  const w = RS.startYear(s, 13, { seed: 9 }); w.debug.godMode = true;
  w.killEnemy(w.spawnBoss());
  assert.equal(w.phase, 'cine');
  assert.ok(w.fx.some((f) => f.kind === 'goal') && w.enemies.some((e) => e.alive && e.cine));
  const kinds = new Set();
  for (let i = 0; i < 60 * 8 && w.phase === 'cine'; i++) { w.update(1 / 60, null); for (const f of w.fx) kinds.add(f.kind); }
  assert.equal(w.phase, 'clear');
  assert.ok(kinds.has('lob') && kinds.has('strail'), [...kinds].join());
  assert.ok(w.events.some((e) => e.type === 'banner' && /GOAL/.test(e.text)));
  assert.equal(w.result().cleared, true);
  // 성공한 첼씨 토레쓰: his next career starts at SSS in blue, skipping the crossroads
  RS.newCareer(s);
  const nb = s.career.build;
  assert.equal(nb.flags.blue, true);
  assert.equal(RS.heroGradeName(nb), 'SSS');
  assert.equal(RS.TORRES_BLUE, true);
  s.career.yearIdx = 10;
  assert.ok(!RS.needsPress(s, 10), 'no crossroads for him');
  assert.equal(RS.YEARS[10].era, 'chelseat');
  RS.selectHero('ronaldo');
  assert.equal(RS.TORRES_BLUE, false);
}));

test('an ordinary 날두 career is untouched: no 첼씨 grade, no 제토라인, the same 24 seasons', () => {
  const s = RS.newSave(), b = s.career.build;
  assert.equal(RS.heroGrade(b), null);
  assert.equal(RS.computeStats(b, {}).dmg, 1);
  assert.ok(!RS.weaponIds('ronaldo', 4, b).includes('zeto'));
  assert.equal(RS.YEARS, RS.YEARS_RONALDO);
  const w = RS.startYear(s, 3, { seed: 1 }); w.debug.godMode = true;
  w.killEnemy(w.spawnBoss());
  assert.equal(w.phase, 'clear');
});
