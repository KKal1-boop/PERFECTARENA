// HEADLESS BROWSER TESTS.
//
//   node tests/run-browser.mjs            all suites
//   node tests/run-browser.mjs testmap    one suite
//
// Starts the static server, drives the real game in headless Chrome/Edge with
// WebGL2, and fails on console errors or a blank screenshot. Screenshots land in
// tests/shots/ so a human can look at what the machine saw.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, decodePng, imageStats, findBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
/** 0 = let the OS choose; the server prints the port and startServer reads it. */
const WANTED_PORT = Number(process.env.PORT || 0);
let PORT = WANTED_PORT;

/** Mean colour of a rectangle of a decoded PNG. */
const mean = (png, x0, y0, x1, y1) => {
  const out = { r: 0, g: 0, b: 0 };
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * png.width + x) * 4;
      out.r += png.data[o]; out.g += png.data[o + 1]; out.b += png.data[o + 2];
      n++;
    }
  }
  if (!n) return out;
  out.r /= n; out.g /= n; out.b /= n;
  return out;
};

/** Top/bottom/left/right band means, for the "is it actually a picture" checks. */
function bandMeans(png) {
  const H = png.height, W = png.width;
  const top = mean(png, 0, 0, W, Math.floor(H * 0.15));
  const bottom = mean(png, 0, Math.floor(H * 0.85), W, H);
  const left = mean(png, 0, Math.floor(H * 0.3), Math.floor(W * 0.2), Math.floor(H * 0.8));
  const right = mean(png, Math.floor(W * 0.8), Math.floor(H * 0.3), W, Math.floor(H * 0.8));
  return { top, bottom, left, right, leftVsRight: Math.abs(left.r - right.r) + Math.abs(left.g - right.g) + Math.abs(left.b - right.b) };
}

/** Count hard colour transitions along one scanline (adjacent pixels). */
function scanlineEdges(png, y) {
  let n = 0;
  for (let x = 0; x + 1 < png.width; x++) {
    const a = (y * png.width + x) * 4, b = a + 4;
    const d = Math.abs(png.data[a] - png.data[b]) + Math.abs(png.data[a + 1] - png.data[b + 1]) + Math.abs(png.data[a + 2] - png.data[b + 2]);
    if (d > 24) n++;
  }
  return n;
}
const fmt = (c) => `${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)}`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`); };

// Console noise that is not a defect: the browser's own warnings about running
// headless, and 404s for optional assets a scene is allowed to want.
const BENIGN = [/favicon/i, /Autofill/i, /GPU stall/i, /WebGL.*deprecat/i, /Failed to load resource.*favicon/i];
const realErrors = (msgs) => msgs.filter((m) => !BENIGN.some((re) => re.test(m.text)));

async function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), String(WANTED_PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 10000);
    proc.stdout.on('data', (d) => {
      const m = /PORT=(\d+)/.exec(d.toString());
      if (m) { PORT = Number(m[1]); clearTimeout(t); resolve(); }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));
  });
  console.log(`static server on http://localhost:${PORT}/`);
  return proc;
}

/** Suite: the Milestone 2 test map boots, draws, moves and collides. */
async function suiteTestMap(page) {
  await page.goto(`http://localhost:${PORT}/?test&shot`);
  try {
    await page.waitFor('window.__shotReady === true || !!window.__bootError', { label: 'the first frames' });
  } catch (e) {
    const diag = await page.evalJs('JSON.stringify({ href: location.href, dbg: typeof window.__debug, ready: !!window.__ready, shot: !!window.__shotReady, boot: window.__bootError || null, errs: window.__debug?.pageErrors })');
    throw new Error(`${e.message}; page state ${diag}`);
  }
  const bootError = await page.evalJs('window.__bootError || null');
  check('test map boots without a boot error', !bootError, bootError ? String(bootError).slice(0, 300) : '');

  const webgl2 = await page.evalJs('!!document.createElement("canvas").getContext("webgl2")');
  check('WebGL2 is available in the headless browser', webgl2 === true);

  const st = await page.evalJs('window.__debug.state()');
  check('the scene reports renderer state', !!st && st.scene === 'testmap', JSON.stringify(st && { draws: st.draws, tris: st.tris, textures: st.textures }));
  check('the mesh was built with all three materials', st?.subMeshes === 3, `subMeshes=${st?.subMeshes}`);
  check('textures were uploaded', (st?.textures ?? 0) >= 3, `textures=${st?.textures}`);
  check('every sub-mesh has its texture (no untextured surface)', (st?.missingTextures ?? ['?']).length === 0,
    `missing: ${(st?.missingTextures ?? []).join(', ')}`);
  check('the frame drew geometry', (st?.draws ?? 0) > 0, `draws=${st?.draws}`);
  check('the player is grounded on the map floor', st?.grounded === true, `grounded=${st?.grounded}`);

  const png = await page.screenshot(path.join(SHOTS, 'm2-testmap.png'));
  const stats = imageStats(decodePng(png));
  check('the screenshot is not blank', stats.distinctColors > 40 && stats.dominantShare < 0.95,
    `${stats.distinctColors} colours, dominant ${(stats.dominantShare * 100).toFixed(1)}%`);

  // A blank screen, a single clear colour, and "the whole frame is sky because
  // the mesh drew with the wrong program" all look different here.
  const bands = bandMeans(decodePng(png));
  check('the top of the frame is sky (blue-dominant)', bands.top.b > bands.top.r + 10 && bands.top.b > 60,
    `top rgb ${fmt(bands.top)}`);
  check('the bottom of the frame is ground, not sky', bands.bottom.b < bands.top.b - 10 || bands.bottom.r > bands.top.r + 10,
    `bottom rgb ${fmt(bands.bottom)}`);
  // "Geometry was drawn" as a picture question: a textured mesh crossing the
  // frame makes hard colour edges along a scanline; a clear colour or a sky
  // gradient makes almost none. (A left/right comparison is useless here - the
  // courtyard is mirror-symmetric about the shot's diagonal, and it measured
  // exactly 0.0 while the scene was drawing correctly.)
  const decoded = decodePng(png);
  const edges = Math.max(...[0.35, 0.5, 0.65].map((f) => scanlineEdges(decoded, Math.floor(decoded.height * f))));
  check('the frame has hard colour edges (geometry is drawn, not a gradient)', edges > 12,
    `${edges} edges along the best scanline`);
  check('the player eye is at standing height on the map',
    await page.evalJs('(() => { const d = window.__debug.state(); return d.eye[1] > 1.5 && d.eye[1] < 2.0; })()'));

  // WebGL reports misuse as a warning, not an exception: a draw with the wrong
  // program bound renders SOMETHING and only says so here. Caught a real bug on
  // this scene (a foreign pass left the sky's program current).
  const glWarnings = page.consoleMessages().filter((m) => /INVALID_OPERATION|INVALID_VALUE|GL_INVALID|GL_OUT_OF_MEMORY/.test(m.text));
  check('no WebGL misuse warnings', glWarnings.length === 0,
    glWarnings.length ? `${glWarnings.length}× ${glWarnings[0].text}` : '');

  const errs = realErrors(page.consoleErrors());
  check('no console errors', errs.length === 0, errs.map((e) => e.text).join(' | ').slice(0, 400));
  const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));

  check('__debug teleport exists', await page.evalJs('typeof window.__debug.teleport === "function"'));
}

/** Suite: real input events move the player, and walls stop them. */
async function suiteMovement(page) {
  await page.goto(`http://localhost:${PORT}/?test`);
  await page.waitFor('window.__ready === true || !!window.__bootError', { label: 'boot' });
  await page.waitFor('window.__debug.state().painted > 3', { label: 'frames' });

  // The player starts in the courtyard's south; walking north must move them.
  await page.evalJs('window.__debug.look(0, 0)');
  const before = await page.evalJs('window.__debug.state()');
  await page.pressKey('KeyW', true);
  await new Promise((r) => setTimeout(r, 900));
  await page.pressKey('KeyW', false);
  const after = await page.evalJs('window.__debug.state()');
  const dz = after.feet[2] - before.feet[2];
  check('holding W moves the player forward', dz > 0.5, `Δz=${dz.toFixed(2)}`);

  // Walls: face the west wall and hold W; the capsule must stop short of it.
  // Walk INTO the west wall from close range, so the stop is the wall and not
  // the clock: the courtyard spans x ∈ [-24, 24] and the capsule radius is 0.35.
  await page.evalJs('window.__debug.teleport(-20, 0.2, 0); window.__debug.look(-Math.PI/2, 0)');
  await page.pressKey('KeyW', true);
  await new Promise((r) => setTimeout(r, 2000));
  await page.pressKey('KeyW', false);
  const wall = await page.evalJs('window.__debug.state()');
  check('the wall stops the player', wall.feet[0] > -23.9 && wall.feet[0] < -20.5,
    `x=${wall.feet[0].toFixed(2)} (wall face at -24, capsule radius 0.35)`);
  check('the player did not fall through the floor', wall.feet[1] > -0.5 && wall.feet[1] < 1.5, `y=${wall.feet[1].toFixed(2)}`);

  const errs = realErrors(page.consoleErrors());
  check('movement produced no console errors', errs.length === 0, errs.map((e) => e.text).join(' | ').slice(0, 300));
}

/**
 * Suite: Milestone 3 — boot a *real* Arena interior out of the player's own
 * data, walk it, and stop at its walls.
 *
 * This is the suite that proves the whole MIF/INF pipeline: if the voxel
 * decoding, the texture table or the winding were wrong, the screenshot checks
 * below fail (blank frame, no edges, or a frame of untextured grey).
 */
async function suiteArenaInterior(page) {
  const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
  const url = `http://localhost:${PORT}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`;
  await page.goto(url);
  try {
    await page.waitFor('window.__ready === true || !!window.__bootError', { label: 'boot', timeoutMs: 30000 });
  } catch (e) {
    const diag = await page.evalJs('JSON.stringify({ href: location.href, boot: window.__bootError || null, errs: window.__debug?.pageErrors, dbg: window.__debug?.scene })');
    throw new Error(`${e.message}; page state ${diag}`);
  }
  const bootError = await page.evalJs('window.__bootError || null');
  check('the interior scene boots without a boot error', !bootError, bootError ? String(bootError).slice(0, 400) : '');

  await page.waitFor('window.__debug.state().painted > 3', { label: 'frames' });
  const st = await page.evalJs('window.__debug.state()');
  check('the scene reports itself as a real Arena interior', st?.scene === 'interior' && st?.map === 'START.MIF',
    `${st?.scene} ${st?.map} inf=${st?.inf}`);
  check('the INF was resolved from the MIF\'s own INFO chunk', /^START\.INF$/i.test(st?.inf ?? ''), `inf=${st?.inf}`);
  check('the voxel grid decoded into real geometry', (st?.quads ?? 0) > 500, `${st?.quads} quads, ${st?.tris} triangles`);
  check('walls were found in the level', (st?.stats?.wall ?? 0) > 100, JSON.stringify(st?.stats));
  check('a collider was registered from the same triangles', (st?.colliderTris ?? 0) > 500, `${st?.colliderTris} collider triangles`);
  check('every sub-mesh has its texture (no untextured surface)', (st?.missingTextures ?? ['?']).length === 0,
    `missing: ${(st?.missingTextures ?? []).join(', ')}`);
  check('the materials resolved to real Arena textures', (st?.textures ?? 0) >= 5, `${st?.textures} textures uploaded`);
  check('the frame drew geometry', (st?.draws ?? 0) > 0, `draws=${st?.draws}`);
  check('the player is standing on the level floor', st?.grounded === true, `grounded=${st?.grounded} y=${st?.feet?.[1]}`);
  check('the map did not need the oversized-layer warning', (st?.warnings ?? []).length === 0, (st?.warnings ?? []).join('; '));

  const shot = path.join(SHOTS, 'm3-start.png');
  const png = await page.screenshot(shot);
  const decoded = decodePng(png);
  const stats = imageStats(decoded);
  check('the screenshot is not blank', stats.distinctColors > 30 && stats.dominantShare < 0.95,
    `${stats.distinctColors} colours, dominant ${(stats.dominantShare * 100).toFixed(1)}%`);
  const edges = Math.max(...[0.35, 0.5, 0.65].map((f) => scanlineEdges(decoded, Math.floor(decoded.height * f))));
  check('the frame has hard colour edges (real textured geometry, not a gradient)', edges > 12,
    `${edges} edges along the best scanline`);
  // An interior with no ceiling of its own must NOT be all sky.
  const bands = bandMeans(decoded);
  check('the frame is a dungeon, not an all-sky frame', bands.bottom.b < 200, `bottom rgb ${fmt(bands.bottom)}`);

  // ── walking, and stopping at a wall ──────────────────────────────────────
  // Find a floor cell with a solid neighbour along +Z (world Z = MIF column).
  const target = await page.evalJs(`(() => {
    const d = window.__debug;
    const s = d.state();
    const [cols, rows] = s.size;             // size is [width, height]
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const here = d.cellAt(row, col);
        const ahead = d.cellAt(row, col + 1);
        if (here && !here.solid && !here.chasm && ahead && ahead.solid && ahead.kind === 'wall') {
          return { row, col };
        }
      }
    }
    return null;
  })()`);
  check('the level contains a wall to walk into', !!target, JSON.stringify(target));

  if (target) {
    await page.evalJs(`window.__debug.teleportCell(${target.row}, ${target.col}); window.__debug.look(0, 0)`);
    await new Promise((r) => setTimeout(r, 120));
    const before = await page.evalJs('window.__debug.state()');
    await page.pressKey('KeyW', true);
    await new Promise((r) => setTimeout(r, 1800));
    await page.pressKey('KeyW', false);
    const after = await page.evalJs('window.__debug.state()');
    const dz = after.feet[2] - before.feet[2];
    check('holding W moves the player through the dungeon', dz > 0.4, `Δz=${dz.toFixed(2)}`);
    // The wall's near face is one cell ahead of the starting cell; the capsule
    // radius is 0.35, so the feet must stop short of it and not pass through.
    const radius = 0.35;
    const cellSize = 2.5;
    const wallFace = (target.col + 1) * cellSize;
    check('the wall stops the player', after.feet[2] < wallFace - radius + 0.1 && after.feet[2] > wallFace - cellSize,
      `z=${after.feet[2].toFixed(2)}, wall face at ${wallFace.toFixed(2)}`);
    check('the player did not fall through the dungeon floor', after.feet[1] > 1.5 && after.feet[1] < 3.5, `y=${after.feet[1].toFixed(2)}`);
  }

  // ── a second, larger dungeon, and its multi-level structure ──────────────
  await page.goto(`http://localhost:${PORT}/?interior=39300577.MIF&arena=${encodeURIComponent(arena)}`);
  await page.waitFor('window.__ready === true || !!window.__bootError', { label: 'boot 2', timeoutMs: 30000 });
  await page.waitFor('window.__debug.state().painted > 3', { label: 'frames 2' });
  const big = await page.evalJs('window.__debug.state()');
  const levels = await page.evalJs('window.__debug.levels()');
  check('a 100x100 main-quest dungeon loads', big?.size?.[0] === 100 && (big?.quads ?? 0) > 5000,
    `${big?.size?.join('×')} ${big?.quads} quads, ${big?.levelCount} levels`);
  check('its levels are reported with their .INF files', Array.isArray(levels) && levels.length === 3 && /^HALLS\d\.INF$/.test(levels[0].inf),
    JSON.stringify(levels.map((l) => l.inf)));
  check('level names come from the physical order, not a sort', levels[0].name === 'level 1' && levels[2].name === 'level 3',
    JSON.stringify(levels.map((l) => l.name)));
  check('doors were decoded from the voxel bitfield', (big?.stats?.door ?? 0) > 5, `doors=${big?.stats?.door}`);
  check('raised platforms were decoded', (big?.stats?.raised ?? 0) > 50, `raised=${big?.stats?.raised}`);
  check('chasms were decoded', (big?.stats?.chasm ?? 0) > 10, `chasms=${big?.stats?.chasm}`);

  await page.screenshot(path.join(SHOTS, 'm3-dungeon.png'));

  // Level switching must rebuild the mesh and the collider, not just relabel.
  await page.evalJs('window.__debug.loadLevelAndSettle(1)');
  await page.waitFor('window.__debug.state().grounded === true', { label: 'the player settles on level 2', timeoutMs: 5000 })
    .catch(() => {});
  const second = await page.evalJs('window.__debug.state()');
  check('switching level rebuilds the geometry', second?.level === 1 && (second?.quads ?? 0) > 1000 && second?.missingTextures.length === 0,
    `level ${second?.level} ${second?.quads} quads, inf ${second?.inf}`);
  check('switching level puts the player on the new floor', second?.grounded === true,
    `grounded=${second?.grounded} y=${second?.feet?.[1]?.toFixed?.(2)} spawn=${JSON.stringify(second?.spawn)}`);

  const glWarnings = page.consoleMessages().filter((m) => /INVALID_OPERATION|INVALID_VALUE|GL_INVALID|GL_OUT_OF_MEMORY/.test(m.text));
  check('no WebGL misuse warnings', glWarnings.length === 0, glWarnings.length ? `${glWarnings.length}× ${glWarnings[0].text}` : '');
  const errs = realErrors(page.consoleErrors());
  check('no console errors', errs.length === 0, errs.map((e) => e.text).join(' | ').slice(0, 400));
  const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
}

/**
 * Suite: Milestone 4 — an assembled Arena city.
 *
 * A city is the one level in the game that exists in no file: it is a skeleton
 * plus a seeded grid of block `.MIF`s. So this suite checks the *assembly* (the
 * plan, the block names, the location INF) as well as the picture and the walk —
 * and it checks that the same seed gives the same city, because without that
 * none of the rest would be reproducible.
 */
async function suiteArenaCity(page) {
  const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
  const q = `arena=${encodeURIComponent(arena)}`;
  await page.goto(`http://localhost:${PORT}/?city&seed=20232&${q}`);
  try {
    await page.waitFor('window.__ready === true || !!window.__bootError', { label: 'boot', timeoutMs: 60000 });
  } catch (e) {
    const diag = await page.evalJs('JSON.stringify({ href: location.href, boot: window.__bootError || null, errs: window.__debug?.pageErrors })');
    throw new Error(`${e.message}; page state ${diag}`);
  }
  const bootError = await page.evalJs('window.__bootError || null');
  check('the city boots without a boot error', !bootError, bootError ? String(bootError).slice(0, 400) : '');
  await page.waitFor('window.__debug.state().painted > 3', { label: 'frames' });

  const st = await page.evalJs('window.__debug.state()');
  const city = st?.city;
  check('the scene reports a generated city', st?.scene === 'interior' && !!city, `${st?.map} city=${!!city}`);
  check('the skeleton is a city template with no INFO of its own', city?.kind === 'city' && /^CITYW?\d\.MIF$/.test(st?.map ?? ''), `${st?.map} kind=${city?.kind}`);
  check('the block grid is six blocks per side', city?.blocksPerSide === 6, `blocksPerSide=${city?.blocksPerSide}`);
  check('the grid was placed inside the skeleton', city?.start?.x === 3 && city?.start?.z === 3, JSON.stringify(city?.start));
  check('every slot of the plan was accounted for', city && city.stamped + city.reserved.length === 36,
    `${city?.stamped} stamped + ${city?.reserved?.length} reserved of 36`);
  check('every block the plan named exists in this Arena install', (city?.missing ?? ['?']).length === 0,
    `missing: ${(city?.missing ?? []).join(', ')}`);
  check('the blocks are real city block files', (city?.blocks ?? []).every((n) => /^(EQ|MG|NB|TP|TV|TS|BS)BD\d+[A-D]\.MIF$/.test(n)),
    `${city?.blocks?.length} blocks, e.g. ${city?.blocks?.slice(0, 3).join(', ')}`);
  // A skeleton has no `INFO`, so the INF can only have come from the location.
  check('the textures came from the location INF, not the map', /^TCN\.INF$/.test(st?.inf ?? ''), `inf=${st?.inf}`);

  check('the assembled city decoded into real geometry', (st?.quads ?? 0) > 3000, `${st?.quads} quads, ${st?.tris} triangles`);
  check('the city is far more built than its skeleton', (st?.stats?.wall ?? 0) > 3000, JSON.stringify(st?.stats));
  check('building entrances are menu edges', (st?.stats?.edge ?? 0) > 0, `edges=${st?.stats?.edge}`);
  check('the city has open sky over its streets', st?.openSky === true && (st?.stats?.ceilinged ?? 0) > 0,
    `openSky=${st?.openSky} ceilinged=${st?.stats?.ceilinged}`);
  check('every sub-mesh has its texture (no untextured surface)', (st?.missingTextures ?? ['?']).length === 0,
    `missing: ${(st?.missingTextures ?? []).join(', ')}`);
  check('the player is standing on the city ground', st?.grounded === true, `grounded=${st?.grounded} y=${st?.feet?.[1]} spawn=${JSON.stringify(st?.spawn)}`);

  // The arrival direction must be the open one. A city's start point is a passage
  // through the perimeter wall, so the default yaw would put the player's first
  // frame against the wall beside them: walking forward from the spawn has to go
  // somewhere without touching the mouse or the look API at all.
  const arrival = await page.evalJs('window.__debug.state()');
  await page.pressKey('KeyW', true);
  await new Promise((r) => setTimeout(r, 2500));
  await page.pressKey('KeyW', false);
  const walked = await page.evalJs('window.__debug.state()');
  const travelled = Math.hypot(walked.feet[0] - arrival.feet[0], walked.feet[2] - arrival.feet[2]);
  // Walking covers about a unit a second, and a capsule facing a wall it is
  // already touching covers a third of one, so 2.5 s of walking separates
  // "facing the city" from "facing the wall beside the gate" by an order of
  // magnitude. Measured: 2.7 units here, 0.19 with the default yaw.
  check('the player arrives facing into the city, not at a wall', travelled > 1.5,
    `yaw ${arrival.yaw.toFixed(2)} travelled ${travelled.toFixed(2)}`);
  await page.evalJs(`window.__debug.teleport(${arrival.feet.join(', ')})`);

  // A city gate is a tunnel through the wall, so the spawn's vantage is a wall
  // and not a sky. Look down a street from the middle of the city instead: that is
  // the vantage the picture checks are about.
  await page.evalJs('window.__debug.teleportCell(63, 63); window.__debug.look(0, 0.22)');
  await new Promise((r) => setTimeout(r, 200));
  const decoded = decodePng(await page.screenshot(path.join(SHOTS, 'm4-city.png')));
  const stats = imageStats(decoded);
  check('the city screenshot is not blank', stats.distinctColors > 30 && stats.dominantShare < 0.95,
    `${stats.distinctColors} colours, dominant ${(stats.dominantShare * 100).toFixed(1)}%`);
  const edges = Math.max(...[0.35, 0.5, 0.65].map((f) => scanlineEdges(decoded, Math.floor(decoded.height * f))));
  check('the city frame has hard colour edges', edges > 12, `${edges} edges along the best scanline`);
  // Outdoors, so unlike a dungeon the top of the frame is sky.
  const bands = bandMeans(decoded);
  check('the top of the city frame is sky (blue-dominant)', bands.top.b > bands.top.r + 10 && bands.top.b > 60,
    `top rgb ${fmt(bands.top)}`);

  // ── walking into a building ──────────────────────────────────────────────
  const target = await page.evalJs(`(() => {
    const d = window.__debug;
    const s = d.state();
    const [cols, rows] = s.size;
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const here = d.cellAt(row, col);
        const ahead = d.cellAt(row, col + 1);
        if (here && !here.solid && !here.chasm && ahead && ahead.solid && ahead.kind === 'wall') return { row, col };
      }
    }
    return null;
  })()`);
  check('the city contains a wall to walk into', !!target, JSON.stringify(target));
  if (target) {
    await page.evalJs(`window.__debug.teleportCell(${target.row}, ${target.col}); window.__debug.look(0, 0)`);
    await new Promise((r) => setTimeout(r, 150));
    const before = await page.evalJs('window.__debug.state()');
    await page.pressKey('KeyW', true);
    await new Promise((r) => setTimeout(r, 1800));
    await page.pressKey('KeyW', false);
    const after = await page.evalJs('window.__debug.state()');
    const dz = after.feet[2] - before.feet[2];
    const wallFace = (target.col + 1) * 2.5;
    check('holding W walks the player down the street', dz > 0.4, `Δz=${dz.toFixed(2)}`);
    check('a building wall stops the player', after.feet[2] < wallFace - 0.25 && after.feet[2] > wallFace - 2.5,
      `z=${after.feet[2].toFixed(2)}, wall face at ${wallFace.toFixed(2)}`);
    check('the player did not fall through the city ground', after.feet[1] > 1.5 && after.feet[1] < 3.5, `y=${after.feet[1].toFixed(2)}`);
  }

  // ── the same seed is the same city, and a different seed is not ──────────
  await page.goto(`http://localhost:${PORT}/?city&seed=99&${q}`);
  await page.waitFor('window.__ready === true', { label: 'boot 2', timeoutMs: 60000 });
  const other = await page.evalJs('window.__debug.state()');
  check('a different seed is a different city',
    JSON.stringify(other?.city?.blocks) !== JSON.stringify(city?.blocks),
    `seed 99: ${other?.city?.blocks?.slice(0, 3).join(', ')}`);

  // ── a town is the same pipeline with a smaller grid and another skeleton ──
  await page.goto(`http://localhost:${PORT}/?city=town&seed=5&${q}`);
  await page.waitFor('window.__ready === true', { label: 'boot 3', timeoutMs: 60000 });
  await page.waitFor('window.__debug.state().painted > 3', { label: 'frames 3' });
  const town = await page.evalJs('window.__debug.state()');
  check('a town generates too, from the town skeleton', town?.city?.kind === 'town' && /^TOWNW?\d\.MIF$/.test(town?.map ?? ''),
    `${town?.map} ${town?.city?.blocksPerSide}×${town?.city?.blocksPerSide} · ${town?.quads} quads`);
  check('a town has its own guaranteed services', town?.city?.blocks?.some((b) => b.startsWith('MG')), town?.city?.blocks?.join(' '));
  await page.screenshot(path.join(SHOTS, 'm4-town.png'));

  const glWarnings = page.consoleMessages().filter((m) => /INVALID_OPERATION|INVALID_VALUE|GL_INVALID|GL_OUT_OF_MEMORY/.test(m.text));
  check('no WebGL misuse warnings', glWarnings.length === 0, glWarnings.length ? `${glWarnings.length}× ${glWarnings[0].text}` : '');
  const errs = realErrors(page.consoleErrors());
  check('no console errors', errs.length === 0, errs.map((e) => e.text).join(' | ').slice(0, 400));
  const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
}

/**
 * Suite: the world map of Tamriel — Arena's own map art, the nine provinces, every
 * location, and the side-work board.
 *
 * This is Milestone 5's centrepiece and it had no browser coverage until now: the
 * node checks could say `CITYDATA.64` parsed, but only a real page can say the map
 * *draws* — that the art decoded, the markers landed on the continent, and the
 * quest chain's stage is reachable by clicking where a player would click.
 */
async function suiteWorldMap(page) {
  const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
  const q = `arena=${encodeURIComponent(arena)}`;
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
  const st = await page.evalJs('window.__debug.state()');
  check('the map drew the whole continent, from the game\'s own art', st?.drawn?.width === 320 && st?.drawn?.height === 200,
    `${st?.drawn?.width}×${st?.drawn?.height}`);
  check('all nine provinces of Tamriel are on the map', st?.provinces === 9, `provinces=${st?.provinces}`);
  check('every CITYDATA location became a marker', st?.locations === 432, `locations=${st?.locations}`);
  check('288 of them are settlements and the rest are dungeons', st?.settlements === 288, `settlements=${st?.settlements}`);

  const png = await page.screenshot(path.join(SHOTS, 'm5-worldmap.png'));
  const decoded = decodePng(png);
  const stats = imageStats(decoded);
  check('the map screenshot is not blank', stats.distinctColors > 60 && stats.dominantShare < 0.9,
    `${stats.distinctColors} colours, dominant ${(stats.dominantShare * 100).toFixed(1)}%`);
  const edges = Math.max(...[0.35, 0.5, 0.65].map((f) => scanlineEdges(decoded, Math.floor(decoded.height * f))));
  check('the map is a drawn picture, not a flat fill', edges > 20, `${edges} edges along the best scanline`);

  // The continent, sampled where the provinces are: a marker or land art must be
  // there, and open sea must not be mistaken for it.
  const at = (name) => page.evalJs(`window.__debug.markerAt(${JSON.stringify(name)})`);
  const daggerfall = await at('Daggerfall');
  const morrowind = await at('Dagoth-Ur');
  check('a named city has a marker on the map', Boolean(daggerfall && daggerfall.x > 0 && daggerfall.y > 0), JSON.stringify(daggerfall));
  check('the east of the map is where Morrowind is', Boolean(morrowind && morrowind.world.x > daggerfall.world.x),
    `Daggerfall x=${daggerfall?.world?.x}, Dagoth-Ur x=${morrowind?.world?.x}`);
  check('the map knows the terrain under a pixel',
    await page.evalJs('(() => { const t = window.__debug.terrainAt(172, 106); return t.glyph !== "?" && typeof t.climate === "string"; })()'));

  // Climate comes from TERRAIN.IMG; High Rock is temperate and Hammerfell is desert
  // in Arena's own world, and the unit tests pin the classes. Here the question is
  // whether the *browser* path reads them the same way.
  const climates = await page.evalJs(`JSON.stringify({
    daggerfall: window.__debug.state().selected, riven: window.__debug.closest(60, 80) })`);
  check('the map resolves a location\'s climate and coast', /temperate|mountain|desert/.test(climates), climates.slice(0, 160));

  // The main quest chain, derived from the world data, as the map shows it.
  const chain = await page.evalJs('window.__debug.chain()');
  check('the chain has the escape, eight pieces and the finale', chain?.length === 10 && chain[1]?.kind === 'piece' && chain[9]?.kind === 'finale',
    `${chain?.length} stages: ${chain?.map((s) => s.title).slice(0, 3).join(', ')}…`);
  check('every piece stage names its province and a real .MIF', chain?.slice(1, 9).every((s) => s.province && /^\d{8}\.MIF$/.test(s.mif ?? '')),
    chain?.slice(1, 9).map((s) => `${s.title}=${s.mif}`).join(' '));

  check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
}

/**
 * Suite: radiant quests — the side work, end to end.
 *
 * A whole job is played the way a player plays it: read the board, accept a
 * posting from the panel, travel, do the work, come back and be paid. The map is a
 * UI, so the parts that can go through real clicks and real keys do.
 */
async function suiteRadiant(page) {
  const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
  const q = `arena=${encodeURIComponent(arena)}`;
  // A clean save: the board must be reproducible from nothing.
  await page.goto(`http://localhost:${PORT}/?map&${q}`);
  await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'the map', timeoutMs: 60000 });
  await page.evalJs('localStorage.clear()');
  await page.goto(`http://localhost:${PORT}/?map&${q}`);
  await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'the map again', timeoutMs: 60000 });

  // ── Arena's own prose reached the browser ────────────────────────────────
  const lib = await page.evalJs('window.__debug.radiant().library');
  check('Arena\'s city greetings loaded in the browser', lib?.greetings === 64, `greetings=${lib?.greetings}`);
  check('Arena\'s dungeon texts loaded', lib?.dungeonIntros === 8, `dungeonIntros=${lib?.dungeonIntros}`);
  check('Arena\'s artifact quest texts loaded', lib?.artifactOffers === 372, `artifactOffers=${lib?.artifactOffers}`);
  check('Arena\'s haggle replies loaded too, told apart from the offers', lib?.artifactReplies === 108, `artifactReplies=${lib?.artifactReplies}`);
  check('Arena\'s talk templates loaded', lib?.talkTemplates === 613, `talkTemplates=${lib?.talkTemplates}`);

  // ── the board ────────────────────────────────────────────────────────────
  check('only dungeons the install can open are offered', (await page.evalJs('window.__debug.radiant().enterableDungeons')) === 16,
    `enterable=${await page.evalJs('window.__debug.radiant().enterableDungeons')} of 144 dungeon records`);
  const offers = await page.evalJs('window.__debug.radiantRefresh()');
  check('the board posts work', offers?.length >= 2, `${offers?.length} offers: ${offers?.map((o) => o.kind).join(', ')}`);
  check('every posting aims at a place the game can open', offers?.every((o) => /^\d{8}\.MIF$/.test(o.targetMif ?? '') || o.kind === 'deliver'),
    offers?.map((o) => `${o.kind}→${o.target}${o.targetMif ? `(${o.targetMif})` : ''}`).join(', '));
  check('at least one posting carries Arena\'s own text', offers?.some((o) => o.dataText) === true,
    offers?.map((o) => `${o.kind}:${o.dataText ? 'data' : 'authored'}`).join(', '));
  const deterministic = await page.evalJs('JSON.stringify(window.__debug.radiantRefresh())');
  await page.evalJs('window.__debug.radiantRefresh()');
  check('the same town on the same day posts the same board', JSON.stringify(offers) === deterministic,
    deterministic.slice(0, 120));

  // ── accepting, by clicking the panel like a player ───────────────────────
  await page.evalJs('window.__debug.openBoard(true)');
  await page.waitFor('!!document.querySelector("#map-board button[data-offer]")', { label: 'the board panel' });
  const buttonCount = await page.evalJs('document.querySelectorAll("#map-board button[data-offer]").length');
  check('the board is a panel with an Accept button per posting', buttonCount >= 2, `${buttonCount} buttons`);
  await page.clickSelector('#map-board button[data-offer]');
  await new Promise((r) => setTimeout(r, 120));
  const afterClick = await page.evalJs('window.__debug.radiant()');
  check('clicking Accept takes the job', Boolean(afterClick?.active), `${afterClick?.active?.title} → ${afterClick?.active?.target}`);
  check('the objective names where to go', /Travel to|Deliver to/.test(afterClick?.objective ?? ''), afterClick?.objective);
  check('the panel now shows the job in hand', await page.evalJs('document.querySelector("#map-board .active") !== null'));

  // ── doing the work, in order, at the right places ────────────────────────
  const active = afterClick.active;
  const finish = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[active.kind];
  const wrongPlace = await page.evalJs(`JSON.stringify(window.__debug.radiantEvent(${JSON.stringify(finish)}, { where: 'Somewhere Else' }))`);
  check('the work cannot be done from somewhere else', JSON.parse(wrongPlace).ok === false, JSON.parse(wrongPlace).reason);
  const arriving = await page.evalJs(`JSON.stringify(window.__debug.radiantEvent('arrive', { where: ${JSON.stringify(active.target)} }))`);
  check('reaching the target is recorded', JSON.parse(arriving).ok === true, active.target);
  const done = await page.evalJs(`JSON.stringify(window.__debug.radiantEvent(${JSON.stringify(finish)}, { where: ${JSON.stringify(active.target)} }))`);
  check('the job is finished at its own target', JSON.parse(done).ok === true, `${finish} at ${active.target}`);
  const early = await page.evalJs(`JSON.stringify(window.__debug.radiantEvent('return', { where: ${JSON.stringify(active.target)} }))`);
  check('the reward is not paid away from the giver', JSON.parse(early).ok === false, JSON.parse(early).reason);
  const paid = await page.evalJs(`JSON.stringify(window.__debug.radiantEvent('return', { where: ${JSON.stringify(active.giver)} }))`);
  const paidResult = JSON.parse(paid);
  check('returning to the giver pays the reward', paidResult.ok === true && paidResult.gold > 0, `${paidResult.gold} gold`);
  const log = await page.evalJs('window.__debug.radiant().entries');
  check('the journal records the whole job', log?.length >= 4 && /Completed/.test(log[log.length - 1]), log?.at(-1));

  // ── the calendar, which is what deadlines are measured in ────────────────
  await page.evalJs('window.__debug.radiantRefresh()');
  const nextOffer = await page.evalJs('window.__debug.radiant().offers[0]');
  await page.evalJs(`window.__debug.acceptOffer(${JSON.stringify(nextOffer.id)})`);
  const days = await page.evalJs(`window.__debug.radiantDays(${nextOffer.days + 5})`);
  check('a job that runs out of days is failed, not silently kept', days?.failed >= 1 && days?.active === null,
    `day ${days?.day}, ${days?.failed} failed`);
  const failedLog = await page.evalJs('window.__debug.radiant().entries');
  check('the journal says why it failed', failedLog?.some((entry) => /the \d+ days ran out/.test(entry)), failedLog?.at(-1));

  // ── persistence: the side work survives a reload, like the main quest does ─
  const before = await page.evalJs('window.__debug.radiant()');
  await page.goto(`http://localhost:${PORT}/?map&${q}`);
  await page.waitFor('window.__debug?.scene === "worldmap"', { label: 'reload', timeoutMs: 60000 });
  const after = await page.evalJs('window.__debug.radiant()');
  check('the side work survived a reload', after?.taken === before?.taken && after?.gold === before?.gold && after?.day === before?.day,
    `taken ${after?.taken}/${before?.taken}, gold ${after?.gold}/${before?.gold}, day ${after?.day}/${before?.day}`);

  await page.screenshot(path.join(SHOTS, 'm5-board.png'));
  check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
}

/**
 * Suite: the story — Arena's prose on arrival, and the main quest played through
 * real key presses.
 *
 * This is the Milestone 4 slice end to end, with the E key rather than the debug
 * API doing the work: escape the Imperial Dungeons, find the map in Stonekeep, take
 * the first piece of the Staff from Fang Lair, and find it still taken after a
 * reload. Every step is a real place from the player's own Arena folder, arrived at
 * by its own name.
 */
async function suiteStory(page) {
  const arena = process.env.ARENA_PATH || 'C:/arenaproject/arena/ARENA';
  const q = `arena=${encodeURIComponent(arena)}`;

  // ── Arena's own greeting, for a city-state the player can name ───────────
  await page.goto(`http://localhost:${PORT}/?location=Daggerfall&${q}`);
  await page.waitFor('window.__ready === true || !!window.__bootError', { label: 'Daggerfall', timeoutMs: 60000 });
  const cityArrival = await page.evalJs('window.__debug.arrival()');
  check('a city-state says Arena\'s own greeting on arrival', Boolean(cityArrival && /Daggerfall/.test(cityArrival.text)),
    cityArrival ? `${cityArrival.title}: "${cityArrival.text.replace(/\n/g, ' ').slice(0, 70)}…"` : 'no arrival text');
  check('the greeting is credited to the file it came from', cityArrival?.source === 'Arena: citytxt', cityArrival?.source);
  check('the greeting is on screen, not just in memory', await page.evalJs('window.__debug.state().arrivalShown') === true);
  await page.screenshot(path.join(SHOTS, 'm4-citytext.png'));

  // ── the escape, with the E key ───────────────────────────────────────────
  await page.evalJs('localStorage.clear()');
  await page.goto(`http://localhost:${PORT}/?interior=START.MIF&${q}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'START.MIF', timeoutMs: 60000 });
  const escapeObjective = await page.evalJs('window.__debug.objective()');
  check('the opening dungeon holds the way out', escapeObjective?.event === 'escaped', JSON.stringify(escapeObjective));
  check('the objective is at the deepest reachable cell', (escapeObjective?.depth ?? 0) > 5,
    `${escapeObjective?.depth} cells deep of ${escapeObjective?.cells} walkable`);
  const tooFar = await page.evalJs('window.__debug.interact()');
  check('the way out cannot be taken from across the dungeon', tooFar === false && /not there yet/.test(await page.evalJs('window.__debug.state().notice ?? ""')),
    await page.evalJs('window.__debug.state().notice'));
  await page.evalJs('window.__debug.teleportToObjective()');
  await new Promise((r) => setTimeout(r, 150));
  await page.pressKey('KeyE');
  await new Promise((r) => setTimeout(r, 250));
  const escaped = await page.evalJs('window.__debug.quest()');
  check('pressing E at the way out escapes the Imperial Dungeons', escaped?.step === 1, `step ${escaped?.step}: ${escaped?.entries?.at(-1)}`);
  check('the escape is written to the journal', /Escaped the Imperial Dungeons/.test(escaped?.entries?.[0] ?? ''), escaped?.entries?.[0]);

  // ── the clue: Arena's own arrival text, then the map in Stonekeep ───────
  await page.goto(`http://localhost:${PORT}/?dungeon=Stonekeep&${q}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'Stonekeep', timeoutMs: 60000 });
  await page.screenshot(path.join(SHOTS, 'm4-dungeon.png'));
  const clueObjective = await page.evalJs('window.__debug.objective()');
  check('the clue dungeon holds the map to the first piece', clueObjective?.event === 'foundClue' && /Fang Lair/.test(clueObjective?.what ?? ''), JSON.stringify(clueObjective));
  await page.evalJs('window.__debug.teleportToObjective()');
  await new Promise((r) => setTimeout(r, 150));
  await page.pressKey('KeyE');
  await new Promise((r) => setTimeout(r, 250));
  check('finding the map is recorded on the quest', (await page.evalJs('window.__debug.quest()'))?.mapKnown === true,
    await page.evalJs('window.__debug.state().notice'));

  // ── the piece, in Fang Lair, whose arrival text Arena wrote ─────────────
  await page.goto(`http://localhost:${PORT}/?dungeon=Fang Lair&${q}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'Fang Lair', timeoutMs: 60000 });
  const fangArrival = await page.evalJs('window.__debug.arrival()');
  check('a quest dungeon announces itself in Arena\'s own words', Boolean(fangArrival && /dragon gate/i.test(fangArrival.text)),
    fangArrival ? fangArrival.text.replace(/\n/g, ' ').slice(0, 80) : 'none');
  check('the dungeon text says which piece lies inside', /Staff of Chaos/i.test(fangArrival?.text ?? ''), fangArrival?.source);
  const pieceObjective = await page.evalJs('window.__debug.objective()');
  check('the piece is here, at the deepest chamber', pieceObjective?.event === 'foundPiece', JSON.stringify(pieceObjective));
  await page.evalJs('window.__debug.teleportToObjective()');
  await new Promise((r) => setTimeout(r, 150));
  await page.pressKey('KeyE');
  await new Promise((r) => setTimeout(r, 250));
  const taken = await page.evalJs('window.__debug.quest()');
  check('pressing E takes the first piece of the Staff', taken?.pieces === 1, `pieces ${taken?.pieces}: ${taken?.entries?.at(-1)}`);
  check('the quest moves on to the next piece, which must be learned first',
    taken?.step === 2 && /piece 2/.test(taken?.objective ?? '') && taken?.mapKnown === false, taken?.objective);

  // ── and it is still taken after a reload ─────────────────────────────────
  await page.goto(`http://localhost:${PORT}/?interior=START.MIF&${q}`);
  await page.waitFor('window.__debug?.scene === "interior"', { label: 'reload', timeoutMs: 60000 });
  const restored = await page.evalJs('window.__debug.quest()');
  check('the main quest survived a page load', restored?.pieces === 1 && restored?.step === 2,
    `pieces ${restored?.pieces}, step ${restored?.step}, ${restored?.entries?.length} journal entries`);

  check('no console errors', realErrors(page.consoleErrors()).length === 0, realErrors(page.consoleErrors()).map((e) => e.text).join(' | ').slice(0, 400));
  const pageErrs = await page.evalJs('window.__debug.pageErrors || []');
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.join(' | ').slice(0, 400));
}

const SUITES = { testmap: suiteTestMap, movement: suiteMovement, interior: suiteArenaInterior, city: suiteArenaCity, worldmap: suiteWorldMap, radiant: suiteRadiant, story: suiteStory };

async function main() {
  if (!findBrowser()) {
    console.log('NO HEADLESS BROWSER FOUND — set CHROME_PATH. See docs/PROGRESS.md.');
    process.exit(2);
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const names = wanted.length ? wanted : Object.keys(SUITES);
  const server = await startServer();
  const page = await launch({ width: 960, height: 600 });
  try {
    for (const name of names) {
      if (!SUITES[name]) { console.log(`unknown suite: ${name}`); continue; }
      console.log(`\n── ${name} ──`);
      try {
        await SUITES[name](page);
      } catch (e) {
        check(`${name}: suite ran to completion`, false, e.message.slice(0, 400));
      }
    }
  } finally {
    page.closeBrowser?.();
    server.kill();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
