/* 호날두 서바이버즈 — canvas renderer. Draws the world into a low-res canvas (HD = 2 canvas pixels per world
 * pixel, so the HD people sprites show their half-pixel detail; everything else is drawn in world units through a
 * 2× transform), upscales once, then draws text overlays (damage numbers, joystick) in device pixels.
 * Reads world state only. */
(function (RS) {
  'use strict';
  const TAU = Math.PI * 2;
  const HD = 2; // low-res canvas pixels per world pixel
  const H2 = (v) => Math.round(v * HD) / HD; // snap to one canvas pixel (half a world pixel)
  // The SIUUU grade's colour at time t, 'r,g,b': RS.SIUUU_CYCLE (cyan → gold → pink) over the card's 1.2-s cycle.
  let CYC = null;
  const siuuuRgb = (t) => {
    CYC = CYC || RS.SIUUU_CYCLE.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    const x = (((t / 1.2) % 1) + 1) % 1 * CYC.length, i = Math.floor(x), f = x - i, a = CYC[i], b = CYC[(i + 1) % CYC.length];
    return a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',');
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.low = document.createElement('canvas');
      this.lctx = this.low.getContext('2d');
      this.scale = 2;
      this.view = { w: 260, h: 460 };
      this.shake = 0;
      this.pfx = []; // live pixelfx instances (drawPfx)
      this.resize();
    }

    resize() {
      const cssW = Math.max(200, window.innerWidth), cssH = Math.max(200, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
      this.dpr = dpr;
      // a 390-px phone gets 5x (16-px people ≈ 45 CSS px tall), a 1080p desktop 4x
      this.scale = Math.max(1, Math.round(Math.min(devW / 156, devH / 280)));
      this.view.w = Math.ceil(devW / this.scale);
      this.view.h = Math.ceil(devH / this.scale);
      this.canvas.width = devW; this.canvas.height = devH;
      this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
      this.low.width = this.view.w * HD; this.low.height = this.view.h * HD;
      this.lctx.imageSmoothingEnabled = false;
      this.ctx.imageSmoothingEnabled = false;
    }

    // ------------------------------------------------------------------ frame
    // Where to draw a moving thing: between its position at the start of the last step (px, py) and now, by how
    // far the clock is into the next step (ui.alpha), on the half-pixel grid of the 2× canvas.
    lx(o) { return o.px === undefined ? o.x : o.px + (o.x - o.px) * this.alpha; }
    ly(o) { return o.py === undefined ? o.y : o.py + (o.y - o.py) * this.alpha; }

    render(w, ui) {
      const L = this.lctx, V = this.view, S = RS.Sprites;
      L.setTransform(HD, 0, 0, HD, 0, 0);
      const p = w.player;
      this.heroColor = RS.GRADES[w.build.weapon.g].color;
      this.alpha = ui && ui.alpha != null ? ui.alpha : 1;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - 1 / 60);
      const sh = this.shake > 0 ? Math.round((Math.random() - 0.5) * 6 * this.shake * 4) : 0;
      const camDy = ui && ui.camDy ? Math.round(ui.camDy * V.h) : 0; // title screen: player sits low
      const camX = H2(this.lx(p) - V.w / 2) + sh, camY = H2(this.ly(p) - V.h / 2) - camDy;
      this.camX = camX; this.camY = camY;
      const eraKey = w.yearDef.era;
      const th = RS.ERAS[eraKey].theme;

      // grass (an HD tile: two canvas pixels per world pixel)
      const tile = S.grassTile(eraKey);
      const ox = -(((camX % 64) + 64) % 64), oy = -(((camY % 64) + 64) % 64);
      for (let x = ox; x < V.w; x += 64) for (let y = oy; y < V.h; y += 64) L.drawImage(tile, x, y, 64, 64);
      this.drawPitch(L, camX, camY, th);
      // scorch marks of 드롭볼 landings sit on the turf, under everything else
      for (const f of w.fx) if (f.kind === 'crater' && f.t < f.dur) this.drawCrater(L, f, camX, camY);

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

      // 불꽃 질주: burning turf patches (ground layer, under everything that stands). Drawn in passes — every scorched
      // rim, then every fire, then the flames — so a slide's row of patches reads as one burning carpet (round 12)
      const zv = this._zv || (this._zv = []);
      zv.length = 0;
      for (const z of w.zones) {
        if (z.t >= z.life) continue;
        const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY);
        if (sx < -30 || sy < -30 || sx > V.w + 30 || sy > V.h + 30) continue;
        const k = z.t / z.life;
        zv.push({ z, sx, sy, fade: k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.6) / 0.4) });
      }
      for (const { z, sx, sy, fade } of zv) {
        L.globalAlpha = fade * 0.85;
        L.fillStyle = '#703519'; L.beginPath(); L.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, TAU); L.fill();
      }
      for (const { z, sx, sy, fade } of zv) {
        L.globalAlpha = fade * 0.85;
        L.fillStyle = z.evo ? this.heroColor : '#ffae32';
        L.beginPath(); L.ellipse(sx, sy, z.r * 0.85, z.r * 0.46, 0, 0, TAU); L.fill();
      }
      for (const { z, sx, sy, fade } of zv) {
        const fl = 0.75 + 0.25 * Math.sin(w.t * 18 + z.seed);
        L.globalAlpha = fade * 0.85;
        L.fillStyle = '#fff3a0';
        for (let j = -1; j <= 1; j++) {
          const x = sx + j * z.r * 0.45, h = 4 + 5 * fl;
          L.beginPath(); L.moveTo(x - 3, sy + 2); L.lineTo(x + 1, sy - h); L.lineTo(x + 4, sy + 2); L.fill();
        }
        L.globalAlpha = 1;
        const h = Math.round((w.t * 30 + z.seed * 10) % 6); // two licking flame pixels
        L.fillStyle = 'rgba(255,220,90,' + (0.85 * fade) + ')';
        L.fillRect(sx - 2, sy - 2 - h, 1, 2); L.fillRect(sx + 2, sy - 1 - ((h + 3) % 6), 1, 2);
      }

      // boss / 준보스 telegraphs (under units)
      const b = w.boss;
      for (const e of w.enemies) if (e.alive && e.tele) this.drawTele(L, e.tele, camX, camY, w.t);

      // shadows
      const shd = S.shadow();
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const sx = this.lx(e) - camX, sy = this.ly(e) - camY;
        if (sx < -20 || sy < -20 || sx > V.w + 20 || sy > V.h + 20) continue;
        L.drawImage(shd, H2(sx - 6), H2(sy + e.r * (e.boss && !RS.FINAL[e.sprite] ? 1.7 : 1.1) + 1));
      }
      L.drawImage(shd, H2(this.lx(p) - camX - 6), H2(this.ly(p) - camY + 7));

      // enemies
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const sx = this.lx(e) - camX, sy = this.ly(e) - camY;
        if (sx < -30 || sy < -40 || sx > V.w + 30 || sy > V.h + 40) continue;
        const spr = e.boss ? S.boss(e.sprite, w.yearIdx) : S.enemy(e.sprite, w.yearIdx, e.tier);
        if (!spr) continue;
        // pace shows in the walk: heavy ones step slowly, quick ones scurry
        const fps = e.boss ? 8 : e.pace === 'slow' ? 4 : e.pace === 'fast' ? 13 : 8;
        const fr = spr.frames[e.stun > 0 ? 0 : (Math.floor(e.anim * fps) % Math.min(4, spr.frames.length))]; // run cycle only (the 날두 boss also has poses)
        const img = e.flash > 0 ? (e.face < 0 ? fr.wf : fr.w) : (e.face < 0 ? fr.f : fr.n);
        const dx = H2(sx - spr.w / 2), dy = H2(sy - spr.h / 2);
        if (!e.boss && e.stun <= 0 && e.pace === 'fast') { // speed streaks behind the runner
          const ph = Math.floor(e.anim * 13) % 2, bx = Math.round(sx - e.face * (spr.w / 2 + 1));
          L.fillStyle = 'rgba(255,255,255,0.6)';
          L.fillRect(bx - (e.face > 0 ? 3 + ph : -ph), Math.round(sy - 2), 3, 1);
          L.fillRect(bx - (e.face > 0 ? 4 + ph : -1 - ph), Math.round(sy + 1), 4, 1);
        } else if (!e.boss && e.stun <= 0 && e.pace === 'slow') { // heavy stomps: a dust puff on every step
          const st = (e.anim * 4) % 1;
          if (st < 0.3) {
            const big = e.elite || e.mini, fy = Math.round(sy + spr.h * (big ? 0.75 : 0.5)) - 1, sp = 5 + (big ? 4 : 0) + st * 10;
            L.fillStyle = 'rgba(225,215,185,' + (0.6 * (1 - st / 0.3)) + ')';
            L.fillRect(Math.round(sx - sp), fy, 2, 1); L.fillRect(Math.round(sx + sp - 1), fy, 2, 1);
            L.fillRect(Math.round(sx - sp + 1), fy - 1, 1, 1); L.fillRect(Math.round(sx + sp - 1), fy - 1, 1, 1);
          }
        }
        if (e.elite) {
          L.fillStyle = 'rgba(255,210,60,0.35)';
          L.beginPath(); L.arc(Math.round(sx), Math.round(sy), e.r + 4, 0, TAU); L.fill();
        }
        if (e.boss && e.invuln) {
          L.strokeStyle = 'rgba(126,200,255,' + (0.5 + 0.5 * Math.sin(w.t * 20)) + ')';
          L.lineWidth = 2; L.beginPath(); L.arc(Math.round(sx), Math.round(sy), e.r + 6, 0, TAU); L.stroke();
        }
        // enemies pressing against the hero go translucent so he never disappears inside a pile
        const near = !e.boss && !e.mini && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 18 * 18;
        if (near) L.globalAlpha = 0.55;
        if (e.elite || e.mini) {
          L.drawImage(img, Math.round(sx - spr.w * 0.75), Math.round(sy - spr.h * 0.75), Math.round(spr.w * 1.5), Math.round(spr.h * 1.5));
          if (e.mini) { // 준보스 HP bar + name tag
            const bw = 26, ratio = Math.max(0, e.hp / e.maxHp), by = Math.round(sy - spr.h * 0.75) - 5;
            L.fillStyle = 'rgba(0,0,0,0.65)'; L.fillRect(Math.round(sx - bw / 2) - 1, by - 1, bw + 2, 5);
            L.fillStyle = e.charging ? '#ffd23a' : '#ff5a3a'; L.fillRect(Math.round(sx - bw / 2), by, Math.round(bw * ratio), 3);
          }
        } else if (e.flash > 0 && !e.boss) { // hit: a quick squash from the feet (wider, shorter)
          const sw = spr.w * 1.14, shh = spr.h * 0.88;
          L.drawImage(img, H2(sx - sw / 2), H2(sy + spr.h / 2 - shh), sw, shh);
        } else L.drawImage(img, dx, dy, spr.w, spr.h);
        if (near) L.globalAlpha = 1;
        if (e.stun > 0 && !e.boss) {
          L.fillStyle = '#ffe14a';
          const a = w.t * 8 + e.uid;
          L.fillRect(Math.round(sx + Math.cos(a) * 4), Math.round(dy - 1), 1, 1);
          L.fillRect(Math.round(sx - Math.cos(a) * 4), Math.round(dy), 1, 1);
        }
        if (e.boss && e.ai && RS.FINAL[e.ai.kind] && e.ai.phase === 2) {
          L.strokeStyle = 'rgba(255,80,60,0.6)'; L.lineWidth = 1;
          L.beginPath(); L.arc(Math.round(sx), Math.round(sy), e.r + 3 + Math.sin(w.t * 12) * 1.5, 0, TAU); L.stroke();
        }
      }

      // teammates
      for (const m of w.mates) {
        const spr = S.mate(m.id, w.yearIdx);
        const sx = this.lx(m) - camX, sy = this.ly(m) - camY;
        L.drawImage(shd, H2(sx - 6), H2(sy + 7));
        const fr = spr.frames[m.kickT > 0 ? 4 : Math.floor(m.anim * 8) % 4];
        L.drawImage(m.face < 0 ? fr.f : fr.n, H2(sx - spr.w / 2), H2(sy - spr.h / 2), spr.w, spr.h);
        if (m.role === 'keeper') {
          L.strokeStyle = 'rgba(80,255,150,' + (m.punch > 0 ? 0.7 : 0.18) + ')';
          L.lineWidth = 1; L.beginPath(); L.arc(Math.round(sx), Math.round(sy), RS.keeperRadius(m.ref.lv), 0, TAU); L.stroke();
        }
        // (the role icon above the head is drawn crisp on the text layer, drawTexts)
      }

      // player
      this.drawPlayer(L, w, camX, camY);

      // 메시's ball moves (under the projectiles): 회전 공, 드리볼, 드롭볼
      if (w.orbs && w.orbs.length && w.build.skills.orbit) this.drawOrbs(L, w, camX, camY);
      if (w.dribs && w.dribs.length) this.drawDribs(L, w, camX, camY);
      if (w.drops && w.drops.length) this.drawDrops(L, w, camX, camY);
      // projectiles
      for (const pr of w.projs) {
        if (!pr.alive) continue;
        const tro = pr.kind === 'ballon'; // a 발롱도르 the hero has really won (RS.ballonCount): the trophy ball
        const sx = H2(this.lx(pr) - camX), sy = H2(this.ly(pr) - camY);
        if (sx < -20 || sy < -20 || sx > V.w + 20 || sy > V.h + 20) continue;
        if (pr.kind === 'pcannon') { this.drawPCannon(L, pr, sx, sy, w.t); continue; }
        // motion trail: two fading dots behind every ball (hot colours for the power shots)
        L.strokeStyle = this.heroColor; L.lineWidth = 5; L.lineCap = 'round';
        L.beginPath(); L.moveTo(sx - pr.vx * 0.055, sy - pr.vy * 0.055); L.lineTo(sx, sy); L.stroke();
        L.strokeStyle = '#f5ffff'; L.lineWidth = 2;
        L.beginPath(); L.moveTo(sx - pr.vx * 0.035, sy - pr.vy * 0.035); L.lineTo(sx, sy); L.stroke();
        L.lineCap = 'butt';
        const goldish = tro || pr.kind === 'golden';
        const hot = goldish || pr.kind === 'cannon' || pr.kind === 'shot' || pr.kind === 'rabona2';
        L.fillStyle = goldish ? 'rgba(255,215,80,0.5)' : pr.kind === 'rabona2' ? 'rgba(255,90,190,0.55)' : hot ? 'rgba(255,140,40,0.5)' : pr.kind === 'rabona' ? 'rgba(255,170,60,0.5)' : 'rgba(255,255,255,0.35)';
        L.fillRect(Math.round(sx - pr.vx * 0.025) - 1, Math.round(sy - pr.vy * 0.025) - 1, hot ? 3 : 2, hot ? 3 : 2);
        L.fillStyle = goldish ? 'rgba(255,215,80,0.25)' : hot ? 'rgba(255,140,40,0.25)' : 'rgba(255,255,255,0.18)';
        L.fillRect(Math.round(sx - pr.vx * 0.05) - 1, Math.round(sy - pr.vy * 0.05) - 1, 2, 2);
        if (tro) {
          const d = Math.max(8, Math.round(pr.r * 2.4)), spr = S.orb('ballon', d, (Math.floor(w.t * 18) + (pr.x | 0)) % S.ORB_FRAMES), gl = S.orbGlow(d);
          L.globalCompositeOperation = 'lighter'; L.globalAlpha = 0.6;
          L.drawImage(gl, sx - (gl.width >> 1), sy - (gl.height >> 1));
          L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
          L.drawImage(spr.c, sx - spr.cx, sy - spr.cy);
        } else {
          const it = S.item(pr.kind === 'ball' ? 'ball' : pr.kind);
          L.drawImage(it.n, sx - (it.w >> 1), sy - (it.h >> 1));
        }
      }
      this.drawEnemyShots(L, w, camX, camY);

      // fx
      this.drawFx(L, w, camX, camY);
      this.drawPfx(L, w, camX, camY);

      // soft vignette: the pitch falls off toward the screen edges, so the eye stays on the action
      L.drawImage(this.vignette(), 0, 0, V.w, V.h);

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

    // 메시's orbiting balls (each ball's look from World.updateOrbit): a white ball, golden from Lv.3, a 발롱도르
    // trophy for every one he has won once evolved — each spinning over a ground shadow; a trophy glows and
    // twinkles. A flash ring marks a change on the ring mid-run (a new look or another ball).
    drawOrbs(L, w, camX, camY) {
      const S = RS.Sprites, V = this.view;
      let sig = 0;
      for (const o of w.orbs) sig += o.look === 'ballon' ? 1000 : o.look === 'gold' ? 30 : 1;
      if (this.orbWorld !== w) { this.orbWorld = w; this.orbLook = sig; this.orbFlash = 0; }
      else if (this.orbLook !== sig) { this.orbLook = sig; this.orbFlash = 1; }
      const fl = this.orbFlash;
      if (fl > 0) this.orbFlash = Math.max(0, fl - 1 / 45);
      const spin = Math.floor(w.t * 18);
      for (let i = 0; i < w.orbs.length; i++) {
        const o = w.orbs[i], look = o.look || 'white', trophy = look === 'ballon';
        const sx = H2(this.lx(o) - camX), sy = H2(this.ly(o) - camY);
        if (sx < -50 || sy < -50 || sx > V.w + 50 || sy > V.h + 50) continue;
        const d = Math.max(6, Math.round(o.r * 2));
        L.strokeStyle = this.heroColor; L.lineWidth = 2;
        L.beginPath(); L.arc(sx, sy, o.r + 2, 0, TAU); L.stroke();
        const spr = S.orb(look, d, (spin + i * 3) % S.ORB_FRAMES);
        L.fillStyle = 'rgba(0,0,0,0.22)';
        L.beginPath(); L.ellipse(sx, sy + spr.foot, o.r * 0.9, Math.max(1, o.r * 0.3), 0, 0, TAU); L.fill();
        if (trophy) {
          const gl = S.orbGlow(d);
          L.globalCompositeOperation = 'lighter';
          L.globalAlpha = 0.55 + 0.25 * Math.sin(w.t * 5 + i);
          L.drawImage(gl, sx - (gl.width >> 1), sy - (gl.height >> 1));
          L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
        }
        L.drawImage(spr.c, sx - spr.cx, sy - spr.cy);
        if (trophy) { // two twinkles per trophy
          for (let k = 0; k < 2; k++) {
            const ph = w.t * 2.6 + i * 1.7 + k * 3.1, s = Math.sin(ph);
            if (s < 0.55) continue;
            const a = i * 2.4 + k * 2.1 + Math.floor(ph / TAU) * 1.3;
            const tx = Math.round(sx + Math.cos(a) * o.r * 0.95), ty = Math.round(sy + Math.sin(a) * o.r * 0.95);
            const arm = d >= 24 ? 2 : 1;
            L.globalAlpha = (s - 0.55) / 0.45;
            L.fillStyle = '#fffbe0';
            L.fillRect(tx - arm, ty, arm * 2 + 1, 1); L.fillRect(tx, ty - arm, 1, arm * 2 + 1);
            L.globalAlpha = 1;
          }
        }
        if (fl > 0) { // the ball just changed look: a white-hot flash and a widening ring
          L.globalCompositeOperation = 'lighter'; L.globalAlpha = fl * 0.8;
          L.drawImage(spr.c, sx - spr.cx, sy - spr.cy);
          L.globalCompositeOperation = 'source-over'; L.globalAlpha = fl;
          L.strokeStyle = trophy ? '#ffe27a' : '#ffffff'; L.lineWidth = 1;
          L.beginPath(); L.arc(sx, sy, o.r + 2 + (1 - fl) * 12, 0, TAU); L.stroke();
          L.globalAlpha = 1;
        }
      }
    }

    // 드리볼: each ball spins along its path with two fading after-images behind it (look: each ball's, RS.ballLookAt).
    drawDribs(L, w, camX, camY) {
      const S = RS.Sprites, V = this.view;
      for (const b of w.dribs) {
        const look = b.look || 'white', trophy = look === 'ballon';
        const sx = H2(this.lx(b) - camX), sy = H2(this.ly(b) - camY);
        if (sx < -30 || sy < -30 || sx > V.w + 30 || sy > V.h + 30) continue;
        const d = Math.max(6, Math.round(b.r * 2)), spr = S.orb(look, d, Math.floor(b.spin / 3) % S.ORB_FRAMES);
        L.strokeStyle = this.heroColor; L.lineWidth = 2;
        L.beginPath(); L.arc(sx, sy, b.r + 2, 0, TAU); L.stroke();
        L.fillStyle = 'rgba(0,0,0,0.22)';
        L.beginPath(); L.ellipse(sx, sy + spr.foot, b.r * 0.9, Math.max(1, b.r * 0.3), 0, 0, TAU); L.fill();
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 40) for (let k = 2; k >= 1; k--) { // after-images along the velocity
          L.globalAlpha = 0.16 * (3 - k);
          L.drawImage(spr.c, H2(sx - b.vx * 0.022 * k) - spr.cx, H2(sy - b.vy * 0.022 * k) - spr.cy);
        }
        L.globalAlpha = 1;
        if (trophy) {
          const gl = S.orbGlow(d);
          L.globalCompositeOperation = 'lighter'; L.globalAlpha = 0.6;
          L.drawImage(gl, sx - (gl.width >> 1), sy - (gl.height >> 1));
          L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
        }
        L.drawImage(spr.c, sx - spr.cx, sy - spr.cy);
      }
    }

    // 드롭볼: circling (bobbing over a shadow) → shooting up (light trail) → crashing down on a marked spot (meteor
    // trail, a growing shadow and a closing ring) → gone until it pops back.
    drawDrops(L, w, camX, camY) {
      const S = RS.Sprites, V = this.view;
      const lv = w.build.skills.dropball || 1;
      const st = RS.skillStats('dropball', lv, w.build.evolved.dropball, w.build.stars && w.build.stars.dropball);
      const R = st.radius * w.stats.area, d = 8, spin = Math.floor(w.t * 16);
      for (const b of w.drops) {
        if (b.st === 'gone') continue;
        const look = b.look || 'white', gold = look !== 'white', hot = gold ? '255,214,90' : '255,255,255';
        const sx = H2(this.lx(b) - camX), sy = H2(this.ly(b) - camY);
        if (sx < -60 || sy < -200 || sx > V.w + 60 || sy > V.h + 60) continue;
        const spr = S.orb(look, d, (spin + b.i * 3) % S.ORB_FRAMES), by = H2(sy - b.h);
        if (b.st === 'fall') {
          const k = Math.min(1, b.t / 0.42);
          L.strokeStyle = this.heroColor; L.lineWidth = 3;
          L.beginPath(); L.arc(sx, sy, R * (1.25 - 0.25 * k), 0, TAU); L.stroke(); // where it will land
          L.fillStyle = 'rgba(0,0,0,' + (0.12 + 0.3 * k) + ')';
          L.beginPath(); L.ellipse(sx, sy, 2 + 7 * k, 1 + 3 * k, 0, 0, TAU); L.fill();
          const g = L.createLinearGradient(sx, by - 34, sx, by);
          g.addColorStop(0, 'rgba(' + hot + ',0)'); g.addColorStop(1, 'rgba(' + hot + ',0.75)');
          L.strokeStyle = g; L.lineWidth = 3;
          L.beginPath(); L.moveTo(sx, by - 34); L.lineTo(sx, by); L.stroke();
        } else {
          L.fillStyle = 'rgba(0,0,0,' + (b.st === 'rise' ? Math.max(0, 0.22 - b.h / 400) : 0.22) + ')';
          L.beginPath(); L.ellipse(sx, sy + 2, 3.5, 1.3, 0, 0, TAU); L.fill();
          if (b.st === 'rise') {
            L.globalAlpha = Math.max(0, 1 - b.t / 0.35);
            const g = L.createLinearGradient(sx, by, sx, sy);
            g.addColorStop(0, 'rgba(' + hot + ',0.8)'); g.addColorStop(1, 'rgba(' + hot + ',0)');
            L.strokeStyle = g; L.lineWidth = 2;
            L.beginPath(); L.moveTo(sx, by); L.lineTo(sx, sy); L.stroke();
          }
        }
        if (gold) {
          const gl = S.orbGlow(d);
          L.globalCompositeOperation = 'lighter';
          L.drawImage(gl, sx - (gl.width >> 1), by - (gl.height >> 1));
          L.globalCompositeOperation = 'source-over';
        }
        L.drawImage(spr.c, sx - spr.cx, by - spr.cy);
        L.globalAlpha = 1;
      }
    }

    // A dark burnt ring where a 드롭볼 landed, fading out (ground layer).
    drawCrater(L, f, camX, camY) {
      const k = f.t / f.dur, sx = H2(f.x - camX), sy = H2(f.y - camY);
      L.globalAlpha = 0.55 * (1 - k);
      const g = L.createRadialGradient(sx, sy, 1, sx, sy, f.r);
      g.addColorStop(0, 'rgba(30,22,10,0.9)'); g.addColorStop(0.6, 'rgba(60,44,20,0.55)'); g.addColorStop(1, 'rgba(60,44,20,0)');
      L.fillStyle = g; L.beginPath(); L.ellipse(sx, sy, f.r, f.r * 0.55, 0, 0, TAU); L.fill();
      L.globalAlpha = 1;
    }

    // Edge darkening over the play area (cached per view size).
    vignette() {
      const V = this.view;
      if (this._vig && this._vigW === V.w && this._vigH === V.h) return this._vig;
      const c = document.createElement('canvas');
      c.width = V.w; c.height = V.h;
      const g = c.getContext('2d'), r = Math.hypot(V.w, V.h) / 2;
      const gr = g.createRadialGradient(V.w / 2, V.h * 0.48, r * 0.45, V.w / 2, V.h * 0.48, r);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.32)');
      g.fillStyle = gr; g.fillRect(0, 0, V.w, V.h);
      this._vig = c; this._vigW = V.w; this._vigH = V.h;
      return c;
    }

    drawPlayer(L, w, camX, camY) {
      const p = w.player, S = RS.Sprites;
      const spr = S.hero(w.hero, w.yearIdx, 1, null, w.small);
      // frames 0-3 run, 4 kick, 5 날두's heading jump / 메시's dribble (his dashes); running adds a 1-px bob
      const step = Math.floor(p.animT * 10);
      const fi = p.jump > 0 || (w.hero === 'messi' && p.dash) ? 5 : p.kickT > 0 ? 4 : p.moving ? step % 4 : 0;
      const fr = spr.frames[fi];
      const bob = p.moving && fi < 4 && (step % 2) ? 1 : 0;
      const blink = p.iframe > 0 && !p.dash && Math.floor(w.t * 20) % 2 === 0;
      const jumpY = (p.jump > 0 ? Math.round(Math.sin((1 - p.jump / 0.35) * Math.PI) * 14) : 0) + bob;
      const sx = H2(this.lx(p) - camX), sy = H2(this.ly(p) - camY) - jumpY;
      if (p.jump > 0) { // the ball he is about to head, rising with him
        const it = S.item('ball');
        L.drawImage(it.n, sx + p.face * 7 - (it.w >> 1), sy - (spr.h >> 1) - 4);
      }
      const aura = w.build.skillOrder.find((id) => w.build.evolved[id] && RS.SKILLS[id].evo.aura);
      if (aura) { // tornado aura (바이시클 킥 / 엘라스티코 evolved: gold)
        const R = RS.SKILLS[aura].evo.radius * w.stats.area;
        const a0 = (w.wstate[aura] && w.wstate[aura].angle) || 0;
        L.strokeStyle = aura === 'elastico' ? 'rgba(255,216,74,0.6)' : 'rgba(200,240,255,0.55)'; L.lineWidth = 2;
        for (let i = 0; i < 3; i++) { L.beginPath(); L.arc(sx, sy + jumpY, R - i * 6, a0 + i * 2.1, a0 + i * 2.1 + 1.2); L.stroke(); }
      }
      // hero spotlight: a soft light pool and a pulsing gold ring under the feet, always under the sprite
      const fy = sy + jumpY + (spr.h >> 1) - 3;
      const pulse = 0.5 + 0.5 * Math.sin(w.t * 5);
      const g = L.createRadialGradient(sx, fy, 2, sx, fy, 22);
      g.addColorStop(0, 'rgba(255,240,180,0.18)'); g.addColorStop(1, 'rgba(255,240,180,0)');
      L.fillStyle = g; L.beginPath(); L.ellipse(sx, fy, 22, 11, 0, 0, TAU); L.fill();
      L.strokeStyle = 'rgba(255,216,74,' + (0.55 + 0.35 * pulse) + ')'; L.lineWidth = 1.5;
      L.beginPath(); L.ellipse(sx, fy, 10 + pulse, 4.5 + pulse * 0.5, 0, 0, TAU); L.stroke();
      if (w.build.weapon.g >= RS.GRADES.length - 1) { // round 19: a SIUUU weapon in hand — its colours circle his feet
        L.strokeStyle = 'rgba(' + siuuuRgb(w.t) + ',0.95)'; L.lineWidth = 2;
        L.beginPath(); L.ellipse(sx, fy, 15 + pulse * 2, 6.5 + pulse, 0, 0, TAU); L.stroke();
        for (let i = 0; i < 6; i++) { // motes rising round him
          const a = w.t * 2.5 + i * TAU / 6, up = (w.t * 0.9 + i * 0.17) % 1;
          L.fillStyle = 'rgba(' + siuuuRgb(w.t + i * 0.2) + ',' + (1 - up) + ')';
          L.fillRect(H2(sx + Math.cos(a) * 14), H2(fy + Math.sin(a) * 6 - 22 * up), 1, 1);
        }
      }
      if (!blink) {
        const img = p.hurtT > 0 ? (p.face < 0 ? fr.wf : fr.w) : (p.face < 0 ? fr.f : fr.n);
        if (p.dash && p.dash.cup) { // 명품 헐리웃: he flies through the air, laid out flat
          L.save(); L.translate(sx, sy); L.rotate(p.face * Math.PI / 2 * Math.min(1, p.dash.t / p.dash.dur * 1.6));
          L.drawImage(img, -(spr.w >> 1), -(spr.h >> 1), spr.w, spr.h);
          L.restore();
        } else L.drawImage(img, sx - (spr.w >> 1), sy - (spr.h >> 1), spr.w, spr.h);
      }
      // marker above the head: a gold chevron that bobs, so the hero is findable even inside a crowd
      const my = sy - (spr.h >> 1) - 6 + Math.round(Math.sin(w.t * 6) * 1.5);
      L.fillStyle = '#1a1208';
      L.beginPath(); L.moveTo(sx - 4, my - 5); L.lineTo(sx + 4, my - 5); L.lineTo(sx, my); L.closePath(); L.fill();
      L.fillStyle = '#ffd84a';
      L.beginPath(); L.moveTo(sx - 3, my - 4); L.lineTo(sx + 3, my - 4); L.lineTo(sx, my - 1); L.closePath(); L.fill();
      // hp bar (wider than the 준보스 bars, framed in gold)
      const hpw = 18, ratio = Math.max(0, p.hp / w.stats.maxHp);
      L.fillStyle = 'rgba(255,216,74,0.9)'; L.fillRect(sx - hpw / 2 - 2, sy + (spr.h >> 1) + 1 + jumpY, hpw + 4, 6);
      L.fillStyle = 'rgba(0,0,0,0.75)'; L.fillRect(sx - hpw / 2 - 1, sy + (spr.h >> 1) + 2 + jumpY, hpw + 2, 4);
      L.fillStyle = ratio > 0.5 ? '#4ae06a' : ratio > 0.25 ? '#ffc93a' : '#ff4a4a';
      L.fillRect(sx - hpw / 2, sy + (spr.h >> 1) + 3 + jumpY, Math.round(hpw * ratio), 2);
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
      L.drawImage(spr.frames[0].n, sx - (spr.w >> 1), sy - (spr.h >> 1), spr.w, spr.h);
      const by = Math.round(Math.sin(w.t * 6) * 2);
      L.fillStyle = '#ffe14a';
      L.fillRect(sx - 1, sy - (spr.h >> 1) - 9 + by, 3, 5);
      L.fillRect(sx - 1, sy - (spr.h >> 1) - 3 + by, 3, 2);
    }

    // Enemy shots (round 11): red laser bolts — a glowing streak along the flight with a white-hot core, so theirs
    // never read as our balls; a 강슛 or a red card burns orange and thicker. A shot still waiting to fly (a ring
    // closing in) shows a pulsing aim line where it will go. Referee cards keep their card at the head.
    // Batched: the glow, the beam and the core are one path each.
    drawEnemyShots(L, w, camX, camY) {
      const V = this.view, list = this._shots || (this._shots = []);
      list.length = 0;
      for (const ep of w.eprojs) {
        if (!ep.alive) continue;
        const x = ep.x - camX, y = ep.y - camY;
        if (x < -40 || y < -40 || x > V.w + 40 || y > V.h + 40) continue;
        list.push(ep);
      }
      if (!list.length) return;
      L.lineCap = 'round';
      const pulse = 0.5 + 0.3 * Math.sin(w.t * 30);
      L.strokeStyle = 'rgba(255,30,30,' + pulse + ')'; L.lineWidth = 1.5;
      L.beginPath();
      for (const ep of list) {
        if (!(ep.wait > 0)) continue;
        const sp = Math.hypot(ep.vx, ep.vy) || 1, x = ep.x - camX, y = ep.y - camY;
        L.moveTo(x, y); L.lineTo(x + ep.vx / sp * 70, y + ep.vy / sp * 70);
      }
      L.stroke();
      // normal blending: added light turns red into yellow on the green turf (it read as our golden balls)
      for (let h = 0; h < 2; h++) {
        const hot = h === 1;
        for (let pass = 0; pass < 3; pass++) {
          let any = false;
          L.beginPath();
          for (const ep of list) {
            if (!!(ep.power || ep.kind === 'redcard') !== hot) continue;
            const sp = Math.hypot(ep.vx, ep.vy) || 1, ux = ep.vx / sp, uy = ep.vy / sp, x = ep.x - camX, y = ep.y - camY;
            const len = Math.min(26, 6 + sp * 0.08) * (ep.wait > 0 ? 0.35 : 1) * (pass === 0 ? 1 : pass === 1 ? 0.8 : 0.55);
            L.moveTo(x - ux * len, y - uy * len); L.lineTo(x, y);
            any = true;
          }
          if (!any) break;
          const r = hot ? 5 : 2.5;
          L.lineWidth = pass === 0 ? r * 2 + 2 : pass === 1 ? r + 1 : Math.max(1, r * 0.45);
          L.strokeStyle = pass === 0 ? 'rgba(70,0,0,0.6)' : pass === 1 ? (hot ? '#ff3a10' : '#ff2626') : '#ffe2dc';
          L.stroke();
        }
      }
      for (const ep of list) {
        if (ep.kind !== 'card' && ep.kind !== 'redcard') continue;
        const it = RS.Sprites.item(ep.kind);
        L.drawImage(it.n, H2(ep.x - camX) - (it.w >> 1), H2(ep.y - camY) - (it.h >> 1));
      }
    }

    drawTele(L, t, camX, camY, time) {
      const a = 0.25 + 0.35 * t.p + 0.15 * Math.sin(time * 25);
      if (t.kind === 'line') {
        L.save();
        L.translate(Math.round(t.x - camX), Math.round(t.y - camY));
        L.rotate(t.a);
        L.fillStyle = 'rgba(255,60,60,' + a + ')';
        if (t.thin) L.fillRect(0, -2, t.len, 4); // 강슛 aim line
        else L.fillRect(0, -7, t.len, 14);
        L.fillStyle = 'rgba(255,255,255,' + (a * 0.8) + ')';
        L.fillRect(0, -1, t.len * t.p, 2);
        L.restore();
      } else if (t.kind === 'circles') {
        for (const c of t.spots) {
          L.fillStyle = 'rgba(255,90,60,' + (a * 0.6) + ')';
          L.beginPath(); L.arc(Math.round(c.x - camX), Math.round(c.y - camY), t.r, 0, TAU); L.fill();
          L.strokeStyle = 'rgba(255,255,255,0.8)'; L.lineWidth = 1;
          L.beginPath(); L.arc(Math.round(c.x - camX), Math.round(c.y - camY), t.r * t.p, 0, TAU); L.stroke();
        }
      }
    }

    // ---------------------------------------------------------------- pixelfx layer (src/js/pixelfx.js, window.PFX)
    // World queues effects as plain data (World.pfx → w.pfxQ: { fx, x, y, follow, flip, angle, palette, seed }); this
    // layer owns the live instances, steps them with the frame's real time and draws them into one pixel frame
    // (color + additive light) the size of the low-res canvas, composited over the scene with a transparent
    // background. Positions are in HD canvas pixels, so the library's 24×38-px-character scale matches our people.
    drawPfx(L, w, camX, camY) {
      const P = window.PFX;
      if (!P || (!w.pfxQ.length && !this.pfx.length)) return;
      const W = this.low.width, Hh = this.low.height;
      if (!this.pfxFrame || this.pfxFrame.w !== W || this.pfxFrame.h !== Hh) {
        this.pfxFrame = P.createFrame(W, Hh);
        this.pfxImg = new ImageData(W, Hh);
        this.pfxCanvas = document.createElement('canvas'); this.pfxCanvas.width = W; this.pfxCanvas.height = Hh;
        this.pfxCtx = this.pfxCanvas.getContext('2d');
      }
      const now = performance.now();
      const dt = Math.min(0.05, this.pfxT ? (now - this.pfxT) / 1000 : 1 / 60);
      this.pfxT = now;
      for (const q of w.pfxQ) {
        const mod = P.fx[q.fx];
        if (!mod) continue;
        if (this.pfx.length >= RS.PFX_MAX) this.pfx.shift();
        const o = { x: 0, y: 0, flip: !!q.flip, angle: q.angle || 0, seed: q.seed || 1, light: q.light || 1 };
        if (q.palette) o.palette = q.palette; // an undefined key would hide the effect's own palette
        if (q.o) Object.assign(o, q.o); // the effect's own options (r, n…)
        const inst = P.createFx(mod, o);
        this.pfx.push({ inst, x: q.x, y: q.y, follow: q.follow || null, dy: q.dy || 0, stopAt: q.life ? now + q.life * 1000 : 0 });
      }
      w.pfxQ.length = 0;
      const F = this.pfxFrame;
      P.clearFrame(F);
      let live = 0, minX = W, minY = Hh, maxX = 0, maxY = 0;
      for (const e of this.pfx) {
        if (e.stopAt && now >= e.stopAt) e.inst.stop();
        e.inst.update(dt);
        if (e.inst.done()) continue;
        const src = e.follow && e.follow.alive !== false ? e.follow : null;
        const wx = src ? this.lx(src) : e.x, wy = src ? this.ly(src) : e.y;
        const cx = (wx - camX) * HD, cy = (wy - camY + e.dy) * HD;
        if (cx < -200 || cy < -200 || cx > W + 200 || cy > Hh + 200) { this.pfx[live++] = e; continue; } // off screen: keep stepping, skip drawing
        e.inst.options.x = cx; e.inst.options.y = cy;
        e.inst.draw(F);
        const sz = e.inst.meta.size || [160, 120], og = e.inst.meta.origin || [sz[0] / 2, sz[1] / 2];
        minX = Math.min(minX, cx - og[0]); minY = Math.min(minY, cy - og[1]); maxX = Math.max(maxX, cx + sz[0] - og[0]); maxY = Math.max(maxY, cy + sz[1] - og[1]);
        this.pfx[live++] = e;
      }
      this.pfx.length = live;
      if (!live || maxX <= minX) return;
      // composite only the rows the effects touched
      const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(Hh, Math.ceil(maxY));
      if (y1 <= y0) return;
      const data = this.pfxImg.data, C = F.color, Lt = F.light;
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, c = C[i], l = Lt[i] & 0xffffff, j = i * 4;
        if (!c && !l) { data[j + 3] = 0; continue; }
        let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255, a = c >>> 24;
        if (l) { // light over nothing becomes colour with alpha (reads as additive on the turf)
          const lr = l & 255, lg = (l >>> 8) & 255, lb = (l >>> 16) & 255;
          const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
          const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
          if (na > 0) { r = Math.min(255, pr / na); g = Math.min(255, pg / na); b = Math.min(255, pb / na); a = na * 255; }
        }
        data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = a;
      }
      this.pfxCtx.putImageData(this.pfxImg, 0, 0, 0, y0, W, y1 - y0);
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.drawImage(this.pfxCanvas, 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
      L.setTransform(HD, 0, 0, HD, 0, 0);
    }

    drawFx(L, w, camX, camY) {
      const S = RS.Sprites;
      for (const r of w.rings) {
        const k = Math.min(1, r.t / r.dur);
        L.strokeStyle = r.evo ? 'rgba(255,215,80,' + (1 - k * 0.8) + ')' : 'rgba(255,255,255,' + (1 - k * 0.8) + ')';
        L.lineWidth = 6;
        L.beginPath(); L.arc(Math.round(r.x - camX), Math.round(r.y - camY), Math.max(1, r.r), 0, TAU); L.stroke();
        L.strokeStyle = this.heroColor; L.lineWidth = 2;
        L.beginPath(); L.arc(Math.round(r.x - camX), Math.round(r.y - camY), Math.max(1, r.r - 5), 0, TAU); L.stroke();
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
          case 'swing': { // f.gold: 호날도's tornado kick
            L.strokeStyle = this.heroColor; L.globalAlpha = 1 - k; L.lineWidth = f.gold ? 7 : 5;
            const a0 = k * TAU * 1.2;
            L.beginPath(); L.arc(sx, sy, f.r * 0.85, a0, a0 + 2.2); L.stroke();
            if (f.gold) { L.beginPath(); L.arc(sx, sy, f.r * 0.85, a0 + Math.PI, a0 + Math.PI + 2.2); L.stroke(); }
            L.strokeStyle = (f.gold ? 'rgba(255,140,60,' : 'rgba(160,220,255,') + (1 - k) + ')'; L.lineWidth = 1;
            L.beginPath(); L.arc(sx, sy, f.r, a0 + 0.3, a0 + 2.6); L.stroke();
            L.globalAlpha = 1;
            break;
          }
          case 'meteor': { // 별똥별 슛 / 메시's 칩슛 (f.white): a ball falls from the sky; its landing shadow grows
            const h = 72 * (1 - k), off = Math.round(12 * (1 - k));
            L.fillStyle = (f.white ? 'rgba(255,255,255,' : 'rgba(255,215,80,') + (0.35 * k) + ')';
            L.beginPath(); L.ellipse(sx, sy, 2 + 7 * k, 1 + 3 * k, 0, 0, TAU); L.fill();
            L.strokeStyle = f.white ? 'rgba(255,255,255,0.6)' : 'rgba(255,236,150,0.65)'; L.lineWidth = 2;
            L.beginPath(); L.moveTo(sx + off + 7, Math.round(sy - h) - 16); L.lineTo(sx + off, Math.round(sy - h)); L.stroke();
            this.drawFallBall(L, f, sx + off, Math.round(sy - h), w.t);
            break;
          }
          case 'lob': { // 로빙 패스: the ball arcs from the passer (x0, y0) onto the target; its shadow runs along the ground
            const gx = Math.round(f.x0 + (f.x - f.x0) * k - camX), gy = Math.round(f.y0 + (f.y - f.y0) * k - camY);
            const h = Math.round(Math.sin(k * Math.PI) * (f.low ? 5 : 44)); // low: a rolled finish (the 캄프 누 goal)
            L.fillStyle = 'rgba(0,0,0,0.25)';
            L.beginPath(); L.ellipse(gx, gy + 2, 3, 1.5, 0, 0, TAU); L.fill();
            L.fillStyle = (f.white ? 'rgba(255,255,255,' : 'rgba(255,215,80,') + (0.35 * k) + ')'; // landing spot
            L.beginPath(); L.ellipse(sx, sy, 2 + 7 * k, 1 + 3 * k, 0, 0, TAU); L.fill();
            this.drawFallBall(L, f, gx, gy - h, w.t);
            break;
          }
          case 'goal': { // round 14 (the 캄프 누 goal, World.startCine): a goal seen from above — the line, two posts, the net behind
            const hw = (f.w || 60) >> 1, deep = 16;
            L.fillStyle = 'rgba(255,255,255,0.14)'; L.fillRect(sx - hw, sy - deep, hw * 2, deep);
            L.strokeStyle = 'rgba(255,255,255,0.45)'; L.lineWidth = 1;
            L.beginPath();
            for (let x = -hw + 4; x < hw; x += 4) { L.moveTo(sx + x, sy - deep); L.lineTo(sx + x, sy); }
            for (let y = 4; y < deep; y += 4) { L.moveTo(sx - hw, sy - y); L.lineTo(sx + hw, sy - y); }
            L.stroke();
            L.strokeStyle = '#ffffff'; L.lineWidth = 3; L.lineCap = 'round';
            L.beginPath(); L.moveTo(sx - hw, sy); L.lineTo(sx - hw, sy - deep); L.lineTo(sx + hw, sy - deep); L.lineTo(sx + hw, sy); L.stroke();
            L.lineWidth = 2; L.strokeStyle = 'rgba(255,255,255,0.9)';
            L.beginPath(); L.moveTo(sx - hw - 40, sy + 1); L.lineTo(sx + hw + 40, sy + 1); L.stroke();
            L.fillStyle = '#ffffff';
            L.beginPath(); L.arc(sx - hw, sy, 2.5, 0, TAU); L.arc(sx + hw, sy, 2.5, 0, TAU); L.fill();
            break;
          }
          case 'cball': { // the ball at the runner's feet (follow), rolling a little ahead of him
            const p = w.player, it = S.item('ball'), bob = Math.round(Math.sin(w.t * 18)) ;
            L.fillStyle = 'rgba(0,0,0,0.25)'; L.beginPath(); L.ellipse(sx + (p.face || 1) * 5, sy + 7, 3, 1.5, 0, 0, TAU); L.fill();
            L.drawImage(it.n, sx + (p.face || 1) * 5 - (it.w >> 1), sy + 3 - (it.h >> 1) - Math.abs(bob));
            break;
          }
          case 'whistle': // 추가시간 휘슬: a white wave over the pitch
            L.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - k)) + ')'; L.lineWidth = 2;
            L.beginPath(); L.arc(sx, sy, 10 + f.r * k, 0, TAU); L.stroke();
            L.beginPath(); L.arc(sx, sy, 4 + f.r * 0.6 * k, 0, TAU); L.stroke();
            break;
          case 'ghost': case 'mghost': case 'bghost': {
            const spr = f.kind === 'ghost' ? S.hero(w.hero, w.yearIdx, 1, null, w.small) : f.kind === 'mghost' ? S.mate(f.id, w.yearIdx) : S.boss(f.sprite, w.yearIdx);
            L.globalAlpha = 0.45 * (1 - k);
            L.drawImage(f.face < 0 ? spr.frames[0].f : spr.frames[0].n, sx - (spr.w >> 1), sy - (spr.h >> 1), spr.w, spr.h);
            L.globalAlpha = 1; break;
          }
          case 'poof': { // kill burst: shards fly out and fall, with a quick flash ring
            const n = f.big ? 10 : 6, R = f.big ? 16 : 10;
            for (let i = 0; i < n; i++) {
              const a = (f.seed || 0) + i * (TAU / n);
              const px = sx + Math.cos(a) * R * k, py = sy + Math.sin(a) * R * k + 14 * k * k;
              L.fillStyle = i % 2 ? 'rgba(255,255,255,' + (0.9 * (1 - k)) + ')' : 'rgba(255,214,90,' + (0.9 * (1 - k)) + ')';
              L.fillRect(Math.round(px), Math.round(py), k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1);
            }
            if (k < 0.35) { L.strokeStyle = 'rgba(255,255,255,' + (1 - k / 0.35) + ')'; L.lineWidth = 1; L.beginPath(); L.arc(sx, sy, 3 + R * k * 2, 0, TAU); L.stroke(); }
            break;
          }
          case 'hit': { // impact shards pushed along the hit direction
            const n = f.crit ? 6 : 3, sp = f.crit ? 18 : 11;
            L.fillStyle = f.crit ? 'rgba(255,214,60,' + (1 - k) + ')' : 'rgba(255,255,255,' + (0.9 * (1 - k)) + ')';
            for (let i = 0; i < n; i++) {
              const a = Math.atan2(f.ky, f.kx) + (i - (n - 1) / 2) * 0.55 + (f.seed || 0) * 0.1;
              L.fillRect(Math.round(sx + Math.cos(a) * sp * k), Math.round(sy + Math.sin(a) * sp * k), f.crit ? 2 : 1, f.crit ? 2 : 1);
            }
            if (f.crit && k < 0.4) { L.fillStyle = 'rgba(255,255,255,' + (1 - k / 0.4) + ')'; L.fillRect(sx - 4, sy - 1, 8, 2); L.fillRect(sx - 1, sy - 4, 2, 8); }
            break;
          }
          case 'strail': { // slide streak: a gradient ribbon fading behind the runner
            const len = 18, nx = -(f.dx || 1), ny = -(f.dy || 0);
            const g = L.createLinearGradient(sx, sy, sx + nx * len, sy + ny * len);
            g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * (1 - k)) + ')');
            g.addColorStop(0.5, 'rgba(120,220,255,' + (0.55 * (1 - k)) + ')');
            g.addColorStop(1, 'rgba(120,220,255,0)');
            L.strokeStyle = g; L.lineWidth = 5 - 3 * k; L.lineCap = 'round';
            L.beginPath(); L.moveTo(sx, sy); L.lineTo(sx + nx * len, sy + ny * len); L.stroke();
            L.lineCap = 'butt';
            break;
          }
          case 'dust':
            L.fillStyle = 'rgba(230,230,210,' + (0.5 * (1 - k)) + ')';
            L.fillRect(Math.round(sx + (f.vx || 0) * k), Math.round(sy + (f.vy || 0) * k), k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1);
            L.fillRect(Math.round(sx + (f.vx || 0) * k * 0.6 + 2), Math.round(sy + (f.vy || 0) * k * 0.4), 1, 1);
            break;
          case 'levelburst': { // rising sparks and an expanding ring around 날두 (graded items: in their colour)
            if (f.g != null) { L.strokeStyle = RS.GRADES[f.g].color; L.globalAlpha = 1 - k; L.lineWidth = 3; L.beginPath(); L.arc(sx, sy, 10 + 40 * k, 0, TAU); L.stroke(); L.globalAlpha = 1; }
            L.strokeStyle = 'rgba(255,230,120,' + (1 - k) + ')'; L.lineWidth = 2;
            L.beginPath(); L.arc(sx, sy, 6 + 26 * k, 0, TAU); L.stroke();
            for (let i = 0; i < 8; i++) {
              const a = i * (TAU / 8) + k * 2;
              L.fillStyle = i % 2 ? 'rgba(255,255,255,' + (1 - k) + ')' : 'rgba(255,214,60,' + (1 - k) + ')';
              L.fillRect(Math.round(sx + Math.cos(a) * (8 + 14 * k)), Math.round(sy - 24 * k + Math.sin(a) * 6), 2, 2);
            }
            break;
          }
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
          case 'hand': this.drawHand(L, f, sx, sy, w.t); break;
          case 'referee': this.drawReferee(L, f, sx, sy, w); break;
          case 'dive': this.drawDive(L, f, sx, sy, w); break;
          case 'pkshot': this.drawPkShot(L, f, sx, sy, k, w.t); break;
          case 'redcards': // 심판매수: red (and a few yellow) cards thrown out over the crowd, spinning
            for (let i = 0; i < 16; i++) {
              const a = f.seed + i * TAU / 16, d = f.r * (0.3 + 1.2 * k) * (0.7 + 0.3 * (i % 3));
              L.save();
              L.translate(H2(sx + Math.cos(a) * d), H2(sy + Math.sin(a) * d * 0.6 - 34 * Math.sin(k * Math.PI)));
              L.rotate(a + k * 9);
              L.globalAlpha = 1 - k * k;
              L.fillStyle = i % 4 ? '#e01b1b' : '#ffd400'; L.fillRect(-2, -3, 4, 6);
              L.fillStyle = 'rgba(255,255,255,0.7)'; L.fillRect(-2, -3, 1, 2);
              L.restore();
            }
            L.globalAlpha = 1;
            break;
          case 'siuuup': { // round 19: a SIUUU weapon arrives — rings, rays and a pillar of light in the grade's colours
            L.globalCompositeOperation = 'lighter';
            const pg = L.createLinearGradient(sx, sy - 140, sx, sy + 6);
            pg.addColorStop(0, 'rgba(' + siuuuRgb(w.t) + ',0)'); pg.addColorStop(1, 'rgba(' + siuuuRgb(w.t) + ',' + (0.55 * (1 - k)) + ')');
            L.fillStyle = pg; L.fillRect(sx - 9 - 6 * k, sy - 140, 18 + 12 * k, 146);
            for (let i = 0; i < 14; i++) {
              const a = i * TAU / 14 + k * 1.8, len = 26 + 46 * k + 10 * Math.sin(i * 1.7 + w.t * 9);
              L.strokeStyle = 'rgba(' + siuuuRgb(w.t + i * 0.09) + ',' + (0.85 * (1 - k)) + ')'; L.lineWidth = i % 2 ? 1 : 2;
              L.beginPath(); L.moveTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7); L.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); L.stroke();
            }
            L.globalCompositeOperation = 'source-over';
            for (let j = 0; j < 3; j++) {
              const q = k * 1.7 - j * 0.22;
              if (q <= 0 || q >= 1) continue;
              L.strokeStyle = 'rgba(' + siuuuRgb(j * 0.4) + ',' + (1 - q) + ')'; L.lineWidth = 4 - 3 * q;
              L.beginPath(); L.ellipse(sx, sy + 4, 10 + 80 * q, 6 + 44 * q, 0, 0, TAU); L.stroke();
            }
            break;
          }
          case 'impact': { // 드롭볼 landing: a white-hot flash, a shock ring and a second, slower ring
            const c = f.gold ? '255,214,90' : '255,255,255';
            if (k < 0.35) {
              const q = k / 0.35, g = L.createRadialGradient(sx, sy, 1, sx, sy, f.r * (0.5 + 0.6 * q));
              g.addColorStop(0, 'rgba(255,255,240,' + (0.9 * (1 - q)) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
              L.globalCompositeOperation = 'lighter'; L.fillStyle = g;
              L.beginPath(); L.ellipse(sx, sy, f.r * (0.5 + 0.6 * q), f.r * (0.32 + 0.4 * q), 0, 0, TAU); L.fill();
              L.globalCompositeOperation = 'source-over';
            }
            L.strokeStyle = 'rgba(' + c + ',' + (1 - k) + ')'; L.lineWidth = 3 - 2 * k;
            L.beginPath(); L.ellipse(sx, sy, f.r * (0.4 + 0.75 * k), f.r * (0.25 + 0.48 * k), 0, 0, TAU); L.stroke();
            L.strokeStyle = 'rgba(255,140,60,' + (0.7 * (1 - k)) + ')'; L.lineWidth = 1;
            L.beginPath(); L.ellipse(sx, sy, f.r * 0.9 * k, f.r * 0.56 * k, 0, 0, TAU); L.stroke();
            break;
          }
          case 'pop': // a 드롭볼 back in the circle
            L.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; L.lineWidth = 1;
            L.beginPath(); L.arc(sx, sy - 7, 2 + 7 * k, 0, TAU); L.stroke();
            break;
          case 'zip': { // 알까기 / 외계인 모드: a streak from (x0, y0) to the man beaten, the ball at its head
            const x0 = f.x0 - camX, y0 = f.y0 - camY, h = Math.min(1, k * 3);
            const hx = x0 + (sx - x0) * h, hy = y0 + (sy - y0) * h;
            const col = f.alien ? '120,255,200' : '255,255,255';
            const g = L.createLinearGradient(x0, y0, hx, hy);
            g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(1, 'rgba(' + col + ',' + (0.9 * (1 - k)) + ')');
            L.strokeStyle = g; L.lineWidth = f.alien ? 3 : 2; L.lineCap = 'round';
            L.beginPath(); L.moveTo(x0, y0); L.lineTo(hx, hy); L.stroke();
            L.lineCap = 'butt';
            if (!f.alien && k < 0.6) { const it = S.item('ball'); L.drawImage(it.n, H2(hx) - (it.w >> 1), H2(hy) - (it.h >> 1)); }
            break;
          }
          case 'down': { // a fallen man tips over backwards and fades
            const spr = S.enemy(f.sprite, w.yearIdx, f.tier);
            if (!spr) break;
            const img = f.face < 0 ? spr.frames[0].f : spr.frames[0].n, sc = f.elite ? 1.5 : 1;
            L.save();
            L.translate(sx, sy + spr.h * 0.5 * sc);
            L.rotate(-(f.face || 1) * k * 1.35);
            L.globalAlpha = 0.85 * (1 - k * k);
            L.drawImage(img, -spr.w * sc / 2, -spr.h * sc, spr.w * sc, spr.h * sc);
            L.restore();
            L.globalAlpha = 1;
            break;
          }
          case 'stim': { // 약물 꽂기: a red heartbeat aura and rising sparks around 메시
            const beat = Math.abs(Math.sin(k * Math.PI * 3));
            L.strokeStyle = 'rgba(255,60,60,' + (0.8 * (1 - k)) + ')'; L.lineWidth = 2;
            L.beginPath(); L.arc(sx, sy, 10 + 14 * k + 3 * beat, 0, TAU); L.stroke();
            L.fillStyle = 'rgba(255,90,90,' + (0.9 * (1 - k)) + ')';
            for (let i = 0; i < 6; i++) {
              const a = i * TAU / 6 + 0.4;
              L.fillRect(H2(sx + Math.cos(a) * 9), H2(sy - 4 - 22 * ((k + i * 0.13) % 1)), 1, 2);
            }
            break;
          }
        }
      }
    }

    // 신의 손: a giant open hand drops out of the sky onto the spot (its shadow grows under it), slams flat at
    // f.hit, then fades over a dust ring. Evolved: a golden halo.
    drawHand(L, f, sx, sy, time) {
      const S = RS.Sprites, spr = S.hand(), hit = f.hit, k1 = Math.min(1, f.t / hit);
      const size = f.r * 1.7, sc = size / spr.w; // world px across
      const shadowA = f.t < hit ? 0.12 + 0.33 * k1 : 0.45 * (1 - (f.t - hit) / (f.dur - hit));
      L.fillStyle = 'rgba(0,0,0,' + shadowA + ')';
      L.beginPath(); L.ellipse(sx, sy, f.r * (0.35 + 0.65 * k1), f.r * (0.2 + 0.36 * k1), 0, 0, TAU); L.fill();
      let h, sqY = 1, alpha = 1;
      if (f.t < hit) h = 120 * (1 - k1 * k1);
      else { const q = (f.t - hit) / (f.dur - hit); h = 0; sqY = 0.86 + 0.14 * q; alpha = 1 - q; }
      const dw = spr.w * sc * (f.t < hit ? 0.75 + 0.25 * k1 : 1), dh = spr.h * sc * (f.t < hit ? 0.75 + 0.25 * k1 : 1) * sqY;
      const top = sy - h - dh + dh * 0.18;
      if (f.evo || f.t >= hit) { // divine glow behind the palm
        const g = L.createRadialGradient(sx, top + dh / 2, 2, sx, top + dh / 2, dw * 0.8);
        g.addColorStop(0, 'rgba(255,236,160,' + (0.55 * alpha) + ')'); g.addColorStop(1, 'rgba(255,220,120,0)');
        L.globalCompositeOperation = 'lighter'; L.fillStyle = g;
        L.beginPath(); L.arc(sx, top + dh / 2, dw * 0.8, 0, TAU); L.fill();
        L.globalCompositeOperation = 'source-over';
      }
      L.globalAlpha = alpha;
      L.drawImage(spr.c, H2(sx - dw / 2), H2(top), dw, dh);
      L.globalAlpha = 1;
      if (f.t >= hit) { // dust ring and two shock rings
        const q = (f.t - hit) / (f.dur - hit);
        L.strokeStyle = 'rgba(255,248,220,' + (1 - q) + ')'; L.lineWidth = 3 - 2 * q;
        L.beginPath(); L.ellipse(sx, sy, f.r * (0.6 + 0.6 * q), f.r * (0.36 + 0.36 * q), 0, 0, TAU); L.stroke();
        L.fillStyle = 'rgba(225,215,185,' + (0.7 * (1 - q)) + ')';
        for (let i = 0; i < 10; i++) {
          const a = i * TAU / 10 + time;
          L.fillRect(H2(sx + Math.cos(a) * f.r * (0.7 + 0.5 * q)), H2(sy + Math.sin(a) * f.r * 0.45 * (0.7 + 0.5 * q) - 3 * q), 2, 1);
        }
      }
    }

    // 심판매수 (round 19): banknotes flutter down onto the spot, the bribed referee drops in out of the sky (his shadow
    // grows), lands at f.hit and raises a giant red card in a red glow while red rings run out over the crowd.
    drawReferee(L, f, sx, sy, w) {
      const spr = RS.Sprites.boss('bref', w.yearIdx), hit = f.hit, k1 = Math.min(1, f.t / hit), after = f.t >= hit;
      const q = after ? (f.t - hit) / (f.dur - hit) : 0, fade = after ? Math.min(1, (1 - q) * 3) : 1;
      L.fillStyle = 'rgba(255,40,40,' + (after ? 0.3 * (1 - q) : 0.1 + 0.2 * k1) + ')';
      L.beginPath(); L.ellipse(sx, sy, f.r, f.r * 0.6, 0, 0, TAU); L.fill();
      L.strokeStyle = 'rgba(255,90,90,' + (after ? 1 - q : 0.4 + 0.5 * k1) + ')'; L.lineWidth = 1;
      L.beginPath(); L.ellipse(sx, sy, f.r * (after ? 1 : 1.6 - 0.6 * k1), f.r * 0.6 * (after ? 1 : 1.6 - 0.6 * k1), 0, 0, TAU); L.stroke();
      for (let i = 0; i < 12; i++) { // the bribe: banknotes see-sawing down
        const a = i * 2.39, fall = (f.t * 0.8 + i * 0.083) % 1, sw = Math.sin(f.t * 7 + i * 1.3);
        const x = sx + Math.cos(a) * f.r * 0.9 + sw * 4, y = sy - 56 + fall * 56 + Math.sin(a) * f.r * 0.35;
        L.globalAlpha = fade * Math.min(1, (1 - fall) * 4);
        L.fillStyle = '#2f9a3e'; L.fillRect(H2(x - 2.5 * Math.abs(sw) - 0.5), H2(y - 1), 5 * Math.abs(sw) + 1, 3);
        L.fillStyle = '#c8f5b8'; L.fillRect(H2(x), H2(y), 1, 1);
      }
      L.globalAlpha = 1;
      const h = after ? 0 : 96 * (1 - k1 * k1);
      L.fillStyle = 'rgba(0,0,0,' + (0.15 + 0.3 * k1) * fade + ')';
      L.beginPath(); L.ellipse(sx, sy + spr.h * 0.42, 5 + 7 * k1, 2 + 2.5 * k1, 0, 0, TAU); L.fill();
      if (after) { // the red card goes up over his head, huge, in a red glow
        const up = Math.min(1, q * 5), cw = 6 + 8 * up, ch = 9 + 12 * up, cx = sx + spr.w * 0.28, cy = sy - spr.h / 2 - 6 - 8 * up - ch / 2;
        L.globalCompositeOperation = 'lighter';
        const g = L.createRadialGradient(cx, cy, 2, cx, cy, 30);
        g.addColorStop(0, 'rgba(255,80,60,' + (0.8 * fade) + ')'); g.addColorStop(1, 'rgba(255,0,0,0)');
        L.fillStyle = g; L.beginPath(); L.arc(cx, cy, 30, 0, TAU); L.fill();
        L.globalCompositeOperation = 'source-over';
        L.globalAlpha = fade;
        L.fillStyle = '#ffffff'; L.fillRect(H2(cx - cw / 2) - 1, H2(cy - ch / 2) - 1, cw + 2, ch + 2);
        L.fillStyle = '#e01b1b'; L.fillRect(H2(cx - cw / 2), H2(cy - ch / 2), cw, ch);
        L.fillStyle = '#ff8a7a'; L.fillRect(H2(cx - cw / 2) + 1, H2(cy - ch / 2) + 1, 1, ch * 0.5);
        const arm = cy + ch / 2, shoulder = sy - spr.h * 0.18;
        L.fillStyle = '#151515'; L.fillRect(H2(cx) - 1, H2(arm), 2, Math.max(0, H2(shoulder - arm))); // the arm up
        for (let j = 0; j < 2; j++) {
          const r = (q * 1.6 - j * 0.3);
          if (r <= 0 || r >= 1) continue;
          L.strokeStyle = 'rgba(255,50,50,' + (1 - r) + ')'; L.lineWidth = 3 - 2 * r;
          L.beginPath(); L.ellipse(sx, sy, f.r * (0.5 + 1.1 * r), f.r * 0.6 * (0.5 + 1.1 * r), 0, 0, TAU); L.stroke();
        }
      }
      L.globalAlpha = fade;
      L.drawImage(spr.frames[0].n, H2(sx - spr.w / 2), H2(sy - spr.h / 2 - h), spr.w, spr.h);
      L.globalAlpha = 1;
    }

    // 명품 헐리웃 (round 19): the replay of the dive where he fell — laid out on the turf and rolling under a
    // spotlight, stars over his head, camera flashes all round, the 오스카 rising (the judges' 10s: drawTexts).
    drawDive(L, f, sx, sy, w) {
      const k = Math.min(1, f.t / f.dur), q = 1 - k, spr = RS.Sprites.hero(w.hero, w.yearIdx, 1, null, w.small);
      L.globalCompositeOperation = 'lighter';
      const g = L.createLinearGradient(sx, sy - 130, sx, sy + 8);
      g.addColorStop(0, 'rgba(255,240,190,0)'); g.addColorStop(1, 'rgba(255,240,190,' + (0.4 * q) + ')');
      L.fillStyle = g;
      L.beginPath(); L.moveTo(sx - 5, sy - 130); L.lineTo(sx + 5, sy - 130); L.lineTo(sx + 28, sy + 8); L.lineTo(sx - 28, sy + 8); L.closePath(); L.fill();
      L.fillStyle = 'rgba(255,240,190,' + (0.3 * q) + ')';
      L.beginPath(); L.ellipse(sx, sy + 6, 28, 9, 0, 0, TAU); L.fill();
      L.globalCompositeOperation = 'source-over';
      const roll = Math.min(1, k * 2.5), fx = sx + f.face * (8 + 14 * roll); // rolled out from under him
      L.save(); L.translate(fx, sy + 3);
      L.rotate(f.face * (Math.PI / 2 + 0.35 * Math.sin(roll * Math.PI * 3) * (1 - roll)));
      L.globalAlpha = 0.9 * Math.min(1, q * 2.5);
      L.drawImage(f.face < 0 ? spr.frames[0].f : spr.frames[0].n, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      L.restore();
      L.globalAlpha = Math.min(1, q * 2.5);
      for (let i = 0; i < 3; i++) { // dizzy stars over the head
        const a = w.t * 7 + i * TAU / 3;
        L.fillStyle = i ? '#ffe14a' : '#ffffff';
        L.fillRect(H2(fx + f.face * 9 + Math.cos(a) * 6) - 1, H2(sy - 4 + Math.sin(a) * 2.5) - 1, 2, 2);
      }
      for (let i = 0; i < 7; i++) { // camera flashes from the stands
        const ph = (k * 6 + i * 0.37) % 1;
        if (ph > 0.3) continue;
        const a = f.seed + i * 1.9, rad = 30 + (i % 3) * 10, m = 1 - ph / 0.3;
        const x = sx + Math.cos(a) * rad, y = sy + Math.sin(a) * rad * 0.6 - 6;
        L.fillStyle = 'rgba(255,255,255,' + m + ')';
        L.fillRect(H2(x - 4 * m), H2(y) - 0.5, 8 * m + 1, 1); L.fillRect(H2(x) - 0.5, H2(y - 4 * m), 1, 8 * m + 1);
        L.fillRect(H2(x) - 1, H2(y) - 1, 2, 2);
      }
      if (k > 0.12) { // the 오스카: a golden statuette rising out of the spotlight
        const u = Math.min(1, (k - 0.12) * 3), ox = sx, oy = Math.round(sy - 24 - 16 * u);
        L.fillStyle = '#6a4208'; L.fillRect(ox - 4, oy + 9, 8, 3);
        L.fillStyle = '#ffd84a'; L.fillRect(ox - 1, oy + 1, 3, 8); L.fillRect(ox - 2, oy + 3, 5, 2); L.fillRect(ox - 1, oy - 2, 3, 3);
        L.fillStyle = '#fff6c0'; L.fillRect(ox, oy - 1, 1, 6);
      }
      L.globalAlpha = 1;
    }

    // 패널두 (round 19): the penalty spot under his boot with its arc, a lane of light down the 11m cannon's line into
    // a goal mouth, and a muzzle flash.
    drawPkShot(L, f, sx, sy, k, t) {
      const ux = Math.cos(f.a), uy = Math.sin(f.a), q = 1 - k, c = siuuuRgb(t), reach = f.len * Math.min(1, k * 5);
      L.fillStyle = 'rgba(255,255,255,' + q + ')';
      L.beginPath(); L.ellipse(sx, sy + 7, 3, 1.5, 0, 0, TAU); L.fill();
      L.strokeStyle = 'rgba(255,255,255,' + (0.8 * q) + ')'; L.lineWidth = 1;
      L.beginPath(); L.ellipse(sx, sy + 7, 24, 10, 0, f.a - 1, f.a + 1); L.stroke();
      L.lineCap = 'round';
      L.strokeStyle = 'rgba(' + c + ',' + (0.4 * q) + ')'; L.lineWidth = 12 * q + 2;
      L.beginPath(); L.moveTo(sx, sy); L.lineTo(sx + ux * reach, sy + uy * reach); L.stroke();
      L.strokeStyle = 'rgba(255,255,255,' + (0.9 * q) + ')'; L.lineWidth = 2;
      L.beginPath(); L.moveTo(sx, sy); L.lineTo(sx + ux * reach, sy + uy * reach); L.stroke();
      L.lineCap = 'butt';
      if (k > 0.15) { // the goal mouth the lane runs into: posts, bar and net, across the line
        L.save(); L.translate(sx + ux * f.len, sy + uy * f.len); L.rotate(f.a);
        L.globalAlpha = Math.min(1, (k - 0.15) * 5) * q;
        L.fillStyle = 'rgba(255,255,255,0.18)'; L.fillRect(0, -16, 10, 32);
        L.strokeStyle = 'rgba(255,255,255,0.5)'; L.lineWidth = 1; L.beginPath();
        for (let y = -16; y <= 16; y += 4) { L.moveTo(0, y); L.lineTo(10, y); }
        for (let x = 3; x < 10; x += 3) { L.moveTo(x, -16); L.lineTo(x, 16); }
        L.stroke();
        L.strokeStyle = '#ffffff'; L.lineWidth = 2; L.beginPath(); L.moveTo(0, -16); L.lineTo(10, -16); L.lineTo(10, 16); L.lineTo(0, 16); L.stroke();
        L.restore(); L.globalAlpha = 1;
      }
      if (k < 0.3) {
        const m = 1 - k / 0.3, mx = sx + ux * 8, my = sy + uy * 8;
        L.fillStyle = 'rgba(255,255,255,' + m + ')';
        L.fillRect(mx - 11 * m, my - 1, 22 * m, 2); L.fillRect(mx - 1, my - 11 * m, 2, 22 * m);
        L.fillStyle = 'rgba(' + c + ',' + m + ')'; L.fillRect(mx - 3, my - 3, 6, 6);
      }
    }

    // 패널두's 11m cannon ball (round 19): a comet in the SIUUU colours — a long tail with a fiery core, a white-hot
    // ball in a glow, sparks shed behind.
    drawPCannon(L, pr, sx, sy, t) {
      const sp = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx / sp, uy = pr.vy / sp, len = 48, c = siuuuRgb(t + pr.t);
      L.lineCap = 'round';
      const g = L.createLinearGradient(sx, sy, sx - ux * len, sy - uy * len);
      g.addColorStop(0, 'rgba(' + c + ',0.95)'); g.addColorStop(1, 'rgba(' + c + ',0)');
      L.strokeStyle = g; L.lineWidth = 10;
      L.beginPath(); L.moveTo(sx, sy); L.lineTo(sx - ux * len, sy - uy * len); L.stroke();
      const g2 = L.createLinearGradient(sx, sy, sx - ux * len * 0.6, sy - uy * len * 0.6);
      g2.addColorStop(0, 'rgba(255,244,180,1)'); g2.addColorStop(1, 'rgba(255,120,40,0)');
      L.strokeStyle = g2; L.lineWidth = 5;
      L.beginPath(); L.moveTo(sx, sy); L.lineTo(sx - ux * len * 0.6, sy - uy * len * 0.6); L.stroke();
      L.lineCap = 'butt';
      L.globalCompositeOperation = 'lighter';
      const rg = L.createRadialGradient(sx, sy, 1, sx, sy, 13);
      rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(' + c + ',0)');
      L.fillStyle = rg; L.beginPath(); L.arc(sx, sy, 13, 0, TAU); L.fill();
      L.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 5; i++) {
        const u = (t * 7 + i * 0.2) % 1, side = (i - 2) * 2.2 * u;
        L.fillStyle = i % 2 ? '#ffffff' : 'rgb(' + siuuuRgb(t + i * 0.3) + ')';
        L.fillRect(H2(sx - ux * len * u - uy * side), H2(sy - uy * len * u + ux * side), 1, 1);
      }
      const it = RS.Sprites.item('pcannon');
      L.drawImage(it.n, sx - (it.w >> 1), sy - (it.h >> 1));
    }

    // A ball falling from the sky (별똥별 슛, 칩슛, 로빙, 유성): white, golden, or a 발롱도르 trophy (f.ballon) — one the
    // hero has really won (World.fire: the first RS.ballonCount balls of a volley).
    drawFallBall(L, f, x, y, time) {
      const S = RS.Sprites;
      if (f.ballon) {
        const d = 10, spr = S.orb('ballon', d, Math.floor(time * 16) % S.ORB_FRAMES), gl = S.orbGlow(d);
        L.globalCompositeOperation = 'lighter'; L.globalAlpha = 0.65;
        L.drawImage(gl, x - (gl.width >> 1), y - (gl.height >> 1));
        L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
        L.drawImage(spr.c, x - spr.cx, y - spr.cy);
        return;
      }
      const it = S.item(f.white ? 'ball' : 'golden');
      L.drawImage(it.n, x - (it.w >> 1), y - (it.h >> 1));
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
        const pop = 1 + 0.6 * Math.max(0, 1 - k * 5); // quick scale-in on the first frames
        const size = Math.round((tx.crit ? base * 1.6 : base) * pop);
        C.font = '900 ' + size + 'px "Galmuri11", "DungGeunMo", system-ui, sans-serif';
        C.globalAlpha = 1 - k * k;
        C.lineWidth = Math.max(2, s * 0.9); C.strokeStyle = '#111';
        const str = tx.v === 0 ? '무적' : String(tx.v);
        C.strokeText(str, x, y);
        C.fillStyle = tx.crit ? '#ffd23a' : '#ffffff';
        C.fillText(str, x, y);
      }
      C.globalAlpha = 1;
      // teammates: their role icon (RS.ROLES) above the head — what each one does, at a glance
      C.font = Math.round(base * 1.05) + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      for (const m of w.mates) {
        const r = RS.ROLES[m.role];
        if (r) C.fillText(r.icon, (this.lx(m) - camX) * s, (this.ly(m) - camY - 14) * s);
      }
      // 호날도 syllables (호! 날! 도!, one per hit) and the 휘슬 call, above 날두
      for (const f of w.fx) {
        if ((f.kind !== 'martial' && f.kind !== 'whistle') || f.t >= f.dur) continue;
        const k = f.t / f.dur, mart = f.kind === 'martial';
        const x = (w.player.x - camX + (mart && !f.center ? (f.n - 1) * 15 : 0)) * s, y = (w.player.y - camY - 28 - k * 12) * s;
        const pop = 1 + 0.8 * Math.max(0, 1 - k * 6);
        C.font = '900 ' + Math.round(base * (mart ? 2 : 1.4) * pop) + 'px system-ui, sans-serif';
        C.globalAlpha = 1 - k * k;
        C.lineWidth = s * 1.2; C.strokeStyle = '#111';
        const str = mart ? f.ch : '삐익!';
        C.strokeText(str, x, y);
        C.fillStyle = mart ? ['#ffd84a', '#ffffff', '#ff7a3a'][f.n] : '#ffffff';
        C.fillText(str, x, y);
        C.globalAlpha = 1;
      }
      // round 19: the SIUUU weapon's call over the hero, the bribed referee's 퇴장, the judges' 10s for a dive
      for (const f of w.fx) {
        if (f.t >= f.dur || (f.kind !== 'siuuup' && f.kind !== 'referee' && f.kind !== 'dive')) continue;
        const k = f.t / f.dur;
        C.lineWidth = s * 1.2; C.strokeStyle = '#111';
        if (f.kind === 'siuuup') {
          const x = (w.player.x - camX) * s, y = (w.player.y - camY - 34 - k * 10) * s, pop = 1 + 1.2 * Math.max(0, 1 - k * 7);
          C.globalAlpha = Math.min(1, (1 - k) * 3);
          C.font = '900 ' + Math.round(base * 2.6 * pop) + 'px system-ui, sans-serif';
          C.strokeText('SIUUU!', x, y); C.fillStyle = 'rgb(' + siuuuRgb(w.t * 2) + ')'; C.fillText('SIUUU!', x, y);
          C.font = '900 ' + Math.round(base * 1.15) + 'px system-ui, sans-serif';
          const nm = RS.weaponIcon(w.build.weapon) + ' ' + RS.weaponName(w.build, w.build.weapon);
          C.strokeText(nm, x, y + base * 2.2); C.fillStyle = '#ffffff'; C.fillText(nm, x, y + base * 2.2);
        } else if (f.kind === 'referee') {
          if (f.t < f.hit) continue;
          const q = (f.t - f.hit) / (f.dur - f.hit), pop = 1 + 0.9 * Math.max(0, 1 - q * 6);
          C.globalAlpha = Math.min(1, (1 - q) * 3);
          C.font = '900 ' + Math.round(base * 1.9 * pop) + 'px system-ui, sans-serif';
          const x = (f.x - camX) * s, y = (f.y - camY - 46 - q * 8) * s;
          C.strokeText('퇴장!', x, y); C.fillStyle = '#ff3a30'; C.fillText('퇴장!', x, y);
        } else { // three judges' cards pop up one after another: 10 · 10 · 10
          C.font = '900 ' + Math.round(base * 1.1) + 'px system-ui, sans-serif';
          for (let i = 0; i < 3; i++) {
            const st = 0.12 + i * 0.1;
            if (k < st) continue;
            const pop = 1 + 0.6 * Math.max(0, 1 - (k - st) * 12), cw = base * 1.9 * pop, ch = base * 1.4 * pop;
            const x = (f.x - camX + (i - 1) * 15) * s, y = (f.y - camY - 52) * s;
            C.globalAlpha = Math.min(1, (1 - k) * 3);
            C.fillStyle = '#111'; C.fillRect(x - cw / 2 - s * 0.5, y - ch / 2 - s * 0.5, cw + s, ch + s);
            C.fillStyle = '#fffbe8'; C.fillRect(x - cw / 2, y - ch / 2, cw, ch);
            C.fillStyle = '#d0201a'; C.fillText('10', x, y + s * 0.2);
          }
        }
        C.globalAlpha = 1;
      }
      // SIUU shout text (날두's; 메시's glare has its own line)
      for (const r of w.rings) {
        if (r.t > 0.6 || !r.shout) continue;
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
(globalThis.RS_FILES = globalThis.RS_FILES || {}).render = 'R28';
