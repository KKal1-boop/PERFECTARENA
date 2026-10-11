#!/usr/bin/env node
// `city-dump.mjs` — assemble a real Arena city from the player's own data and
// print what the game will see. This is the Milestone 4 reverse-engineering tool,
// the counterpart of `mif-dump.mjs` for the milestone that is not a file format.
//
//   node tools/city-dump.mjs                                  # a city-state, seed 20232
//   node tools/city-dump.mjs CITY1.MIF --seed=7 --blocks=6
//   node tools/city-dump.mjs TOWN1.MIF --blocks=5 --inf=TCN.INF --ascii=60
//   node tools/city-dump.mjs CITY1.MIF --slots                  # the plan, slot by slot
//
// `ARENA_PATH` overrides the Arena folder.

import { ArenaData } from '../src/arena/arenaData.js';
import { buildCityLevel, detectReservedBlocks } from '../src/game/cityPlan.js';
import { decodeLevel } from '../src/game/mifLevel.js';
import { BLOCK_TYPE, CITY_BLOCKS_PER_SIDE, SOURCE, blockStartPosition } from '../src/game/tables/cityBlocks.js';
import { nodeSource } from './lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const [mifArg = 'CITY1.MIF'] = argv.filter((a) => !a.startsWith('--'));

const TYPE_BY_NAME = { CITY: 'city', TOWN: 'town', VILLAGE: 'village' };
const skeleton = mifArg.toUpperCase();
const type = TYPE_BY_NAME[skeleton.replace(/\d.*$/, '')] ?? 'city';
const blocksPerSide = Number(flag('blocks', CITY_BLOCKS_PER_SIDE[type]));
const seed = Number(flag('seed', 20232));
const infName = (flag('inf', 'TCN.INF')).toUpperCase();

const BLOCK_NAME = Object.fromEntries(Object.entries(BLOCK_TYPE).map(([k, v]) => [v, k.toLowerCase()]));

const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: (m) => console.warn(`  warn: ${m}`) });
const mif = await data.mif(skeleton);

const start = blockStartPosition(mif.width, mif.height, blocksPerSide);
const measured = detectReservedBlocks(mif.levels[0], {
  blocksPerSide, start, width: mif.width, depth: mif.height,
});

const built = await buildCityLevel({ data, mif, blocksPerSide, seed });
const inf = await data.inf(infName);
const level = decodeLevel(built.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });

console.log(`Arena folder   : ${ARENA_PATH}`);
console.log(`skeleton       : ${skeleton} ${mif.width}×${mif.height}  type ${type}  (no INFO chunk of its own)`);
console.log(`location INF   : ${infName}  ${inf.voxelTextures.length} textures  ${inf.menus.length} menus`);
console.log(`grid           : ${blocksPerSide}×${blocksPerSide} blocks of 20 cells, from (${start.x},${start.z}) → ${blocksPerSide * 20}×${blocksPerSide * 20} cells`);
console.log(`seed           : ${seed}`);
console.log(`reserved slots : ${built.reserved.length ? built.reserved.join(', ') : 'none — the skeleton is bare ground under the whole grid'}`);
console.log(`sources        : grid start = ${SOURCE.gridStart}; reserved = ${SOURCE.reserved}`);
console.log(`stamped        : ${built.stats.stamped} blocks, ${built.stats.cells} cells written`);
console.log(`missing blocks : ${built.missing.length ? built.missing.join(', ') : 'none'}`);

const kinds = Object.entries(level.stats).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(' ');
console.log(`decoded        : ${kinds}`);
console.log(`spawn          : ${JSON.stringify(level.spawn)}  floorY ${level.floorY}  layers ${level.layerCount}`);
console.log(`sky            : ${level.cells.filter((c) => !c.ceiling).length} cells open to the sky, ${level.stats.ceilinged} roofed`);

if (has('slots')) {
  console.log('\nplan (row-major, right to left then top to bottom):');
  for (let row = 0; row < blocksPerSide; row++) {
    const cells = [];
    for (let col = 0; col < blocksPerSide; col++) {
      const slot = built.slots[row * blocksPerSide + col];
      cells.push(slot.mif ? slot.mif.replace('.MIF', '') : BLOCK_NAME[slot.type].slice(0, 3).toUpperCase());
    }
    console.log(`  ${cells.map((c) => c.padEnd(9)).join(' ')}`);
  }
  const counts = {};
  for (const slot of built.slots) if (slot.mif) counts[slot.mif.slice(0, 2)] = (counts[slot.mif.slice(0, 2)] ?? 0) + 1;
  console.log(`  by code: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  reserved by measurement: ${measured.length ? measured.join(', ') : 'none'}`);
}

if (flag('ascii')) {
  const size = Number(flag('ascii'));
  const x0 = has('origin') ? Number(flag('origin').split(',')[0]) : Math.max(0, Math.floor((mif.width - size) / 2));
  const z0 = has('origin') ? Number(flag('origin').split(',')[1]) : Math.max(0, Math.floor((mif.height - size) / 2));
  const GLYPH = { air: '.', wall: '#', raised: 'R', door: 'D', edge: '|', transparent: 't', diagonal: '/', entity: 'e' };
  console.log(`\n${skeleton} built, level 0, origin (${x0},${z0}):`);
  for (let row = z0; row < Math.min(z0 + size, mif.height); row++) {
    let line = '';
    for (let col = x0; col < Math.min(x0 + size, mif.width); col++) {
      const c = level.cells[row * mif.width + col];
      if (c.kind === 'air') line += c.floor?.chasm ? '~' : '.';
      else line += GLYPH[c.kind] ?? '?';
    }
    console.log(`${String(row).padStart(3)} ${line}`);
  }
  console.log('\nkey: # wall  R raised  | menu edge  t arch  / diagonal  e entity  ~ chasm  . ground');
}
