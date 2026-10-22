// THE RACES OF TAMRIEL, DRAWN IN THE INSTALL'S OWN COLOURS (block B11, D-45).
//
// The owner, played side by side with the real Arena: *"in morrowind mostly dark elf npcs in skyrim
// mostly nords … all provinces should have a mix of people but mostly their race of people"*. Arena
// ships one human body and no per-race art, so `src/game/raceSkin.js` makes a race **visible as
// skin colour** by recolouring the install's own palette: the six `PAL.COL` entries the citizen
// sheets paint skin with — **229, 231, 232, 234, 235, 236**, holding `#bb9477 #aa765f #9c6854
// #7e4a3c #673b30 #5a2d24` light to dark, measured off the sheets themselves (`.scratch/raceprobe.mjs`
// decodes `MLGEN01W.CFA`, histograms its indices and reads each one's `PAL.COL` triple: 14, 18, 27,
// 55, 6 and 4 pixels) — are rescaled between a race's own two anchors.
//
// These checks hold the two halves that could silently go wrong: **the recolour moves the skin and
// nothing else** (a townsman's clothes, armour, boots and hair are the install's own bytes, exactly),
// and **a race's ramp is a ramp** (light above dark, monotone, and each race's own).
//
// The anchors themselves are this project's own reading — the later games' Tamriel, stamped in the
// module's header and in `docs/DECISIONS.md` — because Arena has no race colour table to read. So
// the checks below assert the *relations* the anchors were chosen for (which race is coolest, which
// is palest, whose green leads their red) rather than the anchors as magic numbers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseCol } from '../../src/arena/palette.js';
import { RACE_KEYS as PROVINCE_RACE_KEYS } from '../../src/game/provinceStyle.js';
import {
  ARENA_SKIN, HAIR_KEYS, KHAJIIT_COATS, KHAJIIT_FUR, KHAJIIT_FUR_SPEC, RACE_FIGURE, RACE_KEYS, RACE_SKIN,
  SKIN_LADDER, figureKindFor, hairFamilyOf, hairForPerson, hairIndicesOf, hairRampFor, hasRace, hasSkin,
  khajiitCoatFor, khajiitCoatSpec, ladderFor, parseSkinSpec, raceForPerson, raceFromPool,
  raceSheetKey, raceSkinFor, skinPaletteFor, skinSpec, catFrameRgba,
} from '../../src/game/raceSkin.js';
import { standInKindsFromListing } from '../../src/game/peopleKinds.js';

const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
const haveInstall = fs.existsSync(path.join(ARENA, 'PAL.COL'));
const noInstall = haveInstall ? false : `the install is not beside this checkout (${ARENA})`;

/** A palette of the right size, carrying Arena's own skin where the sheets carry it. */
const BASE = (() => {
  const rgb = new Uint8Array(768);
  for (let i = 0; i < 768; i++) rgb[i] = (i * 7 + 11) & 0xff;
  SKIN_LADDER.forEach((index, i) => {
    const at = index * 3;
    rgb[at] = ARENA_SKIN[i][0];
    rgb[at + 1] = ARENA_SKIN[i][1];
    rgb[at + 2] = ARENA_SKIN[i][2];
  });
  return rgb;
})();

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rampLum = (race) => ladderFor(race).map(lum);
const meanLum = (race) => mean(rampLum(race));
/** How cool a race's skin is: the mean of blue minus red across its six steps. */
const meanBlueMinusRed = (race) => mean(ladderFor(race).map(([r, , b]) => b - r));
const meanGreenMinusRed = (race) => mean(ladderFor(race).map(([r, g]) => g - r));

// ── a race drawn as a figure rather than as a skin ───────────────────────────────────────────

/**
 * **AN ARGONIAN IS A LIZARD-FOLK, NOT A GREEN MAN** (the owner, 2026-10-17).
 *
 * The palette half of D-45 answers a race the install draws no body for. Where the archive *does*
 * ship a body — `LIZARD1.CFA`…`LIZARD6.CFA`, the Lizard Man, which `peopleKinds.js` stands in for
 * the marsh's people — the figure is the race, and no ramp may be laid over it: the ``"green people"``
 * the owner refused is exactly a human sheet under an Argonian's green, and a lizard under a Dunmer's
 * ramp is the same mistake in another colour (measured in Lilmoth as `LIZARD1.CFA#darkElf`).
 */
test('the races drawn as their own figure are named, and each names a stand-in the archive ships', () => {
  assert.equal(figureKindFor('argonian'), 'ARGONIAN', 'the marsh\u2019s folk are the Lizard Man\u2019s own art');
  // **The cat is the wolf** (the owner, 2026-10-18): the snow wolf's own sheets, repainted tawny —
  // the second race drawn as a figure rather than as a skin over the human body.
  assert.equal(figureKindFor('khajiit'), 'KHAJIIT', "Elsweyr's folk are the snow wolf's art, repainted");
  for (const race of RACE_KEYS.filter((r) => r !== 'argonian' && r !== 'khajiit')) {
    assert.equal(figureKindFor(race), null, `${race} is a skin, drawn on Arena\u2019s own body`);
  }
  assert.equal(figureKindFor(null), null);
  assert.equal(figureKindFor('dragon'), null, 'a race nobody knows is no figure at all');
  // The key names a stand-in `peopleKinds.js` really carries, and the figure it draws is the lizard's.
  const kinds = standInKindsFromListing([
    'LIZARD1.CFA', 'LIZARD2.CFA', 'LIZARD3.CFA', 'LIZARD4.CFA', 'LIZARD5.CFA', 'LIZARD6.CFA',
    'SWOLF01.CFA', 'SWOLF02.CFA', 'SWOLF03.CFA', 'SWOLF04.CFA', 'SWOLF05.CFA', 'SWOLF06.CFA',
  ]);
  const artOf = { ARGONIAN: 'LIZARD', KHAJIIT: 'SWOLF0' };
  for (const [race, key] of Object.entries(RACE_FIGURE)) {
    const kind = kinds.find((k) => k.key === key);
    assert.ok(kind, `${race} is drawn by the ${key} stand-in`);
    assert.ok(String(kind.views[1]).startsWith(artOf[key]), `${race}: the stand-in is its own art (${kind.views[1]})`);
    for (const view of [1, 2, 3, 4, 5]) {
      assert.ok(kind.views[view], `${race}: the figure has a sheet for view ${view}`);
    }
    assert.ok(kind.actions?.die, `${race}: and a death, which is the last sheet`);
  }
  // …and a race with a figure still keeps a skin entry: the palette is what the race would be
  // painted with if the art were the body\u2019s, which is the honest half of an absence.
  assert.ok(hasRace('argonian'));
  assert.ok(hasRace('khajiit'));
});

// ── the cat-folk's coats ────────────────────────────────────────────────────────────────────

/**
 * **A STREET OF CATS IS NOT ONE CAT** (the owner, 2026-10-18: *"focus on khajeet npcs"*).
 *
 * One repainted wolf gave every Khajiit in Elsweyr the same coat. The coats are the wolf's own
 * six-entry ramp (`PAL.COL` 16…21) in four colours, each a sheet key, so the art's bytes stay the
 * install's and the crowd is a people rather than a repeated figure.
 */
test('the Khajiit is painted per pixel, not as six flat palette steps', () => {
  // A 24×24 coat field of one source shade: a palette recolour can only ever answer one colour
  // for it, while the cat paint has to put spots and a faint underside on the same fur. This is
  // the owner's \"really low quality\" report as a check rather than a screenshot.
  const width = 24, height = 24;
  const indices = new Uint8Array(width * height).fill(16);
  const rgba = catFrameRgba(indices, width, height, { rgb: BASE }, 'tawny');
  const seen = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    seen.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  }
  assert.ok(seen.size >= 8, `one source shade became ${seen.size} cat colours`);
});

test('the markings are sparse spots, not bars across the body', () => {
  // **The first paint was bars, and the owner read it as a tiger.** A cat is ticked and rosetted:
  // the marked fraction is a minority of the coat, and no row of it is mostly marked (a bar would
  // make a whole row dark at once).
  const big = 64;
  const field = catFrameRgba(new Uint8Array(big * big).fill(16), big, big, { rgb: BASE }, 'tawny');
  const L = (x, y) => {
    const o = (y * big + x) * 4;
    return 0.2126 * field[o] + 0.7152 * field[o + 1] + 0.0722 * field[o + 2];
  };
  let top = 0;
  for (let y = 0; y < big; y++) for (let x = 0; x < big; x++) top = Math.max(top, L(x, y));
  const dark = (x, y) => L(x, y) < top * 0.85;
  let marked = 0;
  let worstRow = 0;
  for (let y = 0; y < big; y++) {
    let row = 0;
    for (let x = 0; x < big; x++) if (dark(x, y)) row++;
    marked += row;
    worstRow = Math.max(worstRow, row / big);
  }
  const share = marked / (big * big);
  assert.ok(share > 0.02, `the coat carries markings (${(share * 100).toFixed(1)}% marked)`);
  assert.ok(share < 0.4, `the markings are a minority of the coat, not a tiger (${(share * 100).toFixed(1)}% marked)`);
  assert.ok(worstRow < 0.6, `no row is a bar (the most marked row is ${(worstRow * 100).toFixed(0)}% marked)`);
  // The eyes are the owner's black, not the wolf's blue; the collar and muzzle are still not
  // the coat. The renderer's buffer is bottom-up, so source row 0 lands in the last output row.
  const width2 = 24, height2 = 24;
  const mixed = new Uint8Array(width2 * height2).fill(16);
  mixed[3 * width2 + 5] = 63;
  mixed[4 * width2 + 5] = 62;
  const painted = catFrameRgba(mixed, width2, height2, { rgb: BASE }, 'tawny');
  const eye = ((height2 - 1 - 3) * width2 + 5) * 4;
  const rim = ((height2 - 1 - 4) * width2 + 5) * 4;
  assert.deepEqual([...painted.slice(eye, eye + 3)], [18, 15, 13]);
  assert.deepEqual([...painted.slice(rim, rim + 3)], [18, 15, 13], 'the eye\u2019s rim is black too');
  assert.notDeepEqual([...painted.slice(eye, eye + 3)], [BASE[63 * 3], BASE[63 * 3 + 1], BASE[63 * 3 + 2]]);
  assert.equal(painted[eye + 3], 255);
});

test('the Khajiit has more than one coat, each a whole ramp over the wolf\u2019s own six entries', () => {
  assert.deepEqual(Object.keys(KHAJIIT_COATS).sort(), ['black', 'grey', 'sandy', 'tawny']);
  const wolf = KHAJIIT_FUR.map(([index]) => index);
  for (const [coat, ramp] of Object.entries(KHAJIIT_COATS)) {
    assert.deepEqual(ramp.map(([index]) => index), wolf, `${coat}: the wolf's own six entries, in order`);
    for (const [, triple] of ramp) {
      assert.equal(triple.length, 3, `${coat}: one RGB triple per entry`);
      for (const channel of triple) assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255, `${coat}: a byte`);
    }
  }
  // The tawny coat is the owner's orange, and the others really are different colours: the six
  // steps alternate light/dark so each coat reads as stripes.
  assert.deepEqual(KHAJIIT_COATS.tawny, KHAJIIT_FUR);
  assert.ok(KHAJIIT_COATS.tawny[0][1][0] > KHAJIIT_COATS.tawny[0][1][2], 'tawny is orange (red leads blue)');
  assert.ok(KHAJIIT_COATS.grey[0][1][0] < 0xf0 && KHAJIIT_COATS.grey[0][1][2] > 0xd0, 'grey is silvered');
  assert.ok(KHAJIIT_COATS.black[0][1][0] < 0x90, 'the black coat is dark at its hilight too');
  for (const coat of Object.keys(KHAJIIT_COATS)) {
    const ramp = KHAJIIT_COATS[coat];
    for (let i = 2; i < ramp.length; i += 2) {
      const light = ramp[i - 2][1][0] + ramp[i - 2][1][1] + ramp[i - 2][1][2];
      const dark = ramp[i - 1][1][0] + ramp[i - 1][1][1] + ramp[i - 1][1][2];
      assert.ok(light > dark, `${coat}: step ${i - 2} is lighter than ${i - 1} (the stripe)`);
    }
  }
});

test('a coat is its own sheet key, and the bare spec still means the tawny cat', () => {
  assert.equal(khajiitCoatSpec(), KHAJIIT_FUR_SPEC);
  assert.equal(khajiitCoatSpec('tawny'), KHAJIIT_FUR_SPEC, 'the first spec every page already wrote');
  assert.equal(khajiitCoatSpec('black'), `${KHAJIIT_FUR_SPEC}:black`);
  assert.equal(khajiitCoatSpec('moon'), KHAJIIT_FUR_SPEC, 'a coat nobody knows is the tawny one');
  assert.deepEqual(parseSkinSpec(`${KHAJIIT_FUR_SPEC}:sandy`), { race: null, hair: null, fur: 'sandy' });
  assert.deepEqual(parseSkinSpec(KHAJIIT_FUR_SPEC), { race: null, hair: null, fur: 'tawny' });
  assert.equal(hasSkin(`${KHAJIIT_FUR_SPEC}:grey`), true);
  assert.equal(raceSheetKey(`${KHAJIIT_FUR_SPEC}:grey`, 'SWOLF01.CFA'), 'SWOLF01.CFA#khajiitFur:grey');
  // …and the palette is the coat's, not the old single fur's.
  const base = new Uint8Array(768);
  const black = skinPaletteFor(`${KHAJIIT_FUR_SPEC}:black`, base);
  const tawny = skinPaletteFor(KHAJIIT_FUR_SPEC, base);
  assert.notDeepEqual([...black.slice(16 * 3, 16 * 3 + 3)], [...tawny.slice(16 * 3, 16 * 3 + 3)],
    'two coats are two palettes');
  assert.deepEqual([...black.slice(16 * 3, 16 * 3 + 3)], [...KHAJIIT_COATS.black[0][1]]);
});

test('a cat\u2019s coat is its own, drawn from the same identity as its face, and tawny leads', () => {
  const coats = {};
  for (let row = 1; row <= 12; row++) {
    for (let col = 1; col <= 12; col++) {
      const coat = khajiitCoatFor({ seed: 77, row, col, key: 'KHAJIIT' });
      assert.ok(Object.hasOwn(KHAJIIT_COATS, coat), `(${row},${col}) is a coat the table has`);
      assert.equal(coat, khajiitCoatFor({ seed: 77, row, col, key: 'KHAJIIT' }), 'the same cat keeps it');
      coats[coat] = (coats[coat] ?? 0) + 1;
    }
  }
  assert.ok(Object.keys(coats).length >= 3, `a street holds several coats: ${JSON.stringify(coats)}`);
  const total = Object.values(coats).reduce((a, b) => a + b, 0);
  assert.ok((coats.tawny ?? 0) / total >= 0.4, `tawny is the common cat (${coats.tawny}/${total})`);
});

// ── the ladder is the install's own ─────────────────────────────────────────────────────────

test('the skin ladder is six of the install\u2019s palette entries, ascending, light to dark', () => {
  assert.deepEqual([...SKIN_LADDER], [229, 231, 232, 234, 235, 236]);
  for (let i = 1; i < SKIN_LADDER.length; i++) {
    assert.ok(SKIN_LADDER[i] > SKIN_LADDER[i - 1], `entry ${i} steps up from the one before`);
  }
  // The run is one material's shading: every step is darker than the one above it, and the six
  // live inside a narrow band of the table (not spread across the image's whole range).
  for (let i = 1; i < ARENA_SKIN.length; i++) {
    assert.ok(lum(ARENA_SKIN[i]) < lum(ARENA_SKIN[i - 1]),
      `Arena's own step ${i} is darker than step ${i - 1} (${lum(ARENA_SKIN[i]).toFixed(1)} < ${lum(ARENA_SKIN[i - 1]).toFixed(1)})`);
  }
  assert.ok(SKIN_LADDER[SKIN_LADDER.length - 1] - SKIN_LADDER[0] <= 16, 'the ladder is one contiguous run of the palette');
  assert.ok(Object.isFrozen(SKIN_LADDER) && Object.isFrozen(ARENA_SKIN));
});

test('the ladder is exactly what the install\u2019s PAL.COL holds at those indices', { skip: noInstall }, () => {
  // The provenance pin: the module's six triples are the file's own bytes, not typed out by hand.
  const col = parseCol(new Uint8Array(fs.readFileSync(path.join(ARENA, 'PAL.COL'))));
  SKIN_LADDER.forEach((index, i) => {
    const at = index * 3;
    assert.deepEqual([col.rgb[at], col.rgb[at + 1], col.rgb[at + 2]], [...ARENA_SKIN[i]],
      `PAL.COL[${index}] is the ladder's step ${i}`);
  });
});

// ── the recolour moves the skin and nothing else ────────────────────────────────────────────

test('a recolour rewrites the six skin entries and leaves every other byte alone', () => {
  const before = Uint8Array.from(BASE);
  const out = skinPaletteFor('darkElf', BASE);
  assert.ok(out instanceof Uint8Array, 'a recoloured palette is a new table');
  assert.equal(out.length, 768);
  assert.notEqual(out, BASE, 'and not the table it was made from');

  const skinAt = new Set(SKIN_LADDER.flatMap((index) => [index * 3, index * 3 + 1, index * 3 + 2]));
  let moved = 0;
  for (let i = 0; i < 768; i++) {
    if (skinAt.has(i)) { moved++; continue; }
    assert.equal(out[i], before[i], `byte ${i} (index ${Math.floor(i / 3)}) is the install\u2019s own`);
  }
  assert.equal(moved, SKIN_LADDER.length * 3, 'exactly the ladder\u2019s eighteen bytes moved');
  // …and the ones that moved are the race's ramp, not something nearby.
  ladderFor('darkElf').forEach((triple, i) => {
    const at = SKIN_LADDER[i] * 3;
    assert.deepEqual([out[at], out[at + 1], out[at + 2]], triple, `entry ${SKIN_LADDER[i]} is the Dark Elf's`);
  });
  assert.deepEqual([...BASE], [...before], 'and the palette handed in is untouched');
});

test('the recolour takes any 768-byte table, and copies it rather than aliasing it', () => {
  const asArray = Array.from(BASE);
  const fromArray = skinPaletteFor('nord', asArray);
  const fromTyped = skinPaletteFor('nord', BASE);
  assert.deepEqual([...fromArray], [...fromTyped], 'a plain array and a typed one answer the same');
  fromArray[0] = 255;
  assert.deepEqual([...skinPaletteFor('nord', BASE)], [...fromTyped], 'mutating the copy changes nothing later');
});

// ── a race's ramp ──────────────────────────────────────────────────────────────────────────

test('every race has a ramp of its own, and none of them is Arena\u2019s own body', () => {
  const seen = new Map();
  for (const race of RACE_KEYS) {
    const ramp = ladderFor(race);
    assert.equal(ramp.length, SKIN_LADDER.length, `${race}: one colour per ladder step`);
    for (const triple of ramp) {
      assert.equal(triple.length, 3);
      for (const channel of triple) {
        assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255, `${race}: ${channel} is a byte`);
      }
    }
    assert.notDeepEqual(ramp, [...ARENA_SKIN], `${race} is not simply Arena\u2019s townsman`);
    assert.equal(ramp[0].join(), raceSkinFor(race).light.join(), `${race}: the light end is its anchor`);
    assert.equal(ramp[ramp.length - 1].join(), raceSkinFor(race).dark.join(), `${race}: the dark end too`);
    const key = JSON.stringify(ramp);
    assert.ok(!seen.has(key), `${race} and ${seen.get(key)} would be the same people`);
    seen.set(key, race);
  }
  assert.deepEqual([...RACE_KEYS], ['breton', 'redguard', 'nord', 'darkElf', 'highElf', 'woodElf', 'khajiit', 'argonian', 'imperial']);
  assert.ok(Object.isFrozen(RACE_SKIN));
});

test('\u201Call provinces should have a mix of people\u201D: the ramps are distinct in the ways the anchors asked for', () => {
  for (const race of RACE_KEYS) {
    // **A ramp is a ramp**: Arena's own light-to-dark order survives the rescale, which is what
    // keeps a pixel figure reading as a body with shading rather than a flat shape.
    const steps = rampLum(race);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i] < steps[i - 1], `${race}: step ${i} is darker than step ${i - 1}`);
    }
    assert.ok(steps[0] - steps[steps.length - 1] > 30, `${race}: the ramp has real range (${(steps[0] - steps[steps.length - 1]).toFixed(1)})`);
  }

  // **The Dunmer are the cool people and the only cool one**: their ramp is the sole one whose blue
  // leads its red on balance, which is what makes Morrowind's street read as ash grey-blue.
  const coolest = RACE_KEYS.slice().sort((a, b) => meanBlueMinusRed(b) - meanBlueMinusRed(a))[0];
  assert.equal(coolest, 'darkElf', `the coolest ramp is the Dark Elf (${meanBlueMinusRed('darkElf').toFixed(1)})`);
  assert.ok(meanBlueMinusRed('darkElf') > 0, 'and it is cool rather than merely least warm');
  for (const race of RACE_KEYS.filter((r) => r !== 'darkElf')) {
    assert.ok(meanBlueMinusRed(race) < 0, `${race} stays warm, as every other people here are`);
  }

  // **The Argonian scales are green above red**, which no name bank can say.
  assert.ok(meanGreenMinusRed('argonian') > 10, `Argonian green leads red (${meanGreenMinusRed('argonian').toFixed(1)})`);
  for (const race of RACE_KEYS.filter((r) => r !== 'argonian')) {
    assert.ok(meanGreenMinusRed(race) < meanGreenMinusRed('argonian'), `${race} is less green than an Argonian`);
  }

  // **The Nord is the pale one and the Redguard the dark one** — the two ends of the north-south
  // reading, and the reason Skyrim and Hammerfell do not read as the same street.
  const lightest = RACE_KEYS.slice().sort((a, b) => meanLum(b) - meanLum(a))[0];
  const darkest = RACE_KEYS.slice().sort((a, b) => meanLum(a) - meanLum(b))[0];
  assert.equal(lightest, 'nord', `the palest is the Nord (${meanLum('nord').toFixed(1)})`);
  assert.equal(darkest, 'redguard', `the darkest is the Redguard (${meanLum('redguard').toFixed(1)})`);
  assert.ok(meanLum('nord') > 150, 'and a Nord is pale in absolute terms');
  assert.ok(meanLum('redguard') < 90, 'as a Redguard is dark in absolute terms');
  assert.equal(
    RACE_KEYS.slice().sort((a, b) => lum(ladderFor(b)[0]) - lum(ladderFor(a)[0]))[0], 'nord',
    'the Nord\u2019s light end is the brightest light end of all');
});

// ── and what it refuses ────────────────────────────────────────────────────────────────────

test('an unknown race, or something that is not a palette, answers nothing', () => {
  assert.equal(skinPaletteFor('nope', BASE), null, 'a race the table does not know');
  assert.equal(skinPaletteFor('Nord', BASE), null, 'and the keys are the corpus\u2019s own spelling');
  assert.equal(skinPaletteFor('nord', null), null);
  assert.equal(skinPaletteFor('nord', undefined), null);
  assert.equal(skinPaletteFor('nord', new Uint8Array(700)), null, 'a table that is not 768 bytes');
  assert.equal(skinPaletteFor('nord', []), null);
  assert.equal(ladderFor('nope'), null);
  assert.equal(raceSkinFor('nope'), null);
  assert.equal(hasRace('nord'), true);
  assert.equal(hasRace('Nord'), false);
  assert.equal(hasRace(undefined), false);
  assert.equal(hasRace(7), false);
});

test('the race is answered in the spelling the player\u2019s own record carries, not only the pool\u2019s', () => {
  // The game carries a race in two spellings: a province's crowd holds the pool's own key
  // (`argonian`, `provinceStyle.js`) and the player's record holds the display name
  // (`game/character.js`'s `RACES`: *Argonian*, which is what `player.race` is). The table is
  // keyed in the lowercase and the lookup folds what it is given, so "an Argonian is drawn as
  // the Lizard Man" is one law for the player and for the street rather than two that agree by
  // accident — the player's figure is loaded from the same `RACE_FIGURE` entry the crowd reads.
  assert.equal(figureKindFor('Argonian'), 'ARGONIAN', 'the player\u2019s own spelling answers');
  assert.equal(figureKindFor('ARGONIAN'), 'ARGONIAN', 'and its shout');
  assert.equal(figureKindFor('Dark Elf'), null, 'a display name of a race with no figure is no figure');
  assert.equal(figureKindFor(7), null, 'a number is no race');
});

test('the answer is the same every time, and callers cannot poison it', () => {
  const first = skinPaletteFor('khajiit', BASE);
  const second = skinPaletteFor('khajiit', BASE);
  assert.deepEqual([...first], [...second]);
  const ramp = ladderFor('khajiit');
  ramp[0][0] = 0;
  ramp.push([9, 9, 9]);
  assert.deepEqual(ladderFor('khajiit'), ladderFor('khajiit'), 'a mutated copy changes nothing');
  assert.equal(ladderFor('khajiit').length, SKIN_LADDER.length);
});

test('every race the project names has a skin, and each note says where its colour came from', () => {
  // The corpus's eight banks (`game/names.js`) plus the one race it has no bank for.
  for (const race of ['breton', 'redguard', 'nord', 'darkElf', 'highElf', 'woodElf', 'khajiit', 'imperial', 'argonian']) {
    assert.ok(hasRace(race), `${race} has a skin`);
    // The table holds the hex a reader can check by eye; `raceSkinFor` hands the seam triples.
    const spec = RACE_SKIN[race];
    assert.match(spec.light, /^#[0-9a-f]{6}$/i);
    assert.match(spec.dark, /^#[0-9a-f]{6}$/i);
    const skin = raceSkinFor(race);
    assert.ok(lum(skin.light) > lum(skin.dark), `${race}: light is above dark`);
    assert.match(spec.note, /later games/i, `${race}\u2019s note names its source`);
    assert.ok(spec.note.length > 40, `${race}\u2019s note says what it is`);
  }
  assert.equal(RACE_KEYS.length, 9);
});

/**
 * The two race tables must stay keyed the same way: `provinceStyle.js` draws a province's street
 * from `raceMix` over its own `RACE_KEYS`, and `raceSkin.js` is the only thing that can paint
 * one. A key in one and not the other is a person nobody can draw — the drift this asserts
 * against, rather than a prose promise in two headers.
 */
test('the province table and the skin table name the same races, and each can paint the other', () => {
  assert.deepEqual([...RACE_KEYS].sort(), [...PROVINCE_RACE_KEYS].sort());
  for (const race of PROVINCE_RACE_KEYS) assert.ok(hasRace(race), `${race} has a skin`);
});

// ── who one person is, and the key they are drawn under ────────────────────────────────────

const MIX = ['darkElf', 'darkElf', 'darkElf', 'darkElf', 'darkElf', 'imperial', 'nord', 'argonian'];

test('the province’s own race is the one a street is mostly made of', () => {
  // An eighth of the draw each, so the pool's own weights decide the share rather than a bias in
  // the pick: five in eight must come out Dark Elf on a Morrowind mix.
  const counts = new Map();
  for (let i = 0; i < 8000; i++) {
    const race = raceFromPool(MIX, i / 8000);
    counts.set(race, (counts.get(race) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), ['argonian', 'darkElf', 'imperial', 'nord']);
  // The share a race gets **is its weight**: five of the eight entries are Dark Elf, so half the
  // street is, and the three minorities an eighth each. A draw that ignored the weights would
  // fail this, and so would one that ignored the order.
  const N = 8000;
  for (const [race, n] of counts) {
    const expected = (MIX.filter((r) => r === race).length / MIX.length) * N;
    assert.ok(Math.abs(n - expected) <= 2, `${race}: ${n} of ${N}, expected ${expected}`);
  }
  // The pick is a function of the draw alone, and its ends are the pool's ends.
  assert.equal(raceFromPool(MIX, 0), 'darkElf');
  assert.equal(raceFromPool(MIX, 0.999_999), 'argonian');
  assert.equal(raceFromPool([], 0.5), null);
  assert.equal(raceFromPool(null, 0.5), null);
  // A pool naming a race nobody can paint is not a race (the province table cannot do this, and
  // this is the check that would catch it if it ever did).
  assert.equal(raceFromPool(['orc'], 0.5), null);
});

test('a person’s race is a function of their own cell and outfit, and never of time or order', () => {
  const one = { pool: MIX, seed: 20232, row: 47, col: 98, key: '0LTR' };
  const first = raceForPerson(one);
  assert.ok(hasRace(first), `a race, got ${first}`);
  assert.equal(raceForPerson({ ...one }), first, 'the same figure is the same race');
  // The same cell with a different sheet is not the same person, and neither is a neighbour.
  assert.notEqual(`${raceForPerson({ ...one, key: '1LTR' })}|${raceForPerson({ ...one, row: 48 })}`, `${first}|${first}`);
  // Across a whole street the mix follows the province's weights (Morrowind's own is 5 in 8).
  const street = [];
  for (let row = 0; row < 12; row++) for (let col = 0; col < 12; col++) street.push(raceForPerson({ ...one, row, col, key: `K${row % 3}` }));
  const dunmer = street.filter((r) => r === 'darkElf').length;
  assert.ok(dunmer > street.length * 0.4 && dunmer < street.length * 0.85, `a Morrowind street is mostly Dunmer: ${dunmer} of ${street.length}`);
});

test('a raced sheet is the install’s own file under a suffixed key, and an unraced one is untouched', () => {
  assert.equal(raceSheetKey('darkElf', 'MLGEN01W.CFA'), 'MLGEN01W.CFA#darkElf');
  for (const race of [null, undefined, 'orc', '']) assert.equal(raceSheetKey(race, 'MLGEN01W.CFA'), 'MLGEN01W.CFA');
  assert.equal(raceSheetKey('nord', null), null);
  // Two races on one file are two keys, which is what keeps two streets' textures apart.
  assert.notEqual(raceSheetKey('nord', 'MLGEN01W.CFA'), raceSheetKey('breton', 'MLGEN01W.CFA'));
});

// ── the head: hair colour, and whose entries it is ─────────────────────────────────────────
//
// The owner, 2026-10-17: *"you could also have the blonde hair in npcs change color to a random
// hair color like you do with the skin color to make more npc variety"*. The module reads the hair
// entries off each **sheet** (`hairIndicesOf`) instead of a male/female table, because measured
// against the install the same run is hair on one family and a dress on another
// (`.scratch/hair5.mjs`: `FMGEN01.CFA` paints 130–133 on rows 0–16 and 141–145 on rows 18–47, and
// `BABE01.CFA` paints 141–145 over its whole body). The checks below hold that law: a sheet's head
// is what gets repainted, and nothing below the head line moves.

/** A sheet `w × h` whose head band paints `headIndices` and whose body paints `bodyIndices`. */
function fakeSheet(w, h, headIndices, bodyIndices) {
  const indices = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const set = y < Math.round(h * 0.15) ? headIndices : bodyIndices;
    for (let x = 0; x < w; x++) indices[y * w + x] = set[(x + y) % set.length];
  }
  return { width: w, height: h, frames: [{ indices }] };
}

test('which entries are a sheet’s hair is the sheet’s own answer, not its sex', () => {
  const man = fakeSheet(20, 100, [130, 131, 132, 133], [229, 234]);
  assert.deepEqual(hairIndicesOf(man), [130, 131, 132, 133]);
  // A woman of the older family: her hair is the *men's* run and her dress is the women's run.
  // Recolouring by the ladder alone painted her dress and her face the same way (the owner's
  // "they change their clothes when I speak to them").
  const woman = fakeSheet(20, 100, [130, 132], [141, 142, 143, 144, 145]);
  assert.deepEqual(hairIndicesOf(woman), [130, 132]);
  // A figure whose whole body is that run — `BABE01.CFA`'s red dress — has no hair at all.
  const dress = fakeSheet(20, 100, [141, 142, 143], [141, 142, 143]);
  assert.deepEqual(hairIndicesOf(dress), []);
  // A helmeted or hooded figure paints none of the candidates either.
  assert.deepEqual(hairIndicesOf(fakeSheet(20, 100, [32, 33], [229, 234])), []);
  assert.deepEqual(hairIndicesOf(null), []);
  assert.deepEqual(hairIndicesOf({ width: 0, height: 0, frames: [] }), []);
});

test('the walking families are the ones the changer paints, and the watch is not', () => {
  // The owner, 2026-10-18: *"MLGEN01W … GUARD01 … FMGENW01 … BABE01 … those are … sprites of
  // moving npcs … and this ones need the yellow hair some of them have to be affected by the hair
  // changer"*. A named sheet is asked only about its own family's run.
  assert.deepEqual(hairFamilyOf('MLGEN01W.CFA')?.run, [128, 129, 130, 131, 132, 133, 134, 135, 136]);
  assert.equal(hairFamilyOf('FMGEN01.CFA')?.key, 'FMGEN');
  assert.equal(hairFamilyOf('FMGENW01.CFA')?.key, 'FMGENW', 'the W sheet is its own family, not the generic’s');
  assert.equal(hairFamilyOf('BABE01.CFA')?.key, 'BABE0');
  assert.equal(hairFamilyOf('GUARD01.CFA')?.key, 'GUARD0');
  // **The watch's gold is hair and trim at once** (measured 2026-10-18): `GUARD01`'s 212 paints 140
  // pixels above the head line and 168 below it, and 217 paints the mane **and** the greaves. The
  // owner: *"GUARD01CFA … dont change hair color how they should"* — so the family takes its whole
  // gold run, boots and belt included, rather than leaving the mane two-tone.
  assert.deepEqual(hairFamilyOf('GUARD01.CFA')?.run, [190, 204, 205, 209, 211, 212, 213, 214, 215, 216, 217, 218]);
  assert.equal(hairFamilyOf('GUARD01.CFA')?.whole, true);
  for (const name of ['KING.IMG', 'MAN01.DFA', 'MLGEN01F.CFA', null, '']) {
    assert.equal(hairFamilyOf(name), null, `${name} belongs to no walking family`);
  }

  // The golds are the blonde head — the owner's yellow hair — and they are painted only on it.
  const babes = fakeSheet(20, 100, [212, 214, 215, 216, 217, 218], [229, 234, 148]);
  assert.deepEqual(hairIndicesOf(babes, { name: 'BABE01.CFA' }), [212, 214, 215, 216, 217, 218]);
  // **The other woman's gold falls to her shoulders** and is in her run; the head band would
  // reject it, so her family is tested by the feet instead (`raceSkin.js`'s `long`).
  const longHead = fakeSheet(20, 100, [192, 194, 195], [229, 234]);
  assert.deepEqual(hairIndicesOf(longHead, { name: 'FMGEN01.CFA' }), [192, 194, 195]);
  // …while a commoner's tunic, painted on the torso and never on the head, is not hair.
  const tunic = fakeSheet(20, 100, [229, 234], [140, 141, 142]);
  assert.deepEqual(hairIndicesOf(tunic, { name: '04UNAWLK.CFA' }), []);
  const man = fakeSheet(20, 100, [130, 131, 132, 133], [229, 234]);
  assert.deepEqual(hairIndicesOf(man, { name: 'MLGEN01W.CFA' }), [130, 131, 132, 133]);
  assert.deepEqual(hairIndicesOf(man, { name: 'MLGEN01T.CFA' }), [130, 131, 132, 133]);
  assert.deepEqual(hairIndicesOf(man, { name: 'FMGEN01.CFA' }), [130, 131, 132, 133]);
  // A woman of the W family paints the dark-auburn run instead, and her 130s are not hair.
  const wife = fakeSheet(20, 100, [141, 142, 143, 144], [229, 234, 130]);
  assert.deepEqual(hairIndicesOf(wife, { name: 'FMGENW01.CFA' }), [141, 142, 143, 144]);
  // **The watch's gold is the mane**, and a dark entry it never paints is not (142 is the helm's
  // shadow, 51 dark cloth — neither is in the family's run).
  const watch = fakeSheet(20, 100, [142, 51], [229, 234]);
  assert.deepEqual(hairIndicesOf(watch, { name: 'GUARD01.CFA' }), []);
  const gold = fakeSheet(20, 100, [218, 107], [229, 234]);
  assert.deepEqual(hairIndicesOf(gold, { name: 'GUARD05.CFA' }), [218]);
  // An unnamed sheet keeps the union of the walking runs, which is the fallback and not the law.
  assert.deepEqual(hairIndicesOf(fakeSheet(20, 100, [218], [229])), [218]);
});

test('a hair colour is a ramp over the entries the sheet has, light above dark', () => {
  for (const hair of HAIR_KEYS) {
    const ramp = hairRampFor(hair, 4);
    assert.equal(ramp.length, 4, `${hair} fills four entries`);
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(lum(ramp[i]) < lum(ramp[i - 1]), `${hair} gets darker down the ladder`);
    }
    assert.deepEqual(hairRampFor(hair, 1), [ramp[0]], 'one entry takes the light end');
  }
  assert.equal(hairRampFor('plaid', 4), null);
  assert.equal(hairRampFor('blonde', 0), null);
  // The set is the variety the owner asked for: several heads, not one.
  assert.ok(HAIR_KEYS.length >= 4);
  const lums = HAIR_KEYS.map((h) => lum(hairRampFor(h, 1)[0]));
  assert.ok(Math.max(...lums) - Math.min(...lums) > 80, 'the set spans fair and dark hair');
});

test('a skin spec carries a race and a head, and a palette writes both only where it is told', () => {
  assert.equal(skinSpec('darkElf', 'blonde'), 'darkElf+blonde');
  assert.equal(skinSpec('nord', null), 'nord');
  assert.equal(skinSpec(null, 'blonde'), '+blonde', 'hair alone is still a head this table can paint');
  assert.equal(skinSpec('nord', 'plaid'), 'nord', 'an unknown hair colour is dropped, not fatal');
  assert.deepEqual(parseSkinSpec('darkElf+blonde'), { race: 'darkElf', hair: 'blonde' });
  assert.deepEqual(parseSkinSpec('nord'), { race: 'nord', hair: null });
  assert.deepEqual(parseSkinSpec('Nord'), { race: null, hair: null }, 'the keys keep their spelling');
  assert.deepEqual(parseSkinSpec(null), { race: null, hair: null });

  const hairIndices = [130, 131, 132, 133];
  const out = skinPaletteFor('darkElf+blonde', BASE, { hairIndices });
  const base = skinPaletteFor('darkElf', BASE);
  // The skin moved exactly as it does without a head…
  SKIN_LADDER.forEach((index, i) => {
    assert.deepEqual([...out.slice(index * 3, index * 3 + 3)], [...base.slice(index * 3, index * 3 + 3)], `skin entry ${index}`);
  });
  // …and only the four hair entries moved on top of it.
  const blonde = hairRampFor('blonde', hairIndices.length);
  hairIndices.forEach((index, i) => {
    assert.deepEqual([...out.slice(index * 3, index * 3 + 3)], [...blonde[i]], `hair entry ${index}`);
  });
  // Everything else is the install's own byte for byte: clothes, armour, boots.
  const touched = new Set([...SKIN_LADDER, ...hairIndices]);
  for (let i = 0; i < 768; i++) {
    if (!touched.has(Math.floor(i / 3))) assert.equal(out[i], BASE[i], `byte ${i} (entry ${Math.floor(i / 3)}) untouched`);
  }
  // A head with no entries named paints nothing extra, and an unknown spec is still null.
  assert.deepEqual([...skinPaletteFor('nord+black', BASE, { hairIndices: [] })], [...skinPaletteFor('nord', BASE)]);
  assert.equal(skinPaletteFor('plaid', BASE), null);
  // **And a hair colour paints on its own** — the owner's blonde head in a place whose province
  // the table does not know (`+blonde`): the six skin entries are the install's own, and only
  // the hair run moves.
  const hairOnly = skinPaletteFor('+blonde', BASE, { hairIndices });
  SKIN_LADDER.forEach((index) => {
    assert.deepEqual([...hairOnly.slice(index * 3, index * 3 + 3)], [...BASE.slice(index * 3, index * 3 + 3)], `skin entry ${index} untouched`);
  });
  hairIndices.forEach((index, i) => {
    assert.deepEqual([...hairOnly.slice(index * 3, index * 3 + 3)], [...hairRampFor('blonde', hairIndices.length)[i]], `hair entry ${index}`);
  });
});

test('a person’s hair is drawn from the same identity as their race, and a street is not one head', () => {
  const one = { seed: 7719, row: 12, col: 41, key: '0LTR' };
  const first = hairForPerson(one);
  assert.ok(HAIR_KEYS.includes(first), `a hair colour, got ${first}`);
  assert.equal(hairForPerson({ ...one }), first, 'the same figure keeps the same head');
  // Across a street, the six colours are all used — the variety is the point.
  const heads = new Set();
  for (let row = 0; row < 20; row++) for (let col = 0; col < 20; col++) heads.add(hairForPerson({ ...one, row, col }));
  assert.equal(heads.size, HAIR_KEYS.length, `every colour on a street: ${[...heads].join(', ')}`);
  // And the head is not the face: the two draws are independent enough that a street is not
  // "every Dunmer blonde".
  const pairs = new Set();
  for (let row = 0; row < 20; row++) for (let col = 0; col < 20; col++) pairs.add(`${raceForPerson({ ...one, pool: ['darkElf', 'nord'], row, col })}|${hairForPerson({ ...one, row, col })}`);
  assert.ok(pairs.size >= 8, `heads and faces vary together: ${pairs.size} pairs`);
  assert.equal(hairForPerson(null), null);
});

test('a sheet key carries the head as well as the face', () => {
  assert.equal(raceSheetKey('darkElf+blonde', 'MLGEN01W.CFA'), 'MLGEN01W.CFA#darkElf+blonde');
  assert.notEqual(raceSheetKey('darkElf+blonde', 'MLGEN01W.CFA'), raceSheetKey('darkElf+brown', 'MLGEN01W.CFA'));
  // **A head does not need a face** (2026-10-18): a street whose province the table does not
  // know still has heads to vary, and `+blonde` is the spec that says so.
  assert.equal(raceSheetKey('+blonde', 'MLGEN01W.CFA'), 'MLGEN01W.CFA#+blonde');
  assert.equal(hasSkin('+blonde'), true);
  assert.equal(skinSpec(null, 'blonde'), '+blonde');
  assert.equal(parseSkinSpec('+blonde').race, null);
  assert.equal(parseSkinSpec('+blonde').hair, 'blonde');
});

// ── and the same law against the real sheets ──────────────────────────────────────────────

test('the install’s own sheets report their hair, and the dress is not hair', { skip: noInstall }, async () => {
  const { parseBsa } = await import('../../src/arena/bsaArchive.js');
  const { parseCfa } = await import('../../src/arena/cfa.js');
  const bsa = parseBsa(new Uint8Array(fs.readFileSync(path.join(ARENA, 'GLOBAL.BSA'))), 'GLOBAL.BSA');
  // Asked **by name**, which is the law: the family decides the run the sheet is asked about
  // (`HAIR_FAMILIES`), so an unnamed sheet answers `HAIR_CANDIDATES`' union and a named one its own.
  const hairOf = (name) => hairIndicesOf(parseCfa(bsa.get(name), name), { name });
  assert.deepEqual(hairOf('MLGEN01W.CFA'), [130, 131, 132, 133], 'the town’s man: his head is rows 0–14');
  assert.deepEqual(hairOf('FMGENW01.CFA'), [141, 142, 143, 144, 145, 215, 217], 'the town’s woman: rows 2–18, and the fair hair down her back');
  // **The crowd's own walk sheets** — the owner, 2026-10-18: *"a lot of walking npcs sprites with
  // yellow hair dont hair change"*. `townsfolk.js` places the armoured roster (`01UNAWLK.CFA`…
  // `15MNKWLK.CFA`), and 62 of its 65 sheets paint their hair above the head line from the bright
  // **gold run 192–199** (`#d79f07`, `#c4910a`, `#b1840d`), none of which was a candidate before
  // this pass — so a blonde commoner answered `[]` and kept the install's own head forever.
  assert.deepEqual(hairOf('04UNAWLK.CFA'), [192, 193, 194, 195], 'a commoner’s gold head is a head');
  assert.deepEqual(hairOf('05CHNWLK.CFA'), [192, 193, 194, 195, 196, 197, 198], 'the back view paints the whole ladder');
  // **The women's own gold, the one the owner caught half-repainted** (2026-10-18): `11UNAWLK` and
  // `13UNAWLK` paint a second gold run, 202–207, and the back view (`15UNAWLK`) paints all of it.
  // Before this pass the run was not a candidate at all, so the front was recoloured and the back
  // stayed yellow: *"you missed a few yellow pixels and from behind it looks awful"*.
  assert.deepEqual(hairOf('15UNAWLK.CFA'), [192, 193, 194, 195, 202, 203, 204, 205, 206, 207]);
  assert.deepEqual(hairOf('11UNAWLK.CFA'), [192, 193, 194, 195, 202, 204, 205, 207, 218]);
  // …and a barbarian's **trousers** are 207–209, so the feet test keeps them out of the head.
  assert.ok(!hairOf('11BARWLK.CFA').some((i) => i >= 208 && i <= 209), 'a pair of trousers is not hair');
  // ── THE MISSED YELLOW ON THE FIGURES THE OWNER NAMED (2026-10-19) ─────────────────
  // *"there is a female ... a person in furs AND a person in chainmail but btw this womans
  // sprite yellow hair dont get fully recolored ... this also happens with man that get
  // recognised as \"a person in leather\""*. The gold runs fall far below the head band
  // (`HAIR_GOLD_WHOLE`), and those sheets are the evidence: the run is taken whole.
  const leatherMan = hairOf('01LTRWLK.CFA');
  for (const gold of [215, 216, 217, 218]) assert.ok(leatherMan.includes(gold), `a person in leather's hair ${gold}`);
  const chainWoman = hairOf('11CHNWLK.CFA');
  for (const gold of [216, 217, 218]) assert.ok(chainWoman.includes(gold), `a woman in chain mail's hair ${gold}`);
  const furWoman = hairOf('14BARWLK.CFA');
  assert.ok(furWoman.includes(194), 'a woman in furs: the ladder’s fourth step is her hair too');
  // …and the gold that is *worn* stays: the barkeep's apron is 212/214/215 with no paint in
  // the head band, and the mage's robe keeps its embroidery.
  assert.deepEqual(hairOf('01BARWLK.CFA'), [], 'the barkeep paints no head above the line');
  assert.ok(hairOf('01CHNWLK.CFA').includes(192) && hairOf('01CHNWLK.CFA').includes(198));
  // …and what is *worn* is not hair: the mage's grey hood (17–23), the barkeep's dark cloth
  // (51, 107–112), and the watch's helm stay exactly as the install painted them.
  assert.ok(!hairOf('01MAGWLK.CFA').some((i) => i >= 17 && i <= 23), 'a hood is not hair');
  // **A guard's mane is hair**, and it shares its ramp with the gold trim (see the family above).
  assert.deepEqual(hairOf('GUARD01.CFA'), [204, 205, 212, 214, 216, 217, 218]);
  assert.deepEqual(hairOf('GUARD05.CFA'), [204, 205, 209, 212, 214, 216, 217, 218]);
  // Her head is the *men's* run — the whole of it, 128–136, where the town's man paints only its
  // middle four — and **not one entry of 141–145**, which is her dress.
  const older = hairOf('FMGEN01.CFA');
  // Her auburn head **and** her long gold one (192/194/195/196, rows 18–51), which is why her
  // family is the one tested by the feet.
  assert.deepEqual(older, [128, 129, 130, 131, 132, 133, 134, 135, 136, 192, 194, 195, 196], 'an older family’s woman: her head is the men’s run');
  assert.ok(!older.some((i) => i >= 141 && i <= 145), 'and her dress is not her hair');
  // **The blonde head is hair** (2026-10-18). `BABE01` was written off as "a whole-figure red
  // dress, no hair" when the candidate list held only 128–136 and 139–147; her head is painted
  // with **212/214/215/216/217/218**, a brown-to-blonde ladder the rest of the sheet does not use
  // (her dress is 69–72, the blue). Measured with `.scratch/hairruns.mjs`: 215/216/218 appear
  // nowhere below the head, and 212/214/217 only in 22–23 stray pixels — hair over a shoulder.
  assert.deepEqual(hairOf('BABE01.CFA'), [190, 205, 209, 212, 214, 215, 216, 217, 218], 'the blonde head is a head');
  for (const name of ['MLGEN01W.CFA', 'FMGENW01.CFA', 'FMGEN01.CFA']) {
    const indices = hairOf(name);
    assert.ok(indices.length >= 3, `${name} paints a visible head`);
  }
});
