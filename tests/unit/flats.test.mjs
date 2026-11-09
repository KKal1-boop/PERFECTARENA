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
import {
  collectFlats, flatBaseY, flatGroundY, flatSize, isFolkArt, isTreeArt, personScale,
  MAX_PERSON_HEIGHT, MIN_PERSON_HEIGHT, SCENERY_SCALE, SPRITE_SCALE, STATIC_FLAT_SCALE, TREE_SCALE,
} from '../../src/game/flats.js';
import { DUNGEON_ITEMS, goldFor, pickupNote } from '../../src/game/dungeonItems.js';
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

test('a gem on a pedestal is treasure, not a Staff piece', () => {
  // The flat is `FIREGEM.DFA`, item 13 of the dungeon table. Arena's inventory has no gem
  // category and its quest items are a separate list, so the pickup pays gold; the line has
  // to say how much, or the player cannot tell it from the Staff's own objective.
  assert.equal(DUNGEON_ITEMS[13].kind, 'gem');
  assert.equal(DUNGEON_ITEMS[13].art, 'FIREGEM.DFA');
  const gold = goldFor('gem', () => 0.5);
  assert.ok(gold >= 40 && gold <= 100, `${gold} gold from the gem draw`);
  const note = pickupNote({ kind: 'gem', name: 'a gem' }, gold);
  assert.match(note, /seller/);
  assert.match(note, new RegExp(`${gold} gold`));
});

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

test('a flat standing on water stands on the water, whatever its record’s Y says', () => {
  // The owner, 2026-10-22: *"the sprites AR-sprite-THRUSH01 and AR-sprite-THRUSH02 that get
  // spawned in wilderness near water are floating midair"*. Those two are not birds — they are
  // the install's **corn/reeds** (33×41 and 53×56 px) growing in the shallows, and their `.INF`
  // records carry `Y:20`, which the room-height law turned into half a metre of air.
  const room = { height: 0.9, floorY: 2.5, ceilingY: 5 };
  assert.equal(flatBaseY(20, { ...room, onWater: true }), 2.5, 'the water line is its ground');
  // The same offset on dry ground is still a lift — `TREE02`'s 50 in a palace garden.
  assert.ok(flatBaseY(20, room) > 2.5);
  // A hanging flat is a hanging flat, water or no water: the ceiling rule wins.
  assert.equal(flatBaseY(-50, { ...room, onWater: true }), 5 - 0.9);
});

test('the country’s corn and boats all stand on wet cells — the records with a positive Y', async () => {
  // **Measured, not assumed.** Across every wilderness block this install ships, the only flats
  // with a positive `Y` are the four aquatic records below, and every one of them is placed on a
  // wet chasm — which is what makes `onWater` the right answer for them and a plain lift wrong.
  const { blockIdsFromListing, rmdName } = await import('../../src/arena/rmdFile.js');
  const inf = await data.inf('TWN.INF');
  const ids = blockIdsFromListing((await data.bsa()).names());
  assert.ok(ids.length >= 60, `the install ships the country's blocks (${ids.length})`);
  // The `.INF`'s own records say it too: four positive `Y`s, and all four are water things.
  const liftedRecords = inf.flats.filter((record) => record.yOffset > 0)
    .map((record) => inf.flatTextures[record.textureIndex]).sort();
  assert.deepEqual(liftedRecords,
    ['BOATQURT.IMG', 'BOATSIDE.IMG', 'THRUSH01.IMG', 'THRUSH02.IMG'],
    'TWN.INF lifts exactly the boats and the corn');
  const names = new Set();
  let lifted = 0;
  let onWater = 0;
  for (const id of ids) {
    const rmd = await data.rmd(rmdName(id));
    const level = decodeLevel({
      name: rmdName(id), info: '', numf: 0, flor: rmd.flor, map1: rmd.map1, map2: rmd.map2,
      flat: null, inns: null, loot: null, stor: null, targ: [], lock: [], trig: [],
      startPoints: [], warnings: [],
    }, inf, { width: 64, depth: 64, mapType: 'wilderness' });
    const collected = collectFlats(level, inf);
    for (const flat of collected.flats.filter((f) => (f.yOffset ?? 0) > 0)) {
      lifted++;
      names.add(flat.name);
      if (flat.chasm) onWater++;
    }
  }
  assert.ok(lifted > 300, `${lifted} flats carry a positive Y`);
  // `BOATSIDE` is the one of the four the country's blocks never place; `BOATQURT` and the two
  // corn records are the ones a player stands beside.
  assert.deepEqual([...names].sort(), ['BOATQURT.IMG', 'THRUSH01.IMG', 'THRUSH02.IMG'],
    'the lifted flats the country really places are the boats and the corn');
  assert.equal(onWater, lifted, 'and every one of them stands on water');
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

test('a thing the map placed is drawn as an object, not at the wall density that made the loot pile huge', () => {
  // The owner, beside the original: "the pile of loot with an helm is bigger then what it
  // should be".
  //
  // **The cause was the art's own height crossing a threshold.** The size law split on it — at
  // or above a wall tile's 64 pixels took the *wall's* density (2.5 m per 64 px) — and every loot
  // art in the install is under that except the one with the helm, `EQUIPMEN.IMG` at 84×72,
  // which came out 3.28 m wide and **2.81 m tall**: a heap taller than the player and as tall as
  // a wall. Measured across every `*ITEM` flat record in all 93 shipped INFs
  // (`.scratch/lootsizes.mjs`): key 21×7, corpse 90×34, treasures 35×24 / 87×31 / 99×36, chests
  // 63×27 and 71×29, boat 127×22 — and the pile at 84×72.
  const pile = flatSize(84, 72, 'EQUIPMEN.IMG', { item: true });
  assert.equal(pile.scale, SPRITE_SCALE, 'the heap on the floor is drawn at the figure density');
  assert.ok(pile.h > 1.2 && pile.h < 1.35, `a waist-high heap: ${pile.h.toFixed(2)} m tall`);
  assert.ok(pile.w < 1.6, `${pile.w.toFixed(2)} m wide`);
  // …and the same art read as landscape is a static flat at Arena's own density (128 px to the
  // voxel, `STATIC_FLAT_SCALE`), **not** the wall's: 1.64 m, where the old wall law made 2.81 m.
  const landscape = flatSize(84, 72, 'EQUIPMEN.IMG');
  assert.equal(landscape.scale, STATIC_FLAT_SCALE);
  assert.ok(Math.abs(landscape.h - 1.41) < 0.02, `a heap, not a wall: ${landscape.h.toFixed(2)} m`);

  // The landscape laws: a statue and a chest without an `*ITEM` take Arena's static density, a
  // tree three times it, and an item is an object at the figure's density either way.
  assert.equal(flatSize(138, 138, 'NSTATUE1.IMG').scale, STATIC_FLAT_SCALE);
  assert.equal(flatSize(148, 148, 'NOAK2.IMG').scale, TREE_SCALE);
  assert.equal(flatSize(63, 27, 'CHESTC.IMG', { item: true }).scale, SPRITE_SCALE);
  assert.equal(flatSize(63, 27, 'CHESTC.IMG').scale, STATIC_FLAT_SCALE);
  // **The tree's height is the install's, not a guess**: the wilderness records mark a tree
  // `F:12` (`largeScale`), and 148 px × 3 × (2.5 / 128) = **8.67 m**, three storeys of the
  // engine's 2.5. The old constant guessed 9.0.
  assert.ok(Math.abs(flatSize(148, 148, 'NOAK2.IMG').h - 8.67) < 0.01,
    `the tallest tree is three storeys: ${flatSize(148, 148, 'NOAK2.IMG').h.toFixed(2)} m`);
  assert.equal(flatSize(148, 148, 'NOAK2.IMG', { modifier: 1 }).scale, STATIC_FLAT_SCALE,
    'a small potted tree in a town INF is flagged 1 and stays a shrub');
  // **The owner's "statues and cooking places are slightly too big"** (2026-10-18), measured
  // against the art: `SSTATUE1.IMG` 87×140 was 5.47 m at the wall density and is 2.73 m now; a
  // fire pit (97×71) 2.77 m → 1.39 m; a column (80×148) 5.78 m → 2.89 m. The `.INF`'s own `F:`
  // scale flag is the original's way to ask for more, and it is honoured where a map uses it.
  const statue = flatSize(87, 140, 'SSTATUE1.IMG');
  assert.ok(statue.h > 2.5 && statue.h < 3.0, `a statue a little over life size: ${statue.h.toFixed(2)} m`);
  assert.ok(flatSize(97, 71, 'FIREPIT1.DFA').h < 1.5, 'a cooking fire is at the knee');
  assert.equal(flatSize(140, 140, 'SCOLUMN2.IMG', { modifier: 3 }).scale, STATIC_FLAT_SCALE * 3);
});

test('the court and the watch are drawn as people, not at the wall density that made them giants', async () => {
  // The owner, 2026-10-17: *"GUARDS AND KINGS ARE WAY TOO BIG IN THE PALACE"*. The court and the
  // watch are stills the level's own `.INF` places as flats, so they went through the height
  // split and took the **wall's** density (2.5 m per 64 px) — measured against the install
  // before the fix: `KING.IMG` 65×81 drew 3.16 m tall, `QUEEN.IMG` 80×83 drew 3.24 m,
  // `GUARD2M.IMG` 127×98 drew **3.83 m**, `GUARD1D.IMG` 67×100 drew 3.91 m.
  assert.equal(isFolkArt('KING.IMG'), true);
  assert.equal(isFolkArt('QUEEN.IMG'), true);
  assert.equal(isFolkArt('PRINCE.IMG'), true);
  assert.equal(isFolkArt('PRINCESS.IMG'), true);
  assert.equal(isFolkArt('GUARD1D.IMG'), true);
  assert.equal(isFolkArt('GUARD1.DFA'), true, 'the animated watch record on the same stem');
  assert.equal(isFolkArt('MAN01.DFA'), true);
  assert.equal(isFolkArt('WOMAN04.IMG'), true);
  assert.equal(isFolkArt('BARTEND.DFA'), true);
  assert.equal(isFolkArt('SMITH.DFA'), true);
  // A tall **building** name is not a person, whatever its pixel height: the split is by name.
  assert.equal(isFolkArt('TLAUNDRY.IMG'), false);
  assert.equal(isFolkArt('NSTATUE1.IMG'), false);
  assert.equal(isFolkArt(null), false);
  // And the law where a player sees it: every person record the install ships, measured.
  const people = ['KING.IMG', 'QUEEN.IMG', 'PRINCE.IMG', 'PRINCESS.IMG', 'GUARD1D.IMG', 'GUARD1M.IMG',
    'GUARD2D.IMG', 'GUARD3D.IMG', 'GUARD3M.IMG', 'MAN01.IMG', 'MAN02.IMG', 'WOMAN01.IMG', 'WOMAN04.IMG'];
  for (const name of people) {
    const image = await data.img(name);
    const size = flatSize(image.width, image.height, name);
    assert.equal(size.scale, personScale(image.width, image.height), `${name} is drawn at the person's density`);
    // **A person is in the adult band** (2026-10-18): the figure density alone made a 66-pixel
    // barkeep 1.16 m and a 74-pixel townsman 1.31 m — the owner's "they are too small" — while a
    // tall frame that crossed the wall threshold grew past the player. Every upright person the
    // install ships is now between 1.75 m and 2.00 m — the walking crowd's own band, so a still
    // person stands beside the player's 1.8 rather than a head under the people in the street.
    assert.ok(size.h >= MIN_PERSON_HEIGHT - 1e-9 && size.h <= MAX_PERSON_HEIGHT + 1e-9,
      `${name} (${image.width}×${image.height}) draws ${size.h.toFixed(2)} m tall, an adult`);
    assert.ok(size.w < 2.4, `${name} draws ${size.w.toFixed(2)} m wide`);
  }
  // …and the two records the owner named are the ones the band was written for: a tavern keeper
  // whose art is 66 pixels tall and a townsman of 74 were both shorter than a child.
  for (const [name, pixels] of [['BARTEND.DFA', 66], ['MAN01.DFA', 74]]) {
    const size = flatSize(44, pixels, name);
    assert.ok(size.h >= MIN_PERSON_HEIGHT, `${name} (${pixels} px) is ${size.h.toFixed(2)} m, not a child`);
  }
});

test('nothing grows on water: a flat the map put on a chasm is dropped, not drawn on the surface', () => {
  // The owner, 2026-10-17: *"everywhere grass is not working cause its nowhere if not floating on
  // top of water sometimes"*. A floor flat is drawn at the room's floor, and a chasm cell's floor
  // is **under** the water/lava surface — so a tuft the map places on a wet cell stood on the
  // water. The rule is the map's own: a chasm is not ground.
  const inf = {
    flatTextures: ['GRASS.IMG', 'WEED.IMG'],
    flats: [
      { textureIndex: 0, yOffset: 0, itemIndex: null },
      { textureIndex: 1, yOffset: 0, itemIndex: null },
    ],
  };
  const level = {
    width: 3, depth: 1,
    cells: [
      { kind: 'air', z: 0, x: 0, floor: { chasm: null, flatIndex: 0 } },
      { kind: 'air', z: 0, x: 1, floor: { chasm: 'wet', flatIndex: 1 } },
      { kind: 'air', z: 0, x: 2, floor: { chasm: 'lava', flatIndex: 0 } },
    ],
  };
  const collected = collectFlats(level, inf);
  assert.deepEqual(collected.flats.map((flat) => [flat.name, flat.col]), [['GRASS.IMG', 0]],
    'the dry cell keeps its grass and the two chasm cells keep nothing');
  assert.equal(collected.onWater, 2, 'and the two dropped ones are counted, not silently lost');
});

test('every loot flat the shipped levels place is drawn below a person height', async () => {
  // The law applied where it is seen: the levels' own `*ITEM` loot flats, art size and all.
  let checked = 0;
  for (const name of ['START.MIF', '39300577.MIF']) {
    const { level, inf } = await decode(name);
    const collected = collectFlats(level, inf);
    for (const flat of collected.flats) {
      const kind = DUNGEON_ITEMS[flat.itemIndex]?.kind;
      if (!kind || !flat.name?.endsWith('.IMG')) continue;   // monsters and people are drawn by their own systems
      const image = await data.img(flat.name);
      const size = flatSize(image.width, image.height, flat.name, { item: true });
      checked++;
      assert.ok(size.h < 1.5, `${name} ${flat.name} (${image.width}×${image.height}) draws ${size.h.toFixed(2)} m tall`);
      assert.ok(size.w < 2.5, `${name} ${flat.name} draws ${size.w.toFixed(2)} m wide, wider than a cell`);
    }
  }
  assert.ok(checked >= 8, `${checked} loot flats checked across two levels`);
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

test('a flat on a raised block stands on the block, not on the floor', async () => {
  // D-58: the owner's *"grass/hay on raised blocks floating"*. A raised cell's own top is
  // `floorY + yOffset + ySize` in cells (`mifMesh.js`'s `spanOf`), and a flat painted on that
  // cell has to be based there. `flatGroundY` is the one answer; a cell that is not raised keeps
  // the level's floor to the digit.
  const floorY = 2.5;
  const raised = { kind: 'raised', yOffset: 0.1, ySize: 0.6 };
  const ground = flatGroundY(raised, { floorY, cellSize: CELL_SIZE });
  assert.ok(ground > floorY, `a raised cell's top is above the floor (${ground} vs ${floorY})`);
  assert.equal(ground, floorY + (0.1 + 0.6) * CELL_SIZE);
  // …and the base of a standing flat with no offset is exactly that ground.
  assert.equal(flatBaseY(0, { height: 1, floorY: ground, ceilingY: 5 }), ground);
  // A floor, an air cell, a wall: the level's own floor, unchanged.
  for (const cell of [null, { kind: 'air' }, { kind: 'wall', yOffset: 1, ySize: 2 }]) {
    assert.equal(flatGroundY(cell, { floorY, cellSize: CELL_SIZE }), floorY);
  }
  // The block's own thickness is the span's top: height 0 cannot be below the floor.
  assert.equal(flatGroundY({ kind: 'raised', yOffset: 0, ySize: 0 }, { floorY, cellSize: CELL_SIZE }), floorY);

  // **The archive's own counts, kept honest.** Sampled: `CITY1` (seed 20232) draws 1610 flats
  // and none of them stands on a raised voxel; the hay and camp goods the owner reported are in
  // other blocks and interiors, which is why this law is stated as a rule and tested where it can
  // be falsified (above) rather than pinned to one sample's count.
});
