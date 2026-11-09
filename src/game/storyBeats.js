// THE STORY'S BEATS — what the quest earns, and when.
//
// `game/cutscene.js` is the catalogue (every loose movie and the beat the project gives it);
// `game/cinematics.js` is the readable catalogue and the multi-movie chains; this module is the
// **wiring**, kept out of the scene so it can be read and tested without a browser. The beats
// themselves — their words, speaker, movie and timing — are Arena's own (`game/storyScript.js`,
// `arena/storySpeech.js`).
//
// The original's order, from UESP's walkthrough and the executable's own speech bases:
//
//   the cell        Ria's dream, `1400`, over `VISION.FLC`
//   level 2 + sleep Ria's first Staff dream, `1500`: the Staff, and Fang Lair
//   the same dream  `CHAOSVSN.FLC`: Ria's vision of the shattered Staff in the sky
//   the next sleep  `1294 + pieces`: the next place named, and the sages who can mark it
//   each piece      `1392 + pieces - 1`: Tharn's vision at the next encounter, then his minions
//   the eighth      `STAFF.FLC`, then `CHAOSVSN.FLC`: the Staff is whole, and its power is shown
//   the palace      `MORPH.FLC` (Tharn's change of face), then `1447`: he waits below
//   the last floor  `JAGRSHLD.FLC`: his shield over the Jewel of Fire
//   the Jewel       `1404`: Tharn as his lifeforce is taken
//   the ending      Tharn's fall, the Emperor restored, the Staff released, the door, the close
//
// The Ria dreams are **sleep's** (`dueDream`), not the pickup's, and Tharn's vision is the next
// **encounter's** (`dueAmbush`). A clue is a parchment the player carries back, not a movie.
//
// Two movies are deliberately not in the canonical run:
//
//   * `NUJAGDTH.FLC` is the CD release's replacement for `JAGARDTH.FLC`, paired with
//     `NUKING.FLC`; `endingMoviesFor` plays that pair when the install carries it and falls
//     back to `JAGARDTH.FLC`/`KING.FLC` otherwise. Both originals are in the gallery.
//   * `WARHAFT.FLC` is a cut slide (General Warhaft, the floppy release's ending). It is in the
//     gallery with its own note, never in a run that the CD release does not have him in.

import { JEWEL_CRY, PALACE_TAUNT, storyMovie } from './storyScript.js';
import {
  CANONICAL_ENDING_MOVIES, JEWEL_SHIELD_MOVIE, PALACE_REVEAL_MOVIE,
  STAFF_ASSEMBLY_MOVIES, endingMoviesFor,
} from './cinematics.js';

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

/**
 * The Staff's assembly: the whole Staff on its altar, then Ria's vision of its scattering.
 * Both are the install's movies and neither carries narration.
 */
export const STAFF_SCENES = Object.freeze(STAFF_ASSEMBLY_MOVIES.map((movie) => Object.freeze({ textKey: null, movie })));

/** The palace gate in order: Tharn changes face, then speaks his 1447 taunt. */
export const PALACE_SCENES = Object.freeze([
  Object.freeze({ textKey: null, movie: PALACE_REVEAL_MOVIE }),
  PALACE_SCENE,
]);

/** Tharn's shield over the Jewel, played on the palace's bottom floor. */
export const JEWEL_SHIELD_SCENE = Object.freeze({ textKey: null, movie: JEWEL_SHIELD_MOVIE });

/** The canonical ending chain: Tharn's fall, the Emperor, the Staff, the door, the close. */
export const ENDING_MOVIES = CANONICAL_ENDING_MOVIES;

export { endingMoviesFor };

/**
 * The scenes an event plays **immediately**, in order.
 *
 * Only the Jewel is a spoken immediate beat. A clue is a parchment, a piece is answered by
 * Tharn at the next encounter, and Ria's dream comes when the player sleeps — the original
 * never stops the player at the chest for a film. The Staff's assembly, the palace's
 * transformation and the Jewel's shield are the movies the original plays at those moments;
 * they carry no narration and are played by the scene when the beat lands.
 *
 * @param {string} event `questState.js`'s events, plus the scene's own `palaceGate` and
 *   `jewelShield`
 * @param {{pieces?: number, staffAssembled?: boolean}} [quest] the state **after** the event
 * @returns {{textKey: number|null, movie: string}[]}
 */
export function storyScenesFor(event, quest = {}) {
  if (event === 'jewelOfFire') return [JEWEL_SCENE];
  if (event === 'staffAssembled') return [...STAFF_SCENES];
  if (event === 'palaceGate') return [...PALACE_SCENES];
  if (event === 'jewelShield') return [JEWEL_SHIELD_SCENE];
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
