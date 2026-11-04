const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// 하드 = about twice 노멀's ordinary crowd at the same moment of the same season: trickle, packs, the minimum-men
// floor and the alive cap alike (RS.DIFFS.crowd). Scripted waves and bosses are not part of it.
function crowdRun(diff, yearIdx, seed, until) {
  const was = RS.DIFF;
  RS.setDiff(diff);
  try {
    const w = new RS.World({ yearIdx, seed }); w.debug.godMode = true;
    for (const ev of w.schedule) ev.done = true; // only the crowd (World.updateSpawns)
    const spawn = w.spawnEnemy.bind(w);
    let spawns = 0;
    w.spawnEnemy = (type, x, y, opt) => { const e = spawn(type, x, y, opt); spawns++; e.hp = e.maxHp = 1e9; return e; }; // nobody leaves
    let sum = 0, n = 0;
    while (w.t < until(w) && !w.bossSpawned) {
      if (w.phase === 'levelup') w.choose(RS.botChoose(w.choices, w.build));
      else if (w.phase === 'chest') w.closeChest();
      else if (w.phase === 'swap') w.chooseSwap(w.swapChoices.length - 1);
      else {
        w.update(1 / 60, RS.botInput(w));
        let c = 0;
        for (const e of w.enemies) if (e.alive && !e.boss) c++;
        sum += c; n++;
      }
    }
    return { spawns, alive: sum / n, cap: w.tune.maxAlive };
  } finally { RS.setDiff(was); }
}

test('하드 fields twice 노멀\'s trickle, packs, floor and cap; 이지 and 노멀 keep their numbers', () => {
  const was = RS.DIFF;
  try {
    for (const yearIdx of [0, 1, 3, 6, 9, 12]) {
      const t = {};
      for (const d of ['easy', 'normal', 'hard']) { RS.setDiff(d); t[d] = RS.yearTuning(yearIdx); }
      assert.ok(Math.abs(t.hard.spawnRate / t.normal.spawnRate - 2) < 1e-9, 'trickle ×2 in season ' + yearIdx);
      assert.equal(t.hard.maxAlive, t.normal.maxAlive * 2, 'cap ×2 in season ' + yearIdx);
      assert.equal(t.hard.crowd, 2 * t.normal.crowd, 'packs and floor ×2');
      assert.equal(t.normal.crowd, 1);
      assert.equal(t.easy.crowd, 1);
      assert.equal(t.easy.maxAlive, t.normal.maxAlive, 'the cap is the same on 이지 and 노멀');
    }
  } finally { RS.setDiff(was); }
});

test('over a stage the crowd on 하드 is about twice 노멀\'s: men sent in early and men standing on the pitch', () => {
  for (const yearIdx of [3, 8]) {
    let early = [0, 0], alive = [0, 0];
    for (const seed of [1, 2, 3]) {
      ['normal', 'hard'].forEach((d, i) => {
        early[i] += crowdRun(d, yearIdx, seed, () => 12).spawns; // before the cap is reached
        alive[i] += crowdRun(d, yearIdx, seed, (w) => w.stageTime - 1).alive;
      });
    }
    const re = early[1] / early[0], ra = alive[1] / alive[0];
    assert.ok(re > 1.7 && re < 2.4, 'season ' + yearIdx + ' spawns in the first 12 s, 하드 / 노멀: ' + re.toFixed(2));
    assert.ok(ra > 1.8 && ra < 2.2, 'season ' + yearIdx + ' average men alive, 하드 / 노멀: ' + ra.toFixed(2));
  }
});
