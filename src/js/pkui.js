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
      // the 승부차기 토너먼트 is a game to play by hand: only 완전 오토 kicks for the player there
      const auto = job.kind === 'cup' ? this.autoMode() === 'full' : this.autoMode() !== 'off';
      this.pk = { S, done, scene: null, kick: null, auto, hold: true, gap: 0, ending: false, finished: false, shouted: false, mates: 0, opps: 0, lastPhase: null };
      this.state = 'pk';
      this.input.enabled = false;
      this.renderer.pkReset();
      this.show('pk');
      $('pk-result').classList.add('hidden');
      $('pk-shout').className = 'pk-shout hidden';
      this.pkShotBar();
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
      } else if (S.kind === 'cup') {
        // round 22: the stage ladder, and on a stage's first round its line of the hero's story
        const story = S.round === 0 && RS.CUP_STORY[S.hero] ? RS.CUP_STORY[S.hero][S.stage] : '';
        h = this.cupLadder(S.stage, S.hero) + '<div class="parody">' + esc(S.st.name) + ' · ' + esc(S.us) + ' vs ' + esc(S.def.vs) + '</div>' +
          '<h2 class="glow">' + S.st.icon + ' ' + esc(S.st.name) + ' ' + S.st.rounds[S.round].name + '</h2>' + this.cupBracket(S.round, S.st) +
          (story ? '<p class="story">' + esc(story) + '</p>' : '') +
          '<p class="story">' + esc(hero) + '가 우리 팀 킥을 전부 찬다. 상대가 찰 때는 우리 골키퍼가 몸을 날릴 방향을 고른다. 한 번 지면 탈락.</p>' +
          '<div class="sub">' + this.cupPrize(S.stage, S.hero) + '</div>';
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
        '<div class="sub pk-how">칸 고르기 → 파워 게이지 멈추기 → 정확도 바늘 멈추기. 파워는 공의 세기: 오른쪽 초록(가운데 파란 줄이 퍼펙트)이 제대로 찬 슛, ' +
        '약할수록 느려서 잘 막히고, 맨 오른쪽 빨강은 너무 세서 뜬다. 왼쪽 초록은 파넨카 구역(가운데를 노리면 살짝 띄우기, 파란 줄이면 완벽한 파넨카), ' +
        '맨 왼쪽 빨강은 데굴데굴 굴러가는 공 — 키퍼가 방향만 맞히면 걸어와서 줍는다. ' +
        '정확도 바늘이 방향을 정한다: 가운데 파랑일수록 구석으로, 하양·놓치면 가운데로 쏠려 막히기 쉽다(하양 < 노랑 < 파랑). 옆으로 찬 공은 가끔 골대를 맞는다. ' +
        '파넨카가 실패하면 사기가 떨어져 게이지와 바늘이 빨라진다.</div>' +
        '<div class="sub pk-how">슛 종류(칸을 고를 때 아래 버튼, PC는 Q·W·E): 🦶 밀어차기 = 기본 · 🚀 발등슛 = 발등으로 세게, 막기 어렵지만 게이지가 빨라 빗나가기 쉽다 · ' +
        '🌀 감아차기 = 발 안쪽으로 휘게, 구석으로 휘어 잘 안 빗나가지만 느려서 방향을 읽히면 막힌다</div>' +
        (S.kind === 'challenge' ? '' : '<div class="sub pk-how">🧤 막을 때: 6칸(위·아래) 중 미리 고르거나, 기다렸다가 공이 날아오면 ' + RS.soReact() + '초 안에 누르기 (난이도별 이지 0.9 · 노멀 0.6 · 하드 0.5초)</div>');
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
        auto: k.who === 'mate' ? true : P.auto, fast: quick, slow: !!k.decisive, forced: k.forced, ourK: S.ourK, oppMiss: S.oppMiss, midSaved: S.midSaved, rage: S.rage, rng: this.rng,
        shot: this.pkShotPref || 'push', zones: S.zones, morale: k.who === 'hero' ? S.morale : 0, panStreak: S.panStreak
      });
      P.shouted = false; P.lastPhase = null; P.lastReact = false;
      this.pkScore();
      if (!P.hold) { RS.Audio.sfx('whistle'); this.pkHint(); }
    },
    tickPK(dt) {
      const P = this.pk, sc = P.scene;
      if (sc && !P.hold && !P.finished) {
        sc.update(dt);
        for (const n of sc.sfx) this.pkSfx(n, sc);
        sc.sfx.length = 0;
        if (sc.phase !== P.lastPhase || sc.reactOpen !== P.lastReact) { P.lastPhase = sc.phase; P.lastReact = sc.reactOpen; this.pkHint(); }
        if (sc.hitDone && !P.shouted) { P.shouted = true; this.pkShout(sc); }
        if (sc.done && !P.ending) {
          P.S.record(sc.result); P.kick = null; this.pkScore(); P.ending = true; P.gap = 0.35;
          if (P.S.rageNew) { // he read our 파넨카: he burns from now on
            P.S.rageNew = false; P.gap = 1.3;
            this.pkShout(null, '🔥 ' + P.S.keeper.name + ' 분노 모드!', 'miss');
            RS.Audio.sfx('boss'); this.renderer.shake = Math.max(this.renderer.shake, 0.4);
            $('pk-sub').textContent = '🔥 ' + P.S.keeper.name + ' (분노) · ' + RS.pkTier(P.S.keeper);
          }
          if (P.S.moraleNew) { // round 23: a 파넨카 that did not go in: 사기 저하 (the gauge and the needle speed up)
            P.S.moraleNew = false; P.gap = Math.max(P.gap, 1.3);
            setTimeout(() => { if (this.pk === P) this.pkShout(null, '😰 ' + RS.HEROES[P.S.hero].name + ' 사기 저하!', 'miss'); }, P.S.rage ? 1100 : 0);
            RS.Audio.sfx('lose');
            $('pk-stat').textContent = '골결정력 ' + P.S.fin + ' · ' + P.S.zones + '칸 · 😰 사기 -' + P.S.morale;
          }
        }
        if (P.ending && (P.gap -= dt) <= 0) { P.ending = false; this.pkNext(); }
      }
      this.renderer.renderPK(P.scene);
    },
    pkSfx(n, sc) {
      const A = RS.Audio;
      if (n === 'goal') { // the stadium horn and the roar; 날두's own goal gets his SIUU
        A.sfx('horn'); A.sfx('roar');
        if (sc.who === 'hero' && sc.o.hero === 'ronaldo') setTimeout(() => A.siuu(), 250);
      } else A.sfx(n);
      if (n === 'kick' && sc.slow) A.sfx('drum');
      // round 23: the phone buzzes on the net, the gloves and the frame (only here: 'thud' is common in the season)
      const buzz = { net: 70, thud: 45, ping: [30, 40, 30] }[n];
      if (buzz) A.buzz(buzz);
    },
    pkHint() {
      const P = this.pk, sc = P && P.scene, el = $('pk-hint');
      this.pkShotBar();
      if (!sc || P.finished) { el.textContent = ''; return; }
      const S = P.S, k = P.kick || { n: 1 };
      const who = sc.who === 'hero' ? RS.HEROES[S.hero].name : sc.who === 'mate' ? '동료 ' + k.n + '번 키커' : (S.def ? S.def.vs : '상대') + ' ' + k.n + '번 키커';
      const shot = RS.pkShot(sc.shot), tag = shot.icon + ' ' + shot.name;
      let t = '';
      if (INPUT.includes(sc.phase) && sc.o.auto && sc.who !== 'mate') t = sc.mode === 'keep' ? '🤖 ' + who + '가 찬다 · 우리 골키퍼가 방향을 고른다' : '🤖 ' + who + '가 자동으로 찬다 · ' + tag;
      else if (sc.phase === 'aim') t = '👆 노릴 칸을 누르세요 · 숫자는 ' + shot.name + ' 성공 확률';
      else if (sc.phase === 'power') t = tag + ' · 👆 지금 눌러 파워 결정! 오른쪽 초록이 좋고, 가운데 파란 줄이 퍼펙트' + (RS.pkCol(sc.zone) === 1 ? ' · 왼쪽 초록이면 파넨카' : '') + (sc.o.morale ? ' · 😰 사기 저하: 게이지가 빠르다' : '');
      else if (sc.phase === 'acc') t = '👆 바늘이 하얀 칸에 올 때 누르세요 · 노랑이 더 좋고, 가운데 파랑 + 파워 파란 줄이면 퍼펙트';
      else if (sc.phase === 'guess') t = '🧤 ' + who + '가 찬다! 막을 칸(6칸)을 미리 누르거나, 기다렸다가 공 보고 막기';
      else if (sc.reactOpen) t = '👀 지금! 공이 가는 칸을 누르세요 (' + sc.reactWin + '초 안에)';
      else if (sc.phase === 'runup' || sc.phase === 'flight') t = (sc.slow ? '⏱ 이 한 방에 갈린다 · ' : '') + (sc.watch && sc.phase === 'runup' ? '👀 공을 보고 있다가 누르세요 · ' : '') + who + '가 찬다';
      el.textContent = t;
    },
    pkShout(sc, text, cls) {
      const S = this.pk.S;
      if (sc) {
        const r = sc.result.res, kind = sc.result.kind;
        if (sc.mode === 'shoot') {
          if (r === 'goal') {
            text = kind === 'perfect' ? '★ PERFECT GOAL ★' : kind === 'panenka' ? (sc.result.odds && sc.result.odds.chipPerfect ? '★ 완벽한 파넨카!!' : '파넨카 성공!!') : kind === 'slow' ? '데굴데굴… 들어갔다?!' : sc.who !== 'hero' ? 'GOAL!'
              : sc.shot === 'drive' ? '🚀 대포알 골!!' : sc.shot === 'curl' ? '🌀 감아차기 골!!' : S.hero === 'ronaldo' ? 'GOAL!! SIUUU!' : 'GOAL!! ☝️';
            cls = 'goal';
          } else if (r === 'save') { text = kind === 'panenka' ? '파넨카 읽혔다! 키퍼가 공을 차버렸다' : kind === 'slow' ? sc.o.keeper.name + '가 걸어가서 줍는다' : sc.o.keeper.name + ' 선방!'; cls = 'miss'; }
          else { text = { post: '골대!', bar: '크로스바!', over: '홈런…', wide: '빗나갔다…' }[r]; cls = 'miss'; }
        } else if (r === 'goal') { text = kind === 'panenka' ? '상대 파넨카… 당했다' : '실점…'; cls = 'miss'; }
        else { text = r === 'save' ? (kind === 'panenka' ? '파넨카 읽었다!!' : sc.dive && sc.dive.rt != null ? '보고 막았다!!' : '막았다!!') : '상대 실축!'; cls = 'save'; }
      }
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
    // PC: 1–9 aim, Q · W · E the shot type, Space/Enter stop the gauge and the needle, arrow keys pick the dive
    pkKey(e) {
      const P = this.pk;
      if (!P || P.finished) return;
      if (P.hold) { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); $('btn-pk-go').click(); } return; }
      const sc = P.scene;
      if (!sc || sc.o.auto) return;
      const shot = sc.phase === 'aim' && RS.PK_SHOT_IDS.find((id) => 'Key' + RS.PK_SHOTS[id].key === e.code); // by key position: a Korean layout types ㅂ ㅈ ㄷ
      if (shot) { e.preventDefault(); this.pkPickShot(shot); }
      else if (sc.phase === 'aim' && /^[1-9]$/.test(e.key) && +e.key <= sc.zones) { sc.pickZone(+e.key); e.preventDefault(); }
      else if ((sc.phase === 'power' || sc.phase === 'acc') && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); if (sc.phase === 'power') sc.stopPower(sc.gauge()); else sc.stopNeedle(sc.needle()); }
      else if (sc.keepOpen()) { // keeper: 1–3 low, 7–9 high (as on a numpad), Space waits to watch
        if (sc.phase === 'guess' && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); sc.watchNow(); return; }
        const n = /^[1-9]$/.test(e.key) ? +e.key : 0;
        if (n && n !== 5 && (n <= 3 || n >= 7)) { e.preventDefault(); sc.keepInput({ col: (n - 1) % 3, row: n >= 7 ? 1 : 0 }); }
        else if (n === 4 || n === 6) { e.preventDefault(); sc.keepInput({ col: n === 4 ? 0 : 2, row: 0 }); }
      }
    },
    // Round 18: the shot-type buttons under the pitch, shown while the player aims his own kick. The pick stays for
    // his next kicks (this.pkShotPref, until the game is closed); 밀어차기 until he picks.
    pkShotBar() {
      let bar = $('pk-shots');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'pk-shots'; bar.className = 'pk-shots hidden';
        bar.innerHTML = '<div class="pk-shot-row">' + RS.PK_SHOT_IDS.map((id) => { const S = RS.PK_SHOTS[id]; return '<button class="btn small pk-shot" data-shot="' + id + '"><b>' + S.icon + '</b> ' + esc(S.name) + '<kbd>' + S.key + '</kbd></button>'; }).join('') + '</div><div class="pk-shot-tip"></div>';
        for (const b of bar.querySelectorAll('button')) b.onclick = (e) => { e.preventDefault(); this.pkPickShot(b.dataset.shot); };
        $('pk-hint').parentNode.insertBefore(bar, $('pk-hint'));
      }
      const P = this.pk, sc = P && P.scene;
      const on = !!(sc && !P.hold && !P.finished && sc.mode === 'shoot' && sc.who === 'hero' && !sc.o.auto && !sc.o.forced && sc.phase === 'aim');
      bar.classList.toggle('hidden', !on);
      if (!on) return;
      for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.shot === sc.shot);
      const S = RS.pkShot(sc.shot);
      bar.querySelector('.pk-shot-tip').textContent = S.icon + ' ' + S.name + ': ' + S.tip;
    },
    pkPickShot(id) {
      const P = this.pk, sc = P && P.scene;
      if (!sc || P.hold || P.finished || sc.who !== 'hero' || !sc.pickShot(id)) return;
      this.pkShotPref = id;
      this.pkHint();
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
      if (out.kind === 'cup') return this.cupFinish(out);
      const big = out.kind === 'challenge' ? out.perfect : out.won;
      if (big) { this.renderer.pkCelebrate(true); RS.Audio.sfx('jackpot'); RS.Audio.sfx('bigroar'); RS.Audio.buzz([90, 60, 90]); }
      else if (out.kind !== 'challenge') RS.Audio.sfx('aah');
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
      $('btn-pk-ok').textContent = '계속';
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
    // ---------------------------------------------------------------- 승부차기 토너먼트 (round 15, title screen)
    // round 22: each run plays the hero's current stage (유소년 → 청소년 → 대륙컵 → 월드컵)
    startCup() {
      const hero = this.save.career.build.hero, stage = RS.cupHeroStage(this.save.meta, hero);
      RS.cupStart(this.save);
      this.persist();
      this.cup = { stage, draw: RS.cupDraw(this.rng, hero, stage), round: 0, out: null };
      this.cupNext();
    },
    cupNext() {
      const C = this.cup, m = C.draw[C.round];
      C.out = null;
      this.startPK({ kind: 'cup', stage: C.stage, round: C.round, vs: m.vs, keeper: m.keeper, idx: this.save.career.yearIdx }, () => {
        const r = C.out;
        if (this.cup === C && r && r.next != null) { C.round = r.next; this.cupNext(); }
        else { this.cup = null; this.showTitle(); }
      });
    },
    cupBracket(cur, st) {
      const rounds = (st || RS.cupStage(null)).rounds;
      return '<div class="cup-bracket">' + rounds.map((r, i) => '<span class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '">' + (i < cur ? '✓ ' : '') + r.name + '</span>').join('<i>▸</i>') + '</div>';
    },
    // the four stages of this hero's climb: the cleared ones ticked, the one played lit
    cupLadder(cur, hero) {
      return '<div class="cup-bracket cup-ladder">' + RS.CUP_STAGES.map((s, i) => { const st = RS.cupStage(i, hero); return '<span class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '">' + (i < cur ? '✓ ' : st.icon + ' ') + esc(st.name) + '</span>'; }).join('<i>▸</i>') + '</div>';
    },
    cupPrize(stage, hero) {
      if (stage != null && stage < RS.CUP_WC) {
        const st = RS.cupStage(stage, hero), nx = RS.cupStage(stage + 1, hero);
        return '🏆 우승하면 다음 무대 ' + nx.icon + ' ' + esc(nx.name) + ' 진출 · 💰' + st.coins;
      }
      const left = RS.cupLeft(this.save.meta);
      return left.length ? '🏆 우승하면 SIUUU 스킬 1개 랜덤 해금 (남은 ' + left.length + '개: ' + left.map((r) => RS.SKILLS[r.id].icon + ' ' + RS.SKILLS[r.id].name).join(' · ') + ')'
        : '🏆 SIUUU 스킬 3개를 모두 얻었다 · 우승하면 💰' + RS.CUP_COINS;
    },
    cupButton() {
      const hero = this.save.career.build.hero, st = RS.cupStage(RS.cupHeroStage(this.save.meta, hero), hero);
      const n = RS.CUP_REWARDS.length - RS.cupLeft(this.save.meta).length, c = RS.normalizeCup(this.save.meta.cup);
      return '🥅 승부차기 토너먼트 · ' + st.icon + ' ' + st.name + ' · 해금 ' + n + '/' + RS.CUP_REWARDS.length + (c.wins ? ' · 월드컵 우승 ' + c.wins + '회' : '');
    },
    cupFinish(out) {
      const S = this.pk.S, r = out.cup, C = this.cup, st = S.st, name = st.rounds[S.round].name, score = ' ' + out.score[0] + '-' + out.score[1];
      if (C) C.out = r;
      if (out.won) { this.renderer.pkCelebrate(true); RS.Audio.sfx('jackpot'); RS.Audio.sfx('bigroar'); RS.Audio.buzz(r.champion ? [120, 80, 120, 80, 320] : [90, 60, 90]); } else RS.Audio.sfx('lose');
      const title = r.champion ? '🏆 ' + st.name + ' 우승!' + score : out.won ? '✅ ' + name + ' 승리!' + score : '😢 ' + st.name + ' ' + name + ' 탈락' + score;
      $('pk-res-title').textContent = title;
      $('pk-res-title').className = out.won ? 'glow' : '';
      const nx = r.next != null && C ? C.draw[r.next] : null, up = r.stageUp != null ? RS.cupStage(r.stageUp, S.hero) : null;
      $('pk-res-sub').textContent = nx ? '다음: ' + st.rounds[r.next].name + ' vs ' + nx.vs + ' (🧤 ' + RS.PK_KEEPERS[nx.keeper].name + ')'
        : up ? '다음 무대 진출: ' + up.icon + ' ' + up.name + '!'
        : r.champion ? st.rounds[0].name + '부터 결승까지 ' + st.rounds.length + '번의 승부차기를 모두 이겼다!' : '다음 도전은 다시 ' + st.name + ' ' + st.rounds[0].name + '부터';
      const stats = $('pk-res-stats'), rec = RS.normalizePk(this.save.meta.pk).heroes[S.hero];
      stats.innerHTML = '';
      const add = (v, l) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b></b><span></span>'; d.querySelector('b').textContent = v; d.querySelector('span').textContent = l; stats.appendChild(d); };
      add(out.goals + '/' + out.shots, '내 킥 성공');
      if (out.coins) add('+' + out.coins, '코인');
      add(rec.goals + '골', '통산 PK (' + RS.pkRate(rec) + '%)');
      let notes = this.cupBracket(r.champion ? st.rounds.length : out.won ? S.round + 1 : S.round, st);
      const rw = r.reward;
      if (up) {
        notes += this.cupLadder(r.stageUp, S.hero) + '<div class="pk-title-got cup-reward">' + up.icon + ' ' + esc(up.name) + ' 진출!</div>' +
          '<div class="sub">' + esc(RS.CUP_STORY[S.hero] ? RS.CUP_STORY[S.hero][r.stageUp] : '') + '</div>';
        this.toast(up.icon + ' ' + up.name + ' 진출!');
      } else if (rw && rw.id) {
        const sk = RS.SKILLS[rw.id], hn = RS.HEROES[rw.hero].name;
        notes += '<div class="pk-title-got cup-reward">🎁 SIUUU 스킬 해금: ' + sk.icon + ' ' + esc(sk.name) + ' (' + esc(hn) + ')</div>' +
          '<div class="sub">' + esc(sk.evoDesc) + '</div>' +
          '<div class="sub">이제 ' + esc(hn) + ' 커리어 레벨업에서 아주 드물게 SIUUU로 등장한다' +
            (RS.heroLocked(this.save.meta, rw.hero) ? ' (' + esc(hn) + '는 먼저 해금해야 한다)' : '') + '</div>';
        this.toast('🎁 ' + sk.name + ' 해금!');
      } else if (rw && rw.coins && S.stage === RS.CUP_WC) notes += '<div class="sub">SIUUU 스킬은 이미 모두 얻었다 · 💰' + rw.coins + '</div>';
      for (const t of out.titles) notes += '<div class="pk-title-got">' + t.icon + ' 칭호 획득: ' + esc(t.name) + '!</div>';
      $('pk-res-notes').innerHTML = notes;
      $('pk-result').classList.remove('hidden');
      $('btn-pk-ok').textContent = nx ? '다음 경기 ▶' : '메뉴로';
      $('btn-pk-ok').onclick = () => { RS.Audio.sfx('click'); this.pkClose(); };
      // only 완전 오토 moves on by itself here (the reward screen stays until it is read)
      if (this.autoMode() === 'full' && !r.champion) this.armAuto(() => this.pkClose(), 3000, nx ? '다음 경기' : '메뉴로', 'full');
    },
    // title screen: this hero's PK record, his title and the matches left to the next PK 챌린지
    pkLine() {
      const pk = RS.normalizePk(this.save.meta.pk), rec = pk.heroes[this.save.career.build.hero], t = RS.pkTitle(rec);
      return '🎯 PK ' + rec.goals + '골' + (rec.shots ? ' (' + RS.pkRate(rec) + '%)' : '') + (t ? ' · ' + t.icon + ' ' + t.name : '') +
        ' · PK 챌린지까지 ' + (RS.PK_EVERY - (pk.games % RS.PK_EVERY)) + '경기';
    }
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pkui = 'R35';
