// CONTACT SHEET — decode each loose Arena `.FLC` and write a PNG of a few frames, plus an
// index page. A movie's filename says little about what it shows; this is how a human (or a
// preview pane) looks at the art before wiring a story beat to it.
//
//   node tools/flc-contact.mjs [arenaRoot] [outDir]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { decodeCutscene, frameBytes } from '../src/game/cutscene.js';

const ARENA = process.argv[2] || process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const OUT = process.argv[3] || path.join('tests', 'shots', 'flc');
fs.mkdirSync(OUT, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
/** Encode RGBA bytes as a non-interlaced 8-bit PNG. */
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4)
      .copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const names = fs.readdirSync(ARENA).filter((n) => /\.FLC$/i.test(n)).sort();
const cards = [];
for (const name of names) {
  const movie = decodeCutscene(new Uint8Array(fs.readFileSync(path.join(ARENA, name))), name);
  if (!movie.ok) { console.log(`${name}: ${movie.reason}`); continue; }
  const wanted = [0, Math.floor(movie.frameCount / 2), Math.max(0, movie.frameCount - 1)];
  let shown = 0;
  const frames = [];
  for (let want = 0; want <= Math.max(...wanted); want++) {
    const frame = movie.next();
    if (!frame) break;
    if (!wanted.includes(want)) continue;
    const file = `${name.replace(/\.FLC$/i, '')}-${want}.png`;
    fs.writeFileSync(path.join(OUT, file), png(frame.width, frame.height, frameBytes(frame.colours)));
    frames.push({ file, want });
    shown++;
  }
  console.log(`${name}: ${movie.frameCount} frames, ${movie.delayMs.toFixed(0)} ms, ${shown} stills`);
  cards.push({ name, frames, framesCount: movie.frameCount, delay: Math.round(movie.delayMs), beat: movie.beat, what: movie.what,
    // Inline the stills: the preview host serves the one HTML file, not its neighbours.
    stills: frames.map((f) => ({ ...f, data: fs.readFileSync(path.join(OUT, f.file)).toString('base64') })) });
}

const html = `<!doctype html><meta charset="utf-8"><title>Arena FLC contact sheet</title>
<style>body{background:#111;color:#ddd;font:13px system-ui;margin:16px}
h1{font-size:18px}.card{display:inline-block;vertical-align:top;margin:0 12px 20px 0;background:#1b1b1b;padding:8px;border:1px solid #333}
.card h2{font-size:14px;margin:0 0 4px}.card p{margin:0 0 6px;color:#999}
.card img{display:block;image-rendering:pixelated;width:320px;height:200px;margin-bottom:4px;background:#000}
.row{display:flex;gap:4px}.row img{width:160px;height:100px}</style>
<h1>Arena's loose movies — first, middle, last frame</h1>
${cards.map((c) => `<div class="card"><h2>${c.name}</h2><p>${c.what} · ${c.beat} · ${c.framesCount} frames · ${c.delay} ms</p><div class="row">${c.stills.map((f) => `<img src="data:image/png;base64,${f.data}" title="frame ${f.want}">`).join('')}</div></div>`).join('\n')}
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`wrote ${path.join(OUT, 'index.html')}`);
