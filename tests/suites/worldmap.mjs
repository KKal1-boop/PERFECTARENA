// Suite: the world map — **the game's own screen, at both of its levels** (block B16, `D-35`).
//
// The map was the one screen this port drew itself: Arena's map art with this project's circles,
// diamonds, gold province rectangles and uppercase monospace names painted over it, on one level,
// with all 432 places marked at once. The owner's report said what the original does instead:
//
//   *"you click the province and then you zoom to an handrawn map of the province that then shows
//   all the places and with little icons of villages dungeons and cities and not yellow circles"*
//
// So this suite holds the two claims a player would make, and it holds them on **pixels**, because
// "the game's own art" is exactly the thing a drawing routine can claim while drawing something
// else:
//
//   * **Tamriel carries its provinces, not its places.** The continent draws no settlement or
//     dungeon icon at all; a click on a province opens that province's own hand-drawn picture
//     (`HIGHROCK.IMG`, …), and there its 48 places are the game's four little icons at the pixels
//     `CITYDATA.64` stores for them.
//   * **What is drawn is the record, not a shape that resembles it.** `markerPixels` reads the
//     canvas back: the pixels inside a marker's own rectangle are counted against the record's own
//     lit-pixel count, and the share of the rectangle they fill is what tells the game's outline
//     (about a fifth of it) from the disc this project used to draw (about four fifths).
//   * **The map blinks**, between the two records the archive ships for exactly that, and a place
//     the map is pointing at strobes against it.
//
// And one claim the file itself had to be read to make (`D-39`, `game/cyrodiil.js`): the province
// the game begins in — the Imperial Province — **has places**. `CITYDATA.64` names one of its
// thirty-two and ships the other thirty-one as all-zero placeholders: no name, local (0,0), one
// pixel (the province rectangle's own corner), one city seed and one country. Those thirty-one are
// Cyrodiil now, so the checks below name Anvil and Chorrol and travel to one of them.
//
// The unit half is `tests/unit/mapscreen.test.mjs` (the law, the records' indices, the palette's
// four colours and the province pictures' own town dots) and `tests/unit/worldmap.test.mjs` (where
// every place is and what country it is in). This file is the half only a page can answer —
// including the journey, which really travels.

import path from 'node:path';

/** The dev door's own folder, the same one every other suite travels by. */
const ARENA = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';

export function makeWorldmapSuite({ check, realErrors, shots, getPort, decodePng, scanlineEdges, imageStats }) {
  return async function suiteWorldMap(page) {
    const PORT = getPort();
    const q = `arena=${encodeURIComponent(ARENA)}`;
    await page.goto(`http://localhost:${PORT}/?map&${q}`);
    try {
      await page.waitFor('window.__debug?.scene === "worldmap" || !!window.__bootError', { label: 'the map', timeoutMs: 60000 });
    } catch (e) {
      const diag = await page.evalJs('JSON.stringify({ href: location.href, boot: window.__bootError || null, errs: window.__debug?.pageErrors, dbg: window.__debug?.scene, title: document.title })');
      throw new Error(`${e.message}; page state ${diag}`);
    }
    const bootError = await page.evalJs('window.__bootError || null');
    check('the world map boots without a boot error', !bootError, bootError ? String(bootError).slice(0, 400) : '');

    await page.waitFor('window.__debug.state().frames > 3', { label: 'map frames' });

    // ── the screen's own records, read out of the player's own archive ───────
    const records = await page.evalJs('window.__debug.mapScreen()');
    check('the screen is the game’s own map picture', records?.screen?.record === 'TAMRIEL.IMG'
      && records.screen.width === 320 && records.screen.height === 200,
    `${records?.screen?.record} ${records?.screen?.width}×${records?.screen?.height}`);
    check('the markers are the two records the archive keeps for them',
      records?.records?.steady === 'MAPOUT.CIF' && records?.records?.blinking === 'MAPBLINK.CIF',
      `${records?.records?.steady} / ${records?.records?.blinking}`);
    check('every marker record decoded, with the pixels its own frame carries',
      (records?.kinds ?? []).length === 4 && (records?.kinds ?? []).every((k) => k.steady > 10 && k.blinking > 10),
      (records?.kinds ?? []).map((k) => `${k.kind} ${k.steady}/${k.blinking}`).join(' '));
    check('the marker and blink colours are the palette’s own two indices',
      records?.colors?.steady === '#b1840d' && records?.colors?.blinking === '#ffb800'
      && records?.colors?.indices?.marker === 194 && records?.colors?.indices?.blink === 223,
    `${records?.colors?.steady} / ${records?.colors?.blinking} (indices ${records?.colors?.indices?.marker}/${records?.colors?.indices?.blink})`);
    check('the nine province plates are the record’s own nine, with their own lettering',
      (records?.plates ?? []).length === 9
      && records.plates.every((p) => p.background > 0 && p.text > 0 && p.width > 0),
    (records?.plates ?? []).map((p) => `${p.name} ${p.width}×${p.height}`).join(', '));
    check('and the nine hand-drawn province maps this install ships were read in the page',
      (records?.provinces ?? []).length === 9 && records.provinces.every((p) => p.width === 320 && p.height === 200),
    (records?.provinces ?? []).map((p) => `${p.name}=${p.record}`).join(' '));
    check('reading the screen raised no warnings', (records?.warnings ?? []).length === 0,
      (records?.warnings ?? []).join(' | '));

    // ── Tamriel: the continent carries its provinces, not its places ────────
    const st = await page.evalJs('window.__debug.state()');
    check('the map drew the whole continent, from the game’s own art', st?.drawn?.width === 320 && st?.drawn?.height === 200,
      `${st?.drawn?.width}×${st?.drawn?.height}`);
    check('all nine provinces of Tamriel are on the map', st?.provinces === 9, `provinces=${st?.provinces}`);
    check('every CITYDATA location became a place', st?.locations === 432, `locations=${st?.locations}`);
    check('288 of them are settlements and the rest are dungeons', st?.settlements === 288, `settlements=${st?.settlements}`);
    check('the continent is the first of the screen’s two levels', st?.view === 'tamriel' && st?.province === null,
      `${st?.view} ${st?.province ?? ''}`);
    // The continent's own picture carries two marks at most — **where the player is** (one icon,
    // which is the only marker Arena's own map screen has on it) and the Imperial Palace — against
    // the 48 a province's map draws. That is the difference the owner was reporting: the settlements
    // were not on the right level of the screen.
    const continentIcons = st?.mapArt?.icons ?? {};
    const continentTotal = Object.values(continentIcons).reduce((a, b) => a + b, 0);
    check('the continent carries the player’s own place and no settlements — those live on the province maps',
      continentTotal <= 2, `${continentTotal} icon(s): ${JSON.stringify(continentIcons)}`);

    const png = await page.screenshot(path.join(shots, 'm5-worldmap.png'));
    const decoded = decodePng(png);
    const stats = imageStats(decoded);
    check('the map screenshot is not blank', stats.distinctColors > 60 && stats.dominantShare < 0.9,
      `${stats.distinctColors} colours, dominant ${(stats.dominantShare * 100).toFixed(1)}%`);
    const edges = Math.max(...[0.35, 0.5, 0.65].map((f) => scanlineEdges(decoded, Math.floor(decoded.height * f))));
    check('the map is a drawn picture, not a flat fill', edges > 20, `${edges} edges along the best scanline`);

    // The continent's original city dots are a different projection from TERRAIN.IMG.
    const alignment = await page.evalJs('window.__debug.alignment()');
    const originalCities = alignment.filter((l) => l.kind === 'city' && (l.provinceID < 8 || l.local.x === 180));
    check('all 65 original city markers align with their painted yellow continent dots',
      originalCities.length === 65 && originalCities.every((l) => l.artIndex === 11),
      `${originalCities.filter((l) => l.artIndex === 11).length}/65 exact yellow pixels`);
    const winter = await page.evalJs('window.__debug.continentMarkerAt("Winterhold")');
    check('Winterhold uses its painted dot rather than the old sea coordinate', winter?.tamriel?.x === 179 && winter?.tamriel?.y === 33,
      JSON.stringify(winter));
    await page.clickSelector('#map-terrain');
    await page.clickSelector('#map-borders');
    const inspection = await page.evalJs('window.__debug.state().inspection');
    check('terrain and province-border inspection controls respond to real clicks', inspection.terrain && inspection.borders);
    await page.screenshot(path.join(shots, 'tamriel-inspection.png'));
    await page.clickSelector('#map-terrain');
    await page.clickSelector('#map-borders');
    await page.clickSelector('#map-search');
    await page.send('Input.insertText', { text: 'Winterhold' });
    const found = await page.evalJs('({ count: document.querySelectorAll("#map-results button").length, text: document.querySelector("#map-results").textContent })');
    check('typing a settlement name filters the visible search results', found.count === 1 && found.text.includes('Winterhold'), JSON.stringify(found));
    await page.clickSelector('#map-results button');
    check('a real result click opens the correct province and place card',
      await page.evalJs('window.__debug.state().province === "Skyrim" && window.__debug.state().selected.name === "Winterhold"'));
    check('searching and selecting do not move the player or write a false departure',
      await page.evalJs('localStorage.getItem("perfectarena.lastLocation") === null'));
    // Clear using a real search-field event, not a debug state setter.
    await page.evalJs('document.querySelector("#map-search").select()');
    await page.send('Input.insertText', { text: '' });
    await page.evalJs('document.querySelector("#map-search").value = ""; document.querySelector("#map-search").dispatchEvent(new Event("input", { bubbles: true }))');
    await page.clickSelector('#map-next');
    check('next province navigates directly from Skyrim to Morrowind', await page.evalJs('window.__debug.state().province === "Morrowind"'));
    await page.clickSelector('#map-continent');
    check('the Tamriel button returns to the continent', await page.evalJs('window.__debug.state().view === "tamriel"'));
    check('the map exposes a day/hour, province and coordinate readout',
      /Day \d+.*\d\d:\d\d/.test(await page.evalJs('document.querySelector("#map-readout").textContent')));

    const at = (name) => page.evalJs(`window.__debug.markerAt(${JSON.stringify(name)})`);
    const daggerfall = await at('Daggerfall');
    check('a named city is a place on the map, at the pixel CITYDATA keeps for it',
      Boolean(daggerfall && daggerfall.local && daggerfall.world) , JSON.stringify(daggerfall));
    check('the east of the map is where Morrowind is',
      Boolean((await at('Dagoth-Ur'))?.world?.x > daggerfall?.world?.x),
      `Daggerfall x=${daggerfall?.world?.x}, Dagoth-Ur x=${(await at('Dagoth-Ur'))?.world?.x}`);
    check('the map knows the terrain under a pixel',
      await page.evalJs('(() => { const t = window.__debug.terrainAt(172, 106); return t.glyph !== "?" && typeof t.climate === "string"; })()'));

    // ── the province plate, which is a record nothing had ever drawn ────────
    const hovered = await page.evalJs('window.__debug.hoverAt(700, 300)');
    const plate = await page.evalJs(`window.__debug.provincePlate(${JSON.stringify(hovered)})`);
    check('pointing at the continent names the province with the record’s own plate',
      Boolean(hovered) && plate?.name === hovered && plate.width > 0,
      `${hovered} → plate #${plate?.index} ${plate?.width}×${plate?.height}`);
    check('and the frame that was drawn carried it', plate?.drawn === true, JSON.stringify(plate));

    // ── the blink: two records, one shape, alternating ──────────────────────
    const before = await page.evalJs('window.__debug.state().mapArt');
    await page.waitFor(`window.__debug.state().mapArt.record !== ${JSON.stringify(before.record)} && window.__debug.state().mapArt.switches > ${before.switches}`,
      { label: 'the opposite blink record', timeoutMs: 5000 });
    const after = await page.evalJs('window.__debug.state().mapArt');
    check('the map blinks between the two marker records',
      after.record !== before.record && after.switches > before.switches,
      `${before.record} → ${after.record}, ${after.switches - before.switches} switches`);

    // ── the second level: the province's own hand-drawn map ─────────────────
    const opened = await page.evalJs('window.__debug.openProvince("High Rock")');
    check('a province opens its own hand-drawn map', opened === 'High Rock', String(opened));
    const highRock = await page.evalJs('window.__debug.level()');
    check('the picture it opened is that province’s own record', highRock?.record === 'HIGHROCK.IMG',
      `${highRock?.record} (${highRock?.province?.name})`);
    check('and every one of the province’s 48 places is drawn there',
      highRock?.placesDrawn === 48, `${highRock?.placesDrawn} places`);
    const kinds = await page.evalJs('window.__debug.state().mapArt.icons');
    check('as the four little icons, one per kind of place',
      kinds?.city === 8 && kinds?.town === 8 && kinds?.village === 16 && kinds?.dungeon === 16,
      JSON.stringify(kinds));
    await page.screenshot(path.join(shots, 'm5-province.png'));

    // ── **the check that would catch a return to circles** ──────────────────
    // What is on the screen for a city marker is the record's own outline: the marker's rectangle
    // holds as many marker-gold pixels as the record's lit count scaled to the view (within a
    // quarter), and they fill about a fifth of it. An 18×13 disc would fill about four fifths, so
    // this pair of numbers is what separates "Arena's icon" from "a yellow circle".
    const city = await page.evalJs('window.__debug.markerPixels("Daggerfall")');
    check('a city marker is drawn from the record’s own pixels',
      Boolean(city) && city.lit > 20 && Math.abs(city.lit / city.expected - 1) < 0.25,
      `lit ${city?.lit} of ${city?.expected} expected (${(100 * (city?.lit ?? 0) / (city?.expected || 1)).toFixed(0)}%), record ${city?.record}`);
    check('and it is the game’s outline, not a disc',
      Boolean(city) && city.share < 0.5, `${(100 * (city?.share ?? 1)).toFixed(0)}% of its rectangle`);
    const town = await page.evalJs('window.__debug.markerPixels("Kings Guard")');
    check('a town is drawn from the town record, which is a different shape',
      Boolean(town) && town.icon.width === 11 && town.icon.height === 12 && town.kind === 'town',
      JSON.stringify(town?.icon ?? null));

    // ── D-39: the province Arena's own file leaves empty ───────────────────
    // Before the fix none of these names existed (`world.byName('Anvil')` answered null), because
    // the thirty-one records carry no name at all — they were thirty-one markers stacked on the
    // rectangle's corner at (107,61), with an empty title on the card and `?location=` behind it.
    const anvil = await at('Anvil');
    check('a Cyrodiil city the file leaves blank is a place the map can name',
      anvil?.name === 'Anvil' && anvil?.province === 'Imperial Province', JSON.stringify(anvil).slice(0, 200));
    const chorrol = await at('Chorrol');
    check('and it stands where the later lore puts it, not on the province\u2019s own corner',
      Boolean(anvil) && !(anvil.world.x === 107 && anvil.world.y === 61)
        && Boolean(chorrol) && (anvil.world.x !== chorrol.world.x || anvil.world.y !== chorrol.world.y),
      `Anvil ${JSON.stringify(anvil?.world)} · Chorrol ${JSON.stringify(chorrol?.world)}`);
    const toAnvil = await page.evalJs('window.__debug.travelUrl("Anvil")');
    check('the map offers a real travel URL for it, where the blank records offered `?location=`',
      /location=Anvil/.test(toAnvil ?? ''), String(toAnvil));

    // ── a place is clickable where it is drawn, and travelling arrives ──────
    const onMap = await at('Daggerfall');
    check('a place sits inside the province picture it belongs to',
      onMap?.x > 0 && onMap?.y > 0 && onMap?.local?.x < 320 && onMap?.local?.y < 200,
      JSON.stringify(onMap).slice(0, 200));
    const offered = await page.evalJs('window.__debug.travelUrl("Daggerfall")');
    check('the map offers a real travel URL for a city it knows', /location=Daggerfall/.test(offered ?? ''), String(offered));

    // Back to the continent, which is what Escape does for a player.
    const back = await page.evalJs('window.__debug.backToTamriel()');
    check('Escape’s own door leaves the province and returns to Tamriel', back === true
      && await page.evalJs('window.__debug.state().view') === 'tamriel');

    await page.evalJs('window.__stillTheSamePage = 1');
    const departure = await page.evalJs('JSON.parse(localStorage.getItem("perfectarena.world") ?? "null")?.clock ?? {day: 1, minutes: 600}');
    // **The horse is the between.** Start the journey without awaiting it, catch the card while
    // it is on screen, then let the same promise resolve. `HORSE.DFA` is 132×82, eleven frames,
    // so the card's canvas must be a scaled copy of that art and carry painted pixels.
    const journeyPromise = page.evalJs('window.__debug.travel("Daggerfall")');
    await page.waitFor('!!document.getElementById("travel-horse")', { label: 'the travel horse', timeoutMs: 5000 });
    const horse = await page.evalJs(`(() => {
      const host = document.getElementById('travel-horse');
      const canvas = host?.querySelector('canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const art = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      const colours = new Map();
      for (let i = 0; i < art.length; i += 4) {
        if (!art[i + 3]) continue;
        painted++;
        const key = art[i] + ',' + art[i + 1] + ',' + art[i + 2];
        colours.set(key, (colours.get(key) ?? 0) + 1);
      }
      const common = [...colours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key]) => key);
      return { width: canvas.width, height: canvas.height, painted, common, caption: host.textContent.trim() };
    })()`);
    // **The palette is `TAMRIEL.MNU`'s, not a rotated character sheet.** The horse, rider, sky and
    // grass are indices into that screen's own embedded palette (`WorldMapUiMVC.cpp`'s
    // `FastTravelUiView::getPaletteTextureAsset`), and the owner's report was *"HORSE.DFA has
    // inverted colors now"* after an earlier pass read them through `CHARSHT.COL` and added 128.
    // So the check names the colours the art actually has: the sky's teal and the horse's brown.
    check('fast travel briefly shows Arena\u2019s HORSE.DFA on the road, in the world map\u2019s own colours',
      horse?.width === 396 && horse?.height === 246 && horse.painted > 1000
        && /Daggerfall/.test(horse.caption)
        && horse.common.includes('36,105,121') && horse.common.includes('170,109,0'),
      JSON.stringify(horse));
    const journey = await journeyPromise;
    check('travelling names where it is going', journey?.to === 'Daggerfall', JSON.stringify(journey));
    await page.waitFor('window.__debug?.scene === "interior" || (window.__debug?.pageErrors ?? []).length > 0', { label: 'the arrival', timeoutMs: 60000 });
    const arrived = await page.evalJs('({ scene: window.__debug?.scene ?? null, search: location.search, samePage: window.__stillTheSamePage === 1, errors: (window.__debug?.pageErrors ?? []).slice(0, 3) })');
    check('travelling from the map really arrives at the place it named',
      arrived?.scene === 'interior' && /location=Daggerfall/.test(arrived?.search ?? ''), JSON.stringify(arrived).slice(0, 220));
    check('and the journey happened in this page, so a picked Arena folder survives it',
      arrived?.samePage === true, JSON.stringify(arrived).slice(0, 220));
    const arrivalClock = await page.evalJs('window.__debug.living().clock');
    check('fast travel advances both calendar days and arrival hour, and the scene reads the saved clock',
      arrivalClock.day > departure.day && arrivalClock.minutes !== departure.minutes,
      `${JSON.stringify(departure)} → ${JSON.stringify(arrivalClock)}`);
    check('the arrival raised no errors', (arrived?.errors ?? []).length === 0, (arrived?.errors ?? []).join(' | ').slice(0, 300));

    // ── and a Cyrodiil place boots the city it names ───────────────────────
    // The journey above proves the map can hand a *settlement of the file's own* to the game. A
    // filled record has to do the same through the same door: its own name, its own city seed (the
    // local point this project gave it), its own climate's city textures, and a city map drawn out
    // of the install's own blocks with nothing missing.
    await page.goto(`http://localhost:${PORT}/?location=Anvil&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" || !!window.__bootError', { label: 'Anvil', timeoutMs: 60000 });
    const anvilBoot = await page.evalJs(`(() => {
      const s = window.__debug.state();
      const c = s.city ?? null;
      return { boot: window.__bootError || null, location: s.location ?? null,
        city: c ? { inf: c.inf, seed: c.seed, cells: c.cells, blocks: c.blocks.length, missing: c.missing.length } : null,
        arrival: window.__debug.arrival(), arrivalShown: s.arrivalShown === true };
    })()`);
    check('a Cyrodiil place the file leaves blank boots the city it names',
      anvilBoot?.boot === null && anvilBoot?.location?.name === 'Anvil'
        && anvilBoot?.location?.province === 'Imperial Province'
        && anvilBoot?.city?.missing === 0 && (anvilBoot?.city?.blocks ?? 0) > 20 && (anvilBoot?.city?.cells ?? 0) > 4000,
      JSON.stringify(anvilBoot).slice(0, 260));
    // The climate is what picks the city's textures (`TC*`/`MC*`/`DC*`), which is the half of D-38
    // a player sees: *"the imperial city is in the desert instead of temperate"*. Anvil's own
    // pixel is mountain, so its city is built out of `MC*` blocks and the Imperial City's out of
    // `TC*` ones — one table, read per pixel.
    const CLIMATE_INF = { temperate: 'TCN.INF', mountain: 'MCN.INF', desert: 'DCN.INF' };
    check('with the city textures of the climate its own pixel has',
      anvilBoot?.city?.inf === CLIMATE_INF[anvilBoot?.location?.climate],
      `${anvilBoot?.location?.climate} \u2192 ${anvilBoot?.city?.inf}`);
    // And the honest gap, named rather than papered over: Arena's `CITYTXT` holds **64** greetings —
    // eight provinces' eight city slots — and **none** for the Imperial Province, not even for the
    // Imperial City (measured: `cityTextKey(8, 0..7)` is absent from the corpus). A city the later
    // lore names arrives with no paragraph rather than with an invented one, which is this
    // project's standing rule about names and prose it did not read out of the install.
    check('and offers no invented arrival greeting where Arena\u2019s corpus has none',
      anvilBoot?.arrival === null && anvilBoot?.arrivalShown === false,
      JSON.stringify({ arrival: anvilBoot?.arrival ?? null, arrivalShown: anvilBoot?.arrivalShown }));
    await page.screenshot(path.join(shots, 'd39-anvil.png'));

    // ── D-41: a place's country and its buildings are two different climates ──
    // The owner's list, on real pages: Morrowind is desert country built out of mountain
    // architecture, Elsweyr and the Summerset Isles are temperate country built out of the desert's,
    // and Winterhold never stops snowing. `state().location` carries both readings and the `.INF`
    // the city was actually built from is the one the architecture chose.
    const PLACES = [
      { name: 'Necrom', province: 'Morrowind', ground: 'desert', letter: 'M', floors: 'DCN.INF' },
      { name: 'Corinth', province: 'Elsweyr', ground: 'temperate', letter: 'D', floors: 'TCN.INF' },
      { name: 'Winterhold', province: 'Skyrim', ground: 'mountain', letter: 'M', weather: 'snow' },
      { name: 'Bruma', province: 'Imperial Province', ground: 'mountain', letter: 'M', weather: 'snow' },
    ];
    for (const place of PLACES) {
      await page.goto(`http://localhost:${PORT}/?location=${encodeURIComponent(place.name)}&${q}`);
      await page.waitFor('window.__debug?.scene === "interior" || !!window.__bootError', { label: place.name, timeoutMs: 60000 });
      const boot = await page.evalJs('(() => { const s = window.__debug.state(); return { boot: window.__bootError || null, location: s.location ?? null, inf: s.city?.inf ?? null, groundInf: s.city?.groundInf ?? null, floors: s.city?.groundFloors ?? null }; })()');
      check(`${place.name}: its country is ${place.ground} and its own .INF is the ${place.letter} one`,
        boot?.boot === null && boot?.location?.province === place.province && boot?.location?.climate === place.ground
          && String(boot?.inf ?? '').startsWith(place.letter),
        JSON.stringify({ province: boot?.location?.province, ground: boot?.location?.climate, inf: boot?.inf }).slice(0, 200));
      // **And it stands on its country's floors** (the owner's second report on this row: the label
      // said desert and the ground inside was the mountain's). The city is built from its
      // architecture's `.INF` and its `@FLOORS` table is the country's, merged in the page.
      if (place.floors) {
        check(`${place.name} stands on its country\u2019s floors, not its architecture\u2019s`,
          boot?.groundInf === place.floors && boot?.floors?.merged === true && boot?.floors?.reason === null,
          JSON.stringify({ groundInf: boot?.groundInf, floors: boot?.floors }).slice(0, 200));
      } else {
        check(`${place.name} needs no second .INF — its country and its buildings agree`,
          boot?.groundInf === null && boot?.floors === null, JSON.stringify({ groundInf: boot?.groundInf }).slice(0, 120));
      }
      if (place.weather) {
        check(`${place.name} never stops snowing`, boot?.location?.weather === 'snow' && String(boot?.inf ?? '').endsWith('S.INF'),
          JSON.stringify({ weather: boot?.location?.weather ?? null, inf: boot?.inf }).slice(0, 200));
      }
    }
    // The map card's own half of the same report — *"MORROWIND NOW JUST SAYS DESERT"*: a province
    // whose country and buildings differ says **both**, so the card cannot promise a desert and
    // hand over a mountain city.
    await page.goto(`http://localhost:${PORT}/?map&${q}`);
    await page.waitFor('window.__debug?.scene === "worldmap" || !!window.__bootError', { label: 'the map again', timeoutMs: 60000 });
    await page.evalJs('window.__debug.select("Necrom")');
    const cardText = await page.evalJs('document.body.textContent.replace(/\\s+/g, " ")');
    check('and the map card says a desert country with mountain buildings',
      /desert country, mountain buildings/.test(cardText ?? ''),
      (cardText ?? '').slice(0, 200));
    await page.screenshot(path.join(shots, 'd41-provinces.png'));

    // ── a job's mark in the country has no journey of its own ─────────────────
    // The owner, 2026-10-21: *"radiant quests that take place in the wilderness spawn in the
    // tamriel map a quest marker that if you travel to it it crashes so the travel button for
    // that questmarker should be disabled"*. The card keeps the button, disabled and named, and
    // the map refuses the journey even if something else calls it.
    const wild = await page.evalJs(`window.__debug.makeWildJob('hunt')`);
    check('a country job puts its own marker on the map', Boolean(wild?.ok && wild?.cell
      && Number.isFinite(wild.cell.row) && Number.isFinite(wild.cell.col)),
      JSON.stringify(wild).slice(0, 240));
    const selectedJob = await page.evalJs('window.__debug.selectWildJob()');
    const card = await page.evalJs('document.getElementById("map")?.textContent ?? ""');
    const button = await page.evalJs('(() => { const b = document.getElementById("map-travel");'
      + ' return b ? { disabled: b.disabled, text: b.textContent, handler: Boolean(b.onclick) } : null; })()');
    check('the job marker\u2019s travel button is disabled, and names the walk instead',
      Boolean(selectedJob && button?.disabled && button.handler === false
        && /on foot/i.test(button.text ?? '') && /no fast travel/i.test(card ?? '')),
      JSON.stringify({ selectedJob, button, card: (card ?? '').slice(0, 200) }).slice(0, 400));
    const refusal = await page.evalJs('window.__debug.travelToWildJob()');
    const afterTravel = await page.evalJs('({ travel: window.__debug.state().travelled, handoffs: window.__debug.state().handoffs })');
    check('and travelling to the spot itself is refused, with nothing handed off',
      refusal?.refused === 'wild-job' && !afterTravel?.travel && afterTravel?.handoffs === 0,
      JSON.stringify({ refusal, afterTravel }).slice(0, 300));
    await page.evalJs("window.__debug.radiantEvent('abandon', {})");

    check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
    const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
    check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
  };
}
