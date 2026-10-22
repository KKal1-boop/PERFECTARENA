// THE WILDERNESS — THE LAND OUTSIDE THE WALLS.
//
// Every Arena settlement sits in the middle of a wilderness: a **64×64 grid of
// blocks**, each block 64×64 cells, so 4 096×4 096 cells of country with the
// settlement occupying the middle 2×2 blocks. This module is the model of that
// place — which block goes where, what the settlement's own quarters look like
// from outside, and how a window of it is assembled into a level the renderer and
// the decoder already understand.
//
// The three things it knows, and where each was verified:
//
// 1. **The block planes** are `arena/rmdFile.js`: `.RMD` is three 64×64 voxel
//    layers with no header — the same layers a `.MIF` level carries, so
//    `game/mifLevel.js` decodes a wilderness block with no new rules.
//
// 2. **The grid draw** is the original's, ported line for line from
//    `ArenaWildUtils::generateWildernessIndices`: one `ArenaRandom(wildSeed)` per
//    settlement, one 16-bit draw to choose a *category* against the four fixed
//    thresholds, one more draw to pick an entry from that category's list, and
//    then the settlement's own four blocks written over the middle 2×2 —
//    `(31,31)=1`, `(32,31)=2`, `(31,32)=3`, `(32,32)=4`.
//
//    **What is reconstructed** (and why): the five *lists* themselves live in
//    `A.EXE`, which this data set does not have (`docs/DECISIONS.md` D5/D11) — only
//    its offsets for a *decompressed* v1.06 are documented, and `ACD.EXE` here is
//    PKLITE-packed. So the categories are **measured from the blocks themselves**:
//    `classifyBlock` grades a block by how much *structure* its own voxels hold
//    (edge, arch and wall cells), which is what separates open country from a
//    lone tavern from a crypt with towers. The category thresholds — the part that
//    decides how *often* each kind is drawn — are the original's own numbers, so
//    the wilderness is mostly open country with structures the exception.
//
// 3. **The settlement's quarters** are not read from the shipped `WILD001`…`004`
//    at all: the original *revises the live city* into them. `reviseCityQuarter`
//    is `ArenaWildUtils::reviseWildCityBlock` ported exactly — everything that is
//    not one of the city's three wall ids is cleared, those three are remapped,
//    and `MAP2` becomes the wall's own top surface — which is why a city seen from
//    the wilderness is its **wall ring and its gates**, and why the shipped
//    `WILD001`…`004` records themselves contain nothing but wall cells. (Measured:
//    `WILD001`'s wall cells lie on its top row and left column, `WILD003`'s on its
//    left column and bottom row, `WILD004`'s on its bottom row and right column —
//    four corners of one walled city, cut into 64-cell pieces.)
//
// The window. The original keeps a **2×2-block window** of the wilderness around
// the player and re-centres it a block at a time as the player moves
// (`ArenaWildUtils::getCenteredWildOrigin`: `((max(voxel - 32, 0) / 64) * 64)`,
// which holds the player inside the middle 64-cell band). Because the window is
// block-aligned it is always exactly four whole blocks, and when it is centred on
// the settlement it is exactly the settlement's own 128×128 grid — one coordinate
// system for both places, so walking through a gate is a change of *scene*, not of
// position.
//
// See docs/FORMATS.md §7.

import { RMD_WIDTH, RMD_HEIGHT, isWildCityBlock, rmdName } from '../arena/rmdFile.js';
import { ArenaRandom } from './arenaRandom.js';

/** Blocks across the wilderness grid (`ArenaWildUtils::WILD_WIDTH`). */
export const WILD_GRID_WIDTH = 64;
/** Blocks down the wilderness grid. */
export const WILD_GRID_HEIGHT = 64;
/** Cells across one block. */
export const WILD_CHUNK = 64;
/** Cells across the window the game keeps around the player: 2×2 blocks. */
export const WILD_WINDOW = WILD_CHUNK * 2;

/** The grid cell the settlement's top-left block sits in. */
const CITY_BLOCK_X = WILD_GRID_WIDTH / 2 - 1;
const CITY_BLOCK_Z = WILD_GRID_HEIGHT / 2 - 1;

/**
 * Where the settlement's own 128×128 cells begin, in wilderness coordinates.
 * A city cell `(row, col)` is the wilderness cell `(row + CITY_ORIGIN, col + CITY_ORIGIN)`.
 *
 * Wilderness cells are named as the rest of the game names them: a level's `row` is
 * world X and its `col` is world Z (`game/mifMesh.js`), and an `.RMD` plane is
 * row-major exactly like a `.MIF` plane.
 */
export const CITY_ORIGIN = CITY_BLOCK_X * WILD_CHUNK;

/** How thick the settlement's perimeter wall ring is, in cells. */
/**
 * How thick the settlement's perimeter wall is, in cells: **one**.
 *
 * Measured on every shipped skeleton — the wall stands on row 0, row `depth−1`, col 0 and
 * col `width−1` and nowhere else, and the same is true of the `WILD001`…`004` records
 * (`WILD001`'s wall cells lie on its top row and left column, `WILD003`'s on its left
 * column and bottom row). The first version of this held 2, which made the ring the street
 * inside the wall as well, and every gate test built on it was a cell out.
 */
export const CITY_RING = 1;

/**
 * The four category thresholds, in the original's order
 * (`ArenaWildUtils::generateWildernessIndices`), compared against a 16-bit draw.
 */
export const CATEGORY_THRESHOLDS = Object.freeze([
  ['normal', 0x6666],
  ['village', 0x4000],
  ['dungeon', 0x2666],
  ['tavern', 0x1999],
  ['temple', Infinity],
]);

/** A block's measured character. @typedef {'normal'|'village'|'tavern'|'dungeon'|'temple'} WildCategory */

/**
 * The four quarters of the settlement, in the block grid.
 * @type {Readonly<Record<number, {bx: number, bz: number}>>}
 */
export const CITY_QUARTER_BLOCKS = Object.freeze({
  1: { bx: CITY_BLOCK_X, bz: CITY_BLOCK_Z },
  2: { bx: CITY_BLOCK_X + 1, bz: CITY_BLOCK_Z },
  3: { bx: CITY_BLOCK_X, bz: CITY_BLOCK_Z + 1 },
  4: { bx: CITY_BLOCK_X + 1, bz: CITY_BLOCK_Z + 1 },
});

/**
 * Draw the wilderness's 64×64 grid of block ids from a settlement's seed.
 *
 * Draw-for-draw the original: a category is chosen against four fixed thresholds,
 * a second draw indexes that category's list, and every grid entry consumes exactly
 * two draws whether or not it is later overwritten.
 *
 * @param {number} seed              the settlement's wilderness seed
 * @param {Record<string, number[]>} lists  block ids per category
 * @returns {{indices: Uint8Array, categories: string[], counts: Record<string, number>}} 64×64, row-major
 */
export function generateWildernessIndices(seed, lists) {
  const random = new ArenaRandom(seed >>> 0);
  const indices = new Uint8Array(WILD_GRID_WIDTH * WILD_GRID_HEIGHT);
  /** @type {string[]} */
  const categories = new Array(indices.length);
  /** @type {Record<string, number>} */
  const counts = {};

  for (let i = 0; i < indices.length; i++) {
    const category = drawCategory(random.next());
    const list = lists[category]?.length ? lists[category] : lists.normal;
    const id = list[(random.next() & 0xff) % list.length];
    indices[i] = id;
    categories[i] = category;
    counts[category] = (counts[category] ?? 0) + 1;
  }

  // The settlement's own four blocks, written over the middle 2×2. This is what
  // makes the grid's centre the place the player is standing in.
  for (const [id, at] of Object.entries(CITY_QUARTER_BLOCKS)) {
    indices[at.bz * WILD_GRID_WIDTH + at.bx] = Number(id);
  }

  return { indices, categories, counts };
}

/**
 * Which category a 16-bit draw asks for.
 * @param {number} draw  0…65535
 * @returns {WildCategory}
 */
export function drawCategory(draw) {
  let left = draw;
  for (const [category, threshold] of CATEGORY_THRESHOLDS) {
    if (left < threshold) return /** @type {WildCategory} */ (category);
    left -= threshold;
  }
  return 'temple';
}

/**
 * The wilderness `.INF` for a climate and weather. The climate may describe the ground or the
 * scenery; `wildernessInfNames` combines the two when a province needs them to differ.
 *
 * `<climate><W><weather>.INF`: `T`emperate / `D`esert / `M`ountain, `W` for
 * wilderness, `N` clear / `R` overcast or rain / `S` snow — and a desert has no
 * snow, so snow falls back to clear, exactly as the original does.
 *
 * @param {{climate?: string, weather?: string}} opts
 * @returns {string}
 */
export function wildernessInfName(opts = {}) {
  const climate = String(opts.climate ?? 'temperate').toLowerCase()[0]?.toUpperCase() ?? 'T';
  const letter = climate === 'D' || climate === 'M' ? climate : 'T';
  let weather = String(opts.weather ?? 'clear').toLowerCase()[0]?.toUpperCase() ?? 'N';
  if (weather === 'O' || weather === 'R') weather = 'R';
  if (weather !== 'R' && weather !== 'S') weather = 'N';
  if (letter === 'D' && weather === 'S') weather = 'N';
  return `${letter}W${weather}.INF`;
}

/**
 * The scenery INF and, when needed, the separate ground INF for a wilderness window.
 *
 * Arena uses one wilderness `.INF` for both floors and scenery. To keep a country's ground while
 * borrowing another climate's trees, build the level with the scenery INF and merge the ground
 * INF's `@FLOORS` table into it with `withGroundFloors`.
 *
 * @param {{ground?: string, scenery?: string, weather?: string}} opts
 * @returns {{infName: string, groundInfName: string|null}}
 */
export function wildernessInfNames(opts = {}) {
  const { ground = 'temperate', scenery = ground, weather = 'clear' } = opts;
  const infName = wildernessInfName({ climate: scenery, weather });
  if (scenery === ground) return { infName, groundInfName: null };
  return { infName, groundInfName: wildernessInfName({ climate: ground, weather }) };
}

/**
 * The structure in a block: how many cells carry geometry rather than scenery.
 *
 * Edges (fences, towers, signposts — nibble `0xA`), arches (`0x9`) and solid walls
 * are what make a place a *place*; an entity flat (`0x8`) is a tree, a rock or a
 * bush lying on the ground, so it is counted separately.
 *
 * @param {{map1: Uint16Array}} block
 * @returns {{structure: number, edges: number, arches: number, walls: number, entities: number, water: number}}
 */
export function blockStructure(block) {
  let structure = 0;
  let edges = 0;
  let arches = 0;
  let walls = 0;
  let entities = 0;
  let water = 0;
  const map1 = block.map1 ?? new Uint16Array(0);
  for (let i = 0; i < map1.length; i++) {
    const id = map1[i];
    if (!id) continue;
    const nibble = (id & 0xf000) >> 12;
    if (nibble === 0x8) { entities++; continue; }
    if (nibble === 0x9) arches++;
    else if (nibble === 0xa) edges++;
    else walls++;
    structure++;
  }
  const flor = block.flor;
  if (flor) for (let i = 0; i < flor.length; i++) if (((flor[i] & 0xff00) >> 8) === 0x0d) water++;
  return { structure, edges, arches, walls, entities, water };
}

/**
 * Grade a wilderness block by what its own voxels hold.
 *
 * **RECONSTRUCTED** (`A.EXE`'s category lists are not in this data set): the rule is
 * one sentence per category, every threshold is in *cells of structure* (which
 * `blockStructure` counts), and the cuts were chosen against the install's own
 * distribution — measured across all 66 scenery blocks, structure runs
 * `0 ×9, 10, 25 | 33…97 | 105…166 | 204…1 194`, so these cuts put 11 blocks in open
 * country, 16 in villages, 15 in buildings and 22 in the ruins, rather than leaving
 * one category with two entries that the grid would then draw 25% of the time.
 *
 * Order matters — the first match wins, so a colonnade is a temple even when its
 * footprint is crypt-sized.
 *
 * * **temple** — has a colonnade: 20 or more arch (`0x9`) cells (4 blocks).
 * * **dungeon** — the heavy footprints: 200 or more structure cells (22 blocks).
 * * **tavern** — a building: 100…199 structure cells (15 blocks).
 * * **village** — a small building: 30…99 structure cells (16 blocks).
 * * **normal** — open country: under 30 structure cells (11 blocks: nine with
 *   nothing built on them at all, plus one fen with a lone post and one with a
 *   single ruin).
 *
 * @param {{map1: Uint16Array, flor: Uint16Array}} block
 * @returns {WildCategory}
 */
export function classifyBlock(block) {
  const { structure, arches } = blockStructure(block);
  if (arches >= 20) return 'temple';
  if (structure >= 200) return 'dungeon';
  if (structure >= 100) return 'tavern';
  if (structure >= 30) return 'village';
  return 'normal';
}

/**
 * Build the five category lists from the blocks an install ships.
 *
 * @param {Map<number, {map1: Uint16Array, flor: Uint16Array}>} blocks  id → decoded block
 * @returns {{lists: Record<string, number[]>, categories: Map<number, WildCategory>, ids: number[]}}
 */
export function wildernessBlockLists(blocks) {
  /** @type {Record<string, number[]>} */
  const lists = { normal: [], village: [], tavern: [], dungeon: [], temple: [] };
  /** @type {Map<number, WildCategory>} */
  const categories = new Map();
  const ids = [...blocks.keys()].filter((id) => !isWildCityBlock(id)).sort((a, b) => a - b);
  for (const id of ids) {
    const category = classifyBlock(blocks.get(id));
    categories.set(id, category);
    lists[category].push(id);
  }
  // Every category must be drawable: a list the archive cannot fill falls back to
  // open country rather than to a block that would be empty, which would leave a
  // hole in the map.
  for (const key of Object.keys(lists)) {
    if (!lists[key].length && lists.normal.length) lists[key] = [...lists.normal];
  }
  return { lists, categories, ids };
}

/**
 * The block id that means **the sea** — a block this project makes rather than reads.
 *
 * `TERRAIN.IMG`'s own coastline is the country's coastline (see `game/tamrielGrid.js`), and no
 * shipped `.RMD` is open water, so a pixel the map paints as sea is built from
 * `seaBlockPlanes` instead of from an archive record.
 */
export const SEA_BLOCK_ID = -1;

/**
 * **The sea, as a block of country.**
 *
 * Every cell is a **wet chasm** — `mifLevel.js`'s own `CHASM_WET` (the flor word's high byte),
 * which the decoder turns into `floor.chasm = 'wet'`, which is exactly the state Arena's water is
 * in: not walkable ground, drawn by the engine's own water pass with the install's own
 * `WATERANI.RCI` field (`game/chasmSurface.js`), and crossable only at the engine's swim speed.
 * Nothing is invented: the sea is the one thing in this world that has no `MAP1` at all.
 *
 * @returns {{flor: Uint16Array, map1: Uint16Array, map2: Uint16Array}}
 */
export function seaBlockPlanes() {
  const flor = new Uint16Array(WILD_CHUNK * WILD_CHUNK).fill(SEA_FLOR);
  return { flor, map1: new Uint16Array(WILD_CHUNK * WILD_CHUNK), map2: new Uint16Array(WILD_CHUNK * WILD_CHUNK) };
}

/** A flor word that is wet water and nothing on it: `CHASM_WET << 8`, flat 0. */
const SEA_FLOR = 0x0d00;

/**
 * Copy a settlement's own level into a block of the world's country — **wherever the settlement
 * stands**.
 *
 * `ArenaWildUtils::reviseWildCityBlock`, exactly: the city's cells are cleared
 * except its three wall ids, `0x2F2F → 0x3030`, `0x2D2D → 0x2F2F`, `0x2E2E` kept,
 * each surviving wall given `MAP2 = 0x3030 | (map2 & 0x8080)` — the wall's own top
 * surface, with the original's height bits preserved. Anything with `0x8000` set
 * (an entity, an arch, a door) is cleared first, which is why a city seen from
 * outside is its wall ring and nothing else.
 *
 * **The original cuts the city into four `WILD_CHUNK` quarters because its own grid is built
 * around the city**; the world grid (`game/tamrielGrid.js`) cannot, because a town is 106 cells
 * and a city is 127 and neither is a multiple of the block. So this takes the block's own place in
 * the world (`blockRow`,`blockCol`) and the settlement's own corner in it (`cityRow0`,`cityCol0`)
 * and copies the **intersection**: cells of the block the city does not reach are left as open
 * country, which is the clearing every settlement stands in.
 *
 * @param {{map1: Uint16Array, map2: Uint16Array, flor: Uint16Array, width: number, depth: number}} city
 * @param {object} opts
 * @param {number} opts.blockRow @param {number} opts.blockCol  the block's own place, in blocks
 * @param {number} opts.cityRow0 @param {number} opts.cityCol0  the city's own corner, in world cells
 * @returns {{flor: Uint16Array, map1: Uint16Array, map2: Uint16Array}}
 */
export function reviseCityInto(city, opts) {
  const { blockRow = 0, blockCol = 0, cityRow0 = 0, cityCol0 = 0 } = opts ?? {};
  const flor = new Uint16Array(WILD_CHUNK * WILD_CHUNK);
  const map1 = new Uint16Array(WILD_CHUNK * WILD_CHUNK);
  const map2 = new Uint16Array(WILD_CHUNK * WILD_CHUNK);
  const worldRow0 = blockRow * WILD_CHUNK;
  const worldCol0 = blockCol * WILD_CHUNK;

  for (let z = 0; z < WILD_CHUNK; z++) {
    const cityZ = worldRow0 + z - cityRow0;
    if (cityZ < 0 || cityZ >= city.depth) continue;
    for (let x = 0; x < WILD_CHUNK; x++) {
      const cityX = worldCol0 + x - cityCol0;
      if (cityX < 0 || cityX >= city.width) continue;
      const out = z * WILD_CHUNK + x;
      const src = cityZ * city.width + cityX;
      const cityFlor = city.flor[src] ?? 0;
      let wall = city.map1[src] ?? 0;
      let surface = city.map2[src] ?? 0;

      if (wall & 0x8000) {
        wall = 0;
        surface = 0;
      } else if (wall === 0x2f2f) {
        wall = 0x3030;
        surface = 0x3030 | (surface & 0x8080);
      } else if (wall === 0x2d2d) {
        wall = 0x2f2f;
        surface = 0x3030 | (surface & 0x8080);
      } else if (wall === 0x2e2e) {
        surface = 0x3030 | (surface & 0x8080);
      } else {
        wall = 0;
        surface = 0;
      }

      flor[out] = cityFlor;
      map1[out] = wall;
      map2[out] = surface;
    }
  }
  return { flor, map1, map2 };
}

/**
 * The original's aligned quarter copy, kept for the one case it can serve.
 *
 * It is `reviseCityInto` for a block that lines up with the city exactly (the *original's* own
 * arrangement: a 128-cell city cut into four blocks with no offset), and it is kept because the
 * tests and the docs name it, and because "the original's arithmetic" deserves to be readable on
 * its own. The world grid does not use it — `reviseCityInto` does, with the offsets.
 *
 * @param {{map1: Uint16Array, map2: Uint16Array, flor: Uint16Array, width: number, depth: number}} city
 * @param {number} blockId  1…4
 * @returns {{flor: Uint16Array, map1: Uint16Array, map2: Uint16Array}}
 */
export function reviseCityQuarter(city, blockId) {
  const startX = (blockId === 1 || blockId === 3) ? 0 : WILD_CHUNK;
  const startZ = (blockId === 1 || blockId === 2) ? 0 : WILD_CHUNK;
  return reviseCityInto(city, { blockRow: startZ / WILD_CHUNK, blockCol: startX / WILD_CHUNK, cityRow0: 0, cityCol0: 0 });
}

/**
 * The block at a block-grid coordinate.
 * @param {Uint8Array} indices
 * @param {number} bx @param {number} bz
 * @returns {number}
 */
export function blockAt(indices, bx, bz) {
  if (bx < 0 || bz < 0 || bx >= WILD_GRID_WIDTH || bz >= WILD_GRID_HEIGHT) return 0;
  return indices[bz * WILD_GRID_WIDTH + bx];
}

/**
 * The player's window origin, a block at a time — the original's
 * `getCenteredWildOrigin`, which keeps the player inside the middle 64-cell band
 * of the 128-cell window.
 *
 * @param {number} row @param {number} col  wilderness cells
 * @returns {{row: number, col: number}}   block-aligned
 */
export function wildernessWindowOrigin(row, col) {
  // Integer division BEFORE the multiply, as the original's integer arithmetic does:
  // `((v - 32) / 64) * 64` in C++ truncates the quotient. Multiplying the fraction
  // first (`Math.floor(v - 32) / 64 * 64`) lands on a half-block origin and every
  // cell in the window is 32 places out.
  const snap = (v) => Math.floor(Math.max(v - 32, 0) / WILD_CHUNK) * WILD_CHUNK;
  return { row: snap(row), col: snap(col) };
}

/**
 * Is this wilderness cell inside the settlement's own 128×128 footprint?
 * @param {number} row @param {number} col
 * @returns {boolean}
 */
export function isCityCell(row, col) {
  return row >= CITY_ORIGIN && row < CITY_ORIGIN + WILD_WINDOW
    && col >= CITY_ORIGIN && col < CITY_ORIGIN + WILD_WINDOW;
}

/**
 * Is this wilderness cell on the settlement's perimeter **line** — the single row (or
 * column) the wall stands on? The gate is an opening in that line (`scenes/interior.js`
 * decides which), in either place.
 *
 * @param {number} row @param {number} col
 * @returns {boolean}
 */
export function isCityRingCell(row, col) {
  if (!isCityCell(row, col)) return false;
  const lr = row - CITY_ORIGIN;
  const lc = col - CITY_ORIGIN;
  const far = WILD_WINDOW - CITY_RING;
  return lr < CITY_RING || lc < CITY_RING || lr >= far || lc >= far;
}

/**
 * Assemble a window of the country into a level shaped like a `.MIF` level.
 *
 * The window is always four whole blocks (`wildernessWindowOrigin` snaps to 64), so this is a copy
 * of four 64×64 planes into one 128×128 triple. **What each block is, the caller decides** — and
 * that is the whole difference between the original's country and the world grid
 * (`game/tamrielGrid.js`): the original's window *was* one settlement's own grid, so a block id was
 * enough; the world's window is wherever the player is standing, so a block is open country, or a
 * city's own ground, or the sea, and only the caller knows which.
 *
 * @param {object} opts
 * @param {number} opts.originRow @param {number} opts.originCol   world cells
 * @param {(blockRow: number, blockCol: number) => {kind: 'city', city: object, footprint: object}
 *   | {kind: 'sea'} | {kind: 'rmd', id: number} | {kind: 'empty'}} opts.blockFor
 *   the resolver, called for each of the window's four blocks in row-major order
 * @param {import('../arena/arenaData.js').ArenaData} [opts.data]  for the `.RMD` blocks, when the
 *   resolver asks for one; a window of cities and sea needs no archive at all
 * @param {(msg: string) => void} [opts.onWarn]
 * @returns {Promise<{level: object, blocks: number[], missing: number[], cityBlocks: number[], seaBlocks: number, originRow: number, originCol: number}>}
 */
export async function buildWildernessWindow(opts) {
  const { data = null, blockFor, originRow, originCol, onWarn = () => {} } = opts;
  if (typeof blockFor !== 'function') throw new Error('buildWildernessWindow needs a blockFor resolver');
  const width = WILD_WINDOW;
  const depth = WILD_WINDOW;
  const flor = new Uint16Array(width * depth);
  const map1 = new Uint16Array(width * depth);
  const map2 = new Uint16Array(width * depth);

  const blockRow0 = Math.floor(originRow / WILD_CHUNK);
  const blockCol0 = Math.floor(originCol / WILD_CHUNK);
  /** @type {number[]} */
  const blocks = [];
  /** @type {number[]} */
  const missing = [];
  /** @type {number[]} */
  const cityBlocks = [];
  let seaBlocks = 0;

  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const blockRow = blockRow0 + dr;
      const blockCol = blockCol0 + dc;
      const answer = blockFor(blockRow, blockCol) ?? { kind: 'empty' };
      /** @type {{flor: Uint16Array, map1: Uint16Array, map2: Uint16Array}|null} */
      let block = null;

      if (answer.kind === 'city') {
        cityBlocks.push(1);
        block = reviseCityInto(answer.city, {
          blockRow, blockCol,
          cityRow0: answer.footprint.row0,
          cityCol0: answer.footprint.col0,
        });
      } else if (answer.kind === 'sea') {
        blocks.push(SEA_BLOCK_ID);
        seaBlocks++;
        block = seaBlockPlanes();
      } else if (answer.kind === 'rmd' && data) {
        blocks.push(answer.id);
        block = await loadBlock(data, answer.id, missing, onWarn);
      }

      if (!block) continue;
      const row0 = dr * WILD_CHUNK;
      const col0 = dc * WILD_CHUNK;
      for (let r = 0; r < WILD_CHUNK; r++) {
        for (let c = 0; c < WILD_CHUNK; c++) {
          const src = r * WILD_CHUNK + c;
          const dst = (row0 + r) * width + (col0 + c);
          flor[dst] = block.flor[src];
          map1[dst] = block.map1[src];
          map2[dst] = block.map2[src];
        }
      }
    }
  }

  return {
    level: {
      name: '',
      info: '',                     // the INF is the climate's, not the block's
      numf: 0,
      flor, map1, map2,
      flat: null, inns: null, loot: null, stor: null,
      targ: [], lock: [], trig: [],
      startPoints: [],
      warnings: [],
    },
    blocks,
    missing,
    cityBlocks,
    seaBlocks,
    originRow,
    originCol,
  };
}

/**
 * Read and decode one `.RMD`, with the install's own warnings.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @param {number} id
 * @param {number[]} missing
 * @param {(msg: string) => void} onWarn
 * @returns {Promise<{flor: Uint16Array, map1: Uint16Array, map2: Uint16Array}|null>}
 */
async function loadBlock(data, id, missing, onWarn) {
  const name = rmdName(id);
  try {
    const block = await data.rmd(name);
    for (const w of block.warnings) onWarn(w);
    return { flor: block.flor, map1: block.map1, map2: block.map2 };
  } catch (err) {
    missing.push(id);
    onWarn(`${name}: ${err.message}`);
    return null;
  }
}

/**
 * Read the URL's wilderness request, if the page asked for one.
 *
 * `?wild` alone stands in the wilderness of the page's own location (or of the
 * default city); `?wild=row,col` puts the player on that wilderness cell; `?climate`
 * and `?weather` pick the `.INF`; `?wildseed=` overrides the settlement seed the
 * block grid is drawn from.
 *
 * `null` for `climate`, `weather` and `infName` means "the location decides": a
 * settlement in Hammerfell's desert reads the desert's wilderness tables, which is
 * where the province variety of the landscape comes from.
 *
 * @param {URLSearchParams} params
 * @returns {{cell: {row: number, col: number}|null, climate: string|null, weather: string|null, seed: number|null, infName: string|null}|null}
 */
export function readWildRequest(params) {
  if (!params.has('wild')) return null;
  return {
    cell: parseWildCell(params.get('wild')),
    climate: params.get('climate') ?? null,
    weather: params.get('weather') ?? null,
    seed: params.has('wildseed') ? Number(params.get('wildseed')) : null,
    infName: params.get('inf') ? params.get('inf').toUpperCase() : null,
  };
}

/**
 * `?wild=12,34` — a wilderness cell (row, col), or null for "the settlement's own
 * centre".
 * @param {string|null} text
 * @returns {{row: number, col: number}|null}
 */
export function parseWildCell(text) {
  if (!text) return null;
  const m = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(text.trim());
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

/** Cells in the whole wilderness area, for the HUD. */
export const WILD_AREA_CELLS = WILD_GRID_WIDTH * WILD_CHUNK;

export { RMD_WIDTH, RMD_HEIGHT };
