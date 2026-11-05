const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };
const saveFor = (hero) => { const s = RS.newSave(); s.meta.unlocked.torres = true; if (hero !== 'ronaldo') RS.switchHero(s, hero); return s; };
const withRonaldo = (fn) => { try { return fn(); } finally { RS.selectHero('ronaldo'); } };
// One shootout of the 승부차기 토너먼트, every kick rolled: the hero's kicks by `kick`, the other side's by the rules.
const playRound = (s, rng, round, m, kick) => {
  const S = new RS.PKSession(s, { kind: 'cup', round, vs: m.vs, keeper: m.keeper, rng });
  let k, n = 0;
  while ((k = S.next())) {
    assert.notEqual(k.who, 'mate', 'the hero takes every kick of ours');
    const res = k.who === 'hero' ? kick(S) : RS.soOppKick(rng, S.ourK, null, S.oppMiss);
    S.record(res);
    assert.ok(++n < 60, 'the shootout ends');
  }
  return S.finish();
};
const goal = () => ({ goal: true, res: 'goal' }), miss = () => ({ goal: false, res: 'save' });

// Round 15: a mini-game from the title screen, 16강 → 결승, one shootout a round.
test('the draw: four rounds, never the hero\'s own nation, a keeper beside him or one he cannot beat', () => withRonaldo(() => {
  assert.deepEqual(RS.CUP_ROUNDS.map((r) => r.name), ['16강', '8강', '4강', '결승']);
  const rng = RS.makeRng(5);
  for (const hero of ['ronaldo', 'messi', 'torres']) {
    const us = RS.soUsName(hero, 0, { nat: true }), seen = new Set();
    for (let i = 0; i < 300; i++) {
      const d = RS.cupDraw(rng, hero);
      assert.equal(d.length, 4);
      for (const m of d) {
        const K = RS.PK_KEEPERS[m.keeper];
        assert.ok(K, m.keeper);
        assert.notEqual(m.vs, us, hero + ' never meets his own nation');
        assert.notEqual(K.mate, hero, hero + ' never meets his own teammate');
        assert.ok(!(K.nemesis && K.nemesis[hero] != null), hero + ' never meets his nemesis');
        seen.add(m.keeper);
      }
    }
    assert.ok(seen.size >= 10, hero + ' meets many keepers');
  }
  // the keepers grow round by round
  const avg = RS.CUP_ROUNDS.map((r) => r.pool.reduce((a, m) => a + RS.PK_KEEPERS[m.keeper].rating, 0) / r.pool.length);
  for (let i = 1; i < avg.length; i++) assert.ok(avg[i] > avg[i - 1], 'round ' + i + ' keepers are better');
}));

test('a cup shootout: the hero kicks all of ours with the whole goal open; a loss ends the run', () => withRonaldo(() => {
  const s = saveFor('ronaldo'), rng = RS.makeRng(9);
  assert.equal(s.career.build.level, 1);
  const S = new RS.PKSession(s, { kind: 'cup', round: 0, vs: '스위쓰', keeper: 'pro', rng });
  assert.equal(S.zones, 9, 'nine zones even at Lv.1');
  assert.ok(S.fin >= RS.pkFinishing({ hero: 'ronaldo', level: RS.CUP_LEVEL }, s.meta));
  assert.ok(S.ourK >= RS.CUP_KEEPER);
  assert.equal(S.oppMiss, RS.CUP_ROUNDS[0].miss);
  const won = playRound(s, rng, 0, { vs: '스위쓰', keeper: 'pro' }, goal);
  assert.equal(won.won, true, 'every kick in: never loses');
  assert.equal(won.cup.next, 1);
  assert.equal(won.goals, won.shots);
  const lost = playRound(s, rng, 1, { vs: '칠레', keeper: 'bravo' }, miss);
  assert.equal(lost.won, false, 'every kick saved: never wins');
  assert.equal(lost.cup.next, null);
  assert.equal(s.meta.cup.best, 1, 'got past the 16강');
  assert.deepEqual(Object.keys(s.meta.unlocked).filter((k) => k !== 'torres'), [], 'no reward without the title');
  // the career is untouched: no shootout record, no 민심
  assert.deepEqual(s.career.shootouts, {});
  assert.equal(s.career.build.fans, RS.FANS.start);
}));

test('the champion unlocks one SIUUU move at random; three titles open all three, then coins', () => withRonaldo(() => {
  const s = saveFor('ronaldo'), rng = RS.makeRng(21), got = [];
  for (let t = 0; t < 3; t++) {
    const out = RS.cupResult(s, 3, true, rng);
    assert.equal(out.champion, true);
    assert.ok(out.reward && out.reward.id, 'title ' + (t + 1) + ' pays a move');
    assert.ok(!got.includes(out.reward.id), 'never the same move twice');
    got.push(out.reward.id);
  }
  assert.deepEqual(got.slice().sort(), ['bribe', 'hollywood', 'penaldo']);
  assert.equal(s.meta.cup.wins, 3);
  assert.equal(s.meta.cup.best, 4);
  const coins = s.meta.coins, fourth = RS.cupResult(s, 3, true, rng);
  assert.deepEqual(fourth.reward, { coins: RS.CUP_COINS });
  assert.equal(s.meta.coins, coins + RS.CUP_COINS);
  // which move comes first is random
  const first = new Set();
  for (let seed = 1; seed < 40; seed++) { const x = saveFor('ronaldo'); first.add(RS.cupResult(x, 3, true, RS.makeRng(seed)).reward.id); }
  assert.equal(first.size, 3);
}));

// (round 19: the cup only unlocks the move — level-ups deal it now and then, tests/round19.test.js; nothing is put in hand)
test('each reward is its hero\'s gift move; unlocking it puts nothing in hand', () => withRonaldo(() => {
  for (const r of RS.CUP_REWARDS) {
    const sk = RS.SKILLS[r.id];
    assert.ok(sk && sk.gift, r.id + ' is a gift');
    assert.ok(RS.skillFor(r.id, r.hero), r.id + ' is ' + r.hero + '\'s');
    for (const h of ['ronaldo', 'messi', 'torres']) if (h !== r.hero) assert.ok(!RS.skillFor(r.id, h), r.id + ' is not ' + h + '\'s');
    for (let g = 0; g < RS.GRADES.length; g++) assert.ok(!RS.weaponIds(r.hero, g, { flags: {} }).includes(r.id), 'never dealt at a level-up');
  }
  assert.equal(RS.GRADES[RS.CUP_GRADE].name, 'SIUUU');
  const s = saveFor('messi');
  s.meta.unlocked.bribe = true;
  const old = s.career.build.weapon.id;
  assert.deepEqual(RS.grantCupRewards(s), []);
  assert.equal(s.career.build.weapon.id, old, 'still the old weapon in hand');
  RS.newCareer(s);
  assert.notEqual(s.career.build.weapon.id, 'bribe', 'a new career does not start with it');
  s.meta.unlocked.penaldo = true;
  RS.switchHero(s, 'ronaldo');
  assert.notEqual(s.career.build.weapon.id, 'penaldo', 'nor does a hero switch');
  const st = memStore(null); RS.writeSave(st, s);
  const back = RS.loadSave(st);
  assert.notEqual(back.career.build.weapon.id, 'penaldo', 'nor a reload');
  assert.deepEqual(back.meta.cup, s.meta.cup);
  // a save from before round 15 loads with an empty record
  const pre = JSON.parse(JSON.stringify(s)); delete pre.meta.cup;
  assert.deepEqual(RS.loadSave(memStore(JSON.stringify(pre))).meta.cup, { played: 0, wins: 0, best: 0 });
}));

// A player's save (2026-11-05): the active 메시 career at schema 3 and a 날두 career parked before round 11, with no
// weapon yet. The schema-4 step synced that empty hand and the page never started.
test('a save with a career parked before round 11 (no weapon) still loads, and that career plays', () => withRonaldo(() => {
  const s = saveFor('messi');
  s.careers.ronaldo = RS.newSave().career;
  const old = s.careers.ronaldo.build = { hero: 'ronaldo', level: 9, skills: { kick: 3, siuu: 1 }, skillOrder: ['kick', 'siuu'], passives: {}, passiveOrder: [] };
  s.careers.ronaldo.v = 3; s.careers.ronaldo.yearIdx = 2;
  s.careers.ronaldo.snapshots = { 1: JSON.parse(JSON.stringify(old)) };
  s.career.v = 3;
  const raw = JSON.stringify(s);
  const back = RS.loadSave(memStore(raw));
  assert.equal(back.career.build.hero, 'messi');
  RS.switchHero(back, 'ronaldo');
  assert.ok(RS.SKILLS[back.career.build.weapon.id], 'the parked career gets its weapon when it is played');
  const w = RS.startYear(back, back.career.yearIdx, { seed: 3 });
  for (let i = 0; i < 120; i++) w.update(1 / 60, RS.botInput(w));
  assert.notEqual(w.phase, 'dead');
}));

// (in the first season the crowd is thin and every weapon kills about as many; from season 6 it is not)
test('the three moves fight: at SIUUU each one out-kills the hero\'s starting weapon in season 6', () => withRonaldo(() => {
  const kills = (s) => {
    s.career.yearIdx = 6;
    const w = RS.startYear(s, 6, { seed: 4 });
    for (let i = 0; i < 60 * 60 && w.phase !== 'dead' && w.phase !== 'clear' && w.t < 60; i++) {
      if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices, w.build)); continue; }
      if (w.phase === 'chest') { w.closeChest(); continue; }
      if (w.phase === 'swap') { w.chooseSwap(0); continue; }
      w.update(1 / 60, RS.botInput(w));
    }
    return w;
  };
  for (const r of RS.CUP_REWARDS) {
    const base = kills(saveFor(r.hero)).kills;
    const s = saveFor(r.hero);
    s.meta.unlocked[r.id] = true;
    RS.gainWeapon(s.career.build, { id: r.id, g: RS.CUP_GRADE, p: 1 }, true); // as when a level-up deals it
    const w = kills(s);
    assert.equal(w.build.weapon.id, r.id);
    assert.ok(w.kills > base, r.id + ' kills ' + w.kills + ' in 60 s, the start weapon ' + base);
  }
}));

// (round 16: harder — the bot neither finds the blue band often nor watches the ball, so it seldom wins)
test('the cup is winnable but not given: a sensible bot that only guesses wins now and then', () => withRonaldo(() => {
  const rng = RS.makeRng(7), N = 600;
  for (const hero of ['ronaldo', 'messi']) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const s = saveFor(hero), d = RS.cupDraw(rng, hero);
      RS.cupStart(s);
      let r = 0;
      for (; r < 4; r++) {
        const out = playRound(s, rng, r, d[r], (S) => RS.pkKick(rng, Object.assign({ fin: S.fin, keeper: S.keeper, hero: S.hero }, RS.pkBotKick(rng, S.fin, S.level))));
        if (!out.won) break;
      }
      if (r === 4) wins++;
    }
    const p = wins / N;
    assert.ok(p > 0.01 && p < 0.15, hero + ' bot champion rate ' + (p * 100).toFixed(1) + '%');
  }
}));
