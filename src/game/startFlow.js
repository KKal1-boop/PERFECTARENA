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
//   * `resumeParams(params, location)` — where **Continue** on the start menu lands: the save's
//     own last place (a named city, a dungeon with its seed, or a named interior such as
//     `START.MIF`), or the world map for a character who has stood nowhere yet.
//
// The opening is no longer gated: a new game always plays `INTRO.FLC` (the king's murder) and
// the cell always owes Ria's explanation (`game/storyScript.js`'s `dueCellDream`), so a reload
// or a skipped title card cannot swallow either.

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
 * Where **Continue** resumes: the last place the character stood.
 *
 * The save keeps a name, whether it was a dungeon, and its seed (`loadLastLocation`); a
 * character who has never stood anywhere falls back to the world map, which is this port's
 * home scene. Every scene key from the menu's own URL is dropped first, so a `map` or a stale
 * `interior` cannot override the destination the save names.
 *
 * @param {URLSearchParams} params
 * @param {{name?: string, dungeon?: boolean, seed?: number|null}|null} location
 * @returns {URLSearchParams}
 */
export function resumeParams(params, location = null) {
  const out = new URLSearchParams(params);
  for (const key of ['chargen', 'nomake', 'seed', 'class', 'back', 'menu', 'map', 'worldmap',
    'location', 'dungeon', 'dungeonSeed', 'interior', 'city', 'wild', 'at', 'level', 'enter']) {
    out.delete(key);
  }
  if (location?.name) {
    if (/\.mif$/i.test(location.name)) {
      // A named interior (the Imperial Dungeons' `START.MIF`, the palace) is not a world-map
      // location and not a dungeon record: it is the file itself.
      out.set('interior', location.name);
    } else if (location.dungeon) {
      out.set('dungeon', location.name);
      if (Number.isFinite(Number(location.seed))) out.set('dungeonSeed', String(location.seed));
    } else {
      out.set('location', location.name);
    }
  } else {
    out.set('map', '');
  }
  return out;
}


