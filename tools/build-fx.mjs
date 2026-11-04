// Bundles tools/fx-entry.js (pixelfx runtime + the game's effects) into src/js/pixelfx.js as one classic script that
// defines window.PFX. Run after changing tools/fx-entry.js or vendor/pixelfx: `npm run build:fx`. The footer is the
// file's build stamp (bump it with RS.VERSION in src/js/core.js).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(root, 'tools', 'fx-entry.js')],
  bundle: true,
  format: 'iife',
  globalName: 'PFX',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  banner: { js: '/* pixelfx (https://github.com/patch-gg/pixelfx, MIT) + 호날두 서바이버즈 effects. Built by tools/build-fx.mjs; see vendor/pixelfx/NOTICE.md. */' },
  footer: { js: "(globalThis.RS_FILES = globalThis.RS_FILES || {}).pixelfx = 'R13.3';" },
  outfile: path.join(root, 'src', 'js', 'pixelfx.js')
});
console.log('src/js/pixelfx.js written');
