// Loads the browser game logic into Node (classic scripts attach to globalThis.RS).
require('../js/core.js');
require('../js/data.js');
require('../js/game.js');
require('../js/career.js');
require('../js/pk.js');
require('../js/pkscene.js');
module.exports = globalThis.RS;
