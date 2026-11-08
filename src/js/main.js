/* 호날두 서바이버즈 — app shell: screens, HUD, main loop. Game rules live in game.js / career.js. */
(function (RS) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STEP = 1 / 60;
  const AUTO_LABEL = { off: '수동', semi: '반자동', full: '오토' };
  const AUTO_HINT = { off: '✋ 직접 조작', semi: '🤖 이동·일반 카드는 AI, 중요한 선택은 내가', full: '🚀 모든 선택을 AI가 (등급 카드 → 연계 카드 순)' };
  // a level-up hand holding one of these waits for the player in 반자동
  const SPECIAL = (c) => c.kind === 'relic' || c.kind === 'gamble' || c.kind === 'stim';

  const App = {
    state: 'title', // title | play | menu
    world: null,
    attract: null,
    paused: false,
    endT: 0,
    hud: {},
    init() {
      this.storage = RS.makeStorage();
      this.save = RS.loadSave(this.storage);
      this.rng = RS.makeRng((Date.now() ^ 0x5eed) >>> 0);
      this.renderer = new RS.Renderer($('game'));
      this.input = new RS.Input($('game'));
      RS.Audio.init(this.save.meta.muted);
      this.bind();
      let sp = 1; try { sp = +localStorage.getItem('rs_speed') === 2 ? 2 : 1; } catch (e) { sp = 1; }
      this.setSpeed(sp);
      this.updateMuteButtons();
      $('build-ver').textContent = '버전 ' + RS.VERSION;
      window.addEventListener('resize', () => this.renderer.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 200));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { RS.Audio.suspend(); if (this.state === 'play') this.pause(true); }
        else { RS.Audio.resume(); this.checkUpdate(); }
      });
      const unlock = () => RS.Audio.unlock();
      window.addEventListener('pointerdown', unlock, { once: false, passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
      this.showTitle();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    },

    persist() { RS.writeSave(this.storage, this.save); },

    // A tab left open keeps running the build it loaded (round 12: a screenshot taken an hour and a half after round 11
    // went live still showed round 10's HUD). Back on the tab, the live page's build is read and a newer one offered.
    checkUpdate() {
      if (this._updT && performance.now() - this._updT < 60000) return;
      this._updT = performance.now();
      fetch('index.html', { cache: 'no-store' }).then((r) => r.text()).then((html) => {
        const m = /<meta name="build" content="([^"]+)"/.exec(html);
        if (m && m[1] !== RS.VERSION) $('btn-update').classList.remove('hidden');
      }).catch(() => {}); // offline: play on with the build in hand
    },
    // Files whose build differs from the page's: every script stamps RS_FILES on its last line, the stylesheet --build.
    // ?v= on the file names alone cannot stop a mix — the server answers any ?v= with the files it has now.
    mixedFiles() {
      const want = document.querySelector('meta[name="build"]').content, F = globalThis.RS_FILES || {};
      const out = [...document.scripts].map((s) => /^src\/js\/(\w+)\.js/.exec(s.getAttribute('src') || ''))
        .filter((m) => m && F[m[1]] !== want).map((m) => m[1]);
      if (getComputedStyle(document.documentElement).getPropertyValue('--build').replace(/["'\s]/g, '') !== want) out.push('style');
      return out;
    },
    // A page that loaded files of two builds (a phone's cache across an update) does not start: it fetches the page
    // and every file past the cache and reloads — twice at most, then the update button is left for the player. With
    // storage blocked nothing counts the reloads, so there is only the button. A round-11 page never runs this file:
    // it loads js/ and css/, which keep round 11's files.
    boot() {
      $('btn-update').onclick = () => this.hardReload();
      const mixed = this.mixedFiles().length > 0;
      let tries = 2;
      try {
        if (mixed) { tries = +(sessionStorage.getItem('rs_mixed') || 0); sessionStorage.setItem('rs_mixed', tries + 1); }
        else sessionStorage.removeItem('rs_mixed');
      } catch (e) { tries = 2; }
      if (!mixed) {
        // a page reached through hardReload's fresh address drops the marker again
        if (/[?&]b=\d+/.test(location.search)) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])b=\d+&?/, '$1').replace(/[?&]$/, '') + location.hash);
        this.init();
      } else if (tries < 2) this.hardReload();
      else $('btn-update').classList.remove('hidden');
    },
    hardReload() {
      const urls = [location.pathname + location.search].concat([...document.scripts].map((s) => s.getAttribute('src')),
        [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'))).filter(Boolean);
      // a file that cannot be fetched (offline) is left as it is: the reload still runs. It opens the page at a fresh
      // address (?b=time): some phone browsers (in-app ones) answered a plain reload with the old cached page again,
      // so a mixed page never got past the update button.
      const q = location.search.replace(/([?&])b=\d+&?/, '$1').replace(/[?&]$/, '');
      const go = () => location.replace(location.pathname + (q ? q + '&' : '?') + 'b=' + Date.now() + location.hash);
      Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => null))).then(go);
    },

    // ------------------------------------------------------------ screens
    show(id) {
      this.cancelAuto(); // a pending auto step belongs to the screen it was armed on
      for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
      this.screen = id;
    },

    // ------------------------------------------------------------ auto progress (반자동 / 완전 오토)
    autoMode() { return this.save.meta.auto || 'off'; },
    setAuto(mode) {
      this.save.meta.auto = RS.AUTO_MODES.includes(mode) ? mode : 'off';
      this.persist();
      if (this.save.meta.auto === 'off') this.cancelAuto();
      this.updateOptions();
    },
    // Run fn after ms unless the screen changes first; the badge shows what is about to happen. `need`: the
    // lowest mode that may do it ('semi' or 'full').
    armAuto(fn, ms, label, need) {
      const m = this.autoMode();
      if (m === 'off' || (need === 'full' && m !== 'full')) return false;
      this.cancelAuto();
      const badge = $('auto-badge');
      badge.innerHTML = '';
      badge.append((m === 'full' ? '🚀 ' : '🤖 ') + label + ' · 누르면 수동');
      const bar = document.createElement('span'); bar.className = 'bar'; badge.appendChild(bar);
      badge.classList.remove('hidden');
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
      void bar.offsetWidth;
      bar.style.transition = 'transform ' + ms + 'ms linear'; bar.style.transform = 'scaleX(0)';
      this._autoTm = setTimeout(() => { this._autoTm = null; badge.classList.add('hidden'); fn(); }, ms);
      return true;
    },
    cancelAuto() {
      clearTimeout(this._autoTm); this._autoTm = null;
      const badge = $('auto-badge'); if (badge) badge.classList.add('hidden');
    },
    // title pickers + the HUD button
    updateOptions() {
      const m = this.save.meta;
      for (const b of document.querySelectorAll('[data-diff]')) b.classList.toggle('on', b.dataset.diff === m.diff);
      for (const b of document.querySelectorAll('[data-auto]')) b.classList.toggle('on', b.dataset.auto === m.auto);
      const D = RS.DIFFS[m.diff] || RS.DIFFS.normal;
      $('opt-hint').textContent = D.icon + ' ' + D.name + ': ' + D.desc + ' · ' + AUTO_HINT[m.auto || 'off'];
      const ab = $('btn-auto');
      ab.textContent = AUTO_LABEL[m.auto || 'off'];
      ab.classList.toggle('on', m.auto === 'semi');
      ab.classList.toggle('full', m.auto === 'full');
    },
    setDiff(k) {
      this.save.meta.diff = RS.setDiff(k);
      this.persist();
      this.updateOptions();
      this.makeAttract();
    },
    hideScreens() { this.cancelAuto(); for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); this.screen = null; },

    showTitle() {
      this.state = 'title';
      this.world = null;
      this.input.enabled = false;
      $('hud').classList.add('hidden');
      $('tap-hint').classList.add('hidden'); // lives outside the HUD; stays up when the debut match ends without a move
      $('vignette').classList.add('hidden'); this.hud.low = false;
      for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
      this.show('title');
      const c = this.save.career;
      const yd = RS.YEARS[c.yearIdx];
      const started = c.yearIdx > 0 || c.coachDone >= 0;
      const hero = RS.HEROES[c.build.hero];
      $('btn-play').textContent = c.over ? '⚖️ 배드 엔딩 — 새 커리어로' : c.finished ? '🏆 커리어 완주! 다시 보기' : started ? '▶ 이어하기 · ' + yd.year + '년' : '⚽ ' + hero.name + ' 커리어 시작';
      const hg = RS.heroGrade(c.build), heroName = hg == null ? hero.name : (c.build.flags.blue ? '성공한 첼씨 토레쓰' : '첼씨 토레쓰') + ' ' + RS.GRADES[hg].name;
      $('title-progress').textContent = (c.over ? (RS.ENDINGS[c.over] || { title: '배드 엔딩' }).title : c.finished ? hero.rival + '를 꺾은 전설 · ' + (c.laps + 1) + '회차' : heroName + ' · ' + yd.year + '년 · ' + RS.yearAge(c.yearIdx) + '세 · ' + RS.ERAS[yd.era].club) +
        (RS.hardMode(c.build) ? ' · 🧒 작은 몸 도전' : '') + (c.build.flags.lfcTitle ? ' · 🔴 안필드의 9번' : '');
      this.updateOptions();
      for (const b of document.querySelectorAll('#hero-pick .hero')) {
        b.classList.toggle('on', b.dataset.hero === c.build.hero);
        b.classList.toggle('lock', RS.heroLocked(this.save.meta, b.dataset.hero));
      }
      $('hero-torres-desc').textContent = RS.heroLocked(this.save.meta, 'torres') ? '🔒 드록빠 다음에 나오는 토레쓰를 잡으면 해금'
        : this.save.meta.unlocked.torresBlue ? '✨ 성공한 첼씨 토레쓰 획득 · 새 커리어는 SSS 첼씨 토레쓰 · ' + RS.HEROES.torres.desc : RS.HEROES.torres.desc;
      this.renderWallet($('title-wallet'));
      $('title-pk').textContent = this.pkLine();
      $('btn-cup').textContent = this.cupButton();
      const ts = $('title-sprite'); ts.innerHTML = '';
      ts.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(c.build.hero, c.yearIdx, 1, null, RS.smallBody(c.build)), 0, 7));
      this.makeAttract();
    },

    // Title screen hero buttons: each hero keeps his own career; meta progress is shared.
    pickHero(hero) {
      if (hero === this.save.career.build.hero) return;
      if (RS.heroLocked(this.save.meta, hero)) { // 토레쓰: beat him after 드록빠 first
        RS.Audio.sfx('lose');
        this.toast('🔒 드록빠를 잡으면 토레쓰가 난입! 30초 안에 잡으면 해금');
        return;
      }
      RS.switchHero(this.save, hero);
      this.persist();
      RS.Audio.sfx('click');
      this.toast(RS.HEROES[hero].name + ' 커리어로 전환');
      this.showTitle();
    },

    renderWallet(el) {
      el.textContent = '💰 ' + this.save.meta.coins.toLocaleString() + '   🏆 발롱도르 ' + this.save.meta.ballons;
    },

    makeAttract() {
      const idx = this.save.career.yearIdx;
      const b = RS.buildForYear(this.save, idx);
      this.attract = new RS.World({ yearIdx: idx, build: b, meta: this.save.meta, view: this.renderer.view, seed: 99 });
      this.attract.debug.godMode = true;
    },

    showYears() {
      this.show('years');
      const list = $('year-list'); list.innerHTML = '';
      const c = this.save.career;
      RS.YEARS.forEach((y, i) => {
        const b = document.createElement('button');
        const can = RS.canPlay(this.save, i);
        const cur = i === c.yearIdx && !c.finished;
        b.className = 'year' + (cur ? ' cur' : '') + (!can ? ' lock' : '') + (y.final ? ' final' : '') + (y.trial ? ' trial' : '');
        const st = c.cleared[i] ? '✅ 다시하기' : cur ? '▶ 플레이' : '🔒';
        b.innerHTML = '<div class="yy">' + y.year + '</div><div class="yi"><div class="yt"></div><div class="yc"></div></div><div class="ys">' + st + '</div>';
        b.querySelector('.yt').textContent = y.title;
        b.querySelector('.yc').textContent = RS.yearAge(i) + '세 · ' + RS.ERAS[y.era].club + ' · 보스: ' + y.boss.name + (y.ballon ? ' · 🏆' : '') +
          (y.foe ? ' · vs ' + RS.FOES[y.foe].name : '');
        if (y.trial) { // the 고난 badge never wraps mid-word
          const t = document.createElement('span');
          t.className = 'trial-mark';
          t.textContent = '🔥고난' + '▲'.repeat(y.trial);
          b.querySelector('.yc').append(' · ', t);
        }
        b.disabled = !can;
        b.onclick = () => { RS.Audio.sfx('click'); this.startYear(i); };
        list.appendChild(b);
        if (cur) setTimeout(() => b.scrollIntoView({ block: 'center' }), 0);
      });
    },

    // 훈련장: the weapon in hand (강화 with coins, odds falling with every step), the 무기고 (take another in hand),
    // the three 무기 상자, teammate training — all for this career — then the permanent upgrades shared by all.
    showShop() {
      this.show('shop');
      this.renderWallet($('shop-wallet'));
      const list = $('shop-list'); list.innerHTML = '';
      const save = this.save, b = save.career.build, coins = save.meta.coins;
      const redo = () => { this.persist(); this.showShop(); };
      const head = (text, dim) => {
        const h = document.createElement('div'); h.className = 'shop-h'; h.textContent = text;
        if (dim) { const s = document.createElement('span'); s.className = 'dim'; s.textContent = ' · ' + dim; h.appendChild(s); }
        list.appendChild(h);
      };
      const item = (icon, name, desc, g, cls) => {
        const row = document.createElement('div');
        row.className = 'shop-item' + (g != null ? ' g-' + g : '') + (cls ? ' ' + cls : '');
        row.innerHTML = '<div class="ic"></div><div class="tx"><div class="nm"></div><div class="ds"></div></div>';
        row.querySelector('.ic').textContent = icon;
        const nm = row.querySelector('.nm'); nm.textContent = name;
        if (g != null) nm.classList.add('g-text', 'g-' + g);
        row.querySelector('.ds').textContent = desc;
        list.appendChild(row);
        return row;
      };
      const btn = (row, label, off, onClick) => {
        const x = document.createElement('button');
        x.className = 'btn small'; x.textContent = label; x.disabled = !!off;
        if (onClick) x.onclick = onClick;
        row.appendChild(x);
      };
      const w = b.weapon, ec = RS.enhanceCost(w);
      head('⚔️ 지금 무기', '등급 한 단계가 강화 +10보다 세다');
      const hand = item(RS.weaponIcon(w), RS.weaponName(b, w) + ' · ' + RS.gradeTag(w), '무기 공격력 ' + RS.weaponPower(w) + ' · ' + RS.weaponDesc(b, w), w.g, 'hand');
      if (ec == null) btn(hand, '강화 최대', true);
      else btn(hand, '🔨 +' + (w.p + 1) + ' (' + Math.round(RS.enhanceOdds(w) * 100) + '%) 💰' + ec, coins < ec, () => {
        const res = RS.buyEnhance(save, this.rng);
        if (!res) return;
        RS.Audio.sfx(res.ok ? 'levelup' : 'lose');
        this.toast(res.ok ? '🔨 강화 성공! +' + res.p : '💥 강화 실패 — 코인만 쓰고 +' + res.p + ' 그대로');
        redo();
      });
      if (b.armory.length) {
        head('🗄️ 무기고', '들고 있는 무기와 바꿔 든다');
        for (const a of b.armory.slice().sort((x, y) => RS.weaponMul(y) - RS.weaponMul(x))) {
          const row = item(RS.weaponIcon(a), RS.weaponName(b, a) + ' · ' + RS.gradeTag(a), '무기 공격력 ' + RS.weaponPower(a) + ' · ' + RS.weaponDesc(b, a), a.g);
          btn(row, '장착', false, () => { if (RS.equipFromArmory(b, a.id)) { RS.Audio.sfx('click'); this.toast('무기 교체: ' + RS.weaponName(b, b.weapon)); redo(); } });
        }
      }
      head('🎁 무기 상자', 'S까지만 · SS·SSS·GOAT·SIUUU는 경기 중 운으로만');
      for (const d of RS.WEAPON_BOXES) {
        const odds = d.odds.map((p, g) => [p, g]).filter((x) => x[0] > 0).map(([p, g]) => RS.GRADES[g].name + ' ' + (p < 0.01 ? (p * 100).toFixed(1) : Math.round(p * 100)) + '%');
        const row = item(d.icon, d.name, odds.join(' · ') + ' · 지금 무기보다 세면 바로 장착', d.g);
        btn(row, '💰 ' + d.cost, coins < d.cost, () => {
          const res = RS.buyBox(save, d.id, this.rng);
          if (!res) return;
          RS.Audio.sfx(res.w.g >= 2 ? 'jackpot' : res.kept ? 'chest' : 'coin');
          const c = this.boxCard(b, res);
          this.toast((res.w.g >= 2 ? '🎉 ' : '') + c.tag + ' ' + c.name + (res.kept === 'hand' ? ' 장착!' : res.kept ? ' → 무기고' : ' 중복 · 코인 +' + res.refund));
          redo();
        });
      }
      const mates = RS.allMates(b);
      if (mates.length) {
        head('🤝 동료 훈련', '강화할수록 피해와 팀 효과가 커진다');
        for (const m of mates) {
          const t = RS.TEAMMATES[m.id], mc = RS.mateTrainCost(m);
          const row = item(RS.ROLES[t.role].icon, t.name + ' · ' + RS.mateBadge(m.id, m.lv), RS.mateLine(m.id), RS.mateGrade(m.id));
          if (mc == null) btn(row, '최대', true);
          else btn(row, '📈 +' + (m.lv + 1) + ' 💰' + mc, coins < mc, () => { if (RS.buyMateTrain(save, m.id)) { RS.Audio.sfx('levelup'); redo(); } });
        }
      }
      head('🏋️ 영구 강화', '모든 커리어에 적용');
      for (const id of Object.keys(RS.META)) {
        const m = RS.META[id];
        const lv = this.save.meta.upgrades[id] || 0;
        const cost = RS.metaCost(id, lv);
        const row = document.createElement('div');
        row.className = 'shop-item';
        row.innerHTML = '<div class="ic"></div><div class="tx"><div class="nm"></div><div class="ds"></div><div class="dots"></div></div>';
        row.querySelector('.ic').textContent = m.icon;
        row.querySelector('.nm').textContent = m.name;
        row.querySelector('.ds').textContent = m.desc;
        row.querySelector('.dots').textContent = '●'.repeat(lv) + '○'.repeat(m.max - lv);
        const btn = document.createElement('button');
        btn.className = 'btn small';
        if (!cost) { btn.textContent = '최대'; btn.disabled = true; }
        else {
          btn.textContent = cost.coins != null ? '💰 ' + cost.coins : '🏆 ' + cost.ballons;
          btn.disabled = cost.coins != null ? this.save.meta.coins < cost.coins : this.save.meta.ballons < cost.ballons;
          btn.onclick = () => { if (RS.buyMeta(this.save, id)) { RS.Audio.sfx('levelup'); this.persist(); this.showShop(); } };
        }
        row.appendChild(btn);
        list.appendChild(row);
      }
    },

    // ------------------------------------------------------------ career flow
    // season flow: story event (메시) → coach card → transfer window → intro → kick-off
    startYear(idx) {
      if (!RS.canPlay(this.save, idx)) return;
      const pending = RS.pendingRewards(this.save); // left unpicked before a reload
      if (pending.length) { this.showPendingRewards(pending, () => this.startYear(idx)); return; }
      if (RS.needsEvent(this.save, idx)) this.showEvent(idx);
      else this.afterEvent(idx);
    },

    afterEvent(idx) {
      if (RS.needsPress(this.save, idx)) this.showPress(idx);
      else this.afterPress(idx);
    },
    afterPress(idx) {
      if (RS.needsRecall(this.save, idx)) this.showPress(idx, 'recall'); // 회상 before a 첼씨 시련 (round 14)
      else if (RS.needsCoach(this.save, idx)) this.showCoach(idx);
      else this.afterCoach(idx);
    },

    // 기자회견 (RS.PRESS): the scene's lines type out one by one (tap: finish the line, then the next), then the
    // answers. The chosen line is said, the odds are rolled under a burst of camera flashes, and the outcome shows.
    // kind 'recall' (round 14): the season's 회상 scene instead — no flashes, one answer, then the coach.
    showPress(idx, kind) {
      this.show('press');
      const recall = kind === 'recall';
      const yd = RS.YEARS[idx], pr = recall ? RS.recallFor(idx) : RS.pressFor(idx), b = this.save.career.build;
      this.prKind = recall ? yd.recall : null;
      // prevLook: the scene happens before the move (the 2011 crossroads: still in 리버풀 red, at 안필드)
      const lookIdx = pr.prevLook && idx > 0 ? idx - 1 : idx;
      $('pr-season').textContent = yd.year + ' · ' + RS.yearAge(idx) + '세 · ' + RS.ERAS[RS.YEARS[lookIdx].era].club;
      $('pr-title').textContent = (recall ? '📼 ' : '🎤 ') + pr.title;
      $('pr-who').textContent = pr.who;
      const hs = $('pr-hero'); hs.innerHTML = ''; hs.className = 'pr-hero';
      hs.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(b.hero, lookIdx, 1, null, RS.smallBody(b)), 0, 4));
      const crowd = $('pr-crowd'); crowd.innerHTML = '';
      for (let i = 0; i < 6; i++) { const s = document.createElement('span'); if (i % 2) s.appendChild(document.createElement('i')); crowd.appendChild(s); }
      $('pr-cards').classList.add('hidden');
      $('pr-result').classList.add('hidden');
      $('pr-next').classList.remove('hidden');
      let li = -1;
      const next = () => {
        if (li >= pr.lines.length) return;
        li++;
        if (li >= pr.lines.length) { $('pr-next').classList.add('hidden'); this.pressChoices(idx, pr); return; }
        this.pressLine(pr.lines[li], b.hero, () => this.armAuto(next, 1100, '다음 대사', 'full'));
      };
      $('pr-box').onclick = () => { if (this.prTyping) this.finishType(); else next(); };
      if (!recall) { this.flashes(4); RS.Audio.sfx('flash'); }
      next();
    },
    pressLine(line, hero, done) {
      const by = $('pr-by'), tx = $('pr-text');
      const mine = line.by === RS.HEROES[hero].short;
      by.textContent = line.inner ? line.by + ' · 속마음' : line.by;
      by.className = 'pr-by' + (line.inner ? ' inner' : mine ? ' hero' : '');
      tx.className = 'pr-text' + (line.inner ? ' inner' : '');
      $('pr-hero').classList.toggle('talk', mine && !line.inner);
      if (!mine && !line.inner && !this.prKind) { this.flashes(2); RS.Audio.sfx('flash'); }
      this.typeText(tx, line.text, done);
    },
    typeText(el, text, done) {
      clearInterval(this._typeT);
      let i = 0;
      el.textContent = '';
      this.prTyping = true;
      this._typeFull = () => {
        clearInterval(this._typeT);
        el.textContent = text;
        this.prTyping = false;
        $('pr-hero').classList.remove('talk');
        if (done) { const d = done; done = null; d(); }
      };
      this._typeT = setInterval(() => { i += 1; el.textContent = text.slice(0, i); if (i >= text.length) this._typeFull(); }, 30);
    },
    finishType() { if (this._typeFull) this._typeFull(); },
    pressChoices(idx, pr) {
      const b = this.save.career.build;
      const cards = pr.choices.map((c) => ({ kind: 'press', icon: c.icon, name: c.name, desc: c.say, hint: c.desc, tag: c.rolls ? '🎲 확률' : '확정' }));
      $('pr-cards').classList.remove('hidden');
      const pick = (i) => {
        const ch = pr.choices[i];
        this.cancelAuto();
        $('pr-cards').classList.add('hidden');
        $('pr-box').onclick = () => { if (this.prTyping) this.finishType(); };
        this.pressLine({ by: RS.HEROES[b.hero].short, text: ch.say }, b.hero, () => {
          const out = RS.applyPress(this.save, idx, ch.id, this.rng, this.prKind || undefined);
          this.persist();
          if (ch.rolls) { this.flashes(6); RS.Audio.sfx('flash'); setTimeout(() => this.pressResult(idx, out), 950); }
          else setTimeout(() => this.pressResult(idx, out), 420);
        });
      };
      this.renderCards($('pr-cards'), cards, pick);
      pr.choices.forEach((c, i) => { if (c.rolls && c.rolls.some((o) => o.ending)) $('pr-cards').children[i].classList.add('risk'); });
      this.armAuto(() => pick(RS.autoPressPick(pr.choices)), 1800, 'AI가 대답을 고른다', 'full');
    },
    pressResult(idx, out) {
      const r = $('pr-result');
      r.className = 'press-result ' + out.mood;
      $('pr-res-text').textContent = out.text;
      const sk = { learned: ' · 새 무기 (' + RS.GRADES[RS.GIFT_GRADE].name + ' +1)!', up: ' · 그 무기 강화 +1', full: ' · 그 무기가 이미 +10이라 공격력 +5%로 대신' }[out.skill] || '';
      $('pr-res-note').textContent = out.ending ? '⚖️ 커리어가 여기서 멈춘다…' : (out.win ? '🎉 ' : out.mood === 'bad' ? '💥 ' : '') + out.note + sk;
      if (out.mood === 'bad') { const h = $('pr-hero'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit'); }
      RS.Audio.sfx(out.ending ? 'gavel' : out.mood === 'bad' ? 'lose' : out.mood === 'sad' ? 'heart' : 'recruit');
      const ok = $('btn-pr-ok');
      ok.textContent = out.ending ? '판결을 듣는다' : '계속';
      if (out.path) this.toast(out.path === 'liverpool' ? '🔴 리버풀 잔류 — 2011~2014 시즌이 안필드로 바뀐다' : '🔵 첼씨 토레쓰 B등급 — 시련 4개가 기다린다');
      ok.onclick = () => { RS.Audio.sfx('click'); if (out.ending) this.showEnding(out.ending); else this.afterPress(idx); };
      this.armAuto(() => ok.onclick(), out.ending ? 4000 : 2600, out.ending ? '판결로' : '다음으로', 'full');
    },
    flashes(n) {
      const box = $('pr-flashes');
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const f = document.createElement('b');
          f.style.left = (8 + Math.random() * 84) + '%'; f.style.top = (50 + Math.random() * 45) + '%';
          box.appendChild(f);
          setTimeout(() => f.remove(), 420);
        }, i * 120 + Math.random() * 80);
      }
    },
    // A bad ending (RS.ENDINGS) stops the career; coins, 발롱도르 and 훈련장 stay.
    showEnding(id) {
      this.show('ending');
      const e = RS.ENDINGS[id] || { icon: '⚖️', title: '배드 엔딩', text: '' };
      const b = this.save.career.build;
      $('end-icon').textContent = e.icon;
      $('end-title').textContent = e.title;
      $('end-text').textContent = e.text;
      const sp = $('end-sprite'); sp.innerHTML = '';
      sp.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(b.hero, this.save.career.yearIdx, 1, null, RS.smallBody(b)), 0, 5));
      RS.Audio.sfx('dead');
      $('btn-end-new').onclick = () => {
        RS.Audio.sfx('click');
        RS.newCareer(this.save);
        this.persist();
        this.showTitle();
        this.toast('새 커리어를 시작합니다');
      };
    },

    // 메시's story choices: the growth-hormone treatment (= difficulty) and 딩요's tutoring.
    showEvent(idx) {
      this.show('event');
      const yd = RS.YEARS[idx], ev = RS.EVENTS[yd.event], b = this.save.career.build;
      $('ev-season').textContent = yd.year + ' · ' + RS.yearAge(idx) + '세 · ' + RS.ERAS[yd.era].club;
      $('ev-title').textContent = ev.title;
      $('ev-who').textContent = ev.who;
      $('ev-story').textContent = ev.story;
      const sp = $('ev-sprite'); sp.innerHTML = '';
      sp.appendChild(RS.Sprites.toCanvas(ev.mate ? RS.Sprites.mate(ev.mate, idx) : RS.Sprites.hero(b.hero, idx, 1, null, RS.smallBody(b)), 0, 4));
      const cards = RS.eventChoices(this.save, idx);
      const pick = (i) => {
        const info = RS.applyEvent(this.save, idx, cards[i], this.rng);
        this.persist();
        RS.Audio.sfx(cards[i].hgh === false ? 'boss' : info.roll != null && !info.win ? 'lose' : cards[i].rolls ? 'jackpot' : 'evolve');
        this.toast(info.text + (info.mate ? ' · ' + RS.TEAMMATES[info.mate].name + ' 합류!' : ''));
        this.afterEvent(idx);
      };
      this.renderCards($('ev-cards'), cards, pick);
      cards.forEach((c, i) => { if (c.rolls) $('ev-cards').children[i].classList.add('risk'); });
      this.armAuto(() => pick(RS.autoEventPick(cards)), 2200, 'AI가 고른다', 'full');
    },

    // A story unlock a teammate brought (round 14: 제라두 → 제토라인), told once
    unlockToast() {
      const note = RS.unlockNote(this.save.career.build);
      if (note) { RS.Audio.sfx('jackpot'); this.toast(note); this.persist(); }
    },

    afterCoach(idx) {
      const offers = RS.transferOffers(this.save, idx, this.rng);
      if (offers.length) this.showTransfer(idx, offers, 0);
      else this.showIntro(idx);
    },

    // Club changed: players of the new club offer to join (free slot) or swap with a teammate, each with his own 강화.
    showTransfer(idx, offers, k) {
      if (k >= offers.length) { RS.finishTransfers(this.save, idx); this.persist(); this.showIntro(idx); return; }
      this.show('transfer');
      const yd = RS.YEARS[idx];
      const { id, lv } = offers[k];
      const nm = RS.TEAMMATES[id];
      const b = this.save.career.build;
      $('tr-club').textContent = yd.year + ' · ' + RS.ERAS[yd.era].club + ' 이적 시장 (' + (k + 1) + '/' + offers.length + ')';
      $('tr-name').textContent = nm.name + ' · ' + RS.mateBadge(id, lv);
      $('tr-name').className = 'g-text g-' + RS.mateGrade(id);
      $('tr-role').textContent = RS.mateLine(id);
      const sp = $('tr-sprite'); sp.innerHTML = '';
      sp.appendChild(RS.Sprites.toCanvas(RS.Sprites.mate(id, idx), 0, 4));
      const cards = [], g = RS.mateGrade(id);
      if (b.teammates.length < RS.MAX_MATES) cards.push({ kind: 'recruit', icon: '🤝', name: '선발로 영입', desc: nm.name + ' 강화 +' + lv + ' 합류', tag: RS.mateBadge(id, lv), g, hint: RS.synergyHint(b, id), out: null, take: true });
      else if (b.bench.length < RS.MAX_BENCH) cards.push({ kind: 'recruit', icon: '🪑', name: '벤치로 영입', desc: nm.name + ' 강화 +' + lv + ' 합류', tag: RS.mateBadge(id, lv), g, hint: RS.synergyHint(b, id), out: null, take: true });
      // swaps: OVR and 강화 of both men, so the verdict says whether it pays off
      for (const m of RS.allMates(b)) cards.push({ kind: 'swap', icon: '🔄', name: RS.TEAMMATES[m.id].name + ' 방출', desc: RS.TEAMMATES[m.id].name + ' (' + RS.mateBadge(m.id, m.lv) + ') 대신 ' + nm.name + ' +' + lv + (b.bench.includes(m) ? ' · 벤치' : ' · 선발'),
        tag: RS.mateBadge(m.id, m.lv), g: RS.mateGrade(m.id), hint: RS.swapVerdict(m.id, id, m.lv, lv), out: m.id, take: true });
      cards.push({ kind: 'keep', icon: '✋', name: '영입하지 않기', desc: '지금 스쿼드 그대로 간다.', tag: '유지', take: false });
      const pick = (i) => {
        const c = cards[i];
        RS.applyTransfer(this.save, idx, c.take ? id : null, c.out, lv);
        this.persist();
        if (c.take) this.toast(nm.name + ' 합류!');
        this.unlockToast();
        this.showTransfer(idx, offers, k + 1);
      };
      this.renderCards($('tr-cards'), cards, pick);
      // 완전 오토: sign into a free place, otherwise keep the squad
      this.armAuto(() => pick(cards[0].kind === 'recruit' ? 0 : cards.length - 1), 2000, 'AI가 고른다', 'full');
    },

    showCoach(idx) {
      this.show('coach');
      const yd = RS.YEARS[idx];
      const coach = RS.COACHES[yd.coach];
      $('coach-season').textContent = yd.year + ' 시즌을 앞두고 · ' + RS.ERAS[yd.era].club;
      $('coach-name').textContent = coach.name;
      $('coach-tag').textContent = coach.tag;
      const sp = $('coach-sprite'); sp.innerHTML = '';
      sp.appendChild(RS.Sprites.toCanvas(RS.Sprites.coach(yd.coach, 1), 0, 4));
      const cards = RS.coachChoices(this.save, idx, this.rng);
      const pick = (i) => {
        const info = RS.applyCoach(this.save, idx, cards[i], this.rng);
        this.persist();
        if (info.mate) this.toast(RS.TEAMMATES[info.mate].name + ' 합류! (강화 +' + info.lv + ')');
        this.unlockToast();
        this.afterCoach(idx);
      };
      this.renderCards($('coach-cards'), cards.map((c) => ({
        kind: c.id === 'recruit' ? 'recruit' : 'coach', icon: c.icon, name: c.name, desc: c.desc,
        tag: c.id === 'recruit' || c.id === 'train' ? '동료' : '감독 카드'
      })), pick);
      this.armAuto(() => pick(RS.autoCoachPick(cards, this.save.career.build)), 2000, 'AI가 고른다', 'full');
    },

    showIntro(idx) {
      this.show('intro');
      const yd = RS.YEARS[idx];
      const replay = RS.isReplay(this.save, idx);
      const b0 = RS.buildForYear(this.save, idx), small = RS.smallBody(b0);
      $('intro-year').textContent = yd.year;
      const D = RS.DIFFS[RS.DIFF];
      $('intro-club').textContent = RS.yearAge(idx) + '세 · ' + RS.ERAS[yd.era].club + ' · ' + D.icon + ' ' + D.name + (replay ? ' · 다시하기 (커리어에 영향 없음)' : '') + (RS.hardMode(b0) ? ' · 🧒 작은 몸 도전' : '');
      $('intro-title').textContent = yd.title;
      // 고난의 시즌 / named foe: say up front that this one is harder and why
      const tags = [];
      if (yd.trial) tags.push('🔥 고난의 시즌 ' + '▲'.repeat(yd.trial) + ' · 적이 더 단단하고 아프다');
      if (yd.foe) tags.push('🔵 상대 ' + RS.FOES[yd.foe].name + ' · 파란 버스 수비가 세 번 밀고 온다');
      else if (yd.twist && yd.twist.wall) tags.push('🧱 철벽 수비가 두 번 밀고 온다 · 틈을 뚫거나 옆으로 돌아가라');
      if (yd.twist && yd.twist.extra) tags.push('⏱ 연장전 ' + yd.twist.extra + '초 뒤에 보스 등장');
      // round 14: a 첼씨 시련 names the grade at stake; the last one ends in the 캄프 누 goal
      const hg = RS.heroGrade(b0);
      if (yd.ctrial && hg != null && !b0.flags.blue) tags.push('🔵 첼씨 시련 ' + yd.ctrial + '/' + RS.CHELSEA.trials + ' · 지금 첼씨 토레쓰 ' + RS.GRADES[hg].name + (yd.ctrial > hg ? ' → 넘으면 ' + RS.GRADES[Math.min(RS.GRADE_TOP, yd.ctrial)].name : '') + (yd.cine ? ' · 보스를 잡으면 900억 골 장면' : ''));
      if (yd.boss.type === 'suarez') tags.push('🦷 이빨괴물 수아레즈 · 한 번 잡으면 이후 시즌에 준보스로 난입한다');
      $('intro-trial').textContent = tags.join('\n');
      $('intro-trial').classList.toggle('hidden', !tags.length);
      $('intro-story').textContent = yd.story || '';
      const evo = $('intro-evo'); evo.innerHTML = '';
      const hero = this.save.career.build.hero;
      // the growth-hormone season shows the treatment (small body → grown); otherwise last season → this one
      const grew = yd.event === 'hgh' && !small;
      const from = grew ? { i: idx, small: true } : idx > 0 ? { i: idx - 1, small } : null;
      const look = RS.heroLook(hero, idx, null, small);
      const prev = from ? RS.heroLook(hero, from.i, null, from.small) : null;
      if (prev && prev.key !== look.key) {
        evo.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(hero, from.i, 1, null, from.small), 0, 5));
        const a = document.createElement('div'); a.className = 'arrow'; a.textContent = '➜'; evo.appendChild(a);
        const wrap = document.createElement('div');
        const lab = document.createElement('div'); lab.className = 'evo-label'; lab.textContent = grew ? '💉 몸이 자랐다!' : RS.HEROES[hero].short + ' 진화!';
        wrap.appendChild(lab);
        wrap.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(hero, idx, 1, null, small), 0, 6));
        evo.appendChild(wrap);
      } else evo.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(hero, idx, 1, null, small), 0, 6));
      const stars = RS.threatStars(idx);
      const drawSquad = () => {
        const b = RS.buildForYear(this.save, idx);
        $('intro-squad').innerHTML = this.buildChips(b);
        if (!RS.isReplay(this.save, idx)) this.bindSquad($('intro-squad'), drawSquad); // replays keep that year's squad
        else for (const el of $('intro-squad').querySelectorAll('.sqbtn')) el.remove();
        $('intro-vs').innerHTML = '⚔ ' + RS.HEROES[b.hero].short + ' 전투력 <b>' + RS.powerScore(b, yd.youth) + '</b> &nbsp;vs&nbsp; 상대 위협도 <b>' + '★'.repeat(stars) + '☆'.repeat(5 - stars) + '</b>';
      };
      drawSquad();
      $('intro-boss').textContent = (yd.final ? '최종 보스: ' : '시즌 보스: ') + yd.boss.name + ' (' + RS.BOSS_TYPES[yd.boss.type].sig + ') · ' +
        (yd.twist && yd.twist.extra ? '연장까지 ' + Math.round(RS.yearTuning(idx).duration) + '초' : '1분') + ' 버티면 등장' +
        (yd.rival ? ' · ⚔️ 경기 중반 엘 클라시코: ' + RS.RIVAL[yd.rival].name + ' (' + (yd.rivalLv + 1) + '년차) ' + RS.RIVAL_WINDOW + '초 안에 잡으면 승리' : '');
      $('btn-kickoff').onclick = () => { RS.Audio.sfx('click'); this.play(idx); };
      this.armAuto(() => this.play(idx), 2200, '킥오프', 'semi');
    },

    buildChips(b) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      let h = '<span class="chip">Lv.' + b.level + '</span>';
      const w = b.weapon; // the one weapon in hand, in its grade colour; the rest wait in the 무기고
      h += '<span class="chip g-' + w.g + '"><b class="g-text g-' + w.g + '">' + RS.weaponIcon(w) + ' ' + esc(RS.weaponName(b, w)) + ' ' + esc(RS.gradeTag(w)) + '</b></span>';
      if (b.armory.length) h += '<span class="chip">🗄️ 무기고 ' + b.armory.length + '개</span>';
      // a passive chip: its level, edged in the best grade among its cards
      for (const id of b.passiveOrder) h += '<span class="chip g-' + Math.max(...b.passiveGrades[id]) + '">' + RS.PASSIVES[id].icon + ' Lv.' + b.passives[id] + '</span>';
      for (const id in b.drills || {}) h += '<span class="chip">' + RS.DRILLS[id].icon + ' ' + esc(RS.DRILLS[id].name) + ' ×' + b.drills[id] + '</span>';
      for (const id of b.relicOrder || []) { const r = RS.RELICS[id]; h += '<span class="chip g-' + r.g + '">' + r.icon + ' ' + esc(r.name) + (r.stack ? ' ' + b.relics[id] + '/' + RS.STIM.max : '') + '</span>'; }
      if (b.coachCards.length) h += '<span class="chip">👔 감독 카드 ' + b.coachCards.length + '</span>';
      // 발롱도르 won in this career: trophy balls come only from these (RS.ballonCount)
      h += '<span class="chip">🏆 발롱도르 ' + RS.ballonCount(b) + '회 수상</span>';
      if (b.rivalry && (b.rivalry.w || b.rivalry.l)) h += '<span class="chip">⚔️ 클라시코 ' + b.rivalry.w + '승 ' + b.rivalry.l + '패</span>';
      const ft = RS.fanTier(b);
      h += '<span class="chip">' + ft.icon + ' 민심 ' + esc(ft.name) + ' ' + (b.fans != null ? b.fans : RS.FANS.start) + (ft.key !== 'calm' ? ' · ' + esc(ft.text) : '') + '</span>';
      return h + this.squadLines(b);
    },

    // Squad panel: the two on the pitch (with their partnership), then the bench. Buttons swap pitch ↔ bench
    // between seasons (data-sq attributes; bindSquad wires them).
    squadLines(b) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      if (!RS.allMates(b).length) return '<div class="squad"><div class="sq empty">동료 없음 — 필드의 ! 표시로 영입</div></div>';
      const row = (m, onPitch) => '<div class="sq' + (onPitch ? '' : ' bench') + '"><b>' + esc(RS.TEAMMATES[m.id].name) + '</b> <span class="ovr g-text g-' + RS.mateGrade(m.id) + '">' + esc(RS.mateBadge(m.id)) + '</span> <span class="lv">강화 +' + m.lv + '</span>' +
        '<button class="sqbtn" data-sq="' + m.id + '">교체 선택</button>' +
        '<div class="rl">' + esc(RS.mateLine(m.id)) + (onPitch ? '' : ' (벤치: 1/3)') + '</div></div>';
      let h = '<div class="squad"><div class="sqhelp" role="status">교체할 선수 선택 → 반대쪽 선수 선택<br>선발: 필드 출전 · 효과 100% / 벤치: 팀 효과 1/3</div><div class="sqh">선발 ' + b.teammates.length + '/' + RS.MAX_MATES + '</div>';
      for (const m of b.teammates) h += row(m, true);
      const pair = RS.pairSynergy(b);
      if (pair) h += '<div class="sq pair">🔗 파트너십 <b>' + esc(pair.name) + '</b> — ' + esc(pair.desc) + '</div>';
      else if (b.teammates.length === 2) h += '<div class="sq pair off">🔗 파트너십 없음 — 포지션 조합을 바꿔 보세요</div>';
      h += '<div class="sqh">벤치 ' + b.bench.length + '/' + RS.MAX_BENCH + ' <span class="dim">(팀 효과 1/3)</span></div>';
      for (const m of b.bench) h += row(m, false);
      if (!b.bench.length) h += '<div class="sq empty">비어 있음</div>';
      return h + '</div>';
    },

    // Wire the pitch ↔ bench buttons inside a rendered squad panel. `rerender` redraws after a change.
    bindSquad(root, rerender) {
      const b = this.save.career.build;
      let selected = null;
      for (const btn of root.querySelectorAll('.sqbtn')) btn.onclick = (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.sq;
        const onPitch = b.teammates.some((m) => m.id === id);
        this.cancelAuto();
        if (selected && selected.id === id) { rerender(); return; }
        if (!selected || selected.onPitch === onPitch) {
          selected = { id, onPitch };
          for (const el of root.querySelectorAll('.sqbtn')) {
            const same = b.teammates.some(m => m.id === el.dataset.sq) === onPitch;
            el.textContent = el === btn ? '선택 취소' : same ? '교체 선택' : '이 선수와 교체';
            el.closest('.sq').classList.toggle('selected', el === btn);
          }
          const help = root.querySelector('.sqhelp');
          help.textContent = RS.TEAMMATES[id].name + ' 선택 · 반대쪽 선수를 누르세요';
          if ((onPitch ? b.bench.length < RS.MAX_BENCH : b.teammates.length < RS.MAX_MATES)) {
            const move = document.createElement('button'); move.className = 'sqmove';
            move.textContent = onPitch ? '빈 벤치로 이동' : '빈 선발 자리로 이동';
            move.onclick = () => { RS.toggleBench(b, id); this.persist(); rerender(); };
            help.appendChild(move);
          }
          return;
        }
        const ok = RS.toggleBench(b, onPitch ? selected.id : id, onPitch ? id : selected.id);
        if (!ok) { this.toast('벤치가 가득 찼어요'); return; }
        this.persist();
        rerender();
      };
    },

    play(idx) {
      this.cancelAuto();
      this.world = RS.startYear(this.save, idx, { view: this.renderer.view });
      this.world.view = this.renderer.view;
      this.playIdx = idx;
      this.state = 'play';
      this.paused = false;
      this.hitStop = 0;
      this.renderer.pfx.length = 0;
      this.endT = 0;
      this.ended = false;
      this.input.enabled = true;
      this.input.release();
      this.hideScreens();
      for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('bossbar').classList.add('hidden');
      $('tap-hint').classList.toggle('hidden', idx > 0 || this.autoMode() !== 'off');
      this.hud = {};
      this.banner(RS.YEARS[idx].year + ' · ' + RS.YEARS[idx].title);
    },

    // ------------------------------------------------------------ overlays
    renderCards(el, cards, onPick) {
      el.innerHTML = '';
      const shownAt = performance.now();
      cards.forEach((c, i) => {
        const b = document.createElement('button');
        // g: the grade colour (RS.GRADES) of a weapon, teammate or graded item — rarer, louder
        b.className = 'card k-' + c.kind + (c.g != null ? ' g-' + c.g : '');
        b.innerHTML = '<div class="ic"></div><div class="tx"><div class="nm"><span class="n"></span><span class="tg"></span></div><div class="ds"></div><div class="hn"></div></div>';
        b.querySelector('.ic').textContent = c.icon || '⚽';
        b.querySelector('.n').textContent = c.name;
        b.querySelector('.tg').textContent = c.tag || '';
        b.querySelector('.ds').textContent = c.desc || '';
        const hn = b.querySelector('.hn');
        if (c.hint) {
          hn.textContent = c.hint;
          if (/필요|스킬 필요/.test(c.hint)) hn.classList.add('need');
          if (c.hint[0] === '▲') hn.classList.add('up'); else if (c.hint[0] === '▼') hn.classList.add('down'); // transfer verdicts
        } else hn.remove();
        b.onclick = () => {
          if (performance.now() - shownAt < 350) return; // guard against the joystick finger
          RS.Audio.sfx('click');
          onPick(i);
        };
        el.appendChild(b);
      });
    },

    showLevelUp() {
      const w = this.world;
      this.input.release();
      $('levelup').classList.remove('hidden');
      // an item, 약물 or gamble card in the hand is announced in the title, in its grade colour
      const sp = w.choices.find(SPECIAL);
      const t = !sp ? '' : sp.kind === 'gamble' ? 'gamble' : 'g' + sp.g;
      const cup = w.choices.find((c) => c.cup); // round 19: a cup move turned up (RS.cupOffer), in SIUUU colours
      $('lv-title').textContent = cup ? '🏆 SIUUU 무기 등장!!!' : sp && sp.kind === 'stim' ? '💉 약물 꽂기 등장! 받을까, 말까?' :
        { g4: '🌟 SSS 아이템 등장!!', g3: '🔮 SS 아이템 등장!', g2: '💎 S 아이템 등장', gamble: '🎰 도박 카드 등장' }[t] || '레벨 업!';
      $('lv-title').className = cup ? 'glow g-text g-' + cup.g : 'glow' + (t ? ' t-' + t : '');
      this.renderWeaponLine($('lv-weapon'), w.build);
      $('reroll-n').textContent = w.rerolls;
      $('btn-reroll').classList.toggle('hidden', w.rerolls <= 0);
      const dice = $('btn-dice');
      dice.classList.toggle('hidden', !w.build.relics.dice);
      dice.disabled = w.diceUsed;
      dice.textContent = w.diceUsed ? '🎲 주사위 사용함' : '🎲 행운의 주사위 (무료 1회)';
      this.renderCards($('lv-cards'), w.choices, (i) => this.pickLevel(i));
      this.lvShown = true;
      this.lvAutoT = 0;
    },
    pickLevel(i) {
      this.world.choose(i);
      $('levelup').classList.add('hidden');
      this.lvShown = false;
      const note = RS.unlockNote(this.world.build); // a recruit card brought 제라두 (round 14)
      if (note) { RS.Audio.sfx('jackpot'); this.banner(note); }
    },
    // 반자동 picks a plain hand itself and leaves a graded / 약물 / gamble card to the player; 완전 오토 picks all.
    autoPicks(w) {
      const m = this.autoMode();
      return m === 'full' || (m === 'semi' && !w.choices.some((c) => SPECIAL(c) || c.cup));
    },
    refreshLevelUp() { this.lvShown = false; this.showLevelUp(); },

    // "지금 무기": the one weapon in hand in its grade colour (level-up screen, HUD).
    renderWeaponLine(el, b) {
      const w = b.weapon;
      el.innerHTML = '<span class="dim">지금 무기</span> <b class="g-text g-' + w.g + '"></b> <span class="dim"></span>';
      el.querySelector('b').textContent = RS.weaponIcon(w) + ' ' + RS.weaponName(b, w) + ' · ' + RS.gradeTag(w);
      el.lastChild.textContent = '· 무기 공격력 ' + RS.weaponPower(w) + (b.armory.length ? ' · 무기고 ' + b.armory.length + '개' : '');
    },

    // A 무기 상자 result as a card: into the hand, into the 무기고, or a copy no better than one owned (coins back).
    boxCard(b, res) {
      const w = res.w;
      return { kind: 'weapon', g: w.g, icon: RS.weaponIcon(w), name: RS.weaponName(b, w), tag: RS.gradeTag(w),
        desc: res.kept === 'hand' ? '🎉 지금 무기보다 세다 — 바로 장착!' : res.kept === 'armory' ? '무기고에 보관 (훈련장에서 바꿔 들 수 있다)' : '이미 더 좋은 같은 무기가 있다 — 코인 ' + res.refund + ' 돌려받음',
        hint: '무기 공격력 ' + RS.weaponPower(w) };
    },

    // In-run transfer offer (rescue marker with a full squad).
    showSwap() {
      const w = this.world;
      this.input.release();
      $('levelup').classList.remove('hidden');
      $('lv-title').textContent = '영입 · 누구를 내보낼까요?';
      $('lv-title').className = 'glow';
      $('btn-reroll').classList.add('hidden');
      $('btn-dice').classList.add('hidden');
      this.renderCards($('lv-cards'), w.swapChoices, (i) => {
        w.chooseSwap(i);
        $('levelup').classList.add('hidden');
        this.swapShown = false;
      });
      this.swapShown = true;
    },

    showChest() {
      const w = this.world;
      this.input.release();
      $('chest').classList.remove('hidden');
      const items = w.chestResult.items.map((c) => ({ kind: c.kind, icon: c.icon, name: c.name, desc: c.desc, tag: c.tag }));
      items.push({ kind: 'gold', icon: '💰', name: '코인 +' + w.chestResult.coins, desc: '상자 안의 보너스', tag: '' });
      this.renderCards($('chest-items'), items, () => {});
      this.chestShown = true;
    },

    pause(on) {
      if (this.state !== 'play' || !this.world) return;
      if (on && (this.world.phase !== 'play')) return;
      this.paused = on;
      $('pause').classList.toggle('hidden', !on);
      if (on) { this.input.release(); $('pause-build').innerHTML = this.buildChips(this.world.build); for (const el of $('pause-build').querySelectorAll('.sqbtn')) el.remove(); }
    },

    banner(text) {
      const b = $('banner');
      b.textContent = text;
      b.classList.remove('hidden');
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
      clearTimeout(this._bt);
      this._bt = setTimeout(() => b.classList.add('hidden'), 1800);
    },
    toast(text) { this.banner(text); },

    // ------------------------------------------------------------ end of year
    endYear() {
      const w = this.world;
      const out = RS.finishYear(this.save, w);
      this.persist();
      this.state = 'menu';
      this.input.enabled = false;
      $('hud').classList.add('hidden');
      $('tap-hint').classList.add('hidden');
      $('vignette').classList.add('hidden'); this.hud.low = false;
      for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
      // penalties first (pkui.js): the season's real shootout once it is cleared, then the PK 챌린지 every fifth match
      const pk = [];
      if (RS.shootoutDue(this.save, out.idx, out.cleared)) pk.push({ kind: 'shootout', idx: out.idx, replay: !!out.replay });
      if (out.pkDue) pk.push({ kind: 'challenge', idx: out.idx });
      this.runPK(pk, () => (w.phase === 'victory' ? this.showVictory(w, out) : this.showResult(w, out)));
    },

    showResult(w, out) {
      this.show('result');
      const yd = RS.YEARS[out.idx];
      $('res-title').textContent = out.cleared ? yd.year + ' 시즌 클리어!' : '부상 아웃...';
      $('res-title').className = out.cleared ? 'glow' : '';
      $('res-sub').textContent = out.cleared ? (out.replay ? '다시하기 클리어 (커리어 진행에는 영향 없음)' : yd.boss.name + ' 격파! ' + this.cheerText(w.hero)) : '괜찮아, 다시 일어나면 돼. 코인은 그대로 받는다.';
      const m = Math.floor(w.t / 60), s = Math.floor(w.t % 60);
      $('res-stats').innerHTML = '';
      const add = (v, l, wide) => { const d = document.createElement('div'); d.className = 'stat' + (wide ? ' wide' : ''); d.innerHTML = '<b></b><span></span>'; d.querySelector('b').textContent = v; d.querySelector('span').textContent = l; $('res-stats').appendChild(d); };
      add(m + ':' + String(s).padStart(2, '0'), '경기 시간');
      add(out.kills, '처치');
      add('Lv.' + out.level, '레벨');
      add('+' + out.coins, '코인');
      if (out.ballon) add('+' + out.ballon, '발롱도르 🏆');
      if (out.ballonWon) add('🏆 ' + out.ballonWon + '회', '이번 커리어 발롱도르 · 발롱도르 공 ' + out.ballonWon + '개까지');
      if (out.rival) add(out.rival === 'win' ? '승 ⚔️' : '패 😤', '클라시코 vs ' + out.rivalName + (out.rival === 'win' ? ' · 민심 +' : ' · 민심 -') + RS.RIVAL_FANS);
      if (out.ballonStolen) add('🏆→' + out.rivalName, '발롱도르를 뺏겼다 · 다시 해서 되찾자');
      if (w.recruitedThisRun.length) add(w.recruitedThisRun.length + '명', '새 동료');
      if (out.farewell) {
        const f = out.farewell, name = (id) => RS.TEAMMATES[id].name;
        add('👋 동료 교체 ' + f.gone.length + '명', '작별: ' + f.gone.map(name).join(', ') + (f.joined.length ? '\n같은 강화로 합류: ' + f.joined.map((m) => name(m.id) + ' +' + m.lv).join(', ') : ''), true);
      }
      if (out.torres) add(out.torres === 'win' ? '격파 ⚡' : '놓침', RS.TORRES.name + (out.torres === 'win' ? ' · 추가 보상' : ' · 30초 안에 잡으면 추가 보상'));
      if (out.unlockTorres) add('🔓 토레쓰', '새 캐릭터 해금 · 메뉴에서 고를 수 있다');
      // round 14: a 첼씨 시련 cleared lifts 첼씨 토레쓰's grade; the last one unlocks 성공한 첼씨 토레쓰
      if (out.cgrade) add(RS.GRADES[out.cgrade.from].name + ' → ' + RS.GRADES[out.cgrade.to].name, '첼씨 토레쓰 등급 상승 · 시련 ' + yd.ctrial + '/' + RS.CHELSEA.trials + (out.cgrade.to >= RS.GRADE_TOP ? ' · 900억을 갚았다' : ''), true);
      if (out.unlockBlue) add('✨ 성공한 첼씨 토레쓰', '획득! 다음 토레쓰 커리어는 SSS 첼씨 토레쓰로 시작한다 (파란 유니폼 · 공격력 125% · 체력 +25)', true);
      if (out.suarez) add('🦷 길들였다', '이빨괴물 수아레즈 · 이제부터 준보스로 불쑥 난입한다');
      const next = $('btn-res-next'), retry = $('btn-res-retry');
      $('res-reward').classList.add('hidden');
      // Rewards to pick before moving on: 토레쓰's (beaten after 드록빠) first, then the season boss's.
      const steps = [];
      if (out.cleared && RS.needsTorresReward(this.save)) steps.push('torres');
      if (out.cleared && !out.replay && RS.needsBossReward(this.save, out.idx)) steps.push('boss');
      const rewards = (done) => this.pickRewards(steps, out.idx, done);
      if (out.cleared && !out.replay) {
        next.classList.remove('hidden');
        next.textContent = '다음 시즌: ' + RS.YEARS[this.save.career.yearIdx].year + ' ▶';
        next.onclick = () => this.startYear(this.save.career.yearIdx);
        retry.classList.add('hidden');
        rewards(() => this.armAuto(() => this.startYear(this.save.career.yearIdx), 2400, '다음 시즌으로', 'semi'));
      } else if (out.cleared) {
        next.classList.remove('hidden');
        next.textContent = '연도 선택';
        next.onclick = () => this.showYears();
        retry.classList.remove('hidden');
        retry.textContent = '한 번 더';
        retry.onclick = () => this.startYear(out.idx);
        rewards(() => {});
      } else {
        next.classList.remove('hidden');
        next.textContent = '재도전 ↺';
        next.onclick = () => this.startYear(out.idx);
        retry.classList.remove('hidden');
        retry.textContent = '🛒 훈련장에서 강화';
        retry.onclick = () => this.showShop();
        this.armAuto(() => this.startYear(out.idx), 3000, '재도전', 'semi');
      }
      this.makeAttract();
    },

    // The result screen's reward panel: `steps` ('torres', 'boss') are offered one at a time, the boss reward being
    // season `idx`'s; `done` runs after the last pick.
    pickRewards(steps, idx, done) {
      const next = $('btn-res-next'), kind = steps.shift();
      if (!kind) { $('res-reward').classList.add('hidden'); next.classList.remove('hidden'); done(); return; }
      next.classList.add('hidden');
      $('res-reward').classList.remove('hidden');
      const torres = kind === 'torres';
      $('res-reward-sub').textContent = torres ? '⚡ 토레쓰 격파 보상 — 하나를 고르세요' : '🏆 보스 보상 — 하나를 고르세요 (커리어 내내 유지)';
      const cards = torres ? RS.torresRewardChoices(this.save) : RS.bossRewardChoices(this.save, idx, this.rng);
      const pick = (i) => {
        this.cancelAuto();
        const c = cards[i], b = this.save.career.build;
        if (torres) {
          const info = RS.applyTorresReward(this.save, c, this.rng);
          const wp = info.weapon;
          this.toast(wp ? (info.kept ? RS.gradeTag(wp) + ' ' + RS.weaponName(b, wp) + (info.kept === 'hand' ? ' 장착!' : ' → 무기고') : '같은 무기가 이미 있다 · 코인 +500') : c.name + '!');
        } else {
          const info = RS.applyBossReward(this.save, idx, c, this.rng);
          this.toast(c.name + (info.coach ? ': ' + RS.coachCard(info.coach).name : '') + ' 획득!');
        }
        this.persist();
        RS.Audio.sfx('recruit');
        this.pickRewards(steps, idx, done);
      };
      this.renderCards($('res-reward-cards'), cards, pick);
      // 완전 오토: 토레쓰's weapon (a 영웅 or 전설 one), the boss reward by RS.autoRewardPick
      this.armAuto(() => pick(torres ? Math.max(0, cards.findIndex((c) => c.id === 'weapon')) : RS.autoRewardPick(cards)), 2200, 'AI가 보상을 고른다', 'full');
    },

    // Rewards left unpicked before a reload (RS.pendingRewards): the result screen comes back with only those, then
    // the match the player asked for starts.
    showPendingRewards(steps, done) {
      this.show('result');
      $('res-title').textContent = '아직 안 받은 보상';
      $('res-title').className = 'glow';
      $('res-sub').textContent = '지난 경기 보상을 고르면 바로 시작한다';
      $('res-stats').innerHTML = '';
      $('btn-res-retry').classList.add('hidden');
      this.pickRewards(steps, this.save.career.yearIdx - 1, done);
    },

    showVictory(w, out) {
      this.show('victory');
      const ws = $('win-sprites'); ws.innerHTML = '';
      const hero = this.save.career.build.hero;
      ws.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(hero, RS.YEARS.length - 1, 1, null, RS.smallBody(this.save.career.build)), 0, 8));
      const fallen = RS.Sprites.boss(RS.YEARS[RS.YEARS.length - 1].boss.type, RS.YEARS.length - 1);
      const ms = RS.Sprites.toCanvas(fallen, 0, 5); ms.style.opacity = '0.7'; ms.style.transform = 'rotate(80deg)';
      ws.appendChild(ms);
      $('win-stats').innerHTML = '';
      const add = (v, l) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b></b><span></span>'; d.querySelector('b').textContent = v; d.querySelector('span').textContent = l; $('win-stats').appendChild(d); };
      add('+' + out.coins, '코인');
      add('+' + out.ballon, '발롱도르 🏆');
      add(w.kills, '처치');
      add('Lv.' + w.build.level, '최종 레벨');
      const D = RS.DIFFS[RS.DIFF];
      add(D.icon, D.name + ' 클리어');
      if (RS.hardMode(w.build)) add('🧒', '작은 몸 도전 클리어');
      $('win-title').textContent = RS.HEROES[hero].rival + '를 꺾었다!';
      $('win-cheer').textContent = hero === 'messi' ? '☝️ 메시! 메시!' : hero === 'torres' ? '⚡ 엘 니뇨!' : 'SIUUUU!';
      $('btn-win-new').textContent = '새 커리어 (' + (this.save.career.laps + 2) + '회차)';
      const conf = $('confetti'); conf.innerHTML = '';
      const cols = ['#ffd23a', '#c41e2a', '#1f7a3a', '#ffffff', '#7fe0ff'];
      for (let i = 0; i < 60; i++) {
        const c = document.createElement('i');
        c.style.left = (Math.random() * 100) + '%';
        c.style.background = cols[i % cols.length];
        c.style.animationDuration = (2.5 + Math.random() * 3) + 's';
        c.style.animationDelay = (-Math.random() * 4) + 's';
        conf.appendChild(c);
      }
      this.celebrate(hero);
      setTimeout(() => this.celebrate(hero), 2700);
    },
    // SIUU is 날두's: 메시 and 토레쓰 celebrate with the crowd (a finger to the sky, 엘 니뇨).
    celebrate(hero) { if (hero === 'ronaldo') RS.Audio.siuu(); else RS.Audio.sfx('cheer'); },
    cheerText(hero) { return hero === 'messi' ? '☝️' : hero === 'torres' ? '⚡' : 'SIUU!'; },

    // ------------------------------------------------------------ main loop
    frame(ts) {
      const dt = Math.min(0.1, (ts - this.last) / 1000);
      this.last = ts;
      try {
        if (this.state === 'pk' && this.pk) this.tickPK(dt);
        else if (this.state === 'play' && this.world) this.tick(dt);
        else if (this.attract && this.screen === 'title') {
          this.attract.view = this.renderer.view;
          this.attractAcc = (this.attractAcc || 0) + dt;
          let n = 0;
          while (this.attractAcc >= STEP && n < 3) {
            const a = this.attract;
            if (a.phase === 'levelup') a.choose(RS.botChoose(a.choices, a.build));
            else if (a.phase === 'swap') a.chooseSwap(a.swapChoices.length - 1);
            else if (a.phase === 'chest') a.closeChest();
            else if (a.phase !== 'play' || a.t > 80) this.makeAttract();
            else a.update(STEP, RS.botInput(a));
            this.attractAcc -= STEP; n++;
          }
          if (n >= 3) this.attractAcc = 0;
          this.attract.events.length = 0;
          this.renderer.render(this.attract, { camDy: 0.34, alpha: this.attract.phase === 'play' ? Math.min(1, this.attractAcc / STEP) : 1 }); // keep the running 날두 below the title labels
        } else if (this.world) this.renderer.render(this.world, null);
        else if (this.attract) this.renderer.render(this.attract, null);
      } catch (err) {
        console.error(err);
        this.lastError = String(err && err.stack || err);
      }
      requestAnimationFrame((t) => this.frame(t));
    },

    tick(dt) {
      const w = this.world;
      if (!this.paused) {
        if (this.hitStop > 0) { // a big hit freezes the match for a few frames (RS.HIT_STOP); the picture still draws
          this.hitStop -= dt;
        } else if (w.phase === 'play') {
          this.acc = (this.acc || 0) + dt * (this.speed || 1); // 2x: more fixed steps per frame, same physics
          let n = 0;
          let v = this.input.vector();
          if ((v.x || v.y) && !$('tap-hint').classList.contains('hidden')) $('tap-hint').classList.add('hidden');
          // auto play: the bot runs 메시/날두 while the screen is not touched (a touch takes over at once)
          if (!v.x && !v.y && this.autoMode() !== 'off') v = RS.botInput(w);
          const maxSteps = 4 * (this.speed || 1);
          while (this.acc >= STEP && n < maxSteps && w.phase === 'play') { w.update(STEP, v); this.acc -= STEP; n++; }
          if (n >= maxSteps) this.acc = 0;
        } else {
          this.acc = 0;
          w.update(dt, null); // fx only
        }
        this.handleEvents();
        if (w.phase === 'levelup' && !this.lvShown) this.showLevelUp();
        if (w.phase === 'chest' && !this.chestShown) { this.showChest(); this.chestT = 0; }
        if (w.phase === 'swap' && !this.swapShown) { this.showSwap(); this.swapT = 0; }
        if (this.autoMode() !== 'off') { // auto picks wait a beat so the cards can be read
          if (w.phase === 'levelup' && this.lvShown && this.autoPicks(w) && (this.lvAutoT += dt) > 0.6) this.pickLevel(RS.botChoose(w.choices, w.build));
          else if (w.phase === 'chest' && this.chestShown && (this.chestT += dt) > 1.1) $('btn-chest-ok').click();
          else if (w.phase === 'swap' && this.swapShown && this.autoMode() === 'full' && (this.swapT += dt) > 1) {
            w.chooseSwap(w.swapChoices.length - 1); // keep the squad
            $('levelup').classList.add('hidden');
            this.swapShown = false;
          }
        }
        if (w.phase === 'clear' || w.phase === 'dead' || w.phase === 'victory') {
          this.endT += dt;
          if (!this.ended && this.endT > (w.phase === 'dead' ? 1.2 : 1.8)) { this.ended = true; this.endYear(); return; }
        }
      }
      // alpha: how far the clock is into the next fixed step — the renderer draws between the last two steps
      this.renderer.render(w, { joy: this.input.joy, alpha: w.phase === 'play' && !this.paused ? Math.min(1, this.acc / STEP) : 1 });
      this.updateHud();
    },

    handleEvents() {
      const w = this.world;
      for (const e of w.events) {
        switch (e.type) {
          case 'sfx': RS.Audio.sfx(e.name); break;
          case 'siuu': this.celebrate(w.hero); break;
          case 'siuuuWeapon': { // round 19: a SIUUU weapon in hand (World.siuuuMoment)
            const wp = w.build.weapon;
            this.banner('🏆 SIUUU 무기! ' + RS.weaponIcon(wp) + ' ' + RS.weaponName(w.build, wp));
            RS.Audio.sfx('jackpot'); RS.Audio.sfx('evolve');
            setTimeout(() => this.celebrate(w.hero), 350);
            break;
          }
          case 'levelup': RS.Audio.sfx('levelup'); this.renderer.shake = Math.max(this.renderer.shake, 0.1); $('hud-power').parentElement.classList.remove('bump'); void $('hud-power').offsetWidth; $('hud-power').parentElement.classList.add('bump'); break;
          case 'shake': this.renderer.shake = Math.max(this.renderer.shake, e.k || 0.1); break;
          case 'hitstop': this.hitStop = Math.max(this.hitStop || 0, e.t || 0); break;
          case 'wave': RS.Audio.sfx('wave'); this.renderer.shake = Math.max(this.renderer.shake, 0.12); break;
          case 'mini': RS.Audio.sfx('warn'); break;
          case 'miniKill': RS.Audio.sfx('chest'); this.toast(e.name + ' 격파!'); break;
          case 'slide': this.renderer.shake = Math.max(this.renderer.shake, 0.05); break;
          case 'chest': RS.Audio.sfx('chest'); break;
          case 'evolve': RS.Audio.sfx('evolve'); this.renderer.shake = 0.2; break;
          case 'special': // an item / 약물 / gamble card was dealt (a gamble card has no grade)
            if (e.g >= 4) { RS.Audio.sfx('jackpot'); this.renderer.shake = Math.max(this.renderer.shake, 0.15); } else RS.Audio.sfx('sparkle');
            break;
          case 'stim':
            this.banner('💉 약물 꽂기 ' + e.n + '/' + RS.STIM.max + (e.n >= RS.STIM.max ? ' — 풀강!!' : ' — 몸이 끓어오른다!'));
            RS.Audio.sfx('stim');
            this.renderer.shake = Math.max(this.renderer.shake, 0.3);
            break;
          case 'relic': {
            const r = RS.RELICS[e.id];
            this.banner(RS.GRADES[e.g].name + ' 아이템 획득! ' + r.icon + ' ' + r.name);
            RS.Audio.sfx(e.g >= 4 ? 'jackpot' : e.g === 3 ? 'evolve' : 'chest');
            if (e.g >= 4) this.renderer.shake = 0.4;
            break;
          }
          case 'gamble': {
            const r = e.relic && RS.RELICS[e.relic];
            this.banner((e.win ? '🎉 ' : '💀 ') + e.text + (r ? ' · ' + r.icon + ' ' + r.name : ''));
            RS.Audio.sfx(e.win ? 'jackpot' : 'lose');
            if (e.win) this.renderer.shake = Math.max(this.renderer.shake, 0.25);
            break;
          }
          case 'hurt': RS.Audio.sfx('hurt'); this.renderer.shake = 0.25;
            // round 13.2: a red edge flash on every hit ("맞은 줄도 모르겠음")
            document.body.classList.add('hurt-flash'); clearTimeout(this.hurtFlashT);
            this.hurtFlashT = setTimeout(() => document.body.classList.remove('hurt-flash'), 180);
            if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* ignore */ } break;
          case 'boss':
            RS.Audio.sfx('boss');
            this.banner((e.final ? '최종 보스 등장: ' : '시즌 보스 등장: ') + e.name);
            $('bossbar').classList.remove('hidden');
            $('boss-name').textContent = e.name;
            break;
          case 'rival':
            RS.Audio.sfx('boss');
            this.banner('⚔️ 엘 클라시코! ' + e.name + ' 등장 (' + (e.lv + 1) + '년차) · ' + e.secs + '초 안에 잡아라');
            $('bossbar').classList.remove('hidden');
            this.renderer.shake = Math.max(this.renderer.shake, 0.3);
            break;
          case 'rivalEnd':
            $('bossbar').classList.add('hidden');
            if (e.win) { RS.Audio.sfx('cheer'); this.banner('🏆 클라시코 승리! ' + e.name + ' 격파'); this.renderer.shake = 0.5; }
            else { RS.Audio.sfx('lose'); this.banner('😤 ' + e.name + '가 경기를 끝냈다 — 클라시코 패배'); }
            break;
          case 'torres': // 드록빠 is down and the season cleared: 토레쓰 runs on (RS.TORRES)
            RS.Audio.sfx('boss');
            this.banner('⚡ ' + e.name + ' 난입! ' + e.secs + '초 안에 잡으면 추가 보상 · 캐릭터 해금');
            $('bossbar').classList.remove('hidden');
            this.renderer.shake = Math.max(this.renderer.shake, 0.3);
            break;
          case 'torresEnd': // the 'clear' that follows carries the banner
            $('bossbar').classList.add('hidden');
            RS.Audio.sfx(e.win ? 'jackpot' : 'lose');
            break;
          case 'cine': // round 14: the 캄프 누 goal plays out (World.startCine)
            $('bossbar').classList.add('hidden');
            this.banner(e.text);
            break;
          case 'recruit': {
            RS.Audio.sfx('recruit'); this.banner(RS.TEAMMATES[e.id].name + (e.bench ? ' 벤치 합류!' : ' 합류!') + (e.swap ? ' (' + RS.TEAMMATES[e.swap].name + ' 이적)' : ''));
            const note = RS.unlockNote(w.build); // 제라두 → 제토라인 (round 14)
            if (note) { RS.Audio.sfx('jackpot'); setTimeout(() => this.banner(note), 1600); }
            break;
          }
          case 'rescueSpawn': this.banner((e.swap ? '이적 제안! ' : '동료 발견! ') + RS.TEAMMATES[e.id].name + ' 에게 가자'); break;
          case 'swap': RS.Audio.sfx('recruit'); break;
          case 'banner': this.banner(e.text); break;
          case 'rage': this.renderer.shake = 0.5; RS.Audio.sfx('boss'); break;
          case 'elite': this.banner('엘리트 등장! 보물 상자를 노려라'); break;
          case 'revive': this.celebrate(w.hero); break;
          case 'dead': RS.Audio.sfx('dead'); break;
          case 'clear':
            this.banner(w.torresResult === 'win' ? '⚡ ' + RS.TORRES.name + ' 격파! 추가 보상 획득' : w.torresResult ? RS.TORRES.name + '가 빠져나갔다 · 시즌 클리어' : '시즌 클리어! ' + this.cheerText(w.hero));
            RS.Audio.sfx('cheer'); this.renderer.shake = 0.5; break;
          case 'victory': this.banner(RS.HEROES[w.hero].rival + ' 격파!!!'); RS.Audio.sfx('cheer'); this.renderer.shake = 0.8; break;
        }
      }
      w.events.length = 0;
      if (w.phase !== 'chest') this.chestShown = false;
    },

    setText(key, el, v) { if (this.hud[key] !== v) { this.hud[key] = v; el.textContent = v; } },
    setSpeed(s) {
      this.speed = s;
      $('btn-speed').textContent = s + 'x';
      $('btn-speed').classList.toggle('on', s === 2);
      try { localStorage.setItem('rs_speed', String(s)); } catch (e) { /* ignore */ }
    },
    updateHud() {
      const w = this.world;
      const b = w.build;
      const xpr = Math.min(1, b.xp / RS.xpToNext(b.level));
      const xs = Math.round(xpr * 100);
      if (this.hud.xp !== xs) { this.hud.xp = xs; $('xpfill').style.width = xs + '%'; }
      this.setText('lv', $('hud-level'), 'Lv.' + b.level);
      this.setText('yr', $('hud-year'), w.yearDef.year + ' · ' + RS.yearAge(w.yearIdx) + '세 · ' + RS.DIFFS[RS.DIFF].name);
      this.setText('k', $('hud-kills'), String(w.kills));
      this.setText('c', $('hud-coins'), String(Math.round(w.coinsPicked)));
      this.setText('pw', $('hud-power'), String(w.power()));
      const wp = b.weapon, wk = wp.id + '|' + wp.g + '|' + wp.p;
      if (this.hud.wk !== wk) { // the one weapon in hand, in its grade colour
        this.hud.wk = wk;
        $('hud-weapon').className = 'hud-small hud-weapon g-text g-' + wp.g;
        $('hud-weapon').textContent = RS.weaponIcon(wp) + ' ' + RS.weaponName(b, wp) + ' ';
        const tag = document.createElement('span'); // the grade and its +N wrap as one piece on a narrow phone
        tag.className = 'nw'; tag.textContent = RS.gradeTag(wp);
        $('hud-weapon').appendChild(tag);
      }
      const cdMax = w.slideCooldown(), cdLeft = w.player.slideCd;
      const cdPct = Math.round(cdLeft / cdMax * 100);
      if (this.hud.cd !== cdPct) { this.hud.cd = cdPct; $('slide-cd').style.height = cdPct + '%'; $('btn-slide').classList.toggle('ready', cdPct === 0); }
      const low = w.phase === 'play' && w.player.hp / w.stats.maxHp < 0.25;
      if (this.hud.low !== low) { this.hud.low = low; $('vignette').classList.toggle('hidden', !low); }
      if (low && !this.paused) RS.Audio.sfx('heart');
      let tstr;
      if (!w.bossSpawned) { const r = Math.max(0, Math.ceil(w.stageTime - w.t)); tstr = Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0'); }
      else tstr = 'BOSS';
      this.setText('t', $('hud-time'), tstr);
      const bb = w.boss || w.rival;
      if (bb) {
        const r = Math.max(0, Math.round(bb.hp / bb.maxHp * 1000) / 10);
        if (this.hud.bh !== r) { this.hud.bh = r; $('boss-fill').style.width = r + '%'; }
        // the rival's and 토레쓰's bars count down their window
        this.setText('bn', $('boss-name'), bb.rival || bb.special ? (bb.rival ? '⚔️ ' : '⚡ ') + bb.name + ' · ' + Math.max(0, Math.ceil(bb.leaveAt - w.t)) + '초' : bb.name);
      }
    },

    // ------------------------------------------------------------ buttons
    updateMuteButtons() {
      const m = this.save.meta.muted;
      $('btn-mute').textContent = m ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
      $('btn-mute-hud').textContent = m ? '🔇' : '🔊';
      $('btn-pause-mute').textContent = m ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
    },
    toggleMute() {
      this.save.meta.muted = !this.save.meta.muted;
      RS.Audio.setMuted(this.save.meta.muted);
      this.persist();
      this.updateMuteButtons();
    },

    bind() {
      $('btn-play').onclick = () => {
        RS.Audio.sfx('click');
        const c = this.save.career;
        if (c.over) this.showEnding(c.over);
        else if (c.finished) this.showYears();
        else this.startYear(c.yearIdx);
      };
      for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { RS.Audio.sfx('click'); this.setDiff(b.dataset.diff); };
      for (const b of document.querySelectorAll('[data-auto]')) b.onclick = () => { RS.Audio.sfx('click'); this.setAuto(b.dataset.auto); };
      $('auto-badge').onclick = () => { RS.Audio.sfx('click'); this.setAuto('off'); this.toast('✋ 수동으로 전환'); };
      $('btn-auto').onclick = (e) => {
        e.stopPropagation();
        const m = RS.AUTO_MODES[(RS.AUTO_MODES.indexOf(this.autoMode()) + 1) % RS.AUTO_MODES.length];
        this.setAuto(m);
        this.banner({ off: '✋ 수동 — 직접 조작', semi: '🤖 반자동 — 중요한 선택만 내가', full: '🚀 완전 오토 — 전부 AI가' }[m]);
        if (this.world && this.world.phase === 'levelup' && this.lvShown) this.lvAutoT = 0;
      };
      $('btn-years').onclick = () => this.showYears();
      // Restart the active hero's career (e.g. a 메시 career saved before the youth seasons, to make the
      // growth-hormone choice). Coins, 발롱도르 and 훈련장 upgrades are shared meta and stay.
      $('btn-restart').onclick = () => {
        const h = RS.HEROES[this.save.career.build.hero];
        if (!window.confirm(h.name + ' 커리어를 처음부터 다시 시작할까요?\n지금 커리어(연도·스킬·동료)는 사라지고, 코인·발롱도르·훈련장 강화는 그대로 남습니다.')) return;
        RS.newCareer(this.save);
        this.persist();
        this.showTitle();
        this.toast(h.name + ' 커리어를 처음부터 시작합니다');
      };
      $('btn-shop').onclick = () => this.showShop();
      $('btn-cup').onclick = () => { RS.Audio.sfx('click'); this.startCup(); };
      $('btn-howto').onclick = () => this.show('howto');
      $('btn-mute').onclick = () => this.toggleMute();
      $('btn-mute-hud').onclick = (e) => { e.stopPropagation(); this.toggleMute(); };
      $('btn-pause-mute').onclick = () => this.toggleMute();
      for (const [id, key] of [['vol-sfx', 'sfx'], ['vol-siu', 'siu']]) {
        const el = $(id);
        el.value = String(Math.round(RS.Audio.vol[key] * 100));
        el.oninput = () => { RS.Audio.setVolume(key, +el.value / 100); };
        el.onchange = () => { RS.Audio.unlock(); RS.Audio.sfx(key === 'siu' ? 'click' : 'kick'); if (key === 'siu') RS.Audio.siuu(); };
      }
      $('btn-sound-test').onclick = () => RS.Audio.test();
      $('btn-pause').onclick = (e) => { e.stopPropagation(); this.pause(true); };
      $('btn-speed').onclick = (e) => { e.stopPropagation(); this.setSpeed(this.speed === 2 ? 1 : 2); };
      const slide = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } if (this.state === 'play' && this.world && !this.paused && this.world.slide()) RS.Audio.sfx('dash'); };
      $('btn-slide').addEventListener('pointerdown', slide);
      window.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.key === 'Shift') && this.state === 'play') { e.preventDefault(); slide(); } });
      $('btn-resume').onclick = () => this.pause(false);
      $('btn-quit').onclick = () => {
        this.paused = false;
        $('pause').classList.add('hidden');
        const w = this.world;
        w.phase = 'dead';
        this.endYear();
      };
      $('btn-reroll').onclick = () => { if (this.world.reroll()) this.refreshLevelUp(); };
      $('btn-dice').onclick = () => { if (this.world.rollDice()) { RS.Audio.sfx('sparkle'); this.refreshLevelUp(); } };
      $('btn-chest-ok').onclick = () => { this.world.closeChest(); $('chest').classList.add('hidden'); this.chestShown = false; };
      $('btn-res-menu').onclick = () => this.showTitle();
      $('btn-win-menu').onclick = () => this.showTitle();
      $('btn-win-new').onclick = () => { RS.newCareer(this.save); this.persist(); this.showTitle(); };
      for (const b of document.querySelectorAll('#hero-pick .hero')) b.onclick = () => this.pickHero(b.dataset.hero);
      for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => this.showTitle();
      for (const b of document.querySelectorAll('[data-home]')) b.onclick = () => this.showTitle();
      // PK (pkui.js): taps on the pitch aim, stop the gauge and the needle, or pick the keeper's dive
      $('game').addEventListener('pointerdown', (e) => { if (this.state === 'pk') this.pkTap(e); });
      $('btn-pk-auto').onclick = () => { RS.Audio.sfx('click'); this.pkToggleAuto(); };
      window.addEventListener('keydown', (e) => {
        if (this.state === 'pk') { this.pkKey(e); return; }
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (this.state === 'play') this.pause(!this.paused); }
        if (this.state === 'play' && this.world && this.world.phase === 'levelup' && this.lvShown && ['1', '2', '3', '4'].includes(e.key)) {
          const btn = $('lv-cards').children[+e.key - 1]; if (btn) btn.click();
        }
      });
    }
  };

  Object.assign(App, RS.PKUI); // the PK screens (pkui.js)
  RS.App = App;
  window.RSApp = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
  else App.boot();
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).main = 'R31';
