// Round 8: difficulty, 메시's own items and ball moves, 약물 stimpack doses, the 티키타카 trio, press conferences
// with a bad ending, and the auto pickers.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const withHero = (hero, fn) => { RS.selectHero(hero); try { return fn(); } finally { RS.selectHero('ronaldo'); } };
const withDiff = (k, fn) => { RS.setDiff(k); try { return fn(); } finally { RS.setDiff('normal'); } };
const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };

// steps a godMode world; level-ups take the first card
function runWorld(w, secs) {
  for (let i = 0; i < 60 * secs; i++) {
    if (w.phase === 'levelup') { w.choose(0); continue; }
    if (w.phase === 'chest') { w.closeChest(); continue; }
    if (w.phase === 'swap') { w.chooseSwap(w.swapChoices.length - 1); continue; }
    if (w.phase !== 'play') break;
    w.update(1 / 60, { x: 0, y: 0 });
    w.player.hp = w.stats.maxHp;
  }
  return w;
}
const messiWorld = (setup, yearIdx) => {
  const b = RS.newBuild('messi'); b.hgh = true;
  setup(b);
  const id = b.skillOrder[0]; b.weapon = { id, g: 2, p: 1 }; RS.syncWeapon(b);
  const w = new RS.World({ yearIdx: yearIdx || 10, seed: 7, build: b });
  w.debug.godMode = true;
  return w;
};

test('difficulty: 노멀 is the default; 이지 < 노멀 < 하드 in enemy toughness, damage, crowd and boss hits; heals the other way', () => {
  assert.equal(RS.DIFF, 'normal');
  const save = RS.loadSave(memStore(JSON.stringify({ career: {}, meta: { coins: 5 } })));
  assert.equal(save.meta.diff, 'normal', 'an old save without the setting plays 노멀');
  assert.equal(save.meta.auto, 'off');
  for (const idx of [0, 5, 12]) {
    const t = {};
    for (const k of RS.DIFF_ORDER) t[k] = withDiff(k, () => RS.yearTuning(idx));
    for (const key of ['hpMul', 'dmgMul', 'spawnRate', 'bossDmgMul']) {
      assert.ok(t.easy[key] < t.normal[key], key + ' at season ' + idx);
      // the debut plays as it always did on 노멀/하드; their extra toughness grows in from the next season
      if (idx === 0) assert.ok(t.normal[key] <= t.hard[key]); else assert.ok(t.normal[key] < t.hard[key], key + ' at season ' + idx);
    }
    assert.ok(t.easy.healMul > t.normal.healMul && (idx === 0 ? t.normal.healMul >= t.hard.healMul : t.normal.healMul > t.hard.healMul));
  }
  // the gap widens with the career on 노멀 and 하드
  const ratio = (k, idx) => withDiff(k, () => RS.yearTuning(idx).hpMul) / withDiff('easy', () => RS.yearTuning(idx).hpMul);
  assert.ok(ratio('hard', 14) > ratio('hard', 2));
});

test('노멀 training purchases carry a strong bot through Manchester into Madrid', () => {
  const simCareer = require('./career-sim.js');
  const save = RS.newSave();
  for (const k of Object.keys(RS.META)) save.meta.upgrades[k] = Math.floor(RS.META[k].max / 2);
  const c = simCareer({ seed: 7, save, to: 8, train(s, rng) {
    if (s.meta.coins >= 320) RS.buyBox(s, 'box2', rng);
    RS.buyEnhance(s, rng);
    for (const m of RS.allMates(s.career.build)) RS.buyMateTrain(s, m.id);
    while (s.meta.coins >= 90) RS.buyBox(s, 'box1', rng);
  } });
  assert.equal(c.stoppedAt, null, JSON.stringify({ stoppedAt: c.stoppedAt, build: c.save.career.build, last: c.years.at(-1) }));
});

test('메시 gets his own items: never 폭발 슈팅 or 별똥별 (날두 only), and his 알까기 / 외계인 모드 work', () => withHero('messi', () => {
  const mb = RS.newBuild('messi'), rb = RS.newBuild('ronaldo');
  for (const tier of RS.TIER_ORDER) {
    const pool = RS.relicPool(mb, tier);
    for (const id of ['bomb', 'meteor', 'honaldo', 'lunchbox']) assert.ok(!pool.includes(id), id + ' is 날두 only');
    for (const id of ['nutmeg', 'alien', 'messia', 'mate']) assert.ok(!RS.relicPool(rb, tier).includes(id), id + ' is 메시 only');
  }
  // a crowd of weak men around 메시, so the 회전 공 keeps knocking them down
  const crowd = (w) => { for (let i = 0; i < 30; i++) { const a = i * 0.7, e = w.spawnEnemy('grunt', w.player.x + Math.cos(a) * (36 + i), w.player.y + Math.sin(a) * (36 + i)); e.maxHp = e.hp = 25; } return w; };
  const base = runWorld(crowd(messiWorld((b) => { b.skills = { orbit: 3 }; b.skillOrder = ['orbit']; })), 4).dmgDealt;
  const nut = runWorld(crowd(messiWorld((b) => { b.skills = { orbit: 3 }; b.skillOrder = ['orbit']; b.relics = { nutmeg: 1 }; b.relicOrder = ['nutmeg']; })), 4).dmgDealt;
  assert.ok(nut > base * 1.1, '알까기 연쇄 adds damage: ' + Math.round(base) + ' → ' + Math.round(nut));
  const w = messiWorld((b) => { b.skills = { orbit: 1 }; b.skillOrder = ['orbit']; b.relics = { alien: 1 }; b.relicOrder = ['alien']; });
  for (let i = 0; i < 8; i++) w.spawnEnemy('grunt', w.player.x + 30 + i * 6, w.player.y + (i % 2 ? 10 : -10));
  w.grid.clear(); for (const e of w.enemies) w.grid.insert(e);
  assert.ok(w.alienRun(), '외계인 모드 fires with enemies near');
  assert.ok(w.player.iframe > 0.5, '메시 is untouchable during the run');
}));

test('약물 꽂기: only after the treatment, a stimpack of up to five doses, each one stronger', () => withHero('messi', () => {
  const refused = RS.newBuild('messi'); refused.hgh = false;
  const undecided = RS.newBuild('messi');
  assert.ok(!RS.stimReady(refused) && !RS.stimReady(undecided), 'no 약물 without the treatment');
  assert.ok(RS.TIER_ORDER.every((t) => !RS.relicPool(refused, t).includes('doping')));
  const b = RS.newBuild('messi'); b.hgh = true;
  assert.ok(RS.stimReady(b));
  const dmg = [RS.computeStats(b, {}).dmg];
  for (let i = 0; i < RS.STIM.max; i++) { assert.ok(RS.applyChoice(b, { kind: 'stim', id: 'doping' })); dmg.push(RS.computeStats(b, {}).dmg); }
  assert.equal(b.relics.doping, 5);
  assert.ok(!RS.applyChoice(b, { kind: 'stim', id: 'doping' }), 'a sixth dose is refused');
  assert.ok(!RS.stimReady(b));
  for (let i = 1; i < dmg.length; i++) assert.ok(dmg[i] > dmg[i - 1], 'dose ' + i + ' adds damage');
  assert.deepEqual(b.relicOrder.filter((id) => id === 'doping'), ['doping'], 'one item, many doses');
  // the card can show up in a hand, and 반자동 leaves it to the player (it is a special card)
  const rng = RS.makeRng(5); let seen = null;
  const fresh = RS.newBuild('messi'); fresh.hgh = true;
  for (let i = 0; i < 4000 && !seen; i++) seen = RS.rollSpecial(fresh, rng, 0, 0);
  assert.ok(seen, 'some special card shows up');
  b.relics.doping = 9; assert.equal(RS.normalizeBuild(b).relics.doping, RS.STIM.max, 'saved doses are clamped');
}));

test('two teammates at most on the pitch, and 챠비 + 니에미스타 with 메시 form the 티키타카 trio', () => withHero('messi', () => {
  const b = RS.newBuild('messi');
  RS.addMate(b, 'talis'); RS.addMate(b, 'modric'); RS.addMate(b, 'tinykeeper');
  assert.equal(b.teammates.length, RS.MAX_MATES);
  const w = new RS.World({ yearIdx: 10, seed: 1, build: b });
  assert.equal(w.mates.length, 2, 'only the two starters run on');
  assert.equal(w.passers, undefined, 'no support runners any more');
  const before = RS.computeStats(b, {}).dmg;
  RS.formTrio(b);
  assert.deepEqual(b.teammates.map((m) => m.id).sort(), ['iniestar', 'xavino']);
  assert.ok(b.bench.some((m) => m.id === 'talis') && b.bench.length <= RS.MAX_BENCH, 'the starters step down to the bench');
  const syn = RS.pairSynergy(b);
  assert.equal(syn.name, '티키타카 트리오');
  assert.ok(RS.computeStats(b, {}).dmg > before + 0.15, '메시 hits much harder with the trio');
  // the 2008 뻽 event offers it
  const save = RS.newSave(); save.career.build = RS.newBuild('messi');
  const idx = RS.YEARS.findIndex((y) => y.event === 'pep');
  assert.ok(idx > 0);
  const card = RS.eventChoices(save, idx).find((c) => c.trio);
  const info = RS.applyEvent(save, idx, card);
  assert.ok(info.trio && RS.pairSynergy(save.career.build).named);
}));

test('드리볼 chases the enemies near 메시, 드롭볼 falls on a crowd and comes back, 신의 손 slams and stuns', () => withHero('messi', () => {
  const d = messiWorld((b) => { b.skills = { dribball: 1 }; b.skillOrder = ['dribball']; });
  runWorld(d, 1);
  const ball = d.dribs[0];
  assert.ok(Math.hypot(ball.x - d.player.x, ball.y - d.player.y) < 30, 'with nobody near it juggles at his feet');
  const e = d.spawnEnemy('tank', d.player.x + 60, d.player.y);
  e.maxHp = e.hp = 1e6;
  const hp0 = e.hp;
  runWorld(d, 2);
  assert.ok(e.hp < hp0, 'the ball went out and hit the man');

  const r = messiWorld((b) => { b.skills = { dropball: 1 }; b.skillOrder = ['dropball']; });
  const states = new Set();
  for (let i = 0; i < 60 * 12; i++) { runWorld(r, 1 / 60); states.add(r.drops[0].st); }
  for (const s of ['orbit', 'rise', 'fall', 'gone']) assert.ok(states.has(s), '드롭볼 goes through ' + s);
  assert.ok(r.dmgDealt > 0);

  const h = messiWorld((b) => { b.skills = { hand: 1 }; b.skillOrder = ['hand']; });
  let stunned = false;
  for (let i = 0; i < 60 * 12 && !stunned; i++) { runWorld(h, 1 / 60); stunned = h.enemies.some((x) => x.alive && x.stun > 0); }
  assert.ok(stunned, '신의 손 stuns where it lands');
}));

test('기자회견: 탈세 — 아버지에게 미룬다 (90% the father goes to jail, 10% bad ending) or 자백한다 (stats drop, career goes on)', () => withHero('messi', () => {
  const idx = RS.YEARS.findIndex((y) => y.press === 'tax_messi');
  assert.ok(idx > 0);
  const fresh = () => { const s = RS.newSave(); s.career.build = RS.newBuild('messi'); s.career.yearIdx = idx; s.career.eventDone = idx; s.meta.coins = 1000; return s; };
  const s1 = fresh();
  assert.ok(RS.needsPress(s1, idx));
  const dmg0 = RS.computeStats(s1.career.build, {}).dmg;
  const out = RS.applyPress(s1, idx, 'confess', () => 0.5);
  assert.ok(!out.ending && !s1.career.over);
  assert.ok(RS.computeStats(s1.career.build, {}).dmg < dmg0, 'confessing costs some career');
  assert.ok(RS.canPlay(s1, idx), 'the game goes on');
  assert.ok(!RS.needsPress(s1, idx), 'asked once');

  const s2 = fresh();
  const jail = RS.applyPress(s2, idx, 'blame', () => 0.5);
  assert.ok(s2.career.build.flags.fatherJail && !jail.ending, 'the father takes the blame');
  const s3 = fresh();
  const bad = RS.applyPress(s3, idx, 'blame', () => 0.95);
  assert.equal(bad.ending, 'tax_messi');
  assert.equal(s3.career.over, 'tax_messi');
  assert.ok(!RS.canPlay(s3, idx) && !RS.canPlay(s3, 0), 'the career is over');
  RS.newCareer(s3);
  assert.ok(!s3.career.over && RS.canPlay(s3, 0), 'a new career starts clean');
  // the odds printed on the choice match the rolls
  const ch = RS.PRESS.tax_messi.choices.find((c) => c.id === 'blame');
  assert.deepEqual(ch.rolls.map((o) => o.p), [0.9, 0.1]);
}));

test('every press conference belongs to its hero, its effects are real, and 완전 오토 never picks a career-ending answer', () => {
  const used = new Set();
  for (const hero of ['ronaldo', 'messi']) withHero(hero, () => {
    for (const y of RS.YEARS) if (y.press) {
      assert.ok(RS.PRESS[y.press], y.press);
      used.add(y.press);
      const pr = RS.PRESS[y.press], short = RS.HEROES[hero].short;
      assert.ok(pr.lines.some((l) => l.by === short), y.press + ': the hero speaks in his own scene');
      const pick = pr.choices[RS.autoPressPick(pr.choices)];
      assert.ok(!(pick.rolls || []).some((o) => o.ending), y.press + ': the auto pick is safe');
      for (const c of pr.choices) if (c.rolls) assert.ok(Math.abs(c.rolls.reduce((s, o) => s + o.p, 0) - 1) < 1e-9, y.press + '/' + c.id + ' odds sum to 1');
    }
  });
  assert.deepEqual([...used].sort(), Object.keys(RS.PRESS).sort(), 'every scene is used by some season');
  // a lasting effect reaches the stats through its coach-card id
  const b = RS.newBuild('ronaldo');
  const s = RS.newSave(); s.career.build = b;
  const idx = RS.YEARS_RONALDO.findIndex((y) => y.press === 'cola');
  withHero('ronaldo', () => {
    const hp0 = RS.computeStats(b, {}).maxHp;
    RS.applyPress(s, idx, 'water', () => 0);
    assert.equal(RS.computeStats(s.career.build, {}).maxHp, hp0 + 15);
    assert.ok(s.career.build.fans > RS.FANS.start);
  });
});

test('auto pickers prefer special items, doses and better weapons, rejecting downgrades', () => {
  const b = RS.newBuild('messi'); b.hgh = true;
  const hand = [
    { kind: 'enhance', id: 'orbit' },
    { kind: 'weapon', id: 'tiki', wpn: { id: 'tiki', g: 2, p: 1 } },
    { kind: 'stim', id: 'doping' },
    { kind: 'relic', id: 'goat', tier: 'super' }
  ];
  assert.equal(RS.botChoose(hand, b), 3);
  assert.equal(RS.botChoose(hand.slice(0, 3), b), 2);
  assert.equal(RS.botChoose(hand.slice(0, 2), b), 1);
  b.weapon.g = 4; RS.syncWeapon(b);
  assert.equal(RS.botChoose(hand.slice(0, 2), b), 0, 'keep a stronger weapon');
  // the trio partner links too
  const m = RS.newBuild('messi'); RS.addMate(m, 'xavino');
  assert.equal(RS.botChoose([{ kind: 'mate', id: 'talis' }, { kind: 'mate', id: 'iniestar' }], m), 1);
});

test('old builds load with 민심 at the start and no 약물 doses; a parked career without the new fields still plays', () => {
  const old = RS.newBuild('messi');
  delete old.fans; delete old.flags;
  const b = RS.normalizeBuild(old);
  assert.equal(b.fans, RS.FANS.start);
  assert.deepEqual(b.flags, {});
  assert.equal(RS.fanTier(b).key, 'calm');
  const save = RS.newSave();
  delete save.career.pressDone; delete save.career.over;
  const idx = RS.YEARS.findIndex((y) => y.press);
  save.career.yearIdx = idx;
  assert.ok(RS.needsPress(save, idx) && RS.canPlay(save, idx));
});
