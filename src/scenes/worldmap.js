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
  enterableFromListing, namedSettlements, radiantLog, radiantObjective,
} from '../game/radiantQuests.js';
import { DUNGEON_BLOCKS_MIF } from '../game/dungeonPlan.js';

import {
  LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY,
  loadCharacter, loadQuestState, saveCharacter, saveQuestState,
  loadRadiantState, saveRadiantState, loadRegard,
} from '../game/save.js';
import { peopleKnown, regardTally, standingWord } from '../game/regard.js';
import { classById } from '../game/character.js';
import { escapeHtml } from '../engine/ui/escape.js';
import { beginNewGame } from './newGame.js';

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
   * `{name, dungeon}` — the location's own name, and whether it was a dungeon. The
   * distinction is the board's whole rule below (a board hangs in a town, not in a
   * dungeon) and it is the only thing this scene knows about the player's position.
   *
   * @returns {{name: string|null, dungeon: boolean}}
   */
  function lastLocation() {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LAST_LOCATION_KEY);
      if (!raw) return { name: null, dungeon: false, seed: null };
      const saved = JSON.parse(raw);
      return { name: saved?.name ?? null, dungeon: Boolean(saved?.dungeon), seed: saved?.seed ?? null };
    } catch {
      return { name: null, dungeon: false, seed: null };
    }
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
    return nearestSettlement(world, lastLocationGlobal()) ?? namedSettlements(world)[0] ?? null;
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
  const sheet = document.createElement('div');
  sheet.id = 'map-sheet';
  host.appendChild(sheet);
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
    const arena = folder ? `&arena=${encodeURIComponent(folder)}` : '';
    if (location.kind === 'palace') return `?interior=IMPPAL.MIF${arena}`;
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
    const to = location.global ?? { x: 172, y: 106 };
    return world.travel(from, to);
  }

  function lastLocationGlobal() {
    const saved = lastLocation();
    const named = saved.name ? world.byName(saved.name) : null;
    if (named) return named.global;
    // A dungeon with no name is found by its seed — the same number the page was entered
    // by, and the one that decides its layout.
    const bySeed = saved.seed == null
      ? null
      : world.locations.find((l) => String(l.dungeonSeed) === String(saved.seed));
    return bySeed ? bySeed.global : { x: 172, y: 106 };
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
    const generated = selected.kind === 'dungeon' && !(loose.has(String(selected.mif ?? '').toUpperCase()));
    card.innerHTML = `
      <h2>${dungeonLabel(selected)}</h2>
      <p class="sub">${kindName} · ${selected.province} · ${selected.climate}${selected.coastal ? ' · coastal' : ''}</p>
      <p class="sub">${days} day${days === 1 ? '' : 's'} of travel${nearest ? ` · nearest town ${nearest.name} (${nearest.distance} px)` : ''}</p>
      <p class="sub">${selected.kind === 'dungeon'
        ? `dungeon seed <code>${seed}</code> → ${generated
          ? 'assembled from this install\'s own dungeon blocks (<code>RANDOM1.MIF</code>)'
          : `<code>${selected.mif ?? stageMif(selected)}</code>`}`
        : `city seed <code>${seed}</code>`}</p>
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
  function travel(marker) {
    if (!marker) return false;
    const url = travelUrl(marker);
    saveLast({ name: marker.name, dungeon: marker.kind === 'dungeon', seed: marker.dungeonSeed ?? null });
    status(`travelling to ${marker.name}`);
    const days = travelDays(marker).days;
    // The road costs days, and a day is what a deadline is measured in — so the
    // calendar moves with the player and a job can genuinely run out while they are
    // somewhere else. This is the whole of the "time passes" rule.
    radiant = advanceDays(radiant, days);
    saveRadiantState(radiant);
    message = `Travelling to ${marker.name} — ${days} day${days === 1 ? '' : 's'}.`;
    messageUntil = performance.now() + 1200;
    if (overlay && typeof opts.onTravel === 'function') {
      // Let the message be *seen* before the map comes down and the scene rebuilds.
      draw();
      return { to: opts.onTravel(marker), url, days };
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
    void handOff(url, marker, days);
    return { to: marker.name, url, days };
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
    bar.innerHTML = `<span class="obj">${objective}</span>`
      + (side ? `<span class="side">${side}</span>` : '')
      + `<span class="pieces">Staff pieces ${quest.pieces}/8</span>`
      + `<span class="hint">${overlay ? 'M or Esc to close · ' : ''}B the board · click a marker · drag to pan · wheel to zoom</span>`;
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

  // ── input ──────────────────────────────────────────────────────────────────
  let dragging = null;
  view.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY, offsetX: viewport.offsetX, offsetY: viewport.offsetY, moved: false };
    view.setPointerCapture(e.pointerId);
  }, { signal });
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
  }, { signal });
  view.addEventListener('pointerup', (e) => {
    const wasDragging = dragging;
    dragging = null;
    if (!wasDragging || wasDragging.moved) return;
    const rect = view.getBoundingClientRect();
    const hit = locationAt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    select(hit ? hit.location : null);
    if (hit) draw();
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
    // In an overlay, `M` and Escape put the map away and the game is still standing
    // behind it — the page does not change, so the picked folder is still open and the
    // player is exactly where they were. On the map's own page, Escape only drops the
    // selection (there is nowhere to go back to).
    if (overlay && (e.code === 'Escape' || e.code === 'KeyM')) { close(); return; }
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
  const animate = () => { if (!alive) return; frames++; draw(); requestAnimationFrame(animate); };
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
    /** Put the overlay away (a no-op on the map's own page). */
    close: () => close(),
    /** The URL a location would be travelled to on the map's own page. */
    travelUrl: (name) => {
      const hit = name ? world.byName(name) : selected;
      return hit ? travelUrl(hit) : null;
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
    travelTo: (name) => {
      const hit = name ? world.byName(name) : selected;
      if (!hit) return null;
      const days = travelDays(hit).days;
      if (overlay && typeof opts.onTravel === 'function') return Promise.resolve(opts.onTravel(hit));
      const url = travelUrl(hit);
      saveLast({ name: hit.name, dungeon: hit.kind === 'dungeon', seed: hit.dungeonSeed ?? null });
      radiant = advanceDays(radiant, days);
      saveRadiantState(radiant);
      return handOff(url, hit, days);
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
