// A .ZIP READER, for the player's Arena install when it arrives as one file.
//
// The owner, 2026-10-22: on Opera and on Android a *folder picker* is not available —
// `webkitdirectory` is ignored or gives a single file — so the only way to hand the game
// its data is an archive. This is the zip half (`rarArchive.js` is the other); both end up
// as the same `Map<path, Uint8Array>` that `archiveSource.js` turns into an `ArenaSource`.
//
// Nothing is bundled: this reads the bytes the player already has. A zip is a cental
// directory (which is the authoritative index: names, compression method, sizes, crc) with
// each file's payload behind a local header. Only two methods exist in the wild for this
// use — `0` stored and `8` deflate — and the browser's own `DecompressionStream('deflate-raw')`
// inflates the second, so there is no inflate implementation to ship or test.
//
// Zip64 (a size or offset of `0xFFFFFFFF`) is not read: Arena's folder is 30-60 MB and no
// archiver writes zip64 for that. A name is stored as written (`ARENA/CAS.MIF`); flattening
// is the caller's business.

/** End of central directory record. */
const EOCD = 0x06054b50;
/** Central directory file header. */
const CDIR = 0x02014b50;

/**
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>} archive path → contents, in archive order
 */
export async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('this is not a zip archive (no end-of-central-directory record)');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CDIR) {
      throw new Error(`zip central directory is damaged at entry ${i + 1}`);
    }
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const unpacked = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;

    if (!name || name.endsWith('/')) continue;                 // a directory entry
    if (name.startsWith('__MACOSX/')) continue;                // a Mac's resource fork shadow
    if (packed === 0xffffffff || localAt === 0xffffffff) {     // zip64: not supported, skip
      continue;
    }
    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x04034b50) {
      throw new Error(`zip entry "${name}" has no local header`);
    }
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const packedBytes = bytes.subarray(dataAt, dataAt + packed);
    if (method === 0) files.set(normalise(name), packedBytes);
    else if (method === 8) files.set(normalise(name), await inflateRaw(packedBytes, unpacked));
    else throw new Error(`zip entry "${name}" uses unsupported compression method ${method}`);
  }
  return files;
}

/**
 * Find the end-of-central-directory record. It sits at the end of the file, followed only by
 * an optional archive comment of at most 64 KiB, so the search is bounded.
 *
 * @param {DataView} view
 * @returns {number} byte offset, or -1
 */
function findEocd(view) {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let at = view.byteLength - 22; at >= earliest; at--) {
    if (view.getUint32(at, true) === EOCD) return at;
  }
  return -1;
}

/** @param {string} name */
function normalise(name) {
  return name.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Inflate one raw-deflate payload with the platform's own decoder.
 *
 * @param {Uint8Array} packed
 * @param {number} expected  the size the central directory promised
 * @returns {Promise<Uint8Array>}
 */
async function inflateRaw(packed, expected) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('this browser cannot decompress zipped game data (no DecompressionStream)');
  }
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (expected && out.length !== expected) {
    throw new Error(`a zipped file decoded to ${out.length} bytes, not the ${expected} it promised`);
  }
  return out;
}
