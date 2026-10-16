// THE COUNTRY'S OWN CREATURES AND TRAVELLERS — the table that fills Arena's wilderness.
//
// The defect this module exists for, from the 2026-10-15 audit and the owner's own report:
//
//   * **D-02a — "missing enemies", the country is empty.** `TWN.INF`, `DWN.INF` and `MWN.INF`
//     place three item flats (`itemIndexes [15, 2, 14]`) and **no creature at all**, none of
//     them in the monster range, so `dungeonItems.monsterRosterFromInf` hands back `[]`,
//     `encounters.monsterCountFor` answers 0, and every wilderness window in the game is a
//     walk through empty country.
//   * **D-01b — "NPCs that can't move", outside cities.** `scenes/interior.js`'s `populate()`
//     sets `inhabited = inCity || entryCell` and its final `else { townsfolk = []; }` empties
//     the list for every wilderness window, so no traveller exists to walk, sit or be spoken
//     to.
//
// **Where Arena's own table is, and why this one is not it.** The original kept its
// wilderness encounters — which creature, in which climate, at which hour, and how many
// travellers on the road — in `A.EXE`. That executable is **not in this data set** (verified
// against the install: 153 loose files beside `GLOBAL.BSA`, and the only executables are
// `ACD.EXE`, `INSTALL.EXE` and `ULTRAMID.EXE`; see `docs/DECISIONS.md` D11 and
// `docs/PORT_BLOCKS.md` §1 rule 2). So everything below is **this project's own rule**, and it
// is stamped as such rather than dressed as the game's:
//
//   * **the kinds** are Arena's — every id in `WILDERNESS_BESTIARY` is a real monster from
//     `game/monsters.js`, with that module's own UESP stats and the install's own `.CFA` art;
//   * **the ordering** of each list is weakest-first by that monster's own level, so the
//     existing prefix law (`encounters.rosterWindow`, D-15) still decides how much of it a
//     given danger can field — a road near the first stage is not the road at the eighth;
//   * **which climate holds which creatures, and what changes after dark,** is this project's
//     reading of the landscape, and each line of it is written down below.
//
// The climate vocabulary is not re-invented here either: `WILDERNESS_CLIMATES` is read off
// `tables/cityBlocks.js`'s own `CLIMATE_LETTER` (`T`emperate, `D`esert, `M`ountain), which is
// the letter set the eight wilderness INFs the archive actually ships
// (`DWN DWR`, `MWN MWR MWS`, `TWN TWR TWS`) fix. For the same reason this module does **not**
// export an `.INF` helper: `wilderness.js`'s `wildernessInfName` and `cityBlocks.js`'s
// `cityInfName({ location: 'wilderness' })` already answer that question.

import { CLIMATE_LETTER } from './tables/cityBlocks.js';
import { ArenaRandom } from './arenaRandom.js';
// **The install is the arbiter of what may stand on a road.** `monsters.js` carries Arena's
// own statistics for every creature, and a `sprite` field only where this install ships the
// `.CFA` art for it — a minotaur has statistics and no art. A country that fields a creature
// nobody can draw would spawn nothing where it promised something, so the lists below are
// filtered through the same test the browser suites use (`MONSTERS.some(m => m.id === id &&
// m.sprite)`) before anybody is handed one.
import { MONSTERS } from './monsters.js';

/**
 * The three climates a wilderness exists in, in the install's own letter order.
 *
 * Derived rather than typed out, so a fourth climate added to the data cannot leave this
 * table silently answering for three.
 * @type {readonly string[]}
 */
export const WILDERNESS_CLIMATES = Object.freeze(Object.keys(CLIMATE_LETTER));

/**
 * The hours of a wilderness **day**, as this project reads them.
 *
 * Arena's own day/night boundary is the sky's (`game/daylight.js` runs the light from the
 * twin's arc: dawn around 05:00, dark by 20:00), and a road at night is a different place:
 * fewer travellers, and the worse half of the bestiary. `05:00…19:59` is day.
 */
export const WILD_DAY = Object.freeze({ opens: 5, closes: 20 });

/**
 * Is this hour night in the country?
 * @param {number} hour 0…23 (anything else wraps into the day)
 * @returns {boolean}
 */
export function isWildNight(hour) {
  const h = ((Math.trunc(Number(hour) || 0) % 24) + 24) % 24;
  return !(h >= WILD_DAY.opens && h < WILD_DAY.closes);
}

/**
 * The country's own bestiary, per climate and per half of the day.
 *
 * Every list is **weakest-first by the monster's own level** (`game/monsters.js`'s `level`),
 * so `wildernessRoster` can hand it to `encounters.rosterWindow` unchanged and the prefix law
 * holds: the danger of the place decides how deep into the list a given window reaches.
 *
 * The reading behind each list, stated because it is this project's and not the game's:
 *
 *   * **temperate** — the road country: rats and goblins in the hedgerows, wolves and lizards
 *     on it, orcs and skeletons where somebody died, spiders and ghouls further in, and after
 *     dark the grave-things (hell hound, ghost, troll, zombie, wraith, homonculus).
 *   * **mountain** — the same country, cold: the **snow wolf** joined by its ordinary cousin,
 *     an **ice golem** after dark where the peaks are, no ghouls (nothing buries well in rock
 *     that hard), and the troll and wraith still out.
 *   * **desert** — a dry country: lizards, spiders, no wolves at all, ghouls in the ruins, and
 *     after dark the hell hound, the wandering dead and — far from any town — a Medusa, which
 *     is the one deep entry this table gives a wilderness.
 *
 * **The weakest end of each list is climate-specific, and that is a correction rather than a
 * flourish** (2026-10-16). All three lists used to begin `rat`, `goblin` — the only two
 * level-1 creatures this install draws — so the entrance window of every road (a third of the
 * list at the first stage's danger) was the same two creatures in every climate, and the
 * audit's own climate probe read **`{rat: 4}` on all three**. A desert track that fields the
 * hedgerow's rats is not a different biome; so the temperate road keeps the rodents, the
 * mountains begin with the wolves they are named for, and the desert begins with its lizards.
 * Levels still rise along each list, because that ordering is what the window law reads.
 *
 * The **Minotaur is in none of them**: `monsters.js` carries its UESP statistics and a null
 * `sprite`, because this install ships no `MINO*.CFA` — a creature nothing can draw is not a
 * creature the country may promise, and `wildernessRoster` filters by the same test.
 *
 * The **undead come out at night** in all three, which is the one rule the original's own
 * wilderness fiction makes plain and the one the owner asked for by name ("biomes … depending
 * on if its night").
 *
 * @type {Readonly<Record<string, {day: readonly string[], night: readonly string[]}>>}
 */
export const WILDERNESS_BESTIARY = Object.freeze({
  temperate: Object.freeze({
    day: Object.freeze(['rat', 'goblin', 'wolf', 'lizardman', 'orc', 'skeleton', 'spider', 'ghoul']),
    night: Object.freeze(['rat', 'goblin', 'wolf', 'lizardman', 'orc', 'skeleton', 'spider', 'ghoul',
      'hellhound', 'ghost', 'troll', 'zombie', 'wraith', 'homonculus']),
  }),
  mountain: Object.freeze({
    day: Object.freeze(['wolf', 'snowwolf', 'orc', 'skeleton', 'spider']),
    night: Object.freeze(['wolf', 'snowwolf', 'orc', 'skeleton', 'spider',
      'hellhound', 'ghost', 'troll', 'wraith', 'icegolem']),
  }),
  desert: Object.freeze({
    day: Object.freeze(['lizardman', 'skeleton', 'spider', 'ghoul']),
    night: Object.freeze(['lizardman', 'skeleton', 'spider', 'ghoul',
      'hellhound', 'zombie', 'wraith', 'homonculus', 'medusa']),
  }),
});

/** The bestiary row for a climate, falling back to the temperate road the way the data does. */
export function wildernessBestiaryFor(climate) {
  return WILDERNESS_BESTIARY[String(climate ?? '').toLowerCase()] ?? WILDERNESS_BESTIARY.temperate;
}

/**
 * What lives on a wilderness window at this hour: **the climate's own list**, weakest first.
 *
 * The window itself is not this function's business, and that is a bug this port paid for
 * (2026-10-16). It used to narrow the list here with `encounters.rosterWindow` — and
 * `spawnEncounter` narrows whatever it is handed *again*, with the `depth` of the level, so a
 * six-kind list came out as a window of a window: **its first entry alone**. The audit's own
 * climate probe caught it — all three climates' daylight roads fielded `{rat: 4}`, "0 distinct
 * day bestiaries across 3 climates" — because every list begins with the same weakest creature.
 *
 * So the division is the one the dungeons already use: a level's own roster goes to
 * `spawnEncounter` whole (a level's `.INF` list, un-windowed), and `rosterWindow` is the *one*
 * place that knows the danger and the depth of the place. Nothing here narrows anything.
 *
 * Never empty: every climate, at every hour, holds at least the weakest creature of its own
 * list — a country with no creature at three in the morning is exactly the defect (D-02a).
 *
 * @param {{climate?: string, hour?: number}} [opts]  `danger` is accepted and ignored, so a
 *   caller that passes it (the population call does) does not have to know this
 * @returns {string[]} monster ids, weakest first
 */
/** The creatures of a list this install can actually draw (a sprite is the `.CFA` art). */
function drawable(ids) {
  return ids.filter((id) => MONSTERS.some((m) => m.id === id && m.sprite));
}

export function wildernessRoster(opts = {}) {
  const bestiary = wildernessBestiaryFor(opts.climate);
  const list = isWildNight(opts.hour ?? 12) ? bestiary.night : bestiary.day;
  return drawable(list);
}

/**
 * The travellers a wilderness window holds, as this project's own rule.
 *
 * A road is not a market square: the number here is small, one to six at most in daylight,
 * and it falls away after dark. Climate counts too — a mountain pass and a desert track carry
 * fewer people than the farm country between two city-states.
 *
 * Deterministic for a seed, like everything else in `game/`: the same road at the same hour of
 * the same day is the same handful of people.
 *
 * @param {{climate?: string, hour?: number, seed?: number}} [opts]
 * @returns {number} 0…6
 */
export function wildernessFolkCount(opts = {}) {
  const climate = String(opts.climate ?? 'temperate').toLowerCase();
  const hour = Math.trunc(Number(opts.hour) || 0);
  const night = isWildNight(hour);
  // The road's own busy-ness, before the draw: the farm country is the busiest, and a desert
  // track the quietest. This is the project's reading (A.EXE is absent, see the header).
  const cap = FOLK_CAP[climate] ?? FOLK_CAP.temperate;
  const rolled = new ArenaRandom(folkSeed(opts.seed, climate, hour)).nextBelow(night ? cap.night + 1 : cap.day + 1);
  // **Daylight on a road is never empty, and night may be.** A traveller meeting nobody at
  // noon is the defect being fixed; meeting nobody at two in the morning is the country.
  return night ? Math.min(WILD_FOLK_MAX, rolled) : Math.min(WILD_FOLK_MAX, Math.max(1, rolled));
}

/** The most people a wilderness window may hold (`wildernessFolkCount`'s ceiling). */
export const WILD_FOLK_MAX = 6;

/** How busy each climate's road is: the daylight ceiling and the night one. */
const FOLK_CAP = Object.freeze({
  temperate: Object.freeze({ day: 6, night: 2 }),
  mountain: Object.freeze({ day: 4, night: 1 }),
  desert: Object.freeze({ day: 3, night: 1 }),
});

/**
 * A 32-bit seed for the folk draw: the place's own seed, the climate and the hour, mixed.
 *
 * `Math.imul` because a plain multiply would lose the low bits as a double and two different
 * hours of one day could collide (`arenaRandom.js`'s own warning about the same trap).
 *
 * @param {number} seed @param {string} climate @param {number} hour
 * @returns {number}
 */
function folkSeed(seed, climate, hour) {
  const base = Math.trunc(Number(seed) || 1) >>> 0;
  const letter = String(CLIMATE_LETTER[climate] ?? 'T').charCodeAt(0);
  return (Math.imul(base, 7919) ^ Math.imul(letter, 104729) ^ Math.imul(hour + 1, 15485863)) >>> 0;
}

/**
 * Which figures a wilderness window draws, as **kind keys of `peopleKinds.js`**.
 *
 * The four families the archive ships for its commoners and its watch are the only people a
 * wilderness can be populated from without inventing art: `MLGEN0<set>` (the town's men, five
 * figures), `FMGEN0<set>` (its women), `GUARD0` (the watch, the one family with the twelve
 * frame attack layout) and `PAT`/`LGLIT0` (the two remaining sets). This table picks **which
 * of those sets** appear in the country, and the choice is this project's:
 *
 *   * **daylight** — the commoners and the two spare sets: people on the road, a carter, a
 *     family walking to the next town. Nothing in armour, because a road in daylight is not
 *     patrolled.
 *   * **night** — the watch, and the later men's and women's sets (a face on a night road is
 *     not the face you saw at noon). A wilderness at night in an armed country is the watch's.
 *
 * A climate shifts **which sets**, so the same five faces are not every road on the map: the
 * cold and dry climates draw from the higher sets, which is a look, not a statistic.
 *
 * @param {{climate?: string, hour?: number}} [opts]
 * @returns {string[]} `peopleKindsFromListing` keys, e.g. `['MLGEN01', …]`
 */
export function wildernessFolkKinds(opts = {}) {
  const climate = String(opts.climate ?? 'temperate').toLowerCase();
  const night = isWildNight(opts.hour ?? 12);
  if (night) return ['GUARD0', 'MLGEN04', 'FMGEN04', 'LGLIT0'];
  const day = ['MLGEN01', 'MLGEN02', 'FMGEN01', 'FMGEN02', 'PAT'];
  if (climate === 'mountain') return ['MLGEN03', 'FMGEN03', 'GUARD0', 'PAT'];
  if (climate === 'desert') return ['MLGEN05', 'FMGEN05', 'MLGEN04', 'FMGEN04', 'PAT'];
  return day;
}

/**
 * What those travellers are **doing**, in `livingWorld.js`'s own trade vocabulary.
 *
 * The names are that module's own role strings (`ROLE_OF`/its day-plan table: `townsperson`,
 * `merchant`, `worker`, `monk`, `watch`), never a new one, so a person the scene builds from
 * these is a person the day system already knows how to move — a carter working the road, a
 * merchant between towns, a monk on pilgrimage, and the watch after dark.
 *
 * **A caller must check the plan exists before assigning a role**: this module names trades,
 * and `livingWorld.js` is the module that owns which of them has a day.
 *
 * @param {{climate?: string, hour?: number}} [opts]
 * @returns {string[]}
 */
export function wildernessFolkTrades(opts = {}) {
  if (isWildNight(opts.hour ?? 12)) return ['watch', 'townsperson'];
  return ['townsperson', 'worker', 'merchant', 'monk'];
}

/**
 * The whole window in one call: how many travellers, which figures, which trades, and which
 * creatures — the four answers `scenes/interior.js`'s `populate()` needs for a wilderness
 * level, from one place (`{ climate, hour, seed, danger }`).
 *
 * @param {{climate?: string, hour?: number, seed?: number, danger?: number}} [opts]
 * @returns {{count: number, kinds: string[], trades: string[], roster: string[]}}
 */
export function wildernessPopulation(opts = {}) {
  const count = wildernessFolkCount(opts);
  const kinds = wildernessFolkKinds(opts);
  const trades = wildernessFolkTrades(opts);
  return { count, kinds, trades, roster: wildernessRoster(opts) };
}
