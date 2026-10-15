// `.CFA` — ARENA'S CREATURE AND CHARACTER ANIMATIONS (**VERIFIED**).
//
// Every monster, guard and townsfolk in Arena is an animated sprite, and the player's
// own character in a third-person view is one too. The files are in `GLOBAL.BSA`:
// **340 `.CFA`**, plus 79 `.DFA` (static props) and 58 `.CIF` (miscellaneous art).
//
// ## The layout
//
//   offset  size  what
//   0x00    2     **width** of a frame, in pixels (`widthUncompressed`)
//   0x02    2     **height** of a frame, in pixels
//   0x04    2     **compressed width**: bytes of bit-packed data per row
//   0x06    2     x offset (the sprite's own centre against its frame)
//   0x08    2     y offset
//   0x0a    1     **bits per pixel** — how the row's bytes are demuxed (1…8)
//   0x0b    1     **frame count**
//   0x0c    2×12  frame offsets, ascending; only the first `count` are real
//   0x48    2     the file's own length
//   0x4c    n     the **colour lookup table** — one byte per packed value
//   …             the frames, each a byte-RLE stream opened at its own offset
//
// Three things here are easy to get wrong, and all three were wrong in the first
// version of this parser (it made every creature cyan — see PROGRESS):
//
//   * **There are two widths.** `0x00` is the number of pixels in a row and `0x04` the
//     number of *packed* bytes that row takes. `RAT1.CFA` is 32 pixels from 20 bytes at
//     5 bits each. Reading `0x04` as the width (the first version's mistake) shrinks
//     every sprite by the packing ratio.
//   * **Rows are bit-packed.** Each row is `widthCompressed` bytes holding
//     `widthUncompressed` values of `bitsPerPixel` bits; the demux routines below are
//     WinArena's, transcribed from OpenTESArena's `CFAFile::demux*`.
//   * **The packed values are not palette indices.** They index the lookup table at
//     `0x4c`, which is what turns an armour's dithered shades into the game's own
//     palette entries. Skipping it (the first version's mistake) is what made a
//     skeleton a patchwork: the palette was being read with the packing codes.
//
// The table's length is `firstFrameOffset − 0x4c`: the encoder writes entries only for
// the codes the art actually uses (`RAT1` 29 of the 32 a 5-bit code can hold), and the
// first frame begins right after it.
//
// ## What is *not* known, and is therefore not used
//
//   the table's spare entries      A packed value beyond the table's length cannot be
//                                  translated; it is clamped to the last entry and a
//                                  warning is recorded rather than inventing a colour.
//   the offset fields at 0x06/0x08 The sprite's own centre, presumably — no code path
//                                  needs them yet.
//   the frame order                The frames are assumed to be an animation in order;
//                                  frame 0 is the standing figure.
//   the six files per creature     `RAT1.CFA`…`RAT6.CFA` are assumed to be six view
//                                  angles. Unverified; `monsterSpriteName` uses view 1.
//
// PROVENANCE: the header, the bit-packing and the lookup table come from
// **OpenTESArena** (`src/Assets/CFAFile.cpp`, MIT) — "Adapted from WinArena" — and the
// field values were re-checked against this install's own files (header fields,
// `length` at 0x48 matching the file size, and the table ending exactly at the first
// frame offset). See docs/FORMATS.md §11.

import { decodeRle } from './decompress.js';

/** Bytes before the frame-offset table: five uint16 fields and two bytes. */
export const CFA_HEADER_SIZE = 12;
/** The offset table's length in entries, from the shipped files. */
export const CFA_TABLE_ENTRIES = 12;
/** Where the colour lookup table begins, in every shipped file. */
export const CFA_LOOKUP_TABLE_OFFSET = 0x4c;

/**
 * @typedef {object} CfaFrame
 * @property {number} index      frame number, 0-based
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} indices  palette indices, index 0 transparent, row-major
 */

/**
 * @typedef {object} CfaFile
 * @property {string} name
 * @property {number} width        pixels per row (`widthUncompressed`)
 * @property {number} height
 * @property {number} widthCompressed  packed bytes per row
 * @property {number} bitsPerPixel
 * @property {number} xOffset
 * @property {number} yOffset
 * @property {number} frameCount
 * @property {number[]} offsets
 * @property {Uint8Array} lookUpTable
 * @property {CfaFrame[]} frames
 * @property {string[]} warnings
 */

/** One packed row -> `count` values of `bitsPerPixel` bits each. */
const DEMUX = {
  1: (src, dst) => {
    dst[0] = (src[0] & 0x80) >> 7; dst[1] = (src[0] & 0x40) >> 6; dst[2] = (src[0] & 0x20) >> 5; dst[3] = (src[0] & 0x10) >> 4;
    dst[4] = (src[0] & 0x08) >> 3; dst[5] = (src[0] & 0x04) >> 2; dst[6] = (src[0] & 0x02) >> 1; dst[7] = src[0] & 0x01;
  },
  2: (src, dst) => {
    dst[0] = (src[0] & 0xc0) >> 6; dst[1] = (src[0] & 0x30) >> 4; dst[2] = (src[0] & 0x0c) >> 2; dst[3] = src[0] & 0x03;
  },
  3: (src, dst) => {
    dst[0] = (src[0] & 0xe0) >> 5; dst[1] = (src[0] & 0x1c) >> 2;
    dst[2] = ((src[0] & 0x03) << 1) | ((src[1] & 0x80) >> 7);
    dst[3] = (src[1] & 0x70) >> 4; dst[4] = (src[1] & 0x0e) >> 1;
    dst[5] = ((src[1] & 0x01) << 2) | ((src[2] & 0xc0) >> 6);
    dst[6] = (src[2] & 0x38) >> 3; dst[7] = src[2] & 0x07;
  },
  4: (src, dst) => {
    dst[0] = (src[0] & 0xf0) >> 4; dst[1] = src[0] & 0x0f; dst[2] = (src[1] & 0xf0) >> 4; dst[3] = src[1] & 0x0f;
  },
  5: (src, dst) => {
    dst[0] = (src[0] & 0xf8) >> 3;
    dst[1] = ((src[0] & 0x07) << 2) | ((src[1] & 0xc0) >> 6);
    dst[2] = (src[1] & 0x3e) >> 1;
    dst[3] = ((src[1] & 0x01) << 4) | ((src[2] & 0xf0) >> 4);
    dst[4] = ((src[2] & 0x0f) << 1) | ((src[3] & 0x80) >> 7);
    dst[5] = (src[3] & 0x7c) >> 2;
    dst[6] = ((src[3] & 0x03) << 3) | ((src[4] & 0xe0) >> 5);
    dst[7] = src[4] & 0x1f;
  },
  6: (src, dst) => {
    dst[0] = (src[0] & 0xfc) >> 2;
    dst[1] = ((src[0] & 0x03) << 4) | ((src[1] & 0xf0) >> 4);
    dst[2] = ((src[1] & 0x0f) << 2) | ((src[2] & 0xc0) >> 6);
    dst[3] = src[2] & 0x3f;
  },
  7: (src, dst) => {
    dst[0] = (src[0] & 0xfe) >> 1;
    dst[1] = ((src[0] & 0x01) << 6) | ((src[1] & 0xfc) >> 2);
    dst[2] = ((src[1] & 0x03) << 5) | ((src[2] & 0xf8) >> 3);
    dst[3] = ((src[2] & 0x07) << 4) | ((src[3] & 0xf0) >> 4);
    dst[4] = ((src[3] & 0x0f) << 3) | ((src[4] & 0xe0) >> 5);
    dst[5] = ((src[4] & 0x1f) << 2) | ((src[5] & 0xc0) >> 6);
    dst[6] = ((src[5] & 0x3f) << 1) | ((src[6] & 0x80) >> 7);
    dst[7] = src[6] & 0x7f;
  },
};

/** How many bytes one demux step consumes and how many values it yields. */
const DEMUX_STRIDE = { 1: [1, 8], 2: [1, 4], 3: [3, 8], 4: [2, 4], 5: [5, 8], 6: [3, 4], 7: [7, 8] };

/**
 * Parse one `.CFA`.
 *
 * A frame that does not produce exactly `width × height` pixels is dropped with a
 * warning rather than padded: a creature drawn from a half-decoded frame would be a
 * silent corruption, and the next view file is a better answer than a torn sprite.
 *
 * @param {Uint8Array} bytes
 * @param {string} [name]
 * @returns {CfaFile}
 */
export function parseCfa(bytes, name = '.CFA') {
  const warnings = [];
  if (bytes.length < CFA_LOOKUP_TABLE_OFFSET + 1) {
    throw new Error(`${name} is ${bytes.length} bytes, too short to be a .CFA`);
  }
  const u16 = (offset) => bytes[offset] | (bytes[offset + 1] << 8);
  const width = u16(0);
  const height = u16(2);
  const widthCompressed = u16(4);
  const xOffset = u16(6);
  const yOffset = u16(8);
  const bitsPerPixel = bytes[10];
  const declared = bytes[11];
  const pixels = width * height;
  if (!width || !height || !widthCompressed || pixels > 512 * 512) {
    throw new Error(`${name} declares an implausible ${width}×${height} from ${widthCompressed} bytes a row`);
  }
  // 8 bits per pixel is the one straight copy: the row's bytes *are* the indices. Every
  // other value has a demux routine; anything else is a file this parser cannot read.
  if (bitsPerPixel !== 8 && !DEMUX[bitsPerPixel]) {
    throw new Error(`${name} declares ${bitsPerPixel} bits per pixel; the values in use are 1…8`);
  }

  const table = [];
  for (let i = 0; i < CFA_TABLE_ENTRIES; i++) table.push(u16(CFA_HEADER_SIZE + i * 2));
  const frameCount = Math.max(1, Math.min(CFA_TABLE_ENTRIES, declared));
  if (declared !== frameCount) {
    warnings.push(`${name} declares ${declared} frames; ${CFA_TABLE_ENTRIES} is the table's length`);
  }

  // The lookup table runs from 0x4c to the first frame, which is also the end of the
  // header. A file whose first offset lands inside the fixed header is not one of
  // Arena's.
  //
  // **Eight bits per pixel has no table at all.** A packed value is already a palette
  // index when a pixel is a whole byte, so the encoder omits the table and the first
  // frame begins at the end of the header — measured on GHOST1.CFA, WRAITH1.CFA,
  // LICH1.CFA and IRON6.CFA, whose first offset is exactly 76 = 0x4c. Reading the
  // table as `firstFrame − 0x4c` then yields a length of zero, so these files are
  // accepted with an empty table rather than refused.
  const firstFrame = bitsPerPixel === 8 ? CFA_LOOKUP_TABLE_OFFSET : table[0];
  const tableLength = firstFrame - CFA_LOOKUP_TABLE_OFFSET;
  if (tableLength < 0 || firstFrame >= bytes.length) {
    throw new Error(`${name}: first frame at ${firstFrame} leaves no lookup table`);
  }
  const lookUpTable = bytes.subarray(CFA_LOOKUP_TABLE_OFFSET, firstFrame);
  if (bitsPerPixel !== 8 && tableLength === 0) {
    throw new Error(`${name}: first frame at ${firstFrame} leaves no lookup table`);
  }

  const offsets = table.slice(0, frameCount);
  const frames = [];
  for (let i = 0; i < offsets.length; i++) {
    const start = offsets[i];
    // The last frame runs to the end of the file: the entries past the frame count are
    // not offsets at all (`RAT6.CFA` declares three and its fourth entry points
    // *backwards*, into the third frame).
    const end = i + 1 < offsets.length ? offsets[i + 1] : bytes.length;
    if (!(start >= firstFrame && start < end && end <= bytes.length)) {
      warnings.push(`${name} frame ${i} has an unusable range ${start}…${end}`);
      continue;
    }
    let indices;
    try {
      indices = decodeFrame(bytes.subarray(start, end), { width, height, widthCompressed, bitsPerPixel, lookUpTable });
    } catch (err) {
      warnings.push(`${name} frame ${i} did not decode: ${err.message}`);
      continue;
    }
    if (!indices) {
      warnings.push(`${name} frame ${i} holds too little data for its ${width}×${height} pixels`);
      continue;
    }
    frames.push({ index: i, width, height, indices });
  }
  if (!frames.length) throw new Error(`${name} has no usable frame`);

  return {
    name, width, height, widthCompressed, bitsPerPixel, xOffset, yOffset,
    frameCount, offsets, lookUpTable, frames, warnings,
  };
}

/**
 * Decode one frame's RLE stream into palette indices.
 *
 * The RLE expands to `widthCompressed × height` bytes — the *packed* pixels — and each
 * row of those is then demuxed into `width` values and translated through the table.
 *
 * @param {Uint8Array} stream  the frame's own bytes
 * @param {{width:number, height:number, widthCompressed:number, bitsPerPixel:number, lookUpTable:Uint8Array}} spec
 * @returns {Uint8Array|null}  null when the stream was too short to be complete
 */
function decodeFrame(stream, spec) {
  const { width, height, widthCompressed, bitsPerPixel, lookUpTable } = spec;
  const packed = widthCompressed * height;
  const expanded = decodeRle(stream, packed);
  // `decodeRle` pads a short stream with zeros, so the *stream* is what has to be
  // measured: a frame whose own bytes do not account for every packed pixel is a
  // truncated frame, and it must be refused rather than drawn.
  if (countRlePixels(stream) < packed) return null;

  const indices = new Uint8Array(width * height);
  const demux = DEMUX[bitsPerPixel];
  const [stride, perStep] = DEMUX_STRIDE[bitsPerPixel] ?? [1, 1];
  const scratch = new Uint8Array(perStep);
  const last = lookUpTable.length - 1;

  for (let y = 0; y < height; y++) {
    const rowStart = y * widthCompressed;
    const dstStart = y * width;
    if (bitsPerPixel === 8) {
      // No packing to undo, and no table to look up: the bytes are the indices.
      for (let x = 0; x < width; x++) indices[dstStart + x] = expanded[rowStart + x];
      continue;
    }
    let left = width;
    for (let x = 0; left > 0 && x * stride < widthCompressed; x++) {
      demux(expanded.subarray(rowStart + x * stride, rowStart + x * stride + stride), scratch);
      const upTo = Math.min(perStep, left);
      for (let i = 0; i < upTo; i++) {
        const code = scratch[i];
        indices[dstStart + (x * perStep) + i] = code <= last ? lookUpTable[code] : lookUpTable[last];
      }
      left -= upTo;
    }
  }
  return indices;
}

/**
 * How many pixels a frame's RLE stream actually expands to, without expanding it.
 * @param {Uint8Array} src
 * @returns {number}
 */
export function countRlePixels(src) {
  let p = 0;
  let out = 0;
  while (p < src.length) {
    const control = src[p++];
    if (control & 0x80) {
      p++;                                  // the run's value
      out += control - 0x7f;
    } else {
      p += control + 1;                     // that many literal bytes
      out += control + 1;
    }
  }
  return out;
}

/**
 * The frame count and size of a `.CFA` without decoding its frames.
 *
 * @param {Uint8Array} bytes
 * @param {string} [name]
 * @returns {{width: number, height: number, widthCompressed: number, bitsPerPixel: number, frameCount: number}}
 */
export function cfaInfo(bytes, name = '.CFA') {
  if (bytes.length < CFA_LOOKUP_TABLE_OFFSET + 1) throw new Error(`${name} is too short to be a .CFA`);
  const u16 = (offset) => bytes[offset] | (bytes[offset + 1] << 8);
  return {
    width: u16(0), height: u16(2), widthCompressed: u16(4),
    bitsPerPixel: bytes[10],
    frameCount: Math.max(1, Math.min(CFA_TABLE_ENTRIES, bytes[11])),
  };
}

/**
 * The file name of a creature's sprite, for a given view file.
 *
 * Arena's creature files are `<NAME><view>.CFA` — `RAT1.CFA`…`RAT6.CFA`,
 * `WOLF01.CFA`…`WOLF06.CFA`, `THARN01.CFA`. The numbering is not zero-padded in the
 * data, so the caller passes the base name exactly as the archive spells it and this
 * appends the view number.
 *
 * @param {string} base  e.g. `RAT`, `WOLF0`, `THARN0`
 * @param {number} [view] 1…6
 * @returns {string}
 */
export function cfaName(base, view = 1) {
  return `${base}${Math.max(1, Math.min(9, Math.trunc(view)))}.CFA`;
}
