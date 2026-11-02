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
      for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
      this.show('title');
      const c = this.save.career;
      const yd = RS.YEARS[c.yearIdx];
      const started = c.yearIdx > 0 || c.coachDone >= 0;
      $('btn-play').textContent = c.finished ? '🏆 커리어 완주! 다시 보기' : started ? '▶ 이어하기 · ' + yd.year + '년' : '⚽ 커리어 시작';
      $('title-progress').textContent = c.finished ? '메시를 꺾은 전설 · ' + (c.laps + 1) + '회차' : yd.year + '년 · ' + RS.yearAge(c.yearIdx) + '세 · ' + RS.ERAS[yd.era].club;
      this.renderWallet($('title-wallet'));
      const ts = $('title-sprite'); ts.innerHTML = '';
      ts.appendChild(RS.Sprites.toCanvas(RS.Sprites.ronaldo(c.yearIdx), 0, 7));
      this.makeAttract();
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
    startYear(idx) {
      if (!RS.canPlay(this.save, idx)) return;
      if (RS.needsCoach(this.save, idx)) this.showCoach(idx);
      else this.showIntro(idx);
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
        this.showIntro(idx);
      });
    },

    showIntro(idx) {
      this.show('intro');
      const yd = RS.YEARS[idx];
      const replay = RS.isReplay(this.save, idx);
      $('intro-year').textContent = yd.year;
      $('intro-club').textContent = RS.yearAge(idx) + '세 · ' + RS.ERAS[yd.era].club + (replay ? ' · 다시하기 (커리어에 영향 없음)' : '');
      $('intro-title').textContent = yd.title;
      const evo = $('intro-evo'); evo.innerHTML = '';
      const look = RS.ronaldoLook(idx);
      const prev = idx > 0 ? RS.ronaldoLook(idx - 1) : null;
      if (prev && prev.key !== look.key) {
        evo.appendChild(RS.Sprites.toCanvas(RS.Sprites.ronaldo(idx - 1), 0, 5));
        const a = document.createElement('div'); a.className = 'arrow'; a.textContent = '➜'; evo.appendChild(a);
        const wrap = document.createElement('div');
        const lab = document.createElement('div'); lab.className = 'evo-label'; lab.textContent = '날두 진화!';
        wrap.appendChild(lab);
        wrap.appendChild(RS.Sprites.toCanvas(RS.Sprites.ronaldo(idx), 0, 6));
        evo.appendChild(wrap);
      } else evo.appendChild(RS.Sprites.toCanvas(RS.Sprites.ronaldo(idx), 0, 6));
      const b = RS.buildForYear(this.save, idx);
      $('intro-squad').innerHTML = this.buildChips(b);
      $('intro-boss').textContent = (yd.final ? '최종 보스: ' : '시즌 보스: ') + yd.boss.name;
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
      for (const m of b.teammates) h += '<span class="chip mate">🤝 ' + esc(RS.TEAMMATES[m.id].name) + ' ' + m.lv + '</span>';
      if (b.coachCards.length) h += '<span class="chip">👔 감독 카드 ' + b.coachCards.length + '</span>';
      return h;
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
        b.className = 'card k-' + c.kind;
        b.innerHTML = '<div class="ic"></div><div class="tx"><div class="nm"><span class="n"></span><span class="tg"></span></div><div class="ds"></div></div>';
        b.querySelector('.ic').textContent = c.icon || '⚽';
        b.querySelector('.n').textContent = c.name;
        b.querySelector('.tg').textContent = c.tag || '';
        b.querySelector('.ds').textContent = c.desc || '';
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
      $('reroll-n').textContent = w.rerolls;
      $('btn-reroll').classList.toggle('hidden', w.rerolls <= 0);
      this.renderCards($('lv-cards'), w.choices, (i) => {
        w.choose(i);
        $('levelup').classList.add('hidden');
        this.lvShown = false;
      });
      this.lvShown = true;
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
      if (on) { this.input.release(); $('pause-build').innerHTML = this.buildChips(this.world.build); }
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
      for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
      if (w.phase === 'victory') return this.showVictory(w, out);
      this.show('result');
      const yd = RS.YEARS[out.idx];
      $('res-title').textContent = out.cleared ? yd.year + ' 시즌 클리어!' : '부상 아웃...';
      $('res-title').className = out.cleared ? 'glow' : '';
      $('res-sub').textContent = out.cleared ? (out.replay ? '다시하기 클리어 (커리어 진행에는 영향 없음)' : yd.boss.name + ' 격파! SIUU!') : '괜찮아, 다시 일어나면 돼. 코인은 그대로 받는다.';
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
      if (out.cleared && !out.replay) {
        next.classList.remove('hidden');
        next.textContent = '다음 시즌: ' + RS.YEARS[this.save.career.yearIdx].year + ' ▶';
        next.onclick = () => this.startYear(this.save.career.yearIdx);
        retry.classList.add('hidden');
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
      ws.appendChild(RS.Sprites.toCanvas(RS.Sprites.ronaldo(RS.YEARS.length - 1), 0, 8));
      const ms = RS.Sprites.toCanvas(RS.Sprites.messi(1), 0, 5); ms.style.opacity = '0.7'; ms.style.transform = 'rotate(80deg)';
      ws.appendChild(ms);
      $('win-stats').innerHTML = '';
      const add = (v, l) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b></b><span></span>'; d.querySelector('b').textContent = v; d.querySelector('span').textContent = l; $('win-stats').appendChild(d); };
      add('+' + out.coins, '코인');
      add('+' + out.ballon, '발롱도르 🏆');
      add(w.kills, '처치');
      add('Lv.' + w.build.level, '최종 레벨');
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
      RS.Audio.siuu();
      setTimeout(() => RS.Audio.siuu(), 2700);
    },

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
            if (a.phase === 'levelup') a.choose(RS.botChoose(a.choices));
            else if (a.phase === 'chest') a.closeChest();
            else if (a.phase !== 'play' || a.t > 80) this.makeAttract();
            else a.update(STEP, RS.botInput(a));
            this.attractAcc -= STEP; n++;
          }
          if (n >= 3) this.attractAcc = 0;
          this.attract.events.length = 0;
          this.renderer.render(this.attract, null);
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
          this.acc = (this.acc || 0) + dt;
          let n = 0;
          const v = this.input.vector();
          if ((v.x || v.y) && !$('tap-hint').classList.contains('hidden')) $('tap-hint').classList.add('hidden');
          while (this.acc >= STEP && n < 4 && w.phase === 'play') { w.update(STEP, v); this.acc -= STEP; n++; }
          if (n >= 4) this.acc = 0;
        } else {
          this.acc = 0;
          w.update(dt, null); // fx only
        }
        this.handleEvents();
        if (w.phase === 'levelup' && !this.lvShown) this.showLevelUp();
        if (w.phase === 'chest' && !this.chestShown) this.showChest();
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
          case 'siuu': RS.Audio.siuu(); break;
          case 'levelup': RS.Audio.sfx('levelup'); break;
          case 'chest': RS.Audio.sfx('chest'); break;
          case 'evolve': RS.Audio.sfx('evolve'); this.renderer.shake = 0.2; break;
          case 'hurt': RS.Audio.sfx('hurt'); this.renderer.shake = 0.12; if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* ignore */ } break;
          case 'boss':
            RS.Audio.sfx('boss');
            this.banner((e.final ? '최종 보스 등장: ' : '시즌 보스 등장: ') + e.name);
            $('bossbar').classList.remove('hidden');
            $('boss-name').textContent = e.name;
            break;
          case 'recruit': RS.Audio.sfx('recruit'); this.banner(RS.TEAMMATES[e.id].name + ' 합류!'); break;
          case 'rescueSpawn': this.banner('동료 발견! ' + RS.TEAMMATES[e.id].name + ' 에게 가자'); break;
          case 'banner': this.banner(e.text); break;
          case 'rage': this.renderer.shake = 0.5; RS.Audio.sfx('boss'); break;
          case 'elite': this.banner('엘리트 등장! 보물 상자를 노려라'); break;
          case 'revive': RS.Audio.siuu(); break;
          case 'dead': RS.Audio.sfx('dead'); break;
          case 'clear': this.banner('시즌 클리어! SIUU!'); break;
          case 'victory': this.banner('메시 격파!!!'); break;
        }
      }
      w.events.length = 0;
      if (w.phase !== 'chest') this.chestShown = false;
    },

    setText(key, el, v) { if (this.hud[key] !== v) { this.hud[key] = v; el.textContent = v; } },
    updateHud() {
      const w = this.world;
      const b = w.build;
      const xpr = Math.min(1, b.xp / RS.xpToNext(b.level));
      const xs = Math.round(xpr * 100);
      if (this.hud.xp !== xs) { this.hud.xp = xs; $('xpfill').style.width = xs + '%'; }
      this.setText('lv', $('hud-level'), 'Lv.' + b.level);
      this.setText('yr', $('hud-year'), w.yearDef.year + ' · ' + RS.yearAge(w.yearIdx) + '세');
      this.setText('k', $('hud-kills'), String(w.kills));
      this.setText('c', $('hud-coins'), String(Math.round(w.coinsPicked)));
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
      $('btn-pause').onclick = (e) => { e.stopPropagation(); this.pause(true); };
      $('btn-resume').onclick = () => this.pause(false);
      $('btn-quit').onclick = () => {
        this.paused = false;
        $('pause').classList.add('hidden');
        const w = this.world;
        w.phase = 'dead';
        this.endYear();
      };
      $('btn-reroll').onclick = () => {
        if (this.world.reroll()) { this.lvShown = false; $('levelup').classList.add('hidden'); this.showLevelUp(); }
      };
      $('btn-chest-ok').onclick = () => { this.world.closeChest(); $('chest').classList.add('hidden'); this.chestShown = false; };
      $('btn-res-menu').onclick = () => this.showTitle();
      $('btn-win-menu').onclick = () => this.showTitle();
      $('btn-win-new').onclick = () => { RS.newCareer(this.save); this.persist(); this.showTitle(); };
      for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => this.showTitle();
      for (const b of document.querySelectorAll('[data-home]')) b.onclick = () => this.showTitle();
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (this.state === 'play') this.pause(!this.paused); }
        if (this.state === 'play' && this.world && this.world.phase === 'levelup' && this.lvShown && ['1', '2', '3'].includes(e.key)) {
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
