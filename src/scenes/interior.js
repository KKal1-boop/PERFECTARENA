// MILESTONE 3–4 HOST — WALK A REAL ARENA INTERIOR, OR A WHOLE ASSEMBLED CITY.
//
// Everything on screen comes from the player's own Arena folder: the `.MIF` grid
// is decompressed and decoded by `src/game/mifLevel.js`, meshed by
// `src/game/mifMesh.js`, and textured with the `.INF`'s texture list through
// `src/arena/arenaData.js`. Nothing is bundled and nothing is hand-authored —
// contrast `scenes/testmap.js`, which is the scaffolding this replaced.
//
// A **city** runs through the same three stages, but its level does not exist in
// any file: `src/game/cityPlan.js` stamps a seeded grid of block `.MIF`s into a
// skeleton, and the textures come from the *location's* INF (`TCN.INF`, …) because
// a skeleton has no `INFO` chunk of its own. That is the whole difference, and it
// is why a city needed no new renderer, mesher or collider.
//
// Usage:
//   ?location=Daggerfall          a *named* location, with the game's own seed
//   ?dungeon=Fang%20Lair          a named dungeon, loaded by its seed's .MIF
//   ?interior=START.MIF           the Imperial Dungeons
//   ?interior=CAS.MIF&level=1     a specific level of the file
//   ?city                          a generated city-state (temperate, clear)
//   ?city=town&seed=7             a generated town
//   ?city&mif=CITYW1.MIF          a specific skeleton
//   ?arena=<folder>               serve Arena's data from the dev server
//
// `?location=` is the one that matters: it resolves the name against
// `CITYDATA.64`, and everything else follows from the data — the settlement kind,
// whether it is coastal, which skeleton template it uses, the climate that picks
// its INF, and above all its **city seed**, which is the location's own
// coordinates. That is what makes `?location=Daggerfall` Daggerfall.

// Debug seam (see docs/ARCHITECTURE.md §6): `state()`, `teleport`, `look`,
// `input`, `advance`, `levels()`, `loadLevel(i)`, `spawnPoint()`, `shotPose()`.

import { Renderer, WORLD_FRAME, SKY_CLEAR } from '../engine/render/renderer.js';
import { SkyRenderer, buildFallbackSkyPanorama } from '../engine/render/skyRenderer.js';
import { identity, lookAt, perspective, mirrorProjectionX, UP_Y } from '../engine/world/mat4.js';
import { Collider } from '../engine/player/collider.js';
import { PlayerMotor, FIXED_DT, MAX_FRAME_DT } from '../engine/player/motor.js';
import { requestLook } from '../engine/player/pointerLock.js';
import { LookFilter } from '../engine/player/lookFilter.js';
import { PITCH_LIMIT } from '../engine/player/mwCamera.js';
import { fieldOfView } from '../engine/ui/viewSettings.js';
import { lookScale, lookInvert } from '../engine/ui/lookSettings.js';
import { ArenaData } from '../arena/arenaData.js';
import { ARENA_TEXTURE_ARCHIVE, CELL_SIZE, buildLevelMesh } from '../game/mifMesh.js';
import { decodeLevel } from '../game/mifLevel.js';
import { buildCityLevel } from '../game/cityPlan.js';
import { CITY_BLOCKS_PER_SIDE, cityInfName, cityTemplateName } from '../game/tables/cityBlocks.js';
import { cityTypeOf } from '../arena/cityDataFile.js';
import { cityTemplateVariant } from '../arena/cityDataSeeds.js';
import { loadWorldMap } from '../game/worldMap.js';
import { LAST_LOCATION_KEY, loadQuestState, saveQuestState, loadRadiantState, saveRadiantState } from '../game/save.js';
import { loadArenaText, cityTextKey, wrapText } from '../arena/arenaText.js';
import { buildQuestChain, stageMif } from '../game/questData.js';
import { applyQuestEvent, currentObjective } from '../game/questState.js';
import { applyRadiantEvent, radiantObjective } from '../game/radiantQuests.js';

/**
 * Interior lighting.
 *
 * Arena's `PAL.COL` is a *dim* palette — the original brightens it per map with
 * light tables, which this milestone does not reproduce — so the whole interior is
 * lit by a single ambient term with no sun, and the number has to compensate.
 * Measured on `tests/shots/m3-start.png`: at 0.26 the frame had 13 hard edges and
 * a peak luminance of 66 of 255 (legible to the eye only because it is a
 * dungeon); at the value below it has an order of magnitude more.
 *
 * Overridable from the URL for tuning: `?ambient=0.9&fog=0.01`.
 */
const INTERIOR_AMBIENT = new Float32Array([0.86, 0.83, 0.79]);
const NO_SUN = new Float32Array([0, 0, 0]);
const FOG_COLOR = new Float32Array([0.07, 0.07, 0.09]);
/** Distance fog that reads as torchlight falloff without crushing the far end. */
const FOG_DENSITY = 0.012;

/**
 * City lighting: daylight.
 *
 * A settlement is outdoors, so unlike an interior it gets a sun. The ambient term
 * is still large — Arena's `PAL.COL` is dim (DECISIONS.md D13) and a city has to
 * read as daytime without light tables — but the sun is what makes buildings cast
 * sides differently from their roofs instead of the whole city being one flat
 * colour. Fog is thinner and tinted toward the sky, because in a city you can see
 * across it.
 *
 * Overridable like the interior's: `?ambient=0.8&fog=0.002&sun=1.2`.
 */
const CITY_AMBIENT = new Float32Array([0.60, 0.61, 0.64]);
const CITY_SUN = new Float32Array([1.0, 0.96, 0.88]);
const CITY_SUN_SCALE = 0.95;
const CITY_FOG_COLOR = new Float32Array([0.60, 0.66, 0.76]);
const CITY_FOG_DENSITY = 0.0045;

/** DOM key code -> motor input field. */
const KEYMAP = { KeyW: 'forward', KeyS: 'back', KeyA: 'strafeLeft', KeyD: 'strafeRight', Space: 'jump' };

/** @param {Set<string>} keys */
function inputOf(keys) {
  return {
    forward: keys.has('KeyW'),
    back: keys.has('KeyS'),
    strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    jump: keys.has('Space'),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    crouch: keys.has('KeyC'),
    sneak: keys.has('ControlLeft'),
    autoRun: false,
  };
}

/**
 * Which way to face on arrival: the most open of the four grid directions.
 *
 * Worth doing because a spawn is not always a room. A city's start point is a
 * two-cell passage *through* the perimeter wall, so facing the default `yaw 0`
 * puts the first frame of the game against a wall — measured, and visible in
 * `tests/shots/m4-city.png` before this existed. Dungeons get the same treatment
 * for free: an arrival cell in a dead end should not stare at the corner.
 *
 * @param {import('../game/mifLevel.js').ArenaLevel} level
 * @param {number} row  the spawn's row (world X)
 * @param {number} col  the spawn's column (world Z)
 * @param {number} [reach]  how far to look ahead before giving up
 * @returns {number} yaw in radians
 */
export function openYaw(level, row, col, reach = 12) {
  const { width, depth, cells } = level;
  const walkable = (r, c) => {
    if (r < 0 || c < 0 || r >= depth || c >= width) return false;
    const cell = cells[r * width + c];
    return !cell.solid && !cell.floor.chasm;
  };
  // `row`/`col` are cell-unit coordinates, so the containing cell is `floor` — a
  // spawn sits at the *centre* of a cell (k + 0.5) and `round` would step into the
  // neighbour, which is how a gate passage reads as open when its far end is a
  // wall. Measured: with `round`, `?city` faced the wall at the end of the gate.
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  // (row step, col step, yaw) — yaw 0 faces +Z, which is the column axis.
  const directions = [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]];
  let best = { score: -1, yaw: 0 };
  for (const [dRow, dCol, yaw] of directions) {
    let score = 0;
    for (let step = 1; step <= reach; step++) {
      if (!walkable(r0 + dRow * step, c0 + dCol * step)) break;
      score = step;
    }
    if (score > best.score) best = { score, yaw };
  }
  return best.yaw;
}

/**
 * Resolve `?location=` / `?dungeon=` against the world data.
 *
 * Returns the location, the world it came from, the `.MIF` to load and — for a
 * settlement — the city request the generator needs, built entirely from the
 * game's own records. This is the seam that turns a *name* into a *place*: the
 * seed, the template, the climate and the coast all come from `CITYDATA.64` and
 * `TERRAIN.IMG`, so travelling to a location is reproducible and correct rather
 * than a random town with a familiar label.
 *
 * @param {import('../arena/arenaData.js').ArenaData} data
 * @param {URLSearchParams} params
 * @returns {Promise<{world: object, place: object, mapName: string, cityRequest: object|null}|null>}
 */
async function readWorldRequest(data, params) {
  const wanted = params.get('location') ?? params.get('dungeon');
  if (!wanted) return null;
  const world = await loadWorldMap(data);
  const place = world.locations.find((l) => l.name.toLowerCase() === wanted.toLowerCase());
  if (!place) throw new Error(`no Arena location is called "${wanted}"`);

  if (place.kind === 'dungeon') {
    return { world, place, mapName: place.mif, cityRequest: null };
  }

  const kind = cityTypeOf(place.index);
  const weather = 'clear';
  const request = {
    kind,
    climate: place.climate,
    weather,
    coastal: place.coastal,
    blocksPerSide: CITY_BLOCKS_PER_SIDE[kind],
    seed: place.citySeed,
    infName: cityInfName({ climate: place.climate, location: 'city', weather }),
    template: cityTemplateName({ type: kind, coastal: place.coastal, variant: cityTemplateVariant(place, place.coastal) }),
  };
  return { world, place, mapName: request.template, cityRequest: request };
}

/**
 * Read the URL's city request, if the page asked for one.
 *
 * `?city` alone means a city-state at the default seed; `?city=town` and
 * `?city=village` pick the smaller grids; `?blocks=` overrides the grid size;
 * `?inf=` overrides the location INF for a skeleton whose climate is not the one
 * you want to look at.
 *
 * @param {URLSearchParams} params
 * @returns {{kind: 'city'|'town'|'village', climate: string, weather: string, coastal: boolean, blocksPerSide: number, seed: number, infName: string, template: string}|null}
 */
export function readCityRequest(params) {
  if (!params.has('city')) return null;
  const requested = (params.get('city') || '').toLowerCase();
  const kind = requested === 'town' || requested === 'village' ? requested : 'city';
  const climate = params.get('climate') || 'temperate';
  const weather = params.get('weather') || 'clear';
  const coastal = params.has('coastal') && params.get('coastal') !== '0';
  return {
    kind,
    climate,
    weather,
    coastal,
    blocksPerSide: params.has('blocks') ? Number(params.get('blocks')) : CITY_BLOCKS_PER_SIDE[kind],
    seed: params.has('seed') ? Number(params.get('seed')) : 20232,
    infName: (params.get('inf') || cityInfName({ climate, location: 'city', weather })).toUpperCase(),
    // The settlement kind picks the skeleton template, the same way the game picks
    // it for a location: towns do not use the city's map.
    template: cityTemplateName({ type: kind, coastal }),
  };
}

/**
 * Boot an Arena interior — or, with `?city`, an assembled Arena settlement.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Renderer} renderer
 * @param {URLSearchParams} params
 * @param {(msg:string)=>void} status
 * @param {import('../arena/arenaData.js').ArenaSource|null} [source]
 *   an already-chosen source; when omitted, `?arena=` is used
 */
export async function bootInterior(canvas, renderer, params, status, source = null) {
  if (!source) throw new Error('bootInterior needs an Arena data source (a picked folder, or ?arena=…)');

  const data = new ArenaData(source, { onWarn: (m) => console.warn(`[arena] ${m}`) });
  const worldRequest = await readWorldRequest(data, params);
  const cityRequest = worldRequest?.cityRequest ?? readCityRequest(params);
  const place = worldRequest?.place ?? null;
  // The world is loaded even when the page named a bare map file. A scene without
  // it cannot tell whether the dungeon it is standing in is the one the quest sent
  // the player to — and the opening dungeon, `START.MIF`, is exactly that case.
  const world = worldRequest?.world ?? await loadWorldMap(data);
  const mapName = (params.get('interior') || params.get('mif') || worldRequest?.mapName
    || (cityRequest ? cityRequest.template : 'START.MIF')).toUpperCase();
  // Tell the world map where the player is, so its travel times are measured from
  // here rather than from the middle of the continent.
  if (place) {
    try {
      localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ name: place.name, dungeon: place.kind === 'dungeon' }));
    } catch { /* storage can be refused; it is only a convenience */ }
  }

  status(`reading ${mapName}`);
  const mif = await data.mif(mapName);
  const levelIndexWanted = params.has('level') ? Number(params.get('level')) : mif.startingLevelIndex;
  const startIndex = Math.max(0, Math.min(mif.levelCount - 1, levelIndexWanted));

  /** @type {ArenaData} */ void data;

  // ── the debug seam, installed before the first frame so a boot failure is visible
  const errors = [];
  if (typeof window !== 'undefined' && !window.__debug) window.__debug = {};
  window.__debug.errors = errors;

  const sky = new SkyRenderer(renderer.gl);
  sky.setPanorama(buildFallbackSkyPanorama());
  const lookFilter = new LookFilter();
  const keys = new Set();
  const cam = { yaw: 0, pitch: 0 };
  const identityMat = identity();
  const hud = document.getElementById('hud');

  /** Everything about the currently-loaded level. */
  let current = null;
  const dbg = { frame: 0, painted: 0, seconds: 0, shotReady: false, reloaded: 0, notice: null };

  /** How far the player is from a cell, in world units. */
  function motorCell(level, objective) {
    if (!level) return { x: 0, z: 0 };
    return {
      x: level.motor.pos[0] - (objective.cellX + 0.5) * CELL_SIZE,
      z: level.motor.pos[2] - (objective.cellZ + 0.5) * CELL_SIZE,
    };
  }

  /**
   * Load one level of the map: decode, mesh, upload textures, rebuild collision.
   * @param {number} index
   */
  async function loadLevel(index) {
    const mifLevel = mif.levels[index];
    if (!mifLevel) throw new Error(`${mapName} has no level ${index}`);
    status(`${mapName} level ${index + 1}/${mif.levelCount}`);
    if (mifLevel.warnings.length) for (const w of mifLevel.warnings) data.warn(`${mapName} level ${index}: ${w}`);

    // A city is assembled here, from the same skeleton every time but a different
    // draw of blocks: `?seed=` is what makes a city reproducible, which is also
    // what lets the browser suite assert anything about it at all.
    let voxels = mifLevel;
    let infName = mifLevel.info.toUpperCase();
    let city = null;
    if (cityRequest) {
      status(`building ${mapName} · ${cityRequest.kind} seed ${cityRequest.seed}`);
      city = await buildCityLevel({
        data,
        mif,
        blocksPerSide: cityRequest.blocksPerSide,
        seed: cityRequest.seed,
      });
      voxels = city.level;
      infName = cityRequest.infName;
    }
    const inf = await data.inf(infName);
    const level = decodeLevel(voxels, inf, {
      width: mif.width,
      depth: mif.height,
      mapType: cityRequest ? 'city' : 'interior',
    });
    const built = buildLevelMesh(level, { cellSize: CELL_SIZE });

    // Textures first, under the archive/record pair each sub-mesh asks for: a
    // sub-mesh whose texture is missing draws untextured, not black, so this is
    // the one thing that must not be left to chance.
    let uploaded = 0;
    const missing = [];
    for (const material of built.materials) {
      const upload = await data.texture(material.ref);
      if (!upload) { missing.push(material.key); continue; }
      renderer.uploadTexture(ARENA_TEXTURE_ARCHIVE, material.record, upload);
      uploaded++;
    }

    const mesh = renderer.createMesh(built.model);
    const collider = new Collider();
    collider.addMesh('arena-level', built.collider.positions, built.collider.indices, identity());
    const motor = new PlayerMotor(collider, { speed: 34, running: 20, swimming: 20 });

    const spawn = level.spawn ?? { x: mif.depth / 2, y: level.floorY, z: mif.width / 2 };
    motor.spawn(spawn.x * CELL_SIZE, spawn.y * CELL_SIZE, spawn.z * CELL_SIZE);

    // Arena interiors are enclosed; the sky is only drawn when a level has cells
    // without a ceiling (outdoor streets, and dungeon courtyards).
    const openSky = level.stats.ceilinged < level.cells.length;
    const outdoor = Boolean(cityRequest) || level.outdoors;
    const base = cityRequest ? CITY_AMBIENT : INTERIOR_AMBIENT;
    const ambient = params.has('ambient') ? Number(params.get('ambient')) : base[0];
    const fogDensity = params.has('fog') ? Number(params.get('fog')) : (cityRequest ? CITY_FOG_DENSITY : FOG_DENSITY);
    const sunScale = params.has('sun') ? Number(params.get('sun')) : (cityRequest ? CITY_SUN_SCALE : 0);
    renderer.setClearColor(openSky ? SKY_CLEAR : [0.02, 0.02, 0.03, 1]);
    renderer.setLighting(
      new Float32Array([ambient, ambient * (cityRequest ? 1.0 : 0.965), ambient * (cityRequest ? 1.02 : 0.92)]),
      sunScale,
      sunScale > 0 ? CITY_SUN : NO_SUN,
    );
    renderer.setFog('exp2', fogDensity, 0, 0, cityRequest ? CITY_FOG_COLOR : FOG_COLOR);

    current = { index, level, built, mesh, collider, motor, inf, infName, uploaded, missing, openSky, outdoor, spawn, cam, city };
    if (hud) {
      const what = city
        ? `${cityRequest.kind} · seed ${cityRequest.seed} · ${city.stats.stamped}/${city.slots.length} blocks`
        : `level ${index + 1}/${mif.levelCount}`;
      hud.textContent =
        `${mapName} · ${what} · ${infName}\n`
        + `${mif.width}×${mif.height} cells · ${built.stats.quads} quads · ${built.materials.length} materials · ${uploaded} textures\n`
        + 'WASD move · Shift run · Space jump · E take · M world map · [ ] change level';
      // The objective line: where the thing you came for is, in paces.
      const objective = current.objective;
      if (objective && !objective.done) {
        const dx = motorCell(current, objective).x;
        const dz = motorCell(current, objective).z;
        const paces = Math.round(Math.hypot(dx, dz));
        hud.textContent += `\nThe ${objective.what} lies ${paces} paces from here — find the deepest chamber, then press E.`;
      } else if (objective?.done) {
        hud.textContent += '\nTaken. Nothing else waits here.';
      }
    }
    return current;
  }

  await loadLevel(startIndex);

  // Arrive facing out of the gate, the doorway or the room rather than into it.
  if (!params.has('shot') && !params.has('yaw')) {
    cam.yaw = openYaw(current.level, current.spawn.x, current.spawn.z);
  }

  // ── Arena's own prose, and the work to be done here ───────────────────────
  //
  // Two things happen on arrival that make this a game rather than a walkthrough:
  // the place *says something* — Arena's own gate greeting for a city-state, its
  // own arrival text for a quest dungeon — and, when the player has come here for a
  // reason, there is something to find.
  const library = await loadArenaText(data);
  const chain = buildQuestChain(world);
  let quest = loadQuestState();
  let radiant = loadRadiantState();

  /**
   * What this place says when you arrive.
   *
   * A city-state gets the greeting `citytxt` files under its own index
   * (`arenaText.cityTextKey`); a dungeon gets `dungeon.txt`'s entry for its name.
   * Nothing is shown when the data has no words for a place — an invented greeting
   * would be worse than none.
   */
  function arrivalText() {
    if (!place || !world) return null;
    if (place.kind !== 'dungeon') {
      const cities = world.locations.filter((l) => l.provinceID === place.provinceID && l.kind === 'city');
      const cityIndex = cities.findIndex((c) => c.name === place.name);
      const greeting = cityIndex >= 0 ? library.cityGreetings.get(cityTextKey(place.provinceID, cityIndex)) : null;
      if (!greeting) return null;
      return { title: place.name, text: greeting.text, source: 'Arena: citytxt' };
    }
    const intro = library.dungeonIntros.get(place.name.toLowerCase());
    if (!intro) return null;
    return { title: intro.name, text: intro.text, source: 'Arena: dungeon.txt' };
  }

  /**
   * The deepest reachable cell of a level: where a Staff piece would be kept.
   *
   * Arena puts a piece in a particular room that `A.EXE` names, which is not in the
   * data this project has (D11). The deepest chamber is derived instead from the
   * level the player is actually standing in: a breadth-first walk from the spawn
   * over the walkable cells, taking the last one reached. It is the same answer a
   * player would give if asked where the heart of a dungeon is, and it is the only
   * place a pickup can go that is guaranteed to be *reachable* — a piece walled off
   * behind an undecoded door would make the quest unfinishable. Logged as S22 in
   * PROGRESS.md.
   *
   * @param {object} level a decoded level
   * @returns {{x: number, z: number, depth: number, cells: number}|null} in cells
   */
  function deepestCell(level) {
    // The grid's own convention, taken from the mesh builder: `row` is world **x**
    // and `col` is world **z**, so a cell is `cells[x * width + z]`, x runs over
    // `depth` and z over `width`. Getting this backwards is not visible on a square,
    // centred level (`START.MIF`, and every dungeon's first floor) — it only shows on
    // the off-centre ones, which is how it was caught.
    const { width, depth } = level;
    const at = (x, z) => (x < 0 || z < 0 || x >= depth || z >= width ? null : level.cells[x * width + z]);
    // A wall is the only thing a player cannot cross. Doors open, chasms are jumped
    // (`Space`), raised platforms are stepped onto, entity flats are decorations. A
    // flood that stopped at a door would leave most of a dungeon "unreachable" and
    // could put the objective behind one.
    const walkable = (cell) => Boolean(cell) && cell.kind !== 'wall';
    const start = {
      x: Math.min(depth - 1, Math.max(0, Math.floor(level.spawn.x))),
      z: Math.min(width - 1, Math.max(0, Math.floor(level.spawn.z))),
    };
    if (!walkable(at(start.x, start.z))) return null;
    const seen = new Uint8Array(width * depth);
    const queue = [{ ...start, depth: 0 }];
    seen[start.x * width + start.z] = 1;
    let best = { ...start, depth: 0 };
    let visited = 1;
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head];
      if (here.depth > best.depth) best = { x: here.x, z: here.z, depth: here.depth };
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = here.x + dx;
        const nz = here.z + dz;
        if (nx < 0 || nz < 0 || nx >= depth || nz >= width) continue;
        const index = nx * width + nz;
        if (seen[index] || !walkable(at(nx, nz))) continue;
        seen[index] = 1;
        visited++;
        queue.push({ x: nx, z: nz, depth: here.depth + 1 });
      }
    }
    return { ...best, cells: visited };
  }

  /**
   * What the player is here to do, if anything.
   *
   * The main quest and the side work are asked the same question — "is the thing I
   * want in the place you are standing in?" — and the answer is one event, at one
   * cell. The event names are the state machines' own, so nothing here can invent a
   * transition the machines would refuse.
   */
  function objectiveHere() {
    const stage = chain.stages[quest.step] ?? null;
    const here = place ? place.name.toLowerCase() : null;
    const same = (name) => typeof name === 'string' && here !== null && name.toLowerCase() === here;

    // The opening dungeon is a bare map file, not a `CITYDATA` location — Arena
    // ships it as `START.MIF` beside the game rather than among its provinces — so
    // it is recognised by its *filename* while every other stage is recognised by
    // the name the player travelled to.
    if (stage?.kind === 'escape' && mapName.toUpperCase() === stage.mif.toUpperCase()) {
      return { owner: 'main', event: 'escaped', what: 'the way out of the Imperial Dungeons' };
    }
    if (!place) return null;

    if (stage?.kind === 'piece') {
      if (!quest.mapKnown && same(stage.clue?.title)) {
        return { owner: 'main', event: 'foundClue', what: `the map to ${stage.title}` };
      }
      if (quest.mapKnown && same(stage.title)) {
        return { owner: 'main', event: 'foundPiece', what: `piece ${stage.piece} of the Staff of Chaos` };
      }
    }

    const active = radiant.active;
    if (active && !active.completed && same(active.target)) {
      const event = { artifact: 'found', fetch: 'found', slay: 'killed', rescue: 'rescue', deliver: 'deliver' }[active.kind] ?? null;
      return event ? { owner: 'side', event, what: active.subject } : null;
    }
    return null;
  }

  /** The arrival panel and the objective, rebuilt for the level now loaded. */
  function refreshObjective() {
    const wanted = objectiveHere();
    const deep = current.level ? deepestCell(current.level) : null;
    current.objective = wanted && deep
      ? { ...wanted, cellX: deep.x, cellZ: deep.z, depth: deep.depth, cells: deep.cells, done: false }
      : null;
    return current.objective;
  }

  /**
   * `E` — take whatever is here, or say that nothing is.
   *
   * A pickup is only allowed within a couple of cells of the objective, so the
   * journey has to actually be made; and the state machines get the final word on
   * whether the event was legitimate.
   */
  async function interact() {
    const objective = current.objective ?? refreshObjective();
    if (!objective || objective.done) {
      showNotice('There is nothing here to take.', 1400);
      return false;
    }
    const dx = current.motor.pos[0] / CELL_SIZE - 0.5 - objective.cellX;
    const dz = current.motor.pos[2] / CELL_SIZE - 0.5 - objective.cellZ;
    const distance = Math.hypot(dx * CELL_SIZE, dz * CELL_SIZE);
    if (distance > 3) {
      showNotice(`You are not there yet — ${Math.round(distance)} paces from ${objective.what}.`, 1400);
      return false;
    }
    if (objective.owner === 'main') {
      const result = applyQuestEvent(quest, objective.event, { chain });
      if (!result.ok) { showNotice(result.reason, 2000); return false; }
      quest = result.state;
      saveQuestState(quest);
      showNotice(`Taken: ${objective.what}.\n\n${currentObjective(quest, chain)}`, 6000);
    } else {
      const result = applyRadiantEvent(radiant, objective.event, { where: place?.name });
      if (!result.ok) { showNotice(result.reason, 2000); return false; }
      radiant = result.state;
      saveRadiantState(radiant);
      showNotice(`Done: ${radiant.active?.title ?? 'the job'}.\n\n${radiantObjective(radiant) ?? ''}`, 6000);
    }
    objective.done = true;
    return true;
  }

  /** A short line on the HUD, in the game's voice. */
  function showNotice(text, ms) {
    const el = document.getElementById('notice');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => el.classList.remove('on'), ms ?? 3000);
    dbg.notice = text;
  }

  /** Put the arrival text up, and let it sit until the player moves on. */
  function showArrival() {
    const arrival = arrivalText();
    const el = document.getElementById('arrival');
    if (!el || !arrival) return null;
    el.innerHTML = `<h2>${arrival.title}</h2>`
      + wrapText(arrival.text, 58).map((line) => `<p>${line}</p>`).join('')
      + `<p class="src">${arrival.source}</p>`;
    el.classList.add('on');
    return arrival;
  }

  const arrival = showArrival();
  refreshObjective();

  // ── input ──────────────────────────────────────────────────────────────────
  /**
   * Open the world map on `M`, remembering where the player is so its travel
   * times are measured from here. The map is a separate scene, so this is a page
   * change — which is honest about what fast travel is.
   */
  function openWorldMap() {
    try {
      localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
        name: place?.name ?? mapName,
        dungeon: place?.kind === 'dungeon',
      }));
    } catch { /* ignoring storage is fine; the map falls back to the continent's centre */ }
    const arena = source.arenaPath ? `&arena=${encodeURIComponent(source.arenaPath)}` : '';
    location.href = `?map${arena}`;
  }

  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'BracketRight') void loadLevel(Math.min(mif.levelCount - 1, current.index + 1)).then(refreshObjective);
    if (e.code === 'BracketLeft') void loadLevel(Math.max(0, current.index - 1)).then(refreshObjective);
    if (e.code === 'KeyM') openWorldMap();
    if (e.code === 'KeyE') void interact();
    if (e.code === 'Escape') document.getElementById('arrival')?.classList.remove('on');
    if (document.pointerLockElement !== canvas) requestLook(canvas);
  });
  // The arrival panel is a page, not a wall: the first move dismisses it.
  addEventListener('keydown', () => document.getElementById('arrival')?.classList.remove('on'), { once: false });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', () => requestLook(canvas));
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    lookFilter.add(e.movementX * lookScale(), -e.movementY * lookScale() * lookInvert());
  });

  // ── the debug seam ─────────────────────────────────────────────────────────
  Object.assign(window.__debug, {
    scene: 'interior',
    map: mapName,
    /** The place's own words, or null when Arena's data has none. */
    arrival: () => (arrival ? { title: arrival.title, text: arrival.text, source: arrival.source, shown: document.getElementById('arrival')?.classList.contains('on') ?? false } : null),
    /** What is here to be taken, where it is, and how far away it is. */
    objective: () => (current.objective
      ? {
        ...current.objective,
        paces: Math.round(Math.hypot(motorCell(current, current.objective).x, motorCell(current, current.objective).z)),
      }
      : null),
    /** Take it, exactly as `E` does. */
    interact: () => interact(),
    /** The main quest, as this scene sees it. */
    quest: () => ({
      step: quest.step,
      stage: chain.stages[quest.step]?.title ?? null,
      objective: currentObjective(quest, chain),
      pieces: quest.pieces,
      mapKnown: quest.mapKnown,
      entries: quest.log,
    }),
    /** The side work, as this scene sees it. */
    side: () => ({ active: radiant.active?.title ?? null, target: radiant.active?.target ?? null, objective: radiantObjective(radiant), day: radiant.day }),
    /** Put the camera at the objective cell, for a test that must not walk there. */
    teleportToObjective: () => {
      const objective = current.objective ?? refreshObjective();
      if (!objective) return null;
      current.motor.spawn((objective.cellX + 0.5) * CELL_SIZE, current.level.floorY * CELL_SIZE, (objective.cellZ + 0.5) * CELL_SIZE);
      return { x: objective.cellX, z: objective.cellZ };
    },
    state: () => ({
      scene: 'interior',
      map: mapName,
      level: current.index,
      levelCount: mif.levelCount,
      levelName: mif.levels[current.index].name,
      inf: current.infName,
      size: [mif.width, mif.height],
      frames: dbg.frame,
      painted: dbg.painted,
      seconds: dbg.seconds,
      feet: Array.from(current.motor.pos),
      eye: current.motor.eyeAt(),
      yaw: cam.yaw,
      pitch: cam.pitch,
      grounded: current.motor.grounded,
      spawn: current.spawn,
      draws: renderer.stats?.draws ?? null,
      tris: current.built.model.indices.length / 3,
      colliderTris: current.built.collider.indices.length / 3,
      subMeshes: current.built.model.subMeshes.length,
      quads: current.built.stats.quads,
      textures: current.uploaded,
      openSky: current.openSky,
      outdoor: current.outdoor,
      // ── the story this scene is taking part in ──
      questStage: chain.stages[quest.step]?.title ?? null,
      arrivalShown: document.getElementById('arrival')?.classList.contains('on') ?? false,
      objective: current.objective ? { what: current.objective.what, event: current.objective.event, done: current.objective.done, depth: current.objective.depth } : null,
      notice: dbg.notice,
      // Who this place is, when the player arrived by name rather than by URL file.
      location: place
        ? {
          name: place.name,
          kind: place.kind,
          province: place.province,
          climate: place.climate,
          coastal: place.coastal,
          citySeed: place.citySeed ?? null,
          dungeonSeed: place.dungeonSeed ?? null,
          mif: place.mif ?? mapName,
        }
        : null,
      city: current.city
        ? {
          kind: cityRequest.kind,
          seed: cityRequest.seed,
          climate: cityRequest.climate,
          weather: cityRequest.weather,
          inf: current.infName,
          blocksPerSide: cityRequest.blocksPerSide,
          start: current.city.start,
          reserved: current.city.reserved,
          stamped: current.city.stats.stamped,
          cells: current.city.stats.cells,
          missing: current.city.missing,
          blocks: current.city.slots.filter((s) => s.mif).map((s) => s.mif),
        }
        : null,
      stats: current.level.stats,
      warnings: mif.levels[current.index].warnings,
      missingTextures: current.built.model.subMeshes
        .map((sm) => `${sm.textureArchive}_${sm.textureRecord}`)
        .filter((k) => !renderer.textures.has(k)),
      errors: errors.length,
    }),
    levels: () => mif.levels.map((l, i) => ({ index: i, name: l.name, inf: l.info.toUpperCase(), warnings: l.warnings })),
    loadLevel: async (i) => { await loadLevel(i); dbg.reloaded++; },
    /**
     * Load a level and run the simulation until the player has settled on its
     * floor, so a caller does not have to poll `grounded`.
     */
    loadLevelAndSettle: async (i, seconds = 0.6) => { await loadLevel(i); step(seconds); },
    teleport: (x, y, z) => { current.motor.spawn(x, y, z); },
    /** Teleport to a cell of the current level, on its floor. */
    teleportCell: (row, col) => { current.motor.spawn(row * CELL_SIZE + CELL_SIZE / 2, current.level.floorY * CELL_SIZE, col * CELL_SIZE + CELL_SIZE / 2); },
    look: (yaw, pitch = 0) => { cam.yaw = yaw; cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)); },
    input: (code, down = true) => { if (down) keys.add(code); else keys.delete(code); },
    keys: () => Array.from(keys),
    spawnPoint: () => ({ x: current.spawn.x * CELL_SIZE, y: current.spawn.y * CELL_SIZE, z: current.spawn.z * CELL_SIZE }),
    /** Find the nearest standable cell to a point, for tests that need a target. */
    cellAt: (row, col) => {
      const { level } = current;
      if (row < 0 || col < 0 || row >= level.depth || col >= level.width) return null;
      const c = level.cells[row * level.width + col];
      return { kind: c.kind, solid: c.solid, chasm: c.floor.chasm, ceiling: c.ceiling, floorTexture: c.floor.texture, sideTexture: c.sideTexture };
    },
    advance: (seconds = 1) => { step(seconds); },
    shotPose: () => {
      const { motor } = current;
      const spawn = current.spawn;
      motor.spawn(spawn.x * CELL_SIZE, spawn.y * CELL_SIZE, spawn.z * CELL_SIZE);
      cam.yaw = Number(window.__debug.__shotYaw ?? 0);
      cam.pitch = -0.06;
    },
  });

  // ── the loop ───────────────────────────────────────────────────────────────
  let acc = 0;
  let last = performance.now();
  let painted = 0;
  const shotMode = params.has('shot');
  if (shotMode) window.__debug.shotPose();

  /** Advance the simulation by `dt` seconds, fixed-step. */
  function step(dt) {
    lookFilter.tick(dt, cam);
    const input = inputOf(keys);
    acc += Math.min(dt, MAX_FRAME_DT);
    let guard = 0;
    while (acc >= FIXED_DT && guard++ < 8) { current.motor.update(FIXED_DT, input, cam.yaw, cam.pitch); acc -= FIXED_DT; }
    dbg.seconds += dt;
    dbg.frame++;
  }

  function paint() {
    const motor = current.motor;
    const eye = motor.eyeAt();
    const fov = fieldOfView();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const proj = mirrorProjectionX(perspective(fov, aspect, 0.05, 800));
    const fwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
    const view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], UP_Y);
    renderer.beginFrame(proj, view, [0, 1, 0], WORLD_FRAME);
    if (current.openSky) {
      sky.draw(cam.yaw, cam.pitch, fov, aspect);
      // MANDATORY after a foreign pass: the sky binds its own program and VAO, and
      // without this the mesh below draws with the sky's program still bound.
      renderer.markForeignPass();
    }
    renderer.drawMesh(current.mesh, identityMat, null);
    renderer.resolveFrame();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(dt);
    paint();
    dbg.painted = ++painted;
    if (shotMode && painted === 5) { window.__shotReady = true; dbg.shotReady = true; }
    requestAnimationFrame(frame);
  }

  status(`${mapName} ready`);
  requestAnimationFrame(frame);
  return { loadLevel, state: () => window.__debug.state() };
}
