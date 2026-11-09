// WHAT SURVIVES A PAGE LOAD.
//
// The game is a set of scenes that are really page loads: the world map is one
// page, a city is another, a dungeon is a third. Fast travel *is* navigation, which
// is honest about what fast travel is — but it means the player's progress has to
// live somewhere outside the page.
//
// That somewhere is `localStorage`, behind this module, so every scene reads and
// writes the same keys through the same functions rather than each keeping its own
// copy of the rules. Three things are kept:
//
//   `perfectarena.lastLocation`  where the player is, so the map measures travel
//                                from here and can offer a way back
//   `perfectarena.quest`         the main quest (`game/questState.js`)
//   `perfectarena.radiant`       the side work (`game/radiantQuests.js`)
//   `perfectarena.character`     who the player is (`game/character.js`)
//   `perfectarena.regard`        who knows them, and how they feel (`game/regard.js`)
//   `perfectarena.loot`          what they have already taken, and when it restocks
//
// The values are plain JSON — the two state machines are deliberately free of
// functions and class instances so that a save is `JSON.stringify` and a load is
// `JSON.parse`, and the round-trip is a meaningful test rather than a formality.
// A browser in private mode may refuse to store anything at all: every write here
// is allowed to fail, and the game simply starts fresh next time.

import { deserializeQuestState, createQuestState } from './questState.js';
import { deserializeRadiantState, createRadiantState, serializeRadiantState } from './radiantQuests.js';
import { deserializeRegard, createRegardRecord, serializeRegard } from './regard.js';
import { parseWorld, serializeWorld } from './worldState.js';
import { createGuildState } from './guilds.js';
import { normalizeLogbook } from './logbook.js';
import { WORLD_GRID_VERSION, migrateWildCell } from './tamrielGrid.js';

/** Where the last location's identity is remembered, so the map can return to it. */
export const LAST_LOCATION_KEY = 'perfectarena.lastLocation';
/** Where the main quest lives between page loads. */
export const QUEST_KEY = 'perfectarena.quest';
/** Where the side work lives between page loads. */
export const RADIANT_KEY = 'perfectarena.radiant';
/** Where the character sheet lives between page loads. */
export const CHARACTER_KEY = 'perfectarena.character';
/** Where the emptied loot piles are remembered, so a dungeon restocks on its own clock. */
export const LOOT_KEY = 'perfectarena.loot';
/** Where the world's opinion of the player lives: one regard per person, by place and cell. */
export const REGARD_KEY = 'perfectarena.regard';
/** Door changes, visit and kill history; kills never control encounter population. */
export const WORLD_KEY = 'perfectarena.world';
/** Guild memberships, ranks and earned standing, saved by the same JSON discipline. */
export const GUILD_KEY = 'perfectarena.guilds';
/** The Daggerfall-style logbook: the player's own notes beside the quest's journal. */
export const LOGBOOK_KEY = 'perfectarena.logbook';

/**
 * The player's logbook, made safe. A missing or truncated record is an empty book, not an error.
 * @returns {{version: number, nextId: number, notes: object[]}}
 */
export function loadLogbook() { return normalizeLogbook(read(LOGBOOK_KEY)); }

/** Write the logbook; a browser that refuses storage loses the notes, never the game. */
export function saveLogbook(book) { write(LOGBOOK_KEY, normalizeLogbook(book)); }

export function loadWorldState() { return parseWorld(read(WORLD_KEY)); }
export function saveWorldState(world) { write(WORLD_KEY, serializeWorld(world)); }

/**
 * How many of the world's days a dungeon takes to restock what the player has taken.
 *
 * Arena's treasures are not a fixed amount: a dungeon the player has stripped is worth
 * coming back to later (its chests and bodies are placed by the map's own flats and are
 * simply there again), and the original's dungeons do restock. The number of days is this
 * project's rule and says so — two weeks is long enough that a dungeon is not a vending
 * machine and short enough that a player who spends a quest's travel time gets it back.
 */
export const RESTOCK_DAYS = 14;

/**
 * Load the emptied-loot record: `{ [mapKey]: { day, cells: ["row,col", …] } }`.
 *
 * @returns {Record<string, {day: number, cells: string[]}>}
 */
export function loadLootRecord() {
  const raw = read(LOOT_KEY);
  if (!raw || typeof raw !== 'object') return {};
  /** @type {Record<string, {day: number, cells: string[]}>} */
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const day = Number(value.day);
    const cells = Array.isArray(value.cells) ? value.cells.filter((c) => typeof c === 'string') : [];
    out[key] = { day: Number.isFinite(day) ? day : 0, cells };
  }
  return out;
}

/**
 * Remember that a cell of a level was emptied on a day.
 *
 * @param {string} mapKey  e.g. `START.MIF#0`
 * @param {string} cell    `row,col`
 * @param {number} day     the world's own day
 * @returns {{day: number, cells: string[]}}
 */
export function markLootTaken(mapKey, cell, day) {
  const record = loadLootRecord();
  const at = record[mapKey] ?? { day: 0, cells: [] };
  at.day = Number.isFinite(Number(day)) ? Number(day) : at.day;
  if (!at.cells.includes(cell)) at.cells.push(cell);
  record[mapKey] = at;
  write(LOOT_KEY, record);
  return at;
}

/**
 * Which cells of a level are still empty: the ones taken since the last restock.
 *
 * @param {string} mapKey
 * @param {number} day
 * @returns {Set<string>}
 */
export function lootStillEmpty(mapKey, day) {
  const record = loadLootRecord()[mapKey];
  if (!record) return new Set();
  const now = Number.isFinite(Number(day)) ? Number(day) : 0;
  if (now - record.day >= RESTOCK_DAYS || now < record.day) return new Set();
  return new Set(record.cells);
}

/**
 * Read and parse one key, tolerating a missing store, a refused read, and corrupt
 * JSON — all of which mean the same thing: nothing has been saved yet.
 *
 * @param {string} key
 * @returns {unknown}
 */
function read(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write one key, tolerating a refused write.
 * @param {string} key @param {unknown} value
 */
function write(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch { /* a private-mode browser is allowed to refuse; the game just will not persist */ }
}

/**
 * The one-shot handshake that a story scene is owed at the next level boot.
 *
 * Ria's explanation (`TEMPLATE.DAT` 1400) belongs to the game's beginning, and the start
 * menu is what knows a game actually began — a dev link that opens `?interior=START.MIF`
 * is not a new game. `game/storyScript.js`'s `dueCellDream` still decides from the save's
 * own ledger whether she has been heard; this only says "look now".
 */
export const CELL_DREAM_KEY = 'perfectarena.cellDream';

/** Ask the next level boot to play the explanation. */
export function markCellDreamPending() {
  write(CELL_DREAM_KEY, true);
}

/** @returns {boolean} whether a level boot owes the explanation */
export function cellDreamPending() {
  return read(CELL_DREAM_KEY) === true;
}

/** The handshake was consumed (or there is nothing to play). */
export function clearCellDreamPending() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CELL_DREAM_KEY);
  } catch { /* a refused write is a refused clear */ }
}

/** @returns {import('./questState.js').QuestState} */
export function loadQuestState() {
  const saved = read(QUEST_KEY);
  return saved ? deserializeQuestState(saved) : createQuestState();
}

/** @param {import('./questState.js').QuestState} state */
export function saveQuestState(state) {
  write(QUEST_KEY, state);
}

/** @returns {import('./radiantQuests.js').RadiantState} */
export function loadRadiantState() {
  const saved = read(RADIANT_KEY);
  return saved ? deserializeRadiantState(saved) : createRadiantState();
}

/** @param {import('./radiantQuests.js').RadiantState} state */
export function saveRadiantState(state) {
  write(RADIANT_KEY, serializeRadiantState(state));
}

/**
 * The regard ledger: who the player has met in the world, and how each of them feels.
 *
 * Kept beside the character rather than inside it because it is written *from* a scene that
 * has no character in hand (a street, a shop) and read by one that does (the map's
 * journal) — and because a player who starts a new character should meet a world that has
 * never heard of them.
 *
 * @returns {object} the ledger, empty when nothing has been saved
 */
export function loadRegard() {
  const saved = read(REGARD_KEY);
  return saved ? deserializeRegard(saved) : createRegardRecord();
}

/** @param {object} record */
export function saveRegard(record) {
  write(REGARD_KEY, serializeRegard(record));
}

/**
 * Where the player was, as `{name, dungeon}` — and, in the wild, **where in the wild**.
 *
 * The outdoor world is a real place now: a city gate that was crossed lands the player
 * back on the same cell of the same country after a reload, which is what "the world is
 * persistent" has to mean. `wild` is the *absolute* cell of the 128×128 wilderness grid
 * (`CITY_ORIGIN`-based; see `game/wilderness.js`), written by the interior scene when its
 * level is a wilderness window (cell 0,0 when the page stood at the settlement's gate —
 * the same country either way).
 *
 * @returns {{name: string, dungeon: boolean, wild: {row: number, col: number}|null}|null}
 */
export function loadLastLocation(world = null) {
  const saved = read(LAST_LOCATION_KEY);
  const wild = saved && Number.isFinite(saved?.wild?.row) && Number.isFinite(saved?.wild?.col)
    ? { row: Math.max(0, Math.round(saved.wild.row)), col: Math.max(0, Math.round(saved.wild.col)) }
    : null;
  return saved && typeof saved.name === 'string'
    ? {
      name: saved.name,
      dungeon: Boolean(saved.dungeon),
      seed: saved.seed ?? null,
      wild: world ? migrateWildCell(world, wild, saved.gridVersion) : wild,
      gridVersion: world ? WORLD_GRID_VERSION : saved.gridVersion ?? 1,
      provinceID: Number.isInteger(saved.provinceID) ? saved.provinceID : null,
      locationID: Number.isInteger(saved.locationID) ? saved.locationID : null,
      // **Whether the player is in open country** — the field that stops the map claiming a city
      // (B26's own report: *"when im in the wilderness it says im in a city but im not"*). `wild`
      // is a **world cell** now, and a page in the country sets this; a page inside a settlement
      // clears it, so the map draws its mark from the cell rather than from the name.
      country: Boolean(saved.country) && Boolean(wild),
    }
    : null;
}

/**
 * Remember where the player is.
 *
 * @param {{name: string, dungeon?: boolean, seed?: number|null,
 *   wild?: {row: number, col: number}|null, country?: boolean}} entry
 */
export function saveLastLocation(entry) {
  write(LAST_LOCATION_KEY, {
    name: entry.name,
    gridVersion: WORLD_GRID_VERSION,
    provinceID: Number.isInteger(entry.provinceID) ? entry.provinceID : null,
    locationID: Number.isInteger(entry.locationID) ? entry.locationID : null,
    dungeon: Boolean(entry.dungeon),
    seed: entry.seed ?? null,
    wild: entry.wild && Number.isFinite(entry.wild.row) && Number.isFinite(entry.wild.col)
      ? { row: Math.round(entry.wild.row), col: Math.round(entry.wild.col) }
      : null,
    country: Boolean(entry.country),
  });
}

/**
 * The character, once character creation has filled one in.
 * @returns {object|null}
 */
export function loadCharacter() {
  const saved = read(CHARACTER_KEY);
  return saved && typeof saved === 'object' ? saved : null;
}

/** @param {object} character */
export function saveCharacter(character) {
  write(CHARACTER_KEY, character);
}

/**
 * The saved guild state: memberships, ranks and earned standing.
 *
 * Same discipline as the radiant state — plain JSON, no functions, and a corrupt or
 * partial store falls back to a fresh one rather than crashing.
 * @returns {import('./guilds.js').GuildState}
 */
export function loadGuildState() {
  const saved = read(GUILD_KEY);
  if (!saved || typeof saved !== 'object') return createGuildState();
  return {
    memberships: saved.memberships && typeof saved.memberships === 'object' ? saved.memberships : {},
    standings: saved.standings && typeof saved.standings === 'object' ? saved.standings : {},
  };
}

/** @param {import('./guilds.js').GuildState} state */
export function saveGuildState(state) {
  write(GUILD_KEY, state);
}

/** Forget everything. Used by the tests, and by a player who wants a new game. */
export function clearSave() {
  for (const key of [LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY, CHARACTER_KEY, REGARD_KEY, LOOT_KEY, WORLD_KEY, GUILD_KEY, LOGBOOK_KEY]) {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch { /* nothing to do */ }
  }
}
