// Loads the browser game logic into Node (classic scripts attach to globalThis.RS).
require('../src/js/core.js');
require('../src/js/data.js');
require('../src/js/game.js');
require('../src/js/career.js');
require('../src/js/pk.js');
require('../src/js/pkscene.js');
module.exports = globalThis.RS;
