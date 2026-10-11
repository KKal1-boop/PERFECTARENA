// ARENA `.MIF` MAP DATA.
//
// A `.MIF` is a tagged container: an `MHDR` header, then one `LEVL` section per
// level. Each level holds tagged chunks, three of which are compressed voxel
// layers and the rest are placement records.
//
//   MHDR (67 bytes total: tag + u16 size + 61-byte payload)
//     +0  u8   unknown1
//     +1  u8   entryCount
//     +2  u16[4] startX       "centimetre-like" units, ÷128 for voxels
//     +10 u16[4] startY
//     +18 u8   startingLevelIndex
//     +19 u8   levelCount     (advisory: the level loop infers it)
//     +20 u8   unknown2
//     +21 u16  mapWidth       cells (X)
//     +23 u16  mapHeight      cells (Y)
//     +25 u8[34] unknown3     (2 payload bytes beyond this are unaccounted for)
//   LEVL × levelCount
//     +0 char[4] "LEVL"  +4 u16 size  +6 chunks…
//
// Chunk framing: `char[4] tag`, `u16 size`, payload. For `FLOR`/`MAP1`/`MAP2`
// the size *includes* the 2-byte uncompressed-length field, and the voxel data
// is Type-08 compressed.
//
// PROVENANCE: layout and chunk enumeration from OpenTESArena
// (`src/Assets/MIFFile.cpp`, `ArenaTypes.h`, MIT); every field below was
// re-checked against the real files in `c:/arenaproject/arena/ARENA` — see
// docs/FORMATS.md §3.

import { decodeType08 } from './decompress.js';

/** Voxel layers are compressed; the other chunks are not. */
const COMPRESSED_TAGS = new Set(['FLOR', 'MAP1', 'MAP2']);

/** Every chunk tag the format is known to use. */
const KNOWN_TAGS = new Set([
  'FLAT', 'FLOR', 'INFO', 'INNS', 'LOCK', 'LOOT', 'MAP1', 'MAP2', 'NAME', 'NUMF', 'STOR', 'TARG', 'TRIG',
]);

/** Bytes of the `MHDR` region, verified as `u16 headerSize + 6`. */
export const MIF_HEADER_TOTAL = 67;

/**
 * @typedef {object} MifLevel
 * @property {string} name              `NAME` chunk (human name of the level)
 * @property {string} info              `INFO` chunk — **the `.INF` filename**
 * @property {number} numf              `NUMF` floor-texture count
 * @property {Uint16Array|null} flor    width*height floor IDs, row-major (X fastest)
 * @property {Uint16Array|null} map1    primary voxel IDs
 * @property {Uint16Array|null} map2    secondary voxel IDs / height classes
 * @property {Uint8Array} flat
 * @property {Uint8Array} inns
 * @property {Uint8Array} loot
 * @property {Uint8Array} stor
 * @property {{x:number,y:number}[]} targ
 * @property {{x:number,y:number,lockLevel:number}[]} lock
 * @property {{x:number,y:number,textIndex:number,soundIndex:number}[]} trig
 * @property {string[]} unknownTags      tags this parser skipped
 * @property {string[]} warnings         recoverable oddities found while reading (see below)
 */

/**
 * @typedef {object} MifFile
 * @property {string} name
 * @property {number} width             cells across (X)
 * @property {number} height            cells down (Y)
 * @property {number} startingLevelIndex
 * @property {number} levelCount        levels actually parsed
 * @property {number} declaredLevelCount
 * @property {number} entryCount
 * @property {{x:number,y:number}[]} startPoints   "centimetre-like" units
 * @property {MifLevel[]} levels
 */
//
// Two quirks of the shipped data are handled rather than rejected:
//
//  * **Oversized voxel layers.** Arena's own decoder comment says a layer's
//    uncompressed size "seems to be more space than the level can fit", and
//    that is real: `VILPAL3.MIF`'s second level (named `test2`, INF `sd1.inf`)
//    declares a 25×25 map but ships a 100×100 grid. Such a layer is read for the
//    first `width × height` voxels and the remainder ignored, exactly as the
//    original does, with a warning recorded.
//  * **Reversed level order.** `BS5.MIF` lists `level3`, `level2`, `level1` in
//    that physical order, and its `startingLevelIndex` is 2 — so the start index
//    is an index into the physical array, not a level *number*. Never sort by
//    the `NAME` chunk.

/**
 * Parse a `.MIF` map.
 *
 * @param {Uint8Array} bytes
 * @param {string} [name]
 * @returns {MifFile}
 */
export function parseMif(bytes, name = '') {
  if (bytes.length < MIF_HEADER_TOTAL) throw new Error(`.MIF ${name} is only ${bytes.length} bytes`);
  if (tag(bytes, 0) !== 'MHDR') throw new Error(`.MIF ${name} does not start with MHDR (got ${JSON.stringify(tag(bytes, 0))})`);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint16(4, true);
  const p = 6;   // payload start

  const entryCount = bytes[p + 1];
  const startPoints = [];
  for (let i = 0; i < 4; i++) {
    startPoints.push({ x: view.getUint16(p + 2 + i * 2, true), y: view.getUint16(p + 10 + i * 2, true) });
  }
  const startingLevelIndex = bytes[p + 18];
  const declaredLevelCount = bytes[p + 19];
  const width = view.getUint16(p + 21, true);
  const height = view.getUint16(p + 23, true);

  if (!width || !height) throw new Error(`.MIF ${name} has zero dimensions (${width}×${height})`);

  const levels = [];
  let offset = headerSize + 6;
  while (offset + 6 <= bytes.length) {
    if (tag(bytes, offset) !== 'LEVL') {
      // Not a LEVL where one is expected: stop rather than mis-read garbage.
      break;
    }
    const sectionSize = view.getUint16(offset + 4, true);
    const end = Math.min(offset + 6 + sectionSize, bytes.length);
    levels.push(readLevel(bytes, view, offset + 6, end, width, height, name));
    offset = offset + 6 + sectionSize;
    if (sectionSize === 0) break;
  }

  return {
    name,
    width,
    height,
    startingLevelIndex,
    levelCount: levels.length,
    declaredLevelCount,
    entryCount,
    startPoints,
    levels,
  };
}

/**
 * Read one `LEVL` section's chunks.
 * @returns {MifLevel}
 */
function readLevel(bytes, view, start, end, width, height, mifName) {
  const level = {
    name: '',
    info: '',
    numf: 0,
    flor: null,
    map1: null,
    map2: null,
    flat: new Uint8Array(0),
    inns: new Uint8Array(0),
    loot: new Uint8Array(0),
    stor: new Uint8Array(0),
    targ: [],
    lock: [],
    trig: [],
    unknownTags: [],
    warnings: [],
  };

  let p = start;
  while (p + 6 <= end) {
    const t = tag(bytes, p);
    const size = view.getUint16(p + 4, true);
    const dataStart = p + 6;
    const dataEnd = dataStart + size;

    if (!KNOWN_TAGS.has(t)) {
      // Unknown chunk: resynchronise on the next tag we recognise instead of
      // trusting a size field we cannot interpret.
      level.unknownTags.push(t);
      const next = findNextTag(bytes, p + 4, end);
      if (next < 0) break;
      p = next;
      continue;
    }
    if (dataEnd > end) break;   // truncated level; stop cleanly

    switch (t) {
      case 'NAME': level.name = cstring(bytes, dataStart, dataEnd); break;
      case 'INFO': level.info = cstring(bytes, dataStart, dataEnd); break;
      case 'NUMF': level.numf = bytes[dataStart]; break;
      case 'FLOR': level.flor = decodeLayer(bytes, view, p, width, height, t, level.warnings); break;
      case 'MAP1': level.map1 = decodeLayer(bytes, view, p, width, height, t, level.warnings); break;
      case 'MAP2': level.map2 = decodeLayer(bytes, view, p, width, height, t, level.warnings); break;
      case 'FLAT': level.flat = bytes.slice(dataStart, dataEnd); break;
      case 'INNS': level.inns = bytes.slice(dataStart, dataEnd); break;
      case 'LOOT': level.loot = bytes.slice(dataStart, dataEnd); break;
      case 'STOR': level.stor = bytes.slice(dataStart, dataEnd); break;
      case 'TARG':
        for (let i = 0; i + 2 <= size; i += 2) level.targ.push({ x: bytes[dataStart + i], y: bytes[dataStart + i + 1] });
        break;
      case 'LOCK':
        for (let i = 0; i + 3 <= size; i += 3) {
          level.lock.push({ x: bytes[dataStart + i], y: bytes[dataStart + i + 1], lockLevel: bytes[dataStart + i + 2] });
        }
        break;
      case 'TRIG':
        for (let i = 0; i + 4 <= size; i += 4) {
          level.trig.push({
            x: bytes[dataStart + i], y: bytes[dataStart + i + 1],
            textIndex: bytes[dataStart + i + 2], soundIndex: bytes[dataStart + i + 3],
          });
        }
        break;
      default: break;
    }

    // The compressed layers report a size that includes the 2-byte uncompressed
    // length, and `DECODE` consumes it; all chunks advance by size + 6.
    p = dataStart + size;
    if (COMPRESSED_TAGS.has(t) && size === 0) break;
  }
  return level;
}

/**
 * Decode one compressed voxel layer.
 *
 * Verified framing: `compressedSize` includes the `uncompressedSize` field, and
 * for the ordinary case `uncompressedSize == width × height × 2` exactly. Layers
 * that ship *more* data than the map needs are read for the first
 * `width × height` voxels, matching Arena's own decoder, and noted in
 * `warnings`; see the note above the typedef.
 *
 * @param {Uint8Array} bytes @param {DataView} view @param {number} tagStart
 * @param {number} width @param {number} height @param {string} tag
 * @param {string[]} warnings
 * @returns {Uint16Array} width*height voxel IDs, row-major (X fastest)
 */
function decodeLayer(bytes, view, tagStart, width, height, tag, warnings) {
  const compressedSize = view.getUint16(tagStart + 4, true);
  const uncompressedSize = view.getUint16(tagStart + 6, true);
  const expected = width * height * 2;
  const src = bytes.subarray(tagStart + 8, tagStart + 6 + compressedSize);

  if (uncompressedSize !== expected) {
    const cells = uncompressedSize / 2;
    warnings.push(
      `${tag}: layer holds ${uncompressedSize} B (${cells} cells) but ${width}×${height} needs ${expected} B`
      + (uncompressedSize > expected ? ' — reading the first frame' : ' — padding with zeros'),
    );
  }

  const flat = decodeType08(src, Math.max(uncompressedSize, expected));
  const out = new Uint16Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = flat[i * 2] | (flat[i * 2 + 1] << 8);
  }
  return out;
}

/** @param {Uint8Array} bytes @param {number} at @returns {string} */
function tag(bytes, at) {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/**
 * Read a NUL-terminated string.
 * @param {Uint8Array} bytes @param {number} from @param {number} to
 */
function cstring(bytes, from, to) {
  let s = '';
  for (let i = from; i < to && bytes[i] !== 0; i++) s += String.fromCharCode(bytes[i]);
  return s.trim();
}

/**
 * Find the offset of the next recognised chunk tag at or after `from`.
 * @returns {number} offset, or -1
 */
function findNextTag(bytes, from, end) {
  for (let i = from; i + 4 <= end; i++) {
    if (KNOWN_TAGS.has(tag(bytes, i)) || tag(bytes, i) === 'LEVL') return i;
  }
  return -1;
}
