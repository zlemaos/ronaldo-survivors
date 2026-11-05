const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// Round 23 (the user, 2026-11-05): 상대 파넨카, a barely-touched ball the keeper walks to, the 파넨카 zone on the
// gauge, a second 파넨카 in a row read more often, 사기 저하 after a failed one, the post on side shots, the needle
// pulling toward the middle, and every zone open in the 토너먼트.
const K = RS.PK_KEEPERS, P = RS.PK_POWER;
const odds = (o) => RS.pkOdds(Object.assign({ fin: 76, keeper: K.national, hero: 'ronaldo', power: 0.8, acc: 'good' }, o));
const withRonaldo = (fn) => { try { return fn(); } finally { RS.selectHero('ronaldo'); } };

test('a barely-touched ball: in unless the keeper went the right way, then he walks to it', () => {
  const rng = RS.makeRng(3);
  for (const z of [1, 2, 7, 9]) {
    const o = odds({ zone: z, power: 0.03 });
    assert.equal(o.kind, 'slow');
    assert.equal(o.off, 0);
    assert.ok(o.save > 0.4 && o.save < 0.9, 'zone ' + z + ' ' + o.save);
    for (let i = 0; i < 300; i++) {
      const r = RS.pkKick(rng, { fin: 76, keeper: K.national, hero: 'ronaldo', zone: z, power: 0.03, acc: 'good' });
      if (r.res === 'save') assert.equal(r.diveCol, RS.pkCol(z), 'saved: he went that way');
      else { assert.equal(r.res, 'goal'); assert.notEqual(r.diveCol, RS.pkCol(z), 'in: he went the other way'); }
    }
  }
  assert.ok(odds({ zone: 1, power: 0.03, keeper: K.neuer }).save > odds({ zone: 1, power: 0.03, keeper: K.u17 }).save, 'a better keeper reads it more');
});

test('a second 파넨카 in a row is read more often, a third more still', () => {
  const at = (n) => odds({ zone: 2, power: 0.12, panStreak: n }).save;
  assert.ok(at(1) > at(0) * 1.5 && at(2) > at(1), [at(0), at(1), at(2)].map((x) => x.toFixed(2)).join(' '));
});

test('a failed 파넨카 costs morale: the gauge and the needle speed up and the bands narrow; the odds stay', () => withRonaldo(() => {
  const s = RS.newSave(), rng = RS.makeRng(2);
  const S = new RS.PKSession(s, { kind: 'cup', stage: 0, round: 0, vs: 'U-17 스위쓰', keeper: 'u17', rng });
  const hero = () => { let k; while ((k = S.next()) && k.who !== 'hero') S.record({ goal: false, res: 'save' }); return k; };
  hero(); S.record({ goal: true, res: 'goal', kind: 'panenka' });
  assert.equal(S.morale, 0, 'a 파넨카 that goes in is fine');
  assert.equal(S.panStreak, 1);
  hero(); S.record({ goal: false, res: 'save', kind: 'panenka' });
  assert.equal(S.morale, 1); assert.equal(S.moraleNew, true); assert.equal(S.panStreak, 2);
  hero(); S.record({ goal: true, res: 'goal' });
  assert.equal(S.panStreak, 0, 'a struck ball ends the run of 파넨카s');
  const calm = RS.pkTiming(76, P.blue), shaken = RS.pkTiming(76, P.blue, 2);
  assert.ok(shaken.gauge > calm.gauge * 1.5 && shaken.needle > calm.needle * 1.5);
  assert.ok(shaken.good < calm.good && shaken.fine < calm.fine && shaken.great <= calm.great);
  const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', keeper: K.pro, fin: 76, level: 80, hero: 'ronaldo', morale: 2, rng: RS.makeRng(1) });
  assert.deepEqual(sc.timing, RS.pkTiming(76, null, 2), 'the scene uses it');
  sc.pickZone(9); sc.stopPower(P.blue);
  assert.deepEqual(sc.timing, shaken);
}));

test('their kicker chips one now and then: our keeper who stays takes it, one who dives is beaten', () => {
  const rng = RS.makeRng(6);
  let pans = 0;
  for (let i = 0; i < 4000; i++) if (RS.soOppAim(rng, 0).panenka) pans++;
  assert.ok(Math.abs(pans / 4000 - RS.SO_OPP_PANENKA) < 0.015, 'about ' + RS.SO_OPP_PANENKA);
  const aim = { col: 1, row: 0, off: null, panenka: true };
  let stay = 0, dive = 0;
  for (let i = 0; i < 2000; i++) {
    if (RS.soOppSave(rng, 80, aim, { col: 1, row: 0 }).res === 'save') stay++;
    if (RS.soOppSave(rng, 80, aim, { col: 0, row: 0 }).goal) dive++;
  }
  assert.ok(stay / 2000 > 0.85 && dive === 2000);
  assert.equal(RS.soOppSave(rng, 80, aim, { col: 1, row: 0 }).kind, 'panenka');
  // a watching keeper who never moves stays on his line: he gets it too
  assert.equal(RS.soSaveChance(80, aim, { col: 1, row: 0, rt: RS.soReact() }), RS.SO_PAN_SAVE);
});

test('a struck ball to either side rings off the post a tenth of the time; down the middle it does not', () => {
  for (const z of [1, 3, 4, 6, 7, 9]) assert.ok(Math.abs(odds({ zone: z, shot: 'push' }).post - RS.PK_POST) < 1e-9);
  for (const z of [2, 5, 8]) assert.ok(!odds({ zone: z }).post);
  const rng = RS.makeRng(9);
  let post = 0;
  for (let i = 0; i < 6000; i++) if (RS.pkKick(rng, { fin: 76, keeper: K.national, hero: 'ronaldo', zone: 1, power: 0.8, acc: 'good' }).res === 'post') post++;
  assert.ok(Math.abs(post / 6000 - RS.PK_POST) < 0.015, (post / 6000).toFixed(3));
  assert.equal(odds({ zone: 9, power: P.blue, acc: 'great' }).off, 0, 'the perfect strike keeps its 99 %');
});

test('the 토너먼트 opens all nine zones from the 유소년 대회 on', () => withRonaldo(() => {
  const s = RS.newSave();
  const S = new RS.PKSession(s, { kind: 'cup', stage: 0, round: 0, vs: 'U-17 스위쓰', keeper: 'u17', rng: RS.makeRng(1) });
  assert.equal(S.level, RS.CUP_STAGES[0].lv);
  assert.equal(S.zones, 9);
  const b = RS.pkBotKick(RS.makeRng(4), S.fin, S.level, S.keeper, S.zones), seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(RS.pkBotKick(RS.makeRng(i), S.fin, S.level, S.keeper, S.zones).zone);
  assert.ok(b && [...seen].some((z) => z >= 7), 'the bot aims high too');
}));
