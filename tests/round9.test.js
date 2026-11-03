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
  const save = RS.newSave(); RS.switchHero(save, 'messi');
  const c = simCareer({ seed: 5, save, to: 7 });
  const w = RS.startYear(c.save, RS.YEARS.findIndex((y) => y.year === 2009), { seed: 2 });
  w.t = w.stageTime - 1; for (const ev of w.schedule) if (ev.t < w.t) ev.done = true;
  let boss = null, rage = false;
  for (let i = 0; i < 60 * 150 && running(w); i++) {
    step(w, true);
    for (const ev of w.events) { if (ev.type === 'boss') boss = ev.name; if (ev.type === 'rage') rage = true; }
    w.events.length = 0;
  }
  assert.equal(boss, '호날두');
  assert.ok(rage, 'no 2nd phase');
  assert.ok(w.boss.ai.history.some((k) => k === 'snipe' || k === 'dash' || k === 'pslam'), '호날두 moves: ' + w.boss.ai.history.join(','));
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

test('합체: both parts evolved → the fused move is offered first, replaces them at Lv.1 in one slot, fires, evolves and fuses again (tier 2)', () => {
  for (const hero of ['ronaldo', 'messi']) withHero(hero, () => {
    const fused = Object.keys(RS.SKILLS).filter((id) => RS.SKILLS[id].fusion && RS.SKILLS[id].hero === hero);
    assert.ok(fused.length >= 5, hero + ' fusions: ' + fused.length);
    const tier2 = fused.find((id) => RS.SKILLS[id].fusion.every((p) => RS.SKILLS[p].fusion));
    assert.ok(tier2, hero + ' has a tier-2 fusion');
    const b = RS.newBuild(hero);
    const evolve = (id) => { if (!b.skills[id]) b.skillOrder.push(id); b.skills[id] = RS.SKILL_MAX; b.passives[RS.SKILLS[id].passive] = 1; b.evolved[id] = true; };
    const [fa, fb] = RS.SKILLS[tier2].fusion;
    RS.SKILLS[fa].fusion.forEach(evolve);
    assert.equal(RS.availableFusions(b).join(), fa, 'only ' + fa + ' is ready');
    assert.equal(RS.availableFusions(b).length, 1);
    const hand = RS.makeChoices(b, RS.makeRng(1), 10, 4);
    assert.ok(hand.some((c) => c.kind === 'fuse' && c.id === fa), 'offered: ' + hand.map((c) => c.kind + ':' + c.id).join(' '));
    assert.equal(RS.botChoose(hand, b), hand.findIndex((c) => c.kind === 'fuse'), '완전 오토 fuses first');
    const slots = b.skillOrder.length;
    assert.ok(RS.applyChoice(b, { kind: 'fuse', id: fa }));
    assert.equal(b.skills[fa], 1);
    assert.equal(b.skillOrder.length, slots - 1, 'one slot freed');
    for (const p of RS.SKILLS[fa].fusion) assert.ok(!b.skills[p] && !b.evolved[p] && !b.skillOrder.includes(p));
    assert.ok(!RS.availableFusions(b).length, 'nothing else ready');
    // new-skill cards never offer a fused move directly
    for (let i = 0; i < 30; i++) for (const c of RS.makeChoices(b, RS.makeRng(i), 10, 4)) if (c.kind === 'skill') assert.ok(!RS.SKILLS[c.id].fusion);
    // it fires in a live world, at Lv.1 and evolved
    for (const evo of [false, true]) {
      const w = new RS.World({ yearIdx: 8, seed: 3, build: JSON.parse(JSON.stringify(b)) });
      if (evo) { w.build.skills[fa] = RS.SKILL_MAX; w.build.evolved[fa] = true; w.recalc(); }
      w.debug.godMode = true;
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28; w.spawnEnemy('grunt', w.player.x + Math.cos(a) * 50, w.player.y + Math.sin(a) * 50); }
      for (let i = 0; i < 60 * 6 && running(w); i++) step(w, false);
      assert.ok(w.dmgDealt > 0, fa + (evo ? ' evolved' : '') + ' dealt nothing');
    }
    // tier 2: evolve the fused move and the other pair's fusion, then fuse them
    evolve(fa); RS.SKILLS[fb].fusion.forEach(evolve); assert.ok(RS.fuse(b, fb)); evolve(fb);
    assert.deepEqual(RS.availableFusions(b), [tier2]);
    assert.ok(RS.fuse(b, tier2));
    assert.equal(b.skills[tier2], 1);
    assert.ok(!b.skills[fa] && !b.skills[fb]);
    // the build survives a save round trip
    const back = RS.cloneBuild(b);
    assert.equal(back.skills[tier2], 1);
    assert.ok(back.skillOrder.includes(tier2));
  });
});

test('old saves load: no 클라시코 record and no fusions yet, and a 날두 build keeps its moves', () => {
  const raw = JSON.stringify({ v: 2, career: { yearIdx: 3, build: { hero: 'ronaldo', level: 9, skills: { kick: 6, knuckle: 2 }, skillOrder: ['kick', 'knuckle'], passives: {}, passiveOrder: [], evolved: {}, teammates: [], bench: [], relics: {}, relicOrder: [], coachCards: [] } }, meta: { coins: 10 } });
  const save = RS.loadSave(memStore(raw));
  const b = save.career.build;
  assert.deepEqual(b.rivalry, { w: 0, l: 0 });
  assert.equal(b.skills.kick, 6);
  assert.ok(!RS.availableFusions(b).length);
});
