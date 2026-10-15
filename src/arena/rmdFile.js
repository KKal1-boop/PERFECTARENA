// ARENA `.RMD` — THE WILDERNESS MAP BLOCKS.
//
// `WILD001.RMD` … `WILD070.RMD` in `GLOBAL.BSA` are the **outdoor** counterpart of a
// `.MIF`: a 64×64-cell map, exactly the three voxel layers a `.MIF` level carries,
// with no chunks, no header and no name:
//
//   offset 0       u16   0 = the planes follow as-is
//                         otherwise: the *word* count the stream decodes to
//                         (12 288 for these records, i.e. the 24 576 bytes below)
//   offset 2       …     three planes, 8 192 bytes each, in this order:
//                          FLOR   64×64 × u16   the floor layer
//                          MAP1   64×64 × u16   the voxel layer (walls, entities)
//                          MAP2   64×64 × u16   the ceiling / height layer
//
// **Verified against the shipped archive**, not against a description:
//
//   * 70 records, each 24 576 bytes; `WILD001` … `WILD004` begin `00 00` and are
//     plain, `WILD005` … `WILD070` begin `00 30` (= 12 288 words) and decode to
//     24 576 bytes with the word-RLE rule this project already uses for `.RMD`
//     (`decompress.js`'s `decodeRleWords`: a signed count, positive = that many
//     literal words follow, negative = repeat the next word |count| times).
//   * the planes decode to *recognisable places* under the same voxel rules the
//     cities use: FLOR high bytes 0…4 and 0xD (water), MAP1 nibbles 0x8 (entity
//     flats) and 0xA (edges), MAP2 = 0/0x3030/0xB030. `tools/rmd-probe.mjs` draws
//     every record as ASCII from these offsets.
//   * the four city blocks are the settlement's quarters: `WILD001`'s wall cells
//     run along its top row **and** left column, `WILD003`'s along its left column
//     and bottom row, `WILD004`'s along its bottom row and right column — the four
//     corners of one walled city, cut into 64×64 pieces (see `game/wilderness.js`,
//     which reproduces the cut the original makes).
//
// What a record's *cells* mean is `game/mifLevel.js`'s business, unchanged: an
// `.RMD` plane and a `.MIF` plane are the same voxel layer, so the existing decoder
// reads a wilderness block with no new rules. This module only recovers the planes.
//
// OpenTESArena reads the same layout (`RMDFile::init`: three 8 192-byte planes into
// FLOR/MAP1/MAP2, or a word-RLE stream when the first word is non-zero).

import { decodeRleWords } from './decompress.js';

/** Cells across a wilderness block. */
export const RMD_WIDTH = 64;
/** Cells down a wilderness block. */
export const RMD_HEIGHT = 64;
/** One plane, in bytes: 64 × 64 × 2. */
export const RMD_PLANE_BYTES = RMD_WIDTH * RMD_HEIGHT * 2;
/** All three planes, in bytes. */
export const RMD_BYTES = RMD_PLANE_BYTES * 3;

/** The block ids the four quarters of a settlement use. */
export const CITY_QUARTER_IDS = Object.freeze([1, 2, 3, 4]);

/**
 * @typedef {object} RmdBlock
 * @property {string} name
 * @property {number} width
 * @property {number} depth
 * @property {Uint16Array} flor
 * @property {Uint16Array} map1
 * @property {Uint16Array} map2
 * @property {boolean} compressed  true when the file was word-RLE packed
 * @property {string[]} warnings
 */

/**
 * Decode one `.RMD` record into its three voxel layers.
 *
 * @param {Uint8Array} bytes
 * @param {string} [name]
 * @returns {RmdBlock}
 */
export function parseRmd(bytes, name = '') {
  /** @type {string[]} */
  const warnings = [];
  if (!bytes || bytes.length < 2) throw new Error(`.RMD ${name}: only ${bytes?.length ?? 0} bytes`);

  const first = bytes[0] | (bytes[1] << 8);
  const compressed = first !== 0;
  /** @type {Uint8Array} */
  let body;
  if (!compressed) {
    body = bytes;
    if (bytes.length < RMD_BYTES) {
      warnings.push(`${name}: ${bytes.length} bytes, short of the ${RMD_BYTES} an uncompressed block holds`);
    }
  } else {
    body = decodeRleWords(bytes.subarray(2), RMD_BYTES);
    if (first * 2 !== RMD_BYTES) {
      // The header says how many words the stream holds. These records all say
      // 12 288 (= 24 576 bytes); anything else is a different block size and the
      // planes below would be misaligned, so say so rather than draw it.
      warnings.push(`${name}: header claims ${first} words (${first * 2} bytes), not ${RMD_BYTES}`);
    }
  }

  /** @type {Uint16Array[]} */
  const planes = [];
  for (let k = 0; k < 3; k++) {
    const plane = new Uint16Array(RMD_WIDTH * RMD_HEIGHT);
    const base = k * RMD_PLANE_BYTES;
    if (base + RMD_PLANE_BYTES <= body.length) {
      for (let i = 0; i < plane.length; i++) {
        plane[i] = body[base + i * 2] | (body[base + i * 2 + 1] << 8);
      }
    } else {
      warnings.push(`${name}: plane ${k} is not in the file; left empty`);
    }
    planes.push(plane);
  }

  return {
    name,
    width: RMD_WIDTH,
    depth: RMD_HEIGHT,
    flor: planes[0],
    map1: planes[1],
    map2: planes[2],
    compressed,
    warnings,
  };
}

/**
 * Is this block id one of the settlement's own quarters?
 *
 * `1`…`4` are never drawn as wilderness scenery: the generator overwrites the
 * middle 2×2 of its block grid with them (`game/wilderness.js`), and the original
 * always revises their cells from the settlement rather than from the file
 * (`ArenaWildUtils::isWildCityBlock`).
 *
 * @param {number} id
 * @returns {boolean}
 */
export function isWildCityBlock(id) {
  return id >= 1 && id <= 4;
}

/**
 * The `.RMD` name for a block id.
 * @param {number} id
 * @returns {string} e.g. `WILD007.RMD`
 */
export function rmdName(id) {
  return `WILD${String(id).padStart(3, '0')}.RMD`;
}

/**
 * Every wilderness block id the archive ships, in order.
 *
 * @param {string[]} names  an archive/holder listing
 * @returns {number[]} e.g. [1, 2, … 70]
 */
export function blockIdsFromListing(names) {
  const ids = [];
  for (const name of names) {
    const m = /^WILD0*(\d+)\.RMD$/i.exec(name);
    if (m) ids.push(Number(m[1]));
  }
  return ids.sort((a, b) => a - b);
}
