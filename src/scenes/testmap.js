// MILESTONE 2 HOST — the test courtyard.
//
// Proves the reused engine runs inside PERFECTARENA: WebGL2 renderer on a mesh
// built here, the procedural sky, directional + ambient lighting, distance fog,
// the first-person motor against the engine's capsule/triangle collider, mouse
// look through the engine's look filter, and a fixed-step game loop with
// render-time interpolation.
//
// What it deliberately does NOT do: read any Arena bytes (Milestone 3), draw the
// engine's GL UI (the DOM HUD here is scaffolding), or play audio.
//
// Debug seam for the headless tests — see docs/ARCHITECTURE.md §6:
//   __debug.state()                  player + renderer state
//   __debug.teleport(x, y, z)        place the feet
//   __debug.look(yaw, pitch)         face a direction
//   __debug.input(code, down)        synthetic key state (bypasses the DOM)
//   __debug.advance(seconds)         run the loop forward, no frames painted
//   __debug.errors                   console errors seen since boot

import { Renderer, WORLD_FRAME, SKY_CLEAR } from '../engine/render/renderer.js';
import { SkyRenderer, buildFallbackSkyPanorama } from '../engine/render/skyRenderer.js';
import { identity, lookAt, perspective, mirrorProjectionX, UP_Y } from '../engine/world/mat4.js';
import { Collider } from '../engine/player/collider.js';
import { PlayerMotor, EYE_HEIGHT, FIXED_DT, MAX_FRAME_DT } from '../engine/player/motor.js';
import { requestLook } from '../engine/player/pointerLock.js';
import { LookFilter } from '../engine/player/lookFilter.js';
import { PITCH_LIMIT } from '../engine/player/mwCamera.js';
import { fieldOfView } from '../engine/ui/viewSettings.js';
import { lookScale, lookInvert } from '../engine/ui/lookSettings.js';
import { buildTestMap, testTextures, TEST_ARCHIVE } from '../game/testmap.js';

/** Fixed noon sun, matching the engine's fwd=(sin yaw cos pitch, sin pitch, cos yaw cos pitch). */
const SUN_DIR = new Float32Array([0.35, 0.78, 0.52]);
const AMBIENT = new Float32Array([0.34, 0.36, 0.42]);
const SUN_COLOR = new Float32Array([1.0, 0.96, 0.86]);
const FOG_COLOR = new Float32Array([0.62, 0.68, 0.78]);

/** DOM key code -> motor input field. */
const KEYMAP = { KeyW: 'forward', KeyS: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight', Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run', ControlLeft: 'crouch' };

/** @param {KeyboardEvent|{code:string}} e @param {Set<string>} keys @param {Set<string>} pressed */
function keyDown(e, keys, pressed) { if (e?.code) { if (!e.repeat && !keys.has(e.code)) pressed.add(e.code); keys.add(e.code); } }
function keyUp(e, keys) { if (e?.code) keys.delete(e.code); }

/**
 * Read the held-key set into the motor's input contract.
 *
 * `forward`/`strafe` are signed axes, so `S` is `forward: −1` — the boolean form the
 * first version used meant `S` moved nothing (the movement code has no `back` arm).
 * `crouch` is a **press edge**: the motor toggles the stance whenever the flag is set,
 * and a held key flipped crouch/stand every 0.10 s. See the note in `scenes/interior.js`.
 *
 * @param {Set<string>} keys @param {Set<string>} pressed
 */
function inputOf(keys, pressed) {
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  return {
    forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    back: keys.has('KeyS'),
    strafe,
    up: keys.has('KeyE'),
    down: keys.has('KeyQ'),
    jump: keys.has('Space'),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    sneak: keys.has('ControlLeft') || keys.has('ControlRight'),
    // `Ctrl` crouches (`scenes/interior.js`'s `inputOf`): `C` is the spellbook's key.
    crouch: pressed.has('ControlLeft') || pressed.has('ControlRight'),
    autoRun: false,
  };
}

/**
 * Boot the test-map scene.
 * @param {HTMLCanvasElement} canvas
 * @param {Renderer} renderer
 * @param {URLSearchParams} params
 * @param {(msg:string)=>void} status
 */
export async function bootTestMap(canvas, renderer, params, status) {
  const errors = [];
  if (typeof window !== 'undefined' && !window.__debug) window.__debug = {};
  window.__debug.errors = errors;

  status('building test map');
  const { model, spawn } = buildTestMap();

  // Textures first, under the archive/record pair each sub-mesh asks for. A
  // mesh whose sub-mesh texture is missing draws UNTEXTURED - which looks like
  // a lit surface, not an error, and is only visible as "the floor has no
  // grain" (this was a real bug on the first run of this scene).
  const textures = testTextures();
  for (const t of textures) renderer.uploadTexture(TEST_ARCHIVE, t.record, t.image);

  const mesh = renderer.createMesh(model);

  // Collision is the same triangle soup the renderer draws, so geometry and
  // collision cannot disagree.
  const collider = new Collider();
  collider.addMesh('testmap', model.positions, model.indices, identity());

  const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30 });
  motor.spawn(spawn[0], spawn[1], spawn[2]);
  const lookFilter = new LookFilter();

  const sky = new SkyRenderer(renderer.gl);
  sky.setPanorama(buildFallbackSkyPanorama());
  renderer.setClearColor(SKY_CLEAR);
  renderer.setLighting(AMBIENT, 1, SUN_COLOR);
  renderer.setFog('exp2', 0.008, 0, 0, FOG_COLOR);
  renderer.setBloom?.(0);

  const cam = { yaw: 0, pitch: 0 };
  const keys = new Set();
  /** Keys that went down since the last step — the motor wants press edges. */
  const pressed = new Set();
  const identityMat = identity();

  // ── input wiring ──────────────────────────────────────────────────────────
  addEventListener('keydown', (e) => { keyDown(e, keys, pressed); if (e.code === 'Space') e.preventDefault(); releaseOnAnyKey(); });
  addEventListener('keyup', (e) => keyUp(e, keys));
  addEventListener('blur', () => keys.clear());
  const releaseOnAnyKey = () => { if (document.pointerLockElement !== canvas) requestLook(canvas); };
  canvas.addEventListener('pointerdown', () => requestLook(canvas));
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    lookFilter.add(e.movementX * lookScale(), -e.movementY * lookScale() * lookInvert());
  });

  const hud = document.getElementById('hud');
  const drawHud = (fps) => {
    if (!hud) return;
    const e = motor.eyeAt();
    hud.textContent =
      `${fps.toFixed(0)} fps  ${motor.grounded ? 'grounded' : 'airborne'}\n` +
      `pos ${e[0].toFixed(1)} ${e[1].toFixed(1)} ${e[2].toFixed(1)}   yaw ${(cam.yaw * 180 / Math.PI).toFixed(0)}°\n` +
      'WASD move · Shift run · Space jump · click to look';
  };

  status('test map ready');

  // ── the debug seam ────────────────────────────────────────────────────────
  /** @type {{frame:number, painted:number, seconds:number, shotReady:boolean}} */
  const dbg = { frame: 0, painted: 0, seconds: 0, shotReady: false };
  Object.assign(window.__debug, {
    scene: 'testmap',
    state: () => ({
      scene: 'testmap',
      frames: dbg.frame,
      painted: dbg.painted,
      seconds: dbg.seconds,
      feet: Array.from(motor.pos),
      eye: motor.eyeAt(),
      yaw: cam.yaw,
      pitch: cam.pitch,
      grounded: motor.grounded,
      speed: Math.hypot(motor.pos[0] - spawn[0], motor.pos[2] - spawn[2]),
      draws: renderer.stats?.draws ?? null,
      tris: model.indices.length / 3,
      subMeshes: model.subMeshes.length,
      textures: renderer.textures.size,
      // Every sub-mesh's texture must exist, or that sub-mesh draws untextured.
      missingTextures: model.subMeshes
        .map((sm) => `${sm.textureArchive}_${sm.textureRecord}`)
        .filter((k) => !renderer.textures.has(k)),
      errors: errors.length,
    }),
    teleport: (x, y, z) => { motor.spawn(x, y, z); },
    look: (yaw, pitch = 0) => { cam.yaw = yaw; cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)); },
    input: (code, down = true) => { if (down) { if (!keys.has(code)) pressed.add(code); keys.add(code); } else keys.delete(code); },
    keys: () => Array.from(keys),
    spawnPoint: () => spawn.slice(),
    /** Run the simulation forward without waiting for frames. */
    advance: (seconds = 1) => { step(seconds); },
    /**
     * The fixed vantage `?shot` uses: the south-east corner, looking across the
     * courtyard at its centre. Deliberately off-axis - a head-on shot of a
     * symmetric court renders the same left and right, which makes "did the
     * geometry actually draw?" unanswerable from the pixels.
     */
    shotPose: () => { motor.spawn(-6, 0.2, -18); cam.yaw = 0.142; cam.pitch = -0.05; },
  });

  // ── the loop ──────────────────────────────────────────────────────────────
  let acc = 0;
  let last = performance.now();
  let fps = 60;
  let painted = 0;
  const shotMode = params.has('shot');
  if (shotMode) window.__debug.shotPose();

  /** Advance the simulation by `dt` seconds of real time, fixed-step. */
  function step(dt) {
    lookFilter.tick(dt, cam);
    const input = inputOf(keys, pressed);
    acc += Math.min(dt, MAX_FRAME_DT);
    let guard = 0;
    while (acc >= FIXED_DT && guard++ < 8) { motor.update(FIXED_DT, input, cam.yaw, cam.pitch); acc -= FIXED_DT; }
    pressed.clear();   // the edges are this frame's (see inputOf)
    dbg.seconds += dt;
    dbg.frame++;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps = fps * 0.9 + (1 / Math.max(dt, 0.0001)) * 0.1;
    step(dt);
    paint();
    dbg.painted = ++painted;
    if (shotMode && painted === 5) { window.__shotReady = true; dbg.shotReady = true; }
    if (painted % 15 === 0) drawHud(fps);
    requestAnimationFrame(frame);
  }

  function paint() {
    const eye = motor.eyeAt();
    const fov = fieldOfView();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const proj = mirrorProjectionX(perspective(fov, aspect, 0.05, 500));
    const fwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
    const view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], UP_Y);
    renderer.beginFrame(proj, view, SUN_DIR, WORLD_FRAME);
    sky.draw(cam.yaw, cam.pitch, fov, aspect);
    // MANDATORY: the sky owns its own program and VAO, so the renderer's state
    // shadows are stale after it. Without this the mesh below is drawn with the
    // SKY program still bound - silently, with INVALID_OPERATION noise on every
    // uniform (verified: the courtyard came out as sky).
    renderer.markForeignPass();
    renderer.drawMesh(mesh, identityMat, null);
    renderer.resolveFrame();
  }

  requestAnimationFrame(frame);
}

/** Exported so the headless harness can assert the tuning constants. */
export const TESTMAP_CONSTANTS = Object.freeze({ FIXED_DT, MAX_FRAME_DT, EYE_HEIGHT, SUN_DIR: Array.from(SUN_DIR) });
