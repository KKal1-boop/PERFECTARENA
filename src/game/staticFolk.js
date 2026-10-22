// THE STILL PEOPLE — Arena's static NPC art, and the court that stands in a palace.
//
// The owner, 2026-10-17: *"there are a lot of missing sprites for the game that most of the time
// were static npcs in the original game that were not ported to perfectarena like
// AR-sprite-GUARD1D.png AR-sprite-KING.png AR-sprite-MAN01.png … and you still also havent
// introduced the KING and QUEENS SPRITES to use in palaces"*. UESP's category is the extracted
// art; **the install ships the same records**, and this module is the census of them plus the
// rule for who stands where:
//
//   * `KING.IMG`, `QUEEN.IMG`, `PRINCE.IMG`, `PRINCESS.IMG` — the court. One picture each, drawn
//     as a still figure (`scenes/interior.js`'s scenery pass draws an IMG as a billboard), which
//     is what "static NPC" means in the original: a painted person, not a walk cycle.
//   * `MAN01…04`, `WOMAN01…04` — the town's own still folk (a tavern's patrons, a shop's
//     family). Each exists as **both** `.IMG` (one picture) and `.DFA` (an animated flat), and
//     the animated record is preferred where the install ships it: a tavern idler who shifts
//     their weight is the original's own `.DFA`, not an invention.
//   * `GUARD1D/1M`, `GUARD2D/2M`, `GUARD3D/3M` — the watch, standing at their post (the `D`/`M`
//     pair is the day/night or male/female reading of the same art; both are listed, the record
//     that exists is the one drawn).
//
// What this file deliberately does **not** do is invent art: every name below was read out of
// `GLOBAL.BSA` (`tools/assetcoverage.mjs`'s own census), and a name the install does not ship is
// dropped by the page that loads it rather than drawn as a blank.
//
// The *titles* are this project's: Arena's own rulership words live in `A.EXE`, which is not in
// this checkout (`docs/PORT_BLOCKS.md`, law 2). The province table is a reconstruction — a jarl in
// Skyrim, a count in High Rock and Hammerfell, a king in the Imperial Province — stamped here so
// that a mismatch is a one-line change rather than a hidden assumption.

/**
 * The still-people art the install ships, by role.
 *
 * `art` is the record name; `drawn` is what the page should try first. A `.DFA` is the animated
 * original and is preferred where it exists; an `.IMG` is the single picture.
 *
 * @type {Readonly<Record<string, {art: string, label: string, role: string}[]>>}
 */
export const STATIC_FOLK = Object.freeze({
  /** The court: the ruler, their consort and their heir. */
  court: Object.freeze([
    Object.freeze({ art: 'KING.IMG', label: 'the king', role: 'ruler' }),
    Object.freeze({ art: 'QUEEN.IMG', label: 'the queen', role: 'consort' }),
    Object.freeze({ art: 'PRINCE.IMG', label: 'the prince', role: 'heir' }),
    Object.freeze({ art: 'PRINCESS.IMG', label: 'the princess', role: 'heir' }),
  ]),
  /** The town's still folk — the people a tavern holds who never walk anywhere. */
  townsfolk: Object.freeze([
    Object.freeze({ art: 'MAN01.DFA', fallback: 'MAN01.IMG', label: 'a man of the town', role: 'patron' }),
    Object.freeze({ art: 'MAN02.DFA', fallback: 'MAN02.IMG', label: 'a man of the town', role: 'patron' }),
    Object.freeze({ art: 'MAN03.DFA', fallback: 'MAN03.IMG', label: 'a man of the town', role: 'patron' }),
    Object.freeze({ art: 'MAN04.DFA', fallback: 'MAN04.IMG', label: 'a man of the town', role: 'patron' }),
    Object.freeze({ art: 'WOMAN01.DFA', fallback: 'WOMAN01.IMG', label: 'a woman of the town', role: 'patron' }),
    Object.freeze({ art: 'WOMAN02.DFA', fallback: 'WOMAN02.IMG', label: 'a woman of the town', role: 'patron' }),
    Object.freeze({ art: 'WOMAN03.DFA', fallback: 'WOMAN03.IMG', label: 'a woman of the town', role: 'patron' }),
    Object.freeze({ art: 'WOMAN04.DFA', fallback: 'WOMAN04.IMG', label: 'a woman of the town', role: 'patron' }),
  ]),
  /** The watch at its post: six records, and a province draws from the ones it ships. */
  watch: Object.freeze([
    Object.freeze({ art: 'GUARD1D.IMG', label: 'a guard', role: 'watch' }),
    Object.freeze({ art: 'GUARD1M.IMG', label: 'a guard', role: 'watch' }),
    Object.freeze({ art: 'GUARD2D.IMG', label: 'a guard', role: 'watch' }),
    Object.freeze({ art: 'GUARD2M.IMG', label: 'a guard', role: 'watch' }),
    Object.freeze({ art: 'GUARD3D.IMG', label: 'a guard', role: 'watch' }),
    Object.freeze({ art: 'GUARD3M.IMG', label: 'a guard', role: 'watch' }),
  ]),
});

/** Every art name the module knows, in one list — the census a test walks. */
export const STATIC_FOLK_ART = Object.freeze(
  Object.values(STATIC_FOLK).flat().flatMap((entry) => [entry.art, entry.fallback].filter(Boolean)),
);

/**
 * **EVERY STILL PERSON THE SHIPPED `.INF` FILES PLACE** — the whole census, by the art's stem.
 *
 * The four entries in `STATIC_FOLK` above were read off UESP's category; this table is read off
 * the install's own `@FLATS` tables instead, which is what makes it the *complete* list rather
 * than a sample. Measured 2026-10-18 (`.scratch/placedpeople.mjs`: every level of every shipped
 * interior, its own `.INF`'s texture table, the flats the `MAP1`/`FLOR` layers really put down):
 *
 *   `TAVERN1.MIF` level 1  `BARTEND.DFA` ×1, `MUSIC1/2.DFA` ×2, `MAN01/04.DFA` ×6, `WOMAN02/03` ×2
 *   `EQUIP1.MIF` level 0   `SMITH.DFA` ×1          — the armourer and his anvil
 *   `TEMPLE1.MIF` level 0  `PREST1.DFA` ×1         — the priest
 *   `MAGE1.MIF` level 0    `WIZZ1.DFA` ×1          — the guild's wizard
 *   `PALACE1.MIF` level 0  `KING.IMG` ×1, `GUARD1M.IMG` ×14
 *   `IMPPAL1.MIF` level 0  `KNIGHT` ×31            — art this install does not ship (dropped)
 *
 * **They were being read and then thrown away.** A flat with an `*ITEM` number is a thing the map
 * placed (`game/dungeonItems.js`), and the scene kept item flats out of the scenery pass and drew
 * only loot from them — so a tavern's ten drinkers, the armourer, the priest and a palace's whole
 * watch existed in the data and never appeared. The owner: *"the innkeeper the priest the king and
 * the guards in the palaces that i cant find in perfectarena"*.
 *
 * `keeper` marks the trade a building exists for: the one person a visitor walks in to speak to.
 * The labels are read off the art's own word, never invented — `HOKER` is the item table's harlot,
 * `JSTER` its jester, and so on (`game/dungeonItems.js`'s `PERSON_ITEMS`).
 *
 * @type {Readonly<Record<string, {role: string, label: string, keeper: boolean}>>}
 */
export const STILL_ROLES = Object.freeze({
  KING: Object.freeze({ role: 'ruler', label: 'the king', keeper: false }),
  QUEEN: Object.freeze({ role: 'consort', label: 'the queen', keeper: false }),
  PRINCE: Object.freeze({ role: 'heir', label: 'the prince', keeper: false }),
  PRINCESS: Object.freeze({ role: 'heir', label: 'the princess', keeper: false }),
  GUARD: Object.freeze({ role: 'guard', label: 'a guard of the watch', keeper: false }),
  SMITH: Object.freeze({ role: 'smith', label: 'the armourer', keeper: true }),
  BARTEND: Object.freeze({ role: 'bartender', label: 'the innkeeper', keeper: true }),
  PREST: Object.freeze({ role: 'priest', label: 'a priest', keeper: true }),
  WIZZ: Object.freeze({ role: 'wizard', label: 'the guild\u2019s wizard', keeper: true }),
  JSTER: Object.freeze({ role: 'jester', label: 'a jester', keeper: false }),
  MUSIC: Object.freeze({ role: 'musician', label: 'a musician', keeper: false }),
  BEG: Object.freeze({ role: 'beggar', label: 'a beggar', keeper: false }),
  FIREMN: Object.freeze({ role: 'fire-eater', label: 'a fire-eater', keeper: false }),
  HOKER: Object.freeze({ role: 'harlot', label: 'a harlot', keeper: false }),
  MERCH: Object.freeze({ role: 'merchant', label: 'a merchant', keeper: false }),
  SHADY: Object.freeze({ role: 'shady character', label: 'a shady character', keeper: false }),
  SNAKTM: Object.freeze({ role: 'snake charmer', label: 'a snake charmer', keeper: false }),
  VENDER: Object.freeze({ role: 'vendor', label: 'a vendor', keeper: false }),
  KNIGHT: Object.freeze({ role: 'knight', label: 'a knight', keeper: false }),
  MAN: Object.freeze({ role: 'patron', label: 'a man of the town', keeper: false }),
  WOMAN: Object.freeze({ role: 'patron', label: 'a woman of the town', keeper: false }),
  JTHARN: Object.freeze({ role: 'Jagar Tharn', label: 'Jagar Tharn', keeper: false }),
});

/** The record extensions a still person is drawn from. `KNIGHT` is named without one by the map. */
const STILL_PERSON_EXTENSION = /\.(?:IMG|DFA)$/i;

/**
 * The stem of a flat's art — `SMITH.DFA` → `SMITH`, `BEG#1.DFA` → `BEG#1` → `BEG`.
 *
 * The trailing digits are the family's **variant** (`MAN01…04` are four men, not four directions
 * — the same reading `peopleKinds.js` records), and `#` is the archive's own punctuation for the
 * beggar's record (`BEG#1.DFA`), so both are stripped to find the role word.
 *
 * @param {string|null} name
 * @returns {string|null}
 */
export function stillPersonStem(name) {
  const upper = String(name ?? '').toUpperCase();
  if (!upper || !STILL_PERSON_EXTENSION.test(upper)) return null;
  const stem = upper.replace(STILL_PERSON_EXTENSION, '');
  // The variant is the trailing digits and, for the watch, one letter after them
  // (`GUARD1D`, `GUARD2M`); the beggar's record spells it `BEG#1`.
  const family = stem.replace(/#?\d+[A-Z]?$/, '') || stem;
  // `BABE0#`/`LGLIT0#` are not people: `BABE` is the walking woman's own family
  // (`peopleKinds.js`), and `LGLIT` is a rod of light. Neither appears in the table above.
  return family && Object.hasOwn(STILL_ROLES, family) ? family : null;
}

/**
 * Is this art a **still person** the level draws as one figure?
 *
 * Used by `game/flats.js`'s size law and by the scene's interaction list, so one reading of the
 * census serves both: a person is drawn at a person's height and can be spoken to, and nothing
 * else is.
 *
 * @param {string|null} name  e.g. `SMITH.DFA`, `MAN02.IMG`, `KING.IMG`
 * @returns {boolean}
 */
export function isStillPersonArt(name) {
  return stillPersonStem(name) !== null;
}

/**
 * What a still person is: their trade, the words a player reads, and whether their building keeps
 * its door open for them.
 *
 * @param {string|null} name  the flat's own art, e.g. `BARTEND.DFA`
 * @returns {{stem: string, role: string, label: string, keeper: boolean}|null}
 */
export function stillRoleFor(name) {
  const stem = stillPersonStem(name);
  if (!stem) return null;
  return { stem, ...STILL_ROLES[stem] };
}

/**
 * What a province calls its ruler.
 *
 * **RECONSTRUCTED** (see the header): Arena's own words are in `A.EXE`. The shape is the later
 * lore's, province by province, and a province not named here keeps `ruler`.
 *
 * @type {Readonly<Record<string, {ruler: string, consort: string, heir: string}>>}
 */
export const COURT_TITLES = Object.freeze({
  'High Rock': Object.freeze({ ruler: 'the count', consort: 'the countess', heir: 'the heir' }),
  Hammerfell: Object.freeze({ ruler: 'the count', consort: 'the countess', heir: 'the heir' }),
  Skyrim: Object.freeze({ ruler: 'the jarl', consort: 'the jarl\u2019s lady', heir: 'the jarl\u2019s heir' }),
  Morrowind: Object.freeze({ ruler: 'the duke', consort: 'the duchess', heir: 'the heir' }),
  'Imperial Province': Object.freeze({ ruler: 'the king', consort: 'the queen', heir: 'the prince' }),
  Elsweyr: Object.freeze({ ruler: 'the king', consort: 'the queen', heir: 'the prince' }),
  Valenwood: Object.freeze({ ruler: 'the king', consort: 'the queen', heir: 'the prince' }),
  'Black Marsh': Object.freeze({ ruler: 'the king', consort: 'the queen', heir: 'the prince' }),
  Summurset: Object.freeze({ ruler: 'the king', consort: 'the queen', heir: 'the prince' }),
});

/** The fallback title set: a king and a queen, which is what most of Arena's cities have. */
export const DEFAULT_COURT = Object.freeze({ ruler: 'the king', consort: 'the queen', heir: 'the prince' });

/**
 * The titles a place's palace uses.
 *
 * @param {{province?: string}|null} place
 * @returns {{ruler: string, consort: string, heir: string}}
 */
export function courtTitlesFor(place) {
  const province = String(place?.province ?? '');
  return COURT_TITLES[province] ?? DEFAULT_COURT;
}

/**
 * **The court that stands in a palace** — a ruler, their consort and (in a city) the heir.
 *
 * The art is the install's own `KING/QUEEN/PRINCE/PRINCESS` pictures; the labels are the
 * province's own words. A **town's** palace (a `town` is a smaller settlement than a `city`, but
 * still a place with a ruler in Arena's own reading) has no heir standing: two figures, not three.
 *
 * @param {{province?: string, kind?: string}|null} place
 * @returns {{art: string, label: string, role: string}[]}
 */
export function courtOf(place) {
  const titles = courtTitlesFor(place);
  const court = STATIC_FOLK.court;
  const figures = [
    { art: court[0].art, label: titles.ruler, role: 'ruler' },
    { art: court[1].art, label: titles.consort, role: 'consort' },
  ];
  if (place?.kind === 'city') figures.push({ art: court[2].art, label: titles.heir, role: 'heir' });
  return figures;
}

/**
 * Is this interior a palace? `PALACE1…5.MIF`, the loose `PALACE.MIF`, and the Imperial
 * Palace's own four levels (`IMPPAL.MIF`) — the maps the install ships with a throne in them.
 *
 * @param {string} mapName
 * @returns {boolean}
 */
export function isPalaceMap(mapName) {
  return /^(?:IMPPAL|PALACE\d*)\.MIF$/i.test(String(mapName ?? ''));
}

/**
 * The label an interior's ruler has in the palace's own room, for the talk panel.
 *
 * @param {{province?: string, kind?: string}|null} place
 * @returns {string}
 */
export function rulerLabel(place) {
  return courtTitlesFor(place).ruler;
}
