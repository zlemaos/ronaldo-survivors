const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };

// Round 13: coins bought 초히든 items at Lv.1 and an 8-coin reroll could be pressed again and again, so a fresh career
// started with the strongest gear. The top grades (영웅, 전설) now come only from luck in a match, 전설 only from the
// wall season on.
test('coins cannot buy 영웅 or 전설: the 훈련장 boxes stop at 희귀, and a +10 희귀 stays below a 영웅 +1', () => {
  const s = RS.newSave(), rng = RS.makeRng(13);
  let top = 0;
  for (let i = 0; i < 300; i++) {
    s.meta.coins = 10000;
    for (const d of RS.WEAPON_BOXES) top = Math.max(top, RS.buyBox(s, d.id, rng).w.g);
  }
  assert.equal(top, 2, 'the best a box gives is 희귀');
  assert.ok(RS.weaponMul({ g: 2, p: RS.PLUS_MAX }) < RS.weaponMul({ g: 3, p: 1 }));
});

test('the debut never deals a 전설 card, even with doubled luck on every hand; 전설 opens at the wall', () => {
  const count = (yearIdx, luck) => {
    const rng = RS.makeRng(9), g = [0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      for (const c of RS.levelChoices(RS.newBuild(), rng, yearIdx, luck, 0)) if (['weapon', 'passive', 'passiveUp', 'relic', 'stim'].includes(c.kind)) g[c.g]++;
    }
    return g;
  };
  const debut = count(0, 1), wall = count(5, 0);
  assert.equal(debut[4], 0, 'no 전설 in the debut');
  assert.ok(debut[3] / debut.reduce((a, x) => a + x) < 0.03, '영웅 stays rare in the debut: ' + debut.join('/'));
  assert.ok(wall[4] > 0, '전설 can come from the wall season on');
});

// Luck once took its extra share from 일반 alone: a late season has no 일반, the odds summed over 1 and the roll
// never reached the top, so a 20 % 행운 부적 dealt no 전설 from season 10 on.
test('luck never lowers the 영웅 or 전설 odds: a 행운 부적 still deals 전설 in late seasons', () => {
  for (const idx of [0, 3, 5, 10, 16]) {
    const base = RS.gradeOddsAt(idx);
    for (const luck of [0.1, 0.2, 0.5, 1]) {
      const o = RS.luckOdds(base, luck);
      assert.ok(Math.abs(o.reduce((a, x) => a + x, 0) - 1) < 1e-9, 'odds add up to 1 at season ' + idx + ', luck ' + luck);
      for (let g = 0; g < 5; g++) if (base[g] === 0) assert.equal(o[g], 0, 'a closed grade stays closed');
      for (const g of [3, 4]) assert.ok(o[g] >= base[g] - 1e-12, 'grade ' + g + ' at season ' + idx + ', luck ' + luck);
    }
  }
  const rng = RS.makeRng(5), odds = RS.luckOdds(RS.gradeOddsAt(10), 0.2);
  let legend = 0;
  for (let i = 0; i < 4000; i++) if (RS.rollGrade(rng, odds) === 4) legend++;
  assert.ok(legend > 0, 'a 전설 is dealt at season 10 with a 20 % 행운 부적');
});

test('a passive card adds its grade\'s share, and levels saved before round 13 keep their full value', () => {
  const base = RS.computeStats(RS.newBuild(), {}).dmg;
  const share = (g) => { const b = RS.newBuild(); assert.ok(RS.applyChoice(b, { kind: 'passive', id: 'boots', g })); return RS.computeStats(b, {}).dmg - base; };
  const shares = [0, 1, 2, 3, 4].map(share);
  for (let g = 1; g < 5; g++) assert.ok(shares[g] > shares[g - 1], 'a higher grade adds more');
  const old = RS.normalizeBuild({ hero: 'ronaldo', weapon: { id: 'kick', g: 0, p: 1 }, passives: { boots: 3 }, passiveOrder: ['boots'] });
  assert.ok(Math.abs(RS.computeStats(old, {}).dmg - base - 3 * shares[2]) < 1e-9, 'an old level counts as 희귀');
});

test('round-12 saves convert: 무지개 and 황금 weapons become 전설 (evolved), 레어 becomes 희귀, items and passive levels stay', () => {
  const build = { hero: 'ronaldo', level: 30, weapon: { id: 'kick', g: 5, p: 7 }, armory: [{ id: 'siuu', g: 4, p: 3 }, { id: 'header', g: 2, p: 1 }],
    passives: { boots: 3 }, passiveOrder: ['boots'], relics: { whistle: 1, goat: 1 }, relicOrder: ['whistle', 'goat'], teammates: [], bench: [], coachCards: [] };
  const b = RS.loadSave(memStore(JSON.stringify({ career: { v: 3, yearIdx: 3, cleared: [true, true, true], build }, meta: {} }))).career.build;
  assert.deepEqual([b.weapon.g, b.weapon.p], [4, 7]);
  assert.ok(b.evolved.kick, '전설 is the evolved form');
  assert.deepEqual(b.armory.map((w) => [w.id, w.g]).sort(), [['header', 2], ['siuu', 4]]);
  assert.deepEqual(b.passiveGrades.boots, [2, 2, 2]);
  assert.deepEqual(b.relicOrder, ['whistle', 'goat']);
});
