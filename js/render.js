/* 호날두 서바이버즈 — canvas renderer. Draws the world into a low-res canvas at integer scale (crisp pixels),
 * upscales once, then draws text overlays (damage numbers, joystick) in device pixels. Reads world state only. */
(function (RS) {
  'use strict';
  const TAU = Math.PI * 2;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.low = document.createElement('canvas');
      this.lctx = this.low.getContext('2d');
      this.scale = 2;
      this.view = { w: 260, h: 460 };
      this.shake = 0;
      this.resize();
    }

    resize() {
      const cssW = Math.max(200, window.innerWidth), cssH = Math.max(200, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
      this.dpr = dpr;
      this.scale = Math.max(1, Math.round(Math.min(devW / 200, devH / 360)));
      this.view.w = Math.ceil(devW / this.scale);
      this.view.h = Math.ceil(devH / this.scale);
      this.canvas.width = devW; this.canvas.height = devH;
      this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
      this.low.width = this.view.w; this.low.height = this.view.h;
      this.lctx.imageSmoothingEnabled = false;
      this.ctx.imageSmoothingEnabled = false;
    }

    // ------------------------------------------------------------------ frame
    render(w, ui) {
      const L = this.lctx, V = this.view, S = RS.Sprites;
      const p = w.player;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - 1 / 60);
      const sh = this.shake > 0 ? Math.round((Math.random() - 0.5) * 6 * this.shake * 4) : 0;
      const camX = Math.round(p.x - V.w / 2) + sh, camY = Math.round(p.y - V.h / 2);
      this.camX = camX; this.camY = camY;
      const eraKey = w.yearDef.era;
      const th = RS.ERAS[eraKey].theme;

      // grass
      const tile = S.grassTile(eraKey);
      const ox = -(((camX % 64) + 64) % 64), oy = -(((camY % 64) + 64) % 64);
      for (let x = ox; x < V.w; x += 64) for (let y = oy; y < V.h; y += 64) L.drawImage(tile, x, y);
      this.drawPitch(L, camX, camY, th);

      // rescue marker
      if (w.rescue) this.drawRescue(L, w, camX, camY);

      // pickups
      for (const g of w.pickups) {
        if (!g.alive) continue;
        const sx = Math.round(g.x - camX), sy = Math.round(g.y - camY);
        if (sx < -10 || sy < -10 || sx > V.w + 10 || sy > V.h + 10) continue;
        let key = g.kind;
        if (g.kind === 'gem') key = g.value >= 12 ? 'gem3' : g.value >= 4 ? 'gem2' : 'gem1';
        const it = S.item(key);
        const bob = g.kind === 'chest' || g.kind === 'heal' || g.kind === 'magnet' ? Math.round(Math.sin(w.t * 4 + g.bob) * 1.5) : 0;
        L.drawImage(it.n, sx - (it.w >> 1), sy - (it.h >> 1) + bob);
      }

      // boss telegraphs (under units)
      const b = w.boss;
      if (b && b.alive && b.tele) this.drawTele(L, b.tele, camX, camY, w.t);

      // shadows
      const shd = S.shadow();
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const sx = e.x - camX, sy = e.y - camY;
        if (sx < -20 || sy < -20 || sx > V.w + 20 || sy > V.h + 20) continue;
        L.drawImage(shd, Math.round(sx - 4), Math.round(sy + e.r * (e.boss && e.sprite !== 'messi' ? 1.7 : 1.1)));
      }
      L.drawImage(shd, Math.round(p.x - camX - 4), Math.round(p.y - camY + 7));

      // enemies
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const sx = e.x - camX, sy = e.y - camY;
        if (sx < -30 || sy < -40 || sx > V.w + 30 || sy > V.h + 40) continue;
        const spr = e.boss ? S.boss(e.sprite, w.yearIdx) : S.enemy(e.sprite, w.yearIdx);
        if (!spr) continue;
        const fr = spr.frames[e.stun > 0 ? 0 : (Math.floor(e.anim * 7) & 1)];
        const img = e.flash > 0 ? (e.face < 0 ? fr.wf : fr.w) : (e.face < 0 ? fr.f : fr.n);
        const dx = Math.round(sx - spr.w / 2), dy = Math.round(sy - spr.h / 2);
        if (e.elite) {
          L.fillStyle = 'rgba(255,210,60,0.35)';
          L.beginPath(); L.arc(Math.round(sx), Math.round(sy), e.r + 4, 0, TAU); L.fill();
        }
        if (e.boss && e.invuln) {
          L.strokeStyle = 'rgba(126,200,255,' + (0.5 + 0.5 * Math.sin(w.t * 20)) + ')';
          L.lineWidth = 2; L.beginPath(); L.arc(Math.round(sx), Math.round(sy), e.r + 6, 0, TAU); L.stroke();
        }
        if (e.elite) { L.save(); L.translate(Math.round(sx), Math.round(sy)); L.scale(1, 1); L.drawImage(img, -Math.round(spr.w * 0.75), -Math.round(spr.h * 0.75), Math.round(spr.w * 1.5), Math.round(spr.h * 1.5)); L.restore(); }
        else L.drawImage(img, dx, dy);
        if (e.stun > 0 && !e.boss) {
          L.fillStyle = '#ffe14a';
          const a = w.t * 8 + e.uid;
          L.fillRect(Math.round(sx + Math.cos(a) * 4), Math.round(dy - 1), 1, 1);
          L.fillRect(Math.round(sx - Math.cos(a) * 4), Math.round(dy), 1, 1);
        }
        if (e.boss && e.sprite === 'messi' && e.ai && e.ai.phase === 2) {
          L.strokeStyle = 'rgba(255,80,60,0.6)'; L.lineWidth = 1;
          L.beginPath(); L.arc(Math.round(sx), Math.round(sy), e.r + 3 + Math.sin(w.t * 12) * 1.5, 0, TAU); L.stroke();
        }
      }

      // teammates
      for (const m of w.mates) {
        const spr = S.mate(m.id, w.yearIdx);
        const sx = m.x - camX, sy = m.y - camY;
        L.drawImage(shd, Math.round(sx - 4), Math.round(sy + 7));
        const fr = spr.frames[Math.floor(m.anim * 7) & 1];
        L.drawImage(m.face < 0 ? fr.f : fr.n, Math.round(sx - spr.w / 2), Math.round(sy - spr.h / 2));
        if (m.role === 'keeper') {
          L.strokeStyle = 'rgba(80,255,150,' + (m.punch > 0 ? 0.7 : 0.18) + ')';
          L.lineWidth = 1; L.beginPath(); L.arc(Math.round(sx), Math.round(sy), 26 + 5 * m.ref.lv, 0, TAU); L.stroke();
        }
        // role pip
        L.fillStyle = { defender: '#5aa0ff', keeper: '#3ce07a', winger: '#ffb03a', mid: '#c070ff', striker: '#ff4a5a' }[m.role];
        L.fillRect(Math.round(sx - 1), Math.round(sy - spr.h / 2 - 3), 3, 2);
      }

      // player
      this.drawPlayer(L, w, camX, camY);

      // projectiles
      for (const pr of w.projs) {
        if (!pr.alive) continue;
        const it = S.item(pr.kind === 'ball' ? 'ball' : pr.kind);
        const sx = Math.round(pr.x - camX), sy = Math.round(pr.y - camY);
        if (pr.kind === 'cannon' || pr.kind === 'golden' || pr.kind === 'shot') {
          L.fillStyle = pr.kind === 'golden' ? 'rgba(255,215,80,0.35)' : 'rgba(255,140,40,0.35)';
          L.fillRect(Math.round(sx - pr.vx * 0.03) - 2, Math.round(sy - pr.vy * 0.03) - 2, 4, 4);
        }
        L.drawImage(it.n, sx - (it.w >> 1), sy - (it.h >> 1));
      }
      for (const ep of w.eprojs) {
        if (!ep.alive) continue;
        const it = S.item(ep.kind === 'ball' ? 'eball' : ep.kind);
        L.drawImage(it.n, Math.round(ep.x - camX) - (it.w >> 1), Math.round(ep.y - camY) - (it.h >> 1));
      }

      // fx
      this.drawFx(L, w, camX, camY);

      // night stadium for the final
      if (th.night) {
        L.fillStyle = 'rgba(8,10,40,0.35)';
        L.fillRect(0, 0, V.w, V.h);
        const g = L.createRadialGradient(V.w / 2, V.h / 2, 30, V.w / 2, V.h / 2, Math.max(V.w, V.h) * 0.7);
        g.addColorStop(0, 'rgba(255,250,220,0.10)'); g.addColorStop(1, 'rgba(0,0,20,0.45)');
        L.fillStyle = g; L.fillRect(0, 0, V.w, V.h);
      }

      // off-screen arrows
      if (w.rescue) this.arrow(L, w.rescue.x - camX, w.rescue.y - camY, '#7fe0ff');
      if (b && b.alive) this.arrow(L, b.x - camX, b.y - camY, '#ff4a4a');
      for (const g of w.pickups) if (g.alive && g.kind === 'chest') this.arrow(L, g.x - camX, g.y - camY, '#ffd34a');

      // upscale
      const C = this.ctx;
      C.drawImage(this.low, 0, 0, V.w * this.scale, V.h * this.scale);
      this.drawTexts(C, w, camX, camY);
      if (ui && ui.joy && ui.joy.active) this.drawJoystick(C, ui.joy);
    }

    drawPitch(L, camX, camY, th) {
      L.strokeStyle = th.line; L.globalAlpha = 0.55; L.lineWidth = 2;
      const X = (x) => Math.round(x - camX) + 0.5, Yy = (y) => Math.round(y - camY) + 0.5;
      L.beginPath();
      L.rect(X(-420), Yy(-640), 840, 1280);
      L.moveTo(X(-420), Yy(0)); L.lineTo(X(420), Yy(0));
      L.moveTo(X(70), Yy(0)); L.arc(X(0), Yy(0), 70, 0, TAU);
      L.rect(X(-160), Yy(-640), 320, 140);
      L.rect(X(-160), Yy(500), 320, 140);
      L.rect(X(-70), Yy(-640), 140, 50);
      L.rect(X(-70), Yy(590), 140, 50);
      L.stroke();
      L.globalAlpha = 1;
    }

    drawPlayer(L, w, camX, camY) {
      const p = w.player, S = RS.Sprites;
      const spr = S.ronaldo(w.yearIdx);
      const fr = spr.frames[p.moving ? (Math.floor(p.animT * 9) & 1) : 0];
      const blink = p.iframe > 0 && !p.dash && Math.floor(w.t * 20) % 2 === 0;
      const jumpY = p.jump > 0 ? Math.round(Math.sin((1 - p.jump / 0.35) * Math.PI) * 10) : 0;
      const sx = Math.round(p.x - camX), sy = Math.round(p.y - camY) - jumpY;
      if (w.build.evolved.bicycle) { // tornado aura
        const R = RS.SKILLS.bicycle.evo.radius * w.stats.area;
        const a0 = (w.wstate.bicycle && w.wstate.bicycle.angle) || 0;
        L.strokeStyle = 'rgba(200,240,255,0.55)'; L.lineWidth = 2;
        for (let i = 0; i < 3; i++) { L.beginPath(); L.arc(sx, sy + jumpY, R - i * 6, a0 + i * 2.1, a0 + i * 2.1 + 1.2); L.stroke(); }
      }
      if (!blink) {
        const img = p.hurtT > 0 ? (p.face < 0 ? fr.wf : fr.w) : (p.face < 0 ? fr.f : fr.n);
        L.drawImage(img, sx - (spr.w >> 1), sy - (spr.h >> 1));
      }
      // hp bar
      const hpw = 16, ratio = Math.max(0, p.hp / w.stats.maxHp);
      L.fillStyle = 'rgba(0,0,0,0.6)'; L.fillRect(sx - hpw / 2 - 1, sy + (spr.h >> 1) + 1 + jumpY, hpw + 2, 4);
      L.fillStyle = ratio > 0.5 ? '#4ae06a' : ratio > 0.25 ? '#ffc93a' : '#ff4a4a';
      L.fillRect(sx - hpw / 2, sy + (spr.h >> 1) + 2 + jumpY, Math.round(hpw * ratio), 2);
    }

    drawRescue(L, w, camX, camY) {
      const r = w.rescue, S = RS.Sprites;
      const sx = Math.round(r.x - camX), sy = Math.round(r.y - camY);
      L.strokeStyle = 'rgba(127,224,255,0.8)'; L.lineWidth = 2;
      L.beginPath(); L.arc(sx, sy, 22, 0, TAU); L.stroke();
      if (r.progress > 0) {
        L.strokeStyle = '#ffffff'; L.lineWidth = 3;
        L.beginPath(); L.arc(sx, sy, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (r.progress / r.need)); L.stroke();
      }
      const spr = S.mate(r.id, w.yearIdx);
      L.drawImage(spr.frames[0].n, sx - (spr.w >> 1), sy - (spr.h >> 1));
      const by = Math.round(Math.sin(w.t * 6) * 2);
      L.fillStyle = '#ffe14a';
      L.fillRect(sx - 1, sy - (spr.h >> 1) - 9 + by, 3, 5);
      L.fillRect(sx - 1, sy - (spr.h >> 1) - 3 + by, 3, 2);
    }

    drawTele(L, t, camX, camY, time) {
      const a = 0.25 + 0.35 * t.p + 0.15 * Math.sin(time * 25);
      if (t.kind === 'line') {
        L.save();
        L.translate(Math.round(t.x - camX), Math.round(t.y - camY));
        L.rotate(t.a);
        L.fillStyle = 'rgba(255,60,60,' + a + ')';
        L.fillRect(0, -7, t.len, 14);
        L.fillStyle = 'rgba(255,255,255,' + (a * 0.8) + ')';
        L.fillRect(0, -1, t.len * t.p, 2);
        L.restore();
      } else if (t.kind === 'circle') {
        L.fillStyle = 'rgba(255,90,60,' + (a * 0.6) + ')';
        L.beginPath(); L.arc(Math.round(t.x - camX), Math.round(t.y - camY), t.r, 0, TAU); L.fill();
        L.strokeStyle = 'rgba(255,255,255,0.8)'; L.lineWidth = 1;
        L.beginPath(); L.arc(Math.round(t.x - camX), Math.round(t.y - camY), t.r * t.p, 0, TAU); L.stroke();
      }
    }

    drawFx(L, w, camX, camY) {
      const S = RS.Sprites;
      for (const r of w.rings) {
        const k = Math.min(1, r.t / r.dur);
        L.strokeStyle = r.evo ? 'rgba(255,215,80,' + (1 - k * 0.8) + ')' : 'rgba(255,255,255,' + (1 - k * 0.8) + ')';
        L.lineWidth = 3;
        L.beginPath(); L.arc(Math.round(r.x - camX), Math.round(r.y - camY), Math.max(1, r.r), 0, TAU); L.stroke();
      }
      for (const f of w.fx) {
        const k = Math.min(1, f.t / f.dur);
        if (k >= 1) continue;
        const fx = f.follow ? w.player.x : f.x, fy = f.follow ? w.player.y : f.y;
        const sx = Math.round(fx - camX), sy = Math.round(fy - camY);
        switch (f.kind) {
          case 'shock':
            L.strokeStyle = f.color || '#fff'; L.globalAlpha = 1 - k; L.lineWidth = 2;
            L.beginPath(); L.arc(sx, sy, f.r * (0.55 + 0.45 * k), 0, TAU); L.stroke();
            L.globalAlpha = 1; break;
          case 'swing': {
            L.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; L.lineWidth = 3;
            const a0 = k * TAU * 1.2;
            L.beginPath(); L.arc(sx, sy, f.r * 0.85, a0, a0 + 2.2); L.stroke();
            L.strokeStyle = 'rgba(160,220,255,' + (1 - k) + ')'; L.lineWidth = 1;
            L.beginPath(); L.arc(sx, sy, f.r, a0 + 0.3, a0 + 2.6); L.stroke();
            break;
          }
          case 'ghost': case 'mghost': case 'bghost': {
            const spr = f.kind === 'ghost' ? S.ronaldo(w.yearIdx) : f.kind === 'mghost' ? S.mate(f.id, w.yearIdx) : S.boss(f.sprite, w.yearIdx);
            L.globalAlpha = 0.45 * (1 - k);
            L.drawImage(f.face < 0 ? spr.frames[0].f : spr.frames[0].n, sx - (spr.w >> 1), sy - (spr.h >> 1));
            L.globalAlpha = 1; break;
          }
          case 'poof':
            L.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - k)) + ')';
            for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; L.fillRect(Math.round(sx + Math.cos(a) * 6 * k), Math.round(sy + Math.sin(a) * 6 * k), 2, 2); }
            break;
          case 'spark':
            L.fillStyle = 'rgba(255,200,80,' + (1 - k) + ')'; L.fillRect(sx - 3, sy - 3, 6, 6); break;
          case 'save':
            L.strokeStyle = 'rgba(80,255,150,' + (1 - k) + ')'; L.lineWidth = 2;
            L.beginPath(); L.arc(sx, sy, 3 + 6 * k, 0, TAU); L.stroke(); break;
          case 'heal':
            L.fillStyle = 'rgba(80,255,120,' + (1 - k) + ')';
            L.fillRect(sx - 1, sy - 12 - 8 * k, 3, 7); L.fillRect(sx - 3, sy - 10 - 8 * k, 7, 3); break;
          case 'boom':
            for (let i = 0; i < 3; i++) {
              L.strokeStyle = ['#fff', '#ffd34a', '#ff7a3a'][i]; L.globalAlpha = 1 - k; L.lineWidth = 3;
              L.beginPath(); L.arc(sx, sy, f.r * k * (1 - i * 0.2), 0, TAU); L.stroke();
            }
            L.globalAlpha = 1; break;
        }
      }
    }

    arrow(L, sx, sy, color) {
      const V = this.view;
      if (sx > 8 && sy > 8 && sx < V.w - 8 && sy < V.h - 8) return;
      const cx = V.w / 2, cy = V.h / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const m = 14;
      const k = Math.min((V.w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (V.h / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
      L.save(); L.translate(Math.round(x), Math.round(y)); L.rotate(a);
      L.fillStyle = color; L.strokeStyle = '#111'; L.lineWidth = 1;
      L.beginPath(); L.moveTo(7, 0); L.lineTo(-5, -6); L.lineTo(-2, 0); L.lineTo(-5, 6); L.closePath(); L.fill(); L.stroke();
      L.restore();
    }

    drawTexts(C, w, camX, camY) {
      const s = this.scale;
      const base = Math.max(10, Math.round(4.2 * s));
      C.textAlign = 'center'; C.textBaseline = 'middle';
      C.lineJoin = 'round';
      for (const tx of w.texts) {
        if (tx.t > 0.6) continue;
        const k = tx.t / 0.6;
        const x = (tx.x - camX) * s, y = (tx.y - camY - k * 10) * s;
        const size = tx.crit ? Math.round(base * 1.35) : base;
        C.font = '900 ' + size + 'px "Galmuri11", "DungGeunMo", system-ui, sans-serif';
        C.globalAlpha = 1 - k * k;
        C.lineWidth = Math.max(2, s * 0.9); C.strokeStyle = '#111';
        const str = tx.v === 0 ? '무적' : String(tx.v);
        C.strokeText(str, x, y);
        C.fillStyle = tx.crit ? '#ffd23a' : '#ffffff';
        C.fillText(str, x, y);
      }
      C.globalAlpha = 1;
      // SIUU shout text
      for (const r of w.rings) {
        if (r.t > 0.6) continue;
        const x = (w.player.x - camX) * s, y = (w.player.y - camY - 22 - r.t * 20) * s;
        C.font = '900 ' + Math.round(base * 1.6) + 'px system-ui, sans-serif';
        C.globalAlpha = 1 - r.t / 0.6;
        C.lineWidth = s; C.strokeStyle = '#111'; C.strokeText('SIUU!', x, y);
        C.fillStyle = r.evo ? '#ffd23a' : '#ffffff'; C.fillText('SIUU!', x, y);
        C.globalAlpha = 1;
      }
    }

    drawJoystick(C, j) {
      const d = this.dpr;
      C.globalAlpha = 0.5;
      C.fillStyle = 'rgba(0,0,0,0.35)';
      C.strokeStyle = 'rgba(255,255,255,0.8)'; C.lineWidth = 2 * d;
      C.beginPath(); C.arc(j.ox * d, j.oy * d, j.R * d, 0, TAU); C.fill(); C.stroke();
      C.globalAlpha = 0.85;
      C.fillStyle = '#ffffff';
      C.beginPath(); C.arc((j.ox + j.dx * j.R) * d, (j.oy + j.dy * j.R) * d, 18 * d, 0, TAU); C.fill();
      C.globalAlpha = 1;
    }
  }
  RS.Renderer = Renderer;
})(globalThis.RS = globalThis.RS || {});
