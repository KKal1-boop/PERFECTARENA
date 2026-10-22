// DUMP ARENA `.IMG` ART TO PNG FOR INSPECTION.
//
//   node tools/img-dump.mjs OUTDIR P1.IMG POPUP2.IMG …
//
// The game itself never needs this: it decodes the same bytes into a canvas at runtime
// (`src/arena/image.js`). This is the bench tool for *looking* at the install's own GUI art
// while designing a screen against it — the palette is `PAL.COL` unless the image carries one.
//
// Nothing is bundled: the PNGs are written wherever the caller asks, from the player's copy.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseBsa } from '../src/arena/bsaArchive.js';
import { parseImg } from '../src/arena/image.js';
import { parseCol } from '../src/arena/palette.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ARENA = process.env.ARENA_PATH
  || [path.join(ROOT, '..', 'arena', 'ARENA'), path.join(ROOT, '..', 'ARENA', 'ARENA')].find((p) => fs.existsSync(path.join(p, 'GLOBAL.BSA')));

const [outDir, ...names] = process.argv.slice(2);
if (!outDir || !names.length) {
  console.error('usage: node tools/img-dump.mjs OUTDIR NAME.IMG [NAME.IMG …]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const archive = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))));
const global = parseCol(fs.readFileSync(path.join(ARENA, 'PAL.COL')));

/** One PNG chunk. */
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const name of names) {
  const key = name.toUpperCase();
  const bytes = archive.get(key);
  if (!bytes) { console.error(`${name}: not in GLOBAL.BSA`); continue; }
  const img = parseImg(bytes, key);
  const palette = img.palette ?? global;
  const rgba = Buffer.alloc(img.width * img.height * 4);
  const rgb = palette.rgb;
  for (let i = 0; i < img.width * img.height; i++) {
    const idx = img.indices[i];
    rgba[i * 4] = rgb[idx * 3]; rgba[i * 4 + 1] = rgb[idx * 3 + 1]; rgba[i * 4 + 2] = rgb[idx * 3 + 2];
    rgba[i * 4 + 3] = idx === 0 ? 0 : 255;
  }
  // A 2× nearest copy is easier to read on a modern screen, and 320 px is a thumbnail.
  const scale = img.width <= 120 ? 4 : 2;
  const big = Buffer.alloc(img.width * scale * img.height * scale * 4);
  for (let y = 0; y < img.height * scale; y++) {
    for (let x = 0; x < img.width * scale; x++) {
      const src = ((y / scale | 0) * img.width + (x / scale | 0)) * 4;
      const dst = (y * img.width * scale + x) * 4;
      big[dst] = rgba[src]; big[dst + 1] = rgba[src + 1]; big[dst + 2] = rgba[src + 2]; big[dst + 3] = rgba[src + 3];
    }
  }
  const file = path.join(outDir, `${key.replace(/\.IMG$/, '')}.png`);
  fs.writeFileSync(file, png(img.width * scale, img.height * scale, big));
  console.log(`${name} → ${file} (${img.width}×${img.height})`);
}
