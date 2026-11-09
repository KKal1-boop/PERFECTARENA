// THE INSTALL'S OWN MOVIES, ON SCREEN — `?cutscene` end to end.
//
// The unit pins (`tests/unit/cutscene.test.mjs`) hold the reader against the file's own bytes.
// This is the other half: the movie is really *played* in a page — its frames advance on the
// file's own clock, the art is on the screen as pixels, it ends by itself, a key skips it, and
// a name this install does not ship is refused without a boot error or a console complaint.
//
// `JAGAR.FLC` is the movie chosen: 25 KB, 28 frames, 128 ms each — a whole playthrough is
// about 3.6 s, which is cheap enough to watch to the end inside a suite.

import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function makeCutsceneSuite({ check, realErrors, shots, getPort, decodePng }) {
  return async function cutsceneSuite(page) {
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const url = (query) => `http://localhost:${getPort()}/?${query}&arena=${encodeURIComponent(arena)}`;
    const movieState = () => page.evalJs('window.__debug.cutscene()');

    // ── the door: one movie, its own scene ────────────────────────────────────
    await page.goto(url('cutscene=JAGAR.FLC'));
    await page.waitFor('window.__debug?.scene === "cutscene"', { label: 'the movie scene', timeoutMs: 30000 });
    await page.waitFor('window.__debug.cutscene().framesDrawn > 0', { label: 'the first frame', timeoutMs: 20000 });
    const first = await movieState();
    check('the door plays the movie that was asked for, decoded from its own header',
      first.file === 'JAGAR.FLC' && first.width === 320 && first.height === 200 && first.frameCount === 28,
      JSON.stringify({ file: first.file, size: [first.width, first.height], frames: first.frameCount }));
    check('its pacing is the file’s own frame delay, not a constant in the project',
      Math.round(first.delayMs) === 128 && Math.round(first.totalMs) === 128 * 28,
      `${Math.round(first.delayMs)} ms × ${first.frameCount}`);
    check('Arena’s own 320×200 sheet is the thing on screen, at a whole-number scale',
      await page.evalJs(`(() => {
        const el = document.getElementById('cutscene-sheet');
        const host = document.getElementById('cutscene');
        return Boolean(el && el.width === 320 && el.height === 200 && host.classList.contains('on')
          && parseFloat(el.style.width) % 320 === 0 && parseFloat(el.style.width) >= 320);
      })()`));

    // ── the frames advance by themselves ─────────────────────────────────────
    const before = (await movieState()).framesDrawn;
    await sleep(1000);
    const after = (await movieState()).framesDrawn;
    check('the frames advance on their own clock while nobody touches anything',
      after > before, `${before} → ${after} frames drawn`);

    // ── the art is really on the screen ──────────────────────────────────────
    const png = await page.screenshot(path.join(shots, 'cutscene-jagar.png'));
    if (decodePng) {
      const stats = decodePng(png);
      const colours = new Set();
      let lit = 0;
      for (let i = 0; i < stats.data.length; i += 4) {
        if (stats.data[i] || stats.data[i + 1] || stats.data[i + 2]) lit++;
        if (colours.size < 4000) colours.add((stats.data[i] << 16) | (stats.data[i + 1] << 8) | stats.data[i + 2]);
      }
      check('the movie is drawn as a picture, not a black screen',
        lit > 0.05 * (stats.width * stats.height) && colours.size > 32,
        `${lit} lit pixels, ${colours.size} colours`);
    }

    // ── it plays to the end by itself ────────────────────────────────────────
    await page.waitFor('window.__debug.cutscene().done === true', { label: 'the movie ending', timeoutMs: 30000 });
    const ended = await movieState();
    check('every frame of the file is played and the movie ends itself',
      ended.framesDrawn === 28 && ended.skipped === false && ended.done === true,
      `${ended.framesDrawn} frames, skipped=${ended.skipped}`);
    check('nothing of the movie is left on the screen when it is over',
      await page.evalJs(`!document.getElementById('cutscene').classList.contains('on')`));

    // ── a key skips it ───────────────────────────────────────────────────────
    await page.goto(url('cutscene=JAGAR.FLC'));
    await page.waitFor('window.__debug?.scene === "cutscene" && window.__debug.cutscene().framesDrawn > 0',
      { label: 'the movie again', timeoutMs: 30000 });
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await page.waitFor('document.getElementById("cutscene-skip-hint") && !document.getElementById("cutscene-skip-hint").hidden', { label: 'the skip confirmation', timeoutMs: 5000 });
    const skipHint = await page.evalJs(`(() => {
      const h = document.getElementById('cutscene-skip-hint');
      const r = h.getBoundingClientRect();
      return { text: h.textContent, hidden: h.hidden, right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) };
    })()`);
    check('the first input only shows “click again to skip” at the bottom-right',
      skipHint.text === 'click again to skip' && skipHint.hidden === false
      && skipHint.right < 40 && skipHint.bottom < 40, JSON.stringify(skipHint));
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await page.waitFor('window.__debug.cutscene().done === true', { label: 'the skip', timeoutMs: 10000 });
    const skipped = await movieState();
    check('a second real key skips the movie, as a player who has seen it would',
      skipped.skipped === true && skipped.framesDrawn < 28, JSON.stringify({ frames: skipped.framesDrawn, skipped: skipped.skipped }));

    // ── a skip while the file is still arriving ──────────────────────────────
    //
    // The law is **when the listeners go up**, not how fast the disk is: the skip used to be
    // attached after the fetch and decode, so a key pressed in that window was thrown away —
    // and the ending's own vision was "seen" by a player who had refused it (`mainquest`
    // caught it as "timed out waiting for the vision skipped"). So this is measured where it
    // is deterministic: the install's largest movie (13.6 MB, `WALK.FLC`) is asked for, and
    // the key is dispatched **in the same tick** — before the fetch can possibly have
    // answered — through the real player module at its real path. The movie must never draw
    // a frame. (Real-key skipping is held by the check above; this one holds the ordering.)
    const early = JSON.parse(await page.evalJs(`(async () => {
      const { showMovie } = await import('/src/scenes/cutscenePlayer.js');
      const playing = showMovie('WALK.FLC', { arenaPath: ${JSON.stringify(arena)} });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const result = await playing;
      return JSON.stringify({ skipped: result.skipped, frames: result.frames, requested: result.state?.requested ?? null, played: result.played });
    })()`));
    // `file` is null and `played` false on purpose: the movie was refused before a frame of it
    // existed, so the honest report is the name it was asked for, zero frames, and a skip.
    check('a key pressed while the file is still arriving is honored, not thrown away',
      early.skipped === true && early.frames === 0 && early.requested === 'WALK.FLC' && early.played === false,
      JSON.stringify(early));
    check('and the movie it skipped is not left on the screen',
      await page.evalJs(`!document.getElementById('cutscene').classList.contains('on')`));

    // ── a narrated scene loops its movie for the narration's length ────────────
    //
    // VISION.FLC is 20 frames at 171 ms (3.4 s). Its dream narration runs 9 s here, so the movie
    // must come round again (the original wraps its animation while the voice clips play), and the
    // scene must end with the narration, not with the movie's own last frame.
    const looped = JSON.parse(await page.evalJs(`(async () => {
      const { showMovie } = await import('/src/scenes/cutscenePlayer.js');
      const t0 = performance.now();
      const result = await showMovie('VISION.FLC', {
        arenaPath: ${JSON.stringify(arena)}, captions: ['first line', 'second line'], narrationMs: 9000,
      });
      return JSON.stringify({
        ms: performance.now() - t0, played: result.played, skipped: result.skipped,
        frames: result.frames, loops: result.state?.loops ?? 0, totalMs: result.state?.totalMs ?? null,
      });
    })()`));
    check('a narrated movie loops for the whole narration, then ends with it',
      looped.played === true && looped.skipped === false && looped.loops >= 2
        && looped.ms >= 8500 && looped.ms <= 11000,
      JSON.stringify(looped));

    // ── the opening, by its bare word ────────────────────────────────────────
    await page.goto(url('cutscene'));
    await page.waitFor('window.__debug?.scene === "cutscene" && window.__debug.cutscene().file !== null',
      { label: 'the default movie', timeoutMs: 30000 });
    const opening = await movieState();
    check('`?cutscene` with no name is the opening the original greets a new game with',
      opening.file === 'INTRO.FLC' && opening.frameCount > 28,
      JSON.stringify({ file: opening.file, frames: opening.frameCount }));
    await page.evalJs('window.__debug.skipCutscene()');

    // ── a movie this install does not ship ───────────────────────────────────
    await page.goto(url('cutscene=NOSUCH.FLC'));
    await page.waitFor('window.__debug?.scene === "cutscene" && window.__debug.cutscene().done !== undefined',
      { label: 'the refused movie', timeoutMs: 20000 });
    const refused = await movieState();
    check('a movie this install does not ship is refused honestly, with the reason said',
      refused.ok === false && /not in this install|answered 4\d\d|FLIC reader/.test(String(refused.reason)),
      JSON.stringify({ ok: refused.ok, reason: refused.reason }));
    check('and the refusal is not a boot error: the page still runs',
      !(await page.evalJs('window.__bootError || null')));
    check('no console errors while playing and refusing movies',
      realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  };
}
