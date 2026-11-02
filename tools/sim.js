// Balance tool: plays the career with the bot. Usage: node tools/sim.js [fromIdx] [toIdx] [seed] [weak]
const RS = require('../tests/load.js');
const from = +(process.argv[2] || 0), to = +(process.argv[3] || RS.YEARS.length - 1), seed = +(process.argv[4] || 7);
const weak = process.argv[5] === 'weak';
RS.simCareer = require('../tests/career-sim.js');
const res = RS.simCareer({ seed, to, weak, log: true });
console.log('result', res.stoppedAt == null ? 'COMPLETE' : 'STOPPED at ' + RS.YEARS[res.stoppedAt].year, 'meta', JSON.stringify(res.save.meta));
