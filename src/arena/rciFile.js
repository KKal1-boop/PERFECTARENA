// ARENA'S ANIMATED CHASM FIELDS (`.RCI`).
//
// An Arena folder ships three `.RCI` files and nothing else of the kind:
//
//   `WATERANI.RCI`  160 000 bytes   400 × 400
//   `LAVAANI.RCI`   160 000 bytes   400 × 400
//   `SPPARTS.RCI`        81 bytes     9 ×  9
//
// The shape is the whole story: **an `.RCI` is a square field of palette indices**, and
// the two big ones are the *surface art of Arena's water and lava*. That is not a
// guess — it is the file's own bytes against the install's own `PAL.COL`:
//
//   * `WATERANI.RCI` holds **12 distinct values, all between `0x42` and `0x53`**, and
//     `PAL.COL`'s entries `0x42…0x49` are a blue ladder (`rgb(29,82,114)` → `rgb(24,30,45)`)
//     while `0x4A…0x53` is the teal one (`rgb(0,127,127)` → `rgb(21,33,44)`). Every byte
//     in the file is a step on a water ramp.
//   * `LAVAANI.RCI` holds **13 values, 241…250 plus two odd singles**, and `PAL.COL`'s
//     `0xF1…0xFA` is the molten ladder (`rgb(209,111,9)` → `rgb(184,28,16)`).
//
// So the file is not a mask, a height field or a shade table: it *is* the picture, stored
// as palette indices, to be laid over the water's or the lava's own square of ground and
// moved. `game/chasmSurface.js` is what does the laying and the moving; this module only
// decodes the file and resamples it into a texture the renderer can upload.
//
// (Until this module the port had a chasm's *rules* — a wet one is waded, a lava one burns
// — and no chasm *surface* at all: the pit's bed was a flat static texture from the level's
// `.INF`, and the install's own water and lava art sat unused in the folder. That is the
// reported "water and lava dont exist".)

/**
 * The side of a square `.RCI` field, from its byte count.
 *
 * Both chasm fields in the install are 400 × 400 and the spell-particle one 9 × 9, so the
 * side is the integer square root and a file that is not a square is a *different* file,
 * not a file to guess at.
 *
 * @param {Uint8Array} bytes
 * @param {string} [filename]  for the message
 * @returns {number}
 */
export function rciSide(bytes, filename = 'an .RCI') {
  const side = Math.round(Math.sqrt(bytes.length));
  if (side * side !== bytes.length) {
    throw new Error(`${filename} is ${bytes.length} bytes, which is not a square animation field`);
  }
  return side;
}

/**
 * @typedef {object} RciField
 * @property {string} filename
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} indices   palette indices, row-major, `height` rows of `width`
 */

/**
 * Decode one `.RCI` into its field of palette indices.
 *
 * @param {Uint8Array} bytes
 * @param {string} [filename]
 * @returns {RciField}
 */
export function parseRci(bytes, filename = '.RCI') {
  const side = rciSide(bytes, filename);
  return { filename, width: side, height: side, indices: bytes };
}

/**
 * `PAL.COL`'s two chasm ladders, as the index ranges the install's own fields live in.
 * @type {Readonly<Record<string, {from: number, to: number}>>}
 */
export const RCI_LADDERS = Object.freeze({
  water: Object.freeze({ from: 0x42, to: 0x53 }),
  lava: Object.freeze({ from: 0xf1, to: 0xfa }),
});

/**
 * What a field is made of: the values it uses, and which ladder they are a picture of.
 *
 * The point of this is the *verification* rather than the picture — it is how the claim
 * "this file is water" is checked against the install instead of asserted in a comment.
 *
 * The test is dominance, not purity, and the reason is in the bytes: `WATERANI.RCI` uses
 * nothing outside its ladder, while `LAVAANI.RCI` carries **76 bytes of 160 000** outside
 * the molten one (a pair of 99s, 43 of 159 and 31 of 253 — a few texels of something else,
 * under a twentieth of one percent). A field is art of a ladder when at least 99 in 100 of
 * its bytes are steps on it, and the outside count is reported rather than hidden so the
 * number can be argued with.
 *
 * @param {RciField} field
 * @returns {{width: number, height: number, values: number[], min: number, max: number, distinct: number, ramp: 'water'|'lava'|null, inside: number, outside: number}}
 */
export function rciReport(field) {
  const hist = new Map();
  for (const v of field.indices) hist.set(v, (hist.get(v) ?? 0) + 1);
  const values = [...hist.keys()].sort((a, b) => a - b);
  const inside = (ladder) => {
    let n = 0;
    for (const [value, count] of hist) if (value >= ladder.from && value <= ladder.to) n += count;
    return n;
  };
  const water = inside(RCI_LADDERS.water);
  const lava = inside(RCI_LADDERS.lava);
  const best = water >= lava ? { ramp: 'water', inside: water } : { ramp: 'lava', inside: lava };
  const total = field.indices.length || 1;
  return {
    width: field.width,
    height: field.height,
    values,
    min: values[0] ?? 0,
    max: values[values.length - 1] ?? 0,
    distinct: values.length,
    // A field that is neither (SPPARTS' five values) reports null rather than a family.
    ramp: best.inside / total >= 0.99 ? /** @type {'water'|'lava'} */ (best.ramp) : null,
    inside: best.inside,
    outside: total - best.inside,
  };
}

/**
 * How big a tile of the surface is, in pixels, and how much ground it covers.
 *
 * `TILE_WORLD_UNITS` is **the engine's own number, not this project's**: its water pass
 * (`renderer.drawWater`) samples a water texture with `vWaterXZ / 6.4`, which is
 * Daggerfall's classic 64-pixel water tile at the engine's 10 pixels to the metre. The
 * port draws its chasm surface through that same pass, so its tile has to be the same
 * size of ground or the flow would run at a different rate per metre.
 *
 * `TILE_PIXELS` is this project's choice of how much of the 400 × 400 field to fit into
 * that square: at 64 pixels a texel is 10 cm of ground, which turns the field's own
 * 3-to-5-pixel ripple into a 30-to-50 cm chop and its ~40-pixel swell into a 4-metre
 * one. At the field's native 400 the whole thing would be under two centimetres a texel and
 * read as noise. The evidence for 64 is the field itself; the *resampling* is the port's,
 * and is noted as such in docs/PROGRESS.md.
 */
export const TILE_PIXELS = 64;
export const TILE_WORLD_UNITS = 6.4;

/**
 * Resample a field into an RGBA tile the renderer can upload.
 *
 * The field's values are palette indices, so each output texel is the average of the
 * block of *colours* it covers rather than the average of their indices: `0x42…0x49` and
 * `0x4A…0x53` are two different ladders, and an index average could land on a step of the
 * wrong one. Alpha is always 255 — a surface is opaque; how much of it you see through is
 * the *tint's* alpha at draw time (`chasmSurface.js`), not the art's.
 *
 * @param {RciField} field
 * @param {import('./palette.js').Palette} palette
 * @param {{size?: number}} [opts]
 * @returns {{width: number, height: number, colors: Uint8ClampedArray}}
 */
export function rciTile(field, palette, opts = {}) {
  const size = Math.max(1, Math.round(opts.size ?? TILE_PIXELS));
  const out = new Uint8ClampedArray(size * size * 4);
  const rgb = palette.rgb;
  const sx = field.width / size;
  const sy = field.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(field.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(field.width, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy2 = y0; sy2 < y1; sy2++) {
        const row = sy2 * field.width;
        for (let sx2 = x0; sx2 < x1; sx2++) {
          const p = field.indices[row + sx2] * 3;
          r += rgb[p]; g += rgb[p + 1]; b += rgb[p + 2];
          n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: size, height: size, colors: out };
}

/** The install's own chasm fields, by the names the loose files carry. */
export const WATER_FIELD = 'WATERANI.RCI';
export const LAVA_FIELD = 'LAVAANI.RCI';
