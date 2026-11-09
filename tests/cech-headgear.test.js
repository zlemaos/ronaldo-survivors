const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('./load.js');

// 체흐 wears his padded black scrum cap (style 'headgear'), in the shootout and as a career teammate; 야신 and our
// keeper keep the plain cap.
test('체흐 has the headgear look; the other cap keepers are unchanged', () => {
  assert.equal(RS.PK_KEEPERS.cech.look.style, 'headgear');
  assert.equal(RS.TEAMMATES.cechwall.style, 'headgear');
  assert.equal(RS.PK_KEEPERS.yashin.look.style, 'cap');
  assert.equal(RS.PK_OUR_LOOK.style, 'cap');
});

// sprites.js paints on canvases: a stub canvas records the colours filled, so the sprite's padding seams show up
test('his small sprites carry the headgear seams; a cap keeper has none', () => {
  const fills = [];
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'fillRect' ? () => fills.push(o.fillStyle) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  require('../src/js/sprites.js');
  const seam = '#5a5a66', painted = (build) => { fills.length = 0; build(); return fills.includes(seam); };
  assert.ok(painted(() => RS.Sprites.pkKeeper(RS.PK_KEEPERS.cech.look)), 'shootout sprite');
  assert.ok(painted(() => RS.Sprites.mate('cechwall', 0)), 'career teammate sprite');
  assert.ok(!painted(() => RS.Sprites.pkKeeper(RS.PK_KEEPERS.yashin.look)), '야신 keeps his cap');
  assert.ok(!painted(() => RS.Sprites.pkKeeper(RS.PK_OUR_LOOK)), 'our keeper keeps his cap');
  delete globalThis.document;
});
