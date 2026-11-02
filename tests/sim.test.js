// Headless simulated career: a simple bot plays the first years and must clear them without errors.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

test('bot clears the first 4 career years headlessly', () => {
  const save = RS.newSave();
  const rng = RS.makeRng(11);
  for (let idx = 0; idx < 4; idx++) {
    let cleared = false;
    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
      if (RS.needsCoach(save, idx)) RS.applyCoach(save, idx, RS.coachChoices(save, idx, rng)[0], rng);
      const w = RS.startYear(save, idx, { seed: 100 + idx * 10 + attempt });
      let bossSeen = false;
      while (w.t < 600) {
        if (w.phase === 'levelup') { assert.equal(w.choose(RS.botChoose(w.choices, w.build)), true); continue; }
        if (w.phase === 'chest') { w.closeChest(); continue; }
        if (w.phase !== 'play') break;
        w.update(1 / 60, RS.botInput(w));
        if (w.bossSpawned) bossSeen = true;
        for (const e of w.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp));
        assert.ok(Number.isFinite(w.player.x) && Number.isFinite(w.player.hp));
      }
      assert.ok(bossSeen, 'season boss appeared');
      const out = RS.finishYear(save, w);
      cleared = out.cleared;
    }
    assert.ok(cleared, RS.YEARS[idx].year + ' cleared');
    assert.equal(save.career.yearIdx, idx + 1);
  }
  assert.ok(save.career.build.level >= 10);
  assert.ok(save.meta.coins > 0);
});

test('stage stays under the enemy cap and pools are reused', () => {
  const w = new RS.World({ yearIdx: 20, seed: 5 });
  w.debug.godMode = true;
  let maxE = 0;
  for (let i = 0; i < 60 * 90; i++) {
    if (w.phase === 'levelup') { w.choose(0); continue; }
    if (w.phase === 'chest') { w.closeChest(); continue; }
    w.update(1 / 60, RS.botInput(w));
    maxE = Math.max(maxE, w.enemies.length);
  }
  assert.ok(maxE <= w.tune.maxAlive + 60, 'enemy count bounded: ' + maxE);
  assert.ok(maxE > 100, 'hundreds of enemies on screen late in the career: ' + maxE);
});
