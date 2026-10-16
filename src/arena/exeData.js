// THE GAME'S OWN TABLES, OUT OF THE GAME'S OWN EXECUTABLE (**block B24**, the brief's P2).
//
// `arena/ARENA/ACD.EXE` **is** the game: `ARENA.BAT` runs it (`@ACD -Ssbpdig.adv -IOS220 …`), and
// the tables this port has been reconstructing by hand — the character-creation prose, the class
// and race names, the wilderness block categories, the item and spell text — are in its code image,
// not in the 153 loose files the folder also holds. `arena/pklite.js` unpacks it; this module reads
// the file through the player's own source, keeps the unpacked image for the life of the page, and
// names the anchors every reading is checked against.
//
// **Law 6 of `docs/PORT_BLOCKS.md` holds here above all:** nothing derived from this file is
// committed. No table, no extracted string, no offset constant that only holds for one build of the
// game. The image is produced at runtime, on the player's machine, from the player's own copy — the
// same rule the rest of `src/arena/` already follows for `.MIF`, `.BSA` and `.RMD` data.
//
// The file's own name is not fixed across Arena's releases: the CD release ships `ACD.EXE` (this
// checkout's), the floppy release `A.EXE`. Both are the same program, so both are tried, and the
// report says which one answered rather than assuming.

import { unpackPklite, findAscii, findWords, PKLITE_NOT_ENOUGH_MEMORY } from './pklite.js';

/** The names the game's executable has shipped under, in the order worth trying. */
export const EXE_NAMES = Object.freeze(['ACD.EXE', 'A.EXE']);

/**
 * The anchors the unpacked image is checked against — strings this project can verify from its own
 * work, so a decoder that returns plausible-looking nonsense cannot pass.
 *
 * Three kinds, deliberately:
 *
 *   * **the world's own words** — `Tamriel`, the province name, which `CITYDATA.64` and the map
 *     already spell out for this port;
 *   * **the races** — `Nord`, `Khajiit`, `Redguard`, whose tables this project already reads from
 *     the install and pins in `tests/unit/chargen…`;
 *   * **Arena's own character-creation prose** — *"to select your class?"* — which is the game
 *     talking to the player, not a coincidence of bytes, and one of the loose art names the
 *     executable carries (`wild.mif`, the wilderness map skeleton the loader names).
 */
export const EXE_ANCHORS = Object.freeze([
  'Tamriel', 'Imperial Province', 'Khajiit', 'Nord', 'Redguard',
  'to select your class?', 'wild.mif',
]);

/** The image kept for this page, and which `ArenaData` it came from. */
let cached = null;

/**
 * Read and unpack the game's executable, once per page.
 *
 * @param {import('./arenaData.js').ArenaData} data  the player's own source
 * @returns {Promise<{file: {name: string, bytes: number}, info: object, image: Uint8Array,
 *   relocations: {segment: number, offset: number}[], footer: object, codeImageEnd: number,
 *   relocationEnd: number, warnings: string[]}>}
 */
export async function loadExeImage(data) {
  if (cached && cached.data === data) return cached.value;
  let lastError = null;
  for (const name of EXE_NAMES) {
    try {
      const bytes = new Uint8Array(await data.must(name));
      const unpacked = unpackPklite(bytes);
      const value = {
        file: { name, bytes: bytes.length },
        info: unpacked.info,
        image: unpacked.image,
        relocations: unpacked.relocations,
        footer: unpacked.footer,
        codeImageEnd: unpacked.codeImageEnd,
        relocationEnd: unpacked.relocationEnd,
        warnings: unpacked.warnings,
      };
      cached = { data, value };
      return value;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`no unpackable executable in this install (tried ${EXE_NAMES.join(', ')}): ${lastError?.message ?? 'none found'}`);
}

/**
 * Where each anchor sits in the image, or −1 for one that is not there — the reading that turns
 * "the decoder ran" into "the decoder produced *this game*".
 *
 * @param {Uint8Array} image
 * @returns {{text: string, at: number}[]}
 */
export function exeAnchors(image) {
  return EXE_ANCHORS.map((text) => ({ text, at: findAscii(image, text) }));
}

/**
 * The wilderness block categories' own thresholds, as `game/wilderness.js` states them
 * (`0x6666/0x4000/0x2666/0x1999`, the original's four draws). They are **numbers**, so they are
 * found as words, and the count is reported rather than the offset: the values are common enough in
 * a 300 KB image that one hit proves nothing, and a *count* that collapses to zero is the signal
 * that the reading has drifted to a different build.
 */
export const EXE_THRESHOLD_WORDS = Object.freeze([0x6666, 0x4000, 0x2666, 0x1999]);

/**
 * Everything a caller (or a browser suite) needs to say what came out of the executable, without
 * handing out the 300 KB image itself.
 *
 * The four window counts are the ones that make the *structure* checkable at a glance:
 * `paragraphs` must be a whole number (an EXE's image is whole paragraphs), the stack the footer
 * names must end exactly at the image's end, the relocation table must run out exactly eight bytes
 * before the file's end, and the entry must be the image's own first byte.
 *
 * @param {object} exe  what `loadExeImage` returned
 * @returns {object}
 */
export function exeReport(exe) {
  const { image } = exe;
  const footer = exe.footer;
  return {
    file: exe.file,
    version: exe.info.version,
    extra: exe.info.extra,
    large: exe.info.large,
    streamOffset: exe.info.streamOffset,
    imageStart: exe.info.imageStart,
    copyright: exe.info.copyright,
    notEnoughMemory: exe.info.notEnoughMemory,
    image: image.length,
    paragraphs: image.length / 16,
    relocations: exe.relocations.length,
    firstRelocation: exe.relocations[0] ?? null,
    lastRelocation: exe.relocations[exe.relocations.length - 1] ?? null,
    footer,
    stackEnd: footer.ss * 16 + footer.sp,
    entry: { cs: footer.cs, ip: footer.ip, linear: footer.cs * 16 + footer.ip },
    codeImageEnd: exe.codeImageEnd,
    relocationEnd: exe.relocationEnd,
    trailer: exe.file.bytes - exe.relocationEnd,
    anchors: exeAnchors(image),
    thresholds: EXE_THRESHOLD_WORDS.map((word) => ({ word, hits: findWords(image, [word]).length })),
    notEnoughMemoryInImage: findAscii(image, PKLITE_NOT_ENOUGH_MEMORY) >= 0,
    warnings: exe.warnings,
  };
}
