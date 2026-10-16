// ARENA'S OTHER PEOPLE — pinned against the archive's own listing and bytes.
//
// The port used to read only the armoured `xxNNNWLK` roster, which is the archive's
// *fighting* folk: a town therefore held nothing but figures in armour. The families this
// module adds were measured off `GLOBAL.BSA` itself before a line was written —
// `MLGEN0#W/T/D` (walk 9 frames at view 1, 6 at views 2…5, 52 px wide), `FMGENW0#`/`FMGEN0#`/
// `FMGEND0#` for the women, `GUARD0#` (12-frame view sheets plus a 3-frame death), and the
// `BABE0`/`PAT`/`LGLIT0` sets — and the action letters are read from the names while the
// widths say the same thing. These pins hold that reading to the install, not to the code.
//
// ── RESTATED (D-47): the digit is a DIRECTION, not a person ──────────────────────────────
//
// Three pins in this file used to assert **thirteen** kinds — five `MLGEN0#` men and five
// `FMGEN0#` women, "one angle each" — and that a kind's action was one file name. That
// reading was wrong, and it was wrong about the archive, so the pins move with the law
// rather than the law moving to keep them green (law 5, and the evidence is written into
// `peopleKinds.js`'s header): OpenTESArena's `ExeData.h` documents the human template as
// `0@XXX` ("Replace '0@' with either 0 or 1 for the gender, and 1 to 5 depending on the kind
// of animation"), its creature template as "@ … a number from 1 to 5 indicating which .CFA
// file to fetch for angle-relative animations", `ArenaAnimUtils::trySetHumanFilenameGender`
// implements the leading digit as `filename[0] = isMale ? '0' : '1'`, and
// `ArenaAnimUtils::Directions` is **8** with `FirstMirroredAnimID = 6` — so five shipped
// files cover eight directions by mirroring. The archive's own widths agree: the five views
// of one armour word run 40/55/69/56/38 px, symmetric about a profile, and the same numbers
// recur under every armour word and citizen action (`.scratch/viewsym.mjs`,
// `.scratch/peopleProbe.mjs`). The player-visible half of the mistake is the owner's report:
// *"they dont have a proper 360 walking animation or going around them 360 animation"*.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { parseBsa } from '../../src/arena/bsaArchive.js';
import { parseCfa } from '../../src/arena/cfa.js';
import { peopleKindsFromListing, kindViewFile, actionFile, labelForFile } from '../../src/game/peopleKinds.js';

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
const directions = [1, 2, 3, 4, 5];

test('the synthetic listing is read by name alone, one kind per family', () => {
  const found = peopleKindsFromListing([
    'MLGEN01W.CFA', 'MLGEN01T.CFA', 'MLGEN01D.CFA',
    'FMGEN01.CFA', 'FMGENW01.CFA', 'FMGEND01.CFA',
    'GUARD01.CFA', 'GUARD02.CFA', 'GUARD06.CFA',
    'SWORD.CIF', '01PLTWLK.CFA',
  ]);
  // One kind per *family*, not per direction: the digit is a direction (D-47).
  assert.deepEqual(found.map((k) => k.key), ['FMGEN', 'GUARD0', 'MLGEN']);
  const male = found.find((k) => k.key === 'MLGEN');
  // One direction of one man: every action carries it, and the five directions the archive did
  // not give us here answer with the front sheet — the same person, never another figure's.
  assert.deepEqual(directions.map((v) => actionFile(male, 'walk', v)), Array(5).fill('MLGEN01W.CFA'));
  assert.deepEqual(directions.map((v) => actionFile(male, 'talk', v)), Array(5).fill('MLGEN01T.CFA'));
  assert.deepEqual(directions.map((v) => actionFile(male, 'die', v)), Array(5).fill('MLGEN01D.CFA'));
  assert.deepEqual(directions.map((v) => kindViewFile(male, v)), Array(5).fill('MLGEN01W.CFA'));
  const guard = found.find((k) => k.key === 'GUARD0');
  // The directions the archive ships are their own; one it does not ship falls back to the
  // front sheet, the same rule `outfitsFromFolk` applies to an incomplete armour family.
  assert.deepEqual([1, 2, 5].map((v) => kindViewFile(guard, v)),
    ['GUARD01.CFA', 'GUARD02.CFA', 'GUARD01.CFA']);
  assert.equal(actionFile(guard, 'die', 3), 'GUARD06.CFA');
  assert.equal(actionFile(guard, 'talk', 1), null, 'the watch ships no talk sheet');
  // A name that is not one of these families is read by nobody else's rule.
  assert.equal(peopleKindsFromListing(['SWORD.CIF']).length, 0);
});

test('labels are read off the family the name spells', () => {
  assert.equal(labelForFile('MLGEN03T.CFA'), 'a man of the town');
  assert.equal(labelForFile('FMGENW05.CFA'), 'a woman of the town');
  assert.equal(labelForFile('FMGEND02.CFA'), 'a woman of the town');
  assert.equal(labelForFile('GUARD04.CFA'), 'a guard of the watch');
  assert.equal(labelForFile('LGLIT06.CFA'), 'a small figure of the LGLIT set');
  // **`PAT` is not a person** (D-30). It is the Minotaur's art — the executable's creature-sheet
  // table names it where its creature-name table names the Minotaur (`game/monsterArt.js`) — so
  // this module must answer `null` for it and must not put it in a crowd.
  assert.equal(labelForFile('PAT3.CFA'), null, 'the Minotaur is not a townsman');
  assert.equal(labelForFile('01PLTWLK.CFA'), null, 'the armoured roster is not this module\u2019s');
});

test('the install ships five of these people families — one man, one woman, the watch and two sets', () => {
  if (!archive) return;   // no install beside this checkout, no pins
  assert.deepEqual(kinds.map((k) => k.key), ['BABE0', 'FMGEN', 'GUARD0', 'LGLIT0', 'MLGEN']);
  assert.ok(!kinds.some((k) => /^PAT/.test(k.key)), 'no `PAT` kind: it is a creature\'s sheets');
  // The archive's own frame counts, read from its own bytes: the citizens walk in nine frames
  // at the front direction and six at the rest (measured, `.scratch/peopleProbe.mjs`), the watch
  // in twelve, the small `LGLIT` figures in three.
  const frames = (file) => parseCfa(archive.get(file), file).frames.length;
  // The Minotaur's sheets are in the archive and are nobody's kind: five angles and a death,
  // in the creature shape (`game/monsterArt.js`), which is why the crowd cannot have them.
  assert.ok(!kinds.some((k) => k.files.some((f) => /^PAT/.test(f))), 'nor any file of one');
  assert.equal(frames('MLGEN01W.CFA'), 9);
  assert.equal(frames('MLGEN03W.CFA'), 6);
  assert.equal(frames('MLGEN01T.CFA'), 9);
  assert.equal(frames('FMGENW01.CFA'), 9);
  assert.equal(frames('GUARD01.CFA'), 12);
  assert.equal(frames('GUARD06.CFA'), 3);
  assert.equal(frames('LGLIT01.CFA'), 3);

  // **The five directions are five different files** — this is the whole of D-47: the men and
  // the women are one figure each, drawn from five sides, not five figures drawn alike.
  const male = kindOf('MLGEN');
  assert.deepEqual(directions.map((v) => actionFile(male, 'walk', v)),
    ['MLGEN01W.CFA', 'MLGEN02W.CFA', 'MLGEN03W.CFA', 'MLGEN04W.CFA', 'MLGEN05W.CFA']);
  assert.deepEqual(directions.map((v) => actionFile(male, 'talk', v)),
    ['MLGEN01T.CFA', 'MLGEN02T.CFA', 'MLGEN03T.CFA', 'MLGEN04T.CFA', 'MLGEN05T.CFA']);
  const female = kindOf('FMGEN');
  assert.deepEqual(directions.map((v) => actionFile(female, 'walk', v)),
    ['FMGENW01.CFA', 'FMGENW02.CFA', 'FMGENW03.CFA', 'FMGENW04.CFA', 'FMGENW05.CFA']);
  assert.deepEqual(directions.map((v) => actionFile(female, 'die', v)),
    ['FMGEND01.CFA', 'FMGEND02.CFA', 'FMGEND03.CFA', 'FMGEND04.CFA', 'FMGEND05.CFA']);
  const guard = kindOf('GUARD0');
  assert.deepEqual(directions.map((v) => kindViewFile(guard, v)),
    ['GUARD01.CFA', 'GUARD02.CFA', 'GUARD03.CFA', 'GUARD04.CFA', 'GUARD05.CFA']);
  assert.equal(actionFile(guard, 'die', 1), 'GUARD06.CFA');
  // Every file a kind names is really in the archive, and every kind has all five directions.
  for (const kind of kinds) {
    assert.equal(Object.keys(kind.views).length, 5, `${kind.key} has five directions`);
    for (const file of kind.files) assert.ok(archive.get(file), `${kind.key}: ${file} is in the archive`);
    for (const view of directions) assert.ok(archive.get(kindViewFile(kind, view)), `${kind.key} view ${view}`);
  }
  // The men and women are the only families with a talk sheet, and they all have one.
  assert.deepEqual(kinds.filter((k) => k.actions.talk).map((k) => k.key), ['FMGEN', 'MLGEN']);

  // **The archive's own width signature, which is what a direction looks like**: the five views
  // of one armour word run symmetric about a profile — narrow at the front, widest where the
  // stride is seen from the side, narrow again at the back — and the same numbers recur under
  // every armour word. A "five different people" reading has no reason to be symmetric.
  const widths = ['01CHNWLK.CFA', '02CHNWLK.CFA', '03CHNWLK.CFA', '04CHNWLK.CFA', '05CHNWLK.CFA']
    .map((f) => parseCfa(archive.get(f), f).frames[0].width);
  assert.ok(widths[2] > widths[0] && widths[2] > widths[4],
    `the profile is the widest view: ${widths.join(' / ')}`);
  assert.ok(Math.abs(widths[1] - widths[3]) <= 4,
    `the two three-quarter views are neighbours: ${widths.join(' / ')}`);
});

// ── the layout a sheet carries (D-42) ─────────────────────────────────────────
//
// **The frame count is a property of the family, and it is not decoration.** The five-direction
// sheets of the watch and `BABE` are twelve-frame — Arena's layout, walk 0–5, look 6/0/7/0,
// attack 8–11 — and the male and female generics are one action per file (six frames, or nine
// at the front direction). A walking figure drawn from a twelve-frame sheet may therefore only
// play frames 0…5: before `layout` existed, every person that is not a monster was given
// **every** frame as their stride, so the town's watch walked through its own head-turn and its
// sword-swing (measured in `.scratch/peopleProbe.mjs`, which is also where the numbers below
// come from).
test('the layout is read from the family and matches the frames the archive ships', () => {
  const frameCount = (file) => parseCfa(new Uint8Array(archive.get(file)), file).frames.length;
  const byKey = new Map(kinds.map((kind) => [kind.key, kind]));
  // The watch and the `BABE` family are the twelve-frame ones.
  for (const key of ['GUARD0', 'BABE0']) {
    const kind = byKey.get(key);
    assert.equal(kind.layout, 'view', `${key} carries Arena's layout`);
    assert.equal(frameCount(kindViewFile(kind, 3)), 12, `${key} ships twelve-frame views`);
  }
  // …and the town's own men and women are single actions, at six or nine frames.
  for (const key of ['MLGEN', 'FMGEN']) {
    const kind = byKey.get(key);
    assert.equal(kind.layout, 'action', `${key} is one animation per file`);
    for (const view of directions) {
      assert.ok([6, 9].includes(frameCount(actionFile(kind, 'walk', view))),
        `${key} view ${view} walks in 6 or 9 frames`);
    }
  }
  // **The armoured roster is a third case, and it is why the layout cannot be read off a frame
  // count alone**: `01CHNWLK.CFA` is six frames *and* one of five directions, because the roster
  // puts the direction in the file's own set digit (`townsfolk.js`'s `outfitsFromFolk`). Six
  // frames, one direction, one animation — so its whole sheet is its stride.
  const armour = parseCfa(new Uint8Array(archive.get('01CHNWLK.CFA')), '01CHNWLK.CFA');
  assert.equal(armour.frames.length, 6);
  // A kind with no layout recorded another way defaults to the single-action reading (an unknown
  // family must not silently lose frames it does not have).
  assert.equal(kinds.every((kind) => kind.layout === 'view' || kind.layout === 'action'), true);
});
