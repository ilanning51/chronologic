// Writes public/apple-touch-icon.png, a 180 by 180 ink disc on paper, with nothing but zlib.
// iOS ignores SVG icons for the home screen, so this one PNG is generated rather than drawn.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 180;
const RADIUS = 60;
const PAPER = [0xff, 0xff, 0xff];
const INK = [0x11, 0x11, 0x11];

const stride = SIZE * 4 + 1;
const raw = Buffer.alloc(stride * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * stride] = 0; // filter type: none
  for (let x = 0; x < SIZE; x++) {
    const d = Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2);
    const coverage = Math.min(1, Math.max(0, RADIUS + 0.5 - d));
    const o = y * stride + 1 + x * 4;
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round(PAPER[c] * (1 - coverage) + INK[c] * coverage);
    raw[o + 3] = 255;
  }
}

const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = new URL('../public/apple-touch-icon.png', import.meta.url);
writeFileSync(out, png);
console.log(`wrote ${out.pathname} (${png.length} bytes)`);
