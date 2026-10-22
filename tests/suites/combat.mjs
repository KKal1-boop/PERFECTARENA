// SUITE: THE FIGHT, THROUGH REAL INPUT.
//
// Fought the way a player fights it: the `F` key on the keyboard and a real mouse
// `pointerdown` on the canvas — never `__debug.strike()`, which would prove the damage
// model and nothing about whether a player can reach it. The debug seam is used to
// *observe* and to set a fight up (walk to a monster, spawn a known one), which is the
// same bargain the character-creation suite makes.
//
// What is checked is what the sources can be held to: the monster's health comes from
// UESP's range for its kind, a blow that lands takes health off, a monster that dies pays
// UESP's experience rule, and the third-person view draws the player's own Arena sprite.

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots
 * @param {() => number} helpers.getPort
 * @returns {(page: object) => Promise<void>}
 */
export function makeCombatSuite({ check, realErrors, shots, getPort }) {
  return async function suiteCombat(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;

    // ── a dungeon with monsters in it ────────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && !!window.__debug.combat', { label: 'the dungeon', timeoutMs: 90000 });
    // **The one panel.** The bottom-right `#combat` box the owner asked away ("use only the gui on
    // the left ad not two guis") is gone: the fight's own lines are a band of `#hud` now, so the
    // wait is for the panel to have something in it at all, not for a class that no longer exists.
    await page.waitFor('(document.getElementById("hud")?.textContent ?? "").length > 0', { label: 'the combat HUD', timeoutMs: 60000 });

    const start = await page.evalJs('window.__debug.combat()');
    check('the dungeon is populated', start.monsters.length > 0, `${start.monsters.length} monsters: ${start.monsters.map((m) => m.name).join(', ')}`);
    check('every monster is one of Arena\'s, drawn from the archive',
      start.monsters.every((m) => m.file && /\.CFA$/.test(m.file)),
      start.monsters.map((m) => m.file).join(' '));
    // `PAL.COL` is the install's own default and the palette the walls use; what makes it
    // right for the creatures is the `.CFA` lookup table, which `parseCfa` applies (see
    // `src/arena/cfa.js`). This check used to name `DAYTIME.COL`, which was the conclusion
    // of the *broken* decoder's era: with the table applied, a skeleton under `DAYTIME.COL`
    // comes out blue (rgb 90,154,189) and under `PAL.COL` bone (rgb 139,127,127).
    check('the creatures use their own palette, not the walls\'',
      start.spritePalette === 'PAL.COL', start.spritePalette);
    check('the monsters stand in cells of this map',
      start.monsters.every((m) => m.cell.row >= 0 && m.cell.col >= 0 && Number.isFinite(m.world.x) && Number.isFinite(m.world.z)),
      JSON.stringify(start.monsters[0]));
    check('the player is the character that was created, or a stand-in',
      Boolean(start.player.name) && start.player.health > 0,
      `${start.player.name} (${start.player.class ?? 'no class'}) ${start.player.health}/${start.player.maxHealth}`);
    // **The provenance moved off the HUD.** The owner, 2026-10-21: *"this part of the gui
    // should not be there anymore instead in the settings"*. The fight's HUD now says only what
    // is happening; the tables' own account is in the pack panel, where a player looks for it.
    const hudText = await page.evalJs('document.getElementById("hud").textContent');
    await page.pressKey('KeyI');
    await page.pressKey('KeyI', false);
    await page.waitFor('document.getElementById("inventory")?.classList.contains("on")',
      { label: 'the pack open', timeoutMs: 10000 });
    const packText = await page.evalJs('document.getElementById("inventory").textContent');
    await page.pressKey('KeyI');
    await page.pressKey('KeyI', false);
    check('the HUD is the fight\'s, and the tables\' own account is in the pack',
      !/WASD move/.test(hudText) && !/reconstruction/.test(hudText) && /reconstruction/.test(packText),
      JSON.stringify({ hud: hudText.slice(-80), pack: /reconstruction/.test(packText) }));

    // ── the health a monster is rolled with is its own kind's ───────────────
    const ranged = await page.evalJs(`JSON.stringify(window.__debug.combat().monsters.map((m) => ({ id: m.id, health: m.maxHealth })))`);
    const KINDS = {
      rat: [1, 6], goblin: [1, 8], wolf: [10, 25], snowwolf: [15, 30], lizardman: [10, 20],
      skeleton: [25, 45], orc: [15, 40], ghoul: [45, 75], spider: [40, 70], minotaur: [30, 60],
      ghost: [60, 80], hellhound: [50, 75], troll: [75, 100], zombie: [70, 90], wraith: [80, 110],
      homonculus: [90, 120], icegolem: [150, 200], stonegolem: [175, 250], irongolem: [200, 300],
      firedaemon: [225, 350], medusa: [250, 400], vampire: [500, 500], lich: [750, 750],
    };
    const outOfRange = JSON.parse(ranged).filter((m) => {
      const range = KINDS[m.id];
      return range && (m.health < range[0] || m.health > range[1]);
    });
    check('every monster\'s hit points are inside UESP\'s range for its kind',
      outOfRange.length === 0, outOfRange.map((m) => `${m.id} ${m.health}`).join(' ') || JSON.stringify(ranged));

    // ── walking up to one, and hitting it with the F key ────────────────────
    const approached = await page.evalJs('JSON.stringify(window.__debug.approach(0))');
    check('the player can be put face to face with a monster', Boolean(JSON.parse(approached)?.name), approached);
    await new Promise((r) => setTimeout(r, 400));
    const before = await page.evalJs('window.__debug.combat().monsters[0]');
    await page.pressKey('KeyF');
    await new Promise((r) => setTimeout(r, 120));
    await page.pressKey('KeyF', false);
    await new Promise((r) => setTimeout(r, 250));
    const struck = await page.evalJs('JSON.stringify(window.__debug.combat().monsters[0])');
    const after = JSON.parse(struck);
    const hpFell = after.health < before.health || after.health === 0;
    check('a blow from the F key takes health off the monster in front', hpFell,
      `${before.name} ${before.health} → ${after.health}`);

    // A miss is allowed — Arena's to-hit is a roll — so the damage model is checked in
    // Node. What is checked here is that the key reaches it at all: the same fight,
    // repeated, must eventually land.
    let landed = hpFell;
    for (let i = 0; i < 12 && !landed; i++) {
      await page.pressKey('KeyF');
      await new Promise((r) => setTimeout(r, 150));
      await page.pressKey('KeyF', false);
      await new Promise((r) => setTimeout(r, 200));
      const now = await page.evalJs('window.__debug.combat().monsters[0]');
      if (now.health < before.health) landed = true;
    }
    check('repeated blows land, so the roll is not stuck on miss', landed);
    // **The swing speaks the install's own clip.** The owner, 2026-10-21: *"sounds that
    // perfectarena uses … are not the correct sounds the original arena is using"*. The bank is
    // warmed at boot (`warmSfxClips`) and a blow names `SWISH.VOC`; the seam says which path spoke.
    const swingSound = await page.evalJs('window.__debug.sfx()');
    check('a blow speaks Arena\'s own clips, not the synthesized fallback',
      swingSound?.source === 'arena' && /SWISH|EHIT|CLANK|MDIE|BODYFALL/.test(swingSound?.clip ?? ''),
      JSON.stringify(swingSound));

    // ── a real mouse click is a swing too ───────────────────────────────────
    //
    // Fought against a monster chosen for the purpose — a rat, standing two paces in
    // front and within reach — rather than whatever the level happened to roll. The
    // first version of this check used the nearest of the dungeon's own monsters and
    // passed or failed according to which one that was: a rat dies to a blow, a troll
    // does not. The player's own blows are what is being tested here, so the opponent
    // is the one thing that should be held constant.
    const rat = JSON.parse(await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("rat")))()'));
    check('a monster can be brought into reach on purpose', rat?.name === 'Rat', JSON.stringify(rat));
    // **The rat is a body, not a picture.** The owner's *"enemies have no collision with the
    // player"*: the spawn stands 1.4 m ahead, and a walk straight into it has to stop on its
    // chest (0.42 + 0.35 m) instead of passing through. The seam's `distance` is the same number
    // the creature's own step reads.
    await page.pressKey('KeyW');
    await new Promise((r) => setTimeout(r, 750));
    await page.pressKey('KeyW', false);
    await new Promise((r) => setTimeout(r, 120));
    const blocked = await page.evalJs('JSON.stringify(window.__debug.combat().monsters.find((m) => m.name === "Rat"))');
    const ratNow = JSON.parse(blocked ?? 'null');
    check('walking into a creature stops at its body instead of passing through it',
      ratNow && Number(ratNow.distance) >= 0.7, blocked);
    const canvasBox = await page.evalJs('(() => { const c = document.getElementById("c").getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; })()');
    const killsBefore = (await page.evalJs('window.__debug.combat().player.kills'));
    for (let i = 0; i < 40 && (await page.evalJs('window.__debug.combat().player.kills')) === killsBefore; i++) {
      await page.clickAt(canvasBox.x, canvasBox.y);
      // Past the swing cooldown, so each click is a blow and not a swallowed one.
      await new Promise((r) => setTimeout(r, 200));
    }
    const killsAfter = await page.evalJs('window.__debug.combat().player.kills');
    check('clicking the world fights, exactly as the key does', killsAfter > killsBefore,
      `${killsBefore} → ${killsAfter} slain`);
    await page.screenshot(path.join(shots, 'm6-combat.png'));

    // ── no heavy: the press is the only blow ────────────────────────────────
    //
    // The owner, 2026-10-19: *"remove the possibility to do heavy blows in combat just normal
    // blows for the player the mechanic doesnt insert well in combat"*. The press strikes at
    // once, and holding the button cannot arm a second, stronger blow: `defence.charge` is
    // pinned at `{armed:false, progress:0}` before and after a long hold. The click itself is
    // still proven to fight by the kill check above, so this is the *absence* of the old tier.
    const at = { x: canvasBox.x, y: canvasBox.y, button: 'left', clickCount: 1 };
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, buttons: 0 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, buttons: 1 });
    await new Promise((r) => setTimeout(r, 100));       // inside the arm: still a light swing
    const tapCharge = await page.evalJs('window.__debug.combat().defence.charge');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, buttons: 0 });
    await new Promise((r) => setTimeout(r, 150));
    check('a click arms no charge — there is no heavy to arm',
      tapCharge?.armed === false && tapCharge?.progress === 0, JSON.stringify(tapCharge));

    // …and a long hold adds nothing to it.
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, buttons: 1 });
    await new Promise((r) => setTimeout(r, 600));       // well past the arm
    const heldCharge = await page.evalJs('window.__debug.combat().defence.charge');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, buttons: 0 });
    await new Promise((r) => setTimeout(r, 250));
    check('holding the button adds no heavy: the ordinary blow already landed on the press',
      heldCharge?.armed === false && heldCharge?.progress === 0, JSON.stringify(heldCharge));

    // ── the player takes blows, and the HUD says so ─────────────────────────
    //
    // A second rat, so that the exchange is certain and small: both ways of being hurt
    // count — losing health, or being struck down and coming to at the way in (which
    // heals). What does not count is losing nothing at all.
    await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("rat")))()');
    const healthBefore = await page.evalJs('window.__debug.combat().player.health');
    const deathsBefore = await page.evalJs('window.__debug.combat().deaths');
    await new Promise((r) => setTimeout(r, 3000));
    const healthAfter = await page.evalJs('window.__debug.combat().player.health');
    const deathsAfter = await page.evalJs('window.__debug.combat().deaths');
    check('a monster within reach hurts the player', healthAfter < healthBefore || deathsAfter > deathsBefore,
      `${healthBefore} → ${healthAfter} health, ${deathsBefore} → ${deathsAfter} deaths`);
    // A five-point blow is asked for, and the answer is read against where the player
    // stood at that instant: five points off five health *kills*, and coming to at the way
    // in heals to full — so "the health fell" cannot be the whole claim. Either it fell or
    // it was struck down and restored, and both of those are the player's own health
    // moving. (This check used to compare against the health after the *previous* rat, so
    // it read its own healing as a failure: measured `{health:60, deaths:1}`.)
    const healthJustBefore = await page.evalJs('window.__debug.combat().player.health');
    const deathsJustBefore = await page.evalJs('window.__debug.combat().deaths');
    const hurt = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.hurt(5, "A test blow"))'));
    check('the player\'s health is theirs and it can fall',
      hurt.health !== null && (hurt.health < healthJustBefore || hurt.deaths > deathsJustBefore),
      `${healthJustBefore} → ${hurt.health} health, ${deathsJustBefore} → ${hurt.deaths} deaths`);

    // ── a monster of a chosen kind, and UESP's experience for killing it ────
    //
    // `spawnMonster` is async (it loads the creature's art on demand), so the call is
    // wrapped in an async IIFE: `awaitPromise` resolves the *outer* promise only, and a
    // bare `await` is a syntax error in an evaluated expression.
    const spawned = await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("lich")))()');
    const lich = JSON.parse(spawned);
    if (lich) {
      check('a named monster can be brought into the fight',
        lich.name === 'Lich' && lich.health === 750 && lich.file === 'LICH1.CFA', spawned);
      check('the Lich\'s art is Arena\'s own', lich.file === 'LICH1.CFA', lich.file);
    } else {
      check('a named monster can be brought into the fight', false, 'the roster here has no lich art');
    }

    // ── third person draws the player's own sprite, from behind ─────────────
    await page.pressKey('KeyV');
    await new Promise((r) => setTimeout(r, 200));
    const third = await page.evalJs('window.__debug.combat()');
    check('V switches to the third-person view', third.view === 'third', third.view);
    check('the third-person player is an Arena person, chosen by class',
      Boolean(third.playerSprite) && /^\d\d[A-Z]{3}(WLK|ATT)\.CFA$/.test(third.playerSprite),
      `${third.player.class ?? 'stand-in'} → ${third.playerSprite}`);
    // Standing behind the player, the camera sees the *back* of the figure: view `05` of
    // the walk set. The first version drew view `01`, the front — which is why the avatar
    // stared into the camera instead of looking where it was going.
    check('the avatar is drawn from behind, not facing the camera',
      /^05[A-Z]{3}WLK\.CFA$/.test(third.playerSprite ?? ''), third.playerSprite);
    const standing = await page.evalJs('window.__debug.animation()');
    await new Promise((r) => setTimeout(r, 700));
    const standingLater = await page.evalJs('window.__debug.animation()');
    check('and it stands still while the player stands still',
      standing.player === standingLater.player && /#0$/.test(standing.player ?? ''),
      `${standing.player} → ${standingLater.player}`);
    await page.screenshot(path.join(shots, 'm6-third-person.png'));

    // ── the third-person camera does not enter walls ─────────────────────────
    // The old camera was a fixed 3.6 m behind the player, so a corridor put it inside the
    // masonry. The boom is now raycast from the player's head and shortened at the first
    // wall; this stands the player beside a solid cell, looks so the camera would be inside
    // that cell, and reads the resolved eye.
    const camera = await page.evalJs(`(() => {
      const d = window.__debug;
      const feet = d.state().feet;
      const baseRow = Math.floor(feet[0] / 2.5), baseCol = Math.floor(feet[2] / 2.5);
      let found = null;
      for (let r = baseRow - 12; r <= baseRow + 12 && !found; r++) {
        for (let c = baseCol - 12; c <= baseCol + 12 && !found; c++) {
          const here = d.cellAt(r, c);
          if (!here || here.solid || here.chasm) continue;
          for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const next = d.cellAt(r + dr, c + dc);
            if (next && next.solid) { found = { row: r, col: c, dr, dc }; break; }
          }
        }
      }
      if (!found) return null;
      d.teleport((found.row + 0.5) * 2.5, feet[1], (found.col + 0.5) * 2.5);
      // Put the camera's boom along the solid neighbour: eye = feet − (sin yaw, cos yaw)·d.
      d.look(Math.atan2(-found.dr, -found.dc), 0);
      return found;
    })()`);
    await new Promise((r) => setTimeout(r, 180));
    const wallCam = await page.evalJs(`(() => {
      const d = window.__debug, s = d.state(), c = s.thirdCamera;
      if (!c) return null;
      const eye = d.cellAt(Math.floor(c.eye[0] / 2.5), Math.floor(c.eye[2] / 2.5));
      return { blocked: c.blocked, distance: c.distance, wanted: c.wanted, eyeSolid: Boolean(eye?.solid), eye: c.eye };
    })()`);
    check('the third-person camera shortens its boom against a wall instead of clipping through it',
      Boolean(camera) && wallCam?.blocked === true && wallCam.distance < wallCam.wanted && wallCam.eyeSolid === false,
      `${JSON.stringify(camera)} → ${JSON.stringify(wallCam)}`);

    // ── a walk cycle belongs to walking ─────────────────────────────────────
    //
    // One counter for the whole level (the first version) advanced everything off the
    // scene clock, so the level stood there shuffling. The rule is "the frame follows the
    // figure", and it is read in the level itself: the dungeon's own spawn is a corridor,
    // so if the player does not move there is nothing to say about a walk, and when they
    // do move the frame must move with them. (A `teleport` is *not* a movement the batch
    // ever sees: the motor resolves the new position against the collider before the next
    // frame, so the figure is back where it was — which is why this walks instead.)
    const stillFrames = [await page.evalJs('window.__debug.animation()')];
    await new Promise((r) => setTimeout(r, 300));
    stillFrames.push(await page.evalJs('window.__debug.animation()'));
    check('a figure that is not moving holds its standing frame',
      stillFrames.every((a) => a.player === stillFrames[0].player && /#0$/.test(a.player ?? '')),
      stillFrames.map((a) => a.player).join(' → '));

    const spawn = await page.evalJs('window.__debug.spawnPoint()');
    await page.evalJs(`window.__debug.teleport(${spawn.x}, ${spawn.y}, ${spawn.z})`);
    // **Turn to the corridor before walking.** Held `W` walks the way the camera looks, and
    // this check used to walk the way an earlier `approach()` had left it looking — which only
    // had room in it while the level's arrival was the cell the spiral out from the grid's
    // centre happened to land on. With the arrival now the file's own header point (`START.MIF`'
    // cell 26,1: one open neighbour, west of the level), 500 ms of `W` walked 0.11 units into
    // stone and the walk cycle, correctly, stayed on frame 0 — the figure was moving, but not a
    // stride's worth. Facing the nearest open cell is what a player does at a corridor mouth.
    await page.evalJs(`(() => {
      const d = window.__debug;
      const s = d.state();
      const row = Math.round(s.spawn.x - 0.5);
      const col = Math.round(s.spawn.z - 0.5);
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const cell = d.cellAt(row + dr, col + dc);
        if (!cell || cell.solid || cell.chasm) continue;
        d.look(Math.atan2(dr * 2.5, dc * 2.5), 0);
        return [dr, dc].join(',');
      }
      return null;
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    const beforeWalk = await page.evalJs('window.__debug.state()');
    await page.evalJs('window.__debug.input("KeyW", true)');
    // **Sampled while walking, not once at the end of it.** The corridor above is a dead end:
    // the player walks a stride and then presses against stone, and a figure pressed against a
    // wall is *standing* — the walk cycle correctly holds frame 0, which the single sample this
    // check used to take read as a broken animation whenever it landed on the wall (it did, in
    // one full run of the suite: `05CHNWLK.CFA#0 after walking`). The claim is that a stride
    // shows a stride, so the frames are collected as the walk happens and one of them has to be
    // a walk frame.
    const strideFrames = [];
    for (let i = 0; i < 9; i++) {
      await new Promise((r) => setTimeout(r, 90));
      strideFrames.push(await page.evalJs('window.__debug.animation().player'));
    }
    const walked = await page.evalJs('({ anim: window.__debug.animation(), feet: window.__debug.state().feet })');
    await page.evalJs('window.__debug.input("KeyW", false)');
    // **Polled, not sampled once.** The key has just come up and the figure is finishing the
    // stride it was in; the claim is that standing puts the pose back, not that it does so
    // inside a fixed number of milliseconds of the key being released (a single read 400 ms
    // later caught `05CHNWLK.CFA#2` once, on a frame the player was still settling).
    let stopped = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 100));
      stopped = await page.evalJs('window.__debug.animation()');
      if (/#0$/.test(stopped.player ?? '')) break;
    }
    const walkedInLevel = Math.hypot(walked.feet[0] - beforeWalk.feet[0], walked.feet[2] - beforeWalk.feet[2]) > 0.1;
    const sawStride = strideFrames.some((frame) => /WLK\.CFA#(?!0$)\d+$/.test(frame ?? ''));
    check('walking with W walks the walk cycle too',
      !walkedInLevel || sawStride,
      `${strideFrames.join(' ')} while walking, ending ${walked.anim.player} — ${walkedInLevel ? 'the player moved' : 'no movement in the corridor'}`);
    check('and standing still puts the figure back to its standing frame',
      /#0$/.test(stopped.player ?? ''), stopped.player);

    // ── a wall is not a weapon ──────────────────────────────────────────────
    //
    // The reported "enemies hit you behind walls": distance alone woke a monster and let its
    // blow land through the stone between it and the player. The rule now is `sightClear`, a ray
    // at eye height through the level's own collider, and these two claims are its two halves —
    // a wall between two open cells blocks the line, and a straight run of open cells does not.
    // (Both halves matter: a test that only asked the first would pass on a game where nobody
    // could see anything at all.)
    const sight = JSON.parse(await page.evalJs(`(() => {
      const d = window.__debug;
      const s = d.state();
      const open = (cell) => cell && !cell.solid && !cell.chasm;
      let wall = null;
      let run = null;
      for (let row = 1; row < s.size[0] - 1; row++) {
        for (let col = 1; col < s.size[1] - 2; col++) {
          const left = d.cellAt(row, col);
          const mid = d.cellAt(row, col + 1);
          const right = d.cellAt(row, col + 2);
          if (!wall && left && right && mid && open(left) && open(right)
            && mid.solid && mid.kind !== 'door') {
            wall = d.sightBetween({ row, col }, { row, col: col + 2 });
          }
          if (!run && open(left) && open(mid) && open(right)) {
            run = d.sightBetween({ row, col }, { row, col: col + 2 });
          }
        }
      }
      return JSON.stringify({ wall, run });
    })()`));
    check('a wall between two open cells blocks the line: nothing strikes through stone',
      sight?.wall?.sees === false, JSON.stringify(sight?.wall ?? null));
    check('and a straight run of open floor does not, so the test above is not a game where nobody sees',
      sight?.run?.sees === true, JSON.stringify(sight?.run ?? null));
    // …and every monster the frame knows about reports whether it can see the player at all,
    // which is the flag the blow is gated on.
    const fighting = await page.evalJs('window.__debug.combat()');
    check('every monster reports whether it can see the player',
      (fighting.monsters ?? []).every((m) => typeof m.sees === 'boolean'),
      `${(fighting.monsters ?? []).length} monsters: ${(fighting.monsters ?? []).slice(0, 3).map((m) => `${m.name} sees=${m.sees}`).join(', ')}`);

    // ── a blow has a picture ────────────────────────────────────────────────
    // The cooldown from any earlier swing has to be over first, or `strike` refuses and
    // there is nothing to look at.
    await new Promise((r) => setTimeout(r, 1500));
    const blow = await page.evalJs('window.__debug.strike()');
    await new Promise((r) => setTimeout(r, 150));
    const swung = await page.evalJs('({ combat: window.__debug.combat(), anim: window.__debug.animation() })');
    check('a strike plays the swing animation over the walk',
      blow.ok === true && swung.combat.swinging === true && /ATT\.CFA#\d+$/.test(swung.anim.player ?? ''),
      `${blow.reason ?? blow.target ?? 'swing'} · ${swung.anim.player} (attack art: ${swung.combat.attackSprite})`);
    await new Promise((r) => setTimeout(r, 700));
    check('and the swing is over when it is over', (await page.evalJs('window.__debug.combat()')).swinging === false);

    await page.pressKey('KeyV');
    await page.pressKey('KeyV', false);
    await new Promise((r) => setTimeout(r, 200));
    check('and back again', (await page.evalJs('window.__debug.combat().view')) === 'first');

    // ── a blow is announced before it lands, and a roll costs stamina ──────────
    // A creature in sight winds up for the first part of its cadence: a ring is drawn on the
    // ground at its feet, and it holds still under the ring. The ring is what the player reads
    // to know whether to roll (Q) or to guard, so both are checked on the real page.
    {
      // A rat is brought in and the player is set two metres from it, in sight: a rat has to
      // notice and walk the length of a street before it winds up, which took longer than the
      // window on some runs.
      await page.evalJs('(async () => JSON.stringify(await window.__debug.spawnMonster("rat")))()');
      // The rat has to *see* the player, and the wall may be on the side the player was put. So
      // the player is set on each side of it in turn (`beside`), and a side that is walled off
      // simply does not wind it up.
      const offsets = [[2, 0], [-2, 0], [0, 2], [0, -2]];
      const beside = (k) => page.evalJs(`(() => { const ms = window.__debug.combat().monsters; const m = ms[ms.length - 1]; const f = window.__debug.state().feet; const [dx, dz] = ${JSON.stringify(offsets[k])}; window.__debug.teleport(m.world.x + dx, f[1], m.world.z + dz); return 1; })()`);
      await beside(0);
      let windup = null;
      let ringsSeen = 0;
      // Up to 30 s: a rat has to notice and walk to the player, which the timing of a fight
      // does not fix (12 s was enough on some runs and not on others).
      for (let i = 0; i < 300 && !windup; i++) {
        if (i > 0 && i % 60 === 0) await beside((i / 60) % offsets.length);
        const snap = await page.evalJs('window.__debug.combat()');
        windup = snap.attacks.find((a) => a.phase === 'windup') ?? null;
        if (windup) {
          ringsSeen = snap.telegraphs;
          const again = await page.evalJs('window.__debug.combat().attacks.find((a) => a.phase === "windup")');
          check('a creature holds still while it winds up', again ? (again.x === windup.x && again.z === windup.z) : true,
            again ? `${windup.x},${windup.z} → ${again.x},${again.z}` : 'the windup ended');
        } else {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      // On a miss, the detail says what the rat was doing and where the player stood, so a
      // failure in a full run can be read rather than guessed at.
      const diag = windup ? null : await page.evalJs('(() => { const s = window.__debug.combat(); const m = s.monsters[s.monsters.length - 1]; return { count: s.monsters.length, last: m ? { name: m.name, health: m.health, x: m.world.x, z: m.world.z } : null, feet: window.__debug.state().feet, playerHealth: s.player.health, view: s.view, attacks: s.attacks.length }; })()');
      check('a creature in sight shows its windup before it strikes', Boolean(windup),
        windup ? windup.name : `no creature wound up in 30 s: ${JSON.stringify(diag)}`);
      if (windup) check('the windup is drawn as a ring on the ground', ringsSeen >= 1, `${ringsSeen} ring(s)`);
    }
    {
      const before = await page.evalJs('window.__debug.combat().defence');
      await page.pressKey('KeyQ');
      await page.pressKey('KeyQ', false);
      await new Promise((r) => setTimeout(r, 120));
      const after = await page.evalJs('window.__debug.combat().defence');
      check('Q rolls, and the roll is paid for in stamina', after.rollT < 0.42 && after.stamina < before.stamina,
        `rollT ${after.rollT?.toFixed?.(2)}, stamina ${before.stamina} → ${after.stamina} of ${after.max}`);
    }

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
