/* 호날두 서바이버즈 — audio. SIUU via HTMLAudioElement (works on file://). Tiny WebAudio chiptune SFX.
 * Nothing plays until unlock() is called from a user tap (mobile autoplay rules). */
(function (RS) {
  'use strict';
  const A = {
    muted: false,
    unlocked: false,
    ctx: null,
    siuuEl: null,
    last: {},
    init(muted) {
      this.muted = !!muted;
      try {
        this.siuuEl = new Audio('assets/audio/siuu.mp3');
        this.siuuEl.preload = 'auto';
        this.siuuEl.volume = 0.9;
      } catch (e) { this.siuuEl = null; }
    },
    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.22; this.master.connect(this.ctx.destination); }
      } catch (e) { this.ctx = null; }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      // prime the SIUU element inside the gesture so later programmatic plays are allowed on iOS
      if (this.siuuEl) {
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
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
    siuu() {
      if (this.muted || !this.unlocked || !this.siuuEl) return;
      try { this.siuuEl.currentTime = 0; const p = this.siuuEl.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
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
    noise(dur, vol, hp) {
      const c = this.ctx;
      const n = Math.floor(c.sampleRate * dur);
      if (!this._nb || this._nb.length < n) {
        this._nb = c.createBuffer(1, Math.max(n, c.sampleRate), c.sampleRate);
        const d = this._nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = c.createBufferSource(); s.buffer = this._nb;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
      const g = c.createGain(); g.gain.setValueAtTime(vol || 0.3, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(); s.stop(c.currentTime + dur);
    },
    // Rate-limited named sound effects.
    sfx(name) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const gap = { gem: 0.05, kick: 0.07, shoot: 0.08, hit: 0.05, hurt: 0.15, coin: 0.06 }[name] || 0.03;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      try {
        switch (name) {
          case 'kick': this.tone(220, 0.06, 'square', 0.25, 0.5); this.noise(0.04, 0.12, 2000); break;
          case 'shoot': this.tone(330, 0.09, 'square', 0.25, 0.4); break;
          case 'gem': this.tone(880 + Math.random() * 200, 0.05, 'triangle', 0.25, 1.3); break;
          case 'coin': this.tone(988, 0.05, 'square', 0.2); this.tone(1319, 0.08, 'square', 0.2, null, 0.05); break;
          case 'hurt': this.tone(160, 0.18, 'sawtooth', 0.4, 0.5); break;
          case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.3, null, i * 0.07)); break;
          case 'chest': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.35, null, i * 0.06)); break;
          case 'evolve': [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.2, 'square', 0.3, null, i * 0.09)); break;
          case 'thud': this.tone(110, 0.2, 'sine', 0.6, 0.4); this.noise(0.12, 0.2, 300); break;
          case 'swish': this.noise(0.15, 0.2, 3000); break;
          case 'dash': this.noise(0.1, 0.18, 1500); this.tone(600, 0.08, 'triangle', 0.15, 2); break;
          case 'siu': this.tone(660, 0.08, 'square', 0.25, 1.4); this.tone(990, 0.22, 'square', 0.22, 1.2, 0.08); break;
          case 'warn': this.tone(880, 0.08, 'square', 0.25); this.tone(880, 0.08, 'square', 0.25, null, 0.12); break;
          case 'curl': this.tone(500, 0.2, 'triangle', 0.25, 2); break;
          case 'heal': this.tone(660, 0.1, 'triangle', 0.3, 1.5); break;
          case 'magnet': this.tone(300, 0.3, 'sine', 0.3, 3); break;
          case 'recruit': [659, 784, 988].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.35, null, i * 0.08)); break;
          case 'boss': [196, 185, 175].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.35, null, i * 0.25)); break;
          case 'dead': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.4, null, i * 0.18)); break;
          case 'click': this.tone(700, 0.04, 'square', 0.2); break;
        }
      } catch (e) { /* ignore audio errors */ }
    }
  };
  RS.Audio = A;
})(globalThis.RS = globalThis.RS || {});
