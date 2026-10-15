// SUITE: THE MAIN QUEST, START TO FINISH, WITH REAL KEYS.
//
// The brief's own definition of done for the main story is a scripted run that proves
// the quest can be *completed* — not one piece of it, all of it. This suite is that run:
// escape the Imperial Dungeons, take the eight pieces of the Staff of Chaos in the order
// the game documents, then descend the Imperial Palace, find the mithril key, unlock the
// Jewel of Fire's cell and free the Emperor. Ten stages, every one of them reached by
// travelling to a place by its own name and pressing `E` where the game says to.
//
// The debug seam is used to *travel* (moving the camera to a cell so the walk does not
// take ten minutes) and to *observe*; the transitions themselves are the `E` key, the
// `]` key for the palace's floors, and the state machines' own rules. Where a step could
// pass vacuously — "the quest is done" — the check names what it is asserting: the piece
// count, the flag that flipped, the cell the objective moved to.
//
// It is deliberately the long suite: eight dungeons and their eight map dungeons are
// eighteen page loads. It runs last, and it is the one that says the game is finishable.

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots
 * @param {() => number} helpers.getPort
 * @returns {(page: object) => Promise<void>}
 */
export function makeMainQuestSuite({ check, realErrors, shots, getPort }) {
  return async function suiteMainQuest(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const url = (rest) => `http://localhost:${getPort()}/?${rest}&${q}`;
    const settle = (ms = 160) => new Promise((r) => setTimeout(r, ms));

    /** Open a place by name and wait until its first frame is drawn. */
    const enter = async (rest) => {
      await page.goto(url(rest));
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
        { label: rest, timeoutMs: 120000 });
    };

    /**
     * Walk the camera to the objective and take it with the `E` key, as a player does.
     *
     * Gives back the objective that was taken (`objective`), the quest after it, and the
     * objective that took its place (`next`) — a take that leaves nothing behind is as
     * much a failure as a take that does nothing, and the two are told apart by reading
     * before and after rather than by assuming either.
     */
    const takeWithE = async () => {
      const objective = await page.evalJs('JSON.stringify(window.__debug.objective())');
      await page.evalJs('window.__debug.teleportToObjective()');
      await settle();
      await page.pressKey('KeyE');
      await settle(260);
      return {
        objective: JSON.parse(objective ?? 'null'),
        quest: await page.evalJs('window.__debug.quest()'),
        next: await page.evalJs('window.__debug.objective()'),
      };
    };

    // ── someone to play, and a quest to play ───────────────────────────────────
    //
    // The character is made through the game's own creation flow, quietly: its suite
    // checks that flow click by click, and what matters *here* is that the run ends
    // with a real person on the sheet. The quest, though, is reset through the map's
    // own `resetQuest` door rather than by clearing storage, so the character survives
    // it — a finished quest is only a real finish if the sheet can say whose it was.
    await page.goto(url('chargen'));
    await page.waitFor('window.__debug?.scene === "chargen" || !!window.__bootError', { label: 'creation', timeoutMs: 120000 });
    await page.evalJs('window.__debug.answerAll("a")');
    // Redguard, because Arena's eight playable races have no Imperial among them — the
    // Eternal Champion is from wherever the player says. `character.test.mjs` holds the
    // list to the game's own table.
    const described = await page.evalJs('JSON.stringify(window.__debug.describe({ name: "Testament", raceId: "redguard" }))');
    check('a character can be made to play the quest with', JSON.parse(described ?? '{"ok":false}').ok === true, described);
    const made = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.finish())') ?? '{"ok":false}');
    check('the character is saved before the quest starts', made.ok === true && Boolean(made.character?.name), made.character?.name);

    await page.goto(url('map'));
    await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'the world map', timeoutMs: 120000 });
    await page.evalJs('window.__debug.resetQuest()');
    const chain = await page.evalJs('window.__debug.chain()');
    check('the chain has ten stages: the escape, eight pieces, the finale',
      chain.length === 10 && chain.filter((s) => s.kind === 'piece').length === 8,
      chain.map((s) => s.title).join(' → '));
    check('every piece names the map dungeon that reveals it',
      chain.filter((s) => s.kind === 'piece').every((s) => s.clue && s.clueMif),
      chain.filter((s) => s.kind === 'piece').map((s) => `${s.title}←${s.clue}`).join(', '));
    check('the run starts from nothing', (await page.evalJs('window.__debug.quest()')).pieces === 0);

    // ── 1. out of the Imperial Dungeons ────────────────────────────────────────
    await enter('interior=START.MIF');
    const escape = await takeWithE();
    check('E takes the way out of the Imperial Dungeons',
      escape.quest.step === 1, `step ${escape.quest.step}: ${escape.quest.entries.at(-1)}`);
    // …and the escape is a story beat, so Arena's own vision plays (`VISION.FLC`): the world
    // stops for it, the movie is the install's art, and a key sends the player on their way.
    await page.waitFor('window.__debug.movie() !== null', { label: 'the vision', timeoutMs: 30000 });
    const vision = await page.evalJs('window.__debug.movie()');
    check('escaping the dungeons plays the install\'s own vision, the game\'s first story beat',
      vision?.file === 'VISION.FLC' && vision.frameCount > 0 && vision.width === 320,
      JSON.stringify(vision && { file: vision.file, frames: vision.frameCount, delay: vision.delayMs }));
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await page.waitFor('window.__debug.movie().done === true', { label: 'the vision skipped', timeoutMs: 20000 });
    check('and skipping the vision leaves the quest exactly where the escape left it',
      (await page.evalJs('window.__debug.quest()')).step === 1
      && (await page.evalJs('window.__debug.movie()')).skipped === true);

    // ── 2. the eight pieces, in the game's own order ────────────────────────────
    let pieces = 0;
    for (const stage of chain.filter((s) => s.kind === 'piece')) {
      await enter(`dungeon=${encodeURIComponent(stage.clue)}`);
      const clue = await takeWithE();
      check(`the map to ${stage.title} is found in ${stage.clue}`,
        clue.quest.mapKnown === true,
        clue.quest.mapKnown ? `mapKnown after ${clue.objective?.event}` : JSON.stringify(clue.quest.entries.at(-1)));

      await enter(`dungeon=${encodeURIComponent(stage.title)}`);
      const piece = await takeWithE();
      pieces++;
      check(`piece ${pieces} of the Staff is taken from ${stage.title}`,
        piece.quest.pieces === pieces,
        `pieces ${piece.quest.pieces}, step ${piece.quest.step}: ${piece.quest.entries.at(-1)}`);
      check(`the piece was taken from the deepest chamber of ${stage.title}`,
        (piece.objective?.depth ?? 0) > 5, `${piece.objective?.depth} cells deep of ${piece.objective?.cells} walkable`);
    }
    check('the eighth piece puts the quest at the finale',
      (await page.evalJs('window.__debug.quest()')).step === 9,
      (await page.evalJs('window.__debug.quest()')).objective);

    // ── 3. the Imperial Palace, four levels down ───────────────────────────────
    await enter('interior=IMPPAL.MIF');
    const palace = await page.evalJs('window.__debug.state()');
    check('the palace has four levels, and the player arrives on the first',
      palace.levelCount === 4 && palace.level === 0, `${palace.level + 1}/${palace.levelCount} · ${palace.levelName}`);
    check('the palace says which way down while the Jewel is below',
      /Somewhere below this floor/.test(await page.evalJs('document.getElementById("hud").textContent')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').at(-1));
    check('there is nothing to take on the upper floors of the palace',
      (await page.evalJs('window.__debug.objective()')) === null);

    // `]` descends, with real key events — three times, to the bottom.
    for (let level = 1; level <= 3; level++) {
      await page.pressKey('BracketRight');
      await page.pressKey('BracketRight', false);
      await page.waitFor(`window.__debug.state().level === ${level}`, { label: `palace level ${level + 1}`, timeoutMs: 90000 });
    }
    const bottom = await page.evalJs('window.__debug.state()');
    check('three presses of ] reach the bottom of the palace',
      bottom.level === 3 && bottom.levelCount === 4, `level ${bottom.level + 1} · ${bottom.inf}`);
    check('the bottom level is the palace\'s fourth and final one',
      /IMPPAL4\.INF/i.test(bottom.inf), bottom.inf);

    // ── 4. the mithril key, the Jewel of Fire, and the Emperor ─────────────────
    const key = await takeWithE();
    check('the mithril key is found at the bottom of the palace',
      key.objective?.event === 'mithrilKey' && key.quest.mithrilKey === true,
      `${key.objective?.event}: ${key.quest.entries.at(-1)}`);
    check('the Jewel of Fire is not in the key\'s chamber',
      key.quest.hasJewel === false, 'the cell is still locked');

    const jewelObjective = await page.evalJs('JSON.stringify(window.__debug.objective())');
    const jewel = JSON.parse(jewelObjective ?? 'null');
    check('with the key in hand the objective moves to the Jewel of Fire',
      jewel?.event === 'jewelOfFire', JSON.stringify(jewel));
    check('the Jewel and the key are two different rooms of the palace',
      jewel && (Math.abs(jewel.cellX - key.objective.cellX) + Math.abs(jewel.cellZ - key.objective.cellZ)) >= 12,
      jewel ? `key at ${key.objective.cellX},${key.objective.cellZ} · Jewel at ${jewel.cellX},${jewel.cellZ}` : 'no Jewel objective');
    await page.screenshot(path.join(shots, 'm5-finale-key.png'));

    const took = await takeWithE();
    check('the Jewel of Fire is taken with the key',
      took.quest.hasJewel === true, took.quest.entries.at(-1));
    check('with the Jewel in hand the objective is the Emperor\'s freedom',
      took.next?.event === 'won', JSON.stringify(took.next));

    const won = await takeWithE();
    check('the last E frees the Emperor and ends the quest',
      won.quest.ended === true, won.quest.entries.at(-1));
    check('the journal ends with Jagar Tharn undone',
      /Jagar Tharn is undone/.test(won.quest.entries.at(-1) ?? ''), won.quest.entries.at(-1));
    check('the objective after the end says the Arena is at peace',
      /at peace/.test(won.quest.objective ?? ''), won.quest.objective);

    // ── 5. the ending: the install's own movie, then the words ────────────────
    //
    // The last `E` hands the screen to Arena's own closing movie — `END01.FLC`, the `.FLC`
    // the ending page itself used to say was "not decoded" (`src/scenes/cutscenePlayer.js`
    // is the caller). The written scene appears only when the movie is over, so this run
    // waits for it to be on screen, holds the world to the movie's own pause, then skips it
    // with a real key the way a player who has seen it does.
    await page.waitFor('window.__debug.movie() !== null', { label: 'the closing movie', timeoutMs: 30000 });
    const closing = await page.evalJs('window.__debug.movie()');
    check('the ending plays the install\'s own closing movie, decoded from its own header',
      closing?.file === 'END01.FLC' && closing.frameCount > 0 && closing.width === 320 && closing.height === 200,
      JSON.stringify(closing && { file: closing.file, frames: closing.frameCount, size: [closing.width, closing.height], delay: closing.delayMs }));
    check('and the world is held still while it plays, the way the menu holds it',
      await page.evalJs('window.__debug.state().paused === true'));
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await page.waitFor('window.__debug.ending().shown === true', { label: 'the ending page', timeoutMs: 30000 });
    const ending = await page.evalJs('window.__debug.ending()');
    check('the ending is on screen, not just in memory', ending?.shown === true, JSON.stringify(ending?.reached));
    check('skipping the movie is what brings the page up, and the page says so',
      ending?.movie?.skipped === true && /END01\.FLC/.test(ending?.text ?? ''),
      JSON.stringify(ending?.movie && { skipped: ending.movie.skipped, frames: ending.movie.framesDrawn }));
    check('the ending is the Emperor\'s own words', /Eternal Champion/.test(ending?.text ?? ''),
      (ending?.text ?? '').replace(/\s+/g, ' ').slice(0, 90));
    check('the ending names the Jagar Tharn beat', /ifth?eforce|Jewel/i.test(ending?.text ?? ''), 'the Jewel holds my lifeforce');
    check('the ending page no longer claims its own cutscene is undecoded',
      !/not decoded/.test(ending?.text ?? ''));
    check('and the world resumes when the movie is out of the way',
      await page.evalJs('window.__debug.state().paused === false'));
    await page.screenshot(path.join(shots, 'm5-ending.png'));

    // ── 6. and it survives the page load that travel is made of ────────────────
    await enter('interior=START.MIF');
    const restored = await page.evalJs('window.__debug.quest()');
    check('a finished quest is still finished after a page load',
      restored.ended === true && restored.pieces === 8 && restored.mithrilKey === true && restored.hasJewel === true,
      JSON.stringify({ pieces: restored.pieces, key: restored.mithrilKey, jewel: restored.hasJewel, ended: restored.ended }));
    // One line for the escape, two per piece (its map, then the piece), and three for
    // the finale — `staffAssembled` is Ria Silmane's line and no key in the world fires
    // it, so twenty is the exact number a played-out quest leaves.
    check('the whole run left a journal behind', restored.entries.length === 20,
      `${restored.entries.length} journal entries`);

    await page.goto(url('map'));
    await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'the map again', timeoutMs: 120000 });
    check('the world map knows the quest is over',
      /at peace/i.test(await page.evalJs('window.__debug.state().objective')),
      await page.evalJs('window.__debug.state().objective'));
    check('the character sheet records what was won',
      /Eternal Champion/.test(await page.evalJs('window.__debug.sheetText()')),
      (await page.evalJs('window.__debug.sheetText()')).replace(/\s+/g, ' ').slice(0, 130));
    check('and the sheet still knows who won it',
      /Testament/.test(await page.evalJs('window.__debug.sheetText()')),
      (await page.evalJs('window.__debug.sheetText()')).replace(/\s+/g, ' ').slice(0, 130));

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
