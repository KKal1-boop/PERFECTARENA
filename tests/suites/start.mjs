// SUITE: THE START MENU, AND THE STORY'S OWN BEGINNING.
//
// A plain launch is Arena's title screen (`scenes/startMenu.js`), not character creation and
// not the world map. This suite holds the whole first ten minutes to that:
//
//   * the **title screen** is the install's `TITLE.IMG` behind Continue and New Game, and
//     Continue is refused, and says so, when there is no character to continue;
//   * **New Game** plays the opening scroll and the nine-panel history, runs creation in this
//     page, and wakes the player in the cell — the order `game/startFlow.js` and
//     `scenes/newGame.js` own. The pictures are the New Game's own, not the shorter start-up
//     cards;
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
    const screen = await page.evalJs(`(() => {
      const host = document.getElementById('startmenu');
      const art = document.getElementById('startmenu-art');
      const cs = getComputedStyle(art);
      return {
        art: host?.className,
        text: host?.textContent ?? '',
        title: host?.querySelector('h1')?.textContent ?? null,
        kicker: Boolean(host?.querySelector('.kicker')),
        sub: Boolean(host?.querySelector('.sub')),
        filter: cs.filter,
        opacity: cs.opacity,
      };
    })()`);
    check('a plain launch opens Arena\'s start menu over its undimmed title art, with no duplicate title block',
      menu?.open === true && /\bart\b/.test(screen.art)
      && screen.title === null && screen.kicker === false && screen.sub === false
      && !/Imperial Seat|The Elder Scrolls/i.test(screen.text)
      && screen.filter === 'none' && screen.opacity === '1',
      JSON.stringify({ art: screen.art, title: screen.title, filter: screen.filter, opacity: screen.opacity }));
    // The art is an absolutely positioned canvas over the whole window, so it painted *over* the
    // panel at a desk's aspect — the menu was there, under the picture. What the eye sees at the
    // panel's own middle must be the panel, and what it is painted on must be the page's tan.
    const painted = await page.evalJs(`(() => {
      const panel = document.querySelector('#startmenu .panel');
      const r = panel.getBoundingClientRect();
      const at = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      const cs = getComputedStyle(panel);
      // The page's tone is read off the stylesheet's own token, so a change to the paper's
      // colour is a change in one place rather than in this suite too.
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--ui-paper').trim();
      const h = hex.replace('#', '');
      const paper = h.length === 6
        ? 'rgb(' + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')'
        : null;
      return { inPanel: Boolean(at && panel.contains(at)), bg: cs.backgroundColor, paper, clip: cs.backgroundClip, z: cs.zIndex };
    })()`);
    check('and the page stands in front of the picture — the scroll is drawn, not hidden under the art',
      painted.inPanel === true && Boolean(painted.paper) && painted.bg === painted.paper
      && painted.clip === 'padding-box' && painted.z !== 'auto',
      JSON.stringify(painted));
    check('the scroll\'s transparent corners are cut-outs, not a pale paper border',
      painted.clip === 'padding-box', painted.clip);
    const options = menu?.options ?? [];
    check('the menu offers New Game, refuses Continue without a character, and has no Scenes button',
      options.some((o) => o.action === 'new' && !o.disabled)
      && options.some((o) => o.action === 'continue' && o.disabled)
      && !options.some((o) => o.action === 'scenes')
      && /no character saved/.test(screen.text),
      JSON.stringify(options));
    await page.screenshot(path.join(shots, 'start-menu.png'));

    // ── New Game: the scroll history → creation → the cell ───────────────────
    await page.evalJs('window.__debug.startMenu.choose("new")');
    await page.waitFor('window.__debug?.opening?.current != null', { label: 'the New Game scroll history', timeoutMs: 60000 });
    const historyStart = await page.evalJs('window.__debug.opening.current ?? null');
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await page.waitFor('document.getElementById("cutscene-skip-hint") && !document.getElementById("cutscene-skip-hint").hidden', { label: 'the first skip note', timeoutMs: 5000 });
    const skipHint = await page.evalJs(`(() => {
      const h = document.getElementById('cutscene-skip-hint');
      const r = h.getBoundingClientRect();
      return { text: h.textContent, hidden: h.hidden, right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) };
    })()`);
    check('the first skip input only asks again, in the bottom-right; the second one skips',
      skipHint.text === 'click again to skip' && skipHint.hidden === false
      && skipHint.right < 40 && skipHint.bottom < 40, JSON.stringify(skipHint));
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await page.waitFor('window.__debug?.scene === "chargen"', { label: 'creation from New Game', timeoutMs: 60000 });
    await page.evalJs('window.__debug.answerAll("a")');
    const described = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.describe({ name: "Probe Hero", raceId: "nord" }))') ?? '{"ok":false}');
    const made = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.finish())') ?? '{"ok":false}');
    check('New Game is a real new game: it opens creation and makes the character',
      described.ok === true && made.ok === true && made.character?.name === 'Probe Hero',
      `${made.character?.name ?? 'none'}`);
    await page.evalJs('window.__debug.gotostep("done")');
    await page.clickSelector('#chargen-panel #cg-play');

    // **The New Game history is before the make, not between creation and the cell.** Its
    // first picture is the opening scroll; the nine INTRO panels follow it. Skipping the
    // sequence only skips the story, never character creation.
    await page.waitFor('window.__debug?.scene === "interior"', { label: 'the cell after creation', timeoutMs: 120000 });
    const opening = await page.evalJs('window.__debug.opening');
    check('New Game plays the opening scroll history before creation, then wakes the character in the cell',
      (historyStart === 'SCROLL.FLC' || historyStart === 'INTRO01.IMG')
      && opening?.steps?.[0]?.file === 'SCROLL.FLC' && opening?.skipped === true,
      JSON.stringify({ historyStart, opening }));

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
