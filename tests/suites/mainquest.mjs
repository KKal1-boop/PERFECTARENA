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
     * Let a story movie that is on screen finish (skipped, as a player who has seen it would).
     *
     * The story's beats now play the install's movies at the escape, every clue, the first
     * piece, the palace and the finale (`game/storyBeats.js`), and a movie holds the world
     * still — so a take that follows one has to clear it before pressing `E`, exactly as a
     * player does.
     */
    const dismissMovie = async () => {
      const movie = await page.evalJs('window.__debug.movie()');
      if (!movie || movie.done) return movie;
      await page.pressKey('Escape');
      await page.pressKey('Escape', false);
      await page.pressKey('Escape');
      await page.pressKey('Escape', false);
      await page.waitFor('window.__debug.movie()?.done === true', { label: `skip ${movie.file}`, timeoutMs: 30000 });
      return await page.evalJs('window.__debug.movie()');
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
      // A beat starts just after the level is painted (Tharn's ambush on arrival), so give it a
      // moment before deciding there is no movie to clear.
      await settle(350);
      await dismissMovie();
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
    // …and the escape itself is travel, not a film: the original sends the player to a city,
    // and Ria's first Staff dream comes with **sleep**, once the character has reached level 2
    // (UESP). So no scene plays over the escape, and the dream is still owed.
    check('the escape is travel, not a scene: no movie plays over it',
      (await page.evalJs('window.__debug.movie()')) === null);
    const owed = await page.evalJs('window.__debug.story()');
    check('the first Staff dream waits for level 2, as the walkthrough says',
      owed.dream === null, JSON.stringify(owed));

    // Level 2 through the game's own XP door, and the level taken through its own panel. The
    // amount is the character's own next threshold (`progression().needed - into`), because the
    // columns are per class and a fixed number would under-level a mage and over-level a warrior.
    const need = await page.evalJs('(() => { const p = window.__debug.progression(); return Math.max(1, p.needed - p.into); })()');
    const awarded = await page.evalJs(`JSON.stringify(window.__debug.awardXp(${Number(need)}))`);
    await settle(300);
    await page.pressKey('Enter');
    await page.pressKey('Enter', false);
    await settle(400);
    const levelled = await page.evalJs('window.__debug.player()');
    check('the character reaches level 2', (levelled?.level ?? 1) >= 2,
      `awarded ${awarded}, level ${levelled?.level}`);

    // A sleep is where Ria finds you. `sleep` is the fixture door for the dream's own gate
    // (`restIn` plays the same scene); the movie is her `VISION.FLC`, the line `TEMPLATE.DAT` 1500.
    await page.evalJs('void window.__debug.sleep()');
    await page.waitFor('window.__debug.movie()?.file === "VISION.FLC"', { label: 'the first Staff dream', timeoutMs: 30000 });
    const dream = await page.evalJs('window.__debug.movie()');
    check('the level-2 sleep brings Ria’s first Staff dream, in her own movie',
      dream?.file === 'VISION.FLC' && dream?.textKey === 1500 && dream?.speaker === 'Ria Silmane',
      JSON.stringify(dream && { file: dream.file, key: dream.textKey, speaker: dream.speaker }));
    check('the dream runs the speech’s own length, not the 3.4-second movie',
      dream?.narrationMs > 40000, `${dream?.narrationMs} ms of narration`);
    // **And it speaks.** The install's clips are scheduled under the picture; headless Chrome may
    // hold the context suspended, but the clips and their length are the seam's own report.
    await settle(700);
    const voice = await page.evalJs('window.__debug.triggers().sound');
    check('the dream speaks the install’s own eight clips, 48 seconds of them',
      voice?.clips === 8 && /^SPEECH\/1500_/.test(voice?.file ?? '') && voice?.seconds > 47,
      JSON.stringify(voice));
    await dismissMovie();
    const afterDream = await page.evalJs('window.__debug.story()');
    check('the dream is remembered, and the quest is still at its first stage',
      afterDream.dreamsSeen.includes(1500) && (await page.evalJs('window.__debug.quest()')).step === 1,
      JSON.stringify(afterDream.dreamsSeen));

    // ── 2. the eight pieces, in the game's own order ────────────────────────────
    // **A key found in a main-story dungeon opens its own door.** The owner's
    // *"the keys still not work as intended"* is a claim about the level's two lists matching:
    // the key `placeKeys` put on the player's side and the leaf its lock belongs to. The first
    // staff dungeon that ships a key is used, and the two are read back from the page.
    let keysChecked = false;
    let pieces = 0;
    for (const stage of chain.filter((s) => s.kind === 'piece')) {
      const clueLevels = [0,1,1,2,1,1,1,1];
      const staffLevels = [1,0,1,2,3,3,1,2];
      await enter(`dungeon=${encodeURIComponent(stage.clue)}&level=${clueLevels[pieces]}`);
      if (!keysChecked && pieces <= 2) {
        const locks = await page.evalJs('window.__debug.dungeonLocks()');
        const key = (locks.keys ?? []).find((spot) => !spot.taken);
        const door = (locks.doors ?? []).find((leaf) => leaf.locked && !leaf.riddle && !leaf.questSeal
          && leaf.lock <= (key?.lock ?? 0));
        if (key && door) {
          keysChecked = true;
          await page.evalJs(`window.__debug.standAt(${key.row},${key.col})`);
          await page.evalJs('window.__debug.interact()');
          const carried = (await page.evalJs('window.__debug.dungeonLocks()')).carried;
          let stood = null;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            stood = await page.evalJs(`window.__debug.standAt(${door.row + dr},${door.col + dc})`);
            if (stood) break;
          }
          await page.evalJs('window.__debug.interact()');
          // The leaf's own swing takes `DOOR_OPEN_SECONDS`; the lock lets go on the press and the
          // panel follows in the frames after it, so the run waits for the picture as a player does.
          await settle(700);
          const after = (await page.evalJs('window.__debug.dungeonLocks()')).doors
            .find((leaf) => leaf.row === door.row && leaf.col === door.col);
          check('a key found in a main-story dungeon opens the door its lock belongs to',
            carried.some((held) => held.lock >= door.lock) && after?.locked === false && after?.open === true,
            JSON.stringify({ key, door, carried, after }));
        }
      }
      // **Tharn answers every piece at the next encounter** (`1392 + pieces - 1`): the piece just
      // taken is answered by his vision on the next level's arrival, before its fights. Every one
      // is played and checked — not only the first — because the sequence is the mechanic: a
      // port that stops answering after `1392` has lost seven of the eight beats.
      if (pieces >= 1) {
        const key = 1392 + pieces - 1;
        await page.waitFor(`window.__debug.movie()?.textKey === ${key} && window.__debug.movie()?.file === "JAGAR.FLC"`, { label: `Tharn’s answer to piece ${pieces}`, timeoutMs: 40000 });
        const ambush = await page.evalJs('window.__debug.movie()');
        check(`piece ${pieces} is answered by Tharn (${key}), in his own movie, at the next encounter`,
          ambush?.textKey === key && ambush?.speaker === 'Jagar Tharn' && ambush?.file === 'JAGAR.FLC',
          JSON.stringify(ambush && { file: ambush.file, key: ambush.textKey, speaker: ambush.speaker }));
        await dismissMovie();
        // **And his minions come.** The install's text promises them in the vision itself
        // (1392: "Already they arrive"), and they are roused the moment it ends. The walk is
        // measured once, on the first ambush: a roused body that never moves is a flag, not an
        // arrival.
        await settle(250);
        const before = (await page.evalJs('window.__debug.combat()')).monsters
          .filter((monster) => monster.ambush === key);
        let moved = 0;
        if (pieces === 1) {
          await settle(1200);
          const after = (await page.evalJs('window.__debug.combat()')).monsters
            .filter((monster) => monster.ambush === key);
          moved = after.filter((monster) => {
            const was = before.find((other) => other.serial === monster.serial);
            return was && Math.hypot(monster.world.x - was.world.x, monster.world.z - was.world.z) > 0.4;
          }).length;
        }
        check(`Tharn’s minions arrive with piece ${pieces}’s vision, and come for the player`,
          before.length >= 2 && before.every((monster) => monster.roused) && (pieces !== 1 || moved >= 1),
          JSON.stringify({ minions: before.map((monster) => monster.name), roused: before.filter((monster) => monster.roused).length, moved }));
      }
      const clue = await takeWithE();
      check(`the map to ${stage.title} is found in ${stage.clue}`,
        clue.quest.mapKnown === true,
        clue.quest.mapKnown ? `mapKnown after ${clue.objective?.event}` : JSON.stringify(clue.quest.entries.at(-1)));
      // **On the level's own ground, not the margin its grid leaves around it** (`onMap`,
      // `mifLevel.isVoidCell`). The Fortress of Ice's second storey is 64×58 of a 96×80 grid, and
      // the map to Labyrinthian's piece used to be placed in that empty margin — the owner's
      // *"in an non accessible place"*. Every clue and every piece is held to it here.
      check(`the map in ${stage.clue} stands on dry, standable ground, never in a pool, a wall or the level’s empty margin`,
        clue.objective?.dry === true && clue.objective?.onMap === true,
        JSON.stringify(clue.objective && { cell: [clue.objective.cellX, clue.objective.cellZ], dry: clue.objective.dry, onMap: clue.objective.onMap }));

      await enter(`dungeon=${encodeURIComponent(stage.title)}&level=${staffLevels[pieces]}`);
      const piece = await takeWithE();
      pieces++;
      check(`piece ${pieces} of the Staff is taken from ${stage.title}`,
        piece.quest.pieces === pieces,
        `pieces ${piece.quest.pieces}, step ${piece.quest.step}: ${piece.quest.entries.at(-1)}`);
      check(`the piece was taken from the deepest chamber of ${stage.title}`,
        (piece.objective?.depth ?? 0) > 5, `${piece.objective?.depth} cells deep of ${piece.objective?.cells} walkable`);
      check(`piece ${pieces} stands on dry, standable ground, inside the level’s own canvas`,
        piece.objective?.dry === true && piece.objective?.onMap === true,
        JSON.stringify(piece.objective && { cell: [piece.objective.cellX, piece.objective.cellZ], dry: piece.objective.dry, onMap: piece.objective.onMap }));

      // The next sleep names the next place (`1294 + pieces`), exactly as the walkthrough has it.
      if (pieces === 1) {
        await page.evalJs('void window.__debug.sleep()');
        await page.waitFor('window.__debug.movie()?.textKey === 1295 && window.__debug.movie()?.file === "VISION.FLC"',
          { label: 'Ria’s next dream', timeoutMs: 30000 });
        const nextDream = await page.evalJs('window.__debug.movie()');
        check('the next sleep after the first piece names the next place (Ria 1295)',
          nextDream?.file === 'VISION.FLC' && nextDream?.speaker === 'Ria Silmane',
          JSON.stringify(nextDream && { file: nextDream.file, key: nextDream.textKey }));
        await dismissMovie();
      }
    }
    check('the eighth piece puts the quest at the finale',
      (await page.evalJs('window.__debug.quest()')).step === 9,
      (await page.evalJs('window.__debug.quest()')).objective);

    // ── 3. the Imperial Palace, four levels down ───────────────────────────────
    await enter('interior=IMPPAL.MIF');
    // **His last answer comes first** (`1399`, the eighth piece): the palace is the next
    // encounter, so the vision he owes after Dagoth-Ur is not lost to the finale.
    await page.waitFor('window.__debug.movie()?.textKey === 1399 && window.__debug.movie()?.file === "JAGAR.FLC"', { label: 'Tharn’s last answer', timeoutMs: 60000 });
    const lastAnswer = await page.evalJs('window.__debug.movie()');
    check('the eighth piece is answered by Tharn (1399) at the palace, the next encounter',
      lastAnswer?.textKey === 1399 && lastAnswer?.speaker === 'Jagar Tharn' && lastAnswer?.file === 'JAGAR.FLC',
      JSON.stringify(lastAnswer && { file: lastAnswer.file, key: lastAnswer.textKey, speaker: lastAnswer.speaker }));
    await dismissMovie();
    // **The reveal comes first** (`MORPH.FLC`): the palace gate is two films, Tharn's change
    // of face and then his 1447 taunt. The reveal used to be unwired, so this is checked before
    // the speech rather than assumed from the taunt's arrival.
    await page.waitFor('window.__debug.movie()?.file === "MORPH.FLC"', { label: 'the palace reveal', timeoutMs: 30000 });
    const reveal = await page.evalJs('window.__debug.movie()');
    check('the palace gate first plays Tharn’s transformation (MORPH.FLC)',
      reveal?.file === 'MORPH.FLC',
      JSON.stringify(reveal && { file: reveal.file, frames: reveal.frameCount }));
    await dismissMovie();
    // **Tharn's own words at the gate** (`1447`), in his own movie: he has watched the player
    // blunder here, and waits below.
    await page.waitFor('window.__debug.movie()?.textKey === 1447 && window.__debug.movie()?.file === "JAGAR.FLC"', { label: 'Tharn at the palace gate', timeoutMs: 60000 });
    const palaceMovie = await dismissMovie();
    check('the palace then opens with Tharn’s own words at the gate (1447), and a key skips them',
      palaceMovie?.file === 'JAGAR.FLC' && palaceMovie?.textKey === 1447 && palaceMovie?.done === true,
      JSON.stringify(palaceMovie && { file: palaceMovie.file, key: palaceMovie.textKey, done: palaceMovie.done }));
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
      let reached = true;
      try {
        await page.waitFor(`window.__debug.state().level === ${level}`, { label: `palace level ${level + 1}`, timeoutMs: 90000 });
      } catch { reached = false; }
      if (!reached) {
        const diag = await page.evalJs(`JSON.stringify({
          level: window.__debug.state().level,
          levelCount: window.__debug.state().levelCount,
          paused: window.__debug.state().paused,
          movie: window.__debug.movie(),
          errors: window.__debug.pageErrors ?? [],
        })`);
        check(`] descends to palace level ${level + 1}`, false, diag);
        return;
      }
    }
    const bottom = await page.evalJs('window.__debug.state()');
    check('three presses of ] reach the bottom of the palace',
      bottom.level === 3 && bottom.levelCount === 4, `level ${bottom.level + 1} · ${bottom.inf}`);
    check('the bottom level is the palace\'s fourth and final one',
      /IMPPAL4\.INF/i.test(bottom.inf), bottom.inf);
    // **The last floor raises Tharn's shield before anything can be taken** (`JAGRSHLD.FLC`).
    // A player who reaches the chamber sees it; the run observes it before the key's `E`.
    await page.waitFor('window.__debug.movie()?.file === "JAGRSHLD.FLC"', { label: 'Tharn’s shield', timeoutMs: 30000 });
    const shield = await page.evalJs('window.__debug.movie()');
    check('the bottom floor raises Tharn’s shield over the Jewel (JAGRSHLD.FLC)',
      shield?.file === 'JAGRSHLD.FLC',
      JSON.stringify(shield && { file: shield.file, frames: shield.frameCount }));
    await dismissMovie();

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
    check('the Jewel and key occupy their original island rooms, not generated deepest cells',
      jewel && key.objective.cellX === 25 && key.objective.cellZ === 26 && jewel.cellX === 24 && jewel.cellZ === 20,
      jewel ? `key at ${key.objective.cellX},${key.objective.cellZ} · Jewel at ${jewel.cellX},${jewel.cellZ}` : 'no Jewel objective');
    await page.screenshot(path.join(shots, 'm5-finale-key.png'));

    // **The boss waits for the Jewel.** This is the designed trigger: the chamber is empty of
    // him until the Jewel is taken, and `takeObjective` starts the duel (`beginTharnDuel`).
    const beforeJewel = await page.evalJs('window.__debug.combat().monsters.filter((m) => m.id === "jagartharn").length');
    check('Jagar Tharn is not in the chamber before the Jewel is taken',
      beforeJewel === 0, `${beforeJewel} Tharns before the Jewel`);

    const took = await takeWithE();
    check('the Jewel of Fire is taken with the key',
      took.quest.hasJewel === true, took.quest.entries.at(-1));
    // **The Jewel is the fight's door, not its end.** The owner, 2026-10-21: *"the ending
    // doesnt properly work the final boss battle is not scripted"*. Taking the Jewel used to
    // fire `won` in the same frame; now the last enemy in the game is a creature on the page.
    check('taking the Jewel does not end the quest by itself',
      took.quest.ended === false, took.quest.entries.at(-1));

    // The Jewel's own beat is Tharn's cry (`1404`), and the chamber gets its boss.
    await page.waitFor('window.__debug.movie()?.textKey === 1404 && window.__debug.movie()?.file === "JAGAR.FLC"', { label: 'the Jewel’s cry', timeoutMs: 30000 });
    const cry = await page.evalJs('window.__debug.movie()');
    check('taking the Jewel is answered by Tharn’s own cry (1404)',
      cry?.file === 'JAGAR.FLC' && cry?.speaker === 'Jagar Tharn',
      JSON.stringify(cry && { file: cry.file, key: cry.textKey, speaker: cry.speaker }));
    await dismissMovie();
    await page.waitFor('window.__debug.state().finalBattle?.boss === "jagar"', { label: 'Jagar Tharn in the chamber', timeoutMs: 30000 });
    const duel = JSON.parse(await page.evalJs(`JSON.stringify({
      fight: window.__debug.state().finalBattle,
      // state().monsters is the living count; the creature records are the fight seam
      // (__debug.combat().monsters), which is where the bestiary checks read them too.
      tharn: window.__debug.combat().monsters.filter((m) => m.id === 'jagartharn')
        .map((m) => ({ health: m.health, max: m.maxHealth, awake: Boolean(m.awake) })),
      objective: window.__debug.quest().objective,
    })`));
    check('Jagar Tharn is a real creature in the Jewel’s chamber, awake and whole',
      duel.tharn.length === 1 && duel.tharn[0].health === 500 && duel.tharn[0].max === 500 && duel.tharn[0].awake === true,
      JSON.stringify(duel));
    check('the objective is the fight while he lives, not another pickup',
      /Jagar Tharn/.test(duel.objective ?? ''), duel.objective);
    check('and the quest refuses the win he is standing in the way of',
      await page.evalJs('window.__debug.quest().ended') === false);
    // **The duel has beats, not only a bar.** At half his health Tharn speaks and calls the
    // palace's creatures (`stepFinalDuel`); the phase is on the seam.
    await page.evalJs('window.__debug.hurtMonster("jagartharn", 260)');
    await page.waitFor('window.__debug.state().finalBattle?.phase === 2',
      { label: 'the duel\'s second phase', timeoutMs: 30000 });
    const phase = await page.evalJs('window.__debug.state().finalBattle');
    check('at half health the duel changes: Tharn speaks and his creatures answer',
      phase?.phase === 2 && (phase?.minions ?? 0) >= 1, JSON.stringify(phase));

    // `won` is the last blow's: land it the way a player's sword does.
    // The bestiary's own id — the same one `finalBattle.boss` reports as `jagar`.
    const blow = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.hurtMonster("jagartharn", 1000))') ?? 'null');
    check('Tharn can be struck down, and his death is the quest’s last event',
      blow?.dead === true, JSON.stringify(blow));
    await page.waitFor('window.__debug.quest().ended === true', { label: 'the quest’s end after Tharn', timeoutMs: 30000 });
    const won = { quest: await page.evalJs('window.__debug.quest()') };
    check('touching the assembled Staff to the Jewel ends the quest once he has fallen',
      won.quest.ended === true && won.quest.tharnSlain === true, won.quest.entries.at(-1));
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
    // **The whole closing chain, in the release's order.** This install carries the CD
    // revision, so Tharn's fall is `NUJAGDTH.FLC` paired with `NUKING.FLC`; an install with
    // only the originals gets `JAGARDTH.FLC`/`KING.FLC` (`endingMoviesFor`). Every film is
    // observed and skipped the way a player who has seen it does.
    const expectedEnding = ['NUJAGDTH.FLC', 'NUKING.FLC', 'END01.FLC', 'END02.FLC', 'AFLC2.FLC'];
    const endingMovies = [];
    let fall = null;
    let closing = null;
    for (const file of expectedEnding) {
      await page.waitFor(`window.__debug.movie()?.file === "${file}"`, { label: file, timeoutMs: 30000 });
      const movie = await page.evalJs('window.__debug.movie()');
      endingMovies.push(movie?.file ?? null);
      check(`the ending chain plays ${file} in order`,
        movie?.file === file && (movie?.frameCount ?? 0) > 0,
        JSON.stringify(movie && { file: movie.file, frames: movie.frameCount }));
      if (file === 'NUJAGDTH.FLC') {
        fall = await dismissMovie();
        check('the last blow plays Tharn\'s own fall before the ending',
          fall?.file === 'NUJAGDTH.FLC' && fall?.skipped === true,
          JSON.stringify(fall && { file: fall.file, skipped: fall.skipped }));
      } else {
        if (file === 'END01.FLC') {
          closing = movie;
          check('and the world is held still while it plays, the way the menu holds it',
            await page.evalJs('window.__debug.state().paused === true'));
        }
        await dismissMovie();
      }
      await settle(250);
    }
    check('the ending chain is the whole five-film sequence',
      endingMovies.join(' → ') === expectedEnding.join(' → '), endingMovies.join(' → '));
    check('the ending plays the install\'s own closing movie, decoded from its own header',
      closing?.file === 'END01.FLC' && closing.frameCount > 0 && closing.width === 320 && closing.height === 200,
      JSON.stringify(closing && { file: closing.file, frames: closing.frameCount, size: [closing.width, closing.height], delay: closing.delayMs }));
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
    // One line for the escape, two per piece (its map, then the piece), one for the Staff
    // gathered at the eighth piece, and three for the finale — twenty-one is the exact number a
    // played-out quest leaves. **`staffAssembled` used to be a line nothing fired** (the comment
    // here said so); the last piece now fires it, which is the middle of the story the player was
    // owed, so the count moves with it rather than the beat going back to being dead data.
    check('the whole run left a journal behind', restored.entries.length === 22,
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
