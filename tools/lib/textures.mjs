// Decode every texture a level's `.INF` lists and print small ASCII thumbnails.
// This is how the IMG/SET decoding and the palette choice were checked by eye:
// a wall texture must look like brickwork or stone, not like noise.
//
//   node tools/lib/textures.mjs START.MIF [count] [--palette=DAYTIME.COL]

import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from './nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const argv = process.argv.slice(2);
const paletteFlag = argv.find((a) => a.startsWith('--palette='));
const rest = argv.filter((a) => !a.startsWith('--'));
const name = rest[0] || 'START.MIF';
const count = Number(rest[1] || 8);

const paletteName = paletteFlag ? paletteFlag.split('=')[1] : undefined;
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: (m) => console.log('warn:', m), paletteName });
const mif = await data.mif(name);
const level = mif.levels[0];
const inf = await data.inf(level.info.toUpperCase());

const ramp = ' .:-=+*#%@';
/**
 * A single-pixel-sampled thumbnail. Averaging over blocks would flatten exactly
 * the fine grain these textures are made of, which is why this samples.
 *
 * @param {{width:number,height:number,colors:Uint8ClampedArray}} upload
 * @param {number} w  characters wide
 * @returns {string[]}
 */
function thumb(upload, w = 32) {
  const h = Math.max(1, Math.round((w * upload.height) / upload.width / 2));
  const rows = [];
  for (let r = 0; r < h; r++) {
    let line = '';
    for (let c = 0; c < w; c++) {
      const x = Math.min(upload.width - 1, Math.floor((c + 0.5) * upload.width / w));
      const y = Math.min(upload.height - 1, Math.floor((r + 0.5) * upload.height / h));
      const o = (upload.height - 1 - y) * upload.width * 4 + x * 4;   // stored bottom-up
      if (upload.colors[o + 3] < 40) line += ' ';
      else {
        const v = 0.299 * upload.colors[o] + 0.587 * upload.colors[o + 1] + 0.114 * upload.colors[o + 2];
        line += ramp[Math.min(ramp.length - 1, Math.max(0, Math.round((v / 255) * (ramp.length - 1))))];
      }
    }
    rows.push(line);
  }
  return rows;
}

/** @param {{width:number,height:number,colors:Uint8ClampedArray}} upload */
function meanRgb(upload) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < upload.colors.length; i += 4) {
    if (upload.colors[i + 3] < 40) continue;
    r += upload.colors[i]; g += upload.colors[i + 1]; b += upload.colors[i + 2]; n++;
  }
  if (!n) return 'transparent';
  return `${(r / n).toFixed(0)},${(g / n).toFixed(0)},${(b / n).toFixed(0)}`;
}

console.log(`${name} level 0  INF=${inf.name}  ${inf.voxelTextures.length} textures  palette=${paletteName ?? data.paletteName}`);
let decoded = 0;
let failed = 0;
const sheets = [];
for (let i = 0; i < inf.voxelTextures.length && decoded < count; i++) {
  const ref = inf.voxelTextures[i];
  try {
    const upload = await data.texture(ref);
    if (!upload) { failed++; continue; }
    const colors = new Set();
    for (let p = 0; p < upload.colors.length; p += 4) {
      colors.add(upload.colors[p] << 16 | upload.colors[p + 1] << 8 | upload.colors[p + 2]);
    }
    sheets.push({ ref, upload, colors: colors.size });
    decoded++;
  } catch (err) {
    console.log(`  [${i}] ${ref.filename}#${ref.setIndex} FAILED: ${err.message}`);
    failed++;
  }
}
console.log(`decoded ${decoded}, failed ${failed}`);

const per = 4;
for (let s = 0; s < sheets.length; s += per) {
  const group = sheets.slice(s, s + per);
  console.log(group.map((g) => `${g.ref.filename}#${g.ref.setIndex} ${g.upload.width}×${g.upload.height} ${g.colors}c rgb(${meanRgb(g.upload)})`.padEnd(40)).join(''));
  const rows = group.map((g) => thumb(g.upload));
  const height = Math.max(...rows.map((r) => r.length));
  for (let r = 0; r < height; r++) console.log(rows.map((row) => (row[r] ?? '').padEnd(34)).join('  '));
  console.log();
}
