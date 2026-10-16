// WHERE A DUNGEON'S DOOR IS, OUT IN THE COUNTRY.
//
// Arena puts a player back **on the surface at the dungeon's door** when they climb out, and
// the owner, 2026-10-16: *"STILL EXITING A DUNGEON JUST SHOWS YOU THE MAP NOT THE FUCKING
// WILDERNESS"*. This module is that door.
//
// What is known, and from where:
//
//   * a dungeon's record in `CITYDATA.64` carries a point on the world map (320×200 pixels,
//     `arena/cityDataFile.js` `WORLD_MAP_SIZE`) and a 32-bit seed (`cityDataSeeds.js`);
//   * the country around a settlement is a **64×64 grid of blocks** drawn from that
//     settlement's own wilderness seed, and the cells that draw the `dungeon` category are the
//     heavy ruins this install ships as `.RMD` records (`game/wilderness.js`
//     `generateWildernessIndices` / `classifyBlock` — 22 of the 66 scenery blocks are ruins);
//   * a wilderness cell is `blockRow * 64 … +63` by `blockCol * 64 … +63` (`buildWildernessWindow`
//     copies the four blocks of the window in that addressing).
//
// **RECONSTRUCTED** (`A.EXE` holds the original's own per-dungeon entrance coordinate, and this
// checkout has no `A.EXE` — see `docs/PORT_BLOCKS.md`, law 2): the ruin a dungeon's door stands
// in is drawn **once, from the dungeon's own seed** out of the country's ruin blocks, and the
// door is that block's own centre cell. So:
//
//   * the same dungeon always comes out in the same country, in the same ruin — a country the
//     player can walk back to, and walk back *in* from;
//   * two dungeons of one country take different ruins whenever that country has two, because
//     the draw is over the ruin list and the seeds differ;
//   * nothing about the country is invented: the ruin is one of the blocks the settlement's own
//     grid drew, and the world map's own `nearestSettlement` is still how "which country" is
//     answered (`questData.js`), the same rule fast travel uses.
//
// What this is *not*: a claim that the ruin block is the one the original used. It is a
// deterministic, walkable, honest answer to "where does this dungeon come out", stamped as this
// project's rule rather than presented as the original's.

import { ArenaRandom } from './arenaRandom.js';
import { WILD_CHUNK, WILD_GRID_HEIGHT, WILD_GRID_WIDTH } from './wilderness.js';

/**
 * Every block of a drawn wilderness grid whose category is `dungeon`, with the address of
 * each — the country's ruins.
 *
 * @param {string[]} categories  the grid's own category per block, row-major (`generateWildernessIndices`)
 * @returns {{blockRow: number, blockCol: number}[]}
 */
export function ruinBlocks(categories) {
  /** @type {{blockRow: number, blockCol: number}[]} */
  const out = [];
  if (!Array.isArray(categories)) return out;
  for (let blockRow = 0; blockRow < WILD_GRID_HEIGHT; blockRow++) {
    for (let blockCol = 0; blockCol < WILD_GRID_WIDTH; blockCol++) {
      if (categories[blockRow * WILD_GRID_WIDTH + blockCol] === 'dungeon') out.push({ blockRow, blockCol });
    }
  }
  return out;
}

/**
 * The ruin a dungeon's door is in: one draw from the dungeon's own seed over the country's
 * ruin blocks.
 *
 * The draw is the original's own generator (`ArenaRandom`), indexed by the low byte of one
 * 16-bit draw — the same shape `generateWildernessIndices` picks a block id with
 * (`(random.next() & 0xff) % list.length`), so the two draws are one habit rather than two.
 *
 * @param {string[]} categories
 * @param {number} dungeonSeed
 * @returns {{blockRow: number, blockCol: number, row: number, col: number, ruins: number}|null}
 *   the block and its centre **wilderness cell**, or null for a country with no ruins in it
 */
export function ruinBlockFor(categories, dungeonSeed) {
  const ruins = ruinBlocks(categories);
  if (!ruins.length) return null;
  const random = new ArenaRandom((Number(dungeonSeed) || 0) >>> 0);
  const pick = ruins[(random.next() & 0xff) % ruins.length];
  return {
    ...pick,
    // The door itself: the ruin's own centre cell. A block is 64×64 cells, so the centre is
    // `+32` on both axes, and a cell whose own geometry is a wall is repaired by the page that
    // builds the window (`interior.js`'s `standNear`, the same rule `?at=`/`?wild=` arrivals use).
    row: pick.blockRow * WILD_CHUNK + WILD_CHUNK / 2,
    col: pick.blockCol * WILD_CHUNK + WILD_CHUNK / 2,
    ruins: ruins.length,
  };
}

/**
 * **Which country a dungeon stands in**: the settlement whose own wilderness seed is nearest to
 * the dungeon's world-map pixel.
 *
 * `questData.js`'s `nearestSettlement` answers the same question for a traveller and is the rule
 * this follows — *"you fast-travel to the nearest town and walk from there"* — with one addition:
 * a settlement with no wilderness seed (the Imperial Palace, which is a `palace` record and not a
 * country's centre) cannot hold a ruin, so it is skipped rather than answered with.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {{x: number, y: number}} point  a world-map pixel
 * @returns {object|null} the settlement's own record (with `wildernessSeed`), or null
 */
export function nearestCountry(world, point) {
  if (!world || !point) return null;
  let best = null;
  for (const settlement of world.settlements()) {
    if (settlement.wildernessSeed == null) continue;
    const distance = Math.hypot(settlement.global.x - point.x, settlement.global.y - point.y);
    if (!best || distance < best.distance) best = { settlement, distance };
  }
  return best?.settlement ?? null;
}

/**
 * The whole answer for one dungeon: the country it stands in, the ruin block its door is in, and
 * the wilderness cell of that door.
 *
 * @param {object} opts
 * @param {import('./worldMap.js').WorldMap} opts.world
 * @param {object} opts.place                    a dungeon record (`global`, `dungeonSeed`)
 * @param {string[]} opts.categories             the country's drawn block categories
 * @returns {{settlement: object, seed: number, block: {blockRow: number, blockCol: number}, cell: {row: number, col: number}, ruins: number}|null}
 */
export function dungeonSurface(opts) {
  const { world, place, categories } = opts;
  if (!place?.global) return null;
  const settlement = nearestCountry(world, place.global);
  if (!settlement) return null;
  const ruin = ruinBlockFor(categories, place.dungeonSeed ?? 0);
  if (!ruin) return null;
  return {
    settlement,
    seed: settlement.wildernessSeed >>> 0,
    block: { blockRow: ruin.blockRow, blockCol: ruin.blockCol },
    cell: { row: ruin.row, col: ruin.col },
    ruins: ruin.ruins,
  };
}
