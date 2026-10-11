// Print a screenshot as coarse ASCII, so the shape of a frame can be read in a
// terminal. Used to check that a rendered Arena interior actually *looks* like a
// room — perspective, wall/floor/ceiling bands — and not like noise or a gradient.
//
//   node tools/lib/shotascii.mjs tests/shots/m3-start.png [cols]

import fs from 'node:fs';
import { decodePng } from '../../tests/cdp.mjs';

const file = process.argv[2] || 'tests/shots/m3-start.png';
const cols = Number(process.argv[3] || 100);

const png = decodePng(fs.readFileSync(file));
const ramp = ' .:-=+*#%@';
// Terminal cells are about twice as tall as wide, so sample half the rows.
const rows = Math.max(1, Math.round((cols * png.height) / png.width / 2));
const cw = png.width / cols;
const ch = png.height / rows;

let out = '';
let min = 255;
let max = 0;
const lum = [];
for (let r = 0; r < rows; r++) {
  const line = [];
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    let n = 0;
    for (let y = Math.floor(r * ch); y < Math.floor((r + 1) * ch); y++) {
      for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) {
        const o = (y * png.width + x) * 4;
        sum += 0.299 * png.data[o] + 0.587 * png.data[o + 1] + 0.114 * png.data[o + 2];
        n++;
      }
    }
    const v = n ? sum / n : 0;
    line.push(v);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  lum.push(line);
}

const span = Math.max(max - min, 1);
for (const line of lum) {
  out += line.map((v) => ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(((v - min) / span) * (ramp.length - 1))))]).join('') + '\n';
}
console.log(`${file}  ${png.width}×${png.height}  luminance ${min.toFixed(0)}..${max.toFixed(0)}`);
console.log(out);
