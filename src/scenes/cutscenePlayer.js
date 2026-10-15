// THE CUTSCENE PLAYER — the install's own `.FLC` movies, on the screen.
//
// A DOM layer over the GL canvas, like every other panel this port shows (the creation
// sheet, the ending, the menu): the movie's frames are Arena's own 320×200 art, and a canvas
// at that size scaled by a whole-number factor is the only honest way to show 1994 pixels
// (fractional scaling blurs a hand-inked palette; `image-rendering: pixelated` keeps it).
//
// The pacing is the **file's own** delay per frame. It is driven by wall-clock time, not by
// frame count: a decoder that takes 8 ms on one frame and 30 ms on another must not make the
// movie play slow.
//
// Any key or click skips — a player who has seen the opening fifteen times does not want it
// again — and the state is on `window.__debug.cutscene()` so a scripted run can watch the
// frames go by instead of guessing.

import { loadCutscene, frameBytes } from '../game/cutscene.js';

/**
 * Play one movie, over whatever is on screen, and answer when it ends.
 *
 * This is the whole player without the debug seam, because two callers want it: the
 * `?cutscene` dev door (a scene of its own, which then sets the seam) and the game's own
 * story beats — the closing movie before the ending page, a beat's vision mid-level — which
 * must not overwrite the scene's `__debug` while they play.
 *
 * @param {string} name a `.FLC` name, or a bare word `cutsceneByName` resolves
 * @param {{source?: object|null, arenaPath?: string, status?: (m: string) => void,
 *   onState?: (state: object) => void}} [opts]
 * @returns {Promise<{played: boolean, skipped: boolean, frames: number, file: string|null,
 *   reason: string|null, state: object}>}
 */
export async function showMovie(name, opts = {}) {
  const status = opts.status ?? (() => {});
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  status(`cutscene ${name}`);

  const host = document.getElementById('cutscene') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'cutscene' }));
  host.innerHTML = '';
  host.classList.add('on');

  const sheet = document.createElement('canvas');
  sheet.id = 'cutscene-sheet';
  host.appendChild(sheet);
  const caption = document.createElement('div');
  caption.id = 'cutscene-caption';
  host.appendChild(caption);
  const scratch = document.createElement('canvas');

  /**
   * The movie's state, and the **keyboard, from the first moment of the fetch**.
   *
   * The skip listeners used to be attached after the file was fetched and decoded, which on a
   * 1.5 MB `.FLC` is a real window of a second or more — and a player who presses a key in it
   * presses a key that is thrown away, so the movie they asked not to see plays anyway.
   * Measured: the main quest's suite skimmed the vision, saw it on screen, pressed Escape and
   * waited in vain ("timed out waiting for the vision skipped"). The skip is honored while the
   * file is still arriving, and the movie then does not start at all.
   */
  const state = {
    file: null,
    requested: name,
    ok: false,
    reason: null,
    width: null,
    height: null,
    frameCount: null,
    delayMs: null,
    totalMs: null,
    bytes: null,
    framesDrawn: 0,
    playing: false,
    loading: true,
    done: false,
    skipped: false,
    elapsedMs: 0,
  };

  let resolveExit = () => {};
  const exit = new Promise((resolve) => { resolveExit = resolve; });
  const observer = () => opts.onState?.({ ...state });
  /** Everything the listeners below need, filled in as the movie arrives. */
  const teardown = [];
  const finish = (skipped) => {
    if (state.done) return;
    state.done = true;
    state.playing = false;
    state.loading = false;
    state.skipped = skipped;
    for (const off of teardown) off();
    host.classList.remove('on');
    host.innerHTML = '';
    status(skipped ? `cutscene ${state.file ?? name} skipped` : `cutscene ${state.file ?? name} finished`);
    resolveExit({
      played: Boolean(state.ok) && !skipped, skipped, frames: state.framesDrawn,
      file: state.file, reason: state.reason, state: { ...state },
    });
  };
  const onKey = () => finish(true);
  const onPointer = () => finish(true);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer);
  teardown.push(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
  });
  observer();

  const movie = await loadCutscene(name, { source: opts.source, arenaPath });
  Object.assign(state, {
    file: movie.ok ? movie.name : null,
    ok: Boolean(movie.ok),
    reason: movie.reason ?? null,
    width: movie.width ?? null,
    height: movie.height ?? null,
    frameCount: movie.frameCount ?? null,
    delayMs: movie.delayMs ?? null,
    totalMs: movie.totalMs ?? null,
    bytes: movie.bytes ?? null,
    loading: false,
  });
  observer();
  if (!movie.ok) {
    console.warn(`[cutscene] ${state.reason}`);
    finish(false);
    return { played: false, skipped: false, frames: 0, file: null, reason: state.reason, state: { ...state } };
  }
  // Skipped while the file was still arriving: honored, and the movie never starts.
  if (state.skipped) return await exit;

  // The sheet is the file's own size, scaled whole into the viewport.
  sheet.width = movie.width;
  sheet.height = movie.height;
  const ctx = sheet.getContext('2d');
  scratch.width = movie.width;
  scratch.height = movie.height;
  const scratchCtx = scratch.getContext('2d');
  caption.textContent = `${movie.name} · ${movie.frameCount} frames · ${Math.round(movie.delayMs)} ms each`;

  const resize = () => {
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / movie.width, (window.innerHeight * 0.82) / movie.height)));
    sheet.style.width = `${movie.width * scale}px`;
    sheet.style.height = `${movie.height * scale}px`;
  };
  resize();
  window.addEventListener('resize', resize);

  /** One frame, drawn. Returns false when there is nothing left to draw. */
  const draw = (frame) => {
    if (!frame) return false;
    const bytes = frameBytes(frame.colours);
    scratchCtx.putImageData(new ImageData(bytes, frame.width, frame.height), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, movie.width, movie.height);
    state.framesDrawn++;
    return true;
  };

  let raf = 0;
  const started = performance.now();
  // A finished movie stops the loop and lets the resize listener go.
  teardown.push(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  });

  // The loop: frame `n` is due at `n * delayMs`. The decoder is *sequential* (FLIC frames are
  // deltas), so the movie is simply played forward — the only order the format allows.
  let due = 0;
  const tick = () => {
    const now = performance.now() - started;
    state.elapsedMs = now;
    while (due <= now) {
      const frame = movie.next();
      if (!frame || !draw(frame)) { finish(false); return; }
      due += movie.delayMs;
    }
    state.playing = true;
    observer();
    raf = requestAnimationFrame(tick);
  };
  state.playing = true;
  raf = requestAnimationFrame(tick);

  return await exit;
}

/**
 * Boot the cutscene player as a scene of its own — the `?cutscene` dev door.
 *
 * @param {HTMLCanvasElement} canvas the game's GL canvas (behind the movie)
 * @param {object} _renderer the engine renderer (unused: this is 2D art)
 * @param {URLSearchParams} params  `?cutscene=INTRO.FLC`, or `?cutscene` for the opening
 * @param {(msg: string) => void} status
 * @param {import('../arena/browserSource.js').ArenaSource|null} source a picked folder, if any
 * @returns {Promise<{played: boolean, skipped: boolean, frames: number, file: string|null}>}
 */
export async function bootCutscene(_canvas, _renderer, params, status, source = null) {
  const wanted = params.get('cutscene') || params.get('movie') || 'INTRO.FLC';
  /** The last state the player handed back, so the seam answers *now*, mid-movie too. */
  let latest = { requested: wanted };
  Object.assign(window.__debug ?? (window.__debug = {}), {
    scene: 'cutscene',
    state: () => ({
      scene: 'cutscene',
      notice: null,
      feet: [0, 0, 0],
      grounded: true,
      painted: latest.framesDrawn ?? 0,
      size: [latest.width ?? null, latest.height ?? null],
      cutscene: { ...latest },
    }),
    /** The movie's own state — what a scripted run watches. */
    cutscene: () => ({ ...latest }),
    /** Skip, exactly as any key does. */
    skipCutscene: () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true; },
  });
  const result = await showMovie(wanted, {
    source,
    arenaPath: params.get('arena') || 'C:/arenaproject/arena/ARENA',
    status,
    onState: (state) => { latest = state; },
  });
  latest = result.state;
  return result;
}
