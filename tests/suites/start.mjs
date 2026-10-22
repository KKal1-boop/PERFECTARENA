// SUITE: THE START MENU, AND THE STORY'S OWN BEGINNING.
//
// A plain launch is Arena's title screen (`scenes/startMenu.js`), not character creation and
// not the world map. This suite holds the whole first ten minutes to that:
//
//   * the **title screen** is the install's `TITLE.IMG` behind Continue and New Game, and
//     Continue is refused, and says so, when there is no character to continue;
//   * **New Game** runs creation in this page, then the king's betrayal (`INTRO.FLC`, 76 frames)
//     and then the cell — the order `game/startFlow.js` and `scenes/newGame.js` own;
//   * **Ria's explanation** (`TEMPLATE.DAT` 1400) is owed by the new game and plays in the cell,
//     over `VISION.FLC`, with all 21 of the install's clips — a player who skips the title cards
//     still hears the story, which is the whole reason the beat moved out of the opening flow;
//   * **Continue** resumes the saved last place and does **not** replay the explanation.
//
// The dev door is `?menu`, which opens the title screen alone (no start-up cards), exactly as
// a player's own launch would after the cards have played.

/** @param {object} helpers */
export function makeStartSuite({ check, realErrors, shots, getPort }) {
  return async function suiteStart(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const url = (search) => `http://localhost:${getPort()}/${search}${search.includes('?') ? '&' : '?'}${q}`;

    // A fresh tab: the suite proves the no-character state as well as the saved one.
    await page.goto(url('?menu'));
    await page.evalJs('localStorage.clear(); sessionStorage.clear();');
    await page.goto(url('?menu'));
    await page.waitFor('window.__debug?.startMenu?.open === true', { label: 'the start menu', timeoutMs: 60000 });

    const menu = await page.evalJs('window.__debug.startMenu');
    const screen = await page.evalJs('({ art: document.getElementById("startmenu")?.className, text: document.getElementById("startmenu")?.textContent ?? "" })');
    check('a plain launch opens Arena\'s start menu, with the install\'s title art behind it',
      menu?.open === true && /\bart\b/.test(screen.art) && /ARENA/.test(screen.text),
      JSON.stringify({ art: screen.art, options: menu?.options }));
    const options = menu?.options ?? [];
    check('the menu offers New Game, and refuses Continue when there is no character — and says why',
      options.some((o) => o.action === 'new' && !o.disabled)
      && options.some((o) => o.action === 'continue' && o.disabled)
      && /no character saved/.test(screen.text),
      JSON.stringify(options));
    await page.screenshot(path.join(shots, 'start-menu.png'));

    // ── New Game: creation → the king's betrayal → the cell ──────────────────
    await page.evalJs('window.__debug.startMenu.choose("new")');
    await page.waitFor('window.__debug?.scene === "chargen"', { label: 'creation from New Game', timeoutMs: 60000 });
    await page.evalJs('window.__debug.answerAll("a")');
    const described = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.describe({ name: "Probe Hero", raceId: "nord" }))') ?? '{"ok":false}');
    const made = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.finish())') ?? '{"ok":false}');
    check('New Game is a real new game: it opens creation and makes the character',
      described.ok === true && made.ok === true && made.character?.name === 'Probe Hero',
      `${made.character?.name ?? 'none'}`);
    await page.evalJs('window.__debug.gotostep("done")');
    await page.clickSelector('#chargen-panel #cg-play');

    // The betrayal is the new game's own movie, and it is not one of the start-up cards.
    await page.waitFor('window.__debug?.opening?.file === "INTRO.FLC"', { label: 'the king’s betrayal', timeoutMs: 60000 });
    const intro = await page.evalJs('window.__debug.opening');
    check('the king\'s betrayal plays after creation, whole (INTRO.FLC, 76 frames)',
      intro?.file === 'INTRO.FLC' && intro?.frameCount === 76 && intro?.played === true,
      JSON.stringify({ file: intro?.file, frames: intro?.frameCount, played: intro?.played }));
    await page.pressKey('Escape'); await page.pressKey('Escape', false);
    await page.waitFor('window.__debug?.scene === "interior"', { label: 'the cell after the movie', timeoutMs: 90000 });

    // ── Ria's explanation, in the cell ───────────────────────────────────────
    await page.waitFor('window.__debug.movie()?.textKey === 1400', { label: 'Ria’s explanation', timeoutMs: 60000 });
    const dream = await page.evalJs('window.__debug.movie()');
    check('the cell is where Ria explains what happened (1400, VISION.FLC, her own voice)',
      dream?.file === 'VISION.FLC' && dream?.speaker === 'Ria Silmane' && dream?.narrationMs > 133000,
      JSON.stringify({ file: dream?.file, key: dream?.textKey, speaker: dream?.speaker, narrationMs: dream?.narrationMs }));
    await settle(900);
    const voice = await page.evalJs('window.__debug.triggers().sound');
    check('and the explanation speaks the install\'s own 21 clips, not captions alone',
      voice?.clips === 21 && /^SPEECH\/1400_/.test(voice?.file ?? '') && voice?.seconds > 133,
      JSON.stringify(voice));
    const owed = await page.evalJs('window.__debug.quest()');
    check('the explanation is owed by the new game, not by a menu screen that can be skipped',
      Array.isArray(owed.dreamsSeen) && owed.dreamsSeen.includes(1400),
      JSON.stringify(owed.dreamsSeen));
    await page.pressKey('Escape'); await page.pressKey('Escape', false);
    await page.waitFor('window.__debug.movie()?.done === true', { label: 'explanation dismissed', timeoutMs: 20000 });

    const cell = JSON.parse(await page.evalJs('JSON.stringify({ state: window.__debug.state(), search: location.search })'));
    check('and the player stands in the Imperial Dungeons, at the quest\'s first stage',
      cell.state?.level === 0 && /interior=START\.MIF/i.test(cell.search)
      && (await page.evalJs('window.__debug.quest()')).step === 0,
      JSON.stringify({ level: cell.state?.level, search: cell.search }));

    // ── Continue: the same cell, without a second explanation ────────────────
    await page.goto(url('?menu'));
    await page.waitFor('window.__debug?.startMenu?.open === true', { label: 'the start menu again', timeoutMs: 60000 });
    const second = await page.evalJs('window.__debug.startMenu');
    check('with a character saved, the menu offers Continue',
      second?.options?.find((o) => o.action === 'continue')?.disabled === false,
      JSON.stringify(second?.options));
    await page.evalJs('window.__debug.startMenu.choose("continue")');
    await page.waitFor('window.__debug?.scene === "interior"', { label: 'Continue into the cell', timeoutMs: 90000 });
    await settle(1400);
    const after = await page.evalJs('JSON.stringify({ dream: window.__debug.movie?.()?.textKey ?? null, quest: window.__debug.quest(), search: location.search })');
    const resumed = JSON.parse(after);
    check('Continue resumes the saved place, and Ria is not played twice for one save',
      resumed.dream === null && resumed.quest.dreamsSeen.includes(1400) && /interior=START\.MIF/.test(resumed.search),
      JSON.stringify({ movie: resumed.dream, search: resumed.search }));

    const errors = realErrors(page.consoleErrors());
    check('the start menu leaves no console errors', errors.length === 0, errors.slice(0, 3).map((e) => e.text).join(' | ').slice(0, 400));
  };
}
