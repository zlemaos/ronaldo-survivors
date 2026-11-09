const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// Round 38: 승부차기 splits into three modes — 챔피언스리그, 월드컵 (the old ladder), 도장깨기 (the all-time top 10 keepers).
const saveFor = (hero) => { const s = RS.newSave(); s.meta.unlocked.torres = true; if (hero !== 'ronaldo') RS.switchHero(s, hero); return s; };
const withRonaldo = (fn) => { try { return fn(); } finally { RS.selectHero('ronaldo'); } };

test('the 도장깨기 climbs ten keepers since the 1990s, 10th to 1st, then 야신 as the final boss, each 단 harder than the last', () => {
  assert.deepEqual(RS.DOJO.map((d) => d.keeper), ['oblak', 'alisson', 'courtois', 'kahn', 'vdsar', 'schmeichel', 'cech', 'buffon', 'casillas', 'neuer', 'yashin']);
  assert.deepEqual(RS.DOJO.map((d, i) => RS.dojoName(i)).slice(-2), ['10단', '최종 보스']);
  assert.ok(RS.DOJO.filter((d) => d.boss).length === 1 && RS.DOJO[RS.DOJO.length - 1].boss);
  for (let i = 1; i < RS.DOJO.length; i++) {
    assert.ok(RS.DOJO[i].rating > RS.DOJO[i - 1].rating && RS.DOJO[i].miss < RS.DOJO[i - 1].miss, 'step ' + i);
    assert.ok(RS.PK_KEEPERS[RS.DOJO[i].keeper], RS.DOJO[i].keeper);
  }
});

test('a 도장깨기 win opens the next 단 and pays; a loss replays it; the last 단 stays open once all ten are cleared', () => {
  const s = saveFor('ronaldo'), c0 = s.meta.coins;
  assert.equal(RS.dojoNext(s.meta), 0);
  let r = RS.cupResult(s, 0, false, Math.random, 0, 'ronaldo', 'dojo');
  assert.ok(!r.champion && RS.dojoNext(s.meta) === 0 && s.meta.coins === c0);
  r = RS.cupResult(s, 0, true, Math.random, 0, 'ronaldo', 'dojo');
  assert.ok(r.champion && r.stageUp === 1 && RS.dojoNext(s.meta) === 1 && s.meta.coins === c0 + RS.dojoCoins(0));
  for (let i = 1; i < RS.DOJO.length; i++) RS.cupResult(s, 0, true, Math.random, i, 'ronaldo', 'dojo');
  assert.equal(RS.normalizeCup(s.meta.cup).dojo, RS.DOJO.length);
  assert.equal(RS.dojoNext(s.meta), RS.DOJO.length - 1);
  assert.equal(RS.normalizeCup(RS.normalizeCup(s.meta.cup)).dojo, RS.DOJO.length, 'it survives a reload');
});

test('a 도장깨기 session meets that 단\'s keeper at its rating — Ronaldo meets his old teammate, Messi his 천적 without the cap', () => withRonaldo(() => {
  for (const hero of ['ronaldo', 'messi']) {
    const s = saveFor(hero);
    for (const i of [6, 7]) {
      const m = RS.pkDraw(RS.makeRng(3), hero, 'dojo', i)[0];
      assert.equal(m.keeper, RS.DOJO[i].keeper);
      const S = new RS.PKSession(s, { kind: 'cup', mode: 'dojo', stage: i, round: 0, vs: m.vs, keeper: m.keeper, rng: RS.makeRng(1) });
      assert.equal(S.keeper.rating, RS.DOJO[i].rating);
      assert.ok(!S.keeper.nemesis);
      assert.equal(S.oppMiss, RS.DOJO[i].miss);
      assert.ok(S.ourK >= RS.CUP_KEEPER && S.zones === 9);
    }
  }
  assert.equal(RS.PK_KEEPERS.cech.nemesis.messi, 0.1, 'the shared keeper keeps his 천적 cap elsewhere');
}));

test('the 챔피언스리그: four rounds against clubs, never the hero\'s own club, a teammate or his 천적; the title pays and counts', () => withRonaldo(() => {
  for (const hero of ['ronaldo', 'messi', 'torres']) {
    const club = RS.UCL_CLUB[hero];
    for (let seed = 1; seed <= 20; seed++) {
      const draw = RS.pkDraw(RS.makeRng(seed), hero, 'ucl', 0);
      assert.equal(draw.length, 4);
      for (const m of draw) {
        const K = RS.PK_KEEPERS[m.keeper];
        assert.ok(m.vs !== club && K.mate !== hero && !(K.nemesis && K.nemesis[hero] != null), hero + ' vs ' + m.vs);
      }
    }
    const s = saveFor(hero), S = new RS.PKSession(s, { kind: 'cup', mode: 'ucl', round: 3, vs: '뮌헨 붉은 맥주단', keeper: 'neuer', rng: RS.makeRng(2) });
    assert.equal(S.us, club);
    assert.equal(S.oppMiss, RS.UCL.rounds[3].miss);
    const c0 = s.meta.coins, r = RS.cupResult(s, 3, true, Math.random, 0, hero, 'ucl');
    assert.ok(r.champion && s.meta.coins === c0 + RS.UCL.coins && RS.normalizeCup(s.meta.cup).ucl === 1);
    assert.equal(RS.normalizeCup(s.meta.cup).stage[hero] || 0, 0, 'the 월드컵 ladder is untouched');
  }
}));
