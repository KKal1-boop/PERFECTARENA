// SUITE: WHO KNOWS YOU — the regard ledger, and the job a person pays for.
//
// The twin's living world keeps a **regard** per resident: a numbered opinion that rises
// when the player speaks to somebody or does them a good turn, falls when the player
// strikes them, and eases back toward nothing for every day they are not seen. This port
// has that ledger (`game/regard.js`) and nothing showed it before this milestone, so this
// suite is where it has to be true on screen rather than in Node:
//
//   * a word exchanged is worth something, and only **once a day** — the rule that stops a
//     friendship being bought with fifty keypresses;
//   * a job given by a person carries **that person**, and the one who asked is the one who
//     pays — the hand-in, which no scene in the port could perform before (the `return`
//     event existed and nothing ever fired it, so a finished job's purse was unreachable);
//   * the ledger **survives the page**, because a regard that lives in one scene's memory is
//     a regard the player cannot keep;
//   * a blow at a townsperson is a blow at the town: their regard falls, the witnesses take
//     it as one of their own struck down (the twin's own table), and the street turns.
//
// Driven with the real `T` key, the real `F` key and a real click on the panel's button —
// the debug seam is used only to *stand* next to somebody (crossing a 128-cell city would
// make the suite about the walk), to read the ledger back, and to put a job down.

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots
 * @param {() => number} helpers.getPort
 * @returns {(page: object) => Promise<void>}
 */
export function makeRegardSuite({ check, realErrors, shots, getPort }) {
  return async function suiteRegard(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));
    const city = `http://localhost:${getPort()}/?location=Daggerfall&${q}`;
    const ready = () => page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Daggerfall', timeoutMs: 120000 });

    // ── a clean ledger ────────────────────────────────────────────────────────
    //
    // The ledger is a *save*, so it outlives a page and outlives this suite's neighbours in
    // the run. Emptied the way a player's new game would empty it, by taking the key away.
    await page.goto(city);
    await ready();
    await page.evalJs('localStorage.removeItem("perfectarena.regard"), true');
    await page.goto(city);
    await ready();
    const putDown = await page.evalJs('window.__debug.abandonJob()');
    check('the streets start from a clean slate: no job, no ledger',
      putDown?.active === null && (await page.evalJs('window.__debug.regard()')).tally.known === 0,
      JSON.stringify(putDown));

    // ── a word exchanged ──────────────────────────────────────────────────────
    await page.evalJs('window.__debug.teleportToPerson("nearest")');
    await settle();
    await page.pressKey('KeyT');
    await page.pressKey('KeyT', false);
    await settle(260);
    const first = await page.evalJs('window.__debug.regard()');
    check('speaking to somebody is worth something to them, and they are remembered',
      first.tally.known === 1 && first.people.length === 1 && first.people[0].place === 'Daggerfall',
      JSON.stringify(first.people[0] ?? null));
    check('and a word is worth exactly what the twin\'s table says it is',
      first.people[0]?.regard === 3, `${first.people[0]?.regard} (REGARD_EVENTS.talk)`);
    check('the panel says how they read the player, without inventing a name for them',
      (await page.evalJs('window.__debug.talkPanel()')).standings.some((line) => /someone who knows you/.test(line)),
      JSON.stringify((await page.evalJs('window.__debug.talkPanel()')).standings));

    // ── once a day, and only once ─────────────────────────────────────────────
    const before = first.people[0].regard;
    for (let i = 0; i < 5; i++) {
      await page.pressKey('KeyT');
      await page.pressKey('KeyT', false);
      await settle(140);
    }
    const after = await page.evalJs('window.__debug.regard()');
    check('fifty words in one day are one word: the regard does not move again',
      after.people[0]?.regard === before && after.people.length === 1,
      `${before} → ${after.people[0]?.regard} after five more questions`);

    // ── a job, and the person who gave it ─────────────────────────────────────
    const taken = await page.evalJs('JSON.stringify(window.__debug.takeJobFromPerson("nearest"))');
    const job = JSON.parse(taken ?? 'null');
    check('a person hands out work, and the job carries the person who is owed for it',
      job?.ok === true && /^Daggerfall#\d+,\d+$/.test(job.giverId ?? '') && /^a person in /.test(job.giverPerson ?? ''),
      `${job?.title} — ${job?.giverId} (${job?.giverPerson})`);
    check('and the id names the cell they were placed on, not the one they were standing on',
      job?.giverId === job?.regardId, `${job?.giverId} vs ${job?.regardId}`);

    // This suite isolates personal hand-in; the bounties suite exercises real kills.
    // Seed a legitimately completed state through the quest machine, never the removed E shortcut.
    const currentJob = await page.evalJs('JSON.parse(localStorage.getItem("perfectarena.radiant"))');
    if (currentJob.active.kind === 'slay') {
      const { applyRadiantEvent, slayProgress } = await import('../../src/game/radiantQuests.js');
      let state = currentJob;
      const progress = slayProgress(state.active);
      for (const encounterId of progress.ids) state = applyRadiantEvent(state, 'killed', {
        where: state.active.target, questId: state.active.id, monster: progress.monster, encounterId,
      }).state;
      await page.evalJs(`localStorage.setItem('perfectarena.radiant', ${JSON.stringify(JSON.stringify(state))})`);
      await page.goto(city); await ready();
    }
    const finished = await page.evalJs('JSON.stringify(window.__debug.jobs().active.completed ? {completed:true,objective:window.__debug.jobs().objective} : window.__debug.finishJob())');
    const done = JSON.parse(finished ?? 'null');
    check('the finished job waits with the one who asked, in the game\'s own words',
      done?.completed === true && /^Return to a person in .+ for \d+ gold\.$/.test(done.objective ?? ''),
      done?.objective);

    // ── the hand-in: the purse that had no door before ────────────────────────
    const purseBefore = await page.evalJs('window.__debug.player().gold ?? 0');
    await page.evalJs('window.__debug.teleportToPerson("nearest")');
    await settle();
    await page.pressKey('KeyT');
    await page.pressKey('KeyT', false);
    await settle(260);
    const panel = await page.evalJs('window.__debug.talkPanel()');
    check('the one who asked is waiting to pay, and the panel offers the hand-in',
      /^Hand it over — \d+ gold$/.test(panel.handIn ?? ''), panel.handIn);
    check('and the panel says what they owe rather than what they want',
      /You did it — /.test(panel.job ?? ''), String(panel.job).slice(0, 80));
    await page.screenshot(path.join(shots, 'm11-hand-in.png'));

    await page.clickSelector('#talk button[data-job="hand-in"]');
    await settle(320);
    const paid = await page.evalJs('window.__debug.jobs()');
    const purseAfter = await page.evalJs('JSON.parse(localStorage.getItem("perfectarena.character") ?? "{}").gold ?? null');
    check('the button pays the reward the job promised, into the character\'s purse',
      paid.active === null && paid.taken >= 1 && purseAfter > purseBefore
        && (await page.evalJs('window.__debug.player().gold')) === purseAfter,
      `${purseBefore} → ${purseAfter} gold, ${paid.taken} done`);
    await page.evalJs('window.__debug.hurt(1)');
    check('a later character save cannot erase the personal reward',
      await page.evalJs(`JSON.parse(localStorage.getItem('perfectarena.character')).gold === ${purseAfter}`));
    check('and the journal records who paid',
      /from a person in /.test(paid.entry ?? ''), paid.entry);

    const warmer = await page.evalJs('window.__debug.regard()');
    check('doing somebody\'s work is the strongest good turn the game has',
      warmer.people[0]?.regard === 28 && warmer.people[0]?.standing === 'neutral',
      `regard ${warmer.people[0]?.regard} — a job (+25) and a word (+3), both on the same day`);
    check('and they are not yet a friend: the threshold is the twin\'s, and 40 is 40',
      warmer.people[0]?.regard < 40, `${warmer.people[0]?.regard} < FRIEND_AT`);

    // ── the ledger survives the page ──────────────────────────────────────────
    await page.goto(city);
    await ready();
    const persisted = await page.evalJs('window.__debug.regard()');
    check('the ledger is a save, not a scene\'s memory: it survives the page being loaded again',
      persisted.tally.known >= 1 && persisted.people[0]?.regard === warmer.people[0]?.regard,
      `${persisted.tally.known} known, regard ${persisted.people[0]?.regard}`);

    // ── a blow at a townsperson is a blow at the town ─────────────────────────
    //
    // **Not paused**, and the town walks: the player is stood next to somebody again before
    // every blow rather than the world being frozen. Pausing it would be a lie about the
    // fight — the swing has its own cooldown, and the cooldown runs on the frame clock — and
    // the first version of this section did exactly that and sat on "still swinging" with a
    // man at 14 hit points in front of it.
    const beforeStrike = await page.evalJs('window.__debug.townsfolk().length');
    /** Whoever the player is in front of, by the game's own idea of "in front". */
    const nearest = async () => JSON.parse(await page.evalJs(
      'JSON.stringify(window.__debug.townsfolk().slice().sort((a, b) => a.distance - b.distance)[0] ?? null)'));
    let struck = null;
    let healthAfterFirst = null;
    let living = beforeStrike;
    for (let i = 0; i < 40 && living >= beforeStrike; i++) {
      await page.evalJs('window.__debug.teleportToPerson("nearest")');
      await settle(60);
      await page.pressKey('KeyF');
      await settle(120);
      await page.pressKey('KeyF', false);
      // Long enough for the swing's own cooldown (`PLAYER_SWING`) to clear, so the next blow
      // is a blow and not a refusal.
      await settle(700);
      struck = await page.evalJs('window.__debug.regard()');
      const front = await nearest();
      if (i === 0) healthAfterFirst = front?.health ?? null;
      living = await page.evalJs('window.__debug.townsfolk().length');
    }
    check('a blow at a townsperson comes off their health, and leaves a mark on the ledger',
      Number.isFinite(healthAfterFirst) && struck.people.some((p) => p.regard < 0),
      `the one in front was left at ${healthAfterFirst} and reads ${struck.people.find((p) => p.regard < 0)?.regard}`);
    check('the one struck down leaves the street — nobody stands in front of a man they killed',
      living < beforeStrike,
      `${beforeStrike} → ${living} people`);
    check('and the ones who saw it take it as one of their own: the town reads the player as hostile',
      struck.tally.hostile > 0 && struck.people.some((p) => p.standing === 'hostile' && /armed/.test(p.word)),
      `${struck.people.filter((p) => p.standing === 'hostile').length} of ${struck.tally.known} hostile`);
    await page.screenshot(path.join(shots, 'm11-a-town-turned.png'));

    // ── a hostile town comes for the player ───────────────────────────────────
    //
    // The ledger has to *do* something, or it is a number in a save file. A person past
    // `HOSTILE_AT` draws: they close and they swing, with the armour word's own damage. The
    // player is stood among them first, because the rule that brings them is the monsters'
    // own sight radius (`AGGRO`) — a hostile town does not chase somebody across the map
    // from behind a wall, and a check that waited at the gate would be checking the distance
    // rather than the drawing.
    const hostileAt = (await page.evalJs('JSON.stringify(window.__debug.townsfolk())') || '[]');
    const among = JSON.parse(hostileAt).findIndex((p) => p.standing === 'hostile');
    const stood = await page.evalJs(`JSON.stringify(window.__debug.teleportToPerson(${Math.max(0, among)}))`);
    const healthBefore = await page.evalJs('window.__debug.combat().player.health');
    let healthAfter = healthBefore;
    for (let i = 0; i < 40 && healthAfter >= healthBefore; i++) {
      await settle(250);
      healthAfter = await page.evalJs('window.__debug.combat().player.health');
    }
    check('a hostile street draws on the player: stand among them and they come',
      healthAfter < healthBefore,
      `${healthBefore} → ${healthAfter} health, facing ${JSON.parse(stood ?? 'null')?.description ?? 'nobody'}`);
    await page.screenshot(path.join(shots, 'm11-hostile-street.png'));

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
