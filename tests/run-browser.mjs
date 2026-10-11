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

const SUITES = { testmap: suiteTestMap, movement: suiteMovement, interior: suiteArenaInterior };

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
