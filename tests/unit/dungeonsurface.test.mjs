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

const { ruinBlocks, ruinBlockFor, nearestCountry, dungeonSurface, ruinDoorStand, HORIZON } =
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

// ── the door inside the ruin (the exit's own arrival) ────────────────────────────────────────
//
// The owner, 2026-10-16: *"when you exit a dungeon and go into the wilderness you exit a building
// not a png with a dungeon entrace like normal arena"*. The block's centre cell was the arrival,
// and a block is 4 096 cells of country — so these four checks are the whole of what replaced it:
// the arch wins, the player stands **outside**, they face **the door**, and a block with nothing
// built in it is refused rather than answered with a stand in the middle of a field.

/** A block whose built cells are the ones a predicate names, plus its arches. */
function blockOf(built, arches = null) {
  const walkableAt = (row, col) => !built(row, col);
  const archAt = arches ? (row, col) => arches(row, col) : null;
  return ruinDoorStand({ walkableAt, archAt });
}

/** The four neighbours of a cell, as the directions the rule weighs. */
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** How many cells of ruin stand within `HORIZON` of a cell, over the four axes. */
function ruinWithin(built, cell) {
  let n = 0;
  for (const [dRow, dCol] of SIDES) {
    for (let step = 1; step <= HORIZON; step++) {
      if (built(cell.row + dRow * step, cell.col + dCol * step)) n++;
    }
  }
  return n;
}

/** The direction a yaw faces, in cells: `openYaw`'s own table (`yaw 0` is +col). */
function facing(yaw) {
  return { dRow: Math.round(Math.sin(yaw)), dCol: Math.round(Math.cos(yaw)) };
}

/** How many of the `ahead` cells from a point in a direction are open ground. */
function runOf(built, cell, dRow, dCol, ahead) {
  let open = 0;
  for (let step = 1; step <= ahead; step++) {
    if (built(cell.row + dRow * step, cell.col + dCol * step)) break;
    open = step;
  }
  return open;
}

test("a ruin's own arch is the door, over any wall nearer the block's centre", () => {
  // A wall across the block's middle (nearest the centre) and an arch 8 cells off it.
  const wall = (row) => row === 30;
  const arch = (row, col) => row === 30 && col === 40;
  const door = blockOf(wall, arch);
  assert.deepEqual(door.door, { row: 30, col: 40 }, 'the arch, not the nearest built cell');
  assert.equal(door.arch, true);
  const noArch = blockOf(wall, arch);
  assert.equal(noArch.door.col, 40);
  const plain = blockOf(wall);
  assert.deepEqual(plain.door, { row: 30, col: 32 }, 'with no arch, the built cell nearest the centre');
  assert.equal(plain.arch, false);
});

test('the player stands outside the ruin, in front of its door, and faces back at it', () => {
  // A 24×24 building north of the block's centre, one arch in its south face.
  const building = (row, col) => row >= 8 && row <= 32 && col >= 20 && col <= 44;
  const arch = (row, col) => row === 32 && col === 32;
  const answer = blockOf(building, arch);
  assert.deepEqual(answer.door, { row: 32, col: 32 });
  assert.ok(answer.stand.row > 32, `the stand is through the arch, not inside it: ${JSON.stringify(answer.stand)}`);
  assert.equal(answer.stand.col, 32, 'and dead in front of the door');
  assert.equal(building(answer.stand.row, answer.stand.col), false, 'the stand cell is not through the wall');
  // `openYaw`'s own convention: yaw 0 faces +col, +π/2 faces +row. Facing the door from a stand
  // that is *south* of it means facing −row, which is −π/2.
  assert.equal(answer.yaw, -Math.PI / 2, 'and the facing looks back at the door');
  const { dRow, dCol } = facing(answer.yaw);
  const paces = Math.abs(answer.stand.row - answer.door.row) + Math.abs(answer.stand.col - answer.door.col);
  assert.ok(paces >= 2 && paces <= 3, `the door is two or three paces away, not ${paces}`);
  assert.equal(runOf(building, answer.stand, dRow, dCol, 12), paces - 1,
    'the ruin starts exactly at the door in front of the player — in sight, a step away');
  assert.equal(runOf(building, answer.stand, -dRow, -dCol, 12), 12,
    'and the country behind them is open, because they came up *outside* the ruin');
  for (const [sRow, sCol] of SIDES) {
    if (sRow === dRow && sCol === dCol) continue;
    assert.ok(runOf(building, answer.stand, sRow, sCol, 2) >= 1,
      `the arrival is not squeezed against the ruin sideways (${sRow},${sCol})`);
  }
});

test('the courtyard is not the outside: the ruin decides which side the player stands on', () => {
  // A ring of walls with 24 cells of courtyard inside it — the ambiguous shape the first version
  // of the rule got wrong by picking whichever side happened to run first.
  const ring = (row, col) => row === 20 || row === 44 || col === 20 || col === 44;
  const answer = blockOf(ring);
  assert.ok(answer.stand.row < 20, `the stand is outside the ring, not in its courtyard: ${JSON.stringify(answer.stand)}`);
  assert.equal(answer.built, 0, 'the open side is the one with no ruin beyond the door');
  // …and a door whose *outside* is the crowded one takes the other side rather than nothing.
  const crowdedOutside = (row, col) => row >= 33 || (row === 32 && col === 32);
  const facing = blockOf(crowdedOutside);
  assert.ok(facing.stand.row < 32, `the stand comes out of the crowded side: ${JSON.stringify(facing.stand)}`);
});

test('a block with no ruin built in it is refused, rather than answered with a field', () => {
  assert.equal(blockOf(() => false), null, 'open country has no door to stand at');
  assert.equal(ruinDoorStand({ walkableAt: () => false }), null, 'and a block that is nothing but ruin has no ground');
  assert.equal(ruinDoorStand({}), null, 'no predicate, no answer');
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
