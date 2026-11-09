// A QUEST'S OWN MARKS ON A REAL PAGE: the riddle door, and the country job.
//
//   node tests/run-browser.mjs questmarks
//
// Two reports of 2026-10-21, both about the world telling the player where to go:
//
//   * *"the main quest dungeons should have working keys and puzzles that are not working"* —
//     the install's quest dungeons seal doors with a sign and a riddle in their own `.INF`
//     (`^` answers), and the port read the riddle as a line of prose and then let the door be
//     forced. `unit/doors.test.mjs` holds the law (the door beside its sign, the file's own
//     answer, no key minted for it); this file holds the **page**: standing at the door, `E`
//     asks the question, a wrong answer keeps it shut, the right one opens it.
//   * *"the game has difficulty pointing you towards and spawning the sprite of the enemies you
//     need to fight for the quest … even if you're close to their supposed position"* — a
//     country job is 130–175 cells out of its anchor's gate and the country's window re-centres
//     as the player walks, so the level a job was *built* in never held the quarry. This boots a
//     job whose cell is outside the first window, walks the window to it, and asks for the
//     three creatures and the HUD's own bearing.
//
// The pure halves are `tests/unit/doors.test.mjs` and `tests/unit/radiant.test.mjs`; nothing
// here repeats their arithmetic.

import { ArenaData } from '../../src/arena/arenaData.js';
import { nodeSource } from '../../tools/lib/nodeSource.mjs';
import { loadWorldMap } from '../../src/game/worldMap.js';
import { loadArenaText } from '../../src/arena/arenaText.js';
import { applyRadiantEvent, createRadiantState, generateQuest } from '../../src/game/radiantQuests.js';
import { pixelOfCell, WORLD_GRID_VERSION } from '../../src/game/tamrielGrid.js';

export function makeQuestMarksSuite({ check, realErrors, shots, getPort }) {
  return async function suiteQuestMarks(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const ready = () => page.waitFor('window.__debug?.state && window.__debug.state().painted > 3', {
      timeoutMs: 90000, label: 'a level',
    });
    // **A country page is recognised by its own frame, not by "a level is painted".** The
    // suite used to ask only for frames, and a document that is still the previous level can
    // answer that question for a moment during a navigation. `state().wild` is the country's
    // own record — it cannot exist on a dungeon page — so the wild boots below wait for it.
    const readyWild = async () => {
      // `state().wild` speaks in the world grid's own field names (`originRow`/`originCol`).
      const where = 'window.__debug?.state && window.__debug.state().painted > 3'
        + ' && window.__debug.state().wild?.originRow != null';
      try {
        await page.waitFor(where, { timeoutMs: 90000, label: 'a country window' });
      } catch (err) {
        const seen = await page.evalJs(`JSON.stringify({ href: location.href, boot: window.__bootError || null,
          map: window.__debug?.state?.().map ?? null, painted: window.__debug?.state?.().painted ?? null,
          wild: window.__debug?.state?.().wild ?? null, errors: window.__debug?.pageErrors ?? [] })`).catch(() => 'unreadable');
        throw new Error(`${err.message}; ${String(seen).slice(0, 600)}`);
      }
    };
    const key = async (code) => {
      await page.pressKey(code, true);
      await page.pressKey(code, false);
    };

    // ── 1. THE RIDDLE DOOR ──────────────────────────────────────────────────
    // Black Gate's second level: the sign at (62,84) asks *"This door is sealed tight. A
    // question is carved above it."* and its answer is rain (id 0 of `bgate2.inf`). The door it
    // speaks for is the `0xB` cell at (63,84), lock 255 — no hand can force it.
    await page.goto(`http://localhost:${getPort()}/?interior=39950681.MIF&level=2&${q}`);
    await ready();
    // Stand on the sign's own cell, facing the door, and press E as a player would.
    await page.evalJs('window.__debug.teleportCell(62, 84)');
    await page.evalJs('window.__debug.look(0, 0)');
    await page.evalJs('window.__debug.pause(true)');
    await key('KeyE');
    const asked = await page.evalJs('window.__debug.riddle()');
    check('E at a sealed door asks the sign’s own riddle, not "needs a key"',
      asked?.shown === true && /sealed tight/i.test(String(asked?.text ?? ''))
        && asked?.doors?.some((door) => door.row === 63 && door.col === 84 && door.lock === 255)
        && asked?.doors?.every((door) => door.locked === true),
      JSON.stringify(asked).slice(0, 300));

    const wrong = await page.evalJs('window.__debug.answerRiddle("sand")');
    const afterWrong = await page.evalJs('window.__debug.riddle()');
    check('a wrong answer keeps the door shut, and the sign says the file’s own refusal',
      wrong === false && afterWrong?.asking === true && String(afterWrong?.wrong ?? '').length > 0
        && afterWrong?.doors?.every((door) => door.locked === true),
      JSON.stringify({ wrong, afterWrong }).slice(0, 300));

    const right = await page.evalJs('window.__debug.answerRiddle("Rain")');
    const afterRight = await page.evalJs('window.__debug.riddle()');
    check('the install’s own answer opens it: the panel closes and the door is unbarred',
      right === true && afterRight?.shown === false && afterRight?.result?.result === 'solved'
        && afterRight?.result?.doors?.includes('63,84'),
      JSON.stringify({ right, afterRight }).slice(0, 300));
    await page.evalJs('window.__debug.pause(false)');
    await page.waitFor('window.__debug.state().lastDoor?.result === "opened" || window.__debug.state().lastDoor?.result === "key"',
      { timeoutMs: 5000, label: 'the riddle door swung' }).catch(() => {});
    // The door's record is on the scene's own state (`state().lastDoor`), not at the top of
    // `__debug` — the check read `window.__debug.lastDoor` and so read `null` on every run.
    const doorNow = await page.evalJs('window.__debug.state().lastDoor ?? null');
    check('and the door the player was standing at swings on the same press',
      doorNow?.row === 63 && doorNow?.col === 84,
      JSON.stringify(doorNow).slice(0, 200));
    await page.screenshot(pathSafe(shots, 'riddle-door.png')).catch(() => {});

    // ── 2. THE COUNTRY JOB ─────────────────────────────────────────────────
    const data = new ArenaData(nodeSource(arena), { onWarn: () => {} });
    const world = await loadWorldMap(data);
    const library = await loadArenaText(data);
    const giver = world.byName('Daggerfall');
    const offer = generateQuest({ world, library, kind: 'hunt', seed: 0x5eed, giver, day: 1 });
    check('the board draws a country job to test (its target is a world cell)', offer.targetKind === 'wild'
      && Number.isFinite(offer.targetCell?.row) && Number.isFinite(offer.targetCell?.col),
      JSON.stringify({ kind: offer.kind, target: offer.target, cell: offer.targetCell }).slice(0, 240));
    const state = applyRadiantEvent(createRadiantState(), 'accept', { offer }).state;
    const target = offer.targetCell;
    const provinceID = world.byName(offer.targetAnchor)?.provinceID ?? giver.provinceID;
    // A start **100 cells from the cell**, in the first direction that is land at both ends.
    // 100 > the window's 64-cell radius, so the job's quarry cannot be in the first window —
    // which is the report: the player walks to the spot and nothing is there.
    const land = (row, col) => {
      const point = pixelOfCell(row, col);
      return Boolean(world.provinceAtWorld(point)) && world.landAt(point, provinceID);
    };
    let start = null;
    // **The window's own 32-cell guarantee.** `wilderness.js`'s `wildernessWindowOrigin` snaps a
    // window to a block, so a player stands 32…95 cells into it; any cell within **32** of them is
    // therefore always inside the window they are standing in, and anything further is a coin
    // flip on the snap. This walk stops 30 out, which is the closest a test can come without
    // testing the snap itself.
    const approach = 30;
    // **The stop is 30 from the *job*, not 30 from the start.** The start is 100 out, so the walk
    // toward it covers 70 cells and the remaining 30 is the point the window is asked about.
    const inward = 100 - approach;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const row = target.row + dr * 100;
      const col = target.col + dc * 100;
      if (land(row, col) && land(row - dr * inward, col - dc * inward)) {
        start = { row, col, dr, dc };
        break;
      }
    }
    check('a stretch of country 100 cells from the job is land', Boolean(start), JSON.stringify(start));
    if (!start) return;
    const mid = { row: start.row - start.dr * inward, col: start.col - start.dc * inward };

    // **`grid=2` is what makes the cell a Tamriel cell.** A `?wild=` without it is a legacy
    // per-settlement coordinate and the page migrates it onto the world grid — which moved this
    // start a thousand cells away from the job, so the quarry could never be found. Every link
    // the game itself writes carries the grid (`worldmap.js`'s `travelUrl`); the suite must
    // speak the same URL a marker click does.
    const wildUrl = `http://localhost:${getPort()}/?wild=${start.row},${start.col}&grid=${WORLD_GRID_VERSION}&${q}`;
    await page.goto(wildUrl);
    await readyWild();
    await page.evalJs(`localStorage.setItem('perfectarena.radiant',${JSON.stringify(JSON.stringify(state))})`);
    await page.goto(wildUrl);
    await readyWild();
    await page.evalJs('window.__debug.pause(true)');
    const firstWindow = await page.evalJs('({camp: window.__debug.state().radiantCamp ?? null, job: window.__debug.side(),'
      + ' bounties: window.__debug.combat().monsters.filter((m) => m.bounty).length,'
      + ' origin: window.__debug.state().wild ? [window.__debug.state().wild.originRow, window.__debug.state().wild.originCol] : null})');
    check('the job’s quarry is not in the window the player first walks into',
      firstWindow?.bounties === 0 && firstWindow?.camp === null,
      JSON.stringify(firstWindow).slice(0, 300));
    const before = await page.evalJs('document.getElementById("hud-quest")?.textContent ?? ""');
    check('the HUD points at the spot anyway, with a bearing and its paces',
      /paces|under your feet/.test(before) && /the spot/i.test(before),
      JSON.stringify(before).slice(0, 240));

    // Walk the window to the job (a teleport is a walk the scene's own slide sees).
    await page.evalJs('window.__debug.pause(false)');
    // A slide is measured in the window's own cells; `teleportCell` speaks the level's. The
    // window is 128 cells on a side and centred, so the world cell minus the origin is the
    // level cell — the same arithmetic `wilder` uses when it slides.
    const origin = await page.evalJs('window.__debug.state().wild');
    await page.evalJs(`window.__debug.teleportCell(${mid.row - origin.originRow}, ${mid.col - origin.originCol})`);
    // **The slide this teleport asks for**, not whichever one the page already ran: a page can
    // slide at boot (its first frame re-centres on the gate), so `doneAt` being set proves
    // nothing — the record has to name the cell the player was just put on.
    await page.waitFor(`window.__debug.state().windowSlide?.doneAt?.row === ${mid.row}`, { timeoutMs: 30000, label: 'the window slide' })
      .catch(() => {});
    await page.waitFor('window.__debug.combat().monsters.some((m) => m.bounty)', { timeoutMs: 15000, label: 'the quarry' })
      .catch(() => {});
    const arrived = await page.evalJs('({camp: window.__debug.state().radiantCamp ?? null,'
      + ' bounties: window.__debug.combat().monsters.filter((m) => m.bounty).map((m) => ({ name: m.name, health: m.health, cell: m.cell, id: m.bounty.encounterId })),'
      + ' objective: window.__debug.objective()})');
    const quarry = arrived?.bounties ?? [];
    // **A creature's cell is the window's, the job's cell is the world's.** The seam reports the
    // level cell a body stands on; the job's own is a Tamriel cell, so the comparison is made in
    // the window that is now standing (`state().wild`'s origin) rather than across the two.
    const afterOrigin = await page.evalJs('window.__debug.state().wild');
    const localTarget = { row: target.row - afterOrigin.originRow, col: target.col - afterOrigin.originCol };
    const near = quarry.filter((monster) => Math.max(Math.abs((monster.cell?.row ?? 1e9) - localTarget.row),
      Math.abs((monster.cell?.col ?? 1e9) - localTarget.col)) <= 8).length;
    check('the window that reaches the spot fields the three creatures the job asks for',
      quarry.length === 3 && near === 3 && arrived?.camp?.spawned >= 0,
      JSON.stringify(arrived).slice(0, 600));
    check('and the job’s own mark is placed, on ground a body can stand on',
      arrived?.objective?.wild === true && arrived?.objective?.dry === true,
      JSON.stringify(arrived?.objective ?? null).slice(0, 300));
    await page.screenshot(pathSafe(shots, 'wild-job-camp.png')).catch(() => {});

    // ── 3. THE RESCUE'S CAPTIVE ────────────────────────────────────────────
    // The owner, 2026-10-22: *"sprites of people you need to rescue in the wilderness dont
    // properly spawn or persist and result invisible"*. A rescue is the one country job whose
    // objective **is a person**, drawn with the install's own standing-man flat
    // (`PERSON_MARKER_ART`). The hunt above already proved the quarry arrives with a slid
    // window; this proves the *marker* does — the window that reaches the captive places them.
    const rescueOffer = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map((n) => generateQuest({ world, library, kind: 'rescue', seed: 0x5eed0 + n, giver, day: 1 }))
      .find((offer) => offer.targetKind === 'wild' && offer.targetCell);
    check('the board draws a country rescue to test', Boolean(rescueOffer),
      JSON.stringify({ kinds: 'rescue', target: rescueOffer?.target }).slice(0, 200));
    if (rescueOffer) {
      const rescueState = applyRadiantEvent(createRadiantState(), 'accept', { offer: rescueOffer }).state;
      const rescueTarget = rescueOffer.targetCell;
      const rescueProvince = world.byName(rescueOffer.targetAnchor)?.provinceID ?? giver.provinceID;
      const rescueLand = (row, col) => {
        const point = pixelOfCell(row, col);
        return Boolean(world.provinceAtWorld(point)) && world.landAt(point, rescueProvince);
      };
      let rescueStart = null;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const row = rescueTarget.row + dr * 100;
        const col = rescueTarget.col + dc * 100;
        if (rescueLand(row, col) && rescueLand(row - dr * (100 - 30), col - dc * (100 - 30))) {
          rescueStart = { row, col, dr, dc };
          break;
        }
      }
      check('a stretch of country 100 cells from the captive is land', Boolean(rescueStart), JSON.stringify(rescueStart));
      if (rescueStart) {
        const rescueUrl = `http://localhost:${getPort()}/?wild=${rescueStart.row},${rescueStart.col}&grid=${WORLD_GRID_VERSION}&${q}`;
        await page.goto(rescueUrl);
        await readyWild();
        await page.evalJs(`localStorage.setItem('perfectarena.radiant',${JSON.stringify(JSON.stringify(rescueState))})`);
        await page.goto(rescueUrl);
        await readyWild();
        await page.evalJs('window.__debug.pause(true)');
        const beforeRescue = await page.evalJs('({marker: window.__debug.state().objectiveMarker ?? null, objective: window.__debug.objective()})');
        check('the captive is not in the window the player first walks into',
          beforeRescue?.marker === null && beforeRescue?.objective === null,
          JSON.stringify(beforeRescue).slice(0, 240));
        await page.evalJs('window.__debug.pause(false)');
        const rescueOrigin = await page.evalJs('window.__debug.state().wild');
        const rescueMid = { row: rescueStart.row - rescueStart.dr * (100 - 30), col: rescueStart.col - rescueStart.dc * (100 - 30) };
        await page.evalJs(`window.__debug.teleportCell(${rescueMid.row - rescueOrigin.originRow}, ${rescueMid.col - rescueOrigin.originCol})`);
        await page.waitFor(`window.__debug.state().windowSlide?.doneAt?.row === ${rescueMid.row}`, { timeoutMs: 30000, label: 'the rescue window slide' })
          .catch(() => {});
        await page.waitFor('Boolean(window.__debug.state().objectiveMarker)', { timeoutMs: 8000, label: 'the captive' })
          .catch(() => {});
        const captive = await page.evalJs('({marker: window.__debug.state().objectiveMarker ?? null, objective: window.__debug.objective(),'
          + ' hud: document.getElementById("hud-quest")?.textContent ?? ""})');
        check('the window that reaches the captive places them, as the install’s own person flat',
          captive?.marker?.art === 'MAN01.IMG' && captive?.objective?.wild === true
            && String(captive?.marker?.what ?? '').length > 0,
          JSON.stringify(captive?.marker ?? null).slice(0, 240));
        check('and the GUI still points at them, with a bearing and its paces',
          /paces|under your feet/.test(String(captive?.hud ?? '')) && /the spot/i.test(String(captive?.hud ?? '')),
          JSON.stringify(captive?.hud ?? '').slice(0, 200));
        await page.screenshot(pathSafe(shots, 'wild-rescue-captive.png')).catch(() => {});
      }
    }

    // ── 4. THE HARVEST CAMP ─────────────────────────────────────────────────
    // The owner's new job (2026-10-22): *"go pick up 5 hay bales of corn plants in the closest
    // already generated camp in the wilds (the bales and corn sprites need to respawn as soon as
    // the player leaves so if another quest points to that camp is ok)"*. The camp is a country
    // cell the world draws (`radiantQuests.js`'s `wildTargetOf`); this boots a page standing on
    // it, picks the bales up with the real `E`, and then asks a second job at the same camp for
    // its five — the respawn the report asks for.
    const harvestOffer = generateQuest({ world, library, kind: 'harvest', seed: 0x4ea5, giver, day: 1 });
    check('the board draws a harvest to test, at the closest camp in the country',
      harvestOffer.kind === 'harvest' && harvestOffer.targetKind === 'wild'
        && harvestOffer.targetAnchor === giver.name
        && Number.isFinite(harvestOffer.targetCell?.row), JSON.stringify({ target: harvestOffer.target, anchor: harvestOffer.targetAnchor }).slice(0, 200));
    if (harvestOffer.targetKind === 'wild') {
      const harvestCell = harvestOffer.targetCell;
      const harvestState = applyRadiantEvent(createRadiantState(), 'accept', { offer: harvestOffer }).state;
      const campUrl = `http://localhost:${getPort()}/?wild=${harvestCell.row},${harvestCell.col}&grid=${WORLD_GRID_VERSION}&${q}`;
      await page.goto(campUrl);
      await readyWild();
      await page.evalJs(`localStorage.setItem('perfectarena.radiant',${JSON.stringify(JSON.stringify(harvestState))})`);
      await page.goto(campUrl);
      await readyWild();
      await page.evalJs('window.__debug.pause(true)');
      const camp = await page.evalJs('({camp: window.__debug.state().harvestCamp ?? null,'
        + ' bales: window.__debug.state().loot.filter((s) => s.kind === "hay"),'
        + ' corn: window.__debug.state().loot.filter((s) => s.prop).length,'
        + ' objective: window.__debug.objective(), hud: document.getElementById("hud-quest")?.textContent ?? ""})');
      const bales = camp?.bales ?? [];
      check('the camp is dressed with five bales and its stands of corn, all drawn',
        bales.length === 5 && bales.every((bale) => bale.drawn === true && bale.art === 'NHAYM.IMG')
          && camp?.corn >= 2 && camp?.camp?.bales === 5,
        JSON.stringify(camp?.camp ?? camp).slice(0, 300));
      check('the camp is the objective, and no sixth marker stands on its ground',
        camp?.objective?.wild === true && camp?.objective?.marker === false
          && camp?.objective?.dry === true && /Gather the hay: 0\/5/.test(String(camp?.hud ?? '')),
        JSON.stringify({ objective: camp?.objective ?? null, hud: camp?.hud ?? '' }).slice(0, 360));

      // **Five bales, five presses.** Each stands on its own cell; `E` there is the pickup a
      // player makes, and the job counts them one at a time.
      let gathered = 0;
      for (const bale of bales) {
        await page.evalJs(`window.__debug.teleportCell(${bale.row}, ${bale.col})`);
        await key('KeyE');
        const now = await page.evalJs('({taken: window.__debug.state().loot.filter((s) => s.kind === "hay" && s.taken).length,'
          + ' last: window.__debug.state().lastHarvest ?? null})');
        if (now?.taken > gathered) gathered = now.taken;
      }
      // The pickup is an async `E` (the scene's own handler is `void interact()`), so the HUD is
      // written a frame after the press: wait for the hand-in line before reading it.
      await page.waitFor('window.__debug.state().lastHarvest?.count === "5/5"'
        + ' && /Return to/.test(document.getElementById("hud-quest")?.textContent ?? "")',
      { timeoutMs: 8000, label: 'the harvest hand-in' }).catch(() => {});
      const finished = await page.evalJs('({taken: window.__debug.state().loot.filter((s) => s.kind === "hay" && s.taken).length,'
        + ' objective: window.__debug.objective(), hud: document.getElementById("hud-quest")?.textContent ?? "",'
        + ' last: window.__debug.state().lastHarvest ?? null})');
      check('five presses on five bales empty the camp and finish the job',
        gathered === 5 && finished?.taken === 5 && /Return to/.test(String(finished?.hud ?? "")),
        JSON.stringify({ gathered, finished: finished?.taken, hud: finished?.hud }).slice(0, 300));
      check('and the job’s own state says the fifth bale is what finished it',
        String(finished?.last?.count ?? '') === '5/5', JSON.stringify(finished?.last ?? null).slice(0, 160));
      await page.screenshot(pathSafe(shots, 'harvest-camp.png')).catch(() => {});

      // **The same camp, a second job.** Leaving the page is leaving the level: the camp is
      // dressed again from the ground up, so a later posting at this cell finds all five.
      const secondOffer = { ...harvestOffer, id: `${harvestOffer.id}:again`, offeredOn: 1,
        harvest: { required: 5, taken: [] } };
      const secondState = applyRadiantEvent(createRadiantState(), 'accept', { offer: secondOffer }).state;
      await page.evalJs('window.__debug.pause(false)');
      await page.evalJs(`localStorage.setItem('perfectarena.radiant',${JSON.stringify(JSON.stringify(secondState))})`);
      await page.goto(campUrl);
      await readyWild();
      await page.evalJs('window.__debug.pause(true)');
      const restocked = await page.evalJs('({camp: window.__debug.state().harvestCamp ?? null,'
        + ' bales: window.__debug.state().loot.filter((s) => s.kind === "hay")})');
      check('a second job at the same camp finds all five bales standing again',
        (restocked?.bales ?? []).length === 5
          && restocked.bales.every((bale) => bale.taken === false && bale.harvest?.questId === secondOffer.id),
        JSON.stringify(restocked?.camp ?? restocked).slice(0, 300));
      await page.evalJs('window.__debug.pause(false)');
    }

    check('no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}

/** A screenshot path, or a throwaway name when the suite was started without shots. */
function pathSafe(shots, name) {
  return shots ? `${shots}/${name}` : name;
}
