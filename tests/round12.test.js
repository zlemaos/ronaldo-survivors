const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const RS = require('./load.js');

// A screenshot taken after round 11 went live still showed round 10's HUD: a phone ran files of an older build.
// The page loads the game from src/; js/ and css/ keep round 11's files for pages a phone cached before round 12.
test('every file the page loads is named and stamped with one build, so a page that mixed two builds can tell', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(/<meta name="build" content="([^"]+)"/.exec(html)[1], RS.VERSION);
  assert.ok(!/(?:src|href)="(?:js|css)\//.test(html), 'nothing from the round-11 copies in js/ and css/');
  const refs = [...html.matchAll(/(?:src|href)="(src\/(?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 15, 'scripts and the stylesheet: ' + refs.length);
  for (const ref of refs) {
    const [file, v] = ref.split('?v=');
    assert.equal(v, RS.VERSION, ref);
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const stamp = file.endsWith('.css') ? /--build:\s*"([^"]+)"/.exec(src)
      : new RegExp('\\(globalThis\\.RS_FILES = globalThis\\.RS_FILES \\|\\| \\{\\}\\)\\.' + path.basename(file, '.js') + " = '([^']+)'").exec(src);
    assert.equal(stamp && stamp[1], RS.VERSION, file + ' stamps its build');
  }
});

test('a rising 드롭볼 lets go of a man who leaves the screen and lands where he was last seen; a boss it follows', () => {
  const K = RS.CROWD, trickle = K.trickle;
  K.trickle = 0; // only the man placed here
  try {
    for (const boss of [false, true]) {
      const b0 = RS.newBuild('messi');
      b0.weapon = { id: 'dropball', g: 0, p: 1 };
      const w = new RS.World({ yearIdx: 2, seed: 1, hero: 'messi', build: b0, view: { w: 147, h: 317 } });
      for (const ev of w.schedule) ev.done = true;
      w.packT = 1e9;
      const e = w.spawnEnemy('tank', 0, 40);
      e.speed = 0; e.hp = e.maxHp = 1e6;
      if (boss) { // the season boss's own AI, never attacking here
        e.boss = true;
        e.ai = { kind: w.yearDef.boss.type, cool: 1e9, act: null, last: null, phase: 1, keep: 0, strafe: 1, history: [] };
      }
      let drop = null;
      for (let i = 0; i < 600 && !drop; i++) {
        w.update(1 / 60, { x: 0, y: 0 });
        drop = w.drops.find((d) => d.st === 'rise' && d.tg === e);
      }
      assert.ok(drop, 'a drop rose for the man');
      const seen = [drop.tx, drop.ty];
      e.x = e.px = 120; // off the side of a portrait phone
      w.update(1 / 60, { x: 0, y: 0 });
      if (boss) { assert.equal(drop.tg, e); assert.equal(drop.tx, 120); }
      else { assert.equal(drop.tg, null); assert.deepEqual([drop.tx, drop.ty], seen); }
    }
  } finally { K.trickle = trickle; }
});

test('teammates, homing and bouncing balls and 드리볼 also pick only men in sight', () => {
  const w = new RS.World({ yearIdx: 2, seed: 1, view: { w: 147, h: 317 } });
  w.spawnEnemy('tank', 90, 0).speed = 0; // off the side of a portrait phone
  w.update(1 / 60, { x: 0, y: 0 }); // the grid is rebuilt in the step
  assert.equal(w.nearestFrom(0, 0, 200), null);
  assert.equal(w.dribTarget({ x: 0, y: 0 }, 200), null);
  const seen = w.spawnEnemy('tank', 0, 60); seen.speed = 0;
  w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.nearestFrom(0, 0, 200), seen);
  assert.equal(w.dribTarget({ x: 0, y: 0 }, 200), seen);
});

// On a portrait phone (147 × 317 game pixels) two hits in three went to men out of sight: an empty-looking pitch.
test('on a narrow phone the hero shoots the man he can see, not a nearer one off the side of the screen', () => {
  const w = new RS.World({ yearIdx: 2, seed: 1, view: { w: 147, h: 317 } }); w.debug.godMode = true;
  const side = w.spawnEnemy('tank', 100, 0), seen = w.spawnEnemy('tank', 0, 120);
  side.speed = seen.speed = 0;
  for (let i = 0; i < 120; i++) w.update(1 / 60, { x: 0, y: 0 });
  assert.ok(seen.hp < seen.maxHp, 'the man on screen is hit');
  assert.equal(side.hp, side.maxHp, 'the nearer man off screen is left alone');
});

function step(w, input) {
  if (w.phase === 'levelup') w.choose(RS.botChoose(w.choices, w.build));
  else if (w.phase === 'chest') w.closeChest();
  else if (w.phase === 'swap') w.chooseSwap(w.swapChoices.length - 1);
  else w.update(1 / 60, input);
}

// The share is taken over the crowd (World.updateSpawns: trickle, packs, round 13.1's floor). Scripted waves place
// their men on purpose, each formation from a random side: counted in, two formations more or less turned toward the
// runner moved the share from 0.18 to 0.44 when round 13.1's floor drew a few more random numbers (event men ahead:
// 21 → 65 of 102; floor men ahead: 0 of 6).
test('running away meets no pack ahead: new men ahead of a runner are only the thin trickle', () => {
  let ahead = 0, crowd = 0, all = 0;
  for (const seed of [1, 2, 3]) {
    const w = new RS.World({ yearIdx: 7, seed }); w.debug.godMode = true;
    const spawn = w.spawnEnemy.bind(w), spawns = w.updateSpawns.bind(w);
    let inCrowd = false;
    w.updateSpawns = (dt) => { inCrowd = true; try { return spawns(dt); } finally { inCrowd = false; } };
    w.spawnEnemy = (type, x, y, opt) => {
      if (w.phase === 'play' && !w.bossSpawned) { // within 60° of the heading (+x)
        all++;
        if (inCrowd) { crowd++; if (x - w.player.x > 0 && Math.abs(y - w.player.y) < (x - w.player.x) * Math.tan(Math.PI / 3)) ahead++; }
      }
      return spawn(type, x, y, opt);
    };
    while (w.t < 50 && !w.bossSpawned) step(w, { x: 1, y: 0 });
  }
  assert.ok(all > 60, 'the season still has a crowd: ' + all);
  assert.ok(ahead / crowd < 0.3, 'share of the crowd spawned ahead of the runner: ' + (ahead / crowd).toFixed(2));
});

// Measured 55° off the heading (the game keeps them past 60°): the hero moves a little within the step.
test('no pack man and no recycled straggler is ever put ahead of a runner', () => {
  const K = RS.CROWD, trickle = K.trickle, tan = Math.tan(55 * Math.PI / 180);
  const ahead = (p, x, y) => x - p.x > 0 && Math.abs(y - p.y) < (x - p.x) * tan;
  K.trickle = 0; // packs and recycling only
  try {
    let packMen = 0, recycled = 0, bad = 0;
    for (const seed of [1, 2, 3, 4]) {
      const w = new RS.World({ yearIdx: 7, seed }); w.debug.godMode = true;
      for (const ev of w.schedule) ev.done = true; // no scripted waves: they place men on purpose
      const spawn = w.spawnEnemy.bind(w);
      w.spawnEnemy = (type, x, y, opt) => { packMen++; if (ahead(w.player, x, y)) bad++; return spawn(type, x, y, opt); };
      while (w.t < 50) {
        const was = w.enemies.map((e) => [e, e.x, e.y]);
        step(w, { x: 1, y: 0 });
        for (const [e, x, y] of was) {
          if (e.alive && Math.hypot(e.x - x, e.y - y) > 60) { recycled++; if (ahead(w.player, e.x, e.y)) bad++; }
        }
      }
    }
    assert.ok(packMen > 30, 'pack men: ' + packMen);
    assert.ok(recycled > 10, 'recycled stragglers: ' + recycled);
    assert.equal(bad, 0, 'men put ahead of the runner');
  } finally { K.trickle = trickle; }
});

test('a slide with 불꽃 질주 leaves a burning carpet along its whole path', () => {
  const b = RS.newBuild('ronaldo'); b.weapon = { id: 'trail', g: 0, p: 1 };
  const w = new RS.World({ yearIdx: 0, seed: 1, build: b }); w.debug.godMode = true;
  w.update(1 / 60, { x: 1, y: 0 });
  w.zones.length = 0;
  const x0 = w.player.x;
  assert.ok(w.slide());
  while (w.player.dash) w.update(1 / 60, { x: 1, y: 0 });
  const xs = w.zones.map((z) => z.x);
  assert.ok(xs.length >= 4, 'burning patches: ' + xs.length);
  assert.ok(Math.max(...xs) - Math.min(...xs) > (w.player.x - x0) * 0.6, 'the carpet spans the slide');
});
