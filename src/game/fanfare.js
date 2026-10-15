// THE FANFARE — the install's own greeting, finally audible in the port.
//
// Arena greets a session with `FANFARE1.VOC` (its sibling `FANFARE2.VOC` rides beside
// it). Until now the port read none of the install's sound — `arena/vocFile.js` decodes
// the Creative Voice File the bytes actually are, and this module is the *play* side:
// fetch it once per page through the same dev door every install file loads by, decode
// it, and hand the WebAudio graph the fanfare's own samples at its own rate.
//
// The browser's autoplay law is honored, not fought: a page the user has not touched
// may refuse to start the context, and then the fanfare waits for the **first gesture**
// — the pointer or a key — and greets then. The state is honest either way:
// `{ decoded, rate, samples, played, blocked }`.

import { decodeVoc } from '../arena/vocFile.js';

/** The module's own one-shot: a session is greeted once, whichever scene boots it. */
let tried = false;
/** The last attempt's own state, as the debug seam reads it. */
let state = { tried: false };

/**
 * The greeting is **once per session**, not once per page load.
 *
 * Arena plays `FANFARE1.VOC` when the program starts, and the port asked for it once per
 * *page* — which is not the same thing, because the port is a page per level: a town, a
 * dungeon and a wilderness window are three boots, and every one of them greeted the player
 * again with the install's own rising sting. Reported as "I hear randomly the level up sound
 * in my computer": the fanfare is a triumph sting, and it was firing on scene changes rather
 * than on starting the game. Measured against the bytes before a line was written — the clip
 * is decoded and real (`tests/unit/voc.test.mjs`), so the fault was never the reader, only
 * *when* it was asked for.
 *
 * The tab's own session is the session: `sessionStorage` keeps the flag across a reload and
 * a scene swap, and an ordinary reload of the page deliberately starts a new session — which
 * is when a player does expect to be greeted.
 */
const GREETED_KEY = 'pa.fanfare.greeted';

/** Has *this tab's session* already heard the greeting? Storage may be absent: then no. */
function alreadyGreeted() {
  try {
    return window.sessionStorage?.getItem(GREETED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember the greeting, best effort — a session with no storage is greeted each boot. */
function markGreeted() {
  try {
    window.sessionStorage?.setItem(GREETED_KEY, '1');
  } catch { /* private mode, or no window: the greeting simply repeats */ }
}

/**
 * Fetch, decode and play the install's own fanfare — once per page.
 *
 * @param {{arenaPath?: string|null}} [opts] the dev door's `?arena=` path, as every
 *   other install file resolves it
 * @returns {Promise<object>} the state: `{ tried, decoded, rate, samples, played, blocked }`
 */
export async function playFanfare(opts = {}) {
  if (tried) return state;
  tried = true;
  if (alreadyGreeted()) {
    state = { ...state, tried: true, skipped: 'this session has already been greeted' };
    return state;
  }
  state = { ...state, tried: true };
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  try {
    const res = await fetch(`/arena-local/FANFARE1.VOC?arena=${encodeURIComponent(arenaPath)}`);
    if (!res.ok) return state;
    const decoded = decodeVoc(new Uint8Array(await res.arrayBuffer()));
    if (!decoded) return state;
    const samples = decoded.segments.reduce((n, s) => n + s.samples.length, 0);
    state = { ...state, decoded: true, rate: Math.round(decoded.rate), samples };
    const Ctx = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!Ctx) return state;
    const ctx = new Ctx();
    // The segments play back to back at their own rates, the fanfare's rests included:
    // the reader keeps a rest as real zeros, so the whole walk is one buffer per rate.
    const ctxBuffers = decoded.segments.map((segment) => {
      const buffer = ctx.createBuffer(1, segment.samples.length, Math.round(segment.rate));
      buffer.copyToChannel(segment.samples, 0);
      return buffer;
    });
    state = { ...state, buffers: ctxBuffers.length, blocked: ctx.state === 'suspended' };
    markGreeted();
    const play = () => {
      let at = ctx.currentTime + 0.05;
      for (const buffer of ctxBuffers) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(at);
        at += buffer.duration;
      }
      state = { ...state, played: true };
    };
    if (!state.blocked) play();
    else {
      const greet = () => {
        void ctx.resume().then(() => play());
        window.removeEventListener('pointerdown', greet);
        window.removeEventListener('keydown', greet);
      };
      window.addEventListener('pointerdown', greet, { once: true });
      window.addEventListener('keydown', greet, { once: true });
    }
  } catch (err) {
    state = { ...state, error: String(err?.message ?? err) };
  }
  return state;
}

/**
 * The last attempt's state, as the debug seam reads it — and whether the greeting still
 * waits for the player's own gesture (the page's autoplay law, said honestly).
 */
export function fanfareState() {
  return state;
}
