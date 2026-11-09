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

import { loadCutscene, frameBytes, captionStarts } from '../game/cutscene.js';
import { cutsceneSong } from '../game/arenaMusic.js';
import { playMusic, stopMusic } from '../game/musicPlayer.js';
import { ArenaData } from '../arena/arenaData.js';
import { toRgba } from '../arena/palette.js';
import { playVocList, stopVocPlayback } from '../game/trigSound.js';

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
 *   onState?: (state: object) => void, captions?: string[], narrationMs?: number,
 *   speech?: string[]}} [opts] `speech` is the install's own voice clips (`SPEECH/…`), played
 *   in order under the picture; `narrationMs` is their measured length, which the movie loops for
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
  // **The movie's own cue**, from the same music law the places use: the opening is
  // `EVLINTRO`, a vision is `VISION`, Tharn's scenes are `EVIL`, the endings `WINGAME`.
  // Every caller gets it — the game's beats, the new-game intro and the `?cutscene` door —
  // because the audio belongs to the movie rather than to one caller. The ambience is
  // stopped by `finish` and the story's host asks for its place's song again afterwards.
  const cue = cutsceneSong(name);
  if (cue) {
    // The transition is a clean one: an arrival jingle or the place's song is stopped, then
    // the movie's cue starts. Two streams at once is exactly what the owner heard.
    stopMusic();
    void playMusic(cue, { arenaPath });
  }

  const sheet = document.createElement('canvas');
  sheet.id = 'cutscene-sheet';
  host.appendChild(sheet);
  const caption = document.createElement('div');
  caption.id = 'cutscene-caption';
  host.appendChild(caption);
  const skipPrompt = createSkipPrompt(host);
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
    skipPrompt.disarm();
    host.classList.remove('on');
    host.innerHTML = '';
    // **The voice goes with the picture**: a skipped scene stops speaking at once, and the
    // next beat never starts over the last one's last words.
    stopVocPlayback();
    if (cue) stopMusic();
    status(skipped ? `cutscene ${state.file ?? name} skipped` : `cutscene ${state.file ?? name} finished`);
    resolveExit({
      played: Boolean(state.ok) && !skipped, skipped, frames: state.framesDrawn,
      file: state.file, reason: state.reason, state: { ...state },
    });
  };
  // **A held key is not a skip** (the owner, 2026-10-18: *"cutscenes at the moment cut short"*).
  // The skip listener is a bare `keydown`, and a player who was walking when the movie started —
  // or who took the quest thing with `E` and kept the key down — delivers **auto-repeat**
  // `keydown`s every few milliseconds. The movie was then skipped before its second frame by a
  // key nobody pressed for it. An auto-repeat is exactly what `repeat` says it is, so only a
  // *fresh* press skips — and a press made while the file is still arriving still counts, which
  // is the ordering the suite pins (`cutscene`'s "same tick" case). A time grace was tried first
  // and was wrong: it swallowed the deliberate key too.
  const onKey = (event) => {
    if (event?.repeat) return;
    // **The skip is the whole meaning of this press.** The movie's listener can be registered
    // *before* the scene's (the palace's arrival movie starts during `loadLevel`, and the
    // scene's key handler is added later), so without this the same `Escape` also reached the
    // game and opened the pause menu — measured as `paused: true` after skipping `KING.FLC`,
    // with `]` unable to descend. Stopping the event here keeps the press for the movie.
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (!skipPrompt.arm()) return;
    finish(true);
  };
  const onPointer = (event) => {
    event?.stopImmediatePropagation?.();
    if (!skipPrompt.arm()) return;
    finish(true);
  };
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
  // Captions, when the scene has narration to show: one at a time, paced over the narration's
  // length. Without them the caption carries the movie's own facts, as it always did.
  const captions = Array.isArray(opts.captions) && opts.captions.length > 0 ? opts.captions : null;
  // The narration's own length, when the scene has one (the dream's speech runs well past its
  // 3-second movie). Without it the captions pace over the movie, as before.
  const narrationMs = Number.isFinite(opts.narrationMs) && opts.narrationMs > 0 ? opts.narrationMs : null;
  const captionAt = captions ? captionStarts(captions, narrationMs ?? movie.totalMs) : null;
  caption.textContent = captions ? '' : `${movie.name} · ${movie.frameCount} frames · ${Math.round(movie.delayMs)} ms each`;
  let shownCaption = -1;
  const showCaptionAt = (ms) => {
    if (!captions) return;
    let index = 0;
    while (index + 1 < captionAt.length && captionAt[index + 1] <= ms) index++;
    if (index !== shownCaption) {
      shownCaption = index;
      caption.textContent = captions[index];
    }
  };
  // **The install's own voice**, when the caller has it: the clips play back to back under the
  // picture, at the lengths `STORY_SPEECH` measured. `finish` stops them with the scene.
  const speech = Array.isArray(opts.speech) && opts.speech.length > 0 ? opts.speech : null;
  if (speech) void playVocList(speech, { arenaPath, source: opts.source });
  // A scene with narration runs for the narration's whole length, and the movie **loops** for it.
  // That is the original's law for a speech scene (OpenTESArena's `TextCinematicUiState::update`
  // wraps the animation back to its first image while the voice clips play, and the scene ends
  // with the last clip). Without narration the movie plays once, as `CinematicUiState` does.
  const loopMovie = narrationMs !== null;
  const holdUntil = loopMovie ? narrationMs : movie.totalMs;

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
  let framesDone = false;
  const tick = () => {
    const now = performance.now() - started;
    state.elapsedMs = now;
    showCaptionAt(now);
    while (!framesDone && due <= now) {
      const frame = movie.next();
      if (frame && draw(frame)) { due += movie.delayMs; continue; }
      // The movie has run out of frames. A narrated scene starts it again from its first frame,
      // unless the narration is over; a pass that draws nothing is not looped, so an empty movie
      // cannot spin the loop.
      if (loopMovie && now < holdUntil && state.framesDrawn > 0 && movie.rewind) {
        movie.rewind();
        state.loops = (state.loops ?? 0) + 1;
        const first = movie.next();
        if (first && draw(first)) { due += movie.delayMs; continue; }
      }
      framesDone = true;
    }
    if (framesDone && now >= holdUntil) { finish(false); return; }
    state.playing = true;
    observer();
    raf = requestAnimationFrame(tick);
  };
  state.playing = true;
  raf = requestAnimationFrame(tick);

  return await exit;
}

/**
 * Hold one still picture of the install on the screen for `seconds`, then answer.
 *
 * Arena's opening shows its title and quote cards, and the story's scroll pictures, as still
 * images rather than movies. The picture is an `.IMG` from the install (loose, or in
 * `GLOBAL.BSA`), shown in `paletteFile`'s palette when its own file carries none. A key or a
 * click skips it, as it skips a movie, and a picture the install does not have answers `played:
 * false` rather than stopping the opening.
 *
 * @param {string} file        e.g. `TITLE.IMG`
 * @param {{seconds?: number, paletteFile?: string, source?: object|null,
 *   arenaPath?: string, status?: (m: string) => void}} [opts]
 * @returns {Promise<{played: boolean, skipped: boolean, frames: number, file: string, reason: string|null}>}
 */
export async function showStill(file, opts = {}) {
  const status = opts.status ?? (() => {});
  const arenaPath = opts.arenaPath || 'C:/arenaproject/arena/ARENA';
  const seconds = opts.seconds ?? 5;
  status(`still ${file}`);

  const host = document.getElementById('cutscene') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'cutscene' }));
  host.innerHTML = '';
  host.classList.add('on');
  const sheet = document.createElement('canvas');
  sheet.id = 'cutscene-sheet';
  host.appendChild(sheet);
  const skipPrompt = createSkipPrompt(host);

  let done = false;
  let timer = 0;
  let resolveExit = () => {};
  const exit = new Promise((resolve) => { resolveExit = resolve; });
  const resize = () => {
    const width = Number(sheet.width) || 320;
    const height = Number(sheet.height) || 200;
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / width, (window.innerHeight * 0.82) / height)));
    sheet.style.width = `${width * scale}px`;
    sheet.style.height = `${height * scale}px`;
  };
  const finish = (skipped, shown) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('resize', resize);
    skipPrompt.disarm();
    host.classList.remove('on');
    host.innerHTML = '';
    status(skipped ? `still ${file} skipped` : `still ${file} finished`);
    resolveExit({ played: shown && !skipped, skipped, frames: shown ? 1 : 0, file, reason: null });
  };
  // The same skip law as the movie player: a fresh press or click arms the note, the next
  // one ends the picture, auto-repeat does not, and the listeners are up before the file arrives.
  const onKey = (event) => {
    if (event?.repeat) return;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (!skipPrompt.arm()) return;
    finish(true, false);
  };
  const onPointer = (event) => {
    event?.stopImmediatePropagation?.();
    if (!skipPrompt.arm()) return;
    finish(true, false);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer);
  window.addEventListener('resize', resize);

  const source = opts.source ?? installSource(arenaPath);
  const data = new ArenaData(source, { onWarn: (m) => console.warn(`[arena] ${m}`) });
  let image = null;
  let palette = null;
  try {
    image = await data.img(file);
    const paletteFile = opts.paletteFile ?? file;
    palette = image.palette ?? (await data.img(paletteFile)).palette;
    if (!palette) throw new Error(`${file} has no palette, and ${paletteFile} gave none either`);
  } catch (err) {
    console.warn(`[still] ${file}: ${String(err?.message ?? err)}`);
    finish(false, false);
    return { played: false, skipped: false, frames: 0, file, reason: String(err?.message ?? err) };
  }
  // A skip that landed while the picture was still arriving is honoured: it never shows.
  if (done) return await exit;

  sheet.width = image.width;
  sheet.height = image.height;
  const ctx = sheet.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rgba = toRgba(image.indices, palette, { width: image.width, height: image.height });
  ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  resize();
  timer = setTimeout(() => finish(false, true), seconds * 1000);
  return await exit;
}

/**
 * The first fresh input arms a skip and shows where the second one is; the second input
 * finishes. A cutscene must not vanish on the same keypress that was meant to start it.
 *
 * @param {HTMLElement} host the `#cutscene` layer
 */
function createSkipPrompt(host) {
  const hint = document.createElement('div');
  hint.id = 'cutscene-skip-hint';
  hint.textContent = 'click again to skip';
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  host.appendChild(hint);
  let armed = false;
  let timer = 0;
  return {
    /** @returns {boolean} true when this is the confirming input */
    arm() {
      if (armed) return true;
      armed = true;
      hint.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { armed = false; hint.hidden = true; }, 2800);
      return false;
    },
    disarm() {
      armed = false;
      clearTimeout(timer);
      hint.hidden = true;
    },
  };
}

/**
 * The install's files through the dev door, for a picture shown without a picked folder.
 *
 * @param {string} arenaPath
 */
function installSource(arenaPath) {
  return {
    label: arenaPath,
    list: () => [],
    getBytes: async (name) => {
      const res = await fetch(`/arena-local/${encodeURIComponent(String(name).toUpperCase())}?arena=${encodeURIComponent(arenaPath)}`);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
  };
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
    skipCutscene: () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    },
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
