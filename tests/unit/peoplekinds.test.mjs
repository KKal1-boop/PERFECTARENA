// ARENA'S OTHER PEOPLE — pinned against the archive's own listing and bytes.
//
// The port used to read only the armoured `xxNNNWLK` roster, which is the archive's
// *fighting* folk: a town therefore held nothing but figures in armour. The families this
// module adds were measured off `GLOBAL.BSA` itself before a line was written —
// `MLGEN0#W/T/D` (walk 9 frames/52 px wide, talk 9/43, die 9/41), `FMGENW0#`/`FMGEN0#`/
// `FMGEND0#` for the women, `GUARD0#` (12-frame view sheets plus a 3-frame death), and the
// `BABE0`/`PAT`/`LGLIT0` sets — and the action letters are read from the names while the
// widths say the same thing. These pins hold that reading to the install, not to the code.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { parseBsa } from '../../src/arena/bsaArchive.js';
import { parseCfa } from '../../src/arena/cfa.js';
import { peopleKindsFromListing, kindViewFile, labelForFile } from '../../src/game/peopleKinds.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

const archive = (() => {
  try {
    return parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
  } catch {
    return null;
  }
})();

const kinds = archive ? peopleKindsFromListing(archive.names()) : [];
const kindOf = (key) => kinds.find((k) => k.key === key) ?? null;

test('the synthetic listing is read by name alone, one kind per family', () => {
  const found = peopleKindsFromListing([
    'MLGEN01W.CFA', 'MLGEN01T.CFA', 'MLGEN01D.CFA',
    'FMGEN01.CFA', 'FMGENW01.CFA', 'FMGEND01.CFA',
    'GUARD01.CFA', 'GUARD02.CFA', 'GUARD06.CFA',
    'SWORD.CIF', '01PLTWLK.CFA',
  ]);
  assert.deepEqual(found.map((k) => k.key), ['FMGEN01', 'GUARD0', 'MLGEN01']);
  const male = found.find((k) => k.key === 'MLGEN01');
  assert.deepEqual(male.actions, { walk: 'MLGEN01W.CFA', talk: 'MLGEN01T.CFA', die: 'MLGEN01D.CFA' });
  // One angle ships for a generic figure, so all five views answer with its own sheet.
  assert.deepEqual([1, 2, 3, 4, 5].map((v) => kindViewFile(male, v)),
    ['MLGEN01W.CFA', 'MLGEN01W.CFA', 'MLGEN01W.CFA', 'MLGEN01W.CFA', 'MLGEN01W.CFA']);
  const guard = found.find((k) => k.key === 'GUARD0');
  // The angles the archive ships are their own; one it does not ship falls back to the
  // front sheet, the same rule `outfitsFromFolk` applies to an incomplete armour family.
  assert.deepEqual([1, 2, 5].map((v) => kindViewFile(guard, v)),
    ['GUARD01.CFA', 'GUARD02.CFA', 'GUARD01.CFA']);
  assert.equal(guard.actions.die, 'GUARD06.CFA');
  // A name that is not one of these families is read by nobody else's rule.
  assert.equal(peopleKindsFromListing(['SWORD.CIF']).length, 0);
});

test('labels are read off the family the name spells', () => {
  assert.equal(labelForFile('MLGEN03T.CFA'), 'a man of the town');
  assert.equal(labelForFile('FMGENW05.CFA'), 'a woman of the town');
  assert.equal(labelForFile('FMGEND02.CFA'), 'a woman of the town');
  assert.equal(labelForFile('GUARD04.CFA'), 'a guard of the watch');
  assert.equal(labelForFile('PAT3.CFA'), 'a townsman of the PAT set');
  assert.equal(labelForFile('LGLIT06.CFA'), 'a small figure of the LGLIT set');
  assert.equal(labelForFile('01PLTWLK.CFA'), null, 'the armoured roster is not this module\\u2019s');
});

test('the install ships fourteen of these people families, and they are the measured ones', () => {
  if (!archive) return;   // no install beside this checkout, no pins
  assert.equal(kinds.length, 14, kinds.map((k) => k.key).join(', '));
  // The archive's own frame counts, read from its own bytes: the generics walk in nine
  // frames, the watch in twelve, the small `LGLIT` figures in three.
  const frames = (file) => parseCfa(archive.get(file), file).frames.length;
  assert.equal(frames('MLGEN01W.CFA'), 9);
  assert.equal(frames('MLGEN01T.CFA'), 9);
  assert.equal(frames('FMGENW01.CFA'), 9);
  assert.equal(frames('GUARD01.CFA'), 12);
  assert.equal(frames('GUARD06.CFA'), 3);
  assert.equal(frames('LGLIT01.CFA'), 3);

  const male = kindOf('MLGEN01');
  assert.deepEqual(male.actions, { walk: 'MLGEN01W.CFA', talk: 'MLGEN01T.CFA', die: 'MLGEN01D.CFA' });
  const female = kindOf('FMGEN03');
  assert.deepEqual(female.actions, { talk: 'FMGEN03.CFA', walk: 'FMGENW03.CFA', die: 'FMGEND03.CFA' });
  const guard = kindOf('GUARD0');
  assert.deepEqual([1, 2, 3, 4, 5].map((v) => kindViewFile(guard, v)),
    ['GUARD01.CFA', 'GUARD02.CFA', 'GUARD03.CFA', 'GUARD04.CFA', 'GUARD05.CFA']);
  assert.equal(guard.actions.die, 'GUARD06.CFA');
  // Every file a kind names is really in the archive, and every kind has all five angles.
  for (const kind of kinds) {
    assert.equal(Object.keys(kind.views).length, 5, `${kind.key} has five angles`);
    for (const file of kind.files) assert.ok(archive.get(file), `${kind.key}: ${file} is in the archive`);
    for (const view of [1, 2, 3, 4, 5]) assert.ok(archive.get(kindViewFile(kind, view)), `${kind.key} view ${view}`);
  }
  // The men and women are the only families with a talk sheet, and they all have one.
  const talkers = kinds.filter((k) => k.actions.talk);
  assert.deepEqual(talkers.map((k) => k.key), ['FMGEN01', 'FMGEN02', 'FMGEN03', 'FMGEN04', 'FMGEN05',
    'MLGEN01', 'MLGEN02', 'MLGEN03', 'MLGEN04', 'MLGEN05']);
});
