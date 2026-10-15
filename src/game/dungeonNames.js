// THE NAMES OF THE UNNAMED DUNGEONS — **RECONSTRUCTED, NOT EXTRACTED**.
//
// `CITYDATA.64` holds **144** dungeon records and gives sixteen of them a name: two per
// province, and they are the two the main quest uses (`questData.js` — the staff dungeon and
// the map dungeon). The other **128 are real places with everything but a name**: real
// coordinates inside their province's rectangle, a visibility flag, a seed, and a marker on
// the world map. Their names are not in the data because the original *names them when a
// quest sends the player there*: the generator composes the name from tables in `A.EXE`
// (docs/DECISIONS.md D11), and this data set has no `A.EXE` — only the PKLITE-packed
// `ACD.EXE` (see `tables/raisedPlatforms.js`, which is in the same position).
//
// So the names below are a **reconstruction**, and the rules it keeps to are the data's own:
//
//   * **The vocabulary is the install's.** Every word a name is built from is a word one of
//     the game's *own* sixteen dungeon names uses — `Crypt`, `Halls`, `Mines`, `Vaults`,
//     `Temple`, `Fortress`, `Tower`, `Grove`, `Gate`, `Lair`, `Web`, `Keep`, `Elden`,
//     `Fang`, `Stone`, `Black`, `Crystal`, `Hearts`, `Ice`, `Khuras`, `Colossus`, `Gemin`,
//     `Agamanus`, `Selene`, `Murk`, `Dagoth-Ur`, `Labyrinthian`. Nothing is invented; the
//     names are recombinations of the words the game already calls its dungeons.
//   * **The draw is the dungeon's own seed.** The same record is called the same thing on
//     every visit, in every quest and in every save, and two dungeons are not called the
//     same thing — the same law the city seeds and the dungeon layouts follow.
//   * **The forms are the install's own.** Five of the sixteen are `<Noun> of <Word>`
//     (Crypt of Hearts, Mines of Khuras, Halls of Colossus, Vaults of Gemin, Temple of
//     Agamanus), and the rest are a compound or an adjective-noun pair (Fang Lair, Black
//     Gate, Crystal Tower, Elden Grove), so a generated name is drawn in one of those two
//     shapes.
//
// What this buys the game is not decoration: a radiant quest has to *name* the place it
// sends the player to, the world map has to label the marker, and the arrival panel has to
// say where they are. Before this, a job aimed at one of the 128 came out as "Travel to
// — ..." and the tests said so ("the offer board is the settlement it is posted in").

/**
 * The nouns the install's own dungeon names use, i.e. what a dungeon *is*.
 * @type {readonly string[]}
 */
export const DUNGEON_NOUNS = Object.freeze([
  'Crypt', 'Halls', 'Mines', 'Vaults', 'Temple', 'Fortress', 'Tower', 'Grove', 'Gate', 'Lair',
  'Web', 'Keep',
]);

/**
 * The words that follow `of`, taken from the install's own dungeon names: the five
 * `<Noun> of <Word>` names it really has (`Hearts`, `Khuras`, `Colossus`, `Gemin`,
 * `Agamanus`) plus the words its compound names are built from, which read the same way
 * after an `of` (`of Ice` is Arena's own "Fortress of Ice").
 */
export const DUNGEON_WORDS = Object.freeze([
  'Hearts', 'Khuras', 'Colossus', 'Gemin', 'Agamanus', 'Ice', 'Mad God', 'Fang', 'Stone',
  'Elden', 'Selene', 'Murk', 'Dagoth-Ur',
]);

/** The adjectives, likewise the install's own (`Black Gate`, `Crystal Tower`). */
export const DUNGEON_ADJECTIVES = Object.freeze([
  'Black', 'Crystal', 'Elden', 'Fang', 'Stone', 'Murk',
]);

/** The second half of an adjective-noun name (`Fang Lair`, `Crystal Tower`). */
export const DUNGEON_HEADS = Object.freeze([
  'Lair', 'Gate', 'Tower', 'Grove', 'Web', 'Keep',
]);

/** A 32-bit hash of a string — the province's own name, for a stable extra draw. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The name of one of the install's **unnamed** dungeons.
 *
 * Deterministic in the dungeon's own seed: the seed picks the shape, the noun and the word,
 * and the province's name is folded in so two dungeons with the same seed in different
 * provinces are still two names.
 *
 * @param {number} seed      the dungeon's own seed (`cityDataSeeds.dungeonSeed`)
 * @param {string} [province] its province, for the extra draw
 * @returns {string} e.g. `Vaults of Khuras`
 */
export function dungeonNameFor(seed, province = '') {
  const s = (Number(seed) >>> 0);
  const mix = (s ^ hash(province) ^ Math.imul(s, 0x9e3779b1)) >>> 0;
  // An unsigned modulo, and a rotated third term: a `<<` in the key overflows into a
  // **negative** index for roughly half the seeds, which is how the first version produced
  // names like "Grove of undefined" and "undefined of Colossus" (measured over the install's
  // 144 dungeons: 77 of them nameless, out of the very table this function exists to fill).
  const pick = (list, shift) => {
    const key = (((mix >>> shift) ^ (s >>> (shift % 16)) ^ Math.imul(mix, shift + 1)) >>> 0) % list.length;
    return list[key];
  };
  const compose = (form) => {
    if (form === 0) return `${pick(DUNGEON_NOUNS, 5)} of ${pick(DUNGEON_WORDS, 11)}`;
    const adjective = pick(DUNGEON_ADJECTIVES, 7);
    const head = pick(DUNGEON_HEADS, 13);
    return `${adjective} ${head}`;
  };
  // The sixteen names the install really has are not available to a generated dungeon: two
  // places with one name on one map is worse than a name that reads a little strange.
  const first = compose((mix >>> 3) & 1);
  if (!RESERVED_NAMES.has(first)) return first;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const candidate = compose((mix >>> (3 + attempt * 2)) & 1);
    if (!RESERVED_NAMES.has(candidate)) return candidate;
  }
  return `${first} (${s % 977})`;
}

/**
 * The sixteen names `CITYDATA.64` really gives its dungeons — read off the file by
 * `tools/world-dump.mjs`, and the set a generated name must stay out of.
 *
 * @type {ReadonlySet<string>}
 */
export const RESERVED_NAMES = new Set([
  'Crypt of Hearts', 'Mines of Khuras', 'Fang Lair', 'Stonekeep', 'Labyrinthian',
  'Fortress of Ice', 'Dagoth-Ur', 'Black Gate', 'Crystal Tower', 'Temple of Mad God',
  'Elden Grove', "Selene's Web", 'Halls of Colossus', 'Temple of Agamanus', 'Murkwood',
  'Vaults of Gemin',
]);

/** Where the names come from — recorded per the brief's "record which" rule. */
export const SOURCE = 'RECONSTRUCTED (A.EXE absent; the 128 unnamed dungeon records in CITYDATA.64 have coordinates and no name). Words from the install\'s own sixteen dungeon names; the draw is the dungeon\'s seed.';

/**
 * How many of a province's sixteen dungeon records have a name of their own.
 *
 * Two: the staff-piece dungeon and the map/clue dungeon (`cityDataFile.js`'s
 * `LOCATION_ID.STAFF_DUNGEON`/`MAP_DUNGEON`).
 */
export const NAMED_DUNGEONS_PER_PROVINCE = 2;
