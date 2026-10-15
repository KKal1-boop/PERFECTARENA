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
import { makeChargenSuite } from './suites/chargen.mjs';
import { makeCombatSuite } from './suites/combat.mjs';
import { makeActionCombatSuite } from './suites/actioncombat.mjs';
import { makeSceneVisualsSuite } from './suites/scenevisuals.mjs';
import { makeDungeonPlaySuite } from './suites/dungeonplay.mjs';
import { makeBountiesSuite } from './suites/bounties.mjs';
import { makeMainQuestSuite } from './suites/mainquest.mjs';
import { makeTownsfolkSuite } from './suites/townsfolk.mjs';
import { makeDoorsSuite } from './suites/doors.mjs';
import { makeWorldSuite } from './suites/world.mjs';
import { makeRegardSuite } from './suites/regard.mjs';
import { makeMenuSuite } from './suites/menu.mjs';
import { makeGearSuite } from './suites/gear.mjs';
import { makeGuildsSuite } from './suites/guilds.mjs';
import { makeCommerceSuite } from './suites/commerce.mjs';
import { makeLivingSuite } from './suites/living.mjs';
import { makeGeneratedSuite } from './suites/generated.mjs';
import { makeProgressionSuite } from './suites/progression.mjs';
import { makeCutsceneSuite } from './suites/cutscene.mjs';
import { makeAuditSuite } from './suites/audit.mjs';

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
/**
 * Photograph the page into `tests/shots/<name>` and answer what the picture holds.
 *
 * A suite that has to check a *look* — is the town darker at night — cannot ask the page: the
 * page can only report the light it was handed. This is the harness's own PNG reader, handed to a
 * suite as a function of the page, so a suite measures what is on the screen instead of
 * re-implementing a decoder of its own.
 *
 * @param {{screenshot: (p: string) => Promise<Buffer|Uint8Array>}} page
 * @param {string} name  a file name in `tests/shots/`
 * @returns {Promise<{mean: number, stats: object, decoded: object}>} `mean` is luminance, 0..255
 */
const brightness = async (page, name) => {
  const decoded = decodePng(await page.screenshot(path.join(SHOTS, name)));
  const avg = mean(decoded, 0, 0, decoded.width, decoded.height);
  return { mean: 0.299 * avg.r + 0.587 * avg.g + 0.114 * avg.b, stats: imageStats(decoded), decoded };
};

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

  // ── the level's own `*TRIG` triggers (`game/levelTriggers.js`) ───────────
  // This hall ships with its own trigger cells, and the law was measured off the
  // bytes before a line was written: two **signed** bytes after the position —
  // text (a `*TEXT` id in the level's own `.INF`) and sound (a `@SOUND` **slot**,
  // the number the line itself carries, `"SPLASH.VOC 23"`). `255` reads `-1`.
  // A real page proves the walk-onto: the splash cell fires its sound, a lore
  // cell shows its own prose, and neither says anything a second time.
  const trigState = await page.evalJs('window.__debug.triggers()');
  check('the hall\'s own triggers were decoded from the level\'s `.TRIG` chunk', (trigState?.cells ?? 0) >= 20,
    `${trigState?.cells} cells, ${trigState?.list?.length ?? 0} listed`);
  const splash = trigState?.list?.find((t) => t.row === 69 && t.col === 4);
  check('the measured splash cell is in the table with its sound slot',
    splash && splash.soundIndex === 23 && splash.textIndex === -1, JSON.stringify(splash));
  // Chosen **in the page**: the walkability filter has to read `window.__debug`, and a
  // callback run on this side would see no `window` at all (`window is not defined`).
  const proseCell = JSON.parse(await page.evalJs(`(() => {
    const d = window.__debug;
    const t = d.triggers().list.find((candidate) => candidate.textIndex >= 0 && (() => {
      const cell = d.cellAt(candidate.row, candidate.col);
      return cell && !cell.solid && !cell.chasm;
    })());
    return JSON.stringify(t ?? null);
  })()`));
  check('the hall has a standing trigger with its own prose', Boolean(proseCell), JSON.stringify(proseCell));

  // **An arrival is not a walk-onto, and neither is a teleport.** The trigger fired on the
  // level's own spawn frame until this pass, which is the reported "I hear randomly the level
  // up sound in my computer" — a dungeon's `@SOUND` clips (`DRUMS.VOC` and its kin) went off
  // the instant a level loaded, and again on every `warp`. Two claims hold the law down: the
  // count is zero right after boot, and still zero after a warp onto a trigger cell.
  const atBoot = await page.evalJs('window.__debug.triggers()');
  check('the level\'s own clips are silent on the frame the level loads', (atBoot?.sound?.fires ?? 0) === 0,
    JSON.stringify(atBoot?.sound));
  const soundCell = trigState?.list?.find((t) => t.soundIndex === 23);
  if (soundCell) {
    await page.evalJs(`window.__debug.warp(${soundCell.row}, ${soundCell.col}); true`);
    await new Promise((r) => setTimeout(r, 1200));
    const warped = await page.evalJs('window.__debug.triggers()');
    check('and a teleport onto a trigger cell rings nothing either', (warped?.sound?.fires ?? 0) === 0,
      JSON.stringify({ fires: warped?.sound?.fires, last: warped?.last }));
  }

  //
  // …and the step that *does* count is a real one: stand beside the cell, face it and walk
  // in with `W`, the way a player enters it. The trigger cell's neighbour is chosen in the
  // page (walkability lives there), and the yaw is the mesher's own mapping — world X is the
  // row and world Z the column (`mifMesh.js`).
  const walkIn = async (cell) => {
    const start = JSON.parse(await page.evalJs(`(() => {
      const d = window.__debug;
      const cells = d.triggers().list.map((t) => t.row + ',' + t.col);
      const at = { row: ${cell.row}, col: ${cell.col} };
      for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1]]) {
        const row = at.row + dr, col = at.col + dc;
        const here = d.cellAt(row, col);
        if (!here || here.solid || here.chasm) continue;
        const between = d.cellAt(at.row, at.col);
        if (!between || between.solid) continue;
        return JSON.stringify({ row, col, dr, dc });
      }
      return JSON.stringify(null);
    })()`));
    if (!start) return false;
    await page.evalJs(`window.__debug.warp(${start.row}, ${start.col}); true`);
    // Face the trigger cell: yaw 0 looks along +Z, and `atan2(dx, dz)` is the scene's own —
    // with the *walk* direction, which is the neighbour-to-trigger offset `(-dr, -dc)`, not
    // the offset the neighbour was found by. Facing the found offset walks the player *out*
    // of the cell: measured on this hall, the player left (76,6) for (76,4) and never fired.
    const yaw = Math.atan2(-start.dr * 2.5, -start.dc * 2.5);
    await page.evalJs(`window.__debug.look(${yaw}, 0); true`);
    await new Promise((r) => setTimeout(r, 250));
    await page.pressKey('KeyW', true);
    await new Promise((r) => setTimeout(r, 1800));
    await page.pressKey('KeyW', false);
    await new Promise((r) => setTimeout(r, 200));
    return true;
  };

  if (proseCell) {
    const before = await page.evalJs('window.__debug.state().notice');
    const walked = await walkIn(proseCell);
    const after = await page.evalJs('window.__debug.triggers()');
    const noticeAfter = await page.evalJs('window.__debug.state().notice');
    check('walking into a lore trigger pushes its own prose onto the notice bar',
      walked && after.fired >= 1 && after.last?.text === 'lore' && Boolean(noticeAfter) && noticeAfter !== before,
      JSON.stringify({ last: after.last, fired: after.fired, notice: String(noticeAfter).slice(0, 60) }));
    // Away to a standable, trigger-free cell and back: the same cell says nothing again.
    const away = JSON.parse(await page.evalJs(`(() => {
      const d = window.__debug;
      const cells = d.triggers().list.map((t) => t.row + ',' + t.col);
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const row = ${proseCell.row} + dr, col = ${proseCell.col} + dc;
          if (dr === 0 && dc === 0) continue;
          const cell = d.cellAt(row, col);
          if (cell && !cell.solid && !cell.chasm && !cells.includes(row + ',' + col)) return JSON.stringify({ row, col });
        }
      }
      return JSON.stringify(null);
    })()`));
    if (away) {
      // Away on foot-legal ground, then **walk back in** — a second real step, not a warp, or
      // the check would only be re-reading the teleport law it already proved above.
      await page.evalJs(`window.__debug.warp(${away.row}, ${away.col}); true`);
      await new Promise((r) => setTimeout(r, 700));
      await walkIn(proseCell);
      await new Promise((r) => setTimeout(r, 400));
      const second = await page.evalJs('window.__debug.triggers()');
      check('the same trigger cell does not fire twice', second.fired === 1, `fired=${second.fired}`);
    }
  }

  if (soundCell) {
    // A fresh level, so the splash cell is unfired and the walk-in is the only thing that
    // can ring it — and the clip that rings is chosen by the **slot** the `.INF` names.
    await page.goto(`http://localhost:${PORT}/?interior=39300577.MIF&arena=${encodeURIComponent(arena)}`);
    await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 3', { label: 'the hall again', timeoutMs: 90000 });
    const walked = await walkIn(soundCell);
    await new Promise((r) => setTimeout(r, 1500));
    const fired = await page.evalJs('window.__debug.triggers().sound');
    check('stepping into the splash trigger rings the level\'s own clip, by slot',
      walked && fired?.fires >= 1 && /SPLASH\.VOC/i.test(fired?.file ?? ''), JSON.stringify(fired));
  }

  // Level switching must rebuild the mesh and the collider, not just relabel.
  await page.evalJs('window.__debug.loadLevelAndSettle(1)');
  await page.waitFor('window.__debug.state().grounded === true', { label: 'the player settles on level 2', timeoutMs: 5000 })
    .catch(() => {});
  const second = await page.evalJs('window.__debug.state()');
  check('switching level rebuilds the geometry', second?.level === 1 && (second?.quads ?? 0) > 1000 && second?.missingTextures.length === 0,
    `level ${second?.level} ${second?.quads} quads, inf ${second?.inf}`);
  check('switching level puts the player on the new floor', second?.grounded === true,
    `grounded=${second?.grounded} y=${second?.feet?.[1]?.toFixed?.(2)} spawn=${JSON.stringify(second?.spawn)}`);

  // ── water, from the original's own chasm rules ─────────────────────────────
  // `ArenaChasmUtils`: a wet or lava chasm may be swum in, a lava one damages, a dry one
  // is neither. The Imperial Dungeons hold 264 wet chasm cells, 118 of them open water —
  // and the level the suite has been walking is no longer that one, so this goes back.
  await page.goto(`http://localhost:${PORT}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'START.MIF again', timeoutMs: 90000 });
  const pool = await page.evalJs(`(() => {
    const st = window.__debug.state();
    for (let r = 0; r < st.size[0]; r++) for (let c = 0; c < st.size[1]; c++) {
      const cell = window.__debug.cellAt(r, c);
      if (cell && cell.chasm === 'wet' && !cell.solid) { window.__debug.teleportCell(r, c); return { row: r, col: c }; }
    }
    return null;
  })()`);
  check('the level has open water to stand in', Boolean(pool), JSON.stringify(pool));
  await new Promise((r) => setTimeout(r, 700));
  const wading = await page.evalJs('window.__debug.water()');
  check('standing in a wet chasm is standing in water',
    wading?.chasm === 'wet' && wading.submerged === true, JSON.stringify(wading));
  // A flat plane at the surface (the first version of the chasm) leaves the feet *at* the
  // floor plane with the water painted on it; a pool puts them below it, on the bed.
  check('and the player is standing in it: feet below the surface, still grounded',
    wading.feetY < wading.surface - 0.2 && wading.grounded === true,
    `feet ${wading.feetY?.toFixed?.(2)} of surface ${wading.surface}`);
  check('wading is slower than walking',
    Number(wading?.speedScale) > 0 && Number(wading.speedScale) < 1, String(wading?.speedScale));
  check('the HUD says the water is slow to cross',
    /wading/.test(await page.evalJs('document.getElementById("combat").textContent')), '');
  // …and it is not a trap: the player walks out over the bank and the mode ends.
  //
  // **Facing the bank first.** This block used to hold `W` in whatever direction the camera
  // happened to look, which passed only while the level's arrival (and with it the yaw the
  // scene opens on) was the one this pool's far side lined up with. Once the arrival became the
  // file's own header point, `W` walked *along* the pool instead of out of it: measured, the
  // player stayed submerged with `feetY 2.05` for the full 3.5 s. The pool is not a trap — at
  // the same cell, turned to the nearest dry cell three cells away, the same held `W` is out in
  // 750 ms — so the law is checked the way a player would: find the bank, face it, walk.
  await page.evalJs(`(() => {
    const d = window.__debug;
    const at = { row: ${pool?.row ?? 0}, col: ${pool?.col ?? 0} };
    let best = null;
    for (let r = at.row - 4; r <= at.row + 4; r++) {
      for (let c = at.col - 4; c <= at.col + 4; c++) {
        const cell = d.cellAt(r, c);
        if (!cell || cell.solid || cell.chasm) continue;
        const distance = Math.abs(r - at.row) + Math.abs(c - at.col);
        if (!best || distance < best.distance) best = { row: r, col: c, distance };
      }
    }
    if (best) d.look(Math.atan2((best.row + 0.5) * 2.5 - (at.row + 0.5) * 2.5,
      (best.col + 0.5) * 2.5 - (at.col + 0.5) * 2.5), 0);
    return Boolean(best);
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  await page.evalJs('window.__debug.input("KeyW", true)');
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if ((await page.evalJs('window.__debug.water().chasm')) === null) break;
  }
  await page.evalJs('window.__debug.input("KeyW", false)');
  await new Promise((r) => setTimeout(r, 300));
  const ashore = await page.evalJs('window.__debug.state()');
  const outOfWater = await page.evalJs('window.__debug.water()');
  check('the player can walk out of the water again',
    outOfWater.chasm === null && ashore.grounded === true && Number(outOfWater.speedScale) === 1,
    `${JSON.stringify(outOfWater)} grounded=${ashore.grounded} y=${ashore.feet?.[1]?.toFixed?.(2)}`);

  // ── the weapon in the player's hands (Arena's own first-person swing) ──────
  //
  // The game's default view is the first person, and until this the only picture of a blow
  // was on the third-person avatar. What is checked here is that Arena's *own* weapon sheet
  // is the one drawn, that its frames run the way the original's state table runs them, that
  // the drawn frame is really on the screen (pixels, not a flag), and that a weapon whose art
  // this install does not ship is reported rather than drawn as something else.
  await page.goto(`http://localhost:${PORT}/?interior=START.MIF&arena=${encodeURIComponent(arena)}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 3', { label: 'a fresh dungeon for the weapon', timeoutMs: 90000 });
  await page.evalJs('window.__debug.setView("first")');
  const sheathed = await page.evalJs('window.__debug.weaponView()');
  check('a weapon starts the level put away', sheathed?.state === 'sheathed' && sheathed.drawn === false && sheathed.frame === null,
    JSON.stringify({ state: sheathed?.state, frame: sheathed?.frame, drawn: sheathed?.drawn }));
  check('and the first person is where it will be drawn', (await page.evalJs('window.__debug.combat().view')) === 'first', '');
  check('the sheet is the one Arena names for the weapon in hand',
    sheathed?.file === 'SWORD.CIF' && sheathed?.loaded === 'SWORD.CIF' && sheathed?.family === 'blade',
    `${sheathed?.weapon} → ${sheathed?.family} → ${sheathed?.file} (loaded ${sheathed?.loaded})`);
  check('the sheet carries the state table\'s frames 0–32',
    sheathed?.sheetFrames?.length === 33 && sheathed.sheetFrames[0] === 0 && sheathed.sheetFrames[32] === 32,
    `${sheathed?.sheetFrames?.length} frames`);
  const empty = await page.evalJs('window.__debug.weaponPixels()');
  check('nothing is painted on the weapon layer while it is sheathed', empty.pixels === 0, `${empty.pixels} pixels`);

  // The control: two frames with the weapon away, so the swing's own change can be told
  // apart from the world moving behind it.
  const shotAway1 = await page.screenshot(path.join(SHOTS, 'm6-weapon-sheathed.png'));
  await new Promise((r) => setTimeout(r, 400));
  const shotAway2 = await page.screenshot(path.join(SHOTS, 'm6-weapon-sheathed-2.png'));

  // A real key press, not a function call: `F` is what a player presses.
  await page.pressKey('KeyF');
  await page.pressKey('KeyF', false);
  const drawing = await page.evalJs('window.__debug.weaponView()');
  check('a blow draws the weapon first, as the original unsheathes it',
    drawing?.state === 'unsheathing' && drawing?.drawn === true && [30, 31, 32].includes(drawing.frame),
    JSON.stringify({ state: drawing?.state, frame: drawing?.frame }));
  check('and the swing is the overhead chop when the player is standing still',
    drawing?.direction === 'down', String(drawing?.direction));

  // Let the draw and the swing run, then catch the drawn hold: the resting blade is the one
  // frame that is on screen for long enough to be screenshotted twice.
  await new Promise((r) => setTimeout(r, 900));
  const holding = await page.evalJs('window.__debug.weaponView()');
  check('the swing ends on the drawn hold, with the blade resting on screen',
    holding?.state === 'idle' && holding?.frame === 32 && holding?.drawn === true,
    JSON.stringify({ state: holding?.state, frame: holding?.frame }));
  const drawn = await page.evalJs('window.__debug.weaponPixels()');
  check('the drawn frame is really painted, not just selected',
    drawn.pixels > 1000 && drawn.colors > 4 && drawn.bounds,
    `${drawn.pixels} pixels, ${drawn.colors} colours, bounds ${JSON.stringify(drawn.bounds)}`);
  // …and at the screen position the frame's own header names, under the law measured off the
  // install's sheets (`game/weaponView.js` `placeWeapon`): Arena's display was 320×200, the
  // resting blade's own box is (284, 68, 35×79), and the *margin* the art leaves is what
  // carries over — its right edge one art pixel off the right of the screen, its bottom on
  // the line where the original's status area began (147), which in the port is the bottom
  // edge of the view band. Both axes take ONE scale. (This check used to expect each axis
  // stretched to the window and the art pinned to the window's bottom edge — the stretching
  // and the mid-screen float the player reported, and the rule they replaced.)
  const vp = await page.evalJs('JSON.stringify({ w: window.innerWidth, h: window.innerHeight })').then(JSON.parse);
  const scale = Math.min(vp.w / 320, vp.h / 200);
  // The status line as the scene computes it — the view band's bottom edge — because the
  // art's own row is measured *from that line*.
  const statusLine = Math.round(147 * scale);
  const want = {
    x: Math.round(vp.w - (320 - 284) * scale),
    y: Math.round(statusLine - (147 - 68) * scale),
    w: Math.round(35 * scale),
    h: Math.round(79 * scale),
  };
  check('the blade is drawn where the frame\'s own header says, on Arena\'s 320×200 screen',
    holding.onScreen.x === want.x && holding.onScreen.y === want.y && holding.onScreen.w === want.w && holding.onScreen.h === want.h,
    `on screen ${JSON.stringify(holding.onScreen)} vs ${JSON.stringify(want)} at ${vp.w}×${vp.h}`);

  // The picture the player sees, not the layer's own report: the weapon's rectangle must
  // change between a sheathed frame and a drawn one, while the world behind it stands still.
  const shotDrawn = await page.screenshot(path.join(SHOTS, 'm6-weapon.png'));
  const box = holding.onScreen;
  const changed = (a, b) => {
    const pad = 4;
    const x0 = Math.max(0, box.x - pad), y0 = Math.max(0, box.y - pad);
    const x1 = Math.min(a.width, box.x + box.w + pad), y1 = Math.min(a.height, box.y + box.h + pad);
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * a.width + x) * 4;
        if (Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]) > 24) n++;
      }
    }
    return n;
  };
  const behind = changed(decodePng(shotAway1), decodePng(shotAway2));
  const onScreen = changed(decodePng(shotAway2), decodePng(shotDrawn));
  check('the weapon is in the frame the player is looking at, not only in its own layer',
    onScreen > 1500 && onScreen > 20 * behind,
    `${onScreen} pixels changed where the blade is, against ${behind} while the world stood still`);

  // The direction of a blow is the way the player is pushing: forward-left is the down-left
  // sweep (Arena's own frames 5–9), and it plays while the keys are held.
  //
  // The simulation is **paused** across this block, so the swing is driven by `stepWeapon`
  // alone: a swing is 5/16 of a second, and two round trips to the page can outlast it on a
  // busy machine, which made these checks pass or fail on the load of the host. Pausing
  // also keeps the real key press the thing under test — the handler runs either way.
  await page.evalJs('window.__debug.pause(true)');
  await page.evalJs('window.__debug.input("KeyW", true); window.__debug.input("KeyA", true)');
  await page.pressKey('KeyF');
  await page.pressKey('KeyF', false);
  const sweeping = await page.evalJs('window.__debug.weaponView()');
  check('a blow while moving forward-left is the down-left sweep',
    sweeping?.direction === 'downLeft', JSON.stringify({ direction: sweeping?.direction, state: sweeping?.state }));
  await page.evalJs('window.__debug.stepWeapon(0.25)');
  const sweepFrame = await page.evalJs('window.__debug.weaponView()');
  check('and its frames are that sweep\'s own, 5–9',
    sweepFrame.state === 'downLeft' && sweepFrame.frame >= 5 && sweepFrame.frame <= 9,
    JSON.stringify({ state: sweepFrame.state, frame: sweepFrame.frame }));
  await page.evalJs('window.__debug.input("KeyW", false); window.__debug.input("KeyA", false)');

  // Standing still again, the weapon puts itself away — and the layer goes empty.
  await page.evalJs('window.__debug.stepWeapon(0.5)');
  const resting = await page.evalJs('window.__debug.weaponView()');
  check('the swing runs out into the drawn hold', resting.state === 'idle' && resting.frame === 32, JSON.stringify({ state: resting.state, frame: resting.frame }));
  await page.evalJs('window.__debug.stepWeapon(2.1)');
  const sheathing = await page.evalJs('window.__debug.weaponView()');
  check('and it sheathes itself after the hold', sheathing.state === 'sheathing' || sheathing.state === 'sheathed', sheathing.state);
  await page.evalJs('window.__debug.stepWeapon(0.5)');
  const away = await page.evalJs('window.__debug.weaponView()');
  const cleared = await page.evalJs('window.__debug.weaponPixels()');
  check('and then nothing of it is on the layer at all',
    away.state === 'sheathed' && away.frame === null && cleared.pixels === 0, `${away.state}, ${cleared.pixels} pixels`);

  // First person draws the weapon, third person draws the player's own sprite instead — and
  // the rig keeps its own clock either way, so a blow still has a picture, just the avatar's.
  // The layer belongs to the first person; the third person puts the avatar's own sprite on
  // the screen instead, and the weapon layer is emptied by the next paint.
  await page.evalJs('window.__debug.pause(false)');
  await page.evalJs('window.__debug.setView("third")');
  const third = await page.evalJs(`(async () => {
    await new Promise((r) => setTimeout(r, 250));
    return { wv: window.__debug.weaponView(), px: window.__debug.weaponPixels(), anim: window.__debug.animation() };
  })()`);
  check('the third person draws the avatar instead of the weapon layer',
    third.wv.drawn === false && third.px.pixels === 0 && /\.CFA#\d+$/.test(third.anim.player ?? ''),
    `drawn=${third.wv.drawn}, ${third.px.pixels} pixels on the weapon layer, avatar ${third.anim.player}`);
  // …and coming back to the first person puts the weapon on the screen again. The blow is
  // retried while the game's own swing cooldown refuses it (0.55 s of *game* time, which a
  // page driven one evaluation at a time takes longer than that to spend).
  await page.evalJs('window.__debug.setView("first")');
  const backFirst = await page.evalJs(`(async () => {
    let strike = null;
    for (let i = 0; i < 30; i++) {
      strike = window.__debug.strike();
      if (strike.ok) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    let px = { pixels: 0 };
    for (let i = 0; i < 20 && px.pixels === 0; i++) {
      await new Promise((r) => setTimeout(r, 60));
      px = window.__debug.weaponPixels();
    }
    return { strike, px };
  })()`);
  check('and the weapon layer is back with the first person, drawn on the screen',
    backFirst.px.pixels > 1000, `strike ${JSON.stringify(backFirst.strike)}, ${backFirst.px.pixels} pixels`);

  // A weapon whose sheet this install does not ship: a flail has no art here, and the game
  // says which file is missing rather than drawing a sword for it.
  const flail = await page.evalJs('window.__debug.setWeapon("flail")');
  check('a flail is mapped to Arena\'s flail sheet', flail?.file === 'FLAIL.CIF' && flail?.family === 'flail', `${flail?.file} ${flail?.family}`);
  check('and this install has no art for it, which the report says',
    flail?.missing === 'FLAIL.CIF' && flail?.loaded === null, `loaded ${flail?.loaded}, missing ${flail?.missing}`);
  await page.pressKey('KeyF');
  await page.pressKey('KeyF', false);
  await page.evalJs('window.__debug.stepWeapon(0.4)');
  const flailPixels = await page.evalJs('window.__debug.weaponPixels()');
  const flailHud = await page.evalJs('document.getElementById("combat").textContent');
  check('so swinging it draws nothing at all', flailPixels.pixels === 0, `${flailPixels.pixels} pixels`);
  check('and the HUD says the install has no such sheet',
    /no FLAIL\.CIF/.test(flailHud) && /first-person art/.test(flailHud), '');
  const back = await page.evalJs('window.__debug.setWeapon("longsword")');
  check('putting the sword back restores its own art', back?.loaded === 'SWORD.CIF' && back?.missing === null, `${back?.loaded}`);

  // ── lava, in the one place the archive has it ──────────────────────────────
  // `IMPPAL.MIF` level 4 is the Imperial Palace's lava lake (470 cells, and every lava cell
  // in the game): the level the main quest ends on.
  await page.goto(`http://localhost:${PORT}/?interior=IMPPAL.MIF&level=3&arena=${encodeURIComponent(arena)}`);
  await page.waitFor('window.__debug?.scene === "interior" && window.__debug.state().painted > 2', { label: 'the palace lake', timeoutMs: 90000 });
  const lavaCell = await page.evalJs(`(() => {
    const st = window.__debug.state();
    for (let r = 0; r < st.size[0]; r++) for (let c = 0; c < st.size[1]; c++) {
      const cell = window.__debug.cellAt(r, c);
      if (cell && cell.chasm === 'lava') { window.__debug.teleportCell(r, c); return { row: r, col: c }; }
    }
    return null;
  })()`);
  check('the palace level 4 has a lava lake', Boolean(lavaCell), JSON.stringify(lavaCell));
  await new Promise((r) => setTimeout(r, 400));
  const lavaIn = await page.evalJs('window.__debug.water()');
  const healthBefore = await page.evalJs('window.__debug.player().health');
  await new Promise((r) => setTimeout(r, 2600));
  const healthAfter = await page.evalJs('window.__debug.player().health');
  check('standing in lava is standing in it', lavaIn?.chasm === 'lava' && lavaIn.submerged === true, JSON.stringify(lavaIn));
  check('and lava burns: the health goes down while the player stands there',
    healthAfter < healthBefore, `${healthBefore} → ${healthAfter} in 2.6 s`);
  check('the HUD names the hazard and its rate',
    /lava is burning you/.test(await page.evalJs('document.getElementById("combat").textContent')), '');

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
  check('the textures came from the location INF, not the map', /^TCN\.INF$/.test(st?.inf ?? ''), `inf=${st?.inf}`);    check('the assembled city decoded into real geometry', (st?.quads ?? 0) > 3000, `${st?.quads} quads, ${st?.tris} triangles`);
  check('the city is far more built than its skeleton', (st?.stats?.wall ?? 0) > 3000, JSON.stringify(st?.stats));
  // ── the storeys above the ground floor ────────────────────────────────────
  //
  // An Arena city block keeps its buildings' upper floors in `MAP2`, as a mass with a
  // height class (one to three voxel layers). The port read that layer only as "there is a
  // ceiling here" and drew every building one storey tall with a lid on it; the storeys
  // pass draws the mass (`game/mifMesh.js`). "Some buildings are taller than others" is
  // the part that must hold — a city whose every cell came out the same height would mean
  // the height class is being thrown away again.
  check('the city\'s buildings have upper floors, and they are not all the same height',
    (st?.upperStoreys?.boxes ?? 0) > 500 && (st?.upperStoreys?.layers ?? 0) > (st?.upperStoreys?.boxes ?? 0),
    `storeys=${JSON.stringify(st?.upperStoreys)}`);
  check('every upper floor is roofed', (st?.upperStoreys?.roofs ?? 0) === (st?.upperStoreys?.boxes ?? -1),
    `${st?.upperStoreys?.roofs} roofs for ${st?.upperStoreys?.boxes} boxes`);
  check('building entrances are menu edges', (st?.stats?.edge ?? 0) > 0, `edges=${st?.stats?.edge}`);
  check('the city has open sky over its streets', st?.openSky === true && (st?.stats?.ceilinged ?? 0) > 0,
    `openSky=${st?.openSky} ceilinged=${st?.stats?.ceilinged}`);
  // …and the sky is Arena's own: the install's mountains on the horizon and its clouds
  // above them, over the climate's gradient (`game/arenaSky.js`), not a flat colour.
  check('the horizon over the city is the install\'s own mountains and clouds',
    (st?.sky?.mountains ?? 0) > 0 && (st?.sky?.clouds ?? 0) > 0 && /^T/.test(st?.sky?.climate ?? ''),
    `sky=${JSON.stringify(st?.sky)}`);
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
  // …and the sky is the install's own, not a flat wash: a bare vertical gradient puts ONE
  // colour across a row, while Arena's clouds put many. Measured on this frame, every row
  // of the top third carries several shades. (`game/arenaSky.js`)
  const rowColours = (y) => {
    const set = new Set();
    for (let x = 0; x < decoded.width; x++) {
      const o = (y * decoded.width + x) * 4;
      set.add((decoded.data[o] << 16) | (decoded.data[o + 1] << 8) | decoded.data[o + 2]);
    }
    return set.size;
  };
  const skyRows = [0.04, 0.09, 0.14, 0.19].map((f) => rowColours(Math.floor(decoded.height * f)));
  check('the sky over the city carries the install\'s clouds, not one flat colour',
    skyRows.every((n) => n > 4), `colours across the sky rows: ${skyRows.join(', ')}`);

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

  // ── the weather, in the air ──────────────────────────────────────────────
  //
  // Arena's four weather states are in the level's own `.INF` **filename** — `N` clear,
  // `R` overcast, `W` rain, `S` snow — and the port read only three of them until this
  // pass: `TCW.INF` came out clear (`game/arenaSky.js`). Snow is the harder of the two to
  // get wrong, because it is the one that has to build a whole render pass: the twin
  // project's precipitation volume (`engine/render/precipitation.js`), drawn over the
  // world with the level's own weather driving it.
  await page.goto(`http://localhost:${PORT}/?city&weather=snow&seed=20232&${q}`);
  await page.waitFor('window.__ready === true', { label: 'the city in snow', timeoutMs: 60000 });
  const snowing = await page.evalJs('window.__debug.state()');
  check('a snowy settlement uses its own snow INF', /^TCS\.INF$/.test(snowing?.inf ?? ''), `inf=${snowing?.inf}`);
  check('and the sky it draws is the snowy one', snowing?.sky?.weather === 'S', JSON.stringify(snowing?.sky));
  check('snow falls: the precipitation pass is built and drawing',
    snowing?.weather === 'snow' && (snowing?.precipitation?.particles ?? 0) > 0,
    `weather=${snowing?.weather} ${JSON.stringify(snowing?.precipitation)}`);
  const snowyShot = decodePng(await page.screenshot(path.join(SHOTS, 'm4-city-snow.png')));
  const snowyTop = bandMeans(snowyShot).top;
  // The snow tweak mixes the climate's gradient toward a flat sky and dims it
  // (`WEATHER_TWEAKS.S`: mix 0.62, dim 0.94), so the same city's sky is measurably *less*
  // blue in a snowfall than in the clear. This is the one claim that says the weather
  // reached the sky and not only the air.
  check('a snowing sky is dimmer than the same city\'s clear one',
    snowyTop.b < bands.top.b && snowyTop.b > 60, `snow ${fmt(snowyTop)} vs clear ${fmt(bands.top)}`);
  check('the snow pass raised nothing', (await page.evalJs('window.__debug.errors.length')) === 0,
    `${await page.evalJs('window.__debug.errors.length')} errors`);

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

  // ── fast travel, for real ────────────────────────────────────────────────
  //
  // **The check that would have caught the reported bug.** Everything above reads what the map
  // *says* — `travelUrl` is a string this suite asked for and can always produce — while the
  // journey itself was the one line nothing ran, and that line was wrong: `travel`'s parameter
  // is called `location`, which **shadows `window.location`**, so its `location.href = url` set
  // a `href` property on a plain marker object and the page never went anywhere. Fast travel
  // from the world map did nothing at all, which is the player's report verbatim: "when you
  // create a new character it opens the map and you cant even travel anywhere".
  //
  // So this travels — through `__debug.travel`, which is the marker-click path — and then asks
  // the page what it is standing in. The second half of the claim is the marker set before the
  // journey: a live Arena folder is a `FileList` in this page's memory and **cannot survive a
  // page load**, so a travel that navigated would ask the player for their game data again.
  // A marker still set afterwards is what proves the scene was rebuilt in place.
  await page.evalJs('window.__stillTheSamePage = 1');
  const offered = await page.evalJs('window.__debug.travelUrl("Daggerfall")');
  check('the map offers a real travel URL for a city it knows', /location=Daggerfall/.test(offered ?? ''), String(offered));
  const journey = await page.evalJs('window.__debug.travel("Daggerfall")');
  check('travelling names where it is going', journey?.to === 'Daggerfall', JSON.stringify(journey));
  await page.waitFor('window.__debug?.scene === "interior" || (window.__debug?.pageErrors ?? []).length > 0', { label: 'the arrival', timeoutMs: 60000 });
  const arrived = await page.evalJs('({ scene: window.__debug?.scene ?? null, search: location.search, samePage: window.__stillTheSamePage === 1, errors: (window.__debug?.pageErrors ?? []).slice(0, 3) })');
  check('travelling from the map really arrives at the place it named',
    arrived?.scene === 'interior' && /location=Daggerfall/.test(arrived?.search ?? ''), JSON.stringify(arrived).slice(0, 220));
  check('and the journey happened in this page, so a picked Arena folder survives it',
    arrived?.samePage === true, JSON.stringify(arrived).slice(0, 220));
  check('the arrival raised no errors', (arrived?.errors ?? []).length === 0, (arrived?.errors ?? []).join(' | ').slice(0, 300));

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
  // **The property, not the number.** This used to assert exactly sixteen, because only
  // sixteen of Arena's 144 dungeon records ship a `.MIF` of their own. The port now
  // assembles a level for any of the other 128 out of the install's own dungeon pieces
  // (`game/dungeonPlan.js`), so the honest invariant is: the offerable set is never empty,
  // it is never larger than the map's dungeon records, and it is *all* of them only when
  // the pieces are installed — with the pieces missing it must fall back to the sixteen.
  const board = await page.evalJs('window.__debug.radiant()');
  check('only dungeons the install can open are offered',
    (board?.enterableDungeons ?? 0) >= 16
    && (board?.enterableDungeons ?? 0) <= (board?.dungeonRecords ?? 0)
    && (board?.enterableDungeons === 16 || board?.dungeonPieces === true),
    `enterable=${board?.enterableDungeons} of ${board?.dungeonRecords} dungeon records, pieces=${board?.dungeonPieces}`);
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
  const done = await page.evalJs(`JSON.stringify((() => {
    let result;
    const active = window.__debug.radiant().active;
    if (active.kind === 'slay') {
      for (const encounterId of active.combat.ids) result = window.__debug.radiantEvent('killed', {
        where: active.target, questId: active.id, monster: active.combat.monster, encounterId,
      });
    } else result = window.__debug.radiantEvent(${JSON.stringify(finish)}, { where: active.target });
    return result;
  })())`);
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

const SUITES = {
  testmap: suiteTestMap, movement: suiteMovement, interior: suiteArenaInterior, city: suiteArenaCity,
  worldmap: suiteWorldMap, radiant: suiteRadiant, story: suiteStory,
  // Character creation lives in its own module: it is long, it is a flow rather
  // than a scene check, and keeping it here would bury the other suites.
  chargen: makeChargenSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The fight is its own flow too: it needs a real key, a real click and a real monster.
  combat: makeCombatSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  actioncombat: makeActionCombatSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  scenevisuals: makeSceneVisualsSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT, decodePng }),
  dungeonplay: makeDungeonPlaySuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  bounties: makeBountiesSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // And the whole main quest is its own flow: eighteen page loads, one `E` key per beat,
  // and the ending. It is the suite that proves the game can be finished.
  mainquest: makeMainQuestSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The town's people: a city is not a dungeon, and talking is its own interaction.
  townsfolk: makeTownsfolkSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // And the buildings themselves: a sign over a doorway, the room behind it, the keeper
  // in it, and the street the player comes back out onto.
  doors: makeDoorsSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The chasm's own surface — the harbour and a lava lake, drawn from the install's own
  // fields and checked by pixels — and where the first-person weapon stands.
  world: makeWorldSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // Who knows the player: the regard ledger, the hand-in a person pays for, and the street
  // that turns on somebody who cuts one of its own down.
  regard: makeRegardSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // `Escape`: the pause menu, and the one button in the game that throws a character away
  // (New Game, which has to go back through creation **in this page** — the player's folder
  // cannot survive a navigation).
  menu: makeMenuSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The pack, the spellbook and casting: the third of the game a player touches every minute,
  // and the one a player reported missing ("there is no magic or inventory").
  gear: makeGearSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The guilds: membership through a real keeper conversation, standing earned by real
  // completed work, the saved ledger, and a hostile town refusing the stranger. The rank
  // LAW behind it is the twin's own (`tests/unit/guild.test.mjs`); this is where it is
  // true on screen.
  guilds: makeGuildsSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The shop's counter: the visit's own stock and its haggle — the pure law's face in a page.
  commerce: makeCommerceSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The living world: the town's clock, the hours its trades keep, the day its people live,
  // and the watch. **It was written and never registered** — a suite nothing runs is a suite
  // that has never once been green, so it is listed here with the rest.
  living: makeLivingSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT, decodePng, brightness }),
  // The dungeons the install does not ship: 128 of Tamriel's 144 dungeon records are
  // *assembled* out of the pieces this install does have (`game/dungeonPlan.js`), and this is
  // the only suite that ever enters one. It is the reported defect's own suite — "you find
  // yourself blocked off as soon as you enter, or part of the dungeon leads off the map" —
  // and it is here rather than in the unit tests because the level a player meets is the
  // level the *decoder*, the mesher and the collider built, not the voxels the pass wrote.
  generated: makeGeneratedSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The level-up: the other half of the experience the fight has been paying since the
  // monsters learned UESP's EExp rule. A real `F`, a real threshold, the number keys a
  // player has, and the character a reload loads.
  progression: makeProgressionSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT }),
  // The install's own movies: the FLIC reader every other suite has never called, played on
  // a page — Arena's art, the file's own pacing, a key to skip, and an honest refusal for a
  // name the install does not ship. `src/scenes/cutscenePlayer.js` is the caller.
  cutscene: makeCutsceneSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT, decodePng }),
  // The AUDIT: the five symptoms the owner reported, measured. It is **red on purpose** where
  // the game falls short — every failure is a `D-` row in `docs/DEFECTS.md` and a number in
  // `docs/AUDIT-*.md`. Do not "fix" a red here by relaxing it; fix the game, or re-state the
  // row with the evidence (session brief §14, and the five laws at the top of it).
  audit: makeAuditSuite({ check, realErrors, shots: SHOTS, getPort: () => PORT, decodePng, brightness }),
};

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
      if (!SUITES[name]) { check(`known suite: ${name}`, false, 'unknown suite requested'); continue; }
      console.log(`\n── ${name} ──`);
      // **A suite starts from a clean save.** The suites share one browser profile for the
      // whole run, and the game writes what the player wields back to the save file when a
      // weapon changes (`__debug.setWeapon` is a shop's hand-off, and the shop's hand-off
      // persists). The `world` suite ends by wielding a mace and then a *flail* — a weapon
      // this install ships no art for — so the suite that ran next booted its dungeon with a
      // flail in hand and its checks ("the sheet is the one Arena names for the weapon in
      // hand", "the drawn frame is really painted") failed on a state no player ever sees:
      // the weapon the previous suite left behind. Measured, not guessed: passing one suite
      // alone passed, passing `world` before it failed.
      try { await page.evalJs('try { localStorage.clear(); } catch (e) { null; }'); } catch { /* no page yet */ }
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
