// ARENA `.IMG` IMAGES.
//
// Two shapes live under this extension, and both are common:
//
//   * **Raw 64×64 walls** — exactly 4096 bytes, no header at all. Arena's INF
//     texture lists are full of these (`CASA.IMG`, `FLCAST_A.IMG`, …).
//   * **Headered images** — a 12-byte header, then pixel data that is flat,
//     Type-04 compressed or Type-08 compressed.
//
// A handful of filenames are *headerless* with non-square dimensions that the
// original engine knows by name; those are listed in `RAW_DIMENSIONS` below.
//
// PROVENANCE: the header layout, the compression-flag values, the raw-wall
// special case and the two hardcoded-dimension tables come from OpenTESArena
// (`src/Assets/IMGFile.cpp`, MIT). Verified here against the real files in
// `ARENA/GLOBAL.BSA` and the loose `ARENA/*.IMG` — see docs/FORMATS.md §6.

import { decodeType04, decodeType08 } from './decompress.js';
import { parseEmbeddedPalette } from './palette.js';

/** Header length for headered `.IMG`s. */
const HEADER_SIZE = 12;

/**
 * Images with no header and dimensions the original engine has hardcoded by
 * name. Values are `[width, height]`.
 * @type {Record<string, [number, number]>}
 */
export const RAW_DIMENSIONS = Object.freeze({
  'ARENARW.IMG': [16, 16],
  'CITY.IMG': [16, 11],
  'DITHER.IMG': [8, 100],
  'DITHER2.IMG': [8, 100],
  'DUNGEON.IMG': [14, 8],
  'DZTTAV.IMG': [32, 34],
  'NOCAMP.IMG': [25, 19],
  'NOSPELL.IMG': [25, 19],
  'P1.IMG': [320, 53],
  'POPTALK.IMG': [320, 77],
  'S2.IMG': [320, 36],
  'SLIDER.IMG': [289, 7],
  'TOWN.IMG': [9, 10],
  'UPDOWN.IMG': [8, 16],
  'VILLAGE.IMG': [8, 8],
});

/**
 * @typedef {object} ArenaImage
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} indices   width*height palette indices, top-down rows
 * @property {import('./palette.js').Palette|null} palette  embedded palette, if any
 */

/**
 * Decode an `.IMG` file.
 *
 * @param {Uint8Array} bytes    the whole file
 * @param {string} [filename]   used for the raw/headerless special cases
 * @returns {ArenaImage}
 */
export function parseImg(bytes, filename = '') {
  const name = filename.toUpperCase();
  const rawDims = RAW_DIMENSIONS[name];

  if (rawDims) {
    const [w, h] = rawDims;
    const indices = new Uint8Array(w * h);
    if (name === 'DZTTAV.IMG') {
      // Raw 32×34 art that the game presents as a 64×64 texture with a +32 X offset.
      const out = new Uint8Array(64 * 64);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(x + 32) + y * 64] = bytes[x + y * w] ?? 0;
      return { width: 64, height: 64, indices: out, palette: null };
    }
    indices.set(bytes.subarray(0, Math.min(bytes.length, indices.length)));
    return { width: w, height: h, indices, palette: null };
  }

  if (bytes.length === 4096) {
    // Raw wall texture: rows near the top are often black, so a header would
    // look like zeros. 64×64 is the only raw size Arena ships.
    return { width: 64, height: 64, indices: bytes.slice(), palette: null };
  }

  if (bytes.length < HEADER_SIZE) throw new Error(`.IMG ${name} is only ${bytes.length} bytes`);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(4, true);
  const height = view.getUint16(6, true);
  const flags = view.getUint16(8, true);
  const len = view.getUint16(10, true);
  const pixels = width * height;

  if (!width || !height || pixels > 4096 * 4096) {
    throw new Error(`.IMG ${name} has an implausible size ${width}×${height}`);
  }

  const compression = flags & 0x00ff;
  const payload = bytes.subarray(HEADER_SIZE);
  let indices;

  if (compression === 0) {
    indices = payload.slice(0, pixels);
  } else if (compression === 4) {
    indices = decodeType04(payload.subarray(0, len), pixels);
  } else if (compression === 8) {
    // A 2-byte decompressed length sits before the stream.
    indices = decodeType08(payload.subarray(2, len), pixels);
  } else {
    throw new Error(`.IMG ${name} has an unrecognised compression flag 0x${compression.toString(16)}`);
  }

  let palette = null;
  if (flags & 0x0100) {
    // The embedded palette starts right after the compressed payload.
    palette = parseEmbeddedPalette(bytes.subarray(HEADER_SIZE + len, HEADER_SIZE + len + 768));
  }
  return { width, height, indices, palette };
}

/**
 * Is this file one Arena treats as a raw 64×64 wall texture?
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function isRawWall(bytes) {
  return bytes.length === 4096;
}
