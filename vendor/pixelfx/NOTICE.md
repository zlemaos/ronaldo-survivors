# pixelfx (vendored)

Copied from https://github.com/patch-gg/pixelfx (v0.3.0, commit a841596), MIT License (see LICENSE):
`core/` (the whole runtime) and the effects under `fx/` that 호날두 서바이버즈 uses. Bundled by
`tools/build-fx.mjs` into `js/pixelfx.js`; the game's own effects live in `tools/fx-entry.js`.

Upstream notices that apply to these files:

- **Hugo Duprez.** `core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's
  open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License.
- **Hollow Crown.** `core/act.js` adapts how Hollow Crown plays its skills, from
  https://github.com/rehan-remade/hollow-crown, Copyright (c) 2026 rehan-remade, MIT License.
