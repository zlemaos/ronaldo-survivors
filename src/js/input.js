/* 호날두 서바이버즈 — input. Floating virtual joystick (touch/drag anywhere) + WASD/arrow keys. */
(function (RS) {
  'use strict';
  class Input {
    constructor(el) {
      this.el = el;
      this.keys = {};
      this.joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, R: 52 };
      this.enabled = true;
      el.addEventListener('pointerdown', (e) => this.down(e));
      window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
      window.addEventListener('pointerup', (e) => this.up(e));
      window.addEventListener('pointercancel', (e) => this.up(e));
      window.addEventListener('keydown', (e) => {
        const k = this.norm(e.key);
        if (k) { this.keys[k] = true; if (this.enabled) e.preventDefault(); }
      });
      window.addEventListener('keyup', (e) => { const k = this.norm(e.key); if (k) this.keys[k] = false; });
      window.addEventListener('blur', () => { this.keys = {}; this.release(); });
    }
    norm(k) {
      switch (k) {
        case 'ArrowUp': case 'w': case 'W': case 'ㅈ': return 'up';
        case 'ArrowDown': case 's': case 'S': case 'ㄴ': return 'down';
        case 'ArrowLeft': case 'a': case 'A': case 'ㅁ': return 'left';
        case 'ArrowRight': case 'd': case 'D': case 'ㅇ': return 'right';
      }
      return null;
    }
    down(e) {
      if (!this.enabled || this.joy.active) return;
      e.preventDefault();
      this.joy.active = true; this.joy.id = e.pointerId;
      this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.dx = 0; this.joy.dy = 0;
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    move(e) {
      if (!this.joy.active || e.pointerId !== this.joy.id) return;
      e.preventDefault();
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const d = Math.hypot(dx, dy), R = this.joy.R;
      if (d > R) {
        // floating: drag the base along so reversing direction is instant
        this.joy.ox += dx / d * (d - R); this.joy.oy += dy / d * (d - R);
        dx = e.clientX - this.joy.ox; dy = e.clientY - this.joy.oy;
      }
      this.joy.dx = dx / R; this.joy.dy = dy / R;
    }
    up(e) { if (this.joy.active && e.pointerId === this.joy.id) this.release(); }
    release() { this.joy.active = false; this.joy.id = null; this.joy.dx = 0; this.joy.dy = 0; }
    vector() {
      let x = 0, y = 0;
      if (this.keys.left) x -= 1; if (this.keys.right) x += 1;
      if (this.keys.up) y -= 1; if (this.keys.down) y += 1;
      if (x || y) { const n = Math.hypot(x, y); return { x: x / n, y: y / n }; }
      if (this.joy.active) {
        const m = Math.hypot(this.joy.dx, this.joy.dy);
        if (m < 0.12) return { x: 0, y: 0 };
        const k = Math.min(1, m) / m;
        return { x: this.joy.dx * k, y: this.joy.dy * k };
      }
      return { x: 0, y: 0 };
    }
  }
  RS.Input = Input;
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).input = 'R27';
