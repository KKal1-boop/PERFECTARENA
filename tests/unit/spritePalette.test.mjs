// THE SHEET'S OWN PALETTE — the rule behind the owner's rainbow ghost.
//
// `game/spritePalette.js` decides between `PAL.COL` (the world's table) and `CHARSHT.COL` (the
// character sheet's) from the sheet's **pixels**, not from its name. The measured numbers below
// are the real ones, taken off this install's `GLOBAL.BSA` on 2026-10-18 and quoted in that file's
// header, so a change to the threshold or to the count fails here rather than in a screenshot:
//
//   * `GHOST1.CFA` spends 77.8 % of its opaque pixels on indices 1…7 (skin tones in `CHARSHT.COL`,
//     VGA diagnostic colours — pure blue, green, cyan, red, magenta, orange — in `PAL.COL`);
//   * `WRAITH1.CFA` spends 17.6 % there;
//   * every other monster sheet measured — the lich included — spends 0.0 %.
//
// The test builds those shares synthetically, so it runs without the install.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHARACTER_PALETTE, CHARACTER_PALETTE_SHARE, DIAGNOSTIC_INDICES, SPECTRAL_RAMP, WORLD_PALETTE,
  diagnosticShare, paletteForSheet, paletteNameForSheet, spectralPalette, usesCharacterPalette,
} from '../../src/game/spritePalette.js';

/** A sheet of `n` pixels with `hits` of them in the diagnostic run and the rest at index 100. */
const sheet = (n, hits, { zero = 0 } = {}) => {
  const indices = new Uint8Array(n + zero);
  for (let i = 0; i < hits; i++) indices[i] = 1 + (i % 7);
  indices.fill(100, hits, n);
  return [{ indices }];
};

test('the diagnostic run is exactly VGA 1…7', () => {
  assert.deepEqual([...DIAGNOSTIC_INDICES], [1, 2, 3, 4, 5, 6, 7]);
});

test('the measured shares separate the two families cleanly', () => {
  // The real numbers, as pixels: a 100×100 sheet at the measured share.
  const ghost = diagnosticShare(sheet(10_000, 7_780));
  const wraith = diagnosticShare(sheet(10_000, 1_760));
  const lich = diagnosticShare(sheet(10_000, 0));
  assert.ok(Math.abs(ghost - 0.778) < 0.001, `ghost share ${ghost}`);
  assert.ok(Math.abs(wraith - 0.176) < 0.001, `wraith share ${wraith}`);
  assert.equal(lich, 0);
  assert.equal(usesCharacterPalette(sheet(10_000, 7_780)), true, 'the ghost is a character-palette sheet');
  assert.equal(usesCharacterPalette(sheet(10_000, 1_760)), true, 'so is the wraith');
  assert.equal(usesCharacterPalette(sheet(10_000, 0)), false, 'the lich is not');
});

test('a single stray skin pixel does not recolour a whole sheet', () => {
  // 1 % is the threshold and it is deliberately above noise: a sheet with one diagnostic pixel in
  // ten thousand stays on the world palette.
  assert.equal(usesCharacterPalette(sheet(10_000, 1)), false);
  assert.equal(CHARACTER_PALETTE_SHARE, 0.01);
});

test('index 0 is transparency and is not counted', () => {
  // Half the file transparent, and every *opaque* pixel in the diagnostic run: a character sheet.
  const frames = sheet(5_000, 5_000, { zero: 5_000 });
  assert.equal(diagnosticShare(frames), 1);
  // …and an entirely transparent sheet has no opinion at all, rather than a division by zero.
  assert.equal(diagnosticShare([{ indices: new Uint8Array(100) }]), 0);
  assert.equal(usesCharacterPalette([{ indices: new Uint8Array(100) }]), false);
});

test('every frame counts, not just the first', () => {
  // A sheet whose walk frame is a silhouette and whose attack frame carries the skin tones still
  // reads as a character-palette sheet — which is why the rule walks every frame.
  const frames = [
    { indices: new Uint8Array(1_000).fill(0) },
    { indices: sheet(1_000, 900)[0].indices },
  ];
  assert.equal(usesCharacterPalette(frames), true);
});

test('a caller’s own palette wins, and the base table is the default', () => {
  const ghost = sheet(1_000, 900);
  assert.equal(paletteNameForSheet(ghost), CHARACTER_PALETTE);
  assert.equal(paletteNameForSheet(sheet(1_000, 0)), WORLD_PALETTE);
  assert.equal(paletteNameForSheet(ghost, 'DAYTIME.COL'), 'DAYTIME.COL',
    'a daylight pass keeps the daylight palette for every sheet');
  assert.equal(paletteNameForSheet(ghost, 'PAL.COL'), CHARACTER_PALETTE,
    'asking for the world palette is the default question, not an override');
});

test('the spectral sheets get a ramp, not the character sheet\u2019s flat cream', async () => {
  // **The owner's white ghost.** `CHARSHT.COL`'s entries 1–13 are eleven nearly identical creams,
  // so the ghost's own 13-step gradient collapsed into one pale blob. The ramp is monotonic and
  // cool: each entry brighter than the last, blue above red throughout.
  assert.equal(SPECTRAL_RAMP.length, 15);
  for (let i = 1; i < SPECTRAL_RAMP.length; i++) {
    const [r, g, b] = SPECTRAL_RAMP[i];
    const [pr, pg, pb] = SPECTRAL_RAMP[i - 1];
    assert.ok(r > pr && g > pg && b > pb, `entry ${i + 1} is brighter than ${i}`);
    assert.ok(b >= r, `entry ${i + 1} stays cool`);
  }
  // The darkest entry is dark enough to be a shadow and the last is nearly white.
  assert.ok(SPECTRAL_RAMP[0].every((v) => v < 40));
  assert.ok(SPECTRAL_RAMP[SPECTRAL_RAMP.length - 1].every((v) => v > 220));
  // The palette is a copy: the base table is untouched, so a ghost cannot tint the town.
  const base = { rgb: new Uint8Array(768).fill(170) };
  const spectral = spectralPalette(base);
  assert.notEqual(spectral.rgb, base.rgb);
  assert.equal(base.rgb[3], 170, 'the caller\u2019s palette is unchanged');
  assert.deepEqual([...spectral.rgb.slice(3, 6)], SPECTRAL_RAMP[0]);
  assert.equal(spectral.rgb[0], 0, 'index 0 stays transparent black');
  // A plain sheet is handed its palette as it was, spectral sheets get the ramp whatever the
  // scene asked for — a daylit dungeon is still a ghost.
  const plain = { rgb: new Uint8Array(768).fill(9) };
  assert.equal(await paletteForSheet([{ indices: new Uint8Array(100).fill(100) }], 'PAL.COL', () => plain), plain);
  const lit = await paletteForSheet(sheet(1_000, 900), 'DAYTIME.COL', () => plain);
  assert.notEqual(lit, plain);
  assert.deepEqual([...lit.rgb.slice(3, 6)], SPECTRAL_RAMP[0]);
});
