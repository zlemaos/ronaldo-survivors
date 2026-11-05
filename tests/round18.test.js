const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// Round 18: shot types for the hero's own kick (🦶 밀어차기 · 🚀 발등슛 · 🌀 감아차기) and the left-footed 메시.
const K = RS.PK_KEEPERS, P = RS.PK_POWER;
const odds = (o) => RS.pkOdds(Object.assign({ fin: 80, keeper: K.pro, hero: 'ronaldo' }, o));
// a player's average over the strikes he really makes: power around the blue band (wider on a faster gauge)
const typical = (zone, shot, seed) => {
  const rng = RS.makeRng(seed || 7);
  let g = 0, off = 0, save = 0;
  for (let i = 0; i < 6000; i++) {
    let u = 0; for (let j = 0; j < 6; j++) u += rng();
    const power = Math.max(0.6, Math.min(1, P.blue + (u - 3) / Math.sqrt(0.5) * 0.05 * RS.pkShot(shot).gauge));
    const r = rng(), o = odds({ zone, shot, power, acc: r < 0.3 ? 'great' : r < 0.85 ? 'good' : 'miss' });
    g += o.goal; off += o.off; save += o.save;
  }
  return { goal: g / 6000, off: off / 6000, save: save / 6000 };
};

test('밀어차기 is the default and the round-16 kick unchanged', () => {
  for (const z of [1, 2, 5, 9]) for (const [power, acc] of [[P.blue, 'great'], [0.74, 'good'], [0.95, 'miss'], [0.4, 'good'], [0.08, 'miss']]) {
    const a = odds({ zone: z, power, acc }), b = odds({ zone: z, power, acc, shot: 'push' });
    assert.deepEqual(a, b);
    assert.equal(a.shot, 'push');
  }
  assert.equal(RS.pkShot('nope'), RS.PK_SHOTS.push);
});

test('each type is a tradeoff, not a buff: 발등슛 is saved less but misses more; 감아차기 misses less but is saved more', () => {
  for (const z of [1, 3, 7, 9, 4, 6]) {
    const push = typical(z, 'push'), drive = typical(z, 'drive'), curl = typical(z, 'curl');
    assert.ok(drive.save < push.save && drive.off > push.off, 'zone ' + z + ' 발등슛');
    assert.ok(curl.off < push.off && curl.save > push.save, 'zone ' + z + ' 감아차기');
  }
  // and each has a place where it is the best pick for a good player
  const best = (z) => RS.PK_SHOT_IDS.map((s) => [s, typical(z, s).goal]).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(best(9), 'curl', 'under the bar the curl bends in');
  assert.equal(best(5), 'drive', 'down the middle the laces beat him');
  assert.equal(best(1), 'push', 'low in the corner the side-foot is safest');
  // the gauge: a 발등슛's sweeps faster, a 감아차기's slower
  assert.ok(RS.PK_SHOTS.drive.gauge > 1 && RS.PK_SHOTS.curl.gauge < 1);
});

test('the blue band still bends into the corner for every type; the grid shows that chance; chips stay chips', () => {
  for (const shot of RS.PK_SHOT_IDS) for (const z of [1, 3, 7, 9]) {
    const o = odds({ zone: z, power: P.blue, acc: 'great', shot });
    assert.equal(o.kind, 'perfect');
    assert.equal(o.off, 0);
    assert.ok(Math.abs(RS.pkZoneBest({ fin: 80, keeper: K.pro, hero: 'ronaldo', shot }, z) - o.goal) < 1e-9);
  }
  for (const shot of RS.PK_SHOT_IDS) {
    const pan = odds({ zone: 2, power: 0.08, acc: 'miss', shot }), tb = odds({ zone: 2, power: 0.4, acc: 'good', shot });
    assert.equal(pan.kind, 'panenka'); assert.deepEqual(Object.assign({}, pan, { shot: 0 }), Object.assign({}, odds({ zone: 2, power: 0.08, acc: 'miss' }), { shot: 0 }));
    assert.equal(tb.kind, 'tbag');
  }
  // an angry keeper who flies early gets to a slow curl more often still
  const calm = odds({ zone: 7, power: 0.74, acc: 'good', shot: 'curl' }), mad = odds({ zone: 7, power: 0.74, acc: 'good', shot: 'curl', rage: true });
  const calmP = odds({ zone: 7, power: 0.74, acc: 'good' }), madP = odds({ zone: 7, power: 0.74, acc: 'good', rage: true });
  assert.ok(mad.save / calm.save > madP.save / calmP.save);
});

test('misses look like the type: a 발등슛 off the mark mostly flies over, a 감아차기 curls wide', () => {
  const rng = RS.makeRng(4), n = { drive: {}, curl: {} };
  for (const shot of ['drive', 'curl']) for (let i = 0; i < 4000; i++) {
    const r = RS.pkKick(rng, { fin: 70, keeper: K.pro, hero: 'ronaldo', zone: 4, power: 0.95, acc: 'miss', shot });
    assert.equal(r.shot, shot);
    if (!r.goal && r.res !== 'save') n[shot][r.res] = (n[shot][r.res] || 0) + 1;
  }
  assert.ok((n.drive.over || 0) > (n.drive.wide || 0) + (n.drive.post || 0), JSON.stringify(n.drive));
  assert.ok((n.curl.wide || 0) > 0 && (n.curl.over || 0) < (n.drive.over || 0));
});

test('the bot and 🤖 pick a type for the zone: 감아차기 under the bar, 발등슛 in the middle or against a top keeper', () => {
  assert.equal(RS.pkBotShot(9, K.pro), 'curl');
  assert.equal(RS.pkBotShot(5, K.pro), 'drive');
  assert.equal(RS.pkBotShot(1, { rating: 80 }), 'push');
  assert.equal(RS.pkBotShot(1, { rating: 92 }), 'drive');
  const rng = RS.makeRng(8), seen = new Set();
  for (let i = 0; i < 300; i++) { const b = RS.pkBotKick(rng, 80, 80, K.pro); assert.ok(RS.PK_SHOTS[b.shot]); seen.add(b.shot); }
  assert.ok(seen.size >= 2);
  const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', fin: 80, level: 80, hero: 'ronaldo', keeper: K.pro, rng: RS.makeRng(2), auto: true });
  assert.equal(sc.shot, sc.bot.shot, 'the 🤖 kick plays its own type');
});

test('the scene: the player picks while aiming; each type has its run-up, footfalls, sounds and flight', () => {
  const make = (shot, o) => new RS.PKScene(Object.assign({ mode: 'shoot', who: 'hero', fin: 80, level: 80, hero: 'ronaldo', keeper: K.pro, rng: RS.makeRng(5), shot }, o));
  const sc = make();
  assert.equal(sc.shot, 'push', 'nobody has to choose');
  assert.ok(sc.pickShot('curl')); assert.equal(sc.shot, 'curl');
  assert.ok(!sc.pickShot('zzz'));
  sc.pickZone(7);
  assert.ok(!sc.pickShot('drive'), 'locked once the zone is picked');
  const runs = {}, sounds = {}, paths = {};
  for (const shot of RS.PK_SHOT_IDS) {
    const s = make(shot);
    s.pickZone(9); s.stopPower(0.74); s.stopNeedle(s.target + 60);
    const heard = [];
    let t = 0;
    while (s.phase !== 'result' && t < 5) { s.update(1 / 60); t += 1 / 60; heard.push(...s.sfx); s.sfx.length = 0; }
    runs[shot] = s.dur('runup');
    sounds[shot] = heard;
    assert.equal(heard.filter((x) => x === 'step').length, s.runSteps() - 1);
    assert.equal(heard.filter((x) => x === 'plant').length, 1);
    paths[shot] = [0.25, 0.5, 0.75].map((k) => s.ballAt(k));
    paths[shot].end = s.ball;
  }
  assert.ok(runs.drive > runs.curl && runs.curl > runs.push, JSON.stringify(runs));
  assert.ok(sounds.drive.includes('rocket') && sounds.curl.includes('spin') && !sounds.push.includes('rocket'));
  // 발등슛: low and flat, then it rises; 감아차기 swings out against its bend before it comes in
  const d = paths.drive, c = paths.curl;
  assert.ok(d[0].v < d.end.v * 0.25 + 0.05, 'the rocket starts low');
  assert.ok(c[1].u - c.end.u * 0.5 > 0.05, 'a right foot curls it from right to left: it swings out to the right first');
});

test('메시 is left-footed: he kicks from the other side and bends it the other way', () => {
  const at = (hero) => new RS.PKScene({ mode: 'shoot', who: 'hero', fin: 80, level: 80, hero, keeper: K.pro, rng: RS.makeRng(1) });
  assert.equal(RS.pkFoot('messi'), 'L');
  assert.equal(RS.pkFoot('ronaldo'), 'R');
  const m = at('messi'), r = at('ronaldo');
  assert.equal(m.foot, 'L'); assert.equal(r.foot, 'R');
  assert.equal(m.curlDir, -r.curlDir);
});

test('the keeper\'s pose contract stays for the keeper drawing', () => {
  const sc = new RS.PKScene({ mode: 'shoot', who: 'hero', fin: 80, level: 80, hero: 'ronaldo', keeper: K.pro, rng: RS.makeRng(3), shot: 'drive' });
  sc.pickZone(3); sc.stopPower(0.74); sc.stopNeedle(sc.target);
  for (let t = 0; t < 3 && !sc.done; t += 1 / 60) {
    sc.update(1 / 60);
    const p = sc.keeperPose();
    assert.ok(['idle', 'dive', 'feint', 'catch'].includes(p.mode));
    for (const f of ['u', 't']) assert.equal(typeof p[f], 'number');
  }
});
