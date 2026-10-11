// One-off analysis helper: the most common raw voxel IDs in a real `.MIF`, each
// with the bitfields this project decodes from it. Used to check the voxel
// decoding against real data (Milestone 3).
//
//   node tools/lib/voxhist.mjs 39300577.MIF 0

import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from './nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const name = process.argv[2] || '39300577.MIF';
const levelIndex = Number(process.argv[3] ?? 0);

const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });
const mif = await data.mif(name);
const level = mif.levels[levelIndex];

/** @param {number} v */
function describe(v) {
  const nibble = (v & 0xf000) >> 12;
  const most = (v & 0x7f00) >> 8;
  const least = v & 0x007f;
  if (!v) return 'air';
  if (nibble === 0x8) return `entity flat=${v & 0xff}`;
  if (nibble === 0x9) return `transparent tex=${(v & 0xff) - 1} solid=${(v & 0x100) === 0}`;
  if (nibble === 0xa) return `edge tex=${(v & 0x3f) - 1} off=${(v & 0xe00) >> 9} face=${(v & 0xc0) >> 4} solid=${(v & 0x100) !== 0}`;
  if (nibble === 0xb) return `door tex=${(v & 0x3f) - 1} type=${(v & 0xc0) >> 4}`;
  if (nibble === 0xc) return 'unknown-0xC';
  if (nibble === 0xd) return `diagonal tex=${(v & 0xff) - 1} right=${(v & 0x100) === 0}`;
  if ((v & 0x8000) === 0) {
    if (most === least) return `wall tex=${most - 1}`;
    return `raised side-slot=${v & 0xf} cap-slot=${(v & 0xf0) >> 4} h=${most & 7} t=${(most & 0x78) >> 3}`;
  }
  return 'unknown-high';
}

for (const [label, arr] of [['MAP1', level.map1], ['FLOR', level.flor], ['MAP2', level.map2]]) {
  if (!arr) { console.log(`${label}: absent`); continue; }
  const hist = new Map();
  for (const v of arr) hist.set(v, (hist.get(v) ?? 0) + 1);
  const sorted = [...hist].sort((a, b) => b[1] - a[1]).slice(0, 22);
  console.log(`\n--- ${label} (${hist.size} distinct) ---`);
  for (const [v, n] of sorted) {
    console.log(`  0x${v.toString(16).padStart(4, '0')}  ${String(n).padStart(6)}  ${label === 'MAP1' ? describe(v) : ''}`);
  }
}
