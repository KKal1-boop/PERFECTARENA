import path from 'node:path';

export function makeSceneVisualsSuite({ check, realErrors, shots, getPort, decodePng }) {
  return async function sceneVisuals(page) {
    const arena = process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA';
    const url = `http://localhost:${getPort()}/?arena=${encodeURIComponent(arena)}`;
    const ready = () => page.waitFor('window.__debug?.light && window.__debug.state().painted > 3',
      { timeoutMs: 90000, label: 'scene ready' });
    const paint = () => page.evalJs('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    const shot = async (name) => decodePng(await page.screenshot(path.join(shots, name)));
    const difference = (a, b) => {
      let changed = 0, brighter = 0;
      for (let y = 10; y < a.height * 0.7; y++) for (let x = 10; x < a.width - 10; x++) {
        const i = (y * a.width + x) * 4;
        const delta = a.data[i] + a.data[i + 1] + a.data[i + 2] - b.data[i] - b.data[i + 1] - b.data[i + 2];
        if (Math.abs(delta) > 6) changed++;
        if (delta > 6) brighter++;
      }
      return { changed, brighter };
    };
    await page.goto(`${url}&interior=START.MIF`); await ready();
    await page.evalJs('window.__debug.pause(true); document.getElementById("arrival").classList.remove("on"); window.__debug.sceneEffects(true,false)');
    await paint();
    const lit = await shot('visual-room-lit.png');
    const room = await page.evalJs('window.__debug.light()');
    await page.evalJs('window.__debug.sceneEffects(false,false)'); await paint();
    const unlit = await shot('visual-room-unlit.png');
    const local = difference(lit, unlit);
    check('interior point lights actually brighten rendered geometry, not only a light counter',
      room.pointLights > 0 && local.brighter > 100, `${JSON.stringify(local)}, lights ${room.pointLights}`);
    await page.evalJs('window.__debug.sceneEffects(true,true)'); await paint();
    const air = await page.evalJs('window.__debug.light()');
    check('dungeon air draws a bounded set of ambient particles', air.ambientParticles > 0 && air.ambientParticles <= 64, `${air.ambientParticles} particles`);
    await shot('visual-room-atmosphere.png');

    await page.goto(`${url}&location=Daggerfall`); await ready();
    await page.evalJs('window.__debug.pause(true); document.getElementById("arrival").classList.remove("on"); window.__debug.setClock(1380); window.__debug.teleportToDoor("equipment"); window.__debug.sceneEffects(true,false)');
    await paint();
    const night = await page.evalJs('window.__debug.light()');
    const nightLit = await shot('visual-night-door-lit.png');
    await page.evalJs('window.__debug.sceneEffects(false,false)'); await paint();
    const nightDark = await shot('visual-night-door-unlit.png');
    const lanterns = difference(nightLit, nightDark);
    check('nighttime door lights illuminate the city street in pixels', night.pointLights > 0 && lanterns.brighter > 100,
      `${JSON.stringify(lanterns)}, lights ${night.pointLights}`);
    await page.evalJs('window.__debug.sceneEffects(true,true); window.__debug.setClock(600); window.__debug.look(0,0.65)'); await paint();
    const sky = await shot('visual-sky-clean.png');
    // **The sky is the world, not the interface.** The compass is `COMPASS.IMG` at 3×, and its
    // crest is a painted red ornament — the strip is an instrument over the sky, so its own
    // rectangle is cut out of the scan rather than counted as a streaked material.
    const over = await page.evalJs(`(() => {
      const box = (sel) => { const el = document.querySelector(sel); if (!el) return null;
        const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return { compass: box('#compass'), hud: box('#hud'), vw: innerWidth };
    })()`);
    const dpr = sky.width / over.vw;
    const onUi = (x, y) => ['compass', 'hud'].some((name) => {
      const r = over[name];
      return r && x >= r.x * dpr - 2 && x <= (r.x + r.w) * dpr + 2 && y >= r.y * dpr - 2 && y <= (r.y + r.h) * dpr + 2;
    });
    let debugPixels = 0;
    for (let y = 0; y < sky.height * 0.3; y++) for (let x = 0; x < sky.width; x++) {
      if (onUi(x, y)) continue;
      const i = (y * sky.width + x) * 4, r = sky.data[i], g = sky.data[i + 1], b = sky.data[i + 2];
      if ((r > 140 && r > g * 2.5 && r > b * 2.5) || (g > 140 && g > r * 2.5 && g > b * 2.5)) debugPixels++;
    }
    check('rendered daytime sky contains no VGA red/green palette streaks', debugPixels === 0, `${debugPixels} saturated debug pixels`);

    // ── the sky a province never stops doing (B18; the owner, twice) ───────────────────────
    //
    // *"in some cities like winterhold it never needs to stop snowing"*, and later *"in winterhold
    // and windhelm never needs to stop snowing"*. A city's sky is its `.INF` letter, and
    // `game/provinceStyle.js`'s `PLACE_STYLE` is the two places whose sky is always `S` — so the
    // page builds `MCS.INF` for both and the precipitation pass runs a snow profile. The claim is
    // made in pixels, not in prose — and the eye is **on the sky**, straight up, with the HUD and
    // the whole street out of frame, so what changes between two frames can only be what is
    // falling. (Pausing the world is no good here: a paused page does not advance its clock at all,
    // measured the first time this check ran — `{"changed":0}` in a snowstorm.)
    const airOf = async (city) => {
      await page.goto(`${url}&location=${encodeURIComponent(city)}`); await ready();
      await page.evalJs('window.__debug.pause(false); document.getElementById("arrival").classList.remove("on"); window.__debug.look(0,0.95); window.__debug.sceneEffects(true,true)');
      await paint();
      const before = await shot(`visual-${city.toLowerCase()}-snow-a.png`);
      await new Promise((r) => setTimeout(r, 1500));
      await paint();
      const after = await shot(`visual-${city.toLowerCase()}-snow-b.png`);
      const state = await page.evalJs('window.__debug.state()');
      const above = { changed: 0, brighter: 0 };
      // Rows above the horizon only: the sky card and whatever falls in front of it.
      for (let y = 0; y < before.height * 0.5; y++) for (let x = 10; x < before.width - 10; x++) {
        const i = (y * before.width + x) * 4;
        const delta = before.data[i] + before.data[i + 1] + before.data[i + 2] - after.data[i] - after.data[i + 1] - after.data[i + 2];
        if (Math.abs(delta) > 6) above.changed++;
        if (delta > 6) above.brighter++;
      }
      return { inf: state.inf, weather: state.weather, precipitation: state.precipitation, change: above };
    };
    const winterhold = await airOf('Winterhold');
    const solitude = await airOf('Solitude');
    check('Winterhold\u2019s sky is snow at every hour, and the pass that draws it is running',
      winterhold.weather === 'snow' && winterhold.precipitation?.mode === 'snow' && winterhold.precipitation.particles > 0,
      `${winterhold.inf}: falling ${winterhold.weather}, ${winterhold.precipitation?.mode} × ${winterhold.precipitation?.particles}`);
    check('and the falling snow is visible: with the eye on the sky a snowy frame keeps changing, and a clear sky does not',
      winterhold.change.changed > 100 && solitude.change.changed < winterhold.change.changed / 4,
      `winterhold ${JSON.stringify(winterhold.change)} (${winterhold.inf}) vs solitude ${JSON.stringify(solitude.change)} (${solitude.inf}, falling ${solitude.weather})`);
    await page.evalJs('window.__debug.pause(false)');
    // ── the one panel ──────────────────────────────────────────────────────────
    //
    // The port used to show two GUIs at once: the level panel bottom-left and the fight
    // panel bottom-right. The owner refused that (2026-10-17: *"use only the gui on the left
    // ad not two guis but with the look of the one on the right and all the informations
    // condensed"*), so there is **one** box now and the claim is made in the page's own CSS
    // and markup: the element `#combat` is gone, the surviving panel carries all three bands,
    // and at a narrow window it wraps, scrolls and stays inside the screen instead of
    // spilling past it. The bands are filled with the longest lines the game writes.
    const layout = await page.evalJs(`(() => {
      const frame = document.createElement('iframe'); frame.style.cssText = 'width:549px;height:900px;position:fixed;left:-2000px';
      document.body.appendChild(frame);
      return new Promise(resolve => {
        frame.onload = () => {
          const doc = frame.contentDocument;
          const box = doc.getElementById('hud');
          doc.getElementById('hud-place').innerHTML = '<span class="hint">Morrowind \u00b7 a city \u00b7 TOWN.INF<br>128\u00d7128 cells \u00b7 3200 quads \u00b7 12 materials \u00b7 40 textures</span>';
          doc.getElementById('hud-fight').innerHTML = 'Vivec\u2019s own champion \u2014 level 12 \u00b7 240/240 health \u00b7 9000 xp (400 to level 13) \u00b7 41 slain<br>Nchow \u2014 Dremora Lord 120/120 \u00b7 31 m<br><span class="hint">WASD move \u00b7 Shift run \u00b7 Space jump \u00b7 E take/enter \u00b7 T talk \u00b7 F strike \u00b7 B block \u00b7 Q roll \u00b7 V view \u00b7 I pack \u00b7 C spells \u00b7 Z cast \u00b7 M map</span>';
          doc.getElementById('hud-here').innerHTML = 'A long objective and door line '.repeat(40).trim();
          const a = box.getBoundingClientRect();
          const style = frame.contentWindow.getComputedStyle(box);
          const result = { wraps: style.overflowWrap === 'anywhere', scrolls: ['auto', 'scroll'].includes(style.overflowY),
            inside: a.left >= 0 && a.right <= 549, anchored: style.position === 'fixed',
            bands: ['hud-place', 'hud-fight', 'hud-here'].filter((id) => doc.getElementById(id)).length,
            second: doc.getElementById('combat') !== null, height: Math.round(a.height), frame: 900 };
          frame.remove(); resolve(result);
        };
        frame.srcdoc = '<!doctype html><style>' + document.querySelector('style').textContent + '</style><body><div id="hud"><div id="hud-place"></div><div id="hud-fight"></div><div id="hud-here"></div></div></body>';
      });
    })()`);
    check('there is one panel, not two: the left-hand box carries all three bands and no #combat exists',
      layout.bands === 3 && layout.second === false && layout.anchored && layout.inside,
      JSON.stringify(layout));
    check('and the one panel wraps and scrolls in a narrow window instead of spilling off it',
      layout.wraps && layout.scrolls && layout.height <= layout.frame, JSON.stringify(layout));

    // ── the furniture a house is furnished with (D-62) ─────────────────────────
    //
    // The owner, 2026-10-18: *"not the small 2d tables the 3d tables … this tables and beds have
    // black in their textures that should be invisible so i can see under them"*. A tavern's table
    // and a house's bed are **raised boxes** whose side art is a picture with the room showing
    // through it (`TABLE.IMG` is 37.1% palette index 0 measured, `BED.IMG` 84.9%), and the
    // original's own renderer alpha-tests a raised platform's sides while a wall's faces stay
    // opaque (OpenTESArena `MapGeneration.cpp`, `writeVoxelInfoForMAP1`). The check stands in
    // `TAVERN1`'s hall where a table fills the frame: with the sides drawn opaque the frame held
    // **72 068 near-black pixels**, and with them cut out it holds **504** — the black slab *was*
    // the table, and the room behind it is what the player is meant to see.
    await page.goto(`${url}&interior=TAVERN1.MIF&level=1`);
    await ready();
    await page.evalJs('window.__debug.pause(false); document.getElementById("arrival").classList.remove("on"); window.__debug.teleportCell(3, 2); window.__debug.look(-Math.PI / 2, -0.15); window.__debug.input("ControlLeft", true); window.__debug.sceneEffects(true, false)');
    await new Promise((r) => setTimeout(r, 700));
    await paint();
    const furniture = await shot('visual-3d-table.png');
    let dark = 0;
    for (let i = 0; i < furniture.width * furniture.height; i++) {
      const o = i * 4;
      if (furniture.data[o] < 16 && furniture.data[o + 1] < 16 && furniture.data[o + 2] < 16) dark++;
    }
    check('a 3D table\u2019s side shows the room under it, not a black slab',
      dark < 8000, `${dark} near-black pixels of ${furniture.width * furniture.height} (opaque sides measured 72 068)`);
    await page.evalJs('window.__debug.input("ControlLeft", false)');

    check('scene visuals produce no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map(e => e.text).join(' | ').slice(0, 400));
    const warnings = page.consoleMessages().filter(e => /INVALID_OPERATION|INVALID_VALUE|GL_INVALID/.test(e.text));
    check('scene effects produce no WebGL misuse warnings', warnings.length === 0, warnings.map(e => e.text).join(' | ').slice(0, 400));
  };
}
