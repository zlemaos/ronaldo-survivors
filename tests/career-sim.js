// Shared career simulation (tools/sim.js and tests). Plays years with a bot, records per-year stats.
const RS = require('./load.js');
module.exports = function simCareer(opt) {
  opt = opt || {};
  const seed = opt.seed || 7;
  const to = opt.to != null ? opt.to : RS.YEARS.length - 1;
  const save = opt.save || RS.newSave();
  const rng = RS.makeRng(seed);
  const years = [];
  let stoppedAt = null;
  for (let idx = 0; idx <= to; idx++) {
    let cleared = false;
    for (let attempt = 0; attempt < (opt.tries || 3) && !cleared; attempt++) {
      // story events: the first card unless opt.events names another ({ hgh: 1 } = 하드 모드)
      if (RS.needsEvent(save, idx)) { const ev = RS.YEARS[idx].event; RS.applyEvent(save, idx, RS.eventChoices(save, idx)[(opt.events && opt.events[ev]) || 0]); }
      if (RS.needsCoach(save, idx)) RS.applyCoach(save, idx, RS.coachChoices(save, idx, rng)[0], rng);
      RS.autoTransfers(save, idx, rng);
      const w = RS.startYear(save, idx, { seed: seed * 100 + idx * 7 + attempt });
      const bot = opt.weak ? RS.makeBot(Object.assign({ seed: seed + idx }, RS.WEAK_BOT)) : RS.botInput;
      const t0 = Date.now();
      while (w.t < 900) {
        if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices, w.build)); continue; }
        if (w.phase === 'chest') { w.closeChest(); continue; }
        if (w.phase === 'swap') { w.chooseSwap(0); continue; }
        if (w.phase !== 'play') break;
        w.update(1 / 60, bot(w));
      }
      const r = RS.finishYear(save, w);
      const b = w.build;
      const y = { idx, year: RS.YEARS[idx].year, attempt, phase: w.phase, t: w.t, bossT: w.bossT, bossHp: w.boss ? w.boss.maxHp : 0,
        minHp: Math.min(w.minHp, w.stats.maxHp), maxHp: w.stats.maxHp, hits: w.hits, bossDmgTaken: w.bossDmgTaken, dmgTaken: w.dmgTaken,
        level: b.level, kills: w.kills, dps: w.dmgDealt / Math.max(1, w.t), coins: r.coins,
        skills: b.skillOrder.map((s) => s + b.skills[s] + (b.evolved[s] ? '*' : '')).join(','),
        mates: b.teammates.map((m) => m.id + m.lv).join(','), ms: Date.now() - t0 };
      years.push(y);
      if (opt.log) console.log(`${y.year} try${attempt} ${y.phase.padEnd(7)} t=${y.t.toFixed(0)} boss=${y.bossT.toFixed(0)}s minHp=${Math.round(y.minHp)}/${y.maxHp} hits=${y.hits} bossDmg=${y.bossDmgTaken} lv=${y.level} dps=${y.dps.toFixed(0)} skills=${y.skills} mates=${y.mates}`);
      cleared = r.cleared;
    }
    if (!cleared) { stoppedAt = idx; break; }
  }
  return { save, years, stoppedAt };
};
