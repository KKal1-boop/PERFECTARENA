// SUITE: WALKING INTO A BUILDING, AND BACK OUT AGAIN.
//
// This is the milestone the city has been missing: the signs over the doors of an Arena
// city-state are drawn (`0xA` edges), the `.INF` names what each sign means, and eight
// interiors of every kind sit in `GLOBAL.BSA` — so the suite that checks it is about the
// whole round trip, driven the way a player drives it: stand in a doorway, press the real
// `E`, land inside the shop the *sign* named, speak to the keeper with the real `T`, walk
// back to the cell you came in by and press `E` again to be back on the same street.
//
// Both halves of the trip are page loads, exactly as the game already changes place (`M`
// for the world map), so what is asserted about "the same street" is that the city the
// player returns to is the same city — same location, same seed, same cell — which is what
// determinism buys.
//
// `?location=Daggerfall` is used because its city is a real one: 56 doors over 36 blocks,
// with equipment stores, taverns, temples, a Mages Guild and houses.

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots
 * @param {() => number} helpers.getPort
 * @returns {(page: object) => Promise<void>}
 */
export function makeDoorsSuite({ check, realErrors, shots, getPort }) {
  return async function suiteDoors(page) {
    const path = await import('node:path');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));
    /**
     * Wait until the frame loop has **drawn this level**, before reading a figure count.
     *
     * `state().figures` is not a boot fact: the render loop writes it while it builds the live
     * batches (`interior.js`'s `liveBatches`), so a read taken the instant `inside` appears can
     * land one frame *before* the room's crowd is in it. The tavern's own read, four checks
     * earlier, has the same shape and passed on the very run that the house's reported
     * `0 billboards for 3 people` (doors 41/42). Four frames past the level swap is a real margin
     * and cannot make the claim vacuous — a room whose family is never drawn holds `figures` at 0
     * and still fails.
     */
    const awaitDrawn = async () => {
      const from = await page.evalJs('window.__debug.state().painted');
      await page.waitFor(`window.__debug.state().painted >= ${from + 4}`, { label: 'the room drawn', timeoutMs: 20000 });
    };
    const cellOf = (state) => ({
      row: Math.floor(state.feet[0] / 2.5),
      col: Math.floor(state.feet[2] / 2.5),
    });
    /**
     * The HUD text, once it says what is expected.
     *
     * The HUD is rebuilt on *events* rather than every frame (a handful of times per walk
     * instead of sixty times a second), and the scene polls the player's distance to the
     * nearest doorway on every eighth frame — so a fixed sleep is not a proof. This waits
     * for the line, which is what a player waits for too.
     */
    const hud = async (pattern, label) => {
      await page.waitFor(
        `document.getElementById('hud')?.textContent.includes(${JSON.stringify(pattern)}) === true`,
        { label: label ?? `HUD to say ${pattern}`, timeoutMs: 15000 },
      );
      return page.evalJs('document.getElementById("hud").textContent');
    };

    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'Daggerfall', timeoutMs: 120000 });

    // ── the doors of a real city ───────────────────────────────────────────────
    const city = await page.evalJs('window.__debug.state()');
    check('a city-state\'s shops have doors, and the signs say what they are',
      city.doors > 20 && city.doorKinds.length >= 3,
      `${city.doors} doors: ${city.doorKinds.join(', ')}`);

    const doors = await page.evalJs('window.__debug.shopDoors()');
    check('every door names a room among the eight interiors of its own family',
      doors.every((d) => /^(EQUIP|MAGE|NOBLE|TAVERN|TEMPLE|BS)\d\.MIF$/.test(d.file)),
      `${new Set(doors.map((d) => d.file)).size} distinct rooms`);
    check('and the room belongs to the sign: an equipment sign opens an equipment store',
      doors.filter((d) => /^T_TEQ/.test(d.sign)).every((d) => d.kind === 'equipment' && d.family === 'EQUIP'),
      doors.slice(0, 4).map((d) => `${d.sign}→${d.file}`).join(' '));
    check('a house\'s laundry sign opens one of the house interiors, not a shop',
      doors.filter((d) => /LAUND/.test(d.sign)).every((d) => d.family === 'BS'),
      doors.filter((d) => /LAUND/.test(d.sign)).length + ' laundry signs');
    check('the HUD tells the player how many doors the town has',
      /shop doors in this city/.test(await hud('shop doors in this city')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').filter((l) => /doors/.test(l))[0]);

    // ── standing in a doorway ─────────────────────────────────────────────────
    const stood = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("equipment"))'));
    check('the player can stand in a shop\'s doorway', stood?.kind === 'equipment', JSON.stringify(stood));
    await settle();
    const near = await page.evalJs('window.__debug.state().nearDoor');
    check('and the game names the sign over that door', near?.kind === 'equipment' && near.file === stood.file,
      `${near?.sign} → ${near?.name} (${near?.file})`);
    check('the HUD says a doorway is a way in',
      /press E to go in/.test(await hud('press E to go in')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').filter((l) => /press E to go in/.test(l))[0]);
    await page.screenshot(path.join(shots, 'm6-door-outside.png'));

    // ── E walks in ────────────────────────────────────────────────────────────
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
      { label: 'inside the shop', timeoutMs: 90000 });

    // The arrival is a fresh scene: the player is placed on the shop's own floor by the
    // level's start point, and `grounded` is the *motor's* answer, which it only gives
    // after it has run a step against the new collider. Waiting for that rather than
    // reading the first frame is what this check means by "standing on its floor".
    await page.waitFor('window.__debug.state().grounded === true', { label: 'the shop floor', timeoutMs: 20000 });
    const inside = await page.evalJs('window.__debug.state()');
    check('E in the doorway walks into the building the sign named',
      inside.map === stood.file && inside.inside.kind === 'equipment',
      `${inside.map} · ${inside.inside.name}`);
    check('the room is the shop\'s own map and the shop\'s own INF',
      /^EQUIP\d\.MIF$/.test(inside.map) && /^EQUIP\.INF$/.test(inside.inf), `${inside.map} · ${inside.inf}`);
    check('the player arrives standing on its floor',
      inside.grounded === true && inside.feet[1] > 0, `y=${inside.feet?.[1]?.toFixed?.(2)}`);
    // The building's *own* start point (its `.MIF` header, proven map by map in
    // `tests/unit/shops.test.mjs`), not the middle of the room: the player arrives in the
    // entry corridor with the shop in front of them, and the way out is the cell they are
    // standing on.
    check('and arrives at the building\'s own entry point, with the way out under their feet',
      Math.abs(inside.feet[0] - inside.spawn.x * 2.5) < 1 && Math.abs(inside.feet[2] - inside.spawn.z * 2.5) < 1
      && inside.inside.exit.row === Math.floor(inside.spawn.x) && inside.inside.exit.col === Math.floor(inside.spawn.z),
      `arrived at ${JSON.stringify(cellOf(inside))}, exit ${JSON.stringify(inside.inside.exit)}`);
    check('the doorway it came in by is the street cell the sign hangs over',
      inside.inside.street.row === stood.row && inside.inside.street.col === stood.col,
      `${JSON.stringify(inside.inside.street)} vs ${stood.row},${stood.col}`);
    check('the building knows which city-state it stands in, and can say so',
      inside.inside.town === 'Daggerfall' && /^\?/.test(inside.inside.back ?? ''),
      `${inside.inside.town} · back=${String(inside.inside.back).slice(0, 60)}…`);

    // ── the keeper ────────────────────────────────────────────────────────────
    check('a shop has a keeper in it',
      inside.townsfolk === 1 && inside.shops.keeper === 'equipment',
      `${inside.townsfolk} person, keeper=${inside.shops.keeper} (${inside.shops.keeperBank})`);
    check('and the keeper is drawn, not merely uploaded',
      inside.figures === 1, `${inside.figures} billboards`);
    check('the HUD introduces them and says how to speak',
      /keeps this place; press T to speak/.test(await hud('keeps this place; press T to speak')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').filter((l) => /keeps this/.test(l))[0]);

    await page.evalJs('JSON.stringify(window.__debug.teleportToPerson("nearest"))');
    await settle();
    await page.pressKey('KeyT');
    await page.pressKey('KeyT', false);
    await settle(240);
    const panel = await page.evalJs('window.__debug.talkPanel()');
    check('T makes the keeper speak their trade\'s own words',
      panel.shown === true && /equip\.dat line \d+/.test(panel.source ?? ''), panel.source);
    check('and the line is a whole sentence with nothing left to fill in',
      typeof panel.line === 'string' && panel.line.length >= 12 && !panel.line.includes('%')
      && /^["'(A-Z0-9]/.test(panel.line) && /[.!?”"]$/.test(panel.line),
      `"${String(panel.line).slice(0, 80)}"`);
    check('the keeper still answers the town\'s questions about the city-state',
      panel.topics.some((t) => t.key === 'city'), panel.topics.map((t) => t.label).join(' · '));
    await page.evalJs('window.__debug.closeTalk()');
    await page.screenshot(path.join(shots, 'm6-shop-inside.png'));

    // ── E walks back out, onto the same street ────────────────────────────────
    await page.evalJs(`window.__debug.teleportCell(${inside.inside.exit.row}, ${inside.inside.exit.col})`);
    await settle();
    const atDoor = await page.evalJs('window.__debug.state().inside');
    check('standing on the way in, the game says how to get out',
      atDoor.atDoor === true, JSON.stringify({ atDoor: atDoor.atDoor, exit: atDoor.exit }));
    check('the HUD says so in words, and names the town',
      /press E to step back out to Daggerfall/.test(await hud('press E to step back out to Daggerfall')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').filter((l) => /step back out/.test(l))[0]);

    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
      { label: 'back on the street', timeoutMs: 90000 });
    const back = await page.evalJs('window.__debug.state()');
    check('E steps back out to the street the player went in by',
      back.location?.name === 'Daggerfall' && back.city.seed === city.city.seed,
      `${back.location?.name} · seed ${back.city?.seed}`);
    check('and onto the very cell of the doorway, not the city gate',
      cellOf(back).row === stood.row && cellOf(back).col === stood.col,
      `standing at ${JSON.stringify(cellOf(back))}, doorway at ${stood.row},${stood.col}`);
    check('the city it comes back to is the same city',
      back.city.stamped === city.city.stamped && back.city.blocks.join() === city.city.blocks.join(),
      `${back.city.stamped}/${back.city.blocks.length} blocks stamped`);
    check('the street has doors again, and the shop is still one of them',
      back.doors === city.doors, `${back.doors} doors`);

    // ── a tavern, from the outside, to prove the sign decides ─────────────────
    const tavern = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("tavern"))'));
    await settle();
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
      { label: 'inside the tavern', timeoutMs: 90000 });
    await awaitDrawn();
    const inn = await page.evalJs('window.__debug.state()');
    check('a tavern\'s door opens a tavern, with the tavern\'s keeper',
      /^TAVERN\d\.MIF$/.test(inn.map) && /^TAVERN\.INF$/.test(inn.inf) && inn.shops.keeperBank === 'tavern.dat',
      `${inn.map} · ${inn.inf} · ${inn.shops.keeperBank} (${tavern.file})`);
    check('and nothing from the equipment store followed the player in',
      inn.shops.keeper === 'tavern' && inn.doors === 0, `${inn.doors} doors inside a building`);
    // The building's own `.INF` names its company (`TAVERN.INF`'s `BARTEND.DFA` keeper plus
    // items 83…90, the MAN/WOMAN drinkers at placed cells), so a tavern's figure count is
    // the map's, not a constant: the only hard law is that monsters never follow a player in
    // and every person placed is drawn.
    check('a building is inhabited, not infested: no monsters, everyone drawn',
      inn.townsfolk >= 1 && inn.monsters === 0 && inn.figures === inn.townsfolk,
      `${inn.townsfolk} people · ${inn.monsters} monsters · ${inn.figures} billboards`);
    // ── the room is dressed, not bare ──────────────────────────────────
    // The furnisher's real-page proof: the tavern's level carries the kit's Arena art
    // (`game/furnish.js`), the kit's torch among them, and the batches drew them all.
    const dressed = await page.evalJs('({ flats: window.__debug.state().scenery?.flats ?? 0, furniture: window.__debug.state().furniture ?? 0 })');
    check('a tavern is furnished: the kit dressed it, drawn as flats',
      dressed.furniture >= 6 && dressed.flats >= dressed.furniture,
      `${dressed.furniture} kit props among ${dressed.flats} flats`);

    // ── a house, which is somebody's home ─────────────────────────────────────
    //
    // The install's `BS*.MIF` names **nobody** — a house is a home, not a business — so the
    // room the laundry sign opens used to be an empty one with a single man in it who had
    // nothing to do with the place. A home has a family in it, and this walks in and counts
    // them, and watches a moment to see that the house is lived in rather than posed.
    // **Back on the street first**: the previous block ended *inside* the tavern, and a
    // building has no doors of its own (`inn.doors === 0`) — a lookup of the city's doors made
    // from in there finds the empty list and calls it "no house in this city".
    await page.evalJs('window.__debug.leaveBuilding()');
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
      { label: 'back on the street for the houses', timeoutMs: 90000 });
    const houseDoor = JSON.parse(await page.evalJs(`(() => {
      const doors = window.__debug.shopDoors();
      const house = doors.find((d) => d.kind === 'house') ?? doors.find((d) => d.family === 'BS');
      return JSON.stringify(house ?? null);
    })()`));
    check('a city has the houses too, and a laundry sign opens one',
      Boolean(houseDoor) && /^BS\d\.MIF$/.test(houseDoor.file ?? ''),
      houseDoor ? `${houseDoor.sign} → ${houseDoor.file}` : 'no house door in this city');
    await page.evalJs(`JSON.stringify(window.__debug.teleportToDoor(${JSON.stringify(houseDoor?.kind ?? 'house')}))`);
    await settle();
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
      { label: 'inside the house', timeoutMs: 90000 });
    await awaitDrawn();
    const home = await page.evalJs('window.__debug.state()');
    check('a house\'s door opens a house, with somebody living in it',
      /^BS\d\.MIF$/.test(home.map) && home.shops.kind === 'house' && home.townsfolk >= 3,
      `${home.map} · ${home.townsfolk} people · keeper=${home.shops.keeper}`);
    check('and the family is drawn, all of them, in the room',
      home.figures === home.townsfolk && home.figures >= 3, `${home.figures} billboards for ${home.townsfolk} people`);
    check('a house keeps no hours and sells nothing: the keeper is no shopkeeper',
      home.shops.kind === 'house' && home.shops.keeperBank === null && home.shops.open === false,
      `kind=${home.shops.kind}, bank=${home.shops.keeperBank}, open=${home.shops.open}`);
    // **A home is lived in.** The house's own people are not keepers, so they walk about it —
    // the same walking the street does, on the rooms' own standable cells.
    // Four seconds, not one: a person stands still for `TOWN_WAIT_MIN` (1.6 s) to
    // `TOWN_WAIT_MAX` (6.5 s) between steps, so a shorter look can miss a family that is
    // plainly at home — a flake, not a finding.
    const homeA = await page.evalJs('window.__debug.people()');
    let stirred = [];
    for (let i = 0; i < 10 && !stirred.length; i++) {
      await settle(500);
      const homeB = await page.evalJs('window.__debug.people()');
      stirred = homeB.filter((p, i2) => homeA[i2]
        && (Math.hypot(p.world.x - homeA[i2].world.x, p.world.z - homeA[i2].world.z) > 0.05 || p.walking));
    }
    check('and the family moves about their own house', stirred.length > 0,
      `${stirred.length} of ${homeA.length} moved or mid-step within five seconds of standing there`);

    // ── a temple, which is a room with a congregation in it ───────────────────
    // `TEMPLE.INF` names its priest and nobody else, so a temple used to hold one man praying
    // in an empty hall.
    await page.evalJs('window.__debug.leaveBuilding()');
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
      { label: 'back on the street again', timeoutMs: 90000 });
    const templeDoor = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("temple"))'));
    await settle();
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
      { label: 'inside the temple', timeoutMs: 90000 });
    const temple = await page.evalJs('window.__debug.state()');
    check('a temple holds its priest and the people who came to pray',
      /^TEMPLE\d\.MIF$/.test(temple.map) && temple.townsfolk >= 4 && temple.shops.keeper === 'temple',
      `${temple.map} · ${temple.townsfolk} people · keeper=${temple.shops.keeper}`);
    check('and the temple is a trade with hours: its doors are open at ten in the morning',
      temple.shops.kind === 'temple' && temple.shops.open === true,
      `kind=${temple.shops.kind}, open=${temple.shops.open}`);

    // ── a dungeon is not a row of shops ─────────────────────────────────────——
    await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'START.MIF', timeoutMs: 90000 });
    const dungeon = await page.evalJs('window.__debug.state()');
    check('a dungeon has no shop doors and no keeper, and E still takes what is there',
      dungeon.doors === 0 && dungeon.inside === null && dungeon.shops.keeper === null,
      `${dungeon.doors} doors, keeper=${dungeon.shops.keeper}`);
    // ── **and every locked door in it has a key** ───────────────────────────
    //
    // The reported "there isn't even a key to open the door in front of you": `placeKeys` used
    // to put a key only in a level whose lock an unaided arm could not force at all, so the
    // Imperial Dungeons' own cell door (lock 10, a one-in-four shove) had no key anywhere — a
    // door a player can only rattle. Every lock at or above `KEYWORTHY_LOCK` now has one, on the
    // player's own side of it.
    const lockedLeaves = (dungeon.leaves ?? []).filter((leaf) => leaf.locked);
    const keyItems = (dungeon.loot ?? []).filter((item) => item.kind === 'key');
    check('the Imperial Dungeons hold a locked door at all (so the next check means something)',
      lockedLeaves.length > 0, `${lockedLeaves.length} locked leaves of ${(dungeon.leaves ?? []).length}`);
    check('and every locked door in the level has a key placed for it',
      lockedLeaves.every((leaf) => keyItems.some((key) => key.lock === leaf.lockLevel)),
      `locks ${[...new Set(lockedLeaves.map((l) => l.lockLevel))].join(', ')} vs keys ${[...new Set(keyItems.map((k) => k.lock))].join(', ')}`);

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
