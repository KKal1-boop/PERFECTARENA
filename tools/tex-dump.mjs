// LOOK AT A LEVEL'S TEXTURES.
//
//   node tools/tex-dump.mjs --inf TCN.INF                 # every voxel texture, contact sheet
//   node tools/tex-dump.mjs --inf TCN.INF --art           # the same, sampled with LINEAR (as a wall looks)
//   node tools/tex-dump.mjs --flats --inf TCN.INF         # the @FLATS pictures instead
//   node tools/tex-dump.mjs --img CASA.IMG                # one file
//   node tools/tex-dump.mjs --cfa RAT1.CFA --frame 2      # one creature frame
//
// Why: every texture complaint ("it is white", "it is upside down", "the black should be
// a hole") is a question about the art, and no amount of reading a decoder answers it.
// This writes the decoded picture to a PNG so the answer takes one look — the same
// argument `tools/cfa-dump.mjs` makes for creature frames.
//
// Two index-0 treatments are drawn for each art, side by side, because that is the one
// decision this project keeps getting wrong:
//
//   * `cutout`  index 0 is a hole (sprites, flats)
//   * `opaque`  index 0 is black paint (walls, floors, ceilings)
//
// The sheet prints how many index-0 pixels each picture has and whether any of them sit
// *inside* the picture's silhouette (a hole) or only on its border (a background).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { nodeSource } from './lib/nodeSource.mjs';
import { ArenaData } from '../src/arena/arenaData.js';
import { toRgba } from '../src/arena/palette.js';
import { parseCfa } from '../src/arena/cfa.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const argv = process.argv.slice(2);
const option = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1';
};
const has = (name) => argv.includes(`--${name}`);

const outDir = option('out', path.join('tests', 'shots'));
const scale = Number(option('scale', '3'));
const infName = option('inf', null);
const wantedFlats = has('flats');
const wantedArt = has('art');

/** CRC32 for PNG chunks. */
const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

/**
 * Write an RGBA buffer as a PNG.
 * @param {string} out @param {Uint8Array|Uint8ClampedArray} rgba @param {number} width @param {number} height
 */
function writePng(out, rgba, width, height) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      raw[rowStart + 1 + x * 4] = rgba[s];
      raw[rowStart + 2 + x * 4] = rgba[s + 1];
      raw[rowStart + 3 + x * 4] = rgba[s + 2];
      raw[rowStart + 4 + x * 4] = rgba[s + 3];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  return out;
}

/** Draw one picture into a sheet at (dx, dy), magnified by `k`, over a checkerboard. */
function blit(sheet, sheetW, src, srcW, srcH, dx, dy, k) {
  for (let y = 0; y < srcH * k; y++) {
    for (let x = 0; x < srcW * k; x++) {
      const sx = Math.floor(x / k), sy = Math.floor(y / k);
      const s = (sy * srcW + sx) * 4;
      const checker = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? 40 : 90;
      const d = ((dy + y) * sheetW + dx + x) * 4;
      const a = src[s + 3] / 255;
      sheet[d] = src[s] * a + checker * (1 - a);
      sheet[d + 1] = src[s + 1] * a + checker * (1 - a);
      sheet[d + 2] = src[s + 2] * a + checker * (1 - a);
      sheet[d + 3] = 255;
    }
  }
}

const source = nodeSource(ARENA);
const data = new ArenaData(source, { onWarn: (m) => console.warn(`[arena] ${m}`) });
const palette = await data.palette('PAL.COL');

/** Count index-0 pixels and whether any is surrounded by non-zero. */
function indexZeroStats(indices, width, height) {
  let zeros = 0;
  let interiorZeros = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (indices[y * width + x] !== 0) continue;
      zeros++;
      const n = [indices[(y - 1) * width + x], indices[(y + 1) * width + x] ?? 0, indices[y * width + x - 1] ?? 0, indices[y * width + x + 1] ?? 0];
      if (n.every((v) => v !== undefined && v !== 0)) interiorZeros++;
    }
  }
  return { zeros, interiorZeros, total: width * height };
}

/** @type {{name: string, width: number, height: number, indices: Uint8Array}[]} */
const pictures = [];

if (option('img', null)) {
  for (const name of option('img').split(',')) {
    try {
      // `data.img` reaches inside GLOBAL.BSA, which is where the city art lives.
      const image = await data.img(name);
      pictures.push({ name, width: image.width, height: image.height, indices: image.indices });
    } catch (err) {
      console.log(`${name}: ${err.message}`);
    }
  }
} else if (option('cfa', null)) {
  const name = option('cfa');
  const cfa = parseCfa(await source.getBytes(name), name);
  const frame = cfa.frames[Math.min(cfa.frames.length - 1, Number(option('frame', '0')))];
  pictures.push({ name: `${name} #${frame.index}`, width: frame.width, height: frame.height, indices: frame.indices });
} else if (infName) {
  const inf = await data.inf(infName);
  if (wantedFlats) {
    for (const [i, flat] of inf.flats.entries()) {
      const filename = inf.flatTextures[flat.textureIndex];
      if (!filename || filename.endsWith('.DFA')) continue;
      try {
        const image = filename.endsWith('.SET')
          ? (await data.setFrames(filename))[flat.setIndex >= 0 ? flat.setIndex : 0]
          : await data.img(filename);
        pictures.push({ name: `flat ${i} ${filename} ${flat.yOffset ? `Y:${flat.yOffset}` : ''}`, width: image.width, height: image.height, indices: image.indices });
      } catch (err) {
        console.log(`flat ${i} ${filename}: ${err.message}`);
      }
    }
  } else {
    const seen = new Set();
    for (const [i, ref] of inf.voxelTextures.entries()) {
      const key = `${ref.filename}#${ref.setIndex}`;
      try {
        const image = ref.filename.endsWith('.SET')
          ? (await data.setFrames(ref.filename))[Math.max(0, ref.setIndex)]
          : await data.img(ref.filename);
        if (!image) continue;
        const dup = seen.has(key);
        seen.add(key);
        pictures.push({ name: `${i} ${key}${dup ? ' (dup)' : ''}`, width: image.width, height: image.height, indices: image.indices });
      } catch (err) {
        console.log(`texture ${i} ${key}: ${err.message}`);
      }
    }
  }
}

// ── the sheet ────────────────────────────────────────────────────────────────
const cell = Math.max(64, Math.max(...pictures.map((p) => Math.max(p.width, p.height)))) * 1;
const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(pictures.length))));
const rows = Math.ceil(pictures.length / cols);
const pad = 6;
// Two panels per picture (cutout, opaque) side by side.
const panelW = Math.round(cell * (scale / 3));
const sheetW = cols * (panelW * 2 + pad * 3);
const sheetH = rows * (panelW + pad * 2);
const sheet = new Uint8ClampedArray(sheetW * sheetH * 4).fill(0);
for (let i = 0; i < sheet.length; i += 4) { sheet[i] = 20; sheet[i + 1] = 20; sheet[i + 2] = 24; sheet[i + 3] = 255; }

pictures.forEach((pic, i) => {
  const col = i % cols, row = (i / cols) | 0;
  const x0 = col * (panelW * 2 + pad * 3) + pad;
  const y0 = row * (panelW + pad * 2) + pad;
  const stats = indexZeroStats(pic.indices, pic.width, pic.height);
  const k = Math.max(1, Math.floor(panelW / Math.max(pic.width, pic.height)));
  // Cutout (index 0 transparent) — what a sprite looks like.
  blit(sheet, sheetW, toRgba(pic.indices, palette, { width: pic.width, height: pic.height }), pic.width, pic.height, x0, y0, k);
  // Opaque (index 0 painted black) — what a wall looks like.
  const opaque = new Uint8ClampedArray(pic.indices.length * 4);
  const rgb = palette.rgb;
  const rgba = toRgba(pic.indices, palette, { width: pic.width, height: pic.height });
  for (let p = 0; p < pic.indices.length; p++) {
    const v = pic.indices[p];
    opaque[p * 4] = v === 0 ? rgb[0] : rgba[p * 4];
    opaque[p * 4 + 1] = v === 0 ? rgb[1] : rgba[p * 4 + 1];
    opaque[p * 4 + 2] = v === 0 ? rgb[2] : rgba[p * 4 + 2];
    opaque[p * 4 + 3] = 255;
  }
  blit(sheet, sheetW, opaque, pic.width, pic.height, x0 + panelW + pad, y0, k);
  console.log(`${String(i).padStart(3)} ${pic.name.padEnd(28)} ${pic.width}x${pic.height} idx0=${stats.zeros} interior=${stats.interiorZeros}`);
});

const out = path.join(outDir, option('o', `tex-${(infName || option('img') || option('cfa') || 'sheet').replace(/[^A-Za-z0-9._-]/g, '_')}.png`));
writePng(out, sheet, sheetW, sheetH);
console.log(`\n${pictures.length} pictures -> ${out} (left of each pair: index 0 transparent; right: index 0 black)`);
