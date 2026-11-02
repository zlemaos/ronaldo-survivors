// Balance guards from review round 1. A strong bot plays the career once; 메시 is then fought from that save.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');

const LAST = RS.YEARS.length - 1;
let career = null;
function getCareer() {
  if (!career) career = simCareer({ seed: 7, to: LAST - 1 });
  return career;
}

function messiRun(save0, seed, bot) {
  const save = JSON.parse(JSON.stringify(save0));
  const rng = RS.makeRng(seed);
  if (RS.needsCoach(save, LAST)) RS.applyCoach(save, LAST, RS.coachChoices(save, LAST, rng)[0], rng);
  RS.autoTransfers(save, LAST, rng);
  const w = RS.startYear(save, LAST, { seed });
  w.t = w.stageTime - 25; // skip most of the warm-up; the crowd still ramps in before 메시
  while (w.t < 900) {
    if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices, w.build)); continue; }
    if (w.phase === 'chest') { w.closeChest(); continue; }
    if (w.phase === 'swap') { w.chooseSwap(0); continue; }
    if (w.phase !== 'play') break;
    w.update(1 / 60, bot(w));
  }
  return w;
}

test('a player who barely moves survives the first 45 s of 2002', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = new RS.World({ yearIdx: 0, seed });
    while (w.phase !== 'dead' && w.t < 45) {
      if (w.phase === 'levelup') { w.choose(0); continue; }
      if (w.phase === 'chest') { w.closeChest(); continue; }
      w.update(1 / 60, { x: 0, y: 0 });
    }
    assert.notEqual(w.phase, 'dead', 'seed ' + seed + ' died at ' + w.t.toFixed(1) + ' s');
  }
});

test('strong bot clears every career year before the final', () => {
  const c = getCareer();
  assert.equal(c.stoppedAt, null);
  assert.equal(c.save.career.yearIdx, LAST);
});

test('season boss fights last a real fight (≈30-90 s) in every era', () => {
  const fights = getCareer().years.filter((y) => y.phase === 'clear').map((y) => y.bossT);
  const sorted = fights.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median >= 28 && median <= 90, 'median boss fight ' + median.toFixed(1) + ' s');
  for (const f of fights) assert.ok(f >= 8 && f <= 150, 'boss fight ' + f.toFixed(1) + ' s');
  const inBand = fights.filter((f) => f >= 20 && f <= 100).length;
  assert.ok(inBand / fights.length >= 0.75, inBand + '/' + fights.length + ' fights in 20-100 s');
});

test('early season bosses can land hits on a perfect kiter', () => {
  const early = getCareer().years.filter((y) => y.idx <= 5 && y.phase === 'clear');
  const hitters = early.filter((y) => y.bossDmgTaken > 0).length;
  assert.ok(hitters >= 2, hitters + ' of the first 6 season bosses dealt damage');
});

test('every owned skill ends the career evolved', () => {
  const b = getCareer().save.career.build;
  for (const id of b.skillOrder) assert.equal(b.evolved[id], true, id + ' not evolved');
});

test('메시 takes the strong bot below half HP at least once', () => {
  const save = getCareer().save;
  let below = 0, wins = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = messiRun(save, seed, RS.botInput);
    if (w.minHp < w.stats.maxHp / 2) below++;
    if (w.phase === 'victory') wins++;
  }
  assert.ok(below >= 1, 'below half in ' + below + '/4');
  assert.ok(wins >= 2, 'strong bot still beats 메시 most of the time: ' + wins + '/4');
});

test('a weaker bot (reaction delay + aim noise) sometimes loses to 메시 without meta upgrades', () => {
  const save = getCareer().save;
  assert.deepEqual(save.meta.upgrades, {});
  let losses = 0, wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = messiRun(save, seed, RS.makeBot(Object.assign({ seed }, RS.WEAK_BOT)));
    if (w.phase === 'dead') losses++;
    if (w.phase === 'victory') wins++;
  }
  assert.ok(losses >= 1, 'weak bot losses ' + losses + '/6');
  assert.ok(wins >= 1, 'weak bot wins ' + wins + '/6 (hard but fair)');
});
