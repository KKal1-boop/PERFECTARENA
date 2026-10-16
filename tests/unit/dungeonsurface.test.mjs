// WHERE A DUNGEON COMES OUT.
//
// `game/dungeonSurface.js` is the rule behind the owner's report *"STILL EXITING A DUNGEON JUST
// SHOWS YOU THE MAP NOT THE FUCKING WILDERNESS"*: a dungeon's door is out in the country, at a
// ruin of the nearest settlement's own wilderness, and the ruin is picked by the dungeon's own
// seed. Four things are pinned here, and each of them is a way the rule could be wrong rather
// than merely different:
//
//   1. **a ruin is a block of the drawn grid** — the answer is one of the country's `dungeon`
//      blocks, never a cell in open country and never outside the 4 096-cell grid;
//   2. **the door is that block's own centre cell** — the part the page then repairs with
//      `standNear` when the centre happens to be masonry;
//   3. **the same dungeon gives the same answer**, and two dungeons of one country take
//      different ruins when the country has two — the round trip (exit, walk back in) depends on
//      the first, and "every dungeon shares one ruin" would make the country a single dungeon;
//   4. **a country with no ruins answers null** rather than inventing a cell, and the country is
//      the nearest settlement *that has a wilderness seed* — the palace has none.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ruinBlocks, ruinBlockFor, nearestCountry, dungeonSurface } =
  await import('../../src/game/dungeonSurface.js');
const { WILD_GRID_WIDTH, WILD_CHUNK } = await import('../../src/game/wilderness.js');

/** A country of open ground with ruins at the block addresses given. */
function countryWithRuins(addresses) {
  const categories = new Array(WILD_GRID_WIDTH * WILD_GRID_WIDTH).fill('normal');
  for (const [blockRow, blockCol] of addresses) categories[blockRow * WILD_GRID_WIDTH + blockCol] = 'dungeon';
  return categories;
}

test('a ruin is a block of the grid, addressed the way the window copies blocks', () => {
  const categories = countryWithRuins([[8, 9], [31, 30], [32, 32]]);
  assert.deepEqual(ruinBlocks(categories), [
    { blockRow: 8, blockCol: 9 }, { blockRow: 31, blockCol: 30 }, { blockRow: 32, blockCol: 32 },
  ]);
  assert.deepEqual(ruinBlocks(new Array(WILD_GRID_WIDTH * WILD_GRID_WIDTH).fill('normal')), [],
    'open country has no ruins');
});

test("the door is the ruin block's own centre cell, inside that block", () => {
  const categories = countryWithRuins([[8, 9], [31, 30]]);
  for (const seed of [0, 1, 7, 4242, 39300577]) {
    const ruin = ruinBlockFor(categories, seed);
    assert.equal(ruin.row, ruin.blockRow * WILD_CHUNK + WILD_CHUNK / 2);
    assert.equal(ruin.col, ruin.blockCol * WILD_CHUNK + WILD_CHUNK / 2);
    const row0 = Math.floor(ruin.row / WILD_CHUNK);
    const col0 = Math.floor(ruin.col / WILD_CHUNK);
    assert.deepEqual({ blockRow: row0, blockCol: col0 }, { blockRow: ruin.blockRow, blockCol: ruin.blockCol },
      'the centre cell must read back as the block it was drawn from');
  }
});

test('one dungeon, one door: the same seed always picks the same ruin', () => {
  const categories = countryWithRuins([[8, 9], [31, 30], [40, 3]]);
  for (const seed of [1, 999, 39300577, 0xdeadbeef]) {
    assert.deepEqual(ruinBlockFor(categories, seed), ruinBlockFor(categories, seed));
    assert.equal(ruinBlockFor(categories, seed).ruins, 3);
  }
});

test('a country with two ruins does not put every dungeon in one of them', () => {
  const categories = countryWithRuins([[8, 9], [31, 30]]);
  const seen = new Set();
  for (let seed = 0; seed < 64; seed++) {
    const ruin = ruinBlockFor(categories, seed);
    seen.add(`${ruin.blockRow},${ruin.blockCol}`);
  }
  assert.equal(seen.size, 2, `one ruin for 64 dungeons means the draw ignores the seed: ${[...seen]}`);
});

test('a country with no ruins answers null rather than inventing a door', () => {
  const categories = new Array(WILD_GRID_WIDTH * WILD_GRID_WIDTH).fill('village');
  assert.equal(ruinBlockFor(categories, 12345), null);
  assert.equal(dungeonSurface({ world: { settlements: () => [] }, place: { global: { x: 1, y: 1 } }, categories }), null);
});

test('the country is the nearest settlement that has a wilderness seed, not the palace', () => {
  const world = {
    settlements: () => [
      // The palace is nearer, and cannot hold a ruin: no wilderness of its own.
      { name: 'Imperial Palace', kind: 'palace', global: { x: 100, y: 100 }, wildernessSeed: null },
      { name: 'Rihad', kind: 'city', global: { x: 300, y: 300 }, wildernessSeed: 111 },
      { name: 'Corinth', kind: 'city', global: { x: 500, y: 100 }, wildernessSeed: 222 },
    ],
  };
  assert.equal(nearestCountry(world, { x: 120, y: 120 }).name, 'Rihad');
  assert.equal(nearestCountry(world, { x: 480, y: 120 }).name, 'Corinth');
  assert.equal(nearestCountry({ settlements: () => [] }, { x: 1, y: 1 }), null);
});

test('the whole answer: country, ruin block and the wilderness cell of the door', () => {
  const categories = countryWithRuins([[8, 9], [31, 30]]);
  const world = {
    settlements: () => [{ name: 'Rihad', kind: 'city', global: { x: 300, y: 300 }, wildernessSeed: 1234567 }],
  };
  const place = { kind: 'dungeon', name: 'Stonekeep', global: { x: 310, y: 290 }, dungeonSeed: 39300577 };
  const surface = dungeonSurface({ world, place, categories });
  assert.equal(surface.settlement.name, 'Rihad');
  assert.equal(surface.seed, 1234567);
  assert.equal(surface.ruins, 2);
  const same = dungeonSurface({ world, place, categories });
  assert.deepEqual(surface, same, 'the country a dungeon comes out in is stable');
  // …and the cell is inside the block the rule names.
  assert.equal(Math.floor(surface.cell.row / WILD_CHUNK), surface.block.blockRow);
  assert.equal(Math.floor(surface.cell.col / WILD_CHUNK), surface.block.blockCol);
  assert.ok(surface.cell.row >= 0 && surface.cell.col >= 0
    && surface.cell.row < WILD_GRID_WIDTH * WILD_CHUNK && surface.cell.col < WILD_GRID_WIDTH * WILD_CHUNK);
});
