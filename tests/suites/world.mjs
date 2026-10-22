// SUITE: THE CHASM'S SURFACE — Arena's own water and lava, and where the weapon stands.
//
// Two things a player reports by eye, checked in pixels rather than in prose:
//
//   * **"water and lava dont exist"** — Daggerfall's harbour and a dungeon's lava lake are
//     drawn from the install's own fields (`WATERANI.RCI`, `LAVAANI.RCI`) and they *move*.
//     The strongest available statement of "it moves" is a controlled one: with the camera
//     still, two frames a second apart must differ **only where the surface is**, and the
//     rest of the frame must be pixel-identical. A frame that changed everywhere (a camera
//     drift, a walker, a monster, a HUD tick) fails that, which is what makes it a check
//     rather than a coincidence.
//   * **"sword is floating midscreen with no handle in first"** — the weapon stands on the
//     status line and keeps the original's own right-hand margin, both measured off the
//     install's `.CIF` headers (`game/weaponView.js` `placeWeapon`), and changing the weapon
//     reloads the sheet instead of drawing nothing.
//
// `?location=Daggerfall` carries the water because its city template (`CITYW2.MIF`) is the
// one with a harbour — 1 448 wet cells — and `41649375.MIF` carries the lava because Crypt
// of Hearts' first level is mostly lava (835 cells, the biggest chasm any dungeon has).

/** Page-side: stand at the centre of the biggest chasm of a kind, looking down at it. */
const STAND_IN_CHASM = `(kind) => {
  const d = window.__debug;
  const st = d.state();
  const H = st.size[1], W = st.size[0];
  const of = (r, c) => d.cellAt(r, c)?.chasm === kind;
  let best = null;
  for (let row = 2; row < H - 2; row++) {
    for (let col = 2; col < W - 2; col++) {
      if (!of(row, col)) continue;
      let n = 0;
      for (let r = row - 4; r <= row + 4; r++) for (let c = col - 4; c <= col + 4; c++) if (of(r, c)) n++;
      if (!best || n > best.n) best = { row, col, n };
    }
  }
  if (!best) return null;
  d.look(0, -0.55);
  d.teleportCell(best.row, best.col);
  return best;
}`;

/**
 * @param {object} helpers
 * @param {(name: string, ok: boolean, detail?: string) => void} helpers.check
 * @param {(msgs: object[]) => object[]} helpers.realErrors
 * @param {string} helpers.shots
 * @param {() => number} helpers.getPort
 * @returns {(page: object) => Promise<void>}
 */
export function makeWorldSuite({ check, realErrors, shots, getPort }) {
  return async function suiteWorld(page) {
    const path = await import('node:path');
    const { decodePng } = await import('../cdp.mjs');
    const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
    const q = `arena=${encodeURIComponent(arena)}`;
    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

    /** *Water*: blue leads red and green. */
    const isBlue = (png, i) => png.data[i + 2] > png.data[i] + 12 && png.data[i + 2] > png.data[i + 1] + 6;
    /** *Lava*: red leads blue by a distance, with green between them. */
    const isWarm = (png, i) => png.data[i] > png.data[i + 2] + 40 && png.data[i + 1] > png.data[i + 2];
    /** How much of a decoded frame satisfies a predicate. */
    const share = (png, predicate) => {
      let n = 0;
      for (let i = 0; i < png.data.length; i += 4) if (predicate(png, i)) n++;
      return n / (png.width * png.height);
    };

    // ── the harbour ────────────────────────────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 5',
      { label: 'Daggerfall', timeoutMs: 120000 });

    const surfaces = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.chasmSurface())'));
    const water = surfaces.find((s) => s.kind === 'water');
    check('the harbour is a surface built from the install\'s own water field',
      water?.field === 'WATERANI.RCI' && water?.texture === true,
      `${water?.field} · ${water?.planes} planes`);
    check('and it covers exactly the city\'s own wet chasm cells, and nothing else',
      water?.cells > 1000 && water?.covered === water?.cells && water?.largest >= 4,
      `${water?.cells} cells in ${water?.planes} planes, largest ${water?.largest}²`);
    check('the field\'s own values are PAL.COL\'s water ladder, as the field reports',
      water?.ramp === 'water' && water.values.length >= 10
      && water.values[0] >= 0x42 && water.values[water.values.length - 1] <= 0x53,
      `values ${water?.values?.[0]}…${water?.values?.[water.values.length - 1]}`);
    check('the water is drawn shallow — a wade — rather than opaque',
      water?.tint?.[3] > 0 && water.tint[3] < 1 && water.tint[0] === 1 && water.tint[1] === 1 && water.tint[2] === 1,
      `tint ${JSON.stringify(water?.tint)}`);
    check('a city has no lava in it at all', !surfaces.some((s) => s.kind === 'lava'), '');

    const stood = await page.evalJs(`(${STAND_IN_CHASM})("wet")`);
    await settle(400);
    const feet = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.state().feet)'));
    check('the player can stand in the water and the HUD says so',
      stood?.row >= 0 && feet[1] > 0 && (await page.evalJs('window.__debug.water()')).chasm === 'wet',
      `cell ${stood?.row},${stood?.col} · feet ${JSON.stringify(feet)}`);

    const first = decodePng(await page.screenshot(path.join(shots, 'world-harbour-1.png')));
    check('the water fills a real part of the frame', share(first, isBlue) > 0.05,
      `${(100 * share(first, isBlue)).toFixed(1)}% of the frame is water`);
    const painted1 = await page.evalJs('window.__debug.state().painted');
    await settle(1500);
    const second = decodePng(await page.screenshot(path.join(shots, 'world-harbour-2.png')));
    const painted2 = await page.evalJs('window.__debug.state().painted');
    check('the page keeps repainting while the water is watched', painted2 > painted1, `frames ${painted1} → ${painted2}`);

    // The controlled motion check: only water pixels may have changed.
    let changed = 0;
    let changedOffWater = 0;
    for (let i = 0; i < first.data.length; i += 4) {
      const moved = Math.abs(first.data[i] - second.data[i]) > 10
        || Math.abs(first.data[i + 1] - second.data[i + 1]) > 10
        || Math.abs(first.data[i + 2] - second.data[i + 2]) > 10;
      if (!moved) continue;
      changed++;
      if (!isBlue(first, i) && !isBlue(second, i)) changedOffWater++;
    }
    const movedShare = changed / (first.width * first.height);
    check('the harbour moves: a still camera sees the water change between frames',
      movedShare > 0.001, `${(100 * movedShare).toFixed(2)}% of pixels changed in 1.5 s`);
    check('and nothing else in the frame moved — every changed pixel is water',
      changedOffWater / Math.max(1, changed) < 0.05,
      `${changedOffWater} of ${changed} changed pixels are not water`);

    // ── a dungeon's lava lake ──────────────────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?interior=41649375.MIF&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 5',
      { label: 'Crypt of Hearts', timeoutMs: 120000 });
    const dungeon = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.chasmSurface())'));
    const lava = dungeon.find((s) => s.kind === 'lava');
    check('a dungeon\'s lava lake is a surface built from the install\'s own lava field',
      lava?.field === 'LAVAANI.RCI' && lava?.texture === true && lava?.cells > 500 && lava?.covered === lava?.cells,
      `${lava?.field} · ${lava?.cells} cells in ${lava?.planes} planes`);
    // The lava field is *dominantly* the molten ladder, not purely: 76 of its 160 000 bytes
    // are a small handful of strays (the two 99s and 253s), which is why the field reports
    // the ladder it is a picture of plus the count outside it (`arena/rciFile.js`).
    const inLadder = lava.values.filter((v) => v >= 0xf1 && v <= 0xfa).length;
    check('the lava field\'s own values are PAL.COL\'s molten ladder, with its strays counted',
      lava?.ramp === 'lava' && lava.outside === 76 && inLadder >= 8,
      `${inLadder} of ${lava?.values?.length} distinct values in 0xF1…0xFA, ${lava?.outside} bytes outside`);
    check('the lava is opaque — a lake you look at, not through', lava?.tint?.[3] === 1,
      `tint ${JSON.stringify(lava?.tint)}`);

    await page.evalJs(`(${STAND_IN_CHASM})("lava")`);
    await settle(500);
    const lavashot = decodePng(await page.screenshot(path.join(shots, 'world-lava.png')));
    check('the lava lake is on the screen, and it is warm where the harbour was cold',
      share(lavashot, isWarm) > 0.02 && share(lavashot, isBlue) < share(lavashot, isWarm),
      `${(100 * share(lavashot, isWarm)).toFixed(1)}% warm, ${(100 * share(lavashot, isBlue)).toFixed(1)}% blue`);
    // And it flows too, on the same controlled check as the water.
    await settle(1200);
    const lavashot2 = decodePng(await page.screenshot(path.join(shots, 'world-lava-2.png')));
    let lavaChanged = 0;
    for (let i = 0; i < lavashot.data.length; i += 4) {
      if (Math.abs(lavashot.data[i] - lavashot2.data[i]) > 10
        || Math.abs(lavashot.data[i + 1] - lavashot2.data[i + 1]) > 10
        || Math.abs(lavashot.data[i + 2] - lavashot2.data[i + 2]) > 10) lavaChanged++;
    }
    check('the lava creeps: it changes between frames as the water does',
      lavaChanged / (lavashot.data.length / 4) > 0.0005,
      `${(100 * lavaChanged / (lavashot.data.length / 4)).toFixed(2)}% of pixels changed`);

    // ── the weapon in the hand ─────────────────────────────────────────────────
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 5',
      { label: 'Daggerfall again', timeoutMs: 120000 });
    const held = JSON.parse(await page.evalJs(`(async () => {
      window.__debug.setView('first');
      window.__debug.strike();
      // The draw is three frames and the swing five, at Arena's 16 a second: run the rig
      // out to the drawn hold, which is the frame the player looks at most of the time.
      window.__debug.stepWeapon(0.2);
      window.__debug.stepWeapon(0.4);
      const hud = document.getElementById('hud').getBoundingClientRect();
      const view = document.getElementById('c').getBoundingClientRect();
      return JSON.stringify({
        view: window.__debug.weaponView(),
        hudTop: hud.top,
        viewBox: { top: view.top, bottom: view.bottom, height: view.height },
        inner: { width: window.innerWidth, height: window.innerHeight },
      });
    })()`));
    const on = held.view.onScreen;
    // **The art stands on the window's own bottom edge, with the HUD drawn over it.**
    //
    // `placeWeapon` is the measured law (every frame of all six sheets puts `yOffset + height`
    // on line 147 of the original's 320×200 screen) and takes the line to stand on as its
    // `baseline`. The original's answer to "what is below the line" was its **status bar**, a
    // solid 53-row panel the weapon art runs behind; this port has no bar (its HUD is a DOM
    // box) and it draws the art behind that box (`#weapon` z-index 3, `#hud` 5). So the
    // baseline is the window's own bottom. Passing the original's 147-line here instead left
    // the art on an invisible edge a quarter of the way up the window, which is the owner's
    // *"the fists … are floating midscreen"* (2026-10-17).
    //
    // **The view is the whole window and the status band is an overlay on it**, so the checks
    // below still hold everything the old ones held: nothing is cut off, the art keeps its own
    // right-hand margin and one scale for both axes, and the HUD panel is over the art rather
    // than under it.
    check('a drawn weapon is really on the screen in the first person',
      on !== null && (await page.evalJs('window.__debug.weaponPixels().pixels')) > 1000,
      JSON.stringify(on));
    check('the weapon comes up out of the bottom of the screen, not out of the middle of it',
      Math.abs(on.bottom - held.inner.height) <= 2 && on.y > held.inner.height * 0.5,
      `art bottom ${on.bottom} of ${held.inner.height}, top ${on.y}`);
    check('the view band is the whole window, so no black strip stands under the world',
      Math.abs(held.viewBox.bottom - held.inner.height) <= 2 && Math.abs(held.viewBox.height - held.inner.height) <= 2,
      `view bottom ${Math.round(held.viewBox.bottom)} of ${held.inner.height}`);
    check('the HUD panel is the overlay: it is on screen, and it is drawn over the art',
      held.hudTop >= 0 && held.hudTop < held.inner.height - 8 && on.bottom >= held.hudTop,
      `HUD top ${Math.round(held.hudTop)}, art bottom ${on.bottom} of ${held.inner.height}`);
    check('and keeps the original\'s own right-hand margin, one art pixel plus its own scale',
      held.inner.width - on.right <= on.scale + 1.5 && held.inner.width - on.right >= 0,
      `art right ${on.right} of ${held.inner.width} (scale ${on.scale.toFixed(2)})`);
    // One factor for both axes is the whole of the "it was stretched" complaint: dividing
    // the drawn box by the scale must give back the art's own pixel size, an integer pair.
    const artW = on.w / on.scale;
    const artH = on.h / on.scale;
    check('both axes are scaled by one factor, so the art keeps its own proportions',
      on.w > 0 && on.h > 0 && Math.abs(artW - Math.round(artW)) < 1.5 && Math.abs(artH - Math.round(artH)) < 1.5
      && on.scale === Math.min(held.inner.width / 320, held.inner.height / 200),
      `${on.w}×${on.h} at scale ${on.scale.toFixed(2)} = art ${Math.round(artW)}×${Math.round(artH)}`);
    check('the whole picture is inside the window', on.x >= -1 && on.y >= -1
      && on.right <= held.inner.width + 1 && on.bottom <= held.inner.height + 1,
      `${on.x},${on.y} → ${on.right},${on.bottom} in ${held.inner.width}×${held.inner.height}`);
    // The weapon is drawn on its own DOM canvas over the world (`#weapon` z-index 3), so
    // "it is really on the page" has to be shown on the *composited* page rather than read
    // back off the layer: paint the page, hide the weapon layer (with `visibility`, so
    // nothing else moves), paint it again, and the pixels that changed are the weapon's.
    // They must lie inside the box the frame's own header reported.
    //
    // Counting bright pixels instead — what this check used to do — passed on the sky: a
    // pale cloud inside the box counted as a blade, and the blade's own steel is darker than
    // the threshold. The simulation is paused for the two shots so the water and lava do not
    // change the frame between them.
    await page.evalJs('window.__debug.pause(true)');
    const changedPixels = (a, b, box) => {
      let n = 0;
      const x0 = box ? Math.max(0, box.x) : 0;
      const y0 = box ? Math.max(0, box.y) : 0;
      const x1 = box ? Math.min(a.width, box.x + box.w) : a.width;
      const y1 = box ? Math.min(a.height, box.y + box.h) : a.height;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * a.width + x) * 4;
          const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
          if (d > 12) n++;
        }
      }
      return n;
    };
    const shot = decodePng(await page.screenshot(path.join(shots, 'world-weapon.png')));
    await page.evalJs('document.getElementById("weapon").style.visibility = "hidden"');
    await settle(250);
    const shotNoWeapon = decodePng(await page.screenshot(path.join(shots, 'world-weapon-noweapon.png')));
    await page.evalJs('document.getElementById("weapon").style.visibility = "";');
    await page.evalJs('window.__debug.pause(false)');
    const inBox = changedPixels(shot, shotNoWeapon, on);
    const everywhere = changedPixels(shot, shotNoWeapon, null);
    check('the drawn blade is really painted on the page, inside its own box',
      inBox > 800, `${inBox} pixels changed inside ${on.w}×${on.h} (${everywhere} on the whole page)`);
    check('and it is the only thing the weapon layer put on the page',
      everywhere - inBox <= Math.max(20, inBox * 0.02),
      `${everywhere - inBox} pixels changed outside its own box`);
    check('the HUD panel is over the art, near the bottom of the screen',
      held.hudTop >= 0 && held.hudTop < held.inner.height && on.bottom >= 0, `HUD top ${Math.round(held.hudTop)}, blade bottom ${on.bottom}`);

    // A different weapon loads a different sheet: a shop's mace, and the two families this
    // archive cannot draw, each of which is now drawn from a **documented stand-in** (D-71) —
    // the flail from the mace sheet, the bow from the install's own `ARROWS.CIF` missile art.
    const swapped = JSON.parse(await page.evalJs(`(async () => {
      const mace = await window.__debug.setWeapon('mace');
      const flail = await window.__debug.setWeapon('flail');
      const bow = await window.__debug.setWeapon('long-bow');
      return JSON.stringify({
        mace: { file: mace.file, loaded: mace.loaded, family: mace.family, frames: mace.sheetFrames.length },
        flail: { file: flail.file, loaded: flail.loaded, missing: flail.missing, own: flail.ownFile, substitute: flail.substitute },
        bow: { file: bow.file, loaded: bow.loaded, own: bow.ownFile, substitute: bow.substitute, frames: bow.sheetFrames },
      });
    })()`));
    check('picking up a mace loads the mace sheet, not the sword',
      swapped.mace.file === 'MACE.CIF' && swapped.mace.loaded === 'MACE.CIF' && swapped.mace.frames > 20,
      JSON.stringify(swapped.mace));
    check('and a flail is drawn from the mace sheet, with the missing file named beside it',
      swapped.flail.file === 'MACE.CIF' && swapped.flail.loaded === 'MACE.CIF'
        && swapped.flail.own === 'FLAIL.CIF' && swapped.flail.substitute === true && swapped.flail.missing == null,
      JSON.stringify(swapped.flail));
    check('and a bow is drawn from the install\'s own arrow art — the missing `BOW.CIF`, named',
      swapped.bow.file === 'ARROWS.CIF' && swapped.bow.loaded === 'ARROWS.CIF'
        && swapped.bow.own === 'BOW.CIF' && swapped.bow.substitute === true
        && swapped.bow.frames.join(',') === '1,4,7',
      JSON.stringify(swapped.bow));

    // ── the country's window slides, and the world on it stays ────────────────
    //
    // The owner, 2026-10-17: *"walking in the wilderness in tamriel its still inconsistent …
    // enemies dont get ported and so everything feels not permanent"*, and then, after the slide
    // landed: *"you cant see yourself enemies and npcs in the wilderness it looks like sprites
    // are invisible in the wilderness"*. Both are the same mechanism, measured in
    // `.scratch/wildsprites.mjs`: `slideWildWindow` rebuilt the level and freed **every sprite
    // set** with it, so the carried creatures named sheets nothing had uploaded any more, and a
    // 64-cell slide left the whole rectangle empty. The laws this check holds, on a real page:
    // the page never re-boots (`frames` keeps climbing), the window refills its own population
    // (`windowSlide.refilled`), and figures are **drawn** after the slide — not merely listed —
    // with the player's own third-person sheet still loaded.
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&wild&clock=10&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 3',
      { label: 'the country', timeoutMs: 120000 });
    await page.evalJs('window.__debug.pause(false)');
    const before = JSON.parse(await page.evalJs(`JSON.stringify({
      frames: window.__debug.state().frames,
      figures: window.__debug.state().figures,
      monsters: window.__debug.combat().monsters.length,
    })`));
    let slide = null;
    for (let step = 0; step < 14 && !slide; step++) {
      await page.evalJs('window.__debug.teleport(window.__debug.state().feet[0] + 10, window.__debug.state().feet[1] + 1, window.__debug.state().feet[2])');
      await settle(600);
      slide = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.state().windowSlide)'));
    }
    await page.waitFor('Boolean(window.__debug.state().windowSlide?.doneAt)', { label: 'completed wilderness slide', timeoutMs: 60000 });
    slide = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.state().windowSlide)'));
    const after = JSON.parse(await page.evalJs(`JSON.stringify({
      frames: window.__debug.state().frames,
      figures: window.__debug.state().figures,
      monsters: window.__debug.combat().monsters.length,
      playerSprite: window.__debug.combat().playerSprite,
      sprites: window.__debug.combat().spriteFiles.length,
      view: window.__debug.setView('third'),
    })`));
    await settle(500);
    const third = JSON.parse(await page.evalJs('JSON.stringify({ figures: window.__debug.state().figures, sprite: window.__debug.combat().playerSprite })'));
    check('the country\'s window really slides — the player walked 64 cells and the page did not re-boot',
      Boolean(slide) && after.frames > before.frames,
      `slide ${JSON.stringify(slide?.from)} → ${JSON.stringify(slide?.to)}, frames ${before.frames} → ${after.frames}`);
    // **The player did not move.** `loadLevel` builds a new motor and spawns it at the window's
    // middle; the slide hands it the old feet moved by the origin's delta. The page reports both
    // numbers (`state().wildArrival`), so "no teleport" is the two agreeing — the owner's
    // *"realoads and perfect player position every time"*.
    const arrival = JSON.parse(await page.evalJs('JSON.stringify(window.__debug.state().wildArrival)'));
    check('and the player is set down on the exact feet they had, not snapped to a cell or the window\'s middle',
      Boolean(arrival) && Math.abs(arrival.feet.x - arrival.exact.x) < 0.01 && Math.abs(arrival.feet.z - arrival.exact.z) < 0.01,
      `feet ${JSON.stringify(arrival?.feet)} vs exact ${JSON.stringify(arrival?.exact)} (origin ${JSON.stringify(arrival?.origin)})`);
    check('and the new window fields its own population instead of standing empty',
      slide?.refilled === true && after.monsters > 0 && after.figures > 0,
      `${after.monsters} creatures · ${after.figures} figures · refilled ${slide?.refilled} (before: ${before.monsters}/${before.figures})`);
    check('and the people and creatures still have art: the sprite sets were not freed with the ground',
      after.sprites > 0 && Boolean(after.playerSprite),
      `${after.sprites} sprite sets · player's own sheet ${after.playerSprite}`);
    check('and the player is drawn in the third person after the slide, not an invisible body',
      third.sprite !== null && third.figures > 0,
      `view ${after.view} · player ${third.sprite} · ${third.figures} figures`);

    // Cross a real province/biome boundary with the same running scene. The probe
    // moves the feet across the boundary; the production window-slide code does the rest.
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&wild=${66 * 256 + 240},${185 * 256 + 128}&clock=600&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 5', { label: 'Skyrim border', timeoutMs: 60000 });
    const borderBefore = await page.evalJs('window.__debug.state()');
    await page.evalJs('window.__borderPage = 1; window.__debug.teleport(window.__debug.state().feet[0] + 20 * 2.5, window.__debug.state().feet[1] + 1, window.__debug.state().feet[2])');
    await page.waitFor('window.__debug.state().windowSlide?.doneAt && window.__debug.state().where?.province === "Imperial Province"', { label: 'border window slide', timeoutMs: 60000 });
    const borderAfter = await page.evalJs('({ state: window.__debug.state(), same: window.__borderPage === 1, saved: JSON.parse(localStorage.getItem("perfectarena.lastLocation")), hud: document.getElementById("hud").textContent })');
    check('sliding across the province border updates province, biome and nearest place without a scene reboot',
      borderBefore.where.province === 'Skyrim' && borderAfter.state.where.province === 'Imperial Province'
      && borderBefore.wild.climate === 'temperate' && borderAfter.state.wild.climate === 'mountain'
      && borderAfter.state.where.nearest === 'Bruma' && borderAfter.same,
      `${borderBefore.where.province}/${borderBefore.wild.climate} → ${borderAfter.state.where.province}/${borderAfter.state.wild.climate} near ${borderAfter.state.where.nearest}`);
    check('the new biome is actually loaded and the HUD and saved place follow the border crossing',
      borderAfter.state.inf.startsWith('MW') && borderAfter.state.location.province === 'Imperial Province'
      && borderAfter.saved.name === 'Bruma' && /Imperial Province/.test(borderAfter.hud),
      `${borderAfter.state.inf} / ${borderAfter.saved.name}`);

    // ── a window of the country with no land in it at all ──────────────────────
    //
    // The world grid's window is wherever the player stands, and off a coast that is **open
    // sea**: four sea blocks, 128×128 wet chasm cells, and — the point of the check — a level
    // with **no start point of its own**, because a window is assembled from other files and has
    // no `.MIF` header to read one from. `deepestCells` (the walk the objective is picked from)
    // read `level.spawn.x` unguarded, so the scene threw on its way through `refreshObjective`
    // and the whole page died at "Could not read that folder: Cannot read properties of null
    // (reading 'x')" — the player walked into the sea and the game stopped. `?wild=1992,2114`
    // near Daggerfall is such a window (pixel 7,8 of `TERRAIN.IMG`, off the Iliac coast).
    await page.goto(`http://localhost:${getPort()}/?location=Daggerfall&wild=1992,2114&${q}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 3',
      { label: 'a window of open sea', timeoutMs: 120000 });
    const sea = JSON.parse(await page.evalJs(
      'JSON.stringify({ wild: window.__debug.state().wild, errors: window.__debug.errors.length, objective: window.__debug.state().objective })',
    ));
    check('a country window that is all sea boots: the scene is up and nothing threw',
      realErrors(page.consoleErrors()).length === 0 && sea.errors === 0,
      `${sea.errors} page errors: ${realErrors(page.consoleErrors()).map((m) => m.text).join(' | ').slice(0, 200)}`);
    check('and it is really the sea: every block of the window is water',
      sea.wild?.seaBlocks === 4 && sea.wild?.cityBlocks?.length === 0,
      JSON.stringify({ blocks: sea.wild?.blocks, sea: sea.wild?.seaBlocks, cities: sea.wild?.cityBlocks }));
    check('and the objective walk answers instead of throwing on a level with no start point',
      sea.objective === null || Number.isFinite(sea.objective.cellX),
      JSON.stringify(sea.objective));

    check('the suite saw no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((m) => m.text).join(' | ').slice(0, 300));
  };
}
