// THE AUTOMAP — the level's own map, held to OpenTESArena's laws.
//
//   node --test tests/unit/automap.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/automap.test.mjs
//
// The reference is `OpenTESArena/src/Interface/AutomapUiMVC.{h,cpp}` (MIT), which is where every
// number below comes from: the automap palette (`AutomapUiView::Color*`), what each voxel draws
// as (`getPixelColor`), the 3×3 player arrow (`PlayerArrowPatterns`) and `PixelSize = 3`.
//
// Two halves, as `docs/PORT_BLOCKS.md` §1 asks: a **hand-made level** where every case in the
// classification can be asserted one at a time, and the **install's own `START.MIF`**, because a
// rule that only ever saw a fixture is a rule about the fixture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import {
  AUTOMAP_COLORS, AUTOMAP_DIRECTIONS, AUTOMAP_KINDS, automapArrow, automapAt,
  automapDirection, automapKindOf, automapMarker, automapSummary, buildAutomap,
} from '../../src/game/automap.js';
import { automapLayout, drawAutomap, AUTOMAP_PARCHMENT } from '../../src/scenes/automap.js';
import { CELL_SIZE } from '../../src/game/mifMesh.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

// ── one cell, the way the decoder makes it ────────────────────────────────────

/** A decoded cell with only the fields the automap reads set to what a test names. */
function cell(extra = {}) {
  return {
    x: 0, z: 0,
    floor: { texture: 0, flatIndex: -1, chasm: null },
    kind: 'air', sideTexture: -1, capTexture: -1, bottomTexture: -1,
    yOffset: 0, ySize: 0, facing: -1, doorKind: null, solid: false, stair: null,
    entityFlatIndex: -1, ceiling: false, ceilingTexture: -1, upperLayers: 0, upperRaised: false,
    rawFlor: 1, rawMap1: 0, rawMap2: 0,
    ...extra,
    ...(extra.floor ? { floor: { texture: 0, flatIndex: -1, chasm: null, ...extra.floor } } : {}),
  };
}

// ── the classification: every arm of the reference's `getPixelColor` ──────────

test('ground is a floor, a wall is a wall, and a doorway is a door', () => {
  assert.equal(automapKindOf(cell()), 'floor');
  assert.equal(automapKindOf(cell({ kind: 'wall', solid: true })), 'wall');
  assert.equal(automapKindOf(cell({ kind: 'edge' })), 'wall');
  assert.equal(automapKindOf(cell({ kind: 'door', doorKind: 'swinging', solid: true })), 'door');
  assert.equal(automapKindOf(cell({ kind: 'raised', solid: true })), 'raised');
  assert.equal(automapKindOf(cell({ kind: 'diagonal' })), 'floor');
  assert.equal(automapKindOf(null), 'void');
  // No floor and nothing over it is not part of the map (the reference draws the sheet).
  assert.equal(automapKindOf(cell({ rawFlor: 0 })), 'void');
});

test('a stairway is read before the wall it is painted on', () => {
  // A stair is a **solid wall cell** whose side texture is the INF's own `STAIRUP`/`STAIRDOWN`
  // art (`mifLevel.stairKindOf`). The map must show the transition, not the wall.
  assert.equal(automapKindOf(cell({ kind: 'wall', solid: true, stair: 'up' })), 'levelUp');
  assert.equal(automapKindOf(cell({ kind: 'wall', solid: true, stair: 'down' })), 'levelDown');
});

test('a hedge blocks and an archway does not — the reference’s transparent-wall rule', () => {
  assert.equal(automapKindOf(cell({ kind: 'transparent', solid: true })), 'wall');
  assert.equal(automapKindOf(cell({ kind: 'transparent', solid: false })), 'floor');
});

test('the chasms are their own colours, and a platform over one is raised', () => {
  const chasm = (kind) => cell({ floor: { chasm: kind } });
  assert.equal(automapKindOf(chasm('dry')), 'dryChasm');
  assert.equal(automapKindOf(chasm('wet')), 'wetChasm');
  assert.equal(automapKindOf(chasm('lava')), 'lavaChasm');
  // A dry pit under a wall is the reference's `ColorRaised`; water and lava ignore everything
  // but a raised platform, because the liquid is what the eye is looking for.
  assert.equal(automapKindOf(cell({ kind: 'wall', solid: true, floor: { chasm: 'dry' } })), 'raised');
  assert.equal(automapKindOf(cell({ kind: 'wall', solid: true, floor: { chasm: 'wet' } })), 'wetChasm');
  assert.equal(automapKindOf(cell({ kind: 'raised', solid: true, floor: { chasm: 'lava' } })), 'raised');
});

// ── the grid ─────────────────────────────────────────────────────────────────

test('a level becomes a grid of marks, and the counts are the grid’s own', () => {
  // 3×2: a floor, a wall, a door / water, an up-stair, a pit.
  const cells = [
    cell(), cell({ kind: 'wall', solid: true }), cell({ kind: 'door', solid: true }),
    cell({ floor: { chasm: 'wet' } }), cell({ kind: 'wall', solid: true, stair: 'up' }),
    cell({ floor: { chasm: 'dry' } }),
  ];
  const map = buildAutomap({ width: 3, depth: 2, cells });
  assert.equal(map.width, 3);
  assert.equal(map.depth, 2);
  assert.deepEqual(map.kinds, [
    'floor', 'wall', 'door',
    'wetChasm', 'levelUp', 'dryChasm',
  ]);
  assert.equal(automapAt(map, 1, 1), 'levelUp');
  assert.equal(automapAt(map, 0, 2), 'door');
  assert.equal(automapAt(map, -1, 0), 'void');
  assert.equal(automapAt(map, 0, 3), 'void');
  assert.equal(Object.values(map.counts).reduce((a, b) => a + b, 0), 6, 'every cell is counted once');
  assert.equal(map.counts.floor, 1);
  // A floor, a door, the up-stair, the pool and the pit: every mark a body can enter (a pit is
  // fallen into and climbed out of, which is exactly the chasm the climbing pass made real).
  assert.equal(map.walkable, 5);
});

test('an empty level is an empty map, not a crash', () => {
  const map = buildAutomap(null);
  assert.equal(map.width, 0);
  assert.equal(map.depth, 0);
  assert.deepEqual(map.kinds, []);
  assert.equal(automapSummary(map).walkable, 0);
  assert.equal(automapAt(map, 0, 0), 'void');
});

// ── the player's arrow ───────────────────────────────────────────────────────

test('the arrow has eight patterns, all 3×3 and all different', () => {
  const seen = new Set();
  for (const direction of AUTOMAP_DIRECTIONS) {
    const pattern = automapArrow(direction);
    assert.ok(pattern.length >= 3, `${direction} is an arrow, not a dot`);
    for (const [x, y] of pattern) {
      assert.ok(Number.isInteger(x) && x >= 0 && x <= 2, `${direction}: x ${x} is inside the cell`);
      assert.ok(Number.isInteger(y) && y >= 0 && y <= 2, `${direction}: y ${y} is inside the cell`);
    }
    assert.equal(new Set(pattern.map(([x, y]) => `${x},${y}`)).size, pattern.length,
      `${direction}: a sub-pixel is drawn once`);
    seen.add(pattern.map(([x, y]) => `${x},${y}`).join(' '));
  }
  assert.equal(seen.size, 8, 'eight directions, eight distinct arrows');
  // The unknown direction is the east arrow rather than nothing (a heading a caller invented).
  assert.deepEqual(automapArrow('nowhere'), automapArrow('east'));
});

test('a yaw faces a screen direction, and yaw 0 faces +col (east)', () => {
  const step = Math.PI / 4;
  const table = ['east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast'];
  for (let i = 0; i < 8; i++) assert.equal(automapDirection(i * step), table[i], `sector ${i}`);
  assert.equal(automapDirection(-step), 'northEast', 'a negative yaw wraps rather than answers nothing');
  assert.equal(automapDirection(2 * Math.PI), 'east', 'a full turn is the same heading');
});

test('the marker lands on the cell the feet stand in, and the fraction within it', () => {
  const map = { width: 10, depth: 8, kinds: [] };
  const marker = automapMarker(map, [5.0, 2, 7.5], 0);
  assert.equal(marker.row, 2, '5 m / 2.5 m a cell');
  assert.equal(marker.col, 3);
  assert.equal(marker.x, 0);
  assert.equal(marker.z, 0, '7.5 m is the boundary of cell 3, its own fraction is 0');
  assert.equal(marker.direction, 'east');
  assert.equal(marker.inside, true);

  // A body a hair outside the level still has a mark, clamped into the sheet.
  const outside = automapMarker(map, [-4, 0, 99], 0);
  assert.equal(outside.row, 0);
  assert.equal(outside.col, map.width - 1);
  assert.equal(outside.inside, false);
  // …and its fraction is clamped too, so the arrow is drawn inside its own square.
  assert.ok(outside.z <= 1 && outside.z >= 0);
});

test('the marker reads a {x,z} object as well as a motor’s array', () => {
  const map = { width: 4, depth: 4, kinds: [] };
  assert.deepEqual(
    automapMarker(map, { x: 3.75, z: 3.75 }, 0),
    automapMarker(map, [3.75, 0, 3.75], 0),
  );
});

// ── the sheet: scale, parchment, colours and the arrow ───────────────────────

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

test('the sheet is a whole number of 3-pixel cells, inside the canvas', () => {
  for (const [cols, rows] of [[128, 128], [50, 50], [21, 17], [3, 2]]) {
    const { scale, box } = automapLayout({ width: cols, depth: rows }, 720, 480);
    assert.equal(scale % 3, 0, `${cols}×${rows}: the arrow's third is a whole pixel`);
    assert.equal(box.width, cols * scale);
    assert.equal(box.height, rows * scale);
    assert.ok(box.x >= 0 && box.y >= 0, `${cols}×${rows}: the sheet starts inside the canvas`);
    assert.ok(box.x + box.width <= 720, `${cols}×${rows}: the sheet ends inside the canvas`);
    assert.ok(box.y + box.height <= 480);
  }
});

test('a drawn map is a parchment sheet, the reference’s colours, and a yellow arrow', () => {
  const cells = [
    cell(), cell({ kind: 'wall', solid: true }), cell({ kind: 'door', solid: true }),
    cell(),
  ];
  const map = buildAutomap({ width: 2, depth: 2, cells });
  const marker = automapMarker(map, [0.25 * CELL_SIZE, 0, 0.25 * CELL_SIZE], 0);
  const { canvas, rects } = recordingCanvas(720, 480);
  const report = drawAutomap(canvas, { map, marker });

  assert.ok(report.scale > 0 && report.scale % 3 === 0);
  assert.equal(report.cells, 4);
  assert.ok(report.painted >= 2, `the wall and the door are painted (${report.painted})`);
  assert.equal(report.arrowPixels, automapArrow('east').length);
  // The sheet, then the wall and the door in their own colours.
  assert.ok(rects.some((r) => r.style === AUTOMAP_PARCHMENT && r.w === report.box.width),
    'the parchment is the floor');
  assert.ok(rects.some((r) => r.style === AUTOMAP_COLORS.wall), 'a wall is #825930');
  assert.ok(rects.some((r) => r.style === AUTOMAP_COLORS.door), 'a door is #920000');
  const yellow = rects.filter((r) => r.style === AUTOMAP_COLORS.player);
  assert.equal(yellow.length, report.arrowPixels, 'the arrow is the whole 3×3 pattern');
  // …and it lands in the player's own cell, not at the sheet's corner.
  const cellX = report.box.x;
  const cellY = report.box.y;
  assert.ok(yellow.every((r) => r.x >= cellX && r.x < cellX + report.scale));
  assert.ok(yellow.every((r) => r.y >= cellY && r.y < cellY + report.scale));
});

test('a canvas with no context is answered, not thrown at', () => {
  const report = drawAutomap({ width: 10, height: 10, getContext: () => null }, { map: { width: 1, depth: 1, kinds: ['floor'] } });
  assert.equal(report.painted, 0);
  assert.equal(report.arrowPixels, null);
});

// ── the install’s own level ──────────────────────────────────────────────────

test('START.MIF maps whole: floors, walls, doors, its one stair, and the spawn on floor', async () => {
  const mif = await data.mif('START.MIF');
  const raw = mif.levels[0];
  const level = decodeLevel(raw, await data.inf(raw.info), {
    width: mif.width, depth: mif.height, mapType: 'interior',
  });
  const map = buildAutomap(level);
  assert.equal(map.width, level.width);
  assert.equal(map.depth, level.depth);
  assert.equal(map.kinds.length, level.width * level.depth);
  const summary = automapSummary(map);
  assert.ok(summary.floors > 100, `the dungeon has floors (${summary.floors})`);
  assert.ok(summary.walls > 100, `…walled corridors (${summary.walls})`);
  assert.ok(summary.doors > 0, `…doors (${summary.doors})`);
  assert.equal(summary.up, 1, 'START.MIF carries exactly one stair, its GATE.IMG way out');
  // The arrival the player actually wakes on is on the map and not in a wall.
  const spawn = level.spawn;
  const marker = automapMarker(map, [spawn.x * CELL_SIZE, spawn.y * CELL_SIZE, spawn.z * CELL_SIZE], 0);
  assert.equal(marker.inside, true);
  const here = automapAt(map, marker.row, marker.col);
  assert.ok(['floor', 'door', 'levelUp', 'levelDown', 'dryChasm', 'wetChasm', 'lavaChasm'].includes(here),
    `the spawn cell reads ${here}`);
});

test('the automap palette is the reference’s eight colours, not a designer’s', () => {
  // `AutomapUiMVC.h`: wall 130,89,48 · raised 97,85,60 · door 146,0,0 · up 0,105,0 ·
  // down 0,0,255 · dry 20,40,40 · wet 109,138,174 · lava 255,0,0 · player 247,255,0.
  const hex = (r, g, b) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  assert.equal(AUTOMAP_COLORS.wall, hex(130, 89, 48));
  assert.equal(AUTOMAP_COLORS.raised, hex(97, 85, 60));
  assert.equal(AUTOMAP_COLORS.door, hex(146, 0, 0));
  assert.equal(AUTOMAP_COLORS.levelUp, hex(0, 105, 0));
  assert.equal(AUTOMAP_COLORS.levelDown, hex(0, 0, 255));
  assert.equal(AUTOMAP_COLORS.dryChasm, hex(20, 40, 40));
  assert.equal(AUTOMAP_COLORS.wetChasm, hex(109, 138, 174));
  assert.equal(AUTOMAP_COLORS.lavaChasm, hex(255, 0, 0));
  assert.equal(AUTOMAP_COLORS.player, hex(247, 255, 0));
  // Every kind has a colour rather than falling through to `undefined`.
  for (const kind of AUTOMAP_KINDS) {
    if (kind === 'void') continue;
    assert.match(AUTOMAP_COLORS[kind], /^#[0-9a-f]{6}$/, `${kind} has a colour`);
  }
});
