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
import {
  STATIC_PEOPLE_FAMILIES, actionFile, kindViewFile, labelForFile, peopleKindsFromListing,
  staticFileFor, staticKindsFromListing,
} from '../../src/game/peopleKinds.js';
import { placeStaticFolk } from '../../src/game/townsfolk.js';

const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

const archive = (() => {
  try {
    return parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
  } catch {
    return null;
  }
})();

/**
 * **Everything the install ships, archive and loose folder alike.**
 *
 * The static people are the loose-folder risk of this whole area: an `.INF` names its drinkers
 * (`TAVERN.INF`'s `MAN01…04`) and the art for a name like that is as likely to be one of the
 * install's 237 unread *loose* records as an archive one (`docs/ASSETS.md`). A pin that read only
 * `GLOBAL.BSA` would call such a family "not shipped" while the player's folder has it.
 */
const looseNames = (() => {
  try {
    return fs.readdirSync(ARENA).map((n) => n.toUpperCase());
  } catch {
    return [];
  }
})();
const listing = (archive ? [...archive.names(), ...looseNames] : looseNames)
  .map((name) => String(name).toUpperCase());

// The crowd is read off the **archive**, as it always was (its own pins below hold it to the five
// families measured there); the static families are read off the archive **and the loose folder**,
// because a name like `MAN01` may sit in either.
const kinds = archive ? peopleKindsFromListing(archive.names()) : [];
const staticKinds = staticKindsFromListing(listing);
const kindOf = (key) => kinds.find((k) => k.key === key) ?? null;
const directions = [1, 2, 3, 4, 5];

test('the synthetic listing is read by name alone, one kind per family', () => {
  const found = peopleKindsFromListing([
    'MLGEN01W.CFA', 'MLGEN01T.CFA', 'MLGEN01D.CFA',
    'FMGEN01.CFA', 'FMGENW01.CFA', 'FMGEND01.CFA',
    'GUARD01.CFA', 'GUARD02.CFA', 'GUARD06.CFA',
    'SWORD.CIF', '01PLTWLK.CFA',
  ]);
  // One kind per *family*, not per direction: the digit is a direction (D-47) — and the letter
  // names a **figure**, not only an action: `MLGEN01W` and `MLGEN01T` are two different men
  // (measured 2026-10-18, `.scratch/measure3.mjs`: different clothes on different palette runs,
  // and both stride), so they are two kinds.
  assert.deepEqual(found.map((k) => k.key), ['FMGEN', 'FMGENW', 'GUARD0', 'MLGEN', 'MLGENT']);
  const male = found.find((k) => k.key === 'MLGEN');
  // One direction of one man: the walk carries it, and the five directions the archive did not
  // give us here answer with the front sheet — the same person, never another figure's.
  assert.deepEqual(directions.map((v) => actionFile(male, 'walk', v)), Array(5).fill('MLGEN01W.CFA'));
  assert.deepEqual(directions.map((v) => actionFile(male, 'die', v)), Array(5).fill('MLGEN01D.CFA'));
  assert.deepEqual(directions.map((v) => kindViewFile(male, v)), Array(5).fill('MLGEN01W.CFA'));
  assert.equal(actionFile(male, 'talk', 1), null, 'the tunic man is his own figure, not a talk pose');
  const tunic = found.find((k) => k.key === 'MLGENT');
  assert.deepEqual(directions.map((v) => actionFile(tunic, 'walk', v)), Array(5).fill('MLGEN01T.CFA'));
  const bodice = found.find((k) => k.key === 'FMGEN');
  assert.deepEqual(directions.map((v) => actionFile(bodice, 'walk', v)), Array(5).fill('FMGEN01.CFA'));
  const coat = found.find((k) => k.key === 'FMGENW');
  assert.deepEqual(directions.map((v) => actionFile(coat, 'walk', v)), Array(5).fill('FMGENW01.CFA'));
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
  assert.equal(labelForFile('MLGEN03T.CFA'), 'a man of the town, in a tunic');
  assert.equal(labelForFile('FMGENW05.CFA'), 'a woman of the town');
  assert.equal(labelForFile('FMGEND02.CFA'), 'a woman of the town');
  assert.equal(labelForFile('GUARD04.CFA'), 'a guard of the watch');
  // **`LGLIT` is a rod of light, not a person** (2026-10-18, `.scratch/peoplecolors.mjs`): the
  // sheets are 24×60, three frames, every pixel palette entry 223 (`#ffb800`) — nothing to walk
  // or talk. It read as a kind here because its name has the family shape of `BABE0`.
  assert.equal(labelForFile('LGLIT06.CFA'), null, 'a rod of light is not a person');
  // **`PAT` is not a person** (D-30). It is the Minotaur's art — the executable's creature-sheet
  // table names it where its creature-name table names the Minotaur (`game/monsterArt.js`) — so
  // this module must answer `null` for it and must not put it in a crowd.
  assert.equal(labelForFile('PAT3.CFA'), null, 'the Minotaur is not a townsman');
  assert.equal(labelForFile('01PLTWLK.CFA'), null, 'the armoured roster is not this module\u2019s');
});

test('the install ships six of these people families — two men, two women and the watch', () => {
  if (!archive) return;   // no install beside this checkout, no pins
  assert.deepEqual(kinds.map((k) => k.key), ['BABE0', 'FMGEN', 'FMGENW', 'GUARD0', 'MLGEN', 'MLGENT']);
  assert.ok(!kinds.some((k) => /^PAT/.test(k.key)), 'no `PAT` kind: it is a creature\'s sheets');
  // **`LGLIT0` is not one of them**: one flat gold, three frames, a rod of light on a stand — the
  // owner's *"its litterally a rod of light and he should not be an npc"*. A crowd cannot have it.
  assert.ok(!kinds.some((k) => /^LGLIT/.test(k.key)), 'no `LGLIT` kind: it is a lamp');
  assert.ok(!kinds.some((k) => k.files.some((f) => /^LGLIT/.test(f))), 'nor any file of one');
  // The archive's own frame counts, read from its own bytes: the citizens walk in nine frames
  // at the front direction and six at the rest (measured, `.scratch/peopleProbe.mjs`), the watch
  // in twelve.
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

  // **The five directions are five different files** — this is the whole of D-47: the men and
  // the women are one figure each, drawn from five sides, not five figures drawn alike.
  const male = kindOf('MLGEN');
  assert.deepEqual(directions.map((v) => actionFile(male, 'walk', v)),
    ['MLGEN01W.CFA', 'MLGEN02W.CFA', 'MLGEN03W.CFA', 'MLGEN04W.CFA', 'MLGEN05W.CFA']);
  assert.equal(actionFile(male, 'talk', 1), null,
    'the `T` sheets are the second man, not a talking pose of the first');
  // **The second man and the second woman**, which the port used to file as talk poses and never
  // stand on the street (the owner: *"this is not good because undermines the variety of the npcs"*).
  const tunic = kindOf('MLGENT');
  assert.deepEqual(directions.map((v) => actionFile(tunic, 'walk', v)),
    ['MLGEN01T.CFA', 'MLGEN02T.CFA', 'MLGEN03T.CFA', 'MLGEN04T.CFA', 'MLGEN05T.CFA']);
  const bodice = kindOf('FMGEN');
  assert.deepEqual(directions.map((v) => actionFile(bodice, 'walk', v)),
    ['FMGEN01.CFA', 'FMGEN02.CFA', 'FMGEN03.CFA', 'FMGEN04.CFA', 'FMGEN05.CFA']);
  assert.deepEqual(directions.map((v) => actionFile(bodice, 'die', v)),
    ['FMGEND01.CFA', 'FMGEND02.CFA', 'FMGEND03.CFA', 'FMGEND04.CFA', 'FMGEND05.CFA']);
  const coat = kindOf('FMGENW');
  assert.deepEqual(directions.map((v) => actionFile(coat, 'walk', v)),
    ['FMGENW01.CFA', 'FMGENW02.CFA', 'FMGENW03.CFA', 'FMGENW04.CFA', 'FMGENW05.CFA']);
  assert.deepEqual(directions.map((v) => actionFile(coat, 'die', v)),
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
  // **No family has a talk sheet any more**, and that is the measurement: the `T` sheets are a
  // second man's stride, not a talking pose of the first.
  assert.deepEqual(kinds.filter((k) => k.actions.talk).map((k) => k.key), []);

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

// ── the STATIC people (D-48): the figures that never walk ─────────────────────
//
// The owner, 2026-10-17: *"there are a lot of missing sprites for the game that most of the time
// were static npcs in the original game that were not ported … AR-sprite-GUARD1D.png
// AR-sprite-KING.png AR-sprite-MAN01.png and much more man02 etc that are sitting at the
// tavern"*. Those are Arena's own art in the player's own folder, so the reading is by name like
// every other family here — and it is a **separate** reading from the crowd, because a static
// sheet is one picture with no directions, no walk and no death, and handing it to the walk path
// would stand a person in the street that cannot turn, speak or fall.
test('the static people are read by name — the owner\u2019s own examples first', () => {
  const found = staticKindsFromListing([
    'MAN01.IMG', 'MAN02.IMG', 'MAN03.DFA', 'WOMAN01.IMG',
    'GUARD1D.IMG', 'KING.IMG', 'BARTEND.DFA', 'SMITH.DFA', 'PREST1.DFA',
    // The walking watch and the crowd are NOT static families: `GUARD0#.CFA` is the twelve-frame
    // view sheet `VIEW_SHEETS` already reads, and a `PAT` sheet is the Minotaur (D-30).
    'GUARD01.CFA', 'GUARD06.CFA', 'PAT3.CFA', 'MLGEN01W.CFA', 'SWORD.CIF',
  ]);
  const byKey = new Map(found.map((kind) => [kind.key, kind]));
  assert.deepEqual([...byKey.keys()].sort(),
    ['BARTEND', 'GUARD', 'KING', 'MAN', 'PREST', 'SMITH', 'WOMAN'],
    'one kind per static family the listing carries');
  // `MAN01`/`MAN02` are two **variants of one family** — four men in a tavern is how
  // `TAVERN.INF` lists them (`scenes/interior.js`) — not two directions of one man.
  assert.deepEqual(byKey.get('MAN').files, ['MAN01.IMG', 'MAN02.IMG', 'MAN03.DFA']);
  assert.equal(byKey.get('GUARD').files[0], 'GUARD1D.IMG');
  assert.equal(staticFileFor(byKey.get('MAN'), 4), 'MAN02.IMG', 'the picker wraps over the variants');
  assert.equal(staticFileFor(null, 0), null);
  for (const kind of found) {
    assert.equal(kind.static, true, `${kind.key} says it is a still picture`);
    assert.equal(kind.layout, 'static', `${kind.key} carries no sheet layout to animate`);
    assert.equal(kind.views, undefined, `${kind.key} has no directions: one picture, one angle`);
    assert.equal(kind.actions, undefined, `${kind.key} cannot walk, talk or fall`);
    assert.ok(kind.files.length > 0 && kind.label, `${kind.key} names its files and its label`);
  }
  // A family the archive does not ship produces no kind at all — nothing is invented.
  assert.deepEqual(staticKindsFromListing(['SWORD.CIF', 'PAT3.CFA']), []);
  assert.deepEqual(staticKindsFromListing([]), []);
  assert.deepEqual(staticKindsFromListing(null), []);
});

test('a static name is named by `labelForFile`, and never mistaken for a walker', () => {
  assert.equal(labelForFile('MAN01.IMG'), 'a man of the town, standing');
  assert.equal(labelForFile('MAN02.IMG'), 'a man of the town, standing');
  assert.equal(labelForFile('WOMAN03.DFA'), 'a woman of the town, standing');
  assert.equal(labelForFile('GUARD1D.IMG'), 'a guard of the watch, standing');
  assert.equal(labelForFile('KING.IMG'), 'the king');
  assert.equal(labelForFile('BARTEND.DFA'), 'a barkeep');
  assert.equal(labelForFile('SMITH.DFA'), 'an armourer');
  assert.equal(labelForFile('PREST1.DFA'), 'a priest');
  // The families that are **not** still pictures keep their own answers: the walking watch is the
  // crowd's, the armoured roster is `townsfolk.js`'s, and `PAT` is the Minotaur's art (D-30).
  assert.equal(labelForFile('GUARD01.CFA'), 'a guard of the watch');
  assert.equal(labelForFile('GUARD06.CFA'), 'a guard of the watch');
  assert.equal(labelForFile('MLGEN01W.CFA'), 'a man of the town');
  assert.equal(labelForFile('PAT3.CFA'), null);
  assert.equal(labelForFile('01PLTWLK.CFA'), null);
  // Every family word in the table is complete, and the patterns do not overlap: a `MAN` name is
  // never read as a `WOMAN`, and `GUARD1D` (a still picture) is never the walking `GUARD01`.
  for (const family of STATIC_PEOPLE_FAMILIES) {
    assert.ok(family.key && family.label && family.match instanceof RegExp, `${family.key} is complete`);
    for (const other of STATIC_PEOPLE_FAMILIES) {
      if (other === family) continue;
      const sample = 'MAN01.IMG';
      if (!family.match.test(sample)) continue;
      assert.equal(other.match.test(sample), false,
        `${sample} is read as ${family.key}, never as ${other.key}`);
    }
  }
  // …and the walking watch's own names stay out of the static table outright.
  const guardFamily = STATIC_PEOPLE_FAMILIES.find((f) => f.key === 'GUARD');
  for (const walker of ['GUARD01.CFA', 'GUARD06.CFA']) {
    assert.equal(guardFamily.match.test(walker), false, `${walker} is the crowd's, not a still picture`);
  }
});

test('every static family the install ships is read — nothing matched is dropped', () => {
  if (!listing.length) return;   // no install beside this checkout, no pins
  const matchedKeys = new Set();
  for (const name of listing) {
    for (const family of STATIC_PEOPLE_FAMILIES) {
      if (family.match.test(String(name).toUpperCase())) matchedKeys.add(family.key);
    }
  }
  assert.deepEqual(staticKinds.map((k) => k.key).sort(), [...matchedKeys].sort(),
    'a family the player\u2019s own records carry is a kind this module reports');
  // …and each is a real set of files: every name a kind lists is in the install, and every one
  // carries the extension the family reads.
  for (const kind of staticKinds) {
    assert.ok(kind.files.length > 0, `${kind.key} has at least one file`);
    for (const file of kind.files) {
      assert.match(file, /\.(IMG|CFA|DFA)$/, `${kind.key}: ${file} is a people sheet`);
      assert.ok(listing.includes(file), `${kind.key}: ${file} is not in the install`);
    }
  }
  // The reading is *reported* rather than counted: how many of Arena\u2019s static people this
  // install ships is a fact about the player\u2019s folder, and a pinned count would fail on a
  // leaner or a richer one. What must hold is that the families named above are the ones found.
  assert.ok(staticKinds.length <= STATIC_PEOPLE_FAMILIES.length);
});

test('a static figure is stood on a street cell, faces the arrival and carries no actions', () => {
  // A tiny level: a 5×5 room with a wall ring and one chasm, so the placement rule has something
  // to refuse. `streetCells` is shared with `placeTownsfolk`, which is the point — a still figure
  // and a walking one stand on the same streets.
  const width = 5;
  const depth = 5;
  const cells = [];
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const edge = row === 0 || col === 0 || row === depth - 1 || col === width - 1;
      cells.push({
        x: col, z: row,
        floor: { texture: 0, flatIndex: -1, chasm: row === 2 && col === 2 ? 'wet' : null },
        kind: edge ? 'wall' : 'air',
        sideTexture: -1, capTexture: -1, bottomTexture: -1,
        yOffset: 0, ySize: 0, facing: -1, doorKind: null, solid: edge,
        stair: null, entityFlatIndex: -1, ceiling: false, ceilingTexture: -1,
        upperLayers: 0, upperRaised: false, rawFlor: 0, rawMap1: 0, rawMap2: 0,
      });
    }
  }
  const level = { width, depth, cells, floorY: 1, cellSize: 1, spawn: { x: 1.5, y: 1, z: 1.5 } };
  const staticKindsForLevel = staticKindsFromListing(['MAN01.IMG', 'MAN02.IMG', 'KING.IMG']);
  const placed = placeStaticFolk({ level, kinds: staticKindsForLevel, seed: 7, count: 3, arrival: { row: 1, col: 1 }, minCells: 1 });
  assert.equal(placed.length, 3, 'three still figures are stood up');
  const files = new Set(staticKindsForLevel.flatMap((k) => k.files));
  for (const person of placed) {
    assert.equal(person.static, true);
    assert.equal(person.layout, 'static', 'an animator plays nothing for it');
    assert.equal(person.actions, null, 'and it has no turn, answer or death');
    assert.ok(files.has(person.file), `${person.file} is one of the family's own pictures`);
    // One picture, five angles: `viewFileFor` must answer the same file for every view, so a
    // still figure is drawn the same whichever way the player walks round it.
    assert.deepEqual([1, 2, 3, 4, 5].map((v) => person.outfit.views[v]), Array(5).fill(person.file));
    assert.ok(person.place.row >= 1 && person.place.row <= depth - 2, 'inside the walls');
    assert.ok(person.description && typeof person.description === 'string');
    // Never on the chasm cell, and never on the arrival cell itself.
    assert.ok(!(person.place.row === 2 && person.place.col === 2), 'not in the water');
    assert.ok(person.distance >= 1, 'and not standing on the player');
  }
  // Deterministic in the seed, like every other draw in `game/`: the same house, the same family.
  const again = placeStaticFolk({ level, kinds: staticKindsForLevel, seed: 7, count: 3, arrival: { row: 1, col: 1 }, minCells: 1 });
  assert.deepEqual(again.map((p) => [p.file, p.place.row, p.place.col]),
    placed.map((p) => [p.file, p.place.row, p.place.col]));
  // A family list with nothing in it stands nobody up rather than inventing a stranger.
  assert.deepEqual(placeStaticFolk({ level, kinds: [], seed: 1, count: 2 }), []);
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
  for (const key of ['MLGEN', 'MLGENT', 'FMGEN', 'FMGENW']) {
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
