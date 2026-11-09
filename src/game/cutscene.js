// ARENA'S OWN CUTSCENES — the install's `.FLC` movies, decoded and paced.
//
// The port has had a FLIC reader since the Daggerfall side was vendored
// (`engine/formats/flcFile.js`: header, frame headers, `COLOR_256`, `DELTA_FLC`,
// `BYTE_RUN`, `PSTAMP`) and **nothing ever called it**. The install ships seventeen loose
// `.FLC`s — 20 MB of animation, the largest files in the whole install — and the ending
// screen in this project said so in its own words: *"the cutscene itself (END01.FLC) is not
// decoded."* This module is the caller.
//
// What a cutscene **is** here, measured rather than asserted:
//   * `header` — 320×200, 8 bits, `numOfFrames` frames, a `frameDelay` the FLIC header
//     carries (128 ms on `JAGAR.FLC`, so the reader's own law: `raw / 1000` seconds);
//   * frames decode **sequentially** and are deltas — frame *n* is meaningless without the
//     frames before it — so this loader is a cursor, not random access: `next()` advances
//     one frame and answers it. `rewind()` starts again from frame 1.
//   * the ring frame (the FLIC format's extra frame header) is *not* played as a frame: the
//     reader's own `bufferNextFrame` wraps `currentFrame` to 1 after the last one, so a
//     narrated scene loops its movie in the player (`rewind()`), not here.
//
// The palette arrives per frame (`COLOR_256` chunks are inside the frames, as Arena wrote
// them), so every frame is decoded to packed RGBA words with the palette the file carried
// at that moment — which is exactly how a 1994 palette animation looked.
//
// No DOM lives here: this is the library a player, a test or a lab tool drives.

import { FlcFile } from '../engine/formats/flcFile.js';
import { fillSpeech } from './dialogue.js';

/**
 * The install's loose `.FLC`s and the story beat each one belongs to.
 *
 * `beat` is a **wiring decision** by this project, not a claim about Arena's own code: the
 * names are the game's, the beats are where this port plays them (`intro` on a new game,
 * `vision` when the main quest opens, `tharn` on the palace's own beats, `ending` after the
 * Emperor is freed, `tour` as a menu extra). `what` says only what the file's name and its
 * measured size say — every one of these is 320×200 animation from the install.
 */
export const CUTSCENES = Object.freeze([
  { file: 'INTRO.FLC', beat: 'intro', what: 'the opening movie' },
  { file: 'VISION.FLC', beat: 'vision', what: 'a vision' },
  { file: 'CHAOSVSN.FLC', beat: 'vision', what: 'the vision of chaos' },
  { file: 'MORPH.FLC', beat: 'tharn', what: 'a transformation' },
  { file: 'JAGAR.FLC', beat: 'tharn', what: 'Jagar Tharn' },
  { file: 'JAGRSHLD.FLC', beat: 'tharn', what: "Tharn's shield" },
  { file: 'JAGARDTH.FLC', beat: 'tharn', what: "Tharn's death" },
  { file: 'NUJAGDTH.FLC', beat: 'tharn', what: 'the new Tharn falling' },
  { file: 'SCROLL.FLC', beat: 'story', what: 'a scroll' },
  { file: 'STAFF.FLC', beat: 'story', what: 'the Staff of Chaos' },
  { file: 'KING.FLC', beat: 'story', what: 'the Emperor' },
  { file: 'END01.FLC', beat: 'ending', what: 'the first ending' },
  { file: 'END02.FLC', beat: 'ending', what: 'the second ending' },
  { file: 'AFLC2.FLC', beat: 'ending', what: 'a closing animation' },
  // **The revised release's endgame pair** (UESP's Deluxe note): `NUKING.FLC` is the newer
  // Emperor shot that replaced `KING.FLC`, and `NUJAGDTH.FLC` the newer Tharn death that
  // replaced `JAGARDTH.FLC`. They are catalogued and playable through `?cutscene=`; the main
  // story plays the revised pair when the install carries it (`endingMoviesFor`) and falls
  // back to the originals, so a build with only one release still has a whole ending.
  { file: 'NUKING.FLC', beat: 'ending', what: 'the revised Emperor shot' },
  { file: 'WARHAFT.FLC', beat: 'intro', what: 'the cut Warhaft slide' },
  { file: 'WALK.FLC', beat: 'tour', what: 'the walking tour' },
]);

/**
 * The **start-up** cinematics, in Arena's own order (OpenTESArena's `IntroUiMVC.cpp`, MIT): a
 * title card and a quote card of 5 seconds each, the opening scroll movie, then the story's
 * three scroll pictures held for 13, 13 and 10 seconds. The pictures are shown in the palette of
 * `SCROLL03.IMG`, which is how Arena shows all three.
 *
 * These belong **before the start menu**: they are the game greeting a player at launch, not
 * part of a new game's first minutes. The old `OPENING_STEPS` played them after creation, which
 * put a title card between the player and the cell and — worse — made the story's own opening
 * movie share a skip with them.
 */
export const STARTUP_STEPS = Object.freeze([
  // **The book comes first.** OpenTESArena's intro path (`IntroUiMVC.cpp`) opens the CD
  // release with `INTRO.FLC` — the 3-D book whose last page reads “The Elder Scrolls /
  // Chapter One: The Arena” — and only then shows the title and quote cards, the scroll
  // movie and the three story pictures. The port had the book wired after character
  // creation instead, so it was played twice if a new game was started and never at the
  // one moment the original shows it. It belongs here.
  Object.freeze({ kind: 'movie', file: 'INTRO.FLC' }),
  Object.freeze({ kind: 'still', file: 'TITLE.IMG', paletteFile: 'TITLE.IMG', seconds: 5 }),
  Object.freeze({ kind: 'still', file: 'QUOTE.IMG', paletteFile: 'QUOTE.IMG', seconds: 5 }),
  Object.freeze({ kind: 'movie', file: 'SCROLL.FLC' }),
  Object.freeze({ kind: 'still', file: 'SCROLL01.IMG', paletteFile: 'SCROLL03.IMG', seconds: 13 }),
  Object.freeze({ kind: 'still', file: 'SCROLL02.IMG', paletteFile: 'SCROLL03.IMG', seconds: 13 }),
  Object.freeze({ kind: 'still', file: 'SCROLL03.IMG', paletteFile: 'SCROLL03.IMG', seconds: 10 }),
]);

/**
 * The **new game** sequence, before character creation: the opening scroll, then the nine
 * illustrated history panels at five seconds each (`SCROLL.FLC`, `INTRO01–09.IMG`). This is
 * OpenTESArena's `MainMenuUiController::onNewGameButtonSelected`: it links the opening scroll,
 * the new-game story, and character creation, and the panels are the emperor's betrayal and the
 * banishment of his champion. The startup's `SCROLL01–03.IMG` are a different, shorter set; the
 * nine panels are the story the New Game button owes.
 *
 * The pictures share `SCROLL03.IMG`'s palette, as Arena shows them. The sequence is not part of
 * `STARTUP_STEPS`: a player who skips the title cards must still see the story when they choose
 * New Game, and `scenes/newGame.js` owns that order.
 */
export const NEW_GAME_STEPS = Object.freeze([
  Object.freeze({ kind: 'movie', file: 'SCROLL.FLC' }),
  ...Array.from({ length: 9 }, (_, i) => Object.freeze({
    kind: 'still',
    file: `INTRO0${i + 1}.IMG`,
    paletteFile: 'SCROLL03.IMG',
    seconds: 5,
  })),
]);

/**
 * When each caption comes on screen, in milliseconds from the start of the narration.
 *
 * The narration's length is the speech's own (`arena/dreamSpeech.js`), and each caption takes a
 * share of it in proportion to its length, so a long caption stays longer than a short one. The
 * clips are not matched to captions one by one (there are fewer captions than clips), so this is
 * an approximation of the speech's pacing, not a claim about where each line falls.
 *
 * @param {string[]} captions
 * @param {number} totalMs the narration's whole length
 * @returns {number[]} one start time per caption, ascending, the first at 0
 */
export function captionStarts(captions, totalMs) {
  const weights = captions.map((c) => Math.max(1, c.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const starts = [];
  let at = 0;
  for (const w of weights) {
    starts.push(Math.round(at));
    at += (w / sum) * totalMs;
  }
  return starts;
}

/**
 * The narration of a text-over-movie scene, as the captions it is shown in.
 *
 * `strings` are a template entry's strings (`arena/templateDat.js`'s `templateStrings`). Each is
 * filled with the player's own names (`%pcf` is the first name), split into sentences, and the
 * sentences are grouped into captions no longer than `maxLength` characters, so one caption sits
 * on screen at a time. A sentence longer than `maxLength` is kept whole rather than cut.
 *
 * @param {string[]} strings
 * @param {Record<string, string>} [values] the placeholder values, e.g. `{pcf: 'Ulf'}`
 * @param {number} [maxLength]
 * @returns {string[]}
 */
export function dreamCaptions(strings, values = {}, maxLength = 140) {
  const captions = [];
  for (const template of strings) {
    const { text } = fillSpeech(template, values);
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
    let current = '';
    for (const sentence of sentences) {
      if (current && `${current} ${sentence}`.length > maxLength) {
        captions.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current) captions.push(current);
  }
  return captions;
}

/**
 * The install's loose-file index, fetched once per arena root.
 *
 * The dev door publishes it (`/arena-local/` — see `tools/serve.mjs`) for exactly this: to
 * tell "this file is not here" from "this file failed to load" **without paying for a 404**,
 * which lands in the browser's console as a network error for something entirely expected. A
 * `.FLC` is a loose file on the install's disk, so the index answers for every movie.
 *
 * @param {typeof fetch} fetchImpl @param {string} arenaPath
 * @returns {Promise<Set<string>|null>} upper-case names, or null when the door has no index
 */
async function looseIndex(fetchImpl, arenaPath) {
  const key = String(arenaPath);
  if (looseIndex.cache.has(key)) return looseIndex.cache.get(key);
  let names = null;
  try {
    const res = await fetchImpl(`/arena-local/?arena=${encodeURIComponent(arenaPath)}`);
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body?.names)) names = new Set(body.names.map((n) => String(n).toUpperCase()));
    }
  } catch { /* no index: the loader falls back to probing the name */ }
  looseIndex.cache.set(key, names);
  return names;
}
/** The index by arena root, so a page asks once. */
looseIndex.cache = new Map();

/** The install's own movie by name (`intro`, `INTRO`, `INTRO.FLC` all answer it). */
export function cutsceneByName(key) {
  const wanted = String(key ?? '').trim().toUpperCase();
  if (!wanted) return null;
  const withExt = wanted.includes('.') ? wanted : `${wanted}.FLC`;
  return CUTSCENES.find((c) => c.file === withExt) ?? null;
}

/** Every name, as the install spells them. */
export function cutsceneNames() {
  return CUTSCENES.map((c) => c.file);
}

/**
 * Fetch one `.FLC` through the same dev door every other install file loads by and hand
 * back a cursor over its frames.
 *
 * @param {string} name e.g. `INTRO.FLC` — or `intro`, which is resolved to its file
 * @param {{fetchImpl?: typeof fetch, arenaPath?: string|null, arenaRoot?: string,
 *   source?: {getBytes: (name: string) => Promise<Uint8Array|null>}}} [opts]
 *   `source` is an `ArenaSource` (a hand-picked folder, or the dev door); `fetchImpl` is
 *   injectable so a unit test can drive real bytes without a server
 * @returns {Promise<{ok: boolean, name: string, file?: string, reason?: string,
 *   width?: number, height?: number, frameCount?: number, delayMs?: number,
 *   totalMs?: number, next?: () => object|null, rewind?: () => void, index?: () => number}>}
 */
export async function loadCutscene(name, opts = {}) {
  const entry = cutsceneByName(name);
  const file = entry?.file ?? (String(name ?? '').toUpperCase().includes('.') ? String(name).toUpperCase() : `${String(name ?? '').toUpperCase()}.FLC`);
  const fetchImpl = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  const arenaPath = opts.arenaPath ?? opts.arenaRoot ?? 'C:/arenaproject/arena/ARENA';
  let bytes = null;
  try {
    // A hand-picked folder first: it is the player's own install, and a `FileList` never
    // reaches a server. The dev door is the other path, keyed by `?arena=`.
    if (opts.source?.getBytes) bytes = await opts.source.getBytes(file);
    if (!bytes) {
      if (!fetchImpl) return { ok: false, name: file, reason: 'no fetch here, and no source with the file' };
      // A name the door's own index does not carry is refused **without a request**, so a
      // missing movie is a fact rather than a console error.
      const index = await looseIndex(fetchImpl, arenaPath);
      if (index && !index.has(file)) return { ok: false, name: file, reason: `${file} is not in this install` };
      const res = await fetchImpl(`/arena-local/${file}?arena=${encodeURIComponent(arenaPath)}`);
      if (!res.ok) return { ok: false, name: file, reason: `the install answered ${res.status} for ${file}` };
      bytes = new Uint8Array(await res.arrayBuffer());
    }
  } catch (err) {
    return { ok: false, name: file, reason: String(err?.message ?? err) };
  }
  if (!bytes) return { ok: false, name: file, reason: `${file} is not in this install` };
  return decodeCutscene(bytes, file);
}

/**
 * The same cursor, from bytes in hand — the honest half of the loader, so the decoding law
 * can be pinned against the install's own file without a browser.
 *
 * @param {Uint8Array} bytes
 * @param {string} [file]
 * @returns {object} the shape `loadCutscene` answers
 */
export function decodeCutscene(bytes, file = 'CUTSCENE.FLC') {
  const flc = new FlcFile();
  let ready = false;
  try {
    ready = flc.load(bytes, file);
  } catch (err) {
    return { ok: false, name: file, reason: `the FLIC reader refused it: ${String(err?.message ?? err)}` };
  }
  if (!ready) return { ok: false, name: file, reason: 'the FLIC reader could not open it' };
  const header = flc.header;
  // The delay is the file's own: `frameDelay` is milliseconds in the header, and the reader
  // keeps the format's own conversion (`/ CINEMATIC_SPEED.FLIC`), which answers seconds.
  const delaySeconds = Number.isFinite(flc.frameDelay) && flc.frameDelay > 0 ? flc.frameDelay : 0.1;
  const delayMs = delaySeconds * 1000;
  const frameCount = Math.max(1, header.numOfFrames);
  /** The reader decodes frame 1 on load; `shown` is how many this cursor has answered. */
  let shown = 0;
  return {
    ok: true,
    name: file,
    beat: cutsceneByName(file)?.beat ?? null,
    what: cutsceneByName(file)?.what ?? null,
    width: header.width,
    height: header.height,
    frameCount,
    delayMs,
    totalMs: delayMs * frameCount,
    bytes: bytes.length,
    /** Advance one frame. `null` once every frame of the file has been answered. */
    next() {
      if (shown >= frameCount) return null;
      if (shown > 0 && !flc.bufferNextFrame()) return null;
      const frame = flc.getFrame();
      shown++;
      return { index: shown - 1, width: frame.width, height: frame.height, colours: frame.colors };
    },
    /** Start again from frame 1, the way the format's own ring frame would. */
    rewind() {
      flc.currentFrame = 1;
      shown = 0;
      flc.bufferNextFrame();
    },
    /** How many frames this cursor has answered so far. */
    index: () => shown,
  };
}

/**
 * A decoded frame's packed RGBA words as the bytes an `ImageData` wants.
 *
 * The reader packs `a<<24 | b<<16 | g<<8 | r` (its own `rgba`), which is the byte order of
 * a little-endian `Uint32` — so the packing is read straight out as RGBA, not swapped.
 *
 * @param {Uint32Array} colours
 * @param {Uint8ClampedArray} [into] reused output, when the caller keeps one
 * @returns {Uint8ClampedArray} `width * height * 4` bytes
 */
export function frameBytes(colours, into = null) {
  const out = into ?? new Uint8ClampedArray(colours.length * 4);
  for (let i = 0; i < colours.length; i++) {
    const word = colours[i];
    out[i * 4] = word & 0xff;
    out[i * 4 + 1] = (word >>> 8) & 0xff;
    out[i * 4 + 2] = (word >>> 16) & 0xff;
    out[i * 4 + 3] = (word >>> 24) & 0xff;
  }
  return out;
}
