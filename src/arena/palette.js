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
  return out;
}

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
