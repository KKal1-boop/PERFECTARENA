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
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const row = target.row + dr * 100;
      const col = target.col + dc * 100;
      if (land(row, col) && land(row + Math.round(-dr * 45), col + Math.round(-dc * 45))) {
        start = { row, col, dr, dc };
        break;
      }
    }
    check('a stretch of country 100 cells from the job is land', Boolean(start), JSON.stringify(start));
    if (!start) return;
    const mid = { row: start.row - start.dr * 45, col: start.col - start.dc * 45 };

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
    await page.waitFor('Boolean(window.__debug.state().windowSlide?.doneAt)', { timeoutMs: 30000, label: 'the window slide' })
      .catch(() => {});
    await page.waitFor('window.__debug.combat().monsters.some((m) => m.bounty)', { timeoutMs: 15000, label: 'the quarry' })
      .catch(() => {});
    const arrived = await page.evalJs('({camp: window.__debug.state().radiantCamp ?? null,'
      + ' bounties: window.__debug.combat().monsters.filter((m) => m.bounty).map((m) => ({ name: m.name, health: m.health, cell: m.cell })),'
      + ' objective: window.__debug.objective()})');
    const quarry = arrived?.bounties ?? [];
    const near = quarry.filter((monster) => Math.max(Math.abs((monster.cell?.row ?? 1e9) - target.row),
      Math.abs((monster.cell?.col ?? 1e9) - target.col)) <= 8).length;
    check('the window that reaches the spot fields the three creatures the job asks for',
      quarry.length === 3 && near === 3 && arrived?.camp?.spawned >= 0,
      JSON.stringify(arrived).slice(0, 400));
    check('and the job’s own mark is placed, on ground a body can stand on',
      arrived?.objective?.wild === true && arrived?.objective?.dry === true,
      JSON.stringify(arrived?.objective ?? null).slice(0, 300));
    await page.screenshot(pathSafe(shots, 'wild-job-camp.png')).catch(() => {});

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
