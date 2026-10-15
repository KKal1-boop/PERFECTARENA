// THE RANDOM DUNGEONS: ARENA'S OWN PIECES, AND WHETHER THEY MAKE A LEVEL.
//
// Arena's 144 dungeon records are two named ones per province and 128 with no name at
// all. Only the named sixteen ship as loose `.MIF` files; the rest are what the original
// *generates*, and `game/dungeonPlan.js` assembles them out of the install's own
// `RANDOM1.MIF` — 32 pieces of 32×32 cells. These tests ask the questions that can be
// answered wrong:
//
//   * are the pieces really pieces? They have to be walled on all four borders with
//     openings at the *same* cells, or four of them stamped into a level would be four
//     sealed rooms;
//   * is a level **walkable**? The player's spawn must reach the rest of it;
//   * is the draw the dungeon's own, so the same dungeon is the same level every visit,
//     and two dungeons are not the same level?
//
// Run:  node --test tests/unit/dungeonplan.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { discoverLooseMifs, enterableDungeons, enterableFromListing } from '../../src/game/radiantQuests.js';
import {
  BRUSH_SIZE, DUNGEON_BLOCKS_INF, DUNGEON_BLOCKS_MIF, DUNGEON_LEVEL_SIZE, QUADRANT_SLOTS,
  SHARED_OPENINGS, assembleDungeon, borderOpenings, commonWallVoxel, headerArrival, quadrantPicks,
  seamsAgree, spawnCellFor, walkableRaw,
} from '../../src/game/dungeonPlan.js';
import { isWallVoxel, rawPassable } from '../../src/game/mifLevel.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

const blockFile = await data.mif(DUNGEON_BLOCKS_MIF);
const blocksInf = await data.inf(DUNGEON_BLOCKS_INF);
const world = await loadWorldMap(new ArenaData(nodeSource(ARENA), { onWarn: () => {} }));
const loose = await discoverLooseMifs(nodeSource(ARENA));

/** The cells a walk can reach from `start`, with doors counted as passable. */
function reachable(level, start) {
  const seen = new Set();
  const queue = [start.row * level.width + start.col];
  seen.add(queue[0]);
  while (queue.length) {
    const index = queue.pop();
    const row = Math.floor(index / level.width);
    const col = index % level.width;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= level.depth || c >= level.width) continue;
      const next = r * level.width + c;
      if (seen.has(next)) continue;
      const cell = level.cells[next];
      if (!cell || cell.floor?.chasm) continue;
      if (cell.solid && cell.kind !== 'door') continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

test('the install ships the dungeon pieces the generator needs', () => {
  assert.equal(blockFile.levels.length, 32, 'RANDOM1.MIF is 32 levels of dungeon pieces');
  assert.equal(blockFile.width, BRUSH_SIZE);
  assert.equal(blockFile.height, BRUSH_SIZE);
  for (const level of blockFile.levels) assert.equal(level.map1.length, BRUSH_SIZE * BRUSH_SIZE);
  // The `.INF` the pieces name is a dungeon's: a ceilinged, indoor set of walls and flats.
  assert.equal(blocksInf.ceiling.outdoorDungeon, false);
  assert.ok(blocksInf.voxelTextures.length > 40, `${blocksInf.voxelTextures.length} wall textures`);
  assert.ok(blocksInf.flats.length > 40, `${blocksInf.flats.length} flats`);
  for (const level of blockFile.levels) assert.equal(level.info.toUpperCase(), DUNGEON_BLOCKS_INF);
});

test('every piece opens at the same four cells on all four borders, so four of them join', () => {
  const openings = blockFile.levels.map((level) => borderOpenings(level));
  for (const [i, open] of openings.entries()) {
    for (const side of ['top', 'bottom', 'left', 'right']) {
      assert.ok(open[side].length >= 2, `piece ${i} (${blockFile.levels[i].name}) opens on its ${side}`);
      assert.ok(open[side].every((cell) => cell >= 0 && cell < BRUSH_SIZE));
      // The four slots the shipped pieces are cut for, on every side of every one of them.
      // A piece that moved its own doorway would seal the level it is stamped into, which
      // is why this is pinned rather than assumed. A piece may open *more* widely (one of
      // the 32 has an interior corridor reach its border), and that is harmless: a seam
      // only needs one shared slot.
      for (const slot of SHARED_OPENINGS) {
        assert.ok(open[side].includes(slot), `piece ${i} opens at ${slot} on its ${side}`);
      }
    }
  }
  // …and the seams agree in both directions, which is the property the assembly needs.
  for (const a of openings) {
    for (const b of openings) {
      assert.ok(seamsAgree(a, b, 'vertical'), 'any two pieces join left-to-right');
      assert.ok(seamsAgree(a, b, 'horizontal'), 'any two pieces join top-to-bottom');
    }
  }
});

test('a level is four distinct pieces in four quadrants, and 64×64 cells', () => {
  const level = assembleDungeon({ blocks: blockFile.levels, seed: 4219465407 });
  assert.equal(level.width, DUNGEON_LEVEL_SIZE);
  assert.equal(level.depth, DUNGEON_LEVEL_SIZE);
  assert.equal(level.map1.length, DUNGEON_LEVEL_SIZE * DUNGEON_LEVEL_SIZE);
  assert.equal(level.info, DUNGEON_BLOCKS_INF);
  assert.equal(new Set(level.quadrants).size, QUADRANT_SLOTS.length, 'no quadrant is the same piece twice');
  assert.equal(level.warnings.filter((w) => w.includes('do not open')).length, 0, level.warnings.join('; '));
  const decoded = decodeLevel(level, blocksInf, { width: level.width, depth: level.depth, mapType: 'interior' });
  assert.ok(decoded.cells.length === DUNGEON_LEVEL_SIZE * DUNGEON_LEVEL_SIZE);
  assert.ok(decoded.stats.wall > 200, `${decoded.stats.wall} wall cells`);
  assert.ok(decoded.stats.door > 0, `${decoded.stats.door} doors in the pieces`);
  assert.equal(decoded.outdoors, false, 'a dungeon has a roof');
});

test('the player can walk out of the arrival cell into the rest of the level', () => {
  // The whole point of the assembly: four pieces whose doorways line up make **one** level.
  // Measured the way the player moves — doors passable, walls not — from the spawn the
  // install's own header names.
  const report = [];
  const seeds = [1, 42, 4219465407, 41670361, 123456789, 42488202, 987654321];
  for (let seed = 1; seed <= 40; seed++) seeds.push(seed * 7919);
  for (const seed of seeds) {
    const level = assembleDungeon({ blocks: blockFile.levels, seed, startPoints: blockFile.startPoints ?? [] });
    const decoded = decodeLevel(level, blocksInf, { width: level.width, depth: level.depth, mapType: 'interior' });
    // The arrival the *scene* places the player on: the header's own point when it opens onto
    // the level, the largest region's middle when it does not (`spawnCellFor`).
    const from = spawnCellFor(decoded, blockFile.startPoints ?? []);
    assert.ok(from, `seed ${seed}: the level has somewhere to arrive`);
    const walkable = decoded.cells.filter((c) => (!c.solid || c.kind === 'door') && !c.floor?.chasm).length;
    const reached = reachable(decoded, from);
    const share = reached.size / walkable;
    assert.ok(/(header|region)/.test(from.from));
    report.push(`seed ${seed} ${from.from}: ${reached.size}/${walkable} (${(100 * share).toFixed(0)}%)`);
    assert.ok(share >= 0.7, `seed ${seed}: the arrival reaches ${(100 * share).toFixed(0)}% of the level — ${report.slice(-8).join('; ')}`);
  }
});

test('the draw is the dungeon\'s own: the same seed is the same level, another seed is not', () => {
  const a = assembleDungeon({ blocks: blockFile.levels, seed: 12345 });
  const b = assembleDungeon({ blocks: blockFile.levels, seed: 12345 });
  const c = assembleDungeon({ blocks: blockFile.levels, seed: 999 });
  assert.deepEqual(a.quadrants, b.quadrants);
  assert.deepEqual([...a.map1], [...b.map1], 'the same dungeon is the same voxels');
  assert.notDeepEqual(a.quadrants, c.quadrants, 'a different dungeon is a different level');
  assert.deepEqual(quadrantPicks(12345, 32), a.quadrants);
  // Every quadrant is a real index into the file.
  for (const pick of a.quadrants) assert.ok(Number.isInteger(pick) && pick >= 0 && pick < 32);
  // …and the picks spread across the file rather than clustering on one piece.
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) for (const pick of quadrantPicks(seed, 32)) seen.add(pick);
  assert.ok(seen.size >= 30, `${seen.size} of the 32 pieces come up over 200 seeds`);
});

// ── a level that holds the player in ─────────────────────────────────────────
//
// Two reported defects, and they turned out to be one line: a wall is read **one way**
// (`mifLevel.isWallVoxel`) and the assembler had grown a second reading that demanded the
// voxel's high nibble be `0`, while the pieces this install ships build their walls out of
// nibble 1 and 3 cells (`0x1717`, `0x1a1a`, `0x3b3b`). So the assembler found no wall in a real
// dungeon at all: the pass that closes the level's own outer wall sealed **nothing**, and the
// stair that is the way out was stamped into an open cell beside the arrival.

test('a voxel is read one way, and it is the decoder\'s way', () => {
  // The walls the install's pieces are actually made of — nibble 1 and 3, `most === least`.
  for (const id of [0x1717, 0x1a1a, 0x3b3b, 0x1919, 0x0505]) {
    assert.equal(isWallVoxel(id), true, `0x${id.toString(16)} is a wall`);
    assert.equal(rawPassable(id), false, `and nobody walks through it`);
  }
  // Air is not a wall — this is the one that broke the exit (`0 & 0x7f00 === 0 & 0x7f`).
  assert.equal(isWallVoxel(0), false);
  assert.equal(rawPassable(0), true);
  // The shapes the decoder answers before it ever reaches `most === least`.
  assert.equal(isWallVoxel(0x8001), false, 'an entity is art on the floor');
  assert.equal(rawPassable(0x8001), true);
  assert.equal(isWallVoxel(0xb013), false, 'a door is not a wall');
  assert.equal(rawPassable(0xb013), true, 'and a door opens');
  assert.equal(rawPassable(0x1201), false, 'a raised platform is solid');
  assert.equal(rawPassable(0x1717, { chasm: true }), false, 'and a chasm is not floor whatever the voxel says');
});

test('the outer wall of a generated level has no doorway left in it', () => {
  // A piece is walled on all four borders *with openings* — that is what makes a seam work — and
  // four pieces put eight of those borders on the finished level's outside. Before the sealing
  // pass every single assembled level had 32–67 walkable cells on its own outer ring
  // (`tools/dungeon-audit.mjs`), which is the map edge a player could walk off.
  const exitVoxel = (((blocksInf.levelUpIndex ?? 28) + 1) << 8) | ((blocksInf.levelUpIndex ?? 28) + 1);
  const seeds = [1, 42, 4219465407, 4164937535, 123456789, 4255113055];
  for (let seed = 1; seed <= 24; seed++) seeds.push(seed * 7919);
  for (const seed of seeds) {
    const level = assembleDungeon({
      blocks: blockFile.levels, seed, startPoints: blockFile.startPoints ?? [], exitVoxel,
    });
    assert.ok(level.sealed.sealed > 0, `seed ${seed}: the boundary pass closed ${level.sealed.sealed} opening(s)`);
    // …and the ring itself, read the way the assembler reads a voxel.
    let open = 0;
    for (let k = 0; k < level.width; k++) {
      for (const [r, c] of [[0, k], [level.depth - 1, k], [k, 0], [k, level.width - 1]]) {
        if (walkableRaw(level, r, c)) open++;
      }
    }
    assert.equal(open, 0, `seed ${seed}: ${open} way(s) out of the map`);
    // The decoder agrees: no cell on the outer ring is somewhere a player can stand.
    const decoded = decodeLevel(level, blocksInf, { width: level.width, depth: level.depth, mapType: 'interior' });
    const standable = (row, col) => {
      const cell = decoded.cells[row * level.width + col];
      return Boolean(cell) && !cell.floor?.chasm && (!cell.solid || cell.kind === 'door');
    };
    for (let k = 0; k < level.width; k++) {
      assert.equal(standable(0, k), false, `seed ${seed}: the top edge at column ${k} is open`);
      assert.equal(standable(level.depth - 1, k), false, `seed ${seed}: the bottom edge at ${k} is open`);
      assert.equal(standable(k, 0), false, `seed ${seed}: the left edge at row ${k} is open`);
      assert.equal(standable(k, level.width - 1), false, `seed ${seed}: the right edge at row ${k} is open`);
    }
    // The arrival is inside the level, not on its edge…
    const from = spawnCellFor(decoded, blockFile.startPoints ?? []);
    assert.ok(from, `seed ${seed}: an arrival`);
    assert.ok(from.row > 0 && from.col > 0 && from.row < level.depth - 1 && from.col < level.width - 1,
      `seed ${seed}: arrived at ${from.row},${from.col} — on the level's own edge`);
    // …and the way out is the install's own stairway, stamped into a wall within reach of it.
    assert.ok(level.exit, `seed ${seed}: a way out was stamped`);
    const exitCell = decoded.cells[level.exit.row * level.width + level.exit.col];
    assert.ok(exitCell.solid, `seed ${seed}: the way out is in a wall, not in the open floor`);
    assert.ok(exitCell.stair === 'up' || exitCell.stair === 'down',
      `seed ${seed}: the way out is a stairway the .INF names (got ${exitCell.stair})`);
    assert.ok(Math.max(Math.abs(level.exit.row - level.arrival.row), Math.abs(level.exit.col - level.arrival.col)) <= 4,
      `seed ${seed}: the way out is beside the arrival`);
    assert.ok(commonWallVoxel(level) > 0, `seed ${seed}: the level has plain walls to build one from`);
  }
});

test('a .MIF\'s zero start point is an unused slot, not a place on the map', () => {
  // `RANDOM1.MIF` answers `[{x:1344,y:1344}, {x:0,y:0}, {x:0,y:0}, {x:0,y:0}]`. Read literally,
  // `0 / 128 − 0.5` rounds to `-0`: the map's **corner**, which on the shipped pieces is
  // walkable, so the arrival landed there (`Crypt of Hearts` arrived at `0,0`).
  assert.deepEqual(headerArrival([{ x: 1344, y: 1344 }, { x: 0, y: 0 }], 64, 64), { row: 10, col: 10 });
  assert.equal(headerArrival([{ x: 0, y: 0 }, { x: 0, y: 0 }], 64, 64), null, 'all placeholders');
  assert.equal(headerArrival([{ x: 64, y: 64 }], 64, 64), null, 'the corner of the map is the void');
  assert.equal(headerArrival([{ x: 128 * 99, y: 128 * 99 }], 64, 64), null, 'and so is off the map');
  assert.equal(headerArrival([], 64, 64), null, 'a file with no points at all');
  assert.equal(headerArrival(undefined, 64, 64), null);
  // The real file's own first point is the level's (10,10), which is the piece's start.
  assert.deepEqual(headerArrival(blockFile.startPoints ?? [], DUNGEON_LEVEL_SIZE, DUNGEON_LEVEL_SIZE), { row: 10, col: 10 });
});

test('every dungeon in the world can be entered, by its own map or by the pieces', () => {
  const dungeons = world.locations.filter((l) => l.kind === 'dungeon');
  assert.equal(dungeons.length, 144);
  // **Sixteen have the install's own names, 128 have theirs from `dungeonNames.js`.** The
  // sixteen are the quest dungeons and they are the records `CITYDATA.64` really names; the
  // rest are named from their own seed, because a place with coordinates, a seed and a
  // marker on the world map has to be callable — a quest has to name where it sends you.
  const shipped = dungeons.filter((d) => loose.has(String(d.mif).toUpperCase()));
  assert.equal(shipped.length, 16, 'every shipped dungeon is one of the sixteen records');
  assert.equal(new Set(shipped.map((d) => d.mif)).size, 16);
  assert.equal(loose.has(DUNGEON_BLOCKS_MIF), true, 'and the pieces are in the folder');
  for (const dungeon of shipped) {
    assert.ok(dungeon.name && dungeon.name.length > 2, `${dungeon.mif} keeps the install's own name`);
  }
  // The other 128 have no map of their own — that is what the generator is for.
  const generated = dungeons.filter((d) => !loose.has(String(d.mif).toUpperCase()));
  assert.equal(generated.length, 128);
  for (const dungeon of generated) {
    assert.ok(dungeon.name && dungeon.name.length > 2, `${dungeon.mif} is named`);
    assert.ok(Number.isInteger(dungeon.dungeonSeed) && dungeon.dungeonSeed > 0, 'a dungeon has a seed to be drawn from');
    const level = assembleDungeon({ blocks: blockFile.levels, seed: dungeon.dungeonSeed, startPoints: blockFile.startPoints ?? [], exitVoxel: 0x1d1d });
    assert.equal(level.width, DUNGEON_LEVEL_SIZE);
    assert.ok(level.arrival, `${dungeon.name}: the assembly knows where its player arrives`);
    assert.ok(level.passages?.passages > 0, `${dungeon.name}: its regions were joined`);
    assert.ok(level.exit, `${dungeon.name}: it has a way out`);
  }
  assert.equal(enterableDungeons(world, enterableFromListing(loose)).length, 144);
});
