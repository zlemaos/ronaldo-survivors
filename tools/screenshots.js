// Captures phone + desktop screenshots into docs/screenshots and fails on console errors.
// Usage: node tools/screenshots.js   (needs Playwright + Chromium)
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'index.html');
const out = (n) => path.join(__dirname, '..', 'docs', 'screenshots', n + '.png');

async function setup(page, opts) {
  // A mid-career save so screens have content.
  await page.evaluate((o) => {
    const save = RS.newSave();
    const rng = RS.makeRng(4);
    for (let i = 0; i < o.year; i++) {
      RS.applyCoach(save, i, RS.coachChoices(save, i, rng)[0], rng);
      RS.autoTransfers(save, i, rng);
      const w = RS.startYear(save, i, { seed: i });
      let guard = 0;
      while (w.phase !== 'clear' && guard++ < 60 * 400) {
        if (w.phase === 'levelup') { w.choose(RS.botChoose(w.choices, w.build)); continue; }
        if (w.phase === 'chest') { w.closeChest(); continue; }
        if (w.phase === 'swap') { w.chooseSwap(0); continue; }
        if (w.phase === 'dead') { w.phase = 'clear'; break; }
        w.debug.godMode = true;
        w.update(1 / 60, RS.botInput(w));
      }
      w.phase = 'clear';
      RS.finishYear(save, w);
    }
    save.meta.coins += 900; save.meta.ballons = Math.max(save.meta.ballons, 1);
    RSApp.save = save; RSApp.persist(); RSApp.showTitle();
  }, opts);
}
async function botDrive(page) {
  await page.evaluate(() => {
    clearInterval(window.__bot);
    window.__bot = setInterval(() => {
      const A = RSApp, w = A.world; if (!w) return;
      if (w.phase === 'levelup' && A.lvShown && !window.__keepLv) { const c = document.querySelector('#lv-cards .card'); if (c) { w.choose(RS.botChoose(w.choices, w.build)); document.getElementById('levelup').classList.add('hidden'); A.lvShown = false; } }
      if (w.phase === 'chest') { document.getElementById('btn-chest-ok').click(); }
      if (w.phase === 'swap' && A.swapShown && !window.__keepLv) { w.chooseSwap(w.swapChoices.length - 1); document.getElementById('levelup').classList.add('hidden'); A.swapShown = false; }
      w.debug.godMode = true;
      const v = RS.botInput(w); const j = A.input.joy;
      j.active = true; j.dx = v.x * 0.9; j.dy = v.y * 0.9; j.ox = innerWidth / 2; j.oy = innerHeight * 0.75;
    }, 30);
  });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const shots = async (ctxOpts, prefix) => {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(prefix + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(prefix + ': ' + e));
    await page.goto(url);
    await page.waitForTimeout(800);
    await page.screenshot({ path: out(prefix + '-01-title') });
    if (prefix === 'phone') {
      await page.click('#btn-play'); await page.waitForTimeout(500);
      await page.screenshot({ path: out(prefix + '-02-coach') });
    }
    await setup(page, { year: 7 });
    await page.waitForTimeout(400);
    if (prefix === 'phone') {
      await page.click('#btn-years'); await page.waitForTimeout(400);
      await page.screenshot({ path: out(prefix + '-03-years') });
      await page.evaluate(() => RSApp.showShop()); await page.waitForTimeout(300);
      await page.screenshot({ path: out(prefix + '-04-shop') });
    }
    await page.evaluate(() => RSApp.startYear(RSApp.save.career.yearIdx)); await page.waitForTimeout(300);
    if (await page.isVisible('#coach')) { await page.waitForTimeout(400); await page.click('#coach-cards .card >> nth=0'); await page.waitForTimeout(300); }
    if (await page.isVisible('#transfer')) {
      await page.waitForTimeout(400);
      if (prefix === 'phone') await page.screenshot({ path: out(prefix + '-05a-transfer') });
      for (let i = 0; i < 3 && await page.isVisible('#transfer'); i++) { await page.waitForTimeout(400); await page.click('#tr-cards .card >> nth=1'); await page.waitForTimeout(300); }
    }
    await page.screenshot({ path: out(prefix + '-05-intro') });
    await page.click('#btn-kickoff');
    await botDrive(page);
    await page.waitForTimeout(prefix === 'phone' ? 28000 : 20000);
    await page.screenshot({ path: out(prefix + '-06-play') });
    if (prefix === 'phone') {
      await page.evaluate(() => { window.__keepLv = true; RSApp.world.gainXp(RS.xpToNext(RSApp.world.build.level)); });
      await page.waitForTimeout(900);
      await page.screenshot({ path: out(prefix + '-07-levelup') });
      await page.evaluate(() => { const w = RSApp.world; w.choose(0); document.getElementById('levelup').classList.add('hidden'); RSApp.lvShown = false;
        const c = RS.mateCandidates(w.build, w.yearIdx, true)[0]; if (w.build.teammates.length >= RS.MAX_MATES && c) w.openSwap(c); });
      await page.waitForTimeout(900);
      await page.screenshot({ path: out(prefix + '-07a-swap') });
      await page.evaluate(() => { window.__keepLv = false; });
      await page.evaluate(() => { const w = RSApp.world; w.t = w.stageTime - 0.5; });
      await page.waitForTimeout(6000);
      await page.screenshot({ path: out(prefix + '-08-boss') });
    }
    // 메시 final
    await page.evaluate(() => {
      clearInterval(window.__bot);
      const s = RSApp.save; const last = RS.YEARS.length - 1;
      const b = RS.cloneBuild(s.career.build);
      for (const id of Object.keys(RS.SKILLS).slice(0, 6)) { if (!b.skills[id]) { b.skills[id] = 6; b.skillOrder.push(id); } b.skills[id] = 6; }
      b.evolved.kick = true; b.evolved.siuu = true;
      for (const id of ['pepperoni', 'saintcasi', 'ozilly', 'benjamin', 'tumblenano']) RS.addMate(b, id);
      b.teammates = b.teammates.slice(0, 5);
      s.career.yearIdx = last; s.career.coachDone = last; s.career.build = b;
      RSApp.play(last);
      const w = RSApp.world; w.t = w.stageTime - 3;
    });
    await botDrive(page);
    await page.waitForTimeout(9000);
    await page.screenshot({ path: out(prefix + '-09-messi') });
    if (prefix === 'phone') {
      await page.evaluate(() => { const m = RSApp.world.boss; m.hp = Math.floor(m.maxHp * 0.49); });
      await page.waitForTimeout(700);
      await page.screenshot({ path: out(prefix + '-10-messi-rage') });
    }
    await page.evaluate(() => { const m = RSApp.world.boss; m.invuln = false; RSApp.world.damageEnemy(m, 1e9); });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: out(prefix + '-11-victory') });
    const err = await page.evaluate(() => RSApp.lastError || null);
    if (err) errors.push(prefix + ' loop: ' + err);
    await ctx.close();
  };
  await shots({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'phone');
  await shots({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, 'desktop');
  await browser.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('screenshots ok, no console errors');
})();
