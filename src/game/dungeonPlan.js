// THE RANDOM DUNGEONS — ARENA'S OWN BLOCKS, ASSEMBLED INTO A LEVEL.
//
// ## The problem this solves
//
// Arena's `CITYDATA.64` holds **144 dungeon records**: two named ones per province
// (`Crypt of Hearts`, `Fang Lair`, …) and **128 with no name at all** — index 34…47 of
// every province, the map's "random" dungeons. The named sixteen are the ones the
// install ships as loose files, and their filenames are their seeds
// (`arena/cityDataSeeds.js`: `41649375.MIF` for `Crypt of Hearts`). The other 128 name
// a file that is *not* in the folder, because the original **generates** them.
//
// Before this module the port fell through to `START.MIF` for every one of them: the
// world map's travel link carried the location's own name, an unnamed dungeon has
// none, and the loader's default is the Imperial Dungeons. That is the reported
// "almost every dungeon is the same, so Arena's dungeons have not been ported".
//
// ## Where the generator's blocks are
//
// `RANDOM1.MIF`, loose beside the game and named for what it is: **32 levels of 32×32
// cells** — and they are dungeon *pieces*, not levels. Every one of the 32 is walled
// on all four borders **with openings at exactly rows/columns 9, 10, 20 and 21**
// (measured: all 32 share those four slots, `tests/unit/dungeonplan.test.mjs` pins
// it). Two 32×32 pieces laid side by side therefore join at their own doorways, and
// four of them make the **64×64 level** Arena's dungeons are: the same size as every
// shipped map in the folder.
//
// So a level here is four brushes stamped into the four quadrants — north-west,
// north-east, south-west, south-east — and which four is the dungeon's own draw. All
// of them share the seams, which is why no geometry has to be invented: the corridors
// the blocks already open line up on their own.
//
// ## What is reconstructed
//
// *Which* four brushes a given dungeon uses. The original's draw lives in `A.EXE`
// (D11). What is fixed here is that the draw is **the dungeon's own seed** — the same
// number that names its file — so the same dungeon is the same level on every visit,
// and two dungeons are not the same level: four independent picks out of 32 pieces is
// ~850 000 layouts from one 22 KB file of the player's own art.
//
// Also reconstructed: `info` is the brushes' own `.INF` (`RD1.INF`, which every one of
// them names), and the level's `startPoints` are `RANDOM1.MIF`'s own header, so the
// player arrives where the install's own file says the level begins.

import { ArenaRandom } from './arenaRandom.js';
import { isWallVoxel, rawPassable } from './mifLevel.js';

/** The four cells next to a cell, in row/column steps. */
const NEIGHBOURS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);

/** One piece is this many cells across, in both directions. */
export const BRUSH_SIZE = 32;
/** A level is two pieces across and two down. */
export const DUNGEON_LEVEL_SIZE = BRUSH_SIZE * 2;
/** The `.INF` every brush names — its textures and flats, read at runtime. */
export const DUNGEON_BLOCKS_INF = 'RD1.INF';
/** The install's own file of pieces. */
export const DUNGEON_BLOCKS_MIF = 'RANDOM1.MIF';

/**
 * The four quadrant slots, in the order a piece is stamped: NW, NE, SW, SE.
 * `[row, col]` origin of each piece inside the finished level.
 * @type {readonly [number, number][]}
 */
export const QUADRANT_SLOTS = Object.freeze([[0, 0], [0, BRUSH_SIZE], [BRUSH_SIZE, 0], [BRUSH_SIZE, BRUSH_SIZE]]);

/** The names of those slots, for the HUD and the tests. */
export const QUADRANT_NAMES = Object.freeze(['north-west', 'north-east', 'south-west', 'south-east']);

/**
 * The cells a piece leaves open on one border.
 *
 * A piece's own doorways: the border row/column is walked and every cell that is air
 * or an entity (the `0x8` nibble — a flat standing in a doorway) is an opening. The 32
 * shipped pieces all answer `{ top: [9,10,20,21], bottom: [9,10,20,21], left: [9,10,20,21],
 * right: [9,10,20,21] }`, which is what makes the seam work.
 *
 * @param {{map1: Uint16Array}|object} block  a decoded `.MIF` level, `BRUSH_SIZE`² cells
 * @returns {{top: number[], bottom: number[], left: number[], right: number[]}}
 */
export function borderOpenings(block) {
  const size = BRUSH_SIZE;
  const open = (row, col) => {
    const voxel = block?.map1?.[row * size + col] ?? 0;
    return voxel === 0 || (voxel & 0xf000) === 0x8000;
  };
  const top = [];
  const bottom = [];
  const left = [];
  const right = [];
  for (let k = 0; k < size; k++) {
    if (open(0, k)) top.push(k);
    if (open(size - 1, k)) bottom.push(k);
    if (open(k, 0)) left.push(k);
    if (open(k, size - 1)) right.push(k);
  }
  return { top, bottom, left, right };
}

/**
 * The cells every shipped piece leaves open on all four borders — the seam law.
 *
 * Four pieces stamped into a level only make one level if each seam has at least one cell
 * the two sides both leave open. The shipped pieces all open exactly at these four cells
 * on every border (measured: `tests/unit/dungeonplan.test.mjs`), which is why the assembly
 * needs no carving at all.
 * @type {readonly number[]}
 */
export const SHARED_OPENINGS = Object.freeze([9, 10, 20, 21]);

/**
 * Do two pieces agree about the seam between them?
 *
 * Agreeing means **sharing one of the four slots the file's pieces are cut for**, not merely
 * both being open somewhere on that border: a piece whose interior corridor happens to reach
 * its border (one of the 32 does, on its left edge) opens onto a piece that opens elsewhere
 * only through a wall.
 */
export function seamsAgree(a, b, edge) {
  const left = edge === 'vertical' ? a.right : a.bottom;
  const right = edge === 'vertical' ? b.left : b.top;
  return left.some((cell) => SHARED_OPENINGS.includes(cell) && right.includes(cell));
}

/**
 * Is this voxel a plain wall?
 *
 * **The decoder's own test, not a copy of it.** `mifLevel.isWallVoxel` is the one reading of a
 * voxel — this module had grown a second copy that also demanded the high nibble be `0`, and the
 * walls this install's pieces are built from are nibble 1 and 3 (`0x1717`, `0x1a1a`). So the copy
 * found **no wall in a real dungeon**: `commonWallVoxel` answered `0` for every assembled level,
 * the boundary pass below sealed nothing, and `stampExit` refused every wall it was ever offered.
 * Both the "leads off the map" and the "blocked off as soon as you enter" reports came out of
 * that one duplicated line.
 *
 * @param {number} voxel
 * @returns {boolean}
 */
export const isPlainWall = (voxel) => isWallVoxel(voxel);

/**
 * A wall voxel the level itself uses, for a caller that needs to build one.
 *
 * The most common plain wall in the file — the pieces are full of them — so a wall this port
 * writes is the install's own art rather than a number invented here. A level with no plain
 * wall at all (which the shipped pieces are not) answers 0, and the caller then leaves the cell
 * alone rather than writing a guess.
 */
export function commonWallVoxel(level) {
  const counts = new Map();
  for (let i = 0; i < (level?.map1?.length ?? 0); i++) {
    const voxel = level.map1[i];
    if (!isPlainWall(voxel)) continue;
    counts.set(voxel, (counts.get(voxel) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [voxel, count] of counts) if (count > bestCount) { best = voxel; bestCount = count; }
  return best;
}

/**
 * Close the level's own outer wall.
 *
 * **This is the defect the assembled dungeons shipped with.** A piece is walled on all four
 * borders *with openings* at the same four slots (rows/columns 9, 10, 20, 21) — that is what
 * makes a seam work. But four pieces stamped into a level put eight of those borders on the
 * level's **outside**, so the finished dungeon's boundary was a wall with a doorway in it every
 * 32 cells: measured over 24 generated dungeons (`tools/dungeon-audit.mjs`), every single level
 * had walkable cells on its outer ring — **32 to 67 of them**, at exactly the seam slots
 * (`0,9` `0,10` `63,9` `63,10` `9,0` `9,63` …). A player who found one walked off the edge of
 * the map. The generator the original ships stamps its pieces and then closes the outside; this
 * is that pass, and it runs **before** the arrival is chosen and before any passage is cut.
 *
 * The art is the level's own: each opening takes the first plain wall found inward along the
 * cell's own edge — the border wall the piece already used there — and only falls back to the
 * level's most common wall when there is none. The floor class of a sealed cell is left alone:
 * a wall with a floor under it is what the pieces carry on every other boundary cell too.
 *
 * @param {object} level  a raw assembled level, mutated in place
 * @returns {{sealed: number, cells: number[]}} how many openings were closed, and where
 */
export function sealBoundary(level) {
  const width = level?.width ?? 0;
  const depth = level?.depth ?? 0;
  if (!width || !depth || !level.map1) return { sealed: 0, cells: [] };
  const fallback = commonWallVoxel(level);
  const at = (row, col) => row * width + col;
  const cells = [];
  /** The first plain wall inward along `row`/`col`'s own edge, or the level's most common one. */
  const wallFor = (row, col, dr, dc) => {
    for (let step = 1; step < Math.max(width, depth); step++) {
      const r = row + dr * step;
      const c = col + dc * step;
      if (r < 0 || c < 0 || r >= depth || c >= width) break;
      const voxel = level.map1[at(r, c)];
      if (isPlainWall(voxel)) return voxel;
    }
    return fallback;
  };
  const seal = (row, col) => {
    const index = at(row, col);
    if (!walkableRaw(level, row, col)) return;
    const dr = row === 0 ? 1 : row === depth - 1 ? -1 : 0;
    const dc = dr === 0 ? (col === 0 ? 1 : -1) : 0;
    const voxel = wallFor(row, col, dr, dc);
    if (!voxel) return;
    level.map1[index] = voxel;
    cells.push(index);
  };
  for (let k = 0; k < width; k++) {
    seal(0, k);
    seal(depth - 1, k);
  }
  for (let k = 0; k < depth; k++) {
    seal(k, 0);
    seal(k, width - 1);
  }
  return { sealed: cells.length, cells };
}

/**
 * Is this cell on the level's own outer ring — the row or column against the void?
 *
 * Nothing may put the player here and nothing may cut a passage here: with `sealBoundary` run,
 * every such cell is a wall, and a passage carved into one would open the map again.
 */
export function onBoundary(level, row, col) {
  return row <= 0 || col <= 0 || row >= (level?.depth ?? 0) - 1 || col >= (level?.width ?? 0) - 1;
}

/**
 * Which four pieces a dungeon is built from.
 *
 * The file's pieces are named `brush1a` … `brush8d`: **eight level sets of four**, and the
 * trailing letter is the quadrant a piece was cut for. Assembling a set in its own letter
 * order (`a` north-west, `b` north-east, `c` south-west, `d` south-east) is what makes the
 * level one place: measured across all 8 sets and all 24 arrangements
 * (`tools/tmp-perms.mjs`), letter order is the best or joint-best for seven of the eight,
 * and it leaves the player able to walk 91–100% of the level's floor.
 *
 * Drawing four *arbitrary* pieces was tried first and is wrong: the pieces' openings all
 * sit at the same four cells, but each piece's interior corridors only lead to the borders
 * it was drawn for, so a level of pieces from four different sets comes out as two large
 * halves that never meet (measured: one draw in three had a region holding under 40% of the
 * floor).
 *
 * @param {number} seed
 * @param {number} count  how many pieces the file holds (32 in the shipped file)
 * @returns {number[]} four indices, NW…SE
 */
export function quadrantPicks(seed, count) {
  const sets = dungeonSets(count ?? QUADRANT_SLOTS.length);
  const set = new ArenaRandom((seed >>> 0) || 1).nextBelow(sets);
  return QUADRANT_SLOTS.map((_, slot) => set + slot * sets);
}

/**
 * Is this cell of a raw assembled level somewhere a player could stand or walk?
 *
 * The same reading `mifLevel.js` makes of a voxel, kept deliberately small: air, a flat
 * standing on the floor, an arch, and a door (the player opens it) are walkable; a chasm
 * floor is not; everything else is a wall. It exists so the assembly can tell whether it
 * has made one level rather than four sealed rooms **before** the decoder runs.
 *
 * @param {{width: number, map1: Uint16Array, flor: Uint16Array|null}} level
 * @param {number} row @param {number} col
 * @returns {boolean}
 */
export function walkableRaw(level, row, col) {
  if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return false;
  const index = row * level.width + col;
  const voxel = level.map1[index] ?? 0;
  // The chasm classes are the *documented* ones (`mifLevel.js`'s `CHASM_DRY`/`WET`/`LAVA`).
  const floorClass = ((level.flor?.[index] ?? 0) & 0xff00) >> 8;
  const chasm = floorClass === 0x0c || floorClass === 0x0d || floorClass === 0x0e;
  // **The decoder's own reading of a voxel** (`mifLevel.rawPassable`), not a second opinion:
  // this started as a private list of shapes (`0x8`, `0x9`, `0xb`) that called a fence (`0xa`)
  // and a non-solid arch walkable-or-not by accident, and it is the same reading the mesher, the
  // collider and the player get after decoding.
  return rawPassable(voxel, { chasm });
}

/**
 * Every cell a walk reaches from one, in a raw assembled level.
 * @param {object} level @param {number} row @param {number} col
 * @returns {Set<number>}
 */
export function walkFrom(level, row, col) {
  const seen = new Set();
  if (!walkableRaw(level, row, col)) return seen;
  const queue = [row * level.width + col];
  seen.add(queue[0]);
  while (queue.length) {
    const index = queue.pop();
    const r = Math.floor(index / level.width);
    const c = index % level.width;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (!walkableRaw(level, nr, nc)) continue;
      const next = nr * level.width + nc;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * The largest walkable region of a raw assembled level, and how much of its floor that is.
 * @param {object} level
 * @returns {{cells: Set<number>, walkable: number, largest: number, share: number}}
 */
export function largestRegion(level) {
  const seen = new Set();
  let largest = new Set();
  let walkable = 0;
  for (let row = 0; row < level.depth; row++) {
    for (let col = 0; col < level.width; col++) {
      if (!walkableRaw(level, row, col)) continue;
      walkable++;
      const index = row * level.width + col;
      if (seen.has(index)) continue;
      const region = walkFrom(level, row, col);
      for (const cell of region) seen.add(cell);
      if (region.size > largest.size) largest = region;
    }
  }
  return { cells: largest, walkable, largest: largest.size, share: walkable ? largest.size / walkable : 0 };
}

/**
 * The passages the original generator would have cut.
 *
 * Stamping four pieces makes four rooms with aligned doorways, not one level: a piece's rooms
 * open onto the borders its own set was cut for, and nowhere else, so a level assembled from
 * a set still comes out as a main floor plus **sealed pockets** — measured over the install's
 * eight sets with the chasm reading above, the arrival's region holds 66–92% of the walkable
 * cells, and on two sets the file's own header point lands in a closet holding 3% and 10%
 * (`tools/tmp-sets.mjs`). Arena's own generator does not ship that: it stamps the pieces and
 * then cuts the passages that join the regions it has made. This is that pass.
 *
 * The cut is the cheapest one available and it is deterministic. A 0-1 BFS (steps onto floor
 * are free, steps onto a wall cost one) from the arrival's own region gives every cell of the
 * grid the fewest walls that must come out to reach it; each other region is then joined by
 * removing exactly those walls along its shortest path. A removed cell becomes a **door leaf**
 * of the install's own art — the pieces are full of `0xB` voxels and one of the level's own is
 * copied into the passage — standing on the floor of the cell the path came from, so a
 * generated dungeon has its doorways exactly where the level needed them and the level's own
 * door system (locks, keys, opening) works on them like on any other door.
 *
 * @param {object} level  a raw assembled level, mutated in place
 * @param {{arrival?: {row: number, col: number}}} [opts]  the cell the player arrives on
 * @returns {{passages: number, carved: number, regions: number, cells: number[], set: boolean}}
 */
export function connectRegions(level, opts = {}) {
  const width = level?.width ?? 0;
  const depth = level?.depth ?? 0;
  const total = width * depth;
  const nothing = { passages: 0, carved: 0, regions: 0, cells: [], set: false };
  if (!width || !depth || !level.map1) return nothing;
  const at = (row, col) => row * width + col;
  const rowOf = (cell) => Math.floor(cell / width);
  const colOf = (cell) => cell % width;
  const walkable = (row, col) => walkableRaw(level, row, col);

  // The mass everything is joined to: the arrival's own region when the caller named a cell
  // that is really floor, otherwise the largest region of the raw level.
  let start = -1;
  if (opts.arrival && walkable(opts.arrival.row, opts.arrival.col)) start = at(opts.arrival.row, opts.arrival.col);
  if (start < 0) for (const cell of largestRegion(level).cells) { start = cell; break; }
  if (start < 0) return nothing;

  // 0-1 BFS out from the start over the whole grid: `distance[cell]` is the fewest walls
  // between the start and that cell, and `parent` remembers the step that got there.
  const distance = new Int32Array(total).fill(-1);
  const parent = new Int32Array(total).fill(-1);
  /** @type {number[][]} */
  const buckets = [];
  const push = (cost, cell) => { (buckets[cost] ??= []).push(cell); };
  distance[start] = 0;
  push(0, start);
  for (let cost = 0; cost < total; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (const cell of bucket) {
      if (distance[cell] !== cost) continue;
      const row = rowOf(cell);
      const col = colOf(cell);
      for (const [dr, dc] of NEIGHBOURS) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || c < 0 || r >= depth || c >= width) continue;
        const next = at(r, c);
        const step = walkable(r, c) ? 0 : 1;
        if (distance[next] >= 0 && distance[next] <= cost + step) continue;
        distance[next] = cost + step;
        parent[next] = cell;
        push(cost + step, next);
      }
    }
  }

  // Label the walkable regions, so each is joined exactly once.
  const region = new Int32Array(total).fill(-1);
  let regions = 0;
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const cell = at(row, col);
      if (region[cell] >= 0 || !walkable(row, col)) continue;
      const id = regions++;
      region[cell] = id;
      const queue = [cell];
      while (queue.length) {
        const here = queue.pop();
        const r = rowOf(here);
        const c = colOf(here);
        for (const [dr, dc] of NEIGHBOURS) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= depth || nc >= width) continue;
          const next = at(nr, nc);
          if (region[next] >= 0 || !walkable(nr, nc)) continue;
          region[next] = id;
          queue.push(next);
        }
      }
    }
  }
  const startRegion = region[start];
  if (regions <= 1) return { ...nothing, regions };

  // The nearest cell of every other region, nearest first.
  /** @type {Map<number, {cell: number, distance: number}>} */
  const nearest = new Map();
  for (let cell = 0; cell < total; cell++) {
    const id = region[cell];
    if (id < 0 || id === startRegion || distance[cell] < 0) continue;
    const best = nearest.get(id);
    if (!best || distance[cell] < best.distance) nearest.set(id, { cell, distance: distance[cell] });
  }
  const order = [...nearest.values()].sort((a, b) => a.distance - b.distance || a.cell - b.cell);

  // A doorway of the install's own art: the pieces are full of door voxels, so one of the
  // level's own is copied into every passage. Bare air only if the level holds no door at all.
  let doorVoxel = 0;
  for (let cell = 0; cell < total; cell++) {
    if (((level.map1[cell] & 0xf000) >> 12) === 0xb) { doorVoxel = level.map1[cell]; break; }
  }
  const carve = (cell, floorFrom) => {
    level.map1[cell] = doorVoxel;
    if (level.flor) {
      const source = level.flor[floorFrom] ?? 0;
      const cls = (source & 0xff00) >> 8;
      level.flor[cell] = cls === 0x0c || cls === 0x0d || cls === 0x0e ? 0x0100 : source;
    }
    if (level.map2 && !level.map2[cell]) level.map2[cell] = level.map2[floorFrom] ?? 0;
  };

  const carved = new Set();
  let passages = 0;
  for (const { cell } of order) {
    let joined = false;
    for (let walk = cell; walk >= 0 && distance[walk] > 0; walk = parent[walk]) {
      const from = parent[walk];
      if (from < 0) break;
      // **Never into the level's own outer ring.** With the boundary sealed these cells are
      // walls, so a path through one would be a path into the void — a passage cut here would
      // reopen the map. The BFS may still route through the ring in its arithmetic; the cut is
      // where that has to be refused.
      if (!walkable(rowOf(walk), colOf(walk)) && !onBoundary(level, rowOf(walk), colOf(walk))) {
        carve(walk, from);
        carved.add(walk);
        joined = true;
      }
    }
    if (joined) passages++;
  }
  return { passages, carved: carved.size, regions, cells: [...carved].sort((a, b) => a - b), set: passages > 0 };
}

/**
 * The arrival a `.MIF` header really names, or null when it names none.
 *
 * **The zero placeholder is not an arrival.** A `.MIF` header has room for four start points
 * and the install's own piece file uses one: `RANDOM1.MIF` answers
 * `[{x: 1344, y: 1344}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}]` — the rest are unused slots
 * left at zero. Read literally, `0 / 128 − 0.5` rounds to `-0`: **the corner of the map**, which
 * on the shipped pieces is a walkable cell like any other, so the arrival landed there and the
 * player started a dungeon in its north-west corner (measured: `Crypt of Hearts`, seed
 * 4164937535, arrived at `0,0`). A point at the origin names nothing, and a point outside the
 * level is not in it; either way this answers no arrival rather than that one.
 *
 * A point that is on the level's own **outer ring** is refused for the same reason the boundary
 * is sealed: the cell above it is the void.
 *
 * @param {{x: number, y: number}[]} [startPoints]  the header's own points, in Arena units
 * @param {number} width @param {number} depth
 * @returns {{row: number, col: number}|null}
 */
export function headerArrival(startPoints, width, depth) {
  for (const point of startPoints ?? []) {
    const x = Number(point?.x) || 0;
    const y = Number(point?.y) || 0;
    if (x <= 0 && y <= 0) continue;                       // an unused slot, not a place
    const row = Math.round(y / 128 - 0.5);
    const col = Math.round(x / 128 - 0.5);
    if (row < 0 || col < 0 || row >= depth || col >= width) continue;
    if (row === 0 || col === 0 || row === depth - 1 || col === width - 1) continue;
    return { row, col };
  }
  return null;
}

/**
 * Where a player arrives in an assembled level: the source file's own point when it opens
 * onto the level, and otherwise the cell of the level's **largest walkable region** nearest
 * its middle.
 *
 * The fallback is the point of the whole exercise. `RANDOM1.MIF`'s header names where its
 * level begins, and that point lies in the piece the file was cut to put north-west; an
 * assembled level may put a different piece there, and the header's point is then a closet
 * with no way out — measured on the real file, a draw in seven left the player in a room
 * holding 2% of the level. A fixed centre cell is no better: standable in a closet as
 * readily as in a hall.
 *
 * `level` is a **decoded** level (`mifLevel.js`), so "walkable" here is the same reading the
 * mesher, the collider and the player use: not solid (or a door, which opens), and not a
 * chasm. Returns a cell, and the caller places the player on it.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {{x: number, y: number}[]} [startPoints]  the source file's header points
 * @returns {{row: number, col: number, from: 'header'|'region'}|null}
 */
export function spawnCellFor(level, startPoints = []) {
  const width = level?.width ?? 0;
  const depth = level?.depth ?? 0;
  if (!width || !depth) return null;
  // A chasm is a hole in the floor, and `chasm` is the *kind* of hole (`'dry'`, `'wet'`,
  // `'lava'`) or null — never `true`. Written as a truthiness test because testing for `true`
  // counted every chasm as floor: the largest region then spanned the pits, and a header
  // point standing on the edge of one counted as an arrival (measured — the assembler's own
  // `connectRegions` and the tests read it the same way).
  const passable = (row, col) => {
    if (row < 0 || col < 0 || row >= depth || col >= width) return false;
    const cell = level.cells[row * width + col];
    return Boolean(cell) && !cell.floor?.chasm && (!cell.solid || cell.kind === 'door');
  };
  // Every walkable region, so both answers below come from one reading of the level.
  /** @type {Set<number>} */
  const seen = new Set();
  /** @type {number[]} */
  let largest = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      if (!passable(row, col)) continue;
      const index = row * width + col;
      if (seen.has(index)) continue;
      const region = [];
      const queue = [index];
      seen.add(index);
      while (queue.length) {
        const at = queue.pop();
        region.push(at);
        const r = Math.floor(at / width);
        const c = at % width;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (!passable(nr, nc)) continue;
          const next = nr * width + nc;
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      if (region.length > largest.length) largest = region;
    }
  }
  if (!largest.length) return null;
  const inside = new Set(largest);
  // The file's own arrival, kept only when the level still leads out of it: a header point is
  // *passable* in a closet too, and a closet is where the player would then spend the level.
  const header = headerArrival(startPoints, width, depth);
  if (header && inside.has(header.row * width + header.col)) return { ...header, from: 'header' };
  // Otherwise the largest region, entered at the cell nearest the middle of the level — and
  // never on its outer ring, which is the void.
  let middle = null;
  for (const cell of largest) {
    if (onBoundary(level, Math.floor(cell / width), cell % width)) continue;
    const r = Math.floor(cell / width);
    const c = cell % width;
    const distance = Math.abs(r - (depth - 1) / 2) + Math.abs(c - (width - 1) / 2);
    if (!middle || distance < middle.distance) middle = { row: r, col: c, distance };
  }
  return { row: middle.row, col: middle.col, from: 'region' };
}

/**
 * Assemble one dungeon level out of four pieces.
 *
 * The result is the same shape `arena/mifFile.js` produces for a level, so the
 * existing decoder, mesher, collider and item reader need nothing new — and so does
 * the game: a generated dungeon is a dungeon, not a special case.
 *
 * @param {object} opts
 * @param {object[]} opts.blocks   the pieces (`RANDOM1.MIF`'s levels)
 * @param {number} opts.seed       the dungeon's own seed
 * @param {string} [opts.info]     the `.INF` name, default the blocks' own `RD1.INF`
 * @param {{x:number,y:number}[]} [opts.startPoints]  the source file's header points
 * @param {(msg: string) => void} [opts.onWarn]
 * @returns {{width: number, depth: number, flor: Uint16Array, map1: Uint16Array, map2: Uint16Array|null,
 *   startPoints: {x:number,y:number}[], targ: object[], lock: object[], trig: object[],
 *   flat: Uint8Array|null, inns: Uint8Array|null, loot: Uint8Array|null, stor: Uint8Array|null,
 *   name: string, info: string, numf: number, warnings: string[], quadrants: number[], generated: true}}
 */
export function assembleDungeon(opts) {
  const { blocks, seed, info = DUNGEON_BLOCKS_INF, startPoints = [], onWarn = () => {} } = opts;
  if (!blocks?.length) throw new Error('assembleDungeon needs the install\'s dungeon pieces (RANDOM1.MIF)');
  const size = BRUSH_SIZE;
  const width = DUNGEON_LEVEL_SIZE;
  const depth = DUNGEON_LEVEL_SIZE;
  const flor = new Uint16Array(width * depth);
  const map1 = new Uint16Array(width * depth);
  const map2 = new Uint16Array(width * depth);
  const picks = quadrantPicks(seed, blocks.length);
  const warnings = [];
  let hasMap2 = false;

  picks.forEach((levelIndex, slot) => {
    const block = blocks[levelIndex];
    const [originRow, originCol] = QUADRANT_SLOTS[slot];
    if (!block?.map1) {
      warnings.push(`piece ${levelIndex} has no MAP1; its quadrant is left empty`);
      onWarn(`dungeon piece ${levelIndex} has no MAP1`);
      return;
    }
    if (block.map2) hasMap2 = true;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const src = row * size + col;
        const dst = (originRow + row) * width + (originCol + col);
        flor[dst] = block.flor ? block.flor[src] : 0;
        map1[dst] = block.map1[src];
        map2[dst] = block.map2 ? block.map2[src] : 0;
      }
    }
  });

  // ── the outside of the level ────────────────────────────────────────────────
  //
  // Four pieces put eight of their borders on the finished level's *outside*, and every one of
  // those borders has a doorway in it (that is what makes a seam work). Sealed here — on the
  // **voxels**, before the arrival is chosen and before any passage is cut — so that nothing
  // downstream can plan a route through a hole: measured before this pass existed, every
  // generated dungeon had 32–67 walkable cells on its own outer ring
  // (`tools/dungeon-audit.mjs`) and a player who found one walked off the map.
  const sealed = sealBoundary({ width, depth, map1 });
  if (sealed.sealed) onWarn(`closed ${sealed.sealed} opening(s) in the level's outer wall`);

  // The seams, checked rather than assumed: every shipped piece opens at the same four
  // cells, and if a player's file ever does not, the levels would be four sealed rooms
  // and this says so instead of quietly shipping a maze nobody can walk.
  for (const [leftSlot, rightSlot] of [[0, 1], [2, 3]]) {
    const a = blocks[picks[leftSlot]];
    const b = blocks[picks[rightSlot]];
    if (a?.map1 && b?.map1 && !seamsAgree(borderOpenings(a), borderOpenings(b), 'vertical')) {
      warnings.push(`pieces ${picks[leftSlot]} and ${picks[rightSlot]} do not open onto each other`);
    }
  }
  for (const [topSlot, bottomSlot] of [[0, 2], [1, 3]]) {
    const a = blocks[picks[topSlot]];
    const b = blocks[picks[bottomSlot]];
    if (a?.map1 && b?.map1 && !seamsAgree(borderOpenings(a), borderOpenings(b), 'horizontal')) {
      warnings.push(`pieces ${picks[topSlot]} and ${picks[bottomSlot]} do not open onto each other`);
    }
  }

  const names = picks.map((index) => blocks[index]?.name || `piece ${index}`);
  const level = {
    width,
    depth,
    flor,
    map1,
    map2: hasMap2 ? map2 : null,
    // The level's own placement records: the pieces carry none that name a *cell* of the
    // finished level (their `TARG`/`LOCK`/`TRIG` entries are quadrant-local), so items and
    // keys are placed by the game's own rules on top of the geometry (`dungeonItems.js`,
    // `doors.js`), exactly as they are in a map dungeon whose records this install lacks.
    targ: [],
    lock: [],
    trig: [],
    flat: null,
    inns: null,
    loot: null,
    stor: null,
    // The source file's own arrival points, passed through: whether the assembled level can
    // use one is decided on the *decoded* level, by `spawnCellFor` (the scene calls it once
    // the level is decoded, because that is when "walkable" means what the player meets).
    startPoints,
    name: names.join(' + '),
    info,
    numf: blocks[picks[0]]?.numf ?? 0,
    warnings,
    quadrants: picks,
    sealed,
    generated: true,
  };

  // ── the passages, and the way out ───────────────────────────────────────────
  //
  // Stamping four pieces makes four rooms with aligned doorways, not one level: a piece's
  // rooms open onto the borders its own set was cut for and nowhere else, so an assembled
  // level still comes out as a main floor plus **sealed pockets** (measured: 66–92% of the
  // walkable cells reachable from the arrival, and on two of the install's eight sets the
  // file's own header point lands in a closet holding 3% and 10%). Arena's generator does
  // not ship that — it stamps the pieces and then cuts the passages that join what it has
  // made — so this does the same, in the same place in the pipeline: on the assembled
  // *voxels*, before anything decodes them. `connectRegions` is the pass and its own header
  // is the argument; what matters here is that the arrival is chosen BEFORE the cut, so the
  // cut joins the level to the region the player really starts in.
  const arrival = opts.arrival ?? rawArrivalFor(level, startPoints);
  if (arrival && opts.connect !== false) {
    level.arrival = arrival;
    level.passages = connectRegions(level, { arrival });
    if (level.passages.regions > 1 && !level.passages.set) {
      warnings.push(`the level's ${level.passages.regions} regions could not be joined`);
      onWarn('the assembled level has regions that could not be joined');
    }
  }
  // The way out. A generated level's pieces carry no stairway of their own (measured: the
  // `RANDOM1.MIF` pieces hold no `STAIRUP`/`STAIRDWN`/`GATE` voxel at all — they are walls,
  // doors and flats), so a generated dungeon had **no exit**: `]` was the only way back to
  // the surface. The original's own art for it is the INF's `*LEVELUP` texture (the same
  // art the install's dungeons use for their stairs and the Imperial Dungeons use for its
  // gate), and this stamps it into the wall beside the arrival — where a player arrives
  // facing it, and where stepping into it leaves the level.
  if (arrival && Number.isInteger(opts.exitVoxel) && opts.exitVoxel > 0) {
    level.exit = stampExit(level, { row: arrival.row, col: arrival.col, voxel: opts.exitVoxel });
  }
  return level;
}

/**
 * The cell a player arrives on, read off the **raw** voxels.
 *
 * The same rule `spawnCellFor` applies to a decoded level (the file's own header point when
 * the level leads out of it, otherwise the cell nearest the middle of the largest region),
 * asked before the decoder runs — because the connecting pass below has to know which region
 * is the player's before it cuts anything. `walkableRaw` is the raw reading the pass itself
 * uses, so the two agree by construction.
 *
 * @param {{width: number, depth: number, map1: Uint16Array, flor: Uint16Array|null}} level
 * @param {{x: number, y: number}[]} [startPoints]
 * @returns {{row: number, col: number, from: 'header'|'region'}|null}
 */
export function rawArrivalFor(level, startPoints = []) {
  const { width, depth } = level ?? {};
  if (!width || !depth || !level.map1) return null;
  const region = largestRegion(level);
  // `cells` is a **Set** (`largestRegion`), not an array: `!set.length` is always true, which
  // is how the first version of this returned null for every level and the whole passage pass
  // silently did nothing (measured: `arrival undefined`, zero stairs stamped, the level
  // still four sealed quadrants). Caught by asking the assembled level how many regions it
  // had left after the cut, in `tools/tmp-exit.mjs`.
  if (!region.cells.size) return null;
  const inside = region.cells;
  const header = headerArrival(startPoints, width, depth);
  if (header && inside.has(header.row * width + header.col)) return { ...header, from: 'header' };
  let middle = null;
  for (const cell of region.cells) {
    const r = Math.floor(cell / width);
    const c = cell % width;
    // Never the outer ring: the level's boundary is the void, and a player who arrives on it
    // arrives with one wall missing.
    if (onBoundary(level, r, c)) continue;
    const distance = Math.abs(r - (depth - 1) / 2) + Math.abs(c - (width - 1) / 2);
    if (!middle || distance < middle.distance) middle = { row: r, col: c, distance };
  }
  return middle ? { row: middle.row, col: middle.col, from: 'region' } : null;
}

/**
 * Put the level's own stair art in a wall beside a cell — the way out of a generated level.
 *
 * The voxel written is the wall encoding of one of the level's own `.INF` texture indices
 * (`most === least`, `mifLevel.js`), which is what makes the art resolve: nothing new is
 * invented, the doorway the install's dungeons use for their stairs is reused.
 *
 * The search is a ring around the cell, nearest first, and it only takes a cell that is
 * **solid and plain** — a wall, an arch or a diagonal, never a door, an entity or a raised
 * platform, and never a cell that is already a stair. The cell it chooses is reported, so
 * the game can point at it.
 *
 * @param {{width: number, depth: number, map1: Uint16Array, flor: Uint16Array|null}} level
 * @param {{row: number, col: number, voxel: number, radius?: number}} opts
 * @returns {{row: number, col: number, voxel: number, replaced: number}|null}
 */
export function stampExit(level, opts) {
  const { row, col, voxel, radius = 4 } = opts;
  if (!level?.map1 || !(voxel > 0)) return null;
  const plain = (r, c) => {
    if (r < 0 || c < 0 || r >= level.depth || c >= level.width) return false;
    const value = level.map1[r * level.width + c];
    const kind = (value & 0xf000) >> 12;
    // A wall (`isPlainWall`), an arch (`0x9`), a fence (`0xA`) or a plain diagonal (`0xD`) —
    // never air (`isPlainWall` refuses it: **this is the cell the stair was being written into**,
    // one pace from the arrival), never a door (`0xB`, and what the connecting pass cuts), never
    // an entity (`0x8`, art on the floor), never a raised platform (whose two bytes differ) and
    // never a cell that is already this stair.
    if (!(isPlainWall(value) || kind === 0x9 || kind === 0xa || kind === 0xd)) return false;
    return value !== voxel;
  };
  for (let r = 1; r <= radius; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
        const at = (row + dr) * level.width + (col + dc);
        if (!plain(row + dr, col + dc)) continue;
        const replaced = level.map1[at];
        level.map1[at] = voxel;
        return { row: row + dr, col: col + dc, voxel, replaced };
      }
    }
  }
  return null;
}

/**
 * How many whole levels the file of pieces can make: one per set of four pieces.
 *
 * The shipped `RANDOM1.MIF` holds 32 pieces and is therefore **eight** levels, not one —
 * the original's own eight brush sets. A dungeon's seed picks one of them.
 */
export function assembledLevelCount(blockCount) {
  return Math.max(1, Math.floor(blockCount / QUADRANT_SLOTS.length));
}

/** How many level sets a file of `count` pieces holds — what a dungeon's seed chooses from. */
export function dungeonSets(count) {
  return Math.max(1, Math.floor((count ?? 0) / QUADRANT_SLOTS.length));
}
