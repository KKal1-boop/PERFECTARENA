// THE FURNITURE — WHAT A ROOM IS *DRESSED* WITH AFTER ITS WALLS EXIST.
//
// Arena's interiors ship with their own flat records (a tavern's tables are the .INF's
// own), but the decoded install places only a thin few: a county of bare stone rooms
// where a tavern should read as a tavern and a noble house as a noble house. This module
// adds the dressing: **Arena's own flat art**, archived right there in `GLOBAL.BSA`, put
// on the floor where the room's own shape and family call for it.
//
// ## What is the original's and what is reconstructed
//
// **The art, the palette and the placement are the install's own**: `TABLE.IMG`,
// `CHAIR3.IMG`, `SHELF1.IMG`, `BED.IMG`, `BARREL.IMG`, `BOOKS1.IMG`, `COFFIN1.IMG`,
// `BONES1.IMG`, `TORCH1/3/5.IMG`, `REDRUG.IMG`, `BLUERUG.IMG` — every one drawn by the
// same billboard pipeline the level's own flats use, at the art's own size, on the floor.
// (The `.N*`/`.S*` continent-palette variants of the same props are left to the flat
// loader's own palette choice.)
//
// **Which room carries which prop is RECONSTRUCTED** — the block→furniture table lives in
// `A.EXE` along with the rest of the interior inventory (the same absence the whole
// interior pass already ran with), so each family's kit is listed here by its name for
// the art it draws, and every figure is deterministic in the room's seed: the same door
// opens into the same dressed room.
//
// The rules that keep it *going to look finished* rather than littered:
//
//   1. **A walkway is never dressed.** Nothing stands in a door cell, beside a door, or
//      on a cell the room's own art already decorates; a player walks everywhere they
//      could before.
//   2. **Wall-huggers hug walls**: beds, shelves, coffins and bookshelves stand against a
//      solid neighbour, the way real rooms furnish.
//   3. **Torches are furniture too, and they are light**: a torch on a wall-adjacent cell
//      lights the room through `game/sceneLighting.js`'s own `FIRE_ART` table, so a
//      dressed interior is a *lit* interior — the same pass that lights a walled city.
//   4. **A floor is not a warehouse**: density caps (a prop about every fifth free cell,
//      and a per-room cap) stop the pass before a room reads as clutter.
//
// Nothing here touches the DOM or the renderer: cells in, a flat list out, and the scene
// merges it with the level's own flats before the billboard batches are built.

import { ArenaRandom } from './arenaRandom.js';

/**
 * Each interior family's furniture kit.
 *
 * `wall` props stand against a solid neighbour; `floor` props stand anywhere open (a
 * table in the middle of a tavern is *correct*); `rare` props appear at most once per
 * room, on a free floor cell away from the walls. Torches go in `wall` of every kit —
 * they are the light, and no family lives in the dark.
 *
 * @type {Record<string, {wall: string[], floor: string[], rare: string[], torch: string[]}>}
 */
export const FURNITURE = Object.freeze({
  // The smith's shop: stands and shelves against the walls, a work table, barrels.
  EQUIP: Object.freeze({
    wall: Object.freeze(['SHELF1.IMG', 'BARREL.IMG', 'TORCH3.IMG']),
    floor: Object.freeze(['TABLE.IMG', 'BARREL.IMG']),
    rare: Object.freeze(['SHELF2.IMG']),
    torch: 'TORCH3.IMG',
  }),
  // The tavern: tables and chairs in the middle of the room, barrels along a wall.
  TAVERN: Object.freeze({
    wall: Object.freeze(['BARREL.IMG', 'SHELF1.IMG', 'TORCH1.IMG']),
    floor: Object.freeze(['TABLE1.IMG', 'CHAIR3.IMG']),
    rare: Object.freeze(['TABLE3.IMG']),
    torch: 'TORCH1.IMG',
  }),
  // The college: bookshelves and a desk, green torches for the reading.
  MAGE: Object.freeze({
    wall: Object.freeze(['SHELF1.IMG', 'BOOKS1.IMG', 'TORCH5.IMG']),
    floor: Object.freeze(['TABLE.IMG']),
    rare: Object.freeze(['BOOKS2.IMG']),
    torch: 'TORCH5.IMG',
  }),
  // The noble house: a bed against the wall, chairs, a carpet, bright torches.
  NOBLE: Object.freeze({
    wall: Object.freeze(['BED.IMG', 'SHELF2.IMG', 'TORCH1.IMG']),
    floor: Object.freeze(['CHAIR3.IMG', 'TABLE1.IMG']),
    rare: Object.freeze(['REDRUG.IMG', 'BLUERUG.IMG', 'FLAG.IMG']),
    torch: 'TORCH1.IMG',
  }),
  // The temple: an ordered, sparse room — benches like tables, a banner, candles.
  TEMPLE: Object.freeze({
    wall: Object.freeze(['SHELF2.IMG', 'TORCH3.IMG']),
    floor: Object.freeze(['TABLE3.IMG', 'FLAG.IMG']),
    rare: Object.freeze(['BOOKS1.IMG']),
    torch: 'TORCH3.IMG',
  }),
  // The watch tower: bones come with falling along, a barrel, marching torches.
  TOWER: Object.freeze({
    wall: Object.freeze(['BARREL.IMG', 'TORCH1.IMG']),
    floor: Object.freeze(['BONES1.IMG']),
    rare: Object.freeze(['BONES3.IMG']),
    torch: 'TORCH1.IMG',
  }),
  // The crypt: coffins against every wall, bones scattered over the floor.
  WCRYPT: Object.freeze({
    wall: Object.freeze(['COFFIN1.IMG', 'COFFIN2.IMG', 'TORCH3.IMG']),
    floor: Object.freeze(['BONES1.IMG']),
    rare: Object.freeze(['BONES5.IMG']),
    torch: 'TORCH3.IMG',
  }),
});

/** Which records the family prefixes name. */
export function familyOf(infName) {
  const name = String(infName ?? '').toUpperCase();
  for (const family of Object.keys(FURNITURE)) {
    if (name.startsWith(family) || name.startsWith(`${family}A`) || name.startsWith(`${family}?`)) return family;
  }
  return null;
}

// The placement budgets, named so a test can read the intent rather than re-derive it.
/** A prop about every fifth free cell, i.e. furniture you notice without tripping over. */
export const DENSITY = 5;
/** A room never carries more than this many props — even a hall-sized one. */
export const ROOM_CAP = 60;
/** No prop within this many cells of a door: the room's own mouth stays empty. */
export const DOOR_CLEARANCE = 1;
/** At most one torch every this many wall cells, so light collects rather than stripes. */
export const TORCH_STRIDE = 6;

/** @typedef {{row: number, col: number}} Cell */

/**
 * Is any of the four orthogonal neighbours a wall? (Diagonals do not count — a prop in a
 * corner's pocket is fine to move about.)
 *
 * @param {number} row @param {number} col
 * @param {(row: number, col: number) => boolean} solidAt  reads *out* of the caller's level
 * @returns {boolean}
 */
export function hugsWall(row, col, solidAt) {
  return solidAt(row - 1, col) || solidAt(row + 1, col) || solidAt(row, col - 1) || solidAt(row, col + 1);
}

/**
 * Dress one room.
 *
 * @param {object} opts
 * @param {string} opts.infName    the level's own `.INF` name — the family comes from its prefix
 * @param {Cell[]} opts.open       every standable cell that is *not* a wall and *not* a chasm
 * @param {Cell[]} [opts.occupied] cells the level's own art already decorates (skipped)
 * @param {Cell[]} [opts.doors]    the room's doors, kept clear by `DOOR_CLEARANCE`
 * @param {(row: number, col: number) => boolean} opts.solidAt  "is this cell wall?" read from the level
 * @param {number} [opts.seed]
 * @returns {{family: string|null, props: {name: string, row: number, col: number}[], torches: number}}
 */
export function furnishRoom({ infName, open, occupied = [], doors = [], solidAt, seed = 1 }) {
  const family = familyOf(infName);
  const kit = family ? FURNITURE[family] : null;
  const props = [];
  if (!kit) return { family, props, torches: 0 };

  const taken = new Set(occupied.map((c) => `${c.row},${c.col}`));
  const isDoor = new Set();
  for (const door of doors) {
    for (let dr = -DOOR_CLEARANCE; dr <= DOOR_CLEARANCE; dr++) {
      for (let dc = -DOOR_CLEARANCE; dc <= DOOR_CLEARANCE; dc++) {
        isDoor.add(`${door.row + dr},${door.col + dc}`);
      }
    }
  }

  const candidates = open.filter((c) => {
    const key = `${c.row},${c.col}`;
    return !taken.has(key) && !isDoor.has(key);
  });
  const wallSide = candidates.filter((c) => hugsWall(c.row, c.col, solidAt));
  const heartSide = candidates.filter((c) => !hugsWall(c.row, c.col, solidAt));

  const random = new ArenaRandom((seed >>> 0) || 1);
  const budget = Math.min(ROOM_CAP, Math.floor(candidates.length / DENSITY) + 2);
  const take = (list) => {
    if (!list.length) return null;
    const pick = random.nextBelow(list.length);
    const cell = list[pick];
    list.splice(pick, 1);
    return cell;
  };
  const stand = (name, cell) => {
    if (!cell || props.length >= budget) return false;
    taken.add(`${cell.row},${cell.col}`);
    props.push({ name, row: cell.row, col: cell.col });
    // Every torch — the kit's own or one a filler picked from `kit.wall` — is a *light*
    // as well as a prop (`game/sceneLighting.js`'s `FIRE_ART`), so the room's lit count
    // is what the lights pass will actually see.
    if (name === kit.torch || name.startsWith('TORCH')) torchCount++;
    return true;
  };

  let torchCount = 0;
  // ── wall furniture first, in reading order along the room's own perimeter ───
  // Shuffle-free sweep, north to south, west to east: a shelf runs by shelf-hug and the
  // room keeps its shape instead of looking scattered. The wall sweep is capped ahead of
  // the share the room's heart is owed — a wall sweep that eats the whole budget fills
  // the walls and leaves the tavern without its tables.
  const wallCells = [...wallSide].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  // ── the room's heart: tables and chairs on the open floor, not shoved against a wall 
  // The tavern's table is its *point*, so the budget is split — roughly 40% to the walls
  // (torches included), the rest to the heart — and the rugs in `kit.rare` land only on
  // cells that are not wall-adjacent, because a carpet hugs nobody.
  const wallBudget = Math.max(2, Math.floor(budget * 2 / 5));
  for (let i = 0; i < wallCells.length && props.length < wallBudget; i++) {
    const cell = wallCells[i];
    // **Every dressed room is lit.** The sweep's first wall cell *always* takes the kit's
    // torch — a room with no light in it is undone dresswork — and the later stride cells
    // add more while the room is wide, at the same 72-in-100 appetite the rest keep.
    const wantTorch = i === 0 || (i % TORCH_STRIDE === 0 && random.nextBelow(100) < 72);
    if (wantTorch && stand(kit.torch, cell)) continue;
    if (random.nextBelow(100) < 55) stand(kit.wall[random.nextBelow(kit.wall.length)], cell);
  }

  const heartBudget = Math.max(2, budget - wallBudget);
  let heart = 0;
  while (heart < heartBudget && heartSide.length && props.length < budget) {
    if (!stand(kit.floor[random.nextBelow(kit.floor.length)], take(heartSide))) break;
    heart++;
  }
  // ── rare props: at most two a room, on the open floor furthest from the walls ──
  for (const name of kit.rare) {
    if (!heartSide.length || props.length >= budget) break;
    stand(name, take(heartSide));
  }
  // ── the rest of the budget: more wall dressing, then more floor dressing ──
  while (props.length < budget && wallCells.length && random.nextBelow(100) < 45) {
    if (!stand(kit.wall[random.nextBelow(kit.wall.length)], take(wallCells))) break;
  }
  while (props.length < budget && heartSide.length) {
    if (!stand(kit.floor[random.nextBelow(kit.floor.length)], take(heartSide))) break;
  }

  return { family, props, torches: torchCount };
}
