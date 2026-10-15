// DECODE A `.CFA` FRAME AND LOOK AT IT.
//
//   node tools/cfa-dump.mjs RAT1.CFA [--frame 0] [--scale 6] [--out tests/shots]
//
// Reverse-engineering an image format by reading hex is how you get a decoder that
// passes its own test and draws nonsense; the browser suite proved that once already
// (a sprite that was the right shape in the wrong colours). This writes the frame out as
// a PNG instead, magnified with nearest-neighbour, so the answer takes one look.
//
// The palette is `PAL.COL` from the Arena folder, index 0 shown as magenta so
// transparency is visible rather than confusable with a black background.
//
// Node's own `zlib` is used for the PNG's compression: no dependencies, and this is a
// developer tool that never ships to the browser.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { nodeSource } from './lib/nodeSource.mjs';
import { parseBsa } from '../src/arena/bsaArchive.js';
import { parseCfa } from '../src/arena/cfa.js';
import { parseCol } from '../src/arena/palette.js';
import { decodeType04 } from '../src/arena/decompress.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const argv = process.argv.slice(2);

/** @param {string} name */
function option(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const file = argv.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'RAT1.CFA';
const frameIndex = Number(option('frame', '0'));
const scale = Number(option('scale', '6'));
const outDir = option('out', path.join('tests', 'shots'));
/** `rle` (the parser's choice) or `type04` (Arena's IMG codec, for comparison). */
const decoder = option('decoder', 'rle');

/**
 * Write an RGB PNG.
 * @param {string} out @param {Uint8Array} rgba @param {number} width @param {number} height
 */
function writePng(out, rgba, width, height) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;                                   // filter: none
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = rowStart + 1 + x * 3;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(out, png);
}

/** @type {number[]} */
const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function main() {
  const source = nodeSource(ARENA);
  const bsa = parseBsa(await source.getBytes('GLOBAL.BSA'));
  const bytes = bsa.get(file);
  if (!bytes) throw new Error(`${file} is not in GLOBAL.BSA`);

  const cfa = parseCfa(bytes, file);
  const frame = cfa.frames.find((f) => f.index === frameIndex) ?? cfa.frames[0];
  let indices = frame.indices;
  if (decoder === 'type04') {
    const start = cfa.offsets[frame.index];
    const end = frame.index + 1 < cfa.offsets.length ? cfa.offsets[frame.index + 1] : bytes.length;
    indices = decodeType04(bytes.subarray(start, end), cfa.width * cfa.height);
  }

  // Which palette a creature is drawn with is not documented, and PAL.COL (right for the
  // walls) made a patchwork of every sprite: the shape was perfect, the colours were
  // noise. `--palette` is how the right one was found.
  const paletteName = option('palette', 'PAL.COL');
  const col = parseCol(await source.getBytes(paletteName) ?? await source.getBytes('PAL.COL'));
  const width = cfa.width * scale;
  const height = cfa.height * scale;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = indices[Math.floor(y / scale) * cfa.width + Math.floor(x / scale)] ?? 0;
      const o = (y * width + x) * 4;
      if (index === 0) { rgba[o] = 255; rgba[o + 1] = 0; rgba[o + 2] = 255; rgba[o + 3] = 255; continue; }
      rgba[o] = col.rgb[index * 3];
      rgba[o + 1] = col.rgb[index * 3 + 1];
      rgba[o + 2] = col.rgb[index * 3 + 2];
      rgba[o + 3] = 255;
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${file.replace(/\W/g, '')}-f${frame.index}-${decoder}-${paletteName.replace(/\W/g, '')}.png`);
  writePng(out, rgba, width, height);
  console.log(`${file} frame ${frame.index} ${cfa.width}×${cfa.height} (${cfa.frames.length} frames, decoder ${decoder}) -> ${out}`);
  console.log(`  unknown header byte: ${cfa.unknownField} · warnings: ${cfa.warnings.length ? cfa.warnings.join(' | ') : 'none'}`);
}

main().catch((err) => { console.error(err?.stack ?? String(err)); process.exit(1); });
