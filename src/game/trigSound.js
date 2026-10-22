// THE TRIGGERS' SOUND — the level's own `@SOUND` clips, played when their cell
// fires.
//
// The fanfare (`game/fanfare.js`) proved the whole path — the Creative `.VOC`
// decode and the WebAudio playback at the file's own rate. This module is the same
// path opened for every file a `.INF` names: read through whichever door the page
// uses for Arena's data (a player's picked folder, or the `/arena-local` dev door),
// decoded once per *filename*, and played so a corridor of trigger cells rings one
// tell after another rather than stacking.
//
// The browser's autoplay law is honored the way the fanfare honors it: a context
// the page has not touched yet waits for the first gesture, and the state seam
// says so honestly.

import { decodeVoc } from '../arena/vocFile.js';

/** Decoded WebAudio buffers by source and upper-case filename, built once per page. */
const decoded = new Map();
/** `AudioContext`, made on the first sound that needs one. */
let ctx = null;

/** The last play's own state, as the debug seam reads it. */
let state = { fires: 0 };

/** @param {number} now */
function ensureContext() {
  if (ctx) return ctx;
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

/**
 * The file's bytes, from whichever door the page is reading Arena through.
 *
 * A player's own picked folder is the shipping path and carries the `SPEECH/`
 * clips like any other file; `arenaPath` is the dev/test door. Neither bundles
 * the bytes.
 *
 * @param {string} key upper-case 8.3 name
 * @param {{source?: object, arenaPath?: string}} opts
 * @returns {Promise<Uint8Array|null>}
 */
async function readFileBytes(key, opts) {
  // The speech clips live in `SPEECH/`, and a picked folder's index keeps only
  // base names (`webkitRelativePath` is flattened by `fileListSource`), so the
  // folder door is asked for the bare name as well as the path. The dev door
  // serves the path; the bare name is tried second for an install that keeps
  // the clips loose at the root.
  const names = [key, key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : null].filter(Boolean);
  const source = opts.source;
  if (source && typeof source.getBytes === 'function') {
    for (const name of names) {
      const bytes = await source.getBytes(name);
      if (bytes?.length) return bytes;
    }
    return null;
  }
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  for (const name of names) {
    const res = await fetch(`/arena-local/${name}?arena=${encodeURIComponent(arenaPath)}`);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  }
  return null;
}

/**
 * One SoundFile, decoded at its own rate. The context is made for the decode
 * (buffers belong to a context) and reused, so every later trigger hands its
 * buffer to the same graph.
 *
 * @param {string} filename upper-case 8.3, e.g. `SPLASH.VOC`
 * @param {{source?: object, arenaPath?: string}} [opts] `source` (a picked
 *   folder) first, else the dev door's `?arena=` path
 * @returns {Promise<AudioBuffer|null>} `null` on any honest failure: no file,
 *   no decode, no context, no page
 */
async function decodeOne(filename, opts = {}) {
  const key = filename.toUpperCase();
  // A picked folder and the dev door can be different installs; a clip decoded
  // from one must never answer a request for the other.
  const cacheKey = `${opts.source?.label ?? opts.arenaPath ?? ''}|${key}`;
  if (decoded.has(cacheKey)) return decoded.get(cacheKey);
  let buffer = null;
  try {
    const bytes = await readFileBytes(key, opts);
    if (bytes) {
      const voc = decodeVoc(bytes);
      const audio = ensureContext();
      if (voc && audio) {
        // The decoder keeps a whole walk of blocks as segments at one rate; the
        // fanfare's own walk is one buffer, and a trigger's is short, so each
        // segment becomes its own buffer queued back to back at play time.
        buffer = {
          rate: Math.round(voc.rate),
          parts: voc.segments.map((segment) => {
            const buf = audio.createBuffer(1, segment.samples.length, Math.round(segment.rate));
            buf.copyToChannel(segment.samples, 0);
            return buf;
          }),
        };
      }
    }
  } catch (err) {
    state = { ...state, error: String(err?.message ?? err), file: key };
  }
  decoded.set(cacheKey, buffer);
  return buffer;
}

/**
 * Play a level's own sound by filename. A cell the player walks onto fires
 * *once*, so this is enough: no loop, no stopping, one shot at a modest volume.
 *
 * @param {string} filename e.g. `SPLASH.VOC` from the level's `@SOUND` list
 * @param {{source?: object, arenaPath?: string, volume?: number}} [opts]
 * @returns {Promise<boolean>} whether the shot actually started
 */
export async function playVocFile(filename, opts = {}) {
  if (!filename) return false;
  const buffer = await decodeOne(filename, opts);
  if (!buffer?.parts?.length) return false;
  const audio = ensureContext();
  if (!audio) return false;
  const volume = Math.max(0, Math.min(1, opts.volume ?? 0.5));
  const start = audio.currentTime + 0.02;
  let at = start;
  for (const part of buffer.parts) {
    const source = audio.createBufferSource();
    source.buffer = part;
    const gain = audio.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(audio.destination);
    source.start(at);
    at += part.duration;
  }
  state = {
    ...state,
    fires: state.fires + 1,
    file: filename.toUpperCase(),
    rate: buffer.rate,
    blocked: audio.state === 'suspended',
  };
  return true;
}

/**
 * The autoplay law, the fanfare's own: when a start was refused, the *first
 * gesture* both resumes the context and (optionally) calls back — a scene uses
 * this once at boot to keep a blocked trigger from vanishing into the law.
 *
 * @param {() => void} [on] called after a context that was suspended resumes
 */
/** The sources of the narration on the air, so a skip can cut the voice with the picture. */
let sequence = [];

/** Stop whatever `playVocList` started. Safe when nothing is playing. */
export function stopVocPlayback() {
  for (const source of sequence) {
    try { source.stop(); } catch { /* it had already ended */ }
  }
  sequence = [];
}

/**
 * Speak a run of `.VOC` clips back to back — Arena's narration over a scene.
 *
 * A story beat is a sequence of clips (`SPEECH/<key>_00A.VOC`, `_00B`, `_01A`, …), not one
 * file, so they are decoded first (the cache makes a replay free), then scheduled at their own
 * lengths from a single start time. That is the same clock `STORY_SPEECH` measures, so the
 * movie's narration length and the voice stay together.
 *
 * @param {string[]} files e.g. `['SPEECH/1500_00A.VOC', …]`
 * @param {{arenaPath?: string, volume?: number}} [opts]
 * @returns {Promise<boolean>} whether any clip was scheduled (false on no context, no file)
 */
export async function playVocList(files, opts = {}) {
  if (!Array.isArray(files) || files.length === 0) return false;
  stopVocPlayback();
  const audio = ensureContext();
  if (!audio) return false;
  const buffers = await Promise.all(files.map((file) => decodeOne(file, opts)));
  if (!buffers.some((buffer) => buffer?.parts?.length)) return false;
  const volume = Math.max(0, Math.min(1, opts.volume ?? 0.6));
  const start = audio.currentTime + 0.05;
  let at = start;
  const sources = [];
  for (const buffer of buffers) {
    if (!buffer?.parts?.length) continue;
    for (const part of buffer.parts) {
      const source = audio.createBufferSource();
      source.buffer = part;
      const gain = audio.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(audio.destination);
      source.start(at);
      at += part.duration;
      sources.push(source);
    }
  }
  sequence = sources;
  state = {
    ...state,
    file: String(files[0]).toUpperCase(),
    clips: files.length,
    seconds: at - start,
    blocked: audio.state === 'suspended',
  };
  return sources.length > 0;
}

export function awaitFirstGesture(on) {
  if (!ctx || ctx.state !== 'suspended') return;
  const wake = () => {
    void ctx.resume().then(() => { on?.(); });
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

/** The last play's state, as the debug seam reads it. */
export function trigSoundState() {
  return state;
}
