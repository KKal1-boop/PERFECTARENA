// ARENA `.CIF` IMAGES AND ANIMATIONS.
//
// A `.CIF` is a *sequence of images in one file*, each with its own 12-byte header:
//
//   +0   u16   xOffset      where the original draws it, in 320×200 screen pixels
//   +2   u16   yOffset
//   +4   u16   width
//   +6   u16   height
//   +8   u16   flags        low byte = the compression kind, high byte = ??? (0x08 on
//                           every animated file here, so it is a class marker, not a codec)
//   +10  u16   length       bytes of payload that follow this header
//   +12  …                  payload, `length` bytes
//
// Images follow one another until the file ends, which is what makes `.CIF` the format
// Arena's **first-person weapon animations** are stored in: one frame per image, and the
// offsets are where the arm, blade or mace swings to, so the "animation" is the original's
// own screen-positioned frames (`SWORD.CIF` is 33 of them).
//
// The four payload kinds, all of which this project can already decode:
//
//   flags & 0x00FF === 0   uncompressed, `length` bytes of palette indices
//                    2   byte RLE (`decompress.js` `decodeRle`)
//                    4   Type-04 (`decodeType04`)
//                    8   Type-08, with a 2-byte decompressed length before the stream
//                        (`decodeType08`, exactly as a `.IMG` of the same kind is read)
//
// Six files are *headerless* raw sheets with a frame count and dimensions the original
// engine knows by name (`BRASS.CIF` … `SCROLL.CIF`); they are listed in `RAW_CIF` below,
// as they are in OpenTESArena.
//
// PROVENANCE: the header layout, the four compression kinds, the type-8 two-byte skip and
// the raw-override table come from OpenTESArena `src/Assets/CIFFile.cpp` (MIT) and
// `src/Assets/Compression.cpp` (decodeRLE, "adapted from WinArena"). Verified here against
// the real archive: every payload kind byte in `GLOBAL.BSA`'s 58 `.CIF` records is one of
// 0, 2, 4, 8, and each file's headers walk to exactly its last byte — see
// `tests/unit/weapon.test.mjs` and docs/FORMATS.md §9b.

import { decodeType04, decodeType08, decodeRle } from './decompress.js';

/** Bytes of one image header. */
const HEADER_SIZE = 12;

/**
 * Headerless `.CIF` sheets: `frames` images of `width`×`height`, back to back.
 * @type {Readonly<Record<string, {frames: number, width: number, height: number}>>}
 */
export const RAW_CIF = Object.freeze({
  'BRASS.CIF': { frames: 9, width: 8, height: 8 },
  'BRASS2.CIF': { frames: 9, width: 8, height: 8 },
  'MARBLE.CIF': { frames: 9, width: 3, height: 3 },
  'MARBLE2.CIF': { frames: 9, width: 3, height: 3 },
  'PARCH.CIF': { frames: 9, width: 20, height: 20 },
  'SCROLL.CIF': { frames: 9, width: 20, height: 20 },
});

/**
 * @typedef {object} CifImage
 * @property {number} xOffset   screen pixel the original draws this image at
 * @property {number} yOffset
 * @property {number} width
 * @property {number} height
 * @property {number} flags     the raw header word
 * @property {number} length    payload bytes
 * @property {Uint8Array} indices  `width × height` palette indices, top-down
 */

/**
 * @typedef {object} CifFile
 * @property {string} name
 * @property {CifImage[]} images
 * @property {boolean} raw      true for the headerless sheets
 */

/**
 * Decode a `.CIF` file.
 *
 * Strict where the original is: an unrecognised compression kind or a header with
 * no plausible geometry throws, because silently returning a short frame list is how a
 * weapon animation becomes invisible instead of wrong. Images are still read
 * *tolerantly* in the one place the original is: a payload that ends early is decoded to
 * what its own `length` allows.
 *
 * @param {Uint8Array} bytes
 * @param {string} [filename]
 * @returns {CifFile}
 */
export function parseCif(bytes, filename = '') {
  const name = String(filename).toUpperCase();
  const raw = RAW_CIF[name];
  if (raw) {
    const per = raw.width * raw.height;
    const images = [];
    for (let i = 0; i < raw.frames; i++) {
      const from = i * per;
      images.push({
        xOffset: 0, yOffset: 0, width: raw.width, height: raw.height,
        flags: 0, length: per,
        indices: bytes.slice(from, from + per),
      });
    }
    return { name, images, raw: true };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /** @type {CifImage[]} */
  const images = [];
  let at = 0;
  while (at + HEADER_SIZE <= bytes.length) {
    const xOffset = view.getUint16(at, true);
    const yOffset = view.getUint16(at + 2, true);
    const width = view.getUint16(at + 4, true);
    const height = view.getUint16(at + 6, true);
    const flags = view.getUint16(at + 8, true);
    const length = view.getUint16(at + 10, true);
    const pixels = width * height;
    if (!width || !height || pixels > 1024 * 1024) {
      throw new Error(`.CIF ${name}: image ${images.length} at ${at} declares ${width}×${height}`);
    }
    const kind = flags & 0x00ff;
    const payload = bytes.subarray(at + HEADER_SIZE, at + HEADER_SIZE + length);
    let indices;
    if (kind === 0) {
      indices = payload.slice(0, pixels);
    } else if (kind === 2) {
      indices = decodeRle(payload, pixels);
    } else if (kind === 4) {
      indices = decodeType04(payload, pixels);
    } else if (kind === 8) {
      // A 2-byte decompressed length sits before the stream, as in a Type-08 `.IMG`.
      indices = decodeType08(payload.subarray(2), pixels);
    } else {
      throw new Error(`.CIF ${name}: image ${images.length} has compression kind 0x${kind.toString(16)}`);
    }
    images.push({ xOffset, yOffset, width, height, flags, length, indices });
    at += HEADER_SIZE + length;
  }
  if (!images.length) throw new Error(`.CIF ${name}: no images in ${bytes.length} bytes`);
  return { name, images, raw: false };
}

/**
 * The palette index that paints a weapon's own screen position, for a caller that wants to
 * draw one frame: index 0 is the cutout (`palette.js`'s `toRgba` rule, and the archive's —
 * a sword's shape is 72% non-zero inside its own frame, so the rest is background).
 *
 * @param {CifFile} cif
 * @param {number} index
 * @returns {CifImage}
 */
export function cifFrame(cif, index) {
  const frame = cif?.images?.[index];
  if (!frame) throw new Error(`.CIF ${cif?.name ?? '?'} has no frame ${index} (${cif?.images?.length ?? 0} frames)`);
  return frame;
}
