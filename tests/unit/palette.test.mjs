// THE CUTOUT'S INVISIBLE TEXELS, AND WHY THEIR COLOUR MATTERS (D-62).
//
// Index 0 is the transparent cutout (`arena/palette.js`), and for a blit "transparent" means one
// thing: nothing is drawn. On a GPU it means something else. A sampler filters colour and alpha
// together, and a mipmap averages a *bigger* share of the hole with every level it descends, so
// `(0, 0, 0, 0)` beside an opaque texel bleeds black into the picture: a dark fringe round every
// sign, and a black band across every large hole — the space under a table top, the middle of a
// barred door — exactly where the player expected to see the room behind it. The owner: *"instead
// of being able to see under the tables … you see a black band that should be see tough"*.
//
// `toRgba` now floods the invisible texels' RGB outward from the nearest visible pixel (alpha
// stays 0), so every filtered tap has a colour that belongs to the picture. These checks hold the
// three laws that makes the fix safe: the alpha is untouched, the visible pixels are byte-for-byte
// what the install shipped, and the hole's colour comes from its neighbours rather than from black.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCol, toRgba } from '../../src/arena/palette.js';

/** A palette whose entry `i` is `(i, i, i)`. */
const GREY = (() => {
  const rgb = new Uint8Array(768);
  for (let i = 0; i < 256; i++) { rgb[i * 3] = i; rgb[i * 3 + 1] = i; rgb[i * 3 + 2] = i; }
  return { rgb };
})();

/** A `w × h` image from a function of `(x, y)`, top row first. */
function image(width, height, at) {
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) indices[y * width + x] = at(x, y);
  return { indices, width, height };
}

const pixel = (rgba, width, x, y) => [...rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];

test('a cutout keeps its alpha, and its visible pixels are the install’s own bytes', () => {
  // A ring of opaque pixels around a 3×3 hole: the table top, with the room showing under it.
  const img = image(7, 7, (x, y) => (x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 0 : 200 + (x + y) % 5));
  const rgba = toRgba(img.indices, GREY, { width: 7, height: 7 });
  assert.equal(pixel(rgba, 7, 3, 3)[3], 0, 'the hole is still invisible');
  assert.deepEqual(pixel(rgba, 7, 0, 0), [200, 200, 200, 255], 'a visible pixel is untouched');
  assert.deepEqual(pixel(rgba, 7, 6, 6), [200 + (12 % 5), 200 + (12 % 5), 200 + (12 % 5), 255], 'as is the far corner');
  assert.equal(rgba.length, 7 * 7 * 4);
});

test('and the hole is filled with its neighbours’ colour, not with black', () => {
  const img = image(7, 7, (x, y) => (x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 0 : 200));
  const rgba = toRgba(img.indices, GREY, { width: 7, height: 7 });
  for (let y = 2; y <= 4; y++) {
    for (let x = 2; x <= 4; x++) {
      const [r, g, b, a] = pixel(rgba, 7, x, y);
      assert.equal(a, 0, `the hole at ${x},${y} stays invisible`);
      assert.equal(r, 200, `the hole at ${x},${y} is the wall's colour, not black`);
      assert.equal(g, 200);
      assert.equal(b, 200);
    }
  }
  // A hole in the middle of the image is reached by two rings; the middle of a 3×3 hole is
  // exactly the case a single ring would miss.
  assert.equal(pixel(rgba, 7, 3, 3)[0], 200, 'the innermost texel is bled too');
});

test('an image with no hole is returned exactly as it was', () => {
  const img = image(4, 4, (x, y) => 100 + x + y);
  const rgba = toRgba(img.indices, GREY, { width: 4, height: 4 });
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 100 + x + y;
      assert.deepEqual(pixel(rgba, 4, x, y), [v, v, v, 255]);
    }
  }
});

test('the bleed never invents a colour where there is nothing to bleed from', () => {
  const empty = image(5, 5, () => 0);
  const rgba = toRgba(empty.indices, GREY, { width: 5, height: 5 });
  assert.ok([...rgba].every((v) => v === 0), 'an all-cutout image stays all zeroes');
  // And a call without a size (the plain blit path) skips the pass entirely, as before.
  const plain = toRgba(image(3, 3, (x, y) => (x === 1 && y === 1 ? 0 : 9)).indices, GREY);
  assert.deepEqual([...plain.slice(4 * 4, 4 * 4 + 4)], [0, 0, 0, 0]);
});

test('parseCol reads the install’s own table as an eight-byte header and 768 colours', () => {
  // A real `.COL` is an eight-byte header and 768 bytes of 0..255 components (`PAL.COL` is 776
  // bytes on this install) — the recolour modules assume the 768-byte result and nothing else.
  const bytes = new Uint8Array(776);
  for (let i = 8; i < 776; i++) bytes[i] = (i * 7) % 256;
  const palette = parseCol(bytes, 'PAL.COL');
  assert.equal(palette.rgb.length, 768);
  assert.deepEqual([...palette.rgb.slice(0, 3)], [bytes[8], bytes[9], bytes[10]], 'the header is skipped');
  assert.equal(palette.rgb[767], bytes[775], 'and the last component is the file’s last byte');
  assert.throws(() => parseCol(new Uint8Array(768), 'PAL.COL'), /expected 776/, 'a short file is refused');
});
