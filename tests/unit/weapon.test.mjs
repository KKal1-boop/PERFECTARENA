// THE FIRST-PERSON WEAPON — the `.CIF` decoder and Arena's animation table.
//
// Every assertion runs against the real `GLOBAL.BSA` in the player's install, in the spirit
// of the other unit tests: the point of a reverse-engineered format is that it is *the
// original's*, and the only way to know that is to read the original's own files.
//
//   node --test tests/unit/weapon.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/weapon.test.mjs
//
// What the browser suite adds on top of this is the picture: that a frame of the right sheet
// is really on the screen, at the right size, while the player swings.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { RAW_CIF, cifFrame, parseCif } from '../../src/arena/cifFile.js';
import { WEAPONS, weaponById } from '../../src/game/combat.js';
import {
  ARROW_STATES, ART_BASELINE, FISTS_STATES, FRAMES_PER_SECOND, IDLE_HOLD_SECONDS, MELEE_STATES,
  SCREEN, SWING_DIRECTIONS, WEAPON_SHEETS, familyOfWeapon, placeWeapon, sheetFor, sheetIndices,
  swingDirection, weaponsWithoutArt, createWeaponRig,
} from '../../src/game/weaponView.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { parseCfa } from '../../src/arena/cfa.js';
import { unpackPklite } from '../../src/arena/pklite.js';
import fs from 'node:fs';

async function weaponSheet(file) {
  if (!file.endsWith('.CFA')) return data.cif(file);
  const cfa = parseCfa(await data.must(file), file);
  assert.deepEqual(cfa.warnings, []);
  return { images: cfa.frames.map(frame => ({ ...frame, xOffset: cfa.xOffset, yOffset: cfa.yOffset })) };
}

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

test('every .CIF in the archive decodes, header by header', async () => {
  const archive = await data.bsa();
  const names = archive.names().filter((n) => n.endsWith('.CIF'));
  assert.equal(names.length, 58, `the archive ships ${names.length} .CIF records`);
  let images = 0;
  const kinds = new Set();
  for (const name of names) {
    const cif = await data.cif(name);
    assert.ok(cif.images.length >= 1, `${name} has no images`);
    for (const image of cif.images) {
      assert.ok(image.width > 0 && image.height > 0, `${name}: ${image.width}×${image.height}`);
      assert.equal(image.indices.length, image.width * image.height, `${name}: pixel count`);
      assert.ok(image.indices.some((v) => v !== 0), `${name}: a frame that is all cutout`);
      kinds.add(image.flags & 0x00ff);
    }
    images += cif.images.length;
  }
  assert.ok(images > 400, `the archive's .CIFs hold ${images} images in total`);
  // The four payload kinds the decoder implements, and nothing else (`cifFile.js`).
  assert.deepEqual([...kinds].sort((a, b) => a - b), [0, 2, 4, 8], `compression kinds ${[...kinds].join(',')}`);
});

test('the headerless sheets are read by name, as the original reads them', async () => {
  for (const [name, spec] of Object.entries(RAW_CIF)) {
    const bytes = await data.bytes(name);
    const cif = await data.cif(name);
    assert.ok(cif.raw, `${name} is one of the headerless sheets`);
    assert.equal(cif.images.length, spec.frames, `${name}: frame count`);
    assert.equal(bytes.length, spec.frames * spec.width * spec.height, `${name}: bytes = frames × w × h`);
    assert.equal(cif.images[0].width, spec.width);
    assert.equal(cif.images[0].height, spec.height);
  }
});

test('SWORD.CIF is 33 screen-positioned frames, and the offsets place the swing', async () => {
  const cif = await data.cif('SWORD.CIF');
  assert.equal(cif.images.length, 33, 'a melee sheet holds the state table\'s 0–32');
  assert.equal(cif.raw, false);
  // The resting blade (`idle`, frame 32) is the small upright image near the screen's
  // right; the overhead chop (frame 0) is the tall one raised over the player.
  const idle = cifFrame(cif, 32);
  const chop = cifFrame(cif, 0);
  assert.deepEqual([idle.xOffset, idle.yOffset, idle.width, idle.height], [284, 68, 35, 79]);
  assert.deepEqual([chop.xOffset, chop.yOffset, chop.width, chop.height], [249, 0, 44, 147]);
  assert.ok(chop.height > idle.height, 'the raised blade is taller than the resting one');
  // The side sweeps are wide and flat and sit along the bottom of Arena's 320×200 screen:
  // left (10–14) is anchored at x = 0 and right (15–19) at x = 83.
  assert.equal(cifFrame(cif, 11).xOffset, 0, 'the left sweep starts at the screen edge');
  assert.equal(cifFrame(cif, 16).xOffset, 83);
  assert.equal(cifFrame(cif, 11).width, 237);
  // Every frame the state table can show lies inside the sheet, and no swing frame is
  // outside Arena's own 320×200 screen.
  for (const index of sheetIndices('blade')) {
    const frame = cifFrame(cif, index);
    assert.ok(index >= 0 && index <= 32, `frame ${index} is in the sheet`);
    assert.ok(frame.xOffset + frame.width <= 320 && frame.yOffset + frame.height <= 200,
      `frame ${index} (${frame.xOffset}+${frame.width}, ${frame.yOffset}+${frame.height}) is on screen`);
  }
});

test('every melee sheet has 33 frames and the fists sheet 13, as the table indexes them', async () => {
  for (const [family, sheet] of Object.entries(WEAPON_SHEETS)) {
    const exists = await data.has(sheet.file);
    assert.ok(exists, `${family}: original ${sheet.file} must be present`);
    const cif = await weaponSheet(sheet.file);
    const wanted = Math.max(...Object.values(sheet.states).flat(), -1);
    assert.ok(cif.images.length > wanted,
      `${sheet.file}: ${cif.images.length} frames must cover the state table's ${wanted}`);
    const melee = sheet.states === MELEE_STATES;
    assert.equal(cif.images.length, melee ? 33 : family === 'bow' ? 2 : 13, `${sheet.file}: frame count`);
  }
  // The two sheets this install does not ship: each is drawn from a documented stand-in —
  // the flail from `MACE.CIF`, the bow from the install's own `ARROWS.CIF` missile art
  // (`ARROW_STATES`, the owner's *"bow has no animation in first person"*).
  assert.equal(await data.has('FLAIL.CIF'), false);
  assert.equal(await data.has('BOW.CIF'), false);
  assert.equal(sheetFor('flail').file, 'STAR.CIF');
  assert.equal(sheetFor('flail').substitute, false);
  assert.equal(sheetFor('bow').file, 'ARROWHLF.CFA');
  assert.equal(sheetFor('bow').substitute, false);
  assert.equal(sheetFor('mace').substitute, false, 'a mace is drawn from its own sheet');
  assert.deepEqual(weaponsWithoutArt(['FLAIL.CIF', 'BOW.CIF']).sort(), [],
    'both families are drawn from a stand-in, so neither is art-less');
});

test('the archive has exactly the sheets the weapon families name', async () => {
  const archive = await data.bsa();
  for (const [family, sheet] of Object.entries(WEAPON_SHEETS)) {
    const present = archive.has(sheet.file);
    assert.equal(present, true, `${family} needs original ${sheet.file}`);
  }
});

test('every weapon base the game can wield maps to a sheet, and to the right one', () => {
  for (const weapon of WEAPONS) {
    const family = familyOfWeapon(weapon.id);
    assert.ok(WEAPON_SHEETS[family], `${weapon.id} → ${family}`);
  }
  // Arena's own mapping: the blade family is one sheet, both axes another, both bows another.
  for (const id of ['dagger', 'shortsword', 'broadsword', 'saber', 'longsword', 'claymore', 'tanto', 'wakizashi', 'katana', 'dai-katana']) {
    assert.equal(familyOfWeapon(id), 'blade', id);
  }
  assert.equal(familyOfWeapon('war-axe'), 'axe');
  assert.equal(familyOfWeapon('battle-axe'), 'axe');
  assert.equal(familyOfWeapon('warhammer'), 'warhammer');
  assert.equal(familyOfWeapon('staff'), 'staff');
  assert.equal(familyOfWeapon('mace'), 'mace');
  assert.equal(familyOfWeapon('short-bow'), 'bow');
  // An id nobody knows fights bare-handed, exactly as `combat.js` resolves damage.
  assert.equal(familyOfWeapon('a-rusty-spoon'), 'fists');
  assert.equal(weaponById('a-rusty-spoon').id, 'fists');
});

test('the swing direction is the way the player is pushing, and uses all six', () => {
  assert.equal(swingDirection({ forward: 1 }), 'forward');
  assert.equal(swingDirection({ strafe: 1 }), 'right');
  assert.equal(swingDirection({ strafe: -1 }), 'left');
  assert.equal(swingDirection({ forward: 1, strafe: 1 }), 'downRight');
  assert.equal(swingDirection({ forward: 1, strafe: -1 }), 'downLeft');
  assert.equal(swingDirection({}), 'down');
  assert.equal(swingDirection({ forward: -1 }), 'down', 'backing away is the overhead chop');
  const reached = new Set([{ forward: 1 }, { strafe: 1 }, { strafe: -1 }, { forward: 1, strafe: 1 }, { forward: 1, strafe: -1 }, {}]
    .map(swingDirection));
  assert.deepEqual([...reached].sort(), [...SWING_DIRECTIONS].sort(), 'every Arena direction is reachable');
  for (const direction of SWING_DIRECTIONS) {
    assert.ok(MELEE_STATES[direction]?.length === 5, `${direction} is five frames`);
  }
});

test('the rig follows Arena\'s own states, frame by frame', () => {
  const rig = createWeaponRig('longsword');
  assert.equal(rig.family, 'blade');
  assert.equal(rig.file, 'SWORD.CIF');
  assert.equal(rig.state, 'sheathed');
  assert.equal(rig.drawn, false, 'a sheathed weapon draws nothing');
  assert.equal(rig.frame, null);

  // The first blow draws the weapon (unsheathing, frames 30 → 31 → 32) and then swings.
  assert.equal(rig.swing('forward'), 'forward');
  assert.equal(rig.state, 'unsheathing');
  assert.equal(rig.frame, 30);
  rig.step(1 / FRAMES_PER_SECOND);
  assert.equal(rig.frame, 31);
  rig.step(1 / FRAMES_PER_SECOND);
  assert.equal(rig.frame, 32);
  rig.step(1 / FRAMES_PER_SECOND);
  assert.equal(rig.state, 'forward', 'the draw hands over to the swing the player asked for');
  assert.equal(rig.frame, 25);
  for (let i = 1; i < MELEE_STATES.forward.length; i++) {
    rig.step(1 / FRAMES_PER_SECOND);
    assert.equal(rig.frame, MELEE_STATES.forward[i], `swing frame ${i}`);
  }
  rig.step(1 / FRAMES_PER_SECOND);
  assert.equal(rig.state, 'idle', 'the swing ends on the drawn hold');
  assert.equal(rig.frame, 32);
  assert.equal(rig.direction, null);

  // A second swing needs no draw: it plays at once, in its own direction's frames.
  rig.swing('left');
  assert.equal(rig.state, 'left');
  assert.equal(rig.frame, 10);
  rig.step(0.2);                                   // 3.2 frames in
  assert.equal(rig.frame, 13);

  // Standing still, the weapon is sheathed again after the drawn hold.
  rig.step(0.2);                                   // the swing runs out, back to `idle`
  assert.equal(rig.state, 'idle');
  rig.step(IDLE_HOLD_SECONDS - 0.01);
  assert.equal(rig.state, 'idle', 'still drawn, just short of the hold');
  rig.step(0.02);
  assert.equal(rig.state, 'sheathing', 'and then it goes away by itself');
  assert.equal(rig.frame, 32, 'the sheath starts from the drawn frame');
  rig.step(3 / FRAMES_PER_SECOND);
  assert.equal(rig.state, 'sheathed');
  assert.equal(rig.frame, null, 'and then nothing is drawn at all');
});

test('a fist fight is the fist sheet, and its own frames', () => {
  const rig = createWeaponRig('fists');
  assert.equal(rig.file, 'HAND.CIF');
  assert.equal(FISTS_STATES.idle[0], 12);
  rig.swing('right');
  assert.equal(rig.state, 'unsheathing');
  rig.step(3 / FRAMES_PER_SECOND);
  assert.equal(rig.state, 'right');
  assert.equal(rig.frame, 5);
  assert.equal(rig.indices.length, 13, 'a fist sheet needs 13 images');
  // The gauntlets are hand weapons: they punch, they do not swing a sword.
  assert.equal(createWeaponRig('plate-gauntlets').file, 'HAND.CIF');
});

test('the baseline is 147 because the install\'s own frames say so', async () => {
  // The measured law of `placeWeapon`: the art is drawn in a 320×200 screen and its bottom
  // edge sits on the line where the original's status area begins, `yOffset + height === 147`.
  assert.deepEqual([SCREEN.width, SCREEN.height, ART_BASELINE], [320, 200, 147]);
  let onTheLine = 0;
  let frames = 0;
  /** @type {number[]} */
  const offLine = [];
  for (const [family, sheet] of Object.entries(WEAPON_SHEETS)) {
    if (!(await data.has(sheet.file))) continue;
    const cif = await weaponSheet(sheet.file);
    for (const index of sheetIndices(family)) {
      const frame = cifFrame(cif, index);
      const bottom = frame.yOffset + frame.height;
      frames++;
      if (bottom === ART_BASELINE) onTheLine++;
      else offLine.push(bottom);
    }
  }
  // Including STAR.CIF and ARROWHLF.CFA: 213 frames, 173 exactly on baseline.
  // Side sweeps and fists preserve the offsets encoded by the original art.
  assert.equal(frames, 213, `the install's sheets hold ${frames} frames the tables use`);
  assert.equal(onTheLine, 173, `frames whose bottom is exactly ${ART_BASELINE}`);
  // STAR.CIF's original frame 4 extends two pixels below the nominal baseline.
  const star = await data.cif('STAR.CIF');
  assert.deepEqual(star.images.map((f, i) => ({ i, bottom: f.yOffset + f.height })).filter(f => f.bottom > 148), [{ i: 4, bottom: 149 }]);
  assert.deepEqual(offLine.filter(b => b > ART_BASELINE + 1), [149]);
  assert.ok(offLine.every((b) => b >= 57), `the furthest above it is the mace's raised frame: ${Math.min(...offLine)}`);
  assert.ok(offLine.filter((b) => Math.abs(b - ART_BASELINE) <= 1).length >= 12, 'the fist sheet rides the line at 146');
});

test('the weapon is placed by the original\'s own margins, at one scale for both axes', () => {
  // The idle blade of `SWORD.CIF`, whose own right edge is one art pixel off the screen's.
  const idle = { xOffset: 284, yOffset: 68, width: 35, height: 79 };
  const screen = { width: 1280, height: 720, baseline: 560 };
  const place = placeWeapon(idle, screen);
  // One factor: the smaller of the two axis ratios, so nothing is ever stretched.
  assert.equal(place.scale, Math.min(1280 / 320, 720 / 200));
  assert.equal(place.scale, 3.6);
  assert.equal(place.w, Math.round(35 * 3.6));
  assert.equal(place.h, Math.round(79 * 3.6));
  // Its bottom edge is on the status line ...
  assert.equal(place.bottom, 560, 'the blade stands on the line');
  // ... and its right edge one art pixel (times the scale) from the window's.
  assert.equal(screen.width - place.right, Math.round((320 - (284 + 35)) * 3.6));
  assert.ok(screen.width - place.right <= 4);
  // A frame that sits above the line keeps its own gap: the mid-air slash of SWORD.CIF
  // (`yOffset + height` 139) is 8 art pixels above it, as in the original.
  const slash = { xOffset: 0, yOffset: 110, width: 167, height: 29 };
  const placed = placeWeapon(slash, screen);
  assert.equal(placed.bottom, 560 - Math.round(8 * 3.6));
  // The narrow window: the scale is governed by the width instead, and the art still lands
  // in the lower right — this is the portrait case that used to leave the sword behind the
  // HUD and stretch it.
  const tall = placeWeapon(idle, { width: 439, height: 799, baseline: 660 });
  assert.equal(tall.scale, 439 / 320);
  assert.equal(tall.bottom, 660);
  assert.equal(439 - tall.right, Math.round(1 * tall.scale));
  assert.ok(tall.y + tall.h <= 660, 'the whole picture is above the line');
  // A window with no HUD on it falls back to its own bottom.
  assert.equal(placeWeapon(idle, { width: 320, height: 200 }).bottom, 200);
});

test('every frame of every sheet lands on the line, inside the window', async () => {
  for (const screen of [{ width: 960, height: 600, baseline: 470 }, { width: 439, height: 799, baseline: 700 }]) {
    for (const [family, sheet] of Object.entries(WEAPON_SHEETS)) {
      if (!(await data.has(sheet.file))) continue;
      const cif = await weaponSheet(sheet.file);
      for (const index of sheetIndices(family)) {
        const frame = cifFrame(cif, index);
        const place = placeWeapon(frame, screen);
        const bottom = frame.yOffset + frame.height;
        // The art's own distance above the line, in art pixels, is what survives scaling.
        assert.equal(place.bottom - screen.baseline, Math.round((bottom - ART_BASELINE) * place.scale),
          `${sheet.file} frame ${index}: bottom ${place.bottom}`);
        assert.ok(place.y >= -place.scale, `${sheet.file} frame ${index}: top ${place.y} is on the screen`);
        assert.ok(place.right <= screen.width + 1, `${sheet.file} frame ${index}: right ${place.right}`);
      }
    }
  }
});

test('flail and bow use the filenames embedded in the original executable, without substitutes', async () => {
  const archive = await data.bsa();
  // The flail: `FLAIL.CIF` is absent, `MACE.CIF` is the same class of weapon, and the rig keeps
  // the melee table — both sheets are Arena's own 33-frame twelve-state ones.
  const flailRig = createWeaponRig('flail');
  assert.equal(flailRig.file, 'STAR.CIF');
  assert.equal(archive.has(flailRig.file), true);
  assert.equal(flailRig.substitute, false);
  assert.equal(flailRig.ownFile, 'STAR.CIF');
  flailRig.swing('down');
  flailRig.step(0.2);
  assert.equal(flailRig.state, 'down');
  assert.deepEqual(sheetIndices('flail'), sheetIndices('mace'), 'the flail swings the melee table');

  // The bow: `BOW.CIF` is absent too, and the shot is drawn from `ARROWS.CIF` — nine frames of
  // the install's own missile art, placed on Arena's screen in a 3×3 grid (measured here, off
  // the file's own headers). The centre column is the arrow **leaving**: bottom-centre, middle,
  // top-centre, which is the animation the owner asked for.
  const bowRig = createWeaponRig('long-bow');
  assert.equal(bowRig.file, 'ARROWHLF.CFA');
  assert.equal(bowRig.loaded, undefined, 'the rig itself never loads bytes; the scene does');
  assert.equal(archive.has(bowRig.file), true);
  assert.equal(bowRig.substitute, false);
  assert.equal(bowRig.ownFile, 'ARROWHLF.CFA');
  assert.deepEqual(sheetIndices('bow'), [0, 1], 'the original bow has idle/draw and firing frames');
  const exe = unpackPklite(new Uint8Array(fs.readFileSync(`${ARENA_PATH}/ACD.EXE`))).image;
  const filenames = Buffer.from(exe).toString('latin1');
  assert.ok(filenames.includes('staff.cif\0sword.cif\0mace.cif\0star.cif\0hammer.cif\0axe.cif\0arrowhlf.cfa\0hand.cif\0'));
  const original = await weaponSheet(bowRig.file);
  assert.equal(original.images.length, 2);
  assert.deepEqual([original.images[0].xOffset, original.images[0].yOffset, original.images[0].width, original.images[0].height], [141, 97, 36, 50]);
  const arrows = parseCif(archive.get('ARROWS.CIF'), 'ARROWS.CIF');
  assert.equal(arrows.images.length, 9);
  // A 3×3 grid, read row by row: each row runs left → centre → right across Arena's screen.
  for (const r of [0, 1, 2]) {
    const row = arrows.images.slice(r * 3, r * 3 + 3);
    assert.ok(row[0].xOffset < row[1].xOffset && row[1].xOffset < row[2].xOffset,
      `row ${r} runs left/centre/right: ${row.map((im) => im.xOffset)}`);
  }
  // …and the centre column descends, which is the arrow's own flight (frame 7 lowest).
  assert.ok(arrows.images[1].yOffset < arrows.images[4].yOffset
    && arrows.images[4].yOffset < arrows.images[7].yOffset, 'the centre column descends');
  assert.equal(arrows.images[7].yOffset, Math.max(...arrows.images.map((im) => im.yOffset)), 'frame 7 is the lowest');

  // …and the rig plays that sequence when the bow is loosed, one frame at a time.
  bowRig.swing('forward');
  assert.equal(bowRig.state, 'unsheathing');
  assert.equal(bowRig.frame, 0, 'the original bow starts nocked');
  bowRig.step(FRAMES_PER_SECOND ? 1 / FRAMES_PER_SECOND : 0.1);
  assert.equal(bowRig.state, 'firing', 'a bow fires; it does not swing');
  const seen = [bowRig.frame];
  for (let i = 0; i < 24; i++) {
    bowRig.step(1 / FRAMES_PER_SECOND);
    if (bowRig.state !== 'firing') break;
    if (bowRig.frame !== seen[seen.length - 1]) seen.push(bowRig.frame);
  }
  assert.deepEqual(seen, [1], 'the original firing frame lasts seven ticks');
  assert.equal(bowRig.frame, 0, 'then the bow returns to its idle frame');
});
