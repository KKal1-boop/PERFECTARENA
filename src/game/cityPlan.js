// CITY ASSEMBLY — THE OTHER HALF OF ARENA'S CITIES.
//
// `tables/cityBlocks.js` holds the numbers; this holds the algorithm. A city is a
// skeleton `.MIF` (ground, wall ring, gates, water) plus a
// `blocksPerSide × blocksPerSide` grid of 20×20-cell block `.MIF`s stamped into the
// middle of it, with each slot's contents drawn from a seeded RNG.
//
// The order of RNG draws is what makes a seed produce *the game's* city, so the
// draw order is reproduced draw for draw from the original's algorithm — including
// the rejection sampling that picks a slot, which means a slot that is already
// taken still consumes a draw. Any deviation shifts every later draw and the city
// becomes a different (valid-looking, wrong) city. `tests/unit/city.test.mjs`
// pins this by building the same city twice and by checking the plan's shape.
//
// What is *not* reproduced: the skeleton's block-grid start position and the
// reserved-slot list, which live in `A.EXE` (docs/DECISIONS.md D11). The start is
// reconstructed from the skeleton's wall ring, and the reserved list is measured
// from the skeleton itself — a slot whose cells already hold structure is kept
// rather than paved over. Both say what they are in `tables/cityBlocks.js`'s
// `SOURCE`, and neither invents structures the data does not contain.

import { ArenaRandom } from './arenaRandom.js';
import {
  BLOCK_TYPE, CITY_BLOCK_SIZE, blockMifName, blockStartPosition, randomBlockType,
} from './tables/cityBlocks.js';

/**
 * @typedef {object} CitySlot
 * @property {number} index  slot index in the row-major grid
 * @property {number} row
 * @property {number} col
 * @property {number} type   a `BLOCK_TYPE`
 * @property {string|null} mif  the block `.MIF` name, or null when reserved
 */

/**
 * Decide what goes in every slot of the city grid.
 *
 * The original's fixed opening move is kept: one each of equipment, mages guild,
 * noble house, temple, tavern and a spacer, placed in that order, before the rest
 * of the plan is filled at `randomBlockType`'s distribution. A settlement must
 * always have somewhere to buy a sword and somewhere to sleep.
 *
 * @param {{blocksPerSide: number, seed: number, reservedBlocks?: number[]}} opts
 * @returns {{plan: number[], slots: CitySlot[], seed: number, endSeed: number}}
 */
export function planCity(opts) {
  const { blocksPerSide, seed, reservedBlocks = [] } = opts;
  const slotCount = blocksPerSide * blocksPerSide;
  /** @type {number[]} */
  const plan = new Array(slotCount).fill(BLOCK_TYPE.EMPTY);
  const random = new ArenaRandom(seed);

  /**
   * Draw a slot index until an empty one comes up — the original's `do/while`,
   * which is why a crowded plan consumes an unpredictable number of draws.
   * @param {number} blockType
   */
  const placeBlock = (blockType) => {
    let index;
    let guard = 0;
    do {
      index = random.next() % slotCount;
    } while (plan[index] !== BLOCK_TYPE.EMPTY && guard++ < 64);
    if (plan[index] !== BLOCK_TYPE.EMPTY) return;   // only reachable on a 1-slot plan
    plan[index] = blockType;
  };

  for (const reserved of reservedBlocks) {
    if (reserved >= 0 && reserved < slotCount) plan[reserved] = BLOCK_TYPE.RESERVED;
  }

  // The settlement's guarantees, in the original's order.
  placeBlock(BLOCK_TYPE.EQUIPMENT);
  placeBlock(BLOCK_TYPE.MAGES_GUILD);
  placeBlock(BLOCK_TYPE.NOBLE_HOUSE);
  placeBlock(BLOCK_TYPE.TEMPLE);
  placeBlock(BLOCK_TYPE.TAVERN);
  placeBlock(BLOCK_TYPE.SPACER);

  // Then the rest of the plan, in the original's distribution.
  let empty = plan.filter((t) => t === BLOCK_TYPE.EMPTY).length;
  while (empty-- > 0) placeBlock(randomBlockType(random));

  // Blocks are stamped right to left, top to bottom, and each block's `.MIF` name
  // is drawn as it is stamped — not up front — so the name draws interleave with
  // nothing here but are still in slot order.
  /** @type {CitySlot[]} */
  const slots = [];
  let col = 0;
  let row = 0;
  for (let index = 0; index < plan.length; index++) {
    const type = plan[index];
    const reserved = type === BLOCK_TYPE.RESERVED;
    slots.push({
      index, row, col, type,
      mif: reserved || type === BLOCK_TYPE.EMPTY ? null : blockMifName(type, random),
    });
    if (++col === blocksPerSide) { col = 0; row++; }
  }

  return { plan, slots, seed, endSeed: random.getSeed() };
}

/**
 * Which slots already hold structure in the skeleton.
 *
 * **RECONSTRUCTED** (see this file's header). The original keeps this list in
 * `A.EXE`; measuring it from the skeleton is the closest honest substitute —
 * a block is meant to fill empty ground, so a slot the skeleton has already built
 * on must be kept, or the stamp would wall over the city's own gates, bridges and
 * wall ring from the inside.
 *
 * Structure means a `MAP1` voxel that carries *geometry* — a wall, raised
 * platform, door, edge, arch or diagonal — or a chasm floor (`FLOR`'s high byte
 * 0xC/0xD/0xE), which is how the shipped skeletons mark water.
 *
 * Entity voxels (nibble `0x8`) deliberately do **not** count. They are flats
 * laid on the street, and treating them as structure is not a harmless
 * over-caution: six of the shipped skeletons are completely bare inside their
 * grid area, and `CITY1.MIF` holds nothing there but *ten* scattered flats, so
 * counting them reserved five of the city's thirty-six blocks for two street
 * decorations each. Measured by `tools/city-dump.mjs --slots`; `CITY2.MIF` is the
 * skeleton that really does have structure inside its grid (74 voxels).
 *
 * @param {{flor: Uint16Array, map1: Uint16Array}|null} level
 * @param {{blocksPerSide: number, start: {x: number, z: number}, width: number, depth: number}} opts
 * @returns {number[]} slot indices
 */
export function detectReservedBlocks(level, opts) {
  const { blocksPerSide, start, width, depth } = opts;
  const reserved = [];
  if (!level?.map1) return reserved;

  for (let row = 0; row < blocksPerSide; row++) {
    for (let col = 0; col < blocksPerSide; col++) {
      const x0 = start.x + col * CITY_BLOCK_SIZE;
      const z0 = start.z + row * CITY_BLOCK_SIZE;
      let found = false;
      for (let z = z0; z < z0 + CITY_BLOCK_SIZE && z < depth && !found; z++) {
        for (let x = x0; x < x0 + CITY_BLOCK_SIZE && x < width; x++) {
          const i = z * width + x;
          const voxel = level.map1[i];
          const isEntity = (voxel & 0xf000) === 0x8000;
          const floorIsChasm = level.flor && ((level.flor[i] & 0xff00) >> 8) >= 0x0c
            && ((level.flor[i] & 0xff00) >> 8) <= 0x0e;
          if ((voxel !== 0 && !isEntity) || floorIsChasm) { found = true; break; }
        }
      }
      if (found) reserved.push(row * blocksPerSide + col);
    }
  }
  return reserved;
}

/**
 * Assemble a city: stamp the plan's blocks into a copy of the skeleton's voxels.
 *
 * The result is a *synthetic* `.MIF` level — the same shape `arena/mifFile.js`
 * produces, so the existing decoder, mesher and collider need nothing new. Its
 * `info` is deliberately left empty: a city's textures come from the location's
 * own `.INF` (`tables/cityBlocks.js`'s `cityInfName`), not from the map, which is
 * exactly why a bare skeleton cannot be drawn at all.
 *
 * @param {object} opts
 * @param {import('../arena/arenaData.js').ArenaData} opts.data
 * @param {import('../arena/mifFile.js').MifFile} opts.mif        the skeleton
 * @param {number} opts.blocksPerSide
 * @param {number} opts.seed
 * @param {{x: number, z: number}} [opts.start]                   default: centred
 * @param {number[]} [opts.reserved]                              default: measured
 * @param {(msg: string) => void} [opts.onWarn]
 * @returns {Promise<{level: object, plan: number[], slots: CitySlot[], reserved: number[], start: {x: number, z: number}, missing: string[], stats: Record<string, number>}>}
 */
export async function buildCityLevel(opts) {
  const { data, mif, blocksPerSide, seed, onWarn = () => {} } = opts;
  const skeleton = mif.levels[0];
  if (!skeleton?.map1) throw new Error('buildCityLevel needs a skeleton with MAP1');

  const width = mif.width;
  const depth = mif.height;
  const start = opts.start ?? blockStartPosition(width, depth, blocksPerSide);
  const reserved = opts.reserved ?? detectReservedBlocks(skeleton, { blocksPerSide, start, width, depth });

  // The skeleton, copied: a city always has its ground and its walls, even if
  // every slot ends up reserved.
  const flor = Uint16Array.from(skeleton.flor ?? new Uint16Array(width * depth));
  const map1 = Uint16Array.from(skeleton.map1);
  const map2 = Uint16Array.from(skeleton.map2 ?? new Uint16Array(width * depth));

  const { plan, slots } = planCity({ blocksPerSide, seed, reservedBlocks: reserved });

  /** @type {string[]} */
  const missing = [];
  /** @type {Map<string, {flor: Uint16Array, map1: Uint16Array, map2: Uint16Array, width: number, depth: number}>} */
  const cache = new Map();
  const stats = { stamped: 0, skipped: 0, cells: 0 };

  for (const slot of slots) {
    if (!slot.mif) continue;
    let block = cache.get(slot.mif);
    if (!block) {
      let blockMif;
      try {
        blockMif = await data.mif(slot.mif);
      } catch {
        missing.push(slot.mif);
        onWarn(`city block "${slot.mif}" is not in this Arena install; slot left empty`);
        stats.skipped++;
        continue;
      }
      const level = blockMif.levels[0];
      block = {
        flor: Uint16Array.from(level.flor ?? new Uint16Array(blockMif.width * blockMif.height)),
        map1: Uint16Array.from(level.map1),
        map2: Uint16Array.from(level.map2 ?? new Uint16Array(blockMif.width * blockMif.height)),
        width: blockMif.width,
        depth: blockMif.height,
      };
      cache.set(slot.mif, block);
    }

    // Stamp it. Blocks are 20×20 by construction, but the copy is bounded by the
    // skeleton anyway: a short block must not shift the grid, and a long one must
    // not run off the edge.
    const x0 = start.x + slot.col * CITY_BLOCK_SIZE;
    const z0 = start.z + slot.row * CITY_BLOCK_SIZE;
    for (let z = 0; z < block.depth; z++) {
      const dz = z0 + z;
      if (dz < 0 || dz >= depth) continue;
      for (let x = 0; x < block.width; x++) {
        const dx = x0 + x;
        if (dx < 0 || dx >= width) continue;
        const src = z * block.width + x;
        const dst = dz * width + dx;
        flor[dst] = block.flor[src];
        map1[dst] = block.map1[src];
        map2[dst] = block.map2[src];
        stats.cells++;
      }
    }
    stats.stamped++;
  }

  const level = {
    name: skeleton.name ?? '',
    info: '',                       // a city's INF comes from the location, not the map
    numf: skeleton.numf ?? 0,
    // **The assembled level carries its own size.** The skeleton's planes do
    // (`mif.levels[0]` has no width either — the `.MIF` header does), but everything
    // that reads a level's planes *back* indexes them `row * width + col`, and the
    // wilderness does exactly that: `reviseCityQuarter` reads the live city to build
    // the settlement's quarter of the country, and without these two fields its index
    // came out `NaN`, every lookup `undefined`, and the quarter was written **empty** —
    // so the country outside a city had no wall in it at all: walk out of the gate and
    // the settlement vanished behind you. Caught by standing in `TOWN1`'s gate, walking
    // into the wilds and finding grass where the wall should be.
    width, depth,
    flor, map1, map2,
    flat: skeleton.flat ?? null,
    inns: skeleton.inns ?? null,
    loot: skeleton.loot ?? null,
    stor: skeleton.stor ?? null,
    targ: skeleton.targ ?? [],
    lock: skeleton.lock ?? [],
    trig: skeleton.trig ?? [],
    startPoints: skeleton.startPoints ?? mif.startPoints ?? [],
    warnings: [...(skeleton.warnings ?? [])],
  };

  return { level, plan, slots, reserved, start, missing, stats };
}
