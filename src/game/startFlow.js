// HOW A GAME BEGINS — the original's own order, in one place.
//
// Arena's first ten minutes are fixed, and the owner played both games side by side to say
// so (2026-10-16): *"in the real arena after character creation a cutscene missing in
// perfectarena you start in the imperial dungeon"*. The flow is
//
//     character creation  →  the opening movie (`INTRO.FLC`)  →  a cell in the
//     Imperial Dungeons (`START.MIF`), locked, with the way out far away
//
// and only after the escape does Tamriel open up. This port played the movie (main.js's
// `showOpening`) but then dropped the new character **on the world map**, which is a
// teleport to the middle of the story rather than its first step: the quest chain's own
// stage 0 is "escape the Imperial Dungeons" (`game/questData.js`), so a character who never
// stood in that cell began the game one stage ahead of themselves.
//
// The law lives here, apart from `main.js`, so it can be read and tested without booting a
// renderer: `main.js` boots scenes, it does not decide where the story starts.
//
// Three questions, three functions:
//
//   * `isGameStart(params)` — is this person **starting a game**, or did the URL name a
//     scene of its own? A deep link (`?interior=START.MIF`, `?map`, `?cutscene=…`) is a
//     request to stand somewhere, and a 1994 movie in front of it would break the request
//     rather than honour the game. `?nointro` is the player's own escape hatch.
//   * `destinationParams(params, {fresh})` — where creation hands the player on. A character
//     made *just now* wakes in the Imperial Dungeons; a character who already existed is
//     carried to the world map, because a reload is not a new game.
//   * `openingGate({fresh, seen})` — the opening is owed **once per new game**, not once per
//     tab. The session flag alone was the reported missing cutscene: a player who reloaded
//     the page while creating a character had the movie suppressed for the rest of the tab.

/** The opening dungeon's `.MIF`: the cell the Emperor's prisoner wakes in. */
export const START_INTERIOR = 'START.MIF';

/**
 * Every URL parameter that names a scene of its own.
 *
 * A page that asks for one of these is not "starting a game", whatever else is on the URL,
 * and it is the list `main.js`'s dev door and every browser suite drive the game through.
 */
export const SCENE_KEYS = Object.freeze([
  'map', 'worldmap', 'location', 'dungeon', 'dungeonSeed', 'interior', 'mif',
  'city', 'wild', 'at', 'enter', 'level', 'cutscene', 'movie',
]);

/**
 * Does this URL name a scene of its own — i.e. is this a deep link rather than a new game?
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
export function asksForScene(params) {
  return SCENE_KEYS.some((key) => params.has(key));
}

/**
 * Is this person **starting the game**? True when the URL names no scene, creation was not
 * asked for by name, and the player has not switched the opening off (`?nointro`).
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
export function isGameStart(params) {
  return !asksForScene(params) && !params.has('chargen') && !params.has('nomake') && !params.has('nointro');
}

/**
 * Where the player goes once creation is over.
 *
 * Creation is not a destination, so its own parameters are dropped — `chargen`, `nomake`,
 * the creation `seed`, a forced `class` — and the rest of the URL's intent (`location`,
 * `dungeon`, `city`, `interior`, `test`) is carried through. When the URL asked for nothing
 * in particular:
 *
 *   * **a character made just now wakes in the Imperial Dungeons** (`fresh`), which is where
 *     Arena puts them and where the quest's own first stage is;
 *   * **anyone else is carried to the world map**, the map being this port's home scene —
 *     a reload, a returning save and every suite that walks out of creation without making
 *     anybody land where they always did.
 *
 * @param {URLSearchParams} params
 * @param {{fresh?: boolean}} [opts] `fresh` = a character was created by this boot
 * @returns {URLSearchParams}
 */
export function destinationParams(params, { fresh = false } = {}) {
  const out = new URLSearchParams(params);
  for (const key of ['chargen', 'nomake', 'seed', 'class', 'back']) out.delete(key);
  if (['map', 'worldmap', 'location', 'dungeon', 'interior', 'city'].some((key) => out.has(key))) return out;
  if (fresh) out.set('interior', START_INTERIOR);
  else out.set('map', '');
  return out;
}

/**
 * Is the opening movie owed on this boot?
 *
 * The original greets **every new game** with it. This port's first law was once per *tab*
 * (`sessionStorage`), and the owner's report is what that costs: a page reload between
 * creation and the dungeon suppressed the movie for the rest of the session, which reads as
 * a missing cutscene. So the flag is a fallback, not the rule — a character created by this
 * boot is greeted whether or not the tab has seen the movie before.
 *
 * @param {{fresh?: boolean, seen?: boolean}} state
 * @returns {{show: boolean, why: string}}
 */
export function openingGate({ fresh = false, seen = false } = {}) {
  if (fresh) return { show: true, why: 'a new character is starting the game' };
  if (seen) return { show: false, why: 'this session has already seen the opening' };
  return { show: true, why: 'a game is starting' };
}
