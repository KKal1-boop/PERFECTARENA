// THE CHASM'S SURFACE — Arena's own water and lava, laid over the ground they cover.
//
// A chasm cell in this port has always had its *rules*: `scenes/interior.js` wades a wet
// one at the engine's swim speed and burns you in a lava one, both rules read out of
// `ArenaChasmUtils`. What it never had was a **surface**: the pit's bed was drawn with a
// flat static texture out of the level's own `.INF`, so a harbour and a lava lake looked
// like holes in the ground. The reported "water and lava dont exist" is exactly that.
//
// Arena's own install answers it with two loose files — `WATERANI.RCI` and `LAVAANI.RCI`
// (`arena/rciFile.js` decodes them; the short version is that they are 400 × 400 fields of
// `PAL.COL` indices whose every value is a step on the install's blue/teal *water* ladder
// or its orange/red *lava* ladder). This module turns a decoded level into the *squares of
// ground* those fields cover, and says how they are tinted, how far below the bank they
// sit and how fast they flow.
//
// Two things in here are the engine's and are worth naming, because they fix the port's
// numbers rather than the other way round:
//
//   * The surface is drawn by the engine's own water pass (`renderer.drawWater`), which the
//     Daggerfall side of this engine uses for its water planes. **It takes a SQUARE per
//     draw call** — one `uRect = (x0, z0, size, y)` and a unit quad — so this module does
//     not emit one rectangle per chasm, it emits the largest squares that cover the chasm
//     and no other cell (`mergeSquares`, below). A city harbour of 1 448 chasm cells comes
//     out as a few dozen draws rather than 1 448.
//   * That pass scrolls its texture by whole *tiles* (`uWaterScroll`, with `vWaterXZ / 6.4`
//     in its shader), so the flow is expressed here in tiles per second, not metres.
//
// Everything below is pure: a level in, geometry and numbers out. The scene does the
// uploading and the drawing, and `tests/unit/chasm.test.mjs` holds the merging to "every
// chasm cell covered exactly once, and no other cell covered" against the real maps.
//
// ## The surface is the line you climb out from (the owner's report, 2026-10-17)
//
// *"in dungeons there should be shallow pits you can climb instead of just holes … the water
// should be deep and you should climb out of it"*. The surface this module lays sits **at the
// bank** (one `SURFACE_DROP` under it, below), and the bed under it is now a real depth per
// kind — `mifMesh.js`'s `CHASM_DEPTHS`: a dry pit 1.2 m, water 1.55 m, lava 1.0 m, against the
// 0.45 m shelf the port used to sink so that the motor's own step could always walk back out.
// Water is therefore past the waist and up to the chin of a 1.7 m eye, so nothing walks out of
// it, and the way out is the engine's ledge climb (`engine/player/motor.js`,
// `CLIMB_LEDGE_MAX_WATER`): a swimmer's reach is measured **from this surface**, so a bank up to
// 0.9 m over the water line is haulable however deep the water is. A wet chasm's surface is the
// height that makes that arithmetic work, so moving the bed moves the climb's reach with it (the
// two numbers are asserted against each other in `tests/unit/climbing.test.mjs`).

/**
 * How far below the bank a surface floats, in world units. Enough to read as a surface — and
 * the line a swimmer's hands reach over for the ledge climb (see the header).
 */
export const SURFACE_DROP = 0.02;

/**
 * The art each kind of chasm is surfaced with: the install's own fields.
 * @type {Readonly<Record<string, string>>}
 */
export const SURFACE_FIELD = Object.freeze({ water: 'WATERANI.RCI', lava: 'LAVAANI.RCI' });

/**
 * The tint the engine's water pass multiplies the field by: `[r, g, b, a]`.
 *
 * The field's own pixels are already Arena's water and lava colours, so the RGB is left
 * alone (`1, 1, 1`) and only the alpha says how much of the bed shows through: a wet chasm
 * is **shallow** in Arena (`ArenaChasmUtils` lets you wade it) so a little of its bed is
 * visible through the water, while lava is a thing you look *at* — opaque, and bright
 * enough that the port leaves it untinted rather than darkening the art it ships.
 *
 * @type {Readonly<Record<string, readonly [number, number, number, number]>>}
 */
export const SURFACE_TINT = Object.freeze({
  water: Object.freeze([1, 1, 1, 0.82]),
  lava: Object.freeze([1, 1, 1, 1]),
});

/**
 * How fast a surface flows, in the engine's own unit: **tiles per second** of a 6.4-unit
 * tile (`renderer.drawWater`'s `uWaterScroll`).
 *
 * This is the one number in the module the install does not carry: how fast Arena moved
 * its chasm fields lives in `A.EXE`, which this install does not ship (D5/D11). The two
 * rates here are chosen to be *visible* — a compass-animated surface is the point of the
 * feature — and to keep their order sensible: water runs at about 0.06 tiles a second
 * (~0.38 m/s of ground flow) and lava creeps slower, because a flowing lake reads as
 * wrong. Logged as S38 in docs/PROGRESS.md.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const SURFACE_SCROLL = Object.freeze({ water: 0.06, lava: 0.035 });

/**
 * The chasm kind behind a surface: a level's `dry`/`wet`/`lava` to `null`/`water`/`lava`.
 *
 * A **dry** chasm gets no surface, and that is the original's own distinction rather than
 * a simplification: `ArenaChasmUtils` reports `allowsSwimming(Dry) === false`, a dry pit
 * being a pit.
 *
 * @param {'dry'|'wet'|'lava'|null|undefined} chasm
 * @returns {'water'|'lava'|null}
 */
export function surfaceKind(chasm) {
  if (chasm === 'wet') return 'water';
  if (chasm === 'lava') return 'lava';
  return null;
}

/** The words the HUD uses. @param {string} kind */
export function surfaceLabel(kind) {
  return kind === 'lava' ? 'lava' : kind === 'water' ? 'water' : 'none';
}

/**
 * The cells of a level one kind of surface covers.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {'water'|'lava'} kind
 * @returns {{width: number, height: number, mask: Uint8Array, cells: number}}
 */
export function surfaceMask(level, kind) {
  const width = level?.width ?? 0;
  const height = level?.depth ?? 0;
  const mask = new Uint8Array(width * height);
  let cells = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = level.cells[row * width + col];
      if (surfaceKind(cell?.floor?.chasm) !== kind) continue;
      mask[row * width + col] = 1;
      cells++;
    }
  }
  return { width, height, mask, cells };
}

/**
 * Cover a mask with as few **squares** as a greedy pass can, each square entirely inside
 * the mask and no cell used twice.
 *
 * The engine's water pass takes one square per draw call (see the header), so squares are
 * the shape to aim at; the greedy rule is the obvious one — at the first free cell, grow
 * the largest square that fits, emit it, mark it, move on. Row-major order means a harbour
 * that is one big block comes out as a handful of large squares plus a fringe of small
 * ones along the shore, which is what both the draw-call budget and the shader want.
 *
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {{row: number, col: number, side: number, cells: number}[]}
 */
export function mergeSquares(mask, width, height) {
  const used = new Uint8Array(mask.length);
  /** @type {{row: number, col: number, side: number, cells: number}[]} */
  const squares = [];
  const free = (r, c) => r < height && c < width && mask[r * width + c] === 1 && used[r * width + c] === 0;

  /** Can a square of `side` at (row, col) be taken whole? */
  const fits = (row, col, side) => {
    for (let r = row; r < row + side; r++) for (let c = col; c < col + side; c++) if (!free(r, c)) return false;
    return true;
  };

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!free(row, col)) continue;
      let side = 1;
      while (fits(row, col, side + 1)) side++;
      for (let r = row; r < row + side; r++) for (let c = col; c < col + side; c++) used[r * width + c] = 1;
      squares.push({ row, col, side, cells: side * side });
    }
  }
  return squares;
}

/**
 * The surfaces a level needs, as the quads the engine's water pass draws.
 *
 * @param {import('./mifLevel.js').ArenaLevel} level
 * @param {{kind: 'water'|'lava', cellSize: number}} opts
 * @returns {{kind: string, field: string, tint: readonly number[], squares: object[], quads: {x:number,z:number,size:number,y:number}[], cells: number, covered: number, largest: number}}
 *   `y` is the SURFACE's own height, one `SURFACE_DROP` under the bank — which is the line a
 *   swimmer's hands reach over for the ledge climb (`motor.js`'s `CLIMB_LEDGE_MAX_WATER`), and
 *   the line the scene's own `submerged` test is measured against.
 */
export function surfacePlanes(level, opts) {
  const { kind, cellSize } = opts;
  const { width, height, mask, cells } = surfaceMask(level, kind);
  const squares = mergeSquares(mask, width, height);
  const y = (level?.floorY ?? 0) * cellSize - SURFACE_DROP;
  // Row is world X and column is world Z, the mesher's own mapping (`mifMesh.js`:
  // `x0 = row * S`, `z0 = col * S`), so a square's quad starts at its top-left cell.
  const quads = squares.map((s) => ({ x: s.row * cellSize, z: s.col * cellSize, size: s.side * cellSize, y }));
  return {
    kind,
    field: SURFACE_FIELD[kind],
    tint: SURFACE_TINT[kind],
    squares,
    quads,
    cells,
    covered: squares.reduce((n, s) => n + s.cells, 0),
    largest: squares.reduce((n, s) => Math.max(n, s.side), 0),
  };
}

/**
 * How far a surface has flowed after `seconds`, in the engine's tiles.
 *
 * The scroll is a plain accumulation in the scene's own clock rather than a function of
 * the level, so a paused scene is a still surface and a test can hold the number to the
 * rate above.
 *
 * @param {string} kind
 * @param {number} seconds
 * @returns {number}
 */
export function surfaceScroll(kind, seconds) {
  return (SURFACE_SCROLL[kind] ?? 0) * Math.max(0, Number(seconds) || 0);
}
