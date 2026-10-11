// ARENA'S COMPRESSION SCHEMES.
//
// Four different codecs appear in Arena's data:
//
//   `decodeType08`     MIF voxel layers (MAP1/MAP2/FLOR) and type-8 IMG/CIF
//   `decodeType04`     type-4 IMG/CIF
//   `decodeRle`        byte RLE for the remaining IMG/CIF payloads
//   `decodeRleWords`   .RMD wilderness blocks
//
// The Type08 scheme is an ADAPTIVE HUFFMAN CODER WITH A 4096-BYTE SLIDING
// HISTORY: a codeword below 256 is a literal byte, and a codeword at or above
// 256 is a back-reference whose length comes from the codeword and whose offset
// is read from the bitstream through two 256-entry tables. The Huffman tree
// re-weights itself after every symbol, so the decoder and the encoder must
// agree on the exact re-ordering rule — hence the careful transcription of the
// frequency-sort step below.
//
// PROVENANCE: the format and this algorithm were documented by the
// **OpenTESArena** project (MIT), which reverse-engineered them from A.EXE.
// This is an independent JavaScript implementation written from that
// description; see docs/FORMATS.md §5 and the credits there. Arena's own
// developers are reported to have called it "Delta Mode".
//
// Every function here is pure and allocation-bounded, so they run identically
// in Node (the unit tests) and in the browser (the game).

/** Symbols: 256 literals + back-references. */
const LEAF_BASE = 627;
/** Sliding history, in bytes. */
const HISTORY_SIZE = 4096;

/**
 * The initial adaptive-Huffman state, built exactly as the encoder builds it:
 * 314 internal nodes with frequency 1 and 313 leaves with frequency 2.
 */
function initialHuffman() {
  const nodeTree = new Uint16Array(627);
  const nodeFreq = new Uint16Array(627);
  const nodeIdxMap = new Uint16Array(941);

  for (let i = 0; i < 314; i++) nodeTree[i] = 627 + i;
  for (let i = 0; i < 313; i++) nodeTree[314 + i] = i * 2;

  nodeFreq.fill(1, 0, 314);
  for (let i = 0; i < 313; i++) nodeFreq[314 + i] = nodeFreq[2 * i] + nodeFreq[2 * i + 1];

  for (let i = 0; i < 626; i++) nodeIdxMap[i] = (i >> 1) + 314;
  nodeIdxMap[626] = 0;
  for (let i = 0; i < 314; i++) nodeIdxMap[627 + i] = i;

  return { nodeTree, nodeFreq, nodeIdxMap };
}

/**
 * High bits of a back-reference's offset, indexed by the first 8 bitstream bits.
 * @type {Uint8Array}
 */
const HIGH_OFFSET_BITS = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
  0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02,
  0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
  0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09, 0x09,
  0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b,
  0x0c, 0x0c, 0x0c, 0x0c, 0x0d, 0x0d, 0x0d, 0x0d, 0x0e, 0x0e, 0x0e, 0x0e, 0x0f, 0x0f, 0x0f, 0x0f,
  0x10, 0x10, 0x10, 0x10, 0x11, 0x11, 0x11, 0x11, 0x12, 0x12, 0x12, 0x12, 0x13, 0x13, 0x13, 0x13,
  0x14, 0x14, 0x14, 0x14, 0x15, 0x15, 0x15, 0x15, 0x16, 0x16, 0x16, 0x16, 0x17, 0x17, 0x17, 0x17,
  0x18, 0x18, 0x19, 0x19, 0x1a, 0x1a, 0x1b, 0x1b, 0x1c, 0x1c, 0x1d, 0x1d, 0x1e, 0x1e, 0x1f, 0x1f,
  0x20, 0x20, 0x21, 0x21, 0x22, 0x22, 0x23, 0x23, 0x24, 0x24, 0x25, 0x25, 0x26, 0x26, 0x27, 0x27,
  0x28, 0x28, 0x29, 0x29, 0x2a, 0x2a, 0x2b, 0x2b, 0x2c, 0x2c, 0x2d, 0x2d, 0x2e, 0x2e, 0x2f, 0x2f,
  0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f,
]);

/**
 * How many bits of the low offset follow, by the same 8-bit index.
 * @type {Uint8Array}
 */
const LOW_OFFSET_BIT_COUNT = new Uint8Array([
  0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
  0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
  0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
  0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
  0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
  0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
]);

/**
 * Decode a Type08 stream (MIF voxel layers, type-8 IMG/CIF).
 *
 * @param {Uint8Array} src     compressed bytes
 * @param {number} outSize     exact number of bytes to produce
 * @returns {Uint8Array} exactly `outSize` bytes
 */
export function decodeType08(src, outSize) {
  const out = new Uint8Array(outSize);
  const history = new Uint8Array(HISTORY_SIZE).fill(0x20);
  let historyPos = 0;

  const { nodeTree, nodeFreq, nodeIdxMap } = initialHuffman();

  let bitmask = 0;      // a 16-bit window over the input, as the original uses
  let validBits = 0;
  let p = 0;            // read cursor into src

  /** Pull bytes until `need` bits are buffered. Past EOF, zeros are fed. */
  const fill = (need) => {
    while (validBits < need) {
      const byte = p < src.length ? src[p++] : 0;
      bitmask = (bitmask | (byte << (8 - validBits))) & 0xffff;
      validBits += 8;
    }
  };

  let dst = 0;
  while (dst < outSize) {
    // ── walk the adaptive Huffman tree to a leaf ────────────────────────────
    let node = nodeTree[626];
    while (node < LEAF_BASE) {
      fill(9);
      node = nodeTree[node + ((bitmask >> 15) & 1)];
      bitmask = (bitmask << 1) & 0xffff;
      validBits--;
    }

    // ── re-weight: bump this leaf's frequency and re-sort the tree ──────────
    let freqIdx = nodeIdxMap[node];
    do {
      nodeFreq[freqIdx] += 1;
      const freq = nodeFreq[freqIdx];
      let nextIdx = freqIdx + 1;
      if (nextIdx < nodeFreq.length && nodeFreq[nextIdx] < freq) {
        // The next slot holding a frequency at least this large...
        do { nextIdx++; } while (nextIdx < nodeFreq.length && nodeFreq[nextIdx] < freq);
        nextIdx--;
        // ...swap the pair past it, then repair the index maps.
        nodeFreq[freqIdx] = nodeFreq[nextIdx];
        nodeFreq[nextIdx] = freq;
        const t = nodeTree[freqIdx];
        nodeTree[freqIdx] = nodeTree[nextIdx];
        nodeTree[nextIdx] = t;
        let mapIdx = nodeTree[nextIdx];
        nodeIdxMap[mapIdx] = nextIdx;
        if (mapIdx < LEAF_BASE) nodeIdxMap[mapIdx + 1] = nextIdx;
        mapIdx = nodeTree[freqIdx];
        nodeIdxMap[mapIdx] = freqIdx;
        if (mapIdx < LEAF_BASE) nodeIdxMap[mapIdx + 1] = freqIdx;
        freqIdx = nextIdx;
      }
      freqIdx = nodeIdxMap[freqIdx];   // up to the parent
    } while (freqIdx !== 0);

    const codeword = node - LEAF_BASE;
    if (codeword < 256) {
      // ── literal ──────────────────────────────────────────────────────────
      const byte = codeword & 0xff;
      history[historyPos++ & 0x0fff] = byte;
      out[dst++] = byte;
    } else {
      // ── back-reference: 8 offset-selecting bits, then the low offset bits ─
      fill(9);
      const tableIdx = bitmask >> 8;
      bitmask = (bitmask << 8) & 0xffff;
      validBits -= 8;

      const offsetHigh = HIGH_OFFSET_BITS[tableIdx] << 6;
      const bits = LOW_OFFSET_BIT_COUNT[tableIdx] - 2;
      let offsetLow = tableIdx;
      for (let i = 0; i < bits; i++) {
        fill(9);
        offsetLow = ((offsetLow << 1) | ((bitmask >> 15) & 1)) & 0xffff;
        bitmask = (bitmask << 1) & 0xffff;
        validBits--;
      }

      let copyPos = historyPos - (offsetHigh | (offsetLow & 0x003f)) - 1;
      const toCopy = codeword - 256 + 3;
      for (let i = 0; i < toCopy && dst < outSize; i++) {
        const b = history[copyPos++ & 0x0fff];
        history[historyPos++ & 0x0fff] = b;
        out[dst++] = b;
      }
    }
  }
  return out;
}

/**
 * Decode a Type04 stream (IMG and CIF: a 1-bit mask per 8 symbols, alternating
 * literal bytes and LZ back-references into a 4096-byte history).
 *
 * @param {Uint8Array} src
 * @param {number} outSize
 * @returns {Uint8Array}
 */
export function decodeType04(src, outSize) {
  const out = new Uint8Array(outSize);
  const history = new Uint8Array(4096).fill(0x20);
  let historyPos = 0;
  let dst = 0;
  let p = 0;
  let bitsLeft = 0;
  let mask = 0;

  while (p < src.length && dst < outSize) {
    if (!bitsLeft) { bitsLeft = 8; mask = src[p++]; }
    else mask >>= 1;

    if (mask & 1) {
      const b = src[p++];
      history[historyPos++ & 0x0fff] = b;
      out[dst++] = b;
    } else {
      const byte1 = src[p++];
      const byte2 = src[p++];
      const toCopy = (byte2 & 0x0f) + 3;
      let copyPos = (((byte2 & 0xf0) << 4) | byte1) + 18;
      for (let i = 0; i < toCopy && dst < outSize; i++) {
        const b = history[copyPos++ & 0x0fff];
        history[historyPos++ & 0x0fff] = b;
        out[dst++] = b;
      }
    }
    bitsLeft--;
  }
  return out;
}

/**
 * Byte RLE: a byte with bit 7 set introduces a run; otherwise it is a literal
 * count. Used by some IMG/CIF payloads.
 *
 * @param {Uint8Array} src
 * @param {number} outSize
 * @returns {Uint8Array}
 */
export function decodeRle(src, outSize) {
  const out = new Uint8Array(outSize);
  let p = 0, o = 0;
  while (o < outSize && p < src.length) {
    const sample = src[p++];
    if (sample & 0x80) {
      const value = src[p++];
      const count = sample - 0x7f;
      for (let j = 0; j < count && o < outSize; j++) out[o++] = value;
    } else {
      const count = sample + 1;
      for (let j = 0; j < count && o < outSize; j++) out[o++] = src[p++];
    }
  }
  return out;
}

/**
 * Word RLE, used by `.RMD` wilderness blocks: a signed 16-bit count, positive
 * meaning "this many literal words follow", negative meaning "repeat the next
 * word this many times".
 *
 * @param {Uint8Array} src
 * @param {number} outSize   in BYTES (words × 2)
 * @returns {Uint8Array}
 */
export function decodeRleWords(src, outSize) {
  const out = new Uint8Array(outSize);
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  let p = 0, o = 0;
  const words = () => {
    const v = view.getUint16(p, true);
    p += 2;
    return v;
  };
  while (o < outSize && p + 2 <= src.length) {
    const sample = view.getInt16(p, true);
    p += 2;
    if (sample > 0) {
      for (let j = 0; j < sample && o < outSize; j++) {
        const w = words();
        out[o++] = w & 0xff; if (o < outSize) out[o++] = (w >> 8) & 0xff;
      }
    } else {
      const w = words();
      const count = -sample;
      for (let j = 0; j < count && o < outSize; j++) {
        out[o++] = w & 0xff; if (o < outSize) out[o++] = (w >> 8) & 0xff;
      }
    }
  }
  return out;
}
