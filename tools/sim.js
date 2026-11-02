// Balance tool: plays the career with the bot. Usage: node tools/sim.js [fromIdx] [toIdx] [seed]
const RS = require('../tests/load.js');
const from = +(process.argv[2] || 0), to = +(process.argv[3] || RS.YEARS.length - 1), seed = +(process.argv[4] || 7);
const store = RS.makeStorage(null);
const save = RS.newSave();
const rng = RS.makeRng(seed);
const dt = 1 / 60;
function play(idx, tries) {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (RS.needsCoach(save, idx)) RS.applyCoach(save, idx, RS.coachChoices(save, idx, rng)[0], rng);
    const w = RS.startYear(save, idx, { seed: seed * 100 + idx * 7 + attempt });
    let bossT = 0; const t0 = Date.now();
    while (w.t < 900) {
      if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices)); continue; }
      if (w.phase === 'chest') { w.closeChest(); continue; }
      if (w.phase !== 'play') break;
      w.update(dt, RS.botInput(w));
      if (w.bossSpawned) bossT += dt;
    }
    const r = RS.finishYear(save, w);
    const b = w.build;
    console.log(`${RS.YEARS[idx].year} try${attempt} ${w.phase.padEnd(7)} t=${w.t.toFixed(0)} boss=${bossT.toFixed(0)}s hp=${Math.round(w.player.hp)}/${w.stats.maxHp} lv=${b.level} kills=${w.kills} coins=${r.coins} dps=${(w.dmgDealt / w.t).toFixed(0)} skills=${b.skillOrder.map(s => s + b.skills[s] + (b.evolved[s] ? '*' : '')).join(',')} mates=${b.teammates.map(m => m.id + m.lv).join(',')} ms=${Date.now() - t0}`);
    if (r.cleared) return true;
  }
  return false;
}
for (let i = from; i <= to; i++) {
  if (from > 0 && i === from) { /* jump: give an auto build */ }
  if (!play(i, 3)) { console.log('STOPPED at', RS.YEARS[i].year); break; }
}
console.log('meta', JSON.stringify(save.meta));
