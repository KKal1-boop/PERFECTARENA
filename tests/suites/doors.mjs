// SUITE: WALKING INTO A BUILDING, AND BACK OUT AGAIN.
//
// This is the milestone the city has been missing: a city block paints its doors **on its
// walls** (`T_DEQ.IMG`, `T_DBS1..3.IMG`, …), the `.INF`'s own `*MENU` table names the room
// behind each one, and eight interiors of every kind sit in `GLOBAL.BSA` — so the suite that
// checks it is about the whole round trip, driven the way a player drives it: stand on the
// paving in front of a wall door, press the real `E`, land inside the room the **door's art**
// named, speak to the keeper with the real `T`, walk back to the cell you came in by and press
// `E` again to be back on the same street. The hanging signs the blocks also draw are
// decoration, and the suite keeps them out of the door list (the owner's report: a house used
// to be entered through a sprite of clothes on a line).
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
    check('a city has its doors where the walls are painted with them, not only on its shops',
      city.doors > 200 && city.doorKinds.length >= 5,
      `${city.doors} doors: ${city.doorKinds.join(', ')}`);

    const doors = await page.evalJs('window.__debug.shopDoors()');
    check('every door names a room among the interiors of its own family',
      doors.every((d) => /^(EQUIP|MAGE|NOBLE|TAVERN|TEMPLE|BS)\d\.MIF$/.test(d.file)
        || /^PALACE[1-5]\.MIF$/.test(d.file)),
      `${new Set(doors.map((d) => d.file)).size} distinct rooms`);
    check('every door is a wall painted with door art, and its art names the room',
      doors.every((d) => d.wall === true && /^T_D(?:BS\d?|EQ|TAV|MU|TEP|NB\d?)\.IMG$/i.test(d.sign))
        && doors.filter((d) => /^T_DEQ/.test(d.sign)).every((d) => d.kind === 'equipment' && d.family === 'EQUIP')
        && doors.filter((d) => /^T_DBS/.test(d.sign) && !d.palace).every((d) => d.family === 'BS'),
      doors.slice(0, 4).map((d) => `${d.sign}→${d.file}`).join(' '));
    check('no door is the clothes hanging on the line: every hanging sign is decoration',
      doors.every((d) => !/LAUND|T_TEQ|T_TTAV|T_TMU|T_TTEP/.test(d.sign))
        && doors.some((d) => d.kind === 'house'),
      `${doors.filter((d) => d.kind === 'house').length} house doors, 0 signs treated as doors`);
    check('every door has a walkable street cell to stand on, and almost all of them do',
      doors.filter((d) => d.stand).length >= doors.length - 5
        && doors.filter((d) => !d.stand).length <= 5,
      `${doors.length - doors.filter((d) => !d.stand).length} of ${doors.length} reachable`);
    // **The one door whose art is not its room, and it is named.** The install ships throne rooms
    // (`PALACE1…5`) and no city block with a palace door, so a court has to stand behind a
    // building that exists — the house door nearest the middle of the city, marked `palace: true`
    // (the owner, 2026-10-17: "all main cities and not villages need to have palaces").
    const palaces = doors.filter((d) => d.palace === true);
    check('exactly one door in a city is the palace, and it is a marked house door',
      palaces.length === 1 && /^PALACE[1-5]\.MIF$/.test(palaces[0].file)
      && palaces[0].kind === 'palace' && /^T_D(?:BS|NB)/.test(palaces[0].sign) && palaces[0].wall === true,
      JSON.stringify(palaces[0] ?? null));
    check('the HUD tells the player how many doors the town has',
      /doors in this city/.test(await hud('doors in this city')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').filter((l) => /doors/.test(l))[0]);

    // ── standing in a doorway ─────────────────────────────────────────────────
    const stood = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("equipment"))'));
    check('the player can stand on the paving in front of an equipment door',
      stood?.kind === 'equipment' && stood.stand && stood.stand.row >= 0,
      JSON.stringify(stood));
    await settle();
    const near = await page.evalJs('window.__debug.state().nearDoor');
    check('and the game names the door the player is at',
      near?.kind === 'equipment' && near.file === stood.file && near.wall === true,
      `${near?.sign} → ${near?.name} (${near?.file})`);
    check('the HUD says the door is a way in',
      /press E at the door to go in/.test(await hud('press E at the door to go in')),
      (await page.evalJs('document.getElementById("hud").textContent')).split('\n').filter((l) => /go in/.test(l))[0]);
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
    check('the doorway it came in by is the wall cell the player stood in front of',
      inside.inside.street.row === stood.row && inside.inside.street.col === stood.col,
      `${JSON.stringify(inside.inside.street)} vs the door at ${stood.row},${stood.col}`);
    check('the building knows which city-state it stands in, and can say so',
      inside.inside.town === 'Daggerfall' && /^\?/.test(inside.inside.back ?? ''),
      `${inside.inside.town} · back=${String(inside.inside.back).slice(0, 60)}…`);

    // ── the keeper ────────────────────────────────────────────────────────────
    // **The map's own armourer.** `EQUIP.INF` paints `SMITH.DFA` behind the counter (item 15),
    // so the keeper is a still person and `townsfolk` may hold no walker at all — the check is
    // that a keeper exists *and* that it is the room's own art, not that a stranger was minted
    // to stand in for him.
    const smith = (inside.stillPeople ?? []).filter((person) => person.keeper);
    check('a shop has a keeper in it, and it is the map\'s own armourer',
      inside.shops.keeper === 'equipment' && smith.some((person) => /^SMITH\./.test(person.art ?? '')),
      `${inside.townsfolk} walker(s) · ${inside.stillPeople?.length ?? 0} still · keeper=${inside.shops.keeper} (${inside.shops.keeperBank})`);
    // A still person is drawn by the scenery pass, so `figures` (the live billboards) is not the
    // count that proves it: the batch is the proof, and the height is the proof it is a person.
    check('and the keeper is drawn, at a person\'s height',
      (inside.scenery?.names ?? []).includes('SMITH.DFA')
      && smith.every((person) => person.height > 1.4 && person.height < 2.1),
      `${smith.map((p) => `${p.art} ${p.height?.toFixed?.(2)} m`).join(', ')} · ${inside.figures} live billboards`);
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

    // Capture the VERY FIRST frames, not just a settled state. Cached scene boot can
    // complete inside an animation-frame batch whose timestamp predates scene creation.
    // The old loop then stepped backwards and turned damage-shake decay into a shake.
    await page.evalJs(`window.__exitCameraFrames = [];
      window.__exitCameraSampling = true;
      function sampleExitCamera() {
        if (!window.__exitCameraSampling) return;
        const s = window.__debug.state();
        if (s.city && !s.inside) window.__exitCameraFrames.push({
          seconds: s.seconds, shake: s.cameraShake, eye: s.eye, yaw: s.yaw, pitch: s.pitch,
        });
        requestAnimationFrame(sampleExitCamera);
      }
      requestAnimationFrame(sampleExitCamera);`);
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
      { label: 'back on the street', timeoutMs: 90000 });
    await page.waitFor('window.__exitCameraFrames.length >= 12', { label: 'exit camera frames', timeoutMs: 20000 });
    const cameraFrames = await page.evalJs('window.__exitCameraSampling = false; window.__exitCameraFrames');
    check('a cached building exit never steps the new scene clock backwards',
      cameraFrames.every((s, i) => Number.isFinite(s.seconds) && s.seconds >= 0
        && (i === 0 || s.seconds >= cameraFrames[i - 1].seconds)),
      `first seconds ${cameraFrames.slice(0, 6).map((s) => s.seconds.toFixed(4)).join(', ')}`);
    check('a peaceful building exit never invents damage camera shake',
      cameraFrames.every((s) => s.shake === 0),
      `max shake ${Math.max(...cameraFrames.map((s) => s.shake))}`);
    check('the exit camera remains still when no movement or look is requested',
      cameraFrames.every((s) => Math.hypot(...s.eye.map((v, i) => v - cameraFrames[0].eye[i])) < 0.001
        && s.yaw === cameraFrames[0].yaw && s.pitch === cameraFrames[0].pitch),
      `${cameraFrames.length} rendered exit frames`);
    const back = await page.evalJs('window.__debug.state()');
    check('E steps back out to the street the player went in by',
      back.location?.name === 'Daggerfall' && back.city.seed === city.city.seed,
      `${back.location?.name} · seed ${back.city?.seed}`);
    check('and onto the very paving in front of the door, not the city gate',
      cellOf(back).row === stood.stand.row && cellOf(back).col === stood.stand.col,
      `standing at ${JSON.stringify(cellOf(back))}, the door at ${stood.row},${stood.col}`);
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
    // **A tavern's company is the map's** (`TAVERN.INF` paints `BARTEND.DFA` and eight
    // MAN/WOMAN drinkers), and those are still people: their picture is drawn by the scenery
    // pass and their record is a person to speak to. So "inhabited" counts both halves, and
    // "everyone drawn" is the live count plus the still people's art in the scenery batches.
    const stillArts = new Set((inn.stillPeople ?? []).map((person) => person.art));
    const drawnStill = [...stillArts].filter((art) => (inn.scenery?.names ?? []).includes(art));
    check('a building is inhabited, not infested: no monsters, everyone drawn',
      inn.townsfolk + stillArts.size >= 1 && inn.monsters === 0
      && inn.figures === inn.townsfolk && drawnStill.length === stillArts.size,
      `${inn.townsfolk} walkers · ${stillArts.size} still (${drawnStill.length} drawn) · ${inn.monsters} monsters · ${inn.figures} live billboards`);
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
      const house = doors.find((d) => d.kind === 'house' && d.stand) ?? doors.find((d) => d.family === 'BS');
      return JSON.stringify(house ?? null);
    })()`));
    check('a city has homes whose own doors are on their walls',
      Boolean(houseDoor) && /^BS\d\.MIF$/.test(houseDoor.file ?? '')
        && houseDoor.wall === true && /^T_DBS/.test(houseDoor.sign ?? ''),
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

    // ── the palace ────────────────────────────────────────────────────────────
    //
    // The owner, 2026-10-17: *"all main cities and not villages need to have palaces with
    // conts/JARLS"*, and *"you still also havent introduced the KING and QUEENS SPRITES to use in
    // palaces"*. A city's own door nearest its middle is the palace (the install's `PALACE1…5`
    // throne rooms), and its deepest chamber holds the court, drawn from `KING.IMG`,
    // `QUEEN.IMG` and `PRINCE.IMG` — stills, which is what Arena's static NPCs are.
    await page.evalJs('window.__debug.leaveBuilding()');
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
      { label: 'back on the street for the palace', timeoutMs: 90000 });
    const palaceDoor = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("palace"))'));
    check('a city has a palace among its doors, with the install\'s own throne room behind it',
      palaceDoor?.kind === 'palace' && /^PALACE[1-5]\.MIF$/.test(palaceDoor?.file ?? ''),
      JSON.stringify(palaceDoor));
    if (palaceDoor) {
      await settle();
      await page.pressKey('KeyE');
      await page.pressKey('KeyE', false);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
        { label: 'inside the palace', timeoutMs: 90000 });
      await awaitDrawn();
      const palace = await page.evalJs('window.__debug.state()');
      check('the palace opens on a throne room, not a shop counter',
        /^PALACE[1-5]\.MIF$/.test(palace.map) && palace.shops.kind === 'palace'
        && palace.shops.keeperBank === null,
        `${palace.map} · kind=${palace.shops.kind} · bank=${palace.shops.keeperBank}`);
      check('and the court is drawn in it: a king, a queen and an heir',
        palace.court?.length === 3
        && palace.court.every((figure) => ['KING.IMG', 'QUEEN.IMG', 'PRINCE.IMG'].includes(figure.art))
        && palace.court.every((figure) => figure.label && figure.row >= 0 && figure.col >= 0),
        JSON.stringify(palace.court));
      check('and the court is in the room\'s own scenery, so it is really painted',
        (palace.scenery?.names ?? []).includes('KING.IMG')
        && (palace.scenery?.names ?? []).includes('QUEEN.IMG'),
        JSON.stringify(palace.scenery?.names ?? null));
      // **Size is what the owner saw, twice.** First *"GUARDS AND KINGS ARE WAY TOO BIG IN THE
      // PALACE"* — the court went through the scenery pass's landscape split and took a wall
      // tile's density: a 3.16 m king, a 3.24 m queen, a 3.83 m guard. Then, after the band was
      // written, *"the non walking npcs are too small"* — the floor was 1.55 m while the street's
      // own walking citizens are drawn at 1.8 m from their 102-pixel art, so every still person in
      // a room stood a head under the people outside it. The band is now the crowd's own: 1.75 m to
      // 2.0 m (`flats.js`'s `MIN_PERSON_HEIGHT`/`MAX_PERSON_HEIGHT`), and this check holds the page
      // to it rather than to a loose "roughly a person".
      check('and every figure in it is drawn at the crowd\'s own height, the king and the guard included',
        (palace.court ?? []).length === 3
        && palace.court.every((figure) => figure.height >= 1.7 && figure.height <= 2.0)
        && (palace.scenery?.people ?? []).length > 0
        && (palace.scenery?.people ?? []).every((person) => person.height >= 1.7 && person.height <= 2.0),
        JSON.stringify({ court: (palace.court ?? []).map((f) => ({ art: f.art, h: f.height })),
          people: palace.scenery?.people ?? null }));
      await page.evalJs('window.__debug.leaveBuilding()');
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
        { label: 'back on the street after the palace', timeoutMs: 90000 });
    }

    // ── the king's house, and the mirror inside it ────────────────────────────
    //
    // The owner, 2026-10-21: *"ensure yourself buying a house at the jarl/king works when you
    // have 10 friends in that city and add a mirror wall inside the house … that if you click
    // you can change your third person character again like in character creation"*. The
    // palace is already open from the check above; the ledger is made a friend's, the king's
    // own sale is run, and the page it lands on is read back. Then the mirror: the flat is in
    // the room, its page opens, and a body chosen there is the body the third person draws.
    await page.evalJs('window.__debug.teleportToDoor("palace")');
    await settle();
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
      { label: 'inside the palace for the house', timeoutMs: 90000 });
    const beforeFriends = await page.evalJs('window.__debug.house()');
    check('the king refuses a stranger: no friends, no deed',
      beforeFriends.offer.ok === false && /friends/.test(beforeFriends.offer.reason),
      JSON.stringify(beforeFriends.offer));
    const friends = await page.evalJs('window.__debug.befriendCity(10)');
    await page.evalJs('window.__debug.giveGold(6000)');
    const offer = await page.evalJs('window.__debug.house()');
    check('ten friends of the city is what the king asks, and the offer opens',
      friends >= 10 && offer.offer.ok === true && offer.offer.required === 10,
      JSON.stringify({ friends, offer: offer.offer }));
    const bought = await page.evalJs('window.__debug.buyHouse()');
    await page.waitFor('window.__debug?.scene === "interior" && /^BS/.test(window.__debug.houseRoom().map)',
      { label: 'taken to the bought house', timeoutMs: 90000 });
    const room = await page.evalJs('window.__debug.houseRoom()');
    const after = await page.evalJs('window.__debug.house()');
    check('the deed is signed, the purse pays for it, and the player is walked to the house',
      bought === true && room.owned === true && offer.gold - 5000 === after.gold,
      JSON.stringify({ bought, owned: room.owned, map: room.map, gold: offer.gold }));
    check('the house holds the install\'s own mirror wall (NOB_C3.IMG) and its chest',
      room.mirror?.art === 'NOB_C3.IMG' && room.chest?.owned === true,
      JSON.stringify({ mirror: room.mirror, chest: room.chest }));
    await page.evalJs('window.__debug.mirror()');
    await settle();
    const mirrorPage = await page.evalJs('document.getElementById("inventory").textContent');
    const worn = await page.evalJs('window.__debug.chooseBody("armour-una-male")');
    await settle();
    const mirrored = await page.evalJs('window.__debug.state()');
    check('the mirror opens the body chooser, and the body chosen is the one on screen',
      /mirror/i.test(mirrorPage) && worn === true && mirrored.appearance?.spriteId === 'armour-una-male'
      && /UNA/.test(String(mirrored.playerView?.file ?? mirrored.playerView ?? '')),
      JSON.stringify({ page: mirrorPage.slice(0, 60), worn, appearance: mirrored.appearance, view: mirrored.playerView }));
    await page.evalJs('window.__debug.leaveBuilding()');
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().city !== null',
      { label: 'back on the street after the house', timeoutMs: 90000 });

    // ── the country's own doors (D-51's second half) ───────────────────────────
    //
    // The wilderness is the same law in a different `.INF`: a **wall** whose art the
    // environment's `*MENU` table binds is a door, and the country is full of them (measured:
    // 209 doors over the 66 shipped blocks — 154 farmhouses and barns, 19 taverns, 17 temples,
    // 13 towers, 6 crypts). Before this pass the only wilderness building a player could enter
    // was a dungeon. The cell below is a real one near Daggerfall: the crypt `WILD042` paints
    // at its own (12,55), in world cells (17420,11895).
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&wild=17419,11895&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'the country drawn', timeoutMs: 90000 });
    await page.evalJs('window.__debug.pause(true)');
    const country = await page.evalJs('window.__debug.state()');
    check('the country outside Daggerfall has doors painted on its walls',
      (country.wild?.blocks?.length ?? 0) > 0 && country.doors >= 1,
      `blocks ${JSON.stringify(country.wild?.blocks)} · ${country.doors} doors`);
    const countryDoor = (country.doorList ?? []).find((door) => door.country && door.stand);
    check('every country door names the building behind it, and the cell it opens from',
      Boolean(countryDoor) && /^(WCRYPT|TOWER|BS|TAVERN|TEMPLE)[1-8]\.MIF$/.test(countryDoor.file ?? '')
        && Number.isInteger(countryDoor.stand?.row) && Number.isInteger(countryDoor.stand?.col),
      JSON.stringify(countryDoor ?? null));
    if (countryDoor) {
      await page.evalJs(`window.__debug.teleportCell(${countryDoor.stand.row}, ${countryDoor.stand.col})`);
      await settle();
      await page.pressKey('KeyE'); await page.pressKey('KeyE', false);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
        { label: `inside ${countryDoor.file}`, timeoutMs: 90000 });
      const room = await page.evalJs('window.__debug.state()');
      check('the country door opens onto exactly the room its own art named',
        room.map === countryDoor.file, `${countryDoor.sign} → ${room.map} (wanted ${countryDoor.file})`);
      // A crypt holds nobody of its own; a tower keeps a watch. Either way the page is a real
      // building with an exit, not an empty box the door happens to lead to.
      check('and it is a building, with its own kind and its way out',
        /^(crypt|tower|house|tavern|temple)$/.test(room.shops?.kind ?? '')
          && Boolean(room.inside) && room.map === countryDoor.file,
        `${room.map} · kind=${room.shops?.kind} · keeper=${room.shops?.keeper?.name ?? room.shops?.keeper ?? null}`);
      await page.evalJs('window.__debug.leaveBuilding()');
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().wild !== null && window.__debug.state().doors >= 1',
        { label: 'back on the country', timeoutMs: 90000 });
      const after = await page.evalJs('window.__debug.state()');
      // **In the world's coordinates, not the window's.** The country window re-centres a block
      // at a time as the player crosses its middle band (`wildernessWindowOrigin`, D-36), so a
      // door in the upper half of a window comes back in a window one block further on — same
      // world cell, different local row. What the exit promises is the *place*, so that is what
      // is compared: the world cell the door was opened from.
      const doorWorld = {
        row: countryDoor.stand.row + country.wild.originRow,
        col: countryDoor.stand.col + country.wild.originCol,
      };
      const feet = { row: Math.floor(after.feet[0] / 2.5), col: Math.floor(after.feet[2] / 2.5) };
      check('leaving puts the player back on the very cell they opened the door from',
        after.wild?.cell?.row === doorWorld.row && after.wild?.cell?.col === doorWorld.col
          && feet.row === after.wild.cell.row - after.wild.originRow
          && feet.col === after.wild.cell.col - after.wild.originCol,
        `back at world ${after.wild?.cell?.row},${after.wild?.cell?.col} (feet ${feet.row},${feet.col}, window ${after.wild?.originRow},${after.wild?.originCol})`
          + ` · door world ${doorWorld.row},${doorWorld.col}`);
    }

    // ── and a crypt is a lair, not a household ────────────────────────────────
    //
    // The country's door into a tomb used to arrive "inhabited": `populate` keyed its quiet on
    // `entryCell` (the `?enter=` a door writes), so a crypt entered the only way a player can
    // enter one fielded none of its own roster and stood as empty as a shut shop. Measured after
    // the fix: six creatures out of `WCRYPT.INF`'s eight species, no townsfolk, and the level's
    // own treasure and key still on the floor.
    // The **entry** window's list, on a page loaded for it: the return from the tavern re-centres
    // the window (the player is 44 cells from the door they used), so the tomb's local cell only
    // means anything on the window `country` was read from. (`back` above is the *city's* state —
    // the first cut of this check read that one and found three hundred shop doors.)
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&wild=17419,11895&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label: 'the country drawn again', timeoutMs: 90000 });
    await page.evalJs('window.__debug.pause(true)');
    const crypt = (country.doorList ?? []).find((door) => door.kind === 'crypt' && door.stand);
    check('the same country window has a crypt door, so the lair law can be tested',
      Boolean(crypt), JSON.stringify((country.doorList ?? []).map((d) => d.kind)));
    if (crypt) {
      await page.evalJs(`window.__debug.teleportCell(${crypt.stand.row}, ${crypt.stand.col})`);
      await settle();
      await page.pressKey('KeyE'); await page.pressKey('KeyE', false);
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().inside !== null',
        { label: `inside ${crypt.file}`, timeoutMs: 90000 });
      const tomb = await page.evalJs('window.__debug.state()');
      check('a crypt entered from its own country door holds the things that live in it',
        tomb.map === crypt.file && (tomb.monsters ?? 0) >= 1,
        `${tomb.map} · ${tomb.monsters} monsters · roster ${JSON.stringify(tomb.monsterRoster ?? null)}`);
      check('and a tomb is not a household: nobody lives in it',
        (tomb.townsfolk ?? 0) === 0 && tomb.shops?.kind === 'crypt',
        `${tomb.townsfolk ?? 0} people · kind=${tomb.shops?.kind}`);
      const grave = tomb.loot ?? [];
      check('and its graves hold something — a treasure and the key to its own lock',
        grave.some((spot) => spot.kind === 'treasure') && grave.some((spot) => spot.kind === 'key'),
        JSON.stringify(grave.map((spot) => `${spot.kind}@${spot.row},${spot.col}`)));
      // ── the tomb's own depth (D-53) ──────────────────────────────────────────
      // The archive draws the deeper storey and its stair from below but **no down stair** on the
      // entrance floor, so the second level stood unreachable. The pair is completed from the
      // data's own half; the player walks to it, takes it, and comes back up.
      const stairs = await page.evalJs('JSON.stringify(window.__debug.stairs())').then(JSON.parse);
      check('the crypt\'s entrance floor can be walked down, though the file draws no down stair',
        stairs?.filled?.at?.length === 1 && stairs.down >= 1,
        JSON.stringify({ down: stairs?.down, filled: stairs?.filled?.at ?? null }));
      if (stairs?.filled?.at?.[0]?.stand) {
        const step = stairs.filled.at[0];
        await page.evalJs(`window.__debug.teleportCell(${step.stand.row}, ${step.stand.col})`);
        await settle();
        const down = await page.evalJs('(async () => JSON.stringify(await window.__debug.useStair()))()').then(JSON.parse);
        await page.waitFor('window.__debug.state().level === 1', { label: 'the crypt\'s second floor', timeoutMs: 90000 });
        const deep = await page.evalJs('window.__debug.state()');
        check('and the floor below is a real storey: its own level, its own creatures',
          deep.level === 1 && deep.map === crypt.file && (deep.monsters ?? 0) >= 1,
          `${deep.map} level ${deep.level + 1}/${deep.levelCount} · ${deep.monsters} monsters`);
        // …and the way back up is the stair the archive did draw, at the floor below's own cell.
        const back = await page.evalJs('JSON.stringify(window.__debug.stairs())').then(JSON.parse);
        const up = (back?.list ?? []).find((cell) => cell.stair === 'up' && cell.stand);
        check('the second floor carries the up stair the archive drew', Boolean(up),
          JSON.stringify((back?.list ?? []).map((cell) => `${cell.stair}@${cell.row},${cell.col}`)));
        if (up) {
          await page.evalJs(`window.__debug.teleportCell(${up.stand.row}, ${up.stand.col})`);
          await settle();
          const climbed = await page.evalJs('(async () => JSON.stringify(await window.__debug.useStair()))()').then(JSON.parse);
          await page.waitFor('window.__debug.state().level === 0', { label: 'back on the entrance floor', timeoutMs: 90000 });
          const top = await page.evalJs('window.__debug.state()');
          check('and it brings the player back up to the floor they came down from',
            top.level === 0 && down?.ok === true && climbed?.ok === true,
            `level ${top.level} · down ${down?.ok} · up ${climbed?.ok} · history ${JSON.stringify(await page.evalJs('window.__debug.stairs().history'))}`);
        }
      }
      await page.evalJs('window.__debug.leaveBuilding()');
      await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().wild !== null',
        { label: 'back out of the tomb', timeoutMs: 90000 });
      const out = await page.evalJs('window.__debug.state()');
      check('and the tomb lets the player out again onto the country',
        out.wild !== null && (out.doors ?? 0) >= 1, `${out.doors} doors · wild=${out.wild !== null}`);
    }

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
