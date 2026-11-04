/* 호날두 서바이버즈 — the PK screens (round 10): the PK 챌린지 after every fifth match and the career's real
 * shootouts. Mixed into the app object (main.js): runPK(queue, done) plays PK sessions one after another, then done().
 * Rules: pk.js (RS.PKSession); one kick: pkscene.js (RS.PKScene); drawing: pkrender.js (Renderer.renderPK). */
(function (RS) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const INPUT = ['aim', 'power', 'acc', 'guess'];

  RS.PKUI = {
    runPK(queue, done) {
      if (!queue.length) return done();
      this.startPK(queue.shift(), () => this.runPK(queue, done));
    },
    startPK(job, done) {
      const S = new RS.PKSession(this.save, Object.assign({ rng: this.rng }, job));
      this.pk = { S, done, scene: null, kick: null, auto: this.autoMode() !== 'off', hold: true, gap: 0, ending: false, finished: false, shouted: false, mates: 0, opps: 0, lastPhase: null };
      this.state = 'pk';
      this.input.enabled = false;
      this.renderer.pkReset();
      this.show('pk');
      $('pk-result').classList.add('hidden');
      $('pk-shout').className = 'pk-shout hidden';
      this.pkHeader();
      this.pkNext(); // the first kick waits behind the intro
      this.pkIntro();
    },
    pkIntro() {
      const P = this.pk, S = P.S, K = S.keeper, hero = RS.HEROES[S.hero].name;
      let h;
      if (S.kind === 'challenge') {
        const per = RS.pkCoinPer(K);
        h = '<div class="parody">5경기마다 찾아오는 11m 승부</div><h2 class="glow">⚽ PK 챌린지</h2>' +
          '<p class="story">' + esc(hero) + '가 다섯 번 찬다. 넣을 때마다 💰' + per + ', 다섯 골을 모두 넣으면 보너스 💰' + per * 3 + '.</p>';
      } else {
        const d = S.def;
        h = '<div class="parody">' + (d.single ? '단 한 번의 페널티킥' : '승부차기 · ' + esc(S.us) + ' vs ' + esc(d.vs)) + '</div>' +
          '<h2 class="glow">' + esc(d.title) + '</h2><p class="story">' + esc(d.story) + '</p>' +
          (d.single ? '' : '<div class="sub">' + esc(hero) + '는 ' + d.order + '번 키커 · 상대가 찰 때는 우리 골키퍼가 몸을 날릴 방향을 고른다</div>') +
          '<div class="sub">' + (S.replay ? '이번에 이기면 💰' : '이기면 💰') + (d.single ? RS.SINGLE_COINS : RS.SHOOTOUT_COINS) +
          (d.single || S.replay ? '' : ' · 민심 ±' + RS.SHOOTOUT_FANS) + '</div>';
      }
      h += '<div class="pk-keeper">🧤 ' + esc(K.name) + ' · ' + RS.pkTier(K) + (K.note ? '<span>' + esc(K.note) + '</span>' : '') + '</div>' +
        '<div class="sub">골결정력 ' + S.fin + ' · 노릴 수 있는 칸 ' + S.zones + '개' +
        (S.zones < 9 ? ' (Lv.' + RS.PK_ZONE_LV[S.zones < 6 ? 0 : 1] + '에 ' + (S.zones < 6 ? 6 : 9) + '칸)' : '') + '</div>' +
        '<div class="sub pk-how">칸 고르기 → 파워 게이지 멈추기(초록) → 정확도 바늘 멈추기(하얀 칸, 노란 칸이면 완벽)</div>';
      $('pk-intro-body').innerHTML = h;
      $('pk-intro').classList.remove('hidden');
      const go = () => {
        if (!this.pk || this.pk !== P || !P.hold) return;
        this.cancelAuto();
        $('pk-intro').classList.add('hidden');
        P.hold = false;
        RS.Audio.sfx('whistle');
        this.pkHint();
      };
      $('btn-pk-go').onclick = () => { RS.Audio.sfx('click'); go(); };
      this.armAuto(go, 2600, 'PK 시작', 'semi');
    },
    pkHeader() {
      const P = this.pk, S = P.S;
      $('pk-title').textContent = S.kind === 'challenge' ? '⚽ PK 챌린지' : S.def.title;
      $('pk-sub').textContent = '🧤 ' + S.keeper.name + ' · ' + RS.pkTier(S.keeper);
      $('pk-stat').textContent = '골결정력 ' + S.fin + ' · ' + S.zones + '칸';
      $('btn-pk-auto').textContent = P.auto ? '🤖 자동 차기' : '✋ 직접 차기';
      $('btn-pk-auto').classList.toggle('on', P.auto);
    },
    // the next kick (or the end): a fresh scene; a teammate's kick plays itself, quickly unless it can decide it
    pkNext() {
      const P = this.pk, S = P.S, k = S.next();
      if (!k) return this.pkFinish();
      const quick = !k.decisive && (k.who === 'mate' || P.auto);
      P.kick = k;
      P.scene = new RS.PKScene({
        mode: k.mode, who: k.who, keeper: k.who === 'opp' ? S.ourKeeper : S.keeper, fin: S.fin, level: S.level, hero: S.hero, small: S.small,
        yearIdx: S.idx, nat: !!(S.def && S.def.nat), n: k.who === 'mate' ? P.mates++ : k.who === 'opp' ? P.opps++ : 0,
        auto: k.who === 'mate' ? true : P.auto, fast: quick, slow: !!k.decisive, forced: k.forced, ourK: S.ourK, rng: this.rng
      });
      P.shouted = false; P.lastPhase = null;
      this.pkScore();
      if (!P.hold) { RS.Audio.sfx('whistle'); this.pkHint(); }
    },
    tickPK(dt) {
      const P = this.pk, sc = P.scene;
      if (sc && !P.hold && !P.finished) {
        sc.update(dt);
        for (const n of sc.sfx) this.pkSfx(n, sc);
        sc.sfx.length = 0;
        if (sc.phase !== P.lastPhase) { P.lastPhase = sc.phase; this.pkHint(); }
        if (sc.hitDone && !P.shouted) { P.shouted = true; this.pkShout(sc); }
        if (sc.done && !P.ending) { P.S.record(sc.result); P.kick = null; this.pkScore(); P.ending = true; P.gap = 0.35; }
        if (P.ending && (P.gap -= dt) <= 0) { P.ending = false; this.pkNext(); }
      }
      this.renderer.renderPK(P.scene);
    },
    pkSfx(n, sc) {
      const A = RS.Audio;
      if (n === 'goal') { // the stadium horn and the roar; 날두's own goal gets his SIUU
        A.sfx('horn'); A.sfx('cheer');
        if (sc.who === 'hero') setTimeout(() => this.celebrate(sc.o.hero), 250);
      } else A.sfx(n);
      if (n === 'kick' && sc.slow) A.sfx('drum');
    },
    pkHint() {
      const P = this.pk, sc = P && P.scene, el = $('pk-hint');
      if (!sc || P.finished) { el.textContent = ''; return; }
      const S = P.S, k = P.kick || { n: 1 };
      const who = sc.who === 'hero' ? RS.HEROES[S.hero].name : sc.who === 'mate' ? '동료 ' + k.n + '번 키커' : (S.def ? S.def.vs : '상대') + ' ' + k.n + '번 키커';
      let t = '';
      if (INPUT.includes(sc.phase) && sc.o.auto && sc.who !== 'mate') t = sc.mode === 'keep' ? '🤖 ' + who + '가 찬다 · 우리 골키퍼가 방향을 고른다' : '🤖 ' + who + '가 자동으로 찬다';
      else if (sc.phase === 'aim') t = '👆 노릴 칸을 누르세요 · 숫자는 성공 확률';
      else if (sc.phase === 'power') t = '👆 지금 눌러 파워 결정! 초록 칸이 최고';
      else if (sc.phase === 'acc') t = '👆 바늘이 하얀 칸에 올 때 누르세요 · 노란 칸이면 완벽';
      else if (sc.phase === 'guess') t = '🧤 ' + who + '가 찬다! 막을 방향(◀ ▲ ▶)을 누르세요';
      else if (sc.phase === 'runup' || sc.phase === 'flight') t = (sc.slow ? '⏱ 이 한 방에 갈린다 · ' : '') + who + '가 찬다';
      el.textContent = t;
    },
    pkShout(sc) {
      const r = sc.result.res, S = this.pk.S;
      let text, cls;
      if (sc.mode === 'shoot') {
        if (r === 'goal') { text = sc.who === 'hero' ? (S.hero === 'ronaldo' ? 'GOAL!! SIUUU!' : 'GOAL!! ☝️') : 'GOAL!'; cls = 'goal'; }
        else if (r === 'save') { text = sc.o.keeper.name + ' 선방!'; cls = 'miss'; }
        else { text = { post: '골대!', bar: '크로스바!', over: '홈런…', wide: '빗나갔다…' }[r]; cls = 'miss'; }
      } else if (r === 'goal') { text = '실점…'; cls = 'miss'; }
      else { text = r === 'save' ? '막았다!!' : '상대 실축!'; cls = 'save'; }
      const el = $('pk-shout');
      el.textContent = text;
      el.className = 'pk-shout ' + cls;
      void el.offsetWidth;
      el.classList.add('show');
      clearTimeout(this._pkShout);
      this._pkShout = setTimeout(() => el.classList.add('hidden'), 1400);
    },
    // scoreboard: one row of five for the PK 챌린지, both sides for a shootout (more dots in sudden death)
    pkScore() {
      const P = this.pk, S = P.S, k = P.kick;
      const row = (name, arr, n, cur) => {
        let s = '<div class="pk-row"><b>' + esc(name) + '</b><span>';
        for (let i = 0; i < n; i++) s += '<i class="' + (arr[i] === true ? 'g' : arr[i] === false ? 'm' : i === cur ? 'c' : 'p') + '"></i>';
        return s + '</span><em>' + arr.filter(Boolean).length + '</em></div>';
      };
      const hero = RS.HEROES[S.hero].name;
      let h;
      if (S.kind === 'challenge') h = row(hero, S.kicks.map((q) => q.goal), RS.PK_KICKS, k ? k.n - 1 : -1);
      else if (!S.so) h = row(hero, S.kicks.map((q) => q.goal), 1, k ? 0 : -1);
      else {
        const so = S.so, n = Math.max(RS.SO_KICKS, so.us.length + (k && k.who !== 'opp' ? 1 : 0), so.them.length + (k && k.who === 'opp' ? 1 : 0));
        h = row(S.us, so.us, n, k && k.who !== 'opp' ? so.us.length : -1) + row(S.def.vs, so.them, n, k && k.who === 'opp' ? so.them.length : -1);
      }
      $('pk-score').innerHTML = h;
    },
    pkTap(e) {
      const P = this.pk;
      if (!P || P.hold || P.finished || !P.scene) return;
      const r = this.renderer, x = e.clientX * r.dpr / r.scale, y = e.clientY * r.dpr / r.scale, sc = P.scene;
      if (sc.tap(x, y)) { e.preventDefault(); return; }
      if (sc.phase === 'aim' && !sc.o.auto) {
        const z = sc.zoneAt(x, y);
        if (z > sc.zones) { $('pk-hint').textContent = '🔒 이 칸은 Lv.' + RS.PK_ZONE_LV[z <= 6 ? 0 : 1] + '에 열린다'; RS.Audio.sfx('warn'); }
      }
    },
    // PC: 1–9 aim, Space/Enter stop the gauge and the needle, arrow keys pick the dive
    pkKey(e) {
      const P = this.pk;
      if (!P || P.finished) return;
      if (P.hold) { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); $('btn-pk-go').click(); } return; }
      const sc = P.scene;
      if (!sc || sc.o.auto) return;
      if (sc.phase === 'aim' && /^[1-9]$/.test(e.key) && +e.key <= sc.zones) { sc.pickZone(+e.key); e.preventDefault(); }
      else if ((sc.phase === 'power' || sc.phase === 'acc') && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); if (sc.phase === 'power') sc.stopPower(sc.gauge()); else sc.stopNeedle(sc.needle()); }
      else if (sc.phase === 'guess' && ['ArrowLeft', 'ArrowUp', 'ArrowRight'].includes(e.key)) { e.preventDefault(); sc.pickDive(['ArrowLeft', 'ArrowUp', 'ArrowRight'].indexOf(e.key)); }
    },
    pkToggleAuto() {
      const P = this.pk;
      if (!P) return;
      P.auto = !P.auto;
      const sc = P.scene;
      if (sc && sc.who !== 'mate' && INPUT.includes(sc.phase)) sc.setAuto(P.auto);
      this.pkHeader(); this.pkHint();
    },
    pkFinish() {
      const P = this.pk, S = P.S, out = S.finish(), pk = RS.normalizePk(this.save.meta.pk), rec = pk.heroes[S.hero];
      P.finished = true; P.kick = null;
      this.persist();
      this.pkScore();
      $('pk-hint').textContent = '';
      const big = out.kind === 'challenge' ? out.perfect : out.won;
      if (big) { this.renderer.pkCelebrate(true); RS.Audio.sfx('jackpot'); }
      else if (out.kind === 'challenge' && out.goals >= 3) this.renderer.pkCelebrate(false);
      else RS.Audio.sfx(out.kind === 'challenge' && out.goals < 3 ? 'lose' : 'whistle');
      let title, sub = '';
      if (out.kind === 'challenge') { title = out.perfect ? '🎯 PK 챌린지 5/5 완벽!' : 'PK 챌린지 ' + out.goals + '/' + out.shots; sub = 'vs ' + S.keeper.name + ' (' + RS.pkTier(S.keeper) + ')'; }
      else if (!S.so) { title = out.won ? '⚽ 페널티킥 성공!' : '😩 페널티킥 실패…'; sub = S.def.real; }
      else { title = (out.won ? '🏆 승부차기 승리! ' : '😢 승부차기 패배 ') + out.score[0] + '-' + out.score[1]; sub = S.def.real; }
      $('pk-res-title').textContent = title;
      $('pk-res-title').className = big ? 'glow' : '';
      $('pk-res-sub').textContent = sub;
      const stats = $('pk-res-stats');
      stats.innerHTML = '';
      const add = (v, l) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b></b><span></span>'; d.querySelector('b').textContent = v; d.querySelector('span').textContent = l; stats.appendChild(d); };
      if (out.coins) add('+' + out.coins, '코인');
      else if (out.kind !== 'challenge') add('0', S.replay || !out.won ? '코인 (이기면 받는다)' : '코인');
      if (out.fans) add((out.fans > 0 ? '+' : '') + out.fans, '민심');
      add(rec.goals + '골', '통산 PK (' + RS.pkRate(rec) + '%)');
      if (rec.streak >= 2) add('🔥 ' + rec.streak, '연속 성공');
      let notes = '';
      for (const t of out.titles) notes += '<div class="pk-title-got">' + t.icon + ' 칭호 획득: ' + esc(t.name) + '!</div>';
      const next = RS.pkNextTitle(rec);
      notes += '<div class="sub">' + (next ? '다음 칭호 ' + next.icon + ' ' + esc(next.name) + '까지 ' + (next.goals - rec.goals) + '골' : '👑 최고 칭호 달성') + '</div>';
      const pr = (h) => { const r = pk.heroes[h]; return RS.HEROES[h].name + ' ' + r.goals + '골/' + r.shots + '회' + (r.shots ? ' (' + RS.pkRate(r) + '%)' : ''); };
      notes += '<div class="sub">⚔️ PK 라이벌 · ' + pr('ronaldo') + ' · ' + pr('messi') + '</div>';
      $('pk-res-notes').innerHTML = notes;
      $('pk-result').classList.remove('hidden');
      for (const t of out.titles) this.toast(t.icon + ' ' + t.name + '!');
      $('btn-pk-ok').onclick = () => { RS.Audio.sfx('click'); this.pkClose(); };
      this.armAuto(() => this.pkClose(), big ? 3400 : 2600, '계속', 'semi');
    },
    pkClose() {
      const P = this.pk;
      if (!P || !P.finished) return;
      this.cancelAuto();
      $('pk-result').classList.add('hidden');
      $('pk-shout').className = 'pk-shout hidden';
      this.pk = null;
      this.state = 'menu';
      this.renderer.pkReset();
      P.done();
    },
    // title screen: this hero's PK record, his title and the matches left to the next PK 챌린지
    pkLine() {
      const pk = RS.normalizePk(this.save.meta.pk), rec = pk.heroes[this.save.career.build.hero], t = RS.pkTitle(rec);
      return '🎯 PK ' + rec.goals + '골' + (rec.shots ? ' (' + RS.pkRate(rec) + '%)' : '') + (t ? ' · ' + t.icon + ' ' + t.name : '') +
        ' · PK 챌린지까지 ' + (RS.PK_EVERY - (pk.games % RS.PK_EVERY)) + '경기';
    }
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pkui = 'R13.3';
