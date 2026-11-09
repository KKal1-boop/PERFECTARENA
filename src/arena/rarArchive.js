// A .RAR READER, the other half of the archive door (`zipArchive.js`).
//
// RAR's compressed payloads need a decoder and there is no platform one, so this project
// vendors `unrar.js` (`src/vendor/unrar/`, MIT — a WebAssembly build of the unrar library)
// and keeps it behind this module. That is code, not game data: nothing of Arena's is
// bundled and nothing is uploaded; the bytes read are the player's own archive.
//
// The build is loaded lazily and only once. A player who hands over a .zip never downloads
// the 200 KB wasm.
//
// `unrar.wasm` is located relative to *this module*, not to the page, because the emscripten
// loader falls back to the page URL for a relative path and a page under a route (`/play/`)
// would then 404 it.

import unrarFactory from '../vendor/unrar/unrar.js';
import { ExtractorData } from '../vendor/unrar/ExtractorData.js';

/** @type {Promise<any>|null} */
let loading = null;

/**
 * @typedef {object} RarOptions
 * @property {() => Promise<Uint8Array|ArrayBuffer>} [loadWasm]  overrides the fetch (tests)
 */

/**
 * The initialised unrar module, or a promise of it.
 * @param {RarOptions} [opts]
 */
function unrar(opts = {}) {
  if (!loading) {
    loading = (async () => {
      const loadWasm = opts.loadWasm ?? (async () => {
        const res = await fetch(new URL('../vendor/unrar/unrar.wasm', import.meta.url));
        if (!res.ok) throw new Error(`could not load the RAR decoder (\`unrar.wasm\`): HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      });
      const wasmBinary = await loadWasm();
      const module = await unrarFactory({ wasmBinary });
      // The wasm reports damage through the module's own error callback; nothing here is
      // fatal, and a reader that threw on a single bad record could not open an install.
      return module;
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

/**
 * @param {Uint8Array} bytes
 * @param {RarOptions} [opts]
 * @returns {Promise<Map<string, Uint8Array>>} archive path → contents, in archive order
 */
export async function readRar(bytes, opts = {}) {
  const module = await unrar(opts);
  const extractor = new ExtractorData(module, bytes);
  // The wasm calls back into whichever extractor is serving its reads (`Module.extractor` in
  // `unrar.js`). The package's own entry point assigns this; the vendored pieces do not.
  module.extractor = extractor;
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  for (const file of extractor.extract().files) {
    const header = file.fileHeader;
    if (header.flags.directory) continue;
    const name = String(header.name || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!name) continue;
    files.set(name, file.extraction ?? new Uint8Array(0));
  }
  return files;
}
