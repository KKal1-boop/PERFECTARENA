// WHICH ART A CREATURE IS DRAWN FROM (**block B24**, and two defects it closed).
//
// Two open defect rows were the same mistake seen from two sides:
//
//   * **D-29**, *"most enemies dont exist or dont spawn"* — `game/monsters.js` carried the Minotaur
//     with a null `sprite`, so it was dropped from every roster that filters on art;
//   * **D-30**, *"some npcs have enemy sprites like theres a minotaur guy somewhere"* — the
//     archive's `PAT1.CFA`…`PAT6.CFA` were handed to the town crowd as a person's walk sheets
//     (`game/peopleKinds.js`).
//
// The executable's own tables settle both: its creature-name run and its creature-sheet run pair
// index by index, and the one pair whose spellings disagree is the Minotaur against `pat@.cfa`.
// These checks hold that reading against the install's bytes — and, where the install is not
// beside this checkout, hold the *rules* against synthetic tables so the suite still means
// something on a machine with no game on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { unpackPklite } from '../../src/arena/pklite.js';
import { exeTables, splitBestiary } from '../../src/arena/exeTables.js';
import { parseBsa } from '../../src/arena/bsaArchive.js';
import { cfaInfo } from '../../src/arena/cfa.js';
import {
  CREATURE_LAYOUT, FOLK_LAYOUT, isCreatureLayout, isFolkLayout, layoutOf,
  artNameKey, sheetFamily, sheetSpellsName, creatureArtPairs, monsterArtAudit, monsterSlotAudit,
} from '../../src/game/monsterArt.js';
import { MONSTERS, monsterById, spriteFiles, spriteFile, monsterReport } from '../../src/game/monsters.js';
import { DUNGEON_MONSTERS, MONSTER_ITEM_MIN, MONSTER_ITEM_MAX } from '../../src/game/dungeonItems.js';
import { peopleKindsFromListing, labelForFile } from '../../src/game/peopleKinds.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const haveExe = fs.existsSync(path.join(ARENA, 'ACD.EXE'));
const haveBsa = fs.existsSync(path.join(ARENA, 'GLOBAL.BSA'));
const skip = haveExe ? false : `ACD.EXE is not in ${ARENA}`;

let cached = null;
const install = () => {
  if (!cached) {
    const { image } = unpackPklite(new Uint8Array(fs.readFileSync(path.join(ARENA, 'ACD.EXE'))));
    const archive = haveBsa
      ? parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA')
      : null;
    const all = exeTables(image);
    const { creatures } = splitBestiary(all);
    cached = { image, archive, tables: all, creatures };
  }
  return cached;
};

// ── the rules, on their own ──────────────────────────────────────────────────────────────────

test('a sheet spells a name when its letters run through the name in order', () => {
  assert.equal(artNameKey('Hell Hound'), 'hellhound');
  assert.equal(sheetFamily('pat@.cfa'), 'pat');
  assert.equal(sheetFamily('swolf0@.cfa'), 'swolf0');
  assert.equal(sheetFamily('mlgen0@w.cfa'), 'mlgen0', 'the commoners carry an action letter after the @');
  assert.equal(sheetFamily('0@XXXwlk.cfa'), '0', 'the player templates carry the view digit as the family');
  assert.equal(sheetFamily('SWORD.CIF'), null, 'not every name is a sheet template');
  // The readings that make the rule worth anything: the art's own shorthand.
  for (const [sheet, name] of [
    ['rat@.cfa', 'Rat'], ['goblin@.cfa', 'Goblin'], ['lizard@.cfa', 'Lizard Man'],
    ['wolf0@.cfa', 'Wolf'], ['swolf0@.cfa', 'Snow Wolf'], ['orc@.cfa', 'Orc'],
    ['skele@.cfa', 'Skeleton'], ['spider@.cfa', 'Spider'], ['ghoul@.cfa', 'Ghoul'],
    ['hound@.cfa', 'Hell Hound'], ['hom@.cfa', 'Homonculus'], ['ice@.cfa', 'Ice Golem'],
    ['stone@.cfa', 'Stone Golem'], ['iron@.cfa', 'Iron Golem'], ['medusa@.cfa', 'Medusa'],
    ['vampire@.cfa', 'Vampire'], ['lich@.cfa', 'Lich'],
  ]) {
    assert.ok(sheetSpellsName(sheet, name), `${sheet} spells ${name}`);
  }
  // …and the two the spelling does *not* carry, which is the whole finding: one is the
  // Minotaur, and the other is the Fire Daemon whose file name misspells its own creature.
  assert.equal(sheetSpellsName('pat@.cfa', 'Minotaur'), false);
  assert.equal(sheetSpellsName('deamon@.cfa', 'Fire Daemon'), false);
  assert.ok(sheetSpellsName('deamon@.cfa', 'Deamon'), 'the file name spells a different word, and it does spell it');
});

test('the pairing is a zip, and it reports rather than hides its disagreements', () => {
  const tables = {
    creatureNames: ['Rat', 'Goblin', 'Lizard Man', 'Minotaur'],
    creatureSheets: ['rat@.cfa', 'goblin@.cfa', 'lizard@.cfa', 'pat@.cfa'],
  };
  const pairs = creatureArtPairs(tables);
  assert.deepEqual(pairs.map((p) => p.index), [0, 1, 2, 3]);
  assert.deepEqual(pairs.map((p) => p.agrees), [true, true, true, false]);
});

test('the two fingerprints the archive\'s sheets are told apart by', () => {
  assert.ok(isCreatureLayout([12, 8, 8, 8, 8, 3]));
  assert.ok(isFolkLayout([12, 12, 12, 12, 12, 3]));
  assert.equal(layoutOf([12, 8, 8, 8, 8, 3]), 'creature');
  assert.equal(layoutOf([12, 12, 12, 12, 12, 3]), 'folk');
  // A shape that is neither is `null` rather than the closer of the two: the rat walks twelve
  // frames in every angle like the watch, so the shape alone never decides.
  assert.equal(layoutOf([12, 6, 6, 6, 6, 3]), null, 'the homunculus');
  assert.equal(layoutOf([9, 0, 0, 0, 0, 0]), null, 'the one-angle commoners');
  assert.deepEqual([...CREATURE_LAYOUT], [12, 8, 8, 8, 8, 3]);
  assert.deepEqual([...FOLK_LAYOUT], [12, 12, 12, 12, 12, 3]);
});

// ── the reading, against the executable ──────────────────────────────────────────────────────

test('the executable\'s two tables pair index by index, and the Minotaur is the pair with nothing behind it', { skip }, () => {
  const { tables: all, creatures } = install();
  const audit = monsterArtAudit(MONSTERS, { creatureNames: creatures, creatureSheets: all.creatureSheets });
  assert.equal(audit.pairs.length, 23, 'one pair per creature in the executable\'s list');
  assert.equal(audit.agreed, 21, 'twenty-one spell out; the two that do not are the finding below');
  assert.deepEqual(audit.disagreed.map((p) => [p.index, p.name, p.sheet]),
    [[7, 'Minotaur', 'pat@.cfa'], [19, 'Fire Daemon', 'deamon@.cfa']]);
  // `drawnBy` says what the *port* draws each disagreed sheet as, and the two rows are the two
  // different kinds of disagreement: the Minotaur's pair had nothing behind it at all until this
  // block's fix (`PAT` is now what draws it), while the Fire Daemon's is the file name's own
  // misspelling — `deamon` for `daemon` — which `monsters.js` had always spelled correctly.
  assert.equal(audit.disagreed[0].drawnBy, 'PAT', 'the fix: this cell is what changed');
  assert.equal(audit.disagreed[1].drawnBy, 'DEAMON');
  assert.deepEqual(audit.unclaimedSheets, ['pat@.cfa', 'deamon@.cfa', 'tharn0@.cfa'],
    'unclaimed by the *agreeing* pairs: the Minotaur\'s, the misspelled one, and the boss\'s');
  // Per monster: every creature the executable names draws from the sheet its pair names, and
  // the only row with no art at all was the Minotaur, which the fix below closes.
  assert.equal(audit.monsters.length, MONSTERS.length);
  assert.deepEqual(audit.spriteDisagreements, [], 'no monster draws from a sheet the tables do not name');
  for (const row of audit.monsters) {
    if (row.name === 'Jagar Tharn') {
      assert.equal(row.namedInExe, false, 'the boss is not in the creature list, only his sheet is');
      continue;
    }
    assert.ok(row.namedInExe, `${row.name} is in the executable's creature list`);
    assert.ok(row.sprite, `${row.name} draws from something`);
    assert.equal(row.sprite.toLowerCase(), row.exeFamily.toLowerCase(),
      `${row.name}: the port's sheet is the executable's`);
  }
  // The Minotaur specifically, because that is the pair: `pat`.
  const minotaur = audit.monsters.find((m) => m.name === 'Minotaur');
  assert.equal(minotaur.exeFamily, 'pat');
  assert.equal(minotaur.sprite, 'PAT');
});

test('the .INF monster slots come out in the executable\'s own order, all twenty-three', { skip }, () => {
  const { creatures } = install();
  const slots = monsterSlotAudit(DUNGEON_MONSTERS, creatures);
  assert.equal(slots.first, MONSTER_ITEM_MIN);
  assert.equal(slots.last, MONSTER_ITEM_MAX);
  assert.equal(slots.rows.length, 23, 'twenty-three slots, one per creature');
  assert.equal(slots.agreed, 23, slots.rows.filter((r) => !r.agrees)
    .map((r) => `${r.item}:${r.id}≠${r.exeName}`).join(' '));
  // The slot the port's own art reading had to explain (`OGRE.DFA` for the Minotaur) is the slot
  // the executable puts the Minotaur in.
  assert.deepEqual(slots.rows.find((r) => r.item === 39), { item: 39, id: 'minotaur', exeName: 'Minotaur', agrees: true });
  assert.deepEqual(slots.rows[0], { item: 32, id: 'rat', exeName: 'Rat', agrees: true });
});

// ── the fix itself, against the archive ──────────────────────────────────────────────────────

test('every monster\'s sheets are in the archive, and the Minotaur\'s are PAT', { skip }, () => {
  const { archive } = install();
  if (!archive) return;   // no archive beside this checkout, no pins
  const names = new Set(archive.names());
  for (const monster of MONSTERS) {
    assert.ok(monster.sprite, `${monster.name} has art`);
    for (const file of spriteFiles(monster)) {
      assert.ok(names.has(file), `${monster.name}: ${file} is in GLOBAL.BSA`);
    }
  }
  assert.deepEqual(spriteFiles(monsterById('minotaur')),
    ['PAT1.CFA', 'PAT2.CFA', 'PAT3.CFA', 'PAT4.CFA', 'PAT5.CFA', 'PAT6.CFA']);
  assert.equal(spriteFile(monsterById('minotaur'), 3), 'PAT3.CFA');
  assert.deepEqual(monsterReport().spriteless, [], 'nothing in the bestiary is left undrawable');
});

test('PAT carries the creature fingerprint and no person\'s sheet does', { skip }, () => {
  const { archive } = install();
  if (!archive) return;
  // The archive's own names: `PAT1.CFA`…`PAT6.CFA`, `GUARD01.CFA`… — the family as the table
  // spells it (`pat@.cfa`, `guard0@.cfa`) with the view digit in place of the `@`.
  const frames = (family) => [1, 2, 3, 4, 5, 6].map((view) => {
    const file = `${family}${view}.CFA`;
    const bytes = archive.get(file);
    return bytes ? cfaInfo(bytes, file).frameCount : 0;
  });
  // The Minotaur's own sheets: five angles and a death, in the creature's shape.
  assert.deepEqual(frames('PAT'), [12, 8, 8, 8, 8, 3], 'PAT1…PAT6');
  assert.equal(layoutOf(frames('PAT')), 'creature');
  // …and every sheet the archive hands the town is a person's, none of them the creature shape.
  const personFiles = peopleKindsFromListing(archive.names()).flatMap((k) => k.files);
  assert.ok(personFiles.length > 40, `${personFiles.length} person sheets`);
  assert.ok(!personFiles.some((f) => /^PAT/.test(f)), 'and not one of them is PAT');
  for (const family of ['GUARD0', 'BABE0']) {
    assert.equal(layoutOf(frames(family)), 'folk', `${family} is a person's sheets`);
  }
  assert.equal(labelForFile('PAT1.CFA'), null, 'a PAT sheet is nobody\'s person');
});

test('the rat is why the fingerprint is corroboration and not proof', { skip }, () => {
  const { archive } = install();
  if (!archive) return;
  // Stated as a check rather than a caveat, because it is the honest half of the reading: the rat
  // — a creature — carries the *person* shape, so a fingerprint alone could never decide this.
  const frames = [1, 2, 3, 4, 5, 6].map((v) => cfaInfo(archive.get(`RAT${v}.CFA`), `RAT${v}.CFA`).frameCount);
  assert.deepEqual(frames, [12, 12, 12, 12, 12, 3]);
  assert.equal(layoutOf(frames), 'folk', 'a creature wearing the person shape');
  // The proof is the pairing, and this is the pair it points at.
  assert.equal(sheetSpellsName('pat@.cfa', 'Minotaur'), false);
});
