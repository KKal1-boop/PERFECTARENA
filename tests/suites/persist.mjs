// Suite: the world's own clock — **the first half of a persistent world** (B19, D-05).
//
//   node tests/run-browser.mjs persist
//
// The owner, twice, in his own words: *"you dont understand where you are going"* and *"there is no
// persistency in the world like instead there is in daggerfall enhanced"*. `docs/DEFECTS.md`'s D-05
// says what was found: a door, a gate and a stair are **not** page loads (`goInPlace` re-boots the
// scene in the same document), so `window.__auditMark` survives them — and the world's record
// (`game/worldState.js`) already carries the doors, the loot, the kills, the standings and the quest
// stages across every one of them. What it did **not** carry was the hour: a level's clock is built
// from `?clock=` or a default of ten in the morning (`interior.js`'s `arrivalMinutes`) plus the
// seconds *that page* has been standing, so every place change and every reload put the world back at
// breakfast. A player who left a town at dusk walked into the next one at ten in the morning, for
// ever, and no check in the twenty-three suites had ever held the clock across a transition.
//
// So this suite is written against the *transition*, which is the only place the claim can be made:
//
//   1. a world that has never kept an hour still arrives at ten in the morning (nothing regressed —
//      `living` holds the shutters to that hour and still does);
//   2. **an arrival is not a memory**: `?clock=` is obeyed and, being an instruction about arriving
//      rather than a fact about the world, it is not written down (D-32's own law, applied to the
//      hour — and the reason a probe cannot corrupt the world it is measuring);
//   3. **the hour crosses the gate with the player**, measured on the country page that the walk
//      boots, and written into the world's own record (`worldMemory().clock`);
//   4. **a full page load comes back at that hour** rather than at ten in the morning — a tab closed
//      and reopened, which is what the owner was really reporting;
//   5. and a settlement opened bare afterwards is at the world's hour too.
//
// The walk is the `movement` suite's own recipe (aim at the gate's inward cell and hold `W`), because
// the point of this suite is a *real* transition: no `?at=`, no fast travel, no debug leap.

import path from 'node:path';

/**
 * How long the walk at the gate holds `W`, in milliseconds — the `movement` suite's own leg, held
 * with room to spare. The crossing itself is the game's own rule (a step past the last cell of the
 * city boots the country), and on this machine it lands between 1.5 s and 1.75 s of walking from the
 * gate's inward cell; a hold sized to the crossing rather than to the frame rate is what keeps this
 * check measuring the transition instead of the renderer's speed (D-26's own lesson: a suite that
 * measures the machine reports the machine).
 */
const GATE_WALK_MS = 2800;

export function makePersistSuite({ check, realErrors, shots, getPort }) {
  return async function suitePersist(page) {
    const PORT = getPort();
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const city = (extra = '') => `http://localhost:${PORT}/?location=Daggerfall&${q}${extra}`;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    /** A save the suite owns: every claim here is about a world that begins empty. */
    const clear = () => page.evalJs('try { localStorage.clear(); } catch (e) { null; }');
    const ready = (label) => page.waitFor(
      'window.__debug?.scene === "interior" && window.__debug.state().painted > 5',
      { label, timeoutMs: 120000 },
    );
    /** The level's own clock: the hour this page is standing at, as the HUD and the shutters read it. */
    const clock = () => page.evalJs('window.__debug.living().clock');
    /** The world's own record, as the debug seam reports it (`{places, doors, …, clock}`). */
    const memory = async () => JSON.parse(await page.evalJs('JSON.stringify(window.__debug.worldMemory())') ?? 'null');
    /** The hour the *world* keeps, or null when it has never kept one. */
    const worldHour = async () => (await memory())?.clock ?? null;
    /**
     * The evening the suite leaves the city at: 22:10 (`?clock=1330`), or any minute of the
     * twenty-second hour afterwards. The **hour** is the claim — a window of minutes would only be
     * measuring how long the machine took — and `600` is named because it is what every page load
     * used to answer.
     */
    const evening = (c) => Boolean(c) && c.hour === 22 && c.minutes >= 1330;

    // ── 1. ten in the morning is still where a world with no hour begins ───────
    //
    // The check the `living` suite has held since the clock was written, restated here as this
    // suite's own baseline: a new save that has never had an hour written to it arrives at ten.
    // (Without this line, "the hour persists" could be bought by making every arrival midnight.)
    await clear();
    await page.goto(city());
    await ready('the first morning');
    await page.evalJs('window.__debug.pause(false)');
    const first = await clock();
    check('a world that has never kept an hour still arrives at ten in the morning',
      first?.hour === 10 && first?.minute < 30,
      JSON.stringify(first ?? null));

    // ── 2. an arrival is an instruction, not a memory ─────────────────────────
    await clear();
    await page.goto(city('&clock=1330'));
    await ready('Daggerfall, ten past ten at night');
    const forced = await clock();
    const atArrival = await memory();
    check('the URL\'s own hour is obeyed on arrival — `?clock=1330` is twenty past ten at night',
      forced?.minutes === 1330 && forced?.phase === 'night',
      JSON.stringify(forced ?? null));
    // The world's record **is** being written at this moment (the visit is what `loadLevel` records),
    // which is what makes the next line a claim about the clock rather than about storage.
    check('and the place the player is standing in is written down with it',
      (atArrival?.places ?? 0) >= 1,
      `${atArrival?.places ?? 0} place(s), ${atArrival?.doors ?? 0} door(s), ${atArrival?.kills ?? 0} kill(s)`);
    check('…but the arrival hour is not: an instruction about arriving is not a fact about the world (D-32)',
      atArrival?.clock === null,
      JSON.stringify(atArrival?.clock ?? null));

    // ── 3. the hour crosses the gate with the player ──────────────────────────
    //
    // The transition this suite exists for: a real walk out of the city, which boots the country
    // page through `goInPlace` — the same door a stairway, a shop door, a fast travel and a
    // wilderness slide take. Aim at the gate's own inward cell and hold `W` (`movement`'s recipe;
    // `x` is the row, `z` the column, and the motor moves by `mx = sin(yaw)`, `mz = cos(yaw)`).
    const size = await page.evalJs('window.__debug.state().size');
    const gate = await page.evalJs('window.__debug.gateCells(1)[0]');
    check('the city has a gate to leave by, and the game knows which cell it is',
      Boolean(gate) && Number.isInteger(gate?.row) && Number.isInteger(gate?.col),
      gate ? `the opening is at ${gate.row},${gate.col} of ${size[0]}×${size[1]}` : 'no gate cell at all');
    const inwardRow = gate.row === size[1] - 1 ? -1 : gate.row === 0 ? 1 : 0;
    const inwardCol = gate.col === size[0] - 1 ? -1 : gate.col === 0 ? 1 : 0;
    const outYaw = inwardCol === 1 ? Math.PI : inwardCol === -1 ? 0 : inwardRow === 1 ? -Math.PI / 2 : Math.PI / 2;
    await page.evalJs(`window.__debug.teleportCell(${gate.row + inwardRow}, ${gate.col + inwardCol})`);
    await sleep(300);
    await page.evalJs(`window.__debug.look(${outYaw}, 0)`);
    await sleep(150);
    await page.pressKey('KeyW', true);
    await sleep(GATE_WALK_MS);
    await page.pressKey('KeyW', false);
    // The crossing *is* a page: wait for the country page's own answer, not for a timer. (`state().wild`
    // is the wilderness window's own record, not a flag — `null` in a city, truthy out of doors.)
    const crossed = await page.waitFor('Boolean(window.__debug.state().wild)', { label: 'the country at dusk', timeoutMs: 90000 })
      .then(() => true).catch(() => false);
    const outside = await page.evalJs('({ wild: Boolean(window.__debug.state().wild), map: window.__debug.state().map })');
    check('the player walked out of the city — the transition the hour has to survive',
      crossed && outside.wild === true,
      `${outside.map} → ${outside.wild ? 'the country' : 'still the city'}`);
    const country = await clock();
    const carried = await worldHour();
    check('the hour the player left at is the hour the country opens on — **not** ten in the morning',
      evening(country),
      `${JSON.stringify(country ?? null)} (ten in the morning would be 600 minutes)`);
    // The world's own record keeps a day and a minute and no hour (an hour is a reading of the
    // minute), so the window is in minutes: the evening it was left at, with a day of its own.
    check('and the world keeps the hour itself, with a day of its own',
      Number.isInteger(carried?.minutes) && carried.minutes >= 1330 && carried.minutes < 1380
      && Number.isInteger(carried?.day) && carried.day >= 1,
      `${JSON.stringify(carried ?? null)} — the crossing was at 22:10 at the earliest, and a day is kept too (600 was ten in the morning)`);

    // ── 4. a tab closed and reopened is the same hour ─────────────────────────
    //
    // A full page load of the country's own URL — no `?clock=` anywhere in it, which is the whole
    // point: this is the player who closed the tab at dusk and came back to it.
    const countryUrl = await page.evalJs('location.href');
    await page.goto(countryUrl);
    await ready('the country again');
    const reopened = await clock();
    check('a full page load of the same place comes back at the same hour',
      evening(reopened),
      `${countryUrl} → ${JSON.stringify(reopened ?? null)}`);
    check('…and not at ten in the morning, which is what every page load answered before B19',
      reopened?.minutes !== 600 && reopened?.minutes >= 1330,
      `${reopened?.hour}:${String(reopened?.minute ?? 0).padStart(2, '0')} (${reopened?.minutes} minutes past midnight)`);

    // ── 5. and the next place is at that hour too ─────────────────────────────
    //
    // A settlement booted **bare**: no `?clock=`, no `?at=` — the URL a player's own travel builds.
    // D-32 says a bare `?location=` opens the country on the remembered wilderness cell; whichever
    // map this lands on, the hour it lands at is the world's.
    await page.goto(city());
    await ready('the city again');
    const later = await clock();
    check('a place opened bare — no hour in the URL at all — is at the world\'s hour, not at ten',
      evening(later),
      JSON.stringify(later ?? null));

    // ── 6. and the world remembers the corner the player was standing on ──────
    //
    // `worldState`’s `player` field — the second of the world half’s two loose fields, written by the
    // same events as the hour. A page that names **no cell of its own** (no `?at=`, no `?wild=`, no
    // `?enter=` — the tab closed and reopened, the last place restored from the save) asks the world
    // where the player stood, so the game reopens on their own corner rather than on the level’s own
    // spawn point. The save is the world’s slow tick, so this waits for it rather than pressing a key.
    //
    // **A fixture of its own, from an empty save.** The five checks above leave a wilderness memory
    // behind (the walk out of the gate wrote one), and D-32 says a bare `?location=` opens the
    // country on that cell — so a check read off their pages would be measuring *that* place and
    // comparing a country cell with a street one (which is exactly how the first version of this
    // check read a correct memory as a wrong one: the player had been carried out of the east gate by
    // a walker, and both ends of the comparison were the country). Cleared, the only thing the page
    // can read back is what this check itself wrote.
    await clear();
    await page.goto(city());
    await ready('a city with an empty world again');
    /** Feet (metres) to the cell the motor's own convention names. */
    const cellOf = (feet) => [Math.round(feet[0] / 2.5 - 0.5), Math.round(feet[2] / 2.5 - 0.5)];
    /** Which place a page is standing in, as the page itself reports it (`wild` is null in a city). */
    const placeOf = () => page.evalJs("window.__debug.state().map + (window.__debug.state().wild ? ' (country)' : ' (city)')");
    const spawn = await page.evalJs("window.__debug.state().feet");
    const TARGET = [30, 40];
    await page.evalJs("window.__debug.teleportCell(" + TARGET[0] + ", " + TARGET[1] + ")");
    // **Wait for the world's own slow tick, not for a wall clock.** `rememberClock` runs every
    // `CLOCK_SAVE_EVERY` (20) *simulated* seconds and the frame step caps `dt` at 0.1 s
    // (`interior.js`: `Math.min(0.1, …)`), so on a software renderer — where a city page uploads its
    // textures at a handful of frames a second — twenty simulated seconds arrive later than twenty
    // wall seconds. The first version of this check slept 21 s and then read the **level's own
    // spawn** instead of the corner, which the run of 2026-10-16 measured: the save's `player` field
    // (`perfectarena.world`) appears at simulated second 20, which on this machine was wall second 25.
    // So the wait is for the *fact* — the save naming the cell the player is standing on — with a
    // bound, rather than for a duration that happens to be long enough on a fast machine.
    const savedCell = () => page.evalJs(`(() => {
      try {
        const w = JSON.parse(localStorage.getItem('perfectarena.world')) || {};
        return w.player ? [w.player.row, w.player.col] : null;
      } catch (e) { return null; }
    })()`);
    let wroteAfter = null;
    for (let waited = 0; waited <= 90000; waited += 1000) {
      const cell = await savedCell();
      if (cell && cell[0] === TARGET[0] && cell[1] === TARGET[1]) { wroteAfter = waited / 1000; break; }
      await sleep(1000);
    }
    check('the world writes the corner the player stands on, on its own slow tick',
      wroteAfter !== null,
      wroteAfter === null
        ? 'the save never named ' + JSON.stringify(TARGET) + ' within 90 s'
        : 'the save named ' + JSON.stringify(TARGET) + ' after ' + wroteAfter.toFixed(1) + ' s');
    // **Where they were standing when the page was left**, read after the tick rather than assumed
    // from the teleport: what the world writes is the ground the player stood on, and a player who
    // was carried off it by a walker (D-47, fixed in the same pass) made this check read a correct
    // memory as a wrong one. The teleported cell is still held to as a second claim, because a
    // standing player *staying* where they were put is the other half of the same law.
    const left = cellOf(await page.evalJs("window.__debug.state().feet"));
    const leftPlace = await placeOf();
    // The URL a bookmark of this place holds: the place and the install, and **no cell of its own** —
    // no `?at=`, no `?wild=`, no `?enter=`, no `?clock=`. (A bare root is not this page at all: it
    // boots the menu rather than a world, which is what the first version of this check timed out on.)
    await page.goto(city());
    await ready("the same town, reopened");
    const nowPlace = await placeOf();
    const reopened2 = await page.evalJs("window.__debug.state()");
    const now = cellOf(reopened2.feet);
    const toLeft = Math.hypot(now[0] - left[0], now[1] - left[1]);
    const toTarget = Math.hypot(now[0] - TARGET[0], now[1] - TARGET[1]);
    const toSpawn = Math.hypot(now[0] - cellOf(spawn)[0], now[1] - cellOf(spawn)[1]);
    check("a page that names no cell puts the player back on the corner the world remembers",
      leftPlace === nowPlace && toLeft <= 1 && toLeft < toSpawn && toTarget <= 2,
      "reopened at " + JSON.stringify(now) + " in " + nowPlace + " (left from " + leftPlace + "): "
      + toLeft.toFixed(1) + " cells from the corner they left (" + JSON.stringify(left) + "), "
      + toSpawn.toFixed(1) + " from the spawn " + JSON.stringify(cellOf(spawn))
      + ", and " + toTarget.toFixed(1) + " from the cell they were put on (" + JSON.stringify(TARGET)
      + (toTarget > 2 ? " — a standing player was moved off it, D-47" : ""));
    await page.screenshot(path.join(shots, 'persist-the-hour.png'));
    check('the persist suite leaves no console error behind', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400) || 'none');
  };
}
