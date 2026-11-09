// THE AUTOMAP — the level the player is standing in, drawn the way Arena drew it.
//
// The port has had a world map since the beginning (`M`) and **no map of the level at all**: in a
// dungeon, a shop or the palace `M` opened the continent, which is the one map that cannot answer
// "where am I". The owner's own complaint about navigation — *"you dont understand where you are
// going"* — is that hole, and Arena's automap is the feature that fills it.
//
// **`M` was never the automap's to take.** When this pass first bound the level sheet to `M` the
// owner reported the consequence exactly: *"your local map made it impossible to open the entire
// tamriel map the game had cause you put it on M"*. The automap therefore lives on **`Tab`**, and
// `M` remains Tamriel in every place — the sheet also carries its own "world map of Tamriel"
// button, so neither map is ever a dead end.
//
// ## What is ported, and from where
//
// Every law below is **OpenTESArena's** (`src/Interface/AutomapUiMVC.{h,cpp}`, MIT), which is this
// project's standing reference for the numbers that live in the executable:
//
//   * **The colours are Arena's automap palette, not a designer's** — `ColorWall(130,89,48)`,
//     `ColorRaised(97,85,60)`, `ColorDoor(146,0,0)`, `ColorLevelUp(0,105,0)`,
//     `ColorLevelDown(0,0,255)`, `ColorDryChasm(20,40,40)`, `ColorWetChasm(109,138,174)`,
//     `ColorLavaChasm(255,0,0)`, `ColorPlayer(247,255,0)`. Ground is **transparent** over the
//     automap's parchment sheet, which is why the page draws floor cells as the parchment and
//     everything else as a painted pixel.
//   * **What each voxel draws as** is `getPixelColor`: a dry chasm under a wall is `raised`, lava
//     and water are chasms unless a raised platform stands over them, a door and a city gate and
//     Enter/Exit Interior are `door`, a level change is `levelUp`/`levelDown` (the `.INF`'s own
//     stair art — `mifLevel.stairKindOf` already reads it), a hedge (a transparent wall **with**
//     collision) is a wall while an archway is floor, and a diagonal is floor.
//   * **The player is a 3×3 arrow inside one cell**, one pattern per cardinal direction
//     (`PlayerArrowPatterns`), drawn in `ColorPlayer`. The eight patterns below are that table.
//     `PixelSize = 3` is why the cell scale is a multiple of three: one arrow sub-pixel is one
//     third of a cell.
//
// ## What is this project's, and stamped as such
//
//   * **The presentation**: OpenTESArena scrolls a 3-chunk window with a quill cursor; this page
//     draws the **whole level fitted to the panel** (with the level's name and number), because a
//     browser canvas has the room and a fitted map answers "where am I" in one look. The arrow,
//     the colours and what every cell means are still the reference's.
//   * **The compass names**: the screen's own axes. On this page `+col` is east and `+row` is
//     south (the world map's own orientation — `tamrielGrid.pixelOfCell` puts `col` on the pixel's
//     x and `row` on its y), so a yaw of 0 faces east. No wall-clock or Tamriel-compass claim is
//     made beyond that.
//   * **Nothing is hidden**: OpenTESArena builds its automap from the level's loaded chunks, and
//     there is no fog-of-war in that reference, so this map draws the level complete. If the
//     original revealed it cell by cell, that is a later rule to add on top of this law.
//
// A level is drawn whether the player is in a dungeon, a building or the palace; a **city** and
// the **country** have no local sheet (`Tab` says so), because there `M` has always meant Tamriel
// and still does.

import { CELL_SIZE } from './mifMesh.js';
import { isVoidCell } from './mifLevel.js';

/**
 * Arena's automap palette (`AutomapUiMVC.h`). Ground is the parchment sheet itself, so `floor`
 * is a *colour to draw*, not a transparent hole: the panel is parchment and a floor cell simply
 * leaves it showing.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const AUTOMAP_COLORS = Object.freeze({
  floor: '#c9b78f',
  wall: '#825930',       // (130, 89, 48)
  raised: '#61553c',     // (97, 85, 60)
  door: '#920000',       // (146, 0, 0)
  levelUp: '#006900',    // (0, 105, 0)
  levelDown: '#0000ff',  // (0, 0, 255)
  dryChasm: '#142828',   // (20, 40, 40)
  wetChasm: '#6d8aae',   // (109, 138, 174)
  lavaChasm: '#ff0000',  // (255, 0, 0)
  player: '#f7ff00',     // (247, 255, 0)
});

/** Every cell kind, in the order the legend reads. */
export const AUTOMAP_KINDS = Object.freeze([
  'floor', 'wall', 'raised', 'door', 'levelUp', 'levelDown',
  'dryChasm', 'wetChasm', 'lavaChasm', 'void',
]);

/** The legend a panel prints: the five marks a player has to be able to tell apart. */
export const AUTOMAP_LEGEND = Object.freeze([
  Object.freeze({ kind: 'wall', label: 'wall' }),
  Object.freeze({ kind: 'door', label: 'door' }),
  Object.freeze({ kind: 'levelUp', label: 'up a level' }),
  Object.freeze({ kind: 'levelDown', label: 'down a level' }),
  Object.freeze({ kind: 'wetChasm', label: 'water' }),
  Object.freeze({ kind: 'lavaChasm', label: 'lava' }),
  Object.freeze({ kind: 'dryChasm', label: 'a pit' }),
]);

/**
 * **One voxel's automap mark**, read exactly as `AutomapUiView::getPixelColor` reads it.
 *
 * `level.cells` is the decoded level (`mifLevel.decodeLevel`), so the fields this asks for are
 * the decoder's own: `floor.chasm`, `kind`, `solid`, `stair`.
 *
 * @param {object|null} cell
 * @returns {'floor'|'wall'|'raised'|'door'|'levelUp'|'levelDown'|'dryChasm'|'wetChasm'|'lavaChasm'|'void'}
 */
export function automapKindOf(cell) {
  if (!cell) return 'void';
  const chasm = cell.floor?.chasm ?? null;
  if (chasm) {
    // A dry chasm with a wall over it is the reference's `ColorRaised`; water and lava ignore
    // everything but a raised platform, because they are what the eye is looking for.
    if (cell.kind === 'raised') return 'raised';
    if (chasm === 'dry' && (
      cell.kind === 'wall' || cell.kind === 'edge' || cell.kind === 'transparent' && cell.solid
    )) return 'raised';
    if (chasm === 'wet') return 'wetChasm';
    if (chasm === 'lava') return 'lavaChasm';
    return 'dryChasm';
  }
  // A stairway is a **wall cell painted with the INF's own stair art**, so it is asked before
  // the wall is (the same order `stairKindOf` reads it in).
  if (cell.stair === 'up') return 'levelUp';
  if (cell.stair === 'down') return 'levelDown';
  if (cell.kind === 'door') return 'door';
  if (cell.kind === 'wall' || cell.kind === 'edge') return 'wall';
  if (cell.kind === 'raised') return 'raised';
  // A hedge blocks and an archway does not — the reference's own distinction.
  if (cell.kind === 'transparent') return cell.solid ? 'wall' : 'floor';
  // A diagonal wall is drawn as floor by the reference (`wallType == Diagonal` → `ColorFloor`).
  if (cell.kind === 'diagonal') return 'floor';
  // A cell with no floor at all and nothing over it is not part of the map — the margin a
  // level's grid leaves around itself (`mifLevel.js`'s `isVoidCell`, which is this rule's one
  // home: the objective walk and the marker placement read it too).
  if (isVoidCell(cell)) return 'void';
  return 'floor';
}

/**
 * **A level's automap, as a grid of marks** — one reading, no hidden state.
 *
 * `kinds` is indexed `row * width + col`, the same index `level.cells` uses, so `automapAt` is
 * the only reader a caller needs. `counts` is the legend's own numbers (the pad and the report
 * both read it), and `walkable` counts every cell a body can stand in or swim through.
 *
 * **The canvas rides with it** (`levelCanvas`): the sheet is drawn over the part of the grid the
 * level really fills, so a storey that uses less of the file's grid than the header declares is
 * drawn at its own size instead of floating in a page of empty parchment.
 *
 * @param {{width:number, depth:number, cells:object[], canvas?:object|null}|null} level
 * @returns {{width:number, depth:number, kinds:string[], counts:Record<string, number>, walkable:number,
 *   canvas:{row0:number,row1:number,col0:number,col1:number}|null}}
 */
export function buildAutomap(level) {
  const width = Math.max(0, Math.trunc(level?.width ?? 0));
  const depth = Math.max(0, Math.trunc(level?.depth ?? 0));
  const kinds = new Array(width * depth);
  const counts = Object.fromEntries(AUTOMAP_KINDS.map((kind) => [kind, 0]));
  let walkable = 0;
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const kind = automapKindOf(level?.cells?.[i] ?? null);
      kinds[i] = kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (kind === 'floor' || kind === 'door' || kind === 'levelUp' || kind === 'levelDown'
        || kind === 'dryChasm' || kind === 'wetChasm' || kind === 'lavaChasm') walkable++;
    }
  }
  return { width, depth, kinds, counts, walkable, canvas: level?.canvas ?? null };
}

/**
 * One cell's mark, or `void` outside the grid.
 * @param {{width:number, depth:number, kinds:string[]}} map
 * @param {number} row @param {number} col
 * @returns {string}
 */
export function automapAt(map, row, col) {
  if (!map || row < 0 || col < 0 || row >= map.depth || col >= map.width) return 'void';
  return map.kinds[row * map.width + col] ?? 'void';
}

/** The eight screen directions, clockwise from east (yaw 0). */
export const AUTOMAP_DIRECTIONS = Object.freeze([
  'east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast',
]);

/**
 * The direction a yaw faces, on the screen's own axes.
 *
 * The scene's forward vector is `(sin yaw, cos yaw)` in world `(x, z)`, `x` is the map's **row**
 * and `z` its **column** (`tamrielGrid`: `col` → pixel x, `row` → pixel y). So a cell-space
 * direction is `(cos yaw, sin yaw)` with y downward, and eight sectors of 45° are the arrow's
 * eight patterns.
 *
 * @param {number} yaw radians, the camera's own
 * @returns {string} one of `AUTOMAP_DIRECTIONS`
 */
export function automapDirection(yaw) {
  const step = Math.PI / 4;
  const i = ((Math.round((Number(yaw) || 0) / step) % 8) + 8) % 8;
  return AUTOMAP_DIRECTIONS[i];
}

/**
 * **The player's 3×3 arrow**, one pattern per direction — `PlayerArrowPatterns` from
 * OpenTESArena, coordinates being sub-pixels within the player's own cell (0…2 on each axis).
 *
 * @param {string} direction  one of `AUTOMAP_DIRECTIONS`
 * @returns {ReadonlyArray<readonly [number, number]>} pairs of `[x, y]` inside the cell
 */
export function automapArrow(direction) {
  return ARROW_PATTERNS[direction] ?? ARROW_PATTERNS.east;
}

/** @type {Readonly<Record<string, ReadonlyArray<readonly [number, number]>>>} */
const ARROW_PATTERNS = Object.freeze({
  north: Object.freeze([[1, 0], [0, 1], [2, 1]]),
  northEast: Object.freeze([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]),
  east: Object.freeze([[1, 0], [2, 1], [1, 2]]),
  southEast: Object.freeze([[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]]),
  south: Object.freeze([[0, 1], [2, 1], [1, 2]]),
  southWest: Object.freeze([[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]),
  west: Object.freeze([[1, 0], [0, 1], [1, 2]]),
  northWest: Object.freeze([[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]),
});

/**
 * **Where the player is on the map**, in cells and within their cell.
 *
 * The cell is `floor(metres / CELL_SIZE)` on each axis — the same conversion the country's own
 * slide makes (`interior.js`'s `maybeSlideWilderness`) — and the fraction is where in that cell
 * the feet stand, which is what lets the panel put the arrow on the exact paving stone. The row
 * and column are clamped, so a body standing a hair outside the level (a doorway's threshold)
 * still has a mark; `inside` says whether it had to be clamped.
 *
 * @param {{width:number, depth:number}} map
 * @param {ArrayLike<number>|{x:number,z:number}} feet  world metres, `[x, y, z]`
 * @param {number} yaw
 * @param {number} [cellSize]
 * @returns {{row:number, col:number, x:number, z:number, direction:string, yaw:number, inside:boolean}}
 */
export function automapMarker(map, feet, yaw, cellSize = CELL_SIZE) {
  const size = Number(cellSize) > 0 ? Number(cellSize) : CELL_SIZE;
  const fx = Number(Array.isArray(feet) || ArrayBuffer.isView(feet) ? feet[0] : feet?.x) || 0;
  const fz = Number(Array.isArray(feet) || ArrayBuffer.isView(feet) ? feet[2] : feet?.z) || 0;
  const rawRow = Math.floor(fx / size);
  const rawCol = Math.floor(fz / size);
  const depth = Math.max(1, Math.trunc(map?.depth ?? 1));
  const width = Math.max(1, Math.trunc(map?.width ?? 1));
  const row = Math.min(depth - 1, Math.max(0, rawRow));
  const col = Math.min(width - 1, Math.max(0, rawCol));
  const heading = Number(yaw) || 0;
  return {
    row,
    col,
    // Where in the cell, 0…1 on each axis; clamped with the cell so a clamped mark is still
    // drawn inside its own square rather than off the edge of the sheet.
    x: Math.min(1, Math.max(0, fx / size - rawRow)),
    z: Math.min(1, Math.max(0, fz / size - rawCol)),
    direction: automapDirection(heading),
    yaw: heading,
    inside: rawRow === row && rawCol === col,
  };
}

/**
 * What the map holds, for a panel's line and a test's report (the counts are the map's own).
 * @param {{counts?: Record<string, number>, walkable?: number, width?: number, depth?: number}|null} map
 * @returns {{width:number, depth:number, walkable:number, floors:number, doors:number, up:number,
 *   down:number, water:number, lava:number, pits:number, walls:number, voidCells:number}}
 */
export function automapSummary(map) {
  const counts = map?.counts ?? {};
  const at = (kind) => Math.max(0, Number(counts[kind] ?? 0));
  return {
    width: Math.max(0, Number(map?.width ?? 0)),
    depth: Math.max(0, Number(map?.depth ?? 0)),
    walkable: Math.max(0, Number(map?.walkable ?? 0)),
    floors: at('floor'),
    doors: at('door'),
    up: at('levelUp'),
    down: at('levelDown'),
    water: at('wetChasm'),
    lava: at('lavaChasm'),
    pits: at('dryChasm'),
    walls: at('wall') + at('raised'),
    voidCells: at('void'),
  };
}
