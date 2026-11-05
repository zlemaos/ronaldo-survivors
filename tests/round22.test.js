const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };
const saveFor = (hero) => { const s = RS.newSave(); s.meta.unlocked.torres = true; if (hero !== 'ronaldo') RS.switchHero(s, hero); return s; };
const withRonaldo = (fn) => { try { return fn(); } finally { RS.selectHero('ronaldo'); } };

// Round 22 (the user: 승부차기도 바로 첨부터 월드컵이 아니라 청소년때부터 올라가게해 서사 있게).
test('every hero starts the cup at the 유소년 대회 and climbs one stage per title, to the 월드컵', () => withRonaldo(() => {
  assert.deepEqual(RS.CUP_STAGES.map((s) => s.id), ['u17', 'u20', 'conti', 'wc']);
  assert.equal(RS.cupStage(null).rounds, RS.CUP_ROUNDS, 'no stage given: the 월드컵 as before');
  for (const hero of ['ronaldo', 'messi', 'torres']) {
    const s = saveFor(hero);
    assert.equal(RS.cupHeroStage(s.meta, hero), 0);
    for (let si = 0; si < RS.CUP_WC; si++) {
      const st = RS.cupStage(si, hero), coins = s.meta.coins;
      for (let r = 0; r < st.rounds.length - 1; r++) assert.equal(RS.cupResult(s, r, true, RS.makeRng(1), si, hero).next, r + 1);
      const lost = RS.cupResult(s, 0, false, RS.makeRng(1), si, hero);
      assert.equal(lost.stageUp, null);
      assert.equal(RS.cupHeroStage(s.meta, hero), si, 'a loss stays on the stage');
      const out = RS.cupResult(s, st.rounds.length - 1, true, RS.makeRng(1), si, hero);
      assert.equal(out.champion, true);
      assert.equal(out.stageUp, si + 1);
      assert.equal(RS.cupHeroStage(s.meta, hero), si + 1);
      assert.equal(s.meta.coins, coins + st.coins);
      assert.equal(s.meta.cup.wins, 0, 'only a 월드컵 counts as a cup win');
      assert.deepEqual(Object.keys(s.meta.unlocked).filter((k) => k !== 'torres'), [], 'no SIUUU move below the 월드컵');
    }
    // the other heroes have not moved
    for (const h of ['ronaldo', 'messi', 'torres']) if (h !== hero) assert.equal(RS.cupHeroStage(s.meta, h), 0);
    // the stage survives a reload
    const st = memStore(null); RS.writeSave(st, s);
    assert.equal(RS.cupHeroStage(RS.loadSave(st).meta, hero), RS.CUP_WC);
  }
  assert.equal(RS.cupStage(2, 'messi').name, '코파 아메리카');
  assert.equal(RS.cupStage(2, 'ronaldo').name, '유로');
}));

test('a youth stage: its own level (fewer zones), its own keepers and our youth keeper; the opponents grow stage by stage', () => withRonaldo(() => {
  const s = saveFor('ronaldo');
  s.career.build.level = 100; // a late career does not carry into the youth stages
  const zones = [], keepers = [];
  for (let si = 0; si <= RS.CUP_WC; si++) {
    const d = RS.cupDraw(RS.makeRng(si + 3), 'ronaldo', si), st = RS.cupStage(si, 'ronaldo');
    assert.equal(d.length, st.rounds.length);
    const S = new RS.PKSession(s, { kind: 'cup', stage: si, round: 0, vs: d[0].vs, keeper: d[0].keeper, rng: RS.makeRng(1) });
    zones.push(S.zones);
    const fin = st.rounds[st.rounds.length - 1].pool; // each stage's final
    keepers.push(fin.reduce((b, m) => b + RS.PK_KEEPERS[m.keeper].rating, 0) / fin.length);
    if (si < 2) assert.ok(S.us.startsWith(st.pre) && d[0].vs.startsWith(st.pre), S.us + ' vs ' + d[0].vs);
    if (si < RS.CUP_WC) assert.equal(S.ourK, st.ourK);
    assert.equal(S.oppMiss, st.rounds[0].miss);
  }
  assert.deepEqual(zones, [3, 6, 9, 9], 'the ground, then the middle row, then the top corners');
  for (let i = 1; i < keepers.length; i++) assert.ok(keepers[i] > keepers[i - 1], 'stage ' + i + '\'s final keepers are better');
}));

test('the stages get harder: a steady bot wins the youth cup most often and the 월드컵 least', () => withRonaldo(() => {
  const rng = RS.makeRng(4), N = 500, rate = [];
  for (let si = 0; si <= RS.CUP_WC; si++) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const s = saveFor('ronaldo'), d = RS.cupDraw(rng, 'ronaldo', si), st = RS.cupStage(si, 'ronaldo');
      let r = 0;
      for (; r < st.rounds.length; r++) {
        const S = new RS.PKSession(s, { kind: 'cup', stage: si, round: r, vs: d[r].vs, keeper: d[r].keeper, rng });
        let k;
        while ((k = S.next())) S.record(k.who === 'hero' ? RS.pkKick(rng, Object.assign({ fin: S.fin, keeper: S.keeper, hero: S.hero }, RS.pkBotKick(rng, S.fin, S.level, S.keeper))) : RS.soOppKick(rng, S.ourK, null, S.oppMiss));
        if (!S.finish().won) break;
      }
      if (r === st.rounds.length) wins++;
    }
    rate.push(wins / N);
  }
  for (let i = 1; i < rate.length; i++) assert.ok(rate[i] < rate[i - 1], rate.map((p) => (p * 100).toFixed(1) + '%').join(' → '));
  assert.ok(rate[0] > 0.3, 'the 유소년 대회 is the way in: ' + (rate[0] * 100).toFixed(1) + '%');
}));
