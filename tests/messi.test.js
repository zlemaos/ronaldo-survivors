const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const LAST = RS.YEARS.length - 1;

function messiWorld(seed) {
  const w = new RS.World({ yearIdx: LAST, seed: seed || 1 });
  w.debug.godMode = true;
  w.build.skillOrder = []; w.build.skills = {}; // nobody shoots: isolate the boss AI
  const m = w.spawnBoss();
  return { w, m };
}
function run(w, sec, cb) {
  for (let i = 0; i < sec * 60; i++) {
    if (w.phase === 'levelup') w.choose(0);
    if (w.phase === 'chest') w.closeChest();
    w.update(1 / 60, { x: 0, y: 0 });
    if (cb) cb(i);
  }
}

test('메시 is the final boss of the last year', () => {
  const { w, m } = messiWorld();
  assert.equal(m.name, '메시');
  assert.equal(m.ai.kind, 'messi');
  assert.ok(w.events.some((e) => e.type === 'boss' && e.final));
});

test('phase 1 uses dribble dashes, curling shots and the left-foot volley', () => {
  const { w, m } = messiWorld(2);
  let teleSeen = false, curved = false;
  run(w, 30, () => {
    if (m.tele && m.tele.kind === 'line') teleSeen = true;
    if (w.eprojs.some((p) => p.curve)) curved = true;
  });
  const seen = new Set(m.ai.history);
  assert.ok(seen.has('dribble') && seen.has('curl') && seen.has('volley'), [...seen].join());
  assert.ok(teleSeen, 'dashes are telegraphed');
  assert.ok(curved, 'curling shots curve');
  assert.equal(m.ai.phase, 1);
});

test('at 50% HP 메시 roars (brief invulnerability) and enters phase 2 rage', () => {
  const { w, m } = messiWorld(3);
  const sp = m.speed;
  m.hp = Math.floor(m.maxHp * 0.5);
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(m.ai.phase, 2);
  assert.equal(m.invuln, true);
  assert.ok(w.events.some((e) => e.type === 'rage'));
  const hp = m.hp;
  w.damageEnemy(m, 1000);
  assert.equal(m.hp, hp, 'invulnerable during the roar');
  run(w, 2);
  assert.equal(m.invuln, false);
  assert.ok(m.speed > sp, 'faster in phase 2');
  m.ai.history = [];
  run(w, 30);
  const seen = new Set(m.ai.history);
  assert.ok(seen.has('dribble3') || seen.has('volley2'), [...seen].join());
  assert.ok(!seen.has('dribble') && !seen.has('volley'), 'phase-2 moves replace phase-1 ones');
});

test('messi attacks hurt the player (fair: telegraphed, not instant)', () => {
  const { w, m } = messiWorld(4);
  w.debug.godMode = false;
  const hp0 = w.player.hp;
  run(w, 0.5);
  assert.equal(w.player.hp, hp0, 'no damage in the first half second');
  let hurt = false;
  for (let i = 0; i < 60 * 40 && !hurt; i++) { w.update(1 / 60, { x: 0, y: 0 }); if (w.player.hp < hp0) hurt = true; if (w.phase === 'levelup') w.choose(0); }
  assert.ok(hurt, 'standing still against 메시 gets punished');
});

test('killing 메시 wins the game with a SIUU', () => {
  const { w, m } = messiWorld(5);
  m.hp = 1;
  m.ai.phase = 2;
  w.damageEnemy(m, 100);
  assert.equal(w.phase, 'victory');
  assert.ok(w.events.some((e) => e.type === 'victory'));
  assert.ok(w.events.some((e) => e.type === 'siuu'));
});
