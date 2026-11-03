const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');
require('../src/js/render.js');

test('enemy shots render as red streaks with a forward aiming line while waiting', () => {
  const strokes = [];
  const ctx = {
    beginPath() { this.lines = []; },
    moveTo(x, y) { this.from = [x, y]; },
    lineTo(x, y) { this.lines.push({ from: this.from, to: [x, y] }); },
    stroke() { strokes.push({ color: this.strokeStyle, lines: this.lines }); }
  };
  const w = new RS.World({ yearIdx: 0, seed: 1 });
  w.enemyShot('ball', 50, 50, 0, 100, 5, 3, 0, { wait: 1 });
  RS.Renderer.prototype.drawEnemyShots.call({ view: { w: 260, h: 460 } }, ctx, w, 0, 0);
  assert.ok(strokes.some(s => s.lines.some(l => l.from[0] === 50 && l.to[0] > 100)), 'forward aim warning');
  assert.ok(strokes.some(s => {
    if (!/^#[0-9a-f]{6}$/i.test(s.color)) return false;
    const r = parseInt(s.color.slice(1, 3), 16), g = parseInt(s.color.slice(3, 5), 16);
    return r > g * 2 && s.lines.some(l => l.from[0] < l.to[0] && l.from[1] === l.to[1]);
  }), 'a red beam, not a round ball');
});

test('a cleared season lets go of the teammates who do not play beside the hero next season; new men take their places at the same 강화', () => {
  const s = RS.newSave(), b = s.career.build;
  RS.addMate(b, 'hugovia', 5); RS.addMate(b, 'quaresmo', 2); // 2002 리스본 only
  RS.addMate(b, 'torresmate', 3); // the 토레쓰 reward stays for good
  const world = { yearIdx: 0, result: () => ({ cleared: true, coins: 0, kills: 0, level: 1 }), exportBuild: () => RS.cloneBuild(b) };
  const out = RS.finishYear(s, world);
  assert.equal(s.career.yearIdx, 1);
  assert.deepEqual(out.farewell.gone, ['hugovia', 'quaresmo']);
  const squad = RS.allMates(s.career.build);
  assert.deepEqual(squad.map((m) => m.lv), [5, 2, 3], 'every place keeps its 강화');
  assert.ok(squad.every((m) => RS.mateInSeason(m.id, 1)), 'all of them play at 맨체스터 in 2003: ' + squad.map((m) => m.id));
  assert.ok(squad.some((m) => m.id === 'torresmate'));
  assert.deepEqual(out.farewell.joined.map((m) => m.id).sort(), squad.filter((m) => m.id !== 'torresmate').map((m) => m.id).sort());
});

test('paid teammate training increases the player enhancement and rejects unaffordable training', () => {
  const s = RS.newSave(), b = s.career.build;
  RS.addMate(b, 'tumblenano', 1);
  s.meta.coins = 0;
  assert.equal(RS.buyMateTrain(s, 'tumblenano'), false);
  assert.equal(b.teammates[0].lv, 1);
  s.meta.coins = 10000;
  assert.equal(RS.buyMateTrain(s, 'tumblenano'), true);
  assert.equal(b.teammates[0].lv, 2);
  assert.ok(s.meta.coins < 10000);
});

test('weapon offers are new moves or better copies and taking one equips it', () => {
  const b = RS.newBuild(), rng = RS.makeRng(12);
  let offers = 0;
  for (let i = 0; i < 100; i++) {
    const w = RS.offerWeapon(b, rng, 0, 0);
    if (!w) continue;
    const owned = [b.weapon, ...b.armory].find(x => x.id === w.id);
    assert.ok(!owned || RS.weaponMul(w) > RS.weaponMul(owned));
    assert.ok(w.p >= 1 && w.p <= 4);
    assert.ok(RS.applyChoice(b, { kind: 'weapon', id: w.id, wpn: w }));
    assert.deepEqual(b.weapon, w);
    offers++;
  }
  assert.ok(offers > 0);
});

test('stacked armor cannot remove more than half a hit', () => {
  const w = new RS.World({ yearIdx: 0, seed: 1 });
  w.stats.armor = 1000;
  const hp = w.player.hp;
  w.hurtPlayer(40);
  assert.equal(w.player.hp, hp - 20);
});

test('a stationary debut hero is badly hurt before the season ends', () => {
  // round 12: judged over eight seeds — the thinner crowd of round 12 comes in packs, so one seed is a coin toss
  let hurt = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const w = new RS.World({ yearIdx: 0, seed });
    for (let i = 0; i < 3600 && w.phase !== 'dead'; i++) {
      if (w.phase === 'levelup') w.choose(RS.botChoose(w.choices, w.build));
      if (w.phase === 'chest') w.closeChest();
      if (w.phase === 'swap') w.chooseSwap(w.swapChoices.length - 1);
      w.update(1 / 60, { x: 0, y: 0 });
    }
    if (w.dmgTaken >= w.stats.maxHp / 2 || w.phase === 'dead') hurt++;
  }
  assert.ok(hurt >= 5, 'badly hurt or dead in ' + hurt + ' of 8 seeds');
});

test('season bosses clear the crowd instead of hiding behind it', () => {
  const w = new RS.World({ yearIdx: 6, seed: 1 });
  for (let i = 0; i < 100; i++) w.spawnEnemy('grunt', 100 + i, 0);
  w.spawnBoss();
  assert.ok(w.enemies.filter(e => e.alive && !e.boss).length < 20);
});

test('Torres leaving the window preserves the Drogba season clear without unlocking him', () => {
  const s = RS.newSave(), idx = RS.YEARS.findIndex(y => y.boss.type === 'drogba');
  s.career.yearIdx = idx;
  const w = RS.startYear(s, idx, { seed: 3 }); w.debug.godMode = true;
  w.killEnemy(w.spawnBoss());
  for (let i = 0; i < 120 && !w.torres; i++) w.update(1 / 60, { x: 0, y: 0 });
  assert.ok(w.torres);
  for (let i = 0; i < 2000 && w.phase === 'play'; i++) {
    w.build.skills = {}; w.build.skillOrder = [];
    w.update(1 / 60, { x: 0, y: 0 });
  }
  const result = RS.finishYear(s, w);
  assert.equal(result.cleared, true);
  assert.equal(RS.needsTorresReward(s), false);
  assert.equal(RS.heroLocked(s.meta, 'torres'), true);
});

test('teammate candidates fit the club and year throughout each hero career', () => {
  try {
    for (const hero of ['ronaldo', 'messi', 'torres']) {
      RS.selectHero(hero);
      const b = RS.newBuild(hero);
      RS.YEARS.forEach((year, idx) => {
        for (const id of RS.mateCandidates(b, idx)) {
          const mate = RS.TEAMMATES[id];
          assert.equal(mate.era, year.era);
          if (mate.yrs) assert.ok(year.year >= mate.yrs[0] && year.year <= mate.yrs[1], hero + ':' + year.year + ':' + id);
          if (idx === 0) assert.ok(!mate.name.includes('수아'));
        }
      });
    }
  } finally { RS.selectHero('ronaldo'); }
});

test('recruits sign with varied pre-trained enhancement from +1 through +10', () => {
  const rng = RS.makeRng(17), levels = new Set();
  for (let i = 0; i < 3000; i++) {
    const b = RS.newBuild();
    const card = RS.makeChoices(b, rng, 0, 3).find(c => c.kind === 'mate');
    if (!card) continue;
    assert.ok(RS.applyChoice(b, card));
    const m = RS.allMates(b).find(m => m.id === card.id);
    assert.equal(m.lv, card.lv);
    assert.ok(m.lv >= 1 && m.lv <= 10);
    levels.add(m.lv);
  }
  assert.deepEqual([...levels].sort((a, b) => a - b), [1,2,3,4,5,6,7,8,9,10]);
});

test('weapon drops and boxes make each supported higher grade rarer', () => {
  for (const odds of [RS.GRADE_ODDS, ...RS.WEAPON_BOXES.map(b => b.odds)]) {
    const rng = RS.makeRng(25), counts = [0,0,0,0,0,0];
    for (let i = 0; i < 100000; i++) counts[RS.rollGrade(rng, odds)]++;
    const supported = counts.filter((n, g) => odds[g] > 0);
    for (let g = 1; g < supported.length; g++) assert.ok(supported[g - 1] > supported[g]);
    assert.ok(counts[5] > 0, 'rainbow is obtainable');
  }
});

test('debut has only a few level-ups and a smaller crowd than the late career', () => {
  const measure = idx => {
    const w = new RS.World({ yearIdx: idx, seed: 7 }); w.debug.godMode = true;
    let crowd = 0;
    for (let i = 0; i < 3600; i++) {
      if (w.phase === 'levelup') w.choose(RS.botChoose(w.choices, w.build));
      if (w.phase === 'chest') w.closeChest();
      if (w.phase === 'swap') w.chooseSwap(w.swapChoices.length - 1);
      w.update(1 / 60, RS.botInput(w));
      crowd = Math.max(crowd, w.enemies.filter(e => e.alive).length);
    }
    return { w, crowd };
  };
  const early = measure(0), late = measure(20);
  assert.ok(early.w.build.level <= 6, 'about four level-ups in the debut');
  assert.ok(early.crowd < late.crowd);
  assert.ok(early.crowd < 100, 'not hundreds of debut enemies');
});

test('Drogba defeat starts optional Torres; winning unlocks his hero and one seasonal reward', () => {
  const s = RS.newSave(), idx = RS.YEARS.findIndex(y => y.boss.type === 'drogba');
  s.career.yearIdx = idx;
  assert.equal(RS.heroLocked(s.meta, 'torres'), true);
  const fight = () => {
    const w = RS.startYear(s, idx, { seed: 3 }); w.debug.godMode = true;
    w.killEnemy(w.spawnBoss());
    for (let i = 0; i < 120 && !w.torres; i++) w.update(1 / 60, { x: 0, y: 0 });
    assert.ok(w.torres, 'Torres runs on after Drogba');
    assert.ok(Math.abs(w.torres.leaveAt - w.t - 30) < 0.1);
    w.killEnemy(w.torres);
    assert.equal(w.phase, 'clear');
    return RS.finishYear(s, w);
  };
  assert.equal(fight().torresReward, true);
  assert.equal(RS.heroLocked(s.meta, 'torres'), false);
  const coins = s.meta.coins;
  RS.applyTorresReward(s, { id: 'coins' }, RS.makeRng(1));
  assert.equal(s.meta.coins, coins + 500);
  assert.equal(RS.needsTorresReward(s), false);
  assert.equal(fight().torresReward, undefined);
  assert.equal(RS.needsTorresReward(s), false);
});

test('rewards left unpicked before a reload are offered before the next match: 토레쓰 first, then the season boss', () => {
  const s = RS.newSave(), idx = RS.YEARS.findIndex(y => y.boss.type === 'drogba');
  s.career.yearIdx = idx;
  const w = RS.startYear(s, idx, { seed: 3 }); w.debug.godMode = true;
  w.killEnemy(w.spawnBoss());
  for (let i = 0; i < 120 && !w.torres; i++) w.update(1 / 60, { x: 0, y: 0 });
  w.killEnemy(w.torres);
  RS.finishYear(s, w);
  const reloaded = RS.loadSave({ get: () => JSON.stringify(s) });
  assert.deepEqual(RS.pendingRewards(reloaded), ['torres', 'boss']);
  RS.applyTorresReward(reloaded, { id: 'coins' }, RS.makeRng(1));
  RS.applyBossReward(reloaded, idx, RS.bossRewardChoices(reloaded, idx, RS.makeRng(2))[0], RS.makeRng(2));
  assert.deepEqual(RS.pendingRewards(reloaded), []);
});

test('unlocked Torres plays and clears his 17-year-old 2001 debut', () => {
  try {
    const s = RS.newSave(); s.meta.unlocked.torres = true;
    RS.switchHero(s, 'torres');
    assert.equal(RS.YEARS[0].year, 2001);
    assert.equal(RS.yearAge(0), 17);
    const c = simCareer({ save: s, seed: 7, to: 0 });
    assert.equal(c.stoppedAt, null, JSON.stringify(c.years));
    assert.equal(c.save.career.yearIdx, 1);
  } finally { RS.selectHero('ronaldo'); }
});

test('weapon swaps keep the old move in the armory and fight with one move', () => {
  const b = RS.newBuild('ronaldo');
  assert.ok(RS.gainWeapon(b, { id: 'knuckle', g: 2, p: 1 }, true));
  assert.equal(b.weapon.id, 'knuckle');
  assert.deepEqual(b.skillOrder, ['knuckle']);
  assert.ok(b.armory.some(w => w.id === 'kick'));
  assert.ok(RS.equipFromArmory(b, 'kick'));
  assert.deepEqual(b.skillOrder, ['kick']);
  assert.equal(RS.gainWeapon(b, { id: 'kick', g: 0, p: 1 }, true), false);
});

test('each next grade at +1 beats the preceding grade at +10', () => {
  for (let g = 0; g < 5; g++) {
    assert.ok(RS.weaponMul({ g, p: 10 }) < RS.weaponMul({ g: g + 1, p: 1 }));
  }
});

test('coin enhancement succeeds or costs coins without destroying the weapon', () => {
  const s = RS.newSave();
  s.meta.coins = 1000;
  assert.equal(RS.buyEnhance(s, () => 0).ok, true);
  assert.equal(s.career.build.weapon.p, 2);
  s.career.build.weapon.p = 9;
  const before = s.meta.coins;
  assert.equal(RS.buyEnhance(s, () => 0.999).ok, false);
  assert.equal(s.career.build.weapon.p, 9);
  assert.ok(s.meta.coins < before);
});

test('weapon boxes reject insufficient funds and provide weapons for coins', () => {
  const s = RS.newSave();
  s.meta.coins = 89;
  assert.equal(RS.buyBox(s, 'box1', RS.makeRng(7)), null);
  assert.equal(s.meta.coins, 89);
  s.meta.coins = 1100;
  const result = RS.buyBox(s, 'box3', RS.makeRng(7));
  assert.ok(result.w.g >= 2);
  assert.ok(result.kept);
  assert.equal(s.meta.coins, 0);
});

