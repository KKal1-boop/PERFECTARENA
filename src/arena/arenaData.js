import { parseBsa } from './bsaArchive.js';
import { parseCif } from './cifFile.js';
import { parseImg } from './image.js';
import { parseInf } from './infFile.js';
import { parseMif } from './mifFile.js';
import { imageToUpload, parseCol } from './palette.js';
import { parseRmd } from './rmdFile.js';

/** `.SET` sheets are a sequence of this many pixels per texture. */
export const SET_FRAME_SIZE = 64;

/**
 * @typedef {object} ArenaSource
 * @property {(name:string)=>Promise<Uint8Array|null>} getBytes  case-insensitive 8.3 lookup
 * @property {()=>Promise<string[]>|string[]} [list]             optional: names present
 * @property {string} [label]
 */

// Scene replacement keeps the same source (picked folder or HTTP source object).
// Decoded immutable assets belong to that source, not to a short-lived scene.
// Weak keys release the session cache when the player switches folders.
const sourceCaches = new WeakMap();

/** Arena's own data, decoded and cached. */
/**
 * **A byte reader for a source, sharing the scene's own cache.**
 *
 * The music is the one reader that does not live inside a scene (`game/musicPlayer.js` plays
 * through a frame loop and survives scene changes), so it cannot borrow the scene's `ArenaData`
 * object — but it must read the same way the scene does: a loose file first, then `GLOBAL.BSA`.
 * Arena's songs (`SHEET.XMI`, `SUNNYDAY.XMI`, …) are archive records and not loose files.
 *
 * The cache is keyed by SOURCE (a `WeakMap` below), so this shares the archive index the scene
 * already parsed rather than parsing `GLOBAL.BSA` a second time.
 *
 * @param {ArenaSource} source
 * @param {{onWarn?: (msg:string)=>void}} [opts]
 * @returns {(name: string) => Promise<Uint8Array|null>}
 */
export function sourceReader(source, opts = {}) {
  if (!source?.getBytes) return async () => null;
  const data = new ArenaData(source, opts);
  return (name) => data.bytes(String(name));
}

export class ArenaData {
  /**
   * @param {ArenaSource} source
   * @param {{ paletteName?: string, onWarn?: (msg:string)=>void }} [opts]
   */
  constructor(source, opts = {}) {
    this.source = source;
    this.paletteName = opts.paletteName ?? 'PAL.COL';
    this.onWarn = opts.onWarn ?? (() => {});
    /** @type {Map<string, Promise<any>>} */
    let shared = sourceCaches.get(source);
    if (!shared) {
      shared = { cache: new Map(), archive: null };
      sourceCaches.set(source, shared);
    }
    this.shared = shared;
    this.cache = shared.cache;
    this.stats = { bytes: 0, hits: 0, misses: 0 };
  }

  /** @param {string} msg */
  warn(msg) { this.onWarn(msg); }

  /**
   * Raw bytes for a name, from the loose folder or the archive.
   * @param {string} name
   * @returns {Promise<Uint8Array|null>}
   */
  async bytes(name) {
    const key = name.toUpperCase();
    if (this.cache.has(`b:${key}`)) { this.stats.hits++; return this.cache.get(`b:${key}`); }
    const p = (async () => {
      const loose = await this.source.getBytes(key);
      if (loose && loose.length) return loose;
      const archive = await this.bsa();
      return archive.get(key) ?? null;
    })();
    this.cache.set(`b:${key}`, p.catch((error) => { this.cache.delete(`b:${key}`); throw error; }));
    this.stats.misses++;
    return p;
  }

  /**
   * Bytes for a name that must exist.
   * @param {string} name
   * @returns {Promise<Uint8Array>}
   */
  async must(name) {
    const b = await this.bytes(name);
    if (!b) throw new Error(`Arena data "${name}" was not found as a loose file or in GLOBAL.BSA`);
    return b;
  }

  /**
   * The archive, indexed once.
   * @returns {Promise<import('./bsaArchive.js').BsaArchive>}
   */
  async bsa() {
    if (!this.shared.archive) {
      this.shared.archive = (async () => {
        const bytes = await this.source.getBytes('GLOBAL.BSA');
        if (!bytes) throw new Error('GLOBAL.BSA was not found in the Arena folder');
        return parseBsa(bytes, 'GLOBAL.BSA');
      })().catch((error) => { this.shared.archive = null; throw error; });
    }
    return this.shared.archive;
  }

  /** @returns {Promise<boolean>} */
  async has(name) { return (await this.bytes(name)) !== null; }

  /**
   * A `.MIF` map, parsed.
   * @param {string} name
   * @returns {Promise<import('./mifFile.js').MifFile>}
   */
  mif(name) { return this.cached(`mif:${name}`, async () => parseMif(await this.must(name), name)); }

  /**
   * A `.RMD` wilderness block, decoded into its three voxel layers.
   * @param {string} name
   * @returns {Promise<import('./rmdFile.js').RmdBlock>}
   */
  rmd(name) { return this.cached(`rmd:${name}`, async () => parseRmd(await this.must(name), name)); }

  /**
   * An `.INF` map definition, parsed (archive copies are decrypted).
   * @param {string} name
   * @returns {Promise<import('./infFile.js').InfFile>}
   */
  inf(name) { return this.cached(`inf:${name}`, async () => parseInf(await this.must(name), name)); }

  /**
   * The global palette (`.COL`), used whenever an image carries none.
   * @param {string} [name]
   * @returns {Promise<import('./palette.js').Palette>}
   */
  palette(name = this.paletteName) {
    return this.cached(`pal:${name}`, async () => parseCol(await this.must(name)));
  }

  /**
   * An `.IMG`, decoded.
   * @param {string} name
   * @returns {Promise<import('./image.js').ArenaImage>}
   */
  img(name) { return this.cached(`img:${name}`, async () => parseImg(await this.must(name), name)); }

  /**
   * A `.CIF`, decoded into its own sequence of screen-positioned images.
   *
   * The format is Arena's animation container: one image per frame of a weapon swing,
   * each carrying the pixel it is drawn at. See `cifFile.js`.
   *
   * @param {string} name
   * @returns {Promise<import('./cifFile.js').CifFile>}
   */
  cif(name) { return this.cached(`cif:${name}`, async () => parseCif(await this.must(name), name)); }

  /**
   * A `.SET` sheet's frames (each 64×64).
   * @param {string} name
   * @returns {Promise<{width:number,height:number,indices:Uint8Array}[]>}
   */
  setFrames(name) {
    return this.cached(`set:${name}`, async () => {
      const bytes = await this.must(name);
      const n = Math.floor(bytes.length / (SET_FRAME_SIZE * SET_FRAME_SIZE));
      const frames = [];
      for (let i = 0; i < n; i++) {
        const from = i * SET_FRAME_SIZE * SET_FRAME_SIZE;
        frames.push({
          width: SET_FRAME_SIZE,
          height: SET_FRAME_SIZE,
          indices: bytes.subarray(from, from + SET_FRAME_SIZE * SET_FRAME_SIZE),
        });
      }
      return frames;
    });
  }

  /**
   * Resolve one INF texture reference to something the renderer can upload.
   *
   * `.SET` references pick a single 64×64 frame by `setIndex`; everything else is
   * an `.IMG`. An embedded palette wins over the global one.
   *
   * @param {import('./infFile.js').InfVoxelTexture} ref
   * @returns {Promise<{width:number,height:number,colors:Uint8ClampedArray}|null>}
   */
  async texture(ref) {
    if (!ref?.filename) return null;
    const key = `tex:${ref.filename}#${ref.setIndex}`;
    return this.cached(key, async () => {
      const fallback = await this.palette();
      if (ref.filename.endsWith('.SET')) {
        const frames = await this.setFrames(ref.filename);
        const frame = frames[Math.max(0, Math.min(frames.length - 1, ref.setIndex))];
        if (!frame) { this.warn(`${ref.filename} has no frame ${ref.setIndex}`); return null; }
        return imageToUpload(frame.indices, frame.width, frame.height, fallback);
      }
      let image;
      try {
        image = await this.img(ref.filename);
      } catch (err) {
        this.warn(`texture ${ref.filename}: ${err.message}`);
        return null;
      }
      return imageToUpload(image.indices, image.width, image.height, image.palette ?? fallback);
    });
  }

  /**
   * Memoised helper.
   * @template T @param {string} key @param {()=>Promise<T>} make @returns {Promise<T>}
   */
  cached(key, make) {
    if (!this.cache.has(key)) this.cache.set(key, make().catch((err) => {
      this.cache.delete(key);
      throw err;
    }));
    return this.cache.get(key);
  }
}

/**
 * Build an `ArenaSource` over an in-memory name→bytes map. The tests and the
 * tooling use this; the browser builds one over a picked folder or a URL.
 *
 * @param {Map<string, Uint8Array>} files  keys are case-insensitive names
 * @param {string} [label]
 * @returns {ArenaSource}
 */
export function mapSource(files, label = 'memory') {
  const upper = new Map();
  for (const [k, v] of files) upper.set(k.toUpperCase(), v);
  return {
    label,
    getBytes: async (name) => upper.get(name.toUpperCase()) ?? null,
    list: () => Array.from(upper.keys()),
  };
}

/**
 * Build an `ArenaSource` over HTTP — the dev/test door (`?arena=<url>`).
 *
 * @param {string} baseUrl  directory URL ending in `/`
 * @param {string[]} [names]  if given, only these names are probed
 * @returns {ArenaSource}
 */
export function httpSource(baseUrl, names = undefined) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const listing = names ? new Set(names.map((n) => n.toUpperCase())) : null;
  return {
    label: base,
    list: () => (listing ? Array.from(listing) : []),
    getBytes: async (name) => {
      const upper = name.toUpperCase();
      if (listing && !listing.has(upper)) return null;
      const res = await fetch(base + encodeURIComponent(upper));
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
