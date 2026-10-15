// THE TRIGGERS' SOUND — the level's own `@SOUND` clips, played when their cell
// fires.
//
// The fanfare (`game/fanfare.js`) proved the whole path — the Creative `.VOC`
// decode and the WebAudio playback at the file's own rate. This module is the same
// path opened for every file a `.INF` names: fetched through the same `/arena-local`
// dev door every install file loads by, decoded once per *filename*, and played as
// a one-shot so a corridor of trigger cells rings one tell after another rather
// than stacking.
//
// The browser's autoplay law is honored the way the fanfare honors it: a context
// the page has not touched yet waits for the first gesture, and the state seam
// says so honestly.

import { decodeVoc } from '../arena/vocFile.js';

/** Decoded WebAudio buffers by upper-case filename, built once per page. */
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
 * One SoundFile from `/arena-local`, decoded at its own rate. The context is
 * made for the decode (buffers belong to a context) and reused, so every later
 * trigger hands its buffer to the same graph.
 *
 * @param {string} filename upper-case 8.3, e.g. `SPLASH.VOC`
 * @param {string} arenaPath the dev door's `?arena=` path
 * @returns {Promise<AudioBuffer|null>} `null` on any honest failure: no file,
 *   no decode, no context, no page
 */
async function decodeOne(filename, arenaPath) {
  const key = filename.toUpperCase();
  if (decoded.has(key)) return decoded.get(key);
  let buffer = null;
  try {
    const res = await fetch(`/arena-local/${key}?arena=${encodeURIComponent(arenaPath)}`);
    if (res.ok) {
      const voc = decodeVoc(new Uint8Array(await res.arrayBuffer()));
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
  decoded.set(key, buffer);
  return buffer;
}

/**
 * Play a level's own sound by filename. A cell the player walks onto fires
 * *once*, so this is enough: no loop, no stopping, one shot at a modest volume.
 *
 * @param {string} filename e.g. `SPLASH.VOC` from the level's `@SOUND` list
 * @param {{arenaPath?: string, volume?: number}} [opts]
 * @returns {Promise<boolean>} whether the shot actually started
 */
export async function playVocFile(filename, opts = {}) {
  if (!filename) return false;
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  const buffer = await decodeOne(filename, arenaPath);
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
