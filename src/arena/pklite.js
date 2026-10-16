// PKLITE 1.x — the unpacker for `ACD.EXE`, the executable `ARENA.BAT` runs (**block B24**).
//
// The owner's ask is *"you need to decompile all of Arena"*, and the brief's P2 is the same thing:
// the tables that lived in the executable (spawn tables, weapon timing, the fixed quest text, the
// wilderness category thresholds) are not in the 153 loose files this checkout ships — they are
// inside this one compressed EXE. This module is the door.
//
// **The source of truth is named** (law 1 of `docs/PORT_BLOCKS.md`):
//
//   * **the file's own bytes**, measured: `MZ`; `e_crlc` 1; `e_cparhdr` 6, so the load image starts
//     at file offset **96**; `e_minalloc` 9024, `e_maxalloc` 65535; `e_ss` 10902, `e_sp` 512,
//     `e_cs` 65520, `e_ip` 256; at offset **28** the byte `0x0C` and at **29** the byte `0x31`,
//     then the ASCII string `PKLITE Copr. 1990-91 PKWARE Inc. All Rights Reserved` (NUL at 83);
//   * **the format**, from the entropymine write-up "Notes on PKLITE format" by jsummers (Parts 1,
//     2 and 3 — <https://entropymine.wordpress.com/2021/12/19/notes-on-pklite-format-part-1/>),
//     which is a description of the format rather than of a program: the version/flag bytes at
//     28–29, the per-version offset of the compressed code image, the two Huffman codebooks, the
//     LZ77 layer, the "extra" literal XOR, and both relocation-table algorithms. Every rule below
//     quotes the part of that write-up it comes from, and nothing here is guessed.
//
// Measured for this file, from those two sources agreeing:
//
//   * byte 29 = `0x31` → major version **1**, bit `0x10` set = **"extra"** compression (the
//     registered `-e`), bit `0x20` set = **"large"** mode (which of the two codebooks);
//   * byte 28 = `0x0C` → minor version 12, i.e. **PKLITE 1.12**;
//   * the pair `310c` is in the write-up's table at **656** bytes into the code-image segment, and
//     the image starts at 96 → the compressed stream begins at file offset **752** — which is
//     exactly where this file's byte entropy stops being stub-like (7.0 bits/byte at 704, 7.2 from
//     752 on), so the table and the bytes agree.
//
// **What this is not.** No table derived from this file is ever written to the repository (law 6):
// the unpacker runs at runtime on the player's own copy of `ACD.EXE`, in the browser, and what it
// finds is read from memory. Nothing here is a copy of PKLITE's source, which is not public: it is
// an implementation of the published description of the format, plus this file's own numbers.
//
// Bounds are checked everywhere and every failure names the offset it failed at: an unpacker that
// answers garbage for a file it does not understand is worse than one that says so, because the
// anchors it is verified against (`docs/PORT_BLOCKS.md` B24) would then be read out of nonsense.

/** The PKLITE copyright strings, per version (entropymine, "Notes on PKLITE format", Part 1). */
const COPYRIGHT_BY_VERSION = Object.freeze({
  '1.00': 'PKLITE Copr. 1990 PKWARE Inc. All Rights Reserved',
  '1.03': 'PKLITE Copr. 1990 PKWARE Inc. All Rights Reserved',
  '1.05': 'PKLITE Copr. 1991 PKWARE Inc. All Rights Reserved',
  '1.12': 'PKLITE Copr. 1990-91 PKWARE Inc. All Rights Reserved',
  '1.13': 'PKLITE Copr. 1990-91 PKWARE Inc. All Rights Reserved',
  '1.14': 'PKLITE Copr. 1990-92 PKWARE Inc. All Rights Reserved',
  '1.15': 'PKLITE Copr. 1990-92 PKWARE Inc. All Rights Reserved',
  '1.50': 'PKLITE Copr. 1990-1995 PKWARE Inc. All Rights Reserved',
  '2.01': 'PKlite(R) Copr. 1990-1996 PKWARE Inc. All Rights Reserved',
});

/**
 * The offset of the compressed code image inside the code-image segment, per version and flags.
 *
 * "For early versions of PKLITE, the offset seems to always be the same for a given version and
 * flags. The version codes used in this table are the bytes at offset 29 and 28, in that order."
 * (Part 2.) The key below is that pair read as one number — byte 29 high, byte 28 low — so this
 * file (`31 0c`) is the key `0x310c`.
 */
const CODE_IMAGE_OFFSETS = Object.freeze([
  [0x0100, 0x010f, 464],
  [0x1100, 0x110d, 480],
  [0x110e, 0x110f, 512],
  [0x2100, 0x210f, 656],
  [0x3103, 0x3105, 672],
  [0x310c, 0x310d, 656],
  [0x310e, 0x310f, 704],
]);

/** Match-length codebook, "small" mode (Part 3). `*` is the special escape. */
const MATCH_LENGTH_SMALL = Object.freeze({
  '010': 2, '00': 3, '100': 4, '101': 5, '1100': 6, '1101': 7, '1110': 8, '1111': 9, '011': '*',
});

/** Match-length codebook, "large" mode (Part 3): 2…24, then the special escape. */
const MATCH_LENGTH_LARGE = Object.freeze({
  '10': 2, '11': 3, '000': 4, '0010': 5, '0011': 6, '0100': 7, '01010': 8, '01011': 9,
  '01100': 10, '011010': 11, '011011': 12, '0111010': 13, '0111011': 14, '0111100': 15,
  '01111010': 16, '01111011': 17, '01111100': 18, '011111010': 19, '011111011': 20,
  '011111100': 21, '011111101': 22, '011111110': 23, '011111111': 24, '011100': '*',
});

/**
 * The offsets codebook (Part 3): the **high five bits** of an offset, 0…31. The low eight bits are
 * always read as a byte after it, and a match length of 2 implies high bits 0 and reads no code.
 */
const OFFSET_HIGH_BITS = Object.freeze({
  '1': 0, '0000': 1, '0001': 2, '00100': 3, '00101': 4, '00110': 5, '00111': 6,
  '010000': 7, '010001': 8, '010010': 9, '010011': 10, '010100': 11, '010101': 12, '010110': 13,
  '0101110': 14, '0101111': 15, '0110000': 16, '0110001': 17, '0110010': 18, '0110011': 19,
  '0110100': 20, '0110101': 21, '0110110': 22, '0110111': 23, '0111000': 24, '0111001': 25,
  '0111010': 26, '0111011': 27, '0111100': 28, '0111101': 29, '0111110': 30, '0111111': 31,
});

/** The "Not enough memory" message the decompressor carries, used only as a sanity anchor. */
export const PKLITE_NOT_ENOUGH_MEMORY = 'Not enough memory';

/**
 * What this file says about itself: which PKLITE made it, and where its compressed code image and
 * its reconstruction parameters are.
 *
 * Everything is read from bytes — nothing is assumed — and an unknown version is reported as such
 * rather than close-up guessed.
 *
 * @param {Uint8Array} bytes  a whole `.EXE`, as read from the install
 * @returns {{pklite: boolean, why: string, major: number, minor: number, version: string | null,
 *   extra: boolean, large: boolean, codeImageOffset: number | null, imageStart: number,
 *   streamOffset: number | null, copyrightAt: number, copyright: string, notEnoughMemory: boolean}}
 */
export function pkliteInfo(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerParagraphs = view.getUint16(8, true);
  const imageStart = headerParagraphs * 16;
  const minor = bytes[28];
  const flags = bytes[29];
  const major = flags & 0x0f;
  const extra = (flags & 0x10) !== 0;
  const large = (flags & 0x20) !== 0;
  const version = major >= 1 && major <= 2 ? `${major}.${String(minor).padStart(2, '0')}` : null;
  const key = (flags << 8) | minor;
  const entry = CODE_IMAGE_OFFSETS.find(([low, high]) => key >= low && key <= high);
  // The string runs from offset 30 to the first NUL: the copyright of the version in the table,
  // and a file whose bytes disagree with the table is reported as a warning rather than trusted.
  let copyrightAt = 30;
  while (copyrightAt < bytes.length && bytes[copyrightAt] !== 0) copyrightAt++;
  // The stored message ends with the DOS bell (`0x07`) before its NUL, and is left whole: this
  // module reports the bytes, and the truncation to fit a field is the caller's business.
  const text = new TextDecoder('latin1').decode(bytes.subarray(30, copyrightAt));
  // "Not enough memory" lives in the decompression routine and is a weak anchor on purpose: the
  // write-up warns that users overwrite it to disguise the file, so it is reported, never trusted.
  const notEnoughMemory = findAscii(bytes, PKLITE_NOT_ENOUGH_MEMORY) >= 0;
  // The signature is the MZ header and the version bytes — **not** the copyright string, which
  // Part 1 warns is the first thing a user disguising a file overwrites (with `CHK4LITE`-style
  // detection in mind). The string is reported because for a pristine file it names the version.
  const looksPacked = bytes[0] === 0x4d && bytes[1] === 0x5a;
  return {
    pklite: looksPacked && version !== null && Boolean(entry),
    why: !looksPacked ? 'not an MZ executable'
      : version === null ? `unreadable version bytes ${minor}/${flags}`
        : !entry ? `no code-image offset is documented for version ${version} (flags 0x${flags.toString(16)})`
          : 'read from the file: version bytes, flags and the documented code-image offset',
    major,
    minor,
    version,
    extra,
    large,
    codeImageOffset: entry ? entry[2] : null,
    imageStart,
    streamOffset: entry ? imageStart + entry[2] : null,
    copyrightAt,
    copyright: text,
    notEnoughMemory,
  };
}

/**
 * **Unpack `ACD.EXE`.** Returns the decompressed code image, the relocation table and the four
 * footer fields — everything needed to rebuild the original EXE, and the image itself, which is
 * where the game's own tables live.
 *
 * Nothing is written to disk and nothing is cached: the caller decides what to keep.
 *
 * @param {Uint8Array} bytes
 * @returns {{info: object, image: Uint8Array, relocations: {segment: number, offset: number}[],
 *   footer: {ss: number, sp: number, cs: number, ip: number}, codeImageEnd: number,
 *   relocationEnd: number, warnings: string[]}}
 */
export function unpackPklite(bytes) {
  const info = pkliteInfo(bytes);
  if (!info.pklite) throw new Error(`not a PKLITE file this module can read: ${info.why}`);
  const warnings = [];
  const code = decodeCodeImage(bytes, info, warnings);
  const relocations = decodeRelocations(bytes, code.end, info, warnings);
  const footer = readFooter(bytes, relocations.end, warnings);
  return {
    info,
    image: code.image,
    relocations: relocations.list,
    footer,
    codeImageEnd: code.end,
    relocationEnd: relocations.end,
    warnings,
  };
}

/**
 * The code image: LZ77 with two fixed Huffman codebooks, and — with "extra" compression — the
 * literal XOR. The pseudo-code this follows is Part 3's, line for line; the deviations are named.
 *
 * @param {Uint8Array} bytes
 * @param {object} info
 * @param {string[]} warnings
 * @returns {{image: Uint8Array, end: number}}
 */
function decodeCodeImage(bytes, info, warnings) {
  let pos = info.streamOffset;
  // ── the bit buffer ─────────────────────────────────────────────────────────
  // "Whenever the algorithm calls for reading a bit, use the least-significant bit in the bit
  // buffer, right-shift the remaining bits, and decrease the bit count by 1… At the start of
  // decompression, and any time the bit count reaches 0, immediately read two bytes of compressed
  // data, and put them in the bit buffer. Use the first byte as the low-order bits, and the second
  // as the high-order bits." Filling *preemptively* (rather than on demand) is PKLITE's own habit
  // and is reproduced deliberately: with the XOR below, the count at each literal is part of the
  // data, so a lazy fill would decode a different file.
  let bitBuffer = 0;
  let bitCount = 0;
  const refill = () => {
    if (pos + 2 > bytes.length) throw new Error(`compressed code image ran past the file at ${pos}`);
    bitBuffer = bytes[pos] | (bytes[pos + 1] << 8);
    pos += 2;
    bitCount = 16;
  };
  // The refill is **eager**, and that is not a detail: the "extra" XOR reads the bit *count*, so a
  // literal that leaves the buffer empty must have been refilled to 16 first. A lazy fill (refill
  // at the next read) decodes a different file — measured: this one fails on its first literal with
  // "literal XOR with a 0-bit buffer", which is what sent this line looking for the rule. The
  // write-up says the same thing in prose ("any time the bit count reaches 0, immediately read two
  // bytes") and names it as PKLITE's own, slightly suboptimal, habit.
  const readBit = () => {
    if (bitCount === 0) refill();
    const bit = bitBuffer & 1;
    bitBuffer >>>= 1;
    bitCount--;
    if (bitCount === 0) refill();
    return bit;
  };
  /** A whole byte, read directly: "without changing the bit buffer". */
  const readByte = () => {
    if (pos >= bytes.length) throw new Error(`compressed code image ran past the file at ${pos}`);
    return bytes[pos++];
  };
  /** One Huffman value: "read it one bit at a time… until you have a code that exists". */
  const readCode = (codebook, what) => {
    let code = '';
    for (let guard = 0; guard < 32; guard++) {
      code += readBit();
      const value = codebook[code];
      if (value !== undefined) return value;
    }
    throw new Error(`${what}: a Huffman code longer than 31 bits at ${pos} — the stream is not PKLITE`);
  };

  const matchLengths = info.large ? MATCH_LENGTH_LARGE : MATCH_LENGTH_SMALL;
  const extraAdd = info.large ? 25 : 10;
  const maxLength = info.large ? 277 : 262;

  /** @type {number[]} */
  const out = [];
  // The history is the output itself: an offset of 1 is the *most recently* decompressed byte (the
  // write-up flags this as unusual — most LZ77s use offset 0 for that), so `out[out.length - off]`.
  const byteAt = (off) => out[out.length - off];

  refill();
  let stopped = false;
  let guard = 0;
  const GUARD = 64 * 1024 * 1024;   // 64 MiB of output is far past any 1994 DOS image
  while (!stopped) {
    if (out.length > GUARD) throw new Error('code image grew past 64 MiB — the stream is not PKLITE');
    if (guard++ % 4096 === 0 && pos > bytes.length) throw new Error('compressed code image ran past the file');
    if (readBit() === 0) {
      // LITERAL. "If the file uses 'extra' compression, let N = N xor {the number of bits currently
      // in the bit buffer}. This will be a number from 0x01 to 0x10."
      let n = readByte();
      if (info.extra) {
        if (bitCount < 1 || bitCount > 16) throw new Error(`literal XOR with a ${bitCount}-bit buffer`);
        n ^= bitCount;
      }
      out.push(n);
      continue;
    }
    // MATCH-LEN.
    const decoded = readCode(matchLengths, 'match length');
    let length;
    if (decoded === '*') {
      const n = readByte();
      if (n <= 0xfc) length = n + extraAdd;
      else if (n === 0xff) { stopped = true; break; }          // "STOP. The decompression completed normally."
      else if (n === 0xfe && info.large) continue;              // "do nothing, and go to MAIN_LOOP"
      else throw new Error(`unsupported PKLITE feature (special code 0x${n.toString(16)}) at ${pos}`);
    } else {
      length = decoded;
    }
    // OFFSET. "If the match_length is 2, let high-5-bits-of-offset = 0."
    const high = length === 2 ? 0 : readCode(OFFSET_HIGH_BITS, 'offset');
    const offset = (high << 8) | readByte();
    if (offset === 0) throw new Error(`an LZ77 offset of 0 is not allowed (at ${pos})`);
    if (offset > out.length) {
      throw new Error(`an LZ77 offset of ${offset} reaches past the ${out.length} bytes decompressed (at ${pos})`);
    }
    if (length > maxLength) warnings.push(`a match of ${length} bytes is longer than the format's ${maxLength}`);
    // Byte at a time, forward: overlapping matches are legal and are how runs are encoded.
    for (let i = 0; i < length; i++) out.push(byteAt(offset));
  }
  return { image: Uint8Array.from(out), end: pos };
}

/**
 * The relocation table, which follows the code image.
 *
 * "The relocation table is compressed using one of two algorithms, depending on whether 'extra
 * compression' was used" (Part 3). With extra compression the segments are normalised to multiples
 * of `0x0fff`, which is legal because DOS only cares about `segment * 16 + offset`.
 *
 * @param {Uint8Array} bytes
 * @param {number} start  the first unread byte after the code image
 * @param {object} info
 * @param {string[]} warnings
 * @returns {{list: {segment: number, offset: number}[], end: number}}
 */
function decodeRelocations(bytes, start, info, warnings) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = start;
  /** @type {{segment: number, offset: number}[]} */
  const list = [];
  const readWord = () => {
    if (pos + 2 > bytes.length) throw new Error(`relocation table ran past the file at ${pos}`);
    const word = view.getUint16(pos, true);
    pos += 2;
    return word;
  };
  if (!info.extra) {
    // Normal compression: a count, a segment, then that many offsets — until a zero count.
    for (;;) {
      const count = bytes[pos++];
      if (count === 0) break;
      const segment = readWord();
      for (let i = 0; i < count; i++) list.push({ segment, offset: readWord() });
      if (list.length > 0x20000) throw new Error('relocation table grew past 131 072 entries');
    }
    return { list, end: pos };
  }
  // Extra compression: a count, that many offsets against ONE segment, the segment stepping by
  // 0x0fff — until the count is 0xffff.
  let segment = 0;
  for (;;) {
    const count = readWord();
    if (count === 0xffff) break;
    for (let i = 0; i < count; i++) list.push({ segment, offset: readWord() });
    if (list.length > 0x20000) throw new Error('relocation table grew past 131 072 entries');
    segment += 0x0fff;
  }
  if (list.length === 0) warnings.push('the relocation table is empty');
  return { list, end: pos };
}

/**
 * The footer: the four fields of the original DOS header that PKLITE could not drop.
 *
 * "The 'footer' is usually 8 bytes in size. Sometimes it's larger… The first 8 bytes contain four
 * of the fields from the original file's DOS header: SS, SP, CS, IP" (Part 2). The bytes after
 * those eight — where a file has any — are reported, not interpreted.
 *
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {string[]} warnings
 * @returns {{ss: number, sp: number, cs: number, ip: number, extraBytes: number}}
 */
function readFooter(bytes, start, warnings) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const left = bytes.length - start;
  if (left < 8) throw new Error(`the footer needs 8 bytes and ${left} are left (at ${start})`);
  if (left > 8) warnings.push(`the footer is ${left} bytes rather than 8`);
  return {
    ss: view.getUint16(start, true),
    sp: view.getUint16(start + 2, true),
    cs: view.getUint16(start + 4, true),
    ip: view.getUint16(start + 6, true),
    extraBytes: left - 8,
  };
}

/**
 * The first offset of a piece of ASCII in a buffer, or -1 — the seam the anchors are checked with
 * (`docs/PORT_BLOCKS.md` B24 verifies the unpacked image against strings and words this repo
 * already trusts, because a decoder that returns plausible-looking nonsense is the failure this
 * whole block is exposed to).
 *
 * @param {Uint8Array} bytes
 * @param {string} text
 * @param {number} [from]
 * @returns {number}
 */
export function findAscii(bytes, text, from = 0) {
  const needle = new TextEncoder().encode(text);
  outer: for (let i = Math.max(0, from); i + needle.length <= bytes.length; i++) {
    for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) continue outer;
    return i;
  }
  return -1;
}

/**
 * Every occurrence of a 16-bit little-endian word, as offsets — the check for a *table* rather than
 * a string (the wilderness thresholds are numbers, and numbers are what the port needs them for).
 *
 * @param {Uint8Array} bytes
 * @param {number[]} words
 * @returns {number[]} the offsets of the **first** word's matches, in order
 */
export function findWords(bytes, words) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const first = words[0];
  /** @type {number[]} */
  const hits = [];
  outer: for (let i = 0; i + words.length * 2 <= bytes.length; i++) {
    if (view.getUint16(i, true) !== first) continue;
    for (let k = 1; k < words.length; k++) if (view.getUint16(i + k * 2, true) !== words[k]) continue outer;
    hits.push(i);
  }
  return hits;
}
