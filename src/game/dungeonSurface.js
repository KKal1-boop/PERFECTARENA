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
 * How far out from a ruin's door the ruin itself is measured, in cells — see `ruinDoorStand`.
 *
 * A block is 64 cells wide and a ruin is a building in it, so 24 cells (three eighths of a block)
 * reaches past every wall this install's records put up while staying inside the ruin's own block:
 * the reading is "is there ruin down this way", not "how big is the block".
 */
export const HORIZON = 24;

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
 * **A ruin's own door**, and where the player stands when they come up out of it.
 *
 * The owner, 2026-10-16, on the exit this module exists for: *"when you exit a dungeon and go
 * into the wilderness you exit a building not a png with a dungeon entrace like normal arena"* —
 * and the report is exact about what was wrong. `ruinBlockFor` above answers *which block* of the
 * country the door is in, and the exit stood the player on that block's **centre cell**. A block
 * is 64×64 cells (4 096 of them), so its centre is as likely to be open country, a lake or a
 * stand of trees as the doorway: measured on Daggerfall's own country, the ruin the dungeon came
 * out of had its centre on clear ground with the structure nowhere in sight, and the player was
 * left standing in a field with no way to tell where they had come from.
 *
 * So the arrival is the door itself, and the door is a reading of the block's own cells:
 *
 *   * **the door** is the ruin's own **arch** — the `0x9` voxel, the doorway the game draws with
 *     its gateway art and the one `scenes/interior.js` reads a settlement's gate with — nearest
 *     the block's centre. A ruin with no arch in it (plenty of the install's `.RMD`s are
 *     colonnades and grave-fields) falls back to the **built cell nearest the centre**, which is
 *     the structure's own nearest wall;
 *   * **the stand** is a few cells out along the door's **open side** — the direction with the
 *     least ruin in it over `HORIZON` cells, and open ground at the door — so the player is
 *     outside the structure, on open ground, with the wall they came through in front of them
 *     rather than behind them or inside a courtyard;
 *   * **the facing** looks back at the door, so the way down is the first thing they see.
 *
 * Block-local cells (`0…quarter*2-1`) are what the callbacks are asked about; the caller owns the
 * block's own offset into the window, and a cell of a block 64 wide is at `blockRow * 64 + row`.
 *
 * **RECONSTRUCTED** like the rest of this module (`A.EXE` holds the original's own entrance
 * coordinates and is not in this checkout, `docs/PORT_BLOCKS.md` law 2): the arch-near-the-centre
 * rule is this project's, and what it promises is only what the records can promise — the same
 * door every time, reached by every dungeon whose seed draws this ruin.
 *
 * @param {object} opts
 * @param {number} [opts.quarter]  half a block, in cells (default `WILD_CHUNK / 2`)
 * @param {(row: number, col: number) => boolean} opts.walkableAt  the cell can be stood on
 * @param {(row: number, col: number) => boolean} [opts.archAt]    the cell is a doorway/arch
 * @param {number} [opts.reach]    how far out to walk from the door before giving up (default 6)
 * @param {number} [opts.horizon]  how far out the ruin is measured (default 24)
 * @returns {{door: {row: number, col: number}, stand: {row: number, col: number}, yaw: number, open: number, built: number, arch: boolean}|null}
 */
export function ruinDoorStand(opts) {
  const { walkableAt, archAt = null, reach = 6, horizon = HORIZON } = opts;
  const quarter = opts.quarter ?? WILD_CHUNK / 2;
  const size = quarter * 2;
  if (typeof walkableAt !== 'function') return null;

  // The nearest cell of a set to the block's own centre, ties broken by address so the answer is
  // the same on every machine and in every visit.
  const nearestToCentre = (test) => {
    let best = null;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (!test(row, col)) continue;
        const distance = (row - quarter) ** 2 + (col - quarter) ** 2;
        if (!best || distance < best.distance
          || (distance === best.distance && (row < best.row || (row === best.row && col < best.col)))) {
          best = { row, col, distance };
        }
      }
    }
    return best;
  };

  const arch = typeof archAt === 'function' ? nearestToCentre(archAt) : null;
  const door = arch ?? nearestToCentre((row, col) => !walkableAt(row, col));
  if (!door) return null;

  // **Which side is the outside.** Two readings per axis, and the answer is neither of them on its
  // own: how far the ground runs **from the door** (`open`, what a stand cell needs) and how much
  // of the ruin stands within `horizon` cells of it (`built`). The ruins this install ships are
  // buildings with courtyards, so a door's two sides are often *both* open at the door — the
  // courtyard on one hand and the country on the other — and the courtyard is the one with more
  // structure beyond it. So: the least ruin, then the longest run.
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null;
  for (const [dRow, dCol] of sides) {
    let open = 0;
    let running = true;
    let built = 0;
    for (let step = 1; step <= horizon; step++) {
      const row = door.row + dRow * step;
      const col = door.col + dCol * step;
      if (row < 0 || col < 0 || row >= size || col >= size) break;
      const walkable = walkableAt(row, col);
      if (!walkable) built++;
      if (running && walkable) open = step;
      else running = false;
    }
    if (!open) continue;
    if (!best || built < best.built || (built === best.built && open > best.open)) best = { dRow, dCol, open, built };
  }
  if (!best?.open) return null;

  // A few paces out at most: far enough to see the door whole, close enough that walking back in
  // is a step rather than a search.
  const steps = Math.max(1, Math.min(best.open, reach, 3));
  const stand = { row: door.row + best.dRow * steps, col: door.col + best.dCol * steps };
  // `openYaw`'s own table: yaw 0 faces the column axis (+col), +π/2 faces +row. So a direction
  // (dRow, dCol) is `atan2(dRow, dCol)` and facing *back* at the door is the negative of it.
  return {
    door: { row: door.row, col: door.col },
    stand,
    yaw: Math.atan2(-best.dRow, -best.dCol),
    open: best.open,
    built: best.built,
    arch: Boolean(arch),
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
