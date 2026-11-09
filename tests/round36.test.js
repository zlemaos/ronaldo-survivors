const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// Round 36 (the user: 방향 맞췄는데 공이 그냥 지나감 — 버그?): a goal past a keeper who went the right way clips his
// fingertips on its way into the net; saves, misses and wrong-way goals look as before, and no odds change.
const K = RS.PK_KEEPERS, P = RS.PK_POWER;

// plays a scene to its end; at the moment the ball reaches the line: the keeper's pose and the ball, and the sounds
function play(sc, onFlight) {
  const out = { sfx: [] };
  for (let t = 0; t < 12 && !sc.done; t += 1 / 60) {
    if (onFlight && sc.phase === 'flight') onFlight(sc);
    const before = sc.hitDone;
    sc.sfx.length = 0; sc.vfx.length = 0; // as the screen drains them each frame
    sc.update(1 / 60);
    if (!before && sc.hitDone) { out.pose = sc.keeperPose(); out.vfx = sc.vfx.map((f) => f.kind); out.at = sc.sfx.slice(); }
  }
  return out;
}
const shoot = (seed, zone) => {
  const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', fin: 80, level: 80, hero: 'ronaldo', keeper: K.pro, rng: RS.makeRng(seed) });
  sc.pickZone(zone); sc.stopPower(P.good[0] + 0.02); sc.stopNeedle(sc.target + sc.timing.fine / 2 + 2); // a 'good' strike
  return sc;
};
const touched = (sc, o) => {
  const B = sc.ball, side = RS.pkCol(sc.zone) - 1, T = o.pose.target;
  assert.equal(o.pose.mode, 'dive');
  assert.ok(Math.abs(T.u - B.u) < 0.1 && Math.abs(T.v - B.v) < 0.1, 'his glove is at the ball as it arrives');
  assert.ok(o.vfx.includes('touch') && o.vfx.indexOf('touch') < o.vfx.indexOf('goal'), 'the glove flashes, then the net');
  assert.ok(o.at.indexOf('tap') >= 0 && o.at.indexOf('tap') < o.at.indexOf('net'), 'a light touch is heard before the net');
  const after = sc.ballAt(1.15), d = sc.touchAt();
  assert.ok(Math.abs(after.u) <= 1 && after.v <= 1 && after.z > 1, 'still in the net');
  if (side) assert.ok(side * (after.u - B.u) > 0 || Math.abs(d.du) < 1e-9, 'nudged on toward the post');
};

test('our kick: a goal past a keeper who dived its way clips his fingertips; other kicks look as before', () => {
  const seen = { touch: 0, wrong: 0, save: 0 };
  for (let seed = 1; seed < 400 && (seen.touch < 3 || seen.wrong < 3 || seen.save < 3); seed++) {
    const sc = shoot(seed, [1, 3, 4, 6][seed % 4]), o = play(sc), r = sc.result, col = RS.pkCol(sc.zone);
    assert.equal(r.kind, null);
    if (r.res === 'goal' && r.diveCol === col) { seen.touch++; assert.ok(sc.touch); touched(sc, o); }
    else {
      assert.ok(!sc.touch);
      assert.ok(!o.vfx.includes('touch') && !o.at.includes('tap'));
      if (r.res === 'goal') { seen.wrong++; assert.deepEqual(sc.ballAt(1.15).u, sc.ball.u, 'the clean goal path is unchanged'); }
      if (r.res === 'save') seen.save++;
    }
  }
  assert.ok(seen.touch >= 3 && seen.wrong >= 3 && seen.save >= 3, JSON.stringify(seen));
});

test('a perfect strike, a 파넨카 and a slow ball never clip his glove', () => {
  for (let seed = 1; seed < 60; seed++) {
    for (const [zone, power] of [[9, P.blue], [2, P.panBlue], [3, 0.03]]) {
      const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', fin: 80, level: 80, hero: 'ronaldo', keeper: K.pro, rng: RS.makeRng(seed) });
      sc.pickZone(zone); sc.stopPower(power); sc.stopNeedle(sc.target);
      const o = play(sc);
      assert.ok(sc.result.kind, 'a special kind');
      assert.ok(!sc.touch && !o.vfx.includes('touch'));
    }
  }
});

test('their kick: our keeper\'s right cell beaten — early or by reacting late — clips his glove; the wrong height does not', () => {
  const seen = { early: 0, react: 0, height: 0 };
  for (let seed = 1; seed < 3000 && (seen.early < 2 || seen.react < 2 || seen.height < 2); seed++) {
    const make = () => new RS.PKScene({ mode: 'keep', who: 'opp', keeper: { name: 'k', rating: 84 }, fin: 80, level: 80, ourK: 60, oppMiss: 0, rng: RS.makeRng(seed) });
    // the early pick: the cell the seed's kick goes to (a peek at the same seed) or the same column at the other height
    const peek = make(); peek.pickDive({ col: 0, row: 0 }); play(peek);
    const a = peek.aim;
    if (a.panenka) continue;
    for (const row of [a.row, 1 - a.row]) {
      const sc = make(); sc.pickDive({ col: a.col, row }); const o = play(sc), r = sc.result;
      assert.deepEqual([r.col, r.row], [a.col, a.row], 'the pick does not change their kick');
      if (r.res !== 'goal') continue;
      if (row === a.row) { seen.early++; assert.ok(sc.touch); touched(sc, o); }
      else { seen.height++; assert.ok(!sc.touch && !o.at.includes('tap')); }
    }
    // a late reaction to the right cell: his glove still gets there as the ball arrives
    const sc = make(); sc.watchNow();
    const o = play(sc, (s) => { if (s.reactOpen && s.t > s.reactWin * 0.85) s.react({ col: s.aim.col, row: s.aim.row }); });
    if (sc.result.res === 'goal' && sc.dive && sc.dive.rt != null) { seen.react++; assert.ok(sc.touch); assert.ok(o.pose.k > 0.97, 'full stretch at the line'); touched(sc, o); }
  }
  assert.ok(seen.early >= 2 && seen.react >= 2 && seen.height >= 2, JSON.stringify(seen));
});
