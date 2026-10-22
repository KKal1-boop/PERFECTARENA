// THE TWO MAPS, ON A REAL PAGE — `M` is Tamriel from everywhere, `Tab` is this level.
//
//   node tests/run-browser.mjs automap
//
// The owner's correction of 2026-10-17 is the first check in this file: *"your local map made it
// impossible to open the entire tamriel map the game had cause you put it on M"*. The automap
// must never take the world map's key, so the suite asserts **both** halves from the same room:
//
//   1. `M` in a dungeon opens **Tamriel**, exactly as it did before the automap existed.
//   2. `Tab` opens **the level's automap** — and the sheet itself offers the hand-over.
//
// The unit tests (`tests/unit/automap.test.mjs`) hold the reference's palette, voxel law, eight
// 3×3 arrows and marker arithmetic. This suite holds the player's half:
//
//   3. the sheet is the level's own (START.MIF's floors, walls, doors and its single up-stair);
//   4. opening it stops the world;
//   5. it is really painted — the canvas's own pixels, not the report's word;
//   6. the arrow is exactly the 3×3 pattern, in the player's cell;
//   7. it points the way the camera faces;
//   8. the hand-over button opens Tamriel and closes the sheet;
//   9. `Escape` closes it and the world resumes;
//  10. a tavern — a building, not a dungeon — gets the same map;
//  11. a city's `M` is still the world map.

export function makeAutomapSuite({ check, realErrors, getPort }) {
  return async function automap(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const ready = () => page.waitFor('window.__debug?.state && window.__debug.state().painted > 3', {
      timeoutMs: 90000, label: 'a level',
    });
    const key = async (code) => {
      await page.pressKey(code, true);
      await page.pressKey(code, false);
    };
    const report = () => page.evalJs('window.__debug.automap()');
    const state = () => page.evalJs('window.__debug.state()');
    const worldMapOn = () => page.waitFor(
      'Boolean(document.getElementById("map")?.classList.contains("on"))',
      { timeoutMs: 60000, label: 'the world map' },
    ).then(() => true).catch(() => false);
    const worldMapOff = () => page.waitFor(
      '!document.getElementById("map")?.classList.contains("on")',
      { timeoutMs: 30000, label: 'the world map closed' },
    ).then(() => true).catch(() => false);

    // ── 1. `M` is Tamriel, even in a dungeon ──────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?interior=START.MIF&${q}`);
    await ready();
    await page.evalJs('window.__debug.look(0, 0)');
    const shut = await report();
    await key('KeyM');
    const tamriel = await worldMapOn();
    const whileMap = await report();
    check('`M` in a dungeon still opens the entire map of Tamriel — the automap does not own the key',
      tamriel === true && whileMap.open === false && shut.open === false,
      `world map ${tamriel}, automap ${whileMap.open}, world-map key kept`);

    // Put Tamriel away with its own key, then ask for the level.
    await key('KeyM');
    const closedMap = await worldMapOff();
    await key('Tab');
    const open = await report();
    check('…and `Tab` is the level’s own automap, so both maps are always reachable',
      closedMap === true && open.open === true && open.eligible === true && open.map === 'START.MIF',
      `world map closed ${closedMap}, Tab → automap ${open.open} on ${open.map}`);

    // ── 2. the sheet is the level's own ───────────────────────────────────────
    check('the panel is the map of the level the player is standing in, named and numbered',
      open.summary.floors > 100 && open.summary.walls > 100 && open.summary.doors > 0
        && open.summary.up === 1 && open.summary.down === 0
        && /level 1 of 1/.test(open.sub) && new RegExp(open.map).test(open.title),
      `${open.summary.floors} floors · ${open.summary.walls} walls · ${open.summary.doors} doors · `
        + `${open.summary.up} up · ${open.summary.down} down — "${open.title}"`);
    check('opening the map stops the world, which is what a page of parchment is for',
      open.open === true && (await state()).paused === true,
      `paused ${shut.paused} → ${(await state()).paused}`);

    // ── 3. the canvas's own pixels ────────────────────────────────────────────
    const pixels = await page.evalJs(`(() => {
      const c = document.getElementById('automap-canvas');
      if (!c || !c.getContext) return null;
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let parchment = 0, ink = 0, yellow = 0, other = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r === 0xc9 && g === 0xb7 && b === 0x8f) parchment++;
        else if (r === 0xf7 && g === 0xff && b === 0) yellow++;
        else if (r === 0x82 && g === 0x59 && b === 0x30) ink++;
        else if (d[i + 3]) other++;
      }
      return { width: c.width, height: c.height, parchment, ink, yellow, other };
    })()`);
    const drawn = open.drawn ?? {};
    check('the sheet is painted: parchment, wall ink, and the reference’s yellow arrow',
      Boolean(pixels) && pixels.parchment > 1000 && pixels.ink > 100 && pixels.yellow > 0
        && drawn.scale > 0 && drawn.scale % 3 === 0 && drawn.arrowPixels > 0,
      `${pixels?.width}×${pixels?.height}: ${pixels?.parchment} parchment, ${pixels?.ink} wall, `
        + `${pixels?.yellow} arrow pixels at cell scale ${drawn.scale}`);
    check('the arrow is exactly the 3×3 pattern, in whole pixels, inside the player’s own cell',
      Boolean(pixels) && Number.isInteger(drawn.scale) && drawn.scale % 3 === 0
        && pixels.yellow === (drawn.arrowPixels ?? 0) * (drawn.scale / 3) ** 2
        && open.marker?.inside === true,
      `${pixels?.yellow} yellow pixels = ${drawn.arrowPixels} pattern pixels × (${drawn.scale}/3)², `
        + `marker ${open.marker?.row},${open.marker?.col} ${open.marker?.direction}`);

    // ── 4. the marker is the player's cell, and turns with the camera ────────
    const feet = (await state()).feet;
    const cellSize = 2.5;
    check('the arrow stands on the cell the feet stand in',
      open.marker?.row === Math.floor(feet[0] / cellSize)
        && open.marker?.col === Math.floor(feet[2] / cellSize),
      `feet ${feet.map((n) => Math.round(n * 100) / 100).join(', ')} → `
        + `cell ${open.marker?.row},${open.marker?.col}`);
    await key('Tab');                       // close
    await page.evalJs('window.__debug.look(Math.PI / 2, 0)');
    await key('Tab');                       // open on the new heading
    const turned = await report();
    check('and it points the way the camera faces — a quarter turn is a different arrow',
      open.marker?.direction === 'east' && turned.marker?.direction === 'south',
      `${open.marker?.direction} at yaw 0 → ${turned.marker?.direction} at yaw π/2`);

    // ── 5. the sheet offers Tamriel, so neither map is ever a dead end ───────
    const buttonThere = await page.evalJs(`(() => {
      const b = document.querySelector('[data-automap="worldmap"]');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    const handedOver = await worldMapOn();
    const afterHand = await report();
    check('the automap’s own button hands the player to the world map, and puts the sheet away',
      buttonThere === true && handedOver === true && afterHand.open === false,
      `button ${buttonThere}, world map ${handedOver}, automap ${afterHand.open}`);

    // Close the world map, then prove Escape is the automap's own exit and the world resumes.
    await key('KeyM');
    await worldMapOff();
    await key('Tab');
    const reopened = await report();
    await key('Escape');
    const closed = await report();
    const after = await state();
    check('Escape puts the map away, and the world resumes where it was paused',
      reopened.open === true && closed.open === false && after.paused === false
        && Math.abs(after.feet[0] - feet[0]) < 0.001 && Math.abs(after.feet[2] - feet[2]) < 0.001,
      `open ${reopened.open} → ${closed.open}, paused ${after.paused}, feet kept ${after.feet[0] === feet[0]}`);

    // ── 6. a building has one too ─────────────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?interior=TAVERN6.MIF&${q}`);
    await ready();
    await key('Tab');
    const tavern = await report();
    check('a building interior gets the same map — a tavern is a level too',
      tavern.eligible === true && tavern.open === true && tavern.map === 'TAVERN6.MIF'
        && tavern.summary.floors > 0 && tavern.drawn?.painted > 0,
      `${tavern.map}: eligible ${tavern.eligible}, open ${tavern.open}, `
        + `${tavern.summary.floors} floor cells, ${tavern.drawn?.painted ?? 0} cells painted`);
    await key('Escape');

    // ── 7. a city keeps the world map ────────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await ready();
    const cityShut = await report();
    await key('KeyM');
    const cityWorldMap = await worldMapOn();
    const cityOpen = await report();
    check('in a city `M` is Tamriel, and `Tab` has no level sheet to offer',
      cityShut.eligible === false && cityOpen.open === false && cityWorldMap === true,
      `eligible ${cityShut.eligible}, automap ${cityOpen.open}, world map ${cityWorldMap}`);

    const errs = realErrors(page.consoleErrors());
    check('the two maps leave no console error behind', errs.length === 0,
      errs.map((e) => e.text).join(' | ').slice(0, 400));
  };
}
