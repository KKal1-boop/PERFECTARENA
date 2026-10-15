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
  ART_BASELINE, FISTS_STATES, FRAMES_PER_SECOND, IDLE_HOLD_SECONDS, MELEE_STATES,
  SCREEN, SWING_DIRECTIONS, WEAPON_SHEETS, familyOfWeapon, placeWeapon, sheetIndices,
  swingDirection, weaponsWithoutArt, createWeaponRig,
} from '../../src/game/weaponView.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

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
    if (!exists) continue;                       // FLAIL.CIF and BOW.CIF: not in this install
    const cif = await data.cif(sheet.file);
    const wanted = Math.max(...Object.values(sheet.states).flat(), -1);
    assert.ok(cif.images.length > wanted,
      `${sheet.file}: ${cif.images.length} frames must cover the state table's ${wanted}`);
    const melee = sheet.states === MELEE_STATES;
    assert.equal(cif.images.length, melee ? 33 : 13, `${sheet.file}: frame count`);
  }
  // The two sheets this install does not ship are named as missing rather than drawn wrong.
  assert.equal(await data.has('FLAIL.CIF'), false);
  assert.equal(await data.has('BOW.CIF'), false);
  assert.deepEqual(weaponsWithoutArt(['FLAIL.CIF', 'BOW.CIF']).sort(),
    ['flail', 'long-bow', 'short-bow'].sort());
});

test('the archive has exactly the sheets the weapon families name', async () => {
  const archive = await data.bsa();
  for (const [family, sheet] of Object.entries(WEAPON_SHEETS)) {
    const present = archive.has(sheet.file);
    if (family === 'flail' || family === 'bow') assert.equal(present, false, `${family} should have no art here`);
    else assert.equal(present, true, `${family} needs ${sheet.file}`);
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
    const cif = await data.cif(sheet.file);
    for (const index of sheetIndices(family)) {
      const frame = cifFrame(cif, index);
      const bottom = frame.yOffset + frame.height;
      frames++;
      if (bottom === ART_BASELINE) onTheLine++;
      else offLine.push(bottom);
    }
  }
  // Two thirds of the 178 frames the state tables can show stand on the line exactly: 146
  // at 147 and 13 fists at 146. The rest are the side sweeps caught mid-arc (a wide low
  // slash sits 8 or 19 pixels above it) and the mace's raised overhead, 90 above it — which
  // is why the rule is the *line* and every frame keeps its own distance from it rather
  // than pinning the picture.
  assert.equal(frames, 178, `the install's sheets hold ${frames} frames the tables use`);
  assert.equal(onTheLine, 146, `frames whose bottom is exactly ${ART_BASELINE}`);
  // Nothing dips *below* the line by more than a pixel of rounding — that is what would put
  // the art behind the original's status area — and nothing above it is further off than
  // the mace's raised frame.
  assert.equal(offLine.filter((b) => b > ART_BASELINE + 1).length, 0, `below the line: ${offLine.join(' ')}`);
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
      const cif = await data.cif(sheet.file);
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

test('a weapon whose art this install lacks swings nothing, and says which', async () => {
  const archive = await data.bsa();
  for (const id of ['flail', 'long-bow']) {
    const rig = createWeaponRig(id);
    assert.equal(archive.has(rig.file), false, `${id} → ${rig.file}, which this install has not`);
    rig.swing('down');
    rig.step(0.2);
    // The rig still runs its own states — a bow *fires*, because that is the only swing
    // state its sheet has — and what is missing is the art, which the loader refuses so the
    // scene can say so rather than draw another weapon's frames.
    assert.equal(rig.direction, 'down', `${id}: the player asked for the overhead chop`);
    assert.equal(rig.state, id === 'flail' ? 'down' : 'firing', `${id}: resolved state`);
    assert.ok(Number.isInteger(rig.frame));
  }
});
