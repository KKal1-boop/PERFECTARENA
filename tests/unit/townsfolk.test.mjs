// TOWNSFOLK: THE ROSTER, THE PLACEMENT, AND WHO A PERSON IS.
//
// Two things about a town are easy to get wrong in ways a player only notices much later: a
// person standing inside a wall, and a figure whose own sex, race or outfit the code guesses at.
// Both are checkable against the real files, so both are checked here.
//
//   * the roster is the archive's own people files — 65 walk files, ten sets, seven armour
//     writings, and the fact that no `11`–`15` set has a plate figure at all;
//   * a person's *description* is read off the file name and nothing else;
//   * placement is deterministic and never in a wall, a chasm or a decoration.
//
// **What they say is `tests/unit/dialogue.test.mjs` now** — the speech half moved to
// `game/dialogue.js` on 2026-10-19, together with its tests.
//
// Run:  node --test tests/unit/townsfolk.test.mjs     (needs ARENA_PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import {
  ARMOUR_WORDS, describePerson, folkCountFor, folkFromListing,
  balanceHousehold, outfitsFromFolk, placeTownsfolk, sexOfArt, viewFacing, viewFileFor,
} from '../../src/game/townsfolk.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = () => new ArenaData(nodeSource(ARENA), { onWarn: () => {} });

const archive = await data().bsa();
const names = archive.names();
const folk = folkFromListing(names);

test('the roster is the archive\'s own people files, not a table of our own', () => {
  assert.equal(folk.length, 65, 'sixty-five walk files in this install');
  assert.equal(new Set(folk.map((f) => f.file)).size, 65, 'each one named once');
  for (const person of folk) {
    assert.match(person.file, /^\d\d(UNA|LTR|CHN|PLT|BAR|MAG|MNK)WLK\.CFA$/);
    assert.ok(names.includes(person.file), `${person.file} is in GLOBAL.BSA`);
  }
  // The shape of the data, stated as a test so a different install shows up as this
  // failing rather than as a quietly thinner town.
  const sets = [...new Set(folk.map((f) => f.set))].sort();
  assert.deepEqual(sets, ['01', '02', '03', '04', '05', '11', '12', '13', '14', '15']);
  const plateSets = folk.filter((f) => f.armour === 'PLT').map((f) => f.set).sort();
  assert.deepEqual(plateSets, ['01', '02', '03', '04', '05'], 'no 11–15 set has a plate figure');
  assert.equal(Object.keys(ARMOUR_WORDS).length, 7);
  for (const armour of Object.keys(ARMOUR_WORDS)) {
    assert.ok(folk.some((f) => f.armour === armour), `the archive has a ${armour} figure`);
  }
});

test('a person is described by what their own file name says they wear', () => {
  assert.equal(describePerson('01CHNWLK.CFA'), 'a person in chain mail');
  assert.equal(describePerson('01PLTWLK.CFA'), 'a person in plate armour');
  assert.equal(describePerson('11MAGWLK.CFA'), 'a person in robes');
  assert.equal(describePerson('05MNKWLK.CFA'), 'a person in a habit');
  assert.equal(describePerson('not-a-person.txt'), 'a stranger', 'and never crashes on junk');
  for (const person of folk) {
    const description = describePerson(person.file);
    assert.match(description, /^a person in /);
    assert.ok(description.includes(ARMOUR_WORDS[person.armour]), `${person.file} → ${description}`);
  }
});

/**
 * A real city, assembled and decoded exactly as the scene decodes it.
 *
 * `buildCityLevel` hands back the raw voxel level it stamped; the *decoded* level —
 * the one with `cells`, kinds and floor textures — is `decodeLevel`'s job, and it is
 * what a person has to be placed against. Skipping that step is how this test first
 * failed: the raw level has no `cells` at all, so nobody was placed and the assertion
 * that a city has people in it read as a broken placement rule rather than a broken
 * test.
 */
const cityLevel = async () => {
  const { buildCityLevel } = await import('../../src/game/cityPlan.js');
  const { decodeLevel } = await import('../../src/game/mifLevel.js');
  const mif = await data().mif('CITY1.MIF');
  const city = await buildCityLevel({ data: data(), mif, blocksPerSide: 6, seed: 20232 });
  const inf = await data().inf('TCN.INF');
  const level = decodeLevel(city.level, inf, { width: mif.width, depth: mif.height, mapType: 'city' });
  return { ...city, level, spawn: city.level.spawn ?? level.spawn };
};

test('people stand on real streets, never in a wall or a decoration', async () => {
  const built = await cityLevel();
  const level = built.level;
  const arrival = built.spawn ? { row: built.spawn.x - 0.5, col: built.spawn.z - 0.5 } : null;
  const people = placeTownsfolk({
    level, folk, seed: 4242, count: folkCountFor('city'), arrival, minCells: 4,
  });
  assert.ok(people.length > 0, 'a city has people in it');
  assert.equal(people.length, Math.min(folkCountFor('city'), people.length));
  const cells = new Set();
  for (const person of people) {
    const { row, col } = person.place;
    const cell = level.cells[row * level.width + col];
    assert.ok(cell, 'inside the grid');
    assert.equal(cell.solid, false, `${person.file} at ${row},${col} is not in a wall`);
    assert.equal(Boolean(cell.floor?.chasm), false, 'not over a chasm');
    assert.equal(cell.kind === 'entity', false, 'not standing on a decoration');
    assert.ok(cell.floor?.texture >= 0, 'on a floored cell');
    assert.ok(names.includes(person.file), `${person.file} is the install's`);
    assert.ok(!cells.has(`${row},${col}`), 'two people never share a cell');
    cells.add(`${row},${col}`);
    if (arrival) {
      const distance = Math.hypot(row - arrival.row, col - arrival.col);
      assert.ok(distance >= 4, `arriving on top of somebody is not a greeting (${distance})`);
    }
  }
  // Deterministic: the same seed is the same town, person for person.
  const again = placeTownsfolk({ level, folk, seed: 4242, count: folkCountFor('city'), arrival, minCells: 4 });
  assert.deepEqual(again, people);
  const different = placeTownsfolk({ level, folk, seed: 99, count: folkCountFor('city'), arrival, minCells: 4 });
  assert.notDeepEqual(different, people, 'and a different town is different');
});

test('a settlement\'s size decides how many people are about', () => {
  assert.ok(folkCountFor('city') > folkCountFor('town'));
  assert.ok(folkCountFor('town') > folkCountFor('village'));
  // Raised from 14/9/5 in the "npcs are few in cities" pass; still ordered, still capped
  // by the street cells a settlement has.
  assert.deepEqual([folkCountFor('city'), folkCountFor('town'), folkCountFor('village')], [48, 28, 14]);
  assert.ok(folkCountFor('unknown') > 0, 'and an unrecognised kind still gets somebody');
});

test('an empty install is a town with nobody in it, not a crash', () => {
  assert.deepEqual(folkFromListing([]), []);
  assert.deepEqual(folkFromListing(undefined), []);
  assert.deepEqual(placeTownsfolk({ level: null, folk }), []);
  assert.deepEqual(placeTownsfolk({ level: { cells: [] }, folk }), []);
  assert.equal(describePerson(undefined), 'a stranger');
});

test('a person is one outfit at five angles, so they can turn to face you', () => {
  const outfits = outfitsFromFolk(folk);
  // Seven armour writings under each of the archive's two figure families, minus the
  // plate figure the second family does not ship (`11…PLT`): 7 + 6 = 13.
  assert.equal(outfits.length, 13, outfits.map((o) => o.key).join(' '));
  for (const outfit of outfits) {
    // Every angle exists and is a different file — `01CHNWLK`…`05CHNWLK` are one person.
    const files = [1, 2, 3, 4, 5].map((v) => viewFileFor(outfit, v));
    assert.equal(new Set(files).size, 5, `${outfit.key}: ${files.join(' ')}`);
    for (const file of files) assert.ok(names.includes(file), `${file} is in GLOBAL.BSA`);
    assert.match(viewFileFor(outfit, 1), new RegExp(`^${outfit.group}1${outfit.armour}WLK\.CFA$`));
  }
  // Out of range is clamped rather than a missing file.
  assert.equal(viewFileFor(outfits[0], 0), viewFileFor(outfits[0], 1));
  assert.equal(viewFileFor(outfits[0], 99), viewFileFor(outfits[0], 5));
});

test('which angle shows a person depends on where they look and where you stand', () => {
  // Someone at the origin looking down +Z. A camera straight in front of them (larger Z)
  // sees their face (view 1); a camera behind them (smaller Z) sees their back (view 5).
  assert.equal(viewFacing(0, 0, 0, 0, 5), 1, 'facing the camera');
  assert.equal(viewFacing(0, 0, 0, 0, -5), 5, 'facing away');
  // To the side is the profile, in the middle.
  assert.equal(viewFacing(0, 0, 0, 5, 0), 3, 'in profile');
  // The other side is the same angle folded: the archive mirrors for it.
  assert.equal(viewFacing(0, 0, 0, -5, 0), 3, 'the other profile');
  // A quarter turn each way is the quarter view.
  assert.equal(viewFacing(0, 0, 0, 5, 5), 2, 'a quarter away');
  assert.equal(viewFacing(0, 0, 0, -5, -5), 4, 'three quarters away');
  // Where the person is looking counts exactly as much as where the camera is: turning the
  // person a half-turn is the same as standing on the other side of them.
  assert.equal(viewFacing(Math.PI, 0, 0, 0, 5), 5);
  assert.equal(viewFacing(Math.PI, 0, 0, 0, -5), 1);
  // And the answer is always one of the five the archive ships.
  for (let i = 0; i < 32; i++) {
    const yaw = (i / 32) * Math.PI * 2;
    const view = viewFacing(yaw, 0, 0, 3, 3);
    assert.ok(view >= 1 && view <= 5, `${yaw} → ${view}`);
  }
});

test('every townsperson the game places knows their outfit and where they are looking', () => {
  const level = { cells: new Array(40 * 40).fill(null).map(() => ({ floor: { texture: 1 }, solid: false })), width: 40, depth: 40, floorY: 1, cellSize: 1 };
  const people = placeTownsfolk({ level, folk, seed: 7, count: 8, arrival: { row: 20, col: 20 }, minCells: 2 });
  assert.equal(people.length, 8);
  for (const person of people) {
    assert.ok(person.outfit && person.outfit.key, 'carries their outfit');
    // The angle they are drawn at is the front one to begin with; the scene turns them
    // from there each frame (`viewFacing`).
    assert.equal(person.file, viewFileFor(person.outfit, 1));
    assert.ok(Number.isFinite(person.facing), 'and a yaw of their own');
    assert.ok(person.facing >= 0 && person.facing < Math.PI * 2);
  }
  // Still deterministic: the same seed is the same people, looking the same way.
  const again = placeTownsfolk({ level, folk, seed: 7, count: 8, arrival: { row: 20, col: 20 }, minCells: 2 });
  assert.deepEqual(again.map((p) => [p.file, Math.round(p.facing * 1e6)]), people.map((p) => [p.file, Math.round(p.facing * 1e6)]));
});

// ── and the province's own art is what a street is made of (D-45) ───────────────────────────
//
// `placeTownsfolk` takes an optional **pool** of roster keys — `game/provinceStyle.js`'s
// `peopleArtFor` — so a province's street is mostly that province's own people (the owner's
// *"all provinces should have a mix of people but mostly their race of people"*), including the
// one race-specific stand-in this archive carries (the Lizard Man's sheets in Black Marsh). The
// law is held on a synthetic street, so these four checks need no level and no browser.

/** A plain 14×14 room of standable floor: what `placeTownsfolk` needs and nothing more. */
function syntheticStreet(size = 14) {
  const cells = [];
  for (let i = 0; i < size * size; i++) cells.push({ solid: false, floor: { texture: 1 } });
  return { cells, depth: size, width: size, cellSize: 2.5, floorY: 1 };
}

test('a province pool draws only the art it names, and every figure is one outfit', () => {
  const level = syntheticStreet();
  const people = placeTownsfolk({ level, folk, kinds: [], seed: 7, count: 30, art: ['0UNA'], minCells: 0 });
  assert.equal(people.length, 30);
  assert.deepEqual([...new Set(people.map((person) => person.outfit.key))], ['0UNA'],
    'a pool of one key produces that one key and nothing else');
  assert.ok(people.every((person) => person.description === `a person in ${ARMOUR_WORDS.UNA}`),
    'and the description is the armour the archive\u2019s own name gives');
});

test('a weighted pool repeats a key to draw it more often, and still mixes', () => {
  const people = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 11, count: 120,
    art: ['0UNA', '0UNA', '0UNA', '0CHN'], minCells: 0,
  });
  const counts = {};
  for (const person of people) counts[person.outfit.key] = (counts[person.outfit.key] ?? 0) + 1;
  assert.ok(counts['0CHN'] > 0, 'the pool is a mix, not one figure repeated');
  assert.ok(counts['0UNA'] > counts['0CHN'] * 1.5,
    `the repeated key dominates: ${counts['0UNA']} plain clothes against ${counts['0CHN']} chain`);
  assert.deepEqual(Object.keys(counts).sort(), ['0CHN', '0UNA'], 'and nothing outside the pool is drawn');
});

test('a key this install does not ship is dropped, and the roster is the fallback', () => {
  // A province asks for art this checkout does not have: the draw falls back to the whole roster
  // rather than to nobody, so a typo in a table can never empty a city's streets.
  const people = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 3, count: 24,
    art: ['ARGONIAN', 'NOPE'], minCells: 0,
  });
  assert.equal(people.length, 24);
  const outfits = new Set(outfitsFromFolk(folk).map((outfit) => outfit.key));
  const drawn = new Set(people.map((person) => person.outfit.key));
  assert.ok([...drawn].every((key) => outfits.has(key)), 'every figure is one the roster knows');
  assert.ok(drawn.size > 1, `the whole roster is back, not the empty pool: ${[...drawn].sort().join(', ')}`);
  // No pool at all is the same answer: the whole roster, which is what a place with no province gets.
  const bare = placeTownsfolk({ level: syntheticStreet(), folk, kinds: [], seed: 3, count: 24, minCells: 0 });
  assert.equal(bare.length, 24);
  assert.ok(bare.every((person) => outfits.has(person.outfit.key)));
  assert.equal(new Set(bare.map((person) => person.outfit.key)).size, drawn.size,
    'a missing pool and an empty roster-draw are the same street');
});

// ── a household's seats ──────────────────────────────────────────────────────────────────────
//
// The owner, 2026-10-18: *"npcs variety in houses … at the moment is only women"*. A room's whole
// cast is drawn from the province's pool, and a draw of two or three can come out one-sided. The
// answer is `placeTownsfolk`'s `sex` door, used by the scene to redraw one seat: it must draw only
// figures whose own art names that sex (a cat-folk's art names none, so it cannot stand in), and a
// pool with nobody of that sex must fall back to the whole draw rather than empty the room.

test('a sexed draw takes only the roster\u2019s own men or women, and never guesses at a figure', () => {
  assert.equal(sexOfArt('0CHN'), 'male');
  assert.equal(sexOfArt('1CHN'), 'female');
  assert.equal(sexOfArt('FMGENW'), 'female');
  assert.equal(sexOfArt('FMGEN'), 'female');
  assert.equal(sexOfArt('BABE0'), 'female');
  assert.equal(sexOfArt('MLGEN'), 'male');
  assert.equal(sexOfArt('MLGENT'), 'male');
  assert.equal(sexOfArt('GUARD0'), 'male');
  assert.equal(sexOfArt('KHAJIIT'), null, 'the cat-folk\u2019s art says nothing about sex');
  assert.equal(sexOfArt('ARGONIAN'), null);
  assert.equal(sexOfArt(''), null);
  const women = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 21, count: 24, sex: 'female', minCells: 0,
  });
  assert.equal(women.length, 24);
  assert.ok(women.every((person) => sexOfArt(person.outfit.key) === 'female'),
    `every seat is a woman: ${[...new Set(women.map((p) => p.outfit.key))].join(', ')}`);
  const men = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 21, count: 24, sex: 'male', minCells: 0,
  });
  assert.ok(men.every((person) => sexOfArt(person.outfit.key) === 'male'),
    `every seat is a man: ${[...new Set(men.map((p) => p.outfit.key))].join(', ')}`);
  // A pool with nobody of the asked-for sex is the whole draw — never an empty room.
  const none = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 21, count: 6, art: ['0UNA'], sex: 'female', minCells: 0,
  });
  assert.equal(none.length, 6);
  assert.deepEqual([...new Set(none.map((p) => p.outfit.key))], ['0UNA']);
});

test('a household whose whole draw is one sex is given a seat of the other, on its own cell', () => {
  // The owner, 2026-10-18: *"npcs variety in houses … at the moment is only women"*. A house's
  // two or three seats are drawn from one pool, and the draw can come out one-sided.
  const women = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 31, count: 3, art: ['1UNA', '1LTR'], minCells: 0,
  });
  assert.equal(women.length, 3);
  assert.ok(women.every((p) => sexOfArt(p.outfit.key) === 'female'), 'the draw is all women');
  const cells = women.map((p) => `${p.place.row},${p.place.col}`);
  const homes = balanceHousehold(women, { level: syntheticStreet(), folk, kinds: [], seed: 32 });
  assert.equal(homes.length, 3, 'nobody is added or lost');
  assert.deepEqual(homes.map((p) => `${p.place.row},${p.place.col}`), cells, 'and nobody moves');
  assert.ok(homes.some((p) => sexOfArt(p.outfit.key) === 'male'), `a man is at home: ${homes.map((p) => p.outfit.key).join(', ')}`);
  assert.equal(homes.at(-1).sexSwap, 'male', 'the swapped seat says so');
  // The mirror image: a house of only men gets a woman.
  const men = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 33, count: 3, art: ['0CHN', '0UNA'], minCells: 0,
  });
  assert.ok(men.every((p) => sexOfArt(p.outfit.key) === 'male'));
  balanceHousehold(men, { level: syntheticStreet(), folk, kinds: [], seed: 34 });
  assert.ok(men.some((p) => sexOfArt(p.outfit.key) === 'female'), `a woman is at home: ${men.map((p) => p.outfit.key).join(', ')}`);
  // A mixed household is left exactly as it was, and a room of one has nothing to balance.
  const mixed = placeTownsfolk({
    level: syntheticStreet(), folk, kinds: [], seed: 35, count: 4, art: ['0UNA', '1UNA'], minCells: 0,
  });
  const before = mixed.map((p) => p.file);
  assert.deepEqual(balanceHousehold(mixed, { level: syntheticStreet(), folk, kinds: [], seed: 36 }).map((p) => p.file), before);
  const one = [women[0]];
  assert.deepEqual(balanceHousehold(one, { level: syntheticStreet(), folk, kinds: [], seed: 37 }), one);
});

test('an empty pool is not a pool: the whole roster stands', () => {
  const people = placeTownsfolk({ level: syntheticStreet(), folk, kinds: [], seed: 5, count: 40, art: [], minCells: 0 });
  assert.equal(people.length, 40);
  const outfits = new Set(outfitsFromFolk(folk).map((outfit) => outfit.key));
  const drawn = new Set(people.map((person) => person.outfit.key));
  assert.ok(drawn.size > 1, 'an empty pool means the roster, not one figure');
  assert.ok([...drawn].every((key) => outfits.has(key)));
});
