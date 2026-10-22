// ARENA PALETTES.
//
// `.COL` (776 bytes):  8-byte header, then 256 RGB triples.
// `.IMG` files may instead carry an *embedded* palette (see `image.js`), which
// stores its components in the VGA 6-bit range 0..63 rather than 0..255.
//
// Both paths end in the same shape: a 256-entry RGBA lookup table that turns a
// palettized byte image into the RGBA the renderer uploads.

/**
 * @typedef {object} Palette
 * @property {Uint8Array} rgb   768 bytes, 3 per entry, 0..255
 */

/**
 * Parse a `.COL` file.
 *
 * @param {Uint8Array} bytes  the whole file
 * @returns {Palette}
 */
export function parseCol(bytes) {
  if (bytes.length < 776) throw new Error(`.COL is ${bytes.length} bytes, expected 776`);
  return { rgb: bytes.subarray(8, 8 + 768) };
}

/**
 * Parse a palette embedded in an `.IMG`, whose components are 0..63.
 *
 * @param {Uint8Array} bytes       the 768 bytes after the pixel data
 * @returns {Palette}
 */
export function parseEmbeddedPalette(bytes) {
  const rgb = new Uint8Array(768);
  for (let i = 0; i < 768; i++) {
    const v = bytes[i] ?? 0;
    rgb[i] = Math.min(v, 63) * 255 / 63;
  }
  return { rgb };
}

/**
 * Expand an 8-bit palettized image to RGBA.
 *
 * Index 0 is the transparent cutout, matching the engine's
 * `ui/bitmapCanvas.js` convention and Arena's own blitter.
 *
 * @param {Uint8Array|Uint8ClampedArray} indices  width*height palette indices
 * @param {Palette} palette
 * @param {{rowsBottomUp?: boolean, width?: number, height?: number}} [opts]
 * @returns {Uint8ClampedArray} width*height*4 RGBA
 */
export function toRgba(indices, palette, opts = {}) {
  const { width = 0, height = 0, rowsBottomUp = false } = opts;
  const out = new Uint8ClampedArray(indices.length * 4);
  const rgb = palette.rgb;

  if (rowsBottomUp && width && height) {
    // The renderer expects bottom-up rows; flip while expanding.
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width;
      const dstRow = y * width;
      for (let x = 0; x < width; x++) {
        write(out, (dstRow + x) * 4, indices[srcRow + x], rgb);
      }
    }
  } else {
    for (let i = 0; i < indices.length; i++) write(out, i * 4, indices[i], rgb);
  }
  if (width && height) bleedCutout(out, width, height);
  return out;
}

/**
 * **Give a cutout's invisible texels their neighbours' colour** (alpha bleeding, D-62).
 *
 * Index 0 is written as `(0, 0, 0, 0)` — black and invisible — and that is correct for a
 * nearest-neighbour blit and wrong for a GPU. A sampler filters *colour and alpha together*: a
 * bilinear tap on the edge of a hole averages the hole's black into the picture, and a mipmap is
 * worse, because every level down averages a bigger share of the hole into the pixels that are
 * still opaque. The result is a **dark fringe** around every cutout — and on art with a large
 * hole inside it (the space under a table top, the gaps in a barred door, the middle of a shop
 * sign) the fringe landed as a black band across the hole exactly where the player expected to
 * see the room: the owner's *"instead of being able to see under the tables … you see a black
 * band that should be see tough"*.
 *
 * The fix is the standard one: leave alpha at 0 (nothing is drawn there) and flood the invisible
 * texels' RGB outward from the nearest visible pixel, two rings, so every filtered tap has a
 * colour that belongs to the picture instead of black. Opaque texels are never touched, so the
 * art itself is byte-for-byte what the install shipped.
 *
 * @param {Uint8ClampedArray} rgba  width*height*4, modified in place
 * @param {number} width @param {number} height
 * @returns {void}
 */
function bleedCutout(rgba, width, height) {
  const n = width * height;
  const filled = new Uint8Array(n);
  let holes = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] > 0) filled[i] = 1;
    else holes++;
  }
  // Nothing to do for an image with no hole (a wall tile), which is most of them.
  if (!holes || holes === n) return;
  const RING = 2;
  for (let pass = 0; pass < RING; pass++) {
    const next = filled.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, count = 0;
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!filled[j]) continue;
          const o = j * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; count++;
        }
        if (!count) continue;
        const o = i * 4;
        rgba[o] = r / count;
        rgba[o + 1] = g / count;
        rgba[o + 2] = b / count;
        next[i] = 1;
      }
    }
    filled.set(next);
  }
}

/** The four-neighbourhood `bleedCutout` grows a ring over. */
const NEIGHBOURS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);

/** @param {Uint8ClampedArray} out @param {number} o @param {number} v @param {Uint8Array} rgb */
function write(out, o, v, rgb) {
  if (v === 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return; }
  const p = v * 3;
  out[o] = rgb[p]; out[o + 1] = rgb[p + 1]; out[o + 2] = rgb[p + 2]; out[o + 3] = 255;
}

/**
 * Build the renderer's `uploadTexture` payload from a palettized image.
 *
 * @param {Uint8Array} indices
 * @param {number} width
 * @param {number} height
 * @param {Palette} palette
 * @returns {{width:number, height:number, colors:Uint8ClampedArray}}
 */
export function imageToUpload(indices, width, height, palette) {
  return { width, height, colors: toRgba(indices, palette, { width, height, rowsBottomUp: true }) };
}
