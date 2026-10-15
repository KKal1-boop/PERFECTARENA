// ARENA'S ANIMATED CHASM FIELDS — the `.RCI` decoder, against the install's own files.
//
// The claim this file exists to check is the one the whole water-and-lava feature rests on:
// that `WATERANI.RCI` and `LAVAANI.RCI` are 400 × 400 fields of `PAL.COL` indices whose
// every value is a step on the install's own water ladder or its own lava ladder. If that is
// true the port is drawing Arena's water; if it is not, it is drawing a guess.
//
//   node --test tests/unit/rci.test.mjs
//   ARENA_PATH=/path/to/arena/ARENA node --test tests/unit/rci.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { ArenaData } from '../../src/arena/arenaData.js';
import { parseCol } from '../../src/arena/palette.js';
import { LAVA_FIELD, TILE_PIXELS, WATER_FIELD, parseRci, rciReport, rciSide, rciTile } from '../../src/arena/rciFile.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';

const ARENA_PATH = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
const data = new ArenaData(nodeSource(ARENA_PATH), { onWarn: () => {} });

test('both chasm fields are 400 × 400, and a file that is not square is refused', async () => {
  for (const name of [WATER_FIELD, LAVA_FIELD]) {
    const bytes = await data.bytes(name);
    assert.ok(bytes, `${name} is in the Arena folder`);
    assert.equal(bytes.length, 160000, `${name}: 400 × 400 bytes`);
    const field = parseRci(bytes, name);
    assert.equal(field.width, 400);
    assert.equal(field.height, 400);
    assert.equal(field.indices.length, 160000);
  }
  // The third `.RCI` the install ships is the spell-particle one, at 9 × 9.
  const parts = parseRci(await data.bytes('SPPARTS.RCI'), 'SPPARTS.RCI');
  assert.deepEqual([parts.width, parts.height], [9, 9]);
  assert.equal(rciSide(new Uint8Array(100), 'A.RCI'), 10, 'a square file is read by its side');
  assert.throws(() => rciSide(new Uint8Array(101), 'A.RCI'), /not a square animation field/);
});

test('every value in the water field is a step on PAL.COL\'s water ladder', async () => {
  const field = parseRci(await data.bytes(WATER_FIELD), WATER_FIELD);
  const report = rciReport(field);
  assert.equal(report.ramp, 'water');
  // Twelve distinct values, all inside 0x42…0x53 and none of them a zero: the field is
  // opaque art, not a mask with holes in it.
  assert.equal(report.distinct, 12);
  assert.equal(report.min, 0x42);
  assert.equal(report.max, 0x53);
  const palette = parseCol(await data.bytes('PAL.COL'));
  const rgb = (i) => [palette.rgb[i * 3], palette.rgb[i * 3 + 1], palette.rgb[i * 3 + 2]];
  // 0x42…0x49 is the blue ladder (blue-dominant, and it *darkens* as the index rises);
  // 0x4A…0x53 is the teal one (green and blue together, darkening the same way).
  for (let i = 0x42; i <= 0x49; i++) {
    const [r, g, b] = rgb(i);
    assert.ok(b > r && b > g, `${i}: rgb(${r},${g},${b}) is blue`);
    if (i > 0x42) assert.ok(b < rgb(i - 1)[2], `${i} is darker than ${i - 1}`);
  }
  // Not one byte of the water field is outside its ladder.
  assert.equal(report.inside, 160000);
  assert.equal(report.outside, 0);
  const teal = rgb(0x4a);
  assert.ok(teal[1] === teal[2] && teal[1] > teal[0], `0x4A: rgb(${teal.join(',')}) is teal`);
  // And the field really uses both ladders, not just one end of one of them.
  assert.ok(report.values.some((v) => v <= 0x49), 'the blue ladder is used');
  assert.ok(report.values.some((v) => v >= 0x4a), 'the teal ladder is used');
});

test('every value in the lava field is a step on PAL.COL\'s molten ladder', async () => {
  const field = parseRci(await data.bytes(LAVA_FIELD), LAVA_FIELD);
  const report = rciReport(field);
  assert.equal(report.ramp, 'lava');
  // 76 of the 160 000 bytes are outside the molten ladder (a pair of 99s, 43 of 159 and 31
  // of 253) — under a twentieth of a percent, which is why the test is dominance. The
  // count is asserted rather than tolerated so a *different* install shows up here.
  assert.equal(report.outside, 76);
  assert.equal(report.inside, 159924);
  const palette = parseCol(await data.bytes('PAL.COL'));
  const rgb = (i) => [palette.rgb[i * 3], palette.rgb[i * 3 + 1], palette.rgb[i * 3 + 2]];
  // 0xF1…0xFA is orange turning red: red stays high, green and blue both fall.
  const hot = rgb(0xf1);
  const cool = rgb(0xfa);
  assert.ok(hot[0] > 200 && hot[0] > hot[1] && hot[1] > hot[2], `0xF1: rgb(${hot.join(',')}) is orange`);
  assert.ok(cool[0] > 150 && cool[1] < hot[1], `0xFA: rgb(${cool.join(',')}) is the red end`);
  // The 250 band is the body of the lake, and it is most of the field.
  let body = 0;
  for (const v of field.indices) if (v >= 245 && v <= 250) body++;
  assert.ok(body / field.indices.length > 0.5, `${Math.round(100 * body / field.indices.length)}% of the field is the bright band`);
});

test('the field resamples into a square tile of the install\'s own colours', async () => {
  const palette = parseCol(await data.bytes('PAL.COL'));
  const field = parseRci(await data.bytes(WATER_FIELD), WATER_FIELD);
  const tile = rciTile(field, palette);
  assert.equal(tile.width, TILE_PIXELS);
  assert.equal(tile.height, TILE_PIXELS);
  assert.equal(tile.colors.length, TILE_PIXELS * TILE_PIXELS * 4);
  let minB = 255;
  let maxB = 0;
  for (let i = 0; i < tile.colors.length; i += 4) {
    assert.equal(tile.colors[i + 3], 255, 'a surface is opaque; the tint carries the alpha');
    const [r, g, b] = [tile.colors[i], tile.colors[i + 1], tile.colors[i + 2]];
    // Every texel is a blue-dominant colour: this is the water ladder, averaged in colour
    // rather than in index (an index average could land on the wrong ladder's step).
    assert.ok(b > r, `texel ${i / 4}: rgb(${r},${g},${b}) is blue`);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }
  // A wave field is not a flat colour: the blue channel varies by a real amount.
  assert.ok(maxB - minB > 30, `the tile's blue spans ${minB}…${maxB}`);
  // Averaging is by block, so the same field always makes the same tile.
  assert.deepEqual(Buffer.from(rciTile(field, palette).colors), Buffer.from(tile.colors));
  // A smaller request costs nothing and keeps the same shape.
  const small = rciTile(field, palette, { size: 16 });
  assert.equal(small.width, 16);
  assert.equal(small.colors.length, 16 * 16 * 4);
});
