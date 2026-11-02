/* 호날두 서바이버즈 — app shell: screens, HUD, main loop. Game rules live in game.js / career.js. */
(function (RS) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STEP = 1 / 60;

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
      window.addEventListener('resize', () => this.renderer.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 200));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { RS.Audio.suspend(); if (this.state === 'play') this.pause(true); }
        else RS.Audio.resume();
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

    // ------------------------------------------------------------ screens
    show(id) {
      for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
      this.screen = id;
    },
    hideScreens() { for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); this.screen = null; },

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
      $('btn-play').textContent = c.finished ? '🏆 커리어 완주! 다시 보기' : started ? '▶ 이어하기 · ' + yd.year + '년' : '⚽ ' + hero.name + ' 커리어 시작';
      $('title-progress').textContent = (c.finished ? hero.rival + '를 꺾은 전설 · ' + (c.laps + 1) + '회차' : hero.name + ' · ' + yd.year + '년 · ' + RS.yearAge(c.yearIdx) + '세 · ' + RS.ERAS[yd.era].club) +
        (RS.hardMode(c.build) ? ' · 🔥 하드 모드' : '');
      for (const b of document.querySelectorAll('#hero-pick .hero')) b.classList.toggle('on', b.dataset.hero === c.build.hero);
      this.renderWallet($('title-wallet'));
      const ts = $('title-sprite'); ts.innerHTML = '';
      ts.appendChild(RS.Sprites.toCanvas(RS.Sprites.hero(c.build.hero, c.yearIdx, 1, null, RS.smallBody(c.build)), 0, 7));
      this.makeAttract();
    },

    // Title screen hero buttons: each hero keeps his own career; meta progress is shared.
    pickHero(hero) {
      if (hero === this.save.career.build.hero) return;
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
        b.className = 'year' + (cur ? ' cur' : '') + (!can ? ' lock' : '') + (y.final ? ' final' : '');
        const st = c.cleared[i] ? '✅ 다시하기' : cur ? '▶ 플레이' : '🔒';
        b.innerHTML = '<div class="yy">' + y.year + '</div><div class="yi"><div class="yt"></div><div class="yc"></div></div><div class="ys">' + st + '</div>';
        b.querySelector('.yt').textContent = y.title;
        b.querySelector('.yc').textContent = RS.yearAge(i) + '세 · ' + RS.ERAS[y.era].club + ' · 보스: ' + y.boss.name + (y.ballon ? ' · 🏆' : '');
        b.disabled = !can;
        b.onclick = () => { RS.Audio.sfx('click'); this.startYear(i); };
        list.appendChild(b);
        if (cur) setTimeout(() => b.scrollIntoView({ block: 'center' }), 0);
      });
    },

    showShop() {
      this.show('shop');
      this.renderWallet($('shop-wallet'));
      const list = $('shop-list'); list.innerHTML = '';
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
      if (RS.needsEvent(this.save, idx)) this.showEvent(idx);
      else this.afterEvent(idx);
    },

    afterEvent(idx) {
      if (RS.needsCoach(this.save, idx)) this.showCoach(idx);
      else this.afterCoach(idx);
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
      this.renderCards($('ev-cards'), cards, (i) => {
        const info = RS.applyEvent(this.save, idx, cards[i]);
        this.persist();
        RS.Audio.sfx(cards[i].hgh === false ? 'boss' : 'evolve');
        this.toast(info.text + (info.mate ? ' · ' + RS.TEAMMATES[info.mate].name + ' 합류!' : ''));
        this.afterEvent(idx);
      });
    },

    afterCoach(idx) {
      const offers = RS.transferOffers(this.save, idx, this.rng);
      if (offers.length) this.showTransfer(idx, offers, 0);
      else this.showIntro(idx);
    },

    // Club changed: era players offer to join (free slot) or swap with a teammate (who passes on his level).
    showTransfer(idx, offers, k) {
      if (k >= offers.length) { RS.finishTransfers(this.save, idx); this.persist(); this.showIntro(idx); return; }
      this.show('transfer');
      const yd = RS.YEARS[idx];
      const id = offers[k];
      const nm = RS.TEAMMATES[id];
      const b = this.save.career.build;
      $('tr-club').textContent = yd.year + ' · ' + RS.ERAS[yd.era].club + ' 이적 시장 (' + (k + 1) + '/' + offers.length + ')';
      $('tr-name').textContent = nm.name;
      $('tr-role').textContent = RS.mateLine(id);
      const sp = $('tr-sprite'); sp.innerHTML = '';
      sp.appendChild(RS.Sprites.toCanvas(RS.Sprites.mate(id, idx), 0, 4));
      const cards = [];
      if (b.teammates.length < RS.MAX_MATES) cards.push({ kind: 'recruit', icon: '🤝', name: '선발로 영입', desc: nm.name + ' Lv.1 합류', tag: '영입', hint: RS.synergyHint(b, id), out: null, take: true });
      else if (b.bench.length < RS.MAX_BENCH) cards.push({ kind: 'recruit', icon: '🪑', name: '벤치로 영입', desc: nm.name + ' Lv.1 합류', tag: '벤치', hint: RS.synergyHint(b, id), out: null, take: true });
      for (const m of RS.allMates(b)) cards.push({ kind: 'swap', icon: '🔄', name: RS.TEAMMATES[m.id].name + ' 방출', desc: RS.mateLine(m.id), tag: 'Lv.' + m.lv + ' 승계' + (b.bench.includes(m) ? ' · 벤치' : ' · 선발'), out: m.id, take: true });
      cards.push({ kind: 'keep', icon: '✋', name: '영입하지 않기', desc: '지금 스쿼드 그대로 간다.', tag: '유지', take: false });
      this.renderCards($('tr-cards'), cards, (i) => {
        const c = cards[i];
        RS.applyTransfer(this.save, idx, c.take ? id : null, c.out);
        this.persist();
        if (c.take) this.toast(nm.name + ' 합류!');
        this.showTransfer(idx, offers, k + 1);
      });
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
      this.renderCards($('coach-cards'), cards.map((c) => ({
        kind: c.id === 'recruit' ? 'recruit' : 'coach', icon: c.icon, name: c.name, desc: c.desc,
        tag: c.id === 'recruit' || c.id === 'train' ? '동료' : '감독 카드'
      })), (i) => {
        const info = RS.applyCoach(this.save, idx, cards[i], this.rng);
        this.persist();
        if (info.mate) this.toast(RS.TEAMMATES[info.mate].name + ' 합류!');
        this.afterCoach(idx);
      });
    },

    showIntro(idx) {
      this.show('intro');
      const yd = RS.YEARS[idx];
      const replay = RS.isReplay(this.save, idx);
      const b0 = RS.buildForYear(this.save, idx), small = RS.smallBody(b0);
      $('intro-year').textContent = yd.year;
      $('intro-club').textContent = RS.yearAge(idx) + '세 · ' + RS.ERAS[yd.era].club + (replay ? ' · 다시하기 (커리어에 영향 없음)' : '') + (RS.hardMode(b0) ? ' · 🔥 하드 모드' : '');
      $('intro-title').textContent = yd.title;
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
        $('intro-vs').innerHTML = '⚔ ' + RS.HEROES[b.hero].short + ' 전투력 <b>' + RS.powerScore(b) + '</b> &nbsp;vs&nbsp; 상대 위협도 <b>' + '★'.repeat(stars) + '☆'.repeat(5 - stars) + '</b>';
      };
      drawSquad();
      $('intro-boss').textContent = (yd.final ? '최종 보스: ' : '시즌 보스: ') + yd.boss.name + ' (' + RS.BOSS_TYPES[yd.boss.type].sig + ') · 1분 버티면 등장';
      $('btn-kickoff').onclick = () => { RS.Audio.sfx('click'); this.play(idx); };
    },

    buildChips(b) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      let h = '<span class="chip">Lv.' + b.level + '</span>';
      for (const id of b.skillOrder) {
        const s = RS.SKILLS[id];
        h += b.evolved[id] ? '<span class="chip evo">' + s.evoIcon + ' ' + esc(s.evoName) + '</span>'
          : '<span class="chip">' + s.icon + ' ' + esc(s.name) + ' ' + b.skills[id] + '</span>';
      }
      for (const id of b.passiveOrder) h += '<span class="chip">' + RS.PASSIVES[id].icon + ' ' + b.passives[id] + '</span>';
      for (const id of b.relicOrder || []) { const r = RS.RELICS[id]; h += '<span class="chip t-' + r.tier + '">' + r.icon + ' ' + esc(r.name) + '</span>'; }
      if (b.coachCards.length) h += '<span class="chip">👔 감독 카드 ' + b.coachCards.length + '</span>';
      return h + this.squadLines(b);
    },

    // Squad panel: the two on the pitch (with their partnership), then the bench. Buttons swap pitch ↔ bench
    // between seasons (data-sq attributes; bindSquad wires them).
    squadLines(b) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      if (!RS.allMates(b).length) return '<div class="squad"><div class="sq empty">동료 없음 — 필드의 ! 표시로 영입</div></div>';
      const row = (m, onPitch) => '<div class="sq' + (onPitch ? '' : ' bench') + '"><b>' + esc(RS.TEAMMATES[m.id].name) + '</b> <span class="lv">Lv.' + m.lv + '</span>' +
        '<button class="sqbtn" data-sq="' + m.id + '">' + (onPitch ? '벤치로' : '선발로') + '</button>' +
        '<div class="rl">' + esc(RS.mateLine(m.id)) + (onPitch ? '' : ' (벤치: 1/3)') + '</div></div>';
      let h = '<div class="squad"><div class="sqh">선발 ' + b.teammates.length + '/' + RS.MAX_MATES + '</div>';
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
      for (const btn of root.querySelectorAll('.sqbtn')) btn.onclick = (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.sq;
        const onPitch = b.teammates.some((m) => m.id === id);
        // bench → pitch with a full pitch: swap with the first starter
        const ok = RS.toggleBench(b, id, !onPitch && b.teammates.length >= RS.MAX_MATES ? b.teammates[0].id : null);
        if (!ok) { this.toast('벤치가 가득 찼어요'); return; }
        this.persist();
        rerender();
      };
    },

    play(idx) {
      this.world = RS.startYear(this.save, idx, { view: this.renderer.view });
      this.world.view = this.renderer.view;
      this.playIdx = idx;
      this.state = 'play';
      this.paused = false;
      this.endT = 0;
      this.ended = false;
      this.input.enabled = true;
      this.input.release();
      this.hideScreens();
      for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('bossbar').classList.add('hidden');
      $('tap-hint').classList.toggle('hidden', idx > 0);
      this.hud = {};
      this.banner(RS.YEARS[idx].year + ' · ' + RS.YEARS[idx].title);
    },

    // ------------------------------------------------------------ overlays
    renderCards(el, cards, onPick) {
      el.innerHTML = '';
      const shownAt = performance.now();
      cards.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'card k-' + c.kind + (c.tier ? ' t-' + c.tier : '');
        b.innerHTML = '<div class="ic"></div><div class="tx"><div class="nm"><span class="n"></span><span class="tg"></span></div><div class="ds"></div><div class="hn"></div></div>';
        b.querySelector('.ic').textContent = c.icon || '⚽';
        b.querySelector('.n').textContent = c.name;
        b.querySelector('.tg').textContent = c.tag || '';
        b.querySelector('.ds').textContent = c.desc || '';
        const hn = b.querySelector('.hn');
        if (c.hint) { hn.textContent = c.hint; if (/필요|스킬 필요/.test(c.hint)) hn.classList.add('need'); } else hn.remove();
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
      // a graded or gamble card in the hand is announced in the title
      const sp = w.choices.find((c) => c.kind === 'relic' || c.kind === 'gamble');
      const tier = sp ? sp.tier || 'gamble' : '';
      $('lv-title').textContent = { super: '🌈 슈퍼히든 카드 등장!!', ultra: '🔥 초히든 카드 등장!', hidden: '🔮 히든 카드 등장!', rare: '💎 레어 카드 등장', gamble: '🎰 도박 카드 등장' }[tier] || '레벨 업!';
      $('lv-title').className = 'glow' + (tier ? ' t-' + tier : '');
      $('reroll-n').textContent = w.rerolls;
      $('btn-reroll').classList.toggle('hidden', w.rerolls <= 0);
      const dice = $('btn-dice');
      dice.classList.toggle('hidden', !w.build.relics.dice);
      dice.disabled = w.diceUsed;
      dice.textContent = w.diceUsed ? '🎲 주사위 사용함' : '🎲 행운의 주사위 (무료 1회)';
      this.renderDraw();
      this.renderShop();
      this.renderCards($('lv-cards'), w.choices, (i) => {
        w.choose(i);
        $('levelup').classList.add('hidden');
        this.lvShown = false;
      });
      this.lvShown = true;
    },
    refreshLevelUp() { this.lvShown = false; this.showLevelUp(); },

    // The item bought with the grade draw of this level-up, shown above the hand.
    renderDraw() {
      const w = this.world, el = $('lv-draw');
      if (!w.lastDraw) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      this.renderCards(el, [Object.assign({}, w.lastDraw, { tag: RS.TIERS[w.lastDraw.tier].name + ' 획득!', hint: '뽑기 결과 · 바로 적용됨' })], () => {});
      el.firstChild.classList.add('reveal');
    },

    // Coin shop on every level-up screen: paid rerolls, and one grade draw per level-up.
    renderShop() {
      const w = this.world, row = $('lv-shop-row');
      $('lv-shop').classList.remove('hidden');
      $('lv-purse').textContent = '💰 ' + w.purse().toLocaleString() + ' 코인';
      row.innerHTML = '';
      const left = RS.relicsLeft(w.build);
      const add = (label, cost, cls, off, onClick) => {
        const b = document.createElement('button');
        b.className = 'btn small coin ' + cls;
        b.innerHTML = '<span class="cl"></span><span class="cc"></span>';
        b.querySelector('.cl').textContent = label;
        b.querySelector('.cc').textContent = '💰' + cost;
        b.disabled = off || w.purse() < cost;
        b.onclick = (ev) => { ev.stopPropagation(); onClick(); };
        row.appendChild(b);
      };
      add('🔁 다시 뽑기', RS.COIN_REROLL, 'c-reroll', false, () => { if (w.coinReroll()) { RS.Audio.sfx('coin'); this.refreshLevelUp(); } });
      for (const d of RS.COIN_DRAWS) {
        add(d.icon + ' ' + (left ? d.name : '모두 보유'), d.cost, 'c-' + d.id, w.drawUsed || !left, () => { if (w.coinDraw(d.id)) this.refreshLevelUp(); });
      }
    },

    // In-run transfer offer (rescue marker with a full squad).
    showSwap() {
      const w = this.world;
      this.input.release();
      $('levelup').classList.remove('hidden');
      $('lv-title').textContent = '이적 제안!';
      $('lv-title').className = 'glow';
      $('btn-reroll').classList.add('hidden');
      $('btn-dice').classList.add('hidden');
      $('lv-shop').classList.add('hidden');
      $('lv-draw').classList.add('hidden');
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
      if (w.phase === 'victory') return this.showVictory(w, out);
      this.show('result');
      const yd = RS.YEARS[out.idx];
      $('res-title').textContent = out.cleared ? yd.year + ' 시즌 클리어!' : '부상 아웃...';
      $('res-title').className = out.cleared ? 'glow' : '';
      $('res-sub').textContent = out.cleared ? (out.replay ? '다시하기 클리어 (커리어 진행에는 영향 없음)' : yd.boss.name + ' 격파! ' + this.cheerText(w.hero)) : '괜찮아, 다시 일어나면 돼. 코인은 그대로 받는다.';
      const m = Math.floor(w.t / 60), s = Math.floor(w.t % 60);
      $('res-stats').innerHTML = '';
      const add = (v, l) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b></b><span></span>'; d.querySelector('b').textContent = v; d.querySelector('span').textContent = l; $('res-stats').appendChild(d); };
      add(m + ':' + String(s).padStart(2, '0'), '경기 시간');
      add(out.kills, '처치');
      add('Lv.' + out.level, '레벨');
      add('+' + out.coins, '코인');
      if (out.ballon) add('+' + out.ballon, '발롱도르 🏆');
      if (w.recruitedThisRun.length) add(w.recruitedThisRun.length + '명', '새 동료');
      const next = $('btn-res-next'), retry = $('btn-res-retry');
      $('res-reward').classList.add('hidden');
      if (out.cleared && !out.replay) {
        next.classList.remove('hidden');
        next.textContent = '다음 시즌: ' + RS.YEARS[this.save.career.yearIdx].year + ' ▶';
        next.onclick = () => this.startYear(this.save.career.yearIdx);
        retry.classList.add('hidden');
        if (RS.needsBossReward(this.save, out.idx)) {
          // the boss reward must be picked before moving on
          next.classList.add('hidden');
          $('res-reward').classList.remove('hidden');
          const cards = RS.bossRewardChoices(this.save, out.idx, this.rng);
          this.renderCards($('res-reward-cards'), cards, (i) => {
            const info = RS.applyBossReward(this.save, out.idx, cards[i], this.rng);
            this.persist();
            RS.Audio.sfx('recruit');
            this.toast(cards[i].name + (info.coach ? ': ' + RS.coachCard(info.coach).name : '') + ' 획득!');
            $('res-reward').classList.add('hidden');
            next.classList.remove('hidden');
          });
        }
      } else if (out.cleared) {
        next.classList.remove('hidden');
        next.textContent = '연도 선택';
        next.onclick = () => this.showYears();
        retry.classList.remove('hidden');
        retry.textContent = '한 번 더';
        retry.onclick = () => this.startYear(out.idx);
      } else {
        next.classList.remove('hidden');
        next.textContent = '재도전 ↺';
        next.onclick = () => this.startYear(out.idx);
        retry.classList.remove('hidden');
        retry.textContent = '🛒 훈련장에서 강화';
        retry.onclick = () => this.showShop();
      }
      this.makeAttract();
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
      if (RS.hardMode(w.build)) add('🔥', '하드 모드 클리어');
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
    // SIUU is 날두's: 메시 celebrates with the crowd and a finger to the sky.
    celebrate(hero) { if (hero === 'messi') RS.Audio.sfx('cheer'); else RS.Audio.siuu(); },
    cheerText(hero) { return hero === 'messi' ? '☝️' : 'SIUU!'; },

    // ------------------------------------------------------------ main loop
    frame(ts) {
      const dt = Math.min(0.1, (ts - this.last) / 1000);
      this.last = ts;
      try {
        if (this.state === 'play' && this.world) this.tick(dt);
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
          this.renderer.render(this.attract, { camDy: 0.34 }); // keep the running 날두 below the title labels
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
        if (w.phase === 'play') {
          this.acc = (this.acc || 0) + dt * (this.speed || 1); // 2x: more fixed steps per frame, same physics
          let n = 0;
          const v = this.input.vector();
          if ((v.x || v.y) && !$('tap-hint').classList.contains('hidden')) $('tap-hint').classList.add('hidden');
          const maxSteps = 4 * (this.speed || 1);
          while (this.acc >= STEP && n < maxSteps && w.phase === 'play') { w.update(STEP, v); this.acc -= STEP; n++; }
          if (n >= maxSteps) this.acc = 0;
        } else {
          this.acc = 0;
          w.update(dt, null); // fx only
        }
        this.handleEvents();
        if (w.phase === 'levelup' && !this.lvShown) this.showLevelUp();
        if (w.phase === 'chest' && !this.chestShown) this.showChest();
        if (w.phase === 'swap' && !this.swapShown) this.showSwap();
        if (w.phase === 'clear' || w.phase === 'dead' || w.phase === 'victory') {
          this.endT += dt;
          if (!this.ended && this.endT > (w.phase === 'dead' ? 1.2 : 1.8)) { this.ended = true; this.endYear(); return; }
        }
      }
      this.renderer.render(w, { joy: this.input.joy });
      this.updateHud();
    },

    handleEvents() {
      const w = this.world;
      for (const e of w.events) {
        switch (e.type) {
          case 'sfx': RS.Audio.sfx(e.name); break;
          case 'siuu': this.celebrate(w.hero); break;
          case 'levelup': RS.Audio.sfx('levelup'); this.renderer.shake = Math.max(this.renderer.shake, 0.1); $('hud-power').parentElement.classList.remove('bump'); void $('hud-power').offsetWidth; $('hud-power').parentElement.classList.add('bump'); break;
          case 'shake': this.renderer.shake = Math.max(this.renderer.shake, e.k || 0.1); break;
          case 'wave': RS.Audio.sfx('wave'); this.renderer.shake = Math.max(this.renderer.shake, 0.12); break;
          case 'mini': RS.Audio.sfx('warn'); break;
          case 'miniKill': RS.Audio.sfx('chest'); this.toast(e.name + ' 격파!'); break;
          case 'slide': this.renderer.shake = Math.max(this.renderer.shake, 0.05); break;
          case 'chest': RS.Audio.sfx('chest'); break;
          case 'evolve': RS.Audio.sfx('evolve'); this.renderer.shake = 0.2; break;
          case 'special': // a graded / gamble card was dealt
            if (e.tier === 'super' || e.tier === 'ultra') { RS.Audio.sfx('jackpot'); this.renderer.shake = Math.max(this.renderer.shake, 0.15); } else RS.Audio.sfx('sparkle');
            break;
          case 'relic': {
            const r = RS.RELICS[e.id];
            this.banner(RS.TIERS[e.tier].name + ' 획득! ' + r.icon + ' ' + r.name);
            RS.Audio.sfx(e.tier === 'rare' ? 'chest' : e.tier === 'hidden' ? 'evolve' : 'jackpot');
            if (e.tier === 'ultra' || e.tier === 'super') this.renderer.shake = 0.4;
            break;
          }
          case 'gamble': {
            const r = e.relic && RS.RELICS[e.relic];
            this.banner((e.win ? '🎉 ' : '💀 ') + e.text + (r ? ' · ' + r.icon + ' ' + r.name : ''));
            RS.Audio.sfx(e.win ? 'jackpot' : 'lose');
            if (e.win) this.renderer.shake = Math.max(this.renderer.shake, 0.25);
            break;
          }
          case 'hurt': RS.Audio.sfx('hurt'); this.renderer.shake = 0.12; if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* ignore */ } break;
          case 'boss':
            RS.Audio.sfx('boss');
            this.banner((e.final ? '최종 보스 등장: ' : '시즌 보스 등장: ') + e.name);
            $('bossbar').classList.remove('hidden');
            $('boss-name').textContent = e.name;
            break;
          case 'recruit': RS.Audio.sfx('recruit'); this.banner(RS.TEAMMATES[e.id].name + (e.bench ? ' 벤치 합류!' : ' 합류!') + (e.swap ? ' (' + RS.TEAMMATES[e.swap].name + ' 이적)' : '')); break;
          case 'rescueSpawn': this.banner((e.swap ? '이적 제안! ' : '동료 발견! ') + RS.TEAMMATES[e.id].name + ' 에게 가자'); break;
          case 'swap': RS.Audio.sfx('recruit'); break;
          case 'banner': this.banner(e.text); break;
          case 'rage': this.renderer.shake = 0.5; RS.Audio.sfx('boss'); break;
          case 'elite': this.banner('엘리트 등장! 보물 상자를 노려라'); break;
          case 'revive': this.celebrate(w.hero); break;
          case 'dead': RS.Audio.sfx('dead'); break;
          case 'clear': this.banner('시즌 클리어! ' + this.cheerText(w.hero)); RS.Audio.sfx('cheer'); this.renderer.shake = 0.5; break;
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
      this.setText('yr', $('hud-year'), w.yearDef.year + ' · ' + RS.yearAge(w.yearIdx) + '세' + (RS.hardMode(w.build) ? ' · 하드' : ''));
      this.setText('k', $('hud-kills'), String(w.kills));
      this.setText('c', $('hud-coins'), String(Math.round(w.coinsPicked)));
      this.setText('pw', $('hud-power'), String(w.power()));
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
      if (w.boss) {
        const r = Math.max(0, Math.round(w.boss.hp / w.boss.maxHp * 1000) / 10);
        if (this.hud.bh !== r) { this.hud.bh = r; $('boss-fill').style.width = r + '%'; }
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
        if (c.finished) this.showYears();
        else this.startYear(c.yearIdx);
      };
      $('btn-years').onclick = () => this.showYears();
      $('btn-shop').onclick = () => this.showShop();
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
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (this.state === 'play') this.pause(!this.paused); }
        if (this.state === 'play' && this.world && this.world.phase === 'levelup' && this.lvShown && ['1', '2', '3', '4'].includes(e.key)) {
          const btn = $('lv-cards').children[+e.key - 1]; if (btn) btn.click();
        }
      });
    }
  };

  RS.App = App;
  window.RSApp = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
  else App.init();
})(globalThis.RS = globalThis.RS || {});
