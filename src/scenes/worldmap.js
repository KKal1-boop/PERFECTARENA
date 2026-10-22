// THE WORLD MAP OF TAMRIEL — MILESTONE 5'S CENTREPIECE.
//
// The whole continent, drawn from the player's own copy of Arena:
//
//   * `TAMRIEL.IMG` — the 320×200 world map, with its own embedded palette. This
//     is the original's map art, not a redrawing.
//   * `CITYDATA.64` — nine province rectangles that tile that map, and 432
//     locations inside them (288 settlements, 144 dungeons).
//   * `TERRAIN.IMG` — the terrain class per pixel, which decides each location's
//     climate and whether it is coastal, and therefore which city art it uses.
//   * the main quest's chain, from `game/questData.js`, whose provinces and
//     dungeons are *derived* from the same two files.
//
// A location's marker is at its real position (its local point scaled into its
// province's rectangle), and clicking it travels there. Fast travel loads the
// location with the game's own identity: a settlement gets its **city seed** —
// the location's coordinates — so the city you arrive in is that city's city, not
// a generic one, and its climate and coast pick the right `T*C*`/`D*C*`/`M*C*`
// textures. A dungeon gets its seed's `.MIF`, which is exactly what the loose
// numeric files in an Arena folder are.
//
// Rendering is a plain 2D canvas over the game canvas rather than the engine's GL
// UI pass: the map is static art plus markers, and the engine's UI path wants an
// FNT font that Arena's own font files have not given up yet (FORMATS.md §9).
// Logged as S19 in PROGRESS.md, with the GL-UI version as the noted alternative.
//
// **The screen is the game's, down to the markers** (block B16, `D-35`). Everything that goes on
// top of the picture — the four marker icons, the set they blink to, the nine province plates —
// comes out of the player's own archive through `game/mapScreen.js`, which is where the readings
// live. Until that landed this scene drew circles, diamonds, gold rectangles and uppercase
// monospace province names of its own invention over art Arena had drawn for exactly this screen.

import { ArenaData } from '../arena/arenaData.js';
import { parseDfa } from '../arena/dfa.js';
import { parseImg } from '../arena/image.js';
import { loadWorldMap, TERRAIN_GLYPH } from '../game/worldMap.js';
import {
  BLINK_PERIOD_MS, ICON_MAX_SCALE, MARKER_COLORS, MARKER_ICONS, MARKER_KINDS, MARKER_RECORDS,
  MAP_SCREEN_RECORD, PLATE_BACKGROUND_INDEX, PLATE_COLORS, PLATE_TEXT_INDEX, RECORD_LAYOUT,
  blinkingAt, frameToRgba, indicesToRgba, legendRows, loadMapScreen, markerKind, markerRecord,
  plateIndexFor, provinceMapRecord, provincePointOf,
} from '../game/mapScreen.js';
import { buildQuestChain, nearestSettlement, stageMif } from '../game/questData.js';
import { cellOriginOfPixel, pixelOfCell, provincePixelOf, youAreHere, WORLD_GRID_VERSION } from '../game/tamrielGrid.js';
import { locationGlobalPoint } from '../arena/cityDataFile.js';
import { applyQuestEvent, createQuestState, currentObjective, questLog } from '../game/questState.js';
import { loadArenaText } from '../arena/arenaText.js';
import {
  advanceDays, applyRadiantEvent, buildBoard, discoverLooseMifs, enterableDungeons,
  enterableFromListing, generateQuest, namedSettlements, radiantLog, radiantObjective, repairWildTargets,
} from '../game/radiantQuests.js';
import { DUNGEON_BLOCKS_MIF } from '../game/dungeonPlan.js';

import {
  LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY,
  loadCharacter, loadQuestState, saveCharacter, saveQuestState, loadLastLocation, saveLastLocation,
  loadRadiantState, saveRadiantState, loadRegard, loadWorldState, saveWorldState,
} from '../game/save.js';
import { peopleKnown, regardTally, standingWord } from '../game/regard.js';
import { classById } from '../game/character.js';
import { escapeHtml } from '../engine/ui/escape.js';
import { beginNewGame } from './newGame.js';
import { advanceWorldTime, worldClock } from '../game/worldState.js';

// The three save keys are re-exported here because this scene was their first
// home; `game/save.js` now owns them so every scene shares one implementation.
export { LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY };

/** The sea the map floats on, when the view is wider than the map itself. */
const SEA = '#0b1626';

/**
 * Which province the Imperial Palace stands in.
 *
 * `CITYDATA.64` has no record for the palace, so on a province map it is placed from this project's
 * own knowledge of where it is (`PALACE_POINT` on the world map) and only shown on the province it
 * belongs to: the Imperial Province, the ninth block.
 */
const PALACE_PROVINCE_ID = 8;

/**
 * Where the Imperial Palace stands on the map.
 *
 * Not a `CITYDATA` record: the palace is the seat of the Empire and the map's art has it painted
 * on, but no province rectangle holds it. `game/questData.js` puts the finale here, and
 * `scenes/interior.js`'s `OPENING_DUNGEON_POINT` is the same pixel — the one place every part of
 * the port already agrees about.
 */
const PALACE_POINT = Object.freeze({ x: 175, y: 99 });

/**
 * The name a location is identified by in the map's own bookkeeping.
 *
 * A name alone will not do: `CITYDATA` leaves 128 of its 144 dungeons unnamed, so 128 of them
 * would share the key `undefined`. The record's address in the file (`provinceID#id`) is what
 * `worldMap.js` already salts dungeon names by, and it is unique by construction.
 */
function markerKey(location) {
  return `${location.provinceID}#${location.id}`;
}

/**
 * Expand a palettized image to a canvas-ready ImageData, with index 0 *opaque*.
 * (`palette.toRgba` makes index 0 a cutout, which is right for sprites and wrong
 * for a map whose index 0 is water.)
 *
 * @param {Uint8Array} indices
 * @param {{rgb: Uint8Array}} palette
 * @param {number} width @param {number} height
 * @returns {ImageData}
 */
function toMapImageData(indices, palette, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i] * 3;
    data[i * 4] = palette.rgb[p];
    data[i * 4 + 1] = palette.rgb[p + 1];
    data[i * 4 + 2] = palette.rgb[p + 2];
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

/**
 * Expand a sprite frame for the travel card: index 0 is the **cutout** here (a horse, not a map).
 *
 * @param {Uint8Array} indices @param {{rgb: Uint8Array}} palette
 * @param {number} width @param {number} height
 * @returns {ImageData}
 */
function toSpriteImageData(indices, palette, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (v === 0) continue;
    const p = v * 3;
    out[i * 4] = palette.rgb[p];
    out[i * 4 + 1] = palette.rgb[p + 1];
    out[i * 4 + 2] = palette.rgb[p + 2];
    out[i * 4 + 3] = 255;
  }
  return new ImageData(out, width, height);
}

/** The quest state carried between page loads. */
// The loaders and savers live in `game/save.js`; this scene reads and writes
// through them so the map, a city and a dungeon all agree about what is saved.

/**
 * Boot the world map.
 *
 * This scene is a 2D DOM layer: the GL canvas is left idle and untouched behind it,
 * and the renderer is not drawn with. Both are still taken, because the scene
 * signature is `bootInterior`'s and because **starting a new game from this page's
 * own sheet hands them back to `scenes/newGame.js`** — the same in-place flow the
 * `Escape` menu uses inside a level (see that module for why it cannot be a
 * `location.href`).
 *
 * @param {HTMLCanvasElement} canvas the game's GL canvas (used only by the new-game handoff)
 * @param {object} renderer the engine renderer (likewise)
 * @param {URLSearchParams} params
 * @param {(msg: string) => void} status
 * @param {import('../arena/arenaData.js').ArenaSource|null} source
 * @param {{overlay?: boolean, onTravel?: (location: object) => unknown, onClose?: () => void}} [opts]
 *   `overlay` opens the map **over a running game** (`M` in `scenes/interior.js`) instead of
 *   as a page of its own. In that mode travel is not a `location.href`: the caller's
 *   `onTravel` is handed the location and rebuilds the scene in place, which is what
 *   keeps a hand-picked Arena folder (a File System Access handle) alive — navigating
 *   threw it away and the map page had to ask for the folder again, which is exactly
 *   what a player reported: "if you click M you need to re insert the game files".
 */
export async function bootWorldMap(canvas, renderer, params, status, source = null, opts = {}) {
  if (!source) throw new Error('bootWorldMap needs an Arena data source');
  const overlay = Boolean(opts.overlay);
  /** Every listener this scene owns, so `close()` can take them all back. */
  const ac = new AbortController();
  const signal = ac.signal;
  let alive = true;
  /** One transition at a time: a second new game while the first is building (see `newGame`). */
  let leaving = false;
  /** What travel has done here: the last journey handed off, and how many. */
  const dbg = { travel: null, handoffs: 0, failed: null };
  /** The sheet's own new-game warning, before it is agreed to. */
  let sheetConfirm = false;

  const data = new ArenaData(source, { onWarn: (m) => console.warn(`[arena] ${m}`) });
  status('reading the world');
  const world = await loadWorldMap(data);
  const chain = buildQuestChain(world);
  for (const warning of chain.warnings) console.warn(`[quest] ${warning}`);
  let quest = loadQuestState();
  // A stage whose dungeon is missing from this install cannot be travelled to;
  // say so instead of silently offering a broken marker.
  if (chain.missing.length) console.warn(`[quest] not in this data set: ${chain.missing.join(', ')}`);

  // ── the side work ──────────────────────────────────────────────────────────
  //
  // Arena's own prose, and the dungeons this install can actually open. Both are
  // needed before a board can be posted: a quest may only ever point at a place
  // whose `.MIF` is present (see `radiantQuests.js`).
  const library = await loadArenaText(data);
  for (const warning of library.warnings) console.warn(`[text] ${warning}`);
  const loose = await discoverLooseMifs(source);
  const dungeons = enterableDungeons(world, enterableFromListing(loose));
  let radiant = loadRadiantState();
  // A country job written before the short-walk rule may still point a whole pixel or two
  // from its anchor (the owner's "too far from North Keep to reasonably walk to it"); pull
  // it back beside the gate and save the repair, so an in-progress job is not lost.
  if (repairWildTargets(radiant, world)) saveRadiantState(radiant);
  // Who the world knows, written by the streets and read here: the same record the towns
  // and shops write (`game/save.js`'s `REGARD_KEY`), so a page load between the two does not
  // lose it.
  let regard = loadRegard();

  // ── who the player is ──────────────────────────────────────────────────────
  //
  // Creation and the world were two halves that never met: the map knew where the
  // player was and nothing about who they were, so a character was made and then
  // never seen again. The sheet is drawn on this screen, and a job's reward is paid
  // into *this* purse — which is what makes creation matter to the game rather than
  // only to the character-creation page.
  let character = loadCharacter();

  /**
   * Where the player last stood, as the game saved it.
   *
   * `{name, dungeon, seed, wild, country}` — the location's own name and whether it was a dungeon
   * (the board's rule below: a board hangs in a town, not in a dungeon), the **world cell** of the
   * country foot when there is one (`wild`, written by every gate crossing and kept up with the walk
   * by `scenes/interior.js`'s `maybeSaveWildFoot`), and `country` — whether the page the player is
   * *on* is the country at all. The last of those is what tells a player standing out in the wild
   * from one standing in a town that merely remembers the cell outside its gate, and it is the
   * difference the map's own mark is drawn from (`standMark`).
   *
   * @returns {{name: string|null, dungeon: boolean, seed: number|null,
   *   wild: {row: number, col: number}|null, country: boolean}}
   */
  function lastLocation() {
    return loadLastLocation(world) ?? { name: null, dungeon: false, seed: null, wild: null, country: false };
  }

  /**
   * The settlement whose board is posted: the nearest **named** one to wherever the
   * player last was.
   *
   * Named, because `CITYDATA` carries empty records for the city slots a province
   * does not use (31 of them in this install) — an unnamed board would read
   * "&#8202;— the board". And a settlement at all, because `nearestSettlement`
   * walks *every* record; see `radiantQuests.namedSettlements`.
   */
  function boardGiver() {
    // **The full location record, not `nearestSettlement`'s summary.** That helper answers
    // `{name, province, global, …}` for a written card — no `tamriel`, no `provinceID`, no
    // `id` — and a board built on it sent every wild target to the *painted-map* pixel: the
    // job came out in the wrong place with a one-pace walk (the owner's "too far from North
    // Keep" and the crash that followed). The map's own nearest is measured in the world grid
    // the board's wild targets use, and the record it returns has everything a job needs.
    const point = lastLocationGlobal();
    let best = null;
    for (const settlement of namedSettlements(world)) {
      const at = settlement.tamriel ?? settlement.global;
      const distance = Math.hypot(at.x - point.x, at.y - point.y);
      if (!best || distance < best.distance) best = { settlement, distance };
    }
    return best?.settlement ?? namedSettlements(world)[0] ?? null;
  }

  /**
   * The jobs posted here today, drawn deterministically from the town's own seed.
   *
   * **Empty while the player is in a dungeon.** Arena's side work reaches the player
   * through a *person* — a tavern keeper, a guildmaster, a stranger with a problem — or
   * through a board on a wall in a town. A board that could be read from the bottom of
   * a dungeon made the world map the place jobs came from, which is the reported
   * "you can randomly take them by the map instead of from NPCs". Standing in a
   * settlement (or between towns, with none saved yet) posts that settlement's board;
   * standing in a dungeon posts nothing, and the panel says where boards hang.
   */
  function boardOffers(giver = boardGiver()) {
    if (!giver?.name || inDungeon()) return [];
    return buildBoard({
      world, library, seed: ((giver.citySeed ?? 1) ^ (radiant.day * 2654435761)) >>> 0,
      giver, day: radiant.day, dungeons,
    });
  }

  /** Whether the player's own save says they are down a dungeon. */
  function inDungeon() {
    return lastLocation().dungeon === true;
  }

  function refreshBoard() {
    radiant = { ...radiant, offers: boardOffers() };
    saveRadiantState(radiant);
    return radiant.offers;
  }

  // ── the screen's own art ─────────────────────────────────────────────────
  //
  // The picture, the markers and the province plates are all the game's, read out of the
  // player's own archive (`game/mapScreen.js`): `MAPOUT.CIF` for the four kinds of place,
  // `MAPBLINK.CIF` for the set they blink to, `OUTPROV.CIF` for the nine province names, and
  // two bytes of `PAL.COL` for the gold they carry. A record that is missing is named here
  // rather than quietly leaving a blank map.
  const mapScreen = await loadMapScreen(data);
  for (const warning of mapScreen.warnings) console.warn(`[map] ${warning}`);
  const art = mapScreen.screen;
  const artData = toMapImageData(art.indices, art.palette, art.width, art.height);
  const artCanvas = document.createElement('canvas');
  artCanvas.width = art.width;
  artCanvas.height = art.height;
  artCanvas.getContext('2d').putImageData(artData, 0, 0);

  /**
   * One canvas per marker kind per record — the icon the game drew, in the palette's own gold.
   * @type {Record<string, {steady?: HTMLCanvasElement, blinking?: HTMLCanvasElement}>}
   */
  const markerCanvases = {};
  for (const [kind, records] of Object.entries(mapScreen.icons)) {
    markerCanvases[kind] = {};
    for (const [state, icon] of Object.entries(records)) {
      const color = state === 'blinking' ? mapScreen.colors.blinking : mapScreen.colors.steady;
      const canvas = document.createElement('canvas');
      canvas.width = icon.width;
      canvas.height = icon.height;
      canvas.getContext('2d').putImageData(new ImageData(
        frameToRgba(icon.indices, icon.colorIndex, color), icon.width, icon.height), 0, 0);
      markerCanvases[kind][state] = canvas;
    }
  }

  /** The nine province plates, in the record's own two colours. */
  const plateCanvases = mapScreen.plates.map((plate) => {
    const canvas = document.createElement('canvas');
    canvas.width = plate.width;
    canvas.height = plate.height;
    canvas.getContext('2d').putImageData(new ImageData(indicesToRgba(plate.indices, {
      [PLATE_BACKGROUND_INDEX]: mapScreen.colors.plateBackground,
      [PLATE_TEXT_INDEX]: mapScreen.colors.plateText,
    }), plate.width, plate.height), 0, 0);
    return { name: plate.name, canvas, width: plate.width, height: plate.height };
  });

  /** What the last frame drew of the screen's own records — the debug seam's reading. */
  const mapArtState = {
    screen: MAP_SCREEN_RECORD,
    record: markerRecord({ blinking: false }),
    blinking: false,
    switches: 0,
    icons: {},
    plaquesDrawn: [],
    /** Where the player's own mark went on the last frame — see `drawHereMark`. */
    here: null,
    warnings: mapScreen.warnings.slice(),
  };
  let lastBlink = false;

  // ── the DOM layer ───────────────────────────────────────────────────────────
  const host = document.getElementById('map') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'map' }));
  host.innerHTML = '';
  host.classList.add('on');
  const view = document.createElement('canvas');
  view.id = 'map-canvas';
  host.appendChild(view);
  const bar = document.createElement('div');
  bar.id = 'map-bar';
  host.appendChild(bar);
  const card = document.createElement('div');
  card.id = 'map-card';
  host.appendChild(card);
  const hoverLabel = document.createElement('div');
  hoverLabel.id = 'map-hover';
  host.appendChild(hoverLabel);
  const board = document.createElement('div');
  board.id = 'map-board';
  host.appendChild(board);
  const journal = document.createElement('div');
  journal.id = 'map-journal';
  host.appendChild(journal);
  const sheet = document.createElement('div');
  sheet.id = 'map-sheet';
  host.appendChild(sheet);
  const legend = document.createElement('div');
  legend.id = 'map-legend';
  legend.innerHTML = `<b>Tamriel</b> — the world of Arena<br>`
    + legendRows().map((row) => `<span class="k"><canvas class="mk" data-kind="${row.kind}" width="${row.width}" height="${row.height}"></canvas> ${row.label}</span>`).join(' ')
    + `<br>${overlay ? 'M or Esc to close · ' : ''}wheel to zoom · drag to pan · click a marker to travel`;
  for (const canvas of legend.querySelectorAll('canvas.mk')) {
    const kind = canvas.dataset.kind;
    const source = markerCanvases[kind]?.steady;
    if (source) canvas.getContext('2d').drawImage(source, 0, 0);
  }
  // ── the dev teleport ────────────────────────────────────────────────────────
  //
  // The owner, 2026-10-17: *"you need to add for me in the region and total map a way to click a
  // button and there click anywhere in the map and teleport there for tasting purposes so i can
  // tell you whats wrong in the persistent world"*. Both levels of the screen answer it, and what
  // a click *means* is the game's own arithmetic rather than a rule of this project's:
  //
  //   * on **Tamriel** the picture *is* the 320×200 world map, so the pixel under the pointer is
  //     already a world pixel (`game/worldMap.js`);
  //   * on a **province** the picture is the hand-drawn province map, whose pixels are exactly the
  //     `local` pair `CITYDATA.64` keeps for a place — which is what `provincePointOf` reads them
  //     as — so `locationGlobalPoint(province, { local })` is the whole conversion.
  //
  // From that world pixel `game/tamrielGrid.js` gives the **world cell** (256 cells to a pixel,
  // `cellOriginOfPixel`), and the cell is what `?wild=row,col` takes.
  //
  // A click that lands *on* a marker is still that marker's: a settlement's marker is a place with
  // a name and the card is where a place is explained, so the armed mode only takes the bare map.
  // **The developer teleport button is gone.** The owner, 2026-10-22: *"Teleport (dev) button
  // under 'M or esc to close' should be removed"*. The map is the player's page now; the
  // `?wild=` door the button used is still the game's own (the world map's travel links speak
  // it), so nothing of the feature is lost — only the switch in the legend.
  host.appendChild(legend);

  const tools = document.createElement('div');
  tools.id = 'map-tools';
  tools.innerHTML = `<label>Map <select id="map-region" aria-label="Map province">
    <option value="">All Tamriel</option>${world.provinces.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
    <div class="map-nav"><button id="map-prev" aria-label="Previous province">◀</button><button id="map-continent">Tamriel</button><button id="map-next" aria-label="Next province">▶</button></div>
    <label><input type="checkbox" id="map-terrain"> Terrain / biome</label>
    <label><input type="checkbox" id="map-borders"> Province borders</label>
    <label>Find a place <input id="map-search" type="search" placeholder="City, village or dungeon…" aria-label="Search places"></label>
    <select id="map-kind" aria-label="Place type"><option value="">All places</option>${MARKER_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('')}</select>
    <div id="map-results" role="list" aria-label="Matching places"></div>
    <div id="map-readout" aria-live="polite"></div>
    <small>Terrain colours: forest · mountain · desert · sea.<br>Biome classes, not measured elevation. Borders use the original map masks.</small>`;
  host.appendChild(tools);
  const regionSelect = tools.querySelector('#map-region');
  const searchInput = tools.querySelector('#map-search');
  const kindSelect = tools.querySelector('#map-kind');
  const resultList = tools.querySelector('#map-results');
  const readout = tools.querySelector('#map-readout');
  let terrainVisible = false, bordersVisible = false;
  const inspectionCache = new Map();
  regionSelect.onchange = () => regionSelect.value === '' ? backToTamriel() : openProvince(world.provinces[Number(regionSelect.value)]);
  tools.querySelector('#map-continent').onclick = () => backToTamriel();
  tools.querySelector('#map-prev').onclick = () => openProvince(world.provinces[((shownProvince?.id ?? 0) + 8) % 9]);
  tools.querySelector('#map-next').onclick = () => openProvince(world.provinces[((shownProvince?.id ?? -1) + 1) % 9]);
  tools.querySelector('#map-terrain').onchange = (e) => { terrainVisible = e.target.checked; draw(); };
  tools.querySelector('#map-borders').onchange = (e) => { bordersVisible = e.target.checked; draw(); };
  searchInput.oninput = kindSelect.onchange = () => { updateSearch(); draw(); };

  /** Filters never alter place coordinates or their travel identity. */
  function matchesFilter(location) {
    return (!kindSelect.value || location.kind === kindSelect.value)
      && (!searchInput.value.trim() || location.name.toLowerCase().includes(searchInput.value.trim().toLowerCase()));
  }

  function updateSearch() {
    const matches = world.locations.filter((l) => (!shownProvince || l.provinceID === shownProvince.id) && matchesFilter(l));
    resultList.innerHTML = `<small>${matches.length} matching places</small>`;
    if (!searchInput.value.trim() && !kindSelect.value) return;
    for (const location of matches.slice(0, 40)) {
      const button = document.createElement('button');
      button.textContent = `${location.name} · ${location.province} · ${location.kind}`;
      button.setAttribute('role', 'listitem');
      button.onclick = () => {
        if (!shownProvince) openProvince(world.provinces[location.provinceID]);
        select(location); centerOn(location.local); draw();
      };
      resultList.appendChild(button);
    }
  }

  function updateReadout() {
    const clock = opts.clock?.() ?? worldClock(loadWorldState()) ?? { day: Math.max(1, radiant.day), minutes: 600 };
    const you = standMark();
    const at = pointerAt ? toWorld(pointerAt) : null;
    const province = shownProvince ?? (at ? world.provinceAt(at) : world.provinces[you?.provinceID]);
    const cursor = at ? ` · pointer ${Math.floor(at.x)},${Math.floor(at.y)} (${shownProvince ? 'province' : 'map'})` : '';
    readout.textContent = `Day ${clock.day + (clock.turned ?? 0)} · ${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')} · ${province?.name ?? 'open sea'}\n`
      + (you ? `You: ${you.label} · world ${you.global.x},${you.global.y}` : 'No saved position') + cursor;
  }

  /** Cached inspection layers: the install gives biome classes, not an elevation raster. */
  function inspectionLayer(kind) {
    const key = `${shownProvince?.id ?? 'tamriel'}:${kind}`;
    if (inspectionCache.has(key)) return inspectionCache.get(key);
    const layer = document.createElement('canvas'); layer.width = 320; layer.height = 200;
    const context = layer.getContext('2d');
    if (kind === 'terrain') {
      const colors = { temperate: '#46783c', mountain: '#c0c6ce', desert: '#cda556' };
      for (const province of (shownProvince ? [shownProvince] : world.provinces)) {
        for (let y = 0; y < 200; y += 2) for (let x = 0; x < 320; x += 2) {
          const local = { x, y };
          const global = world.mapPoint(province.id, local);
          const projected = shownProvince ? local : world.mapPoint(province.id, local);
          if (!shownProvince && world.masks && !world.masks[province.id].get(projected.x, projected.y)) continue;
          const here = youAreHere(world, global.y * 256, global.x * 256);
          context.fillStyle = here.sea ? '#254e76' : colors[here.climate];
          context.fillRect(projected.x, projected.y, shownProvince ? 2 : 1, shownProvince ? 2 : 1);
        }
      }
    } else if (world.masks) {
      const pixels = context.createImageData(320, 200);
      for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) {
        const p = shownProvince ? world.mapPoint(shownProvince.id, { x, y }) : { x, y };
        const owner = world.masks.find((mask) => mask.get(p.x, p.y));
        if (!owner) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !owner.get(p.x + dx, p.y + dy))) {
          const i = (y * 320 + x) * 4;
          pixels.data.set([255, 218, 104, 230], i);
        }
      }
      context.putImageData(pixels, 0, 0);
    }
    inspectionCache.set(key, layer);
    return layer;
  }

  /** The visible window onto the 320×200 map, in CSS pixels. */
  const viewport = { scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0, fit: 1, dpr: 1 };
  /** Where the pointer last was, in CSS pixels, or null. The province plate follows it. */
  let pointerAt = null;
  /**
   * Which level of the screen is up: all of Tamriel, or one province's own hand-drawn map.
   *
   * The two-level map is the original's, and the owner's report is what brought it here: *"the real
   * arena map … you click the province and then you zoom to an handrawn map of the province that
   * then shows all the places and with little icons of villages dungeons and cities"*. `null` is
   * Tamriel; a province object is that province's own picture (`HIGHROCK.IMG`, …), with its 48
   * places at the pixels `CITYDATA.64` stores for them.
   * @type {object|null}
   */
  let shownProvince = null;
  /** Each province map's canvas, made when its province is first opened. */
  const provinceCanvases = new Map();
  /** Every province whose own map has been opened this session, for the debug seam. */
  const openedProvinces = new Set();
  /** @type {object|null} */
  let selected = null;
  /** @type {object|null} */
  let hovered = null;
  let message = null;
  let messageUntil = 0;

  const ctx = view.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewport.dpr = dpr;
    viewport.width = host.clientWidth || window.innerWidth;
    viewport.height = host.clientHeight || window.innerHeight;
    view.width = Math.round(viewport.width * dpr);
    view.height = Math.round(viewport.height * dpr);
    view.style.width = `${viewport.width}px`;
    view.style.height = `${viewport.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    viewport.fit = Math.min(viewport.width / art.width, viewport.height / art.height);
    if (viewport.scale === 1) centerOn({ x: art.width / 2, y: art.height / 2 });
  }

  /** Put the map art's centre at the viewport's centre, at the current scale. */
  function centerOn(point) {
    const s = viewport.fit * viewport.scale;
    viewport.offsetX = viewport.width / 2 - point.x * s;
    viewport.offsetY = viewport.height / 2 - point.y * s;
    clamp();
  }

  /** Keep some of the map on screen at every zoom. */
  function clamp() {
    const s = viewport.fit * viewport.scale;
    const w = art.width * s;
    const h = art.height * s;
    const margin = 40;
    viewport.offsetX = Math.min(viewport.width - margin, Math.max(margin - w, viewport.offsetX));
    viewport.offsetY = Math.min(viewport.height - margin, Math.max(margin - h, viewport.offsetY));
  }

  /** World pixel → CSS pixel. */
  function toScreen(point) {
    const s = viewport.fit * viewport.scale;
    return { x: viewport.offsetX + point.x * s, y: viewport.offsetY + point.y * s };
  }

  /** CSS pixel → world pixel. */
  function toWorld(point) {
    const s = viewport.fit * viewport.scale;
    return { x: (point.x - viewport.offsetX) / s, y: (point.y - viewport.offsetY) / s };
  }

  /**
   * How far from a marker's centre a click and a hover reach, in map pixels.
   *
   * Half the game's own icon for that kind of place (`game/mapScreen.js` holds the four records'
   * sizes), so the target is the art's size rather than a number invented per kind.
   */
  function markerHitRadius(location) {
    const icon = MARKER_ICONS[markerKind(location.kind)] ?? MARKER_ICONS.village;
    return Math.max(icon.width, icon.height) / 2;
  }

  /**
   * The offer board, as a panel.
   *
   * Every posting names the place the work happens and whether its prose is Arena's
   * own, and the accept button is the only way a job is taken — so the panel cannot
   * quietly disagree with the state machine.
   *
   * The panel carries the **regard ledger** as well (`game/regard.js`): who in the world
   * knows the player and how each of them reads. That is the twin's own "people who know
   * you" page, and this is the only screen in the port with room for it — a standing is
   * worth nothing if the player can never see it, and a friendship nobody can see is not one
   * the player can keep.
   */
  function updateBoard() {
    const people = peopleKnown(regard, radiant.day ?? 0, { min: 0, limit: 12 });
    const tally = regardTally(regard, radiant.day ?? 0);
    const giver = boardGiver();
    const active = radiant.active;
    const town = lastLocation();
    const rows = radiant.offers.map((offer) => `
      <li>
        <h3>${offer.title}</h3>
        <p class="sub">${offer.target}${offer.targetMif ? ` · <code>${offer.targetMif}</code>` : ''} · ${offer.targetProvince}</p>
        <p class="sub">${offer.days} days · ${offer.reward} gold · ${offer.dataText ? `<span class="src">${offer.source}</span>` : 'posted by the guild'}</p>
        <button data-offer="${offer.id}">Accept</button>
      </li>`).join('');
    const empty = inDungeon()
      ? `<li class="sub">No board hangs here. Work is given in the towns — in the taverns and the guild halls, and on the boards by their gates. Speak to the people of ${giver?.name ?? 'the nearest town'}.</li>`
      : `<li class="sub">The boards are bare. Travel on and the work will follow.</li>`;
    const known = people.length
      ? `<div class="people"><h3>Who knows you</h3><ul>${people.map((person) => `<li>${escapeHtml(person.word)} in ${escapeHtml(person.place)}`
        + `<span class="sub"> · ${person.regard > 0 ? '+' : ''}${person.regard}</span></li>`).join('')}</ul>`
        + `<p class="hint">${tally.friends} friend${tally.friends === 1 ? '' : 's'} · ${tally.enemies + tally.hostile} enem${tally.enemies + tally.hostile === 1 ? 'y' : 'ies'} · a regard fades half a point a day it is not kept (the twin's own law)</p></div>`
      : '';
    board.innerHTML = `<h2>${(town.dungeon ? 'The wilds' : (giver?.name ?? 'The road'))} — the board</h2>`
      + (active
        ? `<p class="active">In hand: ${active.title}<br><span class="sub">${radiantObjective(radiant)}</span></p>`
        : `<ul>${rows || empty}</ul>`)
      + known
      + `<p class="hint">B to close · ${radiant.taken} done · ${radiant.gold} gold earned</p>`;
    for (const button of board.querySelectorAll('button[data-offer]')) {
      button.onclick = () => acceptOffer(button.dataset.offer);
    }
    journal.innerHTML = radiant.active
      ? `<b>Journal</b><br>${radiantObjective(radiant)}`
      : `<b>Journal</b><br>${currentObjective(quest, chain)}`;
  }

  /** Take a job off the board. */
  function acceptOffer(id) {
    const offer = radiant.offers.find((o) => o.id === id);
    if (!offer) return null;
    const result = radiantStep('accept', { offer });
    if (!result.ok) { message = result.reason; messageUntil = performance.now() + 2500; return null; }
    message = `Taken: ${offer.title} — ${offer.target}.`;
    messageUntil = performance.now() + 2500;
    updateBoard(); draw();
    return offer;
  }

  /** The location the current stage points at, if any. */
  function stageLocation() {
    const stage = chain.stages[quest.step];
    if (!stage) return null;
    if (stage.kind === 'finale') return { name: stage.title, global: { ...PALACE_POINT }, finale: true };
    if (stage.kind === 'escape') return null;
    // **A piece's trail starts at its clue.** The stage names the dungeon that holds the
    // Staff piece, but the player cannot go there until the map in the other dungeon names it
    // (`game/questState.js`'s `mapKnown`). This marker used to say "the piece is here" at the
    // piece dungeon from the first minute, so the one place the quest actually sent the player
    // — the clue dungeon — had no marker at all. The owner, 2026-10-19: *"you should add quest
    // markers for the staff pieces of the main quest"*. With the map in hand the same marker
    // moves to the piece's own dungeon, which is what the stage always meant.
    if (stage.kind === 'piece' && !quest.mapKnown && stage.clue?.title) {
      const clue = world.byName(stage.clue.title);
      if (clue) return { ...clue, finale: false, clue: true };
    }
    const hit = world.byName(stage.title);
    return hit ? { ...hit, finale: false, clue: false } : null;
  }


  function draw() {
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const s = viewport.fit * viewport.scale;
    // The picture: Arena's world map, or — one click in — the hand-drawn map of the province.
    // Smoothing on, so a zoomed map stays readable.
    const picture = currentPicture();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(picture.canvas, viewport.offsetX, viewport.offsetY, picture.width * s, picture.height * s);
    if (terrainVisible) {
      ctx.save(); ctx.globalAlpha = 0.65;
      ctx.drawImage(inspectionLayer('terrain'), viewport.offsetX, viewport.offsetY, 320 * s, 200 * s);
      ctx.restore();
    }
    if (bordersVisible) ctx.drawImage(inspectionLayer('borders'), viewport.offsetX, viewport.offsetY, 320 * s, 200 * s);

    // ── the blink ───────────────────────────────────────────────────────────
    //
    // The game keeps **two** records of the same four icons — `MAPOUT.CIF` in the marker gold and
    // `MAPBLINK.CIF` in the bright one — and a map that alternates them is a blinking map. This
    // frame is on one of the two; `BLINK_PERIOD_MS` is this project's cadence, stamped as such in
    // `game/mapScreen.js` because the original's is in `A.EXE`.
    const blink = blinkingAt(performance.now());
    mapArtState.blinking = blink;
    mapArtState.record = markerRecord({ blinking: blink });
    if (blink !== lastBlink) { lastBlink = blink; mapArtState.switches++; }

    // ── what the map is pointing at ─────────────────────────────────────────
    //
    // Where the player is, where the main quest's next stage is, and where the job in hand sends
    // them. These take the **opposite** record to the rest of the map, so they strobe against a
    // strobbing map instead of vanishing into it, and each carries a word.
    const spotlight = new Set();
    const words = new Map();
    // **Where the player is, in whichever space they are in** — a settlement's own record when they
    // are inside one, and the **world cell** when they are out in the country (`standMark`). The
    // reading here used to be the save's last *settlement* either way, so a player standing in the
    // middle of the wilderness was shown a city's icon and told they were in it.
    const stand = standMark();
    if (stand?.record) { spotlight.add(markerKey(stand.record)); words.set(markerKey(stand.record), 'you are here'); }
    const stage = stageLocation();
    const palace = stage?.finale ? palaceMarker(true) : palaceMarker(false);
    if (stage && !stage.finale) {
      spotlight.add(markerKey(stage));
      words.set(markerKey(stage), stage.clue
        ? 'the map is here'
        : chain.stages[quest.step]?.kind === 'piece' ? 'the piece is here' : 'the trail leads here');
    }
    if (radiant.active) {
      const hit = world.byName(radiant.active.completed ? radiant.active.giver : radiant.active.target);
      if (hit) { spotlight.add(markerKey(hit)); words.set(markerKey(hit), radiant.active.completed ? 'collect your pay' : 'your job'); }
    }

    // ── the markers, which are the game's own four icons ───────────────────
    //
    // **The places are on the province's map, not on Tamriel's.** Arena's own screen does it this
    // way — the continent carries its nine provinces, and clicking one opens that province's
    // hand-drawn map, where there is room for its forty-eight settlements and dungeons to be the
    // four little icons they are. The port had no province maps at all until this block: it drew
    // 432 invented circles on the continent instead (the owner: *"instead of points with villages
    // dungeons an cities"*).
    ctx.imageSmoothingEnabled = false;
    const drawn = {};
    const iconScale = Math.min(s, ICON_MAX_SCALE);
    const places = shownProvince
      ? placesOf(shownProvince).filter((l) => l.wildJob || matchesFilter(l))
      : [];
    for (const location of places) {
      const kind = location.wildJob ? 'dungeon' : markerKind(location.kind);
      const icon = kind ? MARKER_ICONS[kind] : null;
      if (!icon) continue;
      const p = toScreen(provincePointOf(location));
      const w = icon.width * iconScale;
      const h = icon.height * iconScale;
      if (p.x + w / 2 < 0 || p.y + h / 2 < 0 || p.x - w / 2 > viewport.width || p.y - h / 2 > viewport.height) continue;
      const key = markerKey(location);
      const isSpot = spotlight.has(key);
      const isSelected = selected != null && markerKey(selected) === key;
      const phase = (isSpot || isSelected) ? !blink : blink;
      const canvas = markerCanvases[kind]?.[phase ? 'blinking' : 'steady'];
      if (canvas) ctx.drawImage(canvas, p.x - w / 2, p.y - h / 2, w, h);
      drawn[kind] = (drawn[kind] ?? 0) + 1;
      if (isSpot || isSelected || location.wildJob) {
        drawLabel(location.wildJob ? `your job \u2014 ${location.label ?? location.name}` : (words.get(key) ?? dungeonLabel(location)), p.x, p.y - h / 2 - 3);
      } else if (kind === 'city') {
        drawLabel(location.name, p.x, p.y + h / 2 + 11);
      }
    }
    // The player's own mark: the record's icon on the continent (the province's own maps hold their
    // places already), and the **little dot** for a cell out in the country, on whichever of the two
    // levels is showing. `CITYDATA` puts no palace on a province map, so the palace is drawn on the
    // world map and on the Imperial Province's own map.
    mapArtState.here = drawHereMark(stand, blink, iconScale, drawn);
    const palaceHere = !shownProvince || shownProvince.id === PALACE_PROVINCE_ID;
    if (palace && palaceHere && !shownProvince) {
      const icon = MARKER_ICONS.city;
      const p = toScreen(palace.point);
      const w = icon.width * iconScale;
      const h = icon.height * iconScale;
      const phase = palace.spotlight ? !blink : blink;
      const canvas = markerCanvases.city?.[phase ? 'blinking' : 'steady'];
      if (canvas) ctx.drawImage(canvas, p.x - w / 2, p.y - h / 2, w, h);
      drawn.city = (drawn.city ?? 0) + 1;
      if (palace.spotlight) drawLabel(palace.label, p.x, p.y - h / 2 - 3);
    }
    mapArtState.icons = drawn;

    // ── the province's own name, on its own map ─────────────────────────────
    //
    // The plate record's nine names have a second job here, and it is the one the art fits: on a
    // province's map the province is what the screen is *of*, so its name is its title. The plate
    // is drawn at its own record position (`RECORD_LAYOUT`'s nine offsets) — the layout the record
    // carries, used where it belongs rather than over the world map's painted names.
    if (shownProvince) {
      const index = plateIndexFor(shownProvince.name);
      const plate = index >= 0 ? plateCanvases[index] : null;
      if (plate) {
        const at = toScreen({ x: RECORD_LAYOUT.plates[index].x, y: RECORD_LAYOUT.plates[index].y });
        const ps = Math.min(s, ICON_MAX_SCALE * 1.5);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(plate.canvas, Math.round(at.x), Math.round(at.y), plate.width * ps, plate.height * ps);
        mapArtState.plaquesDrawn = [plate.name];
      }
    }

    // ── the province plate ─────────────────────────────────────────────────
    //
    // `OUTPROV.CIF`'s nine name plates are the game's own lettering for the nine provinces, in
    // the record's own olive and slate. Nothing had ever read them (B16, `D-35`); they are the
    // highlight the pointer carries, which is also why the map art's own painted names are left
    // alone — the plate says *which* province the pointer is in, in the game's own hand.
    const plaquesDrawn = shownProvince ? [...mapArtState.plaquesDrawn] : [];
    const plaque = shownProvince ? null : provincePlaque();
    if (plaque) {
      const index = plateIndexFor(plaque.name);
      const plate = index >= 0 ? plateCanvases[index] : null;
      if (plate) {
        const scale = Math.max(1, Math.round(s));
        const w = plate.width * scale;
        const h = plate.height * scale;
        const at = pointerAt ?? { x: viewport.width / 2, y: viewport.height - 70 };
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(plate.canvas, Math.round(at.x + 14), Math.round(at.y + 12), w, h);
        plaquesDrawn.push(plate.name);
      }
    }
    mapArtState.plaquesDrawn = plaquesDrawn;

    if (message && performance.now() < messageUntil) {
      ctx.font = '13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(12,10,8,0.8)';
      const width = ctx.measureText(message).width;
      ctx.fillRect(viewport.width / 2 - width / 2 - 10, viewport.height - 62, width + 20, 24);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(message, viewport.width / 2, viewport.height - 45);
    }
  }

  /**
   * A word on the map, in the palette's own letters, with the plate's own dark behind it.
   *
   * The map's text is the port's (`game/mapScreen.js` holds the game's plate and marker colours,
   * not its font — Arena's FNT files have not given up their glyphs yet, `FORMATS.md` §9).
   */
  function drawLabel(text, x, y) {
    if (!text) return;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const width = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10,8,4,0.72)';
    ctx.fillRect(x - width / 2 - 4, y - 10, width + 8, 13);
    ctx.fillStyle = PLATE_COLORS.text;
    ctx.fillText(text, x, y);
  }

  /**
   * The province's own hand-drawn map, as a canvas — made the first time it is opened.
   *
   * `game/mapScreen.js` read the nine records (`HIGHROCK.IMG`, `HAMERFEL.IMG`, …); this is the one
   * place they are turned into something the screen can draw. A province with no record answers
   * null, and the screen stays on Tamriel rather than opening a blank page.
   *
   * @param {object} province
   * @returns {{canvas: HTMLCanvasElement, width: number, height: number, record: string}|null}
   */
  function provincePicture(province) {
    if (!province) return null;
    if (provinceCanvases.has(province.id)) return provinceCanvases.get(province.id);
    const entry = mapScreen.provinces.find((p) => p.name === province.name)
      ?? mapScreen.provinces.find((p) => plateIndexFor(p.name) === plateIndexFor(province.name));
    if (!entry) { provinceCanvases.set(province.id, null); return null; }
    const canvas = document.createElement('canvas');
    canvas.width = entry.image.width;
    canvas.height = entry.image.height;
    canvas.getContext('2d').putImageData(toMapImageData(
      entry.image.indices, entry.image.palette, entry.image.width, entry.image.height), 0, 0);
    const value = { canvas, width: entry.image.width, height: entry.image.height, record: entry.record };
    provinceCanvases.set(province.id, value);
    return value;
  }

  /**
   * The picture the screen is showing: Arena's world map, or the province's own map.
   * @returns {{canvas: HTMLCanvasElement, width: number, height: number, record: string}}
   */
  function currentPicture() {
    const province = shownProvince ? provincePicture(shownProvince) : null;
    return province ?? { canvas: artCanvas, width: art.width, height: art.height, record: MAP_SCREEN_RECORD };
  }

  /**
   * Open a province's own map — the original's second level, and the one the places live on.
   *
   * A province whose picture is not in this install is **refused** rather than opened onto a blank
   * screen: the map says so on its status line and stays where it is.
   *
   * @param {object|string} province  a province from `world.provinces`, or its name
   * @returns {string|null} the province that is now open
   */
  function openProvince(province) {
    const hit = typeof province === 'string'
      ? world.provinces.find((p) => plateIndexFor(p.name) === plateIndexFor(province)) ?? null
      : province;
    if (!hit) return null;
    const picture = provincePicture(hit);
    if (!picture) {
      message = `${hit.name} has no map in this install (${provinceMapRecord(hit.id) ?? 'no record'}).`;
      messageUntil = performance.now() + 3000;
      return null;
    }
    shownProvince = hit;
    regionSelect.value = String(hit.id);
    updateSearch(); updateReadout();
    openedProvinces.add(hit.name);
    // The armed teleport's hint names the level of the screen it will act on.
    if (devArmed) setDevArmed(true);
    selected = null;
    hovered = null;
    pointerAt = null;
    hoverLabel.classList.remove('on');
    updateCard();
    updateBar();
    centerOn({ x: picture.width / 2, y: picture.height / 2 });
    draw();
    return hit.name;
  }

  /** Back to Tamriel — the continent the provinces are provinces of. */
  function backToTamriel() {
    if (!shownProvince) return false;
    shownProvince = null;
    regionSelect.value = '';
    updateSearch(); updateReadout();
    selected = null;
    hovered = null;
    pointerAt = null;
    hoverLabel.classList.remove('on');
    if (devArmed) setDevArmed(true);
    updateCard();
    updateBar();
    centerOn({ x: art.width / 2, y: art.height / 2 });
    draw();
    return true;
  }

  /** The province whose rectangle holds a CSS-pixel point, or null. */
  function provinceUnderPoint(point) {
    const w = toWorld(point);
    if (w.x < 0 || w.y < 0 || w.x >= art.width || w.y >= art.height) return null;
    return world.provinceAt(w);
  }

  /** A place's screen point **in the view that is showing**: its province pixel, or its world pixel. */
  function screenPointOf(location) {
    return shownProvince ? toScreen(provincePointOf(location)) : toScreen(location.tamriel ?? location.global);
  }

  /**
   * Where the player is standing, as a `CITYDATA` record — by name, or by the seed a dungeon
   * with no name was entered by (the same two ways `lastLocationGlobal` finds the point).
   *
   * @returns {object|null}
   */
  function whereThePlayerIs() {
    const saved = lastLocation();
    if (saved.name) {
      const named = saved.locationID != null && saved.provinceID != null
        ? world.byId(saved.provinceID, saved.locationID) : world.byName(saved.name, saved.provinceID);
      if (named) return named;
    }
    if (saved.seed == null) return null;
    return world.locations.find((l) => String(l.dungeonSeed) === String(saved.seed)) ?? null;
  }

  /**
   * **Where the mark goes, and what to call it** — the player's own position, for both levels of
   * the map and for the status bar.
   *
   * Two answers, and the save tells them apart:
   *
   *   * the last **settlement** record (`whereThePlayerIs`) when the player is standing in one —
   *     the map's own `CITYDATA` icon, where it has always been, its name under it;
   *   * otherwise the last **world cell** (`game/save.js`'s `wild`, written by every gate crossing
   *     and kept up with the walk), read through the very grid the game's own country pages are
   *     built from (`game/tamrielGrid.js`'s `pixelOfCell` / `provincePixelOf`) — which is where the
   *     little dot goes.
   *
   * The second case is what the owner asked for: *"there is no way for me to see a little dot on
   * the entire map that says \"you are here\" … when im in the wilderness it says im in a city but
   * im not"*. Out in the country the save still names the settlement the player walked out of, and
   * the map drew **that settlement's icon** as if they were standing in it; the cell itself was in
   * the record the whole time.
   *
   * `provinceID` is the province the cell's own pixel falls in (`worldMap.js`'s `provinceAt`), so a
   * province's own hand-drawn map can say whether the mark belongs on it — and the province map's
   * coordinates are the file's own pair, scaled exactly as a location's are.
   *
   * @returns {{record: object|null, country: boolean, kind: string|null, global: {x: number, y: number},
   *   local: {x: number, y: number}, provinceID: number|null, label: string}|null}
   */
  function standMark() {
    const saved = lastLocation();
    if (saved.country && saved.wild) {
      const pixel = pixelOfCell(saved.wild.row, saved.wild.col);
      const province = world.provinceAtWorld(pixel);
      const nearest = nearestSettlement(world, pixel);
      return {
        record: null,
        country: true,
        kind: null,
        global: pixel,
        tamriel: pixel,
        local: provincePixelOf(world, pixel),
        provinceID: province?.id ?? null,
        label: `the country near ${nearest?.name ?? 'nowhere'}`,
      };
    }
    const record = whereThePlayerIs();
    if (!record) return null;
    return {
      record,
      country: false,
      kind: markerKind(record.kind) ?? 'city',
      global: record.tamriel ?? record.global,
      tamriel: record.tamriel ?? record.global,
      local: provincePointOf(record),
      provinceID: record.provinceID ?? null,
      label: record.name || dungeonLabel(record),
    };
  }

  /**
   * The map's own **little dot** for a player standing in the country.
   *
   * Arena's four marker records are for *places*, and a wilderness cell is not one — so this is the
   * one mark on this screen that is not the archive's, and it says so: a dot in the map's own gold
   * (`mapScreen.colors`), strobing against the map's blink the way a spotlighted marker does, with
   * the words the owner asked for under it. It is drawn at the map's scale rather than at an icon's:
   * the mark is a position, not a place, and a wilderness cell has no icon to draw.
   *
   * @param {{x: number, y: number}} p  the point, in CSS pixels
   * @param {boolean} blink  which of the two records this frame is on
   * @param {number} scale  the map's own scale, before `ICON_MAX_SCALE`
   */
  function drawHereDot(p, blink, scale) {
    const gold = blink ? mapScreen.colors.steady : mapScreen.colors.blinking;
    const radius = Math.max(2, 1.6 * Math.min(scale, ICON_MAX_SCALE));
    ctx.save();
    ctx.fillStyle = `rgb(${gold.r},${gold.g},${gold.b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * **Draw the player's own position on the level that is up**, and say what was drawn.
   *
   * The continent carries the record's own icon (the province maps hold their places already, and
   * the palace is the one exception — see `palaceMarker`); a player out in the country gets the dot
   * on **both** levels, because their cell is not one of the places either map holds. On a
   * province's map the mark is drawn only when the cell's province is the one showing, and the
   * settlement's own icon there is left to the marker loop above (which already blinks it and labels
   * it "you are here" through `spotlight`).
   *
   * @returns {object|null} the reading the debug seam reports as `mapArt.here`
   */
  function drawHereMark(stand, blink, scale, drawn) {
    if (!stand) return null;
    const level = shownProvince ? 'province' : 'tamriel';
    const onThisMap = !shownProvince || stand.provinceID === shownProvince.id;
    const where = {
      level,
      country: stand.country,
      global: stand.global,
      local: stand.local,
      provinceID: stand.provinceID,
      label: stand.label,
      drawn: false,
      at: null,
    };
    if (!onThisMap) return where;
    if (stand.country) {
      const p = toScreen(shownProvince ? stand.local : (stand.tamriel ?? stand.global));
      drawHereDot(p, blink, scale);
      drawLabel('you are here', p.x, p.y - 4);
      return { ...where, drawn: true, at: { x: Math.round(p.x), y: Math.round(p.y) } };
    }
    if (shownProvince) return where;    // the province's own icon loop drew it
    const icon = MARKER_ICONS[stand.kind];
    if (!icon) return where;
    const p = toScreen(stand.tamriel ?? stand.global);
    const w = icon.width * scale;
    const h = icon.height * scale;
    const canvas = markerCanvases[stand.kind]?.[(!blink) ? 'blinking' : 'steady'];
    if (canvas) ctx.drawImage(canvas, p.x - w / 2, p.y - h / 2, w, h);
    drawn[stand.kind] = (drawn[stand.kind] ?? 0) + 1;
    drawLabel(stand.label, p.x, p.y - h / 2 - 3);
    return { ...where, drawn: true, at: { x: Math.round(p.x), y: Math.round(p.y) } };
  }

  /**
   * The Imperial Palace, which is not a `CITYDATA` record and so has no marker of its own — the
   * one place this scene has to place from its own knowledge.
   *
   * It gets the **city** icon. The records hold four icons and no fifth, and inventing a fifth
   * distinction is what this block removes; the palace is the seat of the Empire and a city-state
   * on this map, and when the finale is what the map is pointing at, the marker strobes with a
   * word on it instead.
   *
   * @param {boolean} spotlight  the finale is the current stage
   * @returns {{point: {x: number, y: number}, spotlight: boolean, label: string}}
   */
  function palaceMarker(spotlight) {
    return { point: PALACE_POINT, spotlight, label: 'the Imperial Palace' };
  }

  /**
   * The province plate the pointer owes, or null.
   *
   * A location under the pointer wins: its card and its hover word already say where it is, and
   * two plaques on one cursor is one too many.
   */
  function provincePlaque() {
    if (!pointerAt || hovered) return null;
    const world0 = toWorld(pointerAt);
    if (world0.x < 0 || world0.y < 0 || world0.x >= art.width || world0.y >= art.height) return null;
    return world.provinceAt(world0);
  }

  /**
   * The place under a CSS-pixel point, if any.
   *
   * **Only on a province's map**, because that is where the places are drawn: the continent's own
   * screen has nine provinces on it and no settlements (the owner's report, and Arena's own
   * screen). The palace is the exception — it has no `CITYDATA` record, so it is a point this
   * project holds and hit-tests on the continent's own picture.
   *
   * @param {{x: number, y: number}} point
   * @returns {{location: object, distance: number}|null}
   */
  function locationAt(point) {
    let best = null;
    if (!shownProvince) {
      const palace = toScreen(PALACE_POINT);
      const palaceDistance = Math.hypot(palace.x - point.x, palace.y - point.y);
      if (palaceDistance <= 10) {
        return { location: { name: 'The Imperial Palace', kind: 'palace', province: 'Imperial Province', provinceID: PALACE_PROVINCE_ID, id: 0, local: { ...PALACE_POINT }, final: true, global: { ...PALACE_POINT }, climate: 'temperate', coastal: false }, distance: palaceDistance };
      }
      return null;
    }
    const scale = Math.min(viewport.fit * viewport.scale, ICON_MAX_SCALE);
    for (const location of placesOf(shownProvince).filter((l) => l.wildJob || matchesFilter(l))) {
      const p = screenPointOf(location);
      const distance = Math.hypot(p.x - point.x, p.y - point.y);
      const radius = Math.max(7, markerHitRadius(location) * scale + 4);
      if (distance <= radius && (!best || distance < best.distance)) best = { location, distance };
    }
    return best;
  }

  /**
   * **The job's own mark in the country.**
   *
   * A wild job is a world cell, not a `CITYDATA` place, so `world.byName` cannot find it and
   * the province map had nothing to draw. This builds the one marker a wild target needs:
   * the cell's own pixel on the painted map, the province's local point for the province
   * screen, and the settlement that anchors the arrival URL. The owner: *"some should also
   * point to the wilderness instead of the dungeon of a city"*.
   */
  function wildJobMarker() {
    const active = radiant?.active;
    if (!active || active.completed || active.targetKind !== 'wild' || !active.targetCell) return null;
    const pixel = active.targetGlobal ?? pixelOfCell(active.targetCell.row, active.targetCell.col);
    const province = world.provinces.find((p) => p.name === active.targetProvince)
      ?? world.provinceAtWorld(pixel);
    if (!province) return null;
    const local = world.localPointAt(pixel, province.id) ?? { x: pixel.x, y: pixel.y };
    // The settlement the player actually travels to. Its own record (not just its name) is
    // carried, because `CITYDATA` repeats a few names across provinces (D-40) and the arrival
    // has to be `province` + `placeId`, not the first match of a name.
    const anchorPlace = (active.targetAnchorID != null && active.targetAnchorProvinceID != null
      ? world.byId(active.targetAnchorProvinceID, active.targetAnchorID)
      : null)
      ?? world.locations.find((l) => l.provinceID === province.id
        && l.name && l.name === active.targetAnchor) ?? null;
    return {
      name: active.targetAnchor ?? province.name,
      label: active.target,
      kind: 'wild', wildJob: true,
      provinceID: province.id, province: active.targetProvince ?? province.name,
      id: `job:${active.id}`,
      anchorId: anchorPlace?.id ?? active.targetAnchorID ?? null,
      anchorProvinceID: anchorPlace?.provinceID ?? active.targetAnchorProvinceID ?? province.id,
      cell: { ...active.targetCell },
      walk: active.targetWalk ?? null,
      global: { x: pixel.x, y: pixel.y }, tamriel: { x: pixel.x, y: pixel.y },
      local,
      climate: active.targetClimate ?? world.worldClimateAt(pixel),
      coastal: false,
    };
  }

  /** The 48 places `CITYDATA` puts in a province, in the file's own order, and the job. */
  function placesOf(province) {
    const list = world.locations.filter((l) => l.provinceID === province.id);
    const job = wildJobMarker();
    if (job && job.provinceID === province.id) list.push(job);
    return list;
  }

  function describe(location) {
    if (!location) return '';
    if (location.wildJob) return `${location.label ?? location.name} \u2014 a job in the open country, ${location.province}`;
    const kindName = { city: 'city-state', town: 'town', village: 'village', dungeon: 'dungeon', palace: 'the Imperial Palace' }[location.kind] ?? location.kind;
    return `${dungeonLabel(location)} — ${kindName}, ${location.province}`;
  }

  /**
   * What to call a location on the map, honestly.
   *
   * `CITYDATA` names two dungeons a province and leaves its other **fourteen** records
   * anonymous — they are real places with real coordinates and real seeds, and this project
   * will not invent a name Arena did not write (`townsfolk.js` takes the same line about
   * people). So an unnamed dungeon is called what it is, with the seed that decides its
   * layout, which is also what the loader travels by.
   */
  function dungeonLabel(location) {
    if (location.wildJob) return location.label ?? location.name;
    if (location.kind !== 'dungeon') return location.name;
    if (location.name) return location.name;
    return `an unnamed dungeon (seed ${location.dungeonSeed})`;
  }

  /**
   * The travel target for a location: the URL the map sends the player to.
   *
   * The Arena folder has to come along, or the page the player lands on cannot read the
   * data — and there are two ways a page can have been given one: the dev door's `?arena=`
   * parameter, and a chosen folder (`source.arenaPath`). Only the second used to be
   * carried, so pressing `M` from a dev-door session and travelling sent the player to a
   * page with no game data at all.
   */
  function travelUrl(location) {
    const folder = source?.arenaPath ?? params.get('arena') ?? null;
    const arena = (folder ? `&arena=${encodeURIComponent(folder)}` : '')
      + `&grid=${WORLD_GRID_VERSION}`
      + (location.provinceID != null ? `&province=${location.provinceID}` : '')
      + (location.id != null ? `&placeId=${location.id}` : '');
    if (location.kind === 'palace') return `?interior=IMPPAL.MIF${arena}`;
    // **A spot of open country, by its cell** — the dev teleport's own door (`devTravelToPixel`),
    // and the same URL the gate crossing and a dungeon's way out build, so it lands in the
    // persistent country by the door a walk uses rather than by one of its own.
    // **A country job is reached on foot, not teleported to.** The owner, 2026-10-19: *"you
    // should not be able to teleport to the sidequest questmarkers in the wild because it
    // crashes the game and instead the questmarker should be closer to a dungeon village or
    // town so you can teleport there instead and then reach the location walking"*. So the job's
    // marker travels to its **anchor** — a place with a real `CITYDATA` record — and the last
    // cells are walked. A bare world cell (the dev door's `?wild=`) still uses the cell door.
    if (location.kind === 'wild' && location.wildJob && location.name) {
      // Built separately from `arena`: the marker's own `id` is `job:<quest>`, which is not a
      // `placeId`, and the arrival's province/place come from the anchor record instead.
      const road = (folder ? `&arena=${encodeURIComponent(folder)}` : '')
        + `&grid=${WORLD_GRID_VERSION}`
        + (location.anchorProvinceID != null ? `&province=${location.anchorProvinceID}` : '')
        + (location.anchorId != null ? `&placeId=${encodeURIComponent(location.anchorId)}` : '');
      return `?location=${encodeURIComponent(location.name)}${road}`;
    }
    if (location.kind === 'wild') {
      const where = location.name ? `&location=${encodeURIComponent(location.name)}` : '';
      return `?wild=${Math.round(location.cell.row)},${Math.round(location.cell.col)}${where}${arena}`;
    }
    if (location.kind === 'dungeon') {
      // A dungeon the player's own folder has no map for is entered **by seed**: the page
      // then assembles its level out of the install's pieces (`game/dungeonPlan.js`). Until
      // this, the link carried the location's name — and the 128 unnamed dungeon records
      // have none, so every one of them landed on `START.MIF`, which is the reported
      // "almost every dungeon is the same".
      const mif = location.mif ?? (typeof location.dungeonSeed === 'number' ? stageMif({ dungeonSeed: location.dungeonSeed }) : null);
      const has = Boolean(mif && loose.has(String(mif).toUpperCase()));
      if (location.name && has) return `?dungeon=${encodeURIComponent(location.name)}${arena}`;
      return `?dungeonSeed=${encodeURIComponent(String(location.dungeonSeed))}${arena}`;
    }
    return `?location=${encodeURIComponent(location.name)}${arena}`;
  }

  /** How far, in days, from wherever the player is to here. */
  function travelDays(location) {
    const from = lastLocationGlobal();
    const to = location.tamriel ?? location.global ?? PALACE_POINT;
    return world.travel(from, to);
  }

  function lastLocationGlobal() {
    const saved = lastLocation();
    // **Out in the country the journey starts at the cell itself** — the world pixel the player's
    // own foot is on (`game/tamrielGrid.js`'s `pixelOfCell`). Measuring from the settlement they
    // walked out of is measuring from up to a hundred and twenty-eight cells away, and the same
    // reading answers the board's own giver (`boardGiver`), so a wild-standing player reads the
    // board of the town nearest *them*.
    if (saved.country && saved.wild) return pixelOfCell(saved.wild.row, saved.wild.col);
    const named = whereThePlayerIs();
    if (named) return named.tamriel ?? named.global;
    // A dungeon with no name is found by its seed — the same number the page was entered
    // by, and the one that decides its layout.
    const bySeed = saved.seed == null
      ? null
      : world.locations.find((l) => String(l.dungeonSeed) === String(saved.seed));
    return bySeed ? bySeed.tamriel : PALACE_POINT;
  }

  function updateCard() {
    if (!selected) {
      card.innerHTML = '';
      card.classList.remove('on');
      return;
    }      const { days } = travelDays(selected);
    const kindName = selected.wildJob ? 'the open country'
      : { city: 'city-state', town: 'town', village: 'village', dungeon: 'dungeon', palace: 'the Imperial Palace' }[selected.kind] ?? selected.kind;
    // **Both of a place's climates, or the card lies.** The owner's report: *"MORROWIND NOW JUST
    // SAYS DESERT BUT WHEN YOU GET INTO IT ITS COMPLETELY MOUNTAIN"* — the card named the country
    // and the city the player then walked into was built of its architecture. A place whose two
    // readings differ (Morrowind is desert country built out of the mountain's style, Elsweyr and
    // the Summerset Isles are temperate country built out of the desert's) says so on the card, in
    // that order: what the country is, then what the place is made of (`game/provinceStyle.js`).
    const look = selected.architecture && selected.architecture !== selected.climate
      ? `${selected.climate} country, ${selected.architecture} buildings`
      : selected.climate;
    const seed = selected.kind === 'dungeon' ? selected.dungeonSeed : selected.citySeed;
    const nearest = selected.kind === 'dungeon' ? nearestSettlement(world, selected.tamriel ?? selected.global) : null;
    const generated = selected.kind === 'dungeon' && !(loose.has(String(selected.mif ?? '').toUpperCase()));
    card.innerHTML = `
      <h2>${dungeonLabel(selected)}</h2>
      <p class="sub">${kindName} · ${selected.province} · ${look}${selected.coastal ? ' · coastal' : ''}</p>
      <p class="sub">${days} day${days === 1 ? '' : 's'} of travel${nearest ? ` · nearest town ${nearest.name} (${nearest.distance} px)` : ''}</p>
      <p class="sub">${selected.wildJob
        ? `a spot of country ${selected.walk ? `about <b>${selected.walk} paces</b> ` : ''}out of ${escapeHtml(selected.name)} — no fast travel to a spot of country: choose ${escapeHtml(selected.name)} itself and walk out of its gate`
        : selected.kind === 'dungeon'
          ? `dungeon seed <code>${seed}</code> → ${generated
            ? 'assembled from this install\'s own dungeon blocks (<code>RANDOM1.MIF</code>)'
            : `<code>${selected.mif ?? stageMif(selected)}</code>`}`
          : `city seed <code>${seed}</code>`}</p>`
      // **The job's own mark has no travel button.** Its anchor (a town, village or city) is a
      // real place with its own marker and its own Travel; this marker is the last leg, and a
      // journey straight to a bare world cell is the crash the owner reported. The button stays
      // in place, disabled and named for what it is, so the card still says why there is no
      // journey rather than looking broken.
      + (selected.wildJob
        ? `<button id="map-travel" disabled title="This is a spot in the open country — travel to ${escapeHtml(selected.name)} and walk the last leg.">Travel — on foot from ${escapeHtml(selected.name)}</button>`
        : '<button id="map-travel">Travel</button>')
      + '<button id="map-close" class="ghost">Cancel</button>';
    card.classList.add('on');
    const go = card.querySelector('#map-travel');
    if (go && !selected.wildJob) go.onclick = () => travel(selected);
    card.querySelector('#map-close').onclick = () => select(null);
  }

  function select(location) {
    selected = location;
    updateCard();
    // Selecting a card is not travelling: keep the departure position intact.
  }

  function saveLast(entry) { saveLastLocation(entry); }

  /**
   * **The horse on the road** — `HORSE.DFA`, used as fast travel's loading screen.
   *
   * The owner, 2026-10-19: *"fast traveling needs to briefly show the HORSE.DFA"*, then later
   * *"needs to show while the fast travel is loading as a loading screen not it first shows then
   * it loads otherwise it just takes more time"*. The card therefore goes up **before** the
   * destination is built and stays over the scene until it is standing: the animation and the
   * level load share one wait, rather than adding a fixed second before the load starts.
   *
   * **The palette is the world map's, not the character sheet's.** `FastTravelUiView::
   * getPaletteTextureAsset` in OpenTESArena returns `ArenaTextureName::WorldMap`, i.e.
   * `TAMRIEL.MNU` — so the horse, rider, sky and grass are indices into that screen's own
   * embedded palette, read as they are. An earlier pass read them through `CHARSHT.COL` and
   * added 128 to compensate, which is a rotation of a table the art was never drawn against;
   * the result was the owner's *"HORSE.DFA has inverted colors now"*. `TAMRIEL.MNU`'s entry
   * 236 is the sky's teal, 210 the grass, 65 the horse's brown — the picture reads at once.
   *
   * If the art cannot be read the card is still a loading screen: a journey happens, the player
   * sees where they are going, and the failure is only the missing picture.
   *
   * @param {string} [destination] the place the player is travelling to
   * @returns {{finish: () => Promise<void>}}
   */
  function showTravelHorse(destination = '') {
    const host = document.createElement('div');
    host.id = 'travel-horse';
    Object.assign(host.style, {
      position: 'fixed', inset: '0', zIndex: '12000', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px',
      background: 'radial-gradient(ellipse at center, rgba(28,24,18,0.78) 0%, rgba(4,6,10,0.96) 72%)',
      color: '#e7d8b4', font: '600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
      letterSpacing: '0.14em', textTransform: 'uppercase', opacity: '1',
      transition: 'opacity 180ms ease-out', pointerEvents: 'none',
    });
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = 132 * scale;
    canvas.height = 82 * scale;
    Object.assign(canvas.style, { imageRendering: 'pixelated', filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.65))' });
    const caption = document.createElement('div');
    caption.textContent = destination ? `on the road to ${destination}` : 'on the road';
    const hint = document.createElement('div');
    hint.textContent = 'loading…';
    Object.assign(hint.style, { opacity: '0.62', fontSize: '11px' });
    host.appendChild(canvas);
    host.appendChild(caption);
    host.appendChild(hint);
    document.body.appendChild(host);

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const started = performance.now();
    /** @type {HTMLCanvasElement[]} */
    let bitmaps = [];
    let finishing = false;
    // The scene build normally takes longer than this; the floor only stops a very fast load
    // from flashing the horse for one frame. It never runs after the build has finished.
    const MIN_VISIBLE_MS = 450;
    const FADE_MS = 180;
    const tick = () => {
      if (!host.isConnected) return;
      if (bitmaps.length) {
        const frame = bitmaps[Math.floor((performance.now() - started) / 75) % bitmaps.length];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Decode while the card is already standing, so the loading screen is visible during the
    // work rather than after it. `data.must` and the palette are normally in memory by now.
    void (async () => {
      try {
        const [bytes, mnuBytes] = await Promise.all([
          data.must('HORSE.DFA'),
          data.bytes('TAMRIEL.MNU').catch(() => null),
        ]);
        const dfa = parseDfa(bytes, 'HORSE.DFA');
        // The screen's own palette; a copy without `TAMRIEL.MNU` keeps the card with the
        // character sheet's colours rather than failing the loading screen outright.
        const palette = (mnuBytes && parseImg(mnuBytes, 'TAMRIEL.MNU')?.palette)
          || await data.palette('CHARSHT.COL');
        canvas.width = dfa.width * scale;
        canvas.height = dfa.height * scale;
        ctx.imageSmoothingEnabled = false;
        bitmaps = dfa.frames.map((frame) => {
          const temp = document.createElement('canvas');
          temp.width = frame.width; temp.height = frame.height;
          temp.getContext('2d').putImageData(toSpriteImageData(frame.indices, palette, frame.width, frame.height), 0, 0);
          return temp;
        });
      } catch (err) {
        console.warn(`[travel] HORSE.DFA was not readable: ${err?.message ?? err}`);
        hint.textContent = 'loading…';
      }
    })();

    return {
      /** Hold the card until the arriving scene is built, then fade it away. */
      async finish() {
        if (finishing) return;
        finishing = true;
        const left = Math.max(0, MIN_VISIBLE_MS - (performance.now() - started));
        if (left) await new Promise((resolve) => setTimeout(resolve, left));
        host.style.opacity = '0';
        await new Promise((resolve) => setTimeout(resolve, FADE_MS));
        host.remove();
      },
    };
  }

  /**
   * Travel to a location.
   *
   * Two doors, one journey. Under `overlay` (the map drawn over a running game, `M` in a
   * level) the caller's `onTravel` gets the location and rebuilds the scene in place; on the
   * map's **own page** the scene is replaced here — `handOff` — so the same page keeps the
   * player's Arena folder. The days pass and the last-location record is written either way,
   * because that is the journey rather than the arriving.
   *
   * @param {object} marker  a location from the map's own world data (never `window.location`:
   *   the old spelling of this parameter is what made fast travel a no-op, see below)
   * @returns {{to: string, url: string, days: number}|false|{to: unknown, url: string, days: number}}
   */
  async function travel(marker) {
    if (!marker || leaving) return false;
    // **A job's own mark in the country is not a destination.** The owner, 2026-10-21: *"radiant
    // quests that take place in the wilderness spawn in the tamriel map a quest marker that if you
    // travel to it it crashes so the travel button for that questmarker should be disabled"*. The
    // marker is a world cell with no `CITYDATA` record, and a journey there is the crash: the
    // arrival page needs a place to be. So it is refused here as well as in the card, and the
    // player is told what to do instead — travel to the anchor (the town the job stands outside
    // of, a real marker of its own) and walk the last leg.
    if (marker.wildJob) {
      message = `The camp is reached on foot — travel to ${marker.name} and walk the last ${marker.walk ? `${marker.walk} paces` : 'leg'} out of its gate.`;
      messageUntil = performance.now() + 3200;
      return { refused: 'wild-job', to: marker.label ?? marker.name };
    }
    // A wild job's marker is a *place in the country*, not an arrival: the journey ends at the
    // settlement that anchors it (`wildJobMarker`'s `name`), which is a real `location=` page.
    const atAnchor = marker.wildJob
      ? ((marker.anchorProvinceID != null && marker.anchorId != null
        ? world.byId(marker.anchorProvinceID, marker.anchorId)
        : world.byName(marker.name)) ?? marker)
      : marker;
    const url = travelUrl(marker);
    const journey = travelDays(atAnchor);
    const days = journey.days;
    // A country arrival writes the record a walk writes (`interior.js`'s `maybeSaveWildFoot`): the
    // cell the player's own foot is on and the country flag beside it, so the map's "you are here"
    // and the journey lengths are measured from the spot rather than from the nearest town.
    saveLast(marker.kind === 'wild' && !marker.wildJob
      ? { name: marker.name, provinceID: marker.provinceID, locationID: marker.id, dungeon: false, seed: null, wild: { row: marker.cell.row, col: marker.cell.col }, country: true }
      : { name: atAnchor.name, provinceID: atAnchor.provinceID ?? marker.provinceID, locationID: atAnchor.id ?? marker.id, dungeon: atAnchor.kind === 'dungeon', seed: atAnchor.dungeonSeed ?? null });
    const destination = marker.wildJob ? marker.name : (marker.label ?? marker.name);
    status(`travelling to ${destination}`);
    // The road costs days, and a day is what a deadline is measured in — so the
    // calendar moves with the player and a job can genuinely run out while they are
    // somewhere else. This is the whole of the "time passes" rule.
    const memory = loadWorldState();
    // Distance also determines a non-zero arrival-hour shift; the same journey always
    // takes the same number of hours. Compute before saving the destination above.
    const arrival = advanceWorldTime(memory, days * 1440 + (1 + journey.pixels % 8) * 60,
      { day: Math.max(1, radiant.day ?? 1), minutes: 600 });
    saveWorldState(memory);
    radiant = advanceDays(radiant, Math.max(0, arrival.day - (radiant.day ?? 0)));
    saveRadiantState(radiant);
    message = `Travelling to ${destination} — ${days} day${days === 1 ? '' : 's'}; arrival ${String(Math.floor(arrival.minutes / 60)).padStart(2, '0')}:${String(arrival.minutes % 60).padStart(2, '0')}.`;
    messageUntil = performance.now() + 1200;
    // The journey's own picture, **over** the build rather than before it. The card goes up
    // first; each door is awaited with it still standing, and `finish` brings it down only when
    // the destination exists (or the build failed).
    const card = showTravelHorse(destination);
    try {
      if (overlay && typeof opts.onTravel === 'function') {
        // Let the message be *seen* behind the card as the map comes down.
        draw();
        await Promise.resolve(opts.onTravel(marker));
        return { to: destination, url, days };
      }
    // **The map's own page hands the journey off in place, exactly as the overlay does.**
    //
    // This used to be `location.href = url`, and that line was written against the wrong
    // `location`: this function's own parameter is called `location` and it *shadows*
    // `window.location`, so the assignment set a `href` property on a plain marker object
    // and the page never went anywhere. Fast travel from the world map therefore did
    // **nothing at all** — the reported "you cant even travel anywhere" — and no browser
    // check caught it because it read the URL the map *would* have used (`travelUrl`)
    // rather than travelling.
    //
    // Navigating would have been the second bug in any case: a picked Arena folder is a
    // live `FileList` in this page's memory (`arena/browserSource.js`), and a page load
    // cannot reopen it, so every journey asked the player for their game folder again. The
    // scene is rebuilt here instead, with the *same* source, so the folder is picked once.
      const scene = await handOff(url, marker, days);
      return { to: destination, url, days, scene };
    } finally {
      // The card is the load, not a delay before it: it stays up until the arriving scene
      // has been built (or the build failed and the map came back).
      await card.finish();
    }
  }

  /**
   * Leave the map and stand the player in the place they chose, **in this page**.
   *
   * The destination is the query string a page load would have used — `?location=`,
   * `?dungeon=`, `?dungeonSeed=` or the palace's `?interior=IMPPAL.MIF` — handed to
   * `bootInterior` instead of to the browser. The map's own layer (its frame loop and every
   * listener it registered) comes down first, because a `rAF` loop that keeps painting over
   * the scene which replaces it is two games running at once.
   *
   * @param {string} url   the travel URL, with or without its leading `?`
   * @param {object} marker the location travelled to, for the debug seam
   * @param {number} days  how long the road took, already taken off the calendar
   * @returns {Promise<object|null>} the scene that is now standing
   */
  async function handOff(url, marker, days) {
    // One transition at a time: this scene is replaced once, and a second click while the
    // first handoff is still building would boot two scenes against one page.
    if (leaving) return null;
    leaving = true;
    dbg.handoffs++;
    const next = new URLSearchParams(String(url).replace(/^\?/, ''));
    // The dev door's folder travels in the URL; a *picked* one cannot be named there at
    // all, which is why it is handed to the next scene as the source instead.
    const folder = source?.arenaPath ?? params.get('arena') ?? null;
    if (folder) next.set('arena', folder);
    closeLayer();
    try {
      history.replaceState(history.state ?? null, '', `${window.location.pathname}?${next.toString()}${window.location.hash ?? ''}`);
    } catch { /* a page that cannot rewrite its URL still travels */ }
    try {
      const { bootInterior } = await import('./interior.js');
      const scene = await bootInterior(canvas, renderer, next, status, source);
      document.getElementById('boot')?.classList.add('hidden');
      window.__ready = true;
      dbg.travel = { to: marker.name, kind: marker.kind, days, query: next.toString() };
      return scene;
    } catch (err) {
      // A failed handoff must not strand the player on a blank page, and it must not ask
      // for their folder again: the map is rebuilt here, from the source it already has,
      // and the error is said out loud on its status line.
      leaving = false;
      dbg.failed = String(err?.message ?? err);
      console.error(err);
      const { bootWorldMap } = await import('./worldmap.js');
      const scene = await bootWorldMap(canvas, renderer, params, status, source);
      scene.message?.(`Could not travel to ${marker.name}: ${err?.message ?? err}`);
      return scene;
    }
  }

  /**
   * Take the map's own layer down without ending the page: its listeners, its frame loop
   * and its DOM. `close()` is the overlay's version of this; this one leaves `#map` empty
   * for the scene that is about to be built over it.
   */
  function closeLayer() {
    if (!alive) return false;
    alive = false;
    ac.abort();
    host.classList.remove('on');
    host.innerHTML = '';
    return true;
  }

  /**
   * The player's own sheet, on the world screen.
   *
   * Everything on it is Arena's or the player's: the class ability is the line from
   * the class table, health and spell points are what creation rolled and derived,
   * and the purse is what the jobs have paid. When there is no character it says so
   * rather than showing a blank panel, because "no one yet" is a state the shipping
   * path can genuinely be in.
   */
  function renderSheet() {
    if (!character) {
      sheet.innerHTML = '<b>No one yet</b><br><span class="sub">No character has been made on this machine.</span>';
      sheet.classList.add('on');
      return;
    }
    const klass = classById(character.classId);
    const spells = character.spellPoints == null
      ? ''
      : `<br><span class="sp">${character.spellPoints}/${character.maxSpellPoints} spell points</span>`;
    // The finale's two key items get their own line once they exist, because "8 of 8
    // pieces" and "have you been to the palace yet" are different questions and the
    // second one is the only one that matters after the last piece.
    const finale = quest.ended
      ? '<br><span class="gold">Eternal Champion</span>'
      : [quest.mithrilKey ? 'the mithril key' : null, quest.hasKeyItem ? 'the Jewel of Fire' : null]
        .filter(Boolean)
        .map((item) => `<span class="gold">${item}</span>`)
        .join(' · ');
    // A character reached without creation (`?dungeon=` in the dev door, or a run that
    // never made one) can be missing the descriptive fields, and `escapeHtml(undefined)`
    // printed the literal word "undefined" on the sheet. Every field is optional here.
    const describe = [character.gender, character.race, character.className]
      .filter((part) => typeof part === 'string' && part).join(' ');
    sheet.innerHTML = `<b>${escapeHtml(character.name ?? 'Adventurer')}</b><br>`
      + `<span class="sub">${escapeHtml(describe || 'Adventurer')} · level ${character.level ?? 1}</span><br>`
      + `<span class="hp">${character.health}/${character.maxHealth} health</span>${spells}<br>`
      + `<span class="gold">${character.gold} gold</span> · <span class="sub">Staff pieces ${quest.pieces}/8</span>`
      + (finale ? `<br>${finale}` : '')
      + (klass ? `<br><span class="sub">${escapeHtml(klass.ability)}</span>` : '')
      + sheetNewGame();
    sheet.classList.add('on');
  }

  /**
   * The new-game footer of the sheet.
   *
   * The sheet is the player's own page — who they are, what they carry — so it is where
   * "start again" belongs, and it is the second door to the one flow (`scenes/newGame.js`)
   * that `Escape` opens inside a level. Two clicks, because this is the only button in the
   * game that throws a saved character away.
   *
   * Offered on the map's **own page only**. As an overlay (`M`, inside a level) this scene
   * is a layer over a running game, and `newGame` disposes the scene that is standing — so a
   * click here would take the world out from under a player still standing in it. The game
   * behind the overlay has its own door to the same flow.
   */
  function sheetNewGame() {
    if (overlay) return '';
    if (!sheetConfirm) return '<br><button id="map-newgame" class="ghost">Begin a new game…</button>';
    return '<br><span class="warn">Start over? The character, the quest, the purse and everyone '
      + 'who has met you are all forgotten. This cannot be undone.</span><br>'
      + '<button id="map-newgame-yes" class="ghost danger">Yes, begin a new game</button>'
      + '<button id="map-newgame-no" class="ghost">No, keep playing</button>';
  }

  /**
   * The sheet's buttons: the warning, and then the flow.
   *
   * Delegated, and registered with this scene's `AbortSignal` like every other listener
   * here, so a scene that is replaced takes its handlers with it.
   */
  sheet.addEventListener('click', (e) => {
    const id = e.target?.id;
    if (id === 'map-newgame') { sheetConfirm = true; renderSheet(); }
    else if (id === 'map-newgame-no') { sheetConfirm = false; renderSheet(); }
    else if (id === 'map-newgame-yes' && !leaving) {
      leaving = true;
      void beginNewGame({ canvas, renderer, status, source, params });
    }
  }, { signal });

  /**
   * Put gold in the player's purse, and save it.
   *
   * A reward is the character's, not the page's: the map reloads on every journey,
   * so a purse that lived only in this scene would be gone by the next town.
   *
   * @param {number} amount
   * @param {string} reason  what earned it, for the status line
   */
  function creditGold(amount, reason) {
    if (!character || !amount) return;
    character = { ...character, gold: Math.max(0, (character.gold ?? 0) + amount) };
    saveCharacter(character);
    renderSheet();
    message = `${reason} — ${character.gold} gold in all.`;
    messageUntil = performance.now() + 2500;
  }

  /**
   * Apply a radiant event and settle up: one door for the board's buttons and the
   * scripted run alike, so a reward can only ever be paid once, here.
   *
   * @param {string} event @param {object} [ctx]
   */
  function radiantStep(event, ctx = {}) {
    const result = applyRadiantEvent(radiant, event, ctx);
    if (result.ok) {
      radiant = result.state;
      saveRadiantState(radiant);
      if (result.gold) creditGold(result.gold, `${ctx.offer?.title ?? 'The job'} paid`);
      updateBoard();
      updateBar();
    }
    return result;
  }

  function updateBar() {
    const side = radiantObjective(radiant);
    const objective = currentObjective(quest, chain);
    // **The bar says where the player is, and it says it honestly** (B26): the settlement's own name
    // when they are in one, `the country near …` when they are standing in the wild — the same
    // reading the map's own mark is drawn from (`standMark`), so the words and the dot never
    // disagree. It used to show the view instead (`Tamriel — click a province`), which is what the
    // map is *of*, not where the player is.
    const you = standMark();
    bar.innerHTML = `<span class="obj">${objective}</span>`
      + (side ? `<span class="side">${side}</span>` : '')
      + `<span class="pieces">Staff pieces ${quest.pieces}/8</span>`
      + `<span class="you">you are here — ${you ? escapeHtml(you.label) : 'nowhere yet'}</span>`
      + `<span class="where">${shownProvince ? `${shownProvince.name} — Esc back to Tamriel` : 'Tamriel — click a province'}</span>`
      + `<span class="hint">${overlay ? 'M or Esc to close · ' : ''}B the board · drag to pan · wheel to zoom</span>`;
  }

  /**
   * Put the map away (overlay mode). The listeners go with it; the game behind it is
   * untouched, which is the whole point of not being a page.
   */
  function close() {
    if (!alive) return false;
    alive = false;
    ac.abort();
    host.classList.remove('on');
    host.innerHTML = '';
    status('back in the world');
    // The overlay's own debug hooks are not the page's: leave them behind with the map,
    // or a test (or the player's console) would keep talking to a scene that is gone.
    if (overlay && window.__debug?.worldMap) delete window.__debug.worldMap;
    if (typeof opts.onClose === 'function') opts.onClose();
    return true;
  }

  // ── the dev teleport, live ─────────────────────────────────────────────────
  // See the button's own block above for what a click means. `devArmed` is the mode the button
  // toggles, and the hint beside it says which half of the screen is next.
  let devArmed = false;

  /** Arm or disarm the teleport, and say so in the legend and on the status line. */
  function setDevArmed(on) {
    devArmed = Boolean(on);
    draw();
    return devArmed;
  }

  /**
   * The **world pixel** a click on the map is standing on.
   *
   * @param {{x: number, y: number}} cssPoint  a point in CSS pixels inside the canvas
   * @returns {{x: number, y: number}} a world pixel (0…319 × 0…199)
   */
  function devGlobalOf(cssPoint) {
    const pixel = toWorld(cssPoint);
    return shownProvince ? world.mapPoint(shownProvince.id, pixel)
      : { x: Math.round(pixel.x), y: Math.round(pixel.y) };
  }

  /**
   * Stand the player in the open country at a world pixel.
   *
   * A **settlement's own pixel** is the one case that is not country: the click is inside a town,
   * and the town is a place with a name, a seed and a page — so it travels to the settlement
   * itself (`travel`, the same door a marker click uses) rather than dropping the player beside it.
   *
   * @param {{x: number, y: number}} global  a world pixel
   * @returns {Promise<object|null>|{to: string, url: string, days: number}|false}
   */
  function devTravelToPixel(global) {
    const point = {
      x: Math.max(0, Math.min(world.width - 1, Math.round(global.x))),
      y: Math.max(0, Math.min(world.height - 1, Math.round(global.y))),
    };
    const here = world.locations.find((l) => l.tamriel.x === point.x && l.tamriel.y === point.y && l.kind !== 'dungeon');
    if (here) { setDevArmed(false); return travel(here); }
    const nearest = nearestSettlement(world, point);
    const province = world.provinceAtWorld(point);
    const marker = {
      name: nearest?.name ?? province?.name ?? 'the open country',
      kind: 'wild',
      global: point,
      cell: cellOriginOfPixel(point),
      province: province?.name ?? null,
      climate: world.worldClimateAt(point),
      provinceID: nearest?.provinceID, id: nearest?.id,
    };
    setDevArmed(false);
    return travel(marker);
  }

  // ── input ──────────────────────────────────────────────────────────────────
  let dragging = null;
  view.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY, offsetX: viewport.offsetX, offsetY: viewport.offsetY, moved: false };
    view.setPointerCapture(e.pointerId);
  }, { signal });
  view.addEventListener('pointermove', (e) => {
    const rect = view.getBoundingClientRect();
    pointerAt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    updateReadout();
    if (dragging) {
      const dx = e.clientX - dragging.x;
      const dy = e.clientY - dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
      viewport.offsetX = dragging.offsetX + dx;
      viewport.offsetY = dragging.offsetY + dy;
      clamp();
      draw();
      return;
    }
    const hit = locationAt(pointerAt);
    hovered = hit ? hit.location : null;
    const province = (!hovered && !shownProvince) ? provinceUnderPoint(pointerAt) : null;
    if (hovered || province) {
      hoverLabel.textContent = hovered ? describe(hovered) : `${province.name} — click to open its map`;
      hoverLabel.style.left = `${e.clientX - rect.left + 14}px`;
      hoverLabel.style.top = `${e.clientY - rect.top + 10}px`;
      hoverLabel.classList.add('on');
    } else {
      hoverLabel.classList.remove('on');
    }
    view.style.cursor = (hovered || province) ? 'pointer' : (dragging ? 'grabbing' : 'grab');
  }, { signal });
  view.addEventListener('pointerup', (e) => {
    const wasDragging = dragging;
    dragging = null;
    if (!wasDragging || wasDragging.moved) return;
    const rect = view.getBoundingClientRect();
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = locationAt(at);
    // ── the armed teleport takes the click ────────────────────────────────────
    // A marker is still a marker (the card is where a place is explained, and its own Travel
    // button is the door), so the mode takes the bare map — and a click on a marker while armed
    // travels straight to it rather than asking again, because the button was the asking.
    if (devArmed) {
      if (hit) devTravelToPixel(hit.location.tamriel ?? hit.location.global);
      else devTravelToPixel(devGlobalOf(at));
      return;
    }
    if (shownProvince) {
      select(hit ? hit.location : null);
      draw();
      return;
    }
    // On Tamriel a click is a click *on a province*: that is the door to its own map, and it is
    // what Arena's own screen does with a province. The one mark on this picture that is not a
    // province is the palace, and it keeps its own card.
    if (hit && hit.location.kind === 'palace') { select(hit.location); draw(); return; }
    const province = provinceUnderPoint(at);
    if (province) openProvince(province);
  }, { signal });
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = view.getBoundingClientRect();
    const before = toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    viewport.scale = Math.max(1, Math.min(6, viewport.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const s = viewport.fit * viewport.scale;
    viewport.offsetX = (e.clientX - rect.left) - before.x * s;
    viewport.offsetY = (e.clientY - rect.top) - before.y * s;
    clamp();
    draw();
  }, { passive: false, signal });
  addEventListener('resize', () => { resize(); draw(); }, { signal });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    // In an overlay, `M` and Escape put the map away and the game is still standing
    // behind it — the page does not change, so the picked folder is still open and the
    // player is exactly where they were. On the map's own page, Escape only drops the
    // selection (there is nowhere to go back to).
    if (overlay && (e.code === 'KeyM' || (e.code === 'Escape' && !shownProvince))) { close(); return; }
    // Escape walks back out of a province, which is the way the two-level screen is left: the
    // continent is always one key or one click away.
    if (e.code === 'Escape' && shownProvince) { backToTamriel(); return; }
    if (e.code === 'Escape') select(null);
    if (e.code === 'KeyB') { board.classList.toggle('on'); updateBoard(); }
    if (e.code === 'Enter' && selected) travel(selected);
    if (e.code === 'KeyP') {
      // The map's own door back into the world: explore where you stand.
      const saved = (() => {
        try { return JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? 'null'); } catch { return null; }
      })();
      if (saved?.name) location.href = saved.dungeon ? `?dungeon=${encodeURIComponent(saved.name)}` : `?location=${encodeURIComponent(saved.name)}`;
    }
  }, { signal });

  resize();
  updateSearch(); updateReadout();
  renderSheet();
  updateBar();
  refreshBoard();
  updateBoard();
  centerOn({ x: art.width / 2, y: art.height / 2 });
  // A slow pulse makes the quest dungeons the eye-catchers, and it doubles as the
  // scene's own "frames are running" signal for the tests.
  let frames = 0;
  // The map's own frames stop with `close()`: an overlay that kept its rAF running
  // would keep painting a canvas nobody is looking at for the rest of the session.
  let nextReadout = 0;
  const animate = () => { if (!alive) return; frames++;
    if (performance.now() >= nextReadout) { nextReadout = performance.now() + 1000; updateReadout(); }
    draw(); requestAnimationFrame(animate); };
  requestAnimationFrame(animate);
  status(overlay ? 'Tamriel — the world map' : 'Tamriel ready');

  // ── the debug seam ─────────────────────────────────────────────────────────
  //
  // As an overlay the map is not the page's scene — the game behind it is — so its hooks
  // live under `__debug.worldMap` and the interior's own `scene`/`state` stay intact. On
  // its own page it is the scene, exactly as it always was.
  const hooks = {
    state: () => ({
      scene: 'worldmap',
      inspection: { terrain: terrainVisible, borders: bordersVisible, matches: world.locations.filter(matchesFilter).length },
      clock: opts.clock?.() ?? worldClock(loadWorldState()),
      provinces: world.provinces.length,
      locations: world.locations.length,
      settlements: world.settlements().length,
      drawn: { width: art.width, height: art.height },
      viewport: { scale: viewport.scale, fit: viewport.fit, width: viewport.width, height: viewport.height },
      // The word the hover label is showing, which for the 128 unnamed dungeons is the only thing
      // that describes them — `hovered?.name` alone reports `null` for a marker the pointer is
      // genuinely sitting on.
      hovered: hovered ? (hovered.name || dungeonLabel(hovered)) : null,
      // Which of the two levels is up, and — when a province's map is — which province.
      view: shownProvince ? 'province' : 'tamriel',
      province: shownProvince ? shownProvince.name : null,
      selected: selected ? { name: selected.name, kind: selected.kind, province: selected.province, climate: selected.climate, coastal: selected.coastal } : null,
      stage: chain.stages[quest.step]?.title ?? null,
      objective: currentObjective(quest, chain),
      side: radiantObjective(radiant),
      day: radiant.day,
      boardOpen: board.classList.contains('on'),
      frames,
      // The screen's own records, as the last frame drew them: which of the two marker records the
      // map is on, how many times it has switched, which icons went down, and whose province plate
      // is on the pointer. A test can only tell "the game's art" from "a circle" by reading this.
      // Where the *player* is, as the map reads it: the country cell when they are standing in the
      // wild and the settlement's record when they are in one (`standMark`), plus what the last
      // frame actually drew of it (`mapArt.here`). The owner's report is why it is a reading of its
      // own: the map used to answer a city for a player in the middle of nowhere.
      you: (() => {
        const mark = standMark();
        return mark && {
          country: mark.country,
          kind: mark.kind,
          label: mark.label,
          global: mark.global,
          local: mark.local,
          provinceID: mark.provinceID,
        };
      })(),
      mapArt: {
        screen: mapArtState.screen,
        record: mapArtState.record,
        blinking: mapArtState.blinking,
        switches: mapArtState.switches,
        icons: { ...mapArtState.icons },
        here: mapArtState.here && { ...mapArtState.here },
        plaques: [...mapArtState.plaquesDrawn],
        warnings: [...mapArtState.warnings],
      },
      // What fast travel did on this page: the journey it handed off, or the reason it
      // could not. A check that only reads `travelUrl` cannot tell travel from a no-op.
      travelled: dbg.travel,
      handoffs: dbg.handoffs,
      handoffFailed: dbg.failed,
      errors: 0,
    }),
    quest: () => questLog(quest, chain),
    /** The character the world is played by, or null if creation has not run. */
    character: () => (character ? JSON.parse(JSON.stringify(character)) : null),
    /** The sheet exactly as it is on screen, for a test that reads the panel. */
    sheetText: () => sheet.textContent,
    /** Put gold in the purse, as a reward does. */
    grantGold: (amount) => { creditGold(amount, 'Granted'); return character ? character.gold : null; },
    // ── the side work ────────────────────────────────────────────────────────
    /** The board, the journal and the day, as the player would see them. */
    radiant: () => ({
      ...radiantLog(radiant),
      giver: boardGiver().name,
      enterableDungeons: dungeons.length,
      // **How many there are, and how they are opened.** A test that only knows the count
      // cannot tell "the filter works" from "the filter was removed": every one of Arena's
      // 144 dungeon records is offerable when the install ships the dungeon *pieces*
      // (`RANDOM1.MIF`, which `game/dungeonPlan.js` assembles a level from), and only the
      // sixteen with a `.MIF` of their own are offerable when it does not.
      dungeonRecords: world.locations.filter((l) => l.kind === 'dungeon').length,
      dungeonPieces: loose.has(DUNGEON_BLOCKS_MIF),
      dungeons: dungeons.map((d) => ({ name: d.name, province: d.province, mif: stageMif(d) })),
      library: {
        greetings: library.cityGreetings.size,
        dungeonIntros: library.dungeonIntros.size,
        artifactOffers: library.artifactOffers.length,
        artifactReplies: library.artifactReplies.length,
        talkTemplates: library.talkTemplates.size,
      },
    }),
    /** Take an offer off the board by its id, exactly as its button does. */
    acceptOffer: (id) => { const offer = acceptOffer(id); updateBar(); return offer ? { id: offer.id, title: offer.title, target: offer.target } : null; },
    /** Offer a job with a **person** behind it, as a conversation in a town does. */
    acceptFromPerson: (offer) => {
      const result = radiantStep('accept', { offer });
      if (result.ok) { updateBar(); updateBoard(); }
      return { ok: result.ok, reason: result.reason ?? null, active: radiant.active ? { title: radiant.active.title, giverId: radiant.active.giverId ?? null, giverPerson: radiant.active.giverPerson ?? null, completed: Boolean(radiant.active.completed) } : null };
    },
    /** Fire a radiant event, for the scripted run. */
    radiantEvent: (event, ctx = {}) => {
      const result = radiantStep(event, ctx);
      if (result.ok) draw();
      return { ok: result.ok, reason: result.reason, gold: result.gold ?? null, purse: character ? character.gold : null, objective: radiantObjective(radiant), taken: radiant.taken, failed: radiant.failed };
    },
    /** Let days pass, which is how a deadline actually expires. */
    radiantDays: (days) => { radiant = advanceDays(radiant, days); saveRadiantState(radiant); updateBoard(); updateBar(); return { day: radiant.day, active: radiant.active?.title ?? null, failed: radiant.failed }; },
    /**
     * The regard ledger, re-read from the save.
     *
     * Re-read rather than held: the *streets* write it (`scenes/interior.js`), and this is a
     * page that may have been open the whole time — so a test that wants to see what happened
     * in a town has to ask for the file, which is exactly what a player's next page load does.
     */
    regard: () => {
      regard = loadRegard();
      updateBoard();
      return {
        day: radiant.day ?? 0,
        tally: regardTally(regard, radiant.day ?? 0),
        people: peopleKnown(regard, radiant.day ?? 0, { min: 0, limit: 20 })
          .map((p) => ({ id: p.id, place: p.place, regard: p.regard, standing: p.standing, word: p.word })),
      };
    },
    /**
     * Start over, exactly as the sheet's own button does.
     *
     * The scripted door to `scenes/newGame.js` for a test that must not click twice — and
     * the same latch, so a second call while creation is building does nothing.
     */
    newGame: () => {
      if (leaving) return null;
      leaving = true;
      return beginNewGame({ canvas, renderer, status, source, params });
    },
    /** Rebuild the board, as leaving and re-entering the town does. */
    radiantRefresh: () => {
      refreshBoard();
      updateBoard();
      return radiant.offers.map((o) => ({
        id: o.id, kind: o.kind, title: o.title, target: o.target,
        targetMif: o.targetMif, targetProvince: o.targetProvince,
        // **Where the work is**, as on the street's panel: `wild` carries a world cell and
        // the landmark it sits near, a dungeon carries its `.MIF`.
        targetKind: o.targetKind ?? null, targetCell: o.targetCell ?? null,
        targetNear: o.targetNear ?? null, targetAnchor: o.targetAnchor ?? null,
        days: o.days, reward: o.reward, dataText: o.dataText, source: o.source,
      }));
    },
    /** The board's DOM panel is open, for a test that clicks like a player. */
    openBoard: (on = true) => {
      board.classList.toggle('on', Boolean(on));
      if (on) updateBoard();
      return board.classList.contains('on');
    },
    questEvent: (event) => {
      const result = applyQuestEvent(quest, event, { chain });
      if (result.ok) { quest = result.state; saveQuestState(quest); updateBar(); }
      return { ok: result.ok, reason: result.reason, pieces: quest.pieces, objective: currentObjective(quest, chain) };
    },
    resetQuest: () => { quest = createQuestState(); saveQuestState(quest); updateBar(); return questLog(quest, chain); },
    /**
     * The quest chain, stage by stage, with each piece's clue dungeon.
     *
     * A browser suite that means to *play* the whole quest needs both: a piece cannot
     * be taken before the map that reveals it, so the run has to visit the clue first.
     */
    chain: () => chain.stages.map((s) => ({
      index: s.index,
      kind: s.kind,
      title: s.title,
      province: s.province,
      mif: stageMif(s),
      climate: s.climate,
      piece: s.piece ?? null,
      clue: s.clue?.title ?? null,
      clueMif: s.clue?.mif ?? null,
    })),
    /**
     * Screen position of a location's marker, for a test that clicks like a player.
     *
     * The places are drawn on their own province's map, so asking where one is **opens that
     * province** first (the same single click a player makes) and then answers where the marker
     * landed. `world` is still the location's pixel on Tamriel, which is what a check about the
     * continent ("the east of the map is where Morrowind is") wants.
     */
    markerAt: (name) => {
      const hit = world.byName(name);
      if (!hit) return null;
      const province = world.provinces.find((p) => p.id === hit.provinceID) ?? null;
      if (province && shownProvince?.id !== province.id) openProvince(province);
      const p = screenPointOf(hit);
      return { x: p.x, y: p.y, world: hit.tamriel ?? hit.global, tamriel: hit.tamriel, local: provincePointOf(hit), name: hit.name, province: hit.province };
    },
    continentMarkerAt: (name) => {
      const hit = world.byName(name);
      if (!hit) return null;
      const p = toScreen(hit.tamriel ?? hit.global);
      return { ...p, global: hit.global, tamriel: hit.tamriel, local: hit.local };
    },
    alignment: () => world.locations.map((l) => ({ name: l.name, kind: l.kind, provinceID: l.provinceID,
      local: l.local, global: l.global, tamriel: l.tamriel,
      artIndex: art.indices[l.tamriel.y * 320 + l.tamriel.x] })),
    select: (name) => { const hit = name ? world.byName(name) : null; select(hit); draw(); return hit ? hit.name : null; },
    travel: (name) => {
      const hit = name ? world.byName(name) : selected;
      return hit ? travel(hit) : null;
    },
    setZoom: (scale) => { viewport.scale = Math.max(1, Math.min(6, scale)); clamp(); draw(); return viewport.scale; },
    centreOn: (x, y) => { centerOn({ x, y }); draw(); return { x, y }; },
    // ── the map's own iconography ───────────────────────────────────────────
    /**
     * The screen's records and colours: what was read out of the install, and what the last
     * frame drew with them.
     *
     * A check that wants to hold "the map is drawn from the game's own art" has to read the
     * records out of the page (`icon.lit` is the record's own pixel count for that frame) rather
     * than trust the drawing code — the whole point of `D-35` is that the drawing code used to
     * invent its own markers.
     */
    mapScreen: () => ({
      screen: { record: MAP_SCREEN_RECORD, width: art.width, height: art.height },
      records: { ...MARKER_RECORDS },
      colors: {
        ...MARKER_COLORS,
        indices: { marker: mapScreen.icons.city?.steady?.colorIndex ?? null, blink: mapScreen.icons.city?.blinking?.colorIndex ?? null },
        palette: {
          steady: { ...mapScreen.colors.steady },
          blinking: { ...mapScreen.colors.blinking },
          plateBackground: { ...mapScreen.colors.plateBackground },
          plateText: { ...mapScreen.colors.plateText },
        },
      },
      blinkPeriodMs: BLINK_PERIOD_MS,
      kinds: MARKER_KINDS.map((kind) => ({
        kind,
        ...MARKER_ICONS[kind],
        steady: mapScreen.icons[kind]?.steady?.lit ?? 0,
        blinking: mapScreen.icons[kind]?.blinking?.lit ?? 0,
      })),
      plates: mapScreen.plates.map((plate, index) => ({
        index, name: plate.name, width: plate.width, height: plate.height,
        background: plate.background, text: plate.text,
      })),
      drawn: { ...mapArtState.icons },
      plaques: [...mapArtState.plaquesDrawn],
      record: mapArtState.record,
      blinking: mapArtState.blinking,
      switches: mapArtState.switches,
      // The nine hand-drawn province maps this install ships, and which one is open.
      provinces: mapScreen.provinces.map((p) => ({ name: p.name, record: p.record, width: p.image.width, height: p.image.height })),
      view: shownProvince ? 'province' : 'tamriel',
      provincesOpened: [...openedProvinces],
      warnings: [...mapArtState.warnings],
    }),
    /** Open a province's own map by name (`openProvince`), as a click on Tamriel does. */
    openProvince: (name) => openProvince(name),
    /** Back to Tamriel. */
    backToTamriel: () => backToTamriel(),
    /** Which level of the screen is up, and what the picture in it is. */
    level: () => ({
      view: shownProvince ? 'province' : 'tamriel',
      province: shownProvince ? { name: shownProvince.name, id: shownProvince.id } : null,
      record: currentPicture().record,
      placesDrawn: Object.values(mapArtState.icons).reduce((a, b) => a + b, 0),
      opened: [...openedProvinces],
    }),
    /** Where the map thinks the player is, as the marker it strobes. */
    playerMarker: () => {
      const hit = whereThePlayerIs();
      if (!hit) return null;
      const key = markerKey(hit);
      return { name: hit.name, kind: hit.kind, province: hit.province, key, strobed: mapArtState.blinking === false };
    },
    /**
     * What the last frame actually put on the screen for one location's marker.
     *
     * The pixels, not the intent: `lit` counts pixels of the canvas inside the icon's own
     * rectangle that carry the palette's marker gold, and `expected` is the record's own lit count
     * scaled to the view. A disc of the same bounding box would land nowhere near it in either
     * number (`share` is what tells the two apart: these icons are outlines, 20-24 % of their own
     * rectangle).
     */
    markerPixels: (name = null) => {
      const hit = name ? world.byName(name) : selected;
      if (!hit) return null;
      const kind = markerKind(hit.kind);
      const icon = kind ? MARKER_ICONS[kind] : null;
      if (!icon) return null;
      const s = Math.min(viewport.fit * viewport.scale, ICON_MAX_SCALE);
      const dpr = viewport.dpr;
      const p = screenPointOf(hit);
      const width = Math.max(1, Math.round(icon.width * s * dpr));
      const height = Math.max(1, Math.round(icon.height * s * dpr));
      const x0 = Math.round((p.x - (icon.width * s) / 2) * dpr);
      const y0 = Math.round((p.y - (icon.height * s) / 2) * dpr);
      const cw = Math.min(width, view.width - x0);
      const ch = Math.min(height, view.height - y0);
      if (x0 < 0 || y0 < 0 || cw < 2 || ch < 2) return null;
      let image = null;
      try { image = ctx.getImageData(x0, y0, cw, ch); } catch { return null; }
      const wanted = [mapScreen.colors.steady, mapScreen.colors.blinking];
      let lit = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i + 3] < 128) continue;
        if (wanted.some((c) => Math.abs(c.r - image.data[i]) <= 6 && Math.abs(c.g - image.data[i + 1]) <= 6 && Math.abs(c.b - image.data[i + 2]) <= 6)) lit++;
      }
      const area = (image.data.length / 4) || 1;
      return {
        name: hit.name, kind, province: hit.province,
        record: mapArtState.record,
        icon: { frame: icon.frame, width: icon.width, height: icon.height },
        lit, area, share: lit / area,
        expected: Math.round((mapScreen.icons[kind]?.steady?.lit ?? 0) * (s * dpr) ** 2),
      };
    },
    /**
     * Point the map at a spot as the pointer does, and say which province it landed in.
     *
     * A pointer move to *bare map*: the hover word and the label it belongs to go with it, or the
     * real cursor (which a headless page does not have, and a player does) would decide what the
     * plaque is allowed to show.
     */
    hoverAt: (x, y) => {
      pointerAt = { x, y };
      hovered = null;
      hoverLabel.classList.remove('on');
      const province = provincePlaque();
      return province ? province.name : null;
    },
    /** The plate the screen holds for a province, and whether the last frame drew it. */
    provincePlate: (name) => {
      const index = plateIndexFor(name);
      const plate = index >= 0 ? mapScreen.plates[index] : null;
      return {
        index,
        name: plate?.name ?? null,
        width: plate?.width ?? 0,
        height: plate?.height ?? 0,
        drawn: plate ? mapArtState.plaquesDrawn.includes(plate.name) : false,
      };
    },
    /** The terrain class under a world pixel, and the ASCII glyph for it. */
    terrainAt: (x, y) => ({ value: world.terrainAt({ x, y }), glyph: TERRAIN_GLYPH[world.terrainAt({ x, y })] ?? '?', climate: world.climateAt({ x, y }) }),
    closest: (x, y) => {
      let best = null;
      for (const location of world.locations) {
        const d = Math.hypot(location.tamriel.x - x, location.tamriel.y - y);
        if (!best || d < best.d) best = { d, location };
      }
      return best ? { name: best.location.name, distance: Math.round(best.d), kind: best.location.kind, climate: best.location.climate } : null;
    },
    /** Put the overlay away (a no-op on the map's own page). */
    close: () => close(),
    /** The URL a location would be travelled to on the map's own page. */
    travelUrl: (name) => {
      const hit = name ? world.byName(name) : selected;
      return hit ? travelUrl(hit) : null;
    },
    /**
     * The active country job's map mark: where it stands, how far the walk is, and the URL
     * clicking it would use. **A wild job never travels to its own cell** — this is the seam
     * that proves the journey ends at the anchor town instead (`scenes/worldmap.js`'s
     * `travelUrl` and `travel`).
     */
    wildJob: () => {
      const mark = wildJobMarker();
      if (!mark) return null;
      return {
        name: mark.name, label: mark.label, walk: mark.walk, cell: mark.cell,
        anchorId: mark.anchorId, anchorProvinceID: mark.anchorProvinceID,
        url: travelUrl(mark),
      };
    },
    /**
     * Travel to a location **for real**, exactly as a click on its marker does.
     *
     * `travelUrl` says where a journey *would* go; this is the journey. On the map's own
     * page the scene is replaced in place (the picked folder survives), so the check that
     * matters — the game really arrives somewhere — is `then()` on the returned promise.
     *
     * @param {string} name
     * @returns {Promise<object|null>|null}
     */
    /**
     * The dev teleport, as the button and the click it arms use it.
     *
     * `global` is a **world pixel** (0…319 × 0…199) — the number the map's own arithmetic
     * produces from a click (`devGlobalOf`), so a check can drive the journey without guessing
     * at a screen position: `arm(true)` then `devTravel({ x, y })` is the button and the click.
     */
    devTravel: (global) => devTravelToPixel(global),
    /** Arm the teleport exactly as the button does, and answer the mode it left behind. */
    armDevTravel: (on) => setDevArmed(on),
    /** Whether the teleport is armed (the button's own state). */
    devArmed: () => devArmed,
    /** The world pixel a click at a CSS point on the canvas would teleport to. */
    devPixelAt: (cssPoint) => devGlobalOf(cssPoint),
    /** The same reading the click path uses, for a caller that has a screen point. */
    travelToPixel: (cssPoint) => devTravelToPixel(devGlobalOf(cssPoint)),
    travelTo: (name) => {
      const hit = name ? world.byName(name) : selected;
      return hit ? travel(hit) : null;
    },
    /**
     * **The job's own mark in the country**, as the map draws it.
     *
     * A wild job is not a `CITYDATA` place, so there is nothing in `world` to click: this is the
     * marker `wildJobMarker()` builds, and `selectWildJob` / `travelToWildJob` are the card and
     * the journey a player's click reaches.
     */
    wildJob: () => {
      const marker = wildJobMarker();
      return marker ? { name: marker.name, label: marker.label, walk: marker.walk,
        cell: marker.cell, province: marker.province, anchorId: marker.anchorId } : null;
    },
    selectWildJob: () => {
      const marker = wildJobMarker();
      if (!marker) return null;
      select(marker);
      return { name: marker.name, label: marker.label, walk: marker.walk, cell: marker.cell };
    },
    travelToWildJob: () => {
      const marker = wildJobMarker();
      return marker ? travel(marker) : null;
    },
    /**
     * Take a **country job** on this page, as a conversation in a town does.
     *
     * The offer is drawn from the world exactly as the street's is (`generateQuest`), so a page
     * that must show a wilderness marker does not depend on the board's luck. For a test only:
     * a player reaches a wild job through somebody who offers it.
     */
    makeWildJob: (kind = 'hunt') => {
      try {
        const giver = boardGiver();
        const offer = generateQuest({ world, library, kind, seed: 0x5eed, giver, day: radiant.day ?? 1, dungeons });
        if (offer.targetKind !== 'wild') return null;
        const result = applyRadiantEvent(radiant, 'accept', { offer });
        if (!result.ok) return { ok: false, reason: result.reason };
        radiant = result.state;
        saveRadiantState(radiant);
        draw(); updateBar(); updateBoard();
        return { ok: true, id: offer.id, kind: offer.kind, target: offer.target,
          cell: offer.targetCell, anchor: offer.targetAnchor, walk: offer.targetWalk };
      } catch (err) {
        return { ok: false, reason: String(err?.message ?? err) };
      }
    },
    /** A line on the map's own status bar, for a scene that has just failed to build. */
    message: (text) => { message = String(text ?? ''); messageUntil = performance.now() + 8000; draw(); return message; },
    /** The map's layer is up, and its own page is the one on screen. */
    layerUp: () => alive !== false && host.classList.contains('on'),
  };
  if (overlay) window.__debug.worldMap = hooks;
  else Object.assign(window.__debug, { scene: 'worldmap' }, hooks);

  // `message` is here so the scene that rebuilds this map after a failed handoff can say
  // what went wrong on the map's own status line (`handOff`).
  return { world, chain, quest: () => quest, close, travelUrl, travel, message: hooks.message };
}
