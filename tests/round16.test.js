const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// Round 16: a harder spot kick — a thin blue perfect band, 영점 drift, 파넨카 and the angry keeper, and our keeper's
// height and 보고 막기.
const K = RS.PK_KEEPERS, P = RS.PK_POWER;
const odds = (o) => RS.pkOdds(Object.assign({ fin: 80, keeper: K.national, hero: 'ronaldo' }, o));
const rate = (n, fn) => { let g = 0; for (let i = 0; i < n; i++) if (fn()) g++; return g / n; };

test('the gauge: red, the 파넨카 zone, grey, yellow, green and a blue band inside the green that is much thinner', () => {
  assert.equal(RS.pkPowerGrade(0.05, 80), 'slow');
  assert.equal(RS.pkPowerGrade(0.12, 80), 'pan');
  assert.equal(RS.pkPowerGrade(P.panBlue, 80), 'panPerfect');
  assert.equal(RS.pkPowerGrade(0.4, 80), 'weak');
  assert.equal(RS.pkPowerGrade(0.62, 80), 'ok');
  assert.equal(RS.pkPowerGrade(P.good[0] + 0.01, 80), 'good');
  assert.equal(RS.pkPowerGrade(P.blue, 80), 'perfect');
  assert.equal(RS.pkPowerGrade(0.99, 80), 'over');
  for (const fin of [55, 95]) assert.ok(RS.pkBlueHalf(fin) * 2 < (P.good[1] - P.good[0]) / 5, 'blue is under a fifth of the green');
  assert.ok(RS.pkBlueHalf(95) > RS.pkBlueHalf(55), '골결정력 widens it a little');
});

// (round 23: the power is only the power — it sets the pace, never the direction; the needle pulls toward the middle)
test('a perfect strike beats the shown odds; a softer strike or a poorer needle is saved more, not sent wide', () => {
  for (const z of [1, 3, 7, 9]) {
    const best = odds({ zone: z, power: P.blue, acc: 'great' });
    assert.equal(best.kind, 'perfect');
    assert.equal(best.off, 0, 'a perfect strike never misses the frame');
    assert.ok(RS.pkZoneBest({ fin: 80, keeper: K.national, hero: 'ronaldo' }, z) < best.goal, 'the grid shows the best strike short of perfect');
    const green = odds({ zone: z, power: P.good[0] + 0.005, acc: 'good' }), soft = odds({ zone: z, power: 0.62, acc: 'good' }), poor = odds({ zone: z, power: P.good[0] + 0.005, acc: 'miss' });
    assert.ok(best.goal > green.goal && green.goal > soft.goal && green.goal > poor.goal, 'zone ' + z + ': ' + [best.goal, green.goal, soft.goal, poor.goal].map((x) => x.toFixed(2)));
    assert.equal(soft.off, green.off, 'a softer strike does not go wider');
    assert.equal(poor.off, green.off, 'a poor needle does not go wider either (노멀; 하드 up high: round23 test)');
    assert.ok(soft.save > green.save && poor.save > green.save, 'both are saved more');
  }
  assert.ok(RS.PK_PULL.great === 0 && RS.PK_PULL.fine < RS.PK_PULL.good && RS.PK_PULL.good < RS.PK_PULL.miss);
});

test('down the middle: the 파넨카 zone chips it over a diving keeper; grey is only a soft strike', () => {
  const soft = odds({ zone: 2, power: 0.4, acc: 'good' });
  assert.equal(soft.kind, null);
  assert.ok(soft.save > odds({ zone: 2, power: 0.8, acc: 'good' }).save, 'slower, easier');
  const pan = odds({ zone: 2, power: 0.12, acc: 'miss' });
  assert.equal(pan.kind, 'panenka');
  assert.ok(pan.goal > 0.4 && pan.save > 0.15, 'it can go either way');
  const top = odds({ zone: 2, power: P.panBlue, acc: 'miss' });
  assert.ok(top.chipPerfect && top.goal > pan.goal && top.off === 0, 'its blue band floats over more of them');
  assert.equal(odds({ zone: 1, power: 0.12, acc: 'good' }).kind, null, 'a corner is no 파넨카');
  // a read 파넨카 is booted away
  const rng = RS.makeRng(4);
  let seen = 0;
  for (let i = 0; i < 400; i++) { const r = RS.pkKick(rng, { fin: 80, keeper: K.national, hero: 'ronaldo', zone: 5, power: 0.12, acc: 'good' }); if (r.res === 'save') { seen++; assert.ok(r.kickAway); assert.equal(r.diveCol, 1); } }
  assert.ok(seen > 40);
});

test('a read 파넨카 puts the keeper in 분노 모드 for the rest of the shootout: he saves more', () => {
  const s = RS.newSave(), rng = RS.makeRng(2);
  const S = new RS.PKSession(s, { kind: 'cup', round: 0, vs: '스위쓰', keeper: 'pro', rng });
  let k;
  while ((k = S.next()).who !== 'hero') S.record({ goal: true, res: 'goal' });
  assert.equal(S.rage, false);
  S.record({ goal: false, res: 'save', kind: 'panenka' });
  assert.equal(S.rage, true);
  assert.equal(S.rageNew, true);
  for (const z of [1, 9, 5]) assert.ok(odds({ zone: z, power: P.blue, acc: 'great', rage: true }).save > odds({ zone: z, power: P.blue, acc: 'great' }).save);
  assert.ok(odds({ zone: 5, power: 0.12, acc: 'good', rage: true }).save > odds({ zone: 5, power: 0.12, acc: 'good' }).save, 'and reads 파넨카 more');
});

test('our keeper: the right column at the wrong height seldom saves; watching the ball saves more the quicker', () => {
  const aim = { col: 0, row: 1, off: null };
  const right = RS.soSaveChance(84, aim, { col: 0, row: 1 }), low = RS.soSaveChance(84, aim, { col: 0, row: 0 });
  assert.ok(right > low * 2.5, 'height matters');
  assert.equal(RS.soSaveChance(84, aim, { col: 2, row: 1 }), 0);
  const quick = RS.soSaveChance(84, aim, { col: 0, row: 1, rt: 0.3 }), slow = RS.soSaveChance(84, aim, { col: 0, row: 1, rt: 0.9 });
  assert.ok(quick > slow && quick > right * 0.6, 'a quick reaction ' + quick.toFixed(2) + ' vs a guess ' + right.toFixed(2));
  assert.ok(slow < 0.15);
});

test('round 35: a tap during the run-up after the early pick timed out is an early dive, not dropped', () => {
  const sc = new RS.PKScene({ mode: 'keep', who: 'opp', keeper: { name: 'k', rating: 84 }, fin: 80, level: 80, ourK: 84, oppMiss: 0, rng: RS.makeRng(5) });
  sc.update(3); // the 2.6 s pick timed out: watching, the kicker runs up
  assert.ok(sc.phase === 'runup' && sc.watch && sc.keepOpen());
  sc.keepInput({ col: 2, row: 0 });
  assert.deepEqual(sc.dive, { col: 2, row: 0 });
  sc.update(1); // the strike settles it with that dive
  assert.ok(sc.result && sc.result.diveCol === 2 && sc.result.diveRow === 0);
});

test('the reaction window follows the difficulty: 0.9 s 이지, 0.6 s 노멀, 0.5 s 하드, and the ball lands right after it', () => {
  const was = RS.DIFF;
  try {
    for (const [d, w] of [['easy', 0.9], ['normal', 0.6], ['hard', 0.5]]) {
      RS.setDiff(d);
      assert.equal(RS.soReact(), w);
      const sc = new RS.PKScene({ mode: 'keep', who: 'opp', keeper: { name: 'k', rating: 84 }, fin: 80, level: 80, ourK: 84, oppMiss: 0, rng: RS.makeRng(5) });
      sc.watch = true;
      assert.equal(sc.reactWin, w);
      assert.ok(Math.abs(sc.dur('flight') - (w + 0.1)) < 1e-9);
    }
  } finally { RS.setDiff(was); }
});

test('the scene: a watching keeper can react only inside the window', () => {
  const run = (tapAt) => {
    const sc = new RS.PKScene({ mode: 'keep', who: 'opp', keeper: { name: 'k', rating: 84 }, fin: 80, level: 80, ourK: 84, oppMiss: 0, rng: RS.makeRng(11) });
    sc.geo = { cx: 100, halfW: 60, goalY: 100, barY: 60 };
    let t = 0, tapped = false;
    while (!sc.done && t < 10) {
      sc.update(1 / 60); t += 1 / 60;
      if (sc.phase === 'flight' && !tapped && sc.t >= tapAt) { tapped = true; if (sc.reactOpen) sc.react({ col: sc.aim.col, row: sc.aim.row }); }
    }
    return sc;
  };
  const early = run(0.3);
  assert.ok(early.watch, 'no early pick: he watches');
  assert.equal(early.dive.rt != null, true);
  assert.ok(early.dive.rt < 0.35);
  const late = run(1.05);
  assert.equal(late.dive, null, 'too late: no reaction');
  assert.equal(late.result.res === 'save', false);
});

// Round 20 (the user): a harder strike makes a harder dial; a perfect strike goes in 99 %, against an angry keeper
// every time he dives the wrong way and 80 % of the times he guesses it.
test('round 20: the harder the strike, the faster and narrower the dial', () => {
  const soft = RS.pkTiming(80, 0.6), blue = RS.pkTiming(80, P.blue), hard = RS.pkTiming(80, 0.94), base = RS.pkTiming(80);
  assert.deepEqual(blue, base, 'on the blue band nothing changes');
  assert.ok(hard.needle > blue.needle && blue.needle > soft.needle);
  assert.ok(hard.great < blue.great && hard.good < blue.good && soft.good > blue.good);
  const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', keeper: K.pro, fin: 80, level: 80, hero: 'ronaldo', rng: RS.makeRng(2) });
  sc.pickZone(9); sc.stopPower(0.94);
  assert.deepEqual(sc.timing, hard, 'the scene\'s dial follows the power');
});

test('round 20: a perfect strike goes in 99 %; an angry keeper saves only when he guesses the side', () => {
  for (const shot of RS.PK_SHOT_IDS) for (const keeper of ['local', 'neuer', 'yashin']) for (const z of [1, 5, 9]) {
    assert.ok(Math.abs(RS.pkOdds({ fin: 70, keeper: K[keeper], hero: 'ronaldo', zone: z, power: P.blue, acc: 'great', shot }).goal - 0.99) < 1e-9);
  }
  const rng = RS.makeRng(8), o = { fin: 80, keeper: K.yashin, hero: 'ronaldo', zone: 9, power: P.blue, acc: 'great', rage: true };
  let read = 0, readIn = 0, wrong = 0, wrongIn = 0, calm = 0;
  for (let i = 0; i < 20000; i++) {
    const r = RS.pkKick(rng, o);
    if (r.diveCol === 2) { read++; if (r.goal) readIn++; } else { wrong++; if (r.goal) wrongIn++; }
    if (RS.pkKick(rng, Object.assign({}, o, { rage: false })).goal) calm++;
  }
  assert.equal(wrongIn, wrong, 'the wrong way: always in');
  assert.ok(Math.abs(readIn / read - 0.8) < 0.02, 'the right way: 80 % in, ' + (readIn / read).toFixed(3));
  assert.ok(Math.abs(calm / 20000 - 0.99) < 0.004, 'calm keeper: 99 %, ' + (calm / 20000).toFixed(4));
});

// Round 21 (the user: 정확도 다이얼 잘 못 맞춰도 별 차이가 없네): a missed needle costs a lot. Round 22 (the user:
// 정확도 좋음인데도 다 빗나감 … 파란색 노란색 흰색): blue > yellow > white, and white on a green strike mostly stays on target.
test('round 22: blue, yellow and white are steps; white mostly on target; a missed needle far behind', () => {
  for (const keeper of ['pro', 'neuer']) for (const z of [1, 7, 9]) {
    const at = (acc) => RS.pkOdds({ fin: 76, keeper: K[keeper], hero: 'ronaldo', zone: z, power: P.blue + 0.02, acc });
    const blue = at('great').goal, yellow = at('fine').goal, white = at('good'), miss = at('miss').goal;
    assert.ok(blue > yellow && yellow > white.goal, keeper + ' z' + z + ' ' + [blue, yellow, white.goal].map((v) => v.toFixed(3)));
    assert.ok(white.off < 0.2, keeper + ' z' + z + ' white wide ' + white.off.toFixed(2));
    assert.ok(white.goal - miss >= (keeper === 'neuer' ? 0.2 : 0.12), keeper + ' z' + z + ' white ' + white.goal.toFixed(2) + ' miss ' + miss.toFixed(2));
  }
  const T = RS.pkTiming(76);
  assert.ok(T.great < T.fine && T.fine < T.good, 'the bands nest: blue inside yellow inside white');
});

test('a perfect strike bends into its corner and gets the full effect and sound', () => {
  const rng = RS.makeRng(3);
  for (let i = 0; i < 30; i++) {
    const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', keeper: K.pro, fin: 80, level: 80, hero: 'ronaldo', rng });
    sc.pickZone(9); sc.stopPower(P.blue); sc.stopNeedle(sc.target);
    assert.ok(sc.perfect);
    assert.ok(sc.sfx.includes('perfectLock'));
    let n = 0; while (!sc.done && n++ < 600) { sc.update(1 / 60); if (sc.vfx.length) break; }
    if (sc.result.goal) {
      assert.ok(sc.ball.u > 0.9 && sc.ball.v > 0.9, 'top right corner');
      assert.equal(sc.vfx[0].kind, 'perfect');
      assert.ok(sc.sfx.includes('perfect'));
    }
  }
});
