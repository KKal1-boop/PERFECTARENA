// THE EXECUTABLE'S OWN TABLES, READ (**block B24**).
//
// `ACD.EXE` is unpacked by `arena/pklite.js` into a 305 520-byte code image; `arena/exeTables.js`
// reads the game's tables out of that image **by their own words** — an anchor of two to five
// consecutive entries, then NUL-terminated strings until the run stops spelling like that table.
// Nothing here is located by an offset, because an offset is a fact about one build and the floppy
// release ships the same program under another name (`A.EXE`).
//
// What these checks are for, in one line: a table of English words recovered from a code image is
// worth exactly as much as the claims it can be held to. So each one is checked against something
// this project already had **before** the executable was open — the `.INF` reader's own level
// markers, the port's own class and race lists, the settlements `CITYDATA` names, the eight
// provinces — and the reader is checked against bytes it must *refuse* (an anchor that is not
// there, a run that walks into binary).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { findAscii, unpackPklite } from '../../src/arena/pklite.js';
import {
  EXE_TABLE_SPECS, stringTableAt, exeTables, splitBestiary, exeTableReport,
} from '../../src/arena/exeTables.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const acdPath = path.join(ARENA, 'ACD.EXE');
const haveExe = fs.existsSync(acdPath);
const skip = haveExe ? false : `ACD.EXE is not in ${ARENA}`;
let cachedTables = null;
const tables = () => {
  if (!cachedTables) {
    const { image } = unpackPklite(new Uint8Array(fs.readFileSync(acdPath)));
    cachedTables = { image, ...exeTables(image) };
  }
  return cachedTables;
};

// ── the reader, against bytes it must refuse or accept exactly ───────────────────────────────

test('a table is read from its anchor to the first entry that breaks its own spelling', () => {
  //              anchor          entries                     then code
  const bytes = new Uint8Array([...Buffer.from('Rat\0Goblin\0Lizard Man\0Wolf\0'),
    ...Buffer.from([0x03, 0xff, 0x90, 0x00]), ...Buffer.from('Mage\0'), 0x00, 0x01]);
  const read = stringTableAt(bytes, 'Rat\0Goblin', { match: /^[A-Za-z][A-Za-z ]{1,20}$/ });
  assert.equal(read.at, 0);
  assert.deepEqual(read.entries, ['Rat', 'Goblin', 'Lizard Man', 'Wolf']);
  // The run stops at the binary, not at the next NUL: a reader that walked on would return `Mage`.
  assert.equal(read.end, 27);
  // An anchor the image does not hold is `null` — the reader never falls back to a search for a
  // single word, which is what would make it answer a *different* table with the same words.
  assert.equal(stringTableAt(bytes, 'Orc\0Troll', { match: /./ }), null);
  // …and a table told to stop where the next one begins stops there.
  const stopped = stringTableAt(bytes, 'Rat\0Goblin', { match: /^[A-Za-z ]+$/, stopAt: ['Wolf'] });
  assert.deepEqual(stopped.entries, ['Rat', 'Goblin', 'Lizard Man']);
});

test('the report is total: every spec either reads or is named missing', { skip }, () => {
  const { image } = tables();
  const report = exeTableReport(image);
  assert.equal(Object.keys(report.tables).length, Object.keys(EXE_TABLE_SPECS).length);
  for (const [name, row] of Object.entries(report.tables)) {
    assert.ok(!row.missing, `${name} was not found — its anchor is '${EXE_TABLE_SPECS[name].anchor}'`);
    assert.ok(row.count > 0 && row.first && row.last, `${name}: ${JSON.stringify(row)}`);
    assert.ok(row.at >= 0 && row.at < image.length, `${name} sits inside the image`);
  }
  // The four cross-checks, each of which a drifted reading breaks rather than bends.
  const byId = Object.fromEntries(report.readings.map((r) => [r.id, r]));
  for (const reading of report.readings) {
    assert.ok(reading.ok, `${reading.id}: ${reading.detail}`);
    assert.ok(byId[reading.id].detail.length > 0, 'a reading always says what it read');
  }
});

// ── the tables themselves, against the install and against this project ──────────────────────

test('the bestiary: twenty-three creatures, then the class block', { skip }, () => {
  const t = tables();
  const { creatures, classes } = splitBestiary(t);
  assert.equal(creatures.length, 23, creatures.join(', '));
  assert.equal(t.creatureSheets.length, 24, 'twenty-four sheets: the twenty-third creature and the boss');
  // The creatures the port's own monster list is built from, in the executable's own order.
  assert.deepEqual(creatures.slice(0, 8),
    ['Rat', 'Goblin', 'Lizard Man', 'Wolf', 'Snow Wolf', 'Orc', 'Skeleton', 'Minotaur']);
  assert.equal(creatures[22], 'Lich');
  // The class block repeats character creation's own table exactly — two copies of one list in
  // one executable, which is what makes the *split* checkable rather than assumed.
  assert.deepEqual(classes, t.classes);
  assert.equal(classes[0], 'Mage');
  assert.equal(classes.filter((c) => c === 'Knight').length, 1);
});

test('the sheets: every creature family is a six-view template, and the people are not in there', { skip }, () => {
  const t = tables();
  for (const sheet of t.creatureSheets) {
    assert.match(sheet, /^[a-z0-9]+@\.cfa$/, sheet);
  }
  assert.ok(t.creatureSheets.includes('pat@.cfa'), 'the Minotaur\'s sheet is in the creature table');
  // The twenty-fourth sheet is the boss's own art — a creature sheet the *name* run does not
  // carry, because Jagar Tharn is not a common creature (`game/monsterArt.js` reports it
  // unclaimed rather than pairing it with whatever name comes twenty-fourth).
  assert.equal(t.creatureSheets[23], 'tharn0@.cfa');
  // **`PAT` is not in the people table**, and this is the check that keeps D-30 closed from the
  // other end: the executable names its commoners as `mlgen0@…`/`fmgen0@…`, and no creature
  // appears among them.
  assert.ok(t.folkSheets.length >= 4, t.folkSheets.join(', '));
  assert.ok(t.folkSheets.every((f) => /^(mlgen|fmgen)/.test(f)), t.folkSheets.join(', '));
  assert.ok(!t.folkSheets.includes('pat@.cfa'));
  assert.ok(t.heroSheets.some((f) => /XXX/.test(f)), 'the player\'s own templates carry XXX for armour');
});

test('the world: eight provinces, sixty-four settlements, eight capitals, sixteen dungeons', { skip }, () => {
  const t = tables();
  assert.equal(t.provinces.length, 8);
  assert.deepEqual(t.provinces.slice(0, 4), ['High Rock', 'Hammerfell', 'Skyrim', 'Morrowind']);
  assert.ok(t.provinces.includes('Black Marsh'));
  assert.equal(t.settlements.length, 64, 'the map\'s own list');
  assert.equal(t.settlements.length % t.provinces.length, 0, 'eight per province');
  // The settlements the port already names on its map are in the executable's own list: the one
  // the port boots by name, and the first city of each province the game lists.
  for (const city of ['Solitude', 'Daggerfall', 'Corinth', 'Ebonheart', 'Eldenroot', 'Alinor', 'Stormhold', 'Sentinel']) {
    assert.ok(t.settlements.includes(city), `${city} is a settlement in the executable`);
  }
  assert.equal(t.capitals.length, 8);
  assert.ok(t.capitals.includes('Rihad') && t.capitals.includes('Ebonheart'));
  assert.equal(t.dungeonNames.length, 16);
  for (const dungeon of ['Stonekeep', 'Fang Lair', 'Labyrinthian', 'Crypt of Hearts', 'Dagoth-Ur']) {
    assert.ok(t.dungeonNames.includes(dungeon), `${dungeon} is named in the executable`);
  }
  assert.deepEqual(t.blockFiles.slice(0, 3), ['noble', 'tavern', 'temple']);
  assert.ok(t.blockFiles.includes('wcrypt') && t.blockFiles.includes('townpal'), 'the palace blocks');
});

test('the calendar and the character tables are the game\'s own words', { skip }, () => {
  const t = tables();
  assert.deepEqual(t.months, ['Morning Star', "Sun's Dawn", 'First Seed', "Rain's Hand", 'Second Seed',
    'Mid Year', "Sun's Height", 'Last Seed', 'Hearthfire', 'Frostfall', "Sun's Dusk", 'Evening Star']);
  assert.deepEqual(t.weekdays, ['Morndas', 'Tirdas', 'Middas', 'Turdas', 'Fredas', 'Loredas', 'Sundas']);
  assert.equal(t.holidays.length, 15);
  assert.deepEqual(t.holidays.slice(0, 3), ['New Life Festival', "South Wind's Prayer", 'Hearts Day']);
  assert.ok(t.holidays.includes('Witches Festival') && t.holidays.includes("Emperor's Day"));
  // The eight attributes, and the races twice — as a people and as one person.
  assert.deepEqual(t.attributes, ['Strength', 'Intelligence', 'Willpower', 'Agility', 'Speed',
    'Endurance', 'Personality', 'Luck']);
  assert.deepEqual(t.racesSingular, ['Breton', 'Redguard', 'Nord', 'Dark Elf', 'High Elf', 'Wood Elf',
    'Khajiit', 'Argonian']);
  assert.equal(t.racesPlural[0], 'Bretons');
  assert.equal(t.racesPlural.length, t.racesSingular.length);
  for (let i = 0; i < t.racesSingular.length; i++) {
    assert.ok(t.racesPlural[i].startsWith(t.racesSingular[i].split(' ')[0]),
      `${t.racesPlural[i]} is ${t.racesSingular[i]}'s people`);
  }
});

test('the level markers are the ones this port\'s own reader looks for', { skip }, () => {
  const t = tables();
  // `mifLevel.js` resolves exactly these names out of a level's `.INF`; finding them in the
  // executable joins the two halves of the port's level reading.
  for (const marker of ['CEILING', 'DRYCHASM', 'WETCHASM', 'LAVACHASM', 'LEVELUP', 'LEVELDOWN',
    'MENU', 'BOXSIDE', 'BOXCAP']) {
    assert.ok(t.levelTextures.includes(marker), `${marker} is a texture name in the executable`);
  }
  assert.equal(t.settlementKinds.slice(0, 3).join(','), 'City-State,Town,Village');
  assert.ok(t.timesOfDay.includes('early morning') && t.timesOfDay.includes('midnight'));
  assert.ok(t.voiceFiles.includes('minotaur.voc'), 'the creature voices are a table too');
});

test('loot, rank and the artifacts', { skip }, () => {
  const t = tables();
  assert.equal(t.artifacts.length, 16);
  assert.deepEqual(t.artifacts.slice(0, 3), ["Lord's Mail", 'Ebony Mail', "Auriel's Shield"]);
  assert.ok(t.artifacts.includes('Oghma Infinium') && t.artifacts.includes('Skeleton\'s Key'));
  assert.equal(t.nobleRanks.length, 14);
  assert.deepEqual(t.nobleRanks.slice(0, 3), ['Lord', 'Duke', 'Baron']);
  assert.ok(t.nobleRanks.includes('Emperor') && t.nobleRanks.includes('Empress'));
  assert.equal(t.gems.length, 12);
  assert.ok(t.gems.every((g) => /^(a|an) [A-Za-z]+$/.test(g)), t.gems.join(', '));
  assert.ok(t.spellEffects.includes('Disintegrate') && t.spellEffects.includes('Spell Reflection'));
  assert.ok(t.statusWords.includes('healthy') && t.statusWords.includes('regenerating'));
});
