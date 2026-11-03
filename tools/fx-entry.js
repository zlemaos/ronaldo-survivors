// Entry for js/pixelfx.js (tools/build-fx.mjs): the pixelfx runtime (vendor/pixelfx, MIT), the library effects
// the game uses, and the game's own small effects written to the same contract (docs/FX_RESEARCH_KO.md).
// Everything is drawn in HD canvas pixels (2 per world pixel), where a person is about 26 × 32 px — the scale the
// library's effects were drawn for.
import { createFrame, clearFrame, createFx, composite, Particles, Lights, P, PF, Rng, fit, sparkle, flare, band, smooth, TAU, WHITE } from "../vendor/pixelfx/core/index.js";
import * as hitSpark from "../vendor/pixelfx/fx/impacts/hit-spark.js";
import * as smallExplosion from "../vendor/pixelfx/fx/explosions/small-explosion.js";
import * as bigExplosion from "../vendor/pixelfx/fx/explosions/big-explosion.js";
import * as heal from "../vendor/pixelfx/fx/holy/heal.js";

const GOLD = ["#4a2a06", "#a86a12", "#e8a820", "#ffd84a", "#fff0a0", "#ffffff"];
const FIRE = ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff"];
const ICE = ["#0b2340", "#1b5a9a", "#3aa0e8", "#8ad4ff", "#d8f3ff", "#ffffff"];

// 처치: a short two-tone spark spray with one light pop — the everyday kill (0.55 s, about 24 px across).
export const sparkPop = {
  meta: { name: "Spark pop", size: [64, 48], origin: [32, 36], duration: 0.55, loop: false, fps: 30, options: { palette: FIRE, seed: 1, n: 10, up: 40 } },
  create(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed);
    const ps = new Particles({ rng: R, ground: () => 0, sparks: [C[6], C[5], C[4], C[2]] }), lights = new Lights();
    lights.add(0, -8, 18, C[4], 0.5, 0.18);
    for (let i = 0; i < o.n; i++) {
      const a = R.range(0, TAU), sp = R.range(60, 150);
      ps.spawn(P.SPARK, 0, -8, Math.cos(a) * sp, Math.sin(a) * sp - o.up, R.range(0.18, 0.4), WHITE, 1);
    }
    let t = 0;
    return {
      update(dt) { t += dt; ps.update(dt); lights.update(dt); },
      draw(p) { if (t < 0.07) sparkle(p, 0, -8, 5 * (1 - t / 0.07), C[5], C[3], 0.4); ps.draw(p); lights.draw(p); }
    };
  }
};

// 황금 폭발: a white hero frame, an 8-ray flare, a golden ring on the floor and a shower of golden sparks that
// bounce — evolutions, 합체, SIUU, the level-up (1.4 s, about 90 px).
export const goldBurst = {
  meta: { name: "Gold burst", size: [120, 100], origin: [60, 80], duration: 1.4, loop: false, fps: 30, options: { palette: GOLD, seed: 2, n: 34 } },
  create(o) {
    const C = fit(o.palette, 6), R = new Rng(o.seed);
    const ps = new Particles({ rng: R, ground: () => 0, sparks: [C[5], C[4], C[3], C[2]] }), lights = new Lights();
    lights.add(0, -16, 48, C[3], 0.7, 0.35);
    lights.add(0, 0, 30, C[2], 0.3, 0.9);
    for (let i = 0; i < o.n; i++) {
      const a = R.range(-Math.PI, 0) + R.range(-0.4, 0.4), sp = R.range(90, 230);
      ps.spawn(P.SPARK, 0, -16, Math.cos(a) * sp, Math.sin(a) * sp - 40, R.range(0.5, 1.1), C[5], 1, R.range(0, 0.06));
    }
    for (let i = 0; i < 8; i++) ps.spawn(P.STAR, R.range(-30, 30), R.range(-40, -6), 0, -12, R.range(0.6, 1.2), C[4], 1, R.range(0.1, 0.5));
    let t = 0;
    return {
      update(dt) { t += dt; ps.update(dt); lights.update(dt); },
      draw(p) {
        const k = 1 - smooth(Math.min(1, t / 0.5));
        if (t < 0.05) p.disc(0, -16, 9, WHITE, 1);
        if (t < 0.25) flare(p, 0, -16, 34 * (1 - t / 0.25) + 6, 0.9, C);
        band(p, 0, 0, 10 + 60 * smooth(Math.min(1, t / 0.6)), 0.16, 2, 0.8 * k, C, undefined, true);
        ps.draw(p); lights.draw(p);
      }
    };
  }
};

// 소형 폭발: a flash, a fire ball that cools into smoke, sparks and a scorch — 유도 대포알's hit, 드롭볼 and
// 유성 impacts (1.6 s, about 60 px). palette picks the fire colour (gold for 발롱도르 things).
export const boomSmall = {
  meta: { name: "Boom small", size: [96, 80], origin: [48, 64], duration: 1.6, loop: false, fps: 30, options: { palette: FIRE, seed: 3, n: 14, r: 22 } },
  create(o) {
    const C = fit(o.palette, 7), R = new Rng(o.seed);
    const ps = new Particles({ rng: R, ground: () => 0, sparks: [C[6], C[5], C[4], C[2]] }), lights = new Lights();
    lights.add(0, -6, o.r * 2.2, C[4], 0.8, 0.3);
    for (let i = 0; i < 7; i++) {
      const a = R.range(-Math.PI, 0), sp = R.range(10, 40);
      ps.spawn(P.FIRE, R.range(-4, 4), -6 + R.range(-3, 3), Math.cos(a) * sp, Math.sin(a) * sp - 30, R.range(0.25, 0.5), 0, R.range(2, 3.5), R.range(0, 0.05), PF.SMOKES);
    }
    for (let i = 0; i < o.n; i++) {
      const a = R.range(-Math.PI - 0.3, 0.3), sp = R.range(80, 220);
      ps.spawn(P.SPARK, 0, -6, Math.cos(a) * sp, Math.sin(a) * sp - 40, R.range(0.3, 0.6), WHITE, 1);
    }
    for (let i = 0; i < 6; i++) ps.spawn(P.GRIT, 0, -4, R.range(-90, 90), R.range(-120, -40), R.range(0.4, 0.7), C[1], 1);
    let t = 0;
    return {
      update(dt) { t += dt; ps.update(dt); lights.update(dt); },
      drawBack(p) { const k = 1 - Math.min(1, t / 1.6); if (k > 0) p.ellipse(0, 1, o.r * 0.9, o.r * 0.3, C[0], 0.5 * k); ps.draw(p, "back"); },
      draw(p) {
        if (t < 0.04) p.disc(0, -6, o.r * 0.6, WHITE, 1);
        if (t < 0.18) { const u = t / 0.18; p.ring(0, -6, o.r * (0.3 + 0.9 * u), 2, C[5], 1 - u); }
        ps.draw(p, "front"); lights.draw(p);
      }
    };
  }
};

// 기절: three small blue stars circling over a stunned head (loop, 0.9 s).
export const stunStars = {
  meta: { name: "Stun stars", size: [48, 40], origin: [24, 32], duration: 0.9, loop: true, fps: 30, options: { palette: ICE, seed: 1 } },
  draw(p, t, o) {
    const C = fit(o.palette, 6);
    for (let i = 0; i < 3; i++) {
      const a = t / 0.9 * TAU + i * TAU / 3;
      const x = Math.cos(a) * 11, y = -26 + Math.sin(a) * 3.5;
      sparkle(p, x, y, 2.5, C[3], C[5], 0.35);
    }
  }
};

export const fx = { hitSpark, smallExplosion, bigExplosion, heal, sparkPop, goldBurst, boomSmall, stunStars };
export { createFrame, clearFrame, createFx, composite, GOLD, FIRE, ICE };
