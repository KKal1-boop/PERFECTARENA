// Suite: the level-up — what the experience the fight pays actually buys.
//
// The fight has counted experience since the monsters learned UESP's EExp rule; what it never
// did was *spend* it. This suite walks the whole of the other half in the running game: a real
// kill pays into the counter, the counter's threshold opens the panel
// (`game/progression.js`), the points are placed with the number keys a player has, `Enter`
// takes the level, and the character that comes out of it is the character a reload loads.
//
// Where a step could pass vacuously, the check names the number it is asserting: the
// threshold for the class's column, the points the roll handed out, the health the level
// added, and the eight attributes before and after.

import path from 'node:path';

/** The dev door's own folder, the same one every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

/**
 * Column B, the Warrior's own — the stand-in character's class, and therefore the threshold
 * these checks run against: `XP_COLUMNS.B` in `src/game/progression.js`, the level-2 row of
 * UESP's published table.
 */
const WARRIOR_LEVEL_2 = 900;

export function makeProgressionSuite({ check, realErrors, shots, getPort }) {
  return async function suiteProgression(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;
    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const at = (extra = '') => `http://localhost:${PORT}/?interior=START.MIF&${q}${extra}`;
    const progression = () => page.evalJs('window.__debug.progression()');

    await page.goto(at());
    await page.waitFor('window.__debug?.scene === "interior" && !!window.__debug.progression', { label: 'the dungeon', timeoutMs: 90000 });
    await page.waitFor('document.getElementById("combat")?.classList.contains("on")', { label: 'the combat HUD', timeoutMs: 60000 });

    const start = await progression();
    check('a character with no experience owes no level',
      start?.level === 1 && start?.owed === 0 && start?.next === WARRIOR_LEVEL_2,
      `level ${start?.level}, ${start?.xp} xp, next at ${start?.next}`);
    check('the panel says where the numbers come from, as the combat HUD does',
      /UESP/.test(start?.sources?.xp ?? '') && /3 to 6/.test(start?.sources?.points ?? ''),
      `${start?.sources?.points}`);

    // ── a real kill pays the counter the level-up reads ──────────────────────
    // Through the `F` key, on a monster that is really there: the seam is not what pays.
    //
    // The **weakest** monster in the level is the one picked, and that ordering is the fix to
    // this suite's own first run: `approach(0)` walked up to a Stone Golem (334 hit points) and
    // forty blows — thirteen seconds of a real swing with a real to-hit roll — did not finish
    // it, so the check failed on the *level's* draw rather than on anything about experience.
    const weakest = JSON.parse(await page.evalJs(`(() => {
      const list = window.__debug.combat().monsters;
      let best = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i].health <= 0) continue;
        if (best < 0 || list[i].maxHealth < list[best].maxHealth) best = i;
      }
      return JSON.stringify({ index: best, name: best < 0 ? null : list[best].name, health: best < 0 ? 0 : list[best].maxHealth });
    })()`) ?? 'null');
    const approached = await page.evalJs(`JSON.stringify(window.__debug.approach(${Math.max(0, weakest.index)}))`);
    const target = JSON.parse(approached ?? 'null');
    check('the weakest monster in the level can be walked up to', Boolean(target?.name), `${weakest.name} — ${approached}`);
    let slain = false;
    for (let blow = 0; blow < 80 && !slain; blow++) {
      await page.pressKey('KeyF');
      await page.pressKey('KeyF', false);
      await settle(260);
      slain = (await page.evalJs('window.__debug.combat().monsters.filter((m) => m.health <= 0).length')) > 0;
    }
    const paid = await progression();
    check('a monster killed with F pays experience into the same counter the level-up reads',
      slain && paid.xp > 0,
      `${paid.xp} experience from ${target?.name ?? 'a monster'}`);

    // ── the threshold opens the panel ────────────────────────────────────────
    await page.evalJs(`window.__debug.awardXp(${WARRIOR_LEVEL_2})`);
    await settle(300);
    const due = await progression();
    check(`the warrior's own threshold (${WARRIOR_LEVEL_2}) earns a level`,
      due.owed === 1 && due.earned === 2,
      `${due.xp} xp, level ${due.level}, earned ${due.earned}, owed ${due.owed}`);
    check('and the panel is up, with 3 to 6 points to place',
      due.panel?.open === true && due.panel.points >= 3 && due.panel.points <= 6 && due.panel.left === due.panel.points,
      JSON.stringify(due.panel));
    check('the HUD says the level is owed, and how far the next one is',
      /level 1/.test(await page.evalJs('document.getElementById("combat").textContent'))
      && /press L to place the points/.test(await page.evalJs('document.getElementById("combat").textContent')),
      (await page.evalJs('document.getElementById("combat").textContent')).split('\n')[0]);
    await page.screenshot(path.join(shots, 'progression-panel.png'));

    // ── the points go where the player puts them ─────────────────────────────
    const before = due.attributes;
    const wanted = due.panel.points;
    for (let i = 0; i < wanted; i++) {
      await page.pressKey('Digit1');
      await page.pressKey('Digit1', false);
    }
    await settle(200);
    const placed = await progression();
    check('every point pressed goes in, and the panel counts them down',
      placed.panel?.left === 0 && placed.panel.allocation?.strength === wanted,
      JSON.stringify(placed.panel));
    check('and the sheet has not moved yet: the level is taken when the player says so',
      placed.level === 1 && placed.attributes[0].value === before[0].value,
      `level ${placed.level}, strength ${placed.attributes[0].value}`);
    await page.screenshot(path.join(shots, 'progression-points.png'));

    const healthBefore = placed.maxHealth;
    await page.pressKey('Enter');
    await page.pressKey('Enter', false);
    await settle(400);
    const taken = await progression();
    check('Enter takes the level',
      taken.level === 2 && taken.owed === 0 && taken.panel === null,
      `level ${taken.level}, owed ${taken.owed}, panel ${JSON.stringify(taken.panel ?? null)}`);
    check('the attributes rose by exactly the points that were placed',
      taken.attributes[0].value === before[0].value + wanted
      && taken.attributes.slice(1).every((a, i) => a.value === before[i + 1].value),
      `${before[0].value} → ${taken.attributes[0].value} strength, others unchanged`);
    const gained = taken.maxHealth - healthBefore;
    check('the health rose by a hit-die roll, which is 1 to the class die plus the Endurance bonus',
      gained >= 1 && gained <= 20, `+${gained} health (warrior d20, END 50 pays +0)`);
    check('taking the level said so, in the game\'s own notice',
      /reaches level 2/.test(await page.evalJs('window.__debug.state().notice ?? ""')),
      await page.evalJs('window.__debug.state().notice ?? ""'));

    // ── and it is the character, not a buff on the scene ─────────────────────
    await page.goto(at());
    await page.waitFor('window.__debug?.scene === "interior" && !!window.__debug.progression', { label: 'reload', timeoutMs: 90000 });
    const restored = await progression();
    check('the level survived the reload, which is the point of taking it',
      restored.level === 2 && restored.xp === taken.xp && restored.owed === 0,
      `level ${restored.level}, ${restored.xp} xp`);
    check('and so did the attributes the player chose',
      restored.attributes[0].value === taken.attributes[0].value
      && restored.maxHealth === taken.maxHealth,
      `strength ${restored.attributes[0].value}, max health ${restored.maxHealth}`);

    // ── more than one level at once ──────────────────────────────────────────
    // Twenty times the first threshold is several levels at once, and each one is its own
    // decision: the panel reopens with the next level's own roll until nothing is owed.
    await page.evalJs(`window.__debug.awardXp(${WARRIOR_LEVEL_2 * 20})`);
    await settle(300);
    const many = await progression();
    check('a great deal of experience is several levels at once, not one',
      many.owed >= 3 && many.panel?.open === true && many.panel.owed === many.owed,
      `${many.owed} levels owed from ${many.xp} experience`);
    let guard = 0;
    while ((await page.evalJs('window.__debug.progression().owed')) > 0 && guard++ < 12) {
      for (let i = 0; i < 6; i++) { await page.pressKey('Digit1'); await page.pressKey('Digit1', false); }
      await page.pressKey('Enter');
      await page.pressKey('Enter', false);
      await settle(220);
    }
    const finished = await progression();
    check('and every one of them is taken, one panel at a time',
      finished.owed === 0 && finished.level >= 4 && finished.attributes[0].value > taken.attributes[0].value,
      `level ${finished.level}, strength ${finished.attributes[0].value}, ${guard} panel(s) answered`);

    // ── Escape postpones rather than discards ────────────────────────────────
    await page.evalJs(`window.__debug.awardXp(${WARRIOR_LEVEL_2 * 200})`);
    await settle(300);
    const postponed = await progression();
    check('a level can be put off', postponed.panel?.open === true && postponed.owed >= 1, `${postponed.owed} owed`);
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle(300);
    const away = await progression();
    check('Escape puts the panel away with the points still waiting, and opens no menu',
      away.panel?.open === false && away.owed === postponed.owed
      && (await page.evalJs('window.__debug.state().menuOpen')) === false,
      `owed ${away.owed}, menu ${await page.evalJs('window.__debug.state().menuOpen')}`);
    await page.pressKey('KeyL');
    await page.pressKey('KeyL', false);
    await settle(250);
    const backAgain = await progression();
    check('and L brings it back', backAgain.panel?.open === true, JSON.stringify(backAgain.panel));

    check('no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
