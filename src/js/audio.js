/* 호날두 서바이버즈 — audio. Everything (chiptune SFX and the SIUU clip) runs through one WebAudio graph with a
 * compressor, so levels stay balanced. Nothing plays until unlock() runs inside a user tap (mobile autoplay rules).
 * iOS: the ringer switch silences plain WebAudio but not media playback, so the graph is put in the media
 * category (navigator.audioSession) or, on older iOS, routed through a hidden <audio> element. */
(function (RS) {
  'use strict';
  const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const VOL_KEY = 'rs_vol_v1';
  const CLIPS = ['goal', 'aah', 'ooh', 'win']; // assets/audio/crowd_<name>.mp3
  const A = {
    muted: false,
    unlocked: false,
    ctx: null,
    master: null,
    comp: null,
    siuuEl: null,
    siuuBuf: null,
    clips: {},
    routeEl: null,
    last: {},
    gemStreak: 0, gemLast: -9,
    vol: { sfx: 0.8, siu: 0.6 }, // 0..1 user sliders; SIUU sits a little above the SFX bus, not far above
    init(muted) {
      this.muted = !!muted;
      try {
        const v = JSON.parse(localStorage.getItem(VOL_KEY) || 'null');
        if (v && typeof v.sfx === 'number' && typeof v.siu === 'number') this.vol = v;
      } catch (e) { /* defaults */ }
      try {
        this.siuuEl = new Audio('assets/audio/siuu.mp3'); // fallback path (file:// cannot fetch for decoding)
        this.siuuEl.preload = 'auto';
        this.siuuEl.volume = this.vol.siu;
      } catch (e) { this.siuuEl = null; }
    },
    setVolume(key, v) {
      this.vol[key] = Math.max(0, Math.min(1, v));
      if (this.master) this.master.gain.value = this.vol.sfx;
      if (this.siuuEl) this.siuuEl.volume = this.vol.siu;
      try { localStorage.setItem(VOL_KEY, JSON.stringify(this.vol)); } catch (e) { /* ignore */ }
    },
    unlock() {
      if (this.unlocked) { this.resume(); return; }
      this.unlocked = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const c = this.ctx = new AC();
          this.comp = c.createDynamicsCompressor();
          this.comp.threshold.value = -16; this.comp.knee.value = 12; this.comp.ratio.value = 6;
          this.comp.attack.value = 0.003; this.comp.release.value = 0.12;
          this.master = c.createGain(); this.master.gain.value = this.vol.sfx;
          this.master.connect(this.comp);
          this.siuGain = c.createGain(); this.siuGain.gain.value = 1; this.siuGain.connect(this.comp);
          let routed = false;
          if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ } }
          else if (IOS && c.createMediaStreamDestination) {
            try {
              const dest = c.createMediaStreamDestination();
              this.comp.connect(dest);
              const el = document.createElement('audio');
              el.srcObject = dest.stream; el.playsInline = true; el.setAttribute('playsinline', '');
              const p = el.play(); if (p && p.catch) p.catch(() => {});
              this.routeEl = el; routed = true;
            } catch (e) { routed = false; }
          }
          if (!routed) this.comp.connect(c.destination);
          if (c.state === 'suspended') c.resume().catch(() => {});
          // decode SIUU into the graph so it obeys the same mixer; keep the element as the file:// fallback
          if (typeof fetch === 'function' && location.protocol !== 'file:') {
            fetch('assets/audio/siuu.mp3').then((r) => r.arrayBuffer()).then((buf) => c.decodeAudioData(buf))
              .then((ab) => { this.siuuBuf = ab; }).catch(() => {});
            // round 23: the recorded stadium crowd (ElevenLabs sound effects; RS.Audio.clip)
            for (const n of CLIPS) {
              fetch('assets/audio/crowd_' + n + '.mp3').then((r) => r.arrayBuffer()).then((buf) => c.decodeAudioData(buf))
                .then((ab) => { this.clips[n] = ab; }).catch(() => {});
            }
          }
        }
      } catch (e) { this.ctx = null; }
      if (this.siuuEl) { // prime inside the gesture so later programmatic plays are allowed on iOS
        const el = this.siuuEl;
        el.muted = true;
        const p = el.play();
        const done = () => { el.pause(); el.currentTime = 0; el.muted = false; };
        if (p && p.then) p.then(done).catch(() => { el.muted = false; }); else done();
      }
    },
    setMuted(m) {
      this.muted = !!m;
      if (this.muted && this.siuuEl) this.siuuEl.pause();
    },
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (this.routeEl && this.routeEl.paused) { const p = this.routeEl.play(); if (p && p.catch) p.catch(() => {}); }
    },
    // round 22 (the user: siuuu소리가 너무 커): the clip is mastered far louder than the chiptune, so it plays at
    // SIU_TRIM of the slider — saved slider values get quieter too
    SIU_TRIM: 0.45,
    siuu() {
      if (this.muted || !this.unlocked) return;
      const v = this.vol.siu * this.SIU_TRIM;
      if (this.ctx && this.siuuBuf && this.ctx.state === 'running') {
        try {
          const s = this.ctx.createBufferSource(); s.buffer = this.siuuBuf;
          const g = this.ctx.createGain(); g.gain.value = v;
          s.connect(g); g.connect(this.siuGain); s.start();
          return;
        } catch (e) { /* fall through to the element */ }
      }
      if (this.siuuEl) { try { this.siuuEl.volume = v; this.siuuEl.currentTime = 0; const p = this.siuuEl.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    },
    tone(freq, dur, type, vol, slide, delay) {
      const c = this.ctx;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
      g.gain.setValueAtTime(vol || 0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    noise(dur, vol, hp, delay, lp) {
      const c = this.ctx;
      const t0 = c.currentTime + (delay || 0);
      const n = Math.floor(c.sampleRate * dur);
      if (!this._nb || this._nb.length < n) {
        this._nb = c.createBuffer(1, Math.max(n, c.sampleRate), c.sampleRate);
        const d = this._nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = c.createBufferSource(); s.buffer = this._nb;
      const f = c.createBiquadFilter(); f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = hp || 800;
      const g = c.createGain(); g.gain.setValueAtTime(vol || 0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t0); s.stop(t0 + dur);
    },
    // Round 23 (the user: 득점 후 나오는 소리 환호성이 아닌데? 걍 골키퍼 슬라이딩 소리같음): the synthesized crowd read as
    // a swoosh, so the crowd is recorded clips (ElevenLabs sound effects, CLIPS) on the SFX bus. A clip not decoded
    // yet (or a file:// page, which cannot fetch) stays silent.
    clip(name, vol) {
      const ab = this.clips[name];
      if (!ab) return;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = ab; g.gain.value = vol == null ? 1 : vol;
      s.connect(g); g.connect(this.master); s.start();
    },
    // a phone buzz (where the browser has one: Android Chrome; iOS Safari has none) — silent when muted
    buzz(pattern) {
      if (this.muted) return;
      try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    },
    // Rate-limited named sound effects. Small random detune keeps repeated hits from sounding mechanical.
    sfx(name) {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state !== 'running') { this.resume(); if (this.ctx.state !== 'running') return; }
      const now = this.ctx.currentTime;
      const gap = { gem: 0.045, kick: 0.07, shoot: 0.08, hit: 0.05, kill: 0.06, crit: 0.09, hurt: 0.15, coin: 0.06, heart: 0.5, tap: 0.07, zip: 0.06, flash: 0.08, impact: 0.12 }[name] || 0.03;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      const dt = 1 + (Math.random() - 0.5) * 0.12; // ±6 % pitch
      try {
        switch (name) {
          case 'kick': // low thump + leather slap
            this.tone(140 * dt, 0.09, 'sine', 0.7, 0.45); this.tone(420 * dt, 0.05, 'square', 0.22, 0.6); this.noise(0.05, 0.3, 1800); break;
          case 'shoot': this.tone(330 * dt, 0.1, 'square', 0.32, 0.4); this.noise(0.06, 0.18, 2500); break;
          case 'hit': this.tone(260 * dt, 0.05, 'square', 0.22, 0.7); this.noise(0.03, 0.18, 3000); break;
          case 'crit': this.tone(520 * dt, 0.07, 'square', 0.35, 0.55); this.tone(1040 * dt, 0.09, 'triangle', 0.3, 0.8, 0.02); this.noise(0.05, 0.25, 2400); break;
          case 'kill': this.tone(600 * dt, 0.07, 'triangle', 0.28, 0.35); this.noise(0.04, 0.2, 1200); break;
          case 'gem': { // pickup arpeggio that climbs while gems keep coming
            if (now - this.gemLast > 0.5) this.gemStreak = 0; else this.gemStreak = Math.min(12, this.gemStreak + 1);
            this.gemLast = now;
            this.tone(700 * Math.pow(1.06, this.gemStreak) * dt, 0.06, 'triangle', 0.32, 1.25); break;
          }
          case 'coin': this.tone(988, 0.06, 'square', 0.3); this.tone(1319, 0.1, 'square', 0.3, null, 0.06); break;
          case 'hurt': this.tone(150, 0.2, 'sawtooth', 0.55, 0.5); this.noise(0.1, 0.35, 600, 0, true); break;
          case 'heart': this.tone(60, 0.12, 'sine', 0.8, 0.8); this.tone(55, 0.12, 'sine', 0.6, 0.8, 0.16); break;
          case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.36, null, i * 0.07)); this.noise(0.25, 0.2, 4000, 0.28); break;
          case 'chest': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.4, null, i * 0.06)); break;
          case 'evolve': [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.22, 'square', 0.36, null, i * 0.09)); this.noise(0.5, 0.25, 3000, 0.3); break;
          case 'thud': this.tone(100, 0.22, 'sine', 0.8, 0.4); this.noise(0.14, 0.3, 300, 0, true); break;
          case 'swish': this.noise(0.16, 0.3, 3000); this.tone(900, 0.12, 'sine', 0.15, 0.5); break;
          case 'dash': this.noise(0.1, 0.25, 1500); this.tone(600, 0.08, 'triangle', 0.22, 2); break;
          case 'siu': this.tone(660, 0.08, 'square', 0.3, 1.4); this.tone(990, 0.22, 'square', 0.26, 1.2, 0.08); break;
          case 'bobo': this.tone(180, 0.14, 'sawtooth', 0.4, 0.8); this.tone(240, 0.22, 'square', 0.3, 0.7, 0.12); break; // 메시's glare: a low grumble
          case 'warn': this.tone(880, 0.08, 'square', 0.3); this.tone(880, 0.08, 'square', 0.3, null, 0.12); break;
          case 'wave': this.tone(440, 0.12, 'square', 0.3); this.tone(587, 0.12, 'square', 0.3, null, 0.14); this.tone(740, 0.2, 'square', 0.32, null, 0.28); break;
          case 'curl': this.tone(500, 0.2, 'triangle', 0.3, 2); break;
          case 'jackpot': // graded item / gamble win: a bright climbing fanfare with shimmer
            [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.16, 'square', 0.34, null, i * 0.06)); this.noise(0.4, 0.2, 5000, 0.3); break;
          case 'sparkle': this.tone(1568, 0.08, 'triangle', 0.3); this.tone(2093, 0.12, 'triangle', 0.28, null, 0.06); break;
          case 'lose': this.tone(330, 0.18, 'sawtooth', 0.4, 0.5); this.tone(220, 0.3, 'sawtooth', 0.4, 0.5, 0.16); break;
          case 'whistle': this.tone(2800, 0.1, 'square', 0.2); this.tone(2900, 0.28, 'square', 0.2, null, 0.13); break;
          case 'heal': this.tone(660, 0.1, 'triangle', 0.35, 1.5); this.tone(990, 0.12, 'triangle', 0.3, 1.2, 0.08); break;
          case 'magnet': this.tone(300, 0.3, 'sine', 0.35, 3); break;
          case 'recruit': [659, 784, 988].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.4, null, i * 0.08)); break;
          case 'boss': [196, 185, 175].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.4, null, i * 0.25)); this.noise(0.6, 0.25, 200, 0, true); break;
          case 'cheer': this.clip('goal', 0.8); break; // the crowd (round 23: the recorded roar, everywhere)
          case 'dead': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.45, null, i * 0.18)); break;
          case 'click': this.tone(700, 0.04, 'square', 0.25); break;
          // round 8: 메시's ball moves, 신의 손, 약물, the press room
          case 'tap': this.tone(300 * dt, 0.05, 'sine', 0.4, 0.6); this.noise(0.03, 0.15, 2600); break; // 드리볼 touch
          case 'drop': this.tone(260, 0.3, 'triangle', 0.26, 4); this.noise(0.25, 0.12, 2000); break; // a ball shooting up
          case 'impact': this.tone(85, 0.32, 'sine', 0.85, 0.45); this.noise(0.28, 0.4, 260, 0, true); this.noise(0.12, 0.2, 3000, 0.02); break;
          case 'hand': // the palm slams: a deep boom, a slap and a crack
            this.tone(62, 0.45, 'sine', 0.95, 0.5); this.noise(0.08, 0.5, 1400); this.noise(0.4, 0.35, 220, 0.02, true); this.tone(180, 0.12, 'square', 0.2, 0.5, 0.01); break;
          case 'zip': this.tone(900 * dt, 0.07, 'triangle', 0.22, 1.8); this.noise(0.05, 0.12, 4000); break;
          case 'stim': // a rising rush over a heartbeat
            this.tone(140, 0.5, 'sawtooth', 0.3, 3); this.tone(60, 0.12, 'sine', 0.8, 0.8, 0.05); this.tone(55, 0.12, 'sine', 0.7, 0.8, 0.25); break;
          case 'flash': this.noise(0.04, 0.3, 5000); this.noise(0.03, 0.2, 7000, 0.05); break; // camera shutters
          case 'gavel': this.tone(220, 0.08, 'square', 0.4, 0.5); this.noise(0.06, 0.4, 900, 0, true); this.tone(220, 0.08, 'square', 0.4, 0.5, 0.32); this.noise(0.06, 0.4, 900, 0.32, true); break;
          // round 10: penalties
          case 'net': this.noise(0.3, 0.32, 1400); this.tone(190, 0.14, 'sine', 0.4, 0.6); break; // the ball swishes into the net
          case 'ping': this.tone(1760, 0.32, 'triangle', 0.32, 0.98); this.tone(2640, 0.22, 'sine', 0.18, 0.99, 0.01); this.noise(0.03, 0.35, 4000); break; // the post rings
          // round 23: the recorded crowd (RS.Audio.clip)
          case 'roar': this.clip('goal'); break; // the roar for us
          case 'aah': this.clip('aah'); break; // the sigh
          case 'ooh': this.clip('ooh'); break; // the gasp as it rings off the frame
          case 'bigroar': this.clip('win'); break; // the shootout or the cup is won
          case 'oh': this.noise(0.9, 0.3, 520, 0, true); this.tone(190, 0.6, 'sawtooth', 0.1, 0.65); break; // the crowd groans
          case 'horn': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.18, 'square', 0.3, null, i * 0.08)); this.tone(784, 0.5, 'sawtooth', 0.22, null, 0.32); break; // stadium goal horn
          case 'drum': this.tone(68, 0.22, 'sine', 0.85, 0.55); this.noise(0.08, 0.25, 180, 0, true); break; // tension on the kick that decides it
          // round 16: the perfect strike, the 파넨카 keeper's temper
          case 'perfectLock': // blue band + gold needle: a charged-up "ting" that rises
            this.tone(1319, 0.06, 'square', 0.3); this.tone(1976, 0.09, 'square', 0.28, null, 0.05); this.tone(2637, 0.28, 'triangle', 0.3, 1.02, 0.1);
            this.tone(220, 0.35, 'sawtooth', 0.18, 2.4, 0.04); this.noise(0.18, 0.15, 6000, 0.08); break;
          case 'perfect': // the perfect strike hits the top corner: a deep boom, a bright chord and a long shimmer
            this.tone(55, 0.55, 'sine', 0.95, 0.5); this.noise(0.12, 0.5, 1800);
            [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.5, 'square', 0.18, null, 0.06 + i * 0.03));
            [2637, 3136, 3951, 4186].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.2, null, 0.25 + i * 0.07));
            this.noise(0.9, 0.18, 7000, 0.2); break;
          case 'angry': // the keeper roars and boots it: a growl and a whump
            this.tone(110, 0.35, 'sawtooth', 0.45, 0.6); this.tone(82, 0.4, 'square', 0.3, 0.7, 0.08); this.noise(0.3, 0.35, 400, 0.02, true); break;
          // round 18: the kicker's run-up and the shot types (발등슛 · 감아차기 · a chipped 파넨카)
          case 'step': this.tone(90 * dt, 0.05, 'sine', 0.35, 0.6); this.noise(0.04, 0.12, 900, 0, true); break; // a stud on the grass
          case 'plant': this.tone(70 * dt, 0.08, 'sine', 0.55, 0.5); this.noise(0.07, 0.2, 700, 0, true); break; // the standing foot digs in
          case 'rocket': // the laces crack, then the ball tears away
            this.noise(0.03, 0.5, 5000); this.tone(60, 0.25, 'sine', 0.9, 0.4);
            this.tone(180, 0.32, 'sawtooth', 0.16, 4, 0.02); this.noise(0.36, 0.22, 2600, 0.03); break;
          case 'spin': // the inside of the foot brushes it; the spinning ball whirs as it bends
            this.noise(0.05, 0.22, 3000);
            for (let i = 0; i < 5; i++) this.tone(620 + i * 90, 0.06, 'triangle', 0.14, 1.15, 0.04 + i * 0.06); break;
          case 'chip': this.tone(520 * dt, 0.06, 'triangle', 0.26, 1.6); this.tone(780, 0.12, 'sine', 0.14, 1.2, 0.05); break; // a soft scoop
          case 'boo': this.noise(1.1, 0.32, 380, 0, true); this.tone(140, 0.9, 'sawtooth', 0.12, 0.9); this.tone(130, 0.9, 'sawtooth', 0.1, 0.95, 0.15); break; // the crowd jeers
        }
      } catch (e) { /* ignore audio errors */ }
    },
    // Settings "소리 테스트": one sample from each family.
    test() {
      this.unlock();
      const seq = ['kick', 'hit', 'gem', 'levelup', 'boss'];
      seq.forEach((n, i) => setTimeout(() => this.sfx(n), i * 350));
      setTimeout(() => this.siuu(), seq.length * 350);
    }
  };
  RS.Audio = A;
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).audio = 'R40';
