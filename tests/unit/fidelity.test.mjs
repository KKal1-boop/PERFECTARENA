// FIDELITY PINS — the parts that make PERFECTARENA a port of this install rather than an
// interpretation of it.
//
// Every check here reads the player's own files where it can: `DUNGEON.TXT`'s prose, the
// loose `.FLC` names, the two quest-level tables the walkthroughs give, and `STAFDUNG.CIF`'s
// name. The pure models (logbook, splash wrapper, cinematic chains) are held to their own
// contracts. A missing install stands these down the way the other install-pinned suites do.
//
//   node --test tests/unit/fidelity.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  DUNGEON_TXT_RECORD, dungeonTxtFor, dungeonTxtTitles, normaliseDungeonName, parseDungeonTxt,
} from '../../src/arena/dungeonTxt.js';
import {
  CANONICAL_ENDING_MOVIES, CINEMATIC_INFO, STAFF_ASSEMBLY_MOVIES, endingMoviesFor, galleryEntries,
} from '../../src/game/cinematics.js';
import { CUTSCENES, cutsceneNames } from '../../src/game/cutscene.js';
import {
  CLUE_PICKUP_LEVELS, STAFF_DUNGEON_ORDER, STAFF_PICKUP_LEVELS, clueLevel, levelLabel, stageLevel,
} from '../../src/game/questData.js';
import {
  MAX_NOTES, addNote, createLogbook, formatLogbookStamp, newestEntries, normalizeLogbook, removeNote,
} from '../../src/game/logbook.js';
import { STAFF_MARKER_RECORD } from '../../src/game/mapScreen.js';
import { questSplashFor, wrapSplashText } from '../../src/game/questSplash.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const install = (name) => fs.existsSync(path.join(ARENA, name));
const bytes = (name) => new Uint8Array(fs.readFileSync(path.join(ARENA, name)));

test('DUNGEON.TXT is the install’s own arrival prose, one record per dungeon', { skip: !install(DUNGEON_TXT_RECORD) && 'no DUNGEON.TXT' }, () => {
  const entries = parseDungeonTxt(bytes(DUNGEON_TXT_RECORD));
  assert.ok(entries.length >= STAFF_DUNGEON_ORDER.length, `${entries.length} entries`);
  assert.deepEqual(dungeonTxtTitles(entries).filter((title) => !title), [], 'no entry has an empty title');
  for (const name of STAFF_DUNGEON_ORDER) {
    const entry = dungeonTxtFor(entries, name);
    assert.ok(entry, `${name} has its own paragraph`);
    assert.ok(entry.description.length > 80, `${name} is prose, not a label`);
  }
  assert.match(dungeonTxtFor(entries, 'Fang Lair').description, /Fang Lair|dragon/i);
  // "The Imperial Palace" and "Imperial Palace" are the same place.
  assert.equal(normaliseDungeonName('The Imperial Palace'), normaliseDungeonName('Imperial Palace'));
});

test('the DUNGEON.TXT reader splits records on # and keeps paragraph breaks', () => {
  const parsed = parseDungeonTxt(new TextEncoder().encode('One\nfirst line\nsecond line\n#\nTwo\n\nbody\n'));
  assert.deepEqual(parsed, [
    { title: 'One', description: 'first line\nsecond line' },
    { title: 'Two', description: 'body' },
  ]);
  assert.equal(normaliseDungeonName('  The  Crystal   Tower '), 'crystal tower');
});

test('every loose movie has a readable title and an honest note', () => {
  assert.ok(CUTSCENES.length >= 17, `${CUTSCENES.length} catalogued movies`);
  for (const movie of CUTSCENES) {
    const info = CINEMATIC_INFO[movie.file];
    assert.ok(info, `${movie.file} has a title/note entry`);
    assert.ok(info.title.length > 0, `${movie.file} title`);
    assert.ok(info.note.length > 0, `${movie.file} note`);
  }
  const gallery = galleryEntries();
  assert.equal(gallery.length, CUTSCENES.length, 'the gallery is every catalogued movie');
  const warhaft = gallery.find((movie) => movie.file === 'WARHAFT.FLC');
  assert.ok(warhaft, 'the cut Warhaft slide is still in the gallery');
  assert.match(warhaft.note, /cut/i, 'and the note says it is cut');
});

test('the ending follows the release the install carries, and keeps both Emperor shots', () => {
  assert.deepEqual(endingMoviesFor(new Set(cutsceneNames())), [...CANONICAL_ENDING_MOVIES]);
  const revisedRemoved = new Set(cutsceneNames());
  revisedRemoved.delete('NUKING.FLC');
  revisedRemoved.delete('NUJAGDTH.FLC');
  assert.deepEqual(endingMoviesFor(revisedRemoved), [
    'JAGARDTH.FLC', 'KING.FLC', 'END01.FLC', 'END02.FLC', 'AFLC2.FLC',
  ]);
  assert.deepEqual(endingMoviesFor(new Set(['JAGARDTH.FLC', 'END01.FLC'])), ['JAGARDTH.FLC', 'END01.FLC']);
  assert.deepEqual([...STAFF_ASSEMBLY_MOVIES], ['STAFF.FLC', 'CHAOSVSN.FLC']);
});

test('the Staff and clue levels are the walkthroughs’ own, and both labels are readable', () => {
  assert.equal(STAFF_PICKUP_LEVELS.length, 8);
  assert.equal(CLUE_PICKUP_LEVELS.length, 8);
  assert.deepEqual([...STAFF_PICKUP_LEVELS], [1, 0, 1, 2, 3, 3, 1, 2]);
  assert.deepEqual([...CLUE_PICKUP_LEVELS], [0, 1, 1, 2, 1, 1, 1, 1]);
  assert.equal(levelLabel(0), 'first level');
  assert.equal(levelLabel(3), 'fourth level');
  assert.equal(stageLevel({ kind: 'piece', piece: 1 }), 1);
  assert.equal(stageLevel({ kind: 'piece', piece: 5, staffLevel: 3 }), 3);
  assert.equal(clueLevel({ kind: 'piece', piece: 1 }), 0);
  assert.equal(clueLevel({ kind: 'escape' }), null);
  assert.equal(stageLevel(null), null);
  assert.equal(levelLabel(9), 'level 10');
});

test('the logbook adds, stamps, orders and forgets notes without inventing one', () => {
  let book = createLogbook();
  const added = addNote(book, '  The piece is below Fang Lair.  ', {
    day: 2, hour: 9, place: 'Fang Lair', questStep: 2,
  });
  assert.equal(added.ok, true);
  book = added.logbook;
  assert.deepEqual(book.notes.map((note) => note.text), ['The piece is below Fang Lair.']);
  assert.equal(formatLogbookStamp(book.notes[0]), 'Day 3 · 09:00 · Fang Lair');
  const second = addNote(book, 'Buy a lantern.', { day: 3, hour: 20 });
  book = second.logbook;
  assert.deepEqual(newestEntries({ log: ['a', 'b', 'c'] }, 2), ['c', 'b']);
  const removed = removeNote(book, book.notes[0].id);
  assert.equal(removed.ok, true);
  assert.equal(removed.logbook.notes.length, 1);
  assert.equal(addNote(book, '   ').ok, false, 'an empty note is refused');
  assert.equal(normalizeLogbook({ notes: [{ text: '   ' }, null, { text: 'kept' }] }).notes.length, 1);
  assert.ok(MAX_NOTES >= 1);
});

test('a Staff dungeon owes its own DUNGEON.TXT page, and only at the place the quest names',
  { skip: !install(DUNGEON_TXT_RECORD) && 'no DUNGEON.TXT' }, () => {
    const entries = parseDungeonTxt(bytes(DUNGEON_TXT_RECORD));
    const stage = { kind: 'piece', title: 'Fang Lair', clue: { title: 'Halls of Colossus' }, provinceID: 1 };
    const atClue = questSplashFor({ stage, quest: { mapKnown: false }, entries, placeName: 'Halls of Colossus' });
    assert.ok(atClue, 'the clue dungeon has its page');
    assert.equal(atClue.atClue, true);
    assert.equal(atClue.title, 'Halls of Colossus');
    const atPiece = questSplashFor({ stage, quest: { mapKnown: true }, entries, placeName: 'Fang Lair' });
    assert.ok(atPiece, 'the piece dungeon has its page');
    assert.equal(atPiece.atClue, false);
    assert.match(atPiece.text, /Fang Lair/i);
    assert.equal(questSplashFor({ stage, quest: { mapKnown: false }, entries, placeName: 'Fang Lair' }), null,
      'the piece dungeon is not the page before its map is in hand');
    const lines = wrapSplashText(atPiece.text);
    assert.ok(lines.length > 2);
    assert.ok(lines.every((line) => line.length <= 58 || !line.includes(' ')), 'the wrap is 58 columns');
  });

test('the Staff’s own province mark is the install’s STAFDUNG record', () => {
  assert.equal(STAFF_MARKER_RECORD, 'STAFDUNG.CIF');
});
