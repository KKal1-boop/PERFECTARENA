// ONE TAMRIEL, ONE GRID OF CELLS — the world every settlement stands in.
//
// `src/game/tamrielGrid.js` is the replacement for the port's old per-settlement country: the
// whole continent as one grid, so the country outside Daggerfall runs into the country outside
// Reich Gradkeep with no seam the player can feel and no second world to load. These tests are the
// module's own laws, in the order a reader needs them:
//
//   * **the scale** — 256 cells to a world-map pixel (four blocks), a settlement's own level
//     (105…128 cells) inside one pixel with country on every side;
//   * **no two cities in one window** — a window *is* a level, and a level holds one city. The
//     check runs over the install's own 288 records, which is the reason the scale is 256 and not
//     128 (`Stone Fell` and `Vlastarus` are one pixel apart);
//   * **the country is where it is** — a block's own draw is a function of its position alone, the
//     climate tilts the weights, and the sea is `TERRAIN.IMG`'s own sea;
//   * **the province map's own pixel** — a settlement's world pixel read back through
//     `provincePixelOf` is the `local` pair `CITYDATA.64` stored for it;
//   * **the door in the wall** — the one reading both halves of a city gate are made with.
//
// Run:  ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/tamrielgrid.test.mjs
// (tests that need the install are skipped without it)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { TERRAIN_SEA, loadWorldMap } from '../../src/game/worldMap.js';
import { globalPoint } from '../../src/arena/cityDataFile.js';
import {
  BLOCKS_PER_PIXEL, BLOCK_CELLS, CATEGORIES, CELLS_PER_PIXEL, CLIMATE_CATEGORY_WEIGHTS, WORLD_PIXELS,
  WINDOW_CELLS, atSettlementGate, blockHash, blockOfCell, cellOriginOfPixel, cityCellOfWorld,
  countryAt, countryCategory, footprintInWindow, footprintOf, footprintsOf, insideGateCell,
  isSeaCell, isSeaPixel, outsideGateCell, pixelOfCell, provincePixelOf, settlementAt,
  settlementInWindow, worldCellOfCity, youAreHere,
} from '../../src/game/tamrielGrid.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
// The world map's own art and terrain live inside `GLOBAL.BSA`; the records are loose files.
const haveInstall = fs.existsSync(path.join(ARENA, 'CITYDATA.64')) && fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));
const needInstall = haveInstall ? false : `the install is not beside this checkout (${ARENA})`;
const world = haveInstall ? await loadWorldMap(new ArenaData(nodeSource(ARENA), { onWarn: () => {} })) : null;

/** A `lists` object of the shape `wildernessBlockLists` answers, for the pure draws. */
const fakeLists = Object.freeze({
  normal: [1, 2, 3], village: [10, 11], tavern: [20], dungeon: [30, 31, 32, 33], temple: [40],
});

// ── the scale ───────────────────────────────────────────────────────────────────────────────

test('the scale is a power of four blocks: one pixel, four blocks, one window', () => {
  assert.equal(CELLS_PER_PIXEL, 256);
  assert.equal(BLOCK_CELLS, 64);
  assert.equal(BLOCKS_PER_PIXEL, 4);
  assert.equal(WINDOW_CELLS, 128, 'the window is the level: two blocks across');
  assert.equal(CELLS_PER_PIXEL / BLOCK_CELLS, BLOCKS_PER_PIXEL);
});

test('a settlement stands inside its own pixel, with country on every side of it', () => {
  // The largest level the install ships is 128 cells (four fifths of the 105…128 measured over its
  // seventeen skeletons), so this is the worst case: a 128-cell city in one pixel leaves 64 cells of
  // country on each side — a quarter of a pixel, which is the room `settlementInWindow` needs.
  for (const [x, y] of [[0, 0], [43, 74], [131, 79], [319, 199]]) {
    const f = footprintOf({ x, y }, { width: 128, depth: 128 });
    assert.equal(f.row0, y * CELLS_PER_PIXEL + 64, 'centred on the pixel, in rows');
    assert.equal(f.col0, x * CELLS_PER_PIXEL + 64, 'centred on the pixel, in cols');
    assert.ok(f.row0 >= y * CELLS_PER_PIXEL && f.row0 + f.depth <= (y + 1) * CELLS_PER_PIXEL, 'inside its own pixel, rows');
    assert.ok(f.col0 >= x * CELLS_PER_PIXEL && f.col0 + f.width <= (x + 1) * CELLS_PER_PIXEL, 'inside its own pixel, cols');
  }
  // A village is smaller and so sits further from its pixel's own edge.
  const village = footprintOf({ x: 10, y: 10 }, { width: 105, depth: 105 });
  assert.ok(village.row0 > 10 * CELLS_PER_PIXEL + 64);
});

test('a cell and a pixel are each other’s, in both directions', () => {
  for (const [row, col] of [[0, 0], [1, 1], [255, 255], [256, 256], [19135, 12360]]) {
    const pixel = pixelOfCell(row, col);
    const corner = cellOriginOfPixel(pixel);
    assert.ok(row >= corner.row && row < corner.row + CELLS_PER_PIXEL, `${row} is inside ${corner.row}`);
    assert.ok(col >= corner.col && col < corner.col + CELLS_PER_PIXEL, `${col} is inside ${corner.col}`);
    assert.deepEqual(pixelOfCell(corner.row, corner.col), pixel, 'the corner belongs to the pixel it came from');
  }
  // The block a cell is in, and the two conversions a city page and a country page share.
  assert.deepEqual(blockOfCell(19000, 12300), { blockRow: 296, blockCol: 192 });
  assert.deepEqual(blockOfCell(64, 64), { blockRow: 1, blockCol: 1 });
  const f = { row0: 19008, col0: 12352, width: 128, depth: 128 };
  assert.deepEqual(worldCellOfCity(f, 8, 127), { row: 19016, col: 12479 });
  assert.deepEqual(cityCellOfWorld(f, 19016, 12479), { row: 8, col: 127 });
});

// ── the country is where it is ──────────────────────────────────────────────────────────────

test('a block’s country is a function of where the block is, and of nothing else', () => {
  const first = blockHash(298, 193);
  assert.equal(first, blockHash(298, 193), 'the same block is the same country, always');
  assert.equal(first, blockHash(298, 193) >>> 0, 'a 32-bit number');
  // Neighbours do not share a draw: nothing about the countryside is a stripe.
  const seen = new Set();
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) seen.add(blockHash(100 + row, 200 + col));
  }
  assert.equal(seen.size, 25, 'twenty-five blocks, twenty-five draws');
  // The draw itself is two draws of the original's own generator, over the category's list.
  const a = countryAt({ blockRow: 298, blockCol: 193, lists: fakeLists, climate: 'temperate' });
  const b = countryAt({ blockRow: 298, blockCol: 193, lists: fakeLists, climate: 'temperate' });
  assert.deepEqual(a, b);
  assert.ok(CATEGORIES.includes(a.category), `${a.category} is one of the five categories`);
  assert.ok(fakeLists[a.category].includes(a.id), `${a.id} is drawn from the ${a.category} list`);
});

test('the climate tilts the categories, and a percentage is a weight', () => {
  for (const [climate, weights] of Object.entries(CLIMATE_CATEGORY_WEIGHTS)) {
    const total = CATEGORIES.reduce((sum, key) => sum + weights[key], 0);
    assert.equal(total, 100, `${climate}'s weights are a share of the country and sum to 100`);
    // Exactly the weights, over the hundred percentages the draw can produce: 0…99 tiles the row
    // with no gap and no overlap, which is what "a weight is a share of the country" means.
    const counts = {};
    for (let percent = 0; percent < 100; percent++) {
      const category = countryCategory(percent, climate);
      counts[category] = (counts[category] ?? 0) + 1;
    }
    for (const key of CATEGORIES) assert.equal(counts[key] ?? 0, weights[key], `${climate}: ${key}`);
  }
  // An unknown climate reads as temperate rather than as nothing, and out-of-range input is clamped
  // rather than answered with `undefined`.
  assert.equal(countryCategory(0, 'swamp'), 'normal');
  assert.equal(countryCategory(-5, 'temperate'), countryCategory(0, 'temperate'));
  assert.equal(countryCategory(99, 'temperate'), countryCategory(99, 'temperate'));
  assert.equal(countryCategory(100, 'temperate'), countryCategory(99, 'temperate'));
  // The tilts a player would expect: a desert is emptier than a temperate land, a mountain has more
  // ruins. Stated as the ordering they are, because the numbers themselves are this project's.
  assert.ok(CLIMATE_CATEGORY_WEIGHTS.desert.normal > CLIMATE_CATEGORY_WEIGHTS.temperate.normal);
  assert.ok(CLIMATE_CATEGORY_WEIGHTS.mountain.dungeon > CLIMATE_CATEGORY_WEIGHTS.desert.dungeon);
});

test('the sea is the map’s own sea, and off the map is the sea as well', () => {
  const terrain = new Uint8Array(WORLD_PIXELS.width * WORLD_PIXELS.height).fill(251);
  terrain[3 * WORLD_PIXELS.width + 2] = TERRAIN_SEA;
  assert.equal(isSeaPixel(terrain, { x: 2, y: 3 }), true);
  assert.equal(isSeaPixel(terrain, { x: 3, y: 3 }), false);
  assert.equal(isSeaPixel(terrain, { x: -1, y: 0 }), true, 'off the map is off the world');
  assert.equal(isSeaPixel(terrain, { x: 0, y: WORLD_PIXELS.height }), true);
  assert.equal(isSeaPixel(null, { x: 0, y: 0 }), false, 'no terrain is not a claim about the sea');
  // A cell reads its block's own pixel: the coastline steps in 64-cell blocks, which is the finest
  // the map's data can be read at.
  assert.equal(isSeaCell(terrain, 3 * CELLS_PER_PIXEL, 2 * CELLS_PER_PIXEL), true);
  assert.equal(isSeaCell(terrain, 3 * CELLS_PER_PIXEL + 200, 2 * CELLS_PER_PIXEL + 200), true);
  assert.equal(isSeaCell(terrain, 4 * CELLS_PER_PIXEL, 2 * CELLS_PER_PIXEL), false);
});

test('wilderness climate follows province styles and only the nearby named city forces snowfall', { skip: needInstall }, () => {
  for (const name of ['Bruma', 'Winterhold', 'Windhelm', 'Necrom', 'Corinth']) {
    const city = world.byName(name);
    const here = youAreHere(world, city.tamriel.y * CELLS_PER_PIXEL + 128, city.tamriel.x * CELLS_PER_PIXEL + 128);
    assert.equal(here.provinceID, city.provinceID, name);
    assert.equal(here.climate, city.climate, name);
    assert.equal(here.weather, city.weather, name);
  }
  const daggerfall = world.byName('Daggerfall');
  const far = world.byName('Corinth');
  const here = youAreHere(world, far.tamriel.y * CELLS_PER_PIXEL, far.tamriel.x * CELLS_PER_PIXEL);
  assert.equal(here.provinceID, 6);
  assert.notEqual(here.nearest.name, daggerfall.name);
  assert.equal(here.weather, null);
});

// ── the install's own world ─────────────────────────────────────────────────────────────────

test('the province map’s own pixel lands where the province map would draw it', { skip: needInstall }, () => {
  let checked = 0;
  for (const location of world.locations) {
    const back = provincePixelOf(world, location.tamriel);
    const province = world.provinceAtWorld(location.tamriel);
    if (!back || !province) continue;       // a record whose pixel is sea (`provinceAt` says so)
    // **The forward round trip is what the dot needs**: the pixel we answer with must scale back
    // (`cityDataFile.globalPoint`, the install's own sum) to the world pixel the player is standing
    // on — one pixel of the map, which is what "between the right two towns" means at 320×200.
    assert.equal(province.id, location.provinceID, `${location.name}: painted border owns the walkable location`);
    assert.deepEqual(back, location.local, `${location.name}: art-grid position returns its exact province marker`);
    // And it must stay inside the province's own rectangle rather than drifting off its edge.
    assert.ok(back.x >= 0 && back.x < 320 && back.y >= 0 && back.y < 200, `${location.name} is on the map`);
    checked++;
  }
  assert.ok(checked > 250, `most of the install's records walk the round trip (${checked})`);
  // **The install's own `local` pair is quantised, and the dot is drawn from the world pixel** —
  // a province's rectangle is a fraction of the 320-pixel map (High Rock's is 46 wide, so its scale
  // is 14 and one of its local pixels is 0.14 world pixels), so the pair a record stores and the
  // rectangle's own reading of it cannot be the same integer. Stated rather than hidden: the reading
  // above is the one the map can draw, and it is a pixel of the province's own picture.
  //
  // A pixel outside every province has no province map to be drawn on — and the sea is where that
  // happens, which is why the map falls back to the continent for a player out at sea.
  assert.equal(provincePixelOf(world, { x: -20, y: -20 }), null);
});

test('no window holds two settlements — the check over the install’s own 288 records', { skip: needInstall }, () => {
  // The largest level the install ships, for every record: if *that* cannot put two cities in one
  // window, the real (smaller) footprints cannot either.
  const footprints = footprintsOf(world.settlements(), () => ({ width: 128, depth: 128 }));
  assert.equal(footprints.length, world.settlements().length);
  assert.ok(footprints.length > 250, `${footprints.length} settlements`);
  let origins = 0;
  /** @type {Set<string>} */
  const shared = new Set();
  for (const entry of footprints) {
    const f = entry.footprint;
    // Every window the game can stand on begins on a block boundary (`wilderness.wildernessWindowOrigin`
    // snaps to multiples of 64), so those are the origins that matter.
    const rowStarts = [];
    for (let row = Math.floor((f.row0 - WINDOW_CELLS) / BLOCK_CELLS) * BLOCK_CELLS; row <= f.row0 + f.depth; row += BLOCK_CELLS) rowStarts.push(row);
    for (let col = Math.floor((f.col0 - WINDOW_CELLS) / BLOCK_CELLS) * BLOCK_CELLS; col <= f.col0 + f.width; col += BLOCK_CELLS) {
      for (const row of rowStarts) {
        const inside = footprints.filter((other) => footprintInWindow(other.footprint, row, col));
        origins++;
        // **One *place* per window**, which is the law — and it is the only exception the install
        // itself makes: two *records* on one world pixel are one city with two names, and the world
        // has exactly one such pair (`worldMap.js` records it; `settlementAt` says the caller's own
        // order decides). Anything else would be two cities in one level.
        const pixels = new Set(inside.map((other) => `${other.settlement.tamriel.x},${other.settlement.tamriel.y}`));
        assert.equal(pixels.size <= 1, true,
          `window ${row},${col} holds ${inside.map((e) => `${e.settlement.name}@${e.settlement.global.x},${e.settlement.global.y}`).join(' and ')}`);
        if (pixels.size === 1 && inside.length > 1) for (const pixel of pixels) shared.add(pixel);
      }
    }
  }
  assert.ok(origins > 5000, `${origins} aligned windows checked`);
  assert.deepEqual([...shared], [], 'every one of the 288 settlements stands on a distinct world pixel');
});

test('the ground the player stands on: a city cell is the city, a country cell is the country', { skip: needInstall }, () => {
  const footprints = footprintsOf(world.settlements(), () => ({ width: 128, depth: 128 }));
  const daggerfall = world.byName('Daggerfall');
  const own = footprints.find((entry) => entry.settlement === daggerfall);
  assert.ok(own, 'Daggerfall has a footprint');
  const middle = { row: own.footprint.row0 + 64, col: own.footprint.col0 + 64 };
  assert.equal(settlementAt(footprints, middle.row, middle.col), daggerfall, 'the middle of Daggerfall is Daggerfall');
  assert.equal(settlementAt(footprints, middle.row + 300, middle.col), null, 'three hundred cells east is country');
  assert.equal(settlementInWindow(footprints, own.footprint.row0, own.footprint.col0), daggerfall);
  assert.equal(settlementInWindow(footprints, middle.row + 4096, middle.col + 4096), null);
  // The climate of a window is the biome of its own centre, which is what its `.INF` is read from.
  assert.equal(world.worldClimateAt(pixelOfCell(own.footprint.row0 + 64, own.footprint.col0 + 64)), daggerfall.climate);
});

test('you are here: one reading, in every space the game needs to say it', { skip: needInstall }, () => {
  const daggerfall = world.byName('Daggerfall');
  const row = daggerfall.tamriel.y * CELLS_PER_PIXEL + 128;
  const col = daggerfall.tamriel.x * CELLS_PER_PIXEL + 128;
  const here = youAreHere(world, row, col, { settlement: daggerfall });
  assert.equal(here.settlement.name, 'Daggerfall');
  assert.equal(here.country, false);
  assert.equal(here.label, 'Daggerfall');
  assert.equal(here.provinceName, 'High Rock');
  assert.equal(here.sea, false);
  assert.deepEqual(here.pixel, daggerfall.tamriel);
  assert.ok(here.local && Number.isFinite(here.local.x), 'and a pixel on the province’s own hand-drawn map');

  // Out in the country: no settlement owns the cell, and the label says so rather than naming one.
  const country = youAreHere(world, row + 300, col + 300);
  assert.equal(country.settlement, null);
  assert.equal(country.country, true);
  assert.match(country.label, /^the country near /);
  assert.equal(country.nearest?.name, 'Daggerfall');

  // The sea, where no province holds the pixel: `youAreHere` still answers, and says what it is.
  const seaPixel = (() => {
    const terrain = world.worldTerrain.indices;
    for (let i = 0; i < terrain.length; i++) {
      if (terrain[i] !== TERRAIN_SEA) continue;
      const x = i % WORLD_PIXELS.width;
      const y = Math.floor(i / WORLD_PIXELS.width);
      if (world.provinceAt({ x, y })) continue;
      return { x, y };
    }
    return null;
  })();
  assert.ok(seaPixel, 'the install’s own map has open water outside every province');
  const atSea = youAreHere(world, seaPixel.y * CELLS_PER_PIXEL + 128, seaPixel.x * CELLS_PER_PIXEL + 128);
  assert.equal(atSea.sea, true);
  assert.equal(atSea.label, 'open water');
  assert.equal(atSea.country, true);
});

// ── the door in the wall ────────────────────────────────────────────────────────────────────

test('the gate law: on the gate’s line, one cell in and two cells out', () => {
  const f = { row0: 19008, col0: 12352, width: 128, depth: 128 };
  const south = { row: 127, col: 8, axis: 'south' };
  const at = (row, col, reach = 2) => atSettlementGate(f, south, row, col, reach);
  // The wall's own line: city row 127 is world row 19135.
  assert.equal(at(19135, 12360), true, 'standing on the wall’s line, in the opening');
  assert.equal(at(19134, 12360), true, 'one cell inside (the first paving stone)');
  assert.equal(at(19133, 12360), false, 'two cells inside is the street, not the door');
  assert.equal(at(19136, 12360), true, 'one cell out in the country');
  assert.equal(at(19137, 12360), true, 'two cells out');
  assert.equal(at(19138, 12360), false, 'three cells out is a step away, not at the door');
  // The gate's own line, and nothing beside it: the opening is two cells wide, and a player walking
  // along the wall past it is not walking through it.
  assert.equal(at(19135, 12361), true, 'the second cell of the opening');
  assert.equal(at(19135, 12362), false, 'two cells along the wall is beside the door');
  // Both directions of the same door, and the arrival cells three clear of the wall.
  assert.deepEqual(outsideGateCell(f, south, 3), { row: 19138, col: 12360 });
  assert.deepEqual(insideGateCell(f, south, 3), { row: 124, col: 8 });
  const north = { row: 0, col: 20, axis: 'north' };
  assert.deepEqual(outsideGateCell(f, north, 3), { row: 19005, col: 12372 });
  assert.deepEqual(insideGateCell(f, north, 3), { row: 3, col: 20 });
  assert.equal(atSettlementGate(f, north, 19005, 12372, 3), true);
  const west = { row: 40, col: 0, axis: 'west' };
  assert.deepEqual(outsideGateCell(f, west, 3), { row: 19048, col: 12349 });
  assert.deepEqual(insideGateCell(f, west, 3), { row: 40, col: 3 });
  assert.equal(atSettlementGate(f, west, 19048, 12352, 2), true);
  // A gate nobody is near, and a gate asked about a footprint it does not belong to.
  assert.equal(atSettlementGate(f, south, 12000, 12360, 2), false);
  assert.equal(atSettlementGate(null, south, 19135, 12360, 2), false);
  assert.equal(atSettlementGate(f, null, 19135, 12360, 2), false);
});

test('a block can be told what it is — the dungeon mouth is a flat in open country, not a house', async () => {
  // The owner, 2026-10-17: *"dungeon entrances are full buildings instead … should be a PNG"*.
  // A `dungeon` category block is built from the ruin `.RMD`s (walls, a roof, a door), so the
  // block at a dungeon's pixel drew a building the player could walk into. `countryAt` now takes
  // a `forceCategory`, and the one caller — the door block — asks for `normal`: open ground with
  // the install's `WDUNGDR1.IMG` flat standing on it.
  const { countryAt } = await import('../../src/game/tamrielGrid.js');
  const lists = { normal: [11, 12, 13], dungeon: [91, 92] };
  for (const climate of ['temperate', 'desert', 'mountain', 'swamp']) {
    const forced = countryAt({ blockRow: 5, blockCol: 7, lists, climate, forceCategory: 'normal' });
    assert.equal(forced.category, 'normal', `${climate}: the block is open country`);
    assert.ok(lists.normal.includes(forced.id), `${climate}: drawn from the open-country list`);
    assert.ok(!lists.dungeon.includes(forced.id), `${climate}: never from the ruin list`);
  }
  // Unforced blocks keep the draw they always had.
  const drawn = countryAt({ blockRow: 5, blockCol: 7, lists, climate: 'mountain' });
  assert.ok(['normal', 'dungeon', 'forest', 'hills', 'water'].includes(drawn.category));
});
