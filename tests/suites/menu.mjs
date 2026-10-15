// SUITE: THE MENU, AND STARTING OVER.
//
// `Escape` in a level opens the menu (`scenes/interior.js`), and the menu is where a
// player starts again. Two things have to be true for that to be worth anything:
//
//   * **it is a pause** — the world really stops (`state().paused`), the picture keeps
//     painting, and the keys are dead, so a player reading the panel cannot walk into a
//     monster they cannot see;
//   * **New Game is a new game** — `clearSave()` takes the character, the quest, the job
//     board and the regard ledger, character creation comes up **in the same page** (the
//     player's Arena folder cannot survive a navigation — `scenes/newGame.js`), and the map
//     the new character lands on has a quest at step 0 and a world that has never heard of
//     them.
//
// Nothing here is asserted from a flag the flow sets about itself: the save is read out of
// `localStorage`, the panel is read out of the DOM, the frames are the scene's own count,
// and the buttons are pressed with real mouse events at real coordinates (`page.clickSelector`)
// — which is also what proves the map's own door on the sheet is *hittable*, since that panel
// is `pointer-events: none` so map clicks pass through it.
//
// The dev door (`?arena=`) is used throughout because that is the folder the browser suite
// can open. Everything asserted about it holds for a hand-picked folder too, and by the same
// code path: `scenes/newGame.js` never navigates.

/** @param {object} helpers */
export function makeMenuSuite({ check, realErrors, shots, getPort }) {
  return async function suiteMenu(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 220) => new Promise((r) => setTimeout(r, ms));
    const city = `http://localhost:${getPort()}/?location=Daggerfall&${q}`;
    const ready = () => page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Daggerfall', timeoutMs: 120000 });
    const menuText = () => page.evalJs('document.getElementById("menu")?.textContent ?? ""');
    const menuState = () => page.evalJs('window.__debug.menuState()');
    const characterName = () => page.evalJs('JSON.parse(localStorage.getItem("perfectarena.character") ?? "null")?.name ?? null');

    // ── somebody to be, and a street to stand in ──────────────────────────────
    // The menu is reached from a page that already has a character, so the suite starts
    // where a player does — creation first. Quietly: `chargen`'s own suite clicks every
    // step, and what matters here is only that there is someone on the sheet.
    await page.goto(`http://localhost:${getPort()}/?chargen&${q}`);
    await page.waitFor('window.__debug?.scene === "chargen" || !!window.__bootError', { label: 'creation', timeoutMs: 120000 });
    await page.evalJs('window.__debug.answerAll("a")');
    await page.evalJs('JSON.stringify(window.__debug.describe({ name: "Testament", raceId: "redguard" }))');
    const made = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.finish())') ?? '{"ok":false}');
    check('a character to open the menu with', made.ok === true && made.character?.name === 'Testament', made.character?.name);
    await page.goto(city);
    await ready();
    const folder = await page.evalJs('window.__debug.arenaSource');
    check('and the Arena folder this run is reading from', typeof folder === 'string' && folder.length > 0, String(folder));

    // ── Escape, and everything stops ─────────────────────────────────────────
    //
    // Escape backs out of whatever is up *before* it opens anything, and a fresh arrival
    // has the page that names the place standing: so the first press is for that page and
    // the second is for the menu. That order is the rule, not an accident — a player who
    // wants out of a conversation must not be handed a menu on the way out of it.
    const arrival = await page.evalJs('document.getElementById("arrival")?.classList.contains("on") ?? false');
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle();
    check('Escape backs the arrival page out first, as it does out of any panel',
      arrival === false || (await menuState()).open === false, `arrival page was ${arrival ? 'up' : 'not up'}`);
    if (arrival) {
      await page.pressKey('Escape');
      await page.pressKey('Escape', false);
      await settle();
    }
    const opened = await menuState();
    check('Escape opens the menu', opened?.open === true,
      JSON.stringify({ open: opened?.open, paused: opened?.paused }));
    check('and it is really on screen, over the world',
      (await page.evalJs('getComputedStyle(document.getElementById("menu")).display')) === 'grid',
      `display ${await page.evalJs('getComputedStyle(document.getElementById("menu")).display')}`);

    const stopped = await page.evalJs('window.__debug.state()');
    check('the world behind it is stopped', stopped.paused === true, `paused=${stopped.paused}`);
    // Painting continues — the canvas is not blank and the scene is not wedged — which is
    // why this is `frames` and not `painted`: the simulation is what stops.
    let painting = false;
    for (let i = 0; i < 25 && !painting; i++) {
      await settle(60);
      painting = (await page.evalJs('window.__debug.state().painted')) > stopped.painted;
    }
    const still = await page.evalJs('window.__debug.state()');
    check('and the picture goes on being painted while it is up',
      painting && still.frames === stopped.frames && still.painted >= stopped.painted,
      `frames ${stopped.frames} → ${still.frames}, painted ${stopped.painted} → ${still.painted}`);

    await page.pressKey('KeyW');
    const held = await page.evalJs('window.__debug.keys()');
    await page.pressKey('KeyW', false);
    check('the keys are dead while it is up: nothing reaches the world behind it',
      !held.includes('KeyW'), JSON.stringify(held));
    await page.screenshot(path.join(shots, 'm7-menu.png'));

    // ── what the panel says ───────────────────────────────────────────────────
    const panel = await menuText();
    check('the menu is the character\'s own page: their name, their level, their purse',
      /Testament/.test(panel) && /level 1/.test(panel) && /\d+ gold/.test(panel) && /health/.test(panel),
      panel.split('\n').map((l) => l.trim()).filter(Boolean).slice(1, 3).join(' | ').slice(0, 200));
    check('it names the place the player is standing in', /Daggerfall — paused/.test(panel),
      panel.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '');
    const quest = await page.evalJs('window.__debug.quest()');
    check('and carries the main quest\'s own objective, word for word',
      panel.includes(quest.objective), `"${quest.objective}"`);
    check('the job in hand is on it, or the game says there is none',
      /Side work:/.test(panel) || /No side work in hand/.test(panel), '');
    check('so is who knows the player, straight from the ledger',
      /Who knows you:/.test(panel), /Who knows you:[^\n]*/.exec(panel)?.[0] ?? '');
    check('and the three things a player can do with it',
      /Resume/.test(panel) && /Controls/.test(panel) && /New Game/.test(panel),
      JSON.stringify((await menuState())?.rows ?? null));

    // ── the controls, by click ────────────────────────────────────────────────
    const hidden = await page.evalJs('getComputedStyle(document.querySelector("#menu .controls")).display');
    await page.clickSelector('#menu button[data-menu="controls"]');
    const shown = await page.evalJs('getComputedStyle(document.querySelector("#menu .controls")).display');
    const listed = await menuText();
    check('Controls prints the keys a player has forgotten, on demand',
      hidden === 'none' && shown !== 'none' && /W A S D/.test(listed) && /Esc/.test(listed),
      `${hidden} → ${shown}`);
    check('including the ones this milestone added, and only real ones',
      /first or third person/.test(listed) && /talk to whoever is in front of you/.test(listed),
      listed.split('\n').map((l) => l.trim()).filter((l) => /^[EWMFIVB\]]/.test(l)).slice(0, 4).join(' · '));
    await page.clickSelector('#menu button[data-menu="controls"]');
    check('and puts them away again',
      (await page.evalJs('getComputedStyle(document.querySelector("#menu .controls")).display')) === 'none');

    // ── Escape closes it, and the world runs on ───────────────────────────────
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle();
    const closed = await menuState();
    check('Escape again puts it away, and the world starts again',
      closed.open === false && closed.paused === false, JSON.stringify({ open: closed.open, paused: closed.paused }));
    const run1 = await page.evalJs('window.__debug.state()');
    await settle(300);
    const run2 = await page.evalJs('window.__debug.state()');
    check('the clock is moving: the frame count grows again', run2.frames > run1.frames, `${run1.frames} → ${run2.frames}`);
    check('and nothing was lost by opening it', (await characterName()) === 'Testament');

    // ── New Game asks first, and can be refused ───────────────────────────────
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle();
    await page.clickSelector('#menu button[data-menu="newgame"]');
    const asked = await menuState();
    check('New Game asks before it takes a character away',
      asked.confirm === true && /cannot be undone/.test(await menuText()), JSON.stringify(asked.rows));
    await page.screenshot(path.join(shots, 'm7-menu-confirm.png'));
    await page.clickSelector('#menu .confirm button[data-menu="resume"]');
    const kept = await menuState();
    check('Keep playing puts the menu away and keeps the character',
      kept.open === false && (await characterName()) === 'Testament' && (await page.evalJs('window.__debug.state().scene')) === 'interior',
      `open=${kept.open}, saved=${await characterName()}`);

    // ── begin a new game ─────────────────────────────────────────────────────
    await page.pressKey('Escape');
    await page.pressKey('Escape', false);
    await settle();
    await page.clickSelector('#menu button[data-menu="newgame"]');
    await page.clickSelector('#menu .confirm button[data-menu="newgame-confirm"]');
    await page.waitFor('window.__debug?.scene === "chargen" || !!window.__bootError', { label: 'creation after New Game', timeoutMs: 120000 });
    const bootError = await page.evalJs('window.__bootError || null');
    check('Begin a new game goes back to character creation without a boot error',
      !bootError, bootError ? String(bootError).slice(0, 300) : '');

    const fresh = await page.evalJs('window.__debug.state()');
    check('the character is gone — creation is being asked for one, not shown one',
      fresh.scene === 'chargen' && fresh.hasCharacter === false && fresh.saved === false,
      JSON.stringify({ scene: fresh.scene, hasCharacter: fresh.hasCharacter, saved: fresh.saved }));
    const wiped = await page.evalJs(`JSON.stringify({
      character: localStorage.getItem("perfectarena.character"),
      quest: localStorage.getItem("perfectarena.quest"),
      radiant: localStorage.getItem("perfectarena.radiant"),
      regard: localStorage.getItem("perfectarena.regard"),
      lastLocation: localStorage.getItem("perfectarena.lastLocation"),
    })`);
    check('and every key the game owns is forgotten, not just the sheet',
      Object.values(JSON.parse(wiped)).every((v) => v === null), wiped.slice(0, 200));
    // The URL has to tell the truth, because a player who reloads must land where they are:
    // in creation now, on the map once they are out (`scenes/newGame.js`).
    check('the address bar follows the flow, so a reload lands in creation',
      /chargen/.test(await page.evalJs('location.search')), await page.evalJs('location.search'));
    check('and the Arena folder the player opened is still the one in use',
      (await page.evalJs('window.__debug.arenaSource')) === folder,
      `${await page.evalJs('window.__debug.arenaSource')}`);

    // ── a new character, out to the world ────────────────────────────────────
    await page.evalJs('window.__debug.answerAll("a")');
    await page.evalJs('JSON.stringify(window.__debug.describe({ name: "Agamemnon", raceId: "nord" }))');
    const remade = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.finish())') ?? '{"ok":false}');
    check('a new character can be made without the folder picker ever coming back',
      remade.ok === true && remade.character?.name === 'Agamemnon' && remade.character?.gold === 0,
      `${remade.character?.name}, ${remade.character?.gold} gold`);
    // "Enter Tamriel" is the same button a player presses — and it is creation's *exit*, so
    // the flow that started in the menu continues: creation is not a destination. (The
    // sheet is asked for by the seam above rather than clicked through; `chargen`'s own
    // suite does that clicking, and what is being proved *here* is the exit.)
    await page.evalJs('window.__debug.gotostep("done")');
    await page.clickSelector('#chargen-panel #cg-play');
    await page.waitFor('window.__debug?.scene === "worldmap" || !!window.__bootError', { label: 'the world map after creation', timeoutMs: 120000 });
    check('and Enter Tamriel lands the new character on the world map, in the same page',
      (await page.evalJs('window.__debug?.scene')) === 'worldmap' && /(^|[?&])map/.test(await page.evalJs('location.search')),
      await page.evalJs('location.search'));

    const chain = await page.evalJs('window.__debug.chain()');
    const world = await page.evalJs('JSON.stringify({ quest: window.__debug.quest(), regard: window.__debug.regard().tally, day: window.__debug.state().day })');
    const started = JSON.parse(world);
    check('the new game starts from nothing: the first stage, no pieces, nothing visited, an empty journal',
      started.quest.stage === chain[0].title && started.quest.pieces === 0
      && started.quest.visited.length === 0 && started.quest.entries.length === 0,
      `${started.quest.stage} · ${started.quest.pieces} pieces · ${started.quest.entries.length} entries`);
    check('the world has never heard of the new character',
      started.regard.known === 0 && started.regard.friends === 0 && started.regard.hostile === 0,
      JSON.stringify(started.regard));
    check('and the calendar is back to its first day', started.day === 1, `day ${started.day}`);

    // ── the map's own door, and that its button can be pressed ───────────────
    // The sheet is `pointer-events: none` so clicks fall through it to the markers behind
    // it, so the new-game button has to opt back in. A click *here* is the proof: it is a
    // real press at the button's own coordinates.
    check('the map offers the same door on its sheet', await page.evalJs('!!document.getElementById("map-newgame")'));
    await page.clickSelector('#map-newgame');
    check('and it asks first, with its own warning on the sheet',
      (await page.evalJs('!!document.getElementById("map-newgame-yes")')) === true,
      await page.evalJs('document.getElementById("map-sheet").textContent.slice(-160)'));
    await page.screenshot(path.join(shots, 'm7-map-newgame.png'));
    await page.clickSelector('#map-newgame-no');
    check('backing out of it leaves the new character alone',
      (await page.evalJs('!!document.getElementById("map-newgame")')) === true
      && (await characterName()) === 'Agamemnon',
      await characterName());

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
