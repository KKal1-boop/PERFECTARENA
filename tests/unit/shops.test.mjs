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
  INTERIOR_VARIANTS, MENU_SLOT_INTERIORS, MENU_SLOT_WILDERNESS, SHOP_KINDS, cityDoors, doorStand,
  interiorIndexForBlock, interiorKindOfTexture, interiorMifName, parseBlockName,
  serviceGreeting, serviceGreetings, shopForInteriorFile, shopSignKinds, wildDoors,
} from '../../src/game/shops.js';
import { blockIdsFromListing, rmdName } from '../../src/arena/rmdFile.js';
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

test('the hanging signs are the .INF\'s own table, and a sign is not a door', async () => {
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

test('the door art the real blocks draw is eight, and every one names a room', async () => {
  const inf = await data.inf('TCN.INF');
  const wall = new Map();
  const edge = new Map();
  for (const name of allBlockMifNames()) {
    const block = await data.mif(name);
    for (const id of block.levels[0].map1) {
      const nibble = (id & 0xf000) >> 12;
      const most = (id & 0xff00) >> 8;
      const least = id & 0xff;
      if (nibble === 0xa) {
        const index = (least & 0x3f) - 1;
        edge.set(index, (edge.get(index) ?? 0) + 1);
      } else if (most === least && most !== 0) {
        // `tryMakeVoxelTransitionDefGenInfo`: a wall is `mostSigByte === leastSigByte`, and
        // its texture is `most − 1`. This is the case a player sees: a door painted on a wall.
        const index = most - 1;
        if (interiorKindOfTexture(inf, index)) wall.set(index, (wall.get(index) ?? 0) + 1);
      }
    }
  }
  // Measured over all 368 block .MIFs. **The wall art is the door**: equipment, tavern,
  // Mages Guild, temple, the three house doors and the noble door — 3 925 cells.
  assert.deepEqual([...wall.keys()].sort((a, b) => a - b), [5, 10, 16, 23, 30, 35, 40, 53]);
  const named = { 5: 'equipment', 10: 'tavern', 16: 'mages', 23: 'temple',
    30: 'house', 35: 'house', 40: 'house', 53: 'noble' };
  for (const [index, kind] of Object.entries(named)) {
    assert.equal(interiorKindOfTexture(inf, Number(index)), kind, `${inf.voxelTextures[index].filename}`);
    assert.ok(SHOP_KINDS[kind], `${kind} is not a SHOP_KINDS entry`);
    assert.ok(wall.get(Number(index)) > 0, `${kind} door art is drawn`);
  }
  // …and the hanging signs are exactly five, none of them bound by a `*MENU` slot. This is
  // the owner's report, kept as a check: the sprite is decoration, not the way in.
  assert.deepEqual([...edge.keys()].sort((a, b) => a - b), [6, 11, 17, 24, 47]);
  for (const index of edge.keys()) {
    assert.equal(interiorKindOfTexture(inf, index), null,
      `${inf.voxelTextures[index]?.filename} is a sign, not a door`);
    assert.ok(shopSignKinds(inf).get(index), `sign ${index} still names the shop it advertises`);
  }
  // A block carries many doors, so the door's own art — not the block's code — is what says
  // where it goes: a house block draws equipment and temple doors too (measured).
  assert.ok(wall.get(40) > 1000, `house doors: ${wall.get(40)}`);
  assert.ok(wall.get(5) > 100, `equipment doors: ${wall.get(5)}`);
  // The reference's palace slots exist as a rule even though this install's blocks do not
  // draw them; a palace therefore still stands behind a house door (see `cityDoors`).
  assert.equal(MENU_SLOT_INTERIORS[11], 'palace');
  assert.equal(MENU_SLOT_INTERIORS[12], 'palace');
  assert.equal(MENU_SLOT_INTERIORS[13], 'palace');
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

test('a whole city\'s doors are the doors on its walls, with the room behind each one', async () => {
  const inf = await data.inf('TCN.INF');
  const mif = await data.mif('CITY1.MIF');
  const city = await buildCityLevel({ data, mif, blocksPerSide: 6, seed: 20232 });
  const level = decodeLevel(city.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  const doors = cityDoors({ level, city, inf, blocksPerSide: 6 });

  // **The city's doors are its walls' doors.** 421 of them in this city, against 58 `0xA`
  // edges of which only the two gate cells matter; the old reading found 56 doors by
  // treating signs as doorways and missed all 421 real ones.
  assert.ok(doors.length > 300, `${doors.length} doors`);
  assert.deepEqual([...new Set(doors.map((d) => d.kind))].sort(),
    ['equipment', 'house', 'mages', 'noble', 'tavern', 'temple']);
  const byKind = Object.fromEntries(doors.map((d) => [d.kind, doors.filter((x) => x.kind === d.kind).length]));
  assert.deepEqual(byKind, { equipment: 23, house: 345, mages: 1, noble: 28, tavern: 19, temple: 5 });
  // One door per shop, matching the signs that advertise them: 23 equipment signs for 23
  // equipment doors, 19 tavern signs for 19 tavern doors. **Houses have no sign per door** —
  // 345 doors against the city's 60 laundry signs — which is why the sign could never be the
  // law and the wall art is.
  assert.equal(level.stats.edge, 58, 'the city skeleton draws 58 edges');
  assert.equal(doors.filter((d) => !d.wall).length, 0, 'every door is a wall door, not a sign');
  assert.equal(doors.filter((d) => !d.stand).length, 3, 'three doors face masonry and cannot be reached');

  for (const door of doors) {
    const cell = level.cells[door.row * level.width + door.col];
    assert.equal(cell.kind, 'wall', `door (${door.row},${door.col}) is painted on a wall`);
    assert.equal(cell.solid, true, 'the door art is on the building, so the cell is solid');
    assert.equal(interiorKindOfTexture(inf, cell.sideTexture), door.kind);
    assert.equal(door.file, interiorMifName(SHOP_KINDS[door.kind].family, interiorIndexForBlock(door.block)));
    assert.ok(await data.has(door.file), `${door.file} must exist`);
    assert.ok(door.slot >= 0, `door (${door.row},${door.col}) stands outside the block grid`);
    assert.match(door.block, /\.MIF$/);
    assert.ok(door.name.startsWith('a ') || door.name.startsWith('an '));
    if (door.stand) {
      // The player stands on the paving in front, one cell away, and that cell is walkable.
      assert.equal(Math.max(Math.abs(door.stand.row - door.row), Math.abs(door.stand.col - door.col)), 1);
      const standCell = level.cells[door.stand.row * level.width + door.stand.col];
      assert.equal(standCell.solid, false, `stand (${door.stand.row},${door.stand.col})`);
      assert.equal(Boolean(standCell.floor?.chasm), false);
      assert.deepEqual(doorStand(level, door.row, door.col), door.stand);
    }
  }

  // A laundry sign is decoration beside a house door, not an entrance in its own right: the
  // sign cell is an edge, and no door record is an edge at all.
  const laundryCells = [];
  for (let row = 0; row < level.depth; row++) {
    for (let col = 0; col < level.width; col++) {
      const cell = level.cells[row * level.width + col];
      if (cell.kind === 'edge' && /LAUND/i.test(inf.voxelTextures[cell.sideTexture]?.filename ?? '')) {
        laundryCells.push({ row, col });
      }
    }
  }
  assert.ok(laundryCells.length > 0, 'a city block draws a laundry sign');
  for (const sign of laundryCells) {
    assert.equal(doors.some((d) => d.row === sign.row && d.col === sign.col), false,
      `laundry sign at ${sign.row},${sign.col} must not be a door`);
  }

  // The gate is drawn (`PGATE.IMG`) and is not a shopkeeper's door.
  assert.equal(doors.some((d) => /GATE/i.test(d.sign)), false);

  // **The palace is one marked house door**, because this install's blocks draw no palace
  // door art; a city gets one and a village gets none.
  const withCourt = cityDoors({ level, city, inf, blocksPerSide: 6, settlement: { kind: 'city', citySeed: 20232 } });
  const palaces = withCourt.filter((d) => d.palace === true);
  assert.equal(palaces.length, 1);
  assert.match(palaces[0].file, /^PALACE[1-5]\.MIF$/);
  assert.equal(palaces[0].wall, true);
  assert.ok(palaces[0].stand, 'the palace door is reachable from the street');
  const village = cityDoors({ level, city, inf, blocksPerSide: 6, settlement: { kind: 'village', citySeed: 20232 } });
  assert.equal(village.filter((d) => d.palace === true).length, 0);
});

test('a door is opened from the street in front of it, whichever way the building faces', async () => {
  const inf = await data.inf('TCN.INF');
  const mif = await data.mif('CITY1.MIF');
  const city = await buildCityLevel({ data, mif, blocksPerSide: 6, seed: 20232 });
  const level = decodeLevel(city.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  const doors = cityDoors({ level, city, inf, blocksPerSide: 6 });
  // The street side is not a `facing` bit — a wall voxel has none — it is read off the map:
  // the walkable neighbour. Four sides have to occur, or the streets are one-sided.
  const sides = new Set();
  for (const door of doors) {
    if (!door.stand) continue;
    sides.add(`${door.stand.row - door.row},${door.stand.col - door.col}`);
  }
  assert.deepEqual([...sides].sort(), ['-1,0', '0,-1', '0,1', '1,0']);
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
  // A tower is a building with a door (D-51's country half), not a trade: it resolves to the
  // kind `tower` so a door onto it knows what it is, and it keeps no counter and no bank.
  assert.equal(shopForInteriorFile('TOWER1.MIF')?.kind, 'tower', 'a tower is a building, not a trade');
  assert.equal(shopForInteriorFile('TOWER1.MIF')?.bank, null);
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

// ── the country's own doors (D-51, second half) ─────────────────────────────────
//
// The wilderness is a different `.INF` on the same law: a **wall** whose art the environment's
// `*MENU` table binds is a door, and the country is full of them. Measured over all 66 shipped
// `.RMD` blocks against `TWN.INF`: 123 farmhouse doors, 31 barn doors, 19 tavern, 17 temple,
// 13 tower and 6 crypt — plus the gate's two posts and the dungeon mouth, neither of which is
// a building. These numbers are the archive's, so a different install shows up as a difference.
test('the country binds its own doors in its own *MENU table, art for art', async () => {
  // The install ships eight of the nine climate/weather tables (`DWS.INF` is absent), and
  // every one of them binds the same slots to the same art.
  const WILD_INFS = ['TWN.INF', 'TWS.INF', 'TWR.INF', 'DWN.INF', 'DWR.INF', 'MWN.INF', 'MWS.INF', 'MWR.INF'];
  const art = {
    0: /BARN/, 1: /CRYPT/, 2: /FARM/, 3: /TAV/, 4: /TEP/, 5: /TOWER/,
    6: /LGT/, 7: /RGT/, 8: /WDUNGDR1/, 9: /WDUNGDR2/,
  };
  for (const name of WILD_INFS) {
    const inf = await data.inf(name);
    for (const [slot, pattern] of Object.entries(art)) {
      const index = inf.menus[Number(slot)];
      assert.ok(Number.isInteger(index), `${name} slot ${slot} is bound`);
      assert.match(inf.voxelTextures[index]?.filename ?? '', pattern, `${name} slot ${slot}`);
    }
    // The gate posts and the dungeon mouth are bound but are not doors; the six buildings are.
    assert.equal(MENU_SLOT_WILDERNESS[6] ?? null, null, `${name}: a gate post opens nothing`);
    assert.equal(MENU_SLOT_WILDERNESS[7] ?? null, null);
    assert.equal(MENU_SLOT_WILDERNESS[8] ?? null, null, 'the dungeon mouth is the ruin\'s');
    assert.equal(MENU_SLOT_WILDERNESS[9] ?? null, null);
    assert.deepEqual(Object.keys(MENU_SLOT_WILDERNESS).map(Number).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
    // …and the slots that do open are the reference's own numbers, on art read from the data.
    assert.equal(MENU_SLOT_WILDERNESS[1], 'crypt');
    assert.equal(MENU_SLOT_WILDERNESS[5], 'tower');
  }
});

test('every door the country paints can be walked through — the blocks\' own count', async () => {
  const inf = await data.inf('TWN.INF');
  const ids = blockIdsFromListing((await data.bsa()).names());
  assert.ok(ids.length >= 60, `the install ships the country's blocks (${ids.length})`);
  const byKind = {};
  const doors = [];
  const unreachable = [];
  for (const id of ids) {
    const rmd = await data.rmd(rmdName(id));
    const level = decodeLevel({
      name: rmdName(id), info: '', numf: 0, flor: rmd.flor, map1: rmd.map1, map2: rmd.map2,
      flat: null, inns: null, loot: null, stor: null, targ: [], lock: [], trig: [],
      startPoints: [], warnings: [],
    }, inf, { width: 64, depth: 64, mapType: 'wilderness' });
    const found = wildDoors({ level, inf, blocks: [id, id, id, id] });
    for (const door of found) {
      byKind[door.kind] = (byKind[door.kind] ?? 0) + 1;
      doors.push(door);
      if (!door.stand) unreachable.push(`${rmdName(id)} ${door.sign} ${door.row},${door.col}`);
    }
  }
  assert.deepEqual(byKind, { house: 154, tavern: 19, temple: 17, tower: 13, crypt: 6 },
    `the country's doors, block by block: ${JSON.stringify(byKind)}`);
  assert.ok(doors.length > 200, `${doors.length} doors in the country`);

  for (const door of doors) {
    const shop = SHOP_KINDS[door.kind];
    assert.ok(shop, `${door.sign} opened ${door.kind}, which is not a building`);
    assert.equal(door.wall, true, `${door.kind} at ${door.row},${door.col} is painted on a wall`);
    assert.equal(door.country, true);
    assert.match(door.file, new RegExp(`^${shop.family}[1-8]\.MIF$`), `${door.sign} → ${door.file}`);
    assert.match(door.sign, /^[TXD]ZD(?:BARN|FARM|CRYPT|TAV|TEP|TOWER)\.IMG$/);
  }
  // The door is opened from the paving in front of it. One of the country's 209 faces its own
  // masonry (`WILD065.RMD`'s farmhouse), so it is named here rather than quietly counted as
  // enterable: 208 of 209 can be walked through.
  assert.deepEqual(unreachable, ['WILD065.RMD TZDFARM.IMG 21,51'], `${unreachable.length} doors face masonry`);
  assert.equal(doors.length - unreachable.length, 208);
  // A crypt and a tower are buildings the port had no door to at all before this pass.
  assert.ok(byKind.crypt >= 1 && byKind.tower >= 1);
});

test('a country interior names its own building, and a tomb is nobody\'s house', () => {
  assert.equal(shopForInteriorFile('WCRYPT3.MIF')?.kind, 'crypt');
  assert.equal(shopForInteriorFile('TOWER7.MIF')?.kind, 'tower');
  assert.equal(SHOP_KINDS.crypt.family, 'WCRYPT');
  assert.equal(SHOP_KINDS.crypt.bank, null, 'a tomb has no shopkeeper');
  assert.equal(SHOP_KINDS.tower.bank, null);
  assert.equal(interiorMifName(SHOP_KINDS.crypt.family, 9), 'WCRYPT8.MIF', 'the eighth is the last');
});
