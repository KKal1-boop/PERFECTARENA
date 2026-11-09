// THE LEVEL'S OWN CANVAS — the part of a `.MIF` grid a storey really fills.
//
//   node --test tests/unit/levelcanvas.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/levelcanvas.test.mjs
//
// The owner, 2026-10-25: *"the map to the piece in Labyrinthian in the Fortress of Ice second floor
// it's in an non accessible place because the second floor of the dungeon is bigger then what it
// should be and has an non accessible part"*. A `.MIF` declares **one grid for every level in the
// file** in its header, and a level may fill less of it: the Fortress of Ice's second storey is a
// 64×58 maze in an 80×96 grid, and the remaining 3 968 cells carry no floor, no wall and no
// storey of their own. Decoded, those cells were open air standing on floor texture 0 — so the
// walk that picks a level's deepest chamber crossed them and put the map there, the mesh drew a
// floor and a ceiling around the maze, and the automap drew the whole grid as its sheet.
//
// One fact fixes all three: `mifLevel.levelCanvas` (the box the level really fills) and
// `mifLevel.isVoidCell` (outside it). The sweep that proves it is one level wide: of the install's
// 39 numbered dungeon levels, **this is the only one** with a margin, and no level loses its
// arrival or its objective to the rule.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeLevel, isVoidCell, levelCanvas } from '../../src/game/mifLevel.js';
import { buildLevelMesh } from '../../src/game/mifMesh.js';
import { automapKindOf, buildAutomap } from '../../src/game/automap.js';
import { AUTOMAP_MATTE, automapLayout, drawAutomap } from '../../src/scenes/automap.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

/** The Fortress of Ice, whose second storey is the reported level. */
const FORTRESS = '42110737.MIF';

async function decode(mifName, index) {
  const mif = await data.mif(mifName);
  const raw = mif.levels[index];
  const inf = await data.inf(raw.info);
  const level = decodeLevel(raw, inf, {
    width: mif.width, depth: mif.height, mapType: 'interior', startPoints: mif.startPoints,
  });
  return { mif, raw, level };
}

/** A recording 2D context: enough of the canvas API for `drawAutomap`. */
function recordingCanvas(width, height) {
  const rects = [];
  const ctx = {
    imageSmoothingEnabled: true,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    fillRect: (x, y, w, h) => rects.push({ style: ctx.fillStyle, x, y, w, h }),
    strokeRect: () => {},
  };
  return { canvas: { width, height, getContext: () => ctx }, rects };
}

test('a canvas is the box the layers fill, and a level that fills its grid has no margin', () => {
  // A 6×4 grid with a wall in one cell and a floor in another: the box is those two cells.
  const flor = new Uint16Array(24);
  const map1 = new Uint16Array(24);
  flor[1 * 6 + 4] = 0x0303;      // row 1, col 4
  map1[3 * 6 + 1] = 0x1717;      // row 3, col 1
  assert.deepEqual(levelCanvas({ flor, map1, map2: null }, 6, 4), { row0: 1, row1: 3, col0: 1, col1: 4 });
  // Nothing written at all: no canvas, so no cell is outside one.
  assert.equal(levelCanvas({ flor: new Uint16Array(24), map1: new Uint16Array(24) }, 6, 4), null);
  // A full grid's canvas is the grid.
  assert.deepEqual(
    levelCanvas({ flor: new Uint16Array(24).fill(1), map1: new Uint16Array(24) }, 6, 4),
    { row0: 0, row1: 3, col0: 0, col1: 5 },
  );
});

test('a hand-built cell is read by the automap’s older rule; a decoded one by its own flag', () => {
  // No `void` flag (a fixture, a block before it is decoded): no floor and nothing solid is void.
  assert.equal(isVoidCell({ rawFlor: 0, solid: false }), true);
  assert.equal(isVoidCell({ rawFlor: 0, solid: true }), false);
  assert.equal(isVoidCell({ rawFlor: 512, solid: false }), false);
  assert.equal(isVoidCell(null), false);
  // A decoded cell carries the level's own answer, which wins over the fallback.
  assert.equal(isVoidCell({ void: false, rawFlor: 0, solid: false }), false);
  assert.equal(isVoidCell({ void: true, rawFlor: 512, solid: false }), true);
  assert.equal(automapKindOf({ void: false, rawFlor: 0, solid: false }), 'floor');
});

test('the Fortress of Ice’s second storey is 64×58 of its 96×80 grid, and the margin is not the level', async () => {
  const { mif, level } = await decode(FORTRESS, 1);
  assert.equal(mif.width, 96);
  assert.equal(mif.height, 80);
  assert.deepEqual(level.canvas, { row0: 0, row1: 57, col0: 0, col1: 63 });

  const voids = level.cells.filter(isVoidCell);
  assert.equal(voids.length, 96 * 80 - 64 * 58, 'the margin is the grid less the storey');
  for (const cell of voids) {
    assert.equal(cell.rawFlor, 0, 'a margin cell carries no floor');
    assert.equal(cell.rawMap1, 0, '…no wall');
    assert.equal(cell.rawMap2, 0, '…and no storey above it');
  }
  // Every cell inside the box is part of the level, and the arrival is one of them.
  for (let row = 0; row <= 57; row++) {
    for (let col = 0; col <= 63; col++) {
      assert.equal(level.cells[row * 96 + col].void, false, `${row},${col} is inside the canvas`);
    }
  }
  assert.equal(level.cells[Math.floor(level.spawn.x) * 96 + Math.floor(level.spawn.z)].void, false,
    'the arrival stands on the level');
});

test('the margin is not drawn: no floor, no ceiling, no collider around the maze', async () => {
  const { level } = await decode(FORTRESS, 1);
  const built = buildLevelMesh(level, { wantCollider: true });
  const canvasCells = 64 * 58;
  assert.equal(built.stats.ceilingQuads, canvasCells,
    'one ceiling per cell of the level, and none over the margin');
  assert.ok(built.stats.floorQuads <= canvasCells,
    `floors are the cells that need one (${built.stats.floorQuads} of ${canvasCells})`);

  // The first storey of the same file fills its grid, so the rule changes nothing there.
  const { level: first } = await decode(FORTRESS, 0);
  assert.equal(first.cells.filter(isVoidCell).length, 0, 'the storey below has no margin');
  const firstMesh = buildLevelMesh(first, { wantCollider: true });
  assert.equal(firstMesh.stats.ceilingQuads, 96 * 80);
});

test('the automap’s sheet is the canvas, not the file’s grid', async () => {
  const { level } = await decode(FORTRESS, 1);
  const map = buildAutomap(level);
  assert.deepEqual(map.canvas, level.canvas);

  // Laid out at the storey's own size: 64 cells across, where the grid would have been 96.
  const fit = automapLayout(map, 720, 480);
  assert.equal(fit.box.width, 64 * fit.scale);
  assert.equal(fit.box.height, 58 * fit.scale);
  assert.ok(fit.box.width <= 720 && fit.box.height <= 480);

  // …and nothing is painted outside it, though the map still holds the whole grid's cells.
  const { canvas, rects } = recordingCanvas(720, 480);
  const report = drawAutomap(canvas, { map });
  // The page's own matte fill covers the canvas, so it is the one rect that may stand outside;
  // every mark the level paints is inside the sheet.
  const beyond = rects.filter((r) => r.style !== AUTOMAP_MATTE).filter((r) => r.x < report.box.x - 1
    || r.x + r.w > report.box.x + report.box.width + 1
    || r.y < report.box.y - 1 || r.y + r.h > report.box.y + report.box.height + 1);
  assert.deepEqual(beyond, [], 'no mark lands off the sheet');
  assert.ok(report.painted > 100, `the maze's walls are drawn (${report.painted})`);

  // A map with no canvas is the grid it always was.
  const plain = automapLayout({ width: 96, depth: 80 }, 720, 480);
  assert.equal(plain.box.width, 96 * plain.scale);
});
