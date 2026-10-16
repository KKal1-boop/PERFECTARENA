// THE PLAYER'S OWN STRIDE — the movement keys, and B06's law that a drawn weapon is a walk.
//
//   node tests/run-browser.mjs movement
//
// This suite exists because of a hole no other suite covered: **not one of the nineteen
// suites ever held a movement key in the interior scene.** Nobody pressed Shift. So when the
// run gate landed (`5cccb80`: the input builder's `run` reads the rig's `drawn`), the fact
// that `interior.js`'s `inputOf` is module-level while `weaponRig` lives inside
// `bootInterior` went unnoticed — and because `&&` short-circuits, the `ReferenceError` fired
// *only while a sprint key was held*: the throw left `step()`, left `frame()` before its own
// `requestAnimationFrame`, and **the page stopped for good**. One press of Shift killed the
// game, and every suite was green (D-26).
//
// So this file checks two things a player would notice, in the order that matters:
//
//   1. **No key a player can hold stops the game.** Each movement key is held for a quarter
//      second and the frame counter must still be climbing afterwards, with no page error.
//      This is the check that would have caught D-26, and it is deliberately written against
//      the *loop* rather than against a key's effect: a key may do nothing (crouch is an
//      edge, `Q`/`E` are the stairways) but nothing may throw.
//   2. **The stride is measured, not asserted in prose** (`docs/PORT_BLOCKS.md` B06's own
//      queue item): the same `W` held for the same 800 ms sheathed and drawn, and the same
//      `Shift+W`, so the run's speed, the drawn weapon's speed and the walk's speed are three
//      numbers from one page and one install. `movement` is the suite the block list named
//      for it.
//
// A city street is the room because it is the one place the port lays out tens of open metres
// (the seed is the Imperial City Watch's own start cell, and the street in front of it is
// clear for seventeen); a dungeon corridor would measure the walls.

import path from 'node:path';

/** How long a measurement leg holds its keys, in milliseconds. */
const LEG_MS = 800;
/** How long a movement key is held in the freeze check, in milliseconds. */
const KEY_HOLD_MS = 250;
/**
 * The keys the freeze check holds, one at a time: the four strides, the sprint either way, the
 * jump, the sneak, and the crouch edge. `E`/`Q` are left out on purpose — a stairway changes
 * the level, and this check is about the loop, not about where a key takes you.
 */
const MOVEMENT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'ControlLeft', 'KeyC'];

export function makeMovementSuite({ check, realErrors, shots, getPort }) {
  return async function movement(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const url = `http://localhost:${getPort()}/?location=Daggerfall&arena=${encodeURIComponent(arena)}`;
    const ready = () => page.waitFor('window.__debug?.state && window.__debug.state().painted > 5', { timeoutMs: 120000, label: 'the street' });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const feet = () => page.evalJs('window.__debug.state().feet');
    const painted = () => page.evalJs('window.__debug.state().painted');

    await page.goto(url);
    await ready();
    // A suite that followed one which paused the simulation inherits the pause.
    await page.evalJs('window.__debug.pause(false)');

    // The start cell is the level's own arrival, and the street in front of it is what the
    // legs are measured along. `look(0, 0)` faces down +z, which is the clear direction.
    const home = await feet();

    /** Hold `keys` for `ms` from the arrival cell and report the ground covered. */
    const leg = async (keys, ms = LEG_MS) => {
      await page.evalJs(`window.__debug.teleport(${home[0]}, ${home[1]}, ${home[2]}); window.__debug.look(0, 0)`);
      await sleep(140);
      const before = await feet();
      const first = await painted();
      for (const code of keys) await page.pressKey(code, true);
      await sleep(ms);
      const ran = await painted();
      for (const code of keys) await page.pressKey(code, false);
      const after = await feet();
      const metres = Math.hypot(after[0] - before[0], after[2] - before[2]);
      return { metres: Math.round(metres * 1000) / 1000, speed: Math.round((metres / (ms / 1000)) * 100) / 100, frames: ran - first };
    };

    // ── 1. no key a player can hold stops the game ──────────────────────────────
    //
    // Each key is held alone, and the frame counter is read **while it is down**: a page whose
    // loop has died paints nothing, so a frozen game is a `painted` that stopped climbing.
    const holds = [];
    for (const code of MOVEMENT_KEYS) {
      const before = await painted();
      await page.pressKey(code, true);
      await sleep(KEY_HOLD_MS);
      const during = await painted();
      await page.pressKey(code, false);
      await sleep(60);
      holds.push({ code, frames: during - before });
    }
    const frozen = holds.filter((h) => h.frames <= 0);
    check('every movement key leaves the page painting — no key a player can hold stops the frame loop',
      frozen.length === 0 && holds.every((h) => h.frames > 0),
      `${holds.map((h) => `${h.code} +${h.frames}`).join(' ')}${frozen.length ? ` — froze on ${frozen.map((h) => h.code).join(', ')}` : ''}`);

    // …and holding a sprint key is a *stride*, not an exception: the errors are named if any.
    const errs = realErrors(page.consoleErrors());
    check('and none of them raises a page error', errs.length === 0,
      errs.map((e) => e.text).join(' | ').slice(0, 400) || 'none');

    // ── 2. the stride, measured: walk, run, and the run with the blade out ──────
    const walk = await leg(['KeyW']);
    const run = await leg(['ShiftLeft', 'KeyW']);
    check('Shift runs: the sprint covers materially more ground in the same 800 ms',
      run.metres > walk.metres * 1.15 && run.frames > 0,
      `walk ${walk.speed} m/s (${walk.metres} m) → run ${run.speed} m/s (${run.metres} m) over ${walk.frames}/${run.frames} frames`);

    // The weapon in hand is the install's own sheet — the longsword the install ships art for,
    // asked for by name so the measurement cannot fall back to a weapon with no first-person
    // art (`HAND.CIF` and `FLAIL.CIF`/`BOW.CIF`'s absence is `weaponView.js`'s own report).
    await page.evalJs('window.__debug.setWeapon("longsword")');
    const artless = await page.evalJs('window.__debug.weaponView().missing');
    if (artless) throw new Error(`this install has no art for the longsword: ${artless}`);

    // A blow draws it (`strike` is what `F` and a click call).
    await page.evalJs('window.__debug.strike()');
    const drawn = await page.evalJs('window.__debug.weaponView().drawn');
    const drawnLeg = await leg(['ShiftLeft', 'KeyW']);
    const stillDrawn = await page.evalJs('window.__debug.weaponView().drawn');
    check('a drawn weapon is a walk, not a run — Shift with the blade out is the walk\'s own speed',
      drawn === true && stillDrawn === true
      && drawnLeg.metres <= walk.metres * 1.2 && drawnLeg.metres < run.metres * 0.85,
      `drawn ${drawnLeg.speed} m/s vs walk ${walk.speed} and run ${run.speed} (drawn at both ends of the leg: ${drawn}/${stillDrawn})`);

    // ── 3. and the sprint comes back when it is put away ───────────────────────
    //
    // The rig's own clock is driven, not slept through: the sheathe is two seconds of idle
    // plus the sheathing frames, and a test should not wait on the frame rate of the machine.
    // Two calls, because the rig takes **one** transition per step (`weaponView.js`'s `step`
    // switches on the state it is in): the first leap runs the hold out into `sheathing`, the
    // second runs the sheathing frames out into `sheathed`. A page does the same over frames.
    await page.evalJs('window.__debug.stepWeapon(4)');
    await page.evalJs('window.__debug.stepWeapon(2)');
    const sheathed = await page.evalJs('window.__debug.weaponView().drawn');
    const again = await leg(['ShiftLeft', 'KeyW']);
    check('the sprint comes back when the weapon is put away — the gate is a spell, not a permanent slow',
      sheathed === false && again.metres > drawnLeg.metres * 1.25,
      `sheathed: ${sheathed}, run again ${again.speed} m/s (${again.metres} m) vs drawn ${drawnLeg.speed}`);

    // ── 4. the gate is a door the player walks through ─────────────────────────
    //
    // The owner, later the same day: *"still you cant go out of cities and into the wilderness
    // gates dont work there is no door to bring you to the wilderness"*. The gate existed and
    // `E` crossed it, but the wall's own opening holds the game's gateway art as a **solid**
    // voxel, so a player who walked at it stopped against it — from their side, no door at all.
    // The push now crosses it, and this is the measurement: aim at the opening and the city is
    // behind you; walk along the wall beside it and it is not.
    //
    // `x` carries the row and `z` carries the column, and the motor moves by
    // `mx = sin(yaw)`, `mz = cos(yaw)` — so +z is yaw 0, −z is π, +x is π/2, −x is −π/2.
    const pushAt = async (yaw, ms = 1600) => {
      await page.evalJs(`window.__debug.look(${yaw}, 0)`);
      await sleep(150);
      await page.pressKey('KeyW', true);
      await sleep(ms);
      await page.pressKey('KeyW', false);
      await sleep(1500);
      return page.evalJs('({ wild: Boolean(window.__debug.state().wild), map: window.__debug.state().map, feet: window.__debug.state().feet })');
    };
    await page.goto(url);
    await ready();
    await page.evalJs('window.__debug.pause(false)');
    const size = await page.evalJs('window.__debug.state().size');
    const gate = await page.evalJs('window.__debug.gateCells(1)[0]');
    check('the city has a gate in its wall, and the game knows which cell it is',
      Boolean(gate) && Number.isInteger(gate?.row) && Number.isInteger(gate?.col),
      gate ? `the opening is at ${gate.row},${gate.col} of ${size[0]}×${size[1]}` : 'no gate cell at all');

    // …and the **collision** is out of it. This is the owner's own words — *"city gates should have
    // no collision so I can actually go into the wilderness"* — and the assembled page is the only
    // place the law can be read: `openSettlementGate` runs on the skeleton **plus its city blocks**,
    // and the wall, the gate's leaves and the street all look exactly as they did before.
    const gateways = await page.evalJs('window.__debug.state().gateway');
    check('and its boxes are out of the collision soup, without the art moving',
      Array.isArray(gateways) && gateways.length === 2
      && gateways.every((g) => g.row === 0 || g.col === 0 || g.row === size[1] - 1 || g.col === size[0] - 1),
      JSON.stringify(gateways));
    const inwardRow = gate.row === size[1] - 1 ? -1 : gate.row === 0 ? 1 : 0;
    const inwardCol = gate.col === size[0] - 1 ? -1 : gate.col === 0 ? 1 : 0;
    const outYaw = inwardCol === 1 ? Math.PI : inwardCol === -1 ? 0 : inwardRow === 1 ? -Math.PI / 2 : Math.PI / 2;
    const stand = [gate.row + inwardRow, gate.col + inwardCol];

    await page.evalJs(`window.__debug.teleportCell(${stand[0]}, ${stand[1]})`);
    await sleep(300);
    const walkedOut = await pushAt(outYaw);
    check('walking at the gate leaves the city on foot, with no keypress at all',
      walkedOut?.wild === true && Math.hypot(walkedOut.feet[0] - stand[0] * 2.5, walkedOut.feet[2] - stand[1] * 2.5) > 0,
      `${walkedOut?.map} → ${walkedOut?.wild ? 'the country' : 'still the city'} at ${JSON.stringify(walkedOut?.feet)}`);

    // The country page stands; the same push aimed *along* the wall must not throw the player
    // out again — the rule reads which way the stride is aimed, not where it is standing.
    const alongYaw = outYaw > 0 ? outYaw - Math.PI / 2 : outYaw + Math.PI / 2;
    const beforeAlong = await page.evalJs('window.__debug.state().feet');
    const along = await pushAt(alongYaw);
    check('and a stride along the wall is not a crossing',
      along?.wild === true && along.map === walkedOut.map,
      `still ${along?.wild ? 'the country' : 'the city'} at ${JSON.stringify(along?.feet)} (from ${JSON.stringify(beforeAlong)})`);

    // ── 4b. and the way back in, from the country ──────────────────────────────
    //
    // The other half of the same door, and the one that was **undone** until D-32: the country
    // page *did* recognize the gate and the push *did* cross, but the boot let the save's
    // remembered wilderness cell override the explicit arrival (`?at=`), so the city page came
    // back AS the country at the cell the player had left from. `interior.js`'s `rememberedWild`
    // guard now refuses memory when the URL asks for the settlement, which is what its own
    // comment always said. Measured here: the push in lands on the city page, three cells inside
    // the gate on its own row (`?at=8,124` for `CITYW2`'s gate at 8,127).
    // **D-32's own law, which is why the walk back was undone**: the save remembers the last
    // wilderness cell for a place, and a bare `?location=` opens the country on it — that is the
    // persistent world working. But an **explicit arrival** (`?at=`, which is what the gate
    // crossing and fast travel both build) must beat memory, or the crossing boots the country
    // again at the cell the player left from. The suite has just walked out, so the save holds a
    // wilderness cell for this city: the two loads below are that pair, and the second one is the
    // push-back's own URL.
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&arena=${encodeURIComponent(arena)}`);
    await ready();
    const remembered = await page.evalJs('({ wild: Boolean(window.__debug.state().wild), cell: window.__debug.state().wild?.cell ?? null })');
    check('the world remembers the last wilderness cell — a bare location opens the country on it',
      remembered.wild === true, `wild: ${remembered.wild} at ${JSON.stringify(remembered.cell)}`);
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&at=${stand[0]},${stand[1]}&arena=${encodeURIComponent(arena)}`);
    await ready();
    const arrived = await page.evalJs('({ wild: Boolean(window.__debug.state().wild), map: window.__debug.state().map, feet: window.__debug.state().feet })');
    check('and an explicit arrival beats it: the gate crossing lands in the city, not back in the country',
      arrived.wild === false && arrived.map === walkedOut.map,
      `?at=${stand[0]},${stand[1]} → ${arrived.wild ? 'the country' : 'the city ' + arrived.map} at ${JSON.stringify(arrived.feet.map((v) => Math.round(v * 10) / 10))}`);

    await page.screenshot(path.join(shots, 'movement-stride.png'));
    check('the movement suite leaves no console error behind', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400) || 'none');
  };
}
