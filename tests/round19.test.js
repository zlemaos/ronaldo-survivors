const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const memStore = (raw) => { const m = { [RS.SAVE_KEY]: raw }; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; } }; };
const saveFor = (hero) => { const s = RS.newSave(); s.meta.unlocked.torres = true; if (hero !== 'ronaldo') RS.switchHero(s, hero); return s; };
const withRonaldo = (fn) => { try { return fn(); } finally { RS.selectHero('ronaldo'); } };
const owns = (b, id) => !!RS.ownedWeapon(b, id);
const cupOf = (hero) => RS.CUP_REWARDS.find((r) => r.hero === hero).id;

// Round 19 (the user: "해금이니까 이제 필드에서 출현할 가능성이 생긴거죠"): a cup win unlocks the move, it is not handed over.
test('an unlocked cup move is never put in hand: not on load, not in a new career, not on a hero switch', () => withRonaldo(() => {
  const s = saveFor('ronaldo');
  for (const r of RS.CUP_REWARDS) s.meta.unlocked[r.id] = true;
  assert.ok(!owns(s.career.build, 'penaldo'));
  const st = memStore(null); RS.writeSave(st, s);
  const back = RS.loadSave(st);
  assert.ok(!owns(back.career.build, 'penaldo'), 'loading gives nothing');
  RS.newCareer(back);
  assert.ok(!owns(back.career.build, 'penaldo'), 'a new career starts without it');
  RS.switchHero(back, 'messi');
  assert.ok(!owns(back.career.build, 'bribe'), 'a hero switch gives nothing');
  RS.switchHero(back, 'torres');
  assert.ok(!owns(back.career.build, 'hollywood'));
  assert.deepEqual(RS.grantCupRewards(back), [], 'the old grant (still called by the cup result) gives nothing');
}));

test('a career that got the move the old way keeps it, at SIUUU, through load, hero switches and back', () => withRonaldo(() => {
  const s = saveFor('messi');
  s.meta.unlocked.bribe = true;
  const b = s.career.build, old = b.weapon.id;
  RS.gainWeapon(b, { id: 'bribe', g: RS.CUP_GRADE, p: 1 }, true);
  const st = memStore(null); RS.writeSave(st, s);
  const back = RS.loadSave(st);
  assert.equal(back.career.build.weapon.id, 'bribe');
  assert.equal(back.career.build.weapon.g, RS.CUP_GRADE);
  assert.ok(back.career.build.armory.some((w) => w.id === old));
  RS.switchHero(back, 'ronaldo');
  RS.switchHero(back, 'messi');
  assert.equal(back.career.build.weapon.id, 'bribe', 'the parked career comes back with it');
}));

test('on a level-up of its hero the unlocked move turns up now and then, at SIUUU, in place of the weapon card', () => withRonaldo(() => {
  for (const hero of ['ronaldo', 'messi', 'torres']) {
    const id = cupOf(hero), b = RS.newBuild(hero), unlocked = { [id]: true };
    RS.selectHero(hero, b);
    const rng = RS.makeRng(3), N = 20000;
    let seen = 0;
    for (let i = 0; i < N; i++) {
      const hand = RS.levelChoices(b, rng, 3, 0, 0, unlocked), cups = hand.filter((c) => c.cup);
      assert.ok(cups.length <= 1);
      if (!cups.length) continue;
      seen++;
      const c = cups[0];
      assert.equal(c.kind, 'weapon');
      assert.equal(c.id, id);
      assert.equal(c.wpn.g, RS.CUP_GRADE);
      assert.equal(c.g, RS.CUP_GRADE, 'the card wears the SIUUU colours');
      assert.equal(c.tag, 'SIUUU +1');
      assert.equal(hand.filter((x) => x.kind === 'weapon').length, 1, 'it takes the weapon card\'s place');
    }
    const p = seen / N;
    assert.ok(Math.abs(p - RS.CUP_OFFER) < 0.006, hero + ': ' + (p * 100).toFixed(2) + ' % of hands');
  }
}));

test('never for another hero, never before the unlock, never once a SIUUU copy is owned; other hands stay the same', () => withRonaldo(() => {
  const all = {}; for (const r of RS.CUP_REWARDS) all[r.id] = true;
  const deal = (hero, b, unlocked, seed) => { RS.selectHero(hero, b); const rng = RS.makeRng(seed); const out = []; for (let i = 0; i < 3000; i++) out.push(RS.levelChoices(b, rng, 3, 0, 0, unlocked)); return out; };
  for (const hero of ['ronaldo', 'messi', 'torres']) {
    const mine = cupOf(hero), others = Object.assign({}, all); delete others[mine];
    const b = RS.newBuild(hero);
    const plain = deal(hero, b, {}, 9);
    assert.ok(plain.every((h) => !h.some((c) => c.cup || RS.SKILLS[c.id] && RS.SKILLS[c.id].gift && c.kind === 'weapon')), hero + ': nothing before the unlock');
    // the other heroes' unlocks change nothing, not even the random sequence
    assert.deepEqual(deal(hero, b, others, 9).map((h) => h.map((c) => c.kind + c.id)), plain.map((h) => h.map((c) => c.kind + c.id)));
    RS.gainWeapon(b, { id: mine, g: RS.CUP_GRADE, p: 1 }, false);
    assert.ok(deal(hero, b, all, 9).every((h) => !h.some((c) => c.cup)), hero + ': not again once owned at SIUUU');
  }
}));

// A 첼씨 시련 boss felled before the enemies move in that step (명품 헐리웃's landing blast, any shot) starts the
// 캄프 누 goal mid-step; the keeper it brings has no boss AI and stopped the match (found by the round-19 career sim).
test('the 캄프 누 keeper started in the middle of a step does not stop the match', () => withRonaldo(() => {
  const s = saveFor('torres'), idx = RS.YEARS.findIndex((y) => y.cine);
  assert.ok(idx >= 0);
  const w = RS.startYear(s, idx, { seed: 2 });
  w.startCine(RS.YEARS[idx].cine, null);
  assert.doesNotThrow(() => w.updateEnemies(1 / 60));
}));

// The field: a match that holds the unlock deals the move; taking it is the SIUUU moment.
const play = (w, sec, until) => {
  for (let i = 0; i < sec * 60 && w.phase !== 'dead' && w.phase !== 'clear'; i++) {
    if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices, w.build)); continue; }
    if (w.phase === 'chest') { w.closeChest(); continue; }
    if (w.phase === 'swap') { w.chooseSwap(0); continue; }
    w.update(1 / 60, RS.botInput(w));
    if (until && until(w)) return true;
  }
  return false;
};
const seen = (w, kind) => { const s = w._seen || (w._seen = new Set()); for (const f of w.fx) s.add(f.kind); return s.has(kind); };
const events = (w, type) => { const n = w.events.filter((e) => e.type === type).length; return n; };

test('taking the card puts the move in hand at SIUUU with its big moment', () => withRonaldo(() => {
  const s = saveFor('torres');
  s.meta.unlocked.hollywood = true;
  const w = RS.startYear(s, 2, { seed: 5 });
  assert.equal(w.unlocked.hollywood, true, 'the match knows the unlock');
  w.levelQueue = 1; w.openLevelUp();
  const card = RS.cupOffer(w.build, () => 0, w.unlocked, 'torres');
  w.choices[0] = card;
  w.events.length = 0;
  assert.ok(w.choose(0));
  assert.equal(w.build.weapon.id, 'hollywood');
  assert.equal(w.build.weapon.g, RS.CUP_GRADE);
  assert.ok(w.build.evolved.hollywood, 'SIUUU plays the evolved form');
  assert.equal(events(w, 'siuuuWeapon'), 1);
  assert.ok(w.fx.some((f) => f.kind === 'siuuup'));
  assert.ok(w.pfxQ.filter((q) => q.fx === 'firework').length >= 3, 'fireworks in the grade colours');
}));

test('each move plays its own SIUUU effects in a match, and the big moment once at its first shot', () => withRonaldo(() => {
  const look = { penaldo: ['pkshot'], bribe: ['referee', 'redcards'], hollywood: ['dive'] };
  for (const r of RS.CUP_REWARDS) {
    const s = saveFor(r.hero);
    s.meta.unlocked[r.id] = true;
    RS.gainWeapon(s.career.build, { id: r.id, g: RS.CUP_GRADE, p: 1 }, true); // held from before (old save)
    s.career.yearIdx = 6;
    const w = RS.startYear(s, 6, { seed: 4 });
    let moments = 0, pc = false;
    const ok = play(w, 40, (x) => {
      moments += events(x, 'siuuuWeapon'); x.events.length = 0;
      if (x.projs.some((p) => p.alive && p.kind === 'pcannon')) pc = true;
      return look[r.id].every((k) => seen(x, k)) && (r.id !== 'penaldo' || pc);
    });
    assert.ok(ok, r.id + ' shows ' + look[r.id].join(', '));
    assert.equal(moments, 1, r.id + ': the SIUUU moment plays once a match');
    assert.ok(w._seen.has('siuuup'), r.id + ': the moment\'s burst');
  }
}));
