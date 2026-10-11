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
//
// The values are plain JSON — the two state machines are deliberately free of
// functions and class instances so that a save is `JSON.stringify` and a load is
// `JSON.parse`, and the round-trip is a meaningful test rather than a formality.
// A browser in private mode may refuse to store anything at all: every write here
// is allowed to fail, and the game simply starts fresh next time.

import { deserializeQuestState, createQuestState } from './questState.js';
import { deserializeRadiantState, createRadiantState, serializeRadiantState } from './radiantQuests.js';

/** Where the last location's identity is remembered, so the map can return to it. */
export const LAST_LOCATION_KEY = 'perfectarena.lastLocation';
/** Where the main quest lives between page loads. */
export const QUEST_KEY = 'perfectarena.quest';
/** Where the side work lives between page loads. */
export const RADIANT_KEY = 'perfectarena.radiant';
/** Where the character sheet lives between page loads. */
export const CHARACTER_KEY = 'perfectarena.character';

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
 * Where the player was, as `{name, dungeon}`.
 * @returns {{name: string, dungeon: boolean}|null}
 */
export function loadLastLocation() {
  const saved = read(LAST_LOCATION_KEY);
  return saved && typeof saved.name === 'string' ? { name: saved.name, dungeon: Boolean(saved.dungeon) } : null;
}

/**
 * Remember where the player is.
 * @param {{name: string, dungeon?: boolean}} entry
 */
export function saveLastLocation(entry) {
  write(LAST_LOCATION_KEY, { name: entry.name, dungeon: Boolean(entry.dungeon) });
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

/** Forget everything. Used by the tests, and by a player who wants a new game. */
export function clearSave() {
  for (const key of [LAST_LOCATION_KEY, QUEST_KEY, RADIANT_KEY, CHARACTER_KEY]) {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch { /* nothing to do */ }
  }
}
