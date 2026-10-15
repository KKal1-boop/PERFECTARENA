// WILDERNESS DUMP — what the data says the country outside the walls looks like.
//
//   node tools/wild-dump.mjs [--seed=N] [--at=x,z] [--ascii] [--blocks]
//
// * `--blocks` prints every `.RMD` record as a picture (its entity flats and its
//   structure) next to the category this project measures for it.
// * `--ascii` prints the 128×128 window of wilderness the game would load around
//   a settlement, drawn from its own seed.
//
// Needs ARENA_PATH.
import { parseBsa } from '../src/arena/bsaArchive.js';
import { nodeSource } from './lib/nodeSource.mjs';
import { blockIdsFromListing, isWildCityBlock, rmdName } from '../src/arena/rmdFile.js';
import {
  CITY_ORIGIN, WILD_CHUNK, WILD_WINDOW, classifyBlock, generateWildernessIndices,
  blockStructure, wildernessBlockLists, buildWildernessWindow, wildernessInfName,
  wildernessWindowOrigin,
} from '../src/game/wilderness.js';
import { ArenaData } from '../src/arena/arenaData.js';
import { decodeLevel } from '../src/game/mifLevel.js';
import { wildernessSeed } from '../src/arena/cityDataSeeds.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const source = nodeSource(ARENA);
const data = new ArenaData(source, { onWarn: (m) => console.log(`  warn: ${m}`) });
const bsa = parseBsa(await source.getBytes('GLOBAL.BSA'));

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

// ── every block this install ships, decoded once ──────────────────────────────
const ids = blockIdsFromListing(bsa.names());
/** @type {Map<number, object>} */
const blocks = new Map();
for (const id of ids) {
  const block = await data.rmd(rmdName(id));
  blocks.set(id, block);
  for (const w of block.warnings) console.log(`  warn: ${w}`);
}
console.log(`${ids.length} wilderness blocks: ${ids[0]}…${ids[ids.length - 1]}, `
  + `${ids.filter((id) => isWildCityBlock(id)).length} of them the settlement's quarters`);

if (flag('blocks')) {
  for (const id of ids) {
    const block = blocks.get(id);
    const { structure, edges, arches, walls, entities, water } = blockStructure(block);
    console.log(`\nWILD${String(id).padStart(3, '0')}  ${classifyBlock(block).padEnd(7)} `
      + `structure ${String(structure).padStart(4)} (edge ${edges}, arch ${arches}, wall ${walls}) `
      + `flats ${String(entities).padStart(4)} water ${water}`);
    if (!flag('ascii')) continue;
    for (let r = 0; r < 64; r++) {
      let s = '';
      for (let c = 0; c < 64; c++) {
        const i = r * 64 + c;
        const id1 = block.map1[i];
        const nibble = (id1 & 0xf000) >> 12;
        const t = (block.flor[i] & 0xff00) >> 8;
        s += nibble === 8 ? '*' : nibble === 9 ? '^' : nibble === 0xa ? '-' : id1 ? '#'
          : (block.map2[i] ? 'h' : t === 0xd ? '~' : t === 0 ? ' ' : '.:;o0='[t % 6]);
      }
      console.log(s);
    }
  }
}

// ── the categories, and the grid they are drawn into ──────────────────────────
const { lists, categories } = wildernessBlockLists(blocks);
console.log('\ncategory   blocks                      measured from the voxels');
for (const [name, list] of Object.entries(lists)) {
  const what = [...new Set(list.map((id) => classifyBlock(blocks.get(id))))].join('/');
  console.log(`${name.padEnd(9)} ${String(list.length).padStart(3)} ids: ${list.join(' ').slice(0, 120)}`);
  void what;
}
console.log('categories per id:', [...categories.entries()].map(([id, c]) => `${id}:${c[0]}`).join(' '));

const seed = Number(arg('seed', wildernessSeed({ name: 'Daggerfall' })));
const drawn = generateWildernessIndices(seed, lists);
console.log(`\nseed ${seed} → the settlement's wilderness, category mix:`, drawn.counts);

// ── one window, as a picture ──────────────────────────────────────────────────
const at = arg('at', null);
const centre = at ? at.split(',').map(Number) : [CITY_ORIGIN + WILD_CHUNK, CITY_ORIGIN + WILD_CHUNK];
const origin = wildernessWindowOrigin(centre[0], centre[1]);
console.log(`window origin row ${origin.row}, col ${origin.col} `
  + `(blocks ${origin.row / WILD_CHUNK},${origin.col / WILD_CHUNK})`);

const window = await buildWildernessWindow({
  data, indices: drawn.indices, originRow: origin.row, originCol: origin.col,
});
const inf = await data.inf(wildernessInfName({ climate: 'temperate', weather: 'clear' }));
const level = decodeLevel(window.level, inf, { width: WILD_WINDOW, depth: WILD_WINDOW, mapType: 'wilderness' });
console.log(`blocks ${window.blocks.join(', ')}; missing ${window.missing.length ? window.missing.join(', ') : 'none'}`);
console.log('level stats:', JSON.stringify(level.stats), 'outdoors:', level.outdoors, 'layerCount:', level.layerCount);

if (flag('ascii')) {
  const glyph = (cell) => {
    if (cell.kind === 'entity') return '*';
    if (cell.kind === 'wall' || cell.kind === 'raised') return '#';
    if (cell.kind === 'edge') return '-';
    if (cell.kind === 'transparent') return '^';
    if (cell.kind === 'door') return 'D';
    if (cell.kind === 'diagonal') return '/';
    if (cell.floor.chasm === 'wet') return '~';
    return ' ';
  };
  console.log('  ' + '0123456789'.repeat(13).slice(0, WILD_WINDOW));
  for (let z = 0; z < level.depth; z++) {
    let s = '';
    for (let x = 0; x < level.width; x++) s += glyph(level.cells[z * level.width + x]);
    console.log(`${String(z).padStart(2)}${s}`);
  }
}
