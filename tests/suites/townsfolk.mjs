// SUITE: THE PEOPLE OF A TOWN, AND TALKING TO THEM.
//
// A city is the one place in this game that is not about fighting or fetching, so the
// suite that checks it asks the questions a player would notice: is anybody here, are
// they standing where a person can stand, is their art on screen, and does talking to
// them produce the game's own words with no unfinished `%`-word in them.
//
// The talk interaction is driven the way a player drives it: the real `T` key to speak,
// a real mouse click on the question button, and the real `Escape` to walk away. The
// debug seam is used to *stand* next to somebody (walking across a 128-cell city would
// make the suite about the walk) and to read the panel back.
//
// `?location=Daggerfall` is the place used, because its province is known — High Rock —
// and one of the two questions is about the country the player is standing in. An answer
// that names High Rock proves the substitution is fed from `CITYDATA.64` and not from a
// string this project made up.

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots
 * @param {() => number} helpers.getPort
 * @returns {(page: object) => Promise<void>}
 */
import { ARMOUR_WORDS } from '../../src/game/townsfolk.js';

export function makeTownsfolkSuite({ check, realErrors, shots, getPort }) {
  return async function suiteTownsfolk(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 180) => new Promise((r) => setTimeout(r, ms));

    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Daggerfall', timeoutMs: 120000 });

    // ── the player does not stand inside a person ───────────────────────────
    // The player is put beside the nearest person, the game runs for a moment with no keys
    // held, and the feet must end at least a body's width (0.4 + 0.35 m) from theirs.
    //
    // **Beside somebody who is out of doors**, because the body the player is pushed out of is
    // a body on the street: a person the day has put at home is behind a door the port has no
    // interior for (D-01a), and there is nothing there to push against.
    {
      // Placed 0.2 m from the first person's centre — inside their body, on purpose.
      await page.evalJs('(() => { const p = window.__debug.people().filter((q) => !q.atHome)[0]; const f = window.__debug.state().feet; window.__debug.teleport(p.world.x + 0.2, f[1], p.world.z); return 1; })()');
      await settle(600);
      const after = await page.evalJs('(() => { const s = window.__debug.state(); const f = s.feet; let best = Infinity; for (const p of window.__debug.people().filter((q) => !q.atHome)) { const d = Math.hypot(p.world.x - f[0], p.world.z - f[2]); if (d < best) best = d; } return { best }; })()');
      check('the player cannot stand inside a person',
        after.best >= 0.7 - 0.05, `nearest person ${after.best.toFixed(2)} m from the feet, bar 0.70 m`);
    }

    // ── nobody teleports, and nobody outruns a walk ──────────────────────────────
    // Every person of the street is sampled through the real page for six seconds of its
    // own time. The game clamps each frame's step to the person's own pace (a walk is
    // `CELL_SIZE / TOWN_WALK_SECONDS` = 1.67 m/s), so a figure's measured speed between two
    // samples can never be more than a walk. A snap — a route that begins from the wrong
    // cell, a stride read as a sprint — shows as a figure covering the street in one sample.
    {
      // The game moves a person at most `speed x dt` per painted frame, and `dt` is clamped to
      // 0.1 s, so one frame is at most 0.167 m for a walk. Samples are compared *per painted
      // frame* — a wall-clock sample taken every 16 ms can straddle a slow frame and would
      // read its clamped step as a sprint.
      const frameLimit = (2.5 / 1.5) * 0.1 * 1.05;
      let previous = null;
      let worst = { step: 0, figure: -1, frames: 0 };
      let walkingSamples = 0;
      // The closest any two people come, over every sample: two bodies must not stand inside each
      // other (PERSON_RADIUS is 0.4 m, so two bodies touch at 0.8 m; the bar is set below that
      // to allow a walker passing a standing one at the edge of the clearance).
      let closest = { gap: Infinity, pair: '' };
      const sampleEnd = Date.now() + 6000;
      while (Date.now() < sampleEnd) {
        const snap = await page.evalJs(
          '({ n: window.__debug.state().painted, p: window.__debug.people().map((q) => ({ x: q.world.x, z: q.world.z, w: q.walking })) })');
        for (let a = 0; a < snap.p.length; a++) {
          for (let b = a + 1; b < snap.p.length; b++) {
            const gap = Math.hypot(snap.p[a].x - snap.p[b].x, snap.p[a].z - snap.p[b].z);
            if (gap < closest.gap) closest = { gap, pair: `#${a} and #${b}` };
          }
        }
        if (previous && snap.n > previous.n) {
          const frames = snap.n - previous.n;
          snap.p.forEach((q, i) => {
            const was = previous.p[i];
            if (!was) return;
            if (q.w) walkingSamples++;
            const step = Math.hypot(q.x - was.x, q.z - was.z) / frames;
            if (step > worst.step) worst = { step, figure: i, frames };
          });
        }
        previous = snap;
        await settle(16);
      }
      check('nobody covers more ground than a walk in any frame',
        worst.step <= frameLimit,
        `worst ${worst.step.toFixed(3)} m per frame by figure #${worst.figure}, limit ${frameLimit.toFixed(3)}`);
      check('two people never stand inside one another',
        closest.gap >= 0.6, `closest ${closest.gap.toFixed(2)} m (${closest.pair}), bar 0.6 m`);
      check('people do walk while the player watches them',
        walkingSamples > 0, `${walkingSamples} walking samples in six seconds`);
    }

    /**
     * Speak to somebody the way a player does, in a street where people are walking.
     *
     * Standing next to a person and pressing `T` is not a stable recipe on a street: a step
     * is a whole cell (2.5 m) and the reach for talking is 4 m, so a person who sets off in
     * the moment between the teleport and the key is out of earshot — which is what a player
     * meets too, and why a player follows them and presses it again. The *conversation* holds
     * them (`speakingTo` in `stepTownsfolk`); getting their attention is the part that may
     * take two tries.
     *
     * @param {number|'nearest'} which
     * @returns {Promise<object>} the panel as it ended up
     */
    const speakTo = async (which = 'nearest', tries = 4) => {
      for (let i = 0; i < tries; i++) {
        await page.evalJs(`JSON.stringify(window.__debug.teleportToPerson(${JSON.stringify(which)}))`);
        await settle(180);
        await page.pressKey('KeyT');
        await page.pressKey('KeyT', false);
        await settle(240);
        const panel = await page.evalJs('window.__debug.talkPanel()');
        // `talk` closes the panel when nobody is in earshot, so a shown panel is the answer.
        if (panel.shown === true) return panel;
      }
      return page.evalJs('window.__debug.talkPanel()');
    };

    const state = await page.evalJs('window.__debug.state()');
    check('a settlement boots as a city, with people in it',
      Boolean(state?.city) && state.townsfolk > 0, `${state?.townsfolk} people · ${state?.map}`);

    // ── who is here, and where they stand ──────────────────────────────────────
    const people = await page.evalJs('window.__debug.townsfolk()');
    // **A figure's sheet is the install's own file under its race's key** (`game/raceSkin.js`,
    // D-45): a raced person is drawn as `MLGEN01W.CFA#darkElf`, so every check below reads the
    // file through this. The suffix is the only thing a race adds to a name.
    const bare = (file) => String(file ?? '').split('#')[0];
    // **Two rosters, and the archive is both.** `xxNNNWLK.CFA` is the armoured folk — the
    // sets that carry an armour word — and beside them the archive ships its own townsfolk:
    // the generic men and women (`MLGEN0#<W|T|D>`, `FMGEN[W|D]?0#`) and the watch's and the
    // remaining families' view sheets (`GUARD0#`, `BABE0#`, `PAT#`, `LGLIT0#`). The town used
    // to hold only the first, which is the reported "there are NPCs that are always still;
    // we ported the moving ones and are missing assets because of that" (`peopleKinds.js`).
    const PEOPLE_ART = /^(\d\d(UNA|LTR|CHN|PLT|BAR|MAG|MNK)WLK|MLGEN0[1-5][WTD]|FMGENW?0[1-5]|FMGEND0[1-5]|GUARD0[1-6]|BABE0[1-6]|SWOLF0[1-6]|LIZARD[1-6]|PAT[1-6]|LGLIT0[1-6])\.CFA$/;
    check('every person is one of the install\'s own .CFA people',
      people.length > 0 && people.every((p) => PEOPLE_ART.test(bare(p.file))),
      people.map((p) => p.file).slice(0, 8).join(' '));
    const familyOf = (file) => (/^\d\d/.test(file) ? 'armoured' : file.replace(/[0-9].*$/, ''));
    const families = new Set(people.map((p) => familyOf(p.file)));
    check('and the street holds the archive\'s own townsfolk, not only armoured fighters',
      families.size >= 2 && people.some((p) => /^(MLGEN|FMGEN|GUARD0|BABE0|PAT|LGLIT0)/.test(p.file)),
      `${families.size} families: ${[...families].slice(0, 8).join(', ')}`);
    check('and is described by what their file says they are',
      people.every((p) => /^(a person in |a man of the town|a woman of the town|a guard of the watch|a townsman of the PAT set|a small figure of the LGLIT set)/.test(p.description ?? '')),
      people[0]?.description);
    check('nobody stands twice in the same cell',
      new Set(people.map((p) => `${p.cell.row},${p.cell.col}`)).size === people.length,
      `${people.length} people in ${new Set(people.map((p) => `${p.cell.row},${p.cell.col}`)).size} cells`);
    check('nobody is standing inside a building or over water',
      people.every((p) => p.cell.row >= 0 && p.cell.col >= 0 && Number.isFinite(p.world.x) && Number.isFinite(p.world.z)),
      JSON.stringify(people[0]?.cell));
    check('their art is uploaded before the first frame that needs it',
      people.every((p) => state.spriteFiles.includes(p.file)),
      `${people.length} files, ${state.spriteFiles.length} uploaded`);
    // Uploaded is not drawn. The billboards are built every frame from whoever is in the
    // level, so this reads the frame's own count — the first version of this suite checked
    // the uploads and the people were invisible on screen.
    //
    // **The count is "everybody who is out", not "everybody the town holds".** Since
    // `stepTownsfolk` rests the people whose own day puts them at home (D-01a: the crowd was
    // frozen all night because that branch had no way to say so), a person indoors is not on
    // the street and not drawn — the town holds them, the street does not show them. The
    // check was *state.figures === people.length* and is restated, not loosened: it still
    // demands that every single person on the street has a billboard, and it reports how
    // many the day has taken indoors so a run that hides the whole crowd is visible here.
    const out = people.filter((p) => !p.atHome);
    check('and every one of them who is out of doors is drawn, as a billboard in front of the camera',
      state.figures === out.length && out.length > 0,
      `${state.figures} billboards for ${out.length} people out of doors (${people.length - out.length} indoors)`);
    // Drawn is not the same as *still*, and it is not the same as *walking either*. Two
    // rules the game has to keep at once, now that the town's people walk about it
    // (`stepTownsfolk`):
    //
    //   1. **a walk cycle belongs to walking** — a batch may only be showing a frame other
    //      than its first one while somebody in that batch really moved. One global frame
    //      counter for the whole level (the defect this check was written for) animated
    //      every creature and person on the spot;
    //   2. **the town is alive** — over a second, somebody's own position must change. A
    //      town where nobody ever moves is the other half of the same report.
    //
    // (There is one batch per *file*, not per person — two people in the same armour share
    // a batch — so the count to hold this to is "no more batches than people".)
    const animA = await page.evalJs('window.__debug.animation()');
    const folkA = await page.evalJs('window.__debug.people()');
    await settle(1200);
    const animB = await page.evalJs('window.__debug.animation()');
    const folkB = await page.evalJs('window.__debug.people()');
    const walked = folkB.filter((p, i) => folkA[i]
      && Math.hypot(p.world.x - folkA[i].world.x, p.world.z - folkA[i].world.z) > 0.05);
    // Sampled twice, a batch that is showing a walk frame right now must be one whose
    // figures moved between the two reads or are moving this very frame (`walking`).
    const stray = animB.figures
      .map((record, i) => ({ record, file: animB.figures[i] }))
      .filter(({ record }) => !/#0$/.test(record))
      .filter(({ record }) => !animB.moving.some((file) => record.startsWith(file)));
    check('a walk cycle belongs to walking: no batch animates while standing still',
      animA.figures.length > 0 && animA.figures.length <= people.length && stray.length === 0,
      `${animA.figures.length} batches of ${people.length} people; moving ${animB.moving.join(', ')}; stray ${stray.map((s) => s.record).join(', ')}`);
    // ── and the watch does not walk on its own sword-swing (D-42) ──────────────
    //
    // Arena's **twelve-frame** sheets (`GUARD0#` the watch, `BABE0#`) hold walk 0–5, look 6/0/7/0
    // and attack 8–11 in one file, so a *walking* figure drawn from one may only show frames 0…5.
    // Every person who is not a monster used to be given the whole sheet as a stride — the layout
    // was read from the actor rather than from the art — which put the watch's head-turn and its
    // sword-swing into its walk, on the street (`.scratch/peopleProbe.mjs` is the archive's own
    // numbers: 12-frame view sheets against 6-and-9-frame single actions). Six samples over a
    // second, because one pose out of six tells you almost nothing about a cycle.
    const nonWalk = [];
    for (let i = 0; i < 6; i++) {
      const shot = await page.evalJs('window.__debug.animation().figures');
      for (const record of shot ?? []) {
        const match = /^([A-Z0-9]+\.CFA)#(\d+)$/.exec(record);
        if (match && /^(GUARD|BABE)/.test(match[1]) && Number(match[2]) > 5) nonWalk.push(record);
      }
      await settle(160);
    }
    check('and the watch walks on its walk frames, not on its head-turn or its sword-swing',
      nonWalk.length === 0,
      nonWalk.length
        ? `drawn on non-walk frames: ${[...new Set(nonWalk)].join(', ')}`
        : `six samples of a peaceful street, no frame past 5 of a layout sheet (${animB.figures.length} batches drawn)`);

    check('and the town is alive: people really walk from cell to cell',
      walked.length > 0 || animB.walking > 0,
      `${walked.length} of ${folkB.length} people moved in 1.2 s, ${animB.walking} mid-step`);
    // ── the file a person and the player can share ────────────────────────────────
    //
    // **A townsman and the player can be the same file, and that is not a nickname.** The
    // archive names a person's sheet `<index><armour><action>.CFA` — `05CHNWLK.CFA` is person
    // five in chain mail — and the player's own back view is named `<view><armour><action>.CFA`
    // with view `05` (`playerSpriteFile`, `BACK_VIEW`), so a player in chain and townsman five
    // resolve to **one string and therefore one uploaded set**. `liveBatches` marks the player's
    // own two sets as *not the crowd* by zeroing their count, and on a shared file that erases
    // the crowd's count with it: the batch is drawn on a walk frame while the seam reports nobody
    // in it moving, which is precisely the shape the check above calls stray. Measured on
    // 2026-10-15, the one stray of forty-six batches was `05CHNWLK.CFA#3` — a file that was not
    // in `moving`. This pins the law that fixes it: whatever the player happens to be wearing, a
    // walk frame drawn for the town's folk must be reported as moving.
    // The law is the stray one, applied to that file: **a sheet drawn at a walk frame for the
    // crowd must be reported moving** — a sheet merely *present* at its standing frame (`#0`) is
    // no evidence of anything, so the pin looks only at non-zero frames. (Its first draft demanded
    // `moving` for any shared sheet at all, and failed on a townsman standing still in the
    // player's own armour — the assertion was wrong, not the game.)
    const shared = await page.evalJs(`(() => {
      const d = window.__debug;
      const player = d.combat().playerSprite;
      const anim = d.animation();
      const mine = (anim.figures ?? []).filter((r) => player && r.startsWith(player + '#'));
      return JSON.stringify({
        player,
        drawn: mine,
        walking: mine.filter((r) => !/#0$/.test(r)),
        moving: Boolean(player) && anim.moving.includes(player),
      });
    })()`);
    const sharedFile = JSON.parse(shared ?? 'null');
    check('a sheet the player and a townsman share is still a crowd sheet: its walk is reported as moving',
      Boolean(sharedFile?.player) && (sharedFile.walking.length === 0 || sharedFile.moving),
      `player's own sheet ${sharedFile?.player}; drawn among the town at ${JSON.stringify(sharedFile?.drawn ?? [])}; reported moving ${sharedFile?.moving}`);

    // ── a person is the same person while they speak ─────────────────────────
    //
    // This check used to assert the opposite: the port drew the family's **talk** sheet
    // (`MLGEN0#T.CFA`, `FMGEN0#.CFA`) the moment a conversation opened, and the owner saw
    // what that is — *"a man and a woman of the town npcs change their clothes when i speak
    // to them"*. Measured off the install's own bytes (`.scratch/talkart.mjs`):
    // `MLGEN01W.CFA` is 52×99 with its cloth on palette indices 148/32/151/130, and
    // `MLGEN01T.CFA` is 43×99 with 162/161/164/165 — a different tunic, not the same man
    // mid-sentence. The standing sheet is kept for the whole conversation, so the claim is
    // that the file **does not change** when the panel opens.
    const talkerIndex = await page.evalJs(`(() => {
      const people = window.__debug.people();
      return people.findIndex((p) => p.actions.some((f) => /^(MLGEN0[1-5]T|FMGEN0[1-5])\\.CFA$/.test(f)));
    })()`);
    check('the town has people whose own art includes a talk sheet', talkerIndex >= 0,
      `${talkerIndex} of ${folkB.length}`);
    if (talkerIndex >= 0) {
      const beforeFile = (await page.evalJs(`window.__debug.people()[${talkerIndex}]`))?.file ?? null;
      const panel = await speakTo(talkerIndex);
      const answered = await page.evalJs(`window.__debug.people()[${talkerIndex}]`);
      // The **figure** is what must not change: the direction digit may (a person turns to
      // face the player when spoken to, `viewFacing`), and `FMGENW02` → `FMGENW01` is that
      // turn. A talk sheet would have replaced `FMGENW0#` with `FMGEN0#` — a different tunic
      // and a different pixel size, which is the defect this check exists for.
      const figure = (file) => String(file ?? '').replace(/\.CFA.*$/, '').replace(/(MLGEN|FMGENW|FMGEND)0?[1-5]/, '$1');
      check('and a person the player speaks to keeps their own figure — the clothes do not change',
        panel?.shown === true && answered?.talking === false
          && Boolean(beforeFile) && figure(answered?.file) === figure(beforeFile),
        JSON.stringify({ panel: panel?.shown, before: beforeFile, after: answered?.file, talking: answered?.talking }));
      await page.pressKey('Escape');
      await page.pressKey('Escape', false);
      await settle(200);
    }
    // **And they walk like people.** The distance a moving person covers, measured over a known
    // interval: the town's own pace was 3.33 m/s (2.5 m in 0.75 s), which is a jog for every
    // resident of every town — the reported "people move hella weird and super fast". The walk is
    // now 1.67 m/s (`TOWN_WALK_SECONDS`), so the claim is the measurement, not the constant.
    // The scene's own pace is the primary claim, and the measured one is the evidence that the
    // code walks at it: **the median** of the moving crowd, not the fastest sample — a single
    // reading of a crowd re-read a moment later can catch a person who left and another who
    // arrived at the same index in the list, and that pair reports as a sprint of hundreds of
    // metres a second (measured: one reading said 544 m/s for a town that moves at 1.67).
    const walks = await page.evalJs('window.__debug.townWalks()');
    let median = 0;
    let movers = 0;
    for (let i = 0; i < 6 && !movers; i++) {
      const before = await page.evalJs('window.__debug.people()');
      await settle(500);
      const after = await page.evalJs('window.__debug.people()');
      const speeds = after.map((p, index) => (before[index]
        ? Math.hypot(p.world.x - before[index].world.x, p.world.z - before[index].world.z) / 0.5
        : 0)).filter((speed) => speed > 0.2 && speed < 6).sort((a, b) => a - b);
      movers = speeds.length;
      median = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
    }
    check('the town walks at a person\'s pace',
      (walks?.pace?.metresPerSecond ?? 99) <= 2.0 && (walks?.pace?.secondsPerCell ?? 0) >= 1,
      `${walks?.pace?.metresPerSecond?.toFixed?.(2)} m/s (${walks?.pace?.secondsPerCell} s a cell)`);
    check('and the crowd really moves at that pace, measured',
      movers > 0 && median <= 2.2,
      `${movers} people moving, the median at ${median.toFixed(2)} m/s`);
    check('the HUD says how many people are about and how to talk',
      /press T to speak/.test(await page.evalJs('document.getElementById("hud").textContent')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').at(-1));
    await page.screenshot(path.join(shots, 'm5-city-people.png'));

    // ── the talk banks, as the browser parsed them ────────────────────────────
    //
    // `template.dat` is a **keyed** file and the page reads the keys (`game/dialogue.js`): the
    // fifteen personality introductions (100…129), the rumours (159/185), the jokes (363), a
    // province's oaths (364+race), a tavern's drinkers (1430), the hundred trades (262/263+). The
    // counts are the install's own, so a parser that quietly lost a bank fails here.
    const talk = await page.evalJs('window.__debug.talkLines()');
    check('the talk banks are template.dat\u2019s own keys, parsed in the browser too',
      talk.keys === 613 && talk.parts === 2462 && talk.sentences === 1823,
      JSON.stringify(talk));
    check('all fifteen personalities have both of their banks',
      talk.personas === 15 && talk.intros === 78 && talk.introsAgain === 70, JSON.stringify(talk));
    check('and the subject banks are there: rumours, jokes, oaths, trades, a tavern\u2019s drinkers',
      talk.rumour === 34 && talk.jokes === 21 && talk.oathBanks === 8 && talk.oaths === 80
      && talk.occupations === 100 && talk.trades === 100 && talk.patron === 40,
      JSON.stringify(talk));

    // ── talking, with the T key ───────────────────────────────────────────────
    check('the panel is not up before anybody is spoken to',
      (await page.evalJs('window.__debug.talkPanel()')).shown === false);
    // **The premise is established, not hoped for.** This used to press `T` where the player
    // arrived, and it held only while nobody happened to be crossing the gate; the town's
    // people walk now (`stepTownsfolk`'s routes), so somebody can be there — and the rule being
    // tested is about what `T` does when *nobody* is. `standClearOfPeople` puts the player on
    // the nearest cell that is clear of every person by more than the talk reach.
    const clear = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.standClearOfPeople())') ?? 'null');
    await settle(200);
    check('the player can stand in the open street with nobody in earshot',
      (clear?.nearest ?? 0) > 4, `the nearest person is ${clear?.nearest?.toFixed?.(1) ?? '?'} m off`);
    check('there is nobody within earshot across a city',
      (await page.evalJs('window.__debug.talk()')).ok === false, 'T from the gate finds nobody');

    const stood = await page.evalJs('JSON.stringify(window.__debug.teleportToPerson("nearest"))');
    check('the player can stand next to somebody', Boolean(JSON.parse(stood ?? 'null')?.description), stood);
    await settle();

    const panel = await speakTo('nearest');
    // **Three shapes, because the game has three and this suite has now met all of them.** The
    // heading a person reads as is their composed **name** when the sibling install's corpus
    // loaded (`Elistan Mosswood — a man of the town`, S30 closed) and the unnamed form otherwise
    // (`a person in chain mail`, `townsfolk.js`'s own `label`) — and the **armoured roster is
    // named too**, so a smith in a habit reads `Bathi — a person in a habit`. The two-shape
    // restatement D-10 landed admitted the name only in front of the *unarmoured* families, so a
    // run on 2026-10-17 failed here on exactly that heading while `talk()` was working perfectly:
    // a third stale assertion under the same row, and this one is repaired the same way — by
    // naming the shapes the modules can really produce rather than the ones a run happened to see.
    //
    // The vocabulary is the game's own (`ARMOUR_WORDS` for the roster, `peopleKinds`' four family
    // labels for the rest), so a *fourth* description would fail this check rather than slip
    // through it. What it refuses is unchanged: a panel with no heading, or one made of words this
    // project never wrote.
    const armourPhrases = Object.values(ARMOUR_WORDS).join('|');
    const heading = new RegExp('^(?:.+ — )?(?:a person in (?:' + armourPhrases + ')'
      + '|a man of the town|a man of the town, in a tunic'
      + '|a woman of the town|a woman of the town, in a bodice|a guard of the watch'
      + '|a lizard-folk of the marsh|a cat-folk of the Elsweyr sands'
      + '|a small figure of the LGLIT set|a stranger)$');
    check('T opens a conversation with the person in front of the player',
      panel.shown === true && heading.test(panel.who ?? ''),
      `shown ${panel.shown}: ${panel.who}`);
    // S30 closed: the street's folk carry the sibling install's own composed names —
    // the heading rides the name when the corpus is in, and the seam counts the named.
    const named = await page.evalJs('JSON.stringify(window.__debug.names ? window.__debug.names() : null)');
    check('the corpus\'s own names are on the street\'s folk',
      named && JSON.parse(named).loaded === true && JSON.parse(named).named > 0, named);
    // **Who is speaking, and out of which bank**: the personality the figure's own art carries
    // (`game/dialogue.js`'s `personaFor`), the trade out of the install's hundred, and the words
    // this game can fill. A citizen of a city-state is exactly that, and the line says so.
    const voice = await page.evalJs('JSON.stringify(window.__debug.talkVoice("nearest"))');
    const who = JSON.parse(voice ?? 'null');
    check('the person in front of the player has a personality out of Arena\'s own fifteen',
      Boolean(who) && typeof who.persona === 'string' && typeof who.personaName === 'string', voice);
    check('and a trade out of the install\'s hundred, described in the file\'s own words',
      Boolean(who?.occupation?.name) && who.occupation.line.length > 8,
      who?.occupation ? `${who.occupation.name}: ${who.occupation.line}` : '(none)');
    check('and the words the place gives them are filled in: the city-state, its kind, the province',
      who?.values?.cn === 'Daggerfall' && ['city', 'town', 'village'].includes(who?.values?.ct)
      && typeof who.values.lp === 'string' && who.values.lp.length > 3,
      JSON.stringify({ cn: who?.values?.cn, ct: who?.values?.ct, lp: who?.values?.lp }));
    check('and the player is addressed by their own race, which is the game\'s own habit',
      typeof who?.values?.ra === 'string' && who.values.ra.length > 2, who?.values?.ra);
    check('and the province\u2019s people swear by their own gods, not somebody else\u2019s',
      typeof who?.values?.oth === 'string' && who.values.oth.length > 4, who?.values?.oth);
    check('what they say is Arena\'s own prose, with no %-word left in it',
      typeof panel.line === 'string' && panel.line.length > 20 && !panel.line.includes('%'),
      `"${(panel.line ?? '').replace(/\s+/g, ' ').slice(0, 90)}…"`);
    check('and it is a whole sentence, not half of one',
      /^["'(A-Z0-9]/.test(panel.line ?? '') && /[.!?”"]$/.test(panel.line ?? '') && !String(panel.line).includes('&'),
      `"${(panel.line ?? '').slice(0, 60)}…" starts and ends one`);
    check('and the panel credits the file it came from, and which of its banks spoke',
      /template\.dat #\d+/.test(panel.source ?? '') && /introduction|words|drinker|talk/.test(panel.source ?? ''),
      panel.source);
    // The line the panel shows is the bank's own: a first meeting is the personality's "who are
    // you" (100 + persona), which is what makes the greeting belong to *this* figure.
    const greeted = await page.evalJs('window.__debug.talk()');
    check('the greeting is the personality\u2019s own bank, not a line drawn from the whole file',
      greeted?.subject && /introduction|remembered|drinker|talk/.test(greeted.subject)
      && Number(String(panel.source ?? '').match(/#(\d+)/)?.[1] ?? -1) >= 100,
      `${greeted?.subject} · ${panel.source}`);
    check('there is a question about this place, and one about the city-state',
      panel.topics.length >= 2 && panel.topics.some((t) => t.key === 'here') && panel.topics.some((t) => t.key === 'city'),
      panel.topics.map((t) => `${t.key}:${t.label}`).join(' · '));
    check('the second question is labelled with the city-state the player is in',
      panel.topics.some((t) => t.key === 'city' && /Ask about Daggerfall/.test(t.label ?? '')),
      panel.topics.map((t) => t.label).join(' · '));

    // ── asking about the city-state, with a real click ────────────────────────
    await page.clickSelector('#talk button[data-topic="city"]');
    await settle(200);
    const asked = await page.evalJs('window.__debug.talkPanel()');
    check('asking about the city-state answers with the name of the city it really is',
      /Daggerfall/.test(asked.line ?? ''), `"${(asked.line ?? '').replace(/\s+/g, ' ').slice(0, 110)}…"`);
    check('and the answer is still whole, with no %-word in it',
      !String(asked.line ?? '').includes('%'), asked.line?.slice(0, 60));
    check('the credit line names the city-state the answer is about',
      /about Daggerfall/.test(asked.source ?? ''), asked.source);
    await page.screenshot(path.join(shots, 'm5-talking.png'));

    // ── the way to the tavern, the shop, the guild and the palace ─────────────
    //
    // The owner, 2026-10-19: *"speaking with town npcs that are outside you need to be able to
    // ask for directions for the nearest tavern, shop, mages guild and palace"*. The doors the
    // street already has are measured against the player's feet by the scene
    // (`nearbyBuildings`), and `game/dialogue.js` dresses each with Arena's own where-is bank
    // (`template.dat` #260) — so what is checked here is the two halves: the questions exist
    // for every building a city has, and each answer names a compass direction and a distance.
    const directionVoice = await page.evalJs('window.__debug.talkVoice("nearest")');
    const wanted = ['where:tavern', 'where:equipment', 'where:mages', 'where:palace'];
    check('the street offers the way to its tavern, its shop, the Mages Guild and the palace',
      wanted.every((key) => directionVoice?.topics?.some((topic) => topic.key === key)),
      (directionVoice?.topics ?? []).map((topic) => `${topic.key}:${topic.label}`).join(' · '));
    const directionTopics = (directionVoice?.topics ?? []).filter((topic) => String(topic.key).startsWith('where:'));
    const compass = /\b(north|south|east|west)(-(east|west))?\b/i;
    const spoken = directionTopics.map((topic) => String(topic.text ?? ''));
    check('every direction names a compass bearing and a distance in metres, with no %-word',
      spoken.length >= 4 && spoken.every((text) => compass.test(text) && /\d+ metres? off/.test(text) && !text.includes('%')),
      spoken.map((text) => `"${text.replace(/\s+/g, ' ').slice(0, 70)}…"`).join(' | '));
    check('and each one is measured to the building it names, not to the street\'s middle',
      (directionVoice?.nearby ?? []).length >= 4
      && directionVoice.nearby.some((entry) => entry.kind === 'tavern' && entry.distance > 0)
      && directionVoice.nearby.every((entry) => /^(north|south|east|west)(East|West)?$/.test(String(entry.bearing))),
      JSON.stringify(directionVoice?.nearby));
    // A real click on the tavern question, through the panel's own button.
    await page.clickSelector('#talk button[data-topic="where:tavern"]');
    await settle(220);
    const way = await page.evalJs('window.__debug.talkPanel()');
    check('asking the way to the tavern answers with Arena\'s where-is words and the metres',
      compass.test(way.line ?? '') && /\d+ metres? off/.test(way.line ?? ''),
      `"${String(way.line ?? '').replace(/\s+/g, ' ').slice(0, 110)}…" · ${way.source}`);
    check('and the credit says which half is Arena\'s',
      /#260|where-is|this project/i.test(way.source ?? ''), way.source);
    await page.screenshot(path.join(shots, 'm5-directions.png'));

    // ── asking again moves the conversation on ────────────────────────────────
    const first = await page.evalJs('window.__debug.talk()');
    await settle(120);
    const second = await page.evalJs('window.__debug.talk()');
    check('speaking twice to the same person is not the same sentence twice',
      Boolean(first?.line) && Boolean(second?.line) && first.line !== second.line,
      `"${String(first?.line).slice(0, 40)}…" → "${String(second?.line).slice(0, 40)}…"`
      + (first?.ok === false || second?.ok === false ? ` [${first?.reason ?? second?.reason}]` : ''));
    check('and every one of those lines is complete',
      !String(second?.line).includes('%') && String(second?.line).length > 20, String(second?.line).slice(0, 60));

    // ── walking away ──────────────────────────────────────────────────────────
    //
    // Two ways a conversation ends, and the owner named the second one on 2026-10-19: *"the speech
    // gui should disappear once you get too far from who youre speaking to"*. The panel used to
    // stand for ever, with the person frozen mid-street watching a player who had left. `Escape`
    // is the deliberate end; **four cells away** is the distance one, and the seam says why.
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle(150);
    check('Escape ends the conversation',
      (await page.evalJs('window.__debug.talkPanel()')).shown === false);

    const spoke = await speakTo('nearest');
    const held = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.talking())') ?? 'null');
    check('speaking holds the person, and the seam knows which record it is',
      spoke.shown === true && Boolean(held?.place), JSON.stringify({ who: spoke.who, held: held?.place }));
    check('and the panel has not been reported as closed while it is up',
      (await page.evalJs('window.__debug.talkPanel()')).closed === null,
      JSON.stringify((await page.evalJs('window.__debug.talkPanel()')).closed));
    // Four cells is ten metres, well past the six the rule closes at (the reach that *opens* a
    // conversation is four, and the close is deliberately wider so the edge is not a flicker).
    await page.evalJs(`window.__debug.teleportCell(${(held?.place?.row ?? 0) + 4}, ${held?.place?.col ?? 0})`);
    await settle(300);
    const gone = await page.evalJs('window.__debug.talkPanel()');
    check('walking out of earshot puts the panel away by itself',
      gone.shown === false && gone.closed?.reason === 'out of earshot',
      JSON.stringify({ shown: gone.shown, closed: gone.closed }));
    check('and it closed at a distance a player really walked',
      Number(gone.closed?.distance ?? 0) > 6, `${gone.closed?.distance} m`);
    check('and the person they left goes back to their own day',
      (await page.evalJs('JSON.stringify(window.__debug.talking())')) === 'null',
      'the conversation record is cleared');

    // ── the work a person has to offer ────────────────────────────────────────
    //
    // Arena gives its side work through *somebody* — the tavern keeper, the guildmaster, a
    // stranger with a problem — and this project's board on the world map is one version of
    // that. This is the street's version, and it is the reason a player talks to people at
    // all: whoever is spoken to answers with a job drawn from the world data, aimed at a
    // dungeon this install can really open, and the panel lets the player take it.
    //
    // The suites share one page, so a job accepted by an earlier suite is put down first —
    // through the game's own abandon event, not by reaching into its state.
    const putDown = await page.evalJs('window.__debug.abandonJob()');
    check('the side work can be put down, so this part starts with nothing in hand',
      putDown?.active === null, JSON.stringify(putDown));

    await page.evalJs('window.__debug.teleportToPerson("nearest")');
    await settle();
    const offerPanel = await speakTo('nearest');
    const offered = await page.evalJs('window.__debug.talk().offer');
    const offer = await page.evalJs('window.__debug.jobOffer("nearest")');
    check('the person across the street has work to offer',
      Boolean(offered?.title) && typeof offerPanel.job === 'string' && offerPanel.job.length > 40,
      `${offered?.title ?? '(none)'} — "${String(offerPanel.job ?? '').replace(/\s+/g, ' ').slice(0, 70)}…"`);
    check('and the panel says whose words the offer is',
      /Arena: |this project/.test(offerPanel.jobCredit ?? ''), offerPanel.jobCredit);
    check('the offer has a purse and a deadline, measured in the world\'s own days',
      Number(offer?.days) >= 4 && Number(offer?.reward) > 0,
      `${offer?.reward} gold in ${offer?.days} days`);
    // A job that names a place the game cannot open would be worse than no job: the dungeon
    // list is the sixteen `.MIF`s this install really ships (the same list the board uses).
    // **Three doors now**: a dungeon the install can open, a settlement it can name, or the
    // open country around one (`radiantQuests.js`'s `where`). A wild job carries the cell it
    // happens on and the landmark it is near, and a dungeon job still carries its `.MIF`.
    const dungeonKinds = ['artifact', 'slay', 'fetch'];
    check('and it points somewhere this install can open',
      dungeonKinds.includes(offer?.kind)
        ? /^[A-Z0-9_]+\.MIF$/i.test(offer?.targetMif ?? '') && offer?.draftDungeons > 0 && offer?.province === 'High Rock'
        : offer?.targetKind === 'wild'
          ? Boolean(offer?.targetCell?.row) && Boolean(offer?.targetCell?.col) && Boolean(offer?.targetNear)
          : Boolean(offer?.target),
      `${offer?.kind} → ${offer?.target} (${offer?.targetKind ?? 'a settlement'}${offer?.targetMif ? ` ${offer.targetMif}` : ''}), ${offer?.draftDungeons} dungeons to draw from`);
    check('the offer is shown with a button to take it',
      /^Take the job — /.test(offerPanel.accept ?? ''), offerPanel.accept);
    await page.screenshot(path.join(shots, 'm5-city-job.png'));

    // The button, clicked the way a player clicks it.
    await page.clickSelector('#talk button[data-job="accept"]');
    await settle(260);
    const taken = await page.evalJs('window.__debug.jobs()');
    check('clicking the button takes the job those words were selling',
      taken.active?.title === offered.title && taken.active?.target === offered.target,
      `${taken.active?.title} → ${taken.active?.target}`);
    check('the journal records it, with its purse and its deadline',
      /^Accepted: /.test(taken.entry ?? '') && /gold/.test(taken.entry ?? '') && /days/.test(taken.entry ?? ''),
      taken.entry);
    check('and the objective says where to go',
      /^(Travel to|Deliver to) /.test(taken.objective ?? ''), taken.objective);
    check('the HUD carries the job, so the player does not have to open the map',
      new RegExp(String(taken.active.target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await page.evalJs('document.getElementById("hud").textContent')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').at(-3));
    check('and the panel does not offer it twice',
      (await page.evalJs('window.__debug.talkPanel()')).accept === null);

    // One job at a time, whoever offers the next one.
    await page.evalJs('window.__debug.teleportToPerson(1)');
    await settle(200);
    const busy = await speakTo(1);
    check('a second person will not pile another job on top of one in hand',
      busy.accept === null && /hold it for you/.test(busy.jobCredit ?? '') && /in hand/.test(busy.jobCredit ?? ''),
      busy.jobCredit);

    // ── and it survives the page being loaded again ───────────────────────────
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Daggerfall again', timeoutMs: 120000 });
    const persist = await page.evalJs('window.__debug.jobs()');
    check('the job is still in hand after the page is loaded again',
      persist.active?.id === taken.active.id && persist.objective === taken.objective,
      `${persist.active?.title} (${persist.active?.id})`);

    // ── everybody looks at the player ─────────────────────────────────────────
    // A person is one outfit at five angles, and the angle the game shows is the one that
    // points at the eye (`viewFacing`). Stand where somebody is looking and they face the
    // camera (view 1); stand behind them and they show their back (view 5). Standing at
    // whatever angle the roster handed out is the reported "npcs don't look at you, they
    // have a static random png".
    //
    // The town walks now, and a walking person turns to face the way they are going — so
    // the simulation is paused for this, which is the seam's own purpose (`__debug.pause`,
    // used by the weapon checks for the same reason). Their yaw and their cell then hold
    // still while the eye is moved around them, and the angle is the geometry's alone.
    const street = await page.evalJs('window.__debug.people()');
    check('every person in the street is drawn from one of the archive\'s five angles',
      street.length > 0 && street.every((p) => p.view >= 1 && p.view <= 5),
      `${street.length} people, views ${[...new Set(street.map((p) => p.view))].sort().join(',')}`);
    // …and to a person who is **standing still**, because the pause freezes whoever is
    // mid-step on the frame they were on: a walking person faces the way they are going and
    // shows their walk cycle from every angle, which is not the rule under test. Taking the
    // first person in the roster made this check intermittent for exactly that reason — a
    // town stopped mid-step is a town where nobody can be walked around. So the world is
    // stopped, and a few frames run between attempts, until somebody is standing.
    let paused = [];
    let at = -1;
    for (let tries = 0; tries < 8 && at < 0; tries++) {
      await page.evalJs('window.__debug.pause(true)');
      paused = await page.evalJs('window.__debug.people()');
      at = paused.findIndex((p) => !p.walking && !p.atHome);
      if (at < 0) {
        await page.evalJs('window.__debug.pause(false)');
        await settle(320);
      }
    }
    check('somebody in the street is standing still, so the eye can be walked around them',
      at >= 0, `${paused.filter((p) => p.walking).length} of ${paused.length} mid-step`);
    if (at < 0) at = 0;
    const watched = paused[at];
    // Their own forward vector: `facing` is a yaw, and the game's yaw runs x = sin, z = cos.
    const ahead = { x: watched.world.x + Math.sin(watched.facing) * 4, z: watched.world.z + Math.cos(watched.facing) * 4 };
    const behindAt = { x: watched.world.x - Math.sin(watched.facing) * 4, z: watched.world.z - Math.cos(watched.facing) * 4 };
    await page.evalJs(`window.__debug.teleport(${ahead.x}, 2.5, ${ahead.z})`);
    await page.waitFor(`window.__debug.people()[${at}].view === 1`, { label: 'front-facing billboard painted', timeoutMs: 10000 });
    const front = (await page.evalJs('window.__debug.people()'))[at];
    await page.evalJs(`window.__debug.teleport(${behindAt.x}, 2.5, ${behindAt.z})`);
    await page.waitFor(`window.__debug.people()[${at}].view === 5`, { label: 'rear-facing billboard painted', timeoutMs: 10000 });
    const behind = (await page.evalJs('window.__debug.people()'))[at];
    await page.evalJs('window.__debug.pause(false)');
    check('and they turn to face the player: the eye in front shows the face, the eye behind the back',
      front.view === 1 && behind.view === 5 && front.file !== behind.file,
      `from ${front.file} (view ${front.view}) to ${behind.file} (view ${behind.view})`);

    // ── and the town's own men and women turn too (D-47) ──────────────────────
    // **This is the half the owner could not see.** The citizens' five directions used to be read
    // as five *people* (`MLGEN01`…`MLGEN05` = "five men, one angle each"), so a man of the town
    // was frozen in whichever direction the roster handed him and no port could walk around him —
    // the reported *"they dont have a proper 360 walking animation or going around them 360
    // animation"*. The digit is the direction (OpenTESArena's `0@XXX` template: first digit the
    // gender, `@` the direction 1…5 — `peopleKinds.js`'s header carries the provenance), so the
    // check picks a *citizen* and walks the eye from his face to his back: two directions of one
    // family, not two strangers.
    // **Four citizen families, not two** (2026-10-18): the archive draws `MLGEN0#W` and
    // `MLGEN0#T` (two men) and `FMGENW0#` and `FMGEN0#` (two women), each five directions
    // (`peopleKinds.js`). A citizen can be any of them, so both the walk list and the
    // direction parse every spelling — a `T` man was a *citizen with no walk art* to this
    // check the moment he was added.
    const walksOf = (files) => (files ?? []).filter((f) => /^(MLGEN0[1-5][WT]|FMGENW?0[1-5])\.CFA$/.test(String(f)));
    const directionOf = (file) => {
      const m = /^MLGEN0([1-5])[WT]/.exec(String(file)) ?? /^FMGENW?0([1-5])/.exec(String(file));
      return m ? Number(m[1]) : null;
    };
    let citizen = null;
    let citizenAt = -1;
    for (let tries = 0; tries < 10 && citizenAt < 0; tries++) {
      await page.evalJs('window.__debug.pause(true)');
      const list = await page.evalJs('window.__debug.people()');
      citizenAt = list.findIndex((p) => !p.atHome && !p.walking && /^(MLGEN|FMGEN)/.test(String(p.family)));
      if (citizenAt >= 0) citizen = list[citizenAt];
      else { await page.evalJs('window.__debug.pause(false)'); await settle(300); }
    }
    check('the street holds one of the town\'s own men or women to walk around',
      citizenAt >= 0 && citizen !== null,
      citizen ? `${citizen.description} (${citizen.family})` : 'no citizen was standing in ten tries');
    if (citizenAt >= 0) {
      const walks = walksOf(citizen.actions);
      check('a citizen family carries five walk directions, not one',
        new Set(walks).size === 5,
        `${citizen.family}: ${walks.join(' ') || 'none'}`);
      const faceAt = { x: citizen.world.x + Math.sin(citizen.facing) * 4, z: citizen.world.z + Math.cos(citizen.facing) * 4 };
      const backAt = { x: citizen.world.x - Math.sin(citizen.facing) * 4, z: citizen.world.z - Math.cos(citizen.facing) * 4 };
      await page.evalJs(`window.__debug.teleport(${faceAt.x}, 2.5, ${faceAt.z})`);
      await page.waitFor(`window.__debug.people()[${citizenAt}].view === 1`, { label: 'citizen faces the eye', timeoutMs: 10000 });
      const cFront = (await page.evalJs('window.__debug.people()'))[citizenAt];
      await page.evalJs(`window.__debug.teleport(${backAt.x}, 2.5, ${backAt.z})`);
      await page.waitFor(`window.__debug.people()[${citizenAt}].view === 5`, { label: 'citizen shows the back', timeoutMs: 10000 });
      const cBack = (await page.evalJs('window.__debug.people()'))[citizenAt];
      check('and a man or woman of the town is drawn from direction 1 to direction 5 as the eye moves',
        cFront.view === 1 && cBack.view === 5 && directionOf(cFront.file) === 1 && directionOf(cBack.file) === 5,
        `${cFront.file} (view ${cFront.view}) → ${cBack.file} (view ${cBack.view})`);
    }
    await page.evalJs('window.__debug.pause(false)');

    // ── whose faces these are (D-45) ─────────────────────────────────────────
    // The owner's second half: *"in morrowind mostly dark elf npcs in skyrim mostly nords in
    // blackmarsh i want lizard mans repurpused as npcs to simulate argonians … all provinces
    // should have a mix of people but mostly their race of people"*. Two things answer it and this
    // is both of them.
    //
    // The **art** half: the Lizard Man's own sheets (`LIZARD1…6.CFA`) stand in for Black Marsh's
    // folk — the one race-specific figure the archive carries (`game/peopleKinds.js`).
    //
    // The **skin** half (`game/raceSkin.js`): Arena ships one human body and no per-race art, so a
    // person's race is the install's own palette with its six skin entries (229, 231, 232, 234,
    // 235, 236 — measured off the sheets' own pixels) rescaled to that race's ramp, and the sheet
    // is loaded under a **raced key** (`MLGEN01W.CFA#darkElf`). A raced figure is therefore a
    // different texture of the same file, and every check below reads the *file* through `bare()`.
    //
    // **A person's race is an identity, and its art is one of two kinds.** A palette race is the
    // install's own body under a suffixed sheet key (`MLGEN01W.CFA#nord`); a **figure race** is a
    // whole figure the archive already draws as that race (`raceSkin.RACE_FIGURE`: the Lizard Man
    // stands in for an Argonian, D-45), so its sheet is `LIZARD1.CFA` with **no suffix** — a suffix
    // there would lay a second skin over art that already is the race, which is the "green people"
    // the owner refused. So the law checked here is `person.race` for everyone, and the suffix
    // *when the sheet is a palette race*; the figure's own name is the rest.
    // **The key carries a face *and* a head** (`raceSkin.js`'s `skinSpec`): a Dunmer with fair
    // hair is `MLGEN01W.CFA#darkElf+blonde`, so the race is the part of the suffix before the
    // `+` and the head is the part after it. Reading `endsWith('#' + race)` here would have
    // failed every person whose head was drawn — which is most of a street.
    const specOf = (file) => {
      const text = String(file ?? '');
      const mark = text.indexOf('#');
      return mark < 0 ? null : text.slice(mark + 1);
    };
    const raceOf = (file) => (specOf(file) ?? '').split('+')[0] || null;
    // **Two figures carry their race in the art itself** (2026-10-18): the Lizard Man's sheets
    // are an Argonian with no suffix, and the snow wolf's are a Khajiit under its own coat
    // (`#khajiitFur` / `#khajiitFur:black`). Their names are not a race key, so neither can be
    // read by the palette-race test below: a black-coated cat in Lilmoth was "a person with no
    // race" to this check the moment the coats were added.
    const figureRaceOf = (file) => {
      const art = bare(file);
      if (/^LIZARD[1-6]\.CFA$/.test(art)) return 'argonian';
      if (/^SWOLF0[1-6]\.CFA$/.test(art)) return 'khajiit';
      return null;
    };
    const carriesRace = (person) => typeof person.race === 'string' && person.race.length > 0
      && (figureRaceOf(person.file) === person.race || raceOf(person.file) === person.race);
    const racedCount = (people) => people.filter(carriesRace).length;
    await page.goto(`http://localhost:${getPort()}/?location=Lilmoth&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Lilmoth', timeoutMs: 120000 });
    const marsh = await page.evalJs('window.__debug.people()');
    const lizard = marsh.filter((person) => /^LIZARD[1-6]\.CFA$/.test(bare(person.file)));
    check('Black Marsh\'s streets are mostly lizard-folk, drawn from the Lizard Man\'s own sheets',
      marsh.length > 0 && lizard.length * 2 > marsh.length,
      `${lizard.length} of ${marsh.length} figures: ${[...new Set(lizard.map((p) => bare(p.file)))].sort().join(', ')}`);
    check('and each of them is one figure at five directions, so the eye can walk around them',
      lizard.length > 0 && lizard.every((person) => person.view >= 1 && person.view <= 5),
      `views ${[...new Set(lizard.map((p) => p.view))].sort().join(',')}`);
    check('and every one of them is drawn under the Argonians\' own skin',
      lizard.length > 0 && lizard.every((person) => person.race === 'argonian'),
      `races ${[...new Set(lizard.map((p) => p.race))].join(',')}`);
    // **Mostly their own race, and a real mix.** The player's half of the province table: most of a
    // street is the province's own people and not all of the rest is one other race, which is the
    // owner's *"all provinces should have a mix of people but mostly their race of people"*.
    const share = (people, race) => people.filter((p) => p.race === race).length / Math.max(1, people.length);
    check('a province\'s street is mostly its own race, and still a mix of others',
      share(marsh, 'argonian') > 0.5 && racedCount(marsh) === marsh.length
        && new Set(marsh.map((p) => p.race)).size >= 2,
      `${(share(marsh, 'argonian') * 100).toFixed(0)}% argonian of ${marsh.length}, ${racedCount(marsh)} carry their race, races ${[...new Set(marsh.map((p) => p.race))].sort().join(',')}`);
    await page.goto(`http://localhost:${getPort()}/?location=Necrom&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Necrom', timeoutMs: 120000 });
    const morrowind = await page.evalJs('window.__debug.people()');
    check('and Morrowind is mostly Dark Elves, every one drawn under a skin of their own',
      morrowind.length > 0 && share(morrowind, 'darkElf') > 0.5
        && racedCount(morrowind) === morrowind.length,
      `${(share(morrowind, 'darkElf') * 100).toFixed(0)}% darkElf of ${morrowind.length}, ${racedCount(morrowind)} carry their race, races ${[...new Set(morrowind.map((p) => p.race))].sort().join(',')}`);
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Daggerfall again', timeoutMs: 120000 });
    const rock = await page.evalJs('window.__debug.people()');
    check('and a province the archive draws no lizard-folk for has none',
      rock.length > 0 && rock.every((person) => !/^LIZARD/.test(bare(person.file))),
      `${rock.length} figures, families ${[...new Set(rock.map((p) => p.family ?? 'armoured'))].sort().join(',')}`);
    // ── and a street is not one head ──────────────────────────────────────────
    // The owner: *"you could also have the blonde hair in npcs change color to a random hair
    // color like you do with the skin color to make more npc variety"*. The colours are drawn
    // per person (`raceSkin.js`'s `hairForPerson`), carried in the sheet key, and reported on
    // the page — so the claim is the page's own: several heads on a street of one province, and
    // each head keeping its colour.
    const heads = new Set(morrowind.map((person) => person.hair).filter(Boolean));
    check('a street of one race is not one hair colour: the heads are drawn per person',
      heads.size >= 3,
      `${heads.size} heads: ${[...heads].sort().join(', ')} of ${morrowind.length} people`);
    check('and every raced person carries their head in the sheet key they are drawn under',
      morrowind.every((person) => {
        if (/^(LIZARD|SWOLF0[1-6])/.test(bare(person.file))) return true;
        const spec = specOf(person.file) ?? '';
        return person.hair ? spec === `${person.race}+${person.hair}` : spec === person.race;
      }),
      morrowind.slice(0, 4).map((p) => `${p.file} (${p.race}/${p.hair})`).join(' '));
    check('and High Rock is mostly Bretons, so it is not one race everywhere',
      rock.length > 0 && share(rock, 'breton') > 0.4 && share(rock, 'darkElf') === 0,
      `${(share(rock, 'breton') * 100).toFixed(0)}% breton of ${rock.length}, races ${new Set(rock.map((p) => p.race)).size}`);

    // ── a dungeon has no townsfolk in it ──────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'START.MIF', timeoutMs: 90000 });
    const dungeon = await page.evalJs('window.__debug.state()');
    check('the people are the town\'s, not the world\'s — a dungeon has none',
      dungeon.townsfolk === 0 && dungeon.monsters > 0, `${dungeon.townsfolk} people, ${dungeon.monsters} monsters`);

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
