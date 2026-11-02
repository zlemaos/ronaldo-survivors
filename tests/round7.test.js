// Round 7: 메시 plays like 메시 (passes from 챠비 / 니에미스타, old saves converted), teammate OVR grades, and the
// mid-career wall with 고난의 시즌, 첼씨 and 드록빠.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const withHero = (hero, fn) => { RS.selectHero(hero); try { return fn(); } finally { RS.selectHero('ronaldo'); } };

test('an old 메시 save holding 날두 moves gets 메시 moves back, levels and evolutions kept', () => {
  const b = RS.newBuild('messi');
  b.skills = { orbit: 6, header: 6, bicycle: 3, kick: 2 }; b.skillOrder = ['orbit', 'header', 'bicycle', 'kick'];
  b.evolved = { orbit: 'count', header: true };
  b.passives = { jump: 3, boots: 2 }; b.passiveOrder = ['jump', 'boots'];
  b.relics = { honaldo: 1 }; b.relicOrder = ['honaldo'];
  const n = RS.normalizeBuild(b);
  assert.deepEqual(n.skillOrder, ['orbit', 'chip', 'elastico', 'tiki']);
  assert.equal(n.skills.chip, 6);
  assert.ok(n.evolved.chip, 'the evolution moves over with the level');
  assert.equal(n.evolved.orbit, 'count');
  assert.ok(n.skillOrder.every((id) => RS.skillFor(id, 'messi')));
  assert.ok(n.passiveOrder.length === 2 && n.passiveOrder.every((id) => RS.passiveFor(id, 'messi')));
  assert.deepEqual(n.relicOrder, ['messia']);
});

test('메시 never shoots himself: 챠비 runs beside him and plays the 티키타카 pass', () => withHero('messi', () => {
  const b = RS.newBuild('messi');
  b.skills.tiki = 1; b.skillOrder.push('tiki');
  const w = new RS.World({ yearIdx: 8, seed: 3, build: b });
  w.debug.godMode = true;
  const xavi = w.passers.find((h) => h.id === 'xavino');
  assert.ok(xavi, '챠비 takes the pitch with 메시');
  const shots = [];
  const spawn = w.spawnProj.bind(w);
  w.spawnProj = (kind, x, y, ...rest) => { shots.push({ x, y, hx: xavi.x, hy: xavi.y, px: w.player.x, py: w.player.y }); return spawn(kind, x, y, ...rest); };
  w.spawnEnemy('grunt', w.player.x + 70, w.player.y);
  for (let i = 0; i < 240 && !shots.length; i++) {
    if (w.phase === 'levelup') { w.choose(0); continue; }
    w.update(1 / 60, { x: 0, y: 0 });
  }
  assert.ok(shots.length, 'the pass was played');
  const s = shots[0];
  assert.ok(s.x === s.hx && s.y === s.hy, 'played from 챠비');
  assert.ok(Math.hypot(s.x - s.px, s.y - s.py) > 5, 'not from 메시');
}));

test('teammate grades: a higher OVR hits harder, kids are rated against kids in youth seasons, swaps show ▲/▼', () => {
  const hi = 'modric', lo = 'talis';
  assert.ok(RS.mateOvr(hi) > RS.mateOvr(lo));
  assert.ok(RS.mateMul(hi) > RS.mateMul(lo), 'a better grade brings more power');
  assert.notEqual(RS.mateTier(hi).key, RS.mateTier(lo).key);
  assert.match(RS.swapVerdict(lo, hi), /^▲/);
  assert.match(RS.swapVerdict(hi, lo), /^▼/);
  // a kid is weak among pros but a full player in the kids' league, so the 메시 youth keeps its balance
  assert.ok(RS.mateMul('tinykeeper') < 0.75 && RS.mateMul('tinykeeper', true) > 0.9);
  const b = RS.newBuild('messi'), kid = RS.newBuild('messi');
  RS.addMate(kid, 'tinykeeper');
  const gain = RS.computeStats(kid, {}, true).maxHp - RS.computeStats(b, {}, true).maxHp;
  assert.ok(gain >= Math.floor(RS.ROLE_BUFF.keeper.mods.hp * 0.9), 'the kid keeper lends nearly his whole buff in the youth: ' + gain);
});

test('the same player at another club is never signed twice; a coin draw costs more for every item owned', () => {
  const b = RS.newBuild('messi');
  assert.equal(RS.addMate(b, 'busquetsorch'), 'pitch');
  assert.equal(RS.addMate(b, 'busquetsmia'), false);
  const d = RS.COIN_DRAWS[0], c0 = RS.drawCost(d, b);
  const id = Object.keys(RS.RELICS)[0];
  b.relics[id] = 1; b.relicOrder.push(id);
  assert.ok(RS.drawCost(d, b) > c0);
});

test('the wall: late-season crowds shrug off knockback, and a 고난의 시즌 is tougher than the same season without it', () => {
  const push = (idx) => {
    const w = new RS.World({ yearIdx: idx, seed: 1 });
    const e = w.spawnEnemy('grunt', w.player.x + 200, w.player.y);
    w.damageEnemy(e, 0.01, { knock: 100, kx: 1, ky: 0 });
    return e.kx;
  };
  assert.ok(push(18) < push(2) * 0.6, 'late crowds resist knockback');
  const i = RS.YEARS.findIndex((y) => y.trial === 3);
  const y = RS.YEARS[i], lv = y.trial;
  const hard = RS.yearTuning(i);
  y.trial = 0;
  const plain = RS.yearTuning(i);
  y.trial = lv;
  for (const k of ['hpMul', 'dmgMul', 'spawnRate', 'bossDmgMul', 'bossFight']) assert.ok(hard[k] > plain[k], k);
  assert.ok(hard.poise < plain.poise);
});

test('첼씨: the crowd wears blue, the 버스 sweeps in three times, and 드록빠 is the season boss', () => {
  const i = RS.YEARS.findIndex((y) => y.boss.type === 'drogba');
  assert.ok(i > 0 && RS.YEARS[i].foe === 'chelsea');
  assert.deepEqual(RS.foeColors(i), RS.FOES.chelsea.kit);
  const w = new RS.World({ yearIdx: i, seed: 2 });
  w.debug.godMode = true;
  assert.equal(w.schedule.filter((e) => e.kind === 'bus').length, 3);
  w.runScheduled('bus');
  const bus = w.enemies.filter((e) => e.alive && e.type === 'tank' && (e.lineVx || e.lineVy));
  assert.ok(bus.length >= 14, 'two rows of heavy defenders: ' + bus.length);
  assert.ok(w.events.some((e) => e.type === 'banner' && e.text.includes('첼씨')));
  const boss = w.spawnBoss();
  assert.equal(boss.name, '드록빠');
  w.build.skillOrder = []; w.build.skills = {}; // nobody shoots: watch him fight
  for (let s = 0; s < 60 * 25; s++) {
    if (w.phase === 'levelup') { w.choose(0); continue; }
    if (w.phase === 'chest') { w.closeChest(); continue; }
    w.update(1 / 60, { x: 0, y: 0 });
  }
  const seen = new Set(boss.ai.history);
  assert.ok(seen.has('snipe') && seen.has('dash'), [...seen].join());
});
