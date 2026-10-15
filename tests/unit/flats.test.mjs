// THE FLATS — what stands on the ground, and what hangs from the ceiling.
//
// `collectFlats` reads the pair (level voxels, `.INF` records) into a list, and the one
// thing about a flat a player can actually see is *where* it is: the reported "floating
// pngs in dungeons that should be attached to the ceiling" was the scene standing every
// flat on the floor because it never read the record's own `Y`.
//
//   node --test tests/unit/flats.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/flats.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { collectFlats, flatBaseY, isTreeArt } from '../../src/game/flats.js';
import { CELL_SIZE } from '../../src/game/mifMesh.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

/** A decoded level and its INF, the way `interior.js` builds them. */
async function decode(name, index = 0) {
  const mif = await data.mif(name);
  const level = mif.levels[index];
  const inf = await data.inf(level.info);
  return { level: decodeLevel(level, inf, { width: mif.width, depth: mif.height, mapType: 'interior' }), inf };
}

test('a flat with no offset stands on the floor, base first', () => {
  // **The value is the billboard's BASE**, because that is what the renderer places: the
  // batch's `centers` are the quad's bottom and the shader lifts it by the art's own height
  // (`renderer.js`'s “Bottom-anchored: centre sits half a height above the placement base”).
  // Passing a middle here — the first version's mistake — floated every standing flat half
  // its height above the ground, which is the reported "trees, pillars and statues are
  // floating".
  const room = { height: 1.8, floorY: 2.5, ceilingY: 5 };
  assert.equal(flatBaseY(0, room), 2.5);
  // A small positive one (a tree's 5) lifts it by that share of the room.
  assert.equal(flatBaseY(5, room), 2.5 + 2.5 * 0.05);
  // A boulder's 1 is a few centimetres.
  assert.ok(flatBaseY(1, room) - 2.5 < 0.05);
});

test('a flat with a negative offset hangs from the ceiling, top first', () => {
  const room = { height: 1.8, floorY: 2.5, ceilingY: 5 };
  // Its top edge is AT the ceiling, so its base — the value the billboard is given — is one
  // full height below it, and the art therefore reaches exactly down to the ceiling, never
  // through it.
  assert.equal(flatBaseY(-50, room), 5 - 1.8);
  assert.equal(flatBaseY(-100, room), 5 - 1.8, 'the magnitude does not push it through the ceiling');
  // A picture taller than two rooms would reach below the floor; it is clamped at the floor.
  assert.equal(flatBaseY(-100, { ...room, height: 9 }), 2.5);
  // …and a hanging flat's base is always at or above a standing one's.
  assert.ok(flatBaseY(-25, room) >= flatBaseY(0, room));
});

test('the Imperial Dungeons hang their roots and chains from the ceiling', async () => {
  const { level, inf } = await decode('START.MIF');
  const collected = collectFlats(level, inf);
  assert.ok(collected.flats.length > 0, 'START.MIF has scenery');
  assert.ok(collected.hanging > 0, `START.MIF hangs ${collected.hanging} flats`);
  const names = new Set(collected.flats.filter((f) => f.yOffset < 0).map((f) => f.name));
  for (const name of names) {
    assert.match(name, /^(ROOTS|CHAINS|CHAOS)\d*\.(IMG|DFA)$/, `${name} hangs`);
  }
  // Their base is the ceiling minus their own height, which is above the floor — and the
  // room is `ceilingY - floorY` cells tall, so the base must be inside the room and the
  // art's top must not pass through the ceiling.
  const room = { floorY: level.floorY * CELL_SIZE, ceilingY: level.ceilingY * CELL_SIZE };
  for (const flat of collected.flats.filter((f) => f.yOffset < 0)) {
    const height = 1.8;
    const base = flatBaseY(flat.yOffset, { ...room, height });
    assert.ok(base >= room.floorY && base <= room.ceilingY, `${flat.name}: base ${base}`);
    assert.ok(base + height <= room.ceilingY + 1e-9,
      `${flat.name}: top ${base + height} over ${room.ceilingY}`);
  }
});

test('only roots, chains and a dangling flame hang — across every .INF in the install', async () => {
  const archive = await data.bsa();
  /** @type {Set<string>} */
  const hangingNames = new Set();
  let hangingRecords = 0;
  for (const name of archive.names().filter((n) => /\.INF$/.test(n))) {
    let inf;
    try { inf = await data.inf(name); } catch { continue; }
    for (const record of inf.flats ?? []) {
      if ((record.yOffset ?? 0) >= 0) continue;
      hangingRecords++;
      hangingNames.add((inf.flatTextures?.[record.textureIndex] ?? '?').replace(/\d+/g, '#'));
    }
  }
  assert.ok(hangingRecords > 50, `${hangingRecords} hanging flat records`);
  assert.deepEqual([...hangingNames].sort(), ['CHAINS#.IMG', 'CHAOS#.DFA', 'ROOTS#.IMG'].sort());
});

test('every climate\'s trees are named as trees, and nothing else is', async () => {
  // Measured against the archive: each climate prefixes the same three species
  // (`NOAK*/NFIR*/NPINE*`, `S*`, `WOAK*` ... plus `CACTUS*`, `PALM*`, `TREE*`), and the
  // climate-neutral big flats — statues, columns, hedges, cave mouths — are NOT trees.
  assert.equal(isTreeArt('NOAK2.IMG'), true);
  assert.equal(isTreeArt('NFIR1.IMG'), true);
  assert.equal(isTreeArt('SOAK4.IMG'), true);
  assert.equal(isTreeArt('SPINE1.IMG'), true);
  assert.equal(isTreeArt('WOAK2.IMG'), true);
  assert.equal(isTreeArt('FOAK3.IMG'), true);
  assert.equal(isTreeArt('KOAK2.IMG'), true);
  assert.equal(isTreeArt('CACTUS3.IMG'), true);
  assert.equal(isTreeArt('PALM3.IMG'), true);
  assert.equal(isTreeArt('TREE03.IMG'), true);
  assert.equal(isTreeArt('NSTATUE1.IMG'), false);
  assert.equal(isTreeArt('NCOLUMN3.IMG'), false);
  assert.equal(isTreeArt('NBUSH5.IMG'), false);
  assert.equal(isTreeArt('HEDGE2.IMG'), false);
  assert.equal(isTreeArt('CAVE1.IMG'), false);
  assert.equal(isTreeArt(null), false);
  assert.equal(isTreeArt('NOAK2.CFA'), false, 'only the .IMG scenery records are named');
});
