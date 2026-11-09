import { mapSource } from './arenaData.js';

/** @param {string} name */
export function looksLikeArchiveName(name) {
  return /\.(zip|rar)$/i.test(String(name || ''));
}

/**
 * Read an archive `File` (or `Blob`) into an `ArenaSource`.
 *
 * @param {File|Blob} file
 * @param {{onProgress?: (msg: string) => void, loadRarWasm?: () => Promise<Uint8Array|ArrayBuffer>}} [opts]
 * @returns {Promise<import('./arenaData.js').ArenaSource>}
 */
export async function archiveSource(file, opts = {}) {
  const { onProgress = () => {}, loadRarWasm } = opts;
  const name = file?.name ?? 'archive';
  onProgress(`reading ${name}…`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) {
    throw new Error(`"${name}" is not a .zip or .rar archive (its contents do not look like one)`);
  }
  onProgress(kind === 'zip' ? `unpacking ${name}…` : `unpacking ${name} (the RAR decoder loads once)…`);

  let entries;
  if (kind === 'zip') {
    const { readZip } = await import('./zipArchive.js');
    entries = await readZip(bytes);
  } else {
    const { readRar } = await import('./rarArchive.js');
    entries = await readRar(bytes, loadRarWasm ? { loadWasm: loadRarWasm } : {});
  }

  const files = indexEntries(entries);
  if (!files.has('GLOBAL.BSA')) {
    throw new Error(`"${name}" holds ${files.size} files but no GLOBAL.BSA — `
      + 'archive the ARENA folder itself (the one with GLOBAL.BSA in it), not a folder from inside it');
  }
  onProgress(`found ${files.size} files`);
  const source = mapSource(files, `archive:${name}`);
  source.files = files;
  return source;
}

/**
 * Lay an archive's entries out the way the game looks names up.
 *
 * @param {Map<string, Uint8Array>} entries  archive path → contents
 * @returns {Map<string, Uint8Array>} upper-case name → contents
 */
export function indexEntries(entries) {
  /** @type {Array<[string, Uint8Array]>} */
  const real = [];
  for (const [path, bytes] of entries) {
    if (!bytes || !bytes.length) continue;
    if (/(^|\/)__MACOSX\//.test(path) || /(^|\/)\._/.test(path)) continue;  // a Mac's shadow files
    real.push([path, bytes]);
  }

  // **The archive's own root.** Zipping a folder writes `ARENA/CAS.INF`, while the game asks
  // for `CAS.INF` and `SPEECH/1400_00A.VOC`; a folder's worth of files can also sit at the
  // archive's root. When every entry is inside one directory, that directory *is* the install
  // the player zipped, so it is stripped. (Shadows are gone by now, or `__MACOSX` would win.)
  const firsts = new Set(real.map(([path]) => (path.includes('/') ? path.split('/')[0] : '')));
  const root = firsts.size === 1 && !firsts.has('') ? `${[...firsts][0]}/` : '';

  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  for (const [path, bytes] of real) {
    const full = (root && path.startsWith(root) ? path.slice(root.length) : path).toUpperCase();
    if (!full) continue;
    if (!files.has(full)) files.set(full, bytes);
    // Arena's own 8.3 names are unique, so a bare name is unambiguous — and it is what
    // `fileListSource` resolves, so an archive made by exporting the folder behaves alike.
    const bare = full.split('/').pop();
    if (bare && !files.has(bare)) files.set(bare, bytes);
  }
  return files;
}

/**
 * Which archive is this, by its own bytes rather than its extension (some downloads arrive
 * misnamed). A zip starts with a local-file or empty-archive signature; rar has its mark.
 *
 * @param {Uint8Array} bytes
 * @returns {'zip'|'rar'|null}
 */
function sniff(bytes) {
  if (bytes.length >= 4) {
    const p0 = bytes[0], p1 = bytes[1], p2 = bytes[2], p3 = bytes[3];
    if (p0 === 0x50 && p1 === 0x4b && ((p2 === 3 && p3 === 4) || (p2 === 5 && p3 === 6) || (p2 === 7 && p3 === 8))) {
      return 'zip';
    }
  }
  const rar = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07];
  if (bytes.length >= 6 && rar.every((b, i) => bytes[i] === b)) return 'rar';
  return null;
}

/**
 * Ask the player for their Arena install as a `.zip` or `.rar`.
 *
 * A plain file input — the one door every mobile browser opens.
 *
 * @param {{onProgress?: (msg: string) => void, loadRarWasm?: () => Promise<Uint8Array|ArrayBuffer>}} [opts]
 * @returns {Promise<import('./arenaData.js').ArenaSource|null>} null when the picker is dismissed
 */
export function pickArenaArchive(opts = {}) {
  const { onProgress = () => {} } = opts;
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.rar,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/vnd.rar';
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn(value);
    };

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return finish(resolve, null);
      try {
        finish(resolve, await archiveSource(file, opts));
      } catch (err) {
        finish(reject, err);
      }
    });
    input.addEventListener('cancel', () => finish(resolve, null));
    onProgress('choose the .zip or .rar holding your ARENA folder');
    input.click();
  });
}
