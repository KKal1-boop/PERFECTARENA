// THE CHASM'S SURFACE — the squares Arena's water and lava are drawn as.
//
// The engine's water pass takes one **square** per draw call (`renderer.drawWater`), so a
// level's chasms have to be covered by squares: as few as possible, every one of them
// inside the chasm, and none of them covering a single cell of dry ground. That is a
// property, not a pixel count, so it is checked here against the real maps — the city
// template Daggerfall stands on (`CITYW2.MIF`, 2 071 wet cells in the skeleton) and one of
// the install's own dungeons (`41649375.MIF`, Crypt of Hearts, whose first level is mostly
// lava).
//
//   node --test tests/unit/chasm.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/chasm.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { CELL_SIZE } from '../../src/game/mifMesh.js';
import {
  SURFACE_DROP, SURFACE_FIELD, SURFACE_SCROLL, SURFACE_TINT, mergeSquares, surfaceKind,
  surfaceLabel, surfaceMask, surfacePlanes, surfaceScroll,
} from '../../src/game/chasmSurface.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

/**
 * A decoded level, the way `interior.js` builds one.
 *
 * `infName` is needed for a city skeleton only: `CITYW2.MIF` is a *template* whose levels
 * carry no INF of their own (the caller picks the climate's, `TCN.INF` for Daggerfall),
 * while a dungeon level names its own in its header.
 *
 * @param {string} name @param {number} index @param {'interior'|'city'|'wilderness'} mapType
 * @param {string} [infName]
 */
async function decode(name, index = 0, mapType = 'interior', infName) {
  const mif = await data.mif(name);
  const level = mif.levels[index];
  const inf = await data.inf(infName ?? level.info);
  return decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType });
}

/** Every cell a set of squares covers, as `row:col`, so overlaps can be counted. */
function coverage(squares) {
  const seen = new Map();
  for (const s of squares) {
    for (let r = s.row; r < s.row + s.side; r++) {
      for (let c = s.col; c < s.col + s.side; c++) {
        const key = `${r}:${c}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }
  return seen;
}

test('a chasm\'s kind is the original\'s: wet is water, lava is lava, dry is nothing', () => {
  assert.equal(surfaceKind('wet'), 'water');
  assert.equal(surfaceKind('lava'), 'lava');
  assert.equal(surfaceKind('dry'), null, 'ArenaChasmUtils allows no swimming in a dry pit');
  assert.equal(surfaceKind(null), null);
  assert.equal(surfaceKind(undefined), null);
  assert.equal(surfaceLabel('water'), 'water');
  assert.equal(surfaceLabel('lava'), 'lava');
  assert.equal(surfaceLabel(null), 'none');
  // Each kind is drawn from its own field: the water field is never a lava's art.
  assert.equal(SURFACE_FIELD.water, 'WATERANI.RCI');
  assert.equal(SURFACE_FIELD.lava, 'LAVAANI.RCI');
  // Water is shallow enough to see the bed through, lava is not.
  assert.ok(SURFACE_TINT.water[3] > 0 && SURFACE_TINT.water[3] < 1, 'water is partly transparent');
  assert.equal(SURFACE_TINT.lava[3], 1, 'lava is opaque');
  assert.deepEqual([SURFACE_TINT.water[0], SURFACE_TINT.water[1], SURFACE_TINT.water[2]], [1, 1, 1],
    'the field is Arena\'s own colours, so the tint does not recolour it');
});

test('the flow is the rate, on the scene\'s own clock', () => {
  assert.equal(surfaceScroll('water', 0), 0);
  assert.equal(surfaceScroll('water', 10), 10 * SURFACE_SCROLL.water);
  assert.ok(SURFACE_SCROLL.lava < SURFACE_SCROLL.water, 'a lava lake creeps, it does not race');
  // The engine scrolls in tiles of 6.4 world units, so the rate is a speed in metres:
  // water moves under 0.5 m/s, which is what makes a harbour read as moving water.
  const metresPerSecond = SURFACE_SCROLL.water * 6.4;
  assert.ok(metresPerSecond > 0.1 && metresPerSecond < 0.5, `water flows ${metresPerSecond.toFixed(2)} m/s`);
  assert.equal(surfaceScroll('nothing', 10), 0);
  assert.equal(surfaceScroll('water', -5), 0, 'a clock never runs backwards');
});

test('the merger covers exactly the mask, once each, and never a cell outside it', () => {
  // A shape with a notch and a hole, so a wrong greedy pass shows up.
  const width = 9;
  const height = 7;
  const mask = new Uint8Array(width * height);
  const put = (r, c) => { mask[r * width + c] = 1; };
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 7; c++) put(r, c);   // a 5×7 block
  for (let c = 1; c <= 7; c++) mask[3 * width + c] = 0;                   // a slit through it
  mask[1 * width + 4] = 0;                                                // a single hole
  put(6, 6);                                                             // an orphan cell
  const squares = mergeSquares(mask, width, height);
  const seen = coverage(squares);
  const wanted = [...mask].reduce((n, v) => n + v, 0);
  assert.equal(seen.size, wanted, `${squares.length} squares cover ${seen.size} of ${wanted} cells`);
  for (const n of seen.values()) assert.equal(n, 1, 'no cell is covered twice');
  for (const [key] of seen) {
    const [r, c] = key.split(':').map(Number);
    assert.equal(mask[r * width + c], 1, `${key} is inside the mask`);
  }
  // The orphan cell is still covered, as a square of its own.
  assert.ok(squares.some((s) => s.row === 6 && s.col === 6 && s.side === 1));
  // A solid block is fewer squares than cells, which is the whole point of merging.
  const block = new Uint8Array(8 * 4).fill(1);
  const merged = mergeSquares(block, 8, 4);
  assert.equal(merged.reduce((n, s) => n + s.cells, 0), 32);
  assert.ok(merged.length <= 4, `a 8×4 block takes ${merged.length} squares`);
});

test('a city\'s harbour is water, and its squares are all inside the harbour', async () => {
  const level = await decode('CITYW2.MIF', 0, 'city', 'TCN.INF');
  const water = surfacePlanes(level, { kind: 'water', cellSize: CELL_SIZE });
  // The skeleton's own count, from the map rather than from this module.
  const mask = surfaceMask(level, 'water');
  assert.ok(water.cells > 1000, `${water.cells} wet cells in CITYW2.MIF`);
  assert.equal(water.cells, mask.cells);
  assert.equal(water.covered, water.cells, 'every wet cell is covered');
  const seen = coverage(water.squares);
  for (const n of seen.values()) assert.equal(n, 1);
  for (const [key] of seen) {
    const [r, c] = key.split(':').map(Number);
    assert.equal(level.cells[r * mask.width + c].floor.chasm, 'wet', `${key} is a wet chasm cell`);
  }
  // The harbour is one body of water, so merging must pay for itself many times over.
  assert.ok(water.squares.length < water.cells / 8,
    `${water.cells} cells in ${water.squares.length} planes (largest ${water.largest}×${water.largest})`);
  // a dry chasm is a pit, not a shore: no surface, and no planes either.
  const lava = surfacePlanes(level, { kind: 'lava', cellSize: CELL_SIZE });
  assert.equal(lava.cells, 0);
  assert.equal(lava.quads.length, 0);
});

test('a dungeon\'s lava lake is lava, and stands just below its own bank', async () => {
  const level = await decode('41649375.MIF', 0);
  const lava = surfacePlanes(level, { kind: 'lava', cellSize: CELL_SIZE });
  assert.ok(lava.cells > 500, `${lava.cells} lava cells in Crypt of Hearts' first level`);
  assert.equal(lava.covered, lava.cells);
  assert.equal(lava.field, 'LAVAANI.RCI');
  const water = surfacePlanes(level, { kind: 'water', cellSize: CELL_SIZE });
  assert.ok(water.cells < lava.cells, `${water.cells} wet against ${lava.cells} lava`);
  // The surface floats a hair below the bank the player stands on, and every plane is
  // square and matches its own square of cells.
  const bank = level.floorY * CELL_SIZE;
  for (const quad of lava.quads) {
    assert.equal(quad.y, bank - SURFACE_DROP);
    assert.ok(quad.x >= 0 && quad.z >= 0);
  }
  const byArea = lava.quads.reduce((n, q) => n + (q.size / CELL_SIZE) ** 2, 0);
  assert.equal(Math.round(byArea), lava.cells, 'the planes are exactly as much ground as the lava');
});
