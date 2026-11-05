const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };

// Round 13: coins bought 초히든 items at Lv.1 and an 8-coin reroll could be pressed again and again, so a fresh career
// started with the strongest gear. The top grades (영웅, 전설) now come only from luck in a match; 전설 is a long
// shot in the debut (the user: "0.019% 정도") and climbs slowly.
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

test('전설 is a long shot in the debut, even with doubled luck, and its odds only climb season by season', () => {
  const count = (yearIdx, luck) => {
    const rng = RS.makeRng(9), g = new Array(RS.GRADES.length).fill(0); // round 14: GOAT and SIUUU above SSS
    for (let i = 0; i < 6000; i++) {
      for (const c of RS.levelChoices(RS.newBuild(), rng, yearIdx, luck, 0)) if (['weapon', 'passive', 'passiveUp', 'relic', 'stim'].includes(c.kind)) g[c.g]++;
    }
    return g;
  };
  const debut = count(0, 1), wall = count(5, 0), n = debut.reduce((a, x) => a + x);
  assert.ok(debut[4] / n < 0.001, '전설 is a long shot in the debut: ' + debut.join('/'));
  assert.ok(debut[3] / n < 0.03, '영웅 stays rare in the debut: ' + debut.join('/'));
  assert.ok(wall[4] > 0, '전설 does come by the wall season');
  assert.ok(RS.gradeOddsAt(0)[4] > 0, '전설 is possible in the debut');
  for (let i = 1; i < 24; i++) assert.ok(RS.gradeOddsAt(i)[4] >= RS.gradeOddsAt(i - 1)[4], '전설 odds never drop: season ' + i);
});

// Round 13.1: a youth stage showed its first man after 46 s ("한 두 마리는 계속 덤벼야지").
test('an early stage always has a man or two on his way from the first seconds', () => {
  for (const seed of [1, 2, 3]) {
    const w = new RS.World({ yearIdx: 0, seed }); w.debug.godMode = true;
    let empty = 0, frames = 0;
    while (w.t < 45) {
      if (w.phase === 'levelup') w.choose(RS.botChoose(w.choices, w.build));
      else if (w.phase === 'chest') w.closeChest();
      else if (w.phase === 'swap') w.chooseSwap(w.swapChoices.length - 1);
      else {
        w.update(1 / 60, { x: 0, y: 0 });
        if (w.t > 6) { frames++; if (!w.enemies.some((e) => e.alive && w.inSight(e))) empty++; }
      }
    }
    assert.ok(empty / frames < 0.1, 'seed ' + seed + ': share of time with nobody in sight ' + (empty / frames).toFixed(2));
  }
});

// Round 13.2 (the user): "맞고 나서 1초간 깜박이며 무적 … 3초까지 연장 (1 ~ 2 ~ 3)".
test('오뚝이 정신 keeps the hero untouchable after a hit: 1, 2, 3 s with 희귀 cards, never past 3 s', () => {
  const guard = (gs) => {
    const b = RS.newBuild();
    b.passives.ironwill = gs.length; b.passiveOrder.push('ironwill'); b.passiveGrades.ironwill = gs;
    const w = new RS.World({ yearIdx: 2, seed: 1, build: b });
    w.player.iframe = 0;
    w.hurtPlayer(5, null);
    return w.player.iframe;
  };
  assert.deepEqual([[2], [2, 2], [2, 2, 2]].map(guard), [1, 2, 3]);
  assert.equal(guard([4, 4, 4]), 3, 'never past 3 s');
  assert.equal(RS.passiveMax('ironwill'), 3);
});

// "1차 공세라 할만큼 몹이 몰려오지도 않았는데 2차 공세 시작이라네": a banner used to come with no men.
test('every 공세 banner brings a pack, and a debut hit is felt', () => {
  const w = new RS.World({ yearIdx: 2, seed: 2 });
  assert.ok(['wave1', 'wave2', 'wave3'].every((k) => w.schedule.some((ev) => ev.kind === k)));
  for (const n of [1, 2, 3]) {
    const before = w.enemies.length;
    w.surge(n);
    assert.ok(w.enemies.length - before >= 5, '공세 ' + n + ': ' + (w.enemies.length - before) + ' men');
  }
  const debut = new RS.World({ yearIdx: 0, seed: 2 });
  assert.ok(debut.spawnEnemy('grunt', 300, 0).dmg >= 3, 'a debut 수비수 hit takes more than the old 2 of 100 HP');
  assert.ok(w.spawnEnemy('grunt', 300, 0).dmg >= 6, 'a 2004 수비수 hit lost its newcomer discount');
});

// Round 13.3 (the user): "보스 사거리 무제한인 거 에바야 죽을 거같아서 피하는데 계속 공격하면 어떻게해".
test('a boss off the hero\'s screen walks in instead of attacking', () => {
  const w = new RS.World({ yearIdx: 2, seed: 3 }); w.debug.godMode = true;
  const tick = () => {
    if (w.phase === 'levelup') w.choose(0);
    else if (w.phase === 'chest') w.closeChest();
    else if (w.phase === 'swap') w.chooseSwap(0);
    else w.update(1 / 60, { x: 0, y: 0 });
  };
  w.t = w.stageTime;
  for (let i = 0; i < 60 * 30 && !w.bossSpawned; i++) tick();
  const boss = w.enemies.find((e) => e.boss && e.alive);
  assert.ok(boss, 'the season boss is on');
  boss.x = w.player.x + w.view.w; boss.y = w.player.y; boss.ai.act = null; boss.ai.cool = 0;
  while (w.phase !== 'play') tick();
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(boss.ai.act, null, 'no attack from off screen');
  let acted = false;
  for (let i = 0; i < 60 * 10 && !acted; i++) { tick(); acted = !!boss.ai.act; }
  assert.ok(acted, 'he attacks once he has walked onto the screen');
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
