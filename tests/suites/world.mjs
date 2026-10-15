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
    // The line the art stands on is the original's own: 147 of its 200 screen rows, at
    // whatever scale the window gives a 320×200 screen (`weaponView.js`'s law, measured
    // across all six sheets) — not the top of whatever text panel happens to be on screen,
    // which is what used to leave the blade hanging mid-frame.
    //
    // **The view is the whole window and the status band is an overlay on it.** The first
    // version cut the canvas off at that line (`height: 73.5vh`, `index.html`), which left
    // the bottom quarter of the window as bare page background with the HUD text in it — the
    // reported "a black band where the GUI is covers almost half the screen". So the checks
    // below hold the *new* shape, and they still hold everything the old ones held: the
    // blade stands on the 147-line, the HUD's text sits below that line and never over the
    // world above it, and the view really is the window (nothing is cut off).
    const bandScale = Math.min(held.inner.width / 320, held.inner.height / 200);
    const statusLine = Math.round(147 * bandScale);
    check('a drawn weapon is really on the screen in the first person',
      on !== null && (await page.evalJs('window.__debug.weaponPixels().pixels')) > 1000,
      JSON.stringify(on));
    check('the weapon stands on the status line — the original\'s own 147th row',
      Math.abs(on.bottom - statusLine) <= 2,
      `art bottom ${on.bottom}, line ${statusLine}`);
    check('the view band is the whole window, so no black strip stands under the world',
      Math.abs(held.viewBox.bottom - held.inner.height) <= 2 && Math.abs(held.viewBox.height - held.inner.height) <= 2,
      `view bottom ${Math.round(held.viewBox.bottom)} of ${held.inner.height}`);
    check('the HUD text sits in the status band below that line, not over the world above it',
      held.hudTop >= statusLine - 1,
      `HUD top ${Math.round(held.hudTop)}, status line ${statusLine}`);
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
    check('the HUD text is out of the way of it, in the band below',
      held.hudTop >= on.bottom - 1, `HUD top ${Math.round(held.hudTop)}, blade bottom ${on.bottom}`);

    // A different weapon loads a different sheet: a shop's mace, and a family this install
    // ships nothing for, which the report must name rather than paper over.
    const swapped = JSON.parse(await page.evalJs(`(async () => {
      const mace = await window.__debug.setWeapon('mace');
      const flail = await window.__debug.setWeapon('flail');
      return JSON.stringify({
        mace: { file: mace.file, loaded: mace.loaded, family: mace.family, frames: mace.sheetFrames.length },
        flail: { file: flail.file, loaded: flail.loaded, missing: flail.missing },
      });
    })()`));
    check('picking up a mace loads the mace sheet, not the sword',
      swapped.mace.file === 'MACE.CIF' && swapped.mace.loaded === 'MACE.CIF' && swapped.mace.frames > 20,
      JSON.stringify(swapped.mace));
    check('and a flail names its missing sheet instead of drawing another weapon',
      swapped.flail.file === 'FLAIL.CIF' && swapped.flail.loaded === null && swapped.flail.missing === 'FLAIL.CIF',
      JSON.stringify(swapped.flail));

    check('the suite saw no console errors', realErrors(page.consoleErrors()).length === 0,
      realErrors(page.consoleErrors()).map((m) => m.text).join(' | ').slice(0, 300));
  };
}
