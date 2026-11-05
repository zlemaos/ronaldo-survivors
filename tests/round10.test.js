// Round 10: varied level-up hands, and 발롱도르 balls only for the 발롱도르 the hero has really won in this career.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');

const withHero = (hero, fn) => { RS.selectHero(hero); try { return fn(); } finally { RS.selectHero('ronaldo'); } };
const withDiff = (k, fn) => { RS.setDiff(k); try { return fn(); } finally { RS.setDiff('normal'); } };
const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };
const years = (hero) => RS.HEROES[hero].years.filter((y) => y.ballon).map((y) => y.year);
// A 전설 (evolved) weapon with only trophies actually won in this career.
function evolvedBuild(hero, id, won, variant) {
  const b = RS.newBuild(hero);
  b.weapon = { id, g: 4, p: 1, v: variant };
  b.ballons = years(hero).slice(0, won);
  RS.syncWeapon(b);
  return b;
}
function crowdWorld(b, seed) {
  const w = new RS.World({ yearIdx: 12, seed: seed || 3, build: b });
  w.debug.godMode = true;
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; w.spawnEnemy('tank', w.player.x + Math.cos(a) * 40, w.player.y + Math.sin(a) * 40); }
  return w;
}

test('rainbow 회전 공 shows only trophies won in the career', () => withHero('messi', () => {
  const b0 = RS.newBuild('messi');
  b0.weapon.g = 5; RS.syncWeapon(b0);
  assert.equal(RS.orbitLook(b0), 'gold');
  const ring = (variant, won) => { const w = crowdWorld(evolvedBuild('messi', 'orbit', won, variant)); for (let i = 0; i < 30; i++) w.update(1 / 60, { x: 0, y: 0 }); return w.orbs.map((o) => o.look + ':' + o.r.toFixed(1)); };
  assert.deepEqual(ring('count', 3), ['ballon:6.4', 'ballon:6.4', 'ballon:6.4', 'gold:6.4']);
  assert.deepEqual(ring('size', 3), ['ballon:12.0', 'gold:6.4']);
  assert.equal(ring('count', 6).filter((l) => l.startsWith('ballon')).length, 6);
  assert.deepEqual(ring('size', 8), ['ballon:32.0']);
  // the trophies hit harder than the golden fill
  const w = crowdWorld(evolvedBuild('messi', 'orbit', 1, 'count'));
  w.update(1 / 60, { x: 0, y: 0 });
  assert.ok(w.orbs[0].dmg > w.orbs[1].dmg);
  assert.ok(w.orbs.length === RS.ORBIT_RING);
}));

test('other 발롱도르 moves: trophies only up to the number won, golden before the first (날두 too)', () => {
  withHero('messi', () => {
    const w = crowdWorld(evolvedBuild('messi', 'dribball', 2));
    for (let i = 0; i < 30; i++) w.update(1 / 60, { x: 0, y: 0 });
    assert.deepEqual(w.dribs.map((d) => d.look), ['ballon', 'ballon', 'gold', 'gold']);
    const w0 = crowdWorld(evolvedBuild('messi', 'dribball', 0));
    for (let i = 0; i < 30; i++) w0.update(1 / 60, { x: 0, y: 0 });
    assert.ok(w0.dribs.every((d) => d.look === 'gold'), 'no trophy before the first 발롱도르');
  });
  withHero('ronaldo', () => {
    const volley = (won) => {
      const w = crowdWorld(evolvedBuild('ronaldo', 'kick', won));
      w.fire('kick', RS.skillStats('kick', RS.SKILL_MAX, true), true, 'kick');
      return w.projs.filter((p) => p.alive).map((p) => p.kind);
    };
    assert.deepEqual(volley(0), ['golden', 'golden', 'golden']);
    assert.deepEqual(volley(1), ['ballon', 'golden', 'golden']);
    assert.deepEqual(volley(5), ['ballon', 'ballon', 'ballon']);
    const b0 = evolvedBuild('ronaldo', 'kick', 0), b2 = evolvedBuild('ronaldo', 'kick', 2);
    assert.equal(RS.evoTitle(b0, 'kick', true), '황금 볼');
    assert.equal(RS.evoTitle(b2, 'kick', true), '황금 발롱볼');
    assert.equal(RS.evoTitle(RS.newBuild('ronaldo'), 'missile'), '황금 미사일');
  });
});

test('a cleared 발롱도르 season adds to the career\'s 발롱도르; a stolen one does not until a replay wins it back', () => withHero('messi', () => {
  const save = RS.newSave(); RS.switchHero(save, 'messi');
  const play = (year, rival) => {
    const idx = RS.YEARS.findIndex((y) => y.year === year);
    if (save.career.yearIdx < idx) save.career.yearIdx = idx;
    const w = new RS.World({ yearIdx: idx, seed: 1, build: RS.buildForYear(save, idx), meta: save.meta });
    w.phase = 'clear'; w.rivalResult = rival;
    return RS.finishYear(save, w);
  };
  assert.equal(play(2009).ballonWon, 1);
  assert.deepEqual(save.career.build.ballons, [2009]);
  assert.equal(play(2010, 'loss').ballonWon, undefined, 'lost the 클라시코: the rival took it');
  assert.equal(RS.ballonCount(save.career.build), 1);
  assert.equal(play(2010, 'win').ballonWon, 2, 'the replay won it back');
  assert.equal(RS.ballonCount(save.career.build), 2);
}));

test('legacy trophy saves convert to graded weapons and retain earned career trophies', () => withHero('messi', () => {
  const build = (extra) => Object.assign({ hero: 'messi', level: 12, hgh: true, skills: { orbit: 6 }, skillOrder: ['orbit'], passives: { ballon: 1 }, passiveOrder: ['ballon'],
    evolved: { orbit: 'size' }, stars: { orbit: 2 }, teammates: [], bench: [], relics: {}, relicOrder: [], coachCards: [] }, extra || {});
  const youth = RS.loadSave(memStore(JSON.stringify({ career: { v: 2, yearIdx: 1, cleared: [true], build: build(), snapshots: { 1: build() } }, meta: {} })));
  const b = youth.career.build;
  assert.equal(b.weapon.id, 'orbit');
  assert.equal(b.weapon.g, 4);
  assert.equal(RS.orbitLook(b), 'gold', 'no trophy before earning one');
  const idx = RS.YEARS_MESSI.findIndex((y) => y.year === 2012);
  const cleared = new Array(idx).fill(true);
  const later = RS.loadSave(memStore(JSON.stringify({ career: { v: 2, yearIdx: idx, cleared, build: build(), snapshots: { [idx - 2]: build() } }, meta: {} })));
  assert.deepEqual(later.career.build.ballons, [2009, 2010, 2011]);
  assert.deepEqual(later.career.build.weapon, { id: 'orbit', g: 4, p: 5, v: 'size' });
  assert.deepEqual(later.career.snapshots[idx - 2].ballons, [2009]);
  assert.equal(later.career.v, RS.CAREER_V);
}));

// ---------------------------------------------------------------- 페널티킥
const K = RS.PK_KEEPERS;
const botRate = (hero, level, keeper, n, seed) => {
  const rng = RS.makeRng(seed || 5), fin = RS.pkFinishing({ hero, level }, { upgrades: {} });
  let g = 0;
  for (let i = 0; i < n; i++) if (RS.pkKick(rng, Object.assign({ fin, keeper: K[keeper], hero }, RS.pkBotKick(rng, fin, level))).goal) g++;
  return g / n;
};
const yearIdx = (hero, year) => RS.HEROES[hero].years.findIndex((y) => y.year === year);

test('PK odds: 골결정력 helps, a legend keeper saves more, 날두 beats 메시 from the spot, 메시 never beats 쩨흐 more than 10 %', () => {
  const o = (fin, keeper, zone, acc, hero) => RS.pkOdds({ fin, keeper: K[keeper], zone, power: 0.8, acc, hero: hero || 'ronaldo' });
  assert.ok(o(90, 'national', 1, 'good').goal > o(60, 'national', 1, 'good').goal);
  assert.ok(o(70, 'yashin', 1, 'good').goal < o(70, 'local', 1, 'good').goal);
  assert.ok(o(70, 'national', 7, 'miss').off > o(70, 'national', 7, 'great').off * 5, 'a mistimed top corner flies off');
  assert.ok(o(70, 'national', 1, 'great').goal > o(70, 'national', 1, 'miss').goal + 0.2, 'the 정확도 dial matters');
  for (const z of [1, 2, 5, 9]) assert.ok(o(95, 'cech', z, 'great', 'messi').goal <= 0.1 + 1e-9);
  assert.ok(o(95, 'cech', 1, 'great', 'ronaldo').goal > 0.5, 'only 메시 has the 쩨흐 curse');
  for (const lv of [10, 60, 120]) assert.ok(botRate('ronaldo', lv, 'national', 3000) > botRate('messi', lv, 'national', 3000), 'Lv.' + lv);
  const end = botRate('ronaldo', 120, 'national', 4000);
  assert.ok(end > 0.66 && end < 0.85, '날두 late career ' + end); // round 16 made the spot harder
  assert.ok(botRate('messi', 60, 'cech', 3000) <= 0.11);
});

test('PK zones open with the level (3 → 6 → 9); the needle grades great / good / miss around its target', () => {
  assert.equal(RS.pkZoneCount(1), 3); assert.equal(RS.pkZoneCount(34), 3);
  assert.equal(RS.pkZoneCount(35), 6); assert.equal(RS.pkZoneCount(70), 9);
  const lo = RS.pkTiming(55), hi = RS.pkTiming(95);
  assert.ok(lo.needle > hi.needle && lo.good < hi.good && lo.great < hi.great, 'a young kicker gets a faster needle and narrower arcs');
  assert.equal(RS.pkNeedleGrade(lo.great / 2 - 0.5, lo), 'great');
  assert.equal(RS.pkNeedleGrade(-(lo.good / 2 - 0.5), lo), 'good');
  assert.equal(RS.pkNeedleGrade(lo.good / 2 + 1, lo), 'miss');
  assert.equal(RS.pkNeedleGrade(360 + 1, lo), 'great', 'wraps around the dial');
  assert.ok(RS.pkFinishing({ hero: 'ronaldo', level: 50 }, { upgrades: { pkdrill: 2 } }) === RS.pkFinishing({ hero: 'ronaldo', level: 50 }, { upgrades: {} }) + 6);
});

test('every fifth match ends with a PK 챌린지 (cleared or not); old saves start counting from zero', () => {
  const save = RS.loadSave(memStore(JSON.stringify({ career: RS.newSave().career, meta: { coins: 5 } })));
  assert.deepEqual([save.meta.pk.games, save.meta.pk.heroes.messi.goals], [0, 0]);
  const due = [];
  for (let i = 0; i < 10; i++) {
    const w = RS.startYear(save, 0, { seed: i + 1 });
    w.phase = 'dead';
    due.push(!!RS.finishYear(save, w).pkDue);
  }
  assert.deepEqual(due, [false, false, false, false, true, false, false, false, false, true]);
});

test('PK 챌린지: coins for each goal (a bonus for all five), the record and the titles at 10 / 25 / 50 goals', () => {
  const save = RS.newSave(), rec = () => save.meta.pk.heroes.ronaldo;
  save.meta.pk = RS.normalizePk(save.meta.pk);
  const play = (goals) => {
    const S = new RS.PKSession(save, { kind: 'challenge', idx: 3, rng: RS.makeRng(9) });
    for (let i = 0; i < RS.PK_KICKS; i++) { const k = S.next(); assert.equal(k.who, 'hero'); S.record({ goal: i < goals, res: i < goals ? 'goal' : 'save' }); }
    assert.equal(S.next(), null);
    return { S, out: S.finish() };
  };
  const c0 = save.meta.coins, a = play(5);
  assert.equal(a.out.coins, RS.pkReward(a.S.keeper, 5));
  assert.equal(a.out.coins, RS.pkCoinPer(a.S.keeper) * 8, 'five goals pay eight');
  assert.equal(save.meta.coins, c0 + a.out.coins);
  assert.equal(a.S.finish(), a.out, 'paid once');
  const b = play(5);
  assert.deepEqual(b.out.titles.map((t) => t.name), ['믿음직한 키커']);
  assert.deepEqual([rec().goals, rec().shots, rec().best], [10, 10, 10]);
  play(2);
  assert.deepEqual([rec().goals, rec().shots, rec().streak], [12, 15, 0]);
  while (rec().goals < 50) play(5);
  assert.equal(RS.pkTitle(rec()).name, '세계 최고의 페널티 키커');
  assert.equal(save.meta.pk.heroes.messi.goals, 0, 'each hero keeps his own record');
});

test('the shootout: five a side, the hero at his real place, sudden death, decided early when it cannot be caught', () => {
  const run = (us, them, first) => { const so = RS.newShootout(first); let i = 0, j = 0; while (!so.done) { if (so.turn === 'us') RS.soAdd(so, 'us', us[i++]); else RS.soAdd(so, 'them', them[j++]); } return so; };
  const G = true, M = false;
  assert.equal(run([G, G, G, G, G], [G, G, G, G, M], 'us').won, true);
  const early = run([G, G, G], [M, M, M], 'us');
  assert.deepEqual([early.won, early.us.length, early.them.length], [true, 3, 3]);
  const sd = run([G, G, G, G, G, G, M], [G, G, G, G, G, G, G], 'us');
  assert.deepEqual([sd.won, sd.us.length, sd.them.length], [false, 7, 7]);
  // 날두 2008: third kicker against 쩨흐
  withHero('ronaldo', () => {
    const save = RS.newSave(), idx = yearIdx('ronaldo', 2008);
    const def = RS.shootoutDue(save, idx, true);
    assert.equal(def.keeper, 'cech');
    assert.equal(RS.shootoutDue(save, idx, false), null, 'only a cleared season');
    const S = new RS.PKSession(save, { kind: 'shootout', idx, rng: RS.makeRng(3) });
    const order = [];
    for (let k = S.next(); k; k = S.next()) { order.push(k.who); S.record({ goal: k.who !== 'opp', res: k.who !== 'opp' ? 'goal' : 'save' }); }
    assert.equal(order.filter((w) => w !== 'opp')[2], 'hero', 'the hero takes our third kick');
    assert.equal(order.filter((w) => w === 'hero').length, 1);
    const fans = save.career.build.fans, out = S.finish();
    assert.deepEqual([out.won, out.coins, out.fans], [true, RS.SHOOTOUT_COINS, RS.SHOOTOUT_FANS]);
    assert.equal(save.career.build.fans, RS.clampFans(fans + RS.SHOOTOUT_FANS));
    assert.equal(save.career.shootouts[idx], 'win');
    assert.equal(RS.shootoutDue(save, idx, true), null, 'a won shootout is history');
    assert.equal(save.meta.pk.heroes.ronaldo.won, 1);
  });
});

test('메시 2012: one penalty against 쩨흐; a miss can be retried with the season, and pays only when it goes in', () => withHero('messi', () => {
  const save = RS.newSave(); RS.switchHero(save, 'messi');
  const idx = yearIdx('messi', 2012);
  const S = new RS.PKSession(save, { kind: 'shootout', idx, rng: RS.makeRng(4) });
  assert.equal(S.so, null);
  assert.equal(S.keeper.name, K.cech.name);
  const k = S.next();
  assert.deepEqual([k.who, k.decisive], ['hero', true]);
  S.record({ goal: false, res: 'bar' });
  assert.equal(S.next(), null);
  const c0 = save.meta.coins, out = S.finish();
  assert.deepEqual([out.won, out.coins, out.fans], [false, 0, 0]);
  assert.equal(save.meta.coins, c0);
  assert.ok(RS.shootoutDue(save, idx, true), 'the replay brings it back');
  const S2 = new RS.PKSession(save, { kind: 'shootout', idx, rng: RS.makeRng(4), replay: true });
  S2.next(); S2.record({ goal: true, res: 'goal' });
  assert.deepEqual([S2.finish().coins, save.career.shootouts[idx]], [RS.SINGLE_COINS, 'win']);
}));

test('a penalty plays out by itself in auto mode (shooting and keeping), and by taps step by step', () => {
  const play = (opt) => {
    const sc = new RS.PKScene(Object.assign({ fin: 70, level: 80, hero: 'ronaldo', keeper: K.neuer, rng: RS.makeRng(opt.seed || 2), ourK: 78 }, opt));
    let t = 0;
    while (!sc.done && t < 20) { sc.update(1 / 60); t += 1 / 60; }
    return { sc, t };
  };
  for (let s = 1; s <= 12; s++) {
    const a = play({ mode: 'shoot', who: 'hero', auto: true, seed: s });
    assert.ok(a.sc.done && a.t < 8, 'auto kick finishes ' + a.t);
    assert.ok(['goal', 'save', 'post', 'bar', 'over', 'wide'].includes(a.sc.result.res));
    assert.ok(a.sc.zone >= 1 && a.sc.zone <= 9 && a.sc.acc && a.sc.power != null);
    const b = play({ mode: 'keep', who: 'opp', keeper: { name: '우리', rating: 78, look: RS.PK_OUR_LOOK }, auto: true, seed: s });
    assert.ok(b.sc.done && [0, 1, 2, null].includes(b.sc.dive));
  }
  const m = play({ mode: 'shoot', who: 'mate', forced: { goal: true }, fast: true });
  assert.equal(m.sc.result.res, 'goal', 'a teammate\'s kick keeps its rolled outcome');
  // by hand: nothing happens until the taps come
  const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', fin: 70, level: 10, hero: 'messi', keeper: K.local, rng: RS.makeRng(6) });
  for (let i = 0; i < 300; i++) sc.update(1 / 60);
  assert.equal(sc.phase, 'aim');
  sc.geo = { cx: 70, halfW: 60, goalY: 130, barY: 90 };
  assert.equal(sc.tap(70 - 50, 130 - 35), false, 'the top row is still locked at Lv.10');
  assert.equal(sc.tap(70 + 50, 125), true);
  assert.equal(sc.zone, 3);
  sc.update(0.3); sc.tap(0, 0);
  assert.equal(sc.phase, 'acc');
  sc.stopNeedle(sc.target);
  assert.equal(sc.acc, 'great');
  while (!sc.done) sc.update(1 / 60);
  assert.ok(sc.sfx.includes('kick'));
});

test('하드 메시 youth keeps one equipped weapon and no unearned trophy ball', () => withDiff('hard', () => withHero('messi', () => {
  const save = RS.newSave(); RS.switchHero(save, 'messi');
  const c = simCareer({ seed: 2, save, to: 3 });
  const last = c.save.career.build;
  assert.ok(!last.evolved.orbit, 'the 회전 공 waits for 2009');
  assert.equal(last.skillOrder.length, 1);
  assert.ok(RS.skillFor(last.weapon.id, 'messi'));
})));
