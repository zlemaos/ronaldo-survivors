/* 호날두 서바이버즈 — core utilities (no DOM). Loaded first, shared by browser and Node tests. */
(function (RS) {
  'use strict';

  // The build, shown on the title screen. Bump it together with index.html (meta "build", ?v= on every file), the
  // RS_FILES stamp on the last line of every script and --build in src/css/style.css (tests/round12 checks they
  // agree). A page whose files carry two builds — a phone's cache across an update — reloads instead of starting
  // (App.mixedFiles); a tab left open learns of a newer build from App.checkUpdate. Round 11 had no such check, so its
  // files stay unchanged in js/ and css/ for pages cached before round 12; the game itself lives in src/.
  RS.VERSION = 'R20';

  // Seeded RNG (mulberry32) so runs and tests are reproducible.
  RS.makeRng = function (seed) {
    let s = (seed >>> 0) || 1;
    const f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.range = (a, b) => a + f() * (b - a);
    f.getState = () => s;
    return f;
  };

  RS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  RS.lerp = (a, b, t) => a + (b - a) * t;

  RS.pickWeighted = function (rng, items, weightKey) {
    let total = 0;
    for (const it of items) total += weightKey ? it[weightKey] : it.w;
    let r = rng() * total;
    for (const it of items) {
      r -= weightKey ? it[weightKey] : it.w;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  // Spatial hash grid with typed-array linked lists. Rebuilt every step; no per-frame allocation.
  class Grid {
    constructor(cell, buckets, cap) {
      this.cell = cell;
      this.mask = buckets - 1; // buckets must be a power of two
      this.head = new Int32Array(buckets).fill(-1);
      this.next = new Int32Array(cap);
      this.items = [];
      this.stamp = 0;
    }
    clear() {
      this.head.fill(-1);
      this.items.length = 0;
    }
    key(cx, cy) {
      return ((cx * 73856093) ^ (cy * 19349663)) & this.mask;
    }
    insert(obj) {
      const i = this.items.length;
      if (i >= this.next.length) {
        const n = new Int32Array(this.next.length * 2);
        n.set(this.next);
        this.next = n;
      }
      this.items.push(obj);
      const k = this.key(Math.floor(obj.x / this.cell), Math.floor(obj.y / this.cell));
      this.next[i] = this.head[k];
      this.head[k] = i;
    }
    // Fills `out` with unique objects whose cell overlaps the square around (x,y,r). Caller checks real distance.
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const st = ++this.stamp;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (let i = this.head[this.key(cx, cy)]; i !== -1; i = this.next[i]) {
            const o = this.items[i];
            if (o._gq === st) continue;
            o._gq = st;
            out.push(o);
          }
        }
      }
      return out;
    }
  }
  RS.Grid = Grid;

  // Storage wrapper: localStorage in the browser, in-memory in Node or when storage is blocked.
  RS.makeStorage = function (backend) {
    const mem = {};
    let ls = backend;
    if (ls === undefined) {
      try {
        ls = typeof localStorage !== 'undefined' ? localStorage : null;
        if (ls) { ls.setItem('__rs_probe', '1'); ls.removeItem('__rs_probe'); }
      } catch (e) { ls = null; }
    }
    return {
      get(k) {
        try { if (ls) return ls.getItem(k); } catch (e) { /* fall through */ }
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      set(k, v) {
        try { if (ls) { ls.setItem(k, v); return; } } catch (e) { /* fall through */ }
        mem[k] = v;
      },
      remove(k) {
        try { if (ls) { ls.removeItem(k); return; } } catch (e) { /* ignore */ }
        delete mem[k];
      }
    };
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).core = 'R20';
