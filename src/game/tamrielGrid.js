// ONE TAMRIEL, ONE GRID OF CELLS — the country every settlement stands in.
//
// The port's country used to be **per settlement**: `game/wilderness.js` drew a 64×64 grid of
// blocks from that settlement's own seed and wrote its four quarter blocks into the middle of it,
// so the country outside Daggerfall held Daggerfall and nothing else. That is the original's own
// mechanism (each location is its own wilderness), and it is why the owner could not walk from one
// city to the next: *"i cant pass trough city gates to get into the persistent wilderness … so i
// cant seamlessly get from one city to another walking"*. There was no second city within a
// lifetime of walking, because the only city in the world was the one they had left.
//
// This module is the replacement: **the whole continent as one grid of cells**, with every one of
// the world map's 288 settlements standing where its own world-map pixel says. Walk out of a gate
// anywhere and the same country continues in every direction, and the next town's wall is the
// distance the map has always drawn it at. Nothing about a place depends on where the player came
// from, which is what makes it a world rather than a backdrop.
//
// ## The scale, and why it is this one
//
// `CELLS_PER_PIXEL = 256`, i.e. **one world-map pixel is four 64-cell blocks**
// (`arena/rmdFile.js`'s own block, the unit `.RMD` and the wilderness window are already built
// from). Two measured facts fix it, and both are in `docs/DECISIONS.md`:
//
//   * A settlement's own level is 105×105 to 128×128 cells (measured over the install's 17
//     skeletons: `VILLAGW2` 105, `TOWN1` 106, `CITY1` 127, everything else 124–128), so a city
//     occupies **half a pixel** at this scale and there is country on every side of it.
//   * The map's settlements are close together: the closest pair is **1 pixel** apart
//     (`Stone Fell` [139,125] / `Vlastarus` [140,125]), and 39 pairs are within 5 pixels. A city
//     footprint must therefore be smaller than a pixel, and *two cities must never share one
//     128-cell window* — the window is the level, and a level holds one city.
//
// At 256 the second rule holds with room to spare: two settlements 1 pixel apart leave 128 cells
// of open country between their walls, and no block-aligned 128-cell window can touch both
// (`footprintCells` and the `settlementInWindow` test are what hold it, checked over the install's
// own 288 records in `tests/unit/tamrielgrid.test.mjs`).
//
// ## The ground is `TERRAIN.IMG`
//
// The world map's own picture decides what the country *is*: a pixel of `TERRAIN.IMG` is sea
// (248) or one of the three land classes (249/250 mountain, 251/254 temperate, 252/253 desert —
// `game/worldMap.js`'s own table, D-38). So the coastline the player walks along **is** the
// coastline on the map, and the country's `.INF` — its ground textures, its trees, its rocks, its
// sky — is the biome of the pixel they are standing on (`wildernessInfName`). The install ships
// a different scenery table per climate (`TWN.INF`'s `NOAK2`, `DWN.INF`'s `CACTUS1`, `MWN.INF`'s
// `NFIR1`), and a block's entity cells index that table, so **the same block draws oaks in
// Cyrodiil and cacti in Hammerfell**: this is where the owner's *"make sure the backgrounds are
// correct for every biome"* comes from, and it costs nothing.
//
// ## What is the install's and what is this project's
//
// The install's: the block records (`WILD001`…`WILD070`), their grading into categories
// (`wilderness.js`'s `classifyBlock`, measured off the records themselves), the `.INF` per
// climate, the placement of every settlement (that is `CITYDATA.64`), and the *cadence* of the
// draw — one category draw and one list draw per block, `ArenaRandom`'s own generator.
//
// This project's, and stamped as such: **the scale** (256 cells to a pixel), **the hash** that
// makes a block's draw a function of its own position rather than of a seed, and **the climate
// weights** (`CLIMATE_CATEGORY_WEIGHTS`, below — the original's overall cadence is 40/25/15/10/10,
// which is what its four thresholds in `wilderness.js` sum to, and the climate only tilts it).
// The alternative — one draw per settlement, stitched — was rejected because the stitch is a
// visible seam: two blocks either side of it belong to different draws and the country changes
// character along a line nothing in the world explains.

import { ArenaRandom } from './arenaRandom.js';
import { styleOf } from './provinceStyle.js';

/** Saved wilderness coordinates in the painted Tamriel grid (unversioned = legacy). */
export const WORLD_GRID_VERSION = 2;

/** Upgrade old CITYDATA-grid feet without losing the sub-pixel cell offset. */
export function migrateWildCell(world, cell, version) {
  if (!cell || version === WORLD_GRID_VERSION) return cell;
  const pixel = pixelOfCell(cell.row, cell.col);
  const exact = world.locations.find((l) => l.global.x === pixel.x && l.global.y === pixel.y);
  const province = exact ? world.provinces[exact.provinceID] : world.legacyProvinceAt(pixel);
  if (!province) return cell;
  const sx = Math.floor(province.rect.width * 100 / WORLD_PIXELS.width);
  const sy = Math.floor(province.rect.height * 100 / WORLD_PIXELS.height);
  const local = { x: sx ? Math.round((pixel.x - province.rect.x) * 100 / sx) : 0,
    y: sy ? Math.round((pixel.y - province.rect.y) * 100 / sy) : 0 };
  const point = exact?.tamriel ?? world.mapPoint(province.id, local);
  return { row: point.y * CELLS_PER_PIXEL + cell.row - pixel.y * CELLS_PER_PIXEL,
    col: point.x * CELLS_PER_PIXEL + cell.col - pixel.x * CELLS_PER_PIXEL };
}

/** Cells per world-map pixel: four 64-cell blocks. See this file's header for why 256. */
export const CELLS_PER_PIXEL = 256;

/** Cells across one block (`arena/rmdFile.js`'s own size). */
export const BLOCK_CELLS = 64;

/** Blocks per world-map pixel: `CELLS_PER_PIXEL / BLOCK_CELLS`. */
export const BLOCKS_PER_PIXEL = CELLS_PER_PIXEL / BLOCK_CELLS;

/** Cells across the window the game keeps around the player (2×2 blocks, `wilderness.WILD_WINDOW`). */
export const WINDOW_CELLS = BLOCK_CELLS * 2;

/** The world map's own size, in pixels (`arena/cityDataFile.js`'s `WORLD_MAP_SIZE`). */
export const WORLD_PIXELS = Object.freeze({ width: 320, height: 200 });

/** The terrain pixel that means open sea (`worldMap.TERRAIN_SEA`). */
export const SEA_PIXEL = 248;

/**
 * What a block of country looks like, per climate, in percent.
 *
 * The original draws a category against four thresholds — 0x6666, 0x4000, 0x2666, 0x1999 out of
 * 0x10000 — which is **40 % open country, 25 % village, 15 % dungeon, 10 % tavern, 10 % temple**
 * (`game/wilderness.js`'s `CATEGORY_THRESHOLDS`, ported from `generateWildernessIndices`). Those
 * numbers are the cadence and are kept; what a climate adds is the tilt a player would expect —
 * a desert is emptier, a mountain has more ruins and shrines in it. Each row sums to 100 and
 * `countryCategory` reads it as a percentage, so a weight is readable as a share of the country.
 *
 * **This project's rule**: the original's own per-climate tables live in `A.EXE`, which this
 * checkout does not have (see `docs/DECISIONS.md`).
 */
export const CLIMATE_CATEGORY_WEIGHTS = Object.freeze({
  temperate: Object.freeze({ normal: 40, village: 25, dungeon: 15, tavern: 10, temple: 10 }),
  mountain: Object.freeze({ normal: 33, village: 24, dungeon: 22, tavern: 10, temple: 11 }),
  desert: Object.freeze({ normal: 55, village: 20, dungeon: 13, tavern: 7, temple: 5 }),
});

/** The categories, in the order the original's thresholds list them. */
export const CATEGORIES = Object.freeze(['normal', 'village', 'dungeon', 'tavern', 'temple']);

/** The block id that means "the sea" — a block this project makes rather than reads. */
export const SEA_BLOCK = -1;

/**
 * A cell as a world-map pixel.
 *
 * The level's `row` is world Y and its `col` is world Z (`game/mifMesh.js`), and the world map's
 * `y` grows south, so the two agree without a flip: pixel `y` is `row / 256` and pixel `x` is
 * `col / 256`.
 *
 * @param {number} row @param {number} col
 * @returns {{x: number, y: number}}
 */
export function pixelOfCell(row, col) {
  return { x: Math.floor(col / CELLS_PER_PIXEL), y: Math.floor(row / CELLS_PER_PIXEL) };
}

/** The cell a pixel's own corner stands on. @param {{x: number, y: number}} pixel */
export function cellOriginOfPixel(pixel) {
  return { row: pixel.y * CELLS_PER_PIXEL, col: pixel.x * CELLS_PER_PIXEL };
}

/** The block a cell stands in. @param {number} row @param {number} col */
export function blockOfCell(row, col) {
  return { blockRow: Math.floor(row / BLOCK_CELLS), blockCol: Math.floor(col / BLOCK_CELLS) };
}

/**
 * Where a settlement's own level stands in the world, as whole cells.
 *
 * The settlement is **centred on its world-map pixel**: a 106-cell town at pixel (131,79) has two
 * cells of country more on one side than the other, and every one of the 288 is placed the same
 * way, so the map's marker is the middle of the city the player walks into.
 *
 * @param {{x: number, y: number}} global  the settlement's world-map pixel
 * @param {{width: number, depth: number}} size  its own level's size, in cells
 * @returns {{row0: number, col0: number, width: number, depth: number}}
 */
export function footprintOf(global, size) {
  const width = Math.max(0, Math.trunc(size?.width ?? 0));
  const depth = Math.max(0, Math.trunc(size?.depth ?? 0));
  return {
    row0: global.y * CELLS_PER_PIXEL + Math.floor((CELLS_PER_PIXEL - depth) / 2),
    col0: global.x * CELLS_PER_PIXEL + Math.floor((CELLS_PER_PIXEL - width) / 2),
    width,
    depth,
  };
}

/** Is this world cell inside a footprint? @param {object} f @param {number} row @param {number} col */
export function footprintHas(f, row, col) {
  return Boolean(f) && row >= f.row0 && row < f.row0 + f.depth
    && col >= f.col0 && col < f.col0 + f.width;
}

/** Is this block overlapped by a footprint at all? @param {object} f @param {number} blockRow @param {number} blockCol */
export function footprintHasBlock(f, blockRow, blockCol) {
  if (!f) return false;
  const row0 = blockRow * BLOCK_CELLS;
  const col0 = blockCol * BLOCK_CELLS;
  return f.row0 < row0 + BLOCK_CELLS && f.row0 + f.depth > row0
    && f.col0 < col0 + BLOCK_CELLS && f.col0 + f.width > col0;
}

/**
 * Where a city cell stands in the world, and the other way back.
 *
 * The one pair of conversions the whole seam needs: a city's own level is its own coordinates, and
 * everything outside it — the gate, the window, the map's own mark — is world cells.
 *
 * @param {{row0: number, col0: number}} f @param {number} row @param {number} col
 */
export function worldCellOfCity(f, row, col) {
  return { row: f.row0 + row, col: f.col0 + col };
}

/** @param {{row0: number, col0: number}} f @param {number} row @param {number} col */
export function cityCellOfWorld(f, row, col) {
  return { row: row - f.row0, col: col - f.col0 };
}

/**
 * Does one 128-cell window hold any of a footprint?
 *
 * `slack` extends the test by that many cells on each side, which is what a scene wants when it
 * asks "is this city close enough that the player could walk to it" rather than "is it on screen".
 *
 * @param {object} f @param {number} originRow @param {number} originCol
 * @param {number} [span] the window's own size, default `WINDOW_CELLS`
 * @param {number} [slack]
 */
export function footprintInWindow(f, originRow, originCol, span = WINDOW_CELLS, slack = 0) {
  if (!f) return false;
  return f.row0 - slack < originRow + span && f.row0 + f.depth + slack > originRow
    && f.col0 - slack < originCol + span && f.col0 + f.width + slack > originCol;
}

/**
 * The settlement whose own level covers a world cell, or null for open country.
 *
 * `footprints` is a list of `{settlement, footprint}` pairs (`footprintsOf`, below). Two
 * settlements may in principle overlap — the world map puts exactly one pair of its 288 on the
 * same pixel (`Stonedale` and `Chorrol`, both [131,79], measured), and the install has no answer
 * for which comes first — so the caller's own order decides, and the first match wins.
 *
 * @param {{settlement: object, footprint: object}[]} footprints
 * @param {number} row @param {number} col
 * @returns {object|null} the settlement
 */
export function settlementAt(footprints, row, col) {
  for (const entry of footprints ?? []) {
    if (footprintHas(entry.footprint, row, col)) return entry.settlement;
  }
  return null;
}

/**
 * The settlement a **block** belongs to, when any does — the test the country's own draw needs,
 * because a block is either country or a city's ground and never both.
 *
 * @param {{settlement: object, footprint: object}[]} footprints
 * @param {number} blockRow @param {number} blockCol
 * @returns {object|null}
 */
export function settlementOfBlock(footprints, blockRow, blockCol) {
  for (const entry of footprints ?? []) {
    if (footprintHasBlock(entry.footprint, blockRow, blockCol)) return entry.settlement;
  }
  return null;
}

/**
 * The first settlement whose level a window's own cells touch, or null for open country.
 *
 * **At most one**, and that is a property of the scale rather than of this function: the check
 * over the install's own 288 records is in `tests/unit/tamrielgrid.test.mjs`, and it is the reason
 * `CELLS_PER_PIXEL` is 256 rather than 128 — at 128 the closest pair (`Stone Fell` / `Vlastarus`,
 * 1 pixel apart) would share a window, and a window is a level.
 *
 * @param {{settlement: object, footprint: object}[]} footprints
 * @param {number} originRow @param {number} originCol
 * @returns {object|null}
 */
export function settlementInWindow(footprints, originRow, originCol) {
  for (const entry of footprints ?? []) {
    if (footprintInWindow(entry.footprint, originRow, originCol)) return entry.settlement;
  }
  return null;
}

/**
 * Every settlement's footprint, from the world map's own records and a size for each.
 *
 * @param {object[]} settlements  `world.settlements()`
 * @param {(settlement: object) => {width: number, depth: number}} sizeOf
 *   the settlement's own level size — read from the skeleton it will be built from
 *   (`game/tables/cityBlocks.js`'s `cityTemplateName`), because a town is 106 cells and a city is
 *   128 and only the file knows which
 * @returns {{settlement: object, footprint: object}[]}
 */
export function footprintsOf(settlements, sizeOf) {
  const out = [];
  for (const settlement of settlements ?? []) {
    if (!(settlement?.tamriel ?? settlement?.global)) continue;
    const size = sizeOf(settlement) ?? { width: 0, depth: 0 };
    if (!size.width || !size.depth) continue;
    out.push({ settlement, footprint: footprintOf(settlement.tamriel ?? settlement.global, size) });
  }
  return out;
}

/**
 * A block's own hash — the seed its draw is made from.
 *
 * **This project's rule, and the load-bearing one for seamlessness**: a block's country is a
 * function of *where the block is* and of nothing else — not of which city the player left, not of
 * the order they walked through the grid. Two visits to the same block are the same country, and
 * two players walking into it from opposite sides meet the same trees.
 *
 * A 32-bit mix (the murmur-style finalizer), so neighbouring blocks share no visible pattern.
 *
 * @param {number} blockRow @param {number} blockCol
 * @returns {number} 0…2^32−1
 */
export function blockHash(blockRow, blockCol) {
  let h = (Math.imul(blockRow | 0, 0x9e3779b1) ^ Math.imul(blockCol | 0, 0x85ebca6b)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h >>> 0;
}

/**
 * Which category of country a draw asks for, in a climate.
 *
 * A percentage draw (`0`…`99`) against `CLIMATE_CATEGORY_WEIGHTS`, so a weight *is* a share of the
 * country. An unknown climate reads as temperate rather than as nothing.
 *
 * @param {number} percent 0…99
 * @param {string} climate `temperate`, `mountain` or `desert`
 * @returns {'normal'|'village'|'dungeon'|'tavern'|'temple'}
 */
export function countryCategory(percent, climate) {
  const weights = CLIMATE_CATEGORY_WEIGHTS[climate] ?? CLIMATE_CATEGORY_WEIGHTS.temperate;
  let left = Math.max(0, Math.min(99, Math.floor(percent)));
  for (const category of CATEGORIES) {
    const weight = weights[category] ?? 0;
    if (left < weight) return /** @type {any} */ (category);
    left -= weight;
  }
  return 'normal';
}

/**
 * The block a piece of open country is made of — the world's own answer for one block.
 *
 * The original's cadence, exactly: **two draws per block**, one for the category and one for the
 * entry inside it (`generateWildernessIndices` consumes the same pair, which is why the lists are
 * indexed `(draw & 0xff) % length`). The only differences are where the seed comes from (the
 * block's own position, `blockHash`) and that the category is weighted by the pixel's climate.
 *
 * The categories are the install's own measured grading (`wilderness.js`'s `classifyBlock` groups
 * the 66 scenery records into open country, villages, buildings and ruins), so a hash decides
 * *which* of the install's places stands here and never invents one.
 *
 * @param {object} opts
 * @param {number} opts.blockRow @param {number} opts.blockCol
 * @param {Record<string, number[]>} opts.lists  `wilderness.wildernessBlockLists`'s own lists
 * @param {string} opts.climate
 * @returns {number} a `.RMD` id (`WILD001`…`WILD070`)
 */
export function countryBlockAt(opts) {
  return countryAt(opts).id;
}

/**
 * The same draw, with its own working shown: what a block of country **is**.
 *
 * The category is the half a caller sometimes needs without a block id — a ruin is a `dungeon`
 * block's country whatever `.RMD` the draw picks (`game/dungeonSurface.js`, which puts a
 * dungeon's door in one) — so it is answered here rather than re-derived by a second copy of the
 * weights.
 *
 * @param {object} opts
 * @param {number} opts.blockRow @param {number} opts.blockCol
 * @param {Record<string, number[]>} opts.lists
 * @param {string} opts.climate
 * @returns {{category: string, id: number, hash: number}}
 */
export function countryAt(opts) {
  const { blockRow, blockCol, lists, climate, forceCategory = null } = opts;
  const hash = blockHash(blockRow, blockCol);
  const random = new ArenaRandom(hash);
  const drawn = countryCategory((random.next() * 100) / 65536, climate);
  // **A block can be told what it is.** The one caller that uses this is a dungeon's door block
  // (`scenes/interior.js`'s `worldBlockAt`): the owner's *"dungeon entrances are full buildings
  // instead, dungeon entrances should be a PNG not a building"* is the ruin list's doing — a
  // `dungeon` category block is built from the ruin `.RMD`s, which draw walls and a roof. The
  // entrance itself is the install's own 64×64 `WDUNGDR1.IMG`, drawn as a flat, so the ground
  // under it must be open country rather than a house.
  const category = forceCategory ?? drawn;
  const list = lists?.[category]?.length ? lists[category] : lists?.normal;
  return { category, id: list?.length ? list[(random.next() & 0xff) % list.length] : 0, hash };
}

/**
 * Is this world pixel open sea?
 *
 * The **raw** pixel, not `worldMap.terrainAt`: that function applies the original's own fail-safe
 * (twelve pixels left, then a walk outward for land), which is exactly right for reading a
 * *location's climate* and exactly wrong for asking where the coast is — it would answer "desert"
 * for a pixel in the middle of the ocean, and the sea would be a desert.
 *
 * @param {Uint8Array|number[]} terrain `TERRAIN.IMG`'s indices
 * @param {{x: number, y: number}} pixel
 * @returns {boolean}
 */
export function isSeaPixel(terrain, pixel) {
  if (!terrain || !pixel) return false;
  if (pixel.x < 0 || pixel.y < 0 || pixel.x >= WORLD_PIXELS.width || pixel.y >= WORLD_PIXELS.height) {
    return true;   // off the map is off the world: the sea, and not a place
  }
  return terrain[pixel.y * WORLD_PIXELS.width + pixel.x] === SEA_PIXEL;
}

/**
 * Is a world cell sea? The block's own pixel decides, which makes the coastline step in 160-metre
 * blocks — the finest the map's data can be read at, since one pixel of `TERRAIN.IMG` *is* 256
 * cells (640 m) of world.
 *
 * @param {Uint8Array|number[]} terrain
 * @param {number} row @param {number} col
 * @returns {boolean}
 */
export function isSeaCell(terrain, row, col) {
  return isSeaPixel(terrain, pixelOfCell(row, col));
}

/**
 * The climate a window stands in: the biome of its **centre** cell's pixel.
 *
 * One `.INF` per page, because a page is one level and a level has one ground table — and 128
 * cells (320 m) is small enough that the biome does not change inside one. The window's centre and
 * not its corner, so a window straddling a border is the country the player is standing in.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {number} originRow @param {number} originCol
 * @returns {string}
 */
export function windowClimate(world, originRow, originCol) {
  const row = originRow + Math.floor(WINDOW_CELLS / 2);
  const col = originCol + Math.floor(WINDOW_CELLS / 2);
  return youAreHere(world, row, col).climate;
}

/**
 * The world pixel a global point is, inside its province: **the province map's own pixel**.
 *
 * `CITYDATA.64` stores each location's `local` point in 0…319 × 0…199 — the hand-drawn province
 * map's own space (`game/mapScreen.js`'s `provincePointOf`) — and `arena/cityDataFile.js`'s
 * `globalPoint` scales it into the province's rectangle. This is that sum run backwards, so a
 * player standing in the country at a world pixel gets **the pixel the province map would draw
 * them at**: the same space the province's own markers are in, which is what makes the map's
 * "you are here" dot land between the right two towns.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {{x: number, y: number}} point
 * @returns {{x: number, y: number}|null} the province-map pixel, or null for open sea
 */
export function provincePixelOf(world, point, preferredProvinceID = null) {
  const province = (preferredProvinceID != null ? world?.provinces?.[preferredProvinceID] : null)
    ?? (world?.provinceAtWorld?.(point) ?? world?.provinceAt?.(point));
  if (!province) return null;
  if (world?.localPointAt) return world.localPointAt(point, province.id);
  const scaleX = Math.floor((province.rect.width * 100) / WORLD_PIXELS.width);
  const scaleY = Math.floor((province.rect.height * 100) / WORLD_PIXELS.height);
  const clamp = (value, max) => Math.max(0, Math.min(max, Math.round(value)));
  return {
    x: scaleX ? clamp(((point.x - province.rect.x) * 100) / scaleX, WORLD_PIXELS.width - 1) : 0,
    y: scaleY ? clamp(((point.y - province.rect.y) * 100) / scaleY, WORLD_PIXELS.height - 1) : 0,
  };
}

/**
 * **Where the player is, in every space the game needs to say it.**
 *
 * One call, one answer, and the same answer to the map, the HUD, the arrival line and any test
 * that asks. The owner's own report is what it is for: *"there is no way for me to see a little
 * dot on the entire map that says \"you are here\" … when im in the wilderness it says im in a
 * city but im not"* — the world cell is the one fact that is true in the country and in a city
 * alike, because a city cell **is** a world cell (`worldCellOfCity`).
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {number} row @param {number} col  world cells
 * @param {{settlement?: object|null}} [opts]  the settlement the player is in, when the caller knows
 * @returns {{row: number, col: number, pixel: {x: number, y: number}, global: {x: number, y: number},
 *   provinceID: number|null, provinceName: string|null, local: {x: number, y: number}|null,
 *   sea: boolean, country: boolean, climate: string, settlement: object|null, nearest: object|null,
 *   label: string}}
 */
export function youAreHere(world, row, col, opts = {}) {
  const pixel = pixelOfCell(row, col);
  const province = (world?.provinceAtWorld?.(pixel) ?? world?.provinceAt?.(pixel)) ?? null;
  const terrain = (world?.worldTerrain ?? world?.terrain)?.indices ?? null;
  const here = opts.settlement ?? null;
  const nearest = here ?? nearestSettlement(world, pixel);
  // Arena's terrain raster has sea at several coastal settlement coordinates. The
  // city footprint builder stamps their ground there; location readouts must agree.
  const nearPoint = nearest?.tamriel ?? nearest?.global;
  const onSettlementPixel = nearPoint?.x === pixel.x && nearPoint?.y === pixel.y;
  const sea = !here && !onSettlementPixel && isSeaPixel(terrain, pixel);
  const nearNamed = nearest && Math.hypot(nearPoint.x - pixel.x, nearPoint.y - pixel.y) <= 1;
  const style = styleOf({ provinceID: province?.id, name: nearNamed ? nearest.name : '',
    terrainClimate: world?.worldClimateAt?.(pixel) ?? world?.climateAt?.(pixel) ?? 'temperate', global: pixel });
  return {
    row, col,
    pixel,
    global: { x: pixel.x, y: pixel.y },
    provinceID: province?.id ?? null,
    provinceName: province?.name ?? null,
    local: provincePixelOf(world, pixel),
    sea,
    country: !here,
    climate: sea ? 'temperate' : style.ground,
    weather: sea ? null : style.weather,
    settlement: here,
    nearest,
    label: here ? here.name : (sea ? 'open water' : `the country near ${nearest?.name ?? 'nowhere'}`),
  };
}

/**
 * The nearest settlement to a world pixel — the world map's own records, walked.
 *
 * @param {import('./worldMap.js').WorldMap} world
 * @param {{x: number, y: number}} point
 * @returns {object|null}
 */
export function nearestSettlement(world, point) {
  if (!world?.settlements) return null;
  let best = null;
  for (const settlement of world.settlements()) {
    const pixel = settlement.tamriel ?? settlement.global;
    const distance = Math.hypot(pixel.x - point.x, pixel.y - point.y);
    if (!best || distance < best.distance) best = { settlement, distance };
  }
  return best?.settlement ?? null;
}

/**
 * The settlement whose gate a world cell is standing in front of, if any — **the way into the next
 * town**.
 *
 * A cell is a gate cell when it is *outside* the settlement's own level and within reach of the
 * wall line the city's own gate is cut in. The city page knows its gate's own cell
 * (`scenes/interior.js`'s `gateCellAt`); the country only knows where the city's cells are, so the
 * rule here is the other half of the same door: **a foot from the wall, on the side the gate opens
 * on**. The gate's side is read off the city's own level and handed in (`gate`), so both places
 * agree about which wall the opening is in.
 *
 * @param {object} footprint  the settlement's footprint
 * @param {{row: number, col: number, axis: 'north'|'south'|'east'|'west'}} gate
 *   the gate in the settlement's **own** city coordinates
 * @param {number} row @param {number} col  the world cell to test
 * @param {number} [reach]  how far outside the wall still counts, in cells
 * @returns {boolean}
 */
export function atSettlementGate(footprint, gate, row, col, reach = 3) {
  if (!footprint || !gate) return false;
  const cell = cityCellOfWorld(footprint, row, col);
  // Just outside the wall, along the gate's own line: the opening's own cells plus the few steps
  // a player takes before the door.
  const onLine = gate.axis === 'north' || gate.axis === 'south'
    ? Math.abs(cell.col - gate.col) <= 1
    : Math.abs(cell.row - gate.row) <= 1;
  if (!onLine) return false;
  // `depthInto`: **0 on the wall's own line, positive inward** (the city's street), negative out in
  // the country. One cell in and `reach` cells out, because a gate is crossed from either side and
  // all three feet are standing at the same door: the player on the first paving stone inside it
  // (which is where a city's own page puts them), the player in the gateway itself, and the player
  // in the country two paces off the wall. The first version of this only accepted the *outside*, so
  // on a city page — where every cell is the settlement's own — the door could never be found, and
  // the player walked out through the open gateway and off the edge of the level.
  const depthInto = gate.axis === 'north' ? cell.row
    : gate.axis === 'south' ? footprint.depth - 1 - cell.row
      : gate.axis === 'west' ? cell.col
        : footprint.width - 1 - cell.col;
  return depthInto <= 1 && depthInto >= -reach;
}

/**
 * The world cell a player arrives on when they walk **out** of a city's gate.
 *
 * `GATE_STEP` cells clear of the wall, on the gate's own line, in the direction the gate faces —
 * far enough to be *through* the opening rather than standing in it (which is what would have the
 * next push cross straight back in), and still on the gate's line rather than beside it.
 *
 * @param {object} footprint
 * @param {{row: number, col: number, axis: 'north'|'south'|'east'|'west'}} gate
 * @param {number} [step]
 * @returns {{row: number, col: number}}
 */
export function outsideGateCell(footprint, gate, step = 3) {
  const row = footprint.row0 + gate.row;
  const col = footprint.col0 + gate.col;
  if (gate.axis === 'north') return { row: row - step, col };
  if (gate.axis === 'south') return { row: row + step, col };
  if (gate.axis === 'west') return { row, col: col - step };
  return { row, col: col + step };
}

/**
 * **A gate does not open into the sea.**
 *
 * `outsideGateCell` is pure arithmetic on the opening's side, so a coastal settlement whose gate
 * faces the water answers a wet cell — and a country page asked to stand the player there finds
 * no ground within a spiral's reach and falls back to the decoder's own spawn: the *middle of the
 * settlement*. Measured on Reich Gradkeep (a village of High Rock), walking out of its east gate
 * booted the country page with the player at world (19072, 12480), a wet cell, and then at the
 * window's centre (63, 63) — thirty cells inside the village. From the player's side that is
 * *"there is a wall in front of the gate"*: you leave the opening and land behind its wall.
 *
 * The last resort is the opening itself (`step` 0), which is on the wall's own line, is the cell
 * the city page's own door stands in, and is marked walkable in the country
 * (`interior.js`'s `markCountryGates`).
 *
 * @param {object} footprint
 * @param {{row: number, col: number, axis: 'north'|'south'|'east'|'west'}} gate
 * @param {(row: number, col: number) => boolean} [isLand]  answers "is this cell ground?"
 * @param {number[]} [steps]  outward distances to try, the usual arrival first
 * @returns {{row: number, col: number}}
 */
export function landwardOutsideGate(footprint, gate, isLand = () => true, steps = [3, 2, 1, 0]) {
  for (const step of steps) {
    const cell = outsideGateCell(footprint, gate, step);
    if (isLand(cell.row, cell.col)) return cell;
  }
  return outsideGateCell(footprint, gate, 0);
}

/**
 * The world cell a player arrives on when they walk **into** a city's gate.
 *
 * The city's own coordinates, `GATE_STEP` cells inside the wall, on the opening's line — the same
 * arrival the city page would give for `?at=`, computed from the country's side of the door.
 *
 * @param {object} footprint
 * @param {{row: number, col: number, axis: 'north'|'south'|'east'|'west'}} gate
 * @param {number} [step]
 * @returns {{row: number, col: number}} the settlement's **own** city coordinates
 */
export function insideGateCell(footprint, gate, step = 3) {
  if (gate.axis === 'north') return { row: gate.row + step, col: gate.col };
  if (gate.axis === 'south') return { row: gate.row - step, col: gate.col };
  if (gate.axis === 'west') return { row: gate.row, col: gate.col + step };
  return { row: gate.row, col: gate.col - step };
}
