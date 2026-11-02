// Generates icons/icon-192.png, icon-512.png and icon-maskable-512.png from a 32x32 pixel design. Run: node tools/make-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const G = [
  '................................',
  '................................',
  '..........HHHHHHHHH.............',
  '........HHHHHHHHHHHH............',
  '.......HHHHHHHHHHHHHH...........',
  '.......HHHSSSSSSSHHHH...........',
  '.......HHSSSSSSSSSHH............',
  '.......HSSSSEESSSEES............',
  '.......HSSSSEESSSEES............',
  '........SSSSSSSSSSSS............',
  '........SSSSSMMMMSSS............',
  '.........SSSSSSSSSS.............',
  '...........SSSSSS...............',
  '.......RRRRRRRRRRRRRR...........',
  '.....RRRRRRRRRRRRRRRRRR.........',
  '....RRRRRRRWWWWWRRRRRRRR........',
  '....RRRRRRRRRRRWWRRRRRRR........',
  '....RRRRRRRRRRWWRRRRRRRR........',
  '....RRRRRRRRRWWRRRRRRRRR...BBBB.',
  '....RRRRRRRRWWRRRRRRRRRR..BKBBKB',
  '....RRRRRRRRWWRRRRRRRRRR..BBKKBB',
  '....RRRRRRRRRRRRRRRRRRRR..BKBBKB',
  '....RRRRRRRRRRRRRRRRRRRR...BBBB.',
  '................................',
];
const PAL = { H: [32, 20, 12], S: [217, 162, 122], E: [20, 20, 20], M: [150, 70, 60], R: [196, 30, 42], W: [255, 255, 255], B: [255, 255, 255], K: [20, 20, 20] };
const BG = [16, 60, 32], BG2 = [22, 74, 40];
function render(size, pad) {
  const px = Buffer.alloc(size * size * 4);
  const cell = (size * (1 - pad * 2)) / 32, off = size * pad;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let c = (Math.floor(x / (size / 8)) % 2) ? BG : BG2;
    const gx = Math.floor((x - off) / cell), gy = Math.floor((y - off) / cell) - 4;
    if (gx >= 0 && gx < 32 && gy >= 0 && gy < G.length) { const ch = G[gy][gx]; if (PAL[ch]) c = PAL[ch]; }
    const i = (y * size + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return png(size, size, px);
}
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon-192.png'), render(192, 0.04));
fs.writeFileSync(path.join(dir, 'icon-512.png'), render(512, 0.04));
fs.writeFileSync(path.join(dir, 'icon-maskable-512.png'), render(512, 0.14));
console.log('icons written');
