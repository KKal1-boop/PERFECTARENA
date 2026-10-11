// ARENA'S CITY TABLES.
//
// A city in Arena is not a level in a `.MIF` file. It is **assembled**: a
// `CITY1.MIF`-style *skeleton* supplies the ground, the perimeter wall, the gates
// and the water, and then a `blocksPerSide × blocksPerSide` grid of 20×20-cell
// *block* `.MIF`s is stamped into the middle of it. A city-state grid is 6×6, a
// town 5×5 and a village 4×4, so a city is 120×120 cells inside a 127×127
// skeleton. Which block goes in which slot is chosen from a seeded RNG.
//
// This file is the *tables* half of that, kept deliberately separate from the
// assembly in `../cityPlan.js` so every number here can be checked on its own.
//
// `SOURCE` records where each group came from, because two of them are guesses:
//
//   * VERIFIED-BY-ARCHIVE — the block codes, their variation counts and the
//     template filenames. OpenTESArena reads these from `A.EXE`, which this data
//     set does not have (docs/DECISIONS.md D5/D11); the archive cross-check in
//     `tests/unit/city.test.mjs` shows every name the tables can produce exists
//     in `GLOBAL.BSA`, which is stronger evidence than the transcription.
//   * RECONSTRUCTED — the block grid's start position and the reserved-block
//     lists. Both are `A.EXE` arrays. The start position is derived from the
//     skeleton's own wall ring (see `blockStartPosition`) and the reserved list
//     is *measured* from the skeleton in `cityPlan.js` rather than guessed, so
//     neither invents data the game does not contain — but neither is the
//     original's table either.

/** Where each group of numbers came from. Printed by `tools/mif-dump.mjs --city`. */
export const SOURCE = Object.freeze({
  blockCodes: 'OpenTESArena MIFUtils (A.EXE table), cross-checked against GLOBAL.BSA record names',
  templates: 'OpenTESArena MIFUtils template filenames (A.EXE table), cross-checked against GLOBAL.BSA',
  infNames: 'OpenTESArena ArenaCityUtils::generateInfName / ArenaWildUtils::generateInfName',
  gridStart: 'RECONSTRUCTED: the block grid is centred inside the skeleton\'s wall ring',
  reserved: 'RECONSTRUCTED: a slot is reserved when its skeleton cells already hold structure',
});

/**
 * City block types, in the original's order.
 *
 * The order is load-bearing twice: `Empty` and `Reserved` are the two states the
 * plan starts in, and the block-name lookup is indexed by
 * `type - Equipment` (`MIFUtils::makeCityBlockMifName`), so inserting a type in
 * the middle would silently rename every block in the game.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const BLOCK_TYPE = Object.freeze({
  EMPTY: 0, RESERVED: 1, EQUIPMENT: 2, MAGES_GUILD: 3,
  NOBLE_HOUSE: 4, TEMPLE: 5, TAVERN: 6, SPACER: 7, HOUSES: 8,
});

/** Block code per type, indexed by `type - BLOCK_TYPE.EQUIPMENT`. */
export const CITY_BLOCK_CODES = Object.freeze(['EQ', 'MG', 'NB', 'TP', 'TV', 'TS', 'BS']);

/**
 * How many numbered variations each code has.
 *
 * Checked against the archive: `GLOBAL.BSA` holds `EQBD1..13`, `MGBD1..11`,
 * `NBBD1..12`, `TPBD1..12`, `TVBD1..15`, `TSBD1..11` and `BSBD1..20`, each with
 * rotations `A`–`D`.
 */
export const CITY_BLOCK_VARIATIONS = Object.freeze([13, 11, 10, 12, 15, 11, 20]);

/** Door-facing suffixes. Every block ships all four. */
export const CITY_BLOCK_ROTATIONS = Object.freeze(['A', 'B', 'C', 'D']);

/** Cells along one side of a city block, in every `.MIF` the archive holds. */
export const CITY_BLOCK_SIZE = 20;

/**
 * Blocks per side of the grid, by settlement kind (`ArenaCityType`).
 * @type {Readonly<Record<'city'|'town'|'village', number>>}
 */
export const CITY_BLOCKS_PER_SIDE = Object.freeze({ city: 6, town: 5, village: 4 });

/**
 * Skeleton `.MIF` templates. `%d` is `1 + (globalCityID % count)`, and the count
 * is smaller for coastal settlements, which use the `W` ("water") variants.
 *
 * Checked against the archive: `CITY1..5`/`CITYW1..3`, `TOWN1..5`/`TOWNW1..2`,
 * `VILLAGE1..5`/`VILLAGW1..2`.
 *
 * @type {Readonly<Record<'city'|'town'|'village', {inland: string, coastal: string, inlandCount: number, coastalCount: number}>>}
 */
export const CITY_TEMPLATES = Object.freeze({
  city: { inland: 'CITY%d.MIF', coastal: 'CITYW%d.MIF', inlandCount: 5, coastalCount: 3 },
  town: { inland: 'TOWN%d.MIF', coastal: 'TOWNW%d.MIF', inlandCount: 5, coastalCount: 2 },
  village: { inland: 'VILLAGE%d.MIF', coastal: 'VILLAGW%d.MIF', inlandCount: 5, coastalCount: 2 },
});

/**
 * Letters in a city/wilderness `.INF` name: `<climate><location><weather>.INF`.
 * The whole reason a city `.MIF` can be drawn at all, because a skeleton has no
 * `INFO` chunk to name its own INF — the INF is chosen from the *location*.
 *
 * The eleven city INFs (`DCN DCR DCW`, `MCN MCR MCS MCW`, `TCN TCR TCS TCW`) and
 * the eight wilderness ones (`DWN DWR`, `MWN MWR MWS`, `TWN TWR TWS`) are all
 * present in `GLOBAL.BSA`, which is what fixes the letter set.
 */
export const CLIMATE_LETTER = Object.freeze({ temperate: 'T', desert: 'D', mountain: 'M' });
export const LOCATION_LETTER = Object.freeze({ city: 'C', wilderness: 'W' });
export const WEATHER_LETTER = Object.freeze({ clear: 'N', overcast: 'R', rain: 'W', snow: 'S' });

/**
 * The `.INF` a settlement or wilderness level uses.
 *
 * Two wrinkles from the original, both kept: wilderness collapses overcast and
 * rain onto one letter (it has no wet template), and a desert has no snow, so
 * snow falls back to clear rather than producing a name that does not exist.
 *
 * @param {{climate?: 'temperate'|'desert'|'mountain', location?: 'city'|'wilderness', weather?: 'clear'|'overcast'|'rain'|'snow'}} [opts]
 * @returns {string} e.g. `TCN.INF`
 */
export function cityInfName(opts = {}) {
  const { climate = 'temperate', location = 'city', weather = 'clear' } = opts;
  const climateLetter = CLIMATE_LETTER[climate];
  const locationLetter = LOCATION_LETTER[location];
  if (!climateLetter) throw new Error(`unknown climate "${climate}"`);
  if (!locationLetter) throw new Error(`unknown location "${location}"`);
  if (location === 'wilderness' && weather === 'rain') return `${climateLetter}WR.INF`;
  if (weather === 'snow' && climate === 'desert') return `${climateLetter}${locationLetter}N.INF`;
  const weatherLetter = WEATHER_LETTER[weather];
  if (!weatherLetter) throw new Error(`unknown weather "${weather}"`);
  return `${climateLetter}${locationLetter}${weatherLetter}.INF`;
}

/**
 * The skeleton `.MIF` a settlement of this kind uses.
 *
 * `variant` is the 1-based number the game derives from the location's id
 * (`cityDataSeeds.cityTemplateVariant`); passing it is how a *named* location gets
 * its own skeleton. Left out, the variant is derived from `globalCityID`, which is
 * what the URL-driven `?city` path uses.
 *
 * @param {{type?: 'city'|'town'|'village', coastal?: boolean, globalCityID?: number, variant?: number}} opts
 * @returns {string}
 */
export function cityTemplateName(opts = {}) {
  const { type = 'city', coastal = false, globalCityID = 0, variant = null } = opts;
  const template = CITY_TEMPLATES[type];
  if (!template) throw new Error(`unknown settlement type "${type}"`);
  const pattern = coastal ? template.coastal : template.inland;
  const count = coastal ? template.coastalCount : template.inlandCount;
  const number = variant ?? (1 + (Math.abs(globalCityID) % count));
  return pattern.replace('%d', String(Math.max(1, Math.min(count, number))));
}

/**
 * Where the block grid starts inside the skeleton (original voxel coordinates).
 *
 * **RECONSTRUCTED**, see `SOURCE.gridStart`. The original reads this from an
 * `A.EXE` array keyed by template; what is used here is the one rule that fits
 * every shipped skeleton: a `CITY1.MIF` is 127×127 with its wall ring on rows
 * 2…125, so the 120×120 grid of city blocks is centred in the space the walls
 * leave. `tests/unit/city.test.mjs` asserts the consequence that actually
 * matters — a stamped grid never lands on the skeleton's wall ring.
 *
 * @param {number} width  skeleton width in cells
 * @param {number} depth  skeleton depth in cells
 * @param {number} blocksPerSide
 * @returns {{x: number, z: number}}
 */
export function blockStartPosition(width, depth, blocksPerSide) {
  const span = blocksPerSide * CITY_BLOCK_SIZE;
  return {
    x: Math.max(0, Math.floor((width - span) / 2)),
    z: Math.max(0, Math.floor((depth - span) / 2)),
  };
}

/**
 * `MIFUtils::generateRandomBlockType` — the distribution `A.EXE` encodes as four
 * thresholds: houses 45%, tavern 20%, equipment 15%, temple 10%, noble 10%.
 *
 * @param {{next: () => number}} random
 * @returns {number} a `BLOCK_TYPE`
 */
export function randomBlockType(random) {
  const roll = random.next();
  if (roll <= 0x7333) return BLOCK_TYPE.HOUSES;
  if (roll <= 0xA666) return BLOCK_TYPE.TAVERN;
  if (roll <= 0xCCCC) return BLOCK_TYPE.EQUIPMENT;
  if (roll <= 0xE666) return BLOCK_TYPE.TEMPLE;
  return BLOCK_TYPE.NOBLE_HOUSE;
}

/**
 * `MIFUtils::makeCityBlockMifName` — `EQBD7C.MIF` and friends.
 *
 * The draw order is part of the format: **rotation first, then variation**, and
 * variation 0 is promoted to 1 (the original writes `std::max(…, 1)` because
 * there is no `#BD0` file). Both are observable in the data — no block `.MIF` in
 * the archive is numbered 0 — so getting the order wrong would desynchronise the
 * RNG for every following slot, not just this one.
 *
 * @param {number} blockType a `BLOCK_TYPE`
 * @param {{next: () => number}} random
 * @returns {string}
 */
export function blockMifName(blockType, random) {
  const index = blockType - BLOCK_TYPE.EQUIPMENT;
  const code = CITY_BLOCK_CODES[index];
  if (!code) throw new Error(`block type ${blockType} has no code`);
  const rotation = CITY_BLOCK_ROTATIONS[random.next() % CITY_BLOCK_ROTATIONS.length];
  const variationCount = CITY_BLOCK_VARIATIONS[index];
  const variation = Math.max(random.next() % variationCount, 1);
  return `${code}BD${variation}${rotation}.MIF`;
}

/** Every block `.MIF` name the tables can produce, for the archive cross-check. */
export function allBlockMifNames() {
  const names = [];
  for (let i = 0; i < CITY_BLOCK_CODES.length; i++) {
    for (let v = 1; v <= CITY_BLOCK_VARIATIONS[i]; v++) {
      for (const r of CITY_BLOCK_ROTATIONS) names.push(`${CITY_BLOCK_CODES[i]}BD${v}${r}.MIF`);
    }
  }
  return names;
}
