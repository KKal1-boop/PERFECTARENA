// EVERY ONE OF ARENA'S MOVIES, AND WHERE IT BELONGS.
//
// `game/cutscene.js` is the reader's catalogue: the file names, the beat each one is
// wired to, and the measured facts (320×200, the file's own frame delay). This module
// is the **story's** catalogue on top of it: a title a player can read, a note saying
// what the file is, and the chains the quest plays when a beat needs more than one
// movie.
//
// The install ships seventeen loose `.FLC`s. The port used to wire four of them into
// the story (`VISION`, `JAGAR`, `JAGARDTH`, `END01`) and leave the other thirteen to
// the `?cutscene=` door. That is not the original: Arena's ending alone uses the
// Emperor's shot, the Staff released, the dimensional door and the closing animation,
// and the Staff's assembly has its own movie. The constants below are the rest of the
// wiring, named as this project's reading where the executable's jump table is not in
// this data set (D11, `docs/PORT_BLOCKS.md`).
//
// Two release facts are kept rather than flattened:
//
//   * **The revised endgame pair.** The CD release's `NUKING.FLC` replaced `KING.FLC`
//     (the Emperor's shot) and `NUJAGDTH.FLC` replaced `JAGARDTH.FLC` (Tharn's death).
//     An install carries both pairs, so `endingMoviesFor` chooses the revised pair when
//     it exists and falls back to the original; the other is still playable from the
//     scene gallery.
//   * **`WARHAFT.FLC` is a cut slide.** It is General Warhaft, the player's guardian in
//     the floppy release's ending, and UESP records both the slide and the words it
//     would have carried. It is not put into the canonical ending — the CD ending does
//     not have him — but it is in the gallery with that note, which is the honest way
//     to keep a cut scene present without pretending it shipped.

import { CUTSCENES } from './cutscene.js';

/**
 * A title and a one-line note for every movie the install ships.
 *
 * `note` says what the file is, read from its own frames and the sources; it never
 * claims a beat the project cannot support. The canonical chain is separate, below.
 *
 * @type {Readonly<Record<string, {title: string, note: string}>>}
 */
export const CINEMATIC_INFO = Object.freeze({
  'INTRO.FLC': Object.freeze({
    title: 'The Book of the Arena',
    note: 'The opening book: “The Elder Scrolls — Chapter One: The Arena”.',
  }),
  'SCROLL.FLC': Object.freeze({
    title: 'The Opening Scroll',
    note: 'The scroll the opening history unrolls on, before the three story pictures.',
  }),
  'VISION.FLC': Object.freeze({
    title: 'Ria Silmane',
    note: 'Ria’s face in the dream bridge — every one of her speeches uses it.',
  }),
  'CHAOSVSN.FLC': Object.freeze({
    title: 'The Vision of Chaos',
    note: 'The Staff of Chaos adrift in the sky — Ria’s vision of what Tharn did to it.',
  }),
  'STAFF.FLC': Object.freeze({
    title: 'The Staff Assembled',
    note: 'The whole Staff of Chaos on its altar, green fire around it.',
  }),
  'JAGAR.FLC': Object.freeze({
    title: 'Jagar Tharn',
    note: 'Tharn’s face in the dream bridge — his threats and his cry over the Jewel.',
  }),
  'JAGRSHLD.FLC': Object.freeze({
    title: 'Tharn’s Shield',
    note: 'The shield Tharn raises over the Jewel of Fire in the palace’s last chamber.',
  }),
  'MORPH.FLC': Object.freeze({
    title: 'The Transformation',
    note: 'The change of face — Tharn’s disguise, shown at the palace gate.',
  }),
  'JAGARDTH.FLC': Object.freeze({
    title: 'Tharn’s Fall',
    note: 'The original release’s death of Jagar Tharn.',
  }),
  'NUJAGDTH.FLC': Object.freeze({
    title: 'Tharn’s Fall (revised)',
    note: 'The CD release’s replacement for JAGARDTH.FLC.',
  }),
  'KING.FLC': Object.freeze({
    title: 'The Emperor Restored',
    note: 'Uriel Septim VII, the original release’s shot of the freed Emperor.',
  }),
  'NUKING.FLC': Object.freeze({
    title: 'The Emperor Restored (revised)',
    note: 'The CD release’s replacement for KING.FLC.',
  }),
  'END01.FLC': Object.freeze({
    title: 'The Staff Released',
    note: 'The ending: the Staff’s power loosed from the Jewel, against the sky.',
  }),
  'END02.FLC': Object.freeze({
    title: 'The Dimensional Door',
    note: 'The ending’s throne and the door between worlds, as the Emperor returns.',
  }),
  'AFLC2.FLC': Object.freeze({
    title: 'The Closing Animation',
    note: 'The second closing animation — the corridor after the story is over.',
  }),
  'WARHAFT.FLC': Object.freeze({
    title: 'General Warhaft (cut)',
    note: 'Talin Warhaft, the player’s guardian in the floppy release’s ending. Cut from the CD release; kept here with its own words.',
  }),
  'WALK.FLC': Object.freeze({
    title: 'The Walking Tour',
    note: 'The long walking tour of the world — the attract-mode movie.',
  }),
});

/**
 * The Staff's assembly, in order: the whole Staff, then Ria's vision of its scattering.
 * Both are movies without narration; the quest plays them one after the other when the
 * eighth piece lands (`staffAssembled`).
 */
export const STAFF_ASSEMBLY_MOVIES = Object.freeze(['STAFF.FLC', 'CHAOSVSN.FLC']);

/** Ria's vision of the Staff, played after her 1500 speech (the level-2 dream). */
export const STAFF_VISION_MOVIE = 'CHAOSVSN.FLC';

/** Tharn's transformation, played at the palace gate before his 1447 taunt. */
export const PALACE_REVEAL_MOVIE = 'MORPH.FLC';

/** Tharn's shield, played when the player reaches the palace's bottom level. */
export const JEWEL_SHIELD_MOVIE = 'JAGRSHLD.FLC';

/** The two Emperor shots, the revised one first. */
export const EMPEROR_MOVIE_CHOICES = Object.freeze(['NUKING.FLC', 'KING.FLC']);

/** The two Tharn falls, the CD revision first — it is paired with `NUKING.FLC`. */
export const ENDING_FALL_CHOICES = Object.freeze(['NUJAGDTH.FLC', 'JAGARDTH.FLC']);

/** The three movies that close the story after the Emperor's shot. */
export const ENDING_TAIL = Object.freeze(['END01.FLC', 'END02.FLC', 'AFLC2.FLC']);

/** The canonical chain for the CD release: the revised fall and Emperor, then every tail movie. */
export const CANONICAL_ENDING_MOVIES = Object.freeze([
  'NUJAGDTH.FLC', 'NUKING.FLC', ...ENDING_TAIL,
]);

/**
 * The ending, for the movies this install actually has.
 *
 * The order is the story's: Tharn falls, the Emperor is restored, the Staff is
 * released, the door between worlds opens, the closing animation. A movie the
 * install does not ship is left out rather than left to fail on screen — the
 * player's own folder decides which release they have.
 *
 * @param {Set<string>|string[]|null} [available] the uppercase names this install carries
 * @returns {string[]}
 */
export function endingMoviesFor(available = null) {
  const has = !available
    ? () => true
    : (typeof available.has === 'function'
      ? (name) => available.has(name)
      : (name) => available.includes(name));
  const fall = ENDING_FALL_CHOICES.find((name) => has(name)) ?? ENDING_FALL_CHOICES[0];
  const emperor = EMPEROR_MOVIE_CHOICES.find((name) => has(name)) ?? EMPEROR_MOVIE_CHOICES[0];
  return [fall, emperor, ...ENDING_TAIL].filter((name) => has(name));
}

/**
 * The gallery: every movie, in the catalogue's own order, with its title and note.
 * @returns {{file: string, beat: string, what: string, title: string, note: string}[]}
 */
export function galleryEntries() {
  return CUTSCENES.map((movie) => ({
    ...movie,
    title: CINEMATIC_INFO[movie.file]?.title ?? movie.file,
    note: CINEMATIC_INFO[movie.file]?.note ?? movie.what,
  }));
}

/**
 * A movie's readable title, or its file name when the catalogue has no entry.
 * @param {string} file
 * @returns {string}
 */
export function cinematicTitle(file) {
  return CINEMATIC_INFO[String(file ?? '').toUpperCase()]?.title ?? String(file ?? '');
}
