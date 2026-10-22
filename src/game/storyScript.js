// ARENA'S MAIN-QUEST SCRIPT — every beat, the game's own words, and who says them.
//
// The text is the install's `TEMPLATE.DAT` (`game/storyLines.js`, generated and pinned by a test),
// the timing is the speech's own (`arena/storySpeech.js`), and the movie is the face that speaks:
// OpenTESArena's cinematic library names `VISION.FLC` as Ria Silmane's animation and `JAGAR.FLC`
// as Jagar Tharn's (`CinematicLibrary::init`), and the executable carries both names.
//
// The order is UESP's walkthrough of the main quest, checked against the executable's own speech
// bases: `1294 + pieces` is Ria's next dream and `1392 + pieces - 1` is Tharn's response to the
// piece just taken (`docs/FIDELITY-2026-10-20.md`). The level-2 gate is UESP's: Ria's first Staff
// dream comes the first time the player sleeps after reaching level 2.

import { STORY_LINES } from './storyLines.js';

/** Ria's dream in the cell, after creation (the port plays it through `showDream`). */
export const CELL_DREAM = 1400;

/** Ria's first Staff dream: the Staff's story, and Fang Lair named. Sleeps after level 2. */
export const QUEST_OPENING = 1500;

/**
 * **The death scene** (the owner, 2026-10-22: *"when you die the Ria cutscene should play, the
 * one that says with you died the last hope"*).
 *
 * `TEMPLATE.DAT` carries two deaths beside the quest's speech: `1402` is Ria's farewell
 * ("With you died our last hope for justice…"), the one the owner names, and `1403` is the
 * death in Tharn's voice. Ria's is the game's own death for a player who falls in the world,
 * and it is spoken over her own movie (`VISION.FLC`) like every other beat of hers.
 */
export const DEATH_TEXT = 1402;

/** Ria's dream that follows pieces 1…7: `1294 + pieces`. */
export const RIA_DREAM_BASE = 1294;

/** Tharn's answer to each piece: `1392 + pieces - 1`. */
export const THARN_AMBUSH_BASE = 1392;

/** The briefing on the Jewel of Fire (`1302`). UESP: cut, and not shown in ordinary play. */
export const JEWEL_BRIEFING = 1302;

/** Tharn at the palace gate, before the descent. */
export const PALACE_TAUNT = 1447;

/** Tharn as the Jewel is taken. */
export const JEWEL_CRY = 1404;

/** The restored Emperor's thanks. */
export const EMPEROR_THANKS = 1405;

/** The naming of the Eternal Champion. */
export const ETERNAL_CHAMPION = 1407;

/**
 * Ria's dream after `pieces` pieces are held.
 *
 * `1294 + pieces` names the **next** piece's place: with one piece the dream is `1295`, which
 * names the Labyrinthian. At eight pieces the executable would ask for `1302`, the Jewel
 * briefing — which UESP records as cut and never shown (`cut: true`), so the game does not
 * play it. With no pieces the dream is `1294`, Ria's "find the sages" dream for Fang Lair.
 *
 * @param {number} pieces 0…8
 * @returns {{key: number, cut: boolean}|null}
 */
export function riaDreamFor(pieces) {
  const held = Math.max(0, Math.min(8, Math.trunc(Number(pieces) || 0)));
  const key = RIA_DREAM_BASE + held;
  if (!STORY_LINES[key]) return null;
  return { key, cut: key === JEWEL_BRIEFING };
}

/**
 * Tharn's response to the piece just taken: `1392 + pieces - 1`.
 * @param {number} pieces 1…8
 * @returns {number|null}
 */
export function tharnAmbushFor(pieces) {
  const held = Math.trunc(Number(pieces) || 0);
  if (held < 1 || held > 8) return null;
  const key = THARN_AMBUSH_BASE + held - 1;
  return STORY_LINES[key] ? key : null;
}

/**
 * The dream a sleep owes a player, or null.
 *
 * The original's order: after level 2 the first sleep is Ria's Staff dream (`1500`); the next
 * sleep at no pieces is Ria's `1294`; a sleep after a piece is the dream `1294 + pieces`, which
 * names the next place. `seen` is the keys already played for this save.
 *
 * @param {{step?: number, pieces?: number, dreamsSeen?: number[]}} quest
 * @param {{level?: number}} player
 * @returns {number|null}
 */
export function dueDream(quest, player = {}) {
  const seen = Array.isArray(quest?.dreamsSeen) ? quest.dreamsSeen : [];
  const pieces = Math.max(0, Math.min(8, Math.trunc(Number(quest?.pieces) || 0)));
  const level = Math.trunc(Number(player?.level) || 1);
  const step = Math.trunc(Number(quest?.step) || 0);

  // The Staff dream belongs to the road, not the cell: Ria's first dream (1400) is the cell's,
  // and the Staff's story (1500) comes after the escape (`escaped` moves the step to 1).
  if (step < 1) return null;
  if (!seen.includes(QUEST_OPENING)) return level >= 2 ? QUEST_OPENING : null;
  const dream = riaDreamFor(pieces);
  if (!dream || dream.cut || seen.includes(dream.key)) return null;
  return dream.key;
}

/**
 * Ria's explanation of what happened, owed once per save.
 *
 * `1400` is the cell's own speech — *"Look to the north wall of this cell"* — and it is the
 * main quest's **start** cinematic: OpenTESArena looks up the `MainQuest` text definition whose
 * progress is 0 and shows it immediately after character creation
 * (`ChooseAttributesUiState.cpp`), before the world is entered. The port used to play it as a
 * side effect of the opening movie's UI flow, so skipping the intro skipped the story itself and
 * the player began collecting the Staff with no idea why.
 *
 * The save's own ledger decides now (`dreamsSeen`, the same list the sleep dreams use), so it
 * plays exactly once: after creation in the cell, after a reload, and once for an older save
 * that never saw it. `cellDreamPending` (`game/save.js`) is the one-shot handshake the start
 * menu sets, so a browser suite that boots a scene directly is not handed a movie it did not
 * ask for.
 *
 * @param {{dreamsSeen?: number[]}} quest
 * @returns {number|null} `1400`, or null when this save has heard her
 */
export function dueCellDream(quest) {
  const seen = Array.isArray(quest?.dreamsSeen) ? quest.dreamsSeen : [];
  return seen.includes(CELL_DREAM) ? null : CELL_DREAM;
}

/**
 * Tharn's ambush owed at the next encounter, or null.
 *
 * UESP: after each piece, his vision comes at a random monster encounter, and his minions
 * attack once the vision is over. The port keeps that order and its own notion of "next
 * encounter" — it plays the vision when the player next enters a level, before the fights.
 *
 * @param {{pieces?: number, ambushSeen?: number[]}} quest
 * @returns {number|null}
 */
export function dueAmbush(quest) {
  const seen = Array.isArray(quest?.ambushSeen) ? quest.ambushSeen : [];
  const key = tharnAmbushFor(quest?.pieces ?? 0);
  if (!key || seen.includes(key)) return null;
  return key;
}

/**
 * Who speaks a key.
 * @param {number} key
 * @returns {'Ria Silmane'|'Jagar Tharn'|'Emperor Uriel Septim VII'|null}
 */
export function storySpeaker(key) {
  if (key === EMPEROR_THANKS || key === ETERNAL_CHAMPION) return 'Emperor Uriel Septim VII';
  if (key >= THARN_AMBUSH_BASE && key <= THARN_AMBUSH_BASE + 7) return 'Jagar Tharn';
  if (key === PALACE_TAUNT || key === JEWEL_CRY) return 'Jagar Tharn';
  if (key >= RIA_DREAM_BASE && key <= JEWEL_BRIEFING) return 'Ria Silmane';
  if (key === CELL_DREAM || key === QUEST_OPENING || key === DEATH_TEXT) return 'Ria Silmane';
  return null;
}

/**
 * The movie the speaker appears in: Ria's `VISION.FLC`, Tharn's `JAGAR.FLC`.
 *
 * The Emperor's two lines are the ending's own scene, not a dream; the ending plays its
 * movies itself (`ENDING_MOVIES`), so they have none here.
 *
 * @param {number} key
 * @returns {string|null}
 */
export function storyMovie(key) {
  const speaker = storySpeaker(key);
  if (speaker === 'Ria Silmane') return 'VISION.FLC';
  if (speaker === 'Jagar Tharn') return 'JAGAR.FLC';
  return null;
}

/** Collapse a run of whitespace to one space. */
function collapse(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/**
 * One beat's words, with the player's names filled in.
 *
 * `%pcf` is the first name and `%pcn` the whole name, as `TEMPLATE.DAT` means them (OpenTESArena's
 * `TextCinematicUiModel::getSubtitleText`). An unknown key answers null rather than inventing text.
 *
 * @param {number} key
 * @param {{name?: string, firstName?: string}} [player]
 * @returns {string|null}
 */
export function storyText(key, player = {}) {
  const raw = STORY_LINES[key];
  if (typeof raw !== 'string') return null;
  const name = collapse(player.name ?? '');
  const first = collapse(player.firstName ?? (name ? name.split(/\s+/)[0] : ''));
  return collapse(raw
    .replace(/%pcf/gi, first || name || 'friend')
    .replace(/%pcn/gi, name || first || 'friend'));
}

/** Every key the quest's script carries. */
export function storyKeys() {
  return Object.keys(STORY_LINES).map(Number).sort((a, b) => a - b);
}

/**
 * The whole script as beats: the key, its speaker, its movie, and the quest moment.
 * A test holds this list to the install's keys and to the order the walkthrough gives.
 */
export const STORY_BEATS = Object.freeze([
  Object.freeze({ key: CELL_DREAM, beat: 'cell', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: QUEST_OPENING, beat: 'level-2 dream', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1294, beat: 'dream for piece 1', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1295, beat: 'dream for piece 2', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1296, beat: 'dream for piece 3', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1297, beat: 'dream for piece 4', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1298, beat: 'dream for piece 5', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1299, beat: 'dream for piece 6', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1300, beat: 'dream for piece 7', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1301, beat: 'dream for piece 8', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: JEWEL_BRIEFING, beat: 'the Jewel briefing (cut)', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: 1392, beat: 'Tharn after piece 1', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1393, beat: 'Tharn after piece 2', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1394, beat: 'Tharn after piece 3', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1395, beat: 'Tharn after piece 4', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1396, beat: 'Tharn after piece 5', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1397, beat: 'Tharn after piece 6', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1398, beat: 'Tharn after piece 7', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: 1399, beat: 'Tharn after piece 8', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: DEATH_TEXT, beat: 'the player falls', speaker: 'Ria Silmane', movie: 'VISION.FLC' }),
  Object.freeze({ key: PALACE_TAUNT, beat: 'the palace gate', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: JEWEL_CRY, beat: 'the Jewel taken', speaker: 'Jagar Tharn', movie: 'JAGAR.FLC' }),
  Object.freeze({ key: EMPEROR_THANKS, beat: 'the Emperor restored', speaker: 'Emperor Uriel Septim VII', movie: null }),
  Object.freeze({ key: ETERNAL_CHAMPION, beat: 'the Champion named', speaker: 'Emperor Uriel Septim VII', movie: null }),
]);
