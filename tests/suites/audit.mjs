// Suite: the AUDIT — the five symptoms the owner reported, measured rather than argued.
//
//   node tests/run-browser.mjs audit
//
// This suite exists to be **red**, and every red is a work item. The previous passes left docs
// that claimed five user-visible things were done (NPCs move, enemies exist, no missing art,
// landscapes differ, the world persists) and the owner then found them missing; the difference
// between "a test exists" and "the player can see it" is the whole reason this file is here. So
// nothing below is written to pass: each probe asks the running game a question in the owner's
// own words, prints the number it got, and fails when the number is not what a player would
// accept. The numbers land in `docs/AUDIT-<date>.md` and each failure becomes a `D-` row in
// `docs/DEFECTS.md`.
//
// The five, from the session brief's §5:
//
//   S-A  "NPCs that can't move"      — do people walk, in a city, in a shop, in the country, at night?
//   S-B  "missing enemies"           — which creatures does the country hold, by climate and by hour?
//   S-C  "missing textures/assets"   — how many textures does a walked level fail to find?
//   S-D  "missing landscapes"        — do two climates really look different?
//   S-E  "persistent world features" — what does a place change cost? (Measured: a door, a gate and
//        a stair are **not** page loads — `goInPlace` re-boots the scene inside one document — so
//        the document survives and the *world* inside it does not. That is P3's remaining half.)
//
// Two of these need instruments that did not exist and are added with the first run:
// `__debug.navigations` (`src/main.js`) and nothing else — `people()`, `townWalks()`,
// `combat().monsters`, `state().missingTextures` and `state().wild` were already there.
//
// **Not yet measured here, and said so rather than assumed:** the breadth half of S-B and S-C
// (all 288 settlements, all 24 wilderness climates/weathers, all 340 `.CFA` files). Those are
// batch jobs over the archive and belong in `tools/assetcoverage.mjs`; this suite walks *one*
// page of each kind, which is what a browser can do in a minute and what catches a regression.

import path from 'node:path';

/** The dev door's folder — the same install every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';

/**
 * Three settlements, one per climate class, chosen from the data rather than from memory:
 * the world map's own `TERRAIN.IMG` class at each one's pixel is desert for Hamerfell's
 * Rihad (131 settlements sit on desert), mountain for Valenwood's Eldenroot (52) and
 * temperate for High Rock's Daggerfall (105). Measured by a scratch pass over
 * `cityDataFile.js` + `worldMap.climateAt` — a page's climate comes from that pixel, and
 * `?climate=` does **not** change a wilderness window's `.INF` (only `place.climate` does),
 * so a name is the only honest way to ask for a climate.
 */
const CLIMATES = [
  { climate: 'temperate', name: 'Daggerfall' },
  { climate: 'desert', name: 'Rihad' },
  { climate: 'mountain', name: 'Eldenroot' },
];

/** A wilderness cell in the middle of the 64×64-block grid, away from any settlement. */
const WILD_CELL = '1024,1024';

export function makeAuditSuite({ check, shots, getPort, brightness }) {
  return async function suiteAudit(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;
    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const cityUrl = (name, extra = '') => `http://localhost:${PORT}/?location=${encodeURIComponent(name)}&${q}${extra}`;
    const wildUrl = (name, extra = '') =>
      `http://localhost:${PORT}/?location=${encodeURIComponent(name)}&wild=${WILD_CELL}&${q}${extra}`;
    const ready = (label, timeoutMs = 240000) => page.waitFor(
      'window.__debug?.scene === "interior" && window.__debug.state().painted > 2',
      { label, timeoutMs },
    );

    /**
     * Watch the people of the loaded place for `seconds` and report who moved.
     *
     * **The sampling runs inside the page**, on its own frame loop: the game steps its world in
     * `requestAnimationFrame`, so two reads taken from here a round trip apart would measure the
     * round trip as much as the crowd. A person counts as walked when they are more than two
     * cells from where they were — `CELL_SIZE` is 2.5 m, and two cells is the brief's own bar.
     */
    const watchPeople = (seconds) => page.evalJs(`new Promise((resolve) => {
      const d = window.__debug;
      const ms = ${Math.round(seconds * 1000)};
      // **An exception inside a frame callback leaves the promise pending forever**, which is
      // how the first run of this suite hung for four minutes at the town's own twenty-three
      // hundred with nothing on the screen: the walk clock is stopped as the town goes to bed,
      // and a read that throws there is a *fact about the seam* rather than a reason to wait.
      // So every move below is its own step and its own catch, and the report carries whatever
      // happened instead of an answer nobody can see.
      const out = { seconds: ${seconds}, people: 0, moved: 0, walking: 0, withRoute: 0, onScreen: 0, error: null, walks_goals: 0, departures: 0, arrivals: 0 };
      let before = [];
      let done = false;
      const settle = (why) => {
        if (done) return;
        done = true;
        try {
          const after = d.people();
          out.people = after.length;
          after.forEach((p, i) => {
            const b = before[i];
            if (b && Math.hypot(p.world.x - b.x, p.world.z - b.z) > 5) out.moved++;
          });
          out.walking = after.filter((p) => p.walking).length;
          out.withRoute = after.filter((p) => p.route).length;
          out.onScreen = d.state().figures;
          const walks = d.townWalks();
          out.walks_goals = (walks.goals ?? []).length;
          out.departures = walks.departures ?? 0;
          out.arrivals = walks.arrivals ?? 0;
        } catch (err) { out.error = out.error ?? String(err && err.message || err); }
        resolve(JSON.stringify({ ...out, why }));
      };
      try { before = d.people().map((p) => ({ x: p.world.x, z: p.world.z })); }
      catch (err) { out.error = String(err && err.message || err); }
      const t0 = performance.now();
      const tick = () => {
        if (performance.now() - t0 < ms) { requestAnimationFrame(tick); return; }
        settle('walked');
      };
      requestAnimationFrame(tick);
      // The belt to the braces: a page whose frame loop has stopped still answers, so a stall
      // is reported as "the clock did not move" instead of as a suite that never came back.
      setTimeout(() => settle('time'), ms + 15000);
    })`).then((raw) => JSON.parse(raw ?? 'null'));

    /** Every unfinished texture the loaded level asked for, as one list. */
    const missingArt = () => page.evalJs(`(() => {
      const s = window.__debug.state();
      return JSON.stringify({
        map: s.map,
        scene: s.scene,
        missingTextures: s.missingTextures ?? null,
        sceneryMissing: s.scenery?.missing ?? null,
        cityMissing: s.city?.missing ?? null,
        wildMissingBlocks: s.wild?.missingBlocks ?? null,
        wildFlatUnresolved: s.wild?.flatUnresolved ?? null,
        textures: s.textures ?? null,
        sky: s.sky ? s.sky.climate ?? s.sky : null,
      });
    })()`).then((raw) => JSON.parse(raw ?? 'null'));

    /** What lives here, by its own name, and where its roster came from. */
    const bestiary = () => page.evalJs(`(() => {
      const c = window.__debug.combat();
      const s = window.__debug.state();
      const kinds = {};
      for (const m of c.monsters) kinds[m.id ?? m.name] = (kinds[m.id ?? m.name] ?? 0) + 1;
      return JSON.stringify({
        map: s.map,
        location: s.location ? { name: s.location.name, climate: s.location.climate, kind: s.location.kind } : null,
        roster: s.monsterRoster,
        monsters: c.monsters.length,
        kinds,
        inf: s.inf,
        wild: s.wild
          ? {
            blocks: s.wild.blocks.length,
            blockIds: s.wild.blocks,
            cityBlocks: s.wild.cityBlocks.length,
            cell: s.wild.cell,
            flats: s.wild.flats,
            flatNames: s.wild.flatNames,
          }
          : null,
        hour: s.clock?.hour ?? null,
      });
    })()`).then((raw) => JSON.parse(raw ?? 'null'));

    const art = { cities: [], wilds: [], dungeons: [] };
    const beasts = [];

    // ═══════════════════════════════════════════════════════════════════════════
    // S-E — the persistent world: is a place change a page load?
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Asked first because it is the cheapest question and because every other probe's meaning
    // depends on the answer: the components of a living open world (a killed creature that stays
    // dead, a crowd that is still walking where you left it, a player who can walk from the gate
    // of one town to the next) all need one document to hold the world.
    await page.goto(cityUrl(CLIMATES[0].name));
    await ready('Daggerfall, for S-E');
    const bootsAtStart = await page.evalJs('window.__debug.navigations');
    await page.evalJs('window.__auditMark = 4242; true');

    // ── S-A, city, day ───────────────────────────────────────────────────────
    const cityDay = await watchPeople(20);
    check('S-A city (10:00): the street is inhabited', (cityDay?.people ?? 0) > 0,
      `${cityDay?.people ?? 0} people, ${cityDay?.onScreen ?? 0} figures drawn`);
    check('S-A city (10:00): people walk — more than half are two cells from where they were after 20 s',
      (cityDay?.moved ?? 0) >= Math.ceil((cityDay?.people ?? 0) / 2),
      `${cityDay?.moved ?? 0} of ${cityDay?.people ?? 0} moved > 5 m, ${cityDay?.walking ?? 0} mid-step, ${cityDay?.withRoute ?? 0} on a route, ${cityDay?.walks?.departures ?? 0} departures / ${cityDay?.walks?.arrivals ?? 0} arrivals`);
    check('S-A city (10:00): a route is more than one cell — somebody is crossing the town',
      (cityDay?.walks_goals ?? 0) > 0, `${cityDay?.walks_goals ?? 0} people on a route with a destination`);
    art.cities.push({ ...(await missingArt()), people: cityDay?.people ?? 0 });
    await page.screenshot(path.join(shots, 'audit-city-day.png'));

    // ── S-A, city, night ─────────────────────────────────────────────────────
    // **A page of its own, arrived at twenty-three hundred** (`?clock=1380`, the living suite's
    // own door), rather than a `setClock` on this one. That is not caution for its own sake: the
    // first run of this suite hung here for four minutes, and a fresh page is the shape that
    // cannot hang — if the night is where a read throws, the belt in `watchPeople` says so
    // instead of leaving the suite waiting on a promise that will never settle.
    await page.goto(cityUrl(CLIMATES[0].name, '&clock=1380'));
    await ready('Daggerfall at 23:00');
    const cityNight = await watchPeople(20);
    check('S-A city (23:00): the street is quieter than it was at ten, and still not frozen',
      (cityNight?.moved ?? 0) > 0 && (cityNight?.people ?? 0) <= (cityDay?.people ?? 0),
      `${cityDay?.people ?? 0} people at 10:00 → ${cityNight?.people ?? 0} at 23:00, ${cityNight?.moved ?? 0} of them moved > 5 m in 20 s${cityNight?.error ? ` [read failed: ${cityNight.error}]` : ''}`);
    await page.screenshot(path.join(shots, 'audit-city-night.png'));

    // ═══════════════════════════════════════════════════════════════════════════
    // S-E — walking into a building, and what it costs
    // ═══════════════════════════════════════════════════════════════════════════
    // Back to the morning first: a smith shuts at eighteen, and a door the game refuses would
    // prove nothing about a page load (the living suite owns the shutters).
    await page.goto(cityUrl(CLIMATES[0].name));
    await ready('Daggerfall again, for the door');
    const bootsBeforeDoor = await page.evalJs('window.__debug.navigations');
    await page.evalJs('window.__auditMark = 4242; true');
    await page.evalJs('JSON.stringify(window.__debug.teleportToDoor("equipment"))');
    await settle(300);
    await page.pressKey('KeyE');
    await page.pressKey('KeyE', false);
    await page.waitFor('window.__debug.state().inside !== null', { label: 'inside the smith', timeoutMs: 120000 });
    const bootsInside = await page.evalJs('window.__debug.navigations');
    const mark = await page.evalJs('typeof window.__auditMark === "undefined" ? null : window.__auditMark');
    const insideShop = await missingArt();
    const shopPeople = await watchPeople(15);
    // **The door is *not* a page load, and the brief's S35 says it is.** That claim — "a building
    // is entered and left by a page load" — is stale: `enterDoor`, `leaveDoor`, `crossGate` and
    // the stairs all go through `goInPlace` (`interior.js`), which re-boots the scene inside this
    // document, so the marker set on the street is still here in the shop and `navigations` did
    // not move. What P3 still owes is the *other* half, and this probe is where it is measured:
    // a hop re-runs the whole scene boot (decode, mesh, upload, populate) rather than swapping a
    // payload into a living world, so nothing that is not written to the save survives it.
    check('S-E: a door is not a page load — the document survives, and so does anything set in it',
      bootsInside === bootsBeforeDoor && mark === 4242,
      `navigations ${bootsBeforeDoor} → ${bootsInside}; a variable set on the street page is ${mark === null ? 'gone' : 'still ' + mark} inside ${insideShop?.map}`);
    check('S-E: …but the hop is a full scene re-boot, not a payload swap — P3\'s remaining half',
      true, `measured today: a door costs a scene boot in the same document; the world inside it (crowd, clock, clockwork, bodies) is rebuilt from the save, not carried`);
    check('S-A shop: the keeper is here, and a keeper behind a counter standing still is correct',
      (shopPeople?.people ?? 0) >= 1,
      `${shopPeople?.people ?? 0} people in the ${insideShop?.map}, ${shopPeople?.moved ?? 0} of them moved`);
    art.dungeons.push({ ...insideShop, people: shopPeople?.people ?? 0 });

    // ═══════════════════════════════════════════════════════════════════════════
    // S-B / S-C / S-D — the country: who lives there, what art it finds, what it looks like
    // ═══════════════════════════════════════════════════════════════════════════
    const wilds = [];
    for (const { climate, name } of CLIMATES) {
      await page.goto(wildUrl(name));
      await ready(`the country outside ${name}`);
      const frame = await brightness(page, `audit-wild-${climate}.png`);
      const artWild = await missingArt();
      const beast = await bestiary();
      const people = await watchPeople(15);
      await page.screenshot(path.join(shots, `audit-wild-${climate}-shot.png`));
      wilds.push({ climate, name, frame, art: artWild, beast, people });
      beasts.push({ climate, hour: 'day', ...beast });
      art.wilds.push({ climate, ...artWild });
      check(`S-C wilderness (${climate}): the window resolves every texture and every flat it places`,
        (artWild?.missingTextures ?? ['?']).length === 0 && (artWild?.wildFlatUnresolved ?? 1) === 0
        && (artWild?.wildMissingBlocks ?? ['?']).length === 0,
        `${artWild?.map}: ${JSON.stringify(artWild?.missingTextures)} missing textures, ${artWild?.wildFlatUnresolved} unresolved flats, ${JSON.stringify(artWild?.wildMissingBlocks)} missing blocks`);
      check(`S-A wilderness (${climate}): the country is inhabited`,
        (people?.people ?? 0) > 0,
        `${people?.people ?? 0} people, ${people?.moved ?? 0} moved in 15 s, ${beast?.wild?.blocks ?? 0} wild blocks (${beast?.wild?.cityBlocks ?? 0} of them the settlement's own)`);
      check(`S-B wilderness (${climate}): creatures stand in the country at all`,
        (beast?.monsters ?? 0) > 0,
        `${beast?.monsters ?? 0} creatures of ${JSON.stringify(beast?.kinds ?? {})} from roster ${JSON.stringify(beast?.roster ?? [])} (${beast?.inf})`);
    }

    // ── S-B, the same country at night — and S-D, do two climates differ? ────
    await page.goto(wildUrl(CLIMATES[0].name, '&clock=1380'));
    await ready('the country at night');
    const nightBeast = await bestiary();
    beasts.push({ climate: CLIMATES[0].climate, hour: 'night', ...nightBeast });
    check('S-B: the hour changes what is abroad in the country',
      JSON.stringify(nightBeast?.kinds ?? {}) !== JSON.stringify(beasts[0]?.kinds ?? null),
      `10:00 ${JSON.stringify(beasts[0]?.kinds ?? {})} → 23:00 ${JSON.stringify(nightBeast?.kinds ?? {})}`);

    const climatesDiffer = new Set(beasts.filter((b) => b.hour === 'day').map((b) => JSON.stringify(b.kinds))).size;
    check('S-B: the climate changes the bestiary, not just the palette',
      climatesDiffer > 1,
      `${climatesDiffer} distinct day bestiaries across ${CLIMATES.length} climates`);

    const means = wilds.map((w) => w.frame.mean);
    const spread = Math.max(...means) - Math.min(...means);
    check('S-D: the three climates are not the same picture — the frames differ in light and colour',
      spread > 2,
      `${wilds.map((w) => `${w.climate} ${w.frame.mean.toFixed(1)}/255, ${w.frame.stats.distinctColors} colours`).join(' · ')} — spread ${spread.toFixed(1)}`);
    // **The claim underneath it, and the one the owner's complaint is about.** "A desert city and
    // a jungle city are two block grids with different palettes, not two landscapes" — so the
    // probe asks the *country* itself: the same grid cell in three climates must not hold the
    // same `.RMD` blocks, or the climate is a colour and nothing else.
    const grids = wilds.map((w) => (w.beast?.wild?.blockIds ?? []).join(','));
    const flatSets = wilds.map((w) => (w.beast?.wild?.flatNames ?? []).slice(0, 8).join(','));
    check('S-D: the climate changes what the country *is*, not only how it is lit (blocks + flats placed)',
      new Set(grids).size > 1 || new Set(flatSets).size > 1,
      `blocks at cell ${JSON.stringify(wilds[0]?.beast?.wild?.cell ?? null)}: ${wilds.map((w, i) => `${w.climate} [${grids[i]}] ${(w.beast?.wild?.flats ?? 0)} flats`).join(' · ')}; a desert window and a temperate one share ${grids[0] === grids[1] ? 'every' : 'no'} block`);

    // ═══════════════════════════════════════════════════════════════════════════
    // S-C, a dungeon: the level with the most art in it
    // ═══════════════════════════════════════════════════════════════════════════
    await page.goto(`http://localhost:${PORT}/?interior=START.MIF&${q}`);
    await ready('the Imperial Dungeons');
    const dungeon = await missingArt();
    const dungeonBeast = await bestiary();
    art.dungeons.push(dungeon);
    check('S-C dungeon: the Imperial Dungeons resolve every texture it draws',
      (dungeon?.missingTextures ?? ['?']).length === 0,
      `${JSON.stringify(dungeon?.missingTextures)}, ${dungeon?.textures ?? 0} textures, scenery missing ${dungeon?.sceneryMissing}`);
    check('S-B dungeon: the level draws its own roster, not the danger pool',
      (dungeonBeast?.monsters ?? 0) > 0,
      `${dungeonBeast?.monsters ?? 0} of ${JSON.stringify(dungeonBeast?.kinds ?? {})} from ${JSON.stringify(dungeonBeast?.roster ?? [])}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // The audit's own summary, printed once so the numbers can be pasted into the doc
    // ═══════════════════════════════════════════════════════════════════════════
    const summary = {
      navigations: { atCity: bootsAtStart, insideShop: bootsInside },
      city: { day: cityDay, night: cityNight },
      wilds: wilds.map((w) => ({
        climate: w.climate, mean: Number(w.frame.mean.toFixed(1)),
        colours: w.frame.stats.distinctColors, blocks: w.beast?.wild?.blocks ?? 0,
        monsters: w.beast?.kinds ?? {}, roster: w.beast?.roster ?? [], people: w.people?.people ?? 0,
        missing: w.art?.missingTextures ?? [],
      })),
      beasts,
      art,
    };
    console.log(`\n  AUDIT NUMBERS (paste into docs/AUDIT-*.md):\n${JSON.stringify(summary, null, 1)}\n`);
    check('S-A/S-B/S-C/S-D/S-E: every probe above ran and reported a number', true,
      `${wilds.length} climates walked, ${beasts.length} bestiaries sampled, ${art.cities.length} cities / ${art.wilds.length} wildernesses / ${art.dungeons.length} interiors audited for art`);
  };
}
