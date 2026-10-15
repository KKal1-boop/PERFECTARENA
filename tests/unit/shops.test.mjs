// ENTERING A BUILDING — UNIT TESTS AGAINST THE REAL ARCHIVE.
//
// Everything that decides *which door goes where* is a rule over the player's own data:
// the city `.INF`'s `*MENU` slots, the sign index a block's `0xA` edge carries, the
// block's own number, and the eight interiors of each family. Those are what is asserted
// here, with the counts measured from `GLOBAL.BSA` pinned so a different install shows up
// as a difference rather than as doors that quietly open onto nothing.
//
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { buildCityLevel } from '../../src/game/cityPlan.js';
import { decodeLevel } from '../../src/game/mifLevel.js';
import { loadArenaText } from '../../src/arena/arenaText.js';
import { allBlockMifNames } from '../../src/game/tables/cityBlocks.js';
import {
  INTERIOR_VARIANTS, SHOP_KINDS, cityDoors, interiorIndexForBlock, interiorMifName,
  parseBlockName, serviceGreeting, serviceGreetings, shopForInteriorFile, shopSignKinds,
} from '../../src/game/shops.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

const CITY_INFS = ['DCN.INF', 'DCR.INF', 'DCW.INF', 'MCN.INF', 'MCR.INF', 'MCS.INF', 'MCW.INF',
  'TCN.INF', 'TCR.INF', 'TCS.INF', 'TCW.INF'];

test('every city .INF names its shops in the sign art\'s own abbreviations', async () => {
  const bound = [];
  for (const name of CITY_INFS) {
    const inf = await data.inf(name);
    const named = inf.menus
      .map((index, slot) => (index === null || index === undefined ? null : { slot, index, art: inf.voxelTextures[index]?.filename ?? '' }))
      .filter(Boolean);
    bound.push(`${name}:${named.length}`);
    // The same fourteen slots, bound to the same indices, in every one of the eleven: the
    // texture table's layout is Arena's, and only the art differs per climate.
    assert.deepEqual(named.map((n) => `${n.slot}->${n.index}`),
      ['0->5', '1->10', '2->16', '3->23', '4->30', '5->35', '6->40', '7->44', '8->45', '9->53', '11->51', '12->52', '13->50'],
      `${name} binds the menu slots differently`);

    // …and the art names the shop: EQ, TAV, MU (Mages Guild), TEP (temple), BS1–3 (the
    // houses' business signs), NB1 (a noble house).
    const art = (slot) => inf.voxelTextures[inf.menus[slot]]?.filename ?? '';
    for (const [slot, pattern] of [[0, /EQ/], [1, /TAV/], [2, /MU/], [3, /TEP/], [4, /BS1/], [5, /BS2/], [6, /BS3/], [9, /NB1/]]) {
      assert.match(art(slot), pattern, `${name} slot ${slot} = ${art(slot)}`);
    }
    assert.doesNotMatch(art(13), /EQ|TAV|TEP/, `${name}'s slot 13 is the city gate, not a shop`);
  }
  assert.equal(bound.length, CITY_INFS.length);
});

test('the shop signs are the .INF\'s own table, and nothing else is a door', async () => {
  const inf = await data.inf('TCN.INF');
  const kinds = shopSignKinds(inf);
  // Slot 0 binds index 5 (`T_DEQ.IMG`); the blocks draw index 6 (`T_TEQ.IMG`). Both are the
  // same shop, so a slot binds a *pair* — and the pair is taken only where the next entry
  // is art rather than a `.SET` wall sheet (the house slots) or another slot's index (the
  // left/right signposts at 44/45).
  assert.deepEqual([...kinds.keys()].sort((a, b) => a - b), [5, 6, 10, 11, 16, 17, 23, 24, 30, 35, 40, 47, 48, 49, 53]);
  assert.equal(kinds.get(6), 'equipment');
  assert.equal(kinds.get(11), 'tavern');
  assert.equal(kinds.get(17), 'mages');
  assert.equal(kinds.get(24), 'temple');
  assert.equal(kinds.get(53), 'noble');
  // The laundry art is the house blocks' business sign and is in no `*MENU` slot at all —
  // its own name is the evidence that it is a shop, and it opens the `BS` family.
  assert.equal(kinds.get(47), 'house');
  assert.equal(inf.voxelTextures[47].filename, 'TLAUNDRY.IMG');

  // A gate, a bridge, a pair of signposts and two bookstands are `0xA` edges as well, and
  // none of them is a way in.
  for (const index of [4, 44, 45, 50, 51, 52]) {
    assert.equal(kinds.has(index), false, `${inf.voxelTextures[index]?.filename} must not be a door`);
  }
});

test('every sign the real blocks draw is one of five, and each names a shop', async () => {
  const inf = await data.inf('TCN.INF');
  const kinds = shopSignKinds(inf);
  const seen = new Map();
  for (const name of allBlockMifNames()) {
    const block = await data.mif(name);
    for (const id of block.levels[0].map1) {
      if (((id & 0xf000) >> 12) !== 0xa) continue;
      const index = (id & 0x3f) - 1;
      seen.set(index, (seen.get(index) ?? 0) + 1);
    }
  }
  // Measured over all 368 block .MIFs: the sign edges carry exactly these five indices.
  assert.deepEqual([...seen.keys()].sort((a, b) => a - b), [6, 11, 17, 24, 47]);
  for (const index of seen.keys()) {
    const kind = kinds.get(index);
    assert.ok(kind, `sign ${index} is a door but names no shop`);
    assert.ok(SHOP_KINDS[kind], `${kind} is not a SHOP_KINDS entry`);
    assert.ok(seen.get(index) > 0);
  }
  // A block carries more than one door — which is why the sign, not the block's code, is
  // what a door is read from.
  assert.ok(seen.get(6) > 100, `equipment signs: ${seen.get(6)}`);
  assert.ok(seen.get(11) > 100, `tavern signs: ${seen.get(11)}`);
});

test('a block number picks one of the eight interiors, and all of them are in the archive', async () => {
  const names = allBlockMifNames();
  assert.equal(names.length, 368);
  const perCode = new Map();
  for (const name of names) {
    const index = interiorIndexForBlock(name);
    assert.ok(index >= 1 && index <= INTERIOR_VARIANTS, `${name} -> ${index}`);
    assert.equal(interiorMifName('EQUIP', index), `EQUIP${index}.MIF`);
    const block = parseBlockName(name);
    assert.ok(block, `${name} must parse as a block name`);
    if (!perCode.has(block.code)) perCode.set(block.code, new Set());
    perCode.get(block.code).add(index);
  }
  // The draw has to be a *draw*: a code whose every block maps to the same room would make
  // every shop of that kind in Tamriel identical.
  for (const [code, indices] of perCode) {
    assert.ok(indices.size >= 2, `${code} always maps to interior ${[...indices][0]}`);
  }

  // Eight of each family, each with its own `.INF`, each arriving on a level a player can
  // stand in — and the arrival is the `.MIF`'s own start point, which is the foot of the
  // entry corridor.
  for (const family of ['EQUIP', 'MAGE', 'NOBLE', 'TAVERN', 'TEMPLE', 'BS', 'TOWER']) {
    for (let i = 1; i <= INTERIOR_VARIANTS; i++) {
      const file = interiorMifName(family, i);
      assert.ok(await data.has(file), `${file} must be in GLOBAL.BSA`);
      const mif = await data.mif(file);
      const arrival = mif.levels[mif.startingLevelIndex];
      assert.ok(arrival, `${file} has no level ${mif.startingLevelIndex}`);
      assert.ok(arrival.info, `${file} level ${mif.startingLevelIndex} names no INF`);
      const inf = await data.inf(arrival.info.toUpperCase());
      const level = decodeLevel(arrival, inf, {
        width: mif.width, depth: mif.height, mapType: 'interior', startPoints: mif.startPoints,
      });
      assert.ok(level.stats.wall > 80, `${file} level ${mif.startingLevelIndex} is not a building`);
      assert.ok(level.spawn, `${file} has nowhere to arrive`);
      assert.equal(level.spawn.x, Math.floor(mif.startPoints[0].y / 128) + 0.5, `${file} must arrive at its own start point`);
    }
  }
  // The one entry that is not level 0, kept as a fact: a house's ground floor is its last
  // level, so `NOBLE1.MIF` (three levels) enters on the third.
  assert.equal((await data.mif('NOBLE1.MIF')).startingLevelIndex, 2);
});

test('a whole city\'s doors, their signs and the rooms behind them', async () => {
  const inf = await data.inf('TCN.INF');
  const mif = await data.mif('CITY1.MIF');
  const city = await buildCityLevel({ data, mif, blocksPerSide: 6, seed: 20232 });
  const level = decodeLevel(city.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  const doors = cityDoors({ level, city, inf, blocksPerSide: 6 });

  // 56 of the city's 58 edge cells are doors; the other two are the city gate itself.
  assert.equal(level.stats.edge - doors.length, 2, 'only the gate may be an edge that is not a door');
  assert.deepEqual([...new Set(doors.map((d) => d.kind))].sort(), ['equipment', 'house', 'mages', 'tavern', 'temple']);
  assert.equal(doors.filter((d) => d.kind === 'equipment').length, 23);
  assert.equal(doors.filter((d) => d.kind === 'tavern').length, 19);

  for (const door of doors) {
    const cell = level.cells[door.row * level.width + door.col];
    assert.equal(cell.kind, 'edge');
    assert.equal(cell.solid, false, 'a doorway is walkable');
    assert.equal(door.file, interiorMifName(SHOP_KINDS[door.kind].family, interiorIndexForBlock(door.block)));
    assert.ok(await data.has(door.file), `${door.file} must exist`);
    assert.ok(door.slot >= 0, `door (${door.row},${door.col}) stands outside the block grid`);
    assert.match(door.block, /\.MIF$/);
    assert.ok(door.name.startsWith('a ') || door.name.startsWith('an '));
  }

  // The gate is drawn (`PGATE.IMG`) and is not a shopkeeper's door.
  assert.equal(doors.some((d) => /GATE/i.test(d.sign)), false);

  // A door reached by a *house* sign opens the house interiors, whatever the block says: a
  // laundry sign stands in equipment blocks as well as house blocks (measured), and the sign
  // is what a player reads.
  const laundry = doors.filter((d) => /LAUND/i.test(d.sign));
  assert.ok(laundry.length > 0, 'a city block draws a laundry sign');
  for (const door of laundry) assert.match(door.file, /^BS\d\.MIF$/);
});

test('a sign is drawn on its own face of the cell it hangs on', async () => {
  const inf = await data.inf('TCN.INF');
  const mif = await data.mif('CITY1.MIF');
  const city = await buildCityLevel({ data, mif, blocksPerSide: 6, seed: 20232 });
  const level = decodeLevel(city.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  const doors = cityDoors({ level, city, inf, blocksPerSide: 6 });
  const facings = new Set(doors.map((d) => level.cells[d.row * level.width + d.col].facing));
  // The face is bits 6-7 of the voxel, so a decoded face is 0…3 and indexes `EDGE_FACES`
  // directly. It was read as `(id & 0xC0) >> 4`, which yields 4, 8 and 12 — and the mesher's
  // `EDGE_FACES[cell.facing] ?? EDGE_FACES[0]` then hung three signs in four on the north
  // wall of a doorway they do not belong to.
  for (const facing of facings) assert.ok(facing >= 0 && facing <= 3, `decoded face ${facing}`);
  assert.equal(facings.size, 4, `a city's doorways face all four ways: ${[...facings].sort()}`);
});

test('a dungeon\'s fences, gates and bookstands are not doors', async () => {
  for (const name of ['39300577.MIF', 'START.MIF']) {
    const mif = await data.mif(name);
    const level0 = mif.levels[0];
    const inf = await data.inf(level0.info.toUpperCase());
    const level = decodeLevel(level0, inf, { width: mif.width, depth: mif.height, mapType: 'interior' });
    assert.equal(cityDoors({ level, city: null, inf, blocksPerSide: 6 }).length, 0, `${name} must have no shops`);
  }
  assert.equal(shopSignKinds(await data.inf('START.INF')).size, 0, 'a dungeon INF binds no shop signs');
});

test('a shopkeeper\'s lines are whole sentences with nothing left to fill in', async () => {
  const library = await loadArenaText(data);
  // Measured: the four banks hold 539 lines between them, and the part of each that needs
  // no item and no price — which is everything this project can honestly say — is these.
  const expected = { 'muguild.dat': 18, 'tavern.dat': 20, 'equip.dat': 35, 'selling.dat': 40 };
  for (const [bank, count] of Object.entries(expected)) {
    assert.equal(library.service[bank].length > 0, true, `${bank} must be in the install`);
    const greetings = serviceGreetings(library.service, bank);
    assert.equal(greetings.length, count, `${bank}`);
    for (const line of greetings) {
      assert.equal(line.text.includes('%'), false, `${bank}: "${line.text}" wants a word filled in`);
      assert.ok(line.text.length >= 12, `${bank}: "${line.text}" is a fragment`);
      assert.match(line.text, /^["'(A-Z0-9]/);
      assert.match(line.text, /[.!?”"]$/);
      assert.equal(line.bank, bank);
    }
    // Stable for a person, and a different line on the next turn of the conversation.
    const first = serviceGreeting(greetings, 4242, 0);
    assert.equal(serviceGreeting(greetings, 4242, 0).text, first.text);
    assert.notEqual(serviceGreeting(greetings, 4242, 1).text, first.text);
  }

  // The three kinds with no bank of their own say so rather than borrowing one.
  assert.deepEqual(serviceGreetings(library.service, SHOP_KINDS.temple.bank ?? 'temple.dat'), []);
  assert.equal(SHOP_KINDS.equipment.bank, 'equip.dat');
  assert.equal(SHOP_KINDS.mages.bank, 'muguild.dat');
  assert.equal(SHOP_KINDS.temple.bank, null);
  assert.equal(SHOP_KINDS.house.bank, null);
  assert.equal(SHOP_KINDS.noble.bank, null);
});

test('an interior file names the shop it is, and nothing else does', () => {
  assert.equal(shopForInteriorFile('EQUIP3.MIF').kind, 'equipment');
  assert.equal(shopForInteriorFile('TAVERN1.MIF').name, 'a tavern');
  assert.equal(shopForInteriorFile('BS7.MIF').family, 'BS');
  assert.equal(shopForInteriorFile('NOBLE2.MIF').kind, 'noble');
  assert.equal(shopForInteriorFile('MAGE5.MIF').variant, 5);
  assert.equal(shopForInteriorFile('TOWER1.MIF'), null, 'a tower is not a shop');
  assert.equal(shopForInteriorFile('START.MIF'), null);
  assert.equal(interiorMifName('EQUIP', 99), 'EQUIP8.MIF', 'the archive holds eight, so the name clamps');
  assert.equal(interiorMifName('EQUIP', 0), 'EQUIP1.MIF');
});

// ---------------------------------------------------------------- commerce ----
// The shelf is a *volume*: a place's own stock, seeded so the same keeper greets you
// with the same goods; and the keeper haggles — three tries a visit, a win kinder and
// a loss dearer. `services.js` holds both rules; these pin them.

test("stockFor is the place's own shelf: seeded, varied between shops, counted", async () => {
  const { stockFor } = await import('../../src/game/services.js');
  const a = stockFor('equipment', { level: 3, seed: 12345 });
  const b = stockFor('equipment', { level: 3, seed: 67890 });
  const again = stockFor('equipment', { level: 3, seed: 12345 });
  assert.ok(a.items.length > 0, 'a shelf is not empty');
  assert.ok(a.items.length <= 10, 'a shelf reads as a shop, not a warehouse');
  assert.deepEqual(again.items.map((row) => row.item.id), a.items.map((row) => row.item.id),
    'the same seed is the same keeper and the same goods');
  assert.ok(JSON.stringify(a.items) !== JSON.stringify(b.items), 'a different seed is a different shop');
  for (const row of a.items) {
    assert.ok(Number.isFinite(row.price) && row.price >= 1);
    assert.ok(Number.isInteger(row.qty) && row.qty >= 1 && row.qty <= 3, 'a row carries a count');
  }
  // The Great Find, when the roll made one, is a thing just *past* the level's budget.
  assert.ok(a.greatFind === null || a.greatFind.price > 40 + 3 * 90, 'a find is past the budget');
});

test('haggleRoll: three tries a visit, a win kinder, a loss dearer, then no more', async () => {
  const { haggleRoll } = await import('../../src/game/services.js');
  const deadlock = { next: () => 65535 }; // never wins the roll
  const r1 = haggleRoll({ attempts: 0, random: deadlock });
  assert.equal(r1.ok, false);
  assert.ok(r1.factor > 1, 'a loss makes the price dearer');
  const r2 = haggleRoll({ attempts: 1, random: deadlock });
  assert.ok(r2.factor > r1.factor, 'a second loss is dearer still');
  const r3 = haggleRoll({ attempts: 2, random: deadlock });
  assert.ok(r3.factor > r2.factor);
  const r4 = haggleRoll({ attempts: 3, random: deadlock });
  assert.equal(r4.factor, 1, 'the keeper will hear no more of it');
  assert.equal(r4.note.includes('no more'), true);

  const yes = { next: () => 0 }; // always wins the roll
  const w1 = haggleRoll({ attempts: 0, random: yes });
  assert.equal(w1.ok, true);
  assert.ok(w1.factor < 1, 'a win makes the price kinder');
  const noTries = haggleRoll({ attempts: 99, random: yes });
  assert.equal(noTries.ok, false, 'past three tries nothing is heard');

  // Regard leans the odds, and the note names a whole-number percent.
  const win = haggleRoll({ attempts: 0, random: { next: () => 100 } });
  assert.ok(/% less/.test(win.note));
});
