// Balance guards from review round 1. A strong bot plays the career once; 메시 is then fought from that save.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');
const simCareer = require('./career-sim.js');

const LAST = RS.YEARS.length - 1;
// Round 8: the career guards (a bot plays a whole career without 훈련장 upgrades) run on 이지. The old single curve
// sits between 이지 and 노멀; on 노멀 such a bot is meant to hit the mid-career wall (tests/round8.test.js checks
// that 노멀 is cleared with the 훈련장). The single-season tests below stay on 노멀, the default.
const onEasy = (fn) => { const prev = RS.DIFF; RS.setDiff('easy'); try { return fn(); } finally { RS.setDiff(prev); } };
let career = null;
function getCareer() {
  if (!career) career = onEasy(() => simCareer({ seed: 7, to: LAST - 1 }));
  return career;
}

function messiRun(save0, seed, bot) {
  const save = JSON.parse(JSON.stringify(save0));
  const rng = RS.makeRng(seed);
  if (RS.needsCoach(save, LAST)) RS.applyCoach(save, LAST, RS.coachChoices(save, LAST, rng)[0], rng);
  RS.autoTransfers(save, LAST, rng);
  const w = RS.startYear(save, LAST, { seed }); // the final itself is played on 노멀, the default
  w.t = w.stageTime - 25; // skip most of the warm-up; the crowd still ramps in before 메시
  for (const ev of w.schedule) if (ev.t < w.t) ev.done = true; // skipped time does not fire all its waves at once
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

test('standing still no longer clears: a motionless player dies before the boss from 2005 on', () => {
  for (const idx of [3, 10]) {
    const w = new RS.World({ yearIdx: idx, seed: 4 });
    while (w.phase !== 'dead' && w.t < w.stageTime) {
      if (w.phase === 'levelup') { w.choose(0); continue; }
      if (w.phase === 'chest') { w.closeChest(); continue; }
      w.update(1 / 60, { x: 0, y: 0 });
    }
    assert.equal(w.phase, 'dead', RS.YEARS[idx].year + ': survived motionless until ' + w.t.toFixed(0) + ' s');
  }
});

test('준보스 AI: approaches, telegraphs a charge, then charges', () => {
  const w = new RS.World({ yearIdx: 5, seed: 2 });
  w.debug.godMode = true;
  w.build.skillOrder = []; w.build.skills = {}; // nobody shoots: watch the AI
  const m = w.spawnEnemy('brute', w.player.x + 80, w.player.y, { mini: true });
  let tele = false, charged = false, slam = false;
  for (let i = 0; i < 60 * 12; i++) {
    w.update(1 / 60, { x: 0, y: 0 });
    if (m.tele && m.tele.kind === 'line') tele = true;
    if (m.tele && m.tele.kind === 'circles') slam = true;
    if (m.charging) charged = true;
  }
  assert.ok(m.mini && m.maxHp > RS.ENEMIES.brute.hp, 'scaled 준보스 HP');
  assert.ok(tele && charged, 'telegraphed charge');
  assert.ok(slam, 'ground slam telegraph');
});

test('준보스 waves spawn in numbers and drop rewards when killed', () => onEasy(() => {
  // the same difficulty as the career that made this build
  const w = new RS.World({ yearIdx: 20, seed: 2, build: getCareer().save.career.snapshots[20] });
  w.debug.godMode = true;
  let minis = 0, miniKill = false;
  for (let i = 0; i < 60 * 60 && !miniKill; i++) {
    if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices, w.build)); continue; }
    if (w.phase === 'chest') { w.closeChest(); continue; }
    if (w.phase === 'swap') { w.chooseSwap(0); continue; }
    w.update(1 / 60, RS.botInput(w));
    minis = Math.max(minis, w.enemies.filter((x) => x.alive && x.mini).length);
    if (w.events.some((ev) => ev.type === 'miniKill')) miniKill = true;
    w.events.length = 0;
  }
  assert.ok(minis >= 2 || miniKill, 'several 준보스 in 2022 (' + minis + ') or one already killed');
  assert.ok(miniKill, 'a 준보스 died and announced its reward');
}));

test('the manual slide is invulnerable, has a cooldown and a shorter one for 메시', () => {
  const w = new RS.World({ yearIdx: 2, seed: 1 });
  assert.equal(w.slideCooldown(), RS.SLIDE.cd.ronaldo);
  assert.equal(w.slide(), true);
  assert.ok(w.player.dash && w.player.dash.slide);
  const hp = w.player.hp;
  w.hurtPlayer(50, null); // ignored while sliding
  assert.equal(w.player.hp, hp);
  assert.equal(w.slide(), false, 'no double slide');
  for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, { x: 0, y: 0 });
  assert.equal(w.player.slideCd, 0);
  const m = new RS.World({ yearIdx: 2, seed: 1, hero: 'messi' });
  assert.equal(m.slideCooldown(), RS.SLIDE.cd.messi);
});

test('strong bot clears every career year before the final', () => {
  const c = getCareer();
  assert.equal(c.stoppedAt, null);
  assert.equal(c.save.career.yearIdx, LAST);
});

test('season boss fights are short but real (≈12-45 s) after the one-minute stage', () => {
  const fights = getCareer().years.filter((y) => y.phase === 'clear').map((y) => y.bossT);
  const sorted = fights.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median >= 12 && median <= 45, 'median boss fight ' + median.toFixed(1) + ' s');
  for (const f of fights) assert.ok(f >= 5 && f <= 90, 'boss fight ' + f.toFixed(1) + ' s');
  const inBand = fights.filter((f) => f >= 8 && f <= 60).length;
  assert.ok(inBand / fights.length >= 0.75, inBand + '/' + fights.length + ' fights in 8-60 s');
});

test('a season (stage + boss) fits in about two minutes', () => {
  const years = getCareer().years.filter((y) => y.phase === 'clear');
  for (const y of years) assert.ok(y.t >= 60 && y.t <= 140, RS.YEARS[y.idx].year + ' took ' + y.t.toFixed(0) + ' s');
});

test('enemies spawned late in a stage are tougher than early ones (visible tier)', () => {
  const w = new RS.World({ yearIdx: 3, seed: 9 });
  const early = w.spawnEnemy('grunt', 300, 0);
  w.t = w.stageTime; // end of the minute
  const late = w.spawnEnemy('grunt', 300, 0);
  assert.ok(late.maxHp > early.maxHp && late.dmg >= early.dmg && late.speed > early.speed * 1.02);
  assert.equal(early.tier, 0);
  assert.equal(late.tier, 2);
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
