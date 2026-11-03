// Round 7: 메시 plays like 메시 (passes from 챠비 / 니에미스타, old saves converted), teammate OVR grades, and the
// mid-career wall with 고난의 시즌, 첼씨 and 드록빠.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

const withHero = (hero, fn) => { RS.selectHero(hero); try { return fn(); } finally { RS.selectHero('ronaldo'); } };

test('an old 메시 save converts 날두 moves into compatible weapons', () => {
  const b = RS.newBuild('messi');
  delete b.weapon; delete b.armory;
  b.skills = { orbit: 6, header: 6, bicycle: 3, kick: 2 }; b.skillOrder = ['orbit', 'header', 'bicycle', 'kick'];
  b.evolved = { orbit: 'count', header: true };
  b.passives = { jump: 3, boots: 2 }; b.passiveOrder = ['jump', 'boots'];
  b.relics = { honaldo: 1 }; b.relicOrder = ['honaldo'];
  const n = RS.normalizeBuild(b);
  assert.equal(n.skillOrder.length, 1);
  assert.deepEqual([n.weapon, ...n.armory].map(w => w.id).sort(), ['chip', 'elastico', 'orbit', 'tiki']);
  assert.ok([n.weapon, ...n.armory].some(w => w.id === 'chip' && w.g === 4));
  assert.ok(n.skillOrder.every((id) => RS.skillFor(id, 'messi')));
  assert.ok(n.passiveOrder.length === 2 && n.passiveOrder.every((id) => RS.passiveFor(id, 'messi')));
  assert.deepEqual(n.relicOrder, ['messia']);
});

// Round 8: no extra runners — the pass comes from a teammate on the pitch, else long from off the screen.
test('메시 never shoots himself: 챠비 on the pitch plays the 티키타카 pass, else a long ball from off the screen', () => withHero('messi', () => {
  const firstPass = (withXavi) => {
    const b = RS.newBuild('messi');
    b.weapon = { id: 'tiki', g: 0, p: 1 }; RS.syncWeapon(b);
    if (withXavi) RS.addMate(b, 'xavino');
    const w = new RS.World({ yearIdx: 8, seed: 3, build: b });
    w.debug.godMode = true;
    const shots = [];
    const spawn = w.spawnProj.bind(w);
    w.spawnProj = (kind, x, y, a, sp, o) => {
      if (kind === 'tiki') { const m = w.mates.find((q) => q.id === 'xavino'); shots.push({ x, y, mx: m && m.x, my: m && m.y, px: w.player.x, dmg: o.dmg }); }
      return spawn(kind, x, y, a, sp, o);
    };
    w.spawnEnemy('grunt', w.player.x + 70, w.player.y);
    for (let i = 0; i < 240 && !shots.length; i++) {
      if (w.phase === 'levelup') { w.choose(0); continue; }
      w.update(1 / 60, { x: 0, y: 0 });
    }
    return { w, s: shots[0] };
  };
  const a = firstPass(true), b = firstPass(false);
  assert.ok(a.s && b.s, 'the pass was played');
  assert.ok(a.s.x === a.s.mx && a.s.y === a.s.my, 'played from 챠비 on the pitch');
  assert.equal(a.w.mates.length, 1, 'nobody else runs on');
  assert.equal(b.w.mates.length, 0);
  assert.ok(Math.abs(b.s.x - b.s.px) > b.w.view.w / 2, 'alone, the ball comes long from off the screen, not from 메시');
  assert.ok(a.s.dmg > b.s.dmg, '챠비 playing his own pass hits harder');
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
  for (const k of ['hpMul', 'dmgMul', 'bossDmgMul', 'bossFight']) assert.ok(hard[k] > plain[k], k);
  assert.ok(hard.poise < plain.poise);
});

test('첼씨: the crowd wears blue, the 버스 sweeps in three times, and 드록빠 is the season boss', () => {
  const i = RS.YEARS.findIndex((y) => y.boss.type === 'drogba');
  assert.ok(i > 0 && RS.YEARS[i].foe === 'chelsea');
  assert.deepEqual(RS.foeColors(i), RS.FOES.chelsea.kit);
  const w = new RS.World({ yearIdx: i, seed: 2 });
  w.debug.godMode = true;
  assert.ok(w.schedule.some((e) => e.kind === 'bus'));
  w.runScheduled('bus');
  const bus = w.enemies.filter((e) => e.alive && e.type === 'tank' && (e.lineVx || e.lineVy));
  assert.ok(bus.length > 0, 'the bus brings heavy defenders');
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
