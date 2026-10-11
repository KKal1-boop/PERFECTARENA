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

import { ArenaData } from '../arena/arenaData.js';
import { loadWorldMap, TERRAIN_GLYPH } from '../game/worldMap.js';
import { buildQuestChain, nearestSettlement, stageMif } from '../game/questData.js';
import { applyQuestEvent, createQuestState, currentObjective, questLog } from '../game/questState.js';
import { loadArenaText } from '../arena/arenaText.js';
import {
  advanceDays, applyRadiantEvent, buildBoard, discoverLooseMifs, enterableDungeons,
  enterableFromListing, radiantLog, radiantObjective,
} from '../game/radiantQuests.js';

import {
  LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY,
  loadQuestState, saveQuestState, loadRadiantState, saveRadiantState,
} from '../game/save.js';

// The three save keys are re-exported here because this scene was their first
// home; `game/save.js` now owns them so every scene shares one implementation.
export { LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY };

/** Marker styling by location kind. */
const MARKER = Object.freeze({
  city: { radius: 3.6, fill: '#f2d9a0', stroke: '#3b2c12' },
  town: { radius: 3.0, fill: '#d8c58c', stroke: '#3b2c12' },
  village: { radius: 2.3, fill: '#b7a877', stroke: '#33270f' },
  staff: { radius: 4.0, fill: '#e2564a', stroke: '#2a0d0a' },
  map: { radius: 3.4, fill: '#d98a3c', stroke: '#2a180a' },
  random: { radius: 2.2, fill: '#8c8676', stroke: '#2a2820' },
  palace: { radius: 5.0, fill: '#f6f2df', stroke: '#6d5a1e' },
});

/** Gold used for the province borders and the current stage. */
const GOLD = '#c8a54a';
const SEA = '#0b1626';

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

/** The quest state carried between page loads. */
// The loaders and savers live in `game/save.js`; this scene reads and writes
// through them so the map, a city and a dungeon all agree about what is saved.

/**
 * Boot the world map.
 *
 * `_canvas` and `_renderer` are accepted to keep the scene signature uniform with
 * `bootInterior`, but this scene is a 2D DOM layer: the GL canvas is left idle and
 * untouched behind it.
 *
 * @param {HTMLCanvasElement} _canvas the game's GL canvas (unused)
 * @param {object} _renderer the engine renderer (unused)
 * @param {URLSearchParams} params
 * @param {(msg: string) => void} status
 * @param {import('../arena/arenaData.js').ArenaSource|null} source
 */
export async function bootWorldMap(_canvas, _renderer, params, status, source = null) {
  if (!source) throw new Error('bootWorldMap needs an Arena data source');

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

  /**
   * The settlement whose board is posted: the nearest one to wherever the player
   * last was. Standing in a dungeon, that is the town they set out from — which is
   * how a courier would find work, and how Arena's own travel works.
   */
  function boardGiver() {
    return nearestSettlement(world, lastLocationGlobal()) ?? world.settlements()[0];
  }

  /** The jobs posted here today, drawn deterministically from the town's own seed. */
  function boardOffers(giver = boardGiver()) {
    return buildBoard({
      world, library, seed: ((giver.citySeed ?? 1) ^ (radiant.day * 2654435761)) >>> 0,
      giver, day: radiant.day, dungeons,
    });
  }

  function refreshBoard() {
    radiant = { ...radiant, offers: boardOffers() };
    saveRadiantState(radiant);
    return radiant.offers;
  }

  const art = await data.img('TAMRIEL.IMG');
  const artData = toMapImageData(art.indices, art.palette, art.width, art.height);
  const artCanvas = document.createElement('canvas');
  artCanvas.width = art.width;
  artCanvas.height = art.height;
  artCanvas.getContext('2d').putImageData(artData, 0, 0);

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
  const legend = document.createElement('div');
  legend.id = 'map-legend';
  legend.innerHTML = '<b>Tamriel</b> — the world of Arena<br>'
    + '<span class="k">&#9679;</span> city-state &nbsp;<span class="k">&#9679;</span> town &nbsp;<span class="k">&#9679;</span> village<br>'
    + '<span class="d">&#9670;</span> dungeon &nbsp;<span class="s">&#9670;</span> Staff piece &nbsp;<span class="p">&#9733;</span> Imperial Palace<br>'
    + 'wheel to zoom · drag to pan · click a marker to travel';
  host.appendChild(legend);

  /** The visible window onto the 320×200 map, in CSS pixels. */
  const viewport = { scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0, fit: 1 };
  /** @type {object|null} */
  let selected = null;
  /** @type {object|null} */
  let hovered = null;
  let message = null;
  let messageUntil = 0;

  const ctx = view.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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

  /** The marker style for a location. */
  function styleOf(location) {
    if (location.kind !== 'dungeon') return MARKER[location.kind];
    if (location.index === 0) return MARKER.staff;
    if (location.index === 1) return MARKER.map;
    return MARKER.random;
  }

  /**
   * The offer board, as a panel.
   *
   * Every posting names the place the work happens and whether its prose is Arena's
   * own, and the accept button is the only way a job is taken — so the panel cannot
   * quietly disagree with the state machine.
   */
  function updateBoard() {
    const giver = boardGiver();
    const active = radiant.active;
    const rows = radiant.offers.map((offer) => `
      <li>
        <h3>${offer.title}</h3>
        <p class="sub">${offer.target}${offer.targetMif ? ` · <code>${offer.targetMif}</code>` : ''} · ${offer.targetProvince}</p>
        <p class="sub">${offer.days} days · ${offer.reward} gold · ${offer.dataText ? `<span class="src">${offer.source}</span>` : 'posted by the guild'}</p>
        <button data-offer="${offer.id}">Accept</button>
      </li>`).join('');
    board.innerHTML = `<h2>${giver.name} — the board</h2>`
      + (active
        ? `<p class="active">In hand: ${active.title}<br><span class="sub">${radiantObjective(radiant)}</span></p>`
        : `<ul>${rows || '<li class="sub">The boards are bare. Travel on and the work will follow.</li>'}</ul>`)
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
    const result = applyRadiantEvent(radiant, 'accept', { offer });
    if (!result.ok) { message = result.reason; messageUntil = performance.now() + 2500; return null; }
    radiant = result.state;
    saveRadiantState(radiant);
    message = `Taken: ${offer.title} — ${offer.target}.`;
    messageUntil = performance.now() + 2500;
    updateBoard(); draw();
    return offer;
  }

  /** The location the current stage points at, if any. */
  function stageLocation() {
    const stage = chain.stages[quest.step];
    if (!stage) return null;
    if (stage.kind === 'finale') return { name: stage.title, global: { x: world.width / 2 + 12, y: 100 }, finale: true };
    if (stage.kind === 'escape') return null;
    const hit = world.byName(stage.title);
    return hit ? { ...hit, finale: false } : null;
  }

  const questLocations = () => new Set(chain.stages.map((s) => s.title).filter(Boolean));

  function draw() {
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const s = viewport.fit * viewport.scale;
    // The map art, with smoothing on so a zoomed map stays readable.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(artCanvas, viewport.offsetX, viewport.offsetY, art.width * s, art.height * s);

    // Province borders.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(200,165,74,0.55)';
    for (const province of world.provinces) {
      const p = toScreen(province.rect);
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, province.rect.width * s, province.rect.height * s);
      const label = toScreen({ x: province.rect.x + province.rect.width / 2, y: province.rect.y + province.rect.height / 2 });
      ctx.font = `${Math.max(9, Math.min(14, s * 26))}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,10,14,0.65)';
      const text = province.name.toUpperCase();
      const width = ctx.measureText(text).width;
      ctx.fillRect(label.x - width / 2 - 4, label.y - 9, width + 8, 14);
      ctx.fillStyle = 'rgba(232,224,200,0.85)';
      ctx.fillText(text, label.x, label.y + 1);
    }

    // Quest dungeons get a permanent ring, so the map doubles as a quest guide.
    const questTitles = questLocations();
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 320);
    for (const location of world.locations) {
      if (location.kind !== 'dungeon' || !questTitles.has(location.name)) continue;
      const p = toScreen(location.global);
      const style = styleOf(location);
      ctx.beginPath();
      ctx.arc(p.x, p.y, style.radius * pulse + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = location.index === 0 ? 'rgba(226,86,74,0.85)' : 'rgba(217,138,60,0.8)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // The job in hand, ringed in green: whatever else the map is showing, the place
    // you were actually hired to go to is the one you can find at a glance.
    if (radiant.active) {
      const hit = world.byName(radiant.active.completed ? radiant.active.giver : radiant.active.target);
      if (hit) {
        const p = toScreen(hit.global);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + pulse * 2, 0, Math.PI * 2);
        ctx.strokeStyle = radiant.active.completed ? 'rgba(120,220,150,0.95)' : 'rgba(240,200,90,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        const label = radiant.active.completed ? 'return here' : 'your job';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(240,220,150,0.95)';
        ctx.fillText(label, p.x, p.y - 10);
      }
    }

    // Markers.
    for (const location of world.locations) {
      const p = toScreen(location.global);
      if (p.x < -10 || p.y < -10 || p.x > viewport.width + 10 || p.y > viewport.height + 10) continue;
      const style = styleOf(location);
      const isDungeon = location.kind === 'dungeon';
      const isSelected = selected && selected.name === location.name && selected.provinceID === location.provinceID;
      ctx.beginPath();
      if (isDungeon) {
        const r = style.radius;
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
      } else {
        ctx.arc(p.x, p.y, style.radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.lineWidth = isSelected ? 2 : 0.8;
      ctx.strokeStyle = isSelected ? '#fff3c4' : style.stroke;
      ctx.stroke();
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, style.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff3c4';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // The palace: the finale's marker, drawn as a star.
    const stage = chain.stages[chain.stages.length - 1];
    if (stage?.kind === 'finale') {
      const p = toScreen({ x: 172, y: 106 });
      ctx.fillStyle = MARKER.palace.fill;
      ctx.strokeStyle = MARKER.palace.stroke;
      ctx.lineWidth = 1;
      star(ctx, p.x, p.y, 5, 2.4);
    }

    // Labels for the biggest settlements when zoomed in.
    if (viewport.scale > 1.6) {
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(20,16,8,0.8)';
      for (const location of world.settlements()) {
        if (location.kind !== 'city') continue;
        const p = toScreen(location.global);
        if (p.x < 0 || p.y < 0 || p.x > viewport.width || p.y > viewport.height) continue;
        ctx.fillText(location.name, p.x + 6, p.y + 3);
      }
    }

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

  /** A five-pointed star, for the palace. */
  function star(context, cx, cy, outer, inner) {
    context.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    ctx.fill(); ctx.stroke();
  }

  /** The location under a CSS-pixel point, if any. */
  function locationAt(point) {
    let best = null;
    for (const location of world.locations) {
      const p = toScreen(location.global);
      const distance = Math.hypot(p.x - point.x, p.y - point.y);
      const radius = Math.max(6, styleOf(location).radius + 4);
      if (distance <= radius && (!best || distance < best.distance)) best = { location, distance };
    }
    // The palace is not a CITYDATA location, so it needs its own hit test.
    const palace = toScreen({ x: 172, y: 106 });
    const palaceDistance = Math.hypot(palace.x - point.x, palace.y - point.y);
    if (palaceDistance <= 9 && (!best || palaceDistance < best.distance)) {
      return { location: { name: 'The Imperial Palace', kind: 'palace', province: 'Imperial Province', provinceID: 8, final: true, global: { x: 172, y: 106 }, climate: 'temperate', coastal: false } };
    }
    return best;
  }

  function describe(location) {
    if (!location) return '';
    const kindName = { city: 'city-state', town: 'town', village: 'village', dungeon: 'dungeon', palace: 'the Imperial Palace' }[location.kind] ?? location.kind;
    return `${location.name} — ${kindName}, ${location.province}`;
  }

  /** The travel target for a location: the URL the map sends the player to. */
  function travelUrl(location) {
    const arena = source.arenaPath ? `&arena=${encodeURIComponent(source.arenaPath)}` : '';
    if (location.kind === 'palace') return `?interior=IMPPAL.MIF${arena}`;
    if (location.kind === 'dungeon') {
      const mif = location.mif ?? (typeof location.dungeonSeed === 'number' ? stageMif({ dungeonSeed: location.dungeonSeed }) : null);
      return `?dungeon=${encodeURIComponent(location.name)}${arena}`;
    }
    return `?location=${encodeURIComponent(location.name)}${arena}`;
  }

  /** How far, in days, from wherever the player is to here. */
  function travelDays(location) {
    const from = lastLocationGlobal();
    const to = location.global ?? { x: 172, y: 106 };
    return world.travel(from, to);
  }

  function lastLocationGlobal() {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LAST_LOCATION_KEY);
      if (!raw) return { x: 172, y: 106 };
      const saved = JSON.parse(raw);
      const hit = saved.name ? world.byName(saved.name) : null;
      return hit ? hit.global : (saved.dungeon ? dungeonGlobal(saved.dungeon) : { x: 172, y: 106 });
    } catch {
      return { x: 172, y: 106 };
    }
  }

  /** A dungeon is reached from the settlement nearest it. */
  function dungeonGlobal(name) {
    const hit = world.byName(name);
    return hit ? hit.global : { x: 172, y: 106 };
  }

  function updateCard() {
    if (!selected) {
      card.innerHTML = '';
      card.classList.remove('on');
      return;
    }
    const { days } = travelDays(selected);
    const kindName = { city: 'city-state', town: 'town', village: 'village', dungeon: 'dungeon', palace: 'the Imperial Palace' }[selected.kind] ?? selected.kind;
    const seed = selected.kind === 'dungeon' ? selected.dungeonSeed : selected.citySeed;
    const nearest = selected.kind === 'dungeon' ? nearestSettlement(world, selected.global) : null;
    card.innerHTML = `
      <h2>${selected.name}</h2>
      <p class="sub">${kindName} · ${selected.province} · ${selected.climate}${selected.coastal ? ' · coastal' : ''}</p>
      <p class="sub">${days} day${days === 1 ? '' : 's'} of travel${nearest ? ` · nearest town ${nearest.name} (${nearest.distance} px)` : ''}</p>
      <p class="sub">${selected.kind === 'dungeon' ? `dungeon seed <code>${seed}</code> → <code>${selected.mif ?? stageMif(selected)}</code>` : `city seed <code>${seed}</code>`}</p>
      <button id="map-travel">Travel</button>
      <button id="map-close" class="ghost">Cancel</button>`;
    card.classList.add('on');
    card.querySelector('#map-travel').onclick = () => travel(selected);
    card.querySelector('#map-close').onclick = () => select(null);
  }

  function select(location) {
    selected = location;
    updateCard();
    if (location) saveLast({ name: location.name });
  }

  function saveLast(entry) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(entry));
    } catch { /* ignore */ }
  }

  /** Travel to a location: this is the page change. */
  function travel(location) {
    if (!location) return false;
    const url = travelUrl(location);
    saveLast({ name: location.name, dungeon: location.kind === 'dungeon' });
    status(`travelling to ${location.name}`);
    const days = travelDays(location).days;
    // The road costs days, and a day is what a deadline is measured in — so the
    // calendar moves with the player and a job can genuinely run out while they are
    // somewhere else. This is the whole of the "time passes" rule.
    radiant = advanceDays(radiant, days);
    saveRadiantState(radiant);
    message = `Travelling to ${location.name} — ${days} day${days === 1 ? '' : 's'}.`;
    messageUntil = performance.now() + 1200;
    location.href = url;
    return url;
  }

  function updateBar() {
    const side = radiantObjective(radiant);
    const objective = currentObjective(quest, chain);
    bar.innerHTML = `<span class="obj">${objective}</span>`
      + (side ? `<span class="side">${side}</span>` : '')
      + `<span class="pieces">Staff pieces ${quest.pieces}/8</span>`
      + `<span class="hint">B the board · click a marker · drag to pan · wheel to zoom</span>`;
  }

  // ── input ──────────────────────────────────────────────────────────────────
  let dragging = null;
  view.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY, offsetX: viewport.offsetX, offsetY: viewport.offsetY, moved: false };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
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
    const rect = view.getBoundingClientRect();
    const hit = locationAt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    hovered = hit ? hit.location : null;
    if (hovered) {
      hoverLabel.textContent = describe(hovered);
      hoverLabel.style.left = `${e.clientX - rect.left + 14}px`;
      hoverLabel.style.top = `${e.clientY - rect.top + 10}px`;
      hoverLabel.classList.add('on');
    } else {
      hoverLabel.classList.remove('on');
    }
    view.style.cursor = hovered ? 'pointer' : (dragging ? 'grabbing' : 'grab');
  });
  view.addEventListener('pointerup', (e) => {
    const wasDragging = dragging;
    dragging = null;
    if (!wasDragging || wasDragging.moved) return;
    const rect = view.getBoundingClientRect();
    const hit = locationAt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    select(hit ? hit.location : null);
    if (hit) draw();
  });
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
  }, { passive: false });
  addEventListener('resize', () => { resize(); draw(); });
  addEventListener('keydown', (e) => {
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
  });

  resize();
  updateBar();
  refreshBoard();
  updateBoard();
  centerOn({ x: art.width / 2, y: art.height / 2 });
  // A slow pulse makes the quest dungeons the eye-catchers, and it doubles as the
  // scene's own "frames are running" signal for the tests.
  let frames = 0;
  const animate = () => { frames++; draw(); requestAnimationFrame(animate); };
  requestAnimationFrame(animate);
  status('Tamriel ready');

  // ── the debug seam ─────────────────────────────────────────────────────────
  Object.assign(window.__debug, {
    scene: 'worldmap',
    state: () => ({
      scene: 'worldmap',
      provinces: world.provinces.length,
      locations: world.locations.length,
      settlements: world.settlements().length,
      drawn: { width: art.width, height: art.height },
      viewport: { scale: viewport.scale, fit: viewport.fit, width: viewport.width, height: viewport.height },
      hovered: hovered?.name ?? null,
      selected: selected ? { name: selected.name, kind: selected.kind, province: selected.province, climate: selected.climate, coastal: selected.coastal } : null,
      stage: chain.stages[quest.step]?.title ?? null,
      objective: currentObjective(quest, chain),
      side: radiantObjective(radiant),
      day: radiant.day,
      boardOpen: board.classList.contains('on'),
      frames,
      errors: 0,
    }),
    quest: () => questLog(quest, chain),
    // ── the side work ────────────────────────────────────────────────────────
    /** The board, the journal and the day, as the player would see them. */
    radiant: () => ({
      ...radiantLog(radiant),
      giver: boardGiver().name,
      enterableDungeons: dungeons.length,
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
    /** Fire a radiant event, for the scripted run. */
    radiantEvent: (event, ctx = {}) => {
      const result = applyRadiantEvent(radiant, event, ctx);
      if (result.ok) { radiant = result.state; saveRadiantState(radiant); updateBoard(); updateBar(); draw(); }
      return { ok: result.ok, reason: result.reason, gold: result.gold ?? null, objective: radiantObjective(radiant), taken: radiant.taken, failed: radiant.failed };
    },
    /** Let days pass, which is how a deadline actually expires. */
    radiantDays: (days) => { radiant = advanceDays(radiant, days); saveRadiantState(radiant); updateBoard(); updateBar(); return { day: radiant.day, active: radiant.active?.title ?? null, failed: radiant.failed }; },
    /** Rebuild the board, as leaving and re-entering the town does. */
    radiantRefresh: () => {
      refreshBoard();
      updateBoard();
      return radiant.offers.map((o) => ({
        id: o.id, kind: o.kind, title: o.title, target: o.target,
        targetMif: o.targetMif, targetProvince: o.targetProvince,
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
    chain: () => chain.stages.map((s) => ({ index: s.index, kind: s.kind, title: s.title, province: s.province, mif: stageMif(s), climate: s.climate })),
    /** Screen position of a location's marker, for a test that clicks like a player. */
    markerAt: (name) => {
      const hit = world.byName(name);
      if (!hit) return null;
      const p = toScreen(hit.global);
      return { x: p.x, y: p.y, world: hit.global, name: hit.name };
    },
    select: (name) => { const hit = name ? world.byName(name) : null; select(hit); draw(); return hit ? hit.name : null; },
    travel: (name) => {
      const hit = name ? world.byName(name) : selected;
      return hit ? travel(hit) : null;
    },
    setZoom: (scale) => { viewport.scale = Math.max(1, Math.min(6, scale)); clamp(); draw(); return viewport.scale; },
    centreOn: (x, y) => { centerOn({ x, y }); draw(); return { x, y }; },
    /** The terrain class under a world pixel, and the ASCII glyph for it. */
    terrainAt: (x, y) => ({ value: world.terrainAt({ x, y }), glyph: TERRAIN_GLYPH[world.terrainAt({ x, y })] ?? '?', climate: world.climateAt({ x, y }) }),
    closest: (x, y) => {
      let best = null;
      for (const location of world.locations) {
        const d = Math.hypot(location.global.x - x, location.global.y - y);
        if (!best || d < best.d) best = { d, location };
      }
      return best ? { name: best.location.name, distance: Math.round(best.d), kind: best.location.kind, climate: best.location.climate } : null;
    },
  });

  return { world, chain, quest: () => quest };
}
