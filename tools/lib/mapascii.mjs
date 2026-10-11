// ASCII view of a real `.MIF` level, for checking the voxel decoding by eye.
//
//   node tools/lib/mapascii.mjs 39300577.MIF 0 40        # centre 40×40 of level 0
//   node tools/lib/mapascii.mjs IMPPAL.MIF 0 50 0 0      # top-left 50×50
//
// A map with no `INFO` chunk of its own (every city skeleton) needs its INF named:
//
//   node tools/lib/mapascii.mjs CITY1.MIF 0 60 --inf=TCN.INF --map=city

import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { nodeSource } from './nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const [name = '39300577.MIF', levelArg = '0', sizeArg = '40', x0Arg, z0Arg] = argv.filter((a) => !a.startsWith('--'));
const mapType = flag('map') || 'interior';

const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });
const mif = await data.mif(name);
const level = mif.levels[Number(levelArg)];
const infName = (flag('inf') || level.info || '').toUpperCase();
const inf = infName ? await data.inf(infName) : null;
const model = decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType });

const size = Number(sizeArg);
const x0 = x0Arg !== undefined ? Number(x0Arg) : Math.max(0, Math.floor((mif.height - size) / 2));
const z0 = z0Arg !== undefined ? Number(z0Arg) : Math.max(0, Math.floor((mif.width - size) / 2));

const GLYPH = {
  air: '.', wall: '#', raised: 'R', door: 'D', edge: '|',
  transparent: 't', diagonal: '/', entity: 'e',
};

console.log(`${name} level ${levelArg}  ${mif.width}×${mif.height}  INF=${inf ? inf.name : '(none)'}  origin (${x0},${z0})`);
for (let row = z0; row < Math.min(z0 + size, mif.height); row++) {
  let line = '';
  for (let col = x0; col < Math.min(x0 + size, mif.width); col++) {
    const c = model.cells[row * mif.width + col];
    if (c.kind === 'air') {
      if (!c.floor) line += ' ';                       // air with no floor at all
      else if (c.floor.chasm) line += '~';
      else line += '.';
    } else if (c.kind === 'wall') line += '#';
    else if (c.kind === 'raised') line += 'R';
    else if (c.kind === 'door') line += 'D';
    else if (c.kind === 'chasm') line += '~';
    else line += GLYPH[c.kind] ?? '?';
  }
  console.log(`${String(row).padStart(3)} ${line}`);
}
console.log('\nkey: # wall  R raised  D door  | edge  t arch  / diagonal  e entity  ~ chasm  . floor  (space) no floor');
console.log('cells:', model.cells.length, 'spawn', model.spawn);
