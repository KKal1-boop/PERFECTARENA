// THE STORY'S BEATS — what the quest earns, and when.
//
// `game/cutscene.js` is the catalogue (every loose movie and the beat the project gives it);
// this module is the **wiring**, kept out of the scene so it can be read and tested without a
// browser. The beats themselves — their words, speaker, movie and timing — are Arena's own
// (`game/storyScript.js`, `arena/storySpeech.js`).
//
// The original's order, from UESP's walkthrough and the executable's own speech bases:
//
//   the cell        Ria's dream, `1400`, over `VISION.FLC`
//   level 2 + sleep Ria's first Staff dream, `1500`: the Staff, and Fang Lair
//   the next sleep  `1294 + pieces`: the next place named, and the sages who can mark it
//   each piece      `1392 + pieces - 1`: Tharn's vision at the next encounter, then his minions
//   the palace      `1447`: Tharn, waiting below
//   the Jewel       `1404`: Tharn as his lifeforce is taken
//   the ending      the Emperor restored, `1405` and `1407`, and Arena's closing movies
//
// The Ria dreams are **sleep's** (`dueDream`), not the pickup's, and Tharn's vision is the next
// **encounter's** (`dueAmbush`). A clue is a parchment the player carries back, not a movie.
//
// The alternate endings (`END02.FLC`, `AFLC2.FLC`) and the tour (`WALK.FLC`) stay in the
// catalogue's `?cutscene=` door: the port has one ending, and the others are Arena's
// alternatives rather than beats of the run the game plays.

import { JEWEL_CRY, PALACE_TAUNT, storyMovie } from './storyScript.js';

/** Ria's face: the install's dream animation (`VISION.FLC`). */
export const DREAM_MOVIE = 'VISION.FLC';

/** Tharn's face: the install's other dream animation (`JAGAR.FLC`). */
export const THARN_MOVIE = 'JAGAR.FLC';

/** The palace gate: Tharn's own words, in his own movie. */
export const PALACE_SCENE = Object.freeze({ textKey: PALACE_TAUNT, movie: storyMovie(PALACE_TAUNT) });

/** The Jewel taken: Tharn's cry, in his own movie. */
export const JEWEL_SCENE = Object.freeze({ textKey: JEWEL_CRY, movie: storyMovie(JEWEL_CRY) });

/** The palace's arrival movie. Kept as a name so a caller that only wants the file has one. */
export const PALACE_MOVIE = PALACE_SCENE.movie;

/** The two movies the ending chains: Tharn's fall, then Arena's closing scene. */
export const ENDING_MOVIES = Object.freeze(['JAGARDTH.FLC', 'END01.FLC']);

/**
 * The scenes an event plays **immediately**, in order.
 *
 * Only the Jewel is immediate. A clue is a parchment, a piece is answered by Tharn at the next
 * encounter, and Ria's dream comes when the player sleeps — the original never stops the player
 * at the chest for a film. (`textKey: null` means "the movie alone, with no narration".)
 *
 * @param {string} event `questState.js`'s events
 * @param {{pieces?: number, staffAssembled?: boolean}} [quest] the state **after** the event
 * @returns {{textKey: number|null, movie: string}[]}
 */
export function storyScenesFor(event, quest = {}) {
  if (event === 'jewelOfFire') return [JEWEL_SCENE];
  return [];
}

/**
 * The movie (or movies) an event plays at once, for callers that only need the file names.
 * @param {string} event
 * @param {{pieces?: number}} [quest]
 * @returns {string[]}
 */
export function storyMoviesFor(event, quest = {}) {
  return storyScenesFor(event, quest).map((scene) => scene.movie).filter(Boolean);
}
