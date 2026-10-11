// ARENA `GLOBAL.BSA` — THE RESOURCE ARCHIVE.
//
// This is **not** Daggerfall's BSA. Arena's layout is:
//
//   offset 0   u16    recordCount
//   offset 2   …      payloads, concatenated in directory order, no padding and
//                     no per-record compression
//   end - n*18 …      directory: recordCount × 18 bytes
//                       +0  char[14]  name (upper-case 8.3, NUL-padded)
//                       +14 int32     size in bytes
//
// Record *i* begins at `2 + Σ size[j] for j < i`, so the directory is the only
// index and it lives at the very end of the file.
//
// VERIFIED against the real `GLOBAL.BSA`: 2 441 records, Σ sizes = 16 758 196,
// directory at 16 758 198 = Σ + 2 exactly. See docs/FORMATS.md §2.
//
// Daggerfall's BSA (which the reused engine can read) has a `u16 directoryType`
// after the count and records starting at offset 4, so it would misparse this
// file. That is why Arena gets its own reader — DECISIONS.md D6.

/** Bytes per directory entry. */
const ENTRY_SIZE = 18;
/** Bytes of name inside a directory entry. */
const NAME_SIZE = 14;

/**
 * @typedef {object} BsaEntry
 * @property {string} name      upper-case 8.3
 * @property {number} offset    byte offset of the payload
 * @property {number} size      payload length in bytes
 */

/** An indexed Arena archive. */
export class BsaArchive {
  /**
   * @param {Uint8Array} bytes        the whole `GLOBAL.BSA`
   * @param {string} [filename]
   * @param {(name:string)=>Uint8Array|undefined} [external]
   *   fallback for records the directory does not list (Arena ships a few)
   */
  constructor(bytes, filename = 'GLOBAL.BSA', external = undefined) {
    this.filename = filename;
    this.bytes = bytes;
    this.external = external;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(0, true);
    if (!count || bytes.length < 2 + count * ENTRY_SIZE) {
      throw new Error(`${filename}: implausible record count ${count} for ${bytes.length} bytes`);
    }

    const dirStart = bytes.length - count * ENTRY_SIZE;
    /** @type {BsaEntry[]} */
    const entries = [];
    /** @type {Map<string, BsaEntry>} */
    const byName = new Map();
    let cursor = 2;
    for (let i = 0; i < count; i++) {
      const at = dirStart + i * ENTRY_SIZE;
      const name = readName(bytes, at);
      const size = view.getInt32(at + NAME_SIZE, true);
      if (!name || size < 0 || cursor + size > dirStart) continue;
      const entry = { name, offset: cursor, size };
      entries.push(entry);
      byName.set(name, entry);
      cursor += size;
    }
    /** @type {BsaEntry[]} */
    this.entries = entries;
    /** @type {Map<string, BsaEntry>} */
    this.index = byName;
    /** Bytes actually covered by the directory (the self-check). */
    this.payloadEnd = cursor;
    this.directoryStart = dirStart;
  }

  /** @returns {number} number of records */
  get count() { return this.entries.length; }

  /** @param {string} name @returns {boolean} */
  has(name) { return this.index.has(upper(name)); }

  /**
   * Extract one record.
   * @param {string} name
   * @returns {Uint8Array|undefined}
   */
  get(name) {
    const entry = this.index.get(upper(name));
    if (entry) return this.bytes.subarray(entry.offset, entry.offset + entry.size);
    return this.external?.(upper(name));
  }

  /** @returns {string[]} every record name, sorted */
  names() { return this.entries.map((e) => e.name).sort(); }

  /** @returns {Record<string, number>} record counts keyed by extension */
  census() {
    /** @type {Record<string, number>} */
    const out = {};
    for (const e of this.entries) {
      const ext = e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.') + 1) : '(none)';
      out[ext] = (out[ext] ?? 0) + 1;
    }
    return out;
  }
}

/**
 * Parse a `GLOBAL.BSA`.
 * @param {Uint8Array} bytes
 * @param {string} [filename]
 * @returns {BsaArchive}
 */
export function parseBsa(bytes, filename = 'GLOBAL.BSA') {
  return new BsaArchive(bytes, filename);
}

/** @param {string} s */
function upper(s) { return s.toUpperCase(); }

/** @param {Uint8Array} bytes @param {number} at */
function readName(bytes, at) {
  let s = '';
  for (let i = 0; i < NAME_SIZE; i++) {
    const c = bytes[at + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim().toUpperCase();
}
